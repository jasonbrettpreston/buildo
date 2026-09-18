/**
 * The plausibility gate-mapping policy + distribution-scan mechanism.
 *
 * EXTRACTED VERBATIM from `scripts/analysis/parcel-sanity-audit.js` (R-T addendum,
 * Spec 124 §2 Rule 13, WF2 "The Step Validator, Data-First", commit 2). That file
 * now re-imports `statusFor` from here rather than defining it locally — one copy
 * of the gate-mapping policy, not a second one forked for the new
 * `invariants[]`/`plausibility[]` categories (Fold A-4d: "extract once, both sides
 * import" — the same discipline used for `statusFor` is applied here to
 * `parcel-sanity-audit.js`'s DIST_FIELDS distribution scan too, Fold B-7).
 *
 * `verdictCascade` — a second, hand-rolled duplicate of `scripts/lib/step/verdict.js`'s
 * `deriveVerdict` that used to live here — was RETIRED at Rule 10's WF2 (Spec 124
 * §2 Rule 10, "verdict is row-derived from ONE place"). Its one consumer
 * (`scripts/quality/assert-parcel-sanity.js`) now imports `deriveVerdict` directly.
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

// Rule 10 (Spec 124 §2, WF2 "Rules 10/11/12 mechanical checkers", C1) — the
// verdictCascade duplicate that lived here (a second, hand-rolled copy of
// verdict.js's deriveVerdict) is RETIRED. Its only consumer,
// scripts/quality/assert-parcel-sanity.js, now imports deriveVerdict directly
// from scripts/lib/step/verdict.js — same rows-in shape (`{status}[]`), same
// PASS/WARN/FAIL-else-PASS semantics, proven behaviour-identical in
// src/tests/step-conformance.infra.test.ts before the cutover.

// buildDistributionQuery — the exact SQL `parcel-sanity-audit.js`'s inline `distQ` closure built,
// parameterised on the residential-scope predicate and the zone-class bucket expression (both were
// already parcel-sanity-audit-local constants, RES/ZC, now passed in rather than closed over).
// batch2 P1.1 (Rule 3 conformance) — `percentile`/`medianMultiplier`/`medianFloor`
// are OPTIONAL, defaulting to the legacy literals (0.99 / 3 / 0.0001) so every
// pre-existing caller (parcel-sanity-audit.js's own CLI, any future kind:"distribution"
// consumer that declares none of the 3) is byte-identical. `assert_parcel_sanity`'s own
// registered `parcel_sanity_distribution_*` logic variables are threaded in from
// `ctx.config` by `runDistributionEntries` below — the ONLY way a registered threshold
// may be consumed (never a literal baked at descriptor-generation time).
function buildDistributionQuery(resScope, zoneExpr, field, opts = {}) {
  const percentile = Number.isFinite(opts.percentile) ? opts.percentile : 0.99;
  const medianMultiplier = Number.isFinite(opts.medianMultiplier) ? opts.medianMultiplier : 3;
  const medianFloor = Number.isFinite(opts.medianFloor) ? opts.medianFloor : 0.0001;
  return `
    WITH base AS (SELECT id, (${zoneExpr}) AS zc, (${field.expr})::float8 AS f FROM parcels WHERE ${resScope} AND (${field.expr}) IS NOT NULL),
    stats AS (SELECT zc, percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med,
                     percentile_cont(${percentile}) WITHIN GROUP (ORDER BY f) AS p99 FROM base GROUP BY zc)
    SELECT count(*)::int AS viol, (array_agg(b.id ORDER BY b.f DESC, b.id))[1:6] AS samples,
           round(max(b.f)::numeric, 2) AS worst
    FROM base b JOIN stats s ON s.zc = b.zc
    WHERE b.f > s.p99 AND b.f > ${medianMultiplier} * GREATEST(s.med, ${medianFloor})`;
}

// runDistributionScan(pool, fields, resScope, zoneExpr, opts) — per-zone outlier scan (value
// beyond the configured percentile AND > the configured multiplier x the zone median).
// Extracted verbatim from `parcel-sanity-audit.js`'s `runSanity()` inline `distQ()`/
// `Promise.all()` — behavior-identical at the default opts, only the RES/ZC closure
// became explicit parameters (+ the optional percentile/multiplier/floor, Rule 3).
async function runDistributionScan(pool, fields, resScope, zoneExpr, opts = {}) {
  return Promise.all(fields.map(async (f) => {
    const r = (await pool.query(buildDistributionQuery(resScope, zoneExpr, f, opts))).rows[0];
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
 *
 * EP-D17 (WF3, 2026-09-10, C1) — `defaultTimeoutMs` is the ceiling this entry
 * inherits when it declares no `statement_timeout` of its own ("none"/absent).
 * Before this, an `every_run` entry with no declared override took the bare
 * `pool.query` branch below and ran with NO ceiling at all — `PIPELINE_STATEMENT_TIMEOUT_MS`
 * defaults to 0, so nothing bound it even on cloud, where a `parcels` full scan
 * against a bloated heap measured 40+ minutes (EP-D17, cloud EXPLAIN 2026-09-10).
 * The caller (`scripts/lib/step/index.js`) resolves `defaultTimeoutMs` from the
 * step's own declared `execution.statement_timeout` unless the new
 * `step_post_check_statement_timeout_minutes` logic variable overrides it — either
 * way, EVERY every_run entry now runs inside a `SET LOCAL statement_timeout`
 * envelope, declared or defaulted, never bare `pool.query`.
 *
 * Also returns `duration_ms` (Spec 48 §3.5's `sys_duration_ms` precedent — an
 * INFO cost row is explicitly legal) on BOTH the success and error path, so a
 * timed-out entry's own FAIL row still carries how long it ran before it died.
 */
