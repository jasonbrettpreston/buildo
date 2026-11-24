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
//  * task-423: the compliance proof is ONE joined output set per stage (out-compliance-rules[-pN].txt, the resolved lists joined whole by joinLists) or the per-list set (a stage holding both is refused);
//  * task-438 (RR-0385 item 2): a list on the engineering standards file (rule-lists.mjs seatOf) is the engineering seat's: out-engineering-<list id>.txt on lens-engineering.md (joined: out-engineering-rules),
//    every other list the compliance seat's; the form is chosen per seat and per stage. The close applies the split when the range base holds lens-engineering.md (a lane launched before
//    the landing closes as before, every list under compliance); the launch gate always splits. No alias: a compliance file never stands for the engineering seat;
//    plan findings are ruled once: with GROUNDER-PLAN.md at the launch commit non-empty and holding a Plan line, no plan-*.txt is required and none is read for findings;
//  * the LENS SET the task type calls for (scripts/analysis/rule-lists.mjs lensSet, the function the launch brief uses): per attached rule list one compliance output
//    (out-compliance-<list id>.txt; plan- or out- for a non build/fix task; ONE file or parts -p1..-pK with no gap), and for a build or fix task also out-<lens>.txt for code-review,
//    error-paths (ux, security by the Files line); a plan-stage output only when GROUNDER-PLAN.md at the launch commit is absent (task-423). Each required output starts with the review tool's REVIEW header (template name matching the lens,
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
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { asList, parseFM } from '../analysis/backlog-lib.mjs';
import { coveredBy, DIFF_ARGS, diffPaths, JOINED_ID, joinLists, lensPromptHash, renderLensInput, verifyResolved, filesEntries, filesText, findingsIn, isLensOutput, lensSet, listBlocks, looseFindingCount, milestoneLetter, outputLists, parseLensInput, readTable, resolveTask, ruledLine, seatOf } from '../analysis/rule-lists.mjs';
import { matchesAny } from '../analysis/mcbylaws/paths.mjs';

const { CONTEXT_SECTIONS, PLAN_SECTIONS, extractSections } = createRequire(import.meta.url)('../lib/review-template.js');
const PLACEHOLDER_CONTEXT = '(no pasted context provided)';
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
    else if (!(opt.contexts ?? []).some((c) => m[5] === lensPromptHash({ templateText: opt.templateText, inputText, context: c }))) e.push(`${name}: the REVIEW header prompt_sha256 is not the hash of the prompt the review tool builds from ${template}, the committed input and the context (an output not made by the tool on that input, or an edited input)`);
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

