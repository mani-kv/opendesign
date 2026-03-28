import z from "zod"
import { and, desc, eq } from "drizzle-orm"
import { FeatureTable } from "./feature.sql"
import { Database, NotFoundError } from "../storage/db"
import { Identifier } from "../id/id"
import { Bus } from "../bus"
import { BusEvent } from "../bus/bus-event"
import { fn } from "../util/fn"

export namespace Feature {
  export const Info = z
    .object({
      id: z.string(),
      productID: z.string(),
      name: z.string(),
      branch: z.string(),
      status: z.enum(["active", "completed", "archived"]).default("active"),
      figmaUrl: z.string().optional(),
      canvasState: z.any().optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
      }),
    })
    .meta({ ref: "Feature" })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: BusEvent.define("feature.created", Info),
    Updated: BusEvent.define("feature.updated", Info),
    Deleted: BusEvent.define("feature.deleted", z.object({ id: z.string() })),
  }

  function fromRow(row: typeof FeatureTable.$inferSelect): Info {
    return {
      id: row.id,
      productID: row.product_id,
      name: row.name,
      branch: row.branch,
      status: row.status as Info["status"],
      figmaUrl: row.figma_url ?? undefined,
      canvasState: row.canvas_state ?? undefined,
      time: {
        created: row.time_created,
        updated: row.time_updated,
      },
    }
  }

  export const create = fn(
    z.object({
      productID: z.string(),
      name: z.string(),
      branch: z.string(),
      figmaUrl: z.string().optional(),
    }),
    async (input) => {
      const id = Identifier.ascending("feature")
      const time = Date.now()
      Database.use((db) => {
        db.insert(FeatureTable)
          .values({
            id,
            product_id: input.productID,
            name: input.name,
            branch: input.branch,
            figma_url: input.figmaUrl,
            status: "active",
            time_created: time,
            time_updated: time,
          })
          .run()
      })
      const info = await get(id)
      Database.use(() => {
        Database.effect(() => Bus.publish(Event.Created, info))
      })
      return info
    },
  )

  export const get = fn(z.string(), async (id) => {
    const row = Database.use((db) => db.select().from(FeatureTable).where(eq(FeatureTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `Feature ${id} not found` })
    return fromRow(row)
  })

  export function* list(input?: { productID?: string }) {
    const conditions: ReturnType<typeof eq>[] = []
    if (input?.productID) {
      conditions.push(eq(FeatureTable.product_id, input.productID))
    }
    const rows = Database.use((db) => {
      const query = conditions.length
        ? db.select().from(FeatureTable).where(and(...conditions))
        : db.select().from(FeatureTable)
      return query.orderBy(desc(FeatureTable.time_updated)).all()
    })
    for (const row of rows) {
      yield fromRow(row)
    }
  }

  export const remove = fn(z.string(), async (id) => {
    const info = await get(id)
    Database.use((db) => {
      db.delete(FeatureTable).where(eq(FeatureTable.id, id)).run()
      Database.effect(() => Bus.publish(Event.Deleted, { id }))
    })
    return info
  })

  export const update = fn(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      status: z.enum(["active", "completed", "archived"]).optional(),
      figmaUrl: z.string().optional(),
      canvasState: z.any().optional(),
    }),
    async (input) => {
      const time = Date.now()
      const sets: Record<string, unknown> = { time_updated: time }
      if (input.name !== undefined) sets.name = input.name
      if (input.status !== undefined) sets.status = input.status
      if (input.figmaUrl !== undefined) sets.figma_url = input.figmaUrl
      if (input.canvasState !== undefined) sets.canvas_state = JSON.stringify(input.canvasState)

      Database.use((db) => {
        db.update(FeatureTable).set(sets).where(eq(FeatureTable.id, input.id)).run()
      })
      const info = await get(input.id)
      Database.use(() => {
        Database.effect(() => Bus.publish(Event.Updated, info))
      })
      return info
    },
  )
}
