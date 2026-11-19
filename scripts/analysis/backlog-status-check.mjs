#!/usr/bin/env node
// backlog-status-check (task-5 CHK.8, as narrowed by the R9 note of 2026-11-19): status from evidence, two findings only.
//   (a) a task at BUILT or DONE with no commit on HEAD carrying its `Task: task-N` trailer (a docs-only closing commit with no trailer is a WARN:
//       G3 exempts docs-only commits, scripts/hooks/check-backlog-task.mjs:5-6);
//   (b) a `Task:` trailer in the range naming a task that was not RUNNING at that commit (BUILT or DONE is allowed only on the newest commit
//       carrying that trailer, the task's own closing commit; a task absent at that commit, e.g. a draft, is flagged).
// READ-ONLY and NOT wired into any hook: a check for the orchestrator and the push window. Reads task files and git history, writes nothing.
// Usage: node scripts/analysis/backlog-status-check.mjs [--root <repo>] [--range <a..b>]
//   default range: merge-base of HEAD with origin/wf1/mb-rulings .. HEAD, or all of HEAD when that ref is absent. A --range without ".." exits 2.
// Output: one FAIL or WARN line per finding, then a summary line. Exit 1 on any FAIL, else 0 (WARN alone is 0).
// Rules: Spec 137 section 4 rule 3 (137_mcqueue.md:84); RR-0205, RR-0219; PLAN-PROTOCOL.md:3 keep it simple.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { args, parseFM, readItems, REPO } from './backlog-lib.mjs';

const a = args();
const root = path.resolve(a.root && a.root !== true ? a.root : REPO);
const git = (g) => spawnSync('git', ['-c', 'core.quotepath=false', ...g], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const CODE = /^(src|scripts|mobile|migrations)\//;
const short = (s) => s.slice(0, 9);
const usage = (m) => { process.stderr.write(`backlog-status-check: ${m}\n`); process.exit(2); };

if (git(['rev-parse', '--git-dir']).status !== 0) usage(`${root} is not a git repository`);

if (a.range !== undefined && (a.range === true || !String(a.range).includes('..'))) {
  process.stderr.write('backlog-status-check: --range needs the form <a>..<b> (a single ref would mean all of its history)\n');
  process.exit(2);
}

// Full history of HEAD, newest first: {sha, ids}. Every value of every Task trailer on the commit (a commit may carry several).
const hasHead = git(['rev-parse', '--verify', '-q', 'HEAD']).status === 0;
const log = hasHead ? git(['log', '--format=%x01%H%x02%(trailers:key=Task,valueonly)', 'HEAD']).stdout : '';
const commits = log.split('\x01').filter(Boolean).map((rec) => {
  const [sha, vals = ''] = rec.split('\x02');
  return { sha: sha.trim(), ids: vals.split('\n').map((v) => /^\s*((?:task|draft)-\d+)\b/i.exec(v)?.[1].toLowerCase()).filter(Boolean) };
});
const newest = new Map(); // task id -> newest commit sha carrying its trailer
for (const c of commits) for (const id of c.ids) if (!newest.has(id)) newest.set(id, c.sha);

let range = 'HEAD';
let rangeShas;
if (hasHead) {
  if (a.range) range = String(a.range);
  else {
    const mb = git(['merge-base', 'HEAD', 'origin/wf1/mb-rulings']);
    if (mb.status === 0 && mb.stdout.trim()) range = `${mb.stdout.trim()}..HEAD`;
  }
  const rl = git(['rev-list', range]);
  if (rl.status !== 0) { process.stderr.write(`backlog-status-check: bad range ${range}: ${rl.stderr.trim()}\n`); process.exit(2); }
  rangeShas = new Set(rl.stdout.split('\n').filter(Boolean));
  const seen = new Set(commits.map((c) => c.sha));
  const outside = [...rangeShas].filter((s) => !seen.has(s));
  if (outside.length) usage(`range ${range} holds ${outside.length} commit(s) that HEAD does not contain (first ${short(outside[0])}); give a range inside HEAD`);
} else rangeShas = new Set();

/** Status of a task file at a commit: the file is found by its `task-N - ` prefix in backlog/tasks at that commit (a later rename does not matter). */
function statusAt(sha, id) {
  const ls = git(['ls-tree', '-z', '--name-only', `${sha}:backlog/tasks`]);
  if (ls.status !== 0) return null;
  const name = ls.stdout.split('\0').find((f) => f.toLowerCase().startsWith(`${id} - `) || f.toLowerCase() === `${id}.md`);
  if (!name) return null;
  const shown = git(['show', `${sha}:backlog/tasks/${name}`]);
  return shown.status === 0 ? String(parseFM(shown.stdout).fm.status ?? '') : null;
}

const fails = []; const warns = [];

// (a) BUILT or DONE with no trailer commit.
for (const t of readItems(root)) {
  const st = String(t.fm.status ?? '');
  if (!['BUILT', 'DONE'].includes(st) || newest.has(t.id)) continue;
  const rel = path.relative(root, t.file);
  const last = hasHead ? git(['log', '-1', '--format=%H', '--', rel]).stdout.trim() : '';
  const files = last ? git(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', last]).stdout.split('\n').filter(Boolean) : [];
  if (last && files.length && !files.some((f) => CODE.test(f))) warns.push(`WARN a ${t.id} [${st}] no commit carries its Task: trailer; its last commit ${short(last)} is docs-only (G3 exempts it)`);
  else fails.push(`FAIL a ${t.id} [${st}] no commit on HEAD carries a "Task: ${t.id}" trailer`);
}

// (b) trailers in the range naming a task that was not RUNNING at that commit.
let inRange = 0;
for (const c of commits) {
  if (!rangeShas.has(c.sha)) continue;
  inRange++;
  for (const id of new Set(c.ids)) {
    const st = statusAt(c.sha, id);
    if (st === 'RUNNING') continue;
    if (st === null) fails.push(`FAIL b ${short(c.sha)} Task: ${id} names no task file at that commit (absent, renamed away or a draft)`);
    else if (['BUILT', 'DONE'].includes(st) && newest.get(id) === c.sha) continue;
    else fails.push(`FAIL b ${short(c.sha)} Task: ${id} was ${st} at that commit, not RUNNING`);
  }
}

const out = [...fails, ...warns, `status-check: range: ${inRange} commit(s) (${range}); ${fails.length} finding(s), ${warns.length} warning(s)`];
process.stdout.write(`${out.join('\n')}\n`);
process.exitCode = fails.length ? 1 : 0;
