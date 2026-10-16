'use strict';
// scripts/lib/step/producer.js
//
// S1-P-2 — THE producer library (purity seam S1-P). Two pure-ish primitives:
//
//   makeProducer({ pool, chains })  — a `slug -> run-history` reader built ON
//     `readRunHistory` (the one run-history reader, S1-R). ONE call in,
//     `sid = rows[0].id` out. It NEVER throws: Rule 10 (124:129) says a
//     producer-contract violation is a DECLARED check row through
//     `deriveVerdict` — never a compute throw, never a parallel boolean.
//     So a `readRunHistory` error is CAUGHT here and returned as
//     `reason: 'ERROR'`; the caller (the runner/evaluator) turns it into a row.
//
//   evaluatePins(pins, resultsBySlug)  — PURE. Evaluates the descriptor's
//     `staleness.pins[]` against `producer()` results and returns one check ROW
//     per evaluated pin. A violation is one FAIL row; no `halt` field is ever
//     written and nothing reads one (Rule 10 — the row flows through
//     `deriveVerdict` like every other declared check).
//
// Declared pins RE-FREEZE #34 (design §3): the pin item is the EXISTING schema
// shape (`{step, stamp, equals?, op?, why?}`), EXTENDED with the closed `op`
// set — no second `pins` shape. `op` defaults to `equals`, so every existing
// pin stays valid.
//
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ G1/G12, R-CB;
//            docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6 (LDG-10)
//
// S1-P-6a (Spec 124 Rule 1 / R-BZ G9; Fold 1 item 2 of the S1-P producer design):
// a pin may carry a `bound` over TWO producer stamps instead of an `op`/`equals`
// predicate — `bound: "pct <= N"` plus `of: records_meta.<denominator>` — with the
// limit optionally taken from a declared logic variable (`limit_from_config`). The
// `op` set stays CLOSED (`bound` adds no op): the pin evaluator
// DERIVES the ratio `100 * <stamp> / <of>` and hands it to the EXISTING
// `verdict.js` `resolveLimit` + `evaluateLimit` — the one pct grammar estate-wide,
// never a second one. The ravines `MAX_INVALID_GEOM_RATIO = 0.05` function-scope
// literal is the founding case. (`not_failed`, CP-S1 #12c 2026-10-14, is the one later op.)

// A cycle-safe require: `verdict.js` requires NOTHING, so this cannot re-open the
// `ledger.js` <-> `step/index.js` load cycle the lazy-require note above documents.
const { resolveLimit, evaluateLimit } = require('./verdict');

/**
 * The CLOSED op set (Fold 1 item 3). An `op` outside this set is an ERROR row,
 * never a silent fall-through — an unpinned predicate would be an undeclared
 * check, exactly what R-BZ G1/G12 forbid.
 * `not_failed` (CP-S1 #12c, operator 2026-10-14; RE-FREEZE) is the one op that reads the producer
 * RUN's status instead of a records_meta stamp: valid only on stamp `pipeline_runs.status` (schema),
 * FAIL when the pin's declared run has status `failed`.
 * @type {readonly string[]}
 */
const PIN_OPS = Object.freeze(['equals', 'nonzero', 'true', 'not_failed']);

/**
 * The CLOSED read kinds (Fold 1 item 1). Only `baseline` takes
 * `readRunHistory`'s default status set; `activity` and `verdict` declare their
 * own wider closed set. Recorded here so the descriptor's vocabulary is a
 * single frozen list, not a string repeated in prose.
 * @type {readonly string[]}
 */
const PRODUCER_READS = Object.freeze(['baseline', 'activity', 'verdict']);

/**
 * The CLOSED terminal-status set a verdict / activity read accepts (R-CB): every status a finished run can carry. Equals the
 * `statuses` item enum of `staleness.pins[]` in step.schema.json (locked by a test). `running`, `skipped`, `self_skipped` are NOT terminal.
 */
