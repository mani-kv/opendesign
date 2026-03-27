# Figma Selection Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-attach the current Figma selection (node name, type, reference info, optional thumbnail) as a dismissable context chip in the prompt input, so agents receive Figma context alongside user prompts.

**Architecture:** The Electron main process debounces Figma URL changes, fetches node metadata via REST API, and sends IPC events to the renderer. The renderer adds/removes a `"figma"` context item in the existing prompt context system. On submit, figma context is serialized as a text reference + optional image part.

**Tech Stack:** Electron IPC, Figma REST API, SolidJS (prompt context store, context-items component)

**Spec:** `docs/superpowers/specs/2026-03-22-figma-selection-context-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/desktop-electron/src/main/figma-selection.ts` | Modify | Add debounced node metadata fetch + IPC emit to BrowserWindow |
| `packages/desktop-electron/src/main/index.ts` | Modify | Pass mainWindow ref to selection module, wire thumbnail IPC |
| `packages/desktop-electron/src/preload/index.ts` | Modify | Add `onFigmaSelection` and `onFigmaThumbnail` IPC listeners |
| `packages/desktop-electron/src/preload/types.ts` | Modify | Add new methods to `ElectronAPI` type |
| `packages/app/src/context/prompt.tsx` | Modify | Add `FigmaContextItem` type, extend `ContextItem` union, update `contextItemKey` |
| `packages/app/src/components/prompt-input/context-items.tsx` | Modify | Add `Switch`/`Match` for figma vs file chip rendering |
| `packages/app/src/components/prompt-input/build-request-parts.ts` | Modify | Add type guard + figma serialization in `buildRequestParts` |
| `packages/app/src/components/prompt-input.tsx` | Modify | Wire IPC listener → prompt context (auto-attach/dismiss logic) |

---

### Task 1: Extend Figma Selection Module with Debounced Node Fetch + IPC

**Files:**
- Modify: `packages/desktop-electron/src/main/figma-selection.ts`

This task adds: debounce timer, REST API call for node name/type, IPC emit to BrowserWindow, and background thumbnail fetch.

- [ ] **Step 1: Add BrowserWindow sender and REST client integration**

Add imports and module-level state for the debounce timer, BrowserWindow reference, and REST client:

```typescript
import type { BrowserWindow } from "electron"
import type { FigmaRestClient } from "./figma-rest-client.js"

let _win: BrowserWindow | null = null
let _client: FigmaRestClient | null = null
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 500
const THUMBNAIL_TIMEOUT_MS = 3000

export function initSelectionBridge(win: BrowserWindow, client: FigmaRestClient) {
  _win = win
  _client = client
}
```

- [ ] **Step 2: Add debounced emit function**

Add a function that debounces selection changes, fetches node metadata, and sends IPC:

```typescript
function emitSelection(selection: FigmaSelection) {
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(async () => {
    if (!_win || _win.isDestroyed()) return

    let nodeName: string | null = null
    let nodeType: string | null = null

    if (_client && selection.fileKey && selection.nodeId) {
      try {
        const res = await _client.getFileNodes(selection.fileKey, [selection.nodeId])
        const node = res.nodes[selection.nodeId]?.document
        if (node) {
          nodeName = node.name
          nodeType = node.type
        }
      } catch {
        // Fallback: send without name/type
      }
    }

    const payload = {
      fileKey: selection.fileKey,
      nodeId: selection.nodeId,
      nodeName,
      nodeType,
      fileName: selection.fileName,
      url: selection.url,
    }
    _win.webContents.send("figma:selection-updated", payload)

    // Background thumbnail fetch
    if (_client && selection.fileKey && selection.nodeId) {
      const nodeId = selection.nodeId
      fetchThumbnail(selection.fileKey, nodeId)
    }
  }, DEBOUNCE_MS)
}

async function fetchThumbnail(fileKey: string, nodeId: string) {
  if (!_client || !_win || _win.isDestroyed()) return
  try {
    const res = await _client.getImage(fileKey, nodeId, { scale: 0.5, format: "png" })
    const imageUrl = res.images[nodeId]
    if (!imageUrl || !_win || _win.isDestroyed()) return

    // Fetch the actual image with a timeout and convert to base64
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS) })
    const buffer = await imgRes.arrayBuffer()
    const base64 = `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`
    _win.webContents.send("figma:selection-thumbnail", { nodeId, thumbnail: base64 })
  } catch {
    // Thumbnail is best-effort, skip on failure
  }
}
```

