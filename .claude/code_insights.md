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

| Feature | Web | Electron |
|---|---|---|
| Figma rendering | Inline `<FigmaTabContent />` in tab | `FigmaWebviewHost` absolute overlay |
| Canvas rendering | `CanvasHost` absolute overlay | `CanvasHost` absolute overlay |
| Canvas over Figma | Fixed via z-index: tabs container (z:1) covers CanvasHost (z:0) | FigmaWebviewHost (z:1 active) covers tabs via DOM order tiebreak |
| Resize handles | Same CSS, same `inset-block-start` fix | Same |

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

---

_Last updated: 2026-03-19 — Tauri/desktop package removed; Electron-only desktop; Nix hash refresh may be needed_
