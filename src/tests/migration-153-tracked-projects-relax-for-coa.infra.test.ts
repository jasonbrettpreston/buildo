// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B Option C
//             docs/specs/01-pipeline/82_crm_assistant_alerts.md §4 CoA Lead Handling
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §6.11 Phase F.2
//
// SQL-shape regression-lock for migration 153 — Phase F.2 v4.
//
// Mig 153: drops FK fk_tracked_projects_permits, makes permit_num + revision_num nullable,
// adds CoA partial UNIQUE INDEX uq_tracked_user_coa_trade (v2 CRIT-B fold), and adds
// notified_decision_rendered BOOLEAN column (v2 CRIT-G fold). Metadata-only — no table rewrite.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 153 — tracked_projects relax for CoA (WF1 Phase F.2 v4)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/153_tracked_projects_relax_for_coa.sql'),
      'utf-8',
    );
  });

  // ─── UP — 4 structural changes ────────────────────────────────────

  it('drops FK fk_tracked_projects_permits', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+tracked_projects\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+fk_tracked_projects_permits/i);
  });

  it('relaxes NOT NULL on both permit_num and revision_num', () => {
    expect(sql).toMatch(/ALTER\s+COLUMN\s+permit_num\s+DROP\s+NOT\s+NULL/i);
    expect(sql).toMatch(/ALTER\s+COLUMN\s+revision_num\s+DROP\s+NOT\s+NULL/i);
  });

  it('adds CoA partial UNIQUE INDEX uq_tracked_user_coa_trade (v2 CRIT-B fold)', () => {
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_tracked_user_coa_trade[\s\S]+ON\s+tracked_projects\s*\(\s*user_id\s*,\s*lead_id\s*,\s*trade_slug\s*\)[\s\S]+WHERE\s+lead_id\s+LIKE\s+'coa:%'/i,
    );
  });

  it('adds notified_decision_rendered BOOLEAN column with NOT NULL DEFAULT FALSE (v2 CRIT-G fold)', () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+tracked_projects[\s\S]+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+notified_decision_rendered\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i,
    );
  });

  it('wraps UP statements in single BEGIN/COMMIT (atomic UP)', () => {
    const exec = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    const beginCount = (exec.match(/\bBEGIN\s*;/gi) || []).length;
    const commitCount = (exec.match(/\bCOMMIT\s*;/gi) || []).length;
    expect(beginCount).toBe(1);
    expect(commitCount).toBe(1);
  });

  // ─── DOWN — comment-only per Rule 6 convention ──────────────────────

  it('DOWN block is comment-only (Rule 6 convention)', () => {
    const downIdx = sql.indexOf('-- DOWN');
    expect(downIdx).toBeGreaterThan(0);
    const downSection = sql.slice(downIdx);
    const nonCommentLines = downSection
      .split('\n')
      .filter(line => line.trim() !== '' && !line.trim().startsWith('--') && !line.startsWith('==='));
    expect(nonCommentLines).toEqual([]);
  });

  it('DOWN block uses broad DELETE WHERE lead_id LIKE \'coa:%\' (v4 HIGH-HH fold — no AND-permit_num clause)', () => {
    expect(sql).toMatch(/DELETE\s+FROM\s+tracked_projects\s+WHERE\s+lead_id\s+LIKE\s+'coa:%'\s*;/i);
    // Verify the v3 narrower form is NOT present (would cause incomplete rollback per Gemini v3 HIGH 5)
    expect(sql).not.toMatch(/lead_id\s+LIKE\s+'coa:%'\s+AND\s+\(permit_num\s+IS\s+NULL/i);
  });

  it('SPEC LINK header references Spec 42 + Spec 82 + Spec 84', () => {
    expect(sql).toMatch(/SPEC LINK.*42_chain_coa/);
    expect(sql).toMatch(/SPEC LINK.*82_crm_assistant_alerts/);
    expect(sql).toMatch(/SPEC LINK.*84_lifecycle_phase_engine/);
  });
});
