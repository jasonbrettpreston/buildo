/**
 * The plausibility gate-mapping policy + distribution-scan mechanism.
 *
 * EXTRACTED VERBATIM from `scripts/analysis/parcel-sanity-audit.js` (R-T addendum,
 * Spec 124 §2 Rule 13, WF2 "The Step Validator, Data-First", commit 2). That file
 * now re-imports `statusFor`/`verdictCascade` from here rather than defining them
 * locally — one copy of the gate-mapping policy, not a second one forked for the
 * new `invariants[]`/`plausibility[]` categories (Fold A-4d: "extract once, both
 * sides import" — the same discipline used for `statusFor`/`verdictCascade` is
 * applied here to `parcel-sanity-audit.js`'s DIST_FIELDS distribution scan too,
 * Fold B-7).
 *
 * `runDistributionScan` is exported so a future `plausibility[].kind:"distribution"`
 * row type (Fold B-7, wiring decided at commit 7) can call it directly instead of
 * re-implementing the per-zone-outlier percentile logic. It hardcodes `FROM parcels`
 * — matching the ONE caller this scan has today (`parcel-sanity-audit.js`'s own
 * `runSanity`) — because genericizing it onto an arbitrary table is not this
 * commit's scope; a future caller needing a different table is Fold B-7's own
 * "commit 7 records the wiring decision", not assumed here.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 13 (R-T addendum)
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6 (row-derived verdict cascade)
 */
'use strict';

// sev/gate → audit-row status (Spec 48 §3.6, data-driven — NO per-check-id branching):
//   inert (pop === 0) → INFO · gated + violated → FAIL · INFO check → INFO · violated → WARN · else PASS.
// D-E 4 (WF3 Phase 1): a check whose POPULATION is empty proves nothing — it reads INFO 'inert', never
// a green PASS (day-one customers: the vacated below-floor range, ravine_constrained pre-re-run).
// `pop` is optional (undefined = population unknown, e.g. the unit-altitude calls) — only an explicit 0 is inert.
function statusFor(check, viol, pop) {
  if (pop === 0) return 'INFO';
  return check.gate && viol > 0 ? 'FAIL' : check.sev === 'INFO' ? 'INFO' : viol > 0 ? 'WARN' : 'PASS';
}

