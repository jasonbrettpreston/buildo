#!/usr/bin/env node
// SPEC LINK: .cursor/mcbylaw/phase2-plan-v2.md §V ("one runner, one record"; V-2 oracles A–E; V-4 pre-registration and
//            ancestry, implemented here because G-AUDIT is unbuilt — MX-V4), §K.2 K7-R (a)–(d), §K.3, §K.4 (double check);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §9 (G-AUDIT ancestry pattern), §10 (determinism rules);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (wave 1), M-60 (evaluator NOT_EVALUATED_CODES)
//
// The McBylaw Phase 2 validation round runner (E-6 / P2-0a). Deterministic (no clock, no randomness; the record has no
// timestamp — it carries git HEAD and content pins instead). Read-only on the DB: one server-enforced READ ONLY
// transaction, rolled back. Writes one file only, in real mode: scripts/seeds/bylaw/validation/rounds/<n>.json, never
// overwritten (a re-run is a new round id).
//
//   node scripts/analysis/bylaw/validate-round.mjs --round=<n> --dry-run   build the record, print it, write nothing
//   node scripts/analysis/bylaw/validate-round.mjs --round=<n>             build + write rounds/<n>.json (prereg must be committed)
//     [--db] [--measurements <file>] [--oracle-c <file>] [--second-seat <record>] [--heldout-reveal] [--out <file>]
//   node scripts/analysis/bylaw/validate-round.mjs commit-heldout --round=<n>   operator only: salt from env
//     MCBYLAW_HELDOUT_SALT (never written); draws per stratum read-only and writes ONLY heldout.commitment_sha256 +
//     heldout.draw into prereg-<n>.json (--heldout-reveal re-draws with the same env salt and verifies)
//   node scripts/analysis/bylaw/validate-round.mjs --self-test             pure fixtures, both directions
//   node scripts/analysis/bylaw/validate-round.mjs --check-stale           every committed record vs the current pins
//
// Round verdict (closed): pass · fail · not_run. Any element or oracle `fail` ⇒ fail; every one `pass` ⇒ pass; else
// not_run. An element not run is never a PASS, and every `not_run` carries a closed reason (round-record.schema.json).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gitBlobOid, gitWitness, lf } from './git-witness.mjs';
import { NOT_EVALUATED_CODES, reasonCode } from './evaluate.mjs';

const require = createRequire(import.meta.url);

export const VALIDATE_ROUND_VERSION = 'validate-round-v1';
export const VERDICTS = Object.freeze(['pass', 'fail', 'not_run']);
export const K7R_CLASSES = Object.freeze(['i', 'ii', 'i_if_planned', 'not_unavailable']);
export const PIN_KEYS = Object.freeze(['table_version', 'evaluator_version', 'vocab_version', 'oracle_b_sha', 'prereg_sha', 'class_catalogue_sha', 'w1_shards_sha']);
export const ORACLE_B_BANNED = Object.freeze([/(^|\/)evaluate\.mjs$/, /(^|\/)dsl\.mjs$/, /(^|\/)authored\.mjs$/, /(^|\/)resolve-bylaws(\.js)?$/]);
export const ORACLE_B_EXEMPT = Object.freeze(['compare.mjs']); // the A/B comparator: it may load A (plan §V-2)

const VAL_REL = 'scripts/seeds/bylaw/validation';
const PROVISIONS_REL = 'docs/reference/bylaw-provisions.json';
const VOCAB_REL = 'scripts/seeds/bylaw/vocab.json';
const EVALUATOR_RELS = ['scripts/analysis/bylaw/evaluate.mjs', 'scripts/analysis/bylaw/dsl.mjs'];
const ORACLE_B_REL = 'scripts/analysis/bylaw/oracle-b';
const CLASS_CATALOGUE_REL = 'scripts/seeds/bylaw/scenario-classes.json'; // §S / D8, PLANNED (Q12)
const W1_SHARDS_REL = 'scripts/seeds/bylaw/w1-shards.json'; // generated W1 shard plan (keying-cli.mjs plan --batch W1); Q1
const REGRESSION_POOL_REL = `${VAL_REL}/regression-pool.json`;
const SCHEMA_FILES = Object.freeze({ prereg: 'prereg.schema.json', record: 'round-record.schema.json' });

export class ValidateRoundError extends Error {}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (x) => crypto.createHash('sha256').update(x).digest('hex');
const readLf = (root, rel) => lf(fs.readFileSync(path.join(root, rel), 'utf8'));
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort(cmpStr).map((y) => [y, x[y]])) : x));
const notRun = (reason, extra = {}) => ({ verdict: 'not_run', reason, ...extra });

// ---------------------------------------------------------------- schemas
const compiled = new Map();
/** AJV violations of `doc` against the committed schema `kind` (prereg | record): [] when valid. */
export function schemaViolations(root, kind, doc) {
  const file = SCHEMA_FILES[kind];
  if (!file) throw new ValidateRoundError(`unknown_schema_kind: ${kind}`);
  const key = `${root}|${kind}`;
  if (!compiled.has(key)) {
    const AjvMod = require('ajv');
    const Ajv = AjvMod.default || AjvMod;
    const ajv = new Ajv({ allErrors: true, strict: false });
    compiled.set(key, ajv.compile(JSON.parse(readLf(root, `${VAL_REL}/${file}`))));
  }
  const validate = compiled.get(key);
  return validate(doc) ? [] : validate.errors.map((e) => `${kind}_schema: ${e.instancePath || '/'} ${e.message}`).sort(cmpStr);
}

