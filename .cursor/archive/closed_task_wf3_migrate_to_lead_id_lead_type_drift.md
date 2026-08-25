# Active Task: WF3 #migrate-to-lead-id-lead-type-drift — strip stale lead_type references after R5.3 trigger-based dual-write pivot

**Status:** COMPLETE 2026-05-14 — Green Light verified end-to-end (npm run test ✓, typecheck ✓, live re-run of migrate-to-lead-id.js: 901,209 rows backfilled in 25.3s, zero errors). Migration 138 still blocked by an unrelated LPAD-collision bug (136 dup lead_ids in cost_estimates from '0' vs '00' revision_num inconsistency) — split into a separate WF3 per user direction.
**Workflow:** WF3 (Bug Fix)
**Domain Mode:** Backend/Pipeline (`scripts/`, `migrations/`, `docs/specs/`) — read `scripts/CLAUDE.md` ✓ + `docs/specs/00_engineering_standards.md` §2/§3/§6/§7/§9 ✓ + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1–R12 ✓ + Spec 42 §6.5/§6.6.C/§6.11 ✓.
**Rollback Anchor:** `cea6d47` (current HEAD on main — R5.1 classifier substrate)
**Parent epic:** Unblocks Phase C migration chain (138-145), then R5.2 link-coa-to-parcels (queued at `.cursor/queued_task_cycle1_R5.2_link_coa_to_parcels.md`).
**Adversarial review:** USER-REQUESTED on this WF3 plan (exception to the default "WF3 no adversarial" rule in `feedback_review_protocol.md`).

---

## Context

### Bug
`scripts/migrate-to-lead-id.js` raises `column "lead_type" does not exist` when the `UPDATE tracked_projects` statement runs (script line 124–131). The whole `pipeline.withTransaction` envelope (cost_estimates + trade_forecasts + tracked_projects + lead_analytics) rolls back. Production migration chain is blocked: migrations 138 (`promote_cost_estimates_lead_id_not_null`) through 145 (`phase_d_classifier_substrate`) cannot apply because their precondition is `migrate-to-lead-id.js` having run cleanly.

### Reproduction
Discovered 2026-05-14 during R5.2 R0 Audit pre-flight:
```
$ node scripts/migrate-to-lead-id.js
{"level":"INFO","msg":"cost_estimates backfilled: 247030 rows"}
{"level":"INFO","msg":"trade_forecasts backfilled: 654179 rows"}
{"level":"ERROR","msg":"column \"lead_type\" does not exist","code":"42703",
 "stack":"at scripts/migrate-to-lead-id.js:124:18"}
```
After rollback, `cost_estimates.lead_id` + `trade_forecasts.lead_id` are NULL again. DB is at mig 137; the failed transaction reverted the inserts. Snapshot saved as `buildo_premig_124_145_2026-05-14.dump` (422MB) at session start.

### Root Cause
Three sources of drift compounded:

1. **Original design (pre-R5.3):** Spec 42 §6.6.C R2.v3 (2026-05-13) wrote: *"tracked_projects already has `lead_type` column. Phase C backfills only permit-side lead_id."* This assumed a `lead_type` column existed on `tracked_projects`.

2. **Reality check:** `lead_type` only exists on `lead_views` (mig 070 created it there with values `'permit'|'builder'`). It was never added to `tracked_projects`. No migration in `migrations/` adds `lead_type` to `tracked_projects` (verified via `grep` — zero matches).

3. **R5.3 design pivot (commit `872ec73`, 2026-05-13):** Introduced trigger-based dual-write for the permit↔CoA mirror tables. This pivot made the lead_type column unnecessary on consumer tables because `lead_id LIKE 'permit:%'` / `'coa:%'` prefix encoding already distinguishes the two streams canonically. But the cleanup was incomplete:
   - `scripts/migrate-to-lead-id.js` (last touched in R5.2 commit `27b3c3f` — 1 commit before the R5.3 pivot) still references `lead_type` at line 128 (UPDATE filter) and line 200 (emitMeta).
   - Spec 42 §6.5 step 27, §6.6.C, §6.11 still claim tracked_projects has `lead_type`.

