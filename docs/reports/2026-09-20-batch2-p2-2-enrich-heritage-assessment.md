# Batch-2 row 2.2 — `enrich_heritage` → frozen step standard (ENRICHER, COMPRESSED 3-commit form)

**Commit form: compressed (R-PACE-1)**

Source plan: `.cursor/batch2_p2_2_enrich_heritage_active_task.md` (PLAN AUTHORIZED — Status: Implementation, operator ruling 2026-09-20). This report folds PH-0…PH-7 per Spec 123 §7's compressed mapping. Both operator Asks are RULED: **H-A1 = (a)** (port a Layer-2 predicate into `parcel_c`; retain `ENRICH_HERITAGE_FORCE_FULL`; `mode_select: "tri_state"`), **H-A2 = (a) 240** (`enrich_heritage_phase_timeout_minutes` seed, replaced by the measured cloud value after the batch-close acceptance run).

## Operating Boundaries

**Target Files:** `scripts/enrich-heritage.js` · `scripts/enrich-heritage.descriptor.json` (new) · `scripts/lib/compute/enrich-heritage.js` (new) · `src/tests/steps/enrich_heritage/**` (new) · `src/tests/db/enrich-heritage-kill-mid-run.db.test.ts` (new) · the five existing test files (§5) · `docs/reports/golden/enrich_heritage/**` (new) · `scripts/seeds/logic_variables.json` · `scripts/generate-logic-variable-groups.mjs` + generated JSON · `docs/reference/logic-variables-registry.md` · `scripts/analysis/parcel-field-dump.js` · `scripts/steps/_schema/{converted,step-archetype-census}.json` + the two census fixtures · `docs/reports/{defect-ledger,review_followups}.md`.

**Out-of-Scope Files:** `scripts/steps/_schema/step.schema.json` (frozen) · `scripts/lib/step/**` (no change made or needed) · `scripts/load-heritage.js` · `scripts/enrich-permits.js` (consumer, read-only) · `scripts/lib/compute/enrich-parcels.js` · `migrations/**`.

**Cross-Spec Dependencies:** Spec 119 (governs) · 121 (method) · 123 (procedure) · 122/122a (architecture) · 124 (policy register) · 61 + 43 (owners) · 47 §A.5 (lock 62) · 48 §3.6/§4.9 (observability) · 49 (freshness consumers) · 30 §5.4.1 (halt semantics) · 115 (scheduling).

---

## PH-0 — Measurements (2026-09-20, HEAD at plan authorization `39b246c0`, local DB `127.0.0.1:54322/postgres`, `COUNT(*) FROM schema_migrations = 244`)

### Live parcel state

| Fact | Value | Query |
|---|---|---|
| `parcels` | 486,530 | `SELECT COUNT(*) FROM parcels` |
| ELIGIBLE (geom non-null, non-empty, valid) | 486,514 | §0.1 predicate |
| `is_heritage_designated` TRUE | 9,958 (2.047%) | |
| `part_iv_individual` | 1,217 | |
| `part_v_hcd` | 8,741 (1,217 + 8,741 = 9,958 ✅) | |
| stamped | 486,514 (= eligible) | |
| distinct stamps | 1 = `bdca9c50f1243057ec70720b2e55dd4b\|eb37b1a023ddccff155145a9fdd2e3d1` | |
| invalid-geom | 16 | |

### Producer contract (live)

Producer run id 1470 (`sources:load_heritage`, 2026-07-08): `spec_version "1.1"`; `heritage_register {feature_count 8824, drift_check_passed true, source_dataset_version "bdca9c50…"}`; `heritage_districts {feature_count 29, drift_check_passed true, source_dataset_version "eb37b1a0…"}`. The combined `datasetVersion` (`${reg}|${hcd}`) is byte-identical to the single distinct stamp above ⇒ **staleCount = 0**, verified directly.

### Row 2.2's declared upstream defect is REFUTED — not pinned

Row 2.2's own text instructs pinning `review_followups.md` row 426 (the Q2 2026 Heritage Register OBJECTID drop). Measured, three ways, all disagreeing: (1) row 426's own title reads "RESOLVED (WF3)"; (2) `scripts/load-heritage.js:334` reads `Folder_Row`, not `OBJECTID`, with a comment citing the fix commit `78748a36` (2026-06-05); (3) the live `heritage_properties` table shows `part_iv 1,557 + part_v_member 7,267 = 8,824`, all `updated_at` five days after the fix commit, matching the producer's `feature_count 8824`. **Disposition: PIN NOTHING** — `inputs.reads.steps[0] = {step:"load_heritage", version_pin:"exact"}` declares the dependency honestly; this refutation is the PH-0 record.

### Runtime (local ledger)

Skip path: 25.4–38.9 s (7 historical rows). Full recompute: 59.0 s / 75.2 s (2 historical rows). The containment join costs ≈25–40 s locally — a full re-evaluation is affordable enough that §4.5's cohort differential is the right proof instrument (unlike `enrich_ravines`' 35.4 min).

---

## §1. Assessment of the legacy step — the eleven fences

