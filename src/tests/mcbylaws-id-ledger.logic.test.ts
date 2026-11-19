// SPEC LINK: docs/specs/00-architecture/08_agents.md MCINC-8 (one ID ledger, M-515); docs/specs/00-architecture/137_mcqueue.md §2 notes
//            (the "Next free id" line is the one tools read; the ID ledger itself is LOCAL and never read by a hook).
// CHK.7 (task-4, lane BL-CHK7): every id a staged diff INTRODUCES (a new queue heading, a new migrations/NNN file) has a repo
// claim (its number is below the queue's "Next free id", or a queue row names the migration) and no number repeats.
// Red first: idLedgerErrors does not exist yet. Prose, dated notes and fenced lines are never read as introduced ids.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { parseNameStatusZ } from '../../scripts/analysis/mcbylaws/name-status.mjs';
import * as q from '../../scripts/analysis/mcbylaws/mcbylaws-queue-check.mjs';

const MB = '.cursor/MCBYLAWS-QUEUE.md';
const MF = '.cursor/MCFRONTEND-QUEUE.md';
const GATE = path.resolve(__dirname, '../../scripts/analysis/mcbylaws/gate.mjs');
const repos: Repo[] = [];
afterEach(() => {
  for (const r of repos.splice(0)) r.cleanup();
});

const head = (next: number, rows = '') =>
  `# Queue\n\nA task not listed here is not done. Next free id: **MB-${next}** (ids are never reused).\n\n${rows}`;
const row = (n: number) => `**MB-${n} A task - LATER** (M)\n`;

/** A repo whose HEAD holds `files`; returns it ready for staged edits. */
function base(files: Record<string, string>): Repo {
  const r = makeRepo();
  repos.push(r);
  r.write('README.md', 'x\n');
  for (const [f, t] of Object.entries(files)) r.write(f, t);
  r.commit('base');
  return r;
}
function ids(r: Repo): string[] {
  const raw = spawnSync('git', ['diff', '--cached', '--name-status', '-z', '-M'], { cwd: r.dir, encoding: 'utf8' }).stdout;
  const entries = parseNameStatusZ(raw);
  return q.idLedgerErrors({ cwd: r.dir, entries });
}

describe('CHK.7 idLedgerErrors: queue headings', () => {
  it('a new row below the Next free id passes; at or above it fails, naming the id and the file', () => {
    const r = base({ [MB]: head(5, row(1) + row(2)) });
    r.write(MB, head(5, row(1) + row(2) + row(4)));
    r.stage(MB);
    expect(ids(r)).toEqual([]);
    r.write(MB, head(5, row(1) + row(2) + row(5)));
    r.stage(MB);
    expect(ids(r)).toEqual([`FAIL:Q:id-unclaimed:MB-5:${MB}`]);
    r.write(MB, head(6, row(1) + row(2) + row(5)));
    r.stage(MB);
    expect(ids(r)).toEqual([]);
  });
  it('a repeated number fails, whether it repeats an old row or two new rows', () => {
    const r = base({ [MB]: head(5, row(1) + row(2)) });
    r.write(MB, head(5, row(1) + row(2) + row(2)));
    r.stage(MB);
    expect(ids(r)).toEqual([`FAIL:Q:id-duplicate:MB-2:${MB}`]);
    r.write(MB, head(5, row(1) + row(2) + row(3) + row(3)));
    r.stage(MB);
    expect(ids(r)).toEqual([`FAIL:Q:id-duplicate:MB-3:${MB}`]);
  });
  it('an old duplicate that this diff does not touch is not judged', () => {
    const r = base({ [MB]: head(5, row(1) + row(1)) });
    r.write(MB, head(5, row(1) + row(1)) + 'More prose.\n');
    r.stage(MB);
    expect(ids(r)).toEqual([]);
  });
  it('ids in prose, dated notes and fenced blocks are never introduced ids', () => {
    const r = base({ [MB]: head(5, row(1)) });
    const noise =
      'Dated note 2026-11-19 (M-246; MB-99 · lane X; operator, verbatim: "y") names MB-98 and MB-1.\n' +
      '- see MB-97 in the other queue\n```\n**MB-96 example - LATER**\n```\n';
    r.write(MB, head(5, row(1) + noise));
    r.stage(MB);
    expect(ids(r)).toEqual([]);
  });
  it('the McFrontend queue is judged with its own prefix and counter', () => {
    const mf = (next: number, rows: string) => `# MF\nNext free id: **MF-${next}** (ids are never reused).\n${rows}`;
    const r = base({ [MF]: mf(10, '**MF-9 A - LATER** (E)\n') });
    r.write(MF, mf(10, '**MF-9 A - LATER** (E)\n**MF-10 B - LATER** (E)\n'));
    r.stage(MF);
    expect(ids(r)).toEqual([`FAIL:Q:id-unclaimed:MF-10:${MF}`]);
  });
  it('a new row with no readable Next free id line is one cannot-decide, never a pass', () => {
    const r = base({ [MB]: '# Queue\n' + row(1) });
    r.write(MB, '# Queue\n' + row(1) + row(2));
    r.stage(MB);
    expect(ids(r)).toEqual(['FAIL:Q:cannot-decide']);
  });
  it('a new queue file is judged against an empty base', () => {
    const r = base({});
    r.write(MB, head(3, row(1) + row(2)));
    r.stage(MB);
    expect(ids(r)).toEqual([]);
  });
});

