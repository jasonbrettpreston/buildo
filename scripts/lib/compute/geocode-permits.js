'use strict';
/**
 * COMPUTE for `geocode_permits` (Spec 122 §5.5; batch-2 Phase 0.9 step I5).
 *
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §"Geocode Permits" (this step's own contract)
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §11 (the Counter Semantic Contract,
 *            which names THIS STEP TWICE as its own worked example)
 *
 * Rule 2 — COMPUTE IS JUST COMPUTE. No pool creation, no logging, no `process.env`, no
 * wall clock, no verdict derivation, no thresholds. Every number this module produces is
 * MEASURED; every judgement about it is made by the library from the descriptor.
 *
 * WHAT THIS STEP DOES, as opposed to what its specs said it did until commit 9: one
 * equijoin from `permits.geo_id::INTEGER` to `address_points.address_point_id`. There is
 * no address-string matching and no Google Geocoding fallback — there never has been since
 * `67057269`. `execution.network` is "none" and `inputs.reads.externals` is empty, both
 * measured (0 hits for google/fetch/http/axios across the pre-conversion file).
 *
 * THE TWO PHASES SHARE ONE TRANSACTION (`execution.txn_scope: "step"`, both
 * `execution.phases[].txn: "shared"`). That is fence F3 / guarantee B-4, and it is not
 * decoration: `3e44218a` put the wrapper back after `d24c964c` had removed a one-statement
 * version of it as "redundant" twelve days earlier, with the measurement that a dashboard
 * read between the two UPDATEs could see coordinates disagreeing with the zombie-cleanup
 * state. `src/tests/geocode-permits.infra.test.ts` is that fence's lock.
 */

// ===========================================================================
// PHASE 1 — the geocode join. Class N (`set_based_join_update`), executed through
// `ctx.joinUpdate`, whose executor structurally refuses any statement text containing
// INSERT INTO / ON CONFLICT — which is what makes `funnel.ts`'s `ins: [0,0]` and
// `row_delta.permits: [0,0]` enforceable rather than merely declared (B-13).
// ===========================================================================

/**
 * The pre-run counts. Read BEFORE this run's writes, inside the shared transaction.
 *
 * `to_geocode` is a REPORTING scope and nothing else: it feeds `backlog_remaining` and is
 * NOT the UPDATE's scope (which carries no `latitude IS NULL` narrowing at all) and NOT
 * `idx_permits_needs_geocode`'s predicate (`WHERE geocoded_at IS NULL`, its complement).
 * Three different "needs geocoding" definitions coexist in this step's blast radius; this
 * is the one the audit table reports and the only one any of them is used for.
 */
const BEFORE_COUNTS_SQL = `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS already_geocoded,
      COUNT(*) FILTER (WHERE geo_id IS NOT NULL AND geo_id != '') AS has_geo_id,
      COUNT(*) FILTER (
        WHERE latitude IS NULL
          AND geo_id IS NOT NULL AND geo_id != ''
      ) AS to_geocode
    FROM permits
`;

/**
 * The post-run counts, read on the step's own pool AFTER the shared transaction commits.
 *
 * `total` is read HERE and not before the writes because `d24c964c`'s own body says so —
 * *"Fix read-skew: use after.total as denominator for coverage metric"*: a concurrent
 * permits load made the pre- and post-run denominators disagree and the coverage percentage
 * jump. That is fence F6, and it is why `total_permits` is the one counter-intuitive
 * `when: "post"` on this step.
 */
const AFTER_COUNTS_SQL = `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS geocoded,
      COUNT(*) FILTER (
        WHERE latitude IS NULL
          AND geo_id IS NOT NULL AND geo_id != ''
      ) AS has_geo_id_no_match,
      COUNT(*) FILTER (
        WHERE latitude IS NULL
          AND (geo_id IS NULL OR geo_id = '')
      ) AS no_geo_id
    FROM permits
`;

