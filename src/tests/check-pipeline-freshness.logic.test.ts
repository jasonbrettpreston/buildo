// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.5
// SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md §6, §7
//
// Parse-smoke + pure-logic test for scripts/check-pipeline-freshness.js —
// the pipeline-watchdog.yml daily freshness check (P3-D9). Exercises only
// the pure writeOutput helper and the BACKUP_SLUGS/FRESHNESS_WINDOW_HOURS
// constants; the DB-querying run()/hasCompletedWithin() path connects via
// SUPABASE_DATABASE_URL — not exercised here without a live DB (mirrors
// check-chain-running.logic.test.ts's / check-chain-verdict.logic.test.ts's
// pure-logic-only scope).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const checkPipelineFreshness = require('../../scripts/check-pipeline-freshness.js') as {
  writeOutput: (key: string, value: string) => void;
  deepScrapesWindow: (utcDay: number) => { applies: boolean; windowHours: number | null };
  FRESHNESS_WINDOW_HOURS: number;
  CHAIN_WINDOWS_HOURS: Record<string, number>;
  BACKUP_SLUGS: string[];
  RAN_STATUSES: string[];
};

describe('check-pipeline-freshness.js — script presence', () => {
  it('exists in scripts/ directory', () => {
    const scriptPath = require.resolve('../../scripts/check-pipeline-freshness.js');
    expect(scriptPath).toMatch(/check-pipeline-freshness\.js$/);
  });

  it('exports writeOutput, run, hasCompletedWithin, deepScrapesWindow, FRESHNESS_WINDOW_HOURS, CHAIN_WINDOWS_HOURS, BACKUP_SLUGS, RAN_STATUSES', () => {
    expect(typeof checkPipelineFreshness.writeOutput).toBe('function');
    expect(typeof checkPipelineFreshness.deepScrapesWindow).toBe('function');
    expect(typeof checkPipelineFreshness.FRESHNESS_WINDOW_HOURS).toBe('number');
    expect(typeof checkPipelineFreshness.CHAIN_WINDOWS_HOURS).toBe('object');
    expect(Array.isArray(checkPipelineFreshness.BACKUP_SLUGS)).toBe(true);
    expect(Array.isArray(checkPipelineFreshness.RAN_STATUSES)).toBe(true);
  });
});

describe('check-pipeline-freshness.js — constants (Spec 115 §2.5 / Spec 112 §6, P3-G6, F8 fold 2026-07-20)', () => {
  it('FRESHNESS_WINDOW_HOURS is 25 — the Spec 07 §OP4 / Spec 115 §2.5 SLA (chain_coa/chain_permits/backup)', () => {
    expect(checkPipelineFreshness.FRESHNESS_WINDOW_HOURS).toBe(25);
  });

  it('BACKUP_SLUGS matches both row shapes backup_db can be written under', () => {
    expect(checkPipelineFreshness.BACKUP_SLUGS.sort()).toEqual(
      ['backup_db', 'permits:backup_db'].sort()
    );
  });

  // ⑦d (Phase B B0 item 7, v6.1 CORRECTIONS X-5 — "same class as ⑦d"): RAN_STATUSES
  // must absorb the new `deferred_to_full` chain status (D2′ — a deferring chain
  // still landed fresh data through its completed steps; check-pipeline-freshness.js
  // does absence detection only, and a defer is not an absence). Edited HERE per the
  // B0 item 7 case table's own instruction ("edit check-pipeline-freshness.logic.test.ts
  // :54-58 instead if that's the canonical lock") rather than duplicated in
  // run-chain-defer.logic.test.ts — this IS the canonical RAN_STATUSES lock. RED TODAY:
  // the source export is still the 3-element set.
  it('RAN_STATUSES is the FOUR-status "chain landed data" set — excludes failed/cancelled (✓red — 4th element not yet added)', () => {
    expect(checkPipelineFreshness.RAN_STATUSES.sort()).toEqual(
      ['completed', 'completed_with_errors', 'completed_with_warnings', 'deferred_to_full'].sort()
    );
  });

  it('CHAIN_WINDOWS_HOURS covers coa/permits/sources/entities with the F8-fold windows (deep_scrapes is date-aware, not here)', () => {
    expect(checkPipelineFreshness.CHAIN_WINDOWS_HOURS).toEqual({
      chain_coa: 25,
      chain_permits: 25,
      chain_sources: 204,
      chain_entities: 26,
    });
  });
});

