// SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md §4.11 items 1-5 and 7 (MF-17 early gate batch, MF-24a);
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-01, FE-13; opening decision list D-1..D-9
//            (operator "yes. proceed", 2026-11-06): D-2 b, a separate `frontend` policy list that arms H, C, P and Q read
//            and the McBylaws loop gate does not.
//
// The McFrontend arms beside the McBylaws gate. Every McBylaws verdict for an MB-trailer commit is unchanged (the existing
// src/tests/mcbylaws-*.test.ts files pin it, unedited); this file adds the frontend judgement and identity checks where the
// change touches MB code paths that no existing test pins. Red first: docs/reports/red-evidence/MF-17/.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { classify, deadGlobs, isFrontend, validatePolicy } from '../../scripts/analysis/mcbylaws/paths.mjs';
import { parseFrontendMessage, parseMessage, parseOwedTable, parseRegisterRows } from '../../scripts/analysis/mcbylaws/cite-parse.mjs';
import { citeForCommit } from '../../scripts/analysis/mcbylaws/cite-arms.mjs';
import { panelForCommit } from '../../scripts/analysis/mcbylaws/panel.mjs';
import { holdForCommit, deadGlobLines } from '../../scripts/analysis/mcbylaws/hold.mjs';
import { parseFrontendPreregName, parsePreregName } from '../../scripts/analysis/mcbylaws/prereg-name.mjs';
import * as q from '../../scripts/analysis/mcbylaws/mcbylaws-queue-check.mjs';
import { hooksPathVerdict, readRealHooksPath } from './hooks-path-guard.global';

const REAL_ROOT = path.resolve(__dirname, '../..');
const GATE = path.join(REAL_ROOT, 'scripts/analysis/mcbylaws/gate.mjs');
const PREREG_DIR = 'scripts/analysis/bylaw-validation/coa-expected';
const L2 = 'scripts/analysis/bylaw/evaluate.mjs';
const SURF = 'scripts/surfaces/_schema/features.json';
const MF_QUEUE = '.cursor/MCFRONTEND-QUEUE.md';

const base = {
  pending_globs: [], layer23: ['scripts/analysis/bylaw/**', 'scripts/analysis/bylaw-validation/**'], protected: [],
  literal_scope: [], literal_exempt: [], held_dirs: [], worktrees: [], held_limit: 12,
  boot1: { tasks: ['MB-67'], exempt_ids: ['BOOT-1'] }, external_arms: [],
};
const fe = { ...base, frontend: ['scripts/surfaces/**', 'src/lib/surfaces/**'] };

const OWED_TABLE = ['## 3. Rows with an OWED marker', '| Rule | Line | Status |', '|---|---|---|',
  '| M-361 | m.361 | RULED · OWED |', '| LC-15 | lc.15 | RULED · OWED |'].join('\n');
const REG = ['| **M-180** | a | b | RULED |', '| **M-252** | a | b | RULED |'].join('\n');
const REG135 = [
  '| FE-01 | r | 126 | n/a | t | OWED `src/tests/surfaces/mcfrontend-status.infra.test.ts` (lock) |',
  '| FE-02 | r | 126 | D | t | OWED `src/tests/surfaces/report-generated-only.infra.test.ts` |',
  '| FE-13 | r | 128 | n/a | t | RULED 2026-11-04. Lock: see FE-01. |',
].join('\n');
const owed = parseOwedTable(OWED_TABLE);
const rows = parseRegisterRows(REG);
const feRows = new Map([...rows, ...parseRegisterRows(REG135)]);
const entry = (p: string, status = 'M') => ({ status, score: null, path: p, oldPath: null });
const MF = (body = '') => `feat(128_surface_standard_policy): x\n\n${body}\nMcFrontend-Task: MF-10\n`;

afterAll(() => expect(hooksPathVerdict(readRealHooksPath(REAL_ROOT), process.env.CI === 'true')).toBeNull());

