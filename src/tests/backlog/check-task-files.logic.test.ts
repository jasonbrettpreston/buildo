// SPEC LINK: Spec 137 §4 rule 3 (137_mcqueue.md:84); task-3 (CHK.1) as narrowed by relevancy pass 2 (R9); BL-CHK1 plan review r1 (TRIAGE.md).
// scripts/hooks/check-task-files.mjs <commit-msg-file> (cwd = a repo with staged files): a code commit whose `Task: task-N` task declares a `Files:` line
// fails when a staged file is outside it; no Files: line = WARN and pass; docs-only/backlog-only commits are exempt; the task file, docs/reports/reviews/<task>/
// and docs/reports/lanes/ are always allowed; prefix and glob forms; the whole .husky/commit-msg chain has the line wired after G3.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, run, script, tmp } from './helpers';

const TASK = 'backlog/tasks/task-1 - One.md';
const taskText = (files?: string) => `---\nid: TASK-1\n---\n\n## Description\nsome prose\n${files === undefined ? '' : `Files: ${files}\n`}`;

function repo() {
  const d = tmp('chk1');
  const g = (...a: string[]) => run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d });
  g('init', '-q', '.');
  fs.mkdirSync(path.join(d, 'src'), { recursive: true });
  fs.writeFileSync(path.join(d, 'src/a.ts'), 'export const a = 1;\n');
  fs.mkdirSync(path.join(d, 'backlog/tasks'), { recursive: true });
  fs.writeFileSync(path.join(d, TASK), taskText());
  g('add', '-A'); g('commit', '-qm', 'base');
  return { d, g };
}
function stage(d: string, g: (...a: string[]) => unknown, files: Record<string, string>) {
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); }
  g('add', '-A');
}
const msg = (d: string, text: string) => { const f = path.join(d, '.git/MSG'); fs.writeFileSync(f, text); return f; };
const M = 'feat(137_mcqueue): x\n\nTask: task-1\n';
const check = (d: string, text = M) => script('scripts/hooks/check-task-files.mjs', [msg(d, text)], { cwd: d });
/** Stage `files` plus the task file carrying `decl`, run the check. */
function go(decl: string | undefined, files: Record<string, string>) {
  const { d, g } = repo();
  stage(d, g, { [TASK]: `${taskText(decl)}edited\n`, ...files });
  return check(d);
}

