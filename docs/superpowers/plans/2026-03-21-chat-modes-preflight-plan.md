# Chat Modes & Pre-flight Decomposition UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three chat modes (minimized/float/docked) to the prompt input and a pre-flight plan card UI that renders orchestrator scenario plans inline in the message timeline.

**Architecture:** The chat mode is managed by a new `chatMode` signal in the layout context. The plan card is a client-side component that detects plan JSON in assistant messages via the existing `parsePreFlightPlan()` function and renders interactive scenario cards. Dispatch sends a follow-up user message with selected scenarios — no new API endpoints needed.

**Tech Stack:** SolidJS, existing `@opencode-ai/ui` components, existing `@opencode-ai/opendesign/agent` types, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-03-21-chat-modes-preflight-plan-design.md`

---

## File Structure

| File                                                                  | Action | Responsibility                                                      |
| --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| `packages/app/src/context/layout.tsx`                                 | Modify | Add `chatMode` signal to layout context                             |
| `packages/app/src/context/chat-mode.tsx`                              | Create | Chat mode context: mode state, transitions, auto-behaviors          |
| `packages/app/src/pages/session/composer/session-composer-region.tsx` | Modify | Wrap prompt in mode-aware container                                 |
| `packages/app/src/pages/session/composer/chat-float.tsx`              | Create | Float maximized chat panel (messages + input)                       |
| `packages/app/src/pages/session/composer/chat-dock.tsx`               | Create | Docked sidebar chat panel                                           |
| `packages/app/src/pages/session/composer/chat-mode-buttons.tsx`       | Create | Mode toggle buttons for drag handle                                 |
| `packages/app/src/pages/session/session-side-panel.tsx`               | Modify | Insert docked chat panel in layout                                  |
| `packages/app/src/components/plan-card.tsx`                           | Create | Pre-flight plan card component                                      |
| `packages/app/src/components/plan-card.css`                           | Create | Plan card styles                                                    |
| `packages/app/src/pages/session/message-timeline.tsx`                 | Modify | Render PlanCard alongside SessionTurn for messages containing plans |

---

## Task 1: Chat Mode Context

**Files:**

- Create: `packages/app/src/context/chat-mode.tsx`
- Modify: `packages/app/src/context/layout.tsx`

- [ ] **Step 1: Create chat-mode context with mode signal and transitions**

```typescript
// packages/app/src/context/chat-mode.tsx
import { createSignal, createMemo } from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"

export type ChatMode = "minimized" | "float" | "docked"

export const { use: useChatMode, provider: ChatModeProvider } = createSimpleContext("ChatMode", () => {
  const [mode, setMode] = createSignal<ChatMode>("minimized")

  const maximize = () => setMode("float")
  const minimize = () => setMode("minimized")
  const dock = () => setMode("docked")
  const float = () => setMode("float")

  const isMinimized = createMemo(() => mode() === "minimized")
  const isFloat = createMemo(() => mode() === "float")
  const isDocked = createMemo(() => mode() === "docked")

  return {
    mode,
    setMode,
    maximize,
    minimize,
    dock,
    float,
    isMinimized,
    isFloat,
    isDocked,
  }
})
```

- [ ] **Step 2: Wire ChatModeProvider into the app provider hierarchy**

In `packages/app/src/app.tsx` or the session-level provider, wrap the session content with `<ChatModeProvider>`. Find where `AgentsProvider` is rendered and add `ChatModeProvider` at the same level.

- [ ] **Step 3: Verify the context is accessible**

Run: `cd packages/app && bun run test:unit`
Expected: No regressions. Context is wired but not yet consumed.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/context/chat-mode.tsx
git commit -m "feat(app): add chat mode context with minimized/float/docked states"
```

---

## Task 2: Chat Mode Toggle Buttons

**Files:**

- Create: `packages/app/src/pages/session/composer/chat-mode-buttons.tsx`

- [ ] **Step 1: Create mode toggle button component**

