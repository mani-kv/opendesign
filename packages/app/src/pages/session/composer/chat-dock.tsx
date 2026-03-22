import { Show, type JSX } from "solid-js"
import { useChatMode } from "@/context/chat-mode"
import { useAgents } from "@/context/agents"
import { stateColor } from "@opencode-ai/opendesign/agent"
import { ChatModeButtons } from "./chat-mode-buttons"

export function ChatDock(props: {
  promptInput: JSX.Element
  messageTimeline?: JSX.Element
}) {
  const chat = useChatMode()
  const agents = useAgents()
  const focusedAgent = () => agents.selected()
  const agentColor = () => focusedAgent() ? stateColor(focusedAgent()!.state) : undefined

  return (
    <Show when={chat.isDocked()}>
      <div
        class="flex flex-col h-full border-r border-border-base bg-background-base shrink-0 transition-shadow duration-300"
        classList={{
          "shadow-[inset_-2px_0_12px_rgba(66,185,209,0.15)]": !!focusedAgent(),
        }}
        style={{ width: "320px" }}
      >
        {/* Header */}
        <div class="flex items-center justify-between px-3 py-2 border-b border-border-base shrink-0">
          <Show
            when={focusedAgent()}
            fallback={<span class="text-2xs text-text-weak font-medium">Chat</span>}
          >
            {(agent) => (
              <div class="flex items-center gap-1.5">
                <div class="size-2 rounded-full shrink-0" style={{ "background-color": agentColor() }} />
                <span class="text-2xs font-medium text-text-base truncate max-w-40">{agent().scenario}</span>
              </div>
            )}
          </Show>
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
