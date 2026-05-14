// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 12 + §6.6.D + §6.8 row 668
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//             docs/specs/01-pipeline/48_pipeline_observability.md §3 (downstream observer consumes audit_table)
//             docs/specs/01-pipeline/83_lead_cost_model.md §Geometric-Only Path for CoA
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (TS↔JS dual-path — N/A here; pipeline runner only)
//
// WF1 R5.5 (2026-05-14): SQL-string + Spec-47-skeleton regression-lock for
// scripts/compute-coa-cost-estimates.js — the CoA-side cost estimator that
// consumes lead_parcels + parcel_buildings + lead_trades + scope_tags via the
// R5.1 substrate (`scripts/lib/coa-cost-model.js`) + Brain
// (`src/features/leads/lib/cost-model-shared.js`).
//
// Locks in the 14 plan-review folds (4-reviewer convergence):
//   #1 R5.1 substrate field-name fix (locked-in via coa-cost-model.logic.test.ts)
//   #2 R5.1 substrate coverage-ratios (locked-in via coa-cost-model.logic.test.ts)
//   #3 percentile via PERCENTILE_CONT post-run query (this file)
//   #4 ORDER BY building_id ASC in LATERAL (this file)
//   #5 R5.1 substrate dead-flag removal (locked-in via coa-cost-model.logic.test.ts)
//   #6 null_cost_reasons restructured (this file)
//   #7 coverage_pct N/A when processed=0 (this file)
//   #8 cost_source + is_geometric_override transform (this file)
//   #9 drop ::text casts on JSONB IS DISTINCT FROM (this file)
//   #10 column count 16 + BATCH_SIZE (this file)
//   #11 records_new/_updated cost_estimates semantics + coa_applications_updated INFO row (this file)
//   #12 corrected checklist (l) cursor semantics (verified by cursor predicate test)
//   #13 coa_cost_coverage_threshold_pct logic_var seed (this file)
//   #14 --dry-run / --limit CLI flags (this file)
//

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/compute-coa-cost-estimates.js');

