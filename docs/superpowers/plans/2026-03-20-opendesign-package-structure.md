# Plan: `packages/opendesign` Package Structure

> Created: 2026-03-20

## Package Purpose

`packages/opendesign` is the **product-specific domain layer** between the opencode engine (`@opencode-ai/sdk`) and the SolidJS UI (`packages/app`). It contains all OpenDesign business logic: orchestration, canvas state, design system registry, Figma bridge, Sandpack management, git branching model.

**It IS:** canvas graph state, agent node lifecycle, design system registry, Figma bridge logic, Sandpack file management, git operations client, simulation configs, context system data, shared TypeScript types.

**It is NOT:** UI components (`packages/ui`/`packages/app`), server logic (`packages/opencode`), the SDK itself, WASM canvas rendering (`packages/canvas-wasm`).

---

## Directory Structure

```
packages/opendesign/
  package.json
  tsconfig.json
  happydom.ts
  src/
    index.ts                         — barrel export

    types/
      index.ts                       — re-exports all types
      node.ts                        — FrameNode, AgentNode, PersonaNode, ContextNode, CheckpointNode, MergedNode
      agent-state.ts                 — Agent lifecycle: created | working | waiting | ready | approved | archived
      design-system.ts               — DesignSystemEntry, TokenSet, ComponentRef
      persona.ts                     — Persona config: role, viewport, language, a11y, network
      simulation.ts                  — SimulationMode, ViewportPreset, A11yFilter
      project.ts                     — OpenDesignProject metadata extending base Project
      context-doc.ts                 — ContextDocument, ContextDocType
      figma.ts                       — FigmaFrame, FigmaSelection, FigmaTokenRef
      sandpack.ts                    — SandpackInstance, SandpackFileMap
      git.ts                         — BranchInfo, CheckpointInfo, MergeResult

    canvas/
      index.ts
      graph-store.ts                 — SolidJS store for React Flow graph (nodes, edges, viewport)
      node-layout.ts                 — auto-layout: position new nodes, edge generation
      node-factory.ts                — create typed nodes: createFrameNode(), createAgentNode(), etc.
      node-visibility.ts             — IntersectionObserver for iframe pause/resume (max 5 active)
      focus-mode.ts                  — enter/exit focus mode, WASM canvas activation

    figma/
      index.ts
      parse.ts                       — MIGRATED from packages/app/src/utils/figma.ts
      bridge.ts                      — Electron webview message protocol: selection, token extraction
      tokens.ts                      — extractTokensFromFigma(), tokensToCss(), token diffing

    sandpack/
      index.ts
      instance.ts                    — createSandpackInstance(): file map, hot reload bridge
      files.ts                       — mapBranchToSandpackFiles(): branch files via SDK → SandpackFileMap
      inspector.ts                   — DOM element selection shim: message protocol

    git/
      index.ts
      branch.ts                      — createAgentBranch(), mergeToMain(), archiveBranch()
      checkpoint.ts                  — createCheckpoint(), listCheckpoints(), restoreCheckpoint()
      diff.ts                        — getVisualDiff(): merge conflict detection

    design-system/
      index.ts
      registry.ts                    — SolidJS store: workspace-level design system CRUD, persisted
      tokens.ts                      — token cache, sync from Figma, last-synced tracking
      components.ts                  — component list from npm + Figma

    context/
      index.ts
      documents.ts                   — context doc upload, .opendesign/context/ storage, type detection
      query.ts                       — RAG query interface (calls SDK endpoint)

    simulation/
      index.ts
      presets.ts                     — viewport presets, a11y filter definitions
      apply.ts                       — applySimulation(): CSS filter injection, iframe resize

    workspace/
      index.ts
      store.ts                       — MIGRATED from packages/app/src/context/workspace.tsx
      project-scope.ts               — MIGRATED from packages/app/src/context/project-scope.tsx

    agent/
      index.ts
      lifecycle.ts                   — agent node state machine transitions
      color.ts                       — MIGRATED from packages/app/src/utils/agent.ts
      orchestrator.ts                — pre-flight plan parsing, scenario dispatch

  test/
    canvas/
      graph-store.test.ts
      node-layout.test.ts
      node-factory.test.ts
      node-visibility.test.ts
    figma/
      parse.test.ts
    sandpack/
      instance.test.ts
      files.test.ts
    git/
      branch.test.ts
      checkpoint.test.ts
    design-system/
      registry.test.ts
      tokens.test.ts
    simulation/
      presets.test.ts
      apply.test.ts
    workspace/
      store.test.ts
    agent/
      lifecycle.test.ts
      color.test.ts
```

---

