# CoA classify_coa_trades — Spec 80 §5.B.5 Phase 3 Archetype Bundle Validation Record

**Date:** 2026-06-19
**Spec:** `docs/specs/01-pipeline/80_taxonomies.md` §5.B.5 + `48_pipeline_observability.md` §3.6/§3.7/§3.8
**Run:** local dev DB (`buildo-postgis`), forced reclassify of all 32,544 scope-classified CoAs.
**Per Spec 48 §3.8: actual `pipeline_runs.records_meta` JSON + `audit_table.rows` shape below — not asserted compliance.**

## Headline

| Metric | Before (direct-matrix only) | After (+ §5.B.5 bundle prior) |
|---|---|---|
| `cov_trade_vocab(coa)` distinct trade_ids | **19** / 36 | **35 / 36** → cov row `35/35 (100%)` **PASS** |
| coa `lead_trades` rows (active) | 440,825 | 935,758 written |
| CoA leads with ≥1 trade | 29,992 | 30,257 |
| avg trades / lead (`avg_trades_per_lead`) | ~14.7 | 30.93 |
| verdict | — | **PASS** |
| `slug_resolution_miss_count` | 0 | **0** (R4 bundle-slug∈vocab invariant holds live) |

_(Numbers are the post-output-review run, 2026-06-19, after folding: provenance-based precision
counting + `condo`→FB + `third-storey`→ADD vocab additions.)_

The coverage gap that motivated the transparency initiative (CoA 19/38 dark trades) is closed
on the trade axis: the bundle prior lights up the interior-finish + service trades the coarse
direct matrix never emitted (trim-work, millwork-cabinetry, tiling, stone-countertops, caulking,
site-maintenance, solar, security, eavestrough-siding, overhead-doors, site-preparation, …).

## Precision split (Spec 48 §3.6 INFO rows — emitted every run, even at 0)

Split by **provenance**, not a confidence proxy (output-review fold — Code Reviewer + Regression
Guardian flagged that a confidence proxy mislabels a direct-matrix hit landing at exactly the
0.55 bundle tier as bundle-only; ~27K such trades moved to `strong` after the fix):

- `coa_trades_strong_signal` = **417,101** (emitted by the direct tag-matrix)
- `coa_trades_bundle_only`   = **494,958** (the archetype bundle is the slug's sole source; ~54% of emissions)

bundle_only being the larger half is expected for a recall-boosting prior; 0.55 sits **above**
the 0.50 lead-feed gate by design (mig 182), so these are real (lower-confidence) forward leads.
The counter makes the ratio visible + operator-tunable via `archetype_bundle_confidence`.

## Over-broad-bundle check (the permit-side concern, re-run for CoA)

`avg_trades_per_lead = 30.93` is high but **not** the narrow-companion over-emission pathology
permits had (CoA has no narrow companion applications). It is driven by the corpus composition
and is **parity with how a new-build PERMIT is classified** (same FB 32-trade bundle):

```
project_type distribution (32,544 scope-classified CoAs):
  NewConstruction  11,680   → FB (32-trade build bundle)   ← largest cohort
  Mixed             8,332   → pt-axis null; tags drive (most carry new-construction/addition)
  Addition          5,032   → ADD (26-trade bundle)
  (null)            3,109   → tags drive
  Severance         2,203   → pt-axis null; variance tags → few/no trades
  Alteration        2,133   → INT (13-trade bundle)
  Demolition           55   → demolition trade only
project_type ∈ {NewConstruction, Addition, Alteration} = 18,845 / 32,544
coa_zero_trades = 1,042 (3.3%) — variance/severance with no construction tags (bundle correctly silent)
```

Every sampled ≥32-trade CoA carries a genuine construction scope tag — the archetype is NOT
misapplied:

```
coa:A0208/26NY  pt=NewConstruction n=33 tags=[apartment, dwelling, new-construction, residential]
coa:A0437/26TEY pt=NewConstruction n=32 tags=[new-construction]
coa:A0057/26SC  pt=Addition        n=34 tags=[addition, dwelling, garage, new-construction, two-storey]
coa:A0136/26EYK pt=Mixed           n=33 tags=[accessory-structure, addition, demolition, new-construction, rear-addition, two-storey]
coa:A0299/26TEY pt=NewConstruction n=33 tags=[basement, dwelling, new-construction, third-storey, two-storey]
```

**Operator lever (deferred, not a bug):** if CoA forward leads should be weighted below permit
leads, lower `archetype_bundle_confidence` for the CoA scope, or gate `Mixed` harder. Tracked as
a tuning option, not a defect — the archetype derivation is correct.

## Downstream blast radius (verified)

`compute-trade-forecasts.js` Phase F.1 reads `FROM lead_trades WHERE lead_id LIKE 'coa:%'`
(gated by `coaGateActive`), so the extra bundle trades propagate to `trade_forecasts(coa:%)` →
`opportunity_score` → lead feed. Additive/correct. First-deploy spike runbook:
`docs/runbook/spec80_coa_bundle_first_deploy_spike.md`.

## Actual records_meta (audit_table.rows — Spec 48 §3.8)

```json
{
  "records_total": 31287,
  "records_new": 3765,
  "records_updated": 931993,
  "records_meta": {
    "coa_processed": 31287,
    "coa_with_trades": 30257,
    "coa_zero_trades": 1030,
    "residential_count": 23699,
    "realtor_append_count": 23699,
    "coa_trades_strong_signal": 417101,
    "coa_trades_bundle_only": 494958,
    "slug_resolution_miss_count": 0,
    "audit_table": {
      "phase": 42,
      "name": "CoA Trade Classification",
      "verdict": "PASS",
      "rows": [
        { "metric": "coa_eligible", "value": 31287, "threshold": "> 0", "status": "PASS" },
        { "metric": "coa_with_trades", "value": 30257, "status": "INFO" },
        { "metric": "coa_zero_trades", "value": 1030, "status": "INFO" },
        { "metric": "unmapped_scope_pct", "value": "3.3%", "threshold": "<= 20%", "status": "PASS" },
        { "metric": "realtor_inclusion_pct", "value": "100.0%", "status": "INFO" },
        { "metric": "avg_trades_per_lead", "value": "30.93", "status": "INFO" },
        { "metric": "slug_resolution_miss_count", "value": 0, "threshold": "== 0", "status": "PASS" },
        { "metric": "records_new", "value": 3765, "status": "INFO" },
        { "metric": "records_updated", "value": 931993, "status": "INFO" },
        { "metric": "total_lead_trades_written", "value": 935758, "status": "INFO" },
        { "metric": "coa_trades_strong_signal", "value": 417101, "status": "INFO" },
        { "metric": "coa_trades_bundle_only", "value": 494958, "status": "INFO" },
        { "metric": "sys_velocity_rows_sec", "value": 434.73, "status": "INFO" },
        { "metric": "sys_duration_ms", "value": 71969, "status": "INFO" },
        { "metric": "cov_trade_vocab", "value": "35/35 (100%)", "threshold": ">= 90%", "status": "PASS" }
      ]
    }
  }
}
```
_(`records_new` 3,765 / `records_updated` 931,993: this was a re-run over the already-classified
corpus, so most rows UPSERT-update; on the genuine first post-deploy run these split differently —
see the runbook's spike shape.)_

Note the two new precision rows (`coa_trades_strong_signal`, `coa_trades_bundle_only`) emit as
INFO and would persist at `value: 0` on a steady-state run with no eligible CoAs (§3.6 zero-row
preservation). `cov_trade_vocab` is the verdict-driving row (§4.4 escalate-only recompute).
