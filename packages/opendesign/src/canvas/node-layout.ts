import type { CanvasNode } from "../types/node"

const GRID_GAP = 40
const DEFAULT_WIDTH = 320

/**
 * Find the next available position to place a node,
 * avoiding overlap with existing nodes.
 */
export function nextPosition(existing: CanvasNode[], width = DEFAULT_WIDTH, height = 240): { x: number; y: number } {
  if (existing.length === 0) return { x: 0, y: 0 }

  // Place to the right of the rightmost node
  let maxRight = 0
  let maxRightY = 0
  for (const node of existing) {
    const right = node.x + (node.width ?? DEFAULT_WIDTH)
    if (right > maxRight) {
      maxRight = right
      maxRightY = node.y
    }
  }

  return { x: maxRight + GRID_GAP, y: maxRightY }
}

/**
 * Arrange nodes in a grid layout.
 * Returns new positions without mutating original nodes.
 */
export function gridLayout(
  nodes: CanvasNode[],
  columns = 3,
  gap = GRID_GAP,
): { id: string; x: number; y: number }[] {
  return nodes.map((node, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    const w = node.width ?? DEFAULT_WIDTH
    const h = node.height ?? 240
    return {
      id: node.id,
      x: col * (w + gap),
      y: row * (h + gap),
    }
  })
}

/**
 * Center viewport on a set of nodes.
 */
export function centerViewport(
  nodes: CanvasNode[],
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number; zoom: number } {
  if (nodes.length === 0) return { x: 0, y: 0, zoom: 1 }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + (n.width ?? DEFAULT_WIDTH))
    maxY = Math.max(maxY, n.y + (n.height ?? 240))
  }

  const contentW = maxX - minX
  const contentH = maxY - minY
  const zoom = Math.min(1, containerWidth / (contentW + 80), containerHeight / (contentH + 80))
  const cx = minX + contentW / 2
  const cy = minY + contentH / 2

  return {
    x: containerWidth / 2 - cx * zoom,
    y: containerHeight / 2 - cy * zoom,
    zoom,
  }
}
