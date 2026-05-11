// 🔗 SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3.5 item 4 (MANDATED option (a))
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R2 + §R6
//
// SQL-string assertions on the realtor permit_trades backfill script.
// The backfill is the operationally-expensive half of Cycle 7 — millions
// of permits get a `(permit_num, revision_num, 33)` row each. The script
// MUST be:
//   - idempotent (NOT EXISTS guard so re-running is safe)
//   - batched (avoid table-wide locks)
//   - scoped to active permits (matches the §3.5 item 4 (a) contract)
//   - logged (operator visibility on row count + duration)
//
// WF3 #realtor-backfill (2026-05-09) hardening — three findings caught
// after the original merge:
//   F1: INSERT was writing NULL for `lead_score` (NOT NULL DEFAULT 0)
//       and `phase`. The columns are now omitted so the schema's DEFAULT
//       propagates, and the SELECT projection no longer carries them.
//   F2: Script was not registered in `scripts/manifest.json` so the
//       chain orchestrator never invoked it. Now wired into chains.permits.
//   F3: Advisory lock 91 collided with link-massing.js's Wave-2
//       sequential lock. Per WF1 #B precedent (compute-phase-calibration
//       took 93 instead of owning-spec 84), the realtor backfill takes
//       free ID 114.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/backfill-realtor-permit-trades.js — Cycle 7 backfill', () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/backfill-realtor-permit-trades.js'),
      'utf-8',
    );
  });

  it('inserts into permit_trades scoped to the realtor trade_id', () => {
    expect(src).toMatch(/INSERT\s+INTO\s+permit_trades/i);
    // trade_id literal OR a lookup against the trades table by slug.
    expect(src).toMatch(/\b33\b|FROM\s+trades.*'realtor'/i);
  });

  it('is idempotent — uses NOT EXISTS or ON CONFLICT to skip already-inserted rows', () => {
    // Re-running the script must not crash on duplicate keys nor
    // double-insert. Either guard pattern is acceptable.
    const guardMatch =
      /NOT\s+EXISTS\s*\(/i.test(src) || /ON\s+CONFLICT/i.test(src);
    expect(guardMatch).toBe(true);
  });

  it('batches the work to avoid long-held locks', () => {
    // Acceptable batching signals: LIMIT clause inside a loop, OFFSET-based
    // pagination, or a chunk-size constant referenced in the SQL.
    const batchedMatch =
      /LIMIT\s+\d+/i.test(src) || /BATCH/i.test(src) || /chunk/i.test(src);
    expect(batchedMatch).toBe(true);
  });

  it('scopes the backfill to the permits that need realtor coverage', () => {
    // The script must SELECT FROM permits (the source-of-truth for which
    // permits are active). A pure permit_trades-only INSERT would miss
    // the every-active-permit contract.
    expect(src).toMatch(/FROM\s+permits/i);
  });

  it('logs progress + final summary (operator visibility)', () => {
    // Backfilling millions of rows without progress output makes
    // operational debugging brutal. Spec 47 SDK exposes
    // `pipeline.log.info` / `pipeline.log.error`; raw `console.log` is
    // also acceptable for legacy scripts.
    expect(src).toMatch(/pipeline\.log|console\.log|logger|logInfo/i);
  });

  it('runs as a Spec 47 pipeline script (pipeline.run wrapper)', () => {
    // Per Spec 47 §R-skeleton: every pipeline script wraps its work in
    // `pipeline.run('<slug>', async (pool) => { ... })`. Bare-node
    // (process.argv / import.meta) is acceptable for non-pipeline
    // scripts but the backfill belongs in the pipeline (advisory lock,
    // emitSummary, emitMeta).
    const executableMatch =
      /pipeline\.run\s*\(/.test(src) ||
      /(\s|^)main\s*\(\s*\)/m.test(src) ||
      /process\.argv/.test(src) ||
      /import\.meta/.test(src);
    expect(executableMatch).toBe(true);
  });

  it('handles errors via Spec 47 pipeline.run (implicit) or explicit catch', () => {
    // Per Spec 47 §R12: `pipeline.run('<slug>', async (pool) => {...})`
    // catches unhandled throws inside its callback and emits a FAIL
    // summary automatically. So a script wrapped in `pipeline.run`
    // satisfies the error-handling mandate even without an explicit
    // try/catch. Acceptable forms: pipeline.run wrapper, an explicit
    // pipeline.log.error/logError call, or a try/catch block.
    const errorHandlingMatch =
      /pipeline\.run\s*\(/.test(src) ||
      /pipeline\.log\.error/i.test(src) ||
      /logError/i.test(src) ||
      /console\.error/i.test(src) ||
      /catch\s*\(/i.test(src);
    expect(errorHandlingMatch).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════
  // WF3 #realtor-backfill — Finding 1, 3 regression locks
  // ═══════════════════════════════════════════════════════════════════

  it('Finding 1 regression — INSERT does NOT write NULL to lead_score or phase', () => {
    // permit_trades.lead_score is INTEGER NOT NULL DEFAULT 0 (mig 006:14).
    // permit_trades.phase is VARCHAR(20) (nullable but written as NULL was
    // the original symptom of "merged-but-never-run" — co-fix to use schema
    // defaults consistently). Both columns must be OMITTED from the INSERT
    // column list so the schema defaults propagate.
    const insertBlockMatch = src.match(
      /INSERT\s+INTO\s+permit_trades\s*\(([^)]+)\)/i,
    );
    expect(insertBlockMatch, 'INSERT INTO permit_trades column list not found').toBeTruthy();
    const columnList = insertBlockMatch![1]!.toLowerCase();
    expect(columnList).not.toMatch(/\blead_score\b/);
    expect(columnList).not.toMatch(/\bphase\b/);
  });

  it('Finding 3 regression — ADVISORY_LOCK_ID is 114 (free ID; Spec 47 §R2 + Bundle G)', () => {
    // Lock 91 collides with link-massing.js's Wave-2 sequential numbering.
    // Per WF1 #B compute-phase-calibration precedent (took 93 instead of
    // owning-spec 84), this script takes free ID 114. The Bundle G
    // uniqueness test in pipeline-advisory-lock.infra.test.ts also covers
    // the cross-script invariant; this assertion is the script-side anchor.
    expect(src).toMatch(/const\s+ADVISORY_LOCK_ID\s*=\s*114\b/);
  });

  it('R8 fixes — Spec 47 §R5 startup guards on ACTIVE_STATUSES + REALTOR_RELEVANT_TYPES', () => {
    // Empty array in an `ANY()` predicate would silently match nothing
    // and produce a 0-row backfill that reports "success" — exactly the
    // failure mode this WF3 closes. Fail-fast > silent no-op.
    expect(src).toMatch(/ACTIVE_STATUSES\.length\s*===\s*0/);
    expect(src).toMatch(/REALTOR_RELEVANT_TYPES\.size\s*===\s*0/);
    expect(src).toMatch(/refusing to run/i);
  });

  it('R8 fixes — emitMeta writes list omits `phase` and `lead_score` (Finding 1 alignment)', () => {
    // The INSERT lets schema defaults propagate for those columns.
    // Claiming we write them would misrepresent data lineage.
    const metaBlock = src.match(/pipeline\.emitMeta\(([\s\S]*?)\)\s*;/)?.[1] ?? '';
    expect(metaBlock, 'emitMeta block not found').toBeTruthy();
    const writesBlock = metaBlock.match(/permit_trades:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    expect(writesBlock, 'permit_trades writes list not found').toBeTruthy();
    expect(writesBlock).not.toMatch(/['"]phase['"]/);
    expect(writesBlock).not.toMatch(/['"]lead_score['"]/);
  });

  it('R8 fixes — emitMeta reads list includes `permit_type_classifications` (Finding 4 JOIN)', () => {
    const metaBlock = src.match(/pipeline\.emitMeta\(([\s\S]*?)\)\s*;/)?.[1] ?? '';
    expect(metaBlock).toMatch(/permit_type_classifications/);
  });

  it('Finding 4 regression — INSERT applies the 3-axis realtor gate (Spec 91 §3.5 WF3 amendment)', () => {
    // `shouldAppendRealtor` (src/lib/classification/permit-type-class.ts:143
    // + mirror at scripts/lib/permit-type-classifier.js:167) gates realtor
    // rows on three axes: permit_type_class='construction' AND permit_type ∈
    // REALTOR_RELEVANT_TYPES AND 'commercial' ∉ scope_tags. Without these,
    // backfill would write realtor rows for sign permits, plumbing-only,
    // demolition, commercial-scoped — none of which signal a listing.
    // The classify-permits live path applies the gate JS-side; the backfill
    // must apply it SQL-side (over-broad SELECT without the gate is the
    // most likely regression vector).
    expect(src).toMatch(/permit_type_classifications/);
    expect(src).toMatch(/['"]construction['"]/);
    // REALTOR_RELEVANT_TYPES imported from the shared classifier mirror —
    // single source of truth, no in-script duplication.
    expect(src).toMatch(/REALTOR_RELEVANT_TYPES/);
    expect(src).toMatch(/require\s*\(\s*['"]\.\/lib\/permit-type-classifier['"]\s*\)/);
    // Commercial-scope rejection — array overlap test against scope_tags.
    expect(src).toMatch(/scope_tags/i);
    expect(src).toMatch(/['"]commercial['"]/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// WF3 #realtor-backfill — Finding 2 regression lock (manifest registration)
// ═══════════════════════════════════════════════════════════════════

describe('scripts/backfill-realtor-permit-trades.js — manifest.json wiring', () => {
  let manifest: { scripts: Record<string, { file?: string }>; chains: Record<string, string[]> };
  beforeAll(() => {
    const raw = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/manifest.json'),
      'utf-8',
    );
    manifest = JSON.parse(raw);
  });

  it('Finding 2 regression — script entry exists under scripts.backfill_realtor_permit_trades', () => {
    expect(manifest.scripts).toHaveProperty('backfill_realtor_permit_trades');
    expect(manifest.scripts.backfill_realtor_permit_trades?.file).toBe(
      'scripts/backfill-realtor-permit-trades.js',
    );
  });

  it('Finding 2 regression — registered in chains.permits between classify_permits and compute_cost_estimates', () => {
    const permits = manifest.chains.permits;
    expect(permits, 'chains.permits not found in manifest').toBeTruthy();
    const idxClassifyPermits = permits!.indexOf('classify_permits');
    const idxBackfillRealtor = permits!.indexOf('backfill_realtor_permit_trades');
    const idxComputeCost = permits!.indexOf('compute_cost_estimates');
    expect(idxClassifyPermits).toBeGreaterThanOrEqual(0);
    expect(idxBackfillRealtor).toBeGreaterThanOrEqual(0);
    expect(idxComputeCost).toBeGreaterThanOrEqual(0);
    // Order: classify_permits → backfill_realtor_permit_trades → compute_cost_estimates
    expect(idxBackfillRealtor).toBeGreaterThan(idxClassifyPermits);
    expect(idxBackfillRealtor).toBeLessThan(idxComputeCost);
  });
});