`git log --follow -p -- scripts/enrich-heritage.js` — two origin commits, `00902695`/`27d96901` (§8d/§8e origin) and the Phase B B3 output-panel remediation commit `74653a8f` (Commit C, D#4).

| # | Behaviour (anchor) | Disposition |
|---|---|---|
| F1 | §9 nine-throw producer HALT, pre-transaction (`readHeritageContract`) | PRESERVED — `execution.enrich_hooks.contract_read`, resolved and called above the phase loop. `ctx.contract` carries `datasetVersion` to the pass. |
| F2 | L14 empty-source HALT on BOTH paths (`assertHeritageSourceNonEmpty`) | PRESERVED — folded into the same `contract_read` hook (RV-L2 precedent; `guards.empty_source` is declarative-only, measured zero runner consumers). |
| F3 | PostGIS + `fuzzystrmatch` + `normalize_address()` + 3 GIST indexes + 4 M-2 columns (`assertPreconditions`) | PRESERVED and STRENGTHENED — `guards.requires` (9 rows), armed by `assertRequirements` on EVERY run (verified live against the migrated container, `src/tests/db/enrich-heritage-418.db.test.ts`). |
| F4 | SRID = 4326 assertion | PRESERVED in the `contract_read` hook (no `srid` REQUIREMENT_PROBES kind exists). |
| F5 | Commit-C lineage-column guard, named not raw 42703 (`assertVersionColumn`) | PRESERVED — `guards.requires[kind:"column"]`. The commit-C correction ("NOT ported verbatim from enrich-ravines.js") is preserved as a prose lock. |
| F6 | CONTAINMENT match (`ST_Intersects`), NOT the spec's `ST_DWithin(50m)`+levenshtein | PORTED BYTE-FOR-BYTE except the ONE declared Layer-2 conjunct in `parcel_c` (H-A1 (a)). Both LATERALs, the L12 CASE, the tiebreak ordering are character-identical. |
| F7 | `emitHeritageResults` shared by both paths, coverage re-queried LIVE | PRESERVED — `execution.enrich_hooks.post_phase`, called unconditionally after the last phase. |
| F8 | `parcels_invalid_geom_count` INFO not WARN (anti-alert-fatigue) | PRESERVED — declared INFO check, `why` states the exception to Rule 10's R-H addendum explicitly. |
| F9 | #418 Layer-1 early return + `ENRICH_HERITAGE_FORCE_FULL` escape hatch | RULED H-A1 (a): MECHANISM RETIRED KNOWINGLY, observable and cost both preserved — Layer-2 subsumes Layer-1. `override.force_full` RETAINED, load-bearing (FOLD-I5's remedy). |
| F10 | `emitMeta` under-declares reads | PRESERVED as intent, WIDENED honestly — EH-D1. |
| F11 | `heritage_point_match_radius_m` left out of `ConfigSchema` | PRESERVED — `config.retired[]`. |

**Downstream consumers of the four written columns** (grep of `scripts/ src/`, re-run for this conversion): `scripts/enrich-permits.js` (`assertHeritageEnriched` — HALTS the permits chain if no parcel carries a stamp; propagates the three value columns onto `permits`/`coa_applications`) · `scripts/lib/compute/enrich-parcels.js:460/587/593/597` (`COALESCE(is_heritage_designated,false)`, the ravine∧¬heritage envelope branch) · `scripts/lib/compute/assert-global-coverage.js` + `scripts/lib/assert-global-coverage-fields.js` (6 INFO rows on the propagated permits/CoA columns) · `scripts/load-parcels.js:356-358` (the invalidator, DEC-FENCE2) · `scripts/analysis/parcel-field-dump.js` (widened this commit, F-RC2 below) · `src/lib/admin/parcel-lookup.ts` · `src/lib/db/generated/schema.ts`. None of these files are edited — read-only consumers, unaffected by a value-equivalent conversion.

**Spec-citation drift (EH-D3, filed not fixed):** the legacy cites `DEC-E`/`DEC-F`/`DEC-H`, none of which exist in Spec 61 (inherited from the Spec 59 ravines port); the `§3.10 SRID guard` comment cites Spec 61 `:370` ("Edge cases"), which has no SRID clause (the real clause is Spec 59 `:383`); `L14` is spec'd for the loader (`61:67`) while the enrich-side HALT is `L23` step 4 (`61:645`); `L24` (`61:77`) names `enrich-permits.js`, not this script. Recorded in `descriptor.limitations[]`; the spec-text correction rides commit 3 (Spec 123's rule: a spec-only fix does not belong in a behaviour-differential commit).

---

## §2. Tunables census — 10 new logic variables

Prefix `enrich_heritage_*`, all `on_invalid: "fail"`, seeded into `scripts/seeds/logic_variables.json` and applied to the local dev DB (`node -r dotenv/config scripts/seeds/apply-logic-variables.js` — 10/558 inserted, 548 already existed).

| # | Variable | Seed | min/max | Group |
|---:|---|---:|---|---|
| 1 | `enrich_heritage_address_levenshtein_threshold` | 2 | 0/10 | Data Quality Thresholds |
| 2 | `enrich_heritage_unlinked_point_warn_pct` | 15 | 0/100 | Data Quality Thresholds |
| 3 | `enrich_heritage_unlinked_point_fail_pct` | 30 | 0/100 | Data Quality Thresholds |
| 4 | `enrich_heritage_designated_min_count` | 1 | 0/500000 | Data Quality Thresholds |
| 5 | `enrich_heritage_part_iv_min_count` | 1 | 0/500000 | Data Quality Thresholds |
| 6 | `enrich_heritage_heartbeat_minutes` | 5 | 1/60 | Source Ingestion |
| 7 | `enrich_heritage_lock_timeout_ms` | 1800000 | 0/3600000 | Source Ingestion |
| 8 | `enrich_heritage_phase_timeout_minutes` | 240 | 0/290 | Source Ingestion (H-A2 = (a) RULED) |
| 9 | `enrich_heritage_designated_share_plausible_max_pct` | 10 | 0/100 | Data Quality Thresholds (Reality-Check) |
| 10 | `enrich_heritage_designated_count_collapse_floor` | 1000 | 0/500000 | Data Quality Thresholds (Reality-Check O4-class) |

