# Vello Canvas Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the code review panel in the canvas tab with a GPU-accelerated design canvas powered by Vello (Rust WASM), with per-project state persisted server-side.

**Architecture:** Two Rust crates (`canvas-core` for platform-independent logic, `canvas-wasm` for browser entry point) are compiled to WebAssembly via `wasm-pack`. The WASM module renders into an HTML `<canvas>` element via WebGPU. A TypeScript bridge manages save/load for per-project state. A persistent `CanvasHost` component (like `FigmaWebviewHost`) keeps the canvas alive across tab switches.

**Tech Stack:** Rust (Vello + wgpu + winit), WebAssembly (wasm-pack), SolidJS, Hono (server), Drizzle ORM (SQLite), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-17-vello-canvas-integration-design.md`

**Source reference:** `/Users/Mani/Desktop/SideProjects/vello-test` (working prototype)

---

## Chunk 1: Rust Crates Setup

### Task 1: Copy canvas-core crate

Copy the entire `canvas-core/` directory from vello-test into the opendesign monorepo. This is a verbatim copy — no modifications needed.

**Files:**
- Create: `packages/canvas-core/` (entire directory tree)

- [ ] **Step 1: Copy canvas-core source**

```bash
cp -r /Users/Mani/Desktop/SideProjects/vello-test/canvas-core /Users/Mani/Desktop/SideProjects/opendesign/packages/canvas-core
```

- [ ] **Step 2: Verify file tree**

```bash
find packages/canvas-core/src -type f | sort
```

Expected files:
```
packages/canvas-core/src/canvas_snapshot.rs
packages/canvas-core/src/canvas_state.rs
packages/canvas-core/src/design/color.rs
packages/canvas-core/src/design/mod.rs
packages/canvas-core/src/design/spacing.rs
packages/canvas-core/src/design/style.rs
packages/canvas-core/src/design/tokens.rs
packages/canvas-core/src/design/typography.rs
packages/canvas-core/src/lib.rs
packages/canvas-core/src/node.rs
packages/canvas-core/src/palette.rs
packages/canvas-core/src/viewport.rs
```

### Task 2: Create canvas-wasm crate

Create the WASM entry point crate. This is adapted from `vello-test/web/` — the Rust source (`lib.rs`) is copied verbatim since it already handles WASM init, rendering, and bridge functions independently of the SolidJS chrome.

**Files:**
- Create: `packages/canvas-wasm/Cargo.toml`
- Create: `packages/canvas-wasm/src/lib.rs` (copy from vello-test/web/src/lib.rs)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/canvas-wasm/src
```

- [ ] **Step 2: Create Cargo.toml**

Create `packages/canvas-wasm/Cargo.toml`:

```toml
[package]
name    = "canvas-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
canvas-core = { path = "../canvas-core" }
vello       = { workspace = true }
wgpu        = { workspace = true, features = ["webgpu", "webgl"] }
winit       = { workspace = true }
anyhow      = { workspace = true }
log         = { workspace = true }

wasm-bindgen              = "=0.2.100"
wasm-bindgen-futures      = "0.4"
console_error_panic_hook  = "0.1"
console_log               = "1.0"

[dependencies.web-sys]
version  = "0.3"
features = [
    "AddEventListenerOptions",
    "Document",
    "DomRect",
    "Element",
    "EventTarget",
    "HtmlCanvasElement",
    "HtmlElement",
    "MouseEvent",
    "WheelEvent",
    "Window",
]

[target.wasm32-unknown-unknown.dependencies]
getrandom = { version = "0.3", features = ["wasm_js"] }
```

- [ ] **Step 3: Copy lib.rs from vello-test**

```bash
cp /Users/Mani/Desktop/SideProjects/vello-test/web/src/lib.rs packages/canvas-wasm/src/lib.rs
```

This file is used verbatim — it already handles:
- WASM init (`#[wasm_bindgen(start)]`)
- winit event loop and WebGPU rendering
- `save_canvas_request()` / `load_canvas_request()` bridge functions
- Wheel zoom listener and context menu suppressor
- Canvas mounting into `#canvas-container`

### Task 3: Create root Cargo.toml workspace

**Files:**
- Create: `Cargo.toml` (at repo root)

- [ ] **Step 1: Create root Cargo.toml**

Create `/Users/Mani/Desktop/SideProjects/opendesign/Cargo.toml`:

```toml
[workspace]
members = ["packages/canvas-core", "packages/canvas-wasm"]
resolver = "2"

[workspace.dependencies]
vello   = "0.7.0"
wgpu    = { version = "27.0.1", default-features = false, features = ["std", "wgsl"] }
winit   = "0.30.12"
anyhow  = "1.0"
log     = "0.4"
```

Note: `wgpu` has `default-features = false` at workspace level. The `canvas-wasm` crate adds `webgpu` + `webgl` features for the WASM target.

- [ ] **Step 2: Verify cargo check passes**

```bash
cargo check -p canvas-core
```

Expected: success (canvas-core has no platform-specific deps)

### Task 4: Build WASM with wasm-pack

- [ ] **Step 1: Ensure wasm-pack is installed**

```bash
which wasm-pack || cargo install wasm-pack
```

- [ ] **Step 2: Add wasm32 target**

```bash
rustup target add wasm32-unknown-unknown
```

- [ ] **Step 3: Build WASM**

```bash
wasm-pack build packages/canvas-wasm --target web --out-dir pkg
```

Expected output in `packages/canvas-wasm/pkg/`:
- `canvas_wasm.js`
- `canvas_wasm_bg.wasm`
- `canvas_wasm.d.ts`
- `canvas_wasm_bg.wasm.d.ts`
- `package.json` (auto-generated by wasm-pack)

- [ ] **Step 4: Commit**

```bash
git add packages/canvas-core packages/canvas-wasm/Cargo.toml packages/canvas-wasm/src Cargo.toml
git commit -m "feat: add canvas-core and canvas-wasm Rust crates

Copy canvas-core from vello-test (verbatim).
Create canvas-wasm WASM entry point with wgpu WebGPU/WebGL features.
Add root Cargo.toml workspace."
```

---

## Chunk 2: Build Pipeline Integration

### Task 5: Create canvas-wasm package.json

**Files:**
- Create: `packages/canvas-wasm/package.json`

- [ ] **Step 1: Create package.json**

Create `packages/canvas-wasm/package.json`:

```json
{
  "name": "@opencode-ai/canvas-wasm",
  "private": true,
  "version": "0.0.0",
  "main": "pkg/canvas_wasm.js",
  "types": "pkg/canvas_wasm.d.ts",
  "files": ["pkg/"],
  "scripts": {
    "build": "wasm-pack build . --target web --out-dir pkg"
  }
}
```

### Task 6: Update turbo.json

**Files:**
- Modify: `turbo.json`

- [ ] **Step 1: Add canvas-wasm build task and app dependency**

Add `@opencode-ai/canvas-wasm#build` task and make `@opencode-ai/app#dev` depend on it. In `turbo.json`, add to the `tasks` object:

```json
"@opencode-ai/canvas-wasm#build": {
  "inputs": ["packages/canvas-core/src/**", "packages/canvas-wasm/src/**", "packages/canvas-wasm/Cargo.toml", "packages/canvas-core/Cargo.toml"],
  "outputs": ["packages/canvas-wasm/pkg/**"]
}
```

And add dependency to the existing `build` task or create app-specific override:

```json
"@opencode-ai/app#build": {
  "dependsOn": ["@opencode-ai/canvas-wasm#build"],
  "outputs": ["dist/**"]
}
```

### Task 7: Update app dependencies and gitignore

**Files:**
- Modify: `packages/app/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add canvas-wasm dependency to app**

In `packages/app/package.json`, add to `dependencies`:

```json
"@opencode-ai/canvas-wasm": "workspace:*"
```

- [ ] **Step 2: Update .gitignore**

The `.gitignore` already has `target` (Rust build dir). Add WASM pkg output:

```
# WASM build output
packages/canvas-wasm/pkg
```

- [ ] **Step 3: Install dependencies**

```bash
bun install
```

- [ ] **Step 4: Verify WASM build via turbo**

```bash
bun turbo run build --filter=@opencode-ai/canvas-wasm
```

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-wasm/package.json turbo.json packages/app/package.json .gitignore bun.lock
git commit -m "chore: add canvas-wasm to build pipeline

Add @opencode-ai/canvas-wasm workspace package.
Configure Turborepo task with correct inputs/outputs.
Add app dependency on canvas-wasm."
```

---

## Chunk 3: Frontend — Canvas Bridge & Components

### Task 8: Create canvas-bridge.ts

