import { createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import type { Viewport, CanvasItem as CanvasItemType, CanvasState } from "./types"
import { screenToWorld, viewportCenter } from "./coordinates"
import { loadCanvasState, loadCanvasStateSync, saveCanvasState } from "./canvas-state"
import CanvasItem from "./canvas-item"

const MIN_SCALE = 0.01
const MAX_SCALE = 256
const ZOOM_SPEED_WHEEL = 0.01
const ZOOM_SPEED_PINCH = 0.01
const SAVE_DEBOUNCE_MS = 300
const LINE_HEIGHT = 40 // pixels per "line" for deltaMode=1 normalization
const ZOOM_STEP = 1.5 // for keyboard zoom shortcuts
const FIT_PADDING = 48 // pixels of padding for Zoom to Fit

export default function InfiniteCanvas(props: { featureId: string; directory?: string }) {
  let rootRef!: HTMLDivElement
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  // Seed from localStorage synchronously so canvas renders immediately without blank flash
  const initial = loadCanvasStateSync(props.featureId)

  const [viewport, setViewport] = createSignal<Viewport>(initial.viewport)
  const [items, setItems] = createStore<CanvasItemType[]>(initial.items)
  const [isPanning, setIsPanning] = createSignal(false)
  const [spaceHeld, setSpaceHeld] = createSignal(false)
  const [stateLoading, setStateLoading] = createSignal(true)

  // -- Persistence (debounced) --
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveCanvasState(props.featureId, { viewport: viewport(), items: [...items] }, props.directory)
    }, SAVE_DEBOUNCE_MS)
  }

  let saveEnabled = false
  createEffect(() => {
    viewport() // track
    items.length // track
    if (saveEnabled) scheduleSave()
  })

  onCleanup(() => {
    if (saveTimer) clearTimeout(saveTimer)
    saveCanvasState(props.featureId, { viewport: viewport(), items: [...items] }, props.directory)
  })

  // -- Helpers --
  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  const zoomToPoint = (cx: number, cy: number, newScale: number) => {
    const v = viewport()
    const clamped = clampScale(newScale)
    if (clamped === v.scale) return
    const wx = (cx - v.tx) / v.scale
    const wy = (cy - v.ty) / v.scale
    setViewport({ tx: cx - wx * clamped, ty: cy - wy * clamped, scale: clamped })
  }

  const normalizeDelta = (e: WheelEvent) => {
    let dx = e.deltaX
    let dy = e.deltaY
    // Normalize line-mode deltas (mouse wheel) to pixel values
    if (e.deltaMode === 1) { dx *= LINE_HEIGHT; dy *= LINE_HEIGHT }
    return { dx, dy }
  }

  // -- Item dragging --
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null)
  const [isDragging, setIsDragging] = createSignal(false)
  let dragStart = { x: 0, y: 0, itemX: 0, itemY: 0 }
  let dragItemId = ""
  let dragPointerId = -1

  const startItemDrag = (id: string, e: PointerEvent) => {
    const idx = items.findIndex((it) => it.id === id)
    if (idx === -1) return
    setSelectedItemId(id)
    setIsDragging(true)
    dragItemId = id
    dragPointerId = e.pointerId
    dragStart = { x: e.clientX, y: e.clientY, itemX: items[idx].x, itemY: items[idx].y }
    rootRef.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  // -- Pan (pointer drag: Space+LMB, MMB, or LMB on background) --
  let panStart = { x: 0, y: 0, tx: 0, ty: 0 }
  let panPointerId = -1

  const startPan = (e: PointerEvent) => {
    setIsPanning(true)
    const v = viewport()
    panStart = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty }
    panPointerId = e.pointerId
    rootRef.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onPointerDown = (e: PointerEvent) => {
    // MMB drag = pan always
    if (e.button === 1) { startPan(e); return }

    // Space + LMB = pan (hand tool)
    if (e.button === 0 && spaceHeld()) { startPan(e); return }

    // LMB on background = pan + deselect
    if (e.button === 0) {
      const target = e.target as HTMLElement
      if (target === rootRef || target.hasAttribute("data-world")) {
        setSelectedItemId(null)
        startPan(e)
      }
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    // Item dragging (in world coordinates — divide screen delta by scale)
    if (isDragging() && e.pointerId === dragPointerId) {
      const scale = viewport().scale
      const dx = (e.clientX - dragStart.x) / scale
      const dy = (e.clientY - dragStart.y) / scale
      const idx = items.findIndex((it) => it.id === dragItemId)
      if (idx !== -1) {
        setItems(idx, "x", dragStart.itemX + dx)
        setItems(idx, "y", dragStart.itemY + dy)
      }
      return
    }
    // Canvas panning
    if (!isPanning() || e.pointerId !== panPointerId) return
    const dx = e.clientX - panStart.x
    const dy = e.clientY - panStart.y
    setViewport((v) => ({ ...v, tx: panStart.tx + dx, ty: panStart.ty + dy }))
  }

  const onPointerUp = (e: PointerEvent) => {
    if (isDragging() && e.pointerId === dragPointerId) {
      setIsDragging(false)
      dragPointerId = -1
      rootRef.releasePointerCapture(e.pointerId)
      return
    }
    if (!isPanning() || e.pointerId !== panPointerId) return
    setIsPanning(false)
    panPointerId = -1
    rootRef.releasePointerCapture(e.pointerId)
  }

  // -- Wheel: Pan by default, Zoom with Ctrl/Cmd (or pinch) --
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const { dx, dy } = normalizeDelta(e)
    const isZoom = e.ctrlKey || e.metaKey

    if (isZoom) {
      // Zoom toward cursor (Ctrl+wheel or trackpad pinch)
      const rect = rootRef.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const v = viewport()
      const factor = Math.pow(2, -dy * ZOOM_SPEED_PINCH)
      zoomToPoint(cx, cy, v.scale * factor)
    } else {
      // Pan (wheel scroll or two-finger trackpad)
      let panDx = -dx
      let panDy = -dy
      // Shift+wheel: convert vertical scroll to horizontal pan
      if (e.shiftKey && Math.abs(dx) < Math.abs(dy)) {
        panDx = -dy
        panDy = 0
      }
      setViewport((v) => ({ ...v, tx: v.tx + panDx, ty: v.ty + panDy }))
    }
  }

  // -- Keyboard: Space for hand tool, zoom shortcuts --
  const onKeyDown = (e: KeyboardEvent) => {
    // Ignore if typing in an input
    const tag = (e.target as HTMLElement).tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return

    if (e.code === "Space" && !e.repeat) {
      e.preventDefault()
      setSpaceHeld(true)
      return
    }

    const mod = e.metaKey || e.ctrlKey
    if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault()
      const rect = rootRef.getBoundingClientRect()
      zoomToPoint(rect.width / 2, rect.height / 2, viewport().scale * ZOOM_STEP)
    }
    if (mod && e.key === "-") {
      e.preventDefault()
      const rect = rootRef.getBoundingClientRect()
      zoomToPoint(rect.width / 2, rect.height / 2, viewport().scale / ZOOM_STEP)
    }

    // Shift+0 = zoom to 100%
    if (e.shiftKey && e.key === ")") {
      e.preventDefault()
      const rect = rootRef.getBoundingClientRect()
      zoomToPoint(rect.width / 2, rect.height / 2, 1)
    }

    // Shift+1 = zoom to fit
    if (e.shiftKey && e.key === "!") {
      e.preventDefault()
      zoomToFit()
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") setSpaceHeld(false)
  }

  // -- Zoom to Fit --
  const zoomToFit = () => {
    if (items.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const item of items) {
      minX = Math.min(minX, item.x)
      minY = Math.min(minY, item.y)
      maxX = Math.max(maxX, item.x + item.width)
      maxY = Math.max(maxY, item.y + item.height)
    }
    const bw = maxX - minX
    const bh = maxY - minY
    if (bw <= 0 || bh <= 0) return
    const vw = rootRef.clientWidth - FIT_PADDING * 2
    const vh = rootRef.clientHeight - FIT_PADDING * 2
    const scale = clampScale(Math.min(vw / bw, vh / bh))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setViewport({
      tx: rootRef.clientWidth / 2 - cx * scale,
      ty: rootRef.clientHeight / 2 - cy * scale,
      scale,
    })
  }

  // -- Paste handler --
  const onPaste = async (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData("text/plain")?.trim()
    if (!text) return

    const parsed = parseFigmaUrl(text)
    if (!parsed) return

    e.preventDefault()
    await addFigmaRaster(parsed.fileKey, parsed.nodeId)
  }

  const onPasteButton = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseFigmaUrl(text?.trim() ?? "")
      if (!parsed) return
      await addFigmaRaster(parsed.fileKey, parsed.nodeId)
    } catch {
      // clipboard API denied or empty
    }
  }

  const [loading, setLoading] = createSignal(false)
  const [needsFigmaAuth, setNeedsFigmaAuth] = createSignal(false)

  const serverUrl = () => {
    if (import.meta.env.VITE_OPENCODE_SERVER_HOST)
      return `http://${import.meta.env.VITE_OPENCODE_SERVER_HOST}:${import.meta.env.VITE_OPENCODE_SERVER_PORT || 4096}`
    // In production, backend is same origin; in dev, default to 4096
    if (import.meta.env.DEV) return `http://localhost:4096`
    return window.location.origin
  }

  const startFigmaAuth = async (server: string) => {
    setNeedsFigmaAuth(true)
    setLoading(false)
    const redirectUri = `${window.location.origin}/figma/callback`
    try {
      const res = await fetch(`${server}/figma/auth/url?redirect_uri=${encodeURIComponent(redirectUri)}`)
      if (!res.ok) {
        console.error("[figma-auth] Failed to get auth URL:", res.status, await res.text())
        return
      }
      const data = await res.json()
      if (data.url) window.open(data.url, "_blank", "width=600,height=700")
    } catch (e) {
      console.error("[figma-auth] Error getting auth URL:", e)
    }
  }

  const completeFigmaAuth = async (code: string, state: string) => {
    const redirectUri = `${window.location.origin}/figma/callback`
    try {
      const res = await fetch(`${serverUrl()}/figma/auth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirect_uri: redirectUri, state }),
      })
      if (res.ok) setNeedsFigmaAuth(false)
    } catch {
      // auth failed
    }
  }

  // Listen for OAuth callback message from popup window
  onMount(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === "figma-oauth-callback" && e.data.code && e.data.state) {
        completeFigmaAuth(e.data.code, e.data.state)
      }
    }
    window.addEventListener("message", handler)
    onCleanup(() => window.removeEventListener("message", handler))
  })

  const addFigmaRaster = async (fileKey: string, nodeId: string) => {
    setLoading(true)
    try {
      const center = viewportCenter(rootRef, viewport())
      const width = 800
      const height = 600
      const item: CanvasItemType = {
        id: crypto.randomUUID(),
        type: "figma_raster",
        fileKey,
        nodeId,
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        src: "",
        createdAt: Date.now(),
      }

      // Fetch screenshot via Figma REST API (OAuth)
      const server = serverUrl()
      try {
        const res = await fetch(`${server}/figma/image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey, nodeId: nodeId.replace(/-/g, ":"), scale: 2, format: "png" }),
        })

        if (res.status === 401) {
          // Not authenticated — show auth prompt but still add placeholder
          startFigmaAuth(server)
        } else if (res.ok) {
          const contentType = res.headers.get("content-type") ?? ""
          if (contentType.includes("application/json")) {
            const data = await res.json()
            if (data.imageUrl) {
              // Proxy through backend to get a permanent data URI instead of expiring Figma URL
              try {
                const proxyRes = await fetch(`${server}/figma/image/proxy`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ url: data.imageUrl }),
                })
                if (proxyRes.ok) {
                  const proxyData = await proxyRes.json()
                  if (proxyData.dataUri) item.src = proxyData.dataUri
                  else item.src = data.imageUrl
                } else {
                  item.src = data.imageUrl
                }
              } catch {
                item.src = data.imageUrl
              }
            }
          }
        }
      } catch (e) {
        console.error("[figma] Image fetch failed:", e)
      }

      // Always add item — use placeholder if no image from API
      if (!item.src) item.src = generatePlaceholder(fileKey, nodeId)
      setItems(produce((arr) => arr.push(item)))
    } finally {
      setLoading(false)
    }
  }

  // Re-fetch a stale Figma image URL and update the item in-place
  const refreshFigmaItemSrc = async (idx: number, item: CanvasItemType) => {
    const server = serverUrl()
    try {
      const res = await fetch(`${server}/figma/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey: item.fileKey, nodeId: item.nodeId.replace(/-/g, ":"), scale: 2, format: "png" }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.imageUrl) setItems(idx, "src", data.imageUrl as string)
    } catch {
      // re-fetch failed silently
    }
  }

  // Check if a URL (not data URI) is still loadable; if not, trigger re-fetch
  const checkAndRefreshSrc = (idx: number, item: CanvasItemType) => {
    if (!item.src || item.src.startsWith("data:")) return
    const img = new Image()
    img.onload = () => { /* still valid */ }
    img.onerror = () => { refreshFigmaItemSrc(idx, item) }
    img.src = item.src
  }

  // -- Mount --
  onMount(() => {
    rootRef.addEventListener("wheel", onWheel, { passive: false })
    rootRef.addEventListener("keydown", onKeyDown)
    rootRef.addEventListener("keyup", onKeyUp)
    // Listen for paste on document so it works even without explicit focus
    document.addEventListener("paste", onPaste as unknown as EventListener)
    // Try to focus canvas; delay to avoid "already focused" block
    requestAnimationFrame(() => rootRef.focus())

    // Load authoritative canvas state from backend API
    loadCanvasState(props.featureId, props.directory).then((state) => {
      setViewport(state.viewport)
      setItems(reconcile(state.items))
      setStateLoading(false)
      saveEnabled = true
      // Check each raster item for stale Figma URLs
      state.items.forEach((item, idx) => {
        if (item.type === "figma_raster") checkAndRefreshSrc(idx, item)
      })
    }).catch(() => {
      setStateLoading(false)
      saveEnabled = true
    })

    onCleanup(() => {
      rootRef.removeEventListener("wheel", onWheel)
      document.removeEventListener("paste", onPaste as unknown as EventListener)
      rootRef.removeEventListener("keydown", onKeyDown)
      rootRef.removeEventListener("keyup", onKeyUp)
    })
  })

  const v = () => viewport()

  return (
    <div
      ref={rootRef!}
      tabIndex={0}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        cursor: isDragging() ? "move" : isPanning() ? "grabbing" : spaceHeld() ? "grab" : "default",
        "touch-action": "none",
        "user-select": "none",
        outline: "none",
        "background-color": "var(--background)",
      }}
      onPointerDown={(e) => { rootRef.focus(); onPointerDown(e) }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* World container — transformed */}
      <div
        data-world
        style={{
          position: "absolute",
          top: "0",
          left: "0",
          "transform-origin": "0 0",
          transform: `translate(${v().tx}px, ${v().ty}px) scale(${v().scale})`,
          "will-change": "transform",
        }}
      >
        <For each={items}>{(item) => (
          <CanvasItem
            item={item}
            scale={v().scale}
            selected={selectedItemId() === item.id}
            onDragStart={startItemDrag}
          />
        )}</For>
      </div>

      {/* Loading indicator */}
      <Show when={loading()}>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "12px 24px",
            "background-color": "var(--background-stronger)",
            "border-radius": "8px",
            "box-shadow": "0 4px 16px rgba(0,0,0,0.15)",
            "font-size": "14px",
            color: "var(--color-text)",
            "z-index": "10",
          }}
        >
          Importing from Figma...
        </div>
      </Show>

      {/* Figma auth prompt */}
      <Show when={needsFigmaAuth()}>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            "text-align": "center",
            color: "var(--color-text-dimmed)",
            "z-index": "15",
            "pointer-events": "auto",
            padding: "32px",
            "background-color": "var(--background-stronger)",
            "border-radius": "12px",
            "box-shadow": "0 8px 32px rgba(0,0,0,0.15)",
          }}
        >
          <p style={{ "font-size": "16px", "font-weight": "500", "margin-bottom": "8px", color: "var(--color-text)" }}>
            Sign in with Figma
          </p>
          <p style={{ "font-size": "13px", opacity: "0.7", "margin-bottom": "16px", "max-width": "300px" }}>
            Connect your Figma account to import designs onto the canvas.
          </p>
          <button
            onClick={() => startFigmaAuth(serverUrl())}
            style={{
              padding: "10px 24px",
              "font-size": "14px",
              "font-weight": "500",
              "border-radius": "8px",
              border: "none",
              "background-color": "#000",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Connect Figma
          </button>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={items.length === 0 && !loading() && !needsFigmaAuth()}>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            "text-align": "center",
            color: "var(--color-text-dimmed)",
            "z-index": "5",
            "pointer-events": "auto",
          }}
        >
          <p style={{ "font-size": "16px", "font-weight": "500", "margin-bottom": "4px" }}>
            Paste a Figma URL
          </p>
          <p style={{ "font-size": "13px", opacity: "0.7", "margin-bottom": "16px" }}>
            Copy a frame URL from Figma and press Cmd+V
          </p>
          <button
            onClick={onPasteButton}
            style={{
              padding: "8px 20px",
              "font-size": "13px",
              "border-radius": "6px",
              border: "1px solid var(--border)",
              "background-color": "var(--background-stronger)",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            Paste from clipboard
          </button>
        </div>
      </Show>

      {/* Zoom indicator */}
      <div
        style={{
          position: "absolute",
          bottom: "12px",
          right: "12px",
          padding: "4px 10px",
          "font-size": "11px",
          "font-family": "monospace",
          "border-radius": "4px",
          "background-color": "var(--background-stronger)",
          color: "var(--color-text-dimmed)",
          opacity: "0.8",
          "z-index": "5",
          "pointer-events": "none",
        }}
      >
        {Math.round(v().scale * 100)}%
      </div>
    </div>
  )
}

// -- Utilities --

function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes("figma.com")) return null
    const parts = u.pathname.split("/")
    // /design/{fileKey}/... or /file/{fileKey}/...
    const idx = parts.findIndex((p) => p === "design" || p === "file")
    if (idx === -1 || !parts[idx + 1]) return null
    const fileKey = parts[idx + 1]
    const nodeId = u.searchParams.get("node-id") ?? ""
    return { fileKey, nodeId }
  } catch {
    return null
  }
}

function generatePlaceholder(fileKey: string, nodeId: string): string {
  // Generate a simple SVG placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="#f0f0f0" rx="8"/>
    <text x="400" y="280" text-anchor="middle" font-family="system-ui" font-size="16" fill="#999">Figma Frame</text>
    <text x="400" y="310" text-anchor="middle" font-family="monospace" font-size="12" fill="#bbb">${fileKey}</text>
    <text x="400" y="335" text-anchor="middle" font-family="monospace" font-size="11" fill="#ccc">node: ${nodeId || "root"}</text>
  </svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}
