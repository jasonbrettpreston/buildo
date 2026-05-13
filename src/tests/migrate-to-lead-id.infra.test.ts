// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C R5.2
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//
// SQL-string + Spec-47-skeleton regression-lock for scripts/migrate-to-lead-id.js.
//
// One-shot script that backfills `lead_id` on the 4 consumer tables
// (cost_estimates, trade_forecasts, tracked_projects, lead_analytics).
// Per R2 review:
//   - Advisory lock 4205 (Spec 42 §6.8 allocated range)
//   - Single withTransaction wrapping all 4 UPDATEs (atomicity)
//   - Audit_table emit with per-table row counts + null-count post-checks
//   - Idempotent via WHERE lead_id IS NULL

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migrate-to-lead-id.js — Spec 47 §R1-R12 + Phase C R5.2 contract', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/migrate-to-lead-id.js'),
      'utf-8',
    );
  });

  it('§R1 — imports pipeline SDK', () => {
    expect(src).toMatch(/require\(['"]\.\/lib\/pipeline['"]\)/);
  });

  it('§R2 — declares advisory lock ID 4205 (Spec 42 §6.8 Phase C allocation)', () => {
    expect(src).toMatch(/(?:const|let)\s+ADVISORY_LOCK_ID\s*=\s*4205\b/);
  });

  it('§R3 — uses pipeline.run() as the entrypoint', () => {
    expect(src).toMatch(/pipeline\.run\(['"]migrate-to-lead-id['"]/);
  });

  it('§R3.5 — captures DB clock via pipeline.getDbTimestamp at start', () => {
    expect(src).toMatch(/pipeline\.getDbTimestamp\(/);
  });

  it('§R6 — wraps work in pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)', () => {
    expect(src).toMatch(/pipeline\.withAdvisoryLock\(\s*pool\s*,\s*ADVISORY_LOCK_ID\b/);
  });

  it('§R9 — wraps mutations in pipeline.withTransaction (single envelope for all 4 backfills)', () => {
    expect(src).toMatch(/pipeline\.withTransaction\(/);
    // Per R2 DeepSeek finding: single transaction for all 4 tables
    const txnMatches = src.match(/pipeline\.withTransaction\(/g) ?? [];
    expect(txnMatches.length).toBeGreaterThanOrEqual(1);
    expect(txnMatches.length).toBeLessThanOrEqual(2); // tolerate retry/lock wrapper
  });

  it('imports deriveLeadId from the new shared lib (Phase C R5.1)', () => {
    expect(src).toMatch(/require\(['"][^'"]*\/lib\/leads\/lead-id['"]\)/);
  });

  it('backfills cost_estimates with canonical permit: lead_id derivation', () => {
    expect(src).toMatch(/UPDATE\s+cost_estimates[\s\S]*?SET\s+lead_id\s*=\s*'permit:'\s*\|\|\s*permit_num\s*\|\|\s*':'\s*\|\|\s*LPAD\s*\(\s*revision_num\s*,\s*2\s*,\s*'0'\s*\)[\s\S]*?WHERE\s+lead_id\s+IS\s+NULL/i);
  });

  it('backfills trade_forecasts with canonical derivation', () => {
    expect(src).toMatch(/UPDATE\s+trade_forecasts[\s\S]*?SET\s+lead_id\s*=\s*'permit:'\s*\|\|\s*permit_num\s*\|\|\s*':'\s*\|\|\s*LPAD\s*\(\s*revision_num\s*,\s*2\s*,\s*'0'\s*\)[\s\S]*?WHERE\s+lead_id\s+IS\s+NULL/i);
  });

  it('backfills tracked_projects with lead_type-aware derivation (CoA rows handled by Phase D)', () => {
    expect(src).toMatch(/UPDATE\s+tracked_projects[\s\S]*?WHERE\s+lead_id\s+IS\s+NULL/i);
  });

  it('backfills lead_analytics from lead_key (R0.7 audit: format already matches)', () => {
    // Per R0.7 audit: lead_analytics is empty. UPDATE pattern matches.
    expect(src).toMatch(/UPDATE\s+lead_analytics[\s\S]*?SET\s+lead_id\s*=\s*lead_key[\s\S]*?WHERE\s+lead_id\s+IS\s+NULL/i);
  });

  it('§R10 — emits audit_table with per-table row counts', () => {
    expect(src).toMatch(/audit_table/);
    expect(src).toMatch(/rows_backfilled_cost_estimates|backfilled.*cost_estimates/i);
    expect(src).toMatch(/rows_backfilled_trade_forecasts|backfilled.*trade_forecasts/i);
  });

  it('§R10 — emits post-backfill null-count assertions (must be 0)', () => {
    expect(src).toMatch(/null_count|lead_id\s+IS\s+NULL/i);
  });

  it('§R11 — emits pipeline.emitMeta() listing input + output tables', () => {
    expect(src).toMatch(/pipeline\.emitMeta\(/);
  });

  it('idempotent — every UPDATE guarded by WHERE lead_id IS NULL', () => {
    // Count UPDATE statements; each should be followed by a WHERE clause
    // that includes IS NULL. The migrate-to-lead-id.js script does NOT
    // perform unconditional UPDATEs.
    const updateCount = (src.match(/UPDATE\s+(cost_estimates|trade_forecasts|tracked_projects|lead_analytics)\b/gi) ?? []).length;
    expect(updateCount).toBeGreaterThanOrEqual(4);
    // Every UPDATE block must include WHERE lead_id IS NULL
    const guardedUpdateCount = (src.match(/UPDATE\s+(cost_estimates|trade_forecasts|tracked_projects|lead_analytics)[\s\S]*?WHERE[\s\S]*?lead_id\s+IS\s+NULL/gi) ?? []).length;
    expect(guardedUpdateCount).toBe(updateCount);
  });

  it('SPEC LINK header present', () => {
    expect(src).toMatch(/SPEC LINK:\s*docs\/specs\/01-pipeline\/42_chain_coa\.md/i);
  });
});
