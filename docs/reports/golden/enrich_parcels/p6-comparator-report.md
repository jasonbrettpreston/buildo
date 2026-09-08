# `enrich_parcels` golden master — P6 comparator report (pilot 9 commit 8 P6)

**Spec:** Spec 122 §5.3 (behaviour-preservation) · Spec 123 §3.1 (pin-then-fix), §7 nine-commit
procedure.

## What this comparator covers

`post/sources_run1.json` was captured at `f7e695fc` (2026-09-04, pre commit-8) — BEFORE any of
commit 8's value-affecting peels. This report re-captures it at `404388ea` (2026-09-08, after P0-P7)
and diffs the two: the OLD capture reflects pre-fix behaviour (no B45 guard, non-deterministic comps
tiebreak, no comp-family compatibility invariant, unbounded scope-table growth); the NEW capture
reflects P1 (EP-D10 prune), P2 (EP-D1/B45 guard + declared invalidator), P3 (EP-D9 deterministic
tiebreak), P4 (EP-D8 family/zone compatibility), P5 (observability only — no value effect), P7
(test/doc closeout — no value effect). Run: `node scripts/enrich-parcels.js --full`
(`PIPELINE_CHAIN=sources`), 4,393.2s wall time, exit 0, verdict WARN (same 2 pre-existing WARN checks
in both captures — `massing_zero_link_ghost`, `comp_fsi_p50_small_n_sample_count` — unrelated to this
commit).

## Field-level diff (full JSON diff, `git diff` against the committed capture)

| Field | Before (`f7e695fc`) | After (`404388ea`) | Cause |
|---|---|---|---|
| `parcels` content_hash | `cddd2f99…` | `3eaf153d…` | **Real data diff — see below** |
| `enrich_parcels_pass3_scope` row_count / content_hash | 2,211,220 / `c81c7fb0…` | 0 / `null` | **EP-D10-FIX (P1)** — the pruning `DELETE` landing on its first real `--full` run. Table is inventory-only per the EP-D10 ledger row, not a `parcels`-column input; this is the expected, intended effect, not a diff needing further explanation. |
| `optimal_config_enriched_count` | 1225 | 366 | **Explained below** — a write-count metric, not an eligibility/backlog count |
| `pool_errors` (records_meta) | absent | `0` | **P5(a) schema-only addition** — new field, value 0 (no pool errors either run) |
| `duration_ms` / `sys_duration_ms` / per-field timing | 2,543,606 / 2,548,955 | 4,387,418 / 4,393,124 | **Wall-clock only** — DB/host load variance between the two capture sessions, not a code-driven behaviour change (see per-pass timing table below) |
| `git_head`, `source_fingerprint`, `pipeline_runs_max_id_before`, `table_timing` | (old values) | (new values) | **Expected bookkeeping** — different commit, different source files, different run |
| All other `comparable_builds_enriched_count`, `comp_candidate_pool`, `comp_zero_comps_count`, zoning/max-build/existing-structure/heritage/ravine metrics | — | — | **UNCHANGED, byte-identical between captures** — confirms P2-P4 altered ORDERING/FILTERING of already-selected comps, not the ELIGIBLE POPULATION for any upstream pass |

**Zero unexplained fields.**

## `parcels` content_hash diff — classification

Whole-table content hash changed (expected — three value-affecting peels landed). Per-peel
attribution, using the counts already measured and cited in the shipped SQL comments
(`scripts/lib/compute/enrich-parcels.js`, `buildComparableBuildsUpdateSql`) plus a fresh read-only
diagnostic against the post-run DB state (`_tmp_p6_ep_d8_diagnostic.js`, ROLLBACK'd transaction, zero
persisted writes):

