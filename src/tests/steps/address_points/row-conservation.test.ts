// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §11 KFM 9
//
// `address_points` `buildLoadMeta` must report `records_unchanged` MEASURED by the write
// (the no-op rows it submitted), never DERIVED by subtraction (Spec 122 §11 KFM 9). The
// old `Math.max(0, feature_count - inserted - updated)` absorbed every dropped/skipped
// row into "unchanged" — the 2026-09-24 write.js bug wrote 0 of 495,495 parcels and a
// derived row still read 495,495 unchanged, verdict PASS.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS compute */
const { buildLoadMeta } = require('../../../../scripts/lib/compute/load-address-points.js') as {
  buildLoadMeta: (ctx: unknown) => { records_unchanged: number };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const COMPUTE_REL = 'scripts/lib/compute/load-address-points.js';

describe('address_points — records_unchanged is measured, never subtracted (Spec 122 §11 KFM 9)', () => {
  it('reports the write\'s measured unchanged (80), not the old subtraction (85)', () => {
    const meta = buildLoadMeta({
      acquired: { rows_read: 100, feature_count: 100, shaped_skipped: 5 },
      written: { inserted: 10, updated: 5, unchanged: 80 },
    });
    // The old `Math.max(0, feature_count - inserted - updated)` gave 100 - 10 - 5 = 85 —
    // RED before this row's compute edit. The measured value is the write's own count: 80.
    expect(meta.records_unchanged).toBe(80);
  });

  it('a written block WITHOUT unchanged reads 0 — never a subtraction', () => {
    const meta = buildLoadMeta({
      acquired: { rows_read: 100, feature_count: 100, shaped_skipped: 5 },
      written: { inserted: 10, updated: 5 },
    });
    // 100 - 10 - 5 = 85 by the old arithmetic; a write that measured nothing reports 0.
    expect(meta.records_unchanged).toBe(0);
  });

  it('the compute source carries no Math.max(0, ...) near records_unchanged', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), COMPUTE_REL),
      'utf8',
    );
    expect(src).not.toMatch(/records_unchanged:\s*Math\.max\(0,/);
  });
});
