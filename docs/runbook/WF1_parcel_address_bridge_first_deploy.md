# WF1 #parcel-address-bridge — First-Deploy Runbook

**Owning spec:** `docs/specs/01-pipeline/54_source_address_points.md` (PRIMARY) + `docs/specs/01-pipeline/55_source_parcels.md` + `docs/specs/01-pipeline/48_pipeline_observability.md` §3.6
**Pattern:** Spec 48 §3.6 + F1 baseline-quiet-period (NOT §3.7 — `parcel_address_points` is a Tier 1 spatial cache, not a Tier 3 audit ledger)
**Active task:** `.cursor/active_task.md` (plan v4 — 33+ folded findings across 3 PLAN review rounds; v4 PLAN LOCKED 2026-05-23)
**Owner:** Operator on shift during first 7 days post-deploy
**WF1 commit series:**
- Phase 1 `2501aa0` — mig 162 (address_points 12 new cols + geom + parcel_address_points bridge table) + Day-1 COALESCE-preserve UPSERT in load-parcels
- Phase 2a `4758f2d` — one-time geom backfill script (lock 116)
- Phase 2b `10db268` — load-address-points 12-field extension + shared normalizers + drift detector
- Phase 2c `d44b445` — link-parcel-addresses spatial bridge populator (lock 115) + manifest + FreshnessTimeline UI
- Phase 2d `1ba020b` — link-parcels Strategy 1a (bridge path, confidence 0.97)
- Phase 2e `986409e` — link-coa-to-parcels bridge-path Tier 1a
- Phase 2f.1 `dee9470` — 7-spec sync + wf3-queue Cycle 2 closure
- Phase 2f.3 `94abd19` — metrics.ts match_type fix + RELATIONSHIPS + §10.3 audit

---

## Why this runbook exists

WF1 #parcel-address-bridge introduces:
- **1 new pipeline step** (`link-parcel-addresses`) in the sources chain
- **~17 new audit_table.rows metrics** across Phases 2a/2b/2c/2d/2e
- **2 new INFO sibling counters** (`tier_1_via_bridge` in link-parcels, `tier_1a_via_bridge` in link-coa-to-parcels) that cold-start at 0
- **1 new match_type enum value** (`address_points_exact`) in `permit_parcels` + `lead_parcels`
- **~486K new bridge rows** on first run of `link-parcel-addresses` (one-shot bulk INSERT)

The Spec 48 Observer's 7-day rolling baseline math expects ≥7 days of stable history per metric before its anomaly detection produces meaningful signal. On Day 0, those baselines are empty; for the next 7 days they're noisy. The initial ~486K-row INSERT will be flagged as CRITICAL by DeepSeek's anomaly narrative for the first 7 days regardless of correctness.

Without operator annotations the Observer's daily `permits-followup.md` / `coa-followup.md` reports surface a flood of expected anomalies that mask real signal.

---

## Pre-deploy

### Estimate query (PI-2 from plan v4)

Run against staging to forecast `parcel_address_points` row count + zero-address-parcel coverage:

```sql
-- Expected parcel_address_points cardinality after first link-parcel-addresses run
SELECT
  COUNT(DISTINCT p.id) FILTER (WHERE EXISTS (
    SELECT 1 FROM address_points ap
    WHERE ap.geom IS NOT NULL AND ST_Within(ap.geom, p.geom)
  )) AS parcels_with_addresses,
  COUNT(DISTINCT p.id) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM address_points ap
    WHERE ap.geom IS NOT NULL AND ST_Within(ap.geom, p.geom)
  )) AS parcels_with_no_addresses,
  COUNT(DISTINCT p.id) AS parcels_total
FROM parcels p
WHERE p.geom IS NOT NULL;
```

Plan v4 PI-2 estimate (sampled): avg 1.0 ap/parcel, p99=1, max=3, ~37% parcels with zero addresses. Expected total `parcel_address_points` rows ≈ 486K.

### VALIDATE CONSTRAINT lock-duration estimate (plan v4 fold M3)

Mig 162 already applied in commit `2501aa0` (Phase 1). For any re-deploy, estimate the SHARE UPDATE EXCLUSIVE lock duration on staging:

```sql
EXPLAIN (ANALYZE, BUFFERS) ALTER TABLE parcel_address_points VALIDATE CONSTRAINT fk_parcel_address_points_parcel;
```

Expected: 30s–2min for 486K + 525K parent-table reference scan. If staging exceeds 60s, schedule production application during a low-traffic window.

---

## Deploy order

1. **Apply mig 162** (if not yet applied — already applied 2026-05-23 in commit `2501aa0`). Verifies via `\d address_points` showing the 12 new cols + geom + GIST index, and `\d parcel_address_points` showing PK + 2 FKs + reverse index.
2. **Run the one-time geom backfill** (`node scripts/one-time/backfill-address-points-geom.js`):
   - Expected duration: ~5–15 min on a 525K-row table
   - Idempotent via `WHERE geom IS NULL`; safe to re-run if interrupted
   - **Mid-run failure recovery:** the script commits per 5000-row batch. On Ctrl-C or error, the next run picks up where it left off (no manual cleanup). Monitor progress via:
     ```sql
     SELECT COUNT(*) FROM address_points WHERE geom IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;
     ```
     Should decrement to 0.
