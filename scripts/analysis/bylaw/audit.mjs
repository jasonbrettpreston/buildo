// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-AUDIT ("committed bar (strata + seed) before `--sample`;
//            the bar's commit is an ancestor of the sample record's commit; exactly 50 rows per Spec 69 M-29 (≥ 20 whose
//            verbatim contains a numeric literal, ≥ 1 per archetype present, every EXT-* row, the 900.1.10 rows,
//            adjudicated rows eligible); PASS computed on the sample as drawn; until Phase 1 closes, a PASS is
//            invalidated if a sampled row's content hash changes. A FAIL is fixed, then a new full audit (new seed, same
//            bar; the failed rows are forced in and replace seeded rows of their own strata, so the count stays 50);
//            after a third FAIL the operator rules before any further audit; every record kept, audit count printed"),
//            §4 (gate state pass · fail · not_run; pending never fails a gate; an on-demand gate counts as run only when
//            its latest committed record is bound to the current row hashes), §6.5 (the expert-audit record), SC-4
//            (≥ 95 % agree and 0 numeric disagreements on exactly 50 rows), §14 (11) audit power;
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-29 (strata, reviewer, pass bar, never silently waived,
//            `expert_rulings_against`), M-54 dated note (every absence row is in the sample), M-55 dated note (both
//            provincial direction readings are flagged for the sample), M-39 (the adjudicated consolidation_mismatch
//            row), M-46 (heuristics are not in the sample); docs/reports/mcbylaw-phase1-plan.md S14
//
// G-AUDIT. Three pure pieces + the git witness:
//   buildPopulation({rows, external, absence, adjudications, rowIds}) → {population, required, confirmations, excluded}
//       rows = [{regulation_id, row_status, numeric, archetypes[], has_numeric_expression, content_sha256}] (the S7
//       table, mapped); only `complete` rows are eligible; EXT-* rows and ABS rows are items of their own.
//   drawSample({bar, population, required, seed, forced}) → [{id, content_sha256, strata[]}] (exactly bar.sample_size)
//   buildSampleRecord({bar, barText, population, required, priorRecords, date, operatorRuling}) → {file, record}  (--sample)
//   scoreAudit(record, bar) → {state: pending|pass|fail, agree, sampled, numeric_disagreements, failed_ids, …}
//   checkAudit({bar, barText, records, population, required, witness}) → {status, pass, checked, violations, counts}
//   gitAuditWitness(root) = git-witness.mjs gitWitness (-z, commit ids only; null = fail closed)
//   auditSeed(seed, n) · rowContentSha(row) · selfTest()
//
// The draw is deterministic: rank = sha256(seed ‖ id); no clock and no random source. Audit n uses auditSeed(bar.seed, n),
// so every seed is fixed by the ONE committed bar ("new seed, same bar"). Take-all strata (every EXT-* row, the
// 900.1.10 rows, every ABS row, the provincial direction row, the M-39 adjudicated row) and the forced failed rows go in
// first; then ≥ 1 per archetype present, then numeric up to its minimum, then the seeded fill to 50 — so a forced row
// counts toward its own strata and displaces a seeded row of them, and the count stays 50.
//
// --sample refusals (AuditError, exit 2 — never a gate state): bar_invalid · date_invalid · audit_numbering_gap ·
// bar_changed · reaudit_without_fail · operator_ruling_missing · bar_infeasible · population_too_small ·
// required_not_eligible · forced_not_in_population · content_hash_missing.
//
// Reason codes (closed):
//   bar_missing                audit records exist but the bar file does not
//   bar_invalid                the bar breaks M-29: sample_size ≠ 50, agree_rate_min < 0.95, numeric max ≠ 0, numeric
//                              min < 20, archetype min < 1, a required stratum missing / unknown, no seed, reviewer roles
//   bar_changed                a record's bar blob ≠ the committed bar's blob ("same bar")
//   bar_not_before_sample      the bar's commit is not a strict ancestor of the record's first commit
//   witness_unavailable        the git witness cannot answer (fail closed)
//   audit_numbering_gap        record names are not `<YYYY-MM-DD>-<n>.json`, n = 1..k contiguous, n = audit_n, date = name
//   sample_rewritten           the record's draw section differs from the version first committed
//   sample_size_wrong          the sample is not exactly bar.sample_size distinct ids
//   seed_wrong                 record.seed ≠ auditSeed(bar.seed, n)
//   reaudit_without_fail       audit n > 1 whose audit n − 1 neither FAILed nor had its PASS invalidated (a sampled
//                              row's content hash moved — e.g. a disagreement "fixed" — by the time audit n was drawn)
//   failed_rows_not_forced     record.forced ≠ the failed rows of audit n − 1 (audit 1: ≠ none), or one is not sampled
//   operator_ruling_missing    an audit drawn after three FAILs with no operator ruling (the operator rules first)
//   stratum_unmet              a required member is not sampled, < numeric min, or an archetype present has no row
//   sample_not_reproducible    the draw from the record's own population, seed and forced rows ≠ the recorded sample
//   result_invalid             a result outside the closed sets, for an id not sampled, a numeric field that does not
//                              match the row, or a reviewer role outside the bar's
//   audit_failed               the latest audit, complete, misses the bar (the FAIL)
//   record_malformed           a record does not parse as bylaw-expert-audit-v1, or its sample / population / required /
//                              forced / results are not the closed shape
//   results_rewritten          a committed verdict (reviewer, a row's values / explanation / numeric, a confirmation,
//                              a resolution) changed or was deleted in a later version (verdicts are add-only)
//   record_deleted             an audit record committed once is no longer in the tree ("every record kept")

import crypto from 'node:crypto';
import { gateResult, violation } from './authored.mjs';
import { stableStringify } from './snapshot.mjs';
import { gitBlobOid, gitWitness, lf } from './git-witness.mjs';
import { auditFixtures } from './audit-fixtures.mjs';
import { createRequire } from 'node:module';
const AUDIT_CONFIRMATIONS = createRequire(import.meta.url)('../../seeds/bylaw/audit-confirmations.json'); // data (G-EXC-LIT)

export const BAR_SCHEMA = 'bylaw-audit-bar-v1';
export const RECORD_SCHEMA = 'bylaw-expert-audit-v1';
export const AUDIT_DIR_REL = 'scripts/seeds/bylaw/expert-audit';
export const BAR_REL = `${AUDIT_DIR_REL}/bar.json`;
export const RECORD_NAME = /^(\d{4}-\d{2}-\d{2})-([1-9]\d*)\.json$/;
/** Take-all strata, in draw order (each a population flag). */
export const TAKE_ALL = Object.freeze(['external', 'precedence_900_1_10', 'absence', 'provincial_direction', 'enacting_text']);
export const STRATA = Object.freeze([...TAKE_ALL, 'archetype', 'numeric', 'seeded']);
export const VERDICTS = Object.freeze(['agree', 'disagree']);
export const NUMERIC_VERDICTS = Object.freeze(['agree', 'disagree', 'none']);
export const RESOLUTIONS = Object.freeze(['fixed', 'ruling_against_expert']);
/** The M-29 floor every bar must meet. */
export const M29 = Object.freeze({ sample_size: 50, agree_rate_min: 0.95, numeric_disagreements_max: 0, numeric_min: 20, archetype_min: 1 });
export const REASON_CODES = Object.freeze([
  'bar_missing',
  'bar_invalid',
  'bar_changed',
  'bar_not_before_sample',
  'witness_unavailable',
  'audit_numbering_gap',
  'sample_rewritten',
  'sample_size_wrong',
  'seed_wrong',
  'reaudit_without_fail',
  'failed_rows_not_forced',
  'operator_ruling_missing',
  'stratum_unmet',
  'sample_not_reproducible',
  'result_invalid',
  'audit_failed',
  'record_malformed',
  'results_rewritten',
  'record_deleted',
]);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (xs) => [...xs].sort(cmpStr);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export class AuditError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

/** The seed of audit n: the bar's seed for n = 1, then sha256(seed:n). PURE. */
export const auditSeed = (seed, n) => (n === 1 ? String(seed) : sha256(`${seed}:${n}`));
/** The content hash of a rendered row (or an external / absence entry): sha256 of its stable JSON. PURE. */
export const rowContentSha = (row) => sha256(stableStringify(row));
const rank = (seed, id) => sha256(`${seed}\u0000${id}`);

// ---------------------------------------------------------------- population

/** The regulation a citation names: the longest row id that prefixes it (`600.60.40(3)(C)` → `600.60.40(3)`). PURE. */
function rowOfCitation(rowIds, citation) {
  const c = String(citation || '').split('#')[0];
  let best = null;
  for (const id of rowIds) if ((c === id || c.startsWith(`${id}(`) || c.startsWith(`${id}#`)) && (!best || id.length > best.length)) best = id;
  return best;
}

/** Eligible items, required ids and explicit confirmations from the table + seeds. PURE. */
export function buildPopulation({ rows = [], external = null, absence = null, adjudications = null, rowIds = null } = {}) {
  const allRowIds = sorted(new Set([...(rowIds || []), ...rows.map((r) => r.regulation_id)]));
  const flags = new Map();
  const confirmations = {};
  const flag = (id, f) => {
    if (!flags.has(id)) flags.set(id, new Set());
    flags.get(id).add(f);
  };
  const required = new Set();
  for (const id of allRowIds) {
    if (id.startsWith('900.1.10(')) {
      flag(id, 'precedence_900_1_10');
      required.add(id);
    }
  }
  for (const c of AUDIT_CONFIRMATIONS.entries || []) if (allRowIds.includes(c.regulation_id)) confirmations[c.regulation_id] = [...c.confirmations];
  for (const a of (adjudications && adjudications.adjudications) || []) {
    if (!a || a.kind !== 'consolidation_mismatch') continue;
    const id = rowOfCitation(allRowIds, a.unit);
    if (id) {
      flag(id, 'enacting_text');
      required.add(id);
    }
  }
  const population = [];
  const excluded = [];
  for (const r of [...rows].sort((a, b) => cmpStr(a.regulation_id, b.regulation_id))) {
    if (r.row_status !== 'complete') {
      excluded.push(r.regulation_id);
      continue;
    }
    if (!isStr(r.content_sha256)) throw new AuditError('content_hash_missing', `${r.regulation_id} has no content hash (the invalidation rule needs one)`);
    population.push({
      archetypes: sorted(new Set(r.archetypes || [])),
      confirm: confirmations[r.regulation_id] || [],
      content_sha256: r.content_sha256,
      flags: sorted(flags.get(r.regulation_id) || []),
      has_numeric_expression: Boolean(r.has_numeric_expression),
      id: r.regulation_id,
      kind: 'row',
      numeric: Boolean(r.numeric),
    });
  }
  for (const e of (external && external.entries) || []) {
    if (!e || !/^EXT-/.test(String(e.id))) continue; // "every external row" = the EXT-* rows, not ref / heuristic (§6.1)
    const pu = Array.isArray(e.provincial_units) ? e.provincial_units : [];
    const f = ['external', ...(pu.length ? ['provincial_direction'] : [])];
    const confirm = sorted(pu.map((u) => `direction:${u.unit_id}:${u.limits_bylaw}:${u.direction_basis}`)); // M-55 note: each reading
    if (confirm.length) confirmations[e.id] = confirm;
    required.add(e.id);
    population.push({ archetypes: [], confirm, content_sha256: rowContentSha(e), flags: sorted(f), has_numeric_expression: false, id: e.id, kind: 'external', numeric: false });
  }
  for (const a of (absence && absence.rulings) || []) {
    if (!a || !isStr(a.id)) continue;
    required.add(a.id); // every absence row is in the M-29 sample (Spec 69 M-54 note)
    population.push({ archetypes: [], confirm: [], content_sha256: rowContentSha(a), flags: ['absence'], has_numeric_expression: false, id: a.id, kind: 'absence', numeric: false });
  }
  population.sort((a, b) => cmpStr(a.id, b.id));
  return { population, required: sorted(required), confirmations, excluded };
}

// ---------------------------------------------------------------- draw

const stratumOf = (bar, id) => ((bar && bar.strata) || []).find((s) => s && s.id === id);

/** The M-29 draw. PURE. Throws AuditError bar_infeasible · population_too_small · required_not_eligible · forced_not_in_population. */
export function drawSample({ bar, population, required = [], seed, forced = [] }) {
  const size = bar.sample_size;
  const byId = new Map(population.map((x) => [x.id, x]));
  const missing = required.filter((id) => !byId.has(id));
  if (missing.length) throw new AuditError('required_not_eligible', `${missing.join(', ')} must be sampled but are not eligible (not complete)`);
  const badForced = forced.filter((id) => !byId.has(id));
  if (badForced.length) throw new AuditError('forced_not_in_population', badForced.join(', '));
  const order = [...population].sort((a, b) => cmpStr(rank(seed, a.id), rank(seed, b.id)) || cmpStr(a.id, b.id));
  const sel = new Map();
  const add = (id, s) => {
    if (!sel.has(id)) sel.set(id, new Set());
    sel.get(id).add(s);
  };
  for (const id of sorted(forced)) add(id, 'failed_row');
  for (const s of TAKE_ALL) for (const x of population) if (x.flags.includes(s) || (s === 'external' && x.kind === 'external') || (s === 'absence' && x.kind === 'absence')) add(x.id, s);
  for (const id of required) add(id, 'required');
  if (sel.size > size) throw new AuditError('bar_infeasible', `${sel.size} forced / take-all rows exceed the sample size ${size}`);
  // forced / take-all rows count toward the archetype and numeric strata they belong to
  for (const [id, set] of sel) {
    const x = byId.get(id);
    for (const a of x.archetypes) set.add(`archetype:${a}`);
    if (x.numeric) set.add('numeric');
  }
  const perArch = (stratumOf(bar, 'archetype') || {}).min_per_value ?? M29.archetype_min;
  for (const a of sorted(new Set(population.flatMap((x) => x.archetypes)))) {
    let have = [...sel.keys()].filter((id) => byId.get(id).archetypes.includes(a)).length;
    for (const x of order) {
      if (have >= perArch) break;
      if (sel.has(x.id) || !x.archetypes.includes(a)) continue;
      add(x.id, `archetype:${a}`);
      if (x.numeric) add(x.id, 'numeric');
      for (const b of x.archetypes) add(x.id, `archetype:${b}`);
      have++;
    }
  }
  const numMin = (stratumOf(bar, 'numeric') || {}).min ?? M29.numeric_min;
  let num = [...sel.keys()].filter((id) => byId.get(id).numeric).length;
  for (const x of order) {
    if (num >= numMin) break;
    if (sel.has(x.id) || !x.numeric) continue;
    add(x.id, 'numeric');
    for (const b of x.archetypes) add(x.id, `archetype:${b}`);
    num++;
  }
  if (num < numMin) throw new AuditError('population_too_small', `${num} numeric rows eligible, the bar needs ${numMin}`);
  if (sel.size > size) throw new AuditError('bar_infeasible', `${sel.size} forced / stratum rows exceed the sample size ${size}`);
  for (const x of order) {
    if (sel.size >= size) break;
    if (!sel.has(x.id)) add(x.id, 'seeded');
  }
  if (sel.size < size) throw new AuditError('population_too_small', `${population.length} eligible items, the sample needs ${size}`);
  return sorted(sel.keys()).map((id) => ({ content_sha256: byId.get(id).content_sha256, id, strata: sorted(sel.get(id)) }));
}

// ---------------------------------------------------------------- bar

/** M-29 problems of a bar file. PURE. */
export function barProblems(bar) {
  const p = [];
  if (!isMap(bar) || bar.schema !== BAR_SCHEMA) return [`schema ≠ ${BAR_SCHEMA}`];
  if (bar.sample_size !== M29.sample_size) p.push(`sample_size ${bar.sample_size} ≠ ${M29.sample_size}`);
  if (!isStr(bar.seed)) p.push('no seed');
  const pb = bar.pass_bar || {};
  if (!(typeof pb.agree_rate_min === 'number' && pb.agree_rate_min >= M29.agree_rate_min && pb.agree_rate_min <= 1)) p.push(`agree_rate_min ${pb.agree_rate_min} < ${M29.agree_rate_min}`);
  if (pb.numeric_disagreements_max !== M29.numeric_disagreements_max) p.push(`numeric_disagreements_max ${pb.numeric_disagreements_max} ≠ 0`);
  const ids = Array.isArray(bar.strata) ? bar.strata.map((s) => s && s.id) : [];
  if (!sameList(sorted(ids), sorted(STRATA))) p.push(`strata ${JSON.stringify(sorted(ids))} ≠ ${JSON.stringify(sorted(STRATA))}`);
  for (const s of TAKE_ALL) if (ids.includes(s) && stratumOf(bar, s).take !== 'all') p.push(`stratum ${s} must take all`);
  const n = stratumOf(bar, 'numeric');
  if (n && !(Number.isSafeInteger(n.min) && n.min >= M29.numeric_min)) p.push(`numeric min ${n.min} < ${M29.numeric_min}`);
  const a = stratumOf(bar, 'archetype');
  if (a && !(Number.isSafeInteger(a.min_per_value) && a.min_per_value >= M29.archetype_min)) p.push(`archetype min_per_value ${a.min_per_value} < 1`);
  if (!Array.isArray(bar.reviewer_roles) || !bar.reviewer_roles.length || bar.reviewer_roles.some((r) => !['city_zoning_examiner', 'rpp'].includes(r))) p.push('reviewer_roles ⊄ {city_zoning_examiner, rpp}');
  return p;
}

// ---------------------------------------------------------------- record + score

/** The part of a record fixed at --sample (never rewritten after its first commit). PURE. */
export function drawSection(rec) {
  const r = rec || {};
  return stableStringify({ audit_n: r.audit_n, bar_blob: r.bar_blob, date: r.date, forced: r.forced, operator_ruling: r.operator_ruling ?? null, population: r.population, required: r.required, sample: r.sample, schema: r.schema, seed: r.seed });
}
/**
 * Verdicts are add-only across a record's versions (oldest first): once committed, a reviewer, a row's values /
 * explanation / numeric verdict, each confirmation and each resolution stays as written — added to, never changed or
 * deleted (a FAIL is fixed by a new audit; a ruling against the expert stays counted). Returns the first breach. PURE.
 */
export function verdictBreach(versions) {
  const res = (r) => (isMap(r && r.results) ? r.results : {});
  for (let i = 1; i < versions.length; i++) {
    const a = versions[i - 1];
    const b = versions[i];
    if (isMap(a.reviewer) && stableStringify(a.reviewer) !== stableStringify(b.reviewer)) return 'the reviewer changed';
    for (const [id, x] of Object.entries(res(a))) {
      const y = res(b)[id];
      if (!isMap(x)) continue;
      if (!isMap(y)) return `${id}: a committed verdict was deleted`;
      for (const k of ['values', 'explanation', 'numeric_expression']) if (x[k] !== undefined && x[k] !== y[k]) return `${id}: ${k} changed`;
      for (const [c, w] of Object.entries(isMap(x.confirmations) ? x.confirmations : {})) if (!isMap(y.confirmations) || y.confirmations[c] !== w) return `${id}: confirmation ${c} changed`;
      if (x.resolution !== undefined && stableStringify(x.resolution) !== stableStringify(y.resolution)) return `${id}: a committed resolution changed`;
    }
  }
  return null;
}

/** Problems with a record's shape (before any check reads it). PURE. */
export function recordProblems(rec) {
  const p = [];
  const strList = (x) => Array.isArray(x) && x.every((y) => typeof y === 'string');
  if (!isMap(rec)) return ['not an object'];
  if (!strList(rec.forced)) p.push('forced is not a string list');
  if (!strList(rec.required)) p.push('required is not a string list');
  if (!Array.isArray(rec.population) || rec.population.some((x) => !isMap(x) || !isStr(x.id) || !isStr(x.content_sha256) || !strList(x.archetypes) || !strList(x.flags) || !strList(x.confirm) || typeof x.numeric !== 'boolean' || typeof x.has_numeric_expression !== 'boolean')) p.push('population entries are malformed');
  else if (new Set(rec.population.map((x) => x.id)).size !== rec.population.length) p.push('population ids repeat');
  if (!Array.isArray(rec.sample) || rec.sample.some((x) => !isMap(x) || !isStr(x.id) || !isStr(x.content_sha256) || !strList(x.strata))) p.push('sample entries are malformed');
  if (!isStr(rec.seed) || !isStr(rec.bar_blob)) p.push('seed / bar_blob missing');
  if (rec.results !== undefined && !isMap(rec.results)) p.push('results is not a map');
  if (!(rec.operator_ruling === null || rec.operator_ruling === undefined || typeof rec.operator_ruling === 'string')) p.push('operator_ruling is not a string');
  return p;
}

/** The sampled ids of `rec` whose content hash a population no longer has (a PASS invalidated). PURE. */
export function passInvalidated(rec, population) {
  const cur = new Map((population || []).map((x) => [x.id, x.content_sha256]));
  return ((rec && rec.sample) || []).filter((s) => cur.get(s.id) !== s.content_sha256).map((s) => s.id);
}

/** May audit n + 1 follow audit n? After a FAIL, or a PASS that the population audit n + 1 is drawn from invalidates. PURE. */
const reauditAllowed = (prevScore, prevRec, population) => prevScore.state === 'fail' || (prevScore.state === 'pass' && passInvalidated(prevRec, population).length > 0);

/** --sample: the next audit record (results empty). PURE. Throws AuditError on a draw the bar or history forbids. */
export function buildSampleRecord({ bar, barText, population, required, priorRecords = [], date, operatorRuling = null }) {
  const bp = barProblems(bar);
  if (bp.length) throw new AuditError('bar_invalid', bp.join('; '));
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(date))) throw new AuditError('date_invalid', String(date));
  const barBlob = gitBlobOid(Buffer.from(lf(barText), 'utf8'));
  const prior = [...priorRecords].sort((a, b) => a.audit_n - b.audit_n);
  prior.forEach((r, i) => {
    if (r.audit_n !== i + 1) throw new AuditError('audit_numbering_gap', `prior audits are not 1..${prior.length}`);
    if (r.bar_blob !== barBlob) throw new AuditError('bar_changed', `audit ${r.audit_n} used another bar`);
  });
  const n = prior.length + 1;
  let forced = [];
  if (n > 1) {
    const last = scoreAudit(prior.at(-1), bar);
    if (!reauditAllowed(last, prior.at(-1), population)) throw new AuditError('reaudit_without_fail', `audit ${n - 1} is ${last.state}${last.state === 'pass' ? ' and not invalidated' : ''}; a new audit follows a FAIL or an invalidated PASS`);
    forced = last.failed_ids;
    if (String(date) < String(prior.at(-1).date)) throw new AuditError('date_invalid', `${date} is before audit ${n - 1}'s ${prior.at(-1).date}`);
  }
  const fails = prior.filter((r) => scoreAudit(r, bar).state === 'fail').length;
  if (fails >= 3 && !isStr(operatorRuling)) throw new AuditError('operator_ruling_missing', `audit ${n} follows ${fails} FAILs: the operator rules first`);
  const seed = auditSeed(bar.seed, n);
  const sample = drawSample({ bar, population, required, seed, forced });
  const record = { audit_n: n, bar_blob: barBlob, date, forced: sorted(forced), note: '', operator_ruling: operatorRuling, population: JSON.parse(JSON.stringify(population)), required: sorted(required), results: {}, reviewer: null, sample, schema: RECORD_SCHEMA, seed };
  return { file: `${AUDIT_DIR_REL}/${date}-${n}.json`, record };
}