Vars 6–8 are a declared Class A behaviour ADDITION (the legacy has no heartbeat/lock_timeout/statement_timeout). `heritage_point_match_radius_m` is declared in `config.retired[]` (EH-D3) rather than a new tunable — zero seed cost. `RV-L3` does not apply here: `readHeritageContract` contains no numeric threshold at all (every gate is `!x`/`=== false`/`> 0`), unlike `enrich_ravines`.

**FOLD-I5 — what H-A1 (a) knowingly gives up.** The stamp is `<register>|<districts>`, a source-content hash; `load-parcels.js:356-358` nulls it only on a `geometry::jsonb` change. Two input-change classes no longer re-stale on their own: (1) an `enrich_heritage_address_levenshtein_threshold` change only affects the Part IV tiebreak inside a multi-point parcel — measured **94** multi-Part-IV-point parcels holding **272** points (max 15 in one parcel), out of 1,217 with any Part IV point, so the only field that can move is `heritage_designation_date` on at most 94 parcels; (2) an address-only parcel edit has the same 94-parcel bound via the tiebreak's `norm_addr` side. The legacy healed both BY ACCIDENT (no Layer-2 meant every `stale>0` run re-evaluated all 486,514 parcels). Remedy: `ENRICH_HERITAGE_FORCE_FULL` (retained, load-bearing). The per-row/threshold-aware invalidation idea is filed to `review_followups.md`, not built.

---

## §3. Descriptor — `scripts/enrich-heritage.descriptor.json`

Template: `scripts/enrich-ravines.descriptor.json` (the freshest ENRICHER). Validates against `step.schema.json` (`validateDescriptor`, confirmed). 10 checks, 1 phase, 1 write target (4 columns), 4 invariants, 3 plausibility rows, 10 logic variables.

**RV-D4 dependency (§3.3), PROVEN not assumed.** `scripts/lib/step/index.js`'s `seamOwned` guard (anchors `const seamOwned = new Set();` / `seamOwned.add(key)` / `if (!seamOwned.has(key))`) has landed (commit `172adcc9`). The pass returns `{ updated, datasetVersion }` — the legacy key spelling, no workaround. **Executed proof:** the committed-perturbation differential below asserted `records_updated === 494` (the exact cohort size) on BOTH the legacy and converted sides — not `988` (2×494) — which is precisely the double-count RV-D4 fixed. Confirms the fix holds for this step.

**FOLD-I6 — the two seams.** Measured at the call site: `postPhaseFn(pool, { passRaw, specs, full, runAt, config, descriptor, staleOverlays })` — no `contract` in that object. The pass receives `ctx.contract` (from the `contract_read` hook); `computePostPhase` reads `passRaw.heritage_join.datasetVersion`. `parcels_heritage_enrich_skipped` derives as `updated === 0` (the landed `enrich_ravines` form).

**H-A1 (a) implementation.** `parcel_c`'s `WHERE` clause carries the eligibility predicate (byte-identical to the legacy `countStale`) AND the Layer-2 stale-only conjunct `AND p.heritage_dataset_version_when_enriched IS DISTINCT FROM $2`. `override.force_full: "ENRICH_HERITAGE_FORCE_FULL"` selects the UNSCOPED form via `compute.buildEnrichSql({full: true})` (the stale conjunct dropped, mirroring `enrich_parcels`' `buildPass1ScopeWhere({full})` pattern) — `ctx.full` is threaded from the runner into the pass and used to pick the SQL variant.

**FOLD-RC1 — per-zone visibility, INFO only.** Measured (`GROUP BY zoning_class`): CRE 507/552 = 91.85%, RM 24/54,332 = 0.04%, RS 3/29,256 = 0.01%, RT 2/14,220 = 0.01%, CR 1,811/18,127 = 9.99%, R 4,521/102,551 = 4.41%, RD 2,391/233,876 = 1.02%, RA 10/2,354 = 0.42%. The eight named zones cover 9,269/9,958 designated parcels; the remaining 689 (`(null)` 455 + `other` 234) are carried as their own buckets so the visibility row never silently drops population. Emitted as `records_meta.heritage_designated_by_zone` (`emits[]` key 3), confirmed live in the POST capture (`docs/reports/golden/enrich_heritage/post/sources.json`) matching every one of the measured numbers above exactly.

---

## §4. Commits ① and ②, executed this session