/** One verdict per finding id of a GROUNDER.md: Map id -> {word, file, line, quote, reason} (the last verdict line of an id wins). */
export function parseVerdicts(g) {
  const verdicts = new Map();
  for (const raw of g.split('\n')) { const v = VERDICT.exec(raw.replace(/[`*]/g, '')); if (v) verdicts.set(v[1], { word: v[2], file: v[3], line: Number(v[4]), quote: v[5], reason: v[6].trim() }); }
  return verdicts;
}

// task-399 (FOLD.ADOPT, Spec 08 section 7 rule 3 08_agents.md:350 "fold survivors, file rejections with reasons", rule 6 :360 BUG goes to WF3 before Green Light, DEFER to review_followups.md with reasons):
// every CONFIRMED or CONFLICT id of the grounder file carries ONE outcome line in TRIAGE.md (the last line of an id is judged). Presence, form and git facts; never judgement: it cannot prove that a fix fixes.
const SEVS = ['CRITICAL', 'HIGH', 'MED', 'LOW', 'NIT'];
const normSev = (s) => { const u = String(s ?? '').toUpperCase(); const k = u === 'CRIT' ? 'CRITICAL' : u === 'MEDIUM' ? 'MED' : u; return SEVS.includes(k) ? k : null; };
/** The severity a grounder writes at the START of its reason (the first word, after punctuation), else null. S5 (task-453): a severity word later in the reason ("not a NIT") sets nothing. */
const reasonSev = (reason) => { const m = /^\W*(CRITICAL|CRIT|HIGH|MEDIUM|MED|LOW|NIT)\b/.exec(String(reason ?? '')); return m ? normSev(m[1]) : null; };
/** {kind: BUG|DEFER, sev} of a lens finding line ("BUG severity=HIGH - ..."); the lens writes CRIT, read as CRITICAL. */
export const lensKindOf = (line) => { const m = /^\s*[-*]?\s*(BUG|DEFER)\s+severity=([A-Za-z]+)/.exec(line); return { kind: m ? m[1] : 'BUG', sev: m ? normSev(m[2]) : null, line }; };
const SEAT_LINE = /^\s*(?:#+\s+)?([a-z0-9-]+)#(\d+)\s+(CRITICAL|HIGH|MED|LOW|NIT)\b/; // S4 (task-453): a seat id may hold a hyphen (reality-check#2)
const SEAT_HEAD = /^\s*Seat:\s*(\S+)\s+(\S+)\s+sha256:([0-9a-f]{12})\s*$/gm;
/** The `Seat: <name> <repo path> sha256:<12 hex>` lines of a GROUNDER.md, each with its file text from `read` (null when missing). */
export const seatLines = (g, read) => [...g.matchAll(SEAT_HEAD)].map((m) => ({ name: m[1], path: m[2], sha: m[3], text: read(m[2]) }));
/** S1 (task-453): the finding lines of the seat reports [{id, line}], so the quote, cited-line and reason checks of grounderErrors run on them too. A seat that outcomeErrors refuses (no text, another sha, outside the seat root) gives none here. */
export const seatFindings = (seats, seatRoot = null) => seats.filter((s) => typeof s.text === 'string' && (!seatRoot || String(s.path).startsWith(seatRoot)) && sha(s.text).slice(0, 12) === s.sha)
  .flatMap((s) => s.text.split('\n').map((ln) => SEAT_LINE.exec(ln)).filter(Boolean).map((m) => ({ id: `${m[1]}#${m[2]}`, line: m[0].trim() })));
const FORM_WORDS = { close: ['fixed', 'task', 'ruling', 'wontfix', 'pile'], plan: ['folded', 'task', 'ruling', 'wontfix', 'pile'] };
const unq = (s) => { const t = String(s).trim(); const m = /^"(.*)"$/s.exec(t) ?? /^'(.*)'$/s.exec(t) ?? /^`(.*)`$/s.exec(t); return squash(m ? m[1] : t); };
const FAIL = Symbol('fact failed');

/**
 * MODE TABLE (PLAN-399-v3 4.1; task-375 reuses it for mode 'plan'). Pure of git: every git fact is a callback in `facts`.
 *  mode close: forms fixed, task, ruling, wontfix, pile. CRITICAL, HIGH, MED close by fixed or ruling (task only when the lens line begins DEFER); LOW and NIT by any form (operator 2026-11-20 ":1580").
 *  mode plan: folded takes the place of fixed (fixed is refused); the rest as close. A CONFLICT id takes ruling, or fixed (close) / folded (plan), only.
 * @param {{verdicts:Map<string,{word:string,file:string,line:number,quote:string,reason:string}>, triageText:string, lensKinds:Map<string,{kind:string,sev:string|null,line?:string}>,
 *   facts:{resolveSha:(s:string)=>string|null, isAncestor:(f:string)=>boolean, inRange:(f:string)=>boolean, touches:(f:string,p:string)=>boolean, reverts:(f:string)=>boolean,
 *          taskOf:(n:string)=>({exists:boolean,status:string,text:string}|null), decisionExists:(ref:string)=>boolean, taskText?:()=>string},
 *   mode?:'close'|'plan', seats?:{name:string,path:string,sha:string,text:string|null}[], seatRoot?:string|null,
 *   summary?:{text:string, headText:string, grounderPath:string, triagePath:string}|null}} a
 * @returns {{errors:string[], ids:number}} refusal lines (one per failing id) and the number of CONFIRMED or CONFLICT ids checked
 */
export function outcomeErrors({ verdicts, triageText, lensKinds, facts, mode = 'close', seats = [], seatRoot = null, summary = null, selfTask = null }) {
  const errors = [];
  const kinds = new Map(lensKinds ?? []);
  // seats (Integration, Reality-Check, Ground-truth): one report each, one finding per line; its findings are BUG kind and need a verdict and an outcome like any lens finding
  for (const s of seats) {
    if (seatRoot && !String(s.path).startsWith(seatRoot)) { errors.push(`Seat ${s.name}: ${s.path} is outside ${seatRoot} (the seat file is read from the tree of the ${mode} mode)`); continue; }
    if (s.text === null || s.text === undefined) { errors.push(`Seat ${s.name}: ${s.path} is not in the repo (the file the Seat line names must be committed)`); continue; }
    if (sha(s.text).slice(0, 12) !== s.sha) { errors.push(`Seat ${s.name}: ${s.path} has sha256:${sha(s.text).slice(0, 12)}, the Seat line says sha256:${s.sha} (the seat file was edited after the grounder ruled)`); continue; }
    const found = s.text.split('\n').map((ln) => SEAT_LINE.exec(ln)).filter(Boolean);
    if (found.length === 0) { errors.push(`Seat ${s.name}: ${s.path} holds no finding line (form: "### <seat id>#<n> CRITICAL|HIGH|MED|LOW|NIT: ..."); a seat file with no finding line is not a seat report`); continue; }
    for (const m of found) {
      const id = `${m[1]}#${m[2]}`;
      kinds.set(id, { kind: 'BUG', sev: normSev(m[3]), line: m[0].trim() });
      if (!verdicts.has(id)) errors.push(`${id} ${m[3]}: seat finding of ${s.name} has no verdict line in GROUNDER.md (form: <id> CONFIRMED|REJECTED|CONFLICT <path>:<line> "<quote>" [reason]) [Spec 08 section 5.3, 08_agents.md:225]`);
    }
  }
  // the outcome file: ONLY THE LAST LINE of an id is judged; a line for an id the grounder file does not hold is ignored
  const last = new Map();
  for (const raw of String(triageText ?? '').split('\n')) {
    const m = /^\s*(?:[-*]\s+)?([A-Za-z0-9._-]+#\d+)\s+(\S.*?)\s*$/.exec(raw.replace(/[`*]/g, ''));
    if (m && verdicts.has(m[1])) last.set(m[1], m[2]);
  }
  const rows = [];
  const ids = [...verdicts].filter(([, v]) => v.word === 'CONFIRMED' || v.word === 'CONFLICT');
  const call = (errs, what, fn) => { try { const r = fn(); if (r === undefined) { errs.push(`the fact callback for ${what} returned nothing, so it cannot be proved`); return FAIL; } return r; } catch (e) { errs.push(`the fact callback for ${what} failed: ${String(e?.message ?? e).split('\n')[0]}`); return FAIL; } };
  for (const [id, v] of ids) {
    const k = kinds.get(id) ?? { kind: 'BUG', sev: null };
    const sev = reasonSev(v.reason) ?? normSev(k.sev) ?? 'CRITICAL';
    const low = sev === 'LOW' || sev === 'NIT';
    const conflict = v.word === 'CONFLICT';
    const fixWord = mode === 'plan' ? 'folded' : 'fixed';
    const allowed = conflict ? ['ruling', fixWord] : low ? FORM_WORDS[mode] : k.kind === 'DEFER' ? [fixWord, 'task', 'ruling'] : [fixWord, 'ruling'];
    const pass = allowed.map((w) => ({ fixed: `fixed:<sha> <path the commit touches>`, folded: `folded:"<20+ characters present in the task text>"`, task: 'task:task-N (its text names this id)', ruling: 'ruling:RR-NNNN or ruling:decision-N', wontfix: 'wontfix:"<reason, 30+ characters>"', pile: 'pile:"<reason, 30+ characters>"' })[w]).join(' | ');
    const rule = conflict ? 'Spec 08 section 5.3 (08_agents.md:225): a conflict waits for the operator ruling' : k.kind === 'DEFER' && !low ? 'Spec 08 section 7 rule 6 (08_agents.md:360): DEFER goes to review_followups.md with reasons' : low ? 'Spec 08 section 7 rule 3 (08_agents.md:346) and the operator ruling :1580 (low priorities filed for later)' : 'Spec 08 section 7 rule 6 (08_agents.md:350): BUG goes to WF3 before Green Light, rule 3 (:346) fold survivors';
    const refuse = (why) => errors.push(`${id} ${sev}: ${why} [${rule}; verdict ${v.file}:${v.line}; form that passes: ${id} ${pass}]`);
    const text = last.get(id);
    if (text === undefined) { refuse(`no outcome line in TRIAGE.md`); continue; }
    const fm = /^(fixed|folded|task|ruling|wontfix|pile)\s*:\s*(.*)$/s.exec(text);
    if (!fm) { refuse(`the last TRIAGE.md line "${text.slice(0, 60)}" fits no form`); continue; }
    const [, word, rawArg] = fm;
    const arg = rawArg.trim();
    if (!allowed.includes(word)) {
      refuse(word === 'fixed' && mode === 'plan' ? 'fixed is refused in plan mode (the fix is made before a lane branch exists; use folded)' : word === 'folded' && mode !== 'plan' ? 'folded is a plan-mode form (a lane close uses fixed)' : conflict ? `a CONFLICT takes ${allowed.join(' or ')} only, not ${word}` : `${word} is not allowed for a ${sev} ${k.kind} finding${(word === 'wontfix' || word === 'pile') ? ' (wontfix and pile are for LOW and NIT only)' : word === 'task' ? ' (task is for a DEFER finding; a BUG is fixed before Green Light)' : ''}`);
      continue;
    }
    const errs = [];
    let ref = '';
    if (word === 'fixed') {
      const am = /^([0-9a-fA-F]{7,40})\s+(\S.*)$/.exec(arg);
      if (!am) errs.push('fixed needs a sha (7+ hex) and the path the commit touches: fixed:<sha> <path>');
      else {
        const p = am[2].trim().replace(/^["'`]|["'`]$/g, '');
        ref = am[1].slice(0, 7);
        const full = call(errs, `sha ${am[1]}`, () => facts.resolveSha(am[1]));
        if (full === null) errs.push(`${am[1]} is not a commit of this repo`);
        else if (full !== FAIL) {
          const anc = call(errs, 'the ancestor test', () => facts.isAncestor(full));
          if (anc === false) errs.push(`${am[1]} is not an ancestor of HEAD (a rebase or amend rewrote it: record the fixed line again with the new sha)`);
          else if (anc !== FAIL) {
            const inr = call(errs, 'the launch range', () => facts.inRange(full));
            if (inr === false) errs.push(`${am[1]} is not in the range from the task's launch commit to HEAD (it is older than the launch, or on another branch)`);
            else if (inr !== FAIL) {
              const tch = call(errs, 'the touched paths', () => facts.touches(full, p));
              if (tch === false) errs.push(`${am[1]} does not touch ${p}`);
              else if (tch !== FAIL) { const rv = call(errs, 'the revert search', () => facts.reverts(full)); if (rv === true) errs.push(`${am[1]} is reverted by a later commit of the range ("This reverts commit ${full}")`); }
            }
          }
        }
      }
    } else if (word === 'folded') {
      const q = unq(arg);
      ref = q.slice(0, 20);
      if (q.length < 20) errs.push('folded needs a quote of 20+ characters present in the task text');
      else { const t = call(errs, 'the task text', () => facts.taskText()); if (t !== FAIL && !squash(t).includes(q)) errs.push(`the quote "${q.slice(0, 40)}" is not in the task text`); }
    } else if (word === 'task') {
      const tm = /^(task-\d+)\b/i.exec(arg);
      if (!tm) errs.push('task needs a task id: task:task-N');
      else {
        ref = tm[1].toLowerCase();
        if (selfTask && ref === String(selfTask).toLowerCase()) { errs.push(`${ref} is the closing task itself: a deferral needs another card that names ${id}`); }
        else {
        const ti = call(errs, `task ${ref}`, () => facts.taskOf(ref));
        if (ti === null || (ti !== FAIL && !ti.exists)) errs.push(`${ref} has no task file`);
        else if (ti !== FAIL) {
          if (String(ti.status).toUpperCase() === 'DROPPED') errs.push(`${ref} is DROPPED`);
          else if (!new RegExp(`(?<![A-Za-z0-9_-])${esc(id)}(?!\\d)`).test(ti.text)) errs.push(`the text of ${ref} does not name the finding id ${id} as a whole token (a card that only holds the cited path does not defer the finding)`);
        }
        }
      }
    } else if (word === 'ruling') {
      const rm = /^(RR-\d{4}|decision-\d+)\b/i.exec(arg);
      if (!rm) errs.push('ruling needs RR-NNNN or decision-N');
      else {
        ref = rm[1].replace(/^rr-/i, 'RR-').replace(/^decision-/i, 'decision-');
        const ex = call(errs, `decision ${ref}`, () => facts.decisionExists(ref));
        if (ex === false) errs.push(`${ref} has no decision record (record the operator's answer as a decision first)`);
      }
    } else {
      const reason = unq(arg);
      if (reason.length < 30) errs.push(`the ${word} reason is ${reason.length} characters; 30+ are needed after whitespace is squashed`);
    }
    if (errs.length) { refuse(errs.join('; ')); continue; }
    rows.push({ id, sev, word, ref });
  }
  // visible on the task (step 6): the Final Summary holds the round line and one line per CRITICAL, HIGH or MED finding; checked only when every id has a good outcome
  if (summary && errors.length === 0 && ids.length > 0) {
    const count = (w) => rows.filter((r) => r.word === w).length;
    const fixWord = mode === 'plan' ? 'folded' : 'fixed';
    const head = /<!-- SECTION:FINAL_SUMMARY:BEGIN -->([\s\S]*?)<!-- SECTION:FINAL_SUMMARY:END -->/.exec(summary.headText ?? '')?.[1] ?? '';
    const n = 1 + (head.match(/^\s*Review round \d+:/gm) ?? []).length;
    const round = `Review round ${n}: ${count(fixWord)} ${fixWord}, ${count('task')} task, ${count('ruling')} ruling, ${count('wontfix')} wontfix, ${count('pile')} pile; grounder ${summary.grounderPath}; triage ${summary.triagePath}`;
    const lines = rows.filter((r) => r.sev === 'CRITICAL' || r.sev === 'HIGH' || r.sev === 'MED').map((r) => `${r.id} ${r.sev} ${r.word} ${r.ref}`);
    // the block is looked for in the Final Summary section only: a block placed in Notes does not make the outcomes visible on the page
    const have = /<!-- SECTION:FINAL_SUMMARY:BEGIN -->([\s\S]*?)<!-- SECTION:FINAL_SUMMARY:END -->/.exec(String(summary.text ?? ''))?.[1] ?? '';
    const miss = [round, ...lines].filter((l) => !have.includes(l));
    if (miss.length) errors.push(`the task's Final Summary lacks ${miss.length} of ${lines.length + 1} required line(s) (the outcomes are shown on the task page, Spec 08 section 7 rule 3): ${miss.slice(0, 3).map((l) => `"${l.slice(0, 70)}"`).join(', ')}${miss.length > 3 ? ', ...' : ''}; the block is:\n${[round, ...lines].join('\n')}\n(one command: backlog task edit task-N --final-summary "<what landed>" --append-final-summary "<block>" -s BUILT)`);
  }
  return { errors, ids: ids.length };
}

/** The git facts the outcome check needs, as callbacks (so outcomeErrors stays pure). `L` is the task's launch commit (null: the range facts throw). */
export function gitFacts(L) {
  let range = null; let revText = null;
  const need = () => { if (!L) throw new Error('the task launch commit is unknown, so the range L..HEAD cannot be computed'); };
  const files = (dir) => git(['ls-files', '--cached', '--', dir]).stdout.split('\n').filter(Boolean);
  return {
    resolveSha: (s) => { if (!/^[0-9a-f]{7,40}$/i.test(s)) return null; const r = git(['rev-parse', '--verify', '--quiet', `${s}^{commit}`]); return r.status === 0 ? r.stdout.trim() : null; },
    isAncestor: (f) => { const r = git(['merge-base', '--is-ancestor', f, 'HEAD']); if (r.status > 1) throw new Error(`git merge-base failed (status ${r.status})`); return r.status === 0; },
    inRange: (f) => { need(); if (!range) { const r = git(['rev-list', `${L}..HEAD`]); if (r.status !== 0) throw new Error('git rev-list failed'); range = new Set(r.stdout.split('\n').filter(Boolean)); } return range.has(f); },
    touches: (f, p) => { const r = git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', '--no-renames', f]); if (r.status !== 0) throw new Error(`git diff-tree failed for ${f.slice(0, 9)}`); return r.stdout.split('\n').includes(p); },
    reverts: (f) => { need(); if (revText === null) { const r = git(['log', `${L}..HEAD`, '--format=%B']); if (r.status !== 0) throw new Error('git log failed'); revText = r.stdout; } return revText.includes(`This reverts commit ${f}`); },
    taskOf: (tid) => {
      const n = /\d+/.exec(tid)?.[0];
      const f = files('backlog/tasks').find((p) => new RegExp(`^backlog/tasks/task-0*${n}( -.*)?\\.md$`, 'i').test(p));
      if (!f) return { exists: false, status: '', text: '' };
      const x = git(['show', `:${f}`]);
      if (x.status !== 0) throw new Error(`cannot read ${f}`);
      return { exists: true, status: String(parseFM(x.stdout).fm.status ?? ''), text: x.stdout };
    },
    decisionExists: (ref) => {
      const fs_ = files('backlog/decisions');
      if (/^decision-\d+$/i.test(ref)) return fs_.some((p) => path.basename(p).toLowerCase().startsWith(`${ref.toLowerCase()} -`));
      return fs_.some((p) => path.basename(p).includes(ref) || new RegExp(`^title:.*${esc(ref)}`, 'm').test(git(['show', `:${p}`]).stdout.split('\n').slice(0, 12).join('\n')));
    },
  };
}

/**
 * Every refusal for one closing task, as lines. Pure of git: the caller supplies what it read.
 * @param {{id:string, taskText:string, fm:object, assignees:string[], headAssignees:string[], type:string, table:object, root:string, letter?:string,
 *          laneFiles:{dir:string,name:string,text:string}[], changed:string[], expectedPaths?:string[], diffOf?:(paths:string[])=>string|null, readRepo:(p:string)=>string|null}} i
 */
/**
 * task-375 A4: the context values a lens run may have used. `contexts` [{name, text}] are the committed context files of the task (docs/reports/reviews/<task>/context-rN.md); each one's value is the text of
 * its CONTEXT_SECTIONS (the sections the review tool is passed with --section), so the prompt_sha256 recompute binds it. A context that is the placeholder, lacks a required heading (the Description,
 * and Implementation Notes when the task has notes) is a problem line, never a value. An output must match one value (one file per review round).
 */
export function lensContexts(contexts, hasNotes = true) {
  const values = [];
  const problems = [];
  for (const c of contexts) {
    if (c.text.trim() === PLACEHOLDER_CONTEXT) { problems.push(`${c.name}: the review context is the placeholder "${PLACEHOLDER_CONTEXT}": the lenses must run with the committed context file (--context and one --section per ${CONTEXT_SECTIONS.join(', ')})`); continue; }
    const want = !hasNotes && !/^#{1,6}\s.*Implementation Notes/m.test(c.text) ? CONTEXT_SECTIONS.filter((x) => x !== 'Implementation Notes') : CONTEXT_SECTIONS;
    try { values.push(extractSections(c.text, want)); } catch (e) { problems.push(`${c.name}: ${e.message} (the context must hold the headings ${want.join(', ')})`); }
  }
  return { values, problems };
}

/**
 * task-375 D5 (extracted from closeErrors, behaviour preserving): the separate grounder file `g` (named `label` in the messages) against the lens outputs `lensFiles` and their `findings`:
 * Grounder differs from the Lane header, the lane being worked or launched and every other assignee; one Ruled line per output, recomputed; one verdict per finding with a quote on its cited line.
 * Returns { errors, verdicts } (verdicts: parseVerdicts of g).
 */
function grounderErrors({ g, label = 'GROUNDER.md', lensFiles, findings, laneName, assignees, id, readRepo }) {
  const errors = [];
  const head = g.split('\n').slice(0, 25).join('\n');
  const gr = /^\s*Grounder:\s*(.+?)\s*$/m.exec(head)?.[1];
  const lh = /^\s*Lane:\s*(.+?)\s*$/m.exec(head)?.[1];
  if (!gr) errors.push(`${label} has no "Grounder: <name>" header line`);
  if (!lh) errors.push(`${label} has no "Lane: <name>" header line`);
  if (gr && lh && clash(gr, lh)) errors.push(`${label}: Grounder "${gr}" is the same as Lane "${lh}" (or contains or is contained in it); a separate agent must ground`);
  if (gr && clash(gr, laneName)) errors.push(`${label}: Grounder "${gr}" is the lane (${laneName}) or a name that contains or is contained in it; a separate agent must ground`);
  if (gr) for (const a of assignees.filter((x) => nameKey(x) !== nameKey(laneName))) if (clash(gr, a)) errors.push(`${label}: Grounder "${gr}" is, contains or is contained in an assignee of ${id} (${a}); a separate agent must ground`);
  const ruled = new Map();
  for (const ln of g.split('\n')) { const m = /^\s*Ruled:\s*(\S+)\s+sha256:([0-9a-f]{12})\s+findings:(\d+)\s*$/.exec(ln); if (m) ruled.set(m[1], { sha: m[2], n: Number(m[3]) }); }
  for (const f of lensFiles) {
    const want = ruledLine(f.name, f.text);
    const have = ruled.get(f.name);
    if (!have) errors.push(`${label}: no "Ruled:" line for ${f.name} (expected: ${want})`);
    else if (`Ruled: ${f.name} sha256:${have.sha} findings:${have.n}` !== want) errors.push(`${label}: the "Ruled:" line for ${f.name} does not match the committed output (the grounder ruled on sha256:${have.sha} findings:${have.n}, the file is now ${want.replace(`Ruled: ${f.name} `, '')}: the output was edited after grounding, or the count is wrong)`);
  }
  const verdicts = parseVerdicts(g);
  const seenQuote = new Map();
  for (const f of findings) {
    const v = verdicts.get(f.id);
    const form = 'form: <id> CONFIRMED|REJECTED|CONFLICT <path>:<line> "<quote>" [reason]';
    if (!v) { errors.push(`${label}: finding ${f.id} has no complete verdict line (${form}): ${f.line.slice(0, 90)}`); continue; }
    const q = squash(v.quote);
    if (q.length < 20) { errors.push(`${label}: finding ${f.id}: the quote must be 20+ characters taken from ${v.file}:${v.line} (a double quote inside the quote ends it; quote a part without one)`); continue; }
    if (seenQuote.has(q)) errors.push(`${label}: finding ${f.id} has the same quote as ${seenQuote.get(q)}; each finding needs its own quote from the line it concerns`);
    else seenQuote.set(q, f.id);
    if (v.word !== 'CONFIRMED' && v.reason.length < 30) errors.push(`${label}: finding ${f.id} is ${v.word} with a reason under 30 characters (Spec 08 5.3: rejections carry reasons; a conflict says what the operator must rule)`);
    if (path.isAbsolute(v.file) || v.file.split('/').includes('..')) { errors.push(`${label}: finding ${f.id}: ${v.file} must be a repo-relative path`); continue; }
    if (v.file.startsWith('docs/reports/lanes/')) { errors.push(`${label}: finding ${f.id}: ${v.file} is a lane report; cite the code or the spec the grounder opened, not a lens output`); continue; }
    const text = readRepo(v.file);
    if (text === null) { errors.push(`${label}: finding ${f.id}: ${v.file} is not in the repo (index or HEAD)`); continue; }
    const lines = text.split('\n');
    if (v.line < 1 || v.line > lines.length) { errors.push(`${label}: finding ${f.id}: ${v.file} has no line ${v.line} (${lines.length} lines)`); continue; }
    const cited = squash(lines[v.line - 1]);
    if (!cited.includes(q)) errors.push(`${label}: finding ${f.id}: the quote is not on ${v.file}:${v.line}`);
    else if (lines.filter((x) => squash(x) === cited).length > 3) errors.push(`${label}: finding ${f.id}: the cited line occurs more than 3 times in ${v.file} (a boilerplate line proves nothing): cite a line specific to the finding`);
  }
  return { errors, verdicts };
}

/**
 * task-375 D5 (extracted from closeErrors, behaviour preserving): the proof of ONE rule list's compliance lens output(s) in `files` for the given phases: REVIEW header and prompt hash, committed input, stamp,
 * whole-list recompute, chunk coverage (out phase). Returns the refusal line, or null when valid. `materialOk(p)` (plan gate): an extra problem text for a parsed input, or null.
 */
function listProof({ id, l, seat = 'compliance', phases, files, textOf, table, root, readBase, ctxValues, expected, diffOf, optionalPaths, dirNote, layout, materialOk }) {
  const why = [];
  let ok = false;
  for (const ph of phases) {
    const base = `${ph}-${seat}-${l.id}`;
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
      bad.push(...reviewErrors(n, textOf(n) ?? '', `lens-${seat}.md`, input, { templateText: readBase(`.claude/review-templates/lens-${seat}.md`), contexts: ctxValues }));
      const p = parseLensInput(input);
      if (!p) bad.push(`in-${n}: first line is not "LIST <id> sha256:<hex> material sha256:<hex> part i of n" (rule-lists.mjs lens-input writes it)`);
      else if (p.id !== l.id) bad.push(`in-${n}: stamped for list ${p.id}, expected ${l.id}`);
      else if (!p.ok) bad.push(`in-${n}: the stamped sha256 does not match the list text or the material in the file (the input was edited)`);
      else if (renderLensInput({ id: p.id, list: table.lists[p.id], part: p.listPart, i: p.part, n: p.parts, material: p.material, paths: p.chunk === undefined ? null : p.paths, c: p.chunk, m: p.chunks }) !== input) bad.push(`in-${n}: not what lens-input writes for its own stamp (the head line, the paths or the text around the list part or the material was edited)`);
      else if (materialOk && materialOk(p)) bad.push(`in-${n}: ${materialOk(p)}`);
      else listParts.push(p);
    }
    if (!bad.length) {
      let whole;
      try { whole = listBlocks(table.lists[l.id], root, l.id).map((b) => b.text).join(''); } catch (e) { bad.push(`list ${l.id}: ${String(e.message).split('\n')[0]}`); }
      // V2.WHOLE: every chunk holds the whole list (its parts 1..n together); the coverage of the change is proved per list
      const chunks = new Map();
      for (const p of listParts) { const c = p.chunk ?? 1; chunks.set(c, [...(chunks.get(c) ?? []), p]); }
      for (const [c, ps] of chunks) if (whole !== undefined && ps.sort((a, b) => a.part - b.part).map((p) => p.listPart).join('').replace(/\s+/g, '') !== whole.replace(/\s+/g, '')) bad.push(`the committed inputs${chunks.size > 1 ? ` of chunk ${c}` : ''} do not carry the whole list ${l.id} (${l.file}) as it is now: the list was shortened, softened or is out of date`);
      if (ph === 'out' && expected.length) bad.push(...chunkErrors({ label: `${base}`, items: names.map((n, x) => ({ name: `in-${n}`, k: kOf(n), p: listParts[x] })), expected, diffOf: diffOf, optional: optionalPaths }));
    }
    if (bad.length) { why.push(bad.join('; ')); continue; }
    ok = true;
  }
  return ok ? null : `${id}: list ${l.id} (${l.file}) has no valid ${seat} lens output in ${dirNote}: write ${phases.join(' or ')}-${seat}-${l.id}.txt${why.length ? ` (${why.join('; ')})` : ''}; ${layout}`;
}

/**
 * task-423 (PROTOCOL.SIMPLE, adjustment 1): the compliance proof of a stage in either form. The JOINED form is out-compliance-rules[-pN].txt (the resolved lists joined whole by joinLists, proved by listProof as one
 * list named rules); the PER-LIST form is out-compliance-<list id>[-pN].txt for every list (kept for a task launched before the join). The form is decided per phase from the files in the folder: a phase holding both
 * is refused, a phase holding neither is refused naming the joined file first (the per-list refusals follow). `proof(l, phases, table)` is one listProof call; `lists` the resolved lists; returns the refusal lines.
 * task-438: `seat` (compliance or engineering) names the files; `lists` are that seat's lists only, so the joined form of a seat joins its own lists.
 */
function complianceSetErrors({ id, seat = 'compliance', lists, phases, files, table, dirNote, proof }) {
  const named = (ph, re) => files.some((f) => re.test(f.name) && f.name.startsWith(`${ph}-${seat}-`));
  const isJoined = new RegExp(`^(plan|out)-${seat}-${JOINED_ID}(-r\\d+)?(-p\\d+)?\\.txt$`); // a round file (-rN, -rN-pN) of the joined set is joined too (task-423 D1)
  const isAny = new RegExp(`^(plan|out)-${seat}-.+\\.txt$`);
  const errors = [];
  const joinedPh = []; const perPh = [];
  for (const ph of phases) {
    const j = named(ph, isJoined);
    const p = files.some((f) => isAny.test(f.name) && f.name.startsWith(`${ph}-${seat}-`) && !isJoined.test(f.name));
    if (j && p) errors.push(`${id}: ${dirNote} holds both the joined (${ph}-${seat}-${JOINED_ID}*.txt) and the per-list (${ph}-${seat}-<list id>*.txt) ${seat} outputs of the ${ph} stage: keep one form per stage`);
    else if (j) joinedPh.push(ph);
    else if (p) perPh.push(ph);
  }
  const none = joinedPh.length === 0 && perPh.length === 0 && errors.length === 0;
  if (none) {
    errors.push(`${id}: no joined ${seat} lens output in ${dirNote}: write ${phases.map((p) => `${p}-${seat}-${JOINED_ID}.txt`).join(' or ')} (rule-lists.mjs lens-input --list ${JOINED_ID} --lists ${lists.map((l) => l.id).join(',')}), or one per list as below`);
    perPh.push(...phases);
  }
  if (joinedPh.length) {
    let t;
    try { t = joinLists(table, lists.map((l) => l.id)); } catch (e) { return [...errors, `${id}: ${String(e.message).split('\n')[0]}`]; }
    const e = proof({ id: JOINED_ID, file: t.lists[JOINED_ID].file }, joinedPh, t);
    if (e) errors.push(e);
  }
  if (perPh.length) for (const l of lists) { const e = proof(l, perPh, table); if (e) errors.push(e); }
  return errors;
}
/** task-423 (adjustment 3): true when the plan evidence is on the board: GROUNDER-PLAN.md at the launch commit is non-empty and holds a "Plan: <task id> sha256:<12 hex>" line (the launch gate put it there; the hash is not compared at close). */
export const planOnBoard = (text, id) => typeof text === 'string' && text.trim() !== '' && [...text.matchAll(/^\s*Plan:\s*(\S+)\s+sha256:[0-9a-f]{12}\s*$/gm)].some((m) => m[1].toLowerCase() === String(id).toLowerCase());

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
  const hasNotes = /<!-- SECTION:NOTES:BEGIN -->/.test(i.taskText);
  const lc = lensContexts(i.contexts ?? [], hasNotes);
  if ((i.contexts ?? []).length === 0) errors.push(`${id}: no committed review context file docs/reports/reviews/${id}/context-rN.md (written by backlog-brief.mjs, one per review round, committed with the round): the prompt hash of every lens output is recomputed with it`);
  for (const x of lc.problems) errors.push(`${id}: ${x}`);
  const expected = i.expectedPaths ?? []; // V2.WHOLE: the changed paths of the task range minus the exempt ones (check() computes them)
  // F1: the proof is never skipped silently: a build or fix task whose range holds no file outside the exempt paths (the lane was folded into the base already, or the base is wrong) is refused
  if (build && i.rangeEmpty) errors.push(`${id}: no file the task's Files line covers changed between the task's launch commit and HEAD, so the review cannot be proved to cover any change (the launch commit is the board commit that took the task for its lane assignee)`);
  // V2.LIST (task-406): the every_task lists (the plan protocol) and the milestone lists are required of every task like any list; verifyResolved is the one reading shared with validate, check-tasks and the launch.
  // A table with no every_task is refused (fails closed: nobody switches the lists off by leaving the key out); a missing milestone_docs key or entry counts as missing lists; a build task with no milestone is refused by resolveTask above.
  const missing = verifyResolved(i.table, r, i.letter, type);
  if (!Array.isArray(i.table.every_task) || i.table.every_task.length === 0) return [`${id}: the rule-list table has no every_task lists: the plan protocol must be attached to every task (scripts/analysis/rule-lists.json)`];
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
  const layout = `put every plan-<lens>[-<list id>][-pN].txt, out-<lens>[-<list id>][-pN].txt, in-<same name> and TASK directly in ${dirNote}: a file in a subfolder (lens-plan/, lens-out/, stage2/) or named fix-*.txt is never read; a fix round (r2) re-makes every file under the same names, and an out-<lens>[-<list id>]-rN.txt file is read for findings like any out- file but never stands in for a round-1 name`;
  const mine = [...dirs.entries()].filter(([, fs_]) => fs_.some((f) => f.name === 'TASK' && f.text.trim().toLowerCase() === id));
  if (mine.length === 0) return [...errors, `${id}: no ${dirNote} holds a TASK file naming exactly ${id} (a lane report dir is scoped to one task: write the task id in TASK; a dir used for another task does not count); ${layout}`];
  const files = mine.flatMap(([, fs_]) => fs_);
  const textOf = (n) => files.find((f) => f.name === n)?.text;
  // task-375 B2: the task's references hold the repo copies of REPORT.md, GROUNDER.md and, when the lane directory holds one, TRIAGE.md (08_agents.md:357 note); the exact command is printed
  if (build) {
    const have = new Set(asList(i.fm?.references).map((x) => String(x).trim()));
    for (const n of ['REPORT.md', 'GROUNDER.md', ...(textOf('TRIAGE.md') !== undefined ? ['TRIAGE.md'] : [])]) {
      const rp = `${mine[0][0]}/${n}`;
      if (!have.has(rp)) errors.push(`${id}: the task's references lack the repo copy ${rp}: backlog task edit ${id} --add-ref ${rp}`);
    }
  }

  // (a) one compliance lens output per list, with its REVIEW header, bound to the committed input and to the whole list
  // task-438 (F10): the seat split applies when the range base holds lens-engineering.md; without it every list is compliance, the old contract (a lane launched before the landing)
  const phases = build ? ['out'] : ['plan', 'out'];
  const split = readBase('.claude/review-templates/lens-engineering.md') !== null;
  for (const seat of ['compliance', 'engineering']) {
    // task-453 (RR-0440, RR-0450, RR-0452): a build or fix task's output review leaves out the table's output_off lists (outputLists); any other task is asked for every list at either stage
    const ls = (build ? outputLists(i.table, r.lists) : r.lists).filter((l) => (split ? seatOf(l) : 'compliance') === seat);
    if (ls.length) errors.push(...complianceSetErrors({ id, seat, lists: ls, phases, files, table: i.table, dirNote, proof: (l, phs, tbl) => listProof({ id, l, seat, phases: phs, files, textOf, table: tbl, root: i.root, readBase, ctxValues: lc.values, expected, diffOf: i.diffOf, optionalPaths: i.optionalPaths, dirNote, layout }) }));
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
          errors.push(...reviewErrors(nm, textOf(nm) ?? '', `lens-${lens}.md`, input, { templateText: readBase(`.claude/review-templates/lens-${lens}.md`), contexts: lc.values }).map((y) => `${id}: ${y}`));
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
        else errors.push(...reviewErrors(n, t, `lens-${lens}.md`, whole, { what: 'the recomputed diff of the whole task range (the diff file the lens must have read, made with the command in the brief)', templateText: readBase(`.claude/review-templates/lens-${lens}.md`), contexts: lc.values }).map((x) => `${id}: ${x}`));
      }
    }
    // task-423 (adjustment 3): plan findings are ruled once, at the plan: with the plan evidence on the board no plan-stage output is required in the lane folder
    if (!i.planOnBoard && !files.some((f) => /^plan-.+\.txt$/.test(f.name))) errors.push(`${id}: no plan-stage lens output (plan-<lens>.txt) in ${dirNote}: the plan is reviewed before the build (Spec 08 section 7); ${layout}`);
  }

  // finding lines: a loose reading must count the same as the strict one
  // task-423 (adjustment 3): with the plan evidence on the board a plan-*.txt in the lane folder is ignored (its findings were ruled at the plan)
  const lensFiles = files.filter((f) => isLensOutput(f.name) && !(i.planOnBoard && f.name.startsWith('plan-'))).sort((a, b) => a.name.localeCompare(b.name));
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
  const closeSeats = seatLines(g, readRepo);
  const ge = grounderErrors({ g, label: 'GROUNDER.md', lensFiles, findings: [...findings, ...seatFindings(closeSeats, `${mine[0][0]}/`)], laneName, assignees: i.assignees, id, readRepo });
  errors.push(...ge.errors);
  const verdicts = ge.verdicts;
  // task-399: every CONFIRMED or CONFLICT id carries one outcome (TRIAGE.md, last line wins), and the outcomes are shown on the task
  if (build) {
    const dirPath = mine[0][0];
    errors.push(...outcomeErrors({ verdicts, triageText: textOf('TRIAGE.md') ?? '', lensKinds: new Map(findings.map((f) => [f.id, lensKindOf(f.line)])), facts: i.facts, mode: 'close', seats: closeSeats, seatRoot: `${dirPath}/`, selfTask: id, summary: { text: i.taskText, headText: i.headTaskText ?? '', grounderPath: `${dirPath}/GROUNDER.md`, triagePath: `${dirPath}/TRIAGE.md` } }).errors);
  }
  return errors;
}

/**
 * task-375 D2: the tool-having seats a build or fix launch requires in GROUNDER-PLAN.md (his :1615, :1620, :1625, :1630): one constant. integration and reality-check on every launch (reality-check:
 * "if it can't tell if a figure is changed than it just runs anyways for now"); regression when the Files line names at least one path tracked at the board head (a directory or glob entry counts:
 * READBACK-375-v4.md Q1; build and fix both carry the seats: Q2). Emptying a name is the later decision of his :1625. The check proves presence, sha256 and that every finding was ruled and closed;
 * it cannot prove that the seat ran, ran independently or was a Sonnet agent.
 */
export const PLAN_SEATS = { always: ['integration', 'reality-check'], conditional: ['regression'] };

/** D3: the Plan hash of a task: the first 12 hex of the sha256 of the title plus the whole body after the front matter, whitespace squashed (front matter, which holds status, assignee and references, is outside it). */
export function planHash(taskText) {
  const { fm, body } = parseFM(taskText);
  return sha(squash(`${fm.title ?? ''} ${body}`)).slice(0, 12);
}

/**
 * task-375 D5: every refusal of the LAUNCH GATE for one build or fix task, as lines; pure of git (the caller reads the board head and passes it in). Other task types return no errors by design.
 * @param {{id:string, taskText:string, type:string, table:object, root:string, letter?:string, laneName:string, assignees:string[], folder:{name:string,text:string}[],
 *          readRepo:(p:string)=>string|null, tracked:(entry:string)=>boolean, facts:object}} i
 *   folder: the flat files of docs/reports/reviews/<id>/ at the board head; readRepo reads the board head; facts: taskOf and decisionExists of the board head (outcomeErrors callbacks).
 * @returns {{errors:string[], lists:number, findings:number, line:string}} line is the expected "Plan: <id> sha256:<12>" line
 */
export function planGateErrors(i) {
  // any read error is a refusal line, never a stack trace
  try { return planGateInner(i); } catch (e) { return { errors: [`${i.id}: the plan gate could not read the evidence: ${String(e?.message ?? e).split('\n')[0]}`], lists: 0, findings: 0, line: '' }; }
}
function planGateInner(i) {
  const { id, type } = i;
  const line = `Plan: ${id} sha256:${planHash(i.taskText)}`;
  if (type !== 'build' && type !== 'fix') return { errors: [], lists: 0, findings: 0, line };
  const dir = `docs/reports/reviews/${id}`;
  const errors = [];
  let r;
  try { r = resolveTask({ table: i.table, root: i.root, body: i.taskText, type, letter: i.letter }); } catch (e) { return { errors: [`${id}: cannot read the rule-list table or one of its path maps: ${String(e.message).split('\n')[0]}`], lists: 0, findings: 0, line }; }
  if (r.error) return { errors: [`${id}: ${r.error.replace(/^refused: /, '')}`], lists: 0, findings: 0, line };
  const files = i.folder ?? [];
  const textOf = (n) => files.find((f) => f.name === n)?.text;
  const dirNote = `${dir}/`;
  if (files.length === 0) errors.push(`${id}: no plan evidence folder ${dirNote} on the board (context-rN.md, the plan lens outputs with their in- inputs, GROUNDER-PLAN.md, the seat reports: the orchestrator writes and commits them before the launch)`);
  // the review contexts of the task, and what the plan inputs may have been made from
  const contexts = files.filter((f) => /^context-r\d+\.md$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  const hasNotes = /<!-- SECTION:NOTES:BEGIN -->/.test(i.taskText);
  const lc = lensContexts(contexts.map((f) => ({ name: `${dir}/${f.name}`, text: f.text })), hasNotes);
  if (contexts.length === 0 && files.length > 0) errors.push(`${id}: no committed review context file ${dirNote}context-rN.md: the plan outputs' prompt hash is recomputed with it`);
  for (const x of lc.problems) errors.push(`${id}: ${x}`);
  const planCut = (text) => { try { return extractSections(text, PLAN_SECTIONS); } catch { return null; } };
  if (type === 'build') {
    // one valid plan compliance output per resolved list, whose stamped material is the plan sections of the context whose text produced its prompt hash
    const cands = contexts.map((c) => ({ value: lensContexts([{ name: c.name, text: c.text }], hasNotes).values[0] ?? null, cut: planCut(c.text), name: `${dir}/${c.name}` })).filter((c) => c.value !== null);
    // task-423: joined (plan-compliance-rules*) or per-list plan evidence; each proof is tried against every committed context
    const planProof = (seat) => (l, phs, tbl) => {
      let last = null;
      for (const c of cands.length ? cands : [{ value: null, cut: null, name: '' }]) {
        const e = listProof({ id, l, seat, phases: phs, files, textOf, table: tbl, root: i.root, readBase: i.readRepo, ctxValues: c.value === null ? [] : [c.value], expected: [], diffOf: () => null, optionalPaths: [], dirNote,
          layout: `put plan-${seat}-rules[-pN].txt (or plan-${seat}-<list id>[-pN].txt per list) and its in-<same name> directly in ${dirNote} (written by rule-lists.mjs lens-input --list rules --lists <ids> (or --list <id>) --material-from <context-rN.md> --out <folder>/in-plan-${seat}-<name>${seat === 'compliance' ? '' : ` --template .claude/review-templates/lens-${seat}.md`})`,
          materialOk: (p) => (c.cut !== null && p.material === c.cut ? null : `the stamped material is not the Description, Acceptance criteria and Implementation Plan sections of the committed context ${c.name || '(none)'} (a plan review of some other text)`) });
        if (e === null) return null;
        last ??= e;
      }
      return last;
    };
    // task-438: always split at the launch gate (no range base); the compliance name is refused for an engineering list, with no alias
    for (const seat of ['compliance', 'engineering']) {
      const ls = r.lists.filter((l) => seatOf(l) === seat);
      if (ls.length) errors.push(...complianceSetErrors({ id, seat, lists: ls, phases: ['plan'], files, table: i.table, dirNote, proof: planProof(seat) }));
    }
  } else {
    // a fix launch: at least one plan lens output, each with a valid REVIEW header, template, timestamp and VERDICT line (reviewErrors; g375#1)
    const planFiles = files.filter((f) => /^plan-.+\.txt$/.test(f.name));
    if (planFiles.length === 0) errors.push(`${id}: a fix task needs at least one plan-<lens>.txt in ${dirNote} (Spec 08 rule 4 and 6.4: the lean plan roster)`);
    for (const f of planFiles) errors.push(...reviewErrors(f.name, f.text, /^plan-compliance-/.test(f.name) ? 'lens-compliance.md' : f.name === 'plan-plan-review-deepseek.txt' ? 'plan-review-deepseek.md' : `lens-${f.name.replace(/^plan-/, '').replace(/(-p\d+)?\.txt$/, '')}.md`, null).map((x) => `${id}: ${x}`));
  }
  const g = textOf('GROUNDER-PLAN.md');
  let findings = 0;
  if (g === undefined) errors.push(`${id}: GROUNDER-PLAN.md is missing in ${dirNote} (a separate grounder rules every plan finding and copies the Plan line last)`);
  else {
    const lensFiles = files.filter((f) => /^plan-.+\.txt$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    const found = findingsIn(lensFiles);
    const seats = seatLines(g, i.readRepo);
    const ge = grounderErrors({ g, label: 'GROUNDER-PLAN.md', lensFiles, findings: [...found, ...seatFindings(seats, dirNote)], laneName: i.laneName, assignees: i.assignees, id, readRepo: i.readRepo });
    errors.push(...ge.errors);
    const lh = /^\s*Lane:\s*(.+?)\s*$/m.exec(g.split('\n').slice(0, 25).join('\n'))?.[1];
    if (lh && nameKey(lh) !== nameKey(i.laneName)) errors.push(`GROUNDER-PLAN.md: Lane "${lh}" is not the lane being launched (${i.laneName})`);
    // the seats (read above, S1)
    const need = [...PLAN_SEATS.always, ...(entriesOf(i.taskText).some((e) => i.tracked(e)) ? PLAN_SEATS.conditional : [])];
    for (const n of need) if (!seats.some((x) => x.name.toLowerCase() === n)) errors.push(`GROUNDER-PLAN.md: no "Seat: ${n} <repo path inside ${dirNote}> sha256:<12 hex>" line (a ${n} seat report is required at every build or fix launch${n === 'regression' ? ': the Files line names a path that exists at the board head' : ''})`);
    // outcomes of every CONFIRMED or CONFLICT id (mode plan) and the round block on the task
    const planField = /<!-- SECTION:PLAN:BEGIN -->([\s\S]*?)<!-- SECTION:PLAN:END -->/.exec(i.taskText)?.[1] ?? '';
    const rounds = planField.split('\n').filter((l) => /^\s*Plan review round \d+:/.test(l));
    const wrap = (t) => `<!-- SECTION:FINAL_SUMMARY:BEGIN -->${t}<!-- SECTION:FINAL_SUMMARY:END -->`;
    const asRound = (t) => t.replace(/Plan review round/g, 'Review round');
    if (rounds.length === 0) errors.push(`${id}: the Implementation Plan field holds no "Plan review round N: <a> folded, <b> task, <c> ruling, <d> wontfix, <e> pile; grounder <path>; triage <path>" line (backlog task edit ${id} --append-plan ...)`);
    const oc = outcomeErrors({ verdicts: ge.verdicts, triageText: textOf('TRIAGE-PLAN.md') ?? '', lensKinds: new Map(found.map((f) => [f.id, lensKindOf(f.line)])), facts: { ...i.facts, taskText: () => i.taskText }, mode: 'plan', seats, seatRoot: dirNote, selfTask: id,
      summary: rounds.length ? { text: wrap(asRound(planField)), headText: wrap(asRound(rounds.slice(0, -1).join('\n'))), grounderPath: `${dir}/GROUNDER-PLAN.md`, triagePath: `${dir}/TRIAGE-PLAN.md` } : null });
    errors.push(...oc.errors.map((x) => x.replace(/Final Summary/g, 'Implementation Plan field')));
    findings = ge.verdicts.size;
    // the Plan line, last
    const pl = [...g.matchAll(/^\s*Plan:\s*(\S+)\s+sha256:([0-9a-f]{12})\s*$/gm)].pop();
    if (!pl) errors.push(`GROUNDER-PLAN.md: no last "Plan: <task id> sha256:<12 hex>" line; expected: ${line}`);
    else if (`Plan: ${pl[1]} sha256:${pl[2]}` !== line) errors.push(`GROUNDER-PLAN.md: the Plan line "Plan: ${pl[1]} sha256:${pl[2]}" is not the hash of the task as it is now (the title or body was edited after the grounder ruled, so the plan must be grounded again); expected: ${line}`);
    // references on the task: the repo paths of the grounder file, the triage file (when there is one) and every seat report
    const have = new Set(asList(parseFM(i.taskText).fm.references).map((x) => String(x).trim()));
    const refs = [`${dir}/GROUNDER-PLAN.md`, ...(textOf('TRIAGE-PLAN.md') !== undefined ? [`${dir}/TRIAGE-PLAN.md`] : []), ...seats.map((x) => x.path)];
    for (const rp of [...new Set(refs)]) if (!have.has(rp)) errors.push(`${id}: the task's references lack ${rp}: backlog task edit ${id} --add-ref ${rp}`);
  }
  // task-419: the grounder's fold check (docs/reports/reviews/<task>/FOLD-CHECK.md) is a committed record beside GROUNDER-PLAN.md; the gate reads its form, never its body
  const fc = textOf('FOLD-CHECK.md');
  const form = 'write "Checked by: <name>", "Verdict: PASS" and last "Plan: <task id> sha256:<12 hex>"';
  if (fc === undefined) errors.push(`FOLD-CHECK.md is missing in ${dirNote} (the separate grounder writes it beside GROUNDER-PLAN.md after checking the folded plan: ${form})`);
  else {
    const lastOf = (re) => [...fc.matchAll(re)].pop();
    const by = lastOf(/^[ \t]*Checked by:(.*)$/gm);
    const who = by ? by[1].split(/,| \(/)[0].trim() : '';
    if (!by) errors.push(`FOLD-CHECK.md has no "Checked by: <name>" line (${form})`);
    else if (!who) errors.push(`FOLD-CHECK.md: "Checked by:" names nobody (${form})`);
    else {
      if (clash(who, i.laneName)) errors.push(`FOLD-CHECK.md: Checked by "${who}" is the lane (${i.laneName}) or a name that contains or is contained in it; a separate agent must check (${form})`);
      for (const a of i.assignees.filter((x) => nameKey(x) !== nameKey(i.laneName))) if (clash(who, a)) errors.push(`FOLD-CHECK.md: Checked by "${who}" is, contains or is contained in an assignee of ${id} (${a}); a separate agent must check (${form})`);
    }
    const vd = lastOf(/^[ \t]*Verdict:[ \t]*(.*?)[ \t\r]*$/gm);
    if (!vd) errors.push(`FOLD-CHECK.md: no "Verdict: PASS" line (${form})`);
    else if (vd[1] !== 'PASS') errors.push(`FOLD-CHECK.md: the Verdict is not PASS ("${vd[1]}") (${form})`);
    const fp = lastOf(/^[ \t]*Plan:[ \t]*(\S+)[ \t]+sha256:([0-9a-f]{12})[ \t\r]*$/gm);
    if (!fp) errors.push(`FOLD-CHECK.md: no last "Plan: <task id> sha256:<12 hex>" line (${form}); expected: ${line}`);
    else if (`Plan: ${fp[1]} sha256:${fp[2]}` !== line) errors.push(`FOLD-CHECK.md: the Plan line "Plan: ${fp[1]} sha256:${fp[2]}" is not the hash of the task as it is now (the fold was checked on another text, so it must be checked again) (${form}); expected: ${line}`);
  }
  return { errors, lists: r.lists.length, findings, line };
}
const entriesOf = (taskText) => filesEntries(taskText) ?? [];

function check(msgFile) {
  if (!msgFile) return fail(['usage: check-lane-close.mjs <commit-msg-file>']);
  const top = git(['rev-parse', '--show-toplevel']).stdout.trim() || process.cwd();
  // S3 (task-453, GQ G4 S3 "narrow the skip and fail closed"): a merge is no longer skipped whole; only a move whose staged blob is the merged branch's own is skipped (below)
  const mergeHead = git(['rev-parse', '--git-path', 'MERGE_HEAD']).stdout.trim();
  const inMerge = Boolean(mergeHead && fs.existsSync(path.resolve(mergeHead)));
  if (!fs.existsSync(path.join(top, 'backlog/tasks'))) return 0;
  // H1 (V2.WHOLE round 4): the keys that decide what is checked (base_ref, finished_statuses, protected_paths, exempt) come from the BOARD ref, never from the lane's own table or from a ref the lane's table names
  const boardRef = BOARD_REFS.find((r) => git(['rev-parse', '--verify', '--quiet', `${r}^{commit}`]).status === 0) ?? null;
  let boardTable = null;
  if (boardRef) { const bx = git(['show', `${boardRef}:scripts/analysis/rule-lists.json`]); try { boardTable = bx.status === 0 ? JSON.parse(bx.stdout) : null; } catch { boardTable = null; } }
  const tableFile = path.join(top, 'scripts/analysis/rule-lists.json');
  const tableInHead = git(['cat-file', '-e', 'HEAD:scripts/analysis/rule-lists.json']).status === 0;
  const tableInTree = fs.existsSync(tableFile);
  // S2 (task-453): a repo that never had the table is not held to it only when the board has no table either; a branch that lost the table is judged by the board copy
  if (!tableInTree && !tableInHead && boardRef && git(['cat-file', '-e', `${boardRef}:scripts/analysis/rule-lists.json`]).status !== 0) return 0;
  let table = boardTable; // the table is in neither the tree nor HEAD: the board copy (null with no readable board: a move is refused below, no move passes)
  if (tableInTree || tableInHead) { try { table = readTable(tableFile); } catch (e) { return fail([`cannot read scripts/analysis/rule-lists.json${tableInHead ? ' (it is in HEAD: the close check fails closed; restore it)' : ''}: ${String(e.message).split('\n')[0]}`]); } }
  // a commit that moves no task never needs the board (round 5): the finished statuses default until a move is found, then the board is required
  const finished = new Set((boardTable?.finished_statuses ?? ['BUILT', 'DONE', 'MERGED']).map((s) => String(s).toUpperCase()));
  const staged = git(['diff', '--cached', '--name-only', '--no-renames']).stdout.split('\n').filter(Boolean);
  // S9 (task-453): a task file under backlog/archive/tasks and a numbered subtask file are task files too; docs/backlog/tasks is not (the pattern is anchored)
  const taskFiles = staged.filter((f) => /^backlog\/(archive\/)?tasks\/task-\d+(\.\d+)*( -.*)?\.md$/i.test(f));
  const moves = [];
  for (const f of taskFiles) {
    const now = git(['show', `:${f}`]);
    if (now.status !== 0) continue;
    const { fm } = parseFM(now.stdout);
    const status = String(fm.status ?? '').toUpperCase();
    if (!finished.has(status)) continue;
    // S3: during a merge, the merged branch's own blob of the task file is a close made and checked on that branch; any other blob is checked (a failed read is not equal)
    if (inMerge) { const mh = git(['rev-parse', `MERGE_HEAD:${f}`]); const ix = git(['rev-parse', `:${f}`]); if (mh.status === 0 && ix.status === 0 && mh.stdout.trim() === ix.stdout.trim()) continue; }
    // S9: an archived task is compared with the same file name under backlog/tasks at HEAD (archiving a finished task is no move)
    let was = git(['show', `HEAD:${f}`]);
    if (was.status !== 0 && f.startsWith('backlog/archive/tasks/')) was = git(['show', `HEAD:backlog/tasks/${path.basename(f)}`]);
    const headFm = was.status === 0 ? parseFM(was.stdout).fm : {};
    if (was.status === 0 && String(headFm.status ?? '').toUpperCase() === status) continue;
    moves.push({ f, now: now.stdout, fm, headFm, status, headText: was.status === 0 ? was.stdout : '' });
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
    // H10 (round 7): a close of a task number the board never held is refused, never a fallback to the lane's own copy (a renumbered, unassigned, retyped file would close unreviewed)
    if (!boardFm) { errors.push(`${id}: the board (${boardRef}) holds no copy of this task file (task number ${num ?? '?'}): type and lane assignee are read from the board copy and a close has no fallback to the lane's own copy; a lane may not close a task number the board never held`); continue; }
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
      L = git(['log', full, '--first-parent', '--reverse', '--format=%H', `-S${laneAssign}`, '--', boardFile ?? mv.f]).stdout.split('\n').filter(Boolean)[0] ?? null;
      if (!L) { errors.push(`${id}: no launch commit found: \`git log ${full} --first-parent --reverse -S${laneAssign} -- ${mv.f}\` returns nothing, so the task's recorded launch (the take on the board for its lane) cannot be proved (fail closed)`); continue; }
      if (git(['merge-base', '--is-ancestor', L, 'HEAD']).status !== 0) { errors.push(`${id}: the launch commit ${L.slice(0, 9)} is not an ancestor of HEAD: this branch was not cut from the task's launch`); continue; }
      const lx = git(['show', `${L}:${boardFile ?? mv.f}`]);
      baseTask = lx.status === 0 ? lx.stdout : null;
    }
    const baseFm = baseTask ? parseFM(baseTask).fm : null;
    // task-423 (adjustment 3): the plan evidence on the board at the launch commit (the launch gate refused before the take unless it was there)
    const planBoard = L ? planOnBoard(git(['show', `${L}:docs/reports/reviews/${id}/GROUNDER-PLAN.md`]).stdout, id) : false;
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
    // F10: the table the task is judged by is the range base's; a task whose own Files line names the table is the one exception: it is judged by its branch table (so its own edit applies) with every field that decides what is reviewed (exempt, base_ref, finished_statuses, protected_paths, every_task, output_off) still the range base's
    const ownsTable = coveredBy(filesEntries(baseTask ?? mv.now), 'scripts/analysis/rule-lists.json');
    const pin = { exempt: boardTable.exempt, base_ref: boardTable.base_ref, finished_statuses: boardTable.finished_statuses, protected_paths: boardTable.protected_paths };
    const judge = !baseTable ? { ...table, ...pin } : ownsTable ? { ...table, ...pin, every_task: baseTable.every_task, output_off: baseTable.output_off } : { ...baseTable, ...pin };
    // fields read from the lane's own copy, each pinned (round 6): the Files line the rule lists resolve from is the UNION of the launch copy and the staged one (narrowing it cannot drop a list), and the assignees the grounder must differ from are the staged, HEAD and board ones together
    const unionFiles = [...new Set([...(filesEntries(baseTask ?? '') ?? []), ...(filesEntries(mv.now) ?? [])])];
    const resolveText = unionFiles.length ? mv.now.replace(/Files:[ \t]*.*$/m, `Files: ${unionFiles.join(', ')}`) : mv.now;
    const allAssignees = [...new Set([...assignees, ...asList(mv.headFm.assignee).map(String), ...(boardFm ? asList(boardFm.assignee).map(String) : [])])];
    // task-375 A5: every committed context file of the task (docs/reports/reviews/<id>/context-rN.md), the INDEX first, then HEAD (the order readRepo uses), never the range base
    const ctxDir = `docs/reports/reviews/${id}/`;
    const contexts = [...new Set([...git(['ls-files', '--cached', '--', ctxDir]).stdout.split('\n'), ...git(['ls-tree', '-r', '--name-only', 'HEAD', '--', ctxDir]).stdout.split('\n')].filter((q) => new RegExp(`^${esc(ctxDir)}context-r\\d+\\.md$`).test(q)))].sort().map((q) => ({ name: q, text: readRepo(q) })).filter((x) => x.text !== null);
    errors.push(...closeErrors({ id, contexts, planOnBoard: planBoard, taskText: resolveText, fm: mv.fm, assignees: allAssignees, headAssignees: asList(mv.headFm.assignee).map(String), type, table: judge, root: top, letter: milestoneLetter(top, baseFm?.milestone ?? mv.fm.milestone), laneFiles, changed, expectedPaths, optionalPaths, rangeEmpty, diffOf, readRepo, readBase, facts: gitFacts(L), headTaskText: mv.headText }));
  }
  // H10: a branch whose tree lacks a board task file that is a lane build or fix task whose lane directory the branch carries has deleted or renumbered the real task: refused for any close
  const idxNums = new Set(git(['ls-files', '--cached', '--', 'backlog/tasks']).stdout.split('\n').map((p) => /backlog\/tasks\/task-0*(\d+)/i.exec(p)?.[1]).filter(Boolean));
  for (const lane of new Set(lanePaths.map((f) => f.split('/')).filter((p) => p.length === 6).map((p) => p[4]))) {
    const hits = git(['grep', '-l', '--fixed-strings', '-e', `@lane-${lane}`, boardRef, '--', 'backlog/tasks/']).stdout.split('\n').filter(Boolean).map((l) => l.slice(boardRef.length + 1));
    for (const bf of hits) {
      const bm = git(['show', `${boardRef}:${bf}`]);
      const fm = bm.status === 0 ? parseFM(bm.stdout).fm : {};
      const n = /task-0*(\d+)/i.exec(path.basename(bf))?.[1];
      if (['build', 'fix'].includes(String(fm.type ?? '').toLowerCase()) && asList(fm.assignee).map(String).includes(`@lane-${lane}`) && n && !idxNums.has(n)) errors.push(`this branch carries the lane directory of ${lane} but its tree has no task-${n} file: the board holds that task as a lane ${String(fm.type).toLowerCase()} task (${bf}); a branch that deletes or renumbers its task file cannot close anything`);
    }
  }
  return errors.length ? fail(errors) : 0;
}
/** CLI: node scripts/hooks/check-lane-close.mjs --outcomes <lane dir>: prints "checked N ids", then one line per refusal; exit 1 on any refusal (reads the directory on disk and the git facts of the current repo). */
export function outcomesCli(dir) {
  if (!dir) { process.stderr.write('usage: check-lane-close.mjs --outcomes <lane dir>\n'); return 1; }
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) { process.stdout.write(`no lane directory ${dir}: cannot check outcomes (usage: --outcomes docs/reports/lanes/<date>/<lane>)\n`); return 1; }
  const top = git(['rev-parse', '--show-toplevel']).stdout.trim() || process.cwd();
  const rd = (n) => { try { return fs.readFileSync(path.join(abs, n), 'utf8'); } catch { return null; } };
  const g = rd('GROUNDER.md');
  if (g === null) { process.stdout.write(`no GROUNDER.md in ${dir}\n`); return 1; }
  const lensFiles = fs.readdirSync(abs).filter(isLensOutput).sort().map((name) => ({ name, text: fs.readFileSync(path.join(abs, name), 'utf8') }));
  const verdicts = parseVerdicts(g);
  const rel = path.relative(top, abs).split(path.sep).join('/');
  // the launch commit L: the first board commit that holds this lane's assignee on the task file named by the lane's TASK file
  let L = null;
  const num = /task-0*(\d+)/i.exec(rd('TASK') ?? '')?.[1];
  const boardRef = BOARD_REFS.find((r) => git(['rev-parse', '--verify', '--quiet', `${r}^{commit}`]).status === 0);
  if (num && boardRef) {
    const bf = git(['ls-tree', '--name-only', boardRef, 'backlog/tasks/']).stdout.split('\n').find((n) => new RegExp(`^backlog/tasks/task-0*${num}( -.*)?\\.md$`, 'i').test(n));
    if (bf) L = git(['log', boardRef, '--first-parent', '--reverse', '--format=%H', `-S@lane-${path.basename(abs)}`, '--', bf]).stdout.split('\n').filter(Boolean)[0] ?? null;
  }
  const r = outcomeErrors({ selfTask: num ? `task-${num}` : null, verdicts, triageText: rd('TRIAGE.md') ?? '', lensKinds: new Map(findingsIn(lensFiles).map((f) => [f.id, lensKindOf(f.line)])), facts: gitFacts(L), mode: 'close', seats: seatLines(g, (p) => { try { return fs.readFileSync(path.join(top, p), 'utf8'); } catch { return null; } }), seatRoot: `${rel}/` });
  // a lens finding whose verdict line does not parse is a refusal here as it is at the close ("no complete verdict line"), never a silent skip
  const unruled = findingsIn(lensFiles).filter((f) => !verdicts.has(f.id)).map((f) => `${f.id}: no complete verdict line in GROUNDER.md (form: <id> CONFIRMED|REJECTED|CONFLICT <path>:<line> "<quote>" [reason]); the close refuses it too`);
  const all = [...r.errors, ...unruled];
  process.stdout.write(`checked ${r.ids} ids\n${all.map((e) => `${e}\n`).join('')}`);
  return all.length ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = process.argv[2] === '--outcomes' ? outcomesCli(process.argv[3]) : check(process.argv[2]);
