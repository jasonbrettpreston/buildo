// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (gate V)
//
// WF2 gate V — the five-word STANDARDIZED / OBSERVABLE / SCALABLE /
// UNDERSTANDABLE / ACCURATE verdict, per step, PASS|FAIL drawn ONLY from the
// mapped gates' own already-computed `fastInvariants()` results:
//   STANDARDIZED (A, I) · OBSERVABLE (C, D) · SCALABLE (B, E) ·
//   UNDERSTANDABLE (F) · ACCURATE (G).
// Gate J is deliberately absent from UNDERSTANDABLE's mapped gates — it is a
// `.husky/pre-commit`-only hook, never wired into `fastInvariants()`, so
// `step-validate.mjs` cannot observe it per step. Gate H is not one of the
// five words at all (it validates the MATRIX's own status vocabulary).
//
// A word FAILs iff one of its gates' registry result names this step's own
// token in `blockedSlugs` (an UNALLOWED violation — no ledger row covers it).
// Otherwise it PASSes; a ledger row scoped to this step under one of the
// word's gates makes that PASS carry a "(N deferred)" count rather than
// reading as if nothing were outstanding (R-X closing-row posture — a
// deferred finding must stay VISIBLE, never silent).
//
// Gate E's own `step` key is the COMPUTE FILE's basename (e.g. "load-parcels"
// for the `parcels` step), not the descriptor's `identity.name` the other
// gates key on — T3/T4 prove `computeFiveWordVerdict` honours that split
// rather than silently dropping or double-counting gate-E findings.
//
// T1 re-derives `computeFiveWordVerdict`'s own `selfTest()` fixtures directly
// (Spec 121 §12b.6 — a checker never proven to fire is not a check). T5 is
// the LIVE half: a real `--all --fast` spawn renders a five-word block for
// every converted step, one word from the closed {PASS, FAIL} set each.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import * as stepValidateRaw from '../../scripts/analysis/step-validate.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCRIPT_REL = 'scripts/analysis/step-validate.mjs';

type WordVerdict = { status: 'PASS' | 'FAIL'; deferred: number; detail: string };
type FiveWordResult = {
  STANDARDIZED: WordVerdict;
  OBSERVABLE: WordVerdict;
  SCALABLE: WordVerdict;
  UNDERSTANDABLE: WordVerdict;
  ACCURATE: WordVerdict;
};
type InvariantResult = { id: number; slug: string; blockedSlugs?: string[] };
type LedgerRow = { gate: string; step: string };

const stepValidate = stepValidateRaw as unknown as {
  computeFiveWordVerdict: (
    row: { slug: string },
    computePath: string | null,
    invariantResults: InvariantResult[],
    ledgerRows: LedgerRow[],
  ) => FiveWordResult;
  fiveWordSelfTest: () => void;
};

const WORDS: Array<keyof FiveWordResult> = ['STANDARDIZED', 'OBSERVABLE', 'SCALABLE', 'UNDERSTANDABLE', 'ACCURATE'];
const ROW = { slug: 'fixture_step' };
const COMPUTE_PATH = 'scripts/lib/compute/fixture-step.js';

