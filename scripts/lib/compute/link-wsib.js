/**
 * SPEC LINK: docs/specs/01-pipeline/46_wsib_enrichment.md §2 (Contact Flow), §3 (Behavioral Contract)
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §2 (Step Registry row 19), §"Link WSIB"
 * SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md §2-§3 (source cadence, load_wsib contract)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2a, §1.4, §4.1, §5.1, §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rules 1-12)
 *
 * WSIB Registry Matching — THE DOMAIN LOGIC ONLY.
 *
 * WHAT THIS FILE IS. Under the A-1 ruling (Fold A/B, 2026-08-28), commit 7 forks
 * `runLinkPhase` rather than extending it: this step is a BULK 3-tier cascade with NO
 * batching/pagination (unlike link_massing's keyset-paginated single-pass-per-batch
 * loop) and THREE write statements per tier across TWO tables. `scripts/lib/step/index.js
 * runCascadePhase` owns the transaction, the gated-skip, the mode gate and the ordered
 * per-tier writes[]; what is left here, exactly per Rule 2 (compute is domain logic
 * only), is:
 *
 *   1. buildTierSql(descriptor, config, tier, runAt) — ruling A-2 option 2, same split as
 *      link_massing's buildMatchSql. The MATCH PREDICATE per tier (exact trade name,
 *      exact legal name, pg_trgm fuzzy) and the wsib_registry / entities-contacts UPDATE
 *      text are SQL TEXT, pure, no pool — the library executes it via
 *      write.executeSetBasedJoinUpdate (LG-11).
 *   2. buildRetractionSql / buildContactsReverseClearSql — A-7's tier-3 repair (LG-16),
 *      declared and wired, NOT exercised by commit 7 (mode never resolves "full" in any
 *      commit-7 invocation — A-8 fires only off the load_wsib corpus signal or
 *      LINK_WSIB_FORCE_FULL; the budgeted live repair run is commit 8's act).
 *   3. one named observer per declared check, reading what the library measured.
 *
 * THE CTX CONTRACT (what the library hands a MATCHER compute):
 *   · ctx.matched     — what the cascade produced this run: the pre-run unlinked count,
 *                       per-tier link counts, the fan-in max, and (mode full only) the
 *                       retraction counts
 *   · ctx.cumulative  — the cumulative link-rate numerator/denominator, over ALL of
 *                       wsib_registry (never run-scoped — most WSIB entries have no
 *                       matching entity in the ~3.9K builder pool, so a run-scoped rate
 *                       reads near-zero on every healthy incremental run)
 *   · ctx.written     — PER DECLARED TARGET (written.e1..e4)
 *   · ctx.gate        — the tri-state mode decision + the ledger gated-skip decision
 *   · ctx.prior       — the prior COMPLETED run's declared emit (self-consumed baseline)
 *   · ctx.overrides   — the resolved override.force_full / dry_run flags
 *   · ctx.config      — T1-T7, resolved and bounds-checked before this file runs
 *
 * ⚠️ THE VERDICT IS NOT COMPUTED HERE (routes through scripts/lib/step/verdict.js
 * deriveVerdict, row-derived, Rule 10). THE COUNTERS ARE NOT ASSIGNED HERE (resolved by
 * the runner from descriptor.counters[].source against written.e1, D-8).
 */
'use strict';

/** S2 — the length floor on the two EXACT-match tiers (LW-D6: exact tolerates a shorter string than fuzzy). */
const EXACT_LENGTH_FLOOR = 3;
/** S2 — the length floor inside the fuzzy tier's CTEs (higher: a fuzzy match on a short string is garbage). */
const FUZZY_LENGTH_FLOOR = 5;
/** S3 — the Tier 3 safety cap, per invocation. Structural, not an operator knob (raising it changes worst-case cost, not match quality). */
const TIER3_LIMIT = 1000;

/** `execution.tiers[].id` values, in cascade order (highest confidence first). */
const TIER_IDS = Object.freeze({
  EXACT_TRADE: 'tier1_exact_trade',
  EXACT_LEGAL: 'tier2_exact_legal',
  FUZZY: 'tier3_fuzzy',
});

