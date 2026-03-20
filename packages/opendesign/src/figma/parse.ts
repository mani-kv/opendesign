/** Figma URL types that map to embed paths */
type FigmaType = "design" | "file" | "proto" | "board"

const FIGMA_URL = /(?:https?:\/\/)?(?:www\.)?figma\.com\/(design|file|proto|board)\/([a-zA-Z0-9_-]+)/i

/**
 * Parse a Figma URL and return the file key and embed type.
 * Supports: design, file, proto, board.
 */
export function parseFigmaUrl(url: string): { key: string; type: FigmaType } | null {
  const m = url.trim().match(FIGMA_URL)
  if (!m) return null
  return { key: m[2], type: m[1].toLowerCase() as FigmaType }
}

/** /file/ URLs embed as design */
const EMBED_TYPE: Record<FigmaType, string> = {
  design: "design",
  file: "design",
  proto: "proto",
  board: "board",
}

/**
 * Build embed URL for a Figma file key.
 * embed-host is required by Figma.
 */
export function buildFigmaEmbedUrl(key: string, type: FigmaType = "design", host = "opendesign"): string {
  const embedType = EMBED_TYPE[type]
  const params = new URLSearchParams({ "embed-host": host })
  return `https://embed.figma.com/${embedType}/${key}?${params.toString()}`
}