## Package Dependencies

```json
{
  "name": "@opencode-ai/opendesign",
  "version": "0.0.1",
  "type": "module",
  "dependencies": {
    "@opencode-ai/sdk": "workspace:*",
    "@opencode-ai/ui": "workspace:*",
    "@opencode-ai/util": "workspace:*",
    "solid-js": "catalog:",
    "zod": "catalog:",
    "remeda": "catalog:"
  },
  "devDependencies": {
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:",
    "typescript": "catalog:"
  },
  "scripts": {
    "typecheck": "tsgo --noEmit",
    "test": "bun test ./test"
  }
}
```

**No React Flow or Sandpack deps** — those are UI concerns in `packages/app`. This package exports data models and stores that those components consume.

---

## Migration Plan

| Source (`packages/app/src/`) | Destination (`packages/opendesign/src/`) | Notes                                                            |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `utils/figma.ts`             | `figma/parse.ts`                         | Verbatim. Update app imports to `@opencode-ai/opendesign/figma`. |
| `utils/agent.ts`             | `agent/color.ts`                         | Verbatim.                                                        |
| `context/workspace.tsx`      | `workspace/store.ts`                     | Extract store logic (no JSX). Provider wrapper stays in app.     |
| `context/project-scope.tsx`  | `workspace/project-scope.ts`             | Extract types + logic. JSX provider stays in app.                |
| `utils/canvas-bridge.ts`     | **Stays in app**                         | WASM DOM lifecycle — not this package's concern.                 |

---

## Key Design Decisions

1. **SolidJS stores, not React state.** `createStore` from `solid-js/store` for all state.
2. **No React Flow in this package.** Exports data (nodes, edges, operations). `<ReactFlow>` lives in app.
3. **SDK as transport.** All server communication via `@opencode-ai/sdk`. No direct HTTP.
4. **No JSX.** All files `.ts`. Context providers stay in `packages/app` as thin wrappers.
5. **Persist utility reuse.** Reuse `Persist` from app utils. If circular, extract to `@opencode-ai/util`.

---

## Build Order

### Phase A — Scaffold and migrations (first)

1. Create `packages/opendesign/` with package.json, tsconfig.json
2. Create `src/types/` — all type definitions (zero deps, unblocks everything)
3. Migrate `figma/parse.ts` (smallest, proves import pattern)
4. Migrate `agent/color.ts`
5. Create `workspace/store.ts` (extract from workspace.tsx)

### Phase B — Canvas data model

6. `canvas/graph-store.ts` — SolidJS store for nodes/edges
7. `canvas/node-factory.ts` — typed node creation
8. `canvas/node-layout.ts` — auto-layout
9. `canvas/node-visibility.ts` — iframe visibility
10. `canvas/focus-mode.ts`

### Phase C — Agent and Sandpack

11. `agent/lifecycle.ts` — state machine
12. `agent/orchestrator.ts` — pre-flight plan parsing
13. `sandpack/instance.ts` — file map management
14. `sandpack/files.ts` — branch-to-file-map
15. `sandpack/inspector.ts` — DOM selection

### Phase D — Design system and git

16. `design-system/registry.ts` — workspace store
17. `design-system/tokens.ts` — CSS generation
18. `design-system/components.ts` — component palette
19. `git/branch.ts` — branching model
20. `git/checkpoint.ts`

### Phase E — Context and simulation

21. `context/documents.ts` — doc upload/storage
22. `context/query.ts` — RAG query
23. `simulation/presets.ts` — viewport/a11y presets
24. `simulation/apply.ts` — CSS injection
25. `figma/bridge.ts` — webview protocol
26. `figma/tokens.ts` — token extraction

---

## Test Plan

All tests run via `cd packages/opendesign && bun test`.

**Unit tests (pure logic):**

- `figma/parse.test.ts` — URL parsing, embed URL building
- `canvas/node-layout.test.ts` — positioning algorithm
- `canvas/node-factory.test.ts` — node defaults
- `canvas/node-visibility.test.ts` — visibility thresholds
- `git/branch.test.ts` — branch name generation, slug validation
- `design-system/registry.test.ts` — CRUD operations
- `design-system/tokens.test.ts` — CSS custom property generation
- `simulation/presets.test.ts` — viewport dimensions, CSS generation
- `agent/lifecycle.test.ts` — state transitions, invalid transition rejection
- `agent/color.test.ts` — color mapping

**Integration tests (with mock SDK):**

- `sandpack/files.test.ts` — file map from mock branch data
- `workspace/store.test.ts` — workspace CRUD with persistence
- `canvas/graph-store.test.ts` — reactive node add/remove
