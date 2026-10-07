// Oracle B — an independent per-lot by-law resolver (Phase 2 plan §V-2; Spec 68 §7.4–§7.6, Spec 69 M-27, M-34,
// M-38, M-48..M-50, M-54, M-55).
//
// INDEPENDENCE: written from the specs, vocab.json, absence-rulings.json and external.json only. It never reads,
// imports or mirrors scripts/analysis/bylaw/evaluate.mjs, dsl.mjs or their tests. Structure differs on purpose:
// - precedence is a sequence of named passes over an explicit LAYER_RANK table (rule 2 drop → rule 3 rank lift →
//   rule 4 per-direction top-rank filter → rule 4a combine → provincial yield → cross-direction check);
// - any applicability that cannot be decided (a token, a map area, a scope or a condition with no lot value) is
//   resolved by enumerating every world of the undecided units; a value is returned only when every world agrees
//   (the M-50 rule for building type, applied the same way to every other undecided fact).
//
// resolve(lot, units, {vocab, absences, externals}) → { [target]: result }
// result = { status: value | unregulated | unlimited | not_evaluated | conflict, value, unit, bounds, reason,
//            winner, evidence: clause | absence | provincial | none, clause, absence_id, notes[], trace[] }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStatement, parseExpr, ev, cond } from './expr.mjs';

export const ORACLE_B_VERSION = 'oracle-b-1';
export const LAYER_RANK = Object.freeze({ base: 1, overlay: 2, exception: 3, provincial: 4 });
const MAX_UNKNOWN = 12;
const EPS = 1e-9;

