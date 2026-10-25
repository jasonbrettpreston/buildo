# C6-5 — `classify_lifecycle_phase` (scripts/classify-lifecycle-phase.js) conversion assessment, commit ① (V3-COA package I)

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF): zero purity findings with no ledger allowance (`Spec 132 §core.9 (R-BZ)`), every gate hard from ① (`Spec 132 §x-v3.1 (R-BA)`), the seven admission questions including EXTERNALIZED (`Spec 132 §core.8 (R-CV)`), and admin visibility (`Spec 132 §core.16 (R-DL)`).
**Archetype:** ENRICHER (census row, re-derived at PH-0 per `Spec 132 §core.4 (R-AO)`, §1.7). It streams dirty `permits` and `coa_applications` rows, classifies each with the pure functions in `scripts/lib/lifecycle-phase.js`, writes the lifecycle columns back under IS DISTINCT FROM guards, appends three history tables (`permit_phase_transitions`, `lifecycle_transitions`, `lifecycle_status_history`) and queues user notifications (`notifications`).
**Commit form: compressed (R-PACE-1)** (`Spec 132 §x-tooling.2 (R-PACE-1)`). Commit ① is this report plus the red suite. Commit ② adds the descriptor, compute, notes and the seeds migration. Commit ③ is the cutover. ENRICHER has more than two converted members (enrich_parcels, enrich_heritage, enrich_ravines, enrich_centreline, geocode_permits, compute_parcel_cost_estimates), so compressed is the default (#24).
**Frozen legacy oracle:** `src/tests/steps/classify_lifecycle_phase/fixtures/legacy-classify-lifecycle-phase.js.txt`, byte-identical to `scripts/classify-lifecycle-phase.js` (1,766 lines, sha256 `d2c074d8fd63b5c6…`), whose last change was `5ef51de7` (2026-08-12).
**Owner specs:** 84 (`84_lifecycle_phase_engine.md`, the target), 41 (`41_chain_permits.md`), 42 (`42_chain_coa.md`) and 101 (`101_notification_dispatch.md`, the enqueuer half): all four system-map Implementation cells name the script (`docs/specs/00-architecture/00_system_map.md` rows 29, 48, 49, 83).
**Target spec:** Spec 84 (`identity.spec` "84"). **Governing specs:** 122 (step library, §8.1 ladder), 124 / 124a (policy register), read through the generated handbook Spec 132.
**Chains:** `permits` position 20 of 32 (after link_coa, before assert_lifecycle_phase_distribution) and `coa` position 10 of 16 (after link_coa, before assert_lifecycle_phase_distribution) — `scripts/manifest.json` chains, measured 2026-10-23. One conversion serves both chains.
**Plan:** `.cursor/v3-c6-plan-2026-10-19.md` wave C6-5; `~/Buildo-scratch/v3coa/COA-V3-GAP.md` row 9 / package I.
**Premise correction.** The C6-5 plan row and the gap row say this step "writes users' tracked projects". **It does not**: no statement in the script touches `tracked_projects` (grep, 0 hits). That is `update_tracked_projects`, the other C6-5 step. This step's user-facing writes are the `notifications` queue rows (verified, §1.2).
**Provenance.** Everything below was read from the tree at `9fd4ca4f` by this lane unless marked *documented* (copied from a cited source, not re-measured) or *inferred*. This lane had **no database access**; every live-table number is a capture need (§9).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **Advisory lock 84 first** (`:488`, `:499`), then `getDbTimestamp` RUN_AT (`:507`), then a **grace read of `pipeline_runs`** on the wall clock (`:525-533`), then `loadMarketplaceConfigs` and a zod check of six variables inside the lock (`:541-561`). An invalid set throws before any write (pinned L1).
- **Pre-write guards, all throws** (`:571-627`): the four mig-146 columns on `coa_applications`, a non-empty `universal_stream_catalog`, at least one `coa.status` catalog row (pinned L2). Import-time throws on an empty dead-status array (`:475-480`).
- **Lookups on the pool:** the BLD/CMB prefix map (`:670-685`) and the inspection rollup (`:698-727`).
- **Permit phase, streamed** (`:984-1068`): dirty = `lifecycle_classified_at IS NULL OR last_seen_at > lifecycle_classified_at OR matched_rule IS NULL` (`:1005-1007`). Each row is classified in JS (`classifyLifecyclePhase`, orphan via `computeIsOrphan`). **Each batch of 9,362 is ONE transaction** (`:840-958`) of four statements: (a) the guarded `UPDATE permits` (`:309-340`, `phase_started_at` stamped only on a phase change); (b) `INSERT INTO permit_phase_transitions … VALUES` for real phase changes, no ON CONFLICT (`:874-879`); (c) `INSERT INTO lifecycle_status_history` inside `SAVEPOINT ledger_write`, ON CONFLICT natural key DO NOTHING, rows only where matched_status changed (`:887-941`); (d) the `lifecycle_classified_at` stamp for still-dirty rows (`:948-957`) (pinned L4).
- **After each batch COMMIT**, on the pool and outside any transaction: the saved-lead read of `lead_views` and an `INSERT INTO notifications` for phase changes and newly-stalled permits (`:960-971`, `:103-202`); every failure is swallowed (pinned L9, L10).
- **CoA phase, streamed** (`:1235-1349`): the same dirty predicate on `coa_applications` (`:1272-1274`). **Each batch of 5,000 is ONE transaction** (`:1131-1231`): the 11-column guarded UPDATE (`:346-390`), `INSERT INTO lifecycle_transitions … ON CONFLICT (lead_id, transitioned_at) DO NOTHING` on a phase or seq change (`:394-413`), the SAVEPOINT ledger INSERT (`:1163-1218`), the stamp (`:1223-1230`). No CoA notification (pinned L7).
- **Backfills, every run:** the `phase_started_at` UPDATE, unscoped, autocommit on the pool (`:1370-1395`); the initial-transition `INSERT … SELECT … NOT EXISTS`, one transaction (`:1425-1443`) (pinned L8).
- **Measurement reads** (`:1454-1515`): permit and CoA phase distributions, the stalled count, two unclassified counts.
- **START_DATE_URGENT, every run** (`:1641-1646`, `:214-256`): a wall-clock window `NOW() + 6..7 days` over `trade_forecasts` joined to saved `lead_views`, then an `INSERT INTO notifications`; failures swallowed (pinned L11).
- **Post-write throw:** unclassified > 100 throws AFTER emitSummary and emitMeta, with every batch committed (`:1752-1758`, pinned L14).

### 1.2 Columns and rows written
- **`permits`:** `lifecycle_phase`, `lifecycle_stalled`, `matched_status`, `matched_rule`, `unmapped_status`, `lifecycle_classified_at`, `phase_started_at`.
- **`coa_applications`:** `lifecycle_phase`, `lifecycle_stalled`, `lifecycle_seq`, `lifecycle_group`, `lifecycle_block`, `lifecycle_stage`, `bid_value`, `matched_status`, `matched_rule`, `unmapped_status`, `unmapped_decision`, `lifecycle_classified_at`.
- **Append-only history:** `permit_phase_transitions` (two writers in this step: per-batch and the initial backfill), `lifecycle_transitions`, `lifecycle_status_history` (detected_by `classify-lifecycle-phase.js`, event_date omitted per the mig-161 CHECK).
- **User-visible queue:** `notifications` (types LIFECYCLE_PHASE_CHANGED, LIFECYCLE_STALLED, START_DATE_URGENT). Every queue row is listed in the in-app inbox: `src/app/api/notifications/route.ts:35-51` filters only on `user_id` and optional `is_read`. The once-per-(user, lead, type, Toronto day) ledger `notification_dispatches` (mig 218) dedups **pushes** only (dispatcher `NOT EXISTS`, `scripts/dispatch-notifications.js:300-310`). The dispatcher kill switch `notifications_dispatch_enabled` is seeded 0 (`migrations/218_notification_dispatch_ledger.sql:72`); its live value is unmeasured (M6).

### 1.3 Audit rows, verdict and `records_meta`
- **One audit table "Classify Lifecycle Phase", phase 21 in both chains, 18 rows** in the order pinned by L12 (`:1531-1617`). Bands are literals (`:1529`, `:1590`, `:1596`, `:1602`, `:1608`, `:1615`). The verdict is derived in the step from the row statuses (`:1650-1652`).
- **Summary:** `records_total` = dirty permits, `records_updated` = permit UPDATE rows, `records_new` = 0 (`:1654-1658`); CoA, history and queue writes are not counted (pinned L15).
- **`records_meta`:** 15 keys plus the audit table, including the `permit_classifier_extended: 'true'` sentinel the grace read counts (`:1676`).
- **emitMeta** (`:1693-1750`): reads six tables, writes six (pinned L16; gaps in CLP-D10).
- **Exit lanes:** a contended lock returns with `emitMeta({}, {})` (`:1762-1765`, pinned L17); a config or guard failure throws inside the lock; unclassified > 100 throws after the writes (L14).

### 1.4 Live table facts — NOT MEASURED by this lane (no DB access)
- *Documented (script header `:16-17`):* about 237K permits and 33K CoAs on a first run; incremental runs process 5K-15K rows in 2-5 s.
- *Documented (`migrations/227_rls_class_b_default_deny.sql` :45, :59, :60, :71, :75; `migrations/230_rls_class_a_entitlements.sql:54`):* RLS is enabled on all six written tables; `notifications` has select/update policies for users only.
- Everything else (dirty counts, saved-lead counts, queue duplicates, grace state, run durations) is a capture need (§9, M1–M7).

### 1.5 Consumers (code, read at `9fd4ca4f`)
- **`permits.lifecycle_phase` / `lifecycle_stalled` / `phase_started_at`:** assert_lifecycle_phase_distribution (next in both chains; package F), compute_trade_forecasts (permits 25), update_tracked_projects (27), link_coa's bump filter (`scripts/link-coa.js:449`, `SKIP_PHASES_SQL`), refresh_snapshot, assert_data_bounds, assert_engine_health, and the app (`scripts/steps/_schema/consumer-registry.json`, producer `classify_lifecycle_phase`: lead feed, flight board, lead detail/inspect, search, watchlist, sync).
- **`coa_applications.lifecycle_*`:** assert_lifecycle_phase_distribution, refresh_snapshot, the app.
- **`permit_phase_transitions` / `lifecycle_transitions`:** compute_phase_calibration (permits 24, coa 15; package G), which aggregates them into `phase_stay_calibration`.
- **`lifecycle_status_history`:** shared with the coa and permits INGESTORs (three writers, one natural key `uniq_lifecycle_status_history_natural_key`).
- **`notifications`:** dispatch_notifications (permits 29, EFFECTOR R-EI) and the in-app inbox (`src/app/api/notifications/route.ts`, listed in the consumer registry).

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:80`), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:699`).
- **Gaps (CLP-D13):** no `PIPELINE_TABLE_MAP` entry (`funnel.ts:872`); the summary says "Runs as the final step of permits + coa chains", false since assert_lifecycle_phase_distribution follows it in both; manifest `telemetry_tables` lists only `permits` and `coa_applications` (`scripts/manifest.json`). Under R-DV the descriptor-derived arms wait for ②; D8 flips at ③.