/** Score a record on the sample as drawn. PURE. state: pending (results / confirmations / resolutions owed, or invalid) · pass · fail. */
export function scoreAudit(rec, bar) {
  const out = { state: 'pending', sampled: 0, agree: 0, numeric_disagreements: 0, failed_ids: [], unresolved: [], missing: [], invalid: [], rulings_against: 0 };
  const sample = Array.isArray(rec && rec.sample) ? rec.sample.filter((x) => isMap(x) && isStr(x.id)) : [];
  const sampled = new Set(sample.map((x) => x.id));
  out.sampled = sampled.size;
  const results = isMap(rec && rec.results) ? rec.results : {};
  const pop = new Map((Array.isArray(rec && rec.population) ? rec.population : []).filter(isMap).map((x) => [x.id, x]));
  for (const id of Object.keys(results)) if (!sampled.has(id)) out.invalid.push(`${id}: a result for a row not sampled`);
  const rv = rec && rec.reviewer;
  if (!isMap(rv)) out.missing.push('reviewer');
  else if (!((bar && bar.reviewer_roles) || []).includes(rv.role) || !isStr(rv.organization) || !isStr(rv.credential)) out.invalid.push(`reviewer role ${rv.role} / organization / credential`);
  for (const id of sorted(sampled)) {
    const r = results[id];
    const x = pop.get(id) || { confirm: [], has_numeric_expression: false };
    const confirm = Array.isArray(x.confirm) ? x.confirm : [];
    if (!isMap(r)) {
      out.missing.push(id);
      continue;
    }
    if (!VERDICTS.includes(r.values) || !VERDICTS.includes(r.explanation) || !NUMERIC_VERDICTS.includes(r.numeric_expression)) {
      out.invalid.push(`${id}: values / explanation ∈ agree · disagree, numeric_expression ∈ agree · disagree · none`);
      continue;
    }
    if ((r.numeric_expression === 'none') !== !x.has_numeric_expression) out.invalid.push(`${id}: numeric_expression ${r.numeric_expression}, but the row ${x.has_numeric_expression ? 'has' : 'has no'} numeric_expression`);
    const conf = isMap(r.confirmations) ? r.confirmations : {};
    const owed = confirm.filter((c) => !VERDICTS.includes(conf[c]));
    if (owed.length) out.missing.push(`${id}: confirm ${owed.join(', ')}`);
    const disagree = r.values === 'disagree' || r.explanation === 'disagree' || r.numeric_expression === 'disagree' || confirm.some((c) => conf[c] === 'disagree');
    if (r.numeric_expression === 'disagree') out.numeric_disagreements++;
    if (!disagree) out.agree++;
    else {
      out.failed_ids.push(id);
      const res = r.resolution;
      if (!isMap(res) || !RESOLUTIONS.includes(res.kind) || !isStr(res.note) || (res.kind === 'ruling_against_expert' && !isStr(res.ruling))) out.unresolved.push(id);
      else if (res.kind === 'ruling_against_expert') out.rulings_against++;
    }
  }
  out.failed_ids = sorted(out.failed_ids);
  if (out.missing.length || out.invalid.length) return out;
  const pb = (bar && bar.pass_bar) || {};
  const size = (bar && bar.sample_size) || M29.sample_size;
  const pass = out.sampled === size && out.agree / size >= pb.agree_rate_min && out.numeric_disagreements <= pb.numeric_disagreements_max;
  if (!pass) out.state = 'fail';
  else out.state = out.unresolved.length ? 'pending' : 'pass'; // a disagreement is never silently waived (M-29)
  return out;
}

