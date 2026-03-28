# Figma Bridge MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron-hosted MCP server that gives agents structured access to Figma design data via REST API (reads) and Plugin API (mutations), with OAuth authentication and a webview bridge for selection tracking.

**Architecture:** Electron main process spawns a stdio-based MCP server as a child process. The server exposes tools like `figma_get_frame`, `figma_get_variables`, etc. A preload script injected into the Figma webview tracks user selection and sends it to the main process via IPC. OAuth tokens are stored in Electron's safeStorage.

**Tech Stack:** @modelcontextprotocol/sdk, Electron IPC, Figma REST API v1, Electron safeStorage

**Spec:** `docs/superpowers/specs/2026-03-22-figma-bridge-and-prototype-rendering-design.md`

---

## File Structure

| File                                                      | Action | Responsibility                                                      |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| `packages/desktop-electron/package.json`                  | Modify | Add @modelcontextprotocol/sdk dependency                            |
| `packages/desktop-electron/src/main/figma-mcp-server.ts`  | Create | MCP server implementation with all figma\_\* tools                  |
| `packages/desktop-electron/src/main/figma-oauth.ts`       | Create | OAuth flow: popup window, token storage/refresh                     |
| `packages/desktop-electron/src/main/figma-rest-client.ts` | Create | Typed Figma REST API client wrapping fetch + auth                   |
| `packages/desktop-electron/src/main/figma-selection.ts`   | Create | Selection state manager (receives IPC from preload, exposes to MCP) |
| `packages/desktop-electron/src/preload/figma-bridge.ts`   | Create | Preload script for Figma webview: URL hash tracking, IPC to main    |
| `packages/desktop-electron/src/preload/index.ts`          | Modify | Register figma bridge IPC channels in contextBridge                 |
| `packages/desktop-electron/src/main/index.ts`             | Modify | Spawn MCP server on app launch, wire IPC handlers                   |
| `packages/app/src/components/titlebar.tsx`                | Modify | Add Figma connection status indicator                               |
| `packages/opencode/src/agent/agent.ts`                    | Modify | Update design agent prompt references                               |
| `packages/opencode/src/agent/prompt/design.txt`           | Modify | Reference MCP tools instead of injection bridge                     |
| `packages/opencode/src/agent/prompt/figma-write.txt`      | Modify | Update to use MCP tools                                             |

---

### Task 1: Add MCP SDK Dependency

**Files:**

- Modify: `packages/desktop-electron/package.json`

- [ ] **Step 1: Add @modelcontextprotocol/sdk**

```bash
cd packages/desktop-electron && bun add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify installation**

```bash
cd packages/desktop-electron && bun pm ls | grep modelcontextprotocol
```

Expected: `@modelcontextprotocol/sdk` appears in output

- [ ] **Step 3: Commit**

```bash
git add packages/desktop-electron/package.json bun.lockb
git commit -m "chore(desktop): add @modelcontextprotocol/sdk dependency"
```

---

### Task 2: Figma REST API Client

A typed client that wraps `fetch` with automatic auth header injection and error handling for Figma REST API v1.

**Files:**

- Create: `packages/desktop-electron/src/main/figma-rest-client.ts`

- [ ] **Step 1: Create the REST client**

```typescript
// packages/desktop-electron/src/main/figma-rest-client.ts

const BASE = "https://api.figma.com/v1"

export interface FigmaRestConfig {
  getToken: () => Promise<string | null>
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
  fills?: unknown[]
  strokes?: unknown[]
  effects?: unknown[]
  style?: Record<string, unknown>
  componentProperties?: Record<string, unknown>
}

export interface FigmaFileNodesResponse {
  nodes: Record<string, { document: FigmaNode; components: Record<string, unknown>; styles: Record<string, unknown> }>
}

export interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, { id: string; name: string; resolvedType: string; valuesByMode: Record<string, unknown> }>
    variableCollections: Record<string, { id: string; name: string; modes: Array<{ modeId: string; name: string }> }>
  }
}

export interface FigmaStylesResponse {
  meta: {
    styles: Array<{ key: string; name: string; style_type: string; description: string }>
  }
}

export class FigmaRestClient {
  constructor(private config: FigmaRestConfig) {}

