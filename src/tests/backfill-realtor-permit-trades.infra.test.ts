// 🔗 SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3.5 item 4 (MANDATED option (a))
//
// SQL-string assertions on the realtor permit_trades backfill script.
// The backfill is the operationally-expensive half of Cycle 7 — millions
// of permits get a `(permit_num, revision_num, 33)` row each. The script
// MUST be:
//   - idempotent (NOT EXISTS guard so re-running is safe)
//   - batched (avoid table-wide locks)
//   - scoped to active permits (matches the §3.5 item 4 (a) contract)
//   - logged (operator visibility on row count + duration)

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
});
