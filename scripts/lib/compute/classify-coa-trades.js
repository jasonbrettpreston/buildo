'use strict';
/**
 * classify_coa_trades — the pure compute (MATERIALIZER, `execution.materialize_form: "rows"`).
 *
 * Phase-4 wave 4 lane C; full-form row 7 (Spec 123 §7, operator Q5 y 2026-10-19). Written against the
 * MATERIALIZER runner-built row form, Spec 124 R-EH (RE-FREEZE #37; operator y 2026-10-18 on Q-MZ). The
 * runner pages the source, reads the `trades` / `product_groups` lookups once, stamps `classified_at` /
 * `trade_classified_at` from its single RUN_AT capture, and writes every target in one transaction per
 * batch. This module holds no query, transaction, clock, literal tunable or status decision (R-BZ).
 *
 * The domain logic is the shipped classifier (`scripts/lib/coa-trade-classifier.js`, dual-path with
 * `src/lib/classification/coa-trade-classifier.ts`, Spec 84 §7), unchanged.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.8 row 667
 *            docs/specs/01-pipeline/80_taxonomies.md §5 (realtor gate, §5.B products, §5.C inference)
 *            docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ), R-CY (iii), R-DF
 */

const {
  classifyCoaTrades,
  classifyCoaProducts,
  shouldAppendRealtor,
  DEPRECATED_TRADE_SLUGS,
} = require('../coa-trade-classifier');

/** The realtor persona's trade slug (Spec 80 §5; the id is resolved from the `trades` lookup, CCT-D7). */
const REALTOR_SLUG = 'realtor';

/** The pending predicate (legacy `classify-coa-trades.js:271-273`, pinned L4). */
const PENDING_WHERE = `scope_tags IS NOT NULL
   AND scope_classified_at IS NOT NULL
   AND (trade_classified_at IS NULL OR trade_classified_at < scope_classified_at)`;

/**
 * The source statements (ruling §2 (a)). The runner binds `batch_binds` in order.
 * There is no full mode: the step has no `--full` path (CCT-D9), so `mode` is ignored.
 * @returns {{count_sql: string, batch_sql: string, batch_binds: string[]}}
 */
function buildSourceSql(_descriptor, _config, _opts) {
  return {
    count_sql: `SELECT COUNT(*)::int AS coa_eligible FROM coa_applications WHERE ${PENDING_WHERE}`,
    batch_sql: `SELECT id, lead_id, scope_tags, coa_type_class, project_type, structure_type, scope_classified_at
  FROM coa_applications
 WHERE ${PENDING_WHERE}
   AND id > $1
 ORDER BY id ASC
 LIMIT $2`,
    batch_binds: ['last_key', 'batch_size'],
  };
}

function slugMap(rows) {
  return new Map((rows || []).map((r) => [r.slug, r.id]));
}
function bump(obj, key) {
  obj[key] = (obj[key] || 0) + 1;
}

/**
 * One batch: source rows → target rows (ruling §2 (c)). Pure.
 *
 * Targets (descriptor `outputs.writes[]` order):
 *   e1 lead_trades     A guarded_upsert, guard "none" (CCT-D2), no retraction (CCT-D1)
 *   e2 lead_products   F replace_keys (every processed lead, so a lead dropping to zero products is cleared)
 *   e3 lead_products   A guarded_upsert, guard "none"
 *   e4 coa_applications G keyed update — the trade_classified_at watermark (run_at, stamped by the runner)
 *
 * `matched` holds additive counters only (numbers, per-key-summed objects, concatenated arrays); the
 * runner sums them across batches and `finalizeMatched` derives the ratios once.
 *
 * @param {object[]} sourceRows
 * @param {{config: object, run_at: unknown, descriptor: object, lookups: {trades: object[], product_groups: object[]}}} ctx
 */