```typescript
// packages/app/src/pages/session/composer/chat-mode-buttons.tsx
import { Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useChatMode } from "@/context/chat-mode"

export function ChatModeButtons() {
  const chat = useChatMode()

  return (
    <div class="flex items-center gap-1">
      <Show when={chat.isMinimized()}>
        <IconButton
          icon="expand"
          size="small"
          title="Maximize"
          onClick={() => chat.maximize()}
        />
        <IconButton
          icon="layout-left"
          size="small"
          title="Dock to sidebar"
          onClick={() => chat.dock()}
        />
      </Show>

      <Show when={chat.isFloat()}>
        <IconButton
          icon="layout-left"
          size="small"
          title="Dock to sidebar"
          onClick={() => chat.dock()}
        />
        <IconButton
          icon="collapse"
          size="small"
          title="Minimize"
          onClick={() => chat.minimize()}
        />
      </Show>

      <Show when={chat.isDocked()}>
        <IconButton
          icon="expand"
          size="small"
          title="Float"
          onClick={() => chat.float()}
        />
      </Show>
    </div>
  )
}
```

- [ ] **Step 2: Verify icon names exist in the UI library**

Check `packages/ui/src/components/icon.stories.tsx` for available icon names. Substitute if `expand`, `panel-left`, or `minimize` don't exist — use the closest match (e.g., `dash` for minimize, `expand` for maximize).

- [ ] **Step 3: Add ChatModeButtons to the prompt input drag handle**

In `packages/app/src/components/prompt-input.tsx`, find the drag handle area (the `:: Drag Me ::` header). Add `<ChatModeButtons />` to the right side of the drag handle, next to the existing expand/collapse button.

- [ ] **Step 4: Run typecheck**

Run: `cd packages/app && bun turbo typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/session/composer/chat-mode-buttons.tsx
git commit -m "feat(app): add chat mode toggle buttons to prompt drag handle"
```

---

## Task 3: Float Maximized Chat Panel

**Files:**

- Create: `packages/app/src/pages/session/composer/chat-float.tsx`
- Modify: `packages/app/src/pages/session/composer/session-composer-region.tsx`

- [ ] **Step 1: Create the float chat panel component**

The float panel is a larger floating container overlaying the sandbox area. It shows:

- Message history (reuse the existing message timeline)
- Plan cards (added in Task 5)
- Prompt input at the bottom

```typescript
// packages/app/src/pages/session/composer/chat-float.tsx
import { Show } from "solid-js"
import { useChatMode } from "@/context/chat-mode"
import { ChatModeButtons } from "./chat-mode-buttons"

export function ChatFloat(props: {
  children: any // prompt input slot
  messages?: any // message timeline slot
}) {
  const chat = useChatMode()

  return (
    <Show when={chat.isFloat()}>
      <div class="absolute inset-4 bottom-4 z-50 flex flex-col rounded-xl border border-border-base bg-background-base shadow-xl overflow-hidden pointer-events-auto">
        {/* Header with drag handle and mode buttons */}
        <div class="flex items-center justify-between px-3 py-2 border-b border-border-base bg-background-base cursor-grab">
          <div class="flex items-center gap-1.5 text-text-weak text-2xs select-none">
            <span class="tracking-wider">::</span>
            <span>Chat</span>
            <span class="tracking-wider">::</span>
          </div>
          <ChatModeButtons />
        </div>

        {/* Messages area */}
        <div class="flex-1 overflow-y-auto min-h-0 p-4">
          {props.messages}
        </div>

        {/* Prompt input */}
        <div class="shrink-0 border-t border-border-base p-2">
          {props.children}
        </div>
      </div>
    </Show>
  )
}
```

- [ ] **Step 2: Integrate float panel into the session composer region**

In `packages/app/src/pages/session/composer/session-composer-region.tsx`, wrap the existing `PromptInput` render in a `Switch`/`Match` or `Show` that checks `chatMode`:

- If minimized: render current layout (existing behavior)
- If float: render `<ChatFloat>` with `PromptInput` as child

- [ ] **Step 3: Test visually**

Run: `cd packages/app && bun run dev`
Click the maximize button on the prompt drag handle. Verify the float panel appears overlaying the sandbox.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/pages/session/composer/chat-float.tsx
git commit -m "feat(app): add float maximized chat panel with message display"
```

---

## Task 4: Docked Sidebar Chat Panel

**Files:**

- Create: `packages/app/src/pages/session/composer/chat-dock.tsx`
- Modify: `packages/app/src/pages/session/session-side-panel.tsx`

- [ ] **Step 1: Create the docked chat panel component**

```typescript
// packages/app/src/pages/session/composer/chat-dock.tsx
import { Show } from "solid-js"
import { useChatMode } from "@/context/chat-mode"
import { ChatModeButtons } from "./chat-mode-buttons"

export function ChatDock(props: {
  children: any // prompt input slot
  messages?: any // message timeline slot
}) {
  const chat = useChatMode()

  return (
    <Show when={chat.isDocked()}>
      <div class="flex flex-col h-full border-r border-border-base bg-background-base" style={{ width: "320px" }}>
        {/* Header */}
        <div class="flex items-center justify-between px-3 py-2 border-b border-border-base">
          <span class="text-2xs text-text-weak font-medium">Chat</span>
          <ChatModeButtons />
        </div>

        {/* Messages area */}
        <div class="flex-1 overflow-y-auto min-h-0 p-3">
          {props.messages}
        </div>

        {/* Prompt input */}
        <div class="shrink-0 border-t border-border-base p-2">
          {props.children}
        </div>
      </div>
    </Show>
  )
}
```

- [ ] **Step 2: Insert docked chat panel into session layout**

In `packages/app/src/pages/session/session-side-panel.tsx`, find where the agents panel and sandbox are laid out. When `chatMode === "docked"`, insert `<ChatDock>` to the left of the agents panel in the flex container. Layout becomes: `[ChatDock] [AgentsPanel] [Sandbox]`.

- [ ] **Step 3: Hide minimized prompt input when docked**

In `session-composer-region.tsx`, hide the minimized prompt bar when `isDocked()` is true — the input now lives inside the dock panel.

- [ ] **Step 4: Test visually**

Run: `cd packages/app && bun run dev`
Click dock button → verify chat appears as left sidebar. Click float button → verify it switches to float overlay.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/session/composer/chat-dock.tsx
git commit -m "feat(app): add docked sidebar chat panel with layout integration"
```

---

## Task 5: Plan Card Component

**Files:**

- Create: `packages/app/src/components/plan-card.tsx`
- Create: `packages/app/src/components/plan-card.css`

- [ ] **Step 1: Create the plan card component**

```typescript
// packages/app/src/components/plan-card.tsx
import { For, Show, createSignal, createMemo } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { PreFlightPlan, ScenarioPlan } from "@opencode-ai/opendesign/agent"
import { Icon } from "@opencode-ai/ui/icon"
import "./plan-card.css"

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
        "plan-card": true,
        "plan-card-stale": state() === "stale",
      }}
    >
      <Show when={props.plan.summary}>
        <p class="text-sm text-text-dimmed-base mb-3">{props.plan.summary}</p>
      </Show>

      <div class="flex flex-col gap-2">
        <For each={scenarios}>
          {(scenario, idx) => (
            <button
              class="flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors duration-120 hover:bg-surface-base-hover"
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
              <div class="flex flex-col gap-0.5">
                <span class="text-sm font-medium text-text-base">{scenario.scenario}</span>
                <Show when={scenario.description}>
                  <span class="text-2xs text-text-dimmed-base">{scenario.description}</span>
                </Show>
              </div>
            </button>
          )}
        </For>
      </div>

      <Show when={isActive()}>
        <div class="mt-3 flex items-center gap-2">
          <input
            type="text"
            class="flex-1 px-2.5 py-1.5 rounded-md border border-border-base bg-transparent text-sm text-text-base placeholder:text-text-dimmed-base focus:outline-none focus:border-blue-500"
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
```

