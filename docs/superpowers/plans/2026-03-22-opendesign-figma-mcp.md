# OpenDesign Figma MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Figma MCP server (forked from figma-console-mcp) with ~40 curated tools, embedded WebSocket server in Electron, and a Figma plugin for bidirectional communication — replacing the current REST API approach.

**Architecture:** WebSocket server runs in Electron main process (accepts plugin connections, forwards selection IPC). MCP server runs as a stdio child process (spawned by opencode, connects to WebSocket server as client). Figma plugin (forked from figma-desktop-bridge) bridges WebSocket ↔ Figma Plugin API.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, ws, zod, Electron IPC, Figma Plugin API

**Spec:** `docs/superpowers/specs/2026-03-22-opendesign-figma-mcp-design.md`

---

## File Structure

| File                                                       | Action | Responsibility                                                   |
| ---------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `packages/opendesign-figma-mcp/package.json`               | Create | Package manifest, dependencies, bin entry                        |
| `packages/opendesign-figma-mcp/tsconfig.json`              | Create | TypeScript config                                                |
| `packages/opendesign-figma-mcp/figma-plugin/manifest.json` | Create | Figma plugin manifest (forked, updated id/name/ports)            |
| `packages/opendesign-figma-mcp/figma-plugin/code.js`       | Create | Figma plugin worker (forked from figma-desktop-bridge)           |
| `packages/opendesign-figma-mcp/figma-plugin/ui.html`       | Create | Plugin UI — WebSocket client (forked, port range 9333-9342)      |
| `packages/opendesign-figma-mcp/src/index.ts`               | Create | CLI entry point (`--stdio` mode for MCP child process)           |
| `packages/opendesign-figma-mcp/src/websocket-server.ts`    | Create | WebSocket server (forked from core/websocket-server)             |
| `packages/opendesign-figma-mcp/src/websocket-connector.ts` | Create | Bridges MCP tool calls ↔ WebSocket commands to plugin           |
| `packages/opendesign-figma-mcp/src/mcp-server.ts`          | Create | MCP server setup, tool registration orchestrator                 |
| `packages/opendesign-figma-mcp/src/tools/selection.ts`     | Create | Selection & structure tools (6)                                  |
| `packages/opendesign-figma-mcp/src/tools/components.ts`    | Create | Component & design system tools (8)                              |
| `packages/opendesign-figma-mcp/src/tools/variables.ts`     | Create | Token & variable tools (8)                                       |
| `packages/opendesign-figma-mcp/src/tools/creation.ts`      | Create | Design creation & mutation tools (12)                            |
| `packages/opendesign-figma-mcp/src/tools/comments.ts`      | Create | Comment tools (3)                                                |
| `packages/opendesign-figma-mcp/src/tools/parity.ts`        | Create | Design-code parity tools (2)                                     |
| `packages/opendesign-figma-mcp/src/tools/execute.ts`       | Create | Escape hatch — run arbitrary plugin code (1)                     |
| `packages/opendesign-figma-mcp/src/rest-client.ts`         | Create | Figma REST API client (forked, uses OAuth token from env)        |
| `packages/desktop-electron/src/main/figma-ws.ts`           | Create | Starts WebSocket server in Electron main, forwards selection IPC |
| `packages/desktop-electron/src/main/index.ts`              | Modify | Wire figma-ws on startup, update config writer                   |
| `packages/desktop-electron/src/main/figma-oauth.ts`        | Modify | Add `file_comments:write` scope                                  |
| `packages/desktop-electron/src/main/figma-selection.ts`    | Modify | Simplify — receive selection from WebSocket, no REST API         |
| `packages/desktop-electron/src/preload/index.ts`           | Modify | Remove figmaBridgePreload, figmaNotifyUrl, onFigmaThumbnail      |
| `packages/desktop-electron/src/preload/types.ts`           | Modify | Remove corresponding type definitions                            |
| `packages/desktop-electron/electron.vite.config.ts`        | Modify | Remove figma-bridge preload entry                                |
| `packages/app/src/pages/session/figma-tab-content.tsx`     | Modify | Remove preload/notification code, revert to simple webview       |

