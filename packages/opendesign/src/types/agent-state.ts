import z from "zod"

export const AgentState = z.enum(["created", "working", "waiting", "ready", "approved", "archived"])
export type AgentState = z.infer<typeof AgentState>
