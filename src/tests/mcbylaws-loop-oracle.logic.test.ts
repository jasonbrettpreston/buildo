// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (oracle-first: a hand-authored expected answer may not move beside layer2/3 code in one range; G68-04)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 6 "Classes" (PROPOSED PR-68-3, V68-1: hand-authored oracle vs generated outputs vs code; every range that changes code binds a new loop record)
// Red first. Pure functions only: no disk writes, no process.env, no network. A temp dir holds the loadLayer23 fixture.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-oracle.mjs'));
const FIXTURES = path.join(ROOT, 'mcbylaws/loop/fixtures');

type NameStatus = { s: string; p: string };
type Classify = (p: string) => 'generated' | 'oracle' | 'code' | null;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-loop-oracle-'));
afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// The REAL name-status of commit d01e1458 (orchestrator-supplied fixture; read, never written here).
const d01 = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'd01e1458-files.json'), 'utf8')) as NameStatus[];
const classify = M.makeClassifier() as Classify;
const codeOnly = d01.filter((x) => !classify(x.p));
// The same range with every superseded oracle file already flipped to A (a pure code range).
const d01CodeOnly = d01.map((x) => (classify(x.p) === 'oracle' ? { s: 'A', p: x.p } : x));

const HONEST: NameStatus[] = [
  { s: 'M', p: 'scripts/seeds/bylaw/layer3-catalogue.json' },
  { s: 'M', p: 'scripts/analysis/bylaw-validation/coa-expected/expected-172.json' },
  { s: 'M', p: 'scripts/analysis/bylaw-validation/coa-expected/floors-172.json' },
  { s: 'M', p: 'mcbylaws/loop/data/ids-coa172.json' },
  { s: 'M', p: 'mcbylaws/loop/regression-set.json' },
  { s: 'A', p: 'docs/reports/loop-records/inc1/round-04.json' },
];
const HONEST_PLUS_HAND_ORACLE: NameStatus[] = [
  ...HONEST,
  { s: 'M', p: 'src/tests/mcbylaws/loop/increment-1/expected-25.json' },
];

describe('globToRegExp (the prototype glob, ported)', () => {
  it('anchors and treats **/ as zero-or-more directories', () => {
    const re = M.globToRegExp('scripts/seeds/bylaw/**') as RegExp;
    expect(re.test('scripts/seeds/bylaw/a.json')).toBe(true);
    expect(re.test('scripts/seeds/bylaw/nested/b.json')).toBe(true);
    expect(re.test('scripts/seeds/bylaw2/a.json')).toBe(false);

    const star = M.globToRegExp('**/bylaw*') as RegExp;
    expect(star.test('src/tests/bylaw-x.json')).toBe(true);
    expect(star.test('src/tests/nested/bylaw-x.json')).toBe(true);
    expect(star.test('src/tests/coa-x.json')).toBe(false);
  });

  it('escapes regex metacharacters in the glob', () => {
    const re = M.globToRegExp('a+b.(c)') as RegExp;
    expect(re.test('a+b.(c)')).toBe(true);
    expect(re.test('aab.(c)')).toBe(false);
  });
});

describe('makeClassifier (generated checked first, then oracle, then code)', () => {
  it('classifies the three classes and leaves the rest null', () => {
    expect(classify('scripts/analysis/bylaw/front-averaging.mjs')).toBe('code');
    expect(classify('scripts/analysis/bylaw-validation/coa-round.mjs')).toBe('code');
    expect(classify('src/tests/fixtures/bylaw/eval-vocab.json')).toBe('oracle');
    expect(classify('src/tests/mcbylaws/loop/increment-1/expected-25.json')).toBe('oracle');
    expect(classify('src/tests/bylaw-fix-3.logic.test.ts')).toBe('oracle');
    expect(classify('src/tests/coa-round.logic.test.ts')).toBe('oracle');
    expect(classify('scripts/analysis/bylaw-validation/coa-expected/expected-172.json')).toBe('generated');
    expect(classify('mcbylaws/loop/regression-set.json')).toBe('generated');
    expect(classify('docs/reports/loop-records/inc1/round-04.json')).toBe('generated');

    expect(classify('docs/reference/bylaw-provisions.json')).toBeNull();
    expect(classify('src/tests/mcbylaws-loop-oracle.logic.test.ts')).toBeNull();
    expect(classify('scripts/analysis/mcbylaws-loop/loop-oracle.mjs')).toBeNull();
  });

  it('a generated path inside an oracle glob stays generated', () => {
    expect(classify('src/tests/fixtures/bylaw/expected-9.json')).toBe('oracle');
    expect(classify('scripts/analysis/bylaw-validation/coa-expected/floors-172.json')).toBe('generated');
  });

  it('honours a custom layer23 list', () => {
    const custom = M.makeClassifier(['src/lib/bylaw/**']) as Classify;
    expect(custom('src/lib/bylaw/eval.mjs')).toBe('code');
    expect(custom('scripts/analysis/bylaw/front-averaging.mjs')).toBeNull();
  });
});

