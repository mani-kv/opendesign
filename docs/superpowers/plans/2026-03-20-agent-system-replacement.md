# Agent System Replacement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the built-in `build` and `plan` agents with `opendesign-agent` (orchestrator) and `opendesign-ask` (read-only RAG), remove all plan/build string coupling, update tests, and verify end-to-end.

**Architecture:** Two new primary agents replace two old ones. Internal subagents (`opendesign-scenario`, `research`, `audit`, `figma-write`) are added for future use but not wired into UI yet. The `insertReminders()` plan↔build handoff logic is deleted entirely. The `plan_exit` tool is removed from the registry. The orchestrator agent is restricted from direct code writing (delegates to scenario agents).

**Tech Stack:** TypeScript, Bun test runner, SolidJS (app layer)

**Spec:** See `PRODUCT_PLAN.md` §5.4 (Agent System) and §7 (Codebase Changes Required, Priority 1)

---

## File Map

| Action | File                                                           | Responsibility                              |
| ------ | -------------------------------------------------------------- | ------------------------------------------- |
| Modify | `packages/opencode/src/agent/agent.ts`                         | Replace built-in agent definitions          |
| Create | `packages/opencode/src/agent/prompt/agent.txt`                 | Orchestrator system prompt                  |
| Create | `packages/opencode/src/agent/prompt/ask.txt`                   | Ask mode system prompt                      |
| Create | `packages/opencode/src/agent/prompt/scenario.txt`              | Scenario subagent prompt                    |
| Create | `packages/opencode/src/agent/prompt/research.txt`              | Research subagent prompt                    |
| Create | `packages/opencode/src/agent/prompt/audit.txt`                 | Audit subagent prompt                       |
| Modify | `packages/opencode/src/session/prompt.ts`                      | Remove insertReminders plan/build logic     |
| Delete | `packages/opencode/src/session/prompt/plan.txt`                | No longer needed                            |
| Delete | `packages/opencode/src/session/prompt/build-switch.txt`        | No longer needed                            |
| Modify | `packages/opencode/src/tool/plan.ts`                           | Remove PlanExitTool                         |
| Modify | `packages/opencode/src/tool/registry.ts`                       | Remove PlanExitTool import and registration |
| Modify | `packages/app/src/utils/agent.ts`                              | Update color mappings                       |
| Modify | `packages/opencode/test/agent/agent.test.ts`                   | Rewrite tests for new agents                |
| Modify | `packages/app/src/pages/session/session-model-helpers.test.ts` | Update "build" default in test helper       |
| Modify | `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`   | Update plan_exit/plan_enter agent switching |

---

## Task 1: Create agent prompt text files

**Files:**

- Create: `packages/opencode/src/agent/prompt/agent.txt`
- Create: `packages/opencode/src/agent/prompt/ask.txt`
- Create: `packages/opencode/src/agent/prompt/scenario.txt`
- Create: `packages/opencode/src/agent/prompt/research.txt`
- Create: `packages/opencode/src/agent/prompt/audit.txt`

These are system prompts imported by `agent.ts`. Follow the pattern of existing `.txt` files like `explore.txt` (concise, role-focused, behavioral guidelines).

- [ ] **Step 1: Create `agent.txt` — orchestrator prompt**

```
packages/opencode/src/agent/prompt/agent.txt
```

Content:

```
You are the OpenDesign orchestrator agent. Your role is to decompose user requests into discrete scenarios and dispatch scenario agents to work on them in parallel.

Your responsibilities:
- Analyze selected Figma frames and context documents to understand the design intent
- Break complex requests into independent scenarios (e.g. "empty state", "error handling", "admin view")
- Present a pre-flight plan to the user before dispatching agents
- Formulate "what if" questions that surface uncovered edge cases
- Synthesize results from multiple scenario agents

Guidelines:
- Always present your decomposition plan before dispatching agents
- Each scenario should be independent and testable on its own
- Ask clarifying questions when the user's intent is ambiguous
- Proactively suggest scenarios the user may not have considered
- Do not write code directly — delegate to scenario agents
```

