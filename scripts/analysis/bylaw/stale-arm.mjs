// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (`pending:stale` — an adoption changed the unit's
//            normalized text; counted, never failing; only that unit is re-keyed; "an on-demand gate (G-CHANGE, G-AUDIT)
//            counts as run only when its latest committed record is bound to the current snapshot / row hashes"), §6
//            `verified_against_sha256` (a mismatch with the current unit makes it `pending:stale`), §6.4 rule 9
//            ("re-verification after a text change needs a new draft pair"), §9 G-CHANGE (the change report's stale
//            units), §10 (the amendment cycle: stale units counted, nothing blocked), SC-7 ("stale = changed exactly;
//            0 unflagged changes"), O-6; docs/specs/01-pipeline/69_mcbylaw_policy.md M-45;
//            .cursor/mcbylaw/phase2-check/REDTEAM.md A9 ("the G-CHANGE stale-unit arm is unwired")
//
// The G-CHANGE stale-unit arm, WIRED: change.mjs (Lane D) holds the pure diff (staleUnits); this module produces the
// committed change record an adoption needs and checks it against git. S3's adoptions record per-PAGE shas; the
// per-unit shas of an adoption are its slice.lock.json (`units` + `rows`, bound to `adoption_id`, re-pinned by every
// --adopt). So:
//
//   buildChangeRecord({baseLockText, baseSlice, currentSlice, adoptionId, baseAdoptionId, shards}) → record
//       run by --adopt (CLI patch in the S7/S8 report) with the base slice + its COMMITTED lock text in hand before
//       adopt() rewrites them, and the new slice after; committed with the adoption as change/<adoption_id>.json.
//       For every authored pin: {shard, seal, pin, before, after} in the pin's own space (unitView: a leaf, a
//       non-leaf clause or #whole — what G-SHAPE compares). PURE.
//   checkStaleArm({adoptions, slice, record, recordText, shards, witness}) → {status, pass, checked, violations, counts}
//       verifies the record against git (git-witness.mjs): written once; its base lock is a committed ancestor lock;
//       its pins equal the authored .prov.json files committed WITH it; its diff re-derives from that base lock and the
//       current slice; then checks today's authored pins against it. PURE given the witness.
//   pinsOf(shards) · unitsDigest(map) · staleFixtures() · selfTest()
//
// Row state stays G-SHAPE's (§4 (e): pin ≠ current unit sha → `pending:stale`). This arm closes the two holes A9 left:
// no producer of "which pinned units did this adoption change" (SC-7 unmeasured), and a pin moved (forward, or removed)
// without a new draft pair, which G-SHAPE alone reads as `complete` (forward) or `pending` (removed).
//
// Gate state (closed): not_run — no adoption with a base, no record, a record bound to another adoption or to unit /
// row shas that moved since (a re-slice), no witness, or a record not committed / with uncommitted edits; else fail on
// any violation; else pass. Stale units are counted, never failing.
//
// Reason codes (closed):
//   witness_unavailable      git cannot answer for the record, the lock history or the authored tree (fail closed)
//   base_lock_unknown        the record's base lock blob is not slice.lock.json in a committed strict ancestor of the
//                            record's commit, or does not read back to its bytes
//   record_mismatch          the record is malformed, rewritten after its first commit, its pins / seals ≠ the authored
//                            .prov.json files committed with it, or ≠ its re-derivation (base adoption, unit / row
//                            binding, a pinned unit's before / after, the diff, the stale lists, SC-7)
//   unflagged_change         a changed pinned unit that is not stale (SC-7: stale ≠ changed)
//   pin_omitted              today a shard with the recorded seal pins a unit its recorded provenance did not
//   repinned_without_rekey   today a shard with the recorded draft pair pins a recorded unit to another sha, or no
//                            longer pins it; or a stale unit re-pinned to the adopted text by a "new" pair whose B
//                            worktree commit does not descend from the record's commit (§6.4 rule 9: a NEW draft pair)

import crypto from 'node:crypto';
import { staleUnits } from './change.mjs';
import { AUTHORED_REL, buildIndex, gateResult, splitUnitId, unitView, violation, WHOLE } from './authored.mjs';
import { stableStringify } from './snapshot.mjs';
import { fakeWitness, gitBlobOid, lf } from './git-witness.mjs';