describe('CHK.1 check-task-files (task-3)', () => {
  it('task-366: a Files: text inline at the end of the description is read (one reading, shared with the launch): outside files fail, inside files pass, no WARN', () => {
    const inline = `---\nid: TASK-1\n---\n\n## Description\nsome prose, then the scope. Files: src/a.ts, scripts/hooks/\n`;
    const run1 = (files: Record<string, string>) => { const { d, g } = repo(); stage(d, g, { [TASK]: inline + 'edited\n', ...files }); return check(d); };
    const ok = run1({ 'src/a.ts': 'export const a = 2;\n' });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stderr).not.toMatch(/WARN/);
    const bad = run1({ 'src/a.ts': 'export const a = 2;\n', 'src/b.ts': 'b\n' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('src/b.ts');
  });

  it('passes a commit whose changed files are inside the declaration', () => {
    const r = go('src/a.ts, scripts/hooks/', { 'src/a.ts': 'export const a = 2;\n', 'scripts/hooks/x.mjs': 'x\n' });
    expect(r.status, r.stderr).toBe(0);
  });

  it('fails a changed file outside the declaration with one line naming the file and the Files: line', () => {
    const r = go('src/a.ts', { 'src/a.ts': 'export const a = 2;\n', 'src/b.ts': 'export const b = 1;\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/b.ts');
    expect(r.stderr).toMatch(/Files:/);
    expect(r.stderr.split('\n').filter((l) => l.includes('src/b.ts')).length).toBe(1);
  });

  it('names every outside file, one line each', () => {
    const r = go('src/a.ts', { 'src/b.ts': 'b\n', 'src/c.ts': 'c\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/b.ts');
    expect(r.stderr).toContain('src/c.ts');
  });

  it('prints a WARN and passes when the task has no Files: line', () => {
    const r = go(undefined, { 'src/a.ts': 'export const a = 2;\n' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/WARN/);
  });

  it('treats a Files: line with only empty entries as no declaration (WARN, pass), and skips empty entries', () => {
    const a = go(' , ,', { 'src/a.ts': 'export const a = 2;\n' });
    expect(a.status, a.stderr).toBe(0);
    expect(a.stderr).toMatch(/WARN/);
    const b = go('src/a.ts,, ,', { 'src/zzz.ts': 'z\n' });
    expect(b.status).toBe(1);
  });

  it('exempts a docs-only commit and a backlog-only commit (no code file staged)', () => {
    const a = go('src/a.ts', { 'docs/reports/x.md': 'x\n' });
    expect(a.status, a.stderr).toBe(0);
    const { d, g } = repo(); stage(d, g, { [TASK]: taskText('src/a.ts') });
    expect(check(d).status).toBe(0);
  });

  it('always allows the task file, docs/reports/reviews/<task>/ and docs/reports/lanes/', () => {
    const r = go('src/a.ts', { 'src/a.ts': 'export const a = 2;\n', 'docs/reports/reviews/task-1/context.md': 'c\n', 'docs/reports/lanes/2026-11-19/L/REPORT.md': 'r\n' });
    expect(r.status, r.stderr).toBe(0);
    const o = go('src/a.ts', { 'src/a.ts': 'export const a = 2;\n', 'docs/reports/reviews/task-9/context.md': 'c\n' });
    expect(o.status).toBe(1);
    expect(o.stderr).toContain('docs/reports/reviews/task-9/context.md');
  });

  it('prefix form matches on a directory boundary, with or without a trailing slash', () => {
    expect(go('scripts/hooks', { 'scripts/hooks/x.mjs': 'x\n' }).status).toBe(0);
    expect(go('scripts/hooks/', { 'scripts/hooks/x.mjs': 'x\n' }).status).toBe(0);
    expect(go('scripts/hook', { 'scripts/hooks/x.mjs': 'x\n' }).status).toBe(1);
    expect(go('./src/a.ts', { 'src/a.ts': 'export const a = 2;\n' }).status).toBe(0);
  });

  it('glob form: * stays in one segment, ** crosses directories and matches zero depth, ? is one non-slash char', () => {
    expect(go('src/*.ts', { 'src/b.ts': 'b\n' }).status).toBe(0);
    expect(go('src/*.ts', { 'src/deep/b.ts': 'b\n' }).status).toBe(1);
    expect(go('src/**/*.ts', { 'src/deep/er/b.ts': 'b\n' }).status).toBe(0);
    expect(go('src/**/b.ts', { 'src/b.ts': 'b\n' }).status).toBe(0);
    expect(go('src/?.ts', { 'src/b.ts': 'b\n' }).status).toBe(0);
    expect(go('src/?.ts', { 'src/bb.ts': 'b\n' }).status).toBe(1);
  });

  it('escapes regex characters: a dot is a dot, [ is a literal', () => {
    expect(go('src/a.b.c.ts', { 'src/a.b.c.ts': 'x\n' }).status).toBe(0);
    expect(go('src/a.b.c.ts', { 'src/aXbYc.ts': 'x\n' }).status).toBe(1);
    expect(go('src/a.*.ts', { 'src/aXb.ts': 'x\n' }).status).toBe(1);
    expect(go('src/[id].ts', { 'src/[id].ts': 'x\n' }).status).toBe(0);
    expect(go('src/[id].ts', { 'src/i.ts': 'x\n' }).status).toBe(1);
  });

  it('counts a deletion and both sides of a rename (no rename detection)', () => {
    const { d, g } = repo();
    g('mv', 'src/a.ts', 'src/moved.ts');
    stage(d, g, { [TASK]: taskText('src/moved.ts') });
    const r = check(d);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/a.ts');
  });

  it('allows both sides of a task-file rename, and still checks a commit that deletes the task file against its HEAD declaration', () => {
    const a = repo();
    fs.writeFileSync(path.join(a.d, TASK), taskText('src/a.ts'));
    a.g('add', '-A'); a.g('commit', '-qm', 'decl');
    a.g('mv', TASK, 'backlog/tasks/task-1 - Renamed.md');
    stage(a.d, a.g, { 'src/a.ts': 'export const a = 3;\n' });
    expect(check(a.d).status, check(a.d).stderr).toBe(0);
    const b = repo();
    fs.writeFileSync(path.join(b.d, 'backlog/tasks/task-2 - Two.md'), taskText());
    fs.writeFileSync(path.join(b.d, TASK), taskText('src/a.ts'));
    b.g('add', '-A'); b.g('commit', '-qm', 'decl');
    b.g('rm', '-q', TASK);
    stage(b.d, b.g, { 'src/z.ts': 'z\n' });
    const r = check(b.d);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/z.ts');
  });

  it('takes the first Files: line at line start; prose that merely mentions Files: is ignored', () => {
    const { d, g } = repo();
    stage(d, g, { [TASK]: '---\nid: TASK-1\n---\nthe Files: line is described here\nFiles: src/a.ts\nFiles: src/b.ts\n', 'src/b.ts': 'b\n' });
    expect(check(d).status).toBe(1);
  });

  it('passes without a trailer (G3 owns that refusal), with the task file absent from the diff, and on a merge commit', () => {
    const a = repo(); stage(a.d, a.g, { 'src/a.ts': 'export const a = 2;\n' });
    expect(check(a.d, 'feat(137_mcqueue): x\n').status).toBe(0);
    expect(check(a.d, M).status).toBe(0);
    const b = repo(); stage(b.d, b.g, { [TASK]: taskText('src/a.ts'), 'src/z.ts': 'z\n' });
    fs.writeFileSync(path.join(b.d, '.git/MERGE_HEAD'), 'deadbeef\n');
    expect(check(b.d).status).toBe(0);
  });

  it('passes when backlog/tasks/ is absent', () => {
    const d = tmp('chk1-nob');
    const g = (...a: string[]) => run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d });
    g('init', '-q', '.'); stage(d, g, { 'src/a.ts': 'a\n' });
    expect(check(d).status).toBe(0);
  });

  it('is wired in .husky/commit-msg right after the G3 line', () => {
    const hook = fs.readFileSync(path.join(ROOT, '.husky/commit-msg'), 'utf8').split('\n');
    const g3 = hook.findIndex((l) => l.includes('scripts/hooks/check-backlog-task.mjs'));
    const chk = hook.findIndex((l) => l.includes('scripts/hooks/check-task-files.mjs'));
    expect(g3).toBeGreaterThanOrEqual(0);
    expect(chk).toBe(g3 + 1);
  });
});