// ---------------------------------------------------------------- K7-R (a): the class map
/** Totality of the k7r class map over codes ∪ lot gates ∪ declared extras, both directions, closed classes. PURE. */
export function checkClassMap({ classMap, codes, lotGates, extra = [] }) {
  const domain = new Set([...codes, ...lotGates, ...extra]);
  const keys = Object.keys(classMap || {});
  const violations = [];
  for (const k of [...domain].sort(cmpStr)) if (!(k in (classMap || {}))) violations.push(`k7r_map_missing: ${k}`);
  for (const k of keys.sort(cmpStr)) {
    if (!domain.has(k)) violations.push(`k7r_map_unknown_key: ${k}`);
    if (!K7R_CLASSES.includes(classMap[k])) violations.push(`k7r_map_bad_class: ${k} -> ${classMap[k]}`);
  }
  return { pass: violations.length === 0, violations, checked: domain.size };
}

/** The map key of one K7-R item: its lot gate when one fired (X-14), else the reason's code; null = has a value. */
export function itemKey(item) {
  if (item.lot_gate && item.lot_gate !== 'none') return item.lot_gate;
  if (item.reason === null || item.reason === undefined) return null;
  const r = String(item.reason);
  return r.startsWith('not_modelled:') ? r : reasonCode(r);
}

/**
 * K7-R (b)/(d): split the keyed-scope items into class (i) / (ii), item- and lot-weighted, and apply the kill.
 * items = [{reason|null, lot_gate, lots, zone, target, exception, keyed_scope}]; plannedExceptions = the W1 shard
 * plan's member regulation ids (plannedExceptionsFrom). PURE.
 */
export function k7rSplit({ items, classMap, plannedExceptions = [], kill }) {
  const planned = new Set(plannedExceptions);
  const unmapped = new Set();
  const acc = { item: { total: 0, i: 0, ii: 0 }, lot: { total: 0, i: 0, ii: 0 } };
  const orig = { total: 0, unavailable: 0 };
  for (const it of items) {
    const key = itemKey(it);
    let cls = key === null ? 'not_unavailable' : classMap[key];
    if (cls === undefined) {
      unmapped.add(key);
      continue;
    }
    if (cls === 'i_if_planned') cls = it.exception && planned.has(it.exception) ? 'i' : 'ii';
    orig.total++;
    if (cls !== 'not_unavailable') orig.unavailable++;
    if (!it.keyed_scope) continue;
    const lots = Number(it.lots) || 0;
    acc.item.total++;
    acc.lot.total += lots;
    if (cls === 'i' || cls === 'ii') {
      acc.item[cls]++;
      acc.lot[cls] += lots;
    }
  }
  const share = (n, d) => (d > 0 ? n / d : 0);
  for (const w of ['item', 'lot']) {
    acc[w].share_i = share(acc[w].i, acc[w].total);
    acc[w].share_ii = share(acc[w].ii, acc[w].total);
    acc[w].share_i_plus_ii = share(acc[w].i + acc[w].ii, acc[w].total);
  }
  const fired = [];
  if (acc.item.share_ii > kill.ii_item_max) fired.push('ii_item');
  if (acc.lot.share_ii > kill.ii_lot_max) fired.push('ii_lot');
  for (const w of kill.i_plus_ii_weights || ['item', 'lot']) if (acc[w].share_i_plus_ii > kill.i_plus_ii_max) fired.push(`i_plus_ii_${w}`);
  const original_k7 = { ...orig, share: share(orig.unavailable, orig.total), threshold: kill.original_k7.threshold, exceeded: share(orig.unavailable, orig.total) > kill.original_k7.threshold, label: 'disclosure only (K.2 d)' };
  const um = [...unmapped].sort(cmpStr);
  let verdict = 'pass';
  if (um.length || fired.length) verdict = 'fail';
  else if (acc.item.total === 0) verdict = 'not_run';
  return { verdict, item: acc.item, lot: acc.lot, kill: { fired, post_hoc: kill.post_hoc === true }, original_k7, unmapped: um };
}

// ---------------------------------------------------------------- Q1: planned keying from the W1 shard plan
/** The planned exceptions of the generated W1 shard plan: sorted members[].regulation_id. Throws on another shape. PURE. */
export function plannedExceptionsFrom(w1) {
  if (!w1 || !Array.isArray(w1.members) || !w1.members.every((m) => m && typeof m.regulation_id === 'string')) throw new ValidateRoundError('w1_shards_invalid: no members[].regulation_id');
  return [...new Set(w1.members.map((m) => m.regulation_id))].sort(cmpStr);
}
/** 'bound' only when prereg's pinned blob sha equals the current file's; a null placeholder or absent file is stale. PURE. */
export function plannedKeyingBinding(source, currentSha) {
  return source && source.blob_sha && currentSha && source.blob_sha === currentSha ? 'bound' : 'stale_pin';
}