- [ ] **Step 2: Create `ask.txt` — read-only brainstorming prompt**

```
packages/opencode/src/agent/prompt/ask.txt
```

Content:

```
You are the OpenDesign ask agent. You help designers brainstorm, answer questions about their designs, and surface insights from project context — without making any changes.

Your responsibilities:
- Answer questions about design decisions, patterns, and best practices
- Analyze Figma frames and provide feedback on layout, accessibility, and consistency
- Query project context documents (PRDs, research, architecture docs) to surface relevant insights
- Critique prototypes and suggest improvements
- Help designers think through edge cases and user flows

Guidelines:
- You are read-only. Never create files, edit code, or modify any project state
- Ground your answers in the project's context documents when available
- Be specific and actionable in your feedback
- When asked about accessibility, reference WCAG guidelines
- When asked about design system consistency, reference the project's design tokens
```

- [ ] **Step 3: Create `scenario.txt` — scenario subagent prompt**

```
packages/opencode/src/agent/prompt/scenario.txt
```

Content:

```
You are an OpenDesign scenario agent. You build a working interactive prototype for a single design scenario within a Sandpack environment.

Your responsibilities:
- Generate React components that match the provided Figma frame designs
- Use the project's design tokens (CSS variables from tokens.css) for all styling
- Import components from the connected design system npm package when available
- Use XState for state management and interaction logic
- Generate realistic mock data that matches the scenario context
- Surface "what if" questions when you identify uncovered edge cases

Guidelines:
- Work only within your assigned git branch
- Use the design tokens — do not hardcode colors, spacing, or typography
- Prefer the connected component library over generating custom components
- Keep components focused and composable
- Include proper loading, error, and empty states unless explicitly scoped out
```

- [ ] **Step 4: Create `research.txt` — research subagent prompt**

```
packages/opencode/src/agent/prompt/research.txt
```

Content:

```
You are an OpenDesign research agent. You synthesize insights from project context documents to inform design decisions.

Your responsibilities:
- Query and analyze PRDs, user research reports, and architecture documents
- Surface relevant findings that inform the current design task
- Identify gaps between documented requirements and current designs
- Provide evidence-based recommendations grounded in user research

Guidelines:
- Always cite which document your insights come from
- Distinguish between stated requirements and inferred recommendations
- Flag contradictions between different context documents
- Be concise — surface the most relevant insights, not everything you find
```

- [ ] **Step 5: Create `audit.txt` — audit subagent prompt**

```
packages/opencode/src/agent/prompt/audit.txt
```

Content:

```
You are an OpenDesign audit agent. You check prototypes for design system compliance, accessibility, and consistency.

Your responsibilities:
- Run accessibility audits and interpret axe-core violations
- Check that prototypes use design tokens correctly (no hardcoded values)
- Verify component usage matches the connected design system
- Flag spacing, typography, and color inconsistencies
- Check responsive behavior across viewport sizes

Guidelines:
- Report issues with specific element references and suggested fixes
- Prioritize issues by severity: critical (accessibility barriers), major (design system violations), minor (cosmetic inconsistencies)
- Reference WCAG 2.1 AA standards for accessibility checks
- Be actionable — every issue should include how to fix it
```

- [ ] **Step 6: Create `figma-write.txt` — figma write subagent prompt**

```
packages/opencode/src/agent/prompt/figma-write.txt
```

Content:

```
You are an OpenDesign figma-write agent. You modify Figma designs via the webview injection bridge when the user asks to update their Figma file.

Your responsibilities:
- Create or modify Figma frames, components, and styles
- Apply design tokens correctly when creating new elements
- Respect the existing component hierarchy and naming conventions

Guidelines:
- Only modify what was explicitly requested
- Preserve existing auto-layout and constraint settings unless asked to change them
- Report what was changed after each operation
```

