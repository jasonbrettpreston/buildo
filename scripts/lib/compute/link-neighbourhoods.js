/**
 * link_neighbourhoods — the domain half of the LINK 3/3 conversion (Spec 122 §5.5).
 *
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §"Link Neighbourhoods" (this step's own contract)
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 11
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown row 18
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (compute is just compute), §8 (shape freeze)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-W: compute MUST NOT branch on PostGIS availability)
 *
 * WHAT IS *NOT* IN HERE, AND WHY — read this before adding anything.
 *
 * The pre-conversion file carried TWO implementations of the same containment answer,
 * chosen at runtime by `SELECT 1 FROM pg_extension WHERE extname = 'postgis'`. The JS/Turf
 * one is RETIRED (LN-D2, operator ruling Ask 2, 2026-09-16) — not ported, not wrapped.
 * `scripts/ast-grep-rules/compute-shape.yml`'s `compute-no-postgis-branch` rule makes that
 * structural rather than a matter of discipline: a `hasPostGIS`-shaped branch under
 * `scripts/lib/compute/**` fails the shape gate. The replacement is a DECLARATION —
 * `guards.requires[{kind: "extension", name: "postgis", on_missing: "fail"}]` — so a
 * database without the extension HALTS instead of silently answering a different question
 * with a second algorithm. Run evidence for the retirement (Q6): across 50 completed runs
 * 2026-03-03 → 2026-07-17 the JS branch's own single-site discriminator
 * (`records_meta.polygon_tests_skipped`, incremented only inside its BBOX pre-filter)
 * reads > 0 in ZERO of them.
 *
 * Also absent, and also on purpose:
 *   · the `-1` no-match sentinel (LN-D1) — unwriteable since 2026-04-17/24; `safe-math`
 *     throws on a negative and migration 109's FK has no negative `neighbourhoods.id` to
 *     point at. Its residue is asserted by the `sentinel_residue` check, not written.
 *   · the parcel-centroid coordinate substitute (LN-D6) — retired with the JS branch. The
 *     population it used to serve is COUNTED by the `neighbourhood_id_unreachable_no_coords`
 *     plausibility row (1,493 at conversion), never silently dropped.
 *   · `polygon_tests_skipped` (LN-D8) — it counted work only the retired branch did.
 *   · a batch loop and a keyset cursor. The surviving write is ONE server-side statement
 *     (`execution.txn_scope: "statement"`, `batch: "none"`, `partial_fill: "atomic"`).
 *     The draft descriptor declared the RETIRED branch's batching here; lifting it onto the
 *     surviving path would have added a partial-commit exposure the pre-conversion PostGIS
 *     path never had, inside a commit whose whole claim is that nothing changed.
 *   · any FULL mode (LN-D9). The pre-conversion file reads `process.argv` nowhere.
 */
'use strict';

// ===========================================================================
// The two predicates, named once
// ===========================================================================

/**
 * THE ELIGIBILITY SCOPE — `staleness.scope`, the write's own WHERE, and the
 * `permits_processed` denominator, all the same string so they cannot drift.
 *
 * ⚠️ IT IS NARROWER THAN THE PRE-CONVERSION `totalPermits` COUNT, DELIBERATELY (LN-D6).
 * That count LEFT JOINed `permit_parcels`/`parcels` and counted permits with coordinates
 * OR a linked parcel geometry — but the live PostGIS write has only ever touched permits
 * with coordinates, so on every run the step reported work it structurally could not do
 * and those permits stayed NULL and were re-counted forever. Measured at conversion: the
 * wider count reads 1,493 while the write's own eligible set reads 0. The narrower set is
 * the truthful one; the 1,493 is declared and counted by its own plausibility row.
 */
const ELIGIBLE_SCOPE = 'p.neighbourhood_id IS NULL AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL';

/**
 * The polygon corpus filter — `geom` (PostGIS), NEVER `geometry` (GeoJSON).
 *
 * LN-D5: the pre-conversion file read BOTH in one run. Its loader/audit query filtered
 * `geometry IS NOT NULL` while the live write filtered `n.geom IS NOT NULL`, so
 * `neighbourhoods_loaded` could report a healthy 158 during a run that matched against
 * fewer polygons. Measured at conversion the two agree exactly (158/158, and
 * `NOT ST_Equals(geom, geometry)` returns 0) — but nothing ENFORCES that agreement, which
 * is why reading one corpus is the fix and `guards.requires[column neighbourhoods.geom]`
 * is what refuses a database where it is missing.
 */
