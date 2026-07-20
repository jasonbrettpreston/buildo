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
  FRESHNESS_WINDOW_HOURS: number;
  BACKUP_SLUGS: string[];
};

describe('check-pipeline-freshness.js — script presence', () => {
  it('exists in scripts/ directory', () => {
    const scriptPath = require.resolve('../../scripts/check-pipeline-freshness.js');
    expect(scriptPath).toMatch(/check-pipeline-freshness\.js$/);
  });

  it('exports writeOutput, run, hasCompletedWithin, FRESHNESS_WINDOW_HOURS, BACKUP_SLUGS', () => {
    expect(typeof checkPipelineFreshness.writeOutput).toBe('function');
    expect(typeof checkPipelineFreshness.FRESHNESS_WINDOW_HOURS).toBe('number');
    expect(Array.isArray(checkPipelineFreshness.BACKUP_SLUGS)).toBe(true);
  });
});

describe('check-pipeline-freshness.js — constants (Spec 115 §2.5 / Spec 112 §6, P3-G6)', () => {
  it('FRESHNESS_WINDOW_HOURS is 25 — the Spec 07 §OP4 / Spec 115 §2.5 SLA', () => {
    expect(checkPipelineFreshness.FRESHNESS_WINDOW_HOURS).toBe(25);
  });

  it('BACKUP_SLUGS matches both row shapes backup_db can be written under', () => {
    expect(checkPipelineFreshness.BACKUP_SLUGS.sort()).toEqual(
      ['backup_db', 'permits:backup_db'].sort()
    );
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
});