- [ ] **Step 7: Commit prompt files**

```bash
cd packages/opencode && git add src/agent/prompt/agent.txt src/agent/prompt/ask.txt src/agent/prompt/scenario.txt src/agent/prompt/research.txt src/agent/prompt/audit.txt src/agent/prompt/figma-write.txt && git commit -m "feat(agent): add opendesign agent prompt files"
```

---

## Task 2: Replace built-in agents in agent.ts

**Files:**

- Modify: `packages/opencode/src/agent/agent.ts:11-16` (imports)
- Modify: `packages/opencode/src/agent/agent.ts:76-156` (agent definitions)
- Modify: `packages/opencode/src/agent/agent.ts:260-263` (list sort)

- [ ] **Step 1: Add new prompt imports**

In `packages/opencode/src/agent/agent.ts`, after line 15 (`import PROMPT_TITLE from "./prompt/title.txt"`), add:

```typescript
import PROMPT_AGENT from "./prompt/agent.txt"
import PROMPT_ASK from "./prompt/ask.txt"
import PROMPT_SCENARIO from "./prompt/scenario.txt"
import PROMPT_RESEARCH from "./prompt/research.txt"
import PROMPT_AUDIT from "./prompt/audit.txt"
import PROMPT_FIGMA_WRITE from "./prompt/figma-write.txt"
```

- [ ] **Step 2: Replace `build` agent with `opendesign-agent`**

In `packages/opencode/src/agent/agent.ts`, replace the `build` agent definition (lines 77-91) with:

```typescript
      "opendesign-agent": {
        name: "opendesign-agent",
        description: "The default agent. Decomposes design requests into scenarios and dispatches agents.",
        options: {},
        prompt: PROMPT_AGENT,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            edit: "deny",
            write: "deny",
          }),
          user,
        ),
        mode: "primary",
        native: true,
      },
```

- [ ] **Step 3: Replace `plan` agent with `opendesign-ask`**

Replace the `plan` agent definition (lines 92-114) with:

```typescript
      "opendesign-ask": {
        name: "opendesign-ask",
        description: "Ask mode. Read-only brainstorming and design Q&A with full context access.",
        options: {},
        prompt: PROMPT_ASK,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            question: "allow",
            grep: "allow",
            glob: "allow",
            list: "allow",
            read: "allow",
            webfetch: "allow",
            websearch: "allow",
            codesearch: "allow",
            external_directory: {
              "*": "ask",
              ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
            },
          }),
          user,
        ),
        mode: "primary",
        native: true,
      },
```

- [ ] **Step 4: Add scenario subagent after explore**

After the `explore` agent definition (around line 156), add:

```typescript
      "opendesign-scenario": {
        name: "opendesign-scenario",
        description: "Builds a working interactive prototype for a single design scenario.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            todoread: "deny",
            todowrite: "deny",
          }),
          user,
        ),
        prompt: PROMPT_SCENARIO,
        options: {},
        mode: "subagent",
        native: true,
      },
      research: {
        name: "research",
        description: "Synthesizes insights from project context documents to inform design decisions.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            grep: "allow",
            glob: "allow",
            list: "allow",
            read: "allow",
            webfetch: "allow",
            websearch: "allow",
            codesearch: "allow",
            external_directory: {
              "*": "ask",
              ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
            },
          }),
          user,
        ),
        prompt: PROMPT_RESEARCH,
        options: {},
        mode: "subagent",
        native: true,
      },
      audit: {
        name: "audit",
        description: "Checks prototypes for design system compliance, accessibility, and consistency.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            grep: "allow",
            glob: "allow",
            list: "allow",
            bash: "allow",
            read: "allow",
            external_directory: {
              "*": "ask",
              ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
            },
          }),
          user,
        ),
        prompt: PROMPT_AUDIT,
        options: {},
        mode: "subagent",
        native: true,
      },
```