---

### Task 1: Scaffold Package

**Files:**

- Create: `packages/opendesign-figma-mcp/package.json`
- Create: `packages/opendesign-figma-mcp/tsconfig.json`
- Create: `packages/opendesign-figma-mcp/src/index.ts` (minimal entry)

- [ ] **Step 1: Create package directory**

```bash
mkdir -p packages/opendesign-figma-mcp/src/tools
mkdir -p packages/opendesign-figma-mcp/figma-plugin
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "@opencode-ai/opendesign-figma-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./websocket-server": "./dist/websocket-server.js",
    "./websocket-connector": "./dist/websocket-connector.js"
  },
  "bin": {
    "opendesign-figma-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "bun build src/index.ts src/websocket-server.ts src/websocket-connector.ts --outdir dist --target node",
    "dev": "bun run src/index.ts",
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "ws": "^8.19.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Reference the root tsconfig, set `outDir` to `dist`, target ESNext.

- [ ] **Step 4: Create minimal entry point**

`packages/opendesign-figma-mcp/src/index.ts`:

```typescript
#!/usr/bin/env node
console.log("opendesign-figma-mcp starting...")
```

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/Mani/Desktop/SideProjects/opendesign && bun install
```

- [ ] **Step 6: Verify the package resolves in the workspace**

```bash
bun run --cwd packages/opendesign-figma-mcp dev
```

Expected: prints "opendesign-figma-mcp starting..."

- [ ] **Step 7: Commit**

```bash
git add packages/opendesign-figma-mcp/
git commit -m "feat(opendesign-figma-mcp): scaffold package with dependencies"
```

---

### Task 2: Fork Figma Plugin

**Files:**

- Create: `packages/opendesign-figma-mcp/figma-plugin/manifest.json`
- Create: `packages/opendesign-figma-mcp/figma-plugin/code.js`
- Create: `packages/opendesign-figma-mcp/figma-plugin/ui.html`

- [ ] **Step 1: Copy plugin files from figma-console-mcp**

```bash
cp /Users/Mani/.npm/_npx/b547afed9fcf6dcb/node_modules/figma-console-mcp/figma-desktop-bridge/code.js packages/opendesign-figma-mcp/figma-plugin/
cp /Users/Mani/.npm/_npx/b547afed9fcf6dcb/node_modules/figma-console-mcp/figma-desktop-bridge/ui.html packages/opendesign-figma-mcp/figma-plugin/
cp /Users/Mani/.npm/_npx/b547afed9fcf6dcb/node_modules/figma-console-mcp/figma-desktop-bridge/manifest.json packages/opendesign-figma-mcp/figma-plugin/
```

- [ ] **Step 2: Update manifest.json**

Change:

- `id` → `"opendesign-figma-bridge"` (unique plugin ID)
- `name` → `"OpenDesign Bridge"`
- Keep all permissions: `teamlibrary`, `dynamic-page`, `inspect`, `enablePrivatePluginApi: true`
- Keep all editor types: `figma`, `figjam`, `slides`, `dev`

- [ ] **Step 3: Update port range in ui.html**

Find and replace port scanning range from `9223-9232` to `9333-9342` in `ui.html`. Search for `9223` and replace all instances:

- Default port: `9223` → `9333`
- Port range end: `9232` → `9342`
- Any references to the port range in comments

- [ ] **Step 4: Update branding in ui.html**

Replace references to "Figma Console" or "figma-console" with "OpenDesign Bridge" where visible to users. Keep internal protocol names as-is for now.

- [ ] **Step 5: Verify plugin loads in Figma**

