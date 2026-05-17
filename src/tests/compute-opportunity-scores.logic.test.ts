// SPEC LINK: docs/specs/01-pipeline/81_opportunity_score_engine.md §2.1
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R8 (pure helpers)
//
// F.3 — exercise the `parseBranchFromLeadId` module-local pure helper via vm sandbox.
// HIGH-v1-G: regex anchored prefix avoids ambiguity for malformed values like 'coa:permit:123'.
// MED-M / CRIT-v2-B: helper returns `null` for malformed; caller routes to `totalRowsOther` (defensive).

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

describe('compute-opportunity-scores — parseBranchFromLeadId pure helper (F.3 v4)', () => {
  let parseBranchFromLeadId: (leadId: unknown) => string | null;

  beforeAll(() => {
    // Read the script + extract just the helper function definition via regex.
    // The helper is at MODULE scope (BEFORE pipeline.run) per Pre-Review item (h)
    // and is structurally simple — pure JS, no external deps. Eval the function
    // text directly rather than running the whole script in a vm sandbox.
    const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'compute-opportunity-scores.js');
    const source = readFileSync(scriptPath, 'utf-8');

    // Match: `function parseBranchFromLeadId(leadId) { ... }` (single-paragraph form)
    const fnMatch = source.match(/function\s+parseBranchFromLeadId\s*\([\s\S]*?\)\s*\{[\s\S]*?\n\}/);
    if (!fnMatch) {
      throw new Error('parseBranchFromLeadId function definition not found at module scope');
    }
    // Verify it's defined BEFORE pipeline.run (module-scope vm sandbox prerequisite).
    const helperIdx = source.indexOf(fnMatch[0]);
    const runIdx = source.indexOf("pipeline.run('compute-opportunity-scores'");
    expect(helperIdx).toBeGreaterThan(0);
    expect(helperIdx).toBeLessThan(runIdx);

    // Eval the function definition into the current scope and return it.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    parseBranchFromLeadId = new Function(`${fnMatch[0]} return parseBranchFromLeadId;`)() as typeof parseBranchFromLeadId;
  });

  it('returns "permit" for canonical permit lead_id shape', () => {
    expect(parseBranchFromLeadId('permit:2023-12345:01')).toBe('permit');
  });

  it('returns "coa" for canonical CoA lead_id shape', () => {
    expect(parseBranchFromLeadId('coa:A1234567')).toBe('coa');
  });

  it('returns null for null input (defensive)', () => {
    expect(parseBranchFromLeadId(null)).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(parseBranchFromLeadId('')).toBe(null);
  });

  it('returns null for malformed prefix', () => {
    expect(parseBranchFromLeadId('garbage')).toBe(null);
  });

  it('returns "coa" for ambiguous nested prefix (regex anchor safety per HIGH-v1-G)', () => {
    // If sequential startsWith were used instead of anchored regex, this could be misclassified.
    // The regex /^(coa|permit):/ matches the FIRST prefix; result is unambiguous.
    expect(parseBranchFromLeadId('coa:permit:123')).toBe('coa');
  });
});
