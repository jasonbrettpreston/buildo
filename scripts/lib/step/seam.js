'use strict';
// scripts/lib/step/seam.js
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 13, R-T addendum)
//
// R-T addendum, commit 5 — the seam-validation pass. The charter's own goal
// text says "a seam-validation pass over `outputs.invalidates` edges" but
// Fold A-5 (Reality-Check) corrected the mechanism: `outputs.invalidates[]`
// is `{table, column, when}` shaped — a step's own re-eligibility scope
// (e.g. migration 245's trigger NULLing centroid_lat), not a producer→
// consumer edge between two steps. The real declared step-to-step edge is
// `inputs.reads.steps[].step` — downstream names its upstream dependency
// directly (link_massing.inputs.reads.steps names both "massing" and
// "compute_centroids").
//
// Seams are DERIVED, never hand-maintained (mirrors step-validate.mjs's own
// converted.json + manifest.json registry discipline) — a pair is "live"
// only when BOTH endpoints are converted steps with a real descriptor.
// Measured against the actual 6 converted descriptors this commit: exactly
// ONE pair qualifies today — compute_centroids → link_massing ("massing",
// link_massing's other read, has no descriptor — not live).
//
// Joins PRIMARILY on records_meta.chain_run_id (R-U, Fold B-5): the most
// recent chain_run_id carried by a completed run of BOTH slugs. Falls back,
// only when no shared chain_run_id exists in the queried window (legacy
// rows predating this commit, or a standalone-only history), to the RUN-
// level comparison Fold A-5 specified: `pipeline_runs` has no per-row
// centroid-freshness timestamp column, so the comparison is the upstream
// run's `completed_at` vs. the downstream run's `started_at` — real column
// names (`pipeline`/`started_at`/`completed_at`), never `slug`/`run_at`.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');

