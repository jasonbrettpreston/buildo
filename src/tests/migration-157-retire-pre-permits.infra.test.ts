// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 row "Phase G" (PRE-permit retirement)
//             docs/specs/01-pipeline/79_pipeline_step_validation.md (Step 19 CRIT-2 trigger)
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md (Phase I.1.1b lifecycle_status_history)
//
// SQL-shape regression-lock for migration 157. Surfaced by Spec 79 permits validation
// Step 19 — assert-data-bounds.js Phase G gate (permits_pre_permit_count == 0) failed
// with 147 zombie PRE-permits + 1,399 child rows. The retired Phase G shim
// (scripts/create-pre-permits.js, commit 3944f88, git-rm'd in 0de4cab) never ran on this
// DB. Migration 157 performs an extended multi-table DELETE that includes
// lifecycle_status_history — a table that postdates the retired shim (Phase I.1.1b).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 157 -- retire PRE-permits (Spec 79 CRIT-2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/157_retire_pre_permits.sql'),
      'utf-8',
    );
  });

  // ─── DO-block wrapper (atomicity + observability) ────────────────────

  it('wraps the cleanup in a DO $$ ... END$$; block (single implicit transaction)', () => {
    expect(sql).toMatch(/DO \$\$/);
    expect(sql).toMatch(/END\$\$/);
  });

  it('counts parent rows BEFORE the DELETE pass (sanity-check precondition)', () => {
    expect(sql).toMatch(/SELECT\s+COUNT\(\*\)\s+INTO\s+v_parent_count\s+FROM\s+permits\s+WHERE\s+permit_type\s*=\s*'Pre-Permit'/i);
  });

  it("RAISEs a sanity EXCEPTION if v_permits_deleted != v_parent_count (rollback guard)", () => {
    expect(sql).toMatch(/IF\s+v_permits_deleted\s*!=\s*v_parent_count\s+THEN/i);
    expect(sql).toMatch(/RAISE\s+EXCEPTION/i);
  });

  it('uses RAISE NOTICE to emit per-table deletion counts (Phase G v2-Q1 observability)', () => {
    expect(sql).toMatch(/RAISE\s+NOTICE\s+'mig 157 deletions:/i);
  });

  // ─── Required DELETE statements (full child-table sweep) ─────────────

  const requiredDeletes: ReadonlyArray<readonly [string, RegExp]> = [
    ['lead_trades',              /DELETE\s+FROM\s+lead_trades\s+WHERE\s+lead_id\s+LIKE\s+'permit:PRE-%'/i],
    ['lead_parcels',             /DELETE\s+FROM\s+lead_parcels\s+WHERE\s+lead_id\s+LIKE\s+'permit:PRE-%'/i],
    ['tracked_projects',         /DELETE\s+FROM\s+tracked_projects\s+WHERE\s+lead_id\s+LIKE\s+'permit:PRE-%'/i],
    ['lifecycle_transitions',    /DELETE\s+FROM\s+lifecycle_transitions\s+WHERE\s+lead_id\s+LIKE\s+'permit:PRE-%'/i],
    ['lifecycle_status_history', /DELETE\s+FROM\s+lifecycle_status_history\s+WHERE\s+lead_id\s+LIKE\s+'permit:PRE-%'/i],
    ['permit_history',           /DELETE\s+FROM\s+permit_history\s+WHERE\s+permit_num\s+LIKE\s+'PRE-%'/i],
    ['permit_products',          /DELETE\s+FROM\s+permit_products\s+WHERE\s+permit_num\s+LIKE\s+'PRE-%'/i],
    ['permit_phase_transitions', /DELETE\s+FROM\s+permit_phase_transitions\s+WHERE\s+permit_num\s+LIKE\s+'PRE-%'/i],
    ['cost_estimates',           /DELETE\s+FROM\s+cost_estimates\s+WHERE\s+permit_num\s+LIKE\s+'PRE-%'/i],
    ['lead_views',               /DELETE\s+FROM\s+lead_views\s+WHERE\s+permit_num\s+LIKE\s+'PRE-%'/i],
    ['permit_trades',            /DELETE\s+FROM\s+permit_trades\s+WHERE\s+permit_num\s+LIKE\s+'PRE-%'/i],
    ['permit_parcels',           /DELETE\s+FROM\s+permit_parcels\s+WHERE\s+permit_num\s+LIKE\s+'PRE-%'/i],
    ['permits (parent)',         /DELETE\s+FROM\s+permits\s+WHERE\s+permit_type\s*=\s*'Pre-Permit'/i],
  ];

  for (const [tag, pattern] of requiredDeletes) {
    it(`includes DELETE for ${tag}`, () => {
      expect(sql).toMatch(pattern);
    });
  }

  // ─── DeepSeek HIGH fold: lifecycle_status_history specifically ──────

  it('explicitly mentions lifecycle_status_history in the header (Phase I.1.1b)', () => {
    expect(sql).toMatch(/lifecycle_status_history/);
    expect(sql).toMatch(/Phase I\.1\.1b|84_lifecycle_phase_engine/i);
  });

  // ─── Parent DELETE ordering: must come AFTER all permit_num children ─

  it('parent DELETE comes AFTER permit_trades + permit_parcels (FK-safe ordering, no-FK case)', () => {
    const permitsDeleteIdx = sql.search(/DELETE\s+FROM\s+permits\s+WHERE\s+permit_type\s*=\s*'Pre-Permit'/i);
    const permitTradesIdx  = sql.search(/DELETE\s+FROM\s+permit_trades\s+WHERE\s+permit_num\s+LIKE\s+'PRE-%'/i);
    const permitParcelsIdx = sql.search(/DELETE\s+FROM\s+permit_parcels\s+WHERE\s+permit_num\s+LIKE\s+'PRE-%'/i);
    expect(permitsDeleteIdx).toBeGreaterThan(permitTradesIdx);
    expect(permitsDeleteIdx).toBeGreaterThan(permitParcelsIdx);
  });

  // ─── DOWN comment-only per Rule 6 ────────────────────────────────────

  it('DOWN section is comment-only (no executable rollback)', () => {
    const downIdx = sql.indexOf('-- DOWN');
    expect(downIdx).toBeGreaterThan(-1);
    const downSection = sql.slice(downIdx);
    const lines = downSection.split('\n').slice(1);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      expect(trimmed.startsWith('--')).toBe(true);
    }
  });

  // ─── SPEC LINK headers ───────────────────────────────────────────────

  it('references Spec 42 §6.11 + Spec 79 + Spec 84 in header comment', () => {
    expect(sql).toMatch(/Spec\s+42\s+§6\.11|42_chain_coa.*§6\.11/i);
    expect(sql).toMatch(/Spec\s+79|79_pipeline_step_validation/i);
    expect(sql).toMatch(/Spec\s+84|84_lifecycle_phase_engine/i);
  });
});
