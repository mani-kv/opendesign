import { For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import { useAgents, type Agent } from "@/context/agents"
import type { AgentState } from "@opencode-ai/opendesign/types"

function isComplete(state: AgentState) {
  return state === "ready" || state === "approved" || state === "archived"
}

function isApproved(state: AgentState) {
  return state === "approved"
}

function AgentRow(props: { agent: Agent; selected: boolean; onSelect: () => void }) {
  return (
    <button
      class="w-full px-3 py-1 flex items-start gap-2.5 text-left rounded-md border transition-colors duration-120"
      classList={{
        "bg-[var(--surface-base-active)] border-[var(--border-weak-base)] text-text-strong": props.selected,
        "bg-transparent border-transparent hover:bg-[var(--surface-base-hover)] text-text-base": !props.selected,
      }}
      onClick={props.onSelect}
    >
      <div class="shrink-0 mt-1">
        {isComplete(props.agent.state) ? (
          <div
            class="size-4 flex items-center justify-center rounded-full"
            classList={{
              "bg-[var(--icon-success-base)]": isApproved(props.agent.state),
            }}
          >
            <Icon
              name="circle-check"
              size="small"
              style={{ color: isApproved(props.agent.state) ? "var(--background-base)" : "var(--icon-success-base)" }}
            />
          </div>
        ) : (
          <Spinner class="size-4" />
        )}
      </div>
      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
        <div class="text-13-medium text-text-base truncate">{props.agent.scenario}</div>
        <div class="text-11-regular text-text-dimmer truncate">{props.agent.branch}</div>
      </div>
    </button>
  )
}

export function AgentsPanel() {
  const language = useLanguage()
  const agents = useAgents()

  return (
    <div class="flex flex-col min-h-0 h-full bg-background-stronger shrink-0">
      <div class="shrink-0 px-3 py-2.5">
        <div class="text-13-medium text-text-dimmer">{language.t("agents.panel.title")}</div>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2 flex flex-col gap-2">
        <Show
          when={agents.agents.length > 0}
          fallback={
            <div class="px-3 py-8 text-center text-12-regular text-text-weak">
              No agents yet. Send a prompt to create scenarios.
            </div>
          }
        >
          <For each={agents.agents}>
            {(agent) => (
              <AgentRow
                agent={agent}
                selected={agents.selectedId() === agent.id}
                onSelect={() => agents.select(agent.id)}
              />
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}
