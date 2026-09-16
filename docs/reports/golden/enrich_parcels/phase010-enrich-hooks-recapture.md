# `enrich_parcels` golden master — recapture for batch-2 Phase 0.10 (the generic ENRICHER runner)

**Ruling:** Spec 124 §5 R-C (the golden capture is a lockfile — a capture whose `source_fingerprint`
no longer matches the tree is stale and must be re-taken, with the CAUSE named).
**Precedent followed:** `commit9-none-incremental-recapture.md` and `wf3-phase-deadline-recapture.md`
(same file pair, same gate, same classification discipline).

**Plan ruling A4 and why it flipped.** The authorized plan's default was *"No [recapture] — the
descriptor edit is additive and behaviour-neutral"*, with the standing exception *"if the fingerprint
gate demands a recapture, take it with the cause named (R-C) — but L8's hash-equality assertion is not
weakened to accommodate it."* The gate demanded it, measured not assumed:
`scripts/enrich-parcels.descriptor.json` is one of `computeSourceFingerprint`'s four inputs, so declaring
`execution.enrich_hooks` / `heartbeat_minutes_from_config` / `lock_timeout_ms_from_config` moved the
fingerprint and `step-validate --step=enrich_parcels --fast` read
`G8 … stale-fingerprints=2 … hard-stop=true`.

**Cause of the recapture:** ONE of the four fingerprinted files changed —
`scripts/enrich-parcels.descriptor.json` (three additive `execution.*` declarations; no `checks[]`
change, no `config` change, no new tunable). `scripts/enrich-parcels.js`,
`scripts/enrich-parcels.notes.json` and `scripts/lib/compute/enrich-parcels.js` are **byte-untouched**
by this row — which is the load-bearing fact for the classification below: **no pass SQL moved.**
`scripts/lib/step/index.js` is not a fingerprint input, so the runner change does not move it by itself.

New fingerprint: `16217d3f5b1360cf61f74622c37b9b7ab4edde3700e57299434a3ae94f258638` (both captures).

## What was captured

| capture | invocation | duration | exit |
|---|---|---|---|
| `post/sources_run1.json` | `--chain=sources --args=--full` | 3,832,487 ms (63.9 min) | 0 |
| `post/none_incremental.json` | `--chain=none` (incremental) | 210,753 ms (3.5 min) | 0 |

**⚠️ CAPTURE ORDER IS INVERTED RELATIVE TO EVERY PRIOR RECAPTURE, AND THAT MATTERS — stated, not
buried.** Every prior note captures `--full` first and `none_incremental` immediately after, because
the latter's documented precondition is a DB the full run has just left fresh. Here the ORDER of the
runs is preserved but the ORDER of the surviving artifacts is not:

1. A `--full` ran 21:49–23:15 (85.9 min) and completed ALL FIVE phases, committing its work.
2. It then died at the write: `buildCapture` → `gitHead()` threw `Command failed: git rev-parse HEAD`
   and the harness exited 1 having written nothing. R-C's own ruling is why — an unresolvable
   `git_head` THROWS rather than degrading to `"unknown"`, since a capture that records nothing about
   the code that produced it is not a lockfile. `git rev-parse HEAD` was healthy minutes later, so this
   was environmental (the host was OOM-killing processes in the same window).
3. `none_incremental` was captured at 23:19, **immediately after that completed `--full`** — so its
   precondition IS satisfied, by the run whose artifact was lost.
4. The `--full` was then re-run 23:24–00:30 for its own artifact.

The one diff this ordering causes is named in class D below rather than left for a reader to trip over.
A second, unrelated fault in step 2 was mine: the first attempt wrote `--out` OUTSIDE the repo, and
`captureGitState` treats `git ls-files --error-unmatch`'s exit 128 ("outside repository") as a probe
failure. Both captures now use in-repo paths.

## Pre-flight (measured before each capture)

0 active parcel backends · 0 stranded `running` `enrich_parcels` `pipeline_runs` rows ·
`enrich_parcels_pass3_scope` 0 rows · `git rev-parse HEAD` healthy. Target
`postgresql://…@127.0.0.1:54322/postgres`, migrations 244.

## Diff classification — 13 on `sources_run1`, 10 on `none_incremental`

