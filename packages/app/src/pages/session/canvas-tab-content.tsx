import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js"
import { useProjectParams } from "@/context/project-scope"
import { useSDK } from "@/context/sdk"
import {
  initCanvas,
  loadCanvas,
  saveCanvas,
  setActiveSession,
  getCachedCanvas,
  EMPTY_CANVAS_JSON,
} from "@/utils/canvas-bridge"

export function CanvasTabContent() {
  const params = useProjectParams()
  const sdk = useSDK()
  const [ready, setReady] = createSignal(false)
  const [error, setError] = createSignal<string>()
  let containerRef: HTMLDivElement | undefined
  let saveTimer: number | undefined

  const sessionId = () => params.id ?? params.projectId

  onMount(async () => {
    if (!containerRef) return
    const ok = await initCanvas(containerRef)
    if (!ok) {
      setError("WebGPU is not supported in this browser. Please use Chrome, Edge, or Safari.")
      return
    }
    setReady(true)
    loadSessionCanvas(sessionId())
  })

  const loadSessionCanvas = async (sid: string) => {
    setActiveSession(sid)
    const cached = getCachedCanvas(sid)
    if (cached) {
      loadCanvas(cached, sid)
      return
    }

    try {
      const res = await fetch(`${sdk.url}/session/${sid}/canvas`)
      if (res.ok) {
        const data = await res.json()
        if (data.state) {
          loadCanvas(data.state, sid)
          return
        }
      }
    } catch {
      // No saved state — start empty
    }

    loadCanvas(EMPTY_CANVAS_JSON, sid)
  }

  const saveSessionCanvas = (sid: string) => {
    saveCanvas(sid, async (json) => {
      try {
        await fetch(`${sdk.url}/session/${sid}/canvas`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: json }),
        })
      } catch {
        // Save failed — cached locally, will retry
      }
    })
  }

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      const sid = sessionId()
      if (sid && ready()) saveSessionCanvas(sid)
    }, 5000)
  }

  onMount(() => {
    const handler = () => scheduleSave()
    containerRef?.addEventListener("pointerup", handler)
    containerRef?.addEventListener("keyup", handler)
    onCleanup(() => {
      containerRef?.removeEventListener("pointerup", handler)
      containerRef?.removeEventListener("keyup", handler)
      if (saveTimer) clearTimeout(saveTimer)
    })
  })

  createEffect(
    on(sessionId, (newId, oldId) => {
      if (!ready() || !newId) return
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
        <div
          ref={containerRef}
          id="canvas-container"
          class="absolute inset-0"
          style={{ "touch-action": "none" }}
        />
      )}
    </div>
  )
}
