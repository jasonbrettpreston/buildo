// R-JF (register row, rulings-rec 9307de40) names this file as its lock: the exemption is scoped to set_based_scoped + rows "compute" only.
// SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md §core.12 (write discipline per target), §core.14 (declared equals witnessed)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-EH (the ROWS-arm G keyed UPDATE), R-BJ; operator CHAT-73.swap4 (Night A-swap, 2026-10-22)
//
// #44 (b) for a set_based_scoped rows-compute (G keyed UPDATE) target. scripts/lib/step/write.js buildKeyedUpdateFromRowsSql
// types only the declared step columns and renders `UPDATE t SET <non-key cols> FROM UNNEST(...) WHERE t.<key> = v.<key>`,
// so the key column MUST be declared as a step column yet is never in the traced SET list. Before CHAT-73.swap4 (b) demanded
// every declared column in the traced write and failed `b:coa_applications.id` for classify_coa_trades and
// compute_coa_cost_estimates (Night A-swap hook log). The key column is now exempt for that class only.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { evaluateWitness } from '../../scripts/analysis/gates/witness.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
/* eslint-disable @typescript-eslint/no-explicit-any -- descriptor and trace JSON */
const load = (rel: string): any => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
const CASES = [
  { slug: 'classify_coa_trades', desc: 'scripts/classify-coa-trades.descriptor.json' },
  { slug: 'compute_coa_cost_estimates', desc: 'scripts/compute-coa-cost-estimates.descriptor.json' },
] as const;

function bRows(slug: string, d: any, trace: any): string[] {
  const r = evaluateWitness({ slug, descriptor: d, status: 'pending', currentFingerprint: trace.source_fingerprint, postTraces: { 'coa-forced': trace }, preTraces: {}, explainedDiffs: [] } as any);
  return (r.rows as string[]).filter((x) => x.startsWith(`FAIL:WITNESS:${slug}:b:`));
}

describe('#44 (b): the key column of a G keyed-update target is exempt (CHAT-73.swap4)', () => {
  for (const c of CASES) {
    const trace = load(`docs/reports/witness/${c.slug}/post/coa-forced.trace.json`);
    it(`${c.slug}: the committed forced trace raises no (b) row for the declared key column id`, () => {
      expect(bRows(c.slug, load(c.desc), trace)).toEqual([]);
    });
    it(`${c.slug}: a declared non-key step column the trace never writes is still a (b) row (negative control)`, () => {
      const d = load(c.desc);
      d.outputs.writes.find((w: any) => w.table === 'coa_applications').columns.push({ name: 'zzz_never_written', vocabulary: 'none', written: 'step', bind: 'value', source: 'compute' });
      expect(bRows(c.slug, d, trace)).toEqual([`FAIL:WITNESS:${c.slug}:b:coa_applications.zzz_never_written`]);
    });
  }

// Scope guard (R-JF): the same key column on a NON-matching target still raises its (b) row. Replacing the exemption
  // condition with `true` (every class, every rows mode) must fail these.
  for (const c of CASES) {
    const trace = load(`docs/reports/witness/${c.slug}/post/coa-forced.trace.json`);
    it(`${c.slug}: the key column stays a (b) row when the target is another write class (not set_based_scoped)`, () => {
      const d = load(c.desc);
      d.outputs.writes.find((w: any) => w.table === 'coa_applications').write_discipline.class = 'guarded_upsert';
      expect(bRows(c.slug, d, trace)).toContain(`FAIL:WITNESS:${c.slug}:b:coa_applications.id`);
    });
    it(`${c.slug}: the key column stays a (b) row when set_based_scoped has rows other than "compute"`, () => {
      const d = load(c.desc);
      d.outputs.writes.find((w: any) => w.table === 'coa_applications').write_discipline.rows = 'sql';
      expect(bRows(c.slug, d, trace)).toContain(`FAIL:WITNESS:${c.slug}:b:coa_applications.id`);
    });
  }
});
