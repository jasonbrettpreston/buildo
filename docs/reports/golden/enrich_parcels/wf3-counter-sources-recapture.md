# `enrich_parcels` golden master — recapture for the WF3 counter-source fix (`compute.*` → `matched.compute.*`)

**Ruling:** Spec 124 §5 R-C (the golden capture is a lockfile — a capture whose `source_fingerprint` no longer matches
the tree is stale and must be re-taken, with the CAUSE named).
**Precedent followed:** `phase010b-post-phase-seam-recapture.md` (same file pair, same gate, same A/B/C/D vocabulary)
and `wf3-phase-deadline-recapture.md`.
**Closes:** the HIGH filed by batch-2 Phase 0.10b against itself — *"a bare `compute.*` counter source resolves null
for EVERY ENRICHER … `enrich_parcels` has been emitting null for all three of its declared counters since conversion,
with nothing testing it either way."*

## Why the gate fired — and why this recapture is MANDATORY, not conditional

`computeSourceFingerprint`'s four inputs are `scripts/enrich-parcels.descriptor.json`, `scripts/enrich-parcels.js`,
`scripts/enrich-parcels.notes.json` and `scripts/lib/compute/enrich-parcels.js`. This WF3 touches **one** of them —
the descriptor — so `step-validate --step=enrich_parcels --fast` reads G8 stale-fingerprints=2, hard-stop=true.

Unlike a behaviour-neutral library row, this change is a **Class-A diff BY CONSTRUCTION**: the whole point is that
the emitted summary moves. 0.10b declined to make it precisely because its own ship gate asserted Class A was empty;
this row exists to make the move, and to state in advance exactly which bytes are allowed to move.

## The defect, measured before the fix (2026-09-17, local Docker DB `postgresql://…@127.0.0.1:54322/postgres`)

| evidence | measurement |
|---|---|
| Ledger, last 8 completed `enrich_parcels` `pipeline_runs` rows (ids 1892, 1884, 1883, 1882, 1854, 1853, 1848, 1845) | `records_total = NULL`, `records_new = NULL`, `records_updated = NULL` on every one — while the SAME rows' `records_meta` carries `total_parcels_scanned = 486530` and `records_updated_aggregate = 0` |
| Committed POST captures (`post/sources_run1.json`, `post/none_incremental.json`) | `summary.records_{total,new,updated} = null` |
| Frozen PRE capture (`pre/sources_run1.json`, 2026-09-04, pre-conversion) | `records_updated: 0` — conversion turned a real `0` into a `null` |
| Unit, both directions, through the REAL resolver | `deriveCounters(descriptor, {}, {matched: {compute: {total_parcels_scanned: 486530, records_new_aggregate: 0, records_updated_aggregate: 7}}, written: {}})` → `{null, null, null}`; the identical call with the three sources re-pointed at `matched.compute.*` → `{486530, 0, 7}` |
| Introducing commit | `07afb862` (pilot 9 commit 7b, 2026-09-04) — the bare `compute.*` spelling was wrong from the first line it was written; **no behaviour was ever encoded by it**, so there is no Chesterton's fence to defend |

The mechanism, stated once: `resolveCounterSource` walks the source string against `{...counterScope, records_meta}`;
the enrich branch builds `counterScope = {matched: enrich.matched, written: enrich.written}`; the aggregate block the
runner assigns lives at `matched.compute` (`resolveEnrichAggregate`). `scope['compute']` was therefore `undefined`.
Remedy **(b)** of the two the filing named — re-point the descriptor, leave the resolver alone — was taken; remedy (a)
(spread `matched` into `counterScope`) was refused because it makes every `matched` key addressable as a bare root,
a wider surface than anything declared.

## PREDICTIONS — written BEFORE the capture ran, so they can be SCORED rather than rationalised afterwards

**Class A (structural, caused by THIS change) must be EXACTLY the counters — 3 keys on one capture, 6 on the other,
and nothing else.** Stated asymmetrically ON PURPOSE (PLAN-panel Integration finding — an earlier draft of this
prediction said "3 and 3", which would have made the incremental's other three reads look like an unexplained extra
diff):

| capture | Class-A keys expected | why |
|---|---|---|
| `post/sources_run1.json` | **3** — `normalised.summary.records_{total,new,updated}` | `normalised.pipeline_runs` is `[]` (measured on the committed artifact): a step run under `PIPELINE_CHAIN` skips its OWN ledger row, run-chain owns it |
| `post/none_incremental.json` | **6** — the same three in `normalised.summary` AND in `normalised.pipeline_runs[0]` | `normalised.pipeline_runs` has exactly 1 row (measured): the standalone path writes the step's own ledger row FROM the same derived counters, so it must move in lockstep. If it does not, the ledger and the summary have two different sources and that is a second defect |

