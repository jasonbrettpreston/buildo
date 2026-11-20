#!/usr/bin/env node
// COMPLY.2 close check (task-366; Spec 08 section 7 rule 4 and section 5.3, 08_agents.md: "every DeepSeek finding is adjudicated by a tool-having grounder", rejections carry
// reasons; operator 2026-11-20, see scripts/analysis/rule-lists.json $comment; "If you can trick the gate - whats the point"). Wired as one line in .husky/commit-msg after
// check-task-files; argv[2] is the commit message file. It runs for EVERY staged task file (backlog/tasks/task-N - ....md) whose status moves, in the index, to a finished status
// (table finished_statuses: BUILT, DONE, MERGED), whatever the commit message or its Task: trailers say (a wrong trailer, no trailer or the board's auto-commit does not avoid it).
// For each such task:
//  * who: a build, fix or check task must hold an @lane-<name> assignee in the commit, and may not have dropped it in the closing commit; another type with no lane assignee is exempt
//    unless the commit changes code (src, scripts, mobile, migrations);
//  * the lane report: docs/reports/lanes/<date>/<lane>/ holding a file TASK that names exactly this task id (a dir reused for another task does not count);
//  * Files against the diff: every path changed since the lane branch point (merge-base with the table's base_ref) or staged, outside docs/reports and backlog, is covered by the task's
//    Files line; a build or fix task whose Files resolve to no rule list is refused;
//  * every_task (V2.LIST, task-406): the table's every_task lists are attached to every task by the resolver, so each needs its compliance output like any list; a table with no every_task is refused;
//  * the LENS SET the task type calls for (scripts/analysis/rule-lists.mjs lensSet, the function the launch brief uses): per attached rule list one compliance output
//    (out-compliance-<list id>.txt; plan- or out- for a non build/fix task; ONE file or parts -p1..-pK with no gap), and for a build or fix task also out-<lens>.txt for code-review,
//    error-paths (ux, security by the Files line) and at least one plan-stage output. Each required output starts with the review tool's REVIEW header (template name matching the lens,
//    model, timestamp, file_sha256, prompt_sha256) and ends in a VERDICT: line. A compliance output's file_sha256 must be that of the committed input in-<output name> whose first line
//    `LIST <id> sha256:<hex> material sha256:<hex> part i of n` is recomputed here, and the parts together must carry the WHOLE rule list (so a list cannot be shortened or softened);
//  * finding lines: a loose reading of every lens output must count the same BUG/DEFER lines as the strict one, else "finding lines altered or unparsable";
//  * GROUNDER.md, always for a build or fix task, for any other task when a lens output holds a finding. `Grounder: <name>` and `Lane: <name>`: the grounder is not the lane, the Lane
//    header or ANY assignee, compared with case, punctuation and digit separators removed, and not a name that contains or is contained in one (comply2-b, comply-2). `Ruled: <file>
//    sha256:<12 hex> findings:<n>` for EVERY plan-*.txt and out-*.txt, recomputed here (an output edited after the grounder ruled is refused). One verdict per finding id
//    (<file stem>#<1-based ordinal among BUG/DEFER lines>): `<id> CONFIRMED|REJECTED|CONFLICT <path>:<line> "<quote>" [reason]`; the quote is 20+ characters, is ON that line of a repo
//    file (index, else HEAD), differs from every other finding's quote in the file, and the line does not occur more than 3 times in that file; REJECTED and CONFLICT need a reason of
//    30+ characters; a lane report may not be cited.
//  * self-edit: a commit that changes a protected path (table protected_paths: this check, the table, the helper, the review tool, the hooks) may not also move a task to finished.
// Presence, form and the quote check; never judgement: THIS CHECK CANNOT PROVE THAT THE GROUNDER DID THE WORK WELL, that a quote bears on its finding, or that the grounder is truly a
// different agent. Known limits: deleting the highest -pN output is not detected; ids are positional (a re-run lens needs fresh verdicts). `closeErrors` is exported for a push-range arm.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asList, parseFM } from '../analysis/backlog-lib.mjs';
import { coveredBy, filesEntries, filesText, findingsIn, isLensOutput, lensSet, listBlocks, looseFindingCount, milestoneLetter, parseLensInput, readTable, resolveTask, ruledLine } from '../analysis/rule-lists.mjs';
import { matchesAny } from '../analysis/mcbylaws/paths.mjs';

