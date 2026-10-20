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

## 14. Commit ② — built at stage compute_ported (2026-10-19)
The legacy shell stays the live writer until ③ (W4A-R6; Spec 124 R-EF, 124:264), the same form as the enrich pair (a9011b83) and assert_coa_freshness (ffec8296).
- **Landed:** `scripts/load-coa.descriptor.json`, `scripts/lib/compute/load-coa.js`, `scripts/load-coa.notes.json`, `migrations/278_coa_logic_variables.sql` + 6 seeds; `src/tests/steps/coa/compute.logic.test.ts` (parity with the oracle). D1–D6 flip to `it`; D1b (frozen shell) and D8 stay `it.fails` until ③.
- **The RE-FREEZE #37 forms this step uses (no library change):**
  - R-DX (iii)/(iv) (124:256): `coa_active` + `coa_closed` are one union group on `coa_applications`; Closed declares `modes: ["full"]` (legacy `:450-456`).
  - R-DY (124:257): `lifecycle_status_history` is a derived target. The runner reads `coa_applications(application_number, status)` per slice inside the primary transaction (operator decision 2); `deriveRows` is pure. The conflict target is probed from `uniq_lifecycle_status_history_natural_key`. R-DY (d): no per-batch transaction form, so `coa_batch_size` is not seeded and D4 asserts it absent.
  - R-DZ (124:258): `last_seen_at` is the written `"seen"` column, touched inside the transaction (closes COA-D4).
  - R-DM (124:246): `on_error: "warn_row"`, liveness = the WARN check `lifecycle_status_history_errors` (`viol == 0`).
- **Admin (R-DL 124:245, R-DW 124:282):** telemetry_tables gains `lifecycle_status_history` (COA-D9); the hand-written `STEP_EXPECTED_RANGES.coa` entry and its grandfather slug leave, since the badge is now the check rows (COA-D8). #51 PASS.
- **Declared deviations:** inclusive `pct <=` / `value_max` bounds (R-DC 124:236 form; the ACF-D7 precedent); COA-D6 portal rot measured from the newest hearing on/before the run date (decision 4); runner retries (2 retries = the legacy 3 attempts, the same 2000/4000 ms waits); one transaction per target (R-DY (d)); `data_health` becomes `coa_load` (R-DE (iv)).
- **Parity (read-only, live CKAN vs the dev DB written by the legacy loader, 2026-10-19; scratchpad parity scripts, no write):**
  - 36,828 records fetched (full mode); 2,876 blank keys (= the legacy missing_app_num, 7.8 %, so a full run reads skip_rate FAIL exactly as the legacy does); 33,952 shaped; 0 schema mismatches; 8 applicant names (applicant_names_present WARN, as legacy); 33,948 deduplicated (4 duplicates).
  - 33,941 of them are in the DB (7 are new since the 2026-10-16 load); 33,881 match every mapped column. The 60 that differ are live CKAN changes since that load (status 43, decision 20, description 16, …).
  - data_hash: 2,628 of 2,674 Active rows identical; the 46 others are those live changes.
  - Closed: 31,253 of 31,270 records equal the legacy hash computed in an America/Toronto process, none the UTC form (COA-D11, measured; the other 17 are live changes). The first converted `--full` re-upserts them once with no ledger row (status unchanged); incremental runs are unaffected.
- **Owed:**
  - W4A-R4 (a): the `outputs.invalidates {coa_applications.scope_classified_at, by:"pin"}` row lands with classify_coa_scope ②'s `staleness.pins {step: coa, stamp: coa_applications.last_seen_at}`. Alone it is `#44 i:unresolved:pin` (R-DO, 124:248).
  - PRE/POST goldens + the R-DY (e) #38 bracket for the derived table (night P4); G8/#30/#31/#38/#40 are stage-gated until then.
  - ③: the frozen shell and the registration.

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

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=coa --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 13/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

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
| G3 | 1 | 2 | table rows=10 vocab-hit rows=9 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 11 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=35 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=2 missing-pre-invocations=2 stale-fingerprints=0 unexplained-diffs=0 — stage-gated (compute_ported) |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=35 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | coa | PASS | min_migration=261 <= migrations count=272 |
| 2 | coa | PASS | 6 declared, missing from seeds: none |
| 3 | coa | PASS | retired=0 overlap-with-declared=none |
| 7 | coa | PASS | SPEC LINK header present=true |
| 8 | coa | PASS | G-4: 6 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | coa | PASS | HB-1: execution.shape="ingest" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | coa | PASS | CEIL-1: execution.shape="ingest" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 497 definition row(s) checked, 101 legal mirror(s), 0 disagreements |
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
- missing invocations (POST): coa::, none::
- missing invocations (PRE, GOLD-PRE): coa::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- SKIPPED or failed to run: --fast: vitest spawn skipped

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | not-run | §5.5 describe not evaluated — vitest did not run (--fast); shape scan is NOT a substitute for the §5.5 suite |
| 3 | Tunables externalized | enforced-green | G-4: 6 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 3 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | 1 when:"pre_write" check(s), 0 order_guarantee violation(s) — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=38260B notes=3051B checks=13 rows records_meta=(no capture) |

**Enforced-green: 12/14** · not-run: 1 · vacuous: 0

