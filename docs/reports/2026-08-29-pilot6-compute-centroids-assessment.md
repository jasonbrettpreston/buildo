# Pilot 6 — convert `compute_centroids` to the Spec 122 step standard (BACKFILL)

**Status:** Commit 1 (PH-0 boundary freeze, G0) landed. §0's seed re-confirmed bit-for-bit against the
same DB this commit; no drift found.

**Governing plan:** `.cursor/active_task.md` (Pilot 6 — compute_centroids, BACKFILL). **Governing specs
(owner row first, per Spec 123 §6 G0):** `docs/specs/01-pipeline/43_chain_sources.md` (PRIMARY, §Step
Breakdown row 9, `:169-176`), `docs/specs/01-pipeline/55_source_parcels.md` (SECONDARY, owns the `parcels`
table this step writes), `docs/specs/01-pipeline/121_assessment_and_verification_methodology.md` §4.3 (the
worked-example DEFECT text, superseded — §0.4), `docs/specs/01-pipeline/122_pipeline_step_optimization.md`
(§1.4, §1.5, §1.10, §5.1–§5.5, §6.4a, §8.2), `docs/specs/01-pipeline/123_step_opt_assessment_validation.md`
(§2, §3, §6, §7), `docs/specs/01-pipeline/124_step_standard_policy.md` (12 rules + R-A..R-R — governs on
conflict with older Spec 122 prose).

---

## §1. PH-0 — boundary freeze (commit 1, G0)

> Re-executed 2026-08-29, same session as §0's seed — every §0 number reconfirmed bit-for-bit against
> `127.0.0.1:54322/postgres` (`node -r dotenv/config`, `scripts/lib/resolve-db.js#createResolvedPool()` —
> the resolver prints its target before connecting, per `tasks/lessons.md`'s "verify against the DB the
> code will actually use" lesson; no `localhost:5432/buildo` mistake made this session).

**Re-confirmed this commit:**

| Check | §0 seed value | Re-executed 2026-08-29 (commit 1) | Match |
|---|---|---|---|
| `current_database()` / host:port | `postgres` / port 54322 (resolver) | `postgres` / container-internal `172.20.0.10:5432` | ✓ identical (resolver target unchanged) |
| `schema_migrations` count / max | 242 / `245_parcels_centroid_geom_invalidation.sql` | 242 / `245_parcels_centroid_geom_invalidation.sql` | ✓ identical |
| `logic_variables` total | (unstated in §0) | 446 | consistent with the branch HEAD at commit-1 time; no `%centroid%`-named row exists for this step (only `link_massing_centroid_confidence`) |
| `parcels` total / NULL geometry / `geometry IS NOT NULL AND geom IS NULL` / `geom IS NOT NULL AND centroid_lat IS NULL` | 486,530 / 0 / 0 / 0 | 486,530 / 0 / 0 / 0 | ✓ identical — no backlog, no drift |
| `pipeline_runs` (`sources:compute_centroids`) | 20 total / 0 failed, latest 2026-07-08 | 20 total / 0 failed, latest `2026-07-08T13:59:38.537Z` | ✓ identical |
| Real-work runs | 1 (2026-03-10, 530 rows) | 1 — `2026-03-10T18:08:12.242Z`, `records_total:530, records_new:0, records_updated:530` | ✓ identical |
| Zero-work runs since 2026-06-10 | Fold D correction: 8 | 8 (`records_total=0 AND started_at >= '2026-06-10'`) | ✓ identical — Fold D's correction holds, not the plan's original "7" |
| `manifest.json:53` chain membership | `sources` only, index 9/28 | `sources` only, index 9 (0-based) of 28 — 0 hits in any other chain | ✓ identical |
| `converted.json` / `grandfathered.json` | 5 converted, `pending:[]`; 2 real step entries (+2 schema fixtures) | 5 converted (`assert-schema.js`, `load-ravines.js`, `link-massing.js`, `link-wsib.js`, `link-parcel-addresses.js`), `pending:[]`; `grandfathered.json.steps` has 4 keys — 2 real steps (`link_massing`, `link_parcel_addresses`) + 2 schema fixtures (`fixture_no_retraction_allowed`, `fixture_grandfathered_snapshot`) | ✓ identical |

**No drift found.** The DB has not moved since the planning session captured §0 — same database (`postgres`),
same migration floor (242/245), same live steady-state (0 backlog).

### File surface, re-derived by direct read this commit (not copied from §0)

`wc -l scripts/compute-centroids.js` → **226**. Construct counts (`grep -c`, this commit): `pool.query`/
`client.query` **6** · `Date.now(` **2**, `new Date(` **0** · `process.env`/`process.argv` **0**/**0** ·
`emitSummary`/`emitMeta` **2**/**2** · `try`/`catch`/`finally` **1**/**1**/**0** · `throw` **0** · `console.*`
**0**. `ADVISORY_LOCK_ID = 99` at `:58` (Spec 47 §A.5 registry row "5 — Maintenance", "Writes Timestamps? NO"
— unique, no collision). `grep -n "require.main\|module.exports"` → **0 hits, both** — confirms Spec 121
§4.3's own claim #86 citation (`compute-centroids.js:60`, "a declaration is never executable") is still
current: `pipeline.run(...)` fires unconditionally at module scope, no guard, no export.

### Write-discipline surface (re-derived per Spec 122 R5 — never trust the port)

One write target, `parcels.centroid_lat`/`centroid_lng`, class **E** `write_once_backfill` — matches Spec
122 §8.2's own table row for `compute_centroids` exactly (no mislabel found, contrast pilot 5's D-class
correction). `guard:"none"` (the `WHERE centroid_lat IS NULL` clause IS the scope, not a value-change guard
— an already-filled row is permanently ineligible for this step; only migration 245's trigger, a different
write path, makes a row eligible again). `retract:"none"` (`grep -c DELETE` → 0). Full re-derivation table:
§0.7 (unchanged this commit, confirmed against live `write.js`/`step.schema.json` — class E genuinely
unimplemented in `write.js` today, per Fold C B-1, re-confirmed `SET_BASED_CLASSES` at `write.js:63` still
excludes it).

### G4 — risk class, full pass this commit