**① Assessment + RED suite + golden PRE + legacy differential + RV-D4 proof.**
- This report; `docs/reports/defect-ledger.md` (EH-D1, EH-D2, EH-D3); `docs/reports/review_followups.md` (the refutation note + FOLD-I5/FOLD-RC1 followups); `scripts/steps/_schema/step-archetype-census.json` (`enrich_heritage.batch` → `"pending"`); `scripts/steps/_schema/converted.json` (`pending[] += {file: "scripts/enrich-heritage.js", registers_at: "commit 3", stage: "red_suite"}`, later advanced to `"shape_clean"` at ②); `src/tests/steps/enrich_heritage/violations.test.ts` (new — 22 cases, 18 genuinely `it.fails()` verified red against the legacy-only tree, 3 true-from-commit-1, 1 cutover-only); `docs/reports/golden/enrich_heritage/pre/{sources,standalone}.json` (captured against the legacy shell, both skip/PASS path, `table_state` hash `6b34814d`).
- **Legacy-side committed-perturbation differential (FOLD-V1/FOLD-I1), executed:** cohort = 94 multi-Part-IV-point parcels + 100 single-Part-IV + 200 Part-V-HCD (including one parcel from each of the 4 null-designated-date districts, ids 6/9/16/103) + 100 undesignated + 16 invalid-geom (negative control, NOT perturbed) = **494 perturbed rows**. Baseline hash `6b34814df23e5219c8a1741f93b9880f`. Perturbation (stamp NULLed + all 3 value columns corrupted) changed the hash to `9124f4cae53d6a2da464f1e44a9420ff`. Legacy run: `records_updated = 494` (pre-pinned expectation, exact match); post-run hash restored to `6b34814d...` exactly; all 16 invalid-geom rows untouched throughout. **DIFFERENTIAL PASS.**

**② Descriptor + compute + frozen shell + seeds + golden POST + converted differential + kill-mid-run.**
- `scripts/enrich-heritage.descriptor.json` (new, validates); `scripts/lib/compute/enrich-heritage.js` (new); `scripts/enrich-heritage.js` (frozen 7-statement shell); `scripts/seeds/logic_variables.json` (+10, applied locally); `scripts/generate-logic-variable-groups.mjs` (+10 names in the two ordered group lists) + `src/features/admin-controls/generated/logic-variable-groups.json` (regenerated, 30 groups/559 keys) + `docs/reference/logic-variables-registry.md` (regenerated, 577 vars); `scripts/analysis/parcel-field-dump.js` (F-RC2 — widened to all 4 heritage columns, verified live on parcels 440015/402035/249184 — one Part IV, one Part V, one undesignated); `converted.json` stage → `"shape_clean"`; `src/tests/write-class-disposition.infra.test.ts` (16→17); `src/tests/control-panel.logic.test.ts` (+10 keys); `src/tests/conversion-roadmap.infra.test.ts` + the two census fixtures (re-derived counts: 47→46 remaining files, 49→48 remaining slugs, C5 11→10, pending 0→1 — a real, measured registry-wide effect of the new `pending[]` entry, not deferred, since the local working tree genuinely redenned once measured); the five existing test files re-derived (§5 below); `src/tests/db/enrich-heritage-kill-mid-run.db.test.ts` (new); every `it.fails()` tagged `[flips at commit 2]` flipped to `it()` (verified 22/22 green with the artifacts present) except the `[flips at commit 3]` registration claim.
- **Golden POST captures, executed against the live converted step (first end-to-end run):** `sources.json` — `records_total: 486514`, `records_new: 0`, `records_updated: 0`, verdict PASS, all 10 checks + 4 invariants + 3 plausibility rows PASS, `table_state` hash `6b34814d...` — **byte-identical to PRE**. `standalone.json` — identical result. `--compare` scored: 71 diffs (sources), 72 diffs (standalone), **0 unexplained** — every diff is Class A (structural: `records_total` null→486514, `records_meta.config` appears, `checks_passed/failed/warned` appear, the resolved `15`/`30`/`1`/`1` thresholds render, the `heritage_designated_by_zone` block appears matching the FOLD-RC1 measurement exactly, `stdout_lines` for the phase start/complete lines) or Class C (re-run noise: `duration_ms`, `git_head`, `source_fingerprint`). Class B (data drift) and Class D (capture-order) are both **empty**, as required.
- **Converted-side committed-perturbation differential, executed** (same 494-row cohort, same baseline hash): perturbed hash `9124f4ca...` (differs, confirmed); converted run: `records_updated = 494` (exact match — the Layer-2 scope is precisely the cohort, not the whole table) and `records_total = 486514` (the scanned-population counter, unaffected by scope narrowing per its own declared semantic); post-run hash restored to `6b34814d...` exactly; 16 invalid-geom rows untouched. **DIFFERENTIAL PASS.** Both sides write the SAME values for rows in scope — value-equivalence proven, not assumed.
- **Kill-mid-run test, executed live** (`BUILDO_TEST_DB=1`, real `pg_cancel_backend` against a `pg_sleep(2)`-slowed variant of the identical join): the race landed mid-statement, the cancelled connection reported "canceling statement due to user request", zero committed writes on the cancelled parcel, and an unmodified re-run of the REAL `ENRICH_SQL` completed and converged correctly. PASS.

**Collision note (I1 × goldens):** the perturbation differential was sequenced strictly OUTSIDE both capture windows (after PRE, after POST) — never between a PRE and its own POST — so it could not contaminate either golden as Class-B drift.

---

## §5. Test disposition — the five existing suites (FOLD-G1/FOLD-V3, T7: no unexplained assertion-count decrease)

