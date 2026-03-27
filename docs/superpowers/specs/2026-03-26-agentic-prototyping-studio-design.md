# Agentic Prototyping Studio — Design Spec

## Overview

OpenDesign is an agentic prototyping studio. Users paste a Figma design URL onto the canvas, immediately see the design as a raster image, then explore it through annotation-driven agent workflows that generate interactive Sandpack prototypes. Users approve variations (updating the live prototype in-place), checkpoint progress, and can restore or fork from any point. The final output is a working interactive prototype built from approved explorations, committed back to the Product's mono repo.

**Not a design tool.** Not a Figma clone. A spatial exploration surface where designs become interactive prototypes through direct annotation and agent collaboration.

## Information Architecture

### Product → Feature Hierarchy

The user-facing hierarchy replaces the previous Workspace → Project model:

- **Product** — A mono repo representing a single product (e.g., "Acme Dashboard", "Acme Mobile"). The main branch holds shared design systems, component registries, tokens, and shared configuration. Products are independent — each has its own codebase.
- **Feature** — An exploration context within a Product (e.g., "Onboarding Flow", "Settings Redesign", "Checkout v2"). Each Feature works on branches off the Product's main. When a Feature is complete, its approved changes merge back to main.
- **Agent** — Spawned per annotation on the canvas. Each agent works on a branch, exploring variations for a specific component or section. Agents have their own chat thread in the sidebar but the primary interaction is through canvas annotations.

```
Product: "Acme Dashboard" (mono repo, main branch)
├── Design Systems: ["Acme Brand v2"] (synced from Figma)
├── Shared config: component registry, tokens.css, MCP settings
├── Feature: Onboarding Flow (branch: feature/onboarding)
│   ├── Agent 1: Hero section exploration (branch: agent/hero-v1)
│   ├── Agent 2: Form layout exploration (branch: agent/form-v1)
│   └── Checkpoints: v1 (import), v2 (hero approved), v3 (form approved)
├── Feature: Checkout v2 (branch: feature/checkout-v2)
│   └── Agent 3: Cart component exploration (branch: agent/cart-v1)
└── Feature complete → merge feature/onboarding → main
```

### No Orchestrator Session

There is no master chat or orchestrator session. The user is the orchestrator — they work spatially on the canvas, annotate components, and spawn agents directly. Each agent has a chat thread in the sidebar (the technical "session"), but users never think in terms of "sessions." They think: "I'm working on the Onboarding feature of Acme Dashboard."

### Design Systems as First-Class Entities

Design systems are independent entities, not tied to a single Product. They can be shared across Products or used exclusively by one.

A design system contains:
- **Tokens** — Colors, spacing, typography, radii, shadows, opacity (from Figma variables).
- **Components** — Component catalog with variants and properties (from Figma library components).
- **Styles** — Named styles for fills, text, effects, grids.
- **Source** — Link to the Figma file/library it was imported from.
- **Sync state** — Last synced timestamp, diff since last sync.

#### Design System Panel

A dedicated panel in the UI shows:

- All imported design systems with sync status and last updated timestamp.
- Which Products use each design system.
- Token/component counts and categories.
- Manual re-sync button (pulls latest from Figma MCP).
- Diff view showing tokens/components added, changed, or removed since last sync.
- Link back to source Figma file.

#### Backend Sync

On Product load or first paste, the system syncs design systems in the background:

1. Fetches latest components and variables from Figma MCP.
2. Updates the design system registry and generates a shared config file (`design-system.json`) in the Product's main branch.
3. Generates `tokens.css` (CSS custom properties with `--od-*` prefix) stored on main.
4. When new agents are spawned, they reference this shared config — no re-fetching needed.
5. If Figma data has changed since last sync, a diff is shown in the Design System Panel.

This config lives on the Product's main branch, so all Feature branches and agent branches inherit it automatically via git. Changes to the design system are committed to main and propagated to all branches.

## Core Workflow

