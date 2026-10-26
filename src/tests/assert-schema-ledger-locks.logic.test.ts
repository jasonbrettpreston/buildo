// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JD (a green ② lock closes a defect-ledger row; dated note CHAT-191)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-GR (a mirror repeats the status, #36)
//
// Ledger locks for assert_schema AS-D3 and AS-D9 (L-COA-LEDGER). Runner-level, so it lives OUTSIDE
// src/tests/steps/assert_schema/ (#167 bans runner tokens there; plan v4 FV-1). No DB.
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { runnerVariableRows } from './helpers/runner-variables';
/* eslint-disable @typescript-eslint/no-require-imports */
const ledgerLib = require(join(process.cwd(), 'scripts/lib/step/ledger.js'));
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const verdictLib = require(join(process.cwd(), 'scripts/lib/step/verdict.js'));
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
const SEEDS = require(join(process.cwd(), 'scripts/seeds/logic_variables.json'));
const AS = require(join(process.cwd(), 'scripts/quality/assert-schema.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

function assertContention(d: any) {
  const t = (d.terminals || []).find((x: any) => x.id === 'lock_held_elsewhere');
  if (!t || t.kind !== 'skip_lock_contention' || t.status !== 'self_skipped') throw new Error('no declared self_skipped contention terminal');
  const meta = stepLib.skipRecordsMeta(d, 'advisory_lock_held_elsewhere');
  if (meta.audit_table.verdict !== verdictLib.deriveVerdict(meta.audit_table.rows) || meta.audit_table.rows.length === 0) throw new Error('verdict not row-derived');
}

describe('assert_schema ledger locks', () => {
  it('AS-D3 — openLedgerRow logs the failed INSERT and returns null', async () => {
    const warn = vi.spyOn(pipeline.log, 'warn').mockImplementation(() => {});
    try {
      const pool = { query: vi.fn(async () => { throw new Error('boom'); }) };
      const id = await ledgerLib.openLedgerRow(pool, 'assert_schema');
      expect(id).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[1])).toMatch(/Could not insert pipeline_runs row: boom/);
    } finally { warn.mockRestore(); }
  });

  it('AS-D9 (declaration) — contention is a declared self_skipped terminal with a row-derived audit table', () => {
    expect(() => assertContention(AS)).not.toThrow();
    const m = clone(AS); m.terminals = m.terminals.filter((t: any) => t.id !== 'lock_held_elsewhere');
    expect(() => assertContention(m)).toThrow();
  });

  it('AS-D9 (behaviour, the closing lock) — the REAL assert_schema descriptor, lock not acquired: the runner emits a SKIP summary', async () => {
    const sql: Array<{ text: string; params: unknown[] }> = [];
    const answer = (text: string) => {
      if (text.includes('current_database()')) return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
      if (text.includes('FROM logic_variables')) return { rows: [...runnerVariableRows(), ...Object.entries(SEEDS).map(([variable_key, v]: [string, any]) => ({ variable_key, variable_value: v.default, variable_value_json: typeof v.default === 'object' ? v.default : null }))] };
      if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
      if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: false }] };
      if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
      return { rows: [] };
    };
    const rec = async (t: string, params: unknown[] = []) => { sql.push({ text: t, params }); return answer(t); };
    const pool = { query: rec, connect: async () => ({ query: rec, release: () => {} }) };
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); });
    let err: unknown = null;
    try { await pipeline.step(AS, async () => { throw new Error('compute must not run under contention'); }).run({ pool, chainId: null }); }
    catch (e) { err = e; } finally { spy.mockRestore(); }
    const s = lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
    expect(err, String(err)).toBeNull();
    expect(s, 'a PIPELINE_SUMMARY is emitted on contention').toBeTruthy();
    const summary = JSON.parse(s!.slice('PIPELINE_SUMMARY:'.length));
    expect(summary.records_meta.skipped).toBe(true);
    expect(summary.records_meta.reason).toBe('advisory_lock_held_elsewhere');
    // The run's own pipeline_runs row is closed self_skipped (the ledger cell's "SKIP emit + self_skipped").
    const closes = sql.filter((q) => /^\s*UPDATE pipeline_runs\b/.test(q.text));
    expect(closes).toHaveLength(1);
    expect(closes[0]?.params[0]).toBe('self_skipped');
    expect(closes[0]?.params[3]).toBe(4242);
  });
});
