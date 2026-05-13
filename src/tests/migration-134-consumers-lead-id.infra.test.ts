// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.C
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 134 (lead_id on 4 consumer tables).
//
// Adds nullable lead_id columns to cost_estimates, trade_forecasts,
// tracked_projects, lead_analytics — populated in Phase C via the
// migrate-to-lead-id.js one-shot backfill. Phase B leaves them NULL.
//
// CHECK constraint allows NULL (defensive — Phase C backfills) and
// enforces 'permit:|coa:' prefix when populated. CONCURRENTLY indexes
// route the file non-transactional.
//
// lead_analytics gets the same lead_id column (rather than rename from
// lead_key) per Spec 42 §6.6.C R2.v3 decision — lead_key is retained
// as alias through Phase G.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 134 — lead_id on consumer tables (WF1 #coa-pipeline-parity-phase-b R5.3)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/134_extend_lead_id_consumers.sql'),
      'utf-8',
    );
  });

  it('ALTERs cost_estimates with ADD COLUMN IF NOT EXISTS lead_id TEXT', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+cost_estimates[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lead_id\s+TEXT/i);
  });

  it('ALTERs trade_forecasts with ADD COLUMN IF NOT EXISTS lead_id TEXT', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+trade_forecasts[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lead_id\s+TEXT/i);
  });

  it('ALTERs tracked_projects with ADD COLUMN IF NOT EXISTS lead_id TEXT', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+tracked_projects[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lead_id\s+TEXT/i);
  });

  it('ALTERs lead_analytics with ADD COLUMN IF NOT EXISTS lead_id TEXT (NOT renaming lead_key)', () => {
    // Per Spec 42 §6.6.C R2.v3 decision: add lead_id, keep lead_key as
    // alias through Phase G. NOT a column rename — Phase C backfills
    // from lead_key.
    expect(sql).toMatch(/ALTER\s+TABLE\s+lead_analytics[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lead_id\s+TEXT/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+lead_analytics[\s\S]*?RENAME\s+COLUMN\s+lead_key/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+lead_analytics[\s\S]*?DROP\s+COLUMN[\s\S]*?lead_key/i);
  });

  it('R2.v3 IF-NOT-EXISTS regression-lock: each CHECK constraint wrapped in DO/EXCEPTION', () => {
    // 4 separate DO blocks (one per table) so re-runs are safe.
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?chk_cost_estimates_lead_id_format[\s\S]*?EXCEPTION\s+WHEN\s+duplicate_object\s+THEN\s+NULL/i);
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?chk_trade_forecasts_lead_id_format[\s\S]*?EXCEPTION\s+WHEN\s+duplicate_object\s+THEN\s+NULL/i);
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?chk_tracked_projects_lead_id_format[\s\S]*?EXCEPTION\s+WHEN\s+duplicate_object\s+THEN\s+NULL/i);
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?chk_lead_analytics_lead_id_format[\s\S]*?EXCEPTION\s+WHEN\s+duplicate_object\s+THEN\s+NULL/i);
  });

  it('CHECK constraints accept NULL (Phase B unpopulated state) AND the canonical permit:|coa: prefix', () => {
    // Each CHECK: `CHECK (lead_id IS NULL OR lead_id ~ '^(permit|coa):.+$')`.
    // Asserts presence of the universal pattern.
    const checkMatches = sql.match(/CHECK\s*\(\s*lead_id\s+IS\s+NULL\s+OR\s+lead_id\s*~\s*'\^\(permit\|coa\):\.\+\$'\s*\)/gi) ?? [];
    expect(checkMatches.length).toBeGreaterThanOrEqual(4);
  });

  it('creates 4 CONCURRENTLY partial indexes (one per table, WHERE lead_id IS NOT NULL)', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_cost_estimates_lead_id\s+ON\s+cost_estimates\s*\(\s*lead_id\s*\)\s+WHERE\s+lead_id\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_trade_forecasts_lead_id\s+ON\s+trade_forecasts\s*\(\s*lead_id\s*\)\s+WHERE\s+lead_id\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_tracked_projects_lead_id\s+ON\s+tracked_projects\s*\(\s*lead_id\s*\)\s+WHERE\s+lead_id\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_lead_analytics_lead_id\s+ON\s+lead_analytics\s*\(\s*lead_id\s*\)\s+WHERE\s+lead_id\s+IS\s+NOT\s+NULL/i);
  });

  it('does NOT perform any backfill (Phase B is column-add only; Phase C migrate-to-lead-id.js handles backfill)', () => {
    // Phase B leaves the columns nullable + unpopulated. The migrate-to-
    // lead-id.js script in Phase C does the actual UPDATE on each table.
    // Migration 134 must NOT contain UPDATE statements.
    expect(sql).not.toMatch(/UPDATE\s+(?:cost_estimates|trade_forecasts|tracked_projects|lead_analytics)\s+SET/i);
  });

  it('comment-only DOWN block per Rule 6', () => {
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
