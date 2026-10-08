// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (G / A / ⧉ ownership; the ⧉ set; authored files hold only
//            A / ⧉ fields), §6.4 rules 4, 5, §7.4 (canonical agreement), §10 stage 5 (authored/<page>/<article>.{a,b}.json +
//            <article>.prov.json); docs/specs/01-pipeline/69_mcbylaw_policy.md M-17 (+ dated notes 2026-10-06 / 2026-10-07:
//            ranks_layers ⧉, calculation_handling status single-drafted A, the three keying conventions, conditional
//            narrowing); docs/reports/mcbylaw-phase1-plan.md S6
//
// The authored-field model shared by the S6 authored-field gates (agree.mjs, clause.mjs, xref.mjs, shape.mjs,
// keyer-prov.mjs). PURE except loadAuthored() (reads the committed authored/ tree; no clock, no network).
//
//   DOUBLE_KEYED / NARROWED_DOUBLE_KEYED / SINGLE_DRAFTED / ROW_SINGLE_DRAFTED / GENERATED_FIELDS   the ownership lists
//   getField(unit, path)                 dotted-path read ('calculation_handling.status')
//   canonicalField(path, value, {unitId}?)   the canonical projection two drafts are compared on (§7.4; rules C1–C6)
//   buildIndex(slice)                    rows / units / articles / sections / chapters / clause paths of a slice
//   unitView(index, unitId)              {row, unit_id, clause_path, text, sha256} — a slice leaf or `<reg>#whole`
//   resolveClause(row, path)             a statement / literal clause path → the row's clause (or null)
//   clauseScope(row, clausePath)         {paths, text}: the clause's subtree + its ancestors' lead-ins (the cited clause)
//   resolveCitation(index, citation, external)   a cross-reference citation → {ok, kind, id}
//   loadAuthored(root)                   the shards of scripts/seeds/bylaw/authored/
//   violation(code, id, detail) / formatViolation(v)   the violation record every S6 gate returns
//
// File shapes (bylaw-authored-v1; JSON Schema arm in shape.mjs):
//   <article>.a.json   {schema, shard, keyer:"A", units:[unit draft], rows:{<regulation_id>: {explanation, code_refs}}}
//   <article>.b.json   {schema, shard, keyer:"B", units:[unit draft with ⧉ fields only]}
//   <article>.prov.json {schema, shard, keyers:{a:{id, engine}, b:{id, engine}}, briefs:{a, b} (sha256),
//                        a_seal:{sha256, seal_id}, b_run:{run_id, ledger_sha256, read_paths[], worktree_commit},
//                        unit_shas:{<unit_id>: sha256 of the unit's normalized text, copied from the brief}}
//   A unit draft's id is a slice leaf unit id `<regulation_id>#<clause_path>`, or `<regulation_id>#whole` when the
//   regulation is keyed as one unit (the S0.5 convention; evaluate.mjs splitRef reads `#whole` as the row).

import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { canonCond, canonicalExpression, parseCond } from './dsl.mjs';
import { chapterZone } from './evaluate.mjs';
import { extractLiterals } from './slice.mjs';
import { scanNumbers } from './text.mjs';

/** vocab.json (read at load, like text.mjs reads `slicer`): lot_condition threshold tokens + what they read (rule C1). */
const VOCAB = createRequire(import.meta.url)('../../seeds/bylaw/vocab.json');
const LOT_CONDITION = VOCAB.lot_condition || {};
/** vocab.json zone: the zones rule 0 evaluates (evaluate.mjs ctx zones), read by rule C6. */
const ZONES = Object.freeze([...(VOCAB.zone || [])]);

export const AUTHORED_REL = 'scripts/seeds/bylaw/authored';
export const AUTHORED_SCHEMA = 'bylaw-authored-v1';
/**
 * The ONE shard-key ⇄ path codec. A shard key is `<page>/<article>`; an enacting pseudo-page is `enacting:<bylaw>`,
 * and Windows forbids ":" in a path segment, so ":" is stored as "__" in the page directory. Page keys never contain
 * "__" (section pages are `chN_M`), so the map is injective and keyOfShardDir() inverts it.
 */
