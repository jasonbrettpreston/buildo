// SPEC LINK: Spec 137 §4 rule 3 (137_mcqueue.md:84) and §6 deferred check (:155); plan v8.1 section 3 gate G3 (RR-0207, RR-0212).
// Test 6 of 11: scripts/hooks/check-backlog-task.mjs <commit-msg-file> (cwd = a repo with staged files) refuses a CODE commit without a `Task: task-N` trailer
// or whose task/draft file is not in the same diff; exempts docs, spec, queue-row, backlog-only and merge commits; passes when backlog/tasks/ is absent; the
// whole .husky/commit-msg chain accepts a trailered message and has the G3 line wired.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, run, script, tmp } from './helpers';

function repo(withBacklog = true) {
  const d = tmp('g3');
  const g = (...a: string[]) => run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d });
  g('init', '-q', '.');
  fs.mkdirSync(path.join(d, 'src'), { recursive: true });
  fs.writeFileSync(path.join(d, 'src/a.ts'), 'export const a = 1;\n');
  if (withBacklog) {
    fs.mkdirSync(path.join(d, 'backlog/tasks'), { recursive: true });
    fs.writeFileSync(path.join(d, 'backlog/tasks/task-1 - One.md'), '---\nid: TASK-1\n---\n');
  }
  g('add', '-A'); g('commit', '-qm', 'base');
  return { d, g };
}
function stage(d: string, g: (...a: string[]) => unknown, files: Record<string, string>) {
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); }
  g('add', '-A');
}
const msg = (d: string, text: string) => { const f = path.join(d, '.git/MSG'); fs.writeFileSync(f, text); return f; };
const check = (d: string, text: string) => script('scripts/hooks/check-backlog-task.mjs', [msg(d, text)], { cwd: d });

describe('G3 check-backlog-task (test 6)', () => {
  it('refuses a code commit with no Task trailer and says what to add', () => {
    const { d, g } = repo(); stage(d, g, { 'src/a.ts': 'export const a = 2;\n' });
    const r = check(d, 'feat(137_mcqueue): change a\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Task: task-N/);
  });

  it('refuses a code commit whose named task file is not in the same diff', () => {
    const { d, g } = repo(); stage(d, g, { 'src/a.ts': 'export const a = 2;\n' });
    const r = check(d, 'feat(137_mcqueue): change a\n\nTask: task-1\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/task-1/);
    expect(r.stderr).toMatch(/not in (the|this) (same )?(diff|commit)/i);
  });

  it('accepts a code commit that names the task and carries the task file in the diff', () => {
    const { d, g } = repo(); stage(d, g, { 'src/a.ts': 'export const a = 2;\n', 'backlog/tasks/task-1 - One.md': '---\nid: TASK-1\nstatus: BUILT\n---\n' });
    const r = check(d, 'feat(137_mcqueue): change a\n\nTask: task-1\n');
    expect(r.status, r.stderr).toBe(0);
  });

  it('accepts a code commit that adds a NEW task file or a new draft file named by the trailer', () => {
    const a = repo(); stage(a.d, a.g, { 'src/a.ts': 'export const a = 2;\n', 'backlog/tasks/task-2 - Two.md': '---\nid: TASK-2\n---\n' });
    expect(check(a.d, 'feat(137_mcqueue): x\n\nTask: task-2\n').status).toBe(0);
    const b = repo(); stage(b.d, b.g, { 'src/a.ts': 'export const a = 2;\n', 'backlog/drafts/draft-1 - D.md': '---\nid: DRAFT-1\n---\n' });
    expect(check(b.d, 'feat(137_mcqueue): x\n\nTask: draft-1\n').status).toBe(0);
  });

  it('exempts a docs-only commit, a spec-only commit and a queue-row commit', () => {
    for (const files of [{ 'docs/reports/x.md': 'x\n' }, { 'docs/specs/00-architecture/137_mcqueue.md': 'x\n' }, { '.cursor/MCBYLAWS-QUEUE.md': 'x\n' }]) {
      const { d, g } = repo(); stage(d, g, files);
      const r = check(d, 'docs(137_mcqueue): note\n');
      expect(r.status, JSON.stringify(files) + r.stderr).toBe(0);
    }
  });

  it('exempts a backlog-only commit (what Backlog writes on a drag)', () => {
    const { d, g } = repo(); stage(d, g, { 'backlog/tasks/task-1 - One.md': '---\nid: TASK-1\nstatus: RUNNING\n---\n' });
    expect(check(d, 'Update task TASK-1\n').status).toBe(0);
  });

  it('exempts a merge commit even when it changes code', () => {
    const { d, g } = repo(); stage(d, g, { 'src/a.ts': 'export const a = 3;\n' });
    fs.writeFileSync(path.join(d, '.git/MERGE_HEAD'), 'abc\n');
    expect(check(d, "Merge branch 'x'\n").status).toBe(0);
  });

  it('passes with no trailer when backlog/tasks/ is absent (a lane branch cut before the import)', () => {
    const { d, g } = repo(false); stage(d, g, { 'src/a.ts': 'export const a = 2;\n' });
    expect(check(d, 'feat(137_mcqueue): change a\n').status).toBe(0);
  });

  it('wires the check into .husky/commit-msg and the whole chain still accepts a trailered message', () => {
    const hook = fs.readFileSync(path.join(ROOT, '.husky/commit-msg'), 'utf8');
    expect(hook).toMatch(/scripts\/hooks\/check-backlog-task\.mjs "\$1"/);
    const f = path.join(tmp('chain'), 'MSG');
    fs.writeFileSync(f, 'docs(137_mcqueue): add the Backlog home note\n\nTask: task-1\n');
    const r = run('sh', [path.join(ROOT, '.husky/commit-msg'), f], { cwd: ROOT });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});
