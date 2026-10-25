# C6-4 — `link_coa` (scripts/link-coa.js) conversion assessment, commit ① (V3-COA package H)

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF): zero purity findings with no ledger allowance (`Spec 132 §core.9 (R-BZ)`), every gate hard from ① (`Spec 132 §x-v3.1 (R-BA)`), the seven admission questions including EXTERNALIZED (`Spec 132 §core.8 (R-CV)`), and admin visibility (`Spec 132 §core.16 (R-DL)`).
**Archetype:** LINK (census row, re-derived at PH-0 per `Spec 132 §core.4 (R-AO)`, §1.7). Five address tiers plus a description-FTS tier from `coa_applications` to `permits` write the link columns `coa_applications.linked_permit_num` / `linked_confidence`, after a cross-ward unlink; three post-link passes then write the permit side (the `last_seen_at` bump and the `linked_coa_application_number` back-ref) and the permit → CoA lat/lng/ward inheritance.
**Commit form: compressed (R-PACE-1)** (`Spec 132 §x-tooling.2 (R-PACE-1)`). Commit ① is this report plus the red suite. Commit ② adds the descriptor, compute, notes and the seeds migration. Commit ③ is the cutover. LINK has four converted members (link_parcels, link_massing, link_neighbourhoods, link_parcel_abutments), so compressed is the default (#24).
**Frozen legacy oracle:** `src/tests/steps/link_coa/fixtures/legacy-link-coa.js.txt`, byte-identical to `scripts/link-coa.js` (923 lines, sha256 `72fc4af8dc67c483…`), whose last change was `9a73771e` (R-JM, 2026-10-22).
**Owner specs:** 42 (`42_chain_coa.md` §6.6.D, §6.6.X, §6.9, §6.11 Phase D R5.1 + R5.6), 41 (`41_chain_permits.md`) and 60 (`60_shared_steps.md` "Link CoA", which names 42 as the authority for the passes), per the SPEC LINK header at `link-coa.js:21-23`.
**Target spec:** Spec 42 (`identity.spec` "42"). **Governing specs:** 122 (step library, §8.1 ladder), 124 / 124a (policy register), read through the generated handbook Spec 132.
**Chains:** `permits` position 19 of 32 (after compute_timing_calibration_v2, before classify_lifecycle_phase) and `coa` position 9 of 16 (after compute_coa_cost_estimates, before classify_lifecycle_phase) — `scripts/manifest.json` chains, measured 2026-10-23. One conversion serves both chains.
**Plan:** `.cursor/v3-c6-plan-2026-10-19.md` wave C6-4; `~/Buildo-scratch/v3coa/COA-V3-GAP.md` row 8 / package H.
**Provenance.** Everything below was read from the tree at `9fd4ca4f` by this lane unless marked *documented* (copied from a cited report, not re-measured). This lane had **no database access**; every live-table number is either documented or listed as a capture need (§9).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **Advisory lock 12 first** (`:39`, `:42`), then `getDbTimestamp` RUN_AT (`:43`), then `loadMarketplaceConfigs` and a zod check of three variables inside the lock (`:44-46`). An invalid set throws with the lock held (pinned L1), unlike link_coa_to_parcels, which validates before its lock.
- **argv/env:** `--dry-run` from `process.argv` (`:51-52`); `PIPELINE_CHAIN` chooses audit phase 4 (coa) or 12 (`:66`, `:887-889`).
- **Unlinked COUNT** on the pool (`:58-61`). **No-work exit** when it is 0: a SKIPPED summary, emitMeta, return (`:64-91`) — before the pre-pass, the back-ref pass and the inheritance (LCOA-D6).
- **Cross-ward pre-pass, one transaction** (`:110-168`): SELECT the (application_number, permit_num) pairs whose CoA ward differs from the linked permit's ward, excluding `linked_confidence != 0.10` (the Tier-1c sentinel, `cea71232`); UPDATE them to NULL; NULL the permit back-ref when no other CoA still points at it (`:151-163`).
- **Five tier UPDATEs, one transaction each** (`runTier`, `:237-266`): `DISTINCT ON (ca2.id)`, newest permit by `COALESCE(issued_date, application_date) DESC NULLS LAST, permit_num DESC`, `permit_type != 'Pre-Permit'`, `RETURNING ca.linked_permit_num` (R-JM). The confidence is a JS number interpolated into the SQL (`linked_confidence = ${confidence}`, `:243`), so the text reads `0.95`, `0.85`, `0.1`, `0.6`, `0.5`.
- **Tier 3** (`:294-408`): a SELECT of unlinked CoAs with a description of 10+ characters (`:294-300`); JS keyword extraction (`:304-313`); batches of 500 (`:316`), each one transaction of `unnest` + `CROSS JOIN LATERAL` FTS with a literal confidence formula (`:336-342`); a failing batch is caught, counted and skipped (`:366-370`).
- **Permit bump, one transaction** (`:443-453`): `UPDATE permits SET last_seen_at = RUN_AT WHERE permit_num = ANY(<linked this run>) AND last_seen_at < NOW() - INTERVAL '1 second' AND lifecycle_phase NOT IN SKIP_PHASES`.
- **Back-ref pass, one transaction** (`:475-528`): CLEAR back-refs with no CoA link at or above the floor, then SET the floored winner (approved first, newest decision, application_number), `IS DISTINCT FROM` guarded.
- **Inheritance, one transaction** (`:580-686`): three pre-counts and one UPDATE of `coa_applications.latitude/longitude/ward` from the newest geocoded permit revision, floored, ward filled only when NULL.
- **Measurement reads on the pool** (`:700-823`): below-floor, eligible, post-mismatch, the DB-stats SELECT (log only), Pre-Permit links, cross-ward links, potential matches.

### 1.2 Columns written
- **`coa_applications`:** `linked_permit_num`, `linked_confidence` (tiers, pre-pass unlink), `latitude`, `longitude`, `ward` (inheritance). No `last_seen_at` since R-JM (pinned L9).
- **`permits`:** `last_seen_at` (bump), `linked_coa_application_number` (back-ref clear/set, pre-pass clear).

### 1.3 Audit rows, verdict and `records_meta`
- **Main path ("Link CoA", phase 12 or 4), 27 rows** in the order pinned by L14 (`:847-884`). Verdict-driving: `effective_match_rate_pct` (FAIL < 50, WARN < 80, literals `:841-844`), `links_to_pre_permits` (FAIL > 0), `tier_3_errors`, `cross_ward_links`, `matches_tier_1c_ward_conflict`, `lead_identity_lat_lng_mismatch_count` (WARN > 0).
- **Verdict:** derived from flags beside the rows (`:885-891`), not from the rows.
- **Summary:** `records_total = records_updated = total linked`, `records_new = 0` (`:911`). Unlinks, back-ref and inheritance writes are not counted.
- **`records_meta`:** duration_ms, 12 counters, audit_table (`:895-910`).
- **emitMeta** (`:915-920`): reads 11 coa_applications and 10 permits columns; writes coa_applications (5) and permits (2). The reads omit `permit_type`, `lifecycle_phase`, `last_seen_at`, `decision`, `linked_coa_application_number` that the statements read (LCOA-D11).
- **Exit lanes:** a contended lock returns before RUN_AT (the SDK emits SKIP); a config failure throws inside the lock.

### 1.4 Live table facts — NOT MEASURED by this lane (no DB access)
- *Documented (Spec 60 "Link CoA", 2026-07-07):* the `linked_confidence` distribution 0.95 = 14,393; 0.85 = 858; 0.60 = 3,272; 0.50 = 3,946; Tier 3 about 10,600; 0.10 = 1,683; unmatched 221; the back-ref floor's orphan delta 339 permits.
- *Documented (link_coa_to_parcels assessment §1.4, 2026-10-18):* `coa_applications` 33,949 rows; RLS enabled with 0 policies; 26,723 parcel-linked CoAs carry link_coa's permit-inherited coordinates.
- *Documented (R-JM, 2026-10-22):* 0 rows stamped by link_coa alone; 0 freshness verdicts flip.
- Everything else (current distribution, NULL-ward counts, RLS on `permits`, run durations) is a capture need (§9, M1–M5).

### 1.5 Consumers (code, read at `9fd4ca4f`)
- **`coa_applications.linked_permit_num` / `linked_confidence`:** classify_lifecycle_phase (`scripts/classify-lifecycle-phase.js:1248`), assert_lifecycle_phase_distribution, refresh_snapshot (`scripts/lib/compute/refresh-snapshot.js`), assert_data_bounds, assert_global_coverage, the app (`src/lib/coa/link-confidence.ts` identity floor 0.85; `src/lib/leads/lead-inspect-query.ts`; `/api/admin/stats`).
- **`permits.linked_coa_application_number`:** classify_lifecycle_phase via `computeIsOrphan` (`scripts/classify-lifecycle-phase.js:1003`, `:1017`; `scripts/lib/orphan-detection.js:54`), the app.
- **`permits.last_seen_at` (the bump):** classify_lifecycle_phase's dirty test `last_seen_at > lifecycle_classified_at` (`scripts/classify-lifecycle-phase.js:955`, `:1006`); close_stale_permits' "not in the latest feed" test `last_seen_at < <last load>` (`scripts/close-stale-permits.js:132`); assert_entity_tracing's 26 h window (`scripts/quality/assert-entity-tracing.js:19`).
- **`coa_applications.latitude/longitude/ward`:** link_coa_to_parcels (co-writer; LCTP-D7 — its ② back-fills only on a link change, so the two never ping-pong), enrich_coa_zoning, refresh_snapshot, the app.
- **Effect of conversion:** a new converted producer edge on `coa_applications` and `permits` for every converted reader's runtime skip gate; it can only make them run more. Package I (classify_lifecycle_phase) depends on this step's ② (gap §3).

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:57`), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:683`), `PIPELINE_TABLE_MAP` (`funnel.ts:880`, `coa_applications`), the funnel case (`funnel.ts:582-598`), `FUNNEL` row (`funnel.ts:53`).
- **Gaps (LCOA-D13):** manifest `telemetry_tables` lists only `coa_applications` (`scripts/manifest.json:31`) though `permits` is written; the hand-written `STEP_EXPECTED_RANGES.link_coa` (`funnel.ts:817-822`) omits `permits` mutations and allows `records_new` 0–50 while the step always emits 0; the match-tier labels are literals (`funnel.ts:589-590`). Under R-DV the descriptor-derived arms wait for ②; the hand-written range retires at ③ (D7).

