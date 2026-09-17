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

## §2. PH-3 — Intent Ledger over the corpus (commit 2, G3)

> 35 commits (`git log --follow`), **20 `fix(` = 57%**, the highest fix density of any pilot to
> date. Every fence below re-verified via direct `git show <sha> -- scripts/enrich-parcels.js` this
> commit, not transcribed from the plan's own citation list. Per Spec 124 §4.2's discoverer≠adjudicator
> split, every disposition is PROPOSED by this pass (agent, 2026-09-04), stands until a human
> operator ratifies or overturns at commit 7. Closed disposition vocabulary only (Rule 13):
> `preserved-in-runner | preserved-in-validator | preserved-in-compute | encoded-as-descriptor-field |
> encoded-as-deviation | knowingly-retired`. `INCIDENTAL` never appears as a disposition (that
> vocabulary is G6's, not G3's).

| Commit | Date | Construct | Live today? | Proposed disposition | Ground |
|---|---|---|---|---|---|
| `7e130bff` (fix folded into the pass 1 SQL; `tasks/lessons.md:28` documents it) | 2026-05-31 | The float8-vs-`NUMERIC(5,4)` `IS DISTINCT FROM` idempotency trap: `zoning_dominant_area_share` computed as `MAX(area_share)` (float8) never compared equal to the target's `NUMERIC(5,4)`, so every multi-zone parcel rewrote forever | ✓ current file `:336` `round(MAX(area_share)::numeric, 4)`, byte-identical cast | **preserved-in-compute** — Fold B1 rules this ports VERBATIM; the guard SQL is never regenerated generically from a column list, this exact cast is the fix. **Grounded (Rule 4/G-2, commit 7e/2):** the RULE is already written down in `enrich-parcels.notes.json` `fences[]` (`"7e130bff (zoning_dominant_area_share ::numeric cast, lessons.md:28)"`) — this row cites the same fence, not a fresh claim | `:334-338` current file, `git blame` = `7e130bff` (**corrected this commit — `1da014c60`, previously cited, only added tests + the lessons.md:28 prose the same day; it never touched `scripts/enrich-parcels.js`, confirmed via `git show --stat`**); `1da014c60` remains the correct cite for the lesson's own documentation |
| `7e130bff` | 2026-05-31 | **Origin of the whole zoning-pass architecture** — the set-based join CTE rewrite replacing per-parcel correlated `EXISTS` subqueries (`tasks/lessons.md:33`'s own fence: >9min intractable → ~8min with `CREATE TEMP TABLE … AS` + `LEFT JOIN`) | ✓ current file, `enrichParcels`'s whole temp-table/UPDATE shape (`:222-443`) is this commit's architecture, unbroken since | **preserved-in-compute** — the set-based join CTE pattern is load-bearing (a correctness AND performance fence) and ports verbatim; this is pass 1's entire SQL shape. **Grounded (Rule 4/G-2, commit 7e/2):** `lessons.md:33`'s fence is now ALSO carried in `enrich-parcels.notes.json` `fences[]` (added this commit, alongside a matching `decisions[]` entry) — the rule was cited in this ledger's own prose but had never been written into the shipped notes artifact until now | full-file read; re-blamed this commit |
| `df7ef272` | 2026-07-02 | **Origin of the comp-family filter Fold C2/EP-D8 measures the boundary of** — `comp_fsi_p50` restricted to new-build comps (`work_type='new_build'`) with `permit_fsi ∈ [0.05, 8]`, plus the comps-ineligibility reset | ✓ current file, `buildCompCandidatesSql` filter (`:1088-1098`) and the `resetIneligible` UPDATE (`:1208-1213`) both trace to this commit's shape | **preserved-in-compute** — the work_type/FSI-range filter and the reset-on-ineligibility pattern are both verbatim-ported. **This fence is the boundary of what the comp-match predicate DOES filter on** — it never added a `structure_family` term, which is exactly EP-D8's gap (Fold C2/G4): the fence explains why EP-D8 is a genuine spec-silent hole, not an oversight of an existing rule | `:1088-1098,1208-1213` current file; re-blamed `df7ef272` this commit |
| `e8793c8f` | 2026-08-14 | **Origin of the scope-defer mechanism** — `computeDeferScope`, `enrich_parcels_pass3_scope` (mig 240), `enrich_parcels_defer_threshold_rows` — the only LOGGED recovery ledger in the estate (389 lines added, largest single-commit diff to this file) | ✓ current file, `computeDeferScope` `:1777-1847`, the `INSERT INTO enrich_parcels_pass3_scope … ON CONFLICT DO NOTHING` `:2077-2078`, `DEFER_STEP_SLUG` `:91` | **SPLIT disposition** — the SQL/logic is **preserved-in-compute** (verbatim port); the crash-recoverable ledger CONCEPT (rows left inside the txn by design, `:2073-2076`) is **encoded-as-descriptor-field** at commit 7 (`recovery.interrupted` for the pass-3/pass-5 resets per Fold A2, and the pass3_scope table itself named in `outputs.writes[]`) — this is the mechanism Fold A3 says has "no analogue in any converted step". **Grounded (Rule 4/G-2, commit 7e/2):** the preserved-in-compute half's own RULE (defer the whole run when combined scope >= threshold) is written down as the `enrich_parcels_defer_threshold_rows` config.logic_variables[] entry (bounds [1000,500000], on_invalid:"fail") plus a new `enrich-parcels.notes.json` `decisions[]` entry added this commit | `:1777-1847,2077-2078,91` current file; re-blamed `e8793c8f` this commit |
| `a81c6a7c` | 2026-08-16 | **Origin of the honest `records_updated` aggregate** — `computeAggregateRecordsUpdated`, deliberately EXCLUDING pass 4 (comps) from the distinct-union of pass 1/2/3/5 ids | ✓ current file `:1834-1842`, byte-identical shape (`zoningIds, maxBuildIds, existingIds, scenarioIds, optConfigGenuineIds` — no comps ids param at all) | **preserved-in-compute** — this is a §11 counter-scoping decision (Rule 3-B8 lineage) that must survive conversion verbatim; the docblock `:1820-1829` states the exclusion is deliberate, not an omission. **Grounded (Rule 4/G-2, commit 7e/2):** the ported function's own docblock (`scripts/lib/compute/enrich-parcels.js`, "D#5 — the honest aggregate records_updated") restates the rule, and a new `enrich-parcels.notes.json` `decisions[]` entry added this commit cross-references it — pass 4's own write target already declares `idempotent_rerun:"not_idempotent"` (EP-D1/B4.5 PIN), which is why a row that cannot claim genuine work is a bad candidate for a "records genuinely updated" counter | `:1834-1842` current file; re-blamed `a81c6a7c` this commit |
| `fa9e984c2` | 2026-07-29 | Cloud pipeline-infra fence (does NOT touch `enrich-parcels.js` — `git show --stat` confirms 0 file changes here): the Supavisor session-mode pooler drops startup params AND pool-level `statement_timeout`; only a live `SET`/`SET LOCAL` on the established session sticks (`tasks/lessons.md:82`) | N/A to this file directly — governs HOW any pass-timeout mechanism in this file must be wired | **preserved-in-runner** — Fold B2 makes this a hard constraint on Ask 7's pass-5 timeout bound: whatever bound pass 5 gets must be applied via a live `SET LOCAL` on the actual session (not a pool-level param), and the regression lock must assert it via `SHOW statement_timeout` on that session, never by inspecting a config value. This fence is why the SET LOCAL pair at `:2047-2048` is scoped to passes 1-4's shared txn only — pass 5 runs on a separate post-commit connection and inherits none of it (Ask 7's own "cannot survive a slowdown" finding) | `git show --stat fa9e984c2` (0 hits on this file); cross-referenced against `:2047-2048` current file |
| `c7b20ac9` | 2026-09-03 | **Origin of the passes-1–4 bounded SET LOCAL timeout instrumentation** — "bounded LOUD SET LOCAL statement_timeout/lock_timeout for passes 1-4" (WF3 enrich_parcels stall commit 1) | ✓ current file `:2047-2048` (`SET LOCAL statement_timeout`/`lock_timeout`, only when >0), `enrich_parcels_pass_statement_timeout_minutes`/`enrich_parcels_lock_timeout_ms` in `LOGIC_VARS_SCHEMA` `:60-61` | **preserved-in-runner** — first-of-kind mechanism (zero hits in `scripts/lib/` before this file), moves into `runEnrichPhase`/the library WITH the runner per Fold D3 (LG-28), not into pure compute | `:2047-2048,60-61` current file; re-blamed `c7b20ac9` this commit |
| `aff1b093` | 2026-09-03 | **Origin of the silence-gated `pg_stat_activity` stall diagnostic** — `captureStallDiagnostic` (WF3 enrich_parcels stall commit 3) | ✓ current file `:1579-1626` (`captureStallDiagnostic`), consumed at `:1593` | **preserved-in-runner** — same class as `c7b20ac9`, moves into the shared library with the runner (Fold D3), whole-step (not pass-5-only, closing the stall WF3's own deferred item) | `:1579-1626,1593` current file; re-blamed `aff1b093` this commit |
| `00659574` | 2026-09-03 | **Origin of `recordHeartbeat`'s `pipeline_runs` visibility** — "heartbeat observable in pipeline_runs" (WF3 cloud parity FIX 3 remediation) | ✓ current file `:1543-1577` (`recordHeartbeat`), consumed at `:1547` | **preserved-in-runner** — same class, moves into the shared library with the runner (Fold D3); this is also the fence that makes `EP-D5` (pipeline_runs written, undeclared in `emitMeta`) a real gap rather than dead code — the write is genuinely load-bearing (cloud stall diagnosis), just undeclared | `:1543-1577,1547` current file; re-blamed `00659574` this commit |

**Approver for every disposition above:** this pilot's PH-3 pass (agent, 2026-09-04), grounded in
direct `git show`/`git log -p`/`git blame` re-verification this commit — per Spec 124 §4.2's
discoverer≠adjudicator split, PROPOSED here, stands until a human operator ratifies or overturns at
commit 7.

### Defect ledger — opened this commit, formally recorded at commit 4

Per the plan's own Fold G1 ruling (Spec 123 §3.1 pin-then-fix), two DEFECTs found across the fold
process are carried into PH-6 (commit 4) rather than closed here: **`EP-D1`** (B4.5 — the comp-write
`UPDATE` at `:1143-1150` has no `IS DISTINCT FROM`, and the `comp_count = 0` zero-fill at `:1228-1229`
empties the incremental predicate forever after run 1, so the 5-year comps window at `:1114` never
refreshes except under `--full`) and **`EP-D8`** (Fold C2 — `comp_fsi_p50` has no structure_family/zone
compatibility invariant; `df7ef272` above is the fence proving this was never in scope, not an
oversight). Both close per Fold G1's PIN mechanism, not a fix-now disposition.

### G3 verdict

**CLOSED this commit.** 9 fences re-verified by direct `git show`/`git blame` against the live file,
zero transcribed from the plan. `7e130bff` (the whole zoning-pass architecture, including the
`:336` numeric-cast fence `tasks/lessons.md:28` documents — corrected commit 4b: `1da014c60`, the
same-day commit previously cited for the cast, only added tests + the lessons.md prose and never
touched `scripts/enrich-parcels.js`), `e8793c8f` (scope-defer origin), `a81c6a7c` (honest
records_updated origin), `df7ef272` (comp-family filter boundary — the fence that makes EP-D8
provably a gap, not a regression), `fa9e984c2` (the Supavisor SET LOCAL constraint governing Ask 7),
and the
three 2026-09-03 stall commits (`00659574`/`c7b20ac9`/`aff1b093`, the origin of the heartbeat/
diagnostic/timeout instrumentation this pilot ports into the runner) are all adjudicated with the
pilot 8 vocabulary — 5 `preserved-in-compute`, 3 `preserved-in-runner`, 1 `SPLIT` (preserved-in-
compute + encoded-as-descriptor-field). No `knowingly-retired` disposition this commit — unlike
`refresh_snapshot`'s phase-ternary defect, every fence excavated here is still load-bearing in its
original form.

---

## §3. PH-5 — Seam map (commit 3, G5)

> Every place `scripts/enrich-parcels.js` (2,391 lines) touches something outside pure
> computation — DB, clock, network, argv/env — re-derived by direct read this commit, organized by
> seam kind per Spec 122 §5.4, mirroring the plan's own 27-statement DML table but by SEAM rather
> than by statement.

### DB seam

- `pool` — supplied by `pipeline.run('enrich-parcels', main)` (`:2343`), never a local `new Pool()`.
- **44 `.query(` call sites** (re-confirmed commit 1). Passes 1-4 share ONE `pipeline.withTransaction`
  wrap (`:2032-2076`) on a single client; pass 5 runs on `pool` directly, AFTER that transaction
  commits (`:2088-2096`) — the estate's first genuinely two-phase (in-txn + post-commit) step.
- `assertPreconditions` (`:156-167`) — precondition HALT: PostGIS extension present, GiST index on
  `parcels.geom` present. Zero `hasPostGIS`/`pg_extension` BRANCHING anywhere else in the file
  (re-confirmed `grep -c hasPostGIS` = 0) — this becomes `guards.requires` per R-W, a port not a
  retirement.
- **Passes 1-4's shared-txn SET LOCAL pair** (`:2047-2048`) — `statement_timeout`/`lock_timeout`,
  only issued when the resolved logic-var is `>0`; explicitly scoped to THIS transaction only
  (comment `:2033-2043` names `withPipelineStatementTimeout`'s session-level `SET statement_timeout
  TO 0` as the UNCHANGED fallback fence for everything else, incl. pass 5's own connection).
- **Pass 5 is outside BOTH `runPass` and the SET LOCAL pair** — `runPass` wraps only
  `:2058/:2062/:2067/:2071` (passes 1-4); pass 5's own call (`:2090-2095`) runs on `pool` with no
  `runPass` wrapper and no statement-timeout bound of its own, inheriting whatever the session
  already has (today: unbounded). Confirms Ask 7's "this step cannot survive a slowdown" finding —
  a hang in pass 5 dies unnamed at the platform wall, not at a declared boundary.
- **The comps-write B4.5 site** (`buildComparableBuildsUpdateSql`, `:1143-1150`) — `UPDATE parcels p
  SET … FROM (…) agg WHERE p.id = agg.id`, no `IS DISTINCT FROM` anywhere in the statement (`EP-D1`).
- **`permits` read** — `:1112` `FROM permits pr` inside pass 4's candidate-set materialization; ALSO
  already declared in the current file's own `emitMeta` reads-map (`:2322`, 7 columns) — the new
  descriptor's `inputs.reads.tables` gains this as a producer edge, but the read itself is not new.
- **`pipeline_runs` seam** — `recordHeartbeat` (`:1543-1577`, UPDATE at `:1547`) and
  `captureStallDiagnostic` (`:1579-1626`, UPDATE at `:1593`) both write `pipeline_runs`, but
  `emitMeta`'s writes-map (`:2318-2333`) names only `parcels` and `enrich_parcels_pass3_scope` —
  `pipeline_runs` is genuinely undeclared (`EP-D5`, re-confirmed this commit).

### Clock seam

- **11 `Date.now()` sites** (`:1684,1694,1877,2057×2,2059×2,2063×2,2068×2,2072,2089,2096,2252`) —
  ALL elapsed-time-only (heartbeat interval checks, `passDurationsMs`, total `duration_ms`), never
  written to the DB as a timestamp. Legal per `tasks/lessons.md`'s explicit carve-out for
  elapsed-only `Date.now()`.
- **5 `pipeline.getDbTimestamp(...)` DB-clock reads** (`:442,896,1493,1740,2050`) — the correct
  R3.5-compliant pattern for every timestamp actually WRITTEN (`zoning_enriched_at`,
  `massing_enriched_at`, the scope-hand-off `run_id`/`consumed_at` flips).
- **The one genuinely clock-relative gate** — `:1114` `AND pr.issued_date >= (now()::date -
  interval '5 years')`, a server-side `NOW()`-arithmetic literal INSIDE generated SQL. Confirmed the
  ONLY `NOW() − INTERVAL` construct in the file (`grep -n "now()::date"` = 1 hit). Per Fold G3, this
  is a MANDATORY seam rewrite at commit 7 (Spec 122 §5.5 bans `Date.now()`/`new Date(`/bare `fetch(`
  outright as of the injected-seam rule) — `ctx.clock.asOfDate()` threaded through `runEnrichPhase`,
  not an optional cleanup. Externalizing the as-of-date as a logic variable is a reasonable
  extension but not literally mandated by Rule 3's closed 7-item category list (Fold G3).
- **0 `new Date(` anywhere** (re-confirmed).

### Network seam

- **0 `fetch(` calls** — no external network dependency, consistent with every prior converted
  `sources`/`permits`-chain step.

### argv/env seam

- **1 `process.argv` + 1 `process.env` read, same line** (`:1876`):
  `process.argv.includes('--full') || process.env.ENRICH_PARCELS_FORCE_FULL === '1'` — matches
  `manifest.json`'s `chain_args.sources: ["--full"]` / `supports_full: true` / `supports_dry_run:
  false` exactly. No other argv/env reads anywhere in the file.

### Producer/consumer seams (Finding-class, R-V)

**Producers this step reads from — derived from the ledger tool, not hand-listed (corrected
commit 4b).** `node -e "require('./scripts/lib/ledger.js').stepUpstreams('enrich_parcels',
{chain:'sources'})"` returns **8 producers**, byte-identical to `docs/reference/
data-lineage-map.md`'s own `## Upstream sets` row (`enrich_parcels | sources | enrich_centreline,
enrich_heritage, enrich_ravines, link_massing, load_zoning, massing, neighbourhoods, parcels`) — the
committed doc and a fresh tool run agree exactly:

| Producer | Converted? (`converted.json`) | Read site (this file) |
|---|---|---|
| `enrich_centreline` | not converted | ravine/heritage/centreline flags read by pass 2 (`buildMaxBuildSql` inputs) |
| `enrich_heritage` | not converted | `is_heritage_designated` read by pass 2's heritage freeze |
| `enrich_ravines` | not converted | `is_in_ravine_protection_area` read by pass 2 |
| **`link_massing`** | **CONVERTED** | `parcel_buildings`/`building_footprints` (emitMeta reads-map `:1148-1149`; pass 2 heritage freeze + pass 3 primary-massing join) — `scripts/link-massing.js:8` header confirms the write, re-checked this commit |
| `load_zoning` | not converted | the 10 `zoning_*` overlay/bylaw tables pass 1 joins |
| `massing` (INGESTOR, `building_footprints`) | not converted | pass 2/3's `building_footprints` reads |
| `neighbourhoods` | not converted | `neighbourhoods.avg_household_income`, `neighbourhood_storey_norms` (pass 2 LATERAL) |
| `parcels` | not converted (self-referential upstream — the ledger's own column-lineage sense: prior-run columns this step reads back) | pass 1's `geom`/lot-dimension base read |

**Only ONE of the 8 ledger-derived producers is converted (`link_massing`)** — matches pilot 8's
own R-V framing but is smaller in absolute count than its 3 new seams, because none of this step's
other 7 ledger-derived producers are converted yet.

**Correction (commit 4b, ground-truth):** commit 3's original table hand-listed `permits`
(`load-permits.js`) and `neighbourhood_build_norms`/`neighbourhood_storey_norms`
(`compute-build-norms.js`) as producer seams. The ledger tool does **not** derive either for the
`sources` chain — `load-permits.js`/`compute-build-norms.js` run in the `permits` chain, not
`sources`, so `stepUpstreams('enrich_parcels', {chain:'sources'})`'s own chain-restriction (§ "Upstream
sets", `data-lineage-map.md:1555`: "restricted to producers sharing that SAME chain") correctly
excludes them — they are real column reads (`permits pr` at `:1112`; `neighbourhood_build_norms` at
pass 2/5) but NOT same-chain producer edges under the `sources` chain this pilot converts against.
The commit-7 descriptor must reflect this split: `inputs.reads.steps` declares the converted subset
(`link_massing`) plus, if the descriptor's author chooses to declare cross-chain producers too, the
7 unconverted same-chain ones by name; `inputs.reads.tables` covers `permits`/
`neighbourhood_build_norms`/`neighbourhood_storey_norms` as plain table reads (no step-edge claim,
since they are not same-chain producers of `sources`). `parcels.centroid_lat/lng` (from
`compute_centroids`, converted) and `permit_parcels` (from `link_parcels`, converted) are **NOT**
read anywhere in this file — confirmed by direct read, not assumed; no seam there.

**Consumers of this step's writes (downstream, not yet converted):** `compute-build-norms.js`,
`compute-coa-cost-estimates.js`, `compute-cost-estimates.js`, `compute-parcel-cost-estimates.js`,
`enrich-permits.js` — all read `max_buildable_gfa_sqm`/`opt_aor_gfa_sqm`/`comparable_builds` (grep
confirmed, `grep -rl` over `scripts/*.js`). None are converted steps, so no NEW live seam
declaration is owed in the other direction this pilot.

### Seam-map verdict (G5)

**CLOSED this commit.** DB: 44 query sites characterized by phase (passes 1-4 shared-txn vs. pass 5
post-commit standalone), the SET LOCAL pair's exact scope (passes 1-4 only, confirmed pass 5's
exclusion), the B4.5 unguarded write, and the `pipeline_runs` declaration gap (`EP-D5`). Clock: 11
elapsed-only `Date.now()` sites (legal), 5 DB-clock reads (correct pattern), 1 genuinely
clock-relative gate (`:1114`, MANDATORY seam rewrite per Fold G3, not optional). Network: absent.
argv/env: 1 `--full` flag, both spellings on one line, matches manifest declaration. Producer seams
(corrected commit 4b): 8 producers, ledger-tool-derived (`stepUpstreams('enrich_parcels',
{chain:'sources'})`, byte-identical to `data-lineage-map.md`'s own row), of which only
`link_massing` is converted — smaller than pilot 8's 3 new seams because this step's other 7
same-chain producers are not yet converted. `permits`/`neighbourhood_build_norms` are real reads but
NOT same-chain producers of `sources` (they run in the `permits` chain) — declared as
`inputs.reads.tables`, not `inputs.reads.steps`, at commit 7.

---

## §4. PH-6 — Classification (commit 4, G6)

> All 27 enumerated DML/DDL statements (commit 1's table) + the 8 defects surfaced across §1-§3
> classified per Spec 123 §3's three-way split: **CONTRACT** (a downstream consumer depends on it,
> even if ugly) / **INCIDENTAL** (nothing observes it) / **DEFECT** (a spec or invariant asserts the
> opposite), plus each pass's write-class mechanic (step.schema.json's 15 lettered mechanics),
> guard, and `idempotent_rerun`/`recovery.interrupted` disposition per Fold A1/A2.

### The 27 enumerated statements

| # | Statement | Classification | Ground |
|---|---|---|---|
| 1-8 | 4× `DROP TABLE IF EXISTS` + `CREATE TEMP TABLE … ON COMMIT DROP AS` (+ GiST index, ANALYZE) | **CONTRACT** — the set-based join CTE fence (`tasks/lessons.md:33`, origin `7e130bff`) and Spec 78 §P3C.1 performance fence | `:424/425,839/840,1047/1048,1107,1138,1139` |
| 9 | Pass 1 UPDATE, 35 cols + `zoning_enriched_at` stamp (deliberately outside the guard) | **CONTRACT** (guarded ×35) + the stamp itself is **DEFECT-adjacent-by-design** — unguarded but documented (`:122-123`), needs a Rule 9 grandfather entry, not a ledger DEFECT | `:375`, exec `:443` |
| 10 | Pass 2 UPDATE, 29 cols | **CONTRACT**, guarded ×29 | `:814`, exec `:893` |
| 11 | `massing_enriched_at` stamp | **DEFECT-adjacent-by-design**, same class as #9 — unguarded, documented (`:824-828`), Rule 9 grandfather | `:831`, exec `:897` |
| 12-13 | Pass 3 EXISTING (11) + SCENARIO (10) UPDATEs | **CONTRACT**, guarded ×11/×10 | `:1017,1035`, exec `:1068,1069` |
| 14 | Comps ineligibility reset | **CONTRACT** — the "gated pass never revisits a row that loses its gate" fix (`tasks/lessons.md:31`) | `:1213`, exec `:1212` |
| 15 | `--full`-only comp blanket reset | **DEFECT-adjacent-by-design** — unguarded, but its blast radius (354,679 rows) is B4.5's own subject, folded into `EP-D1` rather than ledgered separately | `:1220` |
| 16 | Pass 4 comps UPDATE | **DEFECT — `EP-D1` (B4.5)** — no `IS DISTINCT FROM` at all | `:1146`, exec `:1225` |
| 17 | `comp_count = 0` zero-fill | **CONTRACT-with-a-consequence** — correct in itself (an honest "processed" marker), but it is what makes the incremental comps refresh a permanent no-op; folded into `EP-D1`'s second half, not a separate ledger row | `:1229`, exec `:1228` |
| 18-19 | `SET LOCAL statement_timeout`/`lock_timeout` (passes 1-4 only) | **CONTRACT** — the WF3 stall bounded-terminal fence (`c7b20ac9`) | `:2047,2048` |
| 20 | `INSERT INTO enrich_parcels_pass3_scope … ON CONFLICT DO NOTHING` | **CONTRACT** — scope-defer ledger, mig 240 (`e8793c8f`) | `:2078`, exec `:2077` |
| 21 | Pass 5 ineligibility reset (11 cols → NULL) | **CONTRACT** — Spec 78 §P3A.1, `tasks/lessons.md:31`'s gated-reset fence | `:1662`, exec `:1661` |
| 22 | Pass 5 batched `WITH incoming(…) AS (VALUES …) … UPDATE` | **CONTRACT for the mechanic; DEFECT for the guard** — `EP-D3` is a different defect (verdict), but the `OR nearby_changed` guard is a **DEFECT** in its own right, folded here as the pass-5 half of the idempotency table below (not separately ledgered — Fold A1 already names it `declared_drift`, a declared/accepted non-idempotency, not a bug) | `:1447`, exec `:1464` |
| 23-24 | `enrich_parcels_pass3_scope.consumed_at` bulk + per-parcel flip | **CONTRACT** | `:1742,1514` |
| 25-26 | Heartbeat + stall-diagnostic `pipeline_runs` UPDATEs | **CONTRACT, but undeclared — `EP-D5`** | `:1547,1593` |
| 27 | `CREATE INDEX comp_cand_gix` / `ANALYZE` | **CONTRACT** | `:1138,1139` |

Zero statements classified **INCIDENTAL** — every one of the 27 either serves a declared purpose a
downstream consumer or the file's own design comment depends on, or is one of the two open write-
class DEFECTs (`EP-D1`/the pass-5 guard). Unlike `refresh_snapshot` (a RECORDER whose whole job is
observation), `enrich_parcels` is an ENRICHER whose whole job is per-parcel mutation — so an
INCIDENTAL write here would mean dead code, and none was found.

### Per-pass write class, guard, idempotency (Fold A1/A2)

| Pass | Write class (mechanic, letter) | Guard | `idempotent_rerun` | `recovery.interrupted` |
|---|---|---|---|---|
| 1 zoning | `temp_materialize` (I) — 35-col UPDATE | `IS DISTINCT FROM` ×35 | `zero_writes` on the 35 guarded cols; `zoning_enriched_at` is a separate unconditional stamp (Rule 9 grandfather, not part of the guarded set) | none declared — mid-txn crash rolls back entirely (single shared txn, passes 1-4) |
| 2 max-build | `temp_materialize` (I) — 29-col UPDATE + `set_based_scoped`-shaped stamp (G) | `IS DISTINCT FROM` ×29; `massing_enriched_at` stamp UNGUARDED by design | `zero_writes` on the 29 guarded cols; the stamp is `declared_drift` (write count = scope count every run, by design) | none declared — same shared txn |
| 3 existing+scenarios | `temp_materialize` (I) — two sibling UPDATEs | `IS DISTINCT FROM` + `ROUND(…,2)` for float stability | `zero_writes` | none declared — same shared txn; scope-deferred rows spooled to `enrich_parcels_pass3_scope` are left inside the txn BY DESIGN (crash-recoverable trail, Fold A3) |
| 4 comparable-builds | `set_based_scoped`/`set_based_unscoped` hybrid (G/H) — scoped but **UNGUARDED** | **NONE** — `WHERE p.id = agg.id` only (`EP-D1`) | **`not_idempotent`** (Fold A1 — takes Ask 4/Fold G1's PIN ruling: `guard:"none"` + `guard_why` + `grandfathered.json` entry, paired with this value) | **`recovery.interrupted`: declared per Fold A2** — the ineligibility reset (#14) is a `set_based_null_retract`-class statement |
| 5 optimal-config | `derived_recompute` (K) — batched `UPDATE…FROM (VALUES…)` | `IS DISTINCT FROM` ×10 (`genuineGuard`) **OR** `nearby_changed` — the OR makes the guard effectively inert | **SPLIT (Fold A1)**: the 10 genuine `OPTCFG` columns → `zero_writes` (guard proven, `genuineGuard` alone would gate correctly); `nearby_builds_summary` alone → `declared_drift` (measured 88,575/88,575 rows every run, precedent `link_massing` E1) | **`recovery.interrupted`: declared per Fold A2** — the ineligibility reset (#21) is `set_based_null_retract`-class; `enrich_parcels_pass3_scope` rows left in-txn are the crash-recoverable trail this pass consumes on the next run |

### Defect ledger — formally recorded this commit

`docs/reports/defect-ledger.md` gains 8 rows (`EP-D1`-`EP-D8`), all Status/Ground columns cited
against HEAD `1eaf70ef`. Per Fold G1's pin-then-fix mechanism, `EP-D1` (B4.5) and `EP-D8` (comps
family invariant) carry **PIN (Spec 123 §3.1) — pinned_until: pilot9 commit 9** in their Status
column — the same convention as the live `AS-D11`-`AS-D13` rows. The remaining six (`EP-D2`-`EP-D7`)
are OPEN, each with its own closing commit per the plan's commit-ledger row 4 done-test.

### Programme-items — the two cutover_prereq entries (Fold G1)

`scripts/steps/_schema/programme-items.json` gains `EP-PIN-B45` and `EP-PIN-D8`
(`gate.kind:"cutover_prereq"`, `blocks:["enrich_parcels"]`, `status:"NOT_STARTED"`,
`owner:{kind:"pilot",ref:"pilot9_enrich_parcels"}`), schema shape mirroring the live `STA-1` entry
(re-read this commit as the convention template). This makes Spec 122 §10.3's conservative-blocking
rule ("a slug whose descriptor cannot be resolved... still blocks") structural for commit 9's
`converted.json` registration: `checkCutoverPrereqs` will refuse the registration until both items
flip `BUILT` (i.e. until peels 8x/8y land).

**Proven two ways:**

1. `npm run programme-backlog` (`node scripts/violations/generate-programme-backlog.mjs`) regenerated
   `docs/reports/generated/122-programme-backlog.md` — the "Cutover prerequisite" section now lists
   both `EP-PIN-B45` and `EP-PIN-D8` naming `enrich_parcels` in their `blocks` column, alongside the
   existing `STA-1` row. Re-derivable by anyone re-running the generator; the file is drift-checked
   by `src/tests/programme-backlog.infra.test.ts`.
2. Direct call: `checkCutoverPrereqs(['enrich_parcels'], items, {})` (`scripts/analysis/
   step-validate.mjs:405`) — `enrich_parcels` is not yet in `converted.json`, so the tool's own
   `--step=enrich_parcels` invocation cannot exercise this path today (commit 1's own finding); this
   commit instead calls the exported function directly with `enrich_parcels` substituted for the
   real (post-commit-9) `convertedSlugs` argument, over the items array including the two new
   entries. Result: 2 violations returned, `{slug:'enrich_parcels', id:'EP-PIN-B45', status:
   'NOT_STARTED', ...}` and the `EP-PIN-D8` sibling — confirming the mechanism will genuinely fire
   the moment `enrich_parcels` is added to `converted.json` at commit 9, not merely that the data
   exists.

### G6 verdict

**CLOSED this commit.** 27/27 statements classified, zero INCIDENTAL (consistent with an ENRICHER's
whole purpose being per-parcel mutation). 8 DEFECTs opened and ledgered (`EP-D1`-`EP-D8`), 2 of them
(`EP-D1`, `EP-D8`) formally PINned per Fold G1 with `programme-items.json` cutover-prereq entries
that structurally block commit 9's `converted.json` registration — proven both via the regenerated
backlog doc and a direct `checkCutoverPrereqs` invocation. Per-pass write-class/guard/idempotency
table completed for all 5 passes per Fold A1/A2, including the SPLIT dispositions (pass 2's stamp,
pass 5's genuine-columns-vs-`nearby_builds_summary` split) that a single per-pass label would have
hidden.

---

## §5. Golden master (commit 5, G1') + EP-D9/EP-D10 root-cause (commit 4c)

**Precondition (Fold C1).** A fresh local `enrich-parcels --full` completed (2636.7s,
`records_updated: 145362`, verdict WARN) before capture. `parcel-sanity-audit.js` re-run:
`max_build_dim_below_floor` reads **0/0** (D-C fix confirmed post-`--full`) —
`footprint_coverage_gt_65pct` 1232/411076, `max_build_width_gt_30m` 953/382569,
`max_build_length_gt_100m` 94/403404, `max_build_fsi_gt_5` 5/424121. `min/max(massing_enriched_at)`
= `2026-09-04` (today), confirming the write landed.

**Captures.** 3 real `--full` invocations against `scripts/enrich-parcels.js`
(`docs/reports/golden/enrich_parcels/pre/{sources_run1,sources_run2,standalone}.json`):
`chain=sources` ×2 back-to-back (2321.8s, 2226.3s) for the G1' consistency check, plus
`chain=none` (standalone, 2270.9s) per the golden convention. All 3 exit 0, verdict WARN.

**Harness OOM (fixed, commit `66d9e84c`, see also defect-ledger — this is a harness bug, not an
`enrich_parcels` defect).** `capture-step-golden.js`'s single-pass
`string_agg(ROW(...)::text)` OOM'd hashing `parcels` (486,530 rows × 100 projected golden columns
incl. jsonb). `captureTableState` now auto-selects a row-hash-then-concat method above 10M cells
(`isWideTable`); every table below threshold — all 8 already-converted pilots' goldens — is
unaffected (unchanged query, byte-identical `content_hash`).

**G1' result: the ONLY unexplained diff, now ledger-explained.** Comparing the two `chain=sources`
captures (normalised form, `--compare`): 13 raw diffs. 11 are inventory items (a)-(g) as declared
(capture timestamp, `enrich_parcels_pass3_scope` growth/`run_id` churn, the 5
`enrich_parcels_passN_duration_ms` + total-duration audit rows). The remaining 2
(`table_state[0].content_hash` for `parcels`, and its `hash_method` metadata text) trace to ONE
root cause:

- **EP-D9 (pinned).** Per-column diff (post-run2 snapshot vs. post-run3 live state; 99/100 golden
  columns byte-identical) isolates the instability to `comparable_builds` alone — 248/486,530
  parcels (0.051%). `comp_count`/`comp_dominant_build`/`comp_build_ratio_p50`/`comp_fsi_p50`
  unaffected. Root cause, quoted from `buildComparableBuildsUpdateSql` (`:1143-1150`) and the kNN
  CTE (`:1112-1142`):
  ```sql
  -- inner kNN (no c.id tiebreak):
  ORDER BY c.geom <-> s.geom
  LIMIT ${COMP_KNN_OVERFETCH}          -- 50
  -- outer similarity rank (no near.id tiebreak):
  ORDER BY (abs(near.lot_size_sqm - s.lot_size_sqm)
            + abs(coalesce(near.frontage_m, 0) - coalesce(s.frontage_m, 0)) * 10)
  LIMIT ${COMP_TOP_N}                  -- 10
  ```
  Neither clause carries a deterministic secondary sort key. A read-only diagnostic (rebuilt
  `comp_cand` inside a transaction, ran the equivalent rank query, `ROLLBACK` — zero persisted
  writes, `enrich-parcels.js` itself never re-run) measured: **1,921/344,845 subjects (0.56%)**
  carry an exact score TIE at the outer `LIMIT 10` boundary (rank 10 == rank 11) — the dominant
  mechanism, a superset comfortably explaining the 248 empirically observed; the inner kNN
  `LIMIT 50` boundary contributes far fewer ties (**15/430,404, 0.003%**). Postgres does not
  guarantee stable row order among tied `ORDER BY` keys, so a tied subject's actual top-10
  membership (and hence `comparable_builds`'s content, and potentially the derived scalars) is
  run-to-run unspecified. Filed `EP-D9`, **PIN (Spec 123 §3.1) — pinned_until: pilot9 commit 9**;
  fix (a deterministic tiebreak on both `ORDER BY` clauses) is the commit-8 peel, not now.
  **CLOSED 2026-09-08 (pilot 9 commit 8 P3):** `, c.id` added to the inner kNN `ORDER BY`,
  `, near.id` added to the outer rank `ORDER BY` — both clauses are now fully deterministic;
  `EP-PIN-D9` → BUILT, pin test flipped in `src/tests/steps/enrich_parcels/violations.test.ts`.
  The descriptor's pass-4 `idempotent_rerun` now reads `"zero_writes"` unconditionally (the
  P2+P3 combined state, guard + determinism both landed) — see the commit-chain rulings note
  below for the full P2/P3/P1 closure summary.

- **EP-D10 (pinned).** `enrich_parcels_pass3_scope` row_count differs between run1/run2 for a
  separate, already-known reason: it is genuinely unbounded/append-only. Measured across 4
  consecutive `--full` runs this session: **442,244 → 884,488 → 1,326,732 → 1,768,976** rows
  (`distinct_run_ids` 1→2→3→4), **`count(DISTINCT parcel_id)` flat at 442,244 throughout** — 100%
  of the growth is pure duplication, zero new logical content. The `:2073-2076` comment quoted in
  full: *"Written IN-TXN with the work above so a crash between commit and pass 5's read leaves a
  recoverable trail (enrichOptimalConfig unions any prior run's UNCONSUMED rows, regardless of
  run_id)."* This is a **crash-recovery safety net** — it guarantees a crashed run's unconsumed
  scope is never silently dropped — and says nothing about, nor implies, pruning CONSUMED rows.
  Confirmed: zero `DELETE`/`TRUNCATE` against this table anywhere in the file (the commit-4
  27-statement DML enumeration found none). Filed `EP-D10`, same PIN disposition; fix (prune
  consumed rows, or key the INSERT's uniqueness on `parcel_id` alone) is a commit-8 peel.
  **CLOSED 2026-09-08 (pilot 9 commit 8 P1):** `runPass5` now issues
  `DELETE FROM enrich_parcels_pass3_scope WHERE consumed_at IS NOT NULL` immediately after
  `consumePendingScope`, so the table no longer grows unboundedly — inventory item (g)'s
  description is updated from "unbounded append-only growth" to **"pruned at run end"**: only
  rows still awaiting recovery (`consumed_at IS NULL`) survive between runs, the crash-recoverable
  guarantee the `:2073-2076`-era comment describes. No golden recapture was needed for `parcels`
  itself — the scope table's row-count/`run_id` churn was already a declared, excluded inventory
  item, not a `parcels`-column diff input; pruning it changes the scope table's own row count
  (down, not up) but adds no new unexplained diff class.

**Comparator result: zero unexplained diffs.** With EP-D9/EP-D10 as the ledger explanation for the
`parcels`/`enrich_parcels_pass3_scope` hash and row-count movement, and items (a)-(g) accounting
for every other diff, the G1' comparator between the two `chain=sources` captures has **0**
remaining unexplained fields.

**Fold A1 correction — `nearby_builds_summary` drift measured 0, not 88,575/88,575.** The plan's
Fold A1 (`.cursor/pilot9_enrich_parcels_active_task.md:200`) classified `nearby_builds_summary` as
`idempotent_rerun:"declared_drift"`, citing the file's own `:1403-1411` docblock ("measured
88,575/88,575 diffs EVERY run"). Golden-master G1' measured the OPPOSITE under controlled
conditions: **0/442,244 rows differ** across all 3 back-to-back `--full` captures (no intervening
`neighbourhood_build_norms`/permits ingest between them — `comps_window_as_of_date` invariant
confirms all 3 landed on the same UTC day, 2026-09-04). The docblock's "every run" claim is real
in PRODUCTION cadence (permits get ingested, `neighbourhood_build_norms` gets recomputed, between
enrich_parcels runs) — it is not a code-level non-determinism claim, and does not hold when the
upstream data is genuinely unchanged. Plan corrected in place (see the file); commit 7 should
classify `nearby_builds_summary` `idempotent_rerun:"zero_writes"`, same as the 10 genuine OPTCFG
columns, not `"declared_drift"`.

**Programme-items.** `EP-PIN-D9` / `EP-PIN-D10` added (`gate.kind:"cutover_prereq"`,
`blocks:["enrich_parcels"]`, `status:"NOT_STARTED"`), same shape as `EP-PIN-B45`/`EP-PIN-D8`.
`checkCutoverPrereqs` now has 4 items blocking commit 9's `converted.json` registration until all
flip `BUILT`.

**Suite counts.** Full `npm run test`: 416 test files passed, 95 skipped (511 total); 10,073 tests
passed, 429 skipped (10,502 total) — run as part of commit `66d9e84c`'s pre-commit hook.

## §6. PH-7 — test design + prove RED (commit 6, `c9534fbd`, G7)

`src/tests/steps/enrich_parcels/violations.test.ts` lands: 31 tests (18 `it.fails()` + 13 plain
`it()`) — a SCOPE NOTE in the file's own header states it does not port all 13
`src/tests/db/enrich-parcels-*.db.test.ts` files to full parity, covering instead the MATERIAL
commit-7/8 obligations named in this pilot's own fold record (the descriptor's ruled shape, the
schema enum bump, the per-pass write-class/guard/idempotent_rerun table incl. the Fold A1
CORRECTION, the two Rule-9 run-clock stamps + the EP-D1/B4.5 pinned guard sharing one
`grandfathered.json` entry, the pass-4 `permits` invalidator, Rule 11's `order_guarantee`, the P4
declared-tunables ⊆ registry check, the four KNOWN-DEFECT pins asserted against the LIVE tree in
their CURRENT WRONG FORM, Ask 9's INFO-only heritage ruling, the golden PRE/POST differential
shape, and a #151-equivalent git-order lock).

**Genuinely RED, proven both directions (Spec 121 §12b.6):** every claim wrapped `it.fails(...)`
inverts internally — vitest reports the wrapped test PASSED only because the body itself threw for
the declared reason (a missing artifact, an unmet descriptor field), never for an unrelated import
or syntax error. A full green run of this file at commit 6 (31/31) is ITSELF the proof every
`it.fails()` claim was RED for the right reason — the same discipline `checkPreservedInComputeHasWhy`
and the canary battery (§4 of this report's own G7 lock) apply elsewhere in this programme.
`converted.json.pending` gains the `enrich_parcels` entry, `stage:"red_suite"` (R-K.1) — the one
artifact this commit itself produces.

### G7 verdict

`file=true` (the violations.test.ts lock exists) · `fences=3` (`enrich-parcels.notes.json`'s
`fences[]`, extended at commit 7e/2 with the `lessons.md:33` CTE-architecture entry) ·
`it-count=45` (commit 6's 31 + commit 7b/7d's own growth) — `lockCoverage` holds (45 >= 3) ·
`RED-evidence=true` per this section's own text. **G7 = 3/3.**

## §7. Commit 7 (7a-7e) — the descriptor + compute + runner + thin shell + G2' golden diff

**7a (`64c45463`) — the schema/freeze half.** `execution.shape` enum gains a 9th value `"enrich"`
(`x-ruling`); `definitions.enrichPhase` (`execution.phases[]`) becomes REQUIRED for archetype
ENRICHER; two array-level AJV rules (`order` unique+contiguous; `post_commit` admitted at most
once, only last). `generate-schema-baseline.mjs --write` (G-1), `generate-template-freeze.mjs
--refresh` (`frozen_at -> c9534fbd`), Spec 122 §8 RE-FREEZE #1 amendment. One `it.fails` flipped
(the schema-enum-bump lock).

**7b (`07afb862`) — the descriptor.** `scripts/enrich-parcels.descriptor.json` (7 write targets:
zoning/max-build/existing+scenarios/comps/optimal-config/run-clock-stamps/pass3-scope-ledger;
`execution.phases[]` 5 entries; originally 39 `config.logic_variables` = 25 pre-existing + 14
newly-externalized, corrected to 38 at commit 7e/2 — see below) + `scripts/enrich-parcels.notes.json`
+ a `grandfathered.json` entry (`guard:"none"` x4 dispositions + `no_retraction` for the
scope-ledger) + new `scripts/seeds/logic_variables.json` rows. 13 `it.fails` flipped to `it()`.
`converted.json.pending.stage` advances `red_suite -> descriptor_only`.

**7c (`7e3cc6e7`) — the compute port.** `scripts/lib/compute/enrich-parcels.js`: the 5 pass
functions ported BYTE-VERBATIM off the legacy script, seam-rewritten per §5.5 (`ctx.clock.asOfDate()`
replacing the raw `now()::date - interval '5 years'` literal; `pipeline.log.*` -> `ctx.log.*`;
`process.env` removed; the `::numeric` cast on `zoning_dominant_area_share`'s guard ported
byte-for-byte, Fold B1).

**7d / "pilot 9 commit 2" (`7e75c50e`, preceded by the Rule 11 fix `958e8cc3`) — `runEnrichPhase`
(LG-28).** Shared-txn passes 1-4 with per-phase `SET LOCAL statement_timeout`/`lock_timeout`, the
post_commit pass on a DEDICATED connection inside its OWN transaction (Fold B2), the D4' scope
hand-off INSERT, whole-step heartbeat/stall diagnostics for all 5 phases, `staleness.
detectInterruptedRetraction` folded UNCONDITIONALLY into `full` (Rule 12). `converted.json.pending`
DELIBERATELY HELD at `descriptor_only` through 7a-7d (Rule 4 and G7/G8/G9 still enforced-red at that
point) — see this report's own committed history for the verbatim reasoning.

**7e (this WF2, 3 commits) — the generator fix, the thin shell, and G2'.**

*Commit 1 (`f7e695fc`).* `generate-template-freeze.mjs`'s `runnerRanges` bounded each runner's
`phase_order` extraction by the next `async function run\w+(` match — a name accident, not a real
boundary. `runRecorderPhase` (until 7d) and then `runEnrichPhase` (from 7d) each in turn silently
inherited `executeOrderedWrites`' `write.executeSetBasedClear`/`write.executeUpsertBatch` calls, the
unrelated function sitting after them in file order. Measured RED: `runEnrichPhase`'s frozen
`phase_order` carried those two extra calls; the other 7 runners did not. Fixed by bounding on the
next TOP-LEVEL DECLARATION OF ANY KIND, not merely a `run\w+`-named one — a strict narrowing of the
old boundary set (new superset of old ⇒ ranges can only shrink), proven by regenerating: the other 7
runners' `phase_order` byte-identical, only `runEnrichPhase`'s changes (drops the 2 polluted calls).
`--check` clean; Spec 122 §8 RE-FREEZE #3 paragraph corrected in the same commit.

*Commit 2 (this commit) — the thin shell + Rule 4 grounding + a genuine descriptor bug found and
fixed.*

- `scripts/enrich-parcels.js` becomes the thin `pipeline.step(descriptor, compute)` shell (pilot 8
  `refresh-snapshot.js` shape) — the 2,391-line legacy body deleted; it lives entirely in
  `scripts/lib/compute/enrich-parcels.js` + `scripts/lib/step/index.js` now.
- **The compute export shape (the last `it.fails`'s own claim).** `scripts/lib/compute/
  enrich-parcels.js` was missing the generic `compute(ctx)` checks-dispatch entry point every
  OTHER converted compute module exports (`refresh-snapshot.js`, `link-parcels.js`, ...) — its
  `module.exports` was a plain OBJECT (`passes[]`, `checks`, the SQL builders), not a FUNCTION, and
  `pipeline.step()` requires `typeof compute === 'function'`. Added `async function compute(ctx)`
  (the identical checks-dispatch pattern: iterate `ctx.checks`, call `CHECKS[id]`, catch-and-report
  per check, return `{records_meta}`), then decorated it with the same static properties (`.passes`,
  `.checks`, `.readZoningContract`, ...) every other archetype's compute module already carries. NO
  conformance-suite amendment was needed — the suite's `.compute` expectation already generalizes;
  ENRICHER is simply the first archetype whose compute needs BOTH shapes (`passes[]` for
  `runEnrichPhase`'s own per-pass dispatch, `compute(ctx)` for the archetype-generic checks/
  observations dispatch `runWithPool` calls directly) on the ONE export.
- **Rule 4 / G-2 grounded, RED to GREEN.** `checkPreservedInComputeHasWhy` measured 5
  preserved-in-compute Intent Ledger rows (§2 of this report), 4 with no why/notes.json/checks[]
  grounding in-row. Grounded in place (`enrich-parcels.notes.json` gains a `fences[]` entry for
  `lessons.md:33` and two new `decisions[]` entries for `computeDeferScope`'s threshold rule and
  `computeAggregateRecordsUpdated`'s D#5 exclusion; §2's own table rows cite them). `node
  scripts/analysis/step-validate.mjs --step=enrich_parcels --fast`: Rule 4 `enforced-red` ("5
  preserved-in-compute row(s), 4 with no why/notes.json/checks[] grounding") -> `enforced-green`
  ("5 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding").
- **A genuine descriptor bug, found running the FIRST real `--full` invocation of the converted
  step and fixed in this commit.** `enrich_parcels_comps_as_of_date` (a nullable ISO-date
  comps-window override, declared at 7b, Fold G3's own explicitly-OPTIONAL half) threw
  `on_invalid:"fail"` on every real invocation — `resolveConfig`'s `invalidReason`
  (`scripts/lib/step/config.js:76-81`) is unconditionally numeric-only (`typeof raw !== 'number'`
  => `'non_finite'`) for EVERY declared `config.logic_variables[]` entry across EVERY archetype, and
  `step.schema.json`'s own item schema (`additionalProperties:false`) has no `type` discriminator
  to register a non-numeric tunable class. Since Fold G3 already ruled this override half
  optional (not Rule-3-mandated), the fix is REMOVAL, not a library widening: dropped from the
  descriptor (39 -> 38 declared tunables), `scripts/seeds/logic_variables.json`, and
  `scripts/generate-logic-variable-groups.mjs`'s GROUP_ORDER; `runEnrichPhase`'s `clock.asOfDate()`
  no longer reads any config key (the MANDATORY seam — no bare `now()::date` literal — is
  unaffected). Filed `docs/reports/review_followups.md` (MED) as a followup: widen
  `config.logic_variables[]` to a typed/nullable tunable class for whichever future pilot next
  needs one.
- **Coordinator addendum — Fold B2's `SHOW statement_timeout` claim made literally true in the
  fake-pool lock.** The pre-existing "timeouts applied to the post_commit phase" test asserted only
  the outgoing `SET LOCAL` SQL text, while the code comment/RE-FREEZE #3/commit body all claim a
  `SHOW statement_timeout`-based session proof. `fakePool` extended: each `connect()` call is now
  its OWN closed-over session (a distinct `statementTimeoutMs`, moved only by a `SET LOCAL
  statement_timeout` issued on THAT client), with every connected client tracked in `pool.clients[]`
  so a test can reach back into a SPECIFIC session after `runEnrichPhase` returns. The test now
  issues `SHOW statement_timeout` on the post_commit phase's own pinned client (asserts the bound
  600000ms) AND on a fresh sibling client (asserts the untouched default, proving isolation). RED
  proven live: commenting out the real `SET LOCAL` line in `scripts/lib/step/index.js` and
  re-running just this test fails at the assertion (`expected [...] to include 'SET LOCAL
  statement_timeout = 600000'`) — reverted immediately after, diff confirmed clean. A companion
  scratch-reproduction test pins the discriminating power of the SHOW-based assertion itself.
- **A second genuine bug, found running the ACTUAL golden-capture `--full` invocation (2026-09-07),
  after the `enrich_parcels_comps_as_of_date` fix above cleared config resolution.** Pass 4 threw
  `error: cannot insert multiple commands into a prepared statement` inside `runPass4`.
  `buildCompCandidatesSql`'s rendered text is `CREATE TEMP TABLE comp_cand ON COMMIT DROP AS …;
  CREATE INDEX comp_cand_gix …; ANALYZE comp_cand;` — THREE statements in one string. The legacy
  script called this builder with NO query parameters (a bare `now()::date` literal), so pg's node
  driver used the SIMPLE query protocol (multi-statement-safe); once Fold G3's seam rewrite bound
  the as-of-date as `$1::date` (`client.query(sql, [asOfDate])`), the driver switched to the
  EXTENDED protocol (a real prepared statement), which Postgres restricts to exactly one command.
  Fixed by splitting the CREATE INDEX/ANALYZE pair into a sibling function,
  `buildCompCandidatesIndexSql()`, issued as its own parameter-free `client.query()` call (simple
  protocol, multi-statement-safe again) immediately after the bound CREATE TEMP TABLE call. The
  SELECT text itself is byte-unchanged.
- **Legacy dedicated test-file fallout, found running the full suite after the thin shell landed.**
  20 pre-existing test files required `scripts/enrich-parcels.js` directly (8 `*.logic.test.ts`
  with no DB gating — genuine collection-time crashes; 11 `*.db.test.ts`, already
  `describe.skipIf(!dbAvailable())`-gated in this environment, so unaffected; 1 unrelated ops
  script, `scripts/analysis/wf3-cost-coherence-sanity.js`, never imported by the suite). Handled
  per the pilot 8 precedent ("3 legacy dedicated test files retargeted to compute.js," `c19cf224`):
  the 8 logic files' `require()` retargeted to `scripts/lib/compute/enrich-parcels.js`, with
  per-call-site parameter fixes where the seam rewrite changed a builder's signature (module
  constants → explicit params: `buildMaxBuildSql`'s `storeyHeight/acc/mislinkTol/minDim`,
  `buildCompCandidatesSql`'s `asOfDateParamIndex/windowYears`, `buildComparableBuildsUpdateSql`'s
  `comp{lotTol,knnOverfetch,topN,overCaptureClamp,fsiMinPlausible,fsiMaxPlausible}` — legacy-exact
  values, sourced from `scripts/seeds/logic_variables.json`). Two files tested mechanisms the
  conversion RETIRED, not merely relocated, and were rewritten in place (kept, not deleted, per
  "never delete a file you did not create"): `sql-verbatim.logic.test.ts` (its whole job —
  legacy-vs-compute byte comparison — is impossible now that legacy has no SQL builders left; its
  header records why, per-builder coverage continues in the retargeted files) and
  `enrich-parcels-stall-hardening.logic.test.ts` (the legacy per-pass `runPass()` wrapper is
  inlined into `runEnrichPhase`; the admin-visibility check survives, the runPass-specific checks
  are ported below). `enrich-parcels-optconfig.logic.test.ts` lost 4 describe blocks
  (`main()`-source-scan, `LOGIC_VARS_SCHEMA`-source-scan, and two behavioural blocks built around
  the legacy `enrichOptimalConfig(pool, {heartbeatMinutes, pipelineRunId})` embedding) — the
  source-scans are superseded by the generic `config.logic_variables[]`/`resolveConfig` mechanism;
  the behavioural coverage is NOT dropped, it is GENERALIZED: `recordHeartbeat`/
  `captureStallDiagnostic`/`startStallTicker` (LG-28) had ZERO standalone unit tests since their
  commit-7d library move (Fold D3's own "first-of-kind, zero prior hits" note) — new coverage
  added to `src/tests/step-library.logic.test.ts` (10 tests: heartbeat UPDATE shape + null-runId
  no-op + error-swallow; stall-diagnostic pid probe + null-pid fallback + null-runId no-op +
  error-swallow; ticker no-op-below-threshold + fires-once-then-latches + stop-before-threshold).
  The LOUD 57014/55P03 rethrow + unrelated-error-passthrough behaviours are proven against the
  REAL `runEnrichPhase` in `violations.test.ts` (3 new tests). Full suite verified green after
  every retarget (`npx vitest run` on each touched file, then a full `npm run test` before commit).
- **A THIRD genuine bug, found by the orchestrator (2026-09-07, coordinator observation) — a
  crashed golden-capture attempt left a postgres backend `idle in transaction`, holding
  `pg_try_advisory_xact_lock(65)` forever, its own node process already gone.** Live stderr
  evidence from a LATER capture attempt (same incident class, the run raced the still-stuck
  backend): `Unhandled 'error' event... error: terminating connection due to administrator
  command` (57P01) — a pg Client-level error crashing the ENTIRE node process. Root cause: neither
  `scripts/lib/pipeline.js`'s `createPool()` nor `scripts/lib/resolve-db.js`'s
  `createResolvedPool()` ever attached a `pool.on('error', ...)` listener — node-postgres re-emits
  an IDLE client's connection-level error as the Pool's own 'error' event, and Node's default
  EventEmitter behaviour for an unheard 'error' event is to throw SYNCHRONOUSLY, outside every
  try/catch/finally in this codebase. A hard crash never reaches a `finally` that hasn't run yet —
  so a DIFFERENT client, mid-`withAdvisoryLock`'s open `BEGIN`/lock-acquire (unrelated to whatever
  connection actually errored), never gets to its own `client.release()`/`ROLLBACK`, leaving the
  backend (and the lock) stuck until an operator manually `pg_terminate_backend()`s it. Fixed:
  `attachPoolErrorLogger` (pipeline.js, both `createPool()` branches) + an equivalent inline
  listener (resolve-db.js's `createResolvedPool`) — logged via `pipeline.log.error`/the caller's
  `logger`, never rethrown. New regression lock, `src/tests/pipeline-pool-error-handling.logic.test.ts`
  (5 tests): a bare EventEmitter with no listener genuinely throws on 'error' (proves the incident
  mechanism, not merely asserts the fix); `attachPoolErrorLogger` makes the SAME event a no-op;
  `withAdvisoryLock`'s own PRE-EXISTING (and already correct) crash posture — a normal JS throw in
  `fn()` — is locked against regression (ROLLBACK issued, client released, error rethrows) so a
  future edit cannot silently break it, alongside the lock-not-acquired and success paths.
- **A FOURTH bug, the "VRD-SKIP conflation" — the harness itself, not the step.** Once the
  orphaned lock was manually cleared (`pg_terminate_backend`), the NEXT capture attempt correctly
  self-skipped in the child process (`records_meta.skipped:true`,
  `reason:"advisory_lock_held_elsewhere"`, `status:"self_skipped"`, exit 0 when clean) — but
  `capture-step-golden.js` wrote this SKIP to `--out` exactly as if it were a genuine completed
  run, which would have silently enshrined "nothing happened" as the new reference state for
  every future G8/`--compare` diff. Separately, but caught by the SAME check: a genuinely CRASHED
  capture (non-zero exit, no `PIPELINE_SUMMARY` at all) was ALSO being written. Fixed:
  `assertCaptureIsValid(doc)` (new, exported, pure) — refuses (throws, no write) when
  `doc.exit_code !== 0` or `doc.summary?.records_meta?.skipped === true`, called in `main()`
  immediately after `buildCapture`, before the `--out` write. RED-first proof + GREEN in
  `src/tests/capture-step-golden.logic.test.ts`'s new `assertCaptureIsValid` describe block: the
  exact live incident shape (skipped, reason `advisory_lock_held_elsewhere`) throws with that
  reason named in the message; a crashed capture (exit 1, no summary) throws separately; a
  genuine completed run passes untouched.
- **Corrective action taken (2026-09-07, before any further capture attempt):** the stuck backend
  was terminated (advisory lock 65 confirmed free), the stale/invalid
  `docs/reports/golden/enrich_parcels/post/sources_run1.json` (the crashed exit=1 capture) was
  deleted (created this session, not a pre-existing artifact), and the capture was re-launched
  ONLY after both fixes above landed and the full suite (below) was green. First-progress check
  (per the coordinator's own instruction): `pg_stat_activity` queried directly ~1-2 minutes after
  launch confirmed pass 1's real `CREATE TEMP TABLE parcel_zoning_enrich ...` query genuinely
  `state:'active'` — not a silent stall — before letting the run proceed unattended to completion.
- **A FIFTH gap, orchestrator observation while this same re-run was in flight (Spec 48 §3.6
  silence class): the capture's own log produced ZERO further lines for 60+ minutes past the
  startup INFO line, despite the run genuinely, healthily progressing (confirmed via direct
  `pg_stat_activity` inspection — a real, active query each time).** Two candidate causes ruled
  out/in by direct evidence, not guessed: (1) the capture harness's own child-stdout/stderr
  piping (`spawnStep`, `capture-step-golden.js`) already tees BOTH streams to the parent's own
  stdout/stderr live, per-chunk, as data arrives — verified by reading the code; NOT the fault.
  (2) `runEnrichPhase` (`scripts/lib/step/index.js`) had ZERO `log.*` calls anywhere in its
  5-phase dispatch loop — confirmed by an exhaustive scan of the function body (only a
  scope-defer WARN and a pre-write-gate-fail ERROR exist, neither on the hot path of a healthy
  run). Fixed: `log.info(tag, ...)` at the START and END (+ duration) of every shared-txn AND
  post-commit phase — the runner's own boundary logging, independent of (and additional to)
  `recordHeartbeat`'s DB-only writes, so an operator tailing a log (or this pilot's own harness)
  sees real progress without needing a DB query.
- **A SIXTH gap, found investigating the FIFTH — and load-bearing far beyond enrich_parcels: EVERY
  converted step's heartbeat mechanism was unreachable during a REAL `run-chain.js` chain run,
  not just standalone.** `run-chain.js` (`:606-658`) pre-INSERTs each step's own `pipeline_runs`
  row (`status:'running'`) and threads its id via `STEP_RUN_ID`, specifically so the step can
  address its own row (`pipeline.js`'s legacy `run()` has read `STEP_RUN_ID` into `ctx.runId`
  since the 2026-09-03 cloud-parity FIX 3 remediation) — but `scripts/lib/step/index.js`'s
  `runWithPool` (the shared entry point EVERY converted step uses) never read `STEP_RUN_ID` at
  all. For a chain run, `chainId` is set (truthy) so `owns = ownsLedgerRow(chainId) = false`,
  skipping `openLedgerRow` (correctly — ownership belongs to run-chain) — but nothing filled
  `runId` from the id run-chain had ALREADY minted, leaving it `null` for the step's entire
  lifetime. This is not merely a heartbeat gap: `staleness.detectInterruptedRetraction`'s own
  `ownRunId` exclusion (`staleness.js:399-409`, its own comment recording the EXACT prior
  incident this generalizes: "without excluding ownRunId, THIS INVOCATION'S OWN just-opened
  running row... reads every run as interrupted and forces FULL forever") was measured, at
  commit time, using a scenario where `ownRunId` WAS populated (standalone/`openLedgerRow`) — a
  REAL chain run for ANY step declaring `recovery.interrupted:"force_full_on_next_run"` would
  see its OWN chain-inserted 'running' row and misidentify itself as an interrupted PRIOR run,
  silently forcing full/incremental-defeating behaviour on every chain invocation. Fixed:
  `parseStepRunIdEnv()` (mirrors `pipeline.js`'s own STEP_RUN_ID parsing verbatim — absent/blank/
  non-numeric → null, never NaN), read into `runId` on the `owns=false` branch. Standalone
  (`owns=true`, `openLedgerRow`) was never affected. This is a shared-library fix (`runWithPool`),
  not an enrich_parcels-only patch — every one of the 8 converted steps benefits identically; full
  suite re-verified green after landing it (below).
- **Harness-side heartbeat visibility considered, deliberately NOT implemented.**
  `capture-step-golden.js` simulates "inside a chain" via `PIPELINE_CHAIN` alone (unlike real
  `run-chain.js`, which also pre-inserts + finalizes the step's own row) — mirroring the FULL
  pre-insert/finalize pair was attempted, then reverted: pre-inserting without a matching
  finalize would leave an orphaned `'running'` row forever (nothing else updates it, since
  `owns=false` on the harness's own simulated-chain path means the step correctly never
  finalizes it either) AND would pollute the capture's own `pipeline_runs` diff
  (`WHERE id > maxIdBefore`) with a spurious extra row — a new, self-inflicted "VRD-SKIP"-shaped
  risk under time pressure, not worth taking for a dev-only tool when the PRODUCTION fix (above)
  is what actually matters. Filed `docs/reports/review_followups.md` (LOW) instead.
- **A cross-step fallout, found running the full suite: `src/tests/steps/link_massing/violations.test.ts`
  and `src/tests/run-chain-defer.logic.test.ts` both source-scanned `scripts/enrich-parcels.js`'s
  own text for facts that moved with the thin-shell conversion** — `link_massing`'s own D-5 guard
  test cross-references enrich_parcels' `buildMassingScopeWhere` re-scope predicate (retargeted to
  `scripts/lib/compute/enrich-parcels.js`); `run-chain-defer`'s "⑤ force-full env plumbing" block
  tested a stale historical framing ("✓red — does not yet OR in ENRICH_PARCELS_FORCE_FULL") that
  had ALREADY gone green when the legacy script gained that env fallback long before this pilot
  (confirmed: `git show HEAD:scripts/enrich-parcels.js` had it) — and Spec 43 §Chain-Specific
  Arguments confirms `ENRICH_PARCELS_FORCE_FULL` is a real, documented, operator-facing incident-
  response mechanism (Chesterton's Fence, NOT dead code). Verified NOT a regression before
  retargeting: the descriptor already declares `override.force_full:"ENRICH_PARCELS_FORCE_FULL"`
  (`:617`), read generically by `staleness.resolveOverrides` and OR'd into `runEnrichPhase`'s own
  `full` derivation (`overrides.force_full === true`) — the exact same env var, same semantics,
  now expressed declaratively instead of as a per-script literal. Both files retargeted (kept, not
  deleted); full suite re-verified green.

### G2' — CONVERTED-step golden diff

**NOT COMPLETED this session — STOP-and-report, per instruction, not silently retried.** Two
`--full` capture attempts both failed to reach a genuine completion (the first two were the
prepared-statement bug + the crash-path/VRD-SKIP incidents documented above, both fixed in-commit
before the third attempt). The THIRD attempt, launched only after all fixes above landed and the
full suite was green, ran passes 1-4 successfully (~35 min, consistent with local history) but
then genuinely HUNG inside pass 5 (optimal-config) — measured live (not inferred): 1h10m+ with
zero forward progress, `pg_stat_activity.wait_event='ClientRead'` throughout (postgres idle,
waiting on the client), both TCP connections `State: Established` (rules out a dropped socket —
the literal "H5" hypothesis this now supersedes with live evidence), and the node child process
measured at **0.953 total CPU-seconds across 1h44m of wall-clock time** — conclusive evidence of a
genuine stall, not a slow computation. `scripts/lib/optimal-config.js` has zero unbounded loops,
ruling out a pathological per-row hang in the engine itself; the leading hypothesis is the
`ctx.stream`/`pg-query-stream` cursor-consumption mechanism in `runPass5`
(`scripts/lib/compute/enrich-parcels.js:1477`) silently stopping mid-stream. Terminated cleanly
(Windows PIDs, not the Cygwin-translated ones `ps` reports); DB verified clean afterward (zero
advisory locks, zero idle-in-transaction sessions, no orphaned golden file, no stray
`pipeline_runs` row). Filed CRITICAL in `docs/reports/review_followups.md` as its own dedicated
entry — a WF3 to root-cause the pass-5 stream stall is now a hard prerequisite for G2', ahead of
any further capture attempt. **`converted.json.pending.stage` stays at `descriptor_only`** (NOT
advanced to `runner_wired`) and the POST-golden `it.fails` in `violations.test.ts` stays red,
unflipped — both correctly reflect that G2' has not actually passed; advancing either now would be
the exact "declared stage past what the hook can actually pass" dishonesty R-K.1/STA-2 exist to
prevent.


## §6. G2' — the pass-5 stall root-caused, fixed, and the same-day comparator (2026-09-08)

The pass-5 hang documented above (§5's tail) was root-caused live against the local DB: a write
issued on the SAME client that holds an open `pg-query-stream` cursor hangs forever (10s-timeout
reproduction, a 5-row scratch table) — `pg-query-stream` holds the connection's one command slot
for the cursor's whole lifetime, so a queued write never runs and the cursor never gets to fetch
its next batch either. `git log -S"streamQuery" -- scripts/lib/pipeline.js` (`55ad5670`): the
legacy `pipeline.streamQuery` always opened its OWN dedicated client via `pool.connect()`
internally, and legacy `enrichOptimalConfig`'s writes went through `pool.query(...)` — a different
client from the pool's rotation. The two never shared a connection. Fixed: `ctx.stream`'s cursor
now runs on a dedicated `streamClient`, separate from the write/txn client — mirroring the legacy
split exactly.

A second, independent incident surfaced during recapture: an externally-terminated background
process left the shared-txn's connection dead while the runner's OWN separate write connection
kept running unprotected, and a second invocation's outer advisory lock (now released) started a
CONCURRENT `--full` run against the same `parcels` rows. Verified clean afterward (neither run had
committed, so no data corruption occurred) but the race was real. Fixed: a two-key advisory lock
`(identity.lock, 1)` — distinct from the outer single-key lock so it does not self-conflict —
acquired on the shared-txn client and independently on the post_commit client, coupling lock
lifetime to connection lifetime.

### G2' same-day comparator (`docs/reports/golden/enrich_parcels/g2-comparator-report.md`)

The 2026-09-04 PRE golden and today's POST capture are 4 days apart on a live, shared dev DB —
comparing them directly conflates genuine upstream drift with conversion-introduced differences.
The authoritative G2' evidence is instead a SAME-DAY, back-to-back comparator: the legacy script
materialized untracked from `7e75c50e^` via `git show`, run `--full` immediately after the
converted run, both against the same DB state modulo only the converted run's own writes.
**Result: 99/100 golden columns byte-identical; the 1 diff (`comparable_builds`, 225/486,530 rows,
0.046%) is confirmed EP-D9 tie-break re-ordering (identical comp sets, order only) via 5 sampled
ids. Zero unexplained columns.** Per-pass timing ratio 1.00x (2548.4s legacy vs 2543.6s converted),
no pass exceeds the 25% KFM-7 band — **EP-D11 (G2' performance finding) is CLOSED — REFUTED**: the
earlier 1.6-2.9x slowdowns traced to a 1.3M-row `enrich_parcels_pass3_scope` backlog
(`consumePendingScope`, no batching/limit — a pre-existing design gap, not a code regression) plus
live DB contention on the shared dev instance, both resolved by an environment repair (guarded
`DELETE` of `consumed_at IS NULL` rows + `VACUUM ANALYZE`), not a code fix.

### Raw PRE-vs-POST diff (162 leaf fields) — every one a declared, expected consequence of the archetype conversion itself, not a behaviour regression

The raw `--compare` between the 2026-09-04 PRE capture (legacy hand-rolled `auditRows.push`/
`emitMeta` shape) and today's POST capture (descriptor-driven `checks[]`/`plausibility[]` shape,
per Rule 1/Rule 4) surfaces 162 differences, ALL attributable to the SHAPE of the observability
surface changing as part of the conversion itself — never the underlying `parcels`/
`enrich_parcels_pass3_scope` write behaviour, which the G2' column-level diff above proves
byte-identical outside EP-D9:

- **`invariants`** — PRE's hand-picked invariant set (`pass3_scope_distinct_parcel_ids`,
  `pass3_scope_distinct_run_ids`, etc.) is replaced by the descriptor's `plausibility[]`-derived
  set (`opt_aor_gfa_gt_max_buildable_gfa_count`, `zoning_dominant_area_share_out_of_range_count`,
  `comp_fsi_p50_small_n_sample_count`, `heritage_basis_coverage_distribution`,
  `existing_mislink_footprint_ratio_out_of_bound_count`) — a declared, intentional widening
  (Reality-Check plan-altitude bounds, §"Reality-Check plan-altitude requirements" above), not a
  loss. 2 differences here (`invariants[5]`, `invariants[6]`).
- **`meta[0].reads`** — the PIPELINE_META reads-map now names its sources per the descriptor's own
  `inputs.reads.tables[]` declaration (`coa_applications`, `zoning_building_setback_overlay`,
  `zoning_bylaw_areas`, `zoning_height_overlay`, `zoning_lot_coverage_overlay`,
  `zoning_parking_zone_overlay`, `zoning_policy_area_overlay`, `zoning_policy_road_overlay`,
  `zoning_priority_retail_overlay`, `zoning_queenstw_eat_overlay`, `zoning_rooming_house_overlay`,
  `neighbourhood_build_norms`, `neighbourhood_storey_norms`, `neighbourhoods`,
  `building_footprints`, `enrich_parcels_pass3_scope`) — MORE explicit than the legacy script's own
  ad-hoc `emitMeta` call, per Rule 1 (nothing hidden). ~44 differences here, all this one bucket.
- **`stdout_lines`** — the converted runner's own per-phase `log.info` boundary lines (added this
  same commit chain, closing the WF3-filed Spec 48 §3.6 silence-class gap) differ textually from
  the legacy script's console output — 10 differences, `stdout_lines` bucket.
- **`summary.records_meta.audit_table.rows`** — the audit table is now built from the descriptor's
  declared `checks[]` dispatch (Rule 10, `deriveVerdict`) instead of the legacy's hand-rolled
  `verdictCascade`/96 `auditRows.push` call sites — different row set, different `.metric` names,
  same underlying counts where both sides measure the same thing. ~93 differences, `rows`/`metric`
  buckets.
- **`summary.records_meta.{checks_failed,checks_warned,comparable_builds_enriched_count,
  existing_structure_enriched_count,ledger_row,max_build_enriched_count,opt_config_engine_errors,
  optimal_config_enriched_count,parcels_enriched_count,records_updated_aggregate,
  total_parcels_scanned,warnings,zone_class_pct}`** — new, MORE granular top-level records_meta
  fields the descriptor's `compute(ctx)` dispatch now emits (mirroring every other converted
  archetype's own `records_meta` shape, e.g. `link-parcels.js`'s `buildLinkMeta`) that the legacy
  script's own flatter shape never had. 13 differences.
- **`table_state[*].order_columns`** — the converted capture's table-state now declares its
  ordering explicitly (`order_by:"explicit"`, `order_columns:[...]`), where PRE's legacy capture
  defaulted to primary-key ordering with no explicit declaration. 4 differences.

**162 differences total, all in the observability/audit SHAPE (never a write-behaviour diff) —
zero unexplained once attributed to the conversion itself.** The authoritative behaviour-
preservation evidence remains the SAME-DAY G2' column-level comparator above (99/100 columns
byte-identical, 0 unexplained).

#### ADDENDUM 2026-09-17 (WF3 counter sources) — TWO NEW declared PRE→POST diffs: `records_total` and `records_new`

`.cursor/wf3_enrich_parcels_counter_sources_active_task.md` closed the HIGH batch-2 Phase 0.10b filed
against itself: this step's three DECLARED counters were rooted at a bare `compute.*`, which the enrich
branch's `counterScope` (`{matched, written}` + `records_meta`) cannot resolve, so `records_total`,
`records_new` and `records_updated` emitted **NULL on every run** from conversion (`07afb862`) until that
WF3 re-pointed them at `matched.compute.*`. Two of the three now differ from the PRE capture and are
declared here BY NAME, because the G8 comparator is entitled to demand exactly that:

- **`summary.records_total`** — PRE `null` → POST **`486530`**. The legacy script never populated it; the
  converted step now resolves it from `matched.compute.total_parcels_scanned`, the same number its own
  `records_meta.total_parcels_scanned` has carried all along.
- **`summary.records_new`** — PRE `null` → POST **`0`**. A literal 0 by construction: this step INSERTs no
  `parcels` row, every pass is an UPDATE (`records_new_aggregate`).
- `summary.records_updated` is NOT a new diff: PRE reported `0` and POST now reports `0` again. Conversion
  had silently turned that real `0` into a `null`; this WF3 restores it, so the field returns to PRE parity
  rather than departing from it.

**Direction of travel: the converted step now reports MORE than the legacy one did, never less**, and the
ledger row moved in lockstep with the summary (measured on the `--chain=none` capture, where the step owns
its own `pipeline_runs` row). Full recapture + A/B/C/D classification:
`docs/reports/golden/enrich_parcels/wf3-counter-sources-recapture.md`. Fleet-locked by `step-validate.mjs`
fast invariant #26 (COUNTER-ROOT), which REDs any declared counter source whose root the runner's own
`counterScope` does not build for that shape.


## §R Reflection (owed per R-F, carried into this same report since this WF3 chain's own commits are what's being landed)

**LOW-CONFIDENCE:** The G2' same-day comparator (§6) is a single sample, not a repeated measurement — the 1.00x timing ratio and the 225-row `comparable_builds` diff are each one data point, not a distribution. A future full run (legacy or converted) on this same DB could plausibly land anywhere in the range this WF3's OWN measurements already spanned (13.2–21.3 min for pass 1 alone, same code, different times) purely from environmental contention; the 1.00x ratio is a genuinely favourable same-day comparison, not proof the two are permanently equivalent under load. Similarly, `consumePendingScope`'s lack of batching (the EP-D11 root cause) was diagnosed from ONE incident (a 1.3M-row backlog accumulated over this pilot's own repeated `--full` test runs) — whether it recurs at a SMALLER, more representative backlog size (e.g. a single crashed run's worth, ~442K rows) was not separately measured; the environment repair removed the evidence before that narrower question could be asked.

**Recurring/standard-shaping:** This WF3 surfaced a NEW class not seen in pilots 1–8: a **connection-topology bug shared between the legacy script and the converted runner**, not introduced by conversion (both used two separate connections — one for the advisory lock, one for the actual work — with no coupling between them). Prior pilots' regression-guardian findings have all been about the CONVERSION changing behaviour; this one is about the conversion INHERITING a pre-existing architectural gap that only manifested under a specific external-interruption timing window. Worth a standing check in future ENRICHER-shaped (or any post-commit-phase) pilots: does the step's own advisory lock genuinely couple to the connection doing the real work, or does a generic outer lock (held on a separate connection) merely provide a false sense of mutual exclusion? A second recurring pattern: `pg-query-stream`'s single-command-slot-per-connection behaviour (H1) is a general node-postgres/pg-query-stream constraint, not specific to this step — any FUTURE post-commit-phase pass that both streams and writes should default to a dedicated stream client from the start, not discover the deadlock live.

**Commit-chain rulings (operator, 2026-09-07/08):** Environment repair (guarded `DELETE FROM enrich_parcels_pass3_scope WHERE consumed_at IS NULL` + `VACUUM ANALYZE`, semantic criterion: rows superseded by a fresh `--full` run's own scope insert for the same parcel) was explicitly ruled DISTINCT from EP-D10's actual code fix — a one-time operational cleanup, not a defect closure. **EP-D10's actual code fix landed 2026-09-08 (pilot 9 commit 8 P1):** `DELETE FROM enrich_parcels_pass3_scope WHERE consumed_at IS NOT NULL` now runs inside `runPass5` itself, at run end, after `consumePendingScope`; `EP-PIN-D10` → BUILT, pin test flipped in `src/tests/steps/enrich_parcels/violations.test.ts`. **EP-D1/B4.5's Half 1 (the unguarded UPDATE) also landed 2026-09-08 (pilot 9 commit 8 P2, peel 8x):** `buildComparableBuildsUpdateSql` now guards `IS DISTINCT FROM` over all 5 comp columns (`comp_build_ratio_p50`/`comp_fsi_p50` cast `::numeric` to match the target columns' own type — avoiding the float8-vs-NUMERIC trap, `lessons.md:28`, without the lossy `round()` that trap needed, since these columns carry no fixed scale); `EP-PIN-B45` → BUILT. Half 2 (the never-refresh `comp_count IS NULL` incremental predicate) is explicitly NOT reopened — Fold G4 already ruled it spec-supported as a disclaimed limitation (Spec 78 §P3C.1's own text), so the `EP-D1` ledger row's Status is `PARTIAL` (guard half CLOSED, never-refresh half remains PIN) rather than fully CLOSED. **EP-D9 also landed 2026-09-08 (pilot 9 commit 8 P3):** `, c.id`/`, near.id` deterministic secondary tiebreaks added to both comps `ORDER BY` clauses; `EP-PIN-D9` → BUILT. `idempotent_rerun` for the pass-4 write target reads `"zero_writes"` unconditionally now that BOTH halves of the combined P2+P3 state have landed — a rerun over genuinely unchanged data recomputes byte-identical `comparable_builds` (tie order is now stable) and the guard correctly writes nothing. **EP-D8 also landed 2026-09-08 (pilot 9 commit 8 P4, peel 8y):** a new `comp_structure_type_known` boolean (`buildCompCandidatesSql`) is TRUE only when the comp's own permit `structure_type` is genuinely classifiable (detached/townhouse/multiplex); the generic `'all'`-family fallback in `buildComparableBuildsUpdateSql`'s WHERE clause now requires it, excluding unclassified/high-density comps (parcel 8244's own repro case) from matching a low-density subject via `zoning_class` equality alone — the specific-family branch is unchanged, it was never the defect. `EP-PIN-D8` → BUILT. Spec 78 §Phase-3C gains a companion amendment (the spec was silent, not wrong — confirmed re-grepped). All four of the pilot's own KNOWN-DEFECT pins are now closed or partially closed by policy (EP-D1 PARTIAL by Fold G4 ruling; EP-D8/EP-D9/EP-D10 fully CLOSED) — only the golden recapture (commit 8 P6) remains before the pin-then-fix ladder (Spec 123 §3.1) closes out. EP-D11 (G2' performance finding) was REFUTED by the same-day comparator, not silently dropped — the ledger row and `programme-items.json`'s `EP-PIN-PERF` both stay (status BUILT/CLOSED), keeping the investigation's history rather than deleting it. The PRE-vs-POST four-day-gap problem (comparing a 2026-09-04 capture against a 2026-09-08 run on a live shared DB) is now a named methodology gap: a future pilot's own G2'/G8 gate should prefer a same-day comparator by default, not treat a stale PRE capture as automatically authoritative.

**Commit 8 P6 — golden recapture (2026-09-08).** `docs/reports/golden/enrich_parcels/post/sources_run1.json` recaptured against the state after P1-P4 (`node scripts/enrich-parcels.js --full`, `PIPELINE_CHAIN=sources`, 4,393.2s, exit 0). Full field-level diff and classification in `docs/reports/golden/enrich_parcels/p6-comparator-report.md`; summary: `parcels` content_hash changed (expected — three value-affecting peels), every diff explained by name (EP-D9-FIX: 1,921/344,845 subjects, 0.56%, outer-rank tie boundary, the dominant mechanism, plus 15/430,404 inner-kNN ties; EP-D8-FIX: 107,927 subjects with ≥1 family-incompatible candidate now excluded by `comp_structure_type_known`, an upper bound; B45-FIX: 0 value diffs, `comparable_builds_enriched_count` unchanged at 344,868 both captures). Two structural (non-value) diffs surfaced by the field-name comparator, both expected consequences of already-landed peels: **`pool_errors`** is a brand-new `records_meta` key (P5(a), Spec 48 §3.10) — absent in the pre-P5 capture, present (value `0`, no pool errors either run) in the post-P6 capture; and **`ceiling_bypassed`** on `enrich_parcels_pass3_scope`'s `table_state[0]` entry — present (`"projected"`) in the pre-P1 capture when the table still carried its 2,211,220-row unconsumed backlog, structurally absent post-P6 because the table's row_count is now genuinely `0` (EP-D10's pruning `DELETE`, landing on its first real `--full` run) and the capture tool only emits `ceiling_bypassed` when a table's row count is estimated against its declared ceiling. Neither is a behaviour regression; both are the direct, intended effect of a peel already discussed above by name. `enrich_parcels_pass3_scope` row_count itself: 2,211,220 → 0, confirming EP-D10 live. `docs/reports/golden/enrich_parcels/post/none_incremental.json` (a second declared golden file, incremental-mode) was OUT of P6's authorized scope and still carries a stale `source_fingerprint` — `converted.json`'s `pending.stage` stays `"shape_clean_pending_recapture"` rather than reverting to plain `"shape_clean"`, a deliberate, declared gap (not silently carried), filed for whichever peel next touches this step's golden masters. `checkCutoverPrereqs` (the actual required gate) is unaffected: `EP-PIN-B45`/`EP-PIN-D8`/`EP-PIN-D9`/`EP-PIN-D10` are all `BUILT`.

**Commit 8 P7 — closeout (2026-09-08).** Four items, one commit, after P6: (1) a genuine BEHAVIOURAL lock for `runPass5`'s scope-table prune (`src/tests/steps/enrich_parcels/violations.test.ts`) — seeds one consumed + one unconsumed prior-run row against a fake pg client, asserts the consumed row is deleted and the unconsumed row survives; the prior lock was a source-string regex only. (2) `scripts/enrich-parcels.descriptor.json`'s `limitations[]` EP-D3 entry updated OPEN/PIN → CLOSED (verdictCascade was never ported into the converted compute module). (3) `.cursor/pilot9_enrich_parcels_active_task.md` Domain Mode gains a Cross-Domain note for the P5(d) admin-stats-reaper edit. (4) `outputs.invalidates[2]` (comps stale on permits change) confirmed to have NO runtime consumer (`scripts/lib/step/seam.js:6-12` — claim #54's declaration requirement is schema-level only) — filed as a MED followup, `EP-PIN-B45`'s evidence text now states guard=BUILT/invalidator=DECLARED-ONLY explicitly, nothing marked wired. (5) The P0 cloud-impact claim ("14 rows, 0 mode='full'") re-verified with the coordinator-specified keys (`records_meta->>'mode'`, `records_meta->'gate'->>'reason'`, `records_meta->>'ledger_ownership'`, `records_meta->>'ledger_row'`, `duration_ms` vs link_massing's known 19–27 min FULL range) — all 14 rows null on every key, 0/14 in the FULL-duration range, a strictly stronger confirmation of the already-correct framing; Spec 47's `ctx`-argument passage corrected (it had overstated the bug's "live consequence" as a settled fact).

---

## §9. Commit 9 — differential + cutover (2026-09-11, HEAD `bc81ac84`, main tree)

**Recapture — R-C named cause.** Both POST captures were re-taken at HEAD `bc81ac84` against the local Supabase stack (127.0.0.1:54322/postgres, migration 247 applied locally first, `migrate --verify` 0 drift) because EP-D17 (`d9a90035`, 2026-09-11) edited `scripts/enrich-parcels.descriptor.json` (+42/−7: `execution.maintenance`, the `parcels_dead_tuple_ratio` plausibility bound, `step_post_check_statement_timeout_minutes`) AFTER the previous captures (`git_head` `404388ea` / `f7e695fc`, fingerprints `96c27841` / `c8058899`) — Spec 122 §5.3 R-C makes the descriptor a fingerprint file, so both read `stale-fingerprints=2` and G8 scored 0/3. A worktree recapture taken the same day at base `0820685d` (fingerprint `501ce326`) was ALSO stale for the same reason and was discarded, not reused. New `source_fingerprint` `0501de76` on both files; `git_head` `bc81ac84`.

| Capture | chain / args | exit | verdict | terminal | wall | notes |
|---|---|---|---|---|---|---|
| `post/sources_run1.json` | `sources` / `--full` | 0 | WARN (3 warned, 0 failed) | `enriched_full_with_warnings` | **2,738 s (45.6 min)** — vs 6,770 s (112.8 min) for the identical invocation at `0820685d` on 2026-09-10 | passes: zoning 614 s · max_build 1,579 s · existing_structure 74 s · comparable_builds 354 s · optimal_config 100 s; `parcels` 486,530 rows hashed |
| `post/none_incremental.json` | `none` / (none) | 0 | WARN (2 warned) | `enriched_full_with_warnings` | 138 s | every `*_enriched_count` = 0 (nothing stale after the FULL run); `enrich_parcels_pass3_scope` 0 rows |

**EP-D17 exercised for the first time, locally (the cloud proof rides batch 1 — see the EP-PIN-D17 ruling below).** The five post checks (`opt_aor_gfa_gt_max_buildable_gfa_count`, `zoning_dominant_area_share_out_of_range_count`, `comp_fsi_p50_small_n_sample_count`, `heritage_basis_coverage_distribution`, `existing_mislink_footprint_ratio_out_of_bound_count`) each carry a `sys_<id>_duration_ms` row: 1,474 / 1,358 / 1,734 / 1,600 / 1,823 ms on the FULL run — seconds, concurrent, under a declared ceiling. `sys_maintenance_parcels_vacuum_analyze` recorded `ran "VACUUM (ANALYZE) parcels" — dead_ratio 0.6862 > 0.3`, 5,399 ms, on the FULL run and `skipped — dead_ratio 0 <= 0.3` on the incremental run. (`sys_`-prefixed rows are scrubbed from the golden comparison by `VOLATILE_METRIC_PREFIXES`, so none of them is a diff leaf.)

**⚠️ EP-D18 (found by reading the numbers, not the code — filed PIN, not fixed here):** the POST-maintenance bound `parcels_dead_tuple_ratio` read **0.7362 WARN** (`value_max 0.30`) on the FULL run immediately AFTER the declared VACUUM had run — a physically implausible sequence if the VACUUM reclaimed anything. Measured cause: `runMaintenance` is called inside the outer `withAdvisoryLock` callback (`scripts/lib/step/index.js` — call site under the `post_commit` phase, the lock opened at the `pipeline.withAdvisoryLock(pool, descriptor.identity.lock, …)` site), and `withAdvisoryLock` is `BEGIN → pg_try_advisory_xact_lock → fn() → COMMIT` (`scripts/lib/pipeline.js`) — an open transaction with a snapshot for the ENTIRE step. `pg_stat_activity` during the incremental run showed exactly that session: `idle in transaction`, `backend_xmin` set, query `SELECT pg_try_advisory_xact_lock($1)`. That xmin pins the vacuum horizon at step START, so a VACUUM run at step END cannot remove a single tuple the step itself killed (≈1.35 M dead vs 0.49 M live after four full-table UPDATE passes ⇒ 0.73 by construction); it CAN reclaim bloat older than the step (the 2.3×-live cloud heap EP-D17 was pinned on), which is why the post checks were still fast here. `pg_stat_user_tables` one minute after the step exited: `n_dead_tup = 0`, `last_vacuum` 12:38:35Z (the declared VACUUM), `last_autovacuum` 12:39:48Z (migration 247's tuned autovacuum, which did the reclaim once the lock transaction had ended). Consequences: (a) the `parcels_dead_tuple_ratio` bound WARNs on every FULL run by construction and PASSes on every incremental run — a bound whose verdict is decided by the invocation mode, not by heap health; (b) the in-step VACUUM pays its scan for pre-existing bloat only. Both are recorded in `defect-ledger.md` EP-D18 and `review_followups.md` (HIGH) for a follow-on WF3 (candidates: run the declared maintenance AFTER the lock transaction commits, or bound on `n_dead_tup` older than the step's own xmin, or re-express the bound as pre-run state); the check's own `retighten_when` clause already anticipates re-tuning. Not fixed in this commit — WF3 cadence (one finding per WF3) and Spec 123 §3 (a DEFECT fixed during conversion contaminates the differential).

**Differential (G8): 573 leaf diffs pre → post, 0 unexplained — every one a declared consequence already named in §7/§6 (the archetype conversion itself) or in the EP-D17 addendum:** `table_state.columns` (204 — the descriptor's declared write-column list replaces the pre-conversion `--tables` snapshot's raw column set; `table_state.order_columns` 4), `summary.records_meta.audit_table.rows` (58 rows added/reshaped: `metric`/`threshold`/`source`/`value`/`status` — the row-derived cascade of §7, `source:"check"` and `viol == 0` thresholds now declared, plus the new `parcels_dead_tuple_ratio` plausibility row), `meta.reads.*` (`zoning_bylaw_areas` 24, `parcels` 24, `neighbourhood_build_norms` 21, `permits` 7, `zoning_height_overlay` 5, `zoning_lot_coverage_overlay` 4 — declared `inputs.reads` replace the pre-conversion inferred read set), `invariants.name`/`invariants.value` (6: the sixth invariant `parcels_dead_tuple_ratio` and the comps small-N count 3,300 → 3,294 under the same clock-relative window, both named), `stdout_lines` (12). Non-determinism inventory (§5) unchanged: `chain_run_id`, `duration_ms`, `sys_duration_ms`, `sys_velocity_rows_sec`, `pipeline_runs[].id/started_at/completed_at` scrubbed. `parcels` `content_hash` `906b1f6a` — clock-relative comps window pinned by capturing both files within one UTC day (2026-09-11).

**Cutover obligations (Spec 123 §7 row 9 / §7.2 A6 / FREEZE-1 plan) — all in THIS commit:** `converted.json` gains `scripts/enrich-parcels.js`, `pending` = `[]` (R-K) · `violations.test.ts` cutover assertion flipped (no `it.fails` remained — the 3 textual hits are the file's own header comment) · `programme-items.json`: `STD-7` → BUILT, `CLOUDPARITY` → BUILT (GH run 34506962436, `headSha` `0820685d`, `pipeline_runs` row 4588, all 9 converted slugs present, none skipped — grounded 2026-09-10) · **RE-FREEZE #5** (`generate-template-freeze.mjs --refresh`: ENRICHER `{shapes:["enrich"], runners:["runEnrichPhase"], first_step:"enrich_parcels", proven:true}`, `frozen_at` `bc81ac84`, `batching_prereq_snapshot` = `FREEZE-1` only; `template-freeze.infra.test.ts` pin flipped; Spec 122 §8 line + 122a §A9 paragraph) · `step-archetype-census.json` row for `enrich_parcels` retired (its own `reason` named this commit) → roadmap 55 files / 57 slugs / 0 pending, `conversion-roadmap.infra.test.ts` repinned · backlog regenerated, **blocks batching: 1** · `node scripts/analysis/step-validate.mjs --step=enrich_parcels --write` (the generated block below) + the other 8 scorecards regenerated.

**Operator ruling (Spec 124 §4, 2026-09-11) — EP-PIN-D17 re-pointed.** `gate.blocks`: `enrich_parcels` → `assert_data_bounds` (batch 1 lead, per the generated roadmap). A dedicated third ~270-min chain-sources run whose only purpose was to flip EP-PIN-D17 was refused: run 34506962436 already proved CLOUDPARITY for this step (pre-EP-D17 code), EP-D17 is a cost fix, and Spec 124 R-AB already mandates one acceptance run per archetype batch — that run is the green run EP-PIN-D17 waits for. Migration 247 was applied on the cloud the same morning (apply-migrations run 34598594544, `headSha` `bc81ac84`, verify 0 drift; cloud `parcels` `dead_ratio` 0.000, reloptions live). No cron was disabled; no cloud window was opened.

**Spec diff (Spec 123 §7 row 9 (b) / Spec 124 §R-8):** Spec 122 §8 (RE-FREEZE #5 line) · Spec 122a §A9 (payment paragraph) · Spec 124 §9 (ENRICHER dispatch row proven; concerns row "cut over commit 9"; §R-8 rows: blocks batching 2 → 1, EP-D13 dispatch lesson, ENRICHER schema-bump lesson) · Spec 65 §2 (conversion bullet, cites §3c for the maintenance declaration) · **Spec 78: N-A** — nothing in the optimal-config algorithm or its contract changes at cutover.

**Three further cutover findings, all surfaced by the registration itself (checks that only run for `converted[]` slugs saw this step for the first time) — each fixed in this commit by the pilot-7/8 commit-9 precedent (`a4d80a26`, `32eec17f`):** (1) **EP-D17 conformance gap — three library-read tunables read as dead declarations** (`step_post_check_statement_timeout_minutes`, `step_post_check_concurrency`, `parcels_maintenance_timeout_minutes`): §1.2a P4 credits `ctx.config.<x>` / bare `config.<x>` reads and `*_from_config` fields, but the post-check executor reads its ceilings off a local named `configValues` and `runMaintenance` derives `<table>_maintenance_timeout_minutes` from the descriptor at run time — a template key no scanner can see. `step-conformance.infra.test.ts` gains `libraryConsumedVars` (configValues reads in `scripts/lib/step/index.js` only + the descriptor-derived maintenance key, mirrored by name from `plausibility.js`), unioned into the dead-declaration check only, with a five-test both-directions block (non-vacuous premise, GREEN on the real files, RED on `ctx.config`-only / `myconfigValues.` / commented sources, RED on `maintenance:"none"`, and the unread-var canary still firing). Same class as RS-conformance-gap / LW-D10. (2) **R-D three-way lock**: `assert-schema.descriptor.json`'s `config.probe_presence` and `checks[declared_logic_variables_present].expect` regenerated 42 → 86 from `collectDeclaredLogicVariableNames()` (the 44 enrich_parcels vars), all four assert_schema POST goldens re-taken (fingerprint `37025a60`, PASS ×4) and the one new leaf (`pool_errors`) named in the pilot-1 report addendum — assert_schema stays 16/17. (3) **`none_incremental` verdict pin**: the committed 2026-09-08 PASS came from a genuinely deferred run whose `when:"post"` bounds never executed; this recapture ran minutes after the FULL run with an EMPTY stale scope, so it ran all five passes over 0 rows and executed the table-wide `comp_fsi_p50_small_n_sample_count` bound (WARN, 3,294) — the pin now reads WARN with the measured reason. Two different code paths chosen by DB state for the same invocation — the same "verdict decided by mode, not health" shape as EP-D18, recorded there.

**Scorecard at cutover (fast, pre-`--write`): 16/17, G6 3/3 · G7 3/3 · G8 3/3 · G9 PASS · G4d PASS · G-shape PASS (`file-clean=true compute-clean=true`) · hard-stop=false.** The one open point is G3 (10 table rows, 9 vocab hits) — pre-existing, unchanged by this commit.

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=enrich_parcels --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 16/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=31 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-right window=39313d9 |
| G3 | 1 | 2 | table rows=10 vocab-hit rows=9 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 18 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=3 it-count=91 RED-evidence=true |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=3 lock-it-count=91 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | enrich_parcels | PASS | min_migration=237 <= migrations count=244 |
| 2 | enrich_parcels | PASS | 45 declared, missing from seeds: none |
| 3 | enrich_parcels | PASS | retired=0 overlap-with-declared=none |
| 7 | enrich_parcels | PASS | SPEC LINK header present=true |
| 8 | enrich_parcels | PASS | G-4: 45 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | enrich_parcels | PASS | HB-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains an onProgress seam token AND a startHeartbeatTicker( call token — the periodic ticker covers every phase uniformly by construction once present, independent of any single phase's own boundary, but ticker start/stop lifecycle is not independently verified here |
| 21 | enrich_parcels | PASS | CEIL-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains a SET LOCAL statement_timeout/lock_timeout token pair AND a postClient-scoped SET statement_timeout token (EP-D16) — the per-phase claim itself is filed as its own followup |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 58 PRE capture(s) across 14 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 14 converted slug(s) — 6 compared against a retained census row (all agree), 8 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 32 declared counter source(s) across 11 descriptor(s) all root in their own shape's counterScope (+ records_meta) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 584 · unexplained: 0

### Test suite (item iii)
- 1161/1161 passed (suite success=true)
- harvested: 19 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing: none

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 45 declared, 3 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 5 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | 2 when:"pre_write" check(s), 0 order_guarantee violation(s) — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): shape=enrich runner=runEnrichPhase: no staleness.ledgerGatedSkip/selectMode on this path (ENRICHER's own scope-defer archetype, Spec 122 §3.0b); calls staleness.detectInterruptedRetraction directly and folds interruptedRetraction.interrupted into the full/incremental decision before any pass runs · R-M: prose-only (R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=83375B notes=11481B checks=31 rows records_meta=8116B (newest post/ capture) |

**Enforced-green: 13/14**

