# Figma Bridge & Prototype Rendering Design

## Overview

Two interconnected systems that enable the core OpenDesign workflow: users select Figma frames, describe what they want, and get live interactive prototypes.

1. **Figma Bridge** — Electron-hosted MCP server wrapping the Figma REST API (reads) and Plugin API via figma-console (mutations), giving agents structured access to design data
2. **Prototype Rendering** — Branch-based Sandpack integration where scenario agents write React + CSS code that renders as live previews in the agent sandbox panel

---

## System 1: Figma Bridge MCP Server

### Architecture

```
User selects frame in Figma webview
        |
Bridge JS (preload) --> sends selection URL via IPC
        |
Electron main process --> stores current selection context
        |
Agent calls MCP tool (e.g. figma_get_frame)
        |
Electron MCP server --> Figma REST API (reads) or figma-console Plugin API (mutations)
        |
Response --> agent has structured frame data
```

### Components

#### 1. Electron MCP Server

**Location:** `packages/desktop-electron/src/mcp/figma-server.ts` (new directory, to be created)

- Stdio-based MCP server spawned by Electron main process as a child process
- Opencode connects via MCP config: on desktop app launch, Electron writes a temporary MCP config file (e.g., `~/.opendesign/.mcp-figma.json`) with the stdio command. Opencode reads this on startup or is notified via the existing config system to connect.
- Holds OAuth token in memory (obtained via Figma OAuth flow)

#### 2. MCP Tools

**Read tools (via Figma REST API):**

| Tool                  | Purpose                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `figma_auth_status`   | Check if user is authenticated                                               |
| `figma_get_selection` | Return current selected frame URL + basic metadata (from Electron IPC state) |
| `figma_get_frame`     | Full node tree for a frame (via REST API `/v1/files/:key/nodes`)             |
| `figma_get_variables` | Design tokens/variables from the file (via REST API)                         |
| `figma_get_styles`    | Color, text, effect styles from the file (via REST API)                      |
| `figma_get_image`     | Rendered screenshot of a node (via REST API image export)                    |

**Write tools (via figma-console MCP / Plugin API):**