/**
 * ONE tier's full statement set, as text, derived from the descriptor + resolved config.
 *
 * ⚠️ d704a447 — THE ARTICLE-STRIPPING BLOCKING PREDICATE (LW-D notes, §2 of the
 * assessment). Both the exact tiers' JOIN and the fuzzy tier's CTEs compare the first
 * letter of each name AFTER stripping a leading THE/A/AN, which is what keeps the
 * trigram GIN index selective (without it, "THE ABC COMPANY" and "ABC COMPANY" land in
 * different first-letter buckets and never compare). This is the MOST consequential
 * fence in the 17-commit corpus: everything the `wsib_tier3_current_predicate_pass_rate_pct`
 * invariant measures is "did this row's link satisfy the predicate AS IT STANDS TODAY" —
 * because the `WHERE linked_entity_id IS NULL` scope is monotone (a row can only be
 * matched ONCE, ever), a fix here can never retroactively repair a link written under a
 * prior algorithm. That is LW-D5's whole root cause and A-7's whole reason to exist.
 *
 * @param {object} descriptor
 * @param {Readonly<Record<string, number>>} config - ctx.config
 * @param {{id: string, confidence_from_config: string}} tier
 * @param {Date} runAt - the single DB-clock capture for this run (Spec 47 §R3.5)
 * @returns {{wsib_update_sql: string, wsib_update_params: unknown[], entities_flag_scope_params: unknown[], entities_contacts_sql: string, entities_contacts_params: unknown[]}}
 */
function buildTierSql(descriptor, config, tier, runAt) {
  const confidence = config[tier.confidence_from_config];
  const entitiesContactsSql = buildContactsSql();
  if (tier.id === TIER_IDS.EXACT_TRADE) {
    return {
      wsib_update_sql: buildExactMatchSql('trade_name_normalized'),
      wsib_update_params: [runAt, confidence],
      entities_flag_scope_params: [confidence],
      entities_contacts_sql: entitiesContactsSql,
      entities_contacts_params: [confidence],
    };
  }
  if (tier.id === TIER_IDS.EXACT_LEGAL) {
    return {
      wsib_update_sql: buildExactMatchSql('legal_name_normalized'),
      wsib_update_params: [runAt, confidence],
      entities_flag_scope_params: [confidence],
      entities_contacts_sql: entitiesContactsSql,
      entities_contacts_params: [confidence],
    };
  }
  if (tier.id === TIER_IDS.FUZZY) {
    const wsibFuzzyMatchThreshold = config.wsib_fuzzy_match_threshold;
    return {
      wsib_update_sql: buildFuzzyMatchSql(),
      // $1 RUN_AT, $2 similarity threshold (set_config + both CTE comparisons), $3 confidence
      wsib_update_params: [runAt, wsibFuzzyMatchThreshold, confidence],
      entities_flag_scope_params: [confidence],
      entities_contacts_sql: entitiesContactsSql,
      entities_contacts_params: [confidence],
    };
  }
  throw new Error(`[link_wsib compute] buildTierSql: unknown tier id "${tier.id}"`);
}

/** Tier 1 / Tier 2 — exact name match, one wsib_registry column vs entities.name_normalized. */
function buildExactMatchSql(wsibColumn) {
  return `WITH matched AS (
  SELECT DISTINCT ON (w.id) w.id AS wsib_id, e.id AS entity_id
  FROM wsib_registry w
  JOIN entities e ON e.name_normalized = w.${wsibColumn}
  WHERE w.linked_entity_id IS NULL
    AND w.${wsibColumn} IS NOT NULL
    AND LENGTH(w.${wsibColumn}) >= ${EXACT_LENGTH_FLOOR}
  ORDER BY w.id, e.permit_count DESC
)
UPDATE wsib_registry w
SET linked_entity_id = m.entity_id,
    match_confidence = $2,
    matched_at = $1::timestamptz
FROM matched m
WHERE w.id = m.wsib_id`;
}

/**
 * Tier 3 — pg_trgm fuzzy match across BOTH trade_name and legal_name, GIN-index-backed.
 *
 * `set_config('pg_trgm.similarity_threshold', $2::text, true)` is TRANSACTION-scoped
 * (`is_local = true`), not session-scoped like the pre-conversion `SET .../RESET ...`
 * pair — a deliberate, declared improvement (G-10's guarantee is honoured: the GUC is
 * set on the SAME client the query runs on, before the query, and it can never leak to
 * later work on a pooled connection because it auto-resets at COMMIT/ROLLBACK, which a
 * forgotten manual RESET could not guarantee). `d704a447`'s article-stripping predicate
 * and `647d0935`'s trade/legal CTE split (for GIN index use, avoiding the ~394M-row
 * nested loop the OR-joined version produced) are both preserved verbatim.
 */
