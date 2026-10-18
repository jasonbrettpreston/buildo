# Phase 4 wave 1 — `coa` (scripts/load-coa.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). That means zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, and admin visibility (R-DL).
**Archetype:** INGESTOR. It reads two CKAN DataStore resources and writes two targets: `coa_applications` (an upsert) and `lifecycle_status_history` (ledger rows).
**Commit form: compressed (R-PACE-1)**. Commit ① is this report plus the red suite. Commit ② adds the descriptor, compute, notes, shell and seeds migration. Commit ③ is the cutover. The INGESTOR archetype has more than two full-form members, so compressed is the default (#24).
**Frozen legacy oracle:** `src/tests/steps/coa/fixtures/legacy-load-coa.js.txt`. It is byte-identical to `scripts/load-coa.js` (sha256 `31336a9c9f725955…`), whose last change was `b87f62db`.
**Owner specs:** 42 (`42_chain_coa.md`) and 51 (`51_source_coa.md`), per the script's SPEC LINK header at `load-coa.js:17-18`.
**Target spec:** Spec 51 (`51_source_coa.md`, the source contract; `identity.spec` "51"). **Governing specs:** 122 (step library and conversion process), 124 (policy register, R-BA/R-BZ/R-DF/R-DL/R-DM).
**Chain:** `coa`, position 2 of 16 (`manifest.json` chains.coa: assert_schema, then coa, …).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **`coa_applications`:** a class-B guarded upsert in UNNEST form. It is change-guarded by `WHERE coa_applications.data_hash IS DISTINCT FROM EXCLUDED.data_hash`, with 16 params (15 arrays plus RUN_AT) and `RETURNING (xmax = 0)` (`load-coa.js:292-339`).
  - It runs one `pipeline.withTransaction` per 500-row batch (`:553-563`).
  - Each batch first reads the prior status for the ledger: `SELECT application_number, status FROM coa_applications WHERE application_number = ANY($1)` (`:255-260`).
- **`lifecycle_status_history`:** an 8-column UNNEST INSERT inside the same batch transaction, wrapped in `SAVEPOINT ledger_write` (`:380-414`).
  - On failure it runs `ROLLBACK TO SAVEPOINT`, keeps the upsert, and sets `ledgerErrorCount = 1`, which becomes a WARN row (`:415-426`).
  - The natural key is `(lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC'))`, and ON CONFLICT updates `event_date` only when the new value is non-null and different.
- **`last_seen_at` touch:** a bulk `UPDATE coa_applications SET last_seen_at = $1` on the POOL, outside the batch transaction, in 500-id slices guarded by `IS DISTINCT FROM` (`:571-582`).
  - It is load-bearing: `assert_coa_freshness` reads `MAX(last_seen_at)` (`scripts/quality/assert-coa-freshness.js:12, 59`).
- **`VACUUM ANALYZE coa_applications`:** issued by the loader itself (`:602`).
- **A log-only stats SELECT** with `NOW() - INTERVAL '90 days'` and `decision ILIKE 'approved%'` (`:698-705`).
- **Retraction:** none. Rows that leave the feed are never retired, so `last_seen_at` is the only signal.

### 1.2 Columns written
- **`coa_applications`:** application_number, address, street_num, street_name, street_name_normalized, ward, status, decision, decision_date, hearing_date, description, applicant, sub_type, zoning_designation, data_hash, first_seen_at (insert only), last_seen_at (`:292-332`).
  - `trg_coa_lead_id` (BEFORE INSERT OR UPDATE OF application_number) derives `lead_id`. That is a trigger-maintained column, so it needs a `guards.requires {kind:"trigger"}` (R-BL(iii)).
- **`lifecycle_status_history`:** lead_id, from_status, to_status, decision, decision_date, transitioned_at, detected_by ('load-coa.js'), event_date (`:389-411`).

### 1.3 Audit rows, verdict and `records_meta`
- **Audit table:** phase 2, "CoA Ingestion", 14 rows in this order (`:616-643`):
  - records_fetched, records_mapped, records_skipped;
  - skip_rate (FAIL at ≥ 5 %);
  - records_inserted, records_updated;
  - api_errors (FAIL > 0);
  - avg_latency_ms;
  - schema_mismatch_count (FAIL > 0);
  - max_days_stale (WARN ≥ 45);
  - applicant_names_present (WARN on any);
  - zoning_designation_null (WARN only when every row is null);
  - lifecycle_status_history_inserted;
  - lifecycle_status_history_errors (WARN > 0).
- **Verdict:** the row cascade (`:649-656`).
- **`records_meta`:** duration_ms, api_health (api_errors, avg and max latency), data_health (fetched, mapped, skipped, skip_reasons, records_deduplicated, schema_mismatch_count, max_days_stale) and audit_table (`:659-680`).
- **Exit lanes:**
  - Zero records: a WARN summary whose `status` row reads SKIPPED, followed by emitMeta and a return (`:465-486`).
  - Schema drift: a summary with no audit table, then a throw (`:516-532`).

### 1.4 Source facts (A.F-NET, read-only, 2026-10-17)
| Resource | id | Total | Notes |
|---|---|---|---|
| Active Applications | `51fd09cd-99d6-430a-9d42-c24a937b0cb0` | 2,761 | has `WARD`, has no `FINALDATE` and no `CONTACT_NAME`; HEARING_DATE and APPEAL_EXPIRY_DATE are typed `date` and arrive as `YYYY-MM-DD` |
| Closed Applications since 2017 | `9c97254e-5460-4799-896f-c7823413c81c` | 34,067 | has `WARD_NUMBER`, `FINALDATE` (`YYYY-MM-DDT00:00:00`), and `CONTACT_NAME`/`CONTACT_PHONE`/`CONTACT_EMAIL`, which are not ingested (PII stays out) |

**Incremental mode** (no `--full`) reads only Active (`:38, :450-456`). The script's own header and the admin text say "last 90 days", but the code reads the whole Active resource (see §6, COA-D5).

### 1.5 Live table facts (A.F-DB, read-only)
- **`coa_applications`:** 33,949 rows, 963 with a null `zoning_designation` (2.8 %), and 22 distinct statuses (Closed 30,368, …).
  - `max(hearing_date)` = 2027-10-08, a future date. `Math.max(0, …)` clamps `max_days_stale` to 0 (`:588`), so portal-rot detection is blind while any hearing is scheduled in the future (see §6, COA-D6).
  - n_dead_tup 0; last vacuum 2026-10-16.
- **RLS:** `relrowsecurity = true` on both `coa_applications` and `lifecycle_status_history`, with zero policies. Trap 2 therefore applies: both write targets need `rls_bypass_or_policy` (Spec 124 R-CT).
- **`lifecycle_status_history` has three writers** (by `detected_by`):
  - `classify-lifecycle-phase.js` 341,973;
  - `load-permits.js` 36,006;
  - `load-coa.js` 3,616 (last write 2026-10-16).

  37,814 rows have a `coa:` lead. Converting both roots and `classify_lifecycle_phase` all declare this table, so invalidators are declared by the writer (trap 4), and the natural-key ON CONFLICT is shared, so the forms must match across the three writers.
- **Latest chain runs** (`pipeline_runs.pipeline = 'coa:coa'`): run 1545 on 2026-07-17 fetched 2,875, mapped 2,774, skipped 101 (all missing_app_num), and recorded new 64 / updated 248 in 10.1 s with verdict PASS.
  - The H6 measurements (QUEUE 2026-10-16) were two `--full` runs. Run 1 recorded new 549 / updated 33,392; run 2 updated 0, so the hash is stable. lifecycle_status_history gained 2,144 rows on run 1 and 0 on run 2.
- **Session TimeZone** = UTC on the dev DB. Stored dates match CKAN exactly (checked on 4 closed applications), but see COA-D3.

### 1.6 Consumers (effective ledger, read-only)
- **`coa_applications`:** 19 readers. They are assert_coa_freshness, assert_data_bounds, assert_engine_health, assert_global_coverage, assert_lifecycle_phase_distribution, classify_coa_scope, classify_coa_trades, classify_lifecycle_phase, compute_build_norms, compute_coa_cost_estimates, compute_phase_calibration, compute_trade_forecasts, enrich_coa_zoning, enrich_parcels, link_coa, link_coa_to_parcels, refresh_snapshot and update_tracked_projects, plus 7 `src/` readers.
- **`coa_applications`:** 8 writers.
- **Effect of conversion:** converting `coa` gives every converted reader (enrich_parcels, AGC, ADB, AEH, refresh_snapshot) a new converted producer edge. That also feeds their runtime skip gate (`staleness.js:667-672`; panel RG MAJOR-1). The edge can only make them run more.

### 1.7 Admin visibility (R-DL)
- **Registered today:**
  - `PIPELINE_REGISTRY` (`src/lib/admin/funnel.ts:54`);
  - `STEP_DESCRIPTIONS` (`:657`);
  - `PIPELINE_TABLE_MAP` `coa → coa_applications` (`:954`);
  - `STEP_EXPECTED_RANGES` (`:797-801`);
  - manifest `telemetry_tables: ["coa_applications"]`.
- **Gaps for ②:**
  - `telemetry_tables` lacks `lifecycle_status_history`, a declared write. R-DL requires it to cover every write table.
  - The hand-written `STEP_EXPECTED_RANGES` is wrong in both its text and its numbers. It says "last 90 days" and `records_updated: [0, 50]`, while run 1545 recorded updated 248.
  - Under R-DL plus the operator's 2026-10-17 ruling, a converted step's range badge is derived from its declared check bounds, so the hand entry goes at ③.

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L24 (§10). Each one executes the frozen text.

## 3. Registry target review
- **(a) Files:** `scripts/load-coa.js` becomes the shell. Added: `scripts/load-coa.descriptor.json`, `scripts/load-coa.notes.json`, `scripts/lib/compute/load-coa.js`, plus a seeds migration (next free number at ②).
- **(b) Tables:**
  - `coa_applications`: reads application_number and status; writes the 17 columns in §1.2.
  - `lifecycle_status_history`: writes 8 columns.
- **(c) Consumers:** §1.6.
- **(d) Tests:**
  - `src/tests/steps/coa/violations.test.ts` (this commit).
  - Existing tests that name the loader are listed for the ② sweep: `quality.infra.test.ts`, the admin funnel tests and the chain tests.

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -- scripts/load-coa.js`).

| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Refuse writing on schema drift | `:171-177, :515-532` (`72362c44`, B2.2 UNNEST rewrite carried the CRITICAL_FIELDS gate) | preserved-in-compute (`validateRecord` names the drift) + encoded-as-descriptor-field: `pre_write` check `schema_mismatch_count` `viol == 0` FAIL — the rule written in its `checks[]` why |
| Never ingest PII | `:218` CONTACT_NAME only; Closed carries phone/email (`5ca8e66a`) | encoded-as-descriptor-field: the declared external `fields[]` lists no CONTACT_PHONE / CONTACT_EMAIL; locked by the D-suite |
| Signal the Spec 37 entity build when names reappear | `:626-635` (`5ca8e66a`) | encoded-as-descriptor-field: WARN check `applicant_names_present` `viol == 0` (its why carries the Spec 37 signal) |
| Detect a CKAN rename of ZONING_DESIGNATION | `:636-637` (`b87f62db`) | encoded-as-descriptor-field: WARN check `zoning_designation_null` (all-null form) |
| The ledger failure must not lose the upsert | SAVEPOINT `:380-426` (`dbb5f8f1`, Phase I.1) | preserved-in-runner via R-DM (`outputs.writes[].on_error: "warn_row"`, operator y 2026-10-17); runner SAVEPOINT owed (§11) |
| event_date by status group | `:63-74, :365-367` (`0aff03e7`) | preserved-in-compute (`STATUS_TO_DATE_COLUMN_COA` frozen map; why in notes.json) |
| `last_seen_at` freshness for every seen row | `:565-583` (`8bcbee18`) | preserved-in-runner: a declared second write statement on `coa_applications` (R-BK) under the write seam; why in notes.json |
| Hash the MAPPED fields, never the raw CKAN row | `:224-243` (`8bcbee18`) | preserved-in-compute (`computeHash` over the mapped record; why in notes.json) |
| Log-only stats query | `:698-705` | knowingly-retired (operator decision 5, 2026-10-17) |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| network seam | `fetch` + retry/backoff, page size | `:97-145` | runner acquisition (`acquire.js`, `ckan_datastore` format; precedent load_zoning) with `coa_download_retries` / `coa_download_retry_backoff_ms` / `coa_page_size` logic variables |
| clock seam | `Date.now()` latencies / start / staleness | `:109, :112, :131, :439, :521, :588, :604` | `ctx.clock` (G6); latency is runner telemetry |
| clock seam | `getDbTimestamp` RUN_AT | `:436` | runner run clock |
| argv/env seam | `--full` (`pipeline.isFullMode()`) | `:438, :453` | `execution.invocation` per chain + the runner's mode; Closed is acquired only in full mode |
| db seam | advisory lock 95 | `:432-435` | `identity.lock` 95 (Spec 47 §A.5) |
| db seam | `withTransaction` per batch | `:555` | runner write seam, `execution.batch` = `coa_batch_size` (R-DE (i)) |
| db seam | pre-UPSERT status SELECT | `:255-260` | declared read `coa_applications(application_number, status)` through the ingest lookup seam (operator decision 2) |
| db seam | SAVEPOINT ledger write | `:380-426` | R-DM `on_error: "warn_row"` (runner SAVEPOINT, owed) |
| db seam | `VACUUM ANALYZE` | `:602` | runner maintenance declaration |
| db seam | stats SELECT (log only) | `:698-705` | dropped (operator decision 5) |

### 5.1 Risk class
| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| Session-TimeZone date shift (COA-D3) | medium (cloud TZ unmeasured) | high — every decision/hearing date one day off, feeds link_coa and lifecycle | ② `::date` binding (D6) |
| Secondary-write failure loses the primary (R-DM) | low | high — coa_applications rows lost for a ledger fault | runner SAVEPOINT before ③ |
| Portal-rot measure change (COA-D6) | certain (ruled) | low — one WARN row's value changes | operator-ruled; declared deviation |
| New producer edge widens downstream skip gates (G2) | certain | low — consumers can only run more | watch downstream captures (plan §2) |

## 6. PH-6 — Classification and defect ledger (rows COA-D1…COA-D10 in `docs/reports/defect-ledger.md`; prefix COA, operator y 2026-10-17)

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain and `coa` is outside its scope; no hand-plotted quadrant is substituted.

The rows are defined once, in `docs/reports/defect-ledger.md` (status and closing commit live there); this list is the assessment-side summary.

- **COA-D1** (`:33-35, :99, :590, :620, :626`): 7 tunable literals: BATCH_SIZE 500, MAX_RETRIES 3, RETRY_BASE_MS 2000, page `limit` 10000, the staleness 45 days, the skip-rate 5 %, and the stats 90 days. None of them is seeded — ② seeds migration with byte-identical defaults (R-DF EXTERNALIZED; R-CV form)
- **COA-D2** (`:590` vs `:626`): Portal-rot boundary differs: the log fires at `> 45` while the row WARNs at `>= 45` (pinned L21) — ② one declared check, inclusive `ceiling_max` form (the ADB precedent ruled 2026-10-17)
- **COA-D3** (`:307-308` ($9/$10 `::timestamptz[]` into DATE columns)): The stored date depends on the session TimeZone. It is correct on the UTC dev DB (measured) and off by one day on any non-UTC session. The cloud TimeZone is still unknown (QUEUE PIN 2026-10-17) — ② binds `::date` from the CKAN `YYYY-MM-DD` text (pinned D6)
- **COA-D4** (`:571-582`): The `last_seen_at` touch runs outside the batch transaction on the pool, so an interruption after a batch leaves the touch partial — ② declared second statement under the runner write seam
- **COA-D5** (header `:14`, admin `funnel.ts:798`): "Incremental = last 90 days" is false: the whole Active resource is read — ② notes and the derived admin range
- **COA-D6** (`:588`): `max_days_stale` uses `max(hearing_date)`, and future hearings (max is 2027-10-08) clamp it to 0, so portal rot is undetectable while any future hearing exists — ② measure the newest hearing ≤ the run date. This is a behaviour change, decision 4
- **COA-D7** (`:602`): The loader issues VACUUM itself (G4) — ② runner maintenance declaration
- **COA-D8** (`funnel.ts:797-801`): Hand-written expected ranges are already exceeded (updated 248 > 50) — ③ derived badge (R-DL ruling)
- **COA-D9** (manifest `telemetry_tables`): Missing the declared write `lifecycle_status_history` — ② data entry (R-DL)
- **COA-D10** (`:148`): `fetchAllRecords` `while(true)` has an unreachable trailing `return records` (the loop only exits via `:126` or a throw) — ② removed with the runner acquisition

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Proposed logic variable (seeded = byte-identical) |
|---|---|---|
| 500 | `:33` | `coa_batch_size` |
| 3 | `:34` | `coa_download_retries` |
| 2000 | `:35` | `coa_download_retry_backoff_ms` |
| 10000 | `:99` | `coa_page_size` |
| 45 (days) | `:590, :626` | `coa_max_days_stale_warn` |
| 5 (%) | `:620` | `coa_skip_rate_max_pct` |
| 90 days | `:703` | dropped with the log-only stats query, or `coa_upcoming_window_days` if it is kept as an INFO check |
| 'approved%' | `:701, :703` | a vocabulary constant, not a tunable (it matches the CKAN decision text). It is declared in notes if the query is kept |
| CKAN host and the 2 resource ids | `:25, :28-31, :38` | `inputs.reads.externals[]` url / resource id (G10) |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
This is an estimate. The legacy file is not scanned by gate E, so each code is mapped from the inventory above.

| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | none | — |
| G2 undeclared relation | the stats SELECT and the prior-status SELECT | declared reads |
| G4 DDL/txn | VACUUM `:602`; SAVEPOINT ×3 `:380, :413, :417`; withTransaction `:555`; advisory lock `:435` | runner |
| G5 direct write | INSERT ×2 `:292, :389`; UPDATE `:575` | runner write seam |
| G6 SQL clock | `NOW()` `:703` | dropped, or bound to `ctx.clock` |
| G7 compute decides | `skipRate >= 5` `:620`; `maxDaysStale >= 45` / `> 45` `:590, :626`; `api_errors > 0`; `schema_drift.length > 0`; ledger errors `> 0` | declared checks with `limit_from_config` or `viol == 0` |
| G9 / module const | 4 module consts `:33-35, :432`; function const `limit` `:99` | logic variables (§7) |
| G10 literal url | `:25` | externals |
| G13 swallow | ledger `catch` `:415` (logs and counts, then continues) and the rollback catch `:418` | seam: the error becomes a WARN check row (`ctx.report`). Decision 3 |

**Expected after ②:** 0 findings, with no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- **PRE captures** on the legacy code, before any compute change (trap 7). One per invocation: `coa` chain, plus `--full`, plus standalone. They are taken at fleet night P0 under the DB lock (R-CQ).
- **Nonzero POST evidence (#38):** an R-CZ bracket using `ingestor-forced-cohort.js` (perturb `data_hash` or a mapped column on 200 deterministic rows, which the change guard heals). It is recorded in `docs/reports/golden/coa/recapture.json`, following the parcels and address_points precedent.
- **Network:** CKAN is live. Both resources are under 35 K rows. The `--full` capture takes about 11 s (run 1545 took 10.1 s incrementally).

## 10. Red suite (PH-7) — `src/tests/steps/coa/violations.test.ts`
- **Size:** 32 tests. L1–L24 are GREEN today (the legacy oracle). D1–D8 are `it.fails`, RED as named missing artifacts.
- **Red evidence:** `docs/reports/red-evidence/coa/pre2-artifacts-missing.json`, a vitest JSON run with D1–D8 as plain it(). It recorded 24 pass and 8 fail (re-taken 2026-10-18 after the flips-at titles, fast invariant #5). D1–D6 fail as an ENOENT on the named artifact (descriptor or compute); D7 fails because the report has no generated scorecard yet; D8 fails because converted[] does not hold the file. No failure is a TS or import error.
- **Oracle harness:** `src/tests/steps/coa/fixtures/legacy-harness.ts`. It fakes `./lib/pipeline`, `fetch`, `setTimeout` and `Date.now`. `./lib/address` and `crypto` are the real modules.

| Pins | Behaviour |
|---|---|
| L1–L6 | acquisition: incremental/full resources, pagination, retry backoff, the zero-records lane, the schema-drift lane |
| L7–L10 | mapping, row hash over mapped fields, missing_app_num skip, dedup by the later decision_date |
| L11–L18 | batch txns, the change-guarded upsert, the date binding (COA-D3), RETURNING counts, the ledger row and SAVEPOINT, rollback to WARN, the `last_seen_at` touch on the pool, VACUUM plus the stats query |
| L19–L24 | audit rows and order, skip-rate boundary, the staleness boundary split (COA-D2), applicant and zoning WARNs, emitMeta reads/writes, advisory lock 95 |
| D1–D8 | descriptor, shell, externals, both writes with RLS guards, logic variables, compute purity, `::date` binding, scorecard, registry (③) |

## 11. Registry at ① (landed in this commit) and what is owed later
- **Landed at ①:** `converted.json` `pending[]` holds `scripts/load-coa.js` at stage `red_suite`; the census `coa` row is `INGESTOR / pending` with owner specs 51 and 42 (and the two census fixtures); `DEFECT_PREFIX_OVERRIDES` gains `coa: 'COA'`; COA-D1…COA-D10 are in the defect ledger; the roadmap is regenerated (the system map and target files are unchanged — `coa` is outside the sources-scoped Target Files generator).
- **Tooling:** none. The report uses the existing `batch<N>-p<M>-<K>` name (`batch4-p1-2`), which `step-validate.mjs` `reportFileMatchesSlug` already accepts (integration 2026-10-18: the `p<N>-w<M>` widening was dropped to keep one naming form).
- **Census note:** the ARCH-CENSUS lane (`914136b9`, not on this base) sets the same row to `INGESTOR / C6` (provisional); integration keeps this lane's `pending` batch.
- **Owed at ②:** the scorecard (`step-validate --step=coa --write`, D7 flips).
- **Owed by the runner (scripts/lib/step/**, another lane):** the R-DM SAVEPOINT executor for `on_error: "warn_row"`.

## 12. Operator decisions — RULED 2026-10-17 (all y; QUEUE 2026-10-17)
1. **Defect prefix:** `COA` (`DEFECT_PREFIX_OVERRIDES`, landed at ①).
2. **Pre-UPSERT status read:** through the ingest lookup seam (declared read `coa_applications(application_number, status)`).
3. **Non-fatal secondary write:** R-DM adopted — `on_error: "warn_row"` on the `lifecycle_status_history` write; the runner SAVEPOINT lands after the runner lane.
4. **COA-D6 portal rot:** measured from the newest hearing ON/BEFORE the run date (a ruled behaviour change).
5. **Log-only stats query:** dropped at ②.

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule (file:line) | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| INGESTOR descriptor + frozen shell (D1) | Spec 122 §5.1, Spec 124 R-BA 124:216 | load_zoning form | step-validate gates A–K | this report + R-BA | archetype | red-first D1 | precedent form | — |
| externals for CKAN (D2) | 122a §A26 G10 | load_zoning externals | gate E | — | all INGESTORs | measured ids | yes | url declared |
| RLS guards on both targets (D3) | Spec 124 R-CT | trap 2 | #46 / guards | R-CT | all RLS tables | measured relrowsecurity | one guard each | — |
| 7 literals → logic variables (D4) | Rule 3, R-CV, R-DF EXTERNALIZED | migration 263 form | gate E #32 | seeds migration | — | byte-identical defaults | yes | **yes** |
| compute purity (D5) | R-BZ 124:240 | G-codes | gate E #32 | R-BZ | fleet | red-first | seams only | — |
| `::date` binding (D6, COA-D3) | Rule 1 (declaration = behaviour) | — | D6 lock | defect row | — | measured TimeZone dependency | one cast | — |
| admin derived badge + telemetry table (COA-D8/9) | R-DL (operator 2026-10-17) | derived | R-DL gate | R-DL | every step | measured gaps | data entries | badge reads the step's variable |
| SAVEPOINT secondary write | **no existing rule** | — | — | **R-DM draft** (decision 3) | permits + coa | — | one runner form | — |
| portal-rot measure (COA-D6) | Rule 1 | inclusive ceiling (ADB precedent) | check row | decision 4 | — | measured future max | yes | `coa_max_days_stale_warn` |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **Prior-status read (decision 2):** whether the existing ingest seam can supply prior-row status is unverified. The ② build checks `runIngestPhase` first.
- **Cloud TimeZone:** unknown, so COA-D3's cloud impact is unmeasured. It is read-only once the cloud is reachable.
### RECURRING / STANDARD-SHAPING
- `lifecycle_status_history` has three writers (coa, permits, classify_lifecycle_phase). R-DM and the shared ON CONFLICT form should land once and be reused by all three.

## A. Measurement log (2026-10-17)
- **A.F-DB** (read-only, dev DB, one process):
  - counts, nulls and statuses on `coa_applications`;
  - `pg_class` RLS flags and `pg_policies` (none);
  - `lifecycle_status_history` grouped by `detected_by`;
  - `pipeline_runs` for `coa:coa` (latest 1545, 1495, 1416);
  - indexes and the trigger `trg_coa_lead_id`;
  - `SHOW TimeZone` = UTC;
  - 4 closed applications whose dates equal CKAN exactly.
- **A.F-NET** (read-only): `datastore_search` `limit=2` on Active (total 2,761, field types) and on Closed (total 34,067, fields).
- **A.F-CODE:** `scripts/load-coa.js` @ `b87f62db`, sha256 `31336a9c9f725955…`, 711 lines.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/coa/violations.test.ts`: 32 / 32. The red-evidence run gave 24 pass / 8 fail.
