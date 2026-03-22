import { Show, type JSX } from "solid-js"
import { useChatMode } from "@/context/chat-mode"
import { ChatModeButtons } from "./chat-mode-buttons"

export function ChatDock(props: {
  promptInput: JSX.Element
  messageTimeline?: JSX.Element
}) {
  const chat = useChatMode()

  return (
    <Show when={chat.isDocked()}>
      <div class="flex flex-col h-full border-r border-border-base bg-background-base shrink-0" style={{ width: "320px" }}>
        {/* Header */}
        <div class="flex items-center justify-between px-3 py-2 border-b border-border-base shrink-0">
          <span class="text-2xs text-text-weak font-medium">Chat</span>
          <ChatModeButtons />
        </div>

        {/* Messages */}
        <div class="flex-1 overflow-y-auto min-h-0">
          {props.messageTimeline}
        </div>

        {/* Prompt input */}
        <div class="shrink-0 border-t border-border-base p-2">
          {props.promptInput}
        </div>
      </div>
    </Show>
  )
}
