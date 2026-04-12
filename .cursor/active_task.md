# Active Task: Lifecycle Phase Classification (Strangler Fig V1)
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement (new classifier column + pipeline step + feed consumer wiring)
**Rollback Anchor:** `f27f5dc` (chore(00_engineering_standards): ignore .screenshots/)
**Domain Mode:** **Cross-Domain** — Backend/Pipeline (migration, classifier, chain steps, CoA linker fix) + Frontend (feed SQL consumer + display helper)

---

## Context

* **Goal:** Replace the placeholder "Active build phase" label that appears on every lead feed card with a real, per-permit lifecycle phase. Build the classifier as a Strangler Fig column (`lifecycle_phase`) alongside the existing `enriched_status`, include CoA as a first-class phase source, and wire both pipeline chains to trigger the classifier downstream.
* **Why now:** Six rounds of iterative design have landed on a locked blueprint. The feed's `TIMING_DISPLAY_BY_CONFIDENCE` constant at `src/features/leads/lib/get-lead-feed.ts:495` is a hardcoded placeholder that returns 'Active build phase' for every permit with `pt.phase IN ('structural','finishing','early_construction','landscaping')` — which is ~95% of active permits. It carries zero information. This WF2 ships the real signal users have been asking for.
* **Target Spec:** `docs/reports/lifecycle_phase_implementation.md` (the locked design document, written alongside this active task)
* **Companion references:**
  - `docs/reports/lead_feed_status_inventory.md` — the raw inventory this WF2 classifies
  - `docs/reports/lead_feed_stage_map.md` — the full product vision this WF2 is the first step toward
  - `docs/specs/00_engineering_standards.md` §10 Plan Compliance Checklist (read and verified before PLAN LOCK)
  - `docs/specs/pipeline/41_chain_permits.md` — permits chain (needs new trigger step)
  - `docs/specs/pipeline/42_chain_coa.md` — CoA chain (needs new trigger step)
  - `docs/specs/pipeline/53_source_aic_inspections.md` — explains the Strangler Fig rationale (enriched_status is load-bearing for scraper batch selection)

## Key Files

**New files:**
- `migrations/085_lifecycle_phase_columns.sql`
- `scripts/lib/lifecycle-phase.js` (pure function)
- `src/lib/classification/lifecycle-phase.ts` (TS mirror — dual code path per CLAUDE.md §7)
- `scripts/classify-lifecycle-phase.js` (pipeline script)
- `scripts/trigger-lifecycle-sync.js` (thin handoff — used by both chains)
- `src/features/leads/lib/lifecycle-phase-display.ts` (display label helper)
- `scripts/quality/assert-lifecycle-phase-distribution.js` (Tier 2 CQA check)
- `scripts/quality/lifecycle-phase-sql-reproducer.sql` (round-trip correctness check)
- `src/tests/lifecycle-phase.logic.test.ts` (unit tests — ~500 LOC, 100% branch coverage target)
- `src/tests/classify-lifecycle-phase.infra.test.ts` (idempotency, incremental, trigger integration)
- `src/tests/migration-085.infra.test.ts` (file-shape test)

**Modified files:**
- `scripts/link-coa.js` — add `permits.last_seen_at` bump on newly-linked permits (enables incremental re-classification)
- `scripts/run-chain.js` OR `scripts/manifest.json` (TBD in State Verification — whichever holds the chain step array)
- `src/features/leads/lib/get-lead-feed.ts` — SQL projects `p.lifecycle_phase` + `p.lifecycle_stalled`, `mapRow` uses `displayLifecyclePhase()` for `timing_display`
- `src/features/leads/types.ts` — add `lifecycle_phase` + `lifecycle_stalled` to `PermitLeadFeedItem`
- `src/tests/get-lead-feed.logic.test.ts` — cover the new SQL shape
- `src/tests/api-leads-feed.infra.test.ts` — response assertions
- `docs/specs/pipeline/41_chain_permits.md` — document new trigger step
- `docs/specs/pipeline/42_chain_coa.md` — document new trigger step
- `docs/specs/01_database_schema.md` — document new columns

## Technical Implementation

