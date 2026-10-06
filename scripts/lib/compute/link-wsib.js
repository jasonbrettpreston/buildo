/**
 * SPEC LINK: docs/specs/01-pipeline/46_wsib_enrichment.md §2 (Contact Flow), §3 (Behavioral Contract)
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §2 (Step Registry row 19), §"Link WSIB"
 * SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md §2-§3 (source cadence, load_wsib contract)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2a, §1.4, §4.1, §5.1, §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rules 1-12, §7 ladder)
 *
 * WSIB Registry Matching — THE DOMAIN LOGIC ONLY.
 *
 * WHAT THIS FILE IS. Under the A-1 ruling (Fold A/B, 2026-08-28), commit 7 forks
 * `runLinkPhase` rather than extending it: this step is a BULK 3-tier cascade with NO
 * batching/pagination (unlike link_massing's keyset-paginated single-pass-per-batch
 * loop) and THREE write statements per tier across TWO tables (a FOURTH, unconditional
 * write runs once per invocation — LW-D19, below). `scripts/lib/step/index.js
 * runCascadePhase` owns the transaction, the gated-skip, the mode gate and the ordered
 * per-tier writes[]; what is left here, exactly per Rule 2 (compute is domain logic
 * only), is:
 *
 *   1. buildDerivationSql(descriptor, config) — O4 row 6 (full rescan, operator ruling
 *      2026-10-03, design .cursor/o4-row6-link-wsib-design-2026-10-03.md §11): ONE read-only
 *      derivation of every wsib_registry row's best link (exact trade > exact legal > fuzzy),
 *      diffed against the stored link. buildApplyLinksSql (the compare-and-set set/move write),
 *      VANISH_RETRACT_SCOPE (the keyed UPDATE-to-NULL's declared scope) and buildTierSql (the
 *      per-tier entities contacts statements) are SQL TEXT, pure, no pool — the library executes
 *      them (LG-11 / LG-16 executors).
 *   2. buildContactsReverseClearSql — A-7's provenance-by-equality reverse clear, keyed per
 *      (old entity, value) pair, fired for the diff's moved + vanished rows of ANY tier.
 *   3. one named observer per declared check, reading what the library measured.
 *
 * LW-D19 (2026-08-29 operator ruling) — `entities.is_wsib_registered` is a product-visible
 * registration CLAIM; the fuzzy tier (0.60, fixed-rule sample measured 31.7%-46.7%
 * precision, assessment §8d) no longer confers it. Two consequences, both Spec 124 §7
 * rung (b)/(c), NO second code path: `exactTierConfidences` scopes the EXISTING fill-true
 * target to the two exact tiers' confidences ALWAYS (the fuzzy tier's own pass issues the
 * identical statement, matching zero new rows); `ENTITIES_UNFLAG_SCOPE` is a NEW,
 * unconditional (never gated to mode "full") self-heal target that corrects any entity
 * whose registration claim outlived its exact-tier link — "is_wsib_registered ≡ EXISTS an
 * exact-tier link", both directions, every run.
 *
 * THE CTX CONTRACT (what the library hands a MATCHER compute):
 *   · ctx.matched     — what the cascade produced this run: the pre-run unlinked/linked
 *                       counts, the diff's set/move/vanish counts (O4 row 6), per-tier link
 *                       counts, the fan-in max, the LW-D19 correction count, contacts cleared
 *   · ctx.cumulative  — the runner's generic cumulative-rate field (link_massing still
 *                       reads it); link_wsib's `link_rate_warn` no longer does (LW-D18,
 *                       2026-08-29) — the rate is now entities-with-a-link over total
 *                       entities (`ctx.matched.entities_with_link_count` /
 *                       `ctx.matched.entities_count`), not wsib_registry rows, because a
 *                       single magnet entity absorbing hundreds of rows inflated the old
 *                       row-based ratio without representing hundreds of covered builders
 *   · ctx.written     — PER DECLARED TARGET (written.e1..e5, LW-D19 adds e5)
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

/** `execution.tiers[].id` values, in cascade order (highest confidence first). */
const TIER_IDS = Object.freeze({
  EXACT_TRADE: 'tier1_exact_trade',
  EXACT_LEGAL: 'tier2_exact_legal',
  FUZZY: 'tier3_fuzzy',
});

/** LW-D14 — the declared check whose `expect.stopwords` is the ONLY home of the generic-token list (Spec 124 Rule 1: never a literal in compute). */
const TOKEN_OVERLAP_CHECK_ID = 'tier3_token_overlap';

