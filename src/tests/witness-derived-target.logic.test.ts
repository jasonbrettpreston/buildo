// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-HA (provisional id), R-DY, R-ET
//
// R-HA (operator y 2026-10-20): #44 (b)/(c) for an R-DY DERIVED target. A derived target
// (`outputs.writes[i].derive`, i >= 1) is written only when its prior-state read differs — coa's
// lifecycle_status_history gets a row only when an application's status changes — so a POST trace of a
// run with no status change writes the primary alone. Before R-HA, check (b) required EVERY trace to write
// EVERY declared table and check (c) one exact statement count, so the four coa traces of Night P4
// (2026-10-20, lane night-p4-c; fixtures below, captured verbatim) failed
// `b:lifecycle_status_history` and `c:statements`. Under R-HA, per trace: traced write tables ⊆ declared,
// every NON-derived target written, and the distinct write statements within
// [write_inventory.statements, statements + derived_statements]; per slug: each derived target written by
// at least one fresh POST trace (here the R-ET bracket capture).

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { evaluateWitness } from '../../scripts/analysis/gates/witness.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
const FIXTURES = path.join(REPO_ROOT, 'src/tests/fixtures/witness-derived-coa');
const INVOCATIONS = ['coa', 'standalone', 'coa-forced-data-hash', 'coa-forced-status'] as const;

/* eslint-disable @typescript-eslint/no-explicit-any -- descriptor and trace JSON */
function descriptor(inventory: Record<string, unknown> = { statements: 2, derived_statements: 1 }): any {
  const d = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/load-coa.descriptor.json'), 'utf8'));
  d.outputs.write_inventory = { ...inventory, why: { text: 'fixture', liveness: { kind: 'file', ref: 'scripts/lib/compute/load-coa.js' } } };
  return d;
}

function traces(names: readonly string[] = INVOCATIONS): Record<string, any> {
  const out: Record<string, any> = {};
  for (const n of names) out[n] = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${n}.trace.json`), 'utf8'));
  return out;
}

/** The (b)/(c) rows only: (a)'s runner-maintenance reads need runnerFingerprints, which step-validate passes. */
function bc(d: any, posts: Record<string, any>): string[] {
  const first = Object.values(posts)[0];
  const r = evaluateWitness({ slug: 'coa', descriptor: d, status: 'pending', currentFingerprint: first.source_fingerprint, postTraces: posts, preTraces: {}, explainedDiffs: [] } as any);
  return (r.rows as string[]).filter((x) => /^FAIL:WITNESS:coa:[bc]:/.test(x));
}

describe('R-HA — #44 (b)/(c) for an R-DY derived target (coa, Night P4 traces)', () => {
  it('RED case: the four coa POST traces pass (b) and (c) with statements 2 + derived_statements 1', () => {
    expect(bc(descriptor(), traces())).toEqual([]);
  });

  it('the derived target must be written by at least one fresh POST trace of the slug', () => {
    expect(bc(descriptor(), traces(['coa', 'standalone', 'coa-forced-data-hash']))).toEqual([
      'FAIL:WITNESS:coa:b:derived-unwitnessed:lifecycle_status_history',
    ]);
  });

  it('a NON-derived target still has to be written by every trace that writes', () => {
    const posts = traces(['coa', 'coa-forced-status']);
    const t = JSON.parse(JSON.stringify(posts['coa-forced-status']));
    delete t.touched.writes.coa_applications;
    for (const s of t.statements) if (s.writes) delete s.writes.coa_applications;
    t.statements = t.statements.filter((s: any) => s.kind !== 'write' || Object.keys(s.writes || {}).length > 0);
    expect(bc(descriptor(), { coa: posts.coa, 'coa-forced-status': t })).toContain('FAIL:WITNESS:coa:b:coa_applications');
  });

  it('an undeclared written table still fails (b)', () => {
    const posts = traces(['coa-forced-status']);
    posts['coa-forced-status'].touched.writes.permits = ['status'];
    expect(bc(descriptor(), posts)).toContain('FAIL:WITNESS:coa:b:permits');
  });

  it('(c) is a range: a count outside [statements, statements + derived_statements] fails with both bounds', () => {
    expect(bc(descriptor({ statements: 3, derived_statements: 1 }), traces())).toContain('FAIL:WITNESS:coa:c:statements:3..4!=2');
    expect(bc(descriptor({ statements: 1, derived_statements: 1 }), traces())).toContain('FAIL:WITNESS:coa:c:statements:1..2!=3');
  });

  it('without derived_statements the exact count is unchanged (every other step)', () => {
    expect(bc(descriptor({ statements: 3 }), traces(['coa-forced-status']))).toEqual([]);
    expect(bc(descriptor({ statements: 4 }), traces(['coa-forced-status']))).toEqual(['FAIL:WITNESS:coa:c:statements:4!=3']);
  });
});

describe('COA-D16 — the committed coa write_inventory counts write statements only', () => {
  it('the real scripts/load-coa.descriptor.json passes (b)/(c) over the four Night P4 POST traces', () => {
    const d = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/load-coa.descriptor.json'), 'utf8'));
    expect(bc(d, traces())).toEqual([]);
    expect(d.outputs.write_inventory.statements).toBe(2);
    expect(d.outputs.write_inventory.derived_statements).toBe(1);
  });
});
