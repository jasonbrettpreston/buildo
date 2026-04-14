# Active Task: Chain-scope `pipeline_schedules` disable — WF3-02 (H-W19)
**Status:** Implementation — authorized via /proceed
**Workflow:** WF3 — Bug Fix
**Domain Mode:** Backend/Pipeline
**Finding:** H-W19 · RC-W1 · from `docs/reports/script_review_80_86/holistic/_TRIAGE.md`
**Rollback Anchor:** `f1d4dde` (fix(86_timing_calibration): round PERCENTILE_CONT)

---

## Context

- **Goal:** Make `pipeline_schedules.enabled = false` scope to a single chain instead of contaminating every chain that references the same step slug. Today `classify_lifecycle_phase` runs in BOTH the `permits` chain (step 21) AND the `coa` chain (step 10); disabling it for a CoA maintenance window silently kills it in the permits chain as well. run-chain.js:84–92 runs `SELECT pipeline FROM pipeline_schedules WHERE enabled = FALSE` with no chain filter.
- **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md` — currently silent on chain scope of disables. A one-line spec update declaring the new semantics lands alongside the code change (tracked H-S7).
- **Key Files:**
  - `migrations/095_pipeline_schedules_chain_id.sql` (new)
  - `scripts/run-chain.js` (L84–92 — disable query)
  - `src/app/api/admin/pipelines/schedules/route.ts` (L11, L39, L70 — GET/PUT/PATCH handlers: `ON CONFLICT (pipeline)` upsert target must be updated to the new unique index)
  - `src/app/api/admin/stats/route.ts` (L294 — read query; no write, but the shape widens by one column)
  - `src/tests/chain.logic.test.ts` (existing tests reference pipeline_schedules — may need updates)

## State Verification (complete)

- ✅ `pipeline_schedules` schema: migration 038 defines `(pipeline TEXT PRIMARY KEY, cadence, cron_expression, updated_at)`. Migration 047 adds `enabled BOOLEAN NOT NULL DEFAULT TRUE`.
- ✅ Current row count: ~23 seeded (21 in migration 038 + 2 enrichment rows in 047). Small — no `CONCURRENTLY` needed (§3.1).
- ✅ Consumers identified:
  - Writer: admin API `src/app/api/admin/pipelines/schedules/route.ts` (PUT/PATCH).
  - Readers: `scripts/run-chain.js:87`, `src/app/api/admin/stats/route.ts:294`.
- ✅ Valid chain IDs per `scripts/manifest.json`: `permits`, `coa`, `sources`, `entities`. Will pin via CHECK constraint.
- ✅ Next migration number: **095**.
- ✅ No `ON DELETE CASCADE` foreign keys; no `REFERENCES pipeline_schedules` elsewhere.

## Design Decision: Option B (chain-scoped rows) — recommended

Two possible designs. Locking in **Option B** because it's the only one that fully solves H-W19:

| Option | Semantics | Complexity | Solves H-W19? |
|---|---|---|---|
| A — nullable scoping column, keep `PRIMARY KEY (pipeline)` | One row per pipeline; `chain_id` is metadata only; disable is still all-or-nothing | Simpler | **No** — still can't disable for one chain and keep enabled for another |
| **B — replace PK with unique index on `(pipeline, COALESCE(chain_id, '__ALL__'))`** | Multiple rows per pipeline: one global-sentinel row + one per chain | Slightly more migration + admin-API touch | **Yes** — disable can be chain-specific or global |

**NULL → global sentinel convention** mirrors `phase_calibration.permit_type` (migration 087 L46).

## Technical Implementation

### New/Modified Components
- **Migration 095** — UP: add `chain_id TEXT` nullable column with `CHECK (chain_id IN ('permits','coa','sources','entities') OR chain_id IS NULL)`; drop `PRIMARY KEY (pipeline)`; create named unique constraint `idx_pipeline_schedules_scope` on `(pipeline, COALESCE(chain_id, '__ALL__'))`. Existing rows keep `chain_id = NULL` (= "global" — preserves current semantics). DOWN: drop constraint, drop column, restore PK.
- **`run-chain.js:87`** — query becomes `SELECT pipeline FROM pipeline_schedules WHERE enabled = FALSE AND (chain_id IS NULL OR chain_id = $1)` with `[chainId]` parameter.
- **Admin API `schedules/route.ts`** — PATCH upsert at L70 changes `ON CONFLICT (pipeline)` → `ON CONFLICT ON CONSTRAINT idx_pipeline_schedules_scope`. Existing behaviour preserved for all rows that keep `chain_id = NULL`.
- **Admin UI** — out of scope per user direction. Future WF1 can expose the per-chain knob in the editor. Today, all admin UI writes create rows with `chain_id = NULL` (global) — zero behavioural change for the UI.

### Data Hooks/Libs
- `scripts/lib/pipeline.js` — no change needed.
- `src/lib/admin/types.ts` — verify `PipelineSchedule` type may widen by one nullable field.

### Database Impact: YES
- New migration; existing rows preserved (all at `chain_id = NULL`). No backfill required.
- §3.1 Zero-downtime: nullable ADD COLUMN + unique-index replacement on a 23-row table is instant; no `CONCURRENTLY` needed.
- §3.2 Pagination: N/A (small table).

## Standards Compliance

- **Try-Catch Boundary:** N/A (no new API routes; existing routes keep their wrappers).
- **Unhappy Path Tests:** (a) `pipeline_schedules(X, chain_id=NULL, enabled=false)` → `X` skipped in BOTH chains; (b) `(X, chain_id='coa', enabled=false)` + `(X, chain_id='permits', enabled=true)` → `X` runs in permits, skipped in coa; (c) missing row → `X` runs in all chains.
- **logError Mandate:** N/A (script, not API route; existing `pipeline.log.warn` preserved).
- **Mobile-First:** N/A.

## Execution Plan

- [ ] **Rollback Anchor:** `f1d4dde` (recorded above).
- [ ] **State Verification:** complete above.
- [ ] **Spec Review:** Read spec 40 §3.1 L108. Draft one-paragraph spec update declaring per-chain disable semantics + NULL = global convention.
- [ ] **Reproduction:** Extend `src/tests/chain.logic.test.ts` (or create `src/tests/run-chain.logic.test.ts`). Three fixtures (a/b/c above). Mock `pool.query` so no live DB is required (follow existing codebase convention of regex-only infra tests where possible).
- [ ] **Red Light:** Run new test. Must fail because the migration + query filter do not exist yet.
- [ ] **Fix:**
  1. Write migration 095 with named UP + commented DOWN (per repo convention observed in migration 094).
  2. `npm run migrate` (applies migration against local DB).
  3. `npm run db:generate` (regenerates Drizzle types if Drizzle is consumed — verify).
  4. Update `scripts/run-chain.js:87` query + pass `chainId` parameter.
  5. Update `src/app/api/admin/pipelines/schedules/route.ts:70` PATCH upsert `ON CONFLICT` clause to use the named constraint.
  6. Update spec 40 §3.1 paragraph (small edit).
- [ ] **Pre-Review Self-Checklist:**
  1. Does `src/app/api/admin/stats/route.ts:294` read path tolerate the new nullable column? (Yes — `SELECT pipeline, cadence, cron_expression, enabled` does not reference chain_id; unchanged.)
  2. Does the PATCH upsert still work for existing rows where `chain_id = NULL`? (Yes — `ON CONFLICT ON CONSTRAINT` on the new unique index matches all rows.)
  3. Are there any other writers to `pipeline_schedules` I've missed? (Grep across repo: only migrations 038/047 seed + the admin API.)
  4. Does the migration's UP run cleanly from both a fresh DB (where migration 038 just ran) and an existing DB (where 23 rows exist)? Test `npm run migrate` against a snapshot of the current DB.
  5. Does `run-chain.js` still log clearly when a step is skipped due to a disabled row? (Yes — existing log line at L190 unchanged.)
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. Output visible ✅/⬜ for every step above. → WF6 hardening sweep + independent-review agent in worktree. Triage findings; defer non-critical items to `docs/reports/review_followups.md`.

---

**PLAN COMPLIANCE GATE — §10 compliance summary:**

- ✅ **DB:** Migration has UP + (commented) DOWN per repo convention; add-only nullable column on 23-row table — no `CONCURRENTLY` required per §3.1; §3.2 N/A (tiny table); factory updates N/A; destructive DROP PRIMARY KEY + ADD UNIQUE INDEX is safe at this table size.
- ⬜ **API:** One PATCH upsert clause updated; no new routes; no new error paths; `logError` already wrapped by the existing handler; API contract remains backward-compatible (admin UI continues to work unchanged).
- ⬜ **UI:** N/A per user direction (front-end out of scope this round).
- ✅ **Shared Logic:** Single query change in `run-chain.js`; admin API shares the same schema assumption.
- ✅ **Pipeline:** §9.1 N/A (no new multi-row mutations); §9.2 N/A (no new batch INSERTs); §9.3 preserved — re-running migration 095 is safe via `IF NOT EXISTS` on ADD COLUMN + named constraint drop-before-create in DOWN.

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)** — YES (user /proceed)

---

## Execution Summary (post-WF6 + review)

- ✅ Migration 095 authored with named unique index + CHECK constraint + commented DOWN with PK-restore prerequisite note.
- ✅ `run-chain.js:91` query parameterized with `[chainId]`; filter `enabled=false AND (chain_id IS NULL OR chain_id = $1)`.
- ✅ Admin API PATCH `ON CONFLICT` uses INDEX INFERENCE expression form (critical fix from independent review).
- ✅ Spec 40 §3.1.1 documents NULL = global / string = chain-scoped semantics.
- ✅ 4 new/updated tests (chain.logic.test.ts, migration-095.infra.test.ts, admin.ui.test.tsx); full suite 3853/3853 pass.
- ✅ Lint + typecheck clean.

## Adversarial + Independent Review — triage summary
- **Claude independent (worktree):** CK-1 CRITICAL — `ON CONFLICT ON CONSTRAINT <index>` fails; FIXED inline via index-inference form. CK-2 DOWN block clean-up; FIXED. CK-3 Drizzle regen; DEFERRED (raw SQL only).
- **Gemini HIGH:** hardcoded `cadence='Daily'` on INSERT path — DEFERRED as pre-existing unrelated defect.
- **Gemini/DeepSeek:** per-chain API access, mixed-version deploy, shape-only tests — all DEFERRED (out-of-scope per plan OR codebase convention).
- **DeepSeek LOW:** spec wording → FIXED inline.
- **Rejected false positives:** DeepSeek "SQL injection" (param binding + whitelist); Gemini "test organization" (already split).

All deferred + rejected logged to `docs/reports/review_followups.md`.

**Status: READY FOR COMMIT — awaiting user authorization.**