function buildFuzzyMatchSql() {
  return `WITH _cfg AS (SELECT set_config('pg_trgm.similarity_threshold', $2::text, true)),
trade_matches AS (
  SELECT w.id AS wsib_id, e.id AS entity_id, e.permit_count,
         similarity(w.trade_name_normalized, e.name_normalized) AS score
  FROM wsib_registry w
  JOIN entities e ON w.trade_name_normalized % e.name_normalized
    AND LEFT(REGEXP_REPLACE(w.trade_name_normalized, '^(THE|A|AN) ', ''), 1)
      = LEFT(REGEXP_REPLACE(e.name_normalized, '^(THE|A|AN) ', ''), 1)
  WHERE w.linked_entity_id IS NULL
    AND w.trade_name_normalized IS NOT NULL
    AND LENGTH(w.trade_name_normalized) >= ${FUZZY_LENGTH_FLOOR}
    AND LENGTH(e.name_normalized) >= ${FUZZY_LENGTH_FLOOR}
    AND similarity(w.trade_name_normalized, e.name_normalized) > $2::float
),
legal_matches AS (
  SELECT w.id AS wsib_id, e.id AS entity_id, e.permit_count,
         similarity(w.legal_name_normalized, e.name_normalized) AS score
  FROM wsib_registry w
  JOIN entities e ON w.legal_name_normalized % e.name_normalized
    AND LEFT(REGEXP_REPLACE(w.legal_name_normalized, '^(THE|A|AN) ', ''), 1)
      = LEFT(REGEXP_REPLACE(e.name_normalized, '^(THE|A|AN) ', ''), 1)
  WHERE w.linked_entity_id IS NULL
    AND LENGTH(w.legal_name_normalized) >= ${FUZZY_LENGTH_FLOOR}
    AND LENGTH(e.name_normalized) >= ${FUZZY_LENGTH_FLOOR}
    AND similarity(w.legal_name_normalized, e.name_normalized) > $2::float
),
combined AS (
  SELECT * FROM trade_matches
  UNION ALL
  SELECT * FROM legal_matches
),
matched AS (
  SELECT DISTINCT ON (wsib_id) wsib_id, entity_id
  FROM combined
  ORDER BY wsib_id, score DESC, permit_count DESC
  LIMIT ${TIER3_LIMIT}
)
UPDATE wsib_registry w
SET linked_entity_id = m.entity_id,
    match_confidence = $3,
    matched_at = $1::timestamptz
FROM matched m
WHERE w.id = m.wsib_id`;
}

/**
 * The entities.is_wsib_registered flag flip's SCOPE — declared columns[]/write_discipline
 * in the descriptor generate the statement; only the $1 (tier confidence) scope
 * parameter is per-tier. Exported so the descriptor's `write_discipline.scope` string and
 * this runtime binding cannot silently disagree (both name "$1 = the tier's confidence").
 */
const ENTITIES_FLAG_SCOPE = 'id IN (SELECT linked_entity_id FROM wsib_registry WHERE match_confidence = $1) AND is_wsib_registered = false';

/**
 * copyContacts — VERBATIM from the pre-conversion algorithm (647d0935's NULLIF/aggregate
 * guard), parameterized by tier confidence. `set_based_join_update` (LG-11) is the
 * dispatch class: the SET clause's values are subquery-aggregated, not a declared
 * constant, so `set_based_scoped`'s constant-only codegen cannot express it.
 */
function buildContactsSql() {
  return `UPDATE entities e
SET primary_phone = COALESCE(NULLIF(TRIM(e.primary_phone), ''), w_agg.primary_phone),
    primary_email = COALESCE(NULLIF(TRIM(e.primary_email), ''), w_agg.primary_email),
    website = COALESCE(NULLIF(TRIM(e.website), ''), w_agg.website)
FROM (
  SELECT linked_entity_id,
         MAX(primary_phone) FILTER (WHERE primary_phone IS NOT NULL AND TRIM(primary_phone) != '') AS primary_phone,
         MAX(primary_email) FILTER (WHERE primary_email IS NOT NULL AND TRIM(primary_email) != '') AS primary_email,
         MAX(website) FILTER (WHERE website IS NOT NULL AND TRIM(website) != '') AS website
  FROM wsib_registry
  WHERE match_confidence = $1
  GROUP BY linked_entity_id
) w_agg
WHERE w_agg.linked_entity_id = e.id
  AND (
    (NULLIF(TRIM(e.primary_phone), '') IS NULL AND w_agg.primary_phone IS NOT NULL) OR
    (NULLIF(TRIM(e.primary_email), '') IS NULL AND w_agg.primary_email IS NOT NULL) OR
    (NULLIF(TRIM(e.website), '') IS NULL AND w_agg.website IS NOT NULL)
  )`;
}