// Row-derived verdict cascade (Spec 48 §3.6) — co-located with the sanity policy so the pipeline step
// imports it rather than adding a 5th copy of the generic helper.
function verdictCascade(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

// buildDistributionQuery — the exact SQL `parcel-sanity-audit.js`'s inline `distQ` closure built,
// parameterised on the residential-scope predicate and the zone-class bucket expression (both were
// already parcel-sanity-audit-local constants, RES/ZC, now passed in rather than closed over).
function buildDistributionQuery(resScope, zoneExpr, field) {
  return `
    WITH base AS (SELECT id, (${zoneExpr}) AS zc, (${field.expr})::float8 AS f FROM parcels WHERE ${resScope} AND (${field.expr}) IS NOT NULL),
    stats AS (SELECT zc, percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med,
                     percentile_cont(0.99) WITHIN GROUP (ORDER BY f) AS p99 FROM base GROUP BY zc)
    SELECT count(*)::int AS viol, (array_agg(b.id ORDER BY b.f DESC, b.id))[1:6] AS samples,
           round(max(b.f)::numeric, 2) AS worst
    FROM base b JOIN stats s ON s.zc = b.zc
    WHERE b.f > s.p99 AND b.f > 3 * GREATEST(s.med, 0.0001)`;
}

// runDistributionScan(pool, fields, resScope, zoneExpr) — per-zone outlier scan (value beyond p99 AND
// > 3x the zone median). Extracted verbatim from `parcel-sanity-audit.js`'s `runSanity()` inline
// `distQ()`/`Promise.all()` — behavior-identical, only the RES/ZC closure became explicit parameters.
async function runDistributionScan(pool, fields, resScope, zoneExpr) {
  return Promise.all(fields.map(async (f) => {
    const r = (await pool.query(buildDistributionQuery(resScope, zoneExpr, f))).rows[0];
    return { id: f.id, viol: r.viol, worst: r.worst, samples: r.samples || [] };
  }));
}

// ── The invariants[]/plausibility[] executor (commit 3) ─────────────────────────
//
// Fold A-2 (BLOCKING correction): these rows must enter `buildAuditTable` as
// SYNTHETIC SELECTED CHECKS — the SAME pipeline a real `checks[]` entry gets
// (blocking/severity/errors[]/warnings[]/LM-D16 rendering) — never merely appended
// to `extraRows`, which `verdict.js`'s `errors[]`/`checks_failed`/`errorMessage`
// never reads. So this executor does NOT build audit rows itself: it returns
// check-shaped objects (mapping `bound` → `limit` so `verdict.js`'s existing
// `checkRow`/`evaluateLimit` need no per-category branch) + their `{value}`
// observations, for the caller (index.js) to fold into `buildAuditTable`'s
// existing selected-check loop.
//
// Fold B-3: every entry already carries a declared `source: "invariant"|"plausibility"`
// — passed straight through onto the synthetic check object, so `checkRow`'s row
// builder (verdict.js) can stamp it on the emitted row without re-deriving it.

/** "30s"/"500ms"/"5m"/"none" -> ms | null. Minimal (no declared value is non-"none" as of
 * this WF — Fold B-1: the live server's own statement_timeout is 0/no-limit, so every
 * validate_only entry's override is a DECLARED "none", not a real ceiling to parse). */
function parseDurationMs(v) {
  if (!v || v === 'none') return null;
  const m = String(v).match(/^(\d+(?:\.\d+)?)(ms|s|m)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'ms' ? n : m[2] === 's' ? n * 1000 : n * 60000;
}

/** A `checks[].sql`-analog scalar result -> a JS number when it cleanly parses as one
 * (pg returns NUMERIC/DECIMAL as a STRING by default — count(*)::int comes back as a
 * real number already, but round(...)::numeric does not), else left as-is (e.g. a
 * `string_agg` text result, which no numeric bound form can evaluate — correctly
 * `unevaluable`, not silently coerced). */
function coerceScalar(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^-?\d+(?:\.\d+)?$/.test(raw.trim())) return Number(raw);
  return raw;
}

/**
 * Execute one declared `invariants[]`/`plausibility[]` entry's `sql` (a single-row,
 * single-column scalar query, the same golden-`invariants.json` convention). A query
 * ERROR becomes a distinct FAIL observation — bound-doctrine criterion 1 (Design
 * decisions: "a query error is a distinct FAIL, not folded into the bound") — never
 * swallowed, never read as a clean 0.
 */
async function executeEntry(pool, entry) {
  const timeoutMs = parseDurationMs(entry.statement_timeout);
  try {
    let result;
    if (timeoutMs) {
      // Scoped to this ONE query only (Spec 122 §7.2: "gate checks must run on the
      // same PoolClient" rule, extended — a session-level SET would leak to whatever
      // this pooled connection runs next).
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
        result = await client.query(entry.sql);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } else {
      result = await pool.query(entry.sql);
    }
    const raw = result.rows[0] ? Object.values(result.rows[0])[0] : null;
    const scalar = coerceScalar(raw);
    // Mirror both `.value` (value_min/value_max, pct) and `.violations` (viol) —
    // the SAME measured scalar under both names, so whichever bound form the entry
    // declares is evaluable without this executor needing to know which one it is
    // (verdict.js's evaluateLimit already picks the right reading per form).
    return typeof scalar === 'number' ? { value: scalar, violations: scalar } : { value: scalar };
  } catch (err) {
    return { error: err };
  }
}

/**
 * runValidatorEntries(pool, entries, {frequency, when, config}) — the ONE executor
 * for BOTH `invariants[]` and `plausibility[]` (same runtime shape, same rules).
 * Filters to entries whose `frequency` matches AND whose `when` is in the allowed
 * set (Fold B-2 — the same gated-skip narrowing a real check gets), executes each,
 * and returns `{checks, observations}` ready for `buildAuditTable`'s existing
 * selected-check loop (Fold A-2).
 *
 * @param {import('pg').Pool} pool
 * @param {Array<object>|'none'|undefined} entries - descriptor.invariants or .plausibility
 * `limit_from_config` resolution happens LATER, inside `buildAuditTable`'s own
 * `checkRow` call (which already receives `config` as its own parameter) — this
 * executor only builds the check-shaped object + runs the raw query, so it takes
 * no `config` of its own.
 *
 * @param {{frequency:string, when:string[]|null}} opts
 * @returns {Promise<{checks:object[], observations:Record<string,object>}>}
 */
async function runValidatorEntries(pool, entries, { frequency, when }) {
  const list = Array.isArray(entries) ? entries : [];
  // `when: null` (or absent) means unrestricted — score every declared `when`, the
  // same null-means-everything convention `onlyChecks` itself uses in index.js.
  const selected = list.filter((e) => e.frequency === frequency && (!when || when.includes(e.when || 'pre')));
  const checks = [];
  const observations = {};
  for (const entry of selected) {
    checks.push({
      id: entry.id,
      limit: entry.bound,
      limit_from_config: entry.limit_from_config,
      severity: entry.severity,
      blocking: entry.blocking,
      source: entry.source,
    });
    observations[entry.id] = await executeEntry(pool, entry);
  }
  return { checks, observations };
}

/** Thin, named wrapper (matches the plan's own API naming) — `descriptor.invariants` only. */
function runInvariants(pool, descriptor, opts) {
  return runValidatorEntries(pool, descriptor.invariants, opts);
}

/** Thin, named wrapper — `descriptor.plausibility` only. */
function runPlausibility(pool, descriptor, opts) {
  return runValidatorEntries(pool, descriptor.plausibility, opts);
}

module.exports = {
  statusFor,
  verdictCascade,
  buildDistributionQuery,
  runDistributionScan,
  parseDurationMs,
  coerceScalar,
  runValidatorEntries,
  runInvariants,
  runPlausibility,
};
