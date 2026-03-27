import { test, expect } from "bun:test"
import { agentColor } from "../../src/agent/color"

test("returns default color for prototype", () => {
  expect(agentColor("prototype")).toBe("var(--icon-agent-build-base)")
})

test("returns default color for ask", () => {
  expect(agentColor("ask")).toBe("var(--icon-agent-ask-base)")
})

test("returns custom color when provided", () => {
  expect(agentColor("prototype", "#FF0000")).toBe("#FF0000")
})

test("returns undefined for unknown agent", () => {
  expect(agentColor("unknown")).toBeUndefined()
})
