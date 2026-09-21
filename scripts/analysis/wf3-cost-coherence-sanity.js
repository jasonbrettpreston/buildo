// WF3 cost-coherence reality check (re-runnable). Pulls a diverse sample, snapshots the OLD
// bylaw_max_fsi, re-enriches the sample scoped (zoning→max-build→existing→optconfig, full=true),
// re-costs each parcel in-process, and prints:
//   - fsi_before → fsi_after   (Fix B: borrowed sliver FSI on RD/RS should drop to null)
//   - new_build vs coa_build    (Fix A: new_build must be ≤ coa_build — coherent)
// Database target resolved via createResolvedPool (Spec 122 §P0 — DATABASE_URL/env, fail-loud,
// floor-asserted; never a hardcoded connection string). Read-only except the scoped re-enrich UPDATE.
// Usage: node scripts/analysis/wf3-cost-coherence-sanity.js
//
// RE-POINTED — WF3 C6 (`.cursor/wf3_test_db_suite_red_active_task.md`, 2026-09-21). The ENRICHER
// conversion (commit d79191cf) retired `scripts/enrich-parcels.js`'s function-export surface
// (enrichParcels/enrichMaxBuild/enrichExistingStructure/enrichOptimalConfig — now a 41-line
// pipeline.step() shim exporting only {descriptor, compute, run}) without sweeping this script,
// which called all four and threw TypeError on first use. Retargeted onto the real
// runPass1/runPass2/runPass3/runPass5 in scripts/lib/compute/enrich-parcels.js, driven by a
// hand-built ctx mirroring the real runner's shape (scripts/lib/step/index.js runEnrichPhase
// shared-txn passCtx / post-commit passCtx) — same bridge shape as the batch-2 row 2.4 fix to
// buildParcelCostMenu's opts.config just below, and the same one src/tests/db/_lib/
// enrich-parcels-harness.js uses for the live-DB test suite (WF3 C2). Pass 4 (comparable_builds)
// stays deliberately UNCALLED, exactly as it was before the conversion — this script's own scope
// is cost re-coherence (max-build/existing-structure/optconfig), not comps.
'use strict';
// Spec 122 §P0 — the single database-target resolver (fail-loud, floor-asserted).
const { createResolvedPool } = require('../lib/resolve-db');
const descriptor = require('../enrich-parcels.descriptor.json');
const compute = require('../lib/compute/enrich-parcels.js');
const { resolveConfig } = require('../lib/step/config.js');
const { streamOverClient } = require('../lib/step/index.js');
const { buildParcelCostMenu } = require('../lib/parcel-cost.js');
const { parcelFamilyFromZoning } = require('../lib/build-norms.js');
const pipeline = require('../lib/pipeline.js');

// A few flagged anchors (2 fixed inversions + 1 legit-FSI-preserved + 1 normal) + suspects below.
// Kept small: this box's PostGIS re-enrich is ~slow, so a lean scope finishes in a few minutes.
const FLAGGED = [1786, 7281, 1842, 1455];
const SUSPECT_LIMIT = 10;

/** ctx shape mirroring runEnrichPhase's own passCtx (scripts/lib/step/index.js :3520/:3754). */
function makeCtx({ scopeWhere, config, runAt, extra }) {
  return {
    full: true,
    scopeWhere,
    staleOverlays: new Set(),
    contract: null,
    clock: { now: () => runAt, asOfDate: () => runAt.toISOString().slice(0, 10) },
    log: pipeline.log,
    config,
    scopeRunId: Math.floor(runAt.getTime() / 1000),
    onProgress: () => {},
    ...extra,
  };
}