/**
 * LW-D14 (2026-08-28) — Tier 3's missing predicate half. Measured live pre-fix: 10.49%
 * of tier-3 links (840 of 8,009) share a genuine non-generic token with their matched
 * entity; the rest share ONLY a generic word ("CONTRACTING"/"CONSTRUCTION"/...) with
 * their match, or nothing at all — the raw trigram similarity threshold plus
 * first-letter blocking (d704a447) is satisfiable by two UNRELATED companies that both
 * happen to be, say, "* CONTRACTING". This is the magnet-entity fan-in contamination's
 * root cause (LW-D11).
 *
 * The rule: strip `-`/`.`/`'`/`&`/`+` (LW-D18 — punctuation/concatenation-only variants,
 * e.g. "T.T.S." vs "TTS", must tokenize identically), tokenize both names on whitespace,
 * strip the declared stopwords AND purely numeric tokens (a numbered-company legal name
 * contributes nothing to a match), and require the two token sets to share AT LEAST ONE
 * survivor. `stopwords` is read from the descriptor (Rule 1) — never hardcoded here — and
 * rendered as a SQL array literal (single quotes doubled, the standard SQL-literal escape)
 * so the predicate is one self-contained expression, not a second query round-trip.
 *
 * @param {string[]} stopwords - `descriptor.checks[].expect.stopwords` for TOKEN_OVERLAP_CHECK_ID
 * @param {string} leftExpr - a SQL column/expression, e.g. `w.trade_name_normalized`
 * @param {string} rightExpr - e.g. `e.name_normalized`
 * @returns {string} a boolean SQL expression (NULL, i.e. false-in-WHERE, when either side tokenizes to nothing)
 */
function tokenOverlapClause(stopwords, leftExpr, rightExpr) {
  const arraySql = `ARRAY[${stopwords.map((w) => `'${String(w).replace(/'/g, "''")}'`).join(',')}]::text[]`;
  const stripped = (expr) => `regexp_replace(${expr}, '[-.''&+]', '', 'g')`;
  const tokensOf = (expr) => `(SELECT array_agg(t) FROM unnest(regexp_split_to_array(${stripped(expr)}, '\\s+')) t WHERE t <> ALL(${arraySql}) AND t !~ '^[0-9]+$')`;
  return `${tokensOf(leftExpr)} && ${tokensOf(rightExpr)}`;
}

/** The declared stopword list, read from the descriptor (Rule 1 — never a literal in compute). */
function tokenOverlapStopwords(descriptor) {
  const check = descriptor.checks.find((c) => c.id === TOKEN_OVERLAP_CHECK_ID);
  if (!check || !check.expect || !Array.isArray(check.expect.stopwords)) {
    throw new Error(`[link_wsib compute] descriptor.checks has no "${TOKEN_OVERLAP_CHECK_ID}" entry with expect.stopwords[] — Tier 3's predicate cannot be built without it (LW-D14).`);
  }
  return check.expect.stopwords;
}

/**
 * LW-D19 (2026-08-29 operator ruling) — the two EXACT-tier resolved confidences (0.95
 * trade, 0.90 legal), read from the SAME declared `execution.tiers[].confidence_from_config`
 * field `buildTierSql` already uses per-tier — never the fuzzy tier's. `entities.
 * is_wsib_registered` is a product-visible registration CLAIM; the fuzzy tier (0.60,
 * fixed-rule sample measured 31.7%-46.7% precision, assessment §8d) no longer confers it.
 * Shared by BOTH is_wsib_registered write targets (the fill-true target, scoped by this
 * exact pair regardless of which tier's pass invoked it — Spec 124 §7 rung (b), "runs
 * with the exact-tier scope" rather than a second code path — and the correction/self-heal
 * target below), so neither can ever diverge on which two values "exact" means.
 */
function exactTierConfidences(descriptor, config) {
  const tiers = descriptor.execution.tiers;
  return [TIER_IDS.EXACT_TRADE, TIER_IDS.EXACT_LEGAL].map((id) => {
    const t = tiers.find((tt) => tt.id === id);
    if (!t) throw new Error(`[link_wsib compute] exactTierConfidences: descriptor.execution.tiers has no "${id}" entry (LW-D19)`);
    return config[t.confidence_from_config];
  });
}

/**
 * The resolved confidence of ONE declared tier (`execution.tiers[].confidence_from_config`), by tier id.
 */
function tierConfidence(descriptor, config, tierId) {
  const t = descriptor.execution.tiers.find((tt) => tt.id === tierId);
  if (!t) throw new Error(`[link_wsib compute] descriptor.execution.tiers has no "${tierId}" entry`);
  return config[t.confidence_from_config];
}

/**
 * ONE tier's entities statements, as text, derived from the descriptor + resolved config.
 *
 * O4 row 6 (operator ruling 2026-10-03, registry-truth folds 14 + 15) — the per-tier
 * wsib_registry fill-once UPDATEs (`WHERE linked_entity_id IS NULL`, the tier-3 `LIMIT 1000`)
 * are RETIRED: every row's link is derived ONCE by `buildDerivationSql` and only the difference
 * is written (`buildApplyLinksSql` + `VANISH_RETRACT_SCOPE`). What stays per tier is
 * copyContacts, parameterized by the tier's confidence, and the LW-D19 flag scope params
 * (ALWAYS the two exact tiers' confidences, `exactTierConfidences`).
 *
 * LW-D15 — each statement carries a `*_count_sql` read-only mirror, which `runCascadePhase`
 * issues instead of the write under `--dry-run`.
 *
 * @param {object} descriptor
 * @param {Readonly<Record<string, number>>} config - ctx.config
 * @param {{id: string, confidence_from_config: string}} tier
 * @returns {{entities_flag_scope_params: unknown[], entities_flag_count_sql: string, entities_flag_count_params: unknown[], entities_contacts_sql: string, entities_contacts_params: unknown[], entities_contacts_count_sql: string, entities_contacts_count_params: unknown[]}}
 */
