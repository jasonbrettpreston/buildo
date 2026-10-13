// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-AGREE ("each ⧉ projection agrees canonically, or records
//            `adjudicated` by someone who is neither keyer; an unadjudicated disagreement is `pending`, never a gate
//            failure; agreement rate rendered with `agreement≠correctness`"), §4 (pending never fails a gate), §7.4
//            (canonical form), §10 stage 6; docs/specs/01-pipeline/69_mcbylaw_policy.md M-17 (+ notes), M-45;
//            docs/reports/mcbylaw-phase1-plan.md S6
//
// G-AGREE. PURE.
//
//   checkAgree({shards, adjudications, vocab?, doubleKeyed?}) → {status, pass, checked, violations, counts,
//       agreement_rate, agreement_label, units: Map(unit_id → {state, unit, shard, keyers, disagreements[]})}
//   selfTest()
//
//   Spec 69a M-80: a unit re-keyed in a generation <shard>~r<n> is read from the newest generation only (counted superseded_units).
//
// A unit's state: `agreed` (every ⧉ projection equal), `adjudicated` (every disagreement carries a valid adjudication),
// `pending` (no .b yet, a unit drafted by one keyer only, or an open disagreement). The resolved unit is A's draft with
// each adjudicated field replaced (decision `b` → B's value, `value` → the adjudicated value). Only agreed/adjudicated
// units reach the content gates (G-CLAUSE, G-XREF, G-SHAPE).
//
// An adjudication record (adjudications.json, kind `disagreement`):
//   {id, kind:"disagreement", unit:<unit_id>, field:<⧉ path>, adjudicator, decision: a | b | value, value? , reason}
//   {id, kind:"correction", unit:<unit_id>, field:<authored field path>, value, reason, rule, adjudicator, adjudicated_on}  (Spec 69 M-75)
//   a correction may carry supersedes:"<COR id>" — it replaces that earlier correction of the same (unit, field); the newest live record applies (Spec 69a M-75 note 2026-10-08)
// A correction replaces one authored field of the resolved unit (⧉ or A-only); the sealed .a / .b drafts stay byte-identical.
//
// Reason codes (closed; ADJ = an adjudications.json entry of kind `disagreement`):
//   adjudicator_missing             an ADJ names no adjudicator
//   adjudicator_is_keyer            an ADJ's adjudicator is keyer A or keyer B of the unit's shard (Spec 124 §4.2)
//   adjudication_decision_invalid   decision ∉ {a, b, value}, or `value` without a value / a value with a or b
//   adjudication_duplicate          two ADJs for one (unit, field)
//   adjudication_orphan             an ADJ for a (unit, field) that has no open disagreement (agreed, not ⧉, or unknown)
//   adjudications_superseded — an ADJ on a unit an M-80 re-key generation superseded (counted, never an orphan)
//   adjudication_kind_invalid       an adjudications.json kind outside vocab.adjudication_kind
//   correction_orphan               a correction for a unit that is not agreed / adjudicated, or a field absent from it
//   correction_rule_missing         a correction names no non-empty `rule` (Spec 69 M-75)
//   correction_duplicate            two corrections for one (unit, field)
//   correction_supersedes_unknown   a correction's `supersedes` names no correction of the same unit and field (Spec 69a M-75 note 2026-10-08)
//   correction_supersede_duplicate  two records supersede the same correction id (Spec 69a M-75 note 2026-10-08)
// Counted, never failing: pending units, open disagreements, draft failures (a draft whose DSL does not parse).

import { DslError } from './dsl.mjs';
import { DOUBLE_KEYED, OPTIONAL_KEYED, canonicalField, gateResult, getField, sortedJson, supersession, violation } from './authored.mjs';
import { agreeFixtures } from './authored-fixtures.mjs';

export const REASON_CODES = Object.freeze([
  'adjudicator_missing',
  'adjudicator_is_keyer',
  'adjudication_decision_invalid',
  'adjudication_duplicate',
  'adjudication_orphan',
  'adjudication_kind_invalid',
  'correction_orphan',
  'correction_rule_missing',
  'correction_duplicate',
  'correction_supersedes_unknown',
  'correction_supersede_duplicate',
]);
export const AGREEMENT_LABEL = 'agreement≠correctness';
export const DECISIONS = Object.freeze(['a', 'b', 'value']);
/** The adjudications.json kinds this gate decides (the others belong to G-PROV / G-CLAUSE / G-EVAL). */
export const HANDLED_KINDS = Object.freeze(['disagreement', 'correction']);
/** Spec 68 §6 names the ⧉ field `applies_to.part` (compared with its refs as one projection, key `applies_to`). */
export const FIELD_ALIASES = Object.freeze({ 'applies_to.part': 'applies_to' });

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

