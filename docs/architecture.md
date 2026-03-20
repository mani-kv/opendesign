# OpenDesign Architecture & Data Flow

OpenDesign is a fork of OpenCode, evolved into a separate product. It reuses much of OpenCode's structure (server, SDK, tooling) but introduces a different model: **directory lives at the agent level, not the project level**. Projects are logical containers; agents own filesystem context (via Git branches and Sandpack).

---

## OpenDesign vs OpenCode

| Aspect | OpenCode | OpenDesign |
|--------|----------|------------|
| **Project** | Has a worktree (directory on disk) | No directory; logical container with ID |
| **Scope of work** | One directory per project | One directory per agent |
| **Execution** | Tools run in project directory | Tools run in agent's branch checkout |
| **Analogy** | 1 OpenCode = 1 project | 1 OpenDesign project = several OpenCodes in parallel (one per agent) |

---

## OpenDesign Core Model

```mermaid
flowchart TB
    subgraph Project["Project"]
        direction TB
        Repo["Git Repo (1 per project)"]
        Main["main branch"]
        Repo --> Main
    end

    subgraph Agents["Agents"]
        A1["Agent A (concept 1)"]
        A2["Agent B (concept 2)"]
        A3["Agent C (concept 3)"]
    end

    subgraph Branches["Branches"]
        B1["agent-a"]
        B2["agent-b"]
        B3["agent-c"]
    end

    subgraph Sandpacks["Sandpack (Canvas)"]
        S1["Sandpack A"]
        S2["Sandpack B"]
        S3["Sandpack C"]
    end

    Project --> Agents
    A1 --> B1
    A2 --> B2
    A3 --> B3
    B1 --> S1
    B2 --> S2
    B3 --> S3
    Main -.->|"approve → merge"| B1
    Main -.->|"approve → merge"| B2
    Main -.->|"approve → merge"| B3
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Project** | Logical container. One Git repo. No directory at project level. Identified by `projectId`. |
| **Agent** | Spawned per concept. Gets: (1) a branch in the project repo, (2) a working directory (branch checkout), (3) a Sandpack instance on the canvas, (4) tools that operate on its directory. |
| **Concept** | A distinct sub-task from the user request. Orchestrator infers concepts and spawns agents. |
| **Canvas** | UI surface displaying multiple Sandpack containers—one per active agent. |
| **Session** | Conversation context. Scoped to project (and agents). No directory at session level. |

---

## Git Model (OpenDesign)

- **1 repo per project** — all agents share the same Git repository. No worktrees.
- **1 branch per agent** — each agent works on its own branch (e.g. `agent/{agentId}`).
- **Same file tree** — all agents work on the same file structure; branches differ in content.
- **Auto-commit** — when an agent completes a task, changes are committed to its branch.
- **Rollback** — reverting an agent's work = resetting its branch to a previous commit.
- **Merge** — user approves agent results → that agent's branch merges into `main`.

---

## Merge Flow & Conflict Handling

- **Approval → merge**: User approves an agent's work → that branch merges into `main`. When all approvals are done, `main` is the unified prototype.
- **1 repo required**: Multiple repos per agent would make "unified prototype" impossible; one repo is necessary.
- **Sequential approval**: Merge one agent at a time. Each merge is against current `main`. Conflicts are resolved before the next approval.
- **Orchestrator reduces conflicts**: Scope concepts and route agents so they tend to touch different files (e.g. validation vs layout). Reduces overlap; conflicts still possible.
- **No Git worktrees**: Single checkout per agent is sufficient. (Note: the app uses "worktree" in session state to refer to the agent's working directory, not the Git worktree feature.)

### Visual Conflict Resolution (Designer-Focused)

Designers should resolve conflicts by **outcome**, not by editing code. Avoid raw code diffs and merge markers.

- **Side-by-side Sandpack previews**: When a merge conflict occurs, show two Sandpack instances—left = `main` (current prototype), right = agent branch (incoming changes). User sees the rendered behavior of both versions.
- **Choose outcome**: User selects "keep left" or "take right" based on visual comparison. System maps that to file-level resolution (ours vs theirs). No code-editing required.
- **Behavior over code**: Example—one version has an icon, the other removes it. User sees both in preview and picks which behavior to keep. The UI translates that choice into the merge resolution.

---

## Storage & Backend Layout (OpenDesign)

```
~/.opendesign/
└── projects/
    └── {projectId}/
        ├── .git/                 # Single repo for the project
        ├── main                  # main branch (unified prototype when all merged)
        └── agents/
            └── {agentId}/        # Working directory (checkout of agent's branch)
                ├── src/
                ├── ...
```

- Git repo lives at `~/.opendesign/projects/{projectId}/`.
- Each agent has a working directory = checkout of its branch.
- Tools run against that directory; Sandpack is fed file state via API.

---

## Agent Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant O as Orchestrator
    participant A as Agent
    participant G as Git
    participant S as Sandpack

    U->>O: "Check validation UI and layout"
    O->>O: Identify concepts
    O->>A: Spawn Agent A (validation)
    O->>A: Spawn Agent B (layout)
    A->>G: Create branch agent-a from main
    A->>G: Checkout → working dir
    A->>A: Run tools (edit, read) on working dir
    A->>G: Auto-commit on completion
    A->>S: Push file state → Sandpack canvas
    U->>U: Review results
    U->>A: "Approve"
    A->>G: Merge agent-a → main
```