export { gitBlobOid } from './git-witness.mjs';
export const CHANGE_RECORD_SCHEMA = 'bylaw-change-v1';
/** Committed change records: one per adoption with a base (Spec 68 §9 G-CHANGE record). */
export const CHANGE_DIR_REL = 'scripts/seeds/bylaw/change';
export const LOCK_REL = 'scripts/seeds/bylaw/slice.lock.json';
export const REASON_CODES = Object.freeze(['witness_unavailable', 'base_lock_unknown', 'record_mismatch', 'unflagged_change', 'pin_omitted', 'repinned_without_rekey']);
const DERIVED_LISTS = Object.freeze(['added', 'removed', 'changed', 'stale', 'already_stale', 'orphaned_pins', 'unflagged_changes']);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (xs) => [...xs].sort(cmpStr);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const own = (o, k) => isMap(o) && Object.hasOwn(o, k);
export const recordPathOf = (adoptionId) => `${CHANGE_DIR_REL}/${adoptionId}.json`;

export class StaleArmError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = 'StaleArmError';
  }
}

/** Canonical digest of a sha map (the binding between a record and a slice). PURE. */
export const unitsDigest = (m) => sha256(stableStringify(m || {}));
const unitMap = (slice) => Object.fromEntries(((slice && slice.units) || []).map((u) => [u.unit_id, u.sha256]));
const rowMap = (slice) => Object.fromEntries(((slice && slice.rows) || []).map((r) => [r.regulation_id, r.sha256]));
/** A shard's draft-pair identity: any part changes on a re-key (A's draft bytes, B's run, B's worktree commit, the briefs). */
const sealOf = (p) => [p.a_seal && p.a_seal.sha256, p.b_run && p.b_run.run_id, p.b_run && p.b_run.worktree_commit, p.briefs && p.briefs.a, p.briefs && p.briefs.b].map(String).join('|');

/**
 * Authored pins. pins: unit_id → {pin, shard, seal} (the first shard by key; two shards keying one unit is G-SHAPE's
 * schema_invalid); byShard: shard → {seal, worktree, pins: {unit_id → pin}}; seals: shard → seal. Shards without a
 * provenance record have no pins (G-PROV prov_missing / prov_field_missing). PURE.
 */
export function pinsOf(shards) {
  const pins = new Map();
  const seals = {};
  const byShard = new Map();
  for (const s of [...(Array.isArray(shards) ? shards : [])].sort((a, b) => cmpStr(String(a && a.key), String(b && b.key)))) {
    const p = s && s.prov;
    if (!isMap(p) || !isMap(p.unit_shas)) continue;
    seals[s.key] = sealOf(p);
    byShard.set(s.key, { seal: seals[s.key], worktree: String((p.b_run && p.b_run.worktree_commit) || ''), pins: Object.fromEntries(Object.entries(p.unit_shas).map(([k, x]) => [k, String(x)])) });
    for (const [id, pin] of Object.entries(p.unit_shas).sort((a, b) => cmpStr(a[0], b[0]))) if (!pins.has(id)) pins.set(id, { pin: String(pin), shard: s.key, seal: seals[s.key] });
  }
  return { pins, seals, byShard };
}