- [ ] **Step 2: Create plan card styles**

```css
/* packages/app/src/components/plan-card.css */
.plan-card {
  @apply rounded-xl border border-border-base bg-surface-base p-4;
}

.plan-card-stale {
  @apply opacity-50 pointer-events-none;
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/app && bun turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/plan-card.tsx packages/app/src/components/plan-card.css
git commit -m "feat(app): add pre-flight plan card component with scenario selection"
```

---

## Task 6: Plan Detection in Message Timeline

**Files:**

- Modify: `packages/app/src/pages/session/message-timeline.tsx`

The plan card renders alongside (after) the `SessionTurn` for messages containing valid plan JSON. This avoids modifying the UI package's internal `PART_MAPPING` or `TextPartDisplay`.

- [ ] **Step 1: Add plan detection to message-timeline.tsx**

In `packages/app/src/pages/session/message-timeline.tsx`, import `parsePreFlightPlan` and `PlanCard`. The message data is available via the `useSync()` context. `SessionTurn` receives `sessionID` and `messageID` props — the sync store holds the full message data.

Add a helper that extracts text content from an assistant message's parts and runs `parsePreFlightPlan()`:

```typescript
import { parsePreFlightPlan } from "@opencode-ai/opendesign/agent"
import { PlanCard } from "@/components/plan-card"

// Helper to detect plan in a message's text parts
const detectPlan = (message: MessageType | undefined) => {
  if (!message || message.role !== "assistant") return null
  const textParts = message.parts.filter((p): p is TextPart => p.type === "text")
  for (const part of textParts) {
    const plan = parsePreFlightPlan(part.text)
    if (plan) return plan
  }
  return null
}
```

- [ ] **Step 2: Render PlanCard after SessionTurn when plan detected**

In the `For` loop that renders messages (around line 806), after the `<SessionTurn>` component, add a `<Show>` block that renders `PlanCard` when a plan is detected in that message:

```tsx
;<SessionTurn
  sessionID={sessionID() ?? ""}
  messageID={messageID}
  // ...existing props
/>
{
  /* Plan card rendered after the turn if message contains a plan */
}
;<Show when={detectPlan(sync.data.message?.find((m) => m.id === messageID))}>
  {(plan) => (
    <div class="w-full px-4 md:px-5 mt-2">
      <PlanCard plan={plan()} />
    </div>
  )}
</Show>
```

Note: The exact way to access the message object depends on how `sync.data` stores messages. Read the sync context to find the correct accessor — likely `sync.data.message` is an array or a record keyed by message ID.

- [ ] **Step 3: Test visually**

Create a test scenario: temporarily modify the orchestrator's `agent.txt` prompt to always return a plan JSON block, or inject a test message via the SDK. Verify the plan card renders below the assistant message that contains the plan.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(app): render pre-flight plan cards in message timeline"
```

---

## Task 7: Plan Dispatch and State Management

**Files:**

- Modify: `packages/app/src/components/plan-card.tsx`
- Modify: `packages/app/src/pages/session/message-timeline.tsx`

- [ ] **Step 1: Wire dispatch to send a follow-up user message**

When the user clicks "Run N selected", send a new user message to the session with the selected scenarios. Check `packages/app/src/components/prompt-input/submit.ts` for the SDK API call pattern (`createPromptSubmit` / `sdk.client.session.send()`).

In `message-timeline.tsx`, pass an `onDispatch` callback to `PlanCard` that uses the SDK context:

```typescript
const sdk = useSDK()

