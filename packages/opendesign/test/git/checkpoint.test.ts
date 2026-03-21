import { test, expect } from "bun:test"
import { createCheckpointInfo, sortCheckpoints, latestCheckpoint } from "../../src/git/checkpoint"
import type { CheckpointInfo } from "../../src/types/git"

test("createCheckpointInfo: generates id and label", () => {
  const cp = createCheckpointInfo({
    branch: "agent/dark-mode",
    commitSha: "abc123",
  })
  expect(cp.id).toMatch(/^cp_/)
  expect(cp.branch).toBe("agent/dark-mode")
  expect(cp.commitSha).toBe("abc123")
  expect(cp.label).toMatch(/^Checkpoint /)
  expect(cp.createdAt).toBeGreaterThan(0)
})

test("createCheckpointInfo: uses custom label", () => {
  const cp = createCheckpointInfo({
    branch: "main",
    commitSha: "def456",
    label: "Before refactor",
  })
  expect(cp.label).toBe("Before refactor")
})

test("sortCheckpoints: sorts newest first", () => {
  const checkpoints: CheckpointInfo[] = [
    { id: "cp_1", branch: "a", commitSha: "a1", label: "first", createdAt: 100 },
    { id: "cp_2", branch: "a", commitSha: "a2", label: "third", createdAt: 300 },
    { id: "cp_3", branch: "a", commitSha: "a3", label: "second", createdAt: 200 },
  ]
  const sorted = sortCheckpoints(checkpoints)
  expect(sorted[0].createdAt).toBe(300)
  expect(sorted[1].createdAt).toBe(200)
  expect(sorted[2].createdAt).toBe(100)
  // original is not mutated
  expect(checkpoints[0].createdAt).toBe(100)
})

test("latestCheckpoint: returns latest for branch", () => {
  const checkpoints: CheckpointInfo[] = [
    { id: "cp_1", branch: "a", commitSha: "a1", label: "old", createdAt: 100 },
    { id: "cp_2", branch: "b", commitSha: "b1", label: "other", createdAt: 500 },
    { id: "cp_3", branch: "a", commitSha: "a2", label: "new", createdAt: 300 },
  ]
  const latest = latestCheckpoint(checkpoints, "a")
  expect(latest?.id).toBe("cp_3")
  expect(latest?.createdAt).toBe(300)
})

test("latestCheckpoint: returns undefined for missing branch", () => {
  const checkpoints: CheckpointInfo[] = [
    { id: "cp_1", branch: "a", commitSha: "a1", label: "x", createdAt: 100 },
  ]
  expect(latestCheckpoint(checkpoints, "nonexistent")).toBeUndefined()
})
