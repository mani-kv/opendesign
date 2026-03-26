# Agentic Prototyping Studio — Design Spec

## Overview

OpenDesign is an agentic prototyping studio. Users paste a Figma design URL, the system renders it as an interactive Sandpack prototype with selectable component regions, and agents explore variations on individual components. Users approve variations (updating the live prototype in-place), checkpoint progress, and can restore or fork from any point. The final output is a working interactive prototype built from approved explorations.

**Not a design tool.** Not a Figma clone. A spatial exploration surface where designs become interactive prototypes through annotation-driven agent workflows.

## Core Workflow

1. **Paste Figma URL** — User copies a frame URL from Figma (`Cmd+L`) and pastes it on the canvas.
2. **Figma MCP Fetch** — System calls Figma's official MCP server to retrieve: raster image (PNG), node tree (JSON with positions/dimensions), library components (with variants), and design variables/tokens.
3. **Base Prototype Generation** — An AI agent generates a base Sandpack prototype from the Figma data, using the imported design system's components and tokens. The raster image is stored as a toggleable "Original Design" reference layer.
4. **Canvas Render** — The HTML canvas shows the live Sandpack prototype with invisible bounding box hit regions overlaid, derived from the Figma component tree.
5. **Select & Annotate** — User hovers over the prototype; components highlight subtly. Clicking opens an annotation popover with: prompt input, agent tag, variation count, design system slider, and enrichment options.
6. **Agent Explores** — Agent receives component metadata, current prototype code, design system at the slider level, enrichments, and project context from the files tab. Generates N Sandpack variation bundles rendered as iframes on the canvas near the selected component.
7. **Approve & Checkpoint** — User approves a variation; its code swaps into the live prototype. An auto-checkpoint is saved. Unapproved variations dim to 30% opacity but remain accessible.
8. **Iterate** — Multiple agents can explore different components simultaneously. Each approval updates the prototype and creates a checkpoint. Users can restore, fork, or compare any checkpoints.

## Canvas Architecture

The primary canvas is an HTML/CSS infinite canvas (SolidJS), not the existing Rust/WASM canvas. This is necessary because the canvas must host Sandpack iframes, annotation popovers, and standard web interactions.

### Layers (bottom to top)

- **Layer 0 — Infinite Canvas**: Pan, zoom, grid, background, coordinate system. Standard HTML transform-based infinite canvas with wheel zoom and pointer-drag panning.
- **Layer 1 — Content**: Raster reference image (toggleable), Sandpack iframes (main prototype + variation previews), variation layout.
- **Layer 2 — Interaction**: Invisible bounding box hit regions, hover highlights, selection outlines, annotation popovers, design system slider, context menus.
- **Layer 3 — Overlay (future, P2)**: Rust/WASM canvas for GPU-accelerated visual diff rendering between checkpoints.

### Why HTML over Rust/WASM

The canvas needs to embed Sandpack iframes, render text annotations, show popovers, and handle standard web interactions (right-click menus, tooltips, drag-and-drop). All of this is trivial in HTML/CSS and extremely difficult in a GPU canvas. The Rust/WASM canvas is preserved for future visual diff overlays where GPU acceleration actually matters.

## Component Interaction Model

### Bounding Box Behavior

Bounding boxes are derived from the Figma node tree's `absoluteBoundingBox` data. They are invisible by default — the design looks untouched.

- **Default**: No visible boxes. Just the prototype.
- **Hover**: Subtle semi-transparent highlight (`rgba(99,102,241,0.08)`) with faint 1px border. Component name appears as a small tooltip.
- **Selected**: Thin 2px selection outline. Annotation anchor (a `+` button) appears at the corner.
- **Multi-select**: `Shift+click` to select multiple components for a grouped annotation.
- **Parent traversal**: `Alt+hover` to select the parent component instead of the deepest match.

The goal is to feel like selecting parts of the design directly, not interacting with a wireframe overlay.

### Annotation Popover

When a component is selected, an annotation popover appears with:

- **Prompt input** — Free-text instruction for the agent ("Explore variations for this CTA section")
- **Agent tag** — Which agent to dispatch (e.g., `@prototype`)
- **Variation count** — How many variations to generate (default: 4)
- **Design System slider** — Spectrum from "Design System" (strict: only existing components/tokens) to "Creative Freedom" (agent explores new patterns freely). Persists per annotation.
- **Enrichments** — Optional: personas, data scenarios, states (empty/loading/error/success), modes (light/dark, mobile/desktop). Some AI-recommended based on component type.

### Agent Sidebar

Each annotation spawns an agent with its own chat thread accessible in the sidebar. The canvas annotation is the primary interaction surface; the sidebar chat is for follow-up refinement. Agents are color-coded on the canvas.

## Variation Exploration

