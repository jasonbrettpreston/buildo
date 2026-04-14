// 🔗 SPEC LINK: docs/specs/product/future/72_lead_cost_model.md §Implementation
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/compute-cost-estimates.js — file shape', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/compute-cost-estimates.js'),
      'utf-8',
    );
  });

  it('uses pipeline.run wrapper with correct name', () => {
    expect(content).toMatch(/pipeline\.run\(\s*['"]compute-cost-estimates['"]/);
  });

  it('acquires advisory lock 83 via pg_try_advisory_lock (WF3-03 PR-C: was 74; lock_id = spec number)', () => {
    expect(content).toMatch(/pg_try_advisory_lock\(/);
    expect(content).toMatch(/ADVISORY_LOCK_ID\s*=\s*83/);
  });

  it('releases advisory lock in finally block via pg_advisory_unlock', () => {
    expect(content).toMatch(/pg_advisory_unlock\(/);
    expect(content).toMatch(/finally\s*\{/);
  });

  it('streams permits via pipeline.streamQuery (no load-all)', () => {
    expect(content).toMatch(/pipeline\.streamQuery\(/);
  });

  it('batches writes via pipeline.withTransaction', () => {
    expect(content).toMatch(/pipeline\.withTransaction\(/);
  });

  it('batch size is 5000 per spec 72', () => {
    expect(content).toMatch(/BATCH_SIZE\s*=\s*5000/);
  });

  it('uses ON CONFLICT (permit_num, revision_num) DO UPDATE for idempotency', () => {
    expect(content).toMatch(/ON CONFLICT \(permit_num, revision_num\) DO UPDATE/);
  });

  it('references all source tables', () => {
    expect(content).toMatch(/\bpermits\b/);
    expect(content).toMatch(/\bpermit_parcels\b/);
    expect(content).toMatch(/\bparcels\b/);
    expect(content).toMatch(/\bbuilding_footprints\b/);
    expect(content).toMatch(/\bneighbourhoods\b/);
  });

  it('writes to cost_estimates', () => {
    expect(content).toMatch(/\bcost_estimates\b/);
  });

  it('emits PIPELINE_SUMMARY with records_total, records_new, records_updated', () => {
    expect(content).toMatch(/pipeline\.emitSummary\(/);
    expect(content).toMatch(/records_total/);
    expect(content).toMatch(/records_new/);
    expect(content).toMatch(/records_updated/);
  });

  it('emits PIPELINE_META with reads and writes maps', () => {
    expect(content).toMatch(/pipeline\.emitMeta\(/);
  });

  it('cross-references src/features/leads/lib/cost-model.ts for dual code path', () => {
    expect(content).toMatch(/src[/\\]features[/\\]leads[/\\]lib[/\\]cost-model/);
    expect(content).toMatch(/DUAL CODE PATH/i);
  });

  it('defines estimateCostInline function mirroring TS cost-model', () => {
    expect(content).toMatch(/function\s+estimateCostInline\s*\(/);
  });

  it('defines the same constant blocks as cost-model.ts', () => {
    expect(content).toMatch(/\bBASE_RATES\b/);
    expect(content).toMatch(/\bPREMIUM_TIERS\b/);
    expect(content).toMatch(/\bSCOPE_ADDITIONS\b/);
    expect(content).toMatch(/\bCOST_TIER_BOUNDARIES\b/);
  });

  it('logs batch failures via pipeline.log.error (NOT bare console.error)', () => {
    expect(content).toMatch(/pipeline\.log\.error\(/);
  });

  it('casts DECIMAL(15,2) columns to float8 for JS consumption', () => {
    expect(content).toMatch(/::float8/);
  });

  it('tracks failed batches and rows in emitSummary records_meta', () => {
    expect(content).toContain('failedBatches');
    expect(content).toContain('failedRows');
    expect(content).toContain('failed_batches');
    expect(content).toContain('failed_rows');
  });

  it('emits PIPELINE_SUMMARY on advisory lock early return', () => {
    const lockBlock = content.split('pg_try_advisory_lock')[1] || '';
    const beforeReturn = lockBlock.split('return;')[0] || '';
    expect(beforeReturn).toContain('emitSummary');
  });

  // --- audit_table observability (WF3 2026-04-10) ---
  // Admin FreshnessTimeline renders records_meta.audit_table.rows in the
  // expanded step view, and HIDES the default records_total/new/updated
  // display whenever audit_table is present. Without a custom audit_table,
  // the SDK auto-injects only sys_velocity_rows_sec + sys_duration_ms, so
  // the admin UI shows no meaningful throughput numbers for this step.
  it('builds a custom audit_table in the success path (not just SDK auto-inject)', () => {
    expect(content).toMatch(/audit_table\s*:\s*\{/);
    expect(content).toMatch(/verdict/);
  });

  it('includes permits_processed / permits_inserted / permits_updated audit rows', () => {
    expect(content).toMatch(/metric:\s*['"]permits_processed['"]/);
    expect(content).toMatch(/metric:\s*['"]permits_inserted['"]/);
    expect(content).toMatch(/metric:\s*['"]permits_updated['"]/);
  });

  it('surfaces failed_rows as a WARN audit row when batch failures occur', () => {
    expect(content).toMatch(/metric:\s*['"]failed_rows['"]/);
  });

  it('uses ADVISORY_LOCK_ID = 83 (lock_id = spec number convention) (WF3-03 PR-C / 83-W7)', () => {
    // Pre-PR-C the lock ID was 74 (a leftover from spec 72_lead_cost_model.md).
    // Spec 40 §3.5 mandates lock_id = spec number — this script's spec is 83.
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 83/);
    expect(content).not.toMatch(/const ADVISORY_LOCK_ID = 74/);
  });

  it('acquires advisory lock on a pinned pool.connect() client (WF3-03 PR-C / 83-W5)', () => {
    // Pre-PR-C the lock used pool.query for both acquire and release. pg
    // pool.query checks out an EPHEMERAL connection and returns it after
    // the query completes, so the session-scoped advisory lock would be
    // released when the connection is reaped (or persist on a different
    // backend if a different connection was reused for the unlock). The
    // unlock would no-op silently. Mirrors classify-lifecycle-phase.js.
    expect(content).toMatch(/await pool\.connect\(\)/);
    expect(content).toMatch(/SELECT pg_try_advisory_lock\(\$1\)/);
    expect(content).toMatch(/SELECT pg_advisory_unlock\(\$1\)/);
    // Negative anchor: must not use pool.query for the lock pair.
    expect(content).not.toMatch(/pool\.query\([^)]*pg_try_advisory_lock/);
    expect(content).not.toMatch(/pool\.query\([^)]*pg_advisory_unlock/);
  });

  it('does NOT swallow per-row errors inside flushBatch — let withTransaction rollback (WF3-03 PR-C / 83-W6)', () => {
    // Pre-PR-C: the per-row try-catch inside flushBatch's withTransaction
    // callback caught client.query errors, logged them, and continued.
    // withTransaction then COMMITs anyway with missing rows. failed_rows
    // counter stays at 0 even when 100s silently dropped — false-green
    // observability. Outer try/catch around flushBatch (in the main
    // streaming loop) is the correct level: row failure → batch rollback
    // → failed_rows += batch.length.
    //
    // Locate flushBatch and verify there is NO inner try/catch wrapping
    // the per-row client.query INSERT.
    const flushBatchMatch = content.match(/async function flushBatch[\s\S]*?^}/m);
    expect(flushBatchMatch, 'flushBatch function not found').toBeTruthy();
    const flushBody = flushBatchMatch![0];
    // The for-loop over rows must not contain a try/catch with
    // client.query inside; the row error must propagate to withTransaction
    // which rolls back and rethrows to the outer catch.
    expect(flushBody, 'per-row try/catch inside flushBatch defeats withTransaction atomicity (83-W6)').not.toMatch(
      /for \(const r of rows\)[\s\S]*?try\s*\{[\s\S]*?await client\.query/,
    );
  });
});
