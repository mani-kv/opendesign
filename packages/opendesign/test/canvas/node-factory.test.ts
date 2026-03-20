import { test, expect } from "bun:test"
import { createFrameNode, createAgentNode, createContextNode, createEdge } from "../../src/canvas/node-factory"
import type { FigmaFrame } from "../../src/types/figma"
import type { ContextDocument } from "../../src/types/context-doc"

const frame: FigmaFrame = {
  nodeId: "1:2",
  name: "Login Screen",
  fileKey: "abc123",
  width: 375,
  height: 812,
}

test("createFrameNode creates node with correct type", () => {
  const node = createFrameNode(frame, 100, 200)
  expect(node.type).toBe("frame")
  expect(node.x).toBe(100)
  expect(node.y).toBe(200)
  expect(node.data.frame).toEqual(frame)
  expect(node.id).toContain("frame_")
})

test("createAgentNode creates node with created state", () => {
  const node = createAgentNode("empty-cart", "agent/empty-cart")
  expect(node.type).toBe("agent")
  expect(node.data.state).toBe("created")
  expect(node.data.scenario).toBe("empty-cart")
  expect(node.data.branch).toBe("agent/empty-cart")
})

test("createContextNode creates node with document", () => {
  const doc: ContextDocument = {
    id: "doc1",
    name: "PRD.md",
    type: "markdown",
    path: ".opendesign/context/PRD.md",
    addedAt: Date.now(),
    indexed: false,
  }
  const node = createContextNode(doc, 50, 50)
  expect(node.type).toBe("context")
  expect(node.data.document.name).toBe("PRD.md")
})

test("createEdge connects two nodes", () => {
  const edge = createEdge("frame_1", "agent_1", "flow")
  expect(edge.source).toBe("frame_1")
  expect(edge.target).toBe("agent_1")
  expect(edge.type).toBe("flow")
})

test("each node gets a unique id", () => {
  const a = createAgentNode("s1", "b1")
  const b = createAgentNode("s2", "b2")
  expect(a.id).not.toBe(b.id)
})
