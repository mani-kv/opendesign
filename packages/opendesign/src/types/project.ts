import z from "zod"

export const OpenDesignProject = z.object({
  id: z.string(),
  name: z.string(),
  directory: z.string(),
  figmaFileKey: z.string().optional(),
  designSystemId: z.string().optional(),
  componentPackage: z.string().optional(),
  createdAt: z.number(),
})
export type OpenDesignProject = z.infer<typeof OpenDesignProject>
