// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan arm P, lines 81-85 (P1, P2);
//            R-KM (panel record), R-LC (the panel runs on a Layer 2/3 change).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { panelForCommit } from '../../scripts/analysis/mcbylaws/panel.mjs';
import { PREREG_RE } from '../../scripts/analysis/mcbylaws/cite-arms.mjs';
import { POLICY_PATH } from '../../scripts/analysis/mcbylaws/paths.mjs';

const FIX = path.join(__dirname, 'fixtures/mcbylaws-gate');
const read = (n: string) => fs.readFileSync(path.join(FIX, n), 'utf8');
const policy = {
  pending_globs: [], layer23: ['scripts/analysis/bylaw/**', 'scripts/analysis/bylaw-validation/**',
    'scripts/seeds/bylaw/**', 'src/tests/**/bylaw*', 'docs/reference/bylaw*'],
  protected: ['mcbylaws/APPROVED'], literal_scope: [], literal_exempt: [], held_dirs: [], worktrees: [],
  held_limit: 1, boot1: { tasks: ['MB-67'], exempt_ids: ['BOOT-1'] }, external_arms: [],
};
const L2 = 'scripts/analysis/bylaw/evaluate.mjs';
const PREREG = 'scripts/analysis/bylaw-validation/coa-expected/prereg-t.json';
const MSG = 'fix(69a): MB-18 commit attempt\n\nMcBylaws-Task: MB-18\n';
const NO_TASK = 'fix(69a): MB-18 commit attempt\n';
const entry = (p: string) => ({ status: 'M', score: null, path: p, oldPath: null });
const entriesOf = (fixture: string) => read(fixture).split('\n').filter(Boolean).map(entry);
const record = (task: string, plan = 'plan text', output = 'output text') => JSON.stringify({ task, plan, output });
const recordPath = (task: string) => `docs/reports/panels/${task}.json`;
const run = (repo: Repo, message: string, files: string[] = [L2], extra = {}) =>
  panelForCommit({ cwd: repo.dir, policy, entries: files.map(entry), message, ownRev: '', ...extra });

let repo: Repo;
beforeAll(() => {
  repo = makeRepo();
  repo.write(POLICY_PATH, JSON.stringify(policy));
  repo.write('base.txt', 'base');
  repo.commit('base');
});
afterAll(() => repo.cleanup());

describe('P1 — a Layer 2/3 commit needs docs/reports/panels/<task>.json in its own tree', () => {
  it('red: the fixture commit without a panel record', () => {
    expect(run(repo, MSG, entriesOf('paths-1d4b20d9.txt').map((e) => e.path))).toEqual(['FAIL:P:no-record']);
  });
  it('red: a message with no task trailer', () => {
    expect(run(repo, NO_TASK)).toEqual(['FAIL:P:no-record']);
  });
  it('green: a committed valid record passes (ownRev = the commit sha)', () => {
    repo.write(recordPath('MB-18'), record('MB-18'));
    const sha = repo.commit('panel');
    expect(run(repo, MSG, [L2], { ownRev: sha, sha })).toEqual([]);
    expect(run(repo, MSG, [L2], { ownRev: sha })).toEqual([]);
  });
  it('green: a staged valid record passes (ownRev = "")', () => {
    repo.write(recordPath('MB-19'), record('MB-19'));
    repo.stage(recordPath('MB-19'));
    expect(run(repo, 'McBylaws-Task: MB-19\n')).toEqual([]);
    repo.git(['rm', '--cached', '-q', recordPath('MB-19')]);
  });
});

describe('P2 — the record must be valid and name the task', () => {
  it.each([
    ['invalid JSON', '{not json'],
    ['a wrong task', record('MB-17')],
    ['an empty output', record('MB-18', 'plan text', '')],
    ['an empty plan', record('MB-18', '', 'output text')],
  ])('red: %s', (_label, body) => {
    repo.write(recordPath('MB-18'), body);
    repo.commit('bad record');
    expect(run(repo, MSG)).toEqual(['FAIL:P:bad-record']);
  });
});

describe('P — scope, exemption and the sha suffix', () => {
  it('green: a commit with no Layer 2/3 path needs no record', () => {
    expect(run(repo, NO_TASK, ['docs/readme.md'])).toEqual([]);
  });
  it('green: a sole-prereg commit is exempt even with no record', () => {
    expect(PREREG_RE.test(PREREG)).toBe(true);
    expect(run(repo, 'prereg only\n', [PREREG])).toEqual([]);
  });
  it('red: two Layer 2/3 paths are never the sole-prereg exemption', () => {
    expect(run(repo, 'prereg only\n', [PREREG, L2])).toEqual(['FAIL:P:no-record']);
  });
  it('appends :sha to a verdict when a sha is given', () => {
    repo.write(recordPath('MB-18'), record('MB-17'));
    const sha = repo.commit('bad again');
    expect(run(repo, MSG, [L2], { ownRev: sha, sha })).toEqual([`FAIL:P:bad-record:${sha}`]);
  });
  it('fails closed on an unreadable change list, never throws', () => {
    expect(panelForCommit({ cwd: repo.dir, policy, entries: null as never, message: MSG, ownRev: '' }))
      .toEqual(['FAIL:P:cannot-decide']);
  });
});