const CORPUS_FILTER = 'geom IS NOT NULL';

// ===========================================================================
// The SQL text builder. Pure: no pool, no client, no execution, no clock.
// ===========================================================================

/**
 * Every statement `runLinkColumnPhase` issues, as text, derived from the descriptor.
 *
 * ⚠️ `update_sql` IS THE PRE-CONVERSION STATEMENT, PORTED VERBATIM except for the SRID,
 * which comes from `guards.srid` instead of a literal 4326 (Rule 3). Do not "tidy" it:
 *   · `n.geom IS NOT NULL` is the corpus filter, not redundant with the join — a NULL geom
 *     makes ST_Contains return NULL and the row would be silently dropped either way, but
 *     the explicit filter is what makes the corpus this run matched against COUNTABLE.
 *   · the `::float` casts on `p.longitude`/`p.latitude` are ported as-is. Both columns are
 *     `numeric`, so the cast cannot throw on data (a plan-panel lens claimed it could —
 *     refuted by `information_schema.columns`).
 *   · `RETURNING p.permit_num` is ported. `executeSetBasedJoinUpdate` reads `rowCount`, so
 *     the returned rows are not consumed — but removing it would change the statement text
 *     the golden differential compares, for no gain.
 *
 * @param {object} descriptor - the validated step descriptor
 * @param {Readonly<Record<string, number>>|null} [config] - `ctx.config`; unused today
 *   (every declared tunable bounds a CHECK, none bounds a predicate), taken for signature
 *   parity with the other LINK computes and so a future bound has an obvious home
 * @param {'full'|'incremental'} [mode] - the resolved mode. ALWAYS `"incremental"`:
 *   `staleness.mode_select` is `"none"` and `override.force_full` is `"none"` (LN-D9).
 *   The parameter exists so the shape matches its siblings; branching on it here without
 *   a declared FULL mode would be a capability the descriptor does not promise.
 */
function buildMatchSql(descriptor, config, mode) {
  // Coerced, though the REAL guard is the schema: `guards.srid` is `{"anyOf": [{"const":
  // "none"}, {"type": "integer"}]}` in step.schema.json, and `validateDescriptor` runs before
  // any statement is built, so a string payload cannot reach here. An output-panel lens
  // proposed `4326)) OR TRUE --` as an injection that would stamp every permit; it is
  // REFUTED by that schema type, not by this line. The coercion is defence-in-depth and a
  // place to record the constraint, since this is the one value interpolated as TEXT.
  const srid = Number(descriptor.guards.srid);
  if (!Number.isInteger(srid)) {
    throw new Error(`[link_neighbourhoods] guards.srid must be an integer, got ${JSON.stringify(descriptor.guards.srid)}`);
  }
  return {
    // The polygon corpus, counted BEFORE the write — the `pre_write` gate's subject.
    // Pre-conversion this number was taken at :80 and only REPORTED at :343, after every
    // write had already been issued, so a zero-corpus run walked the whole eligible set,
    // matched nothing, and verdicted FAIL with the damage already done.
    corpus_sql:
      `SELECT count(*)::int AS n FROM neighbourhoods WHERE ${CORPUS_FILTER};`,

    eligible_count_sql:
      `SELECT count(*)::int AS total FROM permits p WHERE ${ELIGIBLE_SCOPE};`,

    // W1, ported verbatim. ONE statement, its own implicit transaction.
    update_sql:
      'UPDATE permits p SET neighbourhood_id = n.id\n'
      + '  FROM neighbourhoods n\n'
      + ` WHERE n.${CORPUS_FILTER}\n`
      + `   AND ${ELIGIBLE_SCOPE}\n`
      + `   AND ST_Contains(n.geom, ST_SetSRID(ST_MakePoint(p.longitude::float, p.latitude::float), ${srid}))\n`
      + ' RETURNING p.permit_num;',

    // ONE post-write round trip for the cumulative rate AND every table-wide observation
    // the checks assert BY COUNT.
    //
    // ⚠️ `neighbourhood_id != -1` IS PORTED VERBATIM from :333 and is NOT a leftover.
    // LN-D1 retires the sentinel's WRITE; it does not assert that no historical row still
    // carries one. Measured at conversion the term changes nothing (0 negative ids), so
    // keeping it costs nothing and keeps the emitted rate byte-identical to the
    // pre-conversion capture — and `negative_ids` below is what turns "there are none"
    // from an assumption into a reported number.
    cumulative_sql:
      'SELECT\n'
      + '  (SELECT count(*)::int FROM permits WHERE neighbourhood_id IS NOT NULL AND neighbourhood_id != -1) AS linked,\n'
      + '  (SELECT count(*)::int FROM permits) AS total,\n'
      + '  (SELECT count(*)::int FROM permits WHERE neighbourhood_id < 0) AS negative_ids,\n'
      + `  (SELECT count(*)::int FROM permits p WHERE ${ELIGIBLE_SCOPE}) AS no_match_remaining,\n`
      + `  (SELECT count(*)::int FROM neighbourhoods WHERE ${CORPUS_FILTER}) AS neighbourhoods_loaded;`,
  };
}

