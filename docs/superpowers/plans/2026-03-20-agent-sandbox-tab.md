# Agent Sandbox Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Agent Sandbox" pane tab to the session side panel with a SolidJS + SVG interactive node graph renderer that consumes the existing `GraphStore` from `@opencode-ai/opendesign`.

**Architecture:** New pane tab ("sandbox") registered alongside canvas/figma in the layout context. The tab content hosts a custom SVG canvas with pan/zoom, rendering nodes as `<foreignObject>` HTML cards and edges as bezier `<path>` elements. All graph state comes from `createGraphStore()` (SolidJS store). No new external dependencies.

**Tech Stack:** SolidJS, SVG, `@opencode-ai/opendesign` (canvas module), TailwindCSS design tokens.

**Spec:** `docs/superpowers/specs/2026-03-20-agent-sandbox-tab-design.md`

---

### Task 1: Add `stateColor()` to opendesign agent module

The spec requires a `stateColor(state)` function mapping the 6 agent lifecycle states to CSS color values. This is distinct from `agentColor(name)` which maps agent names.

**Files:**
- Modify: `packages/opendesign/src/agent/color.ts`
- Modify: `packages/opendesign/src/agent/index.ts`
- Create: `packages/opendesign/test/agent/state-color.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/opendesign/test/agent/state-color.test.ts`:

```ts
import { expect, test, describe } from "bun:test"
import { stateColor } from "../../src/agent/color"

describe("stateColor", () => {
  test("returns a color for each agent state", () => {
    const states = ["created", "working", "waiting", "ready", "approved", "archived"] as const
    for (const state of states) {
      const color = stateColor(state)
      expect(color).toBeTypeOf("string")
      expect(color.length).toBeGreaterThan(0)
    }
  })

  test("returns distinct colors for active vs terminal states", () => {
    expect(stateColor("working")).not.toBe(stateColor("archived"))
    expect(stateColor("ready")).not.toBe(stateColor("created"))
  })

  test("returns fallback for unknown state", () => {
    expect(stateColor("unknown" as any)).toBeTypeOf("string")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/opendesign && bun test test/agent/state-color.test.ts`
Expected: FAIL — `stateColor` is not exported

- [ ] **Step 3: Implement stateColor**

Add to `packages/opendesign/src/agent/color.ts`:

```ts
import type { AgentState } from "../types/agent-state"

const stateColors: Record<AgentState, string> = {
  created: "var(--text-dimmer)",
  working: "var(--icon-info-base)",
  waiting: "var(--icon-warning-base)",
  ready: "var(--icon-success-base)",
  approved: "var(--icon-success-base)",
  archived: "var(--text-dimmer)",
}

export function stateColor(state: string): string {
  return stateColors[state as AgentState] ?? "var(--text-dimmer)"
}
```