function buildTierSql(descriptor, config, tier) {
  if (!Object.values(TIER_IDS).includes(tier.id)) {
    throw new Error(`[link_wsib compute] buildTierSql: unknown tier id "${tier.id}"`);
  }
  const confidence = config[tier.confidence_from_config];
  const entitiesFlagParams = exactTierConfidences(descriptor, config);
  return {
    entities_flag_scope_params: entitiesFlagParams,
    entities_flag_count_sql: buildEntitiesFlagCountSql(),
    entities_flag_count_params: entitiesFlagParams,
    entities_contacts_sql: buildContactsSql(),
    entities_contacts_params: [confidence],
    entities_contacts_count_sql: buildContactsCountSql(),
    entities_contacts_count_params: [confidence],
  };
}

/**
 * O4 row 6 — FULL RESCAN (operator ruling 2026-10-03, registry-truth folds 14 + 15; design and
 * Idempotency Lens ruling in .cursor/o4-row6-link-wsib-design-2026-10-03.md §11, D1–D5 all (a)).
 *
 * ONE derivation of EVERY wsib_registry row's best link — no `linked_entity_id IS NULL` scope, so
 * a stored link is re-derived every run (a better new entity wins, an exact match that appeared
 * later replaces a fuzzy link, a vanished match is NULLed) — diffed against the stored
 * `(linked_entity_id, match_confidence)`. The rows returned are ONLY the rows whose link changes:
 *   set     old NULL, new present
 *   move    old present, new present with a different entity or confidence (matched_at moves
 *           too: a confidence change is a tier change, §11 L3)
 *   vanish  old present, new NULL
 * each with its OLD link + matched_at (the R-M / LG-17 before-image and the compare-and-set key)
 * and its contact values (the A-7 reverse clear's provenance-by-equality values).
 *
 * Tier rank: exact trade (T1) > exact legal (T2, anti-joined on T1) > fuzzy (anti-joined on both
 * exact arms, §11 L8 — also the cheaper form: the fuzzy CTEs skip exact-matched rows).
 * `entities.name_normalized` is UNIQUE (entities_name_normalized_key), so an exact arm yields at
 * most one entity per row and needs no tiebreak. The fuzzy order is TOTAL —
 * `score DESC, permit_count DESC, name_normalized ASC`: the third key is new and load-bearing
 * (§11 L14) — without it two equal-score, equal-permit_count candidates resolve by plan order and
 * the same input could re-point a link on every run. `name_normalized` (unique, natural) rather
 * than the surrogate `entities.id`, so a re-import that re-sequences ids changes nothing.
 *
 * ⚠️ d704a447 — THE ARTICLE-STRIPPING BLOCKING PREDICATE, preserved verbatim: both fuzzy CTEs
 * compare the first letter of each name AFTER stripping a leading THE/A/AN, which keeps the
 * trigram comparison selective ("THE ABC COMPANY" and "ABC COMPANY" land in the same bucket).
 * `647d0935`'s trade/legal CTE split (GIN-index use, avoiding the ~394M-row nested loop of the
 * OR-joined form) and LW-D14's shared-non-generic-token requirement (`tokenOverlapClause`) are
 * preserved verbatim too. The old monotone `IS NULL` scope meant a predicate fix could never repair
 * a link written under a prior algorithm (LW-D5, A-7's whole reason to exist); under full rescan
 * every link is re-checked against the predicate AS IT STANDS TODAY, on every run.
 *
 * ⚠️ set_config is its OWN statement (`setup_sql`), never a `WITH _cfg AS (SELECT set_config(...))`
 * CTE: Postgres does not evaluate a SELECT CTE the primary query never references, so the old CTE
 * form never set the GUC (the `%` operator ran at the default threshold; the explicit
 * `similarity() > threshold` filter kept the result correct). The library runs `setup_sql`, then
 * `diff_sql`, on ONE client inside ONE read-only transaction (G-10: `is_local = true` is
 * transaction-scoped and resets at COMMIT/ROLLBACK, so it can never leak to a pooled connection).
 *
 * @param {object} descriptor
 * @param {Readonly<Record<string, number>>} config - ctx.config
 * @returns {{setup_sql: string, setup_params: unknown[], diff_sql: string, diff_params: unknown[]}}
 */
