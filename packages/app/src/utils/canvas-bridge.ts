/**
 * Bridge between the SolidJS app and the Rust WASM canvas.
 * Manages WASM lifecycle, save/load per session, in-memory cache.
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
  if (initialized) {
    // WASM already running — re-adopt the canvas into the new container.
    // This happens when the component re-mounts (e.g. project navigation)
    // but the WASM singleton + its <canvas> element are still alive.
    if (canvasEl && canvasEl.parentElement !== container) {
      container.appendChild(canvasEl)
    }
    return true
  }

  try {
    const mod = await import("@opencode-ai/canvas-wasm")
    await mod.default()

    // Grab the canvas element created by the WASM module
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