- [ ] **Step 3: Wire emitSelection into updateSelection**

Modify the existing `updateSelection` function to call `emitSelection` after updating state:

```typescript
export function updateSelection(partial: Partial<FigmaSelection>): void {
  _selection = { ..._selection, ...partial }
  for (const cb of _listeners) cb(getSelection())
  emitSelection(_selection)
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/desktop-electron/src/main/figma-selection.ts
git commit -m "feat(desktop-electron): add debounced node metadata fetch and IPC emit to figma selection"
```

---

### Task 2: Wire Selection Bridge in Electron Main Process

**Files:**
- Modify: `packages/desktop-electron/src/main/index.ts`

- [ ] **Step 1: Import and call initSelectionBridge**

Add imports at the top of the file:

```typescript
import { initSelectionBridge, parseSelectionFromUrl, updateSelection } from "./figma-selection"
import { FigmaRestClient } from "./figma-rest-client"
import { getAccessToken } from "./figma-oauth"
```

`initSelectionBridge` must be called after `mainWindow` is assigned. There are two code paths that set `mainWindow` (lines ~224 and ~238). Call `initSelectionBridge` inside `wireMenu()` since it runs after both paths and has access to `mainWindow`:

```typescript
function wireMenu() {
  if (!mainWindow) return
  const figmaClient = new FigmaRestClient({ getToken: () => getAccessToken().catch(() => null) })
  initSelectionBridge(mainWindow, figmaClient)
  createMenu({ ... })
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/desktop-electron/src/main/index.ts
git commit -m "feat(desktop-electron): wire figma selection bridge with REST client in main process"
```

---

### Task 3: Add Preload IPC Listeners

**Files:**
- Modify: `packages/desktop-electron/src/preload/types.ts`
- Modify: `packages/desktop-electron/src/preload/index.ts`

- [ ] **Step 1: Add FigmaSelectionData type and extend ElectronAPI**

In `packages/desktop-electron/src/preload/types.ts`, add the selection data type and new methods:

```typescript
export type FigmaSelectionData = {
  fileKey: string | null
  nodeId: string | null
  nodeName: string | null
  nodeType: string | null
  fileName: string | null
  url: string | null
}
```

Add to `ElectronAPI` type (after `figmaStartAuth`):

```typescript
onFigmaSelection: (cb: (selection: FigmaSelectionData) => void) => () => void
onFigmaThumbnail: (cb: (data: { nodeId: string; thumbnail: string }) => void) => () => void
```

- [ ] **Step 2: Add IPC listeners in preload**

In `packages/desktop-electron/src/preload/index.ts`, add the listeners following the existing `onMenuCommand` / `onDeepLink` pattern. Add these after `figmaStartAuth`:

```typescript
onFigmaSelection: (cb) => {
  const handler = (_: unknown, selection: FigmaSelectionData) => cb(selection)
  ipcRenderer.on("figma:selection-updated", handler)
  return () => ipcRenderer.removeListener("figma:selection-updated", handler)
},
onFigmaThumbnail: (cb) => {
  const handler = (_: unknown, data: { nodeId: string; thumbnail: string }) => cb(data)
  ipcRenderer.on("figma:selection-thumbnail", handler)
  return () => ipcRenderer.removeListener("figma:selection-thumbnail", handler)
},
```

Add the import for the type:
```typescript
import type { ..., FigmaSelectionData } from "./types"
```

- [ ] **Step 3: Commit**

```bash
git add packages/desktop-electron/src/preload/types.ts packages/desktop-electron/src/preload/index.ts
git commit -m "feat(desktop-electron): add figma selection and thumbnail IPC listeners in preload"
```

---

### Task 4: Extend Prompt Context System with FigmaContextItem

**Files:**
- Modify: `packages/app/src/context/prompt.tsx`