1. **Paste Figma URL** — User copies a frame URL from Figma (`Cmd+L`) and pastes it directly on the canvas. No explicit import button — pasting is the only input mechanism.
2. **Immediate Raster Display** — The system immediately fetches and displays a raster image (PNG) of the pasted frame on the canvas. The user sees their design within seconds, before any processing happens. In parallel, the system fetches the full node tree, components, and tokens.
3. **Inspect Mode** — The raster image has Chrome DevTools-style inspect mode. Users hover to highlight elements, click to select components — identical to browser element inspection. This interaction model is consistent across both the initial raster image and any agent-generated Sandpack prototypes.
4. **Design System Sync** — In the background, the system syncs the design system (components + tokens) to the Product's shared config on the main branch. If this is the first import, the full design system is pulled. Otherwise, a diff sync updates only what changed.
5. **Base Prototype Generation** — An AI agent generates a base Sandpack prototype from the Figma data, using the synced design system's components and tokens. Once ready, the live Sandpack replaces the raster image as the primary view (raster becomes a toggleable reference layer).
6. **Select & Annotate** — User selects components via the inspect mode (on either the raster or the live prototype). Annotation popover provides: prompt input, agent tag, variation count, design system slider, and enrichment options.
7. **Agent Explores** — Agent receives component metadata, current prototype code, design system config (from main branch), enrichments, and project context from the files tab. Generates N Sandpack variation bundles rendered as iframes on the canvas.
8. **Approve & Checkpoint** — User approves a variation; its code swaps into the live prototype. An auto-checkpoint is saved. Unapproved variations dim to 30% opacity but remain accessible.
9. **Iterate** — Multiple agents explore different components simultaneously. Each approval updates the prototype and creates a checkpoint. Users can restore, fork, or compare checkpoints.
10. **Complete Feature** — When exploration is done, the Feature's approved prototype code merges back to the Product's main branch.

## MCP Configuration

### Multi-MCP Support

As a fork of OpenCode, the system supports multiple MCP servers. Figma MCP is the default but the system is resilient to unavailability:

**Fallback Chain:**
1. **Figma Official MCP** (default) — Remote server, OAuth-authenticated, full capabilities.
2. **Figma Console MCP** (fallback) — Local MCP via Figma desktop app WebSocket. Used if the official MCP is unavailable (e.g., auth issues, rate limits, offline).
3. **User-configured MCPs** — Users can add any additional MCP servers via the standard OpenCode MCP configuration (project-level `opencode.json` or global config).

The system auto-detects which Figma MCP is available on startup and falls back gracefully. Users can also explicitly select which MCP to use in settings.

## Canvas Architecture

The primary canvas is an HTML/CSS infinite canvas (SolidJS), not the existing Rust/WASM canvas. This is necessary because the canvas must host Sandpack iframes, annotation popovers, and standard web interactions.

### Layers (bottom to top)

- **Layer 0 — Infinite Canvas**: Pan, zoom, grid, background, coordinate system. Standard HTML transform-based infinite canvas with wheel zoom and pointer-drag panning.
- **Layer 1 — Content**: Raster images, Sandpack iframes (main prototype + variation previews), variation layout.
- **Layer 2 — Interaction**: DevTools-style inspect overlay, hover highlights, selection outlines, annotation popovers, design system slider, context menus.
- **Layer 3 — Overlay (future, P2)**: Rust/WASM canvas for GPU-accelerated visual diff rendering between checkpoints.

### Why HTML over Rust/WASM

The canvas needs to embed Sandpack iframes, render text annotations, show popovers, and handle standard web interactions (right-click menus, tooltips, drag-and-drop). All of this is trivial in HTML/CSS and extremely difficult in a GPU canvas. The Rust/WASM canvas is preserved for future visual diff overlays where GPU acceleration actually matters.

## Component Interaction Model

### DevTools-Style Inspect Mode

The inspect mode works identically on both the initial raster image (using the Figma node tree hit-map) and on live Sandpack prototypes (using DOM inspection). This gives users a single, consistent interaction model throughout the entire workflow.

**On raster images:** Hit regions are derived from the Figma node tree's `absoluteBoundingBox` data, overlaid invisibly on the raster.

**On Sandpack prototypes:** The Sandpack iframe exposes component boundaries via a lightweight bridge script that maps DOM elements to their component names and design system references.

### Selection Behavior