### Sibling-bug class (Spec 05 §4 lesson routing)
This is the **4th Phase B/C migration drift fix** in 13 days:
- `8d5ce16` — WF3 #phase-b-ci-nulls-distinct — mig 135 NULLS DISTINCT
- `ed2cb3a` — WF3 #phase-b-ci-staging-replay — 3 fixes from staging replay
- `46cbf08` — WF3 #phase-b-ci-trades-fk — seed 17 missing trades in mig 131
- (this WF3)

Pattern: Phase B/C/D specs ship migrations that assume schema state from a sibling migration or design intent that did not materialize. Per `tasks/lessons.md` line 20-21 + sibling WF3 frequency, this pattern needs a stronger destination than per-fix WF3:
- `tasks/lessons.md` entry: "Before authorizing Phase C/D scripts that touch a column, grep `migrations/` for `ALTER TABLE <table>.*ADD COLUMN <col>` to confirm the column-add migration exists on disk and is applied. Do not trust spec text or prior migration comments."

### Mitigating factor (why this is low-risk)
`tracked_projects` is **empty** (0 rows in dev; per mig 140 R0.8 audit comment: "tracked_projects is currently empty (0 rows). Both the NULL pre-check and the duplicate pre-check are trivially satisfied"). Removing the `lead_type` filter has no behavioral impact on row count: the UPDATE was a no-op before the column-not-found error, and remains a no-op after the fix. The script's intent (don't backfill CoA rows) is moot — there are no rows to gate.

### Target Specs
- `docs/specs/01-pipeline/42_chain_coa.md`
  - §6.5 step 27 — strike *"tracked_projects already has `lead_type` column"*
  - §6.6.C consumer table row for tracked_projects — strike *"Existing `lead_type` column already segregates 'permit' vs 'coa' rows"*; replace with *"`lead_id` prefix (`permit:` / `coa:`) is the canonical distinction"*
  - §6.11 Phase C R5.2 — note that lead_type-aware filtering was retired in R5.3 trigger-based dual-write pivot
- `tasks/lessons.md` — add Phase B/C migration drift class lesson
- No schema change. No system-map regen required.

### Key Files
- `scripts/migrate-to-lead-id.js`
  - line 118–122 — strip the `lead_type-aware` comment block
  - line 124–131 — UPDATE statement: remove `AND (lead_type IS NULL OR lead_type = 'permit')` filter; keep `WHERE lead_id IS NULL AND permit_num IS NOT NULL AND revision_num IS NOT NULL`
  - line 198–202 — emitMeta `tracked_projects` array: drop `'lead_type'`
- `src/tests/migrate-to-lead-id.infra.test.ts`
  - line 68–70 — extend the existing `tracked_projects` regression-lock to assert that the SQL has **no** `lead_type` reference (positive regression-lock per Spec 47 §12)
- `docs/specs/01-pipeline/42_chain_coa.md` — three section edits as above
- `tasks/lessons.md` — single new lesson entry under `## Pipeline`

---

## Standards Compliance

* **Try-Catch Boundary (§2.2):** N/A — script changes only; existing top-level try-catch in `pipeline.run` envelope preserved.
* **Unhappy Path Tests (§2.1):** Regression-lock test asserts the SQL string contains no `lead_type` token (positive constraint against re-introduction). No new unhappy paths created; the existing `WHERE lead_id IS NULL` idempotency guard is retained.
* **logError Mandate (§6.1):** N/A — no new catch blocks.
* **Pipeline Safety §9.1 Transaction Boundaries:** UNCHANGED — single `withTransaction` envelope wrapping all 4 UPDATEs preserved per R2 DeepSeek finding.
* **§9.2 Param limit:** N/A — server-side UPDATEs, no batch inserts.
* **§9.3 Idempotency:** PRESERVED — `WHERE lead_id IS NULL` guards every UPDATE. Re-runs match zero rows on already-backfilled tables.
* **§7 Dual Code Path:** N/A — script-only fix; no TS↔JS twin.
* **Spec 47 §R1–R12:** unchanged — advisory lock 4205, getDbTimestamp, withAdvisoryLock, withTransaction, emitSummary, emitMeta all preserved.

