// SPEC LINK: RR-0240 (the take on the board at lane launch, MORNING-DECISIONS.md:947-951), RR-0242 (one-command launch, :953-955), Spec 08 section 7 rule 9 (08_agents.md:339), task-310 (R8e).
// scripts/analysis/backlog-lane.mjs --task task-N --lane <name>: the whole lane launch from the task file, on a temp board (a git repo with a Backlog project, helpers.ts) and a fake panel-tools directory.
// No launchctl in tests: `--no-launchd` runs the board-commit job script inline instead of kickstarting the agent.
import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { backlog, backlogBin, makeProject, mk, run, tmp } from './helpers';

const ID = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd: string, ...a: string[]) => run('git', ['-c', 'commit.gpgsign=false', ...a], { cwd, env: ID });
const AC = 'Writes scripts/analysis/thing.mjs and the notes file docs/out/NOTES.md, nothing else';
const SCRIPT = path.join(__dirname, '../../../scripts/analysis/backlog-lane.mjs');

type Fx = { board: string; base: string; wt: string; main: string; pt: string; task: string; args: string[] };
function fixture(opts: { status?: string; hook?: boolean; files?: string | null; type?: string; letter?: string } = {}): Fx {
  const board = makeProject(), base = tmp('lane');
  fs.mkdirSync(path.join(board, 'backlog/milestones'), { recursive: true });
  fs.writeFileSync(path.join(board, 'backlog/milestones/m-0 - foundations.md'), `---\nid: m-0\ntitle: "Increment 1·A Foundations [${opts.letter ?? 'F'}]"\n---\n\n## Description\n\nx\n`);
  fs.writeFileSync(path.join(board, '.gitignore'), '.board/\n.cursor/active_task*\n');
  fs.mkdirSync(path.join(board, '.cursor'), { recursive: true });
  fs.writeFileSync(path.join(board, '.cursor/active_task.md'), '# Active Task: the plan\n');
  fs.mkdirSync(path.join(board, 'mcbylaws'), { recursive: true }); // the table reuses this path map (globs_from)
  fs.copyFileSync(path.join(__dirname, '../../../mcbylaws/protected-paths.json'), path.join(board, 'mcbylaws/protected-paths.json'));
  fs.mkdirSync(path.join(board, 'mobile'), { recursive: true });
  fs.writeFileSync(path.join(board, 'mobile/.keep'), '');
  const task = mk(board, 'Launch me', ['-d', `Launch description text.${opts.files === null ? '' : `\n\nFiles: ${opts.files ?? 'scripts/analysis/thing.mjs'}`}`, ...(opts.type ? ['--type', opts.type] : []), '--ac', AC, '--ref', 'docs/a.md', '--doc', 'docs/b.md', '-m', 'm-0', ...(opts.status ? ['-s', opts.status] : [])]);
  git(board, 'add', '-A'); git(board, 'commit', '-q', '-m', 'fixture');
  if (opts.hook) { const h = path.join(board, '.git/hooks/pre-commit'); fs.writeFileSync(h, '#!/bin/sh\nexit 1\n'); fs.chmodSync(h, 0o755); }
  const main = path.join(base, 'main');
  fs.mkdirSync(path.join(main, 'node_modules'), { recursive: true }); fs.mkdirSync(path.join(main, 'mobile/node_modules'), { recursive: true });
  const pt = path.join(base, 'panel-tools'); fs.mkdirSync(pt);
  fs.writeFileSync(path.join(pt, 'brief.mjs'), "import fs from 'node:fs'; const a = process.argv; const s = fs.readFileSync(a[a.indexOf('--spec') + 1], 'utf8'); fs.writeFileSync(a[a.indexOf('--out') + 1], `FAKE BRIEF\\n${s}`);\n");
  const wt = path.join(base, 'wt-t1');
  const args = ['--task', task, '--lane', 'BL-T1', '--board', board, '--worktree', wt, '--lane-dir', path.join(base, 'lane-dir'), '--main', main, '--panel-tools', pt, '--backlog-bin', backlogBin(), '--date', '2026-11-19'];
  return { board, base, wt, main, pt, task, args };
}
const lane = (f: Fx, extra: string[] = []) => run('node', [SCRIPT, ...f.args, ...extra], { env: ID });
const statusOf = (f: Fx) => /^Status: .*?(\w+)$/m.exec(backlog(f.board, ['task', 'view', f.task, '--plain']).stdout)?.[1];
const refused = (r: { status: number | null; stdout: string; stderr: string }, re: RegExp) => { expect(r.status, r.stdout + r.stderr).toBe(3); const lines = r.stderr.trim().split('\n'); expect(lines).toHaveLength(1); expect(lines[0]).toMatch(re); };

