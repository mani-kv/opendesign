const defaults: Record<string, string> = {
  prototype: "var(--icon-agent-build-base)",
  ask: "var(--icon-agent-ask-base)",
}

export function agentColor(name: string, custom?: string) {
  if (custom) return custom
  return defaults[name] ?? defaults[name.toLowerCase()]
}
