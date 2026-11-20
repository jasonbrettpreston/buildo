#!/usr/bin/env node
// COMPLY.2 close check (task-366; Spec 08 section 7 rule 4 and section 5.3, 08_agents.md: "every DeepSeek finding is adjudicated by a tool-having grounder", rejections carry
// reasons; operator 2026-11-20, see scripts/analysis/rule-lists.json $comment). A commit that carries `Task: task-N` and moves that task file (in the INDEX) to BUILT or DONE is
// refused unless docs/reports/lanes/<any date>/<lane>/ (read from the index, so the lane's last commit may carry it) holds:
//   (a) the LENS SET the task type calls for (scripts/analysis/rule-lists.mjs lensSet, the function the launch brief uses): per attached rule list one compliance lens output
//       (out-compliance-<list id>.txt, or plan-compliance-<list id>.txt for a non build/fix task; ONE file or parts -p1..-pK with no gap, never both), and for a build or fix task
//       also out-<lens>.txt for code-review, error-paths (ux, security by the Files line) and at least one plan-stage output (plan-*.txt); each output ends in a `VERDICT:` line;
//   (b) GROUNDER.md, always for a build or fix task, for any other task when a lens output holds a finding. Header `Grounder: <name>` and `Lane: <name>`: the grounder is not the
//       lane, not the Lane header and not ANY assignee of the task. `Ruled: <output file> sha256:<12 hex> findings:<n>` for EVERY lens output (plan-*.txt, out-*.txt): the hash and
//       the BUG/DEFER count are recomputed here, so an output edited after the grounder ruled (a deleted finding) is refused. One verdict line per finding id:
//       `<id> CONFIRMED|REJECTED|CONFLICT <path>:<line> "<quote>" [reason]`; REJECTED and CONFLICT need a reason; the quote (6+ characters) must be ON that line of a repo file (index,
//       else HEAD), and the file may not be a lane report (the grounder opened the code or the spec, not the lens output). A finding is a BUG or DEFER line of a lens output; its id is
//       <file stem>#<1-based ordinal among those lines of that file> (`node scripts/analysis/rule-lists.mjs findings --dir <dir>` prints the Ruled lines and the ids).
// Presence, form and the quote check; never judgement: THIS CHECK CANNOT PROVE THAT THE GROUNDER DID THE WORK WELL, only that it names a different agent, restated what it ruled on, and quoted
// real lines. Exempt: a merge commit, no backlog/tasks/, no trailer, the task file not in the diff, a status not moving to BUILT or DONE, and a task with no @lane-* assignee UNLESS the commit
// changes code (src, scripts, mobile, migrations): then it is refused. A task with no Files line (not a record-only type) or a Files path no row matches is refused here as at launch.
// Known limits: deleting the highest -pN output is not detected; every docs/reports/lanes/*/<lane>/ counts (no date is computed). `closeErrors` is exported so a push-range arm can call it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asList, parseFM } from '../analysis/backlog-lib.mjs';
import { filesText, findingsIn, isLensOutput, lensSet, milestoneLetter, readTable, resolveTask, ruledLine } from '../analysis/rule-lists.mjs';

const git = (a) => { const r = spawnSync('git', ['-c', 'core.quotepath=false', ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }); return { status: r.status ?? 1, stdout: r.stdout ?? '' }; };
const fail = (lines) => { for (const l of lines) process.stderr.write(`check-lane-close: ${l}\n`); return 1; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s).toLowerCase().replace(/^@/, '').replace(/^lane-/, '').replace(/^bl-/, '').trim();
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
const VERDICT = /^\s*[-*]?\s*(\S+)\s+(CONFIRMED|REJECTED|CONFLICT)\s+(\S+?):(\d+)\s+"([^"]*)"\s*(.*)$/;

