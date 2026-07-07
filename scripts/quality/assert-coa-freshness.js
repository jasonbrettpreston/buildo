#!/usr/bin/env node
/**
 * CQA Step 3: CoA Source Freshness Monitor (Portal Rot Check)
 *
 * Detects if the city's CKAN portal has stopped publishing new CoA data
 * by checking the ingestion timestamp (last_seen_at) — NOT hearing_date,
 * which can be scheduled months into the future and masks portal rot.
 *
 * Read-only — no database writes. Independently testable and triggerable.
 *
 * Metrics:
 *   last_ingestion: MAX(last_seen_at) — when load-coa.js last touched a row
 *   ingestion_days_ago: days since last ingestion
 *   max_decision_date: latest decision (past-only, informational)
 *   max_hearing_date: latest hearing (may be future, informational only)
 *
 * Pass Criteria:
 *   ingestion_days_ago < coa_freshness_warn_days (WARN if exceeded, data may be frozen)
 *
 * Usage: node scripts/quality/assert-coa-freshness.js
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 */
const { z } = require('zod');
const pipeline = require('../lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('../lib/config-loader');

const LOGIC_VARS_SCHEMA = z.object({
  coa_freshness_warn_days: z.coerce.number().finite().positive().int(),
  // WF2 P6.5 — FAIL tier (portal likely dead, not just slow). Seed 135 ≈ 3× warn.
  coa_freshness_fail_days: z.coerce.number().finite().positive().int(),
}).passthrough().refine((d) => d.coa_freshness_fail_days > d.coa_freshness_warn_days, {
  message: 'coa_freshness_fail_days must be strictly greater than coa_freshness_warn_days',
});

const ADVISORY_LOCK_ID = 108;

pipeline.run('assert-coa-freshness', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  const startTime = Date.now();

  const { logicVars } = await loadMarketplaceConfigs(pool, 'assert-coa-freshness');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'assert-coa-freshness');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);

  const freshnessDays = logicVars.coa_freshness_warn_days;
  const freshnessFailDays = logicVars.coa_freshness_fail_days;

  pipeline.log.info('[assert-coa-freshness]', 'Checking CoA source data freshness...');

  const result = await pool.query(`
    SELECT
      MAX(last_seen_at) AS max_last_seen,
      MAX(hearing_date)::date AS max_hearing_date,
      MAX(decision_date)::date AS max_decision_date,
      COUNT(*) AS total_records
    FROM coa_applications
  `);

  const row = result.rows[0];
  const totalRecords = parseInt(row.total_records) || 0;
  const maxLastSeen = row.max_last_seen;
  const maxHearingDate = row.max_hearing_date;
  const maxDecisionDate = row.max_decision_date;

  if (totalRecords === 0) {
    pipeline.log.warn('[assert-coa-freshness]', 'No CoA records found — table is empty');
    pipeline.emitSummary({
      records_total: 0, records_new: null, records_updated: null,
      records_meta: {
        audit_table: {
          phase: 3, name: 'Source Freshness', verdict: 'WARN',
          rows: [{ metric: 'total_records', value: 0, threshold: '> 0', status: 'WARN' }],
        },
      },
    });
    pipeline.emitMeta({ coa_applications: ['last_seen_at', 'hearing_date', 'decision_date'] }, {});
    return;
  }

  // Use last_seen_at (ingestion timestamp) for staleness — not hearing_date
  // which can be months in the future and masks portal rot.
  const lastSeenMs = maxLastSeen ? new Date(maxLastSeen).getTime() : 0;
  const ingestionDaysAgo = lastSeenMs > 0
    ? Math.max(0, Math.round((Date.now() - lastSeenMs) / (1000 * 60 * 60 * 24)))
    : null;

  // WF2 P6.5 — 3-tier: FAIL (portal dead) > WARN (portal slow) > PASS.
  // Pattern: assert-staleness.js:160. isFail takes precedence over isStale.
  const isFail = ingestionDaysAgo !== null && ingestionDaysAgo >= freshnessFailDays;
  const isStale = ingestionDaysAgo !== null && ingestionDaysAgo >= freshnessDays;
  const freshnessStatus = isFail ? 'FAIL' : isStale ? 'WARN' : 'PASS';

  pipeline.log.info('[assert-coa-freshness]', 'Freshness check complete', {
    total_records: totalRecords,
    last_ingestion: maxLastSeen,
    ingestion_days_ago: ingestionDaysAgo,
    max_decision_date: maxDecisionDate,
    max_hearing_date: maxHearingDate,
    stale: isStale,
    fail: isFail,
  });

  if (isFail) {
    pipeline.log.error('[assert-coa-freshness]', new Error(`Portal rot FAIL: last ingestion was ${ingestionDaysAgo} days ago (>= ${freshnessFailDays}). CKAN CoA feed likely dead.`), { phase: 'freshness' });
  } else if (isStale) {
    pipeline.log.warn('[assert-coa-freshness]', `Portal rot warning: last ingestion was ${ingestionDaysAgo} days ago. CKAN data may be frozen.`);
  }

  const durationMs = Date.now() - startTime;
  const rows = [
    { metric: 'total_records', value: totalRecords, threshold: null, status: 'INFO' },
    { metric: 'last_ingestion', value: maxLastSeen ? new Date(maxLastSeen).toISOString().split('T')[0] : 'never', threshold: null, status: 'INFO' },
    { metric: 'ingestion_days_ago', value: ingestionDaysAgo, threshold: `< ${freshnessDays} WARN / < ${freshnessFailDays} FAIL`, status: freshnessStatus },
    { metric: 'max_decision_date', value: maxDecisionDate || 'none', threshold: null, status: 'INFO' },
    { metric: 'max_hearing_date', value: maxHearingDate || 'none', threshold: null, status: 'INFO' },
  ];

  pipeline.emitSummary({
    records_total: 0, records_new: null, records_updated: null,
    records_meta: {
      duration_ms: durationMs,
      audit_table: {
        phase: 3,
        name: 'Source Freshness',
        verdict: freshnessStatus,
        rows,
      },
    },
  });
  pipeline.emitMeta(
    { coa_applications: ['last_seen_at', 'hearing_date', 'decision_date'] },
    {}
  );
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
