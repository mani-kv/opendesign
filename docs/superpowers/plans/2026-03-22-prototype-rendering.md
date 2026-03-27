# Prototype Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SVG canvas agent sandbox with live Sandpack previews. Each scenario agent writes React + CSS to its git branch; the agent sandbox panel renders a Sandpack preview of the selected agent's files via a file state API.

**Architecture:** Server exposes file state API endpoints that read from agent branch working directories. Frontend fetches files and feeds them into a Sandpack iframe. An SSE watch endpoint streams live file changes for real-time preview updates. Design tokens from Figma are injected as CSS variables into the project's main branch before agents fork.

**Tech Stack:** Hono (server routes), Sandpack (iframe-based React preview), SSE (live file updates), SolidJS (frontend)

**Spec:** `docs/superpowers/specs/2026-03-22-figma-bridge-and-prototype-rendering-design.md`
**Depends on:** `docs/superpowers/plans/2026-03-22-figma-bridge-mcp.md` (for design token extraction via `figma_get_variables`)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/opencode/src/server/routes/agent-files.ts` | Create | File state API: GET /agent/:agentId/files, GET /agent/:agentId/files/:path, SSE watch |
| `packages/opencode/src/server/server.ts` | Modify | Mount agent-files routes |
| `packages/app/src/pages/session/agent-sandbox-tab-content.tsx` | Modify | Replace SVG canvas with Sandpack preview |
| `packages/app/src/pages/session/agent-sandbox/sandpack-srcdoc.ts` | Rewrite | Real Sandpack HTML template with React runtime |
| `packages/app/src/pages/session/agent-sandbox/sandpack-preview.tsx` | Create | Sandpack preview component (iframe + file loading) |
| `packages/app/src/pages/session/agent-sandbox/use-agent-files.ts` | Create | Hook to fetch + subscribe to agent branch files |
| `packages/opencode/src/agent/agent.ts` | Modify | Add token-setup subagent definition |
| `packages/opencode/src/agent/prompt/token-setup.txt` | Create | Prompt for the token injection subagent |

---

### Task 1: File State API — GET Endpoints

Expose agent branch file contents via HTTP.

**Files:**
- Create: `packages/opencode/src/server/routes/agent-files.ts`
- Modify: `packages/opencode/src/server/server.ts`

- [ ] **Step 1: Read the server route pattern**

Read `packages/opencode/src/server/server.ts` to understand how routes are composed (lazy loading, middleware pattern). Also read an existing route file (e.g., `packages/opencode/src/server/routes/mcp.ts`) for the pattern.

- [ ] **Step 2: Create agent-files route module**

```typescript
// packages/opencode/src/server/routes/agent-files.ts

import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { Instance } from "../../project/instance"
import fs from "fs/promises"
import path from "path"

const app = new Hono()

// Helper: resolve agent working directory
function agentDir(projectDir: string, agentId: string) {
  return path.join(projectDir, "agents", agentId)
}

// Helper: recursively list files
async function listFiles(dir: string, base = ""): Promise<Array<{ path: string; size: number }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const results: Array<{ path: string; size: number }> = []
  for (const entry of entries) {
    const rel = path.join(base, entry.name)
    if (entry.name === "node_modules" || entry.name === ".git") continue
    if (entry.isDirectory()) {
      results.push(...(await listFiles(path.join(dir, entry.name), rel)))
    } else {
      const stat = await fs.stat(path.join(dir, entry.name))
      results.push({ path: rel, size: stat.size })
    }
  }
  return results
}

// GET /agent/:agentId/files — file tree + contents
app.get("/:agentId/files", async (c) => {
  const agentId = c.req.param("agentId")
  const dir = agentDir(Instance.directory(), agentId)
  try {
    await fs.access(dir)
  } catch {
    return c.json({ error: "agent_not_found" }, 404)
  }
  const files = await listFiles(dir)
  const result: Record<string, { content: string }> = {}
  for (const f of files) {
    if (f.size > 100_000) continue // skip large files
    try {
      const content = await fs.readFile(path.join(dir, f.path), "utf-8")
      result[`/${f.path}`] = { content }
    } catch {
      // skip binary files
    }
  }
  return c.json({ files: result })
})