describe('CHK.7 idLedgerErrors: migrations', () => {
  it('a new migration a queue row names passes; with no row it fails', () => {
    const r = base({ [MB]: head(5, row(1)), 'migrations/330_a.sql': 'select 1;\n' });
    r.write('migrations/331_b.sql', 'select 2;\n');
    r.stage('migrations/331_b.sql');
    expect(ids(r)).toEqual([`FAIL:Q:id-no-row:mig-331:migrations/331_b.sql`]);
    r.write(MB, head(5, '**MB-1 A task - LATER** (M) adds migration 331 for the cost rows.\n'));
    r.stage(MB);
    expect(ids(r)).toEqual([]);
  });
  it('a newly ADDED migration whose number another file holds fails; an old pair is not judged', () => {
    const r = base({ [MB]: head(5, '**MB-1 A - LATER** (M) migrations 315/316.\n'), 'migrations/315_a.sql': 'a\n', 'migrations/315_b.sql': 'b\n' });
    r.write('docs/x.md', 'x\n');
    r.stage('docs/x.md');
    expect(ids(r)).toEqual([]);
    r.write('migrations/315_c.sql', 'c\n');
    r.stage('migrations/315_c.sql');
    expect(ids(r)).toEqual([`FAIL:Q:id-duplicate:mig-315:migrations/315_c.sql`]);
  });
  it('a migration renamed onto a fresh number is judged like a new one; a rename that keeps its number is not', () => {
    const r = base({ [MB]: head(5, row(1)), 'migrations/330_a.sql': 'a\n', 'migrations/331_b.sql': 'b\n' });
    r.git(['mv', 'migrations/330_a.sql', 'migrations/330_z.sql']);
    expect(ids(r)).toEqual([]);
    r.git(['mv', 'migrations/331_b.sql', 'migrations/340_b.sql']);
    expect(ids(r)).toEqual(['FAIL:Q:id-no-row:mig-340:migrations/340_b.sql']);
  });
  it('a diff with no queue edit and no new migration reports nothing', () => {
    const r = base({ [MB]: head(5, row(1)) });
    r.write('docs/y.md', 'y\n');
    r.stage('docs/y.md');
    expect(ids(r)).toEqual([]);
  });
});

describe('CHK.7 wiring: arm Q runs at push and CI only (O67-15, R-KK, R-KW)', () => {
  const DRIVER = path.resolve(__dirname, './fixtures/mcbylaws-gate/gate-driver.mjs');
  const POLICY = JSON.stringify({ pending_globs: [], layer23: ['scripts/analysis/bylaw/**'], protected: [], literal_scope: [], literal_exempt: [], held_dirs: [], held_limit: 12, worktrees: [], boot1: { tasks: ['MB-67'], exempt_ids: ['BOOT-1'] }, external_arms: [] });
  const env = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))), GIT_CONFIG_GLOBAL: '/dev/null', HUSKY: '0' }) as unknown as NodeJS.ProcessEnv;
  const staged = (r: Repo, args: string[]) => {
    const o = spawnSync(process.execPath, [GATE, ...args], { cwd: r.dir, encoding: 'utf8', timeout: 60_000, env: env() });
    return `${String(o.stdout)}\n${String(o.stderr)}`;
  };
  const push = (r: Repo, tip: string, baseSha: string) => {
    const boot = r.git(['rev-list', '--max-parents=0', 'HEAD']).split('\n')[0]!;
    const o = spawnSync(process.execPath, [DRIVER, GATE, boot, 'real', '--push'], { cwd: r.dir, encoding: 'utf8', timeout: 60_000, env: env(), input: `refs/heads/x ${tip} refs/heads/x ${baseSha}\n` });
    return { status: o.status, out: `${String(o.stdout)}\n${String(o.stderr)}` };
  };
  it('the same fixture is silent at --staged and --commit-msg, and fails at --push', () => {
    // A queue with no Next free id line: a new row is undecidable (cannot-decide) and a repeated number is a duplicate.
    const r = base({ [MB]: '# Queue\n' + row(1), 'mcbylaws/protected-paths.json': POLICY });
    const baseSha = r.git(['rev-parse', 'HEAD']);
    r.write(MB, '# Queue\n' + row(1) + row(1) + row(2));
    r.stage(MB);
    const s = staged(r, ['--staged']);
    expect(s).not.toContain('FAIL:Q:id-');
    expect(s).not.toContain('FAIL:Q:cannot-decide');
    const msg = path.join(r.dir, '.git', 'COMMIT_EDITMSG');
    fs.writeFileSync(msg, 'MB-67 queue\n');
    expect(staged(r, ['--commit-msg', msg])).not.toContain('FAIL:Q:');
    const tip = r.commit('MB-67 queue');
    const p = push(r, tip, baseSha);
    expect(p.status).toBe(1);
    expect(p.out).toContain(`FAIL:Q:id-duplicate:MB-1:${MB}`);
    expect(p.out).toContain('FAIL:Q:cannot-decide');
  });
});
