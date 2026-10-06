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
// HARD on every chain since the FLEET-2 landing commit (RE-FREEZE, plan fold 14 L-A): every
// ORDER / ORDER-UNPLACED row fails; rows are printed and counted on every run, no exception file.
// A reader's read of a column it also writes is excluded ONLY as a same-statement write guard
// witnessed by its #44 trace (L-A register row, fold 17 #5 — R-id assigned at landing): declared
// read AND write, and every traced statement reading the column also writes it. Each exclusion is
// printed as an ORDER-GUARD entry; no trace = unwitnessed = the row stays; no list, no
// last-writer-wins.

import manifest from '../../scripts/manifest.json';
import { describe, it, expect } from 'vitest';

type Inchain = Record<string, { chains?: string[]; reads?: Record<string, string[]>; writes?: Record<string, string[]> }>;
type Result = { rows: string[]; blind: string[]; unledgered: string[]; guarded?: string[]; unwitnessed?: string[] };
type Stmt = { reads?: Record<string, string[]>; writes?: Record<string, string[]> };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ledger = require('../../scripts/lib/ledger.js') as {
  effectiveLedger: (opts?: { scripts?: Record<string, unknown> }) => { inchain: Inchain; retired?: string[] };
  unscriptedChainSlugs: (chains: Record<string, string[]>, scripts: Record<string, unknown>) => string[];
  loadLedger: () => { inchain: Inchain };
  chainOrderViolations: (
    chains: Record<string, string[]>,
    ledger: { inchain: Inchain },
    opts?: { traces?: Record<string, Stmt[]>; converted?: Iterable<string> },
  ) => Result;
  convertedSlugs: (opts?: { converted?: string[]; scripts?: Record<string, { file?: string }> }) => string[];
  loadTraceStatements: () => Record<string, Stmt[]>;
};

const HARD_CHAINS = ['sources', 'wsib', 'permits', 'coa', 'entities', 'deep_scrapes'];
const chains = (manifest as { chains: Record<string, string[]> }).chains;
const scripts = (manifest as unknown as { scripts: Record<string, unknown> }).scripts;

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

describe('chainOrderViolations — L-A same-statement write guard (from the trace, both directions)', () => {
  const G: { inchain: Inchain } = {
    inchain: {
      r: { chains: ['k'], reads: { t: ['s', 'x'] }, writes: { t: ['s'] } },
      p: { chains: ['k'], reads: {}, writes: { t: ['s'] } },
    },
  };
  const chain = { k: ['r', 'p'] };
  const guardStmt: Stmt = { reads: { t: ['id', 's'] }, writes: { t: ['s'] } };

  it('G1 GREEN: a read that sits only in a statement writing the same column is guarded — no ORDER row, one ORDER-GUARD entry', () => {
    const r = ledger.chainOrderViolations(chain, G, { traces: { r: [guardStmt] } });
    expect(r.rows).toEqual([]);
    expect(r.guarded).toEqual(['ORDER-GUARD:k:p>r:t.s']);
  });

  it('G2 RED: the same column also read in a separate SELECT stays an ORDER row', () => {
    const r = ledger.chainOrderViolations(chain, G, {
      traces: { r: [guardStmt, { reads: { t: ['s'] }, writes: {} }] },
    });
    expect(r.rows).toEqual(['ORDER:k:p>r:t.s']);
    expect(r.guarded).toEqual([]);
  });

  it('G3 RED: no trace for the reader = unwitnessed, the row stays', () => {
    expect(ledger.chainOrderViolations(chain, G, { traces: {} }).rows).toEqual(['ORDER:k:p>r:t.s']);
    expect(ledger.chainOrderViolations(chain, G).rows).toEqual(['ORDER:k:p>r:t.s']);
  });

  it('G4 RED: a trace that never reads the column does not guard it', () => {
    const r = ledger.chainOrderViolations(chain, G, {
      traces: { r: [{ reads: { t: ['id'] }, writes: { t: ['s'] } }] },
    });
    expect(r.rows).toEqual(['ORDER:k:p>r:t.s']);
  });

  it('G5 RED: a reader that does not declare the column as its own write is never guarded, whatever the trace says', () => {
    const noWrite: { inchain: Inchain } = {
      inchain: {
        r: { chains: ['k'], reads: { t: ['s', 'x'] }, writes: {} },
        p: { chains: ['k'], reads: {}, writes: { t: ['s'] } },
      },
    };
    const r = ledger.chainOrderViolations(chain, noWrite, { traces: { r: [guardStmt] } });
    expect(r.rows).toEqual(['ORDER:k:p>r:t.s']);
  });

  it('G6 partial: only the guarded column leaves the row', () => {
    const pWritesX: { inchain: Inchain } = {
      inchain: {
        r: { chains: ['k'], reads: { t: ['s', 'x'] }, writes: { t: ['s'] } },
        p: { chains: ['k'], reads: {}, writes: { t: ['s', 'x'] } },
      },
    };
    const r = ledger.chainOrderViolations(chain, pWritesX, { traces: { r: [guardStmt] } });
    expect(r.rows).toEqual(['ORDER:k:p>r:t.x']);
    expect(r.guarded).toEqual(['ORDER-GUARD:k:p>r:t.s']);
  });
});

