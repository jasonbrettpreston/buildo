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
//   6. print `AGENT-MODEL: opus (...)` (task-436, RR-0385: the model of the Agent call) and then `BRIEF-FILE: <path> sha256=<hex>` as the last line. The Agent call stays the orchestrator's (Spec 08 rule 9, 08_agents.md:339).
// COMPLY.2 (task-366): the task's `Files:` line is resolved through scripts/analysis/rule-lists.json (data decides, --rule-lists overrides the table path): the brief names every governing rule list (READ whole before planning) and the compliance lens runs once per list. A task with no Files line (a record-only task gets the every-task, increment and milestone lists only, since task-448) or a Files path no row matches is refused before any write, the path named.
// Refusals (exit 3, one line): task not LATER or WAITS, worktree exists or its parent is missing, branch exists, board dirty outside backlog/,
// backlog binary or an input missing; all before any write except two checks after the take (the 4 minute wait ran out, or the task is not RUNNING for the lane after the commit), which also exit 3 and name the undo command. Usage errors exit 2. A failure after the take exits 1 and prints the command that undoes the take.
// --dry-run prints every command (cd <dir> && <command>) and the task.json, writes nothing.
// Test flags (documented, not config): --no-launchd runs scripts/board/board-commit.zsh inline instead of launchctl; --wait-ms <n> shortens the wait;
// --lane-dir, --main, --panel-tools, --backlog-bin, --date override the defaults. Rules: PLAN-PROTOCOL.md:3 simple, no scope creep.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, asList, descriptionOf, home, parseFM, readItems, REPO, sha256, today } from './backlog-lib.mjs';
import { planGateErrors } from '../hooks/check-lane-close.mjs';
import { complianceRefs, gitFreeEnv, DEFAULT_TABLE, DIFF_ARGS, filesText, lensSet, milestoneLetter, outputLists, readTable, resolveTask, seatOf, verifyResolved } from './rule-lists.mjs';

const a = args();
const str = (k, d) => (a[k] && a[k] !== true ? String(a[k]) : d);
const refuse = (m) => { process.stderr.write(`backlog-lane: refused: ${m}\n`); process.exit(3); };
const usage = (m) => { process.stderr.write(`backlog-lane: ${m}\n`); process.exit(2); };
const q = (s) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);
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
if (!Number.isFinite(waitMs) || waitMs < 0) usage('--wait-ms must be a non-negative number');
if (!/^\d{1,3}$/.test(stage)) usage('--stage must be a number');
const here = path.dirname(fileURLToPath(import.meta.url));
const briefScript = path.join(here, 'backlog-brief.mjs');
const jobScript = path.join(REPO, 'scripts/board/board-commit.zsh');

const sh = (cwd, argv) => spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', maxBuffer: 1 << 26, env: gitFreeEnv() }); // the board is named by cwd, never by an ambient GIT_DIR of a hook
const git = (...g) => sh(board, ['git', '-c', 'core.quotepath=false', ...g]);

