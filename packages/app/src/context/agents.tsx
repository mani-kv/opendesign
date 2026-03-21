import { createSignal, createMemo } from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"
import type { AgentState } from "@opencode-ai/opendesign/types"

export interface DemoAgent {
  id: string
  scenario: string
  branch: string
  state: AgentState
}

const DEMO_AGENTS: DemoAgent[] = [
  {
    id: "agent-hello-world",
    scenario: "Hello World Prototype",
    branch: "agent/hello-world",
    state: "ready",
  },
  {
    id: "agent-checkout-flow",
    scenario: "Checkout Flow — Happy Path",
    branch: "agent/checkout-happy",
    state: "working",
  },
  {
    id: "agent-empty-state",
    scenario: "Empty Cart State",
    branch: "agent/empty-cart",
    state: "waiting",
  },
]

export const { use: useAgents, provider: AgentsProvider } = createSimpleContext({
  name: "Agents",
  init: () => {
    const [selectedId, setSelectedId] = createSignal<string>(DEMO_AGENTS[0].id)
    const selected = createMemo(() => DEMO_AGENTS.find((a) => a.id === selectedId()))

    return {
      agents: DEMO_AGENTS,
      selectedId,
      selected,
      select: setSelectedId,
    }
  },
})
