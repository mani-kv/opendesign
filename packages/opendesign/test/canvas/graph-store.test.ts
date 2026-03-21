import { test, expect } from "bun:test"
import { createRoot } from "solid-js"
import { createGraphStore } from "../../src/canvas/graph-store"
import { createAgentNode, createFrameNode, createEdge } from "../../src/canvas/node-factory"
import type { FigmaFrame } from "../../src/types/figma"

const frame: FigmaFrame = {
  nodeId: "1:2",
  name: "Login",
  fileKey: "abc",
  width: 375,
  height: 812,
}

test("addNode appends a node", () => {
  createRoot((dispose) => {
    const store = createGraphStore()
    const node = createAgentNode("s1", "b1", 0, 0)
    store.addNode(node)
    expect(store.state.nodes).toHaveLength(1)
    expect(store.state.nodes[0].type).toBe("agent")
    dispose()
  })
})

test("removeNode removes node and connected edges", () => {
  createRoot((dispose) => {
    const store = createGraphStore()
    const a = createAgentNode("s1", "b1")
    const b = createAgentNode("s2", "b2")
    store.addNode(a)
    store.addNode(b)
    const edge = createEdge(a.id, b.id, "flow")
    store.addEdge(edge)
    expect(store.state.edges).toHaveLength(1)

    store.removeNode(a.id)
    expect(store.state.nodes).toHaveLength(1)
    expect(store.state.nodes[0].id).toBe(b.id)
    expect(store.state.edges).toHaveLength(0)
    dispose()
  })
})

test("updateNode mutates node in place", () => {
  createRoot((dispose) => {
    const store = createGraphStore()
    const node = createAgentNode("s1", "b1", 10, 20)
    store.addNode(node)
    store.updateNode(node.id, (n: any) => {
      n.x = 99
    })
    expect(store.state.nodes[0].x).toBe(99)
    dispose()
  })
})

test("addEdge and removeEdge", () => {
  createRoot((dispose) => {
    const store = createGraphStore()
    const edge = createEdge("a", "b", "flow")
    store.addEdge(edge)
    expect(store.state.edges).toHaveLength(1)
    store.removeEdge(edge.id)
    expect(store.state.edges).toHaveLength(0)
    dispose()
  })
})

test("clear resets state", () => {
  createRoot((dispose) => {
    const store = createGraphStore()
    store.addNode(createAgentNode("s1", "b1"))
    store.addEdge(createEdge("a", "b"))
    store.setViewport({ x: 100, y: 200, zoom: 2 })
    store.clear()
    expect(store.state.nodes).toHaveLength(0)
    expect(store.state.edges).toHaveLength(0)
    expect(store.state.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    dispose()
  })
})

test("nodeById returns correct node", () => {
  createRoot((dispose) => {
    const store = createGraphStore()
    const node = createAgentNode("s1", "b1")
    store.addNode(node)
    expect(store.nodeById(node.id)?.id).toBe(node.id)
    expect(store.nodeById("nonexistent")).toBeUndefined()
    dispose()
  })
})

test("nodesByType filters correctly", () => {
  createRoot((dispose) => {
    const store = createGraphStore()
    store.addNode(createAgentNode("s1", "b1"))
    store.addNode(createAgentNode("s2", "b2"))
    store.addNode(createFrameNode(frame))
    expect(store.nodesByType("agent")).toHaveLength(2)
    expect(store.nodesByType("frame")).toHaveLength(1)
    dispose()
  })
})

test("setViewport updates viewport", () => {
  createRoot((dispose) => {
    const store = createGraphStore()
    store.setViewport({ x: 50, y: 60, zoom: 1.5 })
    expect(store.state.viewport).toEqual({ x: 50, y: 60, zoom: 1.5 })
    dispose()
  })
})

test("initial state is applied", () => {
  createRoot((dispose) => {
    const node = createAgentNode("s1", "b1")
    const store = createGraphStore({
      nodes: [node],
      viewport: { x: 10, y: 20, zoom: 0.5 },
    })
    expect(store.state.nodes).toHaveLength(1)
    expect(store.state.viewport.zoom).toBe(0.5)
    dispose()
  })
})
