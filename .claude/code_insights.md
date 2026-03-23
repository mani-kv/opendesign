# Code Insights

Accumulated knowledge about this codebase. Read before starting any task. Update after each edit session.

---

## Canvas / Figma Panel (`packages/app/src/pages/session/session-side-panel.tsx`)

### CanvasHost — persistent absolute overlay pattern

- `CanvasHost` is a persistent `position: absolute` div rendered **outside** the tab system (DragDropProvider). It survives tab switches so the WebGPU context is never destroyed.
- On **web**, `FigmaWebviewHost` is NOT rendered (`platform.platform !== "web"` guard). Figma renders inline via `<FigmaTabContent />` inside the tab content instead.
- On **electron**, `FigmaWebviewHost` is a separate absolute overlay (same pattern as CanvasHost) and renders after CanvasHost in DOM order, so it naturally covers any canvas overflow.

### CanvasHost — dynamic z-index + left/width split positioning

- **Current architecture**: `CanvasHost` uses `z-index: props.active ? 2 : -1`.
  - When **active** (z-index:2): sits ABOVE the Tabs component (which has an opaque `background-color: var(--background-stronger)` from tabs.css). This is the only way to make the canvas visible — the Tabs' solid background would otherwise cover it.
  - When **inactive** (z-index:-1): sits BEHIND everything, so figma/other content inside Tabs is fully visible.
- **Split positioning**: CanvasHost uses `left + width` only (never `right`) to cover the canvas portion. Using `left + right + width` together causes CSS over-constraint — `right` is silently ignored in LTR, making the canvas extend to full width and overlap figma.
  ```ts
  const left = () => {
    if (offset() > 0 && !props.canvasFirst) return `calc(${offset() * 100}% + 1px)`
    return "0"
  }
  const width = () => {
    if (offset() > 0) {
      if (props.canvasFirst) return `${offset() * 100}%`
      return `calc(${(1 - offset()) * 100}% - 1px)`
    }
    return "100%"
  }
  ```
- **Do NOT add `z-index: 1` to the tabs container div**: This was tried and broke canvas visibility by making the opaque Tabs background paint over CanvasHost.
- **FigmaWebviewHost** (electron): z-index:1 when active. Renders after CanvasHost in DOM; in split mode their areas don't overlap.

### Canvas responsiveness — JS + WASM

- **Freeze-during-drag**: `CanvasHost` uses `createBodyResizing()` to detect split-pane drag. While dragging, the inner canvas div is frozen at its pre-drag pixel dimensions. The host div (with `overflow-hidden`) still changes size, providing smooth visual clipping. The canvas element never resizes → no GPU surface reconfigure → no flicker. A `background: #fff` on the host matches `CANVAS_BG` so any gap during freeze is invisible. On drag end, the freeze is released and a single resize occurs.
- No JS `ResizeObserver` on `CanvasHost`; winit's internal `ResizeObserver` on the canvas element handles resize detection.
- `scheduleCanvasResize()` removed — was redundant with winit's observer.
- **Hard nudge** (display toggle) only in `adoptCanvas` after moving the canvas DOM.
- **Rust (`packages/canvas-wasm`)**: `Resized` queues `PENDING_RESIZE` and requests redraw. `RedrawRequested` uses **throttled** `flush_pending_resize(true)` (~30Hz min gap). `about_to_wait` does NOT flush — it only requests a redraw if pending, so all resizes go through the throttled path. If throttle skips, `RedrawRequested` re-requests a redraw to settle later. Rebuild with `bun run --cwd packages/canvas-wasm build`.

### pointer-events-none pattern for transparent overlays

- Canvas tab `Tabs.Content` (both main tabs and `SplitPaneContent`) must have `pointer-events-none` so mouse events fall through to CanvasHost.
- Electron figma placeholder divs must have `pointer-events-none` so `FigmaWebviewHost` receives events.
- These placeholders are structural — they reserve tab space and keep the tab system coherent without blocking the persistent overlays behind them.

### Resize handles — consistent `inset-block-start` offset

- All `ResizeHandle` components use `position: absolute; inset-block: 0` (spans full height of container), and the `::after` visual indicator has `inset-block: 6px`.
- The sticky tab bars inside each pane (`z-index: 10`, ~48px tall) would visually occlude the top of the handle indicator.
- **Fix**: pass `style={{ "inset-block-start": "var(--tabs-bar-height, 48px)" }}` to every `ResizeHandle` so the indicator starts below the tab bar. Applied to:
  1. Split pane handle in `CanvasFigmaSplit` — `session-side-panel.tsx`
  2. File tree handle — `session-side-panel.tsx`
  3. Agents panel handle — `session.tsx`
