---
write_scope:
- src/tests/deep-scrapes-workflow.infra.test.ts
allow_commit: false
---
# deep-scrapes workflow lock: fix the sanity test after the GREEN yml change — STOP BEFORE COMMIT
**Provider:** deepseek. One anchored `edit_file`. NEVER git add / commit / stash / reset.
The orchestrator fixed `.github/workflows/chain-deep-scrapes.yml`: the "Derive PG_*" step now emits `::add-mask::` before its GITHUB_ENV write, and the separate "Mask PG_PASSWORD in logs" step is DELETED (it was the leak's display point). The test "sanity: the splitter actually sees the real workflow steps" (~line 346) still asserts a step named /Mask PG_PASSWORD/ exists, so it now fails.
Change: replace that line with an assertion that the step named /Derive PG_/ has a `run` containing `::add-mask::`, and add one asserting NO step name matches /Mask PG_PASSWORD/ (the deleted display-point step must not return). Keep the /Derive PG_/ presence check.
**Verify:** `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run src/tests/deep-scrapes-workflow.infra.test.ts` → all pass.
