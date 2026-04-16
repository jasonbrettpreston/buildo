#!/usr/bin/env node
/**
 * Batch reclassify all 237K permits using the tag-trade matrix.
 *
 * Reprocesses scope, trade, and product classifications for every permit.
 * Uses keyset pagination (not OFFSET) for O(1) batch fetching at scale.
 *
 * Usage:
 *   npx tsx scripts/reclassify-all.js
 *
 * SPEC LINK: docs/specs/pipeline/80_taxonomies.md
 */

const pipeline = require('./lib/pipeline');

const BATCH_SIZE = 500;
const MAX_ITERATIONS = 500000; // safety guard: 500K batches × 500 = 250M rows max

pipeline.run('reclassify-all', async (pool) => {
  const startTime = Date.now();

  // Dynamic import for TypeScript modules (requires tsx runtime)
  let classifyPermit, classifyProducts, classifyScope, ALL_RULES;
  try {
    const classifier = await import('../src/lib/classification/classifier');
    classifyPermit = classifier.classifyPermit;
    classifyProducts = classifier.classifyProducts;
    const rules = await import('../src/lib/classification/rules');
    ALL_RULES = rules.ALL_RULES;
    const scope = await import('../src/lib/classification/scope');
    classifyScope = scope.classifyScope;
  } catch (e) {
    pipeline.log.error('[reclassify-all]', 'Failed to import TS modules. Run with: npx tsx scripts/reclassify-all.js');
    throw e;
  }

  // Load active Tier 1 rules from DB (or use in-memory ALL_RULES)
  const { rows: dbRules } = await pool.query(
    'SELECT * FROM trade_mapping_rules WHERE is_active = true'
  );
  const rules = dbRules.length > 0 ? dbRules : ALL_RULES;

  // Count total permits
  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM permits');
  const total = parseInt(count, 10);
  pipeline.log.info('[reclassify-all]', `Reclassifying ${total.toLocaleString()} permits in batches of ${BATCH_SIZE}`);

  let lastPermitNum = '';
  let lastRevisionNum = '';
  let processed = 0;
  let classifiedCount = 0;
  let tradeTotal = 0;
  let productTotal = 0;
  let errorCount = 0;
  let iterations = 0;

  while (iterations++ < MAX_ITERATIONS) {
    // Keyset pagination — O(1) per batch via index seek on (permit_num, revision_num)
    const params = lastPermitNum
      ? [BATCH_SIZE, lastPermitNum, lastRevisionNum]
      : [BATCH_SIZE];
    const cursorWhere = lastPermitNum
      ? 'WHERE (permit_num, revision_num) > ($2, $3)'
      : '';

    const { rows: permits } = await pool.query(
      `SELECT * FROM permits ${cursorWhere}
       ORDER BY permit_num, revision_num
       LIMIT $1`,
      params
    );

    if (permits.length === 0) break;

    // Advance keyset cursor
    const lastRow = permits[permits.length - 1];
    lastPermitNum = lastRow.permit_num;
    lastRevisionNum = lastRow.revision_num;

    // Process batch in a single transaction for atomicity.
    // Track batch-local counters — only added to totals after successful commit
    // to prevent counter inflation on rollback.
    let batchClassified = 0;
    let batchTrades = 0;
    let batchProducts = 0;

    try {
      await pipeline.withTransaction(pool, async (client) => {
        for (const permit of permits) {
          // 1. Classify scope
          const scope = classifyScope(permit);

          // 2. Classify trades using tag matrix
          const matches = classifyPermit(permit, rules, scope.scope_tags);

          // 3. Classify products
          const products = classifyProducts(permit, scope.scope_tags);

          // 4. Update scope
          await client.query(
            `UPDATE permits SET project_type = $1, scope_tags = $2, scope_classified_at = NOW(), scope_source = 'reclassified'
             WHERE permit_num = $3 AND revision_num = $4`,
            [scope.project_type, scope.scope_tags, permit.permit_num, permit.revision_num]
          );

          // 5. Replace trade classifications
          await client.query(
            'DELETE FROM permit_trades WHERE permit_num = $1 AND revision_num = $2',
            [permit.permit_num, permit.revision_num]
          );
          if (matches.length > 0) {
            const tradeCols = 10;
            const tradePlaceholders = [];
            const tradeValues = [];
            for (let ti = 0; ti < matches.length; ti++) {
              const m = matches[ti];
              const base = ti * tradeCols;
              tradePlaceholders.push(`($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10})`);
              tradeValues.push(m.permit_num, m.revision_num, m.trade_id, m.trade_slug, m.trade_name, m.tier, m.confidence, m.is_active, m.phase, m.lead_score);
            }
            await client.query(
              `INSERT INTO permit_trades (permit_num, revision_num, trade_id, trade_slug, trade_name, tier, confidence, is_active, phase, lead_score)
               VALUES ${tradePlaceholders.join(',')}`,
              tradeValues
            );
          }

          // 6. Replace product classifications
          await client.query(
            'DELETE FROM permit_products WHERE permit_num = $1 AND revision_num = $2',
            [permit.permit_num, permit.revision_num]
          );
          if (products.length > 0) {
            const prodCols = 6;
            const prodPlaceholders = [];
            const prodValues = [];
            for (let pi = 0; pi < products.length; pi++) {
              const pm = products[pi];
              const base = pi * prodCols;
              prodPlaceholders.push(`($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6})`);
              prodValues.push(pm.permit_num, pm.revision_num, pm.product_id, pm.product_slug, pm.product_name, pm.confidence);
            }
            await client.query(
              `INSERT INTO permit_products (permit_num, revision_num, product_id, product_slug, product_name, confidence)
               VALUES ${prodPlaceholders.join(',')}`,
              prodValues
            );
          }

          batchClassified++;
          batchTrades += matches.length;
          batchProducts += products.length;
        }
      });

      // Batch committed successfully — add to running totals
      classifiedCount += batchClassified;
      tradeTotal += batchTrades;
      productTotal += batchProducts;
    } catch (err) {
      // Batch rolled back — counters not added. Log and continue to next batch.
      errorCount += permits.length;
      pipeline.log.warn('[reclassify-all]', `Batch failed (${permits.length} permits rolled back): ${err.message}`);
    }

    processed += permits.length;

    if (processed % 5000 === 0 || processed >= total) {
      pipeline.progress('reclassify-all', processed, total, startTime);
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    pipeline.log.error('[reclassify-all]', `Max iterations (${MAX_ITERATIONS}) reached — possible infinite loop`);
  }

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[reclassify-all]', 'Reclassification complete', {
    processed,
    classified: classifiedCount,
    errors: errorCount,
    trade_matches: tradeTotal,
    product_matches: productTotal,
    avg_trades: (tradeTotal / Math.max(classifiedCount, 1)).toFixed(1),
    avg_products: (productTotal / Math.max(classifiedCount, 1)).toFixed(1),
    coverage: ((classifiedCount / Math.max(total, 1)) * 100).toFixed(1) + '%',
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  const reclassifyVerdict = errorCount > 0 ? 'WARN' : 'PASS';
  pipeline.emitSummary({
    records_total: total,
    records_new: 0,
    records_updated: classifiedCount,
    records_meta: {
      duration_ms: durationMs,
      classified: classifiedCount,
      errors: errorCount,
      trade_matches: tradeTotal,
      product_matches: productTotal,
      audit_table: {
        phase: 0,
        name: 'Reclassify All',
        verdict: reclassifyVerdict,
        rows: [
          { metric: 'permits_reclassified', value: classifiedCount, threshold: null,  status: 'INFO' },
          { metric: 'permits_errored',      value: errorCount,      threshold: '== 0', status: errorCount === 0 ? 'PASS' : 'WARN' },
        ],
      },
    },
  });
  pipeline.emitMeta(
    { permits: ['permit_num', 'revision_num', 'permit_type', 'structure_type', 'work', 'description', 'status', 'est_const_cost', 'issued_date', 'scope_tags'] },
    { permits: ['project_type', 'scope_tags', 'scope_classified_at', 'scope_source'], permit_trades: ['permit_num', 'revision_num', 'trade_id'], permit_products: ['permit_num', 'revision_num', 'product_id'] }
  );
});
