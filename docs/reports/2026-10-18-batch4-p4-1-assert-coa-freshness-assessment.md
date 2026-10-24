# Phase 4 wave 4 — `assert_coa_freshness` (scripts/quality/assert-coa-freshness.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF), the whole six-part package (R-DT): zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, step-owned variable names (R-DE (v)), and admin visibility (R-DL).
**Archetype:** ASSERT. One aggregate SELECT over `coa_applications`, a three-tier portal-rot verdict, no write.
**Commit form: compressed (R-PACE-1)**. Commit ① is this report plus the red suite. Commit ② adds the descriptor, compute, notes, frozen shell, the seeds migration and the admin-text fix. Commit ③ is the cutover. ASSERT has four converted members (assert_data_bounds, assert_global_coverage, assert_parcel_sanity, assert_schema), so compressed is the default (#24).
**Frozen legacy oracle:** `src/tests/steps/assert_coa_freshness/fixtures/legacy-assert-coa-freshness.js.txt`, byte-identical to `scripts/quality/assert-coa-freshness.js` (sha256 `4fa0669067b9b64a…`), last changed by `bc9e6103`.
**Owner spec:** 42 (`42_chain_coa.md`). The header also cites 41 and 43, but the step runs only in `chains.coa` (`scripts/manifest.json`), so those links are stale (ACF-D5).
**Target spec:** Spec 42 (`identity.spec` "42"). **Governing specs:** 122 (step library and conversion process), 124 (policy register: R-BA, R-BZ, R-DC, R-DE, R-DF, R-DL, R-DT, R-DU, R-DV). **Governing plan:** `.cursor/v3-wave4-coa-and-dispatch-2026-10-18.md` §B.2.1 (all 15 recommendations operator-approved 2026-10-18).
**Chain:** `coa`, position 3 of 16 (index 2: assert_schema, coa, assert_coa_freshness, …).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Reads, writes and transactions
- **One read:** `SELECT MAX(last_seen_at) AS max_last_seen, MAX(hearing_date)::date AS max_hearing_date, MAX(decision_date)::date AS max_decision_date, COUNT(*) AS total_records FROM coa_applications` on the pool, no params (`:53-60`).
- **Writes:** none ("Read-only — no database writes", `:9`; `emitMeta` writes `{}`, `:133-136`).
- **Transactions:** none. The advisory lock 108 wraps everything, including the config load (`:41`, `:44`).
- **Config:** `loadMarketplaceConfigs` then a Zod schema: `coa_freshness_warn_days` and `coa_freshness_fail_days`, each a positive integer, with a refine `fail > warn` (`:30-36`). A refused config throws before the query (pinned L11).

### 1.2 The measure
- `ingestion_days_ago = max(0, round((Date.now() − MAX(last_seen_at)) / 86 400 000))` (`:85-88`).
- The metric is the coa root's ingestion touch, not `hearing_date` (future hearings mask portal rot, `:5-7`, `:83-84`).
- It depends on the coa root's `last_seen_at` touch for EVERY fed key (`load-coa.js:565-582`). The runner lane's R-DW keeps that touch (`written:"seen"`), so the converted metric has parity.

### 1.3 Audit rows, verdict, `records_meta` and exit lanes
- **Audit table:** phase 3, "Source Freshness", five rows in this order (`:113-119`):
  - total_records (INFO), last_ingestion (INFO; the UTC date via `toISOString`, ACF-D4);
  - ingestion_days_ago (FAIL ≥ fail, else WARN ≥ warn, else PASS; threshold text names both values);
  - max_decision_date (INFO), max_hearing_date (INFO; may be future).
- **Verdict:** the freshness tier itself (`:94`, `:128`), not a row cascade.
- **`records_meta`:** `{duration_ms, audit_table}`; summary `records_total 0, records_new null, records_updated null` (`:121-132`).
- **Empty table:** WARN, ONE row `total_records 0 "> 0" WARN`, no `duration_ms`, the same emitMeta, then return (`:68-81`).
- **Lock not acquired:** nothing loaded, read or emitted (`:139`).

### 1.4 Live facts (A.F-DB, read-only, 2026-10-18)
- `coa_applications`: 33,949 rows; `MAX(last_seen_at)` 2026-10-16 13:57 UTC (the H6 `--full` runs); `MAX(hearing_date)` 2027-10-08 (future); `MAX(decision_date)` 2026-12-21.
- `last_seen_at` is `NOT NULL DEFAULT now()`, so the NULL branch (`:85-88`) is unreachable on the live schema (ACF-D6).
- RLS on `coa_applications` (`relrowsecurity = true`, 0 policies). The step only reads, so R-CT (write targets) does not apply.
- `logic_variables`: `coa_freshness_warn_days` 45, `coa_freshness_fail_days` 135 (the seeds).
- Latest runs (`pipeline_runs.pipeline = 'coa:assert_coa_freshness'`): 2026-07-17, 07-10 and 07-07, all `completed`, verdict PASS, records_total 0.

### 1.5 Consumers
None. No step reads this step's output. Its audit row is read by the admin surface (`pipeline_runs`).

### 1.6 Admin visibility (R-DL)
- Registered today: `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:100`), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:721`), `PIPELINE_TABLE_MAP` → `pipeline_runs` (`funnel.ts:980`, the ASSERT audit home). No write table, so `telemetry_tables` needs no entry.
- **Gap:** the description hard-codes ">45 days" (ACF-D1), a copied number R-DF bans. ② removes it (recommendation 15).
- R-DV: at red_suite no descriptor exists, so only the slug-keyed arms apply; both are present.

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L13 (§10). Each executes the frozen text.

## 3. Registry target review
- **(a) Files:** `scripts/quality/assert-coa-freshness.js` becomes the frozen shell. Added at ②: `scripts/quality/assert-coa-freshness.descriptor.json`, `scripts/quality/assert-coa-freshness.notes.json`, `scripts/lib/compute/assert-coa-freshness.js`, `migrations/270_assert_coa_freshness_logic_variables.sql`.
- **(b) Tables:** reads `coa_applications(last_seen_at, hearing_date, decision_date)` plus `COUNT(*)`; writes none.
- **(c) Consumers:** none (§1.5).
- **(d) Tests:** `src/tests/steps/assert_coa_freshness/violations.test.ts` (this commit). For the ② sweep: `src/tests/assert-coa-freshness.infra.test.ts` (it pins the old names and the legacy text, so ② rewrites it), `src/tests/control-panel.logic.test.ts` (the expected key set), `src/tests/quality.infra.test.ts`.

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -- scripts/quality/assert-coa-freshness.js`).

| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Measure ingestion (last_seen_at), never hearing_date | `:5-7, :83-84` (`fcd6c300`, the Time Traveler fix) | preserved-in-compute (the one SELECT; why in notes.json) |
| Externalize the WARN bound | `:31, :48` (`f1dca94f`, WF3-E5) | encoded-as-descriptor-field: `checks[] ingestion_days_ago` `warn_limit_from_config assert_coa_freshness_warn_max_days` (renamed, value carried) |
| A FAIL tier for a dead portal | `:33-35, :92` (`fb593a9e`, WF2 P6.5) | encoded-as-descriptor-field: the same check, `limit_from_config assert_coa_freshness_fail_max_days`, severity FAIL |
| `fail > warn` | `:34-36` (`fb593a9e`) | encoded-as-descriptor-field: `checks[] freshness_bounds_ordered` `viol == 0` FAIL, blocking (the schema has no cross-variable form; its why in checks[]) |
| Empty table is WARN, not portal rot | `:68-81` (`b25945bb`; WF2 P6.5 kept it WARN) | encoded-as-descriptor-field: `checks[] total_records_present` `viol == 0` WARN; the freshness check reports inert (INFO) on an empty table |
| Threshold text direction | `:116` (`bc9e6103`, P8 panel) | preserved-in-runner: verdict.js renders the substituted bound (the threshold string changes form; named diff, notes.json) |
| Advisory lock | `:38, :41` (`cc2f5d5d`, Bundle G Wave 6) | preserved-in-runner: `identity.lock` 108 |
| Coerced numeric config | `:31, :33` (`145c08f4`) | preserved-in-validator: `config.logic_variables[]` min/max, `on_invalid: fail` |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| clock seam | `Date.now()` for the measure and the duration | `:42, :87, :112` | `ctx.clock()` for the measure; the duration is runner telemetry |
| db seam | advisory lock 108 | `:38, :41` | `identity.lock` 108 |
| db seam | `loadMarketplaceConfigs` + Zod | `:44-46` | `config.logic_variables[]` resolved by the runner |
| db seam | the aggregate SELECT on the pool | `:53-60` | `ctx.pool` read, declared in `inputs.reads` (ASSERT form, assert_data_bounds precedent) |
| network seam | none | — | — |
| argv/env seam | none (no `--full`; `supports_full: false`) | — | — |