Update `packages/opendesign/src/agent/index.ts` to add export:
```ts
export { agentColor, stateColor } from "./color"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/opendesign && bun test test/agent/state-color.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run full opendesign test suite**

Run: `cd packages/opendesign && bun test`
Expected: 134+ pass, 0 fail

- [ ] **Step 6: Commit**

```bash
git add packages/opendesign/src/agent/color.ts packages/opendesign/src/agent/index.ts packages/opendesign/test/agent/state-color.test.ts
git commit -m "feat(opendesign): add stateColor() for agent lifecycle state colors"
```

---

### Task 2: Widen layout context pane types for sandbox

Add `"sandbox"` as a valid pane type in the layout context, update migration, defaults, and generalize `swapPaneOrder` to `setPaneOrder`.

**Files:**
- Modify: `packages/app/src/context/layout.tsx`

- [ ] **Step 1: Update store default (line 310-315)**

Change:
```ts
canvasPanel: {
  layout: "tabs" as "tabs" | "split",
  panes: { canvas: true, figma: true },
  splitRatio: 0.5,
  paneOrder: ["canvas", "figma"] as ("canvas" | "figma")[],
},
```
To:
```ts
canvasPanel: {
  layout: "tabs" as "tabs" | "split",
  panes: { canvas: true, figma: true, sandbox: true },
  splitRatio: 0.5,
  paneOrder: ["canvas", "figma", "sandbox"] as ("canvas" | "figma" | "sandbox")[],
},
```

- [ ] **Step 2: Update migration logic (lines 236-248)**

Change the migration to backfill `sandbox` for persisted state that lacks it:
```ts
if (isRecord(canvasPanel) && typeof canvasPanel.layout === "string" && isRecord(canvasPanel.panes)) {
  const panes = canvasPanel.panes as Record<string, boolean>
  if (panes.sandbox === undefined) panes.sandbox = true
  const order = Array.isArray(canvasPanel.paneOrder) ? canvasPanel.paneOrder : ["canvas", "figma"]
  if (!order.includes("sandbox")) order.push("sandbox")
  return { ...canvasPanel, panes, paneOrder: order }
}
return {
  layout: "tabs" as const,
  panes: { canvas: true, figma: true, sandbox: true },
  splitRatio: 0.5,
  paneOrder: ["canvas", "figma", "sandbox"],
}
```

- [ ] **Step 3: Update canvasPanel memos and methods (lines 806-853)**

Update the type casts and defaults in the returned `canvasPanel` object:

```ts
canvasPanel: {
  layout: createMemo(() => (store.canvasPanel?.layout ?? "tabs") as "tabs" | "split"),
  panes: createMemo(() => store.canvasPanel?.panes ?? { canvas: true, figma: true, sandbox: true }),
  splitRatio: createMemo(() => store.canvasPanel?.splitRatio ?? 0.5),
  paneOrder: createMemo(() => (store.canvasPanel?.paneOrder ?? ["canvas", "figma", "sandbox"]) as ("canvas" | "figma" | "sandbox")[]),
  toggleLayout() {
    const next = (store.canvasPanel?.layout ?? "tabs") === "tabs" ? "split" : "tabs"
    if (!store.canvasPanel) {
      setStore("canvasPanel", {
        layout: next,
        panes: { canvas: true, figma: true, sandbox: true },
        splitRatio: 0.5,
        paneOrder: ["canvas", "figma", "sandbox"],
      })
      return
    }
    setStore("canvasPanel", "layout", next)
  },
  setPane(pane: "canvas" | "figma" | "sandbox", open: boolean) {
    if (!store.canvasPanel) {
      setStore("canvasPanel", {
        layout: "tabs",
        panes: { canvas: true, figma: true, sandbox: true, [pane]: open },
        splitRatio: 0.5,
        paneOrder: ["canvas", "figma", "sandbox"],
      })
      return
    }
    setStore("canvasPanel", "panes", pane, open)
  },
  setSplitRatio(ratio: number) {
    if (!store.canvasPanel) return
    setStore("canvasPanel", "splitRatio", Math.max(0.2, Math.min(0.8, ratio)))
  },
  setPaneOrder(order: ("canvas" | "figma" | "sandbox")[]) {
    if (!store.canvasPanel) {
      setStore("canvasPanel", {
        layout: "tabs",
        panes: { canvas: true, figma: true, sandbox: true },
        splitRatio: 0.5,
        paneOrder: order,
      })
      return
    }
    setStore("canvasPanel", "paneOrder", order)
  },
},
```

Note: `swapPaneOrder()` is replaced by `setPaneOrder(order)`.

- [ ] **Step 4: Find and update all references to `swapPaneOrder`**

Search for `swapPaneOrder` in the codebase and replace with `setPaneOrder`. In `session-side-panel.tsx` the DnD handler calls it — update to compute the new order from the drag event.

- [ ] **Step 5: Run typecheck**

Run: `cd packages/app && bun run typecheck`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/context/layout.tsx
git commit -m "feat(app): widen layout pane types to include sandbox tab"
```

---

### Task 3: Register sandbox tab in session side panel

Wire up the sandbox pane tab in the session side panel — tab trigger, tab content placeholder, split pane support, i18n, and updated `isPaneTab` guard.

**Files:**
- Modify: `packages/app/src/pages/session/session-side-panel.tsx`
- Modify: `packages/app/src/i18n/en.ts`
- Create: `packages/app/src/pages/session/agent-sandbox-tab-content.tsx` (empty state placeholder for now)

- [ ] **Step 1: Add i18n key**

In `packages/app/src/i18n/en.ts`, after `"session.tab.figma": "Figma",` (line 521), add:
```ts
"session.tab.sandbox": "Agent Sandbox",
```

Also add an empty state string after `"agents.panel.empty"` (line 528):
```ts
"session.sandbox.empty": "No agent scenarios yet. Start a conversation to generate design prototypes.",
```

