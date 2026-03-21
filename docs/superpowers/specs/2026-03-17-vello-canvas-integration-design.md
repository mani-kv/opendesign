# Vello Canvas Integration Design

## Problem

The "canvas" tab in opendesign currently shows a code review/diff panel. We want to replace it with a GPU-accelerated design canvas powered by [Vello](https://github.com/linebender/vello) (Rust 2D graphics) running as WebAssembly. Each project/session should have its own canvas state, persisted server-side.

The implementation is based on the working prototype at `/Users/Mani/Desktop/SideProjects/vello-test`, which demonstrates Vello rendering in a SolidJS app via WASM.

## Approach

**Direct WASM integration** — Load the WASM module directly in the SolidJS app. The canvas renders via WebGPU into an HTML `<canvas>` element. Works in both web and Electron desktop (Chromium supports WebGPU). This is the simplest approach and matches how the vello-test prototype already works.

The canvas is a **singleton WASM instance**. Per-project switching is handled via save/load (serialize canvas state to JSON, send to server, load new project's state). This matches how a design tool naturally works — one active canvas at a time.

## Monorepo Structure

Two new Rust crates under `packages/`:

```
packages/
  canvas-core/               # Platform-independent canvas logic
    Cargo.toml                # deps: vello, wgpu, winit, serde, serde_json, anyhow, log
    src/
      lib.rs                  # Public API exports
      canvas_state.rs         # Scene building, input handling, tools, drag states
      canvas_snapshot.rs      # JSON serialization for persistence
      node.rs                 # Scene graph nodes with extensible property system
      viewport.rs             # Pan/zoom camera (world ↔ screen coordinate transforms)
      palette.rs              # Canvas colors (CANVAS_BG, selection colors, etc.)
      design/
        mod.rs
        color.rs              # RGB/RGBA/Hex/HSL color system
        spacing.rs            # px/rem/% spacing values
        typography.rs         # Font properties
        style.rs              # Combined styling
        tokens.rs             # Design token registry

  canvas-wasm/                # WASM entry point
    Cargo.toml                # deps: canvas-core, wasm-bindgen, web-sys, js-sys, wgpu, winit, vello
    package.json              # @opencode-ai/canvas-wasm workspace package
    src/lib.rs                # winit ApplicationHandler, WebGPU surface setup, bridge functions
    pkg/                      # wasm-pack output (gitignored)
```

A root `Cargo.toml` defines the workspace:

```toml
[workspace]
members = ["packages/canvas-core", "packages/canvas-wasm"]
resolver = "2"

[workspace.dependencies]
vello = "0.7.0"
wgpu = { version = "27.0.1", default-features = false, features = ["std", "wgsl"] }
winit = "0.30.12"
anyhow = "1.0"
log = "0.4"
```

**Note on wgpu features:** The workspace declares `wgpu` with `default-features = false` and only `std` + `wgsl`. The `canvas-wasm` crate adds `webgpu` + `webgl` features for WASM targets. The `canvas-core` crate uses the workspace defaults (no platform-specific backend). This prevents native-only backends (metal, vulkan) from being pulled into the WASM build.

### canvas-wasm/package.json

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

## Source Mapping (vello-test → opendesign)

| vello-test source           | opendesign destination                    | Adaptation                                                                              |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `canvas-core/` (entire dir) | `packages/canvas-core/`                   | Verbatim copy (including `palette.rs`)                                                  |
| `web/src/lib.rs`            | `packages/canvas-wasm/src/lib.rs`         | Remove SolidJS app mounting; keep WASM init, rendering, bridge functions                |
| `web/src/canvas-bridge.ts`  | `packages/app/src/utils/canvas-bridge.ts` | Replace project-switching UI logic with opendesign session context integration          |
| `web/Cargo.toml`            | `packages/canvas-wasm/Cargo.toml`         | Update paths to reference `packages/canvas-core`; add `webgpu`+`webgl` features to wgpu |

## Frontend Integration

### New Components

**`packages/app/src/utils/canvas-bridge.ts`**

- Manages WASM module lifecycle (`init()` from pkg)
- Exports `saveCanvas(sessionId, callback)` and `loadCanvas(sessionId, json)`
- Maintains in-memory cache: `Map<sessionId, canvasJSON>`
- Exposes `initCanvas(containerEl)` to bootstrap the WASM module
- **Race condition guard**: Each save callback carries the session ID it was initiated for; stale callbacks (where the active session has changed since the save was requested) are discarded

**`packages/app/src/pages/session/canvas-tab-content.tsx`**

- Renders a container `<div>` for the WASM canvas
- On first mount: calls `initCanvas(containerEl)` to start the WASM module
- WASM creates an HTML `<canvas>` element inside the container and starts its winit event loop
- Handles session switching: save current → load new
- **WebGPU fallback**: Shows an error state if WebGPU is unavailable (mirrors the `show_webgpu_error()` pattern from the vello-test prototype)

### Persistent Canvas Host

The WASM canvas creates a persistent DOM element that must survive tab/split mode switches (same problem as Figma's webview). A `CanvasHost` component (similar to `FigmaWebviewHost`) is added to `session-side-panel.tsx`:

- Renders the canvas container once, keeps it alive
- When canvas tab is inactive: `z-index: -1; pointer-events: none`
- When active: `z-index: 0; pointer-events: auto`
- In split mode with figma: positioned via CSS `left`/`right` offsets (mirrors `FigmaWebviewHost` pattern)
- Never removed from DOM — prevents WASM re-initialization

### Canvas Tab Content Swap

In `session-side-panel.tsx`:

- The canvas `Tabs.Content` changes from rendering `props.reviewPanel()` to rendering `<CanvasTabContent />`
- The `reviewPanel` prop is removed from `SessionSidePanel`
- The `CanvasFigmaSplit` component's canvas pane also changes to show `CanvasTabContent`
- In `SplitPaneContent`, the `"canvas"` match case renders the canvas instead of the review panel
- The `hasReview` / `reviewCount` badge logic on the canvas tab trigger is removed (no longer showing review diffs)

### Keyboard Focus

The WASM canvas captures keyboard events (V for select, R for rectangle, Delete, Escape). To avoid conflicts with the app's own shortcuts:

- The canvas only captures keyboard events when it has focus (winit's behavior in WASM)
- Clicking outside the canvas (tab bar, prompt dock, etc.) returns focus to the SolidJS app
- The canvas-bridge exposes a `focusCanvas()` function that programmatically focuses the canvas element

### Vite Configuration

The wasm-pack output (`--target web`) generates a JS glue module that handles WASM loading via `fetch` + `WebAssembly.instantiateStreaming`. Since `packages/app/vite.config.ts` already sets `build.target: "esnext"`, native ESM WASM imports should work without additional plugins. The `.wasm` file is served as a static asset.

If native ESM WASM loading has issues during development, `vite-plugin-wasm` can be added as a fallback.

### WASM Import

Use the Bun workspace alias (consistent with how other packages are referenced):

In `packages/app/package.json`:

```json
{ "dependencies": { "@opencode-ai/canvas-wasm": "workspace:*" } }
```

In TypeScript:

```ts
import init from "@opencode-ai/canvas-wasm"
```

## Per-Project Canvas State

### Server API

New endpoints in `packages/opencode/src/server/server.ts`, following the existing route pattern (`describeRoute`, `validator`, `resolver` from `hono-openapi`):

- `GET /session/:id/canvas` — Load canvas state JSON for a session
- `PUT /session/:id/canvas` — Save canvas state JSON for a session

After adding these routes, run `./script/generate.ts` to regenerate the SDK.

### Database Schema

New `session_canvas` table (separate from the session table to avoid bloating session list queries):

```ts
// packages/opencode/src/session/session-canvas.sql.ts
export const SessionCanvasTable = sqliteTable("session_canvas", {
  sessionID: text("session_id").primaryKey(),
  state: text("state").notNull(), // JSON canvas snapshot
  updatedAt: integer("updated_at").notNull(),
})
```

A new `SessionCanvas` namespace module handles CRUD, following the existing namespace pattern.

### Lifecycle

1. User opens session → canvas tab loads → WASM initializes (one-time on first mount)
2. Bridge calls `GET /session/:id/canvas` → loads JSON into WASM via `load_canvas_request()`
3. User draws on canvas → periodic auto-save (debounced, every 5s of inactivity) via `save_canvas_request()` → `PUT /session/:id/canvas`
4. User switches session → save current state (with session ID guard) → load new session's state
5. On app close / tab close → final save

### Data Flow

```
User input → winit event loop → CanvasState methods → build_scene() → vello render → WebGPU → <canvas>
                                        ↓ (on save)
                            to_snapshot_json() → canvas-bridge → PUT /session/:id/canvas
                                        ↑ (on load)
                            GET /session/:id/canvas → canvas-bridge → load_snapshot_json()
```

## Build Pipeline

### wasm-pack Build

```bash
wasm-pack build packages/canvas-wasm --target web --out-dir pkg
```

Output: `packages/canvas-wasm/pkg/` containing:

- `canvas_wasm.js` — JS glue code
- `canvas_wasm_bg.wasm` — WASM binary
- `canvas_wasm.d.ts` — TypeScript types

### Turborepo Integration

Add to root `turbo.json`:

```json
{
  "tasks": {
    "@opencode-ai/canvas-wasm#build": {
      "inputs": ["packages/canvas-core/src/**", "packages/canvas-wasm/src/**"],
      "outputs": ["packages/canvas-wasm/pkg/**"]
    },
    "@opencode-ai/app#dev": {
      "dependsOn": ["@opencode-ai/canvas-wasm#build"]
    }
  }
}
```

### Dev Workflow

- `bun dev` triggers `@opencode-ai/canvas-wasm#build` as a dependency before `app:dev`
- For active Rust development: run `cargo watch -w packages/canvas-core -w packages/canvas-wasm -s 'wasm-pack build packages/canvas-wasm --target web --out-dir pkg'` in a separate terminal
- WASM rebuild is only needed when Rust source changes (not on TypeScript changes)

### CSP Considerations

The server's proxy route sets CSP headers including `script-src 'self' 'wasm-unsafe-eval'`. WebGPU shader compilation may require `'unsafe-eval'` in some browsers. If WebGPU fails at runtime:

1. Check if the dev server (Vite, port 3000) bypasses CSP (it typically does)
2. For production, update the CSP in `server.ts` to add `'unsafe-eval'` if needed for WebGPU shader compilation

Electron does not apply the same CSP constraints as static hosting in many setups, so desktop will not have this issue.

## Testing & Verification

1. **WASM build**: `wasm-pack build packages/canvas-wasm --target web --out-dir pkg` succeeds
2. **Web**: Open canvas tab → WebGPU canvas renders → draw rectangles → switch sessions → canvas state preserved
3. **Desktop (Electron)**: Same as web (Chromium supports WebGPU)
4. **Split mode**: Canvas + Figma side-by-side → both render correctly → canvas host positioned correctly
5. **Persistence**: Draw on canvas → reload page → canvas state restored from server
6. **Session switching**: Rapidly switch sessions → no state corruption (race condition guard)
7. **WebGPU fallback**: Open in browser without WebGPU → meaningful error shown
8. **Type check**: `bun turbo typecheck` passes
9. **SDK**: `./script/generate.ts` succeeds after adding new routes