// GET /agent/:agentId/files/:path — single file
app.get("/:agentId/files/*", async (c) => {
  const agentId = c.req.param("agentId")
  const filePath = c.req.path.replace(`/${agentId}/files/`, "")
  const fullPath = path.join(agentDir(Instance.directory(), agentId), filePath)
  try {
    const content = await fs.readFile(fullPath, "utf-8")
    return c.json({ path: filePath, content })
  } catch {
    return c.json({ error: "file_not_found" }, 404)
  }
})

export default app
```

- [ ] **Step 3: Mount routes in server.ts**

In the server's `createApp()` function, add the agent files route alongside existing routes:

```typescript
import AgentFilesRoutes from "./routes/agent-files"
// In createApp():
.route("/agent", AgentFilesRoutes)
```

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/server/routes/agent-files.ts packages/opencode/src/server/server.ts
git commit -m "feat(opencode): add file state API for agent branch files"
```

---

### Task 2: File State API — SSE Watch Endpoint

Stream real-time file change events as agents edit files.

**Files:**
- Modify: `packages/opencode/src/server/routes/agent-files.ts`

- [ ] **Step 1: Add SSE watch endpoint**

Add to the agent-files route module:

```typescript
// SSE /agent/:agentId/watch — real-time file changes
app.get("/:agentId/watch", async (c) => {
  const agentId = c.req.param("agentId")
  const dir = agentDir(Instance.directory(), agentId)

  return streamSSE(c, async (stream) => {
    // Send initial connected event
    await stream.writeSSE({
      data: JSON.stringify({ type: "connected", agentId }),
    })

    // Watch for file changes using fs.watch (recursive)
    let watcher: fs.FSWatcher | null = null
    try {
      const fsSync = await import("fs")
      watcher = fsSync.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename || filename.includes("node_modules") || filename.includes(".git")) return
        stream.writeSSE({
          data: JSON.stringify({
            type: "file.changed",
            event: eventType,
            path: `/${filename}`,
          }),
        })
      })
    } catch {
      // fs.watch may not support recursive on all platforms
    }

    // Heartbeat every 10s
    const heartbeat = setInterval(() => {
      stream.writeSSE({ data: JSON.stringify({ type: "heartbeat" }) })
    }, 10_000)

    // Cleanup on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeat)
      watcher?.close()
    })
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/opencode/src/server/routes/agent-files.ts
git commit -m "feat(opencode): add SSE watch endpoint for live agent file changes"
```

---

### Task 3: Sandpack HTML Template

Replace the hello-world template with a real Sandpack-style React runtime.

**Files:**
- Rewrite: `packages/app/src/pages/session/agent-sandbox/sandpack-srcdoc.ts`

- [ ] **Step 1: Read the current sandpack-srcdoc.ts**

Read `packages/app/src/pages/session/agent-sandbox/sandpack-srcdoc.ts` to understand the current template structure and how it's consumed.

- [ ] **Step 2: Rewrite with React runtime**