const TERMINAL_STATUSES = Object.freeze(['completed', 'completed_with_warnings', 'completed_with_errors', 'failed', 'crashed', 'cancelled']);

/**
 * Build the producer reader for a step.
 *
 * @param {{pool: {query: (sql: string, params: unknown[]) => Promise<{rows: object[]}>}, chains?: string[]}} deps
 * @returns {(slug: string, opts?: object) => Promise<object>} `producer(slug, opts)`
 */
function makeProducer({ pool, chains = [] }) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('makeProducer: `pool` with a `query(sql, params)` function is REQUIRED');
  }

  /**
   * The run-history read for ONE slug, shaped for pin evaluation.
   *
   * Pass-through of `readRunHistory` opts. ONLY keys that are not `undefined`
   * are forwarded — so `readRunHistory`'s own defaults (status set, orderBy,
   * limit, warn-skip) apply when a caller does not name them.
   *
   * @param {string} slug
   * @param {{chains?:string[], statuses?:string[] | 'terminal', orderBy?:string, excludeWarnSkip?:boolean,
   *          completedSince?:Date|string|number, metaObject?:string, limit?:number, onError?:'throw'}} [opts]
   * @returns {Promise<{slug:string, forms:string[], reason:'FOUND'|'MISSING'|'ERROR',
   *          sid:number|null, status:string|null, started_at:string|null,
   *          completed_at:string|null, records_meta:object|null, rows:object[],
   *          audit_outcome:string|null, error?:string}>}
   */
  return async function producer(slug, rawOpts) {
    const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
    // Lazy require INSIDE the function: `scripts/lib/ledger.js` requires
    // `step/index.js` lazily and `step/index.js` re-exports this module, so a
    // TOP-LEVEL require of the sibling ledger here would re-open the load cycle
    // `ledger.js` documents (see its lazy-require note).
    // eslint-disable-next-line global-require
    const { readRunHistory } = require('./ledger');

    // Build the opts object CONDITIONALLY: an explicitly-`undefined` key would
    // defeat `readRunHistory`'s defaults (it branches on `=== undefined`).
    const readOpts = { slug };
    const chainList = opts.chains === undefined ? chains : opts.chains;
    if (chainList !== undefined) readOpts.chains = chainList;
    if (opts.statuses !== undefined) readOpts.statuses = opts.statuses === 'terminal' ? [...TERMINAL_STATUSES] : opts.statuses;
    if (opts.orderBy !== undefined) readOpts.orderBy = opts.orderBy;
    if (opts.excludeWarnSkip !== undefined) readOpts.excludeWarnSkip = opts.excludeWarnSkip;
    if (opts.completedSince !== undefined) readOpts.completedSince = opts.completedSince;
    if (opts.metaObject !== undefined) readOpts.metaObject = opts.metaObject;
    if (opts.limit !== undefined) readOpts.limit = opts.limit;
    // A producer window wants exactly 1 row; a caller may widen it explicitly.
    if (readOpts.limit === undefined) readOpts.limit = 1;
    // The producer contract reads exactly the fields it projects. `records_meta`
    // is VERBATIM — there is no jsonb projection (design §2, keep-simple note).
    readOpts.columns = ['id', 'status', 'started_at', 'completed_at', 'records_meta'];

    let res;
    try {
      res = await readRunHistory(pool, readOpts);
    } catch (err) {
      // A HOOK read that must fail closed (the pre-S1-P behaviour: the pool.query rejection propagated) opts in
      // with { onError: 'throw' } — the rethrow is the LIBRARY's, so compute holds no throw (R-BZ G8). Pin reads
      // (measureProducerPins) never pass it: there an error is a row (Rule 10).
      if (opts.onError === 'throw') throw err;
      // Rule 10: NEVER rethrow by default — an error is a row, not a throw.
      return {
        slug,
        forms: [],
        reason: 'ERROR',
        error: err && err.message ? err.message : String(err),
        sid: null,
        status: null,
        started_at: null,
        completed_at: null,
        records_meta: null,
        rows: [],
        audit_outcome: null,
      };
    }

    const rows = (res && Array.isArray(res.rows)) ? res.rows : [];
    const forms = (res && Array.isArray(res.forms)) ? res.forms : [];

    if (rows.length === 0) {
      // Null-vs-absent: every field `null`, NEVER `undefined` — a consumer's
      // `!==` must not misread "absent" as "present".
      return {
        slug,
        forms,
        reason: 'MISSING',
        sid: null,
        status: null,
        started_at: null,
        completed_at: null,
        records_meta: null,
        rows: [],
        audit_outcome: null,
      };
    }

    const r = rows[0];
    return {
      slug,
      forms,
      reason: 'FOUND',
      sid: r.id,
      status: r.status,
      started_at: r.started_at === undefined ? null : r.started_at,
      completed_at: r.completed_at === undefined ? null : r.completed_at,
      records_meta: r.records_meta || {},
      // The run's own recorded audit verdict, passed through verbatim for a compute that may not spell the property (compute-no-verdict-derivation). Derives NOTHING.
      audit_outcome: (r.records_meta && r.records_meta.audit_table && typeof r.records_meta.audit_table.verdict === 'string') ? r.records_meta.audit_table.verdict : null,
      rows,
    };
  };
}