- `--tabs-bar-height` is not set as a CSS custom property anywhere in source; it always falls back to `48px`.
- Also update the visual separator line in the split pane: replace `inset-y-0` with `style={{ top: "var(--tabs-bar-height, 48px)", bottom: "0" }}`.

### Split pane (CanvasFigmaSplit)

- `CanvasFigmaSplit` renders two `SplitPaneContent` panes side by side with a draggable divider.
- The canvas pane in `SplitPaneContent` has a transparent `pointer-events-none` `Tabs.Content`. The actual canvas (CanvasHost, always full-width at z-index:0) shows through it.
- On web in split mode: Figma renders inline via `<FigmaTabContent />` inside the right `SplitPaneContent` (inside the z-index:1 tabs container), sitting above the canvas.
- On electron in split mode: `FigmaWebviewHost` is positioned to cover only the figma half (using `splitOffset` + `figmaFirst` props), at z-index:1 when active.

---

## Canvas WASM Bridge (`packages/app/src/utils/canvas-bridge.ts`)

- The WASM canvas is a **singleton** — one `<canvas>` element shared across all sessions.
- `initCanvas(container)` — one-time WASM init; finds the canvas via `container.querySelector("canvas")` after `mod.default()` runs.
- `adoptCanvas(container, sessionId)` — moves the canvas DOM element into the active session's container. After RAF, runs one hard layout nudge (display toggle) so winit picks up the new container size.
- Canvas state is saved/loaded as JSON per session. An in-memory cache (`canvasCache`) avoids redundant server fetches when switching sessions.

---

## Platform Differences (web vs electron)

| Feature           | Web                                                             | Electron                                                         |
| ----------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Figma rendering   | Inline `<FigmaTabContent />` in tab                             | `FigmaWebviewHost` absolute overlay                              |
| Canvas rendering  | `CanvasHost` absolute overlay                                   | `CanvasHost` absolute overlay                                    |
| Canvas over Figma | Fixed via z-index: tabs container (z:1) covers CanvasHost (z:0) | FigmaWebviewHost (z:1 active) covers tabs via DOM order tiebreak |
| Resize handles    | Same CSS, same `inset-block-start` fix                          | Same                                                             |

---

## ResizeHandle component (`packages/ui/src/components/resize-handle.tsx`)

- Spreads `...rest` onto the root div — accepts `style`, `class`, and any data attributes as props.
- CSS (`resize-handle.css`): handle is `position: absolute; z-index: 10; inset-block: 0`. The `::after` visual indicator is `opacity: 0` by default, shown on hover/active.
- Horizontal handle `::after`: `width: 6px; inset-block: 6px; centered inline`.
- Vertical handle `::after`: `height: 6px; inset-inline: 6px; centered block`.
- To override the top start position, pass inline style: `style={{ "inset-block-start": "..." }}`. This overrides the CSS `inset-block: 0` (inline styles take precedence).

---

## Tauri desktop removed (2026-03-19)

- The former `packages/desktop` (Tauri v2) was moved out of the repo to `/Users/Mani/Desktop/SideProjects/opendesign-tauri-archive` (local backup). Native desktop is **Electron only** (`packages/desktop-electron`).
- **Nix**: `flake.nix` no longer exposes a `desktop` / `opencode-desktop` package; `nix/desktop.nix` was deleted. **`nix/hashes.json`** may need a refresh after `nix/node_modules.nix` changed (drop `packages/desktop` filter): use `nix build .#packages.<system>.node_modules_updater` with `lib.fakeHash` to obtain new `outputHash` values, or ask a Nix maintainer to rebuild.

## Prompt “shell mode” removed (2026-03-19)

- Web/desktop (`packages/app` `prompt-input.tsx`): no `normal`/`shell` store, no `!` prefix, no separate shell history storage. Tray no longer animates between shell label and controls.
- TUI (`packages/opencode` `cli/cmd/tui/component/prompt`): same—no shell submit, `!`, or esc/backspace mode exit. `PromptInfo` no longer has `mode`.
- **API**: `POST /session/:id/shell`, `SessionPrompt_shell` / `ShellInput`, and SDK `shell()` were removed entirely (breaking). Agent/bash tool execution unchanged.

---

## Agent Prompt Files (`packages/opencode/src/agent/prompt/`)

