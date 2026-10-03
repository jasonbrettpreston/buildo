---
write_scope:
- src/tests/deep-scrapes-workflow.infra.test.ts
allow_commit: false
---
# deep-scrapes workflow lock: make the new describe block typecheck-clean (noUncheckedIndexedAccess) — STOP BEFORE COMMIT
**Provider:** deepseek. Anchored `edit_file` edits. NEVER git add / commit / stash / reset. Do not change test behaviour.
`npm run typecheck` fails on the block you added earlier (tsconfig has noUncheckedIndexedAccess): array index results are `T | undefined`. Errors:
src/tests/deep-scrapes-workflow.infra.test.ts(226,13): error TS18048: 'line' is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(227,22): error TS18048: 'line' is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(227,65): error TS18048: 'line' is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(229,22): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/tests/deep-scrapes-workflow.infra.test.ts(232,21): error TS18048: 'line' is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(234,27): error TS2532: Object is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(235,24): error TS2532: Object is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(237,11): error TS2532: Object is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(243,26): error TS18048: 'l' is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(244,15): error TS18048: 'l' is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(245,21): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/tests/deep-scrapes-workflow.infra.test.ts(247,9): error TS2532: Object is possibly 'undefined'.
src/tests/deep-scrapes-workflow.infra.test.ts(288,73): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/tests/deep-scrapes-workflow.infra.test.ts(292,117): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/tests/deep-scrapes-workflow.infra.test.ts(295,90): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
Fix each with proper narrowing (e.g. `const line = lines[i]; if (line === undefined) continue;`, `for (const l of arr)`, or `?? ''`) — no `!` non-null assertions, no `any`, no ts-ignore.
**Verify:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep deep-scrapes-workflow` prints nothing; `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run src/tests/deep-scrapes-workflow.infra.test.ts` 19/19 pass.
