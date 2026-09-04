# Pilot 9 Assessment — `enrich_parcels` (ENRICHER, 8th and last unproven archetype)

**Status:** Commit 1 (PH-0 boundary freeze, G0) landed. Every plan §0 DATA/file number re-executed
live against `scripts/enrich-parcels.js` this commit, not transcribed from `.cursor/
pilot9_enrich_parcels_active_task.md`. Zero drift found against the plan's own Grounding table
(lines 132-172) — every claim re-checked matched exactly, with two corrections: the commit-ledger
row 1's own text ("the 17-statement DML table") is itself stale inside the authorized plan — the
plan's later, Fold-corrected enumeration (§ "Every DML/DDL statement enumerated") lists **27**
statements, and that is the number this commit carries forward; and 00_system_map.md's owner row
for `scripts/enrich-parcels.js` **already exists** (`65_enrich_parcels.md` row, `:63`) — no new row
was needed, unlike the plan's provisional "verify one exists... add if absent" instruction.

**Governing plan:** `.cursor/pilot9_enrich_parcels_active_task.md` (Status: Implementation,
AUTHORIZED 2026-09-04; Folds A-G + Ask rulings binding).
**Governing specs (owner row first, per Spec 123 §6 G0):** `docs/specs/01-pipeline/65_enrich_parcels.md`
(owning spec, `00_system_map.md:63`) · `docs/specs/01-pipeline/55_source_parcels.md` (parcels SoT,
points at 65 for the zoning/max-build/existing-structure columns, confirmed G4) ·
**`docs/specs/01-pipeline/78_optimal_lot_configuration.md`** (governs passes 4-5 — `comp_*`/
`comparable_builds`/`opt_*`/`optimal_config`/`nearby_builds_summary` appear only in Specs
78/88/89/100/`01_database_schema`, re-grepped this commit, zero hits in 55 or 65 — Ask 6, ruled
spec-supported at Fold G4) · `docs/specs/01-pipeline/122_pipeline_step_optimization.md`
(architecture) · `docs/specs/01-pipeline/123_step_opt_assessment_validation.md` (procedure) ·
`docs/specs/01-pipeline/124_step_standard_policy.md` (13 rules — governs on conflict).

---

## §1. PH-0 — boundary freeze (commit 1, G0)

> Re-executed 2026-09-04, HEAD `beff0e3a`. Every number below was produced by a fresh command
> against the live file/repo state this commit, not copied from the plan's own Grounding table.

### Core facts, re-confirmed

