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
// A unit's state: `agreed` (every ⧉ projection equal), `adjudicated` (every disagreement carries a valid adjudication),
// `pending` (no .b yet, a unit drafted by one keyer only, or an open disagreement). The resolved unit is A's draft with
// each adjudicated field replaced (decision `b` → B's value, `value` → the adjudicated value). Only agreed/adjudicated
// units reach the content gates (G-CLAUSE, G-XREF, G-SHAPE).
//
// An adjudication record (adjudications.json, kind `disagreement`):
//   {id, kind:"disagreement", unit:<unit_id>, field:<⧉ path>, adjudicator, decision: a | b | value, value? , reason}
//
// Reason codes (closed; ADJ = an adjudications.json entry of kind `disagreement`):
//   adjudicator_missing             an ADJ names no adjudicator
//   adjudicator_is_keyer            an ADJ's adjudicator is keyer A or keyer B of the unit's shard (Spec 124 §4.2)
//   adjudication_decision_invalid   decision ∉ {a, b, value}, or `value` without a value / a value with a or b
//   adjudication_duplicate          two ADJs for one (unit, field)
//   adjudication_orphan             an ADJ for a (unit, field) that has no open disagreement (agreed, not ⧉, or unknown)
//   adjudication_kind_invalid       an adjudications.json kind outside vocab.adjudication_kind
// Counted, never failing: pending units, open disagreements, draft failures (a draft whose DSL does not parse).

import { DslError } from './dsl.mjs';
import { DOUBLE_KEYED, OPTIONAL_KEYED, canonicalField, gateResult, getField, sortedJson, violation } from './authored.mjs';
import { agreeFixtures } from './authored-fixtures.mjs';

export const REASON_CODES = Object.freeze([
  'adjudicator_missing',
  'adjudicator_is_keyer',
  'adjudication_decision_invalid',
  'adjudication_duplicate',
  'adjudication_orphan',
  'adjudication_kind_invalid',
]);
export const AGREEMENT_LABEL = 'agreement≠correctness';
export const DECISIONS = Object.freeze(['a', 'b', 'value']);
/** The adjudications.json kinds this gate decides (the others belong to G-PROV / G-CLAUSE / G-EVAL). */
export const HANDLED_KINDS = Object.freeze(['disagreement']);
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

function canon(field, value, failures, who) {
  try {
    return canonicalField(field, value);
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
  const counts = { units_agreed: 0, units_adjudicated: 0, units_pending: 0, fields_compared: 0, fields_agreed: 0, disagreements: 0, disagreements_open: 0, draft_failures: 0, unpaired_units: 0, fields_absent_both: 0 };

  for (const s of [...shards].sort((x, y) => cmpStr(x.key, y.key))) {
    const aUnits = (s.a && Array.isArray(s.a.units) ? s.a.units : []).filter((u) => u && isStr(u.unit_id));
    const bUnits = (s.b && Array.isArray(s.b.units) ? s.b.units : []).filter((u) => u && isStr(u.unit_id));
    const keyers = (s.prov && s.prov.keyers) || null;
    const bMap = new Map(bUnits.map((u) => [u.unit_id, u]));
    const aMap = new Map(aUnits.map((u) => [u.unit_id, u]));
    for (const id of [...new Set([...aMap.keys(), ...bMap.keys()])].sort(cmpStr)) {
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
        const ca = canon(f, va, failures, 'A');
        const cb = canon(f, vb, failures, 'B');
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