describe('compute-coa-cost-estimates.js — Spec 47 §R1-R12 skeleton', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('SPEC LINK header present', () => {
    expect(src).toMatch(/SPEC LINK:\s*docs\/specs\/01-pipeline\/42_chain_coa\.md/i);
  });

  it('§R1 — imports the pipeline SDK', () => {
    expect(src).toMatch(/require\(['"]\.\/lib\/pipeline['"]\)/);
  });

  it('§R1 — imports the R5.1 substrate (buildCoaConfig + mapCoaRowToBrainInput)', () => {
    expect(src).toMatch(/require\(['"]\.\/lib\/coa-cost-model['"]\)/);
  });

  it('§R1 — imports the Brain (estimateCostShared)', () => {
    expect(src).toMatch(/estimateCostShared/);
    expect(src).toMatch(/cost-model-shared/);
  });

  it('§R2 — declares advisory lock ID 4204 (Spec 42 §6.8 Phase D allocation)', () => {
    expect(src).toMatch(/(?:const|let)\s+ADVISORY_LOCK_ID\s*=\s*4204\b/);
  });

  it('§R3 — uses pipeline.run() entrypoint with slug "compute-coa-cost-estimates"', () => {
    expect(src).toMatch(/pipeline\.run\(['"]compute-coa-cost-estimates['"]/);
  });

  it('§R3.5 — captures DB clock via pipeline.getDbTimestamp', () => {
    expect(src).toMatch(/pipeline\.getDbTimestamp\(/);
  });

  it('§R3.5 (Self-checklist n) — RUN_AT captured BEFORE withAdvisoryLock', () => {
    const runAtIdx = src.search(/pipeline\.getDbTimestamp\(/);
    const lockIdx = src.search(/pipeline\.withAdvisoryLock\(/);
    expect(runAtIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(runAtIdx).toBeLessThan(lockIdx);
  });

  it('§R4 — Zod logic_vars validation includes coa_cost_coverage_threshold_pct (fold #13)', () => {
    expect(src).toMatch(/coa_cost_coverage_threshold_pct/);
    expect(src).toMatch(/z\.object|ConfigSchema|LOGIC_VARS_SCHEMA/);
  });

  it('§R4 (fold #2) — Zod validation includes urban_coverage_ratio + suburban_coverage_ratio', () => {
    expect(src).toMatch(/urban_coverage_ratio/);
    expect(src).toMatch(/suburban_coverage_ratio/);
  });

  it('§R6 — wraps work in pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)', () => {
    expect(src).toMatch(/pipeline\.withAdvisoryLock\(\s*pool\s*,\s*ADVISORY_LOCK_ID\b/);
  });

  it('§R7 — uses streamQuery for coa_applications source', () => {
    expect(src).toMatch(/pipeline\.streamQuery\(/);
  });

  it('§R7 — idempotency cursor: cost_classified_at IS NULL OR < trade_classified_at', () => {
    expect(src).toMatch(
      /cost_classified_at\s+IS\s+NULL[\s\S]*?cost_classified_at\s*<\s*[a-z_.]*trade_classified_at/i,
    );
  });

  it('§R9 — wraps batched writes in pipeline.withTransaction', () => {
    expect(src).toMatch(/pipeline\.withTransaction\(/);
  });

  it('§R12 — lockResult.acquired SKIP guard at end', () => {
    expect(src).toMatch(/lockResult\.acquired/);
    expect(src).toMatch(/if\s*\(\s*!\s*lockResult\.acquired\s*\)/);
  });
});

describe('compute-coa-cost-estimates.js — fold #4: deterministic parcel_buildings LATERAL', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('parcel_buildings LATERAL has ORDER BY (deterministic when multiple is_primary=true)', () => {
    // The parcel_buildings subquery selects ONE primary building; without
    // ORDER BY, PostgreSQL is free to return any row on data anomalies.
    const m = src.match(/FROM\s+parcel_buildings[\s\S]{0,300}?LIMIT\s+1/i);
    expect(m).not.toBeNull();
    expect(m?.[0]).toMatch(/ORDER\s+BY/i);
  });
});

describe('compute-coa-cost-estimates.js — fold #10: cost_estimates UPSERT with PK (lead_id)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('INSERT INTO cost_estimates exists', () => {
    expect(src).toMatch(/INSERT\s+INTO\s+cost_estimates/i);
  });

  it('ON CONFLICT (lead_id) DO UPDATE SET (post-mig-145 PK is single-column lead_id)', () => {
    expect(src).toMatch(/ON\s+CONFLICT\s*\(\s*lead_id\s*\)\s*DO\s+UPDATE\s+SET/i);
  });

  it('column list includes lead_id, permit_num (nullable), revision_num (nullable)', () => {
    const m = src.match(/INSERT\s+INTO\s+cost_estimates\s*\(([\s\S]*?)\)\s*VALUES/i);
    expect(m).not.toBeNull();
    expect(m?.[1]).toMatch(/\blead_id\b/);
    expect(m?.[1]).toMatch(/\bpermit_num\b/);
    expect(m?.[1]).toMatch(/\brevision_num\b/);
  });

  it('fold #5 (DeepSeek) — ON CONFLICT UPDATE SET includes computed_at = EXCLUDED.computed_at', () => {
    expect(src).toMatch(
      /ON\s+CONFLICT[\s\S]*?DO\s+UPDATE\s+SET[\s\S]*?computed_at\s*=\s*EXCLUDED\.computed_at/i,
    );
  });
});

describe('compute-coa-cost-estimates.js — fold #9: drop ::text casts on JSONB IS DISTINCT FROM', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('trade_contract_values IS DISTINCT FROM uses NO ::text cast (canonical JSONB comparison)', () => {
    // The twin (compute-cost-estimates.js:155) uses `trade_contract_values::text IS DISTINCT FROM ...::text`.
    // Plan-review fold #9: drop the cast — JSONB has canonical storage so direct
    // IS DISTINCT FROM compares canonically and avoids redundant casting.
    const distinctClause = src.match(
      /trade_contract_values[\s\S]{0,80}?IS\s+DISTINCT\s+FROM[\s\S]{0,80}/i,
    );
    expect(distinctClause).not.toBeNull();
    // Must NOT contain ::text cast on either side
    expect(distinctClause?.[0]).not.toMatch(/trade_contract_values::text/i);
  });
});

describe('compute-coa-cost-estimates.js — fold #11: records_new/_updated semantics + xmax tracking', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('INSERT uses RETURNING (xmax = 0) AS is_insert (Spec 47 §8.1 distinguishability)', () => {
    expect(src).toMatch(/RETURNING[\s\S]*?xmax\s*=\s*0[\s\S]*?(?:AS\s+is_insert|is_insert)/i);
  });

  it('emitSummary records_new + records_updated from xmax-derived counters', () => {
    expect(src).toMatch(/(?:records_new|recordsNew|inserts)/);
    expect(src).toMatch(/(?:records_updated|recordsUpdated|updates)/);
  });
});

describe('compute-coa-cost-estimates.js — fold #11: batched UPDATE for coa_applications cost cols', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('UPDATE coa_applications uses batched VALUES + WHERE id = v.id (NOT N+1 per-row)', () => {
    expect(src).toMatch(
      /UPDATE\s+coa_applications[\s\S]*?SET[\s\S]*?cost_classified_at[\s\S]*?FROM\s*\(\s*VALUES/i,
    );
  });

  it('coa_applications.cost_classified_at advances unconditionally (no IS DISTINCT FROM trap — WF3 BUG-5 lesson)', () => {
    // The UPDATE FROM (VALUES ...) must NOT have an IS DISTINCT FROM guard
    // on cost_classified_at — would cause infinite re-fetch when classifier
    // output unchanged but cursor predicate still fires.
    const updateBlock = src.match(/UPDATE\s+coa_applications[\s\S]*?WHERE\s+[\s\S]*?(?=\)|;)/i);
    expect(updateBlock).not.toBeNull();
    // No IS DISTINCT FROM guarding cost_classified_at
    expect(updateBlock?.[0]).not.toMatch(/cost_classified_at\s+IS\s+DISTINCT\s+FROM/i);
  });
});

describe('compute-coa-cost-estimates.js — fold #3: percentile via PostgreSQL post-run query', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('uses PERCENTILE_CONT for cost_distribution (DB-side, NOT in-process JS sort)', () => {
    expect(src).toMatch(/PERCENTILE_CONT/i);
  });

  it('percentile query runs against cost_estimates WHERE computed_at = $RUN_AT (current run only)', () => {
    expect(src).toMatch(/PERCENTILE_CONT[\s\S]{0,500}?cost_estimates[\s\S]{0,200}?computed_at/i);
  });
});

describe('compute-coa-cost-estimates.js — diff-review folds (4-reviewer)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('Gemini CRIT + W#2 L1-1: IS DISTINCT FROM guard includes model_version, cost_range_*, premium_factor, complexity_score, is_geometric_override', () => {
    const guardBlock = src.match(/WHERE\s+EXCLUDED\.estimated_cost[\s\S]*?RETURNING/i);
    expect(guardBlock).not.toBeNull();
    expect(guardBlock?.[0]).toMatch(/cost_range_low\s+IS\s+DISTINCT\s+FROM/i);
    expect(guardBlock?.[0]).toMatch(/cost_range_high\s+IS\s+DISTINCT\s+FROM/i);
    expect(guardBlock?.[0]).toMatch(/premium_factor\s+IS\s+DISTINCT\s+FROM/i);
    expect(guardBlock?.[0]).toMatch(/complexity_score\s+IS\s+DISTINCT\s+FROM/i);
    expect(guardBlock?.[0]).toMatch(/model_version\s+IS\s+DISTINCT\s+FROM/i);
    expect(guardBlock?.[0]).toMatch(/is_geometric_override\s+IS\s+DISTINCT\s+FROM/i);
  });

  it('W#2 L2-3 CRIT: mig 145 startup guard (refuses to run if cost_estimates PK not on lead_id)', () => {
    expect(src).toMatch(/cost_estimates_pkey[\s\S]{0,400}?lead_id/);
    expect(src).toMatch(/migration\s+145[\s\S]{0,200}?refusing to run/i);
  });

  it('Gemini CRIT: defensive cursor guard against future-dated trade_classified_at', () => {
    expect(src).toMatch(/ca\.trade_classified_at\s+IS\s+NULL[\s\S]{0,80}?ca\.trade_classified_at\s*<=\s*\$\d+/i);
  });

  it('W#2 L1-2 HIGH: coa_eligible status is INFO (not WARN) when processed=0', () => {
    expect(src).toMatch(/coa_eligible[\s\S]{0,400}?processed\s*>\s*0\s*\?\s*['"]PASS['"]\s*:\s*['"]INFO['"]/);
  });

  it('W#1 M3: startup guard on empty trade_sqft_rates', () => {
    expect(src).toMatch(/trade_sqft_rates\s+is\s+empty[\s\S]{0,100}?refusing to run/i);
  });

  it('DeepSeek MED: duplicate-row detection for trade_sqft_rates + scope_intensity_matrix', () => {
    expect(src).toMatch(/duplicate\s+trade_slug/i);
    expect(src).toMatch(/duplicate.*permit_type.*structure_type/i);
  });

  it('W#2 L1-3 MED: toLocaleString pinned to en-CA locale (stable trend strings)', () => {
    expect(src).toMatch(/toLocaleString\(['"]en-CA['"]\)/);
  });

  it('W#2 L2-4 MED: phase_h_gap_active INFO audit row present', () => {
    expect(src).toMatch(/phase_h_gap_active/);
  });

  it('W#2 L3-7 MED: defensive existence check on _usedFallback Brain flag', () => {
    expect(src).toMatch(/['"]_usedFallback['"]\s+in\s+brainOutput/);
  });

  it('W#2 L3-3 HIGH: null_cost_reasons_additive in records_meta (multi-blocker surfacing)', () => {
    expect(src).toMatch(/null_cost_reasons_additive/);
    expect(src).toMatch(/nullReasonsAdditive/);
  });

  it('Gemini MED: --limit parsing uses regex (rejects malformed input)', () => {
    expect(src).toMatch(/\/\^--limit=\\d\+\$\//);
  });

  it('Gemini NIT: flush trigger condition simplified to single check on coaIds.length', () => {
    // The redundant `batch.ceRows.length >= INSERT_BATCH_SIZE` second clause was removed.
    const flushTrigger = src.match(/if\s*\(\s*batch\.coaIds\.length\s*>=\s*INSERT_BATCH_SIZE[\s\S]{0,200}/);
    expect(flushTrigger).not.toBeNull();
    expect(flushTrigger?.[0]).not.toMatch(/batch\.ceRows\.length\s*>=\s*INSERT_BATCH_SIZE/);
  });
});

describe('compute-coa-cost-estimates.js — audit_table (folds #3, #6, #7, #8, #11)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('PIPELINE_SUMMARY emits audit_table', () => {
    expect(src).toMatch(/audit_table/);
  });

  it('audit_table phase: 42', () => {
    expect(src).toMatch(/phase:\s*42\b/);
  });

  it('coa_eligible WARN row (Worktree#2 IMP-1 lesson)', () => {
    expect(src).toMatch(/coa_eligible/);
  });

  it('fold #6 — restructured null_cost_reasons: no_parcel + no_scope_tags + no_active_trades + no_matching_rate', () => {
    expect(src).toMatch(/no_parcel/);
    expect(src).toMatch(/no_scope_tags/);
    expect(src).toMatch(/no_active_trades/);
    expect(src).toMatch(/no_matching_rate/);
  });

  it('fold #6 — no_building does NOT appear as a null-cost reason (lot-size fallback produces non-null cost)', () => {
    // Check the auditRows / null_cost_reasons construction does not include 'no_building'.
    // It may still appear in a separate `cost_with_fallback_pct` INFO row, but not as a null bucket.
    const nullReasonsBlock = src.match(/null_cost_reasons[\s\S]{0,800}/);
    if (nullReasonsBlock) {
      expect(nullReasonsBlock[0]).not.toMatch(/null_reason_no_building/);
    }
  });

  it('fold #6 — cost_with_fallback_pct INFO row tracks lot-size fallback rate', () => {
    expect(src).toMatch(/cost_with_fallback_pct/);
  });

  it('fold #7 — cost_estimate_coverage_pct uses N/A when processed=0 (avoid false WARN on empty cursor)', () => {
    expect(src).toMatch(/cost_estimate_coverage_pct/);
    // The audit row construction must short-circuit to 'N/A' / INFO when processed=0.
    expect(src).toMatch(/processed\s*===?\s*0|processed\s*&&|N\/A/);
  });

  it('fold #11 — coa_applications_updated INFO row tracks side-effect UPDATE count', () => {
    expect(src).toMatch(/coa_applications_updated/);
  });

  it('cost_distribution_p25_p50_p75 metric present (from fold #3 PERCENTILE_CONT)', () => {
    expect(src).toMatch(/cost_distribution_p25_p50_p75|p25.*p50.*p75/i);
  });

  it('slug_resolution_miss_count NOT in audit_table (R5.4 metric, irrelevant here — Brain handles slugs)', () => {
    // Defensive: ensure we don't paste-copy the wrong audit metric set.
    expect(src).not.toMatch(/slug_resolution_miss_count/);
  });
});

describe('compute-coa-cost-estimates.js — fold #8: cost_source + is_geometric_override transform', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('script transforms Brain cost_source="model" → DB cost_source="geometric"', () => {
    // Look for either an explicit ternary or a switch/conditional that maps 'model' to 'geometric'.
    expect(src).toMatch(/['"]model['"][\s\S]{0,80}?['"]geometric['"]|['"]geometric['"][\s\S]{0,80}?['"]model['"]/);
  });

  it('cost_source="none" preserved when Brain returns null estimated_cost', () => {
    expect(src).toMatch(/['"]none['"]/);
  });

  it('cost_estimates row is NOT written when cost_source="none" (only coa_applications updated)', () => {
    // Either an explicit guard on Brain output before pushing into the rows array,
    // or a filter on the rows array before INSERT INTO cost_estimates.
    expect(src).toMatch(/(?:if|filter)[\s\S]{0,200}?(?:estimated_cost\s*(?:!==?|==?)\s*null|cost_source\s*(?:===?|!==)\s*['"]none['"])/);
  });
});

describe('compute-coa-cost-estimates.js — fold #14: CLI flags', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('--dry-run flag honored (no DB writes in dry-run mode)', () => {
    expect(src).toMatch(/--dry-run/);
    expect(src).toMatch(/dryRun/i);
  });

  it('--limit=N flag honored (cap rows processed for safe first-run)', () => {
    expect(src).toMatch(/--limit/);
  });
});

describe('compute-coa-cost-estimates.js — PIPELINE_META declarations (§R11)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('emitMeta declares reads from coa_applications, lead_parcels, parcels, parcel_buildings, building_footprints, neighbourhoods, lead_trades', () => {
    expect(src).toMatch(/pipeline\.emitMeta\(/);
    expect(src).toMatch(/coa_applications/);
    expect(src).toMatch(/lead_parcels/);
    expect(src).toMatch(/lead_trades/);
  });

  it('emitMeta declares writes to coa_applications + cost_estimates', () => {
    const emitMeta = src.match(/pipeline\.emitMeta\([\s\S]*?\)[\s;]/);
    expect(emitMeta).not.toBeNull();
    expect(emitMeta?.[0]).toMatch(/cost_estimates/);
  });
});

describe('compute-coa-cost-estimates.js — BATCH_SIZE (Spec 47 §6.3 — fold #10)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('BATCH_SIZE computed via Math.floor formula on 65535 param limit', () => {
    // Plan uses (65535 - 1) / 16 column count, capped at 1000
    expect(src).toMatch(/Math\.floor\s*\(\s*\(?\s*65535/);
  });
});