describe('paths: the optional frontend list (D-2 b)', () => {
  it('absent is valid and reads as no frontend path; present must be an array of valid globs', () => {
    expect(validatePolicy(base).ok).toBe(true);
    expect(validatePolicy(fe).ok).toBe(true);
    expect(validatePolicy({ ...base, frontend: [''] }).ok).toBe(false);
    expect(validatePolicy({ ...base, frontend: 'scripts/surfaces/**' }).ok).toBe(false);
    expect(validatePolicy({ ...base, frontend: ['scripts/surfaces/'] }).ok).toBe(false);
    expect(isFrontend(base, SURF)).toBe(false);
    expect(isFrontend(fe, SURF)).toBe(true);
    expect(isFrontend(fe, L2)).toBe(false);
  });
  it('identity: classify keeps its four keys and never reads frontend', () => {
    expect(Object.keys(classify(fe, SURF)).sort()).toEqual(['layer23', 'literalExempt', 'literalScope', 'protected']);
    expect(classify(fe, SURF).layer23).toBe(false);
    expect(classify(fe, L2)).toEqual(classify(base, L2));
  });
  it('a dead frontend glob is linted unless pending; no frontend key changes nothing', () => {
    const dead = { ...fe, frontend: ['scripts/surfaces/**', 'src/tests/surfaces/**'] };
    expect(deadGlobs(dead, [SURF, L2, 'scripts/analysis/bylaw-validation/x.json'])).toEqual([{ list: 'frontend', glob: 'src/tests/surfaces/**' }]);
    expect(deadGlobLines(dead, [SURF, L2, 'scripts/analysis/bylaw-validation/x.json'])).toEqual(['FAIL:H:dead-glob:src/tests/surfaces/**']);
    expect(deadGlobs({ ...dead, pending_globs: ['src/tests/surfaces/**'] }, [SURF, L2, 'scripts/analysis/bylaw-validation/x.json'])).toEqual([]);
    expect(deadGlobs(base, [L2, 'scripts/analysis/bylaw-validation/x.json'])).toEqual([]);
  });
});

describe('cite-parse and prereg-name: item 4 trailer and FE ids, item 5 MF prereg form', () => {
  it('the McFrontend parse reads MF-n and FE-n; the McBylaws parse is unchanged', () => {
    const msg = 'x FE-13 and FE-02, M-252\n\nMcFrontend-Task: MF-10\n';
    expect(parseFrontendMessage(msg)).toEqual({ task: 'MF-10', ids: ['FE-02', 'FE-13', 'M-252'], usesBoot1: false });
    expect(parseMessage(msg)).toEqual({ task: null, ids: ['M-252'], usesBoot1: false });
    expect(parseFrontendMessage('McBylaws-Task: MB-27\n').task).toBeNull();
    expect(parseMessage('FE-02\n\nMcBylaws-Task: MB-27\n')).toEqual({ task: 'MB-27', ids: [], usesBoot1: false });
  });
  it('MF prereg names are read by the frontend parser only; the shared MB parser (the loop imports it) is unchanged', () => {
    expect(parseFrontendPreregName(`${PREREG_DIR}/prereg-MF-10-1.json`)).toEqual({ task: 'MF-10', k: 1 });
    expect(parseFrontendPreregName(`${PREREG_DIR}/prereg-MF-10-01.json`)).toBeNull();
    expect(parseFrontendPreregName(`${PREREG_DIR}/prereg-MB-10-1.json`)).toBeNull();
    expect(parsePreregName(`${PREREG_DIR}/prereg-MF-10-1.json`)).toBeNull();
    expect(parsePreregName(`${PREREG_DIR}/prereg-MB-10-1.json`)).toEqual({ task: 'MB-10', k: 1 });
  });
});

