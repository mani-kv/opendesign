import path from "path"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Decimal } from "decimal.js"
import z from "zod"
import { type ProviderMetadata } from "ai"
import { Flag } from "../flag/flag"
import { Identifier } from "../id/id"
import { Installation } from "../installation"

import { Database, NotFoundError, eq, and, gte, isNull, desc, like, inArray, lt } from "../storage/db"
import type { SQL } from "../storage/db"
import { AgentTable } from "./agent.sql"
import { MessageTable } from "./message.sql"
import { PartTable } from "./part.sql"
import { ProductTable } from "../product/product.sql"
import { Storage } from "@/storage/storage"
import { Log } from "../util/log"
import { MessageV2 } from "./message-v2"
import { Instance } from "../project/instance"
import { AgentPrompt } from "./prompt"
import { fn } from "@/util/fn"
import { Command } from "../command"
import { Snapshot } from "@/snapshot"

import type { Provider } from "@/provider/provider"
import { PermissionNext } from "@/permission/next"
import { Global } from "@/global"
import type { LanguageModelV2Usage } from "@ai-sdk/provider"
import { iife } from "@/util/iife"

export namespace AgentSession {
  const log = Log.create({ service: "agent" })

  const titlePrefix = "New agent - "

  function createDefaultTitle() {
    return titlePrefix + new Date().toISOString()
  }

  export function isDefaultTitle(title: string) {
    return new RegExp(
      `^${titlePrefix}\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`,
    ).test(title)
  }

  type AgentRow = typeof AgentTable.$inferSelect

  export function fromRow(row: AgentRow): Info {
    return {
      id: row.id,
      featureID: row.feature_id,
      annotationID: row.annotation_id ?? undefined,
      branch: row.branch ?? undefined,
      status: row.status,
      color: row.color ?? undefined,
      directory: row.directory,
      title: row.title,
      version: row.version,
      permission: (row.permission as PermissionNext.Ruleset) ?? undefined,
      time: {
        created: row.time_created,
        updated: row.time_updated,
      },
    }
  }

  export function toRow(info: Info) {
    return {
      id: info.id,
      feature_id: info.featureID,
      annotation_id: info.annotationID,
      branch: info.branch,
      status: info.status,
      color: info.color,
      directory: info.directory,
      title: info.title,
      version: info.version,
      permission: info.permission,
      time_created: info.time.created,
      time_updated: info.time.updated,
    }
  }

