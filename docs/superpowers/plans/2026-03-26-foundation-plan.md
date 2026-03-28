# Foundation — Implementation Plan (Phase 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a Figma URL on a canvas → immediately see the design as a raster image with an interactive HTML infinite canvas. Establish the Product/Feature data model with git mono repo structure.

**Architecture:** Extend the existing OpenCode project/session model to support Product → Feature hierarchy. Replace the Rust/WASM and SVG canvases with an HTML infinite canvas (SolidJS). Build a Figma import pipeline using Figma's official MCP server that fetches raster images immediately and component data in the background.

**Tech Stack:** SolidJS, TypeScript, Drizzle ORM (SQLite), Figma MCP (official), Bun

**Spec:** `docs/superpowers/specs/2026-03-26-agentic-prototyping-studio-design.md`

---

## Implementation Rules

These rules MUST be followed for every task in every phase:

### Rule 1: Evaluate Before Changing

Before modifying any existing file, read it fully and understand:

- What it currently does and why.
- What depends on it (imports, routes, tests).
- Whether the change can be additive (extend) rather than destructive (replace).

**Never delete working code without confirming what breaks.** Use `grep` to find all imports/references before removing any export.

### Rule 2: Reason About Impact

For each task, document:

- **What changes:** Exact files and line ranges.
- **What it impacts:** Other modules that import from or depend on changed code.
- **Risk level:** Low (additive/new file), Medium (modifying existing behavior), High (changing data model/schema/routing).
- **Architectural change?** Does this change how data flows, how state is managed, or how components compose?

### Rule 3: Confirm Before Major Changes

**STOP and confirm with the user before:**

- Changing database schemas (migrations are irreversible in production).
- Modifying routing structure (breaks bookmarks, deep links).
- Removing or renaming exports used by other packages.
- Changing the session/project data model.
- Any change marked as High risk.

Present: what you plan to change, why, what it impacts, and alternatives considered.

### Rule 4: Incremental Over Wholesale

Prefer extending existing code over replacing it. If replacement is necessary:

1. Build the new thing alongside the old.
2. Wire up the new thing.
3. Verify it works.
4. Remove the old thing.
5. Commit each step separately.

### Rule 5: Test Existing Behavior First

Before modifying a module, run its existing tests. If they pass, your changes must not break them (unless the spec explicitly changes that behavior). If no tests exist, write a test for the current behavior before changing it.

---

## Existing Code Evaluation

### What Exists and How It Maps

| Existing Code                                                       | Status   | Plan 1 Action                                                                                       |
| ------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `packages/opencode/src/project/instance.ts` (152 lines)             | Keep     | Extend — Product concept maps to Instance (one per directory). Add Feature scoping.                 |
| `packages/opencode/src/session/`                                    | Keep     | Extend — Sessions become agent chat threads within Features. Add Feature reference to SessionTable. |
| `packages/opencode/src/session/canvas.ts`                           | Keep     | Extend — Canvas state storage (get/put JSON blob) reused for HTML canvas state.                     |
| `packages/app/src/utils/canvas-bridge.ts` (123 lines)               | Replace  | New HTML canvas manager replaces WASM bridge. Delete after new canvas works.                        |
| `packages/app/src/pages/session/canvas-tab-content.tsx` (163 lines) | Replace  | New HTML canvas tab replaces WASM canvas tab. Delete after new canvas works.                        |
| `packages/app/src/pages/session/agent-sandbox/` (12 files)          | Replace  | SVG agent graph replaced by HTML canvas. Delete after new canvas works.                             |
| `packages/app/src/pages/session/figma-tab-content.tsx` (156 lines)  | Extend   | Keep URL parsing, extend with paste-to-canvas import flow.                                          |
| `packages/desktop-electron/src/main/figma-oauth.ts` (165 lines)     | Keep     | OAuth flow reused for MCP authentication. No changes needed.                                        |
| `packages/desktop-electron/src/main/figma-rest-client.ts`           | Evaluate | May be useful for fallback. Keep until MCP integration is verified.                                 |
| `packages/opendesign/src/types/figma.ts`                            | Extend   | Add richer Figma node tree types beyond current FigmaFrame.                                         |
| `packages/opendesign/src/types/node.ts`                             | Extend   | Add new canvas node types for the HTML canvas.                                                      |
| `packages/opendesign/src/canvas/node-factory.ts`                    | Extend   | Add factory functions for new node types.                                                           |
| `packages/opendesign/src/design-system/`                            | Keep     | Reused in later phases. No changes in Plan 1.                                                       |
| `packages/opendesign/src/sandpack/`                                 | Keep     | Reused in Plan 2. No changes in Plan 1.                                                             |
| `packages/opendesign/src/git/`                                      | Keep     | Branch model reused. May extend for Feature branching in Plan 1.                                    |
| `packages/canvas-core/` (Rust)                                      | Freeze   | No changes. Preserved for P2 visual diff overlay.                                                   |
| `packages/canvas-wasm/`                                             | Freeze   | No changes. Preserved for P2 visual diff overlay.                                                   |

