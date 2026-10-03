// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6 (the cross-step ledger)
//
// Commit 1 (WF1 cross-step ledger) — `scripts/lib/ledger.js`'s `stepUpstreams`/
// `slugForms`/`loadLedger`. Pure, DB-free: the ledger reads the COMMITTED
// `scripts/seeds/lineage-meta-snapshot.json` (no live DB, mirrors
// `data-lineage-map.infra.test.ts`'s own drift-guard discipline).
//
// Fixtures (`src/tests/fixtures/ledger-snapshot*.fixture.json`) prove the
// derivation is genuinely DATA-driven — a removed producer changes the
// answer — never hardcoded, and prove the `chain` restriction (Fold C,
// DeepSeek #3) actually excludes a producer sharing no chain with the
// consumer.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ledger = require('../../scripts/lib/ledger.js') as {
  DEFAULT_SNAPSHOT_PATH: string;
  snapshotPath: (opts?: { env?: Record<string, string | undefined> }) => string;
  loadLedger: (opts?: { env?: Record<string, string | undefined> }) => { inchain: Record<string, unknown>; static: Record<string, unknown> };
  slugForms: (name: string, chains: string[]) => string[];
  stepUpstreams: (slug: string, opts: { chain: string; env?: Record<string, string | undefined>; ledger?: { inchain: Record<string, unknown> } }) => string[];
  // P1-C5 (Spec 122 §6; plan Fold 9 D-B): the effective ledger overlays every
  // converted descriptor's derived reads/writes and tags each row's provenance.
  effectiveLedger: (opts?: { env?: Record<string, string | undefined> }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inchain: Record<string, any>;
    static: Record<string, unknown>;
  };
  // P1-C5 (Fold 9 D-C): the column-level, chain-scoped derived reads.steps set.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  derivedReadsSteps: (slug: string, descriptor: any, opts: { ledger: { inchain: Record<string, any> }; producers?: string[] }) => string[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sourceVersion = require('../../scripts/lib/source-version.js') as {
  runLedgerGateDecision: (
    pool: { query: (...args: unknown[]) => Promise<unknown> },
    input: { ownSlugs: string[]; upstreamSlugs: string[] },
  ) => Promise<unknown>;
};

const REPO_ROOT = join(process.cwd());
const FULL_FIXTURE = 'src/tests/fixtures/ledger-snapshot.fixture.json';
const MISSING_PRODUCER_FIXTURE = 'src/tests/fixtures/ledger-snapshot-missing-producer.fixture.json';

// P1-C5 fixtures: the converted descriptors (seam loader) and their deriveMeta
// projection — the two sources effectiveLedger/derivedReadsSteps overlay.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seam = require(join(REPO_ROOT, 'scripts/lib/step/seam.js')) as {
  loadConvertedDescriptors: () => Record<string, { descriptor: { identity: { name: string } }; slug: string; relFile: string }>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const stepLib = require(join(REPO_ROOT, 'scripts/lib/step/index.js')) as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deriveMeta: (descriptor: any) => { reads: Record<string, string[]>; writes: Record<string, string[]>; external: string[] };
};
const deriveMeta = stepLib.deriveMeta;

const fixtureEnv = (relPath: string) => ({ BUILDO_LEDGER_SNAPSHOT_PATH: relPath });

describe('loadLedger / snapshotPath', () => {
  it('resolves to the committed snapshot by default', () => {
    expect(ledger.snapshotPath()).toBe(ledger.DEFAULT_SNAPSHOT_PATH);
  });

  it('the committed snapshot loads and carries the real cost-step entry', () => {
    const { inchain } = ledger.loadLedger();
    expect(inchain.compute_parcel_cost_estimates).toBeDefined();
  });

  it('BUILDO_LEDGER_SNAPSHOT_PATH override resolves relative to the repo root, not cwd at call time', () => {
    const resolved = ledger.snapshotPath({ env: fixtureEnv(FULL_FIXTURE) });
    expect(resolved).toBe(join(REPO_ROOT, FULL_FIXTURE));
    // and it is genuinely readable / a different file than the default
    expect(resolved).not.toBe(ledger.DEFAULT_SNAPSHOT_PATH);
    expect(() => readFileSync(resolved, 'utf8')).not.toThrow();
  });
});

