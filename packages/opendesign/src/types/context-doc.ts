import z from "zod"

export const ContextDocType = z.enum(["markdown", "text", "pdf", "image"])
export type ContextDocType = z.infer<typeof ContextDocType>

export const ContextDocument = z.object({
  id: z.string(),
  name: z.string(),
  type: ContextDocType,
  path: z.string(),
  addedAt: z.number(),
  indexed: z.boolean(),
})
export type ContextDocument = z.infer<typeof ContextDocument>
