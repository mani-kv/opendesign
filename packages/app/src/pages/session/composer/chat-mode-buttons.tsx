import { Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useChatMode } from "@/context/chat-mode"

export function ChatModeButtons() {
  const chat = useChatMode()

  return (
    <div class="flex items-center gap-1">
      <Show when={chat.isMinimized()}>
        <IconButton
          icon="expand"
          size="small"
          title="Maximize"
          onClick={() => chat.maximize()}
        />
        <IconButton
          icon="layout-left"
          size="small"
          title="Dock to sidebar"
          onClick={() => chat.dock()}
        />
      </Show>

      <Show when={chat.isFloat()}>
        <IconButton
          icon="layout-left"
          size="small"
          title="Dock to sidebar"
          onClick={() => chat.dock()}
        />
        <IconButton
          icon="collapse"
          size="small"
          title="Minimize"
          onClick={() => chat.minimize()}
        />
      </Show>

      <Show when={chat.isDocked()}>
        <IconButton
          icon="expand"
          size="small"
          title="Float"
          onClick={() => chat.float()}
        />
      </Show>
    </div>
  )
}
