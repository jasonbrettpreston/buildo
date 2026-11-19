#!/usr/bin/env node
// One-command lane launch (task-310, R8e; RR-0242, MORNING-DECISIONS.md:953-955; the take on the board is RR-0240, :947-951).
// Usage: node scripts/analysis/backlog-lane.mjs --task task-N --lane <name> [--board ~/Buildo-wt-board] [--worktree ~/Buildo-wt-<name>]
//        [--branch wf2/<name>] [--spec <task.json>] [--stage N] [--dry-run]
// Does, in this order, by shelling out to the existing tools (nothing is re-implemented):
//   1. take the task on the board checkout (backlog task edit -s RUNNING -a @lane-<name> --append-notes ...);
//   2. kickstart com.maxbld.board-commit and wait (4 minutes) until backlog/ of the board is clean and HEAD advanced;
//   3. git worktree add -b <branch> <worktree> <board HEAD>, link both node_modules, copy .cursor/active_task.md;
//   4. write the G1 ticket (backlog-brief.mjs --root <worktree>) into the lane dir;
//   5. write task.json from the task (or use --spec) and run panel-tools/brief.mjs;
//   6. print `BRIEF-FILE: <path> sha256=<hex>` as the last line. The Agent call stays the orchestrator's (Spec 08 rule 9, 08_agents.md:339).
// Refusals (exit 3, one line, before any write): task not LATER or WAITS, worktree exists or its parent is missing, branch exists, board dirty outside backlog/,
// backlog binary or an input missing. Usage errors exit 2. A failure after the take exits 1 and prints the command that undoes the take.
// --dry-run prints every command (cd <dir> && <command>) and the task.json, writes nothing.
// Test flags (documented, not config): --no-launchd runs scripts/board/board-commit.zsh inline instead of launchctl; --wait-ms <n> shortens the wait;
// --lane-dir, --main, --panel-tools, --backlog-bin, --date override the defaults. Rules: PLAN-PROTOCOL.md:3 simple, no scope creep.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { args, asList, descriptionOf, home, parseFM, readItems, REPO, sha256, today } from './backlog-lib.mjs';

const a = args();
const str = (k, d) => (a[k] && a[k] !== true ? String(a[k]) : d);
const refuse = (m) => { process.stderr.write(`backlog-lane: refused: ${m}\n`); process.exit(3); };
const usage = (m) => { process.stderr.write(`backlog-lane: ${m}\n`); process.exit(2); };
const q = (s) => (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);
const dry = a['dry-run'] === true;

const taskId = str('task', '').toLowerCase();
const lane = str('lane', '');
if (!/^task-\d+$/.test(taskId) || !lane) usage('usage: --task task-N --lane <name> [--board <dir>] [--worktree <dir>] [--branch <name>] [--spec <task.json>] [--dry-run]');
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(lane)) refuse(`lane name ${lane} is not a plain name (letters, digits, . _ -)`);
const name = lane.toLowerCase().replace(/^bl-/, '');
const date = str('date', today());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) usage('--date must be YYYY-MM-DD');
const stage = str('stage', '1');
const board = path.resolve(home(str('board', '~/Buildo-wt-board')));
const wt = path.resolve(home(str('worktree', `~/Buildo-wt-${name}`)));
const branch = str('branch', `wf2/${name}`);
const main = path.resolve(home(str('main', '~/Buildo')));
const pt = path.resolve(home(str('panel-tools', '~/Buildo-scratch/panel-tools')));
const laneDir = path.resolve(home(str('lane-dir', `~/Buildo-scratch/lanes-${date.replace(/-/g, '')}/${lane}`)));
const specGiven = a.spec && a.spec !== true ? path.resolve(home(String(a.spec))) : null;
const waitMs = Number(str('wait-ms', '240000'));
const here = path.dirname(new URL(import.meta.url).pathname);
const briefScript = path.join(here, 'backlog-brief.mjs');
const jobScript = path.join(REPO, 'scripts/board/board-commit.zsh');

const sh = (cwd, argv) => spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
const git = (...g) => sh(board, ['git', '-c', 'core.quotepath=false', ...g]);

