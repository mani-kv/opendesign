import type { CanvasState } from "./types"

const STORAGE_KEY = (featureId: string) => `opendesign.canvas.${featureId}`

const DEFAULT_STATE: CanvasState = {
  viewport: { tx: 0, ty: 0, scale: 1 },
  items: [],
}

function serverUrl(): string {
  if (import.meta.env.VITE_OPENCODE_SERVER_HOST)
    return `http://${import.meta.env.VITE_OPENCODE_SERVER_HOST}:${import.meta.env.VITE_OPENCODE_SERVER_PORT || 4096}`
  if (import.meta.env.DEV) return `http://localhost:4096`
  return window.location.origin
}

function parseState(raw: unknown): CanvasState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STATE, items: [] }
  const obj = raw as Record<string, unknown>
  return {
    viewport:
      obj.viewport && typeof obj.viewport === "object"
        ? (obj.viewport as CanvasState["viewport"])
        : { ...DEFAULT_STATE.viewport },
    items: Array.isArray(obj.items) ? obj.items : [],
  }
}

/** Read canvas state from localStorage as a fast synchronous fallback. */
export function loadCanvasStateSync(featureId: string): CanvasState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(featureId))
    if (!raw) return { ...DEFAULT_STATE, viewport: { ...DEFAULT_STATE.viewport }, items: [] }
    return parseState(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_STATE, viewport: { ...DEFAULT_STATE.viewport }, items: [] }
  }
}

/** Load canvas state from backend API, falling back to localStorage if unavailable. */
export async function loadCanvasState(featureId: string, directory?: string): Promise<CanvasState> {
  try {
    const dirParam = directory ? `?directory=${encodeURIComponent(directory)}` : ""
    const res = await fetch(`${serverUrl()}/feature/${featureId}/canvas${dirParam}`)
    if (res.ok) {
      const contentType = res.headers.get("content-type") ?? ""
      if (contentType.includes("application/json")) {
        const data = await res.json()
        if (data) {
          const state = parseState(data)
          try { localStorage.setItem(STORAGE_KEY(featureId), JSON.stringify(state)) } catch {}
          return state
        }
      }
    }
  } catch {
    // Network unavailable — fall through to localStorage
  }
  return loadCanvasStateSync(featureId)
}

/** Save canvas state to backend API and localStorage cache. */
export async function saveCanvasState(featureId: string, state: CanvasState, directory?: string): Promise<void> {
  try { localStorage.setItem(STORAGE_KEY(featureId), JSON.stringify(state)) } catch {}
  try {
    const dirParam = directory ? `?directory=${encodeURIComponent(directory)}` : ""
    await fetch(`${serverUrl()}/feature/${featureId}/canvas${dirParam}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    })
  } catch {
    // Network unavailable — localStorage already saved above
  }
}