| Claim | Command | Result |
|---|---|---|
| File size | `wc -l scripts/enrich-parcels.js` | **2,391** |
| Advisory lock + entry point | `grep -n "ADVISORY_LOCK_ID = \|pipeline.run("` | `:74 = 65` (unique repo-wide) · `:2343 pipeline.run('enrich-parcels', main)` |
| 5 pass functions | `grep -n "^async function "` | `:422 enrichParcels` · `:836 enrichMaxBuild` · `:1045 enrichExistingStructure` · `:1202 enrichComparableBuilds` · `:1644 enrichOptimalConfig` (16 total `async function` decls in the file, incl. helpers) |
| `.query(` sites | `grep -c "\.query("` | **44** |
| `auditRows.push` sites | `grep -c "auditRows.push"` | **96** (Fold D1's corrected count, not the plan's earlier "92") |
| Raw / executable `IS DISTINCT FROM` | `grep -n "IS DISTINCT FROM"` | 13 raw; **7 executable** — `:373` (pass 1, ×35 cols), `:812` (pass 2, ×29), `:1015`+`:1033` (pass 3, ×11/×10), `:1268` (pass 4's optconfig-write staleness clause), `:1445`+`:1454` (pass 5's `genuineGuard` + the inert `nearby_changed` OR); 6 comment-only (`:123,334,826,1266,1437,1822`) — matches the plan's own enumeration exactly |
| `LOGIC_VARS_SCHEMA` keys | `sed -n '19,62p'` + manual key count | **25** declared keys, `.strict()` (`:19-62`), resolved `:1885-1912`, `.parse()` throws on failure `:1913` |
| Three unguarded writes | full-file read | `zoning_enriched_at` (`:376`, outside pass-1's `IS DISTINCT FROM` guard by design — comment `:122-123`) · `massing_enriched_at` (`buildMassingStampSql`, `:827-833`, unconditional stamp, design comment `:824-828`) · the `--full`-only comp blanket reset (`:1219-1221`, no `IS DISTINCT FROM`, gated only on `full` + `eligible` + `scopeWhere`) |
| The B4.5 write itself | `buildComparableBuildsUpdateSql`, `:1143-1150` | `UPDATE parcels p SET comparable_builds=…, comp_count=…, … FROM (…) agg WHERE p.id = agg.id;` — **no `IS DISTINCT FROM` anywhere in this statement**; `incr` clause is empty string when `full=true` |
| `permits` read | `grep -n "permits\b"` | `:1112` `FROM permits pr` (pass 4 candidate-set materialization) — **also already declared** in the current file's own `emitMeta` reads-map at `:2322` (`permits: ['zoning_dominant_parcel_id', 'project_type', 'issued_date', …]`), confirming the plan's Fold E4 instruction (the NEW descriptor's `inputs.reads.tables` must gain `permits`) targets a real, currently-undeclared-at-descriptor-level seam, not a wholly new read |
| `pipeline_runs` write vs. declaration | `:1547` heartbeat UPDATE, `:1593` stall-diagnostic UPDATE, vs. `emitMeta`'s writes-map `:2318-2333` | `emitMeta`'s writes map names only `parcels` and `enrich_parcels_pass3_scope` — `pipeline_runs` is written but **undeclared**, confirming `EP-D5` |
| `records_updated` excludes pass 4 | `sed -n '1834-1842p'` | distinct union of pass 1/2/3/5 `updatedIds`; pass 4 (comps) deliberately absent — confirmed by direct read, matches `computeAggregateRecordsUpdated`'s own docblock |
| Three slug spellings | `grep -n "enrich-parcels'\|sources:enrich_parcels\|DEFER_STEP_SLUG"` | `:2343` (`pipeline.run`) · `:75` (`PIPELINE_NAME='sources:enrich_parcels'`, declared, zero other references — dead) · `:91` (`DEFER_STEP_SLUG='enrich_parcels'`, what the defer marker emits) |
| WF3 finding 1.6 ("passDurationsMs never emitted") | `sed -n '2247-2251p'` | **STALE, corrected here** — all five `enrich_parcels_passN_duration_ms` INFO rows ARE pushed, verbatim at those lines |
| Not converted, no descriptor | `node -e` over `converted.json`; `ls scripts/*enrich-parcels*descriptor*` | `converted.length === 8`, `enrich-parcels.js` absent; `No such file or directory` |
| ENRICHER archetype state | `node -e` over `template-freeze.json` | `{archetype:"ENRICHER", shapes:[], runners:[], first_step:null, proven:false}` — the only `false` row of 8; `frozen_after_pilot: 9` |
| `execution.shape` frozen enum | `grep -n "\"enum\"" step.schema.json` + context | `:1175` `enum:["assert","ingest","link","link_keyed","cascade","materialize","backfill","recorder"]`, `"x-frozen": true` — 8 values, no ENRICHER-shaped member |
| ENRICHER `x-profile` | `grep -n "ENRICHER" step.schema.json` | `:1678` `"x-profile": "ENRICHER — claim #54: a staleness.scope on a lineage column IMPLIES a declared invalidator..."` |
| STD-7 owner row | `node -e` over `programme-items.json` | `status:"PARTIAL"`, `owner:{kind:"pilot",ref:"pilot9_enrich_parcels"}`, `gate:{kind:"batching_prereq",blocks:["batching"]}` — evidence text explicitly names pilot 9 as the closing pilot |
| Churn / fix density | `git log --follow --oneline -- scripts/enrich-parcels.js \| wc -l` / `grep -c "^[a-f0-9]* fix("` | **35 revisions, 20 `fix(` = 57%** — the highest fix density of any pilot to date |
| `permits`/`comp_*`/`opt_*` spec ownership | `grep -rln "opt_aor_gfa_sqm\|comparable_builds" docs/specs/` | `78`, `88`, `89`, `100`, `01_database_schema` — **never 55 or 65**, re-confirmed this commit |
| 00_system_map.md owner row | `grep -n "enrich-parcels" 00_system_map.md` | `:63` — row 65 (`01-pipeline/65_enrich_parcels.md`) already names `scripts/enrich-parcels.js` first in its Implementation column, status **Done**. **No new row needed** — a correction to the plan's own provisional G0 instruction, same class as pilot 8's Finding 3 (a generator/reader gap, not a missing declaration) |
| `step-validate.mjs --fast` on an unconverted step | `node -r dotenv/config scripts/analysis/step-validate.mjs --step=enrich_parcels --fast` | **Errors**: `no step found for --step=enrich_parcels (registry has: assert_schema, load_ravines, link_massing, link_wsib, link_parcel_addresses, compute_centroids, link_parcels, refresh_snapshot)` — the tool does NOT accept an unconverted step. Re-checked pilot 8's own commit 4 (`3c6acded`) commit body: it does **not** mention `step-validate.mjs` at all; pilot 8's first live invocation of the tool is at its later "declared run" section (`--write`, post-conversion). The task's premise that "pilot 8 did this at commit 4" does not hold on inspection — stated here per the "else state so" instruction |

### G4 — risk class

**Chance = CLASS A.** 35 commits (largest corpus of any pilot to date) + 57% fix density (20/35,
the highest measured) — both maximal on their own axis. **Impact = HIGH.** Sole write target for
`parcels` (486,530 rows), the widest per-parcel column surface of any converted or pending step (36
+ 29 + 21 + 5 + 11 = 102 written columns across 5 passes), and the gating input to the parcel cost
model (`comp_*`/`opt_*` feed `compute-cost-estimates.js` via `COALESCE(opt_aor, max_buildable_gfa)`,
per `tasks/lessons.md:31`'s own documented $8.9M-garbage incident on this exact file).

### G0 verdict

**CLOSED this commit.** Every plan §0 DATA/file number re-executed with zero drift against the
plan's own (Fold-corrected) claims. Two corrections landed: the commit-ledger row 1's stale
"17-statement" text is superseded by the plan's own later 27-statement enumeration (carried forward
here, not the stale figure); and the system-map owner row for `scripts/enrich-parcels.js` was
already present (`65_enrich_parcels.md:63`), so no new row was written. `step-validate.mjs --fast`
confirmed to reject an unconverted slug outright (hard registry-lookup error, not a soft warning) —
recorded so no later commit assumes the tool was ever run against this step before conversion.

---
