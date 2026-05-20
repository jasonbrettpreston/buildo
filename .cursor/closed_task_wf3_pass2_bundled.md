# Active Task: WF3 — Phase Distribution audit_table emits per-seq rows (Spec 79 Pass 2 finding)
**Status:** Implementation
**Workflow:** WF3 — per-finding fix from Spec 79 Pass 2 (CoA chain re-run 2026-05-19)
**Domain Mode:** Backend/Pipeline

## Context
* **Goal:** Replace the legacy `phase_PN_count` aggregate rows in `scripts/quality/assert-lifecycle-phase-distribution.js` audit_table with **110 per-seq band rows** (one row per catalog seq), so the per-seq band detail surfaces in the audit_table.rows shape that all observability surfaces consume — not just in the buried `records_meta.seq_violations` array.
* **Surfaced by:** Spec 79 §6 Final Cap CoA chain re-run (2026-05-19 21:05:20). The chain FAILED at `coa:assert_lifecycle_phase_distribution` with `phase_P3_count = 2355 vs threshold 716..970`. User feedback: the phase-PN rows are the **legacy** aggregate format; the post-E.4 design intent is per-seq granularity in the audit_table itself, not just in records_meta.
* **Target Spec:** Spec 84 §3.4 (per-seq band assertion) + Spec 48 §3.6 (audit_table row-derived cascade) + Spec 47 §8.2 (audit_table.rows contract).

## Current state

`scripts/quality/assert-lifecycle-phase-distribution.js` already computes the per-seq results:
- `seqDistribution[seq]` → actual count per seq
- `seqBands[seq]` → `{min, max}` per seq from logic_variables
- `catalogNullCountSeqs` → INFO-only seqs (rows_count = 0 in catalog)
- per-kind status routing logic (band_violation / no_band_configured / expected_data_missing) at lines 333-420

It just doesn't EMIT these as audit_table rows. Instead it emits:
- `phase_P3_count` through `phase_P9_count` (legacy phase aggregates, lines 484-558)
- `seq_bands_total / passing / warn / failing / null_catalog_count` (aggregates, lines 567-625)

## Proposed change

### Remove
The 7 `phase_PN_count` rows (lines 484-558 — the legacy Phase E.2 format). They're superseded by the per-seq detail.

### Add
Per-seq audit row inside the existing catalog iteration loop (line 333):
```js
const status = catalogNullCountSeqs.has(seq) ? 'INFO'
             : inBand                          ? 'PASS'
             : promoteToFail_band_violation    ? 'FAIL'
             :                                   'WARN';
auditRows.push({
  metric: `lifecycle_seq_${String(seq).padStart(2, '0')}_count`,
  value: actual,
  threshold: catalogNullCountSeqs.has(seq) ? 'no upper bound (catalog rows_count=0)'
           : band.max === null             ? `>= ${band.min} (no upper bound)`
           :                                 `${band.min}..${band.max}`,
  status,
});
```

Padding the seq to 2 digits keeps the metric names alphabetically sortable (`lifecycle_seq_03_count` < `lifecycle_seq_22_count`).

### Keep
- `seq_bands_total / passing / warn / failing / null_catalog_count` aggregates (Phase E.4 ops-level summary — useful for the row-derived verdict cascade and dashboard widgets that don't want to fan out across 110 rows).
- `unclassified_count`, `cross_check_stalled / active_inspection / permit_issued`, `seq_unclassified_count` — orthogonal to per-seq bands.
- `lifecycle_seq_band_promote_to_fail_*` flags (E.5 posture).
- `sys_velocity_rows_sec`, `sys_duration_ms` — performance metrics.
- The bidirectional symmetric-diff loops at lines 367-420 (`no_band_configured`, `expected_data_missing`) — those produce additional violations that the per-seq row in the main loop won't cover. **Question:** should these too emit rows? Probably yes — added as `lifecycle_seq_NN_no_band_configured` and `lifecycle_seq_NN_expected_data_missing` rows.

## Test plan
1. Update `src/tests/lifecycle-seq-bands-parity.infra.test.ts` (or a new `.infra.test.ts` if it doesn't cover this script):
   - assert audit_table.rows includes at least 110 metrics matching `/^lifecycle_seq_\d{2}_count$/`
   - assert NO phase_P\d+_count metrics remain
   - assert aggregate rows (`seq_bands_total`, etc.) still present
2. Update `src/tests/assert-lifecycle-phase-distribution.*` if existing tests reference the phase_PN rows.

## Standards Compliance
- **Spec 47 §R10 PIPELINE_SUMMARY:** audit_table.rows shape preserved (metric/value/threshold/status); row count grows from ~25 to ~135. Downstream consumers iterate rows; no positional indexing.
- **Spec 48 §3.6 row-derived cascade:** verdict still computed via `rows.some(r => r.status === 'FAIL')` — unchanged.
- **§2 Error Handling:** no new catch blocks.
- **§6 Logging:** unchanged.

## Execution Plan
- [ ] **Red Light:** Update existing test (or add new) asserting the 110-row shape
- [ ] **Implementation:** ~25 LOC change in the catalog iteration loop, ~15 LOC removed for phase_PN block
- [ ] Multi-Agent Review: Independent + Gemini + DeepSeek (per user's earlier directive on Spec 79 WF3s)
- [ ] **Verify:** re-run CoA chain via admin UI; confirm 110 lifecycle_seq_NN_count rows in audit_table; UI Phase Distribution panel now shows per-seq detail
- [ ] Green Light: typecheck + tests
- [ ] WF6 close-out: commit + archive

## Operating Boundaries
* **Target files:**
  - `scripts/quality/assert-lifecycle-phase-distribution.js` (~25 LOC added, ~75 LOC removed)
  - 1-2 test files in `src/tests/`
* **Out-of-scope:**
  - Recalibrating the band values themselves (separate WF3 — the bands derived from global catalog rows_count vs per-chain actuals is HIGH-5 root cause; needs catalog split, separate finding)
  - Changing the per-kind posture routing (E.5 design)
  - Modifying the UI's Phase Distribution panel rendering
  - Changing `records_meta.seq_violations` shape (kept for back-compat)
