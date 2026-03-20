import { test, expect } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Config } from "../../src/config/config"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { Color } from "../../src/util/color"

test("agent color parsed from project config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            "opendesign-agent": { color: "#FFA500" },
            "opendesign-ask": { color: "primary" },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const cfg = await Config.get()
      expect(cfg.agent?.["opendesign-agent"]?.color).toBe("#FFA500")
      expect(cfg.agent?.["opendesign-ask"]?.color).toBe("primary")
    },
  })
})

test("Agent.get includes color from config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            "opendesign-ask": { color: "#A855F7" },
            "opendesign-agent": { color: "accent" },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const ask = await AgentSvc.get("opendesign-ask")
      expect(ask?.color).toBe("#A855F7")
      const agent = await AgentSvc.get("opendesign-agent")
      expect(agent?.color).toBe("accent")
    },
  })
})

test("Color.hexToAnsiBold converts valid hex to ANSI", () => {
  const result = Color.hexToAnsiBold("#FFA500")
  expect(result).toBe("\x1b[38;2;255;165;0m\x1b[1m")
})

test("Color.hexToAnsiBold returns undefined for invalid hex", () => {
  expect(Color.hexToAnsiBold(undefined)).toBeUndefined()
  expect(Color.hexToAnsiBold("")).toBeUndefined()
  expect(Color.hexToAnsiBold("#FFF")).toBeUndefined()
  expect(Color.hexToAnsiBold("FFA500")).toBeUndefined()
  expect(Color.hexToAnsiBold("#GGGGGG")).toBeUndefined()
})