function buildDerivationSql(descriptor, config) {
  const stopwords = tokenOverlapStopwords(descriptor);
  const threshold = config.wsib_fuzzy_match_threshold;
  return {
    setup_sql: "SELECT set_config('pg_trgm.similarity_threshold', $1::text, true)",
    setup_params: [threshold],
    diff_sql: `WITH exact1 AS (
  SELECT w.id AS wsib_id, e.id AS entity_id
  FROM wsib_registry w
  JOIN entities e ON e.name_normalized = w.trade_name_normalized
  WHERE w.trade_name_normalized IS NOT NULL
    AND LENGTH(w.trade_name_normalized) >= ${EXACT_LENGTH_FLOOR}
),
exact2 AS (
  SELECT w.id AS wsib_id, e.id AS entity_id
  FROM wsib_registry w
  JOIN entities e ON e.name_normalized = w.legal_name_normalized
  WHERE w.legal_name_normalized IS NOT NULL
    AND LENGTH(w.legal_name_normalized) >= ${EXACT_LENGTH_FLOOR}
    AND NOT EXISTS (SELECT 1 FROM exact1 x WHERE x.wsib_id = w.id)
),
exact AS (
  SELECT wsib_id FROM exact1
  UNION ALL
  SELECT wsib_id FROM exact2
),
trade_matches AS (
  SELECT w.id AS wsib_id, e.id AS entity_id, e.permit_count, e.name_normalized,
         similarity(w.trade_name_normalized, e.name_normalized) AS score
  FROM wsib_registry w
  JOIN entities e ON w.trade_name_normalized % e.name_normalized
    AND LEFT(REGEXP_REPLACE(w.trade_name_normalized, '^(THE|A|AN) ', ''), 1)
      = LEFT(REGEXP_REPLACE(e.name_normalized, '^(THE|A|AN) ', ''), 1)
    AND ${tokenOverlapClause(stopwords, 'w.trade_name_normalized', 'e.name_normalized')}
  WHERE w.trade_name_normalized IS NOT NULL
    AND LENGTH(w.trade_name_normalized) >= ${FUZZY_LENGTH_FLOOR}
    AND LENGTH(e.name_normalized) >= ${FUZZY_LENGTH_FLOOR}
    AND similarity(w.trade_name_normalized, e.name_normalized) > $1::float
    AND NOT EXISTS (SELECT 1 FROM exact x WHERE x.wsib_id = w.id)
),
legal_matches AS (
  SELECT w.id AS wsib_id, e.id AS entity_id, e.permit_count, e.name_normalized,
         similarity(w.legal_name_normalized, e.name_normalized) AS score
  FROM wsib_registry w
  JOIN entities e ON w.legal_name_normalized % e.name_normalized
    AND LEFT(REGEXP_REPLACE(w.legal_name_normalized, '^(THE|A|AN) ', ''), 1)
      = LEFT(REGEXP_REPLACE(e.name_normalized, '^(THE|A|AN) ', ''), 1)
    AND ${tokenOverlapClause(stopwords, 'w.legal_name_normalized', 'e.name_normalized')}
  WHERE LENGTH(w.legal_name_normalized) >= ${FUZZY_LENGTH_FLOOR}
    AND LENGTH(e.name_normalized) >= ${FUZZY_LENGTH_FLOOR}
    AND similarity(w.legal_name_normalized, e.name_normalized) > $1::float
    AND NOT EXISTS (SELECT 1 FROM exact x WHERE x.wsib_id = w.id)
),
fuzzy AS (
  SELECT DISTINCT ON (wsib_id) wsib_id, entity_id
  FROM (
    SELECT * FROM trade_matches
    UNION ALL
    SELECT * FROM legal_matches
  ) combined
  ORDER BY wsib_id, score DESC, permit_count DESC, name_normalized ASC
),
derived AS (
  SELECT wsib_id, entity_id, $2::numeric(3,2) AS confidence FROM exact1
  UNION ALL
  SELECT wsib_id, entity_id, $3::numeric(3,2) FROM exact2
  UNION ALL
  SELECT wsib_id, entity_id, $4::numeric(3,2) FROM fuzzy
)
SELECT w.id,
       w.linked_entity_id AS old_entity_id,
       w.match_confidence AS old_confidence,
       w.matched_at AS old_matched_at,
       d.entity_id AS new_entity_id,
       d.confidence AS new_confidence,
       w.primary_phone, w.primary_email, w.website
FROM wsib_registry w
LEFT JOIN derived d ON d.wsib_id = w.id
WHERE (w.linked_entity_id, w.match_confidence) IS DISTINCT FROM (d.entity_id, d.confidence)
ORDER BY w.id`,
    // $1 similarity threshold; $2/$3/$4 the tier-1/2/3 confidences, cast to the column's own
    // NUMERIC(3,2) so a stored value and its re-derived value compare equal (never churn).
    diff_params: [
      threshold,
      tierConfidence(descriptor, config, TIER_IDS.EXACT_TRADE),
      tierConfidence(descriptor, config, TIER_IDS.EXACT_LEGAL),
      tierConfidence(descriptor, config, TIER_IDS.FUZZY),
    ],
  };
}

/**
 * O4 row 6 — W-set (writes[0], `set_based_join_update`; LG-11's executor refuses INSERT / ON
 * CONFLICT): the diff's set + move rows in ONE keyed UPDATE, COMPARE-AND-SET on the OLD link
 * (§11 L13, operator D3(a)). The derivation ran in its own earlier read-only transaction, so a row
 * whose stored link changed since then matches 0 rows here and is re-derived next run — never
 * overwritten from a stale read. The second guard (IS DISTINCT FROM the new link) keeps a
 * same-transaction replay a zero-write no-op. `matched_at` is the run clock: in the SET list,
 * NEVER in a guard (LG-9 — a clock column inside IS DISTINCT FROM makes every run a change).
 * Params: $1 RUN_AT, $2 ids, $3 new entity ids, $4 new confidences, $5 old entity ids (NULL for a
 * set), $6 old confidences (NULL for a set). Always JS arrays (empty → 0 rows), never NULL.
 */
