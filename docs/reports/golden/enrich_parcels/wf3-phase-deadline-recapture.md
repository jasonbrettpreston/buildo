# `enrich_parcels` golden master — recapture for WF3 EP-PHASE-DEADLINE / EP-PASS3-BACKLOG

**Ruling:** Spec 124 §5 R-C (the golden capture is a lockfile — a capture whose `source_fingerprint`
no longer matches the tree is stale and must be re-taken, with the CAUSE named).
**Precedent followed:** `commit9-none-incremental-recapture.md` (same file, same gate, same
classification discipline).
**Cause of the recapture:** this WF3 edits two of the four fingerprinted files —
`scripts/lib/compute/enrich-parcels.js` (new `retireStaleScope` + three check functions) and
`scripts/enrich-parcels.descriptor.json` (one new `config` tunable + three new `checks[]` rows).
Neither `scripts/enrich-parcels.js` nor `scripts/enrich-parcels.notes.json` changed.

## What was captured

Both `post/` captures, in this order, on a quiet host with nothing else running:

| capture | invocation | duration | exit |
|---|---|---|---|
| `post/sources_run1.json` | `--chain=sources --args=--full` | 2,877.5 s (47.9 min) | 0 |
| `post/none_incremental.json` | `--chain=none` (incremental) | 148.7 s | 0 |

Order is load-bearing and follows this file's own precedent: `none_incremental` is captured
**immediately after** the `--full`, because its documented precondition is a DB the full run has
just left fresh. Capturing it against a stale DB would manufacture enriched-count diffs caused by
capture order rather than by the change.

Pre-flight (per the launch rule): 0 active parcel backends, 0 stranded `enrich_parcels`
`pipeline_runs` rows, `enrich_parcels_pass3_scope` 0 rows, `pipeline_runs` max id 1881.

**A prior attempt on 2026-09-15 was killed by the host at ~17 min for low memory** (`zoning` ran
998.7 s vs a 614.4 s baseline, +63%, under contention). That kill orphaned the child process; it
was cancelled with `pg_cancel_backend` and the DB verified clean (0 backends, 0 stranded rows,
`pass3_scope` 0 — the shared transaction rolled back, so the hand-off INSERT never committed).
Nothing from that attempt is in either capture. The successful run above is a clean, solo re-run.

## Diff classification — 45 diffs on `sources_run1`, 78 on `none_incremental`

`none_incremental` carries roughly double because a standalone run owns its ledger row, so the
audit table appears in BOTH `summary.records_meta` and `pipeline_runs[0].records_meta`; every diff
below is duplicated across the two copies. Three classes, no fourth:

### Class A — structural, caused by THIS change (intended)

1. **Three new `checks[]` rows** inserted after `enrich_parcels_duration_ms`:
   `scope_backlog_at_step_start` (WARN, bound `viol <= 50000`, shares
   `enrich_parcels_pending_scope_warn_max` with `pending_scope_parcels` by design — one source of
   truth for one population), `scope_retired_rows` and `scope_retired_cohorts` (both INFO).
2. **An index shift of +3 for every row after position 23.** This is the bulk of the raw diff
   count and is NOT a set of value changes: `rows[27].metric "scope_stamped_without_recompute_count"
   -> "pending_scope_parcels"`, `rows[28] "opt_aor_gfa_gt_max_buildable_gfa_count" ->
   "scope_recovery_recovered_count"`, and so on down to the three genuinely-new `rows[34..36]`
   entries at the tail. Every pre-existing row survives with its own value, threshold, source and
   status intact — the comparator is positional, so a row INSERT renders as a long cascade of
   apparent renames. Verified by name-keyed comparison, not by eye.
3. **`config.enrich_parcels_scope_retire_after_hours: undefined -> 24`** — the new tunable entering
   the config stamp (Rule 3: the window is an admin logic variable, so it is stamped like every
   other one).