// ---- preflight: everything that can be checked, before the first write ----
const bin = str('backlog-bin', process.env.BACKLOG_BIN || [path.join(board, 'node_modules/.bin/backlog'), path.join(REPO, 'node_modules/.bin/backlog')].find((c) => fs.existsSync(c)) || path.join(REPO, 'node_modules/.bin/backlog'));
if (!fs.existsSync(bin)) refuse(`backlog binary not found at ${bin} (pass --backlog-bin)`);
if (!fs.existsSync(board) || git('rev-parse', '--git-dir').status !== 0) refuse(`board ${board} is not a git checkout`);
const t = readItems(board).find((x) => x.id === taskId);
if (!t) refuse(`${taskId} not found under ${path.join(board, 'backlog/tasks')}`);
const status = String(t.fm.status).toUpperCase();
if (status !== 'LATER' && status !== 'WAITS') refuse(`task ${taskId} is not LATER or WAITS (status ${status}); only a waiting task is launched`);
for (const p of [path.join(main, 'node_modules'), path.join(main, 'mobile/node_modules')]) if (!fs.existsSync(p)) refuse(`node_modules source ${p} not found (pass --main)`);
for (const p of [path.join(pt, 'brief.mjs'), briefScript, ...(specGiven ? [specGiven] : [])]) if (!fs.existsSync(p)) refuse(`${p} not found`);
if (!path.isAbsolute(wt) || !fs.existsSync(path.dirname(wt))) refuse(`worktree parent ${path.dirname(wt)} does not exist`);
if (fs.existsSync(wt)) refuse(`worktree ${wt} already exists`);
if (git('check-ref-format', `refs/heads/${branch}`).status !== 0) refuse(`branch name ${branch} is not a valid git branch name`);
if (git('show-ref', '--verify', '--quiet', `refs/heads/${branch}`).status === 0) refuse(`branch ${branch} already exists`);
const dirty = git('status', '--porcelain').stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"(.*)"$/, '$1')).filter((p) => !p.startsWith('backlog/'));
if (dirty.length) refuse(`board checkout ${board} is dirty outside backlog/: ${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ', ...' : ''}`);

