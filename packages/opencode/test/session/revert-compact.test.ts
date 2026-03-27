import { describe, expect, test } from "bun:test"
import path from "path"
import { AgentSession as Session } from "../../src/agent"
import { AgentRevert } from "../../src/agent/revert"
import { MessageV2 } from "../../src/agent/message-v2"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Identifier } from "../../src/id/id"
import { tmpdir } from "../fixture/fixture"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("revert + compact workflow", () => {
  test("should properly handle revert and collect patches", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const agentID = session.id

        // Create a user message
        const userMsg1 = await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "user",
          agentID,
          agent: "default",
          model: {
            providerID: "openai",
            modelID: "gpt-4",
          },
          time: {
            created: Date.now(),
          },
        })

        await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: userMsg1.id,
          agentID,
          type: "text",
          text: "Hello, please help me",
        })

        // Create an assistant response message
        const assistantMsg1: MessageV2.Assistant = {
          id: Identifier.ascending("message"),
          role: "assistant",
          agentID,
          mode: "default",
          agent: "default",
          path: {
            cwd: tmp.path,
            root: tmp.path,
          },
          cost: 0,
          tokens: {
            output: 0,
            input: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: "gpt-4",
          providerID: "openai",
          parentID: userMsg1.id,
          time: {
            created: Date.now(),
          },
          finish: "end_turn",
        }
        await Session.updateMessage(assistantMsg1)

        await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: assistantMsg1.id,
          agentID,
          type: "text",
          text: "Sure, I'll help you!",
        })

        // Create another user message
        const userMsg2 = await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "user",
          agentID,
          agent: "default",
          model: {
            providerID: "openai",
            modelID: "gpt-4",
          },
          time: {
            created: Date.now(),
          },
        })

        await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: userMsg2.id,
          agentID,
          type: "text",
          text: "What's the capital of France?",
        })

        // Verify messages before revert
        let messages = await Session.messages({ agentID })
        expect(messages.length).toBe(3) // 2 user + 1 assistant

        // Revert — the new implementation collects patches and applies snapshot revert
        const result = await AgentRevert.revert({
          agentID,
          messageID: userMsg2.id,
        })

        // The revert function returns the agent info
        expect(result).toBeDefined()
        expect(result.id).toBe(agentID)

        // Clean up
        await Session.remove(agentID)
      },
    })
  })

  test("should handle revert on initial user message", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const agentID = session.id

        // Create initial messages
        const userMsg = await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "user",
          agentID,
          agent: "default",
          model: {
            providerID: "openai",
            modelID: "gpt-4",
          },
          time: {
            created: Date.now(),
          },
        })

        await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: userMsg.id,
          agentID,
          type: "text",
          text: "Hello",
        })

        const assistantMsg: MessageV2.Assistant = {
          id: Identifier.ascending("message"),
          role: "assistant",
          agentID,
          mode: "default",
          agent: "default",
          path: {
            cwd: tmp.path,
            root: tmp.path,
          },
          cost: 0,
          tokens: {
            output: 0,
            input: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: "gpt-4",
          providerID: "openai",
          parentID: userMsg.id,
          time: {
            created: Date.now(),
          },
          finish: "end_turn",
        }
        await Session.updateMessage(assistantMsg)

        await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: assistantMsg.id,
          agentID,
          type: "text",
          text: "Hi there!",
        })

        // Revert the user message
        const result = await AgentRevert.revert({
          agentID,
          messageID: userMsg.id,
        })

        // Should return agent info
        expect(result).toBeDefined()
        expect(result.id).toBe(agentID)

        // Cleanup is a no-op in the new architecture
        await AgentRevert.cleanup(result)

        // Clean up
        await Session.remove(agentID)
      },
    })
  })
})
