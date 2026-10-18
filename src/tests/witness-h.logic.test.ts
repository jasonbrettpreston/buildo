// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BL (v), R-DI (LDG-10)
//
// #44 check (h), armed after P1-C9 by LDG-10 (McDonald's Airtight V3, 2026-10-17): a version pin is witnessed
// and verified. Evaluated pins only (op / equals / bound — the pins the runner reads, producer.js evaluatePins);
// a bare watermark pin is a producer-edge declaration (R-BL (i)) and is not read, so it is never "unwitnessed".
//   h:unwitnessed  — no fresh trace statement touches pipeline_runs (the runner's pin read);
//   h:mismatch     — `equals` differs from what the producer's POST golden stamped;
//   h:unverifiable — `equals` with no producer POST golden carrying the path (no vacuous pass).
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

type W = {
  pinItems: (d: unknown, runsTouched: boolean, producerSummaries?: Record<string, unknown[]>) => string[];
  tracesTouchRuns: (traces: unknown[]) => boolean;
};
const pins = (list: unknown[]) => ({ staleness: { pins: list } });
const SPEC = { step: 'load_x', stamp: 'records_meta.x_load.spec_version', equals: '1.2' };

describe('#44 (h) — version pins witnessed and verified (R-BL (v))', () => {
  let M: W;
  beforeAll(async () => {
    M = (await import(pathToFileURL(path.join(process.cwd(), 'scripts/analysis/gates/witness.mjs')).href)) as W;
  });

  it('GREEN: an equals pin read through pipeline_runs and matching the producer golden yields nothing', () => {
    expect(M.pinItems(pins([SPEC]), true, { load_x: [{ records_meta: { x_load: { spec_version: '1.2' } } }] })).toEqual([]);
  });

  it('RED h:mismatch: the pin says 1.2, the producer stamped 1.3', () => {
    expect(M.pinItems(pins([SPEC]), true, { load_x: [{ records_meta: { x_load: { spec_version: '1.3' } } }] }))
      .toEqual(['h:mismatch:load_x.records_meta.x_load.spec_version:1.2!=1.3']);
  });

  it('RED h:unverifiable: no producer golden carries the path', () => {
    expect(M.pinItems(pins([SPEC]), true, { load_x: [{ records_meta: {} }] })).toEqual(['h:unverifiable:load_x.records_meta.x_load.spec_version']);
  });

  it('RED h:unwitnessed: an evaluated pin with no pipeline_runs read in any fresh trace', () => {
    expect(M.pinItems(pins([{ step: 'load_x', stamp: 'records_meta.x_load.rows', op: 'nonzero' }]), false)).toEqual(['h:unwitnessed:load_x.records_meta.x_load.rows']);
  });

  it('a bare watermark pin (no op/equals/bound) is a producer edge, never checked', () => {
    expect(M.pinItems(pins([{ step: 'link_y', stamp: 'parcel_buildings.linked_at' }]), false)).toEqual([]);
  });

  it('tracesTouchRuns: pipeline_runs counts as read OR as a runner-owned exclusion', () => {
    expect(M.tracesTouchRuns([{ statements: [{ excluded: ['pipeline_runs'] }] }])).toBe(true);
    expect(M.tracesTouchRuns([{ statements: [{ reads: { pipeline_runs: ['records_meta'] } }] }])).toBe(true);
    expect(M.tracesTouchRuns([{ statements: [{ reads: { parcels: ['id'] }, excluded: [] }] }])).toBe(false);
  });
});