* **New classifier:** `scripts/lib/lifecycle-phase.js` + `src/lib/classification/lifecycle-phase.ts` — dual code path. Pure function `classifyLifecyclePhase(row)` returning `{ phase, stalled }`. Pure function `classifyCoaPhase(row)` returning `{ phase }`. No DB access, fully unit-testable.
* **Pipeline script:** `scripts/classify-lifecycle-phase.js` — reads dirty rows from `permits` and `coa_applications` (`WHERE last_seen_at > lifecycle_classified_at`), applies the pure function, UPDATEs with `IS DISTINCT FROM` guards. Emits PIPELINE_SUMMARY with full phase distribution + blocking unclassified count.
* **Trigger script:** `scripts/trigger-lifecycle-sync.js` — detached spawn of classifier, marks itself PASS immediately. Own pipeline_runs entry for the classifier shows up as a sibling.
* **Chain integration:** add `trigger_lifecycle_sync` as final step in BOTH permits chain and CoA chain.
* **Feed consumer:** `src/features/leads/lib/get-lead-feed.ts` drops the `timing_confidence` CASE derivation, projects `p.lifecycle_phase` directly, `mapRow` uses `displayLifecyclePhase(row.lifecycle_phase, row.lifecycle_stalled)` to populate `timing_display`. Feed API response shape unchanged.
* **CoA linker fix:** `scripts/link-coa.js` bumps `permits.last_seen_at` on newly-linked permits so the downstream classifier sees them as dirty.
* **Database Impact:** **YES** — migration 085 adds 3 columns to `permits` and 2 columns to `coa_applications`. 4 partial indexes. Zero row backfill at migration time — classifier script handles the initial ~60-120 second write pass.

## Standards Compliance

* **Try-Catch Boundary:** N/A for the classifier (pure function throws only on programmer error, which fuzzing test catches). Pipeline script uses the SDK's `pipeline.run` + `withTransaction` error surface. Feed SQL change is read-only, existing try/catch in `/api/leads/feed/route.ts` covers it.
* **Unhappy Path Tests:** Classifier fuzzing test (1,000 random inputs, 0 crashes). Migration idempotency test (apply twice, second is no-op). Incremental re-classification test (modify one row, verify only that row updates). SQL reproducer test (0 disagreements on 269K rows).
* **logError Mandate:** N/A — no new API routes. The classifier script uses `pipeline.log.warn/error` per SDK convention. The feed SQL edit is read-only (no new catch blocks).
* **Mobile-First:** N/A — the card already renders mobile-first. This WF2 only changes the label string shown in an existing element. LeadFeed.ui.test.tsx will assert the new labels render correctly at 375px.

## Execution Plan

*WF2 execution plan — verbatim per CLAUDE.md. Every step included; inapplicable steps marked N/A with reason.*

- [ ] **State Verification:** Document what data/code is actually present vs. assumed:
  - Confirm `permit_trades.is_active` + `permit_trades.phase` semantics (verified during planning — `is_active = isTradeActiveInPhase(trade, phase)`)
  - Confirm `permits.enriched_status` writers (verified: `aic-scraper-nodriver.py`, `classify-inspection-status.js`, `classify-permit-phase.js`)
  - Confirm `scripts/link-coa.js` does NOT currently bump `permits.last_seen_at` (verified: lines 143 + 232 only bump `coa_applications.last_seen_at`)
  - Identify which file holds the chain step array for run-chain.js — `scripts/manifest.json` vs an inline const in `scripts/run-chain.js`. Read the file. Note the exact insertion point for the new step in both chains.
  - Confirm the existing CQA pattern for Tier 2 assertions (`scripts/quality/assert-data-bounds.js` already exists per memory notes) — the new distribution assertion should follow the same shape.
  - Confirm Drizzle regen behavior on the two affected tables — `permits` and `coa_applications` both have entries in `src/lib/db/generated/schema.ts`.
  - Query distinct `permits.status` and `coa_applications.decision` values one more time to confirm the classifier's Set constants cover every value present in the live DB (avoids an unclassified-row surprise).

- [ ] **Contract Definition:** N/A — no API route shape changes. The `/api/leads/feed` response keeps its existing envelope; `timing_display` continues to be a string, just with better values. No client contract break.

