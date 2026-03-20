/**
 * Bridge between the SolidJS app and the Rust WASM canvas.
 * Manages WASM lifecycle, save/load per session, in-memory cache.
 *
 * The WASM canvas is a singleton — one <canvas> element shared across all
 * project shells. When projects switch, the canvas is moved to the active
 * project's container and state is saved/loaded accordingly.
 */

export const EMPTY_CANVAS_JSON =
  '{"nodes":[],"next_id":0,"viewport":{"x":-640,"y":-400,"zoom":1}}'

type WasmExports = {
  save_canvas_request: (callback: (json: string) => void) => void
  load_canvas_request: (json: string) => void
}

let wasm: WasmExports | null = null
let initialized = false
let canvasEl: HTMLCanvasElement | null = null

const canvasCache = new Map<string, string>()
let activeSessionId: string | undefined

export async function initCanvas(container: HTMLElement): Promise<boolean> {
  if (initialized) return true

  try {
    const mod = await import("@opencode-ai/canvas-wasm")
    await mod.default()

    canvasEl = container.querySelector("canvas")

    wasm = {
      save_canvas_request: mod.save_canvas_request,
      load_canvas_request: mod.load_canvas_request,
    }
    initialized = true
    return true
  } catch (e) {
    console.error("[canvas] Failed to initialize WASM:", e)
    return false
  }
}

export function isInitialized(): boolean {
  return initialized
}

/**
 * Adopt the singleton canvas element into the given container.
 * Called when a project becomes active — moves the canvas and loads state.
 */
export function adoptCanvas(container: HTMLElement, sessionId: string): void {
  if (!canvasEl) return
  if (canvasEl.parentElement !== container) {
    container.appendChild(canvasEl)
  }
  activeSessionId = sessionId
  // DOM move: winit may miss the new container size — one hard layout nudge.
  requestAnimationFrame(() => hardNudgeCanvasResize())
}

/**
 * Hard nudge after adopt/mount only — briefly toggles display so winit recalculates.
 */
function hardNudgeCanvasResize(): void {
  if (!canvasEl) return
  canvasEl.style.display = "none"
  void canvasEl.offsetHeight
  canvasEl.style.display = "block"
}

/**
 * Snapshot the current canvas state into the in-memory cache.
 * Called when a project becomes inactive — preserves state before
 * the canvas is moved to another project's container.
 */
export function snapshotToCache(): void {
  if (!wasm || !activeSessionId) return
  const sid = activeSessionId
  wasm.save_canvas_request((json) => {
    canvasCache.set(sid, json)
  })
}

export function setActiveSession(sessionId: string): void {
  activeSessionId = sessionId
}

export function saveCanvas(
  sessionId: string,
  callback: (json: string) => void,
): void {
  if (!wasm) {
    canvasCache.set(sessionId, EMPTY_CANVAS_JSON)
    callback(EMPTY_CANVAS_JSON)
    return
  }

  const expectedSession = sessionId
  wasm.save_canvas_request((json) => {
    if (activeSessionId !== expectedSession) return
    canvasCache.set(sessionId, json)
    callback(json)
  })

  requestAnimationFrame(() => {
    canvasEl?.focus?.()
  })
}

export function loadCanvas(json: string, sessionId?: string): void {
  if (sessionId) {
    canvasCache.set(sessionId, json)
    activeSessionId = sessionId
  }
  if (wasm) wasm.load_canvas_request(json)
}

export function getCachedCanvas(sessionId: string): string | null {
  return canvasCache.get(sessionId) ?? null
}

export function focusCanvas(): void {
  canvasEl?.focus?.()
}