export const shardDirOfKey = (key) => String(key).replace(/:/g, '__');
export const keyOfShardDir = (rel) => String(rel).replace(/__/g, ':');
/** Repo-relative draft paths of a shard key: {a, b, prov}. */
export function shardRelPaths(key) {
  const p = `${AUTHORED_REL}/${shardDirOfKey(key)}`;
  return { a: `${p}.a.json`, b: `${p}.b.json`, prov: `${p}.prov.json` };
}
export const WHOLE = 'whole';
/** Gate state (Spec 68 §4): closed; a gate not run is never a PASS. */
export const GATE_STATES = Object.freeze(['pass', 'fail', 'not_run']);

/** The ⧉ set (Spec 68 §6, Spec 69 M-17 v0.5 note + 2026-10-06 note (ranks_layers) − 2026-10-07 note d (status → A)). */
export const DOUBLE_KEYED = Object.freeze([
  'archetype',
  'target',
  'bound',
  'requirement',
  'instrument',
  'evaluated_by_us',
  'ranks_layers',
  'condition',
  'applies_to',
  'numeric_expression',
  'literals_not_expressed',
  'application',
  'calculation_handling.not_modelled_reason',
  'calculation_handling.user_inputs',
  'input_fidelity.status',
]);
/** The narrowed set M-17 note (c) pre-authorizes, conditional on the A1 re-measure (applied by a dated note, never here). */
export const NARROWED_DOUBLE_KEYED = Object.freeze(['archetype', 'target', 'bound', 'numeric_expression']);
/** ⧉ fields a draft may omit (every other ⧉ field is written, "none" when unused): Ch.800 measurement rows only (§6). */
export const OPTIONAL_KEYED = Object.freeze(['input_fidelity.status']);
/** Unit fields drafted once by keyer A (Spec 68 §6 "A"). */
export const SINGLE_DRAFTED = Object.freeze([
  'calculation_handling.status',
  'calculation_handling.description',
  'calculation_handling.gaps',
  'disclosure',
  'input_fidelity.why',
  'input_fidelity.evidence_ref',
  'not_an_override',
]);
/** Row fields drafted once by keyer A, in the .a file's `rows` map. */
export const ROW_SINGLE_DRAFTED = Object.freeze(['explanation', 'code_refs']);
/** Generated fields (Spec 68 §6 "G"): never in an authored file. */
export const GENERATED_FIELDS = Object.freeze([
  'regulation_id', 'section_path', 'topic', 'relevance', 'value_form', 'layer', 'units', 'source', 'amendments',
  'field_status', 'enacting_source', 'row_status', 'last_changed_in', 'verbatim', 'clauses', 'numeric_literals',
  'cross_refs', 'displaces', 'include_ref', 'definitions_used', 'scope', 'scope_rule_id', 'out_of_scope_reason',
  'verified_against_sha256', 'drafts', 'feeds',
]);
/** Instrument kinds (Spec 68 §6 `instrument.kind`; not yet a vocab.json key — proposed S6 vocab patch). */
export const INSTRUMENT_KINDS = Object.freeze(['former_bylaw', 'former_section', 'schedule_map']);
/** Condition tokens that are generated, never keyed (Spec 69 M-17 note 2026-10-07 c(1)). */
export const GENERATED_CONDITION_TOKENS = Object.freeze(['exception_area']);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** A violation record (every S6 gate returns these). `code` is the closed reason code. */
export function violation(code, id, detail = '') {
  return { code, id: String(id ?? ''), detail: String(detail ?? '') };
}
export function formatViolation(v) {
  return `${v.code}: ${v.id}${v.detail ? ` — ${v.detail}` : ''}`;
}
/** Gate result in the shape the S7/S8 CLI reads. `notRun` wins over violations (a gate not run is never a PASS). */
export function gateResult({ violations, checked, notRun = null, ...extra }) {
  const sorted = [...violations].sort((a, b) => cmpStr(a.code, b.code) || cmpStr(a.id, b.id) || cmpStr(a.detail, b.detail));
  const status = notRun ? 'not_run' : sorted.length ? 'fail' : 'pass';
  return { status, pass: status === 'pass', checked, violations: sorted, ...(notRun ? { not_run_reason: notRun } : {}), ...extra };
}