function setField(obj, p, value) {
  const ks = p.split('.');
  let cur = obj;
  for (const k of ks.slice(0, -1)) {
    if (cur[k] === null || typeof cur[k] !== 'object' || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[ks[ks.length - 1]] = clone(value);
}

function canon(field, value, failures, who, unitId) {
  try {
    return canonicalField(field, value, { unitId });
  } catch (err) {
    if (!(err instanceof DslError)) throw err;
    failures.push({ keyer: who, field, code: err.code });
    return `!unparseable:${sortedJson(value)}`;
  }
}

/** G-AGREE over every shard. PURE. */
export function checkAgree({ shards = [], adjudications = null, vocab = null, doubleKeyed = DOUBLE_KEYED } = {}) {
  const v = [];
  const units = new Map();
  const open = new Map(); // `${unit}\0${field}` → {a, b, keyers}
  const counts = { units_agreed: 0, units_adjudicated: 0, units_pending: 0, fields_compared: 0, fields_agreed: 0, disagreements: 0, disagreements_open: 0, draft_failures: 0, unpaired_units: 0, fields_absent_both: 0, corrections: 0, corrections_superseded: 0, superseded_units: 0, adjudications_superseded: 0 };

  const sup = supersession(shards); // Spec 69a M-80: only the newest generation of a unit is read
  // Spec 69a M-80: units whose drafts a newer generation superseded (shard key → Set(unit ids) → one flat Set)
  const rekeyedUnits = new Set([...sup.superseded.values()].flatMap((ids) => [...ids]));
  for (const s of [...shards].sort((x, y) => cmpStr(x.key, y.key))) {
    const aUnits = (s.a && Array.isArray(s.a.units) ? s.a.units : []).filter((u) => u && isStr(u.unit_id));
    const bUnits = (s.b && Array.isArray(s.b.units) ? s.b.units : []).filter((u) => u && isStr(u.unit_id));
    const keyers = (s.prov && s.prov.keyers) || null;
    const bMap = new Map(bUnits.map((u) => [u.unit_id, u]));
    const aMap = new Map(aUnits.map((u) => [u.unit_id, u]));
    for (const id of [...new Set([...aMap.keys(), ...bMap.keys()])].sort(cmpStr)) {
      if (sup.superseded.has(s.key) && sup.superseded.get(s.key).has(id)) {
        counts.superseded_units++; // M-80: a re-key generation of this unit supersedes this shard's drafts
        continue;
      }
      const a = aMap.get(id);
      const b = bMap.get(id);
      if (!a || !b) {
        if (s.a && s.b) counts.unpaired_units++;
        units.set(id, { state: 'pending', unit: clone(a || b), shard: s.key, keyers, disagreements: [], why: !s.b ? 'no .b draft yet' : !s.a ? 'no .a draft' : `drafted by keyer ${a ? 'A' : 'B'} only` });
        continue;
      }
      const failures = [];
      const dis = [];
      for (const f of doubleKeyed) {
        const va = getField(a, f);
        const vb = getField(b, f);
        if (va === undefined && vb === undefined) {
          if (!OPTIONAL_KEYED.includes(f)) counts.fields_absent_both++; // G-SHAPE field_missing fails the agreed unit
          continue;
        }
        counts.fields_compared++;
        const ca = canon(f, va, failures, 'A', id);
        const cb = canon(f, vb, failures, 'B', id);
        const unparseable = ca.startsWith('!unparseable:') || cb.startsWith('!unparseable:'); // no canonical form → cannot agree (§7.4)
        if (ca === cb && !unparseable) counts.fields_agreed++;
        else {
          dis.push(f);
          open.set(`${id}\u0000${f}`, { a: va, b: vb, keyers, shard: s.key });
        }
      }
      counts.draft_failures += failures.length;
      counts.disagreements += dis.length;
      units.set(id, { state: dis.length ? 'pending' : 'agreed', unit: clone(a), shard: s.key, keyers, disagreements: dis, b: clone(b), draft_failures: failures });
    }
  }

  // adjudications of kind `disagreement`
  const entries = adjudications && Array.isArray(adjudications.adjudications) ? adjudications.adjudications : [];
  const kinds = vocab && Array.isArray(vocab.adjudication_kind) ? new Set(vocab.adjudication_kind) : null;
  const resolved = new Map(); // key → adjudication
  // group first, so the verdict never depends on the order of adjudications.json (a duplicate resolves nothing)
  const groups = new Map();
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    if (kinds && !kinds.has(e.kind)) v.push(violation('adjudication_kind_invalid', e.id ?? '?', `kind ${e.kind} is not in vocab.adjudication_kind`));
    if (e.kind !== 'disagreement') continue;
    const key = `${e.unit}\u0000${FIELD_ALIASES[e.field] ?? e.field}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  for (const [key, group] of [...groups].sort((x, y) => cmpStr(x[0], y[0]))) {
    const e = group[0];
    const id = e.id ?? `${e.unit}/${e.field}`;
    if (group.length > 1) {
      for (const x of group) v.push(violation('adjudication_duplicate', x.id ?? id, `${group.length} adjudications for ${e.unit} ${e.field}`));
      continue;
    }
    const d = open.get(key);
    if (!d) {
      if (rekeyedUnits.has(e.unit)) { counts.adjudications_superseded++; continue; } // Spec 69a M-80: the re-key superseded the disagreement this answered — kept as history, counted
      v.push(violation('adjudication_orphan', id, `${e.unit} ${e.field} has no open disagreement`));
      continue;
    }
    let ok = true;
    if (!isStr(e.adjudicator)) {
      v.push(violation('adjudicator_missing', id));
      ok = false;
    } else {
      const ks = d.keyers ? [d.keyers.a && d.keyers.a.id, d.keyers.b && d.keyers.b.id].filter(isStr) : [];
      // fail closed: without both keyer ids from the provenance record, independence cannot be shown
      if (ks.length < 2 || ks.includes(e.adjudicator)) {
        v.push(violation('adjudicator_is_keyer', id, ks.length < 2 ? `shard ${d.shard} records no keyer ids, so ${e.adjudicator} cannot be shown to be neither keyer` : `${e.adjudicator} drafted shard ${d.shard}`));
        ok = false;
      }
    }
    const hasValue = Object.hasOwn(e, 'value');
    if (!DECISIONS.includes(e.decision) || (e.decision === 'value') !== hasValue) {
      v.push(violation('adjudication_decision_invalid', id, `decision ${e.decision}${hasValue ? ' with a value' : ''}`));
      ok = false;
    }
    if (ok) resolved.set(key, e);
  }

  for (const [id, rec] of units) {
    if (rec.state === 'pending' && rec.disagreements.length) {
      const allDone = rec.disagreements.every((f) => resolved.has(`${id}\u0000${f}`));
      if (allDone) {
        rec.state = 'adjudicated';
        for (const f of rec.disagreements) {
          const e = resolved.get(`${id}\u0000${f}`);
          setField(rec.unit, f, e.decision === 'a' ? getField(rec.unit, f) : e.decision === 'b' ? getField(rec.b, f) : e.value);
        }
      } else counts.disagreements_open += rec.disagreements.filter((f) => !resolved.has(`${id}\u0000${f}`)).length;
    }
  }

  // corrections of kind `correction` (Spec 69 M-75): applied once every unit's state is final, to the resolved unit.
  // Group first, so the verdict never depends on the order of adjudications.json (a duplicate applies nothing).
  // Spec 69a M-75 note 2026-10-08: a correction may carry `supersedes:"<COR id>"`; the newest live record applies and
  // the superseded record stays byte-identical. Known-bad supersedes is RED (fail closed — the group applies nothing).
  const corrections = entries.filter((e) => e && typeof e === 'object' && e.kind === 'correction');
  const byId = new Map(); // every correction id → record
  for (const e of corrections) if (isStr(e.id)) byId.set(e.id, e);
  const notApplying = new Set(); // records that are in play but must not be applied
  const supersededBy = new Map(); // superseded id → [superseding record]
  for (const e of corrections) {
    if (!Object.hasOwn(e, 'supersedes')) continue;
    const t = byId.get(e.supersedes);
    if (!t || t.unit !== e.unit || t.field !== e.field) {
      v.push(violation('correction_supersedes_unknown', e.id ?? `${e.unit}/${e.field}`, `${e.id ?? '?'} supersedes ${e.supersedes}, which is not a correction of ${e.unit} ${e.field}`));
      notApplying.add(e);
      continue;
    }
    if (!supersededBy.has(e.supersedes)) supersededBy.set(e.supersedes, []);
    supersededBy.get(e.supersedes).push(e);
  }
  const failClosed = new Set(); // ids of superseded records whose superseders are ambiguous
  for (const [sid, ss] of supersededBy) {
    if (ss.length <= 1) continue;
    for (const x of ss) {
      v.push(violation('correction_supersede_duplicate', x.id ?? `${x.unit}/${x.field}`, `${ss.length} corrections supersede ${sid} (${x.unit} ${x.field})`));
      notApplying.add(x);
    }
    failClosed.add(sid);
    const t = byId.get(sid);
    if (t) notApplying.add(t); // the group applies nothing
  }
  const cGroups = new Map(); // `${unit}\0${field}` → [correction]
  for (const e of corrections) {
    if (notApplying.has(e)) continue;
    const key = `${e.unit}\u0000${e.field}`;
    if (!cGroups.has(key)) cGroups.set(key, []);
    cGroups.get(key).push(e);
  }
  for (const [key, group] of [...cGroups].sort((x, y) => cmpStr(x[0], y[0]))) {
    const e = group[0];
    const id = e.id ?? `${e.unit}/${e.field}`;
    // the newest live record: one a record in play of the same group supersedes
    const supersededHere = group.filter((x) => supersededBy.has(x.id) && supersededBy.get(x.id).some((s) => group.includes(s)) && !failClosed.has(x.id));
    const live = group.filter((x) => !supersededHere.includes(x));
    for (const x of supersededHere) counts.corrections_superseded++;
    if (live.length > 1) {
      for (const x of live) v.push(violation('correction_duplicate', x.id ?? id, `${live.length} corrections for ${e.unit} ${e.field}`));
      continue;
    }
    if (!live.length) continue; // every record in the group was validly superseded by an excluded record
    const winner = live[0];
    const wid = winner.id ?? id;
    const rec = units.get(winner.unit);
    if (!rec || (rec.state !== 'agreed' && rec.state !== 'adjudicated') || getField(rec.unit, winner.field) === undefined) {
      v.push(violation('correction_orphan', wid, `${winner.unit} ${winner.field} is not an agreed / adjudicated field`));
      continue;
    }
    let ok = true;
    if (!isStr(winner.adjudicator)) {
      v.push(violation('adjudicator_missing', wid));
      ok = false;
    } else {
      const ks = rec.keyers ? [rec.keyers.a && rec.keyers.a.id, rec.keyers.b && rec.keyers.b.id].filter(isStr) : [];
      // fail closed: without both keyer ids from the provenance record, independence cannot be shown
      if (ks.length < 2 || ks.includes(winner.adjudicator)) {
        v.push(violation('adjudicator_is_keyer', wid, ks.length < 2 ? `shard ${rec.shard} records no keyer ids, so ${winner.adjudicator} cannot be shown to be neither keyer` : `${winner.adjudicator} drafted shard ${rec.shard}`));
        ok = false;
      }
    }
    if (!isStr(winner.rule)) {
      v.push(violation('correction_rule_missing', wid, `${winner.unit} ${winner.field} cites no rule`));
      ok = false;
    }
    if (ok) {
      setField(rec.unit, winner.field, winner.value);
      counts.corrections++;
    }
  }

  for (const [, rec] of units) {
    delete rec.b;
    if (rec.state === 'agreed') counts.units_agreed++;
    else if (rec.state === 'adjudicated') counts.units_adjudicated++;
    else counts.units_pending++;
  }
  const rate = counts.fields_compared ? counts.fields_agreed / counts.fields_compared : null;
  return gateResult({ violations: v, checked: counts.fields_compared, counts, agreement_rate: rate, agreement_label: AGREEMENT_LABEL, units });
}

/** The agreed / adjudicated units only (what the content gates read): Map(unit_id → resolved unit). */
export function agreedUnits(agreeResult) {
  const out = new Map();
  for (const [id, rec] of agreeResult.units) if (rec.state === 'agreed' || rec.state === 'adjudicated') out.set(id, rec.unit);
  return out;
}

// ---------------------------------------------------------------- self-test (real clause text: authored-fixtures.mjs)


/** One known-bad fixture per reason code + the good twins (agreed; adjudicated; pending never fails). */
export function selfTest() {
  const results = [];
  for (const f of agreeFixtures()) {
    const r = checkAgree(f.input);
    const codes = [...new Set(r.violations.map((x) => x.code))];
    const ok = f.reason === null ? r.status === 'pass' && (!f.expect || f.expect(r)) : r.status === 'fail' && codes.length === 1 && codes[0] === f.reason;
    results.push({ name: f.name, expected: f.reason, got: codes, ok });
  }
  const covered = new Set(results.map((x) => x.expected).filter(Boolean));
  for (const c of REASON_CODES) if (!covered.has(c)) results.push({ name: `fixture for ${c}`, expected: c, got: [], ok: false });
  return { pass: results.every((x) => x.ok), results };
}
