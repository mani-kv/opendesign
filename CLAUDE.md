# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About

OpenCode is an open-source AI coding agent with a client/server architecture. The server exposes a Hono-based HTTP/SSE API; clients include a TUI (SolidJS + opentui), a web app (SolidJS + Vite), and a native desktop app (Electron).

## Workflow
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.
- **Before starting any task**: read `.claude/code_insights.md` to recall accumulated knowledge about this codebase.
- **After completing any edit session**: update `.claude/code_insights.md` with new insights — non-obvious patterns, gotchas, root causes of bugs, or decisions made. Keep entries concise and actionable. Do not duplicate what's already there.



## Commands

### Development

```bash
bun install             # install dependencies
bun dev                 # run TUI in packages/opencode (dev mode)
bun dev <directory>     # run TUI against a specific directory
bun dev serve           # start headless API server on port 4096
bun dev web             # start server + open web interface
bun run --cwd packages/app dev   # run web app (requires server running)
bun run --cwd packages/desktop-electron dev  # run Electron desktop app
```

### Building

```bash
./packages/opencode/script/build.ts --single   # compile standalone executable
# Output: ./packages/opencode/dist/opencode-<platform>/bin/opencode
```

### Testing

Run tests from individual package directories, NOT from the repo root:

```bash
cd packages/opencode && bun test                   # all tests
cd packages/opencode && bun test test/bun.test.ts  # single test file
cd packages/app && bun run test:unit               # app unit tests
cd packages/app && bun run test:e2e                # app e2e tests (Playwright)
```

### Type Checking

```bash
bun turbo typecheck                   # typecheck all packages
cd packages/opencode && bun typecheck # typecheck single package (uses tsgo)
```

### SDK Regeneration

After changing `packages/opencode/src/server/server.ts`:

```bash
./script/generate.ts   # regenerates SDK and related files
```

## Architecture

### Monorepo Structure (Turborepo + Bun workspaces)

- **`packages/opencode`** — Core business logic and API server. Entry: `src/index.ts` (yargs CLI)
- **`packages/app`** — Shared web UI components (SolidJS + TailwindCSS v4), used by both web and desktop clients
- **`packages/desktop-electron`** — Native desktop app (Electron wrapping `packages/app`)
- **`packages/sdk/js`** — Generated TypeScript SDK (do not edit manually)
- **`packages/plugin`** — `@opencode-ai/plugin` package for plugin authors
- **`packages/ui`** — Shared UI primitives
- **`packages/web`** — Marketing/docs website
- **`packages/storybook`** — Component storybook

### Core Server (`packages/opencode/src/`)

The server uses a **namespace pattern**: each module exports a single `namespace` with static methods rather than classes.

Key modules:

- **`server/server.ts`** — Hono app with SSE streaming, route composition, and MDNS
- **`session/`** — Session and message management; `llm.ts` handles AI SDK streaming
- **`agent/agent.ts`** — Agent definitions (`build`, `plan`, `general` built-ins); agents have permission rulesets and model configs
- **`provider/`** — AI provider abstraction over Vercel AI SDK; supports Anthropic, OpenAI, Google, Bedrock, and many more
- **`tool/`** — Agent tools (bash, edit, glob, grep, lsp, etc.) — each has a `.ts` and `.txt` description file
- **`config/config.ts`** — JSONC config loading with layered priority (system-managed → global → project)
- **`project/instance.ts`** — Per-project instance context; `Instance.state()` scopes state to a directory
- **`storage/db.ts`** — SQLite via Drizzle ORM; DB path based on XDG dirs
- **`bus/`** — Internal event bus scoped per-instance; SSE route streams events to clients
- **`lsp/`** — LSP client integration for diagnostics and hover
- **`mcp/`** — MCP server support
- **`permission/`** — Permission system with allow/ask/deny rules per tool/path pattern

### Client Architecture

- **TUI**: `packages/opencode/src/cli/cmd/tui/` — SolidJS components rendered via opentui in terminal
- **Web/Desktop**: `packages/app/src/` — SolidJS SPA that connects to the server API via HTTP/SSE

### Data Flow

1. CLI parses args → boots `Instance` for a directory → starts `Server`
2. Server exposes REST + SSE endpoints; clients connect via the JS SDK
3. User sends a message → `Session` creates a run → `LLM.stream()` calls the AI provider
4. Tool calls go through the permission system before execution
5. Events are emitted on the `Bus` and streamed to clients via SSE

## Style Guide

See `AGENTS.md` for the full mandatory style guide. Key rules:

- **Single-word identifiers** by default (`pid`, `cfg`, `err`); multi-word only when necessary
- Prefer `const` over `let`; use ternaries/early returns instead of reassignment
- Avoid `else`; use early returns
- Avoid unnecessary destructuring; use dot notation (`obj.a` not `const { a } = obj`)
- Inline values used only once (avoid intermediate variables)
- Use Bun APIs (`Bun.file()`, etc.) when available
- No `try`/`catch` when avoidable; prefer `.catch()`
- Drizzle schema: snake_case field names
- Functional array methods over `for` loops; use type guards on `filter`

## Key Conventions

- Default branch is `dev`; PRs target `dev`
- PR titles follow conventional commits (`feat:`, `fix:`, `chore:`, etc.) with optional scope `feat(app):`
- All PRs must reference an existing issue
- Tests must not run from repo root (guarded by `exit 1` in root `package.json`)
- `bun typecheck` (not `tsc`) for type checking in package dirs
- Config files use JSONC (comments allowed)