  function getForkedTitle(title: string): string {
    const match = title.match(/^(.+) \(fork #(\d+)\)$/)
    if (match) {
      const base = match[1]
      const num = parseInt(match[2], 10)
      return `${base} (fork #${num + 1})`
    }
    return `${title} (fork #1)`
  }

  export const Info = z
    .object({
      id: Identifier.schema("agent"),
      featureID: z.string(),
      annotationID: z.string().optional(),
      branch: z.string().optional(),
      status: z.string(),
      color: z.string().optional(),
      directory: z.string(),
      title: z.string(),
      version: z.string(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
      }),
      permission: PermissionNext.Ruleset.optional(),
    })
    .meta({
      ref: "AgentSession",
    })
  export type Info = z.output<typeof Info>

  export const ProductInfo = z
    .object({
      id: z.string(),
      name: z.string().optional(),
      directory: z.string(),
    })
    .meta({
      ref: "ProductSummary",
    })
  export type ProductInfo = z.output<typeof ProductInfo>

  export const GlobalInfo = Info.extend({
    product: ProductInfo.nullable(),
  }).meta({
    ref: "GlobalAgentSession",
  })
  export type GlobalInfo = z.output<typeof GlobalInfo>

  export const Event = {
    Created: BusEvent.define(
      "agent.created",
      z.object({
        info: Info,
      }),
    ),
    Updated: BusEvent.define(
      "agent.updated",
      z.object({
        info: Info,
      }),
    ),
    Deleted: BusEvent.define(
      "agent.deleted",
      z.object({
        info: Info,
      }),
    ),
    Diff: BusEvent.define(
      "agent.diff",
      z.object({
        agentID: z.string(),
        diff: Snapshot.FileDiff.array(),
      }),
    ),
    Error: BusEvent.define(
      "agent.error",
      z.object({
        agentID: z.string().optional(),
        error: MessageV2.Assistant.shape.error,
      }),
    ),
  }

  export const create = fn(
    z
      .object({
        featureID: z.string().optional(),
        annotationID: z.string().optional(),
        title: z.string().optional(),
        permission: Info.shape.permission,
        branch: z.string().optional(),
        color: z.string().optional(),
      })
      .optional(),
    async (input) => {
      return createNext({
        featureID: input?.featureID ?? Instance.project.id,
        annotationID: input?.annotationID,
        directory: Instance.directory,
        title: input?.title,
        permission: input?.permission,
        branch: input?.branch,
        color: input?.color,
      })
    },
  )

  export const fork = fn(
    z.object({
      agentID: Identifier.schema("agent"),
      messageID: Identifier.schema("message").optional(),
    }),
    async (input) => {
      const original = await get(input.agentID)
      if (!original) throw new Error("agent not found")
      const title = getForkedTitle(original.title)
      const agent = await createNext({
        featureID: original.featureID,
        directory: Instance.directory,
        title,
      })
      const msgs = await messages({ agentID: input.agentID })
      const idMap = new Map<string, string>()

      for (const msg of msgs) {
        if (input.messageID && msg.info.id >= input.messageID) break
        const newID = Identifier.ascending("message")
        idMap.set(msg.info.id, newID)

        const parentID = msg.info.role === "assistant" && msg.info.parentID ? idMap.get(msg.info.parentID) : undefined
        const cloned = await updateMessage({
          ...msg.info,
          agentID: agent.id,
          id: newID,
          ...(parentID && { parentID }),
        })

        for (const part of msg.parts) {
          await updatePart({
            ...part,
            id: Identifier.ascending("part"),
            messageID: cloned.id,
            agentID: agent.id,
          })
        }
      }
      return agent
    },
  )

  export const touch = fn(Identifier.schema("agent"), async (agentID) => {
    const now = Date.now()
    Database.use((db) => {
      const row = db
        .update(AgentTable)
        .set({ time_updated: now })
        .where(eq(AgentTable.id, agentID))
        .returning()
        .get()
      if (!row) throw new NotFoundError({ message: `Agent not found: ${agentID}` })
      const info = fromRow(row)
      Database.effect(() => Bus.publish(Event.Updated, { info }))
    })
  })

  export async function createNext(input: {
    id?: string
    title?: string
    featureID: string
    annotationID?: string
    branch?: string
    color?: string
    directory: string
    permission?: PermissionNext.Ruleset
  }) {
    const result: Info = {
      id: Identifier.descending("agent", input.id),
      version: Installation.VERSION,
      featureID: input.featureID,
      annotationID: input.annotationID,
      branch: input.branch,
      status: "working",
      color: input.color,
      directory: input.directory,
      title: input.title ?? createDefaultTitle(),
      permission: input.permission,
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }
    log.info("created", result)
    Database.use((db) => {
      db.insert(AgentTable).values(toRow(result)).run()
      Database.effect(() =>
        Bus.publish(Event.Created, {
          info: result,
        }),
      )
    })
    Bus.publish(Event.Updated, {
      info: result,
    })
    return result
  }

  export const get = fn(Identifier.schema("agent"), async (id) => {
    const row = Database.use((db) => db.select().from(AgentTable).where(eq(AgentTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `Agent not found: ${id}` })
    return fromRow(row)
  })

  export const setTitle = fn(
    z.object({
      agentID: Identifier.schema("agent"),
      title: z.string(),
    }),
    async (input) => {
      return Database.use((db) => {
        const row = db
          .update(AgentTable)
          .set({ title: input.title })
          .where(eq(AgentTable.id, input.agentID))
          .returning()
          .get()
        if (!row) throw new NotFoundError({ message: `Agent not found: ${input.agentID}` })
        const info = fromRow(row)
        Database.effect(() => Bus.publish(Event.Updated, { info }))
        return info
      })
    },
  )

  export const setStatus = fn(
    z.object({
      agentID: Identifier.schema("agent"),
      status: z.string(),
    }),
    async (input) => {
      return Database.use((db) => {
        const row = db
          .update(AgentTable)
          .set({ status: input.status, time_updated: Date.now() })
          .where(eq(AgentTable.id, input.agentID))
          .returning()
          .get()
        if (!row) throw new NotFoundError({ message: `Agent not found: ${input.agentID}` })
        const info = fromRow(row)
        Database.effect(() => Bus.publish(Event.Updated, { info }))
        return info
      })
    },
  )

  export const setPermission = fn(
    z.object({
      agentID: Identifier.schema("agent"),
      permission: PermissionNext.Ruleset,
    }),
    async (input) => {
      return Database.use((db) => {
        const row = db
          .update(AgentTable)
          .set({ permission: input.permission, time_updated: Date.now() })
          .where(eq(AgentTable.id, input.agentID))
          .returning()
          .get()
        if (!row) throw new NotFoundError({ message: `Agent not found: ${input.agentID}` })
        const info = fromRow(row)
        Database.effect(() => Bus.publish(Event.Updated, { info }))
        return info
      })
    },
  )

  export const diff = fn(Identifier.schema("agent"), async (agentID) => {
    try {
      return await Storage.read<Snapshot.FileDiff[]>(["agent_diff", agentID])
    } catch {
      return []
    }
  })

  export const messages = fn(
    z.object({
      agentID: Identifier.schema("agent"),
      limit: z.number().optional(),
    }),
    async (input) => {
      const result = [] as MessageV2.WithParts[]
      for await (const msg of MessageV2.stream(input.agentID)) {
        if (input.limit && result.length >= input.limit) break
        result.push(msg)
      }
      result.reverse()
      return result
    },
  )

  export function* list(input?: {
    directory?: string
    featureID?: string
    start?: number
    search?: string
    limit?: number
  }) {
    const conditions: SQL[] = []

    if (input?.featureID) {
      conditions.push(eq(AgentTable.feature_id, input.featureID))
    }
    if (input?.directory) {
      conditions.push(eq(AgentTable.directory, input.directory))
    }
    if (input?.start) {
      conditions.push(gte(AgentTable.time_updated, input.start))
    }
    if (input?.search) {
      conditions.push(like(AgentTable.title, `%${input.search}%`))
    }

    const limit = input?.limit ?? 100

    const rows = Database.use((db) => {
      const query =
        conditions.length > 0
          ? db
              .select()
              .from(AgentTable)
              .where(and(...conditions))
          : db.select().from(AgentTable)
      return query.orderBy(desc(AgentTable.time_updated)).limit(limit).all()
    })
    for (const row of rows) {
      yield fromRow(row)
    }
  }

  export function* listGlobal(input?: {
    directory?: string
    start?: number
    cursor?: number
    search?: string
    limit?: number
  }) {
    const conditions: SQL[] = []

    if (input?.directory) {
      conditions.push(eq(AgentTable.directory, input.directory))
    }
    if (input?.start) {
      conditions.push(gte(AgentTable.time_updated, input.start))
    }
    if (input?.cursor) {
      conditions.push(lt(AgentTable.time_updated, input.cursor))
    }
    if (input?.search) {
      conditions.push(like(AgentTable.title, `%${input.search}%`))
    }

    const limit = input?.limit ?? 100

    const rows = Database.use((db) => {
      const query =
        conditions.length > 0
          ? db
              .select()
              .from(AgentTable)
              .where(and(...conditions))
          : db.select().from(AgentTable)
      return query.orderBy(desc(AgentTable.time_updated), desc(AgentTable.id)).limit(limit).all()
    })

    const ids = [...new Set(rows.map((row) => row.feature_id))]
    const products = new Map<string, ProductInfo>()

    if (ids.length > 0) {
      const items = Database.use((db) =>
        db
          .select({ id: ProductTable.id, name: ProductTable.name, directory: ProductTable.directory })
          .from(ProductTable)
          .where(inArray(ProductTable.id, ids))
          .all(),
      )
      for (const item of items) {
        products.set(item.id, {
          id: item.id,
          name: item.name ?? undefined,
          directory: item.directory,
        })
      }
    }

    for (const row of rows) {
      const product = products.get(row.feature_id) ?? null
      yield { ...fromRow(row), product }
    }
  }

  // TODO: summary columns not yet on AgentTable - no-op for now
  export async function setSummary(_input: { agentID: string; summary: { additions: number; deletions: number; files: number } }) {}

  // TODO: share not yet implemented for agents
  export async function share(_agentID: string) {
    return undefined as string | undefined
  }

  export const remove = fn(Identifier.schema("agent"), async (agentID) => {
    try {
      const agent = await get(agentID)
      // CASCADE delete handles messages and parts automatically
      Database.use((db) => {
        db.delete(AgentTable).where(eq(AgentTable.id, agentID)).run()
        Database.effect(() =>
          Bus.publish(Event.Deleted, {
            info: agent,
          }),
        )
      })
    } catch (e) {
      log.error(e)
    }
  })

  export const updateMessage = fn(MessageV2.Info, async (msg) => {
    const time_created = msg.time.created
    const { id, agentID, ...data } = msg
    Database.use((db) => {
      db.insert(MessageTable)
        .values({
          id,
          agent_id: agentID,
          time_created,
          data,
        })
        .onConflictDoUpdate({ target: MessageTable.id, set: { data } })
        .run()
      Database.effect(() =>
        Bus.publish(MessageV2.Event.Updated, {
          info: msg,
        }),
      )
    })
    return msg
  })

  export const removeMessage = fn(
    z.object({
      agentID: Identifier.schema("agent"),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      // CASCADE delete handles parts automatically
      Database.use((db) => {
        db.delete(MessageTable)
          .where(and(eq(MessageTable.id, input.messageID), eq(MessageTable.agent_id, input.agentID)))
          .run()
        Database.effect(() =>
          Bus.publish(MessageV2.Event.Removed, {
            agentID: input.agentID,
            messageID: input.messageID,
          }),
        )
      })
      return input.messageID
    },
  )

  export const removePart = fn(
    z.object({
      agentID: Identifier.schema("agent"),
      messageID: Identifier.schema("message"),
      partID: Identifier.schema("part"),
    }),
    async (input) => {
      Database.use((db) => {
        db.delete(PartTable)
          .where(and(eq(PartTable.id, input.partID), eq(PartTable.agent_id, input.agentID)))
          .run()
        Database.effect(() =>
          Bus.publish(MessageV2.Event.PartRemoved, {
            agentID: input.agentID,
            messageID: input.messageID,
            partID: input.partID,
          }),
        )
      })
      return input.partID
    },
  )

  const UpdatePartInput = MessageV2.Part

  export const updatePart = fn(UpdatePartInput, async (part) => {
    const { id, messageID, agentID, ...data } = part
    const time = Date.now()
    Database.use((db) => {
      db.insert(PartTable)
        .values({
          id,
          message_id: messageID,
          agent_id: agentID,
          time_created: time,
          data,
        })
        .onConflictDoUpdate({ target: PartTable.id, set: { data } })
        .run()
      Database.effect(() =>
        Bus.publish(MessageV2.Event.PartUpdated, {
          part: structuredClone(part),
        }),
      )
    })
    return part
  })

  export const updatePartDelta = fn(
    z.object({
      agentID: z.string(),
      messageID: z.string(),
      partID: z.string(),
      field: z.string(),
      delta: z.string(),
    }),
    async (input) => {
      Bus.publish(MessageV2.Event.PartDelta, input)
    },
  )

  export const getUsage = fn(
    z.object({
      model: z.custom<Provider.Model>(),
      usage: z.custom<LanguageModelV2Usage>(),
      metadata: z.custom<ProviderMetadata>().optional(),
    }),
    (input) => {
      const safe = (value: number) => {
        if (!Number.isFinite(value)) return 0
        return value
      }
      const inputTokens = safe(input.usage.inputTokens ?? 0)
      const outputTokens = safe(input.usage.outputTokens ?? 0)
      const reasoningTokens = safe(input.usage.reasoningTokens ?? 0)

      const cacheReadInputTokens = safe(input.usage.cachedInputTokens ?? 0)
      const cacheWriteInputTokens = safe(
        (input.metadata?.["anthropic"]?.["cacheCreationInputTokens"] ??
          // @ts-expect-error
          input.metadata?.["bedrock"]?.["usage"]?.["cacheWriteInputTokens"] ??
          // @ts-expect-error
          input.metadata?.["venice"]?.["usage"]?.["cacheCreationInputTokens"] ??
          0) as number,
      )

      const excludesCachedTokens = !!(input.metadata?.["anthropic"] || input.metadata?.["bedrock"])
      const adjustedInputTokens = safe(
        excludesCachedTokens ? inputTokens : inputTokens - cacheReadInputTokens - cacheWriteInputTokens,
      )

      const total = iife(() => {
        if (
          input.model.api.npm === "@ai-sdk/anthropic" ||
          input.model.api.npm === "@ai-sdk/amazon-bedrock" ||
          input.model.api.npm === "@ai-sdk/google-vertex/anthropic"
        ) {
          return adjustedInputTokens + outputTokens + cacheReadInputTokens + cacheWriteInputTokens
        }
        return input.usage.totalTokens
      })

      const tokens = {
        total,
        input: adjustedInputTokens,
        output: outputTokens,
        reasoning: reasoningTokens,
        cache: {
          write: cacheWriteInputTokens,
          read: cacheReadInputTokens,
        },
      }

      const costInfo =
        input.model.cost?.experimentalOver200K && tokens.input + tokens.cache.read > 200_000
          ? input.model.cost.experimentalOver200K
          : input.model.cost
      return {
        cost: safe(
          new Decimal(0)
            .add(new Decimal(tokens.input).mul(costInfo?.input ?? 0).div(1_000_000))
            .add(new Decimal(tokens.output).mul(costInfo?.output ?? 0).div(1_000_000))
            .add(new Decimal(tokens.cache.read).mul(costInfo?.cache?.read ?? 0).div(1_000_000))
            .add(new Decimal(tokens.cache.write).mul(costInfo?.cache?.write ?? 0).div(1_000_000))
            .add(new Decimal(tokens.reasoning).mul(costInfo?.output ?? 0).div(1_000_000))
            .toNumber(),
        ),
        tokens,
      }
    },
  )

  export class BusyError extends Error {
    constructor(public readonly agentID: string) {
      super(`Agent ${agentID} is busy`)
    }
  }

  export const initialize = fn(
    z.object({
      agentID: Identifier.schema("agent"),
      modelID: z.string(),
      providerID: z.string(),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      await AgentPrompt.command({
        agentID: input.agentID,
        messageID: input.messageID,
        model: input.providerID + "/" + input.modelID,
        command: Command.Default.INIT,
        arguments: "",
      })
    },
  )
}
