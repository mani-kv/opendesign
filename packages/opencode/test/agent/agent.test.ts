import { test, expect } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { AgentDef } from "../../src/agent/agent-def"
import { PermissionNext } from "../../src/permission/next"

// Helper to evaluate permission for a tool with wildcard pattern
function evalPerm(agent: AgentDef.Info | undefined, permission: string): PermissionNext.Action | undefined {
  if (!agent) return undefined
  return PermissionNext.evaluate(permission, "*", agent.permission).action
}

test("returns default native agents when no config", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agents = await AgentDef.list()
      const names = agents.map((a) => a.name)
      expect(names).toContain("prototype")
      expect(names).toContain("ask")
      expect(names).toContain("general")
      expect(names).toContain("explore")
      expect(names).toContain("compaction")
      expect(names).toContain("title")
      expect(names).toContain("summary")
      expect(names).toContain("scenario")
      expect(names).toContain("research")
      expect(names).toContain("audit")
      expect(names).toContain("figma-write")
    },
  })
})

test("prototype agent has correct default properties", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(agent).toBeDefined()
      expect(agent?.mode).toBe("primary")
      expect(agent?.native).toBe(true)
      expect(agent?.prompt).toBeDefined()
      expect(evalPerm(agent, "question")).toBe("allow")
      expect(evalPerm(agent, "read")).toBe("allow")
      expect(evalPerm(agent, "edit")).toBe("deny")
      expect(evalPerm(agent, "write")).toBe("deny")
    },
  })
})

test("ask agent denies edits and writes", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const ask = await AgentDef.get("ask")
      expect(ask).toBeDefined()
      expect(ask?.mode).toBe("primary")
      expect(evalPerm(ask, "edit")).toBe("deny")
      expect(evalPerm(ask, "write")).toBe("deny")
      expect(evalPerm(ask, "bash")).toBe("deny")
      expect(evalPerm(ask, "read")).toBe("allow")
      expect(evalPerm(ask, "grep")).toBe("allow")
      expect(evalPerm(ask, "glob")).toBe("allow")
      expect(evalPerm(ask, "webfetch")).toBe("allow")
      expect(evalPerm(ask, "websearch")).toBe("allow")
      expect(evalPerm(ask, "question")).toBe("allow")
      expect(evalPerm(ask, "codesearch")).toBe("allow")
    },
  })
})

test("explore agent denies edit and write", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const explore = await AgentDef.get("explore")
      expect(explore).toBeDefined()
      expect(explore?.mode).toBe("subagent")
      expect(evalPerm(explore, "edit")).toBe("deny")
      expect(evalPerm(explore, "write")).toBe("deny")
      expect(evalPerm(explore, "todoread")).toBe("deny")
      expect(evalPerm(explore, "todowrite")).toBe("deny")
    },
  })
})

test("explore agent asks for external directories and allows Truncate.GLOB", async () => {
  const { Truncate } = await import("../../src/tool/truncation")
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const explore = await AgentDef.get("explore")
      expect(explore).toBeDefined()
      expect(PermissionNext.evaluate("external_directory", "/some/other/path", explore!.permission).action).toBe("ask")
      expect(PermissionNext.evaluate("external_directory", Truncate.GLOB, explore!.permission).action).toBe("allow")
    },
  })
})

test("scenario agent is a subagent with prompt", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const scenario = await AgentDef.get("scenario")
      expect(scenario).toBeDefined()
      expect(scenario?.mode).toBe("subagent")
      expect(scenario?.native).toBe(true)
      expect(scenario?.prompt).toBeDefined()
    },
  })
})

test("research agent is read-only subagent", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const research = await AgentDef.get("research")
      expect(research).toBeDefined()
      expect(research?.mode).toBe("subagent")
      expect(evalPerm(research, "edit")).toBe("deny")
      expect(evalPerm(research, "write")).toBe("deny")
      expect(evalPerm(research, "read")).toBe("allow")
      expect(evalPerm(research, "grep")).toBe("allow")
    },
  })
})

test("audit agent allows bash but denies edit", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const audit = await AgentDef.get("audit")
      expect(audit).toBeDefined()
      expect(audit?.mode).toBe("subagent")
      expect(evalPerm(audit, "bash")).toBe("allow")
      expect(evalPerm(audit, "edit")).toBe("deny")
      expect(evalPerm(audit, "read")).toBe("allow")
    },
  })
})

test("figma-write agent is a subagent", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const fw = await AgentDef.get("figma-write")
      expect(fw).toBeDefined()
      expect(fw?.mode).toBe("subagent")
      expect(fw?.native).toBe(true)
      expect(evalPerm(fw, "edit")).toBe("deny")
      expect(evalPerm(fw, "read")).toBe("allow")
    },
  })
})

test("general agent denies todo tools", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const general = await AgentDef.get("general")
      expect(general).toBeDefined()
      expect(general?.mode).toBe("subagent")
      expect(general?.hidden).toBeUndefined()
      expect(evalPerm(general, "todoread")).toBe("deny")
      expect(evalPerm(general, "todowrite")).toBe("deny")
    },
  })
})

