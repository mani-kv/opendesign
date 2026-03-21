import { For } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import { useAgents, type DemoAgent } from "@/context/agents"
import type { AgentState } from "@opencode-ai/opendesign/types"

function isComplete(state: AgentState) {
  return state === "ready" || state === "approved" || state === "archived"
}

function isApproved(state: AgentState) {
  return state === "approved"
}

function AgentRow(props: { agent: DemoAgent; selected: boolean; onSelect: () => void }) {
  return (
    <button
      class="w-full px-3 py-2 flex items-start gap-2.5 text-left rounded-md transition-colors"
      classList={{
        "bg-background-base": props.selected,
        "hover:bg-background-base/60": !props.selected,
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
      <div class="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2 flex flex-col">
        <For each={agents.agents}>
          {(agent) => (
            <AgentRow
              agent={agent}
              selected={agents.selectedId() === agent.id}
              onSelect={() => agents.select(agent.id)}
            />
          )}
        </For>
      </div>
    </div>
  )
}