```typescript
// packages/app/src/pages/session/agent-sandbox/sandpack-srcdoc.ts

export function createSandpackSrcdoc(files: Record<string, string>, entry = "/src/App.js"): string {
  const filesJson = JSON.stringify(files)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #root { min-height: 100vh; }
    .sandpack-error {
      padding: 16px;
      background: #fee2e2;
      color: #991b1b;
      font-family: monospace;
      font-size: 13px;
      white-space: pre-wrap;
      border-left: 4px solid #ef4444;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script>
    const FILES = ${filesJson};
    const ENTRY = ${JSON.stringify(entry)};

    // Simple module system
    const moduleCache = {};
    function require(name) {
      if (name === "react") return React;
      if (name === "react-dom") return ReactDOM;
      if (name === "react-dom/client") return ReactDOM;
      if (moduleCache[name]) return moduleCache[name];
      // Try resolving as a local file
      const resolved = resolveFile(name);
      if (resolved) {
        const mod = { exports: {} };
        moduleCache[name] = mod.exports;
        executeModule(resolved, mod);
        moduleCache[name] = mod.exports;
        return mod.exports;
      }
      console.warn("Module not found:", name);
      return {};
    }

    function resolveFile(name) {
      const candidates = [name, name + ".js", name + ".jsx", name + ".ts", name + ".tsx", name + "/index.js", name + "/index.jsx"];
      for (const c of candidates) {
        if (FILES[c]) return c;
      }
      return null;
    }

    function executeModule(path, mod) {
      const code = FILES[path];
      if (!code) return;

      // Inject CSS files as style tags
      if (path.endsWith(".css")) {
        const style = document.createElement("style");
        style.textContent = code;
        style.setAttribute("data-file", path);
        document.head.appendChild(style);
        return;
      }

      try {
        const transformed = Babel.transform(code, {
          presets: ["react"],
          filename: path,
        }).code;
        const fn = new Function("require", "module", "exports", transformed);
        fn(require, mod, mod.exports);
      } catch (err) {
        showError(err, path);
      }
    }

    function showError(err, file) {
      const root = document.getElementById("root");
      root.innerHTML = '<div class="sandpack-error">' +
        (file ? "Error in " + file + ":\\n\\n" : "") +
        (err.message || String(err)) + "</div>";
    }

    // Load CSS files first (tokens, etc)
    Object.keys(FILES).filter(f => f.endsWith(".css")).forEach(f => {
      const style = document.createElement("style");
      style.textContent = FILES[f];
      style.setAttribute("data-file", f);
      document.head.appendChild(style);
    });

    // Execute entry point
    try {
      const entryMod = { exports: {} };
      executeModule(ENTRY, entryMod);
      const App = entryMod.exports.default || entryMod.exports;
      if (App && typeof App === "function") {
        const root = ReactDOM.createRoot(document.getElementById("root"));
        root.render(React.createElement(App));
      }
    } catch (err) {
      showError(err);
    }

    // Listen for file updates from parent
    window.addEventListener("message", (e) => {
      if (e.data?.type === "sandpack:update-files") {
        // Reload with new files
        Object.assign(FILES, e.data.files);
        location.reload();
      }
    });
  </script>
</body>
</html>`
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/session/agent-sandbox/sandpack-srcdoc.ts
git commit -m "feat(app): rewrite Sandpack template with React runtime and module system"
```

---

### Task 4: Agent Files Hook

SolidJS hook that fetches agent branch files and subscribes to SSE for live updates.

**Files:**
- Create: `packages/app/src/pages/session/agent-sandbox/use-agent-files.ts`

- [ ] **Step 1: Create the hook**

```typescript
// packages/app/src/pages/session/agent-sandbox/use-agent-files.ts

import { createSignal, createEffect, onCleanup } from "solid-js"
import { useSDK } from "../../../context/sdk"

export interface AgentFiles {
  files: Record<string, string>
  loading: boolean
  error: string | null
}