async function executeEntry(pool, entry, defaultTimeoutMs) {
  const declaredMs = parseDurationMs(entry.statement_timeout);
  // A declared "none"/absent falls through to the step's own ceiling — never to
  // an unbound connection. `defaultTimeoutMs` is itself `null`/`0`/falsy only for
  // a caller that passed nothing (fixture safety net, not a live step).
  const timeoutMs = declaredMs != null ? declaredMs : (defaultTimeoutMs || null);
  const startedAt = Date.now();
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
    const duration_ms = Date.now() - startedAt;
    // Mirror both `.value` (value_min/value_max, pct) and `.violations` (viol) —
    // the SAME measured scalar under both names, so whichever bound form the entry
    // declares is evaluable without this executor needing to know which one it is
    // (verdict.js's evaluateLimit already picks the right reading per form).
    return typeof scalar === 'number'
      ? { value: scalar, violations: scalar, duration_ms }
      : { value: scalar, duration_ms };
  } catch (err) {
    return { error: err, duration_ms: Date.now() - startedAt };
  }
}

/**
 * batch2 P1.1 (assert_parcel_sanity, Fold B-7 wiring) — the `kind:"distribution"`
 * executor. Reuses `runDistributionScan` verbatim rather than duplicating the
 * percentile/outlier SQL. APS-D2 (defect-ledger.md): a distribution entry's `sql`
 * field is a REAL, standalone, single-row/single-column query (so
 * capture-step-golden.js's kind-blind `deriveInvariantSpecFromDescriptor` can
 * execute it for its own golden snapshot) — NOT the bare field expression this
 * executor needs to splice into `buildDistributionQuery`'s own CTE. The field
 * expression comes from `fieldExprById` instead (keyed by entry id), read
 * generically off the step's own compute module — see
 * `scripts/lib/step/index.js`'s `DISTRIBUTION_SCOPE` convention. The zone-BUCKET
 * CASE expression (RD/RS/RT/RM/RA/R) is likewise domain knowledge, not derivable
 * from the descriptor's `zone_by` column name, so it travels the same way
 * (`resScope`/`zoneExpr`) — the same reasoning this file's header already gives
 * for hardcoding `FROM parcels`.
 *
 * Returns the same `{checks, observations}` shape `runValidatorEntries` returns for
 * bound-kind entries, so the caller (`buildAuditTable`'s `synthetic` argument) needs
 * no per-kind branch.
 */
