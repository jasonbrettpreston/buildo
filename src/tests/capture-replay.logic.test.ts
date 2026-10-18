// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-CZ, R-DU (McDonald's Airtight V3)
// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A27 traps 11-12
//
// A capture is reproducible from committed data alone. `capture-step-golden.js --replay`
// prints the retake from the capture's own record (chain/args/invariants_file and every
// "arg" table_specs projection) plus its `recapture.json` entry; gate G #38 refuses a
// closed write table whose evidence capture has no entry. No DB, no child process.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const harness = require('../../scripts/analysis/capture-step-golden.js');
const { replayHarnessArgv, replayLines, validateRecapture, replayAll, replayMinute, parseReplayTs, shellQuote } = harness;

type Doc = Record<string, unknown>;
const STEP = 'scripts/load-fixture.js';
const G = 'docs/reports/golden/fixture_step';

function tmpRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-'));
  fs.mkdirSync(path.join(root, 'scripts/steps/_schema'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts/analysis'), { recursive: true });
  fs.mkdirSync(path.join(root, G, 'post'), { recursive: true });
  fs.mkdirSync(path.join(root, G, 'pre'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts/steps/_schema/converted.json'), JSON.stringify({ converted: [STEP], pending: [] }));
  fs.writeFileSync(path.join(root, 'scripts/load-fixture.descriptor.json'),
    JSON.stringify({ identity: { name: 'fixture_step' }, override: { force_run: 'FIXTURE_FORCE_RELOAD', force_full: 'none' } }));
  fs.writeFileSync(path.join(root, 'scripts/analysis/ingestor-forced-cohort.js'), '');
  fs.writeFileSync(path.join(root, G, 'invariants.json'), '[]');
  return root;
}

const plain: Doc = { step: STEP, chain: 'sources', args: [], invariants_file: null, table_specs: {}, tables_source: 'descriptor', table_row_ceiling: 100000 };
const projected: Doc = {
  ...plain,
  chain: 'none',
  args: ['--full'],
  invariants_file: `${G}/invariants.json`,
  table_specs: {
    t_b: { columns: ['id', 'v'], columns_source: 'arg', order: ['id'], order_source: 'descriptor' },
    t_a: { columns: ['k', 'w'], columns_source: 'arg', order: ['k'], order_source: 'arg' },
  },
};
const bracketEntry = {
  via: 'bracket',
  why: 'a 200-row cohort the step heals (fixture)',
  steps: [
    ['scripts/analysis/ingestor-forced-cohort.js', '--backup', '--where=v IS NOT NULL', '--backup-table=t_cohort_bak_{ts}'],
    ['scripts/analysis/ingestor-forced-cohort.js', '--run', '--backup-table=t_cohort_bak_{ts}', `--out=${G}/post/sources.json`],
  ],
};

describe('capture-step-golden --replay (Spec 124 R-CZ)', () => {
  it('plain: the retake is the capture\'s own step/chain, with --overwrite', () => {
    const root = tmpRepo();
    expect(replayLines(plain, `${G}/post/sources.json`, null, 'x', root)).toEqual([
      `node -r dotenv/config scripts/analysis/capture-step-golden.js --step=${STEP} --chain=sources --out=${G}/post/sources.json --overwrite`,
    ]);
  });

  it('arg projection: only "arg" columns/order are replayed, tables sorted, plus args and invariants', () => {
    const root = tmpRepo();
    const argv = replayHarnessArgv(projected, `${G}/post/standalone.json`, root);
    expect(argv).toContain('--args=--full');
    expect(argv).toContain(`--invariants=${G}/invariants.json`);
    expect(argv).toContain('--table-columns=t_a:k,w;t_b:id,v');
    expect(argv).toContain('--table-order=t_a:k');
    expect(argv.filter((a: string) => a.startsWith('--table-order='))).toHaveLength(1);
  });

  it('env: the recorded env prefixes the retake', () => {
    const root = tmpRepo();
    const [line] = replayLines(plain, `${G}/post/sources.forced.json`, { via: 'env', env: { FIXTURE_FORCE_RELOAD: '1' }, why: 'w'.repeat(20) }, 'x', root);
    expect(line.startsWith('FIXTURE_FORCE_RELOAD=1 node -r dotenv/config scripts/analysis/capture-step-golden.js')).toBe(true);
  });

  it('bracket: every step is printed in order, {ts} is one minute per bracket, values are shell-quoted', () => {
    const root = tmpRepo();
    const lines = replayLines(plain, `${G}/post/sources.json`, bracketEntry, '20261017t2200z', root);
    expect(lines).toEqual([
      "node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --backup '--where=v IS NOT NULL' --backup-table=t_cohort_bak_20261017t2200z",
      `node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --run --backup-table=t_cohort_bak_20261017t2200z --out=${G}/post/sources.json`,
    ]);
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
    expect(replayMinute(parseReplayTs('20261017t2359z'), 2)).toBe('20261018t0001z');
  });

  it('refuses a capture the repo cannot reproduce (absolute invariants path, comma in args)', () => {
    const root = tmpRepo();
    expect(() => replayHarnessArgv({ ...plain, invariants_file: 'C:/Users/x/inv.json' }, `${G}/post/a.json`, root)).toThrow(/not a repo file/);
    expect(() => replayHarnessArgv({ ...plain, args: ['a,b'] }, `${G}/post/a.json`, root)).toThrow(/comma/);
  });

  it('validateRecapture: closed via, override-only env, a producing step, orphan entries', () => {
    const root = tmpRepo();
    fs.writeFileSync(path.join(root, G, 'post/sources.json'), JSON.stringify(plain));
    const descriptor = JSON.parse(fs.readFileSync(path.join(root, 'scripts/load-fixture.descriptor.json'), 'utf8'));
    const ctx = { descriptor, captureExists: (s: string) => fs.existsSync(path.join(root, G, s)), scriptExists: (r: string) => fs.existsSync(path.join(root, r)) };
    expect(validateRecapture({ contract_version: 1, captures: { 'post/sources.json': bracketEntry } }, ctx)).toEqual([]);
    const reasons = (rc: unknown) => validateRecapture(rc, ctx).map((e: { reason: string }) => e.reason).join(' | ');
    expect(reasons({ contract_version: 1, captures: { 'post/gone.json': { via: 'plain', why: 'w'.repeat(20) } } })).toMatch(/orphan/);
    expect(reasons({ contract_version: 1, captures: { 'post/sources.json': { via: 'env', env: { OTHER_ENV: '1' }, why: 'w'.repeat(20) } } })).toMatch(/override env/);
    expect(reasons({ contract_version: 1, captures: { 'post/sources.json': { via: 'magic', why: 'w'.repeat(20) } } })).toMatch(/via must be/);
    expect(reasons({ contract_version: 1, captures: { 'post/sources.json': { via: 'bracket', why: 'w'.repeat(20), steps: [['scripts/analysis/ingestor-forced-cohort.js', '--plan']] } } })).toMatch(/no step produces/);
  });

  it('replayAll: fleet order, a PRE with an entry runs immediately before its POST', () => {
    const root = tmpRepo();
    for (const sub of ['pre/sources.json', 'post/sources.json', 'post/standalone.json']) {
      fs.writeFileSync(path.join(root, G, sub), JSON.stringify(sub.endsWith('standalone.json') ? projected : plain));
    }
    fs.writeFileSync(path.join(root, G, 'recapture.json'), JSON.stringify({
      contract_version: 1,
      captures: {
        'pre/sources.json': { via: 'env', env: { FIXTURE_FORCE_RELOAD: '1' }, why: 'back to back with its POST (fixture)' },
        'post/sources.json': { via: 'env', env: { FIXTURE_FORCE_RELOAD: '1' }, why: 'back to back with its PRE (fixture)' },
      },
    }));
    const { blocks, errors } = replayAll(root, parseReplayTs('20261017t2200z'));
    expect(errors).toEqual([]);
    expect(blocks.map((b: { rel: string; via: string }) => `${b.rel}:${b.via}`)).toEqual([
      `${G}/pre/sources.json:env`, `${G}/post/sources.json:env`, `${G}/post/standalone.json:plain`,
    ]);
  });
});

describe('gate G #38 recipe (Spec 124 R-CZ)', () => {
  it('a closed table whose evidence capture has no recapture entry is RED; with an entry it closes', async () => {
    const g = await import('../../scripts/analysis/gates/captures.mjs');
    const descriptor = { identity: { name: 'fixture_step' }, outputs: { writes: [{ table: 'fixture' }] } };
    const posts = [{ file: 'sources.json', doc: { summary: { records_new: 3, records_updated: 0 } } }];
    const entry = (recapture: unknown) => ({ descriptor, slug: 'fixture_step', posts, cohort: null, recipe: { recapture, validation: [] } });
    const red = g.checkNonzero([entry(null)], []);
    expect(red.pass).toBe(false);
    expect(red.detail).toMatch(/no recapture.json entry/);
    const green = g.checkNonzero([entry({ contract_version: 1, captures: { 'post/sources.json': { via: 'plain', why: 'w'.repeat(20) } } })], []);
    expect(green.pass).toBe(true);
  });

  it('the committed fleet: every closed table and every forced capture has a well-formed entry', async () => {
    const g = await import('../../scripts/analysis/gates/captures.mjs');
    const l = await import('../../scripts/analysis/gates/ledger.mjs');
    const r = g.checkNonzero(g.loadCapturesFleet(), l.loadLedger(path.resolve(__dirname, '../..')).rows);
    expect(r.detail).not.toMatch(/R-CZ/);
    expect(r.pass).toBe(true);
  });

  it('R-DU — --replay-all skips a pending step with no descriptor file by name; a pending step with one is still replayed', () => {
    const root = tmpRepo();
    const RED = 'scripts/load-red.js';
    const DESC = 'scripts/load-desc.js';
    fs.writeFileSync(path.join(root, 'scripts/steps/_schema/converted.json'), JSON.stringify({
      converted: [STEP], pending: [{ file: RED, stage: 'red_suite' }, { file: DESC, stage: 'descriptor_only' }],
    }));
    fs.writeFileSync(path.join(root, 'scripts/load-desc.descriptor.json'), JSON.stringify({ identity: { name: 'desc_step' } }));
    fs.mkdirSync(path.join(root, 'docs/reports/golden/desc_step/post'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/reports/golden/desc_step/post/sources.json'), JSON.stringify({ ...plain, step: DESC }));
    fs.writeFileSync(path.join(root, G, 'post/sources.json'), JSON.stringify(plain));
    const r = replayAll(root, parseReplayTs('20261017t2200z'));
    expect(r.errors).toEqual([]);
    expect(r.skipped).toEqual([{ file: RED, reason: expect.stringContaining('R-DU') }]);
    expect(r.blocks.map((b: { rel: string }) => b.rel)).toEqual([
      `${G}/post/sources.json`, 'docs/reports/golden/desc_step/post/sources.json',
    ]);
    expect(harness.pendingWithoutDescriptor(
      { converted: [STEP], pending: [{ file: RED }, { file: DESC }] }, (rel: string) => fs.existsSync(path.join(root, rel)),
    )).toEqual([RED]);
    // A converted step whose descriptor is missing is never skipped: it still fails loudly.
    fs.rmSync(path.join(root, 'scripts/load-fixture.descriptor.json'));
    expect(() => replayAll(root, parseReplayTs('20261017t2200z'))).toThrow(/ENOENT/);
  });

  it('--replay-all reproduces every committed capture with no unreplayable entry', () => {
    const { blocks, errors } = replayAll(path.resolve(__dirname, '../..'), parseReplayTs('20261017t2200z'));
    expect(errors).toEqual([]);
    expect(blocks.length).toBeGreaterThan(80);
  });
});
