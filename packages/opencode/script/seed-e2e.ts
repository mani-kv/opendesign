const dir = process.env.OPENCODE_E2E_PROJECT_DIR ?? process.cwd()
const title = process.env.OPENCODE_E2E_SESSION_TITLE ?? "E2E Session"
const text = process.env.OPENCODE_E2E_MESSAGE ?? "Seeded for UI e2e"
const model = process.env.OPENCODE_E2E_MODEL ?? "opencode/gpt-5-nano"
const parts = model.split("/")
const providerID = parts[0] ?? "opencode"
const modelID = parts[1] ?? "gpt-5-nano"
const now = Date.now()

const seed = async () => {
  const { Instance } = await import("../src/project/instance")
  const { InstanceBootstrap } = await import("../src/project/bootstrap")
  const { Agent } = await import("../src/agent")
  const { Identifier } = await import("../src/id/id")
  const { Product } = await import("../src/product")

  await Instance.provide({
    directory: dir,
    init: InstanceBootstrap,
    fn: async () => {
      const session = await Agent.create({ featureID: Instance.project.id, title })
      const messageID = Identifier.descending("message")
      const partID = Identifier.descending("part")
      const message = {
        id: messageID,
        agentID: session.id,
        role: "user" as const,
        time: { created: now },
        agent: "build",
        model: {
          providerID,
          modelID,
        },
      }
      const part = {
        id: partID,
        agentID: session.id,
        messageID,
        type: "text" as const,
        text,
        time: { start: now },
      }
      await Agent.updateMessage(message)
      await Agent.updatePart(part)
      await Product.update({ projectID: Instance.project.id, name: "E2E Project" })
    },
  })
}

await seed()
