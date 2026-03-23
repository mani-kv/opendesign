/**
 * Figma Selection State Manager
 *
 * Tracks the current Figma selection (file + node). Exposes state to the
 * WebSocket server and MCP tools via getSelection().
 */

export interface FigmaSelection {
  fileKey: string | null
  nodeId: string | null
  url: string | null
  fileName: string | null
}

export interface ParsedFigmaSelection {
  fileKey: string
  nodeId: string | null
  fileName: string | null
}

type SelectionListener = (selection: FigmaSelection) => void

// Regex matching /file/KEY or /design/KEY — same pattern as packages/app/src/utils/figma.ts
const FIGMA_URL = /(?:https?:\/\/)?(?:www\.)?figma\.com\/(?:design|file|proto|board)\/([a-zA-Z0-9_-]+)(?:\/([^?#]*))?/i

// Normalise node-id: Figma uses both "1-2" (hyphen) and "1:2" (colon / %3A)
function normalizeNodeId(raw: string): string {
  return decodeURIComponent(raw).replace(/-/g, ":").trim()
}

/**
 * Parse a Figma URL and extract fileKey, nodeId, and fileName.
 * Handles:
 *   https://www.figma.com/file/ABC123/filename?node-id=1-2
 *   https://www.figma.com/design/ABC123/filename?node-id=1%3A2
 *   https://www.figma.com/file/ABC123/filename#node-id=1-2
 */
export function parseSelectionFromUrl(url: string): ParsedFigmaSelection | null {
  const trimmed = url.trim()
  const m = trimmed.match(FIGMA_URL)
  if (!m) return null

  const fileKey = m[1]
  const rawFileName = m[2] ? decodeURIComponent(m[2]).replace(/-/g, " ").trim() || null : null

  // Try query string first, then hash fragment
  let nodeId: string | null = null

  try {
    const parsed = new URL(trimmed)

    const fromQuery = parsed.searchParams.get("node-id")
    if (fromQuery) {
      nodeId = normalizeNodeId(fromQuery)
    } else {
      // Hash: #node-id=1-2
      const hash = parsed.hash.replace(/^#/, "")
      const hashParams = new URLSearchParams(hash)
      const fromHash = hashParams.get("node-id")
      if (fromHash) nodeId = normalizeNodeId(fromHash)
    }
  } catch {
    // Malformed URL — skip node-id extraction, still return fileKey
  }

  return { fileKey, nodeId, fileName: rawFileName }
}

// ─── Module state ────────────────────────────────────────────────────────────

let _selection: FigmaSelection = {
  fileKey: null,
  nodeId: null,
  url: null,
  fileName: null,
}

const _listeners = new Set<SelectionListener>()

// ─── Public API ──────────────────────────────────────────────────────────────

/** Returns a shallow copy of the current selection state. */
export function getSelection(): FigmaSelection {
  return { ..._selection }
}

/** Updates selection state (partial merge) and notifies all listeners. */
export function updateSelection(partial: Partial<FigmaSelection>): void {
  _selection = { ..._selection, ...partial }
  for (const cb of _listeners) cb(getSelection())
}

/**
 * Subscribe to selection changes.
 * Returns an unsubscribe function.
 */
export function onSelectionChange(callback: SelectionListener): () => void {
  _listeners.add(callback)
  return () => { _listeners.delete(callback) }
}
