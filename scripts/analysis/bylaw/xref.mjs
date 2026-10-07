// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-XREF ("`cross_refs[]`, `displaces[]`, `include_ref`
//            resolve to a row or an `external.json` `ref` (an `include_ref` to a `ref` fails); includes acyclic;
//            `displaces[]` irreflexive and acyclic; … anti-vacuity: every occurrence of a `vocab.displacement_triggers`
//            phrase in a clause unit has an extracted `displaces[]` entry or a `not_an_override` reason"), §6
//            (`displaces[]`, `include_ref`, `cross_refs[]` are G), §6.1 (in Phase 1 an `include_ref` may resolve to a
//            `phase2_exception` ref, counted), §6.4 rule 13, §7.4 (argument-level displacement); docs/specs/01-pipeline/
//            69_mcbylaw_policy.md M-48; docs/reports/mcbylaw-phase1-plan.md S6
//
// G-XREF, and the generator of `displaces[]` / `include_ref` (both G: computed from the slice, never keyed). PURE.
//
//   displacesOf(index, unitId, vocab, external?) → {targets:[{id, kind, citation, phrase}], unresolved:[{citation, phrase}],
//                                                  self:[citation], internal:[id], triggers:[{phrase, at, clause_path, n}]}
//   includeOf(index, unitId, external?)          → {citation, resolved:{ok, kind, id, reason?}} | null
//   checkXref({slice, units, vocab, external})   → {status, pass, checked, violations, counts}
//   selfTest()
//
// A trigger's scope is the unit's own subtree plus its ancestors' lead-ins (a lead-in "Despite …" governs every child).
// Forward triggers ("Despite", "notwithstanding") take the chain of references that follows them: dotted ids from
// slice.mjs extractRefs (incl. the "(3) and (4)" continuation forms) or relative clause refs "(A) and (B) above",
// "(A) to (L) above", "(i) above" (resolved upward through the unit's ancestors). Backward triggers ("does not apply",
// "do not apply") take the references between the start of their clause and the trigger. A target inside the unit's
// own subtree is internal structure (counted, not a displacement); the unit itself / its own row is `displaces_self`.
//
// Reason codes (closed):
//   ref_unresolved           a cross-reference of a row with an agreed unit resolves to no row / clause / article /
//                            section / chapter and no external.json `ref`
//   displaces_unresolved     a displacement target resolves to nothing
//   displaces_self           a unit displaces itself (irreflexive)
//   displaces_cycle          agreed units displace each other in a cycle
//   include_unresolved       an INCLUDE unit has no reference, or it resolves to no row (a chapter / article is not a row)
//   include_to_ref           an include_ref resolves to an external `ref` other than a Phase 1 `phase2_exception` ref
//   include_cycle            INCLUDE units include each other in a cycle
//   trigger_unaccounted      a trigger phrase yields no displacement target and no `not_an_override` entry names it
//   not_an_override_invalid  a `not_an_override` entry's reason is outside vocab.displacement_triggers.not_an_override,
//                            or its phrase is not an unaccounted trigger of the unit

import { buildIndex, gateResult, rangesOf, resolveCitation, splitUnitId, startOf, unitView, violation } from './authored.mjs';
import { xrefFixtures } from './authored-fixtures.mjs';

export const REASON_CODES = Object.freeze([
  'ref_unresolved',
  'displaces_unresolved',
  'displaces_self',
  'displaces_cycle',
  'include_unresolved',
  'include_to_ref',
  'include_cycle',
  'trigger_unaccounted',
  'not_an_override_invalid',
]);
/** Backward triggers: the displaced provision precedes the phrase ("regulation (A) does not apply"). */
export const BACKWARD_TRIGGERS = Object.freeze(['does not apply', 'do not apply']);
/** Phase 1 allowance (Spec 68 §6.1): an include_ref may resolve to a `ref` with this reason, counted. */
export const PHASE1_INCLUDE_REF_REASONS = Object.freeze(['phase2_exception']);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const GROUP = '\\([0-9A-Za-z]{1,7}\\)';
const SEP = '\\s*(?:,\\s*(?:and\\s+|or\\s+|to\\s+)?|and|or|to)\\s*';
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];

