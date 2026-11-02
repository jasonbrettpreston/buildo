// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-440 / M-444 / M-445 / M-446 (McProof, MB-77 b); docs/specs/00-architecture/08_agents.md §11.7
//            M-440 (one config shape, values through `cv`), M-444 (records merge + stage state), M-445 (attempts,
//            fix rounds, parked), M-446 (mandatory stage order gate).
//
// MB-77 (b): the record layer. One example has one field vocabulary
// `{id, layer, increment, question, scenario, inputs, clause_chain[], rulings_cited[], formula_row, branch,
//  is_new, answer}`; its record holds one stage entry per stage. `exampleSha` fingerprints the fields that matter
// (prose excluded) so a stale stage reads `open`. `mergeStageFiles` folds the stage files into records and seeds the
// derived `city` stage from `city-approvals.json` + `sizing.json` (so `stageOrderGate` can read `records[id].city`);
// `settleRecord` rewrites each stage through `stageState`; `overall` is never stored (only `deriveOverall` derives
// it). Attempts, fix rounds and the parked list are the operator queue rules (M-445): a crashed seat run is retried
// up to `max_retries_per_stage`, then parked, never `n/a`.

import { assertSafeKeys, canonicalJson, compareIds, cv, keySha, sha16 } from './config.mjs';

/** The stage files folded into records, in vocabulary order. `city` and `overall` are derived, never a file. */
export const STAGE_FILES = ['question', 'regression', 'blind', 'claude', 'arithmetic'];

/** Derived stages: refused as a file name. `overall` is derived only by `deriveOverall` in approval.mjs. */
const DERIVED_STAGES = new Set(['city', 'overall']);

/**
 * The example fields `exampleSha` hashes: the whole record vocabulary except the prose `id` and the free-text
 * notes (`note`, `why`). `question` and `scenario` are part of the example, so they move the sha.
 */
const HASHED_FIELDS = [
  'layer',
  'question',
  'scenario',
  'inputs',
  'clause_chain',
  'rulings_cited',
  'answer',
  'formula_row',
  'branch',
  'increment',
  'is_new',
];

/** A stage state that reads as settled for the stage order gate (`finished_means` in the config names these). */

/** True when `v` is a plain object (not null, not an array). */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** True when `reason` is a non-empty, non-blank string. */
function hasReason(reason) {
  return typeof reason === 'string' && reason.trim().length > 0;
}

