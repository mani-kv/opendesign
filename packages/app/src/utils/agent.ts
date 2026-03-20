const defaults: Record<string, string> = {
  "opendesign-agent": "var(--icon-agent-build-base)",
  "opendesign-ask": "var(--icon-agent-ask-base)",
}

export function agentColor(name: string, custom?: string) {
  if (custom) return custom
  return defaults[name] ?? defaults[name.toLowerCase()]
}