describe('arm C: the frontend judgement (items 1-5)', () => {
  let repo: Repo;
  beforeAll(() => {
    repo = makeRepo();
    repo.write('base.txt', 'base');
    repo.commit('base');
    repo.write(`${PREREG_DIR}/prereg-MB-18-1.json`, JSON.stringify({ task: 'MB-18', rules: ['M-252'] }));
    repo.write(`${PREREG_DIR}/prereg-MF-10-1.json`, JSON.stringify({ task: 'MF-10', rules: ['FE-13'] }));
    repo.write(`${PREREG_DIR}/prereg-MF-10-2.json`, JSON.stringify({ task: 'MF-10', rules: ['FE-13', 'FE-02'] }));
    repo.write(`${PREREG_DIR}/prereg-MF-11-1.json`, JSON.stringify({ task: 'MF-12', rules: ['FE-13'] }));
    repo.write(`${PREREG_DIR}/prereg-MF-12-1.json`, JSON.stringify({ task: 'MF-12', rules: ['FE-02'] }));
    repo.commit('preregs');
  });
  afterAll(() => repo.cleanup());
  const cite = (message: string, files: Array<string | { status: string, path: string }> = [SURF], extra = {}) =>
    citeForCommit({ cwd: repo.dir, policy: fe, entries: files.map((f) => (typeof f === 'string' ? entry(f) : { score: null, oldPath: null, ...f })),
      message, parentRev: 'HEAD', ownRev: '', owed, rows, feRows, ...extra });

  it('red: a surface path with no trailer, or with only a McBylaws trailer (finding 3), has no MF task', () => {
    expect(cite('feat: x\n')).toEqual(['FAIL:C:no-mf-task']);
    expect(cite('feat: x M-252\n\nMcBylaws-Task: MB-18\n')).toEqual(['FAIL:C:no-mf-task']);
  });
  it('the newest MF prereg wins (k=2 lists the OWED FE-02, so the rules are not all RULED)', () => {
    expect(cite(MF('FE-13'))).toEqual(['FAIL:C:not-ruled:FE-02']);
    expect(cite('x FE-13\n\nMcFrontend-Task: MF-10\n')).toEqual(['FAIL:C:not-ruled:FE-02']);
  });
  it('red: a commit citing an OWED FE row is refused (MF-17 done-condition); its lock plus red evidence lands it', () => {
    expect(cite('x FE-02\n\nMcFrontend-Task: MF-12\n')).toEqual(['FAIL:C:not-ruled:FE-02', 'FAIL:C:owed:FE-02']);
    const landed = [SURF, { status: 'A', path: 'src/tests/surfaces/report-generated-only.infra.test.ts' },
      { status: 'A', path: 'docs/reports/red-evidence/MF-12/red.txt' }];
    expect(cite('x FE-02\n\nMcFrontend-Task: MF-12\n', landed)).toEqual([]);
  });
  it('green: the newest prereg of a task whose rules are all RULED, cites in rules', () => {
    repo.write(`${PREREG_DIR}/prereg-MF-13-1.json`, JSON.stringify({ task: 'MF-13', rules: ['FE-13'] }));
    repo.commit('MF-13 prereg');
    expect(cite('x FE-13\n\nMcFrontend-Task: MF-13\n')).toEqual([]);
    expect(cite('x FE-01\n\nMcFrontend-Task: MF-13\n')).toEqual(['FAIL:C:owed:FE-01']);
    expect(cite('x M-252\n\nMcFrontend-Task: MF-13\n')).toEqual(['FAIL:C:cite-not-in-rules:M-252']);
  });
  it('red: no prereg, an index-only prereg, a task mismatch, BOOT-1', () => {
    expect(cite('x\n\nMcFrontend-Task: MF-14\n')).toEqual(['FAIL:C:no-rules']);
    repo.write(`${PREREG_DIR}/prereg-MF-15-1.json`, JSON.stringify({ task: 'MF-15', rules: ['FE-13'] }));
    repo.stage(`${PREREG_DIR}/prereg-MF-15-1.json`);
    expect(cite('x\n\nMcFrontend-Task: MF-15\n')).toEqual(['FAIL:C:no-rules']);
    repo.git(['rm', '--cached', '-q', `${PREREG_DIR}/prereg-MF-15-1.json`]);
    fs.rmSync(path.join(repo.dir, `${PREREG_DIR}/prereg-MF-15-1.json`));
    expect(cite('x\n\nMcFrontend-Task: MF-11\n')).toEqual([`FAIL:C:prereg-task-mismatch:${PREREG_DIR}/prereg-MF-11-1.json`]);
    expect(cite('x BOOT-1\n\nMcFrontend-Task: MF-13\n')).toEqual(['FAIL:C:boot1-not-allowed']);
    expect(cite('x FE-13, held since O-1 APPROVED\n\nMcFrontend-Task: MF-13\n')).toEqual([]);
  });
  it('fail closed: no feRows (Spec 135 unread), or a 135 parse without FE-01, is cannot-decide', () => {
    expect(cite(MF(), [SURF], { feRows: undefined })).toEqual(['FAIL:C:cannot-decide']);
    expect(cite(MF(), [SURF], { feRows: rows })).toEqual(['FAIL:C:cannot-decide']);
    expect(cite(MF(), [SURF], { owed: new Set() })).toEqual(['FAIL:C:cannot-decide']);
  });
  it('mixed: a layer23 path and a surface path need both judgements; an MF trailer never passes a layer23 path', () => {
    expect(cite('x FE-13\n\nMcFrontend-Task: MF-13\n', [L2, SURF])).toEqual(['FAIL:C:no-task']);
    expect(cite('x FE-13 M-252\n\nMcBylaws-Task: MB-18\nMcFrontend-Task: MF-13\n', [L2, SURF]))
      .toEqual(['FAIL:C:cite-not-in-rules:M-252']);
    expect(cite('x FE-13\n\nMcBylaws-Task: MB-18\nMcFrontend-Task: MF-13\n', [L2, SURF])).toEqual([]);
    expect(cite('x M-252\n\nMcFrontend-Task: MF-13\n', [L2])).toEqual(['FAIL:C:no-task']);
  });
  it('an MF prereg added alone is the R-LE(a) bootstrap; added beside a surface path the frontend judgement still runs', () => {
    const p = { status: 'A', path: `${PREREG_DIR}/prereg-MF-16-1.json` };
    repo.write(p.path, JSON.stringify({ task: 'MF-16', rules: ['FE-13'] }));
    repo.stage(p.path);
    expect(cite('prereg\n\nMcFrontend-Task: MF-16\n', [p])).toEqual([]);
    expect(cite('prereg\n\nMcFrontend-Task: MF-16\n', [p, SURF])).toEqual(['FAIL:C:no-rules']);
    repo.git(['rm', '--cached', '-q', p.path]);
    fs.rmSync(path.join(repo.dir, p.path));
  });
  it('red (security lens): a new prereg plus a surface path under an MB trailer cannot use the R-LE(a) bootstrap', () => {
    const p = { status: 'A', path: `${PREREG_DIR}/prereg-MF-99-1.json` };
    repo.write(p.path, JSON.stringify({ task: 'MF-99', rules: ['FE-13'] }));
    repo.stage(p.path);
    expect(cite('x\n\nMcBylaws-Task: MB-27\n', [p, SURF])).toEqual(['FAIL:C:no-mf-task']);
    repo.git(['rm', '--cached', '-q', p.path]);
    fs.rmSync(path.join(repo.dir, p.path));
  });
  it('red: an MF prereg off the name form (leading zero) is never a rules source (no legacy fallback for MF)', () => {
    repo.write(`${PREREG_DIR}/prereg-MF-20-01.json`, JSON.stringify({ task: 'MF-20', rules: ['FE-13'] }));
    repo.commit('MF-20 off-form prereg');
    expect(cite('x FE-13\n\nMcFrontend-Task: MF-20\n')).toEqual(['FAIL:C:no-rules']);
  });
  it('identity: with no frontend path the result is the McBylaws result, feRows never read', () => {
    const mb = 'x M-252\n\nMcBylaws-Task: MB-18\n';
    const without = citeForCommit({ cwd: repo.dir, policy: base, entries: [entry(L2)], message: mb, parentRev: 'HEAD', ownRev: '', owed, rows });
    expect(cite(mb, [L2], { feRows: undefined })).toEqual(without);
    expect(without).toEqual([]);
    expect(cite('docs\n', ['docs/x.md'], { feRows: undefined })).toEqual([]);
  });
});

