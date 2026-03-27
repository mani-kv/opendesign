# OpenDesign Figma MCP — Plugin + Server

**Date:** 2026-03-22
**Status:** Draft
**Scope:** Spec 1 of 2 — Plugin + MCP server. Spec 2 (Connect UX) follows separately.

## Problem

OpenDesign agents need to read and write Figma designs. The current approach uses the Figma REST API for selection tracking, which is severely rate-limited (as low as 6 requests/month on free plans) and cannot create or modify designs. The `figma-console` MCP dependency requires users to generate a personal access token (friction) and runs as a standalone process (coordination overhead).

## Goal

Build a self-contained Figma MCP server embedded in the Electron main process, backed by a Figma plugin that communicates via WebSocket. Agents get ~40 tools for reading selections, discovering components, creating designs, and managing tokens — all through the Figma Plugin API (no rate limits). Cross-file library search uses the existing OAuth token (no PAT required).

## Architecture

### Package Structure

```
packages/opendesign-figma-mcp/
  figma-plugin/                # Figma plugin (forked from figma-desktop-bridge/)
    manifest.json              # Plugin manifest (id, permissions, editor types)
    code.js                    # Plugin worker — Figma API calls, runs in QuickJS sandbox
    ui.html                    # Plugin UI — WebSocket client, postMessage bridge to worker
  src/
    server.ts                  # MCP server setup, tool registration, Electron integration
    websocket.ts               # WebSocket server (plugin ↔ MCP bridge)
    tools/
      selection.ts             # Selection & structure tools (~6)
      components.ts            # Component & design system tools (~8)
      variables.ts             # Token & variable tools (~8)
      creation.ts              # Design creation & mutation tools (~12)
      comments.ts              # Comment tools (~3)
      parity.ts                # Design-code parity tools (~2)
      execute.ts               # Escape hatch — run arbitrary plugin code (~1)
  package.json
```

### Communication Flow

```
Figma Desktop App
  └─ Plugin (code.js + ui.html)
       │
       │ WebSocket (port 9333, fallback 9334-9342)
       │
Electron Main Process (packages/desktop-electron)
  ├─ WebSocket Server (from opendesign-figma-mcp, started in main process)
  │    ├─ Accepts plugin connections, tracks by file key
  │    ├─ Forwards selection events via IPC (figma:selection-updated)
  │    └─ Bridges tool requests from MCP child process ↔ plugin
  │
  ├─ MCP Child Process (spawned by opencode server via config)
  │    ├─ opendesign-figma-mcp --stdio
  │    ├─ Registers ~40 tools, stdio transport
  │    ├─ Connects to WebSocket server (localhost:9333) for Plugin API tools
  │    └─ OAuth token passed via FIGMA_OAUTH_TOKEN env var
  │
  └─ Renderer (packages/app)
       └─ Prompt chip shows selection name/type instantly
```

**Two-process split:** The WebSocket server runs in the Electron main process (needs to forward selection events via IPC to the renderer). The MCP server runs as a stdio child process spawned by the opencode server (this is how opencode discovers and communicates with MCP servers). The MCP process connects to the WebSocket server as a client to relay tool requests to the plugin.

### Plugin ↔ Server Protocol

The plugin's `ui.html` establishes a WebSocket connection to the local MCP server. Communication is JSON messages:

```
Server → Plugin:  { id: string, type: "request", method: string, params: any }
Plugin → Server:  { id: string, type: "response", result: any }
Plugin → Server:  { type: "event", event: "selectionchange", data: { nodeId, nodeName, nodeType, ... } }
Plugin → Server:  { type: "event", event: "documentchange", data: { ... } }
```

The plugin worker (`code.js`) has direct access to the Figma Plugin API (`figma.currentPage.selection`, `figma.createFrame()`, etc.). The UI layer bridges WebSocket messages to the worker via `postMessage`.

### Port Range

Default: **9333**, fallback through **9334-9342**. Chosen to avoid collision with figma-console (9223-9232). Configurable via environment variable `OPENDESIGN_FIGMA_PORT`.

### Authentication

- **Plugin API calls** (selection, creation, variables in current file): No token needed
- **REST API calls** (cross-file library search): OAuth token from `figma-oauth.ts`
- **No PAT required**: OAuth flow already exists in the app (titlebar "Connect Figma" button)

## Tool Inventory (~40 tools)

### Selection & Structure (6 tools)

| Tool | Source | Description |
|---|---|---|
| `figma_get_selection` | Plugin API | Selected node(s) with name, type, full properties |
| `figma_get_file_data` | Plugin API | Page/file tree structure |
| `figma_get_status` | Plugin API | Connection status, active file, current page |
| `figma_list_open_files` | Plugin API | All files with active plugin connections |
| `figma_navigate` | Plugin API | Zoom to / select a specific node |
| `figma_take_screenshot` | Plugin API | Capture viewport or specific node as PNG |

