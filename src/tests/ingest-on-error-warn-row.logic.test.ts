// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DM (non-fatal secondary write; operator y
//            2026-10-17, row text approved 2026-10-18 ruling 1); Spec 122 §8 RE-FREEZE #37
//
// R-DM — `outputs.writes[].on_error` is "fail_step" (default; absent = today) or "warn_row". "warn_row" is
// legal only on a DERIVED target (R-DY) written inside the primary transaction, and requires
// `on_error_why` whose liveness cites a declared check {kind:"check", ref} — a WARN-severity check bounded
// at exact zero ("viol == 0") that reads `written.e<i>.errors`. The runner wraps each slice's derived
// statement in a savepoint; on error it rolls back to the savepoint, counts written.e<i>.errors, keeps the
// primary and continues. The WARN row is the declared check's (Rule 10); the runner emits no ad-hoc row. A
// failed ROLLBACK TO SAVEPOINT rethrows (the transaction is already aborted).
// Red-first: RED on the pre-#37 runner (no derived arm, no on_error field) and flips at RE-FREEZE #37.
// Gate K evidence: docs/reports/red-evidence/runner-lane/r-dm-on-error-warn-row.json.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const validateLib = require(join(process.cwd(), 'scripts/lib/step/validate.js'));
const LOAD_WSIB = require(join(process.cwd(), 'scripts/load-wsib.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

const primary = {
  table: 'permits_x', key: ['permit_num'], key_sql_type: 'TEXT',
  columns: [{ name: 'permit_num', written: 'step' }, { name: 'status', written: 'step' }],
  write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: ['status'], scope: 'none' },
  retract: 'none',
};
const ledger = {
  table: 'ledger_x', key: ['lead_id'], key_sql_type: 'TEXT',
  derive: { from: 'permits_x', prior_columns: ['status'], why: { text: 'a status transition is a ledger row', liveness: 'none' } },
  on_error: 'warn_row',
  columns: [{ name: 'lead_id', written: 'insert_only' }, { name: 'to_status', written: 'step' }],
  write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: ['to_status'], scope: 'none' },
  retract: 'none',
};
const descriptor = { identity: { name: 'x', archetype: 'INGESTOR' }, outputs: { writes: [primary, ledger] }, guards: { srid: 'none' } };