  private async request<T>(path: string): Promise<T> {
    const token = await this.config.getToken()
    if (!token) throw new Error("figma_auth_required")
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) throw new Error("figma_auth_required")
    if (res.status === 429) throw new Error("figma_rate_limited")
    if (!res.ok) throw new Error(`figma_api_error: ${res.status} ${res.statusText}`)
    return res.json() as Promise<T>
  }

  async getFileNodes(fileKey: string, nodeIds: string[]) {
    const ids = nodeIds.join(",")
    return this.request<FigmaFileNodesResponse>(`/files/${fileKey}/nodes?ids=${ids}`)
  }

  async getVariables(fileKey: string) {
    return this.request<FigmaVariablesResponse>(`/files/${fileKey}/variables/local`)
  }

  async getStyles(fileKey: string) {
    return this.request<FigmaStylesResponse>(`/files/${fileKey}/styles`)
  }

  async getImage(fileKey: string, nodeId: string, opts?: { scale?: number; format?: string }) {
    const scale = opts?.scale ?? 2
    const format = opts?.format ?? "png"
    const res = await this.request<{ images: Record<string, string> }>(
      `/images/${fileKey}?ids=${nodeId}&scale=${scale}&format=${format}`,
    )
    return res.images[nodeId] ?? null
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/desktop-electron && npx tsc --noEmit src/main/figma-rest-client.ts 2>&1 || echo "Check for type errors"
```

- [ ] **Step 3: Commit**

```bash
git add packages/desktop-electron/src/main/figma-rest-client.ts
git commit -m "feat(desktop): add typed Figma REST API client"
```

---

### Task 3: OAuth Flow

Handle Figma OAuth popup, token storage in safeStorage, and automatic refresh.

**Files:**

- Create: `packages/desktop-electron/src/main/figma-oauth.ts`

- [ ] **Step 1: Create the OAuth module**

```typescript
// packages/desktop-electron/src/main/figma-oauth.ts

import { BrowserWindow, safeStorage } from "electron"

const CLIENT_ID = process.env.FIGMA_CLIENT_ID ?? ""
const CLIENT_SECRET = process.env.FIGMA_CLIENT_SECRET ?? ""
const REDIRECT_URI = "http://localhost:19523/figma/callback"
const TOKEN_KEY = "figma-oauth-token"

interface TokenData {
  access_token: string
  refresh_token: string
  expires_at: number
}

let tokenCache: TokenData | null = null

function loadStoredToken(): TokenData | null {
  try {
    const raw = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(Buffer.from(localStorage?.getItem(TOKEN_KEY) ?? "", "base64"))
      : null
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function storeToken(data: TokenData) {
  tokenCache = data
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(data))
    // Store in electron-store or app data file
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (!tokenCache) tokenCache = loadStoredToken()
  if (!tokenCache) return null
  if (Date.now() >= tokenCache.expires_at - 60_000) {
    const refreshed = await refreshToken(tokenCache.refresh_token)
    if (!refreshed) return null
  }
  return tokenCache.access_token
}

async function refreshToken(refresh: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.figma.com/v1/oauth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refresh,
      }),
    })
    if (!res.ok) return false
    const data = await res.json()
    storeToken({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refresh,
      expires_at: Date.now() + data.expires_in * 1000,
    })
    return true
  } catch {
    return false
  }
}

export async function startOAuthFlow(): Promise<boolean> {
  return new Promise((resolve) => {
    const authUrl = `https://www.figma.com/oauth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=files:read,file_variables:read,file_dev_resources:read&response_type=code`
    const win = new BrowserWindow({ width: 600, height: 700, show: true })
    win.loadURL(authUrl)

    win.webContents.on("will-redirect", async (_e, url) => {
      const parsed = new URL(url)
      const code = parsed.searchParams.get("code")
      if (!code) {
        win.close()
        resolve(false)
        return
      }

      try {
        const res = await fetch("https://api.figma.com/v1/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code,
            grant_type: "authorization_code",
          }),
        })
        const data = await res.json()
        storeToken({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000,
        })
        win.close()
        resolve(true)
      } catch {
        win.close()
        resolve(false)
      }
    })

    win.on("closed", () => resolve(false))
  })
}

