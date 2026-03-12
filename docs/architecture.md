# OpenDesign / OpenCode Architecture & Data Flow

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        TUI["TUI (opentui + SolidJS)"]
        Web["Web App (Vite + SolidJS)"]
        Desktop["Desktop (Tauri / Electron)"]
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
        Desktop["desktop\n(Tauri)"]
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
