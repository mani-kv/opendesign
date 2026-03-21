import type { SandpackFileMap } from "../types/sandpack"

/**
 * Convert a record of file paths and contents to SandpackFileMap.
 * Paths are normalized to start with /.
 */
export function toSandpackFileMap(
  files: Record<string, string>,
  options?: { hiddenPatterns?: string[] },
): SandpackFileMap {
  const hidden = options?.hiddenPatterns ?? ["node_modules", "package-lock", ".git"]
  const result: SandpackFileMap = {}

  for (const [path, code] of Object.entries(files)) {
    const normalized = path.startsWith("/") ? path : `/${path}`
    const isHidden = hidden.some((p) => normalized.includes(p))
    result[normalized] = { code, hidden: isHidden || undefined }
  }

  return result
}

/**
 * Extract the entry file path from a file map.
 * Looks for common React entry points.
 */
export function detectEntryFile(files: SandpackFileMap): string {
  const candidates = ["/src/App.tsx", "/src/App.jsx", "/src/App.ts", "/src/App.js", "/src/index.tsx", "/src/index.jsx"]
  for (const c of candidates) {
    if (files[c]) return c
  }
  // Fallback to first .tsx or .jsx file
  const first = Object.keys(files).find((k) => k.endsWith(".tsx") || k.endsWith(".jsx"))
  return first ?? "/src/App.tsx"
}
