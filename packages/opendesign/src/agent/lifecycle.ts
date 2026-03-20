import type { AgentState } from "../types/agent-state"

const transitions: Record<AgentState, AgentState[]> = {
  created: ["working"],
  working: ["waiting", "ready"],
  waiting: ["working"],
  ready: ["approved", "working"],
  approved: ["archived"],
  archived: [],
}

export function canTransition(from: AgentState, to: AgentState): boolean {
  return transitions[from].includes(to)
}

export function transition(from: AgentState, to: AgentState): AgentState {
  if (!canTransition(from, to))
    throw new Error(`invalid agent state transition: ${from} → ${to}`)
  return to
}

export function isTerminal(state: AgentState): boolean {
  return transitions[state].length === 0
}
