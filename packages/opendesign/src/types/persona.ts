import z from "zod"

export const Persona = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }).optional(),
  language: z.string().optional(),
  rtl: z.boolean().optional(),
  a11y: z
    .object({
      colorBlindness: z.enum(["none", "protanopia", "deuteranopia", "tritanopia"]).optional(),
      reducedMotion: z.boolean().optional(),
      screenReader: z.boolean().optional(),
    })
    .optional(),
  network: z.enum(["fast", "slow-3g", "offline"]).optional(),
})
export type Persona = z.infer<typeof Persona>
