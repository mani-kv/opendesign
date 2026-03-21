/**
 * Convert a token map to CSS custom properties.
 */
export function tokensToCss(tokens: Record<string, string>, prefix = "--od"): string {
  return Object.entries(tokens)
    .map(([name, value]) => {
      const varName = `${prefix}-${name.replace(/[./]/g, "-").toLowerCase()}`
      return `  ${varName}: ${value};`
    })
    .join("\n")
}

/**
 * Wrap tokens in a :root block.
 */
export function tokensToStylesheet(tokens: Record<string, string>, prefix = "--od"): string {
  const body = tokensToCss(tokens, prefix)
  return `:root {\n${body}\n}`
}

/**
 * Diff two token maps. Returns added, removed, and changed tokens.
 */
export function diffTokens(
  prev: Record<string, string>,
  next: Record<string, string>,
): { added: string[]; removed: string[]; changed: string[] } {
  const prevKeys = new Set(Object.keys(prev))
  const nextKeys = new Set(Object.keys(next))

  const added = [...nextKeys].filter((k) => !prevKeys.has(k))
  const removed = [...prevKeys].filter((k) => !nextKeys.has(k))
  const changed = [...prevKeys].filter((k) => nextKeys.has(k) && prev[k] !== next[k])

  return { added, removed, changed }
}
