import { test, expect } from "bun:test"
import { agentBranchName, isValidBranchName, createBranchInfo, filterAgentBranches } from "../../src/git/branch"
import type { BranchInfo } from "../../src/types/git"

test("agentBranchName: generates correct slug", () => {
  expect(agentBranchName("Dark Mode Variant")).toBe("agent/dark-mode-variant")
  expect(agentBranchName("Hello World!", "feat")).toBe("feat/hello-world")
})

test("agentBranchName: strips leading/trailing hyphens", () => {
  expect(agentBranchName("---test---")).toBe("agent/test")
})

test("agentBranchName: truncates to 50 chars for slug", () => {
  const long = "a".repeat(100)
  const result = agentBranchName(long)
  // "agent/" (6) + 50 = 56 total
  expect(result).toBe(`agent/${"a".repeat(50)}`)
})

test("isValidBranchName: accepts valid names", () => {
  expect(isValidBranchName("main")).toBe(true)
  expect(isValidBranchName("feature/login")).toBe(true)
  expect(isValidBranchName("agent/dark-mode")).toBe(true)
  expect(isValidBranchName("v1.0.0")).toBe(true)
})

test("isValidBranchName: rejects invalid names", () => {
  expect(isValidBranchName("")).toBe(false)
  expect(isValidBranchName("-starts-with-dash")).toBe(false)
  expect(isValidBranchName("ends.lock")).toBe(false)
  expect(isValidBranchName("has space")).toBe(false)
  expect(isValidBranchName("has~tilde")).toBe(false)
  expect(isValidBranchName("has^caret")).toBe(false)
  expect(isValidBranchName("has:colon")).toBe(false)
  expect(isValidBranchName("has?question")).toBe(false)
  expect(isValidBranchName("has*star")).toBe(false)
  expect(isValidBranchName("has[bracket")).toBe(false)
  expect(isValidBranchName("has\\backslash")).toBe(false)
  expect(isValidBranchName("has..double-dot")).toBe(false)
  expect(isValidBranchName("has@{ref")).toBe(false)
  expect(isValidBranchName("a".repeat(101))).toBe(false)
})

test("createBranchInfo: creates correct metadata", () => {
  const before = Date.now()
  const info = createBranchInfo({
    agentNodeId: "node-1",
    scenario: "Dark Mode",
  })
  expect(info.name).toBe("agent/dark-mode")
  expect(info.agentNodeId).toBe("node-1")
  expect(info.scenario).toBe("Dark Mode")
  expect(info.baseBranch).toBe("main")
  expect(info.createdAt).toBeGreaterThanOrEqual(before)
})

test("createBranchInfo: uses custom baseBranch", () => {
  const info = createBranchInfo({
    agentNodeId: "node-1",
    scenario: "test",
    baseBranch: "develop",
  })
  expect(info.baseBranch).toBe("develop")
})

test("filterAgentBranches: filters by agentNodeId", () => {
  const branches: BranchInfo[] = [
    { name: "agent/a", agentNodeId: "n1", scenario: "a", baseBranch: "main", createdAt: 1 },
    { name: "agent/b", agentNodeId: "n2", scenario: "b", baseBranch: "main", createdAt: 2 },
    { name: "agent/c", agentNodeId: "n1", scenario: "c", baseBranch: "main", createdAt: 3 },
  ]
  const filtered = filterAgentBranches(branches, "n1")
  expect(filtered).toHaveLength(2)
  expect(filtered[0].scenario).toBe("a")
  expect(filtered[1].scenario).toBe("c")
})
