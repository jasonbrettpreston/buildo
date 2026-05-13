// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.A.1, §6.11 Phase C
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (TS↔JS dual-path)
//
// `deriveLeadId` pure-function logic test + TS↔JS dual-path parity.
//
// Phase C creates two mirrored implementations of `deriveLeadId`:
//   - JS:  scripts/lib/leads/lead-id.js  — used by all pipeline scripts
//   - TS:  src/lib/leads/lead-id.ts      — used by admin UI + API routes
//
// Spec 84 §7 mandates these two implementations are bit-for-bit
// identical. This test imports BOTH and asserts they produce the
// same output across a fixture matrix.
//
// The fixture matrix is deliberately permissive on input shape (object
// or null/undefined fields) and exhaustive on the format edge cases
// Phase B + Phase C must handle correctly. The deriver must produce
// BYTE-EQUAL output to the Phase B trigger's `LPAD(revision_num, 2, '0')`:
//   - revision_num = '' → '00' (PG LPAD pads empty)
//   - revision_num = '0' / '5' → '00' / '05' (PG LPAD pads short)
//   - revision_num = '10' / '50' / '99' → unchanged (exact width)
//   - revision_num = '100' / '001' → '10' / '00' (PG LPAD TRUNCATES over-width)
//   - revision_num = numeric 0 / 5 → '00' / '05' (defensive coercion)
//   - permit_num with embedded space ('24 101234' — real production format)
//   - permit_num with embedded dashes ('23-145678-BLD')
//   - application_number with slashes ('A0123/24EYK' — real CoA format)
//   - missing permit_num / application_number → throw
//   - both-permit-and-coa-fields → ambiguous → throw
//
// The over-width truncation + empty-string padding semantics were
// reverse-engineered from PG LPAD behavior during R5.1.f review;
// previous fixtures asserted padStart pass-through which DIVERGED from
// the trigger. Live PG verification: SELECT LPAD('100', 2, '0') → '10'.

import { describe, it, expect } from 'vitest';
import { deriveLeadId as deriveTs } from '@/lib/leads/lead-id';

// CommonJS require for the JS implementation. vitest's resolver handles
// the .js extension; the require lands the same `deriveLeadId` named
// export. Wrapping in an ESM helper to avoid eslint no-require-imports
// warnings — this is the canonical dual-path pattern (see
// classify-lifecycle-phase.infra.test.ts).
import { createRequire } from 'node:module';
const requireJs = createRequire(import.meta.url);
const { deriveLeadId: deriveJs } = requireJs('../../scripts/lib/leads/lead-id');

type ValidFixture = {
  name: string;
  input: { permit_num?: string; revision_num?: string; application_number?: string };
  expected: string;
};

type InvalidFixture = {
  name: string;
  input: unknown;
  expectedErrorMatch: RegExp;
};

const VALID_FIXTURES: ValidFixture[] = [
  // ─── Permit branch: revision_num zero-padding (LPAD pad) ──────────
  { name: 'permit rev=empty string → 00 (PG LPAD pads empty)', input: { permit_num: '1234567', revision_num: '' }, expected: 'permit:1234567:00' },
  { name: 'permit rev=0 → 00', input: { permit_num: '1234567', revision_num: '0' }, expected: 'permit:1234567:00' },
  { name: 'permit rev=00 → 00', input: { permit_num: '1234567', revision_num: '00' }, expected: 'permit:1234567:00' },
  { name: 'permit rev=1 → 01', input: { permit_num: '1234567', revision_num: '1' }, expected: 'permit:1234567:01' },
  { name: 'permit rev=5 → 05', input: { permit_num: '1234567', revision_num: '5' }, expected: 'permit:1234567:05' },
  { name: 'permit rev=10 → 10', input: { permit_num: '1234567', revision_num: '10' }, expected: 'permit:1234567:10' },
  { name: 'permit rev=50 → 50', input: { permit_num: '1234567', revision_num: '50' }, expected: 'permit:1234567:50' },
  { name: 'permit rev=99 → 99', input: { permit_num: '1234567', revision_num: '99' }, expected: 'permit:1234567:99' },

  // ─── Permit branch: PG LPAD truncates over-width ──────────────────
  // R5.1.f Worktree + DeepSeek fix: PG SELECT LPAD('100',2,'0') = '10'
  // and LPAD('001',2,'0') = '00'. The trigger truncates leftmost 2 chars
  // for over-width input. The deriver must match.
  { name: 'permit rev=100 → 10 (PG LPAD truncates over-width)', input: { permit_num: '1234567', revision_num: '100' }, expected: 'permit:1234567:10' },
  { name: 'permit rev=001 → 00 (PG LPAD truncates over-width)', input: { permit_num: '1234567', revision_num: '001' }, expected: 'permit:1234567:00' },

  // ─── Permit branch: permit_num format edge cases ──────────────────
  { name: 'permit_num with embedded space (production format)', input: { permit_num: '24 101234', revision_num: '0' }, expected: 'permit:24 101234:00' },
  { name: 'permit_num with embedded dashes (BLD-suffix)', input: { permit_num: '23-145678-BLD', revision_num: '2' }, expected: 'permit:23-145678-BLD:02' },
  { name: 'permit_num all-numeric', input: { permit_num: '247030', revision_num: '0' }, expected: 'permit:247030:00' },

  // ─── CoA branch ───────────────────────────────────────────────────
  { name: 'coa application_number with dash-year', input: { application_number: 'A0123-24' }, expected: 'coa:A0123-24' },
  { name: 'coa application_number with slash + ward suffix (real format)', input: { application_number: 'A0123/24EYK' }, expected: 'coa:A0123/24EYK' },
  { name: 'coa application_number all-uppercase', input: { application_number: 'B0567/26NYK' }, expected: 'coa:B0567/26NYK' },

  // ─── Numeric coercion safety ──────────────────────────────────────
  // revision_num arrives from pg as a string (column type VARCHAR(10)),
  // but defensively the function handles a number coercion. Number zero
  // is the highest-risk falsy coercion case (Worktree R5.1.f BUG-2).
  { name: 'permit rev as number 0 → padded 00', input: { permit_num: '1234567', revision_num: 0 as unknown as string }, expected: 'permit:1234567:00' },
  { name: 'permit rev as number 5 → padded 05', input: { permit_num: '1234567', revision_num: 5 as unknown as string }, expected: 'permit:1234567:05' },
];

