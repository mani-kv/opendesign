# Phase 1: Product/Feature/Agent Foundation — Design Spec

## Overview

Phase 1 establishes the correct data model, API surface, and frontend routing for OpenDesign's Product → Feature → Agent hierarchy. This is the foundation that all subsequent phases (canvas, Figma import, annotations, variations, checkpoints) build on.

The phase prioritizes architectural correctness over visual features. The output is a working app where you can navigate Products, open Features, and see a canvas-primary layout with agent chat in the sidebar — all wired to a clean data model with no legacy naming confusion.

## Decisions Made

| Decision                  | Choice                                               | Rationale                                                          |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Phase ordering            | Data model first (Approach B)                        | Clean foundation, no rewiring later                                |
| Frontend routing          | `/product/:productId/feature/:featureId?agent=x`     | Feature is the "page"; agents are contextual via query param       |
| Session page              | Coexist — new `feature.tsx` alongside `session.tsx`  | Reuse sub-components, don't gut working infrastructure             |
| API routes                | Update routes first, regenerate SDK                  | Prevents translation debt; frontend builds against correct types   |
| ProjectTable/ProductTable | Consolidate into ProductTable                        | One identity system, no dual-table confusion                       |
| Agent FK                  | Fix to reference FeatureTable                        | Clean FK chain: Product → Feature → Agent                          |
| Namespace naming          | Agent→AgentDef, AgentSession→Agent                   | Do it now; we're already touching all files                        |
| Route paths               | `/session`→`/agent-session`, `/agent`→`/agent-files` | Eliminate naming confusion between agent instances and agent files |

## Step 0: Fix the Data Layer

### Problem

The current schema has structural issues from the v2 migration:

- `AgentTable.feature_id` references `ProjectTable.id` instead of `FeatureTable.id`
- `ProductTable` and `ProjectTable` both represent "a directory with a git root" — redundant identity
- `FeatureTable` exists but nothing points to it from agents

### Changes

**Consolidate `ProjectTable` → `ProductTable`:**

The `ProjectTable` schema:

```
id, name, worktree, git_root, ...Timestamps
```

The `ProductTable` schema:

```
id, name, directory, git_root, ...Timestamps
```

These are the same entity. Consolidate by:

1. Dropping `ProjectTable`. Renaming `ProductTable.directory` to match the field that `Instance` and bootstrap use (or updating those consumers).
2. All code that imports `ProjectTable` switches to `ProductTable`.
3. The `project.ts` module (`packages/opencode/src/project/project.ts`) is refactored into `product/index.ts` (see Step 2).

**Fix FK chain:**

```
ProductTable (id)
    ↓ product_id
FeatureTable (id)
    ↓ feature_id
AgentTable (id)
```

- `FeatureTable.product_id` → `ProductTable.id` (already correct)
- `AgentTable.feature_id` → `FeatureTable.id` (currently points to ProjectTable — fix this)

**Migration:**

New migration file: `packages/opencode/migration/<timestamp>_phase1_foundation/migration.sql`

Since data loss is accepted:

- Drop `project`, `agent` tables
- Recreate `product` table (consolidated from project + product)
- Recreate `agent` table with `feature_id` referencing `feature` table
- Keep `feature` table as-is (already correct schema)

### Files affected

- `packages/opencode/src/product/product.sql.ts` — updated to be the single source of truth
- `packages/opencode/src/project/project.sql.ts` — deleted
- `packages/opencode/src/agent/agent.sql.ts` — FK updated to FeatureTable
- `packages/opencode/src/storage/schema.ts` — export ProductTable instead of ProjectTable
- `packages/opencode/migration/<timestamp>/migration.sql` — new migration
- `packages/opencode/migration/<timestamp>/snapshot.json` — new snapshot

## Step 1: Namespace Rename

### Agent → AgentDef

The `Agent` namespace in `agent/agent.ts` defines agent types ("general", "title", "opendesign-agent", etc.). These are configuration/definitions, not instances.

Rename:

- `Agent` namespace → `AgentDef`
- `agent/agent.ts` → `agent/agent-def.ts`
- `Agent.Info` → `AgentDef.Info`
- `Agent.list()` → `AgentDef.list()`

### AgentSession → Agent

