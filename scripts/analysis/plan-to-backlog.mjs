#!/usr/bin/env node
// plan-to-backlog: the one-time loader of the increment plan into Backlog.md (Backlog-home plan v8.1, sections 1 and 2; step R3).
// Reads ONLY the committed snapshot folder (docs/reports/plan-import/raw/<date>/, byte copies + SHA256SUMS, verified first), builds the whole
// model in memory (an unknown status word, an unmapped who or a wrong count exits 1 before anything is created), then: backlog init into
// <target>/backlog.tmp/, config, milestones, docs, decisions, BL.0, tasks in topological order (--depends-on task-N), dated notes,
// backlog doctor, move to <target>/backlog/, import report. Refuses if backlog/ exists. Run once; there is no re-import mode.
// Flags follow docs/reports/plan-import/FLAGS.md (Backlog.md 1.55.3): dependencies as task-N, zero_padded_ids: 0, the config key `types:`,
// decision create takes a title and -s only (the body is written into the file), refs carry no commas, the milestone is checked here.
// AC per kind and the definition of done come from docs/reports/plan-import/process-tables.md, never from literals in this file.
// Rules: Spec 137 section 4 rule 2 (137_mcqueue.md:81), rule 3 (:84), rule 4 (:87), rule 7 (:98), rule 12 (:115); RR-0205, RR-0207, RR-0212.
// Usage: node scripts/analysis/plan-to-backlog.mjs --raw <dir> --target <dir> --report <file> [--origin-root <dir>] [--scratch-root <dir>]
//        [--expect <tasks>,<drafts>] [--backlog-bin <bin>] [--tables <process-tables.md>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeDecisionBody } from './backlog-decision.mjs';
import { args, backlogBin, bl, die, home, norm, REPO, sha12, sha256 } from './backlog-lib.mjs';

const a = args();
for (const k of ['raw', 'target', 'report']) if (!a[k] || a[k] === true) die(`plan-to-backlog: --${k} is required`);
const raw = path.resolve(a.raw); const target = path.resolve(a.target); const reportFile = path.resolve(a.report);
const originRoot = path.resolve(a['origin-root'] || REPO); const scratchRoot = path.resolve(a['scratch-root'] || path.join(os.homedir(), 'Buildo-scratch'));
const tablesFile = path.resolve(a.tables || path.join(REPO, 'docs/reports/plan-import/process-tables.md'));
if (fs.existsSync(path.join(target, 'backlog'))) die(`plan-to-backlog: refused, backlog/ already exists in ${target}; the loader runs once and has no re-import mode`);

