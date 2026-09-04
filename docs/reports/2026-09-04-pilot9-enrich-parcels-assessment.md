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
| `1da014c60` (`tasks/lessons.md:28`'s own fence) | 2026-05-31 | The float8-vs-`NUMERIC(5,4)` `IS DISTINCT FROM` idempotency trap: `zoning_dominant_area_share` computed as `MAX(area_share)` (float8) never compared equal to the target's `NUMERIC(5,4)`, so every multi-zone parcel rewrote forever | ✓ current file `:336` `round(MAX(area_share)::numeric, 4)`, byte-identical cast | **preserved-in-compute** — Fold B1 rules this ports VERBATIM; the guard SQL is never regenerated generically from a column list, this exact cast is the fix | `:336` current file; re-blamed `1da014c60` this commit |
| `7e130bff` | 2026-05-31 | **Origin of the whole zoning-pass architecture** — the set-based join CTE rewrite replacing per-parcel correlated `EXISTS` subqueries (`tasks/lessons.md:33`'s own fence: >9min intractable → ~8min with `CREATE TEMP TABLE … AS` + `LEFT JOIN`) | ✓ current file, `enrichParcels`'s whole temp-table/UPDATE shape (`:222-443`) is this commit's architecture, unbroken since | **preserved-in-compute** — the set-based join CTE pattern is load-bearing (a correctness AND performance fence) and ports verbatim; this is pass 1's entire SQL shape | full-file read; re-blamed this commit |
| `df7ef272` | 2026-07-02 | **Origin of the comp-family filter Fold C2/EP-D8 measures the boundary of** — `comp_fsi_p50` restricted to new-build comps (`work_type='new_build'`) with `permit_fsi ∈ [0.05, 8]`, plus the comps-ineligibility reset | ✓ current file, `buildCompCandidatesSql` filter (`:1088-1098`) and the `resetIneligible` UPDATE (`:1208-1213`) both trace to this commit's shape | **preserved-in-compute** — the work_type/FSI-range filter and the reset-on-ineligibility pattern are both verbatim-ported. **This fence is the boundary of what the comp-match predicate DOES filter on** — it never added a `structure_family` term, which is exactly EP-D8's gap (Fold C2/G4): the fence explains why EP-D8 is a genuine spec-silent hole, not an oversight of an existing rule | `:1088-1098,1208-1213` current file; re-blamed `df7ef272` this commit |
| `e8793c8f` | 2026-08-14 | **Origin of the scope-defer mechanism** — `computeDeferScope`, `enrich_parcels_pass3_scope` (mig 240), `enrich_parcels_defer_threshold_rows` — the only LOGGED recovery ledger in the estate (389 lines added, largest single-commit diff to this file) | ✓ current file, `computeDeferScope` `:1777-1847`, the `INSERT INTO enrich_parcels_pass3_scope … ON CONFLICT DO NOTHING` `:2077-2078`, `DEFER_STEP_SLUG` `:91` | **SPLIT disposition** — the SQL/logic is **preserved-in-compute** (verbatim port); the crash-recoverable ledger CONCEPT (rows left inside the txn by design, `:2073-2076`) is **encoded-as-descriptor-field** at commit 7 (`recovery.interrupted` for the pass-3/pass-5 resets per Fold A2, and the pass3_scope table itself named in `outputs.writes[]`) — this is the mechanism Fold A3 says has "no analogue in any converted step" | `:1777-1847,2077-2078,91` current file; re-blamed `e8793c8f` this commit |
| `a81c6a7c` | 2026-08-16 | **Origin of the honest `records_updated` aggregate** — `computeAggregateRecordsUpdated`, deliberately EXCLUDING pass 4 (comps) from the distinct-union of pass 1/2/3/5 ids | ✓ current file `:1834-1842`, byte-identical shape (`zoningIds, maxBuildIds, existingIds, scenarioIds, optConfigGenuineIds` — no comps ids param at all) | **preserved-in-compute** — this is a §11 counter-scoping decision (Rule 3-B8 lineage) that must survive conversion verbatim; the docblock `:1820-1829` states the exclusion is deliberate, not an omission | `:1834-1842` current file; re-blamed `a81c6a7c` this commit |
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
zero transcribed from the plan. `1da014c60` (lessons.md:28's own numeric-cast fence), `e8793c8f`
(scope-defer origin), `a81c6a7c` (honest records_updated origin), `df7ef272` (comp-family filter
boundary — the fence that makes EP-D8 provably a gap, not a regression), `7e130bff` (the whole
zoning-pass architecture), `fa9e984c2` (the Supavisor SET LOCAL constraint governing Ask 7), and the
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

**Producers this step reads from (live, verified this commit):**

| Producer | Read site (this file) | Producer confirmation |
|---|---|---|
| `link_massing` (**already converted**, `converted.json`) | `parcel_buildings`, `building_footprints` (emitMeta reads-map, `:1148-1149`; used at pass 2's heritage freeze + pass 3's existing-structure primary-massing join) | `scripts/link-massing.js:8` header: "Link parcels to building footprints and write the parcel_buildings junction"; `scripts/lib/compute/link-massing.js` writes `parcel_buildings`/reads `building_footprints`, re-confirmed this commit |
| `permits` (chain-level table, not yet a converted step's own write target) | `:1112`, pass 4 candidate-set materialization | table exists, written by `load-permits.js` / classification scripts upstream of this step in the `sources`/`permits` chains |
| `neighbourhood_build_norms` / `neighbourhood_storey_norms` / `neighbourhoods` | pass 2 (LATERAL) + pass 5 citywide backstop (`:1650` throws if absent) | written by `compute-build-norms.js` (permits chain), not yet a converted step |

**Only ONE live seam against an already-converted step exists today (`link_massing` via
`parcel_buildings`/`building_footprints`)** — unlike pilot 8's 3 new seams (`link_parcels`/
`link_massing`/`link_wsib`, tripling R-V's surface), this pilot adds exactly 1, because none of
this step's other upstream producers (`load-permits.js`, `compute-build-norms.js`) are converted
yet. `parcels.centroid_lat/lng` (from `compute_centroids`, converted) and `permit_parcels`
(from `link_parcels`, converted) are **NOT** read anywhere in this file — confirmed by direct read,
not assumed; no seam there.

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
argv/env: 1 `--full` flag, both spellings on one line, matches manifest declaration. Producer seams:
1 live edge against an already-converted step (`link_massing`), smaller than pilot 8's 3 because
this step's other producers are not yet converted — declared honestly rather than inflated.

---
