import { createContext, onMount, useContext, type ParentProps } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useSDK } from "./sdk"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"

type AgentChatState = {
  messages: Message[]
  parts: Record<string, Part[]>
  loading: boolean
}

type AgentChatContext = {
  agentID: string
  messages: () => Message[]
  parts: (messageID: string) => Part[]
  loading: () => boolean
  sendPrompt: (content: string, options?: { modelID?: string }) => Promise<void>
  abort: () => Promise<void>
}

const AgentChatCtx = createContext<AgentChatContext>()

export function AgentChatProvider(props: ParentProps & { agentID: string }) {
  const sdk = useSDK()

  const [state, setState] = createStore<AgentChatState>({
    messages: [],
    parts: {},
    loading: false,
  })

  const loadMessages = async () => {
    setState("loading", true)
    try {
      const result = await sdk.client.agent.messages({ agentID: props.agentID })
      const msgs = result.data ?? []
      setState(
        "messages",
        reconcile(msgs.map((m) => m.info)),
      )
      for (const m of msgs) {
        setState("parts", m.info.id, reconcile(m.parts))
      }
    } finally {
      setState("loading", false)
    }
  }

  onMount(() => {
    loadMessages()
  })

  const sendPrompt = async (content: string, _options?: { modelID?: string }) => {
    await sdk.client.agent.promptAsync({
      agentID: props.agentID,
      parts: [{ type: "text", text: content }],
    })
    await loadMessages()
  }

  const abort = async () => {
    await sdk.client.agent.abort({ agentID: props.agentID })
  }

  const ctx: AgentChatContext = {
    agentID: props.agentID,
    messages: () => state.messages,
    parts: (messageID: string) => state.parts[messageID] ?? [],
    loading: () => state.loading,
    sendPrompt,
    abort,
  }

  return <AgentChatCtx.Provider value={ctx}>{props.children}</AgentChatCtx.Provider>
}

export function useAgentChat(): AgentChatContext {
  const ctx = useContext(AgentChatCtx)
  if (!ctx) throw new Error("useAgentChat must be used within AgentChatProvider")
  return ctx
}