### 1.7 Archetype re-derivation (R-AO)
The census row (LINK, operator y 2026-10-17, re-derived 2026-10-19) holds: the step writes link columns on both sides with retraction. The 2026-10-19 note "precedent link_parcels, not link_wsib" is corrected for the **runner** precedent only: the closest phase is link_wsib's tier cascade (`execution.shape: "cascade"`, `execution.tiers[]` with `confidence_from_config`, re-derive every run, `set_based_null_retract`, a reverse write on the second table; `scripts/link-wsib.descriptor.json`). The archetype stays LINK (#25 compares the descriptor to this census row); the shape is a ② decision (card Q-H4).

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L17 (§10). Each one executes the frozen text. Defects are pinned in their **legacy** form, so ② changes them knowingly and the differential names them.

## 3. Registry target review
- **(a) Files:** `scripts/link-coa.js` becomes the frozen shell. Added at ②: `scripts/link-coa.descriptor.json`, `scripts/link-coa.notes.json`, `scripts/lib/compute/link-coa.js`, and the seeds migration for the `link_coa_*` variables.
- **(b) Tables:** reads coa_applications and permits; writes coa_applications and permits (§1.2).
- **(c) Consumers:** §1.5.
- **(d) Tests:** `src/tests/steps/link_coa/violations.test.ts` (this commit). Existing tests that name the script, swept at ②: `src/tests/link-coa.infra.test.ts`, `src/tests/link-coa-enrichment.infra.test.ts`, `src/tests/link-coa-backref-extension.infra.test.ts`, `src/tests/link-coa-last-seen.logic.test.ts`, `src/tests/pipeline-advisory-lock.infra.test.ts`, `src/tests/pipeline-logic-vars-coercion.infra.test.ts`, `src/tests/chain.logic.test.ts`, `src/tests/swap-order.logic.test.ts`.

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -S` over `scripts/link-coa.js`).

| Intent | Source | Disposition at ② |
|---|---|---|
| Ward is a booster, not a gatekeeper; the confidence matrix | `:5-17`, `:190-234` (`8254afec`) | preserved-in-compute (the tier predicates as data in `execution.tiers[]`; why in notes.json); the NULL-CoA-ward cell is card Q-H5 |
| Never link a synthetic Pre-Permit | every tier and the FTS lateral (`a25b3cf1`) | encoded-as-descriptor-field (a tier predicate) plus the `links_to_pre_permits` FAIL check (`viol == 0`) |
| Unlink cross-ward drift before relinking; spare the 0.10 Tier-1c sentinel (ping-pong fix) | `:110-168` (`212c92a0`, `cea71232`) | knowingly-retired if Q-H3 is ruled y (re-derive every run makes the pre-pass redundant); else preserved-in-compute with the sentinel read from the Tier-1c variable (why in notes.json) |
| Newest permit wins, deterministic tie-break | `:249`, `:351-355` (`cea71232`) | preserved-in-compute (ORDER BY; why in notes.json) |
| Description FTS as the last tier, keyword rules, ward tiebreak | `:294-408` (`64374bb2`, `cea71232`) | preserved-in-compute (pure keyword function; why in notes.json); the numbers become variables (§7) |
| Survive a bad Tier-3 batch | `:366-370` (`cea71232`) | knowingly-retired: set-based `fail_fast` with the batch key in the error (the LCTP-D4 ruling form; declared deviation, R-BD) |
| Dirty the lifecycle classifier for permits linked this run | `:441-458` (`6f450129`, R-JM `9a73771e`) | encoded-as-deviation pending Q-H1 (`permits.last_seen_at` is load_permits' seen column) |
| Bidirectional link, floored at the inheritance confidence | `:472-535` (`716f4891`, `fb593a9e`) | encoded-as-descriptor-field (a declared reverse write on `permits` with the floor variable) |
| Lead-identity continuity: permit lat/lng/ward into the CoA | `:565-751` (`58a0b8ff`) | encoded-as-descriptor-field (a derived secondary write, floored; the post-mismatch WARN becomes a check) |
| Grade only achievable matches (effective rate) | `:808-844` (`50164c77`) | encoded-as-descriptor-field: a check with `limit_from_config` bands; the street_num comparison aligned (LCOA-D12) |
| Bucket statistics in the log | `:774-785` (`29b2ea84`) | knowingly-retired pending Q-H6 (log-only; refresh_snapshot owns the dashboard buckets) |
| One run at a time | `:39`, `:42` (`0cbbc786`) | encoded-as-descriptor-field (`identity.lock` 12, unique — measured) |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| clock seam | `Date.now()` start and duration | `:53`, `:756` | runner telemetry |
| clock seam | `getDbTimestamp` RUN_AT | `:43` | runner run clock |
| clock seam | wall clock `NOW() - INTERVAL '1 second'` (bump guard), `NOW() - INTERVAL '90 days'` (stats) | `:448`, `:781` | `ctx.clock` / run clock (Spec 132 §core.9) or retired with the statement |
| config (db seam) | `loadMarketplaceConfigs` + zod, inside the lock | `:44-49` | declared `config.logic_variables` (required) |
| db seam | advisory lock 12 | `:42` | `identity.lock` 12 |
| db seam | 9 `withTransaction` envelopes (pre-pass, 5 tiers, bump, back-ref, inheritance) plus one per Tier-3 batch | `:110`, `:239`, `:325`, `:443`, `:475`, `:580` | runner `txn_scope` |
| db seam | tier UPDATEs, FTS UPDATE, unlink, bump, back-ref, inheritance | §1.1 | runner write seam; compute authors set statements only |
| db seam | 8 measurement SELECTs on the pool (the unlinked COUNT and seven post-run reads) | `:58`, `:700-823` | declared `checks[].reads` |
| argv/env seam | `--dry-run` (`process.argv`); `PIPELINE_CHAIN` picks the audit phase | `:51-52`, `:66`, `:887` | `override.dry_run` + manifest `supports_dry_run` agree (Spec 132 §core.18); `execution.invocation` per chain (the link_wsib form) |
| network seam | none (no fetch; all inputs are DB tables) | — | none |

### 5.1 Risk class
| Risk | Chance | Impact | Mitigation |
|---|---|---|---|
| Re-derive every run (Q-H3) moves links that write-once kept stale | certain once ruled | high: identity reads (`>= 0.85`) and orphan status change for the moved rows | PRE/POST differential with explained diffs; before-image on moves (`Spec 132 §core.13`) |
| Tier-3 FTS over every CoA each run (if Q-H3 covers Tier 3) | likely | medium: run time (about 10,600 FTS rows documented) | keep Tier 3 on unlinked-only (recommended in Q-H3); measure M3 first |
| The bump decision (Q-H1) changes what classify_lifecycle_phase sees as dirty | certain if the bump is dropped | high: lifecycle phases go stale in the coa chain | keep the bump as a declared deviation until package I pins a link stamp |
| Cross-ward churn on multi-revision permits (LCOA-D5) | unknown (unmeasured) | medium: unlink + relink each run, back-ref and bump churn | measure M2 before ②; re-derive removes the pre-pass |
| A runner arm for the cascade moves link_wsib's capture fingerprints (Q-H4) | certain for a library edit | medium: a recapture night for link_wsib | bundle with a RE-FREEZE night; link_wsib byte-identical by test |

## 6. PH-6 — Classification and defect ledger (rows LCOA-D1…LCOA-D14 in `docs/reports/defect-ledger.md`; prefix LCOA by the declared override, because the initials `LC` collide with the converted load_centreline's `LC-D*`, fast invariant #42)

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because `docs/reports/generated/122-churn-complexity.md` covers only the sources chain; no hand-plotted quadrant is substituted.

The rows are defined once, in `docs/reports/defect-ledger.md`; this is the assessment-side summary.
- **LCOA-D1** (`:243`, `:269-285`, `:336-342`, `:119`, `:131`, `:176`, `:804`): tier confidences and the Tier-3 formula are code literals; 0.10 doubles as the Tier-1c sentinel in four statements — ② `link_coa_*` variables, the sentinel read from the Tier-1c variable.
- **LCOA-D2** (`:44-48`, `:774-785`): `coa_match_conf_high` / `coa_match_conf_medium` reach only a log-only SELECT — ② decided by Q-H6.
- **LCOA-D3** (`:196-234`, `:297`): write-once eligibility; a link never improves when a better permit arrives — ② Q-H3.
- **LCOA-D4** (`:201-234`): a NULL-ward CoA is never address-linked to a permit with a ward (pinned L4) — Q-H5, measure M1.
- **LCOA-D5** (`:113-132`): the cross-ward test joins every revision of the linked permit_num, so a link made through a matching revision can be unlinked and relinked each run — measure M2.
- **LCOA-D6** (`:64-91`): zero unlinked skips the pre-pass, back-ref refresh and inheritance (pinned L5) — ② every pass runs every run.
- **LCOA-D7** (`:366-370`): a failing Tier-3 batch is swallowed (G13, pinned L8) — ② `fail_fast`, declared deviation.
- **LCOA-D8** (`:445-449`, `:430`): the `permits.last_seen_at` bump writes load_permits' seen column on a wall-clock guard; a permit whose back-ref changed is not bumped; the comment names P1/P2 but the SQL excludes only P19, P20, O1–O3 — Q-H1.
- **LCOA-D9** (`:53`, `:448`, `:756`, `:781`): wall and process clocks — ② runner clock.
- **LCOA-D10** (`:51-52`, `:66`, `:887-889`; `manifest.json:31`): `--dry-run` honoured while the manifest says `supports_dry_run: false`; the audit phase depends on `PIPELINE_CHAIN` — ② `override.dry_run` and one audit table (LCTP-D8 precedent).
- **LCOA-D11** (`:916-919`; `manifest.json:31`): declared reads omit five read columns; telemetry omits `permits` — ② `inputs.reads` traced by #44.
- **LCOA-D12** (`:815-816` vs `:191`; `:841-844`): the potential-match denominator compares street_num raw while the tiers compare `UPPER(TRIM())`; the 50 / 80 bands are literals — ② one normalisation, bands as variables.
- **LCOA-D13** (`src/lib/admin/funnel.ts:817-822`, `:589-590`): the hand-written admin range and labels disagree with the step — ③ derived (R-DL).
- **LCOA-D14** (`:885-891`): the verdict comes from flags, not rows — ② the library derives it from the check rows (`Spec 132 §core.6`).

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition (names drafted, seeded at ②) |
|---|---|---|
| 0.95 / 0.85 / 0.10 / 0.60 / 0.50 tier confidences | `:269-285` | `link_coa_tier_1a_confidence` … `link_coa_tier_2b_confidence` (`execution.tiers[].confidence_from_config`, the link_wsib form) |
| Tier-3 bands 0.50 / 0.30 / 0.40 / 0.25, slope 0.1, conflict 0.10 | `:336-342` | `link_coa_tier_3_*` variables (the two caps, the two floors and the slope); the 0.10 conflict value is drafted to reuse the Tier-1c variable |
| keyword rules 3 / 8 / 2 and the 10-character description floor | `:298`, `:309-311` | `link_coa_tier_3_min_word_chars`, `_max_keywords`, `_min_keywords`, `_min_description_chars` |
| 500 Tier-3 batch | `:316` | `execution.batch` (runner) or retired with a set-based FTS statement (decided at ②) |
| 50 / 80 effective-rate bands | `:841-844` | `link_coa_effective_match_rate_fail_pct`, `_warn_pct` |
| 1 second bump guard | `:448` | retired with Q-H1 option A (the run clock makes it redundant) or `link_coa_bump_min_interval_s` |
| 90 days "upcoming" window | `:781` | retired with the log-only SELECT (Q-H6) |
| `coa_inherit_from_permit_min_confidence` | `:36` | already a variable (unchanged; shared name is in `SHARED_LOGIC_VARIABLES` or renamed by migration, `Spec 132 §core.8`) |
| 12 (lock) | `:39` | `identity.lock` |
| `('P19','P20','O1','O2','O3')` | `lifecycle-phase.js:943` | a vocabulary constant from the shared module; declared in notes |

## 8. Purity estimate (gate E codes G0–G13)
This is an estimate. The legacy file is not scanned by gate E, so each code is mapped from the inventory above.

| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | none (config through the loader) | — |
| G2 undeclared relation | none beyond coa_applications and permits | declared reads |
| G4 DDL/txn | `withTransaction` ×6 sites; advisory lock `:42` | runner |
| G5 direct write | UPDATE ×8 statement sites (§1.1; the tier site runs five times) | runner write seam |
| G6 clock | `Date.now()` `:53`, `:756`; SQL `NOW()` `:448`, `:781` | runner clock |
| G7 compute decides | `effectiveRate < 50 / < 80` `:841-844`; flags `:885-886`; `crossWardCleaned > 0` `:852` | declared checks (`limit_from_config` / `viol == 0`) |
| G9 module const | `ADVISORY_LOCK_ID`, `BATCH_SIZE` | identity.lock; runner batch |
| G13 swallow | the Tier-3 catch `:366-370`, the dry-run catch `:400-402` | retired with `fail_fast` |

**Expected after ②:** 0 findings, with no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens, forced-change proof and capture needs — NOT YET CAPTURED (no DB in this lane)
- **PRE captures** on the legacy code before any compute change (trap 7), under the DB lock: three invocations, as `step-validate --step=link_coa --fast` lists them (`permits::`, `coa::`, `none::` — the two chain slots and the standalone run).
- **Nonzero POST evidence (#38):** a bracket that NULLs `linked_permit_num` on a deterministic CoA cohort (write-once today, so a plain POST links nothing) — `Spec 132 §x-captures.2 (R-DP)`.
- **Read-only measurements owed before ② (M1–M5):** M1 NULL-ward CoAs with a same-address permit that has a ward (LCOA-D4); M2 the `records_meta.cross_ward_cleaned` history of `permits:link_coa` and `coa:link_coa` (LCOA-D5); M3 the cost of the tier derivation and of Tier-3 FTS over all CoAs vs the unlinked set (Q-H3); M4 `relrowsecurity` on `permits`; M5 the current confidence distribution and the latest run durations.

## 10. Red suite (PH-7) — `src/tests/steps/link_coa/violations.test.ts`
- **Size:** 27 tests. L1–L17 are GREEN today (the legacy oracle). D1–D10 are `it.fails`, RED as named missing artifacts or registry states.
- **Red evidence:** `docs/reports/red-evidence/link_coa/pre2-artifacts-missing.json`, a vitest JSON run with D1–D10 as plain it(); 17 pass and 10 fail.
- D1–D6 and D10 fail as an ENOENT on the named descriptor or compute file; D7 fails because the manifest telemetry omits permits; D8 fails because this report has no generated scorecard yet; D9 fails because converted[] does not hold the file. No failure is a TS or import error.
- **Oracle harness:** `src/tests/steps/link_coa/fixtures/legacy-harness.ts` fakes `./lib/pipeline`, `./lib/config-loader`, the pool, `Date.now` and `process` (argv, env); `zod`, `./lib/safe-math` and `./lib/lifecycle-phase` are the real modules.

| Pins | Behaviour |
|---|---|
| L1–L6 | lock before config; literal tier confidences and the log-only variables; write-once eligibility and tier mechanics; the ward matrix; the zero-unlinked exit; the cross-ward pre-pass |
| L7–L11 | Tier-3 keywords, batches and formula; the swallowed batch; the bump (R-JM, wall clock, SKIP_PHASES); the back-ref clear-then-set; the inheritance |
| L12–L17 | the verdict bands; the measurement reads (raw street_num, wall clock); audit rows, phase, summary, meta; dry-run vs manifest; the contended lock; oracle = shipped script |
| D1–D10 | descriptor and shell; mode and invalidators; per-target write discipline and RLS; EXTERNALIZED; purity; the bump disposition; admin; scorecard; registry (③); override honesty |

## 11. Registry at ① (landed in this commit) and what is owed later
- **Landed at ①:** `converted.json` `pending[]` holds `scripts/link-coa.js` at stage `red_suite` (`Spec 132 §x-stages.1 (R-DU)`); the census row is `LINK / pending` with owner specs 42, 41 and 60 (and the two census fixtures); LCOA-D1…D14 in the defect ledger; `DEFECT_PREFIX_OVERRIDES` gains `link_coa: 'LCOA'` (pinned by `step-validate-defect-prefix.logic`); `_witness-guard.ts` ADOPTION adds `link_coa: legacy_oracle_excluded` (19/7/18); the roadmap is regenerated and `conversion-roadmap.infra` re-pinned (pendingBatch 14 → 15, C6 22 → 21, measured).
- **R-DU:** with no descriptor, the row does not block whole-registry selection; the red scorecard is non-gating.
- **Owed at ②:** the descriptor, compute, notes, the seeds migration, the scorecard (`step-validate --step=link_coa --write`, D8 flips); blocked on Q-H4 (runner arm) and the Q-H1 / Q-H3 rulings.
- **Owed at ③:** after the cloud halves (LDG-10, EP-PIN-D17; `Spec 132 §x-v3.1 (R-EY)` condition 8) and every upstream converted (`Spec 132 §x-stages.2 (R-EQ)`).

## 12. Operator questions (drafted rulings — not decided here; build held on the recommended reading)

**Q-H1. The `permits.last_seen_at` bump.** Evidence: `link-coa.js:445-449`; `Spec 132 §ingestor.5 (R-DZ)` (a seen column is the INGESTOR's runner-clock touch); `Spec 132 §core.14 (R-FF)` ("a classifier re-run after its root touches a row is the §6.3 watermark pin, never a new `by:"seen"`"); R-JM (124a:966) removed the CoA-side stamp and said "when converted it records this as a `deviations[]` entry". close_stale_permits reads the same column (`close-stale-permits.js:132`). Recommendation **A**: ② keeps the bump as a declared `deviations[]` entry citing R-JM and R-FF, with the retire condition "classify_lifecycle_phase ② declares a `staleness.pins` row on a link_coa run_at stamp"; the wall-clock guard goes (the run clock makes a re-run a no-op). Option B (a link_coa-owned stamp column now) adds a column and a migration: scope growth, decided with package I. Proposed 124a row: "link_coa's permit bump is a declared deviation until its consumer pins a link stamp (R-FF form); it writes only permits linked or re-linked this run, on the run clock." Five words: standardized (the R-FF form is the end state), observable (`permits_bumped_last_seen_at` stays a row), accurate (no change in what classify sees), scalable (no new column), understandable (one deviation, one retire condition).

**Q-H2. (Informational, no ruling)** The archetype stays LINK (§1.7); the census reason's runner precedent is corrected to link_wsib in this commit.

**Q-H3. Re-derive the links every run (the link_wsib O4 row 6 form).** Evidence: write-once at `:196-234`; link_wsib re-derives every run and writes only the difference (`scripts/link-wsib.descriptor.json` `outputs.invalidates[0].when`); `Spec 132 §link.1` allows `mode_select: "none"` with a `full_rescan` invalidator. Recommendation: y for Tiers 1a–2b (cheap equality joins; the cross-ward pre-pass becomes redundant and retires), and Tier 3 stays write-once over CoAs no address tier links (FTS cost, M3). Five words: standardized (one LINK re-derive form), observable (moves and vanishes count as rows), accurate (a better permit wins; stale links retract), scalable (Tier 3 bounded to the residue), understandable (one rule, one exception with its measured reason).

**Q-H4. ② needs a cascade runner arm (STOP for this lane).** Evidence: `runCascadePhase` is wired to link_wsib's tables — `scripts/lib/step/index.js` selects `w.table === 'wsib_registry'` for the join plan, runs a literal `wsib_registry` / `entities` COUNT and reads `new_entity_id` / `old_entity_id` columns; `runLinkPhase`, `runLinkKeyedPhase` and `runLinkColumnPhase` serve other families (`Spec 132 §link.2`). This lane may not edit `scripts/lib/step/**`. Recommendation: a runner lane generalises `runCascadePhase` to read the target table, key and link columns from the descriptor's write plans (link_wsib stays byte-identical by its locks), on a RE-FREEZE night, because a library edit moves every capture fingerprint checked by #39. Five words: standardized (one cascade arm for two families, as link.2 does for `link`), observable (the same counters), accurate (link_wsib proven unchanged), scalable (later cascades reuse it), understandable (no step-specific branch). Alternative (not recommended): a link_coa-only phase — a fork the A-1 ruling permits only with measured reasons.

**Q-H5. The NULL-CoA-ward cell (LCOA-D4).** Evidence: L4; the header promise at `:5-7`. Recommendation: measure M1 first; ② preserves the legacy matrix unless a ruling adds the cell. No register row until the number exists.

**Q-H6. Retire the log-only bucket SELECT (LCOA-D2).** Evidence: `:774-785` feeds only `log.info`; refresh_snapshot reads the same variables for the dashboard (`logic_variables.json` `coa_match_conf_medium` description). Recommendation: y — link_coa stops reading `coa_match_conf_high` / `coa_match_conf_medium` (no variable is retired; refresh_snapshot still reads them). Five words: standardized (no unreported read), observable (nothing an operator sees disappears), accurate, scalable (one statement fewer), understandable.

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| LINK descriptor + frozen shell (D1) | `Spec 132 §core.1`, §x-stages.2 | link_wsib form | step-validate | this report | archetype LINK | red-first D1 | precedent | — |
| mode + invalidators (D2) | `Spec 132 §link.1` | O4 row 6 | D2 lock + G8 | Q-H3 | every cascade LINK | M3 | one mode | — |
| write discipline + RLS (D3) | `Spec 132 §core.12 (R-CT)` | per-target | #46 | LCOA-D11 | fleet | measured RLS (coa) | one guard per target | — |
| literals → variables (D4) | `Spec 132 §core.8 (R-CV)` | link_wsib tiers | gate E #32 | migration | — | byte-identical values | yes | **yes** |
| compute purity (D5) | `Spec 132 §core.9 (R-BZ)` | G-codes | gate E | R-BZ | fleet | red-first | seams only | — |
| bump disposition (D6) | R-JM, `Spec 132 §core.14 (R-FF)` | deviation form | `permits_bumped_last_seen_at` | Q-H1 | — | unchanged readers | one deviation | — |
| admin (D7) | `Spec 132 §core.16 (R-DL)` | derived | `admin-step-registration.logic` | LCOA-D13 | every step | measured gap | derived | — |
| override honesty (D10) | `Spec 132 §core.18` | manifest = descriptor | D10 lock | LCOA-D10 | fleet | measured mismatch | one flag | — |

## 14. ② plan — the pure-compute boundary and the descriptor draft
The descriptor skeleton is drafted outside the repo (`~/Buildo-scratch/v3coa-h/link-coa.descriptor.draft.json`); it is not committed, because a committed descriptor flips D1 and enters every gate before the runner arm exists (Q-H4).
- **Compute (pure, `scripts/lib/compute/link-coa.js`):** (1) `tier3Keywords(description, config)` — the keyword rule as a pure function, tested with plain strings; (2) `buildDerivationSql(descriptor, config)` — one READ ONLY statement that re-derives each CoA's best link across the declared tiers (Q-H3), returning `id, old_permit, old_conf, new_permit, new_conf`; (3) `buildApplyLinksSql()`, the null-retract, the back-ref clear/set and the inheritance statements as text plus binds; (4) the check values through `ctx.report` (effective rate, Pre-Permit links, cross-ward links, Tier-3 errors, post-mismatch). No clock, no `.query(`, no env, no catch.
- **Runner (Q-H4):** the generalised cascade phase executes the derivation, the before-image of moved/vanished links, the apply, the retract, the reverse writes and the bump, in one step transaction (`execution.txn_scope: "step"`, the link_wsib form), with `execution.invocation` per chain (`permits`, `coa`).
- **Descriptor:** `identity {name: link_coa, archetype: LINK, lock: 12, spec: "42"}`; `execution {shape: cascade, tiers: [1a, 1b, 1c, 2a, 2b, 3] with confidence_from_config}`; `outputs.writes`: coa_applications link (`set_based_join_update`), coa_applications null-retract (`set_based_null_retract`), coa_applications inheritance (derived, floored), permits back-ref (reverse write, floored), permits bump (deviation, Q-H1); `outputs.invalidates`: both link columns, `by: "full_rescan"`; `guards.requires`: `rls_bypass_or_policy` on coa_applications (and permits after M4); `override.dry_run` honoured and the manifest flag flipped to agree.
- **Order:** M1–M5 read-only → PRE captures on the legacy shell (both chains) → Q-H4 runner arm on its own night → ② descriptor + compute at `compute_ported` (legacy shell live) → swap night after every upstream is converted (`Spec 132 §x-stages.2 (R-EQ)`).

## R. Reflection (G9)
### LOW-CONFIDENCE
- **Cross-ward churn (LCOA-D5)** is inferred from the SQL (the join covers every revision), not measured.
- **The NULL-ward cell (LCOA-D4)** may hold zero CoAs in practice; the size is unmeasured.
- **The runner fit (Q-H4)** was read from `runCascadePhase`'s body, not executed against a draft descriptor.
### RECURRING / STANDARD-SHAPING
- A LINK whose confidence doubles as a tier marker (0.10) needs the marker read from the same variable, or a tier column; the first option keeps the schema unchanged.
- A step that bumps another root's seen column (link_coa here, classify_permit_phase and classify_inspection_status per C6 plan F1) is one family; Q-H1's answer should serve all three.

## A. Measurement log (2026-10-23)
- **A.F-CODE:** `scripts/link-coa.js` @ `9a73771e`, sha256 `72fc4af8dc67c483…`, 923 lines; `scripts/lib/lifecycle-phase.js:943`; `scripts/manifest.json:31`, chains; `src/lib/admin/funnel.ts:53`, `:582-598`, `:683`, `:817-822`, `:880`; `src/components/FreshnessTimeline.tsx:57`; `scripts/lib/step/index.js` `runCascadePhase`; `scripts/link-wsib.descriptor.json`; consumers in §1.5.
- **A.F-DB:** none (no DB access in this lane; §9 M1–M5).
- **A.F-ORACLE:** `npx vitest run src/tests/steps/link_coa/violations.test.ts`: 27 / 27. The red-evidence run gave 17 pass / 10 fail.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=link_coa --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G1 | 1 | 1 | PH-3 section found=true sha-count=16 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=12 vocab-hit rows=12; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 14 ledger row(s), 0 without CLOSED/PIN () |
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
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 9 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 9 eligible pending slug(s), all either compressed or carry a stated full-form reason |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 639 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 48 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 20.41 s <= 25.3 s; registry-input 25.91 s <= 27.5 s; measured 2026-10-21T21:10:54.484Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 538 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 170 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 48 converted/pending step(s) admin-verifiable (7 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 209 take effect at cutover, 19 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): permits::, coa::, none::
- missing invocations (PRE, GOLD-PRE): permits::, coa::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- 3459/3459 passed (suite success=true)
- harvested: 138 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 1 — **/*.db.test.ts
- skipped (declared but not run): 0
- failing: none

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 4 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
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

