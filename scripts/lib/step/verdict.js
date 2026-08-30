/**
 * The validator core + the ROW-DERIVED verdict cascade.
 *
 * Spec 122 §7.1: "the verdict cascade is computed once, in the library, from the
 * rows — never a parallel boolean." Spec 48 §3.6/§3.7 is the observability
 * contract the rows themselves must satisfy: one row per check, `{metric, value,
 * threshold, status}`, and the verdict READ OFF those rows.
 *
 * ⚠️ THE ONE INVARIANT THIS FILE EXISTS FOR: a check the library could not
 * evaluate NEVER reads as PASS. Not-reported, errored, and unsupported-limit all
 * resolve to the check's DECLARED severity, so an unevaluated FAIL check reddens
 * the verdict exactly as a violated one does. This is the Spec 121 §12b.6
 * "green because it never looked" class, closed structurally rather than by
 * remembering to look.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §7.1
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §4.1 ㉙
 */
'use strict';

/** Verdict lattice. INFO never drives a verdict — it is orthogonal to the cascade. */
const SEVERITY_RANK = { PASS: 0, INFO: 0, WARN: 1, FAIL: 2 };

/**
 * Which checks run under the current chain (Spec 122 §1.7 — `sharing` is the
 * SECOND classification axis). `assert_schema` is shared ×3: permits validates
 * permit columns, sources validates the source archives.
 *
 * `sharing.varies_by_chain.checks === 'none'` means the step runs the same set
 * everywhere, so the per-check `chains` field is inert — declared, not applied.
 * A standalone run (no chain) runs EVERYTHING: a chain filter that silently
 * narrows an operator's manual run is how a check stops being run at all.
 *
 * @param {object} descriptor
 * @param {string|null} chainId
 * @returns {object[]} the selected checks, in declaration order
 */
function selectChecks(descriptor, chainId) {
  const checks = Array.isArray(descriptor.checks) ? descriptor.checks : [];
  const perChain = descriptor.sharing
    && descriptor.sharing.varies_by_chain
    && descriptor.sharing.varies_by_chain.checks === 'per_chain';
  if (!perChain || !chainId) return checks.slice();
  return checks.filter((c) => c.chains === 'all' || (Array.isArray(c.chains) && c.chains.includes(chainId)));
}

/**
 * The audit-table `phase`, from `sharing.varies_by_chain.phase` — an EXPLICIT
 * MAP, never a ternary (§1.7: link_parcels' two ternaries disagree with each
 * other on the same axis in the same file; a map cannot disagree with itself).
 */
function resolvePhase(descriptor, chainId) {
  const map = descriptor.sharing
    && descriptor.sharing.varies_by_chain
    && descriptor.sharing.varies_by_chain.phase;
  if (!map || map === 'none' || typeof map !== 'object') return 0;
  if (chainId && Object.prototype.hasOwnProperty.call(map, chainId)) return map[chainId];
  const values = Object.values(map);
  // Standalone: unambiguous only when every chain agrees.
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : 0;
}

const VIOL_RE = /^viol (==|<=) (\d+)$/;
/**
 * LG-5 — the pct form, landed at the INGESTOR pilot (Spec 122 §1.4 growth wave).
 *
 * `>=` ADDED AT THE MATCHER PILOT (2026-08-28) — a genuine library gap, closed per
 * Spec 124 §7 rung (d): `limit_from_config`'s substitution is unconditional (the
 * resolved config number replaces the limit string's trailing number verbatim,
 * `resolveLimit` above), so a config-driven PERCENTAGE FLOOR (link_wsib's link-rate
 * WARN — the metric must read >= the operator-set percentage, not <=) had no
 * expressible form: `pct <=` compares the wrong direction, `viol <=`/`viol ==` compare
 * a COUNT not a percentage-with-the-SAME-config-number-substituted, and `pop >=` is
 * unimplemented (unevaluable). Symmetric with `pct <=` in every other respect —
 * same substitution mechanism, same reported field (`observation.value`).
 */
const PCT_RE = /^pct (<=|>=) ([0-9]*\.?[0-9]+)$/;
/**
 * R-T addendum (Ask 2, Fold A-4b) — `invariants[]`/`plausibility[]`'s two additions
 * to `checks[].limit`'s grammar (both now shared via `definitions.bound`, checks[]
 * included). Compare a RAW MEASURED VALUE, not a violation count/pct/ratio — needed
 * for e.g. `pb_rows` sanity or `link_rate_pct` read as a value, not a violation
 * count. Landed here (commit 2), not commit 1 (schema-shape only).
 */
const VALUE_MIN_RE = /^value_min (-?[0-9]*\.?[0-9]+)$/;
const VALUE_MAX_RE = /^value_max (-?[0-9]*\.?[0-9]+)$/;
/** The numeric a `limit_from_config` substitution replaces: the LAST number in the form. */
const LIMIT_NUMBER_RE = /[0-9]*\.?[0-9]+(?=\s*(?:x median)?$)/;

