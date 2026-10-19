// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EA (value-conditional clear; runner-lane
//            draft R-DX, operator y 2026-10-18 ruling 6; amends R-BL (ii) and R-DO (i)); Spec 122 §8 RE-FREEZE #37
//
// R-EA — `outputs.invalidates[].by` gains "set_null_unless" with `set_null_unless: {column, equals}`:
// `column` is a written:"step" column of the same target, `equals` a scalar vocabulary constant rendered
// as an escaped SQL literal. The codegen adds the conflict arm
//   <col> = CASE WHEN EXCLUDED.<column> IS DISTINCT FROM <equals> THEN NULL ELSE <t>.<col> END
// and NO guard term (the clear fires only on rows the guard updates — legacy load-permits.js:363 parity).
// deriveMeta and #44 G13 count the cleared column as this step's write; #44 (i) treats it as self-resolved.
// Red-first: RED on the pre-#37 runner ("set_null_unless" is not a `by` value; sqlLiteral refuses strings)
// and flips at RE-FREEZE #37. Gate K evidence: docs/reports/red-evidence/runner-lane/r-ea-set-null-unless.json.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { join } from 'node:path';
import { declaredWrites } from '../../scripts/analysis/gates/witness.mjs';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const validateLib = require(join(process.cwd(), 'scripts/lib/step/validate.js'));
const LOAD_WSIB = require(join(process.cwd(), 'scripts/load-wsib.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

const permitsSpec = () => ({
  table: 'permits',
  key: ['permit_num', 'revision_num'],
  key_sql_type: 'TEXT',
  columns: [
    { name: 'permit_num', written: 'step' },
    { name: 'revision_num', written: 'step' },
    { name: 'status', written: 'step' },
    { name: 'enriched_status', written: 'db_default' },
  ],
  write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: ['status'], scope: 'none' },
  retract: 'none',
});
const clear = { table: 'permits', column: 'enriched_status', when: 'status leaves Inspection', by: 'set_null_unless', set_null_unless: { column: 'status', equals: 'Inspection' } };
const desc = (invalidates: unknown[]) => ({ identity: { name: 'x', archetype: 'INGESTOR' }, outputs: { writes: [permitsSpec()], invalidates }, guards: { srid: 'none' } });

describe('R-EA — invalidates[].by "set_null_unless"', () => {
  it('renders legacy load-permits.js:363 byte-equivalent and adds no guard term (flips at RE-FREEZE #37)', () => {
    const legacy = fs.readFileSync(join(process.cwd(), 'scripts/load-permits.js'), 'utf8').split('\n')[362]!.trim().replace(/,$/, '');
    const plan = writeLib.buildWritePlan(permitsSpec(), desc([clear]));
    expect(plan.upsert_sql).toContain(legacy);
    const bare = writeLib.buildWritePlan(permitsSpec(), desc([]));
    const whereOf = (sql: string) => sql.slice(sql.indexOf('\n  WHERE '), sql.indexOf('RETURNING'));
    expect(whereOf(plan.upsert_sql)).toBe(whereOf(bare.upsert_sql));
    expect(plan.invalidated_unless).toEqual([{ column: 'enriched_status', unless: { column: 'status', equals: 'Inspection' } }]);
  });

  it('the comparison is null-safe (a NULL incoming status clears, staying "Inspection" preserves) and the constant is escaped (flips at RE-FREEZE #37)', () => {
    const plan = writeLib.buildWritePlan(permitsSpec(), desc([{ ...clear, set_null_unless: { column: 'status', equals: "O'Brien" } }]));
    expect(plan.upsert_sql).toContain("enriched_status = CASE WHEN EXCLUDED.status IS DISTINCT FROM 'O''Brien' THEN NULL ELSE permits.enriched_status END");
    expect(writeLib.sqlLiteral('Inspection', { allowString: true })).toBe("'Inspection'");
    expect(() => writeLib.sqlLiteral('Inspection')).toThrow(/set_value/);
  });

  it('deriveMeta and #44 G13 count the cleared column as this step\'s write of the target (flips at RE-FREEZE #37)', () => {
    const d = desc([{ table: 'permits', column: 'cleared_col', when: 'w', by: 'set_null_unless', set_null_unless: { column: 'status', equals: 'Inspection' } }]);
    expect(stepLib.deriveMeta(d).writes.permits).toContain('cleared_col');
    const permits = declaredWrites(d).find((e: { table: string }) => e.table === 'permits') as { cols: string[] };
    expect(permits.cols).toContain('cleared_col');
  });

  it('validate: the schema admits by "set_null_unless" with its object; a watched column that is not written "step" on the target is refused (flips at RE-FREEZE #37)', () => {
    const d = clone(LOAD_WSIB) as Record<string, any>;
    d.outputs.invalidates = [{ table: 'wsib_registry', column: 'website', when: 'class leaves G', by: 'set_null_unless', set_null_unless: { column: 'predominant_class', equals: 'G' } }];
    expect(() => validateLib.validateDescriptor(d)).not.toThrow();
    const missing = clone(d);
    delete missing.outputs.invalidates[0].set_null_unless;
    expect(() => validateLib.validateDescriptor(missing)).toThrow();
    const notStep = clone(d);
    notStep.outputs.invalidates[0].set_null_unless.column = 'legal_name';
    expect(() => validateLib.validateDescriptor(notStep)).toThrow(/set_null_unless/);
  });
});