- [ ] **Spec Update:** Update these specs AFTER the implementation is green (not before, so the spec stays in sync with the actual code):
  - `docs/specs/pipeline/41_chain_permits.md` — add `trigger_lifecycle_sync` as the new final step in the permits chain
  - `docs/specs/pipeline/42_chain_coa.md` — add `trigger_lifecycle_sync` as the new final step in the CoA chain
  - `docs/specs/01_database_schema.md` — document the 5 new columns on permits + coa_applications with the full 24-phase value domain
  - Run `npm run system-map` to regenerate `docs/specs/00_system_map.md`

- [ ] **Schema Evolution:**
  - Write `migrations/085_lifecycle_phase_columns.sql` (3 cols on permits, 2 cols on coa_applications, 4 indexes, DOWN block)
  - `npm run migrate` to apply locally
  - `npm run db:generate` to regen Drizzle schema
  - `npm run typecheck` to confirm no downstream type break
  - Factory updates in `src/tests/factories.ts` — add optional `lifecycle_phase` / `lifecycle_stalled` fields to the permit factory (defaults to null/false)

- [ ] **Guardrail Test:** Write `src/tests/lifecycle-phase.logic.test.ts` FIRST with the full table-driven coverage (26 phase cases + 8 boundary cases + 12 edge cases + 5 CoA cases + 1000-input fuzzer). Test file uses only the pure function; no DB. Targets 100% branch coverage on `lifecycle-phase.ts`. Plus `src/tests/migration-085.infra.test.ts` file-shape test asserting exact columns + indexes exist after migration.

- [ ] **Red Light:** Run `npx vitest run src/tests/lifecycle-phase.logic.test.ts` and `src/tests/migration-085.infra.test.ts`. Both must FAIL (function not implemented, migration not written). Confirms the test is actually exercising the code path.

- [ ] **Implementation:**
  1. Write `scripts/lib/lifecycle-phase.js` + `src/lib/classification/lifecycle-phase.ts` (dual code path). Include `classifyLifecyclePhase`, `classifyCoaPhase`, `normalizeCoaDecision`, and all exported constant Sets.
  2. Write `migrations/085_lifecycle_phase_columns.sql` per §2.1 of the target spec.
  3. Run `npm run migrate && npm run db:generate`.
  4. Write `scripts/classify-lifecycle-phase.js` — pipeline script wrapping the pure function.
  5. Write `scripts/trigger-lifecycle-sync.js` — detached-spawn handoff.
  6. Edit `scripts/run-chain.js` or `scripts/manifest.json` (whichever holds chain config) to add `trigger_lifecycle_sync` as the final step in both permits and coa chains.
  7. Edit `scripts/link-coa.js` to bump `permits.last_seen_at` on newly-linked permits (one-line fix, idempotency-guarded).
  8. Write `src/features/leads/lib/lifecycle-phase-display.ts` — the `LIFECYCLE_PHASE_DISPLAY` lookup + `displayLifecyclePhase()` helper.
  9. Edit `src/features/leads/lib/get-lead-feed.ts`:
     - Replace the `timing_confidence` CASE (lines ~177-181) with direct `p.lifecycle_phase` + `p.lifecycle_stalled` projection
     - Update the `mapRow` boundary to call `displayLifecyclePhase(row.lifecycle_phase, row.lifecycle_stalled)` for `timing_display`
     - Keep `timing_confidence` as a legacy field hardcoded to `'medium'` for transitional compatibility
  10. Edit `src/features/leads/types.ts` to add `lifecycle_phase: string | null` and `lifecycle_stalled: boolean` to `PermitLeadFeedItem`.
  11. Write `scripts/quality/lifecycle-phase-sql-reproducer.sql` — pure SQL CASE that reproduces every branch of §1.1–§1.5.
  12. Write `scripts/quality/assert-lifecycle-phase-distribution.js` — Tier 2 CQA assertion with the exact ±5% bands from target spec §3.3. Integrate as a sub-step after the classifier inside the same pipeline_runs entry.
  13. Write `src/tests/classify-lifecycle-phase.infra.test.ts` — idempotency, incremental re-classification, CoA re-linking trigger, PIPELINE_SUMMARY shape, trigger-lifecycle-sync timing.
  14. First backfill run: `node scripts/classify-lifecycle-phase.js` — expect ~60-120 seconds, ~269K rows classified. Capture the PIPELINE_SUMMARY output.
  15. SQL round-trip verification: run `scripts/quality/lifecycle-phase-sql-reproducer.sql` and diff against stored `lifecycle_phase` values. Expected: 0 disagreements.
  16. Manual sampling: generate `docs/reports/lifecycle-phase-sampling-YYYY-MM-DD.md` (24 phases × 10 rows = 240 samples + 20 unclassified). **Stop for human review before proceeding.**
  17. Cross-check queries from target spec §3.5: all 4 return 0.
  18. Run both chains end-to-end locally: `node scripts/run-chain.js permits` and `node scripts/run-chain.js coa`. Verify the new trigger step appears in pipeline_runs, the classifier fires as a sibling, and all downstream assertions pass.