/** Clauses in a unit's trigger scope: its subtree + its ancestors (lead-ins). */
function scopeClauses(row, clausePath) {
  return (row.clauses || []).filter((c) => c.path.startsWith(clausePath) || (c.path !== clausePath && clausePath.startsWith(c.path)));
}
/** Phrase occurrences (word-bounded, case-sensitive as declared) in [from, to) of the verbatim. */
function occurrences(text, phrase, from, to) {
  const out = [];
  const re = new RegExp(`(?<![A-Za-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'g');
  for (const m of text.slice(from, to).matchAll(re)) out.push(from + m.index);
  return out;
}
/** Expand "(A) to (D)" between siblings: symbols in their own sequence (letters or roman numerals). */
function expandRange(a, b) {
  const seqs = [ROMAN, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), 'abcdefghijklmnopqrstuvwxyz'.split('')];
  for (const s of seqs) {
    const i = s.indexOf(a);
    const j = s.indexOf(b);
    if (i >= 0 && j >= i) return s.slice(i, j + 1);
  }
  if (/^\d+$/.test(a) && /^\d+$/.test(b) && Number(b) >= Number(a)) return Array.from({ length: Number(b) - Number(a) + 1 }, (_, k) => String(Number(a) + k));
  return [a, b];
}
/** Relative clause refs in a span: "(A) and (B) above", "regulation (A)", "(A) to (L) above" → symbol lists. */
function relativeRefs(span) {
  const out = [];
  const re = new RegExp(`(?:(regulations?|clauses?|sub-sections?)\\s+)?((?:${GROUP})+(?:${SEP}(?:${GROUP})+)*)(\\s+(?:above|below))?`, 'g');
  for (const m of span.matchAll(re)) {
    if (!m[1] && !m[3]) continue; // a bare "(X)" is not a reference without a division word or above / below
    const before = span.slice(Math.max(0, m.index - 1), m.index);
    if (/[\d.]/.test(before)) continue; // part of a dotted id (extractRefs owns those)
    const parts = m[2].split(new RegExp(`(${SEP})`));
    const groups = [];
    for (let k = 0; k < parts.length; k += 2) {
      const syms = [...parts[k].matchAll(/\(([0-9A-Za-z]{1,7})\)/g)].map((x) => x[1]);
      const sep = parts[k - 1];
      if (sep && /to/.test(sep) && groups.length && syms.length === 1) {
        const prev = groups.pop();
        const last = prev[prev.length - 1];
        for (const s of expandRange(last, syms[0])) groups.push([...prev.slice(0, -1), s]);
      } else groups.push(syms);
    }
    out.push({ at: m.index, end: m.index + m[0].length, groups });
  }
  return out;
}
/** Resolve a relative group (e.g. ["A"] or ["C","i"]) upward from a clause path: the first ancestor holding it wins. */
function resolveRelative(row, fromPath, syms) {
  const tail = syms.map((s) => `(${s})`).join('');
  const paths = new Set((row.clauses || []).map((c) => c.path));
  let p = fromPath;
  for (;;) {
    const parent = p.replace(/\([0-9A-Za-z]{1,7}\)$/, '');
    if (parent === p) return null;
    if (paths.has(parent + tail)) return parent + tail;
    p = parent;
  }
}

/**
 * The generated displacement targets of one unit (Spec 68 §6 `displaces[]`), with every trigger occurrence in its scope.
 * PURE. `external` lets a target resolve to an external.json `ref`.
 */
export function displacesOf(index, unitId, vocab, external = null) {
  const view = unitView(index, unitId);
  const out = { targets: [], unresolved: [], self: [], internal: [], triggers: [] };
  if (!view) return out;
  const row = view.row;
  const t = row.verbatim;
  const phrases = (vocab.displacement_triggers && vocab.displacement_triggers.phrases) || [];
  const seen = new Set();
  let named = 0; // references the current trigger names (a target named twice still accounts for both triggers)
  const add = (citation, resolved, phrase) => {
    named++;
    const key = resolved.ok ? resolved.id : `?${citation}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!resolved.ok) {
      out.unresolved.push({ citation, phrase });
      return;
    }
    const target = resolved.id;
    const { reg, path } = splitUnitId(target);
    // irreflexive: the unit itself, its own clause, or its own regulation (which contains it)
    if (target === unitId || target === row.regulation_id || (reg === row.regulation_id && path === view.clause_path)) {
      out.self.push(citation);
      return;
    }
    if (reg === row.regulation_id && path !== null && path.startsWith(view.clause_path) && path !== view.clause_path) {
      out.internal.push(target);
      return;
    }
    out.targets.push({ id: target, kind: resolved.kind, citation, phrase });
  };
  const relTarget = (row2, fromPath, g) => {
    const p = resolveRelative(row2, fromPath, g);
    if (p) return { ok: true, kind: (row2.clauses.find((y) => y.path === p) || {}).leaf ? 'unit' : 'clause', id: `${row2.regulation_id}#${p}` };
    // "Despite (1) to (4) above" inside regulation (5): the sibling regulations of the same article
    if (/^\d+$/.test(g[0])) return resolveCitation(index, `${row2.article}${g.map((s) => `(${s})`).join('')}`, external);
    return { ok: false };
  };
  for (const c of scopeClauses(row, view.clause_path).sort((a, b) => startOf(a) - startOf(b))) {
    const r0 = rangesOf(c)[0];
    const segFrom = r0[0] + (/^\s*\(([0-9A-Za-z]{1,7})\)/.exec(t.slice(r0[0], r0[1])) || [''])[0].length;
    for (const [cStart, cEnd] of rangesOf(c)) {
      const cc = { start: cStart, end: cEnd };
      // text order, never vocab-array order
      const hits = phrases.flatMap((ph) => occurrences(t, ph, cc.start, cc.end).map((x) => [x, ph])).sort((x, y) => x[0] - y[0] || cmpStr(x[1], y[1]));
      for (const [at, phrase] of hits) {
        const backward = BACKWARD_TRIGGERS.includes(phrase);
        named = 0;
        if (!backward) {
          // the chain of dotted refs starting right after the phrase
          const refs = (row.refs || []).filter((r) => r.start >= at + phrase.length && r.start < cc.end).sort((a, b) => a.start - b.start);
          let last = at + phrase.length;
          const chain = [];
          for (const r of refs) {
            const gap = t.slice(last, r.start);
            const ok = chain.length === 0
              ? /^\s+(?:the\s+[a-z ]{0,60}?\s+in\s+)?(?:regulations?\s+|sections?\s+|clauses?\s+)?$/i.test(gap)
              : /^\s*(?:,\s*)?(?:and|or|to)?\s*(?:regulations?\s+|clauses?\s+)?$/i.test(gap);
            if (!ok) break;
            chain.push(r);
            last = r.end;
          }
          for (const r of chain) add(r.citation, resolveCitation(index, r.citation, external), phrase);
          if (!chain.length) {
            const rel = relativeRefs(t.slice(at + phrase.length, cc.end)).filter((x) => x.at <= 1);
            for (const x of rel.slice(0, 1)) for (const g of x.groups) add(`${row.regulation_id}#${g.map((s2) => `(${s2})`).join('')}`, relTarget(row, c.path, g), phrase);
          }
        } else {
          for (const r of (row.refs || []).filter((x) => x.start >= segFrom && x.end <= at)) add(r.citation, resolveCitation(index, r.citation, external), phrase);
          for (const x of relativeRefs(t.slice(segFrom, at))) for (const g of x.groups) add(`${row.regulation_id}#${g.map((s2) => `(${s2})`).join('')}`, relTarget(row, c.path, g), phrase);
        }
        out.triggers.push({ phrase, at, clause_path: c.path, n: named, backward });
      }
    }
  }
  out.targets.sort((a, b) => cmpStr(a.id, b.id));
  return out;
}