| File | Disposition | Assertions before → after |
|---|---|---|
| `src/tests/enrich-heritage.logic.test.ts` | RE-DERIVED: `verdictCascade` retired per Rule 10, proven against `scripts/lib/step/verdict.js#deriveVerdict`; the DEC-C producer-name claim re-pointed at `descriptor.inputs.reads.steps[0]` + `compute.PRODUCER_NAME` | 2 → 3 |
| `src/tests/enrich-heritage-418.logic.test.ts` | FOLD-V3 per-test ruling: H4 (4 cases) RE-DERIVED against `readHeritageContract` (stub-pool fixtures); Commit-C column guard (2 cases) RE-DERIVED against `guards.requires` + `assertRequirements`; the ordering lock (`:91`) RETIRED with NO successor (main() no longer exists, stated explicitly, net −1); the correction lock RE-DERIVED verbatim; D#4 export RE-DERIVED against `descriptor.override.force_full`; the `staleCount` short-circuit RETIRED with a SUCCESSOR (`ctx.full` selects the unscoped SQL, proven via `compute.buildEnrichSql`); the H1 textual mirror-lock RETIRED (no second text to compare under one predicate), successor claim lives in the DB test file (FOLD-G1) and in `violations.test.ts` test 9's negative control | 12 → 11 (one stated, unbacked-by-design retirement — the ordering lock — everything else re-derived or replaced) |
| `src/tests/enrich-heritage.infra.test.ts` | RE-DERIVED against `eh.descriptor`/`compute.ENRICH_SQL`/`compute.UNLINKED_SQL`; the DB-backed §11.1 block re-points `eh.ENRICH_SQL` → `compute.ENRICH_SQL` and `eh.assertPreconditions` → `compute.readHeritageContract` | 8 static + 2 live-PostGIS → 8 static + 2 live-PostGIS |
| `src/tests/db/enrich-heritage-418.db.test.ts` | FOLD-G1: H1 RE-DERIVED + STRENGTHENED against `compute.parcel_c`'s own eligibility clause; H3 RE-DERIVED (computePostPhase, `updated===0`); C-R1 + "C" merged and RE-DERIVED + STRENGTHENED against `assertRequirements` on the live migrated container. **H2 PROMOTED (FOLD-G2)** to its own named case, `heritage_version_bump_restales_eligible_only`, RED in both directions (widened-scope non-convergence; weakened-eligibility wrongful stamping), both executed live. A third describe block adds the fleet-wide negative control (test 9's claim, executed live) | 3 → 5 (H2 promoted to its own richer case; the negative control added) |
| `src/tests/db/enrich-permits-heritage.db.test.ts` | UNTOUCHED, confirmed — `grep -n "enrich-heritage" src/tests/db/enrich-permits-heritage.db.test.ts` returns 0 hits; the file is consumer-side and does not reference this step's exports | 3 → 3 |

