# C6-1 — `assert_staleness` (scripts/quality/assert-staleness.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF), the whole six-part package (R-DT):
- zero purity findings, with no ledger allowance (R-BZ);
- every gate hard from ① (R-BA);
- the seven admission questions, including EXTERNALIZED;
- step-owned variable names (R-DE (v));
- admin visibility (R-DL).

**Archetype:** ASSERT. The step runs two SELECTs over permits × permit_inspections: first scrape coverage, then per-permit freshness. A three-tier stale-count gate HALTS on FAIL. That halt is the mig-121 fence, which `4d5df9e7` deliberately kept. The step writes nothing.

**Commit form: compressed (R-PACE-1)**.
- Commit ① is this report plus the red suite.
- Commit ② adds the descriptor, compute, notes, frozen shell, the seeds migration and the admin-text fix.
- Commit ③ is the cutover.
- ASSERT has five converted members, so compressed is the default (#24).

**Frozen legacy oracle:** `src/tests/steps/assert_staleness/fixtures/legacy-assert-staleness.js.txt`. It is byte-identical to `scripts/quality/assert-staleness.js` (sha256 `cc7cdc6af22a645e…`), last changed by `4d5df9e7`.

**Owner spec:** 44 (`44_chain_deep_scrapes.md`). The header also cites Spec 86 §1 (the control panel that tunes the thresholds). The step runs only in `chains.deep_scrapes`.

**Target spec:** Spec 44 (`identity.spec` "44").

**Governing specs:**
- 122: the step library and the conversion process.
- 124: the policy register (R-BA, R-BZ, R-DE, R-DF, R-DL, R-DT, R-DU, R-ED).
- 30 §5.4.1: the per-site halt gate. Under it, this step's halt is the audited-clean fence.

**Governing plan:** `.cursor/v3-c6-plan-2026-10-19.md`, wave C6-1.

**Chain:** `deep_scrapes`, position 7 of 7 (the last step).

**Defect prefix:** **AST**. The initials convention gives `AS`, which is already `assert_schema`'s prefix. `DEFECT_PREFIX_OVERRIDES` gains `assert_staleness: 'AST'`, the documented fix for a #42 collision (the enrich_permits → EPM precedent).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Reads, writes and transactions
- **Two reads on the pool:**
  - **Coverage** (`:66-75`): `COUNT(DISTINCT p.permit_num)` and `COUNT(DISTINCT pi.permit_num)` over permits LEFT JOIN permit_inspections, for `status = 'Inspection'` and the three target permit types (`$1`).
  - **Freshness** (`:106-122`): a CTE groups by permit first, so stages are not counted, then takes `MAX(CURRENT_DATE - last_scraped::date)` and the count of permits last scraped before `NOW() - $2 days`.
- **Writes:** none. `emitMeta` writes `{}` (`:169-172`).
- **Transactions:** none. Advisory lock 106 wraps everything, including the config load (`:44`, `:47-48`).
- **Config:** `loadMarketplaceConfigs` then a Zod schema with five variables (`:28-35`). A refused config throws before any query (pinned L11).

### 1.2 The checks
- **Three INFO counts:** total target, scraped, never scraped (`:86-88`).
- **coverage_pct:** a one-decimal string. It WARNs strictly below `staleness_min_coverage_pct`, and never on a zero target (`:83-97`, pinned L3–L4).
- **max_days_stale:** WARNs strictly above `staleness_max_days_stale` (`:127-137`, pinned L5).
- **stale_over_30d:** 0 PASS; 1..max WARN (inclusive); above max FAIL (`:142-154`, pinned L6). The metric name keeps "30d" whatever `scrape_stale_days` is (AST-D3).
- **`scrape_early_phase_threshold_pct`:** reaches only a console line, "(early phase)", and never a row or the verdict (`:80`, `:102`, pinned L7, AST-D2).

### 1.3 Audit rows, verdict, `records_meta` and exit lanes
- **Audit table:** phase 4, "Staleness Monitor", six rows in order.
- **Verdict:** taken from the `errors`/`warnings` arrays (`:157`, AST-D7).
- **Halting:** a FAIL emits the summary and meta FIRST, then throws "Staleness check failed: …" (`:174`, pinned L9). The halt is the mig-121 documented fence, which `4d5df9e7` deliberately did not convert.
- **`records_meta`:** `{checks_passed, checks_failed, checks_warned, audit_table}`. Summary: `records_total 0`, `records_new null`, `records_updated 0` (`:160-168`).
- **Lock not acquired:** nothing is loaded, read or emitted (`:177`).

### 1.4 Live facts (A.F-DB, read-only, 2026-10-19)
- **`permit_inspections`:** 816 rows. `MAX(scraped_at)` is 2026-07-31.
- **Latest runs** (`deep_scrapes:assert_staleness`):
  - **1608** (2026-08-01): WARN, with the two runner `sys_*` rows appended. Total target 58,983; scraped 65; coverage 0.1 % WARN against `>= 10%`; max days stale 140 WARN against `<= 60 days`; stale_over_30d 59 WARN against `<= 10000`.
  - 938 and 931 (2026-03-15): PASS.
- **`logic_variables`** (the seeds): `scrape_early_phase_threshold_pct` 5, `scrape_stale_days` 30, `staleness_max_stale_over_30d` 10000, `staleness_min_coverage_pct` 10, `staleness_max_days_stale` 60.
- **RLS:** enabled on `permits` and `permit_inspections`. The step only reads them.

### 1.5 Consumers
None. Its audit row is read by the admin surface and by check-chain-verdict. As the last step of the chain, a halt here strands nothing downstream.

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:98`), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:719`) and `PIPELINE_TABLE_MAP` → `pipeline_runs` (`funnel.ts:904`).
- **Gap:** the description says "not scraped within 14 days" (AST-D5). That is a copied number, which R-DF bans, and it is also wrong: the window is `scrape_stale_days` (30). ② removes the number (pinned D5).

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L12 (§10). Each pin executes the frozen text.