/**
 * Ruling A-4 — a bound that is ALSO an operator knob.
 *
 * `checks[].limit` carries the SEED DEFAULT so a descriptor read on its own still
 * states a bound; `checks[].limit_from_config` names the logic variable whose
 * RESOLVED value replaces that number at runtime. Substituting before the row is
 * built is what makes the audit row's `threshold` column show THE VALUE IN FORCE
 * rather than a literal that drifted from the registry — at zero extra bytes, since
 * the same value is already stamped in `records_meta.config`.
 *
 * A declared name missing from the resolved config falls back to the literal rather
 * than throwing: `scripts/lib/step/config.js` has already refused an unregistered
 * name, so reaching here with a gap means the check was not selected for this chain.
 *
 * @param {object} check
 * @param {Record<string, number>|null} config - `ctx.config`
 */
function resolveLimit(check, config) {
  if (!check.limit_from_config || !config || typeof check.limit !== 'string') return check.limit;
  const value = config[check.limit_from_config];
  if (typeof value !== 'number' || !Number.isFinite(value)) return check.limit;
  return check.limit.replace(LIMIT_NUMBER_RE, String(value));
}

/**
 * Evaluate one declared `limit` against a reported observation.
 *
 * Implemented: the `viol` forms, `pct <= <n>`, and the `{warn, fail}` object.
 * `pop`/`ratio` are NOT silently tolerated: they return `unevaluable`, which
 * resolves to the declared severity upstream.
 *
 * ⚠️ `pct` READS `observation.value`, NOT a violation count. A percentage check
 * reports the measured ratio itself, so `violations` is left undefined and the row's
 * rendered value is the ratio. Reporting BOTH would make the bound compare against
 * a 0/1 flag while the row displayed a ratio — a threshold column that does not
 * describe the comparison that was made.
 *
 * @param {string|{warn:number,fail:number}} limit
 * @param {{violations?:number, value?:number}} observation
 * @returns {{ok:boolean}|{unevaluable:string}}
 */
function evaluateLimit(limit, observation) {
  const measured = Number.isFinite(observation.violations)
    ? observation.violations
    : (Number.isFinite(observation.value) ? observation.value : null);

  if (limit && typeof limit === 'object') {
    if (measured === null) return { unevaluable: 'no numeric observation for warn/fail thresholds' };
    if (measured >= limit.fail) return { ok: false, escalate: 'FAIL' };
    if (measured >= limit.warn) return { ok: false, escalate: 'WARN' };
    return { ok: true };
  }

  const pct = typeof limit === 'string' ? limit.match(PCT_RE) : null;
  if (pct) {
    if (measured === null) return { unevaluable: 'check reported no numeric ratio' };
    const bound = Number(pct[2]);
    return { ok: pct[1] === '>=' ? measured >= bound : measured <= bound };
  }

  // R-T addendum (Ask 2, Fold A-4b) — value_min/value_max read observation.value
  // DIRECTLY, never falling back through `measured`'s violations-first preference:
  // the whole point of this form is "the raw measured value", not a violation count.
  const valueMin = typeof limit === 'string' ? limit.match(VALUE_MIN_RE) : null;
  if (valueMin) {
    if (!Number.isFinite(observation.value)) return { unevaluable: 'check reported no numeric value for value_min' };
    return { ok: observation.value >= Number(valueMin[1]) };
  }

  const valueMax = typeof limit === 'string' ? limit.match(VALUE_MAX_RE) : null;
  if (valueMax) {
    if (!Number.isFinite(observation.value)) return { unevaluable: 'check reported no numeric value for value_max' };
    return { ok: observation.value <= Number(valueMax[1]) };
  }

  const m = typeof limit === 'string' ? limit.match(VIOL_RE) : null;
  if (!m) return { unevaluable: `limit form not implemented in S2-min: ${JSON.stringify(limit)}` };
  if (measured === null) return { unevaluable: 'check reported no violation count' };
  const bound = Number(m[2]);
  return { ok: m[1] === '==' ? measured === bound : measured <= bound };
}

/**
 * Turn one declared check + its reported observation into ONE audit row.
 *
 * `execution.on_check_error` governs the errored case (Spec 122 §1.6 — today a
 * check query that throws is silently omitted, so a dropped table is
 * indistinguishable from a healthy one). `omit_row` returns null and the caller
 * drops it; that is the DECLARED fiction, visible in the descriptor with a why,
 * not an accident in the code.
 *
 * @param {object} check - a descriptor `checks[]` entry
 * @param {object|undefined} observation - `{violations?, value?, detail?, error?}`
 * @param {string} onCheckError - `fail_step` | `warn_row` | `omit_row`
 * @param {Record<string, number>|null} [config] - `ctx.config`, for `limit_from_config`
 * @returns {{metric:string,value:*,threshold:*,status:string}|null}
 */
