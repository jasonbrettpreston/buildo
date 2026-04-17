// 🔗 SPEC LINK: docs/specs/product/future/83_lead_cost_model.md §5 Testing Mandate
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/compute-cost-estimates.js — file shape', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/compute-cost-estimates.js'),
      'utf-8',
    );
  });

  it('uses pipeline.run wrapper with correct name', () => {
    expect(content).toMatch(/pipeline\.run\(\s*['"]compute-cost-estimates['"]/);
  });

  it('delegates advisory lock 83 to pipeline.withAdvisoryLock — Phase 2 migration (spec 47 §5)', () => {
    // Hand-rolled lockClient + SIGTERM boilerplate replaced with SDK helper.
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 83/);
    expect(content).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
    // Must NOT hand-roll — direct lock calls bypass the spec helper
    expect(content).not.toMatch(/pg_try_advisory_lock/);
    expect(content).not.toMatch(/pg_advisory_unlock/);
    // Must NOT install its own SIGTERM — helper handles it
    expect(content).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });

  it('does not hand-roll lockClient — pool.connect() replaced by withAdvisoryLock helper', () => {
    expect(content).not.toMatch(/const lockClient\s*=\s*await pool\.connect\(\)/);
    expect(content).not.toMatch(/let lockClientReleased/);
  });

  it('streams permits via pipeline.streamQuery (no load-all)', () => {
    expect(content).toMatch(/pipeline\.streamQuery\(/);
  });

  it('batches writes via pipeline.withTransaction', () => {
    expect(content).toMatch(/pipeline\.withTransaction\(/);
  });

  it('uses formula-based BULK_COLUMN_COUNT = 15 (spec 83 §7, spec 47 §6.3)', () => {
    expect(content).toMatch(/BULK_COLUMN_COUNT\s*=\s*15/);
  });

  it('derives BATCH_SIZE from formula Math.floor((65535 - 1) / BULK_COLUMN_COUNT) (spec 47 §6.3)', () => {
    // Must NOT be a hardcoded magic number
    expect(content).toMatch(/BATCH_SIZE\s*=\s*Math\.floor\(\s*\(\s*65535\s*-\s*1\s*\)\s*\/\s*BULK_COLUMN_COUNT\s*\)/);
    expect(content).not.toMatch(/BATCH_SIZE\s*=\s*5000/);
  });

  it('uses ON CONFLICT (permit_num, revision_num) DO UPDATE for idempotency', () => {
    expect(content).toMatch(/ON CONFLICT \(permit_num, revision_num\) DO UPDATE/);
  });

  it('references all source tables', () => {
    expect(content).toMatch(/\bpermits\b/);
    expect(content).toMatch(/\bpermit_parcels\b/);
    expect(content).toMatch(/\bparcels\b/);
    expect(content).toMatch(/\bbuilding_footprints\b/);
    expect(content).toMatch(/\bneighbourhoods\b/);
  });

  it('writes to cost_estimates', () => {
    expect(content).toMatch(/\bcost_estimates\b/);
  });

  it('emits PIPELINE_SUMMARY with records_total, records_new, records_updated', () => {
    expect(content).toMatch(/pipeline\.emitSummary\(/);
    expect(content).toMatch(/records_total/);
    expect(content).toMatch(/records_new/);
    expect(content).toMatch(/records_updated/);
  });

  it('emits PIPELINE_META with reads and writes maps', () => {
    expect(content).toMatch(/pipeline\.emitMeta\(/);
  });

  it('references the Brain (cost-model-shared.js) for dual code path', () => {
    expect(content).toMatch(/src[/\\]features[/\\]leads[/\\]lib[/\\]cost-model-shared/);
    expect(content).toMatch(/DUAL CODE PATH/i);
  });

  it('does NOT contain inline estimateCostInline or BASE_RATES (Brain owns valuation math)', () => {
    expect(content).not.toMatch(/function\s+estimateCostInline\s*\(/);
    expect(content).not.toMatch(/\bBASE_RATES\b/);
    expect(content).not.toMatch(/\bSCOPE_ADDITIONS\b/);
    expect(content).not.toMatch(/\bCOST_TIER_BOUNDARIES\b/);
  });

  it('logs batch failures via pipeline.log.error (NOT bare console.error)', () => {
    expect(content).toMatch(/pipeline\.log\.error\(/);
  });

  it('casts DECIMAL(15,2) columns to float8 for JS consumption', () => {
    expect(content).toMatch(/::float8/);
  });

  it('tracks failed batches and rows in emitSummary records_meta', () => {
    expect(content).toContain('failedBatches');
    expect(content).toContain('failedRows');
    expect(content).toContain('failed_batches');
    expect(content).toContain('failed_rows');
  });

  it('emits PIPELINE_SUMMARY on advisory lock early return (skipEmit:false + lockResult guard)', () => {
    // The skip path is the if (!lockResult.acquired) block — must emit summary before return.
    const skipBlock = content.match(/if\s*\(!lockResult\.acquired\)([\s\S]{0,2000})/)?.[0] ?? '';
    expect(skipBlock, 'lockResult.acquired guard not found').toBeTruthy();
    expect(skipBlock).toContain('emitSummary');
    expect(skipBlock).toContain('return;');
  });

  // --- audit_table observability ---
  it('builds a custom audit_table in the success path (not just SDK auto-inject)', () => {
    expect(content).toMatch(/audit_table\s*:\s*\{/);
    expect(content).toMatch(/verdict/);
  });

  it('includes permits_processed / permits_inserted / permits_updated audit rows', () => {
    expect(content).toMatch(/metric:\s*['"]permits_processed['"]/);
    expect(content).toMatch(/metric:\s*['"]permits_inserted['"]/);
    expect(content).toMatch(/metric:\s*['"]permits_updated['"]/);
  });

  it('surfaces failed_rows as a WARN audit row when batch failures occur', () => {
    expect(content).toMatch(/metric:\s*['"]failed_rows['"]/);
  });

  it('uses ADVISORY_LOCK_ID = 83 (lock_id = spec number convention) (WF3-03 PR-C / 83-W7)', () => {
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 83/);
    expect(content).not.toMatch(/const ADVISORY_LOCK_ID = 74/);
  });

  it('passes skipEmit: false to withAdvisoryLock — caller controls the rich SKIP emit (Phase 2)', () => {
    // compute-cost-estimates has a richer SKIP payload (with audit_table rows)
    // than the default SKIP the helper emits. skipEmit:false tells the helper
    // to skip its own emit so the caller can send the custom one on lock-held.
    expect(content).toMatch(/skipEmit\s*:\s*false/);
  });

  it('does NOT swallow per-row errors inside flushBatch — let withTransaction rollback (WF3-03 PR-C / 83-W6)', () => {
    const flushBatchMatch = content.match(/async function flushBatch[\s\S]*?^}/m);
    expect(flushBatchMatch, 'flushBatch function not found').toBeTruthy();
    const flushBody = flushBatchMatch![0];
    expect(flushBody, 'per-row try/catch inside flushBatch defeats withTransaction atomicity (83-W6)').not.toMatch(
      /for \(const r of rows\)[\s\S]*?try\s*\{[\s\S]*?await client\.query/,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 2 — Spec 83 Surgical additions
  // ─────────────────────────────────────────────────────────────────────────────

  it('does NOT install its own SIGTERM handler — delegated to withAdvisoryLock helper (spec 47 §5.5)', () => {
    // Phase 2: helper handles SIGTERM/SIGINT traps. Installing a second handler
    // would create a race between the helper cleanup and the script's own cleanup.
    expect(content).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });

  it('checks lockResult.acquired and emits rich SKIP payload with audit_table (Phase 2)', () => {
    // On lock-not-acquired, the script emits a custom SKIP summary with the
    // same audit_table shape as the main path — FreshnessTimeline renders it.
    expect(content).toMatch(/lockResult\.acquired/);
    expect(content).toMatch(/advisory_lock_held_elsewhere/);
    expect(content).toMatch(/audit_table/);
  });

  it('captures RUN_AT via pool.query inside the withAdvisoryLock callback — not on lockClient (spec 47 §8)', () => {
    // After Phase 2 migration, no lockClient exists. RUN_AT must be obtained
    // via pool.query() inside the withAdvisoryLock callback.
    // Accepts either the old inline pattern or the new SDK helper (pipeline.getDbTimestamp).
    const hasInlineNow = /pool\.query\([^)]*SELECT NOW/.test(content);
    const hasSdkHelper = /pipeline\.getDbTimestamp\s*\(/.test(content);
    expect(hasInlineNow || hasSdkHelper,
      'Must capture RUN_AT via pool.query(SELECT NOW) or pipeline.getDbTimestamp()'
    ).toBe(true);
    expect(content).not.toMatch(/lockClient\.query\([^)]*SELECT NOW/);
  });

  it('validates logic_variables via Zod COST_MODEL_CONFIG_SCHEMA (spec 83 §4)', () => {
    expect(content).toMatch(/COST_MODEL_CONFIG_SCHEMA\s*=\s*z\.object\(/);
    expect(content).toMatch(/urban_coverage_ratio/);
    expect(content).toMatch(/suburban_coverage_ratio/);
    expect(content).toMatch(/liar_gate_threshold/);
  });

  it('does NOT validate trust_threshold_pct as a Zod key in COST_MODEL_CONFIG_SCHEMA — reserved for Spec 83 Phase 2 (WF3-A)', () => {
    // trust_threshold_pct governs a per-dataset coverage trust gate not yet implemented
    // in the Brain. Validating a key the script never consumes creates false confidence.
    // It remains seeded in logic_variables.json and ZERO_IS_INVALID for future use.
    // The comment explaining the exclusion is allowed — only the Zod key line is banned.
    const schemaBlock = content.match(/COST_MODEL_CONFIG_SCHEMA\s*=\s*z\.object\(([\s\S]*?)\)\.passthrough\(\)/)?.[0] ?? '';
    expect(schemaBlock, 'COST_MODEL_CONFIG_SCHEMA block not found').toBeTruthy();
    // Match the Zod key pattern: `  trust_threshold_pct:` — comments are allowed
    expect(schemaBlock).not.toMatch(/^\s*trust_threshold_pct\s*:/m);
  });

  it('calls validateLogicVars and throws on invalid config', () => {
    expect(content).toMatch(/validateLogicVars\(/);
    expect(content).toMatch(/validation\.valid/);
    expect(content).toMatch(/Config validation failed/i);
  });

  it('SOURCE_SQL uses ALL classified trades (no is_active filter) for cost distribution (spec 83 §7, WF3-L2)', () => {
    // Cost estimation must distribute total project cost across all classified trades,
    // regardless of construction phase. The is_active flag is for lead scoring
    // (phase-relevance for tradespeople) not for cost valuation.
    // Alteration permits with interior-only trades (drywall, electrical, hvac) are
    // classified as early_construction phase — filtering to is_active=true would
    // exclude all their trades and silently discard declared costs up to $1.7M.
    expect(content).toMatch(/permit_trades/);
    // Joins trades to resolve slug (permit_trades has trade_id FK, not slug column)
    expect(content).toMatch(/ARRAY_AGG\(t\.slug\)/i);
    expect(content).toMatch(/active_trade_slugs/);
    // is_active filter MUST NOT appear in the cost estimation JOIN — phase gate
    // belongs in lead scoring (get-lead-feed.ts), not in cost distribution
    expect(content).not.toMatch(/pt2\.is_active\s*=\s*true/);
  });

  it('COALESCE prevents NULL active_trade_slugs (spec 83 §7)', () => {
    expect(content).toMatch(/COALESCE\s*\(\s*pt\.active_trades\s*,\s*ARRAY\[\]::text\[\]\s*\)/i);
  });

  it('IS DISTINCT FROM guard covers all 5 WAL-guard columns (spec 47 §6.4)', () => {
    const sql = content.match(/WHERE EXCLUDED\.estimated_cost[\s\S]*?trade_contract_values::text/)?.[0] ?? '';
    expect(sql, 'IS DISTINCT FROM block not found').toBeTruthy();
    expect(sql).toContain('estimated_cost');
    expect(sql).toContain('cost_source');
    expect(sql).toContain('is_geometric_override');
    expect(sql).toContain('effective_area_sqm');
    expect(sql).toContain('trade_contract_values::text');
  });

  it('RETURNING (xmax = 0) AS inserted for insert/update/skip accounting', () => {
    expect(content).toMatch(/RETURNING\s*\(\s*xmax\s*=\s*0\s*\)\s*AS\s+inserted/i);
  });

  it('pre-fetches trade_sqft_rates and scope_intensity_matrix before stream (spec 83 §7)', () => {
    const beforeStream = content.split('pipeline.streamQuery')[0] ?? '';
    expect(beforeStream).toContain('trade_sqft_rates');
    expect(beforeStream).toContain('scope_intensity_matrix');
  });

  it('data_quality_snapshots uses UPDATE (not INSERT) — best-effort observability (spec 83 §4)', () => {
    expect(content).toMatch(/UPDATE\s+data_quality_snapshots/i);
    expect(content).toMatch(/cost_estimates_liar_gate_overrides/);
    expect(content).toMatch(/cost_estimates_zero_total_bypass/);
    // Must NOT INSERT — table has NOT NULL columns that this script cannot fill
    expect(content).not.toMatch(/INSERT INTO data_quality_snapshots/i);
  });

  it('emitMeta reads include permit_trades, trade_sqft_rates, scope_intensity_matrix', () => {
    // Split on last emitMeta call (the success path, not the skip-path early return)
    const metaSection = content.split('pipeline.emitMeta(').pop() ?? '';
    expect(metaSection).toContain('permit_trades');
    expect(metaSection).toContain('trade_sqft_rates');
    expect(metaSection).toContain('scope_intensity_matrix');
  });

  it('emitMeta writes include effective_area_sqm and data_quality_snapshots', () => {
    // Use [1] (first emitMeta = main path) not .pop() (last = skip path which is brief).
    const metaSection = content.split('pipeline.emitMeta(')[1] ?? '';
    expect(metaSection).toContain('effective_area_sqm');
    expect(metaSection).toContain('data_quality_snapshots');
  });

  it('liar_gate_overrides and zero_total_bypass appear in audit rows (spec 83 §4)', () => {
    expect(content).toMatch(/metric:\s*['"]liar_gate_overrides['"]/);
    expect(content).toMatch(/metric:\s*['"]zero_total_bypass['"]/);
  });

  it('guarded by require.main === module so it can be require()-d from tests', () => {
    expect(content).toMatch(/require\.main\s*===\s*module/);
  });

  it('exports estimateCostShared for parity-battery tests', () => {
    expect(content).toMatch(/module\.exports\s*=\s*\{[\s\S]*estimateCostShared[\s\S]*\}/);
  });

  it('parses --dry-run and --limit=N CLI flags (spec 47 §21)', () => {
    expect(content).toMatch(/--dry-run/);
    expect(content).toMatch(/--limit=/);
  });

  it('uses batch.length = 0 for array reuse (not batch = [] allocation)', () => {
    expect(content).toMatch(/batch\.length\s*=\s*0/);
  });

  it('has SPEC LINK pointing to spec 83 (not legacy 72)', () => {
    expect(content).toMatch(/SPEC LINK.*83_lead_cost_model/);
    // Must not still say spec 72 in the header
    const headerComment = content.slice(0, 500);
    expect(headerComment).not.toMatch(/72_lead_cost_model/);
  });

  it('reads cost_model_coverage_warn_pct from logicVars — no hardcoded >= 80 coverage check (WF3-E16)', () => {
    expect(content).toMatch(/logicVars\.cost_model_coverage_warn_pct/);
    expect(content).not.toMatch(/modelCoveragePct >= 80\b/);
    expect(content).not.toMatch(/modelCoveragePct < 80\b/);
  });
});