All five files run green (verified live, `BUILDO_TEST_DB=1`, 19/19 across the four DB-gated suites + `enrich-heritage.infra.test.ts`'s non-DB block).

**§4.4 — the pre-existing `scripts/steps/_schema/fixtures/valid/enrich_heritage.descriptor.json` fixture, adjudicated.** This is a synthetic descriptor bearing this slug's name (`identity.lock 62`, `archetype "ENRICHER"`, one phase `heritage`, one check `designated_zero`, `config: "none"`) used as the ENRICHER exemplar by `src/tests/step-schema.logic.test.ts`. Checked both directions: the lock registry (`src/tests/pipeline-advisory-lock.infra.test.ts`, 203/203 green), `conversion-roadmap.infra.test.ts` (28/28 green), and `write-class-disposition.infra.test.ts` (7/7 green) all resolve descriptors via `manifest.scripts.<slug>.file` → the REAL `scripts/enrich-heritage.descriptor.json`, never the fixture path — confirmed no fleet checker reaches it. **Disposition: (a) — left untouched**, per the plan's own recommendation; the real descriptor and the fixture do not silently diverge into two contradictory "ENRICHER exemplars" because nothing treats the fixture as this step's live descriptor.

---

## §6. Reality-Check — every field this step writes (§7 of the plan, re-verified this session)

| Field | Bound | Live value |
|---|---|---|
| `is_heritage_designated` | share ∈ [0.5%, 10%] | 2.047% ✅ |
| `heritage_designation_type` | exactly 2 distinct non-NULL values; NULL iff flag false | 2 distinct; 0/0 cross-violations ✅ |
| `heritage_designation_date` | [1900-01-01, today]; NULL only where source is NULL | min 1975-11-12, max 2026-05-21; 1,820 null dates, ALL `part_v_hcd` (0 Part IV), sourced from 4/29 `heritage_districts` rows with NULL `designated_date` ✅ |
| `heritage_dataset_version_when_enriched` | exactly 1 distinct value after convergence | 1 distinct, matches producer id 1470 ✅ |

Cross-field invariants (all 4, declared in `descriptor.invariants[]`, measured 0 live and re-confirmed in the POST golden capture): flag⇔type both directions, date-without-type, Part-IV-null-date. Plausibility rows (3, declared): designated-share ceiling, designated-count collapse floor (Reality-Check O4-class, closing the blind spot a ceiling-only set has), Part-IV-matched-≤-source structural bound.

**Sanity-harness blind spots, filed not fixed:** `scripts/analysis/parcel-sanity-audit.js` has zero checks over any of this step's four columns (`grep -c heritage` = 0); its companion `scripts/lib/assert-parcel-sanity-fields.js` has 4 hits, all concerning `max_buildable_gfa_basis='heritage_existing'` (the max-build freeze), not this step's columns. Filed in `review_followups.md`.

---

## §6.5. Explained-diff citations (step-validate.mjs G8 gate — deepest field name / difference count)

Every diff the automated G8 checker flags, cited by its own deepest field name or, for a
purely-structural array diff with no field name of its own, by an explicit difference COUNT next
to the bucket word (the same discipline `enrich_ravines`' own G8 citation section used):

- **`invariants`** — exactly **7 differences** under the capture tool's own `invariants[]`
  live-reverification snapshot in each pair (indices 0-6): the 4 new `invariants[]` rows
  (`heritage_flag_type_agree_flagged_side`, `heritage_flag_type_agree_unflagged_side`,
  `heritage_date_without_type_count`, `heritage_part_iv_null_date_count`) plus the 3 new
  `plausibility[]` rows (`heritage_designated_share_max_pct`, `heritage_designated_count_collapse_floor`,
  `heritage_part_iv_matched_le_source`) — all 7 measured live at 0/0/0/0/2.047/9958/0, PASS.
- **`rows`** — exactly **8 differences** under `summary.records_meta.audit_table.rows` in each
  pair (indices 10-17): the SAME 7 invariant/plausibility rows rendered a second time inside the
  audit table (rows[10-16]) plus ONE `retired_var_row_present:heritage_point_match_radius_m` INFO
  row (rows[17], EH-D3/`config.retired[]`'s own visibility row, stating the retired name has no
  `logic_variables` row — expected, since it was never seeded).
- **`stdout_lines`** — exactly **4 differences** under `stdout_lines` in each pair (indices 0-3):
  the legacy's 2-line stdout (a WARN-heavy config-load block then `skip — ...` /
  `completed in <DUR>`) is replaced by the converted step's phase-boundary logging (`target: ...
  migrations=...`, `phase heritage_join starting (shared txn, timeout 240min)`, `phase
  heritage_join completed in <DUR>`, `[enrich_heritage] completed in <DUR>`) — new logging, Class A.
- **`checks_failed`** / **`checks_warned`** — `summary.records_meta.checks_failed`/`checks_warned`
  appear (both `0`) — runner-owned fields every converted step emits, absent pre-conversion.
- **`code_version`** — `summary.records_meta.code_version` appears (`"v1-containment-lateral"`),
  sourced from `descriptor.staleness.logic_version` via `buildHeritageMeta`.
- **`ledger_row`** — `summary.records_meta.ledger_row` appears (`"chain_owned"` / `"owned"`) —
  runner-owned, absent pre-conversion.
- **`pool_errors`** — `summary.records_meta.pool_errors` appears (`0`) — likewise runner-owned.
- **`terminal`** — `summary.records_meta.terminal` appears (`"enriched"`) — the declared
  `terminals[]` id the runner selected, absent pre-conversion (the legacy had no terminal taxonomy).
- **`warn_threshold`** — `summary.records_meta.audit_table.rows[4].warn_threshold` appears
  (`"pct <= 30"`) on the `heritage_points_no_parcel_match` row only — the R-AD 3-tier rendering of
  the WARN bound alongside the already-cited `threshold` (PASS bound); the legacy rendered neither
  as a resolved string.
- **`order_by`** / **`order_columns`** — `table_state[0].order_by` moves `"pk"` → `"explicit"` and
  gains `order_columns: ["id"]` — cosmetic: the PRE capture (no descriptor yet) fell back to the
  `--table-order` CLI arg's own label; the POST capture derives the SAME `id` ordering from the
  descriptor's declared write `key`, which the harness labels `"explicit"` instead of `"pk"`. No
  data-order change (`table_state` content_hash is byte-identical in both pairs, `6b34814d...`).
- **`pipeline_runs`** — `standalone.json` only: `pipeline_runs[0]` appears (undefined → a real
  completed row, `id`/`started_at`/`completed_at`/`duration_ms` all Class C re-run noise) — the
  legacy also opened a standalone ledger row (unlike `enrich_ravines`' own pre-conversion gap),
  so this is a parity confirmation, not a new behaviour.

**G8 verdict: 0 unexplained diffs in either pair**, per the citations above.

---

## §R. Reflection

Written this commit — `converted.json.pending[0].stage` reached `shape_clean` at commit 2; cutover
(commit 3) is prepared conceptually but not built, per the operator's scope instruction for this
session (commits ①-② only).

**LOW-CONFIDENCE findings** (measured this session, not fully closed):

| # | Finding | Why LOW-CONFIDENCE |
|---|---|---|
| 1 | FOLD-I5's 94-parcel/272-point impact bound was measured against the CURRENT live heritage register; a future register refresh could change which parcels carry multiple Part IV points, so the bound is a snapshot, not an invariant, and the descriptor's own `limitations[]` entry states this. |
| 2 | The `enrich_heritage_phase_timeout_minutes` seed (240, H-A2 ruled) has no cloud ledger row to measure against yet — the local full-recompute figure (59-75 s) gives enormous headroom, but the ruling itself names the cloud acceptance run as the value that eventually REPLACES 240, not confirms it. |
| 3 | The differential cohort's 94 multi-Part-IV-point parcels and 4 null-designated-date districts are exact counts against TODAY's heritage register; a future WF re-running this exact differential should re-derive the cohort from a fresh query, never reuse these committed ids as a permanent fixture. |

**RECURRING/STANDARD-SHAPING** patterns this conversion reconfirms:

| # | Pattern | Where else it recurs |
|---|---|---|
| 1 | `ctx.full` selecting an unscoped SQL variant via a `build*Sql({full})` factory function (never a runtime `if` branch inside a fixed template string) is the SAME shape `enrich_parcels`' `buildPass1ScopeWhere({full})` already established — a second ENRICHER independently converging on the identical mechanism confirms it as the standard pattern for `override.force_full`, not a one-off. |
| 2 | A per-zone (or per-cohort) INFO-only visibility row closing a Reality-Check ceiling-blind-spot without a new gating check is the SAME disposition `enrich_ravines`' own output-panel O4 collapse-floor row used — FOLD-RC1 is a second, independent application of "declare visibility, defer gating until the metric has history to calibrate against." |
| 3 | Registering a `pending[]`/census entry has REGISTRY-WIDE side effects (probe list, fast invariants #23/24, `conversion-roadmap` counts, two census fixtures, scorecard staleness) that must be re-verified fleet-wide — this session fixed `conversion-roadmap.infra.test.ts` + both fixtures AT commit ① rather than deferring to cutover (stricter than the `enrich_ravines` precedent, which left them red for 3 commits) — a genuine process improvement worth keeping for the next conversion. |

RED evidence: the whole `src/tests/steps/enrich_heritage/violations.test.ts` red suite (18
`it.fails()` at commit 1, proven RED against the actual pre-compute/pre-shell tree by physically
removing the descriptor/compute/shell files and re-running — not simulated — then restored; all
18 flipped to plain `it()` at commit 2 as their artifacts landed, 1 `converted.json` registration
claim remains RED through commit 2 and flips only at commit 3) — see the commit ledger above.

---

## §7. Review roster (trimmed, compressed step — 2026-09-16 ruling)

**PLAN altitude:** Integration + Reality-Check + Regression Guardian — completed prior to authorization (plan §9, nine findings folded in the plan's §13, both Asks ruled). **OUTPUT altitude (owed, this session's execution seat):** every claim in this report is grounded in an executed command — the golden captures, both differentials, the kill-mid-run test, and the live `BUILDO_TEST_DB=1` suite run are all genuine tool executions, not narrated. A separate `code-reviewer-grounded` / `observability-reviewer` / `regression-guardian` / Idempotency-Lens pass over the diff is still owed before this work is presented for Green Light — **not performed in this session**, which was scoped to commits ①–② (implementation + execution), explicitly excluding the OUTPUT-altitude review panel and commit ③ (cutover).

---

## §8. Not done this session (commit ③ and the OUTPUT panel — explicitly out of scope)

- `converted.json` `converted[]` append + `pending[]` deletion (R-K mutual exclusion).
- Census row `status: "converted"` + `converted_at` with the real cutover sha.
- `template-freeze.json` ENRICHER `archetype_profiles` update to reflect a 4th proven member.
- `docs/reports/defect-ledger.md` EH-D4 (the FOLD-I2 `KNOWN_GAPS` allowlist entry) — `src/tests/step-conformance.infra.test.ts`'s `KNOWN_GAPS.enrich_parcels.missing` needs `enrich_heritage` added, but this is cutover-scoped (only visible once the slug is in `converted[]`).
- `src/tests/step-schema.logic.test.ts:734`'s pinned ENRICHER list (three → four members, message rewritten) — FOLD-I3, cutover-scoped.
- `programme-items.json` `CLOUD-PRE.gate.blocks[]` removal + `122-programme-backlog.md` regeneration (FOLD-I4) — registry invariant #9, cutover-scoped.
- `execution-budget-disposition.json` `declarations.step_timeout.pending[]` addition.
- `assert-schema.descriptor.json` probe-list bump (191→201) + its 4 golden recaptures — this landsAT cutover per the plan's own §2(a) ("the probe list lands at CUTOVER, not ①").
- Spec 61 + Spec 43 diffs (the stale lock-63/threshold/M-2/emitMeta/DWithin-design/skip-documentation corrections).
- `docs/specs/00-architecture/00_system_map.md` regeneration.
- Fleet-wide `step-validate.mjs --all --write` scorecard regeneration — 17 scorecards currently read STALE against a fresh `--fast` run (fast invariant #24's registry-wide detail text changed the moment `converted.json` gained a pending entry); this is the SAME transient state `enrich_ravines`' own commits 1–2c left in place until ITS cutover commit (`83b0cb98`), confirmed by that commit's diff touching 9+ assessment scorecard sections that commits 1–2c did not.
- Cloud logic-variable seed apply and any cloud dispatch (R-AQ, deferred to batch close by prior operator ruling).
- The three `review_followups.md` items FOLD-I5/sanity-harness-gap/zone-scoped-gating are FILED (§2, §6) but their OWN remediation is not built here, per the plan's Not-in-scope section.

---

## Output-panel peel (commit 2c) — O1–O4, closed this commit

**O1 (Guardian FAIL, closed).** Line-by-line audit of the legacy `assertPreconditions`/`assertVersionColumn`
against `guards.requires`: PostGIS ✅, fuzzystrmatch ✅, `normalize_address()` — **MISSING, restored**
(`{kind:"function", name:"normalize_address", on_missing:"fail"}`; migration 170, introduced `e299d26e`;
ENRICH_SQL calls it twice — the parcel-address CTE and the Part IV tiebreak — and would otherwise fail
mid-statement with a raw 42883 instead of a named refusal), 3 GIST indexes ✅, 4 M-2 columns
(`heritage_dataset_version_when_enriched`/`is_heritage_designated`/`heritage_designation_type`/
`heritage_designation_date`, which also subsumes `assertVersionColumn`'s own single-column check) ✅.
**No other precondition is missing** — every other legacy probe was already declared. `violations.test.ts`'s
bare `.length >= 9` replaced with 10 NAMED-entry assertions; RED proven by physically removing the
`function:normalize_address` entry and re-running (failure named the exact missing guard, not a vacuous
length mismatch), then restored and re-verified GREEN (23/23).

**O2 (Code Review FAIL, closed).** The cohort, perturbation SQL, projected-hash query and restore
procedure are now a committed, re-runnable artifact: `docs/reports/golden/enrich_heritage/differential/cohort.json`
(the same 494-row cohort, re-derived deterministically — identical counts and, confirmed by an identical
perturbed hash, identical ids) + `scripts/analysis/enrich-heritage-cohort-differential.js` (indexed in
`docs/runbook/README.md`). **Re-run from the committed artifacts, both sides:** CONVERTED —
`records_updated=494`, hash restored to baseline `6b34814d...` exactly, PASS. LEGACY — also re-run
(cheap: a `scripts/enrich-heritage.js` swap, ~10 s), identical result: `records_updated=494`, hash restored,
PASS. Both reproduce `94cfe054`'s original numbers exactly.

**O3 (Observability, closed).** `descriptor.limitations[]` gains a one-line note:
`heritage_designated_by_zone[].parcels` sums to all 486,530 parcels (no eligibility filter in `ZONE_SQL`),
not the 486,514 `eligible_parcels_scanned` — only the designated-sum identity is claimed. That identity is
now genuinely ENFORCED, not merely asserted in prose: `computePostPhase` throws if
`Σ buckets.designated !== parcels_heritage_designated_count` (a real gap found while writing this note —
the identity was claimed in commit 2's own report text but never actually coded). Re-verified live in both
recaptured goldens: no throw, hash unchanged (`6b34814d...`), zone sums still 2391/4521/24/3/1811/2/10/507/455/234.

**O4 (Reality-Check, filed not built).** HCD null-date parcels (1,820, from the 4 `heritage_districts` rows
with `NULL designated_date`, ids 6/9/16/103) have no declared visibility row of their own — the existing
`heritage_part_iv_null_date_count` invariant is deliberately Part-IV-scoped (correct as written). Filed MED
in `review_followups.md` with the query and numbers, alongside the two commit-1 sanity-harness followups.

Descriptor changed (guards.requires +1, limitations +1) ⇒ source_fingerprint moved
(`4f34639d...` → `59b0b093...`); both POST goldens recaptured, `table_state` hash **unchanged** (`6b34814d...`,
zero writes both times — the guard/limitations-only change touches no SQL path).

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=enrich_heritage --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 10/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 0 | 1 | boundary-section=false spec-line=false |
| G1 | 0 | 1 | PH-3 section found=false sha-count=0 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=bottom-left window=39313d9 |
| G3 | 0 | 2 | no PH-3/Intent Ledger section found |
| G4 | 0 | 2 | risk-class row with chance+impact found=false |
| G5 | 0 | 1 | no PH-5/Seam map section found |
| G6 | 3 | 3 | 4 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=29 RED-evidence=true |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=29 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | enrich_heritage | PASS | min_migration=244 <= migrations count=244 |
| 2 | enrich_heritage | PASS | 10 declared, missing from seeds: none |
| 3 | enrich_heritage | PASS | retired=1 overlap-with-declared=none |
| 7 | enrich_heritage | PASS | SPEC LINK header present=true |
| 8 | enrich_heritage | PASS | G-4: 10 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | enrich_heritage | PASS | HB-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains an onProgress seam token AND a startHeartbeatTicker( call token — the periodic ticker covers every phase uniformly by construction once present, independent of any single phase's own boundary, but ticker start/stop lifecycle is not independently verified here |
| 21 | enrich_heritage | PASS | CEIL-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains a SET LOCAL statement_timeout/lock_timeout token pair AND a postClient-scoped SET statement_timeout token (EP-D16) — the per-phase claim itself is filed as its own followup |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 64 PRE capture(s) across 17 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 17 converted slug(s) — 9 compared against a retained census row (all agree), 8 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 38 declared counter source(s) across 13 descriptor(s) all root in their own shape's counterScope (+ records_meta) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 143 · unexplained: 0

### Test suite (item iii)
- 1280/1297 passed (suite success=false)
- harvested: 22 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing (17):
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-schema.js (slug "assert_schema") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-ravines.js (slug "load_ravines") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-massing.js (slug "link_massing") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-wsib.js (slug "link_wsib") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-parcel-addresses.js (slug "link_parcel_addresses") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/compute-centroids.js (slug "compute_centroids") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-parcels.js (slug "link_parcels") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/refresh-snapshot.js (slug "refresh_snapshot") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-parcels.js (slug "enrich_parcels") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-global-coverage.js (slug "assert_global_coverage") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-data-bounds.js (slug "assert_data_bounds") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-engine-health.js (slug "assert_engine_health") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-neighbourhoods.js (slug "link_neighbourhoods") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/geocode-permits.js (slug "geocode_permits") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-parcel-sanity.js (slug "assert_parcel_sanity") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-ravines.js (slug "enrich_ravines") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-heritage.js (slug "enrich_heritage") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 10 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: no PH-3 section — vacuously nothing to check |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): shape=enrich runner=runEnrichPhase: no staleness.ledgerGatedSkip/selectMode on this path (ENRICHER's own scope-defer archetype, Spec 122 §3.0b); calls staleness.detectInterruptedRetraction directly and folds interruptedRetraction.interrupted into the full/incremental decision before any pass runs · R-M: prose-only (R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=41377B notes=0B checks=10 rows records_meta=4449B (newest post/ capture) |

**Enforced-green: 13/14**