### Layout

When an agent generates variations, they render as a grid of Sandpack iframes near the selected component on the canvas. Each variation shows:

- A live interactive preview (Sandpack iframe)
- A brief label/rationale from the agent
- An approve button (checkmark)

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

Checkpoints are lightweight Sandpack snapshots, not git commits. They live in the session/project state. A future enhancement could export the final approved prototype as a git commit or branch.

## Design System Integration

### Source

Design system data comes exclusively from Figma's official MCP server (MVP):

- `get_library_components` — Full component catalog with variants (local + external team libraries).
- `figma_get_variables` — Design tokens: colors, spacing, typography, radii, shadows, opacity.
- `get_design_system_summary` — High-level overview for agent context.

External team libraries are accessible as long as they are enabled in the user's Figma file.

### Processing

- Components are stored in the design system registry with name, variants, and properties.
- Tokens are converted to CSS custom properties via `tokensToStylesheet()` (existing code, `--od-*` prefix).
- CSS variables are injected into all Sandpack instances (main prototype + variation previews).
- The component catalog is included in agent context so agents know what's available.

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

### MCP Calls

Executed via Figma's official MCP server (remote, OAuth-authenticated):

1. `figma_get_image(fileKey, nodeId)` → Raster PNG of the selected frame.
2. `figma_get_file_data(fileKey, nodeId, depth)` → Full node tree with positions, dimensions, component references.
3. `get_library_components(fileKey)` → Component catalog with variants.
4. `figma_get_variables(fileKey)` → Design tokens/variables.

### Hit-Map Builder

The node tree JSON is processed into a component hit-map:

- Each node with `type: "COMPONENT"` or `type: "INSTANCE"` becomes a hit region.
- Position and dimensions from `absoluteBoundingBox` are mapped to canvas coordinates (relative to the frame origin).
- Nested components use the deepest match for hover, with `Alt` for parent traversal.
- The hit-map is stored as a flat array of `{ nodeId, name, componentName, x, y, width, height, parentId }`.

### Base Prototype Generation

After import, an AI agent generates the initial Sandpack prototype:

- Input: Raster image, node tree, component catalog, design tokens.
- Output: Sandpack file bundle (`App.tsx`, `index.tsx`, `tokens.css`, component files).
- The agent uses the design system components and tokens to produce code that matches the Figma design as closely as possible.
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
| OpenCode server | `packages/opencode/src/server/` | Session management, SSE, API |
| Agent sidebar/chat | `packages/app/src/pages/session/` | Chat thread UI per agent |
| Files tab | `packages/app/src/` | Project context for agents |

### Removed

| Module | Location | Reason |
|--------|----------|--------|
| opendesign-figma-mcp | `packages/opendesign-figma-mcp/` | Replaced by Figma's official MCP server |
| figma-write.txt | `packages/opencode/src/agent/prompt/figma-write.txt` | No write-back to Figma for MVP |
| figma-ws.ts | `packages/desktop-electron/src/main/figma-ws.ts` | No local plugin bridge needed |
| canvas-bridge.ts | `packages/app/src/utils/canvas-bridge.ts` | Replaced by HTML canvas |
| SVG agent-sandbox canvas | `packages/app/src/pages/session/agent-sandbox/` | Replaced by HTML canvas with Sandpack |
| design.txt agent prompt | `packages/opencode/src/agent/prompt/design.txt` | Replaced by variation generation prompt |
| Rust/WASM as primary canvas | `packages/canvas-core/`, `packages/canvas-wasm/` | Moves to P2 visual diff overlay only |

### New Code Required

| Component | Description |
|-----------|-------------|
| HTML infinite canvas | Pan/zoom container with grid, SolidJS |
| Figma MCP client | Integration with Figma's official MCP server |
| Component hit-map builder | Node tree → bounding box regions |
| Annotation system | Popovers, prompt input, agent tagging |
| Design-to-code agent prompt | Figma data → base Sandpack prototype |
| Variation agent prompt | Component context → N variation bundles |
| Checkpoint store | Sandpack snapshot storage + metadata |
| Checkpoint timeline UI | Restore, fork, compare operations |
| DS slider component | Slider UI + agent prompt modulation |
| Variation preview grid | Sandpack iframe grid + approve/dim behavior |

## Post-MVP

- **Figma write-back** — Push approved designs back to Figma using `use_figma` MCP tool, creating components from approved variations.
- **Rust/WASM visual diff overlay** — GPU-accelerated side-by-side or overlay comparison between checkpoints.
- **Non-Figma inputs** — Paste screenshot, URL, or text description to start exploration without Figma.
- **Component extraction** — Create reusable components from approved variations, add to design system.
- **Scenario matrix** — Generate a grid of variations across multiple dimensions (persona × state × mode).
