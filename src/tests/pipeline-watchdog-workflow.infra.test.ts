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

describe('pipeline-watchdog.yml — cron moved past typical same-day completion (WF3 F5, Spec 118 §2, 2026-08-15)', () => {
  // The "two-red geometry": the OLD 15:30 UTC cron fired BEFORE that day's
  // deep_scrapes slot typically completes (~18:15Z), so a recovered day always
  // read red-then-green (the failure itself, then the next MORNING's watchdog,
  // because the recovery run hadn't finished by 15:30Z). >= 18:30Z keeps the
  // check comfortably after the typical ~18:15Z completion without requiring
  // an exact string match on the literal minute chosen (18:45).
  it('the schedule cron fires at or after 18:30 UTC', () => {
    const src = workflow();
    const m = src.match(/^\s*-\s*cron:\s*'(\d{1,2}) (\d{1,2}) \* \* \*'/m);
    expect(m, 'schedule cron line not found').toBeTruthy();
    const [, minuteStr, hourStr] = m!;
    const totalMinutes = Number(hourStr) * 60 + Number(minuteStr);
    expect(totalMinutes).toBeGreaterThanOrEqual(18 * 60 + 30);
  });

  it('the stale claim that the schedule block "is committed" + "COMMENTED OUT" is gone — the header must say the block is LIVE', () => {
    // Strip each line's leading `# ` comment marker and join before matching —
    // the stale claim spanned two comment LINES ("...is committed\n#
    // COMMENTED OUT..."), so a plain multi-line regex on the raw file (with
    // the marker still in the way) would silently never match either
    // direction of this lock. Same self-ban-blind-spot class as F3's
    // check-chain-verdict.js LIMIT-1 lock, which had the identical failure
    // mode for the identical reason.
    const flattened = workflow()
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*#\s?/, ''))
      .join(' ');
    expect(flattened).not.toMatch(/is committed\s+COMMENTED OUT/);
    expect(flattened).toMatch(/schedule.{0,40}(is a LIVE cron|live cron)/i);
  });
});

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

describe('pipeline-watchdog.yml — missing-migration ESCALATION (WF3 2026-08-09, Spec 115 §2.5)', () => {
  // The 238 outage: the fleet's chain pre-flights failed for 49h while the watchdog stayed GREEN
  // for ~25h (its migrate-verify was advisory-::warning; only freshness eventually reddened it,
  // unlabeled). Escalation: the EXISTING annotation goes ::error and ONE end-of-job gate reds the
  // job immediately — while the P5 fence (verify stays continue-on-error, backup_fallback still
  // executes, freshness choreography untouched) holds byte-for-byte.
  const src = workflow();
  const active = src.split('\n').filter((l: string) => !l.trim().startsWith('#')).join('\n');

  it('the schema pre-flight annotation is ::error (was ::warning) and keeps the runbook pointer', () => {
    expect(active).toMatch(/::error[^\n]*(migration|Schema)/i);
    expect(active).toMatch(/runbook/);
  });

  it('the verify step KEEPS continue-on-error: true (the P5 fence — never blocks the backup fallback)', () => {
    const verifyBlock = src.slice(src.indexOf('watchdog_migrate_verify'));
    expect(verifyBlock.slice(0, 400)).toMatch(/continue-on-error:\s*true/);
  });

  it('an end-of-job gate reds the job on verify failure, AFTER freshness_recheck, gated if: always()', () => {
    // The annotate step carries the SAME outcome condition earlier in the file — the GATE is the
    // LAST occurrence, and it must sit after the LAST freshness_recheck reference.
    const gateIdx = active.lastIndexOf("watchdog_migrate_verify.outcome == 'failure'");
    const recheckIdx = active.lastIndexOf('freshness_recheck');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(recheckIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(recheckIdx); // additive-after, never ahead of the choreography
    const gateBlock = active.slice(gateIdx - 200, gateIdx + 300);
    expect(gateBlock).toMatch(/always\(\)/);
    expect(gateBlock).toMatch(/exit 1/);
  });
});
