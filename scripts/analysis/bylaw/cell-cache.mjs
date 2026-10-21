// SPEC LINK: .cursor/mcbylaw/phase2-plan-v2.md §A L14 (cell key: dependencies = static closure ∪ the hardened
//            inputs[] — R-DEP; RT-A25), D3 (rows = distinct cell_id × targets); docs/specs/01-pipeline/
//            68_mcbylaw_standard.md §7.6 (the evaluator, inputs[]), §10 (determinism)
//
// The per-target cell cache: effective() once per (candidate set, target, the values of the lot inputs the result
// read). A later lot that agrees on every input an earlier evaluation of the same (candidate set, target) read is
// served that result: the evaluator is deterministic and its result records every lot input it read (inputs[],
// hardened M-60(d); bylaw-harden lock 4), so the evaluation would read the same values, take the same path and return
// the same bytes. Locked both ways by src/tests/bylaw-cell-cache.logic.test.ts (transparency + a mutation test).
//
// Pure: no clock, no randomness, no I/O. One cache per evaluation context (ctx is fixed for the cache's life). Served
// results are shared objects: callers read them, never mutate them. Bounded: past `maxEntries` cells the cache is
// cleared (outputs never depend on what the cache holds).
//
//   makeCellCache({ evaluator, ctx, keyInputs?, maxEntries? }) → { effective(lot, target, candidates), stats() }
//   inputValue(lot, path) → the key token of one inputs[] path (null for a derived target.* entry)

export class CellCacheError extends Error {}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const stableJson = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort(cmpStr).map((y) => [y, x[y]])) : x));
/** undefined and every JSON value get distinct tokens (null ≠ absent, 1 ≠ "1"). */
const tok = (v) => (v === undefined ? 'U' : `J${stableJson(v)}`);
/** A value inside a lot sub-object: the container being absent is its own token (map_area_not_held ≠ map_value_absent). */
const inside = (obj, key) => (obj === undefined || obj === null ? `NC${obj === null ? 'n' : 'u'}` : tok(obj[key]));
const WHOLE = new Set(['zone', 'building_type', 'exception', 'label', 'map_areas', 'address', 'parcel_id', 'primary_frontage_street_name']);
const NESTED = new Map([['label.', 'label'], ['overlays.', 'overlays'], ['vars.', 'vars'], ['flags.', 'flags'], ['existing.', 'existing']]);

/** The key token of one inputs[] path on a lot; null for `target.<name>` (derived: its own lot inputs are listed too). */
export function inputValue(lot, p) {
  if (WHOLE.has(p)) return tok(lot[p]);
  if (p.startsWith('target.')) return null;
  for (const [prefix, field] of NESTED) if (p.startsWith(prefix)) return inside(lot[field], p.slice(prefix.length));
  throw new CellCacheError(`input_path_unkeyable: ${p} (the cell key cannot value it; refusing to cache)`);
}

export function makeCellCache({ evaluator, ctx, keyInputs = (inputs) => inputs, maxEntries = 20000 }) {
  if (!evaluator || typeof evaluator.effective !== 'function') throw new CellCacheError('evaluator_missing: pass the evaluate.mjs module');
  // candidate-set id: the unit-object sequence (a per-object counter), interned to a small integer
  const unitKey = new WeakMap(); let nextUnit = 0;
  const setIds = new Map(); const arraySet = new WeakMap();
  const setIdOf = (cands) => {
    const hit = arraySet.get(cands); // reused only while the array still holds the same unit objects in the same order
    if (hit && hit.snap.length === cands.length && hit.snap.every((u, i) => u === cands[i])) return hit.id;
    const k = cands.map((u) => { if (!unitKey.has(u)) unitKey.set(u, nextUnit++); return unitKey.get(u); }).join(',');
    if (!setIds.has(k)) setIds.set(k, setIds.size);
    const id = setIds.get(k);
    arraySet.set(cands, { snap: [...cands], id });
    return id;
  };
  let cells = new Map(); // `${setId}\0${target}` → [{ inputs, byValues: Map(valuesKey → result) }]
  let entries = 0; let hits = 0; let misses = 0; let clears = 0;
  const valuesKey = (lot, inputs) => inputs.map((p) => inputValue(lot, p)).join('\u0001');

  function effective(lot, target, candidates) {
    if (!Array.isArray(candidates)) return evaluator.effective(lot, target, candidates, ctx);
    const ck = `${setIdOf(candidates)}\u0000${target}`;
    const groups = cells.get(ck) || [];
    for (const g of groups) {
      const r = g.byValues.get(valuesKey(lot, g.inputs));
      if (r) { hits++; return r; }
    }
    misses++;
    const r = evaluator.effective(lot, target, candidates, ctx);
    const inputs = [...keyInputs(r.inputs || [])].filter((p) => !p.startsWith('target.')).sort(cmpStr);
    const sig = inputs.join('\u0001');
    let g = groups.find((x) => x.sig === sig);
    if (!g) {
      if (entries >= maxEntries) { cells = new Map(); entries = 0; clears++; }
      g = { sig, inputs, byValues: new Map() };
      if (!cells.has(ck)) cells.set(ck, []);
      cells.get(ck).push(g);
    }
    const vk = valuesKey(lot, inputs);
    if (!g.byValues.has(vk)) { g.byValues.set(vk, r); entries++; }
    return r;
  }
  return { effective, stats: () => ({ hits, misses, entries, clears, candidate_sets: setIds.size }) };
}