/** The change record for one adoption against its base. PURE. Throws StaleArmError on a base that is not the lock's. */
export function buildChangeRecord({ baseLockText, baseSlice, currentSlice, adoptionId, baseAdoptionId, shards = [] }) {
  let baseLock;
  try {
    baseLock = JSON.parse(baseLockText);
  } catch (err) {
    throw new StaleArmError('base_lock_unparsable', String(err && err.message));
  }
  if (!isMap(baseLock) || !isMap(baseLock.units) || !isMap(baseLock.rows)) throw new StaleArmError('base_lock_unparsable', 'units / rows are not maps');
  if (baseLock.adoption_id !== baseAdoptionId) throw new StaleArmError('base_lock_adoption', `the base lock is ${baseLock.adoption_id}, not ${baseAdoptionId}`);
  if (unitsDigest(baseLock.units) !== unitsDigest(unitMap(baseSlice)) || unitsDigest(baseLock.rows) !== unitsDigest(rowMap(baseSlice))) throw new StaleArmError('base_slice_mismatch', 'the in-memory base slice is not the committed base lock');
  const curUnits = unitMap(currentSlice);
  const curRows = rowMap(currentSlice);
  const { pins, seals } = pinsOf(shards);
  const bi = buildIndex(baseSlice);
  const ci = buildIndex(currentSlice);
  const pinned = {};
  for (const [id, p] of pins) {
    const b = unitView(bi, id);
    const c = unitView(ci, id);
    pinned[id] = { after: c ? c.sha256 : null, before: b ? b.sha256 : null, pin: p.pin, seal: p.seal, shard: p.shard };
  }
  const r = deriveStale(baseLock.units, curUnits, pinned);
  return {
    schema: CHANGE_RECORD_SCHEMA,
    adoption_id: adoptionId,
    base_adoption: baseAdoptionId,
    base_lock_blob: gitBlobOid(Buffer.from(lf(baseLockText), 'utf8')),
    base_units_sha256: unitsDigest(baseLock.units),
    base_rows_sha256: unitsDigest(baseLock.rows),
    units_sha256: unitsDigest(curUnits),
    rows_sha256: unitsDigest(curRows),
    ...Object.fromEntries(DERIVED_LISTS.map((k) => [k, r[k]])),
    rows_changed: rowsDelta(baseLock.rows, curRows),
    seals,
    pinned,
    sc7: r.sc7,
  };
}

/** change.mjs staleUnits over the leaf maps + the pinned units' own shas. PURE. */
function deriveStale(baseUnits, curUnits, pinned) {
  const before = { ...(baseUnits || {}) };
  const after = { ...(curUnits || {}) };
  const pins = {};
  for (const [id, e] of Object.entries(pinned || {})) {
    if (e.before !== null) before[id] = e.before;
    else delete before[id];
    if (e.after !== null) after[id] = e.after;
    else delete after[id];
    pins[id] = e.pin;
  }
  return staleUnits({ before, after, pins });
}

/** Rows added / removed / changed between two row-sha maps. PURE. */
function rowsDelta(b, a) {
  const keys = sorted(new Set([...Object.keys(b || {}), ...Object.keys(a || {})]));
  return keys.filter((k) => (b || {})[k] !== (a || {})[k]);
}

/** Is clause path `q` the path `p` or under it? Segment-aware: (3)(A)(i) is not under (3)(A)(ii). PURE. */
const under = (q, p) => q === p || q.startsWith(`${p}(`) || q.startsWith(`${p}[`);

/** Shards as committed with the record: authored/<page>/<article>.prov.json in the record's commit. */
function provAt(witness, commit) {
  const tree = witness.lsTree(commit, AUTHORED_REL);
  if (tree === null) return null;
  const provs = tree.filter((x) => /\/[^/]+\/[^/]+\.prov\.json$/.test(x.path));
  const texts = witness.readBlobs(provs.map((x) => x.oid));
  const shards = [];
  for (const x of provs) {
    const m = new RegExp(`^${AUTHORED_REL}/([^/]+)/(.+)\\.prov\\.json$`).exec(x.path);
    if (!m) continue;
    const t = texts.get(x.oid);
    if (typeof t !== 'string') return null;
    let prov = null;
    try {
      prov = JSON.parse(t);
    } catch {
      prov = null; // an unparsable provenance file is G-SHAPE's schema_invalid; it has no pins here
    }
    shards.push({ key: `${m[1]}/${m[2]}`, prov });
  }
  return shards;
}

