import { expect, test, describe } from "bun:test"
import { computeEdgePath, edgeStrokeStyle } from "./edge-path"

describe("computeEdgePath", () => {
  test("returns a cubic bezier SVG path", () => {
    const path = computeEdgePath(
      { x: 0, y: 50, width: 100, height: 100 },
      { x: 300, y: 50, width: 100, height: 100 },
    )
    expect(path).toMatch(/^M\s/)
    expect(path).toContain("C")
  })

  test("source exits right, target enters left", () => {
    const path = computeEdgePath(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 400, y: 0, width: 100, height: 100 },
    )
    expect(path).toStartWith("M 100 50")
  })
})

describe("edgeStrokeStyle", () => {
  test("flow type returns solid", () => {
    expect(edgeStrokeStyle("flow").dasharray).toBeUndefined()
  })
  test("context type returns dashed", () => {
    expect(edgeStrokeStyle("context").dasharray).toBe("6 3")
  })
  test("checkpoint type returns dotted", () => {
    expect(edgeStrokeStyle("checkpoint").dasharray).toBe("2 4")
  })
})
