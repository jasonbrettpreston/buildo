// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.A.1 (B.13 Integrity
//                                                                  Constraint Design)
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 137 (lead_id_orphan_audit view).
//
// Phase B's substitute for a cross-table foreign key: since `lead_id` may
// point to either `permits` OR `coa_applications` (Option C polymorphic
// key), a conventional FK is impossible — Postgres requires a single
// target. Instead, a UNION-ALL view exposes every row whose lead_id
// references no parent. The Phase C-extended CQA gate (assert-data-bounds)
// fails on `SELECT COUNT(*) FROM lead_id_orphan_audit > 0`.
//
// Phase B coverage: the 4 tables created in R5.1 (lead_trades, lead_parcels,
// lifecycle_transitions, lifecycle_status_history). Phase C extends the
// view to add the 4 consumer tables (cost_estimates, trade_forecasts,
// tracked_projects, lead_analytics) once their lead_id columns are
// backfilled.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 137 — lead_id_orphan_audit view (WF1 #coa-pipeline-parity-phase-b R5.5)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/137_lead_id_integrity_constraints.sql'),
      'utf-8',
    );
  });

  it('creates the lead_id_orphan_audit view (re-runnable via CREATE OR REPLACE)', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW\s+lead_id_orphan_audit\s+AS/i);
  });

  it("returns a (source_table TEXT, lead_id TEXT, source_row_id TEXT) shape", () => {
    // Each branch of the UNION ALL must SELECT exactly these 3 columns
    // in this order for the view shape to be stable.
    expect(sql).toMatch(/SELECT\s+'lead_trades'\s+AS\s+source_table\s*,/i);
    expect(sql).toMatch(/SELECT\s+'lead_parcels'\s*,/i);
    expect(sql).toMatch(/SELECT\s+'lifecycle_transitions'\s*,/i);
    expect(sql).toMatch(/SELECT\s+'lifecycle_status_history'\s*,/i);
  });

  it('UNION ALLs across all 4 Phase B tables', () => {
    const unionMatches = sql.match(/UNION\s+ALL/gi) ?? [];
    expect(unionMatches.length).toBe(3);
  });

  it('uses LEFT JOIN against permits + coa_applications and filters to NULL on both', () => {
    // For each source table, the view LEFT JOINs both parent tables on
    // lead_id and emits the row only when BOTH parents are absent
    // (i.e., this lead_id has no source-of-truth).
    const leftJoinPermits = sql.match(/LEFT\s+JOIN\s+permits\b/gi) ?? [];
    const leftJoinCoa = sql.match(/LEFT\s+JOIN\s+coa_applications\b/gi) ?? [];
    expect(leftJoinPermits.length).toBeGreaterThanOrEqual(4);
    expect(leftJoinCoa.length).toBeGreaterThanOrEqual(4);
    // Each branch's WHERE clause asserts both parents are NULL.
    const whereNullMatches = sql.match(/WHERE[\s\S]*?IS\s+NULL\s+AND[\s\S]*?IS\s+NULL/gi) ?? [];
    expect(whereNullMatches.length).toBeGreaterThanOrEqual(4);
  });

  it('does NOT include the 4 Phase C consumer tables (deferred per Spec 42 §6.6.A.1)', () => {
    // cost_estimates, trade_forecasts, tracked_projects, lead_analytics
    // are added in a Phase C follow-up migration after their lead_id
    // columns are backfilled. Phase B inclusion would produce false
    // positives (every NULL lead_id would orphan-flag).
    expect(sql).not.toMatch(/FROM\s+cost_estimates\b/i);
    expect(sql).not.toMatch(/FROM\s+trade_forecasts\b/i);
    expect(sql).not.toMatch(/FROM\s+tracked_projects\b/i);
    expect(sql).not.toMatch(/FROM\s+lead_analytics\b/i);
  });

  it("includes a comment pointing to the Phase C follow-up for the consumer tables", () => {
    // The view body or surrounding comment must reference the deferred
    // Phase C addition so future readers know why those 4 tables aren't
    // here yet.
    expect(sql).toMatch(/Phase C/i);
  });

  it('does NOT use CONCURRENTLY (a view is metadata-only)', () => {
    expect(sql).not.toMatch(/CONCURRENTLY/i);
  });

  it('comment-only DOWN block per Rule 6 (manual DROP VIEW)', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    expect(downIdx).toBeGreaterThan(0);
    const afterDown = sql.slice(downIdx);
    const offending = afterDown
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (t === '' || t.startsWith('--')) return false;
        return /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(t);
      });
    expect(offending).toEqual([]);
  });
});
