# OpenDesign — Product Plan

> Multi-agent AI-powered design-to-prototype studio

_Last updated: 2026-03-20. Living document — update as decisions change._

> **Decisions log (2026-03-20):** No user-facing agent modes — single orchestrator agent decomposes tasks and spawns sub-agents. Web product includes canvas, prototype view, context, and all features except Figma. Component library via npm package name. Voice input deferred to v2. TUI kept but not a focus. Sandpack for v1 runtime (custom Vite runner is ~1 week of work, revisit when Sandpack limits bite). Full design token extraction.

---

## Table of Contents

1. [Vision & Positioning](#1-vision--positioning)
2. [Target User](#2-target-user)
3. [Core Mental Model](#3-core-mental-model)
4. [Full User Workflow](#4-full-user-workflow)
5. [Feature Specifications](#5-feature-specifications)
   - [Figma Integration](#51-figma-integration)
   - [Canvas — React Flow Graph](#52-canvas--react-flow-graph)
   - [Canvas — WASM Focus Mode](#53-canvas--wasm-focus-mode)
   - [Agent System](#54-agent-system)
   - [Agent Modes](#55-agent-modes)
   - [Git Branching Model](#56-git-branching-model)
   - [Context System](#57-context-system)
   - [Simulation Modes](#58-simulation-modes)
   - [Prototype Export & MCP](#59-prototype-export--mcp)
6. [Architecture Decisions](#6-architecture-decisions)
7. [Codebase Changes Required](#7-codebase-changes-required)
8. [Build Order & Phases](#8-build-order--phases)
9. [Open Questions](#9-open-questions)

---

## 1. Vision & Positioning

### One-liner

**A user flow diagram that runs.** OpenDesign is where designers bring Figma frames, wire them together with logic, and generate working interactive prototypes through AI agents — in parallel, with real data, with edge cases covered.

### The Gap This Fills

| Tool                 | What it does         | What it misses                                |
| -------------------- | -------------------- | --------------------------------------------- |
| Figma prototyping    | Visual click-through | No real state, no data, no edge cases         |
| ProtoPie / Principle | Rich interactions    | No AI, no data layer, no dev handoff logic    |
| Framer               | Code + design        | Steep curve, not multi-agent                  |
| Stately Studio       | Visual XState editor | No Figma context, no AI, no prototype runtime |
| Cursor / Windsurf    | AI coding for devs   | Not for designers, no visual design context   |

**OpenDesign occupies the space between Figma and development.** It takes designs as input and produces validated, interactive prototypes with logic and data as output — faster than any existing tool, and with a workflow that mirrors how software teams actually work.

### What It Is Not

- Not a Figma replacement
- Not a production code generator (prototype code, not production code)
- Not a no-code tool (it generates code, but code is an implementation detail)
- Not a design system editor (it reads design systems, does not replace them)

---

## 2. Target User

**Primary: Product designers at mid-to-large companies** who are:

- Design-system-aware (understand tokens, components, variants)
- Product-minded (think in user flows, edge cases, states)
- Frustrated that Figma prototypes feel fake in user research
- Frustrated that developer handoff loses the "why" (intent, logic, edge cases)

**Secondary: Design engineers / frontend developers** who bridge design and code and want to prototype quickly against real design systems before committing to production implementation.

**Not the primary target (v1):** Visual artists, brand/graphic designers, or developers who don't work with design files.

---

## 3. Core Mental Model

### The Software Development Analogy

The product is deliberately modelled on how software development works:

| Software Dev   | OpenDesign                                  |
| -------------- | ------------------------------------------- |
| Git repository | Project (local git repo)                    |
| Main branch    | Base prototype (shared components + tokens) |
| Feature branch | Agent scenario branch                       |
| Pull request   | Scenario approval                           |
| Merge          | Combine scenarios                           |
| Code review    | Visual diff + designer approval             |
| Release        | Unified prototype / MCP export              |

This analogy is intentional. Designers work in linear sequences today. OpenDesign gives them parallel, branched, reviewable, rollback-capable workflow.

### Node Types on Canvas

The main canvas is a spatial graph. Everything is a node:

```
Frame node      — Figma frame imported as reference (thumbnail + metadata)
Agent node      — Running Sandpack iframe, 1:1 with an agent + branch
Persona node    — Simulation configuration (role, language, accessibility)
Context node    — Attached PRD, research doc, architecture spec
Checkpoint node — Named snapshot of an agent's branch at a point in time
Merged node     — Combined result of 2+ agent branches
```

---

## 4. Full User Workflow

### End-to-End Flow

```
1. CREATE PROJECT
   User creates a new project → links a Figma file
   System: scaffolds git repo with base codebase
           extracts design tokens from Figma → tokens.css
           connects Storybook/component library if provided

2. IMPORT FRAMES
   Desktop: User selects 1+ frames in Figma
            Selection events captured via Electron webview injection
            Frame thumbnails + node data appear as Frame nodes on canvas
            Frames also appear as context chips in prompt input
   Web:     Figma tab hidden — user uploads screenshots or skips Figma

3. ADD CONTEXT (optional)
   User drops PRDs, user research docs, architecture specs into Context tab
   These become Context nodes on canvas
   Agents can query them via RAG when generating or asking "what if" questions

4. PROMPT
   User types (or speaks) a request
   Example: "Simulate the checkout flow with edge cases"
            "Prototype these 3 screens with real data"
            "What does the empty state and error state look like?"

5. PRE-FLIGHT PLAN
   System analyzes the request + selected frames + context
   Presents decomposition plan to user:
     "We identified 4 scenarios:
      [ ] Empty cart state
      [ ] Payment failure
      [ ] Guest checkout
      [ ] High-privilege admin view
      Run all or select some?"
   User selects which scenarios to dispatch

6. AGENTS DISPATCH (parallel)
   Each approved scenario spins up an agent
   Each agent: creates a git branch from main
               scaffolds Sandpack with the branch code
               appears as an Agent node on canvas

7. PARALLEL WORK
   Agents work simultaneously, each on their scenario
   Agent nodes show live Sandpack previews (CSS-scaled iframes)
   User can:
     - Interact with each prototype directly
     - Select DOM elements inside a prototype and ask follow-up questions
     - Ask agents to modify their scenario
     - See agents ask "what if" questions proactively

8. WHAT IF QUESTIONS
   Agents proactively surface uncovered scenarios:
     "What happens when the user's session expires mid-checkout?"
     "What if the payment API is down? Should this show an error or a fallback?"
     "This flow doesn't handle mobile viewport — should I add it?"
   User responds inline → agent extends its branch

9. SIMULATION
   User can run simulation modes on any Agent node:
     - Persona (admin / guest / low-privilege)
     - Viewport (mobile / tablet / desktop)
     - Language / RTL
     - Color blindness / reduced motion
     - Slow network / offline
     - Accessibility audit (axe-core)

10. REVIEW & APPROVE
    User enters focus mode on an Agent node (WASM canvas activates)
    WASM focus view: Figma frame reference (left) + live prototype (right)
    User approves scenario → agent branch merges to main

11. COMBINE SCENARIOS
    User selects 2+ Agent nodes → "Combine"
    System: auto-checkpoint both branches before merge
            agent performs git merge
            visual conflicts surfaced as side-by-side visual diff in WASM canvas
            designer picks preferred version per conflict
            code-only conflicts resolved by AI silently
    Result: new Merged node on canvas

12. UNIFIED PROTOTYPE
    All approved/merged scenarios exist on main branch
    Main branch runs as the unified prototype
    User can navigate between scenarios, simulate, share

13. EXPORT
    Download: prototype bundle (Vite build)
    MCP export: exposes schema, logic, scenarios, component tree
                Cursor / Windsurf imports → developers implement
    Git: push to remote repo (GitHub / GitLab) — developers clone
```

---

## 5. Feature Specifications

### 5.1 Figma Integration

#### Desktop (Electron) — Full Access

- Figma loads in an Electron webview (`FigmaWebviewHost`)
- Frame selection captured via `webContents.executeJavaScript()` — no plugin installation required
- On selection change: captures node ID, name, thumbnail, component tree, token references
- Selected frame appears as a context chip in the prompt input (`AgentPart` in prompt model)
- Frame node added to canvas with thumbnail and metadata
- Figma REST API used for reads (OAuth once, permanent token)
- Writes go through webview injection (plugin-equivalent, no separate plugin)

#### Web — Full Feature Set Except Figma

- Figma tab hidden on web platform (`platform === "web"` guard)
- All other capabilities fully available on web:
  - React Flow canvas with Agent nodes
  - Sandpack prototype previews
  - Context tab (upload PRDs, research docs)
  - Simulation modes on Agent nodes
  - WASM focus mode (visual diff, state diagram)
  - MCP export
- Web users add context via file upload or describe frames in text; no Figma frame selection
- Revisit Figma on web if Figma ever opens bidirectional embed API

#### Figma Data Extracted Per Project

- Design tokens → `src/tokens.css` (CSS custom properties)
- Component list → available to agents as importable components
- Font list → loaded in Sandpack environment
- Frame list → browsable in Context tab

---

### 5.2 Canvas — React Flow Graph

**Replace the current WASM canvas as the primary interaction surface with a React Flow-based HTML canvas.**

The WASM canvas is preserved but moves to focus mode (see 5.3).

#### Why React Flow

- Node graph with embedded DOM elements (iframes) is React Flow's native strength
- Iframe nodes are 20 lines of custom node code
- Zoom + pan + selection built-in
- CSS `transform: scale()` on iframe wrappers handles zoom correctly in modern browsers (Chrome 90+, Firefox 80+ — pointer events are correctly transformed)
- Saves fighting the WASM+DOM z-index coordinate sync problem already seen in Figma/CanvasHost

#### Iframe Zoom Technique

```
wrapper:  width: 640px; height: 400px; overflow: hidden
iframe:   width: 1280px; height: 800px
          transform: scale(0.5); transform-origin: top left
```

Iframe renders at full resolution. CSS scales visual output. Hit areas transform correctly.

#### Iframe Performance

- `IntersectionObserver` on each Agent node → `display: none` when off-screen (pauses JS, frees GPU)
- Maximum 5 active Agent nodes simultaneously (v1 limit — revisit with cloud agents)
- Inactive agents show last-rendered thumbnail, resume on focus

#### Node Layout

- Auto-layout on creation: Frame nodes on left, Agent nodes to the right of their parent frame
- Edges drawn automatically: Frame → Agent (this agent works on this frame)
- Manual repositioning always available
- Persona nodes attach to Agent nodes as configuration overlays
- Context nodes float in a dedicated "context area" at canvas top

---

### 5.3 Canvas — WASM Focus Mode

The existing WASM/WebGPU canvas is preserved and activated when the user enters **focus mode** on a single Agent node (double-click or keyboard shortcut).

#### Focus Mode Layout

```
┌─────────────────────────────────────────────────────┐
│  [← Back to canvas]              [Simulate ▾] [...]  │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│  WASM: Figma frame   │  Sandpack prototype (iframe) │
│  (pixel-perfect,     │  (live, interactive)         │
│   zoomable, with     │                              │
│   annotation layer)  │                              │
│                      │                              │
├──────────────────────┴──────────────────────────────┤
│  [State diagram]  [Token inspector]  [Checkpoint ▾] │
└─────────────────────────────────────────────────────┘
```

#### WASM Canvas Responsibilities

**1. Figma Frame Renderer**

- Render Figma vector data client-side from extracted node tree
- Pixel-perfect at any zoom level (no PNG re-fetch on zoom)
- Annotation layer: designer can mark up the frame, notes attach to agent context
- Component highlights: hover a component in the frame → highlight its usage in the prototype

**2. Visual Diff Surface**

- Activated when reviewing a merge conflict or comparing two branches
- Slider comparison: drag divider between branch A and branch B rendering
- Overlay diff: GPU-rendered pixel diff with changed regions highlighted
- State-by-state stepping: step through prototype states, see what changed at each

**3. Live State Diagram**

- XState machine visualization rendered in WASM
- Reads-only (edit is in the code, not here)
- Animates as user interacts with the prototype: current state highlighted, transitions fire
- Useful for debugging edge cases and explaining logic to stakeholders

**4. Design System Token Inspector**

- Interactive graph of token relationships and component usage
- GPU-rendered for smooth exploration at scale (200+ tokens, 50+ components)
- Agents can reference it: "this conflict is between `color.error.500` and `color.warning.400`"

---

### 5.4 Agent System

#### Two User-Facing Modes: Agent and Ask

The prompt has a simple mode toggle. Two primary agents, one creates things, one discusses things.

**Agent mode** (default): The orchestrator. Decomposes requests into scenarios, dispatches sub-agents, builds prototypes on canvas. This is the doing mode.

**Ask mode**: Read-only intelligence. RAG context injected automatically. Answers questions about designs, brainstorms ideas, discusses prototypes, surfaces insights from context docs. Never writes code, never creates branches, never modifies anything.

```
Agent mode:                              Ask mode:
User prompt                              User prompt
    │                                        │
    ▼                                        ▼
Orchestrator agent                       Ask agent
  - Reads Figma frames                    - Reads Figma frames
  - Reads context docs (RAG)              - Reads context docs (RAG, always injected)
  - Decomposes into scenarios             - Reads prototype code (if exists)
  - Dispatches sub-agents                 - Answers questions
    │                                     - Brainstorms ideas
    ├─▶ Scenario agent A → node A         - Surfaces insights
    ├─▶ Scenario agent B → node B         - Never writes or modifies
    └─▶ Scenario agent C → node C
```

#### Orchestrator Agent (`opendesign-agent`)

- **Mode**: `primary` — default mode in prompt
- **Replaces**: `build` in `agent.ts`
- **Tools**: read, figma read, context RAG, task dispatch (spawns scenario agents)
- **Does not**: write code directly (delegates to scenario agents)
- **Prompt focus**: decomposition, planning, "what if" question formulation, synthesis
- **Persists**: the pre-flight plan shown to the user is the orchestrator's output before sub-agents fire

#### Ask Agent (`opendesign-ask`)

- **Mode**: `primary` — switchable via mode toggle in prompt tray
- **Replaces**: `plan` in `agent.ts`
- **Tools**: read, figma read, context RAG (always injected), websearch, webfetch
- **Does not**: write, edit, bash, create branches, dispatch sub-agents
- **Prompt focus**: answer design questions, brainstorm, critique prototypes, surface research insights, suggest scenarios without executing them
- **Use cases**: "What does our research say about checkout abandonment?", "What edge cases am I missing?", "How should this flow handle offline users?", "Critique this prototype's accessibility"

#### Scenario Agent (`opendesign-scenario`)

- **Mode**: `subagent` — never directly invoked by user, only spawned by orchestrator
- **One instance per approved scenario**, each on its own git branch
- **Tools**: write (sandpack files only), read, figma read, context RAG, bash (scoped to project sandbox)
- **Prompt focus**: React component generation, XState state logic, mock data, real component imports from connected npm package
- **Output**: running Sandpack iframe on Agent node

#### Specialist Sub-agents (spawned by orchestrator when needed)

These run behind the scenes — user sees their output as annotations or questions, never as separate nodes:

| Agent         | Spawned when                                                              | Output                                                             |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `research`    | Request involves "why", "what does research say", or context docs present | Insights injected into orchestrator context                        |
| `audit`       | Scenario is approved or user asks to check it                             | axe-core violations, token mismatches as annotations on Agent node |
| `figma-write` | Design mode: user asks to update Figma                                    | Figma changes via webview injection                                |

#### Replacing Built-in Agents in Codebase

Current built-ins `build` and `plan` are removed. The string-keyed coupling in `session/prompt.ts` `insertReminders()` (lines 1328, 1339, 1356, 1375) is deleted — the plan-file workflow does not apply here. Internal agents `compaction`, `title`, `summary`, `explore` are kept as-is, hidden from UI.

#### Agent Node Lifecycle

```
created    → branch created, Sandpack loading
working    → agent writing code, Sandpack hot-reloading
waiting    → agent surfaced a "what if" question, awaiting user response
ready      → prototype stable, user can interact and follow up
approved   → branch merged to main, node marked complete
archived   → branch kept, node collapsed (not deleted, recoverable)
```

---

### 5.6 Git Branching Model

#### Project = Git Repository

Every OpenDesign project is a local git repository. This is not optional or configurable — it is the storage model.

```
project-root/
  .git/                      ← standard git repo
  src/
    components/              ← shared components (from Storybook or scaffolded)
    tokens.css               ← design tokens extracted from Figma
    data/
      types.ts               ← entity types inferred from Figma frames
      mock.ts                ← mock data (auto-generated, editable)
    App.tsx                  ← base routing shell
    main.tsx
  .opendesign/
    project.json             ← figma file ID, project metadata, agent registry
    context/                 ← uploaded PRDs, research docs (git-tracked)
    checkpoints.json         ← named checkpoint index
  package.json               ← Vite + React + XState + design system deps
  vite.config.ts
```

#### Branch Naming

```
main                         ← approved, combined prototype
agent/<scenario-slug>        ← each agent's working branch
checkpoint/<name>-<hash>     ← named snapshots before destructive operations
archived/<scenario-slug>     ← rejected but preserved branches
```

#### Operations

| User Action             | Git Operation                                                               |
| ----------------------- | --------------------------------------------------------------------------- |
| Agent dispatched        | `git checkout -b agent/<slug> main`                                         |
| Agent writes code       | Commits to its branch (auto-committed per iteration)                        |
| User approves scenario  | `git merge agent/<slug>` into main                                          |
| Combine 2 scenarios     | `git merge agent/<slug-b>` into `agent/<slug-a>` (agent resolves conflicts) |
| Checkpoint before merge | `git tag checkpoint/<name>` or branch copy                                  |
| Rollback                | `git checkout <checkpoint>`                                                 |
| Export to IDE           | Push to remote or zip export                                                |

#### Implementation

- Shell out to `git` CLI via `Bun.spawn` from the server — no library abstraction needed for v1
- isomorphic-git available later for browser-side git (cloud agents)
- Sandpack is initialized with the file contents of the agent's branch on each iteration

#### Base Codebase Scaffold (on project creation)

```typescript
// Scaffolded automatically, never manually written by user
- Vite + React + TypeScript setup
- XState as dependency (used internally by agents for state logic)
- Design tokens from Figma → src/tokens.css
- Connected Storybook components as imports (if provided)
- Base routing shell (React Router)
- Mock data types inferred from Figma frame content
- Accessibility baseline (axe-core as dev dependency)
```

---

### 5.7 Context System

**The current Files tab is repurposed as the Context tab.** This is where project intelligence lives.

#### What Goes Here

- Product requirement documents (PRD)
- User research reports and usability testing notes
- Architecture documents
- Competitive analysis
- Brand guidelines
- API contracts / data schemas

#### Supported Formats (v1)

- Markdown (.md)
- Plain text (.txt)
- PDF (.pdf)
- Images (.png, .jpg — for screenshots of Notion, Confluence pages)

#### How Agents Use Context

- **Not injected by default** (too noisy, too expensive)
- Agents query context docs via RAG when:
  - Forming "what if" questions (research relevant edge cases)
  - Validating a prototype scenario against stated requirements
  - Refine/Audit mode scanning for accessibility or design system specs
- Context docs stored in `.opendesign/context/` — git-tracked with the project

#### Updates

- User manually re-uploads or replaces files when content changes
- v2: live links to Notion / Google Docs (OAuth-gated feature)

---

### 5.8 Simulation Modes

Applied to any Agent node. Implemented as iframe-level transformations.

| Mode                 | Feasibility | Implementation                                               |
| -------------------- | ----------- | ------------------------------------------------------------ |
| Viewport / device    | Easy        | Resize iframe container dimensions                           |
| Dark / light mode    | Easy        | Toggle `data-theme` CSS class                                |
| RTL language         | Medium      | `dir="rtl"` + i18n string swap                               |
| Color blindness      | Medium      | CSS `filter: url(#deuteranopia)` SVG filter on iframe        |
| Reduced motion       | Medium      | `prefers-reduced-motion` media query override                |
| Slow network (3G)    | Medium      | Service worker throttling injected into Sandpack             |
| Persona (role-based) | Depends     | Agent generates correct state/data for that persona          |
| Accessibility audit  | Achievable  | Run axe-core inside Sandpack, surface results as annotations |

**Note on screen reader simulation:** True screen reader simulation is not achievable in an iframe. What we expose is **accessibility audit** (axe-core violations) — not simulation. This is more actionable anyway: issues are flagged as annotations rather than requiring the designer to operate NVDA.

#### Persona Node

First-class node type on canvas. Personas are reusable across projects.

```json
{
  "name": "Guest User",
  "role": "unauthenticated",
  "permissions": ["read:public"],
  "viewport": "mobile",
  "language": "en",
  "networkCondition": "slow-3g",
  "a11y": { "colorBlindness": "none", "reducedMotion": false }
}
```

Attach a Persona node to an Agent node → that agent's prototype runs in that persona's context.

---

### 5.9 Prototype Export & MCP

#### Download

- Vite production build of the main branch
- Self-contained HTML/JS/CSS bundle
- Usable for user research sessions, stakeholder reviews

#### Git Push

- User connects a remote (GitHub / GitLab) via settings
- "Push to remote" button — each branch becomes a real remote branch
- Developers clone the repo, checkout `agent/<scenario>` to see a specific scenario

#### MCP Export (for IDEs)

An MCP server that exposes the project to Cursor / Windsurf / VS Code with Claude.

Tools the MCP exposes:

```
get_project_overview      → project name, Figma file, scenario list
get_scenario(name)        → code files, XState schema, component tree, mock data
get_design_tokens         → full token map from Figma
get_component_list        → available components + Storybook references
get_context_docs          → PRD, research docs (RAG-queryable)
get_visual_spec(frame_id) → Figma frame data for a specific screen
list_approved_scenarios   → scenarios merged to main with descriptions
```

This gives developers not just visual specs but:

- The working logic (XState machines)
- The data shapes (mock data types)
- The component choices already validated by designers
- The edge cases already approved

---

### 5.10 Design System Registry

Design systems are **workspace-level**, not per-project. A user registers them once and reuses across every project. This reflects reality: tokens and components rarely change between products at the same company.

#### Registry Entry

```json
{
  "id": "acme-design-system",
  "name": "Acme Design System",
  "figmaFileUrl": "https://figma.com/file/...",
  "npmPackage": "@acme/ui",
  "lastSynced": "2026-03-20T10:00:00Z",
  "tokenCache": "./cache/acme-design-system/tokens.css",
  "componentList": ["Button", "Input", "Modal", "Card", ...]
}
```

#### Multiple Registrations

Users can register multiple design systems in the registry (company system, open-source base, mobile system, etc.) — but **each project uses exactly one**. No merging, no priority layers. Keeps component selection unambiguous.

#### Per-Project Association

At project creation, user picks one design system from the registry dropdown. This determines:

- Which tokens go into `src/tokens.css`
- Which npm package is added to `package.json`
- Which components agents can reference

Can be changed in project settings later (triggers a re-scaffold of tokens and dependencies).

#### Toolbar Component Palette

A toolbar icon opens a component browser showing all components from the connected design system. Agents reference this palette — "use the `Button` from your design system" — instead of generating generic HTML elements. Palette is read-only browsing, not editing.

#### Token Extraction

- Tokens extracted from the design system's Figma file (not the project Figma file)
- Cached in workspace-level storage, not inside the project git repo
- Copied into `src/tokens.css` at scaffold time
- Sync: manual "Sync" button per design system in settings, shows "Last synced: [date/time]" timestamp

#### Project Scaffold with Design System

```
1. User creates project (name only)
2. User selects design system from registry (required)
   → If no design systems registered: prompted to add one first
3. User opens Figma file (Desktop) or skips (Web)
4. Scaffold runs:
   a. git init
   b. Copy tokens.css from design system token cache
   c. Add npm package to package.json dependencies
   d. Scaffold base React app with token imports + component imports
   e. Done — project ready for agent dispatch
```

---

## 6. Architecture Decisions

### ADR-001: React Flow replaces WASM canvas as primary graph surface

**Decision:** Main canvas switches to React Flow (HTML canvas + SVG edges).
**Reason:** Node graph with embedded DOM iframe nodes is React Flow's native use case. WASM/WebGPU is excellent for GPU-accelerated rendering but fighting DOM-over-WebGPU z-index and coordinate sync is demonstrated complexity (wobble fixes, positioning bugs already encountered). React Flow gives the graph primitives immediately and makes iframe nodes trivial.
**WASM preserved:** Moved to focus mode for visual diff, Figma rendering, state diagrams.
**Trade-off:** Lose WebGPU graph rendering (acceptable — the graph isn't the bottleneck).

### ADR-002: Git as the branching and storage model

**Decision:** Every project is a local git repository. Branches are the unit of agent work.
**Reason:** Free diff, history, merge tooling. MCP export to IDE = point at a repo. Developers can clone directly. Rollback = `git checkout`. No custom branching system to build or maintain.
**Trade-off:** Requires git installed locally (acceptable on desktop; cloud agents need server-side git).

### ADR-003: Sandpack as the prototype runtime

**Decision:** Each agent node runs a Sandpack iframe.
**Reason:** Sandpack is a battle-tested in-browser bundler/runner. No server needed per agent. CSS `transform: scale()` handles zoom in modern browsers. IntersectionObserver handles performance (pause when off-screen).
**Limit:** 5 active Agent nodes simultaneously (v1). Cloud agents expand this.

### ADR-004: Figma integration via Electron webview injection (no plugin)

**Decision:** Read selection events and Figma data by injecting JS into the Figma webview.
**Reason:** No plugin installation friction. Electron's `webContents.executeJavaScript()` gives full access equivalent to a plugin. REST API handles reads; injection handles writes.
**Trade-off:** Technically against Figma ToS for automation without a plugin. Acceptable for v1/beta — revisit with official Figma plugin if needed for distribution.
**Web:** Figma tab hidden. Web product is full-featured otherwise — canvas, Sandpack nodes, context, simulation, WASM focus mode, MCP export all work on web.

### ADR-005: Remove `insertReminders()` plan/build coupling

**Decision:** Remove the string-keyed `"plan"` / `"build"` checks in `session/prompt.ts` `insertReminders()`.
**Reason:** The plan-file workflow (write a `.md` plan, switch to build mode to execute it) does not apply to a design tool. Design mode agents don't operate on plan files. The coupling will break silently when agents are renamed.
**Replacement:** Agent system prompt files carry the mode-specific context. No synthetic reminder injection needed.

### ADR-006: XState as internal runtime, never exposed to users

**Decision:** XState lives inside generated Sandpack code as a dependency. It is not visualized as an editable graph.
**Reason:** Designers don't think in state machines. Exposing XState directly would alienate the target user. The live state diagram in WASM focus mode is read-only.

### ADR-007: Merge conflicts resolved visually for UX, silently for code

**Decision:** Two-tier conflict resolution: visual/UX conflicts → designer picks in WASM side-by-side view. Code-only conflicts → AI resolves silently.
**Reason:** Designers' job is UX decisions, not code decisions. Interrupting a designer with a JavaScript merge conflict is wrong. But showing two different button colors and asking which they prefer is natural design review.

### ADR-009: Design systems are workspace-level, not per-project

**Decision:** Design system registry lives at the workspace/settings level. Projects link to a registered design system by ID. Token extraction and npm package configuration happen once per design system, not per project.
**Reason:** Tokens and components rarely change between products at the same company. Per-project configuration creates duplicated setup and risks drift (project A on v2 of tokens, project B on v1). Central registry keeps all projects in sync.
**Trade-off:** First-time setup requires registering a design system before creating a project. Slightly higher onboarding friction but significantly better long-term workflow.

### ADR-008: Context via RAG, not context injection

**Decision:** PRDs and research docs are queried by agents on demand, not injected into every prompt.
**Reason:** Injecting all context docs into every agent prompt is expensive and noisy. RAG lets agents pull relevant sections when forming "what if" questions or validating scenarios.

---

## 7. Codebase Changes Required

### Priority 1 — Blocking (do first)

#### `packages/opencode/src/agent/agent.ts`

- Remove `build` and `plan` primary agents
- Add `opendesign-agent` as the default primary agent (`mode: "primary"`) — the orchestrator
- Add `opendesign-ask` as the second primary agent (`mode: "primary"`) — read-only RAG mode
- Add `opendesign-scenario`, `research`, `audit`, `figma-write` as subagents (`mode: "subagent"`)
- Update `Agent.list()` default sort — remove hardcoded `build` preference
- Update `Agent.defaultAgent()` to return `opendesign-agent`

#### `packages/opencode/src/session/prompt.ts`

- Remove `insertReminders()` string checks for `"plan"` and `"build"` (lines ~1328–1375)
- Remove `BUILD_SWITCH` and `PROMPT_PLAN` synthetic injection
- Remove import of `build-switch.txt` and `plan.txt` prompts
- Make the function a no-op or delete it entirely

#### `packages/opencode/src/agent/prompt/` — New files

- `agent.txt` — orchestrator: decomposition logic, pre-flight planning, "what if" question formulation
- `ask.txt` — read-only brainstorming, RAG-powered Q&A, design critique, never writes or modifies
- `scenario.txt` — React prototype generation, XState logic, mock data, npm component imports
- `research.txt` — context synthesis, insight surfacing from uploaded docs
- `audit.txt` — axe-core interpretation, token mismatch detection, design system compliance

#### `packages/app/src/utils/agent.ts`

- Remove `build`, `docs`, `plan` color mappings
- Add entries for `opendesign-agent` and `opendesign-ask`
- Two colors needed: one for Agent mode, one for Ask mode

### Priority 2 — Core Feature

#### Canvas replacement

- Remove WASM canvas as the primary graph surface in `session-side-panel.tsx`
- Integrate React Flow as the new canvas panel
- Define custom node types: `FrameNode`, `AgentNode`, `PersonaNode`, `ContextNode`
- Implement iframe node with CSS scale zoom technique
- Implement IntersectionObserver pause/resume for idle Agent nodes
- Wire WASM canvas into focus mode (activated on Agent node double-click)

#### Git integration

- New module `packages/opencode/src/git/` — thin wrapper over `Bun.spawn` git calls
- Operations: `init`, `branch`, `commit`, `merge`, `diff`, `checkout`, `log`
- Integrate with agent run lifecycle (create branch on agent start, commit on iteration)
- Checkpoint API: named snapshots before destructive merge operations

#### Figma webview bridge (Electron)

- Inject selection listener into Figma webview on load
- Listen for `selectionchange` events → extract node ID, name, thumbnail URL, component tree
- Post selection data to main process → forward to server → SSE to client
- Frame node creation in React Flow canvas on selection
- Frame context chip in prompt input (already supported by `AgentPart` model)

#### Sandpack integration

- Agent tool: `sandpack_write(files)` — writes file tree to agent's branch and hot-reloads
- Agent tool: `sandpack_read()` — reads current file tree
- Sandpack initialized per Agent node with branch file contents
- DOM element selection bridge: inspector shim injected into Sandpack bundle, posts selected element selector + bounding box to parent on click in "select mode"

### Priority 3 — Enhanced Features

#### Context tab

- Rename "Files" tab to "Context"
- File upload: .md, .txt, .pdf, images
- Store in `.opendesign/context/`
- RAG indexing on upload (chunking + embeddings)
- Expose query tool to agents: `context_search(query)`

#### Simulation modes

- Persona node UI: create, configure, attach to Agent node
- Viewport simulation: resize iframe wrapper
- CSS simulation modes: color blindness filters, reduced motion override
- Accessibility audit: run axe-core inside Sandpack, return violations

#### Visual diff (WASM)

- Diff view in WASM focus mode: render both versions, slider comparison
- Pixel diff highlighting using GPU fragment shaders
- Integration with git merge conflict detection

#### MCP export server

- New package `packages/mcp-export/`
- Exposes project data to IDEs via MCP protocol
- Tools: `get_scenario`, `get_design_tokens`, `get_component_list`, `get_context_docs`

#### Pre-flight decomposition UI

- On first prompt in a session with frames selected: generate scenario plan
- Present plan to user for approval/modification before dispatching agents
- "Run all" / "Select some" / "Add custom scenario" options

### Priority 4 — Later

#### Agents panel

- Currently a stub ("Agents will appear here")
- Replace with live view of all active agents, their status, branch name, last action
- "What if" question cards shown here when agents ask them

#### Cloud agents

- Server-side git + Sandpack execution
- Multiple simultaneous agents without local machine limits
- Streaming prototype builds

#### Remote git push

- Settings: connect GitHub / GitLab account
- "Push to remote" per project or branch
- Developer link sharing

---

## 8. Build Order & Phases

### Phase 1 — Foundation (unblock everything else)

1. Remove `build`/`plan` agent coupling in `agent.ts` and `prompt.ts`
2. Define orchestrator + scenario + specialist subagents with permission profiles and system prompts
3. Replace WASM canvas with React Flow for the graph surface (WASM moves to focus mode)
4. Figma webview bridge (Electron) — frame selection → context chip in prompt

### Phase 2 — Core Prototype Workflow

5. Git integration module
6. Sandpack agent nodes (iframe nodes in React Flow)
7. Agent branch lifecycle (create on dispatch, commit on iteration, merge on approve)
8. Pre-flight decomposition UI (show plan before dispatching)
9. DOM element selection bridge in Sandpack

### Phase 3 — Intelligence Layer

10. Context tab (file upload + RAG)
11. "What if" question UX (agent asks designer during prototype generation)
12. Persona nodes + simulation modes
13. Visual diff in WASM focus mode

### Phase 4 — Handoff & Export

14. MCP export server
15. Unified prototype (all approved scenarios on main branch)
16. Git remote push (developer handoff)
17. Prototype download (Vite build)

### Phase 5 — Scale & Polish

18. Cloud agents
19. Agents panel live view
20. Accessibility audit integration
21. Multi-project Figma file support

---

## 9. Decisions Log

| #   | Question                            | Decision                                                                                                                                                                                                        |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Agent modes in UI                   | **Two modes: Agent and Ask.** Agent mode = orchestrator, decomposes and dispatches. Ask mode = read-only, RAG-powered brainstorming and Q&A. No other modes.                                                    |
| Q2  | Web product scope                   | **Full feature parity except Figma tab.** Canvas, Sandpack nodes, context, simulation, WASM focus, MCP export all on web.                                                                                       |
| Q3  | Component library connection        | **npm package name.** User pastes package name. Sandpack imports it directly. Managed via Design System Registry (see §5.10).                                                                                   |
| Q4  | Voice input                         | **Deferred to v2.**                                                                                                                                                                                             |
| Q5  | TUI                                 | **Keep, do not invest.** Remove only if it becomes a maintenance burden.                                                                                                                                        |
| Q6  | Sandpack vs custom Vite runner      | **Sandpack for v1.** Custom runner (~1 week: file serving + hot reload + port management per agent) when Sandpack limits bite (private npm, large deps). Revisit Phase 5.                                       |
| Q7  | Design token extraction depth       | **Full token set.** Colors, typography, spacing, shadows, radius, component props/variants.                                                                                                                     |
| Q8  | Orchestrator pre-flight plan format | **Structured JSON rendered as interactive cards.** User can check/uncheck scenarios, rename, add custom ones. Schema defined before building pre-flight UI.                                                     |
| Q9  | RAG infrastructure                  | **OpenAI/Anthropic embedding API first, Ollama later.** Exposed in Settings page. Keyword search as fallback if no API key configured.                                                                          |
| Q10 | Project creation UX                 | **Name only to start.** Figma file opened in-app, user selects project. Design system selected from global registry at creation time (required). Scaffold runs silently after selection.                        |
| Q11 | Design system scope                 | **Global registry, not per-project.** Design systems are workspace-level. Projects link to a registered design system. Tokens extracted once, cached, reused across all projects. See §5.10.                    |
| Q12 | Multiple design systems per project | **One design system per project, hard constraint for v1.** Avoids component selection ambiguity. Multi-system support deferred — determining which component to use across two systems has no clean answer yet. |
| Q13 | Design system sync strategy         | **Manual sync button in settings.** Shows "last synced" timestamp per design system. User explicitly triggers re-extraction from Figma. No automatic sync on project open.                                      |

---

## 10. Open Questions

_No open questions remaining. Add new ones here as they arise._

---

_End of document. Update as decisions are made._