- [ ] **Step 2: Create placeholder tab content component**

Create `packages/app/src/pages/session/agent-sandbox-tab-content.tsx`:

```tsx
import { Show } from "solid-js"
import { Mark } from "@opencode-ai/ui/logo"
import { useLanguage } from "@/context/language"
import { createGraphStore } from "@opencode-ai/opendesign"

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
          {/* AgentSandboxCanvas will be added in Task 5 */}
          <div />
        </div>
      </Show>
    </div>
  )
}
```

- [ ] **Step 3: Update `isPaneTab` in session-side-panel.tsx (line ~492)**

Change:
```ts
const isPaneTab = (id: string) => id === "canvas" || id === "figma"
```
To:
```ts
const isPaneTab = (id: string) => id === "canvas" || id === "figma" || id === "sandbox"
```

- [ ] **Step 4: Add sandbox to `SplitPaneContent` (lines ~41-83)**

Add a new `<Match>` case after the figma match:
```tsx
<Match when={props.pane === "sandbox"}>
  <Tabs value="sandbox">
    <div class="sticky top-0 z-10 shrink-0 flex items-center border-b border-border-weaker-base">
      <Tabs.List class="min-w-0 w-fit">
        <SortablePaneTab pane="sandbox">{language.t("session.tab.sandbox")}</SortablePaneTab>
      </Tabs.List>
    </div>
    <Tabs.Content value="sandbox" class="relative flex flex-col flex-1 min-h-0 overflow-hidden contain-strict">
      <div class="relative flex-1 min-h-0 overflow-hidden">
        <div class="absolute inset-0">
          <AgentSandboxTabContent />
        </div>
      </div>
    </Tabs.Content>
  </Tabs>
</Match>
```

- [ ] **Step 5: Add sandbox pane tab trigger in main tab bar (lines ~590-600)**

The `<For each={visiblePaneTabs()}>` loop already iterates over all visible pane tabs. Add a `<Match>` case inside the `<Switch>` for sandbox:
```tsx
<Match when={pane === "sandbox"}>{language.t("session.tab.sandbox")}</Match>
```

- [ ] **Step 6: Add sandbox tab content in main Tabs (after figma content, ~lines 647-659)**

Add a `sandboxTab` memo alongside `canvasTab`/`figmaTab`:
```ts
const sandboxTab = createMemo(() => isDesktop() && panes().sandbox)
```

Then add `Tabs.Content`:
```tsx
<Show when={sandboxTab()}>
  <Tabs.Content value="sandbox" class="relative flex flex-col h-full overflow-hidden contain-strict">
    <AgentSandboxTabContent />
  </Tabs.Content>
</Show>
```

- [ ] **Step 7: Update `activeTab` memo to handle sandbox**

In the `activeTab` memo (~line 454), add sandbox handling after figma:
```ts
if (active === "sandbox" && sandboxTab()) return "sandbox"
```

And in the fallback chain at the bottom, add before `return "empty"`:
```ts
if (sandboxTab()) return "sandbox"
```

- [ ] **Step 8: Update `bothClosed` memo**

Change:
```ts
const bothClosed = createMemo(() => isDesktop() && !panes().canvas && !panes().figma)
```
To:
```ts
const bothClosed = createMemo(() => isDesktop() && !panes().canvas && !panes().figma && !panes().sandbox)
```

- [ ] **Step 9: Update DragOverlay to handle sandbox pane drag preview**

In the `<DragOverlay>` section (~line 698-718), update the pane tab preview to handle sandbox:
```tsx
if (tab === "canvas" || tab === "figma" || tab === "sandbox") {
  return (
    <div data-component="tabs-drag-preview">
      <span class="text-14-medium">
        {tab === "canvas"
          ? language.t("session.tab.canvas")
          : tab === "figma"
            ? language.t("session.tab.figma")
            : language.t("session.tab.sandbox")}
      </span>
    </div>
  )
}
```

- [ ] **Step 10: Update DnD handleDragOver for pane reordering**

