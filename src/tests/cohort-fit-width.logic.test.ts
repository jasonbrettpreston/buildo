// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-GZ (provisional id), R-ET, R-CZ
//
// R-GZ (operator y 2026-10-20): the bracket's text perturbations (`append_text:<s>`, R-CZ, and
// `derived_status:<s>`, R-ET) appended <s> unconditionally. A full-width bounded column cannot
// take a suffix: coa_applications.data_hash is sha256 hex, always 64 characters in a varchar(64),
// so Night P4 (2026-10-20, lane night-p4-c) failed `--run` with "value too long for type character
// varying(64)" before any perturbation committed. The fitted form keeps the value inside the
// catalog width: `left(col, w - char_length($2)) || $2`. An unbounded column keeps the plain append;
// a suffix as long as the width (or longer) is refused, because the fitted value would no longer
// carry any of the original value.

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS instrument */
const cohort = require(path.join(process.cwd(), 'scripts/analysis/ingestor-forced-cohort.js')) as {
  parseOp: (raw: string) => { kind: string };
  perturbationSetExpr: (op: { kind: string }, column: string, deriveColumn?: string | null, widths?: Record<string, number | null>) => string;
  fitWidthDecision: (o: { columns: string[]; widths: Record<string, number | null>; suffix: string }) => { ok: boolean; fitted?: string[]; reason?: string };
  fittedPreview: (value: string, width: number | null, suffix: string) => string;
  COLUMN_WIDTH_SQL: string;
};

const HASH = 'a'.repeat(64);

describe('R-GZ — fit-to-width text perturbation (ingestor-forced-cohort.js)', () => {
  it('RED case (Night P4): a full-width varchar(64) data_hash gets the fitted form, not a plain append', () => {
    expect(cohort.perturbationSetExpr(cohort.parseOp('append_text: forced'), 'data_hash', null, { data_hash: 64 }))
      .toBe('"data_hash" = left("data_hash", 64 - char_length($2)) || $2');
  });

  it('derived_status fits each bounded column on its own width', () => {
    expect(cohort.perturbationSetExpr(cohort.parseOp('derived_status: forced'), 'data_hash', 'status', { data_hash: 64, status: 50 }))
      .toBe('"data_hash" = left("data_hash", 64 - char_length($2)) || $2, "status" = left("status", 50 - char_length($2)) || $2');
  });

  it('an unbounded (text) column, or no catalog answer, keeps the plain append (existing captures unchanged)', () => {
    expect(cohort.perturbationSetExpr(cohort.parseOp('append_text:x'), 's', null, { s: null })).toBe('"s" = "s" || $2');
    expect(cohort.perturbationSetExpr(cohort.parseOp('append_text:x'), 's')).toBe('"s" = "s" || $2');
  });

  it('the preview mirrors the SQL: a full-width value keeps its length and ends in the suffix; a short one is appended', () => {
    const fitted = cohort.fittedPreview(HASH, 64, ' forced');
    expect(fitted).toHaveLength(64);
    expect(fitted.endsWith(' forced')).toBe(true);
    expect(fitted).not.toBe(HASH);
    expect(cohort.fittedPreview('Postponed', 50, ' forced')).toBe('Postponed forced');
    expect(cohort.fittedPreview('Postponed', null, ' forced')).toBe('Postponed forced');
  });

  it('refuses a suffix as wide as (or wider than) a bounded perturbed column', () => {
    const d = cohort.fitWidthDecision({ columns: ['code'], widths: { code: 3 }, suffix: ' forced' });
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/code.*3/);
    expect(cohort.fitWidthDecision({ columns: ['code'], widths: { code: 7 }, suffix: ' forced' }).ok).toBe(false);
  });

  it('names the columns it fits; an unbounded column is not fitted', () => {
    const d = cohort.fitWidthDecision({ columns: ['data_hash', 'status', 'note'], widths: { data_hash: 64, status: 50, note: null }, suffix: ' forced' });
    expect(d).toEqual({ ok: true, fitted: ['data_hash', 'status'] });
  });

  it('the width comes from the catalog (character_maximum_length), never a literal', () => {
    expect(cohort.COLUMN_WIDTH_SQL).toMatch(/character_maximum_length/);
    expect(cohort.COLUMN_WIDTH_SQL).toMatch(/information_schema\.columns/);
  });
});
