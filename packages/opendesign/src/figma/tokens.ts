import type { FigmaTokenRef } from "../types/figma"

/**
 * Convert Figma token refs to a flat token map (name -> value).
 */
export function tokensToMap(refs: FigmaTokenRef[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const ref of refs) {
    const key = `${ref.collection}/${ref.name}`
    result[key] = ref.value
  }
  return result
}

/**
 * Convert Figma token refs to CSS custom properties.
 */
export function tokensToCssVars(refs: FigmaTokenRef[], prefix = "--figma"): string {
  return refs
    .map((ref) => {
      const name = `${prefix}-${ref.collection}-${ref.name}`
        .replace(/[./\s]+/g, "-")
        .toLowerCase()
      return `  ${name}: ${ref.value};`
    })
    .join("\n")
}

/**
 * Generate a complete tokens.css file from Figma tokens.
 */
export function generateTokensCss(refs: FigmaTokenRef[], prefix = "--figma"): string {
  const vars = tokensToCssVars(refs, prefix)
  return `:root {\n${vars}\n}`
}

/**
 * Group tokens by type for organized display.
 */
export function groupTokensByType(refs: FigmaTokenRef[]): Record<string, FigmaTokenRef[]> {
  const result: Record<string, FigmaTokenRef[]> = {}
  for (const ref of refs) {
    if (!result[ref.type]) result[ref.type] = []
    result[ref.type].push(ref)
  }
  return result
}
