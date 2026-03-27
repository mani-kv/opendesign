# Figma Selection Context in Prompt

**Date:** 2026-03-22
**Status:** Draft

## Problem

When a user selects a frame, component, or other node in the embedded Figma webview, the selection is tracked in the Electron main process but never surfaces in the prompt input. The user has no way to reference their Figma selection when talking to the agent without manually describing it.

## Goal

Auto-attach the current Figma selection as a context chip in the prompt input area — showing the node name (frame, component, group, etc.), dismissable by the user. On submit, the agent receives the selection reference and an optional thumbnail so it has immediate visual context.

## Design

### Selection Data Shape

```typescript
type FigmaContextItem = {
  type: "figma"
  fileKey: string
  nodeId: string
  nodeName: string | null   // "Header Frame", "Button/Primary", etc.
  nodeType: string | null   // "FRAME", "COMPONENT", "INSTANCE", etc.
  fileName: string | null
  url: string
  thumbnail?: string        // base64 data URL, best-effort
}
```

Node name and type are fetched from the Figma REST API. If the API call fails or times out, `nodeName` and `nodeType` are `null` and the chip shows the nodeId as fallback.

### Layer 1: Electron Main Process

**File: `packages/desktop-electron/src/main/figma-selection.ts`**

After `updateSelection()` is called (triggered by the webview bridge IPC), the main process:

1. Debounces for 500ms (resets on each new selection change)
2. Calls the Figma REST API: `GET /v1/files/:fileKey/nodes?ids=:nodeId` to fetch node name and type
3. Sends an IPC event `figma:selection-updated` to the main BrowserWindow with the full selection data:
   ```
   { fileKey, nodeId, nodeName, nodeType, fileName, url }
   ```
4. Optionally, fires a background request to `GET /v1/images/:fileKey?ids=:nodeId&format=png&scale=0.5` for a thumbnail. If it resolves within 3s, sends a follow-up IPC event `figma:selection-thumbnail` with `{ nodeId, thumbnail }`. If not, skip — the agent can fetch via MCP if needed. **Important:** Include the `nodeId` in the thumbnail event so the renderer can verify it matches the current selection and discard stale thumbnails from previous selections.

**Debounce behavior:** Each new selection resets the 500ms timer. Only the latest selection is processed. This prevents API spam when clicking through nodes quickly.

**Error handling:** If the REST API call fails (network error, auth expired, rate limited), still send the IPC event with `nodeName: null, nodeType: null`. The chip falls back to showing the nodeId.

**Deselection:** Figma does not change the URL when clicking empty canvas — the webview bridge only fires on URL navigation. This means the chip represents "last navigated-to node," not necessarily "currently selected in Figma." This is acceptable: the chip shows what the user last looked at, and the user can dismiss it if it's no longer relevant.

### Layer 2: Preload Bridge

**File: `packages/desktop-electron/src/preload/index.ts`**

Add two new API methods following the existing `onMenuCommand` / `onDeepLink` pattern:

```typescript
onFigmaSelection: (cb: (selection: FigmaSelectionData) => void) => () => void
onFigmaThumbnail: (cb: (data: { nodeId: string; thumbnail: string }) => void) => () => void
```

These listen on `figma:selection-updated` and `figma:selection-thumbnail` IPC channels respectively. Return an unsubscribe function.

Also add to `ElectronAPI` type in `preload/types.ts`.

### Layer 3: Prompt Context System

**File: `packages/app/src/context/prompt.tsx`**

Extend the `ContextItem` union type to include `FigmaContextItem`:

```typescript
type ContextItem = FileContextItem | FigmaContextItem
```

Add a `contextItemKey()` case for figma items:
```
figma:${fileKey}:${nodeId}
```

When `nodeId` is null (file-level selection with no specific node), use:
```
figma:${fileKey}
```

The existing `prompt.context.add()` and `prompt.context.remove()` work as-is since they operate on the `ContextItem` union.

**Singleton behavior:** Only one Figma selection context item at a time. When a new selection arrives, remove the previous figma item before adding the new one. Find existing figma items by filtering `items.filter(i => i.type === "figma")` rather than by key match, since the key changes with each node.

**Dismiss behavior:** Track dismissed nodeId in a reactive signal `dismissedFigmaNode` (in-memory only, not persisted). When the user dismisses a chip, store its nodeId. On new selection: if the nodeId differs from `dismissedFigmaNode`, clear the flag and auto-attach. Same nodeId stays dismissed. Signal resets on component unmount (session navigation).

