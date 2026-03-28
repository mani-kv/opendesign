# Phase 1: Product/Feature/Agent Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the correct Product → Feature → Agent data model, API surface, and frontend routing for OpenDesign.

**Architecture:** Consolidate ProjectTable into ProductTable, fix FK chain (Product → Feature → Agent), rename Agent/AgentSession namespaces, add Product/Feature CRUD routes, regenerate SDK, create canvas-primary `feature.tsx` page with `AgentChatProvider`, rewire sidebar navigation.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Hono (HTTP server), SolidJS (frontend), Zod (validation), Bun (runtime/test)

**Spec:** `docs/superpowers/specs/2026-03-27-phase1-product-feature-agent-foundation.md`

---

## File Map

### Backend — New Files
- `packages/opencode/src/product/index.ts` — Product namespace (CRUD, bus events)
- `packages/opencode/src/feature/index.ts` — Feature namespace (CRUD, bus events)
- `packages/opencode/src/agent/agent-def.ts` — Renamed from `agent.ts` (agent type definitions)
- `packages/opencode/src/server/routes/product.ts` — Product API routes (replaces project routes)
- `packages/opencode/src/server/routes/feature.ts` — Feature API routes
- `packages/opencode/migration/<timestamp>_phase1_foundation/migration.sql` — Schema fix migration
- `packages/opencode/migration/<timestamp>_phase1_foundation/snapshot.json` — Drizzle snapshot

### Backend — Modified Files
- `packages/opencode/src/product/product.sql.ts` — Add `worktree` column (from ProjectTable)
- `packages/opencode/src/agent/agent.sql.ts` — FK → FeatureTable
- `packages/opencode/src/storage/schema.ts` — Remove ProjectTable export
- `packages/opencode/src/agent/index.ts` — Rename namespace AgentSession → Agent
- `packages/opencode/src/server/server.ts` — Route mounts + imports
- `packages/opencode/src/server/routes/agent-session.ts` — Import renames
- `packages/opencode/src/project/instance.ts` — Import Product instead of Project
- `packages/opencode/src/project/bootstrap.ts` — Import Product
- `packages/opencode/src/worktree/index.ts` — Import Product + ProductTable
- ~20 more files for AgentSession → Agent and Agent → AgentDef renames

### Frontend — New Files
- `packages/app/src/pages/feature.tsx` — Canvas-primary feature page
- `packages/app/src/context/agent-chat.tsx` — Per-agent chat context provider
- `packages/app/src/context/product-scope.tsx` — Product/Feature URL scope context
- `packages/app/src/pages/product-layout.tsx` — Product layout wrapper

### Frontend — Modified Files
- `packages/app/src/app.tsx` — Add product/feature routes
- `packages/app/src/context/agents.tsx` — Update to use SDK Agent types
- `packages/app/src/pages/layout/sidebar-items.tsx` — Rewire to product/feature links

---

## Task 1: Migration — Fix FK Chain & Consolidate Tables

**Files:**
- Modify: `packages/opencode/src/product/product.sql.ts`
- Delete: `packages/opencode/src/project/project.sql.ts`
- Modify: `packages/opencode/src/agent/agent.sql.ts`
- Modify: `packages/opencode/src/feature/feature.sql.ts`
- Modify: `packages/opencode/src/storage/schema.ts`
- Create: `packages/opencode/migration/20260327000000_phase1_foundation/migration.sql`
- Create: `packages/opencode/migration/20260327000000_phase1_foundation/snapshot.json`

- [ ] **Step 1: Update ProductTable to include worktree column**

In `packages/opencode/src/product/product.sql.ts`:
```typescript
import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const ProductTable = sqliteTable("product", {
  id: text().primaryKey(),
  name: text().notNull(),
  directory: text().notNull(),
  worktree: text().notNull(),
  git_root: text(),
  ...Timestamps,
})
```

The `worktree` column is added because the old `ProjectTable` had it and `Instance`/`Project` namespace uses it for git worktree root tracking.

- [ ] **Step 2: Update AgentTable FK to reference FeatureTable**

In `packages/opencode/src/agent/agent.sql.ts`:
```typescript
import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { FeatureTable } from "../feature/feature.sql"
import { Timestamps } from "../storage/schema.sql"

export const AgentTable = sqliteTable("agent", {
  id: text().primaryKey(),
  feature_id: text().notNull().references(() => FeatureTable.id, { onDelete: "cascade" }),
  annotation_id: text(),
  branch: text(),
  status: text().notNull().default("working"),
  color: text(),
  title: text().notNull(),
  directory: text().notNull(),
  version: text().notNull(),
  permission: text({ mode: "json" }),
  ...Timestamps,
}, (table) => [
  index("agent_feature_idx").on(table.feature_id),
  index("agent_annotation_idx").on(table.annotation_id),
])
```

- [ ] **Step 3: Update FeatureTable to ensure correct ProductTable reference**

Verify `packages/opencode/src/feature/feature.sql.ts` imports from `../product/product.sql` (it already does — no change needed, just verify).

- [ ] **Step 4: Remove ProjectTable from schema barrel export**

In `packages/opencode/src/storage/schema.ts`, remove the ProjectTable line:
```typescript
// REMOVE this line:
// export { ProjectTable } from "../project/project.sql"

// Keep everything else as-is:
export { ProductTable } from "../product/product.sql"
export { DesignSystemTable } from "../design-system/design-system.sql"
export { ProductDesignSystemTable } from "../design-system/product-design-system.sql"
export { FeatureTable } from "../feature/feature.sql"
export { AnnotationTable } from "../annotation/annotation.sql"
export { AgentTable } from "../agent/agent.sql"
export { MessageTable } from "../agent/message.sql"
export { PartTable } from "../agent/part.sql"
export { VariationTable } from "../variation/variation.sql"
export { CheckpointTable } from "../checkpoint/checkpoint.sql"
export { TodoTable } from "../agent/todo.sql"
export { PermissionTable } from "../permission/permission.sql"
export { AccountTable, AccountStateTable, ControlAccountTable } from "../account/account.sql"
```

- [ ] **Step 5: Write the migration SQL**

