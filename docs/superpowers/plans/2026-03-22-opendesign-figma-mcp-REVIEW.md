# Plan Review: OpenDesign Figma MCP Implementation

**Reviewer:** Code Review Agent
**Date:** 2026-03-23
**Verdict:** ISSUES FOUND

---

## What Was Done Well

- The two-process architecture (WebSocket server in Electron main, MCP as stdio child connecting as WS client) is sound and aligns with how opencode discovers MCP servers via config.
- Tool inventory (~40 tools across 7 categories) matches the spec exactly.
- The port range (9333-9342) correctly avoids figma-console collision (9223-9232).
- Task ordering respects build dependencies: scaffold -> plugin -> WS server -> connector -> REST client -> MCP tools -> entry point -> Electron wiring -> OAuth -> cleanup -> E2E.
- Cleanup task (Task 10) is thorough and correctly identifies all files to remove/modify.

---

## Issues

### CRITICAL

**C1: `FigmaConnector` type mismatch between WS server and WS client**

Task 4 creates `FigmaConnector` accepting `FigmaWSServer`, but Task 7 passes a `WSClient` with `as any`. The plan acknowledges this ("Extract an interface `CommandSender`") but buries it in a comment at the end of Task 7. This interface extraction MUST happen in Task 4 when creating the connector, not retroactively. Otherwise Task 4's code compiles against `FigmaWSServer` and Task 7 must refactor it.

**Fix:** In Task 4, define `FigmaConnector` against an interface:
```typescript
export interface CommandSender {
  sendCommand(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>
}
export class FigmaConnector {
  constructor(private sender: CommandSender) {}
}
```
Then both `FigmaWSServer` and `WSClient` implement this interface.

---

**C2: WebSocket server export path won't resolve from Electron**

Task 8, Step 1 imports:
```typescript
import { FigmaWSServer } from "@opencode-ai/opendesign-figma-mcp/websocket-server"
```
But `package.json` (Task 1) only defines `"main": "dist/index.js"` with no `exports` map. This import will fail at runtime in the Electron main process.

**Fix:** Add an `exports` field to `packages/opendesign-figma-mcp/package.json`:
```json
"exports": {
  ".": "./dist/index.js",
  "./websocket-server": "./dist/websocket-server.js"
}
```
And ensure the build step outputs `websocket-server.js` separately (the current `bun build src/index.ts --outdir dist` only bundles the entry point). Change to a multi-entry build or use separate build commands.

---

**C3: `writeMcpConfig()` is called BEFORE `mainWindow` exists and before `startFigmaWS()`**

In `main/index.ts` line 245, `writeMcpConfig()` is called at the end of `initialize()`, but `startFigmaWS(mainWindow)` is supposed to happen in `wireMenu()` (line 240/255). The problem: `writeMcpConfig()` at line 245 runs BEFORE `wireMenu()` when `loadingWindow` is shown (the path at line 252-255 creates mainWindow AFTER line 245). Even in the fast path (line 239-240), `wireMenu()` and `writeMcpConfig()` are sequential but the plan says `writeMcpConfig(figmaPort)` should receive the port from `startFigmaWS()`.

**Fix:** Move `writeMcpConfig(port)` to be called inside `wireMenu()` after `startFigmaWS()`, or restructure the `initialize()` flow to ensure the WS server is started before config is written. The current plan's Task 8 Step 2 code shows `writeMcpConfig(figmaPort)` in wireMenu, but doesn't mention removing the existing `writeMcpConfig()` call at line 245 of initialize(). It does mention it in Task 10 Step 6 ("Old `writeMcpConfig()` function (replaced in Task 8)"), but this split creates a window where both old and new functions exist simultaneously between Task 8 and Task 10.

---

### IMPORTANT

**I1: OAuth token staleness in MCP config**

The plan writes `FIGMA_OAUTH_TOKEN` to `~/.config/opencode/opencode.json` at startup and on refresh. But the MCP child process reads `process.env.FIGMA_OAUTH_TOKEN` which is set from the config at spawn time. If the token refreshes AFTER the MCP process is already running, the child process still has the stale env var. The `updateMcpToken()` function updates the config file, but the already-running child process won't see it.

**Fix:** Either:
(a) Have the MCP process re-read the token from the config file on each REST API call instead of using a static env var, OR
(b) Add a WebSocket command (`UPDATE_TOKEN`) from Electron main to the MCP child process, OR
(c) Accept that the MCP process may need to be restarted on token refresh (document this limitation).

Option (a) is simplest and most robust.

---

**I2: `figma-tab-content.tsx` cleanup is incomplete**

Task 10 Step 8 says to "Remove `notifyApi` reference" and "revert to single `handleNav`", but the actual file (lines 102-111, 133-139) also has `notifySelection()` as a function and `handleInPageNav` as a separate handler. The plan should explicitly state that:
- Line 102: `const notifyApi = ...` is removed entirely
- Lines 109-111: `notifySelection` function is removed
- Lines 133-139: `handleInPageNav` is removed, and `did-navigate-in-page` listener at line 145 should use `handleNav` instead