// ---------------------------------------------------------------- K7-R (c): the probe
/** Seeded, deterministic sample of `n` ranks from from..to: sha256('<seed>:<rank>') ascending, then numeric. PURE. */
export function probeRanks({ seed, from, to, n }) {
  const all = [];
  for (let r = from; r <= to; r++) all.push({ r, h: sha256(`${seed}:${r}`) });
  return all.sort((a, b) => cmpStr(a.h, b.h) || a.r - b.r).slice(0, n).map((x) => x.r).sort((a, b) => a - b);
}

// ---------------------------------------------------------------- verdicts
/** Closed round verdict over elements + oracles. PURE. */
export function roundVerdict(list) {
  if (!list.length) return 'not_run';
  if (list.some((x) => x.verdict === 'fail')) return 'fail';
  return list.every((x) => x.verdict === 'pass') ? 'pass' : 'not_run';
}

// ---------------------------------------------------------------- oracle B independence
const SPEC_RES = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /^\s*import\s*['"]([^'"]+)['"]/gm];
/** Static import scan: no banned module, and no relative import leaving oracle-b/. files = [{path, text}]. PURE. */
export function importScan(files, { exempt = ORACLE_B_EXEMPT } = {}) {
  const violations = [];
  let checked = 0;
  for (const f of [...files].sort((a, b) => cmpStr(a.path, b.path))) {
    if (exempt.includes(path.posix.basename(f.path))) continue;
    checked++;
    const specs = new Set();
    for (const re of SPEC_RES) for (const m of f.text.matchAll(re)) specs.add(m[1]);
    for (const s of [...specs].sort(cmpStr)) {
      if (ORACLE_B_BANNED.some((re) => re.test(s))) violations.push(`oracle_b_banned_import: ${f.path} -> ${s}`);
      else if (s.startsWith('.') && path.posix.normalize(path.posix.join(path.posix.dirname(f.path), s)).split('/')[0] !== f.path.split('/')[0]) violations.push(`oracle_b_external_import: ${f.path} -> ${s}`);
    }
  }
  return { pass: violations.length === 0, violations, checked };
}

const walk = (root, rel) => fs.readdirSync(path.join(root, rel), { withFileTypes: true }).sort((a, b) => cmpStr(a.name, b.name))
  .flatMap((d) => (d.isDirectory() ? walk(root, `${rel}/${d.name}`) : [`${rel}/${d.name}`]));

/** The live oracle-b/ tree under importScan (paths relative to oracle-b's parent, so 'oracle-b/x.mjs'). */
export function oracleBIndependence(root) {
  const base = path.posix.dirname(ORACLE_B_REL);
  const files = walk(root, ORACLE_B_REL).filter((p) => /\.(mjs|js|cjs)$/.test(p)).map((p) => ({ path: p.slice(base.length + 1), text: readLf(root, p) }));
  return importScan(files);
}

// ---------------------------------------------------------------- oracles C, D
/** Oracle D: unavailable (operator 2026-10-14); always not_run:oracle_unavailable, disclosed. PURE. */
export function oracleD(prereg) {
  const d = prereg.oracles.D;
  return d.available ? notRun('input_absent') : { verdict: 'not_run', reason: 'oracle_unavailable', basis: d.basis };
}

/** Oracle C slot (lane I's oracle-c-round-v1 record). input = {path, sha256, doc} | null. Report-only in Phase 2. PURE. */
export function oracleC(input, pins, prereg) {
  if (!input) return notRun('input_absent');
  const d = input.doc || {};
  const ba = d.summary && d.summary.by_answer;
  const ok = d.schema === 'oracle-c-round-v1' && typeof d.oracle_c_version === 'string' && d.inputs && d.inputs.provisions && typeof d.inputs.provisions.sha256 === 'string'
    && ba && ['match', 'mismatch', 'not_comparable'].every((k) => Number.isInteger(ba[k])) && Number.isInteger(d.summary.n);
  if (!ok) return notRun('input_schema_mismatch', { source: { path: input.path, sha256: input.sha256 } });
  const source = { path: input.path, sha256: input.sha256, oracle_c_version: d.oracle_c_version, table_sha256: d.inputs.provisions.sha256 };
  if (d.inputs.provisions.sha256 !== pins.table_sha256) return notRun('table_mismatch', { source });
  const counts = { n: d.summary.n, match: ba.match, mismatch: ba.mismatch, not_comparable: ba.not_comparable };
  return notRun('no_preregistered_threshold', { label: 'report-only in Phase 2 (P2-12, Q8)', source, counts });
}

// ---------------------------------------------------------------- staleness + double check
/** Pins that differ between a record and the current tree. PURE. */
export function stalePins(recorded, current) {
  return PIN_KEYS.filter((k) => (recorded[k] ?? null) !== (current[k] ?? null));
}

function flatten(prefix, v, out) {
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v).sort(cmpStr)) flatten(`${prefix}.${k}`, v[k], out);
  else out.set(prefix, stable(v));
  return out;
}
/** The deterministic numbers of a record (K.4): pins, DB counts, element and oracle counts. PURE. */
export function deterministicNumbers(rec) {
  const out = new Map();
  flatten('pins', rec.pins || {}, out);
  flatten('db.counts', (rec.db && rec.db.counts) || {}, out);
  for (const e of rec.elements || []) if (e.counts !== undefined) flatten(`elements[${e.id}].counts`, e.counts, out);
  for (const [k, o] of Object.entries(rec.oracles || {}).sort(([a], [b]) => cmpStr(a, b))) if (o.counts !== undefined) flatten(`oracles.${k}.counts`, o.counts, out);
  return out;
}
/** K.4: a second seat's record against this one; any difference > 0 fails. PURE. */
export function doubleCheck(rec, second) {
  if (!second) return { id: 'double_check', verdict: 'not_run', reason: 'second_seat_absent' };
  const a = deterministicNumbers(rec);
  const b = deterministicNumbers(second);
  const diffs = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort(cmpStr);
  return { id: 'double_check', verdict: diffs.length ? 'fail' : 'pass', diffs };
}