describe('arm P and arm H on surface paths', () => {
  let repo: Repo;
  beforeAll(() => {
    repo = makeRepo();
    repo.write('mcbylaws/protected-paths.json', JSON.stringify(fe));
    repo.write('docs/reports/panels/MB-18.json', JSON.stringify({ task: 'MB-18', plan: 'p', output: 'o' }));
    repo.commit('base');
  });
  afterAll(() => repo.cleanup());
  const panel = (message: string, files = [SURF], policy: object = fe) =>
    panelForCommit({ cwd: repo.dir, policy, entries: files.map((f) => entry(f)), message, ownRev: '' });

  it('red: no MF task or only an MB record is no-record; green with the MF record in the own tree', () => {
    expect(panel('x\n')).toEqual(['FAIL:P:no-record']);
    expect(panel('x\n\nMcBylaws-Task: MB-18\n')).toEqual(['FAIL:P:no-record']);
    expect(panel(MF())).toEqual(['FAIL:P:no-record']);
    repo.write('docs/reports/panels/MF-10.json', JSON.stringify({ task: 'MF-10', plan: 'p', output: '' }));
    repo.stage('docs/reports/panels/MF-10.json');
    expect(panel(MF())).toEqual(['FAIL:P:bad-record']);
    repo.write('docs/reports/panels/MF-10.json', JSON.stringify({ task: 'MF-10', plan: 'p', output: 'o' }));
    repo.stage('docs/reports/panels/MF-10.json');
    expect(panel(MF())).toEqual([]);
  });
  it('mixed paths need both records; identity for MB-only paths', () => {
    expect(panel('x\n\nMcBylaws-Task: MB-18\nMcFrontend-Task: MF-10\n', [L2, SURF])).toEqual([]);
    expect(panel(MF(), [L2, SURF])).toEqual(['FAIL:P:no-record']);
    expect(panel('x\n\nMcBylaws-Task: MB-18\n', [L2])).toEqual(panel('x\n\nMcBylaws-Task: MB-18\n', [L2], base));
  });
  it('fail closed: the own tree has no frontend list while the base has one', () => {
    repo.write('mcbylaws/protected-paths.json', JSON.stringify(base));
    repo.stage('mcbylaws/protected-paths.json');
    expect(panel(MF())).toEqual(['FAIL:P:cannot-decide']);
    repo.write('mcbylaws/protected-paths.json', JSON.stringify(fe));
    repo.stage('mcbylaws/protected-paths.json');
  });
  it('arm H holds a surface path behind APPROVED', () => {
    expect(holdForCommit({ cwd: repo.dir, policy: fe, entries: [entry(SURF)], parentRev: 'HEAD' })).toEqual(['FAIL:H:no-approved']);
    expect(holdForCommit({ cwd: repo.dir, policy: base, entries: [entry(SURF)], parentRev: 'HEAD' })).toEqual([]);
  });
});

