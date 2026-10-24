# C6-1 — `assert_entity_tracing` (scripts/quality/assert-entity-tracing.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). This means the whole six-part package (R-DT):
- zero purity findings, with no ledger allowance (R-BZ);
- every gate hard from ① (R-BA);
- the seven admission questions, including EXTERNALIZED;
- step-owned variable names (R-DE (v));
- admin visibility (R-DL).

**Archetype:** ASSERT. Up to seven SELECTs trace the permits seen in a 26-hour window through five downstream tables or columns. The verdict is row-derived, the step does not halt, and it writes nothing.

**Commit form: compressed (R-PACE-1)**.
- Commit ① is this report plus the red suite.
- Commit ② adds the descriptor, compute, notes, frozen shell, the seeds migration and the admin-map entry.
- Commit ③ is the cutover.
- ASSERT has five converted members (assert_data_bounds, assert_engine_health, assert_global_coverage, assert_parcel_sanity, assert_schema), so compressed is the default (#24).

**Frozen legacy oracle:** `src/tests/steps/assert_entity_tracing/fixtures/legacy-assert-entity-tracing.js.txt`. It is byte-identical to `scripts/quality/assert-entity-tracing.js` (sha256 `93bb535a1ca53c87…`), last changed by `ea3b86ee`.

**Owner spec:** 41 (`41_chain_permits.md`). The header also cites 42 and 43, but the step runs only in `chains.permits` (`scripts/manifest.json`), so those links are stale (AET-D6).

**Target spec:** Spec 41 (`identity.spec` "41"). **Governing specs:**
- 122: the step library and the conversion process.
- 124: the policy register — R-BA, R-BZ, R-DE, R-DF, R-DL, R-DT, R-DU, R-ED.

**Governing plan:** `.cursor/v3-c6-plan-2026-10-19.md`, wave C6-1. The operator answered the C6 questions on 2026-10-19, and the coordinator directed C6-1 to open before wave 4 ③.

**Chain:** `permits`, position 30 of 32.

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Reads, writes and transactions
- **Seven reads** on the pool, each with the one parameter `'26 hours'`:
  - the window count (`:71-76`);
  - the eligible count (`:111-122`);
  - permit_trades (`:129-136`), cost_estimates (`:140-147`) and trade_forecasts (`:165-175`, skipped when eligible = 0);
  - lifecycle_phase (`:180-186`);
  - opportunity_score (`:198-208`).
- **Writes:** none. `emitMeta` writes `{}` (`:288-296`).
- **Transactions:** none. Advisory lock 110 wraps the body, with `{ skipEmit: false }` (`:69`, `:301`).
- **Config:** none. The five coverage floors (`:52-66`), the 26-hour window (`:48`) and the 3-year recency gate (`:120`, `:173`) are code literals (AET-D1, AET-D2).

### 1.2 The measures
- **Four trace rows** (`traceRow`, `:331-349`): coverage = matched / denominator, compared RAW against the floor, inclusive (pinned L6). The value is rounded to one decimal.
  - The denominator is the window count for permit_trades, cost_estimates and lifecycle_phase.
  - It is the eligible count for trade_forecasts. That count mirrors compute-trade-forecasts' SOURCE_SQL by hand (AET-D9).
- **opportunity_score** (`:209-258`): coverage of forecast rows with a score > 0, among non-expired rows.
  - It decides on the ROUNDED percent (the 2026-08-03 fold, pinned L7).
  - Below 80 %, the accepted-baseline helper turns the row into WARN and appends two rows.
  - The helper has no floor, so the FAIL branch is unreachable (AET-D3, pinned L9).

### 1.3 Audit rows, verdict, `records_meta` and exit lanes
- **Audit table:** phase 26, "Assert Entity Tracing". It has five coverage rows in order, plus the two acceptance rows when they fire.
- **Verdict:** row-derived, FAIL > WARN > PASS (`:264-266`). A FAIL logs at warn and does NOT throw (`:268-270`, `:298-300`).
- **`records_meta`:** `{window, eligible_permits, audit_table}`. The summary is `records_total` = window count, `records_new 0`, `records_updated 0` (`:272-286`).
- **Empty window:** a skipped summary `{skipped, reason no_permits_in_window, window}` and `emitMeta({}, {})`, then return (`:79-92`).
- **Lock not acquired:** an info log and a skipped summary `{reason lock_held, advisory_lock_id 110}` (`:303-319`, AET-D8).

### 1.4 Live facts (A.F-DB, read-only, 2026-10-19)
- `permits`: 254,082 rows. `MAX(last_seen_at)` is 2026-08-01 01:46 UTC, so the 26-hour window holds **0** permits today and a run takes the empty-window lane.
- Latest runs (`pipeline_runs.pipeline = 'permits:assert_entity_tracing'`):
  - **1591** (2026-07-17), 1540 (07-10) and 1461 (07-07) are all `completed` with verdict FAIL.
  - Run 1591: window 211,289; permit_trades 98.3; cost_estimates 99.9; trade_forecasts 90.1 of 165,111 eligible; lifecycle_phase 99.5; opportunity_score 80.0 FAIL. That FAIL predates the 2026-08-03 rounded-operand fold.
- **RLS** is enabled (0 policies) on all four read tables. The step only reads, so R-CT (write targets) does not apply.

### 1.5 Consumers
None. No step reads this step's output. Its audit row is read by the admin surface (`pipeline_runs`) and by check-chain-verdict.

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:102`) and `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:723`). Neither copies a number.
- **Gap (AET-D5):** `PIPELINE_TABLE_MAP` (`funnel.ts:878`) has no `assert_entity_tracing` entry. Every other converted ASSERT maps to `pipeline_runs`; ② adds it (pinned D5).

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L12 (§10). Each executes the frozen text.

## 3. Registry target review
- **(a) Files:**
  - `scripts/quality/assert-entity-tracing.js` becomes the frozen shell.
  - Added at ②: `scripts/quality/assert-entity-tracing.descriptor.json`, `scripts/quality/assert-entity-tracing.notes.json`, `scripts/lib/compute/assert-entity-tracing.js`, and a seeds migration for the step-owned variables.
- **(b) Tables:**
  - **Reads:** `permits(permit_num, revision_num, last_seen_at, lifecycle_phase, phase_started_at, issued_date, application_date)`, `permit_trades(permit_num, revision_num, is_active)`, `cost_estimates(permit_num, revision_num)`, `trade_forecasts(permit_num, revision_num, opportunity_score, urgency)`.
  - **Gap:** the legacy emitMeta omits phase_started_at, issued_date, application_date, is_active and urgency (Rule 1, AET-D7).
  - **Writes:** none.
- **(c) Consumers:** none (§1.5).
- **(d) Tests:**
  - `src/tests/steps/assert_entity_tracing/violations.test.ts` lands in this commit.
  - For the ② sweep: `src/tests/assert-entity-tracing.infra.test.ts` and `src/tests/accepted-baseline.logic.test.ts` (the opportunity_score acceptance), plus `src/tests/chain.logic.test.ts` and `src/tests/pipeline-advisory-lock.infra.test.ts`.

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -S … -- scripts/quality/assert-entity-tracing.js`).

| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Trace new permits through five downstream products, 26-hour window | `:5-13, :48` (`03fcb569`, WF2 wiring) | preserved-in-compute (the seven SELECTs; why in notes.json); the window becomes a variable (AET-D2) |
| Non-halting on business FAIL | `:14-16, :298-300` (`03fcb569`) | encoded-as-descriptor-field: every coverage check non-blocking (`blocking: false`) |
| Eligible denominator for trade_forecasts | `:94-122` (`9cd863aa`, WF3) | preserved-in-compute; the SOURCE_SQL mirror is named in notes.json (AET-D9) |
| 3-year recency gate and expired-row filter | `:103-110, :120, :206` (`7a2b8c65`, `f9fac197`) | preserved-in-compute; the 3 years becomes a variable (AET-D2); why in notes.json |
| trade_forecasts floor restored to 0.85 | `:55-63` (`173f0d1e`, WF2 P6.5) | encoded-as-descriptor-field: the floor from config (AET-D1) |
| Row-derived verdict and accepted baseline for opportunity_score | `:213-266` (`1a2d586d`) | encoded-as-descriptor-field: an `accept_until` on the declared check, with a floor (AET-D3) |
| Decide on the rounded operand | `:227-234` (`ea3b86ee`) | preserved-in-validator: the check bound compares the reported value |
| Advisory lock | `:39-42` (`03fcb569`) | preserved-in-runner: `identity.lock` 110 |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| db seam | advisory lock 110 with `skipEmit: false` | `:69, :301` | `identity.lock` 110; the lock-held lane is the runner's `lock_held_elsewhere` terminal (R-DE (iii)) |
| db seam | seven pool SELECTs | `:71-208` | `ctx.pool` reads, declared in `inputs.reads` (ASSERT form, assert_global_coverage precedent) |
| clock seam | `NOW() - $1::interval` and `NOW() - INTERVAL '3 years'` in SQL | `:74, :117, :120, :134, :145, :170, :173, :183, :205` | the run clock passed as a parameter (`ctx.clock()`), never the database clock |
| network seam | none | — | — |
| argv/env seam | none (no `--full`; `supports_full: false`) | — | — |