async function runDistributionEntries(pool, entries, { resScope, zoneExpr, fieldExprById, percentile, medianMultiplier, medianFloor } = {}) {
  const checks = entries.map((entry) => ({
    id: entry.id,
    limit: entry.bound,
    limit_from_config: entry.limit_from_config,
    severity: entry.severity,
    blocking: entry.blocking,
    source: entry.source,
  }));
  if (!entries.length) return { checks: [], observations: {} };
  if (!resScope || !zoneExpr || !fieldExprById) {
    throw new Error('runDistributionEntries: resScope, zoneExpr and fieldExprById are all required for kind:"distribution" plausibility entries (declare compute.DISTRIBUTION_SCOPE = {resScope, zoneExpr, fieldExprById} on the step\'s compute module)');
  }
  const fields = entries.map((e) => {
    const expr = fieldExprById[e.id];
    if (!expr) throw new Error(`runDistributionEntries: no fieldExprById entry for plausibility id "${e.id}"`);
    return { id: e.id, expr };
  });
  const dist = await runDistributionScan(pool, fields, resScope, zoneExpr, { percentile, medianMultiplier, medianFloor });
  const byId = Object.fromEntries(dist.map((d) => [d.id, d]));
  const observations = {};
  for (const entry of entries) {
    const d = byId[entry.id];
    // `detail` renders the human-readable count (checkRow prefers detail over the
    // bare violations number) — matches parcel-sanity-audit.js's pre-conversion
    // rendered row value byte-for-byte ("N outliers (worst X)").
    const detail = `${d.viol} outliers${d.worst != null ? ` (worst ${d.worst})` : ''}`;
    observations[entry.id] = { value: d.viol, violations: d.viol, worst: d.worst, samples: d.samples, detail, duration_ms: 0 };
  }
  return { checks, observations };
}

/**
 * runValidatorEntries(pool, entries, {frequency, when, defaultTimeoutMs}) — the ONE
 * executor for BOTH `invariants[]` and `plausibility[]` (same runtime shape, same
 * rules). Filters to entries whose `frequency` matches AND whose `when` is in the
 * allowed set (Fold B-2 — the same gated-skip narrowing a real check gets), executes
 * each, and returns `{checks, observations}` ready for `buildAuditTable`'s existing
 * selected-check loop (Fold A-2).
 *
 * EP-D17 (WF3, 2026-09-10, C2b) — selected entries are issued CONCURRENTLY in
 * BATCHES of `concurrency` (default 4, `step_post_check_concurrency`), one
 * `executeEntry` call per entry, each of which already opens its OWN
 * `pool.connect()` client when a ceiling applies (every entry has one as of
 * C1 — declared or defaulted, never "none" reaching an unbound connection).
 * Measured live 2026-09-10: 8 concurrent `parcels` scans finish in ~4-5s each
 * (one shared `BufferIo` heap read, `pg_stat_activity` sampled) against 2min+
 * when the same 5 statements ran strictly serially — the `runSanity` 8-way
 * distribution-query `Promise.all` (`parcel-sanity-audit.js`) is the in-repo
 * precedent this generalises, not a new mechanism.
 *
 * OUTPUT-PANEL FIX F7 (MED, 2026-09-10) — corrected claim: pool `max` is the pg
 * default (10, `createPool` sets none), and this executor is NOT the only
 * consumer of that pool at the moment it runs — the outer step-level advisory
 * lock (`pipeline.withAdvisoryLock`) holds its own client for the step's whole
 * duration, and `link_wsib` alone declares 9 invariants/plausibility entries
 * (measured live, `scripts/link-wsib.descriptor.json`), which an UNBOUNDED
 * `Promise.all` would have tried to run on 9 simultaneous clients — comfortably
 * OVER budget once the lock's own client is counted, not "comfortably under" as
 * originally claimed. The declared `step_post_check_concurrency` bound caps the
 * batch width instead: entries execute `concurrency`-wide batches, sequentially
 * between batches, so a step with N entries never opens more than `concurrency`
 * simultaneous post-check clients regardless of N.
 *
 * @param {import('pg').Pool} pool
 * @param {Array<object>|'none'|undefined} entries - descriptor.invariants or .plausibility
 * `limit_from_config` resolution happens LATER, inside `buildAuditTable`'s own
 * `checkRow` call (which already receives `config` as its own parameter) — this
 * executor only builds the check-shaped object + runs the raw query, so it takes
 * no `config` of its own.
 *
 * @param {{frequency:string, when:string[]|null, defaultTimeoutMs?:number|null, concurrency?:number}} opts
 * @returns {Promise<{checks:object[], observations:Record<string,object>}>}
 */