function materializeRows(sourceRows, { config, lookups }) {
  const tradeId = slugMap(lookups.trades);
  const productId = slugMap(lookups.product_groups);
  const realtorId = tradeId.get(REALTOR_SLUG);
  const inferenceEnabled = Number(config.p16_inference_layer_enabled) === 1;
  const tier = config.classify_coa_trades_tier;
  const scale = config.classify_coa_trades_lead_score_scale;
  const realtorConfidence = config.classify_coa_trades_realtor_confidence;

  const e1 = [];
  const e2 = [];
  const e3 = [];
  const e4 = [];
  const m = {
    processed: 0,
    coa_with_trades: 0,
    coa_zero_trades: 0,
    residential_count: 0,
    realtor_append_count: 0,
    realtor_unavailable: realtorId === undefined ? 1 : 0,
    coa_trades_strong_signal: 0,
    coa_trades_inference: 0,
    slug_resolution_miss_count: 0,
    slug_resolution_miss_slugs: [],
    coa_with_active_trades: 0,
    active_trade_rows_total: 0,
    active_trades_hist: {},
    coa_with_evidence_trades: 0,
    evidence_trade_rows_total: 0,
    evidence_trades_hist: {},
    coa_with_products: 0,
    lead_products_written: 0,
    product_slug_miss_count: 0,
    trade_slug_distribution: {},
    product_slug_distribution: {},
    coa_trades_per_lead_histogram: {},
  };

  for (const row of sourceRows) {
    m.processed += 1;
    const tradeRows = [];
    let evidence = 0;
    let active = 0;
    for (const { slug, confidence, attachment_basis: basis } of classifyCoaTrades(row, { inferenceEnabled })) {
      const id = tradeId.get(slug);
      if (id === undefined) {
        m.slug_resolution_miss_count += 1;
        m.slug_resolution_miss_slugs.push(slug);
        continue;
      }
      if (basis === 'inference') m.coa_trades_inference += 1;
      else { m.coa_trades_strong_signal += 1; evidence += 1; }
      active += 1;
      tradeRows.push({
        lead_id: row.lead_id, trade_id: id, tier, confidence, is_active: true, phase: null,
        lead_score: Math.round(confidence * scale), attachment_basis: basis,
      });
      bump(m.trade_slug_distribution, slug);
    }

    const residential = shouldAppendRealtor({ coa_type_class: row.coa_type_class });
    if (residential) m.residential_count += 1;
    if (residential && realtorId !== undefined) {
      tradeRows.push({
        lead_id: row.lead_id, trade_id: realtorId, tier, confidence: realtorConfidence, is_active: true, phase: null,
        lead_score: Math.round(realtorConfidence * scale), attachment_basis: 'evidence',
      });
      bump(m.trade_slug_distribution, REALTOR_SLUG);
      m.realtor_append_count += 1;
      active += 1;
    }

    if (tradeRows.length) { m.coa_with_trades += 1; e1.push(...tradeRows); } else m.coa_zero_trades += 1;
    if (active) { m.coa_with_active_trades += 1; m.active_trade_rows_total += active; bump(m.active_trades_hist, String(active)); }
    if (evidence) { m.coa_with_evidence_trades += 1; m.evidence_trade_rows_total += evidence; bump(m.evidence_trades_hist, String(evidence)); }

    e2.push(row.lead_id);
    e4.push({ id: row.id });

    let hasProduct = false;
    for (const { slug, confidence } of classifyCoaProducts(row, DEPRECATED_TRADE_SLUGS)) {
      const id = productId.get(slug);
      if (id === undefined) { m.product_slug_miss_count += 1; continue; }
      e3.push({ lead_id: row.lead_id, product_id: id, confidence });
      m.lead_products_written += 1;
      hasProduct = true;
      bump(m.product_slug_distribution, slug);
    }
    if (hasProduct) m.coa_with_products += 1;
    bump(m.coa_trades_per_lead_histogram, String(tradeRows.length));
  }

  return { rows: { e1, e3, e4 }, replace_keys: { e2 }, matched: m };
}

/** Median of a `{count: n}` histogram over `denominator` CoAs (legacy `histMedian`, `:437-447`). */
function histMedian(hist, denominator) {
  if (!denominator) return null;
  let cumulative = 0;
  for (const count of Object.keys(hist).map(Number).sort((a, b) => a - b)) {
    cumulative += hist[String(count)];
    if (cumulative * 2 >= denominator) return count;
  }
  return null;
}

/**
 * The run-level derivations, once, over the runner-summed `matched` (pure). Every value a declared
 * check reads is a measurement; the bound lives in the check (`limit_from_config`, G7).
 */