(async () => {
  const pool = createResolvedPool({ label: 'wf3-cost-coherence-sanity' });

  // Build the sample: flagged 11 + up to 25 borrowed-FSI suspects (RD/RS with fsi≥1.5 today)
  // + up to 12 diverse across other residential zones. Deterministic (ORDER BY id).
  const suspects = (await pool.query(`
    SELECT id FROM parcels
    WHERE upper(zoning_class) IN ('RD','RS') AND bylaw_max_fsi >= 1.5
      AND max_buildable_gfa_sqm IS NOT NULL
    ORDER BY id LIMIT ${SUSPECT_LIMIT}`)).rows.map((r) => r.id);
  const IDS = [...new Set([...FLAGGED, ...suspects])];
  const SCOPE = `p.id IN (${IDS.join(',')})`;
  console.log(`Sample: ${IDS.length} parcels (${FLAGGED.length} flagged anchors + ${suspects.length} borrowed-FSI suspects)`);

  // Snapshot OLD fsi before re-enriching.
  const before = {};
  for (const r of (await pool.query(`SELECT p.id, p.bylaw_max_fsi::float8 AS fsi FROM parcels p WHERE ${SCOPE}`)).rows) before[r.id] = r.fsi;

  // Re-enrich the sample scoped, full=true — real config (resolveConfig), never a hand-typed
  // literal default: the SAME source of truth the real runner and the live-DB test suite use.
  const { values: config } = await resolveConfig(pool, descriptor);

  // Passes 1-3 (zoning/max-build/existing-structure) — shared txn, mirrors runEnrichPhase's
  // sharedPhases loop. Pass 4 (comparable_builds) is deliberately NOT called (see header).
  await pipeline.withTransaction(pool, async (client) => {
    const runAt = await pipeline.getDbTimestamp(client);
    const ctx = makeCtx({ scopeWhere: SCOPE, config, runAt });
    await compute.runPass1(client, ctx, config);
    await compute.runPass2(client, ctx, config);
    await compute.runPass3(client, ctx, config);
  });

  // Pass 5 (optimal_config) — post_commit, autocommit-batched, TWO dedicated connections
  // (a write client for flushBatch's own per-batch BEGIN/COMMIT + a SEPARATE stream client —
  // reusing one for both is the documented H1 deadlock, scripts/lib/step/index.js :3648).
  {
    const writeClient = await pool.connect();
    const streamClient = await pool.connect();
    try {
      const runAt = await pipeline.getDbTimestamp(pool);
      const streamBatchSize = Number(config.enrich_parcels_pass5_stream_batch_size);
      const flushBatch = async (sql, params) => {
        await writeClient.query('BEGIN');
        try {
          const result = await writeClient.query(sql, params);
          await writeClient.query('COMMIT');
          return result;
        } catch (err) {
          await writeClient.query('ROLLBACK').catch(() => {});
          throw err;
        }
      };
      const ctx = makeCtx({
        scopeWhere: SCOPE, config, runAt,
        extra: {
          stream: (sql, params, opts) => streamOverClient(streamClient, sql, params, { batchSize: streamBatchSize, ...opts }),
          flushBatch,
        },
      });
      await compute.runPass5(writeClient, ctx, config);
    } finally {
      writeClient.release();
      streamClient.release();
    }
  }

  const rates = {};
  for (const r of (await pool.query(`SELECT * FROM archetype_cost_rates`)).rows) rates[r.archetype] = r;
  const idxRow = (await pool.query(`SELECT variable_value FROM logic_variables WHERE variable_key='cost_escalation_index'`)).rows[0];
  const indexNow = idxRow ? Number(idxRow.variable_value) : 100;
  // Batch-2 row 2.4 (FOLD-V8) — buildParcelCostMenu now requires opts.config (the 6 engine
  // tunables, Rule 3). This is a non-step analysis script (no descriptor, no LM-D15), so a
  // read-live-else-seed-default fallback is appropriate here (unlike inside the engine itself).
  const cfgRows = (await pool.query(
    `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1)`,
    [['compute_parcel_cost_fsi_max_plausible', 'compute_parcel_cost_escalation_min_multiplier',
      'compute_parcel_cost_escalation_fallback_multiplier', 'compute_parcel_cost_premium_default',
      'compute_parcel_cost_adjustment_factor_default', 'compute_parcel_cost_min_priceable_area_sqm']],
  )).rows.reduce((m, r) => ({ ...m, [r.variable_key]: Number(r.variable_value) }), {});
  const engineConfig = {
    fsiMaxPlausible: cfgRows.compute_parcel_cost_fsi_max_plausible ?? 99.999,
    escalationMinMultiplier: cfgRows.compute_parcel_cost_escalation_min_multiplier ?? 1,
    escalationFallbackMultiplier: cfgRows.compute_parcel_cost_escalation_fallback_multiplier ?? 1,
    premiumDefault: cfgRows.compute_parcel_cost_premium_default ?? 1,
    adjustmentFactorDefault: cfgRows.compute_parcel_cost_adjustment_factor_default ?? 1,
    minPriceableAreaSqm: cfgRows.compute_parcel_cost_min_priceable_area_sqm ?? 0,
  };

  const rows = (await pool.query(`
    SELECT p.id, p.zoning_class AS zc, p.lot_size_sqm::float8 AS lot, p.bylaw_max_fsi::float8 AS fsi_after,
           p.opt_aor_gfa_sqm::float8 AS opt_aor, p.max_buildable_gfa_sqm::float8 AS maxb, p.opt_coa_gfa_sqm::float8 AS opt_coa,
           p.zoning_is_ambiguous AS amb, COALESCE(p.opt_aor_gfa_sqm, p.max_buildable_gfa_sqm)::float8 AS new_build_area,
           p.max_buildable_footprint_sqm::float8 AS max_buildable_footprint_sqm,
           p.max_garden_suite_gfa_sqm::float8 AS max_garden_suite_gfa_sqm, p.max_laneway_suite_gfa_sqm::float8 AS max_laneway_suite_gfa_sqm,
           p.cur_est_kitchen_gfa_sqm::float8 AS cur_est_kitchen_gfa_sqm, p.cur_est_bath_gfa_sqm::float8 AS cur_est_bath_gfa_sqm,
           p.max_garage_gfa_sqm::float8 AS max_garage_gfa_sqm, p.cur_floor_gfa_sqm::float8 AS cur_floor_gfa_sqm,
           p.cur_pot_2story_gfa_sqm::float8 AS cur_pot_2story_gfa_sqm, p.realized_fsi_p90::float8 AS realized_fsi_p90,
           p.neighbourhood_cost_premium::float8 AS neighbourhood_cost_premium, p.rear_suite_permission, p.garage_permission, p.max_build_confidence
    FROM parcels p WHERE ${SCOPE} ORDER BY p.zoning_class, p.id`)).rows;

  const fmt = (n) => n == null ? 'null' : '$' + Math.round(n).toLocaleString();
  let inverted = 0, borrowFixed = 0;
  const out = rows.map((r) => {
    const parcel = { ...r, opt_aor_gfa_sqm: r.new_build_area, max_buildable_gfa_sqm: r.maxb, opt_coa_gfa_sqm: r.opt_coa };
    const built = buildParcelCostMenu(parcel, rates, indexNow, { r2Grounded: parcelFamilyFromZoning(r.zc) === 'detached', config: engineConfig });
    const nb = built.menu.max_build ? built.menu.max_build.total : null;
    const coa = built.menu.coa_build ? built.menu.coa_build.total : null;
    const coherent = (nb == null || coa == null) ? 'n/a' : (nb <= coa + 1 ? 'OK' : 'INVERTED');
    if (coherent === 'INVERTED') inverted++;
    const fb = before[r.id], fa = r.fsi_after;
    if (fb != null && fb >= 1.5 && (fa == null || fa < fb) && ['RD', 'RS'].includes((r.zc || '').toUpperCase())) borrowFixed++;
    return {
      id: r.id, zc: r.zc, lot: r.lot == null ? null : Math.round(r.lot),
      fsi_before: fb == null ? 'null' : fb, fsi_after: fa == null ? 'null' : fa,
      aor: r.opt_aor == null ? null : Math.round(r.opt_aor), coa_gfa: r.opt_coa == null ? null : Math.round(r.opt_coa),
      newbuild: fmt(nb), coabuild: fmt(coa), coherent,
    };
  });
  console.table(out);
  console.log(`\nSUMMARY: ${out.length} parcels · ${inverted} INVERTED (new_build > coa_build) · ${borrowFixed} borrowed-FSI RD/RS parcels corrected (fsi dropped).`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
