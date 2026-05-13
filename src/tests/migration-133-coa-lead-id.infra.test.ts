// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.A.1, §6.6.D
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 133 (coa_applications lead_id +
// 18 classification/cost/geo/lifecycle columns).
//
// Operates on a 33K-row hot table. CONCURRENTLY indexes route the whole
// file non-transactional via migrate.js dual-path. Same R2.v3
// regression-locks as migration 132 (direct backfill compute, DO/EXCEPTION
// CHECK guard).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 133 — coa_applications lead_id + classification columns (WF1 #coa-pipeline-parity-phase-b R5.3)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/133_extend_coa_applications_lead_id.sql'),
      'utf-8',
    );
  });

  it('ALTERs coa_applications with ADD COLUMN IF NOT EXISTS lead_id TEXT', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+coa_applications[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lead_id\s+TEXT/i);
  });

  it('ADDs the 4 scope-classification columns (coa_type_class, project_type, scope_tags, scope_classified_at, scope_source)', () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+coa_type_class\s+VARCHAR\s*\(\s*30\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+project_type\s+VARCHAR\s*\(\s*50\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+scope_tags\s+TEXT\[\]/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+scope_classified_at\s+TIMESTAMPTZ/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+scope_source\s+VARCHAR\s*\(\s*30\s*\)/i);
  });

  it('ADDs the structure_type + neighbourhood_id + lat/long columns', () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+structure_type\s+VARCHAR\s*\(\s*30\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+neighbourhood_id\s+BIGINT/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+latitude\s+DECIMAL\s*\(\s*10\s*,\s*7\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+longitude\s+DECIMAL\s*\(\s*10\s*,\s*7\s*\)/i);
  });

  it('ADDs the 4 cost-classification columns', () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+modeled_gfa_sqm\s+NUMERIC/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+estimated_cost\s+NUMERIC/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+cost_source\s+VARCHAR\s*\(\s*20\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+cost_classified_at\s+TIMESTAMPTZ/i);
  });

  it('ADDs the 5 granular lifecycle columns (seq, group, block, stage, bid_value)', () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lifecycle_seq\s+INTEGER/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lifecycle_group\s+VARCHAR\s*\(\s*10\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lifecycle_block\s+VARCHAR\s*\(\s*10\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lifecycle_stage\s+VARCHAR\s*\(\s*5\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+bid_value\s+DECIMAL\s*\(\s*3\s*,\s*2\s*\)/i);
  });

  it('creates the coa_set_lead_id() trigger function emitting "coa:" || application_number', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+coa_set_lead_id\s*\(\s*\)/i);
    expect(sql).toMatch(/NEW\.lead_id\s*:?=\s*'coa:'\s*\|\|\s*NEW\.application_number/i);
  });

  it('creates a BEFORE INSERT OR UPDATE OF (application_number) trigger', () => {
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+trg_coa_lead_id[\s\S]*?BEFORE\s+INSERT\s+OR\s+UPDATE\s+OF\s+application_number\s+ON\s+coa_applications/i);
  });

  it('R2.v3 trigger-semantics CRIT regression-lock: backfill computes lead_id DIRECTLY (not via trigger)', () => {
    // Same pattern as migration 132 — direct compute in UPDATE.
    expect(sql).toMatch(/UPDATE\s+coa_applications[\s\S]*?SET\s+lead_id\s*=\s*'coa:'\s*\|\|\s*application_number[\s\S]*?WHERE\s+lead_id\s+IS\s+NULL/i);
    expect(sql).not.toMatch(/UPDATE\s+coa_applications\s+SET\s+lead_id\s*=\s*lead_id\s+WHERE/i);
  });

  it('R2.v3 IF-NOT-EXISTS regression-lock: CHECK constraint wrapped in DO/EXCEPTION block', () => {
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?ALTER\s+TABLE\s+coa_applications[\s\S]*?ADD\s+CONSTRAINT\s+chk_coa_lead_id_format[\s\S]*?EXCEPTION\s+WHEN\s+duplicate_object\s+THEN\s+NULL/i);
  });

  it("CHECK constraint enforces 'coa:' prefix (NOT 'permit:'), allowing NULL", () => {
    // coa_applications lead_id is always 'coa:<application_number>' — a
    // permit-prefixed value here is a serious bug.
    expect(sql).toMatch(/CHECK\s*\(\s*lead_id\s+IS\s+NULL\s+OR\s+lead_id\s*~\s*'\^coa:\.\+\$'\s*\)/i);
  });

  it('CHECK constraint enforces bid_value 0-1 range (R5.3 review fix)', () => {
    expect(sql).toMatch(/CHECK\s*\(\s*bid_value\s+IS\s+NULL\s+OR\s*\(\s*bid_value\s*>=\s*0\s+AND\s+bid_value\s*<=\s*1\s*\)\s*\)/i);
  });

  it('creates 5 CONCURRENTLY indexes including a GIN index on scope_tags', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_lead_id\s+ON\s+coa_applications\s*\(\s*lead_id\s*\)/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_neighbourhood\s+ON\s+coa_applications\s*\(\s*neighbourhood_id\s*\)\s+WHERE\s+neighbourhood_id\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_coa_type_class\s+ON\s+coa_applications\s*\(\s*coa_type_class\s*\)\s+WHERE\s+coa_type_class\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_scope_tags\s+ON\s+coa_applications\s+USING\s+GIN\s*\(\s*scope_tags\s*\)/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_lifecycle_seq\s+ON\s+coa_applications\s*\(\s*lifecycle_seq\s*\)\s+WHERE\s+lifecycle_seq\s+IS\s+NOT\s+NULL/i);
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
