#!/usr/bin/env node
/**
 * Generate Pre-Permit lead forecasts from approved CoA applications.
 *
 * Pre-permit leads are Committee of Adjustment applications that:
 * - Were approved (decision = 'Approved' or 'Approved with Conditions')
 * - Have NOT yet been linked to a building permit
 *
 * This script:
 *   1. INSERTs Pre-Permit placeholder rows into the permits table (PRE- prefix)
 *   2. Expires aging Pre-Permits older than 18 months (Forecasted → Expired/Abandoned)
 *   3. Reports eligible lead counts by ward
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - records_meta with pre_permits_generated, aging_leads_expired
 *   - ON CONFLICT DO NOTHING for idempotent re-runs (§9.3)
 *
 * Usage: node scripts/create-pre-permits.js
 *
 * SPEC LINK: docs/specs/pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/pipeline/60_shared_steps.md
 */
const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { safeParsePositiveInt } = require('./lib/safe-math');

const LOGIC_VARS_SCHEMA = z.object({
  pre_permit_expiry_months: z.coerce.number().finite().positive().int(),
}).passthrough();

const ADVISORY_LOCK_ID = 100;

pipeline.run('create-pre-permits', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');
  const { logicVars } = await loadMarketplaceConfigs(pool, 'create-pre-permits');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'create-pre-permits');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);

  const expiryMonths = logicVars.pre_permit_expiry_months;
  const startTime = Date.now();

  pipeline.log.info('[create-pre-permits]', 'Generating pre-permit leads from CoA applications...');

  // Count current state — all-time approved, unlinked
  const { rows: [counts] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE decision ILIKE 'approved%'
           AND linked_permit_num IS NULL
       ) as eligible,
       COUNT(*) FILTER (
         WHERE decision ILIKE 'approved%'
           AND linked_permit_num IS NOT NULL
       ) as already_linked,
       COUNT(*) FILTER (
         WHERE decision ILIKE 'approved%'
       ) as total_approved,
       COUNT(*) as total
     FROM coa_applications`
  );

  const eligible = safeParsePositiveInt(counts.eligible, 'eligible');
  const linked = safeParsePositiveInt(counts.already_linked, 'already_linked');
  const approved = safeParsePositiveInt(counts.total_approved, 'total_approved');
  const total = safeParsePositiveInt(counts.total, 'total');

  pipeline.log.info('[create-pre-permits]', `CoA: ${total.toLocaleString()} total, ${approved.toLocaleString()} approved, ${linked.toLocaleString()} linked, ${eligible.toLocaleString()} eligible leads`);

  // Step 1: Generate Pre-Permit placeholder rows
  // No 90-day window — ON CONFLICT DO NOTHING provides idempotency,
  // and aging Pre-Permits are handled by Step 2's 18-month expiry.
  // Filter out NULL application_numbers to prevent NULL concatenation crash.
  const inserted = await pipeline.withTransaction(pool, async (client) => {
    const result = await client.query(`
      INSERT INTO permits (
        permit_num, revision_num, permit_type, status,
        description, ward, street_num, street_name, application_date,
        last_seen_at
      )
      SELECT
        'PRE-' || application_number,
        '00',
        'Pre-Permit',
        'Forecasted',
        description, ward, street_num, street_name, decision_date,
        $1::timestamptz
      FROM coa_applications
      WHERE decision ILIKE 'approved%'
        AND linked_permit_num IS NULL
        AND application_number IS NOT NULL
      ON CONFLICT (permit_num, revision_num) DO NOTHING
    `, [RUN_AT]);
    return result.rowCount || 0;
  });

  pipeline.log.info('[create-pre-permits]', `Generated ${inserted.toLocaleString()} new Pre-Permit leads`);

  // Step 2: Expire aging Pre-Permits (>18 months without a real permit)
  const expired = await pipeline.withTransaction(pool, async (client) => {
    const result = await client.query(`
      UPDATE permits
      SET status = 'Expired/Abandoned',
          last_seen_at = $2::timestamptz
      WHERE permit_type = 'Pre-Permit'
        AND status = 'Forecasted'
        AND application_date < NOW() - $1 * INTERVAL '1 month'
    `, [expiryMonths, RUN_AT]);
    return result.rowCount || 0;
  });

  if (expired > 0) {
    pipeline.log.info('[create-pre-permits]', `Expired ${expired.toLocaleString()} aging Pre-Permits (>${expiryMonths} months)`);
  }

  // Step 3: Reconcile ghost Pre-Permits — when a CoA gets linked to a real permit,
  // the PRE-xxx placeholder row is no longer needed. Delete child rows first
  // (permit_trades, permit_parcels have FK constraints with ON DELETE NO ACTION),
  // then delete the permit itself.
  const reconciled = await pipeline.withTransaction(pool, async (client) => {
    const ghostFilter = `
      permit_type = 'Pre-Permit'
      AND SUBSTRING(permit_num FROM 5) IN (
        SELECT application_number FROM coa_applications
        WHERE linked_permit_num IS NOT NULL
      )`;
    // Clean child tables before deleting the parent permit
    await client.query(
      `DELETE FROM permit_trades WHERE (permit_num, revision_num) IN (
        SELECT permit_num, revision_num FROM permits WHERE ${ghostFilter})`
    );
    await client.query(
      `DELETE FROM permit_parcels WHERE (permit_num, revision_num) IN (
        SELECT permit_num, revision_num FROM permits WHERE ${ghostFilter})`
    );
    const result = await client.query(
      `DELETE FROM permits WHERE ${ghostFilter}`
    );
    return result.rowCount || 0;
  });

  if (reconciled > 0) {
    pipeline.log.info('[create-pre-permits]', `Reconciled ${reconciled.toLocaleString()} ghost Pre-Permits (CoA now linked to real permit)`);
  }

  // Ward breakdown for leads
  const { rows: byWard } = await pool.query(
    `SELECT ward, COUNT(*) as count
     FROM coa_applications
     WHERE decision ILIKE 'approved%'
       AND linked_permit_num IS NULL
       AND application_number IS NOT NULL
     GROUP BY ward
     ORDER BY count DESC
     LIMIT 10`
  );

  if (byWard.length > 0) {
    pipeline.log.info('[create-pre-permits]', 'Top wards', {
      wards: Object.fromEntries(byWard.map(r => [r.ward, safeParsePositiveInt(r.count, 'count')])),
    });
  }

  const durationMs = Date.now() - startTime;
  // Eligible remaining uses the same scope as the INSERT (all unlinked approved)
  const eligibleRemaining = eligible - inserted;

  // Audit table
  const auditRows = [
    { metric: 'pre_permits_generated', value: inserted, threshold: null, status: 'PASS' },
    { metric: 'aging_leads_expired', value: expired, threshold: null, status: 'PASS' },
    { metric: 'ghosts_reconciled', value: reconciled, threshold: null, status: reconciled > 0 ? 'INFO' : 'PASS' },
    { metric: 'eligible_coa_remaining', value: eligibleRemaining, threshold: null, status: 'INFO' },
  ];
  const chainId = process.env.PIPELINE_CHAIN || null;
  const auditTable = {
    phase: chainId === 'coa' ? 5 : 13,
    name: 'Pre-Permit Lead Generation',
    verdict: 'PASS',
    rows: auditRows,
  };

  pipeline.log.info('[create-pre-permits]', 'Done', {
    generated: inserted, expired, reconciled, eligible_remaining: eligibleRemaining,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  pipeline.emitSummary({
    records_total: eligible,
    records_new: inserted,
    records_updated: expired + reconciled,
    records_meta: {
      duration_ms: durationMs,
      pre_permits_generated: inserted,
      aging_leads_expired: expired,
      ghosts_reconciled: reconciled,
      eligible_coa_remaining: eligibleRemaining,
      audit_table: auditTable,
    },
  });
  pipeline.emitMeta(
    { "coa_applications": ["application_number", "decision", "linked_permit_num", "decision_date", "ward", "street_num", "street_name", "description"] },
    { "permits": ["permit_num", "revision_num", "permit_type", "status", "description", "ward", "street_num", "street_name", "application_date", "last_seen_at"] }
  );
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