describe('arm Q parameterised (MF-24a)', () => {
  const MFQ = (s: string) => `# q\n\n${s}\n`;
  it('the MF prefix reads MF headings and MF-nn@sha; the MB defaults are unchanged', () => {
    const text = MFQ('**MF-01 One — DONE (MF-01@abcdef1)** (R)\n**MF-02 Two — DONE** (R)\n**MF-03 Three — LATER WAITS** (G)\n**MB-04 x — DONE** (R)');
    expect(q.statusWordErrors(text, { prefix: 'MF' })).toEqual(['FAIL:Q:status-words:MF-03']);
    expect(q.doneWithoutCommitErrors(text, { prefix: 'MF' })).toEqual(['FAIL:Q:done-without-commit:MF-02']);
    expect(q.doneWithoutCommitErrors(text)).toEqual(['FAIL:Q:done-without-commit:MB-04']);
    expect(q.statusWordErrors(text)).toEqual([]);
    expect(q.MF_QUEUE_PATH).toBe(MF_QUEUE);
    expect(q.QUEUE_PATH).toBe('.cursor/MCBYLAWS-QUEUE.md');
  });
  it('queueCheck with the MF options reads the MF file; untracked names the file', () => {
    const r = makeRepo();
    try {
      r.write('.cursor/MCBYLAWS-QUEUE.md', '# mb\n');
      r.write('a.txt', 'a\n');
      const sha = r.commit('base');
      expect(q.queueCheck({ cwd: r.dir, rev: 'HEAD', queuePath: MF_QUEUE, prefix: 'MF' })).toEqual([`FAIL:Q:queue-untracked:${MF_QUEUE}`]);
      expect(q.queueCheck({ cwd: r.dir, rev: 'HEAD' })).toEqual([]);
      r.write(MF_QUEUE, MFQ(`**MF-01 One — DONE (MF-01@${sha.slice(0, 9)})** (R)\n  - FE rows owned: none.\n**MF-02 Two — DONE (MF-02@deadbeef1)** (R)\n  - FE rows owned: none.`));
      r.commit('mf queue');
      expect(q.queueCheck({ cwd: r.dir, rev: 'HEAD', queuePath: MF_QUEUE, prefix: 'MF' })).toEqual(['FAIL:Q:missing-commit:MF-02']);
    } finally {
      r.cleanup();
    }
  });
  it('the real McFrontend queue is in the heading form arm Q reads, every DONE on this branch', () => {
    const text = fs.readFileSync(path.join(REAL_ROOT, MF_QUEUE), 'utf8');
    expect(text.split('\n').filter((l) => q.headingBody(l, { prefix: 'MF' })).length).toBeGreaterThanOrEqual(30);
    expect(q.statusWordErrors(text, { prefix: 'MF' })).toEqual([]);
    expect(q.doneWithoutCommitErrors(text, { prefix: 'MF' })).toEqual([]);
    expect(q.readyDerivedErrors(text, { prefix: 'MF' })).toEqual([]);
    expect(q.missingCommitErrors({ cwd: REAL_ROOT, text, tipRev: 'HEAD', prefix: 'MF' })).toEqual([]);
  });
});