- Prompt `.txt` files are imported into `agent.ts` and used as system prompts.
- Existing prompts: `compaction.txt`, `explore.txt`, `summary.txt`, `title.txt`.
- New OpenDesign prompts (added 2026-03-20): `agent.txt` (orchestrator), `ask.txt` (read-only brainstorming), `scenario.txt` (prototype builder), `research.txt` (context synthesis), `audit.txt` (design system/a11y compliance), `figma-write.txt` (Figma modification via webview bridge).
- Style convention: plain text, opening role sentence, "Your responsibilities:" bulleted list, "Guidelines:" bulleted list. No markdown headers.

---

## Agent Definitions (`packages/opencode/src/agent/agent.ts`)

- `build` agent replaced by `opendesign-agent` (primary, orchestrator — denies edit/write, uses PROMPT_AGENT).
- `plan` agent replaced by `opendesign-ask` (primary, read-only — denies all tools except read/search/question, uses PROMPT_ASK).
- 4 new subagents added after `explore`: `opendesign-scenario` (prototype builder), `research` (context synthesis, read-only), `audit` (design system compliance, read-only + bash), `figma-write` (Figma modification, read + bash only).
- `list()` sort default changed from `"build"` to `"opendesign-agent"`.
- Existing agents `general`, `explore`, `compaction`, `title`, `summary` are unchanged.

---

## `packages/opendesign` — Product Domain Layer (added 2026-03-20)

- New package: `@opencode-ai/opendesign` — business logic between opencode engine and UI.
- **Types** (`src/types/`): `CanvasNode` (discriminated union of 6 node types: frame, agent, persona, context, checkpoint, merged), `AgentState` (6-state lifecycle), `DesignSystemEntry`, `TokenSet`, `ComponentRef`, `Persona`, `SimulationMode`, `ViewportPreset`, `SandpackInstance`, `BranchInfo`, `CheckpointInfo`, `MergeResult`, `ContextDocument`, `FigmaFrame`, `FigmaSelection`, `FigmaTokenRef`, `OpenDesignProject`.
- **Modules**: `figma/parse` (URL parsing, embed URL), `agent/color` (color mapping), `agent/lifecycle` (state machine), `canvas/node-factory` (typed node creation), `canvas/graph-store` (SolidJS store for React Flow graph state — nodes, edges, viewport), `canvas/node-layout` (auto-layout: nextPosition, gridLayout, centerViewport), `canvas/node-visibility` (viewport culling, max-5 active Sandpack iframe management, proximity sorting), `canvas/focus-mode` (SolidJS signals for focus mode target + WASM active flag), `simulation/presets` (viewport presets, a11y filter CSS).
- **No JSX** — all `.ts` files. Context providers stay in `packages/app`.
- **No React Flow / Sandpack deps** — exports data models that those UI components consume.
- **Phase C modules** (added 2026-03-20): `agent/orchestrator` (pre-flight plan parsing, scenario branch naming, selected filtering), `sandpack/instance` (config creation, file merging, React scaffolding), `sandpack/files` (path normalization, entry detection), `sandpack/inspector` (iframe inspector shim protocol, selector path builder).
- **Phase D modules** (added 2026-03-20): `design-system/registry` (SolidJS store for workspace-level DS CRUD — add/remove/setActive/updateTokens/updateComponents), `design-system/tokens` (tokensToCss, tokensToStylesheet, diffTokens), `design-system/components` (groupByPackage, searchComponents, componentImport), `git/branch` (agentBranchName slug generation, createBranchInfo, isValidBranchName, filterAgentBranches), `git/checkpoint` (createCheckpointInfo with cp\_ IDs, sortCheckpoints, latestCheckpoint), `git/diff` (successMerge, conflictMerge, categorizeConflicts).
- Tests: `bun test` from `packages/opendesign` (131 tests).
- Exports: subpath exports pattern (`./types`, `./canvas`, `./figma`, `./agent`, `./simulation`, `./sandpack`, `./design-system`, `./git`).

---

## insertReminders removed (2026-03-20)

- `insertReminders()` in `session/prompt.ts` was gutted to a no-op (`return input.messages`).
- Removed 138 lines of plan/build coupling: PROMPT_PLAN injection, BUILD_SWITCH injection, experimental plan mode logic.
- Deleted `session/prompt/plan.txt` and `session/prompt/build-switch.txt`.

## PlanExitTool removed (2026-03-20)

