// SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §3, §7.2
// SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md §5.4.1
//
// WF3 F2 (2026-08-15) — Layer 3 of the stop-mechanism hierarchy: per-step ceilings
// in run-chain.js. The missing layer Spec 118 §3 names ("a pathological step must
// die in minutes at run-chain's hands, not at the platform's").
//
// `step_timeout_minutes` is read from manifest.scripts[slug] (absent/0 = inert,
// matching layers 1/2's convention) and enforced via spawn timeout/kill in the
// executor. DESIGN (WF3 JOINT FOLD-VALIDATION, W5): a ceiling kill is HALTING —
// Spec 30 §5.4.1 criterion 1 treats "I could not run this step" as exception-class,
// so a killed child flows through the SAME catch/failedStep path any other step
// failure does. No ladder edit; run-chain-budget.logic.test.ts's OK_STATUSES lock
// and the B2 defer-mechanism locks are untouched by this file.
//
// Two halves:
//   (a) manifest -> plumbing: the shape lock (source regex + manifest.json content).
//   (b) the real mechanism: spawnStepChild(), spawning an ACTUAL child process
//       (no manifest, no chain, no DB) that sleeps well past a millisecond-scale
//       ceiling — the promise must reject with err.stepTimedOut === true and the
//       child must actually die (not just be abandoned).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real module's exports
const runChain = require(join(process.cwd(), 'scripts/run-chain.js'));

