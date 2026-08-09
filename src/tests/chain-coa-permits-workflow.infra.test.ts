// 🔗 SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2 (step ceilings + soft budgets, WF3 2026-08-09)
//
// Source locks on chain-coa-permits.yml's evidence-based ceilings + per-step shell-computed soft
// budgets. Ceilings: coa 120 (the 102-min ungated backlog-recovery run outran the old 90 — §2.2's
// "coa 90 deliberate" re-litigated in place on its own measured-overrun terms), permits 150 (6/6
// recent nightlies ran UNGATED at 78–118.5 min; a clean 118.5-min run refuted both the old comment's
// "no run >90 min" premise and a timeout−10=110 budget). Budgets are shell arithmetic (GH
// expressions have none — the deep-scrapes precedent). Model: deep-scrapes-workflow.infra.test.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const yaml = readFileSync(join(process.cwd(), '.github/workflows/chain-coa-permits.yml'), 'utf8');
/** Lines that are actual YAML, not commentary — comments must never satisfy an assertion. */
const activeLines = yaml
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

describe('chain-coa-permits.yml — step ceilings (single-source P1 pattern)', () => {
  it('coa ceiling is the job-env var COA_STEP_TIMEOUT_MINUTES = 120 (was a hardcoded 90)', () => {
    expect(activeLines).toMatch(/COA_STEP_TIMEOUT_MINUTES:\s*'120'/);
    expect(activeLines).toMatch(/timeout-minutes:\s*\$\{\{\s*fromJSON\(env\.COA_STEP_TIMEOUT_MINUTES\)\s*\}\}/);
  });

  it('permits ceiling raised to 150 (observed clean 118.5-min ungated run, rising trend)', () => {
    expect(activeLines).toMatch(/PERMITS_STEP_TIMEOUT_MINUTES:\s*'150'/);
  });

  it('job timeout = 300 (120 coa + 150 permits + 30 setup headroom)', () => {
    expect(activeLines).toMatch(/^\s*timeout-minutes:\s*300\b/m);
  });
});

describe('chain-coa-permits.yml — soft time-budgets (ceiling − 10, shell-computed, clamped)', () => {
  it('the coa step computes and exports CHAIN_TIME_BUDGET_MINUTES from its own ceiling', () => {
    expect(activeLines).toMatch(/fromJSON\(env\.COA_STEP_TIMEOUT_MINUTES\)\s*\}\}\s*-\s*10/);
  });

  it('the permits step computes and exports CHAIN_TIME_BUDGET_MINUTES from its own ceiling', () => {
    expect(activeLines).toMatch(/fromJSON\(env\.PERMITS_STEP_TIMEOUT_MINUTES\)\s*\}\}\s*-\s*10/);
  });

  it('budgets are clamped at 0 (the deep-scrapes precedent — negative budget must read disabled)', () => {
    expect(activeLines).toMatch(/-lt 0/);
  });

  it('exports the run-chain env name CHAIN_TIME_BUDGET_MINUTES (distinct from the verdict tripwire CHAIN_DURATION_BUDGET_MINUTES)', () => {
    expect(activeLines).toMatch(/export CHAIN_TIME_BUDGET_MINUTES/);
  });
});

describe('chain-coa-permits.yml — coa duration tripwire (Int F7: coa had none)', () => {
  it('coa_verdict feeds CHAIN_DURATION_BUDGET_MINUTES from the coa ceiling', () => {
    expect(activeLines).toMatch(/CHAIN_DURATION_BUDGET_MINUTES:\s*\$\{\{\s*env\.COA_STEP_TIMEOUT_MINUTES\s*\}\}/);
  });
});
