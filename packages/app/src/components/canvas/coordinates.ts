import type { Point, Viewport } from "./types"

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.tx) / viewport.scale,
    y: (point.y - viewport.ty) / viewport.scale,
  }
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.scale + viewport.tx,
    y: point.y * viewport.scale + viewport.ty,
  }
}

export function viewportCenter(el: HTMLElement, viewport: Viewport): Point {
  return screenToWorld({ x: el.clientWidth / 2, y: el.clientHeight / 2 }, viewport)
}
