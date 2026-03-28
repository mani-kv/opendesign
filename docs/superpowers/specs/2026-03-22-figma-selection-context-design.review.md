# Spec Review: Figma Selection Context in Prompt

**Spec:** `docs/superpowers/specs/2026-03-22-figma-selection-context-design.md`
**Verdict:** ISSUES FOUND

---

## What the spec does well

- Clean layered architecture (Electron main -> preload -> app context -> UI -> serialization)
- Debounce and thumbnail timeout constraints are sensible
- Singleton selection and per-node dismiss logic are well thought out
- "Desktop only" guard and "no pre-fetch" boundary are correct scope decisions
- File list is accurate and complete

---

## Findings

### CRITICAL-1: `context-items.tsx` assumes all items are `FileContextItem`

**Severity:** Critical

The current `PromptContextItems` component unconditionally accesses `item.path`, `item.selection`, `item.commentID`, and calls `getDirectory(item.path)` / `getFilename(item.path)` on every item (line 24-26 of `context-items.tsx`). Adding a `FigmaContextItem` with no `path` property will cause runtime errors.

The spec mentions adding a rendering case for `type === "figma"` but does not address that the entire `<For>` body currently treats every item as a file. This is not just adding a branch -- the component needs to be restructured with a `<Switch>`/`<Match>` pattern.

**Fix:** The spec should explicitly call out that the `<For>` body in `context-items.tsx` must be wrapped in a `<Switch>` with `<Match when={item.type === "file"}>` and `<Match when={item.type === "figma"}>` branches. The existing file rendering code moves into the file branch entirely.

---

### CRITICAL-2: `buildRequestParts` will crash on Figma context items

**Severity:** Critical

In `build-request-parts.ts` (lines 124-157), the `context` array is typed as `ContextFile[]` and every item is assumed to have `.path`. The code calls `absolute(directory, item.path)`, `encodeFilePath(path)`, and `getFilename(item.path)`. A `FigmaContextItem` has no `path` and will produce `undefined` strings and broken `file://` URLs.

The spec describes serialization in Layer 6 as a text block format but does not specify where this serialization happens in code. It needs to be in `buildRequestParts` with a type guard.

**Fix:** The spec should add explicit implementation detail for Layer 6: in `buildRequestParts`, add a type guard (`if (item.type === "figma")`) that produces a `TextPartInput` with the formatted Figma reference block, and optionally a `FilePartInput` for the thumbnail image. The `ContextFile` type alias in that file must be changed to a union. Also update `submit.ts` line 281 where comment items are filtered -- that filter already checks `item.type === "file"`, so it is safe, but the spec should acknowledge this.

---

### MODERATE-1: Dismiss state not persisted -- lost on navigation

**Severity:** Moderate

The spec says "set a flag `figmaSelectionDismissed = true` keyed to the current `nodeId`" but does not specify where this state lives. The prompt context store is persisted via `Persist.scoped()` (see `prompt.tsx` line 162-163). If the dismiss flag is stored in a local variable or signal outside the store, it will be lost when switching sessions or navigating. If inside the store, it would be persisted across app restarts, which is also wrong.

**Fix:** Store the dismissed nodeId in a non-persisted SolidJS signal scoped to the session page component lifetime. When the component unmounts (session navigation), the dismiss state resets. Add this detail to the spec.

---

### MODERATE-2: No "clear selection" event when user deselects everything

**Severity:** Moderate

The figma-bridge only fires on URL changes (`hashchange`, `pushState`, `replaceState`). Figma does not change the URL when the user clicks on empty canvas (deselects all nodes) -- the `node-id` param remains in the URL. This means the context chip will persist even after the user has deselected everything in Figma. There is no "selection cleared" event in the spec.

**Fix:** Add a note that selection is URL-derived, not a true Figma plugin selection event. The chip represents "last navigated node" not "current canvas selection." Either: (a) rename the chip to reflect this (e.g., "Figma context" rather than "Figma selection"), or (b) acknowledge this is a known limitation. If true selection tracking is desired later, it would require the Figma Console MCP plugin's `figma_get_selection` tool or a Figma plugin bridge.

