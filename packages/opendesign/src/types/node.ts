import z from "zod"
import { AgentState } from "./agent-state"
import { FigmaFrame } from "./figma"
import { Persona } from "./persona"
import { ContextDocument } from "./context-doc"
import { CheckpointInfo, MergeResult } from "./git"

const BaseNode = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
})

export const FrameNode = BaseNode.extend({
  type: z.literal("frame"),
  data: z.object({
    frame: FigmaFrame,
  }),
})
export type FrameNode = z.infer<typeof FrameNode>

export const AgentNode = BaseNode.extend({
  type: z.literal("agent"),
  data: z.object({
    scenario: z.string(),
    branch: z.string(),
    state: AgentState,
    sessionId: z.string().optional(),
    sandpackId: z.string().optional(),
  }),
})
export type AgentNode = z.infer<typeof AgentNode>

export const PersonaNode = BaseNode.extend({
  type: z.literal("persona"),
  data: z.object({
    persona: Persona,
  }),
})
export type PersonaNode = z.infer<typeof PersonaNode>

export const ContextNode = BaseNode.extend({
  type: z.literal("context"),
  data: z.object({
    document: ContextDocument,
  }),
})
export type ContextNode = z.infer<typeof ContextNode>

export const CheckpointNode = BaseNode.extend({
  type: z.literal("checkpoint"),
  data: z.object({
    checkpoint: CheckpointInfo,
  }),
})
export type CheckpointNode = z.infer<typeof CheckpointNode>

export const MergedNode = BaseNode.extend({
  type: z.literal("merged"),
  data: z.object({
    result: MergeResult,
    sourceNodeIds: z.array(z.string()),
  }),
})
export type MergedNode = z.infer<typeof MergedNode>

export const CanvasNode = z.discriminatedUnion("type", [
  FrameNode,
  AgentNode,
  PersonaNode,
  ContextNode,
  CheckpointNode,
  MergedNode,
])
export type CanvasNode = z.infer<typeof CanvasNode>

export const CanvasEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.enum(["flow", "context", "checkpoint"]).optional(),
})
export type CanvasEdge = z.infer<typeof CanvasEdge>
