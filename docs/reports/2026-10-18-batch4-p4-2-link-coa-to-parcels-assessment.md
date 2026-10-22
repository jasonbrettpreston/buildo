# Phase 4 wave 4 — `link_coa_to_parcels` (scripts/link-coa-to-parcels.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). That means zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, and admin visibility (R-DL).
**Archetype:** LINK. An address-tier cascade from `coa_applications` to `parcels` writes `lead_parcels` (a guarded upsert, plus the coa-scoped ghost DELETE) and back-fills `coa_applications` lat/lng, `neighbourhood_id` and `parcel_linked_at`.
**Commit form: compressed (R-PACE-1)**. Commit ① is this report plus the red suite. Commit ② adds the descriptor, compute, notes and the seeds migration. Commit ③ is the cutover. The LINK archetype has more than two full-form members (link_parcels, link_neighbourhoods, link_massing, link_parcel_abutments), so compressed is the default (#24).
**Frozen legacy oracle:** `src/tests/steps/link_coa_to_parcels/fixtures/legacy-link-coa-to-parcels.js.txt`. It is byte-identical to `scripts/link-coa-to-parcels.js` (sha256 `941860178c1f2216…`), whose last change was `cd714db4`.
**Owner specs:** 42 (`42_chain_coa.md` §6.5 step 9, §6.8, §6.11.1) and 47 (`47_pipeline_script_protocol.md` §R1-R12), per the script's SPEC LINK header at `link-coa-to-parcels.js:34-35`.
**Target spec:** Spec 42 (`identity.spec` "42"). **Governing specs:** 122 (step library and the §8.1 conversion ladder), 124 (policy register: R-W, R-BA, R-BZ, R-DF, R-DL), 122a §A27 (traps).
**Chain:** `coa`, position 4 of 16 (`manifest.json` chains.coa: assert_schema, coa, assert_coa_freshness, then link_coa_to_parcels).
**Plan:** `.cursor/v3-wave4-coa-and-dispatch-2026-10-18.md` §B.2.2. All 15 recommendations were operator-APPROVED on 2026-10-18; question 10 rules the three behaviour changes in §12.

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **Startup (pool, before the lock):** `getDbTimestamp` RUN_AT; `loadMarketplaceConfigs` plus a zod check of three variables (`:196-208`). An invalid set throws before the lock is taken.
- **Advisory lock 4201** (Spec 42 §6.8 Phase D, `:48`, `:210`).
- **Inside the lock, on the pool:** the PostGIS probe (`:213`), the neighbourhood load with geometry (`:221-223`), the Turf build when PostGIS is absent (`:228-245`), the unprocessed COUNT (`:249-252`), and the corpus coverage SELECT (`:157-163`, run once on each path).
- **No-work exit:** when the COUNT is 0, a NO_NEW_WORK summary (audit phase **11**), emitMeta and return (`:262-302`).
- **Pre-pass:** one pool `UPDATE coa_applications SET parcel_linked_at = RUN_AT` for every unstamped CoA with no `street_name_normalized` (`:322-328`), outside any transaction.
- **Main loop:** keyset pages of `pipeline.BATCH_SIZE` (1000) over `parcel_linked_at IS NULL AND lead_id IS NOT NULL AND street_name_normalized IS NOT NULL` (`:341-358`). Each page is one `withTransaction` (`:366`); each row runs inside `SAVEPOINT row_sp` … `RELEASE` (`:370`, `:559`), and a throw rolls back to the savepoint, releases it, logs and counts `per_row_errors` (`:560-569`).
- **Per row, the cascade:** the address-points bridge (`tier1aBridgeSql`, `:394-410`) → the parcels-table exact (`:413-428`) → name-only when `street_num` is blank (`:431-445`).
- **Per matched row, three writes:**
  1. `INSERT INTO lead_parcels … ON CONFLICT (lead_id, parcel_id) DO UPDATE … WHERE match_type/confidence IS DISTINCT FROM` (`:458-470`);
  2. the neighbourhood: PostGIS `ST_Contains` on the parcel centroid (`:476-486`) plus the centroid-outside-polygon probe (`:490-498`), or the Turf/JS path (`:500-523`);
  3. `UPDATE coa_applications SET latitude, longitude, neighbourhood_id, parcel_linked_at` guarded by `IS DISTINCT FROM` on all four (`:532-546`).
- **Per unmatched row:** the marker stamp only (`:551-556`).
- **Ghost cleanup (pool, after the loop):** `DELETE FROM lead_parcels WHERE ctid IN (… lead_id LIKE 'coa:%' AND NOT EXISTS coa_applications … LIMIT 1000)` until a batch deletes 0 (`:585-600`).

### 1.2 Columns written
- **`lead_parcels`:** lead_id, parcel_id, match_type (`address_points_exact` | `tier_1a_exact` | `tier_1b_name_only`), confidence, matched_at (RUN_AT). `matched_at` is outside the guard (it moves only when the row is written).
- **`coa_applications`:** latitude, longitude, neighbourhood_id (NULL when no polygon contains the centroid), parcel_linked_at.

### 1.3 Audit rows, verdict and `records_meta`
- **Main path (phase 42, "CoA Parcel Linking"), 20 rows in this order (`:619-641`):**
  - corpus rows (verdict-driving): coa_corpus_total, coa_corpus_linked_count, coa_corpus_linked_pct (WARN below `100 − coa_unmatched_threshold_pct`), coa_corpus_unlinked_count, coa_corpus_missing_normalized_count (WARN when > 0);
  - slice rows: coa_processed, tier_1a_exact, tier_1a_via_bridge, tier_1a_type_confirmed, tier_1a_type_tolerant, tier_1b_name_only, no_address_data, no_parcel_match;
  - coa_parcels_linked_pct and unmatched_coa_count (WARN above the variable);
  - coa_neighbourhood_coverage_pct (WARN below the **literal 95 %**);
  - coa_geocoded_pct (INFO);
  - centroid_outside_polygon_count (WARN above the **literal 1 %** of matches);
  - ghost_orphans_cleaned (INFO);
  - per_row_errors (WARN when > 0).
- **Verdict:** the row cascade (`:647-649`).
- **Summary:** `records_total = processed`, `records_new = 0`, `records_updated = tier-1a + tier-1b matches` (`:652-655`).
- **`records_meta`:** duration_ms, the corpus fragment, 13 counters, audit_table (`:656-680`).
- **emitMeta:** reads 5 tables (coa_applications, parcels, address_points, parcel_address_points, neighbourhoods); writes lead_parcels (5 cols) and coa_applications (4 cols) (`:688-703`).
- **Exit lanes:** a contended lock returns (the SDK emits SKIP); a config failure throws before the lock.

### 1.4 Live table facts (A.F-DB, read-only, 2026-10-18)
- **`coa_applications`:** 33,949 rows, 0 with a NULL `lead_id`; 549 with `parcel_linked_at IS NULL` (the H6 `--full` coa runs added them after the last link run); 109 with no `street_name_normalized`; 31,319 with a latitude; 29,693 with a neighbourhood.
- **`lead_parcels` `coa:` rows:** 29,627 rows for 29,627 leads (0 leads with two or more rows): 29,542 `address_points_exact`, 85 `tier_1a_exact`, 0 `tier_1b_name_only`.
- **Stamped but unlinked:** 3,773 CoAs carry `parcel_linked_at` and no `lead_parcels` row. Under write-once none of them is ever re-tried (§6, LCTP-D3).
- **The lat/lng co-writer:** 26,723 of the 29,627 parcel-linked CoAs hold coordinates that differ from their parcel's centroid at the shared `numeric(10,7)` scale. `link_coa` writes `coa_applications.latitude/longitude` from the linked permit (`scripts/link-coa.js:660-680`; Spec 42 R5.6 Part A, latitude row "secondary upgrade"). See LCTP-D7.
- **RLS:** `relrowsecurity = true` on `lead_parcels` and `coa_applications`, 0 policies each. Trap 2 applies: both targets need `rls_bypass_or_policy` (R-CT).
- **`lead_parcels` keys:** `lead_parcels_pkey` UNIQUE (lead_id, parcel_id); `idx_lead_parcels_lead`; `idx_lead_parcels_parcel`. No trigger on `lead_parcels` itself; the permit mirror `trg_mirror_permit_parcels_to_lead_parcels` fires on `permit_parcels` (`migrations/144_*.sql:66`) and writes 245,270 `permit:` rows here.
- **PostGIS:** installed (`pg_extension`).
- **Latest runs:** `coa:link_coa_to_parcels` 1547 (2026-07-17) processed 64, matched 59, 4.7 s; 1497 (2026-07-10) processed 5.

### 1.5 Consumers (effective ledger plus code, read-only)
- **`lead_parcels` (coa rows):** enrich_coa_zoning (the dominant-parcel join, `enrich-permits.js` CFG.coa), compute_coa_cost_estimates, assert_global_coverage, refresh_snapshot.
- **`coa_applications.parcel_linked_at`:**
  - **enrich_parcels (converted, V3)** re-enriches a parcel when `ca.parcel_linked_at > COALESCE(p.massing_enriched_at, p.zoning_enriched_at, 'epoch')` (`scripts/lib/compute/enrich-parcels.js:1122-1123`). It reads the marker as "this CoA's link moved at", which is the O4 row 7 stamp-on-change meaning;
  - **assert_global_coverage (converted)** counts `parcel_linked_at IS NOT NULL` as the `coa_step4_parcel_linked_at` coverage population (`scripts/lib/assert-global-coverage-fields.js:123`, `scripts/lib/compute/assert-global-coverage.js:133`).
- **`coa_applications` lat/lng/neighbourhood_id:** link_coa (it reads and upgrades them), refresh_snapshot and the app (`src`).
- **The enrich_parcels pin (Spec 124 R-ES, 2026-10-19):** ② declares `parcel_linked_at` `source:"run_at"`, so #44 (h) owes enrich_parcels a `staleness.pins {step: link_coa_to_parcels, stamp: coa_applications.parcel_linked_at}` row. While this step is at `compute_ported` the legacy shell is the live writer, so step-validate prints `#44 (h) OWED enrich_parcels: h:owed:link_coa_to_parcels.coa_applications.parcel_linked_at` instead of failing. The pin and enrich_parcels' POST recapture land with this step's shell swap to `runner_wired` (R-EQ, night P4), when the line turns into h:undeclared until they do.
- **Effect of conversion:** a new converted producer edge on `coa_applications` and `lead_parcels`. That feeds every converted reader's runtime skip gate (`staleness.js:667-672`); the edge can only make them run more. Night P4 replays them (plan §B.4).

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:58`, group link), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:684`, table lead_parcels), manifest `telemetry_tables: ["lead_parcels", "coa_applications"]` (both declared writes are covered).
- **Gap for ②:** `PIPELINE_TABLE_MAP` has **no** `link_coa_to_parcels` entry (`funnel.ts:953-985`). Under R-DV the descriptor-derived arm waits for ②; ② adds `link_coa_to_parcels: 'lead_parcels'` (#51).

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L18 (§10). Each one executes the frozen text. The three operator-ruled changes are pinned in their **legacy** form (L3, L9/L10, L14), so ② changes them knowingly and the differential names them.

## 3. Registry target review
- **(a) Files:** `scripts/link-coa-to-parcels.js` becomes the frozen shell. Added at ②: `scripts/link-coa-to-parcels.descriptor.json`, `scripts/link-coa-to-parcels.notes.json`, `scripts/lib/compute/link-coa-to-parcels.js`, and the seeds migration (wave-4 lane B numbers 272–273).
- **(b) Tables:** reads coa_applications, parcels, address_points, parcel_address_points, neighbourhoods; writes lead_parcels and coa_applications (§1.2).
- **(c) Consumers:** §1.5.
- **(d) Tests:** `src/tests/steps/link_coa_to_parcels/violations.test.ts` (this commit). Existing tests that name the script, swept at ②: `src/tests/db/link-coa-bridge-street-type.db.test.ts`, `src/tests/address-normalizers.logic.test.ts`, the chain and capture-ledger tests.

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -- scripts/link-coa-to-parcels.js`).

| Intent | Source | Disposition at ② |
|---|---|---|
| Prefer the address-points bridge, fall back to the parcels-table exact, then name-only | `:394-445` (tiers 1a/1b `a07f4af3`; bridge Phase 2e `986409ed`; LP-D9 street type and the `coa-link-sql.js` split `cd714db4`) | preserved-in-compute (the cascade SQL, one statement; `coa-link-sql.js` stays the bridge text; why in notes.json) |
| Never re-derive the lead key | `:456-457` (`ca.lead_id`, R2.v3, `a07f4af3`) | encoded-as-descriptor-field (lead_parcels key = `coa_applications.lead_id`) |
| Isolate a poison row | per-row SAVEPOINT `:363-370`, `:560-569` (R2.v5 fix #11, `a07f4af3`) | **knowingly-retired (RULED)**: set-based `fail_fast` (LCTP-D4) |
| Mark processed so the next run skips the row | `:548-556`, pre-pass `:322-328` (R2.v5 fix #5, `a07f4af3`) | **knowingly-retired (RULED)**: re-check every run; the marker means "link changed at" (LCTP-D3) |
| No `-1` sentinel for a missing neighbourhood | `:528-529` (R2.v5 fix #5, `a07f4af3`) | preserved-in-compute (NULL; why in notes.json) |
| Avoid dead tuples on unchanged rows | `:530`, `:466-467` (IS DISTINCT FROM, `a07f4af3`) | preserved-in-runner (`write_discipline.guard`) |
| Report coverage over the whole entity, not the slice | `:150-187`, `:256-262` (Spec 48, `54eb0f04`) | encoded-as-descriptor-field: checks on the corpus counts, bounds from `coa_unmatched_threshold_pct` |
| Never touch permit-side `lead_parcels` rows | `:575-578` (`LIKE 'coa:%'`, R2.v5 fix #6, `a07f4af3`) | encoded-as-descriptor-field: the write `scope` on every lead_parcels write and retraction (LCTP-D9) |
| Run without PostGIS | Turf path `:228-245`, `:500-523` (`a07f4af3`) | **knowingly-retired (RULED)**: R-W, `guards.requires postgis` (LCTP-D5) |
| Watch L-shaped centroids | `:490-498` (plan-review fix #2, `a07f4af3`) | encoded-as-descriptor-field: a WARN check on `centroid_outside_polygon`, bound `link_coa_to_parcels_centroid_outside_max_pct` |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| clock seam | `Date.now()` start and duration | `:197`, `:607` | runner telemetry (G6) |
| clock seam | `getDbTimestamp` RUN_AT | `:196` | runner run clock |
| config (db seam) | `loadMarketplaceConfigs` + zod; `?? 0.95` / `?? 0.80` | `:194-208` | declared `config.logic_variables` (required; no fallback) |
| db seam | advisory lock 4201 | `:210` | `identity.lock` 4201 |
| db seam | PostGIS probe | `:213` | `guards.requires {kind: "extension", name: "postgis"}` |
| db seam | per-page `withTransaction` + per-row SAVEPOINT | `:366-570` | runner `txn_scope`, set-based `fail_fast` (RULED) |
| db seam | candidate SELECT, COUNT, cascade SELECTs | `:249`, `:341`, `:396`, `:415`, `:433` | declared reads; the cascade is one compute-authored set statement over the eligible set (link_parcels `buildMatchSql` form) |
| db seam | lead_parcels upsert | `:458` | runner write seam, `link_keyed` guarded upsert, scope `lead_id LIKE 'coa:%'` |
| db seam | ghost DELETE loop | `:585-600` | `link_full_retraction` (departed keys + vanished leads), scoped |
| db seam | back-fill UPDATE and marker stamp | `:532`, `:551`, pre-pass `:322` | one `set_based_scoped` statement fired only for CoAs whose link changed (O4 row 7) |
| argv/env seam | none (`supports_full: true` is unused; no argv or env read) | manifest | `supports_full` follows the descriptor |
| network seam | none (no fetch; all inputs are DB tables) | — | none |

### 5.1 Risk class
| Risk | Chance | Impact | Mitigation |
|---|---|---|---|
| lat/lng ping-pong with link_coa (LCTP-D7) | certain if the back-fill is unconditional | high: about 26.7K rows rewritten twice a run, and every coa_applications consumer invalidated | back-fill only on a link change (part of the ruling) |
| assert_global_coverage `coa_step4_parcel_linked_at` falls (no-match CoAs are no longer stamped) | certain for new CoAs | low: an INFO/coverage number moves | declared consumer effect; measured at the P4 replay |
| re-link volume on the first re-check run | unknown until the PRE/POST pair | medium: lead_parcels rows change, enrich_coa_zoning and cost estimates follow | the P4 POST plus the downstream replay (plan §B.4) |
| a poison row now fails the step (fail_fast) | low (0 per_row_errors in runs 1497 and 1547) | medium | declared deviation (R-BD); the error names the row |

## 6. PH-6 — Classification and defect ledger (rows LCTP-D1…LCTP-D10 in `docs/reports/defect-ledger.md`; prefix LCTP from the initials convention, no collision, fast invariant #42)

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because `docs/reports/generated/122-churn-complexity.md` covers only the sources chain; no hand-plotted quadrant is substituted.

The rows are defined once, in `docs/reports/defect-ledger.md`; this is the assessment-side summary.
- **LCTP-D1** (`:207-208`): `?? 0.95` / `?? 0.80` duplicate the seeded tier confidences — ② required config, fallbacks deleted.
- **LCTP-D2** (`:59`, `:637`, `:639`): ghost batch 1000, neighbourhood floor 95 %, centroid ceiling 1 % — ② logic variables (§7).
- **LCTP-D3** (`:251`, `:324`, `:351`): write-once eligibility — ② RULED re-check every run.
- **LCTP-D4** (`:366-570`): per-row SAVEPOINT and swallow — ② RULED set-based `fail_fast`.
- **LCTP-D5** (`:211-245`, `:488-508`; `coa-link-sql.js`): PostGIS/Turf dual path, and the JS path is unreachable — ② RULED retired (R-W).
- **LCTP-D6** (`:458-470`, `:587-595`): no per-lead retraction — ② `link_full_retraction`, scoped.
- **LCTP-D7** (`:532-546`; `link-coa.js:660-680`): the lat/lng co-writer — ② back-fill only on a link change.
- **LCTP-D8** (`:270` vs `:675`): audit phase 11 vs 42 — ② one runner audit table.
- **LCTP-D9** (migration 144 trigger): undeclared co-writer of lead_parcels — ② scope plus co-writer declaration.
- **LCTP-D10** (manifest): `supports_full: true` is dead — ② follows the descriptor.

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition (seeded = byte-identical, migration 272) |
|---|---|---|
| 0.95 / 0.80 | `:207-208` | already seeded (`coa_parcel_conf_tier1a`, `coa_parcel_conf_tier1b`); the fallback is deleted and the variables become required |
| 1000 ghost batch | `:59` | `link_coa_to_parcels_ghost_batch_size` (or retired if `link_full_retraction` runs set-based; decided at ②) |
| 95 % neighbourhood floor | `:637` | `link_coa_to_parcels_neighbourhood_coverage_min_pct` |
| 1 % centroid ceiling | `:639` | `link_coa_to_parcels_centroid_outside_max_pct` |
| `coa_unmatched_threshold_pct` | `:206` | already a variable (unchanged) |
| `pipeline.BATCH_SIZE` 1000 | `:357` | runner `execution.batch` (R-DE (i)); not a step literal |
| 4326 (SRID) | `:479`, `:491` | a protocol constant (EPSG id), category (D) under R-DY; declared in notes |
| `'coa:%'` | `:590` | the lead-id namespace, a vocabulary constant; declared as the write `scope` |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
This is an estimate. The legacy file is not scanned by gate E, so each code is mapped from the inventory above.

| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | none (config through the loader) | — |
| G2 undeclared relation | none beyond the five reads | declared reads |
| G4 DDL/txn | SAVEPOINT ×4 `:370, :559, :566, :567`; withTransaction `:366`; advisory lock `:210` | runner (RULED fail_fast) |
| G5 direct write | INSERT `:458`; UPDATE ×3 `:322, :532, :551`; DELETE `:587` | runner write seam |
| G6 clock | `Date.now()` `:197, :607` | runner telemetry |
| G7 compute decides | `>= 0.95` `:637`; `<= 1` `:639`; `unmatchedPct <=` `:633-634`; `perRowErrors === 0` `:641` | declared checks (`limit_from_config` / `viol == 0`) |
| G9 module const | `ADVISORY_LOCK_ID`, `GHOST_CLEANUP_BATCH_SIZE` | identity.lock; logic variable |
| G13 swallow | the per-row catch `:560-569`; Turf `catch {}` `:240`, `:519` | retired with fail_fast and R-W |

**Expected after ②:** 0 findings, with no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- **PRE capture** on the legacy code, before any compute change (trap 7): the `coa` chain invocation, at night P3 under the DB lock (R-CQ). Because the step is write-once, a plain PRE over today's DB processes only the 549 unstamped CoAs.
- **Nonzero POST evidence (#38):** night P4. Either a bracket that NULLs `parcel_linked_at` on a deterministic `coa:` cohort, or the R-DP delete-and-reinsert on `lead_parcels` (no inbound FK and no DELETE trigger on `lead_parcels`, per the DB). Recorded in `docs/reports/golden/link_coa_to_parcels/recapture.json`.
- **Expected differential:** the three ruled changes are declared diffs in `explained-diffs.json` (re-check volume, the departed-parcel retractions, the unstamped no-match CoAs). Then the downstream replay (enrich_coa_zoning, compute_coa_cost_estimates, link_coa, enrich_parcels, assert_global_coverage, refresh_snapshot).

## 10. Red suite (PH-7) — `src/tests/steps/link_coa_to_parcels/violations.test.ts`
- **Size:** 27 tests. L1–L18 are GREEN today (the legacy oracle). D1–D9 are `it.fails`, RED as named missing artifacts.
- **Red evidence:** `docs/reports/red-evidence/link_coa_to_parcels/pre2-artifacts-missing.json`, a vitest JSON run with D1–D9 as plain it(). It recorded 18 pass and 9 fail. D1–D7 fail as an ENOENT on the named artifact (descriptor, notes or compute); D8 fails because this report has no generated scorecard yet; D9 fails because converted[] does not hold the file. No failure is a TS or import error.
- **Oracle harness:** `src/tests/steps/link_coa_to_parcels/fixtures/legacy-harness.ts`. It fakes `./lib/pipeline`, `./lib/config-loader`, the pool and `Date.now`. `zod`, `./lib/safe-math`, `./lib/address-normalizers`, `./lib/coa-link-sql` and Turf are the real modules.

| Pins | Behaviour |
|---|---|
| L1–L6 | config before lock 4201; the 0.95 / 0.80 fallbacks; write-once eligibility; the NO_NEW_WORK lane (phase 11); the pre-pass; PostGIS probe and neighbourhood load |
| L7–L14 | the tier cascade and its counters; the parsed street type; per-row SAVEPOINT; the poison row; the guarded upsert with no per-lead retraction; the back-fill and the marker stamp; ST_Contains and the centroid probe; the Turf path (and its PostGIS-only bridge SQL) |
| L15–L18 | the ghost sweep; audit rows, order, the literal 95 % / 1 % thresholds, phase 42, summary counts and emitMeta; the contended lock; the oracle equals the shipped legacy file |
| D1–D9 | descriptor and shell; re-check (RULED); scoped writes, retraction and RLS guards; back-fill on link change; SAVEPOINT/Turf retired plus postgis guard (RULED); logic variables; compute purity; scorecard; registry (③) |

## 11. Registry at ① (landed in this commit) and what is owed later
- **Landed at ①:** `converted.json` `pending[]` holds `scripts/link-coa-to-parcels.js` at stage `red_suite`; the census row is `LINK / pending` with owner specs 42 and 47 (and the two census fixtures); LCTP-D1…LCTP-D10 are in the defect ledger; `_witness-guard.ts` ADOPTION adds `link_coa_to_parcels: legacy_oracle_excluded` (counts 19/7/7); the roadmap is regenerated.
- **Defect prefix:** LCTP by the initials convention; no collision, so no `DEFECT_PREFIX_OVERRIDES` entry (fast invariant #42 passes).
- **R-DU:** with no descriptor, the row is selected at pre-commit but does not block (the red scorecard prints, labelled non-blocking).
- **Owed at ②:** the descriptor, compute, notes, the seeds migration, `PIPELINE_TABLE_MAP` (#51), the scorecard (`step-validate --step=link_coa_to_parcels --write`, D8 flips).
- **Owed at ③:** blocked by EP-PIN-D17 under R-EA (plan §B.4) until the end-of-sources cloud acceptance.

## 12. Operator decisions — RULED 2026-10-18 (wave-4 plan question 10, all y)
Drafted ruling text, "operator approved 2026-10-18, id at integration":
1. **Re-check every run (LCTP-D3, LCTP-D6, LCTP-D7).** link_coa_to_parcels adopts link_parcels' O4 row 7: every eligible CoA (`lead_id IS NOT NULL AND street_name_normalized IS NOT NULL`) is re-matched on every run (`staleness.mode_select: "none"`, invalidator `coa_applications.parcel_linked_at` `by: "full_rescan"`). `lead_parcels` is a `link_keyed` guarded upsert plus `link_full_retraction` of departed (lead, parcel) pairs and vanished leads, every statement scoped `lead_id LIKE 'coa:%'`. The `coa_applications` back-fill (lat/lng, `neighbourhood_id`, `parcel_linked_at = RUN_AT`) fires **only for a CoA whose link changed this run**, so link_coa's permit-inherited coordinates (26,723 rows measured) are never rewritten and the marker keeps enrich_parcels' "link moved at" meaning. A never-linked no-match CoA keeps `parcel_linked_at` unset; the 3,773 already-stamped no-match CoAs keep their stamp until their link changes. Declared consumer effect: assert_global_coverage's `coa_step4_parcel_linked_at` population.
2. **Set-based `fail_fast` (LCTP-D4).** Per-row SAVEPOINT isolation is retired; the runner owns the page transaction, and one bad row fails the step with its key in the error. Declared deviation (R-BD); `on_row_error` is descriptive only (`compute-parcel-cost-estimates.js:319-321`).
3. **Turf retired (LCTP-D5).** R-W (`124a:137`): compute never branches on PostGIS; `guards.requires {kind: "extension", name: "postgis", on_missing: "fail"}` (link_parcels precedent `scripts/link-parcels.descriptor.json:314-320`).

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| LINK descriptor + frozen shell (D1) | Spec 122 §8.1; R-BA | link_parcels form | step-validate gates A–K | this report | archetype LINK | red-first D1 | precedent | — |
| re-check every run (D2, LCTP-D3) | O4 row 7 | link_parcels O4 row 7 | D2 lock + G8 differential | §12 ruling 1 | every LINK with a marker | measured 3,773 stuck | one staleness mode | — |
| scoped retraction + RLS (D3) | R-CT; trap 2 | link_full_retraction | #46 guards | LCTP-D6/D9 | every coa-namespace writer | measured trigger rows | one scope string | — |
| back-fill on change (D4, LCTP-D7) | Rule 1; O4 row 7 | link_parcels watermark | D4 lock | §12 ruling 1 | LINK markers | measured 26,723 | one predicate | — |
| fail_fast + postgis guard (D5) | R-W; R-BD | link_parcels | D5 lock | §12 rulings 2–3 | fleet | pinned L9/L14 | removes code | — |
| literals → variables (D6) | Rule 3; R-CV; R-DF | migration form (263) | gate E #32; gate A | migration 272 | — | byte-identical | yes | **yes** |
| compute purity (D7) | R-BZ | G-codes | gate E #32 | R-BZ | fleet | red-first | seams only | — |
| PIPELINE_TABLE_MAP (#51) | R-DL | derived | `admin-step-registration.logic` | R-DL | every step | measured gap | one entry | — |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **Re-link volume.** The first re-check run's change count is unmeasured until the P3/P4 pair; the 3,773 stamped-unlinked CoAs are the upper bound for new links, and departed-parcel retractions are unknown.
- **Set-based cascade.** link_parcels' `buildMatchSql` is one set statement; this step's cascade (bridge, exact, name-only, then the neighbourhood and centroid probes) has to be rewritten into that form at ②. The result is pinned by L7/L8/L12/L13 and the POST differential.
### RECURRING / STANDARD-SHAPING
- Two writers of `coa_applications.latitude/longitude` (this step and link_coa). The stamp-on-change rule is what keeps them from fighting; link_coa's conversion (wave 2) should name this step as the primary writer in its own notes.

## A. Measurement log (2026-10-18)
- **A.F-DB** (read-only, dev DB, one `BEGIN READ ONLY` session): coa_applications counts (total, unstamped, no-normalized, lat, neighbourhood); lead_parcels `coa:` rows by match_type and per-lead counts; stamped-unlinked count; the lat/lng vs parcel-centroid comparison; `pg_class` RLS and `pg_policies`; `pg_indexes` and `pg_trigger`; `pg_extension`; `pipeline_runs` for `coa:link_coa_to_parcels` (1547, 1497).
- **A.F-CODE:** `scripts/link-coa-to-parcels.js` @ `cd714db4`, sha256 `941860178c1f2216…`, 722 lines; `scripts/lib/coa-link-sql.js`; `scripts/link-coa.js:660-680`; consumers `enrich-parcels.js:1122-1123`, `assert-global-coverage.js:133`.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/link_coa_to_parcels/violations.test.ts`: 27 / 27. The red-evidence run gave 18 pass / 9 fail.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=link_coa_to_parcels --write` — Spec 123 §6, ruling R-R (2026-08-29).
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
| G1 | 1 | 1 | PH-3 section found=true sha-count=12 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=10 vocab-hit rows=10; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 11 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=1 it-count=30 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=1 lock-it-count=30 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | link_coa_to_parcels | PASS | min_migration=257 <= migrations count=274 |
| 2 | link_coa_to_parcels | PASS | 5 declared, missing from seeds: none |
| 3 | link_coa_to_parcels | PASS | retired=0 overlap-with-declared=none |
| 7 | link_coa_to_parcels | PASS | SPEC LINK header present=true |
| 8 | link_coa_to_parcels | PASS | G-4: 5 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | link_coa_to_parcels | PASS | HB-1: execution.shape="link" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | link_coa_to_parcels | PASS | CEIL-1: execution.shape="link" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
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
| 31 | (registry) | FAIL | CONSUMER-REGISTRY (gate D): scripts/steps/_schema/consumer-registry.json is stale against its four generation sources (first diff at row 91: {"consumer":"src/app/api/admin/leads/watchlist/search/route.ts","producer":"link_coa","kind":"table","key":"permits.last_seen_at","value":"any","source":"src_sql"} vs on-disk {"consumer":"src/app/api/admin/leads/watchlist/search/route.ts","producer":"link_coa","kind":"table","key":"coa_applications.last_seen_at","value":"any","source":"src_sql"}) — run `node scripts/analysis/gates/consumer-registry.mjs --write`. |
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
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 251 · unexplained: 0

### Test suite (item iii)
- SKIPPED or failed to run: --fast: vitest spawn skipped

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | not-run | §5.5 describe not evaluated — vitest did not run (--fast); shape scan is NOT a substitute for the §5.5 suite |
| 3 | Tunables externalized | enforced-green | G-4: 5 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 2 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=36547B notes=4085B checks=19 rows records_meta=3931B (newest post/ capture) |

**Enforced-green: 11/14** · not-run: 1 · vacuous: 1