function loadConverted() {
  const parsed = JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8'));
  return (parsed.converted || []).map((f) => String(f).replace(/\\/g, '/'));
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

/**
 * Descriptor path convention: `<step>.descriptor.json` beside the script
 * (capture-step-golden.js's own rule, mirrored here rather than imported to
 * avoid a CLI-module→library dependency). Exported (WF3 I3a, 2026-09-14) so
 * run-chain.js — another scripts/lib consumer, not a CLI-module dependency —
 * can share this ONE definition instead of a third copy.
 */
function descriptorPathFor(step) {
  return step.replace(/\.(js|py)$/, '') + '.descriptor.json';
}

/** slug for a manifest step file — throws rather than silently skipping (mirrors step-validate.mjs's own rule). */
function slugFor(manifest, relFile) {
  const found = Object.entries(manifest.scripts).find(([, e]) => e.file === relFile)?.[0];
  if (!found) throw new Error(`no manifest.scripts entry points at ${relFile}`);
  return found;
}

/**
 * Every converted step's descriptor, keyed by `identity.name` (its declared
 * slug — the same string `inputs.reads.steps[].step` names). Throws on a
 * missing/malformed descriptor: a converted.json entry with no readable
 * descriptor is a broken registry, not something to skip past.
 */
function loadConvertedDescriptors() {
  const manifest = loadManifest();
  const converted = loadConverted();
  const byName = Object.create(null);
  for (const relFile of converted) {
    const descPath = path.join(REPO_ROOT, descriptorPathFor(relFile));
    const descriptor = JSON.parse(fs.readFileSync(descPath, 'utf8'));
    const slug = slugFor(manifest, relFile);
    byName[descriptor.identity.name] = { descriptor, slug, relFile };
  }
  return byName;
}

/**
 * Every {upstream, downstream} pair where `downstream` declares `upstream`
 * in its own `inputs.reads.steps[]` AND both are converted (have a real
 * descriptor keyed in `descriptorsByName`). Deterministically ordered so a
 * fixture asserting "exactly N pairs" never depends on object key iteration
 * order.
 *
 * SEAM-CHAIN-1 (Spec 122 §6.5, batch-2 row 3.1 prerequisite 0c): the
 * ordering claim is PER CHAIN — "a step may not read a table written by a
 * later step in the same chain" — but this function historically applied NO
 * chain filter while `runSeamChecks` receives the LIVE chain id from
 * `scripts/analysis/chain-end-synthesis.mjs`. The result: a `permits`
 * chain-end synthesis evaluated `sources`-only pairs, whose producer never
 * runs on `permits` at all. When `opts.chainId` is given, the unscoped list
 * is filtered to pairs whose BOTH slugs are members of
 * `loadManifest().chains[chainId]` (arrays of slugs). When `chainId` is
 * omitted/undefined the unscoped list is returned exactly as before —
 * byte-identical for existing callers. The observable exclusion detail lives
 * in `deriveSeamPairsScoped`; this wrapper is the backwards-compatible
 * `.pairs` view.
 */
function deriveSeamPairs(descriptorsByName = loadConvertedDescriptors(), opts = {}) {
  return deriveSeamPairsScoped(descriptorsByName, opts && opts.chainId).pairs;
}

/**
 * The chain-scoped derivation behind `deriveSeamPairs` (SEAM-CHAIN-1, Spec
 * 122 §6.5). Returns `{ pairs, excluded }` — never logs, never throws on a
 * scoped-away pair, because "nothing hidden" is the point: a caller/test must
 * be able to assert WHAT was excluded and WHY.
 *
 * - `chainId` omitted/undefined → `{ pairs: <unscoped list>, excluded: [] }`
 *   (the historical derivation, unchanged).
 * - `chainId` given → a pair is live only when BOTH slugs are members of
 *   `manifest.chains[chainId]`; every scoped-away pair is returned in
 *   `excluded` with `reason: 'upstream_not_in_chain' | 'downstream_not_in_chain'`
 *   (upstream checked first). A pair neither of whose members is in the chain
 *   is excluded with `upstream_not_in_chain` — the first missing side named.
 * - an unknown `chainId` (not a key of `manifest.chains`) THROWS a named
 *   Error rather than silently returning everything (a typo'd chain must not
 *   read as "no pairs on this chain") or nothing.
 */
function deriveSeamPairsScoped(descriptorsByName = loadConvertedDescriptors(), chainId) {
  const unscoped = [];
  for (const [downstreamName, { descriptor }] of Object.entries(descriptorsByName)) {
    const reads = (descriptor.inputs && descriptor.inputs.reads && descriptor.inputs.reads.steps) || [];
    for (const r of reads) {
      if (Object.prototype.hasOwnProperty.call(descriptorsByName, r.step)) {
        unscoped.push({ upstream: r.step, downstream: downstreamName });
      }
    }
  }
  unscoped.sort((a, b) => (a.downstream + ':' + a.upstream).localeCompare(b.downstream + ':' + b.upstream));

  if (chainId === undefined || chainId === null) {
    return { pairs: unscoped, excluded: [] };
  }

  const manifest = loadManifest();
  const chains = manifest.chains || {};
  if (!Object.prototype.hasOwnProperty.call(chains, chainId)) {
    throw new Error(
      `deriveSeamPairsScoped: unknown chainId '${chainId}' — not a key of manifest.chains ` +
        `(known: ${Object.keys(chains).sort().join(', ')})`,
    );
  }
  const members = new Set(chains[chainId] || []);

  const pairs = [];
  const excluded = [];
  for (const pair of unscoped) {
    if (!members.has(pair.upstream)) {
      excluded.push({ ...pair, reason: 'upstream_not_in_chain' });
    } else if (!members.has(pair.downstream)) {
      excluded.push({ ...pair, reason: 'downstream_not_in_chain' });
    } else {
      pairs.push(pair);
    }
  }
  return { pairs, excluded };
}

function scopedPipeline(chainId, slug) {
  return chainId ? `${chainId}:${slug}` : slug;
}

/**
 * Ordering evaluation shared by both join strategies: the downstream run
 * must have STARTED no earlier than the upstream run COMPLETED — the only
 * ordering guarantee available without a per-row freshness column (Fold A-5).
 */
function evaluateOrder({ metric, threshold, up, down, join, joinValue }) {
  const ok = !!(up.completed_at && down.started_at && new Date(down.started_at) >= new Date(up.completed_at));
  return {
    metric,
    value: {
      upstream_completed_at: up.completed_at,
      downstream_started_at: down.started_at,
      join,
      join_value: joinValue,
    },
    threshold,
    status: ok ? 'PASS' : 'FAIL',
    source: 'seam',
  };
}

/**
 * The seam check for ONE {upstream, downstream} pair, over `pipeline_runs`.
 * Returns a check-row shape (`metric`/`value`/`threshold`/`status`/`source`)
 * consumable the same way an invariant/plausibility row is (verdict.js's
 * `row()` shape, commit 3).
 */
async function checkSeam(pool, { upstream, downstream, chainId = 'sources' }) {
  const upstreamPipeline = scopedPipeline(chainId, upstream);
  const downstreamPipeline = scopedPipeline(chainId, downstream);
  const metric = `seam_${upstream}_before_${downstream}`;
  const threshold = `${downstream}.started_at >= ${upstream}.completed_at (chain_run_id join, or legacy temporal fallback)`;

  // Primary: most recent chain_run_id carried by a completed run of BOTH
  // sides (R-U, Fold B-5) — records_meta.chain_run_id, stamped by the step
  // library (scripts/lib/step/index.js), null for a standalone run.
  const primaryRes = await pool.query(
    `SELECT pipeline, id, started_at, completed_at,
            (records_meta->>'chain_run_id')::bigint AS meta_chain_run_id
       FROM pipeline_runs
      WHERE pipeline IN ($1, $2)
        AND records_meta ? 'chain_run_id'
        AND records_meta->>'chain_run_id' IS NOT NULL
      ORDER BY started_at DESC
      LIMIT 40`,
    [upstreamPipeline, downstreamPipeline],
  );
  const byChainRun = new Map();
  for (const row of primaryRes.rows) {
    if (row.meta_chain_run_id === null || row.meta_chain_run_id === undefined) continue;
    const bucket = byChainRun.get(row.meta_chain_run_id) || {};
    bucket[row.pipeline] = row;
    byChainRun.set(row.meta_chain_run_id, bucket);
  }
  const sharedRunIds = [...byChainRun.keys()].filter(
    (id) => byChainRun.get(id)[upstreamPipeline] && byChainRun.get(id)[downstreamPipeline],
  );
  if (sharedRunIds.length > 0) {
    sharedRunIds.sort((a, b) => Number(b) - Number(a));
    const chainRunId = sharedRunIds[0];
    const bucket = byChainRun.get(chainRunId);
    return evaluateOrder({
      metric, threshold, join: 'chain_run_id', joinValue: chainRunId,
      up: bucket[upstreamPipeline], down: bucket[downstreamPipeline],
    });
  }

  // Fallback: legacy RUN-level comparison (Fold A-5) — most recent completed
  // row for each slug, no chain_run_id required. Only reached when the
  // primary join found no run sharing a chain_run_id on both sides.
  const fallbackRes = await pool.query(
    `SELECT pipeline, id, started_at, completed_at
       FROM pipeline_runs
      WHERE pipeline IN ($1, $2)
        AND status IN ('completed', 'completed_with_errors', 'completed_with_warnings')
      ORDER BY started_at DESC
      LIMIT 40`,
    [upstreamPipeline, downstreamPipeline],
  );
  const up = fallbackRes.rows.find((r) => r.pipeline === upstreamPipeline);
  const down = fallbackRes.rows.find((r) => r.pipeline === downstreamPipeline);
  if (!up || !down) {
    return {
      metric,
      value: null,
      threshold,
      status: 'WARN',
      source: 'seam',
      why: `insufficient pipeline_runs history for ${!up ? upstream : downstream} — seam not yet observable`,
    };
  }
  return evaluateOrder({ metric, threshold, up, down, join: 'temporal_fallback', joinValue: null });
}

/**
 * Runs every derived live seam pair FOR THIS CHAIN, returns one row per pair.
 * SEAM-CHAIN-1 (Spec 122 §6.5): the chain id is threaded through the
 * derivation — a pair whose producer or consumer is not a member of
 * `manifest.chains[chainId]` is not evaluated on that chain (an unknown
 * chain id throws, see `deriveSeamPairsScoped`).
 */
async function runSeamChecks(pool, { chainId = 'sources', descriptorsByName } = {}) {
  const { pairs } = deriveSeamPairsScoped(descriptorsByName, chainId);
  const rows = [];
  // Sequential by design: the pair list is tiny (1 today) and each check is
  // its own query, no batching contract to preserve.
  for (const pair of pairs) {
    rows.push(await checkSeam(pool, { ...pair, chainId }));
  }
  return rows;
}

module.exports = {
  descriptorPathFor,
  loadConvertedDescriptors,
  deriveSeamPairs,
  deriveSeamPairsScoped,
  checkSeam,
  evaluateOrder,
  runSeamChecks,
};
