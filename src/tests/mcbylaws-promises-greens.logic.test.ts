// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-73 plan sections 3 and 4); R-KQ, R-KU, R-LG, K4a, K6, FV-2, FV2-1.
// Every case builds a temp repo with one artifact, one red record and one green record, then judges the greens.

import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { bindRecord } from '../../scripts/analysis/mcbylaws-loop/loop-record.mjs';
import { blobsFor } from '../../scripts/analysis/mcbylaws-promises/promise-record.mjs';
import { identityHash } from '../../scripts/analysis/mcbylaws-promises/promise-register.mjs';
import { greenLines, readRecord } from '../../scripts/analysis/mcbylaws-promises/promise-greens.mjs';

const ART = 't.test.mjs';
const GREEN_P = 'mcbylaws/promises/green/R-1.json';
const RED_P = 'mcbylaws/promises/red/R-1.json';
const GOPTS = '/gopts';
const ROW = { id: 'R-1', file: 'docs/specs/x.md', quoted_line: 'the promise' };
const ENTRY = { artifact: ART, test_name: 'suite does it' };
const RUN = { passed: 1, failed: 0, skipped: 0, total: 1 };
const PASSED = { 'R-1': { state: 'passed', fullName: ENTRY.test_name } };

type Rec = Record<string, unknown>;

type Over = {
  artifactText?: string;
  row?: Record<string, unknown>;
  entry?: Record<string, unknown>;
  red?: Record<string, unknown> | null;
  green?: Record<string, unknown> | null;
  redPatch?: (r: Rec) => Rec;
  greenPatch?: (g: Rec) => Rec;
  afterBind?: (g: Rec) => Rec;
  notify?: string;
};

let repo: Repo;
afterEach(() => repo && repo.cleanup());

function build(over: Over = {}) {
  repo = makeRepo();
  repo.write(ART, "import { it, expect } from 'vitest';\nit('does it', () => { expect(1).toBe(1); });\n");
  repo.write('docs/specs/x.md', `## R-1 — the promise\n\n> ${ROW.quoted_line}\n`);
  repo.write('README.md', '# fixture\n');
  const base = repo.commit('base');
  const row = { ...ROW, ...(over.row || {}) };
  const entry = { ...ENTRY, ...(over.entry || {}) };
  const blobs0 = blobsFor(repo.dir, 'HEAD', [ART]) as Record<string, string>;
  const artifact_blob = blobs0[ART];
  let red = over.red === undefined ? { schema: 'promise-red-v1', id: 'R-1', artifact: entry.artifact,
    test_name: entry.test_name, artifact_blob, commit: base, run: RUN } : over.red;
  let green = over.green === undefined ? { schema: 'promise-green-v1', id: 'R-1', artifact: entry.artifact,
    test_name: entry.test_name, artifact_blob, red_of: artifact_blob, identity_sha: identityHash(ROW, ENTRY),
    inputs: { [ART]: artifact_blob }, commit: base, run: RUN } : over.green;
  red = red === null ? null : bindRecord(over.redPatch ? over.redPatch(red as Rec) : red);
  green = green === null ? null : bindRecord(over.greenPatch ? over.greenPatch(green as Rec) : green);
  if (green && over.afterBind) green = over.afterBind(green as Rec);
  if (red) repo.write(RED_P, `${JSON.stringify(red)}\n`);
  if (green) repo.write(GREEN_P, `${JSON.stringify(green)}\n`);
  repo.write('records.txt', 'x\n');
  repo.commit('records');
  if (over.notify) {
    repo.write(ART, over.artifactText || "import { it, expect } from 'vitest';\nit('does it', () => { expect(2).toBe(2); });\n");
    repo.commit(over.notify);
  }
  const call = (matches: Record<string, unknown> = PASSED) =>
    greenLines({ cwd: repo.dir, rev: 'HEAD', rows: [row], artifacts: { 'R-1': entry }, matches }) as
      { lines: string[]; states: Record<string, string> };
  return { repo, red, green, call };
}

