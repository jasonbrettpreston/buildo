// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.5
// SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md §6
//
// Pipeline Rehab P5 (2026-08-03) — the watchdog was a CORRECT alarm with a
// muted voice, and its backup safety net was live-suppressed during the exact
// outage it exists for:
//   1. `>> "$GITHUB_OUTPUT"` on both check-pipeline-freshness.js invocations
//      swallowed ALL stdout — including the `::error` annotations naming
//      WHICH chain is stale — into the outputs file (the 2026-07-31 red run
//      required log-elimination archaeology; review_followups ~:2833). The
//      script self-writes its outputs via writeOutput() (:112-119), so the
//      shell redirect was pure harm.
//   2. backup_fallback was gated on `chains_fresh == 'true'`, so a stale
//      chain (the 2026-08-03 live incident: permits step-timeout-killed
//      before its backup_db final step, backups 50.7h stale) DISABLED the
//      very safety net designed for that failure. Spec 112 §6 describes the
//      DECOUPLED behavior; the yml deviated.
// The `permits_running` race guard is load-bearing and must be RETAINED
// (an in-flight permits chain may complete its own backup_db moments later —
// a concurrent direct backup-db.js would double-run it).

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const workflow = () =>
  fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/pipeline-watchdog.yml'), 'utf-8');

describe('pipeline-watchdog.yml — un-muted freshness alarm (P5)', () => {
  it('neither check-pipeline-freshness.js invocation redirects stdout into $GITHUB_OUTPUT (the script self-writes outputs; the redirect swallowed the ::error naming the stale chain)', () => {
    const src = workflow();
    const freshnessLines = src.split('\n').filter((l) => l.includes('check-pipeline-freshness.js'));
    expect(freshnessLines.length).toBeGreaterThanOrEqual(2); // initial + final
    for (const line of freshnessLines) {
      expect(line).not.toContain('$GITHUB_OUTPUT');
    }
  });

  it('scope pin: only the watchdog loses redirects — check-chain-running.js guard invocations in the CHAIN workflows keep theirs (out of P5 scope)', () => {
    // chain-coa-permits.yml's guard redirects are REDUNDANT (the guard also
    // self-writes via writeOutput()) but not load-bearing harm; cleaning them
    // is a separate follow-up, deliberately untouched here.
    const coaPermits = fs.readFileSync(
      path.resolve(__dirname, '../../.github/workflows/chain-coa-permits.yml'),
      'utf-8',
    );
    const guardLines = coaPermits.split('\n').filter((l) => l.includes('check-chain-running.js'));
    expect(guardLines.length).toBeGreaterThanOrEqual(2);
    for (const line of guardLines) {
      expect(line).toContain('$GITHUB_OUTPUT');
    }
  });
});

describe('pipeline-watchdog.yml — backup fallback decoupled from chain freshness (P5, Spec 112 §6 conformance)', () => {
  const backupFallbackIf = () => {
    const src = workflow();
    const m = src.match(/id: backup_fallback\s*\n\s*if:[\s\S]*?\n\s*run:/);
    expect(m).not.toBeNull();
    return m![0];
  };

  it('backup_fallback is NOT gated on chains_fresh — a stale chain must never suppress the backup safety net (live incident 2026-08-03)', () => {
    expect(backupFallbackIf()).not.toContain('chains_fresh');
  });

  it('backup_fallback RETAINS the permits_running race guard and the backup_fresh trigger', () => {
    const cond = backupFallbackIf();
    expect(cond).toContain("outputs.permits_running != 'true'");
    expect(cond).toContain("outputs.backup_fresh != 'true'");
  });
});