### 1.7 Archetype re-derivation (R-AO)
The census row (ENRICHER, operator y 2026-10-17, re-derived 2026-10-19) holds: the step derives columns on rows two roots own, in scoped passes. The runner precedent is **classify_coa_scope** (ENRICHER, `post_commit` phase, `ctx.stream` + `ctx.flushBatch`, R-FF watermark pin on `coa_applications.last_seen_at`; `scripts/classify-coa-scope.descriptor.json`, `scripts/lib/compute/classify-coa-scope.js:84-131`). The append writes are the only part with no precedent on an ENRICHER (§14, card CLP-Q1).

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L19 (§10). Each one executes the frozen text. Defects are pinned in their **legacy** form, so ② changes them knowingly and the differential names them.

## 3. Registry target review
- **(a) Files:** `scripts/classify-lifecycle-phase.js` becomes the frozen shell. Added at ②: `scripts/classify-lifecycle-phase.descriptor.json`, `scripts/classify-lifecycle-phase.notes.json`, `scripts/lib/compute/classify-lifecycle-phase.js`, and the seeds migration for the `classify_lifecycle_phase_*` variables.
- **(b) Tables:** reads permits, coa_applications, permit_inspections, universal_stream_catalog, lead_views, trade_forecasts, pipeline_runs (the grace read); writes the six tables of §1.2.
- **(c) Consumers:** §1.5.
- **(d) Tests:** `src/tests/steps/classify_lifecycle_phase/violations.test.ts` (this commit). Existing tests that name the script, swept at ②: `src/tests/classify-lifecycle-phase.infra.test.ts`, `src/tests/classify-lifecycle-phase.lifecycle-status-history.infra.test.ts`, `src/tests/chain.logic.test.ts`, `src/tests/pipeline-advisory-lock.infra.test.ts`, `src/tests/pipeline-logic-vars-coercion.infra.test.ts`, `src/tests/bmeta-emitmeta-writes.infra.test.ts`, `src/tests/push-dispatch.logic.test.ts`, `src/tests/phase-progression.logic.test.ts`, `src/tests/db/lifecycle-status-history-writers.db.test.ts`, `src/tests/db/migration-161-classifier-event-date-check.db.test.ts`, and the migration-126/127 infra tests.

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -S` over `scripts/classify-lifecycle-phase.js`, run 2026-10-23).

| Intent | Source | Disposition at ② |
|---|---|---|
| One run at a time; lock 84 = spec number (was 85, collided with compute_trade_forecasts) | `:482-488` (`c9d95842`) | encoded-as-descriptor-field (`identity.lock` 84, unique — measured in the manifest) |
| Re-classify only what a root touched (incremental dirty set) plus the matched_rule backfill predicate | `:1005-1007`, `:1272-1274` (`b0962f70`) | encoded-as-descriptor-field (the R-FF watermark pin: `lifecycle_classified_at` `source:"run_at"`, `staleness.pins` on the roots' seen stamps) |
| Per-batch transactions so row locks release between batches (adversarial C2) and phase + stamp commit atomically | `:787-801`, `:840-958` | preserved-in-compute (the per-batch write unit; needs CLP-Q1; why in notes.json) |
| IS DISTINCT FROM guards; phase_started_at stamped only on a phase change | `:309-340` (`18ea436c`, `a329d64b`) | encoded-as-descriptor-field (`guard_columns`; phase_started_at a `run_at` column written on change) |
| Suppress tautological time-bucket transitions (P7a/b/c, O2/O3) | `:740-752`, `:813-820` (`a329d64b`) | preserved-in-compute (pure transition filter; why in notes.json) |
| Status ledger rows only on a status change; ledger failure must not lose the primary (SAVEPOINT) | `:883-941`, `:1159-1218` (`dbb5f8f1`) | encoded-as-descriptor-field (derived target + `on_error: warn_row`, the R-DM form; needs CLP-Q1) |
| Classifier-derived ledger rows carry no event_date (mig-161 CHECK) | `:893-900` (`96201f16`) | encoded-as-descriptor-field (event_date not a written column; the CHECK is the lock) |
| BLD/CMB and CoA-linked permits are never orphans | `:1011-1017` (`e56b8a63`) | preserved-in-compute (the shared pure `computeIsOrphan`; why in notes.json) |
| Enqueue, never send: the dispatcher owns delivery gates and the once-per-day ledger | `:46-67` (`3d939e80`) | encoded-as-descriptor-field (an append target on `notifications`; no outside call, so not an EFFECTOR) |
| One alert per saved user per lead (DISTINCT ON over lead_views fan-out) | `:112-125` (`a29dcd09`) | preserved-in-compute (the set-based enqueue statement keeps the DISTINCT ON; why in notes.json) |
| "A notification failure MUST NOT abort the classification run" | `:65-66`, `:960-971` (`3d939e80`) | encoded-as-descriptor-field (warn_row + a declared WARN check bounded at zero instead of a swallow; CLP-D4) |
| START_DATE_URGENT for saved leads predicted to start in 6-7 days | `:204-256` (`3d939e80`) | encoded-as-deviation pending CLP-Q2 (once per horizon on the run clock) |
| First-deploy grace softens the permit unmapped WARN for 7 days | `:509-533` (`b0962f70`) | knowingly-retired under R-HR if M1 shows the window expired and the grep finds no other reader (CLP-D7) |
| Fail fast when mig 146 is missing or the catalog is empty / has no coa.status rows | `:571-627` (`18ea436c`) | encoded-as-descriptor-field (`guards.requires` column probe; blocking `when:"pre"` checks) |
| Unclassified > 100 fails the run | `:1752-1758` (`6f450129`) | encoded-as-descriptor-field (a blocking check `limit_from_config`; CLP-D8) |
| Baseline transition row per classified permit; phase_started_at proxies | `:1356-1443` (`a329d64b`) | knowingly-retired under R-HR if M2 measures zero eligible rows, else preserved-in-compute as scoped passes (CLP-D14; why in notes.json) |
| One lead-id deriver (LPAD width) | `:41-43`, `:914` (`5ef51de7`) | preserved-in-compute (the shared `deriveLeadId`; why in notes.json) |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| clock seam | `getDbTimestamp` RUN_AT | `:507` | runner run clock |
| clock seam | SQL `NOW()` in the grace read and the urgent window | `:526`, `:226-227` | `ctx.clock` / run clock (Spec 132 §core.9), or retired with the statement |
| clock seam | `Date.now()` for the urgent body | `:236` | `ctx.clock` |
| config (db seam) | `loadMarketplaceConfigs` + zod, inside the lock | `:541-561` | declared `config.logic_variables` (required) |
| db seam | advisory lock 84 | `:499` | `identity.lock` 84 |
| db seam | per-batch `withTransaction` (permits, CoAs), the initial-backfill transaction | `:840`, `:1131`, `:1425` | runner per-batch transaction (CLP-Q1) |
| db seam | the guarded UPDATEs, history INSERTs, SAVEPOINTs, stamps | §1.1 | runner write seam; compute authors statements only |
| db seam | two `streamQuery` dirty streams | `:984`, `:1235` | `ctx.stream` (post_commit pass) |
| db seam | lookups (catalog, prefix map, rollup), the mig-146 probe, the grace read, 5 measurement reads | `:525-727`, `:1454-1515` | `ctx.stream` lookups, `guards.requires`, declared `checks[].reads` |
| db seam | the saved-lead reads and the queue INSERTs on the pool after COMMIT | `:103-256`, `:960-971` | one set-based INSERT … SELECT inside the batch transaction (CLP-Q1) |
| argv/env seam | none (pinned L18) | — | `override.dry_run: "none"` (agrees with the manifest) |
| network seam | none (queue rows only; the dispatcher sends) | — | none |

### 5.1 Risk class
| Risk | Chance | Impact | Mitigation |
|---|---|---|---|
| A capture, rerun or bracket run appends real history rows and queues real inbox rows | certain (the harness runs the step against the DB and commits) | high: compute_phase_calibration reads the history; users read the inbox | cohort brackets with restore by natural key (CLP-Q4); cohorts with no saved lead except the one notification-evidence cohort; kill switch confirmed OFF (M6) before any capture |
| START_DATE_URGENT repeats every run and in both chains | certain (pinned L11; mig 218's own comment records it) | medium: duplicate in-app inbox rows | CLP-Q2; measure duplicates first (M4) |
| An alert lost between COMMIT and enqueue | rare (needs a crash in that gap) | medium: a missed user alert, never retried | the queue row rides the batch transaction (CLP-Q1) |
| Swap order: the step's measured upstreams include four unregistered permits-chain steps, and link_coa ② will create a mutual edge | certain under #44 (e) + #54 strict | high: F, G and H cannot swap until this step swaps | co-swap with link_coa in one commit; see CLP-Q3 |
| A runner change for the per-batch unit moves every enrich-step capture fingerprint | certain for a library edit | medium: one recapture night for the post_commit ENRICHERs | bundle with Q-H4 and CPC-Q1 on one RE-FREEZE night |

## 6. PH-6 — Classification and defect ledger (rows CLP-D1…CLP-D15 in `docs/reports/defect-ledger.md`; prefix CLP, the default initials, unique across every manifest slug — measured)

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because `docs/reports/generated/122-churn-complexity.md` covers only the sources chain; no hand-plotted quadrant is substituted.

The rows are defined once, in `docs/reports/defect-ledger.md`; this is the assessment-side summary.
- **CLP-D1** (`:265-274`, `:556-561`): six variables outside `<slug>_<name>`; `coa_stall_threshold` is shared with update_tracked_projects — ② rename the five, share the sixth.
- **CLP-D2** (`:226-227`, `:289`, `:297`, `:526`, `:1529`, `:1590-1615`): verdict bands, windows and batch sizes are code literals — ② variables.
- **CLP-D3** (`:73-91`, `:960-971`): alerts queued after COMMIT, outside the transaction — at-most-once (inferred) — CLP-Q1.
- **CLP-D4** (`:129-136`, `:176-183`, `:231-234`, `:967-971`, `:1642-1646`): every notification failure is swallowed (PURITY-G13) — ② warn_row + WARN check.
- **CLP-D5** (`:214-256`, `:1641-1646`): START_DATE_URGENT every run, both chains, no idempotency key, every row in the inbox; reads forecasts written later in the chain — CLP-Q2.
- **CLP-D6** (`:226-227`, `:236-240`, `:526`): wall and process clocks — ② runner clock.
- **CLP-D7** (`:525-533`, `:1527-1529`, `:1566-1571`, `:1676`): the grace window reads `pipeline_runs` (PURITY-G1) and is always off in steady state — ② R-HR retire after M1.
- **CLP-D8** (`:1516`, `:1752-1758`): the unclassified FAIL throws after the writes; the message says "permits" for a two-table sum — ② a blocking check.
- **CLP-D9** (`:1654-1658`): records_* count permits only — ② runner counters.
- **CLP-D10** (`:1693-1750`): declared reads omit `pipeline_runs` and nine permit columns, declare a nonexistent `coa_applications.permit_type`, and carry `linked_permit_num`, which `classifyCoaPhase` never reads; telemetry covers 2 of 6 tables — ② `inputs.reads` traced by #44.
- **CLP-D11** (`:840-958`, `:1131-1231`; `scripts/lib/step/index.js:5359`, `:5578-5590`): no existing enrich arm reproduces the four-statement per-batch transaction — CLP-Q1.
- **CLP-D12** (`:394-413`, `:874-879`, `:901-925`, `:1175-1202`, `:1426-1441`): insert-only append targets are banned-for-new (`no_retraction`); two of the four tables have no natural-key index — CLP-Q1 + grandfathered entries.
- **CLP-D13** (`funnel.ts:699`, `:872`; `:10-12`): stale admin summary, missing table map, header names a nonexistent trigger script — ③ derived.
- **CLP-D14** (`:1366-1395`): the "one-time" phase_started_at backfill runs every run, unscoped, autocommit — ② scoped pass or R-HR retire after M2.
- **CLP-D15** (`:813-820`, `:966-968`): a first classification triggers a PHASE_CHANGED alert (inferred impact) — ② by ruling.

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition (names drafted, seeded at ②) |
|---|---|---|
| `coa_stall_threshold`, `lifecycle_issued_stall_days`, `lifecycle_inspection_stall_days`, `lifecycle_p7a_max_days`, `lifecycle_p7b_max_days`, `lifecycle_orphan_stall_days` | `:265-274` | renamed `classify_lifecycle_phase_*` by migration, values carried; `coa_stall_threshold` stays via `SHARED_LOGIC_VARIABLES` (update_tracked_projects reads it) |
| unclassified ceiling 100 | `:1615`, `:1621`, `:1754` | `classify_lifecycle_phase_unclassified_max` |
| bands 1 / 3 (permit unmapped, CoA unmapped status, catalog missing) and 3 / 5 (unmapped decision) | `:1529`, `:1590`, `:1596`, `:1602` | `classify_lifecycle_phase_*_pass_max` / `_warn_max` (`limit_from_config` + `warn_limit_from_config`) |
| grace 7 days | `:526` | retired with the grace read (CLP-D7), else `classify_lifecycle_phase_grace_days` |
| urgent window 6 / 7 days | `:226-227` | `classify_lifecycle_phase_urgent_min_days` / `_max_days`; the horizon guard reuses `notifications_max_stale_hours` (CLP-Q2) |
| batch 9,362 / 5,000; notifications batch 8,191; 65,535 | `:289`, `:297`, `:72` | `classify_lifecycle_phase_permit_batch_size` / `_coa_batch_size`; the queue INSERT becomes set-based (no batch) |
| top-20 / top-5 distributions | `:428`, `:1561` | `classify_lifecycle_phase_distribution_top_n` or a check row `detail` cap (R-EP) |
| progress log every 50 batches | `:974` | retired (runner heartbeat, `onProgress`) |
| `TIME_BUCKET_GROUPS`, `PERMIT_CODE_DRIFT_STATUSES` | `:749-752`, `:781-785` | vocabulary constants, declared in notes (Spec 44 §3) |
| 84 (lock) | `:488` | `identity.lock` |

## 8. Purity estimate (gate E codes G0–G13)
This is an estimate. The legacy file is not scanned by gate E, so each code is mapped from the inventory above.

| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | the grace read of `pipeline_runs` `:525-533` | retired (CLP-D7) |
| G2 undeclared relation | `pipeline_runs`; nine permit columns (CLP-D10) | declared reads |
| G4 DDL/txn | `withTransaction` ×3 sites, SAVEPOINT ×2 sites, advisory lock `:499` | runner (CLP-Q1) |
| G5 direct write | 5 UPDATE and 6 INSERT statement sites (§1.1) | runner write seam |
| G6 clock | `Date.now()` `:236`; SQL `NOW()` `:226-227`, `:526` | runner clock |
| G7 compute decides | `computeWarnableAuditStatus` bands, `unclassifiedCount <= 100`, the derived verdict `:1650-1652` | declared checks |
| G9 module const | `ADVISORY_LOCK_ID`, `PERMIT_BATCH_SIZE`, `COA_BATCH_SIZE`, `NOTIF_INSERT_*` | identity.lock; config batch |
| G13 swallow | the five notification catches, the ledger catch | warn_row SAVEPOINT (R-DM) |

**Expected after ②:** 0 findings, with no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens, forced-change proof and capture needs — NOT YET CAPTURED (no DB in this lane)
- **Read-only measurements owed before ② (M1–M7), one READ ONLY transaction, any time:**
  - M1 `prior_runs_7d` of the grace read and the run count per invocation name (CLP-D7);
  - M2 `COUNT(*)` of permits with a phase and no `phase_started_at`, and of classified permits with no transition row (CLP-D14);
  - M3 dirty counts per root under the legacy predicate, and the latest run durations of `permits:` / `coa:classify-lifecycle-phase`;
  - M4 START_DATE_URGENT duplicates: `SELECT user_id, lead_id, (created_at AT TIME ZONE 'America/Toronto')::date d, COUNT(*) FROM notifications WHERE type = 'START_DATE_URGENT' GROUP BY 1,2,3 HAVING COUNT(*) > 1` (CLP-D5);
  - M5 `COUNT(*)` of saved `lead_views` and of saved leads inside the urgent window today (what one capture run would queue);
  - M6 the live `notifications_dispatch_enabled` value (must be 0 on the capture DB);
  - M7 `relrowsecurity` on the six written tables, and `information_schema.columns` for `coa_applications.permit_type` (CLP-D10).
- **PRE captures** on the legacy code before any compute change (trap 7), under the DB lock: three invocations (`permits::`, `coa::`, `none::`). **Precondition:** M6 = 0, and the capture records `max(id)` of `notifications` and `permit_phase_transitions` before and after, so every row the capture added is named (the harness commits real writes; §5.1).
- **Nonzero POST evidence (#38):** a bracket that sets a deterministic permit cohort's `lifecycle_phase` back to a prior value and `lifecycle_classified_at` to NULL, so the step re-derives the phase and writes one transition row, one ledger row and (for the one cohort with a saved lead) one queue row per key; the restore deletes exactly those rows by natural key and verifies the primary. Today's `scripts/analysis/ingestor-forced-cohort.js` accepts one `--derived-table` and only on the INGESTOR form (R-ET), so this needs card CLP-Q4. A CoA cohort does the same for `lifecycle_transitions`.
- **Rerun-zero proof:** with CLP-Q1 and CLP-Q2 A, a second run writes zero rows to every target. Legacy fails it today on `notifications` (L11).

## 10. Red suite (PH-7) — `src/tests/steps/classify_lifecycle_phase/violations.test.ts`
- **Size:** 29 tests. L1–L19 are GREEN today (the legacy oracle). D1–D10 are `it.fails`, RED as named missing artifacts or registry states.
- **Red evidence:** `docs/reports/red-evidence/classify_lifecycle_phase/pre2-artifacts-missing.json`, a vitest JSON run with D1–D10 as plain it(); 19 pass and 10 fail.
- D1–D7 fail as an ENOENT on the named descriptor or compute file; D8 fails because PIPELINE_TABLE_MAP has no entry; D9 fails because the report did not exist at the red run (after this commit it fails on the missing generated scorecard); D10 fails because converted[] does not hold the file. No failure is a TS or import error.
- **Oracle harness:** `src/tests/steps/classify_lifecycle_phase/fixtures/legacy-harness.ts` fakes `./lib/pipeline` (including a scripted `streamQuery`), `./lib/config-loader`, the pool and `Date`; `zod`, `./lib/lifecycle-phase`, `./lib/orphan-detection`, `./lib/leads/lead-id` and `./lib/notification-types` are the real modules. Fixture outputs were checked against the real classifiers before the pins were written.

| Pins | Behaviour |
|---|---|
| L1–L3 | lock, RUN_AT, grace read and config inside the lock; the three pre-write guards; the root-keyed dirty predicates |
| L4–L8 | the permit and CoA per-batch transactions; transition rules; the SAVEPOINT ledger; the two backfills |
| L9–L11 | post-COMMIT alert enqueue; swallowed failures; START_DATE_URGENT every run (the replay double-queue) |
| L12–L19 | audit rows and bands; the grace window; the post-write throw; summary counts and batch constants; emitMeta gaps; the contended lock; no argv/env; oracle = shipped script |
| D1–D10 | descriptor and shell; per-target write discipline and RLS; replay-safe appends; the R-FF pin; EXTERNALIZED; purity; notification failures as a WARN check; admin; scorecard; registry (③) |

## 11. Registry at ① (landed in this commit) and what is owed later
- **Landed at ①:** `converted.json` `pending[]` holds `scripts/classify-lifecycle-phase.js` at stage `red_suite` (`Spec 132 §x-stages.1 (R-DU)`); the census row is `ENRICHER / pending` with owner specs 84, 41, 42 and 101 (and the two census fixtures); CLP-D1…D15 in the defect ledger; `_witness-guard.ts` ADOPTION adds `classify_lifecycle_phase: legacy_oracle_excluded` (19/7/18); the roadmap is regenerated and `conversion-roadmap.infra` re-pinned (pendingBatch 14 → 15, C6 22 → 21, measured on the base). No prefix override: CLP is unique.
- **R-DU:** with no descriptor, the row does not block whole-registry selection; the red scorecard is non-gating.
- **Owed at ②:** the descriptor, compute, notes, the seeds migration, the scorecard (D9 flips); blocked on CLP-Q1 (runner) and CLP-Q2, and the captures on CLP-Q4.
- **Owed at ③:** after the cloud halves (LDG-10, EP-PIN-D17; `Spec 132 §x-v3.1 (R-EY)` condition 8) and every upstream converted (`Spec 132 §x-stages.2 (R-EQ)`).

## 12. Operator questions (drafted rulings — not decided here; build held on the recommended reading)

**CLP-Q1. A per-batch write unit for an ENRICHER post_commit pass (NEW register row, 124a; runner change, STOP for this lane).**
- Evidence: legacy commits four statements per batch in one transaction (`:840-958`, `:1131-1231`; pinned L4, L7). The enrich arm's post_commit `flushBatch(sql, params)` runs ONE statement per BEGIN/COMMIT (`scripts/lib/step/index.js:5578-5590`); the shared-transaction passes get no `stream` (`:5359`), and the classifier cannot be expressed set-based without rewriting 18 JS rules as SQL. `ctx.exec` refuses a `WITH` statement on purpose (`:117-119`), so a one-statement CTE workaround is refused too. R-DY's derived target and R-DM's `warn_row` are INGESTOR-only (`124a:801`, `:475`).
- Why it is the replay-safe design: if the history rows and the queue rows are derived from the prior-state difference and committed in the same transaction as the UPDATE that stores the new state, a rerun sees no difference and writes nothing. That holds for every append target, with no idempotency key, no new table and no outbox. A crash rolls the whole batch back, and the rows stay dirty for the next run. Today a crash after COMMIT loses the alert (CLP-D3).
- Proposed row: "An ENRICHER post_commit pass may hand `ctx.flushBatch` an ordered list of statements `[{writesRef, sql, params}]`; the runner runs them in ONE transaction per call, in order. A statement whose target declares `on_error: "warn_row"` runs inside `SAVEPOINT sp_e<i>` with the R-DM semantics. R-DY `derive` is admitted on an ENRICHER target whose rows come from the batch's own prior state. Append targets declared this way prove `idempotent_rerun: zero_writes` by the rerun capture."
- Needs: one `flushBatch` arm (array input) in `runEnrichPhase`; the validator's R-DY/R-DM archetype guard relaxed to admit ENRICHER; a grandfathered.json `rules: ["no_retraction"]` entry per append target (registry-reserved, so orchestrator only, the link_parcel_addresses precedent). No new executor, no new table.
- Five words: standardized (one write unit; the R-DM SAVEPOINT reused), observable (per-statement counters; the warn rows are declared checks), scalable (any multi-statement ENRICHER: update_tracked_projects is next in C6-5), accurate (exactly-once per state change, where legacy is at-most-once), understandable (one array argument).
- Scope: a runner arm, so CHAT-68.scope applies. **It should ride the same RE-FREEZE night as Q-H4 (cascade arm) and CPC-Q1 (materialize replace arm)**: all three are `scripts/lib/step/index.js` edits that move capture fingerprints (#39), so one night recaptures once.
- Simpler alternative (not recommended): `flushBatch` list only, with no SAVEPOINT. Any history or queue failure then fails the batch. That breaks the recorded fence "a notification failure MUST NOT abort the classification run" (`:65-66`), so it needs its own R-HQ entry.
- **Recommend y (the full row).**

**CLP-Q2. START_DATE_URGENT once per horizon (NEW 124a row or R-HQ entry).**
- Evidence: queued on every run from `NOW() + 6..7 days` (`:214-256`, pinned L11). The step runs in both chains; `notifications` has no unique key (mig 010); the in-app inbox lists every row (`route.ts:35-51`); mig 218's own comment says START_DATE_URGENT "had no cross-run memory" and fixed only the push side. It also reads `trade_forecasts`, which compute_trade_forecasts writes later in the permits chain (25 vs 20), so the alert uses the previous run's forecasts. And it makes compute_trade_forecasts an R-EQ upstream of this step (measured, §14).
- Option A (recommended): keep it here, on the run clock, and add `AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = lv.user_id AND n.lead_id = <lead> AND n.type = 'START_DATE_URGENT' AND n.created_at > <run_at> - <notifications_max_stale_hours> hours)`. That variable already exists (mig 222: "168h is the 6-7 day URGENT enqueue horizon"; shared through `SHARED_LOGIC_VARIABLES`). The existing index `idx_notifications_user_created` serves it. No migration, no new variable. A replay and the second chain run then queue nothing.
- Option B: move the scan to a step after compute_trade_forecasts (update_tracked_projects already queues alerts with memory columns, `scripts/update-tracked-projects.js:9`, `:987-1027`). This removes the stale-forecast read and the R-EQ edge, but it targets tracked projects, not `lead_views.saved`, so who gets notified changes. That is scope expansion, best decided when update_tracked_projects is assessed.
- Option C (not recommended): keep every-run as a declared drift. It fails the C6-5 goal "a replay must not … queue alerts twice".
- Proposed row (A): "classify_lifecycle_phase queues START_DATE_URGENT for a saved (user, lead) at most once inside the `notifications_max_stale_hours` horizon, measured on the run clock; a replay or a second chain run in the horizon queues nothing (CLP-D5)."
- Five words: standardized (the dispatcher's own horizon variable), observable (an INFO `urgent_suppressed_by_horizon` row), accurate (one inbox row per window, measured by M4), scalable (one index-served clause), understandable (one clause).

**CLP-Q3. Swap order under R-EQ: a mutual edge with link_coa (scheduling; ruling only if the operator wants it handled differently).**
- Evidence: `scripts/lib/ledger.js:138-168` `stepUpstreams` ignores chain order: any step in the same chain that writes a column the reader reads is a producer. #44 (e) (`scripts/analysis/gates/witness.mjs:753`) forces `inputs.reads.steps` to equal that set.
- Measured from the committed snapshot (2026-10-23), this step's producers are:
  - permits chain: permits (red_suite), close_stale_permits, classify_permit_phase, compute_trade_forecasts and link_coa (all four unregistered);
  - coa chain: coa, link_coa_to_parcels and classify_coa_scope (runner_wired), and link_coa.
- link_coa reads `permits.lifecycle_phase` (`scripts/link-coa.js:449`), which this step writes. The edge is missing from the snapshot only because link_coa's legacy emitMeta omits that read (LCOA-D11). H's ② draft declares `inputs.reads.steps: [permits, coa]`, which #44 (e) would reject.
- #54 passes a `runner_wired` step only if each upstream is converted or itself swapped, and `stageAwaitsCaptures('compute_ported')` is true. So neither of a mutual pair can swap first. Both can swap in the same commit: each then sees the other at `runner_wired`, the `swap-order.mjs` self-test case "upstream swapped".
- Recommendation: plan link_coa and classify_lifecycle_phase as one swap commit on one night. compute_trade_forecasts would form the same kind of cycle (it reads this step's `lifecycle_phase` / `phase_started_at`) unless CLP-Q2 option B removes the edge.
- F and G swap after this step (each lists it as an upstream: measured). The long pole for F, G and I is the permits chain's unconverted producers, not H alone.

**CLP-Q4. A multi-table bracket for append targets (NEW 124a row; capture tooling, not `scripts/lib/step/**`).**
- Evidence: `scripts/analysis/ingestor-forced-cohort.js:396-426` takes one `--derived-table` with one natural key, built for the R-DY INGESTOR (R-ET). This step's perturbation adds rows to up to three tables at once (transition, ledger, queue).
- Proposed row: "R-ET's derived bracket accepts repeated `--derived-table` / `--derived-natural-key` pairs; the restore deletes exactly the gained rows of each and commits only on an exact RETURNING match per table."
- Five words: standardized (the R-ET restore, per table), observable (one RETURNING count per table), accurate (no capture leaves a history or inbox row behind), scalable (any multi-append step), understandable (a repeatable flag).
- Recommend y. It is needed before the #38 POST, not before ②.

**CLP-Q5. The first-classification alert (CLP-D15).**
- Evidence: `:813-820` counts old_phase NULL as a transition; `:966` excludes NULL `old_stalled` from the stall alert on purpose, while the phase alert has no such exclusion.
- Recommendation: mirror the stall rule (no PHASE_CHANGED alert when old_phase is NULL); the baseline transition row stays.
- This is an R-HQ entry (a legacy defect corrected inline, ratified per entry). Decide at ②, after M5 shows whether any saved lead is ever first-classified.

**Cross-lane note for H (Q-H1), no ruling.** Q-H1 A's retire condition says "until classify_lifecycle_phase ② pins a link_coa stamp". Under the R-FF form, this step pins the roots' seen stamps (`permits.last_seen_at`, `coa_applications.last_seen_at`), the classify_coa_scope precedent. link_coa's bump writes that same permits stamp, so #44 (i) must either accept two writers of one pinned stamp, or H option B adds a link-owned stamp. Decide jointly at the H/I ②. Separately, a back-ref change without a bump leaves the orphan classification stale (LCOA-D8, inferred).

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| ENRICHER descriptor + frozen shell (D1) | `Spec 132 §core.1`, §x-stages.2 | classify_coa_scope form | step-validate | this report | archetype ENRICHER | red-first D1 | precedent | — |
| six write targets + RLS (D2) | `Spec 132 §core.12 (R-CT)` | per-target | #46 | CLP-D10/D12 | fleet | measured RLS (M7) | one guard per target | — |
| replay-safe appends (D3) | CLP-Q1, CLP-Q2 | one write unit | rerun capture | CLP-D3/D5/D11 | any ENRICHER | exactly-once | one array argument | — |
| watermark pin (D4) | `Spec 132 §core.14 (R-FF)` | classify_coa_scope pin | #44 (h)/(i) | R-FF | both roots | the legacy dirty set | no new `by` | — |
| literals → variables (D5) | `Spec 132 §core.8 (R-CV)` | `<slug>_<name>` | gate E #32 | migration | — | values carried | yes | **yes** |
| compute purity (D6) | `Spec 132 §core.9 (R-BZ)` | G-codes | gate E | R-BZ | fleet | red-first | seams only | — |
| notification failures counted (D7) | R-DM form via CLP-Q1 | warn_row | WARN row | CLP-D4 | — | no silent loss | one check | — |
| admin (D8) | `Spec 132 §core.16 (R-DL)` | derived | `admin-step-registration.logic` | CLP-D13 | every step | measured gap | derived | — |

## 14. ② plan — the pure-compute boundary and the descriptor draft
The descriptor skeleton is drafted outside the repo (`~/Buildo-scratch/v3coa-i/classify-lifecycle-phase.descriptor.draft.json`). It is not committed: a committed descriptor flips D1–D4/D7 and enters every gate before the runner arm (CLP-Q1) exists.
- **Compute (pure, `scripts/lib/compute/classify-lifecycle-phase.js`):**
  - `classifyPermitRow` / `classifyCoaRow`: the legacy per-row mapping over the real `classifyLifecyclePhase`, `classifyCoaPhase`, `mapToUniversalStream` and `computeIsOrphan`, with config values from `ctx.config`;
  - `transitionFilter` (TIME_BUCKET_GROUPS) and `ledgerFilter` (the zero-delta rule), as pure functions;
  - the statement builders: the guarded UPDATEs, the stamps, and the diff-derived INSERT … SELECT for each history table and for the alerts (the saved-lead join moves into the INSERT, so compute does no read);
  - the two passes, driven only through `ctx.stream` and the CLP-Q1 `ctx.flushBatch([...])`;
  - the check values through `ctx.report`.
  - No clock, no `.query(`, no env, no catch.
- **Runner (CLP-Q1):** `runEnrichPhase` post_commit phases, one per root, plus the urgent pass. Each batch is one transaction through the array `flushBatch`; the warn_row statements sit under SAVEPOINTs.
- **Descriptor:**
  - `identity {name: classify_lifecycle_phase, archetype: ENRICHER, lock: 84, spec: "84"}`;
  - six `outputs.writes[]` targets (two `set_based_join_update` with IS DISTINCT FROM guards; four derived append targets, each `idempotent_rerun: "zero_writes"`);
  - `lifecycle_classified_at` and `phase_started_at` as `source:"run_at"` columns;
  - the R-FF invalidators and `staleness.pins` on the two roots;
  - `guards.requires`: `rls_bypass_or_policy` on all six tables plus the mig-146 column probe;
  - `override.dry_run: "none"`, which agrees with the manifest.
- **Order:**
  1. M1–M7, read-only;
  2. PRE captures on the legacy shell (three invocations; kill switch confirmed OFF; queue and history `max(id)` recorded);
  3. the CLP-Q1 runner arm on the bundled RE-FREEZE night with Q-H4 and CPC-Q1;
  4. ② at `compute_ported` (legacy shell live);
  5. the CLP-Q4 tool;
  6. the swap night with link_coa in one commit, after every other upstream is converted or swapped (`Spec 132 §x-stages.2 (R-EQ)`);
  7. then F's and G's swaps.

## R. Reflection (G9)
### LOW-CONFIDENCE
- **At-most-once alerts (CLP-D3)** are inferred from the statement order; no crash in the gap has been observed.
- **Inbox duplicates (CLP-D5)** follow from the code and mig 218's comment; their live count is M4.
- **The upstream set (CLP-Q3)** was derived from the committed ledger snapshot (declared legacy reads), not from a traced run; ② re-derives it from the descriptor's reads.
### RECURRING / STANDARD-SHAPING
- An ENRICHER whose output includes append-only history of its own state changes (this step; update_tracked_projects next) needs the derived-row form outside the INGESTOR. CLP-Q1 answers it once for the archetype.
- A step that queues user-visible rows is not an EFFECTOR (the queue is a table; the dispatcher is the EFFECTOR, R-EI), but its captures still write user-visible rows. The capture tooling must clean up every append target, which is CLP-Q4.
- `stepUpstreams` ignores chain order, so a read of a column written later in the chain (link_coa → lifecycle_phase, this step → trade_forecasts) creates an R-EQ edge, and mutual edges need a joint swap commit.

## A. Measurement log (2026-10-23)
- **A.F-CODE:**
  - `scripts/classify-lifecycle-phase.js` @ `5ef51de7`, sha256 `d2c074d8fd63b5c6…`, 1,766 lines;
  - `scripts/lib/lifecycle-phase.js:708` (`classifyCoaPhase`, no `linked_permit_num` read);
  - `scripts/lib/step/index.js:108-148`, `:5205-5277`, `:5359`, `:5578-5612`;
  - `scripts/lib/ledger.js:138-168`, `:290-335`; `scripts/analysis/gates/witness.mjs:753-779`; `scripts/analysis/gates/swap-order.mjs:8-78`;
  - `scripts/analysis/step-validate.mjs:3259` (`stageAwaitsCaptures`: compute_ported true, runner_wired false);
  - `scripts/analysis/ingestor-forced-cohort.js:396-426`; `scripts/link-coa.js:449`;
  - `migrations/010`, `086:38-82`, `146:73`, `218`, `222`, `227`, `230`;
  - `src/app/api/notifications/route.ts:35-51`; `src/lib/admin/funnel.ts:699`, `:872`; `src/components/FreshnessTimeline.tsx:80`; `scripts/manifest.json` chains;
  - `scripts/steps/_schema/grandfathered.json` (`link_parcel_addresses`, `enrich_parcels` `rules: ["no_retraction"]`);
  - `git log -S` intents (§4).
- **A.F-DB:** none (no DB access in this lane; §9 M1–M7).
- **A.F-ORACLE:** `npx vitest run src/tests/steps/classify_lifecycle_phase/violations.test.ts`: 29 / 29. The red-evidence run gave 19 pass / 10 fail.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=classify_lifecycle_phase --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 14/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: YES (G8, Rule 1 (unpinned enforced-red), Rule 5 (unpinned enforced-red), Rule 6 (unpinned enforced-red), Rule 7 (unpinned enforced-red), Rule 8 (unpinned enforced-red), Rule 9 (unpinned enforced-red), Rule 13 (unpinned enforced-red))**

### Five-word verdict (Spec 124 §5 R-BA — "McDonald's Airtight")

| Word | Status | Detail |
|---|---|---|
| STANDARDIZED | PASS | PASS |
| OBSERVABLE | PASS | PASS |
| SCALABLE | PASS | PASS |
| UNDERSTANDABLE | PASS | PASS |
| ACCURATE | PASS | PASS |

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=17 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=17 vocab-hit rows=17; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 15 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=31 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=3 missing-pre-invocations=3 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=31 |
| G-shape | PASS | — | file-clean=null compute-clean=null |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 8 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 8 eligible pending slug(s), all either compressed or carry a stated full-form reason |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 29 converted slug(s) — 29 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 74 declared counter source(s) across 25 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 11 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 0 bound(s) checked, all closed (0 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 0 on_invalid(s) checked, all closed (0 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 0 emits drift(s) checked, all closed (0 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 0 contract(s) checked, all closed (0 ledger-allowed, 0 present+typed/excluded); 42 unproduced src read(s) (hard until the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)) [unproduced:src/app/api/admin/builders/route.ts:entities.google_place_id; unproduced:src/app/api/admin/stats/route.ts:notifications.is_sent; unproduced:src/app/api/admin/stats/route.ts:permits.first_seen_at; unproduced:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; unproduced:src/app/api/leads/flight-board/route.ts:permits.updated_at; unproduced:src/app/api/notifications/route.ts:notifications.id; unproduced:src/app/api/notifications/route.ts:notifications.is_read; unproduced:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.id; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; unproduced:src/features/leads/lib/get-lead-feed.ts:permits.location; unproduced:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; unproduced:src/lib/analytics/queries.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.first_seen_at; unproduced:src/lib/builders/enrichment.ts:entities.google_place_id; unproduced:src/lib/builders/enrichment.ts:entities.google_rating; unproduced:src/lib/builders/enrichment.ts:entities.google_review_count; unproduced:src/lib/builders/enrichment.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.linkedin_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_validated_at; unproduced:src/lib/builders/enrichment.ts:entities.trade_name; unproduced:src/lib/leads/lead-detail-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; unproduced:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; unproduced:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; unproduced:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; unproduced:src/lib/leads/lead-inspect-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; unproduced:src/lib/quality/metrics.ts:entities.google_place_id; unproduced:src/lib/quality/metrics.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.bid_value; unproduced:src/lib/sync/process.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.lead_id; unproduced:src/lib/sync/process.ts:permits.lifecycle_block; unproduced:src/lib/sync/process.ts:permits.lifecycle_group; unproduced:src/lib/sync/process.ts:permits.lifecycle_seq; unproduced:src/lib/sync/process.ts:permits.lifecycle_stage; unproduced:src/lib/sync/process.ts:permits.location; unproduced:src/lib/sync/process.ts:permits.photo_url; unproduced:src/lib/sync/process.ts:permits.trade_classified_at; unproduced:src/lib/sync/process.ts:permits.updated_at]; UNPRODUCED-UNWITNESSED: 42 (report-only until the table's inserter and its last unconverted writer convert, R-EE) [UNPRODUCED-UNWITNESSED:src/app/api/admin/builders/route.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:notifications.is_sent; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.id; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.is_read; UNPRODUCED-UNWITNESSED:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.id; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/analytics/queries.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_rating; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_review_count; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.linkedin_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_validated_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.trade_name; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.bid_value; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lead_id; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_block; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_group; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_stage; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.photo_url; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.trade_classified_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.updated_at]; LDG-10 step readers: 0 hard, 25 UNPRODUCED-UNWITNESSED (unconverted inserter) [UNPRODUCED-UNWITNESSED:step:assert_lifecycle_phase_distribution:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:classify_coa_scope:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.permit_type; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.id; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:compute_cost_estimates:permit_trades.trade_slug; UNPRODUCED-UNWITNESSED:step:compute_opportunity_scores:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:lifecycle_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:permit_phase_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_trade_forecasts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_named_builders:entities.id; UNPRODUCED-UNWITNESSED:step:enrich_wsib_builders:entities.id; UNPRODUCED-UNWITNESSED:step:link_coa:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:permits.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:tracked_projects.id]; 6 unconverted-producer read(s) listed (O3, red once the producer converts) [unconverted_producer:scripts/analysis/gates/captures.mjs:value; unconverted_producer:scripts/analysis/gates/witness.mjs:x; unconverted_producer:scripts/classify-lifecycle-phase.js:permit_classifier_extended; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations_truncated_count; unconverted_producer:scripts/quality/assert-network-health.js:scraper_telemetry] |
| 37 | (registry) | PASS | LF-ONLY (gate F): 0 path(s) checked, all LF (0 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 2 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 35 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 620 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 46 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 20.41 s <= 25.3 s; registry-input 25.91 s <= 27.5 s; measured 2026-10-21T21:10:54.484Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 538 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 170 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 46 converted/pending step(s) admin-verifiable (7 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 202 take effect at cutover, 19 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): permits::, coa::, none::
- missing invocations (PRE, GOLD-PRE): permits::, coa::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- 3330/3330 passed (suite success=true)
- harvested: 130 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 1 — **/*.db.test.ts
- skipped (declared but not run): 0
- failing: none

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 6 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-red |  |
| 6 | Omission fails (20 categories) | enforced-red |  |
| 7 | Archetype gates categories | enforced-red |  |
| 8 | Per-target write discipline | enforced-red |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-red |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no descriptor — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): no descriptor · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-red | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=0B notes=0B checks=0 rows records_meta=(no capture) |

**Enforced-green: 5/14** · not-run: 0 · vacuous: 1