describe('backlog-lane refusals (AC #2): exit 3, one line, nothing written', () => {
  for (const s of ['RUNNING', 'BUILT', 'DONE']) {
    it(`refuses a task in status ${s}`, () => {
      const f = fixture({ status: s });
      refused(lane(f), new RegExp(`not LATER or WAITS.*${s}`));
      expect(fs.existsSync(f.wt)).toBe(false);
    });
  }
  it('accepts WAITS as well as LATER (dry-run)', () => {
    const f = fixture({ status: 'WAITS' });
    expect(lane(f, ['--dry-run']).status).toBe(0);
  });
  it('refuses a missing worktree parent', () => {
    const f = fixture();
    refused(lane(f, ['--worktree', path.join(f.base, 'nope/deeper/wt')]), /worktree parent .* does not exist/);
  });
  it('refuses an existing worktree directory', () => {
    const f = fixture(); fs.mkdirSync(f.wt);
    refused(lane(f), /worktree .* already exists/);
    expect(statusOf(f)).toBe('LATER');
  });
  it('refuses an existing branch', () => {
    const f = fixture(); git(f.board, 'branch', 'wf2/t1');
    refused(lane(f), /branch wf2\/t1 already exists/);
  });
  it('refuses a dirty board: a modified file outside backlog/ (and an untracked one), but not a change inside backlog/', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.board, 'mobile/.keep'), 'edited');
    refused(lane(f), /board checkout .* dirty outside backlog\/.*mobile\/\.keep/);
    git(f.board, 'checkout', '--', 'mobile/.keep');
    fs.writeFileSync(path.join(f.board, 'stray.txt'), 'x');
    refused(lane(f), /dirty outside backlog\/.*stray\.txt/);
    fs.rmSync(path.join(f.board, 'stray.txt'));
    fs.appendFileSync(path.join(f.board, 'backlog/milestones/m-0 - foundations.md'), '\nmore\n');
    fs.symlinkSync(f.main, path.join(f.board, 'mobile/node_modules'));
    expect(lane(f, ['--dry-run']).status).toBe(0);
  });
  it('refuses a missing backlog binary, a bad lane name, a missing task and a missing input', () => {
    const f = fixture();
    refused(lane(f, ['--backlog-bin', path.join(f.base, 'nobin')]), /backlog binary not found/);
    refused(lane(f, ['--lane', '../x']), /lane name/);
    refused(lane(f, ['--task', 'task-999']), /task-999 not found/);
    refused(lane(f, ['--main', path.join(f.base, 'nomain')]), /node_modules .* not found/);
    refused(lane(f, ['--panel-tools', path.join(f.base, 'nopt')]), /brief\.mjs not found/);
  });
  it('exits 2 on a usage error (no --task)', () => {
    const r = run('node', [SCRIPT, '--lane', 'x'], { env: ID });
    expect(r.status).toBe(2);
  });
});

