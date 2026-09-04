# `enrich_parcels` golden master — G1' comparator report (pilot 9 commit 5)

**Spec:** `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §5.3 (G1', two consecutive
captures must agree byte-for-byte outside the declared non-determinism inventory) · Spec 123 §3.1
(pin-then-fix; every explained diff points at a Defect Ledger ID).

**Compared:** `pre/sources_run1.json` vs `pre/sources_run2.json` — two identical back-to-back
`chain=sources --full` invocations of `scripts/enrich-parcels.js`, no intervening writes by any
other step. `pre/standalone.json` (`chain=none --full`) captured as the third invocation context
per the golden convention; not independently re-verified for G1' (cost — each `--full` run is
~37-44 min locally), but its table_state was computed via the SAME (now-fixed) harness against the
still-live post-run3 DB state, and its invariants (`pass3_scope_total_rows: 1768976`,
`distinct_run_ids: 4`) extend the SAME linear EP-D10 growth trend measured across runs 0-2 with no
break in the pattern — consistent with the same code path.

Tool: `node -r dotenv/config scripts/analysis/capture-step-golden.js --compare=<run1>,<run2>`.

## Result: 12 raw diffs, 0 unexplained

Every diff is accounted for by either the declared non-determinism inventory (a)-(g) or a pinned
Defect Ledger row (`docs/reports/defect-ledger.md`). None required widening the inventory
post-hoc — EP-D9/EP-D10 were filed as NEW findings (commit 4c), not folded into the inventory.

| # | Path | run1 | run2 | Explanation |
|---|---|---|---|---|
| 1 | `invariants[0].value` (`capture_as_of_utc_date`) | `13:12:28 EDT` | `13:50:16 EDT` | Inventory (b) — capture-wall-clock timestamp, presence/shape only |
| 2 | `invariants[4].value` (`pass3_scope_total_rows`) | `884488` | `1326732` | **EP-D10** — append-only growth, +442,244/run |
| 3 | `invariants[6].value` (`pass3_scope_distinct_run_ids`) | `2` | `3` | **EP-D10** — one new `run_id` per run, never pruned |
| 4-9 | `summary.records_meta.audit_table.rows[85..90].value` (`enrich_parcels_pass{1..5}_duration_ms`, `enrich_parcels_duration_ms`) | run1 timings | run2 timings | Inventory (b) — `Date.now()` wall-clock durations, presence/shape only, never value |
| 10 | `table_state[0].content_hash` (`parcels`) | `e8b62914…` | `f5666d62…` | **EP-D9** — `comparable_builds` non-determinism (248/486,530 rows, 0.051%); the other 99/100 golden columns are byte-identical (verified by a per-column diff before this report was written) |
| 11 | `table_state[1].content_hash` (`enrich_parcels_pass3_scope`) | `5b32f8b7…` | `62007816…` | **EP-D10** — hash is `md5(string_agg(parcel_id ORDER BY run_id, parcel_id))`; a new `run_id`'s worth of rows changes the concatenation |
| 12 | `table_state[1].row_count` | `884488` | `1326732` | **EP-D10** — same append-only growth as #2 |

**Not diffs (confirms the inventory + Fold A1 correction):** `invariants[1]` (`comps_window_as_of_date`,
same UTC day both captures — item (a) held), `invariants[2]` (`parcels_total`, 486530 both),
`invariants[3]` (`parcels_with_nearby_builds_summary`, 442244 both), `invariants[5]`
(`pass3_scope_distinct_parcel_ids`, 442244 both — EP-D10's "duplication only, zero new logical
content" claim, directly confirmed), `table_state[0].hash_method` (normalised to the harness's
canonical `"row_hash_then_concat"` value in both captures), `exit_code` (0 both), `verdict` (`WARN`
both), and all 94 other `parcels` golden columns folded into `table_state[0].content_hash` (per the
EP-D9 per-column diagnostic: only `comparable_builds` differs).

## EP-D9 per-column isolation (evidence for row 10 above)

Before this report was written, a per-column `IS DISTINCT FROM` diff was run between a full
snapshot of the post-run2 `parcels` state and the post-run3 live state, over all 100 golden
columns:

```
columns that differ (post-run2 vs post-run3): 1
comparable_builds   248
```

Every other column — including the other 4 pass-4 outputs `comp_count`, `comp_dominant_build`,
`comp_build_ratio_p50`, `comp_fsi_p50` — is byte-identical. See `docs/reports/defect-ledger.md`
EP-D9 row and `docs/reports/2026-09-04-pilot9-enrich-parcels-assessment.md` §5 for the SQL quote
and the tie-boundary measurement (1,921/344,845 subjects, 0.56%, tied at the `ORDER BY … LIMIT 10`
cutoff) that root-causes it.

## Non-determinism inventory, as declared before the first diff

(a) comps window pinned to one `now()::date`, recorded via the `comps_window_as_of_date` invariant
— all 3 captures landed the same UTC day (2026-09-04), so this dimension never actually fired.
(b) `Date.now()` pass-duration audit rows — compared by presence/shape, never value.
(c) `neighbourhood_build_norms`/`comp_cand` — no intervening `permits`/`compute_storey_norms` run
between any of the 3 captures; this is what let EP-D9 isolate to a genuine SQL-tiebreak defect
rather than legitimate upstream data drift.
(d) `run_id` (`enrich_parcels_pass3_scope.run_id`) — excluded from the `parcel_id`-only projection;
its downstream effect is EP-D10, not raw non-determinism.
(e) `zoning_enriched_at`/`massing_enriched_at` — excluded from the `parcels` golden-column
projection.
(f) `nearby_builds_summary` — excluded from the `parcels` golden-column projection.
**Correction (Fold A1, this commit):** measured **0/442,244** drift across all 3 captures — the
code's own `:1403-1411` "88,575/88,575 every run" docblock is production data drift (permits
ingest between real runs), not code non-determinism; see §5 of the assessment doc.
(g) `enrich_parcels_pass3_scope` is append-only/unpruned across repeated `--full` runs — now
formally EP-D10, not merely a declared inventory item.
