// 🔗 SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2 (step ceilings + soft budgets)
// 🔗 SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §3 (stop-mechanism layers)
// 🔗 SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §9.3 ①
//
// P3 (2026-08-24) — chain-sources envelope. Source locks on chain-sources.yml,
// the LAST chain workflow with a hardcoded ceiling and no budget wiring at all.
//
// THE MEASUREMENT (re-taken 2026-08-24, because the two inherited figures read
// as a contradiction and are not one — they measure different objects):
//
//   platform per-job maximum (GitHub-hosted)  360   fixed, not ours
//   job    timeout-minutes  (`:20`)           210   → 330
//   step   timeout-minutes  (`:72`)           180   → 300
//   CHAIN_TIME_BUDGET_MINUTES                 unset → 290   (run-chain self-stop; :468 reads 0 = INERT)
//   CHAIN_DURATION_BUDGET_MINUTES             unset → 300   (verdict tripwire; INERT)
//   manifest step_timeout_minutes             1 of 27 steps (refresh_snapshot: 15) — UNCHANGED
//
//   "180 of 360 used"        = step ceiling vs platform max.
//   "150 minutes of headroom" = 360 − 210, i.e. platform max vs the JOB ceiling.
//   Both are true. Neither is actionable alone: the step can never exceed the
//   job, so buying room for the chain means raising BOTH numbers.
//
// THE ARITHMETIC:
//   job 330  = 360 platform max − 30 reserved (never run to the platform wall)
//   step 300 = 330 job − 30 measured overhead (checkout + setup-node + npm ci +
//              migrate --verify + guards + verdict; today's 210 − 180 = 30, preserved)
//   budget 290 = ceiling − 10, the convention already shipped on both siblings
//   tripwire 300 = ceiling; check-chain-verdict warns past 80% → 240 min
//
//   Observed high-water mark for a run that finished: 181.9 min (2026-07-07,
//   `docs/reports/2026-08-22-sources-chain-evidence-base.md` §5b, 11 cloud runs;
//   the other completions are 97.4–147.0). 290 clears 181.9 by 108.1 min;
//   the tripwire fires 58.1 min above the worst observed run, so it warns on an
//   anomaly rather than on a normal Sunday.
//
// NOT raised: per-step `step_timeout_minutes` in scripts/manifest.json. The only
// per-step duration source is `pipeline_runs`, and the evidence base establishes
// those statistics are poisoned by the 39-day strand (link_parcels read 2,447 min
// against a 0.3-min median). A per-step axe set from poisoned data kills healthy
// steps. That waits on a clean post-P2 run.
//
// Model: chain-coa-permits-workflow.infra.test.ts (same single-source P1 pattern).
// Run: npx vitest run src/tests/chain-sources-workflow.infra.test.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ⚠️ CRLF normalization is load-bearing on a Windows checkout (core.autocrlf=true,
// no .gitattributes yet — P0b item 2). JS `.` and `$` do not match past a `\r`, so a
// `/m`-anchored regex over a CRLF file silently never matches and every lock in this
// file would pass vacuously. Found the hard way writing the sibling suite.
const yaml = readFileSync(join(process.cwd(), '.github/workflows/chain-sources.yml'), 'utf8').replace(/\r\n/g, '\n');
/** Lines that are actual YAML, not commentary — a comment must never satisfy an assertion. */
const activeLines = yaml
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

describe('chain-sources.yml — ceilings raised into measured headroom', () => {
  it('the chain step reads a single-source job-env var (no second hardcode — Pipeline Rehab P1)', () => {
    expect(activeLines).toMatch(/SOURCES_STEP_TIMEOUT_MINUTES:\s*'300'/);
    expect(activeLines).toMatch(/timeout-minutes:\s*\$\{\{\s*fromJSON\(env\.SOURCES_STEP_TIMEOUT_MINUTES\)\s*\}\}/);
  });

  it('job timeout = 330 (360 platform max − 30 reserved), was 210', () => {
    expect(activeLines).toMatch(/^\s*timeout-minutes:\s*330\b/m);
    expect(activeLines).not.toMatch(/^\s*timeout-minutes:\s*210\b/m);
  });

  it('the old hardcoded 180-minute step ceiling is gone', () => {
    expect(activeLines).not.toMatch(/timeout-minutes:\s*180\b/);
  });

  it('job ceiling stays under the 360-minute platform maximum with a reserve', () => {
    const job = Number(activeLines.match(/^\s*timeout-minutes:\s*(\d+)\b/m)?.[1]);
    expect(job).toBeGreaterThan(0);
    expect(job).toBeLessThanOrEqual(330);
    expect(360 - job).toBeGreaterThanOrEqual(30);
  });

  it('step ceiling leaves the measured 30-minute job overhead intact', () => {
    const job = Number(activeLines.match(/^\s*timeout-minutes:\s*(\d+)\b/m)?.[1]);
    const step = Number(activeLines.match(/SOURCES_STEP_TIMEOUT_MINUTES:\s*'(\d+)'/)?.[1]);
    expect(job - step).toBeGreaterThanOrEqual(30);
  });
});

describe('chain-sources.yml — the budget env vars are no longer inert (Spec 120 §9.3 ①)', () => {
  it('the chain step computes and exports CHAIN_TIME_BUDGET_MINUTES from its own ceiling', () => {
    // Headroom without a self-stop just moves the wall. The budget is what turns
    // a hard kill into a clean stop with a recorded reason on every remaining step.
    expect(activeLines).toMatch(/fromJSON\(env\.SOURCES_STEP_TIMEOUT_MINUTES\)\s*\}\}\s*-\s*10/);
    expect(activeLines).toMatch(/export CHAIN_TIME_BUDGET_MINUTES/);
  });

  it('the budget is clamped at 0 (the deep-scrapes precedent — a negative budget must read as disabled)', () => {
    expect(activeLines).toMatch(/-lt 0/);
  });

  it('the verdict step feeds CHAIN_DURATION_BUDGET_MINUTES from the SAME ceiling (the 80% tripwire)', () => {
    // This is the warning the 2026-08-03 run never got before it died at 180.
    expect(activeLines).toMatch(/CHAIN_DURATION_BUDGET_MINUTES:\s*\$\{\{\s*env\.SOURCES_STEP_TIMEOUT_MINUTES\s*\}\}/);
  });
});

describe('chain-sources.yml — regression locks on what the ceiling change must NOT disturb', () => {
  it('the concurrency group is still derived from the workflow name and never cancels in flight', () => {
    expect(activeLines).toMatch(/group:\s*\$\{\{\s*github\.workflow\s*\}\}/);
    expect(activeLines).toMatch(/cancel-in-progress:\s*false/);
  });

  it('the verdict check still runs on always() — an exit-0 verdict FAIL must not show green', () => {
    expect(activeLines).toMatch(/check-chain-verdict\.js sources/);
    expect(activeLines).toMatch(/if:\s*always\(\)\s*&&\s*steps\.sources_guard\.outputs\.skip\s*!=\s*'true'/);
  });

  it('the env guard, migrate --verify pre-flight and data/ mkdir survive', () => {
    expect(activeLines).toMatch(/migrate\.js --verify/);
    expect(activeLines).toMatch(/mkdir -p data/);
    expect(activeLines).toMatch(/SUPABASE_CA_CERT_PATH/);
  });
});