test("compaction agent denies all permissions", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const compaction = await AgentDef.get("compaction")
      expect(compaction).toBeDefined()
      expect(compaction?.hidden).toBe(true)
      expect(evalPerm(compaction, "bash")).toBe("deny")
      expect(evalPerm(compaction, "edit")).toBe("deny")
      expect(evalPerm(compaction, "read")).toBe("deny")
    },
  })
})

test("custom agent from config creates new agent", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        my_custom_agent: {
          model: "openai/gpt-4",
          description: "My custom agent",
          temperature: 0.5,
          top_p: 0.9,
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const custom = await AgentDef.get("my_custom_agent")
      expect(custom).toBeDefined()
      expect(custom?.model?.providerID).toBe("openai")
      expect(custom?.model?.modelID).toBe("gpt-4")
      expect(custom?.description).toBe("My custom agent")
      expect(custom?.temperature).toBe(0.5)
      expect(custom?.topP).toBe(0.9)
      expect(custom?.native).toBe(false)
      expect(custom?.mode).toBe("all")
    },
  })
})

test("custom agent config overrides native agent properties", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: {
          model: "anthropic/claude-3",
          description: "Custom build agent",
          temperature: 0.7,
          color: "#FF0000",
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(agent).toBeDefined()
      expect(agent?.model?.providerID).toBe("anthropic")
      expect(agent?.model?.modelID).toBe("claude-3")
      expect(agent?.description).toBe("Custom build agent")
      expect(agent?.temperature).toBe(0.7)
      expect(agent?.color).toBe("#FF0000")
      expect(agent?.native).toBe(true)
    },
  })
})

test("agent disable removes agent from list", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        explore: { disable: true },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const explore = await AgentDef.get("explore")
      expect(explore).toBeUndefined()
      const agents = await AgentDef.list()
      const names = agents.map((a) => a.name)
      expect(names).not.toContain("explore")
    },
  })
})

test("agent permission config merges with defaults", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: {
          permission: {
            bash: {
              "rm -rf *": "deny",
            },
          },
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(agent).toBeDefined()
      // Specific pattern is denied
      expect(PermissionNext.evaluate("bash", "rm -rf *", agent!.permission).action).toBe("deny")
    },
  })
})

test("global permission config applies to all agents", async () => {
  await using tmp = await tmpdir({
    config: {
      permission: {
        bash: "deny",
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(agent).toBeDefined()
      expect(evalPerm(agent, "bash")).toBe("deny")
    },
  })
})

test("agent steps/maxSteps config sets steps property", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: { steps: 50 },
        ask: { maxSteps: 100 },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      const ask = await AgentDef.get("ask")
      expect(agent?.steps).toBe(50)
      expect(ask?.steps).toBe(100)
    },
  })
})

test("agent mode can be overridden", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        explore: { mode: "primary" },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const explore = await AgentDef.get("explore")
      expect(explore?.mode).toBe("primary")
    },
  })
})

test("agent name can be overridden", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: { name: "Builder" },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(agent?.name).toBe("Builder")
    },
  })
})

test("agent prompt can be set from config", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: { prompt: "Custom system prompt" },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(agent?.prompt).toBe("Custom system prompt")
    },
  })
})

test("unknown agent properties are placed into options", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: {
          random_property: "hello",
          another_random: 123,
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(agent?.options.random_property).toBe("hello")
      expect(agent?.options.another_random).toBe(123)
    },
  })
})

test("agent options merge correctly", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: {
          options: {
            custom_option: true,
            another_option: "value",
          },
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(agent?.options.custom_option).toBe(true)
      expect(agent?.options.another_option).toBe("value")
    },
  })
})

test("multiple custom agents can be defined", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        agent_a: {
          description: "Agent A",
          mode: "subagent",
        },
        agent_b: {
          description: "Agent B",
          mode: "primary",
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agentA = await AgentDef.get("agent_a")
      const agentB = await AgentDef.get("agent_b")
      expect(agentA?.description).toBe("Agent A")
      expect(agentA?.mode).toBe("subagent")
      expect(agentB?.description).toBe("Agent B")
      expect(agentB?.mode).toBe("primary")
    },
  })
})

test("AgentDef.get returns undefined for non-existent agent", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const nonExistent = await AgentDef.get("does_not_exist")
      expect(nonExistent).toBeUndefined()
    },
  })
})

test("default permission includes doom_loop and external_directory as ask", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(evalPerm(agent, "doom_loop")).toBe("ask")
      expect(evalPerm(agent, "external_directory")).toBe("ask")
    },
  })
})

test("webfetch is allowed by default", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(evalPerm(agent, "webfetch")).toBe("allow")
    },
  })
})