### Risk Assessment

| Change                               | Risk       | Mitigation                                                                                                                        |
| ------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Adding Feature concept to data model | **High**   | Schema migration needed. Confirm with user before changing SessionTable. Build alongside existing model first.                    |
| Replacing canvas tab content         | **Medium** | Build new HTML canvas as a separate component. Wire it into the tab system alongside old canvas. Remove old only after new works. |
| Figma MCP integration                | **Medium** | Figma's MCP is external and may change. Build with abstraction layer so fallback to REST client is possible.                      |
| Routing changes for Product/Feature  | **High**   | Changing URL structure breaks deep links. Confirm new route structure with user.                                                  |
| Removing agent-sandbox SVG canvas    | **Low**    | Only used in canvas tab. No external dependencies. Safe to remove after replacement works.                                        |

---

## Task 1: Product/Feature Data Model

**Goal:** Establish the Product → Feature → Agent hierarchy in the data layer.

**Risk:** HIGH — Schema change. Confirm approach before migrating.

**Evaluate first:**

- [ ] **Step 1: Read existing data model**

Read these files to understand the current schema:

```
packages/opencode/src/session/session.sql.ts    # SessionTable schema
packages/opencode/src/session/canvas.ts          # SessionCanvas get/put
packages/opencode/src/project/instance.ts        # Instance state scoping
packages/opencode/src/storage/db.ts              # Database setup
packages/opendesign/src/types/node.ts            # Canvas node types
```

Document: What fields exist on SessionTable? How is project_id used? How does Instance.state() scope things?

- [ ] **Step 2: Confirm approach with user**

Present two options:

- **Option A:** Add a `feature` table (id, product_id, name, branch, status, created_at). Sessions get a `feature_id` column. Minimal schema change.
- **Option B:** Rename project → product at the DB level. Larger migration but cleaner long-term.

Recommend Option A (additive, lower risk). Wait for user confirmation.

- [ ] **Step 3: Write Feature type definition**

Create: `packages/opendesign/src/types/feature.ts`

```typescript
import z from "zod"

export const Feature = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  branch: z.string(),
  status: z.enum(["active", "completed", "archived"]),
  figmaUrl: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Feature = z.infer<typeof Feature>
```

- [ ] **Step 4: Write test for Feature type**

Create: `packages/opendesign/test/types/feature.test.ts`

