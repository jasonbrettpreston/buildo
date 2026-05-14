# Active Task: WF3 #mig-139-composite-unique — fix mig 139's wrong UNIQUE shape (lead_id-alone → composite (lead_id, trade_slug))

**Status:** COMPLETE 2026-05-14 — Green Light verified end-to-end. All migrations 139→145 applied cleanly in one `npm run migrate` run (mig 139: 1964ms; mig 145: 1620ms). Phase C migration chain is FULLY COMPLETE on local dev DB. R5.2 blocking prereq `coa_applications.parcel_linked_at` confirmed present. 3-reviewer diff review: Worktree GO, Gemini + DeepSeek findings triaged (1 BUG folded inline = order swap; 1 REJECTED = DeepSeek SET LOCAL persistence claim is incorrect; rest DEFERRED to a project-wide hardening WF for NOT VALID CHECK pattern).
**Workflow:** WF3 (Bug Fix)
**Domain Mode:** Backend/Pipeline (`migrations/`, `src/tests/`, `docs/specs/`) — read `scripts/CLAUDE.md` ✓ + `docs/specs/00_engineering_standards.md` §3 ✓ + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` ✓ + Spec 42 §6.6.A.1 + §6.6.C ✓.
**Rollback Anchor:** `4b9ff32` (HEAD on main — WF3 #lpad-revision-num-collision shipped, cost_estimates.lead_id NOT NULL + UNIQUE applied)
**Parent epic:** Continues unblocking Phase C migration chain (138-145) → Phase D R5.2 link-coa-to-parcels (queued) → Phases E-H per Spec 42.
**Adversarial review:** USER-REQUESTED on this WF3 plan (exception to the default "WF3 no adversarial" rule in `feedback_review_protocol.md`).

---

## Context

### Bug
Phase C migration 139 (`promote_trade_forecasts_lead_id_not_null.sql`) aborts at its Stage-2 pre-check:

```
RAISE EXCEPTION 'Phase C migration 139 aborted: trade_forecasts has 91724
duplicate lead_id values — investigate before retrying'
```

The 91,724 "duplicate" lead_ids are not a data quality bug — they're the **natural composite-key shape** of `trade_forecasts`. Every permit row has one `trade_forecasts` row per `trade_slug` (17-18 trades per typical permit per the sample audit), all sharing the same lead_id. The Phase B lead_id derivation `'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')` is invariant across trade_slug — by design.

Mig 139 was authored with the wrong invariant: it promotes a single-column `UNIQUE(lead_id)` index on a table whose natural key is `(lead_id, trade_slug)`. The pre-check that aborts is correctly catching the design error — the migration as written cannot ever succeed against a populated table.

### Reproduction (live DB, 2026-05-14)
```sql
-- lead_id-alone dup count (cannot satisfy plain UNIQUE):
SELECT COUNT(*) FROM (
  SELECT lead_id FROM trade_forecasts GROUP BY lead_id HAVING COUNT(*) > 1
) d;
-- → 91,724

-- (lead_id, trade_slug) composite dup count (SHOULD be the UNIQUE shape):
SELECT COUNT(*) FROM (
  SELECT lead_id, trade_slug FROM trade_forecasts
  WHERE lead_id IS NOT NULL
  GROUP BY lead_id, trade_slug HAVING COUNT(*) > 1
) d;
-- → 0 (clean composite key)

