'use strict';
// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (logical row), §4 (status sets); operator CHAT-80.QP (option 4), CHAT-77.freeze
// Handbook: Spec 132 §core.9 (R-W: pure, no I/O)
//
// Option 4 lot row: one row per lot, results as positional arrays in scope-seed pair order. This module is the whole encoding:
// result codes (status x value_kind from layer2-map.json), closed dictionaries (unit ids, texts) keyed by hash32 of their content,
// the representative-class arrays plus sparse per-class overrides, and the permitted() words per class.
const crypto = require('node:crypto');

/** First four bytes of sha256 as a signed 32-bit integer. SQL: ('x'||encode(substring(sha256(convert_to(t,'UTF8')) from 1 for 4),'hex'))::bit(32)::int */
function hash32(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest().readInt32BE(0);
}

const codeCache = new WeakMap();
/** Result codes in map order: applies expands by value_kind, the other statuses stand alone. */
function resultCodes(map) {
  let c = codeCache.get(map);
  if (c) return c;
  const out = [];
  for (const s of map.status) {
    if (s === 'applies') for (const k of map.value_kind) out.push(`applies:${k}`);
    else out.push(s);
  }
  c = Object.freeze(out);
  codeCache.set(map, c);
  return c;
}

function codeOf(map, status, valueKind) {
  if (!map.status.includes(status)) throw new Error(`result code: unknown status ${JSON.stringify(status)}`);
  if (status === 'applies') {
    if (!map.value_kind.includes(valueKind)) throw new Error(`result code: unknown value_kind ${JSON.stringify(valueKind)}`);
    return resultCodes(map).indexOf(`applies:${valueKind}`);
  }
  return resultCodes(map).indexOf(status);
}

function splitCode(map, code) {
  const s = resultCodes(map)[code];
  if (s === undefined) throw new Error(`result code: unknown code ${code}`);
  const i = s.indexOf(':');
  return i < 0 ? { status: s, value_kind: null } : { status: s.slice(0, i), value_kind: s.slice(i + 1) };
}

/** The closed dictionaries a batch writes: unit rows and text rows, each keyed by hash32 of its content. A key shared by two contents throws. */
function makeDict() {
  const units = new Map(); // key -> row
  const texts = new Map();
  const usedU = new Set();
  const usedT = new Set();
  return {
    seed(rows) {
      for (const u of rows.units || []) units.set(u.unit_key, { ...u });
      for (const t of rows.texts || []) texts.set(t.text_key, { ...t });
    },
    unitKey(unitId, info) {
      const k = hash32(unitId);
      const have = units.get(k);
      if (have && have.unit_id !== unitId) throw new Error(`dictionary collision: unit key ${k} holds ${have.unit_id}, not ${unitId}`);
      if (!have) {
        if (!info || typeof info.regulation_id !== 'string' || typeof info.layer !== 'string') throw new Error(`dictionary: no unit info for ${unitId}`);
        units.set(k, { unit_key: k, unit_id: unitId, regulation_id: info.regulation_id, layer: info.layer });
      }
      usedU.add(k);
      return k;
    },
    textKey(text) {
      const k = hash32(text);
      const have = texts.get(k);
      if (have && have.text !== text) throw new Error(`dictionary collision: text key ${k} holds ${have.text}, not ${text}`);
      if (!have) texts.set(k, { text_key: k, text });
      usedT.add(k);
      return k;
    },
    beginBatch() {
      usedU.clear();
      usedT.clear();
    },
    view() {
      return { units, texts };
    },
    rows() {
      return {
        units: [...usedU].map((k) => ({ ...units.get(k) })),
        texts: [...usedT].map((k) => ({ ...texts.get(k) })),
      };
    },
  };
}

function makeDecodeDicts(rows) {
  return {
    units: new Map((rows.units || []).map((u) => [u.unit_key, u])),
    texts: new Map((rows.texts || []).map((t) => [t.text_key, t])),
  };
}

const nullIfAllNull = (a) => (a.every((x) => x === null) ? null : a);

function encodeOne(r, map, dict, unitInfo) {
  const code = codeOf(map, r.status, r.value_kind);
  const hasWinner = r.winner_unit_id !== null && r.winner_unit_id !== undefined;
  const ek = r.evidence_kind === null || r.evidence_kind === undefined ? null : map.evidence_kind.indexOf(r.evidence_kind);
  if (ek === -1) throw new Error(`evidence_kind: unknown ${JSON.stringify(r.evidence_kind)}`);
  return [
    code,
    r.value_kind === 'number' ? r.value : null,
    r.reason === null || r.reason === undefined ? null : dict.textKey(r.reason),
    hasWinner ? dict.unitKey(r.winner_unit_id, unitInfo[r.winner_unit_id]) : null,
    ek,
    r.evidence_ref === null || r.evidence_ref === undefined ? null : dict.textKey(r.evidence_ref),
  ];
}