/**
 * W1's statement text, PORTED VERBATIM. Pure: no client, no execution, no clock.
 *
 * ⚠️ FENCE F1 / GUARANTEE B-5 — `CASE WHEN p.geo_id ~ '^[0-9]+$' THEN p.geo_id::INTEGER END`
 * beside the sibling `p.geo_id ~ '^[0-9]+$'` predicate is NOT redundant and MUST NOT be
 * "simplified" to a bare `p.geo_id::INTEGER`. `d24c964c`: *"CASE expression guarantees regex
 * validation before INTEGER cast (PostgreSQL can reorder WHERE conditions, crashing on
 * non-numeric geo_id)"*. The CASE makes the ordering STRUCTURAL rather than textual. This is
 * live, not theoretical: 6 rows carry a non-numeric `geo_id` on the dev database today
 * (measured 2026-09-16), so removing the fence crashes the statement on real data.
 *
 * ⚠️ FENCE F2 / GUARANTEE B-7 — the IS DISTINCT FROM guard covers `latitude` and `longitude`
 * and NOT `geocoded_at`. `geocoded_at` is declared `source: "run_at"`, i.e. DISTINCT FROM its
 * stored value on EVERY run, so widening the guard over it rewrites all 246,416 numeric-geo_id
 * permits every run (the LG-9 run-clock trap, live rather than moot here). `32da93c5` added
 * this guard to an unguarded blanket UPDATE and measured the saving: *"Eliminates ~6,001 ghost
 * updates per sources pipeline run"*.
 *
 * ⚠️ FENCE F13 — `p.geo_id != ''` beside `p.geo_id IS NOT NULL` is INTENT-UNKNOWN: it has been
 * here since the file's creation commit and no body in any of the 19 commits explains it. The
 * obvious reading is a NULL-vs-empty-string defence on a TEXT column, but that is inference,
 * and inference is not a recovered why. Carried verbatim for exactly that reason.
 *
 * There is deliberately NO incremental predicate: every permit with a numeric `geo_id` is
 * re-joined on every run and the guard — not a lineage scope — is what makes the write cheap
 * (`staleness.scope: "all"`, and both phases declare `scope: "full"`).
 */
function buildGeocodeSql() {
  return `
      UPDATE permits p
      SET latitude = ap.latitude,
          longitude = ap.longitude,
          geocoded_at = $1::timestamptz
      FROM address_points ap
      WHERE p.geo_id IS NOT NULL
        AND p.geo_id != ''
        AND p.geo_id ~ '^[0-9]+$'
        AND ap.address_point_id = CASE WHEN p.geo_id ~ '^[0-9]+$' THEN p.geo_id::INTEGER END
        AND (p.latitude IS DISTINCT FROM ap.latitude
          OR p.longitude IS DISTINCT FROM ap.longitude)
  `;
}

/**
 * Phase 1 — `geocode`, `writes_ref` 0, inside the shared transaction.
 *
 * Returns the pre-run counts alongside the rowCount because `already_geocoded` is this
 * step's ONE genuinely pre-run audit row (the reading that makes `newly_geocoded`
 * interpretable) and `to_geocode` is `backlog_remaining`'s minuend. Both are measured here,
 * before the write, and read back out of `passRaw.geocode` by `computePostPhase`.
 */
async function runGeocodePass(client, ctx) {
  const before = await client.query(BEFORE_COUNTS_SQL);
  const b = before.rows[0];
  const addressPoints = await client.query('SELECT COUNT(*) AS count FROM address_points');

  const updated = await ctx.joinUpdate(0, buildGeocodeSql(), [ctx.clock.now()]);
  ctx.onProgress(updated);

  return {
    updated,
    before_total: Number(b.total),
    before_already_geocoded: Number(b.already_geocoded),
    before_has_geo_id: Number(b.has_geo_id),
    before_to_geocode: Number(b.to_geocode),
    address_points_loaded: Number(addressPoints.rows[0].count),
  };
}

// ===========================================================================
// PHASE 2 — the zombie retraction. Class O (`set_based_null_retract`), executed through
// `ctx.retract`, which refuses the call outright unless `recovery.before_image` is
// "generated" (R-M) and writes the before image BEFORE issuing the statement.
// ===========================================================================

