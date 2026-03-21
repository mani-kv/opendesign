import type { CanvasEdge } from "@opencode-ai/opendesign/types"

type NodeRect = { x: number; y: number; width?: number; height?: number }

const DEFAULT_W = 320
const DEFAULT_H = 240

export function computeEdgePath(source: NodeRect, target: NodeRect): string {
  const sw = source.width ?? DEFAULT_W
  const sh = source.height ?? DEFAULT_H
  const th = target.height ?? DEFAULT_H

  const sx = source.x + sw
  const sy = source.y + sh / 2
  const tx = target.x
  const ty = target.y + th / 2

  const dx = Math.abs(tx - sx) * 0.5
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`
}

export function edgeStrokeStyle(type?: CanvasEdge["type"]): { dasharray?: string; color: string } {
  switch (type) {
    case "context":
      return { dasharray: "6 3", color: "var(--border-base)" }
    case "checkpoint":
      return { dasharray: "2 4", color: "var(--border-base)" }
    default:
      return { color: "var(--border-base)" }
  }
}

export function EdgePath(props: { edge: CanvasEdge; sourceNode: NodeRect; targetNode: NodeRect }) {
  const path = () => computeEdgePath(props.sourceNode, props.targetNode)
  const style = () => edgeStrokeStyle(props.edge.type)

  return <path d={path()} fill="none" stroke={style().color} stroke-width="1.5" stroke-dasharray={style().dasharray} />
}
