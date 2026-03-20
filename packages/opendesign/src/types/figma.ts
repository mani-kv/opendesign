import z from "zod"

export const FigmaFrame = z.object({
  nodeId: z.string(),
  name: z.string(),
  fileKey: z.string(),
  thumbnailUrl: z.string().optional(),
  width: z.number(),
  height: z.number(),
})
export type FigmaFrame = z.infer<typeof FigmaFrame>

export const FigmaSelection = z.object({
  frames: z.array(FigmaFrame),
  fileKey: z.string(),
  fileName: z.string().optional(),
})
export type FigmaSelection = z.infer<typeof FigmaSelection>

export const FigmaTokenRef = z.object({
  collection: z.string(),
  name: z.string(),
  type: z.enum(["color", "spacing", "typography", "radius", "shadow", "opacity"]),
  value: z.string(),
  mode: z.string().optional(),
})
export type FigmaTokenRef = z.infer<typeof FigmaTokenRef>