- **Default**: No visible boxes. The design/prototype looks untouched.
- **Hover**: Subtle semi-transparent highlight (`rgba(99,102,241,0.08)`) with faint 1px border. Component name and type appear as a small tooltip (like Chrome DevTools element labels).
- **Selected**: Thin 2px selection outline. Annotation anchor (a `+` button) appears at the corner.
- **Multi-select**: `Shift+click` to select multiple components for a grouped annotation.
- **Parent traversal**: `Alt+hover` to select the parent component instead of the deepest match.

The goal is to feel like inspecting a real UI, not interacting with a wireframe overlay.

### Annotation Popover

When a component is selected, an annotation popover appears with:

- **Prompt input** — Free-text instruction for the agent ("Explore variations for this CTA section").
- **Agent tag** — Which agent to dispatch (e.g., `@prototype`).
- **Variation count** — How many variations to generate (default: 4).
- **Design System slider** — Spectrum from "Design System" (strict: only existing components/tokens) to "Creative Freedom" (agent explores new patterns freely). Persists per annotation.
- **Enrichments** — Optional: personas, data scenarios, states (empty/loading/error/success), modes (light/dark, mobile/desktop). Some AI-recommended based on component type.

### Agent Sidebar

Each annotation spawns an agent with its own chat thread accessible in the sidebar. The canvas annotation is the primary interaction surface; the sidebar chat is for follow-up refinement. Agents are color-coded on the canvas.

## Variation Exploration

### Layout

When an agent generates variations, they render as a grid of Sandpack iframes near the selected component on the canvas. Each variation shows:

- A live interactive preview (Sandpack iframe).
- A brief label/rationale from the agent.
- An approve button (checkmark).

All variation previews also support the same DevTools-style inspect mode, so users can drill into any variation's components before approving.

### Approval Flow

1. User clicks approve on a variation.
2. The variation's code replaces the corresponding section in the main Sandpack prototype.
3. The prototype updates in-place — the live preview reflects the change immediately.
4. An auto-checkpoint is saved with a descriptive label (e.g., "v3 · Carousel → full-bleed hero").
5. Unapproved variations dim to 30% opacity but remain on the canvas.
6. Clicking a dimmed variation allows restoring it or re-exploring from it.

### Multiple Agents

Multiple agents can explore different components simultaneously. Approving one agent's work does not affect others. After approval, other agents see the updated prototype state (so their next variations account for changes).

## Checkpoint System

### Storage

Each checkpoint stores:

- **Sandpack file bundle** — Complete prototype code at that point.
- **Metadata** — Label, timestamp, agent ID, component name, parent checkpoint ID.
- **Exploration context** — Which variations were generated, which was approved.

### Timeline UI

A checkpoint timeline (at the bottom of the canvas or in a sidebar panel) shows the linear history of approvals. Operations:

- **Restore** — Reverts the prototype to a checkpoint's Sandpack files.
- **Fork** — Creates a new exploration branch from any past checkpoint.
- **Compare** — Side-by-side Sandpack renders of any two checkpoints.

### Relationship to Git

Checkpoints are lightweight Sandpack snapshots stored within the Feature branch. They provide fast undo/redo within a Feature exploration. When a Feature is complete, the final approved state is the code that gets merged to the Product's main branch.

## Design System Integration

### Source

Design system data is fetched via MCP (with fallback chain). Primary tools:

- `get_library_components` — Full component catalog with variants (local + external team libraries).
- `figma_get_variables` — Design tokens: colors, spacing, typography, radii, shadows, opacity.
- `get_design_system_summary` — High-level overview for agent context.

External team libraries are accessible as long as they are enabled in the user's Figma file.

### Shared Config on Main Branch

The design system is processed and stored on the Product's main branch:

```
product-repo/
├── .opendesign/
│   ├── design-system.json    # Component catalog + token definitions
│   ├── tokens.css            # Generated CSS custom properties (--od-*)
│   └── mcp.json              # MCP server configuration
├── src/                      # Prototype source code
└── ...
```

This means:
- All Feature branches inherit the design system automatically.
- Agents reference `design-system.json` directly — no MCP calls needed during exploration.
- Token CSS is injected into all Sandpack instances from the shared file.
- Design system updates are committed to main and propagated to branches via git merge/rebase.

### Design System Slider

The slider position modulates the agent's system prompt:

- **0% (Design System)**: "Use ONLY the provided components and tokens. Do not introduce new patterns."
- **50% (Balanced)**: "Prefer the provided design system but deviate when it improves the outcome. Justify deviations."
- **100% (Creative Freedom)**: "Explore freely. Use any pattern, layout, or styling approach. The design system is reference, not constraint."

The slider persists per annotation — different sections of the design can have different creativity levels.

## Figma Import Pipeline

### URL Parsing

Parse the Figma URL to extract `fileKey` and `nodeId`:
```
https://www.figma.com/design/{fileKey}?node-id={nodeId}
```
Existing `parseFigmaUrl()` function handles this.

### Raster-First Pipeline

The import is a two-phase process optimized for immediate visual feedback:

**Phase 1 — Immediate (< 2 seconds):**
1. Parse the pasted URL.
2. Call `figma_get_image(fileKey, nodeId)` → Raster PNG.
3. Display the raster image on the canvas at the paste location.
4. User immediately sees their design.

**Phase 2 — Background (5-15 seconds):**
1. `figma_get_file_data(fileKey, nodeId, depth)` → Full node tree.
2. `get_library_components(fileKey)` → Component catalog.
3. `figma_get_variables(fileKey)` → Design tokens.
4. Build component hit-map from node tree.
5. Sync design system to Product main branch (if changed).
6. Once complete, enable inspect mode overlay on the raster image.
7. Trigger base prototype generation agent.

### Hit-Map Builder

The node tree JSON is processed into a component hit-map:

- Each node with `type: "COMPONENT"` or `type: "INSTANCE"` becomes a hit region.
- Position and dimensions from `absoluteBoundingBox` are mapped to canvas coordinates (relative to the frame origin).
- Nested components use the deepest match for hover, with `Alt` for parent traversal.
- The hit-map is stored as a flat array of `{ nodeId, name, componentName, x, y, width, height, parentId }`.

### Base Prototype Generation

After Phase 2 completes, an AI agent generates the initial Sandpack prototype:

- Input: Raster image, node tree, component catalog, design tokens.
- Output: Sandpack file bundle (`App.tsx`, `index.tsx`, `tokens.css`, component files).
- The agent uses the design system components and tokens from the Product's shared config.
- Once generated, the Sandpack prototype replaces the raster as the primary view.
- The raster becomes a toggleable "Original Design" reference layer.
- This is the starting point for all exploration — the "v1" checkpoint.

## Existing Code Reuse

### Kept and Extended

| Module | Location | Usage |
|--------|----------|-------|
| Design system registry | `packages/opendesign/src/design-system/` | Store imported components + tokens |
| Token CSS generation | `packages/opendesign/src/design-system/tokens.ts` | `tokensToStylesheet()` for Sandpack injection |
| Sandpack scaffolding | `packages/opendesign/src/sandpack/instance.ts` | `scaffoldReactFiles()`, `updateSandpackFiles()` |
| Agent orchestrator | `packages/opendesign/src/agent/orchestrator.ts` | Dispatch and manage exploration agents |
| Agent lifecycle | `packages/opendesign/src/agent/lifecycle.ts` | State machine for agent status |
| Figma types | `packages/opendesign/src/types/figma.ts` | `FigmaFrame`, `FigmaSelection`, `FigmaTokenRef` |
| Figma URL parsing | `packages/app/src/pages/session/figma-tab-content.tsx` | `parseFigmaUrl()` |
| Figma OAuth | `packages/desktop-electron/src/main/figma-oauth.ts` | OAuth flow for MCP authentication |
| OpenCode server | `packages/opencode/src/server/` | API server, SSE, MCP management |
| Agent sidebar/chat | `packages/app/src/pages/session/` | Chat thread UI per agent |
| Files tab | `packages/app/src/` | Project context for agents |
| MCP configuration | `packages/opencode/src/mcp/` | Multi-MCP support, fallback chain |

### Removed

