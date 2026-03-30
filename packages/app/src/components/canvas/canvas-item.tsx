import type { CanvasItem as CanvasItemType } from "./types"

export default function CanvasItem(props: { item: CanvasItemType }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${props.item.x}px`,
        top: `${props.item.y}px`,
        width: `${props.item.width}px`,
        height: `${props.item.height}px`,
        "box-shadow": "0 2px 12px rgba(0,0,0,0.12)",
        "border-radius": "4px",
        overflow: "hidden",
        "background-color": "var(--background-stronger)",
      }}
    >
      <img
        src={props.item.src}
        alt={`Figma frame ${props.item.nodeId}`}
        draggable={false}
        style={{ width: "100%", height: "100%", display: "block", "object-fit": "contain" }}
      />
    </div>
  )
}