Also add `figma-write` subagent in the same block:

```typescript
      "figma-write": {
        name: "figma-write",
        description: "Modifies Figma designs via the webview injection bridge.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            read: "allow",
            bash: "allow",
            external_directory: {
              "*": "ask",
              ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
            },
          }),
          user,
        ),
        prompt: PROMPT_FIGMA_WRITE,
        options: {},
        mode: "subagent",
        native: true,
      },
```

- [ ] **Step 5: Update list() sort**

In `packages/opencode/src/agent/agent.ts`, find the `list()` function (line ~258). Change:

```typescript
sortBy([(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"]),
```

to:

```typescript
sortBy([(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "opendesign-agent"), "desc"]),
```

- [ ] **Step 6: Commit agent.ts changes**

```bash
cd packages/opencode && git add src/agent/agent.ts && git commit -m "feat(agent): replace build/plan with opendesign-agent/opendesign-ask"
```

---

## Task 3: Remove insertReminders plan/build coupling in prompt.ts

**Files:**

- Modify: `packages/opencode/src/session/prompt.ts:21-22` (remove imports)
- Modify: `packages/opencode/src/session/prompt.ts:1322-1460` (gut insertReminders)

- [ ] **Step 1: Remove plan/build prompt imports**

In `packages/opencode/src/session/prompt.ts`, remove these two lines (lines 21-22):

```typescript
import PROMPT_PLAN from "../session/prompt/plan.txt"
import BUILD_SWITCH from "../session/prompt/build-switch.txt"
```

- [ ] **Step 2: Simplify insertReminders to a no-op**

Find the `insertReminders` function (line ~1322). Replace the ENTIRE function body with:

```typescript
async function insertReminders(input: { messages: MessageV2.WithParts[]; agent: Agent.Info; session: Session.Info }) {
  return input.messages
}
```