function recordProblems(rec) {
  const p = [];
  if (rec.schema !== CHANGE_RECORD_SCHEMA) p.push(`schema ≠ ${CHANGE_RECORD_SCHEMA}`);
  for (const k of ['adoption_id', 'base_adoption', 'base_lock_blob', 'base_units_sha256', 'base_rows_sha256', 'units_sha256', 'rows_sha256']) if (!isStr(rec[k])) p.push(`${k} missing`);
  for (const k of [...DERIVED_LISTS, 'rows_changed']) if (!Array.isArray(rec[k]) || rec[k].some((x) => typeof x !== 'string')) p.push(`${k} is not a string list`);
  if (!isMap(rec.seals) || Object.values(rec.seals).some((x) => typeof x !== 'string')) p.push('seals is not a map of strings');
  if (!isMap(rec.pinned)) p.push('pinned is not a map');
  else for (const [id, e] of Object.entries(rec.pinned)) if (!isMap(e) || !isStr(e.pin) || !isStr(e.shard) || !isStr(e.seal) || !(e.before === null || isStr(e.before)) || !(e.after === null || isStr(e.after))) p.push(`pinned ${id} is malformed`);
  if (!isMap(rec.sc7)) p.push('sc7 missing');
  return p;
}

/** The G-CHANGE stale-unit arm. PURE given the witness. */
export function checkStaleArm({ adoptions = [], slice = null, record = null, recordText = null, shards = [], witness = null } = {}) {
  const v = [];
  const counts = { pinned: 0, changed: 0, stale: 0, newly_stale: 0, already_stale: 0, orphaned_pins: 0, rows_changed: 0 };
  const notRun = (why) => gateResult({ violations: [], checked: 0, counts, notRun: why });
  const fail = (checked) => gateResult({ violations: v, checked, counts });
  const list = Array.isArray(adoptions) ? adoptions : [];
  const latest = list.at(-1);
  if (!latest || list.length < 2) return notRun('no adoption with a base: nothing for a change record to cover');
  if (!slice || !Array.isArray(slice.units) || !Array.isArray(slice.rows)) return notRun('no current slice was supplied');
  if (!isMap(record)) return notRun(`no committed change record for ${latest.adoption_id} (written by --adopt)`);
  if (!Array.isArray(shards)) return notRun('the authored shards were not supplied');
  if (typeof recordText !== 'string') return notRun('the record text was not supplied (it is compared with the committed bytes)');
  const mismatch = (what) => v.push(violation('record_mismatch', String(record.adoption_id), what));
  const shape = recordProblems(record);
  if (shape.length) {
    for (const x of shape) mismatch(x);
    return fail(1);
  }
  if (record.adoption_id !== latest.adoption_id || record.base_adoption !== list.at(-2).adoption_id) return notRun(`the change record covers ${record.adoption_id} ← ${record.base_adoption}, not ${latest.adoption_id} ← ${list.at(-2).adoption_id}`);
  const curUnits = unitMap(slice);
  const curRows = rowMap(slice);
  if (record.units_sha256 !== unitsDigest(curUnits) || record.rows_sha256 !== unitsDigest(curRows)) return notRun(`the unit / row shas moved since the record for ${record.adoption_id} (a re-slice): not bound to the current snapshot`);
  if (!witness) return notRun('the git witness was not injected');

  // the record: committed once, today's bytes = the committed bytes
  const recPath = recordPathOf(record.adoption_id);
  const recCommits = witness.commitsTouching(recPath);
  if (recCommits === null) {
    v.push(violation('witness_unavailable', recPath, 'git log failed'));
    return fail(1);
  }
  const versions = recCommits.filter((c) => witness.blobAt(c, recPath) !== null);
  if (!versions.length) return notRun(`${recPath} is not committed (an on-demand gate counts as run only on a committed record)`);
  if (recCommits.length > 1) {
    mismatch(`rewritten after its first commit (${recCommits.length} changes); a record is written once by --adopt`);
    return fail(1);
  }
  const recCommit = versions[0];
  const committed = witness.readBlob(witness.blobAt(recCommit, recPath));
  if (typeof committed !== 'string') {
    v.push(violation('witness_unavailable', recPath, `cannot read it at ${recCommit.slice(0, 12)}`));
    return fail(1);
  }
  let committedObj = null;
  try {
    committedObj = JSON.parse(committed);
  } catch {
    committedObj = null; // a committed record that does not parse is not this record: uncommitted edits below
  }
  if (lf(committed) !== lf(recordText) || stableStringify(committedObj) !== stableStringify(record)) return notRun(`${recPath} has uncommitted edits`);

  // the base lock: slice.lock.json in a committed strict ancestor of the record's commit
  const lockCommits = witness.commitsTouching(LOCK_REL);
  if (lockCommits === null) {
    v.push(violation('witness_unavailable', LOCK_REL, 'git log failed'));
    return fail(1);
  }
  const lockCommit = lockCommits.filter((c) => c !== recCommit && witness.blobAt(c, LOCK_REL) === record.base_lock_blob).find((c) => witness.isAncestor(c, recCommit) === true);
  const text = lockCommit ? witness.readBlob(record.base_lock_blob) : null;
  if (typeof text !== 'string' || gitBlobOid(Buffer.from(lf(text), 'utf8')) !== record.base_lock_blob) {
    v.push(violation('base_lock_unknown', record.adoption_id, `base lock blob ${record.base_lock_blob} is not ${LOCK_REL} in a committed ancestor of ${recCommit.slice(0, 12)}`));
    return fail(1);
  }
  let baseLock = null;
  try {
    baseLock = JSON.parse(text);
  } catch {
    baseLock = null; // reported just below as a mismatch with the named base adoption
  }
  if (!isMap(baseLock) || !isMap(baseLock.units) || !isMap(baseLock.rows) || baseLock.adoption_id !== record.base_adoption || unitsDigest(baseLock.units) !== record.base_units_sha256 || unitsDigest(baseLock.rows) !== record.base_rows_sha256) {
    mismatch('the witnessed base lock is not the base adoption / unit shas / row shas the record names');
    return fail(1);
  }

  // the pins: equal to the authored provenance committed WITH the record
  const then = provAt(witness, recCommit);
  if (then === null) {
    v.push(violation('witness_unavailable', AUTHORED_REL, `cannot read the authored tree at ${recCommit.slice(0, 12)}`));
    return fail(1);
  }
  const { pins: thenPins, seals: thenSeals } = pinsOf(then);
  if (stableStringify(thenSeals) !== stableStringify(record.seals)) mismatch('seals ≠ the authored provenance committed with the record');
  const pinned = record.pinned;
  for (const id of sorted(new Set([...thenPins.keys(), ...Object.keys(pinned)]))) {
    const t = thenPins.get(id);
    const e = own(pinned, id) ? pinned[id] : null;
    if (!t || !e || t.pin !== e.pin || t.shard !== e.shard || t.seal !== e.seal) mismatch(`${id}: the recorded pin ≠ the authored provenance committed with the record`);
  }
  if (v.length) return fail(1);

  // before / after: after = today's unit; before = the base lock (leaf, #whole) or consistent with it (non-leaf)
  const ci = buildIndex(slice);
  const baseUnits = baseLock.units;
  const baseRows = baseLock.rows;
  const leafIds = sorted(new Set([...Object.keys(baseUnits), ...Object.keys(curUnits)]));
  for (const [id, e] of Object.entries(pinned).sort((a, b) => cmpStr(a[0], b[0]))) {
    const c = unitView(ci, id);
    if ((c ? c.sha256 : null) !== e.after) mismatch(`${id}: recorded after ≠ the current unit sha`);
    const { reg, path: p } = splitUnitId(id);
    if (own(baseUnits, id)) {
      if (e.before !== baseUnits[id]) mismatch(`${id}: recorded before ≠ the base lock`);
    } else if (p === WHOLE) {
      if (e.before !== (own(baseRows, reg) ? baseRows[reg] : null)) mismatch(`${id}: recorded before ≠ the base lock row sha`);
    } else if (p !== null) {
      // a non-leaf clause: its text holds its leaves (whose shas carry their lead-ins), within its row
      const leafMoved = leafIds.some((u) => {
        const s = splitUnitId(u);
        return s.reg === reg && under(String(s.path), p) && (own(baseUnits, u) ? baseUnits[u] : null) !== (own(curUnits, u) ? curUnits[u] : null);
      });
      const rowSame = own(baseRows, reg) && own(curRows, reg) && baseRows[reg] === curRows[reg];
      if (leafMoved && e.before === e.after) mismatch(`${id}: recorded unchanged, but a leaf under it changed`);
      if (rowSame && e.before !== e.after) mismatch(`${id}: recorded changed, but its row did not change`);
    }
  }
  const r = deriveStale(baseUnits, curUnits, pinned);
  for (const k of DERIVED_LISTS) if (!sameList(record[k], r[k])) mismatch(`${k} ≠ its re-derivation`);
  if (!sameList(record.rows_changed, rowsDelta(baseRows, curRows))) mismatch('rows_changed ≠ its re-derivation');
  if (stableStringify(record.sc7) !== stableStringify(r.sc7)) mismatch('sc7 ≠ its re-derivation');
  for (const id of r.unflagged_changes) v.push(violation('unflagged_change', id, 'a changed pinned unit that is not stale (SC-7)'));

  // today's pins against the record: a shard with the recorded seal has not been re-keyed (§6.4 rule 9)
  const { byShard } = pinsOf(shards);
  const recShards = Object.keys(record.seals);
  if (recShards.length && !recShards.some((k) => byShard.has(k))) return notRun('none of the shards the record saw is in the supplied authored tree (not supplied?)');
  for (const [id, e] of Object.entries(pinned).sort((a, b) => cmpStr(a[0], b[0]))) {
    const sh = byShard.get(e.shard);
    if (!sh) continue; // the shard is gone: its rows have no authored entry (G-SHAPE: pending)
    const n = own(sh.pins, id) ? sh.pins[id] : null;
    if (sh.seal === e.seal) {
      if (n === null) v.push(violation('repinned_without_rekey', id, `${e.shard} no longer pins it, with the same draft pair`));
      else if (n !== e.pin) v.push(violation('repinned_without_rekey', id, `${e.shard}: pin moved ${e.pin.slice(0, 12)}… → ${n.slice(0, 12)}… with the same draft pair`));
    } else if (r.stale.includes(id) && n !== null && n === e.after && witness.isAncestor(recCommit, sh.worktree) !== true) {
      // re-verified against the new text: B's draft must come from a worktree that already holds the adoption
      v.push(violation('repinned_without_rekey', id, `${e.shard}: re-pinned to the adopted text, but B's worktree commit ${sh.worktree.slice(0, 12)} does not descend from the adoption's record commit ${recCommit.slice(0, 12)}`));
    }
  }
  for (const [k, sh] of byShard) {
    if (record.seals[k] !== sh.seal) continue;
    for (const id of Object.keys(sh.pins).sort(cmpStr)) if (!own(pinned, id) || pinned[id].shard !== k) v.push(violation('pin_omitted', id, `${k} pins it today with the draft pair the record saw, which did not pin it`));
  }
  if (!r.sc7.equal && !r.unflagged_changes.length) v.push(violation('unflagged_change', record.adoption_id, `changed pinned ${r.sc7.changed_pinned} ≠ newly stale ${r.sc7.newly_stale}`));
  Object.assign(counts, { pinned: Object.keys(pinned).length, changed: r.changed.length, stale: r.stale.length, newly_stale: r.sc7.newly_stale, already_stale: r.already_stale.length, orphaned_pins: r.orphaned_pins.length, rows_changed: record.rows_changed.length });
  return fail(Object.keys(pinned).length + 1);
}

