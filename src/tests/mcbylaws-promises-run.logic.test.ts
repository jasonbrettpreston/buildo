// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-73 plan section 4 "The run (K5)", "Test-body scan (K19)"); R-KQ, R-KU.
// Runs the repo's own vitest binary over a throw-away project in tmp; nothing in the real repo is scanned.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cleanEnv, runVitest, matchTests, runLines, emptyTestLines }
  from '../../scripts/analysis/mcbylaws-promises/promise-run.mjs';

const VITEST = path.resolve(__dirname, '../../node_modules/.bin/vitest');
const CONFIG = 'vitest.config.mjs';
const CASES = [
  { rel: 'ok.test.mjs', text: `describe('suite', () => {\n  it('adds', () => { expect(1 + 1).toBe(2); });\n  it('subtracts', () => { expect(3 - 1).toBe(2); });\n});\n` },
  { rel: 'bad.test.mjs', text: `it('fails', () => { expect(1).toBe(2); });\n` },
  { rel: 'skip.test.mjs', text: `it.skip('skipped', () => { expect(1).toBe(1); });\n` },
];
const ENTRIES = [
  { id: 'pass-1', artifact: 'ok.test.mjs', test_name: 'suite adds' },
  { id: 'fail-1', artifact: 'bad.test.mjs', test_name: 'fails' },
  { id: 'skip-1', artifact: 'skip.test.mjs', test_name: 'skipped' },
];

let dir = '';
let config = '';

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcb-promises-fx-'));
  config = path.join(dir, CONFIG);
  fs.writeFileSync(config, `export default { test: { globals: true, include: ['*.test.mjs'] } };\n`);
  for (const c of CASES) fs.writeFileSync(path.join(dir, c.rel), c.text);
});
afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe('F-P3 the run: one vitest call over all files', () => {
  let out: { ok: boolean; json?: { testResults: unknown[] }; reason?: string };
  beforeAll(() => {
    out = runVitest({ cwd: dir, files: CASES.map((c) => c.rel), bin: VITEST, config });
  }, 300000);
  /** The run's JSON, or an empty shell when the run failed. */
  const json = () => out.json as { testResults: unknown[] };
  type Matches = Record<string, { state: string; fullName: string }>;
  const matched = (entries: object[], input: { testResults: unknown[] } = json()) =>
    matchTests(input, entries) as Matches;

  it('returns ok with parsed JSON holding testResults', () => {
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.json!.testResults)).toBe(true);
  });

  it('matchTests: passed / failed / skipped by exact fullName', () => {
    const m = matched(ENTRIES);
    expect(m['pass-1']).toEqual({ state: 'passed', fullName: 'suite adds' });
    expect(m['fail-1']).toEqual({ state: 'failed', fullName: 'fails' });
    expect(m['skip-1']).toEqual({ state: 'skipped', fullName: 'skipped' });
  });

  it('runLines: skipped is never green, passing gives nothing', () => {
    const m = matched(ENTRIES);
    const lines = runLines(m);
    expect(lines).toEqual(['FAIL:R:not-green:fail-1', 'FAIL:R:empty-test:skip-1']);
    expect(lines.some((l: string) => l.includes('pass-1'))).toBe(false);
  });

  it('a prefix name is missing, never a pass', () => {
    const m = matched([{ id: 'pre', artifact: 'ok.test.mjs', test_name: 'suite add' }]);
    expect(m['pre']!.state).toBe('missing');
    expect(runLines(m)).toEqual(['FAIL:R:not-green:pre']);
  });

  it('two entries for the same name in two files resolve exactly once each', () => {
    const m = matched([
      { id: 'in-a', artifact: 'a/dup.test.mjs', test_name: 'same' },
      { id: 'in-b', artifact: 'b/dup.test.mjs', test_name: 'same' },
    ], {
      testResults: [
        { name: '/p/a/dup.test.mjs', assertionResults: [{ fullName: 'same', status: 'passed' }] },
        { name: '/p/b/dup.test.mjs', assertionResults: [{ fullName: 'same', status: 'failed' }] },
      ],
    });
    expect(m['in-a']).toEqual({ state: 'passed', fullName: 'same' });
    expect(m['in-b']).toEqual({ state: 'failed', fullName: 'same' });
    expect(matched([{ id: 'amb', artifact: 'dup.test.mjs', test_name: 'same' }],
      { testResults: [{ name: '/p/dup.test.mjs', assertionResults: [{ fullName: 'same', status: 'passed' }, { fullName: 'same', status: 'passed' }] }] })['amb']!.state).toBe('ambiguous');
    expect(runLines({ amb: { state: 'ambiguous', fullName: 'same' } })).toEqual(['FAIL:R:empty-test:amb']);
  });

  it('a missing file or a bad bin is a failure, never a pass', () => {
    const miss = runVitest({ cwd: dir, files: ['nope.test.mjs'], bin: VITEST, config, timeoutMs: 120000 });
    expect(miss.ok).toBe(false);
    expect(typeof miss.reason).toBe('string');
    const bad = runVitest({ cwd: dir, files: ['ok.test.mjs'], bin: path.join(dir, 'no-vitest'), config });
    expect(bad.ok).toBe(false);
    expect(typeof bad.reason).toBe('string');
  }, 300000);
});

describe('F-P9 emptyTestLines: test-body scan (K19)', () => {
  const SRC = {
    skip: `it.skip('t', () => { expect(1).toBe(1); });`,
    todo: `it.todo('t');`,
    only: `it.only('t', () => { expect(1).toBe(1); });`,
    fails: `it.fails('t', () => { expect(1).toBe(1); });`,
    dskip: `describe.skip('d', () => { it('t', () => { expect(1).toBe(1); }); });`,
    noExpect: `it('t', () => { doThing(); });`,
    real: `describe('d', () => {\n  it('adds', () => { expect(1 + 1).toBe(2); });\n});`,
    nested: `describe('d', () => {\n  it('adds', () => {\n    expect(1).toBe(1);\n  });\n  it('other', () => {});\n});`,
    nestedEmpty: `describe('d', () => {\n  it('adds', () => {\n    go();\n  });\n  it('other', () => { expect(1).toBe(1); });\n});`,
  };
  const TABLE: Array<[string, string, string, string[]]> = [
    ['skip', SRC.skip, 't', ['FAIL:R:empty-test:x']],
    ['todo', SRC.todo, 't', ['FAIL:R:empty-test:x']],
    ['only', SRC.only, 't', ['FAIL:R:empty-test:x']],
    ['fails', SRC.fails, 't', ['FAIL:R:empty-test:x']],
    ['describe.skip', SRC.dskip, 't', ['FAIL:R:empty-test:x']],
    ['zero expect', SRC.noExpect, 't', ['FAIL:R:empty-test:x']],
    ['name not found', SRC.real, 'ghost', ['FAIL:R:empty-test:x']],
    ['real expect', SRC.real, 'adds', []],
    ['nested via literal', SRC.nested, 'suite adds', []],
    ['nested empty', SRC.nestedEmpty, 'suite adds', ['FAIL:R:empty-test:x']],
  ];
  it.each(TABLE)('%s', (_label, source, name, want) => {
    expect(emptyTestLines('x', source, name)).toEqual(want);
  });
});

describe('cleanEnv', () => {
  it('drops GIT_* and VITEST keys, keeps PATH', () => {
    const out = cleanEnv({ GIT_DIR: '/g', GIT_WORK_TREE: '/w', VITEST_WORKER_ID: '7', PATH: '/usr/bin', HOME: '/h' });
    expect(out).toEqual({ PATH: '/usr/bin', HOME: '/h' });
  });
});
