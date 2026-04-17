#!/usr/bin/env node
/**
 * Link unlinked CoA applications to building permits using address matching.
 *
 * Uses pre-computed street_name_normalized columns (populated at ingestion)
 * for fast exact matching. Ward is a confidence booster, not a gatekeeper —
 * 80% of permits have NULL ward, so requiring it would blind the linker.
 *
 * Confidence matrix:
 *   Tier 1:  street_num + street_name_normalized match
 *     1a: ward match        → 0.95
 *     1b: permit ward NULL  → 0.85
 *     1c: ward conflict     → 0.10 (flagged for review)
 *   Tier 2:  street_name_normalized only (no street_num)
 *     2a: ward match        → 0.60
 *     2b: permit ward NULL  → 0.50
 *   Tier 3:  Description FTS → 0.30-0.50
 *
 * Usage: node scripts/link-coa.js [--dry-run]
 *
 * SPEC LINK: docs/specs/12_coa_integration.md
 */
const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');

const LOGIC_VARS_SCHEMA = z.object({
  coa_match_conf_high:   z.number().finite().positive().max(1),
  coa_match_conf_medium: z.number().finite().positive().max(1),
}).passthrough();

const ADVISORY_LOCK_ID = 93;

pipeline.run('link-coa', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');
    const { logicVars } = await loadMarketplaceConfigs(pool, 'link-coa');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'link-coa');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  const confHigh   = logicVars.coa_match_conf_high;
  const confMedium = logicVars.coa_match_conf_medium;

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const startTime = Date.now();

  pipeline.log.info('[link-coa]', `Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Count unlinked before
  const beforeResult = await pool.query(
    `SELECT COUNT(*) as total FROM coa_applications WHERE linked_permit_num IS NULL`
  );
  const totalUnlinked = parseInt(beforeResult.rows[0].total, 10);
  pipeline.log.info('[link-coa]', `Unlinked CoA applications: ${totalUnlinked.toLocaleString()}`);

  if (totalUnlinked === 0) {
    pipeline.log.info('[link-coa]', 'Nothing to link.');
    pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0 });
    return;
  }

  let tier1a = 0, tier1b = 0, tier1c = 0;
  let tier2a = 0, tier2b = 0;
  let desc = 0, descErrors = 0, tier3Skipped = 0;
  let crossWardCleaned = 0;

  // ------------------------------------------------------------------
  // Pre-pass: Unlink cross-ward mismatches from previous runs
  // ------------------------------------------------------------------
  pipeline.log.info('[link-coa]', 'Pre-pass: Checking for cross-ward mismatches...');
  if (!dryRun) {
    crossWardCleaned = await pipeline.withTransaction(pool, async (client) => {
      const result = await client.query(`
        UPDATE coa_applications ca
        SET linked_permit_num = NULL,
            linked_confidence = NULL
        FROM permits p
        WHERE p.permit_num = ca.linked_permit_num
          AND ca.ward IS NOT NULL AND p.ward IS NOT NULL
          AND LTRIM(ca.ward, '0') != LTRIM(p.ward, '0')
          AND ca.linked_confidence != 0.10
      `);
      return result.rowCount || 0;
    });
  } else {
    const preview = await pool.query(`
      SELECT COUNT(*) FROM coa_applications ca
      JOIN permits p ON p.permit_num = ca.linked_permit_num
      WHERE ca.linked_permit_num IS NOT NULL
        AND ca.ward IS NOT NULL AND p.ward IS NOT NULL
        AND LTRIM(ca.ward, '0') != LTRIM(p.ward, '0')
        AND ca.linked_confidence != 0.10
    `);
    crossWardCleaned = parseInt(preview.rows[0].count, 10) || 0;
  }
  pipeline.log.info('[link-coa]', `Pre-pass: ${crossWardCleaned.toLocaleString()} cross-ward mismatches unlinked`);

  // In dry-run mode, crossWardCleaned records aren't actually unlinked, so they
  // won't appear in the IS NULL pool for subsequent tiers. Use totalUnlinked only.
  const actualCandidates = dryRun ? totalUnlinked : totalUnlinked + crossWardCleaned;

  // ------------------------------------------------------------------
  // Tier 1a: street_num + street_name_normalized + ward match → 0.95
  // ------------------------------------------------------------------
  // Shared subquery fragments for Tiers 1-2 (used in both live UPDATE and dry-run COUNT)
  const TIER1A_WHERE = `
    UPPER(TRIM(p.street_num)) = UPPER(TRIM(ca2.street_num))
    AND p.street_name_normalized = ca2.street_name_normalized
    AND LTRIM(p.ward, '0') = LTRIM(ca2.ward, '0')
    AND p.permit_type != 'Pre-Permit'`;
  const TIER1A_FILTER = `
    ca2.linked_permit_num IS NULL
    AND ca2.street_num IS NOT NULL AND TRIM(ca2.street_num) != ''
    AND ca2.street_name_normalized IS NOT NULL
    AND ca2.ward IS NOT NULL AND p.ward IS NOT NULL`;

  const TIER1B_WHERE = `
    UPPER(TRIM(p.street_num)) = UPPER(TRIM(ca2.street_num))
    AND p.street_name_normalized = ca2.street_name_normalized
    AND p.ward IS NULL
    AND p.permit_type != 'Pre-Permit'`;
  const TIER1B_FILTER = `
    ca2.linked_permit_num IS NULL
    AND ca2.street_num IS NOT NULL AND TRIM(ca2.street_num) != ''
    AND ca2.street_name_normalized IS NOT NULL`;

  const TIER1C_WHERE = `
    UPPER(TRIM(p.street_num)) = UPPER(TRIM(ca2.street_num))
    AND p.street_name_normalized = ca2.street_name_normalized
    AND p.ward IS NOT NULL AND ca2.ward IS NOT NULL
    AND LTRIM(p.ward, '0') != LTRIM(ca2.ward, '0')
    AND p.permit_type != 'Pre-Permit'`;
  const TIER1C_FILTER = TIER1B_FILTER;

  const TIER2A_WHERE = `
    p.street_name_normalized = ca2.street_name_normalized
    AND LTRIM(p.ward, '0') = LTRIM(ca2.ward, '0')
    AND p.permit_type != 'Pre-Permit'`;
  const TIER2A_FILTER = `
    ca2.linked_permit_num IS NULL
    AND ca2.street_name_normalized IS NOT NULL
    AND ca2.ward IS NOT NULL AND p.ward IS NOT NULL`;

  const TIER2B_WHERE = `
    p.street_name_normalized = ca2.street_name_normalized
    AND p.ward IS NULL
    AND p.permit_type != 'Pre-Permit'`;
  const TIER2B_FILTER = `
    ca2.linked_permit_num IS NULL
    AND ca2.street_name_normalized IS NOT NULL`;

  // Helper: run a tier as UPDATE (live) or SELECT COUNT (dry-run)
  async function runTier(label, confidence, joinWhere, filterWhere) {
    if (!dryRun) {
      return await pipeline.withTransaction(pool, async (client) => {
        const result = await client.query(
          `UPDATE coa_applications ca
          SET linked_permit_num = matched.permit_num,
              linked_confidence = ${confidence},
              last_seen_at = $1::timestamptz
          FROM (
            SELECT DISTINCT ON (ca2.id) ca2.id, p.permit_num
            FROM coa_applications ca2
            JOIN permits p ON ${joinWhere}
            WHERE ${filterWhere}
            ORDER BY ca2.id, COALESCE(p.issued_date, p.application_date) DESC NULLS LAST, p.permit_num DESC
          ) matched
          WHERE ca.id = matched.id`,
          [RUN_AT]
        );
        return result.rowCount || 0;
      });
    } else {
      const result = await pool.query(`
        SELECT COUNT(DISTINCT ca2.id) as cnt
        FROM coa_applications ca2
        JOIN permits p ON ${joinWhere}
        WHERE ${filterWhere}
      `);
      return parseInt(result.rows[0].cnt, 10) || 0;
    }
  }

  pipeline.log.info('[link-coa]', 'Tier 1a: Exact address + ward match...');
  tier1a = await runTier('1a', 0.95, TIER1A_WHERE, TIER1A_FILTER);
  pipeline.log.info('[link-coa]', `Tier 1a linked: ${tier1a.toLocaleString()} (confidence 0.95)`);

  pipeline.log.info('[link-coa]', 'Tier 1b: Exact address + null permit ward...');
  tier1b = await runTier('1b', 0.85, TIER1B_WHERE, TIER1B_FILTER);
  pipeline.log.info('[link-coa]', `Tier 1b linked: ${tier1b.toLocaleString()} (confidence 0.85)`);

  pipeline.log.info('[link-coa]', 'Tier 1c: Exact address + ward conflict...');
  tier1c = await runTier('1c', 0.10, TIER1C_WHERE, TIER1C_FILTER);
  pipeline.log.info('[link-coa]', `Tier 1c linked: ${tier1c.toLocaleString()} (confidence 0.10 — ward conflict, flagged)`);

  pipeline.log.info('[link-coa]', 'Tier 2a: Street name + ward match...');
  tier2a = await runTier('2a', 0.60, TIER2A_WHERE, TIER2A_FILTER);
  pipeline.log.info('[link-coa]', `Tier 2a linked: ${tier2a.toLocaleString()} (confidence 0.60)`);

  pipeline.log.info('[link-coa]', 'Tier 2b: Street name + null permit ward...');
  tier2b = await runTier('2b', 0.50, TIER2B_WHERE, TIER2B_FILTER);
  pipeline.log.info('[link-coa]', `Tier 2b linked: ${tier2b.toLocaleString()} (confidence 0.50)`);

  // ------------------------------------------------------------------
  // Tier 3: Description FTS — batched via unnest + CROSS JOIN LATERAL
  // Ward is optional — used as tiebreaker when available, not as filter.
  // Uses plainto_tsquery for stop-word safety.
  // ------------------------------------------------------------------
  pipeline.log.info('[link-coa]', 'Tier 3: Description similarity matching...');
  const remaining = await pool.query(`
    SELECT id, application_number, ward, description
    FROM coa_applications
    WHERE linked_permit_num IS NULL
      AND description IS NOT NULL AND LENGTH(TRIM(description)) >= 10
    ORDER BY decision_date DESC NULLS LAST
  `);
  pipeline.log.info('[link-coa]', `Tier 3 candidates: ${remaining.rows.length.toLocaleString()}`);

  const candidates = [];
  for (const app of remaining.rows) {
    const keywords = app.description
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 8);
    if (keywords.length < 2) continue;
    candidates.push({ id: app.id, ward: app.ward || '', tsQuery: keywords.join(' ') });
  }
  pipeline.log.info('[link-coa]', `Tier 3 filterable: ${candidates.length.toLocaleString()}`);

  const BATCH_SIZE = 500;
  if (!dryRun) {
    for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
      const batch = candidates.slice(offset, offset + BATCH_SIZE);
      const ids = batch.map((c) => c.id);
      const wards = batch.map((c) => c.ward);
      const queries = batch.map((c) => c.tsQuery);

      try {
        await pipeline.withTransaction(pool, async (client) => {
          const result = await client.query(`
            WITH candidates AS (
              SELECT * FROM unnest($1::int[], $2::text[], $3::text[])
                AS t(coa_id, ward, ts_query)
            )
            UPDATE coa_applications ca
            SET linked_permit_num = matched.permit_num,
                linked_confidence = matched.conf,
                last_seen_at = $4::timestamptz
            FROM (
              SELECT DISTINCT ON (c.coa_id) c.coa_id, lat.permit_num,
                CASE
                  WHEN c.ward != '' AND lat.ward IS NOT NULL AND LTRIM(lat.ward, '0') = LTRIM(c.ward, '0')
                    THEN LEAST(0.50, 0.30 + lat.rank * 0.1)
                  WHEN lat.ward IS NULL OR c.ward = ''
                    THEN LEAST(0.40, 0.25 + lat.rank * 0.1)
                  ELSE 0.10
                END AS conf
              FROM candidates c
              CROSS JOIN LATERAL (
                SELECT permit_num, ward,
                       ts_rank(to_tsvector('english', COALESCE(description, '')),
                               plainto_tsquery('english', c.ts_query)) AS rank
                FROM permits
                WHERE to_tsvector('english', COALESCE(description, '')) @@ plainto_tsquery('english', c.ts_query)
                  AND permit_type != 'Pre-Permit'
                ORDER BY
                  CASE WHEN c.ward != '' AND ward IS NOT NULL AND LTRIM(ward, '0') = LTRIM(c.ward, '0') THEN 0 ELSE 1 END,
                  ts_rank(to_tsvector('english', COALESCE(description, '')),
                          plainto_tsquery('english', c.ts_query)) DESC,
                  permit_num DESC
                LIMIT 1
              ) lat
              ORDER BY c.coa_id
            ) matched
            WHERE ca.id = matched.coa_id
          `, [ids, wards, queries, RUN_AT]);
          desc += result.rowCount || 0;
        });
      } catch (err) {
        descErrors++;
        tier3Skipped += batch.length;
        pipeline.log.warn('[link-coa]', `Tier 3 batch at offset ${offset} failed (${batch.length} candidates skipped): ${err.message}`);
      }

      if ((offset + BATCH_SIZE) % 2000 === 0 || offset + BATCH_SIZE >= candidates.length) {
        pipeline.progress('link-coa', Math.min(offset + BATCH_SIZE, candidates.length), candidates.length, startTime);
      }
    }
  } else {
    for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
      const batch = candidates.slice(offset, offset + BATCH_SIZE);
      const ids = batch.map((c) => c.id);
      const wards = batch.map((c) => c.ward);
      const queries = batch.map((c) => c.tsQuery);

      try {
        const result = await pool.query(`
          WITH candidates AS (
            SELECT * FROM unnest($1::int[], $2::text[], $3::text[])
              AS t(coa_id, ward, ts_query)
          )
          SELECT COUNT(*) as cnt
          FROM candidates c
          CROSS JOIN LATERAL (
            SELECT permit_num
            FROM permits
            WHERE to_tsvector('english', COALESCE(description, '')) @@ plainto_tsquery('english', c.ts_query)
              AND permit_type != 'Pre-Permit'
            LIMIT 1
          ) lat
        `, [ids, wards, queries]);
        desc += parseInt(result.rows[0].cnt, 10);
      } catch {
        descErrors++;
      }

      if ((offset + BATCH_SIZE) % 2000 === 0 || offset + BATCH_SIZE >= candidates.length) {
        pipeline.progress('link-coa', Math.min(offset + BATCH_SIZE, candidates.length), candidates.length, startTime);
      }
    }
  }
  pipeline.log.info('[link-coa]', `Tier 3 linked: ${desc.toLocaleString()} (confidence 0.10-0.50)${descErrors > 0 ? `, ${descErrors} batch errors` : ''}`);

  // ------------------------------------------------------------------
  // Bump permits.last_seen_at for every permit that was newly linked
  // during this run. This is REQUIRED for the downstream lifecycle
  // classifier (scripts/classify-lifecycle-phase.js) to see those
  // permits as dirty on its next incremental pass. Without this bump,
  // a permit whose CoA linkage just changed (e.g. the CoA phase flipped
  // from "linked" to a different parent) wouldn't trigger a permit
  // lifecycle re-classification.
  //
  // Scope: permits whose linked_permit_num was set during this run.
  // We detect them via coa_applications.last_seen_at >= startTime
  // since each tier UPDATE sets last_seen_at = NOW() on the CoA row.
  // Idempotency guard: don't bump a permit whose last_seen_at is
  // already within the last 1 second (avoids redundant writes when
  // the linker is re-run quickly).
  //
  // Skipped in dry-run mode.
  //
  // SPEC LINK: docs/specs/product/future/84_lifecycle_phase_engine.md §2.7
  let permitsBumped = 0;
  if (!dryRun) {
    const bumpStart = new Date(startTime).toISOString();
    const bumpResult = await pool.query(
      `UPDATE permits
          SET last_seen_at = $2::timestamptz
        WHERE permit_num IN (
          SELECT DISTINCT linked_permit_num
            FROM coa_applications
           WHERE linked_permit_num IS NOT NULL
             AND last_seen_at >= $1::timestamptz
        )
          AND last_seen_at < NOW() - INTERVAL '1 second'`,
      [bumpStart, RUN_AT],
    );
    permitsBumped = bumpResult.rowCount || 0;
    pipeline.log.info(
      '[link-coa]',
      `Bumped permits.last_seen_at on ${permitsBumped.toLocaleString()} newly-linked permits (for downstream lifecycle re-classification)`,
    );
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const durationMs = Date.now() - startTime;
  const totalLinked = tier1a + tier1b + tier1c + tier2a + tier2b + desc;
  // Subtract error-skipped Tier 3 candidates from unlinked count so noMatch is accurate
  const noMatch = Math.max(0, actualCandidates - totalLinked - tier3Skipped);
  const matchRate = actualCandidates > 0 ? (totalLinked / actualCandidates) * 100 : 0;

  pipeline.log.info('[link-coa]', 'Linking complete', {
    crossWardCleaned, tier1a, tier1b, tier1c, tier2a, tier2b, desc,
    noMatch, totalLinked,
    rate: `${matchRate.toFixed(1)}%`,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  if (dryRun) {
    pipeline.log.info('[link-coa]', 'DRY RUN complete — no changes written.');
  }

  // Final stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) AS linked,
      COUNT(*) FILTER (WHERE linked_confidence >= $1) AS high_conf,
      COUNT(*) FILTER (WHERE linked_confidence >= $2 AND linked_confidence < $1) AS med_conf,
      COUNT(*) FILTER (WHERE linked_confidence > 0 AND linked_confidence < $2) AS low_conf,
      COUNT(*) FILTER (WHERE decision ILIKE 'approved%' AND linked_permit_num IS NULL AND decision_date >= NOW() - INTERVAL '90 days') AS upcoming
    FROM coa_applications
  `, [confHigh, confMedium]);
  const s = stats.rows[0];
  pipeline.log.info('[link-coa]', `DB stats: ${s.total} total | ${s.linked} linked (${s.high_conf} high, ${s.med_conf} med, ${s.low_conf} low) | ${s.upcoming} upcoming leads`);

  // Integrity queries for audit_table
  const linksToPrePermits = await pool.query(
    `SELECT COUNT(*) FROM coa_applications ca
     JOIN permits p ON p.permit_num = ca.linked_permit_num
     WHERE ca.linked_permit_num IS NOT NULL
       AND p.permit_type = 'Pre-Permit'`
  );
  const prePermitLinkCount = parseInt(linksToPrePermits.rows[0].count, 10) || 0;

  // Exclude Tier 1c links (confidence = 0.10) — those are intentional ward-conflict
  // matches already reported via matches_tier_1c_ward_conflict metric.
  const crossWardLinks = await pool.query(
    `SELECT COUNT(*) FROM coa_applications ca
     JOIN permits p ON p.permit_num = ca.linked_permit_num
     WHERE ca.linked_permit_num IS NOT NULL
       AND ca.ward IS NOT NULL AND p.ward IS NOT NULL
       AND LTRIM(ca.ward, '0') != LTRIM(p.ward, '0')
       AND ca.linked_confidence != 0.10`
  );
  const crossWardCount = parseInt(crossWardLinks.rows[0].count, 10) || 0;

  // Effective match rate: measure against POTENTIAL matches (CoAs with a real
  // permit at their exact address), not against all unlinked. The old rate
  // measured linked/all_unlinked, which trips FAIL in steady state when the
  // residual pool has no achievable matches. See link-coa audit fix WF3.
  const potentialRes = await pool.query(
    `SELECT COUNT(DISTINCT c.id) AS could_link
     FROM coa_applications c
     JOIN permits p
       ON p.street_num = c.street_num
      AND p.street_name_normalized = c.street_name_normalized
     WHERE c.linked_permit_num IS NULL
       AND c.street_num IS NOT NULL AND TRIM(c.street_num) != ''
       AND c.street_name_normalized IS NOT NULL
       AND p.permit_type != 'Pre-Permit'`
  );
  const potentialMatches = parseInt(potentialRes.rows[0].could_link, 10) || 0;

  // Effective match rate denominator combines what we actually linked + what we
  // COULD still link. Tiers excluded from the numerator (must be consistent):
  //   - Tier 1c (ward conflict) → 0.10 confidence, flagged for review
  //   - Tier 3 (description FTS) → 0.10-0.50 confidence, includes 0.10 matches
  // Including Tier 3 while excluding Tier 1c was inconsistent — both contain
  // 0.10-confidence matches. The conservative fix excludes both tiers entirely,
  // making the metric measure ONLY exact-address links (Tiers 1a/1b/2a/2b at
  // 0.50-0.95 confidence). Tier 3 success is still tracked separately as INFO.
  const highConfidenceLinks = tier1a + tier1b + tier2a + tier2b;
  const effectiveDenom = highConfidenceLinks + potentialMatches;
  const effectiveRate = effectiveDenom > 0 ? (highConfidenceLinks / effectiveDenom) * 100 : 100;

  // Verdict logic:
  // - Nothing achievable (effectiveDenom = 0) → PASS (steady state)
  // - Achievable matches but linker hit < 50% → FAIL (real regression)
  // - >= 50% → PASS
  const effectiveRateStatus = effectiveDenom === 0 ? 'PASS'
    : effectiveRate < 50 ? 'FAIL'
    : effectiveRate < 80 ? 'WARN'
    : 'PASS';

  // Build audit_table — match_rate_pct demoted to INFO, effective_match_rate_pct drives verdict
  const auditRows = [
    { metric: 'cross_ward_cleaned', value: crossWardCleaned, threshold: null, status: crossWardCleaned > 0 ? 'INFO' : 'PASS' },
    { metric: 'total_candidates', value: actualCandidates, threshold: null, status: 'INFO' },
    { metric: 'potential_matches', value: potentialMatches, threshold: null, status: 'INFO' },
    { metric: 'effective_match_rate_pct', value: Math.round(effectiveRate * 10) / 10, threshold: '>= 50%', status: effectiveRateStatus },
    { metric: 'match_rate_pct', value: Math.round(matchRate * 10) / 10, threshold: null, status: 'INFO' },
    { metric: 'matches_tier_1a_exact_ward', value: tier1a, threshold: null, status: 'INFO' },
    { metric: 'matches_tier_1b_exact_null_ward', value: tier1b, threshold: null, status: 'INFO' },
    { metric: 'matches_tier_1c_ward_conflict', value: tier1c, threshold: null, status: tier1c > 0 ? 'WARN' : 'PASS' },
    { metric: 'matches_tier_2a_name_ward', value: tier2a, threshold: null, status: 'INFO' },
    { metric: 'matches_tier_2b_name_null_ward', value: tier2b, threshold: null, status: 'INFO' },
    { metric: 'matches_tier_3_desc', value: desc, threshold: null, status: 'INFO' },
    { metric: 'tier_3_errors', value: descErrors, threshold: '== 0', status: descErrors > 0 ? 'WARN' : 'PASS' },
    { metric: 'unlinked_remaining', value: noMatch, threshold: null, status: 'INFO' },
    { metric: 'links_to_pre_permits', value: prePermitLinkCount, threshold: '== 0', status: prePermitLinkCount > 0 ? 'FAIL' : 'PASS' },
    { metric: 'cross_ward_links', value: crossWardCount, threshold: '== 0', status: crossWardCount > 0 ? 'WARN' : 'PASS' },
  ];
  const linkAuditHasFails = prePermitLinkCount > 0 || effectiveRateStatus === 'FAIL';
  const linkAuditHasWarns = descErrors > 0 || crossWardCount > 0 || tier1c > 0 || effectiveRateStatus === 'WARN';
  const chainId = process.env.PIPELINE_CHAIN || null;
  const linkAuditTable = {
    phase: chainId === 'coa' ? 4 : 12,
    name: 'Link CoA',
    verdict: linkAuditHasFails ? 'FAIL' : linkAuditHasWarns ? 'WARN' : 'PASS',
    rows: auditRows,
  };

  const meta = {
    duration_ms: durationMs,
    cross_ward_cleaned: crossWardCleaned,
    matches_tier_1a_exact_ward: tier1a,
    matches_tier_1b_exact_null_ward: tier1b,
    matches_tier_1c_ward_conflict: tier1c,
    matches_tier_2a_name_ward: tier2a,
    matches_tier_2b_name_null_ward: tier2b,
    matches_tier_3_desc: desc,
    tier_3_errors: descErrors,
    match_rate_pct: Math.round(matchRate * 10) / 10,
    potential_matches: potentialMatches,
    effective_match_rate_pct: Math.round(effectiveRate * 10) / 10,
    unlinked_remaining: noMatch,
    audit_table: linkAuditTable,
  };
  pipeline.emitSummary({ records_total: totalLinked + crossWardCleaned, records_new: 0, records_updated: totalLinked + crossWardCleaned, records_meta: meta });
  pipeline.emitMeta(
    { "coa_applications": ["id", "application_number", "street_num", "street_name_normalized", "ward", "description", "decision_date", "linked_permit_num"], "permits": ["permit_num", "street_num", "street_name_normalized", "ward", "issued_date", "description"] },
    { "coa_applications": ["linked_permit_num", "linked_confidence", "last_seen_at"] }
  );
  });
  if (!lockResult.acquired) return;
});