// ---------------------------------------------------------------- pins (read-only file reads + git)
function gitHead(root) {
  try {
    const h = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 }).trim();
    return /^[0-9a-f]{40}$/.test(h) ? h : null;
  } catch {
    return null; // no git answer = null pin (fail-closed: prereg_status then reads missing)
  }
}
const oidOf = (root, rel) => (fs.existsSync(path.join(root, rel)) ? gitBlobOid(Buffer.from(readLf(root, rel), 'utf8')) : null);

/** Every pin of §V's record, from the working tree. */
export function currentPins(root, round) {
  const provText = readLf(root, PROVISIONS_REL);
  const prov = JSON.parse(provText);
  const table_sha256 = sha256(provText);
  const adoption_id = String(prov.validated_against && prov.validated_against.adoption_id);
  const oracleB = walk(root, ORACLE_B_REL).map((p) => `${p}\0${gitBlobOid(Buffer.from(readLf(root, p), 'utf8'))}\n`).join('');
  const prereg_path = `${VAL_REL}/prereg-${round}.json`;
  return {
    table_version: `${adoption_id}:${table_sha256}`,
    adoption_id,
    table_sha256,
    evaluator_version: sha256(EVALUATOR_RELS.map((r) => readLf(root, r)).join('\0')),
    vocab_version: String(JSON.parse(readLf(root, VOCAB_REL)).version),
    oracle_b_sha: sha256(oracleB),
    prereg_path,
    prereg_sha: oidOf(root, prereg_path),
    class_catalogue_sha: oidOf(root, CLASS_CATALOGUE_REL),
    w1_shards_sha: oidOf(root, W1_SHARDS_REL),
  };
}

/** prereg_status ∈ {committed, missing, mismatched}: HEAD's blob of the prereg path vs the working tree's (V-4). */
export function preregStatus(root, pins, head, witness = gitWitness(root)) {
  if (!pins.prereg_sha || !head) return 'missing';
  const atHead = witness.blobAt(head, pins.prereg_path);
  if (!atHead) return 'missing';
  return atHead === pins.prereg_sha ? 'committed' : 'mismatched';
}


// ---------------------------------------------------------------- DB (read-only)
/** Run fn(client) inside ONE server-enforced READ ONLY transaction through the resolved pool; always rolled back. */
async function withReadOnly(label, fn) {
  const { createResolvedPool } = require('../../lib/resolve-db.js');
  const pool = createResolvedPool({ label, poolOverrides: { max: 1 } });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    const ro = await client.query('SHOW transaction_read_only');
    if (ro.rows[0].transaction_read_only !== 'on') throw new ValidateRoundError('db_not_read_only: the session did not report transaction_read_only = on');
    return await fn(client);
  } finally {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
    await pool.end();
  }
}

async function readDbCounts(root) {
  const zones = JSON.parse(readLf(root, VOCAB_REL)).zone;
  return withReadOnly('bylaw-validate-round', async (client) => {
    const db = await client.query('SELECT current_database() AS database, (SELECT count(*) FROM parcels)::bigint AS parcels');
    const rz = await client.query('SELECT zoning_class AS zone, count(*)::bigint AS n FROM parcels WHERE zoning_class = ANY ($1::text[]) GROUP BY zoning_class ORDER BY zoning_class', [zones]);
    const counts = { parcels: Number(db.rows[0].parcels), residential_parcels: rz.rows.reduce((s, r) => s + Number(r.n), 0) };
    for (const r of rz.rows) counts[`residential_parcels:${r.zone}`] = Number(r.n);
    return { status: 'read', database: db.rows[0].database, transaction_read_only: true, counts };
  });
}

/** The held-out population: residential parcels (vocab.json zone), stratum = zoning_class. Read-only. */
async function readHeldoutPopulation(root) {
  const zones = JSON.parse(readLf(root, VOCAB_REL)).zone;
  return withReadOnly('bylaw-validate-round-heldout', async (client) => {
    const db = await client.query('SELECT current_database() AS database');
    const r = await client.query('SELECT parcel_id::text AS parcel_id, zoning_class AS stratum FROM parcels WHERE zoning_class = ANY ($1::text[])', [zones]);
    return { database: db.rows[0].database, rows: r.rows };
  });
}

// ---------------------------------------------------------------- Q4: the held-out set (V-4)
export const HELDOUT_SALT_ENV = 'MCBYLAW_HELDOUT_SALT';
const HELDOUT_SALT_MIN = 32;
const HELDOUT_ORDER = 'sha256(salt:parcel_id) ascending, n_per_stratum lowest per stratum, exhaustive when the stratum is smaller';