// ===========================================================================
// A-7 — the tier-3 repair (LG-16). Declared and wired; NOT exercised by commit 7.
// ===========================================================================

/**
 * The LG-16 UPDATE-to-NULL retraction, scoped to the fuzzy tier's confidence value —
 * never DELETE (wsib_registry rows are load-wsib.js's exclusive territory; retracting a
 * LINK is not retracting the ROW). `$1` is the tier-3 confidence, matching
 * `write_discipline.scope: "match_confidence = $1"`.
 */
function buildRetractionScopeParams(config, tiers) {
  const fuzzyTier = tiers.find((t) => t.id === TIER_IDS.FUZZY);
  return [config[fuzzyTier.confidence_from_config]];
}

/**
 * The entities.is_wsib_registered CASCADE for A-7: an entity whose ONLY links were just
 * retracted must lose the flag too (LG-16's declared consequence, Fold B item 1).
 */
function buildEntitiesUnflagSql() {
  return `UPDATE entities e
SET is_wsib_registered = false
WHERE e.is_wsib_registered = true
  AND NOT EXISTS (SELECT 1 FROM wsib_registry w WHERE w.linked_entity_id = e.id)`;
}

/**
 * A-7's copyContacts REVERSE pass (Fold B BLOCKING a) — provenance-by-equality: clear a
 * contact field ONLY where the entity's CURRENT value equals a value that existed on one
 * of the now-retracted wsib rows for that entity. Declared limitation (recorded in
 * descriptor.limitations[]): a contact that coincidentally matches a retracted row's
 * value is cleared and re-copied on relink — false-positive exposure measured 0 locally
 * (§ PH-6 of the assessment; the local dev DB carries zero wsib_registry contact values),
 * NOT bounded for cloud.
 *
 * @param {Array<{id:number, primary_phone:string|null, primary_email:string|null, website:string|null}>} retractedWsibRows
 *   the wsib_registry rows' contact-adjacent values AS THEY WERE before the retraction
 *   (the caller must read these BEFORE issuing the LG-16 UPDATE, in the same transaction)
 */
function buildContactsReverseClearSql() {
  return `UPDATE entities e
SET primary_phone = CASE WHEN e.primary_phone = ANY($1::text[]) THEN NULL ELSE e.primary_phone END,
    primary_email = CASE WHEN e.primary_email = ANY($2::text[]) THEN NULL ELSE e.primary_email END,
    website = CASE WHEN e.website = ANY($3::text[]) THEN NULL ELSE e.website END
WHERE e.id = ANY($4::int[])
  AND (
    e.primary_phone = ANY($1::text[]) OR e.primary_email = ANY($2::text[]) OR e.website = ANY($3::text[])
  )`;
}

// ===========================================================================
// Post-write: the cumulative link-rate + every invariant, ONE query
// ===========================================================================

/**
 * ONE post-write query for the cumulative link rate AND every table-wide invariant
 * (structural + fan-in + tier split). Cumulative, never run-scoped, for the identical
 * reason link_massing's `link_rate` is cumulative: most WSIB entries have no matching
 * entity in the ~3.9K builder pool, so a run-scoped rate reads near-zero on a perfectly
 * healthy run.
 */