Replace the 2-pane swap logic (~lines 494-506) with general reorder:
```ts
const handleDragOver = (event: DragEvent) => {
  const { draggable, droppable } = event
  if (!draggable || !droppable) return

  const dragId = draggable.id.toString()
  const dropId = droppable.id.toString()

  if (isPaneTab(dragId) && isPaneTab(dropId) && dragId !== dropId) {
    const order = [...layout.canvasPanel.paneOrder()]
    const fromIdx = order.indexOf(dragId as any)
    const toIdx = order.indexOf(dropId as any)
    if (fromIdx !== -1 && toIdx !== -1) {
      order.splice(fromIdx, 1)
      order.splice(toIdx, 0, dragId as any)
      layout.canvasPanel.setPaneOrder(order)
    }
    return
  }

  if (isPaneTab(dragId) || isPaneTab(dropId)) return

  const currentTabs = tabs().all()
  const toIndex = getTabReorderIndex(currentTabs, dragId, dropId)
  if (toIndex === undefined) return
  tabs().move(dragId, toIndex)
}
```

- [ ] **Step 11: Add import for AgentSandboxTabContent**

At the top of `session-side-panel.tsx`, add:
```ts
import { AgentSandboxTabContent } from "@/pages/session/agent-sandbox-tab-content"
```

- [ ] **Step 12: Run typecheck + dev server**

Run: `cd packages/app && bun run typecheck`
Expected: No type errors

Run: `cd packages/app && bun run dev` (manual visual check that sandbox tab appears)

- [ ] **Step 13: Commit**

```bash
git add packages/app/src/pages/session/session-side-panel.tsx packages/app/src/pages/session/agent-sandbox-tab-content.tsx packages/app/src/i18n/en.ts
git commit -m "feat(app): register Agent Sandbox pane tab with empty state"
```

---

### Task 4: Pan/zoom interaction hook

Pure logic hook — no UI, fully testable.

**Files:**
- Create: `packages/app/src/pages/session/agent-sandbox/use-pan-zoom.ts`
- Create: `packages/app/src/pages/session/agent-sandbox/use-pan-zoom.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/app/src/pages/session/agent-sandbox/use-pan-zoom.test.ts`:

```ts
import { expect, test, describe } from "bun:test"
import { clampZoom, panBy, zoomAtPoint } from "./use-pan-zoom"

describe("clampZoom", () => {
  test("clamps below minimum", () => {
    expect(clampZoom(0.01)).toBe(0.1)
  })
  test("clamps above maximum", () => {
    expect(clampZoom(5)).toBe(3)
  })
  test("passes through valid zoom", () => {
    expect(clampZoom(1.5)).toBe(1.5)
  })
})

describe("panBy", () => {
  test("adds delta to viewport position", () => {
    const vp = { x: 100, y: 200, zoom: 1 }
    const result = panBy(vp, 10, -20)
    expect(result).toEqual({ x: 110, y: 180, zoom: 1 })
  })
})

describe("zoomAtPoint", () => {
  test("zooms toward cursor position", () => {
    const vp = { x: 0, y: 0, zoom: 1 }
    const result = zoomAtPoint(vp, 1.5, 400, 300)
    expect(result.zoom).toBe(1.5)
    // Origin shifts to keep cursor point stable
    expect(result.x).toBeCloseTo(-200)
    expect(result.y).toBeCloseTo(-150)
  })
  test("clamps zoom to bounds", () => {
    const vp = { x: 0, y: 0, zoom: 2.8 }
    const result = zoomAtPoint(vp, 5, 0, 0)
    expect(result.zoom).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && bun test src/pages/session/agent-sandbox/use-pan-zoom.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement pure functions**

Create `packages/app/src/pages/session/agent-sandbox/use-pan-zoom.ts`:

```ts
import { createSignal, onCleanup } from "solid-js"

type Viewport = { x: number; y: number; zoom: number }

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }
}

export function zoomAtPoint(vp: Viewport, newZoom: number, cx: number, cy: number): Viewport {
  const z = clampZoom(newZoom)
  const scale = z / vp.zoom
  return {
    x: cx - (cx - vp.x) * scale,
    y: cy - (cy - vp.y) * scale,
    zoom: z,
  }
}