// ---- step 0: the snapshot is the input; verify every hash first ------------------------------------------------------------------------------
const sums = path.join(raw, 'SHA256SUMS');
if (!fs.existsSync(sums)) die(`plan-to-backlog: ${sums} missing; the snapshot folder must carry SHA256SUMS`);
for (const line of fs.readFileSync(sums, 'utf8').split('\n').filter(Boolean)) {
  const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
  if (!m) die(`plan-to-backlog: bad SHA256SUMS line: ${line}`);
  const f = path.join(raw, m[2]);
  if (!fs.existsSync(f)) die(`plan-to-backlog: SHA256SUMS names ${m[2]} but the file is missing`);
  if (sha256(fs.readFileSync(f)) !== m[1]) die(`plan-to-backlog: sha256 mismatch for ${m[2]}: the snapshot was changed after it was committed`);
}
const readJson = (n) => JSON.parse(fs.readFileSync(path.join(raw, n), 'utf8'));
const readText = (n) => fs.readFileSync(path.join(raw, n), 'utf8');
const seq = readJson('sequence.json'); const status = readJson('status.json'); const register = readJson('rulings-register.json');
const briefs = readJson('briefs.json'); const foundations = readJson('foundations-brief.json'); const searchBrief = readJson('search-brief.json');
const storage = readJson('storage-by-group.json'); const elements = readJson('elements-by-inc.json'); const built = readJson('built.json');
const matrix = readJson('matrix-verified.json'); const current = readJson('current.json'); const bl0 = readJson('BL0.json');
const queues = { 'MCBYLAWS-QUEUE.md': readText('MCBYLAWS-QUEUE.md'), 'MCFRONTEND-QUEUE.md': readText('MCFRONTEND-QUEUE.md') };
const snapshotDate = String(status.generated).slice(0, 10);
const rawRel = `docs/reports/plan-import/raw/${snapshotDate}`;
const plusDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// ---- process tables: the AC per kind (C2) and the definition of done (C1) -----------------------------------------------------------------------
function parseTable() {
  const text = fs.readFileSync(tablesFile, 'utf8');
  const dod = []; const acByKind = {}; let sect = ''; let kind = '';
  for (const line of text.split('\n')) {
    if (/^## C1\./.test(line)) { sect = 'C1'; continue; }
    if (/^## C2\./.test(line)) { sect = 'C2'; continue; }
    const k = /^### ([\w-]+)/.exec(line); if (k && sect === 'C2') { kind = k[1].toLowerCase(); continue; }
    const m = /^- ([\w.-]+) \((.+?)\) "(.+)" — (.+)$/.exec(line);
    if (!m) continue;
    const file = /^(\S+?) §/.exec(m[2])?.[1] ?? m[2].split(' ')[0]; const ln = /; :(\d+)/.exec(m[2])?.[1];
    const text2 = `${m[4]} — "${m[3]}" (${file}${ln ? `:${ln}` : ''})`;
    if (sect === 'C1' && /^D\d+$/.test(m[1])) dod.push(text2); else if (sect === 'C2') (acByKind[kind] ??= []).push(text2);
  }
  if (dod.length < 10) die(`plan-to-backlog: ${tablesFile} gives ${dod.length} definition-of-done rules, expected 10`);
  return { dod, acByKind };
}
const tables = parseTable();

// ---- the model ---------------------------------------------------------------------------------------------------------------------------------
const CLOSED_STATUS = new Set(['DONE', 'DROPPED', 'MERGED']);
const NINE = ['LATER', 'WAITS', 'RUNNING', 'BUILT', 'OPERATOR', 'MERGED', 'FROZEN', 'DROPPED', 'DONE'];
// First-word table (plan section 1, locked by the census fixture of the 36 words of the snapshot, plus RUNNING and FROZEN).
const WORDS = {
  closed: new Set(['FOLDED', 'MERGE', 'MERGED', 'DROP', 'DROPPED', 'FROZEN', 'HELD', 'NEW', 'DRAFTED', 'proposed']),
  typed: { WAITING: 'WAITS', WAITS: 'WAITS', BLOCKED: 'WAITS', OPERATOR: 'OPERATOR', RUNNING: 'RUNNING', WRITING: 'RUNNING', DONE: 'DONE', LATER: 'LATER' },
  unverified: new Set(['NOT', 'PLANNED', 'RULED', 'DEFERRED', 'queue', 'operator', 'OPEN', '+', 'READY', 'CONFIRMED-WITH-CHANGE', 'CONFIRMED', 'storage', 'R1', 'read-only', 'R-D', 'ruling', 'process', '', 'RE-DATE', 'SERIES']),
  conditional: 'CONDITIONAL',
};
const groups = seq.increments.map((g) => ({ id: g.id, name: g.name }));
const items = [];
for (const g of seq.increments) g.items.forEach((it, i) => items.push({ ...it, g: g.id, pos: i + 1 }));
{ const b = { ...bl0, g: bl0.group, pos: 0, sources: bl0.sources ?? [], bl0: true }; items.unshift(b); }
const byKey = new Map();
for (const it of items) { byKey.set(String(it.number), it); }
for (const it of items) if (!byKey.has(String(it.id))) byKey.set(String(it.id), it);
const resolveKey = (k) => byKey.get(String(k));

// queue rows: head `**MB-90 ...` then the first `Status:` line.
const rows = new Map();
for (const [file, text] of Object.entries(queues)) {
  const ls = text.split('\n');
  ls.forEach((l, i) => {
    const h = /^\*\*((?:MB|MF)-\d+[a-z]?)[ ·]/.exec(l); if (!h) return;
    let st; for (let j = i + 1; j < Math.min(ls.length, i + 12) && !/^\*\*(?:MB|MF)-/.test(ls[j]); j++) if (/^Status:/.test(ls[j])) { st = ls[j]; break; }
    const word = /^Status:\s*([A-Za-z]+)/.exec(st ?? '')?.[1]; const exp = /expires\s+([^·]+?)\s*(?:·|$)/.exec(st ?? '')?.[1];
    if (!rows.has(h[1])) rows.set(h[1], { id: h[1], file, line: i + 1, word, expires: exp, head: l, status: st });
  });
}

function assignee(it) {
  const w = String(it.who ?? '').trim(); const lw = w.toLowerCase();
  if (lw === 'lane') return '@lane'; if (lw === 'operator') return '@operator'; if (lw === 'runner') return '@runner';
  const letter = /\blane \(([A-Z])\)/.exec(w) ?? /\blane ([A-Z])\b(?!-)/.exec(w) ?? /\(([A-Z])\)/.exec(w);
  if (letter && /\blane\b/i.test(w)) return `@lane-${letter[1]}`;
  if (/^operator\b/i.test(w)) return '@operator'; if (/^runner\b/i.test(w)) return '@runner';
  if (/\blane\b/i.test(w)) return '@lane';
  die(`plan-to-backlog: unmapped who "${w}" on item ${it.id}: not in the assignee table`);
}
const idTokens = (text) => String(text).match(/[A-Za-z0-9][A-Za-z0-9.:_-]*[A-Za-z0-9]/g)?.map((t) => t.replace(/[.:]+$/, '')) ?? [];

const notes = [];
for (const it of items) {
  const text = String(it.status ?? ''); const first = /^([^\s:;,(]*)/.exec(text)[1];
  it.first = first; it.labels = []; it.comments = []; it.merged = null;
  const known = WORDS.closed.has(first) || first in WORDS.typed || WORDS.unverified.has(first) || first === WORDS.conditional;
  if (!known) die(`plan-to-backlog: unknown status word "${first}" on item ${it.id} (status text: ${text.slice(0, 80)}); extend the table with a ruling, never guess`);
  const quote = /"([^"]+)"/.exec(text)?.[1];
  const ev = status.tasks?.[it.id]?.status;
  it.rung = ev ?? null; if (ev) it.labels.push(`evidence:${String(ev).toLowerCase()}`);
  const row = (String(it.sources ?? []).match(/ROW:((?:MB|MF)-\d+[a-z]?)/) ?? [])[1];
  it.row = row && rows.has(row) ? rows.get(row) : null;
  let st; let draft = false;
  if (['FOLDED', 'MERGE', 'MERGED'].includes(first)) {
    const tk = /\binto\s+([^\s,;()]+)/.exec(text)?.[1]?.replace(/[.:]+$/, ''); const tgt = tk ? resolveKey(tk) : undefined;
    if (!tgt || tgt === it) { st = 'LATER'; it.labels.push('unverified'); notes.push({ kind: 'selffold', it, text }); } else { st = 'MERGED'; it.mergeTarget = tgt; }
  } else if (['DROP', 'DROPPED', 'FROZEN'].includes(first)) {
    const w = first === 'FROZEN' ? 'FROZEN' : 'DROPPED';
    if (quote) { st = w; it.ruling = quote; } else { st = 'WAITS'; it.labels.push('held-unruled'); notes.push({ kind: 'held', it, text }); it.comments.push(`The plan text reads "${text.slice(0, 160)}" but no operator ruling is on file for ${w}; the operator rules it (Spec 137 line 54: ruling quotes the operator's words).`); }
  } else if (first === 'HELD') {
    st = 'WAITS'; it.labels.push('held-unruled'); notes.push({ kind: 'held', it, text });
    it.comments.push(`The plan text reads "${text.slice(0, 160)}"; no ruling is on file, so none is invented. Open question for the operator.`);
  } else if (['NEW', 'DRAFTED', 'proposed'].includes(first) && !(it.row?.word && NINE.includes(it.row.word))) { draft = true; st = 'LATER'; }
  else {
    const rw = it.row?.word && NINE.includes(it.row.word) ? it.row.word : null;
    if (rw) { st = rw; if (rw !== (WORDS.typed[first] ?? 'LATER')) notes.push({ kind: 'mirror', it, text, rowWord: rw }); }
    else if (['DONE', 'LANDED'].includes(ev)) st = 'DONE';
    else if (['BUILT', 'VERIFIED', 'REHEARSED'].includes(ev)) st = 'BUILT';
    else if (first === WORDS.conditional) {
      const ids = [...new Set(idTokens(text.slice(first.length)).filter((t) => resolveKey(t) && resolveKey(t) !== it))];
      if (ids.length) { st = 'WAITS'; it.when = ids; } else st = 'OPERATOR';
    } else if (first in WORDS.typed) st = WORDS.typed[first];
    else { st = 'LATER'; it.labels.push('unverified'); }
  }
  it.draft = draft; it.st = st;
  if (it.row) it.labels.push('queue-row');
}
// A MERGED target that is itself merged: follow the chain; a cycle is a self-fold.
for (const it of items) { let t = it.mergeTarget; let n = 0; while (t?.mergeTarget && n++ < 20) t = t.mergeTarget; if (t) it.mergeTarget = t; if (it.mergeTarget === it) { it.st = 'LATER'; it.mergeTarget = null; it.labels.push('unverified'); } }

// ---- dependencies ----------------------------------------------------------------------------------------------------------------------------------
const edgeReport = { repointed: [], removed: [], dangling: [], cycle: [] };
for (const it of items) {
  it.deps = [];
  for (const k of it.dependsOn ?? []) {
    let t = resolveKey(k);
    if (!t) { edgeReport.dangling.push({ it, k }); it.labels.push('dep-dropped'); it.danglingDeps = [...(it.danglingDeps ?? []), k]; continue; }
    if (t.mergeTarget) { const to = t.mergeTarget; edgeReport.repointed.push({ it, from: t, to }); (it.later ??= []).push(to); continue; }
    if (t.st === 'DROPPED') { edgeReport.removed.push({ it, k, t }); it.labels.push('dep-dropped'); continue; }
    if (t === it) continue;
    if (!it.deps.includes(t)) it.deps.push(t);
  }
}
// Re-pointed edges are added last; one that would close a cycle (the merge target already waits on the dependent) is dropped and listed.
const reaches = (from, goal, seen = new Set()) => from === goal || (!seen.has(from) && (seen.add(from), from.deps.some((d) => reaches(d, goal, seen))));
for (const it of items) for (const to of it.later ?? []) {
  if (to === it || it.deps.includes(to)) continue;
  if (to.st === 'DROPPED') { it.labels.push('dep-dropped'); continue; }
  if (reaches(to, it)) { edgeReport.cycle.push({ it, to }); it.labels.push('dep-dropped'); continue; }
  it.deps.push(to);
}
// topological order: dependencies first, otherwise the plan order (the merged-into line is patched in after creation, so it adds no ordering).
const order = []; const placed = new Set();
const prereq = (it) => it.deps;
while (order.length < items.length) {
  const next = items.find((it) => !placed.has(it) && prereq(it).every((p) => placed.has(p)));
  if (!next) {
    const stuck = items.filter((i) => !placed.has(i)); const seen = []; let cur = stuck[0];
    while (cur && !seen.includes(cur)) { seen.push(cur); cur = prereq(cur).find((p0) => !placed.has(p0)); }
    die(`plan-to-backlog: dependency cycle: ${[...seen.slice(seen.indexOf(cur)), cur].map((i) => i?.id).join(' -> ')} (after re-pointing folded edges; ${stuck.length} items stuck)`);
  }
  placed.add(next); order.push(next);
}

// ---- fields ------------------------------------------------------------------------------------------------------------------------------------------
function priority(it) {
  const p = /^push (\d+)([a-z]?)/.exec(String(it.landingPush ?? '')); const n = p ? Number(p[1]) : null;
  if (it.criticalPath || (n !== null && n <= 7)) return 'High';
  if (n === 8 || (n === 9 && p[2] !== 'b' && !(p[2] > 'a'))) return 'Medium';
  return 'Low';
}
const QUEUE_PROJECT = { MB: 'McBylaws', MF: 'McFrontend' };
for (const it of order) {
  it.assignee = assignee(it);
  it.type = String(it.kind ?? 'build').toLowerCase();
  it.project = it.row ? QUEUE_PROJECT[it.row.id.slice(0, 2)] : 'McIncrement';
  it.priority = priority(it);
  const gi = groups.findIndex((g) => g.id === it.g); it.ordinal = (gi + 1) * 1000 + it.pos;
  it.open = !it.draft && !['DONE', 'DROPPED', 'MERGED', 'FROZEN'].includes(it.st);
  const rowDate = /^\d{4}-\d{2}-\d{2}$/.test(it.row?.expires ?? '') ? it.row.expires : null;
  it.due = it.open && !it.when ? (rowDate ?? plusDays(snapshotDate, 7)) : null;
  it.ac = it.bl0 ? bl0.acceptanceCriteria : (tables.acByKind[it.type] ?? []);
  if (!it.ac.length) die(`plan-to-backlog: no acceptance criteria for kind "${it.type}" in ${tablesFile}`);
  const codes = briefs.groups?.[it.g]?.compliance_tasks?.[String(it.number)] ?? [];
  for (const c of codes) it.labels.push(`comp:${typeof c === 'string' ? c : c.code ?? c.id}`);
  const serves = /\bserves?:\s*([A-Za-z ,-]+)/i.exec([...(it.planNotes ?? []), it.note ?? ''].join(' '))?.[1];
  for (const p of ['standardization', 'observability', 'scalability', 'accuracy', 'understandability']) if (serves && serves.toLowerCase().includes(p.slice(0, 6))) it.labels.push(`serves:${p}`);
}
const expectTasks = order.filter((i) => !i.draft).length; const expectDrafts = order.filter((i) => i.draft).length;
if (a.expect && a.expect !== true) {
  const [et, ed] = String(a.expect).split(',').map(Number);
  if (et !== expectTasks || ed !== expectDrafts) die(`plan-to-backlog: expected ${et} task files and ${ed} drafts but the plan gives ${expectTasks} and ${expectDrafts}; nothing was created`);
}

// ---- refs ---------------------------------------------------------------------------------------------------------------------------------------------
const resolution = { resolved: 0, quoteDiffers: 0, tags: 0, missing: 0 }; const missingRefs = [];
function resolveSource(s0) {
  const s = String(s0).trim();
  const row = /^ROW:((?:MB|MF)-\d+[a-z]?)$/.exec(s);
  if (row && rows.has(row[1])) { const r = rows.get(row[1]); return { ref: `.cursor/${r.file}#L${r.line} sha256=${sha12(r.head)} ROW:${r.id}` }; }
  if (/^[A-Za-z0-9+_.-]+:[^\s/~]+$/.test(s)) return { tag: s };
  const o = /^origin[: ]\s*(\S+?)(?::(\d+)(?:-(\d+))?)?(?:[ ,;].*)?$/.exec(s); const h = /^(~\/\S+?)(?::(\d+)(?:-(\d+))?)?(?:[ ,;].*)?$/.exec(s);
  const bare = o || h ? null : /^(\.?[\w.-]+(?:\/[\w.@+-]+)+)(?::(\d+)(?:-(\d+))?)?\s*$/.exec(s);
  const m = o ?? h ?? bare; if (!m) return { missing: 'form not recognised' };
  const shown = o ? m[1] : m[1]; let file;
  if (o || bare) file = path.join(originRoot, m[1]); else if (m[1].startsWith('~/Buildo-scratch/')) file = path.join(scratchRoot, m[1].slice('~/Buildo-scratch/'.length)); else file = home(m[1]);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { missing: `file not found: ${shown}` };
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const from = m[2] ? Number(m[2]) : null; const to = m[3] ? Number(m[3]) : from;
  if (from === null) return { ref: `${shown} sha256=${sha12(fs.readFileSync(file, 'utf8'))}` };
  if (from < 1 || to > lines.length) return { missing: `line ${from} is outside ${shown} (${lines.length} lines)` };
  const cited = lines.slice(from - 1, to).join('\n'); const q = /"([^"]{3,})"/.exec(s)?.[1];
  const differs = q && !norm(cited).includes(norm(q).replace(/\.\.\.$/, '').slice(0, 60));
  return { ref: `${shown}#L${from}${to !== from ? `-${to}` : ''} sha256=${sha12(cited)}`, differs };
}
for (const it of order) {
  it.refs = [`${rawRel}/sequence.json#${it.g}/${it.id}`]; it.tags = [];
  const srcs = [...(it.sources ?? []), ...(it.evidence_refs ?? [])];
  for (const e of Array.isArray(it.evidence) ? it.evidence : []) if (e?.path) srcs.push(`${e.path}:${e.line ?? ''}`.replace(/:$/, ''));
  for (const e of status.tasks?.[it.id]?.evidence ?? []) if (/^(origin|~\/)|\//.test(String(e.ref ?? ''))) srcs.push(String(e.ref));
  for (const s of srcs) {
    const r = resolveSource(s);
    if (r.ref) { resolution.resolved++; if (r.differs) resolution.quoteDiffers++; if (!it.refs.includes(r.ref)) it.refs.push(r.ref); }
    else if (r.tag) { resolution.tags++; it.tags.push(r.tag); }
    else { resolution.missing++; missingRefs.push({ it, s, why: r.missing }); if (!it.labels.includes('missing-ref')) it.labels.push('missing-ref'); }
  }
  if (it.row) { it.refs = it.refs.filter((r) => !r.includes(`ROW:${it.row.id}`)); it.refs.splice(1, 0, resolveSource(`ROW:${it.row.id}`).ref); it.refs = [...new Set(it.refs)]; }
  it.refs = it.refs.map((r) => r.replace(/,/g, ';'));
}

// ---- decisions, docs, milestones, descriptions ----------------------------------------------------------------------------------------------------
const rulings = register.rows.filter((r) => r.source === 'operator' && r.kind === 'ruling');
const readings = register.rows.filter((r) => r.source === 'reading'); const entries = register.rows.filter((r) => r.source === 'entry');
for (const r of rulings) {
  const named = new Set(); for (const t of idTokens(`${r.text} ${r.topic ?? ''}`)) { const it = resolveKey(t); if (it && !/^\d+$/.test(t)) named.add(it); }
  r.named = [...named];
}
const MS_NAME = { F: 'Increment 1·A Foundations', S: 'Increment 1·B Search', '1-2': 'Increment 1·C Launch-shared parts', 1: 'Increment 1·D Detached house + shared report page' };
const msTitle = (g) => `${MS_NAME[g.id] ?? briefs.groups?.[g.id]?.title ?? g.name} [${g.id}]`;
const cq = (x) => (x ? `${x.text} (${x.cite}) "${x.quote}"` : '');
function milestoneBody(g) {
  const b = briefs.groups?.[g.id]; const L = [];
  L.push(`${b?.title ?? g.name}`, '');
  const sect = (h, arr) => { if (arr?.length) L.push(`## ${h}`, ...arr.map((x) => `- ${cq(x)}`), ''); };
  if (g.id === 'F' || g.id === 'S') { const f = g.id === 'F' ? foundations : searchBrief; sect('Objectives', f.inc); sect('Deliverable', f.deliverable); if (f.specs?.length) L.push('## Specs', ...f.specs.map((s) => `- ${s.name}: ${s.path_or_link}${s.why ? ` (${s.why})` : ''}`), ''); }
  else if (b) { sect('Problems', b.problems); sect('Project objectives', b.objectives_project); sect('Increment objectives', b.objectives_inc); sect('Deliverable', b.deliverable); if (b.specs?.length) L.push('## Specs', ...b.specs.map((s) => `- ${s.name}: ${s.path_or_link}${s.why ? ` (${s.why})` : ''}`), ''); sect('Rulings', (b.rulings ?? [])); if (b.problems_note) L.push(`Note: ${b.problems_note}`, ''); }
  else L.push('No increment brief exists for this group in the snapshot (briefs.json); stated, not filled.', '');
  const sg = storage.groups?.[g.id]; if (sg) { L.push('## Storage set-up', ...(sg.lines ?? []).map((x) => `- ${cq(x)}`), ...(sg.st ?? []).map((x) => `- ${cq(x)}`), ''); }
  const rr = rulings.filter((r) => (r.groups ?? []).includes(g.id));
  if (rr.length) L.push('## Register rulings of this group (operator words)', ...rr.map((r) => `- ${r.id} ${r.date}: ${r.text} (${r.cite}) "${r.quote}"`), '');
  const legend = briefs.legend ?? {}; const codes = [...new Set(Object.values(b?.compliance_tasks ?? {}).flat())];
  if (codes.length) L.push('## Compliance codes in use', ...codes.map((c) => `- ${c}: ${legend[c]?.name ?? '?'} (${legend[c]?.cite ?? ''})`), '');
  return L.join('\n');
}
const arr = (x) => [].concat(x ?? []);
const esc = (x) => String(x ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
function incrementDoc(g) {
  const e = elements[g.id]; const bu = built.elements?.[g.id] ?? {}; const L = [`# Increment ${g.id} requirements`, '', `Source: elements-by-inc.json, built.json (as of origin ${built.origin_tip}), matrix-verified.json, current.json of the snapshot ${rawRel}.`, ''];
  if (built.groups?.[g.id]) { const bg = built.groups[g.id]; L.push(`## Built state`, bg.summary ?? '', `counts: ${JSON.stringify(bg.counts ?? {})}`, ''); for (const c of bg.components ?? []) L.push(`- ${c.id} ${c.name}: ${c.state}`); L.push(''); }
  if (e) { L.push(`## Scenario`, e.scenario ?? '', '', '## Elements', '| id | element | where | status | deliverers | built |', '|---|---|---|---|---|---|', ...(e.rows ?? []).map((r) => `| ${esc(r.id)} | ${esc(r.element ?? r.name)} | ${esc(r.where)} | ${esc(r.status)} | ${esc(arr(r.tasks).map(String).join(' '))} | ${esc(bu[r.id]?.fe ?? '')} |`), ''); }
  else L.push('## Elements', 'No report elements of its own in elements-by-inc.json for this group.', '');
  const sc = (matrix.scenarios ?? []).filter((s) => String(s.inc) === g.id);
  if (sc.length) L.push('## Scenarios (matrix-verified.json)', ...sc.map((s) => `- ${s.scenario}: cards ${(s.card_ids ?? []).join(' ')}; rows per category ${Object.entries(s.categories ?? {}).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : v}`).join(' ')}`), '');
  if (g.id === 'S' && current.length) L.push('## Search pages today (search-delta/current.json)', '| page | id | element | status | tasks |', '|---|---|---|---|---|', ...current.map((r) => `| ${esc(r.page)} | ${esc(r.id)} | ${esc(r.element)} | ${esc(r.status)} | ${esc(arr(r.tasks).map(String).join(' '))} |`), '');
  return L.join('\n');
}
function readingsDoc() {
  const L = ['# Orchestrator readings (not rulings)', '', 'Readings and register entries of the rulings register. They are NOT the operator\'s words as a ruling and never feed a review as a ruling (Spec 137 rule 10; register rule of 2026-11-18). The operator\'s rulings are the decisions.', '', '## Readings'];
  for (const r of readings) L.push(`- ${r.id} ${r.date ?? ''} ${r.topic ?? ''}: ${r.text ?? ''} (${r.cite ?? ''})`);
  L.push('', '## Register entries (operator words as logged, kind entry)'); for (const r of entries) L.push(`- ${r.id} ${r.date ?? ''}: "${r.quote ?? ''}" (${r.cite ?? ''})`);
  return L.join('\n') + '\n';
}
const incDocs = groups.map((g) => ({ title: `Increment ${g.id} requirements`, body: incrementDoc(g), sub: 'increments', g }));
const docsPlan = [...incDocs, { title: 'McStorage policy v2', body: readText('McSTORAGE-POLICY-v2.md') }, { title: 'Orchestrator readings (not rulings)', body: readingsDoc() }];

function describe(it) {
  const L = [];
  if (`${it.number} ${it.title}`.length > 90) L.push(`Full title: ${it.number} ${it.title}`, '');
  if (it.ruling) L.push(`ruling: ${it.ruling}`);
  if (it.when) L.push(`when: ${it.when.join(', ')} DONE`);
  if (it.mergeTarget) L.push(`merged-into: pending`);
  L.push(`snapshot: ${rawRel}/ (sequence.json sha256 ${sha256(fs.readFileSync(path.join(raw, 'sequence.json'))).slice(0, 12)})`);
  if (it.hours) L.push(`Estimate: ${it.hours}`);
  L.push('', `Plan text at the snapshot: ${it.status}`);
  if (it.landingPush) L.push(`landingPush: ${it.landingPush}`); if (it.slicePart) L.push(`slicePart: ${it.slicePart}`);
  for (const n of it.planNotes ?? []) L.push(`planNote: ${n}`); if (it.note) L.push(`note: ${it.note}`);
  L.push(`who (plan text): ${it.who}`);
  const els = (elements[it.g]?.rows ?? []).filter((r) => arr(r.tasks).map(String).includes(String(it.number)) || arr(r.tasks).map(String).includes(String(it.id))).map((r) => r.id);
  if (els.length) L.push(`element ids delivered: ${els.join(', ')}`);
  if (it.row) L.push(`queue row: ${it.row.id} (row status ${it.row.status?.replace(/^Status:\s*/, '') ?? 'none'}); the row stays the record (Spec 137 rule 2) and the lane edits the row and this task in the same commit (rule 3)`);
  if (it.danglingDeps?.length) L.push(`dependency not a plan task, dropped: ${it.danglingDeps.join(', ')}`);
  if (it.tags.length) L.push(`plan source tags: ${it.tags.join(' ')}`);
  return L.join('\n');
}

// ---- the build -------------------------------------------------------------------------------------------------------------------------------
const bin = backlogBin(target, a['backlog-bin']);
const tmp = path.join(target, 'backlog.tmp');
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
const fail = (what, r) => { die(`plan-to-backlog: ${what} failed (exit ${r.status}): ${r.stdout}${r.stderr}`); };
const B = (argv, what) => { const r = bl(bin, tmp, argv); if (r.status !== 0) fail(what ?? argv.slice(0, 3).join(' '), r); return r; };
if (spawnGit(['rev-parse', '--is-inside-work-tree']).status !== 0) spawnGit(['init', '-q', '.']);
function spawnGit(g) { return bl('git', tmp, g); }
B(['init', 'McIncrement plan', '--defaults', '--agent-instructions', 'none', '--zero-padded-ids', '0', '--check-branches', 'false', '--auto-open-browser', 'false', '--web-port', '6421'], 'backlog init');
// config (the loader owns the whole file; FLAGS.md: types key, zero_padded_ids 0, auto_commit false)
fs.writeFileSync(path.join(tmp, 'backlog/config.yml'), [
  'project_name: "McIncrement plan"', 'default_status: "LATER"', `statuses: [${NINE.map((s) => `"${s}"`).join(', ')}]`, 'labels: []', 'date_format: yyyy-mm-dd', 'max_column_width: 20',
  'auto_open_browser: false', 'default_port: 6421', 'remote_operations: false', 'auto_commit: false', 'filesystem_only: false', 'bypass_git_hooks: false', 'check_active_branches: false',
  'active_branch_days: 30', 'task_prefix: "task"', 'zero_padded_ids: 0',
  `types: [${['build', 'record', 'decision', 'check', 'push', 'db-rehearsal', 'db-go', 'night', 'fix', 'db-run'].map((s) => `"${s}"`).join(', ')}]`,
  'projects: ["McBylaws", "McFrontend", "McIncrement"]', 'definition_of_done:', ...tables.dod.map((d) => `  - ${JSON.stringify(d)}`), '',
].join('\n'));
// milestones
const msIds = new Map();
for (const g of groups) { const r = B(['milestone', 'add', msTitle(g), '-d', milestoneBody(g)], `milestone ${g.id}`); msIds.set(g.id, /\((m-\d+)\)/.exec(r.stdout)?.[1]); }
// docs
const docPaths = new Map(); const docIds = [];
for (const d of docsPlan) {
  const r = B(['doc', 'create', d.title, '-t', 'specification', ...(d.sub ? ['-p', d.sub] : []), '--plain'], `doc create ${d.title}`);
  const id = /(doc-\d+)/i.exec(r.stdout)?.[1]; const p = /Path:\s*(\S.*)$/m.exec(r.stdout)?.[1]?.trim();
  B(['doc', 'update', id, '--content', d.body.length > 400000 ? `${d.body.slice(0, 400000)}\n(truncated)` : d.body], `doc update ${id}`);
  docIds.push({ id, title: d.title, bytes: d.body.length }); if (d.g) docPaths.set(d.g.id, p);
}
// decisions
const decRows = [];
for (const r of rulings) {
  const title = `${r.id} ${norm(r.topic ?? r.text).slice(0, 90)}`; const st = /supersed/i.test(r.status ?? '') ? 'superseded' : 'accepted';
  const c = B(['decision', 'create', title, '-s', st, '--plain'], `decision ${r.id}`);
  const id = /(decision-\d+)/i.exec(c.stdout)?.[1]; const dir = path.join(tmp, 'backlog/decisions');
  const file = fs.readdirSync(dir).find((f) => f.toLowerCase().startsWith(`${id}.md`) || f.toLowerCase().startsWith(`${id} -`));
  writeDecisionBody(path.join(dir, file), { date: r.date, quote: r.quote ?? '', cite: r.cite ?? '', text: r.text ?? '', tasks: r.named.map((n) => n.id), supersedes: (r.supersedes ?? []).join(', '), groups: (r.groups ?? []).join(', ') });
  decRows.push({ r, id });
}
// tasks, in topological order
for (const it of order) {
  const labels = [it.g, `plan:${it.number}`, ...(String(it.id) !== String(it.number) ? [`plan:${it.id}`] : []), ...new Set(it.labels)];
  const dep = it.deps.map((d) => d.created).filter(Boolean);
  const short = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 3).replace(/\s+\S*$/, '')}...`);
  const argv = ['task', 'create', short(`${it.number} ${it.title}`, 90), '--plain', '-m', msTitle(groups.find((g) => g.id === it.g)), '--type', it.type, '--project', it.project, '--priority', it.priority,
    '-a', it.assignee, '-l', labels.join(','), '--ordinal', String(it.ordinal), '-d', describe(it).replace(/merged-into: (\S+)/, (m0) => m0)];
  if (!it.draft) argv.push('-s', it.st);
  if (it.draft) argv.push('--draft');
  if (it.due) argv.push('--due-date', it.due);
  for (const r of it.refs) argv.push('--ref', r);
  if (docPaths.get(it.g)) argv.push('--doc', docPaths.get(it.g));
  for (const c of it.ac) argv.push('--ac', c);
  if (dep.length) argv.push('--depends-on', dep.join(','));
  if (!msIds.get(it.g)) die(`plan-to-backlog: no milestone for group ${it.g} (item ${it.id})`);
  const r = B(argv, `task create ${it.id}`);
  it.created = /((?:TASK|DRAFT)-\d+)/i.exec(r.stdout)?.[1]?.toLowerCase();
  if (!it.created) die(`plan-to-backlog: could not read the created id for ${it.id}: ${r.stdout}`);
}
// the merged-into line needs the target's created id: it is created first (topological order), so patch the descriptions now
for (const it of order) if (it.mergeTarget) { const f = fs.readdirSync(path.join(tmp, 'backlog/tasks')).find((x) => x.toLowerCase().startsWith(`${it.created} -`)); const p = path.join(tmp, 'backlog/tasks', f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/merged-into: \S+/, `merged-into: ${it.mergeTarget.created}`)); }
// dated notes (M-246) and open comments
let noteCount = 0;
for (const { r } of decRows) for (const n of r.named) {
  if (n.draft) continue;
  B(['task', 'edit', n.created, '--append-notes', `Dated note ${r.date} (M-246, prior text kept; ${r.id} · ${n.created} · Backlog; operator, verbatim: "${r.quote}")`, '--plain'], `note ${r.id} on ${n.created}`); noteCount++;
}
for (const it of order) for (const c of it.comments) B(['task', 'edit', it.created, '--comment', c, '--comment-author', 'plan-to-backlog', '--plain'], `comment on ${it.created}`);
const doctor = B(['doctor'], 'backlog doctor');
// counts, then move
const cnt = (d) => fs.readdirSync(path.join(tmp, 'backlog', d)).filter((f) => f.endsWith('.md')).length;
const nTasks = cnt('tasks'); const nDrafts = cnt('drafts');
if (nTasks !== expectTasks || nDrafts !== expectDrafts) die(`plan-to-backlog: expected ${expectTasks} task files and ${expectDrafts} drafts, created ${nTasks} and ${nDrafts}; backlog.tmp/ kept for inspection`);
fs.renameSync(path.join(tmp, 'backlog'), path.join(target, 'backlog')); fs.rmSync(tmp, { recursive: true, force: true });

