'use strict';
/**
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (owning spec)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8.2 (frozen step shape)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 13 rules)
 *
 * WF3 C2 (`.cursor/wf3_test_db_suite_red_active_task.md`, 2026-09-21) — a legacy-shaped call
 * surface for the enrich-parcels live-DB pass tests, bridged onto the REAL converted
 * `runPass1..5` functions (`scripts/lib/compute/enrich-parcels.js`). The ENRICHER conversion
 * (commit `d79191cf` et seq.) retired the old `scripts/enrich-parcels.js` function-export
 * surface — it is now a 41-line `pipeline.step()` shim exporting only `{descriptor, compute,
 * run}`. This module is NOT a copy of the retired code: it is a thin adapter that builds the
 * SAME `ctx`/`config` shape the real runner (`runEnrichPhase`, scripts/lib/step/index.js,
 * shared-txn passCtx :3520 / post-commit passCtx :3754) constructs, so these tests keep
 * exercising the real compute functions under real config, never a fixture-only substitute.
 *
 * `config` is resolved via the SAME `resolveConfig()` the runner uses
 * (scripts/lib/step/config.js), against this test DB's own seeded `logic_variables` — never a
 * hand-typed literal duplicate of the defaults.
 *
 * Call-site shape preserved from the retired surface: `enrichX(client, { scopeWhere, full,
 * ...configOverrides })`. The legacy per-pass grouped override objects (`acc: {...}`,
 * `reno: {...}`) have NO successor in the converted signature — `runPass2`/`runPass3` read
 * named `config` keys directly, not a grouped sub-object — so a test overriding one of those
 * knobs now overrides the named config key directly (mapped 1:1 at each call site):
 *   acc.minSoftPct  -> min_soft_landscaping_pct   (runPass2)
 *   reno.coaUplift  -> reno_coa_uplift_pct         (runPass3)
 *   reno.kitchenPct -> reno_kitchen_gfa_pct        (runPass3)
 *   reno.bathPct    -> reno_bath_gfa_pct           (runPass3)
 *   reno.mislinkTol -> mislink_footprint_lot_tol   (runPass2 AND runPass3)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require(path.join(REPO_ROOT, 'scripts/enrich-parcels.descriptor.json'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveConfig } = require(path.join(REPO_ROOT, 'scripts/lib/step/config.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertRequirements, streamOverClient } = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js'));

const silentLog = { info() {}, warn() {}, error() {}, debug() {} };

/** Resolved once per test-DB connection object — the same `logic_variables` snapshot the real runner reads. */
const configCache = new WeakMap();
async function baseConfig(poolOrClient) {
  let cached = configCache.get(poolOrClient);
  if (!cached) {
    cached = resolveConfig(poolOrClient, descriptor).then((r) => r.values);
    configCache.set(poolOrClient, cached);
  }
  return cached;
}

function makeCtx({ scopeWhere, full, config, extra }) {
  const now = new Date();
  return {
    full: !!full,
    scopeWhere,
    staleOverlays: new Set(),
    contract: null,
    clock: { now: () => now, asOfDate: () => now.toISOString().slice(0, 10) },
    log: silentLog,
    config,
    scopeRunId: Math.floor(now.getTime() / 1000),
    onProgress: () => {},
    ...extra,
  };
}

/** Splits a legacy-shaped opts object into {scopeWhere, full, configOverrides}. */
function splitOpts(opts) {
  const { scopeWhere, full, ...configOverrides } = opts || {};
  return { scopeWhere, full, configOverrides };
}

async function runSharedPass(passFn, client, opts) {
  const { scopeWhere, full, configOverrides } = splitOpts(opts);
  const base = await baseConfig(client);
  const config = { ...base, ...configOverrides };
  const ctx = makeCtx({ scopeWhere, full, config });
  return passFn(client, ctx, config);
}

/** Pass 1 (zoning). Legacy `enrichParcels(client, {scopeWhere, full})`. */
async function enrichParcels(client, opts) { return runSharedPass(compute.runPass1, client, opts); }
/** Pass 2 (max-build). Legacy `enrichMaxBuild(client, {scopeWhere, full, acc})`. */
async function enrichMaxBuild(client, opts) { return runSharedPass(compute.runPass2, client, opts); }
/** Pass 3 (existing-structure + scenarios). Legacy `enrichExistingStructure(client, {scopeWhere, full, reno})`. */
async function enrichExistingStructure(client, opts) { return runSharedPass(compute.runPass3, client, opts); }
/** Pass 4 (comparable-builds). Legacy `enrichComparableBuilds(client, {scopeWhere, full})`. */
async function enrichComparableBuilds(client, opts) { return runSharedPass(compute.runPass4, client, opts); }

/**
 * Pass 5 (optimal-config) — `txn: "post_commit"` (compute.passes[]), autocommit-batched, NOT a
 * caller-held transaction (mirrors the legacy surface, which also took `pool`, never a
 * BEGIN/ROLLBACK-wrapped client — pass 5 was ALWAYS autocommit, pre- and post-conversion).
 * Two dedicated connections, exactly as `runEnrichPhase`'s post-commit loop acquires them
 * (scripts/lib/step/index.js:3664/:3721, H1 fix 2026-09-07): `writeClient` for `flushBatch`
 * (own short BEGIN/COMMIT per batch) and the OTHER statements pass 5 runs directly on
 * `client`; `streamClient` is SEPARATE and used ONLY by `ctx.stream`'s cursor — reusing one
 * connection for both a write and an open cursor is the documented deadlock (H1).
 */
async function enrichOptimalConfig(pool, opts) {
  const { scopeWhere, full, configOverrides } = splitOpts(opts);
  const base = await baseConfig(pool);
  const config = { ...base, ...configOverrides };
  const writeClient = await pool.connect();
  const streamClient = await pool.connect();
  try {
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
      scopeWhere,
      full,
      config,
      extra: {
        stream: (sql, params, streamOpts) => streamOverClient(streamClient, sql, params, { batchSize: streamBatchSize, ...streamOpts }),
        flushBatch,
      },
    });
    return compute.runPass5(writeClient, ctx, config);
  } finally {
    writeClient.release();
    streamClient.release();
  }
}

/**
 * `assertPreconditions` (GIST on parcels.geom + PostGIS present) has NO successor in
 * `compute` — retired to the library guards (`assertRequirements`,
 * scripts/lib/step/index.js:473), which probes `descriptor.guards.requires[]`. Re-expressed
 * against the runner rather than deleted (C2 plan note): the descriptor declares the exact
 * same 3 requirements the legacy function asserted inline (postgis extension, parcels.geom
 * column, idx_parcels_geom_gist index — enrich-parcels.descriptor.json `guards.requires`).
 */
async function assertPreconditions(poolOrClient) {
  return assertRequirements(poolOrClient, descriptor, { log: silentLog, tag: '[enrich_parcels TEST]' });
}

module.exports = {
  descriptor,
  compute,
  enrichParcels,
  enrichMaxBuild,
  enrichExistingStructure,
  enrichComparableBuilds,
  enrichOptimalConfig,
  assertPreconditions,
  flushOptConfigBatch: compute.flushOptConfigBatch,
  buildDecisionScopeWhere: compute.buildDecisionScopeWhere,
};
