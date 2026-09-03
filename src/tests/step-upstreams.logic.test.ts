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
  stepUpstreams: (slug: string, opts: { chain: string; env?: Record<string, string | undefined> }) => string[];
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
