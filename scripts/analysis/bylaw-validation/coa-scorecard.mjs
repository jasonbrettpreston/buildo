// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-125, M-127, M-236 dated note 2026-10-20
// DRAFT RULING pending (operator): this read-only tool scores the committed evaluator against City examiner figures from CoA notices.
//
// CoA scorecard. READ-ONLY: reads the tree at --root, parser-shaped notices, a frozen parcels snapshot; writes a scorecard JSON.
// Assembly = assembly.mjs loadRealLotAssembly (what eval-lots.mjs and the golden-lot helper use) + vocab design_choice_disclosure.default_overrides.
// Classes: MATCH / DIFFER / NO ANSWER / OWED / ANSWERED (no City figure; CHAT-198.NN-Q1: in the answered numerator and denominator, out of accuracy, listed by name) / NOT MODELLED / DATA (explained data flag) / NOT SCORABLE (non-569 zone or unmatched address; F-4D-20; excluded from both percentages).
// Lot figures in --plan-facts are read in M-326 order (CHAT-156 / CHAT-163; coa-lotfacts.mjs); a parcel row >5% off the figure used is flagged (M-308, F-4D-8/9/14); held-but-unread plan figures are shown in lot_held_unread (CHAT-165). Calculator survey override is drafted, not built (owed).
// Scorer fixes marked "4D-S<n>" (S1-S7) came from the four-district run at ac78d5dd.
// Classes also: BY-LAW CHANGED (C-3: the cited provision has an amendment tag with a VERIFIED in-force date after the hearing; in neither percentage). A tag with no verified date leaves the class and sets amendment_status 'unverified'.
// Usage: node scripts/analysis/bylaw-validation/coa-scorecard.mjs --notices N.json --parcels P.json --out O.json [--root R] [--plan-facts DIR] [--check EXPECTED.json]
//   --pin FILE: write the expected file for this run at this tree ({commit, totals, inputs}).
//   --floors FILE: fail (exit 1) when accuracy / answered fall below the committed floors (C-5); a failing line named by an owing register row (M-372..M-374) prints as OWED, in its own section, never PASS (exit 0 only when every line is PASS or OWED); with --accept --ruling=<RATIFIED or RULED id> --line="article 150.8.60" (repeatable, optional =value) only the named lines are rewritten from this run (the one door, Spec 133 m.56; P2C-Q5).
//   --prereg FILE [--baseline SCORECARD.json]: record expected against actual moves and totals (C-4); an unexpected move, a missing move, a totals difference or an uncommitted file is a FINDING (exit 1).
//   --check: after scoring, compare the class totals with EXPECTED.json {commit, totals}; exit 1 on a mismatch when --root is at that commit,
//            otherwise print the diff as information only (the evaluator moved on; a changed total is a finding, not a failure).
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
import { normClause, unitsForClause, correctionFor } from './coa-clausemap.mjs';
import { execFileSync } from 'node:child_process';
import { checkExplainedDifferences, explainRow } from './coa-explained.mjs';
import * as RD from './coa-round.mjs';
import * as LF from './coa-lotfacts.mjs';
import { readSpec69Rulings, parseRulings } from '../bylaw/universe.mjs';
import { createRequire } from 'node:module';
const CP = createRequire(import.meta.url)('./coa-parse.cjs'); // referentFigure (CHAT-198.NN-Q1)

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')));
const NOT = arg('notices'); const PAR = arg('parcels'); const OUT = arg('out'); const CHECK = arg('check');
if (!NOT || !PAR || !OUT) { console.error('usage: coa-scorecard.mjs --notices N.json --parcels P.json --out O.json [--root R] [--plan-facts DIR] [--check EXPECTED.json] [--pin EXPECTED.json]'); process.exit(2); }
const { I, E, units, C } = await (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href)).loadRealLotAssembly(ROOT);
const REGISTER_IDS = new Set((fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/69a_mcbylaw_register.md'), 'utf8').match(/^\| \*\*M-\d+\*\*/gm) || []).map((x) => x.replace(/[|* ]/g, '')));
const EXPLAINED_BAD = checkExplainedDifferences(I.vocab, REGISTER_IDS);
if (EXPLAINED_BAD.length) { console.error('vocab.explained_differences is invalid:\n  ' + EXPLAINED_BAD.join('\n  ')); process.exit(2); }
const FA = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/front-averaging.mjs')).href);
const MB = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/main-building-gfa.mjs')).href); // CHAT-198.NN-Q3
const defaults = {}; for (const [k, v] of Object.entries((I.vocab.design_choice_disclosure || {}).default_overrides || {})) if (k !== '$comment' && v && typeof v.taken_as === 'boolean') defaults[k] = v.taken_as;
const SCU = I.vocab.scenario_class_units || {};
const PROV_BY = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-provisions.json'), 'utf8')).rows.map((r) => [r.regulation_id, r]));
const AMD_STATUSES = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/amendments.json'), 'utf8')).statuses;
const notices = JSON.parse(fs.readFileSync(NOT, 'utf8')); const parcels = JSON.parse(fs.readFileSync(PAR, 'utf8'));
const PF_DIR = arg('plan-facts', process.env.PLAN_FACTS || null);
// CHAT-164: the read-record (default: the committed file beside the pins); --read-record none switches it off. A malformed record stops the run.
const RR_PATH = arg('read-record', path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-expected/read-record-chat164.json'));
const READ_RECORD = RR_PATH !== 'none' && fs.existsSync(RR_PATH) ? JSON.parse(fs.readFileSync(RR_PATH, 'utf8')) : null;
if (READ_RECORD) { const bad = LF.checkReadRecord(READ_RECORD); if (bad.length) { console.error('read-record is invalid:\n  ' + bad.join('\n  ')); process.exit(2); } }
// 4D-S4: openings evidence (notice text or plan facts) → take the blank_side_wall:false arm
const OPEN_RE = /\b(windows?|openings?|doors?)\s+(in|on)\s+(the\s+)?(\w+\s+)?(side|main)\s+walls?|(?<!no\s)openings to dwelling units|side wall (has|with) (windows|openings)/i;
function openingsEvidence(n) {
  const txt = [n.purpose, ...n.variances.flatMap((v) => [v.requirement, v.proposal])].join(' ');
  if (OPEN_RE.test(txt)) return 'notice text';
  if (PF_DIR) { try { const pf = fs.readFileSync(path.join(PF_DIR, n.file_number.replace('/', '-') + '.json'), 'utf8'); if (/windows? in (the )?side wall|side wall[^"]{0,20}(windows|openings)/i.test(pf)) return 'plan facts'; } catch {} }
  return null;
}
// 4D-S2/S3: which role the City figure plays in the requirement text (width / clearance / encroachment)
function figureRole(req, val) {
  const t = String(req || ''); if (val == null) return null;
  const re = /\d+(?:\.\d+)?/g; let m; let pos = -1;
  while ((m = re.exec(t))) if (Math.abs(Number(m[0]) - val) < 1e-9) { pos = m.index; break; }
  if (pos < 0) return null;
  const before = t.slice(Math.max(0, pos - 45), pos);
  if (/(wide|width)[^.]{0,25}$/i.test(before)) return 'width';
  if (/(lot line|closer|from|distance|clear(ance)?)[^.]{0,30}$/i.test(before) || /^[^.]{0,30}(from|to) (the|a|any) [^.]{0,15}lot line/i.test(t.slice(pos))) return 'clearance';
  if (/(encroach|project|extend|into)[^.]{0,40}$/i.test(before)) return 'encroachment';
  return null;
}
// M-245 (card FS-SB1): the allowance is the logic variable fya_porch_allowance_m, read from the one table the product path reads; FYA_ALLOWANCE overrides it for an experiment only
const LOGIC_VARS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8')); // logic_variables.json
const FYA_ALLOWANCE = process.env.FYA_ALLOWANCE ? Number(process.env.FYA_ALLOWANCE) : LOGIC_VARS.fya_porch_allowance_m.default;
const FYA_TABLE = { ...LOGIC_VARS, fya_porch_allowance_m: FYA_ALLOWANCE }; // the scorer holds no same-street pool, so it passes no placeholder context and the 6.0 m default answers (prereg-fsb2.json)

// ---------- label parsing (pull-lots.cjs:9-15, verbatim logic) ----------
const EXC_CH = { R: 2, RD: 3, RS: 4, RT: 5, RM: 6 };
function parseLabel(zn) {
  const m = /^\s*([A-Z]+)\s*(?:\(([^)]*)\))?/.exec(zn || ''); const label = {};
  if (m && m[2]) for (const part of m[2].split(';')) { const p = /^\s*([a-wyz][a-z]?)\s*([\d.]+)\s*$/.exec(part); if (p) label[p[1]] = Number(p[2]); }
  const x = /\(x(\d+)\)/.exec(zn || '');
  return { label, exc: x ? Number(x[1]) : null };
}
function lotFromParcel(p) {
  const { label, exc } = parseLabel(p.zoning_zn_string);
  const ov = p.zoning_overlays || {}; const overlays = {};
  if (ov.height_overlay && ov.height_overlay.applied) { if (ov.height_overlay.height_max_m != null) overlays.HT = Number(ov.height_overlay.height_max_m); if (ov.height_overlay.stories != null) overlays.ST = Number(ov.height_overlay.stories); }
  if (ov.lot_coverage_overlay && ov.lot_coverage_overlay.applied && ov.lot_coverage_overlay.coverage_max_pct != null) overlays.LC = Number(ov.lot_coverage_overlay.coverage_max_pct);
  return {
    zone: p.zoning_class, zone_label: p.zoning_zn_string, label, overlays,
    vars: { lot_frontage_m: p.frontage_m, lot_depth_m: p.depth_m, lot_area_m2: p.lot_size_sqm },
    flags: { corner_lot: !!p.is_corner_lot, through_lot: !!p.is_through_lot, major_street: !!p.on_policy_road, abuts_lane: !!p.abuts_laneway, lawfully_existing: false },
    primary_frontage_street_name: p.primary_frontage_street_name ?? p.linear_name_full ?? undefined, // M-285 (F-4D-7)
    building_type: 'detached_house', exception: exc != null ? `900.${EXC_CH[p.zoning_class]}.10(${exc})` : null, parcel_id: p.parcel_id,
    address: [p.address_number, p.linear_name_full].filter(Boolean).join(' '),
  };
}

// ---------- label comparison ----------
function labelCompare(city, ours) {
  const c = city || {}; const o = parseLabel(ours); const oz = /^\s*([A-Z]+)/.exec(ours || '')?.[1] || null;
  const issues = []; const soft = [];
  if (!c.zone) soft.push(`city label "${c.label}" is not a 569-2013 zone`);
  else if (c.zone !== oz) issues.push(`zone ${c.zone} vs ours ${oz}`);
  for (const k of ['f', 'a', 'd', 'u']) {
    const cv = c[k]; const ov = o.label[k];
    if (cv != null && ov != null && Math.abs(cv - ov) > 1e-6) issues.push(`${k}${cv} vs ours ${k}${ov}`);
    else if (cv != null && ov == null) issues.push(`city ${k}${cv}, ours none`);
    else if (cv == null && ov != null) soft.push(`city label omits ${k}${ov}`);
  }
  const cx = (c.exceptions || []).map((x) => Number(String(x).replace(/\D/g, ''))); const ox = o.exc;
  if (cx.length && ox != null && !cx.includes(ox)) issues.push(`x${cx.join(',')} vs ours x${ox}`);
  else if (cx.length && ox == null) issues.push(`city x${cx.join(',')}, ours none`);
  else if (!cx.length && ox != null) soft.push(`city label omits x${ox}`);
  return { hard: issues, soft };
}

// ---------- implied lot area ----------
const LOTAREA_RE = /(lot area|area of the lot)/i;
function impliedArea(n) {
  const est = [];
  for (const v of n.variances) {
    for (const [txt, all] of [[v.requirement, v.required_all], [v.proposal, v.proposed_all]]) {
      if (!txt || !LOTAREA_RE.test(txt) || !all) continue;
      const r = all.find((x) => x.unit === '× lot area' || x.unit === '%'); const a = all.find((x) => x.unit === 'm²');
      if (!r || !a || !r.value) continue;
      const ratio = r.unit === '%' ? r.value / 100 : r.value; if (ratio <= 0) continue;
      est.push({ from: `${v.clause} ${txt === v.requirement ? 'requirement' : 'proposal'}`, area: Math.round((a.value / ratio) * 100) / 100, exact: txt === v.requirement });
    }
  }
  if (!est.length) return null;
  const pick = est.find((e) => e.exact) || est.slice().sort((a, b) => a.area - b.area)[Math.floor(est.length / 2)];
  return { area: pick.area, from: pick.from, all: est };
}

// ---------- building type ----------
function mainType(purpose) {
  const p = String(purpose || '').toLowerCase();
  const within = /(\w+) units? within the main (?:building|dwelling)/.exec(p);
  const W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const num = (s) => (W[s] ?? Number(s));
  if (/apartment building/.test(p)) { const m = /total of (\w+) dwelling units/.exec(p); return { bt: 'apartment_building', units: m ? num(m[1]) : 6 }; }
  if (/total of (\w+) dwelling units will be provided/.test(p)) { const m = /total of (\w+) dwelling units/.exec(p); return { bt: 'apartment_building', units: num(m[1]) }; }
  // 4D-S7: a townhouse notice is scored as a townhouse (was: detached_house)
  if (/townhouse|row house/.test(p)) return { bt: 'townhouse', units: 1 };
  if (/fourplex/.test(p)) return { bt: 'detached_houseplex', units: 4 };
  if (/triplex/.test(p)) return { bt: 'detached_houseplex', units: 3 };
  if (/houseplex/.test(p)) return { bt: 'detached_houseplex', units: within ? num(within[1]) : 4 };
  if (/converted into a duplex|duplex/.test(p)) return { bt: 'detached_houseplex', units: 2 };
  // CHAT-45 (D-LIPPINCOTT): "mixed-used semi-detached building" is typed semi-detached, as the City notice words it (not mixed-use)
  if (/(existing|new)[^.]{0,40}semi-detached (dwelling|building)/.test(p)) {
    const two = /two residential dwelling units in this dwelling/.test(p);
    return two ? { bt: 'semi_detached_houseplex', units: 2 } : { bt: 'semi_detached_house', units: 1 };
  }
  // MB-59 (FS-Q1): "convert the existing 2 unit dwelling to 3 units" is a three-unit detached houseplex, so the unit-count rules (maximum bedrooms 3 x units, 10.20.40.1(8)(B)) have their input
  const conv = /\bconvert[^.]{0,80}?\bto (\w+) (?:dwelling )?units?\b/.exec(p);
  if (conv && num(conv[1]) >= 2) return { bt: 'detached_houseplex', units: num(conv[1]) };
  return { bt: 'detached_house', units: within ? num(within[1]) : 1 };
}
const SUITE_TYPES = ['garden_suite', 'laneway_suite', 'ancillary_building'];
function clauseType(c, matched, main) {
  if (/^150\.7\./.test(c.norm)) return 'garden_suite';
  if (/^150\.8\./.test(c.norm)) return 'laneway_suite';
  if (/^10\.\d+\.60\./.test(c.norm)) return 'ancillary_building';
  const bts = new Set(matched.filter((u) => u.archetype === 'LIMIT').flatMap((u) => u.application?.building_types || []));
  if (bts.size && [...bts].every((b) => SUITE_TYPES.includes(b))) return [...bts][0];
  return main.bt;
}

// ---------- scope, family, comparison ----------
function outOfScope(c, v) {
  const s = c.norm || '';
  if (!c.section || !/^(5|10|150|200|230|900)\./.test(s) && !/^\d+\.\d+\.\d+\.\d+/.test(s)) return 'former by-law clause (not 569-2013)';
  if (/^(13\.2\.6|3\.4\.11|6\(30\))/.test(s)) return 'former by-law clause (not 569-2013)';
  if (/^200\./.test(s) || /^10\.5\.80\./.test(s)) return 'parking';
  if (/^10\.5\.100\./.test(s)) return 'driveway';
  if (/^230\./.test(s)) return 'bicycle parking';
  if (/^10\.5\.150\./.test(s)) return 'waste storage';
  if (/^10\.5\.40\.60\(3\)\(a\)\(ii\)/i.test(s)) return 'stairs width';
  if (/^5\.10\./.test(s)) return 'shoreline / ravine (Ch.5 TRCA hazard)';
  if (/^10\.5\.60\.1\(3\)/.test(s)) return 'ancillary-building use (food preparation / sanitary facilities)';
  if (/^10\.5\.50\.10\([45]\)/.test(s)) return 'apartment-only provision, out of scope'; // CHAT-197.FS-Q2
  return null;
}
const ELEMENT_TARGETS_OLD = new Set(['encroachment_m', 'encroachment_clearance_m', 'element_width_pct', 'platform_height_m', 'height_projection_m']);
// scorecard2: D-3 split encroachment_m into per-element targets (<element>_encroachment_m / <element>_clearance_m)
const ELEMENT_TARGETS = { has: (t) => ELEMENT_TARGETS_OLD.has(t) || /_(encroachment|clearance)_m$/.test(t || '') };
function tagTargets(matched, c) {
  if (!c.path) return [];
  const hits = [];
  for (const u of matched) for (const st of [].concat(u.numeric_expression || [])) {
    if (typeof st !== 'string') continue; const lhs = (/^\s*([a-z0-9_]+)\s*=/.exec(st) || [])[1]; if (!lhs) continue;
    const tags = [...st.matchAll(/@(\([^\s;)]*\)(?:\[[A-Z]+\])?(?:\([^\s;)]*\))*)/g)].map((m) => m[1].replace(/\[[A-Z]+\]/g, '').toLowerCase());
    const best = Math.max(0, ...tags.map((t) => (t.startsWith(c.path) ? c.path.length : c.path.startsWith(t) ? t.length : 0)));
    if (best) hits.push({ lhs, best });
  }
  const top = Math.max(0, ...hits.map((h) => h.best));
  return [...new Set(hits.filter((h) => h.best === top).map((h) => h.lhs))];
}
function pickTarget(targets, unit, c, matched) {
  if (!targets.length) return null;
  const byU = (t) => unit === '× lot area' ? t === 'fsi' : unit === '%' ? /_pct$/.test(t) : unit === 'm²' ? /_m2$/.test(t) : unit === 'storeys' ? t === 'height_storeys' : unit === 'm' ? /_m$/.test(t) : true;
  const tagged = tagTargets(matched || [], c).filter((t) => targets.includes(t) && byU(t));
  if (tagged.length) targets = tagged;
  if (targets.length > 1 && targets.some((t) => /setback/.test(t))) targets = [...targets.filter((t) => /setback/.test(t)), ...targets.filter((t) => !/setback/.test(t))];
  const byUnit = (t) => unit === '× lot area' ? t === 'fsi' : unit === '%' ? /_pct$/.test(t) : unit === 'm²' ? /_m2$/.test(t) : unit === 'storeys' ? t === 'height_storeys' : unit === 'm' ? /_m$/.test(t) : true;
  let ts = targets.filter(byUnit); if (!ts.length) ts = targets;
  if (ts.length > 1 && ts.includes('side_setback_m') && ts.includes('side_setback_street_m')) ts = ['side_setback_m'];
  if (ts.length > 1 && ts.includes('front_soft_landscaping_pct')) ts = ['front_soft_landscaping_pct'];
  if (ts.length > 1 && ts.includes('lot_coverage_pct') && ts.includes('ancillary_coverage_pct')) ts = ['ancillary_coverage_pct'];
  return ts[0];
}
function family(c, target, bt) {
  const s = c.norm || '';
  if (/^150\.[78]\./.test(s)) return 'suites';
  if (/^10\.\d+\.60\./.test(s) || bt === 'ancillary_building' || target === 'ancillary_coverage_pct' || target === 'ancillary_floor_area_m2') return 'ancillary';
  if (/^10\.5\.40\.(50|60)/.test(s) || /^10\.\d+\.40\.50/.test(s) || (/^(encroachment|platform|element_width|height_projection)/.test(target || '') || /_(encroachment|clearance)_m$/.test(target || ''))) return 'encroachment/platform';
  const T = { fsi: 'FSI', gfa_m2: 'FSI', lot_coverage_pct: 'coverage', height_m: 'height', main_wall_height_m: 'main wall', height_storeys: 'storeys',
    front_setback_m: 'front', side_setback_m: 'side', side_setback_street_m: 'side', rear_setback_m: 'rear', building_length_m: 'length', building_depth_m: 'depth',
    required_lot_frontage_m: 'lot frontage/area', required_lot_area_m2: 'lot frontage/area', entrance_height_m: 'height' };
  if (target && T[target]) return T[target];
  if (target && /landscaping/.test(target)) return 'landscaping';
  if (/^10\.5\.50\./.test(s) || /^10\.\d+\.50\./.test(s)) return 'landscaping';
  if (/^10\.\d+\.40\.40/.test(s)) return 'FSI';
  if (/^10\.\d+\.30\.40/.test(s)) return 'coverage';
  if (/^10\.\d+\.40\.10/.test(s)) return 'height';
  if (/^10\.\d+\.40\.20/.test(s)) return 'length';
  if (/^10\.\d+\.40\.70/.test(s) || /^900\./.test(s)) return 'side';
  return 'other';
}
const tol = (unit) => unit === '%' ? 0.5 : unit === 'm²' ? 1 : unit === '× lot area' ? 0.005 : unit === 'storeys' ? 0 : 0.01;
const OWED_TOKENS = new Set(['front_averaging_not_applicable', 'one_abutting_building_within_15_m', 'two_abutting_buildings_within_15_m', 'flat_or_shallow_roof',
  'has_secondary_suite', 'has_garden_suite', 'has_laneway_suite', 'blank_side_wall', 'suite_wall_openings', 'all_units_front_street', 'individual_private_driveway']);
function owedOrNoAnswer(reason) {
  const r = String(reason || ''); const code = r.split(':')[0]; const det = r.slice(code.length + 1);
  if (code === 'missing_input' || code === 'needs_user_input' || code === 'existing_building_facts') return 'OWED';
  if (code === 'condition_unknown' && OWED_TOKENS.has(det)) return 'OWED';
  return 'NO ANSWER';
}
const slim = (r) => ({ status: r.status, value: r.value ?? null, reason: r.reason ?? null, winner: r.winner ? (r.winner.unit_id || r.winner) : null,
  applied: (r.applied || []).map((a) => (typeof a === 'string' ? a : a.unit_id || a.id)).filter(Boolean).slice(0, 6) });
const regOf = (id) => String(id || '').split('#')[0].replace(/[@~].*$/, '');

function makeLot(base, bt, nunits, extra = {}) {
  const cls = SCU[bt] || {}; const hu = cls.house_units; const house = typeof hu === 'object' ? Math.max(nunits, hu.min || 0) : (hu ?? nunits);
  return { ...base, building_type: bt, ...(extra.lot || {}),
    vars: { ...base.vars, dwelling_units: nunits, ...(extra.vars || {}) },
    flags: { ...defaults, ...base.flags, ...(extra.flags || {}) } };
}
function evalTarget(lot, target, onlyUnits) {
  const { candidates } = E.loadCandidates(lot, units);
  // element targets: drop only the OTHER units on the same target (other elements' limits); every other unit stays (exception gate, displacers)
  const cand = onlyUnits ? candidates.filter((u) => onlyUnits.has(u.unit_id) || ![].concat(u.target || []).includes(target)) : candidates;
  try { return slim(E.effective(lot, target, cand, C)); } catch (err) { return { status: 'error', reason: String(err.message).slice(0, 160) }; }
}

// ---------- main ----------
// F-4D-8/9/14 + CHAT-156 / CHAT-163 (amends CHAT-145 C): lot figures in M-326 order from coa-lotfacts.mjs; a parcel row >5% off the figure used is flagged (M-308).
// planFacts: the parsed plan-facts record, or null when absent or unparseable (the F-4D-8/9/14 fence); lotFigures is total on any JSON value.
function planFacts(n) {
  if (!PF_DIR) return null;
  try { return JSON.parse(fs.readFileSync(path.join(PF_DIR, n.file_number.replace('/', '-') + '.json'), 'utf8')); } catch { return null; }
}
const surveyCheck = LF.lotCheck;
function applySurvey(base, sv) {
  if (!sv) return base;
  const vars = { ...base.vars }; if (sv.frontage_m != null) vars.lot_frontage_m = sv.frontage_m; if (sv.depth_m != null) vars.lot_depth_m = sv.depth_m; if (sv.area_m2 != null) vars.lot_area_m2 = sv.area_m2;
  return { ...base, vars, flags: sv.corner != null ? { ...base.flags, corner_lot: sv.corner } : base.flags };
}
const ANSWERED = RD.ANSWERED_CLASS;
const rows = []; const lots = {};
function runNotice(n, surveyOn, rows, lots) {
  const P = parcels[n.file_number] || { parcels: [] };
  const uniq = [...new Map(P.parcels.map((p) => [p.id, p])).values()];
  const p = uniq[0] || null;
  const main = mainType(n.purpose);
  const ia = impliedArea(n);
  const lc = p ? labelCompare(n.zoning, p.zoning_zn_string) : null;
  const areaGapPct = p && ia ? Math.round(((p.lot_size_sqm - ia.area) / ia.area) * 1000) / 10 : null;
  const nonRes = n.zoning && n.zoning.zone && !['R', 'RD', 'RS', 'RT', 'RM'].includes(n.zoning.zone);
  const pf = planFacts(n); const rrec = LF.readRecordFor(READ_RECORD, n.file_number); const sv = LF.lotFigures(pf, rrec); const svc = surveyCheck(sv, p);
  const base = p ? (surveyOn ? applySurvey(lotFromParcel(p), sv) : lotFromParcel(p)) : null;
  const openings = openingsEvidence(n);
  // CHAT-198 (2026-10-29-batch-aa): the applicant's own figures from the plan facts feed the model's inputs where held (validation only; the product is unchanged, M-286).
  const AF = LF.applicantFigures(pf);
  const MG = MB.resolveMainBuildingGfa({ plan_gfa_m2: AF.existing_gfa_m2, max_build_gfa_m2: p ? p.max_buildable_gfa_sqm : null }); // NN-Q3: plan facts, then the user's footprint and storeys (none in a scorer run), then the maximum build
  const UFA = AF.neighbour_front_setbacks_m.length ? FA.resolveFrontSetback([], FYA_TABLE, { zone_default_m: 0 }, { neighbour_front_setbacks_m: AF.neighbour_front_setbacks_m }) : null; // NN-Q4
  const applicantInputs = (bt) => {
    const vars = {}; const flags = {}; const basis = {};
    if (MG.value != null) { vars.main_building_gfa_m2 = MG.value; basis.main_building_gfa_m2 = MG.basis; }
    if (['garden_suite', 'laneway_suite'].includes(bt)) { // NN-Q2: M-291 keeps a non-suite ancillary building owed
      if (AF.suite_height_m != null) { vars.proposed_height_m = AF.suite_height_m; basis.proposed_height_m = 'plan_facts'; }
      if (AF.suite_separation_m != null) { vars.distance_to_residential_m = AF.suite_separation_m; basis.distance_to_residential_m = 'plan_facts'; }
    }
    if (UFA && UFA.basis === 'user_supplied') { Object.assign(vars, UFA.vars); Object.assign(flags, UFA.flags); basis.abutting_front_setback_m = 'plan_facts neighbour_front_setbacks_m'; }
    return { vars, flags, basis };
  };
  const LS = LF.lotSourceOf(surveyOn ? sv : null, p); const LD = LF.lotDisclosure(LS); // CHAT-156: lot_source on every row; non-survey disclosed
  const LU = LF.lotHeldUnread(pf, p, rrec); // CHAT-165: plan figures held but not read (values only; no class or value moves)
  lots[n.file_number] = { address: n.address, city_label: n.zoning?.label, kind: n.kind, hearing_date: n.hearing_date, purpose: n.purpose, main_type: main,
    parcel: p ? { id: p.id, parcel_id: p.parcel_id, label: p.zoning_zn_string, frontage_m: p.frontage_m, depth_m: p.depth_m, lot_area_m2: p.lot_size_sqm, lot_size_basis: p.lot_size_basis, lot_size_confidence: p.lot_size_confidence,
      corner: p.is_corner_lot, lane: p.abuts_laneway, major: p.on_policy_road, geog_area: p.geog_area, n_parcels: uniq.length } : null,
    match_how: P.how, label_check: lc, survey_check: svc, survey_preferred: !!(surveyOn && LF.surveyRead(sv)), lot_source: LS, lot_disclosure: LD, lot_held_unread: LU, implied_area: ia, area_gap_pct: areaGapPct, non_residential: !!nonRes,
    legacy: p ? { max_buildable_gfa_sqm: p.max_buildable_gfa_sqm, max_buildable_gfa_basis: p.max_buildable_gfa_basis, max_build_fsi: p.max_build_fsi, bylaw_max_fsi: p.bylaw_max_fsi,
      bylaw_max_coverage_pct: p.bylaw_max_coverage_pct, max_buildable_footprint_sqm: p.max_buildable_footprint_sqm, max_build_height_m: p.max_build_height_m, max_build_stories: p.max_build_stories, max_build_basis: p.max_build_basis } : null };

  for (const v of n.variances) {
    const cc = correctionFor(n.file_number, v); // case-data correction (M-75 form): recorded on the row with its evidence, the printed record untouched
    const c = normClause(cc && cc.clause ? cc.clause : v.clause);
    if (cc) c.note = `case-data correction: printed "${v.clause}"${cc.clause ? ` read as ${cc.clause}` : ''}${cc.required_value !== undefined ? `; required figure ${v.required.value} read as ${cc.required_value}` : ''}. Evidence: ${cc.evidence}`;
    if (c.norm === '10.20.40.20') { c.reg = '10.20.40.20(1)'; c.path = '(1)'; c.note = 'notice omits the subsection; read as (1)'; }
    const matched = unitsForClause(c, units);
    const targets = [...new Set(matched.flatMap((u) => [].concat(u.target || [])).filter((t) => t && t !== 'none'))];
    let cityUnit = v.required?.unit ?? null; let cityVal = cc && cc.required_value !== undefined ? cc.required_value : (v.required?.value ?? null);
    // 4D-S5: platform clauses open with the definition "attached to or less than 0.3 m from a building"; that 0.3 m is not the limit. Take the next figure.
    let s5 = null; const ra = (v.required_all || []).filter((x) => x.unit === 'm');
    if (cityUnit === 'm' && cityVal === 0.3 && /(less than|within) 0\.3 ?m (from|of) a building/i.test(v.requirement || '') && ra.length > 1) { s5 = `definition figure 0.3 m dropped; City figure taken as ${ra[1].value} m`; cityVal = ra[1].value; }
    // F-4D-13: same definition in the wording "within 0.3 m of the (rear) main wall"; the limit is the last m figure that is not a height "above grade" (none: no numeric limit)
    else if (cityUnit === 'm' && cityVal === 0.3 && /(less than|within|attached to or within) 0\.3 ?m (from|of) the (\w+ )?main wall/i.test(v.requirement || '')) {
      const lim = [...String(v.requirement).matchAll(/(\d+(?:\.\d+)?) ?m(?![\w²2])(?! above)/g)].map((m) => Number(m[1])).filter((x, i) => !(i === 0 && x === 0.3)).pop();
      s5 = lim != null ? `definition figure 0.3 m (main wall) dropped; City figure taken as ${lim} m` : 'definition figure 0.3 m (main wall) dropped; no numeric limit stated'; cityVal = lim ?? null; if (lim == null) cityUnit = null;
    }
    // MB-03: the reader now skips the 0.3 m definition itself; the row still records that the definition was in the sentence and was not the limit.
    if (!s5 && cityUnit === 'm' && cityVal !== 0.3 && /(less than|within|attached to or within) 0\.3 ?m (from|of) (a building|the (\w+ )?main wall)/i.test(v.requirement || '')) s5 = `definition figure 0.3 m skipped by the notice reader; City figure ${cityVal} m`;
    // NN-Q1: where the notice prints the other building's figure, that figure is the City comparator (parser: coa-parse.cjs referentFigure)
    let referentNote = null;
    if (cityVal == null && cityUnit == null) { const rf = CP.referentFigure(v.requirement, v.proposal); if (rf) { cityVal = rf.value; cityUnit = rf.unit; referentNote = `the notice prints the other building's figure: ${rf.value} ${rf.unit} is the City comparator (CHAT-198.NN-Q1)`; } }
    let target = pickTarget(targets, cityUnit, c, matched);
    // the notice names the lot line: a setback clause keyed to several setback targets follows it
    let lineNote = null;
    if (target && /_setback(_street)?_m$/.test(target) && targets.filter((t) => /setback/.test(t)).length > 1) {
      const pt = String(v.proposal || '');
      const want = /\bside\b[^.]{0,20}lot line|side yard/i.test(pt) ? 'side_setback_m' : /\brear\b[^.]{0,20}lot line|rear yard/i.test(pt) ? 'rear_setback_m' : null;
      if (want && want !== target && !(want === 'side_setback_m' && target === 'side_setback_street_m')) { lineNote = `notice names the ${want.split('_')[0]} lot line; clause keyed to ${targets.join('+')}`; target = want; }
    }
    // MB-03: the parser now returns the figure after the "within 0.3 m of a building" definition itself (s5 stays null), so the line words are read after the definition whether or not s5 fired.
    // 4D-S1: 10.5.40.50(2) is the platform setback; score it on the platform target named by the lot line
    let scorerFix = null;
    if (/^10\.5\.40\.50\(2\)/.test(c.norm) && cityUnit === 'm' && targets.includes('platform_side_setback_m')) {
      const pt = `${v.requirement || ''} ${v.proposal || ''}`;
      const after = (String(v.requirement).split(/within 0\.3 ?m of a building|less than 0\.3 ?m from a building/i)[1] || ''); const fig = after.search(new RegExp(String(cityVal).replace('.', '\\.') + '\\s*m'));
      const near = fig >= 0 ? after.slice(Math.max(0, after.lastIndexOf('.', fig - 1) + 1, fig - 70), fig) : ''; // the clause of the figure: the words before it name the line (M-290)
      // when the words before the figure name no line, the words after it do ("1.8m from the side lot lines ... and 10.88m from the rear"): the first line word up to the next figure (A0205/26NY, a regression of the M-290 label found at integrate-21)
      const nextWords = fig >= 0 ? (after.slice(fig).replace(/^[\d.]+\s*m/, '').split(/\d/)[0] || '').slice(0, 40) : '';
      const lineRaw = (near.match(/\b(front|rear|side|north|south|east|west)\b/gi) || []).pop() || (nextWords.match(/\b(front|rear|side|north|south|east|west)\b/i) || [])[0];
      const lineWord = /^(north|south|east|west)$/i.test(lineRaw || '') ? 'side' : lineRaw; // MB-03b: a named compass lot line is a side lot line (MB03-Q2: 3.6 m south AND 0.45 m north)
      if (lineWord) target = /^rear$/i.test(lineWord) ? 'platform_rear_setback_m' : /^front$/i.test(lineWord) ? 'platform_front_setback_m' : 'platform_side_setback_m'; else
      target = /rear (yard|lot line)/i.test(pt) ? 'platform_rear_setback_m' : /front (yard|lot line)/i.test(pt) ? 'platform_front_setback_m' : 'platform_side_setback_m'; scorerFix = '4D-S1';
    }
    // 4D-S6: the target is a % or × lot area limit but the parser picked the m² companion: take the matching figure
    let s6 = null;
    if (target && cityUnit === 'm²' && (/_pct$/.test(target) || target === 'fsi')) { const want = target === 'fsi' ? '× lot area' : '%'; const alt = (v.required_all || []).find((x) => x.unit === want); if (alt) { s6 = `figure ${cityVal} m² → ${alt.value} ${want}`; cityVal = alt.value; cityUnit = want; } }
    // 4D-S2/S3: element clauses: width figure → width target (none for stairs: not modelled); clearance figure → clearance target
    let roleNM = null;
    if (target && /_(encroachment|clearance)_m$/.test(target) && cityUnit === 'm') {
      const role = figureRole(v.requirement, cityVal); const el = target.replace(/_(encroachment|clearance)_m$/, '');
      if (role === 'width') { roleNM = `${el} width (no ${el} width target)`; scorerFix = '4D-S2'; }
      else if (role === 'clearance' && targets.includes(el + '_clearance_m') && target !== el + '_clearance_m') { target = el + '_clearance_m'; scorerFix = '4D-S3'; }
      else if (role === 'encroachment' && targets.includes(el + '_encroachment_m') && target !== el + '_encroachment_m') { target = el + '_encroachment_m'; scorerFix = '4D-S3'; }
    }
    const bt = clauseType(c, matched, main);
    const row = { notice: n.file_number, address: n.address, city_label: n.zoning?.label || null, our_label: p?.zoning_zn_string || null, parcel_id: p?.parcel_id || null, parcel_row_id: p?.id || null,
      n: v.n, clause: v.clause, clause_norm: c.norm, cited_reg: c.reg, cited_path: c.path, clause_note: c.note || null, limit: v.limit, requirement: v.requirement, city_value: cityVal, city_unit: cityUnit,
      building_type: bt, dwelling_units: SUITE_TYPES.includes(bt) ? 1 : main.units, keyed_units: matched.map((u) => `${u.unit_id}:${u.archetype}:${[].concat(u.target || []).join('+')}`), target,
      family: family(c, target, bt), line_note: lineNote, scorer_fix: scorerFix || (s5 ? '4D-S5' : null) || (s6 ? '4D-S6' : null), s5_note: s5, s6_note: s6, city_value_raw: v.required?.value ?? null, referent_note: referentNote, openings, ours: null, ours_alt: null, class: null, why: null, in_flight: null, lot_source: LS, lot_disclosure: LD, lot_held_unread: LU };
    const oos = outOfScope(c, v);
    if (nonRes) { row.class = 'NOT SCORABLE'; row.why = `zone ${n.zoning.zone} is not a 569-2013 residential zone (former by-law zone or non-residential): not scorable`; /* F-4D-20 */ rows.push(row); continue; }
    if (!p) { row.class = 'NOT SCORABLE'; row.why = 'no parcel match for the notice address: not scorable'; /* F-4D-20 */ rows.push(row); continue; }
    if (lc.hard.length) { row.class = 'DATA'; row.why = `zoning label disagrees: ${lc.hard.join('; ')}`; rows.push(row); continue; }
    if (!oos && roleNM) { row.class = 'NOT MODELLED'; row.why = roleNM; row.family = 'not modelled'; rows.push(row); continue; }
    if (oos) { row.class = 'NOT MODELLED'; row.why = oos; row.family = 'not modelled';
      if (target) { const lot = makeLot(base, bt, row.dwelling_units); row.ours = evalTarget(lot, target); }
      rows.push(row); continue; }
    if (!matched.length) { row.class = 'NO ANSWER'; row.why = 'clause not keyed (no unit in the agreed set)'; rows.push(row); continue; }
    if (!target) { row.class = 'NO ANSWER'; row.why = `clause keyed without a target (${[...new Set(matched.map((u) => u.archetype))].join('/')})`;
      if (/^10\.5\.40\.50\(2\)/.test(c.norm) && cityUnit === 'm') { row.platform_probe = evalTarget(makeLot(base, bt, row.dwelling_units), 'platform_side_setback_m'); const pr = evalTarget(makeLot(base, bt, row.dwelling_units), 'side_setback_m'); row.proxy = { via: 'side_setback_m (10.5.40.50(2): the zone building setback)', ...pr, delta: typeof pr.value === 'number' ? Math.round((pr.value - cityVal) * 1000) / 1000 : null }; }
      rows.push(row); continue; }
    const noFigure = cityVal == null; // NN-Q1: evaluated below; answered = ANSWERED (no City figure), else NOT MODELLED as before

    // EXC-W2-APPLY complement (verify-37 7): a pct SHARE target keyed with one bound ("at least 70% of each side main wall", vocab bound min) that the
    // City quotes from the other side ("a maximum of 30% may be higher") is the same fact: 100 - 30 = 70. Generic over any pct target whose vocab bound differs from the stated limit.
    { const T = (I.vocab.dsl_target || {})[target];
      // the direction the percentage itself is stated in: "no less than 40%" is a minimum share even when the notice's limit word is the height's "maximum"
      const shareDirection = (req, val, lim) => { const t = String(req || ''); return new RegExp(`(no less than|not less than|at least|minimum of)\\s*${val}\\s*%`, 'i').test(t) ? 'min' : /maximum/i.test(t) ? 'max' : lim; };
      if (T && T.unit === 'pct' && (T.bound === 'min' || T.bound === 'max') && cityUnit === '%' && typeof cityVal === 'number' && shareDirection(v.requirement, cityVal, row.limit) !== T.bound) {
        row.complement_of = cityVal; cityVal = Math.round((100 - cityVal) * 1000) / 1000; row.scorer_fix = row.scorer_fix || 'EXC-W2-complement'; } }
    const AI = applicantInputs(bt); if (Object.keys(AI.basis).length) row.applicant_inputs = AI.basis;
    const lot = makeLot(base, bt, row.dwelling_units, { vars: AI.vars, flags: AI.flags });
    const only = ELEMENT_TARGETS.has(target) ? new Set(matched.map((u) => u.unit_id)) : null;
    let r = evalTarget(lot, target, only);
    // roof: if the plain vector is undecided on roof, take the arm whose winner is the cited clause (else pitched); record both
    const pitched = evalTarget({ ...lot, flags: { ...lot.flags, flat_or_shallow_roof: false } }, target, only);
    const flat = evalTarget({ ...lot, flags: { ...lot.flags, flat_or_shallow_roof: true } }, target, only);
    if (r.status !== 'value' || String(r.reason || '').includes('flat_or_shallow_roof')) {
      const hit = [pitched, flat].find((x) => x.status === 'value' && regOf(x.winner) === c.reg);
      row.roof_arm = hit ? (hit === flat ? 'flat' : 'pitched') : 'pitched'; r = hit || pitched;
    }
    // [blfix5 probe, read-only: M-259 arms] the design with openings, and the platform target for 10.5.40.50(2)
    if (target === 'side_setback_m') { row.bsw_arm = evalTarget({ ...lot, flags: { ...lot.flags, blank_side_wall: false } }, target, only); const citedOpenArm = /^10\.10\.40\.70\(3\)\(A\)/.test(c.norm) ? 'notice cites 10.10.40.70(3)(A)' : null; if ((openings || citedOpenArm) && row.bsw_arm.status === 'value') { row.bsw_taken = openings || citedOpenArm; row.scorer_fix = openings ? '4D-S4' : '4D-S4b'; r = row.bsw_arm; } } if (/^10\.5\.40\.50\(2\)/.test(c.norm)) row.platform_probe = evalTarget(lot, 'platform_side_setback_m');
    // 4D-S4c (A0385): a notice that cites the 11 m townhouse arm 10.10.40.80(1)(C) is itself evidence that each facing main wall has an opening (design tokens main_wall_openings / main_wall_openings_each, M-282)
    if (target === 'separation_m' && /^10\.10\.40\.80\(1\)\(C\)/.test(c.norm)) { const arm = evalTarget({ ...lot, flags: { ...lot.flags, main_wall_openings: true, main_wall_openings_each: true } }, target, only); if (arm.status === 'value') { row.openings_taken = 'notice cites 10.10.40.80(1)(C)'; row.scorer_fix = '4D-S4c'; r = arm; } }
    if (['garden_suite', 'laneway_suite'].includes(bt) && /setback/.test(target)) row.ours_arm = { flags: { suite_wall_openings: true }, ...evalTarget({ ...lot, flags: { ...lot.flags, suite_wall_openings: true } }, target, only) };
    if (target === 'gfa_m2') { const fr = evalTarget(lot, 'fsi'); row.ours_fsi = fr; if (typeof fr.value === 'number') row.ours_fsi_cap_m2 = Math.round(fr.value * base.vars.lot_area_m2 * 100) / 100; }
    row.ours = r; row.ours_flat = flat; row.ours_pitched = pitched; row.only_clause_units = !!only;

    // front averaging (M-205(1)) as resolved today from parcel_abutments
    if (target === 'front_setback_m') {
      const plainOff = evalTarget({ ...lot, flags: { ...lot.flags, front_averaging_not_applicable: true, one_abutting_building_within_15_m: false, two_abutting_buildings_within_15_m: false } }, target);
      row.front_zone_default = plainOff;
      const zd = typeof plainOff.value === 'number' ? plainOff.value : 6.0;
      let fa = null; try { fa = FA.resolveFrontSetback(p.abutments || [], FYA_TABLE, { zone_default_m: zd }, UFA ? { neighbour_front_setbacks_m: AF.neighbour_front_setbacks_m } : undefined); } catch (e) { fa = { error: e.message }; }
      if (fa && !fa.error) {
        const rf = evalTarget({ ...lot, flags: { ...lot.flags, ...fa.flags }, vars: { ...lot.vars, ...fa.vars } }, target);
        row.front_fa = { basis: fa.basis, qualifying: fa.qualifying, averaged_m: fa.averaged_m, floor_applied: fa.floor_applied, resolved_m: fa.front_setback_m, eval: rf,
          delta_vs_city: typeof rf.value === 'number' && !noFigure ? Math.round((rf.value - cityVal) * 100) / 100 : null, raw_avg_delta: fa.averaged_m != null && !noFigure ? Math.round((fa.averaged_m - cityVal) * 100) / 100 : null };
      } else row.front_fa = fa;
      if (r.status !== 'value' && /map_area_not_held/.test(r.reason || '')) {
        row.ours_map_areas_empty = evalTarget({ ...lot, map_areas: [] }, target);
        if (fa && !fa.error) { const rm = evalTarget({ ...lot, map_areas: [], flags: { ...lot.flags, ...fa.flags }, vars: { ...lot.vars, ...fa.vars } }, target); row.front_fa_map_areas_empty = { ...rm, delta_vs_city: typeof rm.value === 'number' ? Math.round((rm.value - cityVal) * 100) / 100 : null }; }
      }
    }

    if (r.status === 'value' && noFigure) { row.class = ANSWERED; row.why = `ANSWERED (no City figure): ours ${r.value}; the notice states no figure to compare; winner ${r.winner}`; row.delta = null;
      // MB-59: the verdict against the applicant's figure for a count the rule calculates (maximum bedrooms = 3 x units): the City lists the variance when the proposal exceeds the calculated limit
      const pb = target === 'bedrooms' ? /(\d+)\s+bedrooms?\b/i.exec(v.proposal || '') : null;
      if (pb && typeof r.value === 'number') { row.verdict = { proposed: Number(pb[1]), limit: r.value, exceeds: Number(pb[1]) > r.value }; row.why += `; the proposal (${pb[1]}) ${row.verdict.exceeds ? 'exceeds' : 'is within'} the calculated limit, ${row.verdict.exceeds ? 'a variance is needed' : 'no variance is needed'}`; } }
    else if (noFigure) { row.class = 'NOT MODELLED'; row.why = 'notice states no numeric requirement'; }
    else if (r.status === 'value') {
      if (typeof r.value === 'number') {
        const d = Math.round((r.value - cityVal) * 1000) / 1000; row.delta = d;
        row.class = Math.abs(d) <= tol(cityUnit) + 1e-9 ? 'MATCH' : 'DIFFER';
        if (row.class === 'DIFFER' && row.bsw_arm && !row.bsw_taken && typeof row.bsw_arm.value === 'number' && Math.abs(row.bsw_arm.value - cityVal) <= tol(cityUnit) + 1e-9) row.arm_explains = 'blank_side_wall=false (openings) gives the City figure';
        if (row.class === 'DIFFER' && row.ours_arm && typeof row.ours_arm.value === 'number' && Math.abs(row.ours_arm.value - cityVal) <= tol(cityUnit) + 1e-9) row.arm_explains = 'suite_wall_openings=true (M-197 default false) gives the City figure';
        row.why = row.class === 'MATCH' ? (regOf(r.winner) === c.reg ? 'same value, same provision' : `same value, winner ${r.winner}`) : `ours ${r.value} vs City ${cityVal} (Δ ${d}); winner ${r.winner}`;
        if (row.complement_of != null) row.why += ` (complement: City ${row.limit} ${row.complement_of}% = ${cityVal}% the other way)`;
      } else { row.class = 'DIFFER'; row.why = `ours ${r.value} (no numeric limit) vs City ${cityVal}; winner ${r.winner}`; }
    } else if (r.status === 'not_evaluated') {
      row.class = owedOrNoAnswer(r.reason); row.why = r.reason;
    } else { row.class = 'NO ANSWER'; row.why = `${r.status}: ${r.reason || ''}`; }

    // MB-03b (MB03-Q2, recorded fc117484): one check per stated limit. A figure that says when the rule applies is a condition, never a limit; the "within 0.3 m of a building"
    // definition decides whether the platform rule applies, is not scored, and is disclosed when the result relies on it (code attached_platform_definition, Spec 78 P5.12).
    // The row is MATCH only when every limit that has a keyed target matches; a limit with no keyed target is listed (checks, class NOT MODELLED) and does not decide the row.
    const primaryClass = row.class;
    if (!cc) {
      const lims = CP.requirementLimits(v.requirement || ''); const limitList = lims.filter((l) => l.kind === 'limit'); const allM = limitList.length > 1 && limitList.every((l) => l.unit === 'm') && v.required && v.required.unit === 'm';
      const pIdx = limitList.findIndex((l) => v.required && l.value === v.required.value && l.unit === v.required.unit);
      const roleTarget = (l) => {
        if (!l.role) return l === limitList[pIdx] ? target : pickTarget(targets, l.unit, c, matched);
        if (l.role.startsWith('setback:')) { const ln = l.role.slice(8); return targets.find((t) => t === 'platform_' + ln + '_setback_m') || targets.find((t) => new RegExp('(^|_)' + ln + '_setback_m$').test(t)) || null; }
        const want = { clearance: (t) => /_clearance_m$/.test(t) && !/vertical/.test(t), encroachment: (t) => /_encroachment_m$/.test(t), width: (t) => /_width_m$/.test(t), length: (t) => /(_length_m|building_length)/.test(t), vertical_clearance: (t) => /vertical_clearance_m$/.test(t) }[l.role];
        return want ? targets.find(want) || null : null;
      };
      if (allM && pIdx >= 0 && ['MATCH', 'DIFFER', 'OWED', 'NO ANSWER'].includes(row.class)) {
        row.checks = limitList.map((l, i) => {
          const tg = i === pIdx && (!l.role || roleTarget(l) === target) ? target : roleTarget(l);
          const ck = { value: l.value, unit: l.unit, role: l.role, target: tg || null, class: null, ours: null, why: null };
          if (!tg || (!l.role && i !== pIdx)) { ck.target = null; ck.class = 'NOT MODELLED'; ck.why = 'no keyed target for this limit'; return ck; }
          if (i === pIdx && tg === target) { ck.class = primaryClass; ck.ours = r.status === 'value' ? r.value : null; ck.why = row.why; ck.primary = true; return ck; }
          const ol = ELEMENT_TARGETS.has(tg) ? new Set(matched.map((u) => u.unit_id)) : null;
          let rr = evalTarget(lot, tg, ol);
          if (rr.status !== 'value') { const pit = evalTarget({ ...lot, flags: { ...lot.flags, flat_or_shallow_roof: false } }, tg, ol); if (pit.status === 'value') rr = pit; }
          ck.ours = rr.status === 'value' ? rr.value : null;
          if (rr.status === 'value' && typeof rr.value === 'number') { const d = Math.round((rr.value - l.value) * 1000) / 1000; ck.class = Math.abs(d) <= tol(l.unit) + 1e-9 ? 'MATCH' : 'DIFFER'; ck.why = ck.class === 'MATCH' ? 'same value' : `ours ${rr.value} vs City ${l.value} (Δ ${d})`; }
          else if (rr.status === 'not_evaluated') { ck.class = owedOrNoAnswer(rr.reason); ck.why = rr.reason; }
          else { ck.class = 'NO ANSWER'; ck.why = `${rr.status}: ${rr.reason || ''}`; }
          return ck;
        });
        // MB-18 (platform setbacks per side and street side; missing-rules card rank 4): on a corner lot a named side limit may be the street side's, so a side check the interior side does not meet is read against the street-side target; it MATCHES only when the street-side value equals the City limit
        if (lot.flags && lot.flags.corner_lot === true) for (const k of row.checks) {
          if ((k.class !== 'DIFFER' && k.class !== 'NO ANSWER') || k.role !== 'setback:side' || k.target !== 'platform_side_setback_m' || !targets.includes('platform_side_setback_street_m')) continue;
          const sr = evalTarget(lot, 'platform_side_setback_street_m', new Set(matched.map((u) => u.unit_id)));
          if (sr.status === 'value' && typeof sr.value === 'number' && Math.abs(sr.value - k.value) <= tol(k.unit) + 1e-9) { k.class = 'MATCH'; k.street_side = true; k.ours = sr.value; k.why = 'same value as the street-side setback of this corner lot (MB-18)'; }
        }
        // one lot-wide side setback is all the model holds: when the notice sets a different limit for each named side, and the model equals one of them, the others have NO ANSWER (neither a mismatch nor a match); none equal: DIFFER stays
        for (const k of row.checks) if (k.class === 'DIFFER' && /^setback:side$/.test(k.role || '') && row.checks.some((o) => o !== k && o.role === k.role && o.target === k.target && o.value !== k.value && o.class === 'MATCH')) { k.class = 'NO ANSWER'; k.why = 'the model holds one side setback for the lot; the notice sets a limit per named side and another side\'s limit equals it, so this side has no model answer'; }
        const decided = row.checks.filter((k) => k.class !== 'NOT MODELLED');
        if (decided.length) {
          const next = decided.some((k) => k.class === 'DIFFER') ? 'DIFFER' : (decided.find((k) => k.class === 'OWED' || k.class === 'NO ANSWER') || {}).class || 'MATCH';
          if (next !== row.class) { row.class_before_checks = row.class; row.class = next; row.why = `${row.why} | checks: ${row.checks.map((k) => `${k.value} ${k.unit} ${k.role || ''} ${k.class}`).join('; ')}`; }
        }
      }
      if (lims.some((l) => l.kind === 'definition') && row.checks && /^10\.5\.40\.50\(2\)/.test(c.norm)) { const dfn = lims.find((l) => l.kind === 'definition'); row.disclosures = [{ code: 'attached_platform_definition', figure: `${dfn.value} ${dfn.unit}`, clause: '10.5.40.50(2)' }]; }
    }
    { const ex = primaryClass === 'DIFFER' && row.class === 'DIFFER' ? explainRow(I.vocab, c.norm, target, r.value, cityVal, { notice: n.file_number, n: v.n, parcelId: p && p.parcel_id }) : null; if (ex) { row.explained_by = ex.ruling; row.explained_note = ex.reading; if (ex.class === 'DATA') { row.class = 'DATA'; row.why = `explained data flag (R5-5, ${ex.ruling}): ${ex.reading}`; } } } // M-287: the table is validated at load (coa-explained.mjs)
    rows.push(row);
  }
}

for (const n of notices) runNotice(n, true, rows, lots);
// F-4D-8/9/14: on a flagged lot a DIFFER / NO ANSWER on parcel dimensions that matches the City on survey dimensions is an explained data flag, not an engine miss
for (const n of notices) {
  const svc = lots[n.file_number].survey_check; if (!svc.flag) continue;
  const sr = []; const sl = {}; runNotice(n, false, sr, sl);
  const mine = rows.filter((r) => r.notice === n.file_number);
  mine.forEach((r, i) => {
    const q = sr[i]; if (!q || q.clause !== r.clause) return;
    r.parcel_dims_class = q.class;
    if (r.class === 'MATCH' && (q.class === 'DIFFER' || q.class === 'NO ANSWER')) {
      r.class = 'DATA'; r.survey_flag = true; r.class_on_survey = 'MATCH';
      r.why = `explained data flag: parcel row disagrees with the M-326 lot figure (${svc.disagree.join('; ')}); on M-326 lot figures ours matches the City (${r.ours?.value}); on parcel dimensions it was ${q.class}`;
    }
  });
}

// C-3 (pending row CHAT-63.C3): a scored row whose cited provision carries an amendment tag with a verified in-force date after the hearing is BY-LAW CHANGED
// (in neither percentage); a tag with no verified date, or no hearing date, only sets amendment_status (nothing is guessed).
for (const r of rows) {
  if (r.class !== 'MATCH' && r.class !== 'DIFFER') continue;
  const st = RD.bylawStatusAtDecision((PROV_BY.get(r.cited_reg) || {}).amendments, AMD_STATUSES, lots[r.notice].hearing_date, r.cited_path);
  if (st.state === 'changed') { r.class_before_bylaw = r.class; r.class = RD.CHANGED_CLASS; r.why = `by-law changed after the hearing (${st.bylaws.join(', ')}); was ${r.class_before_bylaw}: ${r.why}`; }
  else if (st.state === 'unverified') r.amendment_status = 'unverified';
}

// in-flight findings (approved, being fixed in lane bylaw-fix-3)
for (const r of rows) {
  if (/^10\.10\.60\.20\(1\)/.test(r.clause_norm || '')) r.in_flight = 'N-2';
  if (/^10\.5\.60\.50\(2\)/.test(r.clause_norm || '')) r.in_flight = 'N-3';
  if (/^10\.5\.40\.60\(7\)/.test(r.clause_norm || '')) r.in_flight = 'D-3';
  if (r.target === 'front_setback_m' && r.front_fa && r.front_fa.floor_applied && ((r.front_fa.delta_vs_city > 0.01) || (r.front_fa_map_areas_empty && r.front_fa_map_areas_empty.delta_vs_city > 0.01))) r.in_flight = 'M-205(1)';
  if (r.in_flight) r.in_flight_note = 'fix in flight (approved; lane bylaw-fix-3)';
}
fs.writeFileSync(OUT, JSON.stringify({ root: ROOT, units: units.length, fya_allowance_m: FYA_ALLOWANCE, defaults, answered_no_city_figure: rows.filter((x) => x.class === ANSWERED).map((x) => `${x.notice}#${x.n} ${x.clause}`), lots, rows }, null, 1));
const by = {}; for (const r of rows) by[r.class] = (by[r.class] || 0) + 1;
for (const r of rows.filter((x) => x.class === ANSWERED)) console.log('ANSWERED (no City figure): ' + r.notice + ' #' + r.n + ' ' + r.clause + ' ours ' + (r.ours && r.ours.value));
console.log('rows', rows.length, JSON.stringify(by), 'amendment status unverified', rows.filter((r) => r.amendment_status === 'unverified').length);
// C-5 floors and C-4 pre-registration (see coa-round.mjs). Both are read-only on the data; --accept is the only writer and needs a RATIFIED or RULED ruling.
const STATS = RD.statsOf(rows);
if (arg('floors')) {
  const fp = arg('floors'); const floors = JSON.parse(fs.readFileSync(fp, 'utf8'));
  if (process.argv.includes('--accept')) {
    const lines = process.argv.filter((a) => a.startsWith('--line=')).map((a) => a.slice(7));
    const next = RD.acceptFloors(floors, STATS, (process.argv.find((a) => a.startsWith('--ruling=')) || '').slice(9), parseRulings(readSpec69Rulings(ROOT)), lines);
    fs.writeFileSync(fp, JSON.stringify(next, null, 1) + '\n'); console.log('FLOORS ACCEPTED ' + fp + ' lines ' + JSON.stringify(next.rulings.at(-1).lines));
  } else {
    const rep = RD.reportFloors(floors, STATS, readSpec69Rulings(ROOT)); console.log(rep.text); if (rep.code) process.exitCode = 1;
  }
}
if (arg('prereg')) {
  const pp = arg('prereg'); const pre = JSON.parse(fs.readFileSync(pp, 'utf8')); const shape = RD.checkPreregShape(pre);
  let committed = false; try { committed = execFileSync('git', ['-C', ROOT, 'show', 'HEAD:' + path.relative(ROOT, path.resolve(pp)).split(path.sep).join('/')], { encoding: 'utf8' }) === fs.readFileSync(pp, 'utf8'); } catch { /* not in HEAD */ }
  const base = arg('baseline') ? JSON.parse(fs.readFileSync(arg('baseline'), 'utf8')).rows : null;
  const res = RD.checkPrereg(pre, base ? RD.diffMoves(base, rows) : null, by);
  const bad = [...shape, ...(committed ? [] : ['prereg file is not committed at HEAD (pre-registration comes before the round)'])];
  const out = { round: pre.round, prereg: pp, committed, shape_violations: shape, ...res };
  fs.writeFileSync(OUT.replace(/\.json$/, '') + '.prereg-result.json', JSON.stringify(out, null, 1) + '\n');
  console.log('PREREG ' + (res.verdict === 'ok' && !bad.length ? 'OK' : 'FINDING') + ' round ' + pre.round + ': unexpected ' + res.unexpected.length + ', missing ' + res.missing.length + ', totals ' + (res.totals_diff.join('; ') || 'equal') + (res.moves_checked ? '' : ' (moves not checked: no --baseline)') + (bad.length ? ' | ' + bad.join('; ') : ''));
  if (res.verdict !== 'ok' || bad.length) process.exitCode = 1;
}
// The regression lock. An expected file is {commit, notices, variances, totals, inputs?}. It is PINNED (a changed total fails, exit 1) when --root is at its commit,
// or when its inputs key equals the tree's: the Layer 2 input table_version (every Layer 1 input hash), its evaluator_version and the sha of this scorer's four files. Otherwise the diff is information only.
// --pin FILE writes the expected file for this run at this tree (the integrate step re-pins; a moved input is a finding to re-pin, not a silent pass).
const here = path.dirname(fileURLToPath(import.meta.url));
const shaOf = (fl) => { const h = crypto.createHash('sha256'); for (const x of fl) h.update(fs.readFileSync(path.join(here, x))); return h.digest('hex').slice(0, 16); };
const treeInputs = () => { const l2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-layer2-input.json'), 'utf8')); return { table_version: l2.table_version, evaluator_version: l2.evaluator_version, scorer_sha: shaOf(['coa-scorecard.mjs', 'coa-clausemap.mjs', 'coa-explained.mjs', 'coa-lotfacts.mjs', 'coa-parse.cjs', 'coa-round.mjs', '../bylaw/main-building-gfa.mjs', '../bylaw/front-averaging.mjs', 'coa-expected/read-record-chat164.json']) }; };
if (arg('pin')) {
  const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().slice(0, 8);
  fs.writeFileSync(arg('pin'), JSON.stringify({ commit: head, notices: notices.length, variances: rows.length, totals: by, inputs: treeInputs(), note: 'pinned by coa-scorecard.mjs --pin; the lock is live while inputs equal the tree' }, null, 1) + '\n');
  console.log('PINNED ' + arg('pin') + ' ' + JSON.stringify(by));
}
if (CHECK) {
  const exp = JSON.parse(fs.readFileSync(CHECK, 'utf8'));
  const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const keys = [...new Set([...Object.keys(exp.totals), ...Object.keys(by)])];
  const diffs = keys.filter((k) => (exp.totals[k] || 0) !== (by[k] || 0)).map((k) => k + ' expected ' + (exp.totals[k] || 0) + ' got ' + (by[k] || 0));
  const ti = treeInputs();
  const pinned = head.startsWith(exp.commit) || (!!exp.inputs && exp.inputs.table_version === ti.table_version && exp.inputs.evaluator_version === ti.evaluator_version && exp.inputs.scorer_sha === ti.scorer_sha);
  if (diffs.length) { console.log((pinned ? 'CHECK FAIL' : 'CHECK INFO (tree moved on from ' + exp.commit + '; inputs differ)') + ': ' + diffs.join('; ')); process.exit(pinned ? 1 : process.exitCode || 0); }
  console.log((pinned ? 'CHECK OK (pinned)' : 'CHECK OK (not pinned: inputs differ from the pin)') + ': totals equal ' + JSON.stringify(exp.totals) + ' at ' + exp.commit);
}