---

## WF3 Execution Plan (verbatim from `.claude/workflows.md`)

- [ ] **Rollback Anchor:** `cea6d47` recorded above.
- [ ] **State Verification:** Confirm via live DB: (a) `coa_applications` does NOT have `parcel_linked_at` yet (blocked by mig 145), (b) `tracked_projects` does NOT have `lead_type` column, (c) `tracked_projects` has 0 rows, (d) `cost_estimates.lead_id` is currently NULL on 247K rows (rolled back from the failed backfill), (e) `trade_forecasts.lead_id` is currently NULL on 654K rows (rolled back).
- [ ] **Spec Review:** Re-read Spec 42 §6.5 step 27, §6.6.C, §6.11 — confirm the three lead_type mentions on tracked_projects are the only spec drift; no other consumers reference tracked_projects.lead_type. (Spec 80/82/91 references to `lead_type` are about `lead_views.lead_type` — distinct column — leave untouched.)
- [ ] **Reproduction:** Add a regression-lock test to `src/tests/migrate-to-lead-id.infra.test.ts` that asserts:
  - `expect(src).not.toMatch(/lead_type/i)` — strong assertion the script text has zero `lead_type` references after fix.
- [ ] **Red Light:** `npx vitest run src/tests/migrate-to-lead-id.infra.test.ts` — confirm the new test fails on current (pre-fix) code. Verifies reproduction works.
- [ ] **Fix:**
  1. `scripts/migrate-to-lead-id.js` — remove `lead_type` references at lines 118–131 (UPDATE statement filter + leading comment block) and line 200 (emitMeta array entry).
  2. `docs/specs/01-pipeline/42_chain_coa.md` — three section edits per Target Specs above.
  3. `tasks/lessons.md` — add Pipeline lesson:
     > "Before authorizing a Phase B/C/D pipeline script that filters or writes a column, grep `migrations/` for `ALTER TABLE <table>.*ADD COLUMN <col>` to confirm the column-add migration exists on disk. Discovered 2026-05-14 in migrate-to-lead-id.js (referenced `tracked_projects.lead_type` which was never added). Spec text and prior migration comments are not authoritative for column existence."
- [ ] **Idempotency Check (Backend/Pipeline §R9.3):** Script remains safely re-runnable: WHERE lead_id IS NULL guards each UPDATE; ON CONFLICT not needed (these are UPDATEs not INSERTs); the change only removes a filter, no new state mutations introduced.
- [ ] **Pre-Review Self-Checklist (Spec 47 §12 + sibling-bug pattern):** 5 sibling-class checks:
  1. Does any OTHER pipeline script reference `tracked_projects.lead_type`? — grep `scripts/` for the token.
  2. Does any view/migration written AFTER mig 070 attempt to JOIN on `tracked_projects.lead_type`?
  3. Does the Spec 42 §6.5 step 18 mention of `lead_type='coa'` lead identity refer to `lead_views.lead_type` (correct) or `tracked_projects.lead_type` (would also be drift)?
  4. Does `src/tests/factories.ts` create test rows that set `tracked_projects.lead_type`? — if yes, fix factory.
  5. Is Spec 82 §"CoA Lead Handling" still consistent with the post-fix script behavior?
- [ ] **Independent Review (default WF3):** Spawn feature-dev:code-reviewer with `isolation: "worktree"`. Provide: spec path + modified files list + one-sentence summary. Agent generates its own checklist.
- [ ] **Adversarial Review (USER-REQUESTED override):** ONE parallel message with two additional tool calls:
  - `npm run review:gemini -- review scripts/migrate-to-lead-id.js --context docs/specs/01-pipeline/42_chain_coa.md`
  - `npm run review:deepseek -- review scripts/migrate-to-lead-id.js --context docs/specs/01-pipeline/42_chain_coa.md`
  Triage: BUG → fix before Green Light. DEFER → `docs/reports/review_followups.md`.