- [ ] **Step 1: Add FigmaContextItem type and extend union**

After the `FileContextItem` type definition (line 49), add:

```typescript
export type FigmaContextItem = {
  type: "figma"
  fileKey: string
  nodeId: string | null
  nodeName: string | null
  nodeType: string | null
  fileName: string | null
  url: string | null
  thumbnail?: string
}
```

Change the `ContextItem` type (line 51) from:
```typescript
export type ContextItem = FileContextItem
```
to:
```typescript
export type ContextItem = FileContextItem | FigmaContextItem
```

- [ ] **Step 2: Update contextItemKey function**

Update `contextItemKey` (line 103) to handle figma items:

```typescript
function contextItemKey(item: ContextItem) {
  if (item.type === "figma") {
    return item.nodeId ? `figma:${item.fileKey}:${item.nodeId}` : `figma:${item.fileKey}`
  }
  const start = item.selection?.startLine
  const end = item.selection?.endLine
  const key = `${item.type}:${item.path}:${start}:${end}`

  if (item.commentID) {
    return `${key}:c=${item.commentID}`
  }

  const comment = item.comment?.trim()
  if (!comment) return key
  const digest = checksum(comment) ?? comment
  return `${key}:c=${digest.slice(0, 8)}`
}
```

- [ ] **Step 3: Update isCommentItem type guard**

The `isCommentItem` function (line 119) accesses `item.comment` which only exists on `FileContextItem`. Add a type check:

```typescript
function isCommentItem(item: ContextItem | (ContextItem & { key: string })) {
  return item.type === "file" && !!item.comment?.trim()
}
```

