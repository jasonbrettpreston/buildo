// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.5 + §6.6 (c) — Ordering (LDG-10 class 5)
//
// L-A (operator 2026-10-03; plan .cursor/wf2_registry_truth_active_task.md Fold 9 D-B + Fold 14):
// chain order is DERIVED from the effective cross-step ledger and checked against
// manifest.chains, replacing hand-written indexOf assertions in chain.logic.test.ts.
//
// Rule: for every chain, a producer of a column a step reads (column level, chain-scoped —
// stepUpstreams over effectiveLedger()) must sit BEFORE that step. A producer after its
// reader is an `ORDER:<chain>:<producer>><reader>:<cols>` row.
//
// HARD now: sources, wsib (zero rows today). REPORT-ONLY, printed and counted on every run,
// no exception file: permits, coa, entities, deep_scrapes — those rows flip HARD in
// CLOSING_COMMIT (the FLEET-2 landing commit's RE-FREEZE). LDG-10 stays NOT_STARTED while any
// ORDER: row is report-only. The rule "a step reading a column it also writes is not an edge"
// is NOT applied here: it needs a Spec 124 §5 register row + Operator-Ruling (FLEET-2 work) and
// may only cover a same-statement write guard witnessed by #44 — until then those edges stay
// visible as report-only ORDER: rows.

import manifest from '../../scripts/manifest.json';
import { describe, it, expect } from 'vitest';

type Inchain = Record<string, { chains?: string[]; reads?: Record<string, string[]>; writes?: Record<string, string[]> }>;
type Result = { rows: string[]; blind: string[]; unledgered: string[] };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ledger = require('../../scripts/lib/ledger.js') as {
  effectiveLedger: () => { inchain: Inchain };
  chainOrderViolations: (chains: Record<string, string[]>, ledger: { inchain: Inchain }) => Result;
};

const CLOSING_COMMIT = 'FLEET-2 landing commit (RE-FREEZE) — .cursor/wf2_registry_truth_active_task.md Fold 14';
const HARD_CHAINS = ['sources', 'wsib'];
const REPORT_ONLY_CHAINS = ['permits', 'coa', 'entities', 'deep_scrapes'];
const ROW_RE = /^ORDER(-UNPLACED)?:[a-z_]+:[a-z0-9_]+>[a-z0-9_]+:[a-z0-9_.,:-]+$/;
const chains = (manifest as { chains: Record<string, string[]> }).chains;

const FIXTURE: { inchain: Inchain } = {
  inchain: {
    a: { chains: ['k'], reads: {}, writes: { t: ['x'] } },
    b: { chains: ['k'], reads: { t: ['x'] }, writes: { t: ['y'] } },
    c: { chains: ['k'], reads: { t: ['y', 'z'] }, writes: {} },
    ghost: { chains: ['k'], reads: {}, writes: { t: ['z'] } },
    d: { chains: ['k'], reads: { u: [] }, writes: {} },
  },
};
const ABC: { inchain: Inchain } = {
  inchain: { a: FIXTURE.inchain.a!, b: FIXTURE.inchain.b!, c: FIXTURE.inchain.c! },
};

describe('chainOrderViolations — fixture (proven both directions)', () => {
  it('GREEN control: producers before readers yield no ORDER row', () => {
    expect(ledger.chainOrderViolations({ k: ['a', 'b', 'c'] }, ABC).rows).toEqual([]);
  });

  it('RED: a producer moved after its reader is an ORDER row naming the columns', () => {
    expect(ledger.chainOrderViolations({ k: ['b', 'a', 'c'] }, ABC).rows).toEqual(['ORDER:k:a>b:t.x']);
  });

  it('RED: an in-chain ledger producer absent from the manifest chain is an ORDER-UNPLACED row (never silently dropped)', () => {
    expect(ledger.chainOrderViolations({ k: ['a', 'b', 'c'] }, FIXTURE).rows).toEqual(['ORDER-UNPLACED:k:ghost>c:t.z']);
  });

  it('a table read with no declared columns is an ORDER-BLIND entry; a chain step with no ledger row is ORDER-UNLEDGERED', () => {
    const r = ledger.chainOrderViolations({ k: ['a', 'b', 'c', 'd', 'e'] }, FIXTURE);
    expect(r.blind).toEqual(['ORDER-BLIND:k:d:u']);
    expect(r.unledgered).toEqual(['ORDER-UNLEDGERED:k:e']);
  });

  it('a two-way (co-written) edge is NOT exempted: the backward half is an ORDER row', () => {
    const inchain: Inchain = {
      p: { chains: ['k'], reads: { t: ['s'] }, writes: { t: ['s'] } },
      q: { chains: ['k'], reads: { t: ['s'] }, writes: { t: ['s'] } },
    };
    expect(ledger.chainOrderViolations({ k: ['p', 'q'] }, { inchain }).rows).toEqual(['ORDER:k:q>p:t.s']);
  });
});

