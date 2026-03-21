import { test, expect } from "bun:test"
import { computeActiveNodes, isNodeVisible, sortByProximity } from "../../src/canvas/node-visibility"

test("computeActiveNodes caps at 5 by default", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g"]
  const active = computeActiveNodes(ids)
  expect(active.size).toBe(5)
  expect(active.has("a")).toBe(true)
  expect(active.has("e")).toBe(true)
  expect(active.has("f")).toBe(false)
})

test("computeActiveNodes respects custom max", () => {
  const ids = ["a", "b", "c", "d"]
  const active = computeActiveNodes(ids, 2)
  expect(active.size).toBe(2)
  expect(active.has("a")).toBe(true)
  expect(active.has("b")).toBe(true)
  expect(active.has("c")).toBe(false)
})

test("computeActiveNodes handles fewer nodes than max", () => {
  const active = computeActiveNodes(["a", "b"])
  expect(active.size).toBe(2)
})

test("isNodeVisible detects visible node", () => {
  const node = { x: 100, y: 100, width: 320, height: 240 }
  const viewport = { x: 0, y: 0, zoom: 1 }
  expect(isNodeVisible(node, viewport, 1000, 800)).toBe(true)
})

test("isNodeVisible detects node off screen to the right", () => {
  const node = { x: 2000, y: 100, width: 320, height: 240 }
  const viewport = { x: 0, y: 0, zoom: 1 }
  expect(isNodeVisible(node, viewport, 1000, 800)).toBe(false)
})

test("isNodeVisible detects node off screen to the left", () => {
  const node = { x: -500, y: 100, width: 320, height: 240 }
  const viewport = { x: 0, y: 0, zoom: 1 }
  expect(isNodeVisible(node, viewport, 1000, 800)).toBe(false)
})

test("isNodeVisible accounts for viewport offset", () => {
  // Node at x=2000, but viewport panned left by 1500
  const node = { x: 2000, y: 100, width: 320, height: 240 }
  const viewport = { x: -1500, y: 0, zoom: 1 }
  expect(isNodeVisible(node, viewport, 1000, 800)).toBe(true)
})

test("isNodeVisible accounts for zoom", () => {
  // Node far away, but zoomed out
  const node = { x: 3000, y: 0, width: 320, height: 240 }
  const viewport = { x: 0, y: 0, zoom: 0.2 }
  // screenX = 3000 * 0.2 + 0 = 600, screenW = 320 * 0.2 = 64
  // 600 < 1000 and 600+64 > 0 => visible
  expect(isNodeVisible(node, viewport, 1000, 800)).toBe(true)
})

test("sortByProximity returns closest first", () => {
  const nodes = [
    { id: "far", x: 1000, y: 1000, width: 320, height: 240 },
    { id: "close", x: 400, y: 300, width: 320, height: 240 },
    { id: "mid", x: 600, y: 500, width: 320, height: 240 },
  ]
  const viewport = { x: 0, y: 0, zoom: 1 }
  const sorted = sortByProximity(nodes, viewport, 1000, 800)
  // Viewport center in world coords: (500, 400)
  // "close" center: (560, 420) dist ~= 63
  // "mid" center: (760, 620) dist ~= 319
  // "far" center: (1160, 1120) dist ~= 927
  expect(sorted[0]).toBe("close")
  expect(sorted[1]).toBe("mid")
  expect(sorted[2]).toBe("far")
})

test("sortByProximity handles empty array", () => {
  const sorted = sortByProximity([], { x: 0, y: 0, zoom: 1 }, 1000, 800)
  expect(sorted).toEqual([])
})
