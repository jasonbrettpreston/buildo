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
  it('red for an unknown sha, green for an ancestor, red for a side branch', () => {
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
      [`- MB-01@${side}`, []],
      ['- MB-02 no sha, nothing to judge', []],
    ];
    for (const [text, expected] of rows) expect(q.missingCommitErrors({ cwd: r.dir, text, tipRev: tip })).toEqual(expected);
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
      ['**MB-67 The commit gate ... - LATER** (G) **MB-68 x - READY** (M)', []],
      ['**MB-58 - nothing here** (M)\n- MB-01@abc1234', []],
    ];
    for (const [text, expected] of rows) expect(q.statusWordErrors(text)).toEqual(expected);
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