Adapted from `vello-test/web/src/canvas-bridge.ts`. Changes:
- Add `initCanvas(containerEl)` function that loads and starts the WASM module
- Add session ID guard for save race conditions
- Integrate with opendesign's SDK for server persistence

**Files:**
- Create: `packages/app/src/utils/canvas-bridge.ts`

- [ ] **Step 1: Create canvas-bridge.ts**

Create `packages/app/src/utils/canvas-bridge.ts`:

```typescript
/**
 * Bridge between the SolidJS app and the Rust WASM canvas.
 * Manages WASM lifecycle, save/load per session, in-memory cache.
 */

export const EMPTY_CANVAS_JSON =
  '{"nodes":[],"next_id":0,"viewport":{"x":-640,"y":-400,"zoom":1}}'

type WasmExports = {
  save_canvas_request: (callback: (json: string) => void) => void
  load_canvas_request: (json: string) => void
}

let wasm: WasmExports | null = null
let initialized = false

const canvasCache = new Map<string, string>()
let activeSessionId: string | undefined

export async function initCanvas(container: HTMLElement): Promise<boolean> {
  if (initialized) return true

  try {
    const mod = await import("@opencode-ai/canvas-wasm")
    await mod.default()

    wasm = {
      save_canvas_request: mod.save_canvas_request,
      load_canvas_request: mod.load_canvas_request,
    }
    initialized = true
    return true
  } catch (e) {
    console.error("[canvas] Failed to initialize WASM:", e)
    return false
  }
}

export function isInitialized(): boolean {
  return initialized
}

export function setActiveSession(sessionId: string): void {
  activeSessionId = sessionId
}

export function saveCanvas(
  sessionId: string,
  callback: (json: string) => void,
): void {
  if (!wasm) {
    canvasCache.set(sessionId, EMPTY_CANVAS_JSON)
    callback(EMPTY_CANVAS_JSON)
    return
  }

  const expectedSession = sessionId
  wasm.save_canvas_request((json) => {
    if (activeSessionId !== expectedSession) return
    canvasCache.set(sessionId, json)
    callback(json)
  })

  requestAnimationFrame(() => {
    const canvas = document.querySelector("#canvas-container canvas")
    ;(canvas as HTMLElement)?.focus?.()
  })
}

export function loadCanvas(json: string, sessionId?: string): void {
  if (sessionId) {
    canvasCache.set(sessionId, json)
    activeSessionId = sessionId
  }
  if (wasm) wasm.load_canvas_request(json)
}

export function getCachedCanvas(sessionId: string): string | null {
  return canvasCache.get(sessionId) ?? null
}

export function focusCanvas(): void {
  const canvas = document.querySelector("#canvas-container canvas")
  ;(canvas as HTMLElement)?.focus?.()
}
```

### Task 9: Create CanvasTabContent component

**Files:**
- Create: `packages/app/src/pages/session/canvas-tab-content.tsx`

- [ ] **Step 1: Create canvas-tab-content.tsx**

Create `packages/app/src/pages/session/canvas-tab-content.tsx`:

```tsx
import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js"
import { useProjectParams } from "@/context/project-scope"
import { useSync } from "@/context/sync"
import {
  initCanvas,
  isInitialized,
  loadCanvas,
  saveCanvas,
  setActiveSession,
  getCachedCanvas,
  EMPTY_CANVAS_JSON,
} from "@/utils/canvas-bridge"

export function CanvasTabContent() {
  const params = useProjectParams()
  const sync = useSync()
  const [ready, setReady] = createSignal(false)
  const [error, setError] = createSignal<string>()
  let containerRef: HTMLDivElement | undefined
  let saveTimer: number | undefined

  const sessionId = () => params.id ?? params.projectId

  onMount(async () => {
    if (!containerRef) return
    const ok = await initCanvas(containerRef)
    if (!ok) {
      setError("WebGPU is not supported in this browser. Please use Chrome, Edge, or Safari.")
      return
    }
    setReady(true)
    loadSessionCanvas(sessionId())
  })

  const loadSessionCanvas = async (sid: string) => {
    setActiveSession(sid)
    const cached = getCachedCanvas(sid)
    if (cached) {
      loadCanvas(cached, sid)
      return
    }

    try {
      const res = await sync.client.session.canvas.$get({ param: { id: sid } })
      if (res.ok) {
        const data = await res.json()
        if (data.state) {
          loadCanvas(data.state, sid)
          return
        }
      }
    } catch {
      // No saved state — start empty
    }

    loadCanvas(EMPTY_CANVAS_JSON, sid)
  }

  const saveSessionCanvas = (sid: string) => {
    saveCanvas(sid, async (json) => {
      try {
        await sync.client.session.canvas.$put({
          param: { id: sid },
          json: { state: json },
        })
      } catch {
        // Save failed — cached locally, will retry
      }
    })
  }

  // Auto-save every 5 seconds of inactivity
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      const sid = sessionId()
      if (sid && ready()) saveSessionCanvas(sid)
    }, 5000)
  }

  // Listen for canvas interaction to trigger auto-save
  onMount(() => {
    const handler = () => scheduleSave()
    containerRef?.addEventListener("pointerup", handler)
    containerRef?.addEventListener("keyup", handler)
    onCleanup(() => {
      containerRef?.removeEventListener("pointerup", handler)
      containerRef?.removeEventListener("keyup", handler)
      if (saveTimer) clearTimeout(saveTimer)
    })
  })

  // Handle session switching
  createEffect(
    on(sessionId, (newId, oldId) => {
      if (!ready() || !newId) return
      if (oldId && oldId !== newId) saveSessionCanvas(oldId)
      loadSessionCanvas(newId)
    }),
  )

  return (
    <div class="relative size-full">
      {error() ? (
        <div class="h-full flex items-center justify-center p-6">
          <div class="text-14-regular text-text-weak text-center max-w-80">
            {error()}
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          id="canvas-container"
          class="absolute inset-0"
          style={{ "touch-action": "none" }}
        />
      )}
    </div>
  )
}
```

**Note:** The `sync.client.session.canvas` API calls reference endpoints we'll create in Chunk 5. During initial development, these calls will fail gracefully (canvas starts empty, saves are no-ops).

### Task 10: Commit frontend components

- [ ] **Step 1: Commit**

```bash
git add packages/app/src/utils/canvas-bridge.ts packages/app/src/pages/session/canvas-tab-content.tsx
git commit -m "feat: add canvas bridge and CanvasTabContent component

Canvas bridge manages WASM lifecycle, save/load per session.
CanvasTabContent initializes WebGPU canvas and handles session switching."
```

---

## Chunk 4: Canvas Tab Integration

### Task 11: Update session-side-panel.tsx — swap canvas content

Replace the review panel content in the canvas tab with `CanvasTabContent`. Add a persistent `CanvasHost` component (mirrors `FigmaWebviewHost` pattern).

**Files:**
- Modify: `packages/app/src/pages/session/session-side-panel.tsx`

- [ ] **Step 1: Add CanvasTabContent import**

In `session-side-panel.tsx`, add import:

```typescript
import { CanvasTabContent } from "@/pages/session/canvas-tab-content"
```

- [ ] **Step 2: Add CanvasHost component**

Add a `CanvasHost` component (similar to `FigmaWebviewHost`) after the `FigmaWebviewHost` function. This keeps the canvas DOM alive across tab/split switches:

```tsx
function CanvasHost(props: { active: boolean; splitOffset?: number; canvasFirst?: boolean }) {
  const offset = () => props.splitOffset ?? 0
  return (
    <div
      class="absolute overflow-hidden"
      style={{
        top: "var(--tabs-bar-height, 48px)",
        left: props.canvasFirst ? "0" : offset() > 0 ? `calc(${offset() * 100}% + 1px)` : "0",
        right: props.canvasFirst && offset() > 0 ? `calc(${(1 - offset()) * 100}%)` : "0",
        bottom: "0",
        "z-index": props.active ? 0 : -1,
        "pointer-events": props.active ? "auto" : "none",
      }}
    >
      <div class="absolute inset-0">
        <CanvasTabContent />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace review panel in canvas Tabs.Content (tab mode)**

In the tab mode `<Match when={true}>` branch, find the canvas `Tabs.Content` that currently renders `props.reviewPanel()`:

```tsx
<Show when={canvasTab()}>
  <Tabs.Content value="canvas" class="relative flex flex-col h-full overflow-hidden contain-strict">
    <div class="relative flex-1 min-h-0 overflow-hidden pb-24">
      <Show when={activeTab() === "canvas"}>{props.reviewPanel()}</Show>
    </div>
  </Tabs.Content>