The `AgentSession` namespace in `agent/index.ts` manages agent instances (CRUD, messages, state). In the new model, this IS what an "agent" is.

Rename:

- `AgentSession` namespace → `Agent`
- Stays in `agent/index.ts` (it's the main export of the agent module)
- `AgentSession.Info` → `Agent.Info`
- `AgentSession.create()` → `Agent.create()`
- `AgentSession.list()` → `Agent.list()`
- `AgentSession.get()` → `Agent.get()`

### Cascade

All files importing either namespace need updating. Key areas:

- Server routes (`server/routes/agent-session.ts`, `server/server.ts`)
- All tool implementations that reference `AgentSession`
- Agent sub-modules (`prompt.ts`, `llm.ts`, `compaction.ts`, `revert.ts`, `status.ts`, `summary.ts`, `todo.ts`, etc.)
- Test files (`test/` directory)
- CLI commands (`cli/cmd/`)
- Web package (`packages/web/`)

The route file `agent-session.ts` stays named that way (it's the route definition for agent session operations) but its internal imports change.

## Step 2: Product & Feature Business Logic

### Product Namespace (`packages/opencode/src/product/index.ts`)

Absorbs the directory/VCS scoping responsibilities from the old `project.ts`. The `Instance` system uses this to scope state per-directory.

```typescript
export namespace Product {
  export const Info = z.object({
    id: z.string(),
    name: z.string(),
    directory: z.string(),
    gitRoot: z.string().optional(),
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: BusEvent("product.created", Info),
    Updated: BusEvent("product.updated", Info),
    Deleted: BusEvent("product.deleted", z.object({ id: z.string() })),
  }

  export function create(input: { name: string; directory: string; gitRoot?: string }): Promise<Info>
  export function get(id: string): Promise<Info>
  export function list(input?: { directory?: string }): Generator<Info>
  export function remove(id: string): Promise<void>
  export function update(input: { id: string; name?: string }): Promise<Info>
}
```

**Integration with Instance:** The `Instance.provide()` middleware currently resolves a directory and creates a Project record. This will resolve/create a Product record instead. The `Instance.state()` scoping mechanism stays the same — it scopes state to a directory, which is what a Product is.

### Feature Namespace (`packages/opencode/src/feature/index.ts`)

```typescript
export namespace Feature {
  export const Info = z.object({
    id: z.string(),
    productID: z.string(),
    name: z.string(),
    branch: z.string(),
    status: z.enum(["active", "completed", "archived"]).default("active"),
    figmaUrl: z.string().optional(),
    canvasState: z.any().optional(),
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: BusEvent("feature.created", Info),
    Updated: BusEvent("feature.updated", Info),
    Deleted: BusEvent("feature.deleted", z.object({ id: z.string() })),
  }

  export function create(input: { productID: string; name: string; branch: string; figmaUrl?: string }): Promise<Info>
  export function get(id: string): Promise<Info>
  export function list(input: { productID: string }): Generator<Info>
  export function remove(id: string): Promise<void>
  export function update(input: {
    id: string
    name?: string
    status?: string
    figmaUrl?: string
    canvasState?: unknown
  }): Promise<Info>
}
```

### project.ts Migration

The existing `project.ts` handles:

1. Directory discovery — finding/creating a project record for a directory
2. VCS integration — git root detection
3. Migration from global state — already gutted to a no-op

Items 1 and 2 move into `Product` namespace. The `migrateFromGlobal` no-op is deleted. Any helper functions in `project.ts` that `Instance` depends on are absorbed into `product/index.ts`.

`project/instance.ts` (`Instance` module) is updated to import `Product` instead of `Project`.

## Step 3: API Routes

### New: Product Routes (`/product`)

| Method | Path                  | Operation ID     | Description       |
| ------ | --------------------- | ---------------- | ----------------- |
| GET    | `/product`            | `product.list`   | List all products |
| POST   | `/product`            | `product.create` | Create a product  |
| GET    | `/product/:productID` | `product.get`    | Get a product     |
| PUT    | `/product/:productID` | `product.update` | Update a product  |
| DELETE | `/product/:productID` | `product.remove` | Delete a product  |

### New: Feature Routes (`/feature`)

| Method | Path                  | Operation ID     | Description                        |
| ------ | --------------------- | ---------------- | ---------------------------------- |
| GET    | `/feature`            | `feature.list`   | List features (query: `productID`) |
| POST   | `/feature`            | `feature.create` | Create a feature                   |
| GET    | `/feature/:featureID` | `feature.get`    | Get a feature                      |
| PUT    | `/feature/:featureID` | `feature.update` | Update a feature                   |
| DELETE | `/feature/:featureID` | `feature.remove` | Delete a feature                   |

### Renamed: Agent Session Routes (`/session` → `/agent-session`)

The route file `agent-session.ts` is unchanged internally (just import renames from Step 1). The mount point in `server.ts` changes:

```typescript
// Before
.route("/session", AgentSessionRoutes())
// After
.route("/agent-session", AgentSessionRoutes())
```

All operation IDs update from `agent.session.*` to `agent.*`:

- `agent.session.list` → `agent.list`
- `agent.session.get` → `agent.get`
- `agent.session.create` → `agent.create`
- `agent.session.abort` → `agent.abort`
- `agent.session.messages` → `agent.messages`
- etc.

### Renamed: Agent Files Routes (`/agent` → `/agent-files`)

```typescript
// Before
.route("/agent", AgentFilesRoutes())
// After
.route("/agent-files", AgentFilesRoutes())
```

Operation IDs update from `app.agents` (confusing) to `agent.files.*`.

Note: The `GET /agent` endpoint that lists agent definitions (AgentDef) is currently inline in `server.ts`. It stays inline with updated operation ID `agent-def.list` and path `/agent-def` to avoid collision with the agent session routes.

### SSE Events

Bus events already use the correct domain names after the namespace rename. The SSE stream in `server.ts` publishes whatever events are emitted on the Bus. No SSE-specific changes needed — event names update automatically when the namespace rename (Step 1) updates the `BusEvent` definitions.

## Step 4: SDK Regeneration

Run `./script/generate.ts` after Steps 1-3 are complete. This:

1. Starts the server with `bun dev generate`
2. Extracts OpenAPI spec from the `/doc` endpoint
3. Generates TypeScript SDK in `packages/sdk/js/`
4. Runs formatter

The generated SDK will have:

- New types: `Product`, `Feature`
- Renamed types: `AgentSession` → `Agent` (following the operation ID changes)
- New methods: `client.product.list()`, `client.feature.create()`, etc.
- Renamed methods: `client.session.*` → `client.agent.*` (or however the SDK generator maps the new operation IDs)

Verify by inspecting the generated `packages/sdk/js/src/client.ts` after regeneration.

## Step 5: Frontend Routing & Feature Page

### New Routes

In `packages/app/src/app.tsx`:

```typescript
// Existing (keep)
<Route path="/project/:projectId" component={ProjectLayout}>
  <Route path="/" component={SessionIndexRoute} />
  <Route path="/session/:id?" component={SessionRoute} />
</Route>

// New
<Route path="/product/:productId" component={ProductLayout}>
  <Route path="/" component={ProductHomeRoute} />
  <Route path="/feature/:featureId" component={FeatureRoute} />
</Route>
```

The existing `/project/...` routes stay functional. OpenDesign navigation uses `/product/...` routes.

### ProductLayout

Minimal layout component (similar to `ProjectLayout`):

- Sets up the Product context (which product is active)
- Renders sidebar + main content area
- Passes `productId` from URL params to context

### feature.tsx — Canvas-Primary Layout

New page: `packages/app/src/pages/feature.tsx`

Layout structure:

```
┌─────────────────────────────────────────────────┐
│  Feature Header (feature name, status, actions)  │
├──────────────────────────┬──────────────────────┤
│                          │  Agent Chat Sidebar   │
│                          │  ┌──────────────────┐ │
│     Canvas Area          │  │ Agent Tabs/List   │ │
│     (placeholder for     │  ├──────────────────┤ │
│      Phase 2 canvas)     │  │ MessageTimeline   │ │
│                          │  │ (for selected     │ │
│                          │  │  agent)           │ │
│                          │  ├──────────────────┤ │
│                          │  │ Composer          │ │
│                          │  └──────────────────┘ │
├──────────────────────────┴──────────────────────┤
│  (optional) File Tabs / Terminal                 │
└─────────────────────────────────────────────────┘
```

- **Canvas area**: Placeholder div in Phase 1. This is where the HTML infinite canvas will render in Phase 2.
- **Agent chat sidebar**: Resizable panel showing the chat thread for the currently selected agent (`?agent=` query param). Reuses `MessageTimeline` and composer components from `session/`.
- **Agent list**: Shows all agents for this feature. Clicking one sets `?agent=` and shows its chat.

### AgentChatProvider

New context provider: `packages/app/src/context/agent-chat.tsx`

Wraps the existing sync/prompt infrastructure, scoped to a single agent ID:

```typescript
export function AgentChatProvider(props: ParentProps & { agentID: string }) {
  // Syncs messages for this specific agent
  // Provides prompt submission targeting this agent
  // Provides agent status/metadata
}

export function useAgentChat() {
  // Returns: messages, sendPrompt, status, agent info
}
```

This is consumed by `MessageTimeline` and the composer when rendered inside the feature page's agent sidebar. The components don't know they're in OpenDesign — they just consume the context.

For Phase 1, only one agent chat is active at a time (whichever `?agent=` points to). Multi-agent simultaneous sync is a future optimization.

### session.tsx — Untouched

No OpenDesign route points to `session.tsx`. It stays functional at `/project/:projectId/session/:id`. No changes, no dead code removal, no risk.

## Step 6: Frontend Sidebar Rewiring

### Cosmetic Rename

The existing sidebar in `packages/app/src/pages/layout/` shows:

- Workspace tiles → **not applicable** (workspaces already removed)
- Project list → rename labels to "Products"
- Session list within a project → rename labels to "Features"

This is label/text changes in:

- `sidebar-project.tsx` → references "products" in UI text
- `sidebar-items.tsx` → list items link to `/product/:id/feature/:id` instead of `/project/:id/session/:id`

### Context Provider Updates

Existing providers that need updating:

| Provider            | File                        | Change                                                                                     |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `workspace.tsx`     | `context/workspace.tsx`     | May be dead code — workspaces removed. Verify and delete if unused.                        |
| `sync.tsx`          | `context/sync.tsx`          | Keep for session page. `AgentChatProvider` handles feature page sync.                      |
| `agents.tsx`        | `context/agents.tsx`        | Update imports from new SDK types (AgentDef instead of Agent)                              |
| `project-scope.tsx` | `context/project-scope.tsx` | Either rename to product-scope or add a product-scope alongside                            |
| `sdk.tsx`           | `context/sdk.tsx`           | Update SDK client method calls (`.session.*` → `.agent.*`, add `.product.*`, `.feature.*`) |
| `global-sync.tsx`   | `context/global-sync.tsx`   | Update to sync products/features instead of projects/sessions                              |

New providers:

- `context/product.tsx` — active product context (from URL param)
- `context/feature.tsx` — active feature context (from URL param)
- `context/agent-chat.tsx` — per-agent chat context (described above)

## Testing Strategy

### Backend

- Unit tests for `Product` namespace: create, get, list, remove, update
- Unit tests for `Feature` namespace: same
- Integration test: create Product → create Feature → create Agent → verify FK chain works
- Verify migration runs cleanly on fresh DB
- Verify SDK generation produces correct types

### Frontend

- `feature.tsx` renders without errors
- Navigation: sidebar → product → feature → feature page loads
- Agent chat: select agent → `MessageTimeline` renders messages → composer sends prompt
- URL deep-linking: `/product/:id/feature/:id?agent=xyz` selects correct agent

### Regression

- Existing `/project/:projectId/session/:id` routes still work
- `session.tsx` renders correctly (no broken imports from rename)
- All existing tests pass after namespace rename (update imports in test files)

## What This Phase Does NOT Include

- HTML infinite canvas (Phase 2 — the canvas area in feature.tsx is a placeholder)
- Figma paste/import pipeline (Phase 3)
- DevTools-style inspect overlay (Phase 3)
- Annotation system and agent spawning from canvas (Phase 3-4)
- Variation grid with Sandpack iframes (Phase 4)
- Checkpoint system (Phase 4)
- Design System panel (Phase 5)
- Visual redesign of home page or sidebar (cosmetic — later)
- Multi-agent simultaneous sync (optimization — later)
