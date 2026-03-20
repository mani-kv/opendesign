import z from "zod"

export const TokenSet = z.object({
  id: z.string(),
  name: z.string(),
  tokens: z.record(z.string(), z.string()),
  lastSynced: z.number().optional(),
})
export type TokenSet = z.infer<typeof TokenSet>

export const ComponentRef = z.object({
  name: z.string(),
  packageName: z.string(),
  importPath: z.string(),
  variants: z.array(z.string()).optional(),
  figmaNodeId: z.string().optional(),
})
export type ComponentRef = z.infer<typeof ComponentRef>

export const DesignSystemEntry = z.object({
  id: z.string(),
  name: z.string(),
  packageName: z.string().optional(),
  tokens: TokenSet,
  components: z.array(ComponentRef),
})
export type DesignSystemEntry = z.infer<typeof DesignSystemEntry>
