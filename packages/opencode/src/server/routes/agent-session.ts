import { Hono } from "hono"
import { stream } from "hono/streaming"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { AgentSession } from "../../agent"
import { MessageV2 } from "../../agent/message-v2"
import { AgentPrompt } from "../../agent/prompt"
import { SessionCompaction } from "../../session/compaction"
import { AgentRevert } from "../../agent/revert"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Todo } from "../../session/todo"
import { Agent } from "../../agent/agent"
import { Snapshot } from "@/snapshot"
import { Log } from "../../util/log"
import { PermissionNext } from "@/permission/next"
import { Identifier } from "@/id/id"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { SessionCanvas } from "../../session/session-canvas"

const log = Log.create({ service: "server" })

export const AgentSessionRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List agent sessions",
        description: "Get a list of all agent sessions, sorted by most recently updated.",
        operationId: "agent.session.list",
        responses: {
          200: {
            description: "List of agent sessions",
            content: {
              "application/json": {
                schema: resolver(AgentSession.Info.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional().meta({ description: "Filter by project directory" }),
          start: z.coerce
            .number()
            .optional()
            .meta({ description: "Filter updated on or after this timestamp (milliseconds since epoch)" }),
          search: z.string().optional().meta({ description: "Filter by title (case-insensitive)" }),
          limit: z.coerce.number().optional().meta({ description: "Maximum number to return" }),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const sessions: AgentSession.Info[] = []
        for (const session of AgentSession.list({
          directory: query.directory,
          start: query.start,
          search: query.search,
          limit: query.limit,
        })) {
          sessions.push(session)
        }
        return c.json(sessions)
      },
    )
    .get(
      "/status",
      describeRoute({
        summary: "Get agent session status",
        description: "Retrieve the current status of all agent sessions.",
        operationId: "agent.session.status",
        responses: {
          200: {
            description: "Get agent session status",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), SessionStatus.Info)),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const result = SessionStatus.list()
        return c.json(result)
      },
    )
    .get(
      "/:agentID",
      describeRoute({
        summary: "Get agent session",
        description: "Retrieve detailed information about a specific agent session.",
        tags: ["AgentSession"],
        operationId: "agent.session.get",
        responses: {
          200: {
            description: "Get agent session",
            content: {
              "application/json": {
                schema: resolver(AgentSession.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: AgentSession.get.schema,
        }),
      ),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        log.info("SEARCH", { url: c.req.url })
        const agent = await AgentSession.get(agentID)
        return c.json(agent)
      },
    )
    .get(
      "/:agentID/todo",
      describeRoute({
        summary: "Get agent session todos",
        description: "Retrieve the todo list associated with a specific agent session.",
        operationId: "agent.session.todo",
        responses: {
          200: {
            description: "Todo list",
            content: {
              "application/json": {
                schema: resolver(Todo.Info.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
        }),
      ),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        const todos = await Todo.get(agentID)
        return c.json(todos)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create agent session",
        description: "Create a new agent session.",
        operationId: "agent.session.create",
        responses: {
          ...errors(400),
          200: {
            description: "Successfully created agent session",
            content: {
              "application/json": {
                schema: resolver(AgentSession.Info),
              },
            },
          },
        },
      }),
      validator("json", AgentSession.create.schema.optional()),
      async (c) => {
        const body = c.req.valid("json") ?? {}
        const agent = await AgentSession.create(body)
        return c.json(agent)
      },
    )
    .delete(
      "/:agentID",
      describeRoute({
        summary: "Delete agent session",
        description: "Delete an agent session and permanently remove all associated data.",
        operationId: "agent.session.delete",
        responses: {
          200: {
            description: "Successfully deleted agent session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: AgentSession.remove.schema,
        }),
      ),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        await AgentSession.remove(agentID)
        return c.json(true)
      },
    )
    .patch(
      "/:agentID",
      describeRoute({
        summary: "Update agent session",
        description: "Update properties of an existing agent session.",
        operationId: "agent.session.update",
        responses: {
          200: {
            description: "Successfully updated agent session",
            content: {
              "application/json": {
                schema: resolver(AgentSession.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent"),
        }),
      ),
      validator(
        "json",
        z.object({
          title: z.string().optional(),
        }),
      ),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        const updates = c.req.valid("json")

        let agent = await AgentSession.get(agentID)
        if (updates.title !== undefined) {
          agent = await AgentSession.setTitle({ agentID, title: updates.title })
        }

        return c.json(agent)
      },
    )
    .post(
      "/:agentID/init",
      describeRoute({
        summary: "Initialize agent session",
        description:
          "Analyze the current application and create an AGENTS.md file with project-specific agent configurations.",
        operationId: "agent.session.init",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
        }),
      ),
      validator("json", AgentSession.initialize.schema.omit({ agentID: true })),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        const body = c.req.valid("json")
        await AgentSession.initialize({ ...body, agentID })
        return c.json(true)
      },
    )
    .post(
      "/:agentID/fork",
      describeRoute({
        summary: "Fork agent session",
        description: "Create a new agent session by forking an existing one at a specific message point.",
        operationId: "agent.session.fork",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(AgentSession.Info),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          agentID: AgentSession.fork.schema.shape.agentID,
        }),
      ),
      validator("json", AgentSession.fork.schema.omit({ agentID: true })),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        const body = c.req.valid("json")
        const result = await AgentSession.fork({ ...body, agentID })
        return c.json(result)
      },
    )
    .post(
      "/:agentID/abort",
      describeRoute({
        summary: "Abort agent session",
        description: "Abort an active agent session and stop any ongoing AI processing.",
        operationId: "agent.session.abort",
        responses: {
          200: {
            description: "Aborted agent session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent"),
        }),
      ),
      async (c) => {
        AgentPrompt.cancel(c.req.valid("param").agentID)
        return c.json(true)
      },
    )
    .get(
      "/:agentID/diff",
      describeRoute({
        summary: "Get message diff",
        description: "Get the file changes (diff) that resulted from a specific user message.",
        operationId: "agent.session.diff",
        responses: {
          200: {
            description: "Successfully retrieved diff",
            content: {
              "application/json": {
                schema: resolver(Snapshot.FileDiff.array()),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          agentID: SessionSummary.diff.schema.shape.sessionID,
        }),
      ),
      validator(
        "query",
        z.object({
          messageID: SessionSummary.diff.schema.shape.messageID,
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const params = c.req.valid("param")
        const result = await SessionSummary.diff({
          sessionID: params.agentID,
          messageID: query.messageID,
        })
        return c.json(result)
      },
    )
    .post(
      "/:agentID/summarize",
      describeRoute({
        summary: "Summarize agent session",
        description: "Generate a concise summary using AI compaction to preserve key information.",
        operationId: "agent.session.summarize",
        responses: {
          200: {
            description: "Summarized agent session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          providerID: z.string(),
          modelID: z.string(),
          auto: z.boolean().optional().default(false),
        }),
      ),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        const body = c.req.valid("json")
        const agent = await AgentSession.get(agentID)
        await AgentRevert.cleanup(agent)
        const msgs = await AgentSession.messages({ agentID })
        let currentAgent = await Agent.defaultAgent()
        for (let i = msgs.length - 1; i >= 0; i--) {
          const info = msgs[i].info
          if (info.role === "user") {
            currentAgent = info.agent || (await Agent.defaultAgent())
            break
          }
        }
        await SessionCompaction.create({
          sessionID: agentID,
          agent: currentAgent,
          model: {
            providerID: body.providerID,
            modelID: body.modelID,
          },
          auto: body.auto,
        })
        await AgentPrompt.loop({ agentID })
        return c.json(true)
      },
    )
    .get(
      "/:agentID/message",
      describeRoute({
        summary: "Get agent session messages",
        description: "Retrieve all messages in an agent session.",
        operationId: "agent.session.messages",
        responses: {
          200: {
            description: "List of messages",
            content: {
              "application/json": {
                schema: resolver(MessageV2.WithParts.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
        }),
      ),
      validator(
        "query",
        z.object({
          limit: z.coerce.number().optional(),
        }),
      ),
      async (c) => {
        try {
          const query = c.req.valid("query")
          const messages = await AgentSession.messages({
            agentID: c.req.valid("param").agentID,
            limit: query.limit,
          })
          return c.json(messages)
        } catch (e) {
          if (e instanceof z.ZodError) {
            return c.json({ success: false, data: null, errors: e.issues }, 400)
          }
          throw e
        }
      },
    )
    .get(
      "/:agentID/message/:messageID",
      describeRoute({
        summary: "Get message",
        description: "Retrieve a specific message by its message ID.",
        operationId: "agent.session.message",
        responses: {
          200: {
            description: "Message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Info,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
          messageID: Identifier.schema("message").meta({ description: "Message ID" }),
        }),
      ),
      async (c) => {
        try {
          const params = c.req.valid("param")
          const message = await MessageV2.get({
            agentID: params.agentID,
            messageID: params.messageID,
          })
          return c.json(message)
        } catch (e) {
          if (e instanceof z.ZodError) {
            return c.json({ success: false, data: null, errors: e.issues }, 400)
          }
          throw e
        }
      },
    )
    .delete(
      "/:agentID/message/:messageID",
      describeRoute({
        summary: "Delete message",
        description: "Permanently delete a specific message from an agent session.",
        operationId: "agent.session.deleteMessage",
        responses: {
          200: {
            description: "Successfully deleted message",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
          messageID: Identifier.schema("message").meta({ description: "Message ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        AgentPrompt.assertNotBusy(params.agentID)
        await AgentSession.removeMessage({
          agentID: params.agentID,
          messageID: params.messageID,
        })
        return c.json(true)
      },
    )
    .delete(
      "/:agentID/message/:messageID/part/:partID",
      describeRoute({
        description: "Delete a part from a message",
        operationId: "agent.session.part.delete",
        responses: {
          200: {
            description: "Successfully deleted part",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
          messageID: Identifier.schema("message").meta({ description: "Message ID" }),
          partID: z.string().meta({ description: "Part ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        await AgentSession.removePart({
          agentID: params.agentID,
          messageID: params.messageID,
          partID: params.partID,
        })
        return c.json(true)
      },
    )
    .patch(
      "/:agentID/message/:messageID/part/:partID",
      describeRoute({
        description: "Update a part in a message",
        operationId: "agent.session.part.update",
        responses: {
          200: {
            description: "Successfully updated part",
            content: {
              "application/json": {
                schema: resolver(MessageV2.Part),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
          messageID: Identifier.schema("message").meta({ description: "Message ID" }),
          partID: z.string().meta({ description: "Part ID" }),
        }),
      ),
      validator("json", MessageV2.Part),
      async (c) => {
        const params = c.req.valid("param")
        const body = c.req.valid("json")
        if (body.id !== params.partID || body.messageID !== params.messageID || body.agentID !== params.agentID) {
          throw new Error(
            `Part mismatch: body.id='${body.id}' vs partID='${params.partID}', body.messageID='${body.messageID}' vs messageID='${params.messageID}', body.agentID='${body.agentID}' vs agentID='${params.agentID}'`,
          )
        }
        const part = await AgentSession.updatePart(body)
        return c.json(part)
      },
    )
    .post(
      "/:agentID/message",
      describeRoute({
        summary: "Send message",
        description: "Create and send a new message, streaming the AI response.",
        operationId: "agent.session.prompt",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
        }),
      ),
      validator("json", AgentPrompt.PromptInput.omit({ agentID: true })),
      async (c) => {
        c.status(200)
        c.header("Content-Type", "application/json")
        return stream(c, async (stream) => {
          const agentID = c.req.valid("param").agentID
          const body = c.req.valid("json")
          const msg = await AgentPrompt.prompt({ ...body, agentID })
          stream.write(JSON.stringify(msg))
        })
      },
    )
    .post(
      "/:agentID/prompt_async",
      describeRoute({
        summary: "Send async message",
        description: "Create and send a new message asynchronously, returning immediately.",
        operationId: "agent.session.prompt_async",
        responses: {
          204: {
            description: "Prompt accepted",
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
        }),
      ),
      validator("json", AgentPrompt.PromptInput.omit({ agentID: true })),
      async (c) => {
        c.status(204)
        c.header("Content-Type", "application/json")
        return stream(c, async () => {
          const agentID = c.req.valid("param").agentID
          const body = c.req.valid("json")
          AgentPrompt.prompt({ ...body, agentID })
        })
      },
    )
    .post(
      "/:agentID/command",
      describeRoute({
        summary: "Send command",
        description: "Send a command for execution by the AI assistant.",
        operationId: "agent.session.command",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
        }),
      ),
      validator("json", AgentPrompt.CommandInput.omit({ agentID: true })),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        const body = c.req.valid("json")
        const msg = await AgentPrompt.command({ ...body, agentID })
        return c.json(msg)
      },
    )
    .post(
      "/:agentID/revert",
      describeRoute({
        summary: "Revert message",
        description: "Revert a specific message, undoing its effects.",
        operationId: "agent.session.revert",
        responses: {
          200: {
            description: "Updated agent session",
            content: {
              "application/json": {
                schema: resolver(AgentSession.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent"),
        }),
      ),
      validator("json", AgentRevert.RevertInput.omit({ agentID: true })),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        log.info("revert", c.req.valid("json"))
        const agent = await AgentRevert.revert({
          agentID,
          ...c.req.valid("json"),
        })
        return c.json(agent)
      },
    )
    .post(
      "/:agentID/unrevert",
      describeRoute({
        summary: "Restore reverted messages",
        description: "Restore all previously reverted messages.",
        operationId: "agent.session.unrevert",
        responses: {
          200: {
            description: "Updated agent session",
            content: {
              "application/json": {
                schema: resolver(AgentSession.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent"),
        }),
      ),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        const agent = await AgentRevert.unrevert({ agentID })
        return c.json(agent)
      },
    )
    .get(
      "/:agentID/canvas",
      describeRoute({
        summary: "Get canvas state",
        description: "Retrieve the canvas state for a specific agent session.",
        operationId: "agent.session.canvas.get",
        responses: {
          200: {
            description: "Canvas state",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    state: z.string().nullable(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
        }),
      ),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        const state = SessionCanvas.get(agentID)
        return c.json({ state: state ?? null })
      },
    )
    .put(
      "/:agentID/canvas",
      describeRoute({
        summary: "Put canvas state",
        description: "Save the canvas state for a specific agent session.",
        operationId: "agent.session.canvas.put",
        responses: {
          200: {
            description: "Canvas state saved",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    ok: z.boolean(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent").meta({ description: "Agent ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          state: z.string().meta({ description: "Canvas state JSON" }),
        }),
      ),
      async (c) => {
        const agentID = c.req.valid("param").agentID
        const body = c.req.valid("json")
        SessionCanvas.put(agentID, body.state)
        return c.json({ ok: true })
      },
    )
    .post(
      "/:agentID/permissions/:permissionID",
      describeRoute({
        summary: "Respond to permission",
        deprecated: true,
        description: "Approve or deny a permission request from the AI assistant.",
        operationId: "agent.session.permission.respond",
        responses: {
          200: {
            description: "Permission processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          agentID: Identifier.schema("agent"),
          permissionID: Identifier.schema("permission"),
        }),
      ),
      validator("json", z.object({ response: PermissionNext.Reply })),
      async (c) => {
        const params = c.req.valid("param")
        PermissionNext.reply({
          requestID: params.permissionID,
          reply: c.req.valid("json").response,
        })
        return c.json(true)
      },
    ),
)
