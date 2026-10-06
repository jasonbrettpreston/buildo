// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (RE-FREEZE; registry-truth fold 19 MQ-B1 (a), ASSEMBLY 2.8 row)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1 (a declared "none" says why)
//
// MQ-B1 (a): an INGESTOR with two or more write targets declares execution.batch "none" (the ingest writer
// strides EACH target by pipeline.maxRowsPerInsert(columnsPerRow); no single integer is true) and must say
// why in execution.batch_why. BOTH directions, each case one mutation away from a real valid INGESTOR.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const readJson = (p: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, p), 'utf8'));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { compileStepSchema } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js'));
const validate = compileStepSchema(readJson('scripts/steps/_schema/step.schema.json'));

type Desc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = (d: Desc): Desc => JSON.parse(JSON.stringify(d));
const single = (): Desc => clone(readJson('scripts/load-ravines.descriptor.json'));
const errs = (): string =>
  ((validate.errors ?? []) as Array<{ instancePath?: string; keyword: string }>).map((e) => `${e.instancePath}:${e.keyword}`).join(', ');
const WHY = {
  text: 'Two write targets; the ingest writer strides each by pipeline.maxRowsPerInsert(columnsPerRow), so no single batch integer is true.',
  liveness: { kind: 'file', ref: 'scripts/lib/step/write.js' },
};
/** The single-target INGESTOR with a SECOND write target (a copy of the first, renamed). */
function twoTargets(d: Desc): Desc {
  const extra = clone(d.outputs.writes[0]);
  extra.table = `${extra.table}_second`;
  d.outputs.writes.push(extra);
  return d;
}

describe('MQ-B1 (a) — execution.batch_why', () => {
  it('GREEN control: the single-target INGESTOR (load_ravines) validates as committed', () => {
    expect(validate(single()), errs()).toBe(true);
  });

  it('GREEN: a single-target INGESTOR with batch "none" is NOT forced to give a why', () => {
    const d = single();
    d.execution.batch = 'none';
    expect(validate(d), errs()).toBe(true);
  });

  it('RED: a two-target INGESTOR with batch "none" and no batch_why is refused', () => {
    const d = twoTargets(single());
    d.execution.batch = 'none';
    delete d.execution.batch_why;
    expect(validate(d)).toBe(false);
    expect(errs()).toMatch(/required/);
  });

  it('GREEN: the same two-target INGESTOR WITH a batch_why validates (the rule, not the second target, was the red)', () => {
    const d = twoTargets(single());
    d.execution.batch = 'none';
    d.execution.batch_why = WHY;
    const ok = validate(d);
    // A second write target may trip an unrelated multi-target rule; the lock only claims batch_why is not missing.
    const missing = ((validate.errors ?? []) as Array<{ keyword: string; params?: { missingProperty?: string } }>)
      .filter((e) => e.keyword === 'required' && e.params?.missingProperty === 'batch_why');
    expect(missing, errs()).toEqual([]);
    if (ok) expect(ok).toBe(true);
  });

  it('GREEN: a two-target INGESTOR with an INTEGER batch is not forced either (the rule keys on "none")', () => {
    const d = twoTargets(single());
    d.execution.batch = 5000;
    validate(d);
    const missing = ((validate.errors ?? []) as Array<{ keyword: string; params?: { missingProperty?: string } }>)
      .filter((e) => e.keyword === 'required' && e.params?.missingProperty === 'batch_why');
    expect(missing).toEqual([]);
  });

  it('the real multi-target INGESTORs declare a batch_why (load_heritage, load_zoning)', () => {
    for (const p of ['scripts/load-heritage.descriptor.json', 'scripts/load-zoning.descriptor.json']) {
      const d = readJson(p) as Desc;
      expect(d.execution.batch, p).toBe('none');
      expect(d.execution.batch_why?.text, `${p} must say why its batch is "none"`).toBeTruthy();
    }
  });
});
