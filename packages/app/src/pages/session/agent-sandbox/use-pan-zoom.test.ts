import { expect, test, describe } from "bun:test"
import { clampZoom, panBy, zoomAtPoint } from "./use-pan-zoom"

describe("clampZoom", () => {
  test("clamps below minimum", () => {
    expect(clampZoom(0.01)).toBe(0.1)
  })
  test("clamps above maximum", () => {
    expect(clampZoom(5)).toBe(3)
  })
  test("passes through valid zoom", () => {
    expect(clampZoom(1.5)).toBe(1.5)
  })
})

describe("panBy", () => {
  test("adds delta to viewport position", () => {
    const vp = { x: 100, y: 200, zoom: 1 }
    const result = panBy(vp, 10, -20)
    expect(result).toEqual({ x: 110, y: 180, zoom: 1 })
  })
})

describe("zoomAtPoint", () => {
  test("zooms toward cursor position", () => {
    const vp = { x: 0, y: 0, zoom: 1 }
    const result = zoomAtPoint(vp, 1.5, 400, 300)
    expect(result.zoom).toBe(1.5)
    expect(result.x).toBeCloseTo(-200)
    expect(result.y).toBeCloseTo(-150)
  })
  test("clamps zoom to bounds", () => {
    const vp = { x: 0, y: 0, zoom: 2.8 }
    const result = zoomAtPoint(vp, 5, 0, 0)
    expect(result.zoom).toBe(3)
  })
})