describe('chainOrderViolations — live manifest × effective ledger', () => {
  const eff = ledger.effectiveLedger();

  it('every manifest chain is HARD (a new chain is red until listed)', () => {
    expect([...HARD_CHAINS].sort()).toEqual(Object.keys(chains).sort());
  });

  // MQ-C3 compliant variant (plan fold 19 row 3): an ORDER row whose producer AND reader are both
  // unconverted (no entry in converted.json) is ORDER-UNWITNESSED — printed + counted every run,
  // report-only, hard again the moment either side converts. Converted readers stay hard.
  const converted = new Set(ledger.convertedSlugs());
  const live = ledger.chainOrderViolations(
    Object.fromEntries(HARD_CHAINS.map((c) => [c, chains[c]!])),
    eff,
    { traces: ledger.loadTraceStatements(), converted },
  );

  it('HARD chains (all): zero hard ORDER / ORDER-UNPLACED rows — printed and counted every run', () => {
    const r = live;
    console.info(
      `[LDG-10 class 5] ORDER rows (hard): ${r.rows.length}; ORDER-UNWITNESSED: ${(r.unwitnessed || []).length}; ORDER-GUARD: ${(r.guarded || []).length}; ORDER-RETIRED: ${(eff.retired || []).length}`,
    );
    for (const row of r.rows) console.info(`  ${row}`);
    for (const u of r.unwitnessed || []) console.info(`  ${u}`);
    for (const g of r.guarded || []) console.info(`  ${g}`);
    for (const x of eff.retired || []) console.info(`  ${x}`);
    expect(r.rows).toEqual([]);
  });

  // Ceiling lock (fold 19 row 3): the committed count the live ORDER-UNWITNESSED count may only equal
  // or go below. Raising it needs a new Spec 124 §5 row + Operator-Ruling (never a silent bump).
  const ORDER_UNWITNESSED_CEILING = 13;
  it('ORDER-UNWITNESSED ceiling: live count <= the committed ceiling (may only shrink)', () => {
    expect((live.unwitnessed || []).length).toBeLessThanOrEqual(ORDER_UNWITNESSED_CEILING);
  });

  it('every ORDER-UNWITNESSED row has BOTH endpoints unconverted (re-derived from converted.json)', () => {
    for (const u of live.unwitnessed || []) {
      const m = /^ORDER-UNWITNESSED:[^:]+:([^>]+)>([^:]+):/.exec(u);
      expect(m, u).toBeTruthy();
      expect(converted.has(m![1]!), u).toBe(false);
      expect(converted.has(m![2]!), u).toBe(false);
    }
  });

  it('auto-hardening: converting the reader of a live ORDER-UNWITNESSED row makes it a hard ORDER row', () => {
    const first = (live.unwitnessed || [])[0];
    expect(first, 'no live ORDER-UNWITNESSED row to probe').toBeTruthy();
    const m = /^ORDER-UNWITNESSED:([^:]+):([^>]+)>([^:]+):(.*)$/.exec(first!)!;
    const r = ledger.chainOrderViolations({ [m[1]!]: chains[m[1]!]! }, eff, {
      traces: ledger.loadTraceStatements(),
      converted: new Set([...converted, m[3]!]),
    });
    expect(r.rows).toContain(`ORDER:${m[1]}:${m[2]}>${m[3]}:${m[4]}`);
    expect(r.unwitnessed || []).not.toContain(first);
  });

  // LDG-10 scope (fold 19 row 6): LDG-10 completeness is judged on ITS chains (sources / wsib) — no
  // report-only arm applies there: zero hard rows AND zero ORDER-UNWITNESSED rows.
  it('LDG-10 chains (sources, wsib): zero ORDER rows of ANY kind — the UNWITNESSED arm never relaxes them', () => {
    const r = ledger.chainOrderViolations({ sources: chains.sources!, wsib: chains.wsib! }, eff, {
      traces: ledger.loadTraceStatements(),
      converted,
    });
    expect(r.rows).toEqual([]);
    expect(r.unwitnessed || []).toEqual([]);
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

  // L-A guard RED (fold 17): a committed trace's trace.step is the step FILE path
  // (scripts/link-wsib.js, sometimes scripts\load-massing.js), not the slug; the slug is the
  // witness DIRECTORY name under docs/reports/witness/. If loadTraceStatements prefers trace.step
  // it is keyed by a path, so chainOrderViolations' traces[reader] lookup by slug never finds a
  // trace and the same-statement write guard can never fire on live data.
  it('loadTraceStatements is keyed by slug (witness dir name), never by a step file path', () => {
    const t = ledger.loadTraceStatements();
    expect(Object.keys(t)).toContain('link_wsib');
    expect(t['link_wsib']!.length).toBeGreaterThan(0);
    expect(Object.keys(t).filter((k) => /[\\/]/.test(k))).toEqual([]);
  });
});

// MQ-C1 (a) (plan fold 19 rows 1–2 + compliance amendment C1): a lineage-snapshot row whose slug has
// no manifest.scripts entry is a RETIRED producer. effectiveLedger drops it (ORDER, #44 (e) and
// unproducedReads all see one truth) and reports it as ORDER-RETIRED:<slug> — derived from the
// manifest, no list. Two directions: a slug given back a manifest.scripts entry reappears; a live
// slug is never dropped. Guard: a chain slug with no manifest.scripts entry is RED, so the
// predicate can never hide a live producer.
describe('MQ-C1 — retired snapshot producers (derived from manifest.scripts)', () => {
  const raw = ledger.loadLedger();
  const eff = ledger.effectiveLedger();
  const retiredSlugs = Object.keys(raw.inchain).filter((s) => !Object.prototype.hasOwnProperty.call(scripts, s)).sort();

  it('C1-1 RED: every snapshot slug with no manifest.scripts entry is dropped and reported as ORDER-RETIRED:<slug> (grammar pinned)', () => {
    expect(retiredSlugs.length).toBeGreaterThan(0);
    expect(eff.retired).toEqual(retiredSlugs.map((s) => `ORDER-RETIRED:${s}`));
    for (const s of retiredSlugs) expect(Object.prototype.hasOwnProperty.call(eff.inchain, s)).toBe(false);
    for (const x of eff.retired || []) expect(x).toMatch(/^ORDER-RETIRED:[a-z0-9_]+$/);
  });

  it('C1-2 GREEN control: a live slug (manifest.scripts entry) is never dropped', () => {
    for (const s of Object.keys(raw.inchain)) {
      if (!Object.prototype.hasOwnProperty.call(scripts, s)) continue;
      expect(eff.inchain[s], s).toBeDefined();
    }
  });

  it('C1-3 RED: a retired slug given back a manifest.scripts entry reappears (and leaves retired)', () => {
    const back = retiredSlugs[0]!;
    const e2 = ledger.effectiveLedger({ scripts: { ...scripts, [back]: { file: `scripts/${back}.js` } } });
    expect(e2.inchain[back]).toBeDefined();
    expect(e2.retired).not.toContain(`ORDER-RETIRED:${back}`);
  });

  it('C1-4 RED: no live ORDER / ORDER-UNPLACED row names a retired producer', () => {
    const r = ledger.chainOrderViolations(chains, eff);
    for (const s of retiredSlugs) {
      expect(r.rows.filter((row) => row.includes(`:${s}>`))).toEqual([]);
    }
  });

  it('C1-5 guard: a chain slug with no manifest.scripts entry is RED (fixture); live = 0', () => {
    expect(ledger.unscriptedChainSlugs({ k: ['a', 'zz'] }, { a: {} })).toEqual(['CHAIN-UNSCRIPTED:k:zz']);
    expect(ledger.unscriptedChainSlugs({ k: ['a'] }, { a: {} })).toEqual([]);
    expect(ledger.unscriptedChainSlugs(chains, scripts)).toEqual([]);
  });
});

describe('MQ-C3 — ORDER-UNWITNESSED derived arm (fixture, both directions)', () => {
  const swapped = { k: ['b', 'a', 'c'] };
  it('U1: producer and reader both unconverted → ORDER-UNWITNESSED, not a hard row', () => {
    const r = ledger.chainOrderViolations(swapped, ABC, { converted: [] });
    expect(r.rows).toEqual([]);
    expect(r.unwitnessed).toEqual(['ORDER-UNWITNESSED:k:a>b:t.x']);
  });
  it('U2: reader converted → hard ORDER row', () => {
    const r = ledger.chainOrderViolations(swapped, ABC, { converted: ['b'] });
    expect(r.rows).toEqual(['ORDER:k:a>b:t.x']);
    expect(r.unwitnessed).toEqual([]);
  });
  it('U3: producer converted → hard ORDER row', () => {
    const r = ledger.chainOrderViolations(swapped, ABC, { converted: ['a'] });
    expect(r.rows).toEqual(['ORDER:k:a>b:t.x']);
    expect(r.unwitnessed).toEqual([]);
  });
  it('U4 fail-safe: no opts.converted → every row hard', () => {
    const r = ledger.chainOrderViolations(swapped, ABC);
    expect(r.rows).toEqual(['ORDER:k:a>b:t.x']);
    expect(r.unwitnessed || []).toEqual([]);
  });
  it('U5: ORDER-UNPLACED is never moved to the arm', () => {
    const r = ledger.chainOrderViolations({ k: ['a', 'b', 'c'] }, FIXTURE, { converted: [] });
    expect(r.rows).toEqual(['ORDER-UNPLACED:k:ghost>c:t.z']);
    expect(r.unwitnessed).toEqual([]);
  });
  it('convertedSlugs: derived from converted.json × manifest.scripts (fixture + live)', () => {
    expect(ledger.convertedSlugs({ converted: ['scripts/a.js'], scripts: { a: { file: 'scripts/a.js' }, b: { file: 'scripts/b.js' } } })).toEqual(['a']);
    const live = ledger.convertedSlugs();
    expect(live.length).toBeGreaterThan(0);
    for (const s of live) expect(Object.prototype.hasOwnProperty.call(scripts, s)).toBe(true);
  });
});

// MQ-A9 (a): no chain carries an ordering edge INTO assert_global_coverage on a heartbeat table (the check-reads
// home is never an edge, R-BJ). Behaviour of the ledger, not a source string.
describe('MQ-A9 (a) — assert_global_coverage heartbeat reads are not ordering edges', () => {
  it('no ORDER / ORDER-UNWITNESSED row reads engine_health_snapshots into assert_global_coverage (amendment A2: data_quality_snapshots stays a real edge, MQ-A8)', () => {
    const r = ledger.chainOrderViolations(chains, ledger.effectiveLedger(), { traces: ledger.loadTraceStatements(), converted: ledger.convertedSlugs() });
    const hits = [...r.rows, ...(r.unwitnessed || [])].filter((x) => /assert_global_coverage:.*engine_health_snapshots/.test(x));
    expect(hits).toEqual([]);
  });
  it('GREEN control (amendment A2): data_quality_snapshots is still a declared AGC read, and sources has no hard dqs row (MQ-A8 reorder)', () => {
    const r = ledger.chainOrderViolations({ sources: chains.sources! }, ledger.effectiveLedger(), { traces: ledger.loadTraceStatements(), converted: ledger.convertedSlugs() });
    expect(r.rows.filter((x) => /assert_global_coverage:.*data_quality_snapshots/.test(x))).toEqual([]);
  });
});
