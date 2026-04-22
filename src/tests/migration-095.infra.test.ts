// 🔗 SPEC LINK: docs/specs/01-pipeline/40_pipeline_system.md §3.1.1
// WF3-02 (H-W19): chain-scoped pipeline_schedules disable.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 095 — pipeline_schedules chain_id', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/095_pipeline_schedules_chain_id.sql'),
      'utf-8',
    );
  });

  it('adds chain_id TEXT column, idempotent', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS chain_id\s+TEXT/);
  });

  it('constrains chain_id to valid chain IDs or NULL', () => {
    expect(sql).toMatch(/CHECK\s*\(chain_id IN\s*\(\s*'permits',\s*'coa',\s*'sources',\s*'entities'/);
    expect(sql).toMatch(/OR chain_id IS NULL/);
  });

  it('drops the single-column PRIMARY KEY', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS pipeline_schedules_pkey/);
  });

  it('creates named unique index with COALESCE NULL-sentinel', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_schedules_scope\s*\n\s*ON pipeline_schedules \(pipeline, COALESCE\(chain_id, '__ALL__'\)\)/,
    );
  });

  it('has commented DOWN block with reverse order + PK-restore prerequisite note', () => {
    expect(sql).toMatch(/-- DOWN/);
    // Prerequisite note: re-adding PK fails if multi-row per pipeline exists
    expect(sql).toMatch(/re-adding PRIMARY KEY \(pipeline\) will fail/i);
    // DROP INDEX (NOT DROP CONSTRAINT — bare CREATE UNIQUE INDEX does not register a constraint)
    expect(sql).toMatch(/-- DROP INDEX IF EXISTS idx_pipeline_schedules_scope/);
    expect(sql).not.toMatch(/-- ALTER TABLE pipeline_schedules DROP CONSTRAINT IF EXISTS idx_pipeline_schedules_scope/);
    expect(sql).toMatch(/-- ALTER TABLE pipeline_schedules\s*\n--\s+ADD CONSTRAINT pipeline_schedules_pkey PRIMARY KEY \(pipeline\)/);
    expect(sql).toMatch(/-- ALTER TABLE pipeline_schedules DROP COLUMN IF EXISTS chain_id/);
  });
});

describe('admin schedules PATCH upsert uses the new named constraint', () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(
      path.resolve(__dirname, '../app/api/admin/pipelines/schedules/route.ts'),
      'utf-8',
    );
  });

  it('PATCH ON CONFLICT uses index-inference expression, not bare (pipeline)', () => {
    // After migration 095, the legacy PK is gone and a bare CREATE UNIQUE
    // INDEX creates only an index (not a catalog constraint), so
    // `ON CONFLICT ON CONSTRAINT <index>` would error at runtime. The
    // correct form matches the expression used in the unique index —
    // Postgres infers the target via index inference.
    expect(source).toMatch(
      /ON CONFLICT \(pipeline, COALESCE\(chain_id, '__ALL__'\)\)/,
    );
    // Regression anchors — look inside template literals only (comment
    // prose may mention the rejected form while explaining why).
    const sqlBlocks = source.match(/`[^`]*ON CONFLICT[^`]*`/g) ?? [];
    expect(sqlBlocks.length, 'no SQL template literal with ON CONFLICT found').toBeGreaterThan(0);
    for (const block of sqlBlocks) {
      expect(block, 'bare ON CONFLICT (pipeline) would fail after migration 095 drops PK').not.toMatch(/ON CONFLICT \(pipeline\)\s+DO UPDATE/);
      expect(block, 'ON CONFLICT ON CONSTRAINT fails for bare CREATE UNIQUE INDEX').not.toMatch(/ON CONFLICT ON CONSTRAINT/);
    }
  });
});