| Tool                     | Purpose                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `figma_create_component` | Create/modify components (proxied to figma-console's `figma_execute`) |
| `figma_update_node`      | Modify node properties (proxied to figma-console's `figma_execute`)   |

The Figma REST API is primarily read-only. For mutations (creating components, modifying node properties), the MCP server proxies requests through the existing `figma-console` MCP server which has Plugin API access via `figma_execute`. The Electron MCP server translates high-level mutation requests into Plugin API code and delegates to figma-console.

#### 3. Bridge JS

**Location:** `packages/desktop-electron/src/preload/figma-bridge.ts` (new file)

- Preload script for the Figma `<webview>` element
- Listens for URL hash changes (Figma encodes selection in the URL fragment)
- Sends selection URL + file key to Electron main process via `contextBridge` / IPC
- Minimal scope: selection tracking only, not data extraction

Note: The existing `figmaInjectionScript()` in `packages/opendesign/src/figma/bridge.ts` is a placeholder with a no-op MutationObserver. The preload approach replaces this entirely — preload scripts are more reliable than injection for Electron webviews.

#### 4. OAuth Flow

- First time: Electron opens Figma OAuth in a popup window (`https://www.figma.com/oauth`)
- User authorizes, token stored in Electron's `safeStorage`
- Token has expiry; MCP server checks expiry before each REST call and refreshes via the refresh token grant if needed
- If refresh fails: MCP tools return an `auth_required` error; toolbar indicator turns red
- Single auth covers all Figma workspaces

**Toolbar indicator:** The app titlebar shows a Figma connection status icon:

- Green dot: authenticated and connected
- Red dot: token expired or not authenticated
- Clicking the indicator when red opens the OAuth flow to re-authenticate

#### 5. Design Agent Integration

- Design agent calls `figma_*` MCP tools like any other tool — MCP tools are discovered dynamically, no explicit permission entries needed
- Agent reads current selection context as starting point via `figma_get_selection`
- For reads (frame data, tokens, styles, images): REST API via the Electron MCP server
- For mutations (create component, update node): proxied to figma-console Plugin API
- Figma webview auto-reflects Plugin API changes (no manual refresh needed)

#### 6. Figma-Write Agent Migration

The existing `figma-write` subagent (described as using "webview injection bridge") is superseded by the new MCP-based approach. During implementation:

- Update `figma-write` agent to use MCP tools instead of the injection bridge
- Or merge its responsibilities into the `design` agent and deprecate `figma-write`

#### 7. Error Handling

| Scenario                        | Behavior                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Figma REST API rate limit (429) | MCP tool retries with exponential backoff (max 3 attempts), then returns error |
| OAuth token expired             | Auto-refresh via refresh token. If refresh fails, return `auth_required` error |
| Network failure                 | MCP tool returns error with message; agent can retry or inform user            |
| Invalid frame/file key          | Return structured error with details; agent handles gracefully                 |
| figma-console not connected     | Mutation tools return `unavailable` error; read tools still work               |

### Existing Code to Build On

| File                                                   | Status    | What exists                                                                                     |
| ------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------- |
| `packages/opendesign/src/figma/bridge.ts`              | Partial   | Message types, validation. Injection script is placeholder — to be replaced by preload approach |
| `packages/opendesign/src/types/figma.ts`               | Usable    | FigmaFrame, FigmaSelection, FigmaTokenRef types                                                 |
| `packages/app/src/pages/session/figma-tab-content.tsx` | Usable    | Webview rendering (Electron `<webview>` with partition)                                         |
| `packages/app/src/utils/figma.ts`                      | Usable    | URL parsing, embed URL construction                                                             |
| `packages/opencode/src/agent/prompt/design.txt`        | Usable    | Design agent prompt                                                                             |
| `packages/opencode/src/agent/prompt/figma-write.txt`   | To update | References injection bridge — needs update for MCP approach                                     |
| `packages/desktop-electron/src/mcp/`                   | New       | Directory to be created for the MCP server                                                      |

---

## System 2: Prototype Rendering

### Architecture

```
User selects Prototype mode --> describes request (optionally selects Figma frame)
        |
Orchestrator agent reads Figma frame (via MCP) + user prompt
        |
Decomposes into scenarios --> dispatches scenario agents
        |
Each scenario agent:
  1. Gets its own git branch (agent/{agentId})
  2. Writes React + CSS files using edit/write tools
  3. Commits to its branch
        |
Server file-state API exposes branch file tree
        |
Agent sandbox panel: user selects agent --> Sandpack loads that branch's files
```

Note: The `prototype` agent in code is the **orchestrator** — it decomposes and dispatches. The `scenario` agents do the actual code generation. "Prototype mode" is the user-facing label.

### Components

#### 1. File State API

New endpoints in `packages/opencode/src/server/server.ts`:

| Endpoint                          | Purpose                                         |
| --------------------------------- | ----------------------------------------------- |
| `GET /agent/:agentId/files`       | Returns file tree + contents for agent's branch |
| `GET /agent/:agentId/files/:path` | Single file content                             |
| `SSE /agent/:agentId/watch`       | Real-time file change events as agent edits     |

These endpoints use the existing server middleware for directory scoping. The agent's working directory already exists per the architecture doc: branch checkout at `~/.opendesign/projects/{projectId}/agents/{agentId}/`. The API reads from disk. Authentication follows the same pattern as existing session/message endpoints.

#### 2. Sandpack Runtime

**Location:** `packages/app/src/pages/session/agent-sandbox-tab-content.tsx` (existing file, to be modified)

- Replaces current SVG canvas visualization in the agent sandbox panel
- User selects agent in agents panel --> fetch files from API --> feed into Sandpack `files` prop
- Subscribe to watch SSE endpoint for live updates as agent writes code
- Lightweight config: React + CSS only, design tokens injected as CSS variables file
- Single Sandpack instance, swapped when agent selection changes

Note: The architecture doc (Section "Sandpack Integration") shows one Sandpack per agent (S1, S2, S3). In practice, we render one at a time and swap on selection — the git branches hold the persistent state, not the Sandpack instances. This is a UI optimization; the architecture's data model (branch per agent) is unchanged.

#### 3. Design Token Injection

- The orchestrator agent dispatches a setup step before forking scenario agents
- A utility subagent (or the orchestrator itself with temporary write permission) pulls design tokens from Figma via `figma_get_variables`
- Converts to `tokens.css` with CSS custom properties
- Commits to project's `main` branch
- All scenario agents inherit tokens when they fork their branches

Note: The `prototype` (orchestrator) agent currently has `write: "deny"`. Token injection can be handled by: (a) dispatching a short-lived setup subagent with write permission, or (b) granting the orchestrator write permission scoped to `tokens.css` only. Approach (a) is cleaner.

#### 4. Agent Sandbox Panel Updates

- Agent list remains as-is (shows dispatched scenario agents)
- Selecting an agent swaps the Sandpack preview
- Status indicators: spinner while working, checkmark when done, error on failure
- "View Code" toggle to switch between preview and source view

#### 5. Sandpack Configuration

```
Template: react (create-react-app base)
Entry: /src/App.js
Dependencies: react, react-dom (minimal)
Custom files: /src/tokens.css (design tokens), agent-generated files
```

No Tailwind, no component library. Plain React + CSS. Agent matches Figma design pixel-for-pixel using design tokens.

#### 6. Error Handling

| Scenario                               | Behavior                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| Agent-generated code has syntax errors | Sandpack shows error overlay with stack trace; user sees the error in preview |
| Missing imports / runtime exceptions   | Sandpack error boundary catches; preview shows error message                  |
| Agent fails mid-task                   | Agent status shows error indicator; branch preserves partial work             |
| File state API unavailable             | Preview shows "Loading..." skeleton; retries on reconnect                     |

#### 7. Branch Lifecycle

Agents commit to their branches but **never auto-merge to main**. Branches remain independent until the user explicitly triggers a merge via the "Merge" feature (future work — see below).

| Event                     | Action                                                    |
| ------------------------- | --------------------------------------------------------- |
| Scenario agent dispatched | Branch `agent/{agentId}` created from `main`              |
| Agent completes           | Branch committed, status updated to "done". Branch stays. |
| Agent fails               | Branch preserves partial work; user can retry or dismiss  |
| User dismisses agent      | Branch deleted, working directory cleaned up              |
| Session ended             | All branches retained for future sessions                 |

#### 8. Merge Flow (Future Feature)

Not part of this implementation, but the branch model is designed to support it:

- User selects 2+ agents in the agents panel → clicks "Merge"
- System merges the selected branches together into a preview branch
- Visual diff view shows combined result with side-by-side Sandpack previews
- User resolves conflicts visually ("keep left" / "take right")
- Approved merge result goes to `main`

This is why agents stay on branches — it preserves the ability to compare, combine, and selectively merge agent outputs.

### Existing Code to Build On

| File                                                               | Status     | What exists                                                 |
| ------------------------------------------------------------------ | ---------- | ----------------------------------------------------------- |
| `packages/opencode/src/agent/agent.ts`                             | Usable     | Orchestrator (`prototype`) and `scenario` agent definitions |
| `packages/opencode/src/agent/prompt/agent.txt`                     | Usable     | Orchestrator prompt (decompose + dispatch)                  |
| `packages/opencode/src/agent/prompt/scenario.txt`                  | Usable     | Scenario agent prompt (React + tokens)                      |
| `packages/app/src/pages/session/agent-sandbox-tab-content.tsx`     | To modify  | Current SVG canvas → will host Sandpack                     |
| `packages/app/src/pages/session/agent-sandbox/agent-node-card.tsx` | To modify  | Agent node rendering in sandbox                             |
| `packages/app/src/pages/session/agent-sandbox/sandpack-srcdoc.ts`  | To replace | Hello-world template → real Sandpack config                 |
| `docs/architecture.md`                                             | Reference  | Git branch model, agent lifecycle, merge flow               |

---

## Example End-to-End Flow

1. User has a Figma frame selected showing a login form
2. User picks Prototype mode, types: "Prototype this login form with validation"
3. Orchestrator agent calls `figma_get_frame` + `figma_get_image` via MCP to understand the design
4. Orchestrator dispatches a setup subagent that pulls tokens via `figma_get_variables` and writes `tokens.css` to main
5. Orchestrator decomposes into: Scenario A (form layout + styling), Scenario B (validation + error states)
6. Both scenario agents fork from main (inheriting `tokens.css`), write React components, commit
7. File state API streams updates; Sandpack preview updates live for the selected agent
8. User sees both agents in the agents panel, clicks each to preview
9. Agents stay on their branches — user can later select and merge via visual diff (future feature)

---

## Constraints & Decisions

| Decision                                     | Rationale                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Electron-only for Figma bridge               | Webview requires Electron; web client has no Figma tab                                               |
| MCP over custom protocol                     | Agents already use MCP tools; no new patterns needed                                                 |
| REST API for reads, Plugin API for mutations | REST API is read-only for most operations; Plugin API (via figma-console) handles structural changes |
| Branch-based file storage                    | Matches architecture.md; enables merge flow and visual conflict resolution                           |
| Plain React + CSS                            | Universal, no framework lock-in; focus is visual fidelity not production code                        |
| Single Sandpack instance (swapped)           | Memory efficient; one preview at a time per user's preference. Branch state is persistent.           |
| Orchestrator delegates token writing         | Keeps orchestrator read-only; setup subagent handles the one-time write to main                      |
| No auto-merge to main                        | Agents stay on branches; enables future multi-select merge with visual diff                          |