// ---------------------------------------------------------------- the gate

/**
 * G-AUDIT. PURE given the witness. records = [{path, text}] (every .json under expert-audit/ except bar.json, as read
 * from the working tree); population / required = the CURRENT buildPopulation() (content hashes, required ids).
 */
export function checkAudit({ bar = null, barText = null, records = [], population = [], required = [], witness = null } = {}) {
  const v = [];
  const counts = { audits: 0, latest: null, agree: null, sampled: null, numeric_disagreements: null, expert_rulings_against: 0 };
  const done = (notRun = null) => gateResult({ violations: v, checked: counts.audits, counts, notes: [`audits ${counts.audits}`], notRun: v.length ? null : notRun });
  const list = Array.isArray(records) ? records : [];
  counts.audits = list.length;
  const none = bar ? 'the bar is committed; no audit record yet (--sample, S14)' : 'no bar and no audit record yet (S14)';
  if (!list.length && !witness) return done(none);
  if (list.length && (!isMap(bar) || typeof barText !== 'string')) {
    v.push(violation('bar_missing', BAR_REL, `${list.length} audit record(s), no bar file`));
    return done();
  }
  if (isMap(bar)) {
    const bp = barProblems(bar);
    if (bp.length) {
      for (const p of bp) v.push(violation('bar_invalid', BAR_REL, p));
      return done();
    }
  }
  // names, shape, numbering
  const recs = [];
  for (const f of list) {
    const name = String(f && f.path).split('/').pop();
    const m = RECORD_NAME.exec(name);
    let json = null;
    try {
      json = JSON.parse(f.text);
    } catch {
      json = null; // reported just below as a name / record mismatch
    }
    if (!isMap(json) || json.schema !== RECORD_SCHEMA) {
      v.push(violation('record_malformed', f.path, `does not parse as a ${RECORD_SCHEMA} record`));
      continue;
    }
    if (!m || json.audit_n !== Number(m[2]) || json.date !== m[1]) {
      v.push(violation('audit_numbering_gap', f.path, 'name is not <YYYY-MM-DD>-<n>.json matching the record (audit_n, date)'));
      continue;
    }
    const shape = recordProblems(json);
    if (shape.length) {
      for (const x of shape) v.push(violation('record_malformed', f.path, x));
      continue;
    }
    recs.push({ path: f.path, text: f.text, rec: json, n: json.audit_n });
  }
  recs.sort((a, b) => a.n - b.n);
  recs.forEach((r, i) => {
    if (r.n !== i + 1) v.push(violation('audit_numbering_gap', r.path, `audit ${r.n} where ${i + 1} was expected (n = 1..k, every record kept)`));
    else if (i && r.rec.date < recs[i - 1].rec.date) v.push(violation('audit_numbering_gap', r.path, `dated ${r.rec.date}, before audit ${i}'s ${recs[i - 1].rec.date}`));
  });
  if (v.length) return done();
  if (!witness) return done('the git witness was not injected');

  // every record ever committed is still here ("every record kept")
  const ever = witness.pathsEver(AUDIT_DIR_REL);
  if (ever === null) {
    v.push(violation('witness_unavailable', AUDIT_DIR_REL, 'git log failed'));
    return done();
  }
  const here = new Set(recs.map((r) => r.path));
  for (const p of ever) if (RECORD_NAME.test(p.split('/').pop()) && !here.has(p)) v.push(violation('record_deleted', p, 'a committed audit record is gone (every record is kept)'));
  if (!recs.length) return done(none);
  const barBlob = gitBlobOid(Buffer.from(lf(barText), 'utf8'));

  const barCommits = witness.commitsTouching(BAR_REL);
  if (barCommits === null) {
    v.push(violation('witness_unavailable', BAR_REL, 'git log failed'));
    return done();
  }
  if (!barCommits.length || witness.blobAt(barCommits.at(-1), BAR_REL) !== barBlob) return done(`${BAR_REL} has uncommitted edits or is not committed`);
  const curPop = new Map(population.map((x) => [x.id, x]));
  let prev = null;
  let prevRec = null;
  let fails = 0;
  const unbound = [];
  for (const { path: p, text, rec, n } of recs) {
    const score = scoreAudit(rec, bar);
    const step = () => {
      if (score.state === 'fail') fails++;
      prev = score;
      prevRec = rec;
    };
    if (rec.bar_blob !== barBlob) {
      v.push(violation('bar_changed', p, `bar blob ${String(rec.bar_blob).slice(0, 12)}… ≠ the committed bar ${barBlob.slice(0, 12)}…`));
      step();
      continue;
    }
    // git witness: the record's first commit; the bar committed strictly before it and in force at it; draw + verdicts frozen
    const commits = witness.commitsTouching(p);
    if (commits === null) {
      v.push(violation('witness_unavailable', p, 'git log failed'));
      step();
      continue;
    }
    const versions = commits.map((c) => ({ c, oid: witness.blobAt(c, p) })).filter((x) => x.oid !== null);
    if (!versions.length) {
      unbound.push(`audit ${n} is not committed`);
      step();
      continue;
    }
    if (gitBlobOid(Buffer.from(lf(text), 'utf8')) !== versions.at(-1).oid) unbound.push(`audit ${n} has uncommitted edits`);
    const recCommit = versions[0].c;
    const barCommit = barCommits.find((c) => witness.blobAt(c, BAR_REL) === barBlob) || null;
    const anc = barCommit && barCommit !== recCommit ? witness.isAncestor(barCommit, recCommit) : false;
    if (anc === null) v.push(violation('witness_unavailable', p, `merge-base --is-ancestor ${barCommit} ${recCommit}`));
    else if (!anc || witness.blobAt(recCommit, BAR_REL) !== barBlob) v.push(violation('bar_not_before_sample', p, barCommit ? `the bar ${barBlob.slice(0, 12)}… is not committed strictly before, and in force at, the sample commit ${recCommit.slice(0, 12)}` : 'the bar at this blob was never committed'));
    const texts = witness.readBlobs(versions.map((x) => x.oid));
    const parsed = versions.map((x) => {
      try {
        return JSON.parse(texts.get(x.oid));
      } catch {
        return null; // reported just below as witness_unavailable
      }
    });
    if (parsed.some((x) => x === null)) v.push(violation('witness_unavailable', p, 'a committed version cannot be read'));
    else {
      if (parsed.some((x) => drawSection(x) !== drawSection(rec))) v.push(violation('sample_rewritten', p, `the draw section differs from its first commit ${recCommit.slice(0, 12)}`));
      const breach = verdictBreach([...parsed, rec]);
      if (breach) v.push(violation('results_rewritten', p, `${breach} (verdicts are add-only; a FAIL is fixed by a new audit)`));
    }

    // structure, history, strata, reproduction
    const ids = rec.sample.map((x) => x.id);
    if (ids.length !== bar.sample_size || new Set(ids).size !== ids.length) {
      v.push(violation('sample_size_wrong', p, `${ids.length} ids (${new Set(ids).size} distinct), the bar says ${bar.sample_size}`));
      step();
      continue;
    }
    if (rec.seed !== auditSeed(bar.seed, n)) v.push(violation('seed_wrong', p, `seed ≠ auditSeed(bar.seed, ${n})`));
    const wantForced = n === 1 ? [] : prev ? prev.failed_ids : [];
    if (n > 1 && (!prev || !reauditAllowed(prev, prevRec, rec.population))) v.push(violation('reaudit_without_fail', p, `audit ${n - 1} is ${prev ? prev.state : 'unknown'}, not a FAIL or an invalidated PASS`));
    else if (!sameList(sorted(rec.forced), wantForced) || wantForced.some((x) => !ids.includes(x))) v.push(violation('failed_rows_not_forced', p, `forced ${JSON.stringify(rec.forced)} ≠ audit ${n - 1}'s failed rows ${JSON.stringify(wantForced)}`));
    if (fails >= 3 && !isStr(rec.operator_ruling)) v.push(violation('operator_ruling_missing', p, `audit ${n} follows ${fails} FAILs`));
    const recPop = new Map(rec.population.map((x) => [x.id, x]));
    const unmet = [];
    for (const r of required) {
      if (ids.includes(r)) continue;
      if (recPop.has(r)) unmet.push(`${r} (required, eligible, not sampled)`);
      else unbound.push(`required ${r} was not eligible when audit ${n} was drawn`);
    }
    const numMin = stratumOf(bar, 'numeric').min;
    const num = ids.filter((x) => recPop.get(x) && recPop.get(x).numeric).length;
    if (num < numMin) unmet.push(`numeric ${num} < ${numMin}`);
    const sampledArch = new Set(ids.flatMap((x) => (recPop.get(x) || {}).archetypes || []));
    for (const a of sorted(new Set(rec.population.flatMap((x) => x.archetypes)))) if (!sampledArch.has(a)) unmet.push(`archetype ${a}`);
    for (const x of ids) {
      const d = recPop.get(x);
      const c = curPop.get(x);
      const declared = (z) => stableStringify({ archetypes: z.archetypes, confirm: z.confirm, flags: z.flags, has_numeric_expression: z.has_numeric_expression, numeric: z.numeric });
      if (d && c && c.content_sha256 === d.content_sha256 && declared(c) !== declared(d)) unmet.push(`${x}: declared numeric / archetypes / flags / confirmations ≠ the table at the same content hash`);
    }
    if (unmet.length) v.push(violation('stratum_unmet', p, unmet.join(', ')));
    let again = null;
    try {
      again = stableStringify(drawSample({ bar, population: rec.population, required: rec.required, seed: rec.seed, forced: rec.forced }));
    } catch (err) {
      if (!(err instanceof AuditError)) throw err;
      again = null; // the record's own population cannot be drawn under this bar: reported just below
    }
    if (again !== stableStringify(rec.sample)) v.push(violation('sample_not_reproducible', p, again ? "the draw (ids, content hashes, strata) from the record's population, seed and forced rows differs" : "the record's population cannot be drawn under the bar"));
    for (const x of score.invalid) v.push(violation('result_invalid', p, x));
    step();
  }
  const latest = recs.at(-1);
  const sc = prev;
  Object.assign(counts, { latest: latest.n, agree: sc.agree, sampled: sc.sampled, numeric_disagreements: sc.numeric_disagreements, expert_rulings_against: sc.rulings_against });
  if (sc.state === 'fail') v.push(violation('audit_failed', latest.path, `agree ${sc.agree} / ${sc.sampled}, numeric disagreements ${sc.numeric_disagreements}${latest.n >= 3 ? '; the operator rules before any further audit' : '; fix, then a new full audit'}`));
  if (v.length) return done();
  if (unbound.length) return done(`${unbound.join('; ')} (an on-demand gate counts as run only on a committed record bound to the current rows)`);
  if (sc.state === 'pending') return done(`audit ${latest.n} awaits ${sc.missing.length ? `results (${sc.missing.length} owed)` : sc.invalid.length ? 'valid results' : `resolution of ${sc.unresolved.length} disagreement(s)`} — pending never fails a gate`);
  const moved = passInvalidated(latest.rec, population);
  if (moved.length) return done(`the PASS of audit ${latest.n} is invalidated: sampled row content changed (${moved.slice(0, 5).join(', ')}${moved.length > 5 ? ', …' : ''}); a new full audit follows`);
  return done();
}

/** The audit witness (git-witness.mjs): -z, commit ids only, null on any git failure (fail closed). */
export const gitAuditWitness = gitWitness;

// ---------------------------------------------------------------- self-test

/** Every reason code: a known-bad fixture that fails for exactly it + a good twin that passes. */
export function selfTest() {
  const results = [];
  for (const f of auditFixtures()) {
    let r;
    try {
      r = checkAudit(f.input);
    } catch (err) {
      results.push({ name: f.name, expected: f.reason, twin_of: f.twin_of || null, got: [`threw: ${err && err.message}`], ok: false });
      continue;
    }
    const got = [...new Set(r.violations.map((x) => x.code))];
    const ok = f.reason === null ? r.status === 'pass' : r.status === 'fail' && got.length === 1 && got[0] === f.reason;
    results.push({ name: f.name, expected: f.reason, twin_of: f.twin_of || null, got, ok });
  }
  for (const c of REASON_CODES) if (!results.some((x) => x.expected === c)) results.push({ name: `fixture for ${c}`, expected: c, twin_of: null, got: [], ok: false });
  return { pass: results.length > 0 && results.every((x) => x.ok), results };
}