function checkRow(check, observation, onCheckError, config = null) {
  const limit = resolveLimit(check, config);
  const threshold = typeof limit === 'string' ? limit : JSON.stringify(limit);
  // Fold B-3 (R-T addendum) — every row carries a `source` tag: 'check' for an
  // ordinary `checks[]` entry (the default — `checks[]` items declare no `source`
  // field of their own, so a consumer never has to guess), or the entry's own
  // declared `check|invariant|plausibility` for a synthetic invariants[]/
  // plausibility[] row (buildAuditTable passes it through on the check-shaped
  // object it builds). Lets a consumer reading only the emitted audit table (not
  // the descriptor) tell DATA rows from PROCESS rows without re-deriving it from
  // array membership.
  const row = (value, status) => ({ metric: check.id, value, threshold, status, source: check.source || 'check' });

  if (observation && observation.error !== undefined && observation.error !== null) {
    const msg = observation.error instanceof Error ? observation.error.message : String(observation.error);
    if (onCheckError === 'omit_row') return null;
    if (onCheckError === 'warn_row') return row(`check errored: ${msg}`, 'WARN');
    return row(`check errored: ${msg}`, check.severity === 'INFO' ? 'INFO' : check.severity);
  }

  if (observation === undefined || observation === null) {
    // NOT reported by compute. Never PASS — see the file header.
    return row('not reported by compute', check.severity === 'INFO' ? 'INFO' : check.severity);
  }

  const verdict = evaluateLimit(limit, observation);
  if (verdict.unevaluable) {
    return row(`unevaluable: ${verdict.unevaluable}`, check.severity === 'INFO' ? 'INFO' : check.severity);
  }
  const observed = observation.detail !== undefined
    ? observation.detail
    : (Number.isFinite(observation.violations) ? observation.violations : observation.value);
  if (verdict.ok) return row(observed, check.severity === 'INFO' ? 'INFO' : 'PASS');
  return row(observed, verdict.escalate || check.severity);
}

/** LM-D16 — `errors[]`'s cap: bounded so one large `detail` cannot make the array unbounded. */
const RENDER_VALUE_MAX_LENGTH = 300;

/**
 * Recursively sort object keys so the same value always serializes the same way,
 * regardless of the property insertion order at the call site that built it.
 * Arrays keep their order (order is meaningful there); only object keys sort.
 */
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeysDeep(value[key]);
    return sorted;
  }
  return value;
}

/**
 * LM-D16 — render a check row's `value` for interpolation into a human-readable
 * message (`errors[]`, and anywhere else in this file a row value is stringified).
 *
 * Primitives (string/number/boolean/null/undefined) render via `String`, unchanged
 * from before. Objects/arrays — `checkRow` (§171-173) prefers `observation.detail`
 * as the row value, and 9 sites across `scripts/lib/compute/*.js` report an
 * OBJECT-valued `detail` — render as JSON with keys sorted recursively (§sortKeysDeep),
 * so the same shape always produces the same string. A naive template-literal
 * interpolation (`${row.value}`) stringifies an object via `Object.prototype.toString`
 * and silently loses the value as the literal text "[object Object]"; this is the
 * one and only place that stringification happens.
 *
 * Capped at `RENDER_VALUE_MAX_LENGTH` so a single check with a large `detail`
 * cannot make `errors[]` unbounded.
 *
 * @param {*} value
 * @param {number} [maxLength]
 * @returns {string}
 */
function renderValue(value, maxLength = RENDER_VALUE_MAX_LENGTH) {
  const rendered = value !== null && typeof value === 'object'
    ? JSON.stringify(sortKeysDeep(value))
    : String(value);
  return rendered.length > maxLength ? `${rendered.slice(0, maxLength)}…` : rendered;
}

/**
 * THE cascade. Row-derived, and the only place a verdict is ever computed.
 * `{PASS, WARN, FAIL}` are all reachable from rows alone — claim #28.
 *
 * @param {Array<{status:string}>} rows
 * @returns {'PASS'|'WARN'|'FAIL'}
 */
function deriveVerdict(rows) {
  let worst = 0;
  for (const r of rows || []) worst = Math.max(worst, SEVERITY_RANK[r.status] ?? 0);
  return worst === 2 ? 'FAIL' : worst === 1 ? 'WARN' : 'PASS';
}