</Show>
```

Replace with a transparent placeholder (the actual canvas renders via the persistent `CanvasHost`):

```tsx
<Show when={canvasTab()}>
  <Tabs.Content value="canvas" class="relative flex flex-col h-full overflow-hidden contain-strict">
    <div class="absolute inset-0" aria-hidden />
  </Tabs.Content>
</Show>
```

- [ ] **Step 4: Replace review panel in SplitPaneContent**

In the `SplitPaneContent` component, update the `"canvas"` match case. Currently:

```tsx
<Match when={props.pane === "canvas"}>
  <Tabs value="canvas">
    ...
    <Tabs.Content value="canvas" class="...">
      <div class="relative flex-1 min-h-0 overflow-hidden pb-24">{props.reviewPanel()}</div>
    </Tabs.Content>
  </Tabs>
</Match>
```

Replace the content with a transparent placeholder (canvas renders via `CanvasHost`):

```tsx
<Match when={props.pane === "canvas"}>
  <Tabs value="canvas">
    ...
    <Tabs.Content value="canvas" class="relative flex flex-col flex-1 min-h-0 overflow-hidden contain-strict">
      <div class="absolute inset-0" aria-hidden />
    </Tabs.Content>
  </Tabs>
</Match>
```

- [ ] **Step 5: Add CanvasHost to the panel**

Add `CanvasHost` alongside `FigmaWebviewHost` in the panel, right before the `FigmaWebviewHost` `<Show>`:

```tsx
<Show when={canvasTab()}>
  <CanvasHost
    active={
      splitMode() && panes().canvas
        ? true
        : activeTab() === "canvas"
    }
    splitOffset={
      splitMode() && panes().canvas && panes().figma
        ? layout.canvasPanel.splitRatio()
        : 0
    }
    canvasFirst={
      splitMode() && panes().canvas && panes().figma
        && layout.canvasPanel.paneOrder()[0] === "canvas"
    }
  />
</Show>
```

- [ ] **Step 6: Remove review panel props**

Remove the `reviewPanel` prop from the `SessionSidePanel` component signature. Also remove `reviewCount`, `hasReview` from `CanvasFigmaSplit` and `SplitPaneContent` props (these were for the review badge on the canvas tab — no longer needed).

Update the canvas tab trigger to remove the review count badge:

Before:
```tsx
<Match when={pane === "canvas"}>
  <div class="flex items-center gap-1.5">
    <div>{language.t("session.tab.canvas")}</div>
    <Show when={hasReview()}>
      <div>{reviewCount()}</div>
    </Show>
  </div>
</Match>
```

After:
```tsx
<Match when={pane === "canvas"}>
  {language.t("session.tab.canvas")}
</Match>
```

This applies to both the tab mode sortable pane tabs and the split mode `SplitPaneContent`.

- [ ] **Step 7: Update session.tsx (parent)**

In `packages/app/src/pages/session.tsx`, remove the `reviewPanel` prop passed to `SessionSidePanel`. The `reviewPanel` memo and `SessionReviewTab` reference can be removed from the canvas tab flow (keep if used elsewhere).

- [ ] **Step 8: Verify typecheck**

```bash
bun turbo typecheck
```

- [ ] **Step 9: Commit**

```bash
git add packages/app/src/pages/session/session-side-panel.tsx packages/app/src/pages/session.tsx
git commit -m "feat: replace review panel with vello canvas in canvas tab

Canvas tab now shows the vello WebGPU canvas via CanvasHost.
CanvasHost persists the WASM canvas across tab/split switches.
Removed review panel props from canvas tab."
```

---

## Chunk 5: Server API & Persistence

### Task 12: Create session_canvas database schema

**Files:**
- Create: `packages/opencode/src/session/session-canvas.sql.ts`
- Modify: `packages/opencode/src/storage/schema.ts` (add export)

- [ ] **Step 1: Find existing schema pattern**

Read `packages/opencode/src/storage/schema.ts` and an existing `.sql.ts` file (like `packages/opencode/src/session/session.sql.ts`) to understand the pattern.

- [ ] **Step 2: Create session-canvas.sql.ts**

Create the schema following the existing Drizzle pattern. The table stores canvas state JSON per session:

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const SessionCanvasTable = sqliteTable("session_canvas", {
  session_id: text("session_id").primaryKey(),
  state: text("state").notNull(),
  updated_at: integer("updated_at").notNull(),
})
```