### 5.1 Risk class
| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| Opportunity floor gains a real FAIL (AET-D3) | certain once the floor is declared | medium: a collapse that read WARN will read FAIL | declared `accept_until` with a floor; the operator rules the floor at ② (draft question Q-AET-1) |
| Clock seam moves the window edge | low | low: the boundary moves by the gap between run start and query time | the PRE and POST use the same frozen clock |
| Empty window on a stale estate | certain today (0 permits in 26 h) | low: the PRE captures the skip lane only | the PRE rides a fresh permits-chain night (§9) |

## 6. PH-6 — Classification and defect ledger
The rows are AET-D1…AET-D9 in `docs/reports/defect-ledger.md`. The prefix AET is unique: `defectPrefixFor` was measured, and no override is needed.

PH-2 (churn × complexity) is ASSESSMENT-INCOMPLETE, because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain, and `assert_entity_tracing` is outside its scope. No hand-plotted quadrant is substituted.

- **AET-D1** (`:52-66`): The five coverage floors are code literals (R-DF EXTERNALIZED). → ② moves them into step-owned variables (pinned D2).
- **AET-D2** (`:48, :120, :173`): The 26-hour window and the 3-year gate are code literals. → ② moves them into variables (pinned D2).
- **AET-D3** (`:221-239`): The accepted baseline has no floor. 0 % scored reads WARN, so the FAIL branch is unreachable (pinned L9). → ② makes it a declared `accept_until` with a floor (pinned D3).
- **AET-D4** (§5): Database-clock reads in SQL. → ② passes the run clock (pinned D4).
- **AET-D5** (`funnel.ts:878`): `PIPELINE_TABLE_MAP` has no entry (R-DL). → ② adds it (pinned D5).
- **AET-D6** (`:29-31`): Stale SPEC LINKs 42 and 43. → ② shell header cites 41.
- **AET-D7** (`:288-296`): emitMeta omits five read columns (Rule 1). → ② `inputs.reads` lists every column the SQL touches.
- **AET-D8** (`:303-319`): The lock-held lane emits a skipped summary itself. → ② moves it to the runner terminal `lock_held_elsewhere` (R-DE (iii)).
- **AET-D9** (`:94-122`): The eligible denominator hand-mirrors compute-trade-forecasts' SOURCE_SQL, so the two can drift. → ② names it in notes.json; PIN until compute_trade_forecasts converts (C6-4) and can share the predicate.

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition |
|---|---|---|
| 0.95 / 0.90 / 0.85 / 0.95 / 0.80 | `:52-66` | step-owned `assert_entity_tracing_*` variables, seeded at today's values |
| `'26 hours'` | `:48` | a step-owned variable (hours) |
| `'3 years'` | `:120, :173` | a step-owned variable (years), named in notes.json as the SOURCE_SQL mirror |
| 110 | `:42` | `identity.lock` (not a tunable) |
| `phase: 26`, "Assert Entity Tracing" | `:280-281` | `execution` / `identity.display_name` declaration |
| `('P19','P20','O1','O2','O3')` | `SKIP_PHASES_SQL` (`scripts/lib/lifecycle-phase.js:943`) | kept as the shared single source of truth |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G4 txn/lock | advisory lock `:69` | runner |
| G5 direct write | none | — |
| G6 clock | `NOW()` in SQL (§5) | the run clock as a parameter |
| G7 compute decides | `traceRow` status `:333`, `osStatus` `:234`, verdict `:264` | declared check bounds (the library compares and derives the verdict) |
| G9 literal | the floors, window and gate (§7) | config |

**Expected after ②:** 0 findings, no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- **PRE:** on the legacy code at the ① tree, before any compute change (trap 7), in `permits`-chain mode and standalone, under the DB lock on a capture night.
  - Today's estate has 0 permits in the window (§1.4). A PRE taken now would capture only the skip lane.
  - So the PRE rides a night that first runs the permits chain's loader, or it declares a bracket that sets `last_seen_at` on a named cohort, exactly as the wave-4 link_coa_to_parcels bracket did. That choice is made in the night plan, not here.
- **POST:** after ②. ASSERT writes nothing, so the #38 nonzero evidence is the check rows.

## 10. Red suite (PH-7) — `src/tests/steps/assert_entity_tracing/violations.test.ts`
- **Size:** 19 tests.
  - L1–L12 are GREEN today (the legacy oracle).
  - D1–D5 and D7 are `it.fails`, RED as named missing artifacts.
  - D6 is a plain `it`: the scorecard is generated for every registry step (R-R / Rule 13), as at N1.
- Red evidence: docs/reports/red-evidence/assert_entity_tracing/pre2-artifacts-missing.json (vitest JSON reporter output, D1–D7 run as plain it calls): 13 pass / 6 fail.
  - D1–D4 fail as ENOENT on the named descriptor or compute.
  - D5 fails on the missing admin-map entry.
  - D7 fails because converted[] does not hold the file.
  - No TS or import error.
