---
write_scope:
- src/tests/hooks-composition.infra.test.ts
allow_commit: false
---
# WF3 ca-6 — lock the new `generate-chain-args.mjs --check` pre-commit line (GREEN/RED pair) — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, anchored text edits verified once, preserve the file's line endings (LF). NEVER run git add / commit / stash / reset — the orchestrator commits. Touch ONLY `src/tests/hooks-composition.infra.test.ts`.
**Facts (verified by the orchestrator — re-read to confirm, never invent):**
- `.husky/pre-commit` (already edited by the orchestrator; you must NOT touch it) now has, on consecutive lines:
  ```
    node scripts/analysis/generate-target-files.mjs --check && \
    node scripts/analysis/generate-chain-args.mjs --check && \
    node scripts/analysis/spec-split-check.mjs --check && \
  ```
- In `src/tests/hooks-composition.infra.test.ts`, the existing pair to copy is the two `it(...)` blocks headed by the comment `// WF2 generated Target Files, Amendment 1 (2026-09-29)`: `it('GREEN — runs the generated Target Files drift check right after the template-freeze check (Amendment 1)', ...)` and `it('RED — a tampered pre-commit with the Target Files drift check stripped is caught', ...)`. They are the LAST two tests inside the `describe('hooks-composition (R-AG) — pre-commit', ...)` block (followed by `});` and then the `// WF2 hygiene H6 (2026-09-27)` comment banner). Helpers in scope: `PRE_COMMIT`, `stripComments`.

1. **Change:** immediately AFTER the closing `});` of that RED Target Files test (still inside the same `describe`), insert:
```ts

  // WF3 chain_args generated (2026-10-03, Spec 124 R-AZ): the manifest's chain_args for every CONVERTED
  // step are derived from the descriptor's execution.invocation; the drift check is its own pre-commit
  // line right after the Target Files check.
  it('GREEN — runs the generated chain_args drift check right after the Target Files check (R-AZ)', () => {
    const code = stripComments(PRE_COMMIT);
    const at = code.indexOf('node scripts/analysis/generate-chain-args.mjs --check');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(code.indexOf('node scripts/analysis/generate-target-files.mjs --check'));
    expect(at).toBeLessThan(code.indexOf('step-validate.mjs --staged --fast'));
  });

  it('RED — a tampered pre-commit with the chain_args drift check stripped is caught', () => {
    const tampered = PRE_COMMIT.replace(/node scripts\/analysis\/generate-chain-args\.mjs --check && \\\n\s*/, '');
    expect(tampered).not.toBe(PRE_COMMIT);
    expect(stripComments(tampered)).not.toContain('generate-chain-args.mjs --check');
  });
```
Nothing else.
**Verify:** `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run src/tests/hooks-composition.infra.test.ts` — all pass (report the count). `npx eslint src/tests/hooks-composition.infra.test.ts` — clean. Report each result.
