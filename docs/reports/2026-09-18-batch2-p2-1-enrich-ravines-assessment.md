# Batch 2 row 2.1 — `enrich_ravines` conversion assessment

**Commit form: compressed (R-PACE-1)**

Ruling A1(b), operator, 2026-09-18: R-AH makes COMPRESSED the default here — `template-freeze.json`'s
ENRICHER profile reads `proven: true` and `converted.json` already carries two ENRICHER members
(`scripts/enrich-parcels.js`, `scripts/geocode-permits.js`), so `checkCompressedFormDefault`'s
eligibility test (`archetypeConvertedCount >= 2`) is satisfied. Row 2.1's original nine-commit plan
text (2026-09-15) predates I5 (`geocode_permits`, landed `7853342f`, 2026-09-16) and is stale.

**Compressed mapping** (Spec 124 R-AH, restructuring the plan's nine-commit breakdown per the
`link_neighbourhoods` / `assert_parcel_sanity` precedent):

| Plan's 9-commit label | Compressed landing |
|---|---|
| ① PH-0 boundary freeze, ② PH-3 intent ledger, ③ PH-5 seam map, ④ PH-6 classification, ⑥ PH-7 test design | **commit 1** — this report (all PH-0..PH-7 sections folded in) + descriptor + seeds (+7 vars) + census/converted.json pending entries + defect-ledger/review_followups entries + the red suite |
| ⑤ Golden master PRE | **commit 2a** — golden PRE captures (legacy step, committed + clean before 2b, fast invariant #22 GOLD-PRE-FRESH) |
| ⑦ Descriptor + compute + runner, ⑧ Peel, ⑨ Differential + CUTOVER | **commit 2b** (compute + shell + runner + POST differential) **and commit 3, prepared but UNCOMMITTED** (converted.json append/pending-delete, census status flip, fleet pin repins, generators, spec diffs — left for the OUTPUT panel per this WF's own instruction) |

---

## PH-0 — Boundary freeze

**Target files** (Spec 43 `### Target Files`, position 12 of 28 in `sources`, re-derived from
`manifest.json:20`, never transcribed): `scripts/enrich-ravines.js`. **Owner spec:**
`docs/specs/01-pipeline/59_source_ravine_protection.md` §8d/§9/§11.1 (v1.2). **Archetype
re-derived from the code, not assumed** (R-AO): one `pipeline.run` shape, one `withAdvisoryLock`,
one `withTransaction` on the write path, ONE set-based write target, a producer-consumer contract
read from another step's `pipeline_runs` row, a two-layer incremental/full split with no `--full`
argv — this is ENRICHER (Spec 122 §1.10's own profile table), confirmed against the schema's
`x-profile` ENRICHER `allOf` (`execution.phases[]`, `heartbeat_minutes_from_config`,
`lock_timeout_ms_from_config` all required).

**Live database state, measured 2026-09-18** (all queries run against local Supabase
127.0.0.1:54322, migrations 244):

| Metric | Value | Query |
|---|---|---|
| Total parcels | 486,530 | `SELECT COUNT(*) FROM parcels` |
| Geom-bearing parcels | 486,530 (100%) | `WHERE geom IS NOT NULL` |
| Distinct non-null `ravine_dataset_version_when_enriched` | 1 (`97b4ac7fb3f9808726a106a4b67083ac`) | `SELECT COUNT(DISTINCT ...)` |
| `ravine_distance_m` coverage | 486,530 / 486,530 = 100.0% | |
| `is_in_ravine_protection_area = true` | 32,339 (6.65%) | |
| `ravine_distance_m` min / p50 / max | −1470.29744323 / 358.84339325 / 2739.69382788 | |
| `NOT ST_IsValid(geom)` (invalid geom, geom-bearing) | 16 | |
| `ravines` row count | 854 | |
| Sign⇔flag invariant, flagged side (`flag AND dist>0`) | 0 | |
| Sign⇔flag invariant, unflagged side (`NOT flag AND dist<0`) | 0 | |
| `flag=true AND dist IS NULL` | 0 | |
| `envelope_constraint_reason='ravine_constrained'` total | 14,005 | `scripts/lib/compute/enrich-parcels.js:717` is the only producer |
| `ravine_constrained` but NOT flagged | 0 | |
| Latest `sources:load_ravines` completed run | id 1469, 2026-07-08, `source_dataset_version` = `97b4ac7fb3f9808726a106a4b67083ac`, `spec_version` 1.2, `feature_count` 854 | |
| `staleCount` (geom-bearing parcels stale vs current version) | **0** — both goldens capture the zero-write / already-converged path | |
| `schema_migrations` count | 244 (the `database.min_migration` floor is a COUNT, never a filename) | |
| Required indexes present | `idx_parcels_geom_gist`, `idx_ravines_geom_gist`, `idx_ravines_geog_gist` — all three | |
| Historical `sources:enrich_ravines` runs | 7 rows: 6 skip-path (3.2s–9.3s, `records_updated 0`), 1 full recompute (id 1061, 2026-06-10, **2,122,567 ms = 35.4 min**, `records_updated 486,530`) | |

**Full form reason:** N/A — this row is COMPRESSED (ruling A1(b) above); the literal marker fast
invariant #24 checks for is stated at the top of this document.

---

## PH-3 — Intent ledger (fences)

`git log --follow -p -- scripts/enrich-ravines.js` → exactly two commits: `00902695`
("feat(59_source_ravines): enrich-ravines parcel ravine enrichment (§8d)") and `92ee03b9`
("perf(59_source_ravine): incremental-skip enrich_ravines when ravines unchanged (#418)"). Ten
fences recovered, one per introducing hunk, each with a verified disposition (F1–F10, see the
table in `src/tests/steps/enrich_ravines/violations.test.ts`'s own header comment for the
one-line summary; the disposition column below is the full reasoning):

| # | Behaviour | Origin | Disposition |
|---|---|---|---|
| F1 | §9/L18 six-throw producer HALT, pre-transaction | `00902695` | PRESERVED — folded into `execution.enrich_hooks.contract_read` (`readRavineContract`), called by the runner above the phase loop, before any transaction. |
| F2 | L14 empty-ravines HALT on BOTH paths (Gemini CRIT-1) | `92ee03b9` | PRESERVED — folded into the SAME `readRavineContract` hook (RV-L2): `guards.empty_source`/`inputs.expect_nonempty` are measured, unconsumed by the runner, so the genuinely-HALTing behaviour rides the one mechanism proven to run pre-transaction on every invocation. |
| F3 | PostGIS + both GIST indexes + SRID=4326, DEC-F §3.10 | `00902695` | PRESERVED and STRENGTHENED (postgis/indexes → `guards.requires`, now armed on EVERY run per Class A(vii), not only the recompute path) + SRID assertion folded into the same contract_read hook (RV-L2 — `guards.srid` has zero runner consumers). |
| F4 | DEC-E lineage-column guard | `92ee03b9` | PRESERVED — `guards.requires[kind:"column"]`, generic `assertRequirements`. |
| F5 | Materialized-centroid LATERAL KNN (not the spec's slow inline form) | `00902695` | PRESERVED VERBATIM in `scripts/lib/compute/enrich-ravines.js`'s `ENRICH_SQL` — byte-identical SQL text to the legacy `ENRICH_SQL` constant. |
| F6 | §8d no-op-write triple guard (L11) | `00902695` | PRESERVED — `write_discipline.guard_columns` explicit 3-column list, never `all_declared`. |
| F7 | `emitResults` shared by both paths, coverage re-queried LIVE every call | `92ee03b9` | PRESERVED — `execution.enrich_hooks.post_phase` (`computePostPhase`), called unconditionally after the phase. |
| F8 | `parcels_invalid_geom_count` root-cause signal | `92ee03b9` | PRESERVED — declared INFO check. |
| F9 | #418 Layer-1 cheap-COUNT early return | `92ee03b9` | RETIRED KNOWINGLY (mechanism) — the ENRICHER runner has no gated-skip branch; OBSERVABLE preserved via `parcels_ravine_enrich_skipped` re-derived from `updated === 0`. Declared as `deviations[0]` in the descriptor, not silently dropped. |
| F10 | `emitMeta` reads id+geom only, no `lead_id` | `00902695` | PRESERVED as intent, WIDENED honestly (RV-D1: the declared reads now include the guard/scope columns the SQL genuinely touches); the `lead_id` exclusion itself stays true. |

---

## PH-5 — Seam map

Nine consumers of the three written columns, each triaged (grep, 2026-09-18, every hit read):
`scripts/lib/compute/enrich-parcels.js` (`:459` flag read, `:538/:545/:548` setback, `:717`
`envelope_constraint_reason`) · `scripts/lib/max-build.js:80-84` · `scripts/enrich-permits.js:142-144`
(HALTS the permits chain if no parcel carries a stamp — hard cross-chain dependency, untouched by
this conversion) · `scripts/lib/assert-global-coverage-fields.js:128-129,299-300` ·
`scripts/validation/supabase-load-gates.js:385-411,587` · `src/lib/admin/parcel-lookup.ts:75` ·
`scripts/analysis/parcel-field-dump.js:19` (widened this commit to also print `ravine_distance_m`
and `ravine_dataset_version_when_enriched` — see PH-6 below) · two surface contracts
(`parcel_product/F02`, `parcel_admin/F08`) · `src/lib/admin/funnel.ts:555,841` +
`src/components/FreshnessTimeline.tsx:44,148` (ledger-row consumers, Admin domain, read-only).

**The `passCtx`/`written.e1` seam** (Ask A2): `runEnrichPhase:3086-3093` (pre-patch line numbers)
calls the `contract_read` hook and previously DISCARDED its return value beyond `staleOverlays`;
`passCtx` carried no `contract` key. Fixed by hoisting `contract` out of the `if (contractHook)`
block and adding it as one additive key on BOTH `passCtx` object literals (the shared-txn loop and
the post-commit loop) in `scripts/lib/step/index.js`. `written.e1.updated` is
`write.targetKey(0)` (`scripts/lib/step/write.js:158` → `"e1"`), the sole write target's rowCount —
the COUNTER-ROOT for `records_updated`.

---

## PH-6 — Classification

**Declared-reads gap (RV-D1, CLOSED this commit):** the legacy `emitMeta` declared
`{ravines:['geom'], parcels:['id','geom']}`; the SQL/hook reads more (see the descriptor's
`inputs.reads.tables[]`). Closed by declaring the widened set — no code change.

**Two structural findings, resolved this commit, both MEASURED not assumed:**

1. **The §9 contract's return value never reached the passes** (the finding that motivated Ask
   A2). Confirmed by reading `scripts/lib/step/index.js:3086-3093` (pre-patch): `contract` was
   local to the `if` block and never threaded onto `passCtx`. **Resolved** by the one-line
   `passCtx.contract` addition, `contract` hoisted to function scope, `null` when no
   `contract_read` hook is declared. Verified inert for every OTHER converted step: `contract`
   defaults to `null` and no existing compute reads `ctx.contract`, so no sibling behaviour
   changes; `phase_order` is provably unmoved (`LIBRARY_CALL_RE` matches
   `staleness|write|verdict|ledger|acquire|pipeline|preWriteGate` only — "contract" matches none
   of those), and `computeSourceFingerprint` inputs are `{step, descriptor, notes, compute}`, never
   the runner file, so no sibling's golden fingerprint moves (re-verified below).

2. **RV-L2 — `guards.srid`/`guards.empty_source` are declarative, not runner-enforced.** Measured
   2026-09-18: `grep -n "empty_source\|guards.srid" scripts/lib/step/index.js` → zero hits.
   `guards.srid` IS read directly by two sibling COMPUTE modules (`link-massing.js:167`,
   `link-neighbourhoods.js:108`) as a Rule-3 source of truth for a value their own SQL needs — not
   as a runner precondition. Because the legacy L14/SRID behaviours genuinely HALT (throw) rather
   than report, and neither field has ANY generic runner enforcement, both checks are folded into
   `readRavineContract` — the one hook proven to run pre-transaction on every invocation — rather
   than left as decorative fields. Declared in `limitations[]` (RV-L2) so a future reader does not
   mistake the field's presence for enforcement.

**RV-L3 (new finding this commit, MEASURED LIVE, not assumed):** the batch-2 plan's own tunables
census (§2, var #3) proposed externalizing the invalid-geometry ratio (5%) as
`enrich_ravines_producer_invalid_geom_max_pct`. Measured: `execution.enrich_hooks.contract_read` is
resolved and CALLED by the runner as `hookFn(pool)` ONLY — verified against both this step's own
call site (`scripts/lib/step/index.js:3089` pre-patch) and `enrich_parcels`'
`readZoningContract(pool)` (identical one-argument signature). No `config` argument reaches a
contract-read hook today. Externalizing the ratio anyway would declare a logic variable no code
path could ever read (Rule 12 violation). **Disposition:** the ratio stays the pinned literal
`MAX_INVALID_GEOM_RATIO = 0.05` in compute; filed as a review_followups LOW item for whichever WF
next threads `config` into `contract_read` hook call sites generally. **Variable count: 7, not 8**
(removed from the original 8-variable design after this finding — see PH-7).

**LIMIT_NUMBER_RE sign bug (new finding, MEASURED LIVE by actually running the converted step):**
`scripts/lib/step/verdict.js`'s `LIMIT_NUMBER_RE` is a digits-only pattern with no sign character.
A `plausibility[]` entry originally declared `bound: "value_min -2000"` with
`limit_from_config` resolving to `-2000` rendered `"value_min --2000"` — reproduced live, running
`PIPELINE_CHAIN=sources node -r dotenv/config scripts/enrich-ravines.js` against the local DB
(first run, before this fix): `checks_warned: 1`, `"ravine_distance_m_min_observed:
unevaluable: limit form not implemented in S2-min: \"value_min --2000\""`. **Fixed by design, not
by patching shared code:** the plausibility check now measures and bounds a MAGNITUDE
(`-1 * MIN(ravine_distance_m)`, always non-negative) against a positive-seeded
`enrich_ravines_distance_plausible_min_magnitude_m`, sidestepping the defect. Re-run after the fix:
`checks_warned: 0`, `terminal: "enriched"`, verdict `PASS`. Filed MED in `review_followups.md` for
`verdict.js`'s own eventual fix. See `docs/reports/defect-ledger.md` (no ledger row filed — this is
a shared-library gap, not an `enrich_ravines`-owned defect; tracked in `review_followups.md` only).

**PSA-CHECK-IDS-style disposition — where the 3 F-RC1 rows live:** `ravine_sign_flag_agree_*` (×2)
and `ravine_flag_true_distance_null_count` land in `invariants[]` (structural, `viol == 0`, no
config); `ravine_distance_m_min_magnitude_observed`/`_max_observed`/`ravine_dataset_version_distinct_count`
land in `plausibility[]` (physical bounds + one INFO visibility row), per the schema's own
authoring distinction (`invariant`/`plausibility` executed generically by
`scripts/lib/step/plausibility.js#runValidatorEntries`, never spliced into the folded `checks[]`
compute loop — the estate's own convention, confirmed against `geocode_permits`'
`coords_outside_toronto_bbox_count` precedent).

**`parcel-field-dump.js` widened (F-RC2):** confirmed the CLI printed
`is_in_ravine_protection_area` but NOT `ravine_distance_m` or `ravine_dataset_version_when_enriched`
— two of the three written values were invisible to a reviewer's eyeball. Added both to its field
groups.

**Line accounting:** legacy `scripts/enrich-ravines.js` 310 lines → frozen shell 27 lines (7
executable statements: `'use strict'`, 3 `require`s, `const ADVISORY_LOCK_ID = 60`,
`module.exports = pipeline.step(...)`, 2 named re-exports) + `scripts/enrich-ravines.descriptor.json`
(new, ~370 lines of declared data) + `scripts/lib/compute/enrich-ravines.js` (new, ~290 lines: the
contract hook, the verbatim SQL, the pass runner, the post-phase coverage query, 7 check functions,
the records_meta builder).

---

## PH-7 — Test design (red suite)

`src/tests/steps/enrich_ravines/violations.test.ts` (new). Per-claim red-first (the `geocode_permits`
precedent, NOT a single blanket flip commit): 7 claims are TRUE from commit 1 (descriptor-only —
G-shape/schema validity, the 7 gate-critical fields, claim #54's invalidator pair, the
COUNTER-ROOT lock, the ENRICHER profile's required from-config fields), 7 claims are `it.fails()`
at commit 1 and flip at commit 2b (compute/shell existence, F5's verbatim SQL, F6's regression
lock, the frozen shell shape, Ask A2's `passCtx.contract` seam, F9's derived-skip check, RV-L3's
pinned-literal check), and exactly 1 claim (`converted.json` registration) is structurally
un-landable before commit 3 and stays `it.fails()` through commit 2b.

**Existing suites, migrated not duplicated:**
- `src/tests/enrich-ravines.infra.test.ts` (re-pointed at descriptor + compute at commit 2b; the
  8 static claims are preserved in spirit, with the #418 two-layer assertion REWRITTEN to assert
  Layer-1's retirement + Layer-2's survival, per F9's disposition, rather than left asserting a
  mechanism that no longer exists).
- `src/tests/db/enrich-ravines.skip.db.test.ts` (re-pointed at compute at commit 2b; 4 of 5 cases
  are UNTOUCHED, since `ENRICH_SQL` moved verbatim; the 5th case, which called the now-removed
  standalone `assertVersionColumn`/`countStale` exports, is rewritten to prove the SAME two facts
  through their new homes — `guards.requires[kind:"column"]` and the SQL's own `$1`-scoped
  predicate).
- `src/tests/db/load-parcels-ravine-invalidation.db.test.ts` — UNTOUCHED (does not reference
  `enrich-ravines.js` at all; pins DEC-FENCE2 in `load-parcels.js`).

**§4 F-IL1 (kill-mid-run coverage):** `src/tests/db/enrich-ravines-kill-mid-run.db.test.ts` (new,
this commit) — cancels the backend mid-UPDATE via `pg_cancel_backend` (the
`refresh-snapshot-recorder-bound.db.test.ts` technique) and asserts (a) zero committed writes, (b)
an unmodified re-run completes and converges. Both the run-twice-writes-zero test and the
stamp+values-in-one-statement atomicity lock are preserved in the existing skip.db.test.ts suite.

---

## Tunables census — 7 logic variables (not 8; RV-L3 removed one)

| # | Variable | Seed | min/max | Group | Legacy anchor |
|---|---|---|---|---|---|
| 1 | `enrich_ravines_distance_coverage_pass_pct` | 95 | 0/100 | Data Quality Thresholds | `DISTANCE_COVERAGE_PASS_PCT` |
| 2 | `enrich_ravines_distance_coverage_warn_pct` | 90 | 0/100 | Data Quality Thresholds | `DISTANCE_COVERAGE_WARN_PCT` |
| 3 | `enrich_ravines_heartbeat_minutes` | 5 | 1/60 | Source Ingestion | NEW (Class A diff) |
| 4 | `enrich_ravines_lock_timeout_ms` | 1,800,000 | 0/3,600,000 | Source Ingestion | NEW (Class A diff) |
| 5 | `enrich_ravines_phase_timeout_minutes` | 240 (A3 ruling) | 0/290 | Source Ingestion | NEW (Class A diff) |
| 6 | `enrich_ravines_distance_plausible_min_magnitude_m` | 2000 | 0/5000 | Spatial & Massing | NEW (F-RC1a) |
| 7 | `enrich_ravines_distance_plausible_max_m` | 20000 | 0/50000 | Spatial & Massing | NEW (F-RC1a) |

Applied to the LOCAL DB only this session (`node -r dotenv/config scripts/seeds/apply-logic-variables.js`
→ "Seeds: 7/547 rows inserted"; values re-verified by direct SELECT, not the insert count).

**Probe list:** current live-derived count = **183** (verified: `scripts/lib/declared-logic-variables.js`
`collectDeclaredLogicVariableNames()` === `scripts/quality/assert-schema.descriptor.json`
`config.probe_presence.length` === 183, both measured 2026-09-18). At cutover (commit 3, when
`enrich_ravines` moves from `pending[]` to `converted[]`): **183 → 190** (+7). This move is
EXPLICITLY DEFERRED to commit 3 per the plan's own instruction ("(a) probe list — lands at CUTOVER,
not commit 1") and is NOT performed in this session's commits 1/2a/2b.

---

## Golden capture protocol

Two pairs (`--chain=sources` → `sources.json`, `--chain=none` → `standalone.json`), captured
sequentially, PRE against the legacy step (commit 2a) and POST against the converted step (commit
2b), no intervening chain run. Projection `--table-columns=parcels:id,is_in_ravine_protection_area,
ravine_distance_m,ravine_dataset_version_when_enriched` bypasses the 100,000-row hash ceiling
(`parcels` = 486,530 rows) and turns `table_state` into a real write-equivalence proof, since none
of the three projected columns is a run clock.

**`recovery.before_image` is `"none"`** (no retraction class) and `staleCount = 0` measured, so both
sides run the zero-write path against an identical starting state — no restore mechanics needed.
The recompute path is proven separately by the live forced-full local run (below), not by the
golden differential.

**Diff-class prediction, written BEFORE capture:**
- **Class A (structural, predicted NON-EMPTY):** (i) `records_total` moves `null` → `486530`
  (A4 ruling); (ii) `records_meta.config` appears, stamping 7 resolved variables; (iii)
  `checks_passed`/`checks_failed`/`checks_warned`/`errors`/`warnings` appear; (iv) `threshold`
  renders the resolved `95`/`90` instead of the legacy's implicit comparison; (v) new
  `stdout_lines` for `phase ravine_join starting (shared txn, timeout 240min)`; (vi)
  `parcels_ravine_enrich_skipped` is re-derived rather than branch-produced; (vii) `guards.requires`
  now executes on the zero-stale path (5 extra catalog queries); (viii) 3 new `invariants[]` rows
  and 3 new `plausibility[]` rows (F-RC1) appear that the legacy audit table never emitted.
- **Class B (data drift, predicted EMPTY):** no `load_ravines`/`load_parcels`/`enrich_parcels` run
  occurred between the PRE and POST captures (verified from `pipeline_runs` at POST time — see the
  differential section below).
- **Class C (inherent re-run noise, small non-empty):** `duration_ms`, `enrich_ravines_duration_ms`,
  `git_head`, `pipeline_runs_max_id_before`, `source_fingerprint`, `sys_*` rows.
- **Class D (capture order, MUST be EMPTY):** one phase, one statement, rows keyed by `id`.

*(The actual capture + differential is recorded in the commit-2b addendum to this report, appended
after the PRE/POST pair lands — see the git history for the commit-2b diff.)*

---

## Cloud proof (deferred to dispatch, per A5)

Not performed this session (local-DB-only per this WF's explicit rules; no cloud DB, no workflow
dispatch). Runbook §1a cloud seed command (to run BEFORE any dispatch):

```
SUPABASE_CA_CERT_PATH=scripts/certs/supabase-ca.pem PG_HOST= DATABASE_URL=$SUPABASE_DATABASE_URL node -r dotenv/config scripts/seeds/apply-logic-variables.js
```

Verify the 7 VALUES after applying (not the insert count) — `apply-logic-variables.js` is
`ON CONFLICT DO NOTHING`; `scripts/lib/step/config.js` THROWS (LM-D15) on a declared variable with
no seed row.

---

## Addendum (commit 2b) — RV-D4: the COUNTER-ROOT doubling defect, found and fixed

While measuring the forced-full local runtime (all 486,530 stamps nulled), the FIRST full run
reported `records_updated: 973060` — exactly 2x the true row count (verified against the live DB:
`SELECT COUNT(*) WHERE ravine_dataset_version_when_enriched IS NOT NULL` = 486,530, exactly the
expected total, and `COUNT(DISTINCT ...)` = 1 — the WRITE was correct; only the COUNTER was wrong).

Root-caused by live instrumentation (not guessed): wrapped `write.executeSetBasedJoinUpdate` to
prove the SQL executed exactly once per run (confirmed on 20/25/30/50/100-row controlled samples,
each time the real rowCount matched the nulled count exactly), then dumped `written.e1` state
before and after `runEnrichPhase`'s post-phase reconciliation loop (`scripts/lib/step/index.js`,
the "RESIDUE, NARROWED AND NAMED" block, batch-2 Phase 0.10b). That loop treats ANY of
`PASS_SCANNED_FIELDS = ['scanned','scoped','candidates','updated']` present on a pass's own
return object as evidence the pass did NOT use the composable `ctx.joinUpdate`/`ctx.retract` seam,
and unconditionally ADDS `r.updated` into `written[key].updated` — a second increment on top of
the one `ctx.joinUpdate` itself already applied, because `runRavineJoinPass` originally returned
`{updated, sourceDatasetVersion}`.

**`geocode_permits` has the identical shape** (`runGeocodePass` also calls `ctx.joinUpdate` and
also returns `.updated`) but never surfaced this, because its declared counters source from
`matched.compute.*`, never `written.e1.updated` directly. `enrich_ravines` is the first step to
use the COUNTER-ROOT `written.e1.updated` pattern for `records_updated`, which is exactly what
made the pre-existing corruption visible.

**Fixed in compute, not the shared runner** (out of this conversion's Ask A2 scope): the pass now
returns `rows_updated` instead of `updated`, a name that collides with none of
`PASS_SCANNED_FIELDS`. Re-verified on a fresh 25-row sample: `records_updated: 25` (correct).
Filed as `RV-D4` (defect-ledger.md, CLOSED) and a MED item in `review_followups.md` for the shared
runner's own eventual fix.

**Corrected forced-full measurement:** the DB write itself was correct throughout (486,530 parcels
genuinely and correctly re-stamped); the reported `records_updated` for that run should read
486,530, not 973,060. Wall-clock for that run: 3,710,569 ms ≈ **61.8 minutes** — longer than the
legacy's 35.4-minute baseline, most plausibly because it ran concurrently with this session's own
vitest/DB activity on the same machine (contention), not evidence of a genuine performance
regression; `guards.requires` now running unconditionally (Class A(vii)) adds five cheap catalog
queries, not tens of minutes. Treat 61.8 min as an upper bound, not a clean measurement.

---

## Golden differential (commit 2b) — scored against the PH-0 prediction

Both pairs captured back-to-back against a fully-converged DB (no intervening
`load_ravines`/`load_parcels`/`enrich_parcels` run — verified: `pipeline_runs` shows no new rows
for those pipelines between the PRE and POST captures). `sources.json`: **41 differences, 0
unexplained.** `standalone.json`: **42 differences, 0 unexplained** (one more than `sources` — see
below). `table_state` is **IDENTICAL in both pairs** (hash `3ff50232`, 486,530 rows) — the
write-equivalence proof: the converted step produces byte-identical `parcels` data to the legacy
step over the three enriched columns.

**Class A (structural, predicted) — every predicted item confirmed present, PLUS two additions:**
(i) `records_total` null → 486530 ✓; (ii) `records_meta.config` appears (7 resolved variables) ✓;
(iii) `checks_passed`/`checks_failed`/`checks_warned` appear ✓ (no `errors`/`warnings` keys — none
fired, consistent with a clean PASS run); (iv) `threshold` renders resolved values (`"pct >= 95"`
instead of the legacy's implicit comparison) ✓; (v) new `stdout_lines` for the phase
starting/completed boundary logging ✓; (vi) `parcels_ravine_enrich_skipped` present, re-derived ✓;
(vii) not directly visible in the diff (both PRE and POST already hit the zero-stale path, so
`guards.requires`' extra catalog queries are invisible in a stdout/summary diff — confirmed
separately by reading the descriptor); (viii) 3 new `invariants[]` rows + 3 new `plausibility[]`
rows (F-RC1) appear ✓ — **explained by deepest field name**: `summary.records_meta.audit_table.rows[7..12]`.
**Two additions beyond the original prediction, both explained:** (ix) `meta.reads.parcels[2..4]`
—the RV-D1 widened, honest declared read-set; (x) `standalone.json` ONLY: `pipeline_runs[0]`
appears (undefined → a real completed row) — the converted step opens a ledger row on a
standalone invocation where the legacy opened none (the review_followups HIGH item
"`pipeline.run()` standalone invocations open no ledger row" no longer applies to this step
post-conversion, a genuine, beneficial behaviour improvement, not a regression).

**Class B (data drift, predicted EMPTY) — confirmed EMPTY.** Verified via `pipeline_runs`:
no `load_ravines`/`load_parcels`/`enrich_parcels` completions between the two capture timestamps.

**Class C (inherent re-run noise, predicted small non-empty) — confirmed, all named:**
`duration_ms`/`enrich_ravines_duration_ms`/`sys_duration_ms`/6×`sys_*_duration_ms` rows (per-check
timing), `sys_velocity_rows_sec`, `chain_run_id` (nulled by the harness's own `<DUR>`-style
normalization in some fields but not `records_meta.chain_run_id`, itself always null for a
non-chain-dispatched capture), and (`standalone.json` only) `pipeline_runs[0].id`/`.started_at`/
`.completed_at`/`.duration_ms` (a genuinely new row, its own identity fields non-deterministic by
construction).

**Class D (capture order) — EMPTY in both pairs**, confirmed by the identical `table_state` hash.

**Minor cosmetic diff, explained:** `audit_table.name` "Parcel ravine enrichment" → "Parcel Ravine
Enrichment" (this conversion's `identity.display_name`, Title Case, replacing the legacy's
sentence-case literal) and `audit_table.phase` `60` (the legacy literally reused
`ADVISORY_LOCK_ID` as the audit phase number) → `12` (the runner's own generic `phase` field,
sourced from this step's `sources` chain position per the converted shape — confirmed NOT the lock
id by spot-checking `geocode_permits`' own captured golden, whose `audit_table.phase` is `3`, not
its lock id `5`).

**G8 verdict: PASS — zero unexplained diffs in either pair.**

---

## Explained-diff citations (step-validate.mjs G8 gate — deepest field name / difference count)

Every remaining diff the automated G8 checker flagged, cited by its own deepest field name (never
a generic wrapper):

- **`records_new`** — `summary.records_new` moves `null` → `0` in both pairs, the sibling of the
  already-predicted `records_total` move (A4 ruling): an Enrich archetype's `records_new` counter
  root (`matched.compute.records_new_aggregate`) is a declared finite literal 0 (class N structurally
  cannot INSERT), never the legacy's `null`.
- **`code_version`** — `summary.records_meta.code_version` appears (`"v1-materialized-centroid-knn"`),
  sourced from `descriptor.staleness.logic_version` via `buildRavineMeta` — new records_meta key,
  declared in the descriptor's `emits[]`.
- **`ledger_row`** — `summary.records_meta.ledger_row` appears (`"chain_owned"` / `"owned"`) — a
  runner-owned field every converted step emits, absent from the legacy's hand-rolled summary.
- **`pool_errors`** — `summary.records_meta.pool_errors` appears (`0`) — likewise runner-owned,
  absent pre-conversion.
- **`warn_threshold`** — `summary.records_meta.audit_table.rows[0].warn_threshold` appears
  (`"pct >= 90"`) on the `parcels_with_ravine_distance_pct` row only — the R-AD 3-tier rendering
  of the WARN bound alongside the already-cited `threshold` (PASS bound); the legacy rendered
  neither as a resolved string.
- **`stdout_lines`** — exactly **4 differences** under `stdout_lines` in each pair (indices 0-3):
  the legacy's 2-line stdout (`skip — ...` / `completed in <DUR>`) is replaced by the converted
  step's 4-line stdout (`target: ... migrations=...`, `phase ravine_join starting ...`,
  `phase ravine_join completed in <DUR>`, `[enrich_ravines] completed in <DUR>`) — the new
  phase-boundary logging already predicted in Class A (v).

---

## §R. Reflection

Written this commit — `converted.json.pending[0].stage` reached `shape_clean` at commit 2b;
cutover (commit 3) is prepared but uncommitted, per the operator's explicit instruction.

**LOW-CONFIDENCE findings** (measured this session, not fully closed):

| # | Finding | Why LOW-CONFIDENCE |
|---|---|---|
| 1 | The forced-full local runtime (61.8 min) was measured while this session's own vitest/DB activity ran concurrently on the same machine, so it is an upper bound, not a clean apples-to-apples comparison against the legacy's 35.4-minute baseline. |
| 2 | RV-D4's fix (renaming the pass's returned key to `rows_updated`) is verified on controlled samples up to 100 rows and re-derived from first principles against the runner's own reconciliation-loop source; it was not re-verified against a fresh full 486,530-row forced-full run (too expensive to repeat this session) — the golden POST capture (steady-state, `records_updated: 0`) cannot exercise this path since `records_updated` is 0 either way at that scale. |

**RECURRING/STANDARD-SHAPING** patterns this conversion reconfirms:

| # | Pattern | Where else it recurs |
|---|---|---|
| 1 | A step's own pass-result field names can collide with a shared runner's generic fallback/reconciliation naming convention (`PASS_SCANNED_FIELDS`), silently double-counting a value the composable seam (`ctx.joinUpdate`/`ctx.retract`) already tracked correctly — RV-D4 is a NEW instance of the same class EP-D12/EP-D16/ER-D1 already document (a hardcoded/generic library assumption silently wrong for a shape its author didn't have in front of them when it was written) |
| 2 | Registering a `pending[]`/`converted[]` entry has REGISTRY-WIDE side effects (probe list, fast invariants #23/24, scorecard staleness) that must be re-verified fleet-wide, not just for the one step | I4's `a062eb79` repair; batch2 P1.1's own APS-D5/D6 |
| 3 | A `contract_read` hook's return value being silently discarded beyond one narrow side effect (`staleOverlays`) is the SAME shape as the pre-0.10b `computeAggregateRecordsUpdated` hardcoded call this WF's own Ask A2 retires — a declared seam with a real but narrow consumer inside the runner, widened by one additive key rather than redesigned |

RED evidence: the whole `src/tests/steps/enrich_ravines/violations.test.ts` red suite (8
`it.fails()` at commit 1, proven RED against the actual pre-compute/pre-shell tree via a `git
stash` swap, not simulated — 7 flipped to plain `it()` at commit 2b as their artifacts landed, 1
(`converted.json` registration) remains RED through commit 2b and flips only at commit 3) — see
the commit ledger above.