describe('check-pipeline-freshness.js — deepScrapesWindow (F8 fold 2026-07-20, weekday-aware)', () => {
  it('does not apply on Saturday (6) or Sunday (0)', () => {
    expect(checkPipelineFreshness.deepScrapesWindow(0)).toEqual({ applies: false, windowHours: null });
    expect(checkPipelineFreshness.deepScrapesWindow(6)).toEqual({ applies: false, windowHours: null });
  });

  it('applies with an 83h window on Monday (1) — reaches back through the weekend', () => {
    // RE-DERIVED 80 -> 83 (WF3 F5, 2026-08-15): pipeline-watchdog.yml's own cron
    // moved 15:30 -> 18:45 UTC in the SAME commit (closes the "two-red geometry",
    // Spec 118 §2 — the old check fired BEFORE that day's slot typically
    // completed, so a recovered day always read red-then-green). The watchdog's
    // clock moved later by exactly 18:45 - 15:30 = 3h15m, so the gap from
    // "yesterday's earliest plausible completion" to "today's check" grew by
    // that same 3h15m — additive re-derivation preserves the EXACT prior margin:
    // 80h + 3h15m = 83h15m, rounded DOWN to 83h (never overstates the margin).
    expect(checkPipelineFreshness.deepScrapesWindow(1)).toEqual({ applies: true, windowHours: 83 });
  });

  it('applies with a 33h window Tuesday(2) through Friday(5)', () => {
    // RE-DERIVED 30 -> 33 for the identical reason: 30h + 3h15m = 33h15m,
    // rounded down to 33h.
    for (const day of [2, 3, 4, 5]) {
      expect(checkPipelineFreshness.deepScrapesWindow(day)).toEqual({ applies: true, windowHours: 33 });
    }
  });
});

describe('check-pipeline-freshness.js — writeOutput', () => {
  let tmpDir: string | null = null;
  const ORIGINAL_GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;

  afterEach(() => {
    if (ORIGINAL_GITHUB_OUTPUT === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = ORIGINAL_GITHUB_OUTPUT;
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('appends key=value to $GITHUB_OUTPUT when set (the GitHub Actions contract)', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'check-pipeline-freshness-test-'));
    const outputFile = join(tmpDir, 'github_output');
    writeFileSync(outputFile, '');
    process.env.GITHUB_OUTPUT = outputFile;

    checkPipelineFreshness.writeOutput('chains_fresh', 'true');
    checkPipelineFreshness.writeOutput('backup_fresh', 'false');
    checkPipelineFreshness.writeOutput('permits_running', 'false');

    expect(readFileSync(outputFile, 'utf-8')).toBe(
      'chains_fresh=true\nbackup_fresh=false\npermits_running=false\n'
    );
  });

  it('falls back to console.log "key=value" when $GITHUB_OUTPUT is unset (local/manual invocation)', () => {
    delete process.env.GITHUB_OUTPUT;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    checkPipelineFreshness.writeOutput('chains_fresh', 'true');
    expect(logSpy).toHaveBeenCalledWith('chains_fresh=true');
    logSpy.mockRestore();
  });
});

describe('check-pipeline-freshness.js — source-scan invariants', () => {
  it('never decides whether to run the backup-db.js fallback itself — no spawn/exec of backup-db.js', () => {
    // Spec 115 §2.5: the WORKFLOW invokes the fallback, not this script.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/check-pipeline-freshness.js'),
      'utf-8'
    );
    expect(source).not.toMatch(/spawn\(.*backup-db/);
    expect(source).not.toMatch(/exec\(.*backup-db/);
  });

  it('exits 0 only when both chains_fresh and backup_fresh are true (source-level contract)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/check-pipeline-freshness.js'),
      'utf-8'
    );
    expect(source).toMatch(/chainsFresh\s*&&\s*backupFresh/);
  });

  it('reuses scripts/lib/chain-concurrency.js for the permits-running race guard, not a duplicated query', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/check-pipeline-freshness.js'),
      'utf-8'
    );
    expect(source).toMatch(/require\(['"]\.\/lib\/chain-concurrency['"]\)/);
    expect(source).toMatch(/isChainRunning/);
  });

  it('gates dotenv.config() behind !GITHUB_ACTIONS (F8 fold — CLI hygiene)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/check-pipeline-freshness.js'),
      'utf-8'
    );
    expect(source).toMatch(/if\s*\(\s*!process\.env\.GITHUB_ACTIONS\s*\)\s*require\(['"]dotenv['"]\)\.config\(\)/);
  });

  it('constructs the freshness interval as a single ::interval-cast parameter, not string concatenation (F8 fold)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/check-pipeline-freshness.js'),
      'utf-8'
    );
    expect(source).toMatch(/NOW\(\)\s*-\s*\$3::interval/);
  });

  it('constructs the Pool inside the try block so a construction-time throw hits the same fail-safe catch (F8 fold)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/check-pipeline-freshness.js'),
      'utf-8'
    );
    const tryIdx = source.indexOf('try {');
    const poolIdx = source.indexOf('pool = new Pool(');
    expect(tryIdx).toBeGreaterThan(-1);
    expect(poolIdx).toBeGreaterThan(tryIdx);
  });
});