export function useAgentFiles(agentId: () => string | null) {
  const sdk = useSDK()
  const [files, setFiles] = createSignal<Record<string, string>>({})
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  createEffect(() => {
    const id = agentId()
    if (!id) {
      setFiles({})
      return
    }

    setLoading(true)
    setError(null)

    // Fetch initial files
    const fetchFiles = async () => {
      try {
        const res = await fetch(`${sdk.baseUrl}/agent/${id}/files`)
        if (!res.ok) throw new Error(`Failed to fetch files: ${res.status}`)
        const data = await res.json()
        const flat: Record<string, string> = {}
        for (const [path, info] of Object.entries(data.files as Record<string, { content: string }>)) {
          flat[path] = info.content
        }
        setFiles(flat)
        setLoading(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error")
        setLoading(false)
      }
    }

    fetchFiles()

    // Subscribe to SSE for live updates
    let eventSource: EventSource | null = null
    try {
      eventSource = new EventSource(`${sdk.baseUrl}/agent/${id}/watch`)
      eventSource.onmessage = async (event) => {
        const data = JSON.parse(event.data)
        if (data.type === "file.changed") {
          // Re-fetch the changed file
          try {
            const res = await fetch(`${sdk.baseUrl}/agent/${id}/files${data.path}`)
            if (res.ok) {
              const fileData = await res.json()
              setFiles((prev) => ({ ...prev, [data.path]: fileData.content }))
            }
          } catch {
            // Ignore individual file fetch failures
          }
        }
      }
      eventSource.onerror = () => {
        // SSE reconnects automatically
      }
    } catch {
      // SSE not available, rely on polling
    }

    onCleanup(() => {
      eventSource?.close()
    })
  })

  return { files, loading, error }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/pages/session/agent-sandbox/use-agent-files.ts
git commit -m "feat(app): add useAgentFiles hook for fetching and subscribing to agent files"
```

---

### Task 5: Sandpack Preview Component

Component that takes agent files and renders them in a Sandpack iframe.

**Files:**
- Create: `packages/app/src/pages/session/agent-sandbox/sandpack-preview.tsx`

- [ ] **Step 1: Create the preview component**

```tsx
// packages/app/src/pages/session/agent-sandbox/sandpack-preview.tsx

import { createMemo, Show } from "solid-js"
import { createSandpackSrcdoc } from "./sandpack-srcdoc"

interface SandpackPreviewProps {
  files: Record<string, string>
  loading: boolean
  error: string | null
}

export function SandpackPreview(props: SandpackPreviewProps) {
  const srcdoc = createMemo(() => {
    const f = props.files
    if (!f || Object.keys(f).length === 0) return null
    return createSandpackSrcdoc(f)
  })

  return (
    <div class="flex-1 relative w-full h-full bg-surface-primary">
      <Show when={props.loading}>
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="text-text-dimmed-extra text-sm">Loading preview...</div>
        </div>
      </Show>
      <Show when={props.error}>
        <div class="absolute inset-0 flex items-center justify-center p-4">
          <div class="text-danger text-sm font-mono">{props.error}</div>
        </div>
      </Show>
      <Show when={srcdoc()}>
        <iframe
          srcdoc={srcdoc()!}
          sandbox="allow-scripts allow-same-origin"
          class="w-full h-full border-0"
          title="Prototype preview"
        />
      </Show>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/pages/session/agent-sandbox/sandpack-preview.tsx
git commit -m "feat(app): add SandpackPreview component for rendering agent prototypes"
```

---

### Task 6: Replace SVG Canvas with Sandpack in Agent Sandbox

Wire everything together: agent selection → file fetch → Sandpack preview.

**Files:**
- Modify: `packages/app/src/pages/session/agent-sandbox-tab-content.tsx`

- [ ] **Step 1: Read the current agent-sandbox-tab-content.tsx**

Read `packages/app/src/pages/session/agent-sandbox-tab-content.tsx` to understand the current SVG canvas implementation and how agent selection works.

- [ ] **Step 2: Add Sandpack preview alongside existing canvas**

Keep the existing agent list/node rendering but replace the SVG canvas area with the Sandpack preview. When an agent is selected, show its live preview instead of the SVG node:

```tsx
import { useAgentFiles } from "./agent-sandbox/use-agent-files"
import { SandpackPreview } from "./agent-sandbox/sandpack-preview"

// In the component, alongside existing agent selection logic:
const [selectedAgentId, setSelectedAgentId] = createSignal<string | null>(null)
const { files, loading, error } = useAgentFiles(selectedAgentId)

// Replace the SVG canvas section with:
<Show
  when={selectedAgentId()}
  fallback={/* existing SVG canvas or empty state */}
>
  <SandpackPreview
    files={files()}
    loading={loading()}
    error={error()}
  />
</Show>
```

The exact integration depends on the current component structure — read the file first, then adapt. The key change is: clicking an agent node sets `selectedAgentId`, which triggers file fetch and Sandpack rendering.

- [ ] **Step 3: Add "View Code" toggle**

Add a toggle button in the agent sandbox header that switches between preview and source view:

```tsx
const [viewMode, setViewMode] = createSignal<"preview" | "code">("preview")

// Toggle button:
<button onClick={() => setViewMode(v => v === "preview" ? "code" : "preview")}>
  {viewMode() === "preview" ? "View Code" : "View Preview"}
</button>

// Conditional render:
<Show when={viewMode() === "preview"} fallback={<CodeView files={files()} />}>
  <SandpackPreview files={files()} loading={loading()} error={error()} />
</Show>
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/pages/session/agent-sandbox-tab-content.tsx
git commit -m "feat(app): replace SVG canvas with Sandpack preview in agent sandbox"
```

---

### Task 7: Token Setup Subagent

A lightweight subagent that pulls design tokens from Figma and writes `tokens.css` to the project's main branch.

**Files:**
- Create: `packages/opencode/src/agent/prompt/token-setup.txt`
- Modify: `packages/opencode/src/agent/agent.ts`

- [ ] **Step 1: Create the token-setup prompt**

```
You are a setup agent responsible for extracting design tokens from Figma and writing them as CSS custom properties.

Your task:
1. Call figma_get_variables to retrieve all design tokens from the selected Figma file
2. Convert the tokens into a CSS file using CSS custom properties
3. Write the file to /src/tokens.css

Token format:
:root {
  /* Colors */
  --color-primary: #value;
  --color-secondary: #value;

  /* Spacing */
  --spacing-xs: Xpx;
  --spacing-sm: Xpx;

  /* Typography */
  --font-size-sm: Xpx;
  --font-size-base: Xpx;

  /* Radius */
  --radius-sm: Xpx;
  --radius-md: Xpx;

  /* Shadows */
  --shadow-sm: ...;
}

Map Figma variable names to kebab-case CSS property names. Group by category.
Only include variables that have resolved values. Skip draft or unpublished variables.
```

- [ ] **Step 2: Read agent.ts and add the token-setup subagent**

Read `packages/opencode/src/agent/agent.ts` to find the pattern for subagent definitions (look at `scenario`, `explore`, `research` for the pattern). Add:

```typescript
import PROMPT_TOKEN_SETUP from "./prompt/token-setup.txt"

// In the agents object, after figma-write:
"token-setup": {
  name: "token-setup",
  label: "Token Setup",
  description: "Extracts design tokens from Figma and writes tokens.css",
  mode: "subagent" as const,
  prompt: PROMPT_TOKEN_SETUP,
  permission: {
    "*": "deny" as const,
    write: "allow" as const,
    read: "allow" as const,
    edit: "allow" as const,
  },
  options: {},
},
```

- [ ] **Step 3: Commit**

```bash
git add packages/opencode/src/agent/prompt/token-setup.txt packages/opencode/src/agent/agent.ts
git commit -m "feat(opencode): add token-setup subagent for Figma token extraction"
```

---

### Task 8: Verify End-to-End

- [ ] **Step 1: Type check all packages**

```bash
bun turbo typecheck
```

Expected: No type errors.

- [ ] **Step 2: Run existing tests**

```bash
cd packages/opencode && bun test
```

Expected: All existing tests pass.

- [ ] **Step 3: Manual verification checklist**

Run the app and verify:
- [ ] Agent sandbox panel shows when agents are present
- [ ] Selecting an agent loads its branch files (if branch exists)
- [ ] Sandpack preview renders React + CSS code
- [ ] "View Code" toggle switches between preview and source
- [ ] Live file updates stream via SSE (if agent is actively writing)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(app): resolve typecheck and integration issues for prototype rendering"
```