// ===========================================================================
// Pure helpers
// ===========================================================================

/**
 * Read one scalar out of a result row, refusing to invent a value.
 *
 * ⚠️ NOT `Number(row.x) || 0`. Three output-panel lenses independently flagged that idiom
 * here and they were right: it collapses THREE different situations into the same
 * plausible number — a renamed or misspelled SQL alias (`undefined`), a genuine zero, and
 * a NaN. The `neighbourhoods_loaded` FAIL check exists specifically to fire when the corpus
 * is 0, and `Number(row.neighbourhoods_loaded) || neighbourhoodsLoaded` would have
 * substituted the PRE-write count for a legitimate post-write 0, so the check could never
 * have fired — a guard that structurally never excludes anything, the CC-D3 failure shape
 * relocated. A missing key is a compute/SQL defect and throws; a real 0 is returned as 0.
 */
function scalar(row, key) {
  const v = row ? row[key] : undefined;
  if (v === undefined || v === null) {
    throw new Error(`[link_neighbourhoods] cumulative query returned no "${key}" column — the SQL alias and the reader disagree`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`[link_neighbourhoods] "${key}" is not a finite number: ${JSON.stringify(v)}`);
  }
  return n;
}

/** A percentage, or 0 when the denominator is not positive — the pre-conversion form at :338. */
function linkRatePct(linked, total) {
  return total > 0 ? (linked / total) * 100 : 0;
}

/** The single write target's counters, by declared position. */
function target(ctx) {
  return (ctx.written && ctx.written.e1) || {};
}

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

/**
 * THE PRE-WRITE GATE (Rule 11, `order_guarantee`). The ONLY check whose FAIL must stop a
 * statement being issued: the very next thing the runner does is the containment UPDATE,
 * and against an empty corpus that walks every eligible permit, matches nothing, and
 * leaves them all NULL.
 *
 * Reports `value` (not `violations`) because its declared bound is `value_min`, which
 * reads the raw measured value. `limit_from_config` substitutes the floor from
 * `sources_neighbourhoods_floor` — the SAME registry row assert_data_bounds reads, shared
 * deliberately (Ask 5): 158 is one municipal boundary count and a second row for it would
 * be a second source of truth.
 */
function neighbourhoods_loaded_before_write(ctx) {
  // ⚠️ READS ITS OWN PRESERVED FIELD, never `neighbourhoods_loaded`. This check is scored
  // TWICE on a writing run — once by the pre_write gate (with `ctx.checks` narrowed to the
  // pre_write ids) and once in the final pass over the full selection. The first cut read
  // `ctx.matched.neighbourhoods_loaded`, which the runner OVERWRITES with the post-write
  // count after the statement — so a row whose id asserts a before-write reading published
  // the after-write one. Invisible on the measured estate (the corpus is 158 on both sides)
  // and a lie the moment the corpus moves mid-run, which is exactly when this row matters.
  // Found by the output panel; the runner now keeps the two measurements in two fields.
  ctx.report('neighbourhoods_loaded_before_write', { value: ctx.matched.neighbourhoods_loaded_before_write });
}

