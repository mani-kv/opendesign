import { createStore, produce } from "solid-js/store"
import type { CanvasNode, CanvasEdge } from "../types/node"

export interface GraphState {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: { x: number; y: number; zoom: number }
}

export function createGraphStore(initial?: Partial<GraphState>) {
  const [state, setState] = createStore<GraphState>({
    nodes: initial?.nodes ?? [],
    edges: initial?.edges ?? [],
    viewport: initial?.viewport ?? { x: 0, y: 0, zoom: 1 },
  })

  return {
    state,
    addNode(node: CanvasNode) {
      setState("nodes", (prev) => [...prev, node])
    },
    removeNode(id: string) {
      setState(
        produce((s) => {
          s.nodes = s.nodes.filter((n) => n.id !== id)
          s.edges = s.edges.filter((e) => e.source !== id && e.target !== id)
        }),
      )
    },
    updateNode<T extends CanvasNode>(id: string, updater: (node: T) => void) {
      setState(
        produce((s) => {
          const node = s.nodes.find((n) => n.id === id) as T | undefined
          if (node) updater(node)
        }),
      )
    },
    addEdge(edge: CanvasEdge) {
      setState("edges", (prev) => [...prev, edge])
    },
    removeEdge(id: string) {
      setState("edges", (prev) => prev.filter((e) => e.id !== id))
    },
    setViewport(vp: { x: number; y: number; zoom: number }) {
      setState("viewport", vp)
    },
    clear() {
      setState({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } })
    },
    nodeById(id: string) {
      return state.nodes.find((n) => n.id === id)
    },
    nodesByType<T extends CanvasNode["type"]>(type: T) {
      return state.nodes.filter((n) => n.type === type) as Extract<CanvasNode, { type: T }>[]
    },
  }
}

export type GraphStore = ReturnType<typeof createGraphStore>