This already checks `item.type === "file"`, so it's safe. No change needed — verify it still compiles.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/context/prompt.tsx
git commit -m "feat(app): add FigmaContextItem type to prompt context system"
```

---

### Task 5: Update Context Chip UI for Figma Items

**Files:**
- Modify: `packages/app/src/components/prompt-input/context-items.tsx`

- [ ] **Step 1: Add Switch/Match structure**

Replace the `<For>` body with a `<Switch>`/`<Match>` to handle both item types. Update imports:

```typescript
import { Component, For, Match, Show, Switch } from "solid-js"
```

Replace the `<For>` body (lines 23-83) with:

```tsx
<For each={props.items}>
  {(item) => (
    <Switch>
      <Match when={item.type === "file" && item} keyed>
        {(fileItem) => {
          const directory = getDirectory(fileItem.path)
          const filename = getFilename(fileItem.path)
          const label = getFilenameTruncated(fileItem.path, 14)
          const selected = props.active(fileItem)

          return (
            <Tooltip
              value={
                <span class="flex max-w-[300px]">
                  <span class="text-text-invert-base truncate-start [unicode-bidi:plaintext] min-w-0">
                    {directory}
                  </span>
                  <span class="shrink-0">{filename}</span>
                </span>
              }
              placement="top"
              openDelay={2000}
            >
              <div
                classList={{
                  "group shrink-0 flex flex-col rounded-[6px] pl-2 pr-1 py-1 max-w-[200px] h-12 cursor-default transition-all transition-transform shadow-xs-border hover:shadow-xs-border-hover": true,
                  "hover:bg-surface-interactive-weak": !!fileItem.commentID && !selected,
                  "bg-surface-interactive-hover hover:bg-surface-interactive-hover shadow-xs-border-hover": selected,
                  "bg-background-stronger": !selected,
                }}
                onClick={() => props.openComment(fileItem)}
              >
                <div class="flex items-center gap-1.5">
                  <FileIcon node={{ path: fileItem.path, type: "file" }} class="shrink-0 size-3.5" />
                  <div class="flex items-center text-11-regular min-w-0 font-medium">
                    <span class="text-text-strong whitespace-nowrap">{label}</span>
                    <Show when={fileItem.selection}>
                      {(sel) => (
                        <span class="text-text-weak whitespace-nowrap shrink-0">
                          {sel().startLine === sel().endLine
                            ? `:${sel().startLine}`
                            : `:${sel().startLine}-${sel().endLine}`}
                        </span>
                      )}
                    </Show>
                  </div>
                  <IconButton
                    type="button"
                    icon="close-small"
                    variant="ghost"
                    class="ml-auto size-3.5 text-text-weak hover:text-text-strong transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.remove(fileItem)
                    }}
                    aria-label={props.t("prompt.context.removeFile")}
                  />
                </div>
                <Show when={fileItem.comment}>
                  {(comment) => <div class="text-12-regular text-text-strong ml-5 pr-1 truncate">{comment()}</div>}
                </Show>
              </div>
            </Tooltip>
          )
        }}
      </Match>
      <Match when={item.type === "figma" && item} keyed>
        {(figmaItem) => {
          const label = () => figmaItem.nodeName
            ? figmaItem.nodeName.length > 14
              ? figmaItem.nodeName.slice(0, 14) + "…"
              : figmaItem.nodeName
            : figmaItem.nodeId ?? "Figma"
          const subtitle = () => figmaItem.nodeType?.toLowerCase() ?? ""

          return (
            <Tooltip
              value={
                <span class="flex flex-col max-w-[300px]">
                  <span class="text-text-invert-base">{figmaItem.nodeName ?? figmaItem.nodeId}</span>
                  <Show when={figmaItem.nodeType}>
                    <span class="text-text-invert-weak text-11-regular">{figmaItem.nodeType}</span>
                  </Show>
                </span>
              }
              placement="top"
              openDelay={2000}
            >
              <div class="group shrink-0 flex flex-col rounded-[6px] pl-2 pr-1 py-1 max-w-[200px] h-12 cursor-default transition-all transition-transform shadow-xs-border hover:shadow-xs-border-hover bg-background-stronger">
                <div class="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="shrink-0">
                    <path d="M8 24c2.2 0 4-1.8 4-4v-4H8c-2.2 0-4 1.8-4 4s1.8 4 4 4z" fill="#0ACF83" />
                    <path d="M4 12c0-2.2 1.8-4 4-4h4v8H8c-2.2 0-4-1.8-4-4z" fill="#A259FF" />
                    <path d="M4 4c0-2.2 1.8-4 4-4h4v8H8C5.8 8 4 6.2 4 4z" fill="#F24E1E" />
                    <path d="M12 0h4c2.2 0 4 1.8 4 4s-1.8 4-4 4h-4V0z" fill="#FF7262" />
                    <path d="M20 12c0 2.2-1.8 4-4 4s-4-1.8-4-4 1.8-4 4-4 4 1.8 4 4z" fill="#1ABCFE" />
                  </svg>
                  <div class="flex items-center text-11-regular min-w-0 font-medium">
                    <span class="text-text-strong whitespace-nowrap">{label()}</span>
                    <Show when={subtitle()}>
                      <span class="text-text-weak whitespace-nowrap shrink-0 ml-1">{subtitle()}</span>
                    </Show>
                  </div>
                  <IconButton
                    type="button"
                    icon="close-small"
                    variant="ghost"
                    class="ml-auto size-3.5 text-text-weak hover:text-text-strong transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.remove(figmaItem)
                    }}
                    aria-label="Remove Figma selection"
                  />
                </div>
              </div>
            </Tooltip>
          )
        }}
      </Match>
    </Switch>
  )}
</For>
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd packages/app && bun run typecheck`

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/prompt-input/context-items.tsx
git commit -m "feat(app): add figma context chip rendering with Switch/Match"
```

---

### Task 6: Update Message Serialization for Figma Context

**Files:**
- Modify: `packages/app/src/components/prompt-input/build-request-parts.ts`

- [ ] **Step 1: Add type guard and figma serialization**

The `context` processing block (lines 124-157) assumes all items are file items. Update the `ContextFile` type and add figma handling.

First, update the `ContextFile` type to be a union (or rename to `ContextItemWithKey`):

```typescript
type ContextFile = {
  key: string
  type: "file"
  path: string
  selection?: FileSelection
  comment?: string
  commentID?: string
  commentOrigin?: "review" | "file"
  preview?: string
}

type ContextFigma = {
  key: string
  type: "figma"
  fileKey: string
  nodeId: string | null
  nodeName: string | null
  nodeType: string | null
  fileName: string | null
  url: string | null
  thumbnail?: string
}

type ContextEntry = ContextFile | ContextFigma
```