// ---------------------------------------------------------------- fixtures (in memory)

const H = (s) => sha256(`unit:${s}`);
function fxSlice(texts) {
  // one row R(1): a lead-in (1) (non-leaf) with leaves (1)(A), (1)(B); leaf shas carry their lead-in (like slice.mjs)
  const units = Object.entries(texts.leaves).map(([p, t]) => ({ unit_id: `R(1)#${p}`, clause_path: p, sha256: H(`${texts.lead} ${t}`), text: t, context: [texts.lead] }));
  const verbatim = [texts.lead, ...Object.values(texts.leaves)].join(' ');
  const clauses = [{ path: '(1)', leaf: false, text: texts.lead, ranges: [[0, texts.lead.length]] }, ...Object.entries(texts.leaves).map(([p, t]) => ({ path: p, leaf: true, text: t, ancestors: ['(1)'] }))];
  return { rows: [{ regulation_id: 'R(1)', article: 'R', sha256: H(verbatim), verbatim, clauses }], units };
}
const BASE = fxSlice({ lead: '(1) lead', leaves: { '(1)(A)': '(A) 1.8 m', '(1)(B)': '(B) 2.4 m' } });
const NEXT = fxSlice({ lead: '(1) lead', leaves: { '(1)(A)': '(A) 2.1 m', '(1)(B)': '(B) 2.4 m' } });
const LEAD = fxSlice({ lead: '(1) lead changed', leaves: { '(1)(A)': '(A) 1.8 m', '(1)(B)': '(B) 2.4 m' } });
const lockText = (slice, adoption) => stableStringify({ adoption_id: adoption, rows: rowMap(slice), units: unitMap(slice) });
const BASE_LOCK = lockText(BASE, 'adoption-1');
const ADOPTIONS = [{ adoption_id: 'adoption-1' }, { adoption_id: 'adoption-2' }];
const PROV_PATH = `${AUTHORED_REL}/fx/R.prov.json`;
const viewSha = (slice, id) => unitView(buildIndex(slice), id).sha256;
const prov = (pins, sealId = 1, worktree = 'f'.repeat(40)) => ({ a_seal: { sha256: 's'.repeat(64), seal_id: sealId }, b_run: { run_id: `run-${sealId}`, worktree_commit: worktree }, briefs: { a: 'a'.repeat(64), b: 'b'.repeat(64) }, unit_shas: { ...pins } });
const shardOf = (p) => ({ key: 'fx/R', prov: p });
const basePins = () => ({ 'R(1)#(1)(A)': viewSha(BASE, 'R(1)#(1)(A)'), 'R(1)#(1)(B)': viewSha(BASE, 'R(1)#(1)(B)') });

