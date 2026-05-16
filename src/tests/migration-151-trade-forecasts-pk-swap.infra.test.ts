// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B Option C
//             docs/specs/01-pipeline/85_trade_forecast_engine.md §2 Database Schema
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §6.11 Phase F.1
//
// SQL-shape regression-lock for migration 151 — Phase F.1 v4.
//
// Mig 151 swaps trade_forecasts PK from (permit_num, revision_num, trade_slug)
// to (lead_id, trade_slug) per Spec 42 §6.6.B Option C. The supporting UNIQUE
// INDEX uniq_trade_forecasts_lead_id_trade was provisioned by mig 139 (Phase C);
// this migration promotes it to PRIMARY KEY USING INDEX (metadata-only, no rewrite).
//
// Order matters: drop PK BEFORE drop NOT NULL (PostgreSQL forbids nullable cols
// inside a PRIMARY KEY). FK fk_forecasts_permit is also dropped (CoA forecasts
// have no permits row to reference; stale-purge handles deletion).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 151 — trade_forecasts PK swap (lead_id, trade_slug) (WF1 Phase F.1 v4)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/151_trade_forecasts_pk_swap_to_lead_id.sql'),
      'utf-8',
    );
  });

  // ─── UP — 4 structural changes in correct order ─────────────────────

  it('drops FK fk_forecasts_permit', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+trade_forecasts\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+fk_forecasts_permit/i);
  });

  it('drops legacy PK trade_forecasts_pkey BEFORE altering NOT NULL on permit_num/revision_num', () => {
    // Strip comment lines so we only check executable SQL ordering
    const exec = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    const dropPkIdx = exec.search(/ALTER\s+TABLE\s+trade_forecasts\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+trade_forecasts_pkey/i);
    const dropNotNullPermitIdx = exec.search(/ALTER\s+TABLE\s+trade_forecasts\s+ALTER\s+COLUMN\s+permit_num\s+DROP\s+NOT\s+NULL/i);
    const dropNotNullRevisionIdx = exec.search(/ALTER\s+TABLE\s+trade_forecasts\s+ALTER\s+COLUMN\s+revision_num\s+DROP\s+NOT\s+NULL/i);
    expect(dropPkIdx).toBeGreaterThan(0);
    expect(dropNotNullPermitIdx).toBeGreaterThan(0);
    expect(dropNotNullRevisionIdx).toBeGreaterThan(0);
    // Ordering invariant: PK drop must precede NOT NULL drops (PostgreSQL constraint)
    expect(dropPkIdx).toBeLessThan(dropNotNullPermitIdx);
    expect(dropPkIdx).toBeLessThan(dropNotNullRevisionIdx);
  });

  it('relaxes NOT NULL on both permit_num and revision_num', () => {
    expect(sql).toMatch(/ALTER\s+COLUMN\s+permit_num\s+DROP\s+NOT\s+NULL/i);
    expect(sql).toMatch(/ALTER\s+COLUMN\s+revision_num\s+DROP\s+NOT\s+NULL/i);
  });

  it('promotes uniq_trade_forecasts_lead_id_trade to PRIMARY KEY via USING INDEX (metadata-only)', () => {
    expect(sql).toMatch(
      /ADD\s+CONSTRAINT\s+trade_forecasts_pkey\s+PRIMARY\s+KEY\s+USING\s+INDEX\s+uniq_trade_forecasts_lead_id_trade/i,
    );
  });

  it('wraps UP statements in a single BEGIN/COMMIT (single atomic migration)', () => {
    // Strip comment lines so we don't count DOWN-block BEGIN/COMMIT in the comments
    const exec = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    const beginCount = (exec.match(/\bBEGIN\s*;/gi) || []).length;
    const commitCount = (exec.match(/\bCOMMIT\s*;/gi) || []).length;
    expect(beginCount).toBe(1);
    expect(commitCount).toBe(1);
  });

  // ─── DOWN — comment-only per Rule 6 convention ──────────────────────

  it('DOWN block is comment-only (Rule 6 convention — matches mig 132/138/140/142/145/147/148/150)', () => {
    const downIdx = sql.indexOf('-- DOWN');
    expect(downIdx).toBeGreaterThan(0);
    const downSection = sql.slice(downIdx);
    // Every non-blank line after the DOWN marker must start with `--` (comment-only)
    const nonCommentLines = downSection
      .split('\n')
      .filter(line => line.trim() !== '' && !line.trim().startsWith('--') && !line.startsWith('==='));
    expect(nonCommentLines).toEqual([]);
  });

  it('DOWN block contains DELETE FROM trade_forecasts WHERE permit_num IS NULL (v4 HIGH-E fold — reordered FIRST)', () => {
    expect(sql).toMatch(/DELETE\s+FROM\s+trade_forecasts\s+WHERE\s+permit_num\s+IS\s+NULL\s+OR\s+revision_num\s+IS\s+NULL/i);
  });

  it('DOWN block uses CREATE UNIQUE INDEX IF NOT EXISTS for idempotency (v4 HIGH-E fold)', () => {
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+trade_forecasts_legacy_3col_uniq/i);
  });
});