describe('gate CLI: a surface commit end to end (fixture repo)', () => {
  const env = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null', HUSKY: '0' }) as unknown as NodeJS.ProcessEnv;
  const gate = (repo: Repo, args: string[]) => {
    const r = spawnSync(process.execPath, [GATE, ...args], { cwd: repo.dir, encoding: 'utf8', timeout: 60_000, env: env() });
    return { status: r.status, out: String(r.stdout) };
  };
  const seed = (repo: Repo, policy: object) => {
    repo.write('mcbylaws/protected-paths.json', JSON.stringify(policy, null, 2));
    repo.write('.cursor/MCBYLAWS-QUEUE.md', '# mb\n');
    repo.write('docs/specs/01-pipeline/133_bylaw_handbook.md', `${OWED_TABLE}\n`);
    repo.write('docs/specs/01-pipeline/69a_mcbylaw_register.md', `${REG}\n`);
    repo.write('docs/specs/01-pipeline/124a_step_standard_policy_appendix.md', '# 124a\n');
    repo.write('docs/specs/01-pipeline/131_lot_configuration_policy.md', '# 131\n');
    repo.write('docs/specs/02-web-admin/135_mcfrontend_decisions_register.md', `${REG135}\n`);
    repo.write(SURF, '{}\n');
    repo.write('src/lib/surfaces/generated/x.ts', 'export const x = 0;\n');
    repo.write(L2, 'export const e = 0;\n');
    repo.write('scripts/analysis/bylaw-validation/keep.json', '{}\n');
    repo.commit('seed');
    repo.write('mcbylaws/APPROVED', 'O-1 APPROVED 2026-10-30\n');
    repo.commit('approved');
  };
  it('red without APPROVED; green with MF trailer, MF prereg and MF record; red with an MB trailer', () => {
    const red = makeRepo();
    try {
      red.write('mcbylaws/protected-paths.json', JSON.stringify(fe, null, 2));
      red.write(SURF, '{}\n');
      red.commit('seed');
      red.write(SURF, '{"a":1}\n');
      red.stage(SURF);
      const r = gate(red, ['--staged']);
      expect(r.out).toContain('FAIL:H:no-approved');
      expect(r.status).toBe(1);
    } finally {
      red.cleanup();
    }
    const repo = makeRepo();
    try {
      seed(repo, fe);
      repo.write(`${PREREG_DIR}/prereg-MF-10-1.json`, JSON.stringify({ task: 'MF-10', rules: ['FE-13'] }));
      repo.commit('prereg');
      repo.write(SURF, '{"a":1}\n');
      repo.write('docs/reports/panels/MF-10.json', JSON.stringify({ task: 'MF-10', plan: 'p', output: 'o' }));
      repo.stage(SURF, 'docs/reports/panels/MF-10.json');
      expect(gate(repo, ['--staged']).out).toContain('GATE OK');
      repo.write('.git/COMMIT_EDITMSG', 'feat: x FE-13\n\nMcFrontend-Task: MF-10\n');
      const ok = gate(repo, ['--commit-msg', '.git/COMMIT_EDITMSG']);
      expect(ok.out).toContain('GATE OK');
      expect(ok.status).toBe(0);
      repo.write('.git/COMMIT_EDITMSG', 'feat: x M-252\n\nMcBylaws-Task: MB-27\n');
      const mb = gate(repo, ['--commit-msg', '.git/COMMIT_EDITMSG']);
      expect(mb.out).toContain('FAIL:C:no-mf-task');
      expect(mb.out).toContain('FAIL:P:no-record');
      expect(mb.status).toBe(1);
    } finally {
      repo.cleanup();
    }
  });
});