/** The salt, ONLY from the environment; refused when absent or shorter than 32 characters. Never written. PURE. */
export function heldoutSaltFromEnv(env) {
  const s = env[HELDOUT_SALT_ENV];
  if (typeof s !== 'string' || s.length < HELDOUT_SALT_MIN) throw new ValidateRoundError(`heldout_salt_absent: set ${HELDOUT_SALT_ENV} (>= ${HELDOUT_SALT_MIN} characters) in the environment; it is never read from a file or written anywhere`);
  return s;
}

/** Deterministic per-stratum draw. rows = [{parcel_id, stratum}]. Returns {ids (sorted), per_stratum, population_sha256}. PURE. */
export function drawHeldout({ rows, salt, nPerStratum }) {
  const by = new Map();
  for (const r of rows) {
    const k = String(r.stratum);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(String(r.parcel_id));
  }
  const ids = [];
  const per_stratum = {};
  const pop = [];
  for (const k of [...by.keys()].sort(cmpStr)) {
    const all = [...new Set(by.get(k))].sort(cmpStr);
    for (const id of all) pop.push(`${k}\0${id}\n`);
    const ranked = all.map((id) => ({ id, h: sha256(`${salt}:${id}`) })).sort((a, b) => cmpStr(a.h, b.h) || cmpStr(a.id, b.id));
    const take = ranked.slice(0, nPerStratum).map((x) => x.id);
    ids.push(...take);
    per_stratum[k] = { population: all.length, drawn: take.length };
  }
  return { ids: ids.sort(cmpStr), per_stratum, population_sha256: sha256(pop.join('')) };
}

/** sha256(sorted ids joined by LF ‖ LF ‖ salt) (V-4). PURE. */
export function heldoutCommitment(ids, salt) {
  return sha256(`${[...ids].map(String).sort(cmpStr).join('\n')}\n${salt}`);
}

/** The draw parameters written into the prereg (never the ids, never the salt). PURE. */
export function drawParams(draw, { database, nPerStratum }) {
  return { database, strata: 'zoning_class in vocab.json zone', n_per_stratum: nPerStratum, order: HELDOUT_ORDER, per_stratum: draw.per_stratum, population_sha256: draw.population_sha256, validate_round_version: VALIDATE_ROUND_VERSION };
}

/** The prereg text with ONLY heldout.commitment_sha256 + heldout.draw replaced; canonical JSON (2-space, LF). PURE. */
export function applyHeldout(text, { commitment_sha256, draw }) {
  const d = JSON.parse(lf(text));
  d.heldout = { ...d.heldout, commitment_sha256, draw };
  return `${JSON.stringify(d, null, 2)}\n`;
}

/** heldout_status ∈ {verified, mismatch, reused}. PURE. */
export function heldoutStatus({ commitment, ids, salt, pool }) {
  if (heldoutCommitment(ids, salt) !== commitment) return 'mismatch';
  return ids.some((x) => pool.has(String(x))) ? 'reused' : 'verified';
}

function regressionPool(root) {
  return fs.existsSync(path.join(root, REGRESSION_POOL_REL)) ? new Set((JSON.parse(readLf(root, REGRESSION_POOL_REL)).ids || []).map(String)) : new Set();
}

/** commit-heldout: draw from the live DB (read-only) with the env salt and write the commitment into prereg-<round>. */
export async function commitHeldout({ root, round, env, populationReader = readHeldoutPopulation }) {
  const salt = heldoutSaltFromEnv(env);
  const rel = `${VAL_REL}/prereg-${round}.json`;
  const text = readLf(root, rel);
  const prereg = JSON.parse(text);
  if (prereg.heldout.commitment_sha256) throw new ValidateRoundError(`heldout_already_committed: ${rel} carries a commitment; a new draw needs a new round id`);
  const popn = await populationReader(root);
  const draw = drawHeldout({ rows: popn.rows, salt, nPerStratum: prereg.heldout.n_per_stratum });
  if (!draw.ids.length) throw new ValidateRoundError('heldout_population_empty: no residential parcels read');
  const out = applyHeldout(text, { commitment_sha256: heldoutCommitment(draw.ids, salt), draw: drawParams(draw, { database: popn.database, nPerStratum: prereg.heldout.n_per_stratum }) });
  const v = schemaViolations(root, 'prereg', JSON.parse(out));
  if (v.length) throw new ValidateRoundError(`prereg_invalid: ${v.join('; ')}`);
  fs.writeFileSync(path.join(root, rel), out);
  return { rel, per_stratum: draw.per_stratum, n: draw.ids.length, commitment_sha256: JSON.parse(out).heldout.commitment_sha256 };
}

// ---------------------------------------------------------------- elements
/** Q3: every limit present and ≤ max ⇒ pass; one over ⇒ fail; one missing ⇒ not_run; no limits ⇒ recorded. PURE. */
export function judgeLimits(limits, values) {
  if (!limits.length) return { verdict: 'pass', label: 'recorded' };
  if (!values || limits.some((l) => typeof values[l.key] !== 'number' || !Number.isFinite(values[l.key]))) return notRun('measurements_absent');
  const over = limits.filter((l) => values[l.key] > l.max).map((l) => l.key);
  return over.length ? { verdict: 'fail', over } : { verdict: 'pass' };
}