// ---- preflight: everything that can be checked, before the first write ----
const bin = path.resolve(home(str('backlog-bin', process.env.BACKLOG_BIN || [path.join(board, 'node_modules/.bin/backlog'), path.join(REPO, 'node_modules/.bin/backlog')].find((c) => fs.existsSync(c)) || path.join(REPO, 'node_modules/.bin/backlog'))));
if (!fs.existsSync(bin)) refuse(`backlog binary not found at ${bin} (pass --backlog-bin)`);
if (!fs.existsSync(board) || git('rev-parse', '--git-dir').status !== 0) refuse(`board ${board} is not a git checkout`);
const t = readItems(board).find((x) => x.id === taskId);
if (!t) refuse(`${taskId} not found under ${path.join(board, 'backlog/tasks')}`);
const status = String(t.fm.status).toUpperCase();
if (status !== 'LATER' && status !== 'WAITS') refuse(`task ${taskId} is not LATER or WAITS (status ${status}); only a waiting task is launched`);
for (const p of [path.join(main, 'node_modules'), path.join(main, 'mobile/node_modules')]) if (!fs.existsSync(p)) refuse(`node_modules source ${p} not found (pass --main)`);
for (const p of [path.join(pt, 'brief.mjs'), briefScript, ...(specGiven ? [specGiven] : []), ...(a['no-launchd'] === true ? [jobScript] : [])]) if (!fs.existsSync(p)) refuse(`${p} not found`);
if (!path.isAbsolute(wt) || !fs.existsSync(path.dirname(wt))) refuse(`worktree parent ${path.dirname(wt)} does not exist`);
if (fs.existsSync(wt)) refuse(`worktree ${wt} already exists`);
if (git('check-ref-format', `refs/heads/${branch}`).status !== 0) refuse(`branch name ${branch} is not a valid git branch name`);
if (git('show-ref', '--verify', '--quiet', `refs/heads/${branch}`).status === 0) refuse(`branch ${branch} already exists`);
const rlOpt = str('rule-lists', '');
if (rlOpt && path.resolve(home(rlOpt)) !== path.resolve(DEFAULT_TABLE) && process.env.RULE_LISTS_ALLOW_OVERRIDE !== '1') refuse(`--rule-lists ${rlOpt} is not the repo table (${DEFAULT_TABLE}): a different table would decide which rule lists apply, so it is refused (the tests set RULE_LISTS_ALLOW_OVERRIDE=1)`);
let resolved;
let ruleTable;
const letterOf = milestoneLetter(board, t.fm.milestone);
try { ruleTable = readTable(path.resolve(home(str('rule-lists', DEFAULT_TABLE)))); resolved = resolveTask({ table: ruleTable, root: board, body: t.body, type: String(t.fm.type ?? ''), letter: letterOf }); } catch (e) { refuse(`${taskId}: cannot read the rule-list table or one of its path maps under ${board}: ${String(e.message).split('\n')[0]}`); }
if (resolved.error) refuse(`${taskId}: ${resolved.error.replace(/^refused: /, '')}`);
const missingLists = verifyResolved(ruleTable, resolved, letterOf, String(t.fm.type ?? '')); // V2.LIST (task-406): a launch whose lists lack the plan protocol (every_task) or the milestone objectives is refused
if (missingLists.length) refuse(`${taskId}: the resolved rule lists are incomplete: ${missingLists.join('; ')}`);
const st = git('status', '--porcelain');
if (st.status !== 0) refuse(`git status failed on ${board}: ${st.stderr.trim().split('\n')[0]}`);
const dirty = st.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"(.*)"$/, '$1')).filter((p) => !p.startsWith('backlog/') && !/(^|\/)node_modules\/?$/.test(p)); // the node_modules links of a worktree are untracked (the .gitignore pattern has a trailing slash and a link is not a directory)
if (dirty.length) refuse(`board checkout ${board} is dirty outside backlog/: ${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ', ...' : ''}`);

// ---- task-375 D5: THE LAUNCH GATE, the LAST refusal before the take. A build or fix task is launched only when its folded plan was checked: the plan evidence in docs/reports/reviews/<id>/ at the board HEAD
// (context, plan compliance outputs per list, GROUNDER-PLAN.md of a separate grounder, the required seat reports, outcomes, the round block and references on the task, the Plan hash line). No flag or
// environment variable turns it off. If the gate has a defect and blocks every launch, the rollback is a git revert of the commit that added this block; --dry-run diagnoses without a take.
const gateType = String(t.fm.type ?? '').toLowerCase();
if (gateType === 'build' || gateType === 'fix') {
  const ev = `docs/reports/reviews/${taskId}`;
  const showHead = (pth) => { const r = git('show', `HEAD:${pth}`); return r.status === 0 ? r.stdout : null; };
  const names = git('ls-tree', '-r', '--name-only', 'HEAD', '--', `${ev}/`).stdout.split('\n').filter((x) => x && path.posix.dirname(x) === ev); // flat: a file in a subfolder is never read
  const headTasks = git('ls-tree', '--name-only', 'HEAD', 'backlog/tasks/').stdout.split('\n').filter(Boolean);
  const gate = planGateErrors({
    id: taskId, taskText: fs.readFileSync(t.file, 'utf8'), type: gateType, table: ruleTable, root: board, letter: letterOf, laneName: lane, assignees: asList(t.fm.assignee).map(String),
    folder: names.map((x) => ({ name: path.posix.basename(x), text: showHead(x) ?? '' })), readRepo: showHead,
    tracked: (e) => git('ls-files', '--', e).stdout.trim() !== '', // the Files entry names at least one tracked path (a file, directory or glob)
    facts: {
      taskOf: (tid) => { const n = /\d+/.exec(tid)?.[0]; const f = headTasks.find((x) => new RegExp(`^backlog/tasks/task-0*${n}( -.*)?\\.md$`, 'i').test(x)); if (!f) return { exists: false, status: '', text: '' }; const x = showHead(f) ?? ''; return { exists: true, status: String(parseFM(x).fm.status ?? ''), text: x }; },
      decisionExists: (ref) => git('ls-tree', '--name-only', 'HEAD', 'backlog/decisions/').stdout.split('\n').some((x) => path.posix.basename(x).toLowerCase().startsWith(`${ref.toLowerCase()} -`) || path.posix.basename(x).includes(ref)),
    },
  });
  if (gate.errors.length) { for (const e of gate.errors) process.stderr.write(`backlog-lane: refused: plan gate: ${e}\n`); process.exit(3); }
  console.log(`plan gate ok: ${gate.lists} lists, ${gate.findings} findings, ${gate.line.replace(/^Plan: \S+ /, 'Plan ')}`);
}

