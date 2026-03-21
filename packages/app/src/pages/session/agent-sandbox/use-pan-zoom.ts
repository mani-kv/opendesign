import { createSignal } from "solid-js"

type Viewport = { x: number; y: number; zoom: number }

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }
}

export function zoomAtPoint(vp: Viewport, newZoom: number, cx: number, cy: number): Viewport {
  const z = clampZoom(newZoom)
  const scale = z / vp.zoom
  return {
    x: cx - (cx - vp.x) * scale,
    y: cy - (cy - vp.y) * scale,
    zoom: z,
  }
}

export function createPanZoom(opts: {
  viewport: () => Viewport
  setViewport: (vp: Viewport) => void
}) {
  const [panning, setPanning] = createSignal(false)
  let startX = 0
  let startY = 0
  let startVp: Viewport = { x: 0, y: 0, zoom: 1 }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as SVGElement
    if (target.tagName !== "svg" && target.tagName !== "rect") return
    e.preventDefault()
    startX = e.clientX
    startY = e.clientY
    startVp = opts.viewport()
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

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = (e.currentTarget as Element).getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const vp = opts.viewport()
    opts.setViewport(zoomAtPoint(vp, vp.zoom * factor, cx, cy))
  }

  return { panning, onPointerDown, onWheel }
}
