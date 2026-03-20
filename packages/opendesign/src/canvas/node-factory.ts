import type { FrameNode, AgentNode, PersonaNode, ContextNode, CanvasEdge } from "../types/node"
import type { FigmaFrame } from "../types/figma"
import type { Persona } from "../types/persona"
import type { ContextDocument } from "../types/context-doc"

let counter = 0
function uid(prefix: string) {
  return `${prefix}_${++counter}_${Date.now().toString(36)}`
}

export function createFrameNode(frame: FigmaFrame, x = 0, y = 0): FrameNode {
  return {
    id: uid("frame"),
    type: "frame",
    x,
    y,
    width: 280,
    height: 200,
    data: { frame },
  }
}

export function createAgentNode(scenario: string, branch: string, x = 0, y = 0): AgentNode {
  return {
    id: uid("agent"),
    type: "agent",
    x,
    y,
    width: 320,
    height: 240,
    data: {
      scenario,
      branch,
      state: "created",
    },
  }
}

export function createPersonaNode(persona: Persona, x = 0, y = 0): PersonaNode {
  return {
    id: uid("persona"),
    type: "persona",
    x,
    y,
    width: 200,
    height: 120,
    data: { persona },
  }
}

export function createContextNode(document: ContextDocument, x = 0, y = 0): ContextNode {
  return {
    id: uid("context"),
    type: "context",
    x,
    y,
    width: 200,
    height: 100,
    data: { document },
  }
}

export function createEdge(source: string, target: string, type: CanvasEdge["type"] = "flow"): CanvasEdge {
  return {
    id: uid("edge"),
    source,
    target,
    type,
  }
}