// ---- the commands, printed (dry-run) or run; one code path for both ----
const fmt = (cwd, argv, env, out) => `cd ${q(cwd)} && ${env ? `${Object.entries(env).map(([k, v]) => `${k}=${q(v)}`).join(' ')} ` : ''}${argv.map(q).join(' ')}${out ? ` > ${q(out)}` : ''}`;
const undo = fmt(board, [bin, 'task', 'edit', taskId, '-s', 'LATER', '-a', '']);
let taken = false;
const fail = (what, r) => { process.stderr.write(`backlog-lane: FAILED at ${what}: ${(r && r.error && r.error.message) || String((r && (r.stderr || r.stdout)) || '').trim().split('\n')[0]}${taken ? `; the task is already taken on the board, undo with: ${undo}` : ''}${taken && fs.existsSync(wt) ? `; remove the worktree and its branch with: git -C ${board} worktree remove ${wt} and git -C ${board} branch -D ${branch}` : ''}\n`); process.exit(1); }; // T9 (task-453)
const step = (what, cwd, argv, { env, out, must = true } = {}) => {
  console.log(`$ ${fmt(cwd, argv, env, out)}`);
  if (dry) return { status: 0, stdout: '', stderr: '' };
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...gitFreeEnv(), ...(env ?? {}) } });
  if (out && r.status === 0) fs.writeFileSync(out, r.stdout);
  if (must && r.status !== 0) fail(what, r);
  return r;
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const note = `${date} taken on the board at lane launch (lane ${lane}, worktree ${wt}, branch ${branch}), RR-0240`;
const head0 = dry ? '' : git('rev-parse', 'HEAD').stdout.trim();

// 1-2. take, kickstart, wait
// task-375 B1: the compliance references of the resolved lists the task does not carry yet go in the same edit (his :1541: a compliance document is labelled)
const addRefs = complianceRefs(resolved.lists, asList(t.fm.references)).add.flatMap((e) => ['--add-ref', e]);
step('take', board, [bin, 'task', 'edit', taskId, '-s', 'RUNNING', '-a', `@lane-${lane}`, '--append-notes', note, ...addRefs]);
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