function k3Elements(prereg, m) {
  return prereg.k3.map((k) => {
    if (!m) return { id: k.id, ...notRun('measurements_absent') };
    if (m.stale) return { id: k.id, ...notRun('stale_pin') };
    const got = m.doc.k3 && m.doc.k3[k.id];
    if (!got || !got.values || typeof got.values !== 'object') return { id: k.id, ...notRun('measurements_absent') };
    return { id: k.id, ...judgeLimits(k.limits, got.values), counts: { values: got.values } };
  });
}

function heldoutElement(root, prereg, reveal) {
  const h = prereg.heldout;
  if (!h.commitment_sha256 || !h.draw) return { id: 'heldout', ...notRun('heldout_commitment_missing') };
  if (!reveal) return { id: 'heldout', ...notRun('heldout_reveal_absent') };
  const draw = drawHeldout({ rows: reveal.rows, salt: reveal.salt, nPerStratum: h.draw.n_per_stratum });
  if (draw.population_sha256 !== h.draw.population_sha256) return { id: 'heldout', ...notRun('heldout_population_changed', { counts: { per_stratum: draw.per_stratum } }) };
  const status = heldoutStatus({ commitment: h.commitment_sha256, ids: draw.ids, salt: reveal.salt, pool: regressionPool(root) });
  return { id: 'heldout', verdict: status === 'verified' ? 'pass' : 'fail', counts: { heldout_status: status, n: draw.ids.length } };
}

function oracleBElement(m) {
  if (!m) return notRun('measurements_absent');
  if (m.stale) return notRun('stale_pin');
  const b = m.doc.oracle_b;
  if (!b) return notRun('measurements_absent');
  return { verdict: b.unadjudicated === 0 ? 'pass' : 'fail', label: 'resolver agreement, never accuracy (R-ORACLE)', counts: { n: b.n, agree: b.agree, disagree: b.disagree, unadjudicated: b.unadjudicated } };
}

function oracleEElement(m) {
  if (!m) return notRun('measurements_absent');
  if (m.stale) return notRun('stale_pin');
  const e = m.doc.oracle_e;
  if (!e) return notRun('measurements_absent');
  return { verdict: e.layer2_defect === 0 && e.unexplained === 0 ? 'pass' : 'fail', counts: { by_class: e.by_class || {}, layer2_defect: e.layer2_defect, unexplained: e.unexplained } };
}

// The recorded path is the file's basename: two seats in different worktrees record the same value (K.4); the sha binds it.
const readInput = (p) => {
  const buf = fs.readFileSync(p);
  return { path: path.basename(p), sha256: sha256(lf(buf.toString('utf8'))), doc: JSON.parse(buf.toString('utf8')) };
};

/**
 * Build the round record. opts: {root, round, mode: dry_run|round, db?: bool, measurements?, oracleCPath?, secondSeat?}
 * (paths), heldoutReveal?: {salt, rows} (the CLI fills it from the env salt + a read-only DB read). Writes nothing.
 */