-- Existing PK is already composite (preserves the trade-per-permit cardinality):
\d trade_forecasts
-- → PRIMARY KEY (permit_num, revision_num, trade_slug)
```

### Root Cause
Mig 139's pre-check + UNIQUE INDEX both target `lead_id` alone. Looking at:
- **Existing PK** (mig 071 + later): `PRIMARY KEY (permit_num, revision_num, trade_slug)` — composite by design from day one.
- **Spec 42 §6.6.C** (line 538): *"`trade_forecasts` | `lead_id TEXT` | Same. PK becomes `(lead_id, trade_slug)` after backfill."*
- **Mig 139's actual code** (lines 28-46): `GROUP BY lead_id HAVING COUNT(*) > 1` (Stage 2) + `CREATE UNIQUE INDEX uniq_trade_forecasts_lead_id ON trade_forecasts (lead_id)` (line 40).

The migration drops the trade_slug dimension that Spec 42 explicitly preserves. This is a one-character spec→migration translation error — the spec text "PK becomes `(lead_id, trade_slug)`" was implemented as just `(lead_id)`.

### Why mig 139 has never successfully applied anywhere
Stage-2's `GROUP BY lead_id HAVING COUNT(*) > 1` returns 91,724 on every populated `trade_forecasts` table (production, staging, dev). The migration aborts at the pre-check before any DDL runs. **This is a never-applied migration**, which simplifies the fix: modifying mig 139 in place causes no behavioral drift on any environment.

### Sibling-bug class
This is the 5th Phase B/C migration drift fix in 13 days:
- `8d5ce16` — WF3 #phase-b-ci-nulls-distinct (mig 135)
- `ed2cb3a` — WF3 #phase-b-ci-staging-replay
- `46cbf08` — WF3 #phase-b-ci-trades-fk (mig 131)
- `47a7b10` — WF3 #migrate-to-lead-id-lead-type-drift (yesterday)
- `4b9ff32` — WF3 #lpad-revision-num-collision (today, mig 138_a + mig 138)
- (this WF3) — mig 139

The pattern is now firmly established: **Phase B/C migrations were authored ahead of full DB validation**. Per the existing `tasks/lessons.md` Pipeline entry (added in WF3 #migrate-to-lead-id-lead-type-drift), the mitigation is: *verify column existence via `information_schema` AND verify constraint invariants by running the pre-check query against a populated dev DB before authorizing the migration*. This WF3 adds the constraint-invariant clause to the lesson.

### Target Specs
- `docs/specs/01-pipeline/42_chain_coa.md` §6.6.C (consumer-table promotion plan) — verify the row for trade_forecasts is consistent with the fix; no change expected, possibly add a clarifying note that mig 139 implements the composite UNIQUE.
- `tasks/lessons.md` Pipeline section — extend the existing column-existence lesson to also cover constraint-invariant verification.

### Key Files
- `migrations/139_promote_trade_forecasts_lead_id_not_null.sql` — change Stage-2 pre-check + UNIQUE INDEX from `lead_id`-alone to `(lead_id, trade_slug)` composite.
- `src/tests/migration-139-promote-trade-forecasts-lead-id.infra.test.ts` — existing regression-lock test (per the migration-test grep showing `migration-139-*` file). Likely asserts current single-column UNIQUE — needs amendment to assert composite shape.
- `docs/reports/review_followups.md` — append any DEFER findings.

---

## Standards Compliance

* **Try-Catch Boundary (§2.2):** N/A — migration file only.
* **Unhappy Path Tests (§2.1):** Existing regression-lock test asserts the migration's shape. New assertion: `(lead_id, trade_slug)` composite UNIQUE present + single-column `(lead_id)` absent.
* **logError Mandate (§6.1):** N/A.
* **Pipeline Safety §9.1 Transaction Boundaries:** The migration runs `CONCURRENTLY` (`CREATE UNIQUE INDEX CONCURRENTLY` requires non-transactional mode — migrate.js routes the whole file non-transactionally when `CONCURRENTLY` is detected). No changes to that mechanism.
* **§9.2 Param limit:** N/A.
* **§9.3 Idempotency:** `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS` (already in mig 139 line 40) + `DROP INDEX CONCURRENTLY IF EXISTS` (already in line 42). Preserved.
* **§7 Dual Code Path:** N/A.
* **Spec 47 §R1-R12:** N/A (migration file, not a pipeline script).

---

## WF3 Execution Plan (verbatim from `.claude/workflows.md`)

- [ ] **Rollback Anchor:** `4b9ff32` ✓
- [ ] **State Verification:** Confirm via live DB (already done in plan-prep — included above):
  - PK on trade_forecasts is `(permit_num, revision_num, trade_slug)` ✓
  - `(lead_id, trade_slug)` composite dups = 0 ✓
  - `lead_id`-alone dups = 91,724 ✓
  - Spec 42 §6.6.C intent is composite `(lead_id, trade_slug)` ✓
- [ ] **Spec Review:** Re-read Spec 42 §6.6.C; confirm the row for trade_forecasts unambiguously specifies composite key intent.
- [ ] **Reproduction:** Update `src/tests/migration-139-promote-trade-forecasts-lead-id.infra.test.ts` to assert:
  - SQL contains `GROUP BY lead_id, trade_slug HAVING COUNT(*) > 1` (composite Stage-2 pre-check)
  - SQL contains `CREATE UNIQUE INDEX ... (lead_id, trade_slug)` (composite UNIQUE)
  - SQL does NOT contain the prior single-column shape `UNIQUE INDEX ... (lead_id)` (anti-regression assertion)
- [ ] **Red Light:** Run the test — must fail on current (single-column) state.
- [ ] **Fix:** Modify `migrations/139_promote_trade_forecasts_lead_id_not_null.sql`:
  - Stage-2 pre-check: `GROUP BY lead_id` → `GROUP BY lead_id, trade_slug`
  - UNIQUE INDEX shape: `(lead_id)` → `(lead_id, trade_slug)`
  - Index name: `uniq_trade_forecasts_lead_id` → `uniq_trade_forecasts_lead_id_trade` (clarifies composite shape)
  - Update header comment to explain composite key per Spec 42 §6.6.C
- [ ] **Idempotency Check (Backend/Pipeline §9.3):** `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS` + `DROP INDEX CONCURRENTLY IF EXISTS` preserved.
- [ ] **Pre-Review Self-Checklist (Spec 47 §12 + sibling-bug pattern):**
  1. Does mig 140 (tracked_projects) have the same problem? — Check: it's already partial UNIQUE on `lead_id` alone, but tracked_projects naturally has 1 row per (permit, user) — needs separate verification.
  2. Does mig 141 (lead_analytics) have the same problem? — Check: lead_analytics is empty so the pre-check would trivially pass; need to verify intent.
  3. Are there downstream queries that JOIN trade_forecasts on `lead_id` alone (expecting 1 row per lead)? If yes, they break. Grep `src/`, `scripts/`.
  4. Does the new composite UNIQUE align with the existing PK `(permit_num, revision_num, trade_slug)`? Both are 3-column composites with `trade_slug` as the trailing dimension — symmetric.
  5. Will Phase H's eventual PK swap (per Spec 42) need `uniq_trade_forecasts_lead_id_trade` to already exist? Yes — that's the planned destination.
- [ ] **Independent Review (default WF3):** Spawn feature-dev:code-reviewer with `isolation: "worktree"`. Provide: spec path + modified files list + one-sentence summary.
- [ ] **Adversarial Review (USER-REQUESTED override):** ONE parallel message:
  - `npm run review:gemini -- review migrations/139_promote_trade_forecasts_lead_id_not_null.sql --context docs/specs/01-pipeline/42_chain_coa.md`
  - `npm run review:deepseek -- review migrations/139_promote_trade_forecasts_lead_id_not_null.sql --context docs/specs/01-pipeline/42_chain_coa.md`
  - Triage: BUG → fix before Green Light. DEFER → `docs/reports/review_followups.md`.
- [ ] **Green Light:**
  1. `npm run test && npm run lint -- --fix && npm run typecheck` clean.
  2. End-to-end live verification: `npm run migrate` — runs mig 139 → expected to apply cleanly (Stage 1 passes since cost_estimates backfill is complete; Stage 2 with composite key returns 0 dups; UNIQUE INDEX builds in <60s on 654K rows). Continue through mig 140 → 145; if those abort on the same sibling-class drift, file new WF3s.
  3. Paste evidence: test summary + typecheck + `\d trade_forecasts` post-mig-139 showing `uniq_trade_forecasts_lead_id_trade`.
- [ ] **WF6 Commit:** `fix(42_chain_coa): WF3 #mig-139-composite-unique — promote trade_forecasts.lead_id with composite UNIQUE(lead_id, trade_slug) per Spec 42 §6.6.C`
  - Spec 05 §5 footer:
    - Spec: 42
    - Severity: HIGH (blocked Phase C migration chain mig 139)
    - Reviewers: code-reviewer worktree + Gemini + DeepSeek (adversarial user-requested)
    - Tests: migration-139-promote-trade-forecasts-lead-id.infra.test.ts +2 amended
    - Deferred: (any DEFER from review)
    - Lesson-routing: tasks/lessons.md (Pipeline) — extend constraint-invariant verification clause