async function runValidatorEntries(pool, entries, { frequency, when, defaultTimeoutMs, concurrency, resScope, zoneExpr, fieldExprById, percentile, medianMultiplier, medianFloor } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  // `when: null` (or absent) means unrestricted — score every declared `when`, the
  // same null-means-everything convention `onlyChecks` itself uses in index.js.
  const selected = list.filter((e) => e.frequency === frequency && (!when || when.includes(e.when || 'pre')));
  // batch2 P1.1 (Fold B-7) — `kind:"distribution"` entries route through
  // runDistributionEntries (a direct function call, never a duplicated
  // implementation) ONLY when the caller supplies resScope/zoneExpr/fieldExprById
  // (the live run, via a step's compute.DISTRIBUTION_SCOPE). A THIRD legitimate
  // caller — scripts/analysis/step-validate.mjs's runDataValidatorsForWrite(), a
  // descriptor-only probe with no compute module in hand — calls runInvariants/
  // runPlausibility directly with neither. For that caller, a kind:"distribution"
  // entry falls back to the ORDINARY executeEntry path over its own declared `sql`
  // (APS-D2's fix made that text a real, valid, single-row/single-column query, so
  // this degrades to a plain viol count — no worst/samples/detail text — rather
  // than throwing). Never a silent behaviour change for the live run: scope
  // presence is the sole discriminator, checked once, consistently.
  const scopeAvailable = !!(resScope && zoneExpr && fieldExprById);
  const distEntries = scopeAvailable ? selected.filter((e) => e.kind === 'distribution') : [];
  const boundEntries = scopeAvailable ? selected.filter((e) => e.kind !== 'distribution') : selected;
  const checks = boundEntries.map((entry) => ({
    id: entry.id,
    limit: entry.bound,
    limit_from_config: entry.limit_from_config,
    severity: entry.severity,
    blocking: entry.blocking,
    source: entry.source,
  }));
  // F7 — batch width caps simultaneous clients at `concurrency` (default 4, matching
  // step_post_check_concurrency's own seed default); a non-positive/non-finite value
  // degrades to fully serial (batch width 1), never to unbounded.
  const batchSize = Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : 4;
  const results = [];
  for (let i = 0; i < boundEntries.length; i += batchSize) {
    const batch = boundEntries.slice(i, i + batchSize);
    // `executeEntry` NEVER rejects (every path returns `{value|error, duration_ms}`),
    // so `Promise.all` cannot short-circuit and swallow a batch-mate's row — one
    // entry's FAIL is a value in its own slot, not a rejection.
    const batchResults = await Promise.all(batch.map((entry) => executeEntry(pool, entry, defaultTimeoutMs)));
    results.push(...batchResults);
  }
  const observations = {};
  boundEntries.forEach((entry, i) => { observations[entry.id] = results[i]; });

  const distResult = await runDistributionEntries(pool, distEntries, { resScope, zoneExpr, fieldExprById, percentile, medianMultiplier, medianFloor });
  return {
    checks: [...checks, ...distResult.checks],
    observations: { ...observations, ...distResult.observations },
  };
}

/** Thin, named wrapper (matches the plan's own API naming) — `descriptor.invariants` only. */
function runInvariants(pool, descriptor, opts) {
  return runValidatorEntries(pool, descriptor.invariants, opts);
}

/** Thin, named wrapper — `descriptor.plausibility` only. */
function runPlausibility(pool, descriptor, opts) {
  return runValidatorEntries(pool, descriptor.plausibility, opts);
}

/** Local copy of pipeline.js's own identifier guard — kept tiny/duplicated rather than
 * requiring `../pipeline` here, since `execution.maintenance.table` is already
 * AJV-validated against `#/definitions/tableName` (`^[a-z_][a-z0-9_]*$`) before this
 * ever runs; this is defence in depth, not the primary guard. */
function quoteMaintenanceIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid maintenance table identifier: ${name}`);
  return `"${name}"`;
}

const MAINTENANCE_SQL = {
  vacuum: (t) => `VACUUM ${t}`,
  analyze: (t) => `ANALYZE ${t}`,
  vacuum_analyze: (t) => `VACUUM (ANALYZE) ${t}`,
  reindex: (t) => `REINDEX TABLE ${t}`,
};

// F5 (output panel, 2026-09-10) — the VACUUM/ANALYZE/REINDEX statement had NO declared
// ceiling: an unbounded manual VACUUM against a heap large enough to need one in the
// first place is the exact unbounded-statement shape EP-D17's own C1 rung exists to
// close everywhere else. Default 15 min, applied ONLY when the declaring step has not
// itself overridden `${table}_maintenance_timeout_minutes` — a manual VACUUM (default
// vacuum_cost_delay=0, unthrottled) measured a 3-10 min estimate for the ~1.35M dead
// tuples that motivated this WF3 (scripts/one-time/wf3-vacuum-analyze-parcels.js's own
// header), so 15 min carries real margin without inheriting an unrelated step's own
// declared execution.statement_timeout (which prices a different SQL shape entirely).
const MAINTENANCE_DEFAULT_TIMEOUT_MS = 15 * 60000;

/**
 * runMaintenance(pool, maintenance, config, opts) — EP-D17 (WF3, 2026-09-10, C4) rung
 * (d): the library-owned `execution.maintenance` executor. Before this WF3, the
 * field was REQUIRED-and-frozen in `step.schema.json` (a 4-value `operation`
 * enum, a `txn_scope` conditional, a mandatory `why`) but had NO executor
 * anywhere in `scripts/lib` — every converted descriptor declared `"none"`
 * because there was nothing else a declaration could DO (P11 grounding, this
 * WF3's own Step 0). This function is that executor.
 *
 * OUTPUT-PANEL FIX F2 (HIGH, 2026-09-10) — the CALLER (`scripts/lib/step/index.js`)
 * now invokes this BEFORE `runInvariants`/`runPlausibility`, not after: the ORIGINAL
 * ordering let the 5 bloat-sensitive post checks scan the heap the step's own write
 * phases had just bloated, and C1's new declared ceiling turned "slow but eventually
 * green" into "FAILs loudly at the ceiling" for exactly the runs this executor exists
 * to clean up first. Retired fence, stated honestly: the pre-fix code had NO ceiling
 * on those checks at all, so a long scan simply ran to completion (successfully, if
 * slowly) — C1's ceiling makes that silent tolerance impossible, which is why the
 * reorder is load-bearing, not cosmetic.
 *
 * Runs AFTER the step's own write phases (for `enrich_parcels` that means passes
 * 1-4's shared transaction has already COMMITted and pass 5's post_commit write is
 * done) but BEFORE the run-end checks, and the VACUUM/ANALYZE/REINDEX statement
 * itself ALWAYS runs autocommit on its OWN dedicated `pool.connect()` client —
 * never inside an open transaction (Postgres forbids VACUUM inside one), and never
 * on the shared `pool.query()` path other callers use. This is what makes the
 * `txn_scope:"step"` schema relaxation (RE-FREEZE #6) safe for an ENRICHER: the
 * step's own shared transaction is gone by the time this runs.
 *
 * For each declared `{operation, table, owned_by, why}` target: reads
 * `pg_stat_user_tables` for the SAME cheap, catalog-only `n_live_tup`/`n_dead_tup`
 * counters `pipeline.js`'s own `captureTelemetry` T6 block already reads
 * elsewhere in the library — never a scan of `table` itself — and compares the
 * resulting `dead_ratio` against `config[\`${table}_dead_tuple_ratio_warn_max\`]`,
 * the SAME named tunable the step's own declared `plausibility[]` bound reads
 * (by convention: one measurement, one threshold name, two independent
 * consumers that can never silently disagree about it). Below the threshold —
 * or the threshold is undeclared for this table — the target is SKIPPED with a
 * stated reason, never silently. At or above it, the declared operation runs,
 * bound by `config[\`${table}_maintenance_timeout_minutes\`]` (default 15 min,
 * F5), and the row records the ACTION. A measurement OR execution failure is
 * logged via `pipeline.log.warn` (F6 — a swallowed maintenance failure with no
 * log line would be invisible outside the returned row) in addition to being
 * returned as a WARN row.
 *
 * Every returned row's `metric` is `sys_maintenance_<table>_<operation>` (F1,
 * CRITICAL) — `scripts/analysis/capture-step-golden.js`'s `scrub()` drops a
 * WHOLE row whose `metric` starts with the declared `sys_` prefix
 * (`VOLATILE_METRIC_PREFIXES`), which is the ONLY mechanism that keeps this
 * row's raw `dead_ratio`/`duration_ms`/free-text `note` (none of which the
 * scrubber's `VOLATILE_KEYS`/`VOLATILE_PATTERNS` would otherwise catch) from
 * making every converted step's golden master non-reproducible. The row is
 * still fully visible on a LIVE run's `records_meta.audit_table.rows` — only
 * golden-diff comparison excludes it, the same trade `sys_duration_ms` itself
 * already makes.
 *
 * @param {import('pg').Pool} pool
 * @param {Array<{operation:string, table:string, owned_by:string, why:object}>|'none'|undefined} maintenance
 * @param {Readonly<Record<string, number>>} config - `ctx.config` (resolveConfig's `values`)
 * @param {{log?: {warn: (tag:string, msg:string) => void}, tag?: string}} [opts]
 * @returns {Promise<Array<{metric:string, value:unknown, threshold:unknown, status:string, note:string}>>}
 */
async function runMaintenance(pool, maintenance, config, opts = {}) {
  const entries = Array.isArray(maintenance) ? maintenance : [];
  const log = opts.log || null;
  const tag = opts.tag || '[step/maintenance]';
  const rows = [];
  for (const entry of entries) {
    const metric = `sys_maintenance_${entry.table}_${entry.operation}`;
    const cfgKey = `${entry.table}_dead_tuple_ratio_warn_max`;
    const threshold = typeof (config || {})[cfgKey] === 'number' ? config[cfgKey] : null;
    let deadRatio = null;
    try {
      const statRes = await pool.query(
        'SELECT n_live_tup::bigint AS live, n_dead_tup::bigint AS dead FROM pg_stat_user_tables WHERE relname = $1',
        [entry.table],
      );
      const r = statRes.rows[0];
      if (r) {
        const live = Number(r.live) || 0;
        const dead = Number(r.dead) || 0;
        deadRatio = (live + dead) > 0 ? Math.round((dead / (live + dead)) * 10000) / 10000 : 0;
      }
    } catch (err) {
      const note = `dead_ratio measurement failed: ${err.message}`;
      if (log) log.warn(tag, `runMaintenance: ${entry.table} ${note}`);
      rows.push({ metric, value: null, threshold: null, status: 'WARN', note });
      continue;
    }
    if (threshold === null) {
      rows.push({ metric, value: deadRatio, threshold: null, status: 'WARN', note: `skipped — no ${cfgKey} logic variable declared` });
      continue;
    }
    if (deadRatio === null || deadRatio <= threshold) {
      rows.push({ metric, value: deadRatio, threshold, status: 'INFO', note: `skipped — dead_ratio ${deadRatio} <= ${threshold}` });
      continue;
    }
    const buildSql = MAINTENANCE_SQL[entry.operation];
    if (!buildSql) {
      rows.push({ metric, value: deadRatio, threshold, status: 'WARN', note: `skipped — unmapped operation "${entry.operation}"` });
      continue;
    }
    const timeoutCfgKey = `${entry.table}_maintenance_timeout_minutes`;
    const timeoutMs = typeof (config || {})[timeoutCfgKey] === 'number'
      ? config[timeoutCfgKey] * 60000
      : MAINTENANCE_DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    try {
      // F5 — quoteMaintenanceIdent() moved INSIDE the try: a malformed table name
      // (defence-in-depth only — AJV already validates it at construction) now
      // produces a WARN row through the same path as any other failure, never an
      // uncaught throw out of runMaintenance itself.
      const sql = buildSql(quoteMaintenanceIdent(entry.table));
      // F5 — a dedicated, autocommit client carries its OWN declared ceiling. VACUUM
      // forbids an enclosing transaction, so this is a bare SET + statement pair, the
      // same shape executeEntry's own ceiling branch uses minus the BEGIN/COMMIT.
      const client = await pool.connect();
      try {
        await client.query(`SET statement_timeout = ${timeoutMs}`);
        await client.query(sql);
      } finally {
        client.release();
      }
      rows.push({
        metric, value: deadRatio, threshold, status: 'INFO',
        note: `ran "${sql}" — dead_ratio ${deadRatio} > ${threshold}`,
        duration_ms: Date.now() - startedAt,
      });
    } catch (err) {
      const note = `maintenance statement FAILED (ceiling ${timeoutMs}ms): ${err.message}`;
      if (log) log.warn(tag, `runMaintenance: ${entry.table} ${note}`);
      rows.push({ metric, value: deadRatio, threshold, status: 'WARN', note });
    }
  }
  return rows;
}

module.exports = {
  statusFor,
  buildDistributionQuery,
  runDistributionScan,
  parseDurationMs,
  coerceScalar,
  executeEntry,
  runDistributionEntries,
  runValidatorEntries,
  runInvariants,
  runPlausibility,
  runMaintenance,
};
