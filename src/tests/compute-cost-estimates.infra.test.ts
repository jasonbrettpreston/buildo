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

  it('acquires advisory lock 74 via pg_try_advisory_lock', () => {
    expect(content).toMatch(/pg_try_advisory_lock\(/);
    expect(content).toMatch(/ADVISORY_LOCK_ID\s*=\s*74/);
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
});
