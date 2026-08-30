#!/usr/bin/env node
'use strict';
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 13, R-T addendum, commit 5)
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md
//
// Chain-end synthesis — the `sources` chain roll-up. Spawned by run-chain.js
// as a detached fire-and-forget child (Spec 48 pattern — the SAME site
// observe-chain.js is spawned from, scripts/run-chain.js, AFTER the chain
// lock is released), scoped to the `sources` chain only.
//
// Read observe-chain.js FIRST, per Fold A-5's explicit requirement, before
// writing this file — its query shape (pipeline_runs' real columns:
// `pipeline`/`started_at`/`completed_at`/`duration_ms`/`records_meta`, NOT
// `slug`/`run_at`) and its LIKE-prefix + started_at/completed_at window
// query are the LEGACY fallback this file reuses (escapeLike duplicated
// verbatim — observe-chain.js is a top-level `pipeline.run()` script with no
// `module.exports`, nothing to import from it).
//
// Three jobs, one artifact per chain run:
//  1. Aggregate the chain run's own step rows, joined PRIMARILY on
//     `records_meta.chain_run_id` (R-U, Fold B-5) — falling back, only when
//     no step row carries the key (legacy runs predating commit 5), to
//     observe-chain.js's own LIKE-prefix + time-window query.
//  2. Run the seam pass (scripts/lib/step/seam.js) over every live seam
//     pair.
//  3. Run `validate_only` invariants/plausibility for every converted step
//     (scripts/lib/step/plausibility.js) — the declared cloud trigger point
//     (Ask 6, option (b)): this is where those queries actually run on an
//     unattended cron, not just under a manual `step:validate --write`.
//     The priced cost cap (Fold B-9: summed `last_measured.cost_ms` medians
//     vs. the chain's own measured duration) is REPORTED as an artifact
//     field, not enforced as a runtime gate — Ask 6(b)'s whole point is that
//     these queries finally run somewhere on cloud; silently skipping them
//     on cost would defeat that. A material ratio is new information for
//     the operator's own sign-off, not this script's call to make.
//
// Writes:
//   docs/reports/pipeline-validation/sources/chain-end-<run_id>.json
//   docs/reports/pipeline-validation/sources/chain-end-<run_id>.md

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_DIR = path.join(REPO_ROOT, 'docs/reports/pipeline-validation/sources');

const seam = require(path.join(REPO_ROOT, 'scripts/lib/step/seam.js'));
const { runInvariants, runPlausibility } = require(path.join(REPO_ROOT, 'scripts/lib/step/plausibility.js'));

/**
 * PostgreSQL LIKE-wildcard escape, duplicated verbatim from observe-chain.js
 * (no exports there to import from — see file header).
 */
function escapeLike(s) {
  return s.replace(/[!%_]/g, '!$&');
}

/** The most recent `pipeline_runs` row for the chain-level pipeline name itself (e.g. `sources`). */
async function latestChainRunId(pool, chainId) {
  const res = await pool.query(
    `SELECT id FROM pipeline_runs WHERE pipeline = $1 ORDER BY started_at DESC LIMIT 1`,
    [chainId],
  );
  return res.rows[0] ? res.rows[0].id : null;
}

/**
 * The chain row + its step rows for ONE chain run. Joins PRIMARILY on
 * `records_meta.chain_run_id` (R-U); falls back to the LIKE-prefix +
 * started_at/completed_at window observe-chain.js already uses (Fold A-5)
 * only when the primary join finds nothing (a legacy chain run, or every
 * step in this run happened to be standalone-spawned — vanishingly unlikely
 * post-commit-5, but never assumed away).
 */
async function fetchChainRun(pool, chainId, runId) {
  const chainRowRes = await pool.query(
    `SELECT id, pipeline, status, started_at, completed_at, duration_ms,
            records_total, records_new, records_updated, records_meta
       FROM pipeline_runs
      WHERE id = $1`,
    [runId],
  );
  if (chainRowRes.rows.length === 0) return null;
  const chainRow = chainRowRes.rows[0];

  const likePrefix = escapeLike(chainId) + ':%';

  const primaryRes = await pool.query(
    `SELECT pipeline, status, started_at, completed_at, duration_ms,
            records_total, records_new, records_updated, records_meta
       FROM pipeline_runs
      WHERE pipeline LIKE $1 ESCAPE '!'
        AND records_meta ? 'chain_run_id'
        AND (records_meta->>'chain_run_id')::bigint = $2`,
    [likePrefix, runId],
  );
  let stepRows = primaryRes.rows;
  let joinKind = 'chain_run_id';

  if (stepRows.length === 0 && chainRow.started_at) {
    const fallbackRes = await pool.query(
      `SELECT pipeline, status, started_at, completed_at, duration_ms,
              records_total, records_new, records_updated, records_meta
         FROM pipeline_runs
        WHERE pipeline LIKE $1 ESCAPE '!'
          AND started_at >= $2
          AND started_at <= COALESCE($3::timestamptz, NOW())
        ORDER BY started_at ASC`,
      [likePrefix, chainRow.started_at, chainRow.completed_at],
    );
    stepRows = fallbackRes.rows;
    joinKind = 'temporal_fallback';
  }

  return { chainRow, stepRows, joinKind };
}