describe('oracle globs (hand-authored)', () => {
  it('includes the prereg files and the coa tests, not the generated pins', () => {
    const classify2 = M.makeClassifier() as Classify;
    expect(classify2('scripts/analysis/bylaw-validation/coa-expected/prereg-68.json')).toBe('oracle');
    expect(classify2('mcbylaws/oracle/worked-examples.json')).toBe('oracle');
    expect(classify2('src/tests/coa-scorecard.logic.test.ts')).toBe('oracle');
    expect(classify2('scripts/analysis/bylaw-validation/coa-expected/expected-172.json')).toBe('generated');
  });
});

describe('checkOracleFirst (union of the range; new oracle files allowed)', () => {
  it('split oracle-only then code-only commits are caught by the range', () => {
    const oracleOnly: NameStatus[] = [{ s: 'M', p: 'src/tests/fixtures/bylaw/eval-vocab.json' }];
    const codeOnlyCommit: NameStatus[] = [{ s: 'M', p: 'scripts/analysis/bylaw/front-averaging.mjs' }];
    const v = M.checkOracleFirst([oracleOnly, codeOnlyCommit], classify) as string[];
    expect(v.length).toBe(1);
    expect(v[0]).toMatch(/^oracle_moved_with_code:1 oracle beside 1 code in range$/);
  });

  it('an oracle-only range is green', () => {
    expect(M.checkOracleFirst([[{ s: 'M', p: 'src/tests/fixtures/bylaw/eval-vocab.json' }]], classify)).toEqual([]);
  });

  it('REAL d01e1458 replay is red', () => {
    const v = M.checkOracleFirst([d01], classify) as string[];
    expect(v.length).toBe(1);
    expect(v[0]).toMatch(/^oracle_moved_with_code:\d+ oracle beside \d+ code in range$/);
  });

  it('REAL d01e1458 minus the oracle files is green', () => {
    expect(codeOnly.length).toBeGreaterThan(0);
    expect(M.checkOracleFirst([codeOnly], classify)).toEqual([]);
  });

  it('REAL d01e1458 minus the code files is green', () => {
    const noCode = d01.filter((x) => classify(x.p) !== 'code');
    expect(M.checkOracleFirst([noCode], classify)).toEqual([]);
  });

  it('adding a brand-new hand-authored oracle file beside code is allowed', () => {
    expect(
      M.checkOracleFirst(
        [[{ s: 'A', p: 'src/tests/mcbylaws/loop/increment-1/expected-25.json' }, { s: 'M', p: 'scripts/seeds/bylaw/vocab.json' }]],
        classify,
      ),
    ).toEqual([]);
  });

  it('a deleted oracle file beside code fires', () => {
    const v = M.checkOracleFirst(
      [[{ s: 'D', p: 'src/tests/fixtures/bylaw/eval-vocab.json' }, { s: 'M', p: 'scripts/seeds/bylaw/vocab.json' }]],
      classify,
    ) as string[];
    expect(v.length).toBe(1);
  });

  it('A0388 flip (constructed) is red', () => {
    const v = M.checkOracleFirst(
      [[{ s: 'M', p: 'src/tests/mcbylaws/loop/increment-1/expected-25.json' }, { s: 'M', p: 'scripts/seeds/bylaw/layer3-catalogue.json' }]],
      classify,
    ) as string[];
    expect(v.length).toBe(1);
  });

  it('HONEST round is green (catalogue + pin + floor raise + ids + regression set + record)', () => {
    expect(M.checkOracleFirst([HONEST], classify)).toEqual([]);
    expect(M.recordMissing(HONEST, classify)).toEqual([]);
    expect(M.commitStageFires(HONEST, classify)).toBe(true);
  });

  it('a hand-authored expected answer beside the honest round is still red', () => {
    expect((M.checkOracleFirst([HONEST_PLUS_HAND_ORACLE], classify) as string[]).length).toBeGreaterThan(0);
  });

  it('the hand-authored expected answer alone is green', () => {
    expect(
      M.checkOracleFirst([[{ s: 'M', p: 'src/tests/mcbylaws/loop/increment-1/expected-25.json' }]], classify),
    ).toEqual([]);
  });
});

