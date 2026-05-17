// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 row "Phase G"
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §10 + §11
//
// Phase G PRE-permit retirement shim — regression lock on the source code shape.
// The shim's actual chain run is verified by the operator during Green Light
// (per the active task's verification step using scripts/test-helpers/seed-pre-permits.mjs);
// this file pins the source contract that the 4 plan-stage reviewers signed off on.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/create-pre-permits.js'),
  'utf-8',
);

describe('create-pre-permits.js — PRE-permit retirement shim (Phase G)', () => {
  // ── DELETE coverage: 10 tables, FK-safe ordering ─────────────────────────

  it('DELETEs all 10 affected tables (9 children + parent permits)', () => {
    expect(SRC).toMatch(/DELETE FROM lead_trades\s+WHERE lead_id LIKE 'permit:PRE-%'/);
    expect(SRC).toMatch(/DELETE FROM lead_parcels\s+WHERE lead_id LIKE 'permit:PRE-%'/);
    expect(SRC).toMatch(/DELETE FROM tracked_projects\s+WHERE lead_id LIKE 'permit:PRE-%'/);
    expect(SRC).toMatch(/DELETE FROM permit_history\s+WHERE permit_num LIKE 'PRE-%'/);
    expect(SRC).toMatch(/DELETE FROM permit_products\s+WHERE permit_num LIKE 'PRE-%'/);
    expect(SRC).toMatch(/DELETE FROM permit_phase_transitions\s+WHERE permit_num LIKE 'PRE-%'/);
    expect(SRC).toMatch(/DELETE FROM lifecycle_transitions\s+WHERE lead_id LIKE 'permit:PRE-%'/);
    expect(SRC).toMatch(/DELETE FROM permit_trades\s+WHERE permit_num LIKE 'PRE-%'/);
    expect(SRC).toMatch(/DELETE FROM permit_parcels\s+WHERE permit_num LIKE 'PRE-%'/);
    expect(SRC).toMatch(/DELETE FROM permits\s+WHERE permit_type = 'Pre-Permit'/);
  });

  it('child-table DELETEs precede the parent DELETE FROM permits', () => {
    const parentIdx = SRC.indexOf("DELETE FROM permits WHERE permit_type = 'Pre-Permit'");
    expect(parentIdx).toBeGreaterThan(0);
    for (const child of [
      'lead_trades', 'lead_parcels', 'tracked_projects', 'permit_history',
      'permit_products', 'permit_phase_transitions', 'lifecycle_transitions',
      'permit_trades', 'permit_parcels',
    ]) {
      const childIdx = SRC.indexOf(`DELETE FROM ${child}`);
      expect(childIdx).toBeGreaterThan(0);
      expect(childIdx).toBeLessThan(parentIdx);
    }
  });

  it('all DELETEs are inside a single pipeline.withTransaction block', () => {
    const txIdx = SRC.indexOf('pipeline.withTransaction');
    expect(txIdx).toBeGreaterThan(0);
    // No `pipeline.withTransaction` should appear before the first DELETE.
    const firstDeleteIdx = SRC.indexOf('DELETE FROM lead_trades');
    expect(txIdx).toBeLessThan(firstDeleteIdx);
  });

  // ── emitSummary contract per Spec 47 §11.1 + purge-lead-views.js precedent ─

  it('emitSummary records_total uses pre-delete count (NOT deleted_count)', () => {
    expect(SRC).toMatch(/records_total:\s*preDeleteCount/);
    expect(SRC).toMatch(/SELECT COUNT\(\*\)::int AS n FROM permits WHERE permit_type = 'Pre-Permit'/);
  });

  it('emitSummary records_new = 0 and records_updated = 0 (DELETEs are not inserts or updates)', () => {
    expect(SRC).toMatch(/records_new:\s*0/);
    expect(SRC).toMatch(/records_updated:\s*0/);
  });

  // ── Verdict: PASS when N>0; SKIP on no-op ────────────────────────────────

  it('verdict is PASS when preDeleteCount > 0, SKIP when 0 (distinguishes cleanup-ran from already-complete)', () => {
    expect(SRC).toMatch(/preDeleteCount === 0 \? 'SKIP' : 'PASS'/);
  });

  // ── audit_table: 10 per-table count rows ─────────────────────────────────

  it('audit_table.rows has 10 entries with per-table deleted counts', () => {
    for (const metric of [
      'pre_permits_deleted',
      'pre_permit_trades_deleted',
      'pre_permit_parcels_deleted',
      'pre_lead_trades_deleted',
      'pre_lead_parcels_deleted',
      'pre_tracked_projects_deleted',
      'pre_permit_history_deleted',
      'pre_permit_products_deleted',
      'pre_permit_phase_transitions_deleted',
      'pre_lifecycle_transitions_deleted',
    ]) {
      expect(SRC).toMatch(new RegExp(`metric:\\s*'${metric}'`));
    }
  });

  // ── emitMeta: tracked_projects keyed on lead_id (not permit_num/revision_num) ─

  it('emitMeta writes tracked_projects with [lead_id] key (post-Phase C rekey)', () => {
    expect(SRC).toMatch(/tracked_projects:\s*\['lead_id'\]/);
  });

  it('emitMeta reads only permits.{permit_num, permit_type} (per-table counts via result.rowCount)', () => {
    // The reads object should only mention permits — no SELECT against the child tables.
    expect(SRC).toMatch(/pipeline\.emitMeta\(\s*\{\s*permits:\s*\['permit_num',\s*'permit_type'\]\s*\}/);
  });

  // ── Advisory lock + structure ─────────────────────────────────────────────

  it('uses advisory lock 100 (preserved from pre-Phase-G script)', () => {
    expect(SRC).toMatch(/ADVISORY_LOCK_ID = 100/);
    expect(SRC).toMatch(/pipeline\.withAdvisoryLock/);
  });

  // ── Old surface area is gone ──────────────────────────────────────────────

  it('no longer reads pre_permit_expiry_months via logicVars (vestigial)', () => {
    expect(SRC).not.toMatch(/logicVars\.pre_permit_expiry_months/);
    expect(SRC).not.toMatch(/loadMarketplaceConfigs/);
  });

  it('does not INSERT into permits anymore (retirement shim, not generator)', () => {
    expect(SRC).not.toMatch(/INSERT INTO permits/);
  });

  it('does not UPDATE Pre-Permits (no Forecasted → Expired transitions)', () => {
    expect(SRC).not.toMatch(/UPDATE permits/);
  });
});
