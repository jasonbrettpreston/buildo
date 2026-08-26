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
/** LG-5 — the pct form, landed at the INGESTOR pilot (Spec 122 §1.4 growth wave). */
const PCT_RE = /^pct <= ([0-9]*\.?[0-9]+)$/;
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
    return { ok: measured <= Number(pct[1]) };
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
  const row = (value, status) => ({ metric: check.id, value, threshold, status });

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
 * @returns {{audit_table:object, rows:object[], blockingFailures:string[], errors:string[]}}
 */
function buildAuditTable(descriptor, chainId, observations, extraRows = [], config = null, only = null) {
  const onCheckError = (descriptor.execution && descriptor.execution.on_check_error) || 'fail_step';
  // `only` narrows the scored set to a LIFECYCLE-REACHABLE subset — a gated skip
  // scores the `when: "pre"` checks and nothing else, because a post-write check
  // that was never reachable must not read as "not reported by compute" at its
  // declared severity. Null means score everything the chain selects.
  const selected = selectChecks(descriptor, chainId).filter((c) => !only || only.has(c.id));
  const rows = [];
  const blockingFailures = [];
  const errors = [];
  for (const check of selected) {
    const row = checkRow(check, observations ? observations[check.id] : undefined, onCheckError, config);
    if (!row) continue;
    rows.push(row);
    if (row.status === 'FAIL' || row.status === 'WARN') errors.push(`${check.id}: ${row.value}`);
    if (row.status === 'FAIL' && check.blocking === true) blockingFailures.push(check.id);
  }
  rows.push(...extraRows);
  return {
    rows,
    blockingFailures,
    errors,
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
};