- [ ] **UI Regression Check:** Update `src/tests/LeadFeed.ui.test.tsx` and `src/tests/PermitLeadCard.ui.test.tsx` to assert the new display labels render correctly. Specifically:
  - A card with `lifecycle_phase='P7a'` renders "Freshly issued" (not "Active build phase")
  - A card with `lifecycle_phase='P11'` renders "Framing"
  - A card with `lifecycle_stalled=true` renders the "(stalled)" suffix
  - A card with `lifecycle_phase=null` renders "Unknown" (fallback)
  - All assertions at 375px viewport (mobile)
  Run `npx vitest run src/tests/LeadFeed.ui.test.tsx src/tests/PermitLeadCard.ui.test.tsx` — all pass.

- [ ] **Pre-Review Self-Checklist:** Before Green Light, generate 5–10 self-skeptical questions from the target spec's §1 decision tree, §2 implementation, and §3 correctness gates, and walk each against the ACTUAL diff (not the intended diff). Candidate questions:
  1. Does the pure function actually cover every `permits.status` value present in the live DB? (Run the live DISTINCT query and diff against the Sets in the code.)
  2. Does `classifyCoaPhase` handle every casing variant in the `NORMALIZED_APPROVED_DECISIONS` set, or did I rely on fuzzy matching that doesn't exist?
  3. Is the incremental `WHERE last_seen_at > lifecycle_classified_at` query actually using the `idx_permits_lifecycle_classified_stale` partial index? (Check with EXPLAIN.)
  4. Does `link-coa.js` bump `permits.last_seen_at` for EVERY newly-linked permit, including the batch UPDATE paths (lines 140 + 229)?
  5. Does the feed SQL change break any existing cursor pagination or JOIN semantics? (The change should be projection-only — no WHERE clause edits.)
  6. Does `timing_confidence` still exist in the response so existing clients don't crash? (Yes — kept as legacy field hardcoded to 'medium'.)
  7. Is the trigger step's detached spawn cleanup correct on Windows and on Linux? (Test both if possible, at minimum document the Node version assumption.)
  8. Does the distribution sanity assertion's ±5% band actually match the live distribution OR would a normal day-to-day fluctuation fail it?
  9. Does `classify-lifecycle-phase.js` correctly handle the race where `last_seen_at = classified_at` exactly (microsecond equality)?
  10. Does the SQL reproducer handle the boundary cases the JS function handles (30d, 90d, 180d, 730d)?

  Output PASS/FAIL per item in the response BEFORE running tests.

- [ ] **Green Light:**
  - `npm run test` — all 1823+ existing tests pass + the ~15 new test files pass
  - `npm run lint -- --fix` — clean
  - `npm run typecheck` — 0 errors
  - Output a visible execution summary using ✅/⬜ for every step above
  - Generate the WF6 review gate — spawn the independent review agent per CLAUDE.md protocol
  - → WF6

---

## §10 Plan Compliance Summary

Per CLAUDE.md Plan Compliance Gate. Each applicable §10 sub-item enumerated:

### ✅ DB §3 (database impact = YES)
- ✅ UP + DOWN migration in `migrations/085_lifecycle_phase_columns.sql` per §3.2
- ✅ Backfill strategy: classifier script handles initial pass (~60-120s). No destructive ALTER on 237K+ rows. New columns only. Documented in target spec §2.1.
- ✅ `src/tests/factories.ts` update planned (add optional `lifecycle_phase` + `lifecycle_stalled` fields)
- ✅ `npm run typecheck` planned after `db:generate`
- ✅ No `DROP TABLE`, `DROP COLUMN`, or `ALTER` that requires table rewrite
- ✅ `CREATE INDEX` on partial predicates only — no `CREATE INDEX` on the full 237K-row permits table that would require `CONCURRENTLY`. The partial indexes are small and safe.
- ✅ Idempotent — `ADD COLUMN IF NOT EXISTS` where needed (though Postgres doesn't support IF NOT EXISTS on ADD COLUMN before PG 9.6; using simple ADD COLUMN since the migration runs once)
- ✅ `validate-migration.js` pre-commit will run

### ⬜ API §4 (no API route changes)
- ⬜ No new API route, no shape change, no envelope change
- ⬜ The `/api/leads/feed` response envelope stays `{ data, error, meta }` with the same keys
- ⬜ `timing_confidence` stays in the response as a legacy field (hardcoded 'medium') for backward compat
- ⬜ N/A for all 8 API sub-items

### ✅ UI §1 (feed label rendering changes)
- ✅ Mobile-first: the card renders in an existing element. No layout changes. No responsive breakpoint edits.
- ✅ Touch targets ≥ 44px: no changes to tappable areas
- ✅ 375px viewport test: `src/tests/LeadFeed.ui.test.tsx` + `src/tests/PermitLeadCard.ui.test.tsx` updated per UI Regression Check step
- ✅ No API keys or secrets in `'use client'` components: N/A (no new env usage)
- ✅ User-provided input escaped: N/A (all display strings come from a const lookup, not user input)

### ✅ Shared Logic §7 (dual code path)
- ✅ `scripts/lib/lifecycle-phase.js` + `src/lib/classification/lifecycle-phase.ts` are the dual code path. Both must implement the same logic bit-for-bit.
- ✅ Update plan covers both the TS module and the JS script — they are written together in Implementation step 1.
- ✅ `npx vitest related src/lib/classification/lifecycle-phase.ts scripts/lib/lifecycle-phase.js --run` planned for cross-boundary validation.

### ✅ Pipeline §9
- ✅ New pipeline scripts (`classify-lifecycle-phase.js`, `trigger-lifecycle-sync.js`) use the Pipeline SDK (`pipeline.run`, `withTransaction`, `emitSummary`, `emitMeta`)
- ✅ Streaming not required — batch size 1000 via VALUES clauses, well under memory limits
- ✅ Idempotent: `IS DISTINCT FROM` guards on every UPDATE; second run writes zero rows (verified by §3.6 idempotency test)
- ✅ No `process.exit()`; errors bubble through `pipeline.run` wrapper
- ✅ No empty catch blocks

### ✅ Frontend Boundary Check (§10.2)
- ✅ No modifications to `scripts/lib/pipeline.js` itself (consumer only)
- ✅ API route returns stable field names (`lifecycle_phase` is a new stable field; `timing_display` continues to exist with stable semantics)
- ✅ Business logic in `src/lib/` and `scripts/lib/`, not in route handlers

### ⬜ Frontend Foundation §12 (only minor edits to src/features/leads/)
- ✅ Biome check will pass (no new features code)
- ✅ No `useEffect` for data fetching
- ✅ No `useState` for form fields
- ✅ No React Context inside `src/features/leads/`
- ✅ No new `onClick`/`onSubmit` handlers
- ✅ No centered modals

---

## §10 Compliance — final checklist format

- ✅ **DB:** UP+DOWN migration ✅ · Backfill strategy ✅ · factories.ts updated ✅ · typecheck after generate ✅ · No destructive ALTER ✅ · No CREATE INDEX on full large table ✅ · validate-migration ✅
- ⬜ **API:** N/A — no API route changes
- ✅ **UI:** Mobile-first ✅ · 44px touch targets ✅ · 375px test ✅ · No secrets ✅ · No user input escape risk ✅
- ✅ **Shared Logic:** Dual code path ✅ · Both TS+JS covered in plan ✅ · vitest related planned ✅
- ✅ **Pipeline:** Pipeline SDK ✅ · Idempotent ✅ · No process.exit ✅ · No empty catch ✅

**PLAN LOCKED. Do you authorize this WF2 Enhancement plan? (y/n)**

DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
