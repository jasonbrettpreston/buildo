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
 * Downstream forecast coverage (Spec 80 Phase 3 correction — the old "Phase H
 * gap" note was stale): compute-trade-forecasts.js Phase F.1 DOES read these rows
 * (`FROM lead_trades WHERE lead_id LIKE 'coa:%'`, gated by coaGateActive), so CoA
 * trades flow into trade_forecasts → opportunity_score → the lead feed. The §5.B.5
 * archetype bundle prior (added Phase 3) therefore increases CoA forecast coverage;
 * the first post-deploy run produces a one-time volume spike (Spec 48 §3.7 runbook).
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
const {
  classifyCoaTrades,
  classifyCoaProducts,
  shouldAppendRealtor,
  DEPRECATED_TRADE_SLUGS,
} = require('./lib/coa-trade-classifier');
const { checkRealtorAvailable, REALTOR_TRADE_ID } = require('./lib/pipeline-realtor-availability');
const manifest = require('./manifest.json');

// §R2 — advisory lock 4203 (Spec 42 §6.8 Phase D allocation)
const ADVISORY_LOCK_ID = 4203;

// §R4 — Zod schema for required logic_variables
const LOGIC_VARS_SCHEMA = z
  .object({
    coa_trades_unmapped_threshold_pct: z.coerce.number().finite().nonnegative().max(100),
    // cov_* vocabulary-coverage thresholds (Spec 30 §3 / 48 §3.5 — the cov_ primitive).
    vocab_coverage_pass_pct: z.coerce.number().int().min(0).max(100),
    vocab_coverage_warn_pct: z.coerce.number().int().min(0).max(100),
    // Spec 80 §5.B.5 — bundle-tier confidence (mig 182). P16 16D: the trade bundle prior is
    // RETIRED; the var stays validated (products/telemetry heritage) but is no longer consumed here.
    archetype_bundle_confidence: z.coerce.number().min(0).max(1).default(0.55),
    // WF2 P6.5 — active-scoped fan-out WARN ceiling (mean active trades/CoA). P16 16D
    // reconciliation [GRD-3]: this ceiling now governs the ALL-ACTIVE variant (evidence +
    // inference + realtor). 18 sits above the largest lean complement (coa_build = 16 by
    // design — build-line CoAs legitimately reach ~16-18) while still catching the P6.6-class
    // 33-trade re-inflation. The permit-side D7 [8,11]/13 band does NOT govern CoA (its corpus
    // is build-line-heavy); choice recorded in the P16 eval report + Spec 80 §5.C.
    coa_active_trades_warn_max: z.coerce.number().finite().positive().max(35).default(18),
    // P16 §5.C [BUG-6] — hard gate for the lean inference layer (0 = OFF, evidence-only).
    p16_inference_layer_enabled: z.coerce.number().int().min(0).max(1).default(0),
  })
  .passthrough()
  .refine((d) => d.vocab_coverage_warn_pct < d.vocab_coverage_pass_pct, {
    message: 'vocab_coverage_warn_pct must be strictly less than vocab_coverage_pass_pct',
  });

// Spec 47 §6.3: BATCH_SIZE = Math.floor(65535 / COL_COUNT). The lead_trades
// INSERT emits 9 columns per row (lead_id, trade_id, tier, confidence,
// is_active, phase, lead_score, attachment_basis, classified_at — P16 16D added
// attachment_basis [A2]). The Math.min(1000, ...) cap is memory-bounded
// (in-process batch staging), not param-bounded.
const LEAD_TRADES_COL_COUNT = 9;
const INSERT_BATCH_SIZE = Math.min(1000, Math.floor(65535 / LEAD_TRADES_COL_COUNT));
// Spec 80 §5.B — lead_products (mig 184). Its OWN param fence (4 cols: lead_id,
// product_id, confidence, classified_at) — NOT shared with the 8-col trade fence.
const LEAD_PRODUCTS_COL_COUNT = 4;
const PRODUCT_BATCH_SIZE = Math.min(1000, Math.floor(65535 / LEAD_PRODUCTS_COL_COUNT));

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
  // WF2 P6.5 — active fan-out WARN ceiling (default 18 via schema). Post-16D this governs
  // the ALL-ACTIVE mean (evidence + inference + realtor) — see the Zod schema note [GRD-3].
  const activeTradesWarnMax = Number(logicVars.coa_active_trades_warn_max ?? 18);
  // P16 §5.C [BUG-6] — the lean inference layer's hard gate (seeded OFF; flips in 16F).
  const inferenceEnabled = Number(logicVars.p16_inference_layer_enabled) === 1;

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

    // Spec 80 §5.B — product vocab (slug → id) from product_groups, mirroring the
    // trade SLUG_TO_ID. Misses (matrix/bundle slug not in product_groups) tracked below.
    const productGroupsResult = await pool.query('SELECT id, slug FROM product_groups');
    const PRODUCT_SLUG_TO_ID = new Map(productGroupsResult.rows.map((p) => [p.slug, p.id]));

    // Counters.
    let processed = 0;
    let coaWithTrades = 0;
    let coaZeroTrades = 0;
    let residentialCount = 0;
    let realtorAppendCount = 0;
    let slugResolutionMissCount = 0;
    // Spec 80 §5.C P16 16D provenance counters (Spec 48 §3.6 INFO rows — emit even at 0).
    // strong/evidence = a direct tag-matrix hit (attachment_basis='evidence'); inference =
    // the lean scope-mapped complement is the slug's sole source ('inference', gated).
    // The coarse bundle prior is RETIRED — coa_trades_bundle_only retired WITH it (knowingly).
    // The realtor append is excluded from both (not a matrix/complement trade).
    let coaTradesStrong = 0;    // evidence-basis rows
    let coaTradesInference = 0; // inference-basis rows (0 while the gate is OFF)
    // [GRD-3] counter re-scope: post-16D active = evidence + inference + realtor, so the P6.6
    // `active == strong` identity breaks BY DESIGN. Split telemetry:
    //   (a) EVIDENCE-scoped mean/median (preserves P6.6's fan-out honesty — the direct-signal
    //       distribution, INFO);
    //   (b) ALL-ACTIVE mean/median governed by the operator ceiling coa_active_trades_warn_max
    //       (18 — sits above the largest lean complement coa_build=16; catches 33-trade
    //       re-inflation; the permit D7 [8,11]/13 band does NOT govern the build-line-heavy CoA
    //       corpus — reconciliation recorded in the P16 eval report).
    // Denominators = CoAs with ≥1 row in the respective scope (severance-only legitimately 0).
    let coaWithActiveTrades = 0;
    let activeTradeRowsTotal = 0;
    const activeTradesPerCoaHist = new Map(); // ALL-ACTIVE count → #CoAs, for the median.
    let coaWithEvidenceTrades = 0;
    let evidenceTradeRowsTotal = 0;
    const evidenceTradesPerCoaHist = new Map(); // EVIDENCE count → #CoAs, for the median.
    // Spec 80 §5.B product counters (INFO).
    let coaWithProducts = 0;
    let productRowsWritten = 0;
    let productSlugMissCount = 0;
    const productSlugDist = new Map();
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
      rows: [],   // each entry: [lead_id, trade_id, tier, confidence, is_active, phase, lead_score, attachment_basis]
      leadIds: [],     // every processed CoA lead_id — drives the lead_products resync (Spec 80 §5.B)
      productRows: [], // each entry: [lead_id, product_id, confidence]
    };

    async function flushBatch() {
      if (batch.rows.length === 0 && batch.coaIds.length === 0) return;

      // Build the INSERT VALUES clause + params. 9 params per row (P16 16D: +attachment_basis).
      const insertValuesParts = [];
      const insertParams = [];
      let p = 1;
      for (const row of batch.rows) {
        insertValuesParts.push(
          `($${p++}::text, $${p++}::int, $${p++}::int, $${p++}::numeric, $${p++}::boolean, $${p++}::varchar, $${p++}::int, $${p++}::text, $${p++}::timestamptz)`,
        );
        // [lead_id, trade_id, tier, confidence, is_active, phase, lead_score, attachment_basis]
        insertParams.push(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], RUN_AT);
      }

      await pipeline.withTransaction(pool, async (client) => {
        if (insertValuesParts.length > 0) {
          // R8 fold #5 — classified_at = EXCLUDED.classified_at in DO UPDATE SET.
          // R8 fold #10 — RETURNING (xmax = 0) AS is_insert distinguishes
          // true INSERTs from ON CONFLICT UPDATEs (records_new vs _updated).
          const result = await client.query(
            `INSERT INTO lead_trades
               (lead_id, trade_id, tier, confidence, is_active, phase, lead_score, attachment_basis, classified_at)
             VALUES ${insertValuesParts.join(', ')}
             ON CONFLICT (lead_id, trade_id) DO UPDATE SET
               tier             = EXCLUDED.tier,
               confidence       = EXCLUDED.confidence,
               is_active        = EXCLUDED.is_active,
               phase            = EXCLUDED.phase,
               lead_score       = EXCLUDED.lead_score,
               attachment_basis = EXCLUDED.attachment_basis,
               classified_at    = EXCLUDED.classified_at
             RETURNING (xmax = 0) AS is_insert`,
            insertParams,
          );
          for (const r of result.rows) {
            if (r.is_insert) recordsNew++;
            else recordsUpdated++;
          }
        }

        // Spec 80 §5.B — lead_products resync (mig 184). Delete-then-insert per processed
        // lead so a CoA whose products changed (or dropped to zero) is fully resynced.
        // BEFORE the trade_classified_at watermark (mirror classify-permits "watermark LAST"):
        // products must be durable before the cursor stops re-fetching the lead.
        if (batch.leadIds.length > 0) {
          await client.query(`DELETE FROM lead_products WHERE lead_id = ANY($1::text[])`, [batch.leadIds]);
        }
        if (batch.productRows.length > 0) {
          const pv = [];
          const pp = [];
          let q = 1;
          for (const pr of batch.productRows) {
            pv.push(`($${q++}::text, $${q++}::int, $${q++}::numeric, $${q++}::timestamptz)`);
            pp.push(pr[0], pr[1], pr[2], RUN_AT);
          }
          // ON CONFLICT DO NOTHING: the per-lead DELETE above already cleared the set, so a
          // duplicate (lead_id, product_id) within one batch is the only conflict source.
          await client.query(
            `INSERT INTO lead_products (lead_id, product_id, confidence, classified_at)
             VALUES ${pv.join(', ')}
             ON CONFLICT (lead_id, product_id) DO NOTHING`,
            pp,
          );
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
      batch.leadIds = [];
      batch.productRows = [];
    }

    // §R7 — streamQuery for the source SELECT. Self-checklist (b)
    // idempotency cursor + (l) requires scope_tags IS NOT NULL.
    const sourceStream = pipeline.streamQuery(
      pool,
      `SELECT id, lead_id, scope_tags, coa_type_class, project_type, structure_type, scope_classified_at
         FROM coa_applications
        WHERE scope_tags IS NOT NULL
          AND scope_classified_at IS NOT NULL
          AND (trade_classified_at IS NULL OR trade_classified_at < scope_classified_at)
        ORDER BY id ASC`,
      [],
    );

    for await (const row of sourceStream) {
      processed++;

      // P16 16D — direct tag-matrix EVIDENCE + the gated lean INFERENCE layer (the coarse
      // bundle prior is RETIRED; classifyCoaTrades returns attachment_basis provenance).
      const matches = classifyCoaTrades(row, { inferenceEnabled });

      // R8 fold #2 — lead_score formula committed: Math.round(confidence * 100).
      const tradeRows = [];
      let evidenceThisCoa = 0; // [GRD-3] evidence-basis rows for THIS CoA (P6.6 honesty scope).
      let activeThisCoa = 0;   // ALL-ACTIVE rows for THIS CoA (evidence + inference + realtor).
      for (const { slug, confidence, attachment_basis } of matches) {
        const tradeId = SLUG_TO_ID.get(slug);
        if (tradeId == null) {
          // R8 fold #9 — schema-drift catch: matrix emits a slug not in trades.
          slugResolutionMissCount++;
          if (slugResolutionMissSet.size < SLUG_MISS_CAP) slugResolutionMissSet.add(slug);
          continue;
        }
        // P16 16D provenance split: evidence = direct tag-matrix; inference = the lean
        // complement's sole-source rows (gated — 0 while p16_inference_layer_enabled=0).
        if (attachment_basis === 'inference') coaTradesInference++;
        else { coaTradesStrong++; evidenceThisCoa++; }
        activeThisCoa++;
        tradeRows.push([
          row.lead_id,
          tradeId,
          // Gemini NIT review fold: per migration 124:13 "tier IN (1,2,3) for
          // permit-side, always 3 for CoA-side (description-only matching)".
          // Tier-3 is the CoA-specific value, NOT a mirror of permit Tier-2.
          3,
          confidence,
          // P16 16D — is_active = true for BOTH bases (D1/D5: inference SERVES; ranking
          // authority is attachment_basis, never is_active or the 0.50 confidence). The
          // P6.6 `!fromBundle` demotion evolves into bundle RETIREMENT + measured lean
          // inference (16B GO gate); severance-only → 0 rows preserved (null mapToLines).
          true,
          null, // phase — determineCoaPhase always null at CoA submission
          Math.round(confidence * 100),
          attachment_basis, // P16 D4 — provenance column [A2]
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
          'evidence', // P16 D4 — the realtor append is a direct (gated) signal, not inference
        ]);
        tradeSlugDist.set(realtorSlug, (tradeSlugDist.get(realtorSlug) ?? 0) + 1);
        realtorAppendCount++;
        activeThisCoa++; // WF2 P6.6 — realtor append stays is_active=true.
      }

      if (tradeRows.length > 0) {
        coaWithTrades++;
        batch.rows.push(...tradeRows);
      } else {
        coaZeroTrades++;
      }
      // WF2 P6.5 + P16 [GRD-3] — dual-scope fan-out: the ALL-ACTIVE histogram (gate) and the
      // EVIDENCE-scoped histogram (P6.6 honesty, INFO). Denominators = ≥1 row in scope.
      if (activeThisCoa > 0) {
        coaWithActiveTrades++;
        activeTradeRowsTotal += activeThisCoa;
        activeTradesPerCoaHist.set(
          activeThisCoa,
          (activeTradesPerCoaHist.get(activeThisCoa) ?? 0) + 1,
        );
      }
      if (evidenceThisCoa > 0) {
        coaWithEvidenceTrades++;
        evidenceTradeRowsTotal += evidenceThisCoa;
        evidenceTradesPerCoaHist.set(
          evidenceThisCoa,
          (evidenceTradesPerCoaHist.get(evidenceThisCoa) ?? 0) + 1,
        );
      }
      // R8 fold #8 — every CoA gets its id staged so trade_classified_at
      // advances even on zero-trade rows (otherwise the cursor re-fetches).
      batch.coaIds.push(row.id);
      // Spec 80 §5.B — every processed lead is staged for the lead_products resync
      // (so a CoA dropping to zero products gets its stale rows cleared).
      batch.leadIds.push(row.lead_id);

      // Spec 80 §5.B — product classification (mirror classify-permits; reuses the
      // archetype bundle the trade path already derives via deriveArchetypesForCoa).
      const productMatches = classifyCoaProducts(row, DEPRECATED_TRADE_SLUGS);
      let leadHasProduct = false;
      for (const { slug, confidence } of productMatches) {
        const productId = PRODUCT_SLUG_TO_ID.get(slug);
        if (productId == null) {
          productSlugMissCount++;
          continue;
        }
        batch.productRows.push([row.lead_id, productId, confidence]);
        productRowsWritten++;
        leadHasProduct = true;
        productSlugDist.set(slug, (productSlugDist.get(slug) ?? 0) + 1);
      }
      if (leadHasProduct) coaWithProducts++;

      const bucket = String(tradeRows.length);
      coaTradesPerLeadHist.set(bucket, (coaTradesPerLeadHist.get(bucket) ?? 0) + 1);

      // Review fold (Gemini CRIT + DeepSeek HIGH + Worktree#2 CRIT-2 + Indep C-1
      // 4-way concur): batch flush MUST trigger on the rows-array size, not on
      // the CoA-id-array size. A single CoA can emit up to ~16 trade rows
      // (build-sfd with realtor append). With 1000 CoAs buffered, batch.rows
      // could reach ~16,000 entries × 8 params = 128,000 params — 2× the
      // 65,535 PostgreSQL parameter limit. The CoA-id UPDATE uses
      // `ANY($1::bigint[])` so coaIds growth is unconstrained on its side.
      if (
        batch.rows.length >= INSERT_BATCH_SIZE ||
        batch.coaIds.length >= INSERT_BATCH_SIZE ||
        batch.productRows.length >= PRODUCT_BATCH_SIZE
      ) {
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

    // WF2 P6.5 + P16 [GRD-3] — ALL-ACTIVE fan-out mean + median (over CoAs with ≥1 active
    // row). WARN above `activeTradesWarnMax` (18 — above the coa_build=16 lean complement,
    // below the 33-trade P6.6-class blowup).
    const avgActiveTradesPerLead =
      coaWithActiveTrades > 0 ? activeTradeRowsTotal / coaWithActiveTrades : 0;
    // Median from the histogram (bounded — active counts are small integers).
    const histMedian = (hist, denominator) => {
      if (denominator <= 0) return 0;
      const sortedCounts = [...hist.keys()].sort((a, b) => a - b);
      const midpoint = denominator / 2;
      let cumulative = 0;
      for (const count of sortedCounts) {
        cumulative += hist.get(count);
        if (cumulative >= midpoint) return count;
      }
      return 0;
    };
    const medianActiveTradesPerLead = histMedian(activeTradesPerCoaHist, coaWithActiveTrades);
    const activeFanoutStatus =
      coaWithActiveTrades === 0 ? 'INFO'
        : avgActiveTradesPerLead > activeTradesWarnMax ? 'WARN' : 'PASS';
    // [GRD-3] EVIDENCE-scoped companions (P6.6's honesty scope — INFO, not the gate).
    const avgEvidenceTradesPerLead =
      coaWithEvidenceTrades > 0 ? evidenceTradeRowsTotal / coaWithEvidenceTrades : 0;
    const medianEvidenceTradesPerLead = histMedian(evidenceTradesPerCoaHist, coaWithEvidenceTrades);

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
      // Indep M-2: scalar coa_trades_per_lead for the audit-table UI. Counts ALL
      // written rows (strong + bundle-only + realtor) — stays INFO; NOT the gate.
      {
        metric: 'avg_trades_per_lead',
        value: avgTradesPerLead.toFixed(2),
        threshold: null,
        status: 'INFO',
      },
      // WF2 P6.5 — active-scoped fan-out gate (the real signal post-P6.6).
      {
        metric: 'avg_active_trades_per_lead',
        value: coaWithActiveTrades > 0 ? avgActiveTradesPerLead.toFixed(2) : 'N/A',
        threshold: `<= ${activeTradesWarnMax}`,
        status: activeFanoutStatus,
      },
      // Denominator honesty (P8 panel, DeepSeek #4): the histogram counts only
      // CoAs with >=1 active trade — zero-active leads (severance/consent-only)
      // are EXCLUDED by construction. The metric name carries the scope so an
      // operator comparing it to the all-rows mean is not misled.
      {
        metric: 'median_active_trades_per_lead_nonzero',
        value: coaWithActiveTrades > 0 ? medianActiveTradesPerLead : 'N/A',
        threshold: 'denominator = CoAs with >=1 active trade only',
        status: 'INFO',
      },
      { metric: 'coa_with_active_trades', value: coaWithActiveTrades, threshold: null, status: 'INFO' },
      // P16 [GRD-3] — EVIDENCE-scoped companions: preserve P6.6's direct-signal honesty now
      // that active = evidence + inference + realtor. INFO (the gate is the all-active mean).
      {
        metric: 'avg_evidence_trades_per_lead',
        value: coaWithEvidenceTrades > 0 ? avgEvidenceTradesPerLead.toFixed(2) : 'N/A',
        threshold: null,
        status: 'INFO',
      },
      {
        metric: 'median_evidence_trades_per_lead_nonzero',
        value: coaWithEvidenceTrades > 0 ? medianEvidenceTradesPerLead : 'N/A',
        threshold: 'denominator = CoAs with >=1 evidence trade only',
        status: 'INFO',
      },
      // P16 16D (§R10, [BUG-3] partial — starvation/precision bands land with the 16F re-run):
      // inference-layer gate state + emission volume.
      { metric: 'inference_layer_enabled', value: inferenceEnabled ? 1 : 0, threshold: null, status: 'INFO' },
      { metric: 'coa_inference_rows_emitted', value: coaTradesInference, threshold: null, status: 'INFO' },
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
      // Spec 80 §5.C / Spec 48 §3.6 — precision split of emitted construction trades by
      // PROVENANCE (realtor append excluded): strong = attachment_basis='evidence' (direct
      // tag-matrix); inference = the lean complement's sole-source rows. INFO, emitted every
      // run even at 0. (coa_trades_bundle_only retired WITH the coarse bundle prior — P16 16D.)
      { metric: 'coa_trades_strong_signal', value: coaTradesStrong, threshold: null, status: 'INFO' },
      { metric: 'coa_trades_inference', value: coaTradesInference, threshold: null, status: 'INFO' },
      // Spec 80 §5.B — product classification (lead_products, mig 184). INFO counters;
      // the gated vocab-coverage lives in assert_global_coverage (Spec 49 §4).
      { metric: 'coa_with_products', value: coaWithProducts, threshold: null, status: 'INFO' },
      { metric: 'lead_products_written', value: productRowsWritten, threshold: null, status: 'INFO' },
      // (product vocab coverage is emitted as a gated cov_ row via the manifest
      // telemetry_vocab_cols.product_vocab mechanism — parity with trades; live 27/27 PASS.)
      // == 0 FAIL: catches product matrix/bundle ↔ product_groups schema drift (mirror slug_resolution_miss).
      { metric: 'product_slug_miss_count', value: productSlugMissCount, threshold: '== 0', status: productSlugMissCount === 0 ? 'PASS' : 'FAIL' },
    ];

    const verdict = auditRows.some((r) => r.status === 'FAIL')
      ? 'FAIL'
      : auditRows.some((r) => r.status === 'WARN')
        ? 'WARN'
        : 'PASS';

    // cov_* vocabulary coverage (Spec 30 §3 / 48 §3.5): distinct trade_ids emitted vs the trades
    // vocabulary. emitSummary injects the cov_ row and escalates the verdict if it FAILs.
    const vocabSpec = manifest.scripts.classify_coa_trades?.telemetry_vocab_cols;
    const vocabCoverage = vocabSpec ? await pipeline.computeVocabCoverage(pool, vocabSpec) : undefined;

    pipeline.emitSummary({
      records_total: processed,
      records_new: recordsNew,
      records_updated: recordsUpdated,
      ...(vocabCoverage
        ? {
            telemetry_context: {
              vocab_coverage: vocabCoverage,
              vocab_coverage_thresholds: { pass: logicVars.vocab_coverage_pass_pct, warn: logicVars.vocab_coverage_warn_pct },
            },
          }
        : {}),
      records_meta: {
        duration_ms: durationMs,
        coa_processed: processed,
        coa_with_trades: coaWithTrades,
        coa_zero_trades: coaZeroTrades,
        residential_count: residentialCount,
        realtor_append_count: realtorAppendCount,
        coa_trades_strong_signal: coaTradesStrong,
        coa_trades_inference: coaTradesInference,
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
          'project_type',
          'structure_type',
          'scope_classified_at',
          'trade_classified_at',
        ],
        trades: ['id', 'slug'],
        product_groups: ['id', 'slug'],
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
          'attachment_basis',
          'classified_at',
        ],
        lead_products: ['lead_id', 'product_id', 'confidence', 'classified_at'],
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