describe('greenLines', () => {
  const cases: [string, Over, string, string[], string][] = [
    ['F-P10 happy path', {}, 'done', [], 'passed'],
    ['no green and no red -> not-green, red', { green: null, red: null }, 'red', ['FAIL:R:not-green:R-1'], 'passed'],
    ['no green but a red -> work in progress', { green: null }, 'not yet', ['FAIL:R:not-green:R-1'], 'passed'],
    ['green with no red -> no-red-first', { red: null }, 'red', ['FAIL:R:no-red-first:R-1'], 'passed'],
    ['red_of is another blob -> no-red-first', { greenPatch: (g) => ({ ...g, red_of: 'a'.repeat(40) }) }, 'red',
      ['FAIL:R:no-red-first:R-1'], 'passed'],
    ['red test_name swapped -> no-red-first', { red: { schema: 'promise-red-v1', id: 'R-1', artifact: ART,
      test_name: 'other test', artifact_blob: 'b'.repeat(40), commit: 'x', run: RUN } }, 'red',
      ['FAIL:R:no-red-first:R-1'], 'passed'],
    ['red artifact differs -> no-red-first', { red: { schema: 'promise-red-v1', id: 'R-1', artifact: 'other.test.mjs',
      test_name: ENTRY.test_name, artifact_blob: 'b'.repeat(40), commit: 'x', run: RUN } }, 'red',
      ['FAIL:R:no-red-first:R-1'], 'passed'],
    ['artifact edited after the green -> stale-green once', { notify: 'edit artifact' }, 'red',
      ['FAIL:R:stale-green:R-1'], 'passed'],
    ['green input blob changed -> stale-green', { greenPatch: (g) => ({ ...g, inputs: { [ART]: 'c'.repeat(40) } }) },
      'red', ['FAIL:R:stale-green:R-1'], 'passed'],
    ['identity from another quoted_line -> stale-green', { row: { quoted_line: 'changed' } }, 'red',
      ['FAIL:R:stale-green:R-1'], 'passed'],
    ['hand-edited green -> record-rewritten', { afterBind: (g) => ({ ...g, commit: 'edited-by-hand' }) }, 'red',
      [`FAIL:R:record-rewritten:${GREEN_P}`], 'passed'],
    ['run failed -> not-green', {}, 'red', ['FAIL:R:not-green:R-1'], 'failed'],
    ['run skipped -> empty-test', {}, 'red', ['FAIL:R:empty-test:R-1'], 'skipped'],
    ['run missing -> not-green', {}, 'red', ['FAIL:R:not-green:R-1'], 'missing'],
  ];
  it.each(cases)('%s', (_name, over, state, lines, runState) => {
    const b = build(over);
    const call = (matches?: Record<string, unknown>) => b.call(matches);
    const res = call({ 'R-1': { state: runState, fullName: ENTRY.test_name } });
    expect(res.states['R-1']).toBe(state);
    expect(res.lines).toStrictEqual(lines);
  });

  it('skips a row with no artifacts entry and emits no line', () => {
    const b = build();
    const res = greenLines({ cwd: b.repo.dir, rev: 'HEAD', rows: [ROW], artifacts: {}, matches: PASSED }) as
      { lines: string[]; states: Record<string, string> };
    expect(res.states['R-1']).toBe('red');
    expect(res.lines).toStrictEqual([]);
  });

  it('reports cannot-decide for an unparseable record and marks the row red', () => {
    const b = build({ green: null });
    b.repo.write(GREEN_P, '{not json');
    b.repo.commit('broken');
    const res = b.call();
    expect(res.states['R-1']).toBe('red');
    expect(res.lines).toStrictEqual([`FAIL:R:cannot-decide:record:${GREEN_P}`]);
  });
});

describe('readRecord', () => {
  it('returns nulls when the record is absent', () => {
    const b = build({ green: null, red: null });
    expect(readRecord(b.repo.dir, GOPTS, 'green', 'R-1')).toStrictEqual({ rec: null, line: null });
  });
  it('reads a bound record and flags an unparseable one', () => {
    const b = build();
    const got = readRecord(b.repo.dir, 'HEAD', 'green', 'R-1') as
      { rec: { id?: string } | null; line: string | null };
    expect(got.line).toBeNull();
    expect(got.rec?.id).toBe('R-1');
    b.repo.write(RED_P, '[]');
    b.repo.commit('array');
    expect(readRecord(b.repo.dir, 'HEAD', 'red', 'R-1')).toStrictEqual({ rec: null, line: `FAIL:R:cannot-decide:record:${RED_P}` });
  });
});
