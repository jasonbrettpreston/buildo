// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4
//            docs/specs/01-pipeline/44_chain_deep_scrapes.md (step 7)
//            docs/specs/02-web-admin/86_control_panel.md §1
//
// SQL-string assertions on migration 121. Mirrors the pattern in
// migration-119-lifecycle-bands.infra.test.ts (text-based regex checks
// on the migration body — no live DB needed).
//
// Migration 121 moves the hardcoded staleness gate values out of
// scripts/quality/assert-staleness.js into the `logic_variables` table
// per Spec 47 §R4 ("no hardcoded thresholds"). 3 INSERTs total.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 121 — staleness thresholds → logic_variables', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/121_staleness_thresholds.sql'),
      'utf-8',
    );
  });

  it('inserts into logic_variables', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+logic_variables/i);
  });

  it('uses ON CONFLICT DO NOTHING for idempotency + operator-hotfix preservation', () => {
    // Same convention as migrations 118 + 119 (per Cycle 7 review).
    expect(sql).toMatch(/ON\s+CONFLICT[\s\S]*?DO\s+NOTHING/i);
  });

  it('seeds the 3 staleness threshold keys', () => {
    expect(sql).toMatch(/'staleness_max_stale_over_30d'/);
    expect(sql).toMatch(/'staleness_min_coverage_pct'/);
    expect(sql).toMatch(/'staleness_max_days_stale'/);
  });

  it('default values match the documented snapshot 2026-05-08 absorption tradeoff', () => {
    // staleness_max_stale_over_30d=10000 — chosen to absorb the 6,514 stale
    // observed at WF3 plan time (verdict WARN not FAIL); 50K+ catastrophic
    // regression still FAILs. Spot-check the literal in the migration body.
    expect(sql).toMatch(/'staleness_max_stale_over_30d'[\s\S]*?10000/);
    expect(sql).toMatch(/'staleness_min_coverage_pct'[\s\S]*?\b10\b/);
    expect(sql).toMatch(/'staleness_max_days_stale'[\s\S]*?\b60\b/);
  });

  it('every staleness INSERT includes a description column for admin UI tooltip', () => {
    // The admin Control Panel renders descriptions per Spec 86 §1.
    // Each of the 3 INSERTs must follow `'key', value, 'description'`.
    const descriptionAdjacent = sql.match(
      /'staleness_[a-z0-9_]+'[\s\S]*?,[\s\S]*?\d+[\s\S]*?,[\s\S]*?'[^']+'/g,
    );
    expect(descriptionAdjacent?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('has commented manual-rollback procedure (no transactional DOWN per Rule 6)', () => {
    // Same convention as migration 119: rolling back can't happen
    // transactionally without risking destroying operator hotfixes.
    // Rule 6 (commit 8b1c10b) bans executable SQL after `-- DOWN`.
    expect(sql).toMatch(/--\s*(DOWN|MANUAL ROLLBACK|ROLLBACK)/i);
  });
});