### Layer 4: Context Chip UI

**File: `packages/app/src/components/prompt-input/context-items.tsx`**

The existing `<For>` loop unconditionally accesses `item.path`, `getDirectory(item.path)`, and `item.selection` — all `FileContextItem`-specific fields. Restructure the loop body with a `<Switch>`/`<Match>` on `item.type`:

- **`<Match when={item.type === "file"}>`** — existing file chip rendering (unchanged)
- **`<Match when={item.type === "figma"}>`** — new figma chip:
  - **Icon:** Small Figma logo SVG (same as titlebar, 14x14)
  - **Label:** `nodeName` truncated to 14 chars, or `nodeId` as fallback
  - **Subtitle:** `nodeType` in lowercase (e.g., "frame", "component") if available
  - **Thumbnail:** If `thumbnail` exists, show as a small preview (16x16) next to the icon
  - **Dismiss:** Same close button pattern as file context items

### Layer 5: Wiring in the Session Page

**File: `packages/app/src/pages/session/` (likely session-composer-region.tsx or prompt-input.tsx)**

On mount (desktop platform only):
1. Subscribe to `api.onFigmaSelection()`
2. On each selection event: remove any existing figma context item, add the new one via `prompt.context.add()`
3. Subscribe to `api.onFigmaThumbnail()`
4. On thumbnail event: update the existing figma context item's `thumbnail` field
5. On cleanup: unsubscribe both listeners

### Layer 6: Agent Message Serialization

**File: `packages/app/src/utils/build-request-parts.ts` (or equivalent)**

The existing `buildRequestParts` function calls `absolute(dir, item.path)` and `getFilename(item.path)` on every context item. Add a type guard before file-specific access:

```typescript
if (item.type === "file") {
  // existing file serialization logic
} else if (item.type === "figma") {
  // figma serialization (below)
}
```

Figma serialization format:

```
[Figma Selection]
Node: "Header Frame" (FRAME)
File: ABC123
Node ID: 1:42
URL: https://www.figma.com/design/ABC123/...?node-id=1:42
```

If a thumbnail is available, attach it as an image part in the message (base64).

The agent can then use `figma_get_frame`, `figma_get_selection`, or other MCP tools to fetch full node details if needed.

## Constraints

| Constraint | Decision |
|---|---|
| Thumbnail is best-effort | Never block on thumbnail. If REST API is slow, skip it. |
| One figma selection at a time | New selection replaces previous. No stacking. |
| Debounce 500ms | Prevents API spam during rapid clicking. |
| Thumbnail timeout 3s | If image render takes longer, skip. Agent can fetch via MCP. |
| Dismiss is per-node | Dismissing "Frame A" doesn't suppress "Frame B" auto-attach. In-memory signal only, not persisted. |
| Thumbnail must match current node | Renderer verifies `nodeId` on thumbnail event to discard stale thumbnails. |
| Chip = last navigated node | Not real-time Figma selection. Figma doesn't signal canvas deselection via URL. User can dismiss. |
| Desktop only | Figma selection only available in Electron app, not web. |
| No file content pre-fetch | We send reference info only. Agent uses MCP for deep data. |

## Files to Create/Modify

| File | Change |
|---|---|
| `packages/desktop-electron/src/main/figma-selection.ts` | Add debounced IPC emit with REST API node name fetch |
| `packages/desktop-electron/src/main/figma-rest-client.ts` | Ensure `getNode()` method exists for name/type lookup |
| `packages/desktop-electron/src/preload/index.ts` | Add `onFigmaSelection` and `onFigmaThumbnail` listeners |
| `packages/desktop-electron/src/preload/types.ts` | Add types to `ElectronAPI` |
| `packages/app/src/context/prompt.tsx` | Add `FigmaContextItem` to union, key generation |
| `packages/app/src/components/prompt-input/context-items.tsx` | Render figma chip with icon, name, dismiss |
| `packages/app/src/components/prompt-input.tsx` or session composer | Wire IPC listener → prompt context |
| `packages/app/src/utils/build-request-parts.ts` (or equivalent) | Add type guard and figma serialization in `buildRequestParts` |

## Out of Scope

- Figma multi-selection (selecting multiple nodes at once)
- Persistent selection across sessions
- Selection history
- Drag-and-drop from Figma to prompt