export function createPanZoom(opts: {
  viewport: () => Viewport
  setViewport: (vp: Viewport) => void
}) {
  const [panning, setPanning] = createSignal(false)
  let startX = 0
  let startY = 0
  let startVp: Viewport = { x: 0, y: 0, zoom: 1 }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    // Only start pan if target is the SVG background (not a node)
    const target = e.target as SVGElement
    if (target.tagName !== "svg" && target.tagName !== "rect") return
    e.preventDefault()
    startX = e.clientX
    startY = e.clientY
    startVp = opts.viewport()
    setPanning(true)

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      opts.setViewport(panBy(startVp, dx, dy))
    }
    const onUp = () => {
      setPanning(false)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = (e.currentTarget as Element).getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const vp = opts.viewport()
    opts.setViewport(zoomAtPoint(vp, vp.zoom * factor, cx, cy))
  }

  return { panning, onPointerDown, onWheel }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/app && bun test src/pages/session/agent-sandbox/use-pan-zoom.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/session/agent-sandbox/use-pan-zoom.ts packages/app/src/pages/session/agent-sandbox/use-pan-zoom.test.ts
git commit -m "feat(app): add pan/zoom interaction hook for agent sandbox"
```

---

### Task 5: Edge path component

SVG bezier edge rendering.

**Files:**
- Create: `packages/app/src/pages/session/agent-sandbox/edge-path.tsx`
- Create: `packages/app/src/pages/session/agent-sandbox/edge-path.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/app/src/pages/session/agent-sandbox/edge-path.test.ts`:

```ts
import { expect, test, describe } from "bun:test"
import { computeEdgePath, edgeStrokeStyle } from "./edge-path"

describe("computeEdgePath", () => {
  test("returns a cubic bezier SVG path", () => {
    const path = computeEdgePath(
      { x: 0, y: 50, width: 100, height: 100 },
      { x: 300, y: 50, width: 100, height: 100 },
    )
    expect(path).toMatch(/^M\s/)
    expect(path).toContain("C")
  })

  test("source exits right, target enters left", () => {
    const path = computeEdgePath(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 400, y: 0, width: 100, height: 100 },
    )
    // Start at right edge of source (x=100), mid-height (y=50)
    expect(path).toStartWith("M 100 50")
  })
})

