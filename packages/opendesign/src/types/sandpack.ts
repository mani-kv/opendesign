import z from "zod"

export const SandpackFileMap = z.record(
  z.string(),
  z.object({
    code: z.string(),
    hidden: z.boolean().optional(),
    active: z.boolean().optional(),
    readOnly: z.boolean().optional(),
  }),
)
export type SandpackFileMap = z.infer<typeof SandpackFileMap>

export const SandpackInstance = z.object({
  id: z.string(),
  agentNodeId: z.string(),
  branch: z.string(),
  files: SandpackFileMap,
  entryFile: z.string(),
})
export type SandpackInstance = z.infer<typeof SandpackInstance>