const CUMULATIVE_SQL = `SELECT
  (SELECT COUNT(*) FROM wsib_registry) AS total,
  (SELECT COUNT(*) FROM wsib_registry WHERE linked_entity_id IS NOT NULL) AS linked,
  (SELECT COUNT(*) FROM wsib_registry WHERE linked_entity_id IS NOT NULL
     AND (match_confidence IS NULL OR matched_at IS NULL)) AS orphan_linked_entity_id,
  (SELECT COUNT(*) FROM wsib_registry WHERE match_confidence IS NOT NULL
     AND match_confidence NOT IN (0.95, 0.90, 0.60)) AS confidence_outside_closed_set,
  (SELECT COUNT(*) FROM wsib_registry WHERE match_confidence >= 0.50 AND match_confidence < 0.60) AS dead_bucket_050_060_count,
  (SELECT jsonb_build_object('0.95', COUNT(*) FILTER (WHERE match_confidence = 0.95),
                              '0.90', COUNT(*) FILTER (WHERE match_confidence = 0.90),
                              '0.60', COUNT(*) FILTER (WHERE match_confidence = 0.60))
     FROM wsib_registry) AS tier_confidence_split,
  (SELECT COUNT(*) FROM entities e WHERE e.is_wsib_registered = true
     AND NOT EXISTS (SELECT 1 FROM wsib_registry w WHERE w.linked_entity_id = e.id)) AS registered_entities_with_zero_links,
  (SELECT COALESCE(MAX(n), 0) FROM (SELECT COUNT(*) AS n FROM wsib_registry WHERE linked_entity_id IS NOT NULL GROUP BY linked_entity_id) f) AS entity_fanin_max,
  (SELECT COUNT(*) FROM (SELECT COUNT(*) AS n FROM wsib_registry WHERE linked_entity_id IS NOT NULL GROUP BY linked_entity_id HAVING COUNT(*) >= 10) m) AS magnet_entities_fanin_ge_10`;

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

function unlinked_start(ctx) {
  ctx.report('unlinked_start', { violations: 0, detail: (ctx.matched && ctx.matched.unlinked_start) || 0 });
}

function tier_1_trade_matches(ctx) {
  ctx.report('tier_1_trade_matches', { violations: 0, detail: tierCount(ctx, 'tier1_exact_trade') });
}

function tier_2_legal_matches(ctx) {
  ctx.report('tier_2_legal_matches', { violations: 0, detail: tierCount(ctx, 'tier2_exact_legal') });
}

function tier_3_fuzzy_matches(ctx) {
  ctx.report('tier_3_fuzzy_matches', { violations: 0, detail: tierCount(ctx, 'tier3_fuzzy') });
}

function no_match(ctx) {
  const linked = totalTierLinked(ctx);
  const noMatch = Math.max(0, ((ctx.matched && ctx.matched.unlinked_start) || 0) - linked);
  ctx.report('no_match', { violations: 0, detail: noMatch });
}

/**
 * The step's one verdict-bound threshold (T2, LW-D1's P4 violation).
 *
 * ⚠️ REPORTED AS THE RATE ITSELF, not the unlinked complement — unlike link_massing's
 * `link_rate` (whose config value happens to equal its own complement, 50). T2 is
 * registered as the FLOOR (default 5, "linkRate >= 5" in the pre-conversion literal),
 * and `limit_from_config`'s substitution is unconditional — it overwrites the limit
 * string's trailing number with the raw config value, so a `pct <=` ceiling would
 * compare the WRONG direction (`pct <= 5` reads "unlinked must stay under 5%", which is
 * backwards for a 4.55-11.53% clean/cumulative rate). `pct >= <n>` (verdict.js, this
 * pilot) is the correctly-shaped floor form.
 */
function link_rate_warn(ctx) {
  const c = ctx.cumulative || {};
  const total = c.total || 0;
  const linked = c.linked || 0;
  const rate = total > 0 ? (linked / total) * 100 : 0;
  ctx.report('link_rate_warn', {
    value: round(rate),
    detail: { link_rate_pct: round(rate), unlinked_pct: round(total > 0 ? 100 - rate : 100), linked, total },
  });
}

/**
 * T6 — the entity fan-in WARN, fires immediately on the known-bad population (171
 * magnets, worst 2,118, MDK CONSTRUCTION) per Fold B's ACCEPTED ruling.
 *
 * LW-D11 (2026-08-28) — reads `ctx.matched.entity_fanin_max` / `ctx.matched.
 * magnet_entities_fanin_ge_10`, the SAME declared post-write-observation mechanism
 * `link_rate_warn` uses (and link_massing's `runLinkPhase` precedent): `runCascadePhase`
 * (scripts/lib/step/index.js) runs this compute's own declared `CUMULATIVE_SQL` once,
 * post-write, and merges every non-linked/total column of its one row generically onto
 * `ctx.matched` — no per-step branch in the runner, no compute-side query here. The
 * step previously read a top-level `ctx.fanin`, a key the library NEVER assigns onto
 * `stepCtx` (proven: `stepCtx`'s own literal in index.js has no `fanin` key) — only the
 * test harness's synthetic `World` fixture carried it, so the check always evaluated
 * `{}`/0 against the live DB (docs/reports/golden/link_wsib/post-8-forced/sources-full-
 * forced-2.json: `entity_fanin_warn` reported 0 while the same capture's invariant
 * `wsib_entity_fanin_max` measured 439) while the unit suite stayed green off the
 * injected fixture. `STEP_CTX_KEYS` (index.js) now closes the harness-fidelity gap.
 */
