import type { MergeResult } from "../types/git"

/**
 * Create a successful merge result.
 */
export function successMerge(resultBranch: string): MergeResult {
  return { success: true, resultBranch }
}

/**
 * Create a merge result with conflicts.
 */
export function conflictMerge(
  resultBranch: string,
  conflicts: { file: string; type: "visual" | "code" }[],
): MergeResult {
  return { success: false, resultBranch, conflicts }
}

/**
 * Separate visual conflicts (need designer review) from code conflicts (auto-resolvable).
 */
export function categorizeConflicts(result: MergeResult): {
  visual: { file: string }[]
  code: { file: string }[]
} {
  const visual = (result.conflicts ?? []).filter((c) => c.type === "visual")
  const code = (result.conflicts ?? []).filter((c) => c.type === "code")
  return { visual, code }
}