/** One adoption world: commit 0 = base lock + the shard's provenance; commit 1 = the change record (+ the new lock). */
function world({ cur = NEXT, thenProv = prov(basePins()), nowProv = undefined, edit = null, steps = null } = {}) {
  const record = buildChangeRecord({ baseLockText: BASE_LOCK, baseSlice: BASE, currentSlice: cur, adoptionId: 'adoption-2', baseAdoptionId: 'adoption-1', shards: [shardOf(thenProv)] });
  if (edit) edit(record);
  const text = stableStringify(record);
  const hist = steps || [{ [LOCK_REL]: BASE_LOCK, [PROV_PATH]: stableStringify(thenProv) }, { [recordPathOf('adoption-2')]: text, [LOCK_REL]: lockText(cur, 'adoption-2') }, { 'b-worktree.txt': 'B drafts here' }];
  return { adoptions: ADOPTIONS, slice: cur, record, recordText: text, shards: [shardOf(nowProv === undefined ? thenProv : nowProv)], witness: fakeWitness(hist) };
}
const clone = (x) => JSON.parse(JSON.stringify(x));

/** {name, reason (null = good twin), twin_of?, input}. Each known-bad fails for exactly its code. */
export function staleFixtures() {
  const f = [];
  const add = (reason, bad, good = world()) => {
    f.push({ name: `bad: ${reason}`, reason, input: bad });
    f.push({ name: `good twin of ${reason}`, reason: null, twin_of: reason, input: good });
  };
  add('witness_unavailable', { ...world(), witness: { ...world().witness, commitsTouching: (p) => (p === LOCK_REL ? null : world().witness.commitsTouching(p)) } });
  {
    // the base lock blob exists only as an object written next to the record, never as an ancestor slice.lock.json
    const w = world();
    const steps = [{ [PROV_PATH]: stableStringify(prov(basePins())) }, { [recordPathOf('adoption-2')]: w.recordText, 'scratch/lock.json': BASE_LOCK }];
    add('base_lock_unknown', world({ steps }));
  }
  add('record_mismatch', world({ edit: (r) => (r.stale = []) }));
  {
    // the pin was set forward to the NEW text before the adoption: a changed pinned unit that is not stale
    const fwd = { ...basePins(), 'R(1)#(1)(A)': viewSha(NEXT, 'R(1)#(1)(A)') };
    add('unflagged_change', world({ thenProv: prov(fwd) }));
  }
  {
    // a unit pinned today under the same draft pair, which did not pin it when the record was written
    const then = prov({ 'R(1)#(1)(A)': viewSha(BASE, 'R(1)#(1)(A)') });
    add('pin_omitted', world({ thenProv: then, nowProv: { ...clone(then), unit_shas: basePins() } }), world({ thenProv: then }));
  }
  {
    const forward = prov({ ...basePins(), 'R(1)#(1)(A)': viewSha(NEXT, 'R(1)#(1)(A)') });
    const rekey = (worktree) => prov({ ...basePins(), 'R(1)#(1)(A)': viewSha(NEXT, 'R(1)#(1)(A)') }, 2, worktree);
    const afterRecord = fakeWitness([{}, {}, {}]).commits[2]; // the fake history's third commit (B's worktree)
    add('repinned_without_rekey', world({ nowProv: forward }), world({ nowProv: rekey(afterRecord) }));
    f.push({ name: 'bad: repinned_without_rekey (a "new" pair drafted before the adoption)', reason: 'repinned_without_rekey', input: world({ nowProv: rekey(fakeWitness([{}]).commits[0]) }) });
    const removed = prov({ 'R(1)#(1)(B)': viewSha(BASE, 'R(1)#(1)(B)') });
    f.push({ name: 'bad: repinned_without_rekey (pin removed)', reason: 'repinned_without_rekey', input: world({ nowProv: removed }) });
  }
  // non-leaf and #whole pins: a lead-in edit moves every leaf, the clause and the row — counted stale, no false mismatch
  f.push({ name: 'good: non-leaf + #whole pins over a lead-in edit', reason: null, twin_of: null, input: world({ cur: LEAD, thenProv: prov({ 'R(1)#(1)': viewSha(BASE, 'R(1)#(1)'), 'R(1)#whole': viewSha(BASE, 'R(1)#whole') }) }) });
  return f;
}

