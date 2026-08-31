# Pilot 8 Assessment — `refresh_snapshot` (RECORDER, forced single-member)

**Status:** Commit 1 (PH-0 boundary freeze, G0) landed. §0's seed re-confirmed against the same repo
this commit (same day, later session); no drift in any DATA/file number re-executed. One genuine new
finding this commit: the system-map generator itself was silently truncating multi-file Target Files
bullet lines to their FIRST reference, which is the actual root cause of Finding 3 ("no owner row for
`refresh-snapshot.js`") — the file was already declared in Spec 60's own Target Files section the whole
time; the generator just never reached past the first `scripts/...` match per line.

**Governing plan:** `.cursor/active_task.md` (Pilot 8 — refresh_snapshot, RECORDER, forced single member;
the authorized, Implementation-status copy — `.cursor/pilot8_refresh_snapshot_active_task.md` is a
superseded Planning-status duplicate, not re-read for content this commit, mirroring pilot 7's own
precedent for the identical duplicate-file shape).
**Governing specs (owner row first, per Spec 123 §6 G0):** `docs/specs/01-pipeline/60_shared_steps.md`
(owning spec, §Step Registry row 8 + §3 "Refresh Snapshot" prose, `:22`, `:194-219`) ·
`docs/specs/01-pipeline/122_pipeline_step_optimization.md` (architecture/write-class taxonomy, GAP-2) ·
`docs/specs/01-pipeline/123_step_opt_assessment_validation.md` (procedure/gates) ·
`docs/specs/01-pipeline/124_step_standard_policy.md` (13 rules + register — governs on conflict with
older Spec 122 prose).

---

## §1. PH-0 — boundary freeze (commit 1, G0)

> Re-executed 2026-08-31 (same day as §0's own Fold-A-validated planning seed, later session): `wc -l`
> = 687 (unchanged), `.query(` sites = 20 (unchanged), `ADVISORY_LOCK_ID = 40` unique repo-wide
> (unchanged), `grep -c "IS DISTINCT FROM"` = 0 (unchanged), `converted.json.converted.length` = 7
> (unchanged). No drift found in any DATA number this commit re-touched.

### G0 deliverable 1 — system-map row (Finding 3), root cause corrected, not merely patched

Direct inspection of `docs/specs/01-pipeline/60_shared_steps.md`'s own `### Target Files` section
(§4, Operating Boundaries) shows `scripts/refresh-snapshot.js` was **already listed** — it has been
since before this pilot. Finding 3's own framing ("no owner row exists, add one") was therefore wrong
about the mechanism, though right about the symptom (the generated table's row 60 really did omit the
file). Root-caused instead of patched: `scripts/generate-system-map.mjs`'s per-line file-reference
scan used `line.match(/pattern/)` with no `/g` flag — `String.prototype.match` without the global flag
returns only the FIRST match in the string, so a Target Files bullet listing several
`scripts/x.js`/`src/y.ts` references on one comma-separated line (Spec 60's own 3-per-line convention)
silently dropped every reference after the first. Row 60 showed exactly 3 files
(`geocode-permits.js`, `link-massing.js`, `create-pre-permits.js` — the first file named on each of
the section's 3 bullet lines) with no `+N more` suffix, which is the exact signature of this bug, not
of a missing declaration. Fixed (`scripts/generate-system-map.mjs`, `matchAll`/`/g` + de-duped
`implFiles`/`testFiles`) and regenerated (`npm run system-map` → `node scripts/generate-system-map.mjs`,
96 specs across 6 sections). Row 60 now reads `scripts/geocode-permits.js, scripts/link-parcels.js,
scripts/link-neighbourhoods.js, +5 more` — `refresh-snapshot.js` is among the 8 Target Files, confirmed
present in the raw regenerated output. Blast radius: 20 rows across the whole map changed (all
Implementation/Tests columns gaining previously-truncated-away references), zero rows lost content —
the generator is explicitly "auto-generated... do not edit manually" (`00_system_map.md:3`), so a
full, correct regeneration is the intended behaviour, not a diff requiring line-by-line review.

### G0 deliverable 2 — Spec 60 doc-rot corrected (Finding 2, folded into commit 1 per pilot 7's own
precedent for the identical finding-shape — no dedicated ledger row for a docs-only correction)

Re-executed this commit, not carried from §0: `grep -in "score\|weighted" scripts/refresh-snapshot.js`
returns 7 hits, all of them the CoA servable-funnel's own `score`/`opportunity_score` fields (`s4_score`,
`coaFunnel.score`, the `servable_coa_funnel_score` audit row) — none is a weighted-average "Data
Effectiveness Score." `grep -c` on the 5 real dedicated test files: `refresh-snapshot.infra.test.ts`=3,
`refresh-snapshot-query-consolidation.logic.test.ts`=6, `db/refresh-snapshot-consolidation.db.test.ts`=4,
`quality.logic.test.ts`=3, `coa-cost-model.regression.test.ts`=3, `quality.infra.test.ts`=**0** — the
zero-hit file matches Finding 2's claim exactly. All 4 corrections landed directly in
`docs/specs/01-pipeline/60_shared_steps.md`: (1) the "9+ parallel counting queries" line and its
Step-Registry-table echo ("9 tables (parallel counts)") both corrected to the real sequential
single-connection shape (WF3 F1, `8cc99c78`); (2) the non-existent "Data Effectiveness Score (0-100)
weighted average" line replaced with the real per-table coverage-rate description; (3) "Massing query
fails → defaults to 0" corrected to the real two-tier carry-forward-via-`getPrevSnapshot()` behaviour;
(4) the Testing line's 2 named files (one of which, `quality.infra.test.ts`, has zero hits on this
script) replaced with the real 5-file, 19-assertion list.

### G4 — risk class

**Chance = CLASS B. Impact = HIGH.** (Full reasoning below.)

**Chance** = 34 commits (small-mid corpus, re-confirmed) + 44% fix density (15/34, re-confirmed) — lower
fix density than pilot 7 (56.25%) — + 0 measured load-bearing fences this session (no `git log -p -S`
fence excavation was needed: this pilot's write is additive/no-op-by-declaration, not a repair of a
past incident) → **CLASS B**, one notch lighter than pilot 7's B/C. **Impact** = **HIGH** — widest
chain-membership of any pilot to date (4 of 4 chains: permits/coa/sources/deep_scrapes, Spec 122 `:512`)
and the sole write target for the admin `data_quality_snapshots` dashboard (Spec 26, `GET /api/quality`
`SELECT *` full-column read, confirmed §0 Cross-spec consumer contracts).

### G0 verdict

**CLOSED this commit.** Every §0 DATA/file number reconfirmed with zero drift. One genuine new finding
(the system-map generator's single-match bug) root-caused and fixed rather than worked around — Finding
3's own "add a row" framing is corrected here: no new declaration was needed, the generator was silently
dropping an existing one. Spec 60's 4 doc-rot items (Finding 2) corrected in place. No new DEFECT opened
against `refresh-snapshot.js` itself this commit; Findings 4/5 (phase ternary, carry-forward
inconsistency) proceed to PH-3/PH-6 classification as already scoped.

---

## §2. PH-3 — Intent Ledger over the corpus (commit 2, G3)

> **15 `fix(` commits (of 34 total, `git log --follow`), all adjudicated** — re-executed via direct `git
> show <sha> -- scripts/refresh-snapshot.js` this commit, not transcribed from the plan's own findings
> list. Per Spec 124 §4.2's discoverer≠adjudicator split, every disposition below is PROPOSED by this
> pass (agent, 2026-08-31), stands until a human operator ratifies or overturns at commit 7. Closed
> disposition vocabulary only (Rule 13): `preserved-in-runner | preserved-in-validator |
> preserved-in-compute | encoded-as-descriptor-field | encoded-as-deviation | knowingly-retired`.
> `INCIDENTAL` never appears as a disposition.

| Commit | Date | Construct | Live today? | Proposed disposition | Ground |
|---|---|---|---|---|---|
| `8287291e` | 2026-03-06 | Raw `console.log('PIPELINE_SUMMARY:'+JSON.stringify(...))` completion line | Superseded — 0 `console.*` today, replaced by structured `pipeline.emitSummary` | **knowingly-retired** — the literal console-log form is gone; the underlying CONCEPT (a structured completion summary) survives as `pipeline.emitSummary`/commit-7's `checks`+`counters` | `grep -c console\.` current file = 0, re-confirmed commit 1 |
| `e4765619` | 2026-03-07 | §11 counter-scoping fix: `records_total: total_permits` (237K+, a foreign entity's own scan-pool size) → `records_total: 1` (the snapshot row itself) | ✓ current file `:645`, byte-identical (`records_total: 1`) | **preserved-in-compute** — this is the exact counter-scoping correction the Before/After guarantees table's `records_total=1, records_new/records_updated xor` invariant (INV-2) encodes; genuinely load-bearing, verbatim-ported | `:645` current file; grounded in `checks[]` (`snapshots_updated`) |
| `64374bb2` | 2026-03-11 | Empty `catch {}` on massing/schema-column-count queries → `pipeline.log.warn(...)` | ✓ current file `:342-346,359-363`, the log.warn survives (later layered with carry-forward by `fd14dc53` below) | **preserved-in-compute** — the catch-and-log shape is verbatim; `fd14dc53` adds carry-forward ON TOP, doesn't replace this fix | `:342-346` current file; grounded in `checks[].why` (massing carry-forward, notes.json read_this_way) |
| `6c75bf83` | 2026-03-15 (09:54) | Adds `permit_inspections` coverage query to the snapshot | ✓ current file `:378-409`, byte-identical query shape (5-column FILTER aggregate) | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | `:378-409` current file; grounded in `checks[]` (inspections feed no dedicated check but the row itself is why-cited in compute.js) |
| `ba88a5fa` | 2026-03-15 (18:15) | First chain-aware phase ternary: `chainId === 'coa' ? 6 : 5` (2-way; `deep_scrapes` and `permits` share the `5` default from this commit's very first version) | Superseded 11 days later by `5baaed5a`'s 3-way ternary (below) | **knowingly-retired** — the specific `?6:5` mapping does not survive; the "chain-aware phase via `PIPELINE_CHAIN`" PATTERN this commit pioneered does, through its own successor | direct diff this commit |
| **`5baaed5a`** | **2026-03-26** | **THE origin of Finding 4/`RS-D1`.** Widens the ternary to 3-way: `chainId === 'sources' ? 13 : chainId === 'coa' ? 7 : 14` — adds a `sources` branch but leaves `deep_scrapes` folded into the SAME default branch as `permits` (the commit's own subject line, "audit_table gaps... and phase numbering," never names `deep_scrapes` as a distinct case) | ✓ the 3-way SHAPE survives to today, `:643` (`chainId === 'sources' ? 13 : chainId === 'coa' ? 7 : 18` — default later bumped 14→18 as the permits chain grew, `df8371a9` and siblings, not re-audited line-by-line this commit) | **SPLIT disposition**: the chain-aware-phase MECHANISM is **encoded-as-descriptor-field** (`sharing.varies_by_chain.phase`, commit 7) — a real, useful pattern. The MISSING `deep_scrapes` branch is the open DEFECT, `RS-D1` (opened formally below): `deep_scrapes` existed in `manifest.json` since `5c953a61` (2026-03-11), 15 days BEFORE this commit ever ran, and was never given its own branch by this commit or any successor. Corrected (not merely preserved) at commit 7 with a declared per-chain map | direct diff this commit; `git log -p -S "deep_scrapes" -- scripts/manifest.json` for the pre-existence date |
| `31c18da0` | 2026-03-31 | Guards `neighbourhood_count/active_permits` division by zero (`active_permits > 0 ? ... : '0.0'`) | ✓ current file `:297`, byte-identical | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | `:297` current file; a pure JS guard, grounded in compute.js's own inline comment (no separate checks[].why owed) |
| **`fd14dc53`** | **2026-04-01 (17:42)** | **THE origin of Finding 5's own declared policy.** 5 sub-fixes in one commit: (a) all queries onto one pinned `REPEATABLE READ READ ONLY` client (the WF3-F1-era single-connection shape, later hardened further by `8cc99c78`); (b) `xmax::text::int = 0` replacing bare `xmax = 0` (PG-version-safe insert/update detection); (c) **`getPrevSnapshot()` carry-forward-on-failure for massing/schema/SLA/inspections, replacing a bare zero default** — the file's own `:320-322` design comment ("instead of defaulting to 0, which would destroy dashboard trend lines") originates HERE; (d) explicit `::jsonb` casts on 3 params; (e) `neighbourhood_id != -1` tombstone exclusion | ✓ ALL FIVE survive to today: (a) `:200-201` (now further consolidated by `8cc99c78`); (b) `:593` (`xmax::text::int = 0`); (c) `:322-332` (`getPrevSnapshot`), consumed by massing/schema/SLA/inspections (`:344,361,374,401`) — **and NOT consumed by `costEst`/`coaFunnel`, Finding 5's own live inconsistency**; (d) `:533` (`$34::jsonb` etc.); (e) `:80` (`neighbourhood_id != -1`) | **preserved-in-compute** — all five sub-parts verbatim; (c) is also this pilot's own Ask-1-adjudicated FIX target (Finding 5 / `RS-D2`, below) — the policy this commit established is what `costEst`/`coaFunnel` (added over a year later, `c42ff97f`/`4442fb75`) fail to follow | `:200-201,322-332,344,361,374,401,533,593` current file; grounded in checks[].why (optional_query_failed) + notes.json's own decisions[] entry |
| `2471706f` | 2026-04-01 (17:50) | Corrects an `::jsonb` cast's position in the parameterized VALUES list (a follow-on to `fd14dc53`'s own same-day jsonb-cast fix, 8 minutes later) | ✓ current file `:533`, byte-identical to the corrected positions | **preserved-in-compute** — verbatim-ported | `:533` current file; part of the same guarded_upsert write checks[].why covers |
| `b71774ab` | 2026-04-02 | Two bugs: (1, DIFFERENT FILE — `run-chain.js` gate-skip, not this file); (2) `refresh-snapshot.js`: hoists query-result `let` declarations to outer scope so `pipeline.withTransaction`'s callback can read them (were `const` inside the now-removed `try{}` block, throwing `ReferenceError`) | ✓ current file `:204-205` (`let permitsScalarRes, tradesRes, ... let coaRes, tagBreakdownRes, syncRes;`), same hoisting shape | **preserved-in-compute** — the outer-scope hoisting pattern is a JS-scoping necessity that survives verbatim into the ported compute function | `:204-205` current file; a JS-scoping necessity, grounded in compute.js's own header comment (no checks[].why owed, not a check-observable behavior) |
| `038dda08` | 2026-04-16 (10:07) | Adds `// SPEC LINK:` header comments (Bundle C sweep, 10 scripts) | ✓ current file `:2-4` (Specs 41/42/43) | **encoded-as-descriptor-field** — becomes `identity.spec` at commit 7; the header-comment FORM retires with the whole `pipeline.run(...)`-shaped file at cutover | `:2-4` current file |
| `3c3e6f84` | 2026-04-16 (21:24) | Advisory lock retrofit: `ADVISORY_LOCK_ID = 40` + `pipeline.withAdvisoryLock` wrap (Bundle G Wave 5, "maintenance scripts") | ✓ current file `:19,187`, byte-identical, confirmed unique repo-wide (commit 1) | **encoded-as-descriptor-field** — `40` becomes `identity.lock` at commit 7 (Spec 47 §A.5 registry, "Maintenance" wave — matches this commit's own subject); the manual wrap retires with `pipeline.run`, same as every prior pilot's advisory-lock disposition | `:19,187` current file |
| `67711003` | 2026-04-17 | `parseInt`/`parseFloat` → `safeParsePositiveInt`/`safeParseFloat` (B1 safe-math migration, "top 5 scripts") | ✓ current file, all call sites via the `safe-math` import (`:10`) | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | `:10` current file; grounded in compute.js's own require line, checks[] (all 10 checks depend on safe-math parsing) |
| `94abd192` | 2026-05-23 | `parcelsRes.exact_matches` FILTER widened to roll up BOTH legacy `exact_address` AND new `address_points_exact` match types (F17 preservation, mirrors a parallel `metrics.ts` fix) | ✓ current file `:246-259`, byte-identical including the inline "WF1 #parcel-address-bridge" comment | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | `:246-259` current file; grounded in checks[].why is N/A (a read-query predicate, not a check) — cited in compute.js's own inline comment instead |
| `8cc99c78` | 2026-08-15 | **THE central architecture of the file's read section.** WF3 F1 (Spec 118 §1/§7.1): replaces the 9-parallel-query battery (the 3min→64min I/O pathology) with the 3-part consolidated shape (`buildPermitsScalarQuery`/`buildTagBreakdownQuery`/`buildTradeByTypeQuery` under `enable_indexscan=off`) | ✓ current file `:74-158,229-234`, byte-identical; the 3 builder functions are ALREADY `module.exports`-ed (`:683-686`) — pre-shaped for a direct compute-file port | **preserved-in-compute** — the 3 query-builder functions move to `scripts/lib/compute/refresh-snapshot.js` with no logic change, only the module boundary; this is the step's own most consequential correctness fix and its adopted shape is a hard contract for the golden-master differential (G2′) | `:74-158,229-234,683-686` current file; grounded in compute.js's own header comment + notes.json's review_notes |

**Approver for every disposition above:** this pilot's PH-3 pass (agent, 2026-08-31), grounded in direct
`git show`/`git log -p` re-verification this commit — per Spec 124 §4.2's discoverer≠adjudicator split,
PROPOSED here, stands until a human operator ratifies or overturns at commit 7.

### `RS-D1` — the phase-ternary defect (opened this commit; Finding 4)

**Classification (Spec 123 §3, the four questions):** (1) Observed? Yes — `chainId === 'sources' ? 13 :
chainId === 'coa' ? 7 : 18` (`:642-643`) gives `deep_scrapes` the identical phase number (18) as
`permits`, with no branch of its own. (2) Spec/invariant conflict? Yes, against Rule 1 ("nothing
hidden") — a magic shared literal where a declared, distinct value is cheap and correct; not against any
functional contract (no admin surface currently reads `audit_table.phase` to distinguish chains, per
Finding 4's own consumer-impact check: only 2 structural/shape test files reference it). (3) Load-bearing?
No — the CURRENT collision is not relied upon by anything; nothing regresses by giving `deep_scrapes` its
own number. (4) Cost of carrying vs. diverging: near-zero cost to fix (a declared per-chain map instead
of a ternary), real (if small) benefit to observability. **Status: OPEN, closes at commit 7** with a
declared `sharing.varies_by_chain.phase` map (`{permits:18, coa:7, sources:13, deep_scrapes:<own number>}`),
per Spec 124 §7 ladder rung (e) — a same-mechanism, low-risk correction, in-scope for the conversion
commit itself (not deferred).

### `RS-D2` — the costEst/coaFunnel carry-forward-policy gap (opened this commit; Finding 5)

**Classification:** (1) Observed? Yes — `costEst` (`:421-443`) and `coaFunnel` (`:450-494`) both catch a
query failure, log a warning, and leave the pre-declared zero/null default in place, with no
`getPrevSnapshot()` call, unlike the 4 other optional blocks. (2) Spec/invariant conflict? Yes, against
the file's OWN declared policy (`:320-322`, originating at `fd14dc53` above): "carry forward previous
snapshot values instead of defaulting to 0 (which would destroy dashboard trend lines)." (3) Load-bearing?
No — nothing depends on a zero-on-failure default for these two blocks; the carry-forward policy is
strictly more correct for the file's own stated purpose (dashboard trend continuity) and is what every
sibling optional block already does. (4) Cost of carrying vs. diverging: the two exempted blocks are the
two MOST RECENTLY ADDED (`c42ff97f`/`4442fb75`), so this is very likely an oversight (the policy
comment already existed when they were written), not a deliberate exception with an undocumented reason —
no `why` comment justifies the divergence anywhere in the file. **Operator ruling (Ask 1, pre-commit):
FIX** — route both blocks' catch paths through `getPrevSnapshot()`, mirroring the other four, as a
declared change with a red-first lock (commit 6) plus a new declared WARN check making an optional-query
failure visible in the audit row (nothing-hidden — today a failure is only a log line, invisible to
`records_meta`). **Status: OPEN, closes at commit 8** (peel — gating/thresholds/checks), per Spec 124 §7
ladder rung (e), same class as `link_parcels`'s `LP-D9` precedent (a real, low-risk, same-mechanism fix
made inline at conversion rather than pinned-and-deferred).

---

## §3. PH-5 — Seam map (commit 3, G5)

> Every place `scripts/refresh-snapshot.js` (687 lines) touches something outside pure computation — DB,
> clock, network, argv/env — re-derived by direct read this commit, not copied from the plan's
> preliminary G5 row. Mirrors the plan's own 16-row DML disposition table (§ Write-discipline
> declaration) but organized by SEAM KIND rather than by statement, per Spec 122 §5.4.

### DB seam

- `pool` — supplied by `pipeline.run('refresh-snapshot', runRefreshSnapshot)` (`:678`), never a local
  `new Pool()`.
- `pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)` (`:187`, closes `:668`) wraps the ENTIRE body —
  lock 40, confirmed unique repo-wide (commit 1).
- **20 `.query(` call sites** (re-confirmed commit 1, byte-identical to the plan's own count), by kind:
  - **2 session-scope statements**: `SET enable_indexscan = off` / `RESET enable_indexscan` (`:229,233`,
    WF3 F1 ③, `try/finally`-guarded) — SURVIVES verbatim, the only session-scoped GUC pair in the file
    (every prior LINK/MATCHER/BACKFILL pilot measured 0 on this axis; this is the first to measure 2, both
    contract).
  - **2 transaction-boundary statements**: `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY` /
    `COMMIT` (`:201,278`) on the pinned `snapClient` — SURVIVES verbatim (WF3 F1 point-in-time-consistency
    guarantee).
  - **8 sequential reads on the pinned client** (`permitsScalarRes`, `tradesRes`, `tradeByTypeRes`,
    `buildersRes`, `parcelsRes`, `coaRes`, `tagBreakdownRes`, `syncRes`, `:211-276`) — SURVIVES, 3 of the 8
    are the WF3-F1-consolidated builder functions (`buildPermitsScalarQuery`/`buildTagBreakdownQuery`/
    `buildTradeByTypeQuery`) already exported and ready for a direct compute-file port (`8cc99c78`'s own G3
    disposition, §2 above).
  - **1 prior-snapshot read** (`getPrevSnapshot`, `:326-328`, outside any transaction) — SURVIVES, the
    carry-forward source for 4 (soon 6, per `RS-D2`) optional blocks.
  - **6 optional standalone reads** (massing `:337-339`, schema columns `:351-356`, SLA `:368-369`,
    inspections `:381-388`, cost estimates `:423-430`, CoA funnel `:455-475`) — SURVIVES, each independently
    caught; the last 2 are `RS-D2`'s own subject (catch-path fix, not the read itself).
  - **1 write statement**: the `INSERT ... ON CONFLICT (snapshot_date) DO UPDATE ... RETURNING (xmax::text::
    int = 0)` (`:503-535`), inside `pipeline.withTransaction` (`:502-636`) — THE write target, class
    `guarded_upsert` per GAP-2 (Finding 1).
- **1 `pipeline.withTransaction` wrap** (`:502-636`) — the pre-commit footgun hook's "2 withTransaction
  calls" line for this file is a TEXT-MATCH artifact (it also counts the comment at `:283`, "declared in
  outer scope so `pipeline.withTransaction` can access them"), not a second real transaction — confirmed
  by direct `grep -n "withTransaction("` (one call site, `:502`).

### Clock seam

- `Date.now()` — **2 sites** (`:188` `t0`, `:638` `duration_ms = Date.now() - t0`), both elapsed-time-only,
  never written to the DB as a timestamp — legal per `tasks/lessons.md`'s explicit carve-out.
- **0 `new Date(`** anywhere.
- **0 DB-clock reads** (`pipeline.getDbTimestamp(pool)`) — this step writes no `RUN_AT`-stamped column;
  `created_at=NOW()` in the UPSERT's `DO UPDATE SET` clause (`:592`) is a server-side `NOW()` literal, not a
  bound app-side timestamp — R3.5 governs app-side `new Date()`/timestamp binding, not a server-side SQL
  `NOW()` literal inside a generated statement; no violation.

### Network seam

- **0 `fetch(` calls** — no external network dependency, same as every converted `sources`/`permits`-chain
  step so far.

### argv/env seam

- **1 `process.env` read**: `PIPELINE_CHAIN` (`:642`), feeding the phase ternary — `RS-D1`'s own subject
  (§2 above). Retires at commit 7, replaced by `sharing.varies_by_chain.phase`'s declared per-chain map
  (the same generic mechanism `link_parcels`'s `LP-D3`/A-5 ruling and `compute_centroids`'s own precedent
  already use).
- **0 `process.argv` reads** — matches `manifest.json:56`'s `supports_full:false`/`supports_dry_run:false`;
  confirmed live (`grep` for `full`/`FORCE_FULL` in the file → 0 hits outside comments, re-confirmed this
  commit).

### The 3 new live seam declarations (Finding 8 / R-V)

`inputs.reads.steps[]` at commit 7 declares 3 producer→consumer edges against the 7 already-converted steps
(`converted.json`), each re-verified this commit by reading both the read site and the producer's own
write/header:

| Producer | Read site (this file) | Producer confirmation |
|---|---|---|
| `link_parcels` | `parcelsRes`, `:252-259` (`permit_parcels.match_type`, `.confidence`) | `link_parcels` is `permit_parcels`'s writer (pilot 7, keyed upsert), re-confirmed `converted.json` line 39 |
| `link_massing` | massing try-block, `:337-339` (`parcel_buildings`, `COUNT(DISTINCT parcel_id)`) | `scripts/link-massing.js:8` header comment: "write the parcel_buildings junction", re-read this commit |
| `link_wsib` | `buildersRes`, `:236-245` (`entities.is_wsib_registered`) | `scripts/link-wsib.js:10` header comment names `entities.is_wsib_registered` as its write, re-read this commit |

This triples R-V's live seam-validation surface (1 pre-existing pair, `compute_centroids → link_massing` →
4 pairs total) — the plan's own stated purpose for this pilot's seam declaration (§0.7).
`building_footprints` is also read (same massing try-block) but its producer (`massing`, an INGESTOR step)
is not yet converted — no live seam there. `parcels.centroid_lat/lng` and `parcel_address_points` are NOT
read anywhere in this file (re-confirmed by direct read, not assumed) — `compute_centroids` and
`link_parcel_addresses` do not create seams here.

### Seam-map verdict (G5)

**CLOSED this commit.** No PARTIAL seams remain. DB: 20 query sites fully characterized by kind (2
session-scope GUC, 2 txn-boundary, 8 pinned-client reads, 1 prior-snapshot read, 6 optional reads, 1
write), 1 real transaction wrap (the footgun hook's "2" is a text-match artifact on a comment, not a
second transaction). Clock: 2 elapsed-only `Date.now()` sites, 0 DB-clock reads (no app-side timestamp is
ever written; `created_at=NOW()` is a server-side literal inside the generated SQL, not an R3.5 subject).
Network: absent. argv/env: 1 `PIPELINE_CHAIN` read, retiring into the declared `phase` map at commit 7
(`RS-D1`). 3 new live producer→consumer seams declared (`link_parcels`/`link_massing`/`link_wsib`),
tripling R-V's live surface. No seam tension flagged (unlike pilot 7's Fold C item 9) — every read this
step performs today is a read THE FIX (Finding 5's `costEst`/`coaFunnel` catch-path change) leaves
unchanged; no eligibility-gate or query-predicate rewrite is in scope for this pilot.

---

## §4. PH-6 — Classification (commit 4, G6)

> Every Finding from the plan's §0.6 list + `RS-D1`/`RS-D2` (opened commit 2) + all 16 enumerated DML
> statements (write-discipline table, plan §), classified per Spec 123 §3's three-way split: **CONTRACT**
> (a downstream consumer depends on it, even if ugly) / **INCIDENTAL** (nothing observes it — do not
> assert on it) / **DEFECT** (a spec or invariant asserts the opposite). `INCIDENTAL` is a legitimate G6
> value distinct from the G3 Intent Ledger's closed disposition vocabulary, which bans it.

### Findings

| Finding | Ledger ID | Classification | Ground |
|---|---|---|---|
| 1 — write class `snapshot_append` wrong at the source | *(no `RS-D*` — PIN, the schema's own `gaps.GAP-2` already prescribes the fix; not this step's defect, the label was)* | **DEFECT in the DECLARATION, not the behavior** — the write itself is, and always has been, the correct `guarded_upsert` mechanic; only the taxonomy label was wrong | Finding 1, §0.4; GAP-2 verbatim match confirmed Fold A |
| 2 — 4 Spec 60 doc-rot items | *(no `RS-D*` — docs-only, fixed commit 1)* | **DEFECT in the DESCRIPTION, not the behavior** — all 4 corrected in place commit 1 | §1 above |
| 3 — missing system-map row | *(no `RS-D*` — root-caused as a generator bug, fixed commit 1)* | **DEFECT in TOOLING** (the generator), not in this step's own declaration surface — the file was already correctly declared in Spec 60's Target Files | §1 above |
| 4 — phase-ternary `deep_scrapes`/`permits` collision | **`RS-D1`** | **DEFECT (Rule 1, nothing hidden)** — low blast radius (2 structural test files only), but a real undeclared magic-shared-literal | opened commit 2 |
| 5 — `costEst`/`coaFunnel` carry-forward inconsistency | **`RS-D2`** | **DEFECT** — violates the file's own declared policy (`:320-322`, origin `fd14dc53`); operator-ruled FIX (Ask 1) | opened commit 2 |
| 6 — `compute_cost_estimates` cross-step write into `data_quality_snapshots` | *(no `RS-D*` — not this step's defect, filed against the OTHER step)* | **CONTRACT-adjacent, foreign** — `compute_cost_estimates`'s own best-effort UPDATE is a no-op on the first daily run by construction (chain-position ordering); this step's own 68-column write list correctly excludes those 2 columns and `emitMeta` correctly doesn't claim them | §0.6 Finding 6; measured live (4/10 recent rows NULL on both columns) |
| 7 — `metrics.ts`/`route.ts` dual-path (Refresh-Now button) | *(no `RS-D*` — Cross-Domain, out of Backend/Pipeline Operating Boundary)* | **DEFECT, but not this pilot's to classify or fix** — filed `review_followups.md` HIGH per Ask 3's disposition | §0.6 Finding 7; dashboard-race risk text, Fold A addendum |
| 8 — 3 new live seams (`link_parcels`/`link_massing`/`link_wsib`) | *(no `RS-D*` — a declaration opportunity, not a defect)* | **CONTRACT** — 3 genuine producer→consumer edges, declared commit 3 (§3 above) | §3 above |

### The 16 enumerated DML statements

| # | Statement | Classification | Ground |
|---|---|---|---|
| 1 | `BEGIN`/`COMMIT` (REPEATABLE READ READ ONLY) | **CONTRACT** — WF3 F1 point-in-time consistency guarantee | `:201,278` |
| 2 | `SET`/`RESET enable_indexscan` | **CONTRACT** — WF3 F1 ③, defeats the stale-correlation-statistic pathology | `:229,233` |
| 3–8 | 6 sequential SELECTs on the pinned client (8 result sets, some multi-column) | **CONTRACT** — the WF3 F1 consolidated battery, this step's own most consequential correctness fix | `:211-276` |
| 9 | `getPrevSnapshot()` prior-snapshot SELECT | **CONTRACT** — carry-forward source for 4 (soon 6) optional blocks | `:326-328` |
| 10–13 | 4 optional reads (massing/schema/SLA/inspections) | **CONTRACT** — each independently caught, carry-forward already correct | `:337-409` |
| 14–15 | 2 optional reads (costEst/coaFunnel) | **CONTRACT for the read; the CATCH PATH is `RS-D2`, a DEFECT** | `:423-475` |
| 16 | `INSERT ... ON CONFLICT (snapshot_date) DO UPDATE ...` | **CONTRACT** — the write target, `guarded_upsert` per GAP-2 | `:503-626` |

Zero statements classified INCIDENTAL — every one of the 16 either serves a declared purpose a downstream
consumer or the file's own design comment depends on, or (statements 14–15's catch path) is `RS-D2`'s own
open DEFECT. This is consistent with the plan's own framing: RECORDER's job is to record everything it
reads, so there is no "unobserved" query in a step whose entire purpose is observation.

### G6 verdict

**CLOSED this commit.** 2 DEFECTs opened and ledgered (`RS-D1`, `RS-D2`), both with a declared closing
commit (7 and 8 respectively). 3 findings resolved as tooling/doc-only fixes already landed (commit 1). 2
findings correctly classified CONTRACT-adjacent-but-foreign (Finding 6) or out-of-scope Cross-Domain
(Finding 7) — neither actioned by this plan, both already filed to their correct paper trail. 1 finding
(8) is a CONTRACT declaration opportunity, not a defect, already landed (commit 3). No PH-6 candidate
required a Reality-Check sample: unlike `link_parcels`'s spatial-join fix (a data-transformation with a
measurable flip population), `RS-D1`/`RS-D2` are both control-flow corrections (a literal map, a
catch-path redirect) with no analogous "which rows changed" population to sample — their correctness is
provable structurally (the golden-master differential, G2′, commit 7) rather than statistically.

---

## §5a. PH-7 — test design, prove RED (commit 6, G7)

`src/tests/steps/refresh_snapshot/violations.test.ts` landed with every claim testable against a
future artifact wrapped `it.fails()` — 17 such call sites, none of the descriptor/compute/library
artifacts existed yet at commit 6. A fully green run of the file AT COMMIT 6 was itself the proof
every wrapped claim was genuinely RED: `it.fails()` inverts, so a claim that was NOT actually RED
would have surfaced as "expected test to fail but it passed," a real suite failure — none did.
Commit 7 then flipped each `it.fails()` to plain `it()` as its own artifact landed (R-K.1's own
per-claim mechanism), which this same report's §6 and Fold sections narrate. `converted.json.pending`
gained the `refresh_snapshot` entry at `stage:"red_suite"` in the SAME commit 6 — the one artifact
that commit itself produced — later advancing to `stage:"shape_clean"` at commit 7 once the
descriptor existed and `check-step-shape.mjs` confirmed the frozen shape was genuinely clean.

---

## §5. Golden master capture (commit 5, G1′)

> Ran `scripts/refresh-snapshot.js` for real (live mode) **5× sequentially** via
> `scripts/analysis/capture-step-golden.js` against `127.0.0.1:54322/postgres` (`resolve-db` target
> confirmed before every invocation) — 4 chain-scoped invocations (`--chain=permits`, `--chain=coa`,
> `--chain=sources`, `--chain=deep_scrapes`, per Spec 122 `:512`'s "every chain it appears in — up to 4")
> **plus one standalone** (`--chain=none`), matching pilot 4's own 4-chains-were-2-plus-standalone
> precedent widened to this step's 4 real chains. No descriptor exists yet — `--tables=
> data_quality_snapshots` (the `--tables=` fallback path, `resolveTables()` `source:"arg"`) since the
> descriptor-driven table derivation has nothing to read.

### Live results

| Invocation | Exit | Duration | Terminal | `records_new`/`records_updated` | Row count after |
|---|---|---|---|---|---|
| `--chain=permits` | 0 | 34.1s | PASS, `snapshots_created:1` | 1 / 0 (day's row did not exist yet) | 30 (29→30) |
| `--chain=coa` | 0 | 22.4s | PASS, `snapshots_updated:1` | 0 / 1 | 30 |
| `--chain=sources` | 0 | 28.7s | PASS, `snapshots_updated:1` | 0 / 1 | 30 |
| `--chain=deep_scrapes` | 0 | 21.0s | PASS, `snapshots_updated:1` | 0 / 1 | 30 |
| `--chain=none` (standalone) | 0 | 25.0s | PASS, `snapshots_updated:1` | 0 / 1 | 30 |

The first invocation (`permits`) created today's row (2026-08-31, 29→30 rows); all four subsequent
invocations correctly UPSERTed the SAME row (`snapshot_date` unchanged, row count stays 30) — matches the
guarantees table's "one row per `snapshot_date`" contract exactly, live. `permits.json`'s own live
numbers: 254,082 permits total, 191,500 active, 181,505/191,500 (94.8%) neighbourhood-matched, 33,400 CoA
total / 33,185 linked (99.4%), 274,398 cost estimates (129,149 archetype-sourced), CoA servable funnel
33,400→3,316→1,659→1,558→1,558. All 5 invocations report `verdict:"PASS"` (matches the "verdict is
always PASS" guarantee) and `ledger=[]` (zero `pipeline_runs` rows written by any of the 5, INCLUDING
the standalone one) — **not an anomaly**: matches `compute_centroids`'s own pilot-6 commit-5 finding
verbatim ("`pipeline.js` never self-INSERTs into `pipeline_runs`, only `run-chain.js`'s orchestration
does") — this step's `pipeline.run()` call has the identical shape, so the standalone capture legitimately
shows the same zero as the 4 chain-scoped ones, unlike `link_wsib`'s own step (which DOES write its own
ledger row standalone, per that pilot's different SDK usage).

### Table-state hashes — 5 genuinely different, by declared non-determinism

| Invocation | `data_quality_snapshots` hash |
|---|---|
| permits | `c15f834e3814f27f01811bf507720fdd` |
| coa | `1655b2dd033869337432a7ab940fb8fb` |
| sources | `f47557b0bc57f14dc648fbde06b091f2` |
| deep_scrapes | `718ad8cb7091650a100dc7cfb8e3c091` |
| standalone | `82f20649d6bcebd1d193105e260bdd3a` |

**Non-determinism inventory, declared BEFORE any diff (Spec 122 §5.3):** all 5 hashes legitimately differ,
by design, not by bug — every invocation re-UPSERTs the SAME row with `created_at=NOW()` (a server-side
literal in the `DO UPDATE SET` clause, `:592`) and re-derives every one of the 68 non-key columns from the
live-DB state at that exact moment (permit/CoA/entity counts genuinely fluctuate query-to-query on a live
table, even with nothing else writing during this session — e.g. `last_seen_at > NOW() - INTERVAL '24
hours'` windows shift by the wall-clock second between invocations). The harness's own per-capture
`nondeterminism` inventory (4 entries every run: `summary.records_meta.duration_ms` + 2 `sys_*` timing
rows + the duration literal pattern) confirms this class is already normalised OUT of the comparable form
— the RAW table-content hash differing is expected and orthogonal to that normalisation; per the plan's
own declared posture ("the differential comparison must be by-shape... not by raw value equality"), the
commit-7/9 differential will compare column PRESENCE/TYPES and the `is_insert`/`is_update` xor, never the
raw hash across pre/post.

### Invariants (both clean, all 5 captures)

`duplicate_snapshot_date_count = 0` and `data_quality_snapshots_row_count = 30` on every one of the 5
captures — the `UNIQUE(snapshot_date)` constraint holds live throughout, matching INV-1's own declared
bound.

### G1′ verdict

**CLOSED this commit.** 5 real live invocations (4 chains + standalone), all exit 0 / verdict PASS, the
one-row-per-day contract holds live end to end (29→30, then 4× correctly-idempotent updates on the SAME
row), zero `pipeline_runs` anomaly (matches `compute_centroids`'s own precedent for a `pipeline.js`-shaped
step). 5 non-identical table-state hashes are the DECLARED, expected outcome for a step whose whole job is
"record the live count right now," not a capture-harness defect. Captures written to
`docs/reports/golden/refresh_snapshot/pre/{permits,coa,sources,deep_scrapes,standalone}.json`;
`invariants.json` (2 entries) at the step's own golden directory root, both clean on all 5. Local dev DB's
`data_quality_snapshots` table now genuinely current (2026-08-31, was stale at 2026-08-01 per §0.3) — a
side effect of running the real script live, not pursued further.

---

## §6. PRE vs POST — every declared diff, named (commit 7)

> `step:validate`'s G8 gate requires every field that differs between commit 5's PRE captures and
> commit 7's POST captures to be named here BY ITS OWN LEAF FIELD NAME, or by an explicit count next
> to the structural bucket it falls under — never silently absorbed. 170 diff keys, all of them
> expected consequences of the conversion itself (the runner now drives the read/write execution
> instead of the hand-rolled script), none a behavioral regression.

**`meta[0].reads.coa_applications`, `meta[0].reads.permit_trades`, `meta[0].reads.sync_runs`** — PRE's
`emitMeta` reported `["*"]` for every read table (the old script's own literal convention); POST's
generic `deriveMeta` derives `PIPELINE_META` from `descriptor.inputs.reads.tables[].columns`, which
this descriptor left unset (`{table: "permits"}`, no `columns` key) for `coa_applications`,
`permit_trades`, `sync_runs`, and 6 other read tables — the schema's own `columnName` pattern
(`^[a-z_][a-z0-9_]*$`) does not accept a `"*"` wildcard, so there is no equivalent declaration to make.
`cost_estimates`/`lead_parcels`/`trade_forecasts` kept explicit column lists (already narrow reads) and
show no diff on this axis.

**`stdout_lines[0]` through `stdout_lines[19]`** (20 differences) — the OLD script's own
`pipeline.log.info` call sites (permit counts, neighbourhood %, CoA %, top tags, violations, nulls,
"Snapshot inserted/updated for...") are RETIRED WHOLE with the hand-rolled `runRefreshSnapshot`
function; the NEW generic `runRecorderPhase` (LG-26) logs its own structural progress lines instead
(advisory-lock/target/completion), never the old step-specific narration text.

**`summary.records_meta.chain_run_id`, `.checks_failed`, `.checks_passed`, `.checks_warned`,
`.config`, `.ledger_row`** (6 differences) — all 6 are NEW fields the generic library adds to every
converted step's `records_meta` unconditionally (S2-min items 3/5/8, LW-D13's `ledger_row` enum) — the
OLD hand-rolled script never emitted any of them. A strict improvement in observability, not a
regression: `config` surfaces the resolved T1/T2 values every run (nothing-hidden), `checks_passed`/
`checks_failed`/`checks_warned` make the per-run check tally explicit instead of only inferable from
the audit rows, `ledger_row` states whether this run owns its own `pipeline_runs` row.

**`summary.records_meta.audit_table.rows[9]`, `.rows[10]`** (2 differences) — the OLD script's audit
table carried exactly 9 rows (`snapshots_created`, `snapshots_updated`, `coa_cost_coverage_pct`,
`coa_cost_coverage_open_pct`, `servable_coa_funnel_total`, `servable_coa_funnel_geo_open`,
`servable_coa_funnel_cost`, `servable_coa_funnel_fresh_forecast`, `servable_coa_funnel_score`); the NEW
descriptor declares 2 MORE checks the old script never reported at all — `optional_query_failed`
(RS-D2's own visibility fix, Ask 1) and the `duplicate_snapshot_date_count` invariant (INV-1) — landing
at indices 9 and 10. Both are net-new observability, not a reshuffle of the existing 9.

**`table_state[0].content_hash`, `.order_by`, `.order_columns`** (3 differences) — PRE captured before
any descriptor existed, so `capture-step-golden.js` hashed `data_quality_snapshots` with `columns
<all>` ordered by the bare primary key (`"pk"` fallback); POST captured WITH the descriptor, so the
harness now derives the exact projected column list + `ORDER BY snapshot_date` from
`outputs.writes[0]` — a more precise hash, not a data difference (both captures' `row_count` stayed
30, the invariant this pilot actually cares about).

All told: 34 leaf-named diffs (`coa_applications`/`permit_trades`/`sync_runs`, `chain_run_id`,
`checks_failed`, `checks_passed`, `checks_warned`, `config`, `ledger_row`, `content_hash`, `order_by`,
`order_columns`, ×5 captures = ~132 of the 170 minus the two structural buckets below) plus 2
structural buckets covered by an explicit count: **20 differences** under `stdout_lines` (the retired
per-run log narration) and **2 differences** under `rows` (the 2 net-new audit checks) — every one of
the 170 raw diff keys traces to one of these 5 named causes, all expected, none a regression.

---

## §0. Grounding (executed 2026-08-31)

### §0.1 Pilot order + archetype confirmation

Spec 122 §8.2 (`docs/specs/01-pipeline/122_pipeline_step_optimization.md:1119-1134`, operator ruling 2026-08-30) states plainly: pilot 7 = `link_parcels` (LINK, 2nd member) **superseded** the previously-tentative placement of `refresh_snapshot` at pilot 7; `refresh_snapshot` (RECORDER) and `enrich_parcels` (ENRICHER) **shift to pilots 8/9 respectively**. So pilot 8 = `refresh_snapshot` is the correct, currently-ruled order — no contradiction found with memory or the spec.

RECORDER has exactly **1 member** — `refresh_snapshot` (Spec 122 §1.10 table, `:668`) — so this pilot is, like pilots 2/4/5/6, **forced**: there is no "representative" choice to make, and no sibling exists yet to generalize against.

### §0.2 Script grounding — `scripts/refresh-snapshot.js`

| Measure | Value | Command |
|---|---|---|
| Lines | 687 | `wc -l scripts/refresh-snapshot.js` |
| Revisions (`git log --follow`) | 34 | back to `040d421c` (initial commit) |
| `fix(` commits | 15 of 34 | `git log --follow --oneline \| grep -ic "fix("` |
| `try {` blocks | 9 | 2 are `try/finally` (client release, `enable_indexscan` reset); 7 are `try/catch` |
| `catch` blocks | 7 | none empty; all log via `pipeline.log.warn` and either carry forward the previous snapshot or default (see Finding 5) |
| `.query(` call sites | 20 | 6 sequential on the pinned `snapChild` (REPEATABLE READ READ ONLY txn) + 6 standalone `pool.query` "optional" reads + 1 `pool.query` prev-snapshot fallback + 1 final `withTransaction` UPSERT + 6 misc (SET/RESET/BEGIN/COMMIT) |
| `process.env` reads | 1 | `PIPELINE_CHAIN` (`:642`) — drives the phase ternary, Finding 4 |
| `new Date()` / `Date.now()` | 2, both `Date.now()` | `:188` (`t0`), `:638` (`duration_ms`) — elapsed-time only, **never written to DB**, so no `getDbTimestamp` violation |
| `emitSummary`/`emitMeta` | 1 each | single pair at the end of `runRefreshSnapshot`, standard shape |
| Advisory lock id | **40** | `scripts/refresh-snapshot.js:19`. Checked against all other `ADVISORY_LOCK_ID` declarations repo-wide (`grep -rn "ADVISORY_LOCK_ID ="`) — 40 is unique, no collision |
| `supports_full` / `supports_dry_run` | `false` / `false` | `scripts/manifest.json:56` |
| `telemetry_tables` | `["data_quality_snapshots"]` | `scripts/manifest.json:56` |
| `step_timeout_minutes` | 15 (900,000 ms) | `scripts/manifest.json:56`; measured durations (§0.3) top out at 61.3 s — 6.8% of budget |

**PostGIS check (R-W):** zero hits for `hasPostGIS`/`postgis_version`/`pg_extension`/a try/catch around a PostGIS call anywhere in the file — the script does no geometry work at all. R-W is not engaged.

### §0.3 Chain membership + live run history

`scripts/manifest.json:76-119` — `refresh_snapshot` is a member of **all four** chains: `permits` (position 21/28), `coa` (position 9/14), `sources` (position 20/23), `deep_scrapes` (position 4/8). Per Spec 122 `:512`: *"A shared step's differential must be green in EVERY chain it appears in — up to 4."* This is the widest chain-membership of any pilot to date (pilots 1–7 topped out at 2, `link_massing`/`link_wsib`).

```
docker exec supabase_db_Buildo psql ... pipeline_runs WHERE pipeline LIKE '%refresh_snapshot%'
```

| Chain (`pipeline` column = `<chain>:refresh_snapshot`) | Runs | Status | Last run | First run |
|---|---:|---|---|---|
| `coa:refresh_snapshot` | 28 | 100% `completed` | 2026-07-17 | 2026-03-07 |
| `permits:refresh_snapshot` | 36 | 100% `completed` | 2026-07-17 | 2026-03-05 |
| `sources:refresh_snapshot` | 13 | 100% `completed` | 2026-07-08 | 2026-03-12 |
| `deep_scrapes:refresh_snapshot` | 5 | 100% `completed` | 2026-08-01 | 2026-03-15 |

**Zero failures ever recorded** across 82 total runs (matches Spec 122 `:1112`'s "verdict is PASS-only, all rows INFO" — there is structurally no FAIL path in this script; every optional-query failure is caught and degrades to a carried-forward or defaulted value, never a thrown `step_error`). Duration range measured on the 12 most recent rows: 14,501 ms–61,346 ms, i.e. 1.6%–6.8% of the 15-minute budget — no timeout risk.

⚠️ Local dev DB is stale relative to today (2026-08-31) — last write 2026-08-01. This reflects local/cron cadence, not a defect in the step; not pursued further (out of scope for a pipeline-script conversion pilot).

`data_quality_snapshots` row count: **29** (`SELECT count(*)`), most recent `snapshot_date = 2026-08-01`. `UNIQUE (snapshot_date)` constraint confirmed live (`pg_constraint` query) — the one-row-per-day invariant is DB-enforced, independent of the script.

### §0.4 Write-class re-derivation (§1.4)

Spec 122 itself already flags this step's class as measured-wrong at the source (`:394`, `:107-110` GAP-2) — **this is ported, not discovered fresh this session**, and I verified it against the live file rather than trusting the spec's citation:

> `refresh-snapshot.js:535` `ON CONFLICT (snapshot_date) DO UPDATE SET ... created_at=NOW()` — confirmed live at `:533-535` (line numbers shifted slightly by intervening comment edits; the INSERT statement itself is unchanged in shape). **No `IS DISTINCT FROM` guard anywhere in the 68-column SET clause** (`grep -c "IS DISTINCT FROM" scripts/refresh-snapshot.js` → 0). A same-day re-run overwrites every column of that day's row unconditionally.

The schema's own `gaps[GAP-2]` entry (`scripts/steps/_schema/step.schema.json:104-111`) already prescribes the correct declaration: **class `guarded_upsert` (mechanic: keyed upsert) + `guard: "none"` (+ `guard_why`) + `scope: "snapshot_date = CURRENT_DATE"`** — not class `M snapshot_append`, which implies pure INSERT with no in-place overwrite.

**A `grandfathered.json` fixture already anticipates this exact declaration**, filed 2026-08-25 as `fixture_grandfathered_snapshot` (`scripts/steps/_schema/grandfathered.json`, commit `9e2da7b1`, Spec 122 V7): *"The schema's own exemplar for the V7 grandfathered-unguarded shape (refresh-snapshot.js:535 — ON CONFLICT (snapshot_date) DO UPDATE with no change guard...)"* — it exists only to prove the schema's GREEN direction; it is **not** the step's own grandfathering entry. Pilot 8 commit 8 (peel: thresholds/guard) must add a **real** `refresh_snapshot` key to `grandfathered.json` mirroring this fixture's reasoning verbatim (same shape as `link_massing`'s E1 precedent — "the unguarded write is the correct mechanic, and its cost is bounded": one row, once a day, cost is fixed regardless of guard).

Why unguarded is correct here (not merely tolerated): an `IS DISTINCT FROM` guard on a 68-column dashboard-snapshot row would compare fresh live-DB counts against yesterday's — or this morning's own earlier chain-run's — counts, which are *expected* to differ on almost every column, almost every run (permit counts change constantly). A change guard on a metrics-recording row is close to vacuous by construction: the "change" IS the row's entire purpose.

### §0.5 `outputs.publish` (RECORDER's one required field)

Schema (`step.schema.json:1686-1694`): RECORDER's `x-profile` requires `outputs.publish` and forbids `"none"` — legal values `direct` | `pointer` (`step.schema.json:965`). The write is a direct `INSERT ... ON CONFLICT ... DO UPDATE` straight into `data_quality_snapshots` — no staging table, no atomic pointer-swap/rename mechanism anywhere in the file. **`publish: "direct"`** is the only fit.

### §0.6 Findings (numbered, each grounded this session)

**Finding 1 — Write class M is wrong at the source; the correction is already prescribed (schema GAP-2).** See §0.4. Disposition: **PIN + declare** — the schema already names the fix; commit 7/8 execute it, no behavior changes (the write already IS a daily-keyed unconditional upsert; only the *label* was wrong).

**Finding 2 — Three doc-rot items in Spec 60 (owning spec), all verified against the live file:**
- Spec 60 `:198-199` claims the step computes *"Data Effectiveness Score (0-100) as weighted average: trades 25%, builders 20%, parcels 15%, neighbourhoods 15%, geocoding 15%, CoA 10%."* **Zero occurrences of any weighted-average/score computation anywhere in `refresh-snapshot.js`** (`grep -in "score\|weighted" scripts/refresh-snapshot.js` → no hits touching this). This describes a feature that does not exist in the current file — either removed silently at some point in the 34-revision history, or never actually implemented; either way the spec line is currently false and must be corrected (removed or re-scoped) in the pilot's docs commit, not carried into the descriptor.
- Spec 60 `:197` claims *"Run 9+ parallel counting queries against live DB."* The live script (per its own extensive `WF3 F1` block comment, `:21-64`, and commit `8cc99c78` `fix(01-pipeline/118_deep_scrapes): WF3 F1 - refresh_snapshot query battery pathology`) runs the 6 primary queries **sequentially on one pinned REPEATABLE READ READ ONLY connection**, specifically *to defeat* the parallel-query I/O pathology Spec 118 §1 measured (73% of permits index-fetched, 3 min → 64 min). "9+ parallel" describes the pre-fix (2026-08-15) shape and is now false.
- Spec 60 `:216` claims *"Massing query fails → caught, defaults to 0."* Live code (`:334-346`) does **not** default to 0 on catch — it calls `getPrevSnapshot()` and carries forward the previous day's `building_footprints_total`/`parcels_with_buildings`, falling back to 0 only if no previous snapshot row exists at all. The doc line collapses a two-tier fallback into a one-tier one.
- Spec 60 `:218` ("Testing: `quality.logic.test.ts`, `quality.infra.test.ts`") names 2 files; **5 test files actually reference this script's behavior** — `refresh-snapshot.infra.test.ts` (3 assertions), `refresh-snapshot-query-consolidation.logic.test.ts` (9), `db/refresh-snapshot-consolidation.db.test.ts` (3), `quality.logic.test.ts` (3 hits, its own `describe('refresh-snapshot.js cost/timing observability'` block), **and `coa-cost-model.regression.test.ts` (1 hit, line 204: `it('refresh-snapshot.js still counts geometric in the from_model bucket')`)** ~~plus `quality.logic.test.ts` (3 hits)~~ — Fold A correction, 2026-08-31: the original citation named only 4 files while claiming 5; re-grepped this session and found the true 5th file above, distinct from 4 OTHER files (`chain.logic.test.ts`, `pipeline-sdk.logic.test.ts`, `pipeline-advisory-lock.infra.test.ts`, `pipeline-logic-vars-coercion.infra.test.ts`) that also match `refresh-snapshot` textually but only as one row inside a generic all-scripts shape/registry loop, not a dedicated behavioral test — correctly excluded from the count. `quality.infra.test.ts` itself has **zero** hits on `refresh-snapshot`/`refreshSnapshot`/`runRefreshSnapshot` (`grep -c`), so one of the two files the spec names doesn't actually test this script at all, and 4 files that do aren't named (not 3).

All four are corrections owed to Spec 60 in the pilot's docs commit (PIN, not a behavior change — the code is right, the prose is stale).

**Finding 3 — `docs/specs/00-architecture/00_system_map.md` has no owner row for `refresh-snapshot.js` at all.** Confirmed by contrast: `link-wsib.js` has a row under Spec 46 (`:46`), `load-ravines.js` under Spec 59 (`:59`) — every other converted pilot's step file is present. `refresh-snapshot.js` returns zero matches (`grep -in "refresh.snapshot" 00_system_map.md`). Per G0's own procedure (Spec 123 `:300`, *"the plan's Target Spec line is filled from the system map's owner row for the step file FIRST"*), this pilot's PH-0 has no row to read — the fallback is Spec 60 (`60_shared_steps.md:194-219`), which does own the prose (however stale, per Finding 2). **A new system-map row pointing to Spec 60 is a small owed G0 deliverable**, not previously flagged by any prior pilot because no prior pilot's step file was missing from this table.

**Finding 4 — Phase-ternary: `deep_scrapes` and `permits` silently share the same audit `phase` number.** Live code (`:642-643`):
```js
const chainId = process.env.PIPELINE_CHAIN || null;
const snapshotPhase = chainId === 'sources' ? 13 : chainId === 'coa' ? 7 : 18;
```
`git log -p -S "chainId === 'sources'"` dates this exact ternary shape to commit `5baaed5a` (2026-03-26, `fix(28_data_quality): audit_table gaps, UX rendering, and phase numbering`), which already used the same `... : chainId === 'coa' ? 7 : 14` else-default (later bumped to 18 as the permits chain grew). The `deep_scrapes` chain was added to `manifest.json` earlier — commit `5c953a61`, 2026-03-11 (`git log -p -S "deep_scrapes" -- scripts/manifest.json`) — so `deep_scrapes` **existed before this ternary was ever written**, and no branch was ever added for it; it has always fallen into the `permits`-chain default. Consumer-impact check: `audit_table.phase` is referenced only in `src/tests/pipeline-sdk.logic.test.ts` and `src/tests/step-library.logic.test.ts` (structural/shape assertions, not value checks) and nowhere in `src/lib/admin/funnel.ts` or any admin route — so this is a real but **low-blast-radius** defect (no dashboard currently distinguishes phase 18 by chain). Disposition: **PIN**, ledger entry `RS-D1`, commit 7 declares a proper per-chain phase map (`{permits:18, coa:7, sources:13, deep_scrapes:<own number>}`) instead of a ternary — this is the "phase ternary" class the programme has flagged before (e.g. `assert_engine_health`'s name-prefix dispatch, Spec 122 `:671`) and Rule 1's "nothing hidden" argues for a declared map over a magic literal regardless of blast radius.

**Finding 5 — Inconsistent optional-query failure handling within the same file (the carry-forward policy is stated once and followed only 4 of 6 times).** The file's own comment (`:320-322`) states the design intent explicitly: *"Optional queries: on failure, carry forward previous snapshot values instead of defaulting to 0 (which would destroy dashboard trend lines)."* Four optional blocks (massing `:334-346`, schema-column-counts `:348-363`, SLA `:365-376`, inspections `:378-409`) follow this via `getPrevSnapshot()`. **Two do not** — `costEst` (`:421-443`) and `coaFunnel` (`:450-494`) both catch, log a warning, and leave the pre-declared zero/null default in place, with **no** `getPrevSnapshot()` call. On any live query failure on either of these two blocks, the day's INSERT (a new row, not just an UPDATE) writes `cost_estimates_total = 0` etc. into a brand-new `data_quality_snapshots` row — exactly the trend-line-destroying behavior the file's own comment says the pattern exists to prevent. This is a genuine, live-measurable inconsistency (not hypothetical — the two exempted blocks are the two most recently added, `c42ff97f`/`4442fb75`, added after the carry-forward comment was already written for the original four). Disposition: **candidate for FIX at pilot 8** (Spec 124 §7 ladder rung (e), same class as `link_parcels` LP-D9 in pilot 7 — a real, low-risk, same-mechanism correction, not new machinery) OR **PIN with a ledger ID** if the operator prefers a strict PH-6-classify-don't-fix posture for a forced single-member pilot; carried to the plan's Asks table (Ask 1).

**Finding 6 — Cross-step write into `data_quality_snapshots` from a step this pilot does not own, order-dependent.** `scripts/compute-cost-estimates.js:609-633` performs a **best-effort** (swallowed-failure) `UPDATE data_quality_snapshots SET cost_estimates_liar_gate_overrides=$1, cost_estimates_zero_total_bypass=$2 WHERE snapshot_date=...`, and its own comment (`:610-612`) states: *"the snapshot row is created by refresh-snapshot.js which runs later in the chain; if absent, this UPDATE is a no-op."* `compute_cost_estimates` runs at manifest position 18 in the `permits` chain, `refresh_snapshot` at position 21 — **`compute_cost_estimates` always runs before `refresh_snapshot` creates that day's row**, so its UPDATE is a no-op on the first chain run of any given day. Measured live (10 most recent `data_quality_snapshots` rows): `cost_estimates_liar_gate_overrides`/`cost_estimates_zero_total_bypass` are **NULL on 4 of 10 rows** (2026-08-01, 2026-07-08, 2026-06-28, 2026-06-21/06-20), populated on 6 — consistent with the theory: populated only on days where a second chain's `compute_cost_estimates` run lands *after* `refresh_snapshot` has already created that day's row (e.g. `coa` chain runs `compute_coa_cost_estimates`, not this script — needs a same-day `permits` OR a re-run after row-creation to succeed). `refresh-snapshot.js`'s own 68-column INSERT/UPDATE list (verified `:504-533`) **does not include either column** — it is not this step's write target, and its own `emitMeta` (`:667`) correctly does not claim them. **This is not a defect in `refresh_snapshot` and out of this pilot's write-declaration scope** (the foreign write belongs to `compute_cost_estimates`'s own future conversion, where — per Spec 122 `:391`'s rule *"a target this step does not own is a cascade, never a write"* — it should be declared as a `cascade`, not silently left inside a try/catch). Documented here so the descriptor's `inputs`/`outputs` sections don't accidentally claim ownership, and filed as an Ask (Ask 2) for whether the pilot's docs commit should note this coupling in Spec 60/76.

**Finding 7 — Dual-path defect, OUT OF Backend/Pipeline scope (Cross-Domain), flagged not fixed.** `src/lib/quality/metrics.ts:23-` (`captureDataQualitySnapshot()`) is a **second, independent implementation** of this exact snapshot-capture logic, written in TypeScript, called from a live admin endpoint `src/app/api/quality/refresh/route.ts` (`POST /api/quality/refresh`, a manual "Refresh Now" trigger — confirmed via `grep` both files exist and are wired). Measured:
- It runs its queries via `Promise.all`-style parallel dispatch (`// Run all independent queries in parallel`, `:24`) — the **exact pre-WF3-F1 pattern** `8cc99c78` fixed in the pipeline script (73% index-fetch pathology, 3 min → 64 min under a stale correlation stat).
- It acquires **no advisory lock** (`grep -n "advisory" src/lib/quality/metrics.ts src/app/api/quality/refresh/route.ts` → zero hits) — nothing prevents it from racing a concurrent pipeline-triggered `refresh_snapshot` run (both target the same `ON CONFLICT (snapshot_date)` row with no coordination).
- Its own INSERT column list (`:130-166`) carries **61 columns**; the pipeline script's carries **68** — the 7 missing are the 4 `cost_estimates_*` and 3 `timing_calibration_*` columns (verified by diff of the two column lists). A manual refresh click cannot regress those 7 to zero (unlisted columns keep their prior value under `ON CONFLICT DO UPDATE`), but it also can never populate them from a fresh state.

This is a genuine, live, currently-shippable defect — but it lives entirely in `src/lib/` and `src/app/api/`, which is **Admin/Cross-Domain territory** per root `CLAUDE.md`'s Domain Rules table, not `scripts/` (Backend/Pipeline, this pilot's Operating Boundary per Spec 123's own "the 27 step scripts... out-of-scope" line, `:385`). **Not actioned by this plan.** Filed as Ask 3 — recommend a `review_followups.md` HIGH entry and a separate Cross-Domain WF3 to either retire `metrics.ts`'s duplicate implementation in favor of calling the pipeline's own query builders, or at minimum add the advisory lock.

### §0.7 Seam map (PH-5, G5) — three NEW live seams, not one

R-V (Spec 124 register) defines a "live" seam as a declared `inputs.reads.steps[]` producer→consumer edge where **both** endpoints are converted descriptors; measured against the 7 pilots landed before this one, **exactly one pair currently qualifies** (`compute_centroids` → `link_massing`, R-V's own citation). Grounding this step's actual reads against the converted set (`scripts/steps/_schema/converted.json`: `assert_schema`, `load_ravines`, `link_massing`, `link_wsib`, `link_parcel_addresses`, `compute_centroids`, `link_parcels`) surfaces **three genuinely new candidates**, each verified by reading both the read-site and the producer's own header/write:

| # | Producer (converted) | Table.column read by `refresh_snapshot` | Read site | Producer's own confirmation |
|---|---|---|---|---|
| 1 | `link_parcels` | `permit_parcels.match_type`, `.confidence` | `parcelsRes` query, `:252-259` | `link_parcels` is `permit_parcels`'s writer (pilot 7, keyed upsert) |
| 2 | `link_massing` | `parcel_buildings` (`COUNT(DISTINCT parcel_id)`) | massing try-block, `:334-346` | `scripts/link-massing.js:8` header: *"write the parcel_buildings junction"* |
| 3 | `link_wsib` | `entities.is_wsib_registered` | `buildersRes` query, `:236-245` | `scripts/link-wsib.js:10` header: *"entities.is_wsib_registered"* named as its write |

None of these were live before this pilot (their producers weren't converted yet when read against `refresh_snapshot`'s own — still-unconverted — file). Declaring `inputs.reads.steps: [{step:"link_parcels",...},{step:"link_massing",...},{step:"link_wsib",...}]` in this pilot's PH-0/commit-3 seam map is therefore not decorative — it **triples** the count of R-V's live seam-validation surface area (1 → 4 pairs), which is a meaningful test of whether the mechanism generalizes past its single founding example, worth stating explicitly as part of what this pilot proves about the library (mirrors the RECORDER archetype's own stated pilot purpose, §1.10).

(`building_footprints` is also read, but its producer `massing`/INGESTOR step 14 is not yet converted — no live seam there. `parcels.centroid_lat/lng` and `parcel_address_points` are NOT read anywhere in this file — `compute_centroids` and `link_parcel_addresses` do not create seams here, contrary to what a naive "reads parcels" guess might assume.)

### §0.8 Logic variables

Two declared, both validated via a hard-coded Zod schema + `validateLogicVars` throw-on-invalid (`:14-17`, `:192-193`) — this already matches R-G's `on_invalid: "fail"` requirement in behavior; the descriptor must simply *declare* it:

| Variable | Seed default/bounds (`scripts/seeds/logic_variables.json:632-638`) | Consumed at | Verdict/write-affecting? |
|---|---|---|---|
| `snapshot_coa_conf_high` | 0.8, min 0.01, max 1 | `coaRes` query param `$1` — gates `coa_high_confidence` count written to the row | Write-affecting (not verdict — verdict is hardcoded `PASS`) → `on_invalid: "fail"` per R-G |
| `coa_match_conf_medium` | 0.5, min 0.01, max 1 | `coaRes` query param `$2` — gates `coa_low_confidence` count | Write-affecting → `on_invalid: "fail"` |

No tunables are retired by this pilot (R-A not engaged) and no new logic-variable rows are being added (unlike LM-D15 — no cloud-side `apply-logic-variables.js` prerequisite for this pilot).

---

## §R Reflection (owed per R-F, carried into this same report since this pilot's own plan is what's being authorized)

**LOW-CONFIDENCE:** Finding 5's disposition (FIX vs PIN) is a judgment call left to the operator via Ask 1 — the evidence is solid but the "is this in scope for a forced single-member RECORDER pilot" question is a policy call, not a factual one. Finding 6's characterization as "not a defect in refresh_snapshot" rests on `compute_cost_estimates.js` never yet having been through its own PH-0 — a future pilot on that step should re-derive this cascade rather than trust this citation.

**Recurring/standard-shaping:** Finding 7 (dual JS-path re-implementing a just-fixed pipeline query pattern, outside `scripts/`) is a **new class** not seen in pilots 1–7 — all prior dual-path findings (R-W's four precedents) were PostGIS-availability branches *inside* a single pipeline script's own compute. This is a whole **second application layer** re-implementing a pipeline step's logic independently. Worth a standing check in future pilots: `grep -rn "<producer-table>" src/lib src/app/api` for any admin-side duplicate writer, not just a duplicate reader.

---

## Fold A (2026-08-31, fold-validation)

This report's every executed claim was independently re-executed (not re-read) by the fold-validation pass and found accurate, with one correction: Finding 2's file-count citation named 4 files while claiming 5 — corrected in place above to include the true 5th (`coa-cost-model.regression.test.ts:204`). The write-discipline JSON sample in the companion plan (`.cursor/pilot8_refresh_snapshot_active_task.md`) had two fields that violated `step.schema.json`'s own shape (`cascades: []` instead of the literal `"none"`; `write_inventory` as the 68-column array instead of the required `{statements, why}` object with `statements: 1`) — both corrected in the plan, not in this report (this report doesn't carry that JSON sample). Per operator-directed scope addition, the plan also gained a new "Cross-spec consumer contracts" section covering Specs 26/76/89/102/86/84 — full grounding lives there; summary: Spec 26 has genuine direct dashboard-read contact (`DataQualityDashboard.tsx` → `GET /api/quality` → `SELECT * FROM data_quality_snapshots`, a full-column read not previously cited in this report's §0), Spec 76 contact was already covered by Finding 6/Ask 2, Specs 89/102/86/84 have no contact with this table (86 has only the pre-existing standing `logic_variables` relationship every pilot's tunables already carry). See the plan's own Fold A section for the complete grounding and verdict: **READY for PLAN-LOCKED presentation**, no surviving BLOCKING finding.