describe('slugForms', () => {
  it('expands chain-scoped, bare, and hyphenated forms', () => {
    expect(ledger.slugForms('compute_parcel_cost_estimates', ['sources'])).toEqual([
      'sources:compute_parcel_cost_estimates',
      'compute_parcel_cost_estimates',
      'compute-parcel-cost-estimates',
    ]);
  });

  it('expands one triple per declared chain', () => {
    expect(ledger.slugForms('link_massing', ['sources', 'permits'])).toEqual([
      'sources:link_massing',
      'permits:link_massing',
      'link_massing',
      'link-massing',
    ]);
  });

  it('an empty/absent chains list still yields the bare + hyphenated forms', () => {
    expect(ledger.slugForms('parcels', [])).toEqual(['parcels', 'parcels']);
  });
});

describe('stepUpstreams — the real committed ledger', () => {
  it("derived producers for compute_parcel_cost_estimates are exactly ['enrich_parcels','parcels'] (Grounding table row)", () => {
    const result = ledger.stepUpstreams('compute_parcel_cost_estimates', { chain: 'sources' });
    expect(result).toEqual(['enrich_parcels', 'parcels']);
  });

  it('throws on an unknown slug rather than returning [] — "not found" must never be confusable with "no upstreams"', () => {
    expect(() => ledger.stepUpstreams('no_such_step_at_all', { chain: 'sources' })).toThrow(/unknown slug/);
  });

  it('throws when chain is omitted — chain is required, never optional (Fold D)', () => {
    // @ts-expect-error — deliberately omitting the required `chain` option
    expect(() => ledger.stepUpstreams('compute_parcel_cost_estimates', {})).toThrow(/requires a 'chain' option/);
  });
});

describe('stepUpstreams — fixture proofs (genuinely data-driven, not hardcoded)', () => {
  it('the full fixture: two same-chain producers included, the other-chain producer excluded', () => {
    const result = ledger.stepUpstreams('fixture_consumer', { chain: 'sources', env: fixtureEnv(FULL_FIXTURE) });
    expect(result).toEqual(['fixture_producer_a', 'fixture_producer_b']);
  });

  it('RED-then-GREEN proof: removing a producer\'s write in the snapshot removes it from the derived set', () => {
    // RED (recorded 2026-09-03, before this fixture existed): a naive
    // implementation that memoized/hardcoded the full-fixture answer would
    // still return ['fixture_producer_a','fixture_producer_b'] here even
    // though fixture_producer_b no longer writes widgets.col_b in this
    // fixture — proving the function re-derives from the snapshot on every
        // call rather than caching a stale answer.
    const result = ledger.stepUpstreams('fixture_consumer', { chain: 'sources', env: fixtureEnv(MISSING_PRODUCER_FIXTURE) });
    expect(result).toEqual(['fixture_producer_a']);
  });

  it('a producer sharing no chain with the consumer is excluded even though it writes a read column', () => {
    // fixture_producer_other_chain writes widgets.col_c, which fixture_consumer
    // reads — but it declares chain "other_chain", not "sources", so Fold C's
    // chain restriction must exclude it.
    const result = ledger.stepUpstreams('fixture_consumer', { chain: 'sources', env: fixtureEnv(FULL_FIXTURE) });
    expect(result).not.toContain('fixture_producer_other_chain');
  });

  it("a step with a null 'reads' returns [] — not a throw", () => {
    const result = ledger.stepUpstreams('fixture_no_reads', { chain: 'sources', env: fixtureEnv(FULL_FIXTURE) });
    expect(result).toEqual([]);
  });
});

describe('the derived set reaches runLedgerGateDecision\'s own non-empty guard', () => {
  it('a non-empty derived+expanded upstream set is never rejected by the "requires a non-empty upstreamSlugs array" guard', async () => {
    const derived = ledger.stepUpstreams('compute_parcel_cost_estimates', { chain: 'sources' });
    const upstreamSlugs = derived.flatMap((name) => ledger.slugForms(name, ['sources']));
    expect(upstreamSlugs.length).toBeGreaterThan(0);

    // A fake pool that throws a DISTINCT, recognizable error the instant
    // pool.query is reached — proving the call got PAST the guard (which
    // throws its OWN distinct error BEFORE ever touching the pool) rather
    // than merely not-throwing for an unrelated reason.
    const fakePool = {
      query: async () => {
        throw new Error('FAKE_POOL_REACHED — guard did not reject the array');
      },
    };
    await expect(
      sourceVersion.runLedgerGateDecision(fakePool, {
        ownSlugs: ['sources:compute_parcel_cost_estimates'],
        upstreamSlugs,
      }),
    ).rejects.toThrow('FAKE_POOL_REACHED');
  });

  it('an EMPTY upstream set (contrast case) IS rejected by the same guard, proving the assertion above is not vacuous', async () => {
    const fakePool = { query: async () => { throw new Error('FAKE_POOL_REACHED'); } };
    await expect(
      sourceVersion.runLedgerGateDecision(fakePool, { ownSlugs: ['sources:x'], upstreamSlugs: [] }),
    ).rejects.toThrow(/requires a non-empty upstreamSlugs array/);
  });
});

