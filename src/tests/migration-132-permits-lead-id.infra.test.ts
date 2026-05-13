// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.A.1, §6.6.E
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 132 (permits lead_id + lifecycle cols).
//
// HIGHEST-RISK MIGRATION in Phase B. Adds 7 columns to a 247K-row hot
// table, populates lead_id on every existing row via a one-pass UPDATE
// backfill, and creates 3 CONCURRENTLY indexes (forces migrate.js into
// non-transactional mode).
//
// R2.v3 trigger-semantics CRIT regression-lock: the backfill UPDATE
// MUST directly compute lead_id (`SET lead_id = 'permit:' || ...`).
// It MUST NOT rely on the column-targeted trigger
// (`SET lead_id = lead_id`) — that pattern doesn't fire the trigger
// because permit_num and revision_num aren't touched. All 247K rows
// would stay NULL, breaking Phase C.
//
// R2.v3 IF-NOT-EXISTS regression-lock: ADD CONSTRAINT must be wrapped
// in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` so
// re-runs in non-transactional mode don't fail.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 132 — permits lead_id + lifecycle columns (WF1 #coa-pipeline-parity-phase-b R5.3)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/132_extend_permits_lead_id.sql'),
      'utf-8',
    );
  });

  it('ALTERs the permits table with ADD COLUMN IF NOT EXISTS lead_id TEXT', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+permits[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lead_id\s+TEXT/i);
  });

  it('ADDs the linked_coa_application_number back-reference column', () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+linked_coa_application_number\s+VARCHAR\s*\(\s*50\s*\)/i);
  });

  it('ADDs 5 granular lifecycle columns (seq, group, block, stage, bid_value)', () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lifecycle_seq\s+INTEGER/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lifecycle_group\s+VARCHAR\s*\(\s*10\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lifecycle_block\s+VARCHAR\s*\(\s*10\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+lifecycle_stage\s+VARCHAR\s*\(\s*5\s*\)/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+bid_value\s+DECIMAL\s*\(\s*3\s*,\s*2\s*\)/i);
  });

  it('creates a trigger function permits_set_lead_id() that emits "permit:" || permit_num || ":" || LPAD(...)', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+permits_set_lead_id\s*\(\s*\)/i);
    // The trigger body must contain the canonical lead_id derivation.
    expect(sql).toMatch(/NEW\.lead_id\s*:?=\s*'permit:'\s*\|\|\s*NEW\.permit_num\s*\|\|\s*':'\s*\|\|\s*LPAD\s*\(\s*NEW\.revision_num\s*,\s*2\s*,\s*'0'\s*\)/i);
  });

  it('creates a BEFORE INSERT OR UPDATE OF (permit_num, revision_num) trigger', () => {
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+trg_permits_lead_id[\s\S]*?BEFORE\s+INSERT\s+OR\s+UPDATE\s+OF\s+permit_num\s*,\s*revision_num\s+ON\s+permits/i);
  });

  it('R2.v3 trigger-semantics CRIT regression-lock: backfill computes lead_id DIRECTLY (not via trigger)', () => {
    // The trigger is column-targeted (UPDATE OF permit_num, revision_num).
    // Backfill `UPDATE permits SET lead_id = lead_id WHERE lead_id IS NULL`
    // does NOT fire the trigger → all 247K rows would stay NULL.
    // The correct pattern: directly compute the value in the UPDATE.
    expect(sql).toMatch(/UPDATE\s+permits[\s\S]*?SET\s+lead_id\s*=\s*'permit:'\s*\|\|\s*permit_num\s*\|\|\s*':'\s*\|\|\s*LPAD\s*\(\s*revision_num\s*,\s*2\s*,\s*'0'\s*\)[\s\S]*?WHERE\s+lead_id\s+IS\s+NULL/i);
    // Anti-pattern detection: the trigger-reliant form must NOT appear.
    expect(sql).not.toMatch(/UPDATE\s+permits\s+SET\s+lead_id\s*=\s*lead_id\s+WHERE/i);
  });

  it('R2.v3 IF-NOT-EXISTS regression-lock: CHECK constraint wrapped in DO/EXCEPTION block', () => {
    // ADD CONSTRAINT has no IF NOT EXISTS syntax in PostgreSQL. In a
    // non-transactional CONCURRENTLY-routed file, a re-run after partial
    // success fails on "constraint already exists" without this guard.
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?ALTER\s+TABLE\s+permits[\s\S]*?ADD\s+CONSTRAINT\s+chk_permits_lead_id_format[\s\S]*?CHECK\s*\([\s\S]*?lead_id[\s\S]*?\)[\s\S]*?EXCEPTION\s+WHEN\s+duplicate_object\s+THEN\s+NULL[\s\S]*?END\s+\$\$/i);
  });

  it('CHECK constraint regex enforces prefix-only — accepts NULL + any "permit:..." (R5.3 worktree fix — was over-strict)', () => {
    // R5.3 worktree review caught over-strict regex `'^permit:.+:[0-9A-Za-z]+$'`
    // would reject revision_num values containing hyphens/underscores. Spec 42
    // §6.6.A.1 mandates the universal prefix-only pattern. Migration 133 uses
    // the same prefix-only shape for coa_applications.
    expect(sql).toMatch(/CHECK\s*\(\s*lead_id\s+IS\s+NULL\s+OR\s+lead_id\s*~\s*'\^permit:\.\+\$'\s*\)/i);
    // Anti-pattern: the over-strict form must not be present.
    expect(sql).not.toMatch(/CHECK\s*\([\s\S]*?lead_id[\s\S]*?\[0-9A-Za-z\]\+\$/i);
  });

  it('CHECK constraint enforces bid_value 0-1 range (R5.3 review fix — DECIMAL(3,2) alone allows -9.99..9.99)', () => {
    // R5.3 Gemini-132 + DeepSeek-133 caught: bid_value declared as
    // DECIMAL(3,2) without a range CHECK accepts -9.99..9.99. The
    // universal_stream_catalog.bid_value has the same 0-1 CHECK; the
    // hot-table columns must match.
    expect(sql).toMatch(/CHECK\s*\(\s*bid_value\s+IS\s+NULL\s+OR\s*\(\s*bid_value\s*>=\s*0\s+AND\s+bid_value\s*<=\s*1\s*\)\s*\)/i);
  });

  it('creates 3 CONCURRENTLY indexes on lead_id + linked_coa + lifecycle_seq', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_permits_lead_id\s+ON\s+permits\s*\(\s*lead_id\s*\)/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_permits_linked_coa\s+ON\s+permits\s*\(\s*linked_coa_application_number\s*\)\s+WHERE\s+linked_coa_application_number\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_permits_lifecycle_seq\s+ON\s+permits\s*\(\s*lifecycle_seq\s*\)\s+WHERE\s+lifecycle_seq\s+IS\s+NOT\s+NULL/i);
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