/**
 * Every refusal for one closing task, as lines. Pure of git: the caller supplies what it read.
 * @param {{id:string, taskText:string, fm:object, laneName:string, assignees:string[], type:string, table:object, root:string, letter?:string,
 *          files:{name:string,text:string}[], readRepo:(p:string)=>string|null}} i
 */
export function closeErrors(i) {
  const { id, laneName, type, files, readRepo } = i;
  const build = type === 'build' || type === 'fix';
  let r;
  try { r = resolveTask({ table: i.table, root: i.root, body: i.taskText, type, letter: i.letter }); } catch (e) { return [`${id}: cannot read the rule-list table or one of its path maps: ${String(e.message).split('\n')[0]}`]; }
  if (r.error) return [`${id}: ${r.error.replace(/^refused: /, '')}`];
  const dirNote = `docs/reports/lanes/<date>/${laneName}/`;
  const textOf = (n) => files.find((f) => f.name === n)?.text;
  const errors = [];

  // (a) one compliance lens output per list
  const phases = build ? ['out'] : ['plan', 'out'];
  for (const l of r.lists) {
    const why = [];
    let ok = false;
    for (const ph of phases) {
      const base = `${ph}-compliance-${l.id}`;
      const single = textOf(`${base}.txt`);
      const parts = files.map((f) => new RegExp(`^${esc(base)}-p(\\d+)\\.txt$`).exec(f.name)).filter(Boolean).map((x) => Number(x[1])).sort((a, b) => a - b);
      if (single !== undefined && parts.length) { why.push(`${base}.txt and ${base}-pN.txt both exist (one file, or -p1..-pK)`); continue; }
      const names = single !== undefined ? [`${base}.txt`] : parts.map((n) => `${base}-p${n}.txt`);
      if (names.length === 0) continue;
      const gap = parts.findIndex((n, k) => n !== k + 1);
      if (gap !== -1) { why.push(`${base}: parts ${parts.join(',')} have a gap, ${base}-p${gap + 1}.txt is missing`); continue; }
      const noVerdict = names.filter((n) => !/^VERDICT:/m.test(textOf(n) ?? ''));
      if (noVerdict.length) { why.push(`${noVerdict.join(', ')} has no VERDICT line (a failed run is not a lens output)`); continue; }
      ok = true;
    }
    if (!ok) errors.push(`${id}: list ${l.id} (${l.file}) has no compliance lens output in ${dirNote}: write ${phases.join(' or ')}-compliance-${l.id}.txt${why.length ? ` (${why.join('; ')})` : ''}`);
  }
  // (a') the rest of the lens set a build or fix task calls for, and a plan-stage output
  if (build) {
    const set = lensSet({ type, files: filesText(i.taskText) });
    for (const lens of set.out) {
      const n = `out-${lens}.txt`;
      const t = textOf(n);
      if (t === undefined) errors.push(`${id}: the lens set of a ${type} task needs ${n} in ${dirNote} (Spec 08 section 7 rule 4: never one generic pass)`);
      else if (!/^VERDICT:/m.test(t)) errors.push(`${id}: ${n} has no VERDICT line (a failed run is not a lens output)`);
    }
    if (!files.some((f) => /^plan-.+\.txt$/.test(f.name))) errors.push(`${id}: no plan-stage lens output (plan-<lens>.txt) in ${dirNote}: the plan is reviewed before the build (Spec 08 section 7)`);
  }

  // (b) the separate grounder
  const lensFiles = files.filter((f) => isLensOutput(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  const findings = findingsIn(lensFiles);
  if (!(build || findings.length > 0)) return errors;
  const g = textOf('GROUNDER.md');
  if (g === undefined) return [...errors, `${id}: GROUNDER.md is missing in ${dirNote}${build ? ' (a build or fix task always needs a separate grounder verdict)' : ` (a lens returned ${findings.length} finding(s))`}`];
  const head = g.split('\n').slice(0, 25).join('\n');
  const gr = /^\s*Grounder:\s*(.+?)\s*$/m.exec(head)?.[1];
  const lh = /^\s*Lane:\s*(.+?)\s*$/m.exec(head)?.[1];
  if (!gr) errors.push('GROUNDER.md has no "Grounder: <name>" header line');
  if (!lh) errors.push('GROUNDER.md has no "Lane: <name>" header line');
  if (gr && lh && norm(gr) === norm(lh)) errors.push(`GROUNDER.md: Grounder "${gr}" is the same as Lane "${lh}"; a separate agent must ground`);
  if (gr && norm(gr) === norm(laneName)) errors.push(`GROUNDER.md: Grounder "${gr}" is the lane (${laneName}); a separate agent must ground`);
  if (gr && i.assignees.some((a) => norm(a) === norm(gr) && norm(a) !== norm(laneName))) errors.push(`GROUNDER.md: Grounder "${gr}" is an assignee of ${id}; a separate agent must ground`);
  // the ruled outputs: restated name, hash and count, recomputed here
  const ruled = new Map();
  for (const ln of g.split('\n')) { const m = /^\s*Ruled:\s*(\S+)\s+sha256:([0-9a-f]{12})\s+findings:(\d+)\s*$/.exec(ln); if (m) ruled.set(m[1], { sha: m[2], n: Number(m[3]) }); }
  for (const f of lensFiles) {
    const want = ruledLine(f.name, f.text);
    const have = ruled.get(f.name);
    if (!have) errors.push(`GROUNDER.md: no "Ruled:" line for ${f.name} (expected: ${want})`);
    else if (`Ruled: ${f.name} sha256:${have.sha} findings:${have.n}` !== want) errors.push(`GROUNDER.md: the "Ruled:" line for ${f.name} does not match the committed output (the grounder ruled on sha256:${have.sha} findings:${have.n}, the file is now ${want.replace(`Ruled: ${f.name} `, '')}: the output was edited after grounding, or the count is wrong)`);
  }
  // one verdict line per finding, with a quote that is on the cited line of a repo file
  const verdicts = new Map();
  for (const raw of g.split('\n')) { const v = VERDICT.exec(raw.replace(/[`*]/g, '')); if (v) verdicts.set(v[1], { word: v[2], file: v[3], line: Number(v[4]), quote: v[5], reason: v[6].trim() }); }
  for (const f of findings) {
    const v = verdicts.get(f.id);
    const form = `form: <id> CONFIRMED|REJECTED|CONFLICT <path>:<line> "<quote>" [reason]`;
    if (!v) { errors.push(`GROUNDER.md: finding ${f.id} has no complete verdict line (${form}): ${f.line.slice(0, 90)}`); continue; }
    if (v.quote.trim().length < 6) { errors.push(`GROUNDER.md: finding ${f.id}: the quote must be 6+ characters taken from ${v.file}:${v.line}`); continue; }
    if (v.word !== 'CONFIRMED' && !v.reason) errors.push(`GROUNDER.md: finding ${f.id} is ${v.word} with no reason after the quote (Spec 08 5.3: rejections carry reasons; a conflict says what the operator must rule)`);
    if (path.isAbsolute(v.file) || v.file.split('/').includes('..')) { errors.push(`GROUNDER.md: finding ${f.id}: ${v.file} must be a repo-relative path`); continue; }
    if (v.file.startsWith('docs/reports/lanes/')) { errors.push(`GROUNDER.md: finding ${f.id}: ${v.file} is a lane report; cite the code or the spec the grounder opened, not a lens output`); continue; }
    const text = readRepo(v.file);
    if (text === null) { errors.push(`GROUNDER.md: finding ${f.id}: ${v.file} is not in the repo (index or HEAD)`); continue; }
    const lines = text.split('\n');
    if (v.line < 1 || v.line > lines.length) { errors.push(`GROUNDER.md: finding ${f.id}: ${v.file} has no line ${v.line} (${lines.length} lines)`); continue; }
    if (!squash(lines[v.line - 1]).includes(squash(v.quote))) errors.push(`GROUNDER.md: finding ${f.id}: the quote is not on ${v.file}:${v.line}`);
  }
  return errors;
}

function check(msgFile) {
  if (!msgFile) return fail(['usage: check-lane-close.mjs <commit-msg-file>']);
  const top = git(['rev-parse', '--show-toplevel']).stdout.trim() || process.cwd();
  const mergeHead = git(['rev-parse', '--git-path', 'MERGE_HEAD']).stdout.trim();
  if (mergeHead && fs.existsSync(path.resolve(mergeHead))) return 0;
  if (!fs.existsSync(path.join(top, 'backlog/tasks'))) return 0;
  const m = /^Task:\s*(task-\d+)\s*$/im.exec(fs.readFileSync(msgFile, 'utf8'));
  if (!m) return 0;
  const id = m[1].toLowerCase();
  const staged = git(['diff', '--cached', '--name-only', '--no-renames']).stdout.split('\n').filter(Boolean);
  const taskFile = staged.find((f) => f.toLowerCase().startsWith(`backlog/tasks/${id} -`) || f.toLowerCase() === `backlog/tasks/${id}.md`);
  if (!taskFile) return 0;
  const now = git(['show', `:${taskFile}`]);
  if (now.status !== 0) return 0;
  const { fm } = parseFM(now.stdout);
  const status = String(fm.status ?? '').toUpperCase();
  if (status !== 'BUILT' && status !== 'DONE') return 0;
  const was = git(['show', `HEAD:${taskFile}`]);
  if (was.status === 0 && String(parseFM(was.stdout).fm.status ?? '').toUpperCase() === status) return 0;
  const assignees = asList(fm.assignee).map(String);
  const laneName = assignees.map((a) => /^@lane-(.+)$/.exec(a)?.[1]).find(Boolean);
  if (!laneName) {
    const code = staged.filter((f) => /^(src|scripts|mobile|migrations)\//.test(f));
    if (code.length === 0) return 0; // an operator or orchestrator edit of the board: no code, no lane report to find
    return fail([`${id} is set ${status} by a commit that changes code (${code.slice(0, 3).join(', ')}${code.length > 3 ? ', ...' : ''}) but has no @lane-* assignee, so there is no lane report to check: take the task through the launch script (assignee @lane-<name>) or do not close it in a code commit (no exemption for code, COMPLY.2)`]);
  }
  const tableFile = path.join(top, 'scripts/analysis/rule-lists.json');
  if (!fs.existsSync(tableFile)) {
    if (git(['cat-file', '-e', 'HEAD:scripts/analysis/rule-lists.json']).status === 0) return fail([`${id}: scripts/analysis/rule-lists.json is in HEAD but missing from the working tree: the close check fails closed (restore it)`]);
    return 0; // a repo that never had the table is not held to it
  }
  const lanePaths = git(['ls-files', '--cached', '-z', '--', 'docs/reports/lanes']).stdout.split('\0').filter(Boolean)
    .filter((f) => { const p = f.split('/'); return p.length === 6 && p[4] === laneName; });
  const files = lanePaths.map((f) => ({ name: path.basename(f), text: git(['show', `:${f}`]).stdout }));
  const readRepo = (p) => { for (const ref of [`:${p}`, `HEAD:${p}`]) { const x = git(['show', ref]); if (x.status === 0) return x.stdout; } return null; };
  let table;
  try { table = readTable(tableFile); } catch (e) { return fail([`${id}: cannot read ${tableFile}: ${String(e.message).split('\n')[0]}`]); }
  const errors = closeErrors({ id, taskText: now.stdout, fm, laneName, assignees, type: String(fm.type ?? '').toLowerCase(), table, root: top, letter: milestoneLetter(top, fm.milestone), files, readRepo });
  return errors.length ? fail(errors) : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = check(process.argv[2]);
