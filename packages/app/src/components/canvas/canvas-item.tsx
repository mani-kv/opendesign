import type { CanvasItem as CanvasItemType } from "./types"

type Props = {
  item: CanvasItemType
  scale: number
  onDragStart: (id: string, e: PointerEvent) => void
  selected?: boolean
}

export default function CanvasItem(props: Props) {
  return (
    <div
      data-canvas-item={props.item.id}
      style={{
        position: "absolute",
        left: `${props.item.x}px`,
        top: `${props.item.y}px`,
        width: `${props.item.width}px`,
        height: `${props.item.height}px`,
        "box-shadow": props.selected
          ? "0 0 0 2px var(--color-primary), 0 2px 12px rgba(0,0,0,0.12)"
          : "0 2px 12px rgba(0,0,0,0.12)",
        "border-radius": "4px",
        overflow: "hidden",
        "background-color": "var(--background-stronger)",
        cursor: "move",
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        props.onDragStart(props.item.id, e)
      }}
    >
      <img
        src={props.item.src}
        alt={`Figma frame ${props.item.nodeId}`}
        draggable={false}
        style={{ width: "100%", height: "100%", display: "block", "object-fit": "contain", "pointer-events": "none" }}
      />
    </div>
  )
}