### 5.1 Risk class
| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| Boundary day moves (ACF-D7) | certain at exactly 45 / 135 rounded days | low — one day later WARN/FAIL | declared deviation, R-DC precedent; draft ruling W4A-R2 |
| Variable rename breaks a run (ACF-D2) | low | medium — config refused | migration 270 copies values; PRE at night P3 runs on the ① tree BEFORE 270 is applied |
| R-DW changes the touch | low | high — the metric reads a different column meaning | runner lane keeps `last_seen_at` for every fed key (parity); POST at P4 after the coa root's ② |

## 6. PH-6 — Classification and defect ledger (rows ACF-D1…ACF-D7 in `docs/reports/defect-ledger.md`; prefix ACF, unique — `defectPrefixFor` measured, no override)

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain and `assert_coa_freshness` is outside its scope; no hand-plotted quadrant is substituted.

- **ACF-D1** (`funnel.ts:721`): ">45 days" copied into admin text — ② (pinned D5).
- **ACF-D2** (`:30-36`): `coa_freshness_*` names are outside R-DE (v) — ② migration 270 (pinned D2).
- **ACF-D3** (`:42, :87, :112`): `Date.now()` and the `1000 * 60 * 60 * 24` literal — ② `ctx.clock` + `MS_PER_DAY` (pinned D4).
- **ACF-D4** (`:115`): `last_ingestion` is the UTC date (pinned L7) — declared deviation at ② (draft W4A-R3).
- **ACF-D5** (`:22, :24`): stale SPEC LINKs 41/43 — ② shell header.
- **ACF-D6** (`:85-93`): the NULL-measure branch reads PASS; unreachable live — ② retired.
- **ACF-D7** (`:92-93`): exclusive ceilings (pinned L4) — ② inclusive `ceiling_max` deviation (draft W4A-R2).

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition |
|---|---|---|
| 45 (warn days) | seed `coa_freshness_warn_days` | `assert_coa_freshness_warn_max_days` 45 (migration 270, value copied) |
| 135 (fail days) | seed `coa_freshness_fail_days` | `assert_coa_freshness_fail_max_days` 135 (migration 270) |
| `1000 * 60 * 60 * 24` | `:87` | `MS_PER_DAY` (`scripts/lib/units.js`, a duration definition; load_centreline precedent) |
| 108 | `:38` | `identity.lock` (not a tunable) |
| `phase: 3`, "Source Freshness" | `:74, :126-127` | `execution`/`identity.display_name` declaration |
| ">45 days" | `funnel.ts:721` | removed (ACF-D1) |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | config via `loadMarketplaceConfigs` `:44` | runner config |
| G4 txn/lock | advisory lock `:41` | runner |
| G5 direct write | none | — |
| G6 clock | `Date.now()` `:42, :87, :112` | `ctx.clock()` |
| G7 compute decides | `>= freshnessFailDays`, `>= freshnessDays` `:92-94` | declared check bounds (the library compares) |
| G9 literal | `1000 * 60 * 60 * 24` `:87` | `MS_PER_DAY` |

**Expected after ②:** 0 findings, no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- **PRE** on the legacy code at the ① tree, before any compute change (trap 7): `coa` chain plus standalone, at night P3, BEFORE migration 270 is applied (the legacy reads the old names).
- **POST** at night P4 after ②. ASSERT writes nothing, so #38 nonzero evidence is the check rows; a forced WARN is not needed (plan §B.4: "no write, so only its checks are captured").

## 10. Red suite (PH-7) — `src/tests/steps/assert_coa_freshness/violations.test.ts`
- **Size:** 20 tests. L1–L13 GREEN today (the legacy oracle). D1–D7 are `it.fails`, RED as named missing artifacts.
- **Red evidence:** `docs/reports/red-evidence/assert_coa_freshness/pre2-artifacts-missing.json` (vitest JSON reporter output, D1–D7 run as plain it calls): 13 pass / 7 fail. D1–D4 fail as ENOENT on the named descriptor/compute; D5 fails on the ">45" text; D6 fails because the report has no generated scorecard; D7 because converted[] does not hold the file. No TS or import error.
- **Oracle harness:** `fixtures/legacy-harness.ts` fakes `../lib/pipeline`, `../lib/config-loader` and `Date.now`; `zod` is real.

| Pins | Behaviour |
|---|---|
| L1–L5 | the one SELECT, rounding, the future clamp, inclusive-exclusive tiers at the defaults, configured tiers |
| L6–L10, L13 | audit rows and order, UTC `last_ingestion`, "none" maxima, summary and emitMeta, the empty-table lane |
| L11–L12 | config refusal before the read, advisory lock 108 |
| D1–D7 | descriptor and shell, renamed variables + retired names, declared checks, compute purity, admin text, scorecard, registry (③) |

