// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.9
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
//
// Phase B B3 — compute-parcel-cost-estimates.js run-ledger gate wiring. Pure
// cases (no live DB needed — DB-behavioral cases for readCostVersionSignals
// (C1) and the end-to-end gate/rate-bump interplay (C2 behavioral half) live
// in src/tests/db/ledger-gate-callers.db.test.ts):
//   C1 — canonical ISO version keys replace the Date.toString() blob as the
//     ONLY version signal (source-scan: the emitted records_meta carries
//     `rates_as_of` / `index_updated_at` string keys on both the run AND skip
//     paths).
//   C2 — hasRateOrIndexChanged: pure comparison, unit-lockable without a DB.
//   C3 — COMPUTE_PARCEL_COST_FORCE_FULL escape hatch (also folded into
//     run-chain-defer.logic.test.ts §⑤(c), the pre-impl-guessed-name lock).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SCRIPT_PATH = join(process.cwd(), 'scripts/compute-parcel-cost-estimates.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const costEstimates = require('../../scripts/compute-parcel-cost-estimates.js') as {
  hasRateOrIndexChanged: (
    ownLastRecordsMeta: Record<string, unknown> | null,
    versionSignals: { ratesAsOf: string | null; indexUpdatedAt: string | null },
  ) => boolean;
  FORCE_FULL_ENV: string;
  OWN_SLUGS: string[];
  UPSTREAM_SLUGS: string[];
};

describe('C1 — canonical ISO version keys stamped on both the run and skip paths', () => {
  it('the run-path emitSummary records_meta carries rates_as_of / index_updated_at', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf8');
    // Two occurrences expected: once in the SKIP branch, once in the real-run branch.
    // Commit B (B3 output-panel remediation) — the SKIP branch now assigns onto
    // skipRecordsMeta (skipRecordsMeta.rates_as_of = ...) rather than an inline
    // object-literal key, since its records_meta is built via
    // sourceVersion.buildSkipGateRecordsMeta(); the real-run branch is unchanged
    // (still the object-literal form). Both forms stamp the same canonical key.
    const rateKeyMatches = src.match(/rates_as_of\s*[:=]\s*versionSignals\.ratesAsOf/g) ?? [];
    const indexKeyMatches = src.match(/index_updated_at\s*[:=]\s*versionSignals\.indexUpdatedAt/g) ?? [];
    expect(rateKeyMatches.length).toBe(2);
    expect(indexKeyMatches.length).toBe(2);
  });

  it('readCostVersionSignals casts rates_as_of via ::text (ISO date), never a bare JS Date → String() blob', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf8');
    const fnBody = src.match(/async function readCostVersionSignals\(pool\)[\s\S]*?\n}\n/);
    expect(fnBody, 'readCostVersionSignals function body not found').not.toBeNull();
    expect(fnBody![0]).toMatch(/::text AS rates_as_of/);
    expect(fnBody![0]).toMatch(/\.toISOString\(\)/);
  });
});

describe('C2 — hasRateOrIndexChanged (pure)', () => {
  const signals = { ratesAsOf: '2026-06-01', indexUpdatedAt: '2026-07-01T00:00:00.000Z' };

  it('no prior completed-run meta (null) → CHANGED (fail-safe, matches the no-baseline rule)', () => {
    expect(costEstimates.hasRateOrIndexChanged(null, signals)).toBe(true);
  });

  it('prior meta present but missing the ISO keys entirely (pre-C1 legacy row) → CHANGED', () => {
    expect(costEstimates.hasRateOrIndexChanged({}, signals)).toBe(true);
  });

  it('identical rates_as_of AND index_updated_at → NOT changed', () => {
    expect(costEstimates.hasRateOrIndexChanged({ rates_as_of: signals.ratesAsOf, index_updated_at: signals.indexUpdatedAt }, signals)).toBe(false);
  });

  it('rates_as_of differs (a rate table bump) → CHANGED', () => {
    expect(costEstimates.hasRateOrIndexChanged({ rates_as_of: '2020-01-01', index_updated_at: signals.indexUpdatedAt }, signals)).toBe(true);
  });

  it('index_updated_at differs (an index bump) → CHANGED', () => {
    expect(costEstimates.hasRateOrIndexChanged({ rates_as_of: signals.ratesAsOf, index_updated_at: '2020-01-01T00:00:00.000Z' }, signals)).toBe(true);
  });
});

describe('C3 — force-full env escape hatch (also locked in run-chain-defer.logic.test.ts §⑤(c))', () => {
  it('FORCE_FULL_ENV is exactly COMPUTE_PARCEL_COST_FORCE_FULL', () => {
    expect(costEstimates.FORCE_FULL_ENV).toBe('COMPUTE_PARCEL_COST_FORCE_FULL');
  });

  it('main() reads process.env[FORCE_FULL_ENV] to bypass the gate', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf8');
    expect(src).toMatch(/process\.env\[FORCE_FULL_ENV\]/);
  });
});