describe('commitStageFires', () => {
  it('a code file pair fires the stage', () => {
    expect(
      M.commitStageFires(
        [{ s: 'M', p: 'scripts/analysis/bylaw-validation/coa-round.mjs' }, { s: 'M', p: 'src/tests/coa-round.logic.test.ts' }],
        classify,
      ),
    ).toBe(true);
  });

  it('a generated artifact alone fires the stage', () => {
    expect(M.commitStageFires([{ s: 'M', p: 'mcbylaws/loop/regression-set.json' }], classify)).toBe(true);
  });

  it('docs only does not fire', () => {
    expect(M.commitStageFires([{ s: 'M', p: 'docs/reference/bylaw-provisions.md' }], classify)).toBe(false);
  });

  it('an added hand-authored oracle file alone fires the stage', () => {
    expect(
      M.commitStageFires([{ s: 'A', p: 'src/tests/mcbylaws/loop/increment-1/expected-25.json' }], classify),
    ).toBe(true);
  });
});

describe('recordMissing', () => {
  it('code changed without an added record is red', () => {
    expect(M.recordMissing(d01CodeOnly, classify)).toEqual(['record_missing']);
  });

  it('code changed with an added record is green', () => {
    expect(
      M.recordMissing([...d01CodeOnly, { s: 'A', p: 'docs/reports/loop-records/inc1/round-03.json' }], classify),
    ).toEqual([]);
  });

  it('a MODIFIED record does not satisfy the gate', () => {
    expect(
      M.recordMissing([...d01CodeOnly, { s: 'M', p: 'docs/reports/loop-records/inc1/round-01.json' }], classify),
    ).toEqual(['record_missing']);
  });

  it('a record with a non-numeric round name does not satisfy the gate', () => {
    expect(
      M.recordMissing([...d01CodeOnly, { s: 'A', p: 'docs/reports/loop-records/inc1/round-x.json' }], classify),
    ).toEqual(['record_missing']);
  });

  it('an added hand-authored oracle file beside code still needs its record', () => {
    expect(
      M.recordMissing(
        [
          { s: 'A', p: 'src/tests/mcbylaws/loop/increment-1/expected-25.json' },
          { s: 'M', p: 'scripts/seeds/bylaw/vocab.json' },
        ],
        classify,
      ),
    ).toEqual(['record_missing']);
  });

  it('docs only without a record is green', () => {
    expect(M.recordMissing([{ s: 'M', p: 'docs/reference/bylaw-provisions.md' }], classify)).toEqual([]);
  });
});

describe('boundPaths', () => {
  it('keeps only the classified paths', () => {
    expect(
      M.boundPaths(
        [
          'scripts/seeds/bylaw/layer3-catalogue.json',
          'docs/reference/bylaw-provisions.md',
          'src/tests/fixtures/bylaw/eval-vocab.json',
          'mcbylaws/loop/regression-set.json',
        ],
        classify,
      ),
    ).toEqual([
      'scripts/seeds/bylaw/layer3-catalogue.json',
      'src/tests/fixtures/bylaw/eval-vocab.json',
      'mcbylaws/loop/regression-set.json',
    ]);
  });

  it('a docs-only list binds nothing', () => {
    expect(M.boundPaths(['docs/reference/bylaw-provisions.md'], classify)).toEqual([]);
  });
});

