---
write_scope:
- src/tests/chain-predispatch-wiring.infra.test.ts
- docs/specs/00-architecture/115_scheduling.md
---
# WF2 hygiene H7 — structural lock for the chain pre-dispatch step + Spec 115 §3 bullet — STOP BEFORE COMMIT

## Goal
The orchestrator added (uncommitted, READ them, never edit `.github/workflows/**`) to each of `.github/workflows/chain-{coa-permits,deep-scrapes,entities,sources,wsib}.yml`: a top-level `permissions: { contents: read, actions: read }`, and a step named `Pre-flight — cloud-pre-dispatch (seeds, migrations, guards, CI green for this SHA)` IMMEDIATELY after the `migrate.js --verify` step, running `node scripts/analysis/cloud-pre-dispatch.mjs --dry --only=seed_rows_present,migrations_missing,declared_guards_present,ci_green_for_sha` with env `PIPELINE_CHAIN`, `SUPABASE_DATABASE_URL`, `SUPABASE_CA_CERT_PATH`, `GH_TOKEN`. Lock it so it cannot silently drift.

## Red/Green — NEW `src/tests/chain-predispatch-wiring.infra.test.ts`
Header `// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §3` and `// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7.2 A5`. Parse each file with `js-yaml` (`load`; see how `src/tests/chain-sources-workflow.infra.test.ts` imports/parses YAML and copy that). For EACH of the five files (`it.each`):
- `permissions` deep-equals `{ contents: 'read', actions: 'read' }`.
- in the (single) job's `steps`, the index of the step whose `run` contains `cloud-pre-dispatch.mjs` is exactly (index of the step whose `run` is `node scripts/migrate.js --verify`) + 1.
- that step's `run` contains `--dry` and its `--only=` value, split on `,`, deep-equals `['seed_rows_present','migrations_missing','declared_guards_present','ci_green_for_sha']` (never `stranded_running_rows`/`sharing_chain_running` — one owner per concern).
- its `env` has keys `PIPELINE_CHAIN`, `SUPABASE_DATABASE_URL`, `SUPABASE_CA_CERT_PATH`, and `GH_TOKEN === '${{ github.token }}'`.
- every `--only` id is in the script's exported `CHECK_IDS` (import `scripts/analysis/cloud-pre-dispatch.mjs` the way `src/tests/cloud-pre-dispatch.logic.test.ts` does).
Then prove RED once: run the test against a string where the step is removed (a pure helper `predispatchIndex(steps)` tested on a tampered steps array that drops it → returns -1 and the adjacency assertion would fail). Keep helpers pure.

## Spec 115 §3 (edit_file only)
After the bullet that starts `- **\`migrate.js --verify\` pre-flight**` (ends `...against a schema it wasn't written for.`), insert a new bullet: `- **Cloud pre-dispatch pre-flight** (WF2 hygiene H7, 2026-09-27) — every \`chain-*.yml\` runs \`node scripts/analysis/cloud-pre-dispatch.mjs --dry --only=seed_rows_present,migrations_missing,declared_guards_present,ci_green_for_sha\` immediately after the \`migrate.js --verify\` step: a missing \`logic_variables\` seed row, an unapplied migration, an absent declared guard, or a SHA whose newest \`Test Suite\`/\`DB Integration Tests\` run is not \`success\` (operator D2) fails the job before any chain step runs. The workflows declare \`permissions: { contents: read, actions: read }\` for the step's \`gh run list\`. Locked by \`src/tests/chain-predispatch-wiring.infra.test.ts\`.`

## Gate answers
Test + prose only; no descriptor field, logic variable, check limit, emits key or counters source — no Spec 124 §5 R-BA gate reads it.

## Green
`npx vitest run src/tests/chain-predispatch-wiring.infra.test.ts`; `npx eslint src/tests/chain-predispatch-wiring.infra.test.ts`; `npx tsc --noEmit`; `node scripts/analysis/spec-split-check.mjs --check`.

## Stop
UNCOMMITTED. No git_commit. Report the diff.
