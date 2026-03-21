import { test, expect } from "bun:test"
import { parsePreFlightPlan, scenarioBranchName, selectedScenarios } from "../../src/agent/orchestrator"

test("parsePreFlightPlan parses valid JSON block from markdown", () => {
  const text = `Here is the plan:

\`\`\`json
{
  "scenarios": [
    { "scenario": "Dark Mode", "description": "A dark themed variant", "selected": true },
    { "scenario": "Light Mode", "description": "A light themed variant", "selected": false }
  ],
  "summary": "Two theme variants"
}
\`\`\`

Let me know if you want to proceed.`

  const result = parsePreFlightPlan(text)
  expect(result).not.toBeNull()
  expect(result!.scenarios).toHaveLength(2)
  expect(result!.scenarios[0].scenario).toBe("Dark Mode")
  expect(result!.scenarios[0].selected).toBe(true)
  expect(result!.scenarios[1].selected).toBe(false)
  expect(result!.summary).toBe("Two theme variants")
})

test("parsePreFlightPlan parses plain JSON without code fence", () => {
  const text = `{"scenarios": [{"scenario": "Minimal", "description": "Bare bones"}]}`
  const result = parsePreFlightPlan(text)
  expect(result).not.toBeNull()
  expect(result!.scenarios).toHaveLength(1)
  expect(result!.scenarios[0].selected).toBe(true) // default
})

test("parsePreFlightPlan returns null for invalid input", () => {
  expect(parsePreFlightPlan("no json here")).toBeNull()
  expect(parsePreFlightPlan("```json\n{invalid}\n```")).toBeNull()
  expect(parsePreFlightPlan("")).toBeNull()
})

test("scenarioBranchName generates slug correctly", () => {
  expect(scenarioBranchName("Dark Mode")).toBe("agent/dark-mode")
  expect(scenarioBranchName("Hello World!", "feature")).toBe("feature/hello-world")
})

test("scenarioBranchName handles special characters", () => {
  expect(scenarioBranchName("@#$%^&*()")).toBe("agent/")
  expect(scenarioBranchName("  spaces  everywhere  ")).toBe("agent/spaces-everywhere")
})

test("scenarioBranchName truncates long names", () => {
  const long = "a".repeat(100)
  const result = scenarioBranchName(long)
  expect(result.length).toBeLessThanOrEqual(50 + "agent/".length)
})

test("selectedScenarios filters only selected", () => {
  const plan = {
    scenarios: [
      { scenario: "A", description: "first", selected: true },
      { scenario: "B", description: "second", selected: false },
      { scenario: "C", description: "third", selected: true },
    ],
  }
  const result = selectedScenarios(plan)
  expect(result).toHaveLength(2)
  expect(result[0].scenario).toBe("A")
  expect(result[1].scenario).toBe("C")
})

test("selectedScenarios returns empty array when none selected", () => {
  const plan = {
    scenarios: [{ scenario: "A", description: "first", selected: false }],
  }
  expect(selectedScenarios(plan)).toHaveLength(0)
})