/**
 * Phase 2 — `zombie_cleanup`, `writes_ref` 1, in the SAME transaction as phase 1.
 *
 * The statement is GENERATED by the library from `outputs.writes[1]`'s declared scope and
 * guard, not authored here — class O is the one of this step's two classes that generates.
 * The declared decomposition is deliberate: the pre-conversion WHERE had three terms, and
 * `latitude IS NOT NULL` moved into `guard_columns: ["latitude"]` (an IS-DISTINCT-FROM-NULL
 * guard) while `(geo_id IS NULL OR geo_id = '') AND geocoded_at IS NOT NULL` stayed in
 * `scope` — the `link_wsib` LG-16 precedent. `latitude IS NOT NULL` and
 * `latitude IS DISTINCT FROM NULL` were proven equivalent by execution over all 254,082
 * live rows (0 disagreements) before this decomposition was accepted.
 *
 * ⚠️ FENCE F4 / GUARANTEE B-8 — `geocoded_at IS NOT NULL` in the scope is LOAD-BEARING, not
 * a convenience. `d24c964c`: *"guarded by geocoded_at IS NOT NULL to avoid wiping other
 * geocoding sources"*. It confines the retraction to rows THIS step geocoded. It is
 * load-bearing even though no second geocoding source exists in the tree today — it is what
 * makes adding one safe.
 *
 * The scope has no bound parameters, so `scopeParams` is empty.
 */
async function runZombieCleanupPass(client, ctx) {
  const retracted = await ctx.retract(1, []);
  return { retracted };
}

// ===========================================================================
// STEP-LEVEL POST PHASE — `execution.enrich_hooks.post_phase` (batch-2 Phase 0.10b).
// Called ONCE by the runner, after the last phase and after COMMIT, on the step's own pool.
// ===========================================================================

/**
 * The step's own post-phase observation block.
 *
 * `matched` carries ONE ENTRY PER DECLARED CHECK ID (§5.5 (1)) plus `has_geo_id_no_match`,
 * which is emitted and read by nobody — `GP-L2`, pinned as a limitation rather than promoted
 * to a ninth audit row, because adding a row is a behaviour change (Spec 123 §1.1) and this
 * conversion is behaviour-neutral by contract. It is a commit-8 peel candidate.
 *
 * `compute` carries the three counter sources, every value FINITE or the runner throws.
 * DECLARE THE ROOT THAT RESOLVES: the runner resolves `counters.<slot>.source` against
 * `{matched, written, records_meta}`, so `matched.compute.<name>` resolves while a BARE
 * `compute.*` resolves NULL for every ENRICHER. `newly_geocoded` therefore appears TWICE —
 * once as a `matched` key (the audit row of that id reads it) and once under
 * `matched.compute` (the counter source reads it). Two contracts over one measurement.
 *
 * ⚠️ SPEC 47 §11, which names this step BY NAME, TWICE:
 *   · *"Pre-run backlog sizes — e.g. `before.to_geocode` in `geocode-permits` … MUST NOT be
 *     used as `records_total`."* → `records_total` is W1's rowCount, never `to_geocode`.
 *   · *"Cleanup operations — e.g. zombie coordinate resets in `geocode-permits`. Goes in
 *     `audit_table` as `zombies_cleaned`."* → phase 2's rowCount is DELIBERATELY EXCLUDED
 *     from `records_updated` and lives on its own audit row.
 * Both dispositions come from `e37eaab9`, which wrote §11 in the same commit.
 *
 * The runner owns `passes`, `compute`, `before_image`, `<slug>_duration_ms` and the four
 * `scope_*` retirement keys, and refuses by name any of them returned from here.
 */
