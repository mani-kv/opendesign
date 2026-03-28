# Phase Verification Rule

## Before claiming any phase or step is "complete" or "done":

1. **Run the phase smoke tests** — every phase MUST have smoke tests in:
   - `packages/app/src/smoke/phase{N}-*.test.ts` (frontend)
   - `packages/opencode/test/smoke/phase{N}-*.test.ts` (backend)

2. **All smoke tests must pass** — if any fail, the phase is NOT done. Fix them first.

3. **Run typecheck** — `bun turbo typecheck` must pass (except known pre-existing failures like desktop-electron).

4. **Run existing tests** — `cd packages/app && bun run test:unit` and relevant backend test dirs must pass.

5. **Visual verification** — if the phase includes UI changes, confirm the UI actually reflects those changes before claiming done. Don't rely solely on code — run the app and verify what the user sees.

## When writing implementation plans for new phases:

1. **Write smoke tests FIRST** as part of the plan — they codify "done" criteria.
2. Smoke tests should verify:
   - Data model/schema changes work end-to-end
   - API routes exist and return expected shapes
   - UI terminology matches the spec (i18n strings)
   - New pages/components exist and render
   - Old deprecated paths are removed or redirected
3. Run the smoke tests at the START of implementation (they should all fail).
4. As you complete each step, re-run — they should progressively pass.
5. Phase is done only when ALL smoke tests pass.

## Pattern for smoke test files:

```
test/smoke/phase{N}-{name}.test.ts  — backend
src/smoke/phase{N}-{name}.test.ts   — frontend
```

Each test file should have a header comment explaining what it verifies and referencing the plan/spec doc.