describe('chainOrderViolations — live manifest × effective ledger', () => {
  const eff = ledger.effectiveLedger();

  it('every manifest chain is classified HARD or REPORT-ONLY (a new chain is red until classified)', () => {
    expect([...HARD_CHAINS, ...REPORT_ONLY_CHAINS].sort()).toEqual(Object.keys(chains).sort());
  });

  it('HARD chains (sources, wsib): zero ORDER / ORDER-UNPLACED rows', () => {
    const hard = Object.fromEntries(HARD_CHAINS.map((c) => [c, chains[c]!]));
    expect(ledger.chainOrderViolations(hard, eff).rows).toEqual([]);
  });

  it(`REPORT-ONLY chains: every row printed and counted, well-formed (flip HARD in: ${CLOSING_COMMIT})`, () => {
    const soft = Object.fromEntries(REPORT_ONLY_CHAINS.map((c) => [c, chains[c]!]));
    const r = ledger.chainOrderViolations(soft, eff);
    console.info(`[LDG-10 class 5] report-only ORDER rows: ${r.rows.length} (hard in ${CLOSING_COMMIT})`);
    for (const row of r.rows) console.info(`  ${row}`);
    for (const row of r.rows) expect(row).toMatch(ROW_RE);
  });

  it('ORDER-BLIND / ORDER-UNLEDGERED entries are printed and counted on every run (closed by P1-C8a declarations)', () => {
    const r = ledger.chainOrderViolations(chains, eff);
    console.info(`[LDG-10 class 5] ORDER-BLIND: ${r.blind.length}; ORDER-UNLEDGERED: ${r.unledgered.length}`);
    for (const e of [...r.blind, ...r.unledgered]) console.info(`  ${e}`);
    // chain.logic.test.ts assertion "enrich_parcels == load_zoning + 1" stays hand-written until this
    // missing declaration lands (P1-C8a): enrich_parcels reads zoning_bylaw_areas with no columns.
    expect(r.blind).toContain('ORDER-BLIND:sources:enrich_parcels:zoning_bylaw_areas');
  });

  // Replaces chain.logic.test.ts "enrich_ravines == link_parcels + 1" (Spec 122 §6.5: false — the
  // real dependency is parcels.geom + ravines) and "assert_global_coverage after
  // compute_parcel_cost_estimates": the derived check goes RED when the live order is broken.
  it('RED on live data: enrich_ravines moved before parcels / load_ravines is caught', () => {
    const s = chains.sources!.filter((x) => x !== 'enrich_ravines');
    s.splice(s.indexOf('parcels'), 0, 'enrich_ravines');
    const rows = ledger.chainOrderViolations({ sources: s }, eff).rows;
    expect(rows.some((r) => r.startsWith('ORDER:sources:parcels>enrich_ravines:'))).toBe(true);
    expect(rows.some((r) => r.startsWith('ORDER:sources:load_ravines>enrich_ravines:'))).toBe(true);
  });

  it('RED on live data: assert_global_coverage moved before compute_parcel_cost_estimates is caught', () => {
    const s = chains.sources!.filter((x) => x !== 'assert_global_coverage');
    s.splice(s.indexOf('compute_parcel_cost_estimates'), 0, 'assert_global_coverage');
    const rows = ledger.chainOrderViolations({ sources: s }, eff).rows;
    expect(rows.some((r) => r.startsWith('ORDER:sources:compute_parcel_cost_estimates>assert_global_coverage:'))).toBe(true);
  });
});