This preserves the function signature (it's called at line 560) while removing all plan/build logic. The experimental plan mode branch, PROMPT_PLAN injection, BUILD_SWITCH injection, and all agent name string checks are all removed.

- [ ] **Step 3: Verify no other references to removed imports**

Search for any remaining references to `PROMPT_PLAN` or `BUILD_SWITCH` in the file. There should be none after the function body replacement.

Run: `grep -n "PROMPT_PLAN\|BUILD_SWITCH" packages/opencode/src/session/prompt.ts`
Expected: no output

- [ ] **Step 4: Delete the prompt text files**

```bash
rm packages/opencode/src/session/prompt/plan.txt packages/opencode/src/session/prompt/build-switch.txt
```

- [ ] **Step 5: Commit prompt.ts changes**

```bash
cd packages/opencode && git add src/session/prompt.ts && git add -u src/session/prompt/plan.txt src/session/prompt/build-switch.txt && git commit -m "refactor(session): remove insertReminders plan/build coupling"
```

---

## Task 4: Remove PlanExitTool

**Files:**

- Modify: `packages/opencode/src/tool/registry.ts:1,122` (remove import and registration)
- Modify: `packages/opencode/src/tool/plan.ts` (can be deleted or gutted)
- Delete: `packages/opencode/src/tool/plan-exit.txt`

- [ ] **Step 1: Remove PlanExitTool from registry**

In `packages/opencode/src/tool/registry.ts`:

Remove line 1:

```typescript
import { PlanExitTool } from "./plan"
```

Remove line 122 (the PlanExitTool entry from the `all()` array):

```typescript
      ...(Flag.OPENCODE_EXPERIMENTAL_PLAN_MODE && Flag.OPENCODE_CLIENT === "cli" ? [PlanExitTool] : []),
```

- [ ] **Step 2: Delete plan tool files**

```bash
rm packages/opencode/src/tool/plan.ts packages/opencode/src/tool/plan-exit.txt
```

- [ ] **Step 3: Remove plan_enter/plan_exit from default permission rulesets**

In `packages/opencode/src/agent/agent.ts` (already modified in Task 2), find and remove these lines from the `defaults` permission config:

```typescript
      plan_enter: "deny",
      plan_exit: "deny",
```

And remove `plan_enter: "allow"` from the `opendesign-agent` permission config (if you carried it over from `build`). And remove `plan_exit: "allow"` if carried over from `plan`.

**Important:** Verify neither `opendesign-agent` nor `opendesign-ask` references `plan_enter` or `plan_exit` in their permission rulesets. These permissions should not exist anywhere after this step.

- [ ] **Step 4: Verify no remaining references**

Run: `grep -rn "plan_enter\|plan_exit\|PlanExitTool\|PlanEnterTool" packages/opencode/src/ --include="*.ts" --include="*.tsx"`

Expected results should only be in:

- `packages/opencode/src/cli/cmd/run.ts:364,369` — permission checks (safe, these are runtime guards that will now never match)
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx:225,228` — TUI rendering (safe, these handle tool parts that will now never appear)

These are runtime-safe: the tool no longer exists so these branches are dead code. Leave them for now — they don't cause errors.

- [ ] **Step 5: Update TUI plan_exit/plan_enter handler**

In `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`, find lines 225-229 which reference `"build"` and `"plan"`:

```typescript
if (part.tool === "plan_exit") {
  local.agent.set("build")
} else if (part.tool === "plan_enter") {
  local.agent.set("plan")
}
```

Replace with:

```typescript
if (part.tool === "plan_exit") {
  local.agent.set("opendesign-agent")
} else if (part.tool === "plan_enter") {
  local.agent.set("opendesign-agent")
}
```

These branches are now dead code (the tools don't exist), but if old session data contains these tool parts, they must reference valid agent names.

- [ ] **Step 6: Commit plan tool removal**

```bash
cd packages/opencode && git add -u src/tool/plan.ts src/tool/plan-exit.txt src/tool/registry.ts src/agent/agent.ts src/cli/cmd/tui/routes/session/index.tsx && git commit -m "refactor(tool): remove plan_exit tool and plan/build permissions"
```

---

## Task 5: Update agent color mappings in app

**Files:**

- Modify: `packages/app/src/utils/agent.ts`

- [ ] **Step 1: Replace color mapping**

Replace the entire contents of `packages/app/src/utils/agent.ts` with:

```typescript
const defaults: Record<string, string> = {
  "opendesign-agent": "var(--icon-agent-build-base)",
  "opendesign-ask": "var(--icon-agent-ask-base)",
}

export function agentColor(name: string, custom?: string) {
  if (custom) return custom
  return defaults[name] ?? defaults[name.toLowerCase()]
}
```

Note: We reuse the existing CSS variable names (`--icon-agent-build-base` for agent mode, `--icon-agent-ask-base` for ask mode) since those are already defined in the design token CSS. If the visual design changes later, update the CSS variables rather than adding new ones.

- [ ] **Step 2: Update session-model-helpers test default**

In `packages/app/src/pages/session/session-model-helpers.test.ts`, line 11:

Change:

```typescript
    agent: input?.agent ?? "build",
```

to:

```typescript
    agent: input?.agent ?? "opendesign-agent",
```

Also update lines 48 and 85 where `["agent", "build"]` appears in assertions:

```typescript
// Change:
["agent", "build"],
// To:
["agent", "opendesign-agent"],
```

- [ ] **Step 3: Commit app changes**

```bash
cd packages/app && git add src/utils/agent.ts src/pages/session/session-model-helpers.test.ts && git commit -m "feat(app): update agent color mappings and test defaults for opendesign agents"
```

---

## Task 6: Rewrite agent tests

**Files:**

- Modify: `packages/opencode/test/agent/agent.test.ts`

The existing test file has 25 tests, most referencing `build` and `plan` by name. All tests that reference `build` need to reference `opendesign-agent`. All tests that reference `plan` need to reference `opendesign-ask`. Tests for `explore`, `general`, `compaction` stay unchanged.

- [ ] **Step 1: Update agent name assertions**

In `packages/opencode/test/agent/agent.test.ts`:

**Test "returns default native agents when no config" (line 14):**
Change:

```typescript
expect(names).toContain("build")
expect(names).toContain("plan")
```

to:

```typescript
expect(names).toContain("opendesign-agent")
expect(names).toContain("opendesign-ask")
```

Also add assertions for new subagents:

```typescript
expect(names).toContain("opendesign-scenario")
expect(names).toContain("research")
expect(names).toContain("audit")
```

- [ ] **Step 2: Rewrite build agent test → opendesign-agent test**

Replace test "build agent has correct default properties" (line 32) with:

```typescript
test("opendesign-agent has correct default properties", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await Agent.get("opendesign-agent")
      expect(agent).toBeDefined()
      expect(agent?.mode).toBe("primary")
      expect(agent?.native).toBe(true)
      expect(agent?.prompt).toBeDefined()
      expect(evalPerm(agent, "question")).toBe("allow")
      expect(evalPerm(agent, "read")).toBe("allow")
      expect(evalPerm(agent, "edit")).toBe("deny")
      expect(evalPerm(agent, "write")).toBe("deny")
    },
  })
})
```

- [ ] **Step 3: Rewrite plan agent test → opendesign-ask test**

Replace test "plan agent denies edits except .opencode/plans/\*" (line 47) with:

```typescript
test("opendesign-ask denies edits and writes", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const ask = await Agent.get("opendesign-ask")
      expect(ask).toBeDefined()
      expect(ask?.mode).toBe("primary")
      expect(evalPerm(ask, "edit")).toBe("deny")
      expect(evalPerm(ask, "write")).toBe("deny")
      expect(evalPerm(ask, "bash")).toBe("deny")
      expect(evalPerm(ask, "read")).toBe("allow")
      expect(evalPerm(ask, "grep")).toBe("allow")
      expect(evalPerm(ask, "glob")).toBe("allow")
      expect(evalPerm(ask, "webfetch")).toBe("allow")
      expect(evalPerm(ask, "websearch")).toBe("allow")
      expect(evalPerm(ask, "question")).toBe("allow")
      expect(evalPerm(ask, "codesearch")).toBe("allow")
    },
  })
})
```

- [ ] **Step 4: Add new subagent tests**

Add after the explore tests:

```typescript
test("opendesign-scenario agent is a subagent with prompt", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const scenario = await Agent.get("opendesign-scenario")
      expect(scenario).toBeDefined()
      expect(scenario?.mode).toBe("subagent")
      expect(scenario?.native).toBe(true)
      expect(scenario?.prompt).toBeDefined()
    },
  })
})