---

## Plan-Review (3-reviewer adversarial, USER-REQUESTED — completed 2026-05-14)

All three reviewers converged on the composite UNIQUE fix as correct.

### Spec 42 alignment confirmation
This WF3 does not deviate from the Spec 42 implementation plan. Phase C unblocks → Phase D (R5.2 link-coa-to-parcels queued) → Phases E-H per spec. Spec 42 §6.6.C line 538 explicitly states `"PK becomes (lead_id, trade_slug) after backfill"` — this WF3 directly implements that intent. Worktree reviewer confirmed: *"Spec 42 §6.6.C line 538 is unambiguous. No contradicting language found elsewhere in the spec."*

### Triage Table (12 findings — 3 BUGs folded, 7 DEFER, 2 REJECTED)

| # | Sev | Conf | Source | Finding | Decision |
|---|---|---|---|---|---|
| 1 | **HIGH** | 100 | Worktree | Stage-2 GROUP BY + UNIQUE INDEX both target single-column `lead_id` instead of composite `(lead_id, trade_slug)` | **BUG → fold (core fix, already in plan)** |
| 2 | **HIGH** | 100 | Worktree | Infra test asserts current single-column shape; must be amended in lockstep | **BUG → fold (already in plan; Reproduction step covers it)** |
| 3 | MED | 75 | Worktree | If a developer manually applied mig 139 against an empty `trade_forecasts` (zero rows trivially pass pre-check), the wrong single-column index would exist locally. The amended migration must `DROP INDEX CONCURRENTLY IF EXISTS uniq_trade_forecasts_lead_id` BEFORE the new `CREATE` to clean up such a stale local state. | **BUG → fold**: add explicit `DROP INDEX CONCURRENTLY IF EXISTS uniq_trade_forecasts_lead_id` before the new CREATE statement. |
| 4 | LOW | 90 | Worktree | DOWN block comment references the old index name `uniq_trade_forecasts_lead_id`; must update to new name `uniq_trade_forecasts_lead_id_trade` | **BUG → fold (housekeeping in same edit)** |
| 5 | LOW | 80 | DeepSeek | Stage-2 dup pre-check only reports count, not the actual duplicate values. Operators debugging would need to query separately. | **BUG → fold (small enhancement)**: extend RAISE EXCEPTION to include a comma-separated sample of up to 3 dup lead_ids for operator debug. |
| 6 | **CRIT** | 95 | DeepSeek | `CREATE UNIQUE INDEX CONCURRENTLY` cannot run inside a transaction block; mig 139 will fail with `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block` | **REJECTED**: `scripts/migrate.js:195` explicitly detects `CONCURRENTLY` and routes the file non-transactionally (splits top-level statements, each runs in its own implicit transaction). Same pattern as mig 132 + mig 138 which both applied cleanly. DeepSeek assumed a generic migration runner. |
| 7 | HIGH | 80 | DeepSeek | `SET LOCAL statement_timeout` doesn't apply because the file runs non-transactionally — the SET LOCAL is effectively a no-op | **TECHNICALLY CORRECT but no real impact**: mig 138 has the same SET LOCAL structure and applied in 1366ms (well under any reasonable session default). Document the no-op as a pattern in `tasks/lessons.md` or DEFER as a project-wide cleanup. **DEFER** with note. |
| 8 | MED | 75 | DeepSeek | `DROP INDEX CONCURRENTLY` same-transaction concern — derivative of #6 | **REJECTED** for same reason as #6. |
| 9 | NIT | 50 | DeepSeek | 5min timeout estimate is stale; production table may be larger | **DEFER**: 654K rows builds in <60s on this hardware; concern is operational. Append to review_followups.md. |
| 10 | NIT | 50 | DeepSeek | SET LOCAL placement cosmetic | **DEFER**: subsumed by #7 (SET LOCAL is no-op anyway). |
| 11 | MED | 60 | Gemini | Race condition between pre-checks and DDL (concurrent inserts) | **DEFER**: deploys run against quiet systems; chain orchestrator's advisory locks prevent concurrent pipeline writes. Append to review_followups.md. |
| 12 | LOW | 70 | Gemini | DOWN block restores partial index but original may have been full | **DEFER**: original index was the Phase B partial index `WHERE lead_id IS NOT NULL` (verified — see existing mig 134 line 69). DOWN is correct. Reviewer was guessing. |
| — | CRIT | — | Gemini | Spec §6.6.A LPAD truncation is "fundamentally flawed" | **OUT OF SCOPE / already addressed**: prior WF3 commit `4b9ff32` corrected Spec 42 §6.6.A.1 to document actual truncation semantics + added the LPAD-collision preflight to migrate-to-lead-id.js. Gemini was reviewing an outdated source. |
| — | HIGH | — | Gemini | Dual-ledger lifecycle history (Spec §6.6.B) | **OUT OF SCOPE**: Spec 84 architectural concern, not this WF3. |
| — | HIGH | — | Gemini | DEFAULT NOW() timestamps poison timing models | **OUT OF SCOPE**: Spec 84/85 concern; mig 139 doesn't touch lifecycle_status_history. |
| — | MED | — | Gemini | Phase H big-bang refactoring risk | **OUT OF SCOPE**: project-roadmap concern, addressed by R5.4-R5.6 deferral structure in Spec 42 §6.11. |
| — | LOW | — | Gemini | lifecycle_status_history idempotency data loss | **OUT OF SCOPE**: Spec 84 concern. |

