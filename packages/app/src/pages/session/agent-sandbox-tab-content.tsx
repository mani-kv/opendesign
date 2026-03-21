import { Show, createEffect, on, onCleanup } from "solid-js"
import { Mark } from "@opencode-ai/ui/logo"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useLanguage } from "@/context/language"
import { useAgents } from "@/context/agents"
import { stateColor } from "@opencode-ai/opendesign/agent"
import { SANDPACK_SRCDOC } from "./agent-sandbox/sandpack-srcdoc"
import { createPanZoom, clampZoom, zoomAtPoint } from "./agent-sandbox/use-pan-zoom"
import { createBodyResizing } from "./helpers"
import { createStore } from "solid-js/store"

const NODE_W = 480
const NODE_H = 400
const HEADER_H = 40
const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.6

export function AgentSandboxTabContent() {
  const language = useLanguage()
  const agents = useAgents()
  const agent = () => agents.selected()
  const resizing = createBodyResizing()

  const [vp, setVp] = createStore({ x: 0, y: 0, zoom: 1 })

  let svgRef: SVGSVGElement | undefined

  const nodeW = NODE_W
  const nodeH = NODE_H + HEADER_H

  /** Ensure at least 25% of the node stays visible inside the container */
  function clampVp(next: { x: number; y: number; zoom: number }) {
    if (!svgRef) return next
    const rect = svgRef.getBoundingClientRect()
    const scaledW = nodeW * next.zoom
    const scaledH = nodeH * next.zoom
    const margin = 0.25 // 25% must remain visible
    const minX = -(scaledW * (1 - margin))
    const maxX = rect.width - scaledW * margin
    const minY = -(scaledH * (1 - margin))
    const maxY = rect.height - scaledH * margin
    return {
      x: Math.max(minX, Math.min(maxX, next.x)),
      y: Math.max(minY, Math.min(maxY, next.y)),
      zoom: next.zoom,
    }
  }

  function setVpClamped(next: { x: number; y: number; zoom: number }) {
    setVp(clampVp(next))
  }

  /** Center the node in the container whenever agent changes or on mount */
  function fitView() {
    if (!svgRef) return
    const rect = svgRef.getBoundingClientRect()
    const zoom = Math.min(rect.width / (nodeW + 80), rect.height / (nodeH + 80), 1)
    const clamped = clampZoom(zoom, MIN_ZOOM, MAX_ZOOM)
    setVp({
      x: (rect.width - nodeW * clamped) / 2,
      y: (rect.height - nodeH * clamped) / 2,
      zoom: clamped,
    })
  }

  createEffect(on(() => agents.selectedId(), () => fitView(), { defer: true }))

  const panZoom = createPanZoom({
    viewport: () => vp,
    setViewport: setVpClamped,
  })

  function bindWheelConstrained(el: SVGSVGElement) {
    const handler = (e: Event) => {
      const we = e as WheelEvent
      we.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = we.clientX - rect.left
      const cy = we.clientY - rect.top
      const factor = we.deltaY > 0 ? 0.95 : 1.05
      const snap = { x: vp.x, y: vp.y, zoom: vp.zoom }
      const next = zoomAtPoint(snap, clampZoom(snap.zoom * factor, MIN_ZOOM, MAX_ZOOM), cx, cy)
      setVpClamped(next)
    }
    el.addEventListener("wheel", handler, { passive: false })
    onCleanup(() => el.removeEventListener("wheel", handler))
  }

  function zoomIn() {
    if (!svgRef) return
    const rect = svgRef.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const snap = { x: vp.x, y: vp.y, zoom: vp.zoom }
    setVpClamped(zoomAtPoint(snap, clampZoom(snap.zoom * 1.2, MIN_ZOOM, MAX_ZOOM), cx, cy))
  }

  function zoomOut() {
    if (!svgRef) return
    const rect = svgRef.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const snap = { x: vp.x, y: vp.y, zoom: vp.zoom }
    setVpClamped(zoomAtPoint(snap, clampZoom(snap.zoom / 1.2, MIN_ZOOM, MAX_ZOOM), cx, cy))
  }

  const zoomPct = () => Math.round(vp.zoom * 100)

  return (
    <div class="relative size-full min-h-0 min-w-0">
      <Show
        when={agent()}
        fallback={
          <div class="h-full px-6 pb-24 flex flex-col items-center justify-center gap-6">
            <Mark class="w-14 opacity-10" />
            <div class="text-14-regular text-text-weak max-w-56 text-center">{language.t("session.sandbox.empty")}</div>
          </div>
        }
      >
        {(a) => {
          const color = () => stateColor(a().state)
          return (
            <>
              <svg
                ref={(el) => {
                  svgRef = el
                  bindWheelConstrained(el)
                  requestAnimationFrame(() => fitView())
                }}
                class="size-full select-none"
                style={{
                  "background-color": "var(--background-stronger)",
                  "background-image": "radial-gradient(circle, var(--border-weaker-base) 1px, transparent 1px)",
                  "background-size": `${20 * vp.zoom}px ${20 * vp.zoom}px`,
                  "background-position": `${vp.x}px ${vp.y}px`,
                }}
                onPointerDown={panZoom.onPointerDown}
              >
                <g transform={`translate(${vp.x}, ${vp.y}) scale(${vp.zoom})`}>
                  <foreignObject x={0} y={0} width={NODE_W} height={NODE_H + HEADER_H} class="overflow-visible">
                    <div
                      class="rounded-lg border bg-background-base shadow-lg overflow-hidden select-none"
                      style={{ width: `${NODE_W}px`, height: `${NODE_H + HEADER_H}px` }}
                    >
                      {/* Header — drag handle */}
                      <div
                        class="px-3 py-2 flex items-center gap-2 border-b border-[var(--border-weaker-base)] cursor-grab active:cursor-grabbing"
                        style={{ height: `${HEADER_H}px` }}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          const startX = e.clientX
                          const startY = e.clientY
                          const origVp = { x: vp.x, y: vp.y, zoom: vp.zoom }

                          const onMove = (ev: PointerEvent) => {
                            const dx = ev.clientX - startX
                            const dy = ev.clientY - startY
                            setVpClamped({ x: origVp.x + dx, y: origVp.y + dy, zoom: origVp.zoom })
                          }
                          const onUp = () => {
                            document.removeEventListener("pointermove", onMove)
                            document.removeEventListener("pointerup", onUp)
                          }
                          document.addEventListener("pointermove", onMove)
                          document.addEventListener("pointerup", onUp)
                        }}
                      >
                        <div class="size-2 rounded-full shrink-0" style={{ "background-color": color() }} />
                        <div class="text-12-medium text-text-base truncate">{a().scenario}</div>
                        <div class="ml-auto text-11-regular text-text-weak font-mono truncate">{a().branch}</div>
                      </div>

                      {/* Sandpack iframe */}
                      <div class="relative" style={{ height: `${NODE_H}px` }}>
                        <iframe
                          srcdoc={SANDPACK_SRCDOC}
                          class="size-full border-0"
                          sandbox="allow-scripts"
                          title="Sandpack preview"
                        />
                        <Show when={resizing()}>
                          <div class="absolute inset-0 z-10" />
                        </Show>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              </svg>

              {/* Zoom controls */}
              <div class="absolute bottom-3 right-3 flex items-center gap-1 bg-background-base border border-[var(--border-weaker-base)] rounded-lg shadow-sm px-1 py-0.5">
                <IconButton
                  icon="dash"
                  size="small"
                  variant="ghost"
                  class="size-7"
                  onClick={zoomOut}
                  disabled={vp.zoom <= MIN_ZOOM}
                  aria-label="Zoom out"
                />
                <button
                  class="text-11-medium text-text-dimmer tabular-nums w-10 text-center hover:text-text-base transition-colors"
                  onClick={fitView}
                  title="Fit to view"
                >
                  {zoomPct()}%
                </button>
                <IconButton
                  icon="plus"
                  size="small"
                  variant="ghost"
                  class="size-7"
                  onClick={zoomIn}
                  disabled={vp.zoom >= MAX_ZOOM}
                  aria-label="Zoom in"
                />
                <div class="w-px h-4 bg-[var(--border-weaker-base)] mx-0.5" />
                <IconButton
                  icon="expand"
                  size="small"
                  variant="ghost"
                  class="size-7"
                  onClick={fitView}
                  aria-label="Fit to view"
                />
              </div>
            </>
          )
        }}
      </Show>
    </div>
  )
}
