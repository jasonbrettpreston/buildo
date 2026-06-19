# Spec 80 §5.B.5 Phase 3 — CoA Archetype Bundle First-Deploy Spike Runbook

**Owning spec:** `docs/specs/01-pipeline/80_taxonomies.md` §5.B.5 + `48_pipeline_observability.md` §3.7
**Active task:** `.cursor/active_task.md` (Spec 80 v-next Phase 3 — CoA classifier parity)
**Owner:** Operator on shift during the first chain run after deploy + the following 7 days

---

## Why this runbook exists

Phase 3 adds the §5.B.5 **archetype bundle prior** to `scripts/classify-coa-trades.js`
(via `classifyCoaTrades()` in `scripts/lib/coa-trade-classifier.js` + its TS twin). Before
Phase 3, CoA trades came **only** from the direct `lookupTradesForTags` matrix; the bundle
prior now additionally emits the low-signal interior-finish + service trades (trim-work,
millwork-cabinetry, tiling, caulking, site-maintenance, …) at the bundle tier (0.55).

Two one-time step-changes result on the **first CoA reclassify after deploy**:

1. **`lead_trades(coa:%)` volume** rises — every eligible CoA re-classifies (the
   `trade_classified_at < scope_classified_at` cursor does NOT re-fire on its own, so a
   one-time forced reclassify, or the natural next scope re-run, drives the jump). The
   `total_lead_trades_written` / `records_updated` audit counters spike accordingly.
2. **Downstream `trade_forecasts(coa:%)` + `opportunity_score`** rise — `compute-trade-forecasts.js`
   Phase F.1 reads `FROM lead_trades WHERE lead_id LIKE 'coa:%'` (gated by `coaGateActive`),
   so the extra bundle trades propagate to CoA forecast coverage and the lead feed. This is
   **additive and correct** (more CoA lead cards), not an anomaly.

observe-chain.js's 7-day DeepSeek narrative baseline does not yet contain the elevated
`total_lead_trades_written` / `coa_trades_bundle_only` levels, so the narrative may flag the
spike as `CRITICAL`/`HIGH`. This runbook is the operator's pre-ack instrument so the spike is
not conflated with a real classification anomaly. **Annotations are for human readers only**
(Spec 48 §3.7) — observe-chain.js does not ingest them; DeepSeek will keep flagging until the
7-day window rolls.

## Metrics that move

| Metric (audit_table.rows / records_meta) | Before Phase 3 | First-run behavior | Steady state |
|---|---|---|---|
| `coa_trades_strong_signal` (INFO) | n/a (new) | direct-matrix hits above 0.55 — roughly unchanged from the old direct-only count | calibrate Day 7 |
| `coa_trades_bundle_only` (INFO) | n/a (new) | **the spike** — bundle-tier trades the direct matrix never emitted; 0 before deploy → material on first run | calibrate Day 7; ratio bundle_only ÷ (strong+bundle_only) tracks recall-vs-precision |
| `total_lead_trades_written` (INFO) | direct-only total | one-time jump (direct + bundle) | new, higher baseline |
| `avg_trades_per_lead` (INFO) | direct-only avg | rises (bundle adds trades per CoA) | new, higher baseline |
| `cov_trade_vocab` (cov_, verdict-driving) | honest, lower | climbs (more distinct trade_ids emitted on CoA) — **honest gain, never fabricated** | higher PASS band |
| `slug_resolution_miss_count` (== 0 FAIL) | 0 | **must stay 0** — pinned in-test by the R4 bundle-slug∈vocab cross-check | 0 |
| downstream `trade_forecasts(coa:%)` rows | smaller | step-up | new, higher baseline |

`coa_trades_bundle_only` and `coa_trades_strong_signal` are **INFO rows emitted every run,
even at value 0** (Spec 48 §3.6 zero-row preservation) — their absence, not a zero value,
signals a broken pathway.

## Pre-deploy estimate query (capacity + expected shape)

```sql
-- Eligible CoAs that will re-classify (and therefore re-emit trade rows) — the
-- denominator of the first-run volume jump.
SELECT COUNT(*) AS coa_eligible
  FROM coa_applications
 WHERE scope_tags IS NOT NULL
   AND scope_classified_at IS NOT NULL;

-- Of those, how many carry a scope signal the bundle prior can light up (a project_type
-- or scope_tag that maps to an archetype). These are the CoAs whose trade count grows.
-- (PascalCase project_type / CoA-vocab scope_tags — see COA_PROJECT_TYPE_MAP /
--  COA_TAG_TO_ARCHETYPE_TAG.) Use as a rough ceiling on bundle-affected CoAs.
SELECT project_type, COUNT(*) AS n
  FROM coa_applications
 WHERE scope_tags IS NOT NULL AND scope_classified_at IS NOT NULL
 GROUP BY project_type
 ORDER BY n DESC;
```

## 7-day convergence verification

Run after each daily chain to confirm the spike is converging, not a persistent regression:

```sql
-- coa_trades_bundle_only over the last 7 classify_coa_trades runs. Day 1 is the spike;
-- Day 2+ should track only the incremental re-classify churn (new/changed-scope CoAs).
SELECT id, started_at,
       records_meta->'audit_table'->'rows' AS audit_rows,
       records_meta->>'coa_trades_bundle_only'  AS bundle_only,
       records_meta->>'coa_trades_strong_signal' AS strong
  FROM pipeline_runs
 WHERE pipeline = 'coa:classify_coa_trades'
   AND started_at >= NOW() - INTERVAL '7 days'
 ORDER BY id DESC;
```

## Exit criteria (spike considered converged)

- `slug_resolution_miss_count == 0` on every run (never trips — invariant).
- `coa_trades_bundle_only` drops from the Day-1 spike to a small daily delta and holds for
  **7 consecutive runs** without the metric appearing in the observe-chain narrative.
- `cov_trade_vocab(coa)` settles at its new (higher) PASS band.
- Downstream `trade_forecasts(coa:%)` row count stabilizes at the new baseline.

Once converged, record the steady-state `coa_trades_bundle_only` / `total_lead_trades_written`
baselines in the validation record under `docs/reports/pipeline-validation/coa/` (Spec 48 §3.8)
and annotate the followup report: "Expected first-deploy spike — converged within bound."