/** The generated include_ref of an INCLUDE unit: the first dotted reference in its scope. PURE. */
export function includeOf(index, unitId, external = null) {
  const view = unitView(index, unitId);
  if (!view) return null;
  const scope = new Set(scopeClauses(view.row, view.clause_path).map((c) => c.path));
  const ref = (view.row.refs || []).filter((r) => scope.has(r.clause_path)).sort((a, b) => a.start - b.start || a.end - b.end || cmpStr(a.citation, b.citation))[0];
  if (!ref) return { citation: null, resolved: { ok: false, kind: null, id: null } };
  return { citation: ref.citation, resolved: resolveCitation(index, ref.citation, external) };
}

/** Units whose scope overlaps a target id (same row, one path a prefix of the other). */
function overlaps(targetId, unitId) {
  const a = splitUnitId(targetId);
  const b = splitUnitId(unitId);
  if (a.reg !== b.reg) return false;
  const pa = a.path === null || a.path === 'whole' ? '' : a.path;
  const pb = b.path === null || b.path === 'whole' ? '' : b.path;
  return pa.startsWith(pb) || pb.startsWith(pa);
}
function findCycle(nodes, edges) {
  const state = new Map();
  const stack = [];
  let found = null;
  const visit = (n) => {
    if (found) return;
    state.set(n, 1);
    stack.push(n);
    for (const m of edges.get(n) || []) {
      if (state.get(m) === 1) {
        found = [...stack.slice(stack.indexOf(m)), m];
        return;
      }
      if (!state.has(m)) visit(m);
      if (found) return;
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const n of nodes) if (!state.has(n)) visit(n);
  return found;
}

/** G-XREF over the agreed units. PURE. */
export function checkXref({ slice, units = new Map(), vocab, external = null } = {}) {
  const v = [];
  const index = buildIndex(slice);
  const allowed = new Set((vocab.displacement_triggers && vocab.displacement_triggers.not_an_override) || []);
  const phraseCount = ((vocab.displacement_triggers && vocab.displacement_triggers.phrases) || []).length;
  const counts = { units: 0, displaces: 0, internal_refs: 0, triggers: 0, not_an_override: 0, refs_checked: 0, refs_to_external: 0, include_to_phase2_ref: 0, include_depth_max: 0 };
  const ids = [...units.keys()].filter((id) => unitView(index, id)).sort(cmpStr);
  const dEdges = new Map();
  const iEdges = new Map();
  const displacedCitations = new Map(); // regulation_id → Set(citation) already judged by the displaces arm
  const agreedScope = new Map(); // regulation_id → Set(clause path) inside an agreed unit (its subtree + lead-ins)
  for (const id of ids) {
    const u = units.get(id);
    counts.units++;
    const reg = splitUnitId(id).reg;
    if (!displacedCitations.has(reg)) displacedCitations.set(reg, new Set());
    const d = displacesOf(index, id, vocab, external);
    // §4: only agreed content is checked — the cross_refs arm reads the refs inside agreed units' clauses
    const vw = unitView(index, id);
    if (!agreedScope.has(reg)) agreedScope.set(reg, new Set());
    for (const c of scopeClauses(vw.row, vw.clause_path)) agreedScope.get(reg).add(c.path);
    counts.displaces += d.targets.length;
    counts.internal_refs += d.internal.length;
    counts.triggers += d.triggers.length;
    for (const x of d.unresolved) {
      displacedCitations.get(reg).add(x.citation);
      v.push(violation('displaces_unresolved', id, `"${x.phrase} ${x.citation}" names nothing`));
    }
    for (const c of d.self) v.push(violation('displaces_self', id, `"${c}" is the unit itself`));
    for (const x of d.targets) displacedCitations.get(reg).add(x.citation);
    dEdges.set(id, ids.filter((o) => o !== id && d.targets.some((x) => overlaps(x.id, o))));
    // anti-vacuity: each trigger names a target, or a not_an_override entry consumes it
    const open = d.triggers.filter((x) => x.n === 0).map((x) => x.phrase);
    for (const e of Array.isArray(u.not_an_override) ? u.not_an_override : []) {
      counts.not_an_override++;
      const k = open.indexOf(e && e.phrase);
      if (k < 0) v.push(violation('not_an_override_invalid', id, `phrase "${e && e.phrase}" is not an unaccounted trigger of the unit`));
      else open.splice(k, 1); // the entry names its trigger; a bad reason is its one defect
      if (!allowed.has(e && e.reason)) v.push(violation('not_an_override_invalid', id, `reason ${e && e.reason} is not in vocab.displacement_triggers.not_an_override`));
    }
    for (const p of open) v.push(violation('trigger_unaccounted', id, `"${p}" yields no displaces[] entry and no not_an_override reason`));
    // include_ref
    if (u.archetype === 'INCLUDE') {
      const inc = includeOf(index, id, external);
      if (!inc.citation || !inc.resolved.ok || !['row', 'unit', 'clause', 'ref'].includes(inc.resolved.kind)) v.push(violation('include_unresolved', id, inc.citation ? `"${inc.citation}" is ${inc.resolved.ok ? `a ${inc.resolved.kind}, not a row` : 'unresolved'}` : 'no reference in the clause'));
      else if (inc.resolved.kind === 'ref') {
        if (PHASE1_INCLUDE_REF_REASONS.includes(inc.resolved.reason)) counts.include_to_phase2_ref++;
        else v.push(violation('include_to_ref', id, `"${inc.citation}" resolves to external ${inc.resolved.id} (${inc.resolved.reason})`));
      } else if (overlaps(inc.resolved.id, id)) v.push(violation('include_cycle', id, `"${inc.citation}" includes the unit itself`));
      else iEdges.set(id, ids.filter((o) => o !== id && units.get(o).archetype === 'INCLUDE' && overlaps(inc.resolved.id, o)));
    }
  }
  const dc = findCycle(ids, dEdges);
  if (dc) v.push(violation('displaces_cycle', dc[0], dc.join(' → ')));
  const ic = findCycle([...iEdges.keys()], iEdges);
  if (ic) v.push(violation('include_cycle', ic[0], ic.join(' → ')));
  else {
    const depth = (n, seen = new Set()) => (seen.has(n) ? 0 : 1 + Math.max(0, ...(iEdges.get(n) || []).map((m) => depth(m, new Set([...seen, n])))));
    for (const n of iEdges.keys()) counts.include_depth_max = Math.max(counts.include_depth_max, depth(n));
  }
  // cross_refs of every row that holds an agreed unit
  for (const reg of [...displacedCitations.keys()].sort(cmpStr)) {
    const row = index.rows.get(reg);
    const judged = displacedCitations.get(reg);
    const done = new Set();
    for (const r of row.refs || []) {
      if (!agreedScope.get(reg).has(r.clause_path)) continue; // a pending clause's ref is not yet checked
      if (done.has(r.citation)) continue;
      done.add(r.citation);
      counts.refs_checked++;
      if (judged.has(r.citation)) continue;
      const res = resolveCitation(index, r.citation, external);
      if (!res.ok) v.push(violation('ref_unresolved', reg, `"${r.citation}" (clause ${r.clause_path})`));
      else if (res.kind === 'ref') counts.refs_to_external++;
    }
  }
  // the anti-vacuity arm reads vocab.displacement_triggers.phrases: with none declared it did not run
  const notRun = counts.units > 0 && phraseCount === 0 ? 'vocab.displacement_triggers.phrases is empty' : null;
  return gateResult({ violations: v, checked: counts.units, counts, notRun });
}

/** One known-bad fixture per reason code + good twins, real clause text. */
export function selfTest() {
  const results = [];
  for (const f of xrefFixtures()) {
    const r = checkXref(f.input);
    const codes = [...new Set(r.violations.map((x) => x.code))];
    const ok = f.reason === null ? r.status === 'pass' && (!f.expect || f.expect(r)) : r.status === 'fail' && codes.length === 1 && codes[0] === f.reason;
    results.push({ name: f.name, expected: f.reason, got: codes, ok });
  }
  const covered = new Set(results.map((x) => x.expected).filter(Boolean));
  for (const c of REASON_CODES) if (!covered.has(c)) results.push({ name: `fixture for ${c}`, expected: c, got: [], ok: false });
  return { pass: results.every((x) => x.ok), results };
}