describe('backlog-lane --dry-run (AC #3): prints every command, writes nothing', () => {
  it('prints take, kickstart, worktree add, two ln, cp, backlog-brief, brief.mjs and a BRIEF-FILE line, and changes nothing', () => {
    const f = fixture();
    const headBefore = git(f.board, 'rev-parse', 'HEAD').stdout.trim();
    const r = lane(f, ['--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    const o = r.stdout;
    expect(o).toMatch(/backlog task edit task-\d+ -s RUNNING -a @lane-BL-T1 --append-notes '2026-11-19 taken on the board at lane launch \(lane BL-T1, worktree .*, branch wf2\/t1\), RR-0240'/);
    expect(o).toMatch(/launchctl kickstart -k gui\/\d+\/com\.maxbld\.board-commit/);
    expect(o).toMatch(/git worktree add -b wf2\/t1 .*wt-t1 '?<board HEAD after the take commit>'?/);
    expect(o.match(/\bln -s /g)).toHaveLength(2);
    expect(o).toMatch(/ln -s .*main\/node_modules .*wt-t1\/node_modules/);
    expect(o).toMatch(/ln -s .*main\/mobile\/node_modules .*wt-t1\/mobile\/node_modules/);
    expect(o).toMatch(/cp .*\.cursor\/active_task\.md .*wt-t1\/\.cursor\/active_task\.md/);
    expect(o).toMatch(/node .*backlog-brief\.mjs --task task-\d+ --lane BL-T1 --stage 1 --root .*wt-t1 --date 2026-11-19 > .*G1-task-\d+\.md/);
    expect(o).toMatch(/node .*panel-tools\/brief\.mjs --spec .*task\.json --out .*BRIEF\.md/);
    expect(o).toMatch(/^BRIEF-FILE: .*BRIEF\.md sha256=<sha256 of the brief>$/m);
    expect(fs.existsSync(f.wt)).toBe(false);
    expect(fs.existsSync(path.join(f.base, 'lane-dir'))).toBe(false);
    expect(git(f.board, 'rev-parse', 'HEAD').stdout.trim()).toBe(headBefore);
    expect(statusOf(f)).toBe('LATER');
  });
  it('quotes paths with spaces and the middle dot', () => {
    const f = fixture();
    const base = path.join(f.base, 'with space·dot'); fs.mkdirSync(base);
    const r = lane(f, ['--dry-run', '--worktree', path.join(base, 'wt x')]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`'${path.join(base, 'wt x')}'`);
    expect(r.stdout).toContain(`'${path.join(base, 'wt x', 'node_modules')}'`);
  });
  it('prints the task.json it would write: required fields, outputs from the AC paths, writeScope without a file, groups from the milestone', () => {
    const f = fixture();
    const r = lane(f, ['--dry-run']);
    const spec = JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null');
    expect(spec).not.toBeNull();
    expect(spec.lane).toBe('BL-T1');
    expect(spec.goal).toMatch(/^Launch me[\s\S]*Launch description text\./);
    expect(spec.groups).toEqual(['F']);
    expect(spec.writeScope).toEqual([path.join(f.base, 'lane-dir'), f.wt]);
    expect(spec.outputs).toEqual(expect.arrayContaining([path.join(f.wt, 'scripts/analysis/thing.mjs'), path.join(f.wt, 'docs/out/NOTES.md'), path.join(f.base, 'lane-dir/REPORT.md')]));
    expect(spec.inputs.join('\n')).toMatch(/G1-task-\d+\.md/);
    expect(spec.inputs.join('\n')).toContain('backlog task view');
    expect(spec.inputs.join('\n')).toContain('docs/a.md');
    expect(spec.inputs.join('\n')).toContain('docs/b.md');
    expect(spec.extra.join('\n')).toMatch(/^Ticket: task-\d+/m);
    expect(spec.extra.join('\n')).toContain('scripts/deepseek-review.js review docs/reports/reviews/');
  });
});

describe('backlog-lane real launch on the temp board (AC #1)', () => {
  it('takes the task, waits for the job commit, cuts the worktree, links, writes G1 and task.json, runs brief.mjs and prints BRIEF-FILE with its sha256', () => {
    const f = fixture();
    const head0 = git(f.board, 'rev-parse', 'HEAD').stdout.trim();
    const r = lane(f, ['--no-launchd']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(statusOf(f)).toBe('RUNNING');
    const view = backlog(f.board, ['task', 'view', f.task, '--plain']).stdout;
    expect(view).toContain('Assignee: @lane-BL-T1');
    expect(view).toMatch(/taken on the board at lane launch \(lane BL-T1, worktree .*wt-t1, branch wf2\/t1\), RR-0240/);
    expect(git(f.board, 'status', '--porcelain', '--', 'backlog').stdout.trim()).toBe('');
    const head1 = git(f.board, 'rev-parse', 'HEAD').stdout.trim();
    expect(head1).not.toBe(head0);
    expect(git(f.wt, 'rev-parse', 'HEAD').stdout.trim()).toBe(head1);
    expect(git(f.wt, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('wf2/t1');
    expect(fs.readlinkSync(path.join(f.wt, 'node_modules'))).toBe(path.join(f.main, 'node_modules'));
    expect(fs.readlinkSync(path.join(f.wt, 'mobile/node_modules'))).toBe(path.join(f.main, 'mobile/node_modules'));
    expect(fs.readFileSync(path.join(f.wt, '.cursor/active_task.md'), 'utf8')).toBe('# Active Task: the plan\n');
    const ld = path.join(f.base, 'lane-dir');
    expect(fs.readFileSync(path.join(ld, `G1-${f.task}.md`), 'utf8')).toMatch(new RegExp(`^Ticket: ${f.task} .* · lane BL-T1 · stage 1`, 'm'));
    const spec = JSON.parse(fs.readFileSync(path.join(ld, 'task.json'), 'utf8'));
    for (const k of ['lane', 'goal', 'inputs', 'outputs', 'groups', 'writeScope']) expect(spec[k], k).toBeTruthy();
    for (const w of spec.writeScope) expect(fs.statSync(w).isDirectory()).toBe(true);
    const brief = fs.readFileSync(path.join(ld, 'BRIEF.md'));
    expect(brief.toString()).toMatch(/^FAKE BRIEF/);
    const sha = crypto.createHash('sha256').update(brief).digest('hex');
    expect(r.stdout.trim().split('\n').pop()).toBe(`BRIEF-FILE: ${path.join(ld, 'BRIEF.md')} sha256=${sha}`);
    expect(fs.existsSync(path.join(f.wt, `docs/reports/reviews/${f.task}/context-2026-11-19.md`))).toBe(true);
  });
  it('uses --spec instead of a generated task.json when given', () => {
    const f = fixture();
    const spec = path.join(f.base, 'mine.json');
    fs.writeFileSync(spec, JSON.stringify({ lane: 'BL-T1', goal: 'g', outputs: ['o'], writeScope: [f.base], groups: ['F'] }));
    const r = lane(f, ['--no-launchd', '--spec', spec]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(fs.existsSync(path.join(f.base, 'lane-dir/task.json'))).toBe(false);
    expect(fs.readFileSync(path.join(f.base, 'lane-dir/BRIEF.md'), 'utf8')).toContain('"goal":"g"');
  });
  it('refuses after the wait when the job commit never lands, naming the state and the recovery command (exit 3, one line)', () => {
    const f = fixture({ hook: true });
    const r = lane(f, ['--no-launchd', '--wait-ms', '1500']);
    refused(r, /board commit did not land within 1500 ms.*backlog task edit task-\d+ -s LATER -a ''/);
    expect(fs.existsSync(f.wt)).toBe(false);
  });
});

// task-358 (REVIEW.LENSES): the brief names the Spec 08 lens set (08_agents.md:334 "NEVER run one generic pass") for plan and output review, by task type.
describe('backlog-lane review line names the lens set (task-358)', () => {
  const lensBrief = (type: string | null, files: string) => {
    const f = fixture();
    const dir = path.join(f.board, 'backlog/tasks');
    const file = path.join(dir, fs.readdirSync(dir).find((n) => n.startsWith(f.task))!);
    let body = fs.readFileSync(file, 'utf8').replace('Launch description text.', `Launch description text. Files: ${files}`);
    if (type) body = body.replace(/^labels: .*$/m, (m) => `${m}\ntype: ${type}`);
    fs.writeFileSync(file, body);
    const r = lane(f, ['--dry-run']);
    const spec = JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null');
    expect(spec, r.stdout + r.stderr).not.toBeNull();
    return spec.extra.join('\n') as string;
  };
  it('a build on a surface: compliance, code-review, ux, error-paths, in parallel, outputs r1-<lens>.txt, triage as round 2; no security', () => {
    const e = lensBrief('build', 'mobile/app/(app)/x.tsx, src/tests/');
    for (const l of ['plan-review-deepseek.md', 'lens-compliance.md', 'lens-code-review.md', 'lens-ux.md', 'lens-error-paths.md']) expect(e).toContain(l);
    expect(e).not.toContain('lens-security.md');
    expect(e).toMatch(/plan review/i);
    expect(e).toMatch(/output review/i);
    expect(e).toContain('in parallel');
    expect(e).toContain('r1-<lens>.txt');
    expect(e).toMatch(/round 2/);
    expect(e).toContain('NEVER run one generic pass');
  });
  it('security joins when the Files line touches entitlements, auth, stripe or a metered route', () => {
    for (const files of ['src/lib/entitlements.ts', 'src/app/api/auth/x.ts', 'src/lib/stripe/webhook.ts', 'src/app/api/parcels/lookup/route.ts (metered route)']) {
      expect(lensBrief('build', files), files).toContain('lens-security.md');
    }
  });
  it('a build that is not on a surface has no ux lens', () => {
    const e = lensBrief('build', 'scripts/analysis/x.mjs, src/tests/');
    expect(e).toContain('lens-code-review.md');
    expect(e).not.toContain('lens-ux.md');
  });
  it('a record-only task runs compliance only', () => {
    const e = lensBrief('record', 'docs/specs/00-architecture/08_agents.md');
    expect(e).toContain('lens-compliance.md');
    for (const l of ['lens-code-review.md', 'lens-ux.md', 'lens-error-paths.md', 'lens-security.md']) expect(e).not.toContain(l);
  });
});

// task-366 (COMPLY.2): the launch resolves the task's Files line through scripts/analysis/rule-lists.json (data decides) and attaches the governing rule lists.
describe('backlog-lane attaches the rule lists by touched path (task-366)', () => {
  const TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../scripts/analysis/rule-lists.json'), 'utf8')) as { lists: Record<string, { file: string }>; rows: { id: string; lists: string[] }[] };
  const dry = (o: Parameters<typeof fixture>[0]) => {
    const f = fixture(o);
    const r = lane(f, ['--dry-run']);
    const spec = JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null');
    return { f, r, spec, inputs: (spec?.inputs ?? []).join('\n') as string, extra: (spec?.extra ?? []).join('\n') as string };
  };
  it('a mobile file plus an API route: the brief names every list of both rows, each with its file, READ whole before planning (AC #2)', () => {
    const { r, inputs } = dry({ files: 'mobile/src/app/x.tsx, src/app/api/parcels/search/route.ts' });
    expect(r.status, r.stderr).toBe(0);
    expect(inputs).toContain('Rule lists that govern this task');
    expect(inputs).toMatch(/READ each whole before planning/);
    for (const row of ['mobile', 'api-lib', 'storage']) for (const l of TABLE.rows.find((x) => x.id === row)!.lists) {
      expect(inputs, row + ': ' + l).toContain(TABLE.lists[l]!.file);
      expect(inputs).toContain(l + ':');
    }
    expect(inputs).toContain('draft, operator to confirm it binds');
    expect(inputs).toContain('backlog/docs/increments/doc-1 - Increment-F-requirements.md');
  });
  it('the lens line runs the compliance lens once per list through the helper, other lenses stay, and the separate-grounder rule is written in', () => {
    const { extra } = dry({ files: 'mobile/src/app/x.tsx, src/app/api/parcels/search/route.ts', type: 'build' });
    for (const l of ['mobile-98', 'eng-s2-s4-s10-s11', 'storage-doc16', 'inc-F']) {
      expect(extra).toContain('plan-compliance-' + l);
      expect(extra).toContain('out-compliance-' + l);
    }
    expect(extra).toContain('scripts/analysis/rule-lists.mjs lens-input');
    expect(extra).toContain('lens-code-review.md');
    expect(extra).toContain('lens-error-paths.md');
    expect(extra).toMatch(/a separate grounder rules on every finding/);
    expect(extra).toContain('GROUNDER.md');
  });
  it('a Files path no row matches is refused at launch with the path named (exit 3, one line, nothing written)', () => {
    const f = fixture({ files: 'scripts/analysis/thing.mjs, zzz-nothing/new.txt' });
    refused(lane(f), /zzz-nothing\/new\.txt/);
    expect(fs.existsSync(f.wt)).toBe(false);
    expect(statusOf(f)).toBe('LATER');
  });
  it('a task with no Files line is refused, but a record-only task gets the queue lists', () => {
    refused(lane(fixture({ files: null })), /no Files/);
    const { r, inputs } = dry({ files: null, type: 'record' });
    expect(r.status, r.stderr).toBe(0);
    expect(inputs).toContain('137_mcqueue.md');
  });
  it('a milestone letter with no increment requirements document is refused naming the letter', () => {
    refused(lane(fixture({ letter: 'Q' })), /increment.*Q|Q.*increment/);
  });
});