async function computePostPhase(pool, { passRaw }) {
  const geocode = passRaw.geocode || {};
  const cleanup = passRaw.zombie_cleanup || {};

  const after = await pool.query(AFTER_COUNTS_SQL);
  const a = after.rows[0];

  const totalPermits = Number(a.total);
  const totalGeocoded = Number(a.geocoded);
  const hasGeoIdNoMatch = Number(a.has_geo_id_no_match);
  const noGeoId = Number(a.no_geo_id);

  const newlyGeocoded = Number(geocode.updated || 0);
  const zombiesCleaned = Number(cleanup.retracted || 0);

  // The coverage percentage ONLY. The bound it is judged against is
  // `checks[geocode_coverage].limit_from_config` -> `geocode_permits_coverage_warn_pct`,
  // resolved by the library. A compute that compared them would be re-deriving the verdict
  // (Rule 10) and re-introducing exactly the second literal whose five-day disagreement
  // with the first is `GP-D1`.
  const geocodeCoverage = totalPermits > 0 ? (totalGeocoded / totalPermits) * 100 : 0;

  // ⚠️ FENCE F7 — the max(0, …) floor is PINNED, not tidied. The subtrahend is a
  // POST-transaction rowCount measured against a PRE-transaction count, so a permits load
  // committing between them makes the difference negative (`e37eaab9`).
  const backlogRemaining = Math.max(0, Number(geocode.before_to_geocode || 0) - newlyGeocoded);

  return {
    matched: {
      total_permits: totalPermits,
      already_geocoded: Number(geocode.before_already_geocoded || 0),
      newly_geocoded: newlyGeocoded,
      total_geocoded: totalGeocoded,
      geocode_coverage: geocodeCoverage,
      no_geo_id: noGeoId,
      zombies_cleaned: zombiesCleaned,
      backlog_remaining: backlogRemaining,
      // GP-L2 — measured every run, emitted, read by nobody. Declared in limitations[].
      has_geo_id_no_match: hasGeoIdNoMatch,
      // The second half of the same blind spot (peel candidate P4): logged pre-conversion,
      // never an audit row, and `guards.empty_source` is "none".
      address_points_loaded: Number(geocode.address_points_loaded || 0),
    },
    compute: {
      // records_total's source. W1's rowCount, NEVER the pre-run backlog (Spec 47 §11).
      newly_geocoded: newlyGeocoded,
      // Structurally 0: class N's executor refuses INSERT INTO / ON CONFLICT text, so this
      // step cannot create a `permits` row. Declared as a finite literal rather than omitted,
      // because an omitted source resolves null and null reads as "not counted" (Spec 48 §3.6).
      records_new_aggregate: 0,
      // records_updated's source — the SAME number as records_total, and deliberately
      // EXCLUDING phase 2's rowCount, which is carried on `zombies_cleaned` instead.
      records_updated_aggregate: newlyGeocoded,
    },
  };
}

// ===========================================================================
// Checks — one function per declared check, keys === descriptor.checks[].id in declaration
// order (§5.5 (1)/(4)). Each reads `ctx.matched.<id>` and reports; none judges.
// ===========================================================================

/** The coverage denominator, read AFTER the writes (fence F6, `d24c964c`'s read-skew fix). */
function total_permits(ctx) {
  ctx.report('total_permits', { violations: 0, detail: ctx.matched.total_permits });
}

/** The one genuinely PRE-run row on this step, and the one that makes `newly_geocoded` interpretable. */
function already_geocoded(ctx) {
  ctx.report('already_geocoded', { violations: 0, detail: ctx.matched.already_geocoded });
}

/**
 * W1's rowCount. Named "newly" but it counts rows whose coordinates CHANGED — including a
 * re-geocode of a permit whose geo_id now resolves elsewhere. The name is the pinned
 * contract (`src/lib/admin/funnel.ts` reads this step's summary); the semantics are stated
 * here and in notes.json, never left to the name.
 */
function newly_geocoded(ctx) {
  ctx.report('newly_geocoded', { violations: 0, detail: ctx.matched.newly_geocoded });
}

/** The coverage numerator. With `total_permits` it is the only pair from which a reader of the audit table alone can re-derive the percentage. */
function total_geocoded(ctx) {
  ctx.report('total_geocoded', { violations: 0, detail: ctx.matched.total_geocoded });
}

/**
 * The one gated row. Reports the percentage and NOTHING ELSE — the bound lives in the
 * descriptor as `limit_from_config`, and the verdict is derived from this row's own status
 * by `verdict.js#deriveVerdict`. The pre-conversion file compared the same number to a
 * second hardcoded literal at its `audit_table.verdict` site; that is the Rule 10 violation
 * the conversion retires by construction, and `GP-D1` is the five-day window in which the
 * two literals actually disagreed.
 */
function geocode_coverage(ctx) {
  ctx.report('geocode_coverage', { value: ctx.matched.geocode_coverage });
}

