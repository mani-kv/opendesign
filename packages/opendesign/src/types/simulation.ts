import z from "zod"

export const ViewportPreset = z.object({
  name: z.string(),
  width: z.number(),
  height: z.number(),
})
export type ViewportPreset = z.infer<typeof ViewportPreset>

export const A11yFilter = z.enum([
  "none",
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "reduced-motion",
  "high-contrast",
])
export type A11yFilter = z.infer<typeof A11yFilter>

export const SimulationMode = z.object({
  viewport: ViewportPreset.optional(),
  a11yFilter: A11yFilter.optional(),
  language: z.string().optional(),
  rtl: z.boolean().optional(),
  network: z.enum(["fast", "slow-3g", "offline"]).optional(),
})
export type SimulationMode = z.infer<typeof SimulationMode>
