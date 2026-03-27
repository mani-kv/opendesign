import z from "zod"
import { Identifier } from "../id/id"
import { Snapshot } from "../snapshot"
import { MessageV2 } from "./message-v2"
import { AgentSession } from "."
import { Log } from "../util/log"
import { Database, eq } from "../storage/db"
import { MessageTable } from "./message.sql"
import { PartTable } from "./part.sql"
import { Storage } from "@/storage/storage"
import { Bus } from "../bus"
import { AgentPrompt } from "./prompt"
import { SessionSummary } from "./summary"

export namespace AgentRevert {
  const log = Log.create({ service: "agent.revert" })

  export const RevertInput = z.object({
    agentID: Identifier.schema("agent"),
    messageID: Identifier.schema("message"),
    partID: Identifier.schema("part").optional(),
  })
  export type RevertInput = z.infer<typeof RevertInput>

  export async function revert(input: RevertInput) {
    AgentPrompt.assertNotBusy(input.agentID)
    const all = await AgentSession.messages({ agentID: input.agentID })
    let lastUser: MessageV2.User | undefined
    const agent = await AgentSession.get(input.agentID)

    let revertInfo: typeof agent extends { revert?: infer R } ? R : never
    const patches: Snapshot.Patch[] = []
    for (const msg of all) {
      if (msg.info.role === "user") lastUser = msg.info
      const remaining = []
      for (const part of msg.parts) {
        if (revertInfo) {
          if (part.type === "patch") {
            patches.push(part)
          }
          continue
        }

        if (!revertInfo) {
          if ((msg.info.id === input.messageID && !input.partID) || part.id === input.partID) {
            const partID = remaining.some((item) => ["text", "tool"].includes(item.type)) ? input.partID : undefined
            revertInfo = {
              messageID: !partID && lastUser ? lastUser.id : msg.info.id,
              partID,
            }
          }
          remaining.push(part)
        }
      }
    }

    if (revertInfo) {
      await Snapshot.revert(patches)
      const rangeMessages = all.filter((msg) => msg.info.id >= revertInfo!.messageID)
      const diffs = await SessionSummary.computeDiff({ messages: rangeMessages })
      await Storage.write(["agent_diff", input.agentID], diffs)
      Bus.publish(AgentSession.Event.Diff, {
        agentID: input.agentID,
        diff: diffs,
      })
    }
    return agent
  }

  export async function cleanup(_agent: AgentSession.Info) {
    // Revert cleanup is simplified for agents — the old session revert/snapshot
    // fields have been removed from the schema. Revert state will be managed
    // differently in the new architecture. This is a no-op placeholder.
  }
}
