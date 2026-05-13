// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C C.3
//
// Migration 140 — tracked_projects.lead_id UNIQUE (partial, WHERE NOT NULL).
//
// Per R2 Gemini finding: tracked_projects has dual-key consideration
// (permit-side rows in Phase C, CoA-side rows added in Phase D/F with
// non-NULL lead_id). The UNIQUE must be PARTIAL to allow Phase B-state
// rows that may still have NULL lead_id. NOT NULL promotion is also
// allowed here because R0.8 audit confirms the table is currently empty,
// but the partial UNIQUE is forward-safe for Phase D inserts.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 140 — tracked_projects.lead_id UNIQUE partial (Phase C R5.2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/140_promote_tracked_projects_lead_id_unique.sql'),
      'utf-8',
    );
  });

  it('sets statement_timeout', () => {
    expect(sql).toMatch(/SET\s+LOCAL\s+statement_timeout/i);
  });

  it('Stage 2: duplicate pre-check on non-NULL rows only', () => {
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?tracked_projects[\s\S]*?WHERE\s+lead_id\s+IS\s+NOT\s+NULL[\s\S]*?GROUP\s+BY\s+lead_id\s+HAVING\s+COUNT\(\*\)\s*>\s*1[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it('creates uniq_tracked_projects_lead_id PARTIAL (WHERE lead_id IS NOT NULL)', () => {
    // R2 Gemini fix: must be partial so Phase D CoA-row inserts (which
    // may have NULL lead_id before Phase F populates them) don't violate.
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+uniq_tracked_projects_lead_id\s+ON\s+tracked_projects\s*\(\s*lead_id\s*\)\s+WHERE\s+lead_id\s+IS\s+NOT\s+NULL/i);
  });

  it('drops Phase B idx_tracked_projects_lead_id', () => {
    expect(sql).toMatch(/DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+idx_tracked_projects_lead_id/i);
  });

  it('does NOT ALTER COLUMN SET NOT NULL (deferred to Phase F per active task C.3)', () => {
    // Per active task C.3 dual-key consideration: tracked_projects NOT
    // NULL promotion is deferred to Phase F where CoA-side rows get
    // their lead_id populated. Phase C only adds the partial UNIQUE.
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+tracked_projects[\s\S]*?ALTER\s+COLUMN\s+lead_id\s+SET\s+NOT\s+NULL/i);
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