| Module | Location | Reason |
|--------|----------|--------|
| opendesign-figma-mcp | `packages/opendesign-figma-mcp/` | Replaced by Figma's official MCP (kept as fallback option) |
| figma-write.txt | `packages/opencode/src/agent/prompt/figma-write.txt` | No write-back to Figma for MVP |
| figma-ws.ts | `packages/desktop-electron/src/main/figma-ws.ts` | No local plugin bridge needed for primary flow |
| canvas-bridge.ts | `packages/app/src/utils/canvas-bridge.ts` | Replaced by HTML canvas |
| SVG agent-sandbox canvas | `packages/app/src/pages/session/agent-sandbox/` | Replaced by HTML canvas with Sandpack |
| design.txt agent prompt | `packages/opencode/src/agent/prompt/design.txt` | Replaced by variation generation prompt |
| Rust/WASM as primary canvas | `packages/canvas-core/`, `packages/canvas-wasm/` | Moves to P2 visual diff overlay only |

### New Code Required

| Component | Description |
|-----------|-------------|
| Product/Feature data model | Product as mono repo, Feature as branch, agent as sub-branch |
| HTML infinite canvas | Pan/zoom container with grid, SolidJS |
| DevTools-style inspect overlay | Shared across raster images and Sandpack prototypes |
| Figma MCP client with fallback | Integration with official MCP + console MCP fallback |
| Component hit-map builder | Node tree → bounding box regions |
| Annotation system | Popovers, prompt input, agent tagging |
| Design-to-code agent prompt | Figma data → base Sandpack prototype |
| Variation agent prompt | Component context → N variation bundles |
| Checkpoint store | Sandpack snapshot storage + metadata |
| Checkpoint timeline UI | Restore, fork, compare operations |
| DS slider component | Slider UI + agent prompt modulation |
| Variation preview grid | Sandpack iframe grid + approve/dim behavior |
| Design System Panel | DS management UI: sync status, diff, re-sync, multi-Product |
| Design system backend sync | Auto-sync on load, shared config generation, diff detection |
| Sandpack inspect bridge | Lightweight script in Sandpack iframes for component inspection |

## Post-MVP

- **Figma write-back** — Push approved designs back to Figma using `use_figma` MCP tool, creating components from approved variations.
- **Rust/WASM visual diff overlay** — GPU-accelerated side-by-side or overlay comparison between checkpoints.
- **Non-Figma inputs** — Paste screenshot, URL, or text description to start exploration without Figma.
- **Component extraction** — Create reusable components from approved variations, add to design system.
- **Scenario matrix** — Generate a grid of variations across multiple dimensions (persona × state × mode).
- **Cross-Product design system sharing** — UI for linking design systems across Products and managing shared vs. forked tokens.

## Long-Term Vision

### Full Product Prototyping

Over time, a Product's entire UI gets prototyped through this workflow. Each Feature contributes approved prototypes back to the Product's main branch, building up a complete, interactive representation of the product. The mono repo accumulates all design decisions, component implementations, and token configurations — becoming the living source of truth for how the product looks and behaves.

### Files & Context System

The existing Files tab evolves into a structured context system with scoped levels:

- **Global context** — Organization-wide guidelines, brand rules, accessibility standards. Applied to all Products.
- **Product context** — Product-specific PRDs, architecture docs, user research, design principles. Applied to all Features within the Product.
- **Feature context** — Feature-specific requirements, user stories, edge cases, stakeholder feedback.

**Context delivery to agents:**
- **Rules and guidelines** (small, critical) → Injected directly into agent context window as system instructions.
- **Reference documents** (large, supplementary) → Indexed and stored in RAG. Agents query on-demand when they need specific information (e.g., "what does the user research say about checkout abandonment?").

This separation ensures agents have the rules they must follow in their context window without bloating it with large reference documents.

### MCP as Integration Layer

MCPs serve as the general integration layer beyond Figma:

- **Jira/Linear** — Import tickets and requirements as Feature context. Agents can reference acceptance criteria while prototyping.
- **Storybook** — Sync component documentation and usage examples alongside design system components.
- **Analytics** — Pull usage data to inform design decisions (e.g., "users drop off at step 3 of checkout").
- **CMS** — Pull real content for prototypes instead of placeholder text.
- **GitHub/GitLab** — Sync with existing codebases for component parity checking.

Users configure MCPs at the Product level. The system doesn't prescribe which integrations to use — it provides the MCP infrastructure and users connect what they need.

These are P2 features. The MVP focuses on Figma MCP as the primary integration, with the architecture designed to support additional MCPs without structural changes.