// ---- the commands, printed (dry-run) or run; one code path for both ----
const fmt = (cwd, argv, env, out) => `cd ${q(cwd)} && ${env ? `${Object.entries(env).map(([k, v]) => `${k}=${q(v)}`).join(' ')} ` : ''}${argv.map(q).join(' ')}${out ? ` > ${q(out)}` : ''}`;
const undo = `backlog task edit ${taskId} -s LATER -a ""`;
let taken = false;
const fail = (what, r) => { process.stderr.write(`backlog-lane: FAILED at ${what}: ${String((r && (r.stderr || r.stdout)) || '').trim().split('\n')[0]}${taken ? `; the task is already taken on the board, undo with: ${undo}` : ''}\n`); process.exit(1); };
const step = (what, cwd, argv, { env, out, must = true } = {}) => {
  console.log(`$ ${fmt(cwd, argv, env, out)}`);
  if (dry) return { status: 0, stdout: '', stderr: '' };
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', maxBuffer: 1 << 26, env: env ? { ...process.env, ...env } : process.env });
  if (out && r.status === 0) fs.writeFileSync(out, r.stdout);
  if (must && r.status !== 0) fail(what, r);
  return r;
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const note = `${date} taken on the board at lane launch (lane ${lane}, worktree ${wt}, branch ${branch}), RR-0240`;
const head0 = dry ? '' : git('rev-parse', 'HEAD').stdout.trim();

// 1-2. take, kickstart, wait
step('take', board, [bin, 'task', 'edit', taskId, '-s', 'RUNNING', '-a', `@lane-${lane}`, '--append-notes', note]);
taken = !dry;
if (a['no-launchd'] === true) step('board commit job', board, ['zsh', '-f', jobScript], { env: { BOARD_ROOT: board } });
else step('kickstart', board, ['launchctl', 'kickstart', '-k', `gui/${process.getuid()}/com.maxbld.board-commit`]);
if (!dry) {
  const t0 = Date.now();
  for (;;) {
    const clean = git('status', '--porcelain', '--', 'backlog').stdout.trim() === '';
    if (clean && git('rev-parse', 'HEAD').stdout.trim() !== head0) break;
    if (Date.now() - t0 >= waitMs) refuse(`board commit did not land within ${waitMs} ms (backlog/ of ${board} still dirty or HEAD unchanged); ${taskId} is taken but not committed, undo with: ${undo}`);
    sleep(500);
  }
  const now = readItems(board).find((x) => x.id === taskId);
  if (!now || String(now.fm.status).toUpperCase() !== 'RUNNING' || !asList(now.fm.assignee).includes(`@lane-${lane}`)) refuse(`after the board commit ${taskId} is not RUNNING for @lane-${lane}; undo with: ${undo}`);
}

// 3. worktree, links, plan copy
const head = dry ? '<board HEAD after the take commit>' : git('rev-parse', 'HEAD').stdout.trim();
step('worktree add', board, ['git', 'worktree', 'add', '-b', branch, wt, head]);
step('link node_modules', board, ['ln', '-s', path.join(main, 'node_modules'), path.join(wt, 'node_modules')]);
step('link mobile/node_modules', board, ['ln', '-s', path.join(main, 'mobile/node_modules'), path.join(wt, 'mobile/node_modules')]);
const plan = path.join(board, '.cursor/active_task.md');
if (dry || fs.existsSync(plan)) {
  if (!dry) fs.mkdirSync(path.join(wt, '.cursor'), { recursive: true });
  step('copy plan', board, ['cp', plan, path.join(wt, '.cursor/active_task.md')]);
}

// 4. G1 ticket
const g1 = path.join(laneDir, `G1-${taskId}.md`);
if (!dry) fs.mkdirSync(laneDir, { recursive: true });
const g1r = step('G1 ticket', wt, ['node', briefScript, '--task', taskId, '--lane', lane, '--stage', stage, '--root', wt, '--date', date], { out: g1 });

// 5. task.json and the brief
const acBlock = /<!-- AC:BEGIN -->([\s\S]*?)<!-- AC:END -->/.exec(t.body)?.[1] ?? '';
const pathy = acBlock.split(/[\s`"'(),;]+/).map((w) => w.replace(/[.:]+$/, '')).filter((w) => /\//.test(w) && /\.\w+$/.test(w) && !/^[a-z]+:\/\//i.test(w) && !/[<>*]/.test(w));
const abs = (p) => (p.startsWith('~/') ? home(p) : path.isAbsolute(p) ? p : path.join(wt, p));
const milestone = String(t.fm.milestone ?? '');
const msDir = path.join(board, 'backlog/milestones');
const msTitle = milestone && fs.existsSync(msDir) ? fs.readdirSync(msDir).filter((f) => f.endsWith('.md')).map((f) => parseFM(fs.readFileSync(path.join(msDir, f), 'utf8')).fm).find((fm) => String(fm.id) === milestone)?.title : undefined;
const letter = /\[([^\]]+)\]\s*$/.exec(String(msTitle ?? ''))?.[1];
if (!letter && !specGiven) process.stderr.write(`backlog-lane: note: no [group] letter in the title of milestone ${milestone || '(none)'}; groups defaults to F\n`);
const ctxRel = `docs/reports/reviews/${taskId}/context-${date}.md`;
const ticket = (!dry && /^Ticket:.*$/m.exec(g1r.stdout)?.[0]) || `Ticket: ${taskId} (<label from the G1 ticket>) · lane ${lane} · stage ${stage}`;
const spec = {
  lane,
  goal: `${t.fm.title}\n\n${descriptionOf(t).trim()}`.trim(),
  inputs: [
    `THE TASK: cd ${wt} && node_modules/.bin/backlog task view ${taskId} --plain; the G1 ticket ${g1} (its context file ${path.join(wt, ctxRel)} is in the worktree, uncommitted: commit it with the work)`,
    ...asList(t.fm.references).map((r) => `Reference: ${r}`),
    ...asList(t.fm.documentation).map((d) => `Document: ${d}`),
  ],
  outputs: [...new Set([...pathy.map(abs), path.join(laneDir, 'REPORT.md')])],
  groups: [letter ?? 'F'],
  writeScope: [laneDir, wt],
  extra: [ticket, `Review (review mode, from the worktree): DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r $HOME/Buildo/node_modules/dotenv/config scripts/deepseek-review.js review ${ctxRel} --context .claude/review-templates/plan-review-deepseek.md`],
};
const specPath = specGiven ?? path.join(laneDir, 'task.json');
if (!specGiven) {
  if (dry) console.log(`TASK-JSON ${specPath}: ${JSON.stringify(spec)}`);
  else fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
}
const briefOut = path.join(laneDir, 'BRIEF.md');
step('brief.mjs', laneDir, ['node', path.join(pt, 'brief.mjs'), '--spec', specPath, '--out', briefOut]);
if (dry) { console.log(`BRIEF-FILE: ${briefOut} sha256=<sha256 of the brief>`); process.exit(0); }
console.log(`BRIEF-FILE: ${briefOut} sha256=${sha256(fs.readFileSync(briefOut))}`);
