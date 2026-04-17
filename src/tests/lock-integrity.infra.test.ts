/**
 * lock-integrity.infra.test.ts
 *
 * SPEC LINK: docs/specs/product/future/83_lead_cost_model.md §5 Testing Mandate
 *
 * File-shape infra tests verifying that compute-cost-estimates.js implements
 * the advisory lock + concurrency contract from Spec 47 §5 and §8.
 *
 * Phase 2 migration: hand-rolled lockClient + SIGTERM boilerplate replaced with
 * pipeline.withAdvisoryLock. Tests updated to assert the new delegation pattern.
 *
 * All tests are deterministic file-reads — no live DB required.
 * This matches the infra test convention used by every other *.infra.test.ts
 * in this repo.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

describe('compute-cost-estimates.js — advisory lock integrity (spec 47 §5)', () => {
  let script: string;

  beforeAll(() => {
    script = read('scripts/compute-cost-estimates.js');
  });

  it('delegates advisory lock 83 to pipeline.withAdvisoryLock — Phase 2 migration (spec 47 §5)', () => {
    // Phase 1 SDK helper manages: pool.connect(), SIGTERM/SIGINT traps,
    // SKIP emitSummary, double-cleanup guard. Scripts must not hand-roll.
    expect(script).toMatch(/const ADVISORY_LOCK_ID = 83/);
    expect(script).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
    // Must NOT hand-roll — any direct lock call bypasses the spec helper
    expect(script).not.toMatch(/pg_try_advisory_lock/);
    expect(script).not.toMatch(/pg_advisory_unlock/);
    // Must NOT install its own SIGTERM — helper handles it
    expect(script).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });

  it('passes skipEmit: false so the caller controls the rich SKIP emit', () => {
    // compute-cost-estimates has a richer SKIP payload (with audit_table rows)
    // than the default SKIP the helper emits. skipEmit:false tells the helper
    // to skip its own emit so the caller can send the custom one.
    expect(script).toMatch(/skipEmit\s*:\s*false/);
  });

  it('checks lockResult.acquired and emits rich SKIP payload with audit_table when lock held', () => {
    // On lock-not-acquired, the script emits a custom SKIP summary with the
    // same audit_table shape as the main path — FreshnessTimeline needs it
    // to render a real verdict rather than UNKNOWN.
    expect(script).toMatch(/lockResult\.acquired/);
    expect(script).toMatch(/advisory_lock_held_elsewhere/);
    // The skip path must include an audit_table
    expect(script).toMatch(/audit_table/);
  });

  it('emits pipeline.emitMeta on the lock-skip path too', () => {
    // Both paths (acquired + skip) must emit pipeline.emitMeta so the chain
    // orchestrator always gets a full meta record, even on SKIP.
    const skipPathMatch = script.match(
      /if\s*\(!lockResult\.acquired\)([\s\S]{0,2000})/,
    );
    expect(skipPathMatch, 'lockResult.acquired guard not found').toBeTruthy();
    expect(skipPathMatch![0]).toMatch(/pipeline\.emitMeta/);
  });
});

describe('compute-cost-estimates.js — RUN_AT timestamp discipline (spec 47 §8)', () => {
  let script: string;

  beforeAll(() => {
    script = read('scripts/compute-cost-estimates.js');
  });

  it('captures RUN_AT via pool.query inside the withAdvisoryLock callback (not on a dedicated lockClient)', () => {
    // After Phase 2 migration, no lockClient exists. RUN_AT must be obtained
    // via pool.query() inside the withAdvisoryLock callback — still "after lock
    // acquired" by construction (the callback only runs on lock success).
    // Accepts either the old inline pattern or the new SDK helper (pipeline.getDbTimestamp).
    const hasInlineNow = /pool\.query\([^)]*SELECT NOW/.test(script);
    const hasSdkHelper = /pipeline\.getDbTimestamp\s*\(/.test(script);
    expect(hasInlineNow || hasSdkHelper,
      'Must capture RUN_AT via pool.query(SELECT NOW) or pipeline.getDbTimestamp()'
    ).toBe(true);
    // Must NOT use a dedicated lockClient for RUN_AT
    expect(script).not.toMatch(/lockClient\.query\([^)]*SELECT NOW/);
    // Must NOT use lockClient at all
    expect(script).not.toMatch(/const lockClient/);
  });

  it('batch UPSERT uses RUN_AT parameter (not NOW() in SQL)', () => {
    // NOW() in a batched VALUES list would produce slightly different timestamps
    // for each batch if the run spans midnight. RUN_AT is captured once.
    // The ::timestamptz cast appears in valueGroups.push() (before INSERT INTO),
    // not inside the INSERT template itself — so we check the buildBulkUpsertSQL
    // function context broadly.
    const bulkFn = script.match(/function buildBulkUpsertSQL[\s\S]*?^}/m)?.[0] ?? '';
    expect(bulkFn, 'buildBulkUpsertSQL function not found').toBeTruthy();
    // No NOW() anywhere in the bulk builder (would bypass RUN_AT contract)
    expect(bulkFn).not.toMatch(/\bNOW\(\)/i);
    // The parameter placeholder for computed_at must have a ::timestamptz cast
    expect(bulkFn).toMatch(/::timestamptz/);
  });

  it('RUN_AT is passed through flushBatch as a parameter', () => {
    expect(script).toMatch(/flushBatch\(pool,\s*batch,\s*RUN_AT\)/);
    expect(script).toMatch(/async function flushBatch\s*\(\s*pool\s*,\s*rows\s*,\s*RUN_AT\s*\)/);
  });
});
