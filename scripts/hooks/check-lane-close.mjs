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
//  * the WHOLE change (V2.WHOLE, task-410): the changed paths of the task range (merge-base with the table's base_ref to HEAD, minus the table's exempt paths) are recomputed here; the
//    committed out-phase inputs (each compliance list, and a split code-review, error-paths, ux or security lens: out-<lens>-pN.txt with in-<same name>) carry the chunk stamps lens-input wrote
//    ("chunk c of m" and the path list); the check refuses when the union of the chunk path lists is not that list (a file left out, or a path outside the change), when a path is in two
//    chunks, when a stamp does not match its own material or its file name, when the chunks of a list are not 1..m with every list part, or when a chunk's text is not what
//    git diff (rule-lists.mjs DIFF_ARGS) prints for its paths. A path staged in the closing commit itself is in no chunk and is refused (the closing commit holds records only).
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
import { coveredBy, DIFF_ARGS, diffPaths, lensPromptHash, renderLensInput, verifyResolved, filesEntries, filesText, findingsIn, isLensOutput, lensSet, listBlocks, looseFindingCount, milestoneLetter, parseLensInput, readTable, resolveTask, ruledLine } from '../analysis/rule-lists.mjs';
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
function reviewErrors(name, text, template, inputText, opt = {}) {
  const head = text.split('\n').slice(0, 15).join('\n');
  const m = REVIEW.exec(head);
  if (!m) return [`${name}: no REVIEW header in its first lines (the review tool writes it: template, model, timestamp, file_sha256, prompt_sha256); a body with only a VERDICT line is not a lens output`];
  const e = [];
  if (m[1] !== template) e.push(`${name}: the REVIEW header names template ${m[1]}, expected ${template}`);
  if (Number.isNaN(Date.parse(m[3]))) e.push(`${name}: the REVIEW header timestamp ${m[3]} is not a date`);
  if (inputText !== null && m[4] !== sha(inputText)) e.push(`${name}: the REVIEW header file_sha256 is not the sha256 of ${opt.what ?? `the committed input in-${name}`} (the output was not produced from that file)`);
  // F3: the prompt hash is recomputed from the repo template, the committed input and the context value the tool used; an arbitrary or hand-written value does not match
  if (opt.templateText !== undefined && inputText !== null) {
    if (opt.templateText === null) e.push(`${name}: the review template ${template} is not in the repo (index or HEAD), so prompt_sha256 cannot be recomputed (fail closed)`);
    else if (!lensContexts().some((c) => m[5] === lensPromptHash({ templateText: opt.templateText, inputText, context: c }))) e.push(`${name}: the REVIEW header prompt_sha256 is not the hash of the prompt the review tool builds from ${template}, the committed input and the context (an output not made by the tool on that input, or an edited input)`);
  }
  if (!/^VERDICT:/m.test(text)) e.push(`${name}: no VERDICT line (a failed run is not a lens output)`);
  return e;
}

/**
 * V2.WHOLE (task-410): the chunk proof for one output family. `items` [{name, k, p}] are the committed inputs (k: the -pN number in the name or null, p: parseLensInput's result); `expected` the changed
 * paths of the task range minus the exempt ones; `diffOf(paths)` the text git prints for them. Returns the refusal lines ([] when the chunks together are exactly the change and each is true).
 */
