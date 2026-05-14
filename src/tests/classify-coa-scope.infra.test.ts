// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.8 row 666
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//
// SQL-string + Spec-47-skeleton regression-lock for scripts/classify-coa-scope.js.
//
// Per the R5.3 active task R8 triage:
//   - Advisory lock 4202 (Spec 42 §6.8 Phase D allocation)
//   - streamQuery for coa_applications source (Spec 47 §R7 mandate)
//   - Idempotency filter: scope_classified_at IS NULL OR scope_classified_at < load_at
//   - Batched UPDATE with IS DISTINCT FROM guards
//   - pg-native array binding for scope_tags ($N::TEXT[]) — NO string-literal
//     `{` || `,` || `}` concatenation (Gemini CRIT array safety)
//   - audit_table emits scope_classified_pct, unmapped_scope_count,
//     project_type_distribution, coa_type_class_distribution

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('classify-coa-scope.js — Spec 47 §R1-R12 + R5.3 contract', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/classify-coa-scope.js'),
    'utf-8',
  );

  it('§R1 — imports the pipeline SDK', () => {
    expect(src).toMatch(/require\(['"]\.\/lib\/pipeline['"]\)/);
  });

  it('§R2 — declares advisory lock ID 4202 (Spec 42 §6.8 Phase D allocation)', () => {
    expect(src).toMatch(/(?:const|let)\s+ADVISORY_LOCK_ID\s*=\s*4202\b/);
  });

  it('§R3 — uses pipeline.run() entrypoint with slug "classify-coa-scope"', () => {
    expect(src).toMatch(/pipeline\.run\(['"]classify-coa-scope['"]/);
  });

  it('§R3.5 — captures DB clock via pipeline.getDbTimestamp', () => {
    expect(src).toMatch(/pipeline\.getDbTimestamp\(/);
  });

  it('§R3.5 — RUN_AT captured BEFORE withAdvisoryLock (R5.2 lessons-routing pattern)', () => {
    const runAtIdx = src.search(/pipeline\.getDbTimestamp\(/);
    const lockIdx = src.search(/pipeline\.withAdvisoryLock\(/);
    expect(runAtIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(runAtIdx).toBeLessThan(lockIdx);
  });

  it('§R4 — Zod logic_vars validation includes coa_scope_unmapped_threshold_pct', () => {
    expect(src).toMatch(/coa_scope_unmapped_threshold_pct/);
    expect(src).toMatch(/z\.object|LOGIC_VARS_SCHEMA/);
  });

  it('§R6 — wraps work in pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)', () => {
    expect(src).toMatch(/pipeline\.withAdvisoryLock\(\s*pool\s*,\s*ADVISORY_LOCK_ID\b/);
  });

  it('§R7 — uses streamQuery for coa_applications source (Spec 47 §R7 mandate)', () => {
    expect(src).toMatch(/pipeline\.streamQuery\(/);
  });

  it('§R7 — idempotency filter: scope_classified_at IS NULL OR scope_classified_at < last_seen_at', () => {
    // R8 spec-drift correction: Spec 42 §6.8 row 666 names this column `load_at`
    // but the actual coa_applications column is `last_seen_at` (load-coa.js
    // bumps it under that name when data_hash differs). Same idempotency
    // semantics; the column name is the only divergence.
    expect(src).toMatch(/scope_classified_at\s+IS\s+NULL[\s\S]*?scope_classified_at\s*<\s*last_seen_at/i);
  });

  it('§R7 — filters on description IS NOT NULL (rows without description are unmatchable)', () => {
    expect(src).toMatch(/description\s+IS\s+NOT\s+NULL/i);
  });

  it('§R8 — imports the pure classifier from scripts/lib/coa-scope-classifier.js', () => {
    expect(src).toMatch(/require\(['"]\.\/lib\/coa-scope-classifier['"]\)/);
  });

  it('§R9 — wraps batched UPDATE in pipeline.withTransaction', () => {
    expect(src).toMatch(/pipeline\.withTransaction\(/);
  });

  it('§R9 — UPDATE uses IS DISTINCT FROM guards (prevents dead-tuple bloat on re-runs)', () => {
    expect(src).toMatch(/IS\s+DISTINCT\s+FROM/i);
  });

  it('§R9 — scope_tags passed via pg-native $N::TEXT[] array binding (Gemini CRIT — NO string-literal `{...}` concat)', () => {
    // Positive: the UPDATE casts a parameter to TEXT[]
    expect(src).toMatch(/::TEXT\[\]/);
    // Negative: no unsafe `'{' || ... || '}'` literal construction
    expect(src).not.toMatch(/'\{'\s*\|\|[\s\S]*?\|\|\s*'\}'/);
    // Negative: no JS-side `'{' + tags.join(',') + '}'` pattern either
    expect(src).not.toMatch(/['"]\{['"]\s*\+[\s\S]*?tags[\s\S]*?\.join\(/);
  });

  it('§R10 — PIPELINE_SUMMARY emits audit_table with required metrics (Spec 42 §6.8)', () => {
    expect(src).toMatch(/audit_table/);
    expect(src).toMatch(/scope_classified_pct/);
    expect(src).toMatch(/unmapped_scope_count/);
    expect(src).toMatch(/project_type_distribution/);
  });

  it('§R10 — audit_table phase: 42 (Spec 47 §R10 convention — owning spec number)', () => {
    expect(src).toMatch(/phase:\s*42\b/);
  });

  it('§R11 — pipeline.emitMeta() declares coa_applications reads + writes', () => {
    expect(src).toMatch(/pipeline\.emitMeta\(/);
    expect(src).toMatch(/coa_applications/);
    expect(src).toMatch(/scope_classified_at/);
    expect(src).toMatch(/scope_source/);
  });

  it('§R12 — lockResult.acquired SKIP guard at end', () => {
    expect(src).toMatch(/lockResult\.acquired/);
    expect(src).toMatch(/if\s*\(\s*!\s*lockResult\.acquired\s*\)/);
  });

  it('SPEC LINK header present', () => {
    expect(src).toMatch(/SPEC LINK:\s*docs\/specs\/01-pipeline\/42_chain_coa\.md/i);
  });

  it('scope_source is constant "description" per Spec 42 §6.6.D', () => {
    expect(src).toMatch(/scope_source[\s\S]{0,40}['"]description['"]/i);
  });

  it('§R10 + §8.1 — flushBatch captures client.query() rowCount into a totalUpdated accumulator (WF3 #r5-3-observability-fixes BUG-1)', () => {
    // Lessons 81-W5 / 82-W6 / 85-W6: records_updated MUST sum result.rowCount,
    // not JS-side classification counts. The IS DISTINCT FROM guard means
    // JS-side counts overstate writes on idempotent re-runs.
    expect(src).toMatch(/const\s+result\s*=\s*await\s+client\.query/i);
    expect(src).toMatch(/totalUpdated\s*\+?=\s*result\.rowCount/i);
    expect(src).toMatch(/records_updated:\s*totalUpdated/i);
  });

  it('§R3 — BATCH_SIZE computed via Math.floor(65535 / N) formula (WF3 #r5-3-observability-fixes BUG-4)', () => {
    // Spec 47 §6.3 mandates the formula to prevent silent violations as
    // columns are added. The Math.min(1000, ...) cap is documented as
    // memory-bounded, not param-bounded.
    expect(src).toMatch(/Math\.floor\s*\(\s*65535/i);
  });

  it('audit_table unmapped_scope_count value matches threshold format (WF3 #r5-3-observability-fixes BUG-3)', () => {
    // Prior: value = raw integer count, threshold = "<= 10%" → operator-confusing.
    // Fix: value emits percentage to match threshold semantics.
    // The audit row construction should compute and display unmappedPct.
    const unmappedRow = src.match(/metric:\s*['"]unmapped_scope_count['"][\s\S]{0,300}/);
    expect(unmappedRow).not.toBeNull();
    expect(unmappedRow?.[0]).toMatch(/unmappedPct/);
  });
});
