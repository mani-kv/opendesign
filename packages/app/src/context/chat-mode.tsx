import { createSignal, createMemo } from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"

export type ChatMode = "minimized" | "float" | "docked"

export const { use: useChatMode, provider: ChatModeProvider } = createSimpleContext({
  name: "ChatMode",
  init: () => {
    const [mode, setMode] = createSignal<ChatMode>("minimized")

    const maximize = () => setMode("float")
    const minimize = () => setMode("minimized")
    const dock = () => setMode("docked")
    const float = () => setMode("float")

    const isMinimized = createMemo(() => mode() === "minimized")
    const isFloat = createMemo(() => mode() === "float")
    const isDocked = createMemo(() => mode() === "docked")

    return {
      mode,
      setMode,
      maximize,
      minimize,
      dock,
      float,
      isMinimized,
      isFloat,
      isDocked,
    }
  },
})