---

### MODERATE-3: Thumbnail fetch uses two-step IPC but no cancellation

**Severity:** Moderate

The spec describes two IPC events: `figma:selection-updated` (immediate) and `figma:selection-thumbnail` (up to 3s later). If the user selects Node A, then quickly selects Node B after 1s, the debounce resets and Node B is processed. However, the thumbnail request for Node A (if it was already in-flight before the debounce timer reset) could resolve and send a thumbnail for the wrong node.

The spec says "Only the latest selection is processed" for the debounced path, but the thumbnail fetch is described as a fire-and-forget background request. If Node A's thumbnail request was initiated before the debounce caught Node B, Node A's thumbnail could arrive after Node B's selection event.

**Fix:** The thumbnail IPC event already includes `nodeId`, so the renderer can check if the incoming thumbnail matches the current figma context item's nodeId. Add this guard to the spec in Layer 5: "On thumbnail event, verify `data.nodeId` matches the current figma context item's `nodeId` before updating."

---

### MINOR-1: `contextItemKey` fallback for non-file items

**Severity:** Minor

The current `contextItemKey` function (line 103-117 of `prompt.tsx`) has a fallback: `if (item.type !== "file") return item.type`. This means ALL non-file items would share the key `"figma"`, which is fine for singleton behavior but fragile. If multi-selection is ever added, it breaks silently.

**Fix:** The spec already proposes `figma:${fileKey}:${nodeId}` as the key. Good. Just ensure the implementation handles the case where `nodeId` could be `null` (file-level selection with no node), producing a key like `figma:ABC123:null`. Consider using `figma:${fileKey}` when nodeId is null.

---

### MINOR-2: Missing type export location

**Severity:** Minor

The spec defines `FigmaContextItem` in Layer 3 but does not mention where the type is exported from. The `ContextItem` union is in `prompt.tsx`, but `FigmaSelectionData` (used in the preload bridge signature) is a separate type. The spec should clarify: define `FigmaSelectionData` in `preload/types.ts` (the IPC payload shape) and `FigmaContextItem` in `prompt.tsx` (the UI context shape). These are related but distinct types.

**Fix:** Add a note: "`FigmaSelectionData` in `preload/types.ts` is the IPC wire format. `FigmaContextItem` in `prompt.tsx` is the UI context type. The wiring code in Layer 5 maps between them."

---

### MINOR-3: No i18n keys specified

**Severity:** Minor

The spec mentions the chip showing `nodeName` and `nodeType` but does not specify i18n keys for the aria-label on the dismiss button (currently `prompt.context.removeFile` in the existing code), or any tooltip/accessible labels for the Figma chip. The existing pattern uses `props.t("prompt.context.removeFile")` which would be wrong for Figma items.

**Fix:** Add required i18n keys: `prompt.context.removeFigma` for the dismiss button, and optionally `prompt.context.figmaSelection` for a tooltip.

---

## Summary

| #   | Severity | Finding                                                                      |
| --- | -------- | ---------------------------------------------------------------------------- |
| C-1 | Critical | `context-items.tsx` assumes all items are files; will crash on Figma items   |
| C-2 | Critical | `buildRequestParts` will crash; Layer 6 serialization location unspecified   |
| M-1 | Moderate | Dismiss flag storage location unspecified; persistence behavior unclear      |
| M-2 | Moderate | No "deselect" event; chip reflects URL navigation, not true canvas selection |
| M-3 | Moderate | Thumbnail race condition when rapidly changing selections                    |
| m-1 | Minor    | contextItemKey null-nodeId edge case                                         |
| m-2 | Minor    | Missing type export location clarity                                         |
| m-3 | Minor    | Missing i18n keys for Figma chip                                             |

**Recommendation:** Fix C-1 and C-2 before implementation begins -- they represent code that will fail at runtime. M-1 through M-3 should be addressed in the spec to avoid implementation ambiguity. Minor items can be resolved during implementation.
