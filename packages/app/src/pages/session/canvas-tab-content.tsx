import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js"
import { useProjectParams } from "@/context/project-scope"
import { useSDK } from "@/context/sdk"
import { useProjectActive } from "@/components/project-shell"
import {
  initCanvas,
  adoptCanvas,
  snapshotToCache,
  loadCanvas,
  saveCanvas,
  getCachedCanvas,
  triggerCanvasResize,
  EMPTY_CANVAS_JSON,
} from "@/utils/canvas-bridge"

export function CanvasTabContent() {
  const params = useProjectParams()
  const sdk = useSDK()
  const isActive = useProjectActive()
  const [ready, setReady] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  let containerRef: HTMLDivElement | undefined
  let saveTimer: number | undefined

  const sessionId = () => params.id ?? params.projectId

  // One-time WASM initialization on first mount
  onMount(async () => {
    if (!containerRef) return
    const ok = await initCanvas(containerRef)
    if (!ok) {
      setError("WebGPU is not supported in this browser. Please use Chrome, Edge, or Safari.")
      setLoading(false)
      return
    }
    setReady(true)
  })

  // React to this project becoming active/inactive.
  // This is the primary mechanism for project switching — the ProjectPool
  // keeps all shells alive and toggles `active` reactively.
  createEffect(() => {
    if (!ready() || !containerRef) return
    const active = isActive()
    const sid = sessionId()
    if (active && sid) {
      adoptCanvas(containerRef, sid)
      loadSessionCanvas(sid)
    } else if (!active) {
      snapshotToCache()
    }
  })

  const loadSessionCanvas = async (sid: string) => {
    const cached = getCachedCanvas(sid)
    if (cached) {
      loadCanvas(cached, sid)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const res = await sdk.client.session.canvas.get({ sessionID: sid })
      if (res.data?.state) {
        loadCanvas(res.data.state, sid)
        setLoading(false)
        return
      }
    } catch {
      // No saved state — start empty
    }

    loadCanvas(EMPTY_CANVAS_JSON, sid)
    setLoading(false)
  }

  const saveSessionCanvas = (sid: string) => {
    saveCanvas(sid, async (json) => {
      try {
        await sdk.client.session.canvas.put({ sessionID: sid, state: json })
      } catch {
        // Save failed — cached locally, will retry
      }
    })
  }

  // Auto-save every 5 seconds of inactivity
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      const sid = sessionId()
      if (sid && ready() && isActive()) saveSessionCanvas(sid)
    }, 5000)
  }

  onMount(() => {
    const handler = () => scheduleSave()
    containerRef?.addEventListener("pointerup", handler)
    containerRef?.addEventListener("keyup", handler)

    // Watch for container size changes (tab↔split toggle, split ratio drag)
    // and nudge winit's ResizeObserver so the canvas re-evaluates its size.
    let ro: ResizeObserver | undefined
    if (containerRef) {
      ro = new ResizeObserver(() => triggerCanvasResize())
      ro.observe(containerRef)
    }

    onCleanup(() => {
      containerRef?.removeEventListener("pointerup", handler)
      containerRef?.removeEventListener("keyup", handler)
      if (saveTimer) clearTimeout(saveTimer)
      ro?.disconnect()
    })
  })

  // Handle session switching within the same project
  createEffect(
    on(sessionId, (newId, oldId) => {
      if (!ready() || !isActive() || !newId) return
      if (oldId && oldId !== newId) saveSessionCanvas(oldId)
      loadSessionCanvas(newId)
    }),
  )

  return (
    <div class="relative size-full">
      {error() ? (
        <div class="h-full flex items-center justify-center p-6">
          <div class="text-14-regular text-text-weak text-center max-w-80">
            {error()}
          </div>
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            id="canvas-container"
            class="absolute inset-0"
            style={{ "touch-action": "none" }}
          />
          <Show when={loading()}>
            <div
              class="absolute inset-0 z-10 flex flex-col gap-3 bg-background-base p-4"
              aria-hidden
            >
              <div class="flex items-center gap-2 px-2">
                <div class="h-6 w-6 rounded bg-surface-raised-base opacity-50 animate-pulse" />
                <div class="h-6 w-6 rounded bg-surface-raised-base opacity-50 animate-pulse" />
                <div class="h-6 w-6 rounded bg-surface-raised-base opacity-50 animate-pulse" />
                <div class="flex-1" />
                <div class="h-6 w-20 rounded bg-surface-raised-base opacity-50 animate-pulse" />
              </div>
              <div class="flex-1 min-h-0 rounded-lg bg-surface-raised-base opacity-30 animate-pulse" />
            </div>
          </Show>
        </>
      )}
    </div>
  )
}