function entity_fanin_warn(ctx) {
  const m = ctx.matched || {};
  const max = m.entity_fanin_max || 0;
  ctx.report('entity_fanin_warn', { violations: max, detail: { entity_fanin_max: max, magnets_fanin_ge_10: m.magnet_entities_fanin_ge_10 } });
}

function orphan_linked_entity_id(ctx) {
  const n = (ctx.matched && ctx.matched.orphan_linked_entity_id) || 0;
  ctx.report('orphan_linked_entity_id', { violations: n, detail: n });
}

function confidence_outside_closed_set(ctx) {
  const n = (ctx.matched && ctx.matched.confidence_outside_closed_set) || 0;
  ctx.report('confidence_outside_closed_set', { violations: n, detail: n });
}

/** LW-D4 — the [0.50, 0.60) stats bucket is DEAD (no code path writes there); INCIDENTAL, reported not gated. */
function dead_bucket_count(ctx) {
  const n = (ctx.matched && ctx.matched.dead_bucket_050_060_count) || 0;
  ctx.report('dead_bucket_count', { violations: 0, detail: n });
}

function registered_entities_with_zero_links(ctx) {
  const n = (ctx.matched && ctx.matched.registered_entities_with_zero_links) || 0;
  ctx.report('registered_entities_with_zero_links', { violations: n, detail: n });
}

/** G-4's port: reports whether a standing full-mode override is set (same class as link_massing's override_force_full_present). */
/** INFO (not WARN, unlike link_massing's precedent): kept as a pure descriptive flag so #165's 3-check sabotage-fixture gap (link_rate_warn/entity_fanin_warn/tier3_full_not_converged) stays exactly the 3 non-INFO checks the fixture machinery names — see the assessment's peel 8b note. */
function override_force_full_present(ctx) {
  const standing = (ctx.overrides && ctx.overrides.force_full) === true;
  ctx.report('override_force_full_present', { violations: 0, detail: standing });
}

/** A-8's own audit row: the ledger-gated-skip decision + the corpus/config_version signal that fed it. */
function gate_decision(ctx) {
  const g = ctx.gate || {};
  ctx.report('gate_decision', {
    violations: 0,
    detail: { mode: g.mode, reason: g.reason, gated_skip: Boolean(g.skipped) },
  });
}

/** T7's exhaustion row — WARN, never FAIL (R-H). INFO (detail = the non-full placeholder text) whenever mode does not resolve full. */
function tier3_full_not_converged(ctx) {
  const info = (ctx.matched && ctx.matched.tier3_full) || null;
  const exhausted = Boolean(info && info.exhausted);
  ctx.report('tier3_full_not_converged', { violations: exhausted ? 1 : 0, detail: info || 'not run this invocation (mode != full)' });
}

/** LW-D10 (commit 8b, 2026-08-28) — T7's own convergence audit row: how many passes the mode-full tier-3 loop took and the total relinked across them. INFO, always. */
function tier3_full_iterations(ctx) {
  const info = (ctx.matched && ctx.matched.tier3_full) || null;
  const detail = info && typeof info.iterations === 'number'
    ? { iterations: info.iterations, relinked_total: info.relinked_total }
    : 'not run this invocation (mode != full)';
  ctx.report('tier3_full_iterations', { violations: 0, detail });
}

/** A-7's audit row for the reverse copyContacts-clear pass — 0 by construction until commit 8's live repair. */
function contacts_cleared_on_retraction(ctx) {
  const info = (ctx.matched && ctx.matched.tier3_full) || null;
  ctx.report('contacts_cleared_on_retraction', { violations: 0, detail: info ? info.contacts_cleared : 0 });
}

