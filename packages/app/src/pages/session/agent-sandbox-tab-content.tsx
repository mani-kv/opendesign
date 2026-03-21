import { Show } from "solid-js"
import { Mark } from "@opencode-ai/ui/logo"
import { useLanguage } from "@/context/language"
import { createGraphStore } from "@opencode-ai/opendesign"
import { AgentSandboxCanvas } from "./agent-sandbox/canvas"

export function AgentSandboxTabContent() {
  const language = useLanguage()
  const graph = createGraphStore()

  return (
    <div class="relative size-full min-h-0 min-w-0">
      <Show
        when={graph.state.nodes.length > 0}
        fallback={
          <div class="h-full px-6 pb-24 flex flex-col items-center justify-center gap-6">
            <Mark class="w-14 opacity-10" />
            <div class="text-14-regular text-text-weak max-w-56 text-center">
              {language.t("session.sandbox.empty")}
            </div>
          </div>
        }
      >
        <div class="absolute inset-0">
          <AgentSandboxCanvas graph={graph} />
        </div>
      </Show>
    </div>
  )
}
