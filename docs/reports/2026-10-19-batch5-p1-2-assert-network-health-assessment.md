# C6-1 — `assert_network_health` (scripts/quality/assert-network-health.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF), the whole six-part package (R-DT):
- zero purity findings, with no ledger allowance (R-BZ);
- every gate hard from ① (R-BA);
- the seven admission questions, including EXTERNALIZED;
- step-owned variable names (R-DE (v));
- admin visibility (R-DL).

**Archetype:** ASSERT. One SELECT reads the latest inspections `pipeline_runs` row. Five graded checks run over its `scraper_telemetry`. The step is non-halting and writes nothing.

**Commit form: compressed (R-PACE-1)**.
- Commit ① is this report plus the red suite.
- Commit ② adds the descriptor, compute, notes, frozen shell and the seeds migration.
- Commit ③ is the cutover.
- ASSERT has five converted members (assert_data_bounds, assert_engine_health, assert_global_coverage, assert_parcel_sanity, assert_schema), so compressed is the default (#24).

**Frozen legacy oracle:** `src/tests/steps/assert_network_health/fixtures/legacy-assert-network-health.js.txt`. It is byte-identical to `scripts/quality/assert-network-health.js` (sha256 `03495023a79196bd…`), last changed by `4d5df9e7`.

**Owner spec:** 44 (`44_chain_deep_scrapes.md`). The header cites it, and the step runs only in `chains.deep_scrapes`.

**Target spec:** Spec 44 (`identity.spec` "44").

**Governing specs:**
- 122: the step library and the conversion process.
- 124: the policy register (R-BA, R-BZ, R-DE, R-DF, R-DL, R-DT, R-DU, R-ED).
- 30 §5.4.1: the per-site halt gate that made this step non-halting.

**Governing plan:** `.cursor/v3-c6-plan-2026-10-19.md`, wave C6-1.

**Chain:** `deep_scrapes`, position 3 of 7 (inspections, classify_inspection_status, assert_network_health, …).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Reads, writes and transactions
- **One read:** `SELECT records_meta, records_updated FROM pipeline_runs WHERE (pipeline = 'inspections' OR pipeline LIKE '%:inspections') ORDER BY started_at DESC LIMIT 1`. It runs on the pool with no params and no status filter (`:54-58`).
- **Writes:** none. `emitMeta` writes `{}` (`:72-75`, `:174-177`).
- **Transactions:** none. Advisory lock 105 wraps everything, including the config load (`:33`, `:36-37`).
- **Config:** `loadMarketplaceConfigs` then a Zod schema:
  - `scraper_error_rate_warn_pct` and `scraper_latency_p50_warn_ms`: positive.
  - `scraper_empty_streak_warn`: a positive integer.
  - A refused config throws before the query (`:27-39`, pinned L11).

### 1.2 The five checks
- **schema_drift_count:** the count of drift entries. It is WARN when > 0, despite the "== 0" text (`:80-90`, ANH-D3).
- **proxy_error_rate:**
  - The value is `proxy_errors / permits_attempted × 100`, rendered with `toFixed(1)` as a string.
  - It is FAIL at `>=` the configured percent, an inclusive floor. It is the only FAIL check, keyed on a variable named `_warn_` (ANH-D2).
  - A run with 0 attempted reads "0.0%" PASS (`:93-111`).
- **avg_latency_ms:** the telemetry p50, not an average (ANH-D5). It is WARN at `>=` the configured ms. An INFO max_latency_ms row follows (`:114-125`).
- **consecutive_empty_hit:** a boolean. It is WARN when the max streak `>=` the configured streak (`:128-137`).
- **session_failures:** WARN when > 0, with a NULL threshold (`:144-152`).
- **Two INFO rows:** session_bootstraps (`:140`), and permits_closed, emitted only when > 0 (`:155-159`).

### 1.3 Audit rows, verdict, `records_meta` and exit lanes
- **Audit table:** phase 2, "Network Health". It holds seven rows in order, eight with permits_closed (pinned L3).
- **Verdict:** taken from the `errors`/`warnings` arrays, FAIL > WARN > PASS (`:162`, ANH-D6). A FAIL does not throw (Spec 30 §5.4.1; `4d5df9e7` removed the throw, pinned L9).
- **`records_meta`:**
  - Keys: `{checks_passed: 'all' | undefined, checks_failed, checks_warned, audit_table}`.
  - Summary: `records_total 0`, `records_new null`, `records_updated 0` (`:165-173`).
- **No telemetry** (no row, or no `scraper_telemetry`): verdict SKIP with one row `scraper_telemetry SKIP` and the same emitMeta, then return (`:63-77`, pinned L2, ANH-D8).
- **Lock not acquired:** nothing is loaded, read or emitted (`:186`).

### 1.4 Live facts (A.F-DB, read-only, 2026-10-19)
- **Latest inspections run:** 1602 (`deep_scrapes:inspections`, 2026-08-01) carries `scraper_telemetry`.
- **Latest network-health runs:**
  - 1604 (2026-08-01): WARN, nine rows. avg_latency_ms is 3640 against `< 2000`, and the runner appended the two `sys_*` INFO rows.
  - 935 and 928 (2026-03-15): PASS.
- **`logic_variables`:** `scraper_error_rate_warn_pct` 5, `scraper_latency_p50_warn_ms` 2000, `scraper_empty_streak_warn` 20 (the seeds).
- **RLS on `pipeline_runs`:** enabled. The step only reads it.

### 1.5 Consumers
None. Its audit row is read by the admin surface and check-chain-verdict.

### 1.6 Admin visibility (R-DL)
- **Registered today:**
  - `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:97`).
  - `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:718`), which copies no number.
  - `PIPELINE_TABLE_MAP` → `pipeline_runs` (`funnel.ts:904`).
