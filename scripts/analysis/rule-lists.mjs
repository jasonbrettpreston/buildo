#!/usr/bin/env node
// COMPLY.2 (task-366): the path to rule-list table reader. DATA (scripts/analysis/rule-lists.json), not code, decides which rule lists govern a task.
// Used by scripts/analysis/backlog-lane.mjs (attach at launch), scripts/hooks/check-lane-close.mjs (require at close) and this file's own CLI:
//   validate [--table f] [--root dir]                      every list file exists, every section selector names exactly one heading, every glob matches a tracked path
//   resolve --files "<Files line>" [--type t] [--letter L]   the lists a Files line attaches (JSON); exit 3 with one line when refused
//   lens-input --list id --material f --out prefix [--template f] [--max n]
//                                                           the compliance lens input: the list FIRST, then the material; split by the list's own headings when list +
//                                                           material would pass the review tool bound; never trims; exit 1 when it cannot fit
//   findings --dir d                                        the finding ids of the lens outputs in d (<file stem>#<ordinal among BUG and DEFER lines>)
// Rules: Spec 08 section 7 rule 4 and section 5.3 (08_agents.md), 00_engineering_standards.md section 14, operator 2026-11-20 (see the table's $comment); PLAN-PROTOCOL.md:3 simple.
// Reused, not rebuilt: the glob matcher of scripts/analysis/mcbylaws/paths.mjs, the path maps of mcbylaws/protected-paths.json (globs_from), the Files grammar of check-task-files.mjs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, parseFM, REPO, sha256 } from './backlog-lib.mjs';
import { globToRegExp, matchesAny } from './mcbylaws/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TABLE = path.join(HERE, 'rule-lists.json');
const BOUND = 120000; // scripts/deepseek-review.js MAX_PROMPT_CHARS
const RESERVE = 800; // stamp, header and separator of one lens input file
const MARKER = '\n=== MATERIAL UNDER REVIEW (everything below this line) ===\n';

export const readTable = (file = DEFAULT_TABLE) => JSON.parse(fs.readFileSync(file, 'utf8'));
export function trackedFiles(root) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
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
  const f = path.join(root, list.file);
  if (!fs.existsSync(f)) throw new Error(`list ${id}: file ${list.file} is missing`);
  const text = fs.readFileSync(f, 'utf8');
  if (list.whole) return [{ label: 'whole file', text: text.endsWith('\n') ? text : `${text}\n` }];
  if (!Array.isArray(list.sections) || list.sections.length === 0) throw new Error(`list ${id}: needs whole or sections`);
  return list.sections.map((s) => { try { return { label: s, text: sectionText(text, s) }; } catch (e) { throw new Error(`list ${id} (${list.file}): ${e.message}`); } });
}

