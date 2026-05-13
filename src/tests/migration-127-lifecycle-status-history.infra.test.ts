// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 127 (lifecycle_status_history table).
//
// Migration 127 creates the lifecycle_status_history ledger — captures EVERY
// source-status change (not just phase changes), including same-phase
// transitions like Tentatively Scheduled → Hearing Scheduled within P2.
// Snapshots CoA decision + decision_date at each transition.
//
// Critical: UNIQUE INDEX (lead_id, to_status, date_trunc('second', transitioned_at))
// is the idempotency guard against re-runs from load-permits.js / load-coa.js.
// Three writers: load-permits.js, load-coa.js, classify-lifecycle-phase.js
// enforced by CHECK on detected_by.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 127 — lifecycle_status_history table (WF1 #coa-pipeline-parity-phase-b R5.1)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/127_create_lifecycle_status_history.sql'),
      'utf-8',
    );
  });

  it('creates the lifecycle_status_history table', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+lifecycle_status_history/i);
  });

  it('declares id BIGSERIAL PRIMARY KEY (high-volume ledger)', () => {
    expect(sql).toMatch(/id\s+BIGSERIAL\s+PRIMARY\s+KEY/i);
  });

  it('declares lead_id TEXT NOT NULL with CHECK regex', () => {
    expect(sql).toMatch(/lead_id\s+TEXT\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CHECK\s*\(\s*lead_id\s*~\s*'\^\(permit\|coa\):\.\+\$'\s*\)/);
  });

  it('declares from_status VARCHAR(60) (nullable on first observation)', () => {
    expect(sql).toMatch(/from_status\s+VARCHAR\s*\(\s*60\s*\)/i);
  });

  it('declares to_status VARCHAR(60) NOT NULL', () => {
    expect(sql).toMatch(/to_status\s+VARCHAR\s*\(\s*60\s*\)\s+NOT\s+NULL/i);
  });

  it('declares from_seq + to_seq INTEGER (granular row references)', () => {
    expect(sql).toMatch(/from_seq\s+INTEGER/i);
    expect(sql).toMatch(/to_seq\s+INTEGER/i);
  });

  it('declares from_phase + to_phase VARCHAR(20) (legacy P-code)', () => {
    expect(sql).toMatch(/from_phase\s+VARCHAR\s*\(\s*20\s*\)/i);
    expect(sql).toMatch(/to_phase\s+VARCHAR\s*\(\s*20\s*\)/i);
  });

  it('declares decision VARCHAR(60) (CoA decision snapshot at status change)', () => {
    expect(sql).toMatch(/decision\s+VARCHAR\s*\(\s*60\s*\)/i);
  });

  it('declares decision_date DATE', () => {
    expect(sql).toMatch(/decision_date\s+DATE/i);
  });

  it('declares transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', () => {
    expect(sql).toMatch(/transitioned_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\s*\(\s*\)/i);
  });

  it('declares detected_by VARCHAR(60) NOT NULL with CHECK enumerating the 3 writers', () => {
    expect(sql).toMatch(/detected_by\s+VARCHAR\s*\(\s*60\s*\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CHECK\s*\(\s*detected_by\s+IN\s*\(\s*'load-permits\.js'\s*,\s*'load-coa\.js'\s*,\s*'classify-lifecycle-phase\.js'\s*\)\s*\)/i);
  });

  it('declares cohort denormalization columns', () => {
    expect(sql).toMatch(/permit_type\s+VARCHAR\s*\(\s*50\s*\)/i);
    expect(sql).toMatch(/project_type\s+VARCHAR\s*\(\s*50\s*\)/i);
    expect(sql).toMatch(/coa_type_class\s+VARCHAR\s*\(\s*30\s*\)/i);
    expect(sql).toMatch(/neighbourhood_id\s+BIGINT/i);
  });

  it('creates idx_lifecycle_status_history_lead on lead_id', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lifecycle_status_history_lead\s+ON\s+lifecycle_status_history\s*\(\s*lead_id\s*\)/i);
  });

  it('creates partial idx_lifecycle_status_history_seq', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lifecycle_status_history_seq\s+ON\s+lifecycle_status_history\s*\(\s*from_seq\s*,\s*to_seq\s*\)\s+WHERE\s+from_seq\s+IS\s+NOT\s+NULL/i);
  });

  it('creates partial idx_lifecycle_status_history_decision WHERE decision IS NOT NULL', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lifecycle_status_history_decision\s+ON\s+lifecycle_status_history\s*\(\s*decision\s*\)\s+WHERE\s+decision\s+IS\s+NOT\s+NULL/i);
  });

  it('creates idx_lifecycle_status_history_transitioned on transitioned_at', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lifecycle_status_history_transitioned\s+ON\s+lifecycle_status_history\s*\(\s*transitioned_at\s*\)/i);
  });

  it('creates the idempotency UNIQUE INDEX uniq_lifecycle_status_history_natural_key (R8 Gemini fix)', () => {
    // R8 Gemini #11 — two writers (load-permits.js + load-coa.js) ingest at CKAN
    // load time. Without this UNIQUE INDEX, re-running over the same time window
    // would INSERT duplicate rows. Truncate to second so true-distinct events
    // at the same second are not deduplicated.
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uniq_lifecycle_status_history_natural_key\s+ON\s+lifecycle_status_history\s*\(\s*lead_id\s*,\s*to_status\s*,\s*date_trunc\s*\(\s*'second'\s*,\s*transitioned_at\s*\)\s*\)/i);
  });

  it('uses bare CREATE INDEX (not CONCURRENTLY) — empty table at creation', () => {
    expect(sql).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
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
