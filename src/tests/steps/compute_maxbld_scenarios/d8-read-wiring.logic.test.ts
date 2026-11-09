// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-386 (flags propagate), R3-02 dated note 2026-11-06 (D-8: the carriage
//            computes only "when the stored stamp is this tree's Layer 1 input"); docs/specs/01-pipeline/78_optimal_lot_configuration.md
//
// MB-27 increment 3 · DL-21 a, the D-8 production read wiring (the part with a home in the domain module) · RED FIRST. The lots read
// carries evaluator_version (disclosureWords compares both stamps, compute-maxbld-scenarios.js:235-237), and a parcels read gives
// buildLotVector the columns resolve_bylaws reads. The lookups / source assembly (layer1Env, source.parcel, permitted_by_class) is NOT
// here: it waits the step's runtime seed loader (descriptor limitation MB-31; card D8-SHELL).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js'));
const D: Json = req(path.join(ROOT, 'scripts/compute-maxbld-scenarios.descriptor.json'));
const RES = req(path.join(ROOT, 'scripts/lib/compute/resolve-bylaws.js'));
// the select list ends at the line-start FROM (the run_day expression holds its own FROM inside EXTRACT)
const cols = (sql: string): string[] => String((/SELECT ([\s\S]*?)\n\s*FROM /.exec(sql) as RegExpExecArray)[1]).split(',').map((c) => c.trim().replace(/^\w+\./, '').split(/\s+AS\s+/i).pop() as string);
const RES_COLS = cols(RES.buildSourceSql(req(path.join(ROOT, "scripts/resolve-bylaws.descriptor.json")), {}, { mode: "full" }).batch_sql).filter((c) => c !== 'run_day') /* the run_at day seeds resolve_bylaws' audit offset; Layer 3 reads no clock */;

describe('D-8 read wiring in READ_SQL and the descriptor', () => {
  it('READ_SQL.lots selects evaluator_version, and the descriptor declares it', () => {
    expect(cols(S.READ_SQL.lots)).toContain('evaluator_version');
    const t = (D.inputs.reads.tables as Json[]).find((x) => x.table === 'bylaw_resolution_lot_stamps') as Json;
    expect(t.columns).toContain('evaluator_version');
  });
  it('a parcels read gives buildLotVector every column resolve_bylaws reads', () => {
    expect(S.READ_SQL.parcel).toBeDefined();
    expect(cols(S.READ_SQL.parcel).filter((c) => RES_COLS.includes(c)).sort()).toEqual([...RES_COLS].sort());
  });
});