/**
 * Walk a dotted `records_meta` path (e.g. `ravine_load.spec_version`) through
 * OWN properties only. Absent at ANY level → `present: false` (an absent path
 * is a producer-contract violation, `MISSING` — never an ERROR).
 *
 * @param {object|null|undefined} recordsMeta
 * @param {string} stamp - dotted path (`a.b.c`)
 * @returns {{present: boolean, value: *}}
 */
function readPath(recordsMeta, stamp) {
  if (recordsMeta === null || typeof recordsMeta !== 'object') return { present: false, value: undefined };
  if (typeof stamp !== 'string' || stamp.length === 0) return { present: false, value: undefined };
  // The schema's stamp form is `records_meta.<dotted>` (step.schema.json staleness.pins); the walk starts
  // INSIDE records_meta, so that leading segment is dropped (a bare `<dotted>` path is accepted too).
  const path = stamp.startsWith('records_meta.') ? stamp.slice('records_meta.'.length) : stamp;
  let cur = recordsMeta;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, seg)) {
      return { present: false, value: undefined };
    }
    cur = cur[seg];
  }
  return { present: true, value: cur };
}

/**
 * Evaluate ONE pin's predicate against an observed value.
 * @returns {'PASS'|'FAIL'|'ERROR'}
 */
function evalPredicate(op, value, pin) {
  if (op === 'equals') {
    return String(value) === pin.equals ? 'PASS' : 'FAIL';
  }
  if (op === 'nonzero') {
    // One op, no type branching the caller has to reason about: a number must be
    // non-zero, a string non-empty. null/undefined/''/0 all FAIL.
    if (typeof value === 'number') return value !== 0 ? 'PASS' : 'FAIL';
    if (typeof value === 'string') return value.length > 0 ? 'PASS' : 'FAIL';
    return 'FAIL';
  }
  if (op === 'true') {
    return value === true ? 'PASS' : 'FAIL';
  }
  return 'ERROR';
}

/**
 * The pin's human predicate text, e.g. `ravine_load.spec_version equals "3"`.
 * @returns {string}
 */
function predicateText(pin, op) {
  if (op === 'equals') return `${pin.stamp} equals ${JSON.stringify(pin.equals)}`;
  return `${pin.stamp} ${op}`;
}