function finalizeMatched(m, { config, post }) {
  const pct = (num, den) => (den ? (100 * num) / den : null); // percent, the estate form (assert_parcel_sanity)
  const ratio = (num, den) => (den ? num / den : null);
  const misses = [...new Set(m.slug_resolution_miss_slugs)].slice(0, config.classify_coa_trades_max_detail_keys).sort();
  return {
    ...m,
    slug_resolution_miss_slugs: undefined,
    slug_resolution_misses: misses,
    // Legacy parity (pinned L16): an empty cursor reads 0, never N/A (`:415-417`).
    unmapped_scope_pct: m.processed ? pct(m.coa_zero_trades, m.processed) : 0,
    realtor_inclusion_pct: pct(m.realtor_append_count, m.residential_count),
    avg_active_trades_per_lead: ratio(m.active_trade_rows_total, m.coa_with_active_trades),
    median_active_trades_per_lead_nonzero: histMedian(m.active_trades_hist, m.coa_with_active_trades),
    avg_evidence_trades_per_lead: ratio(m.evidence_trade_rows_total, m.coa_with_evidence_trades),
    median_evidence_trades_per_lead_nonzero: histMedian(m.evidence_trades_hist, m.coa_with_evidence_trades),
    inference_layer_enabled: Number(config.p16_inference_layer_enabled),
    coa_inference_rows_emitted: m.coa_trades_inference,
    ...vocabCoverage('trade_vocab', post),
    ...vocabCoverage('product_vocab', post),
  };
}

/**
 * The two vocab-coverage triples (the legacy step's `telemetry_vocab_cols` registry entry,
 * read at `classify-coa-trades.js:563-564`), as data. Each renders the SAME intersection-count statement the legacy
 * `computeVocabCoverage` → `scripts/lib/vocab-coverage.js` `resolveAndCountTripleWithClient` issues (`:80-83`): the data
 * filter on the data side, the vocab filter on the vocab side, independently.
 */
const VOCAB_TRIPLES = Object.freeze({
  trade_vocab: Object.freeze({ dataTable: 'lead_trades', dataColumn: 'trade_id', dataFilter: "lead_id LIKE 'coa:%'", vocabTable: 'trades', vocabColumn: 'id', vocabFilter: "kind != 'deprecated'" }),
  product_vocab: Object.freeze({ dataTable: 'lead_products', dataColumn: 'product_id', dataFilter: "lead_id LIKE 'coa:%'", vocabTable: 'product_groups', vocabColumn: 'id' }),
});

/** One triple's two scalar subqueries, text-identical to the legacy core's (quoted identifiers, `::int`). */
function vocabSubqueries(label, t) {
  const q = (s) => `"${s}"`;
  const vWhere = t.vocabFilter ? ` WHERE ${t.vocabFilter}` : '';
  const dAnd = t.dataFilter ? ` AND (${t.dataFilter})` : '';
  return [
    `(SELECT COUNT(DISTINCT ${q(t.dataColumn)})::int FROM ${q(t.dataTable)}
                WHERE ${q(t.dataColumn)} IN (SELECT ${q(t.vocabColumn)} FROM ${q(t.vocabTable)}${vWhere})${dAnd}) AS ${label}_present`,
    `(SELECT COUNT(DISTINCT ${q(t.vocabColumn)})::int FROM ${q(t.vocabTable)}${vWhere}) AS ${label}_vocab_size`,
  ];
}

/**
 * The once-per-run post read (Spec 124 R-EH (e): "An optional `buildPostSql` runs once after the loop"): the
 * vocab coverage of what this run left in lead_trades / lead_products, read after the last batch commits, as the
 * legacy step read it after its loop (CCT-D6). One statement, one row.
 */
function buildPostSql() {
  const cols = Object.entries(VOCAB_TRIPLES).flatMap(([label, t]) => vocabSubqueries(label, t));
  return { post_sql: `SELECT ${cols.join(',\n       ')}`, post_binds: [], post_params: [] };
}

/**
 * The legacy cov_ row's measurement (`scripts/lib/pipeline.js:500-516`): percent to one decimal over the vocab size.
 * 0/0 has nothing to measure (legacy INFO); data present over an empty vocab is unmeasurable (legacy WARN).
 */
function vocabCoverage(label, post) {
  const p = post || {};
  const present = Number(p[`${label}_present`]) || 0;
  const vocabSize = Number(p[`${label}_vocab_size`]) || 0;
  return {
    [`${label}_present`]: present,
    [`${label}_vocab_size`]: vocabSize,
    [`${label}_pct`]: vocabSize ? Math.round((present / vocabSize) * 1000) / 10 : null,
  };
}

// ---- checks (descriptor order; Spec 122 §5.5 (1), (4)) ----

function coa_eligible(ctx) {
  ctx.report('coa_eligible', { value: ctx.matched.processed });
}

function unmapped_scope_pct(ctx) {
  ctx.report('unmapped_scope_pct', { value: ctx.matched.unmapped_scope_pct });
}