const git = (a) => { const r = spawnSync('git', ['-c', 'core.quotepath=false', ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }); return { status: r.status ?? 1, stdout: r.stdout ?? '' }; };
const fail = (lines) => { for (const l of lines) process.stderr.write(`check-lane-close: ${l}\n`); return 1; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
// a name with case, punctuation and digit separators removed, minus the lane prefixes: "@lane-BL-COMPLY2", "comply-2" and "Comply_2" all read comply2
const nameKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^lane/, '').replace(/^bl/, '');
const clash = (a, b) => { const x = nameKey(a); const y = nameKey(b); if (!x || !y) return false; if (x === y) return true; const [s, l] = x.length <= y.length ? [x, y] : [y, x]; return s.length >= 3 && l.includes(s); };
const VERDICT = /^\s*[-*]?\s*(\S+)\s+(CONFIRMED|REJECTED|CONFLICT)\s+(\S+?):(\d+)\s+"([^"]*)"\s*(.*)$/;
const REVIEW = /^REVIEW template=(\S+) model=(\S+) at=(\S+) file_sha256=([0-9a-f]{64}) prompt_sha256=([0-9a-f]{64})\s*$/m;

/** The REVIEW header problems of one required lens output ([] when fine); `inputText` (or null) is the committed input it must have been run on. */
function reviewErrors(name, text, template, inputText) {
  const head = text.split('\n').slice(0, 15).join('\n');
  const m = REVIEW.exec(head);
  if (!m) return [`${name}: no REVIEW header in its first lines (the review tool writes it: template, model, timestamp, file_sha256, prompt_sha256); a body with only a VERDICT line is not a lens output`];
  const e = [];
  if (m[1] !== template) e.push(`${name}: the REVIEW header names template ${m[1]}, expected ${template}`);
  if (Number.isNaN(Date.parse(m[3]))) e.push(`${name}: the REVIEW header timestamp ${m[3]} is not a date`);
  if (inputText !== null && m[4] !== sha(inputText)) e.push(`${name}: the REVIEW header file_sha256 is not the sha256 of the committed input in-${name} (the output was not produced from that input)`);
  if (!/^VERDICT:/m.test(text)) e.push(`${name}: no VERDICT line (a failed run is not a lens output)`);
  return e;
}

/**
 * Every refusal for one closing task, as lines. Pure of git: the caller supplies what it read.
 * @param {{id:string, taskText:string, fm:object, assignees:string[], headAssignees:string[], type:string, table:object, root:string, letter?:string,
 *          laneFiles:{dir:string,name:string,text:string}[], changed:string[], readRepo:(p:string)=>string|null}} i
 */