3. **Run the sources chain** which now includes `link_parcel_addresses`:
   - First run will INSERT ~486K rows into `parcel_address_points`
   - Subsequent runs are near-noop (ON CONFLICT DO NOTHING)
4. **Verify the chain didn't break Phase 2d/2e consumers** — first run of `link-parcels` should show non-zero `tier_1_via_bridge` in its audit_table; similarly for `link-coa-to-parcels` `tier_1a_via_bridge`.

---

## Per-metric watch table (Phases 2a–2e new audit rows)

| Phase | Script | Metric | First 7 days expected | Stable steady state |
|-------|--------|--------|-----------------------|---------------------|
| 2a | backfill-address-points-geom | `pending_pre_run` | ~525K (one-shot) | 0 (script not re-run) |
| 2a | ″ | `rows_backfilled` | ~525K (one-shot) | 0 |
| 2a | ″ | `rows_with_null_coords` | Small fixed count | Stable (data quality artifact) |
| 2a | ″ | `remaining_pending` | 0 after first successful run | 0 |
| 2a | ″ | `errors` | 0 (FAIL if > 0) | 0 |
| 2b | load-address-points | `address_points_csv_schema_drift` | `none` (PASS) unless Toronto strips more cols | `none` (PASS) |
| 2b | ″ | `address_points_null_address_number_pct` | < 10% (PASS) | < 10% (PASS) |
| 2c | link-parcel-addresses | `parcels_with_geom_pre_run` | ~486K | ~486K (stable) |
| 2c | ″ | `address_points_with_geom_pre_run` | ~525K | ~525K (stable) |
| 2c | ″ | `address_points_with_null_geom` | 0 if Phase 2a backfill completed (PASS); WARN if > 0 | 0 (PASS) — terminal backfill-complete signal |
| 2c | ″ | `new_links_written` | ~486K on Day 1; near-0 thereafter | ~0 per run (idempotent) |
| 2c | ″ | `final_link_count` | ~486K (FAIL gate: `> 0`) | ~486K (PASS); FAIL if 0 |
| 2c | ″ | `parcels_with_links` | ~300K (matches PI-2 estimate) | Stable |
| 2c | ″ | `parcels_with_no_address_pct` | ~37% (PASS, threshold `< 50%`) | Stable; WARN if regresses upward |
| 2c | ″ | `address_points_with_no_parcel_pct` | < 5% (PASS) | Stable |
| 2c | ″ | `errors` | 0 (FAIL if > 0) | 0 |
| 2d | link-parcels | `tier_1_exact_address` (legacy, F17-preserved) | Stable (combined rollup) | Stable |
| 2d | ″ | `tier_1_via_bridge` (NEW sibling) | Climbs from 0 — volatile during Day 1–7 | Tracks proportion of bridge-path matches; grows as new permits prefer the bridge |
| 2e | link-coa-to-parcels | `tier_1a_exact` (legacy, F17-preserved) | Stable (combined rollup) | Stable |
| 2e | ″ | `tier_1a_via_bridge` (NEW sibling) | Climbs from 0 — volatile during Day 1–7 | Tracks bridge-path match proportion for CoAs |

---

## Operator annotation protocol

For the first 7 days post-deploy, append the following block to both `docs/reports/pipeline-observability/permits-followup.md` and `coa-followup.md` daily Observer narrative entries:

```markdown
> **[WF1 #parcel-address-bridge first-deploy — Day X of 7]**
> WF1 deployed 2026-05-23 (commits 2501aa0 .. 94abd19). Anomaly signals from these metrics are EXPECTED during baseline warmup and do not require action: tier_1_via_bridge, tier_1a_via_bridge, new_links_written, parcels_with_links, address_points_with_null_geom, parcel_address_points_inserted (DeepSeek will flag the initial ~486K-row INSERT as CRITICAL anomaly — this is expected).
> Spec 48 §3.4 7-day baseline math will produce stable signal from Day 8 onward.
```

---

## Day 1 actuals recording (operator fills in after first staging run)

Compare actuals against PI-2 plan estimates:

| Metric | PI-2 estimate | Day 1 actual | Within tolerance? |
|--------|---------------|--------------|-------------------|
| `parcel_address_points` row count | ~486K | __________ | ±10% expected |
| `parcels_with_links` | ~300K | __________ | ±10% expected |
| `parcels_with_no_address_pct` | ~37% | __________ | < 50% per audit threshold |
| `address_points_with_null_geom` | 0 (post-backfill) | __________ | Must = 0 |
| `tier_1_via_bridge` / total Tier 1 matches | ramping | __________ | Climbs from Day 1 |
| `final_link_count` | > 0 | __________ | Must be > 0 (FAIL gate) |

If any "Within tolerance?" answer is NO, see Rollback below + the relevant Phase commit's review_followups.md row.

---

## 3-criteria exit gate (operator removes annotations once all 3 hold)

