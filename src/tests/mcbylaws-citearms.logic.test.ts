// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy_appendix.md R-KV (task trailer), R-KG (OWED = blocked),
//            R-KH (cites a RULED rule), R-LE (RULED is a closed list); plan arm C (MB-67), checks CT1..CT11.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { parseMessage, parseOwedTable, parseRegisterRows } from '../../scripts/analysis/mcbylaws/cite-parse.mjs';
import { boot1Check, citeForCommit, PREREG_RE } from '../../scripts/analysis/mcbylaws/cite-arms.mjs';

const FIX = path.join(__dirname, 'fixtures/mcbylaws-gate');
const read = (n: string) => fs.readFileSync(path.join(FIX, n), 'utf8');
const PREREG_DIR = 'scripts/analysis/bylaw-validation/coa-expected';
const TABLE = ['| Rule | Line | Status |', '|---|---|---|',
  '| M-361 | m.361 | RULED 2026-10-21 · OWED |', '| M-376 | m.376 | APPLIED · OWED |', '| LC-15 | lc.15 | RULED · OWED |'];
const owed = parseOwedTable(['## 3. Rows with an OWED marker', ...TABLE].join('\n'));
const rows = parseRegisterRows(['| **M-180** | a | b | RULED |', '| **M-252** | a | b | RULED |',
  '| **M-385** | a | b | PROPOSED |', '| **M-400** | a | b | RETIRED |', '| **M-420** | a | b | ~~SUPERSEDED~~ |'].join('\n'));
const policy = { layer23: ['scripts/analysis/bylaw/**', 'scripts/analysis/bylaw-validation/**', 'scripts/seeds/bylaw/**', 'src/tests/**/bylaw*', 'scripts/lib/maxbld-*.js'],
  boot1: { tasks: ['MB-66', 'MB-67', 'MB-68'], exempt_ids: ['BOOT-1'] } };
const L2 = 'scripts/analysis/bylaw/evaluate.mjs';
const prereg = (task: string, rules: string[]) => JSON.stringify({ task, rules });
const entry = (p: string) => ({ status: 'M', score: null, path: p, oldPath: null });
const entriesOf = (fixture: string) => read(fixture).split('\n').filter(Boolean).map(entry);
const cite = (repo: Repo, message: string, files: Array<[string, string]> = [[L2, 'x']], extra = {}) =>
  citeForCommit({ cwd: repo.dir, policy, entries: files.map(([p]) => entry(p)), message, parentRev: 'HEAD',
    ownRev: '', owed, rows, ...extra });

let repo: Repo;
beforeAll(() => {
  repo = makeRepo();
  repo.write('base.txt', 'base');
  repo.commit('base');
  repo.write(`${PREREG_DIR}/prereg-t.json`, prereg('MB-18', ['M-252']));
  repo.write(`${PREREG_DIR}/prereg-u.json`, prereg('MB-19', ['M-180']));
  repo.write(`${PREREG_DIR}/prereg-b.json`, prereg('MB-67', ['BOOT-1']));
  repo.commit('preregs');
});
afterAll(() => repo.cleanup());

describe('CT1 / CT2 / CT7 — task trailer and prereg', () => {
  it('red: held and missing-trailer commits have no task', () => {
    const cases: Array<[string, string]> = [
      [read('msg-1d4b20d9.txt'), 'paths-1d4b20d9.txt'],
      [read('msg-41719d27.txt'), 'paths-41719d27.txt'],
    ];
    for (const [message, fixture] of cases) {
      expect(citeForCommit({ cwd: repo.dir, policy, entries: entriesOf(fixture), message, parentRev: 'HEAD',
        ownRev: '', owed, rows })).toEqual(['FAIL:C:no-task']);
    }
  });
  it('green: the same paths with a trailer and a committed prereg pass', () => {
    expect(cite(repo, `MB-18 commit attempt\n\nMcBylaws-Task: MB-18`, entriesOf('paths-1d4b20d9.txt').map((e) => [e.path, 'x']))).toEqual([]);
  });
  it('green: a sole-prereg commit without a trailer passes', () => {
    const p = `${PREREG_DIR}/prereg-t.json`;
    expect(cite(repo, 'prereg', [[p, prereg('MB-18', ['M-252'])]])).toEqual([]);
  });
  it('red: an empty rules[] or an index-only prereg is no rules', () => {
    repo.write(`${PREREG_DIR}/prereg-empty.json`, prereg('MB-20', []));
    repo.commit('empty prereg');
    const msg = 'McBylaws-Task: MB-20';
    expect(cite(repo, msg)).toEqual(['FAIL:C:no-rules']);
    repo.write(`${PREREG_DIR}/prereg-idx.json`, prereg('MB-21', ['M-180']));
    repo.stage(`${PREREG_DIR}/prereg-idx.json`);
    expect(cite(repo, 'McBylaws-Task: MB-21')).toEqual(['FAIL:C:no-rules']);
    repo.git(['rm', '--cached', '-q', `${PREREG_DIR}/prereg-idx.json`]);
    fs.rmSync(path.join(repo.dir, `${PREREG_DIR}/prereg-idx.json`));
  });
});

