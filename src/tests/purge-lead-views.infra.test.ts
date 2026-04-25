// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R10, §R4
//
// Source-level regression locks for purge-lead-views.js — verifies spec compliance
// for retention cleanup semantics, audit_table emission, and threshold loading.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/purge-lead-views.js'),
  'utf-8',
);

describe('scripts/purge-lead-views.js — spec compliance', () => {

  it('D1: records_updated is 0 — deletions must not be tracked as updates (spec §11)', () => {
    // records_updated = totalDeleted violated spec §11 counter semantics.
    expect(source).not.toContain('records_updated: totalDeleted');
    expect(source).toMatch(/records_updated\s*:\s*0/);
  });

  it('D2: emits audit_table in records_meta — no SDK UNKNOWN stub (spec §R10)', () => {
    // Without audit_table, SDK injects UNKNOWN verdict; dashboard always shows green.
    expect(source).toContain('audit_table');
    expect(source).toContain('rows_deleted');
  });

  it('D3: loads RETENTION_DAYS from DB via loadMarketplaceConfigs (spec §4.1)', () => {
    expect(source).toContain('loadMarketplaceConfigs');
    expect(source).toContain('lead_view_retention_days');
  });

  it('D3: validates RETENTION_DAYS with Zod schema', () => {
    expect(source).toContain('z.object');
    expect(source).toContain('lead_view_retention_days');
  });

  it('D4: guards against RETENTION_DAYS < 1 — zero would delete all rows', () => {
    expect(source).toMatch(/RETENTION_DAYS\s*<\s*1|retentionDays\s*<\s*1/);
  });

  it('logic_variables.json seed contains lead_view_retention_days entry', () => {
    const seed = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'),
        'utf-8',
      ),
    ) as Record<string, unknown>;
    expect(seed).toHaveProperty('lead_view_retention_days');
  });

  it('Bug1: RETENTION_DAYS comes from Zod safeParse result.data — not raw logicVars fallback', () => {
    // logicVars.lead_view_retention_days ?? 90 bypasses Zod coercion/default entirely.
    // safeParse returns result.data with the coerced, defaulted value.
    expect(source).not.toContain('logicVars.lead_view_retention_days ?? 90');
    expect(source).toMatch(/safeParse|parsed\.data\.lead_view_retention_days/);
  });

  it('Bug2: CUTOFF_AT captured once before batch loop — NOW() must not appear inside the loop', () => {
    // NOW() per iteration shifts the retention window if a run crosses midnight.
    const whileIdx = source.indexOf('while (true)');
    expect(whileIdx).toBeGreaterThan(-1);
    expect(source.slice(whileIdx)).not.toMatch(/\bNOW\(\)/);
  });

  it('Bug3: records_total is stale (rows evaluated) not totalDeleted (spec §11.1)', () => {
    // records_total = rows evaluated by the retention policy; deletion count belongs in audit_table.
    expect(source).not.toContain('records_total: totalDeleted');
    expect(source).toMatch(/records_total\s*:\s*stale/);
  });
});
