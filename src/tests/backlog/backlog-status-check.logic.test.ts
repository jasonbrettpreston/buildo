// SPEC LINK: Spec 137 section 4 rule 3 (137_mcqueue.md:84) and the rule-3 gap left by G3 (check-backlog-task.mjs reads no task status); task-5 CHK.8 as narrowed
// by the R9 note of 2026-11-19 (RR-0219). Tests scripts/analysis/backlog-status-check.mjs, run as a CLI on temp git repos (helpers.ts strips GIT_*):
// (a) a BUILT or DONE task with no commit carrying its `Task: task-N` trailer is a FAIL (a docs-only closing commit is a WARN), (b) a trailer in the range
// naming a task that was not RUNNING at that commit is a FAIL (BUILT or DONE only on the task's own closing commit). Exit 1 on a FAIL, else 0.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { run, script, tmp } from './helpers';

const task = (n: number, status: string) => `---\nid: TASK-${n}\ntitle: T${n}\nstatus: ${status}\n---\n`;
const tf = (n: number, slug = 'T') => `backlog/tasks/task-${n} - ${slug}${n}.md`;

function repo() {
  const d = tmp('chk8');
  const g = (...a: string[]) => run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d });
  g('init', '-q', '.');
  const put = (files: Record<string, string>) => { for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); } };
  const commit = (msg: string, files: Record<string, string>) => {
    put(files); g('add', '-A');
    const r = g('commit', '-qm', msg);
    expect(r.status, r.stderr).toBe(0);
  };
  return { d, g, put, commit };
}
const check = (d: string, extra: string[] = []) => script('scripts/analysis/backlog-status-check.mjs', ['--root', d, ...extra]);
const lines = (out: string, word: string) => out.split('\n').filter((l) => l.startsWith(word));