export async function buildRecord({ root, round, mode = 'dry_run', db = false, measurements = null, oracleCPath = null, secondSeat = null, heldoutReveal = null, dbReader = readDbCounts }) {
  const pins = currentPins(root, round);
  const head = gitHead(root);
  const prereg_status = preregStatus(root, pins, head);
  if (!pins.prereg_sha) throw new ValidateRoundError(`prereg_missing: ${pins.prereg_path}`);
  const prereg = JSON.parse(readLf(root, pins.prereg_path));
  const pv = schemaViolations(root, 'prereg', prereg);
  if (pv.length) throw new ValidateRoundError(`prereg_invalid: ${pv.join('; ')}`);
  if (mode === 'round' && prereg_status !== 'committed') throw new ValidateRoundError(`prereg_not_committed: ${pins.prereg_path} is ${prereg_status} at HEAD (V-4: the prereg is committed before its round)`);

  let m = null;
  let measurementsMeta;
  if (measurements) {
    const inp = readInput(measurements);
    const stale = PIN_KEYS.filter((k) => k in (inp.doc.pins || {}) && inp.doc.pins[k] !== pins[k]);
    m = { doc: inp.doc, stale: stale.length > 0 };
    measurementsMeta = { path: inp.path, sha256: inp.sha256, stale_pins: stale };
  }

  const k7 = prereg.k7r;
  const cm = checkClassMap({ classMap: k7.class_map, codes: NOT_EVALUATED_CODES, lotGates: k7.lot_gates, extra: k7.extra_keys });
  const indep = oracleBIndependence(root);
  const ranks = probeRanks({ seed: k7.probe.seed, from: k7.probe.rank_from, to: k7.probe.rank_to, n: k7.probe.n });
  const ranksOk = stable(ranks) === stable(k7.probe.ranks);
  const binding = plannedKeyingBinding(k7.planned_keying_source, pins.w1_shards_sha);
  let split;
  if (!m || !Array.isArray(m.doc.k7r_items)) split = { id: 'k7r_split', ...notRun('measurements_absent') };
  else if (m.stale || binding !== 'bound') split = { id: 'k7r_split', ...notRun('stale_pin') };
  else {
    const planned = plannedExceptionsFrom(JSON.parse(readLf(root, W1_SHARDS_REL)));
    const s = k7rSplit({ items: m.doc.k7r_items, classMap: k7.class_map, plannedExceptions: planned, kill: k7.kill });
    split = { id: 'k7r_split', verdict: s.verdict, ...(s.verdict === 'not_run' ? { reason: 'measurements_absent' } : {}), label: 'K7-R thresholds post hoc (K.2 d)', counts: { item: s.item, lot: s.lot, kill_fired: s.kill.fired, original_k7: s.original_k7, unmapped: s.unmapped, planned_exceptions: planned.length } };
  }

  const elements = [
    prereg_status === 'committed' ? { id: 'prereg', verdict: 'pass', counts: { prereg_status } } : { id: 'prereg', ...notRun('prereg_not_committed', { counts: { prereg_status } }) },
    { id: 'k7r_class_map_total', verdict: cm.pass ? 'pass' : 'fail', counts: { domain: cm.checked, violations: cm.violations } },
    { id: 'oracle_b_independence', verdict: indep.pass ? 'pass' : 'fail', counts: { files: indep.checked, violations: indep.violations } },
    { id: 'probe_ranks', verdict: ranksOk ? 'pass' : 'fail', counts: { ranks } },
    split,
    ...k3Elements(prereg, m),
    heldoutElement(root, prereg, heldoutReveal),
  ];
  const oracles = {
    A: notRun('step_not_built'),
    B: oracleBElement(m),
    C: oracleC(oracleCPath ? readInput(oracleCPath) : null, pins, prereg),
    D: oracleD(prereg),
    E: oracleEElement(m),
  };
  let dbRec = { status: 'not_run', reason: 'db_not_requested' };
  if (db) dbRec = await dbReader(root);

  const rec = {
    schema: 'bylaw-round-record-v1',
    round,
    mode,
    validate_round_version: VALIDATE_ROUND_VERSION,
    git_head: head,
    pins,
    prereg_status,
    db: dbRec,
    ...(measurementsMeta ? { measurements: measurementsMeta } : {}),
    elements,
    oracles,
    verdict: 'not_run',
    disclosures: [
      `oracle D (expert sample) not_run: ${prereg.oracles.D.basis}`,
      'oracle A not_run: resolve_bylaws is built at P2-8; round 0 compares the production evaluator with oracle B (compare.mjs)',
      'A = B is resolver agreement, never accuracy (R-ORACLE); table accuracy evidence comes from oracle C and the operator law-text sample while D is not run',
      `K7-R kill lines are post hoc (${k7.kill.post_hoc_basis}); the original K7 (> ${k7.kill.original_k7.threshold * 100} % of all items) is printed beside`,
      ...(pins.class_catalogue_sha ? [] : [`class catalogue ${CLASS_CATALOGUE_REL} absent (Q12): pinned null; needs_user_input stays class (ii)`]),
      ...(binding === 'bound' ? [] : [`planned keying not bound: ${W1_SHARDS_REL} sha ${pins.w1_shards_sha ?? 'absent'} vs prereg ${k7.planned_keying_source.blob_sha ?? 'placeholder null'} => k7r_split not_run:stale_pin`]),
      ...prereg.k3.filter((k) => k.missing_sources).map((k) => `${k.id}: ${k.missing_sources}`),
    ],
  };
  const second = secondSeat ? readInput(secondSeat).doc : null;
  rec.elements.push(doubleCheck(rec, second));
  rec.verdict = roundVerdict([...rec.elements, ...Object.values(rec.oracles)]);
  const rv = schemaViolations(root, 'record', rec);
  if (rv.length) throw new ValidateRoundError(`record_invalid: ${rv.join('; ')}`);
  return rec;
}


// ---------------------------------------------------------------- self-test (pure fixtures, both directions)
export function selfTest() {
  const v = [];
  const expect = (name, got, want) => {
    if (stable(got) !== stable(want)) v.push(`self_test_${name}: got ${stable(got)} want ${stable(want)}`);
  };
  const map = { a: 'ii', b: 'i', none: 'not_unavailable', 'not_modelled:target_not_keyed': 'i_if_planned' };
  expect('map_total', checkClassMap({ classMap: map, codes: ['a', 'b'], lotGates: ['none'], extra: ['not_modelled:target_not_keyed'] }).pass, true);
  expect('map_missing', checkClassMap({ classMap: map, codes: ['a', 'b', 'c'], lotGates: ['none'], extra: ['not_modelled:target_not_keyed'] }).violations, ['k7r_map_missing: c']);
  expect('map_unknown', checkClassMap({ classMap: map, codes: ['a'], lotGates: ['none'], extra: ['not_modelled:target_not_keyed'] }).violations, ['k7r_map_unknown_key: b']);
  const kill = { ii_item_max: 0.05, ii_lot_max: 0.05, i_plus_ii_max: 0.2, i_plus_ii_weights: ['item', 'lot'], post_hoc: true, original_k7: { threshold: 0.2 } };
  const it = (reason, n = 1, x = {}) => ({ reason, lot_gate: 'none', lots: n, zone: 'R', target: 't', keyed_scope: true, ...x });
  const items = (ii, total) => [...Array.from({ length: total - ii }, () => it(null)), ...Array.from({ length: ii }, () => it('a:x'))];
  expect('kill_at_line', k7rSplit({ items: items(5, 100), classMap: map, kill }).verdict, 'pass');
  expect('kill_over_line', k7rSplit({ items: items(6, 100), classMap: map, kill }).kill.fired, ['ii_item', 'ii_lot']);
  expect('gate_wins', itemKey(it('a:x', 1, { lot_gate: 'g' })), 'g');
  expect('unmapped_fails', k7rSplit({ items: [it('zzz')], classMap: map, kill }).verdict, 'fail');
  expect('empty_not_run', k7rSplit({ items: [], classMap: map, kill }).verdict, 'not_run');
  expect('verdicts', ['pass', 'fail', 'not_run'].map((x) => roundVerdict([{ verdict: 'pass' }, { verdict: x }])), ['pass', 'fail', 'not_run']);
  expect('scan', importScan([{ path: 'oracle-b/x.mjs', text: "import a from '../evaluate.mjs'; import b from '../vocab.mjs'; import c from './expr.mjs';" }]).violations,
    ['oracle_b_banned_import: oracle-b/x.mjs -> ../evaluate.mjs', 'oracle_b_external_import: oracle-b/x.mjs -> ../vocab.mjs']);
  expect('probe_stable', probeRanks({ seed: 's', from: 1, to: 50, n: 5 }), probeRanks({ seed: 's', from: 1, to: 50, n: 5 }));
  expect('double_check', doubleCheck({ pins: { a: 1 } }, { pins: { a: 2 } }).diffs, ['pins.a']);
  return { pass: v.length === 0, violations: v };
}