---

## Agent-Scoped Request Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant M as Middleware
    participant I as Instance
    participant R as Route Handler

    C->>M: Request + projectId, agentId
    M->>M: Resolve directory = agents/{agentId}
    M->>M: Ensure branch exists, checkout if needed
    M->>I: Instance.provide({ directory })
    I->>I: Create/cache Instance context
    M->>R: next()
    R->>R: Tools use Instance.directory
```

Backend reuses OpenCode's `Instance.provide({ directory })`; directory is derived from `(projectId, agentId)` instead of being project-level.

---

## Sandpack Integration

- **Backend** owns the working directory; tools (edit, read, grep) operate on it.
- **Sandpack** displays the current file tree; state is fetched from the backend.
- **Sync** — after tool edits or commits, backend exposes file state via API; frontend updates Sandpack's `files` prop.

---

## Shared Infrastructure (OpenCode-derived)

The following sections describe the current server and client architecture, which OpenDesign reuses and adapts.

### High-Level Architecture

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        TUI["TUI (opentui + SolidJS)"]
        Web["Web App (Vite + SolidJS)"]
        Desktop["Desktop (Electron)"]
    end

    subgraph SDK["SDK (TypeScript)"]
        Client["OpencodeClient"]
        Client -->|"x-opencode-directory"| Header
    end

    subgraph Server["Server (packages/opencode)"]
        Hono["Hono App"]
        Routes["REST + SSE Routes"]
        Hono --> Routes
    end

    subgraph Core["Core Modules"]
        Instance["Instance"]
        Session["Session"]
        LLM["LLM"]
        Bus["Bus"]
        Provider["Provider"]
        Tool["Tool"]
    end

    TUI --> Client
    Web --> Client
    Desktop --> Client
    Client -->|"HTTP + SSE"| Hono
    Routes --> Instance
    Instance --> Session
    Session --> LLM
    LLM --> Provider
    LLM --> Tool
    Tool --> Permission["Permission"]
    Session --> Bus
    Bus -->|"SSE stream"| Client
```

## Monorepo Structure

```mermaid
flowchart LR
    subgraph Packages["Turborepo Packages"]
        OpenCode["opencode\n(Core + API)"]
        App["app\n(Web UI)"]
        Desktop["desktop-electron"]
        SDK["sdk/js\n(Generated)"]
        UI["ui\n(Primitives)"]
        Plugin["plugin"]
    end

    App --> SDK
    Desktop --> App
    OpenCode --> SDK
```

## Project & Workspace Model

```mermaid
flowchart TB
    subgraph ClientSide["Client (Local Storage)"]
        Workspace["Workspace"]
        Projects["Projects"]
        Workspace --> Projects
    end

    subgraph ProjectModel["Project Model"]
        P["Project"]
        P -->|"id"| PID["projectId (UUID)"]
        P -->|"sessionId"| SID["sessionId"]
        P -->|"name, workspaceId, order"| Meta["metadata"]
    end

    subgraph ServerSide["Server (Filesystem + DB)"]
        ProjectDir["~/.opendesign/projects/{projectId}"]
        SessionDB["Session (SQLite)"]
        SessionDB -->|"directory"| ProjectDir
    end

    Projects --> P
    P -->|"projectDir = join(home, .opendesign, projects, projectId)"| ProjectDir
    P -->|"sessionId"| SessionDB
```

## Project Pool (Instant Switching)

Project switching uses **component pooling** so up to 4 projects stay mounted; switching only changes visibility, not the DOM tree. This keeps Figma webviews, session state, and SSE connections alive for instant feedback.

### Architecture

```
ProjectPoolProvider → ProjectPool (accepts content: Component)
  → Key each={keys()} by={k=>k}
    → ProjectShell (position:absolute, visibility/opacity when inactive)
      → ProjectScopeProvider + ActiveContext
        → SDKProvider (active gate for SSE; client depends only on directory)
        → SyncProvider → PoolProjectData
          → Dynamic component={content}   ← each slot gets its own instance
            → TerminalProvider → FileProvider → PromptProvider → CommentsProvider → Session
```