Update `BuildRequestPartsInput.context` type:
```typescript
context: ContextEntry[]
```

Replace the `context` flatMap block (lines 124-157) with:

```typescript
const context = input.context.flatMap((item) => {
  if (item.type === "figma") {
    const nodeName = item.nodeName ?? item.nodeId ?? "unknown"
    const nodeType = item.nodeType ? ` (${item.nodeType})` : ""
    const text = [
      `[Figma Selection]`,
      `Node: "${nodeName}"${nodeType}`,
      item.fileKey ? `File: ${item.fileKey}` : null,
      item.nodeId ? `Node ID: ${item.nodeId}` : null,
      item.url ? `URL: ${item.url}` : null,
    ].filter(Boolean).join("\n")

    const parts: PromptRequestPart[] = [{
      id: Identifier.ascending("part"),
      type: "text",
      text,
      synthetic: true,
    }]

    if (item.thumbnail) {
      parts.push({
        id: Identifier.ascending("part"),
        type: "file",
        mime: "image/png",
        url: item.thumbnail,
        filename: `figma-${item.nodeId ?? "selection"}.png`,
      } satisfies PromptRequestPart)
    }

    return parts
  }

  // Existing file handling
  const path = absolute(input.sessionDirectory, item.path)
  const url = `file://${encodeFilePath(path)}${fileQuery(item.selection)}`
  const comment = item.comment?.trim()
  if (!comment && used.has(url)) return []
  used.add(url)

  const filePart = {
    id: Identifier.ascending("part"),
    type: "file",
    mime: "text/plain",
    url,
    filename: getFilename(item.path),
  } satisfies PromptRequestPart

  if (!comment) return [filePart]

  return [
    {
      id: Identifier.ascending("part"),
      type: "text",
      text: formatCommentNote({ path: item.path, selection: item.selection, comment }),
      synthetic: true,
      metadata: createCommentMetadata({
        path: item.path,
        selection: item.selection,
        comment,
        preview: item.preview,
        origin: item.commentOrigin,
      }),
    } satisfies PromptRequestPart,
    filePart,
  ]
})
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd packages/app && bun run typecheck`

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/prompt-input/build-request-parts.ts
git commit -m "feat(app): serialize figma context items as text + thumbnail in request parts"
```

---

### Task 7: Wire IPC Listener to Prompt Context (Auto-attach + Dismiss)

**Files:**
- Modify: `packages/app/src/components/prompt-input.tsx`

- [ ] **Step 1: Identify the right location for the IPC wiring**

Read `packages/app/src/components/prompt-input.tsx` to find where `onMount`/`onCleanup` are used and where `usePrompt()` is called. The figma selection listener should be added in the same component that manages the prompt context.

Look for the existing pattern — likely an `onMount` or `createEffect` block. The listener should:
1. Check `platform.platform === "desktop"`
2. Access `window.api.onFigmaSelection`
3. Call `prompt.context.add()` / `prompt.context.remove()`

- [ ] **Step 2: Add the auto-attach logic**

Add the following logic inside the `PromptInput` component (or wherever `usePrompt()` is consumed):