- `tool/plan.ts`, `tool/plan-exit.txt`, `tool/plan-enter.txt` deleted.
- PlanExitTool removed from `tool/registry.ts`.
- `plan_enter`/`plan_exit` removed from default permission rulesets in `agent.ts`.
- TUI `session/index.tsx` plan_exit/plan_enter handlers now reference `"opendesign-agent"` (dead code — tools no longer exist).

## Test references updated (2026-03-20)

- All test files across `packages/opencode/test/` updated: `"build"` → `"opendesign-agent"`, `"plan"` → `"opendesign-ask"`.
- `read.test.ts` env file permissions: only tested with `opendesign-agent` (not `opendesign-ask` — its deny-all-then-whitelist model intentionally overrides granular env file rules from defaults).
- `transcript.test.ts`: expectations updated for title-cased agent names (`"Opendesign-Agent"`, `"Opendesign-Ask"`).

---

## Agent Sandbox Tab (`packages/app/src/pages/session/`)

- **Pane tab**: `"sandbox"` registered alongside `"canvas"` and `"figma"` in layout context. All pane defaults, migration logic, memos, and methods widened for 3-pane support.
- **`swapPaneOrder()` replaced by `setPaneOrder(order)`**: General N-item reorder using splice in DnD `handleDragOver`. Split mode shows first 2 enabled panes from `paneOrder`.
- **Inline SVG renderer**: No persistent absolute overlay like CanvasHost. SVG is lightweight; renders inline in the tab content.
- **Graph store context**: Per-session `createGraphStore()` created in `AgentSandboxTabContent`. No SolidJS context provider — store is passed as props to `AgentSandboxCanvas`.
- **Pan/zoom**: Pure functions (`clampZoom`, `panBy`, `zoomAtPoint`) + `createPanZoom` hook with pointer/wheel handlers. Zoom range 0.1–3.0.
- **Node cards**: `<foreignObject>` wrapping HTML cards. `NodeCard` routes by `node.type` via `<Switch>/<Match>`. `AgentNodeCard` shows state dot, scenario, branch. `SimpleCard` for other types.
- **Edge paths**: Cubic bezier SVG `<path>` — source exits right, target enters left. Stroke style varies by edge type (solid=flow, dashed=context, dotted=checkpoint).
- **`stateColor()` vs `agentColor()`**: `agentColor(name)` maps agent names to CSS vars. `stateColor(state)` maps lifecycle states (created/working/waiting/ready/approved/archived) to CSS vars.
- **Dot grid background**: SVG background-image radial gradient, scales with viewport zoom.

## Sandpack srcdoc runtime (`packages/app/src/pages/session/agent-sandbox/sandpack-srcdoc.ts`)

- Exports `createSandpackSrcdoc(files, entry?)` returning an HTML srcdoc string.
- Runtime loads React 18 + ReactDOM + Babel standalone from unpkg CDN; the `window.load` event guards boot so scripts are ready before `boot()` runs.
- Module system: `loadModule(path)` → Babel-transforms JS/JSX/TS/TSX → `new Function(…)` CommonJS execution; CSS files are injected as `<style id="css-*">` tags.
- Path resolution: exact match first, then tries 8 extension suffixes (.js/.jsx/.ts/.tsx + /index.* variants).
- CSS files are pre-injected in key-order before entry module loads, so `tokens.css` custom properties are available to components.
- `sandpack:update-files` postMessage clears module cache + removes injected CSS tags, then re-boots — full hot-reload.
- `SANDPACK_SRCDOC` constant kept for backward compat = `createSandpackSrcdoc({})`.
- Two consumers: `agent-sandbox-tab-content.tsx` and `agent-node-card.tsx` — both use `srcdoc={SANDPACK_SRCDOC}` today; they should eventually pass real files via `createSandpackSrcdoc(files)`.
- **iframe sandbox attr**: currently `allow-scripts` only — no `allow-same-origin`. This prevents postMessage from reaching `window` inside the iframe on some browsers; if hot-reload stops working, add `allow-same-origin` cautiously (security trade-off).

---

## New Session Optimistic Message Race Condition (`packages/app/src/context/sync.tsx`)

- **Bug**: When creating a new session, `sync.session.sync(id)` is triggered by a `createEffect` in `session.tsx:559`. The `loadMessages()` call inside races with `promptAsync()`. If `loadMessages` resolves first (server has no messages yet), `reconcile([])` wipes the optimistic message → blank chat.
- **Fix**: `loadMessages` now preserves optimistic messages. If server returns empty but store has messages, keep them. Otherwise, merge server results with unconfirmed optimistic messages (by ID).
- **Key sequence**: `navigate()` → `addOptimisticMessage()` → effects flush → `sync.session.sync()` → `loadMessages()` (async GET) races `promptAsync()` (async POST). GET almost always wins.
- **SSE handles convergence**: Once the server processes the prompt, `message.updated` SSE events reconcile the optimistic entry with the real one (same message ID).

