import type { AgentState } from "../types/agent-state"

const defaults: Record<string, string> = {
  prototype: "var(--icon-agent-build-base)",
  ask: "var(--icon-agent-ask-base)",
}

export function agentColor(name: string, custom?: string) {
  if (custom) return custom
  return defaults[name] ?? defaults[name.toLowerCase()]
}

const stateColors: Record<AgentState, string> = {
  created: "var(--text-dimmer)",
  working: "var(--icon-info-base)",
  waiting: "var(--icon-warning-base)",
  ready: "var(--icon-success-base)",
  approved: "var(--icon-success-base)",
  archived: "var(--text-dimmer)",
}

export function stateColor(state: string): string {
  return stateColors[state as AgentState] ?? "var(--text-dimmer)"
}
