import { createSignal, createMemo } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import type { AgentState } from "@opencode-ai/opendesign/types"

export interface Agent {
  id: string
  scenario: string
  branch: string
  state: AgentState
  sessionId?: string
}

export const { use: useAgents, provider: AgentsProvider } = createSimpleContext({
  name: "Agents",
  init: () => {
    const [agents, setAgents] = createStore<Agent[]>([])
    const [selectedId, setSelectedId] = createSignal<string | undefined>(undefined)
    const selected = createMemo(() => agents.find((a) => a.id === selectedId()))

    const addAgent = (agent: Agent) => {
      setAgents(produce((list) => list.push(agent)))
      if (agents.length === 1) setSelectedId(agent.id)
    }

    const removeAgent = (id: string) => {
      setAgents((prev) => prev.filter((a) => a.id !== id))
      if (selectedId() === id) {
        setSelectedId(agents[0]?.id)
      }
    }

    const updateAgent = (id: string, updates: Partial<Omit<Agent, "id">>) => {
      setAgents(
        (a) => a.id === id,
        (agent) => ({ ...agent, ...updates }),
      )
    }

    return {
      agents,
      selectedId,
      selected,
      select: setSelectedId,
      addAgent,
      removeAgent,
      updateAgent,
    }
  },
})
