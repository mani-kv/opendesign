import { createSignal, onCleanup } from "solid-js"

type Viewport = { x: number; y: number; zoom: number }

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3

export function clampZoom(z: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Math.max(min, Math.min(max, z))
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }
}

export function zoomAtPoint(vp: Viewport, newZoom: number, cx: number, cy: number): Viewport {
  const z = newZoom
  const scale = z / vp.zoom
  return {
    x: cx - (cx - vp.x) * scale,
    y: cy - (cy - vp.y) * scale,
    zoom: z,
  }
}

/** Tags that indicate a click is on a canvas node, not the background */
const NODE_TAGS = new Set(["foreignobject", "div", "button", "iframe", "span", "input", "a", "p", "h1", "h2", "h3"])

export function createPanZoom(opts: { viewport: () => Viewport; setViewport: (vp: Viewport) => void }) {
  const [panning, setPanning] = createSignal(false)
  let startX = 0
  let startY = 0
  let startVp: Viewport = { x: 0, y: 0, zoom: 1 }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const tag = (e.target as Element).tagName.toLowerCase()
    if (NODE_TAGS.has(tag)) return
    e.preventDefault()
    startX = e.clientX
    startY = e.clientY
    const vp = opts.viewport()
    startVp = { x: vp.x, y: vp.y, zoom: vp.zoom }
    setPanning(true)

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      opts.setViewport(panBy(startVp, dx, dy))
    }
    const onUp = () => {
      setPanning(false)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  /** Attach wheel listener with { passive: false } so preventDefault works */
  const bindWheel = (el: Element) => {
    const handler = (e: Event) => {
      const we = e as WheelEvent
      we.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = we.clientX - rect.left
      const cy = we.clientY - rect.top
      const factor = we.deltaY > 0 ? 0.9 : 1.1
      const cur = opts.viewport()
      const snap = { x: cur.x, y: cur.y, zoom: cur.zoom }
      opts.setViewport(zoomAtPoint(snap, clampZoom(snap.zoom * factor), cx, cy))
    }
    el.addEventListener("wheel", handler, { passive: false })
    onCleanup(() => el.removeEventListener("wheel", handler))
  }

  return { panning, onPointerDown, bindWheel }
}
