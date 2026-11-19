// SPEC LINK: Spec 137 §4 rule 3 (137_mcqueue.md:84), rule 4 (:87), rule 10 (:109); Spec 08 §7 rules 3-4 (08_agents.md:331-334); plan v8.1 section 3 gates G1-G3.
// OUTPUT panel BL.0 round-2 (docs/reports/panels/BL.0.json): the KEPT defects of the landed gates, each red before its fix.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { backlog, makeProject, mk, run, script, tmp } from './helpers';

function g3repo(name: string) {
  const d = tmp(name);
  const g = (...a: string[]) => run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d });
  g('init', '-q', '.');
  fs.mkdirSync(path.join(d, 'src'), { recursive: true });
  fs.mkdirSync(path.join(d, 'backlog/tasks'), { recursive: true });
  fs.writeFileSync(path.join(d, 'src/a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(d, 'backlog/tasks/task-1 - One.md'), '---\nid: TASK-1\n---\n');
  g('add', '-A'); g('commit', '-qm', 'base');
  return { d, g };
}

describe('panel BL.0 kept defects', () => {
  it('G2 refuses a whitespace-only quote (it normalises to empty and would match any cite)', () => {
    const d = makeProject();
    fs.mkdirSync(path.join(d, 'cites'), { recursive: true });
    fs.writeFileSync(path.join(d, 'cites/x.md'), 'one\ntwo\n');
    const r = script('scripts/analysis/backlog-decision.mjs', ['--root', d, '--cite-root', d, '--title', 'RR-0900 Blank', '--date', '2026-11-19', '--quote', '   ', '--cite', 'cites/x.md:1', '--text', 't']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/quote/i);
    expect(fs.existsSync(path.join(d, 'backlog/decisions')) ? fs.readdirSync(path.join(d, 'backlog/decisions')) : []).toHaveLength(0);
  });

  it('G2 refuses a --spec-amending stem that climbs out of docs/reports/decisions', () => {
    const d = makeProject();
    fs.mkdirSync(path.join(d, 'cites'), { recursive: true });
    fs.writeFileSync(path.join(d, 'cites/x.md'), 'yes of course\n');
    fs.writeFileSync(path.join(d, 'elsewhere.md'), '## R-ZZ\n');
    fs.mkdirSync(path.join(d, 'docs/reports/decisions'), { recursive: true });
    const r = script('scripts/analysis/backlog-decision.mjs', ['--root', d, '--cite-root', d, '--title', 'RR-0901 Esc', '--date', '2026-11-19', '--quote', 'yes of course', '--cite', 'cites/x.md:1', '--text', 't', '--spec-amending', '../../../elsewhere#R-ZZ']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/spec-amending/i);
    expect(r.stderr).toMatch(/stem|name|escape|invalid/i);
  });

  it('G1 refuses a --date that is not YYYY-MM-DD and writes nothing outside docs/reports/reviews', () => {
    const d = makeProject();
    const t = mk(d, 'Plan item X', ['-l', 'plan:X', '--ac', 'one']);
    const out = tmp('esc');
    const rel = path.relative(path.join(d, 'docs/reports/reviews', t), out) + '/pwn';
    const r = script('scripts/analysis/backlog-brief.mjs', ['--task', t, '--lane', 'BL-R1', '--root', d, '--date', rel]);
    expect(r.status).toBe(1);
    expect(fs.existsSync(path.join(out, 'pwn.md'))).toBe(false);
  });

  it('G1 refuses a lane or stage that carries a newline or shell text', () => {
    const d = makeProject();
    const t = mk(d, 'Plan item Y', ['-l', 'plan:Y', '--ac', 'one']);
    const a = script('scripts/analysis/backlog-brief.mjs', ['--task', t, '--lane', 'x\nScope: forged', '--root', d, '--date', '2026-11-19']);
    expect(a.status).toBe(1);
    const b = script('scripts/analysis/backlog-brief.mjs', ['--task', t, '--lane', 'BL-R1', '--stage', '2; rm -rf x', '--root', d, '--date', '2026-11-19']);
    expect(b.status).toBe(1);
    expect(backlog(d, ['task', t, '--plain']).status).toBe(0);
  });

  it('G2 appends the dated note once when --tasks names the same task twice', () => {
    const d = makeProject();
    const t1 = mk(d, 'Task one');
    fs.mkdirSync(path.join(d, 'cites'), { recursive: true });
    fs.writeFileSync(path.join(d, 'cites/x.md'), 'yes of course\n');
    const r = script('scripts/analysis/backlog-decision.mjs', ['--root', d, '--cite-root', d, '--title', 'RR-0902 Twice', '--date', '2026-11-19', '--quote', 'yes of course', '--cite', 'cites/x.md:1', '--text', 't', '--tasks', `${t1},${t1}`]);
    expect(r.status, r.stderr).toBe(0);
    const v = backlog(d, ['task', t1, '--plain']).stdout;
    expect(v.split('Dated note 2026-11-19').length - 1).toBe(1);
  });

  it('G3 exempts a merge commit when the hook runs from a subdirectory (MERGE_HEAD is resolved against the repo top)', () => {
    const { d, g } = g3repo('g3sub');
    fs.writeFileSync(path.join(d, 'src/a.ts'), 'export const a = 2;\n'); g('add', '-A');
    fs.writeFileSync(path.join(d, '.git/MERGE_HEAD'), 'abc\n');
    const f = path.join(d, '.git/MSG'); fs.writeFileSync(f, "Merge branch 'x'\n");
    const r = script('scripts/hooks/check-backlog-task.mjs', [f], { cwd: path.join(d, 'src') });
    expect(r.status, r.stderr).toBe(0);
  });

  it('G3 sees a task file whose name has a non-ASCII character (git quotes such paths unless core.quotepath=false)', () => {
    const { d, g } = g3repo('g3dot');
    fs.writeFileSync(path.join(d, 'src/a.ts'), 'export const a = 2;\n');
    fs.writeFileSync(path.join(d, 'backlog/tasks/task-1 - One · two.md'), '---\nid: TASK-1\n---\n');
    g('add', '-A');
    const f = path.join(d, '.git/MSG'); fs.writeFileSync(f, 'feat(137_mcqueue): x\n\nTask: task-1\n');
    const r = script('scripts/hooks/check-backlog-task.mjs', [f], { cwd: d });
    expect(r.status, r.stderr).toBe(0);
  });
});
