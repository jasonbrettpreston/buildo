#!/usr/bin/env node
/**
 * Parcel Sanity Profile — the VALUE-CORRECTNESS gate on the observability rail (WF2).
 *
 * Complements assert_global_coverage (which answers "do the parcel values EXIST?") by answering "are the
 * values CORRECT?" — the zone-aware BOUNDS + cross-field INVARIANTS + per-zone DISTRIBUTION checks from
 * scripts/analysis/parcel-sanity-audit.js, now a pipeline step so a value regression (a weld, a borrowed
 * FSI, a footprint>lot mislink) turns the chain RED instead of waiting for a human to run the linter.
 *
 * Verdict (Spec 48 §3.6, row-derived): a `gate:true` check (a zero-baseline physical-impossibility /
 * mislink / retired invariant) that goes non-zero → FAIL. Known non-zero residuals → WARN. Distribution
 * outliers + visibility counts → INFO (never verdict-driving — they fluctuate on a 437K set).
 *
 * Read-only Observer (records_total:1, no writes). Runs in the sources chain after enrich/cost so it reads
 * the FINAL enriched values.
 *
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md (+ Spec 48 §3.6, Spec 47 §R10)
 */
'use strict';

const pipeline = require('./../lib/pipeline');
const { runSanity, verdictCascade } = require('./../analysis/parcel-sanity-audit');

// §R2 — lock id = the assert-family slot 107 (102–111 assert family; 107 was the only unused one).
const ADVISORY_LOCK_ID = 107;

pipeline.run('assert-parcel-sanity', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // Optimized single-scan sweep (samples off — the audit_table rows are counts, not sample ids).
    const { total, results, dist } = await runSanity(pool);

    const rows = results.map((r) => ({
      metric: `${r.id} (${r.fam})`,
      value: r.pop ? `${r.viol} / ${r.pop}` : String(r.viol),
      // gated checks assert "== 0"; the rest are watch (WARN on non-zero) or info (never gate).
      threshold: r.gate ? '== 0 (gate)' : r.sev === 'INFO' ? 'info' : 'watch',
      status: r.status,
    }));
    // DISTRIBUTION outliers — INFO-only visibility (fluctuate on 437K parcels; never verdict-driving).
    for (const d of dist) {
      rows.push({
        metric: `distribution:${d.id}`,
        value: `${d.viol} outliers${d.worst != null ? ` (worst ${d.worst})` : ''}`,
        threshold: 'info',
        status: 'INFO',
      });
    }
    // Population context row (INFO).
    rows.unshift({ metric: 'residential_parcels_scanned', value: total, threshold: null, status: 'INFO' });

    pipeline.emitSummary({
      records_total: 1,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        audit_table: {
          phase: ADVISORY_LOCK_ID,
          name: 'Parcel Sanity Profile',
          verdict: verdictCascade(rows),
          rows,
        },
      },
    });

    pipeline.emitMeta(
      {
        parcels: [
          'zoning_class', 'lot_size_sqm', 'bylaw_max_fsi', 'bylaw_max_coverage_pct', 'bylaw_max_height_m',
          'bylaw_max_stories', 'max_buildable_footprint_sqm', 'max_buildable_gfa_sqm', 'max_buildable_gfa_basis',
          'max_build_fsi', 'max_build_height_m', 'max_build_stories', 'max_build_stories_basis', 'coa_fsi',
          'comp_fsi_p50', 'opt_aor_storeys', 'opt_coa_storeys', 'opt_aor_gfa_sqm', 'opt_coa_gfa_sqm',
          'cost_fb_total', 'cost_coa_total', 'cur_floor_gfa_sqm', 'existing_greenspace_sqm', 'realized_fsi_p90',
        ],
      },
      {},
    );
  }, { skipEmit: false });

  if (!lockResult.acquired) {
    pipeline.log.info('[assert-parcel-sanity]', `Advisory lock ${ADVISORY_LOCK_ID} held — skipping to avoid a duplicate sanity check.`);
    pipeline.emitSummary({
      records_total: 0,
      records_new: 0,
      records_updated: 0,
      records_meta: { skipped: true, reason: 'lock_held', advisory_lock_id: ADVISORY_LOCK_ID },
    });
    pipeline.emitMeta({}, {});
  }
});
