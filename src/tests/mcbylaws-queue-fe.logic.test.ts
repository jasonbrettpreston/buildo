// SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md §4.11 item 7 (arm Q done-condition, MF-34);
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md rules 2 and 3.
//
// MF-34: arm Q refuses a DONE MF task that DECLARES an OWED Spec 135 row. A DONE heading's block holds one
// `- FE rows owned: none.` or `- FE rows owned: FE-nn, FE-mm.` line. Red first: docs/reports/red-evidence/MF-34/red.txt.
import { describe, expect, it } from 'vitest';
import { makeRepo } from './fixtures/mcbylaws-gate/repo-helper';
import { doneFeOwnedErrors, queueCheck, FE_REGISTER, MF_QUEUE_PATH } from '../../scripts/analysis/mcbylaws/mcbylaws-queue-check.mjs';

const row = (id: string, status: string) => `| ${id} | text | spec | n/a | verbatim | ${status} |`;
const REG = (rows: Record<string, string>) => `# 135\n\n${Object.entries(rows).map(([i, s]) => row(i, s)).join('\n')}\n`;
const DEFAULT_REG = REG({ 'FE-01': 'RULED', 'FE-18': 'RULED', 'FE-27': 'RULED', 'FE-24': 'OWED x', 'FE-02': 'OWED y', 'FE-30': 'RULED' });
const SHA = 'abcdef1';
const D = (n: string, decl: string | null, status = `DONE (MF-${n}@${SHA})`) =>
  `**MF-${n} Task — ${status}** (R)\n${decl === null ? '' : `  - FE rows owned: ${decl}\n`}`;
const Q = (...blocks: string[]) => `# q\n\n${blocks.join('')}\n`;

/** Run doneFeOwnedErrors in a fixture repo that holds `reg` (or no Spec 135 when null). */
function run(text: string, reg: string | null = DEFAULT_REG): string[] {
  const r = makeRepo();
  try {
    r.write('a.txt', 'a\n');
    if (reg !== null) r.write(FE_REGISTER, reg);
    r.commit('base');
    return doneFeOwnedErrors({ cwd: r.dir, rev: 'HEAD', text });
  } finally {
    r.cleanup();
  }
}