/**
 * D-20-class guard for A-7's tier-3 repair (LG-16), scored `when: "pre_write"`. The
 * retraction + entities cascade is destructive; against an empty `entities` corpus it
 * would unlink everything the fuzzy tier ever matched and repair nothing. INFO on every
 * incremental run (mode never resolves full outside a genuine corpus/FORCE_FULL signal,
 * A-8) — the FAIL branch is reachable only in mode full against a corpus this pilot's
 * commit 7 does not exercise (commit 8's budgeted act).
 */
function full_repair_empty_source_guard(ctx) {
  const mode = ctx.gate && ctx.gate.mode;
  const entitiesCount = (ctx.matched && ctx.matched.entities_count) || null;
  const violates = mode === 'full' && (entitiesCount === 0 || entitiesCount === null);
  ctx.report('full_repair_empty_source_guard', { violations: violates ? 1 : 0, detail: { mode, entities_count: entitiesCount } });
}

function write_privilege(ctx) {
  const p = (ctx.written && ctx.written.privilege) || null;
  const writable = Boolean(p && (p.rls_enabled === false || p.bypassrls === true || p.policies > 0));
  ctx.report('write_privilege', {
    violations: writable ? 0 : 1,
    detail: p ? `bypassrls=${p.bypassrls === true} policies=${p.policies}` : 'not measured',
  });
}

// ---- helpers ----

function tierCount(ctx, tierId) {
  const t = ctx.matched && ctx.matched.tiers && ctx.matched.tiers[tierId];
  return t ? t.linked : 0;
}

function totalTierLinked(ctx) {
  const tiers = (ctx.matched && ctx.matched.tiers) || {};
  return Object.values(tiers).reduce((sum, t) => sum + (t.linked || 0), 0);
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * The step's `records_meta` block. `threshold_updated_at` (G-13) is a SELF-CONSUMED
 * producer/consumer contract, re-stamped on every real run so the NEXT run's
 * config_version signal compares against what was true as of THIS run.
 */
function buildLinkMeta(ctx) {
  const m = ctx.matched;
  const linked = totalTierLinked(ctx);
  return {
    duration_ms: ctx.elapsed_ms,
    unlinked_start: m.unlinked_start,
    run_matched: linked,
    matches_tier_1_trade: tierCount(ctx, 'tier1_exact_trade'),
    matches_tier_2_legal: tierCount(ctx, 'tier2_exact_legal'),
    matches_tier_3_fuzzy: tierCount(ctx, 'tier3_fuzzy'),
    no_match_count: Math.max(0, (m.unlinked_start || 0) - linked),
    threshold_updated_at: (ctx.gate && ctx.gate.configVersionUpdatedAt) || null,
  };
}

// ---- dispatch ----

/** §5.5 (1) — keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  gate_decision,
  override_force_full_present,
  full_repair_empty_source_guard,
  unlinked_start,
  tier_1_trade_matches,
  tier_2_legal_matches,
  tier_3_fuzzy_matches,
  no_match,
  link_rate_warn,
  entity_fanin_warn,
  orphan_linked_entity_id,
  confidence_outside_closed_set,
  dead_bucket_count,
  registered_entities_with_zero_links,
  tier3_full_not_converged,
  tier3_full_iterations,
  contacts_cleared_on_retraction,
  write_privilege,
};

/** §5.5 (2) — run the SELECTED checks, and nothing else. Errors land on their own row (never suppress siblings). */
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
  if (!ctx.matched || !ctx.cumulative) return { records_meta: {} };
  return { records_meta: buildLinkMeta(ctx) };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildTierSql = buildTierSql;
module.exports.buildRetractionScopeParams = buildRetractionScopeParams;
module.exports.buildEntitiesUnflagSql = buildEntitiesUnflagSql;
module.exports.buildContactsReverseClearSql = buildContactsReverseClearSql;
module.exports.CUMULATIVE_SQL = CUMULATIVE_SQL;
module.exports.ENTITIES_FLAG_SCOPE = ENTITIES_FLAG_SCOPE;
module.exports.TIER_IDS = TIER_IDS;
module.exports.EXACT_LENGTH_FLOOR = EXACT_LENGTH_FLOOR;
module.exports.FUZZY_LENGTH_FLOOR = FUZZY_LENGTH_FLOOR;
module.exports.TIER3_LIMIT = TIER3_LIMIT;
module.exports.buildLinkMeta = buildLinkMeta;
