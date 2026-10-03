---
write_scope:
- src/tests/deep-scrapes-workflow.infra.test.ts
allow_commit: false
---
# deep-scrapes workflow: lock "mask before GITHUB_ENV export" (RED first) — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, anchored edits, preserve line endings. NEVER git add / commit / stash / reset.
**Why (measured 2026-10-03):** `.github/workflows/chain-deep-scrapes.yml` step "Derive PG_* connection vars" appends `PG_PASSWORD=...` to `$GITHUB_ENV`; the masking runs in the NEXT step (`echo "::add-mask::$PG_PASSWORD"`). GitHub prints that next step's `env:` block before executing it, so the password appeared unmasked once per run in every archived log.
**Measure first:** read `src/tests/deep-scrapes-workflow.infra.test.ts` (how it loads/parses the yml — reuse its loader and style) and the yml steps around "Derive PG_*" and "Mask PG_PASSWORD".
**Add a new `describe` block** (comment: what it pins and why, citing the measured leak) with:
1. For every step whose `run` text writes to `GITHUB_ENV` a line whose NAME matches /PASSWORD|SECRET|TOKEN/i: the same `run` text must contain `::add-mask::` and its first occurrence must come BEFORE the first `GITHUB_ENV` write (index comparison on the run string).
2. No step's `run` (trimmed) is solely an `echo "::add-mask::$<VAR>"` of a variable exported via GITHUB_ENV by an earlier step (that display point is the leak).
3. RED self-check fixtures (inline yml strings parsed the same way): (a) mask-in-next-step shape → rule 1 or 2 fires; (b) mask-before-write in one step → passes.
Do NOT edit the yml. Expected after this brief: tests 1 and/or 2 FAIL on the real yml (that is the RED), fixtures pass.
**Verify:** `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1 npx vitest run src/tests/deep-scrapes-workflow.infra.test.ts` — report which tests fail (expected: the real-yml ones only).