describe('genMatches', () => {
  it('a hand-edited pin differs from regeneration', () => {
    expect(M.genMatches({ MATCH: 401 }, { MATCH: 400 })).toEqual(['generated_not_regenerable']);
  });

  it('an identical regeneration is green', () => {
    expect(M.genMatches({ MATCH: 400 }, { MATCH: 400 })).toEqual([]);
  });

  it('key order matters (stringify equality, no normalisation)', () => {
    expect(M.genMatches({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual(['generated_not_regenerable']);
  });
});

describe('loadLayer23', () => {
  it('falls back to DEFAULT_LAYER23 when no protected-paths.json exists', () => {
    expect(M.loadLayer23(TMP)).toEqual(M.DEFAULT_LAYER23);
  });

  it('reads layer23 from mcbylaws/protected-paths.json when present', () => {
    const root = fs.mkdtempSync(path.join(TMP, 'with-layer23-'));
    fs.mkdirSync(path.join(root, 'mcbylaws'), { recursive: true });
    fs.writeFileSync(path.join(root, 'mcbylaws/protected-paths.json'), JSON.stringify({ layer23: ['src/lib/bylaw/**'] }));
    expect(M.loadLayer23(root)).toEqual(['src/lib/bylaw/**']);
  });

  it('ignores a file whose layer23 is not an array of strings', () => {
    const root = fs.mkdtempSync(path.join(TMP, 'bad-layer23-'));
    fs.mkdirSync(path.join(root, 'mcbylaws'), { recursive: true });
    fs.writeFileSync(path.join(root, 'mcbylaws/protected-paths.json'), JSON.stringify({ layer23: [1, 2] }));
    expect(M.loadLayer23(root)).toEqual(M.DEFAULT_LAYER23);
  });
});

describe('nameStatusOf', () => {
  it('parses modifies and adds (tab separated)', () => {
    const text = ['M\tscripts/seeds/bylaw/vocab.json', 'A\tdocs/reports/loop-records/inc1/round-01.json', ''].join('\n');
    expect(M.nameStatusOf(text)).toEqual([
      { s: 'M', p: 'scripts/seeds/bylaw/vocab.json' },
      { s: 'A', p: 'docs/reports/loop-records/inc1/round-01.json' },
    ]);
  });

  it('a rename yields BOTH paths with status R', () => {
    const text = 'R100\tsrc/tests/fixtures/bylaw/old.json\tsrc/tests/fixtures/bylaw/new.json\n';
    expect(M.nameStatusOf(text)).toEqual([
      { s: 'R', p: 'src/tests/fixtures/bylaw/old.json' },
      { s: 'R', p: 'src/tests/fixtures/bylaw/new.json' },
    ]);
  });

  it('ignores blank lines and returns [] for empty output', () => {
    expect(M.nameStatusOf('')).toEqual([]);
    expect(M.nameStatusOf('\n\n')).toEqual([]);
  });

  it('a rename of a hand-authored fixture beside code fires oracle-first', () => {
    const ns = M.nameStatusOf(
      'R100\tsrc/tests/fixtures/bylaw/old.json\tsrc/tests/fixtures/bylaw/new.json\nM\tscripts/seeds/bylaw/vocab.json\n',
    ) as NameStatus[];
    expect((M.checkOracleFirst([ns], classify) as string[]).length).toBe(1);
  });
});

describe('the REAL d01e1458 fixture', () => {
  it('has 31 entries and parses in the nameStatusOf shape', () => {
    expect(d01.length).toBe(31);
    expect(d01.every((x) => typeof x.s === 'string' && typeof x.p === 'string')).toBe(true);
  });

  it('is reproduced by nameStatusOf from git-style text', () => {
    const text = d01.map((x) => `${x.s}\t${x.p}`).join('\n') + '\n';
    expect(M.nameStatusOf(text)).toEqual(d01);
  });
});