export function isAuthenticated(): boolean {
  if (!tokenCache) tokenCache = loadStoredToken()
  return tokenCache !== null && Date.now() < tokenCache.expires_at
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/desktop-electron/src/main/figma-oauth.ts
git commit -m "feat(desktop): add Figma OAuth flow with safeStorage token persistence"
```

---

### Task 4: Selection State Manager

Receives IPC messages from the Figma webview preload and stores current selection.

**Files:**

- Create: `packages/desktop-electron/src/main/figma-selection.ts`

- [ ] **Step 1: Create selection state module**

```typescript
// packages/desktop-electron/src/main/figma-selection.ts

export interface FigmaSelectionState {
  fileKey: string | null
  nodeId: string | null
  url: string | null
  fileName: string | null
}

let current: FigmaSelectionState = {
  fileKey: null,
  nodeId: null,
  url: null,
  fileName: null,
}

const listeners: Array<(state: FigmaSelectionState) => void> = []

export function getSelection(): FigmaSelectionState {
  return { ...current }
}

export function updateSelection(state: Partial<FigmaSelectionState>) {
  current = { ...current, ...state }
  for (const fn of listeners) fn(current)
}

export function onSelectionChange(fn: (state: FigmaSelectionState) => void): () => void {
  listeners.push(fn)
  return () => {
    const idx = listeners.indexOf(fn)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

export function parseSelectionFromUrl(url: string): Partial<FigmaSelectionState> {
  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/\/(?:file|design)\/([a-zA-Z0-9]+)/)
    const fileKey = match?.[1] ?? null
    const nodeId = parsed.searchParams.get("node-id") ?? parsed.hash.match(/node-id=([^&]+)/)?.[1] ?? null
    return { fileKey, nodeId, url, fileName: null }
  } catch {
    return {}
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/desktop-electron/src/main/figma-selection.ts
git commit -m "feat(desktop): add Figma selection state manager"
```

---

### Task 5: Figma Webview Preload Bridge

Preload script injected into the Figma webview that tracks URL changes and sends selection updates via IPC.

**Files:**

- Create: `packages/desktop-electron/src/preload/figma-bridge.ts`
- Modify: `packages/desktop-electron/src/preload/index.ts`

- [ ] **Step 1: Create the preload bridge script**

```typescript
// packages/desktop-electron/src/preload/figma-bridge.ts

import { ipcRenderer } from "electron"

function extractSelection() {
  const url = window.location.href
  ipcRenderer.send("figma:selection-changed", url)
}

// Track URL hash changes (Figma encodes selection in hash)
window.addEventListener("hashchange", extractSelection)

// Track pushState/replaceState for SPA navigation
const origPushState = history.pushState.bind(history)
const origReplaceState = history.replaceState.bind(history)

history.pushState = (...args) => {
  origPushState(...args)
  extractSelection()
}
history.replaceState = (...args) => {
  origReplaceState(...args)
  extractSelection()
}

// Initial extraction on load
window.addEventListener("DOMContentLoaded", extractSelection)
```

- [ ] **Step 2: Register IPC channel in main preload**

Read `packages/desktop-electron/src/preload/index.ts` and add the figma IPC channel to the contextBridge if needed. The figma-bridge.ts preload is separate — it will be loaded as the webview's preload, not the main window's preload. Note this for wiring in Task 7.

- [ ] **Step 3: Commit**

```bash
git add packages/desktop-electron/src/preload/figma-bridge.ts
git commit -m "feat(desktop): add Figma webview preload bridge for selection tracking"
```

---

### Task 6: MCP Server Implementation

The core MCP server that exposes all figma\_\* tools.

**Files:**

- Create: `packages/desktop-electron/src/main/figma-mcp-server.ts`

- [ ] **Step 1: Create the MCP server with read tools**

```typescript
// packages/desktop-electron/src/main/figma-mcp-server.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { FigmaRestClient } from "./figma-rest-client"
import { getAccessToken, isAuthenticated, startOAuthFlow } from "./figma-oauth"
import { getSelection } from "./figma-selection"

export function createFigmaMcpServer() {
  const client = new FigmaRestClient({ getToken: getAccessToken })

  const server = new McpServer({
    name: "figma-bridge",
    version: "1.0.0",
  })

  server.tool("figma_auth_status", "Check if the user is authenticated with Figma", {}, async () => {
    const authed = isAuthenticated()
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ authenticated: authed }),
        },
      ],
    }
  })

  server.tool("figma_get_selection", "Get the currently selected frame in the Figma webview", {}, async () => {
    const sel = getSelection()
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(sel),
        },
      ],
    }
  })

  server.tool(
    "figma_get_frame",
    "Get the full node tree for a Figma frame",
    {
      fileKey: z.string().describe("Figma file key"),
      nodeId: z.string().describe("Node ID to fetch"),
    },
    async ({ fileKey, nodeId }) => {
      const data = await client.getFileNodes(fileKey, [nodeId])
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
      }
    },
  )

  server.tool(
    "figma_get_variables",
    "Get design tokens/variables from a Figma file",
    {
      fileKey: z.string().describe("Figma file key"),
    },
    async ({ fileKey }) => {
      const data = await client.getVariables(fileKey)
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
      }
    },
  )

  server.tool(
    "figma_get_styles",
    "Get color, text, and effect styles from a Figma file",
    {
      fileKey: z.string().describe("Figma file key"),
    },
    async ({ fileKey }) => {
      const data = await client.getStyles(fileKey)
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
      }
    },
  )

  server.tool(
    "figma_get_image",
    "Get a rendered screenshot/export of a Figma node",
    {
      fileKey: z.string().describe("Figma file key"),
      nodeId: z.string().describe("Node ID to export"),
      scale: z.number().optional().default(2).describe("Export scale (1-4)"),
      format: z.enum(["png", "jpg", "svg", "pdf"]).optional().default("png"),
    },
    async ({ fileKey, nodeId, scale, format }) => {
      const url = await client.getImage(fileKey, nodeId, { scale, format })
      if (!url) return { content: [{ type: "text", text: "No image available" }] }
      return {
        content: [{ type: "text", text: JSON.stringify({ imageUrl: url }) }],
      }
    },
  )

  return server
}