describe('CT3 / CT4 / CT5 / CT6 / CT10 / CT11 — cites and rules', () => {
  it('table', () => {
    const cases: Array<[string, string[]]> = [
      ['McBylaws-Task: MB-18\nM-180', ['FAIL:C:cite-not-in-rules:M-180']],
      ['McBylaws-Task: MB-18\nM-252', []],
      [`McBylaws-Task: MB-18\n${read('msg-93feac54.txt')}`, ['FAIL:C:owed:M-361']],
      ['McBylaws-Task: MB-18\nLC-15', ['FAIL:C:owed:LC-15']],
      ['McBylaws-Task: MB-18\nM-385', ['FAIL:C:cite-not-in-rules:M-385']],
      ['McBylaws-Task: MB-67\nBOOT-1', []],
    ];
    for (const [message, expected] of cases) expect(cite(repo, message), message).toEqual(expect.arrayContaining(expected));
    expect(cite(repo, 'McBylaws-Task: MB-18\nM-252')).toEqual([]);
  });
  it('a PROPOSED / RETIRED rule id is not ruled', () => {
    repo.write(`${PREREG_DIR}/prereg-p.json`, prereg('MB-22', ['M-385']));
    repo.write(`${PREREG_DIR}/prereg-r.json`, prereg('MB-23', ['M-400']));
    repo.commit('proposed and retired preregs');
    expect(cite(repo, 'McBylaws-Task: MB-22')).toEqual(['FAIL:C:not-ruled:M-385']);
    expect(cite(repo, 'McBylaws-Task: MB-23')).toEqual(['FAIL:C:not-ruled:M-400']);
    expect(citeForCommit({ cwd: repo.dir, policy, entries: [entry(L2)], message: 'McBylaws-Task: MB-18',
      parentRev: 'HEAD', ownRev: '', owed: new Set(), rows: new Map() })).toEqual(['FAIL:C:cannot-decide']);
  });
});

describe('CT8 — BOOT-1, and the gate-code twin', () => {
  it('a listed task may cite BOOT-1 on a Layer 2/3 path', () => {
    expect(cite(repo, 'McBylaws-Task: MB-67\nBOOT-1')).toEqual([]);
    expect(citeForCommit({ cwd: repo.dir, policy, entries: [entry(L2), entry(`${PREREG_DIR}/prereg-b.json`)],
      message: 'McBylaws-Task: MB-67\nBOOT-1', parentRev: 'HEAD', ownRev: 'abc', owed, rows })).toEqual([]);
  });
  it('an unlisted task citing BOOT-1 or O-1 is refused', () => {
    const msgs = ['McBylaws-Task: MB-70\nO-1', 'McBylaws-Task: MB-70\nBOOT-1'];
    for (const m of msgs) expect(cite(repo, m)).toEqual(['FAIL:C:boot1-not-allowed']);
  });
  it('a commit with no Layer 2/3 path is out of scope', () => {
    expect(cite(repo, 'McBylaws-Task: MB-70\nO-1', [['docs/reference/x.md', 'x']])).toEqual([]);
  });
});

describe('CT9 / misc — boot1Check, the prereg glob, never throws', () => {
  it('boot1Check', () => {
    const cases: Array<[object, boolean, string[]]> = [
      [policy, true, ['FAIL:C:boot1-open']],
      [policy, false, []],
      [{ boot1: { tasks: [], exempt_ids: [] } }, true, []],
    ];
    for (const [p, done, expected] of cases) expect(boot1Check(p, done)).toEqual(expected);
  });
  it('PREREG_RE anchors the directory', () => {
    expect(PREREG_RE.test(`${PREREG_DIR}/prereg-t.json`)).toBe(true);
    expect(PREREG_RE.test(`${PREREG_DIR}/other.json`)).toBe(false);
    expect(PREREG_RE.test(`x/${PREREG_DIR}/prereg-t.json`)).toBe(false);
  });
  it('a bad rev is cannot-decide, and sha is appended', () => {
    expect(cite(repo, 'McBylaws-Task: MB-18', [[L2, 'x']], { parentRev: 'nosuchrev' })).toEqual(['FAIL:C:cannot-decide']);
    expect(cite(repo, 'McBylaws-Task: MB-18\nM-180', [[L2, 'x']], { sha: 'abc' })).toEqual(['FAIL:C:cite-not-in-rules:M-180:abc']);
  });
  it('parseMessage seed', () => { expect(parseMessage(read('msg-1d4b20d9.txt')).task).toBeNull(); });
});