// 3. worktree, links, plan copy; a throw from here on still names the undo command
try {
const head = dry ? '<board HEAD after the take commit>' : git('rev-parse', 'HEAD').stdout.trim();
step('worktree add', board, ['git', 'worktree', 'add', '-b', branch, wt, head]);
step('link node_modules', board, ['ln', '-s', path.join(main, 'node_modules'), path.join(wt, 'node_modules')]);
step('link mobile/node_modules', board, ['ln', '-s', path.join(main, 'mobile/node_modules'), path.join(wt, 'mobile/node_modules')]);
const plan = path.join(board, '.cursor/active_task.md');
if (dry || fs.existsSync(plan)) {
  step('make .cursor', board, ['mkdir', '-p', path.join(wt, '.cursor')]);
  step('copy plan', board, ['cp', plan, path.join(wt, '.cursor/active_task.md')]);
}

// 4. G1 ticket
const g1 = path.join(laneDir, `G1-${taskId}.md`);
step('make lane dir', board, ['mkdir', '-p', laneDir]);
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
// task-358 (REVIEW.LENSES): the review line names the Spec 08 lens set (08_agents.md:334 "NEVER run one generic pass"; section 7 rules 4, 7), chosen by task type and the Files line.
// task-375 A3: every lens command passes the committed context file and one --section per CONTEXT_SECTIONS entry (scripts/lib/review-template.js), so the reviewer's context is the task, sized
const { CONTEXT_SECTIONS, contextRound } = createRequire(import.meta.url)('../lib/review-template.js');
const MODEL_LINE = 'Model (RR-0385, decision-170): this lane is the building seat and runs on Opus; the reality-check, integration and regression seats and every grounder run on Sonnet; the review lenses are DeepSeek.'; // task-436 FINAL.1: the split in the brief (Spec 08 rule 9 dated note 2026-11-22)
const sectionFlags = CONTEXT_SECTIONS.map((x) => `--section "${x}"`).join(' ');
const lensLine = (task, ctx, lists) => {
  const ctxArgs = `--context ${ctx} ${sectionFlags}`;
  const { code, out } = lensSet({ type: task.fm.type, files: filesText(task.body) }); // one lens-set function, shared with the close check (rule-lists.mjs)
  const f = (l) => (l === 'plan-review-deepseek' ? 'plan-review-deepseek.md' : `lens-${l}.md`);
  const cmd = 'DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r $HOME/Buildo/node_modules/dotenv/config scripts/deepseek-review.js review';
  // task-438 (RR-0385 item 2): the lists of the engineering standards file go to the engineering seat (rule-lists.mjs seatOf), the others to compliance
  // task-453 (RR-0440, RR-0450, RR-0452): a build or fix task's output review leaves out the table's output_off lists, the predicate of the close check (check-lane-close.mjs); a check or doc task is asked for every list
  const outLs = code ? outputLists(ruleTable ?? {}, lists) : lists;
  const ids = outLs.filter((l) => seatOf(l) === 'compliance').map((l) => l.id);
  const engIds = outLs.filter((l) => seatOf(l) === 'engineering').map((l) => l.id);
  const baseFull = /^refs\//.test(ruleTable?.base_ref ?? '') ? ruleTable.base_ref : `refs/heads/${ruleTable?.base_ref ?? 'wf2/board'}`;
  // task-460 (RR-0457, RR-0458, RR-0459): output_off names every list, so a build or fix brief asks no list run at output; the marker sentence stays (the --spec merge below reads it)
  const tail = ` Commit each lens input beside its output (in-<output name>, the file the review tool read) and a file TASK holding exactly ${task.id}; never edit a lens output (the review tool writes its REVIEW header, the close check recomputes the hashes). The close of this task is refused without an out-<lens>.txt for every output lens named above and the grounder file below (scripts/hooks/check-lane-close.mjs). The plan was ruled once, at the plan: the lane runs no plan lens.`;
  const none = `Compliance lens, ONCE PER RULE LIST, at the output stage only: none for this task (every list it resolves is off: output_off in scripts/analysis/rule-lists.json); make no out-compliance or out-engineering file.${tail}`;
  const per = code && outLs.length === 0 && lists.length > 0 ? none : `Compliance lens, ONCE PER RULE LIST (the lists of the "Rule lists that govern this task" input, each pasted WHOLE ahead of the material; a list is never trimmed), at the output stage only${code && outLs.length < lists.length ? ` (${lists.filter((l) => !outLs.includes(l)).map((l) => l.id).join(', ')} off: output_off)` : ''}: for each list id L, \`node scripts/analysis/rule-lists.mjs lens-input --list L --context ${ctx} --material <diff file> --out <lane dir>/in-out-compliance-L\` writes the input file (list part first, then the material; parts -p1..-pN only when list plus material would pass the review tool's 120000 character bound; then the diff is split by the tool too, see below), then \`${cmd} <each input file> --template .claude/review-templates/lens-compliance.md ${ctxArgs} > out-compliance-L[-pN].txt\`. Files to produce, one per list: ${ids.map((i) => 'out-compliance-' + i + '.txt').join(', ')}. The joined run (\`lens-input --list rules --lists <the compliance list ids>\`, one set out-compliance-rules[-pN].txt for all the compliance lists) is an accepted form that is not the default (RR-0374, measured: joined whole documents found 10 of 15 findings against the per-document form's 14 of 15); a stage holding both forms is refused.${engIds.length ? ` Engineering lens, once per engineering list: the same commands with \`--out <lane dir>/in-out-engineering-L --template .claude/review-templates/lens-engineering.md\` on lens-input and the review tool; files ${engIds.map((i) => 'out-engineering-' + i + '.txt').join(', ')}.` : ''} Commit each lens input beside its output (in-<output name>, the file the review tool read) and a file TASK holding exactly ${task.id}; never edit a lens output (the review tool writes its REVIEW header, the close check recomputes the hashes). The close of this task is refused without an out-compliance output per list (or the joined set), an out-<lens>.txt for every other output lens named above, and the grounder file below (scripts/hooks/check-lane-close.mjs). The plan was ruled once, at the plan: the lane runs no plan lens.`;
  // task-407 (V2.LAYOUT): the one place the close check reads (scripts/hooks/check-lane-close.mjs: lane files at path depth 6, plan-*.txt / out-*.txt, in- beside them), said in every brief
  const layout = ` REVIEW FILES GO IN ONE PLACE: docs/reports/lanes/${date}/${lane}/ directly (no subfolders; a file in a subfolder (lens-plan/, lens-out/, stage2/) is never read), named plan-<lens>[-<list id>][-pN].txt, out-<lens>[-<list id>][-pN].txt, in-<same name> inputs beside them, plus the file TASK; the second (fix) round (r2; two output rounds at most, RR-0385): the fix commit changes the diff, so no round-1 input or output still matches it; round 2 re-makes ALL of them under the SAME names (overwrite out-<lens>[-<list id>][-pN].txt and in-<same name>, then a new GROUNDER.md and its outcome file); the round-1 grounder and outcome files are kept outside the folder and named by one line "Review round 1: <counts>; grounder <path>; triage <path>" added once to the Final Summary, in a commit of its own before the closing commit (task-446, d04026fe5); a file out-<lens>[-<list id>]-rN.txt is read for findings like any out- file but never stands in for a round-1 name; a name not starting plan- or out- (fix-*.txt) is never read. Every output lens reviews the WHOLE change: make the diff with \`git -c core.quotepath=false diff ${DIFF_ARGS.join(' ')} $(git log ${baseFull} --first-parent --reverse --format=%H -S@lane-${lane} -- '${'backlog/tasks/' + path.basename(task.file)}' | head -1) HEAD -- ${filesText(task.body).split(',').map((s) => s.trim()).filter(Boolean).map((e) => (/[*?]/.test(e) ? `'${':(glob)'}${e}'` : `'${e}'`)).join(' ')} ${(ruleTable?.exempt ?? []).map((g) => `'${':(exclude,glob)'}${g}'`).join(' ')}\` (never trimmed to core files; the base is the task's launch commit on the board, the first commit that holds this lane's assignee on the task file, so a lane already folded into the board still shows its whole change; only the paths of the Files line are in it, and the exempt paths are left out); lens-input splits the rule list at its headings and, when the diff leaves no room for a list part, splits the DIFF at file boundaries into chunks (never by hand, never inside a file); each chunk goes against every list part; the files are -p1..-pN, chunk by chunk, each stamped chunk c of m with its path list; the code-review, error-paths, ux and security lenses whose prompt would pass the bound use the same tool with their own template and no --list (\`lens-input --context ${ctx} --material <diff file> --out <lane dir>/in-out-<lens> --template .claude/review-templates/lens-<lens>.md\`) and are filed out-<lens>-pN.txt with their in-<same name>; one file alone over the room is refused naming the file and its size: report that to the orchestrator at once. A lane build or fix task closes in TWO commits (Spec 137 Rule 3 as amended for lane build and fix tasks): the work (code, tests, task notes) lands first; the closing commit carries only the lane's records (its report directory, the review context directory, the task file with the status, the decision record). The close check recomputes the changed paths of the task range (minus the exempt paths) and refuses when the chunks together are not exactly that list, when a chunk is not what that git diff prints for its paths, or when a stamp was edited. Fresh context every review round (RR-0378 step 5, 08_agents.md:529). Before the lens inputs of each review round (the first output round and every fix round) run in the worktree \`node scripts/analysis/backlog-brief.mjs --task ${task.id} --lane ${lane} --stage ${stage} --root ${wt} --board ${board} > /dev/null\`, which writes the next docs/reports/reviews/${task.id}/context-rN.md from your task file and the decisions of the board as they are then; the file named in the commands above is the launch file, so use the highest-numbered context-rN.md instead in every --context of that round and commit it with the round.`;
  const grounder = ' Session rule (Spec 08 section 7 rule 4 and section 5.3; COMPLY.2): a separate grounder rules on every finding. You do not rule on your own findings: list each finding with its id (`node scripts/analysis/rule-lists.mjs findings --dir <lane report dir>`), copy out-*.txt and FINDINGS.md into docs/reports/lanes/<date>/<lane>/ and leave the task RUNNING with "grounder owed"; the orchestrator launches a grounder that is not you, who writes GROUNDER.md there: headers `Grounder: <name>` and `Lane: <lane>` (the grounder is not the lane and not any assignee of the task); a line `Ruled: <output file> sha256:<12 hex> findings:<n>` for EVERY out-*.txt (and every plan-*.txt when the plan evidence is not on the board; rule-lists.mjs findings prints them; an output edited after grounding is refused); one line `<finding id> CONFIRMED|REJECTED|CONFLICT <repo path>:<line> "<quote on that line>" [reason: needed for REJECTED and CONFLICT]` per finding (the quote is checked against the repo, a lane report may not be cited). A build or fix task needs GROUNDER.md even with zero findings. The commit that sets the task BUILT is refused without all of it. ROUNDS (RR-0385, Spec 08 dated note 2026-11-22): round 1 resolves CRITICAL, HIGH and MED findings; round 2 resolves CRITICAL and HIGH only, and a MED the grounder confirms in round 2 gets the outcome line `<id> ruling:RR-0385` (the grounder decides it, the lane does not rule); LOW and NIT are recorded (pile or wontfix, 30+ character reason), not fixed or folded; there is no third round: a CRITICAL or HIGH still open after round 2 is reported with STATUS: blocked, for the operator.';
  // task-460 (RR-0457 MORNING-DECISIONS.md:2366-2367, RR-0459 :2378): for a build or fix task the grounder also validates; prose in GROUNDER.md, not a seat report (plan Q4: check-lane-close.mjs refuses a seat file with no finding line)
  const validate = code ? " VALIDATION (task-460): the grounder of a build or fix task also rules, in GROUNDER.md: the diff against the plan as folded and each acceptance line; the code-review findings; each changed descriptor against the code it describes: \"For every changed descriptor (scripts/**/*.descriptor.json, *.notes.json, and a file under scripts/surfaces/ with its census row), read it beside the code it describes. Rule each prose field (description, why, why_lock, docs.purpose, docs.data_story, docs.under_126, inputs.why, outputs.why, checks[].why) TRUE or FALSE with a file:line quote. Every number or list it states (tables read or written, fields, counts, ledger events, limits) must equal the code or array it describes. A sentence you cannot tie to a line is a finding.\" The milestone objectives against the diff: \"Also read the milestone objectives list of the task's milestone (the ms-<letter> sections) against the diff.\" Each changed file on an API route, library, money, sign-in, personal-data or admin path (the paths that fire the security lens at the plan stage) read for exploit paths (RR-0464). Red then green for each named test. It ends GROUNDER.md with a Validation section, one line per duty above, each naming what it read (file:line) or none; a finding raised there is fixed in the lane's own round or reported, never filed as a seat report." : '';
  return `Review lens set (Spec 08 section 7 rule 4, 08_agents.md:334 "NEVER run one generic pass"; lens table in .claude/review-templates/README.md; task type ${task.fm.type ?? 'unknown'}${code ? '' : ', record-only: compliance only'}). Output review lenses (the diff; the pasted spec clauses, rulings and design text in the context file ${ctx}, which holds the task's Description, Acceptance criteria, Implementation Plan and Notes and the decisions naming it, one --section per entry; without --context a lens sees "(no pasted context provided)"): ${out.map(f).join(', ')}, each \`${cmd} <diff file> --template .claude/review-templates/<lens file> ${ctxArgs}\`. ${per}${layout} Run the lenses in parallel, one call each, outputs out-<lens>.txt in the lane report dir; then a separate grounder rules every finding in GROUNDER.md (below).${grounder}${validate}`;
};
const ctxRel = `docs/reports/reviews/${taskId}/context-r${contextRound(path.join(board, 'docs/reports/reviews', taskId))}.md`; // the round the brief writes at launch: the same count (review-template.js contextRound) over the same tree
const ticket = (!dry && /^Ticket:.*$/m.exec(g1r.stdout)?.[0]) || `Ticket: ${taskId} (<label from the G1 ticket>) · lane ${lane} · stage ${stage}`;
const ruleBlock = [
  `THE RULE LISTS THAT GOVERN THIS TASK (Rule lists that govern this task; resolved from the Files line through scripts/analysis/rule-lists.json: data decides; ${resolved.lists.length} lists; READ each whole before planning, never hand-pick a clause):`,
  ...resolved.lists.map((l) => `- ${l.id}: ${l.file} (${l.whole ? 'whole file' : `sections: ${l.sections.join('; ')}`}) [${l.generated_by}${l.status ? `; status: ${l.status}` : ''}] why: ${l.why.join(' | ')}`),
  ...(resolved.exempt.length ? [`- Files entries with no rule list (records the lane writes itself, the hooks always allow them): ${resolved.exempt.join(', ')}`] : []),
].join('\n');
const spec = {
  lane,
  goal: `${t.fm.title}\n\n${descriptionOf(t).trim()}`.trim(),
  inputs: [
    ruleBlock,
    `THE TASK: cd ${wt} && node_modules/.bin/backlog task view ${taskId} --plain; the G1 ticket ${g1} (its context file ${path.join(wt, ctxRel)} is in the worktree, uncommitted: commit it with the work)`,
    ...asList(t.fm.references).map((r) => `Reference: ${r}`),
    ...asList(t.fm.documentation).map((d) => `Document: ${d}`),
  ],
  outputs: [...new Set([...pathy.map(abs), path.join(laneDir, 'REPORT.md')])],
  groups: [letter ?? 'F'],
  writeScope: [laneDir, wt],
  extra: [ticket, MODEL_LINE, lensLine(t, ctxRel, resolved.lists)], // the lens line stays last: the --spec merge below reads it there
};
let specPath = specGiven ?? path.join(laneDir, 'task.json');
if (!specGiven) {
  if (dry) console.log(`TASK-JSON ${specPath}: ${JSON.stringify(spec)}`);
  else fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
} else {
  // task-366 fix: a --spec the orchestrator supplies used to REPLACE the generated spec, so its rule-list block and per-list lens line never reached the brief (six launches, 2026-11-20).
  // The given spec is kept as it is; a merged copy (rule block first in inputs, lens line last in extra, each only when not already there) is what brief.mjs reads. The given file is not rewritten.
  const given = JSON.parse(fs.readFileSync(specGiven, 'utf8'));
  const inputs = Array.isArray(given.inputs) ? given.inputs : [];
  const extra = Array.isArray(given.extra) ? given.extra : [];
  const merged = {
    ...given,
    inputs: inputs.some((x) => /Rule lists that govern this task/.test(String(x))) ? inputs : [spec.inputs[0], ...inputs],
    extra: [...(extra.some((x) => /Compliance lens, (ONCE PER RULE LIST|ONE JOINED RUN PER STAGE)/.test(String(x))) ? extra : [...extra, spec.extra[spec.extra.length - 1]]), ...(extra.includes(MODEL_LINE) ? [] : [MODEL_LINE])], // task-436: the model line once
  };
  specPath = path.join(laneDir, 'task.merged.json');
  if (dry) console.log(`TASK-JSON ${specPath}: ${JSON.stringify(merged)}`);
  else fs.writeFileSync(specPath, JSON.stringify(merged) + '\n');
}
const briefOut = path.join(laneDir, 'BRIEF.md');
step('brief.mjs', laneDir, ['node', path.join(pt, 'brief.mjs'), '--spec', specPath, '--out', briefOut]);
const AGENT_MODEL = 'AGENT-MODEL: opus (RR-0385: set model "opus" on the Agent call that takes the BRIEF-FILE line below)'; // task-436: on the line before BRIEF-FILE, which stays last (lane-guard reads it)
if (dry) { console.log(AGENT_MODEL); console.log(`BRIEF-FILE: ${briefOut} sha256=<sha256 of the brief>`); process.exit(0); }
console.log(AGENT_MODEL);
console.log(`BRIEF-FILE: ${briefOut} sha256=${sha256(fs.readFileSync(briefOut))}`);
} catch (e) { fail('write', { stderr: String(e && e.message) }); }