// Spec 68 §6: Ch.10 zone chapters and Ch.900 exception chapters (k = 2 R · 3 RD · 4 RS · 5 RT · 6 RM).
const ALL_ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
const CH10 = { 5: ALL_ZONES, 10: ['R'], 20: ['RD'], 40: ['RS'], 60: ['RT'], 80: ['RM'] };
function chapterZones(reg) {
  const m = /^10\.(5|10|20|40|60|80)\./.exec(reg);
  return m ? CH10[m[1]] : null;
}
function exceptionOf(u) {
  if (u.exception) return u.exception;
  const m = /^(900\.\d+\.10\(\d+\))/.exec(u.regulation_id || '');
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- enactment dates (pinned page headers)
let enactedCache = null;
/** "enacted on May 9, 2013" in the pinned page header of By-law 569-2013 → {'569-2013': '2013-05-09'}. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export function enactedDatesFromPages(dir = path.join(REPO_ROOT, 'scripts/seeds/bylaw/pages')) {
  const out = {};
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort(); } catch (e) { if (e.code === 'ENOENT') return out; throw e; }
  for (const f of files) {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 4000);
    // one anchored sentence: "... By-law 569-2013 was enacted on May 9, 2013" (by-law and date bound together)
    const m = /By-law\s+(\d{1,5}-\d{4})\s+was enacted on ([A-Za-z]+) (\d{1,2}), (\d{4})/.exec(txt);
    if (m && !out[m[1]]) {
      const mi = MONTHS.indexOf(m[2].toLowerCase());
      if (mi >= 0) out[m[1]] = `${m[4]}-${String(mi + 1).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    }
  }
  return out;
}

// ---------------------------------------------------------------- unit preparation
function normClause(c) {
  const s = String(c || '').replace(/-[a-z_]+$/i, '');
  return s === 'whole' || s === '#whole' ? '' : s;
}
function ranksLayers(v) {
  if (!v || v === 'none') return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[>,\s]+/);
  return arr.map((x) => String(x).trim()).filter((x) => LAYER_RANK[x] !== undefined);
}
function collectArgPaths(node, out) {
  if (!node || typeof node !== 'object') return out;
  if ((node.n === 'max' || node.n === 'min') && node.args) for (const a of node.args) { if (a.path) out.add(a.path); collectArgPaths(a.e, out); }
  for (const k of ['a', 'b', 'c', 'e']) if (node[k]) collectArgPaths(node[k], out);
  for (const k of ['arms']) if (Array.isArray(node[k])) for (const x of node[k]) { collectArgPaths(x.c, out); collectArgPaths(x.e, out); }
  return out;
}

function prepareUnit(u, vocab) {
  const reg = u.regulation_id;
  const p = { raw: u, id: u.unit_id, reg, upath: reg + normClause(u.clause_path), layer: u.layer, archetype: u.archetype,
    bound: u.bound, displaces: Array.isArray(u.displaces) ? u.displaces : [], ranks: ranksLayers(u.ranks_layers),
    exception: exceptionOf(u), include_ref: u.include_ref && u.include_ref !== 'none' ? u.include_ref : null,
    zones: chapterZones(reg) || (u.application?.zones || ['any']), types: u.application?.building_types || ['any'],
    part: u.applies_to?.part || 'whole', refs: u.applies_to?.refs || [], statements: [], errors: [], argPaths: new Set() };
  const ne = Array.isArray(u.numeric_expression) ? u.numeric_expression : (u.numeric_expression && u.numeric_expression !== 'none' ? [u.numeric_expression] : []);
  for (const s of ne) {
    if (!s || s === 'none') continue;
    try { const st = parseStatement(s); p.statements.push(st); collectArgPaths(st.expr, p.argPaths); } catch (e) { p.errors.push(`parse: ${e.message}`); }
  }
  const c = u.condition;
  p.tokens = [];
  p.condAst = null;
  if (c && c !== 'none' && typeof c === 'object') {
    p.tokens = (c.tokens || []).filter((t) => !(vocab.lot_condition?.[t]?.threshold));
    p.thresholdWithoutIf = (c.tokens || []).some((t) => vocab.lot_condition?.[t]?.threshold) && (!c.if || c.if === 'none');
    if (c.if && c.if !== 'none') { try { p.condAst = parseExpr(c.if); } catch (e) { p.errors.push(`cond: ${e.message}`); p.condError = true; } }
  }
  p.ownTarget = u.target && u.target !== 'none' ? u.target : null;
  p.targets = new Set(p.statements.map((s) => s.target));
  // a statement that fails to parse never makes its unit vanish: it stays a candidate and evaluates to expression_error
  if (p.errors.length && p.ownTarget) p.targets.add(p.ownTarget);
  return p;
}

function provincialUnits(externals) {
  const out = [];
  const entries = externals?.entries || (Array.isArray(externals) ? externals : []);
  for (const e of entries) {
    if (e.precedence !== 'active' || e.verification_status !== 'verified_primary' || !Array.isArray(e.provincial_units)) continue;
    for (const pu of e.provincial_units) {
      out.push({ raw: pu, id: pu.unit_id, reg: pu.unit_id, upath: pu.unit_id, layer: 'provincial', archetype: 'LIMIT', bound: pu.bound,
        displaces: [], ranks: [], exception: null, include_ref: null, zones: ALL_ZONES, types: ['any'], part: 'whole', refs: [],
        statements: [], errors: [], argPaths: new Set(), tokens: [], condAst: null, targets: new Set([pu.target]), ownTarget: pu.target,
        provincial: { value: pu.value, unit: pu.unit, bylaw_prevails: pu.bylaw_prevails, citation: pu.citation, scope: pu.scope, row: e.id } });
    }
  }
  return out;
}

// ---------------------------------------------------------------- result helpers
const NE = (reason, extra = {}) => ({ status: 'not_evaluated', value: null, reason, winner: null, evidence: 'none', notes: [], trace: [], ...extra });
const round = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
export function canonical(r) {
  if (!r) return 'null';
  const b = r.bounds ? Object.keys(r.bounds).sort().map((k) => `${k}=${round(r.bounds[k])}`).join(',') : '';
  return `${r.status}|${round(r.value)}|${b}|${r.status === 'not_evaluated' ? r.reason : ''}`;
}
const tri = (b, reason = null) => ({ b, reason });

// ---------------------------------------------------------------- the oracle
export function createOracle({ units = [], vocab, absences = null, externals = null, enacted = undefined } = {}) {
  if (!vocab) throw new Error('oracle-b: vocab is required');
  const rulings = Array.isArray(absences) ? absences : (absences?.rulings || []);
  const enactedDates = enacted === undefined ? (enactedCache ||= enactedDatesFromPages()) : enacted;
  const prepared = units.filter((u) => u && u.candidate !== false).map((u) => prepareUnit(u, vocab)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const prov = provincialUnits(externals);
  const all = [...prepared, ...prov];
  const residentialTypes = Object.entries(vocab.building_type || {}).filter(([, v]) => v.residential === true).map(([k]) => k);
  if (!residentialTypes.length) throw new Error('oracle-b: vocab.building_type has no residential:true entry (M-50 list)');
  const zonesKnown = new Set(vocab.zone || ALL_ZONES);
  const capturedExceptions = new Set(prepared.map((u) => u.exception).filter(Boolean));

  // ref → units: whole-unit matches (exact path or a descendant clause path)
  const refUnits = new Map();
  const normRef = (ref) => String(ref).replace(/#whole$/, '').replace('#', '');
  const unitsForRef = (rawRef) => {
    const ref = normRef(rawRef);
    if (!refUnits.has(ref)) refUnits.set(ref, all.filter((u) => u.upath === ref || u.upath.startsWith(`${ref}(`) || u.upath.startsWith(`${ref}SSP`)));
    return refUnits.get(ref);
  };
  // ref → {unit, argPath} when the ref names an argument inside a unit's expression (M-48)
  const argRef = (rawRef) => {
    const ref = normRef(rawRef);
    if (unitsForRef(ref).length) return null;
    const hosts = all.filter((u) => ref.startsWith(u.upath) && ref.length > u.upath.length && ref[u.upath.length] === '(');
    if (!hosts.length) return null;
    return hosts.map((u) => ({ unit: u, argPath: ref.slice(u.reg.length) }));
  };

  // ------------------------------------------------ lot facts
  const typedCache = new WeakMap();
  function typed(lot, t) {
    let m = typedCache.get(lot); if (!m) { m = new Map(); typedCache.set(lot, m); }
    if (!m.has(t)) m.set(t, { ...lot, building_type: t, __memo: new Map(), __exc: null });
    return m.get(t);
  }
  function fact(lot, token) {
    const ui = vocab.lot_condition?.[token]?.user_input;
    if (token === 'exception_area') return tri(!!lot.exception);
    const key = ui || token;
    const v = lot.flags?.[key] ?? lot.user?.[key];
    if (v === true || v === false) return tri(v);
    return tri(null, ui ? `needs_user_input:${ui}` : 'condition_unknown');
  }
  function typeOK(types, t) {
    if (types.includes('any')) return true;
    if (types.includes(t)) return true;
    const parent = vocab.building_type?.[t]?.parent;
    return !!(parent && types.includes(parent));
  }
  function exceptionSet(lt) {
    if (lt.__exc) return lt.__exc;
    const set = new Set(); const notes = [];
    if (lt.exception) {
      set.add(lt.exception);
      let level = [lt.exception]; let depth = 0;
      while (level.length) {
        if (depth >= 20) { notes.push(`include_depth_exceeded:${lt.exception}`); break; }
        depth += 1;
        const next = [];
        for (const e of level) {
          for (const u of prepared) {
            if (u.archetype !== 'INCLUDE' || u.exception !== e || !u.include_ref) continue;
            if (set.has(u.include_ref)) { notes.push(`include_cycle_or_repeat:${u.id}`); continue; }
            set.add(u.include_ref); next.push(u.include_ref);
          }
        }
        level = next;
      }
    }
    lt.__exc = { set, notes };
    return lt.__exc;
  }
  function provincialScope(lt, pu) {
    const s = pu.provincial.scope || {};
    if (!zonesKnown.has(lt.zone)) return tri(false); // "urban residential land": a residential zone
    // ASSUMPTION (listed ambiguity): "rowhouse" in O. Reg. 299/19 ≙ vocab townhouse
    const types = (s.principal_building_types || []).map((x) => (x === 'rowhouse' ? 'townhouse' : x));
    if (!types.includes(lt.building_type)) return tri(false);
    const uc = lt.user?.unit_count ?? lt.vars?.unit_count;
    const ss = fact(lt, 'has_secondary_suite').b;
    const g = lt.flags?.has_garden_suite ?? lt.user?.has_garden_suite;
    const l = lt.flags?.has_laneway_suite ?? lt.user?.has_laneway_suite;
    const house = typeof lt.user?.house_units === 'number' ? lt.user.house_units : (typeof uc === 'number' ? uc : (ss === true ? 2 : ss === false ? 1 : null));
    const anc = typeof lt.user?.ancillary_units === 'number' ? lt.user.ancillary_units : (g === true || l === true ? 1 : (g === false && l === false ? 0 : null));
    const confs = s.unit_configurations || [];
    const fits = (h, a) => confs.some((c) => c.house_units.includes(h) && c.ancillary_units.includes(a)) && (s.other_building_contains_unit !== true || a >= 1);
    if (house !== null && anc !== null) return tri(fits(house, anc));
    // undecided: decided only if every possible completion agrees
    const hs = house !== null ? [house] : [1, 2, 3]; const as = anc !== null ? [anc] : [0, 1];
    const outs = new Set(); for (const h of hs) for (const a of as) outs.add(fits(h, a));
    if (outs.size === 1) return tri([...outs][0]);
    return tri(null, house === null ? 'needs_user_input:has_secondary_suite' : 'needs_user_input:has_garden_suite');
  }
  function and3(parts) {
    let unknown = null;
    for (const p of parts) { if (p.b === false) return p; if (p.b === null && !unknown) unknown = p; }
    return unknown || tri(true);
  }

  // applicability of a unit on a typed lot (rule 1). Tri-state.
  function applies(lt, u, stack) {
    if (u.layer === 'provincial') return provincialScope(lt, u);
    if (u.layer === 'exception') {
      if (!exceptionSet(lt).set.has(u.exception)) return tri(false);
    } else if (!(u.zones.includes('any') || u.zones.includes(lt.zone))) return tri(false);
    if (u.archetype !== 'PROCEDURAL' && !typeOK(u.types, lt.building_type)) return tri(false);
    const parts = [];
    if (u.part === 'map_area') {
      // lot.map_areas: an array of the map areas the lot is in (absent ⇒ map not held), or an object {ref: boolean}
      const ma = lt.map_areas;
      const vals = (u.refs.length ? u.refs : [u.reg]).map((r) => (Array.isArray(ma) ? ma.includes(r) : ma?.[r]));
      if (vals.some((v) => v === false)) return tri(false);
      parts.push(vals.every((v) => v === true) ? tri(true) : tri(null, 'map_area_not_held'));
    } else if (u.part === 'named_addresses' || u.part === 'lot_list') {
      const v = lt.named_lots?.[u.id] ?? lt.named_lots?.[u.reg];
      parts.push(v === true || v === false ? tri(v) : tri(null, 'named_lots_only'));
    }
    for (const t of u.tokens) parts.push(fact(lt, t));
    if (u.condError || u.thresholdWithoutIf) parts.push(tri(null, 'expression_error'));
    else if (u.condAst) {
      const env = { lot: lt, vocab, dropped: new Set(), enacted: enactedDates, trace: [], resolveTarget: (n) => resolveTyped(lt, n, stack) };
      const c = cond(u.condAst, env);
      parts.push(c.b === null ? tri(null, c.reason || 'condition_unknown') : tri(c.b));
    }
    return and3(parts);
  }

  // ------------------------------------------------ rule 2 helpers
  function displacerTargets(d) {
    if (d.ownTarget) return new Set([d.ownTarget]);
    return d.targets;
  }
  function targetOK(d, u) {
    const dt = displacerTargets(d);
    if (!dt.size) return true; // no target (DISAPPLY, PERMIT with target none): drops every unit it names
    for (const t of u.targets) if (dt.has(t)) return true;
    return u.ownTarget ? dt.has(u.ownTarget) : false;
  }

  // ------------------------------------------------ rule 2 (shared by effective and permitted)
  // displaces[] is irreflexive and acyclic (Spec 68 §6, checked by G-XREF); a cycle met here is recorded and
  // breaks as "not dropped", and nothing computed inside a cycle is memoised.
  function makeDropped(applicable) {
    const disp = [...applicable].filter((d) => d.displaces.length);
    const memo = new Map();
    const onPath = new Set();
    let cycleHit = false;
    const dropped = (u) => {
      if (memo.has(u)) return memo.get(u);
      if (onPath.has(u)) { cycleHit = true; return false; }
      onPath.add(u);
      let r = false;
      for (const d of disp) {
        if (d === u || !targetOK(d, u)) continue;
        if (!d.displaces.some((ref) => unitsForRef(ref).includes(u))) continue;
        if (!dropped(d)) { r = d.id; break; }
      }
      onPath.delete(u);
      if (!cycleHit) memo.set(u, r);
      return r;
    };
    return { disp, dropped, cycle: () => cycleHit };
  }
  // relevant units: the candidates plus the transitive closure of displacers naming any of them
  function relevantClosure(L) {
    const R = new Set(L);
    let grew = true;
    while (grew) {
      grew = false;
      for (const d of all) {
        if (R.has(d) || !d.displaces.length) continue;
        if (d.displaces.some((ref) => unitsForRef(ref).some((x) => R.has(x)) || (argRef(ref) || []).some((h) => R.has(h.unit)))) { R.add(d); grew = true; }
      }
    }
    return R;
  }

  // ------------------------------------------------ per-world resolution
  function evalUnit(lt, u, target, dropped, stack) {
    if (u.provincial) {
      const v = u.provincial.value;
      if (v === 'unlimited' || v === 'unregulated') return { k: v, path: u.provincial.citation };
      return { k: 'num', v, u: u.provincial.unit, path: u.provincial.citation };
    }
    if (u.errors.length) return { k: 'ne', reason: 'expression_error', detail: u.errors.join('; ') };
    const sts = u.statements.filter((s) => s.target === target);
    if (sts.length !== 1) return { k: 'ne', reason: 'expression_error', detail: `${sts.length} statements for ${target}` };
    const trace = [];
    const env = { lot: lt, vocab, dropped, enacted: enactedDates, trace, resolveTarget: (n) => resolveTyped(lt, n, stack) };
    const v = ev(sts[0].expr, env);
    return { ...v, path: sts[0].path, trace };
  }

  function combine(group, bound) {
    // rule 4a: all apply; most restrictive wins; exact disagreement / min above max => conflict
    const neg = group.find((g) => g.v.k === 'ne');
    if (neg) return { status: 'not_evaluated', reason: neg.v.reason, winner: neg.u.id, detail: neg.v.detail };
    const nums = group.filter((g) => g.v.k === 'num');
    if (bound === 'exact') {
      const keys = new Set(group.map((g) => (g.v.k === 'num' ? `n:${round(g.v.v)}` : g.v.k)));
      if (keys.size > 1) return { status: 'conflict', reason: 'eval_conflict', winner: null, members: group.map((g) => g.u.id) };
      const g = group[0];
      return g.v.k === 'num' ? { status: 'value', value: g.v.v, unit: g.v.u, winner: g.u.id, path: g.v.path } : { status: g.v.k, winner: g.u.id, path: g.v.path };
    }
    if (nums.length) {
      let best = nums[0];
      for (const g of nums.slice(1)) {
        if (bound === 'min' ? g.v.v > best.v.v + EPS : g.v.v < best.v.v - EPS) best = g;
      }
      return { status: 'value', value: best.v.v, unit: best.v.u, winner: best.u.id, path: best.v.path };
    }
    // only unlimited / unregulated remain. ASSUMPTION (ambiguity): unregulated preferred when both appear.
    const g = group.find((x) => x.v.k === 'unregulated') || group[0];
    return { status: g.v.k, winner: g.u.id, path: g.v.path };
  }
  const permissiveness = (r, bound) => {
    if (r.status === 'unlimited' || r.status === 'unregulated') return bound === 'max' ? Infinity : -Infinity;
    return r.value;
  };

  function resolveWorld(lt, target, applicable, L, stack, prevailing) {
    const notes = [...prevailing];
    const trace = [];
    const Lw = L.filter((u) => applicable.has(u));
    if (!Lw.length) {
      // rule 7a: no candidate of any layer; the lot's exception (if any) is captured; a cited absence ruling
      const exCaptured = !lt.exception || capturedExceptions.has(lt.exception);
      const abs = rulings.find((a) => a.zone === lt.zone && a.target === target);
      if (abs && exCaptured) return { status: 'unregulated', value: null, winner: null, evidence: 'absence', absence_id: abs.id, clause: null, notes: [...notes, `expert_sample:${abs.id}`], trace };
      return NE('no_candidate', { notes, trace });
    }
    // rule 2: drop displaced units (a displacer that is itself dropped displaces nothing)
    const { disp, dropped } = makeDropped(applicable);
    const survivors = [];
    for (const u of Lw) {
      const by = dropped(u);
      if (by) { trace.push(`rule2: ${u.id} displaced by ${by}`); continue; }
      survivors.push(u);
    }
    if (!survivors.length) return NE('no_candidate', { notes, trace: [...trace, 'rule7: every candidate displaced'] });
    // argument-level displacement
    const argDrops = new Map();
    for (const d of disp) {
      if (dropped(d)) continue;
      for (const ref of d.displaces) {
        const hosts = argRef(ref);
        if (!hosts) continue;
        for (const h of hosts) {
          if (!survivors.includes(h.unit) || !targetOK(d, h.unit)) continue;
          if (!argDrops.has(h.unit)) argDrops.set(h.unit, { paths: new Set(), missing: [] });
          if (h.unit.argPaths.has(h.argPath)) argDrops.get(h.unit).paths.add(h.argPath);
          else argDrops.get(h.unit).missing.push(ref);
        }
      }
    }
    // rule 3 (+ M-49): rank lift for units displacing a ranking PROCEDURAL rule
    const rankOf = (u) => {
      let r = LAYER_RANK[u.layer] ?? 0;
      for (const ref of u.displaces) {
        for (const p of unitsForRef(ref)) {
          if (p.archetype !== 'PROCEDURAL' || !p.ranks.length) continue;
          const h = Math.max(...p.ranks.map((x) => LAYER_RANK[x]));
          if (h + 0.5 > r) { r = h + 0.5; trace.push(`rule3: ${u.id} ranks above ${p.ranks.join('/')} (displaces ${p.id})`); }
        }
      }
      return r;
    };
    // evaluate each survivor
    const evald = [];
    for (const u of survivors) {
      const ad = argDrops.get(u);
      let v;
      if (ad && ad.missing.length) v = { k: 'ne', reason: 'displaced_argument_not_found', detail: ad.missing.join(',') };
      else v = evalUnit(lt, u, target, ad ? ad.paths : new Set(), stack);
      if (v.trace?.length) trace.push(...v.trace.map((t) => `${u.id}: ${t}`));
      const tu = vocab.dsl_target?.[target]?.unit;
      if (v.k === 'num' && tu && v.u !== tu) { notes.push(`unit_mismatch:${u.id}:${v.u}!=${tu}`); continue; }
      const bound = u.bound === 'min' || u.bound === 'max' || u.bound === 'exact' ? u.bound : 'exact';
      const rank = rankOf(u);
      evald.push({ u, v, bound, rank });
      trace.push(`${u.id} [${u.layer}, rank ${rank}, ${bound}] → ${v.k === 'num' ? `${round(v.v)} ${v.u}` : v.k === 'ne' ? `ne:${v.reason}` : v.k}`);
    }
    if (!evald.length) return NE('no_candidate', { notes, trace });
    // rule 4 per bound direction, then provincial yield
    const byDir = {};
    for (const bound of ['min', 'max', 'exact']) {
      const g = evald.filter((e) => e.bound === bound);
      if (!g.length) continue;
      const bl = g.filter((e) => e.u.layer !== 'provincial');
      const pv = g.filter((e) => e.u.layer === 'provincial');
      let res = null;
      if (bl.length) {
        const top = Math.max(...bl.map((e) => e.rank));
        const win = bl.filter((e) => e.rank === top);
        for (const e of bl) if (e.rank < top) trace.push(`rule4: ${e.u.id} replaced (${bound})`);
        res = combine(win, bound);
      }
      if (pv.length) {
        const p = combine(pv, bound);
        p.provincial = true;
        const mode = pv[0].u.provincial.bylaw_prevails;
        if (!res || mode === 'never') { if (res) trace.push(`rule4 provincial replaces by-law (${bound})`); res = p; } else if (res.status === 'not_evaluated' || res.status === 'conflict') {
          trace.push('provincial more_permissive: by-law result undecided');
        } else if (p.status === 'value' || p.status === 'unlimited' || p.status === 'unregulated') {
          const bp = permissiveness(res, bound); const pp = permissiveness(p, bound);
          const bylawMore = bound === 'max' ? bp > pp + EPS : bp < pp - EPS;
          if (bylawMore) notes.push(`bylaw_prevails:${pv[0].u.id}`); else res = p;
        } else res = p;
      }
      byDir[bound] = res;
    }
    const dirs = Object.keys(byDir);
    const vals = dirs.map((d) => byDir[d]);
    const ne = vals.find((r) => r.status === 'not_evaluated');
    if (ne) return NE(ne.reason, { notes, trace, winner: ne.winner, detail: ne.detail });
    if (vals.some((r) => r.status === 'conflict')) return { status: 'conflict', value: null, reason: 'eval_conflict', winner: null, evidence: 'none', notes, trace };
    const numOf = (r) => (r && r.status === 'value' ? r.value : null);
    const mn = numOf(byDir.min); const mx = numOf(byDir.max); const ex = numOf(byDir.exact);
    if ((mn !== null && mx !== null && mn > mx + EPS) || (ex !== null && ((mn !== null && ex < mn - EPS) || (mx !== null && ex > mx + EPS)))) {
      return { status: 'conflict', value: null, reason: 'eval_conflict', winner: null, evidence: 'none', notes, trace: [...trace, 'rule4a: min above max'] };
    }
    const bounds = {}; for (const d of dirs) bounds[d] = byDir[d].status === 'value' ? round(byDir[d].value) : byDir[d].status;
    if (dirs.length === 1) {
      const r = byDir[dirs[0]];
      return { status: r.status, value: r.status === 'value' ? round(r.value) : null, unit: r.unit ?? null, bound: dirs[0], bounds, winner: r.winner, applied: evald.map((e) => e.u.id),
        evidence: r.provincial ? 'provincial' : 'clause', clause: r.path ?? null, reason: null, notes, trace };
    }
    const primary = byDir.exact || byDir.max || byDir.min;
    return { status: 'value', value: null, unit: primary.unit ?? null, bound: 'several', bounds, applied: evald.map((e) => e.u.id), winner: primary.winner, evidence: primary.provincial ? 'provincial' : 'clause', clause: primary.path ?? null, reason: null, notes, trace };
  }

  // ------------------------------------------------ per typed lot: enumerate undecided worlds
  function resolveTyped(lt, target, stack = new Set()) {
    if (lt.__memo.has(target)) return lt.__memo.get(target);
    if (stack.has(target)) return NE('target_cycle', { trace: [`cycle at ${target}`] });
    const st = new Set(stack); st.add(target);
    const L = all.filter((u) => u.targets.has(target) && (u.statements.length || u.provincial || u.errors.length));
    const R = relevantClosure(L);
    const decided = new Set(); const unknown = [];
    for (const u of [...R].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      const a = applies(lt, u, st);
      if (a.b === true) decided.add(u); else if (a.b === null) unknown.push({ u, reason: a.reason });
    }
    const prevailing = prepared.filter((u) => u.archetype === 'PREVAILING' && applies(lt, u, st).b === true).map((u) => `alternate_path_not_evaluated:${u.id}`);
    const excNotes = exceptionSet(lt).notes;
    let result;
    if (unknown.length > MAX_UNKNOWN) result = NE(unknown[0].reason || 'condition_unknown', { trace: [`${unknown.length} undecided units: ${unknown.map((x) => x.u.id).join(', ')}`] });
    else if (!unknown.length) result = resolveWorld(lt, target, decided, L, st, prevailing);
    else {
      const worlds = [];
      for (let mask = 0; mask < (1 << unknown.length); mask += 1) {
        const A = new Set(decided);
        unknown.forEach((x, i) => { if (mask & (1 << i)) A.add(x.u); });
        worlds.push(resolveWorld(lt, target, A, L, st, prevailing));
      }
      const keys = new Set(worlds.map(canonical));
      const und = unknown.map((x) => `${x.u.id} (${x.reason})`);
      if (keys.size === 1) {
        // same answer in every world; if the deciding unit differs between worlds, say so rather than name one
        const winners = new Set(worlds.map((w) => w.winner ?? w.absence_id ?? null));
        result = { ...worlds[0], trace: [`undecided but immaterial: ${und.join(', ')}`, ...worlds[0].trace] };
        if (winners.size > 1) result = { ...result, winner: null, notes: [...(result.notes || []), `winner_varies_by_world:${[...winners].join('|')}`] };
      }
      else result = NE(unknown[0].reason || 'condition_unknown', { notes: prevailing, trace: [`undecided: ${und.join(', ')}`, `worlds: ${[...keys].join(' / ')}`] });
    }
    if (excNotes.length) result = { ...result, notes: [...(result.notes || []), ...excNotes] };
    if (!(result.reason === 'target_cycle' && stack.size)) lt.__memo.set(target, result);
    return result;
  }

  // ------------------------------------------------ public
  function resolveOne(lot, target) {
    if (!lot || !zonesKnown.has(lot.zone)) return NE('no_569_2013_zone', { trace: ['rule0: no 569-2013 zone'] });
    if (lot.building_type) return resolveTyped(typed(lot, lot.building_type), target);
    const per = {};
    for (const t of residentialTypes) per[t] = resolveTyped(typed(lot, t), target);
    const keys = new Set(Object.values(per).map(canonical));
    if (keys.size === 1) { const r = per[residentialTypes[0]]; return { ...r, trace: ['M-50: every residential type agrees', ...r.trace] }; }
    const brief = {}; for (const [t, r] of Object.entries(per)) brief[t] = { status: r.status, value: r.value, bounds: r.bounds, reason: r.reason, winner: r.winner };
    return NE('needs_user_input:building_type', { per_type: brief, trace: [`M-50 per type: ${Object.entries(brief).map(([t, r]) => `${t}=${r.status}:${r.value ?? r.reason}`).join(', ')}`] });
  }

  function permittedTyped(lt, bt) {
    const L = prepared.filter((u) => (u.archetype === 'PERMIT' || u.archetype === 'PROHIBIT') && typeOK(u.types, bt));
    const R = relevantClosure(L);
    const decided = new Set(); const unknown = [];
    for (const u of R) { const a = applies(lt, u, new Set()); if (a.b === true) decided.add(u); else if (a.b === null) unknown.push({ u, reason: a.reason }); }
    if (unknown.length > MAX_UNKNOWN) return { status: 'not_evaluated', reason: 'condition_unknown' };
    const world = (A) => {
      const Lw = L.filter((u) => A.has(u));
      if (!Lw.length) return { status: 'not_evaluated', reason: 'no_candidate' };
      const { dropped } = makeDropped(A);
      const surv = Lw.filter((u) => !dropped(u));
      if (!surv.length) return { status: 'not_evaluated', reason: 'no_candidate' };
      const rank = (u) => { let r = LAYER_RANK[u.layer] ?? 0; for (const ref of u.displaces) for (const p of unitsForRef(ref)) if (p.archetype === 'PROCEDURAL' && p.ranks.length) r = Math.max(r, Math.max(...p.ranks.map((x) => LAYER_RANK[x])) + 0.5); return r; };
      const top = Math.max(...surv.map(rank));
      const win = surv.filter((u) => rank(u) === top);
      const kinds = new Set(win.map((u) => u.archetype));
      // ASSUMPTION (ambiguity): PERMIT and PROHIBIT at one rank are two different exact answers => conflict
      if (kinds.size > 1) return { status: 'conflict', reason: 'eval_conflict', members: win.map((u) => u.id) };
      return { status: kinds.has('PERMIT') ? 'permitted' : 'prohibited', winner: win[0].id };
    };
    if (!unknown.length) return world(decided);
    const ws = [];
    for (let mask = 0; mask < (1 << unknown.length); mask += 1) { const A = new Set(decided); unknown.forEach((x, i) => { if (mask & (1 << i)) A.add(x.u); }); ws.push(world(A)); }
    const keys = new Set(ws.map((w) => `${w.status}|${w.reason || ''}`));
    return keys.size === 1 ? ws[0] : { status: 'not_evaluated', reason: unknown[0].reason || 'condition_unknown' };
  }

  return {
    version: ORACLE_B_VERSION,
    resolve: resolveOne,
    permitted(lot, bt) {
      if (!lot || !zonesKnown.has(lot.zone)) return { status: 'not_evaluated', reason: 'no_569_2013_zone' };
      return permittedTyped(typed(lot, bt), bt);
    },
    targets() {
      const s = new Set(); for (const u of all) for (const t of u.targets) s.add(t);
      return [...s].sort();
    },
  };
}

/** resolve(lot, units, {vocab, absences, externals, targets?}) → { [target]: result } */
export function resolve(lot, units, opts = {}) {
  const o = createOracle({ ...opts, units });
  const out = {};
  for (const t of opts.targets || o.targets()) out[t] = o.resolve(lot, t);
  return out;
}