---

## `packages/opendesign-figma-mcp` — Figma MCP Server Package (added 2026-03-23)

- **Architecture**: WebSocket server (Electron main process) + MCP server (stdio child process) + Figma plugin (WebSocket client).
- **Protocol**: JSON-RPC style — `{ id, method, params }` requests, `{ id, result }` / `{ id, error }` responses. Events (no `id`): `FILE_INFO`, `SELECTION_CHANGE`.
- **`FigmaWSServer`** (`websocket-server.ts`): Tries ports 9333-9342, tracks clients by `fileKey`, heartbeat every 30s, implements `CommandSender` interface.
- **`FigmaConnector`** (`websocket-connector.ts`): ~40 typed methods wrapping `CommandSender.sendCommand(METHOD, params)` — selection, components, variables, creation, mutation, parity, execute.
- **`FigmaRestClient`** (`rest-client.ts`): Forked from `packages/desktop-electron/src/main/figma-rest-client.ts`. Token from `FIGMA_OAUTH_TOKEN` env var or `~/.config/opencode/opencode.json` config. Max retries: 1. Added `postRequest`/`deleteRequest` + comment endpoints (get/post/delete).
- **`CommandSender`** interface (`types.ts`): Shared between WSServer and Connector.
- **tsconfig**: Uses `@tsconfig/bun` (not `@tsconfig/node22` which isn't installed in this monorepo).
- **Typecheck**: `bun run typecheck` (uses `tsgo --noEmit`).

- **MCP Server** (`mcp-server.ts`): `createMcpServer(connector, restClient)` returns an `McpServer` from `@modelcontextprotocol/sdk`. Registers tools via 7 category modules.
- **Tool categories** (`tools/`): `selection.ts` (6), `components.ts` (8), `variables.ts` (9), `creation.ts` (14), `comments.ts` (3), `parity.ts` (2), `execute.ts` (1) — 43 tools total.
- **Pattern**: Each tool file exports `register*Tools(server, connector[, restClient])`. Tools use `server.tool(name, description, zodSchema, handler)`. Handlers call connector/restClient methods and return `{ content: [{ type: "text", text: JSON.stringify(result) }] }`.
- **Comments tools** use `FigmaRestClient` (REST API), all others use `FigmaConnector` (WebSocket plugin commands).
- **`z.any()` usage**: Variable values, fill/stroke arrays, and instance properties use `z.any()` since Figma's types are deeply nested and vary by context.

- **Electron integration** (`figma-ws.ts`): `startFigmaWS(win)` starts WS server, forwards `selection`/`connected`/`disconnected` events to renderer via IPC. `stopFigmaWS()` called in `before-quit`.
- **MCP config**: Written to `~/.config/opencode/opencode.json` under `config.mcp["opendesign-figma"]` with `OPENDESIGN_FIGMA_PORT` env var pointing to the WS server port. `updateMcpToken()` helper patches the token in-place.
- **OAuth scopes**: `file_comments:write` added alongside existing read scopes for comment tool support.
- **`initialize()` flow**: WS server starts after `loadingTask` completes and `mainWindow` is guaranteed to exist (either created in loadingTask's else branch or in the first `if (!mainWindow)` guard). Port returned by `startFigmaWS` is passed to `writeMcpConfig`.

- **Task 10 cleanup** (2026-03-23): Removed old REST API selection tracking code. Deleted `figma-bridge.ts` preload (webview URL tracking via IPC), `figma-mcp-server.ts` (standalone MCP server, replaced by `packages/opendesign-figma-mcp`). Simplified `figma-selection.ts` to pure state + listeners (no REST client, debounce, thumbnail fetching, or BrowserWindow dependency). Removed `FigmaRestClient` import from `main/index.ts` (the one in `packages/desktop-electron` is now orphaned — can be deleted if no other consumer). Cleaned `preload/types.ts` and `preload/index.ts` of `figmaBridgePreload`, `figmaNotifyUrl`, `onFigmaThumbnail`. Simplified `figma-tab-content.tsx` to use a single `handleNav` for both `did-navigate` and `did-navigate-in-page`.

_Last updated: 2026-03-23 — Task 10: Remove old REST API selection tracking and figma-bridge preload_
