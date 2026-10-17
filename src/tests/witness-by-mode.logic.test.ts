// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DB (McDonald's Airtight V3), R-BK
//
// R-DB — #44 (c) reads the per-mode write count. R-BK says the expected write-statement count
// for a run is `outputs.write_inventory.by_mode[<mode>].statements` when declared, otherwise the
// mode-agnostic `statements` (`writeInventoryForMode`, schema-homes.mjs). Before R-DB, #44 (c)
// read only `statements` (`witness.mjs` declaredStatements), so a by_mode declaration was dead
// text. The caller passes each invocation's resolved mode (`modeByInvocation`); a by_mode declarer
// whose mode is unknown is `FAIL:INPUT:<slug>:<invocation>:c:mode-unresolved`, never a guessed
// mode. (No capture records the resolved mode yet, so step-validate passes none: PIN, R-DB.)
//
// RED on HEAD: `modeByInvocation` is ignored, so the full-mode invocation below compares 1 traced
// write against `statements: 1` and passes, and an unresolved by_mode declarer passes silently.
import { describe, expect, it, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const WITNESS = path.join(path.resolve(__dirname, '../../'), 'scripts/analysis/gates/witness.mjs');

type Result = { answer: string; rows: string[]; hardStop: boolean };
type WitnessModule = {
  evaluateWitness: (args: Record<string, unknown>) => Result;
};

let mod: WitnessModule;
beforeAll(async () => {
  mod = (await import(pathToFileURL(WITNESS).href)) as unknown as WitnessModule;
});

const descriptor = (inventory: Record<string, unknown>) => ({
  inputs: { reads: { tables: [{ table: 'parcels', columns: ['id'] }] } },
  outputs: { writes: [{ table: 'parcels', columns: [{ name: 'a' }] }], write_inventory: inventory },
});

/** One fresh post trace with exactly ONE distinct step-write fingerprint. */
const oneWrite = {
  source_fingerprint: 'fp',
  statements: [{ fingerprint: 'w1', kind: 'write', count: 1, reads: { parcels: ['id'] }, writes: { parcels: ['a'] }, excluded: [], error: null }],
  transactions: [],
  autocommit_writes: [],
  touched: { reads: { parcels: ['id'] }, writes: { parcels: ['a'] } },
  errors: [],
};

const run = (inventory: Record<string, unknown>, modeByInvocation?: Record<string, string | null>) => mod.evaluateWitness({
  slug: 's', descriptor: descriptor(inventory), status: 'converted', currentFingerprint: 'fp',
  postTraces: { inv: oneWrite }, preTraces: {}, explainedDiffs: [], modeByInvocation,
});

const BY_MODE = { statements: 1, by_mode: { full: { statements: 2 }, incremental: { statements: 1 } } };

describe('R-DB — #44 (c) counts by_mode[mode] (R-BK)', () => {
  it('a full-mode run is held to by_mode.full (2), not the mode-agnostic statements (1)', () => {
    expect(run(BY_MODE, { inv: 'full' }).rows).toContain('FAIL:WITNESS:s:c:statements:2!=1');
  });

  it('an incremental run is held to by_mode.incremental (1) and passes', () => {
    expect(run(BY_MODE, { inv: 'incremental' }).rows).toEqual([]);
  });

  it('a by_mode declarer with no resolved mode is FAIL:INPUT, never a guessed mode', () => {
    expect(run(BY_MODE).rows).toContain('FAIL:INPUT:s:inv:c:mode-unresolved');
  });

  it('a step with no by_mode keeps the mode-agnostic count, whatever the mode (unchanged fleet)', () => {
    expect(run({ statements: 1 }).rows).toEqual([]);
    expect(run({ statements: 2 }, { inv: 'full' }).rows).toContain('FAIL:WITNESS:s:c:statements:2!=1');
  });
});