describe('gate CLI identity: MB commits and MB-only ranges', () => {
  const DRIVER = path.join(REAL_ROOT, 'src/tests/fixtures/mcbylaws-gate/gate-driver.mjs');
  const env = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null', HUSKY: '0' }) as unknown as NodeJS.ProcessEnv;
  const ci = (repo: Repo, baseSha: string, boot: string) => {
    const r = spawnSync(process.execPath, [DRIVER, GATE, boot, 'real', '--ci', '--base', baseSha], { cwd: repo.dir, encoding: 'utf8', timeout: 60_000, env: env() });
    return String(r.stdout);
  };
  const commitMsg = (repo: Repo, msg: string) => {
    repo.write('.git/COMMIT_EDITMSG', msg);
    const r = spawnSync(process.execPath, [GATE, '--commit-msg', '.git/COMMIT_EDITMSG'], { cwd: repo.dir, encoding: 'utf8', timeout: 60_000, env: env() });
    return String(r.stdout);
  };
  it('OUTPUT panel fold: the FE sentinel is read from Spec 135 alone (an FE-01 row elsewhere does not stand in for it)', () => {
    const repo = makeRepo();
    try {
      repo.write('mcbylaws/protected-paths.json', JSON.stringify(fe, null, 2));
      repo.write('docs/specs/01-pipeline/133_bylaw_handbook.md', `${OWED_TABLE}\n`);
      repo.write('docs/specs/01-pipeline/69a_mcbylaw_register.md', `${REG}\n| FE-01 | stray | x | n/a | t | RULED |\n| FE-13 | stray | x | n/a | t | RULED |\n`);
      repo.write('docs/specs/01-pipeline/124a_step_standard_policy_appendix.md', '# 124a\n');
      repo.write('docs/specs/01-pipeline/131_lot_configuration_policy.md', '# 131\n');
      repo.write('docs/specs/02-web-admin/135_mcfrontend_decisions_register.md', '| FE-13 | r | 128 | n/a | t | RULED 2026-11-04 |\n');
      repo.write(SURF, '{}\n');
      repo.write('src/lib/surfaces/generated/x.ts', 'export const x = 0;\n');
      repo.write(`${PREREG_DIR}/prereg-MF-10-1.json`, JSON.stringify({ task: 'MF-10', rules: ['FE-13'] }));
      repo.commit('seed: 135 without FE-01');
      repo.write('mcbylaws/APPROVED', 'O-1 APPROVED 2026-10-30\n');
      repo.commit('approved');
      repo.write(SURF, '{"a":1}\n');
      repo.write('docs/reports/panels/MF-10.json', JSON.stringify({ task: 'MF-10', plan: 'p', output: 'o' }));
      repo.stage(SURF, 'docs/reports/panels/MF-10.json');
      const out = commitMsg(repo, 'feat: x FE-13\n\nMcFrontend-Task: MF-10\n');
      expect(out).toContain('FAIL:C:cannot-decide');
      expect(out).toContain('GATE FAIL');
    } finally {
      repo.cleanup();
    }
  });
  it('an MB commit at a rev without Spec 135 is judged as today (GATE OK), with or without a frontend list', () => {
    for (const policy of [base, fe]) {
      const repo = makeRepo();
      try {
        repo.write('mcbylaws/protected-paths.json', JSON.stringify(policy, null, 2));
        repo.write('docs/specs/01-pipeline/133_bylaw_handbook.md', `${OWED_TABLE}\n`);
        repo.write('docs/specs/01-pipeline/69a_mcbylaw_register.md', `${REG}\n`);
        repo.write('docs/specs/01-pipeline/124a_step_standard_policy_appendix.md', '# 124a\n');
        repo.write('docs/specs/01-pipeline/131_lot_configuration_policy.md', '# 131\n');
        repo.write(SURF, '{}\n');
        repo.write(L2, 'export const e = 0;\n');
        repo.write(`${PREREG_DIR}/prereg-MB-18-1.json`, JSON.stringify({ task: 'MB-18', rules: ['M-252'] }));
        repo.commit('seed');
        repo.write('mcbylaws/APPROVED', 'O-1 APPROVED 2026-10-30\n');
        repo.commit('approved');
        repo.write(L2, 'export const e = 1;\n');
        repo.write('docs/reports/panels/MB-18.json', JSON.stringify({ task: 'MB-18', plan: 'p', output: 'o' }));
        repo.stage(L2, 'docs/reports/panels/MB-18.json');
        const out = commitMsg(repo, 'fix: x M-252\n\nMcBylaws-Task: MB-18\n');
        expect(out).toContain('GATE OK');
        expect(out).not.toContain('FAIL:');
      } finally {
        repo.cleanup();
      }
    }
  });
  it('the MF queue is judged only for a range that touches a frontend path or the MF queue', () => {
    const repo = makeRepo();
    try {
      repo.write('.cursor/MCBYLAWS-QUEUE.md', '# mb\n');
      repo.write('mcbylaws/protected-paths.json', JSON.stringify(fe, null, 2));
      repo.write(SURF, '{}\n');
      repo.write('a.txt', 'a\n');
      const root = repo.commit('seed');
      repo.write('b.txt', 'b\n');
      repo.commit('docs only');
      const mbOnly = ci(repo, root, root);
      expect(mbOnly).not.toContain('MCFRONTEND-QUEUE');
      repo.write('docs/c.md', 'c\n');
      const mid = repo.commit('docs');
      repo.write('src/lib/surfaces/x.ts', 'export const x = 1;\n');
      repo.commit('surface');
      expect(ci(repo, mid, root)).toContain(`FAIL:Q:queue-untracked:${MF_QUEUE}`);
      // OUTPUT panel fold: a rename OUT of a surface glob still counts as touching it (both sides of the rename).
      const before = repo.git(['rev-parse', 'HEAD']);
      repo.git(['mv', SURF, 'docs/features.json']);
      repo.commit('move a surface file out');
      expect(ci(repo, before, root)).toContain(`FAIL:Q:queue-untracked:${MF_QUEUE}`);
      // OUTPUT panel fold: a tip policy that parses but is not valid is read as touching (the MF queue is judged).
      const pre = repo.git(['rev-parse', 'HEAD']);
      repo.write('mcbylaws/protected-paths.json', JSON.stringify({ ...fe, frontend: 'scripts/surfaces/**' }, null, 2));
      repo.commit('a malformed tip policy');
      expect(ci(repo, pre, root)).toContain(`FAIL:Q:queue-untracked:${MF_QUEUE}`);
    } finally {
      repo.cleanup();
    }
  });
});