- **EP-D9-FIX (deterministic tiebreak, P3).** Golden-master G1' (commit 5) measured
  `comparable_builds` differing on 248/486,530 parcels (0.051%) across two identical back-to-back
  `--full` runs pre-fix; the G2' same-day comparator (commit 7e/2) independently measured 225/486,530
  (0.046%) via a legacy-vs-converted same-day diff — both in the same ballpark, both attributed to the
  SAME root cause. Root-caused to two tie classes: **1,921/344,845 subjects (0.56%)** carry an exact
  score tie at the outer `LIMIT 10` rank boundary (the dominant mechanism — `comp_dominant_build`,
  `comp_build_ratio_p50`, `comp_fsi_p50` can all shift when a tied candidate swaps in/out of the
  top-10), and **15/430,404 inner-kNN ties (0.003%)** at the `LIMIT 50` overfetch boundary (a strict
  subset, comfortably inside the 1,921 superset). Both `ORDER BY` clauses now carry a deterministic
  secondary key (`c.id` / `near.id`) — this class of diff cannot recur on a re-run against unchanged
  source data (locked: `src/tests/steps/enrich_parcels/violations.test.ts` "EP-D9 FIXED";
  `enrich-parcels-comps.logic.test.ts`'s SQL-verbatim regex updated to require `, c.id`).
- **EP-D8-FIX (family/zone compatibility, P4).** Concrete measured example already on record
  (`buildComparableBuildsUpdateSql` comment): parcel 8244 (R zoning/detached, 290 m²) carried
  `comp_fsi_p50 = 6.615` sourced from a 1,695 m² apartment-scale comp under the old
  zoning-class-only `'all'`-family fallback. Fresh read-only diagnostic against the post-run DB:
  **107,927 subjects** have ≥1 candidate in their kNN pool that matched the OLD (unfiltered)
  `'all'`-fallback predicate but is now excluded by the new `comp_structure_type_known` guard — an
  UPPER BOUND (a subject can have the excluded candidate replaced by another still inside its top-10,
  producing no value change; this count does not, by itself, claim 107,927 rows' stored values
  differ — it answers "how many subjects had an incompatible candidate in range," the precondition for
  a possible change). `comp_zero_comps_count` (85,536) is IDENTICAL in both captures — the fix
  re-filters WHICH comps qualify per subject, it does not eliminate whole subjects' comp pools.
- **B45-FIX (P2, `IS DISTINCT FROM` guard).** **0 value diffs expected, and none found** — the guard
  changes WHICH ROWS THE UPDATE TOUCHES (write discipline), never the COMPUTED VALUE for a row it
  does touch. `comparable_builds_enriched_count` (344,868) is IDENTICAL between captures: this P6 run
  is the FIRST real `--full` run under the new guarded+deterministic code, so every previously-stored
  (stale, non-deterministic-order) value is genuinely different from the new deterministic value —
  the guard correctly treats the whole scoped population as "genuine" on this inaugural run. The guard
  will only begin measurably reducing `comparable_builds_enriched_count` on a SECOND consecutive
  `--full` run against unchanged source data (not exercised by this P6 capture — that is the G2'-style
  back-to-back comparison, out of this peel's scope).

## `optimal_config_enriched_count` (1225 → 366) — full explanation

This metric is `stats.updated` from `runPass5`, returned by `flushOptConfigBatch` — and
`flushOptConfigBatch` is itself `IS DISTINCT FROM`-guarded (`scripts/lib/compute/enrich-parcels.js:1428-1462`,
the `diffed` CTE's `genuine` / `nearby_changed` columns gate the `UPDATE ... WHERE (d.genuine OR
d.nearby_changed)`). **This is a write-count metric — "how many parcels' `optimal_config` value
genuinely changed this run" — not an eligibility or backlog count.** The `buildOptConfigSelectSql`
scope itself (`max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm > 0`) matches the large
majority of the 486,530 parcels every `--full` run; the guard is what keeps the enriched-count small
by only counting rows whose engine OUTPUT actually differs from what is stored.

Because pass 5 reads `comp_fsi_p50` as an engine input (`buildOptConfigSelectSql`'s SELECT list), any
upstream drift in pass 4's comps output ripples downstream — this is a **downstream ripple of the
SAME EP-D9/EP-D8/B45 peels**, not an independent or unexplained cause. The magnitude of the ripple
naturally varies run-to-run with how much upstream comps data had already settled since the prior
capture; both captures are single point-in-time measurements of that ripple, not a stable baseline.
Corroborating evidence this is not a regression:

- `opt_config_engine_errors`: **0 in both captures** — no engine failures introduced.
- `opt_config_citywide_fallback_count` (35,372) and `opt_aor_envelope_capped_count` (3,390): **identical
  in both captures** — the engine's own fallback/capping behaviour is unaffected.
- Every pass 1-3 audit metric (zoning/max-build/existing-structure/heritage/ravine counts) is
  **byte-identical** between captures — ruling out an eligibility-population shift as the cause.
- `enrich_parcels_pass3_scope` genuinely went from a 2,211,220-row unconsumed backlog (accumulated
  across ~5 prior `--full` runs during P1-P5 development, before this run) to 0 — this P6 run is also
  the FIRST real invocation of `consumePendingScope`'s cross-run recovery path running against a
  materially non-trivial backlog under the new prune-at-end code; `flushOptConfigBatch`'s own guard
  (same code path, same idempotency rule) means a recovered-but-unchanged row still does not inflate
  the count, but a recovered-and-genuinely-different row does — consistent with, not contradictory to,
  the observed swing.

## Per-pass timing (this run, `--full`, local)

| Pass | Duration |
|---|---|
| 1 zoning | 643.1s |
| 2 max_build | 3,049.3s |
| 3 existing_structure | 116.1s |
| 4 comparable_builds | 452.7s |
| 5 optimal_config (derived: total − Σpasses 1-4) | ~131.9s |
| **Total** | **4,393.2s** |

No pass shows a discontinuous timing signature (e.g., pass 5 does not show the 2026-09-07 hang
pattern). Total wall time (4,393.2s) is ~1.73x the OLD capture's 2,543.6s — attributed to host/DB load
variance during this session (this session's own local Supabase container was shared with concurrent
DB queries run for P7's verification work) and the first-time `consumePendingScope` backlog sweep
(2,211,220 rows), not a code-driven regression; no KFM-7 finding is filed since no SINGLE pass shows a
disproportionate ratio relative to the others (all four shared-txn passes scale roughly together).

## Inventory items (a)-(g) — status after P6

- (a)-(f): unchanged by this peel (P1-P5 already updated these where applicable — see the
  assessment report's dated addenda).
- (g) `enrich_parcels_pass3_scope`: text already updated at EP-D10's ledger entry from
  "unbounded append-only" to "pruned at run end" (P1). This capture is the first LIVE confirmation:
  row_count 2,211,220 → 0.

## Scope note — `none_incremental.json` NOT recaptured in this peel

`docs/reports/golden/enrich_parcels/post/none_incremental.json` also carries a stale
`source_fingerprint` (last captured 2026-09-07, before P1-P5) and is a SEPARATE golden invocation
(incremental-mode, zero-op scope) from this peel's authorized scope (`sources_run1.json` only, per
the commit-8 P6 directive). `converted.json`'s `pending.stage` remains
`"shape_clean_pending_recapture"` (R-K.2) rather than reverting to plain `"shape_clean"` — reverting
now would be a false-readiness claim while a second declared golden file is still stale. G8 stays
structurally excluded from hard-stop under the existing R-K.2 mechanism; `checkCutoverPrereqs` (the
gate this peel is actually required to close) is unaffected — it checks the 4 EP-PIN items' `status`
field only, all four already `BUILT`. Recapturing `none_incremental.json` is out of this peel's scope;
noted here so the gap is declared, not silently carried.

## Gate

**Zero unexplained diffs. P6 gate: PASS.**
