import type { BranchInfo } from "../types/git"

/**
 * Generate a branch name for an agent scenario.
 */
export function agentBranchName(scenario: string, prefix = "agent"): string {
  const slug = scenario
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
  return `${prefix}/${slug}`
}

/**
 * Create branch info metadata.
 */
export function createBranchInfo(input: { agentNodeId: string; scenario: string; baseBranch?: string }): BranchInfo {
  return {
    name: agentBranchName(input.scenario),
    agentNodeId: input.agentNodeId,
    scenario: input.scenario,
    baseBranch: input.baseBranch ?? "main",
    createdAt: Date.now(),
  }
}

/**
 * Validate a branch name is safe for git.
 */
export function isValidBranchName(name: string): boolean {
  if (!name || name.length > 100) return false
  if (name.startsWith("-") || name.endsWith(".lock")) return false
  if (/[\s~^:?*\[\\]/.test(name)) return false
  if (name.includes("..") || name.includes("@{")) return false
  return true
}

/**
 * List branches that belong to a specific agent.
 */
export function filterAgentBranches(branches: BranchInfo[], agentNodeId: string): BranchInfo[] {
  return branches.filter((b) => b.agentNodeId === agentNodeId)
}
