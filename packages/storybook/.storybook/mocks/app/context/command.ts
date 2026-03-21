const keybinds: Record<string, string> = {
  "file.attach": "mod+u",
  "permissions.autoaccept": "mod+shift+a",
  "agent.cycle": "mod+.",
  "model.choose": "mod+m",
  "model.variant.cycle": "mod+shift+m",
}

export function useCommand() {
  return {
    options: [],
    register() {
      return () => undefined
    },
    trigger() {},
    keybind(id: string) {
      return keybinds[id]
    },
  }
}
