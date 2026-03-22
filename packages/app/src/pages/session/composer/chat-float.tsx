import { Show, type JSX } from "solid-js"
import { useChatMode } from "@/context/chat-mode"
import { ChatModeButtons } from "./chat-mode-buttons"
import { Icon } from "@opencode-ai/ui/icon"

export function ChatFloat(props: {
  promptInput: JSX.Element
  messageTimeline?: JSX.Element
}) {
  const chat = useChatMode()

  return (
    <Show when={chat.isFloat()}>
      <div class="absolute inset-4 z-50 flex flex-col rounded-xl border border-border-base bg-background-base shadow-xl overflow-hidden pointer-events-auto">
        {/* Header */}
        <div class="flex items-center justify-between px-3 py-2 border-b border-border-base bg-background-base shrink-0">
          <div class="flex items-center gap-1.5 text-text-weak text-2xs select-none">
            <Icon name="grip-vertical" size="small" class="size-3.5" />
            <span>Chat</span>
            <Icon name="grip-vertical" size="small" class="size-3.5" />
          </div>
          <div onMouseDown={(e) => e.stopPropagation()}>
            <ChatModeButtons />
          </div>
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
