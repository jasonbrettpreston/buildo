// SPEC LINK: .cursor/mcbylaw/phase2-plan-v2.md §K.2 k3_b (full re-resolve time), D3 (resolve rows per lot);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.6 (the evaluator), §10 (determinism);
//            docs/specs/01-pipeline/124_step_standard_policy.md R-DET
//
// Producer-side evaluation of many lots: loadCandidates + effective() per target per lot, through the cell cache
// (cell-cache.mjs), optionally across worker threads. The evaluator is untouched. Deterministic: lots are partitioned
// by a fixed order (zone, exception, id) into contiguous chunks, each worker owns its own cache, and the results are
// returned sorted by lot id, so the output is byte-identical for any worker count (locked by
// src/tests/bylaw-cell-cache.logic.test.ts). No clock, no randomness; timing belongs to the caller.
//
//   workerCount(cores)                                → min(cores − 2, 8), at least 1 (workers: 0 = this thread)
//   evaluateLots({ lots: [{id, lot}], units, ctxInput: {vocab, extra}, targets, workers, cache?, evaluatorPath?, digest?, onStats? })
//     → [{ id, doc }] ascending id; doc = stable JSON {id, cands, log, depth, res}; digest: true → [{ id, sha256(doc) }]
//       (a full population's docs do not fit in memory: ~150 KB per lot with traces)

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { makeCellCache } from './cell-cache.mjs';

const DEFAULT_EVALUATOR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evaluate.mjs');
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const stableJson = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort(cmpStr).map((y) => [y, x[y]])) : x));

export class EvalParallelError extends Error {}

/** Worker threads for `cores` logical CPUs (the caller reads the host; this module never does — R-DET grep lock): two left for the system, at most 8, at least 1. */
export function workerCount(cores) {
  if (!Number.isInteger(cores) || cores < 1) throw new EvalParallelError(`cores_invalid: ${cores}`);
  return Math.max(1, Math.min(cores - 2, 8));
}

/** The fixed processing order: zone, exception, id (lots sharing a candidate set are adjacent — cache locality). */
const orderKey = (x) => `${x.lot.zone ?? ''}\u0000${x.lot.exception ?? ''}`;
export function partition(lots, n) {
  const sorted = [...lots].sort((a, b) => cmpStr(orderKey(a), orderKey(b)) || a.id - b.id);
  const size = Math.ceil(sorted.length / Math.max(1, n));
  const chunks = [];
  for (let i = 0; i < sorted.length; i += size) chunks.push(sorted.slice(i, i + size));
  return chunks;
}

/** One chunk in this thread. PURE given its inputs (the evaluator module is loaded by path). */
export async function evaluateChunk({ lots, units, ctxInput, targets, cache = true, evaluatorPath = DEFAULT_EVALUATOR, digest = false }) {
  const E = await import(pathToFileURL(evaluatorPath).href);
  const ctx = E.makeContext(ctxInput.vocab, ctxInput.extra || {});
  const cc = cache ? makeCellCache({ evaluator: E, ctx }) : null;
  const out = [];
  for (const { id, lot } of lots) {
    const L = E.loadCandidates(lot, units);
    const res = {};
    for (const t of targets) res[t] = cc ? cc.effective(lot, t, L.candidates) : E.effective(lot, t, L.candidates, ctx);
    const doc = stableJson({ id, cands: L.candidates.map((u) => u.unit_id), log: L.log, depth: L.include_depth, res });
    out.push(digest ? { id, sha256: crypto.createHash('sha256').update(doc).digest('hex') } : { id, doc });
  }
  return { results: out, stats: cc ? cc.stats() : null };
}

function runWorker(data) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { evalParallel: true, ...data } });
    w.once('message', resolve);
    w.once('error', reject);
    w.once('exit', (code) => { if (code !== 0) reject(new EvalParallelError(`worker exited with code ${code}`)); });
  });
}

export async function evaluateLots({ lots, units, ctxInput, targets, workers = 0, cache = true, evaluatorPath = DEFAULT_EVALUATOR, digest = false, onStats = null }) {
  const ids = new Set(lots.map((x) => x.id));
  if (ids.size !== lots.length) throw new EvalParallelError('duplicate_lot_id: every lot needs a distinct id');
  const base = { units, ctxInput, targets, cache, evaluatorPath, digest };
  const parts = workers > 0 ? await Promise.all(partition(lots, workers).map((chunk) => runWorker({ ...base, lots: chunk })))
    : [await evaluateChunk({ ...base, lots: partition(lots, 1)[0] || [] })];
  if (onStats) onStats(parts.map((p) => p.stats));
  return parts.flatMap((p) => p.results).sort((a, b) => a.id - b.id);
}

if (!isMainThread && workerData && workerData.evalParallel) {
  const { evalParallel, ...data } = workerData; // evalParallel is the worker marker only
  parentPort.postMessage(await evaluateChunk(data));
}