function buildApplyLinksSql() {
  return `UPDATE wsib_registry w
SET linked_entity_id = u.new_entity_id,
    match_confidence = u.new_confidence,
    matched_at = $1::timestamptz
FROM unnest($2::int[], $3::int[], $4::numeric[], $5::int[], $6::numeric[])
  AS u(id, new_entity_id, new_confidence, old_entity_id, old_confidence)
WHERE w.id = u.id
  AND (w.linked_entity_id, w.match_confidence) IS NOT DISTINCT FROM (u.old_entity_id, u.old_confidence)
  AND (w.linked_entity_id, w.match_confidence) IS DISTINCT FROM (u.new_entity_id, u.new_confidence)`;
}

/**
 * O4 row 6 — W-vanish's DECLARED scope (writes[3], `set_based_null_retract`, codegen'd by write.js
 * as `UPDATE wsib_registry SET linked_entity_id = null, match_confidence = null, matched_at = null
 * WHERE <scope> AND (linked_entity_id IS DISTINCT FROM null)` — never a DELETE, LG-16). KEYED by
 * the diff's vanish ids AND compare-and-set on each row's old link (a row re-linked since the
 * derivation does not match). Replaces `match_confidence = $1` + `retract: "all"` /
 * `retract_when: "full_only"` (the tier-3-only, scope-wide retraction): a vanished EXACT link is
 * NULLed too. Exported so the descriptor's declared scope and the runner's binding ($1 ids, $2 old
 * entity ids, $3 old confidences) cannot disagree.
 */
const VANISH_RETRACT_SCOPE = '(id, linked_entity_id, match_confidence) IN (SELECT * FROM unnest($1::int[], $2::int[], $3::numeric[]))';

/**
 * The entities.is_wsib_registered flag flip's SCOPE — declared columns[]/write_discipline
 * in the descriptor generate the statement; the $1/$2 scope parameters are the two EXACT
 * tiers' resolved confidences (LW-D19, `exactTierConfidences`), ALWAYS — never the fuzzy
 * tier's, regardless of which tier's pass issues the statement. Exported so the
 * descriptor's `write_discipline.scope` string and this runtime binding cannot silently
 * disagree (both name "$1, $2 = the two exact-tier confidences").
 */
const ENTITIES_FLAG_SCOPE = 'id IN (SELECT linked_entity_id FROM wsib_registry WHERE match_confidence IN ($1, $2)) AND is_wsib_registered = false';

/** LW-D15 — read-only mirror of the `entities` flag-flip's scope; same $1/$2 = the two exact-tier confidences. */
function buildEntitiesFlagCountSql() {
  return `SELECT count(*)::int AS n FROM entities WHERE ${ENTITIES_FLAG_SCOPE}`;
}

/**
 * LW-D19 (2026-08-29 operator ruling) — the is_wsib_registered SELF-HEAL correction scope:
 * an entity currently flagged registered whose wsib_registry link(s) are ALL fuzzy
 * (match_confidence 0.60) — i.e. it has no EXACT-tier link at all. Runs every invocation,
 * unconditional of mode (unlike A-7/LG-16's retraction, never gated to mode "full"): the
 * fill-true target above only ever transitions false→true, so this is the ONLY mechanism
 * that ever corrects a row set true by pre-LW-D19 code, or an entity whose only exact-tier
 * link vanished or moved to the fuzzy tier under the O4 row 6 full rescan (the keyed
 * UPDATE-to-NULL now NULLs a vanished link of ANY tier).
 * "is_wsib_registered ≡ EXISTS an exact-tier link", both directions, self-healing every run.
 */
const ENTITIES_UNFLAG_SCOPE = 'is_wsib_registered = true AND id NOT IN (SELECT linked_entity_id FROM wsib_registry WHERE match_confidence IN ($1, $2))';

/** LW-D19 — read-only mirror of `ENTITIES_UNFLAG_SCOPE`, for a `--dry-run` invocation's would-be correction count. */
function buildEntitiesUnflagCorrectionCountSql() {
  return `SELECT count(*)::int AS n FROM entities WHERE ${ENTITIES_UNFLAG_SCOPE}`;
}

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

/** LW-D15 — read-only mirror of `buildContactsSql`'s FROM/WHERE; same $1 = tier confidence. */
function buildContactsCountSql() {
  return `SELECT count(*)::int AS n
FROM entities e
JOIN (
  SELECT linked_entity_id,
         MAX(primary_phone) FILTER (WHERE primary_phone IS NOT NULL AND TRIM(primary_phone) != '') AS primary_phone,
         MAX(primary_email) FILTER (WHERE primary_email IS NOT NULL AND TRIM(primary_email) != '') AS primary_email,
         MAX(website) FILTER (WHERE website IS NOT NULL AND TRIM(website) != '') AS website
  FROM wsib_registry
  WHERE match_confidence = $1
  GROUP BY linked_entity_id
) w_agg ON w_agg.linked_entity_id = e.id
WHERE (
  (NULLIF(TRIM(e.primary_phone), '') IS NULL AND w_agg.primary_phone IS NOT NULL) OR
  (NULLIF(TRIM(e.primary_email), '') IS NULL AND w_agg.primary_email IS NOT NULL) OR
  (NULLIF(TRIM(e.website), '') IS NULL AND w_agg.website IS NOT NULL)
)`;
}