## 11. Registry at ① (this commit) and what is owed later
- **Landed:** `converted.json` `pending[]` at stage `red_suite`; census row ASSERT / pending with owner spec 42 (plus the two census fixtures); ACF-D1…D7; ADOPTION `legacy_oracle_excluded`; roadmap regenerated. Under R-DU the pending row does not block (no descriptor file).
- **Owed at ②:** descriptor, compute, notes, shell, migration 270, seeds, logic-variable groups, admin text, scorecard (D6).
- **Owed at ③:** registration (blocked by EP-PIN-D17 under R-EA until the end-of-sources cloud acceptance).

## 12. Operator decisions
- RULED 2026-10-18 (plan recommendations 7, 8, 12, 13, 15): wave 4 = the six coa steps; census ASSERT; legacy defects kept as declared deviations; PREs ride P3, POSTs P4; admin text fixed in this step's own conversion.
- **Draft rulings (id at integration):** W4A-R1 (rename into `<slug>_*` by migration), W4A-R2 (inclusive ceiling), W4A-R3 (`pipeline_timezone` vocabulary gap).

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| ASSERT descriptor + frozen shell (D1) | Spec 122 §5.1; R-BA | assert_data_bounds form | step-validate gates A–K | this report | archetype | red-first D1 | precedent | — |
| Renamed variables (D2) | R-DE (v) | `<slug>_*` | `r-de-vocabulary.logic`, gate A | W4A-R1 | every new step | measured names | one migration | **yes** |
| Two-tier check (D3) | R-AD warn_limit; R-DC | link_neighbourhoods / load_coa_notices form | verdict.js | W4A-R2 | all bounds | L4 pinned | one check | both tiers from config |
| Compute purity (D4) | R-BZ | G-codes | gate E #32 | R-BZ | fleet | red-first | seams only | MS_PER_DAY |
| Admin text (D5) | R-DF, R-DL | no copied bound | D5 lock | rec 15 | every step | measured | one string | **yes** |

## R. Reflection (G9)
### LOW-CONFIDENCE
- Whether the frozen shell's ASSERT path renders the empty-table lane with the same verdict (WARN): the inert INFO row plus the `total_records_present` WARN row should derive WARN, checked at ② by a fake-ctx compute test.
### RECURRING / STANDARD-SHAPING
- `pipeline_timezone` (R-CE) cannot be declared by any NEW step under R-DE (v) without a grandfather entry. Every new step that renders a calendar date hits this (draft W4A-R3).

## A. Measurement log (2026-10-18)
- **A.F-DB** (read-only, one `BEGIN READ ONLY` transaction): the aggregate row, column nullability, RLS flags and policies, `logic_variables` values, `pipeline_runs` latest three.
- **A.F-CODE:** `scripts/quality/assert-coa-freshness.js` @ `bc9e6103`, 140 lines, sha256 `4fa0669067b9b64a…`.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/assert_coa_freshness/`: 20 / 20.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=assert_coa_freshness --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 17/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

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
| G6 | 3 | 3 | 7 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=1 it-count=31 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=1 lock-it-count=31 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | assert_coa_freshness | PASS | min_migration=261 <= migrations count=278 |
| 2 | assert_coa_freshness | PASS | 2 declared, missing from seeds: none |
| 3 | assert_coa_freshness | PASS | retired=0 overlap-with-declared=none |
| 7 | assert_coa_freshness | PASS | SPEC LINK header present=true |
| 8 | assert_coa_freshness | PASS | G-4: 2 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | assert_coa_freshness | PASS | HB-1: execution.shape=null — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | assert_coa_freshness | PASS | CEIL-1: execution.shape=null — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 578 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 5 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 91 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 30 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 43 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 23 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/30 step(s); write_inventory.by_mode declared by 0/30 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 20.41 s <= 25.3 s; registry-input 25.91 s <= 27.5 s; measured 2026-10-21T21:10:54.484Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 30 step(s) mode_select per archetype; 552 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 30 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 30 step(s); 358 declared-key check(s), 0 violations; 174 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 43 converted/pending step(s) admin-verifiable (4 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 202 take effect at cutover, 19 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 83 · unexplained: 0

### Test suite (item iii)
- 3229/3229 passed (suite success=true)
- harvested: 126 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 1 — **/*.db.test.ts
- skipped (declared but not run): 0
- failing: none

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 2 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 1 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted=null — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=12866B notes=3957B checks=2 rows records_meta=1294B (newest post/ capture) |

**Enforced-green: 12/14** · not-run: 0 · vacuous: 1

