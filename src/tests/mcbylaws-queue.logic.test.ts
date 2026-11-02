// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan arm Q (lines 132-140),
//            R-KK (the queue is a witness) and R-KW (the queue names a landed commit).
//
// Q1 a DONE entry `MB-nn@sha` must exist and be an ancestor of the tip; Q2 a heading carries exactly one status word
// (derived READY is never hand-written); Q3 a DONE entry must carry `@sha`; Q4 `.cursor/MCBYLAWS-QUEUE.md` is tracked
// at the cited rev; Q5 READY is only consistent when every WAITS id is DONE. Red first, temp repos via makeRepo().

import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import * as q from '../../scripts/analysis/mcbylaws/mcbylaws-queue-check.mjs';

const FIX = path.resolve(__dirname, 'fixtures/mcbylaws-gate');
const QUEUE = '.cursor/MCBYLAWS-QUEUE.md';
const read = (f: string) => fs.readFileSync(path.join(FIX, f), 'utf8');
const repos: Repo[] = [];
afterEach(() => {
  for (const r of repos.splice(0)) r.cleanup();
});

describe('Q1 missingCommitErrors', () => {
  it('red for an unknown sha, green for an ancestor, red for a side branch (MB-79 (q) T-q1)', () => {
    const r = makeRepo();
    repos.push(r);
    r.write('a.txt', 'a\n');
    const base = r.commit('base');
    r.write('b.txt', 'b\n');
    const tip = r.commit('tip');
    r.git(['checkout', '-q', '-b', 'side', base]);
    r.write('c.txt', 'c\n');
    const side = r.commit('side');
    r.git(['checkout', '-q', '-']);
    const rows: [string, string[]][] = [
      ['- MB-99@deadbeef', ['FAIL:Q:missing-commit:MB-99']],
      [`- MB-01@${tip}`, []],
      [`- MB-01@${tip.slice(0, 7)}`, []],
      [`- MB-01@${side}`, ['FAIL:Q:not-on-branch:MB-01']],
      ['- MB-02 no sha, nothing to judge', []],
    ];
    for (const [text, expected] of rows) expect(q.missingCommitErrors({ cwd: r.dir, text, tipRev: tip })).toEqual(expected);
  });
  it('T-q2..T-q4 (MB-79 (q)): one line per sha, short ancestors pass, an undecidable tip never passes', () => {
    const r = makeRepo();
    repos.push(r);
    r.write('a.txt', 'a\n');
    const base = r.commit('base');
    r.write('b.txt', 'b\n');
    const tip = r.commit('tip');
    r.git(['checkout', '-q', '-b', 'side', base]);
    r.write('c.txt', 'c\n');
    r.commit('side');
    r.git(['checkout', '-q', '-']);
    // T-q2: an unknown sha yields exactly one line, never a second one for the same id.
    expect(q.missingCommitErrors({ cwd: r.dir, text: '- MB-99@deadbeef', tipRev: tip })).toEqual(['FAIL:Q:missing-commit:MB-99']);
    // T-q3: the short sha of an ancestor is on the branch.
    expect(q.missingCommitErrors({ cwd: r.dir, text: `- MB-01@${base.slice(0, 7)}`, tipRev: tip })).toEqual([]);
    // T-q4: a tip that does not resolve can never pass.
    expect(q.missingCommitErrors({ cwd: r.dir, text: `- MB-01@${tip}`, tipRev: 'refs/heads/nope' })).toEqual(['FAIL:Q:cannot-decide']);
  });
  it('a repo that cannot run git fails closed as missing-commit', () => {
    expect(q.missingCommitErrors({ cwd: '/nonexistent-mb67', text: '- MB-01@abc1234', tipRev: 'HEAD' })).toEqual([
      'FAIL:Q:missing-commit:MB-01',
    ]);
  });
});

describe('Q2 statusWordErrors', () => {
  it('table', () => {
    const rows: [string, string[]][] = [
      [read('queue-line-MB58-v2.txt'), ['FAIL:Q:status-words:MB-58']],
      ['**MB-58 Notice parser: never carry an applicant\'s name - DONE** (M)', []],
      ['**MB-67 The commit gate ... - WAITS MB-66, OPERATOR (O-3)** (G)', []],
      ['**MB-67 The commit gate ... - WAITS MB-66, HELD** (G)', ['FAIL:Q:status-words:MB-67']],
      // Ruled 2026-11-02 (CARD-mb73-q2-row75 option 1; O67-15 (c)): one reader reads the rest of the line.
      ['**MB-67 The commit gate ... - LATER** (G) **MB-68 x - READY** (M)', ['FAIL:Q:status-words:MB-67']],
      ['**MB-58 - nothing here** (M)\n- MB-01@abc1234', []],
      // O67-15 (b): a heading without a separator fails, even with a legal word.
      ['**MB-5 READY**', ['FAIL:Q:status-words:MB-5']],
      ['**MB-5 DONE**', ['FAIL:Q:status-words:MB-5']],
      ['**MB-5 Title - READY**', ['FAIL:Q:status-words:MB-5']],
    ];
    for (const [text, expected] of rows) expect(q.statusWordErrors(text)).toEqual(expected);
  });
});

