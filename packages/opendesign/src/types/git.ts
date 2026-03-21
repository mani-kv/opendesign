import z from "zod"

export const BranchInfo = z.object({
  name: z.string(),
  agentNodeId: z.string(),
  scenario: z.string(),
  baseBranch: z.string(),
  createdAt: z.number(),
})
export type BranchInfo = z.infer<typeof BranchInfo>

export const CheckpointInfo = z.object({
  id: z.string(),
  branch: z.string(),
  commitSha: z.string(),
  label: z.string(),
  createdAt: z.number(),
})
export type CheckpointInfo = z.infer<typeof CheckpointInfo>

export const MergeResult = z.object({
  success: z.boolean(),
  resultBranch: z.string(),
  conflicts: z
    .array(
      z.object({
        file: z.string(),
        type: z.enum(["visual", "code"]),
      }),
    )
    .optional(),
})
export type MergeResult = z.infer<typeof MergeResult>