/** The structurally ungeocodable tail — the population `4de16d00` called *"a permanent data gap"*, and the reason the coverage bound is a WARN with a retighten condition rather than a FAIL. */
function no_geo_id(ctx) {
  ctx.report('no_geo_id', { violations: 0, detail: ctx.matched.no_geo_id });
}

/** Phase 2's rowCount, and the retraction's ONLY visibility. Spec 47 §11 names this row verbatim as its own worked example of the audit_table overflow pattern. */
function zombies_cleaned(ctx) {
  ctx.report('zombies_cleaned', { violations: 0, detail: ctx.matched.zombies_cleaned });
}

/** `max(0, pre-run to_geocode − newly_geocoded)`. Spec 47 §11 names this row AND the rule it enforces. */
function backlog_remaining(ctx) {
  ctx.report('backlog_remaining', { violations: 0, detail: ctx.matched.backlog_remaining });
}

const CHECKS = {
  total_permits,
  already_geocoded,
  newly_geocoded,
  total_geocoded,
  geocode_coverage,
  no_geo_id,
  zombies_cleaned,
  backlog_remaining,
};

// ===========================================================================
// records_meta
// ===========================================================================

/**
 * The step's `records_meta` block — the human-scannable run-level roll-up beside the
 * per-check rows.
 *
 * `code_version` is a SELF-CONSUMED PRODUCER FIELD: `staleness.measureTrigger` reads it back
 * off the PRIOR run to decide whether the declared `logic_version` moved, and the baseline is
 * CHAIN-SCOPED, so `permits:geocode_permits` and `sources:geocode_permits` keep independent
 * baselines. Dropping the key makes that signal silently never close.
 *
 * `has_geo_id_no_match` is carried here and NOT as a check row — GP-L2, pinned.
 */
function buildGeocodeMeta(ctx) {
  const m = ctx.matched;
  return {
    duration_ms: ctx.elapsed_ms,
    code_version: ctx.descriptor.staleness.logic_version,
    permits_total: m.total_permits,
    total_geocoded: m.total_geocoded,
    has_geo_id_no_match: m.has_geo_id_no_match,
    no_geo_id: m.no_geo_id,
    zombies_cleaned: m.zombies_cleaned,
    address_points_loaded: m.address_points_loaded,
  };
}

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else. The loop is the error boundary:
 * whatever an observer throws becomes `{ error }` under that observer's own id, so one
 * failure never suppresses the observers after it and never lands on another check's row.
 */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  // No post-phase result means the run stopped before it produced one (a self-skip, or a
  // config refusal above the lock). Building a half-populated block here would publish
  // zeroes as if they had been measured.
  if (!ctx.matched) return { records_meta: {} };
  return { records_meta: buildGeocodeMeta(ctx) };
}

// The declared phase order — names MUST match `execution.phases[].name`, in order.
const passes = [
  { name: 'geocode', txn: 'shared', run: runGeocodePass },
  { name: 'zombie_cleanup', txn: 'shared', run: runZombieCleanupPass },
];

// `module.exports` MUST be the `compute(ctx)` FUNCTION itself (pipeline.step's contract),
// decorated with the static properties the ENRICHER runner reads off it: `passes[]` (the
// per-phase execution table) and `computePostPhase` (BY THE NAME the descriptor declares in
// `execution.enrich_hooks.post_phase`). The SQL builders and the two count queries are
// exported for the fence locks in src/tests/steps/geocode_permits/violations.test.ts, which
// assert on the STATEMENT TEXT — the CASE-cast fence and the two-column guard are properties
// of that text, and class N is descriptive-only, so nothing else would catch their removal.
module.exports = Object.assign(compute, {
  // §5.5 (1) — the dispatch table itself, exported so `step-conformance.infra.test.ts` can
  // assert its keys are EXACTLY the descriptor's `checks[]` ids, IN DECLARATION ORDER,
  // against the real object rather than a copy. Omitting this export is not cosmetic: the
  // conformance check reads `undefined` and Rule 2 goes enforced-red.
  checks: CHECKS,
  BEFORE_COUNTS_SQL,
  AFTER_COUNTS_SQL,
  buildGeocodeSql,
  runGeocodePass,
  runZombieCleanupPass,
  computePostPhase,
  buildGeocodeMeta,
  passes,
});