Create `packages/opencode/migration/20260327000000_phase1_foundation/migration.sql`:
```sql
-- Phase 1: Fix FK chain and consolidate ProjectTable into ProductTable
-- Accepts data loss

DROP TABLE IF EXISTS `todo`;--> statement-breakpoint
DROP TABLE IF EXISTS `permission`;--> statement-breakpoint
DROP TABLE IF EXISTS `variation`;--> statement-breakpoint
DROP TABLE IF EXISTS `checkpoint`;--> statement-breakpoint
DROP TABLE IF EXISTS `part`;--> statement-breakpoint
DROP TABLE IF EXISTS `message`;--> statement-breakpoint
DROP TABLE IF EXISTS `agent`;--> statement-breakpoint
DROP TABLE IF EXISTS `annotation`;--> statement-breakpoint
DROP TABLE IF EXISTS `feature`;--> statement-breakpoint
DROP TABLE IF EXISTS `product_design_system`;--> statement-breakpoint
DROP TABLE IF EXISTS `design_system`;--> statement-breakpoint
DROP TABLE IF EXISTS `product`;--> statement-breakpoint
DROP TABLE IF EXISTS `project`;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `product` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`directory` text NOT NULL,
	`worktree` text NOT NULL,
	`git_root` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `design_system` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`figma_file_key` text,
	`figma_file_name` text,
	`tokens` text,
	`components` text,
	`styles` text,
	`last_synced_at` integer,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `product_design_system` (
	`product_id` text NOT NULL,
	`design_system_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `design_system_id`),
	CONSTRAINT `fk_product_design_system_product_id` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_product_design_system_design_system_id` FOREIGN KEY (`design_system_id`) REFERENCES `design_system`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `feature` (
	`id` text PRIMARY KEY,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`branch` text NOT NULL,
	`status` text NOT NULL DEFAULT 'active',
	`figma_url` text,
	`canvas_state` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_feature_product_id` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `feature_product_idx` ON `feature` (`product_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `annotation` (
	`id` text PRIMARY KEY,
	`feature_id` text NOT NULL,
	`component_node_id` text,
	`component_name` text,
	`prompt` text NOT NULL,
	`ds_slider` real NOT NULL DEFAULT 0.5,
	`variation_count` integer NOT NULL DEFAULT 4,
	`enrichments` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_annotation_feature_id` FOREIGN KEY (`feature_id`) REFERENCES `feature`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `annotation_feature_idx` ON `annotation` (`feature_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `agent` (
	`id` text PRIMARY KEY,
	`feature_id` text NOT NULL,
	`annotation_id` text,
	`branch` text,
	`status` text NOT NULL DEFAULT 'working',
	`color` text,
	`title` text NOT NULL,
	`directory` text NOT NULL,
	`version` text NOT NULL,
	`permission` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_agent_feature_id` FOREIGN KEY (`feature_id`) REFERENCES `feature`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `agent_feature_idx` ON `agent` (`feature_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_annotation_idx` ON `agent` (`annotation_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `message` (
	`id` text PRIMARY KEY,
	`agent_id` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `fk_message_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `message_agent_idx` ON `message` (`agent_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `part` (
	`id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `fk_part_message_id` FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `part_message_idx` ON `part` (`message_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `part_agent_idx` ON `part` (`agent_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `variation` (
	`id` text PRIMARY KEY,
	`agent_id` text NOT NULL,
	`annotation_id` text NOT NULL,
	`label` text,
	`rationale` text,
	`branch_path` text,
	`status` text NOT NULL DEFAULT 'pending',
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_variation_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_variation_annotation_id` FOREIGN KEY (`annotation_id`) REFERENCES `annotation`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `variation_agent_idx` ON `variation` (`agent_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `variation_annotation_idx` ON `variation` (`annotation_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `checkpoint` (
	`id` text PRIMARY KEY,
	`feature_id` text NOT NULL,
	`parent_id` text,
	`variation_id` text,
	`label` text NOT NULL,
	`git_ref` text NOT NULL,
	`time_created` integer NOT NULL,
	CONSTRAINT `fk_checkpoint_feature_id` FOREIGN KEY (`feature_id`) REFERENCES `feature`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_checkpoint_variation_id` FOREIGN KEY (`variation_id`) REFERENCES `variation`(`id`) ON DELETE SET NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `checkpoint_feature_idx` ON `checkpoint` (`feature_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `todo` (
	`agent_id` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`position` integer NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	PRIMARY KEY(`agent_id`, `position`),
	CONSTRAINT `fk_todo_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `todo_agent_idx` ON `todo` (`agent_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `permission` (
	`product_id` text PRIMARY KEY,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `fk_permission_product_id` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE
);
```

- [ ] **Step 6: Create snapshot.json**

Create `packages/opencode/migration/20260327000000_phase1_foundation/snapshot.json`:
```json
{
  "id": "phase1-foundation",
  "prevId": "opendesign-v2",
  "version": "6",
  "dialect": "sqlite",
  "tables": {},
  "enums": {},
  "schemas": {},
  "_meta": { "schemas": {}, "tables": {}, "columns": {} }
}
```

- [ ] **Step 7: Delete project.sql.ts**

Delete `packages/opencode/src/project/project.sql.ts`. All consumers will be migrated in subsequent tasks.

- [ ] **Step 8: Verify migration loads**

Run: `cd packages/opencode && bun test test/bun.test.ts`

This test initializes the DB and will verify the migration applies cleanly. If it fails due to import errors from deleted `project.sql.ts`, that's expected — we fix those in Task 2.

- [ ] **Step 9: Commit**

```bash
git add packages/opencode/src/product/product.sql.ts packages/opencode/src/agent/agent.sql.ts packages/opencode/src/storage/schema.ts packages/opencode/migration/20260327000000_phase1_foundation/
git add -u packages/opencode/src/project/project.sql.ts
git commit -m "fix(schema): consolidate ProjectTable into ProductTable, fix agent FK to FeatureTable"
```

---

## Task 2: Product Namespace — Replace Project

**Files:**
- Create: `packages/opencode/src/product/index.ts`
- Delete: `packages/opencode/src/project/project.ts`
- Modify: `packages/opencode/src/project/instance.ts`
- Modify: `packages/opencode/src/project/bootstrap.ts`
- Modify: `packages/opencode/src/worktree/index.ts`
- Modify: `packages/opencode/src/storage/json-migration.ts`
- Modify: `packages/opencode/src/server/routes/project.ts`
- Modify: `packages/opencode/src/server/routes/experimental.ts`
- Modify: `packages/opencode/src/cli/cmd/serve.ts`
- Modify: `packages/opencode/src/cli/cmd/debug/scrap.ts`
- Modify: `packages/opencode/src/cli/cmd/stats.ts`

- [ ] **Step 1: Create Product namespace**

Create `packages/opencode/src/product/index.ts`. This absorbs the logic from `project/project.ts` — directory discovery, ID generation from git roots, VCS detection, CRUD operations. The key changes:

1. Namespace renamed from `Project` to `Product`
2. All references to `ProjectTable` become `ProductTable`
3. `Project.Info` → `Product.Info` with field `worktree` (was `worktree`)
4. Bus events use `product.*` names
5. `migrateFromGlobal` stays as a no-op (already gutted)

The implementer should:
- Read the full `packages/opencode/src/project/project.ts` (it's ~430 lines)
- Copy it to `packages/opencode/src/product/index.ts`
- Replace `Project` → `Product`, `ProjectTable` → `ProductTable`, `"@/project/project.sql"` → `"./product.sql"`
- Update `BusEvent` names from `"project.*"` to `"product.*"`
- Update the `Info` zod schema `.meta({ ref: "Product" })`
- Keep all the git-based ID generation, VCS detection, directory resolution logic unchanged

- [ ] **Step 2: Update Instance to import Product**

In `packages/opencode/src/project/instance.ts`, change:
```typescript
// Before
import { Project } from "../project/project"
// After
import { Product } from "../product"
```

Then replace all `Project.` calls with `Product.` throughout the file. Key spots:
- `Instance.project` property (keep the property name for now, it returns `Product.Info`)
- `Project.forDirectory()` → `Product.forDirectory()`
- `Project.Info` type references → `Product.Info`

- [ ] **Step 3: Update bootstrap.ts**

In `packages/opencode/src/project/bootstrap.ts`:
```typescript
// Before
import { Project } from "../project/project"
// After
import { Product } from "../product"
```

Replace `Project.` → `Product.` in the bootstrap init function.

- [ ] **Step 4: Update worktree/index.ts**

In `packages/opencode/src/worktree/index.ts`:
```typescript
// Before
import { Project } from "../project/project"
import { ProjectTable } from "../project/project.sql"
// After
import { Product } from "../product"
import { ProductTable } from "../product/product.sql"
```

Replace all `Project.` → `Product.` and `ProjectTable` → `ProductTable` throughout the file.

- [ ] **Step 5: Update server routes/project.ts**

In `packages/opencode/src/server/routes/project.ts`:
```typescript
// Before
import { Project } from "../../project/project"
// After
import { Product } from "../../product"
```

Replace `Project.` → `Product.` in route handlers. Update operation IDs:
- `project.list` → `product.list`
- `project.current` → `product.current`
- `project.initGit` → `product.initGit`

Update response schema references from `Project.Info` to `Product.Info`.

Rename the export from `ProjectRoutes` to `ProductRoutes`.

- [ ] **Step 6: Update server/server.ts import**

In `packages/opencode/src/server/server.ts`:
```typescript
// Before
import { ProjectRoutes } from "./routes/project"
// After
import { ProductRoutes } from "./routes/product"
```

Update route mount:
```typescript
// Before
.route("/project", ProjectRoutes())
// After
.route("/product", ProductRoutes())
```

Also update:
```typescript
// Before
import { Instance } from "../project/instance"
// This stays the same — Instance is still in project/ directory
```

- [ ] **Step 7: Update remaining consumers**

Update these files to import `Product` from `"../../product"` (or relative equivalent) instead of `Project` from `"../../project/project"`:

- `packages/opencode/src/server/routes/experimental.ts`
- `packages/opencode/src/cli/cmd/serve.ts`
- `packages/opencode/src/cli/cmd/debug/scrap.ts`
- `packages/opencode/src/cli/cmd/stats.ts`

For `json-migration.ts`:
```typescript
// Before
import { ProjectTable } from "../project/project.sql"
// After
import { ProductTable } from "../product/product.sql"
```
Replace `ProjectTable` → `ProductTable` in the file.

- [ ] **Step 8: Update agent/index.ts ProjectTable import**

In `packages/opencode/src/agent/index.ts`, the `listGlobal` function queries `ProjectTable` to get product info:
```typescript
// Before
import { ProjectTable } from "../project/project.sql"
// After
import { ProductTable } from "../product/product.sql"
```

Replace all `ProjectTable` → `ProductTable` in the file (there are ~3 occurrences).

- [ ] **Step 9: Delete project.ts**

Delete `packages/opencode/src/project/project.ts`. The `project/` directory keeps `instance.ts`, `bootstrap.ts`, `vcs.ts` — these are project infrastructure, not the data model.

- [ ] **Step 10: Verify typecheck**

Run: `cd packages/opencode && bun typecheck`

Fix any remaining import errors. Common ones will be test files — handle those in Task 3.

- [ ] **Step 11: Commit**

```bash
git add packages/opencode/src/product/index.ts
git add -u
git commit -m "refactor: replace Project namespace with Product, consolidate directory/VCS logic"
```

---

## Task 3: Namespace Rename — Agent → AgentDef, AgentSession → Agent

**Files:**
- Rename: `packages/opencode/src/agent/agent.ts` → `packages/opencode/src/agent/agent-def.ts`
- Modify: `packages/opencode/src/agent/index.ts` (namespace rename)
- Modify: ~20 source files for import updates
- Modify: ~10 test files for import updates

- [ ] **Step 1: Rename agent.ts → agent-def.ts and namespace**

Copy `packages/opencode/src/agent/agent.ts` to `packages/opencode/src/agent/agent-def.ts`.

Inside `agent-def.ts`, rename the namespace:
```typescript
// Before
export namespace Agent {
// After
export namespace AgentDef {
```

Delete the old `packages/opencode/src/agent/agent.ts`.

- [ ] **Step 2: Rename AgentSession → Agent in agent/index.ts**

In `packages/opencode/src/agent/index.ts`:
```typescript
// Before
export namespace AgentSession {
// After
export namespace Agent {
```

Also update the internal import:
```typescript
// Before (if it imports from "./agent")
import { Agent } from "./agent"
// After
import { AgentDef } from "./agent-def"
```

And any internal references like `Agent.Info` (the definition type) become `AgentDef.Info`.

- [ ] **Step 3: Update source file imports — AgentDef**

These files import `Agent` from `agent/agent.ts` and need updating to `AgentDef` from `agent/agent-def.ts`:

| File | Old Import | New Import |
|------|-----------|------------|
| `agent/compaction.ts` | `import { Agent } from "@/agent/agent"` | `import { AgentDef } from "@/agent/agent-def"` |
| `agent/processor.ts` | `import { Agent } from "@/agent/agent"` | `import { AgentDef } from "@/agent/agent-def"` |
| `agent/llm.ts` | `import type { Agent } from "@/agent/agent"` | `import type { AgentDef } from "@/agent/agent-def"` |
| `tool/task.ts` | `import { Agent } from "../agent/agent"` | `import { AgentDef } from "../agent/agent-def"` |
| `tool/registry.ts` | `import type { Agent } from "../agent/agent"` | `import type { AgentDef } from "../agent/agent-def"` |
| `tool/truncation.ts` | `import type { Agent } from "../agent/agent"` | `import type { AgentDef } from "../agent/agent-def"` |
| `tool/tool.ts` | `import type { Agent } from "../agent/agent"` | `import type { AgentDef } from "../agent/agent-def"` |
| `cli/cmd/agent.ts` | `import { Agent } from "../../agent/agent"` | `import { AgentDef } from "../../agent/agent-def"` |
| `cli/cmd/run.ts` | `import { Agent } from "../../agent/agent"` | `import { AgentDef } from "../../agent/agent-def"` |
| `cli/cmd/debug/agent.ts` | `import { Agent } from "../../../agent/agent"` | `import { AgentDef } from "../../../agent/agent-def"` |
| `acp/agent.ts` | `import { Agent as AgentModule } from "../agent/agent"` | `import { AgentDef } from "../agent/agent-def"` |
| `server/routes/agent-session.ts` | `import { Agent } from "../../agent/agent"` | `import { AgentDef } from "../../agent/agent-def"` |
| `server/server.ts` | `import { Agent } from "../agent/agent"` | `import { AgentDef } from "../agent/agent-def"` |

In each file, replace all usages of `Agent.` (referring to agent definitions) with `AgentDef.` — e.g., `Agent.Info` → `AgentDef.Info`, `Agent.list()` → `AgentDef.list()`.

**Important:** In `acp/agent.ts`, the old import was `import { Agent as AgentModule }`. Change to `import { AgentDef }` and replace `AgentModule.` → `AgentDef.`.

- [ ] **Step 4: Update source file imports — Agent (formerly AgentSession)**

These files import `AgentSession` from `agent/index.ts` (or `agent/`) and need renaming to `Agent`:

| File | Old Import | New Import |
|------|-----------|------------|
| `server/routes/agent-session.ts` | `import { AgentSession } from "../../agent"` | `import { Agent } from "../../agent"` |
| `agent/prompt.ts` | `import { AgentSession } from "."` | `import { Agent } from "."` |
| `agent/summary.ts` | `import { AgentSession } from "."` | `import { Agent } from "."` |
| `agent/compaction.ts` | `import { AgentSession } from "."` | `import { Agent } from "."` |
| `agent/processor.ts` | `import { AgentSession } from "."` | `import { Agent } from "."` |
| `agent/revert.ts` | `import { AgentSession } from "."` | `import { Agent } from "."` |
| `tool/batch.ts` | `import { AgentSession } from "../agent"` | `import { Agent } from "../agent"` |
| `tool/task.ts` | `import { AgentSession } from "../agent"` | `import { Agent } from "../agent"` |
| `server/routes/experimental.ts` | `import { AgentSession } from "../../agent"` | `import { Agent } from "../../agent"` |
| `config/config.ts` | `import { AgentSession } from "../agent"` | `import { Agent } from "../agent"` |
| `skill/skill.ts` | `import { AgentSession } from "../agent"` | `import { Agent } from "../agent"` |
| `plugin/index.ts` | `import { AgentSession } from "../agent"` | `import { Agent } from "../agent"` |
| `cli/cmd/import.ts` | `import { AgentSession } from "../../agent"` | `import { Agent } from "../../agent"` |
| `cli/cmd/export.ts` | `import { AgentSession } from "../../agent"` | `import { Agent } from "../../agent"` |
| `cli/cmd/github.ts` | `import { AgentSession } from "../../agent"` | `import { Agent } from "../../agent"` |
| `cli/cmd/stats.ts` | `import { AgentSession } from "../../agent"` | `import { Agent } from "../../agent"` |
| `cli/cmd/session.ts` | `import { AgentSession } from "../../agent"` | `import { Agent } from "../../agent"` |
| `server/server.ts` | (if it imports AgentSession) | `import { Agent } from "../agent"` |

In each file, replace `AgentSession.` → `Agent.` for all method/type calls.

**Important disambiguation:** Some files now import BOTH `Agent` (instances, from `agent/index.ts`) and `AgentDef` (definitions, from `agent/agent-def.ts`). This is correct — they're different namespaces in different files.

- [ ] **Step 5: Update server.ts inline agent definition endpoint**

In `packages/opencode/src/server/server.ts`, the inline `GET /agent` endpoint lists agent definitions:
```typescript
// Before
import { Agent } from "../agent/agent"
// After
import { AgentDef } from "../agent/agent-def"
```

Update the handler and operation ID:
```typescript
// Before
.get("/agent", describeRoute({ operationId: "app.agents", ... schema: resolver(Agent.Info.array()) }),
  async (c) => { const modes = await Agent.list(); return c.json(modes) })
// After
.get("/agent-def", describeRoute({ operationId: "agent-def.list", ... schema: resolver(AgentDef.Info.array()) }),
  async (c) => { const modes = await AgentDef.list(); return c.json(modes) })
```

- [ ] **Step 6: Update test files**

Update test imports:

| Test File | Changes |
|-----------|---------|
| `test/session/session.test.ts` | `AgentSession` → `Agent` |
| `test/session/compaction.test.ts` | `AgentSession` → `Agent` |
| `test/session/prompt.test.ts` | `AgentSession` → `Agent` |
| `test/session/revert-compact.test.ts` | `AgentSession` → `Agent` |
| `test/session/structured-output-integration.test.ts` | `AgentSession` → `Agent` |
| `test/server/session-list.test.ts` | `AgentSession` → `Agent` |
| `test/server/global-session-list.test.ts` | `AgentSession` → `Agent` |
| `test/agent/agent.test.ts` | `Agent` → `AgentDef` |
| `test/config/agent-color.test.ts` | `Agent` → `AgentDef` |
| `test/session/llm.test.ts` | `Agent` → `AgentDef` |
| `test/tool/read.test.ts` | `Agent` → `AgentDef` |

- [ ] **Step 7: Typecheck**

Run: `cd packages/opencode && bun typecheck`

Fix any remaining references. Use grep to find stragglers:
```bash
grep -r "from.*agent/agent\"" packages/opencode/src/ --include="*.ts"
grep -r "AgentSession" packages/opencode/src/ --include="*.ts"
```

- [ ] **Step 8: Run tests**

Run: `cd packages/opencode && bun test`

Fix any test failures from the rename.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: rename Agent→AgentDef (definitions), AgentSession→Agent (instances)"
```

---

## Task 4: Feature Namespace

**Files:**
- Create: `packages/opencode/src/feature/index.ts`

- [ ] **Step 1: Create Feature namespace**

Create `packages/opencode/src/feature/index.ts`:

```typescript
import z from "zod"
import { and, desc, eq } from "drizzle-orm"
import { FeatureTable } from "./feature.sql"
import { Database } from "../storage/db"
import { Identifier } from "../id/id"
import { Bus } from "../bus"
import { BusEvent } from "../bus/bus-event"
import { fn } from "../util/fn"
import { NotFoundError } from "../storage/db"

export namespace Feature {
  export const Info = z
    .object({
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
    .meta({ ref: "Feature" })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: BusEvent.define("feature.created", Info),
    Updated: BusEvent.define("feature.updated", Info),
    Deleted: BusEvent.define("feature.deleted", z.object({ id: z.string() })),
  }

  function fromRow(row: typeof FeatureTable.$inferSelect): Info {
    return {
      id: row.id,
      productID: row.product_id,
      name: row.name,
      branch: row.branch,
      status: row.status as Info["status"],
      figmaUrl: row.figma_url ?? undefined,
      canvasState: row.canvas_state ?? undefined,
      time: {
        created: row.time_created,
        updated: row.time_updated,
      },
    }
  }

  export const create = fn(
    z.object({
      productID: z.string(),
      name: z.string(),
      branch: z.string(),
      figmaUrl: z.string().optional(),
    }),
    async (input) => {
      const id = Identifier.ascending("feature")
      const time = Date.now()
      Database.use((db) => {
        db.insert(FeatureTable)
          .values({
            id,
            product_id: input.productID,
            name: input.name,
            branch: input.branch,
            figma_url: input.figmaUrl,
            status: "active",
            time_created: time,
            time_updated: time,
          })
          .run()
      })
      const info = await get(id)
      Database.use(() => {
        Database.effect(() => Bus.publish(Event.Created, info))
      })
      return info
    },
  )

  export const get = fn(z.string(), async (id) => {
    const row = Database.use((db) => db.select().from(FeatureTable).where(eq(FeatureTable.id, id)).get())
    if (!row) throw new NotFoundError({ name: "FeatureNotFound", message: `Feature ${id} not found` })
    return fromRow(row)
  })

  export function* list(input?: { productID?: string }) {
    const conditions = []
    if (input?.productID) {
      conditions.push(eq(FeatureTable.product_id, input.productID))
    }
    const rows = Database.use((db) => {
      const query = conditions.length
        ? db.select().from(FeatureTable).where(and(...conditions))
        : db.select().from(FeatureTable)
      return query.orderBy(desc(FeatureTable.time_updated)).all()
    })
    for (const row of rows) {
      yield fromRow(row)
    }
  }

  export const remove = fn(z.string(), async (id) => {
    const info = await get(id)
    Database.use((db) => {
      db.delete(FeatureTable).where(eq(FeatureTable.id, id)).run()
      Database.effect(() => Bus.publish(Event.Deleted, { id }))
    })
    return info
  })

  export const update = fn(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      status: z.enum(["active", "completed", "archived"]).optional(),
      figmaUrl: z.string().optional(),
      canvasState: z.any().optional(),
    }),
    async (input) => {
      const time = Date.now()
      const sets: Record<string, unknown> = { time_updated: time }
      if (input.name !== undefined) sets.name = input.name
      if (input.status !== undefined) sets.status = input.status
      if (input.figmaUrl !== undefined) sets.figma_url = input.figmaUrl
      if (input.canvasState !== undefined) sets.canvas_state = JSON.stringify(input.canvasState)

      Database.use((db) => {
        db.update(FeatureTable).set(sets).where(eq(FeatureTable.id, input.id)).run()
      })
      const info = await get(input.id)
      Database.use(() => {
        Database.effect(() => Bus.publish(Event.Updated, info))
      })
      return info
    },
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/opencode && bun typecheck`

- [ ] **Step 3: Commit**

```bash
git add packages/opencode/src/feature/index.ts
git commit -m "feat: add Feature namespace with CRUD operations"
```

---

## Task 5: API Routes — Product, Feature, Route Renames

**Files:**
- Modify: `packages/opencode/src/server/routes/project.ts` (already renamed to ProductRoutes in Task 2)
- Create: `packages/opencode/src/server/routes/feature.ts`
- Modify: `packages/opencode/src/server/server.ts` — route mounts and renames
- Modify: `packages/opencode/src/server/routes/agent-session.ts` — operation ID renames

- [ ] **Step 1: Create Feature routes**

Create `packages/opencode/src/server/routes/feature.ts`:

```typescript
import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import z from "zod"
import { Feature } from "../../feature"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

export const FeatureRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List features",
        description: "Get a list of features, optionally filtered by product.",
        operationId: "feature.list",
        responses: {
          200: {
            description: "List of features",
            content: {
              "application/json": {
                schema: resolver(Feature.Info.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          productID: z.string().optional().meta({ description: "Filter by product ID" }),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const features: Feature.Info[] = []
        for (const feature of Feature.list({ productID: query.productID })) {
          features.push(feature)
        }
        return c.json(features)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create feature",
        description: "Create a new feature within a product.",
        operationId: "feature.create",
        responses: {
          200: {
            description: "Created feature",
            content: {
              "application/json": {
                schema: resolver(Feature.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          productID: z.string().meta({ description: "Product ID" }),
          name: z.string().meta({ description: "Feature name" }),
          branch: z.string().meta({ description: "Git branch name" }),
          figmaUrl: z.string().optional().meta({ description: "Figma URL" }),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const feature = await Feature.create(body)
        return c.json(feature)
      },
    )
    .get(
      "/:featureID",
      describeRoute({
        summary: "Get feature",
        description: "Retrieve a specific feature.",
        operationId: "feature.get",
        responses: {
          200: {
            description: "Feature details",
            content: {
              "application/json": {
                schema: resolver(Feature.Info),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ featureID: z.string() })),
      async (c) => {
        const feature = await Feature.get(c.req.valid("param").featureID)
        return c.json(feature)
      },
    )
    .put(
      "/:featureID",
      describeRoute({
        summary: "Update feature",
        description: "Update a feature.",
        operationId: "feature.update",
        responses: {
          200: {
            description: "Updated feature",
            content: {
              "application/json": {
                schema: resolver(Feature.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ featureID: z.string() })),
      validator(
        "json",
        z.object({
          name: z.string().optional(),
          status: z.enum(["active", "completed", "archived"]).optional(),
          figmaUrl: z.string().optional(),
          canvasState: z.any().optional(),
        }),
      ),
      async (c) => {
        const id = c.req.valid("param").featureID
        const body = c.req.valid("json")
        const feature = await Feature.update({ id, ...body })
        return c.json(feature)
      },
    )
    .delete(
      "/:featureID",
      describeRoute({
        summary: "Delete feature",
        description: "Delete a feature and all its agents.",
        operationId: "feature.remove",
        responses: {
          200: {
            description: "Deleted",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ featureID: z.string() })),
      async (c) => {
        await Feature.remove(c.req.valid("param").featureID)
        return c.json(true)
      },
    ),
)
```

- [ ] **Step 2: Update server.ts route mounts**

In `packages/opencode/src/server/server.ts`:

```typescript
// Add import
import { FeatureRoutes } from "./routes/feature"

// Update route mounts:
// Before
.route("/project", ProjectRoutes())
.route("/session", AgentSessionRoutes())
.route("/agent", AgentFilesRoutes())

// After
.route("/product", ProductRoutes())
.route("/feature", FeatureRoutes())
.route("/agent-session", AgentSessionRoutes())
.route("/agent-files", AgentFilesRoutes())
```

- [ ] **Step 3: Rename operation IDs in agent-session.ts**

In `packages/opencode/src/server/routes/agent-session.ts`, update all operation IDs:

| Old | New |
|-----|-----|
| `agent.session.list` | `agent.list` |
| `agent.session.status` | `agent.status` |
| `agent.session.get` | `agent.get` |
| `agent.session.todo` | `agent.todo` |
| `agent.session.create` | `agent.create` |
| `agent.session.prompt` | `agent.prompt` |
| `agent.session.messages` | `agent.messages` |
| `agent.session.init` | `agent.init` |
| `agent.session.fork` | `agent.fork` |
| `agent.session.abort` | `agent.abort` |
| `agent.session.diff` | `agent.diff` |
| `agent.session.summarize` | `agent.summarize` |
| `agent.session.permission.respond` | `agent.permission.respond` |
| `agent.session.message.remove` | `agent.message.remove` |
| `agent.session.part.remove` | `agent.part.remove` |
| `agent.session.part.update` | `agent.part.update` |
| `agent.session.setStatus` | `agent.setStatus` |
| `agent.session.rename` | `agent.rename` |

Also update the internal imports from `AgentSession` → `Agent` if not already done in Task 3.

- [ ] **Step 4: Rename the route file**

Rename `packages/opencode/src/server/routes/project.ts` → `packages/opencode/src/server/routes/product.ts` to match the exported name `ProductRoutes`.

Similarly rename `packages/opencode/src/server/routes/agent-files.ts` if it exists (check first — the import is `AgentFilesRoutes` from `./routes/agent-files`).

- [ ] **Step 5: Typecheck and test**

Run:
```bash
cd packages/opencode && bun typecheck
cd packages/opencode && bun test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Feature routes, rename /session→/agent-session, /agent→/agent-files, /project→/product"
```

---

## Task 6: Regenerate SDK

**Files:**
- Modify: `packages/sdk/js/` (auto-generated)

- [ ] **Step 1: Regenerate SDK**

Run from repo root:
```bash
./script/generate.ts
```

This starts the server, extracts OpenAPI spec, generates the SDK.

- [ ] **Step 2: Verify generated types**

Check that `packages/sdk/js/src/client.ts` contains:
- `product.list()`, `product.get()`, `product.create()`, etc.
- `feature.list()`, `feature.get()`, `feature.create()`, etc.
- `agent.list()` (formerly `session.list()`), `agent.get()`, `agent.create()`, etc.
- `agentDef.list()` (formerly `app.agents`)

Run: `grep -n "product\.\|feature\.\|agent\.\|agentDef\." packages/sdk/js/src/client.ts | head -40`

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/
git commit -m "chore: regenerate SDK with Product/Feature/Agent types"
```

---

## Task 7: Frontend — Product Scope Context & Routing

**Files:**
- Create: `packages/app/src/context/product-scope.tsx`
- Create: `packages/app/src/pages/product-layout.tsx`
- Modify: `packages/app/src/app.tsx`

- [ ] **Step 1: Create product-scope context**

Create `packages/app/src/context/product-scope.tsx`:

```tsx
import { createContext, useContext, type Accessor } from "solid-js"
import { useParams, useSearchParams } from "@solidjs/router"

export type ProductScope = {
  productId: Accessor<string>
  featureId: Accessor<string | undefined>
  agentId: Accessor<string | undefined>
  scopeKey: Accessor<string>
}

const ProductScopeContext = createContext<ProductScope | null>(null)

export function ProductScopeProvider(props: {
  productId: string
  featureId?: string
  children: import("solid-js").JSX.Element
}) {
  const [searchParams] = useSearchParams()
  const scope: ProductScope = {
    productId: () => props.productId,
    featureId: () => props.featureId,
    agentId: () => searchParams.agent as string | undefined,
    scopeKey: () => `${props.productId}${props.featureId ? "/" + props.featureId : ""}`,
  }
  return <ProductScopeContext.Provider value={scope}>{props.children}</ProductScopeContext.Provider>
}

export function useProductScope(): ProductScope {
  const scope = useContext(ProductScopeContext)
  if (scope) return scope

  const params = useParams()
  const [searchParams] = useSearchParams()
  return {
    productId: () => params.productId ?? "",
    featureId: () => params.featureId,
    agentId: () => searchParams.agent as string | undefined,
    scopeKey: () => `${params.productId ?? ""}${params.featureId ? "/" + params.featureId : ""}`,
  }
}

export function useProductParams() {
  const scope = useProductScope()
  return {
    get productId() {
      return scope.productId()
    },
    get featureId() {
      return scope.featureId()
    },
    get agentId() {
      return scope.agentId()
    },
  }
}
```

- [ ] **Step 2: Create ProductLayout**

Create `packages/app/src/pages/product-layout.tsx`:

```tsx
import { useParams } from "@solidjs/router"
import type { ParentProps } from "solid-js"
import { ProductScopeProvider } from "@/context/product-scope"

export default function ProductLayout(props: ParentProps) {
  const params = useParams()
  return (
    <ProductScopeProvider productId={params.productId}>
      {props.children}
    </ProductScopeProvider>
  )
}
```

- [ ] **Step 3: Add product/feature routes to app.tsx**

In `packages/app/src/app.tsx`, add imports and routes:

```typescript
// Add imports
import ProductLayout from "@/pages/product-layout"

const Feature = lazy(() => import("@/pages/feature"))

const FeatureRoute = () => (
  <Suspense fallback={<Loading />}>
    <Feature />
  </Suspense>
)

const ProductHomeRoute = () => {
  const params = useParams()
  return <Navigate href={`/product/${params.productId}/feature`} />
}
```

Add inside the `Router` in `AppInterface`:
```tsx
<Route path="/product/:productId" component={ProductLayout}>
  <Route path="/" component={ProductHomeRoute} />
  <Route path="/feature/:featureId" component={FeatureRoute} />
</Route>
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/context/product-scope.tsx packages/app/src/pages/product-layout.tsx
git add -u packages/app/src/app.tsx
git commit -m "feat(app): add product/feature routing and ProductScope context"
```

---

## Task 8: Frontend — AgentChatProvider

**Files:**
- Create: `packages/app/src/context/agent-chat.tsx`

- [ ] **Step 1: Create AgentChatProvider**

Create `packages/app/src/context/agent-chat.tsx`:

```tsx
import { createContext, createMemo, onCleanup, onMount, useContext, type ParentProps } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useSDK } from "./sdk"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"

type AgentChatState = {
  messages: Message[]
  parts: Record<string, Part[]>
  loading: boolean
}

type AgentChatContext = {
  agentID: string
  messages: () => Message[]
  parts: (messageID: string) => Part[]
  loading: () => boolean
  sendPrompt: (content: string, options?: { modelID?: string }) => Promise<void>
  abort: () => Promise<void>
}

const AgentChatCtx = createContext<AgentChatContext>()

export function AgentChatProvider(props: ParentProps & { agentID: string }) {
  const sdk = useSDK()

  const [state, setState] = createStore<AgentChatState>({
    messages: [],
    parts: {},
    loading: false,
  })

  const loadMessages = async () => {
    setState("loading", true)
    try {
      const msgs = await sdk.client.agent.messages(props.agentID)
      setState("messages", reconcile(msgs))
      for (const msg of msgs) {
        if (msg.parts) {
          setState("parts", msg.id, reconcile(msg.parts))
        }
      }
    } finally {
      setState("loading", false)
    }
  }

  onMount(() => {
    loadMessages()
  })

  const sendPrompt = async (content: string, options?: { modelID?: string }) => {
    await sdk.client.agent.prompt(props.agentID, {
      parts: [{ type: "text", text: content }],
      modelID: options?.modelID,
    })
    await loadMessages()
  }

  const abort = async () => {
    await sdk.client.agent.abort(props.agentID)
  }

  const ctx: AgentChatContext = {
    agentID: props.agentID,
    messages: () => state.messages,
    parts: (messageID: string) => state.parts[messageID] ?? [],
    loading: () => state.loading,
    sendPrompt,
    abort,
  }

  return <AgentChatCtx.Provider value={ctx}>{props.children}</AgentChatCtx.Provider>
}

export function useAgentChat(): AgentChatContext {
  const ctx = useContext(AgentChatCtx)
  if (!ctx) throw new Error("useAgentChat must be used within AgentChatProvider")
  return ctx
}
```

**Note:** This is a minimal first implementation. It loads messages on mount and reloads after sending. SSE-based live updates will be added when we wire up the event stream in a future task. The interface is stable — only the internals will change.

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/context/agent-chat.tsx
git commit -m "feat(app): add AgentChatProvider for per-agent chat context"
```

---

## Task 9: Frontend — Feature Page (Canvas-Primary Layout)

**Files:**
- Create: `packages/app/src/pages/feature.tsx`

- [ ] **Step 1: Create feature.tsx**

Create `packages/app/src/pages/feature.tsx`:

```tsx
import { createMemo, createSignal, Show, For, type JSX } from "solid-js"
import { useSearchParams, useNavigate } from "@solidjs/router"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Button } from "@opencode-ai/ui/button"
import { useProductParams } from "@/context/product-scope"
import { useSDK } from "@/context/sdk"
import { AgentChatProvider, useAgentChat } from "@/context/agent-chat"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"

type FeatureAgent = {
  id: string
  title: string
  status: string
  color?: string
}

export default function FeaturePage() {
  const params = useProductParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const sdk = useSDK()

  const [agents, setAgents] = createStore<FeatureAgent[]>([])
  const [sidebarWidth, setSidebarWidth] = createSignal(380)

  const selectedAgentId = () => searchParams.agent as string | undefined

  const selectAgent = (id: string) => {
    setSearchParams({ agent: id })
  }

  return (
    <div class="flex size-full">
      {/* Canvas area — placeholder for Phase 2 */}
      <div
        class="flex-1 flex items-center justify-center bg-[var(--background)]"
        style={{ "min-width": "0" }}
      >
        <div class="text-center text-[var(--color-text-dimmed)]">
          <p class="text-lg font-medium">Canvas</p>
          <p class="text-sm mt-1">Phase 2: HTML infinite canvas will render here</p>
          <Show when={params.featureId}>
            <p class="text-xs mt-2 font-mono opacity-60">Feature: {params.featureId}</p>
          </Show>
        </div>
      </div>

      {/* Agent chat sidebar */}
      <Show when={selectedAgentId()}>
        {(agentId) => (
          <div
            class="flex flex-col border-l border-[var(--border)]"
            style={{ width: `${sidebarWidth()}px`, "min-width": "280px", "max-width": "50%" }}
          >
            {/* Agent tabs */}
            <div class="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--background-stronger)]">
              <For each={agents}>
                {(agent) => (
                  <button
                    class="px-2 py-1 text-xs rounded"
                    classList={{
                      "bg-[var(--background-hover)]": agent.id === agentId(),
                      "opacity-60": agent.id !== agentId(),
                    }}
                    onClick={() => selectAgent(agent.id)}
                  >
                    {agent.title}
                  </button>
                )}
              </For>
            </div>

            {/* Chat content */}
            <AgentChatProvider agentID={agentId()}>
              <AgentChatContent />
            </AgentChatProvider>
          </div>
        )}
      </Show>
    </div>
  )
}

function AgentChatContent() {
  const chat = useAgentChat()

  return (
    <div class="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div class="flex-1 overflow-y-auto p-3">
        <Show when={chat.loading()}>
          <p class="text-sm text-[var(--color-text-dimmed)]">Loading...</p>
        </Show>
        <Show when={!chat.loading() && chat.messages().length === 0}>
          <p class="text-sm text-[var(--color-text-dimmed)]">No messages yet</p>
        </Show>
        <For each={chat.messages()}>
          {(msg) => (
            <div class="mb-2 text-sm">
              <span class="font-medium">{msg.role}: </span>
              <span>{msg.id}</span>
            </div>
          )}
        </For>
      </div>

      {/* Minimal composer */}
      <div class="border-t border-[var(--border)] p-2">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const input = (e.target as HTMLFormElement).elements.namedItem("prompt") as HTMLInputElement
            if (!input.value.trim()) return
            const text = input.value
            input.value = ""
            await chat.sendPrompt(text)
          }}
        >
          <input
            name="prompt"
            type="text"
            placeholder="Message agent..."
            class="w-full px-3 py-2 text-sm rounded bg-[var(--background-stronger)] border border-[var(--border)] outline-none focus:border-[var(--color-primary)]"
          />
        </form>
      </div>
    </div>
  )
}
```

**Note:** This is a scaffold. It has:
- Canvas placeholder (left, flex-1) — Phase 2 fills this
- Agent sidebar (right, resizable) — shows chat for selected agent
- Minimal message display and prompt input
- The existing `MessageTimeline` and composer components will be wired in when the SDK types stabilize

- [ ] **Step 2: Verify the page renders**

Run: `cd packages/app && bun run dev`

Navigate to `/product/test-id/feature/test-feature`. The page should render with the canvas placeholder and no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/feature.tsx
git commit -m "feat(app): add canvas-primary feature page with agent chat sidebar"
```

---

## Task 10: Frontend — Sidebar Rewiring

**Files:**
- Modify: `packages/app/src/pages/layout/sidebar-items.tsx` (or equivalent sidebar component)
- Modify: `packages/app/src/context/global-sync.tsx` — update SDK type references
- Modify: `packages/app/src/context/agents.tsx` — update to use new SDK types

- [ ] **Step 1: Update global-sync SDK imports**

In `packages/app/src/context/global-sync.tsx`, the SDK type `Project` may need renaming to `Product` depending on how the SDK generator maps the new types. Check the generated SDK:

```bash
grep "export.*type.*Product\|export.*interface.*Product" packages/sdk/js/src/client.ts
```

Update the import accordingly. The `GlobalStore.project` array may become `GlobalStore.product`. Update all references.

**Important:** The generated SDK types are the source of truth. Read the generated file before making changes.

- [ ] **Step 2: Update sidebar links**

In the sidebar component that renders session links (likely `packages/app/src/pages/layout/sidebar-items.tsx` or `sidebar-project.tsx`), update navigation targets:

```typescript
// Before — links to session page
href={`/project/${projectId}/session/${sessionId}`}
// After — links to feature page
href={`/product/${productId}/feature/${featureId}`}
```

Also update any display text from "Sessions" to "Features" and "Projects" to "Products".

- [ ] **Step 3: Update agents.tsx context**

The existing `packages/app/src/context/agents.tsx` uses a local `Agent` interface. After SDK regeneration, it should import the SDK's `Agent` type instead of defining its own. Check the SDK output and align:

```typescript
// The local Agent interface may conflict with the SDK Agent type
// Update or remove the local definition to use the SDK type
```

- [ ] **Step 4: Typecheck frontend**

Run: `cd packages/app && bun typecheck`

Fix any type errors from SDK changes. Common issues:
- `client.session.*` calls → `client.agent.*`
- `Project` type → `Product` type
- Missing new SDK method signatures

- [ ] **Step 5: Run frontend tests**

Run: `cd packages/app && bun run test:unit`

Fix any test failures.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(app): rewire sidebar navigation to product/feature routes"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Full typecheck**

```bash
bun turbo typecheck
```

- [ ] **Step 2: Full test suite**

```bash
cd packages/opencode && bun test
cd packages/app && bun run test:unit
```

- [ ] **Step 3: Manual smoke test**

```bash
cd packages/app && bun run dev
```

1. Home page loads
2. Navigate to a product (sidebar)
3. Navigate to a feature
4. Feature page renders with canvas placeholder
5. Existing session page still works at `/project/:id/session/:id`

- [ ] **Step 4: Final commit if any fixes**

```bash
git add -A
git commit -m "fix: address final verification issues"
```