describe('headingBody, one grammar (O67-15 c)', () => {
  it('returns {n, body|null}; Q2, Q3 and Q5 read headings through it', () => {
    expect(q.headingBody('**MB-5 READY**')).toEqual({ n: '5', body: null });
    expect(q.headingBody('**MB-7 T - DONE** (M) MB-7@abc1234')).toEqual({
      n: '7',
      body: 'DONE** (M) MB-7@abc1234',
    });
    expect(q.headingBody('**MB-7 T — LATER**')).toEqual({ n: '7', body: 'LATER**' });
    expect(q.headingBody('  **MB-8 x - WAITS**')?.n).toBe('8');
    expect(q.headingBody('- MB-01@abc1234')).toBeNull();
  });
  it('an indented heading is judged by Q3 too; Q3 keeps its no-separator reading', () => {
    expect(q.doneWithoutCommitErrors('  **MB-07 T - DONE** (M)')).toEqual([
      'FAIL:Q:done-without-commit:MB-07',
    ]);
    expect(q.doneWithoutCommitErrors('**MB-07 DONE**')).toEqual(['FAIL:Q:done-without-commit:MB-07']);
  });
});

describe('Q3 doneWithoutCommitErrors', () => {
  it('table', () => {
    const rows: [string, string[]][] = [
      ['- MB-01, MB-02', ['FAIL:Q:done-without-commit:MB-01', 'FAIL:Q:done-without-commit:MB-02']],
      ['- MB-01@abc1234', []],
      ['**MB-07 Title words - DONE** (M)', ['FAIL:Q:done-without-commit:MB-07']],
      ['**MB-07 Title words - DONE** (M) MB-07@abc1234', []],
      [read('queue-line-MB58-v2.txt'), []],
    ];
    for (const [text, expected] of rows) expect(q.doneWithoutCommitErrors(text)).toEqual(expected);
  });
});

describe('Q4 queueTrackedErrors', () => {
  it('untracked then tracked', () => {
    const r = makeRepo();
    repos.push(r);
    r.write('a.txt', 'a\n');
    const before = r.commit('no queue');
    expect(q.queueTrackedErrors({ cwd: r.dir, rev: before })).toEqual(['FAIL:Q:queue-untracked']);
    r.write(QUEUE, '- MB-01@abc1234\n');
    const after = r.commit('queue');
    expect(q.queueTrackedErrors({ cwd: r.dir, rev: after })).toEqual([]);
  });
});

describe('Q5 readyDerivedErrors', () => {
  it('red when a WAITS id is not DONE, green when it is', () => {
    const red = [
      '**MB-10 Ready one - READY** (M) WAITS MB-09',
      '**MB-09 Other - RUNNING** (M)',
    ].join('\n');
    const green = [
      '**MB-10 Ready one - READY** (M) WAITS MB-09',
      '**MB-09 Other - DONE** (M) MB-09@abc1234',
    ].join('\n');
    expect(q.readyDerivedErrors(red)).toEqual(['FAIL:Q:ready-derived']);
    expect(q.readyDerivedErrors(green)).toEqual([]);
    expect(q.readyDerivedErrors(read('queue-line-MB58-v2.txt'))).toEqual([]);
  });
});

describe('queueCheck end to end', () => {
  it('clean queue passes; untracked queue gives only Q4', () => {
    const r = makeRepo();
    repos.push(r);
    r.write('a.txt', 'a\n');
    const first = r.commit('base');
    const clean = `**MB-01 Done one - DONE** (M) MB-01@${first}\n\n- MB-01@${first}\n`;
    r.write(QUEUE, clean);
    const tip = r.commit('queue');
    expect(q.queueCheck({ cwd: r.dir, rev: tip })).toEqual([]);
    r.git(['rm', '-q', '--cached', QUEUE]);
    r.git(['commit', '-q', '-m', 'drop queue']);
    const dropped = r.git(['rev-parse', 'HEAD']);
    expect(q.queueCheck({ cwd: r.dir, rev: dropped })).toEqual(['FAIL:Q:queue-untracked']);
  });
});