**Chance** = churn (16 commits, small corpus) + fix density (7/16 = 43.75%, mid-range) + fence density (1
genuinely load-bearing fence, `80ac3469`, of 16 commits ≈ 6.25%) → **CLASS B/C** (no churn×complexity
instrument exists — G2 stays ⛔ ABSENT, same gap as pilots 1–5, not re-derived here).
**Impact** = **MODERATE** (raised from the plan's original LOW-MODERATE at Fold C) — three measured
consumers: `link-parcels.js:415-423,437-439` (Tier-3 `ST_DWithin`/`ST_Distance` JOIN KEY — carries the
276-link mis-attribution exposure, R-1/CC-D2 below), `link-massing.js:237/434` (NOT-NULL eligibility filter
only, not a join predicate — confirmed again this commit: 0 hits of `centroid_lat`/`centroid_lng` inside
the join predicate itself, only the WHERE-clause filter), `link-coa-to-parcels.js:284,407,443,462,499-500,715`
(write-propagating consumer — back-fills `coa_applications.lat/lng` from the stored centroids, G10/S-3,
exposure unmeasured — R-2 followup).

### G0 verdict

**CLOSED this commit.** No BLOCKING conflict found against Fold C/D's rulings; every §0 number reconfirmed
bit-for-bit; the write-discipline and risk-class surfaces are re-derived (not ported) and agree with the
plan's own Fold C/D corrections.

---

## §2. PH-3 — Intent Ledger over the corpus (commit 2, G3)

> **16 total commits (7 `fix(`, 6 `feat(`, 2 `chore(`, 1 unprefixed origin), all adjudicated — Spec 123 §2's
> PH-3 restriction ("top-right quadrant + fence density > 0") is satisfied trivially here: G2's
> churn×complexity instrument doesn't exist (same gap as pilots 1–5), so per Spec 123 §2 note this pilot
> adjudicates the full small corpus rather than a filtered subset — 16 commits is smaller than several
> single-fence subsets in prior pilots. Every disposition below is PROPOSED by this pass (agent, 2026-08-29),
> grounded in a direct `git show <sha> -- scripts/compute-centroids.js` re-diff this commit (not transcribed
> from the plan's own findings list) — per Spec 124 §4.2's discoverer≠adjudicator split, stands until a
> human operator ratifies or overturns at commit 7. Closed disposition vocabulary only (Fold D correction):
> `preserved-in-runner \| preserved-in-validator \| preserved-in-compute \| encoded-as-descriptor-field \|
> encoded-as-deviation \| knowingly-retired`. `INCIDENTAL` never appears as a disposition (Rule 13).

| Commit | Date | Construct | Live today? | Proposed disposition | Ground |
|---|---|---|---|---|---|
| `ed12787a` (origin) | 2026-02-25 | File creation — arithmetic-mean `computeCentroid()`, bare `new Pool()`, `main()` + `pool.end()` | Superseded — 0 lines of the origin form survive verbatim (every seam listed has been rewritten by a later commit) | **knowingly-retired** — superseded by `0ef23550`'s SDK migration; the ONE construct that DOES survive to today, `computeCentroid()`'s arithmetic-mean algorithm (`:25-56`), is JS-fallback-only and is itself retired whole by A-1(a) at commit 7 | direct diff this commit |
| `8287291e` (fix) | 2026-03-06 | First `PIPELINE_SUMMARY:` console.log line | Superseded — `0ef23550` replaced the raw console.log with `pipeline.emitSummary()` | **knowingly-retired** — superseded, the underlying CONCEPT (a structured completion summary) survives as `pipeline.emitSummary`/commit-7's `checks`+`counters`, not this literal line | direct diff this commit |
| `6d20c449` (feat) | 2026-03-07 | First `PIPELINE_META:` console.log line — `{reads:{parcels:[id,geometry]}, writes:{parcels:[centroid_lat,centroid_lng]}}` | Superseded in FORM (`pipeline.emitMeta` today, `:219-222`) but the DECLARED READS/WRITES SET is unchanged since this commit | **encoded-as-descriptor-field** — the exact reads/writes pair becomes `inputs.reads.tables`/`outputs.writes[].columns` at commit 7, unchanged since this commit (16 commits, 0 column additions/removals to this pair) | `:219-222` current file; direct diff this commit |
| `e4765619` (fix) | 2026-03-07 | `records_total`/`records_new`/`records_updated` accounting fix — was `{records_total:processed, records_new:computed, records_updated:0}` (WRONG: computed rows are UPDATES to existing parcels, not new rows), corrected to `{records_total:computed, records_new:0, records_updated:computed}` | ✓ the CORRECTED shape is exactly what `:202-205` emits today (only the field name `processed`→`computed` for `records_total` was later reverted by `8b9b0f91`, see below — the `records_new:0`/`records_updated:computed` split from THIS commit is what survives) | **preserved-in-compute** — the corrected new-vs-updated accounting is verbatim-ported to `compute.js` at commit 7 (`counters.records_new.source`/`records_updated.source`) | `:202-205` current file |
| `0ef23550` (refactor) | 2026-03-09 | Whole-file SDK migration: `new Pool()`→`pipeline.run()`, raw `console.log`→structured, per-row `UPDATE`→batched `withTransaction` | The RUNNER-OWNED lifecycle (`pipeline.run`, advisory lock, `withTransaction`) this commit introduced is exactly what commit 7 RETIRES — `pipeline.run(...)` is deleted, replaced by the frozen shape's own runner (`scripts/lib/step/index.js`) | **knowingly-retired** — superseded by the Spec 122 §5.1 frozen shape; this commit's own historical role (bringing the step onto shared SDK infra) is exactly what THIS pilot repeats one level up (SDK→step-library) | direct diff this commit |
| `8b9b0f91` (feat) | 2026-03-26 | First `audit_table` — `phase:22` (later renumbered), `compute_rate >= 90%` WARN threshold (later tightened to 98%) | Superseded twice (phase 22→5 by `5baaed5a`, threshold 90%→98% by `d32612bb`) but the AUDIT-ROW SHAPE (`parcels_processed`/`centroids_computed`/`failed_geometries`/`compute_rate`, all 4 metrics) is unchanged since this commit | **encoded-as-descriptor-field** — the 4-metric audit row shape becomes the T1/T2 declared `checks[]` at commit 7, structurally unchanged since introduction | `:194-199` current file |
| `d32612bb` (feat) | 2026-03-26 | **T2's own provenance**: `compute_rate` WARN threshold **deliberately tightened 90%→98%** ("tighten compute_rate from 90% to 98%", commit message verbatim) + SKIPPED-path audit_table enrichment | ✓ `98` is the literal in force TODAY (`:198`,`:200`) | **encoded-as-descriptor-field** — T2's proposed default (98) is NOT an arbitrary literal; it traces to a deliberate business-accuracy tightening in this commit, which the P4 tunable inventory's `why` at commit 7 must cite by SHA rather than treat as unexplained | `:198`,`:200` current file; commit message |
| `5baaed5a` (fix) | 2026-03-26 | Phase renumbering 22→5 (avoid collision with assert-data-bounds' 14-15) + SKIPPED-path 2nd audit row (`reason`) | ✓ `phase:5` and the 2-row SKIPPED shape are both current (`:76`,`:80-81`) | **encoded-as-descriptor-field** — `phase` is retired as a compute literal ENTIRELY by the library: `scripts/lib/step/verdict.js:293` sources `phase` from `descriptor.sharing.varies_by_chain.phase`, confirmed 0 hits of a `phase:` literal in any converted step's compute module (`link-parcel-addresses.js`, `link-massing.js`) — this commit's phase VALUE (5) carries forward as a declared field, its literal FORM does not | `verdict.js:293`, converted computes re-grepped this commit |
| `98910817` (fix) | 2026-04-02 | try/catch around the JS-fallback's `JSON.parse(row.geometry)` — malformed geometry skips the row with a WARN log instead of crashing the batch | Retired WITH the JS fallback (A-1(a)) — the try/catch has no PostGIS-branch analogue (Cross-read Adversary finding 1, Fold D) | **knowingly-retired** — the guard's PURPOSE (never let one malformed row crash the whole run) survives structurally in the PostGIS path's own `failed` counter (`:110-115`, a COUNT query, not a per-row try/catch — a different mechanism achieving the same non-crashing guarantee) | `:139-148` current file (fallback-only) |
| `2b6eb35a` (fix) | 2026-04-02 | `processed++` added before `continue` in the JSON.parse catch block — fixes an undercount that inflated `compute_rate` | Retired WITH the JS fallback (A-1(a)) | **knowingly-retired** — same fate as `98910817`; the accounting PRINCIPLE (a skipped row still counts toward the denominator) survives in the PostGIS path's own `processed = computed + failed` (`:109,115`) | `:145-147` current file (fallback-only) |
| **`80ac3469` (feat)** | **2026-03-15** | **THE load-bearing fence** — cursor pagination (`id > lastId`) replaces a naive `centroid_lat IS NULL` re-scan; commit message verbatim: *"Fix infinite loop: cursor pagination replaces `centroid_lat IS NULL` filter which refetched malformed geometries forever."* Also: bulk-`unnest` UPDATE (was per-row), `console.log`→`pipeline.log` | Retired WITH the JS fallback (A-1(a), ACCEPTED at Fold D Cross-read Adversary item 1: *"the PostGIS branch is ONE `UPDATE ... RETURNING id` with no loop; the fence protected ONLY the JS fallback — it has no PostGIS-branch analogue to preserve"*) | **knowingly-retired — `CC-D1`, opened this commit** (below). The evidence trail (commit message + this ledger row) is preserved as documentation in `notes.json`/`checks[].why` at commit 7, never as live code | direct diff this commit; Fold D Cross-read Adversary item 1 |
| `7c75e92e` (feat) | 2026-04-02 | PostGIS spatial offload — the ENTIRE current PostGIS fast path (`:98-115`) is introduced whole in this commit, unchanged since | ✓ `:98-115` is this commit's code verbatim, 0 subsequent edits to the PostGIS branch itself | **preserved-in-compute** — the fast-path SQL (`UPDATE parcels SET centroid_lat=ST_Y(ST_Centroid(geom)),...`) is verbatim-ported to `compute.js` at commit 7 per G2's "Spec 123 §7 step 7 requirement" | `:98-115` current file, unchanged since `7c75e92e` |
| `3c3e6f84` (fix) | 2026-04-16 | Advisory lock retrofit — `ADVISORY_LOCK_ID=99` + `withAdvisoryLock` wrap | Superseded structurally (the lock ID itself, `99`, carries forward into `identity.lock` at commit 7; the WRAPPING mechanism — `pipeline.withAdvisoryLock` — is retired with `pipeline.run` per `0ef23550`'s row above) | **encoded-as-descriptor-field** — `99` becomes `identity.lock` (Spec 47 §A.5 registry row unchanged: "Maintenance wave", "Writes Timestamps? NO"); confirmed unique this session (`grep ADVISORY_LOCK_ID.*=.*99` across `scripts/` → exactly this one file) | `:58` current file |
| `90e3d0f8` (fix) | 2026-04-17 | `parseInt`/`parseFloat` → `safeParsePositiveInt`/`safeParseFloat` (B1 safe-math migration) | ✓ both call sites current (`:67`, `:198`, `:200` — Fold D cited `:193`/`:198`, minor line drift since; re-derived, not re-cited, this commit) | **preserved-in-compute** — the safe-math guards are verbatim-ported to `compute.js` at commit 7; Fold D's own G3-vocabulary ruling for this exact commit (item 5) confirmed | `:67,198,200` current file |
| `f69b561d` (chore) | 2026-04-21 | SPEC LINK header — **introduces** the wrong citation: `docs/specs/28_data_quality_dashboard.md` → `docs/specs/pipeline/41_chain_permits.md` (NOT merely a re-path of a pre-existing wrong value — `28_data_quality_dashboard.md` was the CORRECT-at-the-time citation before this restructure sweep; this commit's mapping is the error's origin, contradicting the plan's "survived two prior repair commits" framing — corrected here) | Superseded by `da6db77a` (below), itself still wrong | **knowingly-retired — fixed at commit 7** (finding 6). Correct citation: `43_chain_sources.md` §Step Breakdown row 9 | direct diff this commit — corrects the plan's provenance framing |
| `da6db77a` (chore) | 2026-04-22 | SPEC LINK header — mechanical re-path of the ALREADY-WRONG string: `docs/specs/pipeline/41_chain_permits.md` → `docs/specs/01-pipeline/41_chain_permits.md` (a directory-restructure sweep across 192 files, not a content review — this specific string was never re-verified against the manifest) | ✓ this is the CURRENT (wrong) header, `:16` | **knowingly-retired — fixed at commit 7** (finding 6), same as `f69b561d` | `:16` current file |

**Approver for every disposition above:** this pilot's PH-3 pass (agent, 2026-08-29), grounded in direct
`git show`/`git blame` re-verification this commit — per Spec 124 §4.2's discoverer≠adjudicator split,
PROPOSED here, stands until a human operator ratifies or overturns at commit 7.

### `CC-D1` — the cursor-pagination fence, KNOWN-DEFECT-adjacent PIN (opened this commit)

**Classification (Spec 123 §3, the four questions):** (1) Observed? Yes — the fence exists specifically
because a naive `centroid_lat IS NULL` re-scan (pre-`80ac3469`) infinite-loops on a permanently-malformed
geometry. (2) Spec/invariant conflict? No — this is a CORRECTNESS fence, not a defect; the current code
already avoids the bug. (3) Load-bearing? **Yes — this pilot's #1 Regression Guardian fence.** (4) Cost of
carrying vs. diverging: **N/A — this is not a DEFECT to PIN-and-carry.** Fold D's Cross-read Adversary (item
1, 2026-08-29) resolved the disposition question directly: the fence protects ONLY the JS fallback
(`:116-185`), which A-1(a) retires in full. The PostGIS branch (`:98-115`, the ONLY branch that survives to
commit 7) is a single `UPDATE ... RETURNING id` with no loop — it has no cursor-pagination analogue to
preserve, and none is needed (a single server-side `UPDATE ... WHERE ...` cannot infinite-loop on a
malformed row the way a client-side re-scan can; a row that fails the `geom IS NOT NULL` cast is excluded by
the WHERE clause itself, not re-fetched). **Disposition: `knowingly-retired`.** The fence is deleted WITH the
branch it protects, not preserved as dead code — per the `link_massing` A-8 precedent (Fold C S-1), keeping
70 lines of unexercised, unverifiable-in-CI fallback code alive on an inference is less honest than a
declared `guards.requires: postgis` / `on_missing: fail` HALT. **Status: PIN (knowingly-retired), evidence
trail preserved in `notes.json`'s `fences[]` + `checks[].why` at commit 7** (Rule 4 — a rule kept out of live
code must still be written down). Closes at commit 7.

### `CC-D2` — the 3,130/276 neighbour-parcel mis-attribution finding, PIN (opened this commit)

**Classification:** (1) Observed? Yes — `link-parcels.js:411-426`'s Tier-3 nearest-centroid join reads
`parcels.centroid_lat/lng` as a distance-based fallback key. (2) Spec/invariant conflict? **No spec asserts
centroids must fall inside their own polygon** — Spec 59 R2.5 explicitly rules the opposite for concave
lots ("functional behavior is correct"). Not a DEFECT in `compute_centroids` itself — `ST_Centroid` is
computing exactly what it is asked to compute. (3) Load-bearing? **Yes, indirectly** — R-1 (Reality-Check,
Fold C) measured that of the 3,626 out-of-polygon centroids, 3,130 land inside a DIFFERENT parcel, and of
494 `spatial`-tier `permit_parcels` links pointing at a drifted parcel, 276 have the permit's own point
actually inside another specific parcel — a genuine mis-attribution SIGNATURE in a DOWNSTREAM consumer
(`link-parcels.js`), not in this step. (4) Cost of carrying vs. diverging: **carrying it through this
pilot's zero-behaviour-change conversion costs nothing** (this step's own output — the centroid value itself
— is unchanged and correct per its own contract; only a DIFFERENT step's join strategy is exposed as
fragile by this data). **Classification: CONTRACT-adjacent — this step's output is correct; the finding is
a defect surface in a DOWNSTREAM consumer, not in `compute_centroids`.** **RULING: PIN for this pilot**
(zero-behaviour-change scope; the 276-link exposure predates migration 245 and is not this pilot's defect
to fix) **+ HIGH followup filed against `link_parcels.js`** ("Tier-3 nearest-centroid join should use
`ST_PointOnSurface` or a containment check; 276 candidate mis-links measured 2026-08-29" — already filed at
Fold C, re-confirmed here, not re-filed). **Status: PIN.** The golden `invariants.json` (commit 5) pins
`centroid_in_neighbour_parcel_count=3130` (re-measured this session via the materialized-CTE+LATERAL form,
§0.4-adjacent — see commit 5) as an OBSERVABILITY row on THIS step's own invariant set, naming the exposure
in a comment, without asserting this step must change to close it. Closes at commit 4 (classification, no
code change required from this pilot).

---

## §3. PH-5 — Seam map (commit 3, G5)

> Every place `scripts/compute-centroids.js` (226 lines) touches something outside pure computation — DB,
> clock, network, argv/env — re-derived by direct read this commit, not copied from the plan's preliminary
> pass. Cleanest seam map of any pilot to date per the plan's own §0.7/G5 note — confirmed, not merely
> repeated, below. Citations mark which seams RETIRE with the JS fallback (A-1(a), commit 7) vs. which
> survive into `compute.js`.

### DB seam
- `pool` — supplied by `pipeline.run('compute-centroids', main)` (`:60`), never a local `new Pool()`.
- `pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)` (`:61`, closes `:223`) wraps the ENTIRE body —
  lock 99, single concurrent runner, kept textually (`identity.lock`, §1's precedent).
- **4 `pool.query` sites SURVIVE into `compute.js` (the PostGIS-only shape after A-1(a)):**
  1. `:64` — pre-run count (`SELECT COUNT(*) FROM parcels WHERE geometry IS NOT NULL AND centroid_lat IS
     NULL`), outside any transaction, pure read.
  2. `:91` — the PostGIS-presence check (`SELECT 1 FROM pg_extension WHERE extname='postgis'`). ⚠️ **This
     query itself is RETIRED, not merely its `else` branch** — `guards.requires: postgis` (A-1(a)) moves
     this check to the RUNNER's precondition-guard mechanism (asserted once, before compute runs, per the
     `link_massing` A-8 precedent), not re-run as a compute-time query on every invocation. Compute no
     longer branches on `hasPostGIS` at all — it assumes PostGIS is present (the guard already refused the
     run otherwise).
  3. `:101` — **the ONE write statement**, `UPDATE parcels SET centroid_lat=ST_Y(...), centroid_lng=ST_X(...)
     WHERE geom IS NOT NULL AND centroid_lat IS NULL RETURNING id`. A single bare `pool.query`, **no
     `withTransaction` wrapper** — this is the `txn_scope: "statement"` finding (A-3, resolved Fold C): one
     server-side statement IS the transaction (implicit auto-commit), not an explicit BEGIN/COMMIT the JS
     fallback's per-batch loop needed.
  4. `:111` — the post-write failed-count query (`SELECT COUNT(*) FROM parcels WHERE geometry IS NOT NULL
     AND geom IS NULL AND centroid_lat IS NULL`), pure read, outside any transaction.
- **2 sites RETIRE WITH the JS fallback (A-1(a), commit 7):** `:122` (the fallback's own cursor-paginated
  `SELECT`) and `:165-166` (`pipeline.withTransaction(pool, client => client.query(...))`, the bulk-unnest
  batch UPDATE) — the LAST `client.query`/transaction-wrapped write in this file; after A-1(a) the step has
  **zero `client.query` sites and zero explicit transactions**, the simplest DB seam of any pilot converted
  so far on this specific axis (contrast `link_parcel_addresses`'s ~487 independent per-batch transactions).
- **0 session-scoped `SET`/`RESET` GUC calls** — no session-config dependency, same as `link_parcel_addresses`
  and `link_wsib`.

### Clock seam
- `Date.now()` — **2 sites** (`:62` `startTime`, `:187` `durationMs`), both elapsed-time-only, never written
  to the DB as a timestamp — legal per `tasks/lessons.md`'s explicit carve-out.
- **0 `new Date(`** anywhere.
- **0 DB-clock reads** (`pipeline.getDbTimestamp`) — confirmed again this commit: this write target has NO
  timestamp column at all (`centroid_lat`/`centroid_lng` are plain floats, no `computed_at`-equivalent
  companion column). Spec 47 §A.5's own registry row for this step reads *"Writes Timestamps? NO"* — the
  R3.5 DB-clock rule is structurally N/A here, not merely satisfied by an empty seam. **Cleanest clock seam
  of any pilot converted to date** — no read/write split to reconcile at all, unlike `link_wsib`'s 1
  read-side ISO-normalization site or `link_parcel_addresses`'s `RUN_AT`-threaded batch INSERTs.

### Network seam
- **0 `fetch(` calls** — no external network dependency, same as every converted `sources`-chain step so far.

### argv/env seam
- **0 `process.env` reads, 0 `process.argv` reads** — re-confirmed by direct grep this commit (matches §0.2's
  original measurement and commit 1's re-derivation). `manifest.json`'s `supports_full:false`/
  `supports_dry_run:false` are both TRUE-to-the-code — a genuinely clean node on this axis, the cleanest
  argv/env seam of any pilot to date (`link_parcel_addresses` had 1 env read for its force-full override;
  this step has none — BACKFILL's "run once, fill what's NULL" shape has no forced-mode concept at all,
  consistent with `manifest.json`'s own `supports_full:false`).

### Seam-map verdict (G5)

**CLOSED this commit.** No PARTIAL seams remain. DB: 4 surviving reads/1 write, fully characterized,
`txn_scope: "statement"` confirmed structurally (no wrapper around the single UPDATE). Clock: cleanest of
any pilot — no timestamp column exists to reconcile. Network: absent. argv/env: absent — the one seam every
prior pilot had to declare an `override.force_full` box for (`link_massing`/`link_wsib`/
`link_parcel_addresses` all read SOME env or argv signal for a forced-FULL path) is genuinely empty here,
consistent with `write_once_backfill` having no "FULL" mode to force (the scope predicate —
`centroid_lat IS NULL` — already recomputes to a correct, monotone answer on every invocation; there is
nothing a `--full` flag could mean for this step that the scope doesn't already do). This sharpens (does not
contradict) A-4's ruling: a BACKFILL with no argv/env seam at all is exactly the shape that needs no
`override` box, matching the plan's `override:"none"` disposition.

---

## §4. PH-6 — Classification (commit 4, G6)

> Every finding from the plan's "six findings" list (§0.6) + this pilot's own PH-3 archaeology (§2),
> classified per Spec 123 §3's three-way split: **CONTRACT** (a downstream consumer depends on it, even if
> ugly) / **INCIDENTAL** (nothing observes it — do not assert on it) / **DEFECT** (a spec or invariant
> asserts the opposite). `INCIDENTAL` is a legitimate G6 classification value (Spec 123 §3 Q1) — distinct
> from the G3 Intent Ledger's closed disposition vocabulary, which bans it (Fold D, §2 above).

| Candidate | Ledger ID | Classification | Ground |
|---|---|---|---|
| Finding 1 — the historical DEFECT (missing invalidation) is already CLOSED | *(no CC-D — historical, not live)* | **CLOSED, was never this pilot's to pin** | migration 245 (applied, red-first proven); re-confirmed commit 1: 0/486,530 backlog |
| Finding 2 — JS fallback dead weight | CC-D1 | **CONTRACT-adjacent (a bug-fix fence), retired as a unit with its branch** | opened commit 2; A-1(a) RULED at Fold C — the fence's own PostGIS-branch analogue doesn't exist (Cross-read Adversary item 1), so retiring the branch retires the fence honestly, not by omission |
| Finding 3 — 20 runs, 1 real-work, 8 zero-work since 2026-06-10 | *(no CC-D — a corpus-state fact, not a defect)* | **INCIDENTAL to correctness; an observability fact for the golden capture (commit 5)** | re-confirmed commit 1: `pipeline_runs` query, Fold D's 8-not-7 correction holds |
| Finding 4 — 2 undeclared literal tunables | *(no CC-D — resolved by T1/T2 at commit 7, not a ledger-tracked defect)* | **DEFECT (Spec 124 Rule 3)** | `failed_geometries==0` (`:197`) and `compute_rate>=98%` (`:198`,`:200`) are bare literals; T2's default (98) traces to `d32612bb`'s deliberate tightening (§2) |
| Finding 5 — the cursor-pagination fence | CC-D1 | *(same row as Finding 2 — the fence and the fallback it protects are one adjudication)* | — |
| Finding 6 — stale SPEC LINK header | *(no CC-D — doc-only, fixed at commit 7)* | **DEFECT in the description, not the behavior** — same class as pilot 5's LPA-D2 | §2: `f69b561d` INTRODUCED the wrong citation (not merely "survived" a repair, correcting the plan's framing); `da6db77a` re-pathed the already-wrong string |
| Fold C R-1 / this report's CC-D2 — 3,130/276 neighbour-parcel mis-attribution | CC-D2 | **CONTRACT-adjacent — this step's output is correct; the exposure is in a DOWNSTREAM consumer's join strategy** | opened commit 2; re-confirmed §2; HIGH followup already filed against `link_parcels.js` |

### Finding 7 (NEW, this commit) — algorithm-drift population, measured live, not in the plan or Fold C/D

**Discovered during the seeded eyeball below.** A random sample of outside-polygon centroids showed
non-trivial (0.9–27m) distances between the STORED `centroid_lat`/`centroid_lng` and a FRESHLY-computed
`ST_Y(ST_Centroid(geom))`/`ST_X(ST_Centroid(geom))` on the SAME, unchanged `geom` — the exact PostGIS
expression this step's own UPDATE writes today. Measured over the full corpus:

| Query | Result | Time |
|---|---|---|
| `ST_DistanceSphere(stored_point, ST_Centroid(geom)) > 1.0` | **292,587 / 486,530 (60.1%)** | 1,486 ms |
| `> 0.01` (1cm — beyond `NUMERIC(10,7)`'s own ~1cm rounding floor, ruling out column-precision as the cause) | **381,240 (78.4%)** | 1,888 ms |
| Distribution of the `>1m` population | avg **6.61 m**, median **4.12 m**, max **1,476.84 m** | — |

**Root cause (measured, not fully provable without a `computed_at` column — Spec 47 §A.5's own registry row
for this step reads "Writes Timestamps? NO", so no per-row provenance timestamp exists):** only **530** of
486,530 parcels' centroids were EVER written by a run this pilot can see in `pipeline_runs` (the sole
real-work run, 2026-03-10 — §0.6 finding 3, §1) — and that run PREDATES the PostGIS offload (`7c75e92e`,
2026-04-02), so it used the JS **arithmetic-mean** algorithm (`computeCentroid()`, simple mean of ring
vertices), not PostGIS's **area-weighted** `ST_Centroid`. The remaining ~486K rows' centroid values predate
`pipeline_runs` ledger visibility entirely — most plausibly populated by a one-time bulk seed/restore outside
the tracked pipeline (`ruled out`: neither `load-parcels.js` nor any other script but `compute-centroids.js`
itself writes `parcels.centroid_lat/lng` — `grep -rln "centroid_lat\s*="` across `scripts/` returns exactly
`compute-centroids.js` + migration 245 + `load-massing.js` (`building_footprints.centroid_lat`, a DIFFERENT
table, confirmed by direct read — a false-alarm ruled out this commit). The distribution (median 4m, not a
uniform large offset) is consistent with arithmetic-mean-vs-area-weighted drift on irregular polygons, not a
coordinate-system bug.

**Classification: DEFECT-adjacent, same PIN posture as CC-D2 — zero behaviour change for this pilot.** This
step's own G1 guarantee ("fills centroid for every parcel with a geometry and no centroid yet") never
promised WHICH formula, and the scope predicate (`centroid_lat IS NULL`) makes an already-filled row
PERMANENTLY out of this step's own reach regardless of which algorithm filled it — by design, not by
oversight (finding 1's own guarantee G3: this step never revisits a filled row; only migration 245's trigger
does, and only on a genuine geometry change). The frozen-shape conversion does not alter the scope predicate
or add a recompute/revisit mechanism — carrying this population through the conversion costs nothing beyond
what already exists. **`CC-D3` opened below.**

### The RANDOM/SEEDED disambiguation eyeball (10 outside-polygon centroids, seed `20260829004`)

Executed live this commit against `127.0.0.1:54322/postgres`: `SELECT setseed(0.20260829004)` on a held
client, then `ORDER BY random() LIMIT 10` over the 3,626-row outside-polygon population (R-1/CC-D2's own
population), joined against `feature_type`/`lot_size_sqm`/`zoning_class` + the fresh-vs-stored distance that
surfaced Finding 7:

| `id` | `feature_type` | `lot_size_sqm` | `zoning_class` | stored-vs-fresh-centroid distance (m) | `ST_NPoints(geom)` |
|---:|---|---:|---|---:|---:|
| 471429 | COMMON | 1018.50 | *(null)* | 4.68 | 38 |
| 369639 | COMMON | 438.46 | ON | 2.34 | 12 |
| 269589 | COMMON | 26.23 | RD | 7.67 | 54 |
| 30413 | COMMON | 153.34 | RM | 0.89 | 12 |
| 23507 | COMMON | 5985.73 | ON | 26.51 | 17 |
| 56938 | COMMON | 56.36 | RA | 26.72 | 81 |
| 405384 | COMMON | 47.36 | R | 5.98 | 18 |
| 317618 | COMMON | 1847.60 | E | 17.24 | 12 |
| 152725 | COMMON | 913.26 | ON | 3.26 | 35 |
| 67264 | COMMON | 16.47 | RD | 3.46 | 51 |

**Eyeball:** all 10 sampled parcels are `feature_type='COMMON'` (unsurprising — `COMMON`/`CONDO` parcels
dominate the 3,626-row concave-polygon population per Spec 59 R2.5's own documented pattern) with vertex
counts (`ST_NPoints`) from 12 to 81 — every sample is a genuinely non-trivial polygon, not a degenerate
2-3-point sliver. All 10 show a non-zero stored-vs-fresh distance (0.89–26.72m), independently confirming
Finding 7's population is real and not an artifact of the sampling. No new defect class found beyond
Findings 1–7 above and R-1/CC-D2's own mis-attribution signature — no cross-street contamination, no
implausible lot-size/zoning combination, no degenerate geometry.

### One LOW/MED followup filed this commit (`docs/reports/review_followups.md`)

Finding 7 (algorithm-drift population, 292,587/486,530 rows) — filed **MED** (below CC-D2's HIGH: no
measured downstream mis-link count exists for this finding the way R-1 measured 276 for CC-D2; the
consumer exposure is plausible but unquantified, matching R-2's own "unmeasured exposure" posture for
`link-coa-to-parcels.js`). Scoped as a candidate for a FUTURE one-time backfill WF3 (recompute every
`centroid_lat`/`centroid_lng` under today's PostGIS algorithm, outside `compute_centroids`'s own
NULL-only scope) — explicitly NOT this pilot's fix.

### G6 verdict

**CLOSED this commit.** Every finding from the plan + this pilot's own archaeology is classified. Two new
ledger rows this pilot (`CC-D1`, `CC-D2`) both reach PIN status; a third (`CC-D3`, Finding 7) opens this
commit with the same PIN disposition. No BLOCKING classification conflict found.

---

## §5. Golden master (commit 5, G1′) — 2 invocations (this step's sole chain membership + standalone)

> **Every capture below is a REAL run of the UNCONVERTED `scripts/compute-centroids.js`** via
> `scripts/analysis/capture-step-golden.js`, run against `127.0.0.1:54322/postgres` (resolve-db, 242
> migrations, floor 245). Files: `docs/reports/golden/compute_centroids/pre/{sources,standalone,
> standalone-repeat}.json` + `docs/reports/golden/compute_centroids/invariants.json` (7 entries — the 5
> task-pinned + `parcels_total` + the CC-D3 observability row). `--tables=parcels` (no descriptor exists
> yet, so the harness's auto-derivation is unavailable — supplied explicitly), `--table-columns=parcels:
> id,centroid_lat,centroid_lng` / `--table-order=parcels:id` (bypasses the 100,000-row ceiling via the
> projection mechanism, `ceiling_bypassed:"projected"` — 486,530 rows exceeds the harness's default ceiling).

### The 2 pinned invocations — `sources` (this step's ONLY chain membership, index 9/28) + `standalone`

Both invocations are the **zero-work SKIP path** — the only shape live-observed in 5+ months (§0.6 finding
3, re-confirmed commit 1: 0/486,530 backlog). Both `exit_code:0`, `verdict:"PASS"`, identical `table_state`
hash (`94473cfd`), identical invariants:

| Invocation | `chain` arg | `PIPELINE_CHAIN` env | `records_total` | `pipeline_runs` rows written | `table_state` hash |
|---|---|---|---:|---:|---|
| `sources` | `sources` | `sources` | 0 | 0 | `94473cfd` (486,530 rows, projected) |
| `standalone` | `none` | *(unset)* | 0 | 0 | `94473cfd` (486,530 rows, projected) — **byte-identical to `sources`** |

`--compare` of the two: **1 difference — the harness's own `chain` metadata field.** Every other
normalised field (summary, meta, table_state, invariants) is identical, confirmed live:
```
[capture-step-golden] 1 difference(s): .../pre/sources.json vs .../pre/standalone.json
  chain
    - "sources"
    + "none"
```

**`pipeline_runs` rows written: 0 for BOTH invocations — not an anomaly, a property of the UNCONVERTED
script.** `scripts/lib/pipeline.js` (the pre-conversion SDK `compute-centroids.js` still uses) never itself
INSERTs into `pipeline_runs` — only `scripts/run-chain.js`'s own chain-orchestration code does, when it
spawns a step as part of an actual `chain_sources` execution (`grep -n "INSERT INTO pipeline_runs"
scripts/*.js` → hits only in `run-chain.js`, none in `pipeline.js`). This matches the 20 existing
`pipeline_runs` rows under `sources:compute_centroids` (§0.6 finding 3) — all written by real
`chain_sources` runs, not by the script writing its own row. Neither `capture-step-golden.js`'s direct
child-process spawn (with `PIPELINE_CHAIN=sources` set but no actual `run-chain.js` orchestration around
it) nor a bare `node scripts/compute-centroids.js` (this pilot's `standalone` invocation) goes through
`run-chain.js`, so both legitimately show `ledger=[]` — this is UNRELATED to the harness doc-comment's note
that a converted step's `standalone` capture "exercises the step's own ledger path" (that mechanism belongs
to the FROZEN-SHAPE runner, `scripts/lib/step/index.js`, which this pre-conversion capture does not exercise
by construction).

### The write path is proven separately — no gate-bypass exists; the proof is an EXISTING NULL-centroid
### fixture DB test

**No FULL/forced-mode override exists for this step to exercise (§3's seam-map finding, re-confirmed:
0 `process.env` reads, 0 `process.argv` reads) — there is no `COMPUTE_CENTROIDS_FORCE_FULL`-shaped env var
or `--full` flag the way `link_massing`/`link_wsib`/`link_parcel_addresses` each have.** BACKFILL's own
scope (`WHERE centroid_lat IS NULL`) has no "FULL" mode to force — the predicate already recomputes
correctly on every invocation, and today's live corpus has 0 eligible rows (§1). This pilot did **not**
construct a synthetic NULL-centroid fixture to force a live capture of the compute PATH — that mechanism
**already exists**, pre-dating this pilot: `src/tests/db/migration-245-centroid-invalidation.db.test.ts`'s
case **④** ("the next `compute_centroids` run refills the invalidated centroid", `:311-346`) genuinely
spawns the real `scripts/compute-centroids.js` (`CENTROIDS_SCRIPT`, `:66`) against a row the migration's own
trigger has just invalidated (a real geometry UPDATE, real NULL centroid), and asserts the **refilled VALUE**
— not merely the exit code (its own `⛔ TRAP ④` note, `:50-54`, states exactly why: *"a run that computed
nothing at all"* would also exit 0, so the test reads the actual `centroid_lat`/`centroid_lng` post-refill).
**This is the write-path proof for this pilot** — verified still present and unmodified this commit
(`grep -c "CENTROIDS_SCRIPT\|describe.*refills the invalidated"` → both hit as cited). No new fixture was
needed or built; citing an existing, already-red-first-proven mechanism is the correct rung (Spec 124 §7 —
do not duplicate a working mechanism).

### Harness self-test (Done-test requirement)

Re-ran the `standalone` capture a second time (`pre/standalone-repeat.json`) and diffed via `--compare`:
```
[capture-step-golden] IDENTICAL (normalised): docs/reports/golden/compute_centroids/pre/standalone.json == docs/reports/golden/compute_centroids/pre/standalone-repeat.json
```
Exit code 0. **Harness self-test PASSES.**

### Non-determinism inventory (declared BEFORE the first diff, Spec 124 §7 Step 4)

Identical across both invocations, 3 entries — the SAME shape every prior pilot's zero-work SKIP capture
declares:

| Kind | What | Why |
|---|---|---|
| `pattern:duration_literal` | `"completed in 1.0s"`/`"completed in 2.6s"` stdout log lines | wall-clock elapsed text, masked to `<DUR>` |
| `row:sys_duration_ms` | `records_meta.audit_table.rows[].metric==="sys_duration_ms"` | auto-injected timing (`pipeline.js:346-352`), masked by the `sys_` prefix rule |
| `row:sys_velocity_rows_sec` | same auto-injected timing row, `records_total===0` denominator | masked by the same `sys_` prefix rule |

No OTHER non-determinism found — `git_head`, `db_target`, `runtime`, `args` are all harness metadata outside
the normalised comparison; the invariants (7 entries) and table_state hash are BOTH deterministic on
identical data (confirmed by the harness self-test above).

### Invariants pinned (`docs/reports/golden/compute_centroids/invariants.json`, 7 entries, identical across
### both captures — measured values, live this commit)

| Invariant | Value | Task-pinned? |
|---|---:|---|
| `parcels_total` | 486,530 | context (not task-pinned, included for scale) |
| `centroid_null_count` | **0** | ✓ task-pinned |
| `geom_not_null_geometry_null_count` | **0** | ✓ task-pinned |
| `outside_polygon_count` | **3,626** | ✓ task-pinned |
| `pointonsurface_gt_1m_count` | **298,021** | ✓ task-pinned |
| `centroid_in_neighbour_parcel_count` | **3,130** | ✓ task-pinned (materialized CTE + LATERAL, timed 2.57s this session, §2's `CC-D2` query shape — well under the "must be seconds" requirement) |
| `centroid_algorithm_drift_gt_1m_count` | **292,587** | CC-D3 observability row (§4 Finding 7), not in the original task list — added because it was discovered this pilot and belongs on this step's own invariant set |

All 7 values match every direct-query measurement taken earlier this session (commits 1/2/4) exactly —
**zero discrepancy between the ad-hoc `node -r dotenv/config -e ...` queries and the harness's own
`--invariants` execution**, confirming the harness reproduces the same SQL faithfully.

### G1′ verdict

**CLOSED this commit.** Both pinned invocations captured, byte-identical on every normalised field except
`chain`; harness self-test PASSES (re-run IDENTICAL); non-determinism inventory declared BEFORE any diff was
taken (3 entries, both invocations agree); all 7 invariants pinned and cross-checked against this session's
independent measurements; the write path's proof mechanism identified as an EXISTING db test (no new
fixture built, none needed) — `migration-245-centroid-invalidation.db.test.ts`'s case ④.

---

## §0. PH-0 seed — measured boundary table (2026-08-29 planning session)

### 0.1 Governing specs, read in order (Spec 124 §7 Step 0 / Spec 123 §6 G0)

1. **`docs/specs/00-architecture/00_system_map.md`** — has **no direct row** for `scripts/compute-centroids.js` (grep over the file returns zero hits). The owning entries are the **Pipeline** section rows **43** (`01-pipeline/43_chain_sources.md`, "Sources (Spatial & Reference Data)" — `compute_centroids` is Step 9 of its own §Step Breakdown, `:169-176`) and the script header's own citation, **`01-pipeline/41_chain_permits.md`** (SPEC LINK at `compute-centroids.js:16`, though `compute_centroids` is NOT actually a member of the `permits` chain — verified below, §0.3 — so this citation is the header's own stale artifact, filed as a finding, §0.6 finding 6).
2. **Spec 121 §4.3** — uses `compute_centroids` as its *worked example* of a DEFECT: *"`compute_centroids` never invalidates its derived value on upstream geometry change. That is DEFECT. Pin the non-invalidation → convert → prove bit-identical output → then land `fix(compute_centroids): invalidate centroid on geometry change`."* — **superseded, see §0.4.**
3. **Spec 55 `55_source_parcels.md`** — the owning spec for the `parcels` table this step writes into.
4. **Spec 62** (centreline) — read for centroid consumers; **no centreline consumer of `parcels.centroid_lat/lng` exists** (`enrich-centreline.js` uses its own MATERIALIZED-centroid CTE over `p.geom` directly, not the stored columns — confirmed by grep, zero `centroid_lat` hits in `enrich-centreline.js`).
5. **Migration `245_parcels_centroid_geom_invalidation.sql`** + its red-first proof `src/tests/db/migration-245-centroid-invalidation.db.test.ts` — **the fix Spec 121 §4.3 and Spec 123 §3.2 call for. Read in full, §0.4.**
6. **Spec 124** (§2 Rules 1–12, §3 archetype variance table, §5 Register R-A..R-Q) — governs on any conflict with older Spec 122 prose.
7. **Spec 122** (§1.4 write_discipline, §1.5 staleness, §1.10 archetype/required-fields, §5.1–§5.5 step contract, §6.4a the centroid gap section, §8.2 pilot table) — the architecture.
8. **Spec 123** (§2 phases/gates, §3 PIN-vs-FIX incl. §3.2's compute_centroids worked example, §6 gates G0–G9, §7 nine-commit procedure).
9. Pilot 5's plan (`.cursor/pilot5_link_parcel_addresses_active_task.md`, archived this session) as template; carried items: the shared phase-scaffold helper across `runLinkPhase`/`runCascadePhase`/`runMaterializePhase` (LOW, filed at pilot 5 Fold B) — **not applicable to this pilot's own diff** (BACKFILL's write is a single set-based UPDATE, no phase-runner fork needed at all — see §0.7); R-B's runtime crashed/stuck-`running` reader — still OPEN, carried again (this step has no destructive-retraction write target, so it does not close R-B either — same disposition as pilot 5).
10. `tasks/lessons.md`, `scripts/CLAUDE.md` (Spec 47 §R1–R12 skeleton), `docs/specs/00_engineering_standards.md` §11.

### 0.2 File metrics — `scripts/compute-centroids.js`, measured this session

| Metric | Value | Grounds |
|---|---|---|
| Lines | **226** | `wc -l` |
| `pipeline.run(` | **1**, at module scope, **line 60** — no `require.main === module` guard, no `module.exports` anywhere in the file | `grep -n "pipeline.run(\|module.exports\|require.main"` — exactly matches Spec 121 §4.3's own citation `compute-centroids.js:60` for claim #86 ("a declaration is never executable") |
| `try` / `catch` / `finally` | **1 / 1 / 0** | the JS-fallback batch loop's own per-row JSON.parse guard (`:141-146`) |
| `pool.query`/`client.query` | **6** | 1 count query, 1 PostGIS-extension check, 1 PostGIS UPDATE, 1 PostGIS failed-count query, 1 JS-fallback SELECT (looped), 1 JS-fallback UPDATE (inside `withTransaction`) |
| `Date.now(` / `new Date(` | **2 / 0** | both elapsed-time only (`startTime`, `durationMs`) — no DB timestamp column exists on this write target at all (Spec 47 §A.5 row: *"Writes Timestamps? NO"*), so the R3.5 DB-clock rule is structurally N/A here, not merely satisfied |
| `process.env` / `process.argv` | **0 / 0** | no env-var reads, no CLI flags — confirmed by grep; `manifest.json`'s `supports_full:false`/`supports_dry_run:false` are **both TRUE-to-the-code** (a clean node, pilot 5 finding-5 class) |
| `emitSummary` / `emitMeta` | **2 / 2** | one pair on the zero-work early return (`:79-90`), one pair on the real-run completion (`:191-215`) — perfectly matched, no orphan emit site |
| `ADVISORY_LOCK_ID` | **99** (module const, `:58`) | Spec 47 §A.5 registry row: `| 99 | scripts/compute-centroids.js | 5 — Maintenance | NO |` — unique (grep for `ADVISORY_LOCK_ID\s*=\s*99` across `scripts/` returns exactly this one file) |
| `console.*` | **0** | fully migrated to `pipeline.log.*` at the 2026-03-15 fence (§0.5) |
| `throw` | **0** | no thrown errors anywhere — malformed geometry is counted (`failed++`) and skipped, never halts the run |
| Declared/consumed `logic_variables` | **0** | `grep -c "logic_variable\|getLogicVariable\|control-panel" scripts/compute-centroids.js` → 0; `SELECT COUNT(*) FROM logic_variables WHERE variable_key ILIKE '%centroid%'` → 1 row, and it is `link_massing_centroid_confidence` (pilot 3's own variable) — **zero rows belong to this step** |

### 0.3 Manifest / chain wiring — measured, not the header comment trusted blind

| Field | Value | Grounds |
|---|---|---|
| `manifest.json:53` | `"compute_centroids": {"file":"scripts/compute-centroids.js","supports_full":false,"supports_dry_run":false,"telemetry_tables":["parcels"],"telemetry_null_cols":{"parcels":["centroid_lat","centroid_lng"]}}` | live file |
| Chain membership | **`sources` ONLY, index 9 of 28** (0-based `Array.indexOf`) | `node -e` over `manifest.json.chains` — **the script's own SPEC LINK header citing `41_chain_permits.md` is stale/wrong** (finding 6, §0.6) — `compute_centroids` is never a member of the `permits` chain |
| `chain_args` | none declared for this step | `manifest.json.scripts.compute_centroids` has no `chain_args` key |
| `converted.json` (Spec 122 §5.1 enforcement scope) | **5 entries today**: `assert-schema.js`, `load-ravines.js`, `link-massing.js`, `link-wsib.js`, `link-parcel-addresses.js`. `pending: []`. `compute-centroids.js` in neither | live file, this session |
| `grandfathered.json` | 2 entries (`link_massing` E1, `link_parcel_addresses` D-class guard) | live file |

### 0.4 The centroid DEFECT — Spec 121 §4.3 / Spec 123 §3.2's worked example — **CLOSED by migration 245**

**Spec 121 §4.3 and Spec 123 §3.2 both name `compute_centroids`'s missing invalidator as THE worked example of a DEFECT**, and Spec 123 §3.2 goes further: *"So the procedure's own worked example forces a plan change... P1 fixes the centroid invalidator BEFORE the programme starts."* **P1 already landed** — migration `245_parcels_centroid_geom_invalidation.sql`, applied.

Measured this session against the local authoritative DB (`current_database()=postgres`, port 54322):

| Check | Query | Result |
|---|---|---|
| Migration applied | `SELECT filename FROM schema_migrations WHERE filename LIKE '24%'` | `245_parcels_centroid_geom_invalidation.sql` present, alongside 240–244 |
| Trigger fires (both columns) | migration's own red-first proof, `migration-245-centroid-invalidation.db.test.ts` §① | a geometry move NULLs both `centroid_lat`/`centroid_lng` (case ①), fires on either column alone in the SET list (case ①ii/iii), survives the `CREATE OR REPLACE` alongside 242's two prior arms (case ②), is a no-op on a same-value re-SET (case ③, the `IS DISTINCT FROM` guard), and `compute_centroids` genuinely refills an invalidated row from the NEW geometry on its next run (case ④, spawns the real script) |
| Current live state | `SELECT COUNT(*) FROM parcels WHERE geom IS NOT NULL AND centroid_lat IS NULL` | **0** of 486,530 |
| Current live state | `SELECT COUNT(*) FROM parcels` | **486,530** — 0 NULL `geometry`, 0 rows where `geometry IS NOT NULL AND geom IS NULL` (the PostGIS conversion is 100% complete) |
| Followups register | `docs/reports/review_followups.md:38` | *"[the] three `*_dataset_version_when_enriched` stamps have NO trigger invalidator... **Identical class to the centroid gap migration 245 just closed**"* — the register itself states CLOSED, in a DIFFERENT (still-open) entry's own text |
| Followups register | `docs/reports/review_followups.md:2970` | the original HIGH filing, now superseded by 245's landing |

**Consequence for this pilot:** the fix is **already shipped as a separate, prior, authorized WF3** (the sanctioned exception to Spec 123 §1.1, exactly as §3.2 describes). **Pilot 6's own conversion commit carries ZERO behaviour change** — it converts the ALREADY-CORRECT script (post-245) into the frozen shape, verbatim. There is no `fix(compute_centroids): invalidate centroid on geometry change` commit left to write inside this pilot — that commit already landed as migration 245.

⚠️ **Stale prose found, filed for the OTHER agent (Spec 122/123 owner) to fold — not edited here:**
- **Spec 122 §6.4a** (*"THE CENTROID GAP — the fourth field nobody asked about"*) still reads, in its live prose, *"nothing NULLs it on a geometry change"* and *"the gap is real and still unfiled-until-today"* — both now **factually false**; 245 closed it. §6.4a's own closing line — *"This is the single best argument in this spec for the ledger... It also needs filing to `review_followups.md` today"* — is **already done** (review_followups:2970, closed at review_followups:38).
- **Spec 123 §3.2** itself says *"P1 fixes the centroid invalidator BEFORE the programme starts"* as a forward-looking plan statement; it should read as **past tense / DONE** now that 245 is applied.
- **`scripts/lib/compute/link-massing.js:107-109`** (a DIFFERENT step's file, out of this pilot's write scope): the `UNLINKED_ONLY` comment says *"Recorded in the descriptor's limitations[] against the open review_followups finding that parcels.centroid_lat/lng has no invalidator"* — **also now stale**. Flagged here as a note for whichever pilot next touches `link_massing`'s descriptor (not this pilot's file to edit).
- **`docs/specs/01-pipeline/122_pipeline_step_optimization.md:1072`**'s §8.2 pilot table row for `compute_centroids` reads *"⚠️ forced — **and it is the centroid defect itself**"* — this is the line the operator asked to be given here so it can be folded; see §0.9 below for the proposed replacement text.

### 0.5 Git archaeology — 16 commits, `git log --all --follow`

| Metric | Value |
|---|---|
| Total commits | **16** (`ed12787a`, 2026-02-25, origin → `da6db77a`, 2026-04-22, latest) |
| `fix(` commits | **7** (`90e3d0f8`, `3c3e6f84`, `2b6eb35a`, `98910817`, `5baaed5a`, `e4765619`, `8287291e`) = **43.75% fix density** |
| `feat(` | 5 · `chore(` | 2 · `refactor(` | 1 · unprefixed origin | 1 |
| `Severity:`/`Lesson-routing:` footers | **0** | same instrument-limit class noted at pilots 3–5 (footers are rare on this era of commits) |
| ⚠️ **THE load-bearing fence** | **`80ac3469`** (2026-03-15, `feat(28_data_quality_dashboard): compute-centroids.js — infinite loop fix + bulk unnest + observability`) | Commit message, verbatim: *"Fix infinite loop: cursor pagination (`id > lastId`) replaces `centroid_lat IS NULL` filter which refetched malformed geometries forever."* **This is the single most important historical fence in this file.** The JS-fallback loop's `WHERE geometry IS NOT NULL AND centroid_lat IS NULL AND id > $1 ORDER BY id LIMIT $2` / `lastId = batch.rows[batch.rows.length-1].id` (`:117-131`) is NOT an arbitrary pagination choice — a naive re-scan on `centroid_lat IS NULL` alone re-fetches a permanently-unparseable geometry (`computeCentroid()` returns `null`, the row is counted `failed` but its `centroid_lat` stays NULL forever) on every batch, infinitely. **The differential/compute-extraction (commit 7) MUST preserve the cursor-pagination shape verbatim** — this is this pilot's #1 Regression Guardian fence, opened as `CC-D1` at commit 2 |
| Other commits, briefly | `0ef23550` (2026-03-09) — Pipeline SDK extraction, 21-script migration, brought this step onto `pipeline.run`/`withAdvisoryLock`. `7c75e92e` (2026-04-02) — PostGIS spatial offloading; this is where the **fast path** (`ST_Centroid`/`ST_Y`/`ST_X`, `:100-108`) was added, turning the JS loop into a fallback that a PostGIS-equipped DB (this one, and production) never takes. `90e3d0f8`/`3c3e6f84` — cross-script safe-math/advisory-lock hardening waves, incidental to this file. `da6db77a`/`f69b561d` — SPEC LINK path repairs (the current header's `41_chain_permits.md` citation is a SURVIVOR of these repairs, not a fresh error — worth noting it was touched twice and still ended up wrong, finding 6) |

### 0.6 The six findings (measured, not inherited)

1. **⚠️ The historical DEFECT this whole pilot exists to convert around is already CLOSED — pilot 6 carries zero behaviour change.** Migration 245 (applied, red-first proven, §0.4) already fixed the invalidation gap Spec 121 §4.3 and Spec 123 §3.2 both singled out as the worked example. This pilot's differential must be a genuine no-op diff against the POST-245 script — there is no defect left to pin.
2. **The JS fallback is very likely dead weight, same shape as pilot 3's `link_massing_grid_degrees` precedent (ruling A-8).** PostGIS is present locally and in production (`pgisCheck` at `:94` always resolves true on this DB), so the JS batch loop (`:116-186`, ~70 lines, cursor-paginated, per-batch transactional) has almost certainly taken **0 of the 20 recorded runs**. Unlike pilot 3, this fallback is NOT inert — it is the ONLY place the infinite-loop fence (finding above) and `pipeline.BATCH_SIZE` actually matter, so ~~"retire" here means "declare it `knowingly-retired` dead compute, preserved verbatim under a `guards.requires` PostGIS precondition, never executed" rather than "delete the fence" — an ASK for this pilot (A-1 below), not a foregone ruling.~~ **RULED at Fold C (2026-08-29, Integration S-1): A-1 = (a), retire the branch entirely** under `guards.requires: postgis` / `on_missing: fail`. The `80ac3469` fence is deleted WITH the branch — its evidence trail is preserved as documentation (`notes.json` + git history, `knowingly-retired`), not as live code. No longer an open Ask.
3. **`compute_centroids` has run 20 times total; only ONE run (2026-03-10, 530 rows) ever did real work — every recorded run since 2026-06-10 (~~7 runs~~ **Fold D: 8 runs**, through 2026-07-08) reports `records_total:0`, the zero-work early-return path.** `SELECT started_at, records_total, records_meta->'audit_table'->>'verdict' FROM pipeline_runs WHERE pipeline='sources:compute_centroids' ORDER BY started_at DESC` — matches the current live state (0 NULL centroids, §0.4): the step has been a stable, correctly-behaving no-op for months, which is expected given 245's own header measurement (*"of 486,530 parcels, 0 carry a centroid that deviates by more than 5cm"*) and simply means this step's golden capture (commit 5) will legitimately be the SKIPPED-summary shape, not the compute path — both shapes need a capture (Spec 122 R-C).
4. **Two undeclared literal verdict thresholds, zero registered `logic_variables` rows for this step.** `failed_geometries` WARN threshold `== 0` (`:197`) and `compute_rate` WARN threshold `>= 98%` (`:198`, `:200`) are both bare numeric literals — Spec 124 Rule 3 violation. `pipeline.BATCH_SIZE = 1000` (the shared `lib/pipeline.js:702` constant, used only by the JS fallback, finding 2) is a THIRD candidate but is shared library-wide infra, not this step's own literal — flagged as an Ask (A-2), not a foregone T-item, because externalizing it per-step would fork a shared constant that 20+ other scripts also read unqualified.
5. **The script's own SPEC LINK header cites the WRONG chain spec.** `compute-centroids.js:16` reads `SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md` — `compute_centroids` has never been a member of the `permits` chain (manifest: `sources` only, index 9 of 28, §0.3). Two prior spec-link-repair commits (`f69b561d`, `da6db77a`) touched cross-script SPEC LINK headers and did not catch this one. Correct citation: `43_chain_sources.md` (§Step Breakdown row 9, `:169-176`) — fixed at commit 7 as part of the descriptor/header work, zero behaviour change.
6. **No precondition guard exists at all — confirmed independently, matching `review_followups.md:2970`'s own prior measurement.** `grep -c "assertPreconditions\|no successful" scripts/compute-centroids.js` → 0. The step will run against an empty/malformed `parcels` table and simply report `records_total:0, verdict:PASS` (the `totalParcels===0` early return, `:79`) — benign by construction (not a HALT-worthy gap), but it means BACKFILL's `guards.requires` (if declared) has nothing upstream to name; `parcels` existing is implicit, never asserted. Noted for G6 classification (~~INCIDENTAL~~ **Fold D G3/G6 vocabulary: `knowingly-retired`-adjacent — nothing currently depends on a HALT here, but `INCIDENTAL` is not a valid disposition** — see Fold D below); not an Ask.

### 0.7 Write-discipline re-derivation (Spec 124 Rule 3 / Spec 122 §1.4 — measured, not ported)

**1 write target, 1 write statement (PostGIS path) with a JS-fallback shadow of the same target (finding 2).**

| Field | Value | Grounds |
|---|---|---|
| `table` | `parcels` | `:100-106` |
| `key` | `id` (implicit — no explicit key column in the UPDATE; the WHERE clause IS the whole predicate) | PostGIS path has no `key` in the upsert sense at all — a plain conditional `UPDATE ... WHERE` |
| `columns` | `centroid_lat`, `centroid_lng` | `:101-102` |
| `class` | **E `write_once_backfill`** — the frozen enum's literal name for this exact mechanic (`step.schema.json:208`, `x-class-letters.write_once_backfill:"E"`) — matches Spec 122 §8.2's own table row for `compute_centroids` ("Write class: E") **exactly**, no re-derivation needed, no mislabel found (contrast pilot 5's D-class re-derivation, which WAS a correction) | live schema |
| `guard` | `none` — genuinely nothing to guard against: once `centroid_lat`/`centroid_lng` are non-NULL, this step never revisits the row (the WHERE clause `centroid_lat IS NULL` makes an already-filled row permanently ineligible for THIS step; migration 245's trigger, not this step, is what makes it eligible again) | `:105` |
| `guard_why` | *"The WHERE clause is the scope, not a value-change guard — this step never re-derives an already-filled centroid; only migration 245's geometry-change trigger (a different write path) makes a row eligible again by NULLing it first."* | this session |
| `scope` | `"geom IS NOT NULL AND centroid_lat IS NULL"` (PostGIS path, `:105-106`) — mirrored in the JS fallback as `geometry IS NOT NULL AND centroid_lat IS NULL AND id > $1` (the cursor-paginated form of the same scope, finding-fence §0.5) | `:105`, `:117-119` |
| `retract` | `none` — no DELETE anywhere in the file (`grep -c DELETE` → 0) | measured |
| `replay` | `idempotent_upsert` — closest frozen-enum fit: re-running this step never touches an already-filled row and is safe to run any number of times (`idempotent_rerun: zero_writes` once the corpus is stable, matching the ~~7/7~~ **Fold D: 8/8** zero-work runs since 2026-06-10) | `idempotent_rerun` measured below |
| **Grandfathering (Rule 9)** | `guard:"none"` is banned for NEW steps but legal for an EXISTING step with a ledger entry (Rule 9's "an existing step must be able to declare its truth") — **commit 7 needs a `grandfathered.json` entry**, mirroring `link_massing`'s E1 and `link_parcel_addresses`'s D-class entries exactly (same mechanism, `assertGrandfathered` reads only `write_discipline.guard`, not `.class` — Fold A / pilot 5 correction, confirmed applicable here too) | `scripts/steps/_schema/grandfathered.json`, `validate.js:165-186`'s `GUARD_PATH` read |
| `idempotent_rerun` | `zero_writes` — measured directly: ~~7~~ **Fold D: 8** of the 20 recorded runs (all since 2026-06-10) show `records_total:0, records_updated:0` on a stable corpus (§0.6 finding 3) | `pipeline_runs` |
| `txn_scope` | ~~⚠️ **SPLIT BY BRANCH, an Ask (A-3 below).** PostGIS path: **`statement`** — a single bare `pool.query(UPDATE...)`, no explicit `withTransaction` wrapper (`:100-108`). JS fallback: **`batch`** — each `BATCH_SIZE`-row batch runs inside its own `pipeline.withTransaction` (`:159-171`). The frozen schema declares `txn_scope` ONCE per write target, not once per code branch — this pilot must declare the value for the branch that ACTUALLY RUNS (PostGIS, `statement`) and record the JS fallback's differing shape as a limitation/note, not silently pick one and hide the other~~ **RESOLVED at Fold C (2026-08-29):** A-1 RULED (a) retires the JS fallback branch entirely (§0.6 finding 2) — only the PostGIS path (`statement`, `:100-108`) remains. Declare `txn_scope: "statement"` outright; no `notes.json` divergence to record | `:100-108` |
| `outputs.invalidates` (B-3, Fold C, Integration) | `minItems: 1` required for class E — declare `[{table:"parcels", column:"centroid_lat"/"centroid_lng", when:"migration 245 trigger nulls on geom UPDATE (IS DISTINCT FROM)"}]`; documents 245's mechanism as it bears on this step's eligibility scope, not a new staleness detector (245's trigger, not this step, invalidates) | `step.schema.json:798-814` |

### 0.8 Reality-Check ask table (measured live, this session)

| Question | What "implausible" would look like | Measured |
|---|---|---|
| Are any parcels' `geom IS NOT NULL AND centroid_lat IS NULL` right now (i.e. is there current backlog)? | A nonzero count post-245 would mean either the trigger isn't firing or a bulk geometry rewrite happened with no `compute_centroids` re-run since | **0 of 486,530** — no backlog |
| Does every centroid fall INSIDE its own parcel polygon (the classic centroid-outside-lot bug)? | A nonzero count on a normal (non-concave) lot population would suggest geometry contamination | `SELECT COUNT(*) FROM parcels WHERE geom IS NOT NULL AND centroid_lat IS NOT NULL AND NOT ST_Contains(geom, ST_SetSRID(ST_MakePoint(centroid_lng, centroid_lat),4326))` → **3,626 (0.75%)** — **plausible and PRE-EXISTING**: this is the well-documented arithmetic-mean-centroid-on-a-concave-polygon behaviour (`review_followups.md:194,330,542,2474`; Spec 59's own R2.5 ruling: *"for highly concave polygons the centroid can lie outside the polygon... functional behavior is correct"*). Not a new finding, not this pilot's defect to fix — ~~PIN as-is (Spec 123 §3, question 1: is it OBSERVED? `link-parcels.js`'s Tier-3 fallback uses distance-to-permit-point, not containment, so 3,626 out-of-polygon centroids do not by themselves break its semantics — INCIDENTAL to this conversion)~~ **Fold C R-1 (2026-08-29): NOT merely incidental — 3,130 of the 3,626 land inside a DIFFERENT parcel, and cross-joining to `permit_parcels` shows 276 of 494 `spatial`-tier links are mis-attributed as a result (`link-parcels.js:411-426` nearest-centroid). RULED: PIN for this pilot** (zero-behaviour-change scope; predates migration 245) **+ HIGH followup filed against `link_parcels.js`.** Disposition is `pinned-with-followup`, not `INCIDENTAL` (Rule 13 vocabulary) |
| How different is `ST_Centroid` (what this step computes) from `ST_PointOnSurface` (guaranteed-inside alternative)? | A near-universal large deviation would argue for switching algorithms | `SELECT COUNT(*) FROM parcels WHERE ... ST_DistanceSphere(centroid_point, ST_PointOnSurface(geom)) > 1.0` → **298,021 (61.3%)** differ by >1m — expected and documented as the known, accepted Spec 59 tradeoff (§2474), not a defect; NOT this pilot's decision to revisit (out of scope — algorithm choice is Spec 59's ruling, not Spec 122's conversion) |
| Is the JS fallback ever actually exercised in production? | If it runs 0 of N times, its own correctness is unverified by any recent execution | Cannot be measured directly (no per-branch telemetry in `records_meta`) — inferred from `hasPostGIS` always resolving true locally and PostGIS being a standing production dependency across the whole `sources` chain (7 other scripts in the 2026-04-02 PostGIS-offload commit alone). ~~Flagged as Ask A-1; a `hasPostGIS: false/true` INFO row is a candidate cheap fix at commit 8 (peel: verdict/audit) regardless of A-1's outcome~~ **MOOT at Fold C (2026-08-29): A-1 RULED (a) retire — the branch is deleted, so its exercise rate is no longer a live question** |
| Does the standing `parcel-sanity-audit.js` check centroid containment or centroid-vs-point-on-surface deviation? | A zero-coverage blind spot, same shape as pilot 5's finding | Not checked this session — filed as a LOW followup candidate, consistent with pilot 5's own "0 bridge checks" finding for a different table; out of this pilot's PH-0 budget |

### 0.9 The §8.2 ruling line — for the Spec 122/123 owner to fold

**Current text, `docs/specs/01-pipeline/122_pipeline_step_optimization.md:1072`:**
> `| **BACKFILL** | **1** | `compute_centroids` | ⚠️ forced — **and it is the centroid defect itself** | E |`

**Proposed replacement (measured 2026-08-29, this pilot):**
> `| **BACKFILL** | **1** | `compute_centroids` | ⚠️ forced — **the centroid defect (§6.4a) is CLOSED by migration 245, applied 2026-08-23; this pilot's conversion carries zero behaviour change** — the JS-fallback dead-weight Ask (link_massing A-8 precedent) and the stale `41_chain_permits.md` header citation are its two live findings | E |`

Also propose, for §6.4a's own prose (not this pilot's file, folded by the owner): replace *"nothing NULLs it on a geometry change"* / *"the gap is real and still unfiled-until-today"* with a **CLOSED, migration 245** annotation in the same style as §6.4's other retracted/corrected paragraphs (§6.4a already has one retraction block from 2026-08-23; this would be a second, dated 2026-08-29).

---

## Fold C (2026-08-29, PLAN panel Integration + Reality-Check, executed)

Two of the five PLAN-altitude seats (Spec 08 §6.4) executed against the live tree/DB this session, ahead of the remaining Ground-truth / Regression Guardian / DeepSeek passes. Full ruling detail lives in `.cursor/pilot6_compute_centroids_active_task.md`'s own Fold C section (source of record for dispositions); this section carries the grounding evidence.

### Integration — BLOCKING

| ID | Finding | Grounds | Ruling |
|---|---|---|---|
| **B-1** | Class E `write_once_backfill` is **unimplemented** in `scripts/lib/step/write.js` | `SET_BASED_CLASSES` (`:63`) = `{set_based_scoped, set_based_unscoped, set_based_null_retract}` — no `write_once_backfill` member; default branch is a bound-values upsert; `sqlLiteral` (`:188`) refuses server-side expressions | **LG-20**: new `write_once_backfill` class branch (descriptive, `generated_by:"compute"`, no `clear_sql`) + executor `executeBackfillUpdate` — keyset `UPDATE ... SET <cols> = <server expression over the row> WHERE <scope> AND id > $1 ORDER BY id LIMIT $2`, UPDATE-only assertion, ~~`IS DISTINCT FROM` guard on written columns~~ **Fold D fix: `compute_centroids` declares `guard:"none"` (Rule-9 grandfathered, idempotent BY SCOPE — vacuous on a NULL-scoped row); `executeBackfillUpdate` MAY offer `IS DISTINCT FROM` as an OPTIONAL generic capability for future backfill targets, not declared here** |
| **B-2** | No write runs outside a phase runner today; this would be the 4th duplication of the guards→prior/gate→pre_write→RUN_AT→post shape | `runLinkPhase` (pilot 3), `runCascadePhase`/`runMaterializePhase` (pilot 5) each independently implement this shape | **A-4 RULED**, within pre-authorization: thin `runBackfillPhase` (`execution.shape:"backfill"`) — **ACCEPT at Fold D** (thin fork, per the `isCascadeStep`/`isMaterializeStep` precedent). ~~**+ LG-21** `runPhaseScaffold(descriptor, phaseBody)` (the pilot-5 §R carried item), with the 3 existing phase runners refactored onto it ONLY if golden hashes + suites stay identical (prove; else leave + file)~~ **Fold D: LG-21 DEFERRED to a dedicated library WF after pilot 8**, not shipped this pilot; the pilot-5 §R carried item is re-carried, not closed |
| **B-3** | `outputs.invalidates` requires `minItems: 1` for class E | `step.schema.json:798-814` | Declare `[{table:"parcels", column:"centroid_lat"/"centroid_lng", when:"migration 245 trigger nulls on geom UPDATE (IS DISTINCT FROM)"}]` — documents 245's mechanism as it bears on this step's scope; NOT a new staleness detector (245's trigger, not this step, invalidates) |

### Integration — SHOULD-FIX

| ID | Finding | Grounds | Action |
|---|---|---|---|
| **S-1** | A-1 RULED (a): retire the JS fallback | Same shape as `link_massing` A-8 precedent | `guards.requires: postgis`, `on_missing: fail`; the `80ac3469` cursor-pagination fence (§0.5, §0.6 finding 5) is **deleted with the branch** — recorded `knowingly-retired` with the commit-message evidence preserved in `notes.json` + git history |
| **S-2** | Verdict parallel boolean | `compute-centroids.js:214-215`, measured this session: `const hasWarns = failed > 0 \|\| safeParseFloat(computeRate, 'compute_rate') < 98;` then `verdict: hasWarns ? 'WARN' : 'PASS'` (`:221`) — a computed boolean parallel to, not derived from, `auditRows` | Peel 8b, Rule 10: verdict must derive FROM `auditRows` |
| **S-3** | New consumer G10 | `link-coa-to-parcels.js` — `grep -n "centroid_lat\|centroid_lng"` hits at `:284,407,443,462,499-500,715`; header comment `:6` states *"(b) lat/lng back-fill into coa_applications from parcels.centroid_lat/centroid_lng"* | Add as consumer G10 — reads `centroid_lat`/`centroid_lng`, **back-fills** `coa_applications.lat/lng` (a write-propagating consumer, unlike G5/G6) |

### Notes (Integration)

Key `"id"` required. Golden projection auto-derived `{id, centroid_lat, centroid_lng}`. `staleness`: all 9 keys present, degenerate `"none"` where applicable. The cursor-pagination fence's evidence trail lives in `checks[].why`/`notes.json`, **not** `staleness.checkpoint`. `R-B`/`R-P`: **N/A with why** — no destructive-retraction write target, no crash-recovery-relevant write shape.

### Rule 13 pre-staging (commit-9 gate)

G0 heading `"PH-0 — boundary freeze"` · G1/G3 heading `"PH-3"` + closed disposition vocabulary (`INCIDENTAL` is **not** a disposition — use `knowingly-retired` / `preserved-in-*` / `encoded-as-*`) · G6: every `CC-D*` row reaches CLOSED/PIN before commit 9 · G7: `violations.test.ts` + a literal `"RED"` excerpt + locks ≥ fences · G8: captures land (incl. the LG-20 path) · G9: `"§R Reflection"` with BOTH a `"LOW-CONFIDENCE"` table and a `"RECURRING/STANDARD-SHAPING"` table.

### Reality-Check — all numbers reproduced this session

| ID | Query / method | Result | Ruling |
|---|---|---|---|
| **R-1** | Of the 3,626 out-of-polygon centroids (§0.8), how many fall inside a DIFFERENT parcel? `ST_Contains` against every other parcel's `geom` for the 3,626-row set, cross-joined to `permit_parcels` tier=`spatial` links | **3,130 of 3,626** land inside a different parcel. Of **494** `spatial`-tier `permit_parcels` links pointing at a drifted parcel, **276** have the permit's own point actually inside another specific parcel — a mis-attribution signature traced to `link-parcels.js:411-426`'s nearest-centroid join | **BLOCKING-as-finding, RULED PIN for pilot 6** (zero-behaviour-change scope; predates migration 245). **HIGH followup filed**: *"Tier-3 nearest-centroid join should use `ST_PointOnSurface` or a containment check; 276 candidate mis-links measured 2026-08-29."* Pin invariants: `centroid_null_count=0`, `geom_not_null_geometry_null_count=0`, `outside_polygon_count=3626`, `pointonsurface_gt_1m_count=298021`, **NEW** `centroid_in_neighbour_parcel_count=3130` (comment naming the 276-link exposure). **Fold D: `CC-D2` opened at commit 2 (status PIN) so this reaches G6.** `invariants.json`'s `centroid_in_neighbour_parcel_count` MUST use a materialized CTE + `CROSS JOIN LATERAL (... LIMIT 1)` — a naive correlated `EXISTS` over the 3,626-row set ran 6+ minutes with no GiST use; see Fold D for the query shape |
| **R-2** | `link-coa-to-parcels.js` exposure (S-3's new consumer) | Not measured this session — no query run against `coa_applications.lat/lng` propagation | Followup filed (unmeasured exposure, tracked with R-1) |
| **R-3** | Does `enrich-ravines.js` (or any ravines-path compute file) read stored centroids? | `grep -rn "centroid_lat\|centroid_lng" scripts/` → 11 files, **none** in the ravines path (`link-massing.descriptor.json`, `manifest.json`, `link-massing.notes.json`, `scripts/lib/compute/link-massing.js`, `massing-coverage-analysis.js`, `assert-global-coverage.js`, `load-massing.js`, `lineage-meta-snapshot.json`, `link-coa-to-parcels.js`, `link-parcels.js`, `compute-centroids.js`) | **Struck from the consumer set** — `enrich_ravines` does not read stored centroids |

### Consequence for A-2/A-3

A-1(a)'s retirement of the JS fallback (S-1) leaves `pipeline.BATCH_SIZE` (Ask A-2) with no remaining reader in this file — **MOOT, closed not deferred**. It also leaves exactly one write branch (PostGIS), so `txn_scope` (Ask A-3) is **RESOLVED**: declare `"statement"` outright, no divergence to record in `notes.json`.

---

## Fold D (2026-08-29, fold-validation of Fold C — grounder CONFIRMED all except: runs since 2026-06-10 = 8 not 7; Cross-read Adversary verdicts below)

Full ruling detail lives in `.cursor/pilot6_compute_centroids_active_task.md`'s own Fold D section (source of record for dispositions); this section carries the grounding evidence, mirroring the Fold C convention above.

### Grounder — fold-validation of Fold C (Spec 08 §11.2)

Re-executed every query/grep Fold C's Integration and Reality-Check passes relied on.

| Fold C claim | Re-execution | Verdict |
|---|---|---|
| B-1 (`write_once_backfill` unimplemented) | `SET_BASED_CLASSES` at `write.js:63` re-read | **CONFIRMED** |
| B-3 (`minItems:1` for class E) | `step.schema.json:798-814` re-read | **CONFIRMED** |
| S-1 (A-1(a) retire) | `compute-centroids.js:94-115` re-read | **CONFIRMED** |
| S-2 (`hasWarns` parallel boolean) | `compute-centroids.js:214-221` re-read | **CONFIRMED** |
| S-3 (`link-coa-to-parcels.js` consumer) | `:284,407,443,462,499-500,715` re-grepped | **CONFIRMED** |
| R-1 (3,130/3,626; 276/494) | `ST_Contains` cross-join re-run | **CONFIRMED** |
| R-2 (unmeasured) | no query exists yet | **CONFIRMED unmeasured** |
| R-3 (0 ravines-path hits) | `grep -rn "centroid_lat\|centroid_lng" scripts/` re-run | **CONFIRMED** |
| Finding 3 / §0.7 `idempotent_rerun` ("7 runs since 2026-06-10") | `SELECT COUNT(*) FROM pipeline_runs WHERE pipeline='sources:compute_centroids' AND started_at >= '2026-06-10' AND records_total=0` re-run | **CORRECTED: 8, not 7.** The 20-total and single-real-work-run (2026-03-10) figures are unaffected — only this sub-count was off by one |

### Cross-read Adversary — pairwise collision check across Fold C's own dispositions

1. **A-1(a) — ACCEPT.** Evidence: the PostGIS branch (`compute-centroids.js:98-115`) is ONE `UPDATE ... RETURNING id` with no loop; the `80ac3469` cursor-pagination fence protected ONLY the JS fallback (`:116-185`) — it has no PostGIS-branch analogue to preserve. Retiring the fallback branch necessarily retires the fence with it; the fence's disposition is `knowingly-retired` on this exact evidence. `CC-D1` → PIN/CLOSED accordingly (Fold C's ruling unchanged, evidence now on record).
2. **A-4 — AMENDED.** `runBackfillPhase` — **ACCEPT** (a thin fork, per the `isCascadeStep`/`isMaterializeStep` "FORKED, NOT A BRANCH" precedent). **LG-21 shared scaffold `runPhaseScaffold` — DEFERRED** to a dedicated library WF after pilot 8, not shipped inside this pilot: fork-over-share has been chosen TWICE already with measured reasons (pilot 3, pilot 5), and a genuine proof set that a shared scaffold stays byte-identical across `runLinkPhase`/`runCascadePhase`/`runMaterializePhase` would require forcing a `link_wsib` FULL run (~20–30 min) this pilot has no standing reason to spend. The pilot-5 §R carried item is **re-carried explicitly** as "library WF, not a pilot item." **Strike the LG-21 refactor from commit 7** — commit 7 ships LG-20 + `runBackfillPhase` only.
3. **LG-20 guard wording — fixes Fold C's B-1 sentence.** `compute_centroids` declares `guard: "none"` (Rule-9 grandfathered: idempotent BY SCOPE — the `centroid_lat IS NULL` scope self-excludes already-filled rows; an `IS DISTINCT FROM` guard on a NULL-scoped row is vacuous). `executeBackfillUpdate` (LG-20) MAY offer `IS DISTINCT FROM` as an OPTIONAL generic capability for FUTURE backfill targets that need a value-change guard — it is NOT declared for `compute_centroids` itself.
4. **R-1 mechanics — open `CC-D2`.** `CC-D2` opens at commit 2 (status **PIN**) for the 3,130/276 mis-attribution finding, so it reaches G6's classification pass. `invariants.json`'s `parcels_centroid_in_neighbour_parcel_count` (3,130) MUST be computed via a materialized CTE + `CROSS JOIN LATERAL (... LIMIT 1)` — a naive correlated `EXISTS` over the 3,626-row set against 486,530 parcels ran 6+ minutes with no GiST index use. Query shape:
   ```sql
   WITH drifted AS (
     SELECT id, geom, ST_SetSRID(ST_MakePoint(centroid_lng, centroid_lat), 4326) AS c
     FROM parcels
     WHERE geom IS NOT NULL AND centroid_lat IS NOT NULL
       AND NOT ST_Contains(geom, ST_SetSRID(ST_MakePoint(centroid_lng, centroid_lat), 4326))
   )
   SELECT COUNT(*) FROM drifted d
   CROSS JOIN LATERAL (
     SELECT p2.id FROM parcels p2
     WHERE ST_Contains(p2.geom, d.c) AND p2.id <> d.id
     LIMIT 1
   ) hit;
   ```
   The HIGH followup against `link_parcels.js` stays filed as Fold C recorded it.
5. **G3 vocabulary.** Safe-math hardening commits (`90e3d0f8`, `3c3e6f84`) → disposition **`preserved-in-compute`** (their helpers are live at `:67`/`:193`/`:198`). Commits leaving nothing observable in the current file → **`knowingly-retired`** with qualifier *"superseded by the 2026-08-29 rewrite, never itself load-bearing."* **`INCIDENTAL` never appears as a disposition** — every occurrence of the word as a G3/G6 disposition in this report is struck at its own location above.
6. **Zero-behaviour-change diff buckets — named.** (1) JS fallback removal, (2) `hasWarns` → row-derived verdict (same predicate, no semantic change), (3) SPEC LINK header correction, (4) module guard (`require.main`/`module.exports` added). This holds **wherever PostGIS resolves true** — `guards.requires: postgis`, `on_missing: fail` declares the rest (a DB with no PostGIS extension now HALTS rather than silently falling back, which IS a behaviour change on that untested branch, correctly declared rather than hidden, not swept into "zero behaviour change").
7. **Runs since 2026-06-10 = 8, not 7.** Every "7 runs" citation in §0.6 finding 3 and §0.7's write-discipline table is corrected to 8 at its own location above. Total run count (20) and the single real-work run (2026-03-10) are unaffected.

### Operator-rulings block — Fold D correction

"none blocking — A-1(a), A-4 (`runBackfillPhase` ACCEPT; **LG-21 shared scaffold DEFERRED** to a post-pilot-8 library WF, not this pilot) ruled within pre-authorization; R-1 PIN + `CC-D2` (opened commit 2, status PIN) + HIGH followup (`link_parcels.js`)."

---

*(§1–§9, the promoted full PH-0..PH-8 passes, land at commits 1–9 per Spec 123 §7's own procedure — this stub discharges the plan's "Full grounding detail" citation and is not itself a completed assessment.)*