const INVALID_FIXTURES: InvalidFixture[] = [
  { name: 'missing permit_num', input: { revision_num: '00' }, expectedErrorMatch: /requires application_number OR \(permit_num \+ revision_num\)/i },
  { name: 'missing revision_num (null)', input: { permit_num: '1234567' }, expectedErrorMatch: /requires application_number OR \(permit_num \+ revision_num\)/i },
  { name: 'empty object', input: {}, expectedErrorMatch: /requires application_number OR \(permit_num \+ revision_num\)/i },
  { name: 'null input', input: null, expectedErrorMatch: /input/i },
  { name: 'undefined input', input: undefined, expectedErrorMatch: /input/i },
  { name: 'both permit and coa fields ambiguous', input: { permit_num: '1', revision_num: '0', application_number: 'A1' }, expectedErrorMatch: /ambiguous|both/i },
  { name: 'empty permit_num string', input: { permit_num: '', revision_num: '0' }, expectedErrorMatch: /requires application_number OR \(permit_num \+ revision_num\)/i },
  { name: 'empty application_number string', input: { application_number: '' }, expectedErrorMatch: /requires application_number OR \(permit_num \+ revision_num\)/i },
  // NOTE: empty revision_num '' is now VALID (pads to '00' per PG LPAD).
  // It moved from INVALID to VALID fixtures above. This is the explicit
  // trigger-parity fix from R5.1.f Worktree BUG-1.
];

describe('deriveLeadId — pure function logic (Phase C R5.1)', () => {
  describe('valid inputs produce canonical lead_id', () => {
    for (const fx of VALID_FIXTURES) {
      it(`TS: ${fx.name}`, () => {
        expect(deriveTs(fx.input as Parameters<typeof deriveTs>[0])).toBe(fx.expected);
      });
      it(`JS: ${fx.name}`, () => {
        expect(deriveJs(fx.input)).toBe(fx.expected);
      });
    }
  });

  describe('invalid inputs throw', () => {
    for (const fx of INVALID_FIXTURES) {
      it(`TS: ${fx.name}`, () => {
        expect(() => deriveTs(fx.input as Parameters<typeof deriveTs>[0])).toThrow(fx.expectedErrorMatch);
      });
      it(`JS: ${fx.name}`, () => {
        expect(() => deriveJs(fx.input)).toThrow(fx.expectedErrorMatch);
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Dual-path parity assertion (Spec 84 §7) — the SAME input must produce
// the SAME output regardless of which implementation runs. Asserts
// byte-equal output for every valid fixture AND that both implementations
// throw the same Error.message substring for every invalid fixture.
// ─────────────────────────────────────────────────────────────────────

describe('TS↔JS dual-path parity (Spec 84 §7)', () => {
  for (const fx of VALID_FIXTURES) {
    it(`parity on valid: ${fx.name}`, () => {
      const tsOutput = deriveTs(fx.input as Parameters<typeof deriveTs>[0]);
      const jsOutput = deriveJs(fx.input);
      expect(tsOutput).toBe(jsOutput);
    });
  }

  for (const fx of INVALID_FIXTURES) {
    it(`parity on invalid throw: ${fx.name}`, () => {
      let tsError: Error | null = null;
      let jsError: Error | null = null;
      try { deriveTs(fx.input as Parameters<typeof deriveTs>[0]); } catch (e) { tsError = e as Error; }
      try { deriveJs(fx.input); } catch (e) { jsError = e as Error; }
      // Both must throw
      expect(tsError).toBeInstanceOf(Error);
      expect(jsError).toBeInstanceOf(Error);
      // Both must throw a message matching the same regex
      expect(tsError?.message).toMatch(fx.expectedErrorMatch);
      expect(jsError?.message).toMatch(fx.expectedErrorMatch);
    });
  }
});