/**
 * Fold B-9 — sum every migrated `validate_only` entry's `last_measured.cost_ms`
 * (its own already-recorded ≥5-timings/≥2-session median, Fold B-1) across
 * every converted descriptor, and compare against the chain's own measured
 * duration. Computed LIVE from `last_measured` on every call — never a
 * hardcoded constant (locked by the fixture below).
 */
function computeValidateOnlyCostCap(descriptorsByName, chainDurationMs) {
  const entries = [];
  for (const [stepName, { descriptor }] of Object.entries(descriptorsByName)) {
    for (const category of ['invariants', 'plausibility']) {
      const list = Array.isArray(descriptor[category]) ? descriptor[category] : [];
      for (const e of list) {
        if (e.frequency !== 'validate_only') continue;
        const costMs = e.last_measured && typeof e.last_measured.cost_ms === 'number' ? e.last_measured.cost_ms : null;
        entries.push({
          step: stepName,
          id: e.id,
          source: category === 'invariants' ? 'invariant' : 'plausibility',
          cost_ms: costMs,
        });
      }
    }
  }
  const summedCostMs = entries.reduce((sum, e) => sum + (e.cost_ms || 0), 0);
  const unmeasuredCount = entries.filter((e) => e.cost_ms === null).length;
  const ratio = typeof chainDurationMs === 'number' && chainDurationMs > 0 ? summedCostMs / chainDurationMs : null;
  return { entries, summedCostMs, chainDurationMs: chainDurationMs ?? null, unmeasuredCount, ratio };
}

/**
 * Ask 6(b) — executes `validate_only` invariants + plausibility for EVERY
 * converted descriptor. `every_run` entries are deliberately excluded here
 * (they already fired at their own step's run-end hook, index.js:1834) —
 * this tier exists ONLY for the frequency the run-end hook skips.
 */
async function runValidateOnlyTier(pool, descriptorsByName) {
  const rows = [];
  for (const [stepName, { descriptor }] of Object.entries(descriptorsByName)) {
    const hasInvariants = Array.isArray(descriptor.invariants) && descriptor.invariants.length > 0;
    const hasPlausibility = Array.isArray(descriptor.plausibility) && descriptor.plausibility.length > 0;
    if (!hasInvariants && !hasPlausibility) continue;
    const invRun = hasInvariants
      ? await runInvariants(pool, descriptor, { frequency: 'validate_only', when: null })
      : { checks: [], observations: {} };
    const plRun = hasPlausibility
      ? await runPlausibility(pool, descriptor, { frequency: 'validate_only', when: null })
      : { checks: [], observations: {} };
    for (const check of [...invRun.checks, ...plRun.checks]) {
      const obs = invRun.observations[check.id] !== undefined ? invRun.observations[check.id] : plRun.observations[check.id];
      const isError = !!(obs && obs.error);
      rows.push({
        step: stepName,
        metric: check.id,
        source: check.source,
        status: isError ? 'FAIL' : 'INFO',
        value: isError ? String((obs.error && obs.error.message) || obs.error) : obs ? obs.value : undefined,
      });
    }
  }
  return rows;
}

/** Assembles the full chain-end artifact for one chain run. */
async function synthesizeChainEnd(pool, { chainId = 'sources', runId } = {}) {
  const resolvedRunId = runId !== undefined && runId !== null ? runId : await latestChainRunId(pool, chainId);
  if (resolvedRunId == null) {
    throw new Error(`no pipeline_runs row found for chain "${chainId}" — nothing to synthesize`);
  }
  const fetched = await fetchChainRun(pool, chainId, resolvedRunId);
  if (!fetched) {
    throw new Error(`pipeline_runs id=${resolvedRunId} not found`);
  }
  const { chainRow, stepRows, joinKind } = fetched;

  const descriptorsByName = seam.loadConvertedDescriptors();
  const seamRows = await seam.runSeamChecks(pool, { chainId, descriptorsByName });
  const costCap = computeValidateOnlyCostCap(descriptorsByName, chainRow.duration_ms);
  const validateOnlyRows = await runValidateOnlyTier(pool, descriptorsByName);

  return {
    chain: chainId,
    run_id: resolvedRunId,
    chain_status: chainRow.status,
    chain_duration_ms: chainRow.duration_ms,
    started_at: chainRow.started_at,
    completed_at: chainRow.completed_at,
    join: joinKind,
    steps: stepRows.map((s) => ({
      step: s.pipeline.replace(`${chainId}:`, ''),
      status: s.status,
      verdict: (s.records_meta && s.records_meta.audit_table && s.records_meta.audit_table.verdict) || null,
      duration_ms: s.duration_ms,
      records_total: s.records_total,
      chain_run_id: (s.records_meta && s.records_meta.chain_run_id) ?? null,
    })),
    seam: seamRows,
    validate_only: {
      cost_cap: costCap,
      results: validateOnlyRows,
    },
    generated_at: new Date().toISOString(),
  };
}

