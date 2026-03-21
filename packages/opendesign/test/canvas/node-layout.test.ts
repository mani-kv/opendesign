import { test, expect } from "bun:test"
import { nextPosition, gridLayout, centerViewport } from "../../src/canvas/node-layout"
import { createAgentNode } from "../../src/canvas/node-factory"

test("nextPosition returns 0,0 for empty list", () => {
  const pos = nextPosition([])
  expect(pos).toEqual({ x: 0, y: 0 })
})

test("nextPosition places right of rightmost node", () => {
  const a = createAgentNode("s1", "b1", 0, 0)
  const b = createAgentNode("s2", "b2", 400, 50)
  const pos = nextPosition([a, b])
  // b is at x=400, width=320, so right edge is 720
  // gap is 40, so next x = 760
  expect(pos.x).toBe(760)
  expect(pos.y).toBe(50)
})

test("nextPosition respects node width", () => {
  const a = createAgentNode("s1", "b1", 0, 0)
  // default agent width is 320, so right edge = 320
  const pos = nextPosition([a])
  expect(pos.x).toBe(360) // 320 + 40 gap
  expect(pos.y).toBe(0)
})

test("gridLayout arranges nodes in grid", () => {
  const nodes = [
    createAgentNode("s1", "b1"),
    createAgentNode("s2", "b2"),
    createAgentNode("s3", "b3"),
    createAgentNode("s4", "b4"),
  ]
  const result = gridLayout(nodes, 2)
  // col0 row0, col1 row0, col0 row1, col1 row1
  expect(result[0]).toEqual({ id: nodes[0].id, x: 0, y: 0 })
  expect(result[1]).toEqual({ id: nodes[1].id, x: 360, y: 0 }) // 320 + 40
  expect(result[2]).toEqual({ id: nodes[2].id, x: 0, y: 280 }) // 240 + 40
  expect(result[3]).toEqual({ id: nodes[3].id, x: 360, y: 280 })
})

test("centerViewport returns default for empty nodes", () => {
  const vp = centerViewport([], 1000, 800)
  expect(vp).toEqual({ x: 0, y: 0, zoom: 1 })
})

test("centerViewport clamps zoom to 1", () => {
  // Single small node in a large container
  const node = createAgentNode("s1", "b1", 0, 0) // 320x240
  const vp = centerViewport([node], 2000, 2000)
  expect(vp.zoom).toBe(1)
})

test("centerViewport zooms out for large content", () => {
  // Place nodes far apart so content is bigger than container
  const a = createAgentNode("s1", "b1", 0, 0)
  const b = createAgentNode("s2", "b2", 2000, 0)
  const vp = centerViewport([a, b], 800, 600)
  expect(vp.zoom).toBeLessThan(1)
})

test("centerViewport centers on content", () => {
  const node = createAgentNode("s1", "b1", 100, 100) // at (100,100), 320x240
  const vp = centerViewport([node], 1000, 800)
  // Content center: x=100+160=260, y=100+120=220
  // zoom=1 (small content, big container)
  // x = 500 - 260*1 = 240
  // y = 400 - 220*1 = 180
  expect(vp.x).toBe(240)
  expect(vp.y).toBe(180)
  expect(vp.zoom).toBe(1)
})
