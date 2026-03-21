const MAX_ACTIVE = 5

export interface VisibilityState {
  activeIds: Set<string>
}

/**
 * Given a list of agent node IDs sorted by proximity to viewport center,
 * return the set that should be active (max 5).
 */
export function computeActiveNodes(
  sortedByProximity: string[],
  max = MAX_ACTIVE,
): Set<string> {
  return new Set(sortedByProximity.slice(0, max))
}

/**
 * Determine if a node rectangle is visible within the viewport.
 */
export function isNodeVisible(
  node: { x: number; y: number; width?: number; height?: number },
  viewport: { x: number; y: number; zoom: number },
  containerWidth: number,
  containerHeight: number,
): boolean {
  const w = node.width ?? 320
  const h = node.height ?? 240

  // Transform node coordinates to screen space
  const screenX = node.x * viewport.zoom + viewport.x
  const screenY = node.y * viewport.zoom + viewport.y
  const screenW = w * viewport.zoom
  const screenH = h * viewport.zoom

  // Check AABB overlap with container
  return (
    screenX + screenW > 0 &&
    screenX < containerWidth &&
    screenY + screenH > 0 &&
    screenY < containerHeight
  )
}

/**
 * Sort node IDs by distance from viewport center.
 */
export function sortByProximity(
  nodes: { id: string; x: number; y: number; width?: number; height?: number }[],
  viewport: { x: number; y: number; zoom: number },
  containerWidth: number,
  containerHeight: number,
): string[] {
  const centerX = (containerWidth / 2 - viewport.x) / viewport.zoom
  const centerY = (containerHeight / 2 - viewport.y) / viewport.zoom

  return [...nodes]
    .map((n) => {
      const nx = n.x + (n.width ?? 320) / 2
      const ny = n.y + (n.height ?? 240) / 2
      const dist = Math.hypot(nx - centerX, ny - centerY)
      return { id: n.id, dist }
    })
    .sort((a, b) => a.dist - b.dist)
    .map((n) => n.id)
}