### BUG-fix application summary (3 fixes folded into the Fix step below)

1. **Composite Stage-2 pre-check + UNIQUE INDEX shape**: change `GROUP BY lead_id` → `GROUP BY lead_id, trade_slug` and `CREATE UNIQUE INDEX ... (lead_id)` → `CREATE UNIQUE INDEX ... (lead_id, trade_slug)`. Rename index to `uniq_trade_forecasts_lead_id_trade`. (Worktree #1)
2. **Stale local-state cleanup**: explicit `DROP INDEX CONCURRENTLY IF EXISTS uniq_trade_forecasts_lead_id` before the new CREATE, defending against any local DB that might have applied the broken single-column index against an empty `trade_forecasts`. (Worktree #3)
3. **Operator-friendly dup pre-check**: include sample of up to 3 dup `(lead_id, trade_slug)` pairs in the RAISE EXCEPTION message. (DeepSeek LOW)
4. **DOWN block housekeeping**: update DOWN comment to reference new index name. (Worktree LOW)

7 DEFER findings appended to `docs/reports/review_followups.md` under new heading `## mig 139 — Phase C composite-UNIQUE WF3 follow-ups (2026-05-14)`. 2 findings REJECTED (DeepSeek CRIT + MED on transaction block — codebase routes CONCURRENTLY non-transactionally; verified at `scripts/migrate.js:195`).

---

## Fix Step (revised after plan-review)

`migrations/139_promote_trade_forecasts_lead_id_not_null.sql` — full replacement:

```sql
-- 139: Phase C — promote trade_forecasts.lead_id from nullable to NOT NULL
-- + composite UNIQUE(lead_id, trade_slug) per Spec 42 §6.6.C.
--
-- WF3 #mig-139-composite-unique (2026-05-14): prior version of this migration
-- (committed pre-WF3) used single-column `UNIQUE(lead_id)` for the pre-check
-- and the index. trade_forecasts is naturally 1-row-per-`(permit, trade_slug)`:
-- every permit has multiple forecast rows (one per trade slug, ~17-18 per
-- typical permit) all sharing the same lead_id. Plain UNIQUE(lead_id) is
-- mathematically impossible to satisfy on any populated table. Spec 42 §6.6.C
-- explicitly states `"PK becomes (lead_id, trade_slug) after backfill"` — this
-- migration creates the composite UNIQUE that future Phase H PK swap will
-- promote to PRIMARY KEY.
--
-- Two-stage pre-check (R2 DeepSeek finding, carried from prior version):
--   Stage 1: confirm zero NULL lead_id rows (backfill complete)
--   Stage 2: confirm zero duplicate (lead_id, trade_slug) pairs (composite
--            key integrity — should be 0 in production because the existing
--            PK (permit_num, revision_num, trade_slug) already enforces this
--            via the deterministic lead_id derivation)
--
-- Stale local-state cleanup (R8 Worktree #3): an explicit DROP of the OLD
-- single-column index handles any local DB that applied the prior version
-- against an empty trade_forecasts (trivially passes Stage-2 dup pre-check).
-- The IF EXISTS makes this a no-op on fresh DBs.

SET LOCAL statement_timeout = '5min';

-- Stage 1: NULL pre-check
DO $$
DECLARE null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count FROM trade_forecasts WHERE lead_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Phase C migration 139 aborted: trade_forecasts has % rows with NULL lead_id. Run scripts/migrate-to-lead-id.js first.', null_count;
    END IF;
END $$;

-- Stage 2: composite duplicate pre-check (lead_id, trade_slug)
DO $$
DECLARE
    dup_count INTEGER;
    dup_sample TEXT;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT lead_id, trade_slug FROM trade_forecasts
        WHERE lead_id IS NOT NULL
        GROUP BY lead_id, trade_slug HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        -- R8 DeepSeek LOW: surface a sample for operator debugging
        SELECT string_agg(lead_id || ':' || trade_slug, ', ' ORDER BY lead_id, trade_slug) INTO dup_sample
        FROM (
            SELECT lead_id, trade_slug FROM trade_forecasts
            WHERE lead_id IS NOT NULL
            GROUP BY lead_id, trade_slug HAVING COUNT(*) > 1
            LIMIT 3
        ) s;
        RAISE EXCEPTION 'Phase C migration 139 aborted: trade_forecasts has % duplicate (lead_id, trade_slug) pairs — investigate before retrying. Sample: %', dup_count, dup_sample;
    END IF;
END $$;

ALTER TABLE trade_forecasts ALTER COLUMN lead_id SET NOT NULL;

-- Cleanup any stale single-column UNIQUE from a prior local-only application
-- of the broken pre-WF3 version. No-op on fresh DBs (IF EXISTS guard).
DROP INDEX CONCURRENTLY IF EXISTS uniq_trade_forecasts_lead_id;

-- Composite UNIQUE matches Spec 42 §6.6.C: future Phase H PK swap will
-- promote this index pair to PRIMARY KEY.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_trade_forecasts_lead_id_trade ON trade_forecasts (lead_id, trade_slug);

-- Drop the Phase B partial index — now redundant given the composite UNIQUE above.
DROP INDEX CONCURRENTLY IF EXISTS idx_trade_forecasts_lead_id;

-- DOWN block (manual rollback only):
-- DROP INDEX CONCURRENTLY IF EXISTS uniq_trade_forecasts_lead_id_trade;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trade_forecasts_lead_id
--   ON trade_forecasts (lead_id) WHERE lead_id IS NOT NULL;
-- ALTER TABLE trade_forecasts ALTER COLUMN lead_id DROP NOT NULL;
```

`src/tests/migration-139-promote-trade-forecasts-lead-id.infra.test.ts` — amend the two assertions that lock in the wrong single-column shape:
- Stage-2 regex: `GROUP BY lead_id HAVING ...` → `GROUP BY lead_id, trade_slug HAVING ...`
- UNIQUE INDEX regex: `uniq_trade_forecasts_lead_id ON trade_forecasts (lead_id)` → `uniq_trade_forecasts_lead_id_trade ON trade_forecasts (lead_id, trade_slug)`
- Add: assertion that the prior single-column shape is NOT present (anti-regression)
- Add: assertion that `DROP INDEX CONCURRENTLY IF EXISTS uniq_trade_forecasts_lead_id` precedes the new CREATE (stale local-state cleanup, R8 Worktree #3)

`docs/reports/review_followups.md` — append 7 DEFER findings + 2 REJECTED notes under new heading.

`tasks/lessons.md` — extend the existing Pipeline lesson on canonicalization-collision class to also cover constraint-invariant verification (matching the WF3-LPAD lesson but tightening it).

---

## WF3 Execution Plan — UPDATED with plan-review folded

- [ ] **Rollback Anchor:** `4b9ff32` ✓
- [ ] **State Verification:** Live DB checks complete (in Context section). All four pre-conditions confirmed.
- [ ] **Spec Review:** Spec 42 §6.6.C composite intent confirmed unambiguous (worktree reviewer corroborated).
- [ ] **Reproduction:** Amend `src/tests/migration-139-promote-trade-forecasts-lead-id.infra.test.ts` (3 assertion changes + 2 new assertions as listed above).
- [ ] **Red Light:** Run the test — must fail on current (single-column) state.
- [ ] **Fix:** Apply mig 139 full replacement above + test amendments + lessons.md extension + review_followups.md append.
- [ ] **Idempotency Check (§9.3):** `IF NOT EXISTS` on new CREATE; `IF EXISTS` on both DROPs.
- [ ] **Pre-Review Self-Checklist:**
  1. mig 140 (tracked_projects) — Worktree confirmed: partial UNIQUE on lead_id is correct (table is 1-row-per-(user, lead)).
  2. mig 141 (lead_analytics) — Worktree confirmed: plain UNIQUE on lead_id is correct (table is 1-row-per-lead).
  3. Downstream JOINs on trade_forecasts.lead_id alone — Worktree audit: zero broken consumers; all current readers JOIN on legacy `(permit_num, revision_num)` key, deferred to Phase H rekey.
  4. Constraint naming consistency — sibling tables retain their correct names (cost_estimates: plain; lead_analytics: plain; trade_forecasts: composite-renamed). No sibling-bug class introduced.
  5. Mig 139 has never been applied anywhere — confirmed by Stage-2 pre-check always returning 91,724 dups on populated DBs. In-place modification is safe.
- [ ] **Independent Review (default WF3):** worktree feature-dev:code-reviewer (already done as part of plan review — re-run on the actual diff after Fix step).
- [ ] **Adversarial Review (USER-REQUESTED override):** Gemini + DeepSeek on the actual diff after Fix step.
- [ ] **Green Light:**
  1. `npm run test && npm run lint -- --fix && npm run typecheck` clean.
  2. End-to-end: `npm run migrate` — mig 139 applies cleanly; mig 140 → 145 attempted (if any abort on sibling-class drift, file new WF3).
  3. Verify `\d trade_forecasts` shows `uniq_trade_forecasts_lead_id_trade` UNIQUE INDEX, `lead_id` NOT NULL, prior single-column index absent.
- [ ] **WF6 Commit:** `fix(42_chain_coa): WF3 #mig-139-composite-unique — promote trade_forecasts.lead_id with composite UNIQUE(lead_id, trade_slug) per Spec 42 §6.6.C`

---

> **PLAN LOCKED — 3-reviewer adversarial plan review complete.**
> 12 findings: 4 BUGs folded (3 from Worktree, 1 from DeepSeek LOW), 7 DEFER queued, 2 REJECTED (DeepSeek CRIT + MED on `CREATE INDEX CONCURRENTLY` inside transaction — codebase routes CONCURRENTLY non-transactionally per `scripts/migrate.js:195`; verified mig 132 + mig 138 patterns).
>
> Files to be modified (4):
> - `migrations/139_promote_trade_forecasts_lead_id_not_null.sql` (full replacement)
> - `src/tests/migration-139-promote-trade-forecasts-lead-id.infra.test.ts` (assertion amendments + 2 new assertions)
> - `tasks/lessons.md` (extend Pipeline lesson)
> - `docs/reports/review_followups.md` (7 DEFER + 2 REJECTED)
>
> Spec 42 alignment: **on plan**. Phase C migration chain progresses 138 → 139 → 140 (with any subsequent sibling-drift WF3s filed individually).
>
> **Do you authorize this WF3 plan? (y/n)**
> DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE until authorization.