// Commit 2 — the drift lock (Fold C). DECLARED_AT_HEAD is a captured LITERAL
// copy of scripts/compute-parcel-cost-estimates.js:85's UPSTREAM_SLUGS array,
// `git blame`-cited to commit a81c6a7c (2026-08-16, D#6) — NEVER a live
// `require()` of the module's own UPSTREAM_SLUGS. Fold C: importing it live
// would let commit 3's deletion of the array silently break this lock
// instead of exercising it (the lock must survive the array's own removal).
//
// RED proven live (2026-09-03): a naive STRICT-equality assertion between
// this literal and the derived+expanded set fails at HEAD —
// `expected Set{ 'sources:enrich_parcels', ...(5) } to deeply equal
// Set{ 'sources:enrich_parcels', ...(4) }` with `+ "load-parcels"` the sole
// extra element on the received (derived) side — i.e. `onlyDeclared` is
// exactly `['load-parcels']`. That is Spec 122 §6.3's measured, corrected
// red: a slug-FORM divergence, not a missing producer (D#6 already fixed the
// missing producer). The tests below encode that measured state precisely,
// and prove the checker is not vacuous by injecting an EXTRA and a MISSING
// form. Commit 3 flips DECLARED_AT_HEAD to the post-retirement form (drops
// 'load-parcels') and the final test's zero-difference assertion — already
// written and already passing today — is what "the lock flips GREEN" means.
describe("drift lock — the cost step's declared UPSTREAM_SLUGS vs the derived ledger (Fold C)", () => {
  const DECLARED_AT_HEAD = ['sources:enrich_parcels', 'enrich_parcels', 'enrich-parcels', 'sources:parcels', 'parcels', 'load-parcels'];
  // The form commit 3 is expected to leave behind once the hand-maintained
  // array is retired (Fold B: Step 0 measured 'load-parcels' has 0 live
  // pipeline_runs hits, locally AND on cloud — a genuine retirement).
  const POST_RETIREMENT = DECLARED_AT_HEAD.filter((s) => s !== 'load-parcels');

  function symmetricDifference(declared: string[]) {
    const derived = ledger.stepUpstreams('compute_parcel_cost_estimates', { chain: 'sources' });
    const derivedForms = new Set(derived.flatMap((name) => ledger.slugForms(name, ['sources'])));
    const declaredSet = new Set(declared);
    return {
      onlyDeclared: [...declaredSet].filter((s) => !derivedForms.has(s)).sort(),
      onlyDerived: [...derivedForms].filter((s) => !declaredSet.has(s)).sort(),
    };
  }

  it('the measured divergence at HEAD is EXACTLY the load-parcels form — Spec 122 §6.3, corrected', () => {
    const { onlyDeclared, onlyDerived } = symmetricDifference(DECLARED_AT_HEAD);
    expect(onlyDeclared).toEqual(['load-parcels']);
    expect(onlyDerived).toEqual([]);
  });

  it('is not vacuous: an injected EXTRA declared form is detected on top of the known divergence', () => {
    const { onlyDeclared } = symmetricDifference([...DECLARED_AT_HEAD, 'totally-bogus-form']);
    expect(onlyDeclared).toEqual(['load-parcels', 'totally-bogus-form']);
  });

  it('is not vacuous: a MISSING declared form (dropping a real producer) is detected', () => {
    const withoutParcels = DECLARED_AT_HEAD.filter((s) => s !== 'sources:parcels' && s !== 'parcels');
    const { onlyDerived } = symmetricDifference(withoutParcels);
    expect(onlyDerived).toEqual(['parcels', 'sources:parcels']);
  });

  it('the post-retirement form (commit 3) equals the derived set with ZERO difference', () => {
    const { onlyDeclared, onlyDerived } = symmetricDifference(POST_RETIREMENT);
    expect(onlyDeclared).toEqual([]);
    expect(onlyDerived).toEqual([]);
  });
});