- [ ] **Green Light:**
  1. `npm run test && npm run lint -- --fix && npm run typecheck` — all clean.
  2. End-to-end live verification:
     - `node scripts/migrate-to-lead-id.js` — must succeed: cost_estimates 247K + trade_forecasts 654K backfilled; tracked_projects 0 rows (no-op); lead_analytics 0 rows (no-op).
     - `npm run migrate` — runs migrations 138 → 145 to completion.
     - Verify `coa_applications.parcel_linked_at` column exists post-mig-145.
  3. Paste evidence: test summary + typecheck output + script log lines + final `\d coa_applications` snippet.
- [ ] **WF6 Commit:** `fix(42_chain_coa): WF3 #migrate-to-lead-id-lead-type-drift — strip stale lead_type references after R5.3 trigger-based dual-write pivot`
  - Spec 05 §5 footer:
    - Spec: 42
    - Severity: HIGH (blocked migration chain)
    - Reviewers: code-reviewer worktree + Gemini + DeepSeek (adversarial user-requested)
    - Tests: migrate-to-lead-id.infra.test.ts +1 regression-lock
    - Deferred: (any DEFER triaged from review)
    - Lesson-routing: spec + lessons.md (Phase B/C drift class)

---

## Plan-Review (3-reviewer adversarial, USER-REQUESTED — completed 2026-05-14)

Reviewers run in parallel:
1. **Gemini** — `npm run review:gemini` on `scripts/migrate-to-lead-id.js` + Spec 42 context.
2. **DeepSeek** — `npm run review:deepseek` on same.
3. **feature-dev:code-reviewer** (worktree isolation) — read the WF3 plan + relevant migrations + tests + standards; generated its own checklist; produced 8 PASS/FAIL items.

### Triage Table (14 findings — 5 BUG folded into plan, 8 DEFER, 1 INCORRECT)