function pctStr(ratio) {
  return ratio === null || ratio === undefined ? '—' : (ratio * 100).toFixed(1) + '%';
}

function renderMarkdown(artifact) {
  const stepLines = artifact.steps
    .map((s) => `| ${s.step} | ${s.status} | ${s.verdict ?? '—'} | ${s.duration_ms ?? '—'} | ${s.chain_run_id ?? '—'} |`)
    .join('\n');
  const seamLines = artifact.seam
    .map((r) => `| ${r.metric} | ${r.status} | ${r.threshold} |`)
    .join('\n');
  const voLines = artifact.validate_only.results
    .map((r) => `| ${r.step} | ${r.metric} | ${r.source} | ${r.status} | ${JSON.stringify(r.value)} |`)
    .join('\n');

  return `# Chain-end synthesis — ${artifact.chain} (run_id: ${artifact.run_id})

**Status:** ${artifact.chain_status} | **Duration:** ${artifact.chain_duration_ms != null ? (artifact.chain_duration_ms / 1000).toFixed(1) + 's' : '—'} | **Join:** ${artifact.join}

## Steps
| Step | Status | Verdict | Duration (ms) | chain_run_id |
|------|--------|---------|----------------|--------------|
${stepLines || '| (none) | | | | |'}

## Seam checks (scripts/lib/step/seam.js)
| Metric | Status | Threshold |
|--------|--------|-----------|
${seamLines || '| (none) | | |'}

## validate_only tier (Ask 6(b) — chain-end is the declared cloud trigger point)
Cost cap (Fold B-9, computed live — not asserted): summed \`last_measured.cost_ms\` **${artifact.validate_only.cost_cap.summedCostMs}ms** vs. chain duration **${artifact.validate_only.cost_cap.chainDurationMs ?? '—'}ms** (ratio **${pctStr(artifact.validate_only.cost_cap.ratio)}**, ${artifact.validate_only.cost_cap.unmeasuredCount} entr${artifact.validate_only.cost_cap.unmeasuredCount === 1 ? 'y' : 'ies'} unmeasured). Reported, not gated — see file header.

| Step | Metric | Source | Status | Value |
|------|--------|--------|--------|-------|
${voLines || '| (none) | | | | |'}

_Generated ${artifact.generated_at}_
`;
}

function writeArtifact(artifact) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const base = `chain-end-${artifact.run_id}`;
  const jsonPath = path.join(REPORT_DIR, `${base}.json`);
  const mdPath = path.join(REPORT_DIR, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
  writeFileSync(mdPath, renderMarkdown(artifact), 'utf8');
  return { jsonPath, mdPath };
}

async function main() {
  const [chainIdArg, runIdArg] = process.argv.slice(2);
  const chainId = chainIdArg || 'sources';
  const runId = runIdArg ? parseInt(runIdArg, 10) : undefined;
  const { createResolvedPool } = require(path.join(REPO_ROOT, 'scripts/lib/resolve-db.js'));
  const pool = createResolvedPool({ label: 'chain-end-synthesis' });
  try {
    const artifact = await synthesizeChainEnd(pool, { chainId, runId });
    const { jsonPath, mdPath } = writeArtifact(artifact);
    console.log(`[chain-end-synthesis] wrote ${jsonPath}`);
    console.log(`[chain-end-synthesis] wrote ${mdPath}`);
  } finally {
    await pool.end();
  }
}

// Guarded CLI entrypoint (mirrors run-chain.js's `require.main === module` guard,
// ESM-shaped): safe to `import` this file's pure functions from a test process
// without spawning a real DB pool as a side effect.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(`[chain-end-synthesis] ${err.stack || err.message}`);
    process.exit(1);
  });
}

export {
  escapeLike,
  latestChainRunId,
  fetchChainRun,
  computeValidateOnlyCostCap,
  runValidateOnlyTier,
  synthesizeChainEnd,
  renderMarkdown,
  writeArtifact,
};
