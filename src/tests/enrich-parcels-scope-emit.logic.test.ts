// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-CY, R-BA gate G(1)
//
// Operator y 2026-10-17: enrich_parcels' scope hand-off INSERT (runner-owned, scripts/lib/step/
// index.js) gets a declared int emit, `pass3_scope_rows_spooled`, so gate G #38 can prove the
// enrich_parcels_pass3_scope write through cohort.json count_path. The runner measures the rows
// and hands them to the post-phase hook (R-CY form); compute only carries the number.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS modules */
const ep = require(path.join(process.cwd(), 'scripts/lib/compute/enrich-parcels.js')) as {
  computePostPhase: (pool: unknown, args: Record<string, unknown>) => Promise<{ matched: Record<string, unknown> }>;
};

const fakePool = { query: async () => ({ rows: [{ n: 0, stamp_null: 0 }] }) };

describe('enrich_parcels pass3_scope_rows_spooled — runner-measured, declared emit', () => {
  it('carries the runner-handed scope insert count into matched', async () => {
    const r = await ep.computePostPhase(fakePool, { passRaw: {}, scopeHandoff: { inserted: 201 } });
    expect(r.matched.pass3_scope_rows_spooled).toBe(201);
  });

  it('reads 0 when the runner wrote no scope rows', async () => {
    const r = await ep.computePostPhase(fakePool, { passRaw: {}, scopeHandoff: { inserted: 0 } });
    expect(r.matched.pass3_scope_rows_spooled).toBe(0);
  });

  it('is a declared int emit, and the runner hands scopeHandoff to the post-phase hook', () => {
    const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/enrich-parcels.descriptor.json'), 'utf8')) as { emits: Array<{ key: string; type: string }> };
    expect(d.emits.find((e) => e.key === 'pass3_scope_rows_spooled')?.type).toBe('int');
    const runner = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    expect(runner).toContain('scopeHandoff: { inserted: scopeInsertCount }');
  });
});