test("legacy tools config converts to permissions", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: {
          tools: {
            bash: false,
            read: false,
          },
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(evalPerm(agent, "bash")).toBe("deny")
      expect(evalPerm(agent, "read")).toBe("deny")
    },
  })
})

test("legacy tools config maps write/edit/patch/multiedit to edit permission", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: {
          tools: {
            write: false,
          },
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(evalPerm(agent, "edit")).toBe("deny")
    },
  })
})

test("Truncate.GLOB is allowed even when user denies external_directory globally", async () => {
  const { Truncate } = await import("../../src/tool/truncation")
  await using tmp = await tmpdir({
    config: {
      permission: {
        external_directory: "deny",
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(PermissionNext.evaluate("external_directory", Truncate.GLOB, agent!.permission).action).toBe("allow")
      expect(PermissionNext.evaluate("external_directory", Truncate.DIR, agent!.permission).action).toBe("deny")
      expect(PermissionNext.evaluate("external_directory", "/some/other/path", agent!.permission).action).toBe("deny")
    },
  })
})

test("Truncate.GLOB is allowed even when user denies external_directory per-agent", async () => {
  const { Truncate } = await import("../../src/tool/truncation")
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: {
          permission: {
            external_directory: "deny",
          },
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(PermissionNext.evaluate("external_directory", Truncate.GLOB, agent!.permission).action).toBe("allow")
      expect(PermissionNext.evaluate("external_directory", Truncate.DIR, agent!.permission).action).toBe("deny")
      expect(PermissionNext.evaluate("external_directory", "/some/other/path", agent!.permission).action).toBe("deny")
    },
  })
})

test("explicit Truncate.GLOB deny is respected", async () => {
  const { Truncate } = await import("../../src/tool/truncation")
  await using tmp = await tmpdir({
    config: {
      permission: {
        external_directory: {
          "*": "deny",
          [Truncate.GLOB]: "deny",
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.get("prototype")
      expect(PermissionNext.evaluate("external_directory", Truncate.GLOB, agent!.permission).action).toBe("deny")
      expect(PermissionNext.evaluate("external_directory", Truncate.DIR, agent!.permission).action).toBe("deny")
    },
  })
})

test("skill directories are allowed for external_directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".opencode", "skill", "perm-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: perm-skill
description: Permission skill.
---

# Permission Skill
`,
      )
    },
  })

  const home = process.env.OPENCODE_TEST_HOME
  process.env.OPENCODE_TEST_HOME = tmp.path

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agent = await AgentDef.get("prototype")
        const skillDir = path.join(tmp.path, ".opencode", "skill", "perm-skill")
        const target = path.join(skillDir, "reference", "notes.md")
        expect(PermissionNext.evaluate("external_directory", target, agent!.permission).action).toBe("allow")
      },
    })
  } finally {
    process.env.OPENCODE_TEST_HOME = home
  }
})

test("defaultAgent returns prototype when no default_agent config", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.defaultAgent()
      expect(agent).toBe("prototype")
    },
  })
})

test("defaultAgent respects default_agent config set to ask", async () => {
  await using tmp = await tmpdir({
    config: {
      default_agent: "ask",
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.defaultAgent()
      expect(agent).toBe("ask")
    },
  })
})

test("defaultAgent respects default_agent config set to custom agent with mode all", async () => {
  await using tmp = await tmpdir({
    config: {
      default_agent: "my_custom",
      agent: {
        my_custom: {
          description: "My custom agent",
        },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.defaultAgent()
      expect(agent).toBe("my_custom")
    },
  })
})

test("defaultAgent throws when default_agent points to subagent", async () => {
  await using tmp = await tmpdir({
    config: {
      default_agent: "explore",
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await expect(AgentDef.defaultAgent()).rejects.toThrow('default agent "explore" is a subagent')
    },
  })
})

test("defaultAgent throws when default_agent points to hidden agent", async () => {
  await using tmp = await tmpdir({
    config: {
      default_agent: "compaction",
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await expect(AgentDef.defaultAgent()).rejects.toThrow('default agent "compaction" is hidden')
    },
  })
})

test("defaultAgent throws when default_agent points to non-existent agent", async () => {
  await using tmp = await tmpdir({
    config: {
      default_agent: "does_not_exist",
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await expect(AgentDef.defaultAgent()).rejects.toThrow('default agent "does_not_exist" not found')
    },
  })
})

test("defaultAgent returns ask when prototype is disabled and default_agent not set", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: { disable: true },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await AgentDef.defaultAgent()
      // prototype is disabled, so it should return ask (next primary agent)
      expect(agent).toBe("ask")
    },
  })
})

test("defaultAgent throws when all primary agents are disabled", async () => {
  await using tmp = await tmpdir({
    config: {
      agent: {
        prototype: { disable: true },
        ask: { disable: true },
        specs: { disable: true },
        design: { disable: true },
      },
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      // prototype and ask are disabled, no primary-capable agents remain
      await expect(AgentDef.defaultAgent()).rejects.toThrow("no primary visible agent found")
    },
  })
})