describe('gate V — the five-word verdict is derived only from the mapped gates', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: fiveWordSelfTest() does not throw', () => {
    expect(() => stepValidate.fiveWordSelfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — every word maps to exactly the gates the spec's own R-BA row names,
  // proven by construction: flipping ONE gate's registry result to a
  // blockedSlugs hit for this step FAILs only the word(s) that gate maps to,
  // never a sibling word.
  // -------------------------------------------------------------------------
  describe('T2: word -> gate mapping is exact, one gate at a time', () => {
    const GATE_ENTRIES: Array<[gate: string, id: number, word: keyof FiveWordResult]> = [
      ['A', 28, 'STANDARDIZED'],
      ['B', 29, 'SCALABLE'],
      ['C', 30, 'OBSERVABLE'],
      ['D', 31, 'OBSERVABLE'],
      ['F', 37, 'UNDERSTANDABLE'],
    ];

    for (const [gate, id, failingWord] of GATE_ENTRIES) {
      it(`gate ${gate} (#${id}) FAILs only ${failingWord}`, () => {
        const invariantResults: InvariantResult[] = [{ id, slug: '(registry)', blockedSlugs: [ROW.slug] }];
        const v = stepValidate.computeFiveWordVerdict(ROW, COMPUTE_PATH, invariantResults, []);
        for (const word of WORDS) {
          expect(v[word].status, `word ${word} for gate ${gate}`).toBe(word === failingWord ? 'FAIL' : 'PASS');
        }
      });
    }

    it('gate I (#33-#36) FAILs only STANDARDIZED', () => {
      for (const id of [33, 34, 35, 36]) {
        const invariantResults: InvariantResult[] = [{ id, slug: '(registry)', blockedSlugs: [ROW.slug] }];
        const v = stepValidate.computeFiveWordVerdict(ROW, COMPUTE_PATH, invariantResults, []);
        expect(v.STANDARDIZED.status, `gate I id ${id}`).toBe('FAIL');
        for (const word of WORDS) if (word !== 'STANDARDIZED') expect(v[word].status, `${word} for gate I id ${id}`).toBe('PASS');
      }
    });

    it('gate G (#38-#40) FAILs only ACCURATE', () => {
      for (const id of [38, 39, 40]) {
        const invariantResults: InvariantResult[] = [{ id, slug: '(registry)', blockedSlugs: [ROW.slug] }];
        const v = stepValidate.computeFiveWordVerdict(ROW, COMPUTE_PATH, invariantResults, []);
        expect(v.ACCURATE.status, `gate G id ${id}`).toBe('FAIL');
        for (const word of WORDS) if (word !== 'ACCURATE') expect(v[word].status, `${word} for gate G id ${id}`).toBe('PASS');
      }
    });

    it('gate E (#32) FAILs only SCALABLE, keyed on the COMPUTE FILE basename, not row.slug', () => {
      // blockedSlugs names the compute-file basename ("fixture-step"), never
      // ROW.slug ("fixture_step") — gate E's own naming split (see header).
      const invariantResults: InvariantResult[] = [{ id: 32, slug: '(registry)', blockedSlugs: ['fixture-step'] }];
      const v = stepValidate.computeFiveWordVerdict(ROW, COMPUTE_PATH, invariantResults, []);
      expect(v.SCALABLE.status).toBe('FAIL');
      for (const word of WORDS) if (word !== 'SCALABLE') expect(v[word].status, word).toBe('PASS');

      // Naming ROW.slug instead (the WRONG token for gate E) must NOT fire —
      // proves the split is honoured, not merely permissive both ways.
      const wrongToken: InvariantResult[] = [{ id: 32, slug: '(registry)', blockedSlugs: [ROW.slug] }];
      const v2 = stepValidate.computeFiveWordVerdict(ROW, COMPUTE_PATH, wrongToken, []);
      expect(v2.SCALABLE.status).toBe('PASS');
    });
  });

  // -------------------------------------------------------------------------
  // T3 — blockedSlugs scoping: a gate failing for a DIFFERENT step leaves
  // this step's own word clean (never "any failure anywhere reds every step").
  // -------------------------------------------------------------------------
  it('T3: a gate failure scoped to a different step does not fail this step\'s word', () => {
    const invariantResults: InvariantResult[] = [{ id: 28, slug: '(registry)', blockedSlugs: ['some_other_step'] }];
    const v = stepValidate.computeFiveWordVerdict(ROW, COMPUTE_PATH, invariantResults, []);
    expect(v.STANDARDIZED.status).toBe('PASS');
  });

  // -------------------------------------------------------------------------
  // T4 — the ledgered-deferred count: a clean gate (no unallowed finding) with
  // N ledger rows scoped to this step under the word's own gate(s) PASSes
  // WITH the count, never a bare PASS indistinguishable from "nothing filed."
  // A ledger row under a DIFFERENT gate, or a different step's own row under
  // the SAME gate, must not be counted.
  // -------------------------------------------------------------------------
  it('T4: deferred count sums only this step\'s own rows under the word\'s mapped gates', () => {
    const ledgerRows: LedgerRow[] = [
      { gate: 'B', step: ROW.slug },
      { gate: 'B', step: ROW.slug },
      { gate: 'E', step: 'fixture-step' }, // gate E's OWN token form — counts
      { gate: 'E', step: ROW.slug }, // wrong token for gate E — must NOT count
      { gate: 'A', step: ROW.slug }, // different word (STANDARDIZED) — must NOT count toward SCALABLE
      { gate: 'B', step: 'some_other_step' }, // different step — must NOT count
    ];
    const v = stepValidate.computeFiveWordVerdict(ROW, COMPUTE_PATH, [], ledgerRows);
    expect(v.SCALABLE.status).toBe('PASS');
    expect(v.SCALABLE.deferred).toBe(3); // 2 gate-B + 1 gate-E (correct token)
    expect(v.SCALABLE.detail).toBe('PASS (3 deferred)');
    expect(v.STANDARDIZED.deferred).toBe(1);
  });

  // -------------------------------------------------------------------------
  // T5 — LIVE: `node scripts/analysis/step-validate.mjs --all --fast` renders
  // a five-word block for every converted step, every status in {PASS, FAIL}.
  // -------------------------------------------------------------------------
  describe('T5: live — --all --fast renders a closed-set five-word verdict per step', () => {
    it('T5: every converted step\'s scorecard block carries all 5 words, each PASS or FAIL', () => {
      const run = spawnSync('node', [SCRIPT_REL, '--all', '--fast'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 180_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      const stdout = `${run.stdout || ''}`;
      const blocks = stdout.split('### Five-word verdict').slice(1);
      expect(blocks.length, `no five-word blocks parsed from stdout:\n${stdout.slice(0, 2000)}`).toBeGreaterThan(0);
      for (const block of blocks) {
        for (const word of WORDS) {
          const m = block.match(new RegExp(`\\|\\s*${word}\\s*\\|\\s*(PASS|FAIL)\\s*\\|`));
          expect(m, `word ${word} not found or not PASS/FAIL in block:\n${block.slice(0, 500)}`).not.toBeNull();
        }
      }
    });

    it('T5b: the console summary line also carries all 5 words for every step', () => {
      const run = spawnSync('node', [SCRIPT_REL, '--all', '--fast'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 180_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      const stdout = `${run.stdout || ''}`;
      const summaryIdx = stdout.indexOf('[step-validate] summary:');
      expect(summaryIdx, `no summary section in stdout:\n${stdout.slice(0, 2000)}`).toBeGreaterThan(-1);
      const summarySection = stdout.slice(summaryIdx);
      const summaryLines = summarySection
        .split('\n')
        .slice(1)
        .filter((l) => /^\s{2}\S+:\s/.test(l) && l.includes('hard-stop='));
      expect(summaryLines.length, `no per-step summary lines in:\n${summarySection.slice(0, 1000)}`).toBeGreaterThan(0);
      for (const line of summaryLines) {
        for (const word of WORDS) {
          expect(line, `word ${word} missing from summary line: ${line}`).toContain(`${word}:`);
        }
      }
    });
  });
});