**Important:** `ProjectPool` accepts a component reference (`content: Component`), not JSX children. `Dynamic` instantiates a separate component tree per pool slot. This ensures each slot has its own independent provider chain and DOM tree — switching projects only toggles `ProjectShell` visibility without unmounting/remounting any content.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **LRU pool, max 4** | Keeps memory bounded while allowing fast switching between recent projects. Active project is never evicted. |
| **Z-index stacking (no opacity/visibility)** | Avoids `display: none`, `visibility: hidden`, AND `opacity: 0`. Electron webviews inside parents with any of these get GC'd or detach their renderer ([electron/electron#764](https://github.com/electron/electron/issues/764)). Active shell gets `z-index: 1`, inactive shells get `z-index: 0`. Session content has an opaque background that naturally covers inactive shells. |
| **`inert` + `aria-hidden` on inactive** | Keeps inactive shells non-focusable and hidden from assistive tech. |
| **SDKProvider `active` gate** | SSE subscriptions only run for the active project. Client memo depends only on `directory()`, not `sessionId`. |
| **FileProvider `useProjectScope`** | File watchers pause when inactive to avoid wasted work. |
| **FigmaWebviewHost outside Tabs** | Kobalte Tabs use `display:none` for inactive content, which would GC the webview. Portal the webview into a host div that uses `z-index: -1` when the Figma tab is inactive (behind parent background, invisible to the user but "visible" to Electron's renderer — keeps it alive without reloads). |
| **`useProjectParams()` in pool children** | Components inside pool slots must use `useProjectParams()` (from `ProjectScopeProvider`) instead of `useParams()` (from router). Router params only reflect the active project; inactive slots reading router params would get wrong data. |
| **Figma host `top-12`** | Positions the Figma area below the tab bar to avoid overlap/stacking. |

### Files

| Path | Purpose |
|------|---------|
| `packages/app/src/pool/project-pool.ts` | LRU pool: `activate`, `evict`, `getCached`, `getActive` |
| `packages/app/src/pool/project-pool-context.tsx` | `ProjectPoolProvider`, `useProjectPool` |
| `packages/app/src/context/project-scope.tsx` | `ProjectScopeProvider`, `useProjectScope`, `useProjectParams` |
| `packages/app/src/components/project-shell.tsx` | Shell wrapper: inert, visibility, `ActiveContext` |
| `packages/app/src/components/project-pool.tsx` | Route-based pool; renders shells for cached keys |
| `packages/app/src/pages/session/figma-tab-content.tsx` | Figma embed (webview/iframe) |
| `packages/app/src/pages/session/session-side-panel.tsx` | Defines `FigmaWebviewHost`; portaled webview for instant tab switching |

### Eviction & Cleanup

On eviction, `layout.projectCache.drop(keys)`, `dropSessionCaches`, and `sync.session.evict()` are called so stale data is released. Evicted projects unmount; switching back re-mounts and may need to reload (Figma, etc.).

---

## Request Flow: Directory Scoping

```mermaid
sequenceDiagram
    participant C as Client
    participant M as Middleware
    participant I as Instance
    participant R as Route Handler

    C->>M: Request + x-opencode-directory
    M->>M: Resolve directory path
    M->>M: Ensure project dir exists<br/>(if under ~/.opendesign/projects/)
    M->>I: Instance.provide({ directory })
    I->>I: Project.fromDirectory(dir)
    I->>I: Create/cache Instance context
    M->>R: next()
    R->>R: Use Instance.directory, Instance.project
```

## Add Project Flow

```mermaid
sequenceDiagram
    participant U as User
    participant D as DialogAddProject
    participant W as Workspace
    participant SDK as SDK Client
    participant S as Server

    U->>D: Add project "My Project"
    D->>D: projectId = uuid()
    D->>D: projectDir = ~/.opendesign/projects/{projectId}
    D->>SDK: createClient({ directory: projectDir })
    D->>SDK: session.create({ title: "My Project" })
    SDK->>S: POST /session (x-opencode-directory)
    S->>S: mkdir projectDir if needed
    S->>S: Instance.provide(directory)
    S->>S: Session.create()
    S-->>SDK: Session { id }
    SDK-->>D: session.id
    D->>W: projects.add(workspaceId, name, sessionId, projectId)
```

## Message / Prompt Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Session
    participant L as LLM
    participant P as Provider
    participant T as Tools
    participant B as Bus
    participant E as SSE

    U->>C: Send message (prompt)
    C->>S: POST /session/:id/message
    S->>L: LLM.stream()
    L->>P: AI SDK stream
    loop Tool calls
        P-->>L: toolCall
        L->>T: Execute tool (bash, edit, grep...)
        T->>T: Permission check
        T-->>L: toolResult
    end
    L-->>S: Stream completions
    S->>B: Bus.publish(events)
    B->>E: SSE stream
    E->>C: Real-time events
```

## Session & Instance Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Request: Incoming request
    Request --> ResolveDir: Parse directory from header/query
    ResolveDir --> EnsureDir: Under projects root?
    EnsureDir --> Provide: mkdir if needed
    ResolveDir --> Provide: Skip (other path)
    Provide --> FromDirectory: Project.fromDirectory()
    FromDirectory --> Cache: Get/create Instance context
    Cache --> Handler: Run route handler
    Handler --> [*]: Response
```

## Event Bus → SSE Pipeline

```mermaid
flowchart LR
    subgraph Server
        Session["Session"]
        Message["MessageV2"]
        LSP["LSP"]
        subgraph Bus["Bus (per-instance)"]
            E1["session.created"]
            E2["message.part.updated"]
            E3["lsp.updated"]
        end
        Session --> E1
        Message --> E2
        LSP --> E3
    end

    subgraph Stream["SSE"]
        Global["global.event()"]
        Global --> Out["Event stream"]
    end

    E1 --> Global
    E2 --> Global
    E3 --> Global
```
