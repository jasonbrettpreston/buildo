// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DU (amends R-DJ)
//
// Spec 124 R-DU (McDonald's Airtight V3, operator y 2026-10-18): R-DJ's whole-registry
// --staged selection (a staged registry input such as scripts/steps/_schema/converted.json
// selects every row) marked EVERY row blocking — including a PENDING row with no descriptor
// yet. A commit ① must stage converted.json, so its own red_suite row (no descriptor until ②)
// hard-stopped its own commit: measured 2026-10-18 on 69c1a1ef, permits ① blocked at
// `permits (pending) — 7/17, hard-stop=true`, every other row hard-stop=false.
// R-DU: in that branch a pending row whose descriptor FILE is absent does not block (keyed on
// the file, never the stage label — step-validate.mjs's overlayRows comment: "a pending step
// with no descriptor yet (early ①) has nothing a registry gate reads"). A pending row WITH a
// descriptor and every converted row still block.
//
// Red-first: against 69c1a1ef's selection (stagedRowsFor with R-DJ's `blocking: true` for every
// row) the first test fails (blocking true); the other three pass on both sides.
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');
const STEP_VALIDATE = path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs');

type Row = { slug: string; relFile: string; stage: 'converted' | 'pending'; report: string | null };
type Selected = Row & { blocking: boolean; ownCodeStaged: boolean };
type StagedRowsForFn = (registry: Row[], stagedPaths: string[], io: { exists: (rel: string) => boolean }) => Selected[];

let stagedRowsFor: StagedRowsForFn;

beforeAll(async () => {
  const mod = (await import(pathToFileURL(STEP_VALIDATE).href)) as { stagedRowsFor: StagedRowsForFn };
  stagedRowsFor = mod.stagedRowsFor;
});

const PENDING_NO_DESC: Row = { slug: 'permits', relFile: 'scripts/load-permits.js', stage: 'pending', report: null };
const PENDING_WITH_DESC: Row = { slug: 'load_coa_notices', relFile: 'scripts/load-coa-notices.js', stage: 'pending', report: null };
const CONVERTED: Row = { slug: 'load_ravines', relFile: 'scripts/load-ravines.js', stage: 'converted', report: null };
const REGISTRY = [PENDING_NO_DESC, PENDING_WITH_DESC, CONVERTED];
// A commit ①'s registry input: selects the whole registry (R-DJ).
const STAGED_REGISTRY_INPUT = ['scripts/steps/_schema/converted.json', 'src/tests/steps/permits/violations.test.ts'];
// Descriptor presence is injected: only the no-descriptor pending row lacks its file.
const exists = (rel: string) => rel !== 'scripts/load-permits.descriptor.json';

const pick = (rows: Selected[], slug: string) => {
  const r = rows.find((x) => x.slug === slug);
  if (!r) throw new Error(`row ${slug} not selected`);
  return r;
};

describe('Spec 124 R-DU — whole-registry --staged selection: a pending row with no descriptor does not block', () => {
  it('a PENDING row whose descriptor file is ABSENT is selected but NOT blocking (red at 69c1a1ef: blocking true)', () => {
    const rows = stagedRowsFor(REGISTRY, STAGED_REGISTRY_INPUT, { exists });
    expect(rows).toHaveLength(3);
    expect(pick(rows, 'permits').blocking).toBe(false);
  });

  it('a PENDING row WITH a descriptor still blocks (② onward every gate is hard)', () => {
    const rows = stagedRowsFor(REGISTRY, STAGED_REGISTRY_INPUT, { exists });
    expect(pick(rows, 'load_coa_notices').blocking).toBe(true);
    // The same permits row the moment its descriptor exists: blocking again.
    const atTwo = stagedRowsFor(REGISTRY, STAGED_REGISTRY_INPUT, { exists: () => true });
    expect(pick(atTwo, 'permits').blocking).toBe(true);
  });

  it('a CONVERTED row still blocks — even with its descriptor reported absent (the rule is pending AND absent)', () => {
    const rows = stagedRowsFor(REGISTRY, STAGED_REGISTRY_INPUT, { exists: () => false });
    expect(pick(rows, 'load_ravines').blocking).toBe(true);
    expect(pick(rows, 'load_coa_notices').blocking).toBe(false);
  });

  it('keyed on the descriptor FILE, not the stage label; the per-step (non-registry) branch is unchanged', () => {
    const labelled = REGISTRY.map((r) => ({ ...r, pendingStage: 'descriptor_only' }));
    const rows = stagedRowsFor(labelled, STAGED_REGISTRY_INPUT, { exists });
    expect(pick(rows, 'permits').blocking).toBe(false);
    // No registry input staged: the doc-only rule (R-K) selects permits non-blocking, others not at all.
    const docOnly = stagedRowsFor(REGISTRY, ['src/tests/steps/permits/violations.test.ts'], { exists });
    expect(docOnly.map((r) => [r.slug, r.blocking])).toEqual([['permits', false]]);
    expect(stagedRowsFor(REGISTRY, [], { exists })).toEqual([]);
  });
});

// R-DU amended 2026-10-18 (operator y, "extend R-DU to --all"): --all / --step (pre-push, fleet
// runs) set no row.blocking, so rowBlocks applies the same rule. Red-first: before the amendment
// every --all row blocked (`row.blocking === undefined ? true`), so the first case was false → true.
describe('Spec 124 R-DU (amended) — --all / --step: a pending row with no descriptor does not gate', () => {
  type RowBlocksFn = (row: Row & { blocking?: boolean }, io: { exists: (rel: string) => boolean }) => boolean;
  let rowBlocks: RowBlocksFn;
  beforeAll(async () => {
    rowBlocks = ((await import(pathToFileURL(STEP_VALIDATE).href)) as { rowBlocks: RowBlocksFn }).rowBlocks;
  });

  it('pending + no descriptor file → not gating; pending with a descriptor and converted → gating', () => {
    expect(rowBlocks(PENDING_NO_DESC, { exists })).toBe(false);
    expect(rowBlocks(PENDING_WITH_DESC, { exists })).toBe(true);
    expect(rowBlocks(CONVERTED, { exists: () => false })).toBe(true);
  });

  it('an explicit --staged blocking flag always wins', () => {
    expect(rowBlocks({ ...PENDING_NO_DESC, blocking: true }, { exists })).toBe(true);
    expect(rowBlocks({ ...CONVERTED, blocking: false }, { exists })).toBe(false);
  });
});