The plan says all this in prose but lacks precision about which event listener to change.

---

**I3: `figmaAuthStatus` return type change is breaking**

Task 8 Step 3 changes `figmaAuthStatus` from returning `boolean` to `{ authenticated: boolean, pluginConnected: boolean }`. This breaks:
- `preload/index.ts` line 64: `figmaAuthStatus: () => ipcRenderer.invoke("figma-auth-status")`
- `preload/types.ts` line 74: `figmaAuthStatus: () => Promise<boolean>`
- Any renderer code that checks `if (await api.figmaAuthStatus())` directly

**Fix:** Add this to Task 8 or Task 10:
- Update `preload/types.ts` to change the return type
- Update all renderer consumers (likely `titlebar.tsx`) to read `.authenticated` instead of treating the result as a boolean

---

**I4: Missing `before-quit` handler for `stopFigmaWS()`**

Task 8 Step 4 adds `stopFigmaWS()` to `before-quit`, but the existing code at line 119-121 already has a `before-quit` handler that only calls `killSidecar()`. The plan should explicitly state this is a MODIFICATION of the existing handler, not a new one. Adding a second `before-quit` listener works but is fragile.

**Fix:** The plan should say: "Modify the existing `before-quit` handler at line 119 to also call `stopFigmaWS()`."

---

### SUGGESTIONS

**S1: Missing `bun install` after workspace addition**

Task 1 Step 5 runs `bun install`, but after Task 8 when `desktop-electron` imports from `@opencode-ai/opendesign-figma-mcp`, there should be another `bun install` to ensure the workspace link is resolved. This is implicit but should be explicit.

---

**S2: No error handling for WS server start failure in Electron**

Task 8 calls `await startFigmaWS(mainWindow)` but doesn't handle the case where all 10 ports (9333-9342) are occupied. This would throw and crash the Electron app. The call should be wrapped in try/catch with a fallback (log warning, skip MCP config write).

---

**S3: Plugin `manifest.json` ID should be a numeric Figma plugin ID**

Task 2 Step 2 sets `id` to `"opendesign-figma-bridge"` (a string). Figma plugin manifest IDs are typically numeric strings for published plugins or can be omitted for dev plugins. Using a non-numeric string may cause issues when importing via Figma Desktop. Consider omitting the `id` field for development and only setting it after community publishing.

---

**S4: The plan does not mention adding `@opencode-ai/opendesign-figma-mcp` to the root `package.json` workspaces array**

If the monorepo uses explicit workspace paths in the root `package.json`, the new package directory needs to be listed there. The plan assumes automatic detection.

---

## Completeness Check: Spec Requirements vs Plan Tasks

| Spec Requirement | Plan Coverage | Status |
|---|---|---|
| ~40 tools across 7 categories | Task 6 | Covered |
| WebSocket server in Electron main | Task 3 + Task 8 | Covered |
| MCP as stdio child process | Task 7 | Covered |
| Plugin fork from figma-desktop-bridge | Task 2 | Covered |
| Port range 9333-9342 | Task 2 + Task 3 | Covered |
| OAuth token passing via env var | Task 8 | Covered (with I1 caveat) |
| Config written to ~/.config/opencode/opencode.json | Task 8 | Covered |
| Selection via plugin WebSocket (not REST) | Task 3 + Task 8 | Covered |
| Remove figma-bridge preload | Task 10 | Covered |
| Remove old figma-mcp-server.ts | Task 10 | Covered |
| Add file_comments:write OAuth scope | Task 9 | Covered |
| Simplify figma-selection.ts | Task 10 | Covered |
| Simplify figma-tab-content.tsx | Task 10 | Covered |
| Bootloader pattern (plugin UI loads from WS server) | Not explicitly in any task | MISSING |
| Single instance constraint | Port fallback covers this | Covered |

**Missing from plan:** The spec mentions "Bootloader pattern - Plugin UI loads dynamically from WebSocket server (from figma-console)" in the Constraints table. This means the plugin's `ui.html` may need to fetch its UI code from the WebSocket server at runtime rather than being statically bundled. The plan's Task 2 forks the plugin files statically. If the bootloader pattern is required, Task 3 needs to serve the plugin UI HTML from the WebSocket server endpoint, and `ui.html` needs to be a minimal loader. This may or may not be needed depending on whether this constraint was informational only.

---

## Summary

3 critical issues that will cause build/runtime failures if not addressed before implementation:
1. Interface extraction for `CommandSender` must happen in Task 4, not Task 7
2. Package exports map needed for Electron to import `websocket-server`
3. `writeMcpConfig()` call ordering vs `startFigmaWS()` lifecycle

3 important issues that will cause bugs or breaking changes:
1. OAuth token staleness in already-running MCP process
2. Incomplete figma-tab-content cleanup instructions
3. `figmaAuthStatus` return type change breaks preload types and renderer