## 3. Registry target review
- **(a) Files:**
  - `scripts/quality/assert-staleness.js` becomes the frozen shell.
  - Added at ②: `scripts/quality/assert-staleness.descriptor.json`, `scripts/quality/assert-staleness.notes.json`, `scripts/lib/compute/assert-staleness.js`, and a seeds migration that renames the variables.
- **(b) Tables:**
  - **Reads:** `permits(permit_num, status, permit_type)` and `permit_inspections(permit_num, scraped_at)`. These match the legacy emitMeta.
  - **Writes:** none.
- **(c) Consumers:** none (§1.5).
- **(d) Tests:** `src/tests/steps/assert_staleness/violations.test.ts` lands in this commit. For the ② sweep:
  - `src/tests/assert-staleness.infra.test.ts`
  - `src/tests/migration-121-staleness-thresholds.infra.test.ts` (it pins the old names, so ② amends it with the rename migration)
  - `src/tests/control-panel.logic.test.ts`
  - `src/tests/pipeline-logic-vars-coercion.infra.test.ts`

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -S … -- scripts/quality/assert-staleness.js`).

| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Detect permits the scraper silently abandoned | `:5-6, :66-75` (`7391b016`, the 6-phase audit chain) | preserved-in-compute (the coverage SELECT; why in notes.json) |
| Count permits, not inspection stages | `:104-116` (`0ea34982`) | preserved-in-compute (the CTE; why in notes.json) |
| Scrape window and early-phase threshold as variables | `:29-30` (`f28ff517`, WF3-E6) | encoded-as-descriptor-field: the window from config; the early-phase variable decided at ② (Q-AST-1) |
| Operator-tunable three-tier gate | `:31-34, :139-154` (`3c780e88`, mig 121) | encoded-as-descriptor-field: a two-tier bound from config (FAIL above max, WARN from 1) |
| Halt the chain on FAIL | `:174` (`31c18da0`; kept by `4d5df9e7`) | encoded-as-descriptor-field: the FAIL check `blocking: true` |
| Advisory lock | `:44, :47` (`cc2f5d5d`, Bundle G Wave 6) | preserved-in-runner: `identity.lock` 106 |
| Coerced numeric config | `:29-34` (`145c08f4`) | preserved-in-validator: `config.logic_variables[]` min/max, `on_invalid: fail` |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| db seam | advisory lock 106 | `:44, :47` | `identity.lock` 106 |
| db seam | `loadMarketplaceConfigs` + Zod | `:48-50` | `config.logic_variables[]` resolved by the runner |
| db seam | the two SELECTs on the pool | `:66-122` | `ctx.pool` reads, declared in `inputs.reads` |
| clock seam | `CURRENT_DATE` and `NOW()` inside the freshness SQL | `:118-119` | the run clock passed as a parameter (`ctx.clock()`) |
| network seam | none (the scrape is read from the database) | — | — |
| argv/env seam | none (no `--full`; `supports_full: false`) | — | — |

### 5.1 Risk class
| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| Variable rename breaks a run (AST-D1) | low | high: the chain's last step refuses config and halts | the ② migration copies the values; the PRE runs on the ① tree before it is applied |
| The clock seam moves the day count (AST-D4) | certain at the day boundary | low: one day of drift between `CURRENT_DATE` and the run clock | the PRE and POST use the same frozen clock; a declared deviation if the rounding differs |
| Retiring the early-phase variable (Q-AST-1) | n/a until ruled | none on the verdict (pinned L7) | operator question decided at ② |

## 6. PH-6 — Classification and defect ledger (rows AST-D1…AST-D7 in `docs/reports/defect-ledger.md`; prefix AST via `DEFECT_PREFIX_OVERRIDES`, since `AS` is `assert_schema`'s)

PH-2 (churn × complexity) is ASSESSMENT-INCOMPLETE because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain, and `assert_staleness` is outside its scope. No hand-plotted quadrant is substituted.

- **AST-D1** (`:28-35`): the five variables are named `scrape_*` and `staleness_*`, outside the R-DE (v) `<slug>_<name>` form. Each has one step consumer, this one. Fix at ②: a rename migration (pinned D2).
- **AST-D2** (`:52`, `:80`, `:102`): `scrape_early_phase_threshold_pct` changes only a console line, never a row or the verdict (pinned L7). Fix at ②: operator question Q-AST-1.
- **AST-D3** (`:142-153`): the metric `stale_over_30d` keeps "30d" when `scrape_stale_days` is changed (pinned L6). Fix at ②: the id is kept for admin continuity, and notes.json names the window variable. This is a declared naming deviation.
- **AST-D4** (`:118-119`): `CURRENT_DATE` and `NOW()` are database-clock reads in the SQL (R-BZ clock code). Fix at ②: the run clock is passed as a parameter (pinned D4).
- **AST-D5** (`funnel.ts:719`): the admin text says "14 days", which is neither variable (R-DF EXTERNALIZED). Fix at ②: a summary with no number (pinned D5).
- **AST-D6** (`:37-42`): the three target permit types are a code literal copied from the scraper's `ALL_TARGET_TYPES` (`scripts/aic-orchestrator.py:76`, `scripts/aic-scraper-nodriver.py:79`), so the copies can drift. Fix at ②: notes.json `constants` names the scraper source. One shared source for both languages is a PIN.
- **AST-D7** (`:157`, `:44-158`): the verdict comes from parallel arrays, not the rows (Rule 10), and output goes through `console.*` (R-BZ). Fix at ②: the library derives the verdict, and compute emits nothing.

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition |
|---|---|---|
| 30 (scrape window days) | seed `scrape_stale_days` | `assert_staleness_*` variable, value copied |
| 10000 / 10 / 60 | seeds `staleness_*` | `assert_staleness_*` variables, values copied |
| 5 (early-phase percent) | seed `scrape_early_phase_threshold_pct` | Q-AST-1 |
| the three target permit types | `:38-42` | notes.json `constants`, naming the scraper copy (AST-D6) |
| `'Inspection'` status | `:72, :113` | notes.json `constants` (the scrape-target status) |
| `* 100`, `toFixed(1)` | `:79, :83` | declared unit conversion and display rendering |
| 106 | `:44` | `identity.lock` (not a tunable) |
| `phase: 4`, "Staleness Monitor" | `:166` | `execution` / `identity.display_name` declaration |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | config via `loadMarketplaceConfigs` `:48` | runner config |
| G4 txn/lock | advisory lock `:47` | runner |
| G5 direct write | none | — |
| G6 clock | `CURRENT_DATE`, `NOW()` `:118-119` | the run clock as a parameter |
| G7 compute decides | the tier comparisons `:84, :127, :143-147`; the verdict `:157`; the throw `:174` | declared check bounds; `blocking: true` on the FAIL check (the library halts) |
| G9 literal | the target types, `* 100` | notes.json constants; declared unit conversion |
| G12 output | `console.*` throughout | removed |

**Expected after ②:** 0 findings, no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- **PRE:** taken on the legacy code at the ① tree before any compute change (trap 7), in `deep_scrapes`-chain mode and standalone, on a capture night under the DB lock. It must run BEFORE the ② rename migration, because the legacy code reads the old names.
- **Today's live values read WARN, not FAIL** (§1.4), so the PRE does not halt. A forced FAIL is not needed for an ASSERT, because the check rows are the evidence (the assert_coa_freshness plan §B.4 precedent).
- **POST:** taken at ②.

## 10. Red suite (PH-7) — `src/tests/steps/assert_staleness/violations.test.ts`
- **Size:** 19 tests.
  - L1–L12 are GREEN today (the legacy oracle).
  - D1–D5 and D7 are `it.fails`, RED as named missing artifacts or a named legacy fact.
  - D6 is a plain `it` (R-R / Rule 13).
- Red evidence: docs/reports/red-evidence/assert_staleness/pre2-artifacts-missing.json (vitest JSON reporter output, D1–D7 run as plain it calls): 13 pass / 6 fail.
  - D1–D4 fail as ENOENT on the named descriptor or compute.
  - D5 fails on the "14 days" text.
  - D7 fails because converted[] does not hold the file.
  - No TS or import error.
- **Oracle harness:** `fixtures/legacy-harness.ts` fakes `../lib/pipeline`, `../lib/config-loader` and `console`. `zod` is real.

| Pins | Behaviour |
|---|---|
| L1–L2 | the two SELECTs and their parameters |
| L3–L8 | the six rows; the coverage floor; max days stale; the three stale tiers; the early-phase variable reaching only a log line; absent counts read 0 |
| L9–L12 | the halt after emit; the WARN summary and emitMeta; config refusal; lock 106 |
| D1–D7 | descriptor and shell, renamed variables, declared checks, compute purity, admin text, scorecard, registry (③) |

## 11. Registry at ① (this commit) and what is owed later
- **Landed:**
  - `converted.json` `pending[]` at stage `red_suite`.
  - The census row moves from C6 to pending: ASSERT, owner spec 44 (plus the two census fixtures).
  - `DEFECT_PREFIX_OVERRIDES.assert_staleness = 'AST'`, with its lock test.
  - AST-D1…D7.
  - ADOPTION `legacy_oracle_excluded`.
  - The roadmap is regenerated.
- **Owed at ②:** descriptor, compute, notes, shell, the rename migration, logic-variable groups, admin text, and a scorecard refresh.
- **Owed at ③:** registration. It is blocked by EP-PIN-D17 under R-ED until the end-of-sources cloud acceptance.

## 12. Operator decisions
- **RULED 2026-10-19:**
  - The C6 census is ASSERT (`.cursor/v3-c6-plan-2026-10-19.md`).
  - C6-1 opens before wave 4 ③ (coordinator: no wave-4 twin, no write).
- **Draft question, decided at ② and not now:**
  - **Q-AST-1:** should `scrape_early_phase_threshold_pct` be retired, since it changes no row and no verdict (pinned L7)?
  - **Recommend y.** It would be recorded as `knowingly-retired` in the PH-3 ledger. The alternative keeps a tunable that tunes nothing. The admin control panel (`GlobalConfigCard.tsx`) shows it today, so the retirement also removes it there.

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| ASSERT descriptor + frozen shell (D1) | Spec 122 §5.1; R-BA | assert_parcel_sanity (halting ASSERT) form | step-validate gates A–K | this report | archetype | red-first D1 | precedent | — |
| Renamed variables (D2) | R-DE (v) | `<slug>_*` | `r-de-vocabulary.logic`, gate A | AST-D1 | every new step | measured names | one migration | **yes** |
| Declared checks, blocking FAIL (D3) | R-BA; Spec 30 §5.4.1 | assert_parcel_sanity checks[] | verdict.js | AST-D7 | all checks | L3–L9 pinned | one check per row | bounds from config |
| Compute purity, run clock (D4) | R-BZ | G-codes | gate E #32 | AST-D4 | fleet | red-first | seams only | — |
| Admin text (D5) | R-DF, R-DL | no copied bound | D5 lock | AST-D5 | every step | measured | one string | **yes** |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **Coverage counts `DISTINCT permit_num`, not the permit key (permit_num, revision_num).** permit_inspections is keyed by permit_num, so this matches the scraper's unit. ② keeps it and records the reason in notes.json. It is not changed here.

### RECURRING / STANDARD-SHAPING
- **Initials collisions (#42) will recur as C6 opens.** `assert_staleness` is the third override, after `enrich_permits` and `permits`. Each new pending slug's prefix should be measured before ①, as done here.

## A. Measurement log (2026-10-19)
- **A.F-DB** (read-only, one `BEGIN READ ONLY` transaction):
  - permit_inspections count and MAX(scraped_at);
  - the latest three runs, with run 1608's rows;
  - `logic_variables` values;
  - RLS flags.
- **A.F-CODE:** `scripts/quality/assert-staleness.js` @ `4d5df9e7`, 178 lines, sha256 `cc7cdc6af22a645e…`.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/assert_staleness/`: 12 pins green, 6 claims red as expected, and D6 green once the scorecard is written.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=assert_staleness --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G3 | 2 | 2 | ledger rows=7 vocab-hit rows=7; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 7 ledger row(s), 0 without CLOSED/PIN () |
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
- missing invocations (POST): deep_scrapes::, none::
- missing invocations (PRE, GOLD-PRE): deep_scrapes::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- 3160/3160 passed (suite success=true)
- harvested: 124 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 1 — **/*.db.test.ts
- skipped (declared but not run): 0
- failing: none

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 2 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
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

