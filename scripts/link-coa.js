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
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.D + §6.9 + §6.11 Phase D R5.6 + §6.6.X Lead-Identity Continuity
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md
 */
const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { SKIP_PHASES_SQL } = require('./lib/lifecycle-phase');
const { safeParsePositiveInt, safeParseIntOrNull } = require('./lib/safe-math');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');

const LOGIC_VARS_SCHEMA = z.object({
  coa_match_conf_high:   z.coerce.number().finite().positive().max(1),
  coa_match_conf_medium: z.coerce.number().finite().positive().max(1),
  // R5.6 Indep M2 fold: explicit field (NOT relying on .passthrough()) so a
  // typo in the key surfaces at Zod validation, not at runtime as NaN.
  coa_inherit_from_permit_min_confidence: z.coerce.number().finite().positive().max(1),
}).passthrough();

const ADVISORY_LOCK_ID = 12;

pipeline.run('link-coa', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    const { logicVars } = await loadMarketplaceConfigs(pool, 'link-coa');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'link-coa');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  const confHigh   = logicVars.coa_match_conf_high;
  const confMedium = logicVars.coa_match_conf_medium;
  const inheritConfMin = logicVars.coa_inherit_from_permit_min_confidence;

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const startTime = Date.now();

  pipeline.log.info('[link-coa]', `Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Count unlinked before
  const beforeResult = await pool.query(
    `SELECT COUNT(*) as total FROM coa_applications WHERE linked_permit_num IS NULL`
  );
  const totalUnlinked = safeParsePositiveInt(beforeResult.rows[0].total, 'total_unlinked');
  pipeline.log.info('[link-coa]', `Unlinked CoA applications: ${totalUnlinked.toLocaleString()}`);

  if (totalUnlinked === 0) {
    pipeline.log.info('[link-coa]', 'Nothing to link.');
    const chainId = process.env.PIPELINE_CHAIN || null;
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      records_meta: {
        audit_table: {
          phase: chainId === 'coa' ? 4 : 12,
          name: 'Link CoA',
          verdict: 'PASS',
          rows: [
            { metric: 'status', value: 'SKIPPED', threshold: null, status: 'INFO' },
            { metric: 'reason', value: 'No unlinked CoA applications — all already linked', threshold: null, status: 'INFO' },
          ],
        },
      },
    });
    // R5.6 emitMeta extension also applies to the early-exit path: while no
    // unlinked CoAs means no new fuzzy-matches, the enrichment fields are part
    // of the script's overall I/O surface and should be declared consistently
    // for spec 48 observer cross-run trend stability.
    pipeline.emitMeta(
      { "coa_applications": ["id", "application_number", "street_num", "street_name_normalized", "ward", "description", "decision_date", "linked_permit_num", "linked_confidence", "latitude", "longitude"],
        "permits": ["permit_num", "revision_num", "street_num", "street_name_normalized", "ward", "issued_date", "application_date", "description", "latitude", "longitude"] },
      { "coa_applications": ["linked_permit_num", "linked_confidence", "last_seen_at", "latitude", "longitude", "ward"] }
    );
    return;
  }

  let tier1a = 0, tier1b = 0, tier1c = 0;
  let tier2a = 0, tier2b = 0;
  let desc = 0, descErrors = 0, tier3Skipped = 0;
  let crossWardCleaned = 0;

  // ------------------------------------------------------------------
  // Pre-pass: Unlink cross-ward mismatches from previous runs
  // ------------------------------------------------------------------
  // R5.6 DeepSeek CRITICAL fold: also clear stale `permits.linked_coa_application_number`
  // back-refs when their CoA is unlinked here. Without this, the back-ref
  // points at an application_number that no longer references the permit
  // (lead-identity continuity violation visible to downstream consumers).
  pipeline.log.info('[link-coa]', 'Pre-pass: Checking for cross-ward mismatches...');
  let staleBackRefsCleared = 0;
  if (!dryRun) {
    crossWardCleaned = await pipeline.withTransaction(pool, async (client) => {
      // Step 1: capture the application_numbers being unlinked (need to NULL
      // back-refs for permits whose only link was this CoA).
      const unlinking = await client.query(`
        SELECT ca.application_number, ca.linked_permit_num AS permit_num
          FROM coa_applications ca
          JOIN permits p ON p.permit_num = ca.linked_permit_num
         WHERE ca.ward IS NOT NULL AND p.ward IS NOT NULL
           AND LTRIM(ca.ward, '0') != LTRIM(p.ward, '0')
           AND ca.linked_confidence != 0.10
      `);

      // Step 2: unlink the CoAs (existing behavior).
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

      // Step 3 (R5.6 DeepSeek CRITICAL fold): clear stale back-refs.
      // For each (permit_num, application_number) pair we just unlinked,
      // NULL the permit's back-ref ONLY IF no other CoA still references it.
      //
      // Diff-review fold (Obs L7) — transient state note: when a permit
      // has BOTH a now-unlinked high-confidence CoA AND a retained Tier 1c
      // CoA (confidence 0.10, excluded from the unlinking step), the
      // NOT EXISTS gate below sees the Tier 1c CoA and SKIPS the back-ref
      // clear — so the permit's back-ref still points at the unlinked
      // high-confidence CoA. This is a transient state: the back-ref pass
      // at lines ~480-510 (Phase D R5.1) runs LATER in this same script
      // invocation and re-derives the back-ref from the surviving links,
      // picking up the Tier 1c CoA as the new back-ref target. By the time
      // link-coa.js exits, the permit's back-ref is consistent.
      if (unlinking.rows.length > 0) {
        const permitNums = unlinking.rows.map((r) => r.permit_num);
        const appNums = unlinking.rows.map((r) => r.application_number);
        const staleResult = await client.query(
          `UPDATE permits p
              SET linked_coa_application_number = NULL
             FROM (SELECT unnest($1::text[]) AS pn, unnest($2::text[]) AS an) cleared
            WHERE p.permit_num = cleared.pn
              AND p.linked_coa_application_number = cleared.an
              AND NOT EXISTS (
                SELECT 1 FROM coa_applications other
                 WHERE other.linked_permit_num = p.permit_num
                   AND other.application_number IS DISTINCT FROM cleared.an
              )`,
          [permitNums, appNums],
        );
        staleBackRefsCleared = staleResult.rowCount || 0;
      }

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
    crossWardCleaned = safeParseIntOrNull(preview.rows[0].count) || 0;
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
      return safeParseIntOrNull(result.rows[0].cnt) || 0;
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
        desc += safeParseIntOrNull(result.rows[0].cnt);
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
  // SKIP_PHASES exclusion: last_seen_at's semantic is "last seen in the
  // Toronto Open Data feed." Bumping it for terminal (P19/P20), orphan
  // (O1-O3), or CoA pre-permit (P1/P2) phases conflates two meanings
  // and pollutes the 26h window used by assert-entity-tracing with
  // permits that compute-trade-forecasts will never process. SKIP_PHASES
  // permits are phase-stable; their reclassification can wait for the
  // next daily permits chain run. NULL lifecycle_phase is preserved —
  // unclassified permits still need the dirty signal.
  // Must stay in sync with compute-trade-forecasts.js SKIP_PHASES set.
  //
  // Skipped in dry-run mode.
  //
  // SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2.7
  let permitsBumped = 0;
  if (!dryRun) {
    // Use RUN_AT (DB-sourced timestamp) for the window start so this query uses
    // the same clock source as the linking tier UPDATEs. A JS Date.now() bumpStart
    // can be ahead of the DB clock, causing the subquery to miss newly-linked CoAs.
    const bumpStart = RUN_AT.toISOString();
    permitsBumped = await pipeline.withTransaction(pool, async (client) => {
      const bumpResult = await client.query(
        `UPDATE permits
            SET last_seen_at = $2::timestamptz
          WHERE permit_num IN (
            SELECT DISTINCT linked_permit_num
              FROM coa_applications
             WHERE linked_permit_num IS NOT NULL
               AND last_seen_at >= $1::timestamptz
          )
            AND last_seen_at < NOW() - INTERVAL '1 second'
            AND (lifecycle_phase IS NULL OR lifecycle_phase NOT IN ${SKIP_PHASES_SQL})`,
        [bumpStart, RUN_AT],
      );
      return bumpResult.rowCount || 0;
    });
    pipeline.log.info(
      '[link-coa]',
      `Bumped permits.last_seen_at on ${permitsBumped.toLocaleString()} newly-linked permits (for downstream lifecycle re-classification)`,
    );
  }

  // ------------------------------------------------------------------
  // Phase D R5.1: permits.linked_coa_application_number back-ref pass
  // ------------------------------------------------------------------
  // Bidirectional linkage so Phase E lifecycle JOINs can navigate from
  // permits → coa without a re-lookup against coa_applications. Writes
  // permits.linked_coa_application_number for every permit that has at
  // least one CoA pointing at it via coa_applications.linked_permit_num.
  //
  // IS DISTINCT FROM guard prevents WAL bloat on re-runs (no-op when the
  // back-ref is already up-to-date).
  //
  // SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
  let permitsBackRefUpdated = 0;
  if (!dryRun) {
    permitsBackRefUpdated = await pipeline.withTransaction(pool, async (client) => {
      // R5.1.g Worktree HIGH-3 fix: tiebreaker preference for APPROVED
      // decisions before falling back to decision_date / application_number.
      // Most CoAs that resolve to a real permit are approved; preferring
      // approved-decision rows over NULL-date undecided rows makes the
      // back-ref reflect the authoritative outcome.
      const backRefResult = await client.query(
        `UPDATE permits p
            SET linked_coa_application_number = src.application_number
           FROM (
             SELECT DISTINCT ON (linked_permit_num)
                    linked_permit_num, application_number
               FROM coa_applications
              WHERE linked_permit_num IS NOT NULL
              ORDER BY linked_permit_num,
                       (decision ILIKE 'approved%')::int DESC,
                       decision_date DESC NULLS LAST,
                       application_number
           ) src
          WHERE p.permit_num = src.linked_permit_num
            AND p.linked_coa_application_number IS DISTINCT FROM src.application_number`
      );
      return backRefResult.rowCount || 0;
    });
    pipeline.log.info(
      '[link-coa]',
      `Wrote permits.linked_coa_application_number back-ref on ${permitsBackRefUpdated.toLocaleString()} permits`,
    );
  }

  // ------------------------------------------------------------------
  // Phase D R5.6 Part A: permit→CoA enrichment (lead-identity continuity)
  // ------------------------------------------------------------------
  // When link-coa.js's fuzzy-match writes coa.linked_permit_num with high
  // confidence (Tier 1a/1b/2a at conf ≥ coa_inherit_from_permit_min_confidence,
  // default 0.60), inherit the permit's authoritative lat/long + ward into
  // coa_applications. This closes the lead-identity continuity gap where a
  // user who saw the lead via the permit feed would later see the linked CoA
  // with slightly-different attributes.
  //
  // The DISTINCT ON subquery (Indep C1 CRIT fold) disambiguates permit
  // revisions — coa_applications.linked_permit_num stores only permit_num,
  // but permits has many revisions per permit_num each with potentially
  // different lat/long. We pick the same revision link-coa.js's Tier 1a
  // logic would pick (most recent issue/application date, then highest rev).
  //
  // Atomic lat/long pair guard (Gemini HIGH fold): WHERE checks BOTH
  // p.latitude IS NOT NULL AND p.longitude IS NOT NULL — never writes half
  // a coordinate pair.
  //
  // IS DISTINCT FROM guards: idempotent re-run + dead-tuple bloat prevention.
  // Re-applies when permit's lat/long changes between chain runs.
  //
  // Ward COALESCE (Indep M5 + checklist e): CoA's own ward authoritative
  // when non-null (CoA data is reliable for ward); permit ward used only
  // to FILL NULL CoA ward.
  //
  // SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.D + §6.6.X Lead-Identity Continuity + §6.11 Phase D R5.6
  let coaInheritedFromPermit = 0;
  let coaLatLngUpgradedFromPermit = 0;
  let coaWardFilledFromPermit = 0;
  let coaWardMismatchWithPermit = 0;
  let coaBelowConfidenceFloor = 0;
  let leadIdentityLatLngMismatch = 0;
  // Diff-review fold (Obs L3): enrichment_eligible_count distinguishes
  // "fresh staging DB / no CoAs linked yet" from "enrichment code is
  // silently broken" on first run. If eligible > 0 but inherited == 0, the
  // enrichment UPDATE is broken; if both 0, simply no CoAs are eligible yet.
  let enrichmentEligible = 0;
  if (!dryRun) {
    // R5.6 Indep H3 fold: enrichment in its own withTransaction (post-tier
    // writes). link-coa.js's tier UPDATEs each have their own transaction;
    // we don't try to share one envelope.
    const enrichmentCounts = await pipeline.withTransaction(pool, async (client) => {
      // Pre-count rows where ca.ward != p.ward (both non-null) — Obs L3-4
      // fold: data-quality signal independent of inheritance writes.
      const mismatchRes = await client.query(
        `WITH best_permit AS (
           SELECT DISTINCT ON (p.permit_num) p.permit_num, p.ward
             FROM permits p
            ORDER BY p.permit_num,
                     COALESCE(p.issued_date, p.application_date) DESC NULLS LAST,
                     p.revision_num DESC
         )
         SELECT COUNT(*)::int AS n
           FROM coa_applications ca
           JOIN best_permit bp ON bp.permit_num = ca.linked_permit_num
          WHERE ca.linked_confidence >= $1::numeric
            AND ca.ward IS NOT NULL AND bp.ward IS NOT NULL
            AND LTRIM(ca.ward, '0') != LTRIM(bp.ward, '0')`,
        [inheritConfMin],
      );
      const wardMismatch = mismatchRes.rows[0].n || 0;

      // Pre-count CoAs where the ward fill would fire — Obs L3-4 fold:
      // accurate count independent of the lat/long UPDATE rowCount.
      //
      // Diff-review CRIT fold (3-way concur: DeepSeek MED + Indep H2 + Obs
      // L10): MUST filter `p.latitude IS NOT NULL AND p.longitude IS NOT NULL`
      // to match the main UPDATE's best_permit CTE. Without this, the
      // pre-count overcounts ward fills for permits that have ward but no
      // geocode (those permits are excluded from the main UPDATE entirely).
      const wardFillRes = await client.query(
        `WITH best_permit AS (
           SELECT DISTINCT ON (p.permit_num) p.permit_num, p.ward
             FROM permits p
            WHERE p.ward IS NOT NULL
              AND p.latitude IS NOT NULL
              AND p.longitude IS NOT NULL
            ORDER BY p.permit_num,
                     COALESCE(p.issued_date, p.application_date) DESC NULLS LAST,
                     p.revision_num DESC
         )
         SELECT COUNT(*)::int AS n
           FROM coa_applications ca
           JOIN best_permit bp ON bp.permit_num = ca.linked_permit_num
          WHERE ca.linked_confidence >= $1::numeric
            AND ca.ward IS NULL`,
        [inheritConfMin],
      );
      const wardFill = wardFillRes.rows[0].n || 0;

      // Pre-count lat/lng upgrades — Obs L3-4 fold: separate from ward.
      const latLngRes = await client.query(
        `WITH best_permit AS (
           SELECT DISTINCT ON (p.permit_num) p.permit_num, p.latitude, p.longitude
             FROM permits p
            WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
            ORDER BY p.permit_num,
                     COALESCE(p.issued_date, p.application_date) DESC NULLS LAST,
                     p.revision_num DESC
         )
         SELECT COUNT(*)::int AS n
           FROM coa_applications ca
           JOIN best_permit bp ON bp.permit_num = ca.linked_permit_num
          WHERE ca.linked_confidence >= $1::numeric
            AND (ca.latitude  IS DISTINCT FROM bp.latitude
              OR ca.longitude IS DISTINCT FROM bp.longitude)`,
        [inheritConfMin],
      );
      const latLngUpgrade = latLngRes.rows[0].n || 0;

      // Main enrichment UPDATE — DISTINCT ON subquery (Indep C1 CRIT fold)
      // + atomic lat/long pair guard (Gemini HIGH fold) + IS DISTINCT FROM
      // guards (idempotent / no WAL bloat).
      const enrichRes = await client.query(
        `WITH best_permit AS (
           SELECT DISTINCT ON (p.permit_num)
                  p.permit_num, p.latitude, p.longitude, p.ward
             FROM permits p
            WHERE p.latitude IS NOT NULL
              AND p.longitude IS NOT NULL
            ORDER BY p.permit_num,
                     COALESCE(p.issued_date, p.application_date) DESC NULLS LAST,
                     p.revision_num DESC
         )
         UPDATE coa_applications ca
            SET latitude  = bp.latitude,
                longitude = bp.longitude,
                -- Indep M5 + checklist (e): CoA ward authoritative; permit fills NULL only.
                ward      = COALESCE(ca.ward, bp.ward)
           FROM best_permit bp
          WHERE ca.linked_permit_num = bp.permit_num
            AND ca.linked_confidence >= $1::numeric
            AND (
                 ca.latitude  IS DISTINCT FROM bp.latitude
              OR ca.longitude IS DISTINCT FROM bp.longitude
              OR (ca.ward IS NULL AND bp.ward IS NOT NULL)
            )`,
        [inheritConfMin],
      );
      const inheritedTotal = enrichRes.rowCount || 0;

      return {
        inheritedTotal,
        latLngUpgrade,
        wardFill,
        wardMismatch,
      };
    });
    coaInheritedFromPermit = enrichmentCounts.inheritedTotal;
    coaLatLngUpgradedFromPermit = enrichmentCounts.latLngUpgrade;
    coaWardFilledFromPermit = enrichmentCounts.wardFill;
    coaWardMismatchWithPermit = enrichmentCounts.wardMismatch;

    // Obs L1-1 CRIT fold: gate-misconfig detection. Count of linked CoAs
    // whose confidence is BELOW the inheritance floor — non-zero is
    // informational; a sudden spike vs 7-day baseline indicates the floor
    // was tightened or many low-confidence links got created.
    //
    // Diff-review fold (Obs L8): this query runs on `pool` (outside the
    // enrichment transaction). Correctness depends on ADVISORY_LOCK_ID = 12
    // preventing concurrent link-coa.js runs from racing the count.
    const belowFloorRes = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM coa_applications
        WHERE linked_permit_num IS NOT NULL
          AND linked_confidence < $1::numeric`,
      [inheritConfMin],
    );
    coaBelowConfidenceFloor = belowFloorRes.rows[0].n || 0;

    // Diff-review fold (Obs L3): count CoAs eligible for enrichment (linked
    // + confidence >= floor) — surfaces a non-zero signal even when no
    // upgrades actually fire (e.g., already-converged state), distinguishing
    // it from a "no CoAs linked yet" first-run state.
    const eligibleRes = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM coa_applications
        WHERE linked_permit_num IS NOT NULL
          AND linked_confidence >= $1::numeric`,
      [inheritConfMin],
    );
    enrichmentEligible = eligibleRes.rows[0].n || 0;

    // Obs L1-3 HIGH fold: post-inheritance consistency check. Non-zero
    // means either the enrichment UPDATE has a bug, OR the permit's
    // lat/long was updated between this script's enrichment step and the
    // check (which would re-enrich on the next chain run via IS DISTINCT
    // FROM guard). Threshold == 0 FAIL.
    const mismatchRes = await pool.query(
      `WITH best_permit AS (
         SELECT DISTINCT ON (p.permit_num)
                p.permit_num, p.latitude, p.longitude
           FROM permits p
          WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
          ORDER BY p.permit_num,
                   COALESCE(p.issued_date, p.application_date) DESC NULLS LAST,
                   p.revision_num DESC
       )
       SELECT COUNT(*)::int AS n
         FROM coa_applications ca
         JOIN best_permit bp ON bp.permit_num = ca.linked_permit_num
        WHERE ca.linked_confidence >= $1::numeric
          AND (ca.latitude  IS DISTINCT FROM bp.latitude
            OR ca.longitude IS DISTINCT FROM bp.longitude)`,
      [inheritConfMin],
    );
    leadIdentityLatLngMismatch = mismatchRes.rows[0].n || 0;

    pipeline.log.info(
      '[link-coa]',
      `R5.6 enrichment: ${coaInheritedFromPermit} CoAs updated (${coaLatLngUpgradedFromPermit} lat/long + ${coaWardFilledFromPermit} ward fills); ${coaWardMismatchWithPermit} ward mismatches; ${coaBelowConfidenceFloor} below confidence floor`,
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
  const prePermitLinkCount = safeParseIntOrNull(linksToPrePermits.rows[0].count) || 0;

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
  const crossWardCount = safeParseIntOrNull(crossWardLinks.rows[0].count) || 0;

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
  const potentialMatches = safeParseIntOrNull(potentialRes.rows[0].could_link) || 0;

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
    { metric: 'permits_bumped_last_seen_at', value: permitsBumped, threshold: null, status: 'INFO' },
    { metric: 'permits_back_ref_updated', value: permitsBackRefUpdated, threshold: null, status: 'INFO' },
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
    // R5.6 audit metric extensions (folds Obs L1-1, L1-3, L3-4 + DeepSeek + diff-review Obs L3)
    { metric: 'enrichment_eligible_count', value: enrichmentEligible, threshold: null, status: 'INFO' },
    { metric: 'coa_inherited_from_permit_count', value: coaInheritedFromPermit, threshold: null, status: 'INFO' },
    { metric: 'coa_lat_lng_upgraded_from_permit_count', value: coaLatLngUpgradedFromPermit, threshold: null, status: 'INFO' },
    { metric: 'coa_ward_filled_from_permit_count', value: coaWardFilledFromPermit, threshold: null, status: 'INFO' },
    { metric: 'coa_ward_mismatch_with_permit_count', value: coaWardMismatchWithPermit, threshold: null, status: 'INFO' },
    { metric: 'coa_below_confidence_floor_count', value: coaBelowConfidenceFloor, threshold: null, status: 'INFO' },
    // Diff-review fold (Indep H1 + Obs L1 + L11): demoted FAIL → WARN.
    // Non-zero only fires when geocode-permits.js commits a permit lat/long
    // update between the enrichment commit and this post-check (both use
    // different advisory locks — no cross-script mutex). The next CoA chain
    // run repairs via the IS DISTINCT FROM guard. FAIL was too aggressive
    // for a race-condition signal that has no actionable operator response
    // beyond "re-run CoA chain."
    { metric: 'lead_identity_lat_lng_mismatch_count', value: leadIdentityLatLngMismatch, threshold: '== 0 (WARN — usually concurrent geocode-permits race; resolves next run)', status: leadIdentityLatLngMismatch > 0 ? 'WARN' : 'PASS' },
    { metric: 'stale_back_refs_cleared_count', value: staleBackRefsCleared, threshold: null, status: 'INFO' },
    { metric: 'inherited_confidence_floor', value: inheritConfMin, threshold: null, status: 'INFO' },
  ];
  const linkAuditHasFails = prePermitLinkCount > 0 || effectiveRateStatus === 'FAIL';
  const linkAuditHasWarns = descErrors > 0 || crossWardCount > 0 || tier1c > 0 || effectiveRateStatus === 'WARN' || leadIdentityLatLngMismatch > 0;
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
  pipeline.emitSummary({ records_total: totalLinked, records_new: 0, records_updated: totalLinked, records_meta: meta });
  // R5.6 Indep M4 + Obs L3-7 fold: emitMeta extended for permit→CoA enrichment.
  // Reads add permits.latitude/longitude/revision_num/application_date (for
  // the DISTINCT ON subquery). Writes add coa_applications.latitude/longitude/ward.
  pipeline.emitMeta(
    { "coa_applications": ["id", "application_number", "street_num", "street_name_normalized", "ward", "description", "decision_date", "linked_permit_num", "linked_confidence", "latitude", "longitude"],
      "permits": ["permit_num", "revision_num", "street_num", "street_name_normalized", "ward", "issued_date", "application_date", "description", "latitude", "longitude"] },
    { "coa_applications": ["linked_permit_num", "linked_confidence", "last_seen_at", "latitude", "longitude", "ward"],
      "permits": ["last_seen_at", "linked_coa_application_number"] }
  );
  });
  if (!lockResult.acquired) return;
});
