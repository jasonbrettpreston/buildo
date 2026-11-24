// SPEC LINK: RR-0240 (the take on the board at lane launch, MORNING-DECISIONS.md:947-951), RR-0242 (one-command launch, :953-955), Spec 08 section 7 rule 9 (08_agents.md:339), task-310 (R8e).
// scripts/analysis/backlog-lane.mjs --task task-N --lane <name>: the whole lane launch from the task file, on a temp board (a git repo with a Backlog project, helpers.ts) and a fake panel-tools directory.
// No launchctl in tests: `--no-launchd` runs the board-commit job script inline instead of kickstarting the agent.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { backlog, backlogBin, makeProject, mk, ROOT, run, tmp } from './helpers';

const ID = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd: string, ...a: string[]) => run('git', ['-c', 'commit.gpgsign=false', ...a], { cwd, env: ID });
const AC = 'Writes scripts/analysis/thing.mjs and the notes file docs/out/NOTES.md, nothing else';
const SCRIPT = path.join(__dirname, '../../../scripts/analysis/backlog-lane.mjs');
// task-375 D: a build or fix launch needs real plan evidence on the board (the launch gate); the program in docs/reports/reviews/task-375/plant-evidence.mjs writes it for a fixture board with the real helpers (lens-input inputs, REVIEW headers, GROUNDER-PLAN.md, seat reports, round block, references, Plan line) and commits it
function plantEvidence(board: string, task: string, laneName = 'BL-T1') {
  const r = run('node', [path.join(ROOT, 'docs/reports/reviews/task-375/plant-evidence.mjs'), board, task, laneName, ROOT, backlogBin()], { env: ID });
  if (r.status !== 0) throw new Error(`plantEvidence: ${r.stdout}${r.stderr}`);
  // task-453 S1: the launch gate grounds seat findings (a 20+ character quote of its own, on the cited line of a file the board holds); the shared program cites docs/a.md, which this board
  // does not hold, with one quote for every seat, so each seat verdict is re-pointed at line 2 of its own seat report and the evidence committed again
  const gp = path.join(board, `docs/reports/reviews/${task}/GROUNDER-PLAN.md`);
  const names: Record<string, string> = { int: 'integration', rea: 'reality-check', reg: 'regression' };
  if (!fs.existsSync(gp)) return; // a task the program writes no evidence for (no resolvable lists)
  const g = fs.readFileSync(gp, 'utf8').replace(/^(int|rea|reg)#1 REJECTED docs\/a\.md:1 "a small note that changes nothing" (.*)$/gm, (_m, ab: string, why: string) => `${ab}#1 REJECTED docs/reports/reviews/${task}/seat-${names[ab]}-1.md:2 "${ab}#1 LOW: a small note" ${why}`);
  fs.writeFileSync(gp, g);
  git(board, 'add', '-A'); git(board, 'commit', '-q', '-m', 'plan evidence: seat quotes');
}

type Fx = { board: string; base: string; wt: string; main: string; pt: string; task: string; args: string[] };
function fixture(opts: { status?: string; hook?: boolean; files?: string | null; type?: string; letter?: string; noMilestone?: boolean; noEvidence?: boolean } = {}): Fx {
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
  const task = mk(board, 'Launch me', ['-d', `Launch description text.${opts.files === null ? '' : `\n\nFiles: ${opts.files ?? 'scripts/analysis/thing.mjs'}`}`, ...(opts.type ? ['--type', opts.type] : []), '--ac', AC, '--ref', 'docs/a.md', '--doc', 'docs/b.md', ...(opts.noMilestone ? [] : ['-m', 'm-0']), ...(opts.status ? ['-s', opts.status] : [])]);
  git(board, 'add', '-A'); git(board, 'commit', '-q', '-m', 'fixture');
  if (['build', 'fix'].includes(opts.type ?? '') && !opts.noMilestone && !opts.noEvidence) plantEvidence(board, task);
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
    expect(spec.extra.join('\n')).toContain('scripts/deepseek-review.js review <diff file>'); // RR-0374: output lenses only, no plan review command
  });
  // task-436 T1 (RR-0385, decision-170): the builder's model is printed on the line directly before BRIEF-FILE and the split is in the brief's extra
  it('T1 dry run: the second-to-last line is AGENT-MODEL: opus, the last is BRIEF-FILE, and extra carries the Opus/Sonnet split', () => {
    const f = fixture();
    const r = lane(f, ['--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines[lines.length - 2]).toMatch(/^AGENT-MODEL: opus \(RR-0385/);
    expect(lines[lines.length - 1]).toMatch(/^BRIEF-FILE: /);
    const spec = JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null');
    expect(spec, r.stdout).not.toBeNull();
    expect(spec.extra.join('\n')).toContain('runs on Opus');
    expect(spec.extra.join('\n')).toContain('every grounder run on Sonnet');
  });
  // task-437 T1 (RR-0385 items 3 and 4, decision-170): the brief states the two-round rule and the round-2 MED form
  it('task-437 T1 dry run: extra states two output rounds at most, the round-2 MED form ruling:RR-0385 and LOW/NIT not fixed or folded; no "r3, ..."', () => {
    const f = fixture();
    const r = lane(f, ['--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    const spec = JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null');
    expect(spec, r.stdout).not.toBeNull();
    const extra = spec.extra.join('\n') as string;
    expect(extra).toContain('two output rounds at most');
    expect(extra).toContain('ruling:RR-0385');
    expect(extra).toContain('not fixed or folded');
    expect(extra).not.toContain('r3, ...');
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
    expect(fs.existsSync(path.join(f.wt, `docs/reports/reviews/${f.task}/context-r1.md`))).toBe(true);
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
  // task-436 T2 and T3 (RR-0385, decision-170). The model line is written as a literal: the script exports nothing (GROUNDER-PLAN.md, plan-plan-review-deepseek#19).
  const MODEL_LINE = 'Model (RR-0385, decision-170): this lane is the building seat and runs on Opus; the reality-check, integration and regression seats and every grounder run on Sonnet; the review lenses are DeepSeek.';
  it('T2 real launch: the line before the last is AGENT-MODEL: opus and BRIEF.md carries the split; the last line is still BRIEF-FILE', () => {
    const f = fixture();
    const r = lane(f, ['--no-launchd']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines[lines.length - 2]).toMatch(/^AGENT-MODEL: opus \(RR-0385/);
    expect(lines[lines.length - 1]).toMatch(/^BRIEF-FILE: \S+ sha256=[0-9a-f]{64}$/);
    expect(fs.readFileSync(path.join(f.base, 'lane-dir/BRIEF.md'), 'utf8')).toContain('runs on Opus');
  });
  it('T3 (a) --spec with no extra: the merged extra ends with the model line, once', () => {
    const f = fixture();
    const spec = path.join(f.base, 'mine.json');
    fs.writeFileSync(spec, JSON.stringify({ lane: 'BL-T1', goal: 'g', outputs: ['o'], writeScope: [f.base], groups: ['F'] }));
    const r = lane(f, ['--no-launchd', '--spec', spec]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const extra = JSON.parse(fs.readFileSync(path.join(f.base, 'lane-dir/task.merged.json'), 'utf8')).extra as string[];
    expect(extra[extra.length - 1]).toBe(MODEL_LINE);
    expect(extra.filter((x) => x === MODEL_LINE)).toHaveLength(1);
  });
  it('T3 (b) --spec whose extra already holds the model line: it ends with it, once (survive-the-fix lock)', () => {
    const f = fixture();
    const spec = path.join(f.base, 'mine.json');
    fs.writeFileSync(spec, JSON.stringify({ lane: 'BL-T1', goal: 'g', outputs: ['o'], writeScope: [f.base], groups: ['F'], extra: ['own extra', 'Compliance lens, ONCE PER RULE LIST (given)', MODEL_LINE] }));
    const r = lane(f, ['--no-launchd', '--spec', spec]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const extra = JSON.parse(fs.readFileSync(path.join(f.base, 'lane-dir/task.merged.json'), 'utf8')).extra as string[];
    expect(extra[extra.length - 1]).toBe(MODEL_LINE);
    expect(extra.filter((x) => x === MODEL_LINE)).toHaveLength(1);
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
    if (type === 'build' || type === 'fix') plantEvidence(f.board, f.task);
    const r = lane(f, ['--dry-run']);
    const spec = JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null');
    expect(spec, r.stdout + r.stderr).not.toBeNull();
    return spec.extra.join('\n') as string;
  };
  it('a build on a surface: code-review alone (task-460: no compliance, ux or error-paths at output), in parallel, outputs out-<lens>.txt (no plan lens: RR-0374), a separate grounder rules in GROUNDER.md; no security', () => {
    const e = lensBrief('build', 'mobile/app/(app)/x.tsx, src/tests/');
    expect(e).toContain('lens-code-review.md');
    for (const l of ['lens-compliance.md', 'lens-ux.md', 'lens-error-paths.md', 'lens-security.md']) expect(e).not.toContain(l);
    expect(e).not.toContain('plan-review-deepseek.md'); // task-423 D2: the brief orders no plan stage
    expect(e).not.toMatch(/plan review/i);
    expect(e).toMatch(/output review/i);
    expect(e).toContain('in parallel');
    // the output names agree with the layout sentence and the close check (task-407 fold: the old r1-<lens>.txt / round 2 / TRIAGE.md wording contradicted both)
    expect(e).toContain('outputs out-<lens>.txt in the lane report dir');
    expect(e).not.toContain('outputs plan-<lens>.txt');
    expect(e).not.toContain('r1-<lens>.txt');
    expect(e).not.toContain('TRIAGE.md');
    expect(e).toContain('a separate grounder rules every finding in GROUNDER.md');
    expect(e).toContain('NEVER run one generic pass');
  });
  // task-407 (V2.LAYOUT): the close check reads lens outputs only directly in docs/reports/lanes/<date>/<lane>/ (plan-/out-/in- names); two lanes filed in subfolders because the brief never said so.
  // one text in two files (brief: backlog-lane.mjs, refusal: scripts/hooks/check-lane-close.mjs): parity pin, the shared fragments must be in both sources
  const LAYOUT_NAMES = 'plan-<lens>[-<list id>][-pN].txt, out-<lens>[-<list id>][-pN].txt, in-<same name>';
  it('PARITY: the layout fragments the brief states are the ones the close check refusal states (names, subfolder examples, the rN round form, fix-*.txt)', () => {
    const src = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
    for (const p of ['scripts/analysis/backlog-lane.mjs', 'scripts/hooks/check-lane-close.mjs']) {
      for (const frag of [LAYOUT_NAMES, '(lens-plan/, lens-out/, stage2/)', 'out-<lens>[-<list id>]-rN.txt', 'fix-*.txt', 'never stands in for a round-1 name']) expect(src(p), `${p} lacks: ${frag}`).toContain(frag); // task-448 (RR-0424): the brief and the refusal message say the same
    }
  });
  it('every brief, build or record-only, states the one folder, the file names, the round-2 form and that the compliance lens reviews the whole change (split, never trimmed)', () => {
    for (const e of [lensBrief('build', 'scripts/analysis/x.mjs, src/tests/'), lensBrief('record', 'docs/specs/00-architecture/08_agents.md')]) {
      expect(e).toMatch(/REVIEW FILES GO IN ONE PLACE: docs\/reports\/lanes\/\d{4}-\d{2}-\d{2}\/\S+\/ directly \(no subfolders/);
      expect(e).toContain(LAYOUT_NAMES);
      expect(e).toContain('in-<same name>');
      expect(e).toContain('out-<lens>[-<list id>]-rN.txt');
      expect(e).toContain('under the SAME names'); // task-448 (RR-0422): a fix round re-makes the review files under the same names
      expect(e).toContain('fix-*.txt');
      // V2.WHOLE (task-410): lens-input splits the rule list at its headings AND, when the diff leaves no room for a list part, the DIFF at file boundaries (the tool, never by hand)
      expect(e).toContain('Every output lens reviews the WHOLE change'); // task-460 (plan Q6)
      expect(e).toContain('git -c core.quotepath=false diff --no-ext-diff --no-textconv --text --full-index --diff-algorithm=myers --indent-heuristic --inter-hunk-context=0 --no-color --no-renames --src-prefix=a/ --dst-prefix=b/ -U3');
      expect(e).toMatch(/\$\(git log refs\/heads\/\S+ --first-parent --reverse --format=%H -S@lane-\S+ -- 'backlog\/tasks\/[^']+' \| head -1\) HEAD -- /);
      expect(e).toContain('the base is the task\'s launch commit on the board');
      expect(e).toContain("':(exclude,glob)docs/reports/lanes/**' ':(exclude,glob)docs/reports/reviews/**'");
      expect(e).toContain('lens-input splits the rule list at its headings and, when the diff leaves no room for a list part, splits the DIFF at file boundaries into chunks (never by hand, never inside a file)');
      expect(e).toContain('each chunk goes against every list part');
      expect(e).toContain('stamped chunk c of m with its path list');
      expect(e).toContain('out-<lens>-pN.txt');
      expect(e).toContain('one file alone over the room is refused naming the file and its size: report that to the orchestrator at once');
      expect(e).toContain('The close check recomputes the changed paths of the task range');
      expect(e).toContain('closes in TWO commits (Spec 137 Rule 3 as amended for lane build and fix tasks): the work (code, tests, task notes) lands first; the closing commit carries only the lane');
      expect(e).not.toMatch(/the diff is never split or trimmed to core files/);
      expect(e).not.toMatch(/puts the whole diff in every part/);
      expect(e).not.toMatch(/a diff over the review tool's bound is split/);
    }
  });
  // task-375 FIX.TOOLS D11 (Spec 08 section 7 rule 4 dated note, 08_agents.md:338; scripts/deepseek-review.js:189 fills "(no pasted context provided)" when --context is absent):
  // every plan lens command carries --context, as the output lens commands do.
  it('task-423 D2: the brief orders no plan lens; every output lens command carries --context, and the --context value is not a flag', () => {
    const e = lensBrief('build', 'scripts/analysis/x.mjs, src/tests/');
    expect(e).not.toMatch(/Plan review lenses/);
    const seg = /Output review lenses[^:]*: ([\s\S]*?)\. Compliance lens/.exec(e)?.[1] ?? '';
    const cmd = /each `([^`]+)`/.exec(seg)?.[1] ?? '';
    expect(seg).toContain('lens-code-review.md');
    expect(cmd).toContain('scripts/deepseek-review.js review');
    expect(cmd).toMatch(/--template \.claude\/review-templates\/<lens file> --context docs\/reports\/reviews\/\S+\/context-r2\.md --section "Task"/);
  });
  // task-375 A3: every lens command passes the committed context (context-r1.md) and one --section per CONTEXT_SECTIONS entry; no command leaves a lens on the placeholder
  it('A3: plan, output and compliance commands all pass the committed context and the five sections; the date name and the pasted-context placeholder are gone', () => {
    const e = lensBrief('build', 'scripts/analysis/x.mjs, src/tests/');
    const SECT = '--section "Task" --section "Description" --section "Acceptance criteria" --section "Decisions naming this task" --section "Implementation Notes"';
    const ctx = /docs\/reports\/reviews\/\S+?\/context-r2\.md/.exec(e)?.[0] ?? '(none)';
    expect(ctx).not.toBe('(none)');
    const cmds = e.match(/scripts\/deepseek-review\.js review [^`]*/g) ?? [];
    expect(cmds.length).toBeGreaterThanOrEqual(1); // the output lens command (task-460: no compliance command for a build); no plan lens (RR-0374)
    for (const c of cmds) { expect(c, c).toContain(`--context ${ctx}`); expect(c, c).toContain(SECT); }
    expect(e).not.toContain('<pasted-context file>');
    expect(e).not.toMatch(/context-<date>|context-20\d\d/);
    expect(e).not.toContain('lens-input --list L'); // task-460: a build brief orders no compliance run at output
    expect(lensBrief('check', 'scripts/analysis/x.mjs, src/tests/')).toContain('lens-input --list L --context docs/reports/reviews/'); // the per-document form is the default (RR-0374) where lists are asked
    expect(e).not.toContain('plan: --material-from'); // no plan stage
    expect(e).toMatch(/lens-input --context \S+ --material <diff file>/);
  });
  // task-432 (INPUTS.4, RR-0378 step 5, 08_agents.md:529): the lens line gives the lane the command that makes the next context file each review round
  it('T4: the lens line of a build brief and of a record brief holds the re-run command with --task, --lane, --stage, --root <worktree> and --board <board>, and the word highest-numbered', () => {
    for (const type of ['build', 'record'] as const) {
      const f = fixture();
      const dir = path.join(f.board, 'backlog/tasks');
      const file = path.join(dir, fs.readdirSync(dir).find((n) => n.startsWith(f.task))!);
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Launch description text.', 'Launch description text. Files: scripts/analysis/x.mjs, src/tests/').replace(/^labels: .*$/m, (m) => `${m}\ntype: ${type}`));
      if (type === 'build') plantEvidence(f.board, f.task);
      const r = lane(f, ['--dry-run']);
      const e = (JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null') as { extra: string[] } | null)?.extra.join('\n') ?? '';
      expect(e, r.stdout + r.stderr).not.toBe('');
      expect(e).toContain(`node scripts/analysis/backlog-brief.mjs --task ${f.task} --lane BL-T1 --stage 1 --root ${f.wt} --board ${f.board} > /dev/null`);
      expect(e).toContain('highest-numbered context-rN.md');
      expect(e).toContain('Fresh context every review round');
    }
  });
  it('task-460 (RR-0464): no security lens at output when the Files line touches entitlements, auth, stripe or a metered route; the grounder reads those files for exploit paths', () => {
    for (const files of ['src/lib/entitlements.ts', 'src/app/api/auth/x.ts', 'src/lib/stripe/webhook.ts', 'src/app/api/parcels/lookup/route.ts (metered route)']) {
      expect(lensBrief('build', files), files).not.toContain('lens-security.md');
      expect(lensBrief('build', files), files).toContain('exploit paths');
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
  // task-445 (FINAL.8, RR-0391): the launch brief names the security lens for an API route or library path
  it('B1: a build on an API route or a src/lib path names no lens-security.md at output (task-460, RR-0464); control: a front-end component does not either', () => {
    for (const files of ['src/app/api/parcels/search/route.ts', 'src/lib/massing/geometry.ts']) expect(lensBrief('build', files), files).not.toContain('lens-security.md');
    expect(lensBrief('build', 'src/components/x.tsx')).not.toContain('lens-security.md');
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
    expect(inputs).not.toContain('storage-doc16'); // task-448 (RR-0421 item 3 a)
    expect(inputs).toContain('backlog/docs/increments/doc-1 - Increment-F-requirements.md');
  });
  it('task-423 (d), RR-0374: the lens line orders the per-document compliance review at the output stage only (one run per resolved list), names the joined command in one clause as an accepted form that is not the default, and no longer says to copy plan-*.txt', () => {
    // task-460: the list text is pinned on a check brief (a build or fix brief asks no list at output, asserted at the end of this case)
    const { extra } = dry({ files: 'mobile/src/app/x.tsx, src/app/api/parcels/search/route.ts', type: 'check' });
    expect(extra).not.toContain('out-compliance-storage-doc16'); // task-448 (RR-0421 item 3 a)
    for (const l of ['mobile-98', 'inc-F']) {
      expect(extra).toContain('out-compliance-' + l);
      expect(extra).not.toContain('plan-compliance-' + l);
    }
    // task-438 T5 (RR-0385 item 2): the engineering standards list goes to the engineering seat, with its own template; never under the compliance name
    // task-431 (RR-0385 item 7): the phone file resolves eng-front + eng-shared and the API route (back end: ui-app no longer matches src/app/api) eng-back + eng-shared, so the brief names three engineering outputs and no eng-all
    for (const l of ['eng-front', 'eng-back', 'eng-shared']) {
      expect(extra).toContain('out-engineering-' + l);
      expect(extra).not.toContain('out-compliance-' + l);
    }
    expect(extra).not.toContain('out-engineering-eng-all');
    expect(extra).not.toContain('plan-engineering-eng-all');
    // planted defect: the table with ui-app matching src/app/api again (its `not` removed) brings eng-all back (the de-dup keeps the whole list)
    {
      const f = fixture({ files: 'mobile/src/app/x.tsx, src/app/api/parcels/search/route.ts' }); // no type: the launch plan gate (build/fix) would judge the evidence planted for the real table
      const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as { rows: { id: string; not?: string[] }[] };
      for (const row of t.rows) if (row.id === 'ui-app') delete row.not;
      const fake = path.join(f.base, 'ui-app-without-not.json');
      fs.writeFileSync(fake, JSON.stringify(t));
      const r = run('node', [SCRIPT, ...f.args, '--dry-run', '--rule-lists', fake], { env: { ...ID, RULE_LISTS_ALLOW_OVERRIDE: '1' } });
      const planted = (JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null')?.extra ?? []).join('\n') as string;
      expect(planted, r.stdout + r.stderr).toContain('out-engineering-eng-all');
    }
    expect(extra).toContain('lens-engineering.md');
    expect(extra).toContain('ONCE PER RULE LIST');
    expect(extra).not.toContain('ONE JOINED RUN PER STAGE');
    expect(extra).toContain('lens-input --list L --context');
    expect(extra).toMatch(/accepted form that is not the default[^.]*RR-0374/);
    expect(extra).toContain('--list rules --lists');
    expect(extra).not.toContain('copy plan-*.txt');
    expect(extra).not.toContain('plan: --material-from');
    expect(extra).not.toMatch(/Plan review lenses/);
    expect(extra).toContain('scripts/analysis/rule-lists.mjs lens-input');
    expect(extra).toMatch(/a separate grounder rules on every finding/);
    expect(extra).toContain('GROUNDER.md');
    const b = dry({ files: 'mobile/src/app/x.tsx, src/app/api/parcels/search/route.ts', type: 'build' }).extra;
    expect(b).toContain('lens-code-review.md');
    expect(b).not.toContain('lens-error-paths.md');
    expect(b).not.toContain('out-compliance-');
    expect(b).not.toContain('out-engineering-');
    expect(b).toContain('ONCE PER RULE LIST');
  });
  it('A3/D2: the extra block carries no plan review line (the plan is reviewed before launch, RR-0374)', () => {
    const { extra } = dry({ files: 'scripts/analysis/x.mjs, src/tests/', type: 'build' });
    expect(extra).not.toMatch(/Review \(review mode/);
    expect(extra).not.toContain('plan-review-deepseek.md');
  });
  // task-375 B1: the take adds the compliance:<list id> <file> references, only the ids the task does not carry yet
  it('B1: the take command adds one compliance reference per resolved list; a list already referenced is not added again', () => {
    const f = fixture({ files: 'scripts/analysis/thing.mjs', type: 'build' });
    const lists = (JSON.parse(run('node', ['scripts/analysis/rule-lists.mjs', 'resolve', '--files', 'scripts/analysis/thing.mjs', '--type', 'build', '--letter', 'F'], { cwd: ROOT }).stdout) as { lists: { id: string; file: string }[] }).lists;
    const take = (o: string) => /^\$ cd \S+ && .*task edit \S+ -s RUNNING.*$/m.exec(o)?.[0] ?? '';
    const r1 = lane(f, ['--dry-run']);
    const t1 = take(r1.stdout);
    expect(t1).toBeTruthy();
    expect([...t1.matchAll(/--add-ref 'compliance:/g)]).toHaveLength(lists.length);
    for (const l of lists) expect(t1).toContain(`--add-ref 'compliance:${l.id} ${l.file}'`);
    backlog(f.board, ['task', 'edit', f.task, '--add-ref', `compliance:${lists[0]!.id} an older path`]);
    const t2 = take(lane(f, ['--dry-run']).stdout);
    expect([...t2.matchAll(/--add-ref 'compliance:/g)]).toHaveLength(lists.length - 1);
    expect(t2).not.toContain(`'compliance:${lists[0]!.id} `);
  });
  // task-375 D5: the launch gate
  it('D: a build launch with no plan evidence on the board is refused, one line per missing item, nothing taken, in dry-run too (no flag turns it off)', () => {
    const f = fixture({ files: 'scripts/analysis/thing.mjs', type: 'build', noEvidence: true });
    for (const extra of [['--dry-run'], []]) {
      const r = lane(f, extra);
      expect(r.status, r.stdout + r.stderr).toBe(3);
      const lines = r.stderr.trim().split('\n');
      expect(lines[0]).toMatch(/refused: plan gate: .*no plan evidence folder docs\/reports\/reviews\/task-\d+\//);
      expect(lines.length).toBeGreaterThan(1);
      expect(statusOf(f)).toBe('LATER');
      expect(fs.existsSync(f.wt)).toBe(false);
    }
  });
  it('D: with the evidence the dry-run prints "plan gate ok: <L> lists" with L the resolved-list count and the Plan hash; a one-word edit of the task refuses with the new expected Plan line', () => {
    const f = fixture({ files: 'scripts/analysis/thing.mjs', type: 'build' });
    const L = (JSON.parse(run('node', ['scripts/analysis/rule-lists.mjs', 'resolve', '--files', 'scripts/analysis/thing.mjs', '--type', 'build', '--letter', 'F'], { cwd: ROOT }).stdout) as { lists: unknown[] }).lists.length;
    const ok = lane(f, ['--dry-run']);
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(new RegExp(`plan gate ok: ${L} lists, \\d+ findings, Plan sha256:[0-9a-f]{12}`));
    backlog(f.board, ['task', 'edit', f.task, '--append-notes', 'one more word']);
    const bad = lane(f, ['--dry-run']);
    expect(bad.status, bad.stdout + bad.stderr).toBe(3);
    expect(bad.stderr).toMatch(/is not the hash of the task as it is now[\s\S]*expected: Plan: task-\d+ sha256:[0-9a-f]{12}/);
    expect(bad.stderr).toMatch(/FOLD-CHECK\.md: the Plan line "Plan: task-\d+ sha256:[0-9a-f]{12}" is not the hash of the task as it is now[\s\S]*expected: Plan: task-\d+ sha256:[0-9a-f]{12}/);
    expect(statusOf(f)).toBe('LATER');
  });
  it('task-419 (a): a board whose evidence folder lacks FOLD-CHECK.md (committed) is refused at the launch dry run naming the file; with the file back the dry run prints "plan gate ok"', () => {
    const f = fixture({ files: 'scripts/analysis/thing.mjs', type: 'build' });
    const fold = path.join(f.board, 'docs/reports/reviews', f.task, 'FOLD-CHECK.md');
    const text = fs.readFileSync(fold, 'utf8');
    expect(text).toMatch(/^Checked by: Fold-G1$/m);
    expect(lane(f, ['--dry-run']).status).toBe(0); // control: the planted evidence passes
    git(f.board, 'rm', '-q', fold);
    const c = git(f.board, 'commit', '-q', '-m', 'drop the fold check');
    expect(c.status, c.stdout + c.stderr).toBe(0);
    const bad = lane(f, ['--dry-run']);
    expect(bad.status, bad.stdout + bad.stderr).toBe(3);
    expect(bad.stderr).toMatch(/FOLD-CHECK\.md is missing/);
    expect(statusOf(f)).toBe('LATER');
    // the folder is read from the board HEAD: a copy that is ignored (so the board is clean) and not committed is not seen
    fs.appendFileSync(path.join(f.board, '.git/info/exclude'), 'docs/reports/reviews/*/FOLD-CHECK.md\n');
    fs.writeFileSync(fold, text);
    const ign = lane(f, ['--dry-run']);
    expect(ign.status, ign.stdout + ign.stderr).toBe(3);
    expect(ign.stderr).toMatch(/FOLD-CHECK\.md is missing/);
    git(f.board, 'add', '-f', fold);
    const c2 = git(f.board, 'commit', '-q', '-m', 'the fold check again');
    expect(c2.status, c2.stdout + c2.stderr).toBe(0);
    const ok = lane(f, ['--dry-run']);
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/plan gate ok/);
  });
  it('D: a task of another type (record) is not gated and launches with no plan evidence', () => {
    const f = fixture({ files: 'docs/specs/00-architecture/08_agents.md', type: 'record' });
    const r = lane(f, ['--dry-run']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toContain('plan gate');
  });
  it('g375#2: a board that already holds context-r1.md (the plan evidence): the lens lines name the file the brief wrote (context-r2.md), in the dry-run and in the real launch', () => {
    const f = fixture({ files: 'scripts/analysis/thing.mjs', type: 'build' });
    expect(fs.existsSync(path.join(f.board, `docs/reports/reviews/${f.task}/context-r1.md`))).toBe(true);
    const d = lane(f, ['--dry-run']);
    expect(d.stdout).toContain(`docs/reports/reviews/${f.task}/context-r2.md`);
    expect(d.stdout).not.toContain(`docs/reports/reviews/${f.task}/context-r1.md --`);
    const r = lane(f, ['--no-launchd']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const spec = JSON.parse(fs.readFileSync(path.join(f.base, 'lane-dir/task.json'), 'utf8')) as { extra: string[] };
    const named = /docs\/reports\/reviews\/\S+?\/(context-r\d+\.md)/.exec(spec.extra.join('\n'))?.[1];
    const written = fs.readdirSync(path.join(f.wt, `docs/reports/reviews/${f.task}`)).filter((n) => /^context-r\d+\.md$/.test(n)).sort().pop();
    expect(named).toBe(written);
    expect(named).toBe('context-r2.md');
  });
  it('task-375 suite fix: a launch dry-run run with GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE of ANOTHER repository set (as inside a hook) still reads the board it was given', () => {
    const f = fixture({ files: 'scripts/analysis/thing.mjs', type: 'build' });
    const real = run('git', ['rev-parse', '--absolute-git-dir'], { cwd: ROOT }).stdout.trim();
    const r = spawnSync('node', [SCRIPT, ...f.args, '--dry-run'], { encoding: 'utf8', env: { ...process.env, ...ID, GIT_DIR: real, GIT_INDEX_FILE: path.join(real, 'index'), GIT_WORK_TREE: ROOT } });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/plan gate ok: \d+ lists/);
  });
  it('a Files path no row matches is refused at launch with the path named (exit 3, one line, nothing written)', () => {
    const f = fixture({ files: 'scripts/analysis/thing.mjs, zzz-nothing/new.txt' });
    refused(lane(f), /zzz-nothing\/new\.txt/);
    expect(fs.existsSync(f.wt)).toBe(false);
    expect(statusOf(f)).toBe('LATER');
  });
  it('a task with no Files line is refused, but a record-only task gets the every-task lists (the queue lists are off since task-448, RR-0418)', () => {
    refused(lane(fixture({ files: null })), /no Files/);
    const { r, inputs } = dry({ files: null, type: 'record' });
    expect(r.status, r.stderr).toBe(0);
    expect(inputs).not.toContain('137_mcqueue.md');
    expect(inputs).toContain('plan-protocol.md');
  });
  it('ATTACK 11: --rule-lists with a table other than the repo one is refused unless the test env var is set; a Files line of only exempt paths for a build task is refused', () => {
    const f = fixture();
    const fake = path.join(f.base, 'fake-table.json');
    fs.writeFileSync(fake, JSON.stringify({ contract_version: 1, lists: {}, rows: [{ id: 'all', globs: ['**'], lists: [], why: 'x' }], exempt: [], increment_docs: { F: 'none' } }));
    const r = lane(f, ['--dry-run', '--rule-lists', fake]);
    refused(r, /--rule-lists/);
    console.log(`ATTACK 11: REFUSED: ${r.stderr.trim().slice(0, 200)}`);
    const ok = run('node', [SCRIPT, ...f.args, '--dry-run', '--rule-lists', fake], { env: { ...ID, RULE_LISTS_ALLOW_OVERRIDE: '1' } });
    expect(ok.status, ok.stdout + ok.stderr).toBe(3); // D4 (task-453): the run stops on the fake table's own content, not on the override
    expect(ok.stderr).toMatch(/cannot read the rule-list table or one of its path maps/);
    expect(ok.stderr).not.toMatch(/--rule-lists/);
    const e = fixture({ files: 'docs/reports/lanes/x/', type: 'build' });
    refused(lane(e), /no rule list/);
  });
  it('a real launch with --spec (what the orchestrator runs) still writes the rule-list block and the per-list lens line into the brief it tells the lane to read', () => {
    const f = fixture({ files: 'mobile/src/app/x.tsx, src/app/api/parcels/search/route.ts', type: 'build' });
    const spec = path.join(f.base, 'mine.json');
    fs.writeFileSync(spec, JSON.stringify({ lane: 'BL-T1', goal: 'g', inputs: ['own input'], outputs: ['o'], writeScope: [f.base], groups: ['F'], extra: ['own extra'] }));
    const r = lane(f, ['--no-launchd', '--spec', spec]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const brief = fs.readFileSync(path.join(f.base, 'lane-dir/BRIEF.md'), 'utf8');
    expect(brief).toContain('Rule lists that govern this task');
    expect(brief).toContain('mobile-98: docs/specs/03-mobile/98_mobile_testing_protocol.md');
    expect(brief).not.toContain('storage-doc16');
    expect(brief).not.toContain('out-compliance-mobile-98'); // task-460: no list at the output of a build
    expect(brief).toContain('Compliance lens, ONCE PER RULE LIST'); // the marker the --spec merge reads
    expect(brief).toContain('own input');
    expect(brief).toContain('own extra');
    expect(fs.readFileSync(spec, 'utf8')).not.toContain('Rule lists that govern'); // the orchestrator's own file is not rewritten
  });
  // V2.LIST round 2 (task-406): launch refuses an incomplete resolved set and a build task with no milestone (its objectives cannot be attached)
  it('launch refuses a build task with no milestone, and a table whose every_task is empty; the control launches (dry-run)', () => {
    expect(lane(fixture(), ['--dry-run']).status).toBe(0);
    refused(lane(fixture({ noMilestone: true, type: 'build' }), ['--dry-run']), /no milestone/);
    const f = fixture();
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as Record<string, unknown>;
    t.every_task = [];
    const fake = path.join(f.base, 'empty-every-task.json');
    fs.writeFileSync(fake, JSON.stringify(t));
    const r = run('node', [SCRIPT, ...f.args, '--dry-run', '--rule-lists', fake], { env: { ...ID, RULE_LISTS_ALLOW_OVERRIDE: '1' } });
    expect(r.status, r.stdout + r.stderr).toBe(3);
    expect(r.stderr).toMatch(/every_task/);
  });
  it('a milestone letter with no increment requirements document is refused naming the letter', () => {
    refused(lane(fixture({ letter: 'Q' })), /increment.*Q|Q.*increment/);
  });
});

// ---- task-418 (LAUNCH.PREP): `rule-lists.mjs plan-prep <review|post|commit>` runs the mechanical steps before a build launch; it rules nothing (PLAN-418-v2). ----
// Fixture: the temp board above and plantEvidence (the evidence writer of task-375 D; no second writer is built). --review-bin is the test-only seam that replaces scripts/deepseek-review.js.
// Every spawned-CLI test first asserts the exit status and the first output line before any absence assertion (R-CP, 124a:296).
const RL = path.join(ROOT, 'scripts/analysis/rule-lists.mjs');
const DUMMY_ENV = (() => { const d = tmp('dotenv'); const p = path.join(d, 'env'); fs.writeFileSync(p, 'UNUSED=1\n'); return p; })();
const STUB = (() => {
  const p = path.join(tmp('stub'), 'review-stub.mjs');
  fs.writeFileSync(p, `import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const a = process.argv; const file = a[3]; const tpl = path.basename(a[a.indexOf('--template') + 1]); const mode = process.env.STUB_MODE || '';
if (process.env.STUB_FAIL && path.basename(file).includes(process.env.STUB_FAIL)) { console.error('stub: failing on ' + file); process.exit(1); }
console.log('[dotenv] injected 0 variables');
if (mode !== 'nohdr') console.log('REVIEW template=' + tpl + ' model=stub at=2026-11-21T00:00:00.000Z file_sha256=' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') + ' prompt_sha256=' + 'c'.repeat(64));
console.log('body');
if (mode !== 'noverdict') console.log('VERDICT: PASS on stub');
`);
  return p;
})();
type PF = Fx & { rev: string };
function prepFixture(opts: { type?: string; files?: string | null; status?: string; plan?: string | null; evidence?: boolean } = {}): PF {
  const f = fixture({ type: opts.type ?? 'build', ...(opts.files !== undefined ? { files: opts.files } : {}), noEvidence: !opts.evidence });
  git(f.board, 'config', 'user.name', 't'); git(f.board, 'config', 'user.email', 't@t'); // plan-prep runs git with a GIT_*-free environment: the identity comes from the repository
  if (!opts.evidence) {
    const rs = run('node', [RL, 'resolve', '--root', f.board, '--files', opts.files ?? 'scripts/analysis/thing.mjs', '--type', opts.type ?? 'build', '--letter', 'F']);
    for (const l of rs.status === 0 ? (JSON.parse(rs.stdout) as { lists: { file: string }[] }).lists : []) { fs.mkdirSync(path.dirname(path.join(f.board, l.file)), { recursive: true }); fs.copyFileSync(path.join(ROOT, l.file), path.join(f.board, l.file)); }
    git(f.board, 'add', '-A'); git(f.board, 'commit', '-q', '-m', 'lists');
    if (opts.plan !== null) backlog(f.board, ['task', 'edit', f.task, '--plan', opts.plan ?? 'step 1: do the thing; step 2: test it']);
  }
  if (opts.status) backlog(f.board, ['task', 'edit', f.task, '-s', opts.status]);
  return { ...f, rev: path.join(f.base, 'rev') };
}
const prep = (f: Fx, phase: string, extra: string[] = [], env: Record<string, string> = {}) => run('node', [RL, 'plan-prep', phase, '--task', f.task, '--lane', 'BL-T1', '--board', f.board, '--backlog-bin', backlogBin(), '--launch-args', JSON.stringify(f.args.slice(6)), ...extra], { env: { ...ID, DEEPSEEK_API_KEY: 'dummy', DOTENV_CONFIG_PATH: DUMMY_ENV, ...env } });
const review = (f: Fx, extra: string[] = [], env: Record<string, string> = {}) => prep(f, 'review', ['--review-bin', STUB, ...extra], env);
const dirOf = (f: Fx) => path.join(f.board, 'docs/reports/reviews', f.task);
const names = (f: Fx, re: RegExp) => (fs.existsSync(dirOf(f)) ? fs.readdirSync(dirOf(f)).filter((n) => re.test(n)).sort() : []);
const first = (r: { stdout: string; stderr: string }) => (r.stdout + r.stderr).split('\n').find((l) => l.trim()) ?? '';
const refusal = (r: { status: number | null; stdout: string; stderr: string }, re: RegExp) => { expect(r.status, r.stdout + r.stderr).toBe(3); expect(r.stderr.trim().split('\n')).toHaveLength(1); expect(r.stderr).toMatch(/^plan-prep: refused: /); expect(r.stderr).toMatch(re); };
const taskFile = (f: Fx) => path.join(f.board, 'backlog/tasks', fs.readdirSync(path.join(f.board, 'backlog/tasks')).find((n) => n.startsWith(`${f.task} -`)) as string);
const planText = (f: Fx) => /<!-- SECTION:PLAN:BEGIN -->([\s\S]*?)<!-- SECTION:PLAN:END -->/.exec(fs.readFileSync(taskFile(f), 'utf8'))?.[1] ?? '';
const status = (f: Fx) => git(f.board, 'status', '--porcelain').stdout;

describe('plan-prep review (task-418): refusals, one line, nothing written; each with its control', () => {
  it('1: an empty Implementation Plan field is refused (exit 3, nothing written); with a plan the same board proceeds', () => {
    const f = prepFixture({ plan: null });
    refusal(review(f), /Implementation Plan/);
    expect(fs.existsSync(dirOf(f))).toBe(false);
    backlog(f.board, ['task', 'edit', f.task, '--plan', 'a plan']);
    const ok = review(f);
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(names(f, /^context-r1\.md$/)).toHaveLength(1);
  });
  it('2: a task that is not LATER or WAITS, a Files path no row matches and a record task are refused; a resolving LATER build task is not', () => {
    refusal(review(prepFixture({ status: 'RUNNING' })), /not LATER or WAITS.*RUNNING/);
    refusal(review(prepFixture({ files: 'scripts/analysis/thing.mjs, zzz-nothing/new.txt' })), /zzz-nothing\/new\.txt/);
    refusal(review(prepFixture({ type: 'record' })), /type record/);
    const ok = review(prepFixture({ status: 'WAITS' }));
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
  });
  it('3: a dirty file outside backlog/ and the folder is refused; a change inside backlog/ and a node_modules link pass', () => {
    const f = prepFixture();
    fs.writeFileSync(path.join(f.board, 'stray.txt'), 'x');
    refusal(review(f), /dirty outside backlog\/.*stray\.txt/);
    expect(fs.existsSync(dirOf(f))).toBe(false);
    fs.rmSync(path.join(f.board, 'stray.txt'));
    fs.symlinkSync(os.tmpdir(), path.join(f.board, 'node_modules'));
    const ok = review(f);
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
  });
  it('4: a plan-*.txt already in the folder is refused with its bytes unchanged; an empty folder is not', () => {
    const f = prepFixture();
    fs.mkdirSync(dirOf(f), { recursive: true });
    fs.writeFileSync(path.join(dirOf(f), 'plan-compliance-x.txt'), 'old bytes\n');
    refusal(review(f), /plan-compliance-x\.txt/);
    expect(fs.readFileSync(path.join(dirOf(f), 'plan-compliance-x.txt'), 'utf8')).toBe('old bytes\n');
    expect(names(f, /^context-/)).toHaveLength(0);
    fs.rmSync(path.join(dirOf(f), 'plan-compliance-x.txt'));
    expect(review(f).status).toBe(0);
  });
});

describe('plan-prep review: the calls and what they leave', () => {
  it('5: one failing call is named, exit 1, the files of that run are deleted and the re-run succeeds; all succeeding writes every in- and plan- file', () => {
    const f = prepFixture();
    const bad = review(f, [], { STUB_FAIL: 'plan-compliance-agents-s7-s11' }); // task-453 (RR-0450): queue-137 is off the lane-tools row
    expect(bad.status, bad.stdout + bad.stderr).toBe(1);
    expect(bad.stderr).toMatch(/in-plan-compliance-agents-s7-s11\.txt/);
    expect(names(f, /^(in-)?plan-/)).toEqual([]);
    const ok = review(f);
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    const outs = names(f, /^plan-compliance-.*\.txt$/);
    expect(outs.length).toBeGreaterThan(3);
    expect(outs.some((n) => /compliance-rules/.test(n))).toBe(false); // RR-0374: plan-prep produces the per-document form
    expect(names(f, /^in-plan-compliance-.*\.txt$/)).toHaveLength(outs.length);
    expect(names(f, /^plan-(plan-review-deepseek|error-paths)\.txt$/)).toHaveLength(2);
    expect(names(f, /^FINDINGS-PLAN\.md$/)).toHaveLength(1);
  });
  it('6: an output with no REVIEW header in its first 15 lines, or no VERDICT line, is exit 1 naming the file; a banner then the header on line 2 and a VERDICT pass', () => {
    for (const STUB_MODE of ['nohdr', 'noverdict']) {
      const f = prepFixture();
      const r = review(f, [], { STUB_MODE });
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stderr).toMatch(/plan-.*\.txt/);
      expect(names(f, /^(in-)?plan-/)).toEqual([]);
    }
    const f = prepFixture();
    expect(review(f).status).toBe(0);
    const o = fs.readFileSync(path.join(dirOf(f), names(f, /^plan-compliance-.*\.txt$/)[0] as string), 'utf8').split('\n');
    expect(o[0]).toMatch(/dotenv/);
    expect(o[1]).toMatch(/^REVIEW template=lens-compliance\.md /);
  });
  it('7: the inputs equal what the library writes for the same context (the plantEvidence call); another Description gives different inputs', async () => {
    const rl = await import(RL);
    const rt = (await import('node:module')).createRequire(`${ROOT}/x.js`)(`${ROOT}/scripts/lib/review-template.js`);
    const f = prepFixture();
    expect(review(f).status).toBe(0);
    const ctx = fs.readFileSync(path.join(dirOf(f), 'context-r1.md'), 'utf8');
    const table = rl.readTable();
    const rs = rl.resolveTask({ table, root: f.board, body: fs.readFileSync(taskFile(f), 'utf8'), type: 'build', letter: 'F' });
    // task-438 T5: the engineering list's input is named by its seat and sized with its own template
    expect(names(f, /^in-plan-engineering-eng-all/)).toHaveLength(1);
    expect(names(f, /^in-plan-compliance-eng-all/)).toHaveLength(0);
    const seat = (l: { file: string }) => (l.file === 'docs/specs/00_engineering_standards.md' ? 'engineering' : 'compliance');
    for (const l of rs.lists as { id: string; file: string }[]) for (const x of rl.buildLensInputs({ id: l.id, list: table.lists[l.id], root: f.board, material: rt.extractSections(ctx, rt.PLAN_SECTIONS), templateFile: path.join(ROOT, `.claude/review-templates/lens-${seat(l)}.md`), context: rt.extractSections(ctx, rt.CONTEXT_SECTIONS) }))
      expect(fs.readFileSync(path.join(dirOf(f), `in-plan-${seat(l)}-${l.id}${x.suffix}.txt`), 'utf8')).toBe(x.text);
    const g = prepFixture(); backlog(g.board, ['task', 'edit', g.task, '-d', 'another description\n\nFiles: scripts/analysis/thing.mjs']);
    expect(review(g).status).toBe(0);
    const a = names(f, /^in-plan-engineering-eng-all/)[0] as string;
    expect(fs.readFileSync(path.join(dirOf(g), a), 'utf8')).not.toBe(fs.readFileSync(path.join(dirOf(f), a), 'utf8'));
  });
  it('8: with context-r1.md present the phase writes context-r2.md and leaves r1 untouched', () => {
    const f = prepFixture();
    fs.mkdirSync(dirOf(f), { recursive: true });
    fs.writeFileSync(path.join(dirOf(f), 'context-r1.md'), '## Task\nold\n');
    const r = review(f);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(dirOf(f), 'context-r1.md'), 'utf8')).toBe('## Task\nold\n');
    expect(names(f, /^context-r\d+\.md$/)).toEqual(['context-r1.md', 'context-r2.md']);
  });
  it('16: a fix task writes the plan lens outputs and no per-list inputs', () => {
    const f = prepFixture({ type: 'fix' });
    const r = review(f);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(names(f, /^plan-.*\.txt$/)).toEqual(['plan-error-paths.txt', 'plan-plan-review-deepseek.txt']);
    expect(names(f, /^in-/)).toEqual([]);
  });
  it('B2 (task-445): a fix task on a src/lib path also writes plan-security.txt', () => {
    const f = prepFixture({ type: 'fix', files: 'src/lib/massing/geometry.ts' });
    const r = review(f);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(names(f, /^plan-.*\.txt$/)).toEqual(['plan-error-paths.txt', 'plan-plan-review-deepseek.txt', 'plan-security.txt']);
  });
  it('git environment: a foreign GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE (as in a commit hook) still gives a successful review', () => {
    const f = prepFixture();
    const real = run('git', ['rev-parse', '--absolute-git-dir'], { cwd: ROOT }).stdout.trim();
    const r = review(f, [], { GIT_DIR: real, GIT_INDEX_FILE: path.join(real, 'index'), GIT_WORK_TREE: ROOT });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(names(f, /^context-r1\.md$/)).toHaveLength(1);
  });
  it('15: --dry-run on each phase prints the commands (the real tool line included) and leaves the tree byte-identical', () => {
    const f = prepFixture();
    const before = status(f);
    const r = prep(f, 'review', ['--dry-run']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(first(r)).toMatch(/^\$ cd .* && node \S*backlog-brief\.mjs /);
    const li = r.stdout.split('\n').filter((l) => /lens-input/.test(l)).length;
    expect(li).toBeGreaterThan(3);
    expect(r.stdout).not.toMatch(/--list rules/); // RR-0374: the per-document form
    // task-438 T5: one engineering job (eng-all), on its own template; the compliance review lines are the lens-input lines minus the engineering ones
    const liEng = r.stdout.split('\n').filter((l) => /lens-input .*--out \S*in-plan-engineering-eng-all --template \S*lens-engineering\.md/.test(l)).length;
    expect(liEng).toBe(1);
    expect(r.stdout.split('\n').filter((l) => /scripts\/deepseek-review\.js review \S*in-plan-engineering-eng-all\S* --template \.claude\/review-templates\/lens-engineering\.md/.test(l))).toHaveLength(1);
    expect(r.stdout).not.toMatch(/in-plan-compliance-eng-all/);
    expect(r.stdout.split('\n').filter((l) => /scripts\/deepseek-review\.js review .*lens-compliance\.md/.test(l))).toHaveLength(li - liEng);
    expect(r.stdout).toMatch(/DOTENV_CONFIG_PATH=\S+ node -r \S*dotenv\/config scripts\/deepseek-review\.js review \S+ --template \.claude\/review-templates\/plan-review-deepseek\.md --context \S+ --section Task /);
    expect(status(f)).toBe(before);
    expect(fs.existsSync(dirOf(f))).toBe(false);
    const e = prepFixture({ evidence: true });
    const eb = status(e);
    const p = prep(e, 'post', ['--dry-run']);
    expect(p.status, p.stdout + p.stderr).toBe(0);
    const c = prep(e, 'commit', ['--dry-run']);
    expect(c.status, c.stdout + c.stderr).toBe(0);
    expect(c.stdout).toMatch(/backlog-lane\.mjs .*--dry-run/);
    expect(status(e)).toBe(eb);
  });
});

// helpers of the post and commit tests: the state plantEvidence leaves, with the round line and the references stripped, as the agents' work (grounder, seats, fold) is
const seatsOf = (f: Fx) => names(f, /^seat-.*-1\.md$/).map((n) => n.replace(/^seat-|-1\.md$/g, ''));
const stripRound = (f: Fx) => {
  backlog(f.board, ['task', 'edit', f.task, '--plan', 'the plan text of the fixture task']);
  for (const x of [`GROUNDER-PLAN.md`, ...seatsOf(f).map((n) => `seat-${n}-1.md`)]) backlog(f.board, ['task', 'edit', f.task, '--remove-ref', `docs/reports/reviews/${f.task}/${x}`]);
};
const ZERO = (f: Fx) => `Plan review round 1: 0 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder docs/reports/reviews/${f.task}/GROUNDER-PLAN.md; triage docs/reports/reviews/${f.task}/TRIAGE-PLAN.md`;
const refsOf = (f: Fx) => backlog(f.board, ['task', 'view', f.task, '--plain']).stdout;
const sha12 = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
/** A seat finding of severity `sev` that the grounder CONFIRMS, with the Seat line re-stamped, as the agents would leave it. */
function confirmSeat(f: Fx, seat = 'integration', sev = 'HIGH') {
  const d = dirOf(f); const abbr = seat.slice(0, 3);
  const body = `# ${seat} seat\n### ${abbr}#1 ${sev}: a real finding\n`;
  fs.writeFileSync(path.join(d, `seat-${seat}-1.md`), body);
  let g = fs.readFileSync(path.join(d, 'GROUNDER-PLAN.md'), 'utf8');
  g = g.replace(new RegExp(`^${abbr}#1 REJECTED (.*)$`, 'm'), `${abbr}#1 CONFIRMED docs/reports/reviews/${f.task}/seat-${seat}-1.md:2 "${abbr}#1 ${sev}: a real finding" ${sev} real`).replace(new RegExp(`^(Seat: ${seat} \\S+ sha256:)[0-9a-f]{12}$`, 'm'), `$1${sha12(body)}`); // task-453 S1: the verdict quotes its seat line
  fs.writeFileSync(path.join(d, 'GROUNDER-PLAN.md'), g);
}

describe('plan-prep post (task-418)', () => {
  it('9: from the plantEvidence state with the round line and references stripped, post restores the exact zero-form line and the references; run twice, one block', () => {
    const f = prepFixture({ evidence: true });
    stripRound(f);
    expect(planText(f)).not.toMatch(/Plan review round/);
    const r = prep(f, 'post');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(planText(f)).toContain(ZERO(f));
    const v = refsOf(f);
    for (const x of ['GROUNDER-PLAN.md', ...seatsOf(f).map((n) => `seat-${n}-1.md`)]) expect(v).toContain(`docs/reports/reviews/${f.task}/${x}`);
    const again = prep(f, 'post');
    expect(again.status, again.stdout + again.stderr).toBe(0);
    expect(first(again)).toMatch(/nothing to post/);
    expect(planText(f).split('Plan review round 1').length - 1).toBe(1);
  });
  it('9b: a different "Plan review round" line is refused naming it, the task unchanged', () => {
    const f = prepFixture({ evidence: true });
    backlog(f.board, ['task', 'edit', f.task, '--append-plan', 'Plan review round 2: 1 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder g; triage t']);
    const before = planText(f);
    const r = prep(f, 'post');
    expect(r.status, r.stdout + r.stderr).toBe(3);
    expect(r.stderr).toMatch(/Plan review round 2/);
    expect(planText(f)).toBe(before);
  });
  it('10: a CONFIRMED id with no TRIAGE-PLAN.md line is refused naming the id and the task is unchanged; with a folded quote that is in the task it posts', () => {
    const f = prepFixture({ evidence: true });
    stripRound(f);
    confirmSeat(f, 'integration', 'LOW');
    const before = planText(f);
    const r = prep(f, 'post');
    expect(r.status, r.stdout + r.stderr).toBe(3);
    expect(r.stderr).toMatch(/int#1/);
    expect(planText(f)).toBe(before);
    fs.writeFileSync(path.join(dirOf(f), 'TRIAGE-PLAN.md'), 'int#1 folded:"the plan text of the fixture task"\n');
    const ok = prep(f, 'post');
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(planText(f)).toContain('Plan review round 1: 1 folded, 0 task, 0 ruling, 0 wontfix, 0 pile;');
    expect(refsOf(f)).toContain(`docs/reports/reviews/${f.task}/TRIAGE-PLAN.md`);
  });
  it('10b: a folded quote that is NOT in the task is exit 1 (the fold is not finished) and the task is unchanged', () => {
    const f = prepFixture({ evidence: true });
    stripRound(f);
    confirmSeat(f, 'integration', 'LOW');
    fs.writeFileSync(path.join(dirOf(f), 'TRIAGE-PLAN.md'), 'int#1 folded:"words that are nowhere in the task text"\n');
    const before = planText(f);
    const r = prep(f, 'post');
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toMatch(/not in the task text/);
    expect(planText(f)).toBe(before);
  });
  it('12: a missing Seat line (integration, reality-check, regression where a Files path is tracked), an absent seat file and a seat file edited after the grounder are refused; all-new Files need no regression', () => {
    const f = prepFixture({ evidence: true });
    stripRound(f);
    expect(prep(f, 'post').status).toBe(0); // control: all-new Files, no regression seat
    for (const seat of ['integration', 'reality-check']) {
      const g = prepFixture({ evidence: true }); stripRound(g);
      const gp = path.join(dirOf(g), 'GROUNDER-PLAN.md');
      fs.writeFileSync(gp, fs.readFileSync(gp, 'utf8').split('\n').filter((l) => !l.startsWith(`Seat: ${seat} `)).join('\n'));
      const r = prep(g, 'post');
      expect(r.status, r.stdout + r.stderr).toBe(3);
      expect(r.stderr).toContain(`Seat: ${seat}`);
    }
    const t = prepFixture({ evidence: true, files: 'mobile/.keep' }); stripRound(t);
    expect(seatsOf(t)).toContain('regression');
    const gp = path.join(dirOf(t), 'GROUNDER-PLAN.md');
    fs.writeFileSync(gp, fs.readFileSync(gp, 'utf8').split('\n').filter((l) => !l.startsWith('Seat: regression ')).join('\n'));
    const rr = prep(t, 'post');
    expect(rr.status, rr.stdout + rr.stderr).toBe(3);
    expect(rr.stderr).toMatch(/Seat: regression/);
    const a = prepFixture({ evidence: true }); stripRound(a);
    fs.rmSync(path.join(dirOf(a), 'seat-integration-1.md'));
    const ra = prep(a, 'post');
    expect(ra.status, ra.stdout + ra.stderr).toBe(3);
    expect(ra.stderr).toMatch(/seat-integration-1\.md/);
    const e = prepFixture({ evidence: true }); stripRound(e);
    fs.appendFileSync(path.join(dirOf(e), 'seat-integration-1.md'), 'edited later\n');
    const re = prep(e, 'post');
    expect(re.status, re.stdout + re.stderr).toBe(1);
    expect(re.stderr).toMatch(/edited after/);
  });
});

describe('plan-prep commit and the end to end (task-418)', () => {
  const head = (f: Fx) => git(f.board, 'rev-parse', 'HEAD').stdout.trim();
  it('13: a staged file outside the folder, a failing hook and an index.lock leave nothing committed; the commit holds exactly the folder', () => {
    const f = prepFixture({ evidence: true });
    fs.writeFileSync(path.join(dirOf(f), 'TRIAGE-PLAN.md'), 'x\n');
    fs.writeFileSync(path.join(f.board, 'other.txt'), 'x'); git(f.board, 'add', 'other.txt');
    const h0 = head(f);
    const s = prep(f, 'commit');
    refusal(s, /other\.txt/);
    expect(head(f)).toBe(h0);
    git(f.board, 'rm', '--cached', '-q', 'other.txt'); fs.rmSync(path.join(f.board, 'other.txt'));
    fs.writeFileSync(path.join(f.board, '.git/index.lock'), '');
    refusal(prep(f, 'commit'), /index\.lock/);
    fs.rmSync(path.join(f.board, '.git/index.lock'));
    const hook = path.join(f.board, '.git/hooks/pre-commit');
    fs.writeFileSync(hook, '#!/bin/sh\necho hook says no\nexit 1\n'); fs.chmodSync(hook, 0o755);
    const hk = prep(f, 'commit');
    expect(hk.status, hk.stdout + hk.stderr).toBe(1);
    expect(hk.stderr + hk.stdout).toMatch(/hook says no/);
    expect(head(f)).toBe(h0);
    expect(git(f.board, 'diff', '--cached', '--name-only').stdout.trim()).toBe('');
    fs.rmSync(hook);
    const ok = prep(f, 'commit');
    expect(ok.stdout + ok.stderr).toMatch(/plan gate/);
    expect(head(f)).not.toBe(h0);
    expect(git(f.board, 'show', '--name-only', '--format=', 'HEAD').stdout.trim()).toBe(`docs/reports/reviews/${f.task}/TRIAGE-PLAN.md`);
  });
  it('fix round 1 (g418#1): --launch-args cannot turn the launch dry run into a real launch: the identity flags and --dry-run it carries are refused, the task stays LATER with no worktree and no branch; the control without the override is a dry run', () => {
    const f = prepFixture({ evidence: true });
    const bad = prep(f, 'commit', ['--launch-args', JSON.stringify(['--dry-run', 'x', '--no-launchd', ...f.args.slice(6)])]);
    expect(bad.status, bad.stdout + bad.stderr).toBe(3);
    expect(bad.stderr.trim().split('\n')).toHaveLength(1);
    expect(bad.stderr).toMatch(/^plan-prep: refused: .*--dry-run/);
    expect(statusOf(f)).toBe('LATER');
    expect(fs.existsSync(f.wt)).toBe(false);
    expect(git(f.board, 'branch', '--list', 'wf2/t1').stdout.trim()).toBe('');
    for (const flag of ['--task', '--lane', '--board']) refusal(prep(f, 'commit', ['--launch-args', JSON.stringify([flag, 'other'])]), new RegExp(flag));
    expect(statusOf(f)).toBe('LATER');
    const ok = prep(f, 'commit');
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/plan gate ok/);
    expect(statusOf(f)).toBe('LATER');
    expect(fs.existsSync(f.wt)).toBe(false);
  });
  it('11 and 14: a CONFIRMED HIGH folded: post, commit (the dry run prints the expected Plan line), the grounder copies it, commit again prints "plan gate ok"; one word edited in the task refuses with the new expected line', () => {
    const f = prepFixture({ evidence: true });
    stripRound(f);
    confirmSeat(f, 'integration', 'HIGH');
    fs.writeFileSync(path.join(dirOf(f), 'TRIAGE-PLAN.md'), 'int#1 folded:"the plan text of the fixture task"\n');
    const p = prep(f, 'post');
    expect(p.status, p.stdout + p.stderr).toBe(0);
    expect(planText(f)).toMatch(/int#1 HIGH folded /);
    const c1 = prep(f, 'commit');
    expect(c1.status, c1.stdout + c1.stderr).toBe(3);
    expect(c1.stderr).toMatch(/GROUNDER-PLAN\.md: the Plan line/);
    expect(c1.stderr).toMatch(/FOLD-CHECK\.md: the Plan line/);
    const exp = /expected: (Plan: \S+ sha256:[0-9a-f]{12})/.exec(c1.stderr)?.[1];
    expect(exp).toBeTruthy();
    const gp = path.join(dirOf(f), 'GROUNDER-PLAN.md');
    fs.writeFileSync(gp, fs.readFileSync(gp, 'utf8').replace(/^Plan: .*$/m, exp as string));
    const fp = path.join(dirOf(f), 'FOLD-CHECK.md');
    fs.writeFileSync(fp, fs.readFileSync(fp, 'utf8').replace(/^Plan: .*$/m, exp as string));
    const c2 = prep(f, 'commit');
    expect(c2.status, c2.stdout + c2.stderr).toBe(0);
    expect(c2.stdout).toMatch(/plan gate ok: \d+ lists, \d+ findings, Plan sha256:[0-9a-f]{12}/);
    backlog(f.board, ['task', 'edit', f.task, '-d', 'Launch description text, one word edited.\n\nFiles: scripts/analysis/thing.mjs']);
    const c3 = prep(f, 'commit');
    expect(c3.status, c3.stdout + c3.stderr).toBe(3);
    expect(c3.stderr).toMatch(/GROUNDER-PLAN\.md: the Plan line/);
    expect(c3.stderr).toMatch(/FOLD-CHECK\.md: the Plan line/);
    expect(c3.stderr).toMatch(/expected: Plan: \S+ sha256:[0-9a-f]{12}/);
    expect(/expected: (Plan: \S+ sha256:[0-9a-f]{12})/.exec(c3.stderr)?.[1]).not.toBe(exp);
  });
});

// task-453 (SEARCHFIX.5; RR-0440 MORNING-DECISIONS.md:2265, RR-0450 :2325, RR-0452 :2336; GROUNDER-D D16, T9): the brief's output lists and the failure after the take
describe('task-453: output_off in the brief, and the recovery lines after a failure past the take', () => {
  const extraOf = (o: Parameters<typeof fixture>[0]) => {
    const f = fixture(o);
    const r = lane(f, ['--dry-run']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const spec = JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null') as { extra?: string[] } | null;
    return (spec?.extra ?? []).join('\n');
  };
  it('a build and a fix task are not asked for out-compliance-plan-protocol (output_off); a check task still is (the close asks it at either stage)', () => {
    for (const type of ['build', 'fix']) {
      const x = extraOf({ type });
      expect(x, type).not.toContain('out-compliance-plan-protocol');
      expect(x, type).toContain('none for this task'); // task-460: every list is off at output
      expect(x, type).not.toContain('out-compliance-five-words');
    }
    expect(extraOf({ type: 'check' })).toContain('out-compliance-plan-protocol');
  });
  it('D16 / T9: a brief.mjs that exits 1 after the take: exit 1, FAILED at, the undo command and the worktree and branch removal lines; the task stays RUNNING', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.pt, 'brief.mjs'), 'process.exit(1);\n');
    const r = lane(f, ['--no-launchd']);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toMatch(/FAILED at brief\.mjs/);
    expect(r.stderr).toMatch(/undo with: .*task edit task-\d+ -s LATER -a ''/);
    expect(r.stderr).toContain(`git -C ${f.board} worktree remove ${f.wt}`);
    expect(r.stderr).toContain(`git -C ${f.board} branch -D wf2/t1`);
    expect(statusOf(f)).toBe('RUNNING');
  });
});

// task-460 (PROC.OUTSHAPE; RR-0457 MORNING-DECISIONS.md:2367, RR-0458 :2372, RR-0459 :2377): the launch brief of a build or fix task names the code review and the grounder's validation duties, and no compliance run at output (AC #5)
describe('task-460: the brief names the code review and the validating grounder', () => {
  const extraOf = (o: Parameters<typeof fixture>[0]) => {
    const f = fixture(o);
    const r = lane(f, ['--dry-run']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    return ((JSON.parse(/^TASK-JSON .*?: (\{.*\})$/m.exec(r.stdout)?.[1] ?? 'null') as { extra?: string[] } | null)?.extra ?? []).join('\n');
  };
  it('T10: a build and a fix brief name lens-code-review.md, "none for this task" and the descriptor and milestone duties; no list lens, ux or error-paths template, no out-compliance or out-engineering file', () => {
    for (const type of ['build', 'fix']) {
      const x = extraOf({ type, files: 'mobile/src/app/x.tsx, scripts/analysis/x.mjs' });
      expect(x, type).toContain('lens-code-review.md');
      expect(x, type).toContain('none for this task');
      for (const t of ['lens-compliance.md', 'lens-engineering.md', 'lens-ux.md', 'lens-error-paths.md', 'out-compliance-', 'out-engineering-']) expect(x, `${type} ${t}`).not.toContain(t);
      for (const t of ['each changed descriptor', 'TRUE or FALSE with a file:line quote', 'milestone objectives', 'Validation section', 'exploit paths']) expect(x, `${type} ${t}`).toContain(t);
      expect(x, type).toContain('Compliance lens, ONCE PER RULE LIST');
    }
  });
  it('T10 control: a check brief keeps the list text and carries no validation duty sentence', () => {
    const x = extraOf({ type: 'check', files: 'mobile/src/app/x.tsx, scripts/analysis/x.mjs' });
    expect(x).toContain('out-compliance-');
    expect(x).toContain('lens-compliance.md');
    expect(x).not.toContain('each changed descriptor');
    expect(x).not.toContain('exploit paths');
  });
  it('T11 (round 1 grounder, out-compliance-agents-s7-s11-p1#1): the layout sentence names the output lenses above, not error-paths, ux and security', () => {
    for (const type of ['build', 'fix']) {
      const x = extraOf({ type, files: 'mobile/src/app/x.tsx, scripts/analysis/x.mjs' });
      expect(x, type).not.toContain('error-paths, ux and security lenses');
      expect(x, type).toContain('the output lenses named above (the code review for a build or fix task)');
    }
  });
});