- [ ] **Step 3: Add to schema exports**

Add `SessionCanvasTable` to the schema file that registers tables with Drizzle.

### Task 13: Create SessionCanvas namespace module

**Files:**
- Create: `packages/opencode/src/session/session-canvas.ts`

- [ ] **Step 1: Create the module**

Follow the namespace pattern used throughout the codebase. Create a `SessionCanvas` namespace with `get()` and `put()` methods:

```typescript
import { eq } from "drizzle-orm"
import { SessionCanvasTable } from "./session-canvas.sql"
import { useInstance } from "../project/instance"

export namespace SessionCanvas {
  export async function get(sessionId: string): Promise<string | undefined> {
    const db = useInstance().db
    const row = await db
      .select({ state: SessionCanvasTable.state })
      .from(SessionCanvasTable)
      .where(eq(SessionCanvasTable.session_id, sessionId))
      .get()
    return row?.state
  }

  export async function put(sessionId: string, state: string): Promise<void> {
    const db = useInstance().db
    await db
      .insert(SessionCanvasTable)
      .values({ session_id: sessionId, state, updated_at: Date.now() })
      .onConflictDoUpdate({
        target: SessionCanvasTable.session_id,
        set: { state, updated_at: Date.now() },
      })
      .run()
  }
}
```

### Task 14: Add server routes

**Files:**
- Modify: `packages/opencode/src/server/server.ts`

- [ ] **Step 1: Read existing route patterns**

Read `packages/opencode/src/server/server.ts` to understand the route definition pattern (describeRoute, validator, etc.).

- [ ] **Step 2: Add canvas routes**

Add GET and PUT routes for canvas state. Follow the existing session route patterns:

```typescript
// GET /session/:id/canvas
app.get("/session/:id/canvas", async (c) => {
  const id = c.req.param("id")
  const state = await SessionCanvas.get(id)
  return c.json({ state: state ?? null })
})

// PUT /session/:id/canvas
app.put("/session/:id/canvas", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json<{ state: string }>()
  await SessionCanvas.put(id, body.state)
  return c.json({ ok: true })
})
```

Adapt these to match the exact route definition pattern used in the codebase (describeRoute, validator, etc.).

- [ ] **Step 3: Regenerate SDK**

```bash
./script/generate.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/session/session-canvas.sql.ts packages/opencode/src/session/session-canvas.ts packages/opencode/src/server/server.ts packages/opencode/src/storage/schema.ts packages/sdk/
git commit -m "feat: add server API for canvas state persistence

New session_canvas table stores canvas JSON per session.
GET/PUT /session/:id/canvas endpoints for save/load.
Regenerated SDK."
```

---

## Chunk 6: Wiring & Verification

### Task 15: Update canvas-tab-content to use SDK

Once the SDK is regenerated with the canvas endpoints, update `canvas-tab-content.tsx` to use the typed SDK client instead of raw fetch calls.

**Files:**
- Modify: `packages/app/src/pages/session/canvas-tab-content.tsx`

- [ ] **Step 1: Update API calls to use generated SDK types**

Review the regenerated SDK in `packages/sdk/js/` and update the `loadSessionCanvas` and `saveSessionCanvas` functions to use the correct typed client methods.

### Task 16: End-to-end verification

- [ ] **Step 1: Build WASM**

```bash
wasm-pack build packages/canvas-wasm --target web --out-dir pkg
```

- [ ] **Step 2: Start dev server**

```bash
bun dev web
```

- [ ] **Step 3: Verify canvas renders**

Open browser → navigate to a session → canvas tab should show the WebGPU canvas. Draw rectangles (press R, click and drag). Pan (scroll), zoom (pinch/ctrl+scroll).

- [ ] **Step 4: Verify session switching**

Switch to another session → canvas should save and load independently.

- [ ] **Step 5: Verify persistence**

Reload the page → canvas state should be restored from the server.

- [ ] **Step 6: Verify split mode**

Enable split mode (canvas + figma) → both should render correctly side by side.

- [ ] **Step 7: Verify tab reordering**

Drag canvas tab onto figma tab → they should swap order. Works in both tab and split mode.

- [ ] **Step 8: Type check**

```bash
bun turbo typecheck
```

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: wire canvas tab to server persistence

Canvas state saves/loads via SDK.
End-to-end canvas integration complete."
```
