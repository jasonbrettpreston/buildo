// SPEC LINK: docs/specs/01-pipeline/81_opportunity_score_engine.md §3 (asymptotic decay + NULL guard), §4 (infra tests)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

describe('scripts/compute-opportunity-scores.js — script shape', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/compute-opportunity-scores.js');
  });

  it('uses pipeline.run wrapper', () => {
    expect(content).toMatch(/pipeline\.run\(\s*['"]compute-opportunity-scores['"]/);
  });

  it('JOINs trade_forecasts + cost_estimates + lead_analytics', () => {
    expect(content).toMatch(/trade_forecasts tf/);
    expect(content).toMatch(/cost_estimates ce/);
    expect(content).toMatch(/lead_analytics la/);
  });

  it('extracts per-trade dollar value from JSONB', () => {
    expect(content).toMatch(/trade_contract_values/);
    expect(content).toMatch(/tradeValue/);
  });

  it('uses shared config loader for control panel variables', () => {
    expect(content).toMatch(/loadMarketplaceConfigs/);
    expect(content).toMatch(/require\('\.\/lib\/config-loader'\)/);
  });

  it('computes base from trade value normalized by control panel divisor', () => {
    // Now uses vars.los_base_divisor from logic_variables (was hardcoded 10000)
    expect(content).toMatch(/tradeValue \/ vars\.los_base_divisor/);
    expect(content).toMatch(/Math\.min/);
  });

  it('uses per-trade multipliers from trade_configurations JOIN', () => {
    // Bug 2 fix: JOINs trade_configurations for per-trade multipliers
    // instead of global los_multiplier_bid / los_multiplier_work
    expect(content).toMatch(/LEFT JOIN trade_configurations tc/);
    expect(content).toMatch(/tc\.multiplier_bid/);
    expect(content).toMatch(/tc\.multiplier_work/);
    // Falls back to global vars when trade config is missing
    expect(content).toMatch(/vars\.los_multiplier_bid/);
    expect(content).toMatch(/vars\.los_multiplier_work/);
  });

  it('applies competition penalty from control panel variables', () => {
    expect(content).toMatch(/tracking_count \* vars\.los_penalty_tracking/);
    expect(content).toMatch(/saving_count \* vars\.los_penalty_saving/);
  });

  it('clamps score to 0-100', () => {
    expect(content).toMatch(/Math\.max\(0/);
    expect(content).toMatch(/Math\.min\(100/);
  });

  it('runs integrity audit for tracked leads missing geometric basis', () => {
    expect(content).toMatch(/integrityFlags/);
    expect(content).toMatch(/modeled_gfa_sqm/);
    expect(content).toMatch(/tracking_count > 0/);
  });

  it('batch-updates opportunity_score via VALUES', () => {
    expect(content).toMatch(/UPDATE trade_forecasts/);
    expect(content).toMatch(/opportunity_score = v\.score/);
  });

  it('emits score distribution in telemetry', () => {
    expect(content).toMatch(/score_distribution/);
    expect(content).toMatch(/elite/);
    expect(content).toMatch(/strong/);
    expect(content).toMatch(/moderate/);
  });

  it('delegates advisory lock 81 to pipeline.withAdvisoryLock — Phase 2 migration (spec 47 §5)', () => {
    // Phase 2: hand-rolled lockClient + SIGTERM boilerplate replaced with SDK helper.
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 81/);
    expect(content).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
    // Must NOT hand-roll — any direct lock call bypasses the spec helper
    expect(content).not.toMatch(/pg_try_advisory_lock/);
    expect(content).not.toMatch(/pg_advisory_unlock/);
    // Must NOT install its own SIGTERM — helper handles it
    expect(content).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });

  it('wraps the multi-batch UPDATE loop in a single withTransaction (WF3-03 PR-B / H-W2 / 81-W1)', () => {
    // Crash mid-loop used to leave trade_forecasts in mixed-vintage state
    // (some rows had this run's scores, others had yesterday's). The full
    // batch sequence now runs inside one transaction — crash → rollback.
    expect(content).toMatch(/pipeline\.withTransaction/);
    // Regression anchor: the inner UPDATE inside the for-loop must NOT
    // bypass the transaction by going to pool.query.
    expect(content).not.toMatch(
      /for \(let i = 0[\s\S]{0,200}await pool\.query\(\s*`UPDATE trade_forecasts/,
    );
  });
});

// ── WF3-09 spec 47 compliance tests (added as failing tests before fixes) ──

describe('scripts/compute-opportunity-scores.js — spec 47 compliance (WF3-09)', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(path.resolve(__dirname, '../..', 'scripts/compute-opportunity-scores.js'), 'utf-8');
  });

  it('has correct SPEC LINK pointing to spec 81 (not lifecycle report)', () => {
    expect(content).toMatch(/SPEC LINK:.*81_opportunity_score_engine\.md/);
    expect(content).not.toMatch(/SPEC LINK:.*lifecycle_phase_implementation/);
  });

  it('validates logicVars with Zod schema via validateLogicVars (spec 47 §4)', () => {
    expect(content).toMatch(/validateLogicVars/);
    expect(content).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(content).toMatch(/los_base_divisor/);
    expect(content).toMatch(/los_base_cap/);
  });

  it('guards parseFloat multipliers with Number.isFinite to prevent NaN scores (spec 47 §4)', () => {
    expect(content).toMatch(/Number\.isFinite/);
  });

  it('uses streamQuery for the unbounded trade_forecasts JOIN — not pool.query (spec 47 §6.1)', () => {
    expect(content).toMatch(/pipeline\.streamQuery/);
    // The main scoring stream must use streamQuery. F.3 introduced bounded pool.query
    //   side-observers (deploy-age startup + CRIT-A integrity probe with LIMIT) — those
    //   are bounded reads and acceptable per spec §6.1. The negative regex now scopes to
    //   "pool.query against the FULL scoring SQL (with all four JOINs and no LIMIT)".
    expect(content).not.toMatch(
      /await pool\.query\(`[\s\S]{0,100}trade_forecasts tf[\s\S]{0,500}LEFT JOIN cost_estimates[\s\S]{0,300}LEFT JOIN lead_analytics[\s\S]{0,300}LEFT JOIN trade_configurations/,
    );
  });

  it('includes a real audit_table in emitSummary — not the UNKNOWN auto-stub (spec 47 §8.2)', () => {
    expect(content).toMatch(/audit_table/);
    // spec §8.2 mandatory rows for "Score engine" type
    expect(content).toMatch(/records_scored/);
    expect(content).toMatch(/records_unchanged/);
    expect(content).toMatch(/null_input_rate/);
    expect(content).toMatch(/out_of_range/);
  });

  it('uses pipeline.maxRowsPerInsert(3) for BATCH_SIZE — not hardcoded 1000 (spec 47 §6.2)', () => {
    // F.3: lead_id rekey reduces VALUES tuple from 4 cols (permit_num, revision_num, trade_slug, score)
    //   to 3 cols (lead_id, trade_slug, score). maxRowsPerInsert helper recalculates to 21845.
    //   v4 HIGH-v2-I: capped at 21000 (3% safety margin) — see Math.min in implementation.
    expect(content).toMatch(/maxRowsPerInsert\(3\)/);
    expect(content).not.toMatch(/const BATCH_SIZE = 1000/);
  });

  it('accumulates result.rowCount not batch.length for records_updated (spec §7 #5)', () => {
    // F.3: per-branch dual-UPDATE uses local `r.rowCount` per branch loop.
    expect(content).toMatch(/\.rowCount\s*\?\?\s*0/);
    // The old pattern that overcounts
    expect(content).not.toMatch(/updated \+= batch\.length/);
  });

  it('filters with NULL-safe urgency clause (spec §7 #6)', () => {
    expect(content).toMatch(/urgency IS NULL OR/);
    // The old clause that excludes NULL urgency leads must be gone
    expect(content).not.toMatch(/urgency NOT IN \('expired'\)/);
  });
});

// ── WF3-11 spec 47 §12 compliance tests ──

describe('scripts/compute-opportunity-scores.js — spec 47 §12 compliance (WF3-11)', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/compute-opportunity-scores.js'),
      'utf-8',
    );
  });

  it('handles lock-held path: checks lockResult.acquired and emits skip meta (spec 47 §5)', () => {
    // Rich SKIP path (skipEmit:false): script emits custom summary with audit_table,
    // then emitMeta. Helper suppresses its own SKIP emit on opts.skipEmit:false.
    expect(content).toMatch(/lockResult\.acquired/);
    expect(content).toMatch(/skipEmit\s*:\s*false/);
    expect(content).toMatch(/advisory_lock_held_elsewhere/);
  });

  it('captures RUN_AT from DB at startup — MANDATORY skeleton §R3.5 (spec 47 §14.1)', () => {
    // Required by the pipeline skeleton even when no timestamp column is written.
    // Documents run identity and prevents Midnight Cross on any future timestamp writes.
    // Accepts either the old inline pattern or the new SDK helper (pipeline.getDbTimestamp).
    expect(content).toMatch(/RUN_AT/);
    const hasInlineNow = /SELECT NOW\(\) AS now/.test(content);
    const hasSdkHelper = /pipeline\.getDbTimestamp\s*\(/.test(content);
    expect(hasInlineNow || hasSdkHelper,
      'Must capture RUN_AT via SELECT NOW() inline or pipeline.getDbTimestamp()'
    ).toBe(true);
  });

  it('flushes scores per-batch during streaming — no global updates[] accumulator (spec 47 §6.2)', () => {
    // The old pattern accumulated ALL rows into `const updates = []` before any writes,
    // loading the entire 2.5M row trade_forecasts join into Node heap and defeating
    // the memory-backpressure benefit of streamQuery.
    // Fix: flush each batch immediately inside the for-await loop.
    expect(content).not.toMatch(/const updates = \[\]/);
    // Regression anchor: the flush must happen inside the streaming loop
    expect(content).toMatch(/batch\.length >= BATCH_SIZE/);
  });

  it('reads score tier thresholds from logicVars — no hardcoded 80/50/20 in SQL (WF3-E15)', () => {
    // E15: score_tier_elite, score_tier_strong, score_tier_moderate externalized to logic_variables.
    expect(content).toMatch(/vars\.score_tier_elite/);
    expect(content).toMatch(/vars\.score_tier_strong/);
    expect(content).toMatch(/vars\.score_tier_moderate/);
    // Hardcoded values must be gone from the CASE expression
    expect(content).not.toMatch(/opportunity_score >= 80 THEN 'elite'/);
    expect(content).not.toMatch(/opportunity_score >= 50 THEN 'strong'/);
    expect(content).not.toMatch(/opportunity_score >= 20 THEN 'moderate'/);
  });
});

// ── WF1 asymptotic decay + NULL guard + los_decay_divisor (spec 81 §3 + §4) ──

describe('scripts/compute-opportunity-scores.js — asymptotic decay + NULL guard (WF1 April 2026)', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/compute-opportunity-scores.js'),
      'utf-8',
    );
  });

  it('LOGIC_VARS_SCHEMA uses z.coerce.number() for all fields — pg returns DECIMAL as string (WF3 April 2026)', () => {
    // The node-postgres driver returns DECIMAL/NUMERIC columns as strings to prevent
    // float64 precision loss. z.number() rejects strings → instant 871ms Zod crash.
    // z.coerce.number() coerces strings to numbers before validation, making it safe
    // regardless of whether config-loader's parseFloat already converted the value.
    expect(content).toMatch(/los_decay_divisor\s*:\s*z\.coerce\.number\(\)\.finite\(\)\.positive\(\)/);
    // All required numeric fields must use coerce — not z.number() directly
    expect(content).not.toMatch(/los_base_divisor\s*:\s*z\.number\(\)/);
    expect(content).not.toMatch(/los_decay_divisor\s*:\s*z\.number\(\)/);
    expect(content).not.toMatch(/score_tier_elite\s*:\s*z\.number\(\)/);
  });

  it('uses asymptotic decay formula — divides by (1 + decayFactor) not subtracts penalty (spec 81 §3)', () => {
    // New formula: raw = (base * urgencyMultiplier) / (1 + decayFactor)
    expect(content).toMatch(/\(1 \+ decayFactor\)/);
    expect(content).toMatch(/decayFactor\s*=/);
    // Old linear subtraction pattern must be gone
    expect(content).not.toMatch(/\(base \* urgencyMultiplier\) - competitionPenalty/);
    expect(content).not.toMatch(/raw\s*=\s*\(base \* \w+\) - \w*[Pp]enalty/);
  });

  it('derives decayFactor from vars.los_decay_divisor — not a hardcoded constant (spec 81 §3)', () => {
    expect(content).toMatch(/decayFactor\s*=\s*rawPenalty\s*\/\s*vars\.los_decay_divisor/);
  });

  it('NULL guard: sets score = null when estimated_cost is null or trade_contract_values is empty (spec 81 §3)', () => {
    expect(content).toMatch(/hasNoCostData/);
    expect(content).toMatch(/estimated_cost\s*==\s*null/);
    expect(content).toMatch(/Object\.keys\(tradeValues\)\.length\s*===\s*0/);
    // When null guard fires, score must be null (not 0)
    expect(content).toMatch(/score\s*=\s*null/);
  });

  it('nullInputScores counter is declared and incremented only in the NULL guard branch (spec 81 §4)', () => {
    // F.3: per-branch counter split — nullInputScoresPermit + nullInputScoresCoa.
    expect(content).toMatch(/nullInputScoresPermit/);
    expect(content).toMatch(/nullInputScoresCoa/);
    // Counter must be incremented inside the NULL-guard branch.
    expect(content).toMatch(/nullInputScoresPermit\+\+/);
    expect(content).toMatch(/nullInputScoresCoa\+\+/);
  });

  it('integrity audit (integrityFlags per-branch) runs regardless of cost data availability (spec 81 §3)', () => {
    // F.3: per-branch counters integrityFlagsPermit + integrityFlagsCoa.
    // The integrity check must appear BEFORE the hasNoCostData CONDITIONAL in source order
    //   (using `const hasNoCostData` as the anchor, not the comment mention earlier in the orphan-check block).
    const integrityIdx = content.indexOf('integrityFlagsPermit++');
    const nullGuardIdx = content.indexOf('const hasNoCostData');
    expect(integrityIdx).toBeGreaterThan(-1);
    expect(nullGuardIdx).toBeGreaterThan(-1);
    expect(integrityIdx).toBeLessThan(nullGuardIdx);
  });

  it('null_scores audit row has status INFO — not WARN (nulls are intentional, spec 81 §4)', () => {
    // null_scores is now INFO because NULLs are a deliberate signal (missing cost data)
    // not an anomaly. The old WARN path is removed.
    expect(content).toMatch(/metric:\s*['"]null_scores['"][\s\S]{0,100}status:\s*['"]INFO['"]/);
    // The old conditional WARN/PASS pattern must be gone
    expect(content).not.toMatch(/nullScores > 0\s*\?\s*['"]WARN['"]\s*:\s*['"]PASS['"]/);
  });

  it('null_input_scores row present in audit_table with status INFO (spec 81 §4)', () => {
    expect(content).toMatch(/metric:\s*['"]null_input_scores['"]/);
    expect(content).toMatch(/null_input_scores[\s\S]{0,100}status:\s*['"]INFO['"]/);
  });

  it('null_input_scores is included in records_meta for pipeline telemetry (spec 81 §4)', () => {
    // F.3: records_meta exposes per-branch null_input_scores (nullInputScoresPermit + _Coa)
    //   for operator visibility into the dimension that drove the NULL classification.
    expect(content).toMatch(/null_input_scores_permit\s*:\s*nullInputScoresPermit/);
    expect(content).toMatch(/null_input_scores_coa\s*:\s*nullInputScoresCoa/);
  });
});

// ── WF3 production crash fixes ──────────────────────────────────────────────

describe('scripts/compute-opportunity-scores.js — WF3 crash fixes', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/compute-opportunity-scores.js'),
      'utf-8',
    );
  });

  it('has los_decay_divisor ??= 25 backstop before Zod validation (WF3-B1A)', () => {
    // If migration 102 not applied AND container image predates seeds.json update,
    // vars.los_decay_divisor is undefined → Zod .positive() rejects → 1-second crash.
    // The ??= backstop prevents this without silencing legitimate DB values.
    expect(content).toMatch(/vars\.los_decay_divisor\s*\?\?=\s*25/);
  });

  it('NULL guard uses !tradeValues not tradeValues == null (WF3-B1B)', () => {
    // !tradeValues catches null, undefined, and any other falsy value from the
    // pg JSONB driver without relying on == null short-circuit ordering.
    expect(content).toMatch(/!tradeValues/);
    expect(content).not.toMatch(/tradeValues\s*==\s*null/);
  });
});

// ── WF3 2026-05-08 — Realtor financial-base carve-out ──────────────────────
// 🔗 SPEC LINK: docs/specs/01-pipeline/81_opportunity_score_engine.md §3
//             docs/specs/03-mobile/91_mobile_lead_feed.md §3.5
//             docs/specs/03-mobile/95_mobile_user_profiles.md §2.5.1
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §10.2
//
// Realtors don't bid on a trade contract — they prospect for listings. The
// cost slicer (compute-cost-estimates.js) doesn't allocate to realtor, so
// `trade_contract_values['realtor']` is always undefined → tradeValue=0
// → score=0 across 84K forecast rows after mig 118 wired realtor in.
//
// Fix: realtor uses the TOTAL `estimated_cost` as its financial base
// (renovation cost is the listing-likelihood signal, per user 2026-05-08).
// Branches on `trade_slug === 'realtor'` (NOT account_preset, per Spec 95
// §2.5.1) and reuses the existing REALTOR_TRADE_SLUG constant from
// scripts/lib/pipeline-realtor-availability.js (Spec 47 §10.2).
describe('scripts/compute-opportunity-scores.js — realtor financial-base carve-out (WF3 2026-05-08)', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/compute-opportunity-scores.js'),
      'utf-8',
    );
  });

  it('imports REALTOR_TRADE_SLUG from pipeline-realtor-availability (no magic string)', () => {
    // Spec 47 §10.2 — shared enum vocabulary. The constant already exists in
    // scripts/lib/pipeline-realtor-availability.js; re-use it instead of
    // hardcoding 'realtor' in this script too.
    expect(content).toMatch(/REALTOR_TRADE_SLUG/);
    expect(content).toMatch(
      /require\(\s*['"]\.\/lib\/pipeline-realtor-availability['"]\s*\)/,
    );
  });

  it('branches financial base on trade_slug (not account_preset) — Spec 95 §2.5.1 compliant', () => {
    // Spec 95 §2.5.1 explicitly REJECTS branching on account_preset. The
    // canonical algorithmic axis is trade_slug, set immutably at onboarding.
    expect(content).toMatch(/trade_slug\s*===\s*REALTOR_TRADE_SLUG/);
    // Negative regression-lock — must NOT branch on account_preset in code.
    // Scoped to non-comment lines so a future clarifying comment like
    // "// NOT account_preset — see Spec 95 §2.5.1" doesn't trip the test.
    const codeOnly = content
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/account_preset/);
  });

  it('realtor uses estimated_cost as tradeValue (no per-trade slice required)', () => {
    // Realtor's financial base is the total project cost, not a sliced
    // portion — the cost slicer doesn't allocate to realtor.
    // The fix should produce a path where, when trade_slug is realtor,
    // tradeValue resolves to row.estimated_cost rather than
    // tradeValues[trade_slug].
    expect(content).toMatch(/isRealtor[\s\S]{0,80}estimated_cost/);
  });

  it('realtor with NULL estimated_cost still yields NULL score (Spec 81 §3 NULL semantics preserved)', () => {
    // Spec 81 §3 line 73: "0 means 'real value, fully competed'. NULL means
    // 'no cost data'." The carve-out must not silently flip realtor NULL-cost
    // rows to 0 — the NULL guard (`row.estimated_cost == null`) must still
    // route to `score = null` for realtor too.
    expect(content).toMatch(/row\.estimated_cost\s*==\s*null/);
    // The realtor-aware guard relaxes the trade_contract_values check ONLY
    // when isRealtor — non-realtor rows still require a populated JSONB.
    expect(content).toMatch(/!isRealtor[\s\S]{0,120}!tradeValues/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Phase F.3 — lead_id rekey + CoA consumer (v4 — 23 v3 folds applied)
// SPEC LINK: docs/specs/01-pipeline/81_opportunity_score_engine.md §2.1
// ════════════════════════════════════════════════════════════════════════════
describe('compute-opportunity-scores.js — Phase F.3 lead_id rekey + CoA consumer', () => {
  const content = read('scripts/compute-opportunity-scores.js');

  // ── SOURCE_SQL shape (T01-T07) ──────────────────────────────────────────
  it('F.3-1: SOURCE_SQL projects tf.lead_id as the canonical key (Spec 81 §2.1)', () => {
    expect(content).toMatch(/SELECT[\s\S]{0,500}tf\.lead_id\b/);
  });

  it('F.3-2: SOURCE_SQL JOINs ce.lead_id = tf.lead_id (mig 145 PK)', () => {
    expect(content).toMatch(/LEFT\s+JOIN\s+cost_estimates\s+ce[\s\S]{0,80}ce\.lead_id\s*=\s*tf\.lead_id/);
    // Negative grep: no remnants of legacy permit_num/revision_num JOIN on cost_estimates
    expect(content).not.toMatch(/ce\.permit_num\s*=\s*tf\.permit_num/);
  });

  it('F.3-3: SOURCE_SQL projects ce.lead_id AS ce_lead_id (CRIT-v1-F orphan discriminant)', () => {
    expect(content).toMatch(/ce\.lead_id\s+AS\s+ce_lead_id/i);
  });

  it('F.3-4: lead_analytics JOIN uses la.lead_key = tf.lead_id (F.2 UNION + mig 132 trigger alignment)', () => {
    expect(content).toMatch(/LEFT\s+JOIN\s+lead_analytics\s+la[\s\S]{0,80}la\.lead_key\s*=\s*tf\.lead_id/);
    // Negative grep: no legacy `'permit:' || ... LPAD(...)` construction
    expect(content).not.toMatch(/'permit:'\s*\|\|\s*tf\.permit_num/);
  });

  it('F.3-5: BATCH_SIZE uses Math.min(maxRowsPerInsert(3), 21000) for 3% safety margin (HIGH-v2-I)', () => {
    expect(content).toMatch(/maxRowsPerInsert\(3\)/);
    expect(content).toMatch(/Math\.min\(pipeline\.maxRowsPerInsert\(3\)\s*,\s*21000\)/);
    // Sanity check: 21000 × 3 = 63000 ≤ 65535 PostgreSQL parameter ceiling.
    expect(3 * 21000).toBeLessThanOrEqual(65535);
  });

  it('F.3-6: VALUES tuple is (lead_id, trade_slug, score) — 3 columns', () => {
    expect(content).toMatch(/v\(lead_id,\s*trade_slug,\s*score\)/);
  });

  it('F.3-7: UPDATE WHERE uses 2-col PK (lead_id + trade_slug) — mig 151 shape', () => {
    expect(content).toMatch(/WHERE\s+tf\.lead_id\s*=\s*v\.lead_id\s+AND\s+tf\.trade_slug\s*=\s*v\.trade_slug/);
    // Negative grep: zero references to legacy 3-col WHERE
    expect(content).not.toMatch(/WHERE\s+tf\.permit_num\s*=\s*v\.permit_num/);
  });

  // ── Module-scope helper (T08-T10) ──────────────────────────────────────
  it('F.3-8: parseBranchFromLeadId is defined at module scope (BEFORE pipeline.run — vm sandbox requirement)', () => {
    const helperIdx = content.indexOf('function parseBranchFromLeadId');
    const runIdx = content.indexOf("pipeline.run('compute-opportunity-scores'");
    expect(helperIdx).toBeGreaterThan(0);
    expect(helperIdx).toBeLessThan(runIdx);
  });

  it('F.3-9: parseBranchFromLeadId uses regex /^(coa|permit):/ (HIGH-v1-G ambiguity safety)', () => {
    expect(content).toMatch(/leadId\.match\(\/\^\(coa\|permit\):\//);
  });

  // ── flushBatch dual-UPDATE (T11-T14) ───────────────────────────────────
  it('F.3-10: flushBatch splits into permitBatch + coaBatch arrays before per-branch UPDATE (HIGH-J)', () => {
    expect(content).toMatch(/const\s+permitBatch\s*=\s*currentBatch\.filter[\s\S]{0,80}branch\s*===\s*['"]permit['"]/);
    expect(content).toMatch(/const\s+coaBatch\s*=\s*currentBatch\.filter[\s\S]{0,80}branch\s*===\s*['"]coa['"]/);
  });

  it('F.3-11: flushBatch builds independent $1..$3N parameter arrays per branch (HIGH-J)', () => {
    // Two separate `for (let j = 0; j < permitBatch.length...)` and `coaBatch.length` loops
    expect(content).toMatch(/for\s*\(\s*let\s+j\s*=\s*0;\s*j\s*<\s*permitBatch\.length;\s*j\+\+\s*\)/);
    expect(content).toMatch(/for\s*\(\s*let\s+j\s*=\s*0;\s*j\s*<\s*coaBatch\.length;\s*j\+\+\s*\)/);
  });

  it('F.3-12: Counter accumulation happens AFTER withTransaction resolves (HIGH-I retry safety)', () => {
    // pRowCount/cRowCount declared as let before the await, accumulated AFTER the await resolves.
    expect(content).toMatch(/let\s+pRowCount\s*=\s*0[\s\S]{0,80}let\s+cRowCount\s*=\s*0[\s\S]{0,4000}await\s+pipeline\.withTransaction[\s\S]{0,4000}updatedPermit\s*\+=\s*pRowCount/);
    expect(content).toMatch(/updatedCoa\s*\+=\s*cRowCount/);
  });

  it('F.3-13: Per-branch counters declared (totalRows/nullInputScores/integrityFlags/updated/orphaned + malformed)', () => {
    expect(content).toMatch(/let\s+totalRowsPermit\s*=\s*0/);
    expect(content).toMatch(/let\s+totalRowsCoa\s*=\s*0/);
    expect(content).toMatch(/let\s+totalRowsOther\s*=\s*0/);
    expect(content).toMatch(/let\s+nullInputScoresPermit\s*=\s*0/);
    expect(content).toMatch(/let\s+nullInputScoresCoa\s*=\s*0/);
    expect(content).toMatch(/let\s+integrityFlagsPermit\s*=\s*0/);
    expect(content).toMatch(/let\s+integrityFlagsCoa\s*=\s*0/);
    expect(content).toMatch(/let\s+updatedPermit\s*=\s*0/);
    expect(content).toMatch(/let\s+updatedCoa\s*=\s*0/);
    expect(content).toMatch(/let\s+orphanedPermitCost\s*=\s*0/);
    expect(content).toMatch(/let\s+orphanedCoaCost\s*=\s*0/);
    expect(content).toMatch(/let\s+malformedLeadIds\s*=\s*0/);
    expect(content).toMatch(/let\s+batchCount\s*=\s*0/);   // LOW-v3-H
  });

  // ── CRIT-A defensive integrity probe (T15-T18) ─────────────────────────
  it('F.3-14: CRIT-A probe uses EXISTS + LIMIT 50 sample form (HIGH-v2-H — NOT full COUNT(*))', () => {
    expect(content).toMatch(/SELECT\s+EXISTS\([\s\S]{0,300}LIMIT\s+1/i);
    expect(content).toMatch(/LIMIT\s+50/);
    // Negative grep: no unbounded COUNT(*) over trade_forecasts × lead_analytics
    expect(content).not.toMatch(/SELECT\s+COUNT\(\*\)::int\s+AS\s+unmatched_permit_count[\s\S]{0,200}FROM\s+trade_forecasts\s+tf[\s\S]{0,200}LEFT\s+JOIN\s+lead_analytics\s+la[\s\S]{0,300}WHERE\s+tf\.lead_id\s+LIKE\s+'permit:%'/i);
  });

  it('F.3-15: CRIT-A probe is symmetric across permit + CoA branches (HIGH-v2-J extension)', () => {
    // Iterates over both branches OR runs the probe twice (once per branch).
    expect(content).toMatch(/permitDriftSampleCount/);
    expect(content).toMatch(/coaDriftSampleCount/);
  });

  it('F.3-16: CRIT-A probe log gating — INFO during inQuietPeriod, WARN after (HIGH-v3-C never silent)', () => {
    // `if (inQuietPeriod) pipeline.log.info(...); else pipeline.log.warn(...);` pattern.
    expect(content).toMatch(/inQuietPeriod\s*\?\s*pipeline\.log\.info[\s\S]{0,100}pipeline\.log\.warn|if\s*\(\s*inQuietPeriod\s*\)\s*pipeline\.log\.info[\s\S]{0,300}else[\s\S]{0,100}pipeline\.log\.warn/);
  });

  it('F.3-17: CRIT-A probe log message includes "at least N (sample capped at 50)" wording (Gemini NIT)', () => {
    expect(content).toMatch(/at least \$\{[\w.]+\}\s+rows\s+with\s+no\s+matching\s+lead_analytics\s+row\s+\(sample\s+capped\s+at\s+50/);
  });

  // ── Audit rows + WARN gating (T18-T21) ──────────────────────────────────
  it('F.3-18: total_rows_coa audit row WARN-when-zero post-quiet (HIGH-v2-N functional CRIT-C)', () => {
    expect(content).toMatch(/metric:\s*['"]total_rows_coa['"]/);
    // Status logic: inQuietPeriod ? INFO : (totalRowsCoa === 0 ? WARN : INFO)
    expect(content).toMatch(/totalRowsCoa\s*===\s*0\s*\?\s*['"]WARN['"]/);
  });

  it('F.3-19: malformed_lead_ids WARN immediately (NOT quiet-gated — MED-v3-G corruption-class)', () => {
    expect(content).toMatch(/metric:\s*['"]malformed_lead_ids['"]/);
    // Status is WARN whenever value > 0, regardless of inQuietPeriod.
    expect(content).toMatch(/malformedLeadIds\s*>\s*0\s*\?\s*['"]WARN['"]/);
  });

  it('F.3-20: 17 audit rows total (7 preserved + 10 new — CRIT-v2-D recount)', () => {
    // Count metric entries in audit_table.rows via regex.
    const matches = content.match(/metric:\s*['"][a-zA-Z_]+['"]/g) ?? [];
    // Filter to only those inside auditTableRows array (heuristic: between auditTableRows declaration and emitSummary)
    const auditStart = content.indexOf('const auditTableRows');
    const auditEnd = content.indexOf('const auditVerdict');
    expect(auditStart).toBeGreaterThan(-1);
    expect(auditEnd).toBeGreaterThan(auditStart);
    const auditSection = content.slice(auditStart, auditEnd);
    const auditMetricMatches = auditSection.match(/metric:\s*['"][a-zA-Z_]+['"]/g) ?? [];
    expect(auditMetricMatches.length).toBe(17);
  });

  it('F.3-21: LEGACY permits_in_scope_legacy_distinct_count audit row present (MED-v2-P dual-emit)', () => {
    expect(content).toMatch(/metric:\s*['"]permits_in_scope_legacy_distinct_count['"]/);
  });

  it('F.3-22: New audit rows present (forecasts_in_scope_*/orphan/probe/grace/quiet/malformed/total_rows_coa)', () => {
    expect(content).toMatch(/metric:\s*['"]forecasts_in_scope_permit['"]/);
    expect(content).toMatch(/metric:\s*['"]forecasts_in_scope_coa['"]/);
    expect(content).toMatch(/metric:\s*['"]coa_orphaned_cost_count['"]/);
    expect(content).toMatch(/metric:\s*['"]permit_orphaned_cost_count['"]/);
    expect(content).toMatch(/metric:\s*['"]lead_analytics_unmatched_permit_count['"]/);
    expect(content).toMatch(/metric:\s*['"]lead_analytics_unmatched_coa_count['"]/);
    expect(content).toMatch(/metric:\s*['"]coa_first_deploy_grace['"]/);
    expect(content).toMatch(/metric:\s*['"]in_quiet_period['"]/);
  });

  // ── records_total + records_scored semantics (T23) ──────────────────────
  it('F.3-23: records_total = totalRowsPermit + totalRowsCoa + totalRowsOther (CRIT-v2-B §11.1)', () => {
    expect(content).toMatch(/records_total:\s*totalRowsPermit\s*\+\s*totalRowsCoa\s*\+\s*totalRowsOther/);
  });

  it('F.3-24: records_scored = totalRowsPermit + totalRowsCoa ONLY — excludes malformed (MED-v3-D)', () => {
    // Validate the LOCAL `recordsScored` variable assignment is the 2-term sum, and
    //   the audit row sources its value from that local. Malformed rows (totalRowsOther)
    //   are `continue`'d and never scored — must not be in records_scored value source.
    expect(content).toMatch(/const\s+recordsScored\s*=\s*totalRowsPermit\s*\+\s*totalRowsCoa\s*;/);
    expect(content).toMatch(/metric:\s*['"]records_scored['"][\s\S]{0,100}value:\s*recordsScored/);
    // Negative: the records_scored value source must not include the malformed counter.
    expect(content).not.toMatch(/const\s+recordsScored\s*=\s*totalRowsPermit\s*\+\s*totalRowsCoa\s*\+\s*totalRowsOther/);
  });

  // ── Deploy-age startup (T25) ────────────────────────────────────────────
  it('F.3-25: Deploy-age slug is permits:compute_opportunity_scores (manifest-key form, NOT hyphenated)', () => {
    expect(content).toMatch(/pipeline\s*=\s*['"]permits:compute_opportunity_scores['"]/);
  });

  it('F.3-26: SQL aliases describe COUNT direction (runs_older_than_7d/_30d per MED-v2-T)', () => {
    expect(content).toMatch(/AS\s+runs_older_than_7d/);
    expect(content).toMatch(/AS\s+runs_older_than_30d/);
  });

  // ── failed_sample proportional cap (T27) ────────────────────────────────
  it('F.3-27: failed_sample uses per-type proportional cap (MED-v3-F: 7+7+6 then slice(0, 20))', () => {
    expect(content).toMatch(/orphanedPermitCostSample\.slice\(0,\s*7\)/);
    expect(content).toMatch(/orphanedCoaCostSample\.slice\(0,\s*7\)/);
    expect(content).toMatch(/malformedLeadIdsSample\.slice\(0,\s*6\)/);
  });

  it('F.3-28: failed_sample conditional spread (Spec 48 §4 "absent when empty")', () => {
    expect(content).toMatch(/\.\.\.\(failedSample\s*&&\s*\{\s*failed_sample(:\s*failedSample)?\s*\}\)/);
  });

  // ── emitMeta declarations (T29) ─────────────────────────────────────────
  it('F.3-29: emitMeta reads include pipeline_runs (deploy-age query) and cost_estimates.lead_id', () => {
    expect(content).toMatch(/pipeline_runs:\s*\[['"]pipeline['"]\s*,\s*['"]started_at['"]\]/);
    expect(content).toMatch(/cost_estimates:\s*\[['"]lead_id['"]/);
  });

  // ── Negative grep + integrity log gating (T30) ──────────────────────────
  it('F.3-30: Zero permit_lead_id references (#118 standardization) AND integrity log inQuietPeriod-gated (Obs F2)', () => {
    expect(content).not.toMatch(/permit_lead_id/);
    // Pre-existing integrity log (was `pipeline.log.warn` unconditional) now uses inQuietPeriod gate.
    expect(content).toMatch(/totalIntegrityFlags[\s\S]{0,200}inQuietPeriod[\s\S]{0,200}pipeline\.log\.info[\s\S]{0,200}pipeline\.log\.warn/);
  });

  // Diff-stage fold (Independent CRIT-v3-Z + H1): regression-lock the records_meta entry count
  //   to prevent future silent drift. Count: 16 F.3-new + 4 preserved = 20 (excluding `audit_table`
  //   which is the wrapper key, per F.1/F.2 convention).
  it('F.3-31: records_meta has exactly 20 data keys (16 F.3-new + 4 preserved) — diff CRIT-v3-Z guard', () => {
    // Slice between `records_meta: {` and its paired closing brace.
    const metaStart = content.indexOf('records_meta: {');
    expect(metaStart).toBeGreaterThan(-1);
    // Find the matching closing brace by counting depth.
    let depth = 0;
    let metaEnd = -1;
    for (let i = metaStart + 'records_meta: '.length; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) { metaEnd = i; break; }
      }
    }
    expect(metaEnd).toBeGreaterThan(-1);
    const metaBlock = content.slice(metaStart, metaEnd + 1);
    // Top-level keys are at indentation depth 6 (3 levels × 2 spaces): the records_meta object
    //   is inside emitSummary({records_meta: { ... }}). Match identifier: at start-of-line whitespace
    //   followed by `<name>:` where name is one of the documented entries.
    //
    // Use a more robust approach: parse depth-1 properties (those at the immediate level of the
    //   records_meta object). Match the pattern `^      [a-zA-Z_]+:` (6 spaces indent for level-1).
    const topLevelKeys = (metaBlock.match(/^      [a-zA-Z_][a-zA-Z_0-9]*\s*:/gm) ?? []);
    // Subtract 1 for `audit_table` (counted as wrapper per F.1/F.2 convention).
    const dataKeyCount = topLevelKeys.length - 1;
    expect(dataKeyCount).toBe(20);
  });
});