describe('C2, the policy flip on the REAL policy (Spec 128 §4.11 item 6; D-2 b, D-4 a): both directions', () => {
  const real = JSON.parse(fs.readFileSync(path.join(REAL_ROOT, 'mcbylaws/protected-paths.json'), 'utf8'));
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: REAL_ROOT, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  it('the surface globs are frontend, never layer23; by-law code is never frontend', () => {
    expect(validatePolicy(real).ok).toBe(true);
    for (const p of [SURF, 'src/lib/surfaces/generated/x.ts', 'src/tests/surfaces/mcfrontend-status.infra.test.ts']) {
      expect(isFrontend(real, p)).toBe(true);
      expect(classify(real, p).layer23).toBe(false);
    }
    for (const p of [L2, 'scripts/seeds/bylaw/switchboard.json', 'src/app/page.tsx', 'docs/specs/02-web-admin/135_mcfrontend_decisions_register.md']) {
      expect(isFrontend(real, p)).toBe(false);
    }
  });
  // MF-42 (P42-D4 a, owner sign-off, McBylaws-Task MB-67): src/tests/surfaces/** holds tracked locks, so it left pending_globs; the case below keeps
  // a stale frontend pending entry from recurring. Prior assertion (2942704dc): `expect(real.pending_globs).toContain('src/tests/surfaces/**')`.
  it('Spec 135, the golden dir and the McFrontend queue are protected; the surface test dir is not pending (it holds tracked locks); no glob is dead', () => {
    for (const p of ['docs/specs/02-web-admin/135_mcfrontend_decisions_register.md', 'src/tests/fixtures/surfaces/report/web.json', MF_QUEUE, '.cursor/MCBYLAWS-QUEUE.md']) {
      expect(classify(real, p).protected).toBe(true);
    }
    expect(classify(real, SURF).protected).toBe(false);
    expect(real.pending_globs).not.toContain('src/tests/surfaces/**');
    expect(deadGlobLines(real, tracked)).toEqual([]);
  });
  // A frontend glob in pending_globs that already matches a tracked path is stale: pending means "no tracked file yet" (2942704dc).
  const stalePending = (policy: typeof real, files: string[]): string[] => policy.pending_globs
    .filter((g: string) => (policy.frontend ?? []).includes(g))
    .filter((g: string) => files.some((p) => isFrontend({ ...policy, frontend: [g] }, p)))
    .map((g: string) => `remove from pending: ${g}`);
  it('MF-42: no glob in pending AND frontend matches a tracked path; a stale one is named; McBylaws pending globs are not judged here', () => {
    expect(stalePending(real, tracked)).toEqual([]);
    const planted = { ...real, pending_globs: [...real.pending_globs, 'src/tests/surfaces/**'] };
    expect(stalePending(planted, tracked)).toEqual(['remove from pending: src/tests/surfaces/**']);
    // control: a McBylaws pending glob (not frontend) that matches a tracked path is outside this check
    const mb = { ...real, pending_globs: [...real.pending_globs, 'scripts/analysis/bylaw/**'] };
    expect(stalePending(mb, tracked)).toEqual([]);
    expect(real.pending_globs).toEqual(expect.arrayContaining(['scripts/lib/compute/bylaw-*.js', 'scripts/lib/compute/maxbld-*.js']));
  });
  it('MF-42: the binding homes, the vendor dir, the RNR config, the MaxBLD web pages and the golden dir are frontend; the vendor dir and the three standards data files are protected', () => {
    for (const p of ['src/tests/fixtures/surfaces/admin_media/hit.web.json', 'src/tests/fixtures/surfaces/report/web.json', 'src/components/surfaces/web/FormBinding.tsx', 'mobile/src/components/surfaces/ListBinding.tsx',
      'mobile/src/vendor/rnr/button.tsx', 'mobile/components.json', 'src/app/(maxbld)/admin/media/page.tsx']) {
      expect(isFrontend(real, p), p).toBe(true);
      expect(classify(real, p).layer23).toBe(false);
    }
    for (const p of ['mobile/src/vendor/rnr/button.tsx', 'scripts/surfaces/_schema/bindings.json', 'scripts/surfaces/_schema/converted-surfaces.json', 'scripts/surfaces/_schema/vendor-rnr.manifest.json']) {
      expect(classify(real, p).protected, p).toBe(true);
    }
    // MB-67 owner commit 2026-11-09 (MF-37 lane; operator "a, 1-3 approved"): src/components/surfaces/** and src/app/(maxbld)/** left pending when MF-37
    // landed the first tracked files under both; they stay frontend. Prior form: all five globs were asserted in pending_globs.
    // MB-67 owner commit 2026-11-10 (MF-35 lane; plan v3 section 10 step 4): mobile/src/vendor/rnr/** and mobile/components.json left pending when
    // the MF-35 library commit tracked the vendored parts and the CLI config; they stay frontend. Prior form: both were asserted in pending_globs.
    for (const g of ['mobile/src/components/surfaces/**']) {
      expect(real.pending_globs, g).toContain(g);
    }
    for (const g of ['src/components/surfaces/**', 'src/app/(maxbld)/**', 'mobile/src/vendor/rnr/**', 'mobile/components.json']) {
      expect(real.pending_globs, g).not.toContain(g);
      expect(real.frontend, g).toContain(g);
    }
    expect(isFrontend(real, 'src/app/page.tsx')).toBe(false);
  });
  it('the McBylaws loop gate does not classify a surface path (it reads layer23 only)', async () => {
    const { makeClassifier, loadLayer23 } = await import('../../scripts/analysis/mcbylaws-loop/loop-oracle.mjs');
    const loop = makeClassifier(loadLayer23(REAL_ROOT));
    expect(loop(SURF)).toBeNull();
    expect(loop('src/lib/surfaces/generated/x.ts')).toBeNull();
    expect(loop(L2)).toBe('code');
  });
});
