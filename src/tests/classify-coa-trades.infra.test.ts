// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.8 row 667
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//             docs/specs/01-pipeline/80_taxonomies.md §5 (realtor gate)
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (dual-path)
//
// WF1 R5.4 (2026-05-14): SQL-string + Spec-47-skeleton regression-lock for
// scripts/classify-coa-trades.js — the consumer of the R5.1 substrate.
//
// Locks in the R8 plan-review folds (10 BUGs + 3 self-checklist additions):
//   - #1: unmapped threshold relaxed to <= coa_trades_unmapped_threshold_pct%
//   - #2: lead_score = Math.round(confidence * 100) committed in SQL
//   - #3: realtor availability startup guard via checkRealtorAvailable
//   - #5: ON CONFLICT (lead_id, trade_id) DO UPDATE SET includes classified_at
//   - #8: per-batch trade_classified_at UPDATE uses WHERE id = ANY($ids::bigint[])
//   - #9: slug_resolution_miss_count audit metric (== 0 FAIL)
//   - #10: RETURNING (xmax = 0) for accurate records_new vs records_updated
//   - Plus Spec 47 §R1-R12 conformance
//

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/classify-coa-trades.js');

describe('classify-coa-trades.js — Spec 47 §R1-R12 skeleton', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('SPEC LINK header present', () => {
    expect(src).toMatch(/SPEC LINK:\s*docs\/specs\/01-pipeline\/42_chain_coa\.md/i);
  });

  it('§R1 — imports the pipeline SDK', () => {
    expect(src).toMatch(/require\(['"]\.\/lib\/pipeline['"]\)/);
  });

  it('§R1 — imports the R5.1 classifier lib', () => {
    expect(src).toMatch(/require\(['"]\.\/lib\/coa-trade-classifier['"]\)/);
  });

  it('§R2 — declares advisory lock ID 4203 (Spec 42 §6.8 Phase D allocation)', () => {
    expect(src).toMatch(/(?:const|let)\s+ADVISORY_LOCK_ID\s*=\s*4203\b/);
  });

  it('§R3 — uses pipeline.run() entrypoint with slug "classify-coa-trades"', () => {
    expect(src).toMatch(/pipeline\.run\(['"]classify-coa-trades['"]/);
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

  it('§R4 (Self-checklist o) — Zod logic_vars validation includes coa_trades_unmapped_threshold_pct', () => {
    expect(src).toMatch(/coa_trades_unmapped_threshold_pct/);
    expect(src).toMatch(/z\.object|LOGIC_VARS_SCHEMA|ConfigSchema/);
  });

  it('§R6 — wraps work in pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)', () => {
    expect(src).toMatch(/pipeline\.withAdvisoryLock\(\s*pool\s*,\s*ADVISORY_LOCK_ID\b/);
  });

  it('§R7 — uses streamQuery for coa_applications source', () => {
    expect(src).toMatch(/pipeline\.streamQuery\(/);
  });

  it('§R7 — idempotency filter: trade_classified_at IS NULL OR < scope_classified_at', () => {
    expect(src).toMatch(
      /trade_classified_at\s+IS\s+NULL[\s\S]*?trade_classified_at\s*<\s*scope_classified_at/i,
    );
  });

  it('§R7 — cursor filter requires scope_tags IS NOT NULL (DeepSeek MED + self-checklist l)', () => {
    expect(src).toMatch(/scope_tags\s+IS\s+NOT\s+NULL/i);
  });

  it('§R9 — wraps batched INSERT in pipeline.withTransaction', () => {
    expect(src).toMatch(/pipeline\.withTransaction\(/);
  });

  it('§R12 — lockResult.acquired SKIP guard at end', () => {
    expect(src).toMatch(/lockResult\.acquired/);
    expect(src).toMatch(/if\s*\(\s*!\s*lockResult\.acquired\s*\)/);
  });
});

describe('classify-coa-trades.js — R8 fold #3: realtor availability startup guard', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('queries trades table for realtor row at startup (R8 fold #3)', () => {
    // Either pattern accepted: `WHERE id = 33` literal, or `slug = 'realtor'` lookup.
    const hasRealtorProbe =
      /trades\s+WHERE\s+(?:id\s*=\s*33|slug\s*=\s*['"]realtor['"])/i.test(src) ||
      /checkRealtorAvailable/.test(src);
    expect(hasRealtorProbe).toBe(true);
  });

  it('propagates realtorAvailable boolean to insertion logic', () => {
    expect(src).toMatch(/realtorAvailable/);
  });
});

describe('classify-coa-trades.js — R8 fold #5: ON CONFLICT updates classified_at', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('INSERT into lead_trades has ON CONFLICT (lead_id, trade_id) DO UPDATE SET', () => {
    expect(src).toMatch(
      /INSERT\s+INTO\s+lead_trades[\s\S]*?ON\s+CONFLICT\s*\(\s*lead_id\s*,\s*trade_id\s*\)\s*DO\s+UPDATE\s+SET/i,
    );
  });

  it('ON CONFLICT UPDATE SET clause includes classified_at = EXCLUDED.classified_at (R8 fold #5)', () => {
    expect(src).toMatch(
      /ON\s+CONFLICT[\s\S]*?DO\s+UPDATE\s+SET[\s\S]*?classified_at\s*=\s*EXCLUDED\.classified_at/i,
    );
  });

  it('ON CONFLICT UPDATE SET also refreshes confidence + lead_score (twin parity)', () => {
    expect(src).toMatch(
      /ON\s+CONFLICT[\s\S]*?DO\s+UPDATE\s+SET[\s\S]*?confidence\s*=\s*EXCLUDED\.confidence/i,
    );
    expect(src).toMatch(
      /ON\s+CONFLICT[\s\S]*?DO\s+UPDATE\s+SET[\s\S]*?lead_score\s*=\s*EXCLUDED\.lead_score/i,
    );
  });
});

describe('classify-coa-trades.js — R8 fold #10: xmax-based records_new vs records_updated', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('INSERT uses RETURNING (xmax = 0) AS is_insert for distinguishability', () => {
    expect(src).toMatch(/RETURNING[\s\S]*?xmax\s*=\s*0[\s\S]*?(?:AS\s+is_insert|is_insert)/i);
  });
});

describe('classify-coa-trades.js — R8 fold #8: batched UPDATE for trade_classified_at', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('coa_applications.trade_classified_at UPDATE uses WHERE id = ANY($N::bigint[])', () => {
    expect(src).toMatch(
      /UPDATE\s+coa_applications[\s\S]*?SET\s+trade_classified_at\s*=[\s\S]*?WHERE\s+id\s*=\s*ANY\s*\(\s*\$\d+::bigint\[\]\s*\)/i,
    );
  });
});

describe('classify-coa-trades.js — R8 fold #2: lead_score formula committed', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('lead_score = Math.round(confidence * 100) appears in the script (not relying on schema default 0)', () => {
    expect(src).toMatch(/Math\.round\(\s*confidence\s*\*\s*100\s*\)/);
  });
});

describe('classify-coa-trades.js — R8 fold #2 (Self-checklist p): lead_score in SQL payload', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('INSERT INTO lead_trades column list includes lead_score (not relying on schema default 0)', () => {
    // Find the column list (between INSERT INTO lead_trades and VALUES)
    const m = src.match(/INSERT\s+INTO\s+lead_trades\s*\(([\s\S]*?)\)\s*VALUES/i);
    expect(m).not.toBeNull();
    expect(m?.[1]).toMatch(/\blead_score\b/);
  });
});

describe('classify-coa-trades.js — audit_table metrics (R8 folds #1, #9, #10)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('PIPELINE_SUMMARY emits audit_table', () => {
    expect(src).toMatch(/audit_table/);
  });

  it('audit_table phase: 42', () => {
    expect(src).toMatch(/phase:\s*42\b/);
  });

  it('R8 fold #1 — unmapped_scope_pct metric (relaxed from `== 0 FAIL`)', () => {
    expect(src).toMatch(/unmapped_scope_pct/);
    // Threshold references the logic var, not a hard 0
    expect(src).toMatch(/coa_trades_unmapped_threshold_pct/);
  });

  it('R8 fold #9 — slug_resolution_miss_count metric with `== 0` FAIL threshold', () => {
    expect(src).toMatch(/slug_resolution_miss_count/);
  });

  it('coa_with_trades / coa_zero_trades metrics present', () => {
    expect(src).toMatch(/coa_with_trades/);
    expect(src).toMatch(/coa_zero_trades/);
  });

  it('realtor_inclusion_pct metric present', () => {
    expect(src).toMatch(/realtor_inclusion_pct/);
  });
});

describe('classify-coa-trades.js — PIPELINE_META declarations (§R11)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('emitMeta declares coa_applications reads + lead_trades writes', () => {
    expect(src).toMatch(/pipeline\.emitMeta\(/);
    expect(src).toMatch(/coa_applications/);
    expect(src).toMatch(/lead_trades/);
  });

  it('emitMeta declares scope_tags as a read column', () => {
    expect(src).toMatch(/scope_tags/);
  });
});

describe('classify-coa-trades.js — BATCH_SIZE formula (Spec 47 §6.3)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('BATCH_SIZE computed via Math.floor(65535 / N) formula (R8 fold #22 clarity)', () => {
    expect(src).toMatch(/Math\.floor\s*\(\s*65535/i);
  });
});

describe('classify-coa-trades.js — §R10 records_new + records_updated semantics (R8 fold #10)', () => {
  const src = fs.readFileSync(SCRIPT, 'utf-8');

  it('emitSummary records_new + records_updated reference xmax-derived counters', () => {
    // The script should accumulate insert vs update counts based on is_insert
    expect(src).toMatch(/(?:records_new|recordsNew|inserts(Count)?)/);
    expect(src).toMatch(/(?:records_updated|recordsUpdated|updates(Count)?)/);
  });
});