export function chunkErrors({ label, items, expected, diffOf = () => null, optional = [] }) {
  const safePaths = (m) => { try { return diffPaths(m); } catch { return null; } }; // F8 round: an unreadable header is a refusal line, never a stack trace
  const e = [];
  if (items.length === 0) return e;
  const m = items[0].p.chunks ?? 1;
  const n = items[0].p.parts;
  const byChunk = new Map();
  for (const it of items) {
    const { p, name } = it;
    const c = p.chunk ?? 1;
    if ((p.chunks ?? 1) !== m || p.parts !== n) e.push(`${name}: stamped chunk ${c} of ${p.chunks ?? 1}, ${p.parts} list part(s); the other inputs of ${label} say ${m} chunk(s), ${n} part(s)`);
    if (c < 1 || c > m) e.push(`${name}: chunk ${c} of ${m} is outside 1..${m}`);
    const own = safePaths(p.material);
    if (own === null) { e.push(`${name}: the material holds a diff file header this tool cannot read (a quoted name or a rename header): make the diff with the command in the brief`); continue; }
    if (p.chunk !== undefined && (!p.paths || JSON.stringify(p.paths) !== JSON.stringify(own))) e.push(`${name}: the stamped path list ${JSON.stringify(p.paths)} is not the list of files in its own material ${JSON.stringify(own)} (the stamp was edited)`);
    if ((it.k ?? 1) !== (c - 1) * p.parts + p.part) e.push(`${name}: the file number does not match its stamp (chunk ${c} of ${m}, part ${p.part} of ${p.parts} is file -p${(c - 1) * p.parts + p.part}; the stamp was edited or the file renamed)`);
    if (!byChunk.has(c)) byChunk.set(c, []);
    byChunk.get(c).push(it);
  }
  if (items.length !== m * n) e.push(`${label}: ${items.length} input file(s) but the stamps say ${m} chunk(s) x ${n} list part(s) = ${m * n}: a chunk or a part is missing or left over from an earlier run`);
  const seen = new Map();
  for (let c = 1; c <= m; c++) {
    const its = byChunk.get(c) ?? [];
    if (its.length === 0) { e.push(`${label}: chunk ${c} of ${m} has no input file`); continue; }
    if (new Set(its.map((x) => x.p.materialSha)).size > 1) e.push(`${label}: the parts of chunk ${c} carry different material`);
    if (its.map((x) => x.p.part).sort((a, b) => a - b).join() !== Array.from({ length: n }, (_, j) => j + 1).join()) e.push(`${label}: chunk ${c} does not hold list parts 1..${n} once each`);
    const paths = safePaths(its[0].p.material) ?? [];
    for (const q of paths) seen.set(q, [...(seen.get(q) ?? []), c]);
    const want = diffOf(paths);
    if (want === null || its[0].p.material !== want) {
      const a = its[0].p.material; const b = want ?? '';
      let at = 0; while (at < a.length && a[at] === b[at]) at++;
      e.push(`${label}: chunk ${c} of ${m} (${paths.slice(0, 3).join(', ') || 'no file'}${paths.length > 3 ? ', ...' : ''}) is not what git diff prints for its paths (first difference at character ${at}; the diff is made with the command in the brief: rule-lists.mjs DIFF_ARGS, merge-base to HEAD)`);
    }
  }
  const dup = [...seen].filter(([, cs]) => cs.length > 1).map(([q]) => q);
  if (dup.length) e.push(`${label}: ${dup.length} path(s) are in more than one chunk: ${dup.slice(0, 5).join(', ')}`);
  const exp = new Set(expected);
  const missing = expected.filter((q) => !seen.has(q));
  const opt = new Set(optional);
  const extra = [...seen.keys()].filter((q) => !exp.has(q) && !opt.has(q));
  if (missing.length) e.push(`${label}: ${missing.length} changed file(s) of the task range are in no chunk, so the review never saw them: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', ...' : ''}`);
  if (extra.length) e.push(`${label}: ${extra.length} path(s) in the chunks are not in the task range (or are exempt paths): ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ', ...' : ''}`);
  return e;
}
/** H1: the board ref the base, the launch commit and the deciding table keys are read from (a lane's table cannot name another). */
export const BOARD_REFS = ['refs/heads/wf2/board', 'refs/remotes/origin/wf2/board'];
const kOf = (name) => { const x = /-p(\d+)\.txt$/.exec(name); return x ? Number(x[1]) : null; };

/**
 * Every refusal for one closing task, as lines. Pure of git: the caller supplies what it read.
 * @param {{id:string, taskText:string, fm:object, assignees:string[], headAssignees:string[], type:string, table:object, root:string, letter?:string,
 *          laneFiles:{dir:string,name:string,text:string}[], changed:string[], expectedPaths?:string[], diffOf?:(paths:string[])=>string|null, readRepo:(p:string)=>string|null}} i
 */
/**
 * HOOK POINT (task-375, the reviewer context): the context values a lens run may have used. Today the review tool is run with no --context, so its placeholder is the one value; when task-375 builds the
 * context option, this returns the context text the lane passed (read from the committed pasted-context file) and prompt_sha256 is recomputed with it. Nothing else changes in the check.
 */