/** byClass: class -> results in pair order (null = same as the representative, i.e. the first class). */
function encodeLotResults({ pairs, classes, byClass, map, dict, unitInfo }) {
  for (const c of classes) if (byClass[c] === undefined) throw new Error(`encodeLotResults: missing class ${c}`);
  const rep = byClass[classes[0]];
  if (!rep || rep.length !== pairs.length) throw new Error(`encodeLotResults: length ${rep ? rep.length : 'null'} != ${pairs.length} pairs`);
  const tuples = rep.map((r) => encodeOne(r, map, dict, unitInfo));
  const cols = [0, 1, 2, 3, 4, 5].map((j) => tuples.map((t) => t[j]));
  const overrides = {};
  for (const c of classes.slice(1)) {
    const rs = byClass[c];
    if (rs === null) continue;
    if (rs.length !== pairs.length) throw new Error(`encodeLotResults: length ${rs.length} != ${pairs.length} pairs for ${c}`);
    const o = {};
    rs.forEach((r, i) => {
      const t = encodeOne(r, map, dict, unitInfo);
      if (JSON.stringify(t) !== JSON.stringify(tuples[i])) o[i] = t;
    });
    if (Object.keys(o).length) overrides[c] = o;
  }
  return {
    codes: cols[0],
    numbers: nullIfAllNull(cols[1]),
    reason_ids: nullIfAllNull(cols[2]),
    winner_ids: nullIfAllNull(cols[3]),
    evidence_kinds: nullIfAllNull(cols[4]),
    evidence_ref_ids: nullIfAllNull(cols[5]),
    class_results: Object.keys(overrides).length ? overrides : null,
  };
}

function lookup(m, key, what) {
  const v = m.get(key);
  if (!v) throw new Error(`dictionary: ${what} key ${key} not found`);
  return v;
}

function decodeTuple(t, map, dicts) {
  const { status, value_kind } = splitCode(map, t[0]);
  const w = t[3] === null ? null : lookup(dicts.units, t[3], 'unit');
  return {
    status,
    reason: t[2] === null ? null : lookup(dicts.texts, t[2], 'text').text,
    value: t[1] === null || t[1] === undefined ? null : Number(t[1]),
    value_kind,
    winner_unit_id: w ? w.unit_id : null,
    winner_layer: w ? w.layer : null,
    evidence_kind: t[4] === null ? null : map.evidence_kind[t[4]],
    evidence_ref: t[5] === null ? null : lookup(dicts.texts, t[5], 'text').text,
  };
}

function decodeLotResults({ lot, pairs, classes, map, dicts }) {
  const n = pairs.length;
  const arr = (a, name) => {
    if (a === null || a === undefined) return new Array(n).fill(null);
    if (a.length !== n) throw new Error(`decodeLotResults: ${name} length ${a.length} != ${n}`);
    return a;
  };
  if (!lot.codes || lot.codes.length !== n) throw new Error(`decodeLotResults: codes length ${lot.codes ? lot.codes.length : 'null'} != ${n}`);
  const cols = [lot.codes, arr(lot.numbers, 'numbers'), arr(lot.reason_ids, 'reason_ids'), arr(lot.winner_ids, 'winner_ids'), arr(lot.evidence_kinds, 'evidence_kinds'), arr(lot.evidence_ref_ids, 'evidence_ref_ids')];
  const repTuples = pairs.map((_, i) => cols.map((c) => c[i]));
  const out = [];
  for (const cls of classes) {
    const ov = (lot.class_results && lot.class_results[cls]) || {};
    pairs.forEach((p, i) => out.push({ class: cls, structure: p.structure, target: p.target, ...decodeTuple(ov[i] || repTuples[i], map, dicts) }));
  }
  return out;
}

function encodePermitted({ classes, words, map, dict }) {
  const keys = Object.keys(map.permission_image);
  const permitted = [];
  const ids = [];
  for (const c of classes) {
    const w = words[c];
    const code = keys.indexOf(w && w.status);
    if (code < 0) throw new Error(`permission_image: unknown status ${JSON.stringify(w && w.status)}`);
    permitted.push(code);
    const text = w.status === 'prohibited' ? w.clause : w.status === 'not_evaluated' ? w.reason : null;
    ids.push(text === null || text === undefined ? null : dict.textKey(text));
  }
  return { permitted, permitted_text_ids: nullIfAllNull(ids) };
}

function decodePermitted({ lot, classes, map, dicts }) {
  const keys = Object.keys(map.permission_image);
  const out = {};
  classes.forEach((c, i) => {
    const status = keys[lot.permitted[i]];
    if (!status) throw new Error(`permission_image: unknown code ${lot.permitted[i]}`);
    const id = lot.permitted_text_ids ? lot.permitted_text_ids[i] : null;
    const w = { status };
    if (id !== null && id !== undefined) w[status === 'prohibited' ? 'clause' : 'reason'] = lookup(dicts.texts, id, 'text').text;
    out[c] = w;
  });
  return out;
}

module.exports = { hash32, resultCodes, codeOf, splitCode, makeDict, makeDecodeDicts, encodeLotResults, decodeLotResults, encodePermitted, decodePermitted };