describe("edgeStrokeStyle", () => {
  test("flow type returns solid", () => {
    expect(edgeStrokeStyle("flow").dasharray).toBeUndefined()
  })
  test("context type returns dashed", () => {
    expect(edgeStrokeStyle("context").dasharray).toBe("6 3")
  })
  test("checkpoint type returns dotted", () => {
    expect(edgeStrokeStyle("checkpoint").dasharray).toBe("2 4")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && bun test src/pages/session/agent-sandbox/edge-path.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `packages/app/src/pages/session/agent-sandbox/edge-path.tsx`:

```tsx
import type { CanvasEdge } from "@opencode-ai/opendesign"

type NodeRect = { x: number; y: number; width?: number; height?: number }

const DEFAULT_W = 320
const DEFAULT_H = 240

export function computeEdgePath(source: NodeRect, target: NodeRect): string {
  const sw = source.width ?? DEFAULT_W
  const sh = source.height ?? DEFAULT_H
  const tw = target.width ?? DEFAULT_W
  const th = target.height ?? DEFAULT_H

  const sx = source.x + sw
  const sy = source.y + sh / 2
  const tx = target.x
  const ty = target.y + th / 2

  const dx = Math.abs(tx - sx) * 0.5
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`
}

export function edgeStrokeStyle(type?: CanvasEdge["type"]): { dasharray?: string; color: string } {
  switch (type) {
    case "context":
      return { dasharray: "6 3", color: "var(--border-base)" }
    case "checkpoint":
      return { dasharray: "2 4", color: "var(--border-base)" }
    default:
      return { color: "var(--border-base)" }
  }
}

export function EdgePath(props: { edge: CanvasEdge; sourceNode: NodeRect; targetNode: NodeRect }) {
  const path = () => computeEdgePath(props.sourceNode, props.targetNode)
  const style = () => edgeStrokeStyle(props.edge.type)

  return (
    <path
      d={path()}
      fill="none"
      stroke={style().color}
      stroke-width="1.5"
      stroke-dasharray={style().dasharray}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/app && bun test src/pages/session/agent-sandbox/edge-path.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/session/agent-sandbox/edge-path.tsx packages/app/src/pages/session/agent-sandbox/edge-path.test.ts
git commit -m "feat(app): add edge path SVG component for agent sandbox"
```

---

### Task 6: Node card components

Render each `CanvasNode.type` as a styled HTML card inside `<foreignObject>`.

**Files:**
- Create: `packages/app/src/pages/session/agent-sandbox/node-card.tsx`
- Create: `packages/app/src/pages/session/agent-sandbox/agent-node-card.tsx`

- [ ] **Step 1: Create node-card.tsx (router)**

```tsx
import { Switch, Match } from "solid-js"
import type { CanvasNode } from "@opencode-ai/opendesign"
import { AgentNodeCard } from "./agent-node-card"

export function NodeCard(props: {
  node: CanvasNode
  selected: boolean
  onSelect: () => void
  onDragStart: (e: PointerEvent) => void
}) {
  return (
    <div
      class="rounded-lg border bg-background-base shadow-sm overflow-hidden cursor-grab active:cursor-grabbing select-none"
      classList={{ "border-[var(--border-info-base)] ring-1 ring-[var(--border-info-base)]": props.selected }}
      style={{ width: `${props.node.width ?? 320}px`, height: `${props.node.height ?? 240}px` }}
      onPointerDown={(e) => {
        props.onSelect()
        props.onDragStart(e)
      }}
    >
      <Switch fallback={<DefaultCard node={props.node} />}>
        <Match when={props.node.type === "agent" && props.node}>
          {(n) => <AgentNodeCard node={n() as any} />}
        </Match>
        <Match when={props.node.type === "frame"}>
          <SimpleCard label="Frame" name={(props.node as any).data.frame.name} icon="image" />
        </Match>
        <Match when={props.node.type === "persona"}>
          <SimpleCard label="Persona" name={(props.node as any).data.persona.name} icon="user" />
        </Match>
        <Match when={props.node.type === "context"}>
          <SimpleCard label="Context" name={(props.node as any).data.document.title} icon="file-text" />
        </Match>
        <Match when={props.node.type === "checkpoint"}>
          <SimpleCard label="Checkpoint" name={(props.node as any).data.checkpoint.id} icon="git-commit" />
        </Match>
        <Match when={props.node.type === "merged"}>
          <SimpleCard
            label="Merged"
            name={`${(props.node as any).data.sourceNodeIds.length} sources`}
            icon="git-merge"
          />
        </Match>
      </Switch>
    </div>
  )
}

function SimpleCard(props: { label: string; name: string; icon: string }) {
  return (
    <div class="p-3 h-full flex flex-col gap-2">
      <div class="text-11-medium text-text-dimmer uppercase tracking-wider">{props.label}</div>
      <div class="text-13-medium text-text-base truncate">{props.name}</div>
    </div>
  )
}

function DefaultCard(props: { node: CanvasNode }) {
  return (
    <div class="p-3 h-full flex items-center justify-center">
      <div class="text-13-regular text-text-weak">{props.node.type}</div>
    </div>
  )
}
```

- [ ] **Step 2: Create agent-node-card.tsx**

```tsx
import type { AgentNode } from "@opencode-ai/opendesign"
import { stateColor } from "@opencode-ai/opendesign"

export function AgentNodeCard(props: { node: AgentNode }) {
  const color = () => stateColor(props.node.data.state)

  return (
    <div class="p-3 h-full flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <div class="size-2 rounded-full shrink-0" style={{ "background-color": color() }} />
        <div class="text-11-medium text-text-dimmer uppercase tracking-wider">
          {props.node.data.state}
        </div>
      </div>
      <div class="text-13-medium text-text-base line-clamp-2">{props.node.data.scenario}</div>
      <div class="mt-auto text-11-regular text-text-weak font-mono truncate">{props.node.data.branch}</div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/session/agent-sandbox/node-card.tsx packages/app/src/pages/session/agent-sandbox/agent-node-card.tsx
git commit -m "feat(app): add node card components for agent sandbox canvas"
```

---

### Task 7: SVG canvas component

The main rendering component that composes pan/zoom, edges, and node cards into an interactive SVG canvas.

**Files:**
- Create: `packages/app/src/pages/session/agent-sandbox/canvas.tsx`

- [ ] **Step 1: Implement canvas.tsx**

```tsx
import { For, createSignal } from "solid-js"
import type { GraphStore, CanvasNode } from "@opencode-ai/opendesign"
import { createPanZoom } from "./use-pan-zoom"
import { EdgePath } from "./edge-path"
import { NodeCard } from "./node-card"

export function AgentSandboxCanvas(props: { graph: GraphStore }) {
  const [selected, setSelected] = createSignal<string | null>(null)
  const [dragging, setDragging] = createSignal<string | null>(null)

  const panZoom = createPanZoom({
    viewport: () => props.graph.state.viewport,
    setViewport: (vp) => props.graph.setViewport(vp),
  })

  const startNodeDrag = (nodeId: string, e: PointerEvent) => {
    e.stopPropagation()
    const node = props.graph.nodeById(nodeId)
    if (!node) return
    const startX = e.clientX
    const startY = e.clientY
    const origX = node.x
    const origY = node.y
    const zoom = props.graph.state.viewport.zoom
    setDragging(nodeId)

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom
      const dy = (ev.clientY - startY) / zoom
      props.graph.updateNode(nodeId, (n: CanvasNode) => {
        n.x = origX + dx
        n.y = origY + dy
      })
    }
    const onUp = () => {
      setDragging(null)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  const vp = () => props.graph.state.viewport

  return (
    <svg
      class="size-full select-none"
      style={{
        "background-color": "var(--background-stronger)",
        "background-image":
          "radial-gradient(circle, var(--border-weaker-base) 1px, transparent 1px)",
        "background-size": `${20 * vp().zoom}px ${20 * vp().zoom}px`,
        "background-position": `${vp().x}px ${vp().y}px`,
      }}
      onPointerDown={panZoom.onPointerDown}
      onWheel={panZoom.onWheel}
    >
      <g transform={`translate(${vp().x}, ${vp().y}) scale(${vp().zoom})`}>
        {/* Edges below nodes */}
        <For each={props.graph.state.edges}>
          {(edge) => {
            const source = () => props.graph.nodeById(edge.source)
            const target = () => props.graph.nodeById(edge.target)
            return (
              <EdgePath
                edge={edge}
                sourceNode={source()!}
                targetNode={target()!}
              />
            )
          }}
        </For>

        {/* Nodes as foreignObject */}
        <For each={props.graph.state.nodes}>
          {(node) => (
            <foreignObject
              x={node.x}
              y={node.y}
              width={node.width ?? 320}
              height={node.height ?? 240}
              class="overflow-visible"
            >
              <NodeCard
                node={node}
                selected={selected() === node.id}
                onSelect={() => setSelected(node.id)}
                onDragStart={(e) => startNodeDrag(node.id, e)}
              />
            </foreignObject>
          )}
        </For>
      </g>
    </svg>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/pages/session/agent-sandbox/canvas.tsx
git commit -m "feat(app): add SVG canvas renderer for agent sandbox"
```

---

### Task 8: Wire canvas into tab content

Connect `AgentSandboxCanvas` into the tab content wrapper, replacing the placeholder.

**Files:**
- Modify: `packages/app/src/pages/session/agent-sandbox-tab-content.tsx`

- [ ] **Step 1: Update tab content to use canvas**

Replace the placeholder with:

```tsx
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
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/app && bun run typecheck`
Expected: No type errors

- [ ] **Step 3: Run existing app tests**

Run: `cd packages/app && bun run test:unit`
Expected: 281+ pass, 0 fail

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/pages/session/agent-sandbox-tab-content.tsx
git commit -m "feat(app): wire SVG canvas into agent sandbox tab content"
```

---

### Task 9: Final verification and code insights update

- [ ] **Step 1: Run full opendesign test suite**

Run: `cd packages/opendesign && bun test`
Expected: 134+ pass, 0 fail

- [ ] **Step 2: Run full app test suite**

Run: `cd packages/app && bun run test:unit`
Expected: 281+ pass, 0 fail

- [ ] **Step 3: Typecheck all**

Run: `bun turbo typecheck`
Expected: All packages pass

- [ ] **Step 4: Update code insights**

Add a section to `.claude/code_insights.md` documenting:
- Agent Sandbox tab architecture (pane tab, inline SVG, no persistent overlay)
- Graph store context pattern (per-session `createGraphStore()`)
- Pan/zoom implementation (pure functions + pointer/wheel handlers)
- Node card rendering (foreignObject + HTML cards)
- `stateColor()` vs `agentColor()` distinction

- [ ] **Step 5: Commit code insights**

```bash
git add .claude/code_insights.md
git commit -m "docs: update code insights with agent sandbox tab patterns"
```
