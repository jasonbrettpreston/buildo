/**
 * chain-deep-scrapes workflow wiring — the parts that fail SILENTLY if they drift.
 *
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
 * SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3
 * PLAN: .cursor/wf2_deep_scrapes_restore.md (C2, C9, rung L3)
 *
 * Every assertion here pins something that cost a real diagnostic cycle to find and
 * whose regression would be invisible until a scheduled run produced zero rows:
 *   · headed Chrome needs $DISPLAY, and the wrapper must cover the NODE parent so
 *     the variable inherits down to the python child and then to Chrome
 *   · a restored profile cache carries Singleton locks that brick Chrome forever
 *   · the schedule must stay off until the cloud retry/WAF constants are measured
 *   · run-chain.js exits 0 on a scrape-level failure BY DESIGN, so the job needs a
 *     separate verdict read or a totally failed scrape reports green
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORKFLOW = join(process.cwd(), '.github/workflows/chain-deep-scrapes.yml');
const yaml = readFileSync(WORKFLOW, 'utf8');

/** Lines that are actual YAML, not commentary — comments must never satisfy an assertion. */
const activeLines = yaml
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

describe('chain-deep-scrapes workflow', () => {
  describe('headed Chrome under a display server (C9)', () => {
    it('wraps the chain in xvfb-run', () => {
      // A proxied run forces headed Chrome; headless is a first-order bot signal.
      // Without a display server Chrome dies with "cannot open display".
      expect(activeLines).toMatch(/xvfb-run\s+-a\s+node\s+scripts\/run-chain\.js\s+deep_scrapes/);
    });

    it('wraps the node parent, not the python child', () => {
      // run-chain.js spawns python3 with {...process.env}, so $DISPLAY must exist
      // on the shell that starts NODE. Wrapping the python invocation instead
      // would leave the parent without it and is a subtle, silent misconfiguration.
      expect(activeLines).not.toMatch(/xvfb-run[^\n]*python3?/);
    });

    it('installs xvfb', () => {
      expect(activeLines).toMatch(/apt-get install -y xvfb/);
    });
  });

  describe('profile cache (C2)', () => {
    it('does not restore a Chrome profile cache', () => {
      // A cache-restored SingletonLock names a dead host/PID and Chrome then
      // refuses to start. Because an honest verdict means a FAILED run never saves
      // a fresh entry, one poisoned entry is restored forever.
      expect(activeLines).not.toMatch(/actions\/cache/);
      expect(activeLines).not.toMatch(/\.buildo-scraper/);
    });
  });

  describe('schedule (F3 re-enable, 2026-08-05)', () => {
    it('runs on the Spec 115 §2 row 4 cadence', () => {
      // RETIRED LOCK, deliberately: this block previously asserted NO active
      // schedule. That lock's condition — "a dispatch probe must have
      // demonstrated a non-zero row count under these constants, cited to its
      // run id" — was met by the F1 proving slice 31009693871 (2026-08-05):
      // 1,151 year_seqs attempted, 1,086 queue rows retired, anomalous miss
      // rate 3.7%, zero WAF blocks, zero outcome-write failures, budget-stop
      // at 141 min, chain completed_with_warnings with no FAIL verdict.
      // Re-disabling is a one-line comment-out; this assertion is what makes
      // an ACCIDENTAL disable visible.
      // Cadence is ONE slot/weekday (operator ruling 2026-08-05), NOT the 3 the
      // disabled comment block carried: measured drain is ~1,086 queue rows per
      // 150-min slice, so 5 slices/week ~= 5,400/week and ~10K lands in two weeks.
      expect(activeLines).toMatch(/^\s*schedule:/m);
      expect(activeLines).toMatch(/^\s*-\s*cron:\s*'0 15 \* \* 1-5'/m);
    });

    it('is still reachable on demand', () => {
      expect(activeLines).toMatch(/workflow_dispatch:/);
    });

    it('resolves the schedule path to production values, not probe values', () => {
      // The `inputs.X || 'Y'` fallbacks fire ONLY on the schedule path — a
      // workflow_dispatch always populates inputs from their declared
      // defaults, so the probe defaults ('3'/'1'/'12') stay probe-shaped for
      // humans. Before F3 the fallbacks were the probe values too, so every
      // scheduled slice would have scraped 3 permits on a 12-minute timeout.
      expect(activeLines).toMatch(/inputs\.max_permits \|\| '0'/);
      expect(activeLines).toMatch(/inputs\.max_retries \|\| '2'/);
      expect(activeLines).toMatch(/inputs\.chain_timeout_minutes \|\| '150'/);
    });
  });

  describe('job ceiling (P7 stage 2 prep, 2026-08-03)', () => {
    it('job timeout-minutes is 170 — sized from the stage-1 throughput proving run', () => {
      // Stage-1 proving run 30843114683: 100 permits / 12.6 min = 7.5s/permit,
      // miss-rate 5.0%, zero WAF blocks. A 150-min chain timeout ≈ 1,200
      // permits at that rate; 170 = 150 largest-expected chain timeout +
      // setup headroom. Slots are 3h apart, so 150 keeps a run inside its
      // slot before the concurrency guard would skip the next. The old 45
      // was probe-shaped and would kill any full-throughput stage-2 run.
      expect(activeLines).toMatch(/^\s*timeout-minutes:\s*170\s*$/m);
    });
  });

  describe('soft time-budget self-stop (F1, 2026-08-04)', () => {
    it('exports SCRAPER_TIME_BUDGET_MINUTES as the chain timeout minus 10, shell-computed', () => {
      // Stage-2 drain run 30854595411: a healthy time-bounded drain was
      // hard-killed by the GH step timeout mid-scrape — orphaned
      // pipeline_runs rows, stuck claimed queue rows, red verdict every
      // slice. The scraper stops claiming 10 min before the hard kill and
      // finalizes clean; the step timeout-minutes stays as the backstop.
      // GH expressions have no arithmetic, so the -10 lives in the run
      // shell, fed by the same `inputs.chain_timeout_minutes || '12'`
      // expression family the step timeout uses.
      expect(activeLines).toMatch(/SCRAPER_TIME_BUDGET_MINUTES/);
      // The fallback moved 12 -> 150 with F3 (schedule path = production
      // values); the -10 arithmetic and its shell location are unchanged.
      expect(activeLines).toMatch(/chain_timeout_minutes \|\| '150'[^\n]*\}\}\s*-\s*10/);
    });
  });

  describe('failure detection', () => {
    it('reads the DB-recorded verdict separately from the process exit code', () => {
      // aic-orchestrator.py exits 0 on a scrape-level failure BY DESIGN, so a job
      // gating only on run-chain.js's exit code reports GREEN on a scrape that
      // produced nothing — the exact blindness this chain's observability exists
      // to remove.
      expect(activeLines).toMatch(/check-chain-verdict\.js\s+deep_scrapes/);
    });

    it('runs the verdict check even when the chain step failed', () => {
      expect(activeLines).toMatch(/if:\s*always\(\)/);
    });
  });
});
