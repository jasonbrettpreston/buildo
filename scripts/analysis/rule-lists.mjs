#!/usr/bin/env node
// COMPLY.2 (task-366): the path to rule-list table reader. DATA (scripts/analysis/rule-lists.json), not code, decides which rule lists govern a task.
// Used by scripts/analysis/backlog-lane.mjs (attach at launch), scripts/hooks/check-lane-close.mjs (require at close) and this file's own CLI:
//   validate [--table f] [--root dir]                      every list file exists, every section selector names exactly one heading, every glob matches a tracked path
//   resolve --files "<Files line>" [--type t] [--letter L]   the lists a Files line attaches (JSON); exit 3 with one line when refused
//   lens-input [--list id | --list rules --lists a,b,c] --material f --out prefix [--template f] [--max n]   (task-423: --list rules joins the named lists whole, in table order, into one packed input set)
//                                                           the compliance lens input: the list FIRST, then the material; split by the list's own headings when list +
//                                                           material would pass the review tool bound; never trims; exit 1 when it cannot fit. V2.WHOLE (task-410): when the material is
//                                                           a git diff that leaves no room for a list part, the TOOL splits it at FILE boundaries into chunks (each chunk against every list
//                                                           part, stamped chunk c of m with its path list); one file alone over the room is refused naming it. No --list: the same chunks for
//                                                           a non-compliance lens template (an empty list part)
//   check-tasks [--table f] [--root dir]                    every open task of backlog/tasks: resolves (with the every_task and milestone lists verified) or is listed by id as not yet resolvable, with the reason
//   page [--write|--check] [--table f] [--root dir]          the generated page docs/reports/generated/rule-lists-by-kind.md: per kind of work the documents, sizes and part counts
//   findings --dir d                                        the finding ids of the lens outputs in d (<file stem>#<ordinal among BUG and DEFER lines>)
//   plan-prep <review|post|commit> --task task-N --lane <name> [--board dir] [--dry-run]   task-418 (LAUNCH.PREP): the MECHANICAL steps before a build launch (see planPrep below); it rules nothing
// Rules: Spec 08 section 7 rule 4 and section 5.3 (08_agents.md), 00_engineering_standards.md section 14, operator 2026-11-20 (see the table's $comment); PLAN-PROTOCOL.md:3 simple.
// Reused, not rebuilt: the glob matcher of scripts/analysis/mcbylaws/paths.mjs, the path maps of mcbylaws/protected-paths.json (globs_from), the Files grammar of check-task-files.mjs.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, asList, home, parseFM, readItems, REPO, sha256 } from './backlog-lib.mjs';
import { globToRegExp, matchesAny } from './mcbylaws/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TABLE = path.join(HERE, 'rule-lists.json');
const BOUND = 120000; // scripts/deepseek-review.js MAX_PROMPT_CHARS
const RESERVE = 800; // stamp, header and separator of one lens input file
/** The text a lens sees when no --context is given (the review tool's own placeholder). */
const NO_CONTEXT = '(no pasted context provided)';
const MARKER = '\n=== MATERIAL UNDER REVIEW (everything below this line) ===\n';
/** V2.WHOLE (task-410): the one diff command the brief, the lens input and the close check share (every flag pinned, so the text is the same on every machine). */
// --text and --full-index (V2.WHOLE fix round): a .gitattributes line `*.ts -diff` makes git print "Binary files differ" for code; --text prints the text whatever the attributes say, --full-index fixes the index line length
export const DIFF_ARGS = ['--no-ext-diff', '--no-textconv', '--text', '--full-index', '--diff-algorithm=myers', '--indent-heuristic', '--inter-hunk-context=0', '--no-color', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/', '-U3'];
/** A git diff cut at its file headers: [{path, text}] in order, or null when the text is not a diff (does not start at a header). Content lines carry a prefix, so a file whose own text says "diff --git" is never cut. */
export function splitDiff(text) {
  const at = [...text.matchAll(/^diff --git /gm)].map((m) => m.index);
  if (at.length === 0 || at[0] !== 0) return null;
  return at.map((s, i) => {
    const seg = text.slice(s, at[i + 1] ?? text.length);
    const rest = seg.split('\n', 1)[0].slice('diff --git a/'.length);
    const p = rest.slice(0, (rest.length - 3) / 2);
    if (!seg.startsWith('diff --git a/') || `${p} b/${p}` !== rest) throw new Error(`cannot read the path in the diff file header "${seg.split('\n', 1)[0].slice(0, 160)}": git quotes names with non-ASCII characters, quotes or tabs and prints rename headers; make the diff with the command in the brief (git -c core.quotepath=false diff with DIFF_ARGS, which has --no-renames) and rename a file whose name has a quote or a tab`);
    return { path: p, text: seg };
  });
}
export const diffPaths = (text) => (splitDiff(text) ?? []).map((s) => s.path);

export const readTable = (file = DEFAULT_TABLE) => JSON.parse(fs.readFileSync(file, 'utf8'));
/** The environment of a git call that must read the repository its cwd names: every GIT_* variable removed (a commit hook exports GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE, which would make a call in another directory answer from the calling repository; precedent: scripts/analysis/mcbylaws-loop/loop-gate.mjs, src/tests/backlog/helpers.ts). */
export const gitFreeEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
export function trackedFiles(root) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, env: gitFreeEnv() });
  if (r.status !== 0) throw new Error(`git ls-files failed in ${root}: ${String(r.stderr).trim().split('\n')[0]}`);
  return r.stdout.split('\0').filter(Boolean);
}

/** The globs of a row: literal, or read from an existing path map (globs_from). Throws when a map key is missing or empty. */
export function rowGlobs(row, root) {
  if (Array.isArray(row.globs)) return row.globs;
  const { file, key } = row.globs_from ?? {};
  if (!file || !key) throw new Error(`row ${row.id}: needs globs or globs_from {file, key}`);
  const v = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))[key];
  if (!Array.isArray(v) || v.length === 0) throw new Error(`row ${row.id}: globs_from ${file} key ${key} is not a non-empty glob list`);
  return v;
}