const SRC = readFileSync(join(process.cwd(), 'scripts/run-chain.js'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(join(process.cwd(), 'scripts/manifest.json'), 'utf8'));

describe('run-chain.js — WF3 F2 step-timeout plumbing (Spec 118 §3/§7.2)', () => {
  // FENCE KNOWINGLY WIDENED — EP-PHASE-DEADLINE (WF3, 2026-09-15). This assertion read
  // `['refresh_snapshot']` from `766424fe` onward: "the proven pathological step, and ONLY
  // it". The scoping was never squeamishness — its reason is written out in
  // chain-sources-workflow.infra.test.ts:36-45 ("NOT raised: per-step
  // step_timeout_minutes ... the evidence base establishes those statistics are poisoned
  // by the 39-day strand (link_parcels read 2,447 min against a 0.3-min median). A
  // per-step axe set from poisoned data kills healthy steps."). That reason still stands
  // for the other ten steps declaring `execution.step_timeout`, which is why they remain
  // INERT and are carried as a DECLARED gap in
  // `scripts/steps/_schema/execution-budget-disposition.json`'s `pending[]` rather than
  // wired blind. It does NOT stand for `enrich_parcels`, which now has its own clean
  // measurements: a COMPLETED run at 142.7 min (pipeline_runs 4588, 2026-09-10
  // 18:02:40 -> 20:25:21) and a run KILLED at the 300-min CI wall clock (gh run
  // 34971921328, 2026-09-15, main@824ef357) having spent 94.4 min in one phase against a
  // declared 75-min bound that was structurally incapable of firing. 180 clears the
  // 142.7-min completion by 37.3 min and sits 120 min below the CI ceiling — the middle
  // rung of the Spec 118 §3 ladder (CI 300 > step 180 > phase 75), which is locked
  // rung-by-rung from each rung's own source file in
  // src/tests/execution-budget-disposition.infra.test.ts. Note the chain-level high-water
  // in that sibling file (181.9 min, 11 cloud runs, 2026-07-07) is the WHOLE CHAIN, not
  // this step — cited here only because it is the number that fence was set against.
  it('manifest step_timeout_minutes is declared for exactly the steps with a clean measured ceiling — refresh_snapshot (15) and enrich_parcels (180)', () => {
    expect(MANIFEST.scripts.refresh_snapshot.step_timeout_minutes).toBe(15);
    expect(MANIFEST.scripts.enrich_parcels.step_timeout_minutes).toBe(180);
    const withTimeout = Object.entries(MANIFEST.scripts as Record<string, { step_timeout_minutes?: number }>)
      .filter(([, entry]) => entry.step_timeout_minutes !== undefined)
      .map(([slug]) => slug)
      .sort();
    expect(
      withTimeout,
      'a THIRD step gained a run-chain ceiling: that is a fence, not a default. Wire one only with its own measured completion high-water (a ceiling below a step\'s real runtime turns a healthy run into a failure — chain-sources-workflow.infra.test.ts:36-45), and register it in scripts/steps/_schema/execution-budget-disposition.json wired[] so the descriptor/manifest drift lock covers it.',
    ).toEqual(['enrich_parcels', 'refresh_snapshot']);
  });

  it('the executor reads step_timeout_minutes from the CURRENT step\'s manifest entry', () => {
    expect(SRC).toMatch(/scriptEntry\.step_timeout_minutes/);
  });

  it('spawnStepChild is exported and called from the executor with the read ceiling', () => {
    expect(typeof runChain.spawnStepChild).toBe('function');
    expect(SRC).toMatch(/spawnStepChild\(\{[\s\S]{0,120}timeoutMinutes: stepTimeoutMinutes/);
  });

  it('a killed-on-ceiling child is tagged err.stepTimedOut, read by the catch block into failMeta.reason', () => {
    expect(SRC).toMatch(/err\.stepTimedOut\s*=\s*true/);
    expect(SRC).toMatch(/reason:\s*'step_timeout'/);
  });

  it('the timeout mechanism is INERT at 0 (absent) — matches layers 1/2\'s convention', () => {
    expect(SRC).toMatch(/if \(timeoutMinutes > 0\)/);
  });

  it('DESIGN: a ceiling kill is HALTING — no new non-halting ladder branch was added', () => {
    // The settled W5 ruling: failedStep is set unconditionally in the existing
    // catch (no `if (!err.stepTimedOut) failedStep = slug` carve-out), and no new
    // chainStatus literal was introduced for this class.
    expect(SRC).not.toMatch(/stepTimedOut[\s\S]{0,200}completed_with_warnings/);
    expect(SRC).not.toMatch(/stepTimedOut[\s\S]{0,200}completed_with_errors/);
  });

  it('--manifest= is a TEST-ONLY CLI override, defaulting to the real manifest.json', () => {
    expect(SRC).toMatch(/--manifest=/);
    expect(SRC).toMatch(/path\.resolve\(__dirname, 'manifest\.json'\)/);
  });
});

describe('run-chain.js — spawnStepChild() (real child process, no manifest/chain/DB)', () => {
  it('timeoutMinutes = 0 (inert) lets a fast-exiting child resolve normally', async () => {
    const result = await runChain.spawnStepChild({
      runtime: process.execPath,
      scriptPath: '-e',
      args: ["console.log('PIPELINE_SUMMARY:' + JSON.stringify({records_total: 1}))"],
      env: process.env,
      timeoutMinutes: 0,
    });
    expect(result).toMatch(/PIPELINE_SUMMARY:/);
  }, 15_000);

  it('a child exceeding the ceiling is KILLED and the promise rejects with err.stepTimedOut', async () => {
    const start = Date.now();
    // Sleeps 10s — the process itself is the proof it never gets there un-killed.
    await expect(
      runChain.spawnStepChild({
        runtime: process.execPath,
        scriptPath: '-e',
        args: ['setTimeout(() => {}, 10000)'],
        env: process.env,
        // 0.01 min = 600ms — the child must be dead well before its own 10s sleep
        // ends. Wide enough to absorb `node -e` cold-start (module load + V8 init,
        // observed flaky at 60ms under full-suite load) without losing the "near
        // the ceiling, not after the 10s sleep" proof below.
        timeoutMinutes: 0.01,
      }),
    ).rejects.toMatchObject({ stepTimedOut: true });
    // The kill fired near the ceiling, not after the child's own 10s sleep.
    expect(Date.now() - start).toBeLessThan(5000);
  }, 15_000);

  it('a normally-failing child (non-zero exit, no timeout armed) rejects WITHOUT stepTimedOut', async () => {
    let caught: unknown;
    try {
      await runChain.spawnStepChild({
        runtime: process.execPath,
        scriptPath: '-e',
        args: ['process.exit(1)'],
        env: process.env,
        timeoutMinutes: 0,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { stepTimedOut?: boolean }).stepTimedOut).not.toBe(true);
  }, 15_000);

  it('PIPELINE_SUMMARY lines emitted BEFORE the kill survive on err.summaryLines', async () => {
    try {
      await runChain.spawnStepChild({
        runtime: process.execPath,
        scriptPath: '-e',
        args: [
          "console.log('PIPELINE_SUMMARY:' + JSON.stringify({records_total: 3}));" +
          'setTimeout(() => {}, 10000);',
        ],
        env: process.env,
        // 0.05 min = 3s, NOT the sibling's 600ms. This test's property is "the summary line
        // printed BEFORE the kill survives", so the child must reach console.log before the
        // ceiling fires; under a full-suite hook run `node -e` cold-start exceeded 600ms four
        // times on 2026-09-14 (POST-B1-5) and the child died before printing. 3s is a 5x
        // margin on the worst observed cold-start and still 3x under the child's own 10s
        // sleep, so the kill — not the sleep — is still what ends the child.
        timeoutMinutes: 0.05,
      });
      throw new Error('expected rejection');
    } catch (err: unknown) {
      expect((err as { stepTimedOut?: boolean }).stepTimedOut).toBe(true);
      expect((err as { summaryLines?: string }).summaryLines).toMatch(/PIPELINE_SUMMARY:/);
    }
  }, 15_000);
});