Expected landings, pinned separately per capture rather than as one number: `records_total` `null` → `486530`
(`total_parcels_scanned`, both captures); `records_new` `null` → `0` (a literal 0 — this step INSERTs no `parcels`
row); `records_updated` `null` → the pass-1/2/3/5 distinct-id union, which on the `--full` is a large number and on
the incremental is expected to be **`0`** (the live ledger shows `records_meta.records_updated_aggregate = 0` on all
8 recent runs, and the committed `none_incremental` capture carries the same 0).

**No audit row added, removed, renamed or re-indexed. No `config` key added, removed or changed. No threshold moved.
No `records_meta` key moved** — in particular `total_parcels_scanned` and `records_updated_aggregate` must be
byte-identical, because the fix changes where the counter READS from, never what the compute MEASURES. If any other
byte lands in Class A, the fix did more than it declared and the row does not ship.

**Class B (data drift, NOT caused by this change) is predicted NON-EMPTY.** The committed captures ran **2026-09-16**;
this recapture runs **2026-09-17**. `buildCompCandidatesSql` filters `pr.issued_date >= ($N::date - (5 * interval '1
year'))` where `$N` is the RUN's own `ctx.clock.asOfDate()`, so the five-year comps window slides one day, floor
`2021-09-16` → `2021-09-17`. 0.10 measured this exact mechanism across a one-day boundary as `comp_candidate_pool`
9,282 → 9,277 with `comparable_builds_enriched_count` / `comp_zero_comps_count` conserved against each other; 0.10b
predicted and scored it EMPTY because both of its captures fell on the same date. **Here it should reappear.** If
Class B comes back empty, the assumed mechanism is wrong and this note must say so rather than quietly enjoy the
cleaner result.