/** True when `n` is a non-negative integer. */
function isCount(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/**
 * `exampleSha(example)` = the sha16 of the canonical form of the example's settled fields: layer, question,
 * scenario, inputs, clause_chain, rulings_cited, answer, formula_row, branch, increment, is_new. Missing fields
 * hash as `null`; the prose fields (`id`, `note`, `why`) never move it, nor does key order within a field.
 */
export function exampleSha(example) {
  const src = isPlainObject(example) ? example : {};
  const picked = Object.create(null);
  for (const f of HASHED_FIELDS) picked[f] = Object.prototype.hasOwnProperty.call(src, f) ? src[f] : null;
  return sha16(canonicalJson(picked));
}

/**
 * `cityState(approvalRow, sizingRow) -> {status, reason}`: derive the `city` stage from one `city-approvals.json`
 * row and one `sizing.json` row. A `quick` sizing row forces `n/a` with reason `sizing rule <rule>`. No approval
 * row -> `open`. Otherwise the row decides: `approved` true -> approved, rule `blocked` with a disagreement in its
 * reason -> differs (reason = that reason), `below_threshold` -> open, anything else -> `n/a` with the row's reason.
 */
export function cityState(approvalRow, sizingRow) {
  const sizing = isPlainObject(sizingRow) ? sizingRow : null;
  if (sizing !== null && sizing.path === 'quick') {
    return { status: 'n/a', reason: `sizing rule ${String(sizing.rule)}` };
  }
  if (!isPlainObject(approvalRow)) return { status: 'open' };
  const row = approvalRow;
  if (row.approved === true) return { status: 'approved' };
  if (row.rule === 'blocked' && hasReason(row.reason) && /disagreement/i.test(row.reason)) {
    return { status: 'differs', reason: row.reason };
  }
  if (row.rule === 'below_threshold') return { status: 'open' };
  const out = { status: 'n/a' };
  if (hasReason(row.reason)) out.reason = row.reason;
  return out;
}

/**
 * `stageState(stage, {example_sha, config, stale?})` -> approved|differs|n/a|errored|parked|open.
 * A stage recording another example, or flagged stale, reads `open`. `n/a` without a reason reads `open`, and so
 * does an `n/a` whose `cites_config` has moved since it recorded `config_key_sha`. An `errored` stage past
 * `max_retries_per_stage` reads `parked` (it blocks approval, never approves).
 */
export function stageState(stage, opts) {
  const { example_sha: exampleShaWant, config, stale } = opts ?? {};
  if (!isPlainObject(stage)) return 'open';
  const st = stage;
  if (stale === true) return 'open';
  if (st.example_sha !== exampleShaWant) return 'open';
  const status = st.status;
  if (status === 'n/a') {
    if (!hasReason(st.reason)) return 'open';
    const cite = st.cites_config;
    if (cite !== undefined && cite !== null) {
      if (typeof cite !== 'string') return 'open';
      if (st.config_key_sha !== keySha(config, cite)) return 'open';
    }
    return 'n/a';
  }
  if (status === 'errored') {
    const attempts = st.attempts;
    // Retries exhausted (`attempts - 1 >= max_retries_per_stage`) -> parked; a missing/invalid count cannot be
    // shown to be exhausted, so the stage blocks as errored rather than being lost.
    if (!isCount(attempts)) return 'errored';
    if (attempts - 1 >= cv(config, 'max_retries_per_stage')) return 'parked';
    return 'errored';
  }
  if (status === 'approved' || status === 'differs') return status;
  if (status === 'parked') return 'parked';
  return 'open';
}

/**
 * `resolveAttempt({attempts, id, classification, stale}, config) -> {status, retry, attempts}`: answered in
 * `classification.answers[id]` wins -> `{status:'answered'}`; a stale attempt resets `attempts` to 1 and is a fresh
 * run (the contract reads an errored stage as parked only once `attempts - 1 >= max_retries_per_stage`, so attempt
 * 1 retries and attempt 2, the last of two retries, parks). A non-integer or negative `attempts` throws
 * `malformed:attempts:<id>`. The returned `attempts` is the count to record for the run.
 */
export function resolveAttempt(input, config) {
  const { attempts, id, classification, stale } = input ?? {};
  if (!isCount(attempts)) throw new Error(`malformed:attempts:${String(id)}`);
  const answers = isPlainObject(classification) ? classification.answers : undefined;
  const answered = isPlainObject(answers) && Object.prototype.hasOwnProperty.call(answers, id) && answers[id] !== undefined;
  if (answered) {
    const recorded = stale === true ? 1 : attempts;
    return { status: 'answered', attempts: recorded };
  }
  const count = stale === true ? 1 : attempts;
  const max = cv(config, 'max_retries_per_stage');
  if (count - 1 >= max) return { status: 'parked', retry: false, attempts: count };
  return { status: 'errored', retry: true, attempts: count };
}

/**
 * `resolveFixRound({fix_rounds}, config) -> {parked}`: parked once `fix_rounds >= max_fix_rounds`. A `fix_rounds`
 * that is not a non-negative integer throws `malformed:fix_rounds`.
 */
export function resolveFixRound(input, config) {
  const rounds = input?.fix_rounds;
  if (!isCount(rounds)) throw new Error('malformed:fix_rounds');
  const max = cv(config, 'max_fix_rounds');
  return { parked: rounds >= max };
}

/** The stage keys of one settled record: the file stages plus the derived `city`. */
const SETTLE_STAGES = [...STAGE_FILES, 'city'];

/** An open stage entry: the shape a seeded (or absent) stage carries. */
function openStage() {
  return { status: 'open', note: '', model: '', attempts: 0, example_sha: '', config_sha: '' };
}

/**
 * `settleRecord(record, {example_sha, config}) -> record`: a NEW record whose every present stage entry (the stage
 * keys question, regression, blind, claude, arithmetic, city) carries `status = stageState(entry, opts)`. A stale
 * stage reads `open`, an `errored` stage with retries exhausted reads `parked`, and an `n/a` without a reason reads
 * `open`. Fields outside the stages are copied unchanged; the input record is never mutated.
 */
export function settleRecord(record, opts) {
  const src = isPlainObject(record) ? record : {};
  const out = Object.create(null);
  for (const key of Object.keys(src)) {
    const entry = src[key];
    if (SETTLE_STAGES.includes(key) && isPlainObject(entry)) {
      out[key] = { ...entry, status: stageState(entry, opts) };
    } else {
      out[key] = entry;
    }
  }
  return out;
}

/** Validate one stage entry of a present file; throws `malformed:<file>:<id>` when it breaks the stage contract. */
function checkStage(stage, file, id) {
  if (!isPlainObject(stage)) throw new Error(`malformed:${file}:${id}`);
  if (typeof stage.status !== 'string' || stage.status.length === 0) throw new Error(`malformed:${file}:${id}`);
  if (!isCount(stage.attempts)) throw new Error(`malformed:${file}:${id}`);
  if (stage.status === 'approved' || stage.status === 'differs') {
    if (typeof stage.model !== 'string' || stage.model.length === 0) throw new Error(`malformed:${file}:${id}`);
  }
  for (const derived of DERIVED_STAGES) {
    if (Object.prototype.hasOwnProperty.call(stage, derived)) throw new Error(`malformed:${file}:${id}`);
  }
}

/**
 * `mergeStageFiles(files, ids, {cityRows, sizingRows, config}) -> {records, missing}`: every id is seeded with all
 * stages `open`; each present file contributes its stages; `city` is seeded from `cityState` over the approval rows
 * and the sizing rows (matched by `id`). `overall` is never written here: it is derived only by `deriveOverall` in
 * approval.mjs. An absent file is named in `missing`; a present file that is not an object
 * (`malformed:<file>:shape`) or `{}` while ids exist (`malformed:<file>:empty`) throws; an id outside `ids` throws
 * `unknown_id:<id>`; `city`/`overall` as a file name throws `derived_stage:<name>`; a forbidden map key
 * (`__proto__`, `constructor`, `prototype`) throws `forbidden_key:<k>`.
 */
export function mergeStageFiles(files, ids, opts) {
  const sources = isPlainObject(files) ? files : {};
  const idList = Array.isArray(ids) ? ids : [];
  const cityRows = Array.isArray(opts?.cityRows) ? opts.cityRows : [];
  const sizingRows = Array.isArray(opts?.sizingRows) ? opts.sizingRows : [];
  const config = opts?.config;
  assertSafeKeys(sources);

  for (const name of Object.keys(sources)) {
    if (DERIVED_STAGES.has(name)) throw new Error(`derived_stage:${name}`);
  }
  assertSafeKeys(sources);
  for (const row of [...cityRows, ...sizingRows]) assertSafeKeys(row);

  const known = new Set(idList.map((id) => String(id)));
  const missing = [];
  const records = Object.create(null);
  for (const id of idList) {
    const record = Object.create(null);
    for (const stage of [...STAGE_FILES, 'city']) record[stage] = openStage();
    records[String(id)] = record;
  }

  for (const file of STAGE_FILES) {
    const present = Object.prototype.hasOwnProperty.call(sources, file);
    if (!present) {
      missing.push(file);
      continue;
    }
    const payload = sources[file];
    if (!isPlainObject(payload)) throw new Error(`malformed:${file}:shape`);
    assertSafeKeys(payload);
    const keys = Object.keys(payload);
    if (keys.length === 0 && idList.length > 0) throw new Error(`malformed:${file}:empty`);
    for (const id of keys) {
      if (!known.has(id)) throw new Error(`unknown_id:${id}`);
    }
    for (const id of keys) {
      const stage = payload[id];
      checkStage(stage, file, id);
      records[id][file] = { ...stage };
    }
  }

  for (const id of idList) {
    const key = String(id);
    const approval = cityRows.find((row) => isPlainObject(row) && row.id === key) ?? null;
    const sizing = sizingRows.find((row) => isPlainObject(row) && row.id === key) ?? null;
    const state = cityState(approval, sizing);
    const city = openStage();
    city.status = state.status;
    if (state.reason !== undefined) city.reason = state.reason;
    records[key]['city'] = city;
  }

  return { records, missing };
}

/**
 * `parkedList(records, config?)` -> the ids whose any stage reads parked after `stageState` normalisation (so a
 * stage recorded `errored` with its retries exhausted counts as parked), sorted by `compareIds`. Each stage is
 * judged against its own recorded `example_sha` and the given `config`.
 */
export function parkedList(records, config) {
  const src = isPlainObject(records) ? records : {};
  const out = [];
  for (const id of Object.keys(src)) {
    const stages = src[id];
    if (!isPlainObject(stages)) continue;
    const parked = Object.values(stages).some((stage) => {
      if (!isPlainObject(stage)) return false;
      const opts = { example_sha: stage.example_sha, config };
      return stageState(stage, opts) === 'parked';
    });
    if (parked) out.push(id);
  }
  return out.sort(compareIds);
}
