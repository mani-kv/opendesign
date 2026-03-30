# Phase 2 Spec — HTML Infinite Canvas + Figma Paste → Raster

## Status

**In Progress** — 2026-03-29

Consensus reached via multi-model review (GPT-5.2, Gemini 2.5 Pro, Claude Opus 4.6).

## Overview

Phase 2 delivers the core spatial surface for OpenDesign — an HTML infinite canvas where designers paste Figma URLs and immediately see their designs as raster images. This is the foundation for all subsequent phases (annotations, agent spawning, Sandpack prototypes).

**User story:** "I paste a Figma frame URL onto the canvas and see my design within 2 seconds. I can pan and zoom around the canvas. My work persists when I reload."

## Scope

### In Scope
- Infinite canvas component (SolidJS) with pan and zoom
- Figma URL paste → raster image on canvas
- Canvas state persistence (localStorage)
- Empty state with paste hint
- Coordinate system helpers (screenToWorld / worldToScreen)

### Out of Scope (deferred)
- Grid background
- Inspect mode / hit-map (Phase 3)
- Annotations / agent spawning (Phase 3)
- Sandpack iframes (Phase 3+)
- Touch / pinch-zoom
- Iframe virtualization
- Background node tree fetch
- Official Figma MCP (using Console MCP first)
- Backend canvas state persistence (localStorage MVP)

## Technical Approach

### Canvas Architecture

Built from scratch — no external canvas library. Pan/zoom is ~150 lines of code. The real complexity is event arbitration (pan vs select vs drag vs inspect) which no library handles for our use case.

```
DOM Structure:
┌─────────────────────────────────┐
│ CanvasRoot (viewport)           │  overflow: hidden, fills feature page
│ ├── WorldContainer              │  transform: translate(tx,ty) scale(s)
│ │   ├── CanvasItem (img)        │  positioned in world coordinates
│ │   ├── CanvasItem (img)        │
│ │   └── ...                     │
│ └── InteractionOverlay (future) │  Layer 2: inspect, annotations
└─────────────────────────────────┘
```

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Canvas approach | Build from scratch | Need control over event arbitration for future phases |
| Transform | `translate(tx,ty) scale(scale)` | Standard infinite canvas pattern |
| Transform origin | `0 0` | Predictable zoom-to-cursor math |
| Coordinates | World coordinates as source of truth | Prevents rewrites for annotations, hit-maps, spatial queries |
| State persistence | localStorage (MVP) | Instant save/load, no network latency |
| MCP target | Figma Console MCP first | Already working locally, no OAuth complexity |
| Performance | No virtualization | No iframes until Phase 3+, premature to optimize |
| Touch support | Deferred | Desktop-only MVP |

## Implementation

### Step 1 — Canvas Component

**File:** `packages/app/src/components/canvas/infinite-canvas.tsx`

Core signals:
```typescript
const [viewport, setViewport] = createSignal({ tx: 0, ty: 0, scale: 1 })
```

Transform applied to world container:
```css
transform: translate(${tx}px, ${ty}px) scale(${scale});
transform-origin: 0 0;
```

**Pan:** Background `pointerdown` → `setPointerCapture` → update `tx/ty` on `pointermove` → release on `pointerup`. Use `requestAnimationFrame` for smooth updates.

**Zoom:** `wheel` event → adjust scale (clamped between 0.1 and 5.0). Zoom toward cursor:
```
// When scale changes from oldScale to newScale at cursor position (cx, cy):
// 1. Convert cursor to world coordinates
worldX = (cx - tx) / oldScale
worldY = (cy - ty) / oldScale
// 2. Update scale
newScale = clamp(oldScale * (1 - deltaY * 0.001), 0.1, 5.0)
// 3. Adjust translation so world point stays under cursor
newTx = cx - worldX * newScale
newTy = cy - worldY * newScale
```

**Coordinate helpers:**
```typescript
function screenToWorld(point: { x: number; y: number }): { x: number; y: number } {
  const v = viewport()
  return {
    x: (point.x - v.tx) / v.scale,
    y: (point.y - v.ty) / v.scale,
  }
}

function worldToScreen(point: { x: number; y: number }): { x: number; y: number } {
  const v = viewport()
  return {
    x: point.x * v.scale + v.tx,
    y: point.y * v.scale + v.ty,
  }
}
```

**Browser scroll prevention:** `wheel` event with `preventDefault()` on the canvas root. CSS `touch-action: none` on canvas root.

### Step 2 — Figma Paste Handler

**File:** `packages/app/src/components/canvas/figma-paste.ts`

Listen for `paste` event on the canvas root:
```
1. Read clipboard text
2. Call parseFigmaUrl(text) → { fileKey, nodeId } or null
3. If valid Figma URL:
   a. Show loading indicator at viewport center
   b. Call Figma Console MCP: figma_take_screenshot({ nodeId })
   c. Receive base64 PNG or URL
   d. Create canvas item at viewport center (world coords)
   e. Remove loading indicator
4. If not a Figma URL: ignore
```

