/**
 * Figma Selection State Manager
 *
 * Tracks the current Figma selection (file + node) received from the webview
 * preload bridge via IPC. Exposes state to MCP tools via getSelection().
 *
 * When initialised with a BrowserWindow + FigmaRestClient, selection changes
 * are debounced, enriched with node metadata, and forwarded to the renderer
 * via IPC ("figma:selection-updated" and "figma:selection-thumbnail").
 */

import type { BrowserWindow } from "electron"
import type { FigmaRestClient } from "./figma-rest-client.js"

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

let _win: BrowserWindow | null = null
let _client: FigmaRestClient | null = null
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 500
const THUMBNAIL_TIMEOUT_MS = 3000

// ─── IPC bridge ──────────────────────────────────────────────────────────────

export function initSelectionBridge(win: BrowserWindow, client: FigmaRestClient) {
  _win = win
  _client = client
}

function emitSelection(selection: FigmaSelection) {
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(async () => {
    if (!_win || _win.isDestroyed()) return

    let nodeName: string | null = null
    let nodeType: string | null = null

    if (_client && selection.fileKey && selection.nodeId) {
      try {
        const res = await _client.getFileNodes(selection.fileKey, [selection.nodeId])
        const node = res.nodes[selection.nodeId]?.document
        if (node) {
          nodeName = node.name
          nodeType = node.type
        }
      } catch {
        // Fallback: send without name/type
      }
    }

    const payload = {
      fileKey: selection.fileKey,
      nodeId: selection.nodeId,
      nodeName,
      nodeType,
      fileName: selection.fileName,
      url: selection.url,
    }
    _win.webContents.send("figma:selection-updated", payload)

    // Background thumbnail fetch
    if (_client && selection.fileKey && selection.nodeId) {
      const nodeId = selection.nodeId
      fetchThumbnail(selection.fileKey, nodeId)
    }
  }, DEBOUNCE_MS)
}

async function fetchThumbnail(fileKey: string, nodeId: string) {
  if (!_client || !_win || _win.isDestroyed()) return
  try {
    const res = await _client.getImage(fileKey, nodeId, { scale: 0.5, format: "png" })
    const imageUrl = res.images[nodeId]
    if (!imageUrl || !_win || _win.isDestroyed()) return

    // Fetch the actual image with a timeout and convert to base64
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS) })
    const buffer = await imgRes.arrayBuffer()
    const base64 = `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`
    _win.webContents.send("figma:selection-thumbnail", { nodeId, thumbnail: base64 })
  } catch {
    // Thumbnail is best-effort, skip on failure
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Returns a shallow copy of the current selection state. */
export function getSelection(): FigmaSelection {
  return { ..._selection }
}

/** Updates selection state (partial merge) and notifies all listeners. */
export function updateSelection(partial: Partial<FigmaSelection>): void {
  _selection = { ..._selection, ...partial }
  for (const cb of _listeners) cb(getSelection())
  emitSelection(_selection)
}

/**
 * Subscribe to selection changes.
 * Returns an unsubscribe function.
 */
export function onSelectionChange(callback: SelectionListener): () => void {
  _listeners.add(callback)
  return () => { _listeners.delete(callback) }
}