describe('MF-34 arm Q: a DONE task that declares an OWED FE row fails', () => {
  it('P1 an OWED owned row refuses; a RULED one is clean', () => {
    expect(run(Q(D('10', 'FE-18.')), REG({ 'FE-01': 'RULED', 'FE-18': 'OWED x' }))).toEqual(['FAIL:Q:done-fe-owed:MF-10:FE-18']);
    expect(run(Q(D('10', 'FE-18.')))).toEqual([]);
  });

  it('P2 own rows only: other OWED rows in the register never count', () => {
    expect(run(Q(D('13', 'FE-30.')))).toEqual([]);
  });

  it('P3 LATER/RUNNING/WAITS are not judged; a LATER title containing DONE is not judged', () => {
    const t = Q(D('10', 'FE-24.', 'LATER'), D('11', 'FE-24.', 'RUNNING'), D('12', 'FE-24.', 'WAITS MF-10'),
      '**MF-24 Gate DONE flip — RUNNING** (R)\n', '**MF-34 Arm Q DONE-condition — LATER** (R)\n');
    expect(run(t)).toEqual([]);
  });

  it('P4 declaration forms; a line under a following ## section does not count', () => {
    expect(run(Q(D('01', 'none.')))).toEqual([]);
    expect(run(Q(D('01', 'FE-18, FE-27.')))).toEqual([]);
    expect(run(Q(D('01', null)))).toEqual(['FAIL:Q:done-fe-undeclared:MF-01']);
    expect(run(Q(D('01', 'none.') + '  - FE rows owned: none.\n'))).toEqual(['FAIL:Q:done-fe-undeclared:MF-01']);
    expect(run(Q(D('01', 'FE-1x.')))).toEqual(['FAIL:Q:done-fe-undeclared:MF-01']);
    expect(run(Q(D('01', 'FE-18,FE-27.')))).toEqual(['FAIL:Q:done-fe-undeclared:MF-01']);
    expect(run(Q(D('01', 'none (rows are rulings).')))).toEqual(['FAIL:Q:done-fe-undeclared:MF-01']);
    const after = Q(D('09', null), '## Phase 1: the page\n', '  - FE rows owned: none.\n');
    expect(run(after)).toEqual(['FAIL:Q:done-fe-undeclared:MF-09']);
  });

  it('P5 an id absent from Spec 135 (also a mis-padded id) is unknown', () => {
    expect(run(Q(D('10', 'FE-99.')))).toEqual(['FAIL:Q:done-fe-unknown:MF-10:FE-99']);
    expect(run(Q(D('10', 'FE-8.')))).toEqual(['FAIL:Q:done-fe-unknown:MF-10:FE-8']);
  });

  it('P6 lazy read and the pinned fixture', () => {
    const r = makeRepo();
    try {
      r.write('.cursor/MCBYLAWS-QUEUE.md', '# mb\n');
      r.write('a.txt', 'a\n');
      const sha = r.commit('base');
      const head = (n: string, mark: string) => `**MF-${n} T — DONE (MF-${n}@${mark})** (R)\n`;
      const decl = '  - FE rows owned: none.\n';
      const opts = { cwd: r.dir, rev: 'HEAD', queuePath: MF_QUEUE_PATH, prefix: 'MF' };
      // (a) the edited mcbylaws-frontend.logic.test.ts fixture: no Spec 135 in the repo, the old assertion stands.
      r.write(MF_QUEUE_PATH, Q(head('01', sha.slice(0, 9)) + decl, head('02', 'deadbeef1') + decl));
      r.commit('q a');
      expect(queueCheck(opts)).toEqual(['FAIL:Q:missing-commit:MF-02']);
      // (b) the unedited form: two undeclared lines follow missing-commit.
      r.write(MF_QUEUE_PATH, Q(head('01', sha.slice(0, 9)), head('02', 'deadbeef1')));
      r.commit('q b');
      expect(queueCheck(opts)).toEqual(['FAIL:Q:missing-commit:MF-02', 'FAIL:Q:done-fe-undeclared:MF-01', 'FAIL:Q:done-fe-undeclared:MF-02']);
      // (c) an owned id and no Spec 135: cannot-decide only.
      r.write(MF_QUEUE_PATH, Q(head('01', sha.slice(0, 9)) + '  - FE rows owned: FE-18.\n'));
      r.commit('q c');
      expect(queueCheck(opts)).toEqual(['FAIL:Q:cannot-decide']);
    } finally {
      r.cleanup();
    }
  });

  it('P6c Spec 135 without its own FE-01, or an unresolvable rev, is cannot-decide', () => {
    expect(run(Q(D('10', 'FE-18.')), REG({ 'FE-18': 'RULED' }))).toEqual(['FAIL:Q:cannot-decide']);
    expect(run(Q(D('10', 'FE-18.')), null)).toEqual(['FAIL:Q:cannot-decide']);
    expect(doneFeOwnedErrors({ cwd: '/nonexistent-mf34', rev: 'HEAD', text: Q(D('10', 'FE-18.')) })).toEqual(['FAIL:Q:cannot-decide']);
    expect(doneFeOwnedErrors({ text: null })).toEqual(['FAIL:Q:cannot-decide']);
  });

  it('P7 a decorated OWED cell reads OWED; a struck row is RETIRED and passes', () => {
    expect(run(Q(D('10', 'FE-18.')), REG({ 'FE-01': 'RULED', 'FE-18': 'RULED date. **OWED:** x' }))).toEqual(['FAIL:Q:done-fe-owed:MF-10:FE-18']);
    const struck = `# 135\n\n${row('FE-01', 'RULED')}\n| ~~**FE-18**~~ | t | s | n/a | v | RETIRED |\n`;
    expect(run(Q(D('10', 'FE-18.')), struck)).toEqual([]);
  });

  it('P8 identity: the MB queue is never judged by Q6, default or prefix MB', () => {
    const r = makeRepo();
    try {
      r.write('a.txt', 'a\n');
      const sha = r.commit('base');
      r.write('.cursor/MCBYLAWS-QUEUE.md', `# mb\n\n**MB-01 x — DONE (MB-01@${sha.slice(0, 9)})** (R)\n`);
      r.commit('mb');
      expect(queueCheck({ cwd: r.dir, rev: 'HEAD' })).toEqual([]);
      expect(queueCheck({ cwd: r.dir, rev: 'HEAD', prefix: 'MB' })).toEqual([]);
    } finally {
      r.cleanup();
    }
  });

  it('P9 two defects give two lines in numeric task order, then row (MF-2 before MF-10)', () => {
    const t = Q(D('10', 'FE-18.'), D('2', 'FE-27, FE-18.'), D('3', null));
    const reg = REG({ 'FE-01': 'RULED', 'FE-18': 'OWED a', 'FE-27': 'OWED b' });
    expect(run(t, reg)).toEqual([
      'FAIL:Q:done-fe-owed:MF-2:FE-18',
      'FAIL:Q:done-fe-owed:MF-2:FE-27',
      'FAIL:Q:done-fe-undeclared:MF-3',
      'FAIL:Q:done-fe-owed:MF-10:FE-18',
    ]);
  });
});
