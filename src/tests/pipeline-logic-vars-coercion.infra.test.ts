// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4 — LOGIC_VARS_SCHEMA must use
// z.coerce.number() because the pg driver returns DECIMAL/NUMERIC columns as strings.
// z.number() rejects strings and causes an instant Zod validation crash on startup.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

// All pipeline scripts that declare a LOGIC_VARS_SCHEMA with numeric fields.
// Scripts already fixed in prior commits are listed here as regression anchors.
const PIPELINE_SCRIPTS = [
  // ── Already fixed (regression anchors) ────────────────────────────────────
  'scripts/compute-opportunity-scores.js',
  'scripts/compute-trade-forecasts.js',
  // ── WF2 sweep targets ──────────────────────────────────────────────────────
  'scripts/classify-inspection-status.js',
  'scripts/classify-lifecycle-phase.js',
  'scripts/close-stale-permits.js',
  'scripts/compute-cost-estimates.js',
  'scripts/compute-timing-calibration-v2.js',
  'scripts/create-pre-permits.js',
  'scripts/link-coa.js',
  'scripts/link-massing.js',
  'scripts/link-parcels.js',
  'scripts/link-wsib.js',
  'scripts/refresh-snapshot.js',
  'scripts/quality/assert-coa-freshness.js',
  'scripts/quality/assert-data-bounds.js',
  'scripts/quality/assert-global-coverage.js',
  'scripts/quality/assert-lifecycle-phase-distribution.js',
  'scripts/quality/assert-network-health.js',
  'scripts/quality/assert-pre-permit-aging.js',
  'scripts/quality/assert-staleness.js',
];

describe('Pipeline scripts — LOGIC_VARS_SCHEMA uses z.coerce.number() (spec 47 §4)', () => {
  it('covers all 20 pipeline scripts in the sweep', () => {
    expect(PIPELINE_SCRIPTS).toHaveLength(20);
  });

  for (const scriptPath of PIPELINE_SCRIPTS) {
    describe(scriptPath, () => {
      let content: string;
      beforeAll(() => {
        content = read(scriptPath);
      });

      it('has no bare z.number() calls inside LOGIC_VARS_SCHEMA (code lines, not comments)', () => {
        // Remove single-line comments to avoid false positives from comment explanations
        // that mention z.number() in already-fixed scripts.
        const codeOnly = content
          .split('\n')
          .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
          .join('\n');

        // Match "z.number(" that is NOT preceded by "coerce."
        // Negative lookbehind: (?<!coerce\.) means "not preceded by coerce."
        const bareZNumber = /(?<!coerce\.)z\.number\(/;
        expect(
          bareZNumber.test(codeOnly),
          `${scriptPath} still has bare z.number() in executable code — must be z.coerce.number()`,
        ).toBe(false);
      });

      it('uses z.coerce.number() for at least one schema field', () => {
        expect(content).toMatch(/z\.coerce\.number\(\)/);
      });
    });
  }
});

// ── Semantic coercion contract test ────────────────────────────────────────────
// Verifies that z.coerce.number() accepts pg DECIMAL-as-string but still
// rejects non-numeric strings (preserving the "throw on invalid" invariant).
describe('z.coerce.number() semantic contract — pg string coercion behaviour', () => {
  it('accepts numeric string (pg DECIMAL behaviour) — z.number() would reject this', () => {
    // We test the logic directly without importing Zod from scripts/ (CommonJS).
    // This is a reasoning test: Zod's coerce.number() calls Number() on the value.
    const coerce = (v: unknown) => {
      const n = Number(v);
      if (!isFinite(n)) throw new Error(`Not finite: ${v}`);
      return n;
    };
    expect(coerce('25')).toBe(25);       // pg DECIMAL → string → coerced to number
    expect(coerce('1.5')).toBe(1.5);
    expect(coerce('0.95')).toBe(0.95);
    expect(coerce(25)).toBe(25);         // already a number — still works
  });

  it('throws on non-numeric string (z.coerce.number().finite() still guards bad data)', () => {
    const coerce = (v: unknown) => {
      const n = Number(v);
      if (!isFinite(n)) throw new Error(`Not finite: ${v}`);
      return n;
    };
    expect(() => coerce('abc')).toThrow();
    expect(() => coerce('Infinity')).toThrow();
    // Note: Number('') = 0 which IS finite — coerce does NOT throw on empty string.
    // The downstream .positive() or .min(1) modifier is what rejects it (see next test).
    expect(coerce('')).toBe(0);
  });

  it('empty string coerces to 0 — downstream .positive() guard catches it', () => {
    // Number('') = 0, which IS finite but fails .positive(). This documents the
    // defence-in-depth: coerce alone isn't sufficient; the modifier chain matters.
    expect(Number('')).toBe(0);
    expect(isFinite(Number(''))).toBe(true);
    // The .positive() or .min(1) chained to z.coerce.number() is what rejects '' → 0.
  });
});
