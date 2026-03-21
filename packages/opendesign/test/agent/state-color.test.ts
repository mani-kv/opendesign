import { expect, test, describe } from "bun:test"
import { stateColor } from "../../src/agent/color"

describe("stateColor", () => {
  test("returns a color for each agent state", () => {
    const states = ["created", "working", "waiting", "ready", "approved", "archived"] as const
    for (const state of states) {
      const color = stateColor(state)
      expect(color).toBeTypeOf("string")
      expect(color.length).toBeGreaterThan(0)
    }
  })

  test("returns distinct colors for active vs terminal states", () => {
    expect(stateColor("working")).not.toBe(stateColor("archived"))
    expect(stateColor("ready")).not.toBe(stateColor("created"))
  })

  test("returns fallback for unknown state", () => {
    expect(stateColor("unknown" as any)).toBeTypeOf("string")
  })
})