// ---- validation ----
export function validateTable(table, root) {
  const bad = [];
  let tracked = [];
  try { tracked = trackedFiles(root); } catch (e) { return [e.message]; }
  const any = (g) => { const re = globToRegExp(g); return tracked.some((t) => re.test(t)); };
  if (!table.lists || typeof table.lists !== 'object') bad.push('lists: missing');
  for (const [id, l] of Object.entries(table.lists ?? {})) {
    if (typeof l.generated_by !== 'string' || !l.generated_by) bad.push(`list ${id}: generated_by missing (a generator path or "hand-written")`);
    if (Boolean(l.whole) === Array.isArray(l.sections)) bad.push(`list ${id}: needs exactly one of whole or sections`);
    try { listBlocks(l, root, id); } catch (e) { bad.push(e.message); }
  }
  if (!Array.isArray(table.rows)) bad.push('rows: missing');
  const seen = new Set();
  for (const row of table.rows ?? []) {
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
 */
export function lensSet({ type, files }) {
  const code = ['build', 'fix'].includes(String(type ?? '').toLowerCase());
  const surface = /\bmobile\/|src\/app\/|src\/components\/|surfaces\//.test(files);
  const sec = /entitlement|auth|stripe|metered/i.test(files);
  return {
    code,
    plan: ['plan-review-deepseek', ...(code && surface ? ['ux'] : []), ...(code ? ['error-paths'] : []), ...(code && sec ? ['security'] : [])],
    out: [...(code ? ['code-review'] : []), ...(code && surface ? ['ux'] : []), ...(code ? ['error-paths'] : []), ...(code && sec ? ['security'] : [])],
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
  if (letter !== undefined) {
    const id = table.increment_docs?.[letter];
    if (!id) return { error: `refused: no increment requirements document for milestone group [${letter}] in increment_docs of scripts/analysis/rule-lists.json` };
    add(id, 'increment', 'every task also gets the requirements document of its increment (the milestone group letter)');
  }
  return result;
}

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
function splitUnits(text, max, label, id) {
  if (text.length <= max) return [text];
  const subs = headings(text).filter((h) => h.offset > 0);
  if (subs.length === 0) throw new Error(`list ${id}: section "${label}" is ${text.length} characters and has no deeper heading to split at (room for list text in one file: ${max})`);
  const level = Math.min(...subs.map((h) => h.level));
  const cuts = [0, ...subs.filter((h) => h.level === level).map((h) => h.offset), text.length];
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const chunk = text.slice(cuts[i], cuts[i + 1]);
    if (chunk.trim()) out.push(...splitUnits(chunk, max, `${label} > ${chunk.split('\n', 1)[0].trim().slice(0, 60)}`, id));
  }
  return out;
}
/** The lens input files for one list: [{suffix, text}]. The list part comes first, whole; the material follows. Throws when a part cannot fit (never trims). */
export function buildLensInputs({ id, list, root, material, templateFile, max = Number(process.env.DEEPSEEK_REVIEW_MAX_CHARS) || BOUND }) {
  const rt = createRequire(import.meta.url)(path.join(REPO, 'scripts/lib/review-template.js'));
  const split = rt.splitTemplate(fs.readFileSync(templateFile, 'utf8'));
  const sys = (split.systemInstruction ?? "You are a focused reviewer. Follow the prompt's output format strictly.").length;
  const k = (split.userTemplate.match(/\{\{PLAN\}\}/g) ?? []).length || 1;
  const fixed = sys + rt.substitutePlaceholders(split.userTemplate, { plan: '', specs: '(no pasted context provided)', dataContext: '(no live-DB context provided)' }).length;
  const avail = Math.floor((max - fixed - 200) / k);
  const unitMax = avail - material.length - RESERVE;
  if (unitMax < 200) throw new Error(`material is ${material.length} characters; with the lens template (${fixed} fixed characters, the plan placeholder used ${k}x) at most ${avail} characters fit one file, leaving ${unitMax} for the list: split the material (a list is never trimmed)`);
  const units = listBlocks(list, root, id).flatMap((b) => splitUnits(b.text, unitMax, b.label, id));
  const parts = [];
  let cur = [];
  let len = 0;
  for (const u of units) {
    if (cur.length && len + u.length + 1 > unitMax) { parts.push(cur.join('\n')); cur = []; len = 0; }
    cur.push(u); len += u.length + 1;
  }
  if (cur.length) parts.push(cur.join('\n'));
  const sel = list.whole ? 'whole file' : `sections ${list.sections.join('; ')}`;
  const files = parts.map((p, i) => {
    const head = `RULE LIST ${id} (${list.file}, ${sel}), part ${i + 1} of ${parts.length}. Judge the material under review against the rules in this part; the other parts of the same list are reviewed in their own runs.`;
    const stamp = `LIST ${id} sha256:${sha256(Buffer.from(p))} material sha256:${sha256(Buffer.from(material))} part ${i + 1} of ${parts.length}`;
    const text = `${stamp}\n${head}\n\n${p}${MARKER}${material}\n`;
    const prompt = sys + rt.substitutePlaceholders(split.userTemplate, { plan: text, specs: '(no pasted context provided)', dataContext: '(no live-DB context provided)' }).length;
    if (prompt > max) throw new Error(`list ${id}: part ${i + 1} would be ${prompt} characters, over the ${max} bound`);
    return { suffix: parts.length === 1 ? '' : `-p${i + 1}`, text };
  });
  return files;
}

/**
 * Read a lens input file back: {id, listSha, materialSha, part, parts, listPart, material} or null when it is not one. The close check recomputes the hashes from the text,
 * and checks that the parts of a list together carry the WHOLE list (whitespace aside), so a list cannot be shortened or softened and re-stamped.
 */
export function parseLensInput(text) {
  const m = /^LIST (\S+) sha256:([0-9a-f]{64}) material sha256:([0-9a-f]{64}) part (\d+) of (\d+)\n/.exec(text);
  if (!m) return null;
  const l1 = text.indexOf('\n', text.indexOf('\n') + 1);
  const mi = text.indexOf(MARKER);
  if (l1 < 0 || mi < 0) return null;
  const listPart = text.slice(l1 + 2, mi);
  const material = text.slice(mi + MARKER.length).replace(/\n$/, '');
  return { id: m[1], listSha: m[2], materialSha: m[3], part: Number(m[4]), parts: Number(m[5]), listPart, material, ok: sha256(Buffer.from(listPart)) === m[2] && sha256(Buffer.from(material)) === m[3] };
}
/** The text of a whole list as the helper reads it (all blocks), for the whole-list comparison. */
export const wholeListText = (list, root, id) => listBlocks(list, root, id).map((b) => b.text).join('');

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
    const list = table.lists[id];
    if (!list) die(1, `no list ${id} in ${tableFile}`);
    const matFile = str('material', ''); const outPrefix = str('out', '');
    if (!matFile || !outPrefix || !fs.existsSync(matFile)) die(2, 'usage: lens-input --list <id> --material <file> --out <prefix> [--template <lens file>] [--max <n>]');
    if (a.max !== undefined && !(Number.isFinite(Number(a.max)) && Number(a.max) > 0)) die(1, `--max must be a positive number (got ${a.max}); the bound has to be enforced`);
    let files;
    try { files = buildLensInputs({ id, list, root, material: fs.readFileSync(matFile, 'utf8'), templateFile: path.resolve(str('template', path.join(REPO, '.claude/review-templates/lens-compliance.md'))), ...(a.max ? { max: Number(a.max) } : {}) }); } catch (e) { die(1, e.message); }
    const dir = path.dirname(path.resolve(outPrefix)); const base = path.basename(outPrefix);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (f === `${base}.txt` || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-p\\d+\\.txt$`).test(f)) fs.rmSync(path.join(dir, f));
    for (const f of files) { const p = path.join(dir, `${base}${f.suffix}.txt`); fs.writeFileSync(p, f.text); console.log(p); }
  } else if (cmd === 'findings') {
    const dir = str('dir', '');
    if (!dir || !fs.existsSync(dir)) die(2, 'usage: findings --dir <lane report dir>');
    const files = fs.readdirSync(dir).filter(isLensOutput).sort().map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
    for (const f of files) console.log(ruledLine(f.name, f.text));
    for (const f of findingsIn(files)) console.log(`${f.id}\t${f.line}`);
  } else die(2, 'usage: rule-lists.mjs validate | resolve | lens-input | findings');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