4. **`scope_retired_rows` / `scope_retired_cohorts` render as strings**, `"0 (window 24h, cutoff
   <ISO>)"` rather than a bare `0` — the Observability fold's requirement that the window travel ON
   the row, so a reader cannot confuse "nothing was old enough" with "the window is misconfigured".
   The cutoff is DB-derived (the injected clock minus the tunable, computed in the retirement's own
   SQL), which is why the normaliser masks it as `<TS>`.

### Class B — data drift, NOT caused by this change: the comps window slid 4 days

Moved: `comp_candidate_pool` 9,292 -> 9,282; `comparable_builds_enriched_count` 344,892 ->
344,874; `comp_zero_comps_count` 85,512 -> 85,530; `comp_fsi_p50_small_n_sample_count` 3,294 ->
3,291; `optimal_config_enriched_count` 337 -> 524.

**Mechanism, verified in code, not inferred:** `buildCompCandidatesSql` filters
`pr.issued_date >= ($N::date - (windowYears * interval '1 year'))` where `$N` is
`ctx.clock.asOfDate()` — the RUN's own date. The committed capture ran 2026-09-11; this one ran
2026-09-15/16. The 5-year rolling window's floor therefore moved forward ~4 days and the oldest
permits fell out of it.

**The arithmetic confirms it:** `comp_zero_comps_count + comparable_builds_enriched_count` =
85,512 + 344,892 = **430,404** before and 85,530 + 344,874 = **430,404** after. The population is
CONSERVED — exactly 18 parcels moved from "has comps" to "zero comps", which is what a sliding
window does and is not what a code defect does. `optimal_config` reads comps, so its own genuine
change-set moves with them.

**Independent corroboration that the change is not the cause:** passes 1-3 are byte-identical
across the two captures — `parcels_enriched_count` 0, `max_build_enriched_count` 0,
`existing_structure_enriched_count` 0, `zone_class_pct` 96.6, `total_parcels_scanned` 486,530,
`records_updated_aggregate` 0, `opt_config_engine_errors` 0, all unchanged. A change that
perturbed enrichment would not spare the three passes it also runs through. And `git log
bc81ac84..eb4c17a6 -- scripts/lib/compute/enrich-parcels.js scripts/enrich-parcels.descriptor.json
scripts/enrich-parcels.js` returns **zero commits** across the 145 in that range: the enrichment
logic is unchanged apart from this WF3's own uncommitted edits, which touch no pass SQL.

### Class C — clock and vacuum state (inherent to any re-run)

`enrich_parcels_duration_ms` 2,729,274 -> 2,877,529 (wall clock; +5.4%, within run-to-run
variance); `parcels_dead_tuple_ratio` 0.7362 -> 0.736 and its invariant 0.7354 -> 0 (autovacuum
timing relative to the measurement — a `--full` creates the dead tuples the row then reports, and
where the vacuum lands in that window is not deterministic); `table_state[1].content_hash`
(`parcels`) changed, which follows directly from Class B's 18 moved comp rows plus pass 4's
EP-D1-pinned unguarded UPDATE, which rewrites every eligible row each run by design.

## Gate

Zero unexplained diffs — every one of the 45/78 lands in A, B or C above, each with a named,
verified mechanism. Confirmed independently by the validator's own comparator:

```
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
- compare ran: true · diffs found: 583 · unexplained: 0
```

**G8: PASS (real, no stage exclusion).** `enrich_parcels` 16/17, hard-stop=false.

## Live evidence the change works

The recaptured audit table carries the new rows against a real 486,530-parcel DB:

```
{"metric":"scope_backlog_at_step_start","value":0,"threshold":"viol <= 50000","status":"PASS"}
{"metric":"scope_retired_rows","value":"0 (window 24h, cutoff 2026-09-15T00:11:52.854Z)","status":"INFO"}
{"metric":"scope_retired_cohorts","value":"0 (window 24h, cutoff 2026-09-15T00:11:52.854Z)","status":"INFO"}
```

0 retired is the CORRECT reading, not a silent no-op: `enrich_parcels_pass3_scope` held 0 rows at
step start (verified in the pre-flight), so there was nothing older than the 24 h window to retire.
The window and cutoff are present precisely so that this 0 is legible as "nothing was eligible"
rather than "the retirement did not run" — which would have read as `null`.
