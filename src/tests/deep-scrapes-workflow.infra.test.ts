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

  describe('schedule safety', () => {
    it('has no active cron schedule', () => {
      // Disabled until the cloud retry/WAF constants are measured. The restored
      // defaults are correct for the attested unproxied local path and known-wrong
      // for a hostile Akamai edge; guessing them produced a 1.76 GB / ~$6.60 run.
      expect(activeLines).not.toMatch(/^\s*schedule:/m);
      expect(activeLines).not.toMatch(/^\s*-\s*cron:/m);
    });

    it('is still reachable on demand', () => {
      expect(activeLines).toMatch(/workflow_dispatch:/);
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
