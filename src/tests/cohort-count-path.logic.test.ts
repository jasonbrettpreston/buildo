// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DN
//
// R-DN (operator y 2026-10-17): ingestor-forced-cohort.js --run may prove a cohort's write
// count from gate G #38's own per-table `count_path` (countPathDecision) instead of the
// step-level records_updated/records_new — for a step that reports one table's writes in its
// own declared int emit (link_wsib's entities corrections). No second count source.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS instrument */
const cohort = require(path.join(process.cwd(), 'scripts/analysis/ingestor-forced-cohort.js')) as {
  captureClaim: (o: {
    recordsUpdated: number;
    recordsNew: number;
    liveValues: Array<{ key: number; value: unknown }>;
    backupValues: Array<{ key: number; value: unknown }>;
    countPathResult?: { ok: boolean; n?: number; reason?: string } | null;
  }) => { ok: boolean; written?: number; reason?: string };
  parseArgs: (a: string[]) => Record<string, unknown>;
  validateFlags: (a: Record<string, unknown>) => { countPath: string | null };
  countPathCohortDecision: (doc: unknown, o: { table: string; countPath: string | null }) => { ok: boolean; reason?: string };
};

const live = [{ key: 1, value: 'a' }, { key: 2, value: null }];
const runFlags = [
  '--run', '--table=wsib_registry', '--key=id', '--column=match_confidence', '--op=add_number:-0.01',
  '--count=50', '--where=t.linked_entity_id IS NOT NULL', '--order=t.id',
  '--backup-table=wsib_registry_cohort_bak_20261017t2300z', '--step=scripts/link-wsib.js',
  '--chain=sources', '--out=docs/reports/golden/link_wsib/post/sources-full-forced-5.json',
];

describe('R-DN — ingestor-forced-cohort --count-path reads gate G count_path', () => {
  it('a passing count_path proves the write on a run whose step-level summary is zero', () => {
    const c = cohort.captureClaim({ recordsUpdated: 0, recordsNew: 0, liveValues: live, backupValues: live, countPathResult: { ok: true, n: 12 } });
    expect(c.ok).toBe(true);
    expect(c.written).toBe(12);
  });

  it('a failing count_path fails even when the step-level summary is nonzero (no fallback)', () => {
    const c = cohort.captureClaim({ recordsUpdated: 40, recordsNew: 0, liveValues: live, backupValues: live, countPathResult: { ok: false, reason: 'emitted 0' } });
    expect(c.ok).toBe(false);
    expect(c.reason).toContain('count_path');
  });

  it('the heal check still applies under count_path', () => {
    const c = cohort.captureClaim({ recordsUpdated: 0, recordsNew: 0, liveValues: [{ key: 1, value: 'z' }, { key: 2, value: null }], backupValues: live, countPathResult: { ok: true, n: 3 } });
    expect(c.ok).toBe(false);
  });

  it('--count-path is a --run flag naming a top-level emits key', () => {
    expect(cohort.validateFlags(cohort.parseArgs([...runFlags, '--count-path=is_wsib_registered_corrected'])).countPath).toBe('is_wsib_registered_corrected');
    expect(cohort.validateFlags(cohort.parseArgs(runFlags)).countPath).toBe(null);
    expect(() => cohort.validateFlags(cohort.parseArgs([...runFlags, '--count-path=meta.x']))).toThrow(/top-level emits key/);
    const planFlags = runFlags.slice(1, 9);
    expect(() => cohort.validateFlags(cohort.parseArgs(['--plan', ...planFlags, '--count-path=run_matched']))).toThrow(/--run flag/);
  });

  // Spec 08 output panel round 1, 2026-10-18: --count-path must be the slug's cohort.json count_path for --table.
  it('--count-path is cross-checked against the committed cohort.json target for --table (both ways)', () => {
    const doc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/reports/golden/link_wsib/cohort.json'), 'utf8'));
    expect(cohort.countPathCohortDecision(doc, { table: 'entities', countPath: 'is_wsib_registered_corrected' }).ok).toBe(true);
    expect(cohort.countPathCohortDecision(doc, { table: 'wsib_registry', countPath: 'run_matched' }).ok).toBe(true);
    expect(cohort.countPathCohortDecision(doc, { table: 'wsib_registry', countPath: 'is_wsib_registered_corrected' })).toMatchObject({ ok: false, reason: expect.stringMatching(/!= cohort.json/) });
    expect(cohort.countPathCohortDecision(doc, { table: 'parcels', countPath: 'run_matched' })).toMatchObject({ ok: false, reason: expect.stringMatching(/0 target\(s\)/) });
    expect(cohort.countPathCohortDecision(null, { table: 'entities', countPath: 'run_matched' }).ok).toBe(false);
    expect(cohort.countPathCohortDecision(null, { table: 'entities', countPath: null }).ok).toBe(true);
  });
});