export function closeErrors(i) {
  const { id, type, readRepo } = i;
  const build = type === 'build' || type === 'fix';
  const laneOf = (as) => as.map((a) => /^@lane-(.+)$/.exec(a)?.[1]).find(Boolean);
  const laneName = laneOf(i.assignees);
  if (!laneName) {
    if (build || type === 'check') {
      const dropped = laneOf(i.headAssignees ?? []);
      return [`${id}: a ${type} task closes only with an @lane-<name> assignee${dropped ? ` (the assignee @lane-${dropped} was dropped in the closing commit)` : ' (none)'}: take it through the launch script; no lane report can be checked otherwise`];
    }
    return [];
  }
  let r;
  try { r = resolveTask({ table: i.table, root: i.root, body: i.taskText, type, letter: i.letter }); } catch (e) { return [`${id}: cannot read the rule-list table or one of its path maps: ${String(e.message).split('\n')[0]}`]; }
  if (r.error) return [`${id}: ${r.error.replace(/^refused: /, '')}`];
  const errors = [];
  // V2.LIST (task-406): the every_task lists (the five words, the plan protocol) are required of every task like any list; a table that names none is refused, not skipped (nobody switches them off by leaving the key out)
  const every = i.table.every_task;
  if (!Array.isArray(every) || every.length === 0) return [`${id}: the rule-list table has no every_task lists: the five words and the plan protocol must be attached to every task (scripts/analysis/rule-lists.json)`];
  for (const e of every) if (!r.lists.some((l) => l.id === e)) errors.push(`${id}: the every_task list ${e} is not among the resolved lists (a task always gets it; the table or the resolver was altered)`);

  // Files against the diff
  const entries = filesEntries(i.taskText);
  const outside = i.changed.filter((p) => !p.startsWith('docs/reports/') && !p.startsWith('backlog/') && !coveredBy(entries, p));
  if (outside.length) errors.push(`${id}: ${outside.length} changed path(s) are outside the task's Files line: ${outside.slice(0, 8).join(', ')}${outside.length > 8 ? ', ...' : ''} (declare them on the task or move them to their own task)`);

  // the lane report, scoped by its TASK file
  const dirs = new Map();
  for (const f of i.laneFiles) { if (!dirs.has(f.dir)) dirs.set(f.dir, []); dirs.get(f.dir).push(f); }
  const dirNote = `docs/reports/lanes/<date>/${laneName}/`;
  // task-407 (V2.LAYOUT): the one place the check reads, named in every refusal that says a file is missing
  const layout = `put every plan-<lens>[-<list id>][-pN].txt, out-<lens>[-<list id>][-pN].txt, in-<same name> and TASK directly in ${dirNote}: a file in a subfolder (lens-plan/, lens-out/, stage2/) or named fix-*.txt is never read; a later round (r2, r3, ...) is out-<lens>[-<list id>]-rN.txt`;
  const mine = [...dirs.entries()].filter(([, fs_]) => fs_.some((f) => f.name === 'TASK' && f.text.trim().toLowerCase() === id));
  if (mine.length === 0) return [...errors, `${id}: no ${dirNote} holds a TASK file naming exactly ${id} (a lane report dir is scoped to one task: write the task id in TASK; a dir used for another task does not count); ${layout}`];
  const files = mine.flatMap(([, fs_]) => fs_);
  const textOf = (n) => files.find((f) => f.name === n)?.text;

  // (a) one compliance lens output per list, with its REVIEW header, bound to the committed input and to the whole list
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
      const bad = [];
      const listParts = [];
      for (const n of names) {
        const input = textOf(`in-${n}`);
        if (input === undefined) { bad.push(`${n}: the input in-${n} that the review tool read is not committed beside it`); continue; }
        bad.push(...reviewErrors(n, textOf(n) ?? '', 'lens-compliance.md', input));
        const p = parseLensInput(input);
        if (!p) bad.push(`in-${n}: first line is not "LIST <id> sha256:<hex> material sha256:<hex> part i of n" (rule-lists.mjs lens-input writes it)`);
        else if (p.id !== l.id) bad.push(`in-${n}: stamped for list ${p.id}, expected ${l.id}`);
        else if (!p.ok) bad.push(`in-${n}: the stamped sha256 does not match the list text or the material in the file (the input was edited)`);
        else listParts.push(p);
      }
      if (!bad.length) {
        let whole;
        try { whole = listBlocks(i.table.lists[l.id], i.root, l.id).map((b) => b.text).join(''); } catch (e) { bad.push(`list ${l.id}: ${String(e.message).split('\n')[0]}`); }
        if (whole !== undefined && listParts.map((p) => p.listPart).join('').replace(/\s+/g, '') !== whole.replace(/\s+/g, '')) bad.push(`the committed inputs do not carry the whole list ${l.id} (${l.file}) as it is now: the list was shortened, softened or is out of date`);
      }
      if (bad.length) { why.push(bad.join('; ')); continue; }
      ok = true;
    }
    if (!ok) errors.push(`${id}: list ${l.id} (${l.file}) has no valid compliance lens output in ${dirNote}: write ${phases.join(' or ')}-compliance-${l.id}.txt${why.length ? ` (${why.join('; ')})` : ''}; ${layout}`);
  }
  // (a') the rest of the lens set a build or fix task calls for, and a plan-stage output
  if (build) {
    const set = lensSet({ type, files: filesText(i.taskText) });
    for (const lens of set.out) {
      const n = `out-${lens}.txt`;
      const t = textOf(n);
      if (t === undefined) errors.push(`${id}: the lens set of a ${type} task needs ${n} in ${dirNote} (Spec 08 section 7 rule 4: never one generic pass); ${layout}`);
      else errors.push(...reviewErrors(n, t, `lens-${lens}.md`, null).map((x) => `${id}: ${x}`));
    }
    if (!files.some((f) => /^plan-.+\.txt$/.test(f.name))) errors.push(`${id}: no plan-stage lens output (plan-<lens>.txt) in ${dirNote}: the plan is reviewed before the build (Spec 08 section 7); ${layout}`);
  }

  // finding lines: a loose reading must count the same as the strict one
  const lensFiles = files.filter((f) => isLensOutput(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  for (const f of lensFiles) {
    const strict = findingsIn([f]).length;
    const loose = looseFindingCount(f.text);
    if (strict !== loose) errors.push(`${id}: ${f.name}: finding lines altered or unparsable (the strict reading counts ${strict} BUG/DEFER lines, a loose reading ${loose}): restore the review tool's own output`);
  }

  // (b) the separate grounder
  const findings = findingsIn(lensFiles);
  if (!(build || findings.length > 0)) return errors;
  const g = textOf('GROUNDER.md');
  if (g === undefined) return [...errors, `${id}: GROUNDER.md is missing in ${dirNote}${build ? ' (a build or fix task always needs a separate grounder verdict)' : ` (a lens returned ${findings.length} finding(s))`}`];
  const head = g.split('\n').slice(0, 25).join('\n');
  const gr = /^\s*Grounder:\s*(.+?)\s*$/m.exec(head)?.[1];
  const lh = /^\s*Lane:\s*(.+?)\s*$/m.exec(head)?.[1];
  if (!gr) errors.push('GROUNDER.md has no "Grounder: <name>" header line');
  if (!lh) errors.push('GROUNDER.md has no "Lane: <name>" header line');
  if (gr && lh && clash(gr, lh)) errors.push(`GROUNDER.md: Grounder "${gr}" is the same as Lane "${lh}" (or contains or is contained in it); a separate agent must ground`);
  if (gr && clash(gr, laneName)) errors.push(`GROUNDER.md: Grounder "${gr}" is the lane (${laneName}) or a name that contains or is contained in it; a separate agent must ground`);
  if (gr) for (const a of i.assignees.filter((x) => nameKey(x) !== nameKey(laneName))) if (clash(gr, a)) errors.push(`GROUNDER.md: Grounder "${gr}" is, contains or is contained in an assignee of ${id} (${a}); a separate agent must ground`);
  const ruled = new Map();
  for (const ln of g.split('\n')) { const m = /^\s*Ruled:\s*(\S+)\s+sha256:([0-9a-f]{12})\s+findings:(\d+)\s*$/.exec(ln); if (m) ruled.set(m[1], { sha: m[2], n: Number(m[3]) }); }
  for (const f of lensFiles) {
    const want = ruledLine(f.name, f.text);
    const have = ruled.get(f.name);
    if (!have) errors.push(`GROUNDER.md: no "Ruled:" line for ${f.name} (expected: ${want})`);
    else if (`Ruled: ${f.name} sha256:${have.sha} findings:${have.n}` !== want) errors.push(`GROUNDER.md: the "Ruled:" line for ${f.name} does not match the committed output (the grounder ruled on sha256:${have.sha} findings:${have.n}, the file is now ${want.replace(`Ruled: ${f.name} `, '')}: the output was edited after grounding, or the count is wrong)`);
  }
  const verdicts = new Map();
  for (const raw of g.split('\n')) { const v = VERDICT.exec(raw.replace(/[`*]/g, '')); if (v) verdicts.set(v[1], { word: v[2], file: v[3], line: Number(v[4]), quote: v[5], reason: v[6].trim() }); }
  const seenQuote = new Map();
  for (const f of findings) {
    const v = verdicts.get(f.id);
    const form = 'form: <id> CONFIRMED|REJECTED|CONFLICT <path>:<line> "<quote>" [reason]';
    if (!v) { errors.push(`GROUNDER.md: finding ${f.id} has no complete verdict line (${form}): ${f.line.slice(0, 90)}`); continue; }
    const q = squash(v.quote);
    if (q.length < 20) { errors.push(`GROUNDER.md: finding ${f.id}: the quote must be 20+ characters taken from ${v.file}:${v.line}`); continue; }
    if (seenQuote.has(q)) errors.push(`GROUNDER.md: finding ${f.id} has the same quote as ${seenQuote.get(q)}; each finding needs its own quote from the line it concerns`);
    else seenQuote.set(q, f.id);
    if (v.word !== 'CONFIRMED' && v.reason.length < 30) errors.push(`GROUNDER.md: finding ${f.id} is ${v.word} with a reason under 30 characters (Spec 08 5.3: rejections carry reasons; a conflict says what the operator must rule)`);
    if (path.isAbsolute(v.file) || v.file.split('/').includes('..')) { errors.push(`GROUNDER.md: finding ${f.id}: ${v.file} must be a repo-relative path`); continue; }
    if (v.file.startsWith('docs/reports/lanes/')) { errors.push(`GROUNDER.md: finding ${f.id}: ${v.file} is a lane report; cite the code or the spec the grounder opened, not a lens output`); continue; }
    const text = readRepo(v.file);
    if (text === null) { errors.push(`GROUNDER.md: finding ${f.id}: ${v.file} is not in the repo (index or HEAD)`); continue; }
    const lines = text.split('\n');
    if (v.line < 1 || v.line > lines.length) { errors.push(`GROUNDER.md: finding ${f.id}: ${v.file} has no line ${v.line} (${lines.length} lines)`); continue; }
    const cited = squash(lines[v.line - 1]);
    if (!cited.includes(q)) errors.push(`GROUNDER.md: finding ${f.id}: the quote is not on ${v.file}:${v.line}`);
    else if (lines.filter((x) => squash(x) === cited).length > 3) errors.push(`GROUNDER.md: finding ${f.id}: the cited line occurs more than 3 times in ${v.file} (a boilerplate line proves nothing): cite a line specific to the finding`);
  }
  return errors;
}

function check(msgFile) {
  if (!msgFile) return fail(['usage: check-lane-close.mjs <commit-msg-file>']);
  const top = git(['rev-parse', '--show-toplevel']).stdout.trim() || process.cwd();
  const mergeHead = git(['rev-parse', '--git-path', 'MERGE_HEAD']).stdout.trim();
  if (mergeHead && fs.existsSync(path.resolve(mergeHead))) return 0;
  if (!fs.existsSync(path.join(top, 'backlog/tasks'))) return 0;
  const tableFile = path.join(top, 'scripts/analysis/rule-lists.json');
  const tableInHead = git(['cat-file', '-e', 'HEAD:scripts/analysis/rule-lists.json']).status === 0;
  if (!fs.existsSync(tableFile) && !tableInHead) return 0; // a repo that never had the table is not held to it
  let table;
  try { table = readTable(tableFile); } catch (e) { return fail([`cannot read scripts/analysis/rule-lists.json${tableInHead ? ' (it is in HEAD: the close check fails closed; restore it)' : ''}: ${String(e.message).split('\n')[0]}`]); }
  const finished = new Set((table.finished_statuses ?? ['BUILT', 'DONE', 'MERGED']).map((s) => String(s).toUpperCase()));
  const staged = git(['diff', '--cached', '--name-only', '--no-renames']).stdout.split('\n').filter(Boolean);
  const taskFiles = staged.filter((f) => /^backlog\/tasks\/task-\d+( -.*)?\.md$/i.test(f));
  const moves = [];
  for (const f of taskFiles) {
    const now = git(['show', `:${f}`]);
    if (now.status !== 0) continue;
    const { fm } = parseFM(now.stdout);
    const status = String(fm.status ?? '').toUpperCase();
    if (!finished.has(status)) continue;
    const was = git(['show', `HEAD:${f}`]);
    const headFm = was.status === 0 ? parseFM(was.stdout).fm : {};
    if (was.status === 0 && String(headFm.status ?? '').toUpperCase() === status) continue;
    moves.push({ f, now: now.stdout, fm, headFm, status });
  }
  if (moves.length === 0) return 0;
  const errors = [];
  // self-edit: the check, its table, its helper, the review tool and the hooks may not change in a commit that also closes a task
  const prot = staged.filter((p) => matchesAny(table.protected_paths ?? [], p));
  if (prot.length) errors.push(`this commit changes protected path(s) (${prot.slice(0, 4).join(', ')}) and also moves ${moves.map((m) => path.basename(m.f).slice(0, 12)).join(', ')} to a finished status: land the check or hook change first, close the task in a later commit (self-edit rule, COMPLY.2)`);
  // the diff since the lane branch point, plus what is staged
  const baseRef = table.base_ref;
  let changed = [];
  if (!baseRef) errors.push('rule-lists.json has no base_ref: the lane branch point cannot be found (fail closed)');
  else {
    const mb = git(['merge-base', 'HEAD', baseRef]);
    if (mb.status !== 0) errors.push(`cannot find the lane branch point (git merge-base HEAD ${baseRef} failed): the Files line cannot be checked against the diff (fail closed)`);
    else changed = [...new Set([...git(['diff', '--name-only', '--no-renames', mb.stdout.trim(), 'HEAD']).stdout.split('\n'), ...staged].filter(Boolean))];
  }
  const codeStaged = staged.filter((f) => /^(src|scripts|mobile|migrations)\//.test(f));
  const readRepo = (p) => { for (const ref of [`:${p}`, `HEAD:${p}`]) { const x = git(['show', ref]); if (x.status === 0) return x.stdout; } return null; };
  const lanePaths = git(['ls-files', '--cached', '-z', '--', 'docs/reports/lanes']).stdout.split('\0').filter(Boolean);
  for (const mv of moves) {
    const id = String(mv.fm.id ?? mv.f).toLowerCase().replace(/^task-0*/, 'task-');
    const assignees = asList(mv.fm.assignee).map(String);
    const type = String(mv.fm.type ?? '').toLowerCase();
    const laneName = assignees.map((a) => /^@lane-(.+)$/.exec(a)?.[1]).find(Boolean);
    if (!laneName && codeStaged.length && !(type === 'build' || type === 'fix' || type === 'check')) { errors.push(`${id} is set ${mv.status} by a commit that changes code (${codeStaged.slice(0, 3).join(', ')}) but has no @lane-* assignee: take it through the launch script (no exemption for code, COMPLY.2)`); continue; }
    const laneFiles = laneName ? lanePaths.filter((f) => { const p = f.split('/'); return p.length === 6 && p[4] === laneName; }).map((f) => ({ dir: path.dirname(f), name: path.basename(f), text: git(['show', `:${f}`]).stdout })) : [];
    errors.push(...closeErrors({ id, taskText: mv.now, fm: mv.fm, assignees, headAssignees: asList(mv.headFm.assignee).map(String), type, table, root: top, letter: milestoneLetter(top, mv.fm.milestone), laneFiles, changed, readRepo }));
  }
  return errors.length ? fail(errors) : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = check(process.argv[2]);
