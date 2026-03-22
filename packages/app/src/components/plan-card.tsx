import { For, Show, createSignal, createMemo } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { PreFlightPlan, ScenarioPlan } from "@opencode-ai/opendesign/agent"
import { Icon } from "@opencode-ai/ui/icon"

type PlanCardState = "active" | "dispatched" | "stale"

export function PlanCard(props: {
  plan: PreFlightPlan
  state?: PlanCardState
  onDispatch?: (scenarios: ScenarioPlan[]) => void
}) {
  const [scenarios, setScenarios] = createStore<ScenarioPlan[]>(
    props.plan.scenarios.map((s) => ({ ...s })),
  )
  const [addInput, setAddInput] = createSignal("")

  const state = () => props.state ?? "active"
  const isActive = () => state() === "active"
  const selectedCount = createMemo(() => scenarios.filter((s) => s.selected).length)

  const toggle = (idx: number) => {
    if (!isActive()) return
    setScenarios(idx, "selected", (v) => !v)
  }

  const addScenario = () => {
    const name = addInput().trim()
    if (!name) return
    setScenarios(
      produce((list) => {
        list.push({ scenario: name, description: "", selected: true })
      }),
    )
    setAddInput("")
  }

  const dispatch = () => {
    const selected = scenarios.filter((s) => s.selected)
    if (selected.length === 0) return
    props.onDispatch?.(selected)
  }

  const buttonLabel = createMemo(() => {
    if (state() === "dispatched") return `Dispatched ${selectedCount()} scenarios`
    const count = selectedCount()
    if (count === scenarios.length) return `Run all ${count}`
    return `Run ${count} selected`
  })

  return (
    <div
      data-component="plan-card"
      classList={{
        "rounded-xl border border-border-base bg-background-base p-4": true,
        "opacity-50 pointer-events-none": state() === "stale",
      }}
    >
      <Show when={props.plan.summary}>
        <p class="text-sm text-text-weak mb-3">{props.plan.summary}</p>
      </Show>

      <div class="flex flex-col gap-1">
        <For each={scenarios}>
          {(scenario, idx) => (
            <button
              class="flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors duration-120 hover:bg-surface-base-hover disabled:hover:bg-transparent"
              disabled={!isActive()}
              onClick={() => toggle(idx())}
            >
              <div class="mt-0.5 shrink-0">
                <Show
                  when={scenario.selected}
                  fallback={
                    <div class="w-4 h-4 rounded border border-border-base" />
                  }
                >
                  <div class="w-4 h-4 rounded bg-blue-500 flex items-center justify-center">
                    <Icon name="check" class="w-3 h-3 text-white" />
                  </div>
                </Show>
              </div>
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="text-sm font-medium text-text-base">{scenario.scenario}</span>
                <Show when={scenario.description}>
                  <span class="text-2xs text-text-weak">{scenario.description}</span>
                </Show>
              </div>
            </button>
          )}
        </For>
      </div>

      <Show when={isActive()}>
        <div class="mt-3">
          <input
            type="text"
            class="w-full px-2.5 py-1.5 rounded-md border border-border-base bg-transparent text-sm text-text-base placeholder:text-text-weak focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="Add scenario..."
            value={addInput()}
            onInput={(e) => setAddInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && addScenario()}
          />
        </div>
      </Show>

      <div class="mt-3 flex justify-end">
        <button
          class="px-4 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          disabled={!isActive() || selectedCount() === 0}
          onClick={dispatch}
        >
          {buttonLabel()}
        </button>
      </div>
    </div>
  )
}
