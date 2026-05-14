#!/usr/bin/env node
/**
 * Classify CoA applications into trade rows by consuming scope_tags via the
 * R5.1 TAG_TRADE_MATRIX substrate.
 *
 * Writes 0..N rows to `lead_trades` per CoA per the matrix lookup, plus an
 * optional realtor row when the CoA is residential. Sets
 * `coa_applications.trade_classified_at` to RUN_AT after a batch flushes.
 *
 * Pure classifier extracted to scripts/lib/coa-trade-classifier.js with TS
 * twin at src/lib/classification/coa-trade-classifier.ts (Spec 84 §7).
 *
 * R5.4 R8 plan-review folds applied (2026-05-14):
 *   - #1: unmapped threshold relaxed to <= coa_trades_unmapped_threshold_pct%
 *   - #2: lead_score = Math.round(confidence * 100)
 *   - #3: realtor availability startup guard via checkRealtorAvailable
 *   - #5: ON CONFLICT (lead_id, trade_id) DO UPDATE SET includes classified_at
 *   - #8: per-batch trade_classified_at UPDATE uses WHERE id = ANY($ids::bigint[])
 *   - #9: slug_resolution_miss_count audit metric (== 0 FAIL)
 *   - #10: RETURNING (xmax = 0) for accurate records_new vs records_updated
 *
 * Phase H integration gap (R8 fold #11, operator-facing): downstream
 * compute-trade-forecasts.js / compute-opportunity-scores.js currently read
 * permit_trades, not lead_trades. CoA trade rows live correctly in
 * lead_trades but produce zero trade_forecasts coverage until the Phase H
 * rekey. Documented at docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase H.
 *
 * Usage:
 *   node scripts/classify-coa-trades.js
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5 + §6.8 row 667 + §6.11 Phase D R5.4
 *            docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
 *            docs/specs/01-pipeline/80_taxonomies.md §5 (realtor gate)
 *            docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (dual-path)
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { lookupTradesForTags, shouldAppendRealtor } = require('./lib/coa-trade-classifier');
const { checkRealtorAvailable, REALTOR_TRADE_ID } = require('./lib/pipeline-realtor-availability');

// §R2 — advisory lock 4203 (Spec 42 §6.8 Phase D allocation)
const ADVISORY_LOCK_ID = 4203;

// §R4 — Zod schema for required logic_variables
const LOGIC_VARS_SCHEMA = z
  .object({
    coa_trades_unmapped_threshold_pct: z.coerce.number().finite().nonnegative().max(100),
  })
  .passthrough();

// Spec 47 §6.3: BATCH_SIZE = Math.floor(65535 / COL_COUNT). The lead_trades
// INSERT emits 8 columns per row (lead_id, trade_id, tier, confidence,
// is_active, phase, lead_score, classified_at). The Math.min(1000, ...) cap
// is memory-bounded (in-process batch staging), not param-bounded.
const LEAD_TRADES_COL_COUNT = 8;
const INSERT_BATCH_SIZE = Math.min(1000, Math.floor(65535 / LEAD_TRADES_COL_COUNT));

pipeline.run('classify-coa-trades', async (pool) => {
  // §R3.5 + §R5 — RUN_AT + config validated BEFORE lock contention.
  // Self-checklist (n): RUN_AT must be captured before withAdvisoryLock.
  const RUN_AT = await pipeline.getDbTimestamp(pool);
  const startTime = Date.now();

  const { logicVars } = await loadMarketplaceConfigs(pool, 'classify-coa-trades');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'classify-coa-trades');
  if (!validation.valid) {
    throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  }
  const unmappedThresholdPct = logicVars.coa_trades_unmapped_threshold_pct;

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // R8 fold #3 — realtor availability startup guard. Without trades.id=33
    // present (mig 118 not applied), the INSERT would crash on FK violation.
    const realtorAvailable = await checkRealtorAvailable(pool);
    if (!realtorAvailable) {
      pipeline.log.warn(
        '[classify-coa-trades]',
        'Realtor trade row (trades.id=33) NOT FOUND — continuing with construction-trade classification only.',
      );
    }

    // SLUG_TO_ID — load from trades table at startup. Misses (slugs in the
    // matrix that don't exist in trades) are tracked as the slug_resolution
    // _miss_count audit metric (R8 fold #9 — schema-drift detector).
    const tradesResult = await pool.query('SELECT id, slug FROM trades');
    const SLUG_TO_ID = new Map(tradesResult.rows.map((t) => [t.slug, t.id]));

    // Counters.
    let processed = 0;
    let coaWithTrades = 0;
    let coaZeroTrades = 0;
    let residentialCount = 0;
    let realtorAppendCount = 0;
    let slugResolutionMissCount = 0;
    let recordsNew = 0;       // R8 fold #10 — xmax-derived true INSERTs
    let recordsUpdated = 0;   // R8 fold #10 — xmax-derived ON CONFLICT UPDATEs
    const tradeSlugDist = new Map();
    const coaTradesPerLeadHist = new Map(); // bucket: trade-count → CoA count
    // Review fold (Worktree#2 IMP-3): expose WHICH slugs missed for actionable
    // diagnostics. Capped at 50 distinct slugs per Spec 47 §8.4.
    const slugResolutionMissSet = new Set();
    const SLUG_MISS_CAP = 50;

    // Batched INSERT staging.
    const batch = {
      coaIds: [],
      rows: [],   // each entry: [lead_id, trade_id, tier, confidence, is_active, phase, lead_score]
    };

    async function flushBatch() {
      if (batch.rows.length === 0 && batch.coaIds.length === 0) return;

      // Build the INSERT VALUES clause + params. 8 params per row.
      const insertValuesParts = [];
      const insertParams = [];
      let p = 1;
      for (const row of batch.rows) {
        insertValuesParts.push(
          `($${p++}::text, $${p++}::int, $${p++}::int, $${p++}::numeric, $${p++}::boolean, $${p++}::varchar, $${p++}::int, $${p++}::timestamptz)`,
        );
        // [lead_id, trade_id, tier, confidence, is_active, phase, lead_score]
        insertParams.push(row[0], row[1], row[2], row[3], row[4], row[5], row[6], RUN_AT);
      }

      await pipeline.withTransaction(pool, async (client) => {
        if (insertValuesParts.length > 0) {
          // R8 fold #5 — classified_at = EXCLUDED.classified_at in DO UPDATE SET.
          // R8 fold #10 — RETURNING (xmax = 0) AS is_insert distinguishes
          // true INSERTs from ON CONFLICT UPDATEs (records_new vs _updated).
          const result = await client.query(
            `INSERT INTO lead_trades
               (lead_id, trade_id, tier, confidence, is_active, phase, lead_score, classified_at)
             VALUES ${insertValuesParts.join(', ')}
             ON CONFLICT (lead_id, trade_id) DO UPDATE SET
               tier          = EXCLUDED.tier,
               confidence    = EXCLUDED.confidence,
               is_active     = EXCLUDED.is_active,
               phase         = EXCLUDED.phase,
               lead_score    = EXCLUDED.lead_score,
               classified_at = EXCLUDED.classified_at
             RETURNING (xmax = 0) AS is_insert`,
            insertParams,
          );
          for (const r of result.rows) {
            if (r.is_insert) recordsNew++;
            else recordsUpdated++;
          }
        }

        // R8 fold #8 — single batched UPDATE for trade_classified_at, regardless
        // of how many trades each CoA matched. Zero-trade CoAs still need the
        // timestamp advanced or the streamQuery cursor will re-fetch forever.
        await client.query(
          `UPDATE coa_applications
              SET trade_classified_at = $2::timestamptz
            WHERE id = ANY($1::bigint[])`,
          [batch.coaIds, RUN_AT],
        );
      });

      batch.rows = [];
      batch.coaIds = [];
    }

    // §R7 — streamQuery for the source SELECT. Self-checklist (b)
    // idempotency cursor + (l) requires scope_tags IS NOT NULL.
    const sourceStream = pipeline.streamQuery(
      pool,
      `SELECT id, lead_id, scope_tags, coa_type_class, scope_classified_at
         FROM coa_applications
        WHERE scope_tags IS NOT NULL
          AND scope_classified_at IS NOT NULL
          AND (trade_classified_at IS NULL OR trade_classified_at < scope_classified_at)
        ORDER BY id ASC`,
      [],
    );

    for await (const row of sourceStream) {
      processed++;

      // Matrix lookup (R5.1 substrate handles case-insensitivity + type-guard).
      const matches = lookupTradesForTags(row.scope_tags);

      // R8 fold #2 — lead_score formula committed: Math.round(confidence * 100).
      const tradeRows = [];
      for (const { slug, confidence } of matches) {
        const tradeId = SLUG_TO_ID.get(slug);
        if (tradeId == null) {
          // R8 fold #9 — schema-drift catch: matrix emits a slug not in trades.
          slugResolutionMissCount++;
          if (slugResolutionMissSet.size < SLUG_MISS_CAP) slugResolutionMissSet.add(slug);
          continue;
        }
        tradeRows.push([
          row.lead_id,
          tradeId,
          // Gemini NIT review fold: per migration 124:13 "tier IN (1,2,3) for
          // permit-side, always 3 for CoA-side (description-only matching)".
          // Tier-3 is the CoA-specific value, NOT a mirror of permit Tier-2.
          3,
          confidence,
          true,
          null, // phase — determineCoaPhase always null at CoA submission
          Math.round(confidence * 100),
        ]);
        tradeSlugDist.set(slug, (tradeSlugDist.get(slug) ?? 0) + 1);
      }

      // Realtor append — 1-axis gate on coa_type_class (R8 fold #14 deferral note).
      const isResidential = shouldAppendRealtor({ coa_type_class: row.coa_type_class });
      if (isResidential) residentialCount++;
      if (isResidential && realtorAvailable) {
        const realtorSlug = 'realtor';
        const realtorConfidence = 0.7;
        tradeRows.push([
          row.lead_id,
          REALTOR_TRADE_ID,
          3,
          realtorConfidence,
          true,
          null,
          Math.round(realtorConfidence * 100),
        ]);
        tradeSlugDist.set(realtorSlug, (tradeSlugDist.get(realtorSlug) ?? 0) + 1);
        realtorAppendCount++;
      }

      if (tradeRows.length > 0) {
        coaWithTrades++;
        batch.rows.push(...tradeRows);
      } else {
        coaZeroTrades++;
      }
      // R8 fold #8 — every CoA gets its id staged so trade_classified_at
      // advances even on zero-trade rows (otherwise the cursor re-fetches).
      batch.coaIds.push(row.id);

      const bucket = String(tradeRows.length);
      coaTradesPerLeadHist.set(bucket, (coaTradesPerLeadHist.get(bucket) ?? 0) + 1);

      // Review fold (Gemini CRIT + DeepSeek HIGH + Worktree#2 CRIT-2 + Indep C-1
      // 4-way concur): batch flush MUST trigger on the rows-array size, not on
      // the CoA-id-array size. A single CoA can emit up to ~16 trade rows
      // (build-sfd with realtor append). With 1000 CoAs buffered, batch.rows
      // could reach ~16,000 entries × 8 params = 128,000 params — 2× the
      // 65,535 PostgreSQL parameter limit. The CoA-id UPDATE uses
      // `ANY($1::bigint[])` so coaIds growth is unconstrained on its side.
      if (batch.rows.length >= INSERT_BATCH_SIZE || batch.coaIds.length >= INSERT_BATCH_SIZE) {
        await flushBatch();
        if (processed % 5000 === 0) {
          pipeline.log.info(
            '[classify-coa-trades]',
            `Processed ${processed.toLocaleString()} CoAs so far`,
          );
        }
      }
    }

    // Final flush.
    await flushBatch();

    // ─── Audit table emit (Spec 42 §6.8 row 667 + R8 fold #1, #9 +
    //                       review folds Worktree#2 IMP-1/IMP-3 + Indep M-2) ───
    const durationMs = Date.now() - startTime;
    const unmappedPct = processed > 0 ? (coaZeroTrades / processed) * 100 : 0;
    const realtorInclusionPct =
      residentialCount > 0 ? (realtorAppendCount / residentialCount) * 100 : null;
    const totalLeadTradeRows = recordsNew + recordsUpdated;
    // Indep M-2: avg trades per lead as a scalar in auditRows (histogram is
    // invisible to FreshnessTimeline audit-table renderer; only auditRows
    // entries surface in the UI).
    const avgTradesPerLead = coaWithTrades > 0 ? totalLeadTradeRows / coaWithTrades : 0;

    const auditRows = [
      // Worktree#2 IMP-1: surface the empty-cursor first-run via a WARN row
      // instead of letting unmapped_scope_pct silently PASS at 0%.
      {
        metric: 'coa_eligible',
        value: processed,
        threshold: '> 0',
        status: processed > 0 ? 'PASS' : 'WARN',
      },
      { metric: 'coa_with_trades', value: coaWithTrades, threshold: null, status: 'INFO' },
      { metric: 'coa_zero_trades', value: coaZeroTrades, threshold: null, status: 'INFO' },
      // R8 fold #1 — relaxed threshold: <= unmappedThresholdPct% WARN.
      // Replaces the spec literal `unmapped_coa_count == 0 FAIL` which would
      // perma-FAIL given variance-only CoAs legitimately produce zero trades.
      {
        metric: 'unmapped_scope_pct',
        value: unmappedPct.toFixed(1) + '%',
        threshold: `<= ${unmappedThresholdPct}%`,
        status: unmappedPct <= unmappedThresholdPct ? 'PASS' : 'WARN',
      },
      // R8 fold #17 — N/A when residentialCount=0 to avoid false WARN.
      {
        metric: 'realtor_inclusion_pct',
        value: realtorInclusionPct === null ? 'N/A' : realtorInclusionPct.toFixed(1) + '%',
        threshold: realtorInclusionPct === null ? 'N/A' : null,
        status: 'INFO',
      },
      // Indep M-2: scalar coa_trades_per_lead for the audit-table UI.
      {
        metric: 'avg_trades_per_lead',
        value: avgTradesPerLead.toFixed(2),
        threshold: null,
        status: 'INFO',
      },
      // R8 fold #9 — schema-drift catch. == 0 FAIL is the right threshold here
      // (this catches matrix↔trades-table divergence, not data sparsity).
      {
        metric: 'slug_resolution_miss_count',
        value: slugResolutionMissCount,
        threshold: '== 0',
        status: slugResolutionMissCount === 0 ? 'PASS' : 'FAIL',
      },
      { metric: 'records_new', value: recordsNew, threshold: null, status: 'INFO' },
      { metric: 'records_updated', value: recordsUpdated, threshold: null, status: 'INFO' },
      { metric: 'total_lead_trades_written', value: totalLeadTradeRows, threshold: null, status: 'INFO' },
    ];

    const verdict = auditRows.some((r) => r.status === 'FAIL')
      ? 'FAIL'
      : auditRows.some((r) => r.status === 'WARN')
        ? 'WARN'
        : 'PASS';

    pipeline.emitSummary({
      records_total: processed,
      records_new: recordsNew,
      records_updated: recordsUpdated,
      records_meta: {
        duration_ms: durationMs,
        coa_processed: processed,
        coa_with_trades: coaWithTrades,
        coa_zero_trades: coaZeroTrades,
        residential_count: residentialCount,
        realtor_append_count: realtorAppendCount,
        slug_resolution_miss_count: slugResolutionMissCount,
        // Worktree#2 IMP-3: actionable diagnostic. Capped at SLUG_MISS_CAP (50).
        slug_resolution_misses: Array.from(slugResolutionMissSet).sort(),
        trade_slug_distribution: Object.fromEntries(tradeSlugDist),
        coa_trades_per_lead_histogram: Object.fromEntries(coaTradesPerLeadHist),
        audit_table: {
          phase: 42,
          name: 'CoA Trade Classification',
          verdict,
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      {
        coa_applications: [
          'id',
          'lead_id',
          'scope_tags',
          'coa_type_class',
          'scope_classified_at',
          'trade_classified_at',
        ],
        trades: ['id', 'slug'],
      },
      {
        lead_trades: [
          'lead_id',
          'trade_id',
          'tier',
          'confidence',
          'is_active',
          'phase',
          'lead_score',
          'classified_at',
        ],
        coa_applications: ['trade_classified_at'],
      },
    );

    pipeline.log.info('[classify-coa-trades]', 'Classification complete', {
      processed,
      coa_with_trades: coaWithTrades,
      coa_zero_trades: coaZeroTrades,
      records_new: recordsNew,
      records_updated: recordsUpdated,
      slug_resolution_miss_count: slugResolutionMissCount,
      duration: `${(durationMs / 1000).toFixed(1)}s`,
    });
  });

  // §R12 — SKIP guard.
  if (!lockResult.acquired) return;
});
