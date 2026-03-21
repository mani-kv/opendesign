import z from "zod"

export const ScenarioPlan = z.object({
  scenario: z.string(),
  description: z.string(),
  frames: z.array(z.string()).optional(),
  selected: z.boolean().default(true),
})
export type ScenarioPlan = z.infer<typeof ScenarioPlan>

export const PreFlightPlan = z.object({
  scenarios: z.array(ScenarioPlan),
  summary: z.string().optional(),
})
export type PreFlightPlan = z.infer<typeof PreFlightPlan>

/**
 * Parse a pre-flight plan from agent text output.
 * Expects JSON block in the agent's response.
 */
export function parsePreFlightPlan(text: string): PreFlightPlan | null {
  // Try to find JSON block in text
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  const raw = jsonMatch ? jsonMatch[1] : text.trim()

  try {
    const parsed = JSON.parse(raw)
    return PreFlightPlan.parse(parsed)
  } catch {
    return null
  }
}

/**
 * Generate branch name for a scenario.
 */
export function scenarioBranchName(scenario: string, prefix = "agent"): string {
  const slug = scenario
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
  return `${prefix}/${slug}`
}

/**
 * Filter selected scenarios from a pre-flight plan.
 */
export function selectedScenarios(plan: PreFlightPlan): ScenarioPlan[] {
  return plan.scenarios.filter((s) => s.selected)
}