**Class C (explained, pre-existing)** is expected to be wall-clock duration, the dead-tuple ratio and its warning
string, and the `parcels` content hash — the last being `EP-PIN-B45` / `EP-PIN-D9` (a run that reports zero enriched
rows still changes `parcels` content; proven in 0.10b's note against four artifacts including a pair produced
entirely by 0.10's own code).

*Prediction scored afterwards: the BUCKET was right, the cited CAUSE was a stale borrow. The OUTPUT panel refuted the
inheritance — `EP-D1`'s guard half and `EP-D9` are both **CLOSED** in the tree this ships against
(`scripts/lib/compute/enrich-parcels.js:78-84`; guard live at `:1198-1202`, tiebreaks at `:1157`/`:1185`). The
declared mechanism that actually applies is in the Class C table below. Recorded here rather than quietly swapped,
because inheriting a prior row's explanation instead of re-deriving it is the failure this note format exists to
prevent.*

**Class D (capture-order artifact) must be EMPTY.** The FULL runs first and completes; `none_incremental` is taken
immediately after, against the DB that run just left fresh — its documented precondition, and the thing 0.10 got
wrong.

### The PRE set was NOT re-taken, and must not be

`pre/{sources_run1,sources_run2,standalone}.json` are the frozen pre-conversion baseline from 2026-09-04 (`cd26f9ea`):
`source_fingerprint: null`, `tables_source: "arg"`, and seven hand-written invariants from a session scratchpad that no
longer exists. Re-taking them would destroy the only record of what the step emitted before conversion.

### Flag parity — measured from the committed artifacts themselves, not remembered

The committed POST pair records `tables_source: "descriptor"`, every `table_specs[].columns_source` /
`order_source` = `"descriptor"`, `invariants_file: null` with **6** descriptor-derived invariants, and
`table_row_ceiling: 100000` (the default). That is what a **bare** invocation produces: `capture-step-golden.js`
derives tables from `outputs.writes[]`, the projection/order from each entry's `key` ∪ `columns[]`, and the invariant
set from the descriptor's own `invariants[]`/`plausibility[]` whenever no `--invariants=` override is given. So the
INT-8/INT-9 flag-parity lesson from `geocode_permits` — whose POST captures DID need
`--table-columns` / `--table-order` / `--invariants` and whose first recapture silently dropped 7 invariants — applies
here as its PRINCIPLE (reproduce what the committed artifact records) and NOT as its literal flag list. The two
commands are:

```
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/enrich-parcels.js \
  --chain=sources --args=--full --overwrite \
  --out=docs/reports/golden/enrich_parcels/post/sources_run1.json
node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/enrich-parcels.js \
  --chain=none --overwrite \
  --out=docs/reports/golden/enrich_parcels/post/none_incremental.json
```

Verification that parity HELD is recorded below with the results, not assumed here.

---

# Results — captured 2026-09-17

| capture | invocation | child duration | exit | verdict | `parcels` hash |
|---|---|---|---|---|---|
| `post/sources_run1.json` | `--chain=sources --args=--full --overwrite` | 4,790,147 ms (**79.8 min**) | 0 | WARN | `72cb600e` |
| `post/none_incremental.json` | `--chain=none --overwrite` | 208,735 ms (**3.5 min**) | 0 | WARN | `f9868712` |

Per-phase on the FULL: `zoning` 1,075,393 ms, then `max_build` / `existing_structure` / `comparable_builds` /
`optimal_config`; `parcels` content hash 94,466 ms over 486,530 rows, `enrich_parcels_pass3_scope` 488 ms over 0 rows.
Fingerprint `ad4050cc…` → **`bb19abf6…`** — the value BOTH shipped artifacts record and the value the tree computes
today, verified by re-running `computeSourceFingerprint` over the four inputs. (An earlier draft of this line said
`527bc39e…`; the OUTPUT-panel Integration seat caught it and identified it exactly — that is the fingerprint of
*descriptor-edited but `scripts/lib/compute/enrich-parcels.js` still at HEAD*, a mid-edit intermediate read into the
note before the compute-module comment fix landed. It matched nothing that shipped. Recorded rather than quietly
overwritten, because a ship-gate artifact stating a hash that matches no artifact is precisely the defect class this
note exists to catch.)

**Flag parity HELD, verified from the harness's own first line rather than assumed:**
`tables=[enrich_parcels_pass3_scope,parcels] (source descriptor; ceiling 100000) invariants=6 from descriptor`, and
both tables' `columns`/`order` reported `(descriptor)`. Identical to what the committed artifacts record. **All 6
invariants present in both captures — none dropped** (the failure mode `geocode_permits`' first recapture hit and had
to revert).

**Pre-flight, measured before the FULL:** 0 non-idle backends on the target database · 0 stranded `running`
`enrich_parcels` `pipeline_runs` rows (the one stranded row in the ledger is `link_wsib` id 1737, a different step's
advisory lock) · `enrich_parcels_pass3_scope` 0 rows · `parcels` 486,530 · migrations 244 · target
`postgresql://…@127.0.0.1:54322/postgres`.

**Host note, recorded because it repeated 0.10b's incident exactly.** Host memory pressure killed the background
waiter loops watching this capture **three times**. The capture itself survived every one of them, because it was
launched **detached and bare** (`nohup node …`, no wrapper script) — the operational fence 0.10b's own note paid for,
now paid for twice. Liveness was re-established each time by reading the process COMMAND LINE, never a remembered pid.
Nothing else was run against the CPU or the DB while either capture was in flight.

---

# Diff classification — 13 on `sources_run1`, 16 on `none_incremental`

| | `sources_run1` | `none_incremental` |
|---|---:|---:|
| **Class A** — structural, caused by THIS change | **3** | **6** |
| **Class B** — data drift, NOT caused by this change | 6 | 7 |
| **Class C** — explained, pre-existing | 4 | 3 |
| **Class D** — capture-order artifact | 0 | 0 |
| total | 13 | 16 |

## Class A — structural: **EXACTLY the counters, on both pairs. Prediction SCORED and CORRECT (3 and 6).**

| key | before | after |
|---|---|---|
| `summary.records_total` | `null` | **`486530`** |
| `summary.records_new` | `null` | **`0`** |
| `summary.records_updated` | `null` | **`0`** |
| `pipeline_runs[0].records_total` *(incremental only)* | `null` | **`486530`** |
| `pipeline_runs[0].records_new` *(incremental only)* | `null` | **`0`** |
| `pipeline_runs[0].records_updated` *(incremental only)* | `null` | **`0`** |

The 3-vs-6 asymmetry is the predicted one and it is now MEASURED, not inferred: `sources_run1`'s
`normalised.pipeline_runs` is `[]` (a step run under `PIPELINE_CHAIN` skips its own ledger row — run-chain owns it),
while `none_incremental`'s has exactly one row. **The ledger row and the summary moved in lockstep**, which is the
claim that matters: they are derived from the same `deriveCounters` call, and had only one of them moved, the step
would have had two different counter sources and this row would have found a second defect instead of closing one.

`records_new = 0` is a literal 0 by construction (`records_new_aggregate`; this step INSERTs no `parcels` row — every
pass is an UPDATE). `records_updated = 0` is corroborated inside the same artifacts by
`records_meta.records_updated_aggregate = 0` and by the per-pass counts `parcels_enriched_count = 0` /
`max_build_enriched_count = 0` / `existing_structure_enriched_count = 0` / `scenario_enriched_count = 0`. It is the
idempotent-rerun signal those passes are supposed to produce, and it is exactly the value the frozen PRE capture
reported before conversion turned it into a `null`.

**⚠️ And the one per-pass count in that same `records_meta` that is NOT zero must be named here, not omitted
(OUTPUT-panel Integration finding — an earlier draft of this paragraph presented the zero list as exhaustive).** On
the `--chain=sources --full` capture `comparable_builds_enriched_count = 344,897` (it is `0` on the incremental). So
this step now reports `records_updated = 0` for a FULL run that measurably wrote 344,897 `parcels` rows. **That
exclusion is declared, pre-dates this WF3, and is the counter's whole §11 scoping decision** —
`computeAggregateRecordsUpdated` aggregates a distinct-id union over passes 1/2/3/5 and deliberately excludes pass 4,
stated in the descriptor's own `counters.records_updated.why` and carried verbatim from the legacy script's docblock.
It is not introduced or changed here. But Spec 48 §3.6 cuts both ways and the honest statement of it is: before this
row the counter asserted *nothing* (`null`); now it asserts *"zero rows genuinely updated"* under a definition of
"genuinely" that excludes pass 4 by design. Impact is bounded — the FULL is chain-owned and writes no ledger row of
its own, and the standalone run (ledger row 1905) reports `0` with `comparable_builds_enriched_count = 0` too, so its
zero is unqualified. **A separate, pre-existing contradiction this surfaced is filed as its own DEFER row in
`docs/reports/review_followups.md`:** write target 3 declares `write_discipline.idempotent_rerun: "zero_writes"`,
yet both FULL runs report 344,897.

**Nothing else is Class A.** No audit row added, removed, renamed or re-indexed — the row array is index-stable and
every moved row is identified by the same index in both captures. No `config` key added, removed or changed (all 45
identical). No threshold moved. **No `records_meta` key moved**: `total_parcels_scanned` is `486530` before and
after, and `records_updated_aggregate` is `0` before and after — which is the point, because the fix changes where
the counter READS FROM, never what the compute MEASURES. `enrich_parcels_duration_ms` is still present under exactly
that name. All four `scope_*` retirement keys present with their values. No `before_image` key.

## Class B — data drift, NOT caused by this change: **NON-EMPTY, as predicted. Prediction SCORED and CORRECT.**

The pre-registered prediction was that the five-year comps window would slide one day (`2021-09-16` → `2021-09-17`)
because the committed captures ran 2026-09-16 and this recapture runs 2026-09-17, and that if Class B came back EMPTY
the assumed mechanism was wrong. **It came back non-empty, in exactly the two comps-derived quantities 0.10 measured
across its own one-day boundary:**

| metric | OLD | NEW | appears as |
|---|---|---|---|
| `comp_candidate_pool` (`audit_table.rows[17]`) | 9,277 | **9,276** | 1 diff on the FULL, 2 on the incremental (summary + ledger row) |
| `comp_fsi_p50_small_n_sample_count` | 3,292 | **3,291** | `invariants[2]`, `audit_table.rows[33]`, `warnings[…]` — 3 diffs on the FULL, 5 on the incremental |

The direction and magnitude match the mechanism: one permit aged out of the window, so the candidate CTE lost one row
(0.10 measured −5 across its boundary; −1 here). `comparable_builds_enriched_count` (344,897) and
`comp_zero_comps_count` (85,507) are **identical** across all four artifacts — the pool shrank without changing which
parcels got comps, which is why only the two sample-sensitive statistics moved. (Precision, OUTPUT-panel Integration:
`comp_zero_comps_count` 85,507 is identical across all four artifacts, but `comparable_builds_enriched_count` 344,897
is identical across the FULL PAIR only — it is `0` on both incrementals. The claim that matters, identity WITHIN each
pair, holds; "all four" did not, and is corrected here.)

The mechanism was re-executed rather than inherited: running the candidate predicate directly against the live DB
across the boundary returns **9,506 on `2026-09-16` and 9,505 on `2026-09-17` — exactly −1**, matching
`comp_candidate_pool` 9,277 → 9,276 in direction and magnitude. Six permits sit on the boundary date `2021-09-16`;
one parcel lost its only qualifying permit under the `DISTINCT ON (zoning_dominant_parcel_id)`.

### `optimal_config_enriched_count` 0 → **80** — Class B, downstream of the same slide, with the chain traced rather than assumed

This is the one diff neither the plan nor the prediction named in advance, so it is stated in full rather than
waved at. It appears twice on the FULL (`audit_table.rows[20]` and `records_meta.optimal_config_enriched_count`) and
**not at all on the incremental** — and that asymmetry is itself the evidence:

* Pass 5's streaming read (`buildOptConfigSelectSql`, `scripts/lib/compute/enrich-parcels.js:1292-1325`) **selects
  `p.comp_fsi_p50`** — a pass-4 output — as an input to the optimal-config computation.
* `comp_fsi_p50` is exactly what the window slide moved (above).
* Under `--full` the `incrWhere` clause is EMPTY, so pass 5 streams every parcel and writes only genuinely-changed
  rows; 80 parcels' computed optimal config genuinely differed from what was stored.
* Under the incremental the gate is `p.opt_config_confidence IS NULL OR (optimal_config->'as_of_right'->>
  'main_footprint_sqm')::numeric IS DISTINCT FROM p.max_buildable_footprint_sqm` — a footprint/confidence gate that
  **does not look at comp fields at all**, so a comp-driven change is structurally invisible there. Hence 80 on the
  FULL and nothing on the incremental.

It cannot be this change: the diff of this WF3 is three descriptor `source` strings, one descriptor `why` text, and
comments — none of which is read by any pass. `optimal_config_enriched_count` is produced by
`computePostPhase` from `optCfg.updated`, untouched.

**Attribution narrowed, not overstated (OUTPUT-panel Integration correction).** An earlier draft named the one-day
window slide as THE cause. The structural half is verified — pass 5 reads `p.comp_fsi_p50`, `--full` has no
`incrWhere`, the write is guarded by `OPTCFG_GENUINE_COLS … IS DISTINCT FROM`, so the 80 are 80 *genuine* changes and
the FULL/incremental asymmetry is forced — but the slide is not established to the exclusion of a larger co-sufficient
cause sitting in the same artifact: `comparable_builds_enriched_count = 344,897` says pass 4 rewrote every
comps-bearing parcel on *both* FULL runs, which dwarfs a one-candidate pool shift as an explanation for 80 downstream
rows. The honest statement is therefore: **`optimal_config_enriched_count` 0 → 80 is downstream of pass-4 comps
movement, of which the measured one-day slide is one component.** The CLASSIFICATION is unaffected — it is Class B
either way, since every candidate cause is pass-4 data movement and none of them is this diff.

## Class C — explained, pre-existing

| diff | pair(s) | mechanism |
|---|---|---|
| `audit_table.rows[23]` (`enrich_parcels_duration_ms`) 5,201,344 → 4,790,147 · 262,333 → 208,735 | both | wall clock. The same `rows[23]` that moved in 0.10b's recapture, for the same reason |
| `parcels_dead_tuple_ratio` 0.7366 → 0.7331 (`rows[36]` + `warnings[2]`) | FULL | the pre-maintenance dead-tuple reading of a 486,530-row table between two runs. The post-maintenance `invariants` entry reads `0` in both captures — the declared `execution.maintenance` VACUUM (ANALYZE) ran and did its job (`sys_maintenance_parcels_vacuum_analyze`, `dead_ratio 0.6736 > 0.3`) |
| `table_state[1].content_hash` `33208a49` → `72cb600e` · `e586d0f9` → `f9868712` | both | **DECLARED drift, by design.** Write target 5 (`zoning_enriched_at`, `massing_enriched_at`) is `write_discipline.class: "set_based_scoped"` with `guard: "none"` and `idempotent_rerun: "declared_drift"` — an unguarded run-clock stamp — and **both columns are inside the hashed projection** (the projection derives from `outputs.writes[]`), so any `--full` moves the `parcels` content hash whatever else happens. The incremental pair needs no mechanism beyond that: a whole FULL ran between the two captures. Independent of this change, whose diff touches no SQL |

## Class D — capture-order artifact: **EMPTY**

The FULL ran first and completed (artifact written, harness exited, verified by command line); `none_incremental` was
taken immediately afterwards against the DB that run had just left fresh — its documented precondition, and the thing
0.10 got wrong. No re-run, no lost artifact, no reordering.

## Ship gate

Class A is **exactly** the counter keys this row exists to move — 3 on the chain capture, 6 on the standalone — with
the ledger row and the summary moving in lockstep, no audit row, config key, threshold or `records_meta` key moved,
and no invariant dropped. Both pre-registered predictions were scored against the measurement rather than rewritten
after it. **The row ships.**
