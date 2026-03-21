import { For, Show, createSignal } from "solid-js"
import type { GraphStore } from "@opencode-ai/opendesign"
import { createPanZoom } from "./use-pan-zoom"
import { EdgePath } from "./edge-path"
import { NodeCard } from "./node-card"

export function AgentSandboxCanvas(props: { graph: GraphStore }) {
  const [selected, setSelected] = createSignal<string | null>(null)
  const [, setDragging] = createSignal<string | null>(null)

  const panZoom = createPanZoom({
    viewport: () => props.graph.state.viewport,
    setViewport: (vp) => props.graph.setViewport(vp),
  })

  const startNodeDrag = (nodeId: string, e: PointerEvent) => {
    e.stopPropagation()
    const node = props.graph.nodeById(nodeId)
    if (!node) return
    const startX = e.clientX
    const startY = e.clientY
    const origX = node.x
    const origY = node.y
    const zoom = props.graph.state.viewport.zoom
    setDragging(nodeId)

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom
      const dy = (ev.clientY - startY) / zoom
      props.graph.updateNode(nodeId, (n) => {
        n.x = origX + dx
        n.y = origY + dy
      })
    }
    const onUp = () => {
      setDragging(null)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  const vp = () => props.graph.state.viewport

  return (
    <svg
      class="size-full select-none"
      style={{
        "background-color": "var(--background-stronger)",
        "background-image":
          "radial-gradient(circle, var(--border-weaker-base) 1px, transparent 1px)",
        "background-size": `${20 * vp().zoom}px ${20 * vp().zoom}px`,
        "background-position": `${vp().x}px ${vp().y}px`,
      }}
      onPointerDown={panZoom.onPointerDown}
      onWheel={panZoom.onWheel}
    >
      <g transform={`translate(${vp().x}, ${vp().y}) scale(${vp().zoom})`}>
        {/* Edges rendered below nodes */}
        <For each={props.graph.state.edges}>
          {(edge) => {
            const source = () => props.graph.nodeById(edge.source)
            const target = () => props.graph.nodeById(edge.target)
            return (
              <Show when={source() && target()}>
                <EdgePath
                  edge={edge}
                  sourceNode={source()!}
                  targetNode={target()!}
                />
              </Show>
            )
          }}
        </For>

        {/* Nodes rendered as foreignObject elements */}
        <For each={props.graph.state.nodes}>
          {(node) => (
            <foreignObject
              x={node.x}
              y={node.y}
              width={node.width ?? 320}
              height={node.height ?? 240}
              class="overflow-visible"
            >
              <NodeCard
                node={node}
                selected={selected() === node.id}
                onSelect={() => setSelected(node.id)}
                onDragStart={(e) => startNodeDrag(node.id, e)}
              />
            </foreignObject>
          )}
        </For>
      </g>
    </svg>
  )
}