test("research agent is read-only subagent", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const research = await Agent.get("research")
      expect(research).toBeDefined()
      expect(research?.mode).toBe("subagent")
      expect(evalPerm(research, "edit")).toBe("deny")
      expect(evalPerm(research, "write")).toBe("deny")
      expect(evalPerm(research, "read")).toBe("allow")
      expect(evalPerm(research, "grep")).toBe("allow")
    },
  })
})

test("audit agent allows bash but denies edit", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const audit = await Agent.get("audit")
      expect(audit).toBeDefined()
      expect(audit?.mode).toBe("subagent")
      expect(evalPerm(audit, "bash")).toBe("allow")
      expect(evalPerm(audit, "edit")).toBe("deny")
      expect(evalPerm(audit, "read")).toBe("allow")
    },
  })
})
```

Add `figma-write` test:

```typescript
test("figma-write agent is a subagent", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const fw = await Agent.get("figma-write")
      expect(fw).toBeDefined()
      expect(fw?.mode).toBe("subagent")
      expect(fw?.native).toBe(true)
      expect(evalPerm(fw, "edit")).toBe("deny")
      expect(evalPerm(fw, "read")).toBe("allow")
    },
  })
})
```

- [ ] **Step 5: Update all remaining "build" → "opendesign-agent" references**

Search-and-replace in the test file. Every `Agent.get("build")` becomes `Agent.get("opendesign-agent")`. Every `Agent.get("plan")` becomes `Agent.get("opendesign-ask")`.

Specific tests to update:

- "custom agent config overrides native agent properties" (line 151) — change `build` to `opendesign-agent`
- "agent disable removes agent from list" (line 179) — keep as-is (tests `explore` disable)
- "agent permission config merges with defaults" (line 199) — change `build` to `opendesign-agent`
- "global permission config applies to all agents" (line 226) — change `build` to `opendesign-agent`
- "agent steps/maxSteps config sets steps property" (line 244) — change `build` to `opendesign-agent`, `plan` to `opendesign-ask`
- "agent name can be overridden" (line 281) — change `build` to `opendesign-agent`
- "agent prompt can be set from config" (line 298) — change `build` to `opendesign-agent`
- "unknown agent properties are placed into options" (line 315) — change `build` to `opendesign-agent`
- "agent options merge correctly" (line 336) — change `build` to `opendesign-agent`
- "default permission includes doom_loop..." (line 398) — change `build` to `opendesign-agent`
- "webfetch is allowed by default" (line 410) — change `build` to `opendesign-agent`
- "legacy tools config..." (lines 421, 444) — change `build` to `opendesign-agent`
- "Truncate.GLOB..." tests (lines 465, 485, 509) — change `build` to `opendesign-agent`
- "skill directories..." (line 531) — change `build` to `opendesign-agent`

- [ ] **Step 6: Update defaultAgent tests**

- "defaultAgent returns build when no default_agent config" (line 567) — change expected to `"opendesign-agent"`
- "defaultAgent respects default_agent config set to plan" (line 578) — change `plan` to `opendesign-ask` in both config and assertion
- "defaultAgent returns plan when build is disabled" (line 655) — change `build` to `opendesign-agent`, expected to `"opendesign-ask"`
- "defaultAgent throws when all primary agents are disabled" (line 673) — change agent names to `"opendesign-agent"` and `"opendesign-ask"`

- [ ] **Step 7: Run tests**

```bash
cd packages/opencode && bun test test/agent/agent.test.ts
```

Expected: All tests pass. If any fail, fix the specific assertion or agent definition that's wrong.

- [ ] **Step 8: Commit test updates**

```bash
cd packages/opencode && git add test/agent/agent.test.ts && git commit -m "test(agent): update tests for opendesign agent system"
```

---

## Task 7: Run full typecheck and verify

- [ ] **Step 1: Run typecheck across all packages**

```bash
bun turbo typecheck
```

Expected: No type errors. If there are errors, they will likely be in files that import from `plan.ts` (now deleted) — fix by removing those imports.

- [ ] **Step 2: Run all opencode tests**

```bash
cd packages/opencode && bun test
```

Expected: All tests pass. Watch specifically for failures in:

- `test/agent/agent.test.ts` — the tests we just rewrote
- Any test that imports `PlanExitTool` or references "build"/"plan" agents

- [ ] **Step 3: Run app unit tests**

```bash
cd packages/app && bun run test:unit
```

Expected: All tests pass. The app tests don't directly test agent definitions but may reference agent names in prompt-related tests.

- [ ] **Step 4: Manual smoke test — start the app**

```bash
bun dev web
```

Verify:

1. The web app loads without errors
2. The agent selector in the prompt tray shows "opendesign-agent" and "opendesign-ask" (not "build" and "plan")
3. Switching between agent and ask mode works
4. Typing a message and sending it works (the agent runs without crashes)

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: address typecheck and test issues from agent system replacement"
```

Only create this commit if fixes were needed. If everything passed clean, skip this step.