// ===========================================================================
// P1-C5 — the injected ledger, the EFFECTIVE ledger, and the derived
// reads.steps set (Spec 122 §6; plan Fold 9 D-A/D-B/D-C). RED-first: the
// ledger gains `stepUpstreams(...,{ledger})`, `effectiveLedger()` and
// `derivedReadsSteps(...)` in a sibling brief, so the non-parity tests below
// fail (TypeError / not a function) until then. D1's byte-parity test is the
// GREEN control: the injected-ledger path must answer EXACTLY like the
// committed snapshot for all 89 (slug, chain) pairs.
// ===========================================================================
describe('P1-C5 — injected ledger, effective ledger, derived reads.steps (Spec 122 §6; plan Fold 9 D-A/D-B/D-C)', () => {
  it('D1 byte parity: all 89 snapshot slug×chain pairs answer identically with the raw ledger injected', () => {
    const raw = ledger.loadLedger();
    const pairs: Array<[string, string]> = [];
    for (const slug of Object.keys(raw.inchain)) {
      const chains = ((raw.inchain[slug] as { chains?: string[] }).chains) || [];
      for (const chain of chains) pairs.push([slug, chain]);
    }
    expect(pairs.length).toBe(89);
    for (const [s, c] of pairs) {
      expect(ledger.stepUpstreams(s, { chain: c, ledger: raw })).toEqual(ledger.stepUpstreams(s, { chain: c }));
    }
  });

  it('RED: an injected ledger is honoured (not the committed snapshot)', () => {
    // fx_consumer reads fx_producer's write in the same chain — but NEITHER
    // slug exists in the committed snapshot. A stepUpstreams that ignored the
    // injected ledger would throw `unknown slug` instead of answering.
    const L = {
      inchain: {
        fx_consumer: { chains: ['x'], reads: { t: ['k'] }, writes: {} },
        fx_producer: { chains: ['x'], reads: {}, writes: { t: ['k'] } },
      },
      static: {},
    };
    expect(ledger.stepUpstreams('fx_consumer', { chain: 'x', ledger: L })).toEqual(['fx_producer']);
  });

  it('RED: effectiveLedger overlays every converted descriptor (source descriptor) and keeps snapshot rows (source snapshot)', () => {
    const eff = ledger.effectiveLedger();
    const raw = ledger.loadLedger();
    const conv = seam.loadConvertedDescriptors();
    expect(Object.keys(conv).length).toBeGreaterThan(0);

    const converted = new Set(Object.keys(conv));
    // (1) every raw key is present in eff.inchain — nothing is dropped.
    for (const key of Object.keys(raw.inchain)) {
      expect(eff.inchain[key]).toBeDefined();
    }
    // (2) converted rows: reads/writes are the descriptor's deriveMeta and the
    //     row is tagged source:'descriptor'.
    for (const [name, { descriptor }] of Object.entries(conv)) {
      const meta = deriveMeta(descriptor);
      expect(eff.inchain[name].source).toBe('descriptor');
      expect(eff.inchain[name].reads).toEqual(meta.reads);
      expect(eff.inchain[name].writes).toEqual(meta.writes);
    }
    // (3) every NON-converted raw key: reads unchanged and tagged source:'snapshot'.
    for (const key of Object.keys(raw.inchain)) {
      if (converted.has(key)) continue;
      expect(eff.inchain[key].source).toBe('snapshot');
      expect(eff.inchain[key].reads).toEqual((raw.inchain[key] as { reads: unknown }).reads);
    }
    // (4) static is untouched.
    expect(eff.static).toEqual(raw.static);
  });

  it("RED: derivedReadsSteps — column-level, chain-scoped, consumer side = the descriptor's declared reads, self excluded", () => {
    const L = {
      inchain: {
        fx_consumer: { chains: ['x'], reads: {}, writes: {} },
        p: { chains: ['x'], reads: {}, writes: { t: ['k'] } },
        q: { chains: ['y'], reads: {}, writes: { t: ['k'] } },
        r: { chains: ['x'], reads: {}, writes: { t: ['z'] } },
      },
      static: {},
    };
    const desc = {
      identity: { name: 'fx_consumer' },
      inputs: { reads: { tables: [{ table: 't', columns: ['k'] }], steps: [], externals: [] } },
      execution: { invocation: { x: {} } },
    };
    // p writes t.k in chain x → derived. q is another chain; r writes another
    // column; fx_consumer's own (empty) reads row is OVERLAID by the
    // descriptor's declared t.k, so nothing self-matches.
    expect(ledger.derivedReadsSteps('fx_consumer', desc, { ledger: L })).toEqual(['p']);
    // producers filter is applied to the result.
    expect(ledger.derivedReadsSteps('fx_consumer', desc, { ledger: L, producers: ['q'] })).toEqual([]);
    // self exclusion: a descriptor literally named p reading t.k derives nothing
    // (p is the consumer, and p is excluded from the candidates).
    const selfDesc = {
      identity: { name: 'p' },
      inputs: { reads: { tables: [{ table: 't', columns: ['k'] }], steps: [], externals: [] } },
      execution: { invocation: { x: {} } },
    };
    expect(ledger.derivedReadsSteps('p', selfDesc, { ledger: L })).toEqual([]);
  });
});