function permits_processed(ctx) {
  ctx.report('permits_processed', { violations: 0, detail: ctx.matched.permits_processed });
}

/**
 * LN-D3, the one declared differential diff. Pre-conversion the bound was the literal
 * `== 158` with a three-way cascade (PASS at exactly 158, FAIL at 0, WARN otherwise), which
 * WARNs forever the day the City publishes a 159th neighbourhood — the retighten-less
 * permanent-WARN shape R-H forbids. The declared form is a FLOOR plus a `warn_limit` tier,
 * so the pre-conversion cascade is preserved EXACTLY (158+ PASS, 1-157 WARN, 0 FAIL) and
 * the ONLY behaviour that changes is the one this defect exists to change: 159 reads PASS.
 */
function neighbourhoods_loaded(ctx) {
  ctx.report('neighbourhoods_loaded', { value: ctx.matched.neighbourhoods_loaded });
}

function run_linked(ctx) {
  ctx.report('run_linked', { violations: 0, detail: ctx.matched.permits_linked });
}

/**
 * THE CUMULATIVE RATE — fence e53cdcf5, and the reason it is not run-scoped.
 *
 * A run-scoped rate is meaningless in incremental mode: a run that links 3 of 3 newly
 * geocoded arrivals reads 100% while the estate sits far below the floor, so a genuine
 * collapse stays invisible for as long as arrivals keep matching.
 *
 * ⚠️ IT SHIPS RED, ON PURPOSE (LN-D7). The denominator is ALL permits, and 22,152 of the
 * 254,082 carry no coordinates at all, so this step's own eligibility predicate can never
 * touch one and the metric has a corpus-composition ceiling of 94.83% that no amount of
 * step health can lift. Over the 231,930 coordinate-bearing permits the same numerator
 * reads 100.00%. The denominator is PINNED here (Spec 123 §3.1 — changing it inside the
 * conversion would be a second, undeclared differential diff); the fix is its own peel.
 */
function link_rate(ctx) {
  ctx.report('link_rate', { value: linkRatePct(ctx.cumulative.linked, ctx.cumulative.total) });
}

/** The catastrophic-collapse arm of the same metric — its OWN row, because Rule 10 derives the verdict from rows. */
function link_rate_floor(ctx) {
  ctx.report('link_rate_floor', { value: linkRatePct(ctx.cumulative.linked, ctx.cumulative.total) });
}

/**
 * Pre-conversion this was an INFO row beside a `-1` sentinel write that made the population
 * write-once, so it vanished from every later run's counter. With the sentinel retired
 * (LN-D1) the same permits are re-walked every run, so the counter stops being descriptive
 * and becomes the standing cost signal — which R-H makes WARN-with-a-retighten-condition,
 * never INFO-by-taste. Measured at conversion it reads 0: every coordinate-bearing permit
 * is linked, so the retirement currently costs nothing measurable.
 */
function no_neighbourhood_match(ctx) {
  ctx.report('no_neighbourhood_match', { violations: ctx.matched.no_match, detail: ctx.matched.no_match });
}

/** The lock that keeps LN-D1 retired. A negative id is unwriteable under the FK, so non-zero means the FK is gone or a second writer exists — both findings outside this step. */
function sentinel_residue(ctx) {
  ctx.report('sentinel_residue', { violations: ctx.matched.negative_ids, detail: ctx.matched.negative_ids });
}

/**
 * Under an RLS-constrained role a set-based UPDATE affects 0 rows WITH NO ERROR, so
 * "wrote nothing" and "is not allowed to write" are indistinguishable without this.
 * Measured at conversion: `permits` has `relrowsecurity = true` with ZERO policies, so the
 * guard has no margin at all — it passes only because the pipeline role bypasses RLS.
 */
