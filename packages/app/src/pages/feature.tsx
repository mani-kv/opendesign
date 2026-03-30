import { createSignal, Show, For } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { useProductParams } from "@/context/product-scope"
import { AgentChatProvider, useAgentChat } from "@/context/agent-chat"
import { createStore } from "solid-js/store"
import { useGlobalSync } from "@/context/global-sync"
import InfiniteCanvas from "@/components/canvas/infinite-canvas"
import FeatureHeader from "@/components/canvas/feature-header"

type FeatureAgent = {
  id: string
  title: string
  status: string
  color?: string
}

export default function FeaturePage() {
  const params = useProductParams()
  const globalSync = useGlobalSync()
  const [searchParams, setSearchParams] = useSearchParams()

  const [agents] = createStore<FeatureAgent[]>([])
  const [sidebarWidth] = createSignal(380)

  const selectedAgentId = () => searchParams.agent as string | undefined

  const selectAgent = (id: string) => {
    setSearchParams({ agent: id })
  }

  return (
    <div class="flex size-full">
      <FeatureHeader />
      {/* Canvas area */}
      <div class="flex-1" style={{ "min-width": "0" }}>
        <Show when={params.featureId} keyed fallback={<div class="size-full" />}>
          {(fid) => <InfiniteCanvas featureId={fid} directory={globalSync.data.path.directory} />}
        </Show>
      </div>

      {/* Agent chat sidebar */}
      <Show when={selectedAgentId()}>
        {(agentId) => (
          <div
            class="flex flex-col border-l border-[var(--border)]"
            style={{ width: `${sidebarWidth()}px`, "min-width": "280px", "max-width": "50%" }}
          >
            {/* Agent tabs */}
            <div class="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--background-stronger)]">
              <For each={agents}>
                {(agent) => (
                  <button
                    class="px-2 py-1 text-xs rounded"
                    classList={{
                      "bg-[var(--background-hover)]": agent.id === agentId(),
                      "opacity-60": agent.id !== agentId(),
                    }}
                    onClick={() => selectAgent(agent.id)}
                  >
                    {agent.title}
                  </button>
                )}
              </For>
            </div>

            {/* Chat content */}
            <AgentChatProvider agentID={agentId()}>
              <AgentChatContent />
            </AgentChatProvider>
          </div>
        )}
      </Show>
    </div>
  )
}

function AgentChatContent() {
  const chat = useAgentChat()

  return (
    <div class="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div class="flex-1 overflow-y-auto p-3">
        <Show when={chat.loading()}>
          <p class="text-sm text-[var(--color-text-dimmed)]">Loading...</p>
        </Show>
        <Show when={!chat.loading() && chat.messages().length === 0}>
          <p class="text-sm text-[var(--color-text-dimmed)]">No messages yet</p>
        </Show>
        <For each={chat.messages()}>
          {(msg) => (
            <div class="mb-2 text-sm">
              <span class="font-medium">{msg.role}: </span>
              <span>{msg.id}</span>
            </div>
          )}
        </For>
      </div>

      {/* Minimal composer */}
      <div class="border-t border-[var(--border)] p-2">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const input = (e.target as HTMLFormElement).elements.namedItem("prompt") as HTMLInputElement
            if (!input.value.trim()) return
            const text = input.value
            input.value = ""
            await chat.sendPrompt(text)
          }}
        >
          <input
            name="prompt"
            type="text"
            placeholder="Message agent..."
            class="w-full px-3 py-2 text-sm rounded bg-[var(--background-stronger)] border border-[var(--border)] outline-none focus:border-[var(--color-primary)]"
          />
        </form>
      </div>
    </div>
  )
}
