// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.A.1, §6.11 Phase C
//
// Migration 142 — extend lead_id_orphan_audit view to cover the 4 Phase C
// consumer tables (cost_estimates, trade_forecasts, tracked_projects,
// lead_analytics). Phase B's view (migration 137) covered only the 4
// Phase B tables; now that consumers are backfilled + NOT NULL, they
// should also be orphan-audited.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 142 — extend lead_id_orphan_audit view (Phase C R5.2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/142_extend_lead_id_orphan_audit_view.sql'),
      'utf-8',
    );
  });

  it('uses CREATE OR REPLACE VIEW (re-runnable; replaces Phase B view definition)', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW\s+lead_id_orphan_audit\s+AS/i);
  });

  it('still covers the 4 Phase B tables (regression-lock)', () => {
    for (const table of ['lead_trades', 'lead_parcels', 'lifecycle_transitions', 'lifecycle_status_history']) {
      expect(sql).toMatch(new RegExp(`FROM\\s+${table}\\b`, 'i'));
    }
  });

  it('adds the 4 Phase C consumer tables', () => {
    for (const table of ['cost_estimates', 'trade_forecasts', 'tracked_projects', 'lead_analytics']) {
      expect(sql).toMatch(new RegExp(`FROM\\s+${table}\\b`, 'i'));
    }
  });

  it('every UNION ALL branch LEFT JOINs both permits + coa_applications and filters WHERE both parents NULL', () => {
    const leftJoinPermits = sql.match(/LEFT\s+JOIN\s+permits\b/gi) ?? [];
    const leftJoinCoa = sql.match(/LEFT\s+JOIN\s+coa_applications\b/gi) ?? [];
    // 8 source tables × 1 left-join-pair each = 8 of each
    expect(leftJoinPermits.length).toBeGreaterThanOrEqual(8);
    expect(leftJoinCoa.length).toBeGreaterThanOrEqual(8);
  });

  it('contains 7 UNION ALL keywords in executable SQL (8 branches → 7 UNIONs; comments excluded)', () => {
    const executableOnly = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const unions = executableOnly.match(/UNION\s+ALL/gi) ?? [];
    expect(unions.length).toBe(7);
  });

  it('comment-only DOWN block per Rule 6', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
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