function write_privilege(ctx) {
  const p = (ctx.written && ctx.written.privilege) || null;
  // ⚠️ `assertWritePrivileges` returns the RAW probe — `{rls_enabled, policies, bypassrls}`
  // — and NOT a `writable` boolean; it computes that word internally and throws on it, but
  // never hands it back. The first cut of this observer read `p.writable`, which is
  // `undefined` for every role on every database, so the check reported FAIL on a
  // BYPASSRLS superuser and flipped the whole run's verdict to FAIL and its terminal to
  // `failed_write_privilege`. Caught by the POST golden capture, not by review. The
  // predicate below mirrors `link_massing`'s own observer and `write.js`'s internal
  // `writable` expression exactly. `detail` is a STRING, not the probe object: LM-D16
  // records an object-valued detail rendering as the literal "[object Object]" in
  // `records_meta.errors` and being shown that way to operators.
  const writable = Boolean(p && (p.rls_enabled === false || p.bypassrls === true || p.policies > 0));
  ctx.report('write_privilege', {
    violations: writable ? 0 : 1,
    detail: p ? `bypassrls=${p.bypassrls === true} policies=${p.policies} rls_enabled=${p.rls_enabled === true}` : 'not measured',
  });
}

// ===========================================================================
// records_meta
// ===========================================================================

/**
 * The step's `records_meta` block.
 *
 * ⚠️ `code_version` IS A SELF-CONSUMED PRODUCER FIELD and the COMPUTE's job, not the
 * runner's — `staleness.measureTrigger` reads it back off the PRIOR run to decide whether
 * the declared `logic_version` moved. If this key is ever dropped, `prior.code_version` is
 * absent forever and the trigger's `changed` signal silently never closes. Note the
 * baseline is CHAIN-SCOPED (`ledgerPipelineName` keys it `<chain>:<slug>`), so
 * `permits:link_neighbourhoods` and `sources:link_neighbourhoods` keep independent
 * baselines and the weekly `sources` one lags the daily `permits` one by up to a week.
 *
 * `polygon_tests_skipped` is deliberately ABSENT (LN-D8) — it counted BBOX tests only the
 * retired JS branch ever performed, and it has zero consumers anywhere in `src/` or
 * `scripts/` outside the pre-conversion file itself.
 */
function buildLinkMeta(ctx) {
  const m = ctx.matched;
  return {
    duration_ms: ctx.elapsed_ms,
    code_version: ctx.descriptor.staleness.logic_version,
    permits_processed: m.permits_processed,
    permits_linked: m.permits_linked,
    no_match_count: m.no_match,
    neighbourhoods_loaded: m.neighbourhoods_loaded,
  };
}

// ---- dispatch ----

/** §5.5 (1) — keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  neighbourhoods_loaded_before_write,
  permits_processed,
  neighbourhoods_loaded,
  run_linked,
  link_rate,
  link_rate_floor,
  no_neighbourhood_match,
  sentinel_residue,
  write_privilege,
};

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else.
 *
 * ⚠️ CALLED TWICE ON A WRITING RUN. The runner invokes it once with `ctx.checks` narrowed
 * to the `when: "pre_write"` ids (to decide whether the UPDATE may be issued at all) and
 * once with the full selection afterwards. Nothing here changes between the two, because
 * the loop is already scoped to `ctx.checks` — what the position relies on is that a
 * pre_write observer is a pure function of what has been MEASURED before any write, which
 * the write does not touch.
 *
 * The loop is the error boundary: whatever an observer throws becomes `{ error }` under
 * that observer's own id, so one failure never suppresses the observers after it and never
 * lands on another check's row.
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
  // No post-write result means the run stopped before it produced one (a pre_write
  // refusal). Building a half-populated block here would publish zeroes as if they had
  // been measured — and one of these fields is the NEXT run's own gate baseline.
  if (!ctx.matched || !ctx.cumulative) return { records_meta: {} };
  return { records_meta: buildLinkMeta(ctx) };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildMatchSql = buildMatchSql;
module.exports.buildLinkMeta = buildLinkMeta;
// Structural constants, exported so their locks read the real value rather than a copy.
module.exports.ELIGIBLE_SCOPE = ELIGIBLE_SCOPE;
module.exports.CORPUS_FILTER = CORPUS_FILTER;
module.exports.linkRatePct = linkRatePct;
// The runner reads its own post-write scalars through this, so "a missing column" and
// "a measured zero" can never render as the same number on either side of the seam.
module.exports.scalar = scalar;
