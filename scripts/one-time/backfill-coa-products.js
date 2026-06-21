#!/usr/bin/env node
/**
 * One-time backfill: populate lead_products for existing CoA leads (Spec 80 §5.B, mig 184).
 *
 * SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B (products)
 *            docs/specs/01-pipeline/42_chain_coa.md §6 (CoA chain)
 *
 * Why: product emission is NEW in classify-coa-trades. Its incremental cursor
 * (`trade_classified_at < scope_classified_at`) will NOT re-touch the ~30K already
 * trade-classified CoAs, so lead_products stays empty for the backlog. This sweeps
 * the whole scope-classified corpus once; classify-coa-trades maintains it forward.
 *
 * Idempotent: full id-cursor sweep; per-lead DELETE-then-INSERT resync (products are
 * 0..N per lead). Re-running reproduces the same set. Advisory lock 120.
 *
 * Usage: node -r dotenv/config scripts/one-time/backfill-coa-products.js
 */
'use strict';

const pipeline = require('../lib/pipeline');
const { classifyCoaProducts, DEPRECATED_TRADE_SLUGS } = require('../lib/coa-trade-classifier');

const TAG = '[backfill-coa-products]';
const ADVISORY_LOCK_ID = 120;
const BATCH_SIZE = 2000;
const SWEEP_PREDICATE = `lead_id IS NOT NULL AND scope_tags IS NOT NULL AND scope_classified_at IS NOT NULL`;

pipeline.run('backfill-coa-products', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();
    const RUN_AT = await pipeline.getDbTimestamp(pool);

    const pg = await pool.query('SELECT id, slug FROM product_groups');
    const SLUG_TO_ID = new Map(pg.rows.map((r) => [r.slug, r.id]));

    const sweepTotal = Number(
      (await pool.query(`SELECT COUNT(*) AS n FROM coa_applications WHERE ${SWEEP_PREDICATE}`)).rows[0].n,
    ) || 0;
    pipeline.log.info(TAG, `Sweeping ${sweepTotal.toLocaleString()} scope-classified CoAs`);

    let leadsWithProducts = 0;
    let productRowsWritten = 0;
    let missCount = 0;
    let iteration = 0;
    let errors = 0;
    let lastId = 0;

    while (true) {
      iteration++;
      try {
        const { rows: batch } = await pool.query(
          `SELECT id, lead_id, scope_tags, project_type FROM coa_applications
            WHERE id > $1 AND ${SWEEP_PREDICATE}
            ORDER BY id ASC LIMIT $2`,
          [lastId, BATCH_SIZE],
        );
        if (batch.length === 0) {
          pipeline.log.info(TAG, `Sweep complete after ${iteration - 1} batch(es)`);
          break;
        }

        const leadIds = [];
        const prodRows = []; // [lead_id, product_id, confidence]
        for (const r of batch) {
          leadIds.push(r.lead_id);
          let has = false;
          for (const { slug, confidence } of classifyCoaProducts(r, DEPRECATED_TRADE_SLUGS)) {
            const pid = SLUG_TO_ID.get(slug);
            if (pid == null) { missCount++; continue; }
            prodRows.push([r.lead_id, pid, confidence]);
            has = true;
          }
          if (has) leadsWithProducts++;
          if (r.id > lastId) lastId = r.id;
        }

        await pipeline.withTransaction(pool, async (client) => {
          // Per-lead resync: clear this batch's leads, then insert the fresh product set.
          await client.query(`DELETE FROM lead_products WHERE lead_id = ANY($1::text[])`, [leadIds]);
          // Chunk the INSERT — 1000 rows × 4 params = 4000, safely under the bind-param ceiling
          // (a 2000-CoA batch can yield ~10K product rows → 40K params, which overflows).
          const INSERT_CHUNK = 1000;
          for (let i = 0; i < prodRows.length; i += INSERT_CHUNK) {
            const slice = prodRows.slice(i, i + INSERT_CHUNK);
            const vparts = [];
            const params = [];
            let p = 1;
            for (const pr of slice) {
              vparts.push(`($${p++}::text, $${p++}::int, $${p++}::numeric, $${p++}::timestamptz)`);
              params.push(pr[0], pr[1], pr[2], RUN_AT);
            }
            const res = await client.query(
              `INSERT INTO lead_products (lead_id, product_id, confidence, classified_at)
               VALUES ${vparts.join(', ')}
               ON CONFLICT (lead_id, product_id) DO NOTHING`,
              params,
            );
            productRowsWritten += res.rowCount ?? 0;
          }
        });

        pipeline.log.info(
          TAG,
          `Batch ${iteration}: ${batch.length} swept (leads w/ products ${leadsWithProducts.toLocaleString()}, rows ${productRowsWritten.toLocaleString()}, cursor id=${lastId})`,
        );
      } catch (err) {
        errors++;
        pipeline.log.error(TAG, err, { iteration });
        break;
      }
    }

    const elapsedMs = Date.now() - t0;
    const auditRows = [
      { metric: 'swept_total', value: sweepTotal, threshold: null, status: 'INFO' },
      { metric: 'leads_with_products', value: leadsWithProducts, threshold: null, status: 'INFO' },
      { metric: 'product_rows_written', value: productRowsWritten, threshold: null, status: 'INFO' },
      { metric: 'product_slug_miss_count', value: missCount, threshold: '== 0', status: missCount === 0 ? 'PASS' : 'WARN' },
      { metric: 'errors', value: errors, threshold: '== 0', status: errors === 0 ? 'PASS' : 'FAIL' },
      { metric: 'sys_duration_ms', value: elapsedMs, threshold: null, status: 'INFO' },
    ];
    const verdict = auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
                  : auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

    pipeline.log.info(TAG, `Done. ${leadsWithProducts.toLocaleString()} leads w/ products, ${productRowsWritten.toLocaleString()} rows in ${elapsedMs}ms.`);

    pipeline.emitSummary({
      records_total: sweepTotal,
      records_new: 0,
      records_updated: productRowsWritten,
      records_meta: {
        duration_ms: elapsedMs,
        leads_with_products: leadsWithProducts,
        product_rows_written: productRowsWritten,
        audit_table: { phase: 42, name: 'CoA products backfill', verdict, rows: auditRows },
      },
    });
    pipeline.emitMeta(
      { coa_applications: ['id', 'lead_id', 'scope_tags', 'project_type'], product_groups: ['id', 'slug'] },
      { lead_products: ['lead_id', 'product_id', 'confidence', 'classified_at'] },
    );
  });

  if (!lockResult.acquired) return;
});