// ---- the report --------------------------------------------------------------------------------------------------------------------------------
const tally = (f, src = order) => { const m = {}; for (const i of src) { const k = f(i); m[k] = (m[k] ?? 0) + 1; } return m; };
const table = (m) => Object.entries(m).sort((x, y) => y[1] - x[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
const tasksOnly = order.filter((i) => !i.draft);
const mirrors = notes.filter((n) => n.kind === 'mirror'); const held = order.filter((i) => i.labels.includes('held-unruled'));
const rep = [
  `# Import report ${snapshotDate} (plan-to-backlog.mjs, Backlog-home plan v8.1 step R3)`, '',
  `Snapshot ${rawRel}/ (SHA256SUMS verified). backlog doctor: ${doctor.stdout.trim().split('\n').pop()} ${nTasks} task files, ${nDrafts} drafts, ${groups.length} milestones, ${decRows.length} decisions, ${docIds.length} docs, ${noteCount} dated notes (the M-246 note on a task a ruling names).`, '',
  '## Status census (column = Backlog status)', '| column | tasks |', '|---|---|', table(tally((i) => (i.draft ? 'draft' : i.st))), '',
  '## Status words typed in the plan (first word)', '| first word | items |', '|---|---|', table(tally((i) => i.first || '(empty)')), '',
  '## Per column by milestone', '| milestone | tasks | drafts |', '|---|---|---|', ...groups.map((g) => `| ${g.id} | ${tasksOnly.filter((i) => i.g === g.id).length} | ${order.filter((i) => i.draft && i.g === g.id).length} |`), '',
  '## Per priority', '| priority | items |', '|---|---|', table(tally((i) => i.priority)), '',
  '## Per type', '| type | items |', '|---|---|', table(tally((i) => i.type)), '',
  '## Per project', '| project | items |', '|---|---|', table(tally((i) => i.project)), '',
  '## Per assignee', '| assignee | items |', '|---|---|', table(tally((i) => i.assignee)), '',
  '## Source resolution', `resolved ${resolution.resolved} (quote differs at the line: ${resolution.quoteDiffers}); plan source tags kept as text ${resolution.tags}; unresolved ${resolution.missing} (listed in MISSING-REFS.md, label missing-ref on ${new Set(missingRefs.map((m) => m.it.id)).size} items).`, '',
  '## Dependencies: folded, re-pointed, removed, dropped',
  `re-pointed onto the merge target (${edgeReport.repointed.length}): ${edgeReport.repointed.map((e) => `${e.it.id} ${e.from.id} -> ${e.to.id}`).join('; ') || 'none'}`,
  `removed, target DROPPED, label dep-dropped (${edgeReport.removed.length}): ${edgeReport.removed.map((e) => `${e.it.id} -> ${e.t.id}`).join('; ') || 'none'}`,
  `dropped, not a plan task, label dep-dropped (${edgeReport.dangling.length}): ${edgeReport.dangling.map((e) => `${e.it.id} -> ${e.k}`).join('; ') || 'none'}`,
  `re-pointed edge dropped because it would close a cycle (${edgeReport.cycle.length}): ${edgeReport.cycle.map((e) => `${e.it.id} -> ${e.to.id}`).join('; ') || 'none'}`,
  `self-fold or unresolved merge target, imported LATER + unverified (${notes.filter((n) => n.kind === 'selffold').length}): ${notes.filter((n) => n.kind === 'selffold').map((n) => `${n.it.id} (${n.text.slice(0, 60)})`).join('; ') || 'none'}`, '',
  `## Held-unruled (WAITS + label + open comment; no ruling text invented) (${held.length})`, ...held.map((i) => `- ${i.id} ${i.title.slice(0, 80)}: plan text "${String(i.status).slice(0, 100)}"`), '',
  `## Queue-row items (${order.filter((i) => i.row).length}); plan word differed from the row word (${mirrors.length})`, ...mirrors.map((n) => `- ${n.it.id} plan "${n.it.first}" -> row ${n.it.row.id} ${n.rowWord}`), '',
  `## Decisions (${decRows.length}; operator rulings of the register; readings (${readings.length}) and entries (${entries.length}) are in the readings doc)`, ...decRows.map((d) => `- ${d.id} ${d.r.id} (${d.r.date}) names ${d.r.named.length} task(s)`), '',
  `## Docs (${docIds.length})`, ...docIds.map((d) => `- ${d.id} ${d.title} (${d.bytes} bytes)`), '',
].join('\n');
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, rep);
fs.writeFileSync(path.join(path.dirname(reportFile), 'MISSING-REFS.md'), `# Unresolved source references (${missingRefs.length})\n\nEach source of the plan that did not resolve to a file and line at import (label missing-ref on the task).\n\n${missingRefs.map((m) => `- ${m.it.id}: ${m.s} (${m.why})`).join('\n') || 'none'}\n`);
process.stdout.write(`plan-to-backlog: ${nTasks} tasks, ${nDrafts} drafts, ${groups.length} milestones, ${decRows.length} decisions, ${docIds.length} docs; report ${reportFile}\n`);
