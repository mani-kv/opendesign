import { For, Show, createEffect, createMemo, on } from "solid-js"
import { SessionTurn } from "@opencode-ai/ui/session-turn"
import { useProjectParams } from "@/context/project-scope"
import { useSync } from "@/context/sync"
import { useSettings } from "@/context/settings"
import { parsePreFlightPlan, type PreFlightPlan } from "@opencode-ai/opendesign/agent"
import type { Part, TextPart, Message as MessageType } from "@opencode-ai/sdk/v2"
import { PlanCard } from "./plan-card"

const emptyMessages: MessageType[] = []

const detectPlan = (parts: Part[] | undefined): PreFlightPlan | null => {
  if (!parts) return null
  for (const part of parts) {
    if (part.type !== "text") continue
    const plan = parsePreFlightPlan((part as TextPart).text)
    if (plan) return plan
  }
  return null
}

export function ChatMessages() {
  const params = useProjectParams()
  const sync = useSync()
  const settings = useSettings()

  let scrollRef: HTMLDivElement | undefined

  const sessionID = createMemo(() => params.id)
  const messages = createMemo(() => {
    const id = sessionID()
    if (!id) return emptyMessages
    return sync.data.message[id] ?? emptyMessages
  })

  const userMessages = createMemo(() => messages().filter((m) => m.role === "user"))

  createEffect(
    on(
      () => messages().length,
      () => {
        requestAnimationFrame(() => {
          scrollRef?.scrollTo({ top: scrollRef.scrollHeight, behavior: "smooth" })
        })
      },
    ),
  )

  return (
    <div ref={(el) => (scrollRef = el)} class="flex-1 overflow-y-auto min-h-0">
      <Show
        when={userMessages().length > 0}
        fallback={
          <div class="flex w-full h-full items-center justify-center text-text-weak text-12-regular">
            Send a message to start
          </div>
        }
      >
        <div class="flex flex-col items-center py-4">
          <For each={userMessages()}>
            {(message) => {
              const messageID = message.id
              const planForMessage = createMemo(() => detectPlan(sync.data.part[messageID]))
              return (
                <div class="min-w-0 w-full max-w-full">
                  <SessionTurn
                    sessionID={sessionID() ?? ""}
                    messageID={messageID}
                    active={false}
                    queued={false}
                    showReasoningSummaries={settings.general.showReasoningSummaries()}
                    shellToolDefaultOpen={settings.general.shellToolPartsExpanded()}
                    editToolDefaultOpen={settings.general.editToolPartsExpanded()}
                    classes={{
                      root: "min-w-0 w-full relative",
                      content: "flex flex-col justify-between !overflow-visible",
                      container: "w-full px-3",
                    }}
                  />
                  <Show when={planForMessage()}>
                    {(p) => (
                      <div class="w-full px-3 mt-2">
                        <PlanCard plan={p()} />
                      </div>
                    )}
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