// ===========================================================================
// A-7 — the contacts repair for links that moved away or vanished (O4 row 6)
// ===========================================================================

/**
 * A-7's copyContacts REVERSE pass (Fold B BLOCKING a) — provenance-by-equality, KEYED PER
 * (entity, value) PAIR (O4 row 6, §11 L4, operator D5(a)): clear an entity's contact field ONLY
 * where its CURRENT value equals a value carried by one of the wsib rows whose link TO THAT ENTITY
 * moved away or vanished this run. The previous form pooled every retracted value into one array
 * and applied it to every affected entity, so entity A could lose a value that came from entity B's
 * row. copyContacts (per tier, afterwards) refills from whatever links remain. Declared limitation
 * (descriptor.limitations[]), unchanged: a contact that coincidentally equals such a value is
 * cleared, and refilled only if a remaining link carries it — exposure measured 0 locally
 * (wsib_registry carries 0 contact values, §11 M5), NOT bounded for cloud.
 *
 * Params, one element per (old entity, wsib row) pair: $1 old entity ids, $2 phones, $3 emails,
 * $4 websites (NULL where the row carries none). Always JS arrays (empty → 0 rows).
 */
function buildContactsReverseClearSql() {
  return `WITH c AS (
  SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[]) AS c(entity_id, phone, email, site)
)
UPDATE entities e
SET primary_phone = CASE WHEN EXISTS (SELECT 1 FROM c WHERE c.entity_id = e.id AND c.phone = e.primary_phone) THEN NULL ELSE e.primary_phone END,
    primary_email = CASE WHEN EXISTS (SELECT 1 FROM c WHERE c.entity_id = e.id AND c.email = e.primary_email) THEN NULL ELSE e.primary_email END,
    website = CASE WHEN EXISTS (SELECT 1 FROM c WHERE c.entity_id = e.id AND c.site = e.website) THEN NULL ELSE e.website END
WHERE EXISTS (
  SELECT 1 FROM c
  WHERE c.entity_id = e.id
    AND (c.phone = e.primary_phone OR c.email = e.primary_email OR c.site = e.website)
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
/**
 * LW-D14 (2026-08-28) — CUMULATIVE_SQL became a FUNCTION of `descriptor` (was a bare
 * string constant) so `tier3_token_overlap_pass_pct` can read its stopword list the
 * same declared way `buildDerivationSql` does (Rule 1 — never a literal in compute).
 * `runCascadePhase` (scripts/lib/step/index.js) is the ONLY caller and link_wsib the
 * ONLY cascade compute today, so widening the generic CASCADE contract from "a string"
 * to "a function of descriptor" costs no per-step branch (Gate 0) — it changes what
 * EVERY cascade compute exports, uniformly, not what the runner does for one step.
 */
function buildCumulativeSql(descriptor) {
  const stopwords = tokenOverlapStopwords(descriptor);
  return `SELECT
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
  (SELECT COUNT(*) FROM entities WHERE is_wsib_registered = true) AS entities_with_link_count,
  (SELECT COALESCE(MAX(n), 0) FROM (SELECT COUNT(*) AS n FROM wsib_registry WHERE linked_entity_id IS NOT NULL GROUP BY linked_entity_id) f) AS entity_fanin_max,
  (SELECT COUNT(*) FROM (SELECT COUNT(*) AS n FROM wsib_registry WHERE linked_entity_id IS NOT NULL GROUP BY linked_entity_id HAVING COUNT(*) >= 10) m) AS magnet_entities_fanin_ge_10,
  (SELECT round(100.0 * count(*) FILTER (WHERE
       COALESCE(${tokenOverlapClause(stopwords, 'w.trade_name_normalized', 'e.name_normalized')}, false)
       OR COALESCE(${tokenOverlapClause(stopwords, 'w.legal_name_normalized', 'e.name_normalized')}, false)
     ) / NULLIF(count(*), 0), 2)
     FROM wsib_registry w JOIN entities e ON e.id = w.linked_entity_id WHERE w.match_confidence = 0.60) AS tier3_token_overlap_pass_pct`;
}

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

/** O4 row 6 — rows unlinked at run start that this run did not link: unlinked_start minus the diff's NEW links (a move re-points an existing link; it is not a match of an unlinked row). */
function no_match(ctx) {
  const noMatch = Math.max(0, ((ctx.matched && ctx.matched.unlinked_start) || 0) - newLinks(ctx));
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
 *
 * LW-D18 (2026-08-29) — denominator re-ruled from ROWS to ENTITIES. The old
 * linked-wsib-rows-over-total-wsib-rows ratio double-counted every magnet (a single
 * contaminated entity absorbing hundreds of wsib_registry rows inflated the numerator
 * without representing hundreds of genuinely-covered builders) and undercounted the
 * thing an operator actually cares about — "what share of our builder pool has a WSIB
 * record at all?" Now `entities.is_wsib_registered = true` count (ctx.matched.
 * entities_with_link_count, the SAME generic post-write-observation mechanism every
 * other cumulative check here uses) over `ctx.matched.entities_count` (the runner's
 * own pre-write entity-corpus snapshot — entities are never inserted/deleted by this
 * step, so pre- and post-write counts are identical).
 */
function link_rate_warn(ctx) {
  const m = ctx.matched || {};
  const total = m.entities_count || 0;
  const linked = m.entities_with_link_count || 0;
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

/**
 * LW-D14 (2026-08-28) — the SAME declared post-write-observation mechanism `link_rate_warn`
 * uses: `runCascadePhase` runs `buildCumulativeSql(descriptor)` (whose `tier3_token_overlap_pass_pct`
 * column embeds the SAME `tokenOverlapClause` predicate `buildDerivationSql` now enforces at
 * write time) once, post-write, and merges it generically onto `ctx.matched` — no second query
 * here. Measured live pre-fix: 10.49% (840 of 8,009 tier-3 links). FAIL, per Spec 124 Rule 3 —
 * this is a verdict-affecting measurement of the write predicate's own correctness, not a
 * standing population like `entity_fanin_warn` (R-H does not apply: post-fix this should read
 * at or near 100%, so a low value is never "expected non-zero," it is the defect itself).
 *
 * Post-repair diagnostic (WF3-F, same session): a first draft of this column tokenized
 * `COALESCE(NULLIF(w.trade_name_normalized, ''), w.legal_name_normalized)` — ONE field — against
 * the entity name. Measured 86.2% (not ~100%) against the live post-repair corpus. Root cause:
 * `buildDerivationSql`'s fuzzy arm is a UNION of two INDEPENDENT CTEs (`trade_matches` checks trade_name
 * overlap, `legal_matches` checks legal_name overlap) — a row written via the legal-name branch
 * can have a non-empty `trade_name_normalized` that never overlapped anything (it wasn't the
 * field the write predicate checked), and COALESCE always prefers a non-empty trade name over
 * checking legal name at all. Fixed to `OR` the two fields' overlap independently, mirroring
 * the write side's two-CTE union — verified live: 100.00% (993/993) post-fix, 0 rows disagree.
 */
function tier3_token_overlap(ctx) {
  const m = ctx.matched || {};
  const pct = typeof m.tier3_token_overlap_pass_pct === 'number' ? m.tier3_token_overlap_pass_pct : 0;
  ctx.report('tier3_token_overlap', { value: pct, detail: { tier3_token_overlap_pass_pct: pct } });
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
/** INFO (not WARN, unlike link_massing's precedent): kept as a pure descriptive flag so #165's 3-check sabotage-fixture gap (link_rate_warn/entity_fanin_warn/link_wsib_mass_relink_pct) stays exactly the 3 non-INFO checks the fixture machinery names — see the assessment's peel 8b note. */
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

/** A-7's audit row for the reverse copyContacts-clear pass — O4 row 6: entities whose contact field was cleared because a link carrying that value moved away or vanished this run (0 under --dry-run, a declared limitation). */
function contacts_cleared_on_retraction(ctx) {
  ctx.report('contacts_cleared_on_retraction', { violations: 0, detail: (ctx.matched && ctx.matched.contacts_cleared) || 0 });
}

/**
 * LW-D19 (2026-08-29 operator ruling) — the is_wsib_registered self-heal correction's own
 * audit row: how many entities THIS run flipped back to false because their only
 * wsib_registry link(s) were fuzzy (tier-3, 0.60). INFO, always present (the correction
 * target runs every invocation, unconditional of mode) — expected 0 on every run after the
 * one-time historical correction (this pilot's first live run), since the fill-true target
 * never lets a tier-3-only row reach true in the first place (Spec 124 §7 rung (b)).
 * A non-zero value on a later run is not itself a defect — it means an entity's is_
 * wsib_registered was true for a reason outside this step's own writes (measured: none
 * known) and is being corrected, visibly, not silently.
 */
function is_wsib_registered_corrected(ctx) {
  const n = (ctx.matched && ctx.matched.is_wsib_registered_corrected) || 0;
  ctx.report('is_wsib_registered_corrected', { violations: 0, detail: n });
}

/**
 * O4 row 6 (§11 L6, operator D2(a)) — the mass-change guard, scored `when: "pre_write"` over the
 * read-only derivation's diff (ctx.matched.diff), BEFORE the write transaction opens: (moves +
 * vanishes) over the rows linked at run start (ctx.matched.linked_start), as a FRACTION. New links
 * (set) are growth, not damage, and do not count; an exact vanish counts the same as a fuzzy one
 * (one rule). Limit from config (`link_wsib_mass_relink_max_pct`, default 0.10). A deliberate
 * threshold raise (+0.05 vanished 29% locally, §11 M3) sets LINK_WSIB_ACCEPT_MASS_RELINK=1
 * (override.accept_anomaly): the run writes and the FAIL row stays. Steady state measured 0
 * (§11 M1). Replaces S3 (the tier-3 LIMIT 1000) and the convergence loop (operator D1(a)).
 */
function link_wsib_mass_relink_pct(ctx) {
  const m = ctx.matched || {};
  const d = m.diff || { set: 0, move: 0, vanish: 0 };
  const linked = m.linked_start || 0;
  const pct = linked > 0 ? (d.move + d.vanish) / linked : 0;
  ctx.report('link_wsib_mass_relink_pct', {
    value: round(pct),
    detail: { set: d.set, move: d.move, vanish: d.vanish, linked_start: linked },
  });
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

/** O4 row 6 — the diff's NEW links (old NULL → new present); a move is not a new link. */
function newLinks(ctx) {
  return (ctx.matched && ctx.matched.diff && ctx.matched.diff.set) || 0;
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * The step's `records_meta` block. `threshold_updated_at` (G-13) and the three
 * `tier{1,2,3}_confidence_updated_at` (O4 row 6) stamps are SELF-CONSUMED
 * producer/consumer contracts, re-stamped on every real run so the NEXT run's
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
    no_match_count: Math.max(0, (m.unlinked_start || 0) - newLinks(ctx)),
    threshold_updated_at: (ctx.gate && ctx.gate.configVersionUpdatedAt) || null,
    // O4 row 6 (fold 16 row 1 (d)) — the three tier-confidence config_version stamps, self-consumed
    // like threshold_updated_at: re-stamped every real run so the NEXT run compares against THIS one.
    tier1_confidence_updated_at: (ctx.gate && ctx.gate.configVersions && ctx.gate.configVersions.tier1_confidence_updated_at) || null,
    tier2_confidence_updated_at: (ctx.gate && ctx.gate.configVersions && ctx.gate.configVersions.tier2_confidence_updated_at) || null,
    tier3_confidence_updated_at: (ctx.gate && ctx.gate.configVersions && ctx.gate.configVersions.tier3_confidence_updated_at) || null,
    // LW-D19 — always observable, per run, even when 0 (the expected steady state).
    is_wsib_registered_corrected: m.is_wsib_registered_corrected || 0,
    // WF3 GC-5 (2026-09-26) — the self-consumed producer half of the declared
    // `upstream_ledger` trigger (staleness.trigger: table:"wsib_registry",
    // emit_key:"wsib_registry_count"). A STRING because the reader compares
    // String(prevCount) (mirrors link_massing's building_footprints_count and
    // link_parcels' code_version verbatim). `ctx.cumulative.total` (NOT ctx.matched.total —
    // buildCumulativeSql's result is threaded onto ctx.cumulative by the runner,
    // scripts/lib/step/index.js:1844 `cumulative: { linked: Number(c.linked), total:
    // Number(c.total) }`) is byte-identical in scope to the trigger's own
    // `SELECT COUNT(*) FROM wsib_registry` — no new query. CAUGHT LIVE (WF3 landing,
    // 2026-09-26): a first attempt read `m.total` (ctx.matched.total, always undefined)
    // and the forced-FULL proof run captured the string "undefined" — the mocked RED/GREEN
    // test had the same wrong shape, so it passed a broken implementation. Fixed against the
    // real runner wiring, not the plan's citation, and re-proven with a second forced-FULL run.
    wsib_registry_count: String(ctx.cumulative.total),
  };
}