describe('backlog-status-check (task-5 CHK.8)', () => {
  it('passes a BUILT task that has a trailer commit carrying its task file', () => {
    const { d, commit } = repo();
    commit('feat(x): build\n\nTask: task-1\n', { 'src/a.ts': 'export const a = 1;\n', [tf(1)]: task(1, 'BUILT') });
    const r = check(d);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(lines(r.stdout, 'FAIL')).toHaveLength(0);
  });

  it('flags a BUILT task and a DONE task that no commit names, one FAIL line each, exit 1', () => {
    const { d, commit } = repo();
    commit('feat(x): code\n\nTask: task-1\n', { 'src/a.ts': 'export const a = 1;\n', [tf(1)]: task(1, 'RUNNING') });
    commit('feat(x): more code\n', { 'src/b.ts': 'export const b = 1;\n', [tf(2)]: task(2, 'BUILT'), [tf(3)]: task(3, 'DONE'), [tf(4)]: task(4, 'LATER') });
    const r = check(d);
    expect(r.status).toBe(1);
    const f = lines(r.stdout, 'FAIL');
    expect(f).toHaveLength(2);
    expect(f[0]).toMatch(/task-2/); expect(f[0]).toMatch(/BUILT/);
    expect(f[1]).toMatch(/task-3/); expect(f[1]).toMatch(/DONE/);
    expect(r.stdout).toMatch(/2 finding/);
  });

  it('flags a trailer that names a LATER task', () => {
    const { d, commit } = repo();
    commit('feat(x): jumps ahead\n\nTask: task-2\n', { 'src/a.ts': 'export const a = 1;\n', [tf(2)]: task(2, 'LATER') });
    const r = check(d);
    expect(r.status).toBe(1);
    const f = lines(r.stdout, 'FAIL');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatch(/task-2/); expect(f[0]).toMatch(/LATER/);
  });

  it('flags a trailer naming a task that does not exist at that commit', () => {
    const { d, commit } = repo();
    commit('feat(x): ghost\n\nTask: task-9\n', { 'src/a.ts': 'export const a = 1;\n', [tf(1)]: task(1, 'RUNNING') });
    const r = check(d);
    expect(r.status).toBe(1);
    expect(lines(r.stdout, 'FAIL')[0]).toMatch(/task-9/);
  });

  it('allows BUILT only on the newest commit that carries the trailer', () => {
    const ok = repo();
    ok.commit('feat(x): first\n\nTask: task-1\n', { 'src/a.ts': 'export const a = 1;\n', [tf(1)]: task(1, 'RUNNING') });
    ok.commit('feat(x): close\n\nTask: task-1\n', { 'src/a.ts': 'export const a = 2;\n', [tf(1)]: task(1, 'BUILT') });
    expect(check(ok.d).status).toBe(0);
    // an older trailer commit that already shows BUILT, with a newer trailer commit after it, is a failure
    const bad = repo();
    bad.commit('feat(x): built early\n\nTask: task-1\n', { 'src/a.ts': 'export const a = 1;\n', [tf(1)]: task(1, 'BUILT') });
    bad.commit('feat(x): newer\n\nTask: task-1\n', { 'src/a.ts': 'export const a = 2;\n', [tf(1)]: task(1, 'RUNNING') });
    bad.commit('chore: close again\n\nTask: task-1\n', { [tf(1)]: task(1, 'BUILT') });
    const r = check(bad.d);
    expect(r.status, r.stdout).toBe(1);
    expect(lines(r.stdout, 'FAIL')).toHaveLength(1);
  });

  it('lists a BUILT task whose newest commit is docs-only with no trailer as a WARN and exits 0', () => {
    const { d, commit } = repo();
    commit('feat(x): base\n', { 'src/a.ts': 'export const a = 1;\n' });
    commit('docs(x): close out task-2\n', { [tf(2)]: task(2, 'BUILT'), 'docs/reports/x.md': 'x\n' });
    const r = check(d);
    expect(r.status, r.stdout).toBe(0);
    expect(lines(r.stdout, 'FAIL')).toHaveLength(0);
    const w = lines(r.stdout, 'WARN');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/task-2/);
  });

  it('exits 0 when there are no findings, and says so', () => {
    const { d, commit } = repo();
    commit('feat(x): a\n\nTask: task-1\n', { 'src/a.ts': 'export const a = 1;\n', [tf(1)]: task(1, 'RUNNING') });
    commit('docs: note\n', { 'docs/n.md': 'n\n' });
    const r = check(d);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/0 finding/);
  });

  it('reads two Task trailers on one commit, and a task file that was renamed since', () => {
    const { d, g, commit } = repo();
    commit('feat(x): a\n\nTask: task-1\nTask: task-2\n', { 'src/a.ts': 'export const a = 1;\n', [tf(1)]: task(1, 'RUNNING'), [tf(2)]: task(2, 'RUNNING') });
    g('mv', tf(1), tf(1, 'Renamed'));
    commit('chore: rename\n', {});
    const r = check(d);
    expect(r.status, r.stdout).toBe(0);
  });

  it('--range limits finding (b) to that range; --range without ".." is refused with exit 2', () => {
    const { d, g, commit } = repo();
    commit('feat(x): bad old\n\nTask: task-2\n', { 'src/a.ts': 'export const a = 1;\n', [tf(2)]: task(2, 'LATER') });
    const first = g('rev-parse', 'HEAD').stdout.trim();
    commit('feat(x): fine\n\nTask: task-1\n', { 'src/b.ts': 'export const b = 1;\n', [tf(1)]: task(1, 'RUNNING') });
    expect(check(d).status).toBe(1);
    const r = check(d, ['--range', `${first}..HEAD`]);
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toMatch(/range: 1 commit/);
    const bad = check(d, ['--range', 'HEAD']);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toMatch(/\.\./);
  });

  it('a repo with no backlog/tasks directory exits 0 with no findings', () => {
    const { d, commit } = repo();
    commit('feat(x): a\n', { 'src/a.ts': 'export const a = 1;\n' });
    expect(check(d).status).toBe(0);
  });
});