/** Every reason code: a known-bad that fails for exactly that code + a good twin that passes; plus the not_run states. */
export function selfTest() {
  const results = [];
  const run = (name, fn) => {
    try {
      return fn();
    } catch (err) {
      results.push({ name, expected: 'no throw', twin_of: null, got: [String(err && err.message)], ok: false });
      return null;
    }
  };
  for (const fx of staleFixtures()) {
    const r = run(fx.name, () => checkStaleArm(fx.input));
    if (!r) continue;
    const got = [...new Set(r.violations.map((x) => x.code))];
    const ok = fx.reason === null ? r.status === 'pass' : r.status === 'fail' && got.length === 1 && got[0] === fx.reason;
    results.push({ name: fx.name, expected: fx.reason, twin_of: fx.twin_of || null, got, ok });
  }
  const notRun = {
    'no base adoption': { ...world(), adoptions: ADOPTIONS.slice(0, 1) },
    'no record': { ...world(), record: null },
    'record for another adoption': { ...world(), adoptions: [...ADOPTIONS, { adoption_id: 'adoption-3' }] },
    're-sliced since the record': { ...world(), slice: LEAD },
    'no witness': { ...world(), witness: null },
    'record not committed': { ...world(), witness: fakeWitness([{ [LOCK_REL]: BASE_LOCK }]) },
    'uncommitted edits': { ...world(), recordText: `${world().recordText} ` },
  };
  for (const [name, input] of Object.entries(notRun)) {
    const r = run(name, () => checkStaleArm(input));
    if (r) results.push({ name: `not_run: ${name}`, expected: null, twin_of: null, got: [r.status], ok: r.status === 'not_run' });
  }
  const g = world().record;
  results.push({ name: 'good record: stale = changed exactly', expected: null, twin_of: null, got: g.stale, ok: sameList(g.stale, ['R(1)#(1)(A)']) && g.sc7.equal });
  for (const c of REASON_CODES) if (!results.some((x) => x.expected === c)) results.push({ name: `fixture for ${c}`, expected: c, twin_of: null, got: [], ok: false });
  return { pass: results.every((x) => x.ok), results };
}
