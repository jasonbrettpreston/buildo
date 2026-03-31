#!/usr/bin/env node
/**
 * Batch reclassify all 237K permits using the new tag-trade matrix.
 *
 * Usage:
 *   npx tsx scripts/reclassify-all.js
 *
 * Requires DATABASE_URL env variable.
 */

const BATCH_SIZE = 500;

async function main() {
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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
    console.error('Failed to import modules. Run with: npx tsx scripts/reclassify-all.js');
    throw e;
  }

  try {
    // Load active Tier 1 rules from DB (or use in-memory ALL_RULES)
    const { rows: dbRules } = await pool.query(
      'SELECT * FROM trade_mapping_rules WHERE is_active = true'
    );
    const rules = dbRules.length > 0 ? dbRules : ALL_RULES;

    // Count total permits
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM permits');
    const total = parseInt(count, 10);
    console.log(`Reclassifying ${total} permits in batches of ${BATCH_SIZE}...`);

    let offset = 0;
    let classifiedCount = 0;
    let tradeTotal = 0;
    let productTotal = 0;
    let errorCount = 0;

    while (offset < total) {
      const { rows: permits } = await pool.query(
        'SELECT * FROM permits ORDER BY permit_num, revision_num LIMIT $1 OFFSET $2',
        [BATCH_SIZE, offset]
      );

      if (permits.length === 0) break;

      // Acquire one client per batch (not per permit) to avoid 237K connect/release cycles
      const client = await pool.connect();
      try {
        for (const permit of permits) {
          try {
            // 1. Classify scope
            const scope = classifyScope(permit);

            // 2. Classify trades using tag matrix
            const matches = classifyPermit(permit, rules, scope.scope_tags);

            // 3. Classify products
            const products = classifyProducts(permit, scope.scope_tags);

            // 4. Write to DB in a per-permit transaction
            await client.query('BEGIN');

            // Update scope
            await client.query(
              `UPDATE permits SET project_type = $1, scope_tags = $2, scope_classified_at = NOW(), scope_source = 'reclassified'
               WHERE permit_num = $3 AND revision_num = $4`,
              [scope.project_type, scope.scope_tags, permit.permit_num, permit.revision_num]
            );

            // Replace trade classifications
            await client.query(
              'DELETE FROM permit_trades WHERE permit_num = $1 AND revision_num = $2',
              [permit.permit_num, permit.revision_num]
            );
            // Batch-insert trades using multi-row VALUES
            if (matches.length > 0) {
              const tradeCols = 10; // permit_num, revision_num, trade_id, trade_slug, trade_name, tier, confidence, is_active, phase, lead_score
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

            // Replace product classifications
            await client.query(
              'DELETE FROM permit_products WHERE permit_num = $1 AND revision_num = $2',
              [permit.permit_num, permit.revision_num]
            );
            // Batch-insert products using multi-row VALUES
            if (products.length > 0) {
              const prodCols = 6; // permit_num, revision_num, product_id, product_slug, product_name, confidence
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

            await client.query('COMMIT');
            classifiedCount++;
            tradeTotal += matches.length;
            productTotal += products.length;
          } catch (err) {
            try { await client.query('ROLLBACK'); } catch (_) { /* rollback best-effort */ }
            errorCount++;
            if (errorCount <= 10) {
              console.error(`Error on ${permit.permit_num}/${permit.revision_num}: ${err.message}`);
            }
          }
        }
      } finally {
        client.release();
      }

      offset += permits.length;
      const pct = ((offset / total) * 100).toFixed(1);
      process.stdout.write(`\r  ${offset}/${total} (${pct}%) — ${classifiedCount} classified, ${errorCount} errors`);
    }

    console.log('\n\n=== Reclassification Complete ===');
    console.log(`  Total permits:       ${total}`);
    console.log(`  Classified:          ${classifiedCount}`);
    console.log(`  Errors:              ${errorCount}`);
    console.log(`  Trade matches:       ${tradeTotal}`);
    console.log(`  Product matches:     ${productTotal}`);
    console.log(`  Avg trades/permit:   ${(tradeTotal / Math.max(classifiedCount, 1)).toFixed(1)}`);
    console.log(`  Avg products/permit: ${(productTotal / Math.max(classifiedCount, 1)).toFixed(1)}`);
    console.log(`  Coverage:            ${((classifiedCount / total) * 100).toFixed(1)}%`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