1. **7 consecutive sources chain runs** with `parcels_with_no_address_pct` stable (within ±10% of Day 7 value) AND `address_text_mismatch_count` < 1%
2. **DeepSeek narrative** no longer flags `tier_1_via_bridge`, `tier_1a_via_bridge`, `new_links_written`, or `parcel_address_points_inserted` as anomalous in 7 consecutive runs
3. **`address_points_with_null_geom` audit row = 0** for 3 consecutive runs (terminal backfill-complete signal — confirms Phase 2a backfill remains complete)

---

## Known false-positives during quiet period (plan v4 fold M1)

- **`address_text_mismatch_count` spuriously flags after normalizer update** — if `scripts/lib/address-normalizers.js` is updated WITHOUT re-running `backfill-address-points-geom.js`, the bridge's pre-computed `address_points.addr_num_normalized` + `linear_name_normalized` will drift from the new normalizer's output, producing a flood of WARN-grade text mismatches. **Mitigation:** any change to `scripts/lib/address-normalizers.js` MUST be paired with a fresh backfill+link-parcel-addresses run.
- **`tier_1_via_bridge = 0` while bridge appears empty** — if `parcel_address_points` table itself is empty (e.g., link-parcel-addresses hasn't run yet), bridge counter will stay at 0. Phase 2c's `final_link_count > 0` FAIL gate catches the table-empty case at the chain level before downstream consumers run.
- **`overlapping_parcels_count` non-zero** — expected. PI-5 estimate: ~2.7% of address points fall within multiple parcels (boundary overlap). Disambiguation via plan v4 fold H5/C2/F19 uniform 3-level rule selects deterministically. No alert.

---

## Rollback procedure (Rule 6 — manual)

Mig 162 DOWN block is comments-only per project Rule 6. Manual rollback procedure (only execute if a FAIL verdict from Phase 2c or downstream cascades to production data loss):

1. **Pause the sources chain** — set `chain_gates.sources` in `scripts/manifest.json` to a gate that fails, OR set `OBSERVABILITY_ENABLED=0` on the cron.
2. **Identify the affected commit range** — see `git log --oneline 1e6e5d9..94abd19` for the WF1 commit series.
3. **For each commit (in reverse order)**, `git revert <SHA>` and verify tests pass.
4. **Manual DOWN SQL** if mig 162 needs reversal (rare — only if the bridge table corrupts downstream data):
   ```sql
   -- See active_task.md DOWN block (Rule 6 comments-only)
   ALTER TABLE parcel_address_points DROP CONSTRAINT IF EXISTS fk_parcel_address_points_address_point;
   ALTER TABLE parcel_address_points DROP CONSTRAINT IF EXISTS fk_parcel_address_points_parcel;
   DROP INDEX IF EXISTS idx_parcel_address_points_address_point_id;
   DROP TABLE IF EXISTS parcel_address_points;
   DROP INDEX IF EXISTS idx_address_points_linear_name_normalized;
   DROP INDEX IF EXISTS idx_address_points_addr_num_normalized;
   DROP INDEX IF EXISTS idx_address_points_geom_gist;
   ALTER TABLE address_points
     DROP COLUMN IF EXISTS linear_name_normalized,
     DROP COLUMN IF EXISTS addr_num_normalized,
     DROP COLUMN IF EXISTS geom,
     DROP COLUMN IF EXISTS place_name,
     DROP COLUMN IF EXISTS class_family_desc,
     DROP COLUMN IF EXISTS address_class_desc,
     DROP COLUMN IF EXISTS address_status,
     DROP COLUMN IF EXISTS maint_stage,
     DROP COLUMN IF EXISTS hi_num,
     DROP COLUMN IF EXISTS lo_num,
     DROP COLUMN IF EXISTS address_full,
     DROP COLUMN IF EXISTS linear_name_full,
     DROP COLUMN IF EXISTS address_number;
   ```
5. **Note on permit_parcels / lead_parcels match_type='address_points_exact'**: rows written with this value auto-revert on the next `link-parcels` / `link-coa-to-parcels` run (the upsert rewrites `match_type` from the cascade). No manual cleanup of `permit_parcels` / `lead_parcels` needed.

---

## Spec references

- `docs/specs/01-pipeline/30_pipeline_architecture.md` §4.2 + §4.2.1 — PostGIS dependency + bridge architecture
- `docs/specs/01-pipeline/54_source_address_points.md` — PRIMARY canonical address table
- `docs/specs/01-pipeline/55_source_parcels.md` — 2026-05-20 CKAN strip event + LEGACY columns
- `docs/specs/01-pipeline/41_chain_permits.md` — link-parcels Strategy 1a
- `docs/specs/01-pipeline/42_chain_coa.md` — link-coa-to-parcels bridge Tier 1a
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 — locks 115/116
- `docs/specs/01-pipeline/48_pipeline_observability.md` §3.6 — verdict cascade
- `docs/reports/pipeline-validation/wf3-queue.md` — Cycle 2 Env-1 closure
- `docs/reports/review_followups.md` rows 215-332 — full Phase 2 triage