**MCP call:** Via the existing MCP infrastructure in `packages/opencode/src/mcp/`. The frontend calls a backend API endpoint that proxies the MCP tool call.

**Paste location:** Center of the current viewport in world coordinates:
```typescript
const center = screenToWorld({
  x: canvasRoot.clientWidth / 2,
  y: canvasRoot.clientHeight / 2,
})
```

### Step 3 — Canvas Items

**File:** `packages/app/src/components/canvas/canvas-item.tsx`

Each item is an absolutely positioned element inside the world container:
```html
<div style={`
  position: absolute;
  left: ${item.x}px;
  top: ${item.y}px;
  width: ${item.width}px;
  height: ${item.height}px;
`}>
  <img src={item.src} style="width: 100%; height: 100%;" draggable={false} />
</div>
```

Items are rendered via a `<For>` loop over the items signal.

### Step 4 — State Persistence

**File:** `packages/app/src/components/canvas/canvas-state.ts`

```typescript
const STORAGE_KEY = (featureId: string) => `opendesign.canvas.${featureId}`

function saveCanvasState(featureId: string, state: CanvasState): void {
  localStorage.setItem(STORAGE_KEY(featureId), JSON.stringify(state))
}

function loadCanvasState(featureId: string): CanvasState | null {
  const raw = localStorage.getItem(STORAGE_KEY(featureId))
  return raw ? JSON.parse(raw) : null
}
```

Save is debounced (300ms after last viewport/item change). Load on component mount.

### Step 5 — Empty State

When no items exist on the canvas, show a centered hint:
```
┌─────────────────────────────────┐
│                                 │
│                                 │
│     📋 Paste a Figma URL        │
│     (Cmd+V) to get started      │
│                                 │
│     [Paste from clipboard]      │
│                                 │
└─────────────────────────────────┘
```

The "Paste from clipboard" button reads clipboard via `navigator.clipboard.readText()` and triggers the same paste flow.

## Data Model

### Canvas State (localStorage)

```typescript
type CanvasState = {
  viewport: {
    tx: number
    ty: number
    scale: number
  }
  items: CanvasItem[]
}

type CanvasItem = {
  id: string
  type: "figma_raster"
  fileKey: string
  nodeId: string
  x: number       // world coordinates
  y: number       // world coordinates
  width: number   // world units (pixels at scale 1)
  height: number  // world units
  src: string     // base64 data URL or cached image URL
  createdAt: number
}
```

### Future Extensions (not implemented now)

```typescript
// Phase 3+
type: "figma_raster" | "sandpack_iframe" | "variation_preview"
hitMap?: HitRegion[]      // component bounding boxes from Figma node tree
nodeTree?: FigmaNode      // full node tree for inspect mode
annotations?: Annotation[]
```

## File Structure

```
packages/app/src/components/canvas/
├── infinite-canvas.tsx     # Main canvas component (viewport, pan, zoom)
├── canvas-item.tsx         # Individual item renderer
├── canvas-state.ts         # Persistence (localStorage)
├── figma-paste.ts          # Paste handler + MCP integration
├── coordinates.ts          # screenToWorld / worldToScreen helpers
└── types.ts                # CanvasState, CanvasItem types
```

## Integration Points

### Feature Page

The canvas replaces the placeholder in `feature.tsx`:
```typescript
import InfiniteCanvas from "@/components/canvas/infinite-canvas"

// Inside FeaturePage component:
<InfiniteCanvas featureId={params.featureId} />
```

### Figma MCP

The paste handler needs a backend endpoint to proxy MCP tool calls. Options:
1. **Use existing MCP infrastructure** — call via the agent system (heavyweight but works)
2. **Direct MCP tool call endpoint** — new route that calls a specific MCP tool without creating an agent session (lightweight, preferred)

For MVP, option 2: add a `/mcp/tool` endpoint that accepts `{ server, tool, args }` and returns the result.

## Verification Criteria

- [ ] Canvas renders in the feature page at `/product/:id/feature/:id`
- [ ] Pan works (pointer drag on background)
- [ ] Zoom works (mouse wheel, zooms toward cursor)
- [ ] Paste a Figma URL → raster image appears on canvas
- [ ] Image positioned at viewport center in world coordinates
- [ ] Viewport and items persist across page reload (localStorage)
- [ ] Empty state shows paste hint when no items
- [ ] "Paste from clipboard" button works
- [ ] Canvas prevents browser scroll (no page bounce)
- [ ] Multiple images can be pasted onto the same canvas
- [ ] Zoom range clamped (0.1x to 5x)

## References

- [Agentic Prototyping Studio Design Spec](./2026-03-26-agentic-prototyping-studio-design.md) — lines 98-111 (canvas architecture), 239-289 (Figma import pipeline)
- [Phase 1 Foundation Spec](./2026-03-27-phase1-product-feature-agent-foundation.md) — Product/Feature/Agent data model
- [Agent Infrastructure Spec](./2026-03-29-agent-infrastructure-spec.md) — Agent architecture decisions
- Consensus: GPT-5.2 (8/10) + Gemini 2.5 Pro (9/10)
