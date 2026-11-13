// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6 (the evaluator and its unit set)
//
// The real-lot unit assembly, shared by eval-lots.mjs and the golden-lot test helper (src/tests/helpers/bylaw-golden-lots.ts)
// so the two cannot drift. Unchanged from eval-lots.mjs (2026-10-19): the agreed units (agree.mjs, adjudications applied),
// their generated fields (authored.mjs), the displacement links (xref.mjs displacesOf, as validate.mjs G-EVAL), the design-option
// threshold units (thresholdUnits below, M-465 (4)), and
// makeContext(evaluatorVocab, enactments, absences, exception authoring state per ruling (d)). Reads the tree only.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';

export async function loadRealLotAssembly(root) {
  const mod = (rel) => import(pathToFileURL(path.join(root, rel)).href);
  const V = await mod('scripts/analysis/bylaw/validate.mjs'); const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs'); const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
  const E = await mod('scripts/analysis/bylaw/evaluate.mjs'); const X = await mod('scripts/analysis/bylaw/xref.mjs');
  const I = V.loadInputs({ root });
  const external = JSON.parse(fs.readFileSync(path.join(root, 'scripts/seeds/bylaw/external.json'), 'utf8'));
  const ag = AG.checkAgree({ shards: AU.loadAuthored(root), adjudications: I.adjudications, vocab: I.vocab });
  const index = AU.buildIndex(I.slice);
  const base = [...AG.agreedUnits(ag).values()].map(AU.withGeneratedFields);
  // include_ref (Spec 68 §6 G): the generated link of an INCLUDE unit, set only when it names a Ch.900 exception row, which is
  // what the loader (evaluate.mjs loadCandidates) and the lot gate (ruling (d)) expand; a section / article / base-row
  // INCLUDE has no exception units to expand and is left unlinked.
  const includeLink = (u) => {
    if (u.archetype !== 'INCLUDE') return {};
    let r = null; try { r = X.includeOf(index, u.unit_id, external); } catch { /* unresolved: no link */ }
    return r && r.resolved && r.resolved.ok && r.resolved.kind === 'row' && /^900\.[2-6]\.10\(\d+\)$/.test(r.resolved.id) ? { include_ref: r.resolved.id } : {};
  };
  const linked = base.map((u) => { let d = { targets: [], optional_variation: false }; try { d = X.displacesOf(index, u.unit_id, I.vocab, external); } catch { /* unresolved: no links */ } return { ...u, displaces: d.targets.map((t) => t.id), displaces_optional: d.optional_variation === true, ...includeLink(u) }; });
  // M-465 (4), OP-1: the design option's threshold units, generated per clause from the clause's own words (thresholdUnits below)
  // D-76: the units declared in vocab generated_units, built from their source unit (generatedUnits below)
  const units = [...linked, ...thresholdUnits(linked, I.vocab), ...generatedUnits(linked, I.vocab)];
  const enactments = {}; for (const p of I.snap.pages || []) Object.assign(enactments, E.enactedDatesFromText(p.normalized || ''));
  // exception authoring state (ruling (d)), as the review builder: authored when every unit of the exception is agreed / adjudicated
  const isExcReg = (r) => /^900\.\d+\.10\(/.test(r);
  const excState = new Map();
  for (const [id, rec] of ag.units) {
    const reg = AU.splitUnitId(id).reg.replace(/~.*$/, ''); if (!isExcReg(reg)) continue;
    const s = excState.get(reg) || { agreed: new Set(), pending: new Set(), pendingN: 0 };
    const tg = [].concat((rec.unit && rec.unit.target) || []).filter((t) => t && t !== 'none');
    if (rec.state === 'agreed' || rec.state === 'adjudicated') tg.forEach((t) => s.agreed.add(t)); else { s.pendingN++; tg.forEach((t) => s.pending.add(t)); }
    excState.set(reg, s);
  }
  const authored = {}; for (const [reg, s] of excState) authored[reg] = s.pendingN === 0 ? 'authored' : { status: 'partial', targets: [...s.agreed].filter((t) => !s.pending.has(t)).sort() };
  const C = E.makeContext(VO.evaluatorVocab(I.vocab), { enactments, absences: I.absences, authored });
  return { I, E, units, C };
}

// ---------------------------------------------------------------------------------------------------------------------
// M-465 (4) (the threshold, OP-1; SPEC LINK docs/specs/01-pipeline/69a_mcbylaw_register.md M-465, M-400): the roof-form design
// option's generated threshold units ("pitched_roof_slope_min (ratio) is stored beside the option rows, generated per clause from the
// clause's own words"). Every unit carrying a design option's token gets, per regulation, ONE sibling unit
// `<threshold_target> = <value> ratio @<the regulation's clause>` with the same application (zones, building types, uses) and no roof
// condition. The value is the clause's own flat-or-shallow wording matched against vocab.design_options.<option>.thresholds (exactly one
// pattern), so no figure lives in code. A unit listed in no_threshold_units (the flat-roof clauses, reading (i), O-A a) generates none;
// the lot then takes the zone's clause. The lot's threshold is its strictest clause through the evaluator's ordinary min resolution.
// Pure (no fs, pg, env or clock); kept in this file because the assembly is a declared Layer 1 input of table_version.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const tokensOf = (cond) => (cond && typeof cond === 'object' && Array.isArray(cond.tokens) ? cond.tokens : []);

/** The design options declared in vocab (`$comment` skipped), as [name, record]. */
export function designOptions(vocab) {
  const d = (vocab && vocab.design_options) || {};
  return Object.entries(d).filter(([k, o]) => k !== '$comment' && o && typeof o === 'object').sort(([a], [b]) => cmp(a, b));
}

/** The clause's own words for the option's token: the unit's application evidence for the token (empty string when none). */
export function tokenWording(u, token) {
  const ev = (u.application && u.application.evidence) || {};
  return typeof ev[token] === 'string' ? ev[token] : '';
}

/** The thresholds whose pattern the unit's own token wording contains (R8: exactly one, or none for a listed unit). */
export function thresholdMatches(u, opt) {
  const w = tokenWording(u, opt.token);
  return (opt.thresholds || []).filter((t) => typeof t.pattern === 'string' && t.pattern && w.includes(t.pattern));
}

/** The regulation-level clause of a regulation id: `10.20.40.10(4)` -> `(4)`. */
function regulationClause(reg) {
  const m = /\((\d+)\)$/.exec(reg);
  if (!m) throw new Error(`design-options: regulation ${reg} has no clause number`);
  return `(${m[1]})`;
}

const sameApp = (a, b) => JSON.stringify([a.zones, a.building_types, a.uses]) === JSON.stringify([b.zones, b.building_types, b.uses]);

/**
 * The generated threshold units, sorted by unit id. Throws (never guesses) when a token unit matches no pattern and is not
 * listed, matches two, or when two token units of one regulation disagree on the value or the application.
 */
export function thresholdUnits(units, vocab) {
  const out = new Map();
  const taken = new Set(units.map((u) => u.unit_id));
  for (const [name, opt] of designOptions(vocab)) {
    if (typeof opt.token !== 'string') throw new Error(`design-options: ${name} has no token`);
    if (opt.threshold_target === undefined) continue; // MB-27 increment 5 item 1 (D-1 a): an option with no threshold (suite_height) generates no threshold units
    if (typeof opt.threshold_target !== 'string') throw new Error(`design-options: ${name} threshold_target must be a string`);
    const skip = new Set(opt.no_threshold_units || []);
    for (const u of units) {
      if (!tokensOf(u.condition).includes(opt.token) || skip.has(u.unit_id)) continue;
      const m = thresholdMatches(u, opt);
      if (m.length !== 1) throw new Error(`design-options: ${u.unit_id} matches ${m.length} ${name} threshold patterns (exactly one, or list it in no_threshold_units)`);
      const reg = u.regulation_id;
      const clause = regulationClause(reg);
      const id = `${reg}#threshold${clause}`; // never a prefix of a cited clause path (coa-clausemap unitsForClause; operator Q-P3ID "a")
      if (taken.has(id)) throw new Error(`design-options: generated threshold unit id ${id} is already a Layer 1 unit id (never two units with one id)`);
      const app = u.application || {};
      const have = out.get(id);
      if (have) {
        if (have.value !== m[0].value || !sameApp(have.app, app)) throw new Error(`design-options: ${reg} token units disagree on the ${name} threshold or its application`);
        have.from.push(u.unit_id);
        continue;
      }
      out.set(id, { id, reg, clause, value: m[0].value, pattern: m[0].pattern, app, u, from: [u.unit_id], target: opt.threshold_target, name, token: opt.token, ruling: opt.ruling });
    }
  }
  return [...out.values()].sort((a, b) => cmp(a.id, b.id)).map((g) => {
    const evidence = { ...((g.app && g.app.evidence) || {}) };
    delete evidence[g.token];
    evidence[g.target] = g.pattern;
    return {
      unit_id: g.id, archetype: 'LIMIT', target: g.target, bound: 'min', requirement: 'none', instrument: 'none', evaluated_by_us: 'none', ranks_layers: 'none',
      condition: 'none', applies_to: { part: 'whole', refs: [] },
      numeric_expression: [`${g.target} = ${g.value} ratio @${g.clause}`],
      literals_not_expressed: [],
      application: { zones: g.app.zones || [], building_types: g.app.building_types || [], lot_conditions: [], uses: g.app.uses || [], evidence },
      calculation_handling: {
        status: 'modelled', not_modelled_reason: 'none', user_inputs: [],
        description: `Generated (${g.ruling}): the least roof slope outside ${g.reg}'s flat-or-shallow test ("${g.pattern}"), ${g.value} vertical per horizontal; a pitched roof is at or above it.`,
        gaps: 'none',
      },
      disclosure: 'none', not_an_override: [],
      regulation_id: g.reg, layer: g.u.layer, ...(g.u.exception ? { exception: g.u.exception } : {}),
      displaces: [], displaces_optional: false, generated_from: [...g.from].sort(cmp),
    };
  });
}

/**
 * D-76 (2026-11-12, pre-approved log; the M-465 threshold-unit form): the units vocab.generated_units declares, each built from its
 * source unit (`from`) with the declared target, statement and building types; zones, condition, lot conditions, layer and regulation
 * are the source's. Throws (never guesses) when the source is missing or the id is already a unit id.
 */
export function generatedUnits(units, vocab) {
  const decl = (vocab && vocab.generated_units && vocab.generated_units.units) || [];
  const byId = new Map(units.map((u) => [u.unit_id, u]));
  return decl.map((g) => {
    const s = byId.get(g.from);
    if (!s) throw new Error(`generated_units: source ${g.from} of ${g.id} is not a unit`);
    if (byId.has(g.id)) throw new Error(`generated_units: ${g.id} is already a unit id`);
    const app = s.application || {};
    return {
      unit_id: g.id, archetype: 'LIMIT', target: g.target, bound: g.bound, requirement: 'none', instrument: 'none', evaluated_by_us: 'none', ranks_layers: 'none',
      condition: s.condition, applies_to: s.applies_to, numeric_expression: [g.statement], literals_not_expressed: [],
      application: { zones: app.zones || [], building_types: [...g.building_types], lot_conditions: app.lot_conditions || [], uses: app.uses || [], evidence: Object.fromEntries(g.building_types.map((t) => [t, g.evidence])) },
      calculation_handling: { status: 'modelled', not_modelled_reason: 'none', user_inputs: [], description: g.description, gaps: g.gaps },
      disclosure: 'none', not_an_override: [], regulation_id: s.regulation_id, layer: s.layer, ...(s.exception ? { exception: s.exception } : {}),
      displaces: [], displaces_optional: false, generated_from: [g.from],
    };
  });
}