/**
 * Build the audit_table for a set of checks + observations.
 *
 * LPA-D6 (WF3-C, 2026-08-29) — `errors[]` and `warnings[]` are SEVERITY-SEPARATED,
 * never one conflated array: a FAIL row renders into `errors[]`, a WARN row renders
 * into `warnings[]`. Before this fix a single `errors[]` array held BOTH, and the
 * caller's `checks_failed: built.errors.length` therefore counted WARN rows as
 * failures — measured live (`link_parcel_addresses` forced-FULL, 2026-08-29):
 * `checks_failed: 1` on a run whose verdict was WARN with ZERO FAIL rows
 * (`parcel_fanout_outliers: 130`, severity WARN). `scripts/quality/assert-data-bounds.js`
 * (still hand-rolled, never converted) already emits exactly this split
 * (`errors`/`warnings`, `checks_failed`/`checks_warned`) — this brings the generic
 * library's shape to parity with that established, un-converted precedent rather
 * than inventing a new one.
 *
 * R-T addendum (Fold A-2, BLOCKING correction, commit 3) — `synthetic` carries
 * declared `invariants[]`/`plausibility[]` entries (already narrowed by `when`/
 * `frequency` by the caller — `scripts/lib/step/plausibility.js#runValidatorEntries`)
 * as check-shaped objects + their observations. They run through this SAME loop,
 * not a parallel path: `errors[]`/`warnings[]`/`blockingFailures`/`checks_failed`
 * populate for a synthetic FAIL exactly as they do for a real `checks[]` FAIL — the
 * bug class this correction closes is `extraRows` (LR-D2/R-A's own use, unchanged
 * above) silently NOT reaching those arrays, the same class as LPA-D6.
 *
 * `only` (a checks[]-id Set) is NOT applied to `synthetic` — a synthetic entry's id
 * lives in a different space, so re-filtering would wrongly drop every one of them
 * whenever `only` is non-null. The caller narrows synthetic entries itself, by `when`.
 *
 * @param {{checks?:object[], observations?:Record<string,object>}|null} [synthetic]
 * @returns {{audit_table:object, rows:object[], blockingFailures:string[], errors:string[], warnings:string[]}}
 */
function buildAuditTable(descriptor, chainId, observations, extraRows = [], config = null, only = null, synthetic = null) {
  const onCheckError = (descriptor.execution && descriptor.execution.on_check_error) || 'fail_step';
  // `only` narrows the scored set to a LIFECYCLE-REACHABLE subset — a gated skip
  // scores the `when: "pre"` checks and nothing else, because a post-write check
  // that was never reachable must not read as "not reported by compute" at its
  // declared severity. Null means score everything the chain selects.
  const selected = selectChecks(descriptor, chainId).filter((c) => !only || only.has(c.id));
  const rows = [];
  const blockingFailures = [];
  const errors = [];
  const warnings = [];
  for (const check of selected) {
    const row = checkRow(check, observations ? observations[check.id] : undefined, onCheckError, config);
    if (!row) continue;
    rows.push(row);
    // LPA-D6 — severity-separated, never one conflated array (see the header note).
    if (row.status === 'FAIL') errors.push(`${check.id}: ${renderValue(row.value)}`);
    else if (row.status === 'WARN') warnings.push(`${check.id}: ${renderValue(row.value)}`);
    if (row.status === 'FAIL' && check.blocking === true) blockingFailures.push(check.id);
  }
  const syntheticChecks = (synthetic && Array.isArray(synthetic.checks)) ? synthetic.checks : [];
  const syntheticObservations = (synthetic && synthetic.observations) || {};
  // Bound-doctrine criterion 1 (Design decisions: "a query error is a distinct FAIL,
  // never folded into the bound") — `omit_row` would silently DROP a query-error row,
  // which criterion 1 explicitly forbids for invariants[]/plausibility[] regardless of
  // the descriptor's own checks[]-scoped `on_check_error` setting.
  const syntheticOnCheckError = onCheckError === 'omit_row' ? 'warn_row' : onCheckError;
  for (const check of syntheticChecks) {
    const row = checkRow(check, syntheticObservations[check.id], syntheticOnCheckError, config);
    if (!row) continue;
    rows.push(row);
    if (row.status === 'FAIL') errors.push(`${check.id}: ${renderValue(row.value)}`);
    else if (row.status === 'WARN') warnings.push(`${check.id}: ${renderValue(row.value)}`);
    if (row.status === 'FAIL' && check.blocking === true) blockingFailures.push(check.id);
  }
  rows.push(...extraRows);
  return {
    rows,
    blockingFailures,
    errors,
    warnings,
    audit_table: {
      phase: resolvePhase(descriptor, chainId),
      name: descriptor.identity.display_name,
      verdict: deriveVerdict(rows),
      rows,
    },
  };
}

module.exports = {
  SEVERITY_RANK,
  selectChecks,
  resolvePhase,
  resolveLimit,
  evaluateLimit,
  checkRow,
  deriveVerdict,
  buildAuditTable,
  renderValue,
};