function pool(opts: { failDerived?: boolean; failRollback?: boolean }) {
  const calls: string[] = [];
  const query = async (text: string) => {
    calls.push(text);
    if (opts.failDerived && /INSERT INTO ledger_x/.test(text)) throw new Error('ledger insert failed');
    if (opts.failRollback && /ROLLBACK TO SAVEPOINT/.test(text)) throw new Error('rollback to savepoint failed');
    if (/INSERT INTO/.test(text)) return { rows: [{ is_insert: true }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

function run(p: ReturnType<typeof pool>, onError = 'warn_row') {
  return writeLib.executeWrite(p, {
    plan: writeLib.buildWritePlan(primary, descriptor), writeSpec: primary,
    carried: [{ permit_num: 'P1', status: 'Issued' }], columnValues: (r: unknown) => r, shouldSkipDelete: () => false, log: noopLog, tag: '[r-dm]',
    derived: {
      prior: writeLib.buildPriorReadSql({ from: 'permits_x', keys: ['permit_num'], keyTypes: ['text'], priorColumns: ['status'] }),
      keyOf: (r: Record<string, unknown>) => JSON.stringify([String(r.permit_num)]),
      deriveRows: (_t: string, slice: Array<Record<string, unknown>>) => slice.map((r) => ({ lead_id: r.permit_num, to_status: r.status })),
      targets: [{ index: 1, plan: writeLib.buildWritePlan(ledger, descriptor), onError }],
    },
  });
}

/** A valid INGESTOR (load_wsib) grown a derived warn_row target, citing a WARN viol == 0 check. */
function warnRowDescriptor(): Record<string, any> {
  const d = clone(LOAD_WSIB) as Record<string, any>;
  d.inputs.reads.tables = [{ table: 'wsib_registry', columns: ['legal_name_normalized', 'mailing_address', 'trade_name'] }];
  const w = clone(d.outputs.writes[0]);
  w.table = 'wsib_registry_history';
  w.derive = { from: 'wsib_registry', prior_columns: ['trade_name'], why: { text: 'a trade-name change is a history row', liveness: 'none' } };
  w.on_error = 'warn_row';
  w.on_error_why = { text: 'the history row is an audit-tier secondary; the primary must land', liveness: { kind: 'check', ref: 'history_write_errors' } };
  d.outputs.writes.push(w);
  const c = clone(d.checks[0]);
  Object.assign(c, { id: 'history_write_errors', severity: 'WARN', limit: 'viol == 0', warn_limit: undefined, limit_from_config: undefined, warn_limit_from_config: undefined });
  for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
  d.checks.push(c);
  return d;
}

describe('R-DM — on_error "warn_row" on a derived target', () => {
  it('a forced derived failure keeps the primary rows, rolls back to the savepoint and counts 1 (flips at RE-FREEZE #37)', async () => {
    const p = pool({ failDerived: true });
    const out = await run(p);
    expect(out.inserted).toBe(1);
    expect(out.e1).toEqual({ inserted: 0, updated: 0, errors: 1 });
    const tx = p.calls.filter((c) => /^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|ROLLBACK TO)/.test(c));
    expect(tx).toEqual(['BEGIN', 'SAVEPOINT sp_e1', 'ROLLBACK TO SAVEPOINT sp_e1', 'COMMIT']);
  });

  it('a clean derived write releases its savepoint and counts 0 errors (flips at RE-FREEZE #37)', async () => {
    const p = pool({});
    const out = await run(p);
    expect(out.e1).toEqual({ inserted: 1, updated: 0, errors: 0 });
    expect(p.calls.filter((c) => /SAVEPOINT/.test(c))).toEqual(['SAVEPOINT sp_e1', 'RELEASE SAVEPOINT sp_e1']);
  });

  it('a failed ROLLBACK TO SAVEPOINT propagates (the transaction is already aborted) (flips at RE-FREEZE #37)', async () => {
    await expect(run(pool({ failDerived: true, failRollback: true }))).rejects.toThrow(/rollback to savepoint failed/);
  });

  it('the default fail_step keeps today\'s posture: a derived failure fails the write (flips at RE-FREEZE #37)', async () => {
    const p = pool({ failDerived: true });
    await expect(run(p, 'fail_step')).rejects.toThrow(/ledger insert failed/);
    expect(p.calls).toContain('ROLLBACK');
    expect(p.calls.some((c) => /SAVEPOINT/.test(c))).toBe(false);
  });

  it('validate: warn_row with a cited WARN viol == 0 check is accepted; on writes[0], without the check, or citing a FAIL check it is refused (flips at RE-FREEZE #37)', () => {
    expect(() => validateLib.validateDescriptor(warnRowDescriptor())).not.toThrow();
    const onPrimary = warnRowDescriptor();
    onPrimary.outputs.writes[0].on_error = 'warn_row';
    onPrimary.outputs.writes[0].on_error_why = onPrimary.outputs.writes[1].on_error_why;
    expect(() => validateLib.validateDescriptor(onPrimary)).toThrow(/on_error/);
    const noCheck = warnRowDescriptor();
    noCheck.checks = noCheck.checks.filter((c: { id: string }) => c.id !== 'history_write_errors');
    expect(() => validateLib.validateDescriptor(noCheck)).toThrow(/history_write_errors/);
    const failCheck = warnRowDescriptor();
    failCheck.checks.find((c: { id: string }) => c.id === 'history_write_errors').severity = 'FAIL';
    expect(() => validateLib.validateDescriptor(failCheck)).toThrow(/WARN/);
  });
});
