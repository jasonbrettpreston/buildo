# Active Task: Batch 2 row 2.2 — `enrich_heritage` → frozen step standard (ENRICHER, COMPRESSED 3-commit form)

**Status:** Implementation (operator pre-authorized 2026-09-20: *"proceed with enrich_heritage plan when ready"*; both Asks RULED — see §12 and the Fold Log)
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md` read). Touches `scripts/`, `scripts/lib/compute/`, `scripts/seeds/`, `scripts/steps/_schema/`, `scripts/analysis/`, `src/tests/**`, `docs/`. **No `scripts/lib/step/` change is planned** (see §3.4) — if one becomes necessary it is an Ask, never a decision (Spec 124 §4.2).
**Branch / tree:** `wf2/deep-scrapes-restore-l0`, main tree, HEAD `39b246c0` (batch-2 row 2.1 pre-push-rejection peel). One committer at a time; never `--no-verify`; on Windows every edit containing an escape sequence goes through the Edit tool, never a Bash heredoc / `node -e` (`tasks/lessons.md:132`, `:180-182`).

**Commit form: COMPRESSED (R-PACE-1), and it is MANDATORY, not chosen.** MEASURED, not transcribed: `scripts/steps/_schema/converted.json` carries **16** entries with `pending: []`, of which **three** read `identity.archetype === "ENRICHER"` (`scripts/enrich-parcels.js`, `scripts/geocode-permits.js`, `scripts/enrich-ravines.js`), and `template-freeze.json`'s ENRICHER `archetype_profiles[]` row reads `proven: true`. `checkCompressedFormDefault` (`scripts/analysis/step-validate.mjs`, greppable anchor `export function checkCompressedFormDefault`) fires fast invariant **#24** on any eligible pending slug whose assessment report contains **neither** of its two literal probes (anchors `/\*\*Commit form: compressed \(R-PACE-1\)\*\*/` and `/\*\*Full form reason:\*\*/`). **⇒ `docs/reports/2026-09-__-batch2-p2-2-enrich-heritage-assessment.md` MUST carry, on its own line, the literal string `**Commit form: compressed (R-PACE-1)**`.** Spec 124 R-AH's own prose list ("INGESTOR and ENRICHER each need one more full-form member") was written 2026-09-14 and is **STALE** — `enrich_ravines` cut over at `83b0cb98` on 2026-09-18. Row 2.2's own parenthetical ("ENRICHER = 2 after 2.1") is right about the conclusion and off by one on the count; both are re-derived here, never transcribed.

**Archetype is PROVISIONAL until commit ① re-derives it from the CODE (Spec 124 R-AO, fast invariant #25 ARCHETYPE-PARITY).** `step-archetype-census.json` entry (measured) reads `{"slug":"enrich_heritage","file":"scripts/enrich-heritage.js","archetype":"ENRICHER","batch":"C5","reason":"Spec 122 §1.10 declared"}`. The I3/R-AE precedent (censused ASSERT, measured RECORDER, reverted mid-flight at `331f97ad`) is why this line exists. The commit-form declaration above is provisional with it.

---

## Context

* **Goal:** convert chain step `enrich_heritage` (`sources` position **13** of 28) onto the generic ENRICHER runner — standardize everything except compute, turn every fence into a descriptor field, externalize every literal as an admin logic variable, port the §11.1 containment SQL **byte-for-byte except the one declared Layer-2 scope predicate** (H-A1 (a), §1 / FOLD-I5 — a deviation, stated, not a silent edit), and leave the emitted verdict behaviour value-identical.
* **Target Spec (G0, owner-first — Spec 123 §6 G0 requires the owner row from `docs/specs/00-architecture/00_system_map.md` FIRST, before 122/123/124):**
  1. `docs/specs/01-pipeline/61_source_heritage_properties.md` — **domain owner**, spec_version **1.1** (`:3`). `:441` `### Target Files` lists `scripts/enrich-heritage.js (NEW; sibling per L6; advisory lock 63)` — **the lock number there is STALE; shipped is 62** (see §6 spec-diff table).
  2. `docs/specs/01-pipeline/43_chain_sources.md` — **chain owner**: step-table row at `:44` (position **13**, verbatim includes "advisory lock 62"), Target Files at `:283` (`- scripts/enrich-heritage.js — step 13 enrich_heritage`). **Measured: Spec 43's step table is IN SYNC for all 28 rows** against `manifest.chains.sources` — the batch-2 Phase 0.5 off-by-one concern does **not** apply to this row. Re-derived, not transcribed.
  3. `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 `:1969` — `| **62** | scripts/enrich-heritage.js | 3 — Enrich (Spec 61 §8d) | NO — set-based parcels heritage enrichment |`. §A.5 is already correct; only Spec 61 carries the stale numbers.
  4. Then 122 / 122a / 123 / 124.
* **Key files:** `scripts/enrich-heritage.js` (429 ln) · `scripts/lib/step/index.js` `runEnrichPhase` (anchor `async function runEnrichPhase(`) · `scripts/lib/step/write.js` (`set_based_join_update` executor, `function targetKey(index)`) · `scripts/manifest.json` (`scripts.enrich_heritage`, `chains.sources[12]`) · `scripts/load-parcels.js` (the invalidator, anchor `heritage_dataset_version_when_enriched = CASE`) · `scripts/enrich-permits.js` (the hard cross-chain consumer, anchor `assertHeritageEnriched`) · `scripts/steps/_schema/{converted,step-archetype-census,programme-items,execution-budget-disposition,template-freeze}.json` · `scripts/steps/_schema/fixtures/valid/enrich_heritage.descriptor.json` (**a pre-existing synthetic fixture bearing this slug's name — see §4.4**).

---

## §0. Measurements — every number carries the command that produced it (2026-09-20, HEAD `39b246c0`, local DB `127.0.0.1:54322/postgres`, `COUNT(*) FROM schema_migrations = 244`)

> Regenerated from the tree and the live DB for this plan. Nothing below is transcribed from a prior report, spec, or memory.

### §0.1 Live parcel state — one query

`SELECT COUNT(*), COUNT(*) FILTER (WHERE geom IS NOT NULL), COUNT(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom) AND ST_IsValid(geom)), COUNT(*) FILTER (WHERE is_heritage_designated), COUNT(*) FILTER (WHERE heritage_designation_type='part_iv_individual'), COUNT(*) FILTER (WHERE heritage_designation_type='part_v_hcd'), COUNT(*) FILTER (WHERE heritage_dataset_version_when_enriched IS NOT NULL), COUNT(DISTINCT heritage_dataset_version_when_enriched), COUNT(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)) FROM parcels`

| Fact | Value |
|---|---|
| `parcels` | **486,530** |
| geom-bearing | **486,530** |
| **ELIGIBLE** (`geom IS NOT NULL AND NOT ST_IsEmpty AND ST_IsValid`) | **486,514** |
| `is_heritage_designated` TRUE | **9,958** (2.047 %) |
| `part_iv_individual` | **1,217** |
| `part_v_hcd` | **8,741** (1,217 + 8,741 = 9,958 ✅) |
| stamped (`heritage_dataset_version_when_enriched IS NOT NULL`) | **486,514** (= eligible; the 16 invalid-geom parcels are correctly unstamped) |
| DISTINCT stamps | **1** = `bdca9c50f1243057ec70720b2e55dd4b|eb37b1a023ddccff155145a9fdd2e3d1` |
| invalid-geom | **16** |

### §0.2 Producer contract, read live (not from the spec)

`SELECT id, completed_at, jsonb_pretty(records_meta->'heritage_load') FROM pipeline_runs WHERE pipeline='sources:load_heritage' AND status='completed' ORDER BY completed_at DESC LIMIT 1` → **id 1470, 2026-07-08**: `spec_version "1.1"`; `heritage_register {feature_count 8824, drift_check_passed true, delete_skipped_empty_guard false, invalid_geometry_skipped 0, source_dataset_version "bdca9c50…"}`; `heritage_districts {feature_count 29, drift_check_passed true, source_dataset_version "eb37b1a0…"}`. The combined `datasetVersion` the consumer builds (`${reg}|${hcd}`) is **byte-identical to the single distinct stamp in §0.1**.

**⇒ `staleCount = 0` today.** Verified directly: `SELECT COUNT(*) FROM parcels WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom) AND ST_IsValid(geom) AND heritage_dataset_version_when_enriched IS DISTINCT FROM 'bdca9c50…|eb37b1a0…'` = **0**. **Both golden sides will therefore capture the zero-write path**, exactly as row 2.1 did — which is why §4.5 mandates a separate **NULL-stamped cohort differential** (FOLD-I1; a forced-FULL run would NOT do, see §3.5).

### §0.3 **Row 2.2's declared upstream defect is REFUTED — do not pin it**

Row 2.2 instructs: *"Live upstream defect to PIN, not fix (Spec 123 §3.1): review_followups row 426 — the Q2 2026 Heritage Register dropped OBJECTID, so load-heritage.js parseRegister keys coerceSourceId(p.OBJECTID) → null."* **Measured today, three ways, all disagreeing with that sentence:**
1. `review_followups.md:2646` row 426's own title already reads **"RESOLVED (WF3)"**.
2. `scripts/load-heritage.js:334` reads `const sourceId = coerceSourceId(p.Folder_Row);` with the comment at `:331-333` `"#426: the Q2 2026 CKAN refresh dropped OBJECTID; Folder_Row is the new stable unique key"`. `git log --follow` names the fix: **`78748a36 fix(61_source_heritage): re-key register source_id OBJECTID->Folder_Row (#426)`, 2026-06-05**.
3. The live table is loaded and post-fix: `SELECT status, count(*), min(updated_at), count(DISTINCT source_dataset_version) FROM heritage_properties GROUP BY status` → `part_iv 1,557` + `part_v_member 7,267` = **8,824**, all `updated_at 2026-06-10T14:22:52Z` (five days AFTER the fix commit), one `source_dataset_version` matching §0.2's `feature_count 8824`.

**Disposition: PIN NOTHING.** The dependency is declared honestly instead — `inputs.reads.steps[0] = {step:"load_heritage", version_pin:"exact"}` — and the refutation is recorded in the assessment's PH-0 with these three pieces of evidence, so the next reader does not re-litigate it. Row 2.2's text in `.cursor/batch2_c5_active_task.md:307` is stale-by-three-months and is **not** amended by this WF (that file is another WF's artifact); the refutation is stated here and in the assessment.

### §0.4 Runtime — from the local ledger, all 7 rows

`SELECT id, status, duration_ms, records_updated, started_at FROM pipeline_runs WHERE pipeline='sources:enrich_heritage' ORDER BY id DESC` → **7 rows, all `completed`.**

| Path | Rows | duration_ms | `records_updated` |
|---|---|---|---|
| **Layer-1 SKIP** | 5 (ids **1476, 1398, 1384, 1357, 1077**) | **25,357 – 38,875 ms** (25.4 – **38.9 s**; the max is id **1476**) | 0 |
| **Full recompute** | 2 (id 1062 @ 2026-06-10; id 1283 @ 2026-06-25) | **59,004 ms / 75,248 ms** (59.0 s / 75.2 s) | **486,514** (both) |

**⇒ the containment join itself costs ≈ 25–40 s locally** (full minus skip). Unlike `enrich_ravines` (35.4 min), **a full re-evaluation here is ~1 minute**, which is what makes §4.5's cohort differential affordable enough to be mandatory.

Post-phase query costs, timed individually today (three `pool.query` calls, wall clock): coverage aggregate **4,570 ms** · unlinked-Part-IV-points `NOT EXISTS` **266 ms** · `countStale` probe **1,656 ms**. Total post-phase ≈ **5 s**.

### §0.5 Registry / fleet state that this conversion moves

| Artifact | Today (measured) | At cutover |
|---|---|---|
| `converted.json` | `converted[] = 16`, `pending: []` | `converted[] = 17`, `pending[]` entry ADDED at ① and **DELETED in the same commit as the append** (R-K mutual exclusion) |
| Declared logic-variable probe list | **191** (`node -e "require('./scripts/lib/declared-logic-variables').collectDeclaredLogicVariableNames().length"`, and `assert-schema.descriptor.json`'s `config.probe_presence.length` = 191) | **201** (+10, §2) — plus the four `assert_schema` golden recaptures its own fingerprint move forces |
| `src/tests/step-seam.logic.test.ts:57` | "the REAL **16**-descriptor registry … yields **9** live pairs" | **17 descriptors / 9 pairs** (FOLD-V-nit: the pre-fold draft said 17/**10**, which was arithmetic, not enumeration). `enrich_heritage`'s only `inputs.reads.steps` entry is `load_heritage`, **NOT converted** (C5 row 3.4) ⇒ **0** new pairs from this step's reads; and **no converted descriptor declares `enrich_heritage` as an upstream** ⇒ **0** new pairs from the other side (that gap is exactly FOLD-I2/EH-D4, which is allowlisted rather than declared). So the DESCRIPTOR count moves and the PAIR count does not. **Still verify by re-running the enumeration, not by arithmetic** — this nit is what the rule exists for. |
| `src/tests/write-class-disposition.infra.test.ts:410` | `expect(contentionFindings.length).toBe(16)` | **17** — descriptor-scoped, so it moves at commit ②, **not** at cutover |
| `src/tests/conversion-roadmap.infra.test.ts` `:115/:133/:134` | "47 remaining files, 49 remaining slugs … the 16 converted" | **46 / 48 / 17** |
| same file `:185`, `:490` | `c5.size / c5` `toBe(11)` / `toHaveLength(11)` | **10** |
| `src/tests/step-schema.logic.test.ts:734` | `expect(enrichers, 'exactly three converted ENRICHERs …').toEqual(['scripts/enrich-parcels.descriptor.json','scripts/geocode-permits.descriptor.json','scripts/enrich-ravines.descriptor.json'])` — **a pinned LIST, not a count** ("pinned rather than counted so a THIRD member still has to come here and say so", `:732-733`) | **four** — append `scripts/enrich-heritage.descriptor.json` **and rewrite the assertion message** to say what the fourth member is (FOLD-I3) |
| `src/tests/step-schema.logic.test.ts` `:354`, `:534` | ENRICHER exemplar = `fixtures/valid/enrich_heritage.descriptor.json` | **see §4.4 — a name collision that must be adjudicated, not assumed inert** |
| `src/tests/step-conformance.infra.test.ts:2167` `KNOWN_GAPS` | `enrich_parcels: { missing: ['enrich_ravines'], extra: [] }, // RV-D5` | **`missing: ['enrich_heritage','enrich_ravines']`** (FOLD-I2) — MEASURED cause: `scripts/lib/compute/enrich-parcels.js:460/:587/:593/:597` reads `is_heritage_designated`, so the moment `enrich_heritage` enters `converted[]` the ledger's column-overlap derivation SEES a dependency `enrich_parcels` never declared. **Identical class and identical disposition to LDG-D1 / LDG-D2 / RV-D5** — allowlist it (locked both directions), do **not** fix it: declaring it would move `enrich_parcels`' own seam pairs, out of scope for this conversion. New ledger id **EH-D4**; the comment block above the row is extended in the same style, and a followups row is filed |
| `programme-items.json` `CLOUD-PRE.gate.blocks[]` | contains **`enrich_heritage`** (11 slugs) | **REMOVE `enrich_heritage`** by hand at cutover (registry invariant #9: an already-converted slug cannot be blocked by a `cutover_prereq`) **and regenerate `docs/reports/generated/122-programme-backlog.md` in the SAME commit** |
| `execution-budget-disposition.json` `declarations.step_timeout.pending[]` | 14 slugs, **`enrich_heritage` ABSENT** | **ADD `enrich_heritage`** with a dated `pending_why` (R-AJ/R-X) |
| `manifest.json` `scripts.enrich_heritage` | `{file, supports_full:false, supports_dry_run:false, telemetry_tables:["parcels"], telemetry_null_cols:{parcels:["heritage_designation_type","heritage_designation_date"]}}` — **no `step_timeout_minutes`, no `chain_args`** | unchanged (which is exactly why the `pending[]` row above is required) |
| `scripts/seeds/logic_variables.json` | **ZERO `heritage_*` tunable rows** — grep returns only `sources_heritage_properties_floor` and `sources_heritage_districts_floor` (the LOADER's bounds). All three live tunables are Zod defaults only. | +10 rows (§2) |

---

## §1. Assessment of the legacy step (regenerated — every claim executed or read from the file)

**Shape.** `pipeline.run('enrich-heritage', main)`; one `withAdvisoryLock(pool, 62)`; **one** `withTransaction` on the recompute path only; 13 named exports.

**Reads.** `emitMeta` (`:345-352`) declares `{heritage_properties:['geom','status','address_text','designated_date'], heritage_districts:['geom','designated_date'], parcels:['id','geom','addr_num_normalized','street_name_normalized','street_type_normalized']}`. The SQL reads **more**: `parcels.heritage_dataset_version_when_enriched` (the `countStale` probe + the guard), `parcels.is_heritage_designated` / `heritage_designation_type` / `heritage_designation_date` (the 4-column guard), `heritage_properties.id`, `heritage_districts.id`, plus `pipeline_runs.records_meta` (the §9/L23 contract). → declared-reads gap, ledger as **EH-D1** at ①; the descriptor declares the WIDENED, honest set.

**Writes — 4 columns, ONE set-based UPDATE, all four IS-DISTINCT-FROM-guarded** (`ENRICH_SQL:257-260`):

| Column | Type | In the guard | Source |
|---|---|---|---|
| `is_heritage_designated` | bool | ✅ | `(hcd_id IS NOT NULL OR hp_id IS NOT NULL)` |
| `heritage_designation_type` | text | ✅ | `CASE … hp_id → 'part_iv_individual' … hcd_id → 'part_v_hcd' … ELSE NULL` (**L12: Part IV wins**) |
| `heritage_designation_date` | date | ✅ | the winning side's `designated_date` |
| `heritage_dataset_version_when_enriched` | text | ✅ | `$2` = `<register_version>|<districts_version>` |

**⚠ THE STRUCTURAL DIFFERENCE FROM ROW 2.1 — READ BEFORE ANYTHING ELSE.** `enrich_ravines` has **two** #418 layers: a Layer-1 early return AND a Layer-2 stale predicate inside `parcel_c`. **`enrich_heritage` has ONLY Layer-1.** `ENRICH_SQL`'s `parcel_c` CTE (`:206`) reads `WHERE p.geom IS NOT NULL AND NOT ST_IsEmpty(p.geom) AND ST_IsValid(p.geom)` — **no lineage predicate**. Once `staleCount > 0` the join re-evaluates **all 486,514 eligible parcels** (which is exactly why both full-recompute ledger rows read `records_updated = 486,514`: the stamp changes for every row). The ENRICHER runner has **no** gated-skip branch by design (`runEnrichPhase`'s own docblock; `step-validate.mjs`'s `runnerReachability` ENRICHER arm), so retiring Layer-1 **without** adding Layer-2 makes **every scheduled run pay the full containment join** — a measured ≈ 25–40 s local regression per run, and an unmeasured multiple of that on Supabase Small.

> **RULED — H-A1 = (a), ADOPTED (operator, 2026-09-20).** A Layer-2 predicate is ported into `parcel_c` in this conversion. Plan-panel grounding, **re-verified against the code for this fold, not transcribed:** `runEnrichPhase` contains no `ledgerGatedSkip` call at all (grep of `scripts/lib/step/index.js`'s ENRICHER arm), so Layer-1 has no runner home · all three converted ENRICHER descriptors declare `staleness.trigger[0].signal: "always"` with the stale predicate living **inside the compute SQL**, not in a runner gate · this step's Layer-1 probe (`countStale`, `:141-149`) applies the *identical* predicate the new `parcel_c` clause will apply (`eligibility AND stamp IS DISTINCT FROM $2`), so **Layer-2 subsumes Layer-1** rather than replacing it with something weaker. The consequences are now DECIDED, not optional: `execution.phases[0].scope: "incremental"` · `write_discipline.scope` carries the predicate · `override.force_full: "ENRICH_HERITAGE_FORCE_FULL"` is RETAINED and load-bearing (§3.5) · `staleness.mode_select: "tri_state"` (the `enrich_parcels` precedent — measured: it is the one converted ENRICHER that declares a `force_full` env, and it declares `tri_state`; `compute_centroids`/`link_parcel_addresses` declare `"none"` beside a `force_full`, so this is a real choice and ① states which behaviour it names). See **FOLD-I5** for what (a) knowingly gives up.

**The wedge-open trap (already closed, must stay closed).** `countStale` (`:141-149`) deliberately MIRRORS `ENRICH_SQL`'s full eligibility predicate (`NOT ST_IsEmpty AND ST_IsValid`), not ravines' bare `geom IS NOT NULL`. Its docblock (`:128-140`) states why: the 16 invalid-geom parcels can never be stamped by the UPDATE, so a naive port would count them stale **forever** and the skip branch would be dead code behind a green suite. **Any Layer-2 predicate this conversion adds MUST carry the same mirrored eligibility, and the existing textual mirror-lock (`src/tests/enrich-heritage-418.logic.test.ts` "H1 (textual mirror-lock, pre-behavioral)") must be re-pointed at the compute module, never dropped.**

**Locks / txn / exits.** `ADVISORY_LOCK_ID = 62` (DEC-A). Exits: (a) skip — `emitHeritageResults` then return; (b) recompute — one `withTransaction` wrapping `assertPreconditions(client)` + the UPDATE, then emit; (c) `lockResult.acquired === false` → SDK SKIP summary; (d) **eleven** distinct throws: 7 in `readHeritageContract` (`:62/:66/:71/:72/:75/:78/:82/:85/:86` — producer missing · spec_version ≠ 1.1 · register sub-block missing · districts sub-block missing · register `feature_count` ≤ 0 · districts `feature_count` ≤ 0 · either `drift_check_passed === false` · register lineage empty · districts lineage empty), 2 in `assertHeritageSourceNonEmpty` (L14, both tables), 1 in `assertVersionColumn` (migration 171), and 8 in `assertPreconditions` (PostGIS · `fuzzystrmatch` · `normalize_address()` · 3 GIST indexes · the 4-column M-2 check · SRID ≠ 4326). All become declared `terminals[]` + `guards.requires[]`.

**Audit rows (10) + counters.** `emitHeritageResults` (`:281-357`) re-queries coverage **live on every call, including the skip path** (the F7 fence) and emits, in order: `parcels_heritage_designated_count` (**FAIL iff 0**) · `parcels_part_iv_count` (**WARN iff `partIv === 0 && partIvSource > 0`**) · `parcels_part_v_hcd_count` · `heritage_part_iv_source_count` · `heritage_points_no_parcel_match` (**FAIL > fail_pct / WARN > warn_pct / else INFO**) · `parcels_invalid_geom_count` · `parcels_enriched_count` · `parcels_heritage_enrich_skipped` · `heritage_source_dataset_version` (**a STRING value** — the RV-D3 class; the frozen row builder admits it, proven by `enrich_ravines`' own landed `ravine_source_dataset_version` row) · `enrich_heritage_duration_ms`. Verdict is row-derived (`verdictCascade`, `:270`). Counters: `records_total: null`, `records_new: null`, `records_updated: updated`.

**Two audit rows whose severity is NOT a simple bound — ported by grammar, with the diff declared** (Spec 124 §7 rung (b)+(c), never a second code path):
* `parcels_heritage_designated_count`: `limit "value_min 1"` + `limit_from_config enrich_heritage_designated_min_count` (seed **1**), `severity FAIL` — **exact**: 0 → FAIL, ≥1 → PASS.
* `parcels_part_iv_count`: `limit "value_min 1"` + `limit_from_config enrich_heritage_part_iv_min_count` (seed **1**), `severity WARN`. **Declared diff (ledger EH-D2):** the legacy's WARN is conditional on `partIvSource > 0`; the ported bound is unconditional. The two differ **only** when the register loads zero `part_iv` points, where the converted form is **louder** (WARN vs INFO), never quieter. Recorded in `deviations[]`, adjudicated by Spec 124 §7 rung (b) ("a declared check / audit row"), **not** by re-implementing a two-input rule in compute (Rule 2).
* `heritage_points_no_parcel_match`: R-AD 3-tier — `limit "pct <= 15"` + `limit_from_config enrich_heritage_unlinked_point_warn_pct`, `warn_limit "pct <= 30"` + `warn_limit_from_config enrich_heritage_unlinked_point_fail_pct`, `severity FAIL`. **Unit note, load-bearing:** the legacy compares a **fraction** (`unmatchedFrac`, 0.104) against config fractions (0.15/0.30) while REPORTING a **percentage** (`Math.round(frac*1000)/10` = 10.4). The converted check compares the reported value, so the seeds are **15 / 30**, not 0.15 / 0.30. Comparison semantics are identical; the INFO→PASS tier rename is a declared Class A diff.

**Downstream consumers of the four written columns** — grep of `scripts/ src/` for the four names, every hit triaged (9 files, tests excluded):
`scripts/enrich-permits.js` — **the hard cross-chain dependency**: `assertHeritageEnriched` (`:152-154`) **HALTS the permits chain** if no parcel carries a stamp; `:378/:411-415/:435-444/:528-530` propagate the three value columns onto `permits` + `coa_applications` · `scripts/lib/compute/enrich-parcels.js:460` (`COALESCE(p.is_heritage_designated,false)`), `:587/:593` (the ravine∧¬heritage envelope branch), `:597` · `scripts/lib/compute/assert-global-coverage.js:153-155,377-379` + `scripts/lib/assert-global-coverage-fields.js:130-132,301-303` (6 INFO rows on the **propagated** permits/CoA columns) · `scripts/load-parcels.js:356-358` (**the invalidator**) · `scripts/analysis/parcel-field-dump.js:19` (carries `is_heritage_designated` only — see §7 F-RC2) · `src/lib/admin/parcel-lookup.ts` · `src/lib/db/generated/schema.ts`. **Commit ① re-runs this grep** and adds every consumer of `scripts/lib/compute/enrich-heritage.js` the moment that module exists.

**The invalidator, measured (not assumed).** `scripts/load-parcels.js:356-358`: `heritage_dataset_version_when_enriched = CASE WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb THEN NULL ELSE parcels.heritage_dataset_version_when_enriched END` — the same DEC-FENCE2 mechanism that covers the ravine and centreline stamps. Migration 242's `trg_parcels_geom_invalidation` deliberately does **not** cover it. `outputs.invalidates[]` declares this, and Spec 124 §3's ENRICHER cell (`124:154`, "`invalidates` required when `staleness.scope` keys a lineage column") makes it mandatory, not optional.

---

## §2. Tunables census — **10 new logic variables**, prefix `enrich_heritage_*`, all `on_invalid: "fail"`

Rule 3 (`124:65`): *"Every threshold, sample size, byte window, timeout, retry count, limit, or rate a step consumes is a registered logic variable resolved through `ctx.config`, never a literal."* Spec 122 §1.2a P4 — **a Zod default wearing a variable's name is a hidden literal**; this step has a `ConfigSchema` (`:38-49`) and calls `loadMarketplaceConfigs(pool,'enrich-heritage')`, but **`scripts/seeds/logic_variables.json` has ZERO matching rows** (measured, §0.5), so all three "configurable" values are literals today. Spec 61 `:456` already mandates "7 heritage_* keys per §12.3a" and that mandate has never been met.

| # | Variable | Seed = current | min / max | Group | Legacy anchor |
|---:|---|---:|---|---|---|
| 1 | `enrich_heritage_address_levenshtein_threshold` | **2** | 0 / 10 | Data Quality Thresholds | `heritageAddressLevenshteinThreshold: z.number().int().nonnegative().default(2)` `:42`; consumed as `$1` in `ENRICH_SQL:228`. **Its seed description MUST carry the FOLD-I5 sentence**: *"changing this value does NOT re-stale any parcel — the stamp is a source-content hash, so a threshold change only takes effect on the next genuine version bump or on an `ENRICH_HERITAGE_FORCE_FULL` run."* |
| 2 | `enrich_heritage_unlinked_point_warn_pct` | **15** | 0 / 100 | Data Quality Thresholds | `heritageUnlinkedPointWarnPct … .default(0.15)` `:47` (**unit change fraction→pct, §1**) |
| 3 | `enrich_heritage_unlinked_point_fail_pct` | **30** | 0 / 100 | Data Quality Thresholds | `heritageUnlinkedPointFailPct … .default(0.30)` `:48` |
| 4 | `enrich_heritage_designated_min_count` | **1** | 0 / 500000 | Data Quality Thresholds | the `designated === 0 ? 'FAIL'` literal, `:309` |
| 5 | `enrich_heritage_part_iv_min_count` | **1** | 0 / 500000 | Data Quality Thresholds | the `(partIv === 0 && partIvSource > 0) ? 'WARN'` literal, `:311` (see EH-D2) |
| 6 | `enrich_heritage_heartbeat_minutes` | **5** | 1 / 60 | Source Ingestion | **NEW** — REQUIRED on the ENRICHER profile (`step.schema.json` ENRICHER `allOf`, R-AK `124:220`). Mirrors `geocode_permits_heartbeat_minutes` / `enrich_ravines_heartbeat_minutes` = 5 |
| 7 | `enrich_heritage_lock_timeout_ms` | **1800000** | 0 / 3600000 | Source Ingestion | **NEW** — REQUIRED, same row; mirrors both siblings |
| 8 | `enrich_heritage_phase_timeout_minutes` | **240** | 0 / 290 | Source Ingestion | **NEW** — `execution.phases[0].timeout_minutes_from_config`. **RULED H-A2 = 240** (operator, 2026-09-20) |
| 9 | `enrich_heritage_designated_share_plausible_max_pct` | **10** | 0 / 100 | Data Quality Thresholds | **NEW (Reality-Check, §7)** — ceiling on the designated share; measured **2.047 %** |
| 10 | `enrich_heritage_designated_count_collapse_floor` | **1000** | 0 / 500000 | Data Quality Thresholds | **NEW (Reality-Check O4-class, §7)** — a FLOOR the two ceilings above cannot see; measured **9,958** |

Vars 6–8 are a **deliberate, declared behaviour ADDITION** (the legacy has no heartbeat, no `lock_timeout`, no `statement_timeout`) — recorded as a Class A diff, following I5's own governing precedent, not smuggled as "parity".

**NOT tunables.** `SPEC_VERSION='1.1'` and `PRODUCER_NAME='sources:load_heritage'` are strings; `config.logic_variables[]` is `{name,min,max,on_invalid}`, numbers only. `SPEC_VERSION` becomes declared data inside the `contract_read` check's `expect`/`why`; `PRODUCER_NAME` becomes `inputs.reads.steps[0]`. **`heritage_point_match_radius_m` is declared in `config.retired[]`** — Spec 61 `:909-910` seeds it and its own `_note_radius_retired` calls it "DEAD CONFIG"; the legacy `ConfigSchema` comment (`:39-41`) says it is "Left out of the schema rather than declared-and-ignored". Declaring it retired is the honest form and costs no seed row.

**Do NOT use `inputs.reads.steps[].assert_health`** for the producer-health gates — RV-L1, re-verified for this plan: the field exists in `step.schema.json` and has **zero** runtime consumers anywhere in the tree. A declared guard that cannot arm is a Rule 12 violation.

**FOLD-I5 — what option (a) knowingly gives up, declared rather than discovered.** Re-derived from the code, not transcribed: the stamp is `<register>|<districts>`, a **source-content** hash, and `load-parcels.js:356-358` nulls it **only** on a `geometry::jsonb` change. Therefore, under the Layer-2 scope, **two classes of input change no longer re-enter scope on their own**:
1. **A `enrich_heritage_address_levenshtein_threshold` change** — the tiebreak only decides *which* Part IV point wins inside a parcel that contains more than one. **Impact bound, MEASURED:** `WITH m AS (SELECT p.id, COUNT(*) n FROM parcels p JOIN heritage_properties hp ON hp.status='part_iv' AND ST_Intersects(p.geom,hp.geom) WHERE <eligibility> GROUP BY p.id) SELECT COUNT(*) FILTER (WHERE n>1), SUM(n) FILTER (WHERE n>1), MAX(n), COUNT(*) FROM m` → **94** multi-point parcels holding **272** points (max **15** in one parcel), out of **1,217** parcels with any Part IV point. The winner's `heritage_designation_type` is `part_iv_individual` either way, so **the only field that can move is `heritage_designation_date`, on at most 94 parcels.**
2. **An address-only parcel change** (`addr_num_normalized` / `street_name_normalized` / `street_type_normalized` rewritten with an unchanged geometry) — the `norm_addr` side of the same tiebreak, same 94-parcel bound.

The legacy healed both **by accident**: with no Layer-2 it re-evaluated all 486,514 parcels on any run where `staleCount > 0`. That is a side effect of the missing predicate, not a designed guarantee. **Disposition: DECLARED, not fixed** — a `limitations[]` entry naming both classes, the 94/272/15 measurement, and the remedy (`ENRICH_HERITAGE_FORCE_FULL`, which is exactly why `override.force_full` is retained). **The per-row/predicate-widened invalidation idea (e.g. stamping the resolved threshold into the lineage string, or nulling the stamp on an address change) is FILED to `review_followups.md` at cutover and is NOT in scope here.**

**RV-L3 does NOT need to be pulled forward.** The prompt asks explicitly. MEASURED: `readHeritageContract` (`:54-89`) contains **no numeric threshold at all** — every gate is `!x`, `=== false`, or `> 0`. Unlike `enrich_ravines`' 5 % invalid-geometry ratio, nothing in this step's contract read needs `config`. The runner's `contractHook` is still called as `hookFn(pool)` only (`scripts/lib/step/index.js`, anchor `resolveHook(contractHook, 'execution.enrich_hooks.contract_read')(pool)`), and **this conversion does not need that to change.** Recorded as a limitation cross-referencing RV-L3, not re-opened.

**Two mandatory downstream flows:**
* **(a) probe list lands at CUTOVER, not ①.** `collectDeclaredLogicVariableNames()` reads `converted.json`'s `converted[]` **only**, so a `pending[]` entry is invisible to it. 191 → **201** at ③, in the same commit as the four `assert_schema` golden recaptures and `src/tests/control-panel.logic.test.ts`'s expected-keys pin.
* **(b) cloud seed is an OPERATOR FOLLOW-UP, listed and not performed here** (§12 Not-in-scope): runbook §1a, Git Bash, invoked directly — `SUPABASE_CA_CERT_PATH=scripts/certs/supabase-ca.pem PG_HOST= DATABASE_URL=$SUPABASE_DATABASE_URL node -r dotenv/config scripts/seeds/apply-logic-variables.js` — verifying **VALUES, not the insert count** (`ON CONFLICT DO NOTHING`), because `scripts/lib/step/config.js` THROWS (LM-D15) on a declared variable with no row.

---

## §3. Descriptor draft — `scripts/enrich-heritage.descriptor.json` (ENRICHER, generic runner)

Template = `scripts/enrich-ravines.descriptor.json` (the freshest ENRICHER, landed 3 days ago). All top-level keys required, `additionalProperties:false` everywhere.

### 3.1 Skeleton (the fields that differ from 2.1 are the ones that matter)

```jsonc
{
  "identity": { "name": "enrich_heritage", "display_name": "Parcel Heritage Designation",
    "owner": "data", "lock": 62,
    "why_lock": { "text": "DEC-A — sibling of load_heritage=61; 62 verified free. Spec 61 :441/:852/:934 still print 63 and are corrected by this conversion's spec diff; Spec 47 §A.5 :1969 already reads 62. Kept textually per Spec 122 §5.4 so pipeline-advisory-lock.infra.test.ts's LOCK_ID_REGISTRY stays green.", "liveness": {"kind":"spec","ref":"docs/specs/01-pipeline/47_pipeline_script_protocol.md"} },
    "spec": "61", "spec_version": "1.1", "archetype": "ENRICHER",
    "contract_version": 1, "gate_exempt": false },

  "inputs": { "reads": { "steps": [{ "step": "load_heritage", "version_pin": "exact" }],
      "tables": [ {"table":"heritage_properties","columns":["id","geom","status","address_text","designated_date"]},
                  {"table":"heritage_districts","columns":["id","geom","designated_date"]},
                  {"table":"parcels","columns":["id","geom","addr_num_normalized","street_name_normalized","street_type_normalized","is_heritage_designated","heritage_designation_type","heritage_designation_date","heritage_dataset_version_when_enriched"]} ],
      "externals": [] },
    "expect_nonempty": true, "on_missing": "halt" },

  "guards": { "requires": [
      {"kind":"extension","name":"postgis","on_missing":"fail","why":{…}},
      {"kind":"extension","name":"fuzzystrmatch","on_missing":"fail","why":{"text":"migration 170 — levenshtein() is the Part IV tiebreak; absent, the join fails mid-statement instead of refusing up front."}},
      {"kind":"index","name":"idx_parcels_geom_gist","on_missing":"fail","why":{…}},
      {"kind":"index","name":"idx_heritage_districts_geom_gist","on_missing":"fail","why":{…}},
      {"kind":"index","name":"idx_heritage_properties_geom_gist","on_missing":"fail","why":{…}},
      {"kind":"column","name":"parcels.heritage_dataset_version_when_enriched","on_missing":"fail","why":{"text":"migration 171. The legacy assertVersionColumn existed because the stale-count probe reads this column AHEAD of assertPreconditions; without the guard a missing column surfaces as a raw pg 42703, not a named refusal."}},
      {"kind":"column","name":"parcels.is_heritage_designated","on_missing":"fail","why":{"text":"M-2 / L24 — one of the four migration-171 columns the legacy asserted as a 4-of-4 count."}},
      {"kind":"column","name":"parcels.heritage_designation_type","on_missing":"fail","why":{…}},
      {"kind":"column","name":"parcels.heritage_designation_date","on_missing":"fail","why":{…}} ],
    "srid": 4326, "empty_source": "heritage_properties", "schema_drift": "pause" },

  "execution": { "shape": "enrich",
    "heartbeat_minutes_from_config": "enrich_heritage_heartbeat_minutes",
    "lock_timeout_ms_from_config": "enrich_heritage_lock_timeout_ms",
    "enrich_hooks": { "contract_read": "readHeritageContract", "post_phase": "computePostPhase" },
    "phases": [ { "name": "heritage_join", "order": 1, "txn": "shared", "writes_ref": 0,
                  "scope": "incremental",           // H-A1 (a), RULED
                  "invalidator_ref": 0,
                  "timeout_minutes_from_config": "enrich_heritage_phase_timeout_minutes" } ],
    "budget": "60m", "txn_scope": "step", "txn_budget": "55m", "chunked": false,
    "statement_timeout": "none", "step_timeout": "90m", "batch": "none", "needs_disk_mb": "none",
    "partial_fill": "atomic", "on_row_error": "fail_fast", "on_batch_error": "fail_step",
    "on_check_error": "fail_step", "on_check_error_why": {…}, "on_degrade": "none",
    "criticality": "required", "network": "none", "maintenance": "none",
    "invocation": { "sources": { "argv": [], "env": { "PIPELINE_CHAIN": "sources" } } } },

  "outputs": { "writes": [ { "table": "parcels", "key": ["id"],
      "columns": [ 4 rows, every one vocabulary:"none", written:"step", bind:"value", source:"compute" ],
      "write_discipline": { "class": "set_based_join_update", "guard": "is_distinct_from",
        "guard_columns": ["is_heritage_designated","heritage_designation_type","heritage_designation_date","heritage_dataset_version_when_enriched"],
        "guard_columns_why": {"text":"The verbatim 4-column guard, ENRICH_SQL:257-260. The lineage stamp is INSIDE the guard: like enrich_ravines' and unlike geocode_permits' run-clock geocoded_at, it is a content hash of the two source datasets, constant across runs against the same load, so including it is what makes a second run write 0 rows instead of re-stamping 486,514."},
        "scope": "p.geom IS NOT NULL AND NOT ST_IsEmpty(p.geom) AND ST_IsValid(p.geom) AND p.heritage_dataset_version_when_enriched IS DISTINCT FROM $2",   // H-A1 (a), RULED — byte-identical to the legacy countStale predicate
        "expected_change_ratio": "none", "idempotent_rerun": "zero_writes", "txn_scope": "step" },
      "retract": "none", "replay": "idempotent_upsert",
      "source_key_policy": { "unique": true, "on_collision": "not_applicable", "key_space_migration": "none" } } ],
    "cascades": "none",
    "invalidates": [ { "table":"parcels", "column":"heritage_dataset_version_when_enriched",
      "when": "load-parcels.js's ON CONFLICT nulls the stamp via a CASE gated ONLY on parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb (DEC-FENCE2, anchor `heritage_dataset_version_when_enriched = CASE`) — app code, NOT migration 242's trigger, which deliberately covers only massing/zoning. A load_heritage source_dataset_version bump on EITHER dataset stales every parcel, because the stamp is the two versions concatenated." } ],
    "publish": "none",
    "write_inventory": { "statements": 1, "why": {…} } },

  "staleness": { "scope": "eligible parcels (geom non-null, non-empty, valid) whose heritage_dataset_version_when_enriched IS DISTINCT FROM `<register>|<districts>` from the producer's most recent completed run",
    "trigger": [{ "signal": "always", "position": "pre_compute" }], "mode_select": "tri_state",   // the enrich_parcels precedent; ① states the behaviour it names (LN-D9 antibody)
    "checkpoint": "none", "interval": "none", "fingerprint": "derived",
    "fingerprint_inputs": ["scripts/lib/compute/enrich-heritage.js"],
    "logic_version": "v1-containment-lateral", "on_fingerprint_change": "run" },

  "checks": [ 10 rows, ported BY ID in emit order — see §1 for the three whose severity is a bound ],
  "invariants": [ 4 rows — §7 ], "plausibility": [ 3 rows — §7 ],
  "override": { "force_full": "ENRICH_HERITAGE_FORCE_FULL", "force_run": "none", "dry_run": "none" },   // RETAINED and load-bearing — §3.5
  "emits": [ {"key":"duration_ms","type":"int","consumers":["src/lib/admin/funnel.ts","src/components/FreshnessTimeline.tsx"]},
             {"key":"code_version","type":"string","consumers":[]},
             {"key":"heritage_designated_by_zone","type":"object","consumers":[]} ],   // FOLD-RC1
  "counters": { "records_total": {"source":"matched.compute.eligible_parcels_scanned","scoped_by":"step"},
                "records_new":   {"source":"matched.compute.records_new_aggregate","scoped_by":"step"},
                "records_updated": {"source":"written.e1.updated","scoped_by":"step"} },
  "database": { "class": "primary", "min_migration": 244, "assert_current_database": "postgres" },
  "sharing": { "chains":"derived","shared":"derived","slug_forms":"derived",
    "varies_by_chain": { "checks":"none", "phase": { "sources": 13 }, "audit_table":"one", "scope":"none" },
    "on_contention": "self_skip" },
  "config": { "logic_variables": [ the 10 of §2 ], "validation": "strict", "hoisted_above_gate": true,
              "retired": ["heritage_point_match_radius_m"] },
  "terminals": [ lock_held_elsewhere · enriched · enriched_with_warnings · failed_contract_violation · failed_precondition · failed_config_out_of_bounds ],
  "deviations": [ EH-D2 (the part_iv conditional), the F9 Layer-1 disposition per H-A1 (a) RULED — mechanism retired, cost-observable preserved, value-equivalence proven by §4.5's cohort differential ],
  "limitations": [ EH-D1 declared-reads gap · the RV-L2 srid/empty_source note · the RV-L3 cross-ref · EH-D3 spec-citation drift (§6)
                   · **FOLD-I5 — the two input-change classes that no longer re-stale under (a)**, with the 94/272/15 measurement and the ENRICH_HERITAGE_FORCE_FULL remedy ]
}
```

### 3.2 `min_migration` is a COUNT floor, never a filename
`SELECT COUNT(*) FROM schema_migrations` = **244** (measured). `tasks/lessons.md:124` / LW-D8: the sequence has filename gaps (43, 49, 50, 158), so a filename-numbered floor never resolves. `244`, by COUNT.

### 3.3 COUNTER-ROOT and the RV-D4 prerequisite
`records_updated` reads **`written.e1.updated`** (`write.js`, anchor `function targetKey(index)` → `e${index+1}`); the other two read **`matched.compute.<name>`**. A bare `compute.*` resolves NULL for every ENRICHER (`enrich_parcels` emitted three NULL counters for 13 days for exactly that reason).

**RV-D4 HAS LANDED — this section is rewritten to the landed world (FOLD-V-nit, re-verified 2026-09-20).** The runner now carries a `seamOwned` set (`scripts/lib/step/index.js`, anchors `const seamOwned = new Set();` `:3049`, `seamOwned.add(key)` `:3428`/`:3447`, and the guard `if (!seamOwned.has(key))` `:4025`): a target already reported through `ctx.joinUpdate`/`ctx.retract` **skips** the `PASS_SCANNED_FIELDS` fallback entirely, so the double-count is gone. `scripts/lib/compute/enrich-ravines.js:177` has been changed back to `return { updated, sourceDatasetVersion };` accordingly. **⇒ this step's pass returns `{ updated, sourceDatasetVersion }` — the legacy key name, no workaround.** ① still **executes** the proof rather than trusting it (one instrumented run asserting `written.e1.updated === rowCount`, not `2×rowCount`) because the change was uncommitted in the working tree when this plan was written; if the proof fails, HALT and ask — do **not** re-apply the `rows_updated` rename.

### 3.4 No runner change, no schema change — both to be PROVEN, not assumed
`passCtx.contract` already exists (landed in 2.1, `c9b217bd`), so `readHeritageContract`'s return reaches the pass through the same seam. `guards.requires`, `enrich_hooks`, `outputs.invalidates`, `checks[].warn_limit_from_config` (R-AD), `set_based_join_update`, and `bound`'s `value_min`/`value_max` grammar (`step.schema.json`, anchor `"pattern": "^(viol (==|<=)`) **all already exist**. ① proves: `node scripts/analysis/spec-split-check.mjs --check` clean (no schema edit ⇒ the 9-byte budget is untouched) and `generate-template-freeze.mjs` **plain** (never `--refresh`) clean. Any schema edit would be a numbered RE-FREEZE in 122a and an **Ask** (L5).

### 3.5 FOLD-I6 — the two seams, stated exactly, because they are NOT the same seam
**MEASURED at the call site, not assumed:** the runner calls the post-phase hook as `await postPhaseFn(pool, { passRaw, specs, full, runAt, config, descriptor, staleOverlays })` (`scripts/lib/step/index.js`, anchor `postPhaseFn(pool, { passRaw`). **`contract` is NOT in that argument object.** So:
* the **pass** receives `ctx.contract` (the 2.1 `passCtx.contract` seam) and reads `datasetVersion` from it for `$2`;
* the **pass RETURNS `{ updated, sourceDatasetVersion }`**, and `computePostPhase` reads the version out of `passRaw.heritage_join.sourceDatasetVersion` — **exactly the landed ravines form** (`scripts/lib/compute/enrich-ravines.js:177` `return { updated, sourceDatasetVersion };` and `const sourceDatasetVersion = join.sourceDatasetVersion;`). This is what feeds the `heritage_source_dataset_version` audit row.
* The key is `updated`, **not** `rows_updated`: RV-D4's `seamOwned` guard has landed (§3.3), so the fallback no longer double-counts a `ctx.joinUpdate`-reported target. ①'s instrumented proof is what licenses the name.
* **`parcels_heritage_enrich_skipped` derives as `updated === 0`** — the landed 2.1 precedent verbatim (`scripts/lib/compute/enrich-ravines.js`, anchor `const skipped = updated === 0;`). Earlier drafts of this plan said "re-derived from the scope count"; **there is no scope count in the post-phase hook** — `postPhaseFn` receives `passRaw`, not a scope tally — so that wording named a value that does not exist. Corrected here and everywhere it appeared.

**`override.force_full` under (a), and why it is not the differential instrument (FOLD-I1's premise, verified).** `runEnrichPhase` sets `full` from `process.argv.includes('--full') || overrides.force_full === true || interruptedRetraction.interrupted` (anchor `const full = process.argv.includes('--full')`). Compute selects the unscoped SQL on `ctx.full`. That is a genuine, reachable FULL mode — it is the remedy FOLD-I5 names — but **it cannot prove write-equivalence**, because with an unchanged source the 4-column guard writes 0 rows in FULL mode too. `0 === 0` is not evidence. §4.5 replaces the forced-FULL differential accordingly.

---

## §4. The COMPRESSED 3-commit breakdown (R-PACE-1, Spec 123 `:356`)

| # | Commit | Contents |
|---|---|---|
| **①** | **Assessment + RED suite** (PH-0…PH-7 folded into the report's own sections) | `docs/reports/2026-09-__-batch2-p2-2-enrich-heritage-assessment.md` (**new; MUST carry the literal `**Commit form: compressed (R-PACE-1)**` line** — fast invariant #24) · `docs/reports/defect-ledger.md` (EH-D1…EH-D3) · `docs/reports/review_followups.md` · `step-archetype-census.json` (row `batch` → `"pending"`) · `converted.json` `pending[] += {file:"scripts/enrich-heritage.js", registers_at:"commit 3", stage:"red_suite"}` · `src/tests/steps/enrich_heritage/violations.test.ts` (**every claim that is FALSE TODAY** as `it.fails()` with `// flips at: commit 3` — **but tests 13 (chain wiring: `toHaveLength(28)` + the `enrich_heritage === enrich_ravines + 1` adjacency) and the lock-62 source-text half of test 1 are ALREADY TRUE against the legacy file and ship as plain `it()`**; an `it.fails()` on a passing claim is itself red, and R-K's flip-at-cutover rule applies only to the claims the conversion makes true) · **the two golden PRE captures** (§4.5 — PRE lands HERE, per fast invariant #22 GOLD-PRE-FRESH) · **the LEGACY-side committed-perturbation differential (§4.5, FOLD-V1 — it must run while the legacy shell still exists), sequenced AFTER the PRE pair** · the executed RV-D4/`seamOwned` proof of §3.3 |
| **②** | **Conversion + golden differential** | `scripts/enrich-heritage.descriptor.json` · `scripts/lib/compute/enrich-heritage.js` · `scripts/enrich-heritage.js` → the frozen 7-statement shell · `scripts/seeds/logic_variables.json` (+10) · `scripts/generate-logic-variable-groups.mjs` (**+10 names, hand-added to the two ordered group lists — the generator does NOT infer membership**) · `src/features/admin-controls/generated/logic-variable-groups.json` · `docs/reference/logic-variables-registry.md` · `scripts/analysis/parcel-field-dump.js` (§7 F-RC2) · `converted.json` `stage` → `"shape_clean"` · `write-class-disposition.infra.test.ts:410` 16→17 · the two golden POST captures + the scored diff-class prediction · **the CONVERTED-side committed-perturbation differential (§4.5), sequenced AFTER the POST pair** · **`src/tests/db/enrich-heritage-kill-mid-run.db.test.ts` (new, §5)** · **all five existing test files dispositioned per §5 / FOLD-G1 / FOLD-V3** (re-derived or retired-with-successor; before/after assertion counts recorded per T7) · every `it.fails(` except the registration claim flipped to `it(` |
| **③** | **CUTOVER + spec diff** | `converted.json` (append to `converted[]` **and DELETE the `pending` entry in the same commit**, R-K) · census row **RETAINED** with `status:"converted"` + **`converted_at` = the REAL sha** (R-AO; 2.1 left the literal placeholder `"<cutover commit sha — fill in when commit 3 is actually committed>"` in the tree — **do not repeat that**) + the two census fixtures · `template-freeze.json` (`archetype_profiles` half) · **`docs/reports/defect-ledger.md` (EH-D4, the FOLD-I2 allowlist entry)** · **`programme-items.json` CLOUD-PRE `gate.blocks[]` − `enrich_heritage` (PERFORMED HERE — FOLD-I4) + `npm run programme-backlog` regenerated in the SAME commit** · `execution-budget-disposition.json` `declarations.step_timeout.pending[] + enrich_heritage` · **`src/tests/step-conformance.infra.test.ts` `KNOWN_GAPS.enrich_parcels.missing` += `enrich_heritage` (FOLD-I2, ledger EH-D4)** · **`src/tests/step-schema.logic.test.ts:734` three→four ENRICHERs, assertion message rewritten (FOLD-I3)** · `assert-schema.descriptor.json` probe list 191 → **201** + its four goldens · `src/tests/control-panel.logic.test.ts` · fleet pins (§0.5) · Spec **61** + Spec **43** diffs (§6) · `docs/specs/00-architecture/00_system_map.md` · every generated report (§4.2) · **the three followups of FOLD-I5 / FOLD-RC1 filed to `review_followups.md`** · `node scripts/analysis/step-validate.mjs --step=enrich_heritage --write` **in this same commit** (R-R, Spec 123 `:350`) · the last `it.fails(` flipped |

**Peel budget: up to 2 additional commits (②c, ③b), declared up front rather than discovered.** Row 2.1 needed exactly two (`c4e2b1bb` output-panel peel, `39b246c0` pre-push-rejection registry peel). Each peel = **one policy concern, green diff after every peel** (Spec 123 `:348`). **Total: 3 commits planned, 5 budgeted.**

### 4.1 The five traps row 2.1's panel / pre-push actually caught — each is a checklist line here, not a hope

- [ ] **T1 — the missed test file (2.1 O1, BLOCKING).** `src/tests/enrich-ravines.logic.test.ts` was left live-RED 10/10 after the conversion commit because this WF's own search missed it. **Here: FIVE files reference this step and EVERY ONE must be dispositioned in ②** — `src/tests/enrich-heritage.infra.test.ts` (165 ln), `src/tests/enrich-heritage.logic.test.ts` (24 ln), `src/tests/enrich-heritage-418.logic.test.ts` (151 ln), `src/tests/db/enrich-heritage-418.db.test.ts` (182 ln), `src/tests/db/enrich-permits-heritage.db.test.ts` (118 ln, **consumer-side — verify it does not require this step's exports**). The `-418.logic` file is the dangerous one: it carries SOURCE-TEXT locks on the legacy shell (`main() calls assertVersionColumn(pool) BEFORE countStale`, `forceFull short-circuits staleCount`, the H1 textual mirror-lock, and a "the commit body must NOT claim ... verbatim" correction lock). **Proof required: `npx vitest related` on each of the five, green, BEFORE ② is committed.**
- [ ] **T2 — the OTHER step's test file (2.1 RV-D6, found only POST-cutover).** `src/tests/steps/load_ravines/violations.test.ts#203` read the CONSUMER's source text and went red at cutover because it lives in a *different* step's file. **Here: `src/tests/steps/link_massing/violations.test.ts:1242-1245` already names `src/tests/enrich-heritage-418.logic.test.ts`**, and `src/tests/steps/load_heritage/…` does not exist yet. **Required search (run it, paste the output into the assessment): `grep -rn "enrich.heritage\|enrich_heritage" src/tests/ scripts/ docs/` — every hit triaged as re-pointed / false-positive / prose, with the triage table in the report.**
- [ ] **T3 — the claimed-but-unmade fold (2.1 O2).** F-RC2 was written into the assessment and never executed; `parcel-field-dump.js` had no diff. **Here: after ② is staged, `git diff --stat` is read against the assessment's own claim list, item by item, and the audit is recorded.** This step's F-RC2 is concrete: `scripts/analysis/parcel-field-dump.js:19` carries `is_heritage_designated` but **not** `heritage_designation_type`, `heritage_designation_date` or `heritage_dataset_version_when_enriched` — add all three, run live on ≥3 parcel ids, paste the output.
- [ ] **T4 — the two stale registry files (2.1 `39b246c0`, caught by the PRE-PUSH full suite).** Both are pre-declared above in ③: `execution-budget-disposition.json` `pending[]` (this step has `execution.step_timeout: "90m"` with **no** `manifest.scripts.enrich_heritage.step_timeout_minutes` counterpart — measured) and `docs/reports/generated/122-programme-backlog.md` (regenerate **after** the CLOUD-PRE `blocks[]` edit, same commit). **Proof: `npm run programme-backlog` produces a zero-diff re-run after ③ is staged.**
- [ ] **T5 — the CLOUD-PRE `blocks[]` hand-removal (2.1 O3).** **PERFORMED in ③ — this is a REGISTRY edit in this repo, not a cloud action** (FOLD-I4 resolved the contradiction this plan originally carried: an earlier draft listed it under both "commit ③" and "operator follow-up / performs neither"; the second was wrong and is deleted). Registry invariant #9 REQUIRES it — an already-converted slug cannot remain in a `cutover_prereq`'s `blocks[]` — and `docs/reports/generated/122-programme-backlog.md` must be regenerated in the SAME commit, which is exactly the drift that got 2.1 rejected at pre-push (`39b246c0`). What genuinely stays an operator follow-up is only the **cloud seed apply** and any **cloud dispatch**. The underlying complaint is NOT re-filed: hand-editing `blocks[]` at every cutover is already a HIGH in `review_followups.md` asking for a standing read-only CLOUD-PRE script. **Cite that row; do not open a second one.**
- [ ] **T7 (FOLD-G1/G2) — no assertion-count decrease.** Before ② is committed, record the per-file assertion count of all five existing test suites, before and after. **A decrease is a BLOCKER unless the commit body states the reason per case** (the `c9b217bd` standard: re-derive, never gut). The five tests of the FOLD-G1 table each have a named disposition; none is "delete".
- [ ] **T8 (FOLD-I1) — the cohort id list is COMMITTED, and the expected `records_updated` is written down BEFORE the run.** A differential whose expectation was chosen after seeing the result is not evidence (`tasks/lessons.md:108`).
- [ ] **T9 (FOLD-I2/I3) — the two fleet locks that only redden AT cutover.** `step-conformance.infra.test.ts`'s `KNOWN_GAPS` and `step-schema.logic.test.ts:734`'s pinned ENRICHER list are both invisible until `enrich_heritage` enters `converted[]`. **2.1 discovered its equivalent (RV-D5) only at commit 3.** Here they are pre-declared: run both suites in isolation immediately after staging ③, before the push.
- [ ] **T6 (new, this step) — the census `converted_at` placeholder.** `step-archetype-census.json`'s `enrich_ravines` row still carries the literal string `<cutover commit sha — fill in when commit 3 is actually committed>`. **Fill this step's with the real sha (an amend on ③ if necessary — never `--no-verify`), and file the 2.1 residue as a one-line followup.**

### 4.2 Regeneration order (L7) — quiet tree, LF endings, one at a time
local seed apply → `npm run logic-var-groups` → `npm run logic-vars-docs` → `node scripts/generate-assert-schema-probe-lists.js` (moves `assert_schema`'s own fingerprint → recapture its 4 goldens) → `generate-template-freeze.mjs` **plain** → `schema-to-vocab.mjs` → `npm run conversion-roadmap` → `npm run programme-backlog` → `npm run churn-complexity` → `npm run system-map` → `npm run lineage-docs` → golden recapture → `spec-split-check.mjs --check` → **`step-validate.mjs --all --write` LAST**. Never run `template-freeze.infra.test.ts` concurrently. Reviewers and implementer never run a full suite at the same time (`VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=2`; a 4-fork run was OS-killed — `tasks/lessons.md:191-193`). **The census has no generator — hand-edit, then re-run `conversion-roadmap`.**

### 4.3 Windows / hook discipline
After any patch landing, `git ls-files --eol` the touched files and normalize `w/crlf` → LF before testing (`tasks/lessons.md:180-182`). `npx vitest related` is only ever passed `src/**`/`scripts/**` `.ts|.tsx|.js|.mjs` paths (`:193`). The five live-DB suites run under **`BUILDO_TEST_DB=1 npm run test:db`**, never `npm run test` — R-AG (`124:214`) names `enrich-heritage.infra` **explicitly** in that set.

### 4.4 The pre-existing `enrich_heritage` schema FIXTURE — adjudicate, do not assume
`scripts/steps/_schema/fixtures/valid/enrich_heritage.descriptor.json` (287 ln) is a **synthetic** descriptor bearing this slug's real name: `identity.lock 62`, `archetype "ENRICHER"`, one phase named `heritage`, one check `designated_zero`, `counters.records_total.source "candidateParcels"`, **`config: "none"`**. It is the ENRICHER exemplar for `src/tests/step-schema.logic.test.ts:354` and `:534` (which mutates it to generate every negative). **Required at ①, both directions, and recorded in the report:**
1. Prove **no** fleet checker resolves the fixture as this step's descriptor (`step-validate.mjs`, `conversion-roadmap`, `write-class-disposition`, `golden-fingerprint`, the lock registry) — run each and diff.
2. Decide and state the disposition: **(a)** leave it untouched as a synthetic exemplar, with a header comment saying so and naming the real descriptor; **(b)** rename it to a synthetic slug. **Recommendation (a)** — it is cheaper and the test is about the SCHEMA, not this step. But if (1) shows any checker reaching it, this becomes an Ask.
3. Either way, the real descriptor and the fixture must not silently diverge into two contradictory "ENRICHER exemplars" — the report states which one is normative.

### 4.5 Golden protocol — exactly 2 captures per side, 4 total, plus the NULL-stamped cohort differential (FOLD-I1)
Single-chain step (`|C(S)| = 1`) ⇒ `--chain=sources` → **`sources.json`** and `--chain=none` → **`standalone.json`** (`step-validate` pairs `pre/`+`post/` by SHARED FILENAME). Sequential, back-to-back, POST at the same relative point as PRE. `--out` REFUSES an existing capture; a recapture needs `--overwrite` **and** a committed, clean target — which is why PRE lands inside ① (fast invariant #22 GOLD-PRE-FRESH). `docs/reports/golden/enrich_heritage/` does not exist yet (measured).

**Projection (mandatory):** `parcels` (486,530 rows) is over the 100,000 hash ceiling ⇒ `--table-columns=parcels:id,is_heritage_designated,heritage_designation_type,heritage_designation_date,heritage_dataset_version_when_enriched` with an explicit `id` order. That bypasses the ceiling (`ceiling_bypassed:"projected"`) and turns `table_state` into a **real write-equivalence proof**. **None of the four is a run clock** (unlike `geocoded_at`), so all four are safe to hash.

**A write-exercising differential is MANDATORY here — and FOLD-I1 REPLACES the forced-FULL form this plan originally proposed, because that form proves nothing.** Both golden sides run the zero-write path (§0.2), so the goldens never exercise the write. The original proposal — run `ENRICH_HERITAGE_FORCE_FULL=1` on both sides — is **vacuous**, verified against the code: the env var only short-circuits `staleCount` to 1 (`:388-389`, `const staleCount = forceFull ? 1 : await countStale(...)`), after which the legacy runs `ENRICH_SQL` whose 4-column `IS DISTINCT FROM` guard (`:257-260`) writes **0 rows** against an unchanged source. Both sides would report `records_updated: 0` and an unchanged hash. **`0 === 0` is not a write-equivalence proof.**

**FOLD-V1 (BLOCKER, fold round 2) — the round-1 replacement was itself unexecutable, for TWO independent reasons, both verified:**
1. **The perturbation cannot live in an outer transaction.** `scripts/analysis/capture-step-golden.js` runs the step **as a child process** (`const { spawn, execFileSync } = require('child_process')` `:71`; `spawnStep` `:725-728`, "mirrors `run-chain.js#spawnStepChild`" `:713`), and the legacy shell and the converted runner each open their **own** pool. A `BEGIN … ROLLBACK` held on this session's connection is **invisible** to that child — it would read the un-perturbed table and write nothing. `0 === 0` a second time.
2. **NULLing the stamp alone is still weak.** A run that (wrongly) wrote nothing but re-stamped would hash-equal the baseline on the three value columns. The perturbation must make "write nothing" **impossible** to confuse with "write correctly".

**Ruled replacement — the COMMITTED perturbation differential**, run **twice**: once against the LEGACY shell at commit ① (before §4.5's POST work replaces it) and once against the CONVERTED step in ②. Both must return the table to the **same** baseline hash.

**Restore-on-failure is part of the procedure, not a contingency** — this perturbation is COMMITTED to the dev DB, so a failed or interrupted differential leaves corrupted heritage flags behind. Every run is bracketed by: (0) the cohort's full pre-values are dumped to a scratch file **before** step 2, and (6) on ANY failure or non-matching hash, restore from that dump (`UPDATE … FROM (VALUES …)`) or re-run with `ENRICH_HERITAGE_FORCE_FULL=1`, then **re-verify the baseline hash before moving on**. A differential that ends with an unverified table is a failed differential.

Procedure:
1. **Build the cohort by id, deterministically, and commit the id list into the assessment** — sized to cover every branch of the CASE, not a random sample:
   * **all 94 multi-Part-IV-point parcels** (the FOLD-I5 impact set and the ONLY place the levenshtein tiebreak is reachable — measured: 272 points among them, max 15 in one parcel);
   * **~100 single-Part-IV parcels** (the L12 precedence arm with no tiebreak);
   * **~200 `part_v_hcd` parcels**, including at least one from each of the **4 districts whose `designated_date` is NULL** (§7 — the 1,820-row null-date population lives there);
   * **~100 undesignated parcels** (the `ELSE NULL` arm, proving the guard does not spuriously write);
   * **all 16 invalid-geom parcels as a NEGATIVE CONTROL, NOT perturbed** (measured: `unstamped = 16`, `unstamped ∧ ineligible = 16`, `stamped ∧ ineligible = 0` — the unstamped set and the ineligible set are the *same* 16 rows, exactly). Perturbing them would corrupt rows no run can restore. Assert instead that both sides leave all 16 byte-unchanged and still unstamped.
2. **Record the BASELINE projected hash** over the whole table (`--table-columns=parcels:id,is_heritage_designated,heritage_designation_type,heritage_designation_date,heritage_dataset_version_when_enriched`, explicit `id` order) and dump the cohort's pre-values to a scratch file.
3. **COMMIT the perturbation** — stamp **and** values, so that "wrote nothing" cannot hash-equal baseline: `UPDATE parcels SET heritage_dataset_version_when_enriched = NULL, is_heritage_designated = NOT is_heritage_designated, heritage_designation_type = NULL, heritage_designation_date = NULL WHERE id = ANY($cohort)`. Re-hash and assert the hash **differs** from baseline (if it does not, the perturbation itself is broken and the whole differential is void).
4. **Run the step** (legacy at ①, converted at ②). Legacy: `staleCount > 0` ⇒ it re-evaluates all 486,514 (no Layer-2), and the guard writes only rows that differ = the cohort. Converted: Layer-2 scopes to **exactly** the cohort (they are the only NULL-stamped rows).
5. **Assert, both sides:** (i) the projected hash is **byte-identical to the BASELINE** — the run put every perturbed column back; (ii) `records_updated` equals **the number of cohort rows that actually needed a change**, which for the 16 invalid-geom members is **zero** (they are outside `parcel_c` on both sides, so they are perturbed-and-never-restored — **therefore the 16 are EXCLUDED from the perturbation set and used only as a negative control: assert their values are untouched by the run**). That is the real claim (a) has to earn — narrowing the scope changes which rows are *visited*, never which values are *written*.
6. **Pre-pinned, not rationalized afterwards:** the expected `records_updated` and the expected baseline hash are written into the assessment BEFORE step 4 (`tasks/lessons.md:108`).
7. **Restore-and-verify** per the bracket above, unconditionally, before the next step of the plan.

**Est. 8 min of machine time** (two full runs — the legacy side pays a ~60–75 s full join, the converted side is scoped and near-instant — plus 2 cohort builds, 6 whole-table projected hashes at ~5 s each, and the restore/verify bracket on both).

**Collision note (I1 × I5, stated so a later reader does not conflate them):** the cohort differential proves the two forms write the **same values for rows in scope**. It does **not**, and cannot, show that a levenshtein-threshold change propagates — that is FOLD-I5's declared limitation, and the two findings are complementary, not redundant. **Collision note (I1 × G2):** G2's lock proves a *version bump* re-stales; I1 proves *value-equivalence* once stale. Both exercise the same new predicate from opposite ends and neither substitutes for the other. **Collision note (I1 × the goldens):** the perturbation is COMMITTED, so it must run **outside** the capture windows — never between a PRE and its POST, or it lands in Class B as real data drift. ① sequences it after the PRE pair; ② after the POST pair.

**Diff-class prediction, WRITTEN BEFORE capture and scored afterwards** (a diff is EXPLAINED only when its own deepest field name is cited, or an explicit difference COUNT sits beside a bucket word):
* **Class A (structural, caused by this change) — predicted NON-EMPTY, enumerated now:** (i) `records_total` `null` → **486,514** (eligible population; the 2.1 A4 precedent, applied without re-asking); (ii) `records_meta.config` appears, stamping the 10 resolved variables; (iii) `checks_passed`/`checks_failed`/`checks_warned`/`errors`/`warnings` appear; (iv) `threshold` renders resolved `15`/`30`/`1`/`1` instead of literals; (v) the two INFO→PASS tier renames (§1); (vi) new `stdout_lines` for `phase heritage_join starting (shared txn, timeout 240min)` + heartbeat ticks; (vii) `guards.requires` now executes on the zero-stale path (extra catalog queries) — **a strengthening**, since the legacy already hoisted `assertPreconditions` onto the skip path at commit C but never ran it via a declared mechanism; (viii) `parcels_heritage_enrich_skipped` derived as `updated === 0` (the landed 2.1 form — **not** from a "scope count", which does not exist in the post-phase hook); (ix) the new `heritage_designated_by_zone` `records_meta` key (FOLD-RC1) — **predicted and enumerated here so it is not scored as an unexplained diff**.
* **Class B (data drift NOT caused by this change) — predicted EMPTY**, conditional on no `load_heritage` / `load_parcels` / `enrich_parcels` run between the captures; verified from `pipeline_runs` at POST time and **scored**, not assumed.
* **Class C (inherent re-run noise) — small, non-empty**, each leaf with a named mechanism: `duration_ms`, `enrich_heritage_duration_ms`, `git_head`, `pipeline_runs_max_id_before`, `source_fingerprint`, `sys_*`.
* **Class D (capture order) — MUST be EMPTY.** One phase, one statement, rows keyed by `id`. A non-empty D is a blocker.

**L6:** any data refresh taken before the PRE capture records its `PIPELINE_SUMMARY` verbatim in the assessment — a legacy step run standalone opens **no** `pipeline_runs` row, so the ledger cannot reconstruct it.

---

## §5. Tests IN the plan

All new files carry `// 🔗 SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8d/§9/§11.1 (+ Spec 43 §Step Breakdown owner, Spec 122 §5.1 shape)`.

**`src/tests/steps/enrich_heritage/violations.test.ts`** (new; `it.fails()` at ①, plain `it()` at ③):
1. **G-shape** — top level is exactly the permitted forms; `pipeline.run(` absent; `const ADVISORY_LOCK_ID = 62` survives as a source-text constant.
2. Descriptor validates; `identity.lock === 62` agrees with `LOCK_ID_REGISTRY` (`src/tests/pipeline-advisory-lock.infra.test.ts:54`); `checks.length === 10`; `execution.phases.length === 1`; `outputs.writes.length === 1`; `guard_columns.length === 4`.
3. `require()` under a `pg.Pool` spy → zero constructions, zero queries (#86).
4. Named exports `descriptor` + `compute`; both declared hook names (`readHeritageContract`, `computePostPhase`) genuinely exported — **RED by renaming one**, asserting the NAMED throw citing `execution.enrich_hooks.*`, never a raw `TypeError`.
5. **Rule 3, both directions** — every `config.logic_variables[].name` has a seed row (RED with one removed); no threshold-shaped literal survives in `scripts/lib/compute/enrich-heritage.js` (RED with `15` or `2` re-inlined).
6. **COUNTER-ROOT, both directions** — `records_updated` resolves from `written.e1.updated`, non-null on a writing run; RED by re-rooting to a bare `compute.records_updated` and asserting NULL. **Plus the RV-D4 arm:** on a run whose `ctx.joinUpdate` returned N, `written.e1.updated === N` (RED at `2N` if the fallback double-counts).
7. **4-column guard regression lock — RED mechanism CORRECTED (FOLD-V2).** The round-1 wording ("drop the stamp from `guard_columns`, prove the second run writes ≠ 0") had the arrow backwards: dropping a conjunct from an `OR` chain makes the guard **narrower**, so **fewer** rows are written, not more. The real failure is **non-convergence**: with the stamp out of the guard, a parcel whose three value columns are already correct but whose stamp is stale is **never written, therefore never stamped**, therefore **stays in the Layer-2 scope forever**. RED assertion: after two consecutive runs, `SELECT count(*) FROM parcels WHERE <eligibility> AND heritage_dataset_version_when_enriched IS DISTINCT FROM $2` is **still > 0** (and `records_updated` on run 2 is 0 — a silent, permanently-stale fleet). GREEN: that count reaches 0 and run 2 writes 0.
8. **L12 precedence, both directions** — a parcel containing BOTH a Part IV point and inside a Part V HCD resolves `part_iv_individual` with the Part IV date; RED by swapping the CASE arms.
9. **The wedge-open lock — CLAIM NARROWED to the one that can actually fail (FOLD-V2).** Under (a) the legacy's *textual* mirror-lock ("`countStale`'s text matches `ENRICH_SQL`'s") is **obsolete by construction**: there is now ONE predicate, in `parcel_c`, serving as both scope and write filter, so two texts can no longer disagree. **The round-1 replacement ("an invalid-geom parcel never becomes permanently stale", RED by weakening eligibility to bare `geom IS NOT NULL`) DOES NOT FAIL and must not ship** — worked out from the real predicate: weakening eligibility pulls the 16 invalid-geom rows into scope, the join returns `new_designated = false` for them, and the UPDATE **stamps them**, so they converge rather than wedging. A lock whose RED is green is a vacuous green (`tasks/lessons.md:41`).
   **The surviving, executable claim is narrower and is a real one:** *the 16 ineligible parcels are never WRITTEN and never STAMPED.* MEASURED as an exact identity today — `unstamped = 16`, `unstamped ∧ ineligible = 16`, `stamped ∧ ineligible = 0` — so the assertion is `stamped_count == eligible_count == 486,514` and `parcels WHERE stamp IS NOT NULL AND ineligible == 0`. **RED, executable:** weaken the eligibility clause to bare `geom IS NOT NULL` → the 16 get stamped → `stamped ∧ ineligible` becomes 16 and `stamped_count` becomes 486,530. **GREEN:** both return to 0 / 486,514. The frozen-shape traversal still resolves the compute generically via `require('./lib/compute/<name>')` (the RV-D6 fix's own form), not hardcoded to this step.
10. **The three bound-ported rows** — feed `heritage_points_no_parcel_match` pct = 10.4 / 20 / 35 → PASS / WARN / FAIL; `parcels_heritage_designated_count` = 0 → FAIL, 1 → PASS; `parcels_part_iv_count` = 0 → WARN, 1 → PASS. RED-1 swaps the warn/fail vars; RED-2 forces `partIvSource = 0` and asserts EH-D2's declared louder behaviour, so the diff is LOCKED rather than latent.
11. **Unhappy paths — all eleven throws + the lock terminal:** the 9 contract HALTs · L14 on both tables · the migration-171 column · each `guards.requires` probe · SRID ≠ 4326 · lock-held → `records_meta.skipped` + no `audit_table`.
12. **Idempotency** — run twice on a seeded cohort: run 2 writes **0** rows and the skipped observable reads true.
13. **Chain wiring** — `chain.logic.test.ts`'s `toHaveLength(28)` and the `enrich_heritage === enrich_ravines + 1` adjacency both still hold.

**`src/tests/db/enrich-heritage-kill-mid-run.db.test.ts`** (new, the 2.1 F-IL1 pattern): a real `pg_cancel_backend` mid-UPDATE proves (a) **zero committed writes** and (b) an unmodified re-run converges. Note `tasks/lessons.md:34`: `taskkill`/Ctrl-C does **not** cancel a running Postgres query — the test must use `pg_terminate_backend`/`pg_cancel_backend`, never a process kill.

**Existing suites — migrated, not duplicated** (and see T1/T2): `enrich-heritage.infra.test.ts` (8 static + 2 live-PostGIS claims, incl. the containment assertion and the L14 HALT) re-pointed at descriptor+compute with an old-vs-new assertion table in the assessment · `enrich-heritage.logic.test.ts` (24 ln) — `verdictCascade` **retired per Rule 10** and cited against the existing generic proof (`src/tests/step-library.logic.test.ts`, anchor `deriveVerdict`) rather than re-implemented; the DEC-C export claims re-pointed · `enrich-heritage-418.logic.test.ts` — **see the FOLD-V3 disposition table below; the round-1 blanket "re-pointed, never dropped" collided with test 9's "the mirror-lock is obsolete" and is replaced by a per-test ruling** · `db/enrich-permits-heritage.db.test.ts` — consumer-side, expected UNTOUCHED; prove it.

**FOLD-G1 — `src/tests/db/enrich-heritage-418.db.test.ts`: a per-test disposition, because option (a) RETIRES the exported `countStale` this whole file is built on.** Measured: the file's typed handle (`:31-32`) imports `countStale` and `assertVersionColumn`, and the tests call `eh.countStale` (**`:88` only** — the round-1 draft also cited `:101`, which is a **comment**, not a call; the live assertion nearby is `myStale(...)` at `:105`, the file's own local helper defined at `:44` that re-implements the predicate), `eh.ENRICH_SQL` (`:93`, `:119`), `eh.emitHeritageResults` (`:134`), `eh.assertVersionColumn` (`:157`) and `eh.assertPreconditions` (`:176`) — every one of which the frozen shell stops exporting. **The precedent is `c9b217bd`, which RE-DERIVED `enrich-ravines.skip.db.test.ts` against the new artifacts rather than deleting cases. Same standard here — and no assertion count may DECREASE without a stated reason in the commit body.**

| Test | Today | Disposition under (a) |
|---|---|---|
| **H1 — the wedge-open trap** (`:71`) | `eh.countStale` excludes an invalid-geom parcel; a naive predicate would stay stale forever | **RE-DERIVED, strengthened.** The predicate under test moves from `countStale` to the compute's `parcel_c` clause. Assert the SAME property against the new SQL: an invalid-geom parcel is in neither the scope nor the write, on both a stale and a converged run. This is now a **stronger** test than before, because the predicate it guards is the one that actually scopes the write, not a probe beside it. |
| **H2 — a version bump re-stales the eligible parcel only** (`:112`) | bump `datasetVersion`, assert the eligible parcel re-stales and the invalid one does not | **RE-DERIVED + PROMOTED — see FOLD-G2.** Same assertion, expressed against the Layer-2 predicate. |
| **H3 — the skip path still emits** (`:128`) | `emitHeritageResults(..., skipped:true)` emits `PIPELINE_SUMMARY`/`PIPELINE_META` with a `parcels_heritage_enrich_skipped` row | **RE-DERIVED, meaning PRESERVED.** The skip *branch* is gone; the *observable* is not. Re-point at `computePostPhase` and assert the row is still emitted, derived as `updated === 0` (the landed 2.1 form), on a run whose scope was empty. **Re-derived, never patched to green.** |
| **C-R1 (positive half)** (`:156`) | `assertVersionColumn` resolves against the live migrated schema | **RE-DERIVED against `guards.requires`.** The named function is gone; the guarantee ("a missing migration-171 column refuses with a named error, not a raw 42703") moves to the `{kind:"column"}` probe and is asserted through `assertRequirements`. The negative half stays in `enrich-heritage-418.logic.test.ts`. |
| **"C" — `assertPreconditions` on the skip path** (`:164`, `:176`) | resolves once the heritage source tables are non-empty | **RE-DERIVED, and this one gets STRONGER**: under the conversion `guards.requires` runs on **every** invocation (Class A (vii)), so the test asserts the probes fire on the zero-scope path, which is the property commit C was reaching for. |

**FOLD-V3 (BLOCKER) — `src/tests/enrich-heritage-418.logic.test.ts`: a per-test ruling, because "re-point, never drop" and "the mirror-lock is obsolete" cannot both be true of the same file.** §1/§5 said re-point everything; test 9 said the textual mirror-lock is obsolete by construction under (a). Both were right about different tests. Resolved the FOLD-G1 way — **each test is either RE-DERIVED (and to what) or RETIRED (with the reason the behaviour is genuinely gone)**, and every retirement is named, which is how this reconciles with **T7**: T7 forbids an *unexplained* assertion-count decrease, not an explained one. **The commit body lists each retirement by test name.**

| Test (line) | Today | Ruling |
|---|---|---|
| H4 ×3 (`:46`, `:50`, `:54`) — `assertHeritageSourceNonEmpty` throws on empty `heritage_properties` / on empty `heritage_districts` / resolves when both non-empty | calls the legacy export | **RE-DERIVED** against `readHeritageContract` in the compute, where F2's L14 HALT now lives (RV-L2 fold). Three cases in, three cases out. |
| H4 `:58` (the multi-line case) | the shared-by-both-paths claim | **RE-DERIVED** — under (a) there is one path, and the hook runs pre-transaction on **every** invocation, so the claim becomes *stronger* and is asserted as such. |
| Commit-C `:79` — a missing lineage column throws a CLEAR diagnostic naming migration 171, not a raw 42703 | `eh.assertVersionColumn` | **RE-DERIVED** against `guards.requires[{kind:"column"}]` + `assertRequirements`. The named-error guarantee is the contract; the function name was the mechanism. |
| Commit-C `:86` — resolves when the column is present | same | **RE-DERIVED**, same target (the positive half). |
| Commit-C `:91` — *"main() calls `assertVersionColumn(pool)` BEFORE `countStale`"* | source-text ordering lock on `main()` | **RETIRED, behaviour genuinely gone.** `main()` no longer exists (frozen 7-statement shell) and `countStale` is retired by (a); ordering is now the runner's, declared as `guards.requires` running before the phase loop. Re-pointing it would assert an ordering the descriptor no longer expresses. **Replaced, not merely dropped:** the surviving guarantee ("the column guard fires before anything reads the column") is covered by the re-derived `:79`/`:86` pair through `assertRequirements`. |
| Commit-C `:102` — the "correction lock" (*the commit body must NOT claim this mechanism was ported "verbatim" from enrich-ravines.js*) | prose lock on a historical commit message | **RE-DERIVED verbatim, untouched in substance.** It asserts nothing about this step's code — it is a claim-hygiene lock on the record — so (a) does not reach it. Keep it. |
| D#4 `:118` — exports `FORCE_FULL_ENV = ENRICH_HERITAGE_FORCE_FULL` | source-text export check | **RE-DERIVED** against `descriptor.override.force_full === "ENRICH_HERITAGE_FORCE_FULL"`. The env var survives (a) and is load-bearing (FOLD-I5), so the claim survives; only its home moves from an export to a descriptor field. |
| D#4 `:122` — *"forceFull short-circuits `staleCount` to a non-zero value, bypassing the #418 skip unconditionally"* | asserts the legacy `staleCount` short-circuit | **RETIRED, mechanism gone; SUCCESSOR CLAIM REQUIRED.** There is no `staleCount` and no skip branch under (a). The behaviour that must survive is *"`ENRICH_HERITAGE_FORCE_FULL` makes the run re-evaluate every eligible parcel rather than only the stale ones"* — asserted instead against `ctx.full` selecting the unscoped SQL. **This is a retirement plus a replacement, so the net assertion count does not fall.** |
| H1 `:130`, `:141` — the two textual mirror-lock halves (*the `countStale` probe's text mirrors `ENRICH_SQL`'s eligibility*) | compares two source strings | **RETIRED, and this is the one retirement that is a genuine net simplification.** Under (a) there is ONE predicate serving as both scope and write filter, so the two texts it compared no longer exist as two texts; the lock could never fail. **Replaced by violations-suite test 9's narrowed, executable claim** (the 16 ineligible parcels are never written and never stamped, RED by weakening the eligibility clause) — 2 vacuous text assertions out, 2 executable data assertions in. |

**Net effect on this file: 9 assertions in, 9 out (3 retirements, each with a named successor).** ① records the before/after counts per T7.

**FOLD-G2 — H2's behaviour gets its own NAMED lock. RED mechanisms CORRECTED (FOLD-V2).** Add to the re-derived DB file (it needs live PostGIS; ① states the file): **`heritage_version_bump_restales_eligible_only`** — with a fixture cohort of {one eligible designated parcel, one invalid-geom parcel}, bumping the producer's `source_dataset_version` puts **exactly** the eligible parcel in scope, it is re-stamped to the new version, and a **second** run against the unchanged bumped version puts **neither** in scope.

Round 1 stated both REDs wrong (it had the stamp conjunct widening the invalid-geom case, which the eligibility clause governs, not the stamp). Worked out from the real predicate `geom IS NOT NULL AND NOT ST_IsEmpty AND ST_IsValid AND stamp IS DISTINCT FROM $2`:
* **RED (i) — drop the `stamp IS DISTINCT FROM $2` conjunct.** Scope becomes *all* eligible parcels, unconditionally. The bump half still passes (the parcel is in scope), so the assertion that catches it is the **convergence** half: **run 2 still has the eligible parcel in scope** instead of an empty scope. (It also destroys the cost property (a) was adopted for, which is the same defect wearing a different hat.)
* **RED (ii) — weaken the eligibility clause to bare `geom IS NOT NULL`.** The invalid-geom parcel enters scope and **gets stamped**, so the assertion that catches it is *"the invalid parcel is still unstamped after the bump run"* — the same claim test 9 narrows to, asserted here on the fixture rather than fleet-wide. **Not** "permanently stale": under one shared predicate it converges, it just converges *wrongly*.

Both REDs are executable against the fixture cohort and both must be demonstrated red-then-green. This is the lock that makes the Layer-2 port a *contract* rather than an optimization.

---

## §6. Fences — every legacy behaviour, with its disposition (commit ① re-runs `git log --follow -p -- scripts/enrich-heritage.js` and records the introducing hunk per row)

| # | Behaviour (anchor) | Disposition |
|---|---|---|
| **F1** | §9/L23 consumer HALT — 9 throws, all **before** the transaction (`readHeritageContract`) | **PRESERVED — `execution.enrich_hooks.contract_read`**, resolved and called by the runner above the lock. `ctx.contract` (the 2.1 seam) carries `datasetVersion` to the pass. |
| **F2** | **L14** empty-source HALT on **BOTH** paths, both tables (`assertHeritageSourceNonEmpty`, called from `assertPreconditions` and reachable on the skip path via commit C's hoist) | **PRESERVED — folded into the same `contract_read` hook (RV-L2 precedent).** MEASURED for 2.1 and re-verified here: `scripts/lib/step/index.js` has **zero** references to `guards.empty_source` or `guards.srid`; both are declarative only. Declaring them without folding the HALT into the hook would be a fence that cannot arm. Test 11 proves both arms. |
| **F3** | PostGIS + `fuzzystrmatch` + `normalize_address()` + 3 GIST indexes + 4 M-2 columns (`assertPreconditions`) | **PRESERVED and STRENGTHENED — `guards.requires` (9 rows)**, armed by `assertRequirements` on EVERY run. |
| **F4** | SRID = 4326 assertion | **PRESERVED in the `contract_read` hook** (REQUIREMENT_PROBES has no `srid` kind — the RV-L2 reason, unchanged). |
| **F5** | Commit-C lineage-column guard "instead of a cryptic 42703" (`assertVersionColumn`) | **PRESERVED — `guards.requires[kind:"column"]`.** Note the commit-C docblock's own correction ("the 74653a8f body claimed this was ported verbatim — it was NOT") is preserved as prose; the correction lock in `-418.logic.test.ts` stays. |
| **F6** | **CONTAINMENT** Part IV/V match (`ST_Intersects`), NOT the spec's `ST_DWithin(50m)` + levenshtein, which over-matched **4×** (6,217 parcels vs 1,549 source points) | **PORTED BYTE-FOR-BYTE into compute — except the one declared Layer-2 conjunct added to `parcel_c` under H-A1 (a).** The match logic itself (both LATERALs, the L12 CASE, the tiebreak ordering) is character-identical; the deviation is the scope clause and nothing else, and it is declared in `deviations[]` rather than described as "verbatim". A generator that re-emits the spec's §11.1 design SQL (`61:704-752`) reproduces the over-match. The SPEC is corrected at ③. |
| **F7** | `emitHeritageResults` shared by BOTH paths; coverage **re-queried live on every call** ("a pre-existing hole stays visible even when this run skips"; "the dashboard step is never UNKNOWN") | **PRESERVED — `execution.enrich_hooks.post_phase`**, which the runner calls unconditionally after the last phase. |
| **F8** | `parcels_invalid_geom_count` INFO **and not WARN** — an explicit anti-alert-fatigue decision (`:321-323`) | **PRESERVED — declared INFO check with that reasoning in `why`.** Rule 10's R-H addendum (`124:118`) would normally push a permanently-non-zero metric to WARN-with-retighten; **this row is the declared exception and must say so**, because the legacy reasoned it out loud. |
| **F9** | **#418 Layer-1 early return** (`:388-393`) and the `ENRICH_HERITAGE_FORCE_FULL` escape hatch (D#4) that exists to bypass it | **RULED H-A1 (a): MECHANISM RETIRED KNOWINGLY, OBSERVABLE AND COST BOTH PRESERVED — by PORTING a Layer-2 predicate carrying the identical eligibility `countStale` applied, so Layer-2 SUBSUMES Layer-1.** `parcels_heritage_enrich_skipped` is derived as `updated === 0` (the landed 2.1 form). `override.force_full` is **RETAINED**, and under (a) it is not an LN-D9 no-op: it selects a genuinely different scope (all eligible parcels vs the stale subset) and is the declared remedy for FOLD-I5. What (a) gives up is stated in `limitations[]`, not left implicit. |
| **F10** | `emitMeta` under-declares reads (`parcels:['id','geom',3 address cols]`) | **PRESERVED as intent, WIDENED honestly** — EH-D1; the descriptor declares what the SQL genuinely reads. |
| **F11** | `heritage_point_match_radius_m` deliberately left OUT of `ConfigSchema` rather than declared-and-ignored | **PRESERVED — `config.retired[]`**, which is the descriptor's word for exactly this. |

**Spec-citation drift found while grounding (ledger EH-D3; record, do not "fix" the code).** Several ids the script cites do not mean in Spec 61 what the script uses them for: `DEC-E`, `DEC-F`, `DEC-H` do **not exist in Spec 61** at all (they are Spec 59 decisions inherited with the ravines port; Spec 61's own DEC-E, defined at `review_followups.md:2648`, is the `register|districts` lineage combine) · the script's `// §3.10 SRID guard` points at Spec 61 `:370` "Edge cases", which has no SRID clause — the real clause is Spec 59 `:383` · `L14` is spec'd for the **loader** (`61:67`), while the enrich-side non-empty HALT is **L23 step 4** (`61:645`) · `L24` (`61:77`) names **`enrich-permits.js`**, not this script, so the M-2 4-column guard has no clause of its own. **All four go into `limitations[]` + the ledger with the correct citation beside the legacy one. No behaviour changes.**

**Spec diff carried by ③** (Spec 61 is 972 lines; each edit cited by greppable anchor, never line number alone):
1. `:441` `advisory lock 63` → **62**; `:852` `ADVISORY_LOCK_ID = 63` → **62**; `:934` the 3-row A.5 table (`load-heritage.js (62), enrich-heritage.js (63), enrich-permits.js (64)`) → **61 / 62 / 63**; `:440`/`:379` load-heritage "lock 62" → **61**.
2. L21 thresholds: `:74`, `:660`, `:915-916` still read **0.05 / 0.20**; shipped and now seeded is **0.15 / 0.30** (justified at `:698`).
3. `:204-207` M-2 DDL lists **3** columns; migration 171 adds a **4th** (`heritage_dataset_version_when_enriched`).
4. `:574-582` §9 emitMeta block: reads `parcels:['geom']` / writes 3 cols → reads 9 parcels cols / writes **4**.
5. `:704-752`/`:757`/`:854`/`:417` still describe the superseded `ST_DWithin` + levenshtein design; mark superseded, pointing at the `:692-702` IMPLEMENTED note.
6. Spec 61 documents **none** of: the #418 skip, `ENRICH_HERITAGE_FORCE_FULL`, or 8 of the 10 audit rows. **Add them** (the skip's only existing home is Spec 43 `:191`).
7. Spec **43**: the step-table row `:44` and Target Files `:283` are **correct** — state `N-A` for the position, and add the conversion note.
> **If the 9-byte Spec 122 budget or `spec-split-check --check` refuses any of these, the spec diff moves to its own commit — it never rides `--no-verify`.**

---

## §7. Reality-Check at PLAN altitude — every field this step writes

| Field | Plausibility bound | Live value (measured 2026-09-20, query in §0.1) |
|---|---|---|
| `is_heritage_designated` | share TRUE ∈ **[0.5 %, 10 %]** city-wide; never 0 (the legacy's own FAIL gate) and never > 10 % | **9,958 / 486,530 = 2.047 %** ✅ |
| `heritage_designation_type` | exactly **2** distinct non-NULL values, `part_iv_individual` ∪ `part_v_hcd`; NULL **iff** the flag is false | distinct = **2**; `flag AND type IS NULL` = **0**; `NOT flag AND type IS NOT NULL` = **0** ✅ |
| `heritage_designation_date` | ∈ **[1900-01-01, today]**; NULL allowed **only** where the source row's own `designated_date` is NULL | min **1975-11-12**, max **2026-05-21** ✅. `type IS NOT NULL AND date IS NULL` = **1,820**, **all `part_v_hcd`** (`part_iv` null-date = **0**) — and the source explains it: **4 of 29** `heritage_districts` rows carry a NULL `designated_date`. **Not a defect; declared as an invariant with its source-side explanation.** |
| `heritage_dataset_version_when_enriched` | exactly **1** distinct non-NULL value after a converged run, equal to `<register>|<districts>` from the newest completed `load_heritage`; matches `^[0-9a-f]{32}\|[0-9a-f]{32}$` | **1** distinct = `bdca9c50…|eb37b1a0…` = producer id 1470 ✅ |

**Cross-field invariants the conversion must preserve — each with its query, all measured clean today** (→ `descriptor.invariants[]`, `severity FAIL`, `when: "post"`, `frequency: "every_run"`, each with a real `last_measured`):
1. **Flag ⇔ type, flagged side** — `SELECT count(*) FROM parcels WHERE is_heritage_designated AND heritage_designation_type IS NULL` = **0**.
2. **Flag ⇔ type, unflagged side** — `SELECT count(*) FROM parcels WHERE NOT is_heritage_designated AND heritage_designation_type IS NOT NULL` = **0**. (1)+(2) are the whole semantic of `new_designated = (hcd_id IS NOT NULL OR hp_id IS NOT NULL)`; a port error in the `CASE` breaks it silently while every count-row stays green.
3. **Date without type** — `SELECT count(*) FROM parcels WHERE heritage_designation_date IS NOT NULL AND heritage_designation_type IS NULL` = **0**.
4. **Part IV null-date** — `SELECT count(*) FROM parcels WHERE heritage_designation_type='part_iv_individual' AND heritage_designation_date IS NULL` = **0** (the Part V arm is legitimately 1,820, so the invariant is scoped to Part IV, not to both).
5. *(count identity, INFO)* `designated == part_iv + part_v` → **9,958 == 1,217 + 8,741** ✅.

**Plausibility rows** (`severity WARN`, config-driven per Rule 3):
* `heritage_designated_share_max_pct` — `bound "value_max 10"`, `limit_from_config enrich_heritage_designated_share_plausible_max_pct`; measured **2.047**.
* `heritage_designated_count_collapse_floor` — `bound "value_min 1000"`, `limit_from_config enrich_heritage_designated_count_collapse_floor`; measured **9,958**. **This row exists because of 2.1's output-panel O4 finding**: a ceiling-only set is blind to a collapse. The legacy's own FAIL gate only fires at exactly 0 — a join that silently matched 3 % of what it should would pass every existing row. **Declared at PLAN altitude here rather than discovered at OUTPUT.**
* `heritage_part_iv_matched_le_source` — `bound "value_max 0"` over `SELECT GREATEST(0, (SELECT count(*) FROM parcels WHERE heritage_designation_type='part_iv_individual') - (SELECT count(*) FROM heritage_properties WHERE status='part_iv'))`; a containment match assigns at most one parcel per point, so parcels-with-Part-IV can never exceed source points. Measured **1,217 ≤ 1,557** ⇒ **0** ✅.

**Audit-row count for every cap / drop / default.** The step has **no** cap, clamp or default write — a row either matches the 4-column guard and is written or is not in scope. The **two genuine drops are already declared rows**: `parcels_invalid_geom_count` (**16** parcels excluded by `parcel_c`'s eligibility clause) and `heritage_points_no_parcel_match` (**162 of 1,557 = 10.4 %** Part IV source points that fall inside no valid-geom parcel — the containment limitation, and the reason the warn seed is 15 and not Spec 61's 0.05). ② must prove each is derived from the **same scan the writes came from**, never a parallel boolean.

**FOLD-RC1 — both global bounds are blind to a ZONE-LOCAL collapse. Closed with INFO visibility, not with a gate.** Measured today (`SELECT COALESCE(zoning_class,'(null)'), COUNT(*), COUNT(*) FILTER (WHERE is_heritage_designated), ROUND(100.0*…,2) FROM parcels GROUP BY 1 ORDER BY 2 DESC`), the designated share is **not remotely uniform**:

| Zone | Parcels | Designated | Share |
|---|---:|---:|---:|
| RD | 233,876 | 2,391 | 1.02 % |
| R | 102,551 | 4,521 | 4.41 % |
| RM | 54,332 | **24** | **0.04 %** |
| RS | 29,256 | **3** | **0.01 %** |
| CR | 18,127 | 1,811 | 9.99 % |
| RT | 14,220 | **2** | **0.01 %** |
| RA | 2,354 | 10 | 0.42 % |
| **CRE** | **552** | **507** | **91.85 %** |

A join that silently stopped matching inside CR (1,811 parcels) would move the global share from 2.047 % to 1.68 % — **inside** the 10 % ceiling and **far above** the 1,000 floor. Both global rows stay green. **Simplest close (Spec 124 §7 rung (b), fold-simplicity): one INFO `records_meta` block, no new gating check and no new tunables.** `computePostPhase` runs one extra `GROUP BY zoning_class` aggregate and emits `heritage_designated_by_zone` — `{zone: {parcels, designated}}` — declared as the third `emits[]` key (§3.1). **The eight named zones do NOT cover the fleet: 2,391+4,521+24+3+1,811+2+10+507 = 9,269 of 9,958 designated parcels, leaving 689 uncounted (`(null)` 455 + every other zone 234).** A visibility row that silently drops 6.9 % of the population is the same blindness it was added to close, so the block carries **ten** buckets — the eight named zones plus **`(null)`** and **`other`** — and `computePostPhase` asserts the **identity `Σ buckets.designated == parcels_heritage_designated_count`**, which is the row the audit table already emits. An identity that fails is a compute defect and reddens the run under `on_check_error: "fail_step"`. Cost: one indexed-free aggregate over `parcels`, measured in the same family as the existing coverage query (**4,570 ms**, §0.4), so the post-phase budget roughly doubles to **~10 s**; re-measure at ②. **A zone-SCOPED gating check is explicitly NOT built here** — it needs per-zone bounds nobody has calibrated (CRE alone spans 0 %–91.85 %), and inventing eight tunables to gate a metric this conversion has never observed move would be a threshold set with no evidence behind it.

**Two sanity-harness blind spots, FILED at cutover, not fixed** (`review_followups.md`, one row, cross-referenced from the assessment): (i) **`scripts/analysis/parcel-sanity-audit.js` has ZERO checks over any of this step's four columns** — `grep -c heritage` returns **0** for that file; its companion `scripts/lib/assert-parcel-sanity-fields.js` returns **4**, but all four (`:191`, `:253-255`) concern `max_buildable_gfa_basis = 'heritage_existing'`, i.e. the max-build freeze, **not** `is_heritage_designated` / `_type` / `_date` / `_dataset_version_when_enriched`. So the claim "the sanity harness has no heritage coverage" is true **of this step's fields** and false of the file pair as a whole — stated precisely so the followup is actionable. (ii) **`parcel-field-dump.js:19` prints only `is_heritage_designated`** of the four — that half is fixed here (F-RC2 below), which is why the followup row covers only the audit-harness half.

**F-RC2 (T3 above):** widen `scripts/analysis/parcel-field-dump.js` to print `heritage_designation_type`, `heritage_designation_date` and `heritage_dataset_version_when_enriched` beside the existing `is_heritage_designated`; run live on ≥3 parcel ids including one Part IV, one Part V and one undesignated; paste the output into the assessment.

---

## §8. Idempotency (the Lens fires — re-runnable set-based UPDATE, one transaction, lineage stamp)

* **Same input twice** → run 2 writes **0** rows. The mechanism is the 4-column guard, and the stamp being INSIDE it is what makes that true (§3.1 `guard_columns_why`). `idempotent_rerun: "zero_writes"`.
* **What runs OUTSIDE the transaction:** the `contract_read` hook (9 HALTs + L14 + SRID, on the pool), `assertRequirements`, and the entire `post_phase` coverage/unlinked-points read. Every one is read-only — stated explicitly, not assumed.
* **Run 2 vs run 1's artifacts:** none. The step creates no scope table, no checkpoint, no interim rows (`staleness.checkpoint "none"`, `recovery.before_image "none"` because `retract:"none"`).
* **Kill mid-update:** one shared transaction ⇒ no half-written state. Proven live by the new `enrich-heritage-kill-mid-run.db.test.ts` (§5), using `pg_cancel_backend`, not a process kill.
* **`recovery.interrupted: "force_full_on_next_run"`** — reachable (`runEnrichPhase` folds `staleness.detectInterruptedRetraction` into `full` before any pass) and accurate under **(a) as ruled**, because the Layer-2 predicate is a lineage comparison evaluated fresh on every run, so every still-stale parcel is re-admitted unconditionally. **This is not a resumption claim** — the single shared transaction means a killed run leaves no partial state to resume from (see §12's struck "resumable" clause).
* **Collision:** `sharing.on_contention: "self_skip"`; advisory lock 62 held elsewhere → the declared `lock_held_elsewhere` terminal.

---

## §9. Review roster — TRIMMED (the 2026-09-16 operator ruling, read verbatim from `.cursor/batch2_c5_active_task.md` §"Panel roster ruling", not guessed)

COMPRESSED step ⇒ **no Gemini, no DeepSeek.**
* **PLAN altitude:** **Integration** (main tree — verifies §3.3's RV-D4 premise, the `written.e1` slot, the probe-list count, the fixture question of §4.4, and that no schema change is needed) + **Reality-Check** (main tree + live DB — §7) + **Regression Guardian** (main tree, `git log`/`git blame` — the 11 fences one at a time, especially F9). *(The batch-2 Phase-2 row also names "one DeepSeek lens"; the later 2026-09-16 roster ruling drops the CLIs for COMPRESSED steps and is the ruling of record — stated here rather than silently resolved.)*
* **OUTPUT altitude:** **Regression Guardian + Reality-Check + `code-reviewer-grounded`**, **+ Idempotency Lens** (fires — the diff touches a write boundary, a txn scope and a re-runnable path), **+ `observability-reviewer`** (10 audit rows, 3 severity ports, a verdict cascade and a counter re-root — exactly its charter).
* **Execution is the MANDATORY seat:** both capture pairs, the scored golden differential, **the NULL-stamped cohort differential of §4.5 (both sides, projected hashes, expectation pre-pinned)**, `step:validate --step=enrich_heritage`, the two cutover-only fleet locks in isolation (T9), and `BUILDO_TEST_DB=1 npm run test:db`.
* **PLAN-altitude panel: COMPLETE** (Integration + Reality-Check + Regression Guardian, 2026-09-20). Its nine findings are folded and re-grounded in §13; both Asks are ruled. **The OUTPUT roster above is still owed** and runs against the diff + re-run values.
* **Cross-read Adversary + a grounder after EVERY fold** (unchanged).

---

## §10. Standards compliance (`docs/specs/00_engineering_standards.md` §11, applicable items only)

* **Database Impact: NO.** No migration; 171 and 244 are already applied (measured). Items 1–4 N/A.
* **API route / UI / frontend:** N/A (items 5–18, 24–34).
* **Shared logic touched (19–21):** `scripts/lib/compute/enrich-heritage.js` is new and single-consumer; `parcel-field-dump.js` is the only other script edited. `npx vitest related` is planned per changed file, per commit.
* **Pipeline script (22–23):** the converted shell IS the SDK (`pipeline.step(descriptor, compute)`); no external API, so no streaming ingestion.
* **Pre-Review Self-Checklist (35):** §4.1's **T1–T9** plus a spec-derived list generated at ② from Spec 61 §8d/§9/§11.1, walked against the actual diff, PASS/FAIL printed **before** tests run.
* **Cross-Layer Contracts (37–39):** the 10 new values live in `scripts/seeds/logic_variables.json` + the descriptor, resolved through `ctx.config` — **not duplicated across files**, so no `docs/specs/_contracts.json` row is created. ② states this explicitly rather than leaving it silent.
* **Try-Catch / `logError`:** N/A — the frozen shell has no catch blocks; compute's only `try` is the per-check dispatch that reports the error as a row (the §5.5 pattern, ported from 2.1).
* **UI Layout:** N/A.

---

## §11. Estimated machine time

| Activity | Est. |
|---|---|
| 2 PRE captures (skip path, 25–38 s each) | ~2 min |
| 2 POST captures + up to 2 recaptures | ~3 min |
| **Committed-perturbation differential — LEGACY side at ① + CONVERTED side at ②, incl. baseline/verify hashes and the restore bracket (§4.5, FOLD-I1 + FOLD-V1)** | **~8 min** |
| Live invariant / plausibility / per-zone (FOLD-RC1) / `BEGIN…ROLLBACK` measurement | ~6 min |
| `step-validate --step` + `--all --write` | ~3 min |
| `vitest related` per commit (3–5 commits) | ~4 min |
| Husky pre-commit × 3–5 (65–91 s each) | ~5 min |
| Pre-push FULL suite (381 s) × 1 | ~6.5 min |
| `BUILDO_TEST_DB=1 npm run test:db` | ~4 min |
| Generator chain + 4 `assert_schema` golden recaptures (§4.2) | ~9 min |
| Re-derivation + isolated re-runs of the 5 existing suites (FOLD-G1/G2, T7/T9) | ~3 min |
| **Total** | **≈ 53–66 min** (≈ 73 min if a second push is needed) — pre-fold ≈ 45–55, after round 1 ≈ 50–62, after round 2 **≈ 53–66** |

---

## §12. Operator Asks — **BOTH RULED 2026-09-20. Nothing here is open.**

> **H-A1 = (a) ADOPTED.** Port a Layer-2 predicate into `parcel_c` in this conversion; retain `ENRICH_HERITAGE_FORCE_FULL`; `mode_select: "tri_state"`. Grounding re-verified for the fold (not transcribed): no `ledgerGatedSkip` call exists in `runEnrichPhase`; all three converted ENRICHERs use `signal:"always"` + an in-SQL stale predicate; this step's Layer-1 probe applies the identical predicate, so **Layer-2 subsumes Layer-1**. Recorded as the F9 disposition (*mechanism retired, cost-observable preserved*) in `deviations[]`, with the FOLD-I5 give-up declared in `limitations[]` and the FOLD-I1 cohort differential as the value-equivalence proof.
>
> **H-A2 = (a) 240** (min 0, max 290), to be replaced by the measured value after the batch-close cloud run.

*The original Ask text is retained below as the decision record — the reasoning is what the deviation entry cites.*

### **H-A1 (RULED (a)) — The #418 Layer-1 skip has no Layer-2 to fall back on. What replaces it?**

**Measured premise** (not inferred): `enrich_ravines`' `parcel_c` carries `AND p.ravine_dataset_version_when_enriched IS DISTINCT FROM $1`; **`enrich_heritage`'s `parcel_c` (`:206`) carries no lineage predicate at all** — only the eligibility clause. Local ledger (§0.4): skip path **25–38 s**, full recompute **59–75 s**, so the join is **≈ 25–40 s** of every run it is not skipped past. The ENRICHER runner has no gated-skip branch, so Layer-1 cannot survive as an early return.

* **(a) — RECOMMENDED. Port a Layer-2 predicate into `parcel_c` in this conversion**, mirroring the same eligibility the wedge-open trap requires: `WHERE p.geom IS NOT NULL AND NOT ST_IsEmpty(p.geom) AND ST_IsValid(p.geom) AND p.heritage_dataset_version_when_enriched IS DISTINCT FROM $2`. Declared as the F9 disposition: **mechanism retired, cost-observable PRESERVED**, exactly 2.1's F9 wording — and `parcels_heritage_enrich_skipped` is derived as `updated === 0`, as the landed 2.1 form does. `override.force_full: "ENRICH_HERITAGE_FORCE_FULL"` then keeps its real meaning (drop the predicate ⇒ re-evaluate all 486,514, which is precisely what the legacy escape hatch did), and `execution.phases[0].scope` stays `"incremental"`. **Convergence is unchanged** — the stamp is written for every row the UPDATE touches, and every stale row is admitted on every run, so the two forms reach the same fixed point. *(The round-1 draft also claimed (a) is "resumable after a killed run". **Struck** — both forms sit in ONE shared transaction, so a killed run leaves no partial state and there is nothing to resume. The real difference is only which rows are VISITED.)* **Cost:** it is a scope narrowing, i.e. a Class A diff inside a conversion commit, which Spec 123 §1.1 normally forbids — so it must be declared in `deviations[]` with this measurement, and **§4.5's NULL-stamped cohort differential** is what proves value-equivalence (FOLD-I1 refuted the forced-FULL instrument this sentence originally named).
* **(b) Byte-neutral now, Layer-2 as its own follow-on commit.** Strictly §1.1-clean: convert with no scope predicate, accept **≈ +25–40 s per run locally** (and an unmeasured multiple on Supabase Small, where `parcels` is a 4.7 GB heap), declare `override.force_full: "none"` with an **LN-D9-style deviation** saying the escape hatch is retired because a FULL mode with no incremental mode to contrast is a no-op — then add Layer-2 in a separate commit whose diff shows exactly one thing. Honest, and ~1 extra commit plus a second capture pair.
* **(c) Byte-neutral, permanently.** Every run pays the full join forever. Not recommended: it silently deletes a performance fence (`92ee03b9`'s whole reason for existing) while the commit message says "conversion".

**Recommendation: (a)** — **RULED (a).** The proof instrument named here as "the forced-FULL differential" was **refuted by FOLD-I1 and replaced** by the NULL-stamped cohort differential of §4.5; the deviation entry cites that, not this sentence.

### **H-A2 (RULED (a) = 240) — `enrich_heritage_phase_timeout_minutes` seed.**
The legacy has no statement timeout. This phase is **one statement**, so `SET LOCAL statement_timeout` genuinely is a phase bound here. Measured full recompute: **59–75 s** locally; no cloud ledger row for this slug exists, so any cloud number is a projection. R-X's failure mode is a ceiling **below** real runtime turning a healthy run into a failure. **RULED: (a) 240** (min 0, max 290) — parity with `enrich_ravines`, below the 300-min platform wall so an abort dies loud at a named phase boundary rather than as a GitHub kill, and replaced by the measured value after the batch-close cloud run.

*(Pre-ruled, NOT re-asked: `records_total` = the scanned population, per row 2.1's A4 ruling applied to the identical archetype — here `eligible_parcels_scanned` = 486,514. The commit form is R-AH-mandated, not chosen. The fixture question of §4.4 is a mechanical proof, escalating to an Ask only if step 1 of that section fails.)*

---

## §13. Fold Log — plan-panel findings, each re-verified against the code before being written here

> Procedure note (Spec 124 §4.2): the folds were **proposed** by the plan panel and **re-grounded** by this pass before entry. Two arrived with wording that did not survive that check and are recorded with the correction, not the original claim.

| ID | Finding | Verification run for this fold | Where it landed |
|---|---|---|---|
| **FOLD-I1** | The §4.5 forced-FULL differential proves nothing: `ENRICH_HERITAGE_FORCE_FULL` only short-circuits `staleCount` to 1, and the 4-column guard then writes 0 rows against an unchanged source, so both sides report `0` and an unchanged hash. | Read `enrich-heritage.js:388-389` (`const staleCount = forceFull ? 1 : await countStale(...)`) and `:257-260` (the guard). Confirmed: **`0 === 0`**. | §4.5 **rewritten** — NULL-stamped cohort differential, cohort composition fixed by measurement (94 multi-point + ~100 single Part IV + ~200 HCD incl. the 4 null-date districts + ~100 undesignated + all 16 invalid-geom), expectation pre-pinned, **~5 min**. §3.5 states why FORCE_FULL is still load-bearing but is not an instrument. |
| **FOLD-I2** | `step-conformance.infra.test.ts` `KNOWN_GAPS.enrich_parcels.missing` must gain `enrich_heritage`, as `83b0cb98` did for ravines. | Read `:2167-2188`: the row is `enrich_parcels: { missing: ['enrich_ravines'], extra: [] }, // RV-D5`. Cause re-derived independently: `scripts/lib/compute/enrich-parcels.js:460/:587/:593/:597` reads `is_heritage_designated`. | §0.5 registry table + commit ③ + ledger **EH-D4**. Allowlist, do not fix — the LDG-D1/LDG-D2/RV-D5 disposition. |
| **FOLD-I3** | `step-schema.logic.test.ts` "exactly three converted ENRICHERs" → four. | Read `:731-734`. **Correction to the fold's wording:** it is not a count but a **pinned list** in a `toEqual([...])`, deliberately ("pinned rather than counted so a THIRD member still has to come here and say so"). So the edit is *append the path **and** rewrite the assertion message*, not bump a number. | §0.5 + commit ③ + checklist **T9**. |
| **FOLD-I4** | Self-contradiction: the CLOUD-PRE `blocks[]` removal was listed both in commit ③ and under "performs neither". | Read this plan's own §0.5 / ③ / Not-in-scope. Contradiction confirmed. Registry invariant #9 makes the edit mandatory at cutover; it is a **repo registry edit**, not a cloud action. | Checklist **T5** rewritten; the "performs neither" clause **deleted** from Not-in-scope, which now scopes to the cloud **seed apply** and **dispatch** only. |
| **FOLD-I5** | Under (a), a levenshtein-threshold change and address-only parcel edits no longer re-stale; the legacy healed them on any `stale > 0` run. | Re-derived from code: the stamp is a source-content hash; `load-parcels.js:356-358` nulls it only on a `geometry::jsonb` change. **Impact bound MEASURED, not assumed:** 94 multi-Part-IV-point parcels (272 points, max 15), out of 1,217 with any point; the only movable field is `heritage_designation_date`. | §2 (FOLD-I5 block + the variable's own seed description) + descriptor `limitations[]`. The per-row-invalidation idea is **filed to followups**, not built. |
| **FOLD-I6** | `post_phase` does not receive `contract`; the pass must return `datasetVersion` alongside `updated`, as ravines does. | Read the call site: `postPhaseFn(pool, { passRaw, specs, full, runAt, config, descriptor, staleOverlays })` — **no `contract`**. Cross-checked against `enrich-ravines.js`'s `return { rows_updated, sourceDatasetVersion }` → `join.sourceDatasetVersion`. | New **§3.5**. Key name is `updated` (not `rows_updated`) **only because** this plan depends on the RV-D4 fix; §3.3's instrumented proof is the gate. |
| **FOLD-G1** | `enrich-heritage-418.db.test.ts` H1/H2/C-R1/"C" call the exported `countStale`, which (a) retires — each needs a named disposition, never a gutting. | Read `:31-32` (typed handle) and the call sites `:88`, `:93`, `:101`, `:119`, `:134`, `:157`, `:176`. All five cases confirmed dependent on exports the frozen shell drops. | §5 **per-test disposition table** (5 rows, every one "RE-DERIVED", two of them *strengthened*) + checklist **T7** (no assertion-count decrease without a stated reason). |
| **FOLD-G2** | H2's behaviour needs its own named lock. | Same file, `:112`. | §5 — `heritage_version_bump_restales_eligible_only`, RED in **both** directions (drop the stamp conjunct; weaken the eligibility clause). |
| **FOLD-RC1** | The 10 % share ceiling and the 1,000 collapse floor are blind to a zone-local collapse. | Ran the per-zone aggregate: **CRE 507/552 = 91.85 %**, RM 24 (0.04 %), RS 3 (0.01 %), RT 2 (0.01 %), CR 1,811 (9.99 %), R 4,521 (4.41 %), RD 2,391 (1.02 %), RA 10 (0.42 %). Worked the counterexample: losing all of CR moves the global share 2.047 % → 1.68 %, inside both bounds. | §7 — per-zone **INFO** rows in `records_meta` via a third `emits[]` key; **no new gating check, no new tunables**. **Correction to the fold's wording:** `parcel-sanity-audit.js` does have 0 heritage hits, but `assert-parcel-sanity-fields.js` has 4 — all about `max_buildable_gfa_basis='heritage_existing'`, none about this step's four columns. The followup row says that precisely. |

### §13.2 Fold round 2 — the independent fold-validator (35/40 claims reproduced; 3 BLOCKERS + nits)

| ID | Finding | Verification run for this fold | Where it landed |
|---|---|---|---|
| **FOLD-V1** (BLOCKER) | Round 1's `BEGIN … ROLLBACK` cohort differential is **unexecutable**: the step runs as a child process with its own pool, so an outer transaction is invisible — `0 === 0` again. | Read `capture-step-golden.js:71` (`require('child_process')`), `:713-728` (`spawnStep`, "mirrors `run-chain.js#spawnStepChild`"). Confirmed. Also confirmed the weaker half: a NULL-stamp-only perturbation lets a wrongly-silent run hash-equal baseline on the value columns. | §4.5 **rewritten again** — COMMITTED perturbation (stamp NULLed **and** the 3 value columns corrupted), baseline hash recorded first, run must restore to it **exactly**, plus a mandatory **restore-on-failure bracket** so a failed differential never leaves corrupted heritage flags in the dev DB. Runs **twice**: legacy at ①, converted at ②. **8 min.** |
| **FOLD-V2** (BLOCKER) | FOLD-G2's and test 9's RED mechanisms are wrong under the single predicate. | Worked out from the real predicate, not from the fold's wording — **and the fold's own suggested red is also wrong**: dropping the `$2` conjunct WIDENS scope (it cannot make a stale parcel "not re-picked"), so the catching assertion is the **convergence** half (run 2's scope never empties). For the invalid-geom case, weakening eligibility does **not** wedge: the 16 rows enter scope, match nothing, and **get stamped** — so "never permanently stale" cannot fail and was dropped. | §5 test 7 (RED restated as non-convergence), test 9 (**claim narrowed** to *the 16 ineligible parcels are never written or stamped* — executable, MEASURED as an exact identity: `unstamped = 16`, `unstamped ∧ ineligible = 16`, `stamped ∧ ineligible = 0`), FOLD-G2 (both REDs restated). |
| **FOLD-V3** (BLOCKER) | §1/§5 ("re-point, never drop") collides with test 9 ("the mirror-lock is obsolete") over `enrich-heritage-418.logic.test.ts`. | Read the file's 9 cases (`:46/:50/:54/:58/:79/:86/:91/:102/:118/:122/:130/:141`). Collision confirmed; both halves are right about different tests. | §5 — a **per-test ruling table**: 6 RE-DERIVED, **3 RETIRED each with a named successor** (`:91` ordering lock → `guards.requires`; `:122` `staleCount` short-circuit → a `ctx.full` successor claim; H1 `:130`/`:141` textual mirror-lock → test 9's executable claim). **9 assertions in, 9 out.** Reconciled with T7 by stating every retirement explicitly. |
| **V-nits** | 8 applied. | Each re-checked: **RV-D4 has LANDED** (`seamOwned` at `index.js:3049/:3428/:3447/:4025`; `enrich-ravines.js:177` now `return { updated, sourceDatasetVersion }`) · `skipped` derives as `updated === 0`, **not** from a "scope count" that does not exist in `postPhaseFn`'s argument object · test 7's RED was inverted · test 13 + the lock-62 source text are already true ⇒ plain `it()` · `:101` is a **comment**, the live call is the file's own `myStale` helper · §0.4 skip max is **38,875 ms (id 1476)**, not 38,008 · seam pairs **17/9**, not 17/10 (no converted descriptor declares `enrich_heritage` upstream — that is EH-D4) · RC1's eight zones cover only **9,269/9,958**. | §3.3, §3.5, §4 commit rows (kill-mid-run test + `defect-ledger.md` added), §0.4, §0.5, §5, §7 (**`(null)` + `other` buckets and a stated Σ-identity check**), skeleton `limitations[]` (FOLD-I5 added), and a wording purge: Goal/F6 now say *"byte-for-byte except the declared Layer-2 predicate"*, §8's "either H-A1 option" is resolved to (a), §10 reads T1–T9, and §12's **"resumable" claim is STRUCK** (one shared transaction ⇒ no partial state to resume; the real difference is which rows are *visited*). |

**Pairwise collision check (run explicitly, per the Cross-read Adversary's charter):** I1 × I5 — the cohort differential proves value-equivalence for rows *in scope*; it cannot and does not prove threshold propagation, which is I5's declared limitation. Complementary; note added in §4.5. · I1 × G2 — G2 proves a version bump *enters* scope, I1 proves what is written *once* in scope; opposite ends of the same predicate, neither substitutes. Note added in §4.5. · I5 × G2 — I5 declares what does NOT re-stale, G2 locks what DOES; together they fix the predicate from both sides. · I1 cohort × RC1 — the cohort is **not** the per-zone instrument and must not be read as one: RC1's rows are a whole-table aggregate emitted every run. · I2 × I3 × T9 — all three redden only at cutover and are batched into one pre-push isolation run. · I4 × Not-in-scope — resolved: registry edit in, cloud seed/dispatch out. · I6 × §3.3 counters — consistent: the pass returns `{updated, datasetVersion}`, `records_updated` still roots at `written.e1.updated`, `records_total` at `matched.compute.eligible_parcels_scanned`.

**Counts after BOTH fold rounds:** commits **3 planned / 5 budgeted** (unchanged — every fold lands inside an existing commit; note ① now also carries the legacy-side differential) · logic variables **10** (unchanged — RC1 deliberately adds none) · probe list 191 → **201** (unchanged) · machine time **≈ 53–66 min** (45–55 → 50–62 → **53–66**) · ledger ids **EH-D1…EH-D4** · followups filed at cutover: **3** (per-row invalidation · the sanity-harness heritage gap · zone-scoped gating) · `-418.logic` assertions **9 in / 9 out**, with 3 named retirements.

**Round-2 collision check:** V1 × goldens — the perturbation is now COMMITTED, so §4.5 sequences it strictly outside every capture window (① after the PRE pair, ② after the POST pair); a perturbation landing between a PRE and its POST would surface as Class-B drift and void the differential. · V1 × V2 — the differential's negative control (the 16 untouched ineligible rows) and test 9's narrowed claim assert the **same** property from different altitudes; both are kept because one is fleet-wide data and the other is a red-provable lock. · V2 × V3 — test 9's narrowed claim IS the named successor for V3's retired H1 pair; they must land in the same commit or the retirement is unbacked. · V3 × T7 — reconciled by rule: T7 forbids an *unexplained* decrease, and every retirement here is named with its successor.

---

## Operating Boundaries

**Target files:** `scripts/enrich-heritage.js` · `scripts/enrich-heritage.descriptor.json` (new) · `scripts/lib/compute/enrich-heritage.js` (new) · `src/tests/steps/enrich_heritage/**` (new) · `src/tests/db/enrich-heritage-kill-mid-run.db.test.ts` (new) · the five existing test files of §5 · `docs/reports/golden/enrich_heritage/**` (new) · `docs/reports/2026-09-__-batch2-p2-2-enrich-heritage-assessment.md` (new) · `scripts/seeds/logic_variables.json` · `scripts/generate-logic-variable-groups.mjs` + its generated JSON · `docs/reference/logic-variables-registry.md` · `scripts/analysis/parcel-field-dump.js` · `scripts/steps/_schema/{converted,step-archetype-census,programme-items,execution-budget-disposition,template-freeze}.json` + the two census fixtures · `scripts/quality/assert-schema.descriptor.json` + its 4 goldens · the fleet pins of §0.5 · `docs/specs/01-pipeline/{61,43}*.md` · `docs/specs/00-architecture/00_system_map.md` · `docs/reports/{defect-ledger,review_followups}.md` · `docs/reports/generated/**`.

**Out-of-scope files:** `scripts/steps/_schema/step.schema.json` — **frozen**; any additive field is a numbered RE-FREEZE with `x-ruling` + `--refresh` + a 122a amendment, and is an Ask · `scripts/lib/step/**` — **no change planned** (§3.4); if one proves necessary it is an Ask, not a decision · `scripts/load-heritage.js` (C5 row 3.4 owns it; #426 is closed, §0.3) · `scripts/enrich-permits.js` (consumer — read, never edit) · `scripts/lib/compute/enrich-parcels.js` · `src/components/**`, `src/lib/admin/**` (Admin domain — read, do not touch) · `migrations/**` · `mobile/**`.

**Cross-spec dependencies:** 119 governs · 121 (method) · 123 (procedure) · 122/122a (architecture) · 124 (policy register) · 61 + 43 (owners) · 47 §A.5 (lock 62) · 48 §3.6/§4.9 (observability + the severity rule) · 49 (freshness consumers) · 30 §5.4.1 (halt semantics) · 115 (scheduling).

## Not in scope

**Any cloud dispatch, any cloud seed apply, any compute resize, any upgrade-day** — batch 2's cloud acceptance is deferred to batch close by operator ruling (R-AQ; `project_cloud_acceptance_strategy` ruling 2026-09-18). This plan **lists the cloud seed of §2(b) as an operator follow-up and does not perform it**. **FOLD-I4:** the CLOUD-PRE `gate.blocks[]` removal is **NOT** in this category — it is a local registry edit required by invariant #9 and it **IS performed**, in commit ③, together with the `122-programme-backlog.md` regeneration · fixing the `load_heritage` #426 class (closed) · fixing `verdict.js`'s `LIMIT_NUMBER_RE` sign gap (2.1 filed it MED; this step's bounds are all non-negative, so it does not bite) · fixing the shared runner's `PASS_SCANNED_FIELDS` double-count (RV-D4 — this plan **depends on** that fix, §3.3) · widening `assert_parcel_sanity` with heritage fields (**FOLD-RC1 files it; it is not built here**) · building a **zone-scoped gating check** or per-zone tunables (FOLD-RC1 emits INFO visibility only — the per-zone bounds are uncalibrated) · **per-row / threshold-aware stamp invalidation** (FOLD-I5 files it) · re-scoring any prior pilot · thinning the panel below §9 · skipping the PRE captures.

---

> **PLAN AUTHORIZED — Status: Implementation.** H-A1 = **(a)**, H-A2 = **(a) 240**, both ruled 2026-09-20; the plan-altitude panel's nine findings are folded and re-grounded in **§13**. Implementation opens at commit ① with the RV-D4 dependency proof of §3.3 — **if RV-D4 has not landed, HALT and ask; do not re-apply the `rows_updated` workaround.**
> §11 note: the only non-obvious compliance choice is item 37 — the 10 new values are single-sourced through `ctx.config` and therefore do NOT get a `docs/specs/_contracts.json` row; stated in ② rather than left silent.
> **Still owed:** the OUTPUT-altitude panel (§9) and the three cutover followups (§13).