// ---- sections: fence aware headings; a section runs to the next heading of the same or a higher level ----
export function headings(text) {
  const out = []; let fence = null; let off = 0;
  text.split('\n').forEach((raw, i) => {
    const ln = raw.replace(/\r$/, ''); // some specs are CRLF; offsets still count the \r
    // CommonMark fences: an opener is 3+ backticks or tildes (a backtick opener's info string has no backtick, so inline text in triple backticks is not one); a closer is the same character only
    const open = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(ln);
    if (fence) { if (new RegExp('^\\s{0,3}' + (fence[0] === '`' ? '`' : '~') + '{' + fence.length + ',}\\s*$').test(ln)) fence = null; }
    else if (open && !(open[1][0] === '`' && open[2].includes('`'))) fence = open[1];
    else {
      const m = /^(#{1,6})\s+(.*)$/.exec(ln);
      if (m) out.push({ level: m[1].length, title: m[2].replace(/^[^\p{L}\p{N}]+/u, '').trim(), offset: off, line: i + 1 });
    }
    off += raw.length + 1;
  });
  return out;
}
/** The section whose heading starts with `selector` (after leading emoji and punctuation); throws unless exactly one heading matches. */
export function sectionText(text, selector) {
  const hs = headings(text);
  const hit = hs.filter((h) => h.title.startsWith(selector));
  if (hit.length === 0) throw new Error(`selector "${selector}" matches no heading`);
  if (hit.length > 1) throw new Error(`selector "${selector}" matches ${hit.length} headings (lines ${hit.map((h) => h.line).join(', ')})`);
  const h = hit[0];
  const next = hs.find((x) => x.offset > h.offset && x.level <= h.level);
  return `${text.slice(h.offset, next ? next.offset : text.length).trimEnd()}\n`;
}
/** The text blocks of a list: the whole file, or one block per section selector. Throws when the file or a selector is not there. */
export function listBlocks(list, root, id = '?') {
  // task-423: a joined list (joinLists) is its member lists in order, each whole; the label names the member
  if (Array.isArray(list.members)) return list.members.flatMap((m) => listBlocks(m, root, m.id).map((b) => ({ label: `${m.id}: ${b.label}`, text: b.text })));
  const f = path.join(root, list.file);
  if (!fs.existsSync(f)) throw new Error(`list ${id}: file ${list.file} is missing`);
  const text = fs.readFileSync(f, 'utf8');
  if (list.whole) return [{ label: 'whole file', text: text.endsWith('\n') ? text : `${text}\n` }];
  if (!Array.isArray(list.sections) || list.sections.length === 0) throw new Error(`list ${id}: needs whole or sections`);
  return list.sections.map((s) => { try { return { label: s, text: sectionText(text, s) }; } catch (e) { throw new Error(`list ${id} (${list.file}): ${e.message}`); } });
}

/** The id of the virtual list that joins the resolved lists (task-423); a table list may not use it. */
export const JOINED_ID = 'rules';
/** task-438 (FINAL.3, RR-0385 item 2, decision-170): the seat of a rule list. A list whose file is the engineering standards goes to the engineering seat (lens-engineering.md), every other list, and the joined list, to compliance. */
export const ENG_FILE = 'docs/specs/00_engineering_standards.md';
export const seatOf = (l) => (l.file === ENG_FILE ? 'engineering' : 'compliance');
/**
 * task-423 (PROTOCOL.SIMPLE, adjustment 1): a copy of the table with one extra list `rules`: the given lists joined WHOLE, in table order, nothing cut. The existing code (listBlocks, partsFor, renderLensInput,
 * the close check's whole-list recompute) reads it like any table list, so the lists are packed by size and one compliance call set covers all of them. Throws when an id is not in the table.
 */
export function joinLists(table, ids) {
  const want = new Set(ids);
  for (const id of want) if (id === JOINED_ID || !table.lists?.[id]) throw new Error(`cannot join: list ${id} is not in the table`);
  const sorted = Object.keys(table.lists).filter((k) => want.has(k));
  return { ...table, lists: { ...table.lists, [JOINED_ID]: { file: `the ${sorted.length} resolved lists (${sorted.join(', ')})`, generated_by: 'joined', whole: true, members: sorted.map((id) => ({ id, ...table.lists[id] })) } } };
}

// ---- validation ----
export function validateTable(table, root) {
  const bad = [];
  let tracked = [];
  try { tracked = trackedFiles(root); } catch (e) { return [e.message]; }
  const any = (g) => { const re = globToRegExp(g); return tracked.some((t) => re.test(t)); };
  if (!table.lists || typeof table.lists !== 'object') bad.push('lists: missing');
  for (const [id, l] of Object.entries(table.lists ?? {})) {
    if (!l || typeof l !== 'object') { bad.push(`list ${id}: not an object`); continue; } // T10 (task-453): a null list is a problem line, not a TypeError
    if (id === JOINED_ID) { bad.push(`list ${id}: the id "${JOINED_ID}" is the joined list of lens-input --list ${JOINED_ID} (task-423); name the list otherwise`); continue; }
    if (typeof l.generated_by !== 'string' || !l.generated_by) bad.push(`list ${id}: generated_by missing (a generator path or "hand-written")`);
    if (Boolean(l.whole) === Array.isArray(l.sections)) bad.push(`list ${id}: needs exactly one of whole or sections`);
    try { listBlocks(l, root, id); } catch (e) { bad.push(e.message); }
  }
  if (!Array.isArray(table.rows)) bad.push('rows: missing');
  const seen = new Set();
  for (const [ri, row] of (Array.isArray(table.rows) ? table.rows : []).entries()) {
    if (!row || typeof row !== 'object') { bad.push(`rows[${ri}]: not an object`); continue; } // T10 (task-453)
    if (seen.has(row.id)) bad.push(`row ${row.id}: duplicate id`); seen.add(row.id);
    for (const l of row.lists ?? []) if (!table.lists?.[l]) bad.push(`row ${row.id}: list ${l} is not defined`);
    if (!row.why) bad.push(`row ${row.id}: why missing`);
    if (row.not !== undefined && !(Array.isArray(row.not) && row.not.every((s) => typeof s === 'string' && s))) bad.push(`row ${row.id}: not must be a list of globs`);
    if (row.imports_from !== undefined && !(Array.isArray(row.imports_from) && row.imports_from.every((s) => typeof s === 'string' && s))) bad.push(`row ${row.id}: imports_from must be a list of paths`);
    let globs = [];
    try { globs = rowGlobs(row, root); } catch (e) { bad.push(e.message); continue; }
    if (Array.isArray(row.globs)) for (const g of globs) { if (!any(g)) bad.push(`row ${row.id}: glob ${g} matches no tracked path`); }
    else if (!tracked.some((t) => matchesAny(globs, t))) bad.push(`row ${row.id}: globs_from ${row.globs_from.key} matches no tracked path`);
  }
  for (const g of table.exempt ?? []) if (!any(g)) bad.push(`exempt glob ${g} matches no tracked path`);
  const d = table.no_files_default;
  if (d && !(table.rows ?? []).some((r) => r.id === d.row)) bad.push(`no_files_default: row ${d.row} is not defined`);
  for (const [k, id] of Object.entries(table.increment_docs ?? {})) if (!table.lists?.[id]) bad.push(`increment_docs ${k}: list ${id} is not defined`);
  // V2.LIST (task-406): the always-attached lists cannot be switched off by leaving the keys out
  if (!Array.isArray(table.every_task) || table.every_task.length === 0) bad.push('every_task: missing or empty (the lists every task gets: the plan protocol)');
  else for (const id of table.every_task) if (!table.lists?.[id]) bad.push(`every_task: list ${id} is not defined`);
  // task-453 (RR-0440, RR-0450, RR-0452): output_off, when present, is a list of list ids (a typo fails closed, it never switches a list off silently)
  // task-460 (RR-0457, RR-0458, RR-0459): it may name any defined list (own keys of lists), not only every_task ids
  if (table.output_off !== undefined) { if (!Array.isArray(table.output_off)) bad.push('output_off: must be a list of list ids'); else for (const id of table.output_off) if (!Object.hasOwn(table.lists ?? {}, id)) bad.push(`output_off: list ${id} is not defined`); }
  for (const k of Object.keys(table.increment_docs ?? {})) {
    const m = table.milestone_docs?.[k];
    if (!Array.isArray(m) || m.length === 0) bad.push(`milestone_docs: increment letter ${k} has no milestone list`);
    else for (const id of m) if (!table.lists?.[id]) bad.push(`milestone_docs ${k}: list ${id} is not defined`);
  }
  for (const k of table.kinds ?? []) {
    if (!k.id || !k.label || !k.files) bad.push(`kinds: ${k.id ?? '?'} needs id, label and files`);
    else { try { const r = resolveTask({ table, root, body: `Files: ${k.files}`, type: k.type ?? 'build', letter: k.letter, tracked }); if (r.error) bad.push(`kinds ${k.id}: ${r.error}`); else { const miss = verifyResolved(table, r, k.letter, k.type ?? 'build'); if (miss.length) bad.push(`kinds ${k.id}: ${miss.join('; ')}`); } } catch (e) { bad.push(`kinds ${k.id}: ${String(e.message).split('\n')[0]}`); } }
  }
  return bad;
}

// ---- resolution ----
/** The Files line of a task body: the entries after the first `Files:` (start of a line, or inline), or null when there is none. */
export function filesEntries(body) {
  const m = /(?:^|\s)Files:[ \t]*(.*)$/m.exec(String(body));
  const e = m ? m[1].split(',').map((s) => s.trim().replace(/^\.\//, '')).filter(Boolean) : [];
  return e.length ? e : null;
}
/** The raw text of the first `Files:` line (what the launch brief and the lens set read), '' when there is none. */
export const filesText = (body) => /(?:^|\s)Files:[ \t]*(.*)$/m.exec(String(body))?.[1] ?? '';
/**
 * The lens set a task type calls for (Spec 08 section 7 rule 4, 08_agents.md:334; task-358): the compliance lens is separate (once per rule list).
 * Plan and output lenses other than compliance, by task type and by the Files line. Shared by the launch brief and the close check.
 * task-460 (RR-0457, RR-0458, RR-0459 MORNING-DECISIONS.md:2377): the output set of a build or fix task is the code review (no ux, no error-paths); the security term is unchanged pending plan Q7.
 */
export function lensSet({ type, files }) {
  const code = ['build', 'fix'].includes(String(type ?? '').toLowerCase());
  const surface = /\bmobile\/|src\/app\/|src\/components\/|surfaces\//.test(files);
  const sec = /entitlement|auth|stripe|metered|admin|pii/i.test(files) || (filesEntries(`Files: ${files}`) ?? []).some((e) => /^src\/(?:app\/api|lib)(?:\/|$)/.test(e)); // task-445 (RR-0391, 08_agents.md section 5.7): an API route or library path (the api-lib row)
  return {
    code,
    plan: ['plan-review-deepseek', ...(code && surface ? ['ux'] : []), ...(code ? ['error-paths'] : []), ...(code && sec ? ['security'] : [])],
    out: [...(code ? ['code-review'] : []), ...(code && sec ? ['security'] : [])],
  };
}
/** The line a grounder restates for every lens output it ruled on: name, sha256 (12 hex) and BUG/DEFER count. */
export const ruledLine = (name, text) => `Ruled: ${name} sha256:${sha256(Buffer.from(text)).slice(0, 12)} findings:${findingsIn([{ name, text }]).length}`;

/** The group letter of a milestone's title ("... [S]" gives "S"), read from backlog/milestones of `root`. */
export function milestoneLetter(root, milestone) {
  const dir = path.join(root, 'backlog/milestones');
  if (!milestone || !fs.existsSync(dir)) return undefined;
  const title = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => parseFM(fs.readFileSync(path.join(dir, f), 'utf8')).fm).find((fm) => String(fm.id) === String(milestone))?.title;
  return /\[([^\]]+)\]\s*$/.exec(String(title ?? ''))?.[1];
}
function candidates(entry, tracked) {
  const e = entry.replace(/^\.\//, '').replace(/\/+$/, '');
  const out = new Set();
  if (!e) return [];
  if (/[*?]/.test(e)) {
    const re = globToRegExp(e);
    for (const t of tracked) if (re.test(t)) out.add(t);
    out.add(e.replace(/\*+/g, 'x').replace(/\?/g, 'x'));
  } else {
    out.add(e); out.add(`${e}/x`);
    for (const t of tracked) if (t === e || t.startsWith(`${e}/`)) out.add(t);
  }
  return [...out];
}
// The module paths a file imports, resolved to repo paths ('@/x' is src/x; a relative path against the file's directory; a bare package is skipped), comments removed. ANCHORED: a
// path matches when it IS the named directory or is under it ("scripts/lib/compute" does not match "scripts/lib/compute-old"); a comment or a string is not an import.
const resolveSpec = (file, spec) => (spec.startsWith('@/') ? `src/${spec.slice(2)}` : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : null);
const importsFrom = (root, file, imps) => {
  const p = path.join(root, file);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return false;
  const text = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of text.matchAll(/(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|^\s*import\s*)['"]([^'"]+)['"]/gm)) {
    const r = resolveSpec(file, m[1]);
    if (r && imps.some((i) => r === i || r.startsWith(`${i}/`))) return true;
  }
  return false;
};
/** True when a changed path is covered by a Files entry (a path prefix on a directory boundary, or a glob), the grammar check-task-files.mjs reads. */
export const coveredBy = (entries, p) => (entries ?? []).some((e0) => { const e = e0.replace(/^\.\//, '').replace(/\/+$/, ''); return /[*?]/.test(e) ? globToRegExp(e).test(p) : p === e || p.startsWith(`${e}/`); });

/**
 * The lists a task attaches. `body`: the task text (the Files line is read from it); `type`: the task type; `letter`: the milestone group letter.
 * Returns {lists, exempt, unmatched} on success, {error} (one line) when refused: no Files line, an unmatched path, or no increment document.
 */
export function resolveTask({ table, root, body, type, letter, tracked }) {
  tracked ??= trackedFiles(root);
  const result = { lists: [], exempt: [], unmatched: [] };
  const byId = new Map();
  const add = (id, rowId, why) => {
    let l = byId.get(id);
    if (!l) {
      const d = table.lists[id];
      if (!d) throw new Error(`row ${rowId}: list ${id} is not defined in the table`);
      l = { id, file: d.file, ...(d.whole ? { whole: true } : { sections: d.sections }), generated_by: d.generated_by, ...(d.status ? { status: d.status } : {}), rows: [], why: [] };
      byId.set(id, l); result.lists.push(l);
    }
    if (!l.rows.includes(rowId)) { l.rows.push(rowId); l.why.push(why); }
  };
  const rows = table.rows.map((row) => ({ row, globs: rowGlobs(row, root) }));
  let entries = filesEntries(body);
  let rowHits = 0;
  if (!entries) {
    const d = table.no_files_default;
    const row = d && d.types.map((x) => x.toLowerCase()).includes(String(type ?? '').toLowerCase()) ? table.rows.find((r) => r.id === d.row) : null;
    if (!row) return { error: `refused: the task has no Files: line, so no rule lists can be attached (add "Files: path, dir/, glob" to the description; only a ${d ? d.types.join('/') : 'record-only'} task defaults to the queue lists)` };
    for (const l of row.lists) add(l, row.id, `${row.why} (no Files line: the record-only default)`);
    entries = [];
  }
  for (const entry of entries) {
    const cands = candidates(entry, tracked);
    const hit = rows.filter(({ row, globs }) => cands.some((c) => matchesAny(globs, c) && !matchesAny(row.not ?? [], c) && (!row.imports_from || importsFrom(root, c, row.imports_from))));
    if (hit.length) { rowHits += 1; for (const { row } of hit) for (const l of row.lists) add(l, row.id, row.why); continue; }
    if (cands.some((c) => matchesAny(table.exempt ?? [], c))) result.exempt.push(entry); else result.unmatched.push(entry);
  }
  if (result.unmatched.length) return { error: `refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: ${result.unmatched.join(', ')} (add a row to the table, or fix the Files line); no silent "no rules apply"` };
  if (entries.length > 0 && rowHits === 0 && ['build', 'fix'].includes(String(type ?? '').toLowerCase())) return { error: `refused: the Files line of a ${type} task resolves to no rule list (only exempt paths: ${result.exempt.join(', ')}); a build or fix task must touch at least one governed path` };
  if (letter === undefined && ['build', 'fix'].includes(String(type ?? '').toLowerCase())) return { error: 'refused: the task has no milestone (a build or fix task needs one: its milestone objectives are attached to every review; set the milestone with the backlog CLI)' };
  for (const id of table.every_task ?? []) add(id, 'every-task', 'every task also gets the lists of every_task in scripts/analysis/rule-lists.json (the plan protocol; at the output review of a build or fix task the output_off lists are off)');
  if (letter !== undefined) {
    const id = table.increment_docs?.[letter];
    if (!id) return { error: `refused: no increment requirements document for milestone group [${letter}] in increment_docs of scripts/analysis/rule-lists.json` };
    add(id, 'increment', 'every task also gets the requirements document of its increment (the milestone group letter)');
    const ms = table.milestone_docs;
    if (ms !== undefined) {
      if (!Array.isArray(ms[letter]) || ms[letter].length === 0) return { error: `refused: no milestone objectives list for milestone group [${letter}] in milestone_docs of scripts/analysis/rule-lists.json` };
      for (const id of ms[letter]) add(id, 'milestone', 'every task also gets the objectives sections of its milestone (the milestone group letter)');
    }
  }
  // task-431 (RR-0385 item 7, decision-170; RR-0380 Q1, decision-165): a whole list and a sections list of the same file both resolved: the whole list is kept, the sections list dropped (each rule sent once)
  result.lists = result.lists.filter((l) => l.whole || !result.lists.some((w) => w.whole && w.file === l.file));
  return result;
}

/**
 * What a resolved set is missing: the every_task lists and the milestone lists of the letter (task-406). [] when complete; the table's own every_task key being empty is a problem too.
 * Shared by validate, check-tasks and the close check, so the always-attached lists cannot be skipped by one of them.
 */
export function verifyResolved(table, result, letter, type) {
  const have = new Set((result?.lists ?? []).map((l) => l.id));
  const out = [];
  if (!Array.isArray(table.every_task) || table.every_task.length === 0) out.push('the table has no every_task lists (the plan protocol must be attached to every task)');
  for (const id of table.every_task ?? []) if (!have.has(id)) out.push(`every_task list ${id} is not attached`);
  if (letter === undefined) { if (['build', 'fix'].includes(String(type ?? '').toLowerCase())) out.push('a build or fix task has no milestone: its milestone objectives cannot be attached'); }
  else if (!table.milestone_docs || typeof table.milestone_docs !== 'object') out.push('the table has no milestone_docs (the objectives of each milestone must be attached)');
  else if (!Array.isArray(table.milestone_docs[letter]) || table.milestone_docs[letter].length === 0) out.push(`milestone_docs has no entry for milestone group [${letter}]`);
  else for (const id of table.milestone_docs[letter]) if (!have.has(id)) out.push(`milestone list ${id} is not attached`);
  return out;
}
/** task-453 (RR-0440 MORNING-DECISIONS.md:2265, RR-0450 :2325, RR-0452 :2336): the lists an OUTPUT review of a build or fix task needs: the resolved lists minus the table's output_off (empty or missing: every list). Shared by the close check and the launch brief. */
export const outputLists = (table, lists) => lists.filter((l) => !(table?.output_off ?? []).includes(l.id));

// ---- finding ids (shared with scripts/hooks/check-lane-close.mjs) ----
/** A deliberately loose reading of a finding line (decoration, numbering, quotes, bold, a colon, any case). It must give the same count as the strict FINDING_LINE, else lines were altered. */
const FINDING_LOOSE = /^[\s>*_`"'\-\d.):]*\b(bug|defer)\b[\s*_`"':]*\s*(severity|crit|high|med|low|nit)/i;
export const looseFindingCount = (text) => text.split('\n').filter((ln) => FINDING_LOOSE.test(ln)).length;
export const FINDING_LINE = /^\s*[-*]?\s*(BUG|DEFER)\s+severity=/;
export const isLensOutput = (name) => /^(plan|out)-.+\.txt$/.test(name);
/** [{id, line}] for BUG and DEFER lines of lens outputs [{name, text}]; id = <file stem>#<1-based ordinal among BUG and DEFER lines of that file>. */
export function findingsIn(files) {
  const out = [];
  for (const { name, text } of files) {
    if (!isLensOutput(name)) continue;
    const stem = name.replace(/\.txt$/, '');
    let n = 0;
    for (const ln of text.split('\n')) if (FINDING_LINE.test(ln)) out.push({ id: `${stem}#${++n}`, line: ln.trim() });
  }
  return out;
}

// ---- lens input ----
/**
 * task-375 A6 (his :1546 "or split smaller"; the cut at rows and paragraphs is the orchestrator's reading): a block with no deeper heading is cut between table rows or blank-line
 * paragraphs and the pieces packed in order up to `max`. A row or paragraph that alone passes `max`, or a block with no row or blank line to cut at, is refused naming it (the old throw).
 * A row is judged without its neighbours and, mid-table, without its column header.
 */
function splitFlat(text, max, label, id) {
  const pieces = [];
  let cur = [];
  const flush = () => { if (cur.length) { pieces.push(cur.join('\n')); cur = []; } };
  const lines = text.split('\n');
  const head = /^#{1,6}\s/.test(lines[0]) ? 1 : 0; // the block's own heading line stays with the first piece (a part of only a heading would judge nothing)
  for (const [i, ln] of lines.entries()) {
    if (i < head) cur.push(ln);
    else if (/^\s*\|/.test(ln)) { if (!(head && pieces.length === 0 && cur.length === 1)) flush(); cur.push(ln); flush(); } else if (ln.trim() === '') { if (!(head && pieces.length === 0 && cur.length === 1)) flush(); } else cur.push(ln);
  }
  flush();
  const big = pieces.find((x) => x.length > max);
  if (big) throw Object.assign(new Error(`list ${id}: section "${label}" is ${text.length} characters and has no deeper heading, table row or blank line to split at that fits (a piece of ${big.length} characters; room for list text in one file: ${max})`), { room: true, size: big.length });
  const out = [];
  let acc = [];
  let len = 0;
  for (const x of pieces) {
    if (acc.length && len + x.length + 1 > max) { out.push(acc.join('\n')); acc = []; len = 0; }
    acc.push(x); len += x.length + 1;
  }
  if (acc.length) out.push(acc.join('\n'));
  return out;
}
function splitUnits(text, max, label, id) {
  if (text.length <= max) return [text];
  const subs = headings(text).filter((h) => h.offset > 0);
  if (subs.length === 0) return splitFlat(text, max, label, id);
  const level = Math.min(...subs.map((h) => h.level));
  const cuts = [0, ...subs.filter((h) => h.level === level).map((h) => h.offset), text.length];
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const chunk = text.slice(cuts[i], cuts[i + 1]);
    if (chunk.trim()) out.push(...splitUnits(chunk, max, `${label} > ${chunk.split('\n', 1)[0].trim().slice(0, 60)}`, id));
  }
  return out;
}
/** The text of one lens input file, exactly as lens-input writes it (the close check regenerates it from the stamped parts and compares). `list` null: no rule list. `paths` null: material that is not a diff. */
export function renderLensInput({ id, list, part, i, n, material, paths, c, m }) {
  const sel = list ? (list.whole ? 'whole file' : `sections ${list.sections.join('; ')}`) : '';
  const mark = paths ? ` chunk ${c} of ${m}` : '';
  const where = list?.members ? `${list.members.length} lists: ${list.members.map((m) => m.id).join(', ')}` : list ? `${list.file}, ${sel}` : '';
  const what = list ? `RULE LIST ${id} (${where}), part ${i} of ${n}. Judge the material under review against the rules in this part; the other parts of the same list are reviewed in their own runs.` : 'NO RULE LIST: the lens template alone judges the material under review.';
  const head = `${what}${paths ? ` The material is chunk ${c} of ${m} of the change, cut at file boundaries by lens-input; the other chunks are reviewed in their own runs. paths: ${JSON.stringify(paths)}` : ''}`;
  const stamp = `LIST ${list ? id : 'none'} sha256:${sha256(Buffer.from(part))} material sha256:${sha256(Buffer.from(material))} part ${i} of ${n}${mark}`;
  return `${stamp}\n${head}\n\n${part}${MARKER}${material}\n`;
}
/** The prompt hash the review tool writes in its REVIEW header: sha256 of JSON [system, user] for a lens template, the input file as {{PLAN}} and the context as {{SPECS}} (today the tool's placeholder string; a task that passes a real context file passes its text here). */
export function lensPromptHash({ templateText, inputText, context = NO_CONTEXT }) {
  const rt = createRequire(import.meta.url)(path.join(REPO, 'scripts/lib/review-template.js'));
  const split = rt.splitTemplate(templateText);
  const system = split.systemInstruction ?? "You are a focused reviewer. Follow the prompt's output format strictly.";
  const user = rt.substitutePlaceholders(split.userTemplate, { plan: inputText, specs: context, dataContext: '(no live-DB context provided)' });
  return sha256(Buffer.from(JSON.stringify([system, user])));
}

/**
 * The lens input files for one list: [{suffix, text}]. The list part comes first, whole; the material follows. Throws when a part cannot fit (never trims).
 * V2.WHOLE (task-410): when the material leaves no room for a list part and is a git diff, the TOOL cuts it at file boundaries into chunks (packed in diff order, each at most the room
 * left beside the list part); every chunk goes against every list part, files are -p1..-pN chunk by chunk (N = chunks x list parts), and each input is stamped "chunk c of m" with
 * its path list. One file alone over the room is refused naming the file and its size. A diff is always stamped (chunk 1 of 1 when it fits), so the close check reads paths from the stamp.
 * `list` null (a non-compliance lens template): the same chunks with an empty list part, id "none"; such an input is always named -pN, even when it is the only file (task-419).
 */
export function buildLensInputs({ id, list, root, material, templateFile, context = NO_CONTEXT, max = Number(process.env.DEEPSEEK_REVIEW_MAX_CHARS) || BOUND }) {
  const rt = createRequire(import.meta.url)(path.join(REPO, 'scripts/lib/review-template.js'));
  const split = rt.splitTemplate(fs.readFileSync(templateFile, 'utf8'));
  const sys = (split.systemInstruction ?? "You are a focused reviewer. Follow the prompt's output format strictly.").length;
  const k = (split.userTemplate.match(/\{\{PLAN\}\}/g) ?? []).length || 1;
  const fixed = sys + rt.substitutePlaceholders(split.userTemplate, { plan: '', specs: context, dataContext: '(no live-DB context provided)' }).length;
  const avail = Math.floor((max - fixed - 200) / k);
  const room = (msg, size) => Object.assign(new Error(msg), { room: true, size });
  const partsFor = (unitMax) => {
    if (!list) return [''];
    const units = listBlocks(list, root, id).flatMap((b) => splitUnits(b.text, unitMax, b.label, id));
    const parts = [];
    let cur = [];
    let len = 0;
    for (const u of units) {
      if (cur.length && len + u.length + 1 > unitMax) { parts.push(cur.join('\n')); cur = []; len = 0; }
      cur.push(u); len += u.length + 1;
    }
    if (cur.length) parts.push(cur.join('\n'));
    return parts;
  };
  const segs = splitDiff(material);
  let chunks = [{ text: material, paths: segs ? segs.map((s) => s.path) : null }];
  let parts;
  try {
    const unitMax = avail - material.length - RESERVE;
    if (unitMax < (list ? 200 : 0)) throw room(`material is ${material.length} characters; with the lens template (${fixed} fixed characters, the plan placeholder used ${k}x) at most ${avail} characters fit one file, leaving ${unitMax} for the list: split the material (a list is never trimmed)`);
    parts = partsFor(unitMax);
    // F13: the room test above is an estimate; when the FINAL prompt (stamp, head with the path list, marker) of the widest part would pass the bound, the material is chunked too
    const widest = parts.reduce((x, y) => (y.length > x.length ? y : x), '');
    const finalLen = sys + rt.substitutePlaceholders(split.userTemplate, { plan: renderLensInput({ id, list, part: widest, i: parts.length, n: parts.length, material, paths: segs ? chunks[0].paths : null, c: 1, m: 1 }), specs: context, dataContext: '(no live-DB context provided)' }).length;
    if (finalLen > max) throw room(`the input with the rendered head would be ${finalLen} characters, over the ${max} bound`, widest.length);
  } catch (e) {
    if (!e.room || !segs) throw e;
    // the material is a diff: cut it at file boundaries. The list part gets half the room (more when one of its blocks cannot be split), never so much that the largest file cannot ride beside it.
    const big = segs.reduce((x, y) => (y.text.length > x.text.length ? y : x));
    let listRoom = list ? Math.max(0, Math.min(Math.floor(avail / 2), avail - RESERVE - big.text.length)) : 0;
    for (;;) {
      if (avail - RESERVE - listRoom < big.text.length) throw new Error(`file ${big.path} is ${big.text.length} characters of diff and cannot be split inside a file: at most ${avail - RESERVE - listRoom} fit one input beside the rule list part of ${listRoom} (bound ${max}); report it to the orchestrator`);
      try { parts = partsFor(listRoom); break; } catch (x) { if (!x.room || !(x.size > listRoom)) throw x; listRoom = x.size; }
    }
    // the room of a chunk is MEASURED (V2.WHOLE fix round): the stamp, the head with the chunk's own path list and the marker are rendered for the longest list part and counted, so a long path list cannot push an input over the bound
    const longest = parts.reduce((x, y) => (y.length > x.length ? y : x), '');
    const promptOf = (paths, text) => sys + rt.substitutePlaceholders(split.userTemplate, { plan: renderLensInput({ id, list, part: longest, i: 99999, n: 99999, material: text, paths, c: 99999, m: 99999 }), specs: context, dataContext: '(no live-DB context provided)' }).length;
    chunks = [];
    for (const s of segs) {
      const last = chunks[chunks.length - 1];
      if (last && promptOf([...last.paths, s.path], last.text + s.text) <= max) { last.text += s.text; last.paths.push(s.path); continue; }
      const alone = promptOf([s.path], s.text);
      if (alone > max) throw new Error(`file ${s.path} is ${s.text.length} characters of diff and cannot be split inside a file: with the rule list part (${longest.length} characters), the stamp and the head the input would be ${alone} characters, over the ${max} bound; report it to the orchestrator`);
      chunks.push({ text: s.text, paths: [s.path] });
    }
  }
  const files = [];
  chunks.forEach((ch, ci) => parts.forEach((p, i) => {
    const text = renderLensInput({ id, list, part: p, i: i + 1, n: parts.length, material: ch.text, paths: ch.paths, c: ci + 1, m: chunks.length });
    const prompt = sys + rt.substitutePlaceholders(split.userTemplate, { plan: text, specs: context, dataContext: '(no live-DB context provided)' }).length;
    if (prompt > max) throw new Error(`list ${id}: part ${i + 1} would be ${prompt} characters, over the ${max} bound`);
    const n = ci * parts.length + i + 1;
    // task-419: a rule-list input that is one file keeps the unsuffixed name; a no-list input is always -pN (the close check reads an unsuffixed out-<lens>.txt as a review of the raw diff)
    files.push({ suffix: list && files.length === 0 && chunks.length * parts.length === 1 ? '' : `-p${n}`, text });
  }));
  return files;
}

/**
 * Read a lens input file back: {id, listSha, materialSha, part, parts, listPart, material} or null when it is not one. The close check recomputes the hashes from the text,
 * and checks that the parts of a list together carry the WHOLE list (whitespace aside), so a list cannot be shortened or softened and re-stamped.
 */
export function parseLensInput(text) {
  const m = /^LIST (\S+) sha256:([0-9a-f]{64}) material sha256:([0-9a-f]{64}) part (\d+) of (\d+)(?: chunk (\d+) of (\d+))?\n/.exec(text);
  if (!m) return null;
  const l1 = text.indexOf('\n', text.indexOf('\n') + 1);
  const mi = text.indexOf(MARKER);
  if (l1 < 0 || mi < 0) return null;
  const listPart = text.slice(l1 + 2, mi);
  const material = text.slice(mi + MARKER.length).replace(/\n$/, '');
  const pm = / paths: (\[.*\])$/.exec(text.slice(0, l1));
  let paths = null;
  try { paths = pm ? JSON.parse(pm[1]) : null; } catch { paths = null; }
  return { id: m[1], listSha: m[2], materialSha: m[3], part: Number(m[4]), parts: Number(m[5]), chunk: m[6] === undefined ? undefined : Number(m[6]), chunks: m[7] === undefined ? undefined : Number(m[7]), paths, listPart, material, ok: sha256(Buffer.from(listPart)) === m[2] && sha256(Buffer.from(material)) === m[3] };
}
/** The text of a whole list as the helper reads it (all blocks), for the whole-list comparison. */
export const wholeListText = (list, root, id) => listBlocks(list, root, id).map((b) => b.text).join('');

// ---- task-433 (INPUTS.5, RR-0378 step 6): the rule ids of the sent list part that appear nowhere in a review output ----
/**
 * A report for the grounder, never a gate. ids = the bold ids that start a list line of the list part of a lens input (fe.01, core.3, m.431), in order, unique; a document without such ids gives none.
 * missing = the ids that appear nowhere in the output text (a finding, a MET or REJECT line, or the Rules met line); an id is matched whole, its dot literal (fe.1 is not covered by fe.12).
 */
export function unmentionedRules(inputText, outputText) {
  const p = parseLensInput(inputText);
  if (!p) throw new Error('not a lens input');
  const ids = [...new Set([...p.listPart.matchAll(/^\s*[-*]\s+\*\*([a-z][a-z0-9-]*\.\d+)\*\*/gm)].map((m) => m[1]))];
  const missing = ids.filter((id) => !new RegExp(`(?<![\\w.-])${reEsc(id)}(?![\\w-]|\\.\\d)`).test(outputText));
  return { ids, missing, hasLine: /^Rules met:/m.test(outputText), list: p.id, part: p.part, parts: p.parts };
}

// ---- compliance references (task-375 B1, his :1541 "labelled means i need to know its a compliance document") ----
/**
 * The references a task carries for its resolved lists: one "compliance:<list id> <file>" per list, compared by the id token (the text before the first space). A file path with a comma is entered
 * as "compliance:<list id>" alone (backlog splits --add-ref at commas; ms-9 is the only such list). {add} the entries for lists the task does not carry yet; {remove} the compliance: entries of
 * lists that no longer resolve. `lists` [{id, file}]; `refs` the task's references.
 */
export function complianceRefs(lists, refs) {
  const idOf = (r) => /^compliance:(\S+)/.exec(String(r).trim())?.[1];
  const have = new Map((refs ?? []).filter((r) => idOf(r)).map((r) => [idOf(r), String(r).trim()]));
  const want = new Set(lists.map((l) => l.id));
  return {
    add: lists.filter((l) => !have.has(l.id)).map((l) => (String(l.file).includes(',') ? `compliance:${l.id}` : `compliance:${l.id} ${l.file}`)),
    remove: [...have].filter(([id]) => !want.has(id)).map(([, r]) => r),
  };
}

// ---- the check over every open task, and the generated page (task-406, V2.LIST) ----
/** Every open task (not finished, not DROPPED) of root's backlog/tasks: {resolve: [ids], notYet: [{id, cls, reason}], bad: [lines]}. A task with a Files line that resolves must carry the every_task and milestone lists. */
export function checkTasks({ table, root }) {
  const tracked = trackedFiles(root);
  const done = new Set([...(table.finished_statuses ?? ['BUILT', 'DONE', 'MERGED']), 'DROPPED'].map((s) => s.toUpperCase()));
  const out = { resolve: [], notYet: [], bad: [], refs: [] };
  for (const t of readItems(root)) {
    if (done.has(String(t.fm.status ?? '').toUpperCase())) continue;
    const letter = milestoneLetter(root, t.fm.milestone);
    let r;
    try { r = resolveTask({ table, root, body: t.body, type: String(t.fm.type ?? ''), letter, tracked }); } catch (e) { out.bad.push(`${t.id}: cannot resolve: ${String(e.message).split('\n')[0]}`); continue; }
    if (!r.error) {
      const miss = verifyResolved(table, r, letter, String(t.fm.type ?? ''));
      if (miss.length) out.bad.push(`${t.id}: resolves but ${miss.join('; ')}`);
      else {
        out.resolve.push(t.id);
        const c = complianceRefs(r.lists, asList(t.fm.references));
        if (c.add.length || c.remove.length) out.refs.push({ id: t.id, ...c }); // task-375 B1: the exact command that brings the task's compliance: references in step
      }
      continue;
    }
    const m = /matched by no row[^:]*: (.*?) \(add a row/.exec(r.error);
    if (m) out.notYet.push({ id: t.id, cls: 0, reason: `a Files path matches no row: ${m[1]}` });
    else if (/no Files: line/.test(r.error)) out.notYet.push({ id: t.id, cls: 2, reason: 'no Files line' });
    else out.notYet.push({ id: t.id, cls: 1, reason: r.error.replace(/^refused: /, '') });
  }
  out.notYet.sort((a, b) => a.cls - b.cls || numOf(a.id) - numOf(b.id));
  return out;
}
const numOf = (id) => Number(/(\d+)$/.exec(String(id))?.[1]);

const PAGE = 'docs/reports/generated/rule-lists-by-kind.md';
const NOMINAL = 30000; // characters of material per review (the plan context file of a task is about this size)
const fmtN = (n) => n.toLocaleString('en-US');
/** The generated page: per kind of work (table key kinds) the documents its compliance review receives, with characters and lens-input part counts at a nominal material size. */
export function renderPage({ table, root }) {
  const tracked = trackedFiles(root);
  const tmpl = path.join(REPO, '.claude/review-templates/lens-compliance.md');
  const o = [];
  o.push('<!-- GENERATED by scripts/analysis/rule-lists.mjs page --write from scripts/analysis/rule-lists.json and the documents it names. Do not edit; regenerate. -->', '');
  o.push('# What each kind of work receives: the compliance review documents', '');
  o.push('Every task gets the every_task lists (the plan protocol) and the objectives sections of its milestone; the rows add the specs that govern the touched paths; the output review of a build or fix task receives none of the lists (output_off, task-460). Characters are the text of the list as the review receives it; parts are the lens-input files for one list at a material of ' + fmtN(NOMINAL) + ' characters (a list is split by its own headings, never trimmed, when list plus material pass the review tool bound). A missing or shrunken document shows here as a changed row.', '');
  for (const k of table.kinds ?? []) {
    const r = resolveTask({ table, root, body: `Files: ${k.files}`, type: k.type ?? 'build', letter: k.letter, tracked });
    o.push(`## ${k.label}`, '');
    if (r.error) { o.push(`Not resolvable: ${r.error}`, ''); continue; }
    o.push(`Example Files line: \`${k.files}\`; type ${k.type ?? 'build'}; milestone group [${k.letter ?? 'none'}].`, '');
    o.push('| list | document | selection | characters | parts |', '| --- | --- | --- | ---: | ---: |');
    let chars = 0; let parts = 0;
    for (const l of r.lists) {
      const def = table.lists[l.id];
      const c = listBlocks(def, root, l.id).reduce((n, b) => n + b.text.length, 0);
      let p;
      let err = '';
      try { p = buildLensInputs({ id: l.id, list: def, root, material: 'x'.repeat(NOMINAL), templateFile: tmpl }).length; } catch (e) { p = 0; err = String(e?.message ?? e).split('\n')[0].replace(/\|/g, '/'); } // T10 (task-453): the error text is kept and printed
      chars += c; parts += p;
      o.push(`| ${l.id} | ${l.file} | ${def.whole ? 'whole file' : def.sections.join('; ')} | ${fmtN(c)} | ${p || `does not fit${err ? `: ${err}` : ''}`} |`);
    }
    o.push(`| total | ${r.lists.length} lists | | ${fmtN(chars)} | ${parts} |`, '');
  }
  return o.join('\n') + '\n';
}

/** The lines of the findings command for a folder: a Ruled line per lens output, then "<id>\t<line>" per finding (the CLI prints them; plan-prep writes them to FINDINGS-PLAN.md). */
export function findingsReport(dir) {
  const files = fs.readdirSync(dir).filter(isLensOutput).sort().map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
  return [...files.map((f) => ruledLine(f.name, f.text)), ...findingsIn(files).map((f) => `${f.id}\t${f.line}`)];
}

// ---- plan-prep (task-418, LAUNCH.PREP; PLAN-418-v2 in the task): the MECHANICAL steps before a build launch, three phases of one subcommand ----
//   review  the plan context (backlog-brief.mjs), one lens input and one review call per resolved rule list (compliance), one call per plan lens, FINDINGS-PLAN.md
//   post    the references and the "Plan review round N" block on the task, read from the check's own text (outcomeErrors of check-lane-close.mjs)
//   commit  the evidence folder committed through the real hooks, then the launch dry run (the gate)
// It NEVER writes a ruling, a seat report, a grounder file, an outcome line or the Plan line, and it does not launch. Reused, not rebuilt: backlog-brief.mjs, lens-input, findingsReport, resolveTask,
// the exported functions of scripts/hooks/check-lane-close.mjs (a dynamic import: that file imports this one) and scripts/analysis/backlog-lane.mjs (run as the gate, unchanged).
// Every git call and every spawned tool gets gitFreeEnv() (a commit hook exports GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE). Test-only seams: --review-bin <script> replaces scripts/deepseek-review.js,
// --launch-args '<json array>' adds arguments to the launch dry run (as backlog-lane's own --backlog-bin and --main seams).
class Stop extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const shq = (s) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);
const cmdLine = (cwd, argv, env) => `cd ${shq(cwd)} && ${env ? `${Object.entries(env).map(([k, v]) => `${k}=${shq(v)}`).join(' ')} ` : ''}${argv.map(shq).join(' ')}`;
const first = (s, n = 8) => String(s).trim().split('\n').slice(0, n).join('\n');
const CALL_MS = (Number(process.env.DEEPSEEK_REVIEW_TIMEOUT_MS) || 900000) + 10000; // deepseek-review.js bounds a call at DEEPSEEK_REVIEW_TIMEOUT_MS, 900 s by default (TIMEOUT_MS); T10 (task-453)
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function planPrep(a) {
  const str = (k, d) => (a[k] && a[k] !== true ? String(a[k]) : d);
  const refuse = (m) => { throw new Stop(3, `refused: ${m}`); };
  const phase = a._?.[0];
  const taskId = str('task', '').toLowerCase();
  const lane = str('lane', '');
  if (!['review', 'post', 'commit'].includes(phase) || !/^task-\d+$/.test(taskId) || !lane) { process.stderr.write('plan-prep: usage: plan-prep <review|post|commit> --task task-N --lane <planned lane name> [--board <dir>] [--dry-run]\n'); return 2; }
  const dry = a['dry-run'] === true;
  const board = path.resolve(home(str('board', '~/Buildo-wt-board')));
  const ev = `docs/reports/reviews/${taskId}`;
  const evAbs = path.join(board, ev);
  const env = gitFreeEnv();
  const git = (...g) => spawnSync('git', ['-c', 'core.quotepath=false', ...g], { cwd: board, encoding: 'utf8', maxBuffer: 1 << 26, env });
  const bin = path.resolve(home(str('backlog-bin', process.env.BACKLOG_BIN || [path.join(board, 'node_modules/.bin/backlog'), path.join(REPO, 'node_modules/.bin/backlog')].find((c) => fs.existsSync(c)) || path.join(REPO, 'node_modules/.bin/backlog'))));
  const say = (cwd, argv, e) => console.log(`$ ${cmdLine(cwd, argv, e)}`);
  const sh = (argv) => spawnSync(argv[0], argv.slice(1), { cwd: board, encoding: 'utf8', maxBuffer: 1 << 26, env, timeout: 120000 }); // T10 (task-453): a hung backlog call ends
  const rm = (re) => { if (fs.existsSync(evAbs)) for (const f of fs.readdirSync(evAbs)) if (re.test(f)) fs.rmSync(path.join(evAbs, f)); };
  try {
    if (!fs.existsSync(board) || git('rev-parse', '--git-dir').status !== 0) refuse(`board ${board} is not a git checkout`);
    const t = readItems(board).find((x) => x.id === taskId);
    if (!t) refuse(`${taskId} not found under ${path.join(board, 'backlog/tasks')}`);
    const type = String(t.fm.type ?? '').toLowerCase();
    const planField = /<!-- SECTION:PLAN:BEGIN -->\n?([\s\S]*?)\n?<!-- SECTION:PLAN:END -->/.exec(t.body)?.[1] ?? '';
    // the files of the board outside backlog/ and the evidence folder that are dirty or staged (the node_modules links of a worktree are untracked and ignored: backlog-lane.mjs:84)
    const dirtyOutside = () => {
      const st = git('status', '--porcelain', '--untracked-files=all');
      if (st.status !== 0) refuse(`git status failed on ${board}: ${first(st.stderr, 1)}`);
      return st.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"(.*)"$/, '$1')).filter((p) => !p.startsWith('backlog/') && !p.startsWith(`${ev}/`) && !/(^|\/)node_modules\/?$/.test(p));
    };
    const notDirty = () => { const d = dirtyOutside(); if (d.length) refuse(`board checkout ${board} is dirty outside backlog/ and ${ev}/: ${d.slice(0, 5).join(', ')}${d.length > 5 ? ', ...' : ''}`); };
    // test-only seam: the launch dry run takes the fixture's own paths (--main, --panel-tools, ...) and NOTHING else. Only these flags, each with a plain value, are accepted: identity (--task, --lane, --board), --dry-run and every flag that launches or takes are refused, and the gate argv puts the identity and --dry-run last
    const LAUNCH_ARG_FLAGS = ['--main', '--panel-tools', '--backlog-bin', '--worktree', '--lane-dir', '--date'];
    const launchArgs = () => {
      let v;
      try { v = JSON.parse(str('launch-args', '[]')); } catch { throw new Stop(2, 'usage: --launch-args must be a JSON array of strings'); }
      if (!Array.isArray(v)) throw new Stop(2, 'usage: --launch-args must be a JSON array of strings');
      const out = v.map(String);
      for (let i = 0; i < out.length; i += 2) if (!LAUNCH_ARG_FLAGS.includes(out[i]) || out[i + 1] === undefined || out[i + 1].startsWith('--')) refuse(`--launch-args carries "${out[i]}": only ${LAUNCH_ARG_FLAGS.join(', ')}, each with a value, are accepted (the launch dry run never launches)`);
      return out;
    };

    if (phase === 'review') return await reviewPhase();
    if (phase === 'post') return await postPhase();
    return commitPhase();

    // ---- review ----
    async function reviewPhase() {
      const status = String(t.fm.status).toUpperCase();
      if (status !== 'LATER' && status !== 'WAITS') refuse(`task ${taskId} is not LATER or WAITS (status ${status}); only a waiting task is prepared`);
      if (type !== 'build' && type !== 'fix') refuse(`task ${taskId} is type ${type || '(none)'}: only build and fix tasks have a plan review`);
      const table = readTable(DEFAULT_TABLE);
      const letter = milestoneLetter(board, t.fm.milestone);
      let r;
      try { r = resolveTask({ table, root: board, body: t.body, type, letter }); } catch (e) { refuse(`${taskId}: cannot read the rule-list table or one of its path maps under ${board}: ${first(e.message, 1)}`); }
      if (r.error) refuse(`${taskId}: ${r.error.replace(/^refused: /, '')}`);
      const miss = verifyResolved(table, r, letter, type);
      if (miss.length) refuse(`${taskId}: the resolved rule lists are incomplete: ${miss.join('; ')}`);
      if (!planField.trim()) refuse(`${taskId}: the Implementation Plan field is empty (backlog task edit ${taskId} --plan ...): there is nothing to review`);
      notDirty();
      const old = fs.existsSync(evAbs) ? fs.readdirSync(evAbs).filter((f) => /^plan-.*\.txt$/.test(f)) : [];
      if (old.length) refuse(`${ev}/ already holds ${old.slice(0, 3).join(', ')}${old.length > 3 ? ', ...' : ''}: one review round per prep run (a second round re-makes every input and output, 08_agents.md:352)`);

      const rt = createRequire(import.meta.url)(path.join(REPO, 'scripts/lib/review-template.js'));
      const ctxRel = `${ev}/context-r${rt.contextRound(evAbs)}.md`;
      const reviewBin = str('review-bin', '') ? path.resolve(home(str('review-bin', ''))) : 'scripts/deepseek-review.js';
      const dotenv = [path.join(os.homedir(), 'Buildo/node_modules/dotenv/config'), path.join(REPO, 'node_modules/dotenv/config')].find((c) => fs.existsSync(`${c}.js`)) ?? path.join(os.homedir(), 'Buildo/node_modules/dotenv/config');
      const denv = { DOTENV_CONFIG_PATH: process.env.DOTENV_CONFIG_PATH || path.join(os.homedir(), 'Buildo', '.env') };
      const reviewArgv = (file, tpl) => ['node', '-r', dotenv, reviewBin, 'review', file, '--template', `.claude/review-templates/${tpl}`, '--context', ctxRel, ...rt.CONTEXT_SECTIONS.flatMap((s) => ['--section', s])];
      const lenses = lensSet({ type, files: filesText(t.body) }).plan.map((l) => ({ out: `plan-${l}.txt`, tpl: l === 'plan-review-deepseek' ? 'plan-review-deepseek.md' : `lens-${l}.md`, file: ctxRel }));
      const lists = type === 'build' ? r.lists : []; // a fix task needs the plan lens outputs only (check-lane-close.mjs:604); RR-0374: the per-document form is the default, the joined form is only accepted by the checks
      const briefArgv = ['node', path.join(HERE, 'backlog-brief.mjs'), '--task', taskId, '--lane', lane, '--root', board];
      const inputArgv = (l) => ['node', path.join(HERE, 'rule-lists.mjs'), 'lens-input', '--root', board, '--list', l.id, '--context', ctxRel, '--material-from', ctxRel, '--out', `${ev}/in-plan-${seatOf(l)}-${l.id}`, '--template', path.join(REPO, `.claude/review-templates/lens-${seatOf(l)}.md`)]; // task-438: named and sized by the list's seat
      if (dry) {
        say(board, briefArgv);
        for (const l of lists) say(board, inputArgv(l));
        // the number of parts of a list is known only from the context the brief writes: the review command names the file as in-plan-<seat>-<id>[-pN].txt
        for (const l of lists) say(board, reviewArgv(`${ev}/in-plan-${seatOf(l)}-${l.id}[-pN].txt`, `lens-${seatOf(l)}.md`), denv);
        for (const l of lenses) say(board, reviewArgv(l.file, l.tpl), denv);
        return 0;
      }
      const fail = (m) => { rm(/^(in-)?plan-.*\.txt$/); throw new Stop(1, m); };
      say(board, briefArgv);
      const b = sh(briefArgv);
      if (b.status !== 0 || !fs.existsSync(path.join(board, ctxRel))) throw new Stop(1, `the brief did not write ${ctxRel}: ${first(b.stderr || b.stdout, 2)}`);
      for (const l of lists) { say(board, inputArgv(l)); const x = sh(inputArgv(l)); if (x.status !== 0) fail(`lens-input failed for list ${l.id}: ${first(x.stderr || x.stdout, 3)}`); }
      const jobs = [];
      for (const l of lists) for (const f of fs.readdirSync(evAbs).filter((n) => new RegExp(`^in-plan-${seatOf(l)}-${reEsc(l.id)}(-p\\d+)?\\.txt$`).test(n)).sort()) jobs.push({ out: f.replace(/^in-/, ''), tpl: `lens-${seatOf(l)}.md`, file: `${ev}/${f}` });
      const nCompliance = jobs.filter((j) => j.tpl === 'lens-compliance.md').length;
      const nEngineering = jobs.length - nCompliance;
      jobs.push(...lenses);
      const started = jobs.map((j) => { const argv = reviewArgv(j.file, j.tpl); say(board, argv, denv); return runAsync(argv, denv).then((x) => ({ j, x })); });
      const done = await Promise.all(started);
      const failed = done.filter(({ x }) => x.status !== 0);
      if (failed.length) fail(`${failed.length} review call(s) failed: ${failed.map(({ j, x }) => `${j.file} (${x.signal ?? `exit ${x.status}`}: ${first(x.stderr || x.stdout, 2).replace(/\n/g, ' | ')})`).join('; ')}; nothing is kept, run the phase again`);
      for (const { j, x } of done) fs.writeFileSync(path.join(evAbs, j.out), x.stdout);
      // each output holds the REVIEW header of the template asked for in its first 15 lines (a dotenv banner may come first) and a VERDICT line (check-lane-close.mjs:57-70)
      const bad = done.map(({ j }) => ({ j, text: fs.readFileSync(path.join(evAbs, j.out), 'utf8') })).filter(({ j, text }) => !new RegExp(`^REVIEW template=${reEsc(j.tpl)} `, 'm').test(text.split('\n').slice(0, 15).join('\n')) || !/^VERDICT:/m.test(text));
      if (bad.length) fail(`${bad.length} output(s) lack the REVIEW header of their template in the first 15 lines or the VERDICT line: ${bad.map(({ j }) => `${ev}/${j.out}`).join(', ')}`);
      const report = findingsReport(evAbs);
      fs.writeFileSync(path.join(evAbs, 'FINDINGS-PLAN.md'), `${report.join('\n')}\n`);
      console.log(`plan-prep review: ${done.length} outputs (${nCompliance} compliance, ${nEngineering} engineering, ${lenses.length} plan lens), ${report.filter((l) => l.includes('\t')).length} findings, ${ev}/FINDINGS-PLAN.md`);
      return 0;
    }
    function runAsync(argv, extra) {
      return new Promise((resolve) => {
        const c = spawn(argv[0], argv.slice(1), { cwd: board, env: { ...env, ...extra }, timeout: CALL_MS });
        let stdout = ''; let stderr = '';
        c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
        c.on('error', (e) => resolve({ status: 1, signal: null, stdout, stderr: `${stderr}${e.message}` }));
        c.on('close', (status, signal) => resolve({ status: status ?? 1, signal, stdout, stderr }));
      });
    }

    // ---- post ----
    async function postPhase() {
      const clc = await import('../hooks/check-lane-close.mjs');
      const read = (rel) => { const p = path.join(board, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
      const g = read(`${ev}/GROUNDER-PLAN.md`);
      if (g === null) refuse(`${ev}/GROUNDER-PLAN.md is absent (the separate grounder writes it before post)`);
      const taskText = fs.readFileSync(t.file, 'utf8');
      const entries = filesEntries(t.body) ?? [];
      const seats = clc.seatLines(g, read);
      const need = [...clc.PLAN_SEATS.always, ...(entries.some((e) => git('ls-files', '--', e).stdout.trim() !== '') ? clc.PLAN_SEATS.conditional : [])];
      const problems = [
        ...need.filter((n) => !seats.some((s) => s.name.toLowerCase() === n)).map((n) => `no "Seat: ${n} <repo path inside ${ev}/> sha256:<12 hex>" line in GROUNDER-PLAN.md`),
        ...seats.filter((s) => s.text === null).map((s) => `the seat file ${s.path} (Seat ${s.name}) is absent on disk`),
      ];
      const verdicts = clc.parseVerdicts(g);
      const triage = read(`${ev}/TRIAGE-PLAN.md`) ?? '';
      for (const [id, v] of verdicts) if ((v.word === 'CONFIRMED' || v.word === 'CONFLICT') && !new RegExp(`^\\s*(?:[-*]\\s+)?${reEsc(id)}\\s+\\S`, 'm').test(triage.replace(/[`*]/g, ''))) problems.push(`${id} is ${v.word} in GROUNDER-PLAN.md and has no line in TRIAGE-PLAN.md`);
      if (problems.length) refuse(problems.join('; '));
      const files = fs.readdirSync(evAbs).filter(isLensOutput).sort().map((name) => ({ name, text: fs.readFileSync(path.join(evAbs, name), 'utf8') }));
      const headTasks = git('ls-tree', '--name-only', 'HEAD', 'backlog/tasks/').stdout.split('\n').filter(Boolean);
      const showHead = (p) => { const x = git('show', `HEAD:${p}`); return x.status === 0 ? x.stdout : null; };
      const oc = clc.outcomeErrors({
        verdicts, triageText: triage, lensKinds: new Map(findingsIn(files).map((f) => [f.id, clc.lensKindOf(f.line)])), mode: 'plan', seats, seatRoot: `${ev}/`, selfTask: taskId,
        facts: {
          taskText: () => taskText,
          taskOf: (tid) => { const n = /\d+/.exec(tid)?.[0]; const f = headTasks.find((x) => new RegExp(`^backlog/tasks/task-0*${n}( -.*)?\\.md$`, 'i').test(x)); if (!f) return { exists: false, status: '', text: '' }; const x = showHead(f) ?? ''; return { exists: true, status: String(parseFM(x).fm.status ?? ''), text: x }; },
          decisionExists: (ref) => git('ls-tree', '--name-only', 'HEAD', 'backlog/decisions/').stdout.split('\n').some((x) => path.posix.basename(x).toLowerCase().startsWith(`${ref.toLowerCase()} -`) || path.posix.basename(x).includes(ref)),
        },
        summary: { text: '', headText: '', grounderPath: `${ev}/GROUNDER-PLAN.md`, triagePath: `${ev}/TRIAGE-PLAN.md` }, // empty text: clean outcomes come back as the check's own "the block is:" message
      });
      const lacks = oc.errors.filter((e) => /^the task's Final Summary lacks/.test(e));
      const other = oc.errors.filter((e) => !lacks.includes(e));
      if (other.length) throw new Stop(1, `the fold is not finished (${other.length} outcome error(s)); the task is unchanged:\n${other.join('\n')}`);
      let block;
      if (oc.ids === 0) block = `Plan review round 1: 0 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder ${ev}/GROUNDER-PLAN.md; triage ${ev}/TRIAGE-PLAN.md`;
      else {
        const m = /the block is:\n([\s\S]*?)\n\(one command/.exec(lacks[0] ?? '');
        if (!m) refuse(`the check's message holds no block to read (${first(lacks[0] ?? '(no message)', 1)}); the task is unchanged`);
        block = m[1].replace(/^Review round/, 'Plan review round');
      }
      const lines = block.split('\n');
      if (!/^Plan review round 1: \d+ folded, \d+ task, \d+ ruling, \d+ wontfix, \d+ pile; grounder \S+; triage \S+$/.test(lines[0]) || !lines.slice(1).every((l) => /^\S+ (CRITICAL|HIGH|MED) (folded|task|ruling|wontfix|pile)(\s.*)?$/.test(l))) refuse(`the block read from the check is not in the expected form (the check's text changed?): ${lines[0].slice(0, 100)}; the task is unchanged`);
      const have = planField.split('\n').map((l) => l.trim());
      const rounds = have.filter((l) => /^Plan review round \d+:/.test(l));
      const otherRound = rounds.find((l) => l !== lines[0]);
      if (otherRound) refuse(`the plan field already holds "${otherRound.slice(0, 90)}": a second round line moves the gate's N (one round line holds the latest counts); remove it by hand`);
      if (rounds.length && !lines.every((l) => have.includes(l))) refuse(`the plan field holds the round line but not every outcome line of the block; fix it by hand (${lines.filter((l) => !have.includes(l))[0].slice(0, 80)})`);
      const refs = new Set(asList(parseFM(taskText).fm.references).map((x) => String(x).trim()));
      const wantRefs = [...new Set([`${ev}/GROUNDER-PLAN.md`, ...(triage ? [`${ev}/TRIAGE-PLAN.md`] : []), ...seats.map((s) => s.path)])];
      const addRefs = wantRefs.filter((x) => !refs.has(x));
      if (rounds.length && addRefs.length === 0) { console.log('plan-prep post: nothing to post (the round block and every reference are on the task)'); return 0; }
      const argv = [bin, 'task', 'edit', taskId, ...(rounds.length ? [] : ['--append-plan', block]), ...addRefs.flatMap((x) => ['--add-ref', x])]; // one --add-ref per path: backlog splits a value at a comma
      say(board, argv);
      if (dry) return 0;
      const e = sh(argv);
      if (e.status !== 0) throw new Stop(1, `backlog task edit failed: ${first(e.stderr || e.stdout || e.error?.message, 3)}`);
      console.log(`plan-prep post: ${rounds.length ? '' : 'block and '}${addRefs.length} reference(s) added to ${taskId}`);
      return 0;
    }

    // ---- commit ----
    function commitPhase() {
      const lock = path.resolve(board, git('rev-parse', '--git-path', 'index.lock').stdout.trim() || '.git/index.lock');
      const locked = () => { if (fs.existsSync(lock)) refuse(`${lock} exists: the board commit job (every 600 s) or another git command holds the index; retry in a minute`); };
      locked();
      notDirty();
      if (!fs.existsSync(path.join(evAbs, 'GROUNDER-PLAN.md'))) refuse(`${ev}/GROUNDER-PLAN.md is absent: nothing to commit yet`);
      const changed = git('status', '--porcelain', '--untracked-files=all', '--', ev).stdout.trim() !== '';
      const addArgv = ['git', 'add', '--', ev];
      const commitArgv = ['git', 'commit', '-q', '-m', `docs(08_agents): plan review evidence for ${taskId}`, '--', ev];
      const gateArgv = ['node', path.join(HERE, 'backlog-lane.mjs'), ...launchArgs(), '--task', taskId, '--lane', lane, '--board', board, '--dry-run'];
      if (changed) { say(board, addArgv); say(board, commitArgv); } else console.log(`plan-prep commit: ${ev}/ is already committed`);
      say(board, gateArgv);
      if (dry) return 0;
      if (changed) {
        locked();
        const undo = () => git('restore', '--staged', '--', ev);
        const ad = git('add', '--', ev);
        if (ad.status !== 0) { undo(); throw new Stop(1, `git add failed: ${first(ad.stderr, 3)}`); }
        const cm = git(...commitArgv.slice(1)); // the real hooks run; no --no-verify
        if (cm.status !== 0) { undo(); throw new Stop(1, `the commit did not land and nothing is staged (git exit ${cm.status}):\n${first(`${cm.stdout}\n${cm.stderr}`, 12)}`); }
        console.log(`plan-prep commit: committed ${git('rev-parse', '--short', 'HEAD').stdout.trim()} (${ev}/)`);
      }
      const gx = sh(gateArgv);
      process.stdout.write(gx.stdout); process.stderr.write(gx.stderr);
      return gx.status ?? 1; // the gate's own exit code and text, passed through (3 with the expected Plan line, 0 with "plan gate ok")
    }
  } catch (e) {
    if (e instanceof Stop) { process.stderr.write(`plan-prep: ${e.message}\n`); return e.code; }
    throw e;
  }
}
// ---- CLI ----
function cli() {
  const [cmd] = process.argv.slice(2);
  const a = args(process.argv.slice(3));
  const str = (k, d) => (a[k] && a[k] !== true ? String(a[k]) : d);
  const root = path.resolve(str('root', REPO));
  const tableFile = path.resolve(str('table', DEFAULT_TABLE));
  const die = (code, m) => { process.stderr.write(`rule-lists: ${m}\n`); process.exit(code); };
  let table;
  try { table = readTable(tableFile); } catch (e) { die(1, `cannot read ${tableFile}: ${e.message}`); }
  if (cmd === 'validate') {
    const bad = validateTable(table, root);
    if (bad.length) die(1, `${bad.length} problem(s):\n${bad.join('\n')}`);
    console.log(`rule-lists: ok ${Object.keys(table.lists).length} lists, ${table.rows.length} rows`);
  } else if (cmd === 'resolve') {
    const letter = a.letter && a.letter !== true ? String(a.letter) : undefined;
    let r;
    try { r = resolveTask({ table, root, body: `Files: ${str('files', '')}`, type: str('type', ''), letter }); } catch (e) { die(3, `cannot resolve: ${String(e.message).split('\n')[0]}`); }
    if (r.error) die(3, r.error);
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'lens-input') {
    const id = str('list', '');
    if (id === JOINED_ID) { // task-423: the joined list of the resolved lists named by --lists a,b,c (table order, each whole)
      const ids = str('lists', '').split(',').map((x) => x.trim()).filter(Boolean);
      if (!ids.length) die(2, `usage: lens-input --list ${JOINED_ID} --lists <id,id,...> (the resolved list ids to join)`);
      try { table = joinLists(table, ids); } catch (e) { die(1, e.message); }
    }
    const list = id ? table.lists[id] : null; // no --list: a non-compliance lens template, the chunks alone (V2.WHOLE)
    if (id && !list) die(1, `no list ${id} in ${tableFile}`);
    if (!id && !a.template) die(2, 'usage: lens-input needs --list <id>, or --template <lens file> alone to split the material for a non-compliance lens');
    // task-375 A4: the reviewer's context is the task, sized: the selected sections of the committed context file are counted in the room. --material-from <context-rN.md> cuts the plan phase material from it (and is its own context).
    const matFrom = str('material-from', ''); const ctxFile = str('context', matFrom);
    const matFile = str('material', ''); const outPrefix = str('out', '');
    if (!ctxFile) die(2, 'usage: lens-input needs --context <context-rN.md> (the reviewer context of the task; the selected sections are counted in the room); --material-from <context-rN.md> is its own context');
    if ((!matFile && !matFrom) || !outPrefix || (matFile && !fs.existsSync(matFile)) || !fs.existsSync(ctxFile) || (matFrom && !fs.existsSync(matFrom))) die(2, 'usage: lens-input [--list <id>] (--material <file> | --material-from <context-rN.md>) --context <context-rN.md> --out <prefix> [--template <lens file>] [--max <n>]');
    let context; let material;
    try {
      const rt = createRequire(import.meta.url)(path.join(REPO, 'scripts/lib/review-template.js'));
      context = rt.extractSections(fs.readFileSync(ctxFile, 'utf8'), rt.CONTEXT_SECTIONS);
      material = matFrom ? rt.extractSections(fs.readFileSync(matFrom, 'utf8'), rt.PLAN_SECTIONS) : fs.readFileSync(matFile, 'utf8');
    } catch (e) { die(1, e.message); }
    if (a.max !== undefined && !(Number.isFinite(Number(a.max)) && Number(a.max) > 0)) die(1, `--max must be a positive number (got ${a.max}); the bound has to be enforced`);
    let files;
    try { files = buildLensInputs({ id, list, root, material, context, templateFile: path.resolve(str('template', path.join(REPO, '.claude/review-templates/lens-compliance.md'))), ...(a.max ? { max: Number(a.max) } : {}) }); } catch (e) { die(1, e.message); }
    const dir = path.dirname(path.resolve(outPrefix)); const base = path.basename(outPrefix);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (f === `${base}.txt` || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-p\\d+\\.txt$`).test(f)) fs.rmSync(path.join(dir, f));
    for (const f of files) { const p = path.join(dir, `${base}${f.suffix}.txt`); fs.writeFileSync(p, f.text); console.log(p); }
  } else if (cmd === 'check-tasks') {
    let c;
    try { c = checkTasks({ table, root }); } catch (e) { die(1, e.message); }
    console.log(`check-tasks: open ${c.resolve.length + c.notYet.length + c.bad.length}: resolve ${c.resolve.length}, not yet resolvable ${c.notYet.length}${c.bad.length ? `, FAILED ${c.bad.length}` : ''}`);
    const heads = ['a Files path matches no row (a governance gap: add a row or fix the Files line)', 'other reason', 'no Files line (the author adds one before launch)'];
    for (let cls = 0; cls < 3; cls++) { const g = c.notYet.filter((x) => x.cls === cls); if (g.length) { console.log(`not yet resolvable, ${heads[cls]}: ${g.length}`); for (const x of g) console.log(`  ${x.id}: ${x.reason}`); } }
    if (c.refs.length) {
      const q1 = (x) => `'${String(x).replace(/'/g, "'\\''")}'`;
      console.log(`compliance references out of step with the resolved lists: ${c.refs.length} task(s); run each printed command (exit stays 0)`);
      for (const x of c.refs) console.log(`  backlog task edit ${x.id} ${[...x.add.map((e) => `--add-ref ${q1(e)}`), ...x.remove.map((e) => `--remove-ref ${q1(e)}`)].join(' ')}`);
    }
    if (c.bad.length) { for (const b of c.bad) console.log(`FAILED ${b}`); die(1, `${c.bad.length} open task(s) resolve without the every_task or milestone lists`); }
  } else if (cmd === 'page') {
    const file = path.join(root, PAGE);
    const want = renderPage({ table, root });
    if (a.write) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, want); console.log(`rule-lists: wrote ${PAGE}`); }
    else if (a.check) {
      const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (have !== want) die(1, `${PAGE} is ${have === null ? 'missing' : 'out of date'}: regenerate with node scripts/analysis/rule-lists.mjs page --write (a document or the table changed)`);
      console.log(`rule-lists: ${PAGE} is current`);
    } else die(2, 'usage: page --write | --check');
  } else if (cmd === 'findings') {
    const dir = str('dir', '');
    if (!dir || !fs.existsSync(dir)) die(2, 'usage: findings --dir <lane report dir>');
    for (const l of findingsReport(dir)) console.log(l);
  } else if (cmd === 'unmentioned') {
    const out = str('out', '');
    if (!out) die(2, 'usage: unmentioned --out <review output file> [--in <its lens input, default in-<output name> beside it>]');
    const inp = str('in', path.join(path.dirname(out), `in-${path.basename(out)}`));
    let r;
    try { r = unmentionedRules(fs.readFileSync(inp, 'utf8'), fs.readFileSync(out, 'utf8')); } catch (e) { die(1, `unmentioned: ${e.message}`); }
    const name = path.basename(out);
    if (!r.ids.length) console.log(`${name}: the sent list part holds no name.N bullet rule ids (ids of another shape are not read), nothing to report`);
    else console.log(`${name}: list ${r.list} part ${r.part} of ${r.parts}: ${r.missing.length} of ${r.ids.length} rule ids are in no finding and not in the Rules met line: ${r.missing.length ? r.missing.join(', ') : 'none'}${r.hasLine ? '' : ' [no "Rules met:" line in the output]'}`);
  } else if (cmd === 'plan-prep') {
    planPrep(a).then((c) => process.exit(c), (e) => die(1, `plan-prep: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e}`));
  } else die(2, 'usage: rule-lists.mjs validate | resolve | lens-input | check-tasks | page | findings | unmentioned | plan-prep');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