### Components & Design System (8 tools)

| Tool | Source | Description |
|---|---|---|
| `figma_get_component` | Plugin API | Single component metadata |
| `figma_get_component_details` | Plugin API | Full properties, variants, allowed values |
| `figma_get_component_for_development` | Plugin API | Dev-ready spec + image |
| `figma_get_component_image` | Plugin API | Rendered PNG of a component |
| `figma_search_components` | Plugin API | Search by name in current file |
| `figma_get_library_components` | REST API + OAuth | Search published libraries (other files) |
| `figma_get_design_system_summary` | Plugin API | Overview of tokens, components, styles |
| `figma_get_design_system_kit` | Plugin API | Full design system dump in one call |

### Tokens & Variables (8 tools)

| Tool | Source | Description |
|---|---|---|
| `figma_get_variables` | Plugin API | All variable collections and values |
| `figma_get_token_values` | Plugin API | Resolved token values across modes |
| `figma_get_styles` | Plugin API | Color, text, effect styles |
| `figma_browse_tokens` | Plugin API | Browse token hierarchy |
| `figma_create_variable` | Plugin API | Create a single token |
| `figma_batch_create_variables` | Plugin API | Create up to 100 tokens in one call |
| `figma_update_variable` | Plugin API | Update a single token value |
| `figma_batch_update_variables` | Plugin API | Update up to 100 token values |

### Design Creation & Mutation (12 tools)

| Tool | Source | Description |
|---|---|---|
| `figma_create_child` | Plugin API | Create frame, text, rectangle, etc. inside a parent |
| `figma_clone_node` | Plugin API | Duplicate a node |
| `figma_instantiate_component` | Plugin API | Create instance from component key |
| `figma_set_instance_properties` | Plugin API | Set variant, text overrides, boolean props |
| `figma_set_fills` | Plugin API | Set fill colors |
| `figma_set_strokes` | Plugin API | Set strokes |
| `figma_set_text` | Plugin API | Set text content and style |
| `figma_set_image_fill` | Plugin API | Set image as fill |
| `figma_move_node` | Plugin API | Reposition a node |
| `figma_resize_node` | Plugin API | Change node size |
| `figma_rename_node` | Plugin API | Rename a node |
| `figma_delete_node` | Plugin API | Remove a node |

### Comments (3 tools)

| Tool | Source | Description |
|---|---|---|
| `figma_get_comments` | REST API + OAuth | Read comments on file/node |
| `figma_post_comment` | REST API + OAuth | Add a comment (groundwork for future @agent flow) |
| `figma_delete_comment` | REST API + OAuth | Remove a comment |

### Design-Code Parity (2 tools)

| Tool | Source | Description |
|---|---|---|
| `figma_check_design_parity` | Plugin API | Compare design vs code implementation |
| `figma_lint_design` | Plugin API | Check for design issues, missing styles |

### Escape Hatch (1 tool)

| Tool | Source | Description |
|---|---|---|
| `figma_execute` | Plugin API | Run arbitrary Figma plugin code |

## Selection Chip Integration

The prompt chip flow changes from REST API to plugin:

**Previous:** URL `did-navigate-in-page` → `figmaNotifyUrl` IPC → main process parses URL → REST API for node name (rate limited) → sends to renderer

**New:** Plugin detects selection change → sends `selectionchange` event via WebSocket → MCP server forwards via IPC `figma:selection-updated` with `{ nodeId, nodeName, nodeType, fileKey, fileName }` → renderer shows chip instantly

The existing renderer code (prompt context system, `FigmaContextItem` type, context chip UI, `buildRequestParts` serialization) is **unchanged**. Only the data source changes — from REST API to plugin WebSocket.

## Electron Integration

### Startup

In `packages/desktop-electron/src/main/index.ts`, after the app is ready:

1. Import and start the MCP WebSocket server from `packages/opendesign-figma-mcp`
2. Pass the OAuth token getter: `() => getAccessToken().catch(() => null)`
3. Pass the BrowserWindow ref for IPC forwarding
4. The WebSocket server starts listening on port 9333 (with fallback)

### MCP Registration

The opencode server discovers MCP servers from `opencode.json` / `opencode.jsonc` config files (in `.opencode/` directories or `~/.config/opencode/`). It does NOT read standalone `.mcp-figma.json` files.

On startup, the Electron app writes/merges an MCP entry into the **global config** at `~/.config/opencode/opencode.json` under the `mcp` key:

```jsonc
{
  "mcp": {
    "opendesign-figma": {
      "type": "local",
      "command": ["<path-to-opendesign-figma-mcp-bin>", "--stdio"],
      "env": {
        "FIGMA_OAUTH_TOKEN": "<token>",
        "OPENDESIGN_FIGMA_PORT": "9333"
      }
    }
  }
}
```

The Electron app must read the existing config, deep-merge the new entry, and write it back — not overwrite the file. The OAuth token env var is refreshed on each app launch.

### OAuth Token Passing

The MCP child process needs the OAuth token for REST API calls (library search, comments). The Electron main process passes it via `FIGMA_OAUTH_TOKEN` env var when writing the config. On token refresh, the config is updated. The MCP process reads `process.env.FIGMA_OAUTH_TOKEN` for REST API calls.

## What Gets Removed

| Current code | Action |
|---|---|
| `figma-selection.ts` — `resolveNodeName()`, `fetchThumbnail()` | Remove |
| `figma-selection.ts` — `initSelectionBridge(win, FigmaRestClient)` | Simplify — no REST client, just BrowserWindow ref for IPC |
| `figma-rest-client.ts` usage in `main/index.ts` (`wireMenu` creates client for selection) | Remove from `wireMenu()`. File stays — used inside MCP package for REST API tools |
| `figma-bridge.ts` preload file | Remove |
| `electron.vite.config.ts` — `"figma-bridge"` preload entry | Remove |
| `preload/index.ts` — `figmaBridgePreload` and `figmaNotifyUrl` methods | Remove |
| `preload/types.ts` — `figmaBridgePreload` and `figmaNotifyUrl` type definitions | Remove |
| `main/index.ts` — `ipcMain.handle("figma-bridge-preload", ...)` handler | Remove |
| `main/index.ts` — `ipcMain.on("figma:selection-changed", ...)` handler | Remove — plugin sends selection via WebSocket now |
| `figma-mcp-server.ts` (old standalone MCP server) | Remove — replaced by `packages/opendesign-figma-mcp` |
| `main/index.ts` — `writeMcpConfig()` writing `.mcp-figma.json` | Replace — write to `~/.config/opencode/opencode.json` instead |
| `figma-tab-content.tsx` — `figmaPreload` signal, `notifySelection()`, `handleInPageNav` | Remove — plugin handles selection, revert to single `handleNav` |
| `preload/types.ts` — `onFigmaThumbnail` type | Remove |
| `preload/index.ts` — `onFigmaThumbnail` listener | Remove |

## What Stays Unchanged

| Code | Why |
|---|---|
| `packages/app/src/context/prompt.tsx` — `FigmaContextItem` type | Same data shape, different source |
| `packages/app/src/components/prompt-input/context-items.tsx` — Figma chip UI | Unchanged |
| `packages/app/src/components/prompt-input/build-request-parts.ts` — Figma serialization | Unchanged |
| `packages/app/src/components/prompt-input.tsx` — IPC listener, auto-attach, dismiss | Same IPC channel `figma:selection-updated` |
| `packages/app/src/components/titlebar.tsx` — Figma icon + OAuth | Still needed for REST API auth |
| `packages/desktop-electron/src/main/figma-oauth.ts` | Still needed, token shared with MCP |

## Constraints

| Constraint | Decision |
|---|---|
| Port range | 9333-9342, avoids figma-console collision |
| No PAT | OAuth only, token passed via env var to MCP child process |
| Plugin distribution | Community (production), dev import (testing) |
| Two-process split | WebSocket server in Electron main process, MCP server as stdio child process spawned by opencode |
| ~40 tools | Curated subset, no FigJam/Slides/console debugging |
| Bootloader pattern | Plugin UI loads dynamically from WebSocket server (from figma-console) |
| Selection via plugin | No REST API for selection, no rate limit concerns |
| OAuth scopes | Must add `file_comments:write` to `figma-oauth.ts` SCOPES for comment tools. Users re-auth once. |
| Single instance | Only one Electron instance should run the WebSocket server. Port fallback handles accidental collisions. |

## Out of Scope (this spec)

- Connect UX (install button, auto-launch via JS injection) — Spec 2
- Figma comment @agent mention triggering sessions — separate future spec
- FigJam, Slides, console debugging tools
- Cloud/remote mode
- Plugin publishing to Figma Community (manual process, not code)

## Dependencies

- `@modelcontextprotocol/sdk` — MCP protocol
- `ws` — WebSocket server
- `zod` — schema validation for tool inputs
- Existing: `figma-oauth.ts` (OAuth token), `figma-rest-client.ts` (library search)

## Source

Forked from [southleft/figma-console-mcp](https://github.com/southleft/figma-console-mcp) (MIT license, v1.17.3).