function avg_active_trades_per_lead(ctx) {
  const m = ctx.matched;
  // Legacy INFO with value N/A when no CoA has an active trade (`:450-452`): the population is empty.
  if (!m.coa_with_active_trades) { ctx.report('avg_active_trades_per_lead', { value: 0, inert: true, detail: 'N/A' }); return; }
  // Spec 124 R-EP (operator y 2026-10-19): the two dynamic-keyed tallies (keys are slugs / per-lead counts, unknown at
  // declaration) are not emits; they travel as this row's detail, capped by classify_coa_trades_max_detail_keys, with the
  // measured mean beside them (the load_ravines LR-D1 form). The cap is applied by slice and truncation read from it (R-DC).
  const cap = ctx.config.classify_coa_trades_max_detail_keys;
  const slugs = cappedTally(m.trade_slug_distribution, cap, (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const hist = cappedTally(m.coa_trades_per_lead_histogram, cap, (a, b) => Number(a[0]) - Number(b[0]));
  ctx.report('avg_active_trades_per_lead', {
    value: m.avg_active_trades_per_lead,
    detail: {
      avg_active_trades_per_lead: m.avg_active_trades_per_lead,
      trade_slug_distribution: slugs.shown,
      trade_slug_distribution_truncated: slugs.truncated,
      coa_trades_per_lead_histogram: hist.shown,
      coa_trades_per_lead_histogram_truncated: hist.truncated,
    },
  });
}

/** One `{key: count}` tally, sorted by `order` and sliced to `cap` keys (R-EP; display bound, compared against nothing). */
function cappedTally(tally, cap, order) {
  const entries = Object.entries(tally || {}).sort(order);
  const shown = entries.slice(0, cap);
  return { shown: Object.fromEntries(shown), truncated: shown.length < entries.length };
}

function slug_resolution_miss_count(ctx) {
  const m = ctx.matched;
  ctx.report('slug_resolution_miss_count', { violations: m.slug_resolution_miss_count, ...(m.slug_resolution_miss_count ? { detail: m.slug_resolution_misses } : {}) });
}

function product_slug_miss_count(ctx) {
  ctx.report('product_slug_miss_count', { violations: ctx.matched.product_slug_miss_count });
}

function realtor_unavailable(ctx) {
  // Summed per batch by the runner (R-EH (c)); any batch without the realtor slug is the one condition.
  ctx.report('realtor_unavailable', { violations: ctx.matched.realtor_unavailable ? 1 : 0 });
}

function vocabRow(ctx, id, label) {
  const m = ctx.matched;
  const present = m[`${label}_present`];
  const size = m[`${label}_vocab_size`];
  if (!size && !present) ctx.report(id, { value: 0, inert: true, detail: '0/0' });
  else if (!size) ctx.report(id, { value: null, detail: `${present}/0 (empty vocab)` });
  else ctx.report(id, { value: m[`${label}_pct`], detail: `${present}/${size} (${m[`${label}_pct`]}%)` });
}

function trade_vocab_coverage(ctx) {
  vocabRow(ctx, 'trade_vocab_coverage', 'trade_vocab');
}

function product_vocab_coverage(ctx) {
  vocabRow(ctx, 'product_vocab_coverage', 'product_vocab');
}

// ---- dispatch ----

/** Spec 122 §5.5 (1): keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  coa_eligible,
  unmapped_scope_pct,
  avg_active_trades_per_lead,
  slug_resolution_miss_count,
  product_slug_miss_count,
  realtor_unavailable,
  trade_vocab_coverage,
  product_vocab_coverage,
};

/**
 * §5.5 (1): run the SELECTED post checks over the runner-summed `ctx.matched` (the rows arm hands it over, R-EH),
 * and return the declared emits. The loop is the error boundary.
 */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.matched) return { records_meta: {} };
  const meta = {};
  for (const e of ctx.descriptor.emits || []) if (ctx.matched[e.key] !== undefined) meta[e.key] = ctx.matched[e.key];
  return { records_meta: meta };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildSourceSql = buildSourceSql;
module.exports.materializeRows = materializeRows;
module.exports.finalizeMatched = finalizeMatched;
module.exports.buildPostSql = buildPostSql;
module.exports.histMedian = histMedian;
module.exports.REALTOR_SLUG = REALTOR_SLUG;
module.exports.VOCAB_TRIPLES = VOCAB_TRIPLES;