```typescript
import { describe, test, expect } from "bun:test"
import { Feature } from "../../src/types/feature"

describe("Feature type", () => {
  test("parses valid feature", () => {
    const result = Feature.parse({
      id: "feat_1",
      productId: "proj_1",
      name: "Onboarding Flow",
      branch: "feature/onboarding",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    expect(result.name).toBe("Onboarding Flow")
  })

  test("rejects invalid status", () => {
    expect(() =>
      Feature.parse({
        id: "feat_1",
        productId: "proj_1",
        name: "Test",
        branch: "feature/test",
        status: "invalid",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 5: Run test to verify**

Run: `cd packages/opendesign && bun test test/types/feature.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/opendesign/src/types/feature.ts packages/opendesign/test/types/feature.test.ts
git commit -m "feat(opendesign): add Feature type definition"
```

---

## Task 2: Feature Storage Layer

**Goal:** Store and retrieve Features from the database.

**Risk:** HIGH — Schema migration. Confirm with user.

**Evaluate first:**

- [ ] **Step 1: Read existing storage patterns**

Read these files to understand how OpenCode does data storage:

```
packages/opencode/src/session/session.sql.ts     # Schema pattern
packages/opencode/src/session/index.ts            # CRUD namespace pattern
packages/opencode/src/storage/db.ts               # DB connection
```

Document: What patterns does the codebase use? (Drizzle schema, namespace with static methods, etc.)

- [ ] **Step 2: Confirm schema change with user**

Present the migration:

```sql
CREATE TABLE feature (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  branch TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  figma_url TEXT,
  canvas_state TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Explain: This is additive — no existing tables change. Sessions can optionally reference a feature_id in a future migration. Confirm before proceeding.

- [ ] **Step 3: Write the schema file**

Create: `packages/opencode/src/feature/feature.sql.ts`

Follow the exact pattern used in `session.sql.ts` — Drizzle schema with snake_case field names.

- [ ] **Step 4: Write the Feature namespace**

Create: `packages/opencode/src/feature/index.ts`

Follow the namespace pattern from `packages/opencode/src/session/index.ts`:

- `Feature.create(input)` — Creates feature + git branch
- `Feature.get(id)` — Retrieve by ID
- `Feature.list(productId)` — List features for a product
- `Feature.update(id, patch)` — Update name/status
- `Feature.remove(id)` — Archive/delete

- [ ] **Step 5: Write tests**

Create: `packages/opencode/test/feature/feature.test.ts`

Test CRUD operations. Follow patterns from existing session tests.

- [ ] **Step 6: Run tests**

Run: `cd packages/opencode && bun test test/feature/feature.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/opencode/src/feature/
git add packages/opencode/test/feature/
git commit -m "feat(opencode): add Feature storage layer with CRUD"
```

---

## Task 3: HTML Infinite Canvas — Core

**Goal:** Build the pan/zoom/grid infinite canvas in SolidJS that replaces the Rust/WASM canvas.

**Risk:** MEDIUM — New component, no existing code modified yet.

**Evaluate first:**

- [ ] **Step 1: Read existing canvas implementations**

Read these to understand current patterns and what the new canvas must support:

```
packages/app/src/utils/canvas-bridge.ts           # Current WASM bridge API
packages/app/src/pages/session/canvas-tab-content.tsx  # Current tab integration
packages/app/src/pages/session/agent-sandbox/canvas.tsx  # SVG canvas (pan/zoom reference)
```

Document: What API does canvas-bridge expose? What pan/zoom implementation does the SVG canvas use? What state is persisted?

- [ ] **Step 2: Write the canvas component**

Create: `packages/app/src/components/infinite-canvas/canvas.tsx`

SolidJS component with:

- CSS transform-based pan (translate) and zoom (scale)
- Wheel zoom (with Ctrl for pinch-to-zoom)
- Pointer drag for panning
- Grid rendering (CSS background pattern, adapts to zoom level)
- Coordinate system (screen ↔ world conversion)
- Children rendered at world coordinates

```typescript
interface InfiniteCanvasProps {
  children: JSX.Element
  initialViewport?: { x: number; y: number; zoom: number }
  onViewportChange?: (viewport: Viewport) => void
}
```

- [ ] **Step 3: Write canvas utilities**

Create: `packages/app/src/components/infinite-canvas/viewport.ts`

```typescript
export interface Viewport {
  x: number
  y: number
  zoom: number
}

export function screenToWorld(sx: number, sy: number, vp: Viewport): [number, number]
export function worldToScreen(wx: number, wy: number, vp: Viewport): [number, number]
export function zoomToward(vp: Viewport, sx: number, sy: number, factor: number): Viewport
export function pan(vp: Viewport, dsx: number, dsy: number): Viewport
```

- [ ] **Step 4: Write viewport tests**

Create: `packages/app/src/components/infinite-canvas/viewport.test.ts`

```typescript
import { describe, test, expect } from "bun:test"
import { screenToWorld, worldToScreen, zoomToward, pan } from "./viewport"

describe("viewport", () => {
  test("screenToWorld at identity", () => {
    const [wx, wy] = screenToWorld(100, 200, { x: 0, y: 0, zoom: 1 })
    expect(wx).toBe(100)
    expect(wy).toBe(200)
  })

  test("screenToWorld with pan offset", () => {
    const [wx, wy] = screenToWorld(100, 200, { x: 50, y: 50, zoom: 1 })
    expect(wx).toBe(150)
    expect(wy).toBe(250)
  })

  test("screenToWorld with zoom", () => {
    const [wx, wy] = screenToWorld(100, 200, { x: 0, y: 0, zoom: 2 })
    expect(wx).toBe(50)
    expect(wy).toBe(100)
  })

  test("roundtrip screen → world → screen", () => {
    const vp = { x: 30, y: -20, zoom: 1.5 }
    const [wx, wy] = screenToWorld(100, 200, vp)
    const [sx, sy] = worldToScreen(wx, wy, vp)
    expect(sx).toBeCloseTo(100)
    expect(sy).toBeCloseTo(200)
  })

  test("zoomToward preserves point under cursor", () => {
    const vp = { x: 0, y: 0, zoom: 1 }
    const next = zoomToward(vp, 100, 100, 2)
    expect(next.zoom).toBe(2)
    // The point at (100,100) screen should map to same world coords before and after
    const [wx1] = screenToWorld(100, 100, vp)
    const [wx2] = screenToWorld(100, 100, next)
    expect(wx1).toBeCloseTo(wx2)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd packages/app && bun run test:unit -- src/components/infinite-canvas/viewport.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/infinite-canvas/
git commit -m "feat(app): add HTML infinite canvas with pan/zoom/grid"
```

---

## Task 4: Canvas Node Rendering

**Goal:** Render nodes (images, frames, labels) on the infinite canvas at world coordinates.

**Risk:** LOW — New components only.

- [ ] **Step 1: Define canvas node types for the HTML canvas**

Create: `packages/app/src/components/infinite-canvas/types.ts`

```typescript
export interface CanvasNodePosition {
  id: string
  x: number // world coordinates
  y: number
  width: number
  height: number
}

export interface RasterImageNode extends CanvasNodePosition {
  type: "raster-image"
  imageUrl: string
  label?: string
}

export interface SandpackNode extends CanvasNodePosition {
  type: "sandpack"
  files: Record<string, string>
  label?: string
  dimmed?: boolean
}

export type CanvasNode = RasterImageNode | SandpackNode
```

- [ ] **Step 2: Write CanvasNodeRenderer component**

Create: `packages/app/src/components/infinite-canvas/node-renderer.tsx`

SolidJS component that renders a `CanvasNode` at its world position using absolute positioning within the canvas transform container. For Plan 1, only `raster-image` type needs full implementation. `sandpack` type renders a placeholder.

- [ ] **Step 3: Write CanvasNodeRenderer test**

Verify the component renders the correct element type and position styles for each node type.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/infinite-canvas/
git commit -m "feat(app): add canvas node renderer for raster images"
```

---

## Task 5: Figma URL Paste Handler

**Goal:** Detect when a Figma URL is pasted on the canvas and trigger the import pipeline.

**Risk:** MEDIUM — Integrates with existing Figma code.

**Evaluate first:**

- [ ] **Step 1: Read existing Figma URL parsing**

Read: `packages/app/src/pages/session/figma-tab-content.tsx`

Document: How does `parseFigmaUrl()` work? What does it extract? Where is it defined?

- [ ] **Step 2: Extract URL parser to shared utility (if not already)**

If `parseFigmaUrl` is defined inside the component, extract it to:
`packages/app/src/utils/figma.ts`

Ensure it exports: `parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null`

- [ ] **Step 3: Write paste handler hook**

Create: `packages/app/src/components/infinite-canvas/use-figma-paste.ts`

```typescript
import { onMount, onCleanup } from "solid-js"
import { parseFigmaUrl } from "../../utils/figma"

interface PasteResult {
  fileKey: string
  nodeId: string
  pastePosition: { x: number; y: number }
}

export function useFigmaPaste(
  canvasEl: () => HTMLElement | undefined,
  viewport: () => Viewport,
  onPaste: (result: PasteResult) => void,
) {
  // Listen for paste events on the canvas element
  // Extract text from clipboard
  // Try parseFigmaUrl — if valid, call onPaste with parsed data + world coordinates at paste position
  // If not a Figma URL, ignore
}
```

- [ ] **Step 4: Write tests for paste handler**

Test: valid Figma URL → calls onPaste with correct fileKey/nodeId. Invalid URL → does not call onPaste. Non-text paste → ignored.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/infinite-canvas/use-figma-paste.ts
git add packages/app/src/utils/figma.ts
git commit -m "feat(app): add Figma URL paste detection on canvas"
```

---

## Task 6: Figma MCP Raster Fetch

**Goal:** Fetch a raster image from Figma's MCP server given a fileKey and nodeId. Display it immediately on the canvas.

**Risk:** MEDIUM — External MCP dependency. Build with abstraction for fallback.

**Evaluate first:**

- [ ] **Step 1: Read existing MCP integration**

Read these to understand how OpenCode connects to MCP servers:

```
packages/opencode/src/mcp/                        # MCP client code
packages/opencode/src/server/server.ts             # How MCP tools are exposed
```

Document: How are MCP tools called? How does the client authenticate? How are results returned to the frontend?

- [ ] **Step 2: Read existing Figma REST client (potential fallback)**

Read: `packages/desktop-electron/src/main/figma-rest-client.ts`

Document: Does this have an image export function? What auth does it use?

- [ ] **Step 3: Confirm MCP approach with user**

Present:

- Figma's official MCP exposes `figma_get_image` for raster export.
- The server can proxy MCP tool calls to the frontend via API endpoints.
- Fallback: if MCP is unavailable, use the existing REST client with OAuth token.
- Propose adding a server endpoint: `POST /figma/import` that accepts `{ fileKey, nodeId }` and returns `{ imageUrl, nodeTree?, tokens? }`.
- **Note:** Auth token plumbing currently only exists in Electron (`figma-oauth.ts`). Web client auth path may need extension. Evaluate and flag if so.
- **Note:** Before implementing, list available MCP tools to confirm exact tool names (`figma_get_image` vs alternatives). Tool names may vary by MCP server version.

Wait for confirmation on the API shape.

- [ ] **Step 4: Write the import endpoint**

Create: `packages/opencode/src/server/routes/figma-import.ts`

Server route that:

1. Receives fileKey + nodeId.
2. Calls Figma MCP `figma_get_image` → returns image URL or base64.
3. Returns the raster image data to the client.

Phase 2 (background): also fetches node tree, components, tokens — but for Plan 1, raster image is sufficient.

- [ ] **Step 5: Write test for import endpoint**

Test with mocked MCP response. Verify it returns image data for valid input and error for invalid.

- [ ] **Step 6: Wire up to canvas**

In the paste handler's `onPaste` callback:

1. Call the import endpoint with fileKey + nodeId.
2. Create a `RasterImageNode` at the paste position.
3. Add it to the canvas state.
4. Canvas renders the image immediately.

- [ ] **Step 7: Commit**

```bash
git add packages/opencode/src/server/routes/figma-import.ts
git commit -m "feat(opencode): add Figma import endpoint with MCP raster fetch"
```

---

## Task 7: Wire Canvas Into App

**Goal:** Replace the existing canvas tab with the new HTML infinite canvas. The old canvas should remain functional until the new one is verified.

**Risk:** HIGH — Modifying the session page layout. Confirm approach.

**Evaluate first:**

- [ ] **Step 1: Read current tab system**

Read:

```
packages/app/src/pages/session.tsx                 # Tab layout
packages/app/src/context/layout.tsx                # Tab state management
packages/app/src/pages/session/session-side-panel.tsx  # Side panel
```

Document: How are tabs registered? How does tab switching work? What state is persisted?

- [ ] **Step 2: Confirm integration approach with user**

Present:

- **Option A:** Add "Canvas v2" as a new tab alongside existing canvas. Test in parallel. Remove old tabs when verified.
- **Option B:** Replace the canvas tab directly. Faster but riskier.

Recommend Option A for safety. Wait for confirmation.

- [ ] **Step 3: Create the canvas tab component**

Create: `packages/app/src/pages/session/canvas-v2-tab-content.tsx`

Composes:

- `InfiniteCanvas` component
- `useFigmaPaste` hook
- Canvas state persistence (using existing `session.canvas.get/put` SDK calls)

- [ ] **Step 4: Register the tab**

Modify: `packages/app/src/pages/session.tsx` (or wherever tabs are registered)

Add the new tab. Keep old tabs until verified.

- [ ] **Step 5: Test end-to-end**

Manual test:

1. Open the app.
2. Switch to the new canvas tab.
3. Paste a Figma URL.
4. Verify raster image appears on the canvas.
5. Verify pan/zoom works.
6. Verify state persists across tab switches.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/pages/session/canvas-v2-tab-content.tsx
git add packages/app/src/pages/session.tsx
git commit -m "feat(app): integrate HTML canvas as new tab alongside existing"
```

---

## Task 8: Canvas State Persistence

**Goal:** Save and restore canvas state (nodes, viewport) when switching between sessions/features.

**Risk:** MEDIUM — Uses existing storage API but changes the data shape.

- [ ] **Step 1: Read existing canvas persistence**

Read: `packages/opencode/src/session/canvas.ts`

Document: What's the current state shape? How is it stored (JSON blob)?

- [ ] **Step 2: Define canvas state schema**

```typescript
interface CanvasState {
  viewport: Viewport
  nodes: CanvasNode[]
  version: number // schema version for future migrations
}
```

- [ ] **Step 3: Implement save/load**

Use the existing `SessionCanvas.get(id)` / `SessionCanvas.put(id, state)` pattern. Serialize `CanvasState` as JSON.

- [ ] **Step 4: Write test**

Test: save canvas state → load it back → verify viewport and nodes match.

- [ ] **Step 5: Wire into canvas tab**

Auto-save on viewport change (debounced) and node additions. Auto-load when session/feature is opened.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(app): add canvas state persistence with auto-save/load"
```

---

## Task 9: Cleanup — Remove Old Canvas (after verification)

**Goal:** Remove the WASM canvas bridge, SVG agent sandbox, and old canvas tab once the new HTML canvas is verified working.

**Risk:** LOW — Only after new canvas is confirmed working.

- [ ] **Step 1: Confirm with user that new canvas works**

Ask: "The new HTML canvas is working with paste-to-import. Ready to remove the old WASM canvas and SVG agent sandbox?"

Wait for confirmation.

- [ ] **Step 2: Grep for all imports of old canvas code**

```bash
# Find everything that imports from the old canvas
grep -r "canvas-bridge" packages/app/src/
grep -r "canvas-tab-content" packages/app/src/
grep -r "agent-sandbox" packages/app/src/
```

Document all files that need updating.

- [ ] **Step 3: Remove old canvas files**

Delete:

- `packages/app/src/utils/canvas-bridge.ts`
- `packages/app/src/pages/session/canvas-tab-content.tsx`
- `packages/app/src/pages/session/agent-sandbox/` (entire directory)

Update any files that imported from these.

- [ ] **Step 4: Rename canvas-v2 tab to canvas tab**

Rename `canvas-v2-tab-content.tsx` → appropriate name. Update tab registration.

- [ ] **Step 5: Run all app tests**

Run: `cd packages/app && bun run test:unit`
Expected: All PASS (no broken imports)

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(app): remove old WASM canvas and SVG agent sandbox"
```

---

## Plan 1 Completion Criteria

When Plan 1 is done, you should be able to:

1. ✅ Open the app and see an HTML infinite canvas with pan/zoom/grid.
2. ✅ Paste a Figma URL on the canvas and see the design as a raster image within 2 seconds.
3. ✅ Pan and zoom around the canvas with the raster image.
4. ✅ Canvas state persists when switching tabs or reloading.
5. ✅ Feature type exists in the data model (even if UI for managing Features comes in Plan 2).
6. ✅ Old WASM canvas and SVG agent sandbox are removed.

**Deferred to Plan 2:** Design system sync to shared config, DevTools inspect overlay, annotation system, Sandpack integration.
**Deferred to Plan 3:** Checkpoint system, Design System Panel, DS slider.

**Type system note:** `Feature` Zod type (in `opendesign`) is the domain type used by the UI and business logic. Drizzle schema (in `opencode`) mirrors it for database storage. Zod type is the source of truth; Drizzle schema is the persistence mapping.

**What comes next (Plan 2 — Interaction):**

- DevTools-style inspect overlay on raster images.
- Component hit-map builder from Figma node tree.
- Annotation system with agent spawning.
- Sandpack variation generation and rendering.
- Approval flow with in-place prototype updates.
