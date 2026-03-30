export type Viewport = {
  tx: number
  ty: number
  scale: number
}

export type CanvasItem = {
  id: string
  type: "figma_raster"
  fileKey: string
  nodeId: string
  x: number
  y: number
  width: number
  height: number
  src: string
  createdAt: number
}

export type CanvasState = {
  viewport: Viewport
  items: CanvasItem[]
}

export type Point = {
  x: number
  y: number
}