**Class A — structural, caused by THIS change: NONE. Zero. That is the result this recapture exists to
report.** No row added, removed, renamed or re-indexed; no `config` key added or changed; no threshold
moved; `enrich_parcels_duration_ms` still present under exactly that name (the new
`<slug>_duration_ms` derivation is byte-identical for this step); and **no `before_image` key anywhere**
— the class-O seam ran zero times, which is exactly why that key is added to `matched` only when
non-empty. The five per-target write counters are unchanged, which is the counter-fold's own inverse arm
measured against the real 486,530-parcel DB rather than against a fixture.

### Class B — data drift: the 5-year comps window slid one day. MEASURED.

`buildCompCandidatesSql` filters `pr.issued_date >= ($N::date - (5 * interval '1 year'))` where `$N` is
`ctx.clock.asOfDate()` — the RUN's own date. The committed captures ran 2026-09-15; these ran 2026-09-16.
Re-executed against the live DB, the candidate CTE's own `DISTINCT ON (zoning_dominant_parcel_id)`
population:

```
floor 2021-09-15 (asOf 2026-09-15): 9,511
floor 2021-09-16 (asOf 2026-09-16): 9,506      delta -5
permits issued ON the dropped day 2021-09-15: 23 permits across 13 parcels
```

The observed `comp_candidate_pool` moved **9,282 → 9,277, also exactly −5**. Of the 13 parcels holding a
boundary-day permit, 5 had that permit as their `DISTINCT ON` winner and so left the pool; the other 8
still have a newer qualifying permit inside the window.

Downstream of that, and **CONSERVED**: `comparable_builds_enriched_count` 344,874 → 344,897 (+23) and
`comp_zero_comps_count` 85,530 → 85,507 (−23). `344,874 + 85,530 = 430,404` and
`344,897 + 85,507 = 430,404` — the eligible population is identical and 23 subjects moved from "zero
comps" to "has comps". `comp_fsi_p50_small_n_sample_count` 3,291 → 3,292 (invariant + audit row +
warning string) rides the same input change.

**Honest limit on this class, not glossed:** the candidate-pool delta is measured and exact, and the
±23 pair is a conserved redistribution within a fixed population whose only moved input is that
candidate set. But *why removing 5 candidates lets 23 subjects gain comps* — rather than lose them — is
**not measured here.** The plausible mechanism is the top-N/over-fetch selection interacting with the
declared FSI plausibility clamp (`comp_top_n` 10, `comp_knn_overfetch` 50, plausible FSI [0.05, 8]): a
dropped outlier no longer crowds the shortlist for nearby subjects. That is offered as a candidate
explanation, **not as a finding**. What IS established is that the code cannot be the cause:
`scripts/lib/compute/enrich-parcels.js` is byte-untouched by this row, so no comps SQL moved, and the
only input that changed is the run date.

### Class C — clock and vacuum state (inherent to any re-run)

`enrich_parcels_duration_ms` 2,877,529 → 3,832,487 (wall clock; this host was materially busier —
`max_build` alone ran 51.1 min on the first attempt) · `parcels_dead_tuple_ratio` 0.736 → 0.7365 and its
warning string (autovacuum timing relative to the measurement: a `--full` creates the dead tuples the row
then reports) · `table_state[1].content_hash` (`parcels`), which follows directly from Class B's 23 moved
comp rows plus pass 4's EP-D1-pinned unguarded UPDATE, which rewrites every eligible row each run by
design.

### Class D — capture order (one diff, created by the lost artifact above)

`optimal_config_enriched_count` **524 → 0** (both the audit row and `records_meta`). Pass 5 recomputes
the parcels whose optimal config is stale. By the time the surviving `--full` ran, TWO earlier runs had
already executed pass 5 against this DB — the 85.9-min `--full` whose artifact was lost, and the
`none_incremental` taken right after it — so there was nothing left to recompute and the honest answer
is 0. This is an artifact of the capture ORDER described above, not of the change: no pass-5 code moved,
and the committed capture's own 524 was itself the tail of whatever preceded it.

## Gate

**Zero unexplained diffs.** Every one of the 13 / 10 lands in B, C or D with a named mechanism, and
Class A — the only class this change could have produced — is empty.