1. Open Figma Desktop
2. Go to Plugins → Development → Import plugin from manifest
3. Select `packages/opendesign-figma-mcp/figma-plugin/manifest.json`
4. Run the plugin — it should show the UI panel (won't connect yet — no server)

- [ ] **Step 6: Commit**

```bash
git add packages/opendesign-figma-mcp/figma-plugin/
git commit -m "feat(opendesign-figma-mcp): fork figma-desktop-bridge plugin with updated ports and branding"
```

---

### Task 3: Build WebSocket Server

**Files:**

- Create: `packages/opendesign-figma-mcp/src/websocket-server.ts`

Fork the WebSocket server from figma-console-mcp's `dist/core/websocket-server.d.ts` / `dist/local.js`. This is the core bridge between the plugin and MCP tools.

- [ ] **Step 1: Read the figma-console WebSocket server source**

Read the compiled `dist/local.js` to understand the `FigmaWebSocketServer` class implementation. Key parts to extract:

- Port scanning logic (adapt to 9333-9342)
- Client connection handling (tracking by fileKey)
- `sendCommand(method, params, timeout, targetFileKey)` — the RPC call mechanism
- Selection change event forwarding
- Heartbeat/ping-pong for connection health

- [ ] **Step 2: Create websocket-server.ts**

Create `packages/opendesign-figma-mcp/src/websocket-server.ts` with:

```typescript
import { WebSocketServer, WebSocket } from "ws"
import { EventEmitter } from "node:events"

type ClientState = {
  ws: WebSocket
  fileKey: string
  fileName: string
  lastActivity: number
}

export class FigmaWSServer extends EventEmitter {
  private server: WebSocketServer | null = null
  private clients = new Map<string, ClientState>()
  private pendingRequests = new Map<string, { resolve: Function; reject: Function; timeoutId: NodeJS.Timeout }>()
  private requestIdCounter = 0
  private activeFileKey: string | null = null
  private port = 9333

  async start(preferredPort = 9333): Promise<number> {
    // Try ports 9333-9342, return actual port
  }

  stop(): void {
    // Close all connections and server
  }

  async sendCommand(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 15000,
    targetFileKey?: string,
  ): Promise<unknown> {
    // Send JSON-RPC to plugin, wait for response
  }

  getActiveFileKey(): string | null {
    return this.activeFileKey
  }
  isConnected(): boolean {
    return this.clients.size > 0
  }
  getPort(): number {
    return this.port
  }
}
```

Follow the exact protocol from figma-console: message format `{ id, method, params }`, response matching by ID, FILE_INFO handling, SELECTION_CHANGE forwarding.

Emit events:

- `"connected"` — plugin connected
- `"disconnected"` — plugin disconnected
- `"selection"` — selection changed `{ nodeId, nodeName, nodeType, fileKey }`

- [ ] **Step 3: Verify it compiles**

```bash
cd packages/opendesign-figma-mcp && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/opendesign-figma-mcp/src/websocket-server.ts
git commit -m "feat(opendesign-figma-mcp): add WebSocket server for plugin communication"
```

---

### Task 4: Build WebSocket Connector (MCP ↔ Plugin Bridge)

**Files:**

- Create: `packages/opendesign-figma-mcp/src/types.ts`
- Create: `packages/opendesign-figma-mcp/src/websocket-connector.ts`

This bridges MCP tool calls to plugin commands. Each tool calls a method on the connector, which translates to a WebSocket command.

- [ ] **Step 1: Define CommandSender interface and create websocket-connector.ts**

First, create the shared interface that both `FigmaWSServer` (Electron main process) and the MCP child process's `WSClient` will implement:

```typescript
// packages/opendesign-figma-mcp/src/types.ts
export interface CommandSender {
  sendCommand(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>
}
```

Then create the connector using the interface:

```typescript
import type { CommandSender } from "./types.js"

export class FigmaConnector {
  constructor(private sender: CommandSender) {}

  async getSelection(): Promise<unknown> {
    return this.sender.sendCommand("GET_SELECTION")
  }

  async getFileData(params: { depth?: number }): Promise<unknown> {
    return this.sender.sendCommand("GET_FILE_DATA", params)
  }

  async createChild(params: { parentId: string; type: string; props: Record<string, unknown> }): Promise<unknown> {
    return this.sender.sendCommand("CREATE_CHILD", params)
  }

  async executeCode(code: string): Promise<unknown> {
    return this.sender.sendCommand("EXECUTE", { code })
  }

  // ... one method per WebSocket command the plugin supports
  // Reference the full method list from figma-console's WebSocketConnector
}
```

- [ ] **Step 2: Map all ~40 tool commands**

Read figma-console's `dist/core/websocket-connector.d.ts` to get the full method list. Implement each method as a thin wrapper around `this.ws.sendCommand(METHOD_NAME, params)`.

- [ ] **Step 3: Commit**

```bash
git add packages/opendesign-figma-mcp/src/types.ts packages/opendesign-figma-mcp/src/websocket-connector.ts
git commit -m "feat(opendesign-figma-mcp): add CommandSender interface and WebSocket connector"
```

---

### Task 5: Build REST Client (OAuth-based)

**Files:**

- Create: `packages/opendesign-figma-mcp/src/rest-client.ts`

Fork from the existing `figma-rest-client.ts` in desktop-electron. Uses `FIGMA_OAUTH_TOKEN` env var instead of PAT.

- [ ] **Step 1: Create rest-client.ts**

Fork `packages/desktop-electron/src/main/figma-rest-client.ts` to `packages/opendesign-figma-mcp/src/rest-client.ts`. Change the token source:

```typescript
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

function getOAuthToken(): string | null {
  // First check env var (set at spawn time)
  const envToken = process.env.FIGMA_OAUTH_TOKEN
  if (envToken) return envToken

  // Fallback: re-read from config file (handles token refresh while process runs)
  try {
    const configPath = join(homedir(), ".config", "opencode", "opencode.json")
    if (!existsSync(configPath)) return null
    const config = JSON.parse(readFileSync(configPath, "utf-8"))
    return config.mcp?.["opendesign-figma"]?.env?.FIGMA_OAUTH_TOKEN ?? null
  } catch {
    return null
  }
}

export function createRestClient() {
  return new FigmaRestClient({
    getToken: async () => getOAuthToken(),
    maxRetries: 1,
  })
}
```

**Note:** The `getToken` function is called on every REST API request, so it will pick up refreshed tokens from the config file even after the process has been running for a while.

Keep: `getFileNodes`, `getImage`, `getStyles`, `getVariables` methods.
Add if not present: comment endpoints (`GET /v1/files/:key/comments`, `POST /v1/files/:key/comments`, `DELETE /v1/files/:key/comments/:id`).

- [ ] **Step 2: Commit**

```bash
git add packages/opendesign-figma-mcp/src/rest-client.ts
git commit -m "feat(opendesign-figma-mcp): add OAuth-based REST client for library search and comments"
```

---

### Task 6: Register MCP Tools (~40 tools)

**Files:**

- Create: `packages/opendesign-figma-mcp/src/mcp-server.ts`
- Create: `packages/opendesign-figma-mcp/src/tools/selection.ts`
- Create: `packages/opendesign-figma-mcp/src/tools/components.ts`
- Create: `packages/opendesign-figma-mcp/src/tools/variables.ts`
- Create: `packages/opendesign-figma-mcp/src/tools/creation.ts`
- Create: `packages/opendesign-figma-mcp/src/tools/comments.ts`
- Create: `packages/opendesign-figma-mcp/src/tools/parity.ts`
- Create: `packages/opendesign-figma-mcp/src/tools/execute.ts`

- [ ] **Step 1: Create mcp-server.ts**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { FigmaConnector } from "./websocket-connector.js"
import type { FigmaRestClient } from "./rest-client.js"
import { registerSelectionTools } from "./tools/selection.js"
import { registerComponentTools } from "./tools/components.js"
import { registerVariableTools } from "./tools/variables.js"
import { registerCreationTools } from "./tools/creation.js"
import { registerCommentTools } from "./tools/comments.js"
import { registerParityTools } from "./tools/parity.js"
import { registerExecuteTool } from "./tools/execute.js"

export function createMcpServer(connector: FigmaConnector, restClient: FigmaRestClient): McpServer {
  const server = new McpServer({ name: "opendesign-figma", version: "0.1.0" })

  registerSelectionTools(server, connector)
  registerComponentTools(server, connector, restClient)
  registerVariableTools(server, connector)
  registerCreationTools(server, connector)
  registerCommentTools(server, restClient)
  registerParityTools(server, connector)
  registerExecuteTool(server, connector)

  return server
}
```

- [ ] **Step 2: Create tool files**

For each tool file, follow the registration pattern from figma-console. Each file exports a `register*Tools(server, connector, ...)` function that calls `server.tool(name, description, schema, handler)`.

**Example — `tools/selection.ts`:**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

export function registerSelectionTools(server: McpServer, connector: FigmaConnector) {
  server.tool("figma_get_selection", "Get currently selected nodes with name, type, and properties", {}, async () => {
    const result = await connector.getSelection()
    return { content: [{ type: "text", text: JSON.stringify(result) }] }
  })

  server.tool(
    "figma_get_file_data",
    "Get file/page structure",
    {
      depth: z.number().optional().describe("How deep to traverse the node tree"),
    },
    async ({ depth }) => {
      const result = await connector.getFileData({ depth })
      return { content: [{ type: "text", text: JSON.stringify(result) }] }
    },
  )

  // ... figma_get_status, figma_list_open_files, figma_navigate, figma_take_screenshot
}
```

Reference figma-console's tool registration in `dist/local.js` for exact tool names, descriptions, zod schemas, and handler logic. Adapt each handler to use the `FigmaConnector` instead of figma-console's internal connector.

**Tool files to create:**

- `tools/selection.ts` — 6 tools (get_selection, get_file_data, get_status, list_open_files, navigate, take_screenshot)
- `tools/components.ts` — 8 tools (get_component, get_component_details, get_component_for_development, get_component_image, search_components, get_library_components, get_design_system_summary, get_design_system_kit)
- `tools/variables.ts` — 8 tools (get_variables, get_token_values, get_styles, browse_tokens, create_variable, batch_create_variables, update_variable, batch_update_variables)
- `tools/creation.ts` — 12 tools (create_child, clone_node, instantiate_component, set_instance_properties, set_fills, set_strokes, set_text, set_image_fill, move_node, resize_node, rename_node, delete_node)
- `tools/comments.ts` — 3 tools (get_comments, post_comment, delete_comment) — uses REST client
- `tools/parity.ts` — 2 tools (check_design_parity, lint_design)
- `tools/execute.ts` — 1 tool (execute arbitrary plugin code)

- [ ] **Step 3: Verify compilation**

```bash
cd packages/opendesign-figma-mcp && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/opendesign-figma-mcp/src/mcp-server.ts packages/opendesign-figma-mcp/src/tools/
git commit -m "feat(opendesign-figma-mcp): register ~40 MCP tools across 7 categories"
```

---

### Task 7: Wire MCP Entry Point (stdio mode)

**Files:**

- Modify: `packages/opendesign-figma-mcp/src/index.ts`

- [ ] **Step 1: Implement the stdio entry point**

The MCP server runs as a child process. It:

1. Connects to the WebSocket server (localhost:9333) as a **client** (not server — the Electron main process hosts the server)
2. Creates the MCP server with all tools
3. Starts stdio transport

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { WebSocket } from "ws"
import { FigmaConnector } from "./websocket-connector.js"
import { createMcpServer } from "./mcp-server.js"
import { createRestClient } from "./rest-client.js"

const port = parseInt(process.env.OPENDESIGN_FIGMA_PORT ?? "9333")

// Connect to the WebSocket server running in Electron main process
// The MCP process is a CLIENT of the WebSocket server, not the host
import type { CommandSender } from "./types.js"

// Lightweight WS client implementing CommandSender
class WSClient implements CommandSender {
  private ws: WebSocket | null = null
  private pending = new Map<string, { resolve: Function; reject: Function }>()
  private counter = 0

  async connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${port}`)
      this.ws.on("open", () => resolve())
      this.ws.on("error", reject)
      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString())
        const req = this.pending.get(msg.id)
        if (req) {
          this.pending.delete(msg.id)
          req.resolve(msg.result ?? msg)
        }
      })
    })
  }

  async sendCommand(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<unknown> {
    if (!this.ws) throw new Error("Not connected")
    const id = `mcp_${++this.counter}_${Date.now()}`
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v: unknown) => {
          clearTimeout(timeout)
          resolve(v)
        },
        reject: (e: unknown) => {
          clearTimeout(timeout)
          reject(e)
        },
      })
      this.ws!.send(JSON.stringify({ id, method, params }))
    })
  }
}

async function main() {
  const client = new WSClient()

  // Retry connection — WebSocket server may not be ready yet
  for (let i = 0; i < 10; i++) {
    try {
      await client.connect(port)
      break
    } catch {
      if (i === 9) throw new Error(`Cannot connect to WebSocket on port ${port}`)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  const connector = new FigmaConnector(client) // WSClient implements CommandSender
  const restClient = createRestClient()
  const server = createMcpServer(connector, restClient)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error("opendesign-figma-mcp failed:", err)
  process.exit(1)
})
```

Note: The `FigmaConnector` currently takes a `FigmaWSServer` but the MCP child process uses a WS client. Extract an interface (`CommandSender`) with `sendCommand(method, params, timeout)` that both `FigmaWSServer` and `WSClient` implement. Update `FigmaConnector` to accept the interface.

- [ ] **Step 2: Build and verify**

```bash
cd packages/opendesign-figma-mcp && bun run build
node dist/index.js --stdio
```

Expected: connects to localhost:9333 (will fail if no server running — that's fine, just verify it starts and retries)

- [ ] **Step 3: Commit**

```bash
git add packages/opendesign-figma-mcp/src/index.ts
git commit -m "feat(opendesign-figma-mcp): implement stdio MCP entry point with WebSocket client"
```

---

### Task 8: Wire WebSocket Server into Electron Main Process

**Files:**

- Create: `packages/desktop-electron/src/main/figma-ws.ts`
- Modify: `packages/desktop-electron/src/main/index.ts`

- [ ] **Step 1: Create figma-ws.ts**

This module starts the WebSocket server from `opendesign-figma-mcp` in the Electron main process and forwards selection events to the renderer via IPC.

```typescript
import type { BrowserWindow } from "electron"
import { FigmaWSServer } from "@opencode-ai/opendesign-figma-mcp/websocket-server"

let server: FigmaWSServer | null = null

export async function startFigmaWS(win: BrowserWindow): Promise<number> {
  server = new FigmaWSServer()
  const port = await server.start(9333)

  server.on("selection", (data) => {
    if (!win.isDestroyed()) {
      win.webContents.send("figma:selection-updated", {
        fileKey: data.fileKey,
        nodeId: data.nodeId,
        nodeName: data.nodeName,
        nodeType: data.nodeType,
        fileName: data.fileName,
        url: null,
      })
    }
  })

  server.on("connected", () => {
    if (!win.isDestroyed()) win.webContents.send("figma:plugin-connected")
  })

  server.on("disconnected", () => {
    if (!win.isDestroyed()) win.webContents.send("figma:plugin-disconnected")
  })

  return port
}

export function stopFigmaWS() {
  server?.stop()
  server = null
}

export function isFigmaPluginConnected(): boolean {
  return server?.isConnected() ?? false
}
```

- [ ] **Step 2: Wire into main/index.ts**

In the `initialize()` function, after `mainWindow` is created:

```typescript
import { startFigmaWS, stopFigmaWS, isFigmaPluginConnected } from "./figma-ws"

// In wireMenu() or after mainWindow is assigned:
const figmaPort = await startFigmaWS(mainWindow)
writeMcpConfig(figmaPort) // pass actual port
```

Update `writeMcpConfig()` to write to `~/.config/opencode/opencode.json` (deep merge):

```typescript
function writeMcpConfig(port: number) {
  try {
    const configDir = join(homedir(), ".config", "opencode")
    mkdirSync(configDir, { recursive: true })
    const configPath = join(configDir, "opencode.json")

    // Read existing config
    let config: Record<string, any> = {}
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf-8"))
    }

    // Deep merge MCP entry
    config.mcp = config.mcp ?? {}
    const mcpBin = join(__dirname, "../../opendesign-figma-mcp/dist/index.js")
    config.mcp["opendesign-figma"] = {
      type: "local",
      command: [process.execPath, mcpBin, "--stdio"],
      env: {
        OPENDESIGN_FIGMA_PORT: String(port),
        FIGMA_OAUTH_TOKEN: "", // Updated on auth
      },
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
    logger.log("figma mcp config written", { configPath, port })
  } catch (err) {
    logger.error("failed to write figma mcp config", err)
  }
}
```

Also update the OAuth token in the config whenever it's refreshed. Add a helper that writes just the token:

```typescript
function updateMcpToken(token: string) {
  try {
    const configPath = join(homedir(), ".config", "opencode", "opencode.json")
    if (!existsSync(configPath)) return
    const config = JSON.parse(readFileSync(configPath, "utf-8"))
    if (config.mcp?.["opendesign-figma"]?.env) {
      config.mcp["opendesign-figma"].env.FIGMA_OAUTH_TOKEN = token
      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
    }
  } catch {
    /* ignore */
  }
}
```

Call `updateMcpToken()` after successful OAuth and after token refresh.

- [ ] **Step 3: Add separate IPC for plugin connection status**

Do NOT change the existing `figmaAuthStatus` return type (it returns `boolean`, changing it would break the renderer). Instead, add a new IPC handler:

```typescript
ipcMain.handle("figma-plugin-status", () => isFigmaPluginConnected())
```

And add to preload `types.ts` and `index.ts`:

```typescript
// types.ts
figmaPluginStatus: () => Promise<boolean>
// index.ts
figmaPluginStatus: () => ipcRenderer.invoke("figma-plugin-status"),
```

- [ ] **Step 4: Add before-quit cleanup**

```typescript
app.on("before-quit", () => {
  stopFigmaWS()
  killSidecar()
})
```

- [ ] **Step 5: Commit**

```bash
git add packages/desktop-electron/src/main/figma-ws.ts packages/desktop-electron/src/main/index.ts
git commit -m "feat(desktop-electron): wire WebSocket server and MCP config into Electron main process"
```

---

### Task 9: Update OAuth Scopes

**Files:**

- Modify: `packages/desktop-electron/src/main/figma-oauth.ts`

- [ ] **Step 1: Add file_comments:write scope**

Change:

```typescript
const SCOPES = "file_content:read,file_metadata:read,file_comments:read,file_dev_resources:read"
```

To:

```typescript
const SCOPES = "file_content:read,file_metadata:read,file_comments:read,file_comments:write,file_dev_resources:read"
```

Also enable this scope in your Figma app settings at figma.com/developers.

- [ ] **Step 2: Commit**

```bash
git add packages/desktop-electron/src/main/figma-oauth.ts
git commit -m "feat(desktop-electron): add file_comments:write scope for comment tools"
```

---

### Task 10: Cleanup Old Code

**Files:**

- Remove: `packages/desktop-electron/src/preload/figma-bridge.ts`
- Remove: `packages/desktop-electron/src/main/figma-mcp-server.ts`
- Modify: `packages/desktop-electron/src/preload/index.ts`
- Modify: `packages/desktop-electron/src/preload/types.ts`
- Modify: `packages/desktop-electron/electron.vite.config.ts`
- Modify: `packages/desktop-electron/src/main/figma-selection.ts`
- Modify: `packages/desktop-electron/src/main/index.ts`
- Modify: `packages/app/src/pages/session/figma-tab-content.tsx`

- [ ] **Step 1: Remove figma-bridge preload**

```bash
rm packages/desktop-electron/src/preload/figma-bridge.ts
```

- [ ] **Step 2: Remove figma-bridge from electron.vite.config.ts**

Remove the `"figma-bridge": "src/preload/figma-bridge.ts"` entry from the preload build inputs.

- [ ] **Step 3: Remove old figma-mcp-server.ts**

```bash
rm packages/desktop-electron/src/main/figma-mcp-server.ts
```

- [ ] **Step 4: Clean up preload/types.ts**

Remove:

- `figmaBridgePreload: () => Promise<string>`
- `figmaNotifyUrl: (url: string) => void`
- `onFigmaThumbnail` listener type

- [ ] **Step 5: Clean up preload/index.ts**

Remove:

- `figmaBridgePreload` method
- `figmaNotifyUrl` method
- `onFigmaThumbnail` listener

- [ ] **Step 6: Clean up main/index.ts IPC handlers**

Remove:

- `ipcMain.handle("figma-bridge-preload", ...)`
- `ipcMain.on("figma:selection-changed", ...)` — plugin sends selection via WebSocket now
- Old `writeMcpConfig()` function (replaced in Task 8)
- `FigmaRestClient` creation in `wireMenu()` for selection

- [ ] **Step 7: Simplify figma-selection.ts**

Remove: `resolveNodeName()`, `fetchThumbnail()`, `initSelectionBridge()`, REST client imports, debounce logic.

Keep: `FigmaSelection` type, `getSelection()`, `updateSelection()`, `onSelectionChange()` — these are still used by the WebSocket server integration to track state.

- [ ] **Step 8: Simplify figma-tab-content.tsx**

Remove:

- `figmaPreload` signal and `onMount` that fetches preload path
- `notifySelection()` function
- `handleInPageNav` — revert to single `handleNav` for both `did-navigate` and `did-navigate-in-page`
- `notifyApi` reference

The webview becomes a simple Figma embed again — selection is handled by the plugin, not the webview bridge.

- [ ] **Step 9: Verify typecheck**

```bash
cd packages/app && bun run typecheck
cd packages/desktop-electron && bun run typecheck 2>/dev/null || echo "check manually"
```

- [ ] **Step 10: Run tests**

```bash
cd packages/app && bun run test:unit
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: remove old REST API selection tracking, figma-bridge preload, and standalone MCP server"
```

---

### Task 11: End-to-End Integration Test

**Files:**

- All packages

- [ ] **Step 1: Build the MCP package**

```bash
cd packages/opendesign-figma-mcp && bun run build
```

- [ ] **Step 2: Start the Electron app**

```bash
bun run --cwd packages/desktop-electron dev
```

- [ ] **Step 3: Import and run the plugin**

1. Open Figma Desktop (or the embedded webview)
2. Plugins → Development → Import plugin from manifest
3. Select `packages/opendesign-figma-mcp/figma-plugin/manifest.json`
4. Run the plugin
5. Check terminal for WebSocket connection log

- [ ] **Step 4: Test selection flow**

1. Click a frame in Figma
2. The plugin should detect the selection and send it via WebSocket
3. The prompt area should show a chip with the frame name (not just nodeId)
4. Dismiss the chip, click a different frame — new chip appears

- [ ] **Step 5: Test MCP tools**

Start a session in the app, submit a prompt like "What frame is selected in Figma?"
The agent should call `figma_get_selection` and report the frame name.

- [ ] **Step 6: Test design creation**

Submit: "Create a blue rectangle in Figma"
The agent should call `figma_create_child` and a rectangle should appear in Figma.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A && git commit -m "fix: integration fixes for opendesign-figma-mcp"
```
