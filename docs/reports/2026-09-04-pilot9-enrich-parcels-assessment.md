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
| `7e130bff` (fix folded into the pass 1 SQL; `tasks/lessons.md:28` documents it) | 2026-05-31 | The float8-vs-`NUMERIC(5,4)` `IS DISTINCT FROM` idempotency trap: `zoning_dominant_area_share` computed as `MAX(area_share)` (float8) never compared equal to the target's `NUMERIC(5,4)`, so every multi-zone parcel rewrote forever | ✓ current file `:336` `round(MAX(area_share)::numeric, 4)`, byte-identical cast | **preserved-in-compute** — Fold B1 rules this ports VERBATIM; the guard SQL is never regenerated generically from a column list, this exact cast is the fix | `:334-338` current file, `git blame` = `7e130bff` (**corrected this commit — `1da014c60`, previously cited, only added tests + the lessons.md:28 prose the same day; it never touched `scripts/enrich-parcels.js`, confirmed via `git show --stat`**); `1da014c60` remains the correct cite for the lesson's own documentation |
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