- **Oracle harness:** `fixtures/legacy-harness.ts` fakes `./../lib/pipeline`. `./../lib/lifecycle-phase` and `./../lib/accepted-baseline` are the real modules.

| Pins | Behaviour |
|---|---|
| L1–L4 | the seven SELECTs and their one parameter, the eligible SQL, the empty-window lane, the eligible = 0 SKIP row |
| L5–L10 | the five rows and their shape, the raw inclusive trace compare, the rounded opportunity compare, the acceptance rows, the missing floor, zero forecast rows |
| L11–L12 | non-halting FAIL, summary and emitMeta; lock 110 and the lock-held lane |
| D1–D7 | descriptor and shell, variables, declared checks, compute purity, admin map, scorecard, registry (③) |

## 11. Registry at ① (this commit) and what is owed later
- **Landed:**
  - `converted.json` `pending[]` at stage `red_suite`.
  - The census row moves from C6 to pending, archetype ASSERT, owner spec 41 (plus the two census fixtures).
  - AET-D1…D9.
  - ADOPTION `legacy_oracle_excluded`.
  - The roadmap is regenerated.
  - Under R-DU the pending row does not block (there is no descriptor file).
- **Owed at ②:** descriptor, compute, notes, shell, seeds migration, logic-variable groups, admin map, scorecard refresh.
- **Owed at ③:** registration, blocked by EP-PIN-D17 under R-ED until the end-of-sources cloud acceptance.

## 12. Operator decisions
- **RULED 2026-10-19:** C6 census ASSERT (`.cursor/v3-c6-plan-2026-10-19.md`). C6-1 opens before wave 4 ③ (coordinator; no wave-4 twin, no write).
- **Draft question, decided at ②, not now:**
  - **Q-AET-1:** should the opportunity_score acceptance carry a floor below which it reads FAIL again?
  - **Recommend y.** Use the floor in force when the acceptance was ruled, 79.9 %. An acceptance that can never FAIL hides a collapse (AET-D3).

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| ASSERT descriptor + frozen shell (D1) | Spec 122 §5.1; R-BA | assert_global_coverage form | step-validate gates A–K | this report | archetype | red-first D1 | precedent | — |
| Floors, window and gate as variables (D2) | R-DF; R-DE (v) | `<slug>_*` | gate A | AET-D1, AET-D2 | every new step | measured values | one migration | **yes** |
| Declared coverage checks + acceptance (D3) | R-BA; R-AD accept_until | assert_global_coverage checks[] | verdict.js | AET-D3 | all checks | L5–L10 pinned | one check per row | floors from config |
| Compute purity (D4) | R-BZ | G-codes | gate E #32 | R-BZ | fleet | red-first | seams only | run clock |
| Admin map (D5) | R-DL | every ASSERT → pipeline_runs | D5 lock | AET-D5 | every step | measured | one entry | — |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **The ② floor for the acceptance (Q-AET-1).** Today's behaviour can never FAIL, so any floor is a behaviour change. It is declared at ② as a named deviation, never silently.
- **Whether the eligible predicate should be shared code** with compute_trade_forecasts. That waits for C6-4 (AET-D9).

### RECURRING / STANDARD-SHAPING
- **Producer-side accepted baselines** (`scripts/lib/accepted-baseline.js`) have no floor anywhere they are used. Each converted ASSERT that uses one should declare an `accept_until` with a floor. assert_global_coverage is the other user.

## A. Measurement log (2026-10-19)
- **A.F-DB** (read-only, one `BEGIN READ ONLY` transaction):
  - the permits count and MAX(last_seen_at);
  - the 26-hour window count;
  - `pipeline_runs` latest three and run 1591's audit rows;
  - RLS flags on the four read tables.
- **A.F-CODE:** `scripts/quality/assert-entity-tracing.js` @ `ea3b86ee`, 349 lines, sha256 `93bb535a1ca53c87…`.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/assert_entity_tracing/` — 12 pins green, 6 claims red as expected, D6 green once the scorecard is written.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=assert_entity_tracing --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G1 | 1 | 1 | PH-3 section found=true sha-count=9 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=8 vocab-hit rows=8; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 9 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=22 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=2 missing-pre-invocations=2 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=22 |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 578 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 43 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 20.41 s <= 25.3 s; registry-input 25.91 s <= 27.5 s; measured 2026-10-21T21:10:54.484Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 538 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 170 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 43 converted/pending step(s) admin-verifiable (5 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 5 take effect at cutover, 19 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): permits::, none::
- missing invocations (PRE, GOLD-PRE): permits::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- 3229/3229 passed (suite success=true)
- harvested: 126 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 1 — **/*.db.test.ts
- skipped (declared but not run): 0
- failing: none

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 3 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
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