/** Dotted-path read; undefined when any segment is missing. */
export function getField(obj, p) {
  let cur = obj;
  for (const k of p.split('.')) {
    if (!isMap(cur) || !Object.hasOwn(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

const sortedStrs = (xs) => [...new Set((Array.isArray(xs) ? xs : xs === undefined || xs === null || xs === 'none' ? [] : [xs]).map((x) => String(typeof x === 'object' && x ? x.token ?? JSON.stringify(x) : x).trim()))].sort(cmpStr);
const ws = (s) => String(s).replace(/\s+/g, ' ').trim();
/** JSON with sorted keys: a projection never depends on the key order a keyer typed. */
export const sortedJson = (v) => JSON.stringify(v, (k, x) => (isMap(x) ? Object.fromEntries(Object.keys(x).sort(cmpStr).map((q) => [q, x[q]])) : x));

function canonRanks(v) {
  if (v === undefined || v === null || v === 'none') return 'none';
  if (Array.isArray(v)) return [...v].map(String).sort(cmpStr).join(',');
  if (isMap(v)) return `${sortedStrs(v.higher).join(',')}>${sortedStrs(v.lower).join(',')}`;
  return String(v).split('>').map((tier) => tier.split(',').map((x) => x.trim()).filter(Boolean).sort(cmpStr).join(',')).join('>');
}
function canonInstrument(v) {
  if (v === undefined || v === null || v === 'none') return 'none';
  if (!isMap(v)) return `?${ws(v)}`;
  // M-17 note c(3): compared by kind + by-law number only
  const bylaw = /\d{1,5}-\d{2,4}/.exec(String(v.citation ?? ''));
  return `${v.kind ?? '?'}|${bylaw ? bylaw[0] : ws(v.citation ?? '').toLowerCase()}`;
}
/**
 * Rule C6: zones are compared by the zones they admit (Spec 68 §7.5): rule 0 evaluates only lots in a vocab.zone zone,
 * so [] ≡ ["any"] ≡ all of vocab.zone; rule 1 loads a base unit of a zone chapter (10.20 → RD, evaluate.mjs chapterZone)
 * only for lots of that zone, so there the projection is whether the set admits the chapter zone. Without a unit id the
 * keyed set is compared as written.
 */
function canonZones(zones, unitId) {
  const zs = sortedStrs(zones);
  if (unitId === undefined || unitId === null) return zs.join(',');
  const admitted = !zs.length || zs.includes('any') ? [...ZONES].sort(cmpStr) : zs;
  const z = chapterZone(splitUnitId(unitId).reg);
  if (z) return admitted.includes(z) ? z : `¬${z}`;
  return admitted.join(',');
}
function canonApplication(v, unitId) {
  if (v === undefined || v === null || v === 'none') return 'none';
  if (!isMap(v)) return `?${ws(JSON.stringify(v))}`;
  const lc = sortedStrs(v.lot_conditions).filter((t) => !GENERATED_CONDITION_TOKENS.includes(t));
  // evidence phrases are free text: checked by G-CLAUSE, never compared
  return `z[${canonZones(v.zones, unitId)}]t[${sortedStrs(v.building_types)}]c[${lc}]u[${sortedStrs(v.uses)}]`;
}
/** Rule C2: a presence test of a generated layer (`mapped(exception_area)`) is not keyed (note c(1)) → removed. */
function stripGeneratedTests(c) {
  if (!c) return c;
  if (c.type === 'mapped' && GENERATED_CONDITION_TOKENS.includes(c.code)) return null;
  if (c.type === 'not') { const x = stripGeneratedTests(c.x); return x ? { ...c, x } : null; }
  if (c.type === 'and' || c.type === 'or') {
    const xs = c.xs.map(stripGeneratedTests).filter(Boolean);
    return xs.length === 0 ? null : xs.length === 1 ? xs[0] : { ...c, xs };
  }
  return c;
}
/** What a condition reads, in vocab lot_condition `reads` terms: variables, `label` (label()/labelled()), `overlay` (overlay()/mapped()). */
function condReads(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'var') out.add(node.name);
  if (node.type === 'existing') out.add(node.var);
  if (node.type === 'label' || node.type === 'labelled') out.add('label');
  if (node.type === 'overlay' || node.type === 'mapped') out.add('overlay');
  for (const k of Object.keys(node)) {
    const x = node[k];
    if (Array.isArray(x)) for (const y of x) condReads(y, out);
    else if (x && typeof x === 'object') condReads(x, out);
  }
  return out;
}
/**
 * Rule C1: the threshold tokens a condition.if implies — every vocab lot_condition with `threshold: true` whose `reads`
 * the `if` reads (label_value ← labelled()/label(), overlay_mapped ← mapped()/overlay(), frontage_band ← lot_frontage_m …).
 * The token set is compared as keyed tokens ∪ implied tokens, so writing an implied token or leaving it out is one meaning.
 */
function impliedThresholdTokens(cond) {
  const reads = condReads(cond);
  return Object.entries(LOT_CONDITION).filter(([, e]) => e && e.threshold && (e.reads || []).some((r) => reads.has(r))).map(([t]) => t);
}
function canonCondition(v) {
  if (v === undefined || v === null || v === 'none') return 'none';
  const raw = v.tokens ?? v.token ?? [];
  const tokens = new Set((Array.isArray(raw) ? raw : [raw]).filter((t) => t && t !== 'none' && !GENERATED_CONDITION_TOKENS.includes(t)));
  let iff = 'none';
  if (v.if && v.if !== 'none') {
    const c = stripGeneratedTests(parseCond(v.if)); // throws DslError when unparseable (the caller counts a draft failure)
    if (c) {
      iff = canonCond(c);
      for (const t of impliedThresholdTokens(c)) tokens.add(t);
    }
  }
  if (!tokens.size && iff === 'none') return 'none';
  return `[${[...tokens].sort(cmpStr).join(',')}]if:${iff}`;
}
/**
 * Rules C4 + C5: a literals_not_expressed literal is identified by its number (the slicer's value; "one storey" ≡ "one"
 * ≡ "1", "12" ≡ "12.0 metres" — the unit is the clause's, not the keyer's); an entry in which the slicer counts no number
 * (a regulation id, by-law number, date, ordinal word — the classes brief rule 9 says to ignore) lists nothing and is
 * dropped. G-CLAUSE still checks every listed entry of the agreed draft against its clause.
 */
function lneLiteralId(raw) {
  const s = ` ${String(raw ?? '').trim()} `;
  const lits = extractLiterals(s);
  if (lits.length === 1) return String(lits[0].value);
  if (!lits.length && !scanNumbers(s, lits).uncovered.length) return null;
  return ws(raw).toLowerCase();
}
function canonLne(v) {
  if (v === undefined || v === null || v === 'none') return '[]';
  if (!Array.isArray(v)) return `?${ws(JSON.stringify(v))}`;
  const keys = [];
  for (const x of v) {
    const id = lneLiteralId(x && x.literal);
    if (id !== null) keys.push(`${id}@${String((x && x.clause) ?? '').replace(/\s+/g, '')}:${x && x.reason}`);
  }
  return `[${keys.sort(cmpStr).join(';')}]`;
}
function canonAppliesTo(v) {
  if (v === undefined || v === null || v === 'none') return 'none';
  if (!isMap(v)) return `?${ws(v)}`;
  return `${v.part}[${sortedStrs(v.refs)}]`;
}

/**
 * The canonical projection of one ⧉ field (Spec 68 §7.4: drafts agree when their canonical forms are equal).
 * Throws DslError for an unparseable numeric_expression / condition.if (the caller counts a draft failure).
 * `undefined` (field absent) → '∅', never equal to a written value. `ctx.unitId` (the unit compared) lets rule C6 apply.
 */
export function canonicalField(p, value, ctx = {}) {
  if (value === undefined) return '∅';
  switch (p) {
    case 'numeric_expression': return canonicalExpression(value);
    case 'condition': return canonCondition(value);
    case 'application': return canonApplication(value, ctx && ctx.unitId);
    case 'literals_not_expressed': return canonLne(value);
    case 'instrument': return canonInstrument(value);
    case 'ranks_layers': return canonRanks(value);
    case 'applies_to': return canonAppliesTo(value);
    case 'calculation_handling.user_inputs': return `[${sortedStrs(value)}]`;
    default: return value === null ? 'none' : ws(typeof value === 'object' ? sortedJson(value) : value);
  }
}

// ---------------------------------------------------------------- the slice index

/** Index a slice ({rows, units} from slice.mjs sliceSnapshot). PURE. */
export function buildIndex(slice) {
  const rows = new Map();
  const units = new Map();
  const articles = new Map();
  const sections = new Set();
  const chapters = new Set();
  for (const r of (slice && slice.rows) || []) {
    rows.set(r.regulation_id, r);
    if (!articles.has(r.article)) articles.set(r.article, []);
    articles.get(r.article).push(r.regulation_id);
    if (r.section) {
      sections.add(r.section);
      chapters.add(String(r.section).split('.')[0]);
    }
  }
  for (const u of (slice && slice.units) || []) units.set(u.unit_id, u);
  return { rows, units, articles, sections, chapters };
}

/** Split `<regulation_id>#<path>`. */
export function splitUnitId(unitId) {
  const s = String(unitId);
  const k = s.indexOf('#');
  return k < 0 ? { reg: s, path: null } : { reg: s.slice(0, k), path: s.slice(k + 1) };
}

/** A unit as the gates see it: a slice leaf, or `<reg>#whole` (the whole regulation). null when it names nothing. */
export function unitView(index, unitId) {
  const { reg, path: p } = splitUnitId(unitId);
  const row = index.rows.get(reg);
  if (!row || p === null) return null;
  if (p === WHOLE) {
    const root = row.clauses && row.clauses.length ? row.clauses[0].path : '';
    return { row, unit_id: unitId, clause_path: root, whole: true, text: row.verbatim, sha256: row.sha256 };
  }
  const u = index.units.get(unitId);
  if (u) return { row, unit_id: unitId, clause_path: u.clause_path, whole: false, text: [...(u.context || []), u.text].join(' '), sha256: u.sha256 };
  // a non-leaf clause keyed as one unit ("the greater of: (i) …; or (ii) …", a band keyed at its lead-in): its text is
  // the lead-ins + the whole subtree, pinned by the sha of that text (a leaf's pin is exactly slice.mjs unitsOf())
  const c = (row.clauses || []).find((x) => x.path === p);
  if (!c) return null;
  const { text } = clauseScope(row, p);
  return { row, unit_id: unitId, clause_path: p, whole: false, text, sha256: sha256(Buffer.from(text, 'utf8')) };
}

/**
 * A clause path as written in a statement / literal entry → the row clause it names. Accepted: the full path
 * (`(3)(A)`), a path relative to the regulation root (`(A)` → `(3)(A)`), `whole` / `#whole` / `` (the root), or the
 * unique clause whose path ends with it. Letter prefixes used by Ch.900 exceptions (SSP, PBS) are kept as written.
 */
export function resolveClause(row, p) {
  const clauses = row.clauses || [];
  if (!clauses.length) return null;
  const root = clauses[0];
  const q = String(p ?? '').replace(/\s+/g, '').replace(/^#/, '');
  if (q === '' || q === WHOLE) return root;
  const exact = clauses.find((c) => c.path === q) || clauses.find((c) => c.path === root.path + q);
  if (exact) return exact;
  const tail = clauses.filter((c) => c.path.endsWith(q));
  return tail.length === 1 ? tail[0] : null;
}

/** The cited clause's scope: its subtree paths, its ancestors' paths, and the text of both (lead-ins first). */
export function clauseScope(row, clausePath) {
  const clauses = row.clauses || [];
  const sub = clauses.filter((c) => c.path.startsWith(clausePath));
  const anc = clauses.filter((c) => c.path !== clausePath && clausePath.startsWith(c.path));
  const text = [...anc, ...sub].sort((a, b) => startOf(a) - startOf(b)).map((c) => ws(c.text)).filter(Boolean).join(' ');
  return { subtree: new Set(sub.map((c) => c.path)), ancestors: new Set(anc.map((c) => c.path)), text };
}

/** A clause's text spans in the verbatim: slice-v2 `ranges[[s, e], …]` (a clause may be split by a table), slice-v1 start/end. */
export function rangesOf(c) {
  return Array.isArray(c.ranges) && c.ranges.length ? c.ranges : [[c.start ?? 0, c.end ?? 0]];
}
export const startOf = (c) => rangesOf(c)[0][0];

/**
 * A cross-reference citation (slice ref `citation`, a displaces target, an include target) → what it names.
 * Rows first (`10.20.40.70(3)`), then a clause inside a row (`10.20.40.70(3)(D)`), an article, a section, a
 * chapter (`Chapter 800`), then an external.json `ref` entry with the same citation. PURE.
 */
export function resolveCitation(index, citation, external = null) {
  const c = String(citation ?? '').replace(/\s+/g, ' ').trim();
  const ch = /^Chapter (\d{1,3})$/.exec(c);
  if (ch) return index.chapters.has(ch[1]) ? { ok: true, kind: 'chapter', id: c } : refOrMiss(c, external);
  const m = /^(\d{1,3}(?:\.\d{1,3}){1,3})((?:\([0-9A-Za-z]{1,7}\))*)$/.exec(c.replace(/\s+/g, ''));
  if (!m) return refOrMiss(c, external);
  const [, id, groups] = m;
  const first = /^\([0-9A-Za-z]{1,7}\)/.exec(groups);
  if (first && index.rows.has(id + first[0])) {
    const row = index.rows.get(id + first[0]);
    if (groups === first[0]) return { ok: true, kind: 'row', id: row.regulation_id };
    const cl = (row.clauses || []).find((x) => x.path === groups);
    if (cl) return { ok: true, kind: cl.leaf ? 'unit' : 'clause', id: `${row.regulation_id}#${cl.path}` };
    return refOrMiss(c, external);
  }
  if (!groups && index.rows.has(`${id}#article`)) return { ok: true, kind: 'row', id: `${id}#article` };
  if (!groups && index.articles.has(id)) return { ok: true, kind: 'article', id };
  if (!groups && index.sections.has(id)) return { ok: true, kind: 'section', id };
  return refOrMiss(c, external);
}
function refOrMiss(c, external) {
  const entries = (external && Array.isArray(external.entries) ? external.entries : []).filter((e) => e && e.kind === 'ref');
  const hit = entries.find((e) => String(e.citation ?? '').replace(/\s+/g, ' ').trim() === c);
  return hit ? { ok: true, kind: 'ref', id: hit.id, reason: hit.reason } : { ok: false, kind: null, id: c };
}

// ---------------------------------------------------------------- loading

/**
 * Read every shard under scripts/seeds/bylaw/authored/<page>/<article>.{a,b,prov}.json. A file that does not parse
 * is returned with `parse_error` (G-SHAPE reports it), never thrown. The A bytes are hashed for the seal check.
 * @returns {{key, page, article, paths:{a,b,prov}, a, b, prov, a_sha256, parse_errors:string[]}[]}
 */
export function loadAuthored(root) {
  const base = path.join(root, AUTHORED_REL);
  if (!fs.existsSync(base)) return [];
  const shards = new Map();
  for (const page of fs.readdirSync(base).sort(cmpStr)) {
    const dir = path.join(base, page);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).sort(cmpStr)) {
      const m = /^(.+)\.(a|b|prov)\.json$/.exec(f);
      if (!m) continue;
      const key = keyOfShardDir(`${page}/${m[1]}`); // the shard key, not its on-disk spelling (enacting__… → enacting:…)
      if (!shards.has(key)) shards.set(key, { key, page: keyOfShardDir(page), article: m[1], paths: {}, a: null, b: null, prov: null, a_sha256: null, parse_errors: [] });
      const s = shards.get(key);
      const rel = `${AUTHORED_REL}/${page}/${f}`;
      s.paths[m[2]] = rel;
      const bytes = fs.readFileSync(path.join(dir, f));
      // the seal hashes LF-normalized bytes, so a CRLF checkout (core.autocrlf) of the same commit seals equal
      if (m[2] === 'a') s.a_sha256 = sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
      try {
        s[m[2]] = JSON.parse(bytes.toString('utf8'));
      } catch (err) {
        s.parse_errors.push(`${rel}: ${err && err.message}`);
      }
    }
  }
  return [...shards.values()].sort((a, b) => cmpStr(a.key, b.key));
}
