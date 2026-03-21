import type { CheckpointInfo } from "../types/git"

/**
 * Create checkpoint metadata.
 */
export function createCheckpointInfo(input: {
  branch: string
  commitSha: string
  label?: string
}): CheckpointInfo {
  return {
    id: `cp_${Date.now().toString(36)}`,
    branch: input.branch,
    commitSha: input.commitSha,
    label: input.label ?? `Checkpoint ${new Date().toISOString().slice(0, 16)}`,
    createdAt: Date.now(),
  }
}

/**
 * Sort checkpoints by creation time, newest first.
 */
export function sortCheckpoints(checkpoints: CheckpointInfo[]): CheckpointInfo[] {
  return [...checkpoints].sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Find the latest checkpoint for a branch.
 */
export function latestCheckpoint(checkpoints: CheckpointInfo[], branch: string): CheckpointInfo | undefined {
  return sortCheckpoints(checkpoints.filter((c) => c.branch === branch))[0]
}