export const lensContexts = () => [undefined];

export function closeErrors(i) {
  const { id, type, readRepo } = i;
  const readBase = i.readBase ?? readRepo; // F10: templates come from the range base
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
  const expected = i.expectedPaths ?? []; // V2.WHOLE: the changed paths of the task range minus the exempt ones (check() computes them)
  // F1: the proof is never skipped silently: a build or fix task whose range holds no file outside the exempt paths (the lane was folded into the base already, or the base is wrong) is refused
  if (build && i.rangeEmpty) errors.push(`${id}: no file the task's Files line covers changed between the task's launch commit and HEAD, so the review cannot be proved to cover any change (the launch commit is the board commit that took the task for its lane assignee)`);
  // V2.LIST (task-406): the every_task lists (the five words, the plan protocol) and the milestone lists are required of every task like any list; verifyResolved is the one reading shared with validate, check-tasks and the launch.
  // A table with no every_task is refused (fails closed: nobody switches the lists off by leaving the key out); a missing milestone_docs key or entry counts as missing lists; a build task with no milestone is refused by resolveTask above.
  const missing = verifyResolved(i.table, r, i.letter, type);
  if (!Array.isArray(i.table.every_task) || i.table.every_task.length === 0) return [`${id}: the rule-list table has no every_task lists: the five words and the plan protocol must be attached to every task (scripts/analysis/rule-lists.json)`];
  for (const m of missing) errors.push(`${id}: ${m} (a task always gets them; the table or the resolver was altered)`);

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
        bad.push(...reviewErrors(n, textOf(n) ?? '', 'lens-compliance.md', input, { templateText: readBase('.claude/review-templates/lens-compliance.md') }));
        const p = parseLensInput(input);
        if (!p) bad.push(`in-${n}: first line is not "LIST <id> sha256:<hex> material sha256:<hex> part i of n" (rule-lists.mjs lens-input writes it)`);
        else if (p.id !== l.id) bad.push(`in-${n}: stamped for list ${p.id}, expected ${l.id}`);
        else if (!p.ok) bad.push(`in-${n}: the stamped sha256 does not match the list text or the material in the file (the input was edited)`);
        else if (renderLensInput({ id: p.id, list: i.table.lists[p.id], part: p.listPart, i: p.part, n: p.parts, material: p.material, paths: p.chunk === undefined ? null : p.paths, c: p.chunk, m: p.chunks }) !== input) bad.push(`in-${n}: not what lens-input writes for its own stamp (the head line, the paths or the text around the list part or the material was edited)`);
        else listParts.push(p);
      }
      if (!bad.length) {
        let whole;
        try { whole = listBlocks(i.table.lists[l.id], i.root, l.id).map((b) => b.text).join(''); } catch (e) { bad.push(`list ${l.id}: ${String(e.message).split('\n')[0]}`); }
        // V2.WHOLE: every chunk holds the whole list (its parts 1..n together); the coverage of the change is proved per list
        const chunks = new Map();
        for (const p of listParts) { const c = p.chunk ?? 1; chunks.set(c, [...(chunks.get(c) ?? []), p]); }
        for (const [c, ps] of chunks) if (whole !== undefined && ps.sort((a, b) => a.part - b.part).map((p) => p.listPart).join('').replace(/\s+/g, '') !== whole.replace(/\s+/g, '')) bad.push(`the committed inputs${chunks.size > 1 ? ` of chunk ${c}` : ''} do not carry the whole list ${l.id} (${l.file}) as it is now: the list was shortened, softened or is out of date`);
        if (ph === 'out' && expected.length) bad.push(...chunkErrors({ label: `${base}`, items: names.map((n, x) => ({ name: `in-${n}`, k: kOf(n), p: listParts[x] })), expected, diffOf: i.diffOf, optional: i.optionalPaths }));
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
      const lparts = files.map((f) => new RegExp(`^out-${esc(lens)}-p(\\d+)\\.txt$`).exec(f.name)).filter(Boolean).map((x) => Number(x[1])).sort((a, b) => a - b);
      if (t === undefined && lparts.length) {
        // V2.WHOLE: a lens whose prompt was over the bound is split by the same tool (lens-input with the lens template, no --list): out-<lens>-pN.txt, each with its committed in- input
        const gapAt = lparts.findIndex((x, k) => x !== k + 1);
        if (gapAt !== -1) { errors.push(`${id}: out-${lens}: parts ${lparts.join(',')} have a gap, out-${lens}-p${gapAt + 1}.txt is missing`); continue; }
        const items = [];
        for (const x of lparts) {
          const nm = `out-${lens}-p${x}.txt`;
          const input = textOf(`in-${nm}`);
          if (input === undefined) { errors.push(`${id}: ${nm}: the input in-${nm} that the review tool read is not committed beside it`); continue; }
          errors.push(...reviewErrors(nm, textOf(nm) ?? '', `lens-${lens}.md`, input, { templateText: readBase(`.claude/review-templates/lens-${lens}.md`) }).map((y) => `${id}: ${y}`));
          const p = parseLensInput(input);
          if (p && p.ok && p.id === 'none' && renderLensInput({ id: 'none', list: null, part: '', i: p.part, n: p.parts, material: p.material, paths: p.chunk === undefined ? null : p.paths, c: p.chunk, m: p.chunks }) !== input) errors.push(`${id}: in-${nm}: not what lens-input writes for its own stamp (the head line, the paths or the text around the material was edited)`);
          else if (!p || p.id !== 'none' || !p.ok || p.listPart.trim() !== '') errors.push(`${id}: in-${nm}: not an input written by lens-input for a lens with no rule list (first line "LIST none sha256:... part 1 of 1 chunk c of m", stamps matching its text)`);
          else items.push({ name: `in-${nm}`, k: x, p });
        }
        if (items.length === lparts.length && expected.length) errors.push(...chunkErrors({ label: `out-${lens}`, items, expected, diffOf: i.diffOf, optional: i.optionalPaths }).map((y) => `${id}: ${y}`));
        continue;
      }
      if (t !== undefined && lparts.length) { errors.push(`${id}: ${n} and out-${lens}-pN.txt both exist (one file, or -p1..-pK): an unsplit file does not stand in for split parts`); continue; }
      if (t === undefined) errors.push(`${id}: the lens set of a ${type} task needs ${n} in ${dirNote} (Spec 08 section 7 rule 4: never one generic pass); ${layout}`);
      else {
        // F3: an unsplit lens output is bound to the whole range: its file_sha256 must be the sha256 of the recomputed diff text of every changed path (the file the lens read)
        const whole = expected.length && i.diffOf ? i.diffOf(expected) : '';
        if (expected.length === 0) errors.push(...reviewErrors(n, t, `lens-${lens}.md`, null).map((x) => `${id}: ${x}`));
        else if (whole === null || whole === '') errors.push(`${id}: ${n}: the whole-range diff text cannot be recomputed, so the file the lens read cannot be proved`);
        else errors.push(...reviewErrors(n, t, `lens-${lens}.md`, whole, { what: 'the recomputed diff of the whole task range (the diff file the lens must have read, made with the command in the brief)', templateText: readBase(`.claude/review-templates/lens-${lens}.md`) }).map((x) => `${id}: ${x}`));
      }
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
  // H1 (V2.WHOLE round 4): the keys that decide what is checked (base_ref, finished_statuses, protected_paths, exempt) come from the BOARD ref, never from the lane's own table or from a ref the lane's table names
  const boardRef = BOARD_REFS.find((r) => git(['rev-parse', '--verify', '--quiet', `${r}^{commit}`]).status === 0) ?? null;
  let boardTable = null;
  if (boardRef) { const bx = git(['show', `${boardRef}:scripts/analysis/rule-lists.json`]); try { boardTable = bx.status === 0 ? JSON.parse(bx.stdout) : null; } catch { boardTable = null; } }
  // a commit that moves no task never needs the board (round 5): the finished statuses default until a move is found, then the board is required
  const finished = new Set((boardTable?.finished_statuses ?? ['BUILT', 'DONE', 'MERGED']).map((s) => String(s).toUpperCase()));
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
  if (!boardTable) return fail([`the board ref ${BOARD_REFS[0]} or its scripts/analysis/rule-lists.json cannot be read: a task close needs the board, because the keys that decide what is checked and the task's launch commit come from it (fail closed)`]);
  const errors = [];
  // self-edit: the check, its table, its helper, the review tool and the hooks may not change in a commit that also closes a task
  const prot = staged.filter((p) => matchesAny(boardTable.protected_paths ?? [], p));
  if (prot.length) errors.push(`this commit changes protected path(s) (${prot.slice(0, 4).join(', ')}) and also moves ${moves.map((m) => path.basename(m.f).slice(0, 12)).join(', ')} to a finished status: land the check or hook change first, close the task in a later commit (self-edit rule, COMPLY.2)`);
  // the diff since the lane branch point, plus what is staged
  let changed = [];
  const full = boardRef;
  let base = null;
  let baseTable = null;
  for (const k of ['base_ref', 'finished_statuses', 'protected_paths', 'exempt']) if (JSON.stringify(table[k] ?? null) !== JSON.stringify(boardTable[k] ?? null)) errors.push(`the ${k} of this branch's table (${JSON.stringify(table[k] ?? null)}) differs from the board's (${JSON.stringify(boardTable[k] ?? null)}): a lane may not change what decides what is checked or what the review need not cover (the check uses the board's)`);
  {
    const mb = git(['merge-base', 'HEAD', full]);
    if (mb.status !== 0) errors.push(`cannot find the lane branch point (git merge-base HEAD ${full} failed): the Files line cannot be checked against the diff (fail closed)`);
    else {
      base = mb.stdout.trim();
      // F10: the rest of the table (lists, rows, every_task) comes from the range base
      const bt = git(['show', `${base}:scripts/analysis/rule-lists.json`]);
      try { baseTable = bt.status === 0 ? JSON.parse(bt.stdout) : null; } catch { baseTable = null; }
      if (!baseTable) errors.push(`scripts/analysis/rule-lists.json cannot be read at the range base ${base.slice(0, 9)}: the table cannot be taken from the board's copy (fail closed)`);
      const rr = git(['diff', '--name-only', '--no-renames', base, 'HEAD']);
      if (rr.status !== 0) errors.push(`git diff --name-only ${base.slice(0, 9)} HEAD failed (status ${rr.status}): the changed paths of the task range cannot be recomputed (fail closed)`);
      changed = [...new Set([...rr.stdout.split('\n').filter(Boolean), ...staged].filter(Boolean))];
    }
  }
  const exempt = boardTable.exempt ?? [];
  const codeStaged = staged.filter((f) => /^(src|scripts|mobile|migrations)\//.test(f));
  const readRepo = (p) => { for (const ref of [`:${p}`, `HEAD:${p}`]) { const x = git(['show', ref]); if (x.status === 0) return x.stdout; } return null; };
  const readBase = (p) => { if (!base) return null; const x = git(['show', `${base}:${p}`]); return x.status === 0 ? x.stdout : null; }; // F10: lens templates from the range base
  const lanePaths = git(['ls-files', '--cached', '-z', '--', 'docs/reports/lanes']).stdout.split('\0').filter(Boolean);
  for (const mv of moves) {
    const id = String(mv.fm.id ?? mv.f).toLowerCase().replace(/^task-0*/, 'task-');
    const assignees = asList(mv.fm.assignee).map(String);
    // H9 (round 6): type and lane assignee come from the BOARD copy of the task file (found by task id on the board ref the launch commit is searched on), never from the lane's own copy, whatever the lane did in earlier commits
    const num = /task-0*(\d+)/i.exec(path.basename(mv.f))?.[1];
    if (num && String(mv.fm.id ?? '').toLowerCase().replace(/^task-0*/, '') !== num) { errors.push(`${id}: the front matter id (${mv.fm.id}) is not the file's task number (${num}): the id scopes the lane report, a lane may not rename it`); continue; }
    const boardFile = num ? git(['ls-tree', '--name-only', boardRef, 'backlog/tasks/']).stdout.split('\n').find((n) => new RegExp(`^backlog/tasks/task-0*${num}( -.*)?\\.md$`, 'i').test(n)) : null;
    const bx = boardFile ? git(['show', `${boardRef}:${boardFile}`]) : null;
    const boardFm = bx && bx.status === 0 ? parseFM(bx.stdout).fm : null;
    const boardLane = boardFm ? asList(boardFm.assignee).map(String).find((a) => /^@lane-/.test(a)) : undefined;
    const boardType = String(boardFm?.type ?? '').toLowerCase();
    const stagedLane = assignees.find((a) => /^@lane-/.test(a));
    if (boardLane && (boardType === 'build' || boardType === 'fix') && (stagedLane !== boardLane || !['build', 'fix'].includes(String(mv.fm.type ?? '').toLowerCase()))) { errors.push(`${id}: the board copy of this task is a ${boardType} task held by ${boardLane}; the closing copy has type ${mv.fm.type} and assignee ${assignees.join(', ') || '(none)'}: a lane build or fix task closes only as that lane's build or fix task (type and lane assignee are read from the board copy, not from the lane's own commits)`); continue; }
    // the lane assignee: the board's, else the staged one, else the one the HEAD copy holds (H8)
    const laneAssign = boardLane ?? stagedLane ?? asList(mv.headFm.assignee).map(String).find((a) => /^@lane-/.test(a));
    const laneName = assignees.map((a) => /^@lane-(.+)$/.exec(a)?.[1]).find(Boolean);
    // F8 + F11: the task as it was taken. L is the board commit that first holds the lane assignee on the task file (the lane cannot choose it); type, assignee and the Files line are read from that copy
    let L = null;
    let baseTask = null;
    if (laneAssign && full) {
      L = git(['log', full, '--first-parent', '--reverse', '--format=%H', `-S${laneAssign}`, '--', mv.f]).stdout.split('\n').filter(Boolean)[0] ?? null;
      if (!L) { errors.push(`${id}: no launch commit found: \`git log ${full} --first-parent --reverse -S${laneAssign} -- ${mv.f}\` returns nothing, so the task's recorded launch (the take on the board for its lane) cannot be proved (fail closed)`); continue; }
      if (git(['merge-base', '--is-ancestor', L, 'HEAD']).status !== 0) { errors.push(`${id}: the launch commit ${L.slice(0, 9)} is not an ancestor of HEAD: this branch was not cut from the task's launch`); continue; }
      const bx = git(['show', `${L}:${mv.f}`]);
      baseTask = bx.status === 0 ? bx.stdout : null;
    }
    const baseFm = baseTask ? parseFM(baseTask).fm : null;
    const type = String(boardFm?.type ?? baseFm?.type ?? mv.fm.type ?? '').toLowerCase();
    if (baseFm && String(baseFm.milestone ?? '') !== String(mv.fm.milestone ?? '')) errors.push(`${id}: the milestone is ${mv.fm.milestone} here but ${baseFm.milestone} at its launch: a lane may not move its task to another milestone (the milestone decides which objectives lists apply)`);
    // H3: the prompt builder and the review tool decide what a recomputed prompt hash proves; they may not differ from the range base unless the task's launch Files line covers them
    if (base && baseTask) for (const p of ['scripts/lib/review-template.js', 'scripts/deepseek-review.js']) if (git(['diff', '--quiet', base, 'HEAD', '--', p]).status === 1 && !coveredBy(filesEntries(baseTask) ?? [], p)) errors.push(`${id}: ${p} differs from the range base but the task's launch Files line does not name it: the recomputed prompt hash would only prove consistency with the lane's own prompt builder`);
    if (baseFm && String(mv.fm.type ?? '').toLowerCase() !== type) errors.push(`${id}: the task type is ${mv.fm.type} here but ${baseFm.type} at its launch: a lane may not retype its task`);
    if (!laneName && codeStaged.length && !(type === 'build' || type === 'fix' || type === 'check')) { errors.push(`${id} is set ${mv.status} by a commit that changes code (${codeStaged.slice(0, 3).join(', ')}) but has no @lane-* assignee: take it through the launch script (no exemption for code, COMPLY.2)`); continue; }
    const laneFiles = laneName ? lanePaths.filter((f) => { const p = f.split('/'); return p.length === 6 && p[4] === laneName; }).map((f) => ({ dir: path.dirname(f), name: path.basename(f), text: git(['show', `:${f}`]).stdout })) : [];
    // the coverage set: what changed between L and HEAD that the Files line covers (the launch Files and the current one together: narrowing hides nothing, widening adds review), minus the exempt paths
    let expectedPaths = [];
    let optionalPaths = [];
    let rangeEmpty = false;
    let diffOf = () => null;
    if (L) {
      const lr = git(['diff', '--name-only', '--no-renames', L, 'HEAD']);
      if (lr.status !== 0) { errors.push(`${id}: git diff --name-only ${L.slice(0, 9)} HEAD failed (status ${lr.status}): the changed paths cannot be recomputed (fail closed)`); continue; }
      const entries = [...(filesEntries(baseTask ?? '') ?? []), ...(filesEntries(mv.now) ?? [])];
      const all = lr.stdout.split('\n').filter(Boolean);
      const cov = all.filter((p) => coveredBy(entries, p));
      rangeEmpty = cov.length === 0;
      expectedPaths = cov.filter((p) => !matchesAny(exempt, p));
      optionalPaths = all.filter((p) => !matchesAny(exempt, p) && (p.startsWith('docs/reports/') || p.startsWith('backlog/')));
      diffOf = (paths) => { const r = git(['--literal-pathspecs', 'diff', ...DIFF_ARGS, L, 'HEAD', '--', ...paths]); return r.status === 0 ? r.stdout : null; };
      // F4 + F12: a lane build or fix close holds records only: the lane's own report directory, the review context directory of the task, the task files and the decision record
      if (['build', 'fix'].includes(type)) {
        const rec = (p) => p.startsWith(`docs/reports/lanes/`) && p.split('/')[4] === laneName || p.startsWith(`docs/reports/reviews/${id}/`) || /^backlog\/tasks\/task-\d+/.test(p) || p.startsWith('backlog/decisions/');
        const late = staged.filter((p) => !rec(p));
        if (late.length) errors.push(`the closing commit of ${id} stages ${late.length} path(s) outside the reviewed task range: ${late.slice(0, 6).join(', ')}${late.length > 6 ? ', ...' : ''} (the closing commit of a lane build or fix task holds records only: its lane report directory, the task file, the decision record; commit the work first so the review covers it)`);
      }
    }
    // F10: the table the task is judged by is the range base's; a task whose own Files line names the table is the one exception: it is judged by its branch table (so its own edit applies) with every field that decides what is reviewed (exempt, base_ref, finished_statuses, protected_paths, every_task) still the range base's
    const ownsTable = coveredBy(filesEntries(baseTask ?? mv.now), 'scripts/analysis/rule-lists.json');
    const pin = { exempt: boardTable.exempt, base_ref: boardTable.base_ref, finished_statuses: boardTable.finished_statuses, protected_paths: boardTable.protected_paths };
    const judge = !baseTable ? { ...table, ...pin } : ownsTable ? { ...table, ...pin, every_task: baseTable.every_task } : { ...baseTable, ...pin };
    // fields read from the lane's own copy, each pinned (round 6): the Files line the rule lists resolve from is the UNION of the launch copy and the staged one (narrowing it cannot drop a list), and the assignees the grounder must differ from are the staged, HEAD and board ones together
    const unionFiles = [...new Set([...(filesEntries(baseTask ?? '') ?? []), ...(filesEntries(mv.now) ?? [])])];
    const resolveText = unionFiles.length ? mv.now.replace(/Files:[ \t]*.*$/m, `Files: ${unionFiles.join(', ')}`) : mv.now;
    const allAssignees = [...new Set([...assignees, ...asList(mv.headFm.assignee).map(String), ...(boardFm ? asList(boardFm.assignee).map(String) : [])])];
    errors.push(...closeErrors({ id, taskText: resolveText, fm: mv.fm, assignees: allAssignees, headAssignees: asList(mv.headFm.assignee).map(String), type, table: judge, root: top, letter: milestoneLetter(top, baseFm?.milestone ?? mv.fm.milestone), laneFiles, changed, expectedPaths, optionalPaths, rangeEmpty, diffOf, readRepo, readBase }));
  }
  return errors.length ? fail(errors) : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = check(process.argv[2]);