```typescript
import { createSignal } from "solid-js"
import type { FigmaContextItem } from "@/context/prompt"

// Inside the component:
const [dismissedFigmaNode, setDismissedFigmaNode] = createSignal<string | null>(null)

onMount(() => {
  if (platform.platform !== "desktop") return
  const api = (window as unknown as { api?: {
    onFigmaSelection?: (cb: (sel: any) => void) => () => void
    onFigmaThumbnail?: (cb: (data: { nodeId: string; thumbnail: string }) => void) => () => void
  } }).api
  if (!api?.onFigmaSelection) return

  const unsub1 = api.onFigmaSelection((sel) => {
    // Remove any existing figma context items
    const existing = prompt.context.items().filter((i) => i.type === "figma")
    for (const item of existing) prompt.context.remove(item.key)

    // Check dismiss state
    const nodeKey = sel.nodeId ?? sel.fileKey
    if (nodeKey && nodeKey === dismissedFigmaNode()) return
    setDismissedFigmaNode(null)

    if (!sel.fileKey) return

    prompt.context.add({
      type: "figma",
      fileKey: sel.fileKey,
      nodeId: sel.nodeId,
      nodeName: sel.nodeName,
      nodeType: sel.nodeType,
      fileName: sel.fileName,
      url: sel.url,
    } satisfies FigmaContextItem)
  })

  const unsub2 = api.onFigmaThumbnail?.((data) => {
    // Find the current figma item and verify nodeId matches
    const items = prompt.context.items()
    const figmaItem = items.find((i) => i.type === "figma" && i.nodeId === data.nodeId)
    if (!figmaItem) return

    // Remove and re-add with thumbnail
    prompt.context.remove(figmaItem.key)
    prompt.context.add({
      ...(figmaItem as FigmaContextItem),
      thumbnail: data.thumbnail,
    })
  })

  onCleanup(() => {
    unsub1()
    unsub2?.()
  })
})
```

- [ ] **Step 3: Fix type narrowing in existing prompt-input.tsx code**

With `ContextItem` now a union, several existing lines in `prompt-input.tsx` access `FileContextItem`-specific fields without narrowing. Fix these:

1. **commentCount memo** (accesses `.comment`): Add type guard:
   ```typescript
   prompt.context.items().filter((item) => item.type === "file" && !!item.comment?.trim()).length
   ```

2. **active callback** (accesses `.commentID`, `.path`): Add type guard:
   ```typescript
   const active = (item: PromptContextItem) => {
     if (item.type !== "file") return false
     return /* existing .commentID and .path checks */
   }
   ```

3. **openComment callback** (accesses `.path`, `.commentID`): Add type guard:
   ```typescript
   const openComment = (item: PromptContextItem) => {
     if (item.type !== "file") return
     // existing logic
   }
   ```

4. **Any other lines accessing `.path`, `.comment`, `.selection`, `.commentID`, `.commentOrigin`, `.preview`** on a `ContextItem` — add `item.type === "file"` guard.

- [ ] **Step 4: Wire dismiss callback to track dismissed node**


In the existing `remove` handler for context items (where `props.remove(item)` is called from the context chip), add tracking. This is already handled — when the user clicks dismiss on a figma chip, `prompt.context.remove(item.key)` fires. We need to intercept the removal for figma items to set the dismiss flag.

Wrap the remove callback where it's passed to `<PromptContextItems>`:

```typescript
const handleRemove = (item: PromptContextItem) => {
  if (item.type === "figma") {
    setDismissedFigmaNode(item.nodeId ?? item.fileKey)
  }
  prompt.context.remove(item.key)
}
```

Pass `handleRemove` instead of `prompt.context.remove` to the `<PromptContextItems>` component.

- [ ] **Step 5: Verify typecheck passes**

Run: `cd packages/app && bun run typecheck`

- [ ] **Step 6: Test manually**

1. Run `bun run --cwd packages/desktop-electron dev`
2. Open a Figma file in the embedded webview
3. Click on a frame — after ~500ms, a Figma chip should appear in the prompt area
4. The chip should show the node name (e.g., "Header Frame") with "frame" subtitle
5. Click the X on the chip — it should disappear
6. Click the same frame again — chip should NOT reappear (dismissed)
7. Click a different frame — chip should appear (new node clears dismiss)
8. Type a prompt and submit — the agent should receive the Figma reference text

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/components/prompt-input.tsx
git commit -m "feat(app): wire figma selection IPC to prompt context with auto-attach and dismiss"
```

---

### Task 8: Typecheck and Integration Verification

**Files:**
- All modified files

- [ ] **Step 1: Run full typecheck**

```bash
cd packages/app && bun run typecheck
cd packages/desktop-electron && bun run typecheck 2>/dev/null || echo "check manually"
```

Fix any type errors.

- [ ] **Step 2: Run existing tests**

```bash
cd packages/app && bun run test:unit
```

Ensure no regressions in existing prompt context or build-request-parts tests.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: resolve type errors in figma selection context integration"
```