const handleDispatch = async (scenarios: ScenarioPlan[]) => {
  const payload = JSON.stringify({ scenarios }, null, 2)
  const message = `Dispatch these scenarios:\n\`\`\`json\n${payload}\n\`\`\``
  await sdk.client.session.send({
    sessionID: sessionID(),
    parts: [{ type: "text", text: message }],
  })
}
```

- [ ] **Step 2: Track plan card state (active → dispatched → stale)**

Add plan state tracking to `message-timeline.tsx`. Use a `createSignal<Record<string, PlanCardState>>()` keyed by message ID to track which plans are dispatched:

```typescript
const [planStates, setPlanStates] = createSignal<Record<string, "active" | "dispatched">>({})

// When dispatching:
setPlanStates((prev) => ({ ...prev, [messageId]: "dispatched" }))

// Determine if plan is stale: any plan whose message is NOT the last plan message
const lastPlanMessageId = createMemo(() => {
  const msgs = messages() ?? []
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (detectPlan(msgs[i])) return msgs[i].id
  }
  return null
})

const planState = (msgId: string) => {
  if (planStates()[msgId] === "dispatched") return "dispatched"
  if (lastPlanMessageId() !== msgId) return "stale"
  return "active"
}
```

- [ ] **Step 3: Test the dispatch flow end-to-end**

1. Send a prompt that triggers the orchestrator to return a plan
2. Toggle scenarios on/off
3. Add a custom scenario
4. Click "Run N selected"
5. Verify a follow-up message appears in chat with the selected scenarios
6. Verify the plan card transitions to "dispatched" state (read-only, disabled button)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(app): wire plan card dispatch to send selected scenarios as user message"
```

---

## Task 8: Auto-maximize on Plan Arrival

**Files:**

- Modify: `packages/app/src/pages/session/message-timeline.tsx`
- Modify: `packages/app/src/context/chat-mode.tsx`

- [ ] **Step 1: Auto-maximize chat when a new plan message arrives**

In `message-timeline.tsx`, add a `createEffect` that watches the message list. When a new message containing a plan appears and the chat is minimized, auto-switch to float mode:

```typescript
const chat = useChatMode()

createEffect(() => {
  const msgs = messages() ?? []
  const lastMsg = msgs[msgs.length - 1]
  if (lastMsg && detectPlan(lastMsg) && chat.isMinimized()) {
    chat.maximize()
  }
})
```

- [ ] **Step 2: Auto-minimize after dispatch (float mode only)**

In the `handleDispatch` callback in `message-timeline.tsx`, after the SDK call succeeds and mode is float, auto-minimize:

```typescript
const handleDispatch = async (messageId: string, scenarios: ScenarioPlan[]) => {
  // ...send message...
  setPlanStates((prev) => ({ ...prev, [messageId]: "dispatched" }))
  if (chat.isFloat()) {
    chat.minimize()
  }
}
```

- [ ] **Step 3: Test auto-behaviors**

1. Start in minimized mode → send prompt → verify chat auto-maximizes when plan arrives
2. In float mode → click "Run selected" → verify chat auto-minimizes
3. In docked mode → click "Run selected" → verify chat stays docked (no auto-minimize)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(app): auto-maximize chat on plan arrival, auto-minimize on dispatch"
```

---

## Task 9: Integration Testing and Polish

- [ ] **Step 1: Run full test suite**

```bash
cd packages/app && bun run test:unit
cd packages/opendesign && bun test
bun turbo typecheck
```

Expected: All tests pass, no type errors.

- [ ] **Step 2: Visual QA checklist**

Test each chat mode transition:

- Minimized → Float (maximize button)
- Float → Docked (dock button)
- Docked → Float (float button)
- Float → Minimized (minimize button)
- Minimized → Docked (dock button)

Test plan card:

- Plan renders inline in float/docked chat
- Checkboxes toggle
- "Add scenario" works (Enter key)
- "Run N selected" dispatches and transitions to dispatched state
- Second plan marks first as stale

- [ ] **Step 3: Commit final polish**

```bash
git commit -m "feat(app): complete chat modes and pre-flight plan integration"
```