- **No gap.** R-DV: at red_suite no descriptor exists, so only the slug-keyed arms apply. Both are present.

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L12 (§10). Each executes the frozen text.

## 3. Registry target review
- **(a) Files:**
  - `scripts/quality/assert-network-health.js` becomes the frozen shell.
  - Added at ②: `scripts/quality/assert-network-health.descriptor.json`, `scripts/quality/assert-network-health.notes.json`, `scripts/lib/compute/assert-network-health.js` and a seeds migration that renames the three variables.
- **(b) Tables:**
  - **Reads:** `pipeline_runs(records_meta, pipeline, started_at)`. The legacy emitMeta names `status` (never read) and omits `started_at` (ANH-D4).
  - **Writes:** none.
- **(c) Consumers:** none (§1.5).
- **(d) Tests:** `src/tests/steps/assert_network_health/violations.test.ts` lands in this commit. For the ② sweep:
  - `src/tests/assert-network-health.infra.test.ts`
  - `src/tests/db/assert-network-health-halt.db.test.ts` (the 4d5df9e7 non-halting lock)
  - `src/tests/pipeline-logic-vars-coercion.infra.test.ts` and `src/tests/pipeline-advisory-lock.infra.test.ts`

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -S … -- scripts/quality/assert-network-health.js`).

| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Grade the scraper's telemetry from its own run row | `:5-6, :54-61` (`7391b016`, the 6-phase audit chain) | preserved-in-compute (the one SELECT; why in notes.json) |
| No status filter on the latest inspections row | `:51-53` (`d41992f5`) | preserved-in-compute; why in notes.json |
| Schema drift is WARN, not FAIL | `:82-84` (`02d292c5`) | encoded-as-descriptor-field: a WARN `viol == 0` check |
| Externalized SLA thresholds | `:27-31, :40-42` (`9266fd05`, WF3-E13) | encoded-as-descriptor-field: bounds from config, renamed into `assert_network_health_*` (R-DE (v), ANH-D1) |
| permits_closed INFO row | `:154-159` (`e5fa0098`) | encoded-as-descriptor-field: an INFO check emitted when non-zero |
| Non-halting proxy-error FAIL | `:179-183` (`4d5df9e7`, C4) | encoded-as-descriptor-field: `blocking: false` |
| Advisory lock | `:33, :36` (`cc2f5d5d`, Bundle G Wave 6) | preserved-in-runner: `identity.lock` 105 |
| Coerced numeric config | `:28-30` (`145c08f4`) | preserved-in-validator: `config.logic_variables[]` min/max, `on_invalid: fail` |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| db seam | advisory lock 105 | `:33, :36` | `identity.lock` 105 |
| db seam | `loadMarketplaceConfigs` + Zod | `:37-39` | `config.logic_variables[]` resolved by the runner |
| db seam | the one SELECT on the pool | `:54-58` | `ctx.pool` read, declared in `inputs.reads` |
| clock seam | none: the step reads no clock (it orders by `started_at`) | — | — |
| network seam | none: the telemetry is read from the database, never from the portal | — | — |
| argv/env seam | none (no `--full`; `supports_full: false`) | — | — |

### 5.1 Risk class
| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| Variable rename breaks a run (ANH-D1) | low | medium: config refused | the ② migration copies the values; the PRE runs on the ① tree before it is applied |
| A renamed FAIL variable reads as a WARN bound (ANH-D2) | low | medium: the operator tunes the wrong tier | the ② name states its tier; D3 pins the FAIL severity |
| The SKIP lane changes verdict form | medium | low: SKIP is a terminal, not a row | the ② `skipped_<reason>` terminal (R-DE (iii)); the PRE captures the live row, which has telemetry |

## 6. PH-6 — Classification and defect ledger (rows ANH-D1…ANH-D8 in `docs/reports/defect-ledger.md`; prefix ANH, unique — `defectPrefixFor` measured, no override)

**PH-2 (churn × complexity):** ASSESSMENT-INCOMPLETE because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain, and `assert_network_health` is outside its scope. No hand-plotted quadrant is substituted.

- **ANH-D1** (`:27-31`): the three bounds are named `scraper_*`, outside the R-DE (v) `<slug>_<name>` form. Each has one consumer, this step, so none is shared. Fix at ②: a migration renames them (pinned D2).
- **ANH-D2** (`:97-99`): the only FAIL tier reads a variable named `scraper_error_rate_warn_pct`. Fix at ②: the new name states its tier (pinned D2, D3).
- **ANH-D3** (`:80-90`): schema drift reads WARN while its threshold text says "== 0" (pinned L7). Fix at ②: a declared WARN `viol == 0` check (pinned D3).
- **ANH-D4** (`:72-75`, `:174-177`): emitMeta names `pipeline_runs.status`, which the SELECT never reads, and omits `started_at` (Rule 1). Fix at ②: `inputs.reads` lists the touched columns (pinned D5).
- **ANH-D5** (`:114-122`): `avg_latency_ms` is the p50, not an average. Fix at ②: the metric id is kept for admin continuity, and notes.json states that it is the p50. This is a declared naming deviation.
- **ANH-D6** (`:162`): the verdict comes from the parallel `errors`/`warnings` arrays, not the rows (Rule 10). They agree by construction today. Fix at ②: the library derives the verdict from the declared checks.
- **ANH-D7** (`:44-163`): output goes through `console.log` / `console.error`, not `pipeline.log` (R-BZ). Fix at ②: compute emits nothing (pinned D4).
- **ANH-D8** (`:63-77`): a missing telemetry object yields an audit table with verdict SKIP. Fix at ②: the runner-owned terminal `skipped_no_scraper_telemetry` (R-DE (iii)).

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition |
|---|---|---|
| 5 (error-rate percent) | seed `scraper_error_rate_warn_pct` | an `assert_network_health_*` variable, value copied |
| 2000 (p50 ms) | seed `scraper_latency_p50_warn_ms` | an `assert_network_health_*` variable, value copied |
| 20 (empty streak) | seed `scraper_empty_streak_warn` | an `assert_network_health_*` variable, value copied |
| `* 100`, `toFixed(1)` | `:95-96` | a unit conversion and display rendering in notes.json; the bound compares the raw percent |
| 105 | `:33` | `identity.lock` (not a tunable) |
| `phase: 2`, "Network Health" | `:69`, `:171` | `execution` / `identity.display_name` declaration |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | config via `loadMarketplaceConfigs` `:37` | runner config |
| G4 txn/lock | advisory lock `:36` | runner |
| G5 direct write | none | — |
| G7 compute decides | `>= errorRateWarnPct`, `>= latencyP50WarnMs`, `>= emptyStreakWarn` `:97, :116, :129`; the verdict `:162` | declared check bounds (the library compares) |
| G9 literal | `* 100` `:95` | a declared unit conversion |
| G12 output | `console.*` throughout | removed |

**Expected after ②:** 0 findings, no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- **PRE:** taken on the legacy code at the ① tree, before any compute change (trap 7), in `deep_scrapes`-chain mode and standalone, on a capture night under the DB lock. It must run BEFORE the ② rename migration is applied, because the legacy code reads the old names.
- **Determinism:** the read is the latest inspections run row (1602 today). The PRE is deterministic as long as no inspections run lands between the PRE and the POST.
- **POST:** taken at ②. ASSERT writes nothing, so the #38 nonzero evidence is the check rows.

## 10. Red suite (PH-7) — `src/tests/steps/assert_network_health/violations.test.ts`
- **Size:** 19 tests.
  - L1–L12 are GREEN today (the legacy oracle).
  - D1–D5 and D7 are `it.fails`, RED as named missing artifacts.
  - D6 is a plain `it` (R-R / Rule 13).
- Red evidence: docs/reports/red-evidence/assert_network_health/pre2-artifacts-missing.json (vitest JSON reporter output, D1–D7 run as plain it calls): 13 pass / 6 fail.
  - D1–D5 fail as ENOENT on the named descriptor or compute.
  - D7 fails because converted[] does not hold the file.
  - No TS or import error.
- **Oracle harness:** `fixtures/legacy-harness.ts` fakes `../lib/pipeline`, `../lib/config-loader` and `console`. `zod` is real.

| Pins | Behaviour |
|---|---|
| L1–L2 | the one SELECT; the SKIP lane |
| L3–L8 | the seven rows; the inclusive FAIL floor; the p50 WARN; the boolean streak; drift as WARN; session failures and permits_closed |
| L9–L12 | the non-halting FAIL verdict; summary and emitMeta; config refusal; lock 105 |
| D1–D7 | descriptor and shell; renamed variables; declared checks; compute purity; truthful reads; scorecard; registry (③) |

## 11. Registry at ① (this commit) and what is owed later
- **Landed:**
  - `converted.json` `pending[]` at stage `red_suite`.
  - The census row moves from C6 to pending: ASSERT, owner spec 44, plus the two census fixtures.
  - ANH-D1…D8.
  - ADOPTION `legacy_oracle_excluded`.
  - The roadmap is regenerated.
- **Owed at ②:** descriptor, compute, notes, shell, rename migration, logic-variable groups, scorecard refresh.
- **Owed at ③:** registration, blocked by EP-PIN-D17 under R-ED until the end-of-sources cloud acceptance.

## 12. Operator decisions
- **RULED 2026-10-19:** the C6 census is ASSERT (`.cursor/v3-c6-plan-2026-10-19.md`). C6-1 opens before wave 4 ③ (coordinator: no wave-4 twin, no write).
- **Open questions:** none. Every disposition follows an existing rule (R-DE (v) renames, R-DE (iii) terminals, Rule 1 reads, Rule 10 verdict).

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| ASSERT descriptor + frozen shell (D1) | Spec 122 §5.1; R-BA | assert_data_bounds form | step-validate gates A–K | this report | archetype | red-first D1 | precedent | — |
| Renamed variables (D2) | R-DE (v) | `<slug>_*` | `r-de-vocabulary.logic`, gate A | ANH-D1 | every new step | measured names | one migration | **yes** |
| Declared checks (D3) | R-BA; Rule 10 | assert_data_bounds checks[] | verdict.js | ANH-D3, ANH-D6 | all checks | L3–L8 pinned | one check per row | bounds from config |
| Compute purity (D4) | R-BZ | G-codes | gate E #32 | R-BZ | fleet | red-first | seams only | — |
| Truthful reads (D5) | Rule 1 | `inputs.reads` | gate D | ANH-D4 | every step | the SQL | one list | — |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **The SKIP lane.** The legacy SKIP audit table becomes a runner terminal. Whether check-chain-verdict reads the terminal the way it read verdict SKIP is checked at ② by a fake-ctx test.

### RECURRING / STANDARD-SHAPING
- **The three C6-1 asserts with config** (network health, staleness, lifecycle distribution) all carry pre-R-DE (v) names. Each ② needs a rename migration, as wave-4 assert_coa_freshness did (migration 270).

## A. Measurement log (2026-10-19)
- **A.F-DB** (read-only, one `BEGIN READ ONLY` transaction):
  - the latest three inspections runs, and whether each carries telemetry;
  - the latest three network-health runs, with run 1604's rows;
  - `logic_variables` values;
  - RLS flags.
- **A.F-CODE:** `scripts/quality/assert-network-health.js` @ `4d5df9e7`, 187 lines, sha256 `03495023a79196bd…`.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/assert_network_health/` → 12 pins green, 6 claims red as expected, and D6 green once the scorecard is written.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=assert_network_health --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G1 | 1 | 1 | PH-3 section found=true sha-count=8 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=8 vocab-hit rows=8; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 8 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=21 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=2 missing-pre-invocations=2 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=21 |
| G-shape | PASS | — | file-clean=null compute-clean=null |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 7 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 7 eligible pending slug(s), all either compressed or carry a stated full-form reason |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 568 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 43 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 24.65 s <= 25.3 s; registry-input 24.41 s <= 27.5 s; measured 2026-10-18T18:40:16.223Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 532 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 169 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 43 converted/pending step(s) admin-verifiable (5 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 40 take effect at cutover, 9 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): deep_scrapes::, none::
- missing invocations (PRE, GOLD-PRE): deep_scrapes::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- SKIPPED or failed to run: --fast: vitest spawn skipped

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | not-run | §5.5 describe not evaluated — vitest did not run (--fast); shape scan is NOT a substitute for the §5.5 suite |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 2 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-red |  |
| 6 | Omission fails (20 categories) | enforced-red |  |
| 7 | Archetype gates categories | enforced-red |  |
| 8 | Per-target write discipline | enforced-red |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-red |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no descriptor — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): no descriptor · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-red | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=0B notes=0B checks=0 rows records_meta=(no capture) |

**Enforced-green: 4/14** · not-run: 1 · vacuous: 1