// ---------------------------------------------------------------- CLI
function arg(args, name) {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

async function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  if (argv.includes('--self-test')) {
    const r = selfTest();
    console.log(r.pass ? 'validate-round self-test: PASS' : `validate-round self-test: FAIL\n${r.violations.join('\n')}`);
    process.exitCode = r.pass ? 0 : 1;
    return;
  }
  if (argv.includes('--check-stale')) {
    const dir = path.join(root, VAL_REL, 'rounds');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(cmpStr) : [];
    let stale = 0;
    for (const f of files) {
      const rec = JSON.parse(readLf(root, `${VAL_REL}/rounds/${f}`));
      const diff = stalePins(rec.pins, currentPins(root, rec.round));
      if (diff.length) stale++;
      console.log(`${f}: verdict ${rec.verdict}${diff.length ? `; STALE (${diff.join(', ')}) — every element reads not_run:stale_pin` : '; current'}`);
    }
    console.log(`${files.length} round record(s), ${stale} stale`);
    return;
  }
  const r = arg(argv, 'round');
  if (r === null || !/^\d+$/.test(r)) throw new ValidateRoundError('usage: [commit-heldout] --round=<n> [--dry-run] [--db] [--measurements f] [--oracle-c f] [--second-seat f] [--heldout-reveal] [--out f]');
  const round = Number(r);
  if (argv[0] === 'commit-heldout') {
    const c = await commitHeldout({ root, round, env: process.env });
    console.log(`committed heldout for round ${round} into ${c.rel}: ${c.n} lots; per stratum ${JSON.stringify(c.per_stratum)}; commitment ${c.commitment_sha256}. The salt was not written; keep it for the reveal.`);
    return;
  }
  const mode = argv.includes('--dry-run') ? 'dry_run' : 'round';
  let heldoutReveal = null;
  if (argv.includes('--heldout-reveal')) {
    const salt = heldoutSaltFromEnv(process.env);
    heldoutReveal = { salt, rows: (await readHeldoutPopulation(root)).rows };
  }
  const rec = await buildRecord({ root, round, mode, db: argv.includes('--db'), measurements: arg(argv, 'measurements'), oracleCPath: arg(argv, 'oracle-c'), secondSeat: arg(argv, 'second-seat'), heldoutReveal });
  const text = `${JSON.stringify(rec, null, 1)}\n`;
  const out = arg(argv, 'out');
  if (mode === 'round') {
    const target = path.join(root, VAL_REL, 'rounds', `${round}.json`);
    if (fs.existsSync(target)) throw new ValidateRoundError(`round_exists: ${VAL_REL}/rounds/${round}.json is never overwritten; a re-run is a new round id`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, { flag: 'wx' });
  } else if (out) fs.writeFileSync(out, text);
  const line = (x) => `${x.id || ''}${x.id ? ' ' : ''}${x.verdict}${x.reason ? `:${x.reason}` : ''}`;
  console.log(`PHASE 2 VALIDATION round ${round} (${mode}) — verdict ${rec.verdict}`);
  for (const e of rec.elements) console.log(`  element ${line(e)}`);
  for (const [k, o] of Object.entries(rec.oracles)) console.log(`  oracle ${k} ${line(o)}`);
  console.log(`  pins table ${rec.pins.table_version.slice(0, 26)}… evaluator ${rec.pins.evaluator_version.slice(0, 12)} vocab ${rec.pins.vocab_version} oracle-b ${rec.pins.oracle_b_sha.slice(0, 12)} prereg ${rec.prereg_status} db ${rec.db.status}${rec.db.database ? ` (${rec.db.database}, parcels ${rec.db.counts.parcels}, residential ${rec.db.counts.residential_parcels})` : ''}`);
  if (mode === 'dry_run' && !out) console.log(text);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof ValidateRoundError)) throw err;
    console.error(`refused — ${err.message}`);
    process.exitCode = 2;
  }
}
