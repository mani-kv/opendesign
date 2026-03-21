# Agent Sandbox Tab — Design Spec

## Overview

Add a new "Agent Sandbox" pane tab to the session side panel that hosts a SolidJS + SVG node graph renderer. This canvas visualizes the agent orchestration workflow — scenario nodes, Figma frames, personas, context documents, checkpoints, and merge results — as an interactive node graph.

The existing WASM canvas tab remains unchanged. The Agent Sandbox is a separate, additive tab.

## Architecture Decision

**SolidJS + SVG renderer** (no React Flow). The app is SolidJS; introducing React as a dependency for React Flow would add bridge complexity and bundle size. A custom SVG renderer integrates natively with SolidJS reactivity and the existing `GraphStore` from `@opencode-ai/opendesign/canvas`.

## Tab Registration

The Agent Sandbox is a **pane tab** — same category as canvas and figma. Pane tabs are toggleable, draggable, and persist across sessions.

### Layout Context Changes (`packages/app/src/context/layout.tsx`)

- `canvasPanel.panes` type expands: `{ canvas: boolean; figma: boolean; sandbox: boolean }`
- `canvasPanel.paneOrder` type expands: `("canvas" | "figma" | "sandbox")[]`
- Default: `{ canvas: true, figma: true, sandbox: true }`, order: `["canvas", "figma", "sandbox"]`

Specific locations requiring type/value changes:

- Line ~314: store default `paneOrder` array and `panes` object — add `sandbox`
- Line ~810: `paneOrder` memo return type cast — widen to include `"sandbox"`
- Line ~824: `setPane` — accept `"sandbox"` as valid pane key
- Lines ~840-852: `swapPaneOrder` — replace with general `setPaneOrder(order)` that accepts any permutation of the pane union (see "Split Mode" section below)
- Migration logic (lines ~236-244): handle existing persisted state missing `sandbox` key

### Session Side Panel Changes (`packages/app/src/pages/session/session-side-panel.tsx`)

- `isPaneTab()` helper (line ~492): expand to include `"sandbox"`
- `visiblePaneTabs` (line ~361): already reads `panes()[p]` dynamically — works once `sandbox` key exists

### Session Side Panel Changes (`packages/app/src/pages/session/session-side-panel.tsx`)

- New `<SortablePaneTab pane="sandbox">` in the tab trigger list
- New `<Tabs.Content value="sandbox">` rendering `<AgentSandboxTabContent />`
- `SplitPaneContent`: new `<Match when={props.pane === "sandbox"}>` case
- Unlike canvas/figma, the sandbox renders **inline** (no persistent absolute overlay host needed — SVG is lightweight)

### i18n

- `"session.tab.sandbox": "Agent Sandbox"` added to all locale files

## SVG Graph Renderer

### Core: `<AgentSandboxCanvas />`

An `<svg>` element filling the tab content area with:

- A `<g>` transform group: `transform={translate(vp.x, vp.y) scale(vp.zoom)}` driven by `GraphStore.state.viewport`
- Edges rendered as SVG `<path>` elements with cubic bezier curves
- Nodes rendered as `<foreignObject>` wrappers around HTML cards — `width`/`height` from `node.width ?? 320` / `node.height ?? 240` (matching defaults in `node-layout.ts`)

### Viewport Interaction (`use-pan-zoom.ts`)

- **Pan**: mousedown on background → mousemove updates viewport x/y → mouseup ends
- **Zoom**: wheel event adjusts viewport.zoom (clamped 0.1–3.0), zooms toward cursor
- **Fit**: expose `fitToContent()` using `centerViewport()` from `@opencode-ai/opendesign/canvas`
- Updates `graph.setViewport()` on every change
- **Cleanup**: mousemove/mouseup listeners attached to `document` during drag, removed in `onCleanup()` to prevent leaks

### Edge Rendering (`edge-path.tsx`)

- Reads source/target node positions from store
- Computes bezier control points (horizontal flow: source right → target left)
- SVG `<path>` with stroke color based on `edge.type`: flow (default), context (dashed), checkpoint (dotted)
- Edges render below nodes in SVG layer order

### Node Cards

Each `CanvasNode.type` maps to a card component rendered inside `<foreignObject>`:

| Type         | Card                 | Visual                                                                                                                                       |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`      | `AgentNodeCard`      | Scenario name, branch badge, state indicator (colored dot via `stateColor()`), state label (created/working/waiting/ready/approved/archived) |
| `frame`      | `FrameNodeCard`      | Figma frame name, dimensions                                                                                                                 |
| `persona`    | `PersonaNodeCard`    | Persona name, viewport/language info                                                                                                         |
| `context`    | `ContextNodeCard`    | Document name, type badge (figma/url/file/text)                                                                                              |
| `checkpoint` | `CheckpointNodeCard` | Checkpoint hash, timestamp                                                                                                                   |
| `merged`     | `MergedNodeCard`     | Merge result status, conflict count if any                                                                                                   |

### Node Interaction

- **Select**: click → set selected node ID signal → highlight border
- **Drag**: mousedown on node → mousemove updates `graph.updateNode(id, n => { n.x = ...; n.y = ... })` → mouseup ends
- **Double-click agent node**: navigate to agent session (future integration point)

## File Structure

```
packages/app/src/pages/session/
├── agent-sandbox-tab-content.tsx       # Tab wrapper: creates GraphStore, provides via context
├── agent-sandbox/
│   ├── canvas.tsx                      # SVG pan/zoom canvas, renders edges + nodes
│   ├── node-card.tsx                   # Switch on node.type → correct card component
│   ├── agent-node-card.tsx             # Agent scenario card
│   ├── frame-node-card.tsx             # Figma frame card
│   ├── persona-node-card.tsx           # Persona card
│   ├── context-node-card.tsx           # Context document card
│   ├── checkpoint-node-card.tsx        # Checkpoint card
│   ├── merged-node-card.tsx            # Merge result card
│   ├── edge-path.tsx                   # Bezier edge SVG path component
│   └── use-pan-zoom.ts                # Pan/zoom mouse/wheel interaction hook
```

## Data Flow

1. `AgentSandboxTabContent` creates a `GraphStore` per session (via `createGraphStore()`)
2. Store is provided via SolidJS context to child components
3. `AgentSandboxCanvas` reads `store.state.nodes`, `store.state.edges`, `store.state.viewport` reactively
4. Node/edge changes flow through store mutations → SolidJS fine-grained reactivity → only affected SVG elements re-render
5. Initially the graph is empty — placeholder shown: "No agent scenarios yet. Start a conversation to generate design prototypes."

## Empty State

When `store.state.nodes.length === 0`:

- Hide the SVG canvas
- Show centered placeholder with the Mark logo (same pattern as `CanvasFigmaEmpty`) and descriptive text

## Styling

- Node cards use existing design tokens (`var(--background-base)`, `var(--border-weaker-base)`, etc.)
- Agent **name** colors use `agentColor(name)` from `@opencode-ai/opendesign/agent` (maps agent names like `"opendesign-agent"` to CSS vars)
- Agent **state** colors use a new `stateColor(state: AgentState)` function added to `@opencode-ai/opendesign/agent` that maps the 6 lifecycle states to CSS color vars (e.g., created→gray, working→blue, waiting→amber, ready→green, approved→emerald, archived→dim)
- Edge strokes use `var(--border-base)` with type-specific dash arrays
- Selection highlight: `var(--border-info-base)` 2px border
- Background: `var(--background-stronger)` with subtle dot grid pattern

## Dependencies

- `@opencode-ai/opendesign` (already in workspace) — `createGraphStore`, `CanvasNode`, `CanvasEdge`, `agentColor`, `centerViewport`, `nextPosition`
- No new external dependencies

## Testing

- Unit tests for `use-pan-zoom.ts` (viewport math)
- Unit tests for edge path computation (bezier control points)
- Existing `packages/opendesign` tests cover graph store, node factory, layout, visibility (131 tests)

## Split Mode

The existing `swapPaneOrder()` only handles a 2-element array. With 3 pane types, this must be generalized:

- Replace `swapPaneOrder()` with `setPaneOrder(order: PaneId[])` in layout context
- `SortableProvider` in `CanvasFigmaSplit` already handles N-item drag-reorder — the DnD `handleDragOver` just needs the `isPaneTab` guard updated
- Split mode shows exactly 2 panes side by side; the third is hidden. The split uses the first 2 items in `paneOrder` that are enabled in `panes`

## Out of Scope

- Sandpack iframe embedding inside agent nodes (Priority 2 later phase)
- Server-side persistence of sandbox graph state (uses in-memory store for now)
- Agent-to-sandbox node creation pipeline (needs agent orchestrator wiring)