| # | Sev | Conf | Source | Finding | Decision |
|---|---|---|---|---|---|
| 1 | LOW  | 90 | Worktree C2 | Plan should explicitly state PG error code 42703 + total transaction rollback semantics | **BUG → fold**: State Verification step §a updated. |
| 2 | **HIGH** | 88 | Worktree C3 | Stripping `lead_type` filter is **unsafe for re-runs after Phase D/F populates `tracked_projects` with CoA rows**. Live-DB check confirmed `tracked_projects.permit_num` and `revision_num` are both NOT NULL → any future CoA row will have valid `permit_num` and would be incorrectly backfilled with `'permit:<linked_permit>:<rev>'` instead of `'coa:<app_number>'`. The retained `permit_num IS NOT NULL` guard does NOT protect against this. | **BUG → fold**: Pre-flight assertion added in Fix step: "abort if `tracked_projects` has any rows" (the script is one-shot by design — Phase D classifiers populate `lead_id` on new rows automatically, not via this backfill). Comment in spec §6.11 Phase F notes the discrimination mechanism for future CoA rows shifts to the trigger-based dual-write design from R5.3 commit `872ec73`. |
| 3 | LOW | 92 | Worktree C4 | Test description at `src/tests/migrate-to-lead-id.infra.test.ts:69` says `'lead_type-aware derivation'` — becomes false after fix | **BUG → fold**: Update test description string to `'backfills tracked_projects with permit-side derivation; no lead_type column exists on this table'` |
| 4 | MED  | 85 | Worktree C5 | `migrations/140_promote_tracked_projects_lead_id_unique.sql` lines 3-7 cite `tracked_projects.lead_type` as the rationale for partial UNIQUE — comment is on shipped DDL and will permanently mislead | **BUG → fold**: Migration 140 comment block lines 3-15 rewritten in Fix step. The partial-UNIQUE design is still correct; only the rationale text needs amending (lead_id prefix encoding `permit:` / `coa:` is the canonical distinction; partial UNIQUE permits pre-classification NULL rows from Phase D). |
| 5 | MED  | 87 | Worktree C8 | Sibling lead_type drift in §6.11 Phase F discrimination mechanism + the COMPLETE Phase C `active_task` plan | **BUG → fold (spec only)**: Spec 42 §6.11 Phase F discrimination mechanism updated in Fix step. The COMPLETE `active_task` plan is historical and not edited (per `feedback_wf_plan_format.md` discipline — completed planning artifacts aren't backdated). Added to `tasks/lessons.md` instead. |
| 6 | **CRIT** | 95 | DeepSeek | Advisory lock + transaction use different connections → concurrent invocations could both pass the lock check | **INCORRECT**: `pg_try_advisory_lock` on session A blocks session B at the database level regardless of which client inside session A runs the actual UPDATEs. The callback running queries on different pool clients does not break serialization — only the session holding the lock holds it. Standard Spec 47 pattern shipped on 50+ scripts. No action. |
| 7 | HIGH | 80 | Gemini | `lead_analytics` blindly trusts `lead_key` format — should regex-check before copying | **DEFER**: Pre-existing weakness, not introduced by this WF3 fix. Append to `review_followups.md` for a future Phase C hardening WF3. `lead_analytics` is empty currently per R0.7 audit so no immediate exposure. |
| 8 | MED  | 80 | Gemini | Empty-string guards missing on `permit_num`/`revision_num` — could produce `'permit::01'` malformed lead_ids | **DEFER**: Pre-existing. Append to `review_followups.md`. Lower exposure because the `chk_*_lead_id_format` CHECK constraint (`~ '^(permit|coa):.+$'`) requires non-empty content after the colon, so an empty `permit_num` would surface as a CHECK violation rather than silent corruption. |
| 9 | MED  | 75 | Gemini | Preflight full table scan on `permits.LENGTH(revision_num) > 2` will degrade as table grows | **DEFER**: Pre-existing operational concern. 247K rows scans in ms. Append to `review_followups.md`. |
| 10 | MED | 80 | Gemini | `deriveLeadId` JS twin not used in script — risk of TS/JS dual-path drift | **DEFER**: Already partially addressed by the typeof import check; full drift-test belongs to a Spec 84 §7 follow-up. Append to `review_followups.md`. |
| 11 | NIT | 60 | Gemini | Spec §6.6.A LPAD truncation contradicts implementation | **DEFER**: Spec-text edit, low blast radius. Append to `review_followups.md`. |
| 12 | NIT | 50 | Gemini | Template literal `${table}` interpolation in post-backfill loop — safe here but normalizes a risky pattern | **DEFER**: Pre-existing style. Append to `review_followups.md`. |
| 13 | HIGH | 80 | DeepSeek | Preflight only validates `permits.revision_num` — consumer tables may have wider values that would silently truncate via LPAD | **DEFER**: Pre-existing widening concern. R0.10 audit confirmed `MAX(LENGTH(revision_num))=2` in `permits` 2026-05-13; consumer tables inherit `revision_num` from `permits` via existing FK (cost_estimates) and INSERT...SELECT (trade_forecasts) so the constraint is transitively enforced. Append to `review_followups.md`. |
| 14 | MED | 75 | DeepSeek | Post-backfill null-count check exempts `tracked_projects` without explaining why | **DEFER**: Documentation-only. Append to `review_followups.md`. |

### BUG-fix application summary (folded into plan below)

1. **State Verification step (b)** — explicitly state crash mode: `PG error 42703 (undefined_column)` aborts the entire `withTransaction` envelope; both already-committed `cost_estimates` (247K) and `trade_forecasts` (654K) UPDATEs roll back.
2. **Fix step (1) — add preflight assertion** — abort if `tracked_projects` has any rows (script is one-shot; Phase D rows must not coexist with this backfill).
3. **Fix step (1) — update test description** at `src/tests/migrate-to-lead-id.infra.test.ts:69`.
4. **Fix step (3) — add Migration 140 comment block (lines 3-15)** to the edit list; rewrite rationale to cite `lead_id` prefix encoding as the canonical permit/CoA distinction.
5. **Fix step (2) — Spec 42 §6.11 Phase F** discrimination mechanism updated to reference the R5.3 trigger-based dual-write design.

DEFER findings (7-14) appended to `docs/reports/review_followups.md` under a new heading `## migrate-to-lead-id.js — Phase C hardening followups (2026-05-14)`.

---

## Fix Step (revised after plan-review)

1. **`scripts/migrate-to-lead-id.js`** —
   - Lines 118–122 — strip the lead_type-aware comment block.
   - Lines 124–131 — UPDATE statement: remove `AND (lead_type IS NULL OR lead_type = 'permit')` filter; retain `WHERE lead_id IS NULL AND permit_num IS NOT NULL AND revision_num IS NOT NULL` for defensive sanity (Spec 47 §R8 null-safety habit).
   - Lines 198–202 — emitMeta `tracked_projects` array: drop `'lead_type'`.
   - **NEW preflight (after revision_num length check, before `withTransaction`)**: assert `SELECT COUNT(*) FROM tracked_projects = 0` — if non-zero, throw a clear error explaining the script is one-shot and Phase D rows must not coexist with this backfill (Worktree C3 fix).
2. **`docs/specs/01-pipeline/42_chain_coa.md`** —
   - §6.5 step 27 — strike *"tracked_projects already has `lead_type` column"*.
   - §6.6.C consumer table row — replace lead_type sentence with *"`lead_id` prefix (`permit:` / `coa:`) is the canonical distinction"*.
   - §6.11 Phase C — note R5.3 pivot retired the lead_type prerequisite.
   - §6.11 Phase F NOT NULL promotion — note discrimination is via lead_id prefix and the R5.3 trigger-based dual-write design (not lead_type column).
3. **`migrations/140_promote_tracked_projects_lead_id_unique.sql`** — rewrite lines 3-15 comment block. Replace the lead_type-justification narrative with: *"The partial UNIQUE (WHERE lead_id IS NOT NULL) supports the R5.3 trigger-based dual-write pivot — Phase D inserts may land CoA-side rows whose `lead_id` remains NULL until classification completes. Partial UNIQUE permits the NULL window without violating uniqueness."* No DDL change.
4. **`src/tests/migrate-to-lead-id.infra.test.ts`** —
   - Line 68-70 — update test description to `'backfills tracked_projects with permit-side derivation; no lead_type column exists on this table'`.
   - **NEW assertion**: `expect(src).not.toMatch(/\\blead_type\\b/i)` — positive regression-lock that the token does not return.
   - **NEW assertion**: `expect(src).toMatch(/SELECT COUNT.*FROM tracked_projects/i)` — preflight assertion is present.
5. **`tasks/lessons.md`** — add under `## Pipeline`:
   > "Before authorizing a Phase B/C/D pipeline script that filters or writes a column, grep `migrations/` for `ALTER TABLE <table>.*ADD COLUMN <col>` to confirm the column-add migration exists on disk. Discovered 2026-05-14 in migrate-to-lead-id.js (referenced `tracked_projects.lead_type` which was never added). Spec text and prior migration comments are NOT authoritative for column existence — verify against `information_schema.columns`."
6. **`docs/reports/review_followups.md`** — append DEFER findings 7-14 under new heading `## migrate-to-lead-id.js — Phase C hardening followups (2026-05-14)`.

---

> **PLAN LOCKED — 3-reviewer adversarial review complete; 5 BUGs folded, 8 DEFERs queued, 1 finding rejected as incorrect.**
>
> Files to be modified:
> - `scripts/migrate-to-lead-id.js` (3 edits + 1 NEW preflight)
> - `docs/specs/01-pipeline/42_chain_coa.md` (4 sections)
> - `migrations/140_promote_tracked_projects_lead_id_unique.sql` (comment block only — no DDL change)
> - `src/tests/migrate-to-lead-id.infra.test.ts` (description + 2 new assertions)
> - `tasks/lessons.md` (1 new entry)
> - `docs/reports/review_followups.md` (1 new section with 8 DEFER items)
>
> Post-fix verification:
> - `npm run test && npm run lint -- --fix && npm run typecheck` clean
> - `node scripts/migrate-to-lead-id.js` succeeds end-to-end
> - `npm run migrate` runs 138 → 145 to completion
> - `\d coa_applications` shows `parcel_linked_at` post-mig-145
>
> **Do you authorize this WF3 plan? (y/n)**
> DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE until authorization.