// When run as standalone process (spawned by Electron)
if (process.argv.includes("--stdio")) {
  const server = createFigmaMcpServer()
  const transport = new StdioServerTransport()
  server.connect(transport)
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/desktop-electron/src/main/figma-mcp-server.ts
git commit -m "feat(desktop): implement Figma MCP server with REST API read tools"
```

---

### Task 7: Wire MCP Server into Electron Main Process

Spawn the MCP server on app launch, register IPC handlers for the webview bridge, and write the MCP config file for opencode to discover.

**Files:**

- Modify: `packages/desktop-electron/src/main/index.ts`

- [ ] **Step 1: Read the current main process entry point**

Read `packages/desktop-electron/src/main/index.ts` to understand the initialization flow, especially `initialize()`, `setupServerConnection()`, and where IPC handlers are registered.

- [ ] **Step 2: Add MCP server spawn and IPC wiring**

After the server connection is set up, add:

```typescript
import { fork } from "child_process"
import { ipcMain } from "electron"
import { updateSelection, parseSelectionFromUrl } from "./figma-selection"
import { isAuthenticated, startOAuthFlow, getAccessToken } from "./figma-oauth"

// In initialize() or after setupServerConnection():

// 1. Spawn MCP server as child process
const mcpProcess = fork(path.join(__dirname, "figma-mcp-server.js"), ["--stdio"], {
  stdio: ["pipe", "pipe", "pipe", "ipc"],
})

// 2. Write MCP config for opencode to discover
const mcpConfigPath = path.join(os.homedir(), ".opendesign", ".mcp-figma.json")
fs.writeFileSync(
  mcpConfigPath,
  JSON.stringify({
    "figma-bridge": {
      type: "stdio",
      command: process.execPath,
      args: [path.join(__dirname, "figma-mcp-server.js"), "--stdio"],
    },
  }),
)

// 3. Register IPC handlers for Figma bridge
ipcMain.on("figma:selection-changed", (_event, url: string) => {
  const parsed = parseSelectionFromUrl(url)
  updateSelection(parsed)
})

ipcMain.handle("figma:auth-status", () => isAuthenticated())
ipcMain.handle("figma:start-auth", () => startOAuthFlow())
ipcMain.handle("figma:get-token", () => getAccessToken())
```

- [ ] **Step 3: Wire the figma-bridge preload to the webview**

In the Figma webview setup (in `figma-tab-content.tsx` or wherever the Electron `<webview>` tag is created), ensure the `preload` attribute points to `figma-bridge.ts`:

```typescript
// The <webview> element needs:
// preload={path.join(__dirname, "../preload/figma-bridge.js")}
```

This may require passing the preload path from the main process via IPC or environment variable. Read the current webview setup in `figma-tab-content.tsx` to determine the best approach.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop-electron/src/main/index.ts
git commit -m "feat(desktop): wire Figma MCP server and bridge into Electron lifecycle"
```

---

### Task 8: Figma Status Indicator in Titlebar

Add a clickable status dot to the titlebar showing Figma auth state.

**Files:**

- Modify: `packages/app/src/components/titlebar.tsx`

- [ ] **Step 1: Read the current titlebar implementation**

Read `packages/app/src/components/titlebar.tsx` to find where the existing toggle buttons are (sidebar, chat panel) and the pattern for adding new controls.

- [ ] **Step 2: Add Figma status indicator**

After the existing toggle buttons, add a Figma connection indicator. Use the platform context to only show on Electron:

```tsx
// Inside the titlebar, near the existing toggle buttons:
import { usePlatform } from "../context/platform"

// In the component:
const platform = usePlatform()
const [figmaAuthed, setFigmaAuthed] = createSignal(false)

// Poll auth status periodically (or use IPC event)
onMount(() => {
  if (platform.type !== "electron") return
  const check = async () => {
    const status = await platform.invoke?.("figma:auth-status")
    setFigmaAuthed(!!status)
  }
  check()
  const interval = setInterval(check, 30_000)
  onCleanup(() => clearInterval(interval))
})

// Render (desktop only):
<Show when={platform.type === "electron"}>
  <Tooltip value={figmaAuthed() ? "Figma connected" : "Click to connect Figma"}>
    <button
      class="flex items-center justify-center w-8 h-8"
      onClick={async () => {
        if (!figmaAuthed()) {
          await platform.invoke?.("figma:start-auth")
          setFigmaAuthed(await platform.invoke?.("figma:auth-status"))
        }
      }}
      aria-label="Figma connection status"
    >
      <div
        class={`w-2 h-2 rounded-full ${figmaAuthed() ? "bg-emerald-500" : "bg-red-500"}`}
      />
    </button>
  </Tooltip>
</Show>
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/titlebar.tsx
git commit -m "feat(app): add Figma connection status indicator to titlebar"
```

---

### Task 9: Update Agent Prompts for MCP Tools

Update the design and figma-write agent prompts to reference MCP tools instead of injection bridge.

**Files:**

- Modify: `packages/opencode/src/agent/prompt/design.txt`
- Modify: `packages/opencode/src/agent/prompt/figma-write.txt`

- [ ] **Step 1: Read current prompts**

Read both `packages/opencode/src/agent/prompt/design.txt` and `packages/opencode/src/agent/prompt/figma-write.txt`.

- [ ] **Step 2: Update design.txt**

Add a section about available MCP tools:

```
## Figma Tools Available

You have access to these MCP tools for reading and modifying Figma:
- figma_get_selection — get the currently selected frame
- figma_get_frame — get the full node tree for a frame
- figma_get_variables — get design tokens/variables
- figma_get_styles — get color, text, and effect styles
- figma_get_image — get a rendered screenshot of a node

Always start by calling figma_get_selection to understand what the user is looking at.
Use figma_get_variables to pull design tokens before making any design decisions.
```

- [ ] **Step 3: Update figma-write.txt**

Replace references to "webview injection bridge" with MCP tool references. The figma-write agent should now use the same MCP tools as the design agent for mutations.

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/agent/prompt/design.txt packages/opencode/src/agent/prompt/figma-write.txt
git commit -m "feat(opencode): update agent prompts to reference Figma MCP tools"
```

---

### Task 10: Verify End-to-End

- [ ] **Step 1: Type check all packages**

```bash
bun turbo typecheck
```

Expected: No type errors in desktop-electron, opencode, or app packages.

- [ ] **Step 2: Run existing tests**

```bash
cd packages/opencode && bun test
```

Expected: All existing tests pass (no regressions).

- [ ] **Step 3: Manual verification checklist**

Run the desktop app and verify:

- [ ] Figma status dot appears in titlebar (red when not authenticated)
- [ ] Clicking the dot opens OAuth popup
- [ ] After auth, dot turns green
- [ ] Opening Figma tab and selecting a frame updates selection state
- [ ] MCP server is running (check process list)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(desktop): resolve typecheck and integration issues"
```