/**
 * PURE. Evaluate the descriptor's `staleness.pins[]` against producer results.
 *
 * Only pins that declare `op`, `equals` OR `bound` are evaluated — a bare
 * watermark stamp (`<table>.<column>` with none of the three) is compared
 * ELSEWHERE and is skipped here.
 *
 * An `op`/`equals` pin reads ONE stamp. A `bound` pin (S1-P-6a) reads TWO —
 * `stamp` over `of` — and compares `100 * num / den` against the pct bound, the
 * number optionally resolved from `config[pin.limit_from_config]`.
 *
 * @param {Array<{step:string, stamp:string, equals?:string, op?:'equals'|'nonzero'|'true',
 *          bound?:string, of?:string, limit_from_config?:string}>} pins
 * @param {Record<string, object>} resultsBySlug - `pin.step` → `producer()` result
 * @param {Record<string, number>} [config] - the runner's RESOLVED logic-variable map
 *          (`name` → number); a missing/absent value is an ERROR row, never a throw
 * @returns {Array<object>} one row per EVALUATED pin
 */
function evaluatePins(pins, resultsBySlug, config) {
  const out = [];
  const seen = new Map();
  const uniqueMetric = (base) => {
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  };
  const list = Array.isArray(pins) ? pins : [];
  const bySlug = resultsBySlug && typeof resultsBySlug === 'object' ? resultsBySlug : {};
  const cfg = config && typeof config === 'object' ? config : {};
  const sanitize = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]/g, '_');

  for (const pin of list) {
    if (!pin || typeof pin !== 'object') continue;
    // A watermark pin (no `op`, no `equals`, no `bound`) is not a pin WE evaluate — skip.
    if (pin.op === undefined && pin.equals === undefined && pin.bound === undefined) continue;

    // `bound` is NOT an `op` — the closed op set is untouched; the derived-ratio
    // arm is selected here, before the closed-set membership test.
    const op = pin.bound !== undefined ? 'bound' : (pin.op === undefined ? 'equals' : pin.op);
    const res = bySlug[pin.step];
    const hasRes = res && typeof res === 'object';

    const producerRunId = hasRes && res.sid !== undefined ? res.sid : null;
    const producerStatus = hasRes && res.status !== undefined ? res.status : null;
    const producerCompletedAt = hasRes && res.completed_at !== undefined ? res.completed_at : null;

    const pinId = `${pin.step}.${pin.stamp}`;
    const predicate = op === 'bound'
      ? `${pin.stamp} / ${pin.of} (pct) ${String(pin.bound).replace(/^pct /, '')}`
      : predicateText(pin, op);

    let result;
    let observed = null;
    let note;
    let threshold = pin.equals !== undefined && pin.equals !== null ? pin.equals : op;
    let metricSuffix = op === 'equals' ? '' : `_${sanitize(op)}`;
    let limit;

    if (!hasRes || res.reason === undefined) {
      result = 'MISSING';
    } else if (res.reason === 'ERROR') {
      result = 'ERROR';
    } else if (res.reason === 'MISSING') {
      result = 'MISSING';
    } else if (op === 'bound') {
      // S1-P-6a — the ratio `100 * num / den`. An ABSENT / non-numeric stamp counts
      // as 0 (the legacy `Number(x) || 0` coercion this replaces), NEVER `MISSING`;
      // `den === 0` is vacuously within the bound (the legacy `featureCount > 0 &&`).
      const num = Number(readPath(res.records_meta, pin.stamp).value) || 0;
      const den = Number(readPath(res.records_meta, pin.of).value) || 0;
      const value = den > 0 ? (100 * num) / den : 0;
      limit = resolveLimit({ limit: pin.bound, limit_from_config: pin.limit_from_config }, cfg);
      metricSuffix = `_bound`;
      threshold = limit;
      if (pin.limit_from_config !== undefined && !Number.isFinite(cfg[pin.limit_from_config])) {
        result = 'ERROR';
        note = `${pinId}: logic variable ${pin.limit_from_config} did not resolve — ERROR`;
      } else {
        const ev = evaluateLimit(limit, { value });
        result = ev.unevaluable ? 'ERROR' : (ev.ok ? 'PASS' : 'FAIL');
        observed = value;
      }
    } else if (PIN_OPS.includes(op) === false) {
      result = 'ERROR';
    } else if (op === 'not_failed') {
      // The run's own status (the producer result's `status`), never a records_meta path.
      observed = producerStatus;
      result = producerStatus === 'failed' ? 'FAIL' : 'PASS';
    } else {
      const { present, value } = readPath(res.records_meta, pin.stamp);
      if (!present) {
        result = 'MISSING';
      } else {
        observed = value === undefined ? null : value;
        result = evalPredicate(op, value, pin);
      }
    }

    if (note === undefined) {
      if (result === 'ERROR' && !PIN_OPS.includes(op) && op !== 'bound') {
        note = `${pinId}: unknown op ${JSON.stringify(op)} — allowed ops are ${PIN_OPS.join(', ')} — ERROR`;
      } else {
        const who = hasRes
          ? `${pin.step} run ${producerRunId} (${producerStatus}${producerCompletedAt ? ' @ ' + producerCompletedAt : ''})`
          : `${pin.step} (no producer result)`;
        if (op === 'bound') {
          // Re-read the stamps ONLY for the note's operands — the row's `observed`
          // stays the scalar ratio (the `value` column is the measured ratio, as
          // `verdict.js`'s pct arm documents).
          const num = Number(readPath(res.records_meta, pin.stamp).value) || 0;
          const den = Number(readPath(res.records_meta, pin.of).value) || 0;
          note = `${who}: ${pin.stamp} ${num} / ${pin.of} ${den} = ${observed === null ? 0 : observed}% — expected ${limit} — ${result}`;
        } else {
          const shown = observed === null ? 'absent' : JSON.stringify(observed);
          const expect = op === 'equals'
            ? `expected ${JSON.stringify(pin.equals)}`
            : op === 'nonzero'
              ? 'expected non-empty'
              : op === 'not_failed'
                ? 'expected not failed'
                : 'expected true';
          note = `${who}: ${pin.stamp} = ${shown} — ${expect} — ${result}`;
        }
      }
    }

    out.push({
      // One metric per pin (audit rows are keyed by metric): producer_pin_<step>_<stamp>[_<op>], made
      // unique below — a sanitized name can collide (a.b_c vs a_b.c; the same stamp under two ops).
      metric: uniqueMetric(`producer_pin_${String(pinId).toLowerCase().replace(/[^a-z0-9_]/g, '_')}${metricSuffix}`),
      pin_id: pinId,
      predicate,
      observed,
      producer_run_id: producerRunId,
      producer_status: producerStatus,
      producer_completed_at: producerCompletedAt,
      result,
      status: result === 'PASS' ? 'INFO' : 'FAIL',
      value: observed,
      threshold,
      note,
    });
  }

  return out;
}

/**
 * The read-identity key for a pin: so the runner can issue ONE `producer()` read
 * per distinct `(step, statuses, meta_object)` and reuse it across pins.
 * @param {{step:string, statuses?:string[], meta_object?:string}} pin
 * @returns {string}
 */
function pinReadKey(pin) {
  return JSON.stringify([pin.step, pin.statuses || null, pin.meta_object || null]);
}

/**
 * The `producer()` opts a pin implies. `undefined` keys are DROPPED so
 * `readRunHistory`'s defaults apply.
 * @param {{statuses?:string[], meta_object?:string}} pin
 * @returns {{statuses?:string[], metaObject?:string}}
 */
function producerOptsForPin(pin) {
  const opts = {};
  if (pin.statuses !== undefined) opts.statuses = pin.statuses;
  if (pin.meta_object !== undefined) opts.metaObject = pin.meta_object;
  return opts;
}

module.exports = {
  PIN_OPS,
  PRODUCER_READS,
  TERMINAL_STATUSES,
  makeProducer,
  evaluatePins,
  readPath,
  pinReadKey,
  producerOptsForPin,
};