// ---- dispatch ----

/** §5.5 (1) — keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  gate_decision,
  override_force_full_present,
  link_wsib_mass_relink_pct,
  unlinked_start,
  tier_1_trade_matches,
  tier_2_legal_matches,
  tier_3_fuzzy_matches,
  no_match,
  link_rate_warn,
  entity_fanin_warn,
  tier3_token_overlap,
  orphan_linked_entity_id,
  confidence_outside_closed_set,
  dead_bucket_count,
  registered_entities_with_zero_links,
  is_wsib_registered_corrected,
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
module.exports.buildDerivationSql = buildDerivationSql;
module.exports.buildApplyLinksSql = buildApplyLinksSql;
module.exports.VANISH_RETRACT_SCOPE = VANISH_RETRACT_SCOPE;
module.exports.exactTierConfidences = exactTierConfidences;
module.exports.buildEntitiesUnflagCorrectionCountSql = buildEntitiesUnflagCorrectionCountSql;
module.exports.ENTITIES_UNFLAG_SCOPE = ENTITIES_UNFLAG_SCOPE;
module.exports.buildEntitiesFlagCountSql = buildEntitiesFlagCountSql;
module.exports.buildContactsCountSql = buildContactsCountSql;
module.exports.buildContactsReverseClearSql = buildContactsReverseClearSql;
module.exports.buildCumulativeSql = buildCumulativeSql;
module.exports.tokenOverlapClause = tokenOverlapClause;
module.exports.tokenOverlapStopwords = tokenOverlapStopwords;
module.exports.TOKEN_OVERLAP_CHECK_ID = TOKEN_OVERLAP_CHECK_ID;
module.exports.ENTITIES_FLAG_SCOPE = ENTITIES_FLAG_SCOPE;
module.exports.TIER_IDS = TIER_IDS;
module.exports.EXACT_LENGTH_FLOOR = EXACT_LENGTH_FLOOR;
module.exports.FUZZY_LENGTH_FLOOR = FUZZY_LENGTH_FLOOR;
module.exports.buildLinkMeta = buildLinkMeta;
