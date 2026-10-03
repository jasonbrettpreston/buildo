// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (scope: gates from ①)
//
// WF2 "conversion simplification" item 1 — a PENDING step is evaluated by the
// R-BA registry gates (#28-#41) exactly as if it were converted, so an
// in-development step meets every gate at its ① commit instead of at the ③
// cutover (after its goldens were captured). Mechanism: the ONE converted.json
// read, `scripts/analysis/gates/converted-set.mjs`, carries the overlay
// `step-validate.mjs` sets for its pending targets.
//
// Unhappy path first (plan §Standards): a pending fixture step with a
// `clamp` variable and no named deviation FAILS gate B once overlaid, and is
// invisible to it without the overlay (the pre-item-1 behaviour).

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  setAsConverted, asConvertedFiles, readConvertedJson, withCommittedSet,
} from '../../scripts/analysis/gates/converted-set.mjs';
import { loadConvertedDescriptors } from '../../scripts/analysis/gates/closed-bounds.mjs';
import { checkOnInvalidClosed } from '../../scripts/analysis/gates/on-invalid.mjs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_FILE = 'scripts/fixture-pending-step.js';

function fixtureRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gates-from-one-'));
  fs.mkdirSync(path.join(root, 'scripts/steps/_schema'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts/steps/_schema/converted.json'), JSON.stringify({
    contract_version: 1,
    converted: [],
    pending: [{ file: FIXTURE_FILE, registers_at: 'commit ③', reason: 'fixture', declared: '2026-09-27', stage: 'shape_clean' }],
  }));
  fs.writeFileSync(path.join(root, 'scripts/fixture-pending-step.descriptor.json'), JSON.stringify({
    identity: { name: 'fixture_pending_step' },
    config: { logic_variables: [{ name: 'fixture_clamp_var', on_invalid: 'clamp' }] },
    checks: [],
  }));
  return root;
}

afterEach(() => setAsConverted([]));

describe('gates from ① — a pending step is evaluated as-converted', () => {
  it('RED: a pending fixture step with a clamp var FAILS gate B once overlaid (and is invisible without it)', () => {
    const root = fixtureRepo();
    const without = checkOnInvalidClosed(loadConvertedDescriptors(root), []);
    expect(without.pass).toBe(true);
    expect(without.blockedSlugs).toEqual([]);

    setAsConverted([FIXTURE_FILE], root);
    const as = checkOnInvalidClosed(loadConvertedDescriptors(root), []);
    expect(as.pass).toBe(false);
    expect(as.blockedSlugs).toEqual(['fixture_pending_step']);
    expect(as.detail).toContain('fixture_clamp_var');
  });

  it('the overlay moves the file pending -> converted (appended, as ③ appends it), and only a real pending entry may be overlaid', () => {
    const root = fixtureRepo();
    setAsConverted([FIXTURE_FILE], root);
    const view = readConvertedJson(root);
    expect(view.converted).toEqual([FIXTURE_FILE]);
    expect(view.pending).toEqual([]);
    expect(withCommittedSet(() => readConvertedJson(root).converted)).toEqual([]);
    expect(asConvertedFiles()).toEqual([FIXTURE_FILE]);
    expect(() => setAsConverted(['scripts/not-pending.js'], root)).toThrow(/not a pending\[\] entry/);
  });

  it('with no overlay, readConvertedJson is converted.json exactly as parsed (converted-only callers unchanged)', () => {
    const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json'), 'utf8'));
    expect(readConvertedJson(REPO_ROOT)).toEqual(real);
  });

  it('live: step-validate --step=<first pending slug> --fast evaluates the registry gates over converted + that slug', () => {
    const conv = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json'), 'utf8'));
    const pending = (conv.pending || []).map((p: string | { file: string }) => (typeof p === 'string' ? p : p.file));
    // R-BA overlays only a pending slug that HAS a descriptor; a `red_suite`-stage entry has none
    // until its ② (e.g. enrich_centreline at ①, 2026-09-30).
    const descriptorPaths = pending
      .map((f: string) => path.join(REPO_ROOT, f.replace(/\.(js|py)$/, '') + '.descriptor.json'))
      .filter((p: string) => fs.existsSync(p));
    if (descriptorPaths.length === 0) return; // nothing in development past red_suite — vacuous by construction
    const descriptor = JSON.parse(fs.readFileSync(descriptorPaths[0]!, 'utf8'));
    const slug = descriptor.identity.name;
    const run = spawnSync(process.execPath, ['scripts/analysis/step-validate.mjs', `--step=${slug}`, '--fast'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 300_000,
    });
    const out = run.stdout;
    // #40 walks loadConvertedDescriptors: converted.length + the overlaid pending slug.
    expect(out).toContain(`CAPTURE-EXPLAINED (gate G): ${conv.converted.length + 1} step(s) checked`);
    expect(out).toMatch(new RegExp(`${slug}: \\d+/\\d+ hard-stop=\\w+ \\| STANDARDIZED:`));
  }, 320_000);
});

// ---------------------------------------------------------------------------
// Panel fold (Integration H2/M2): the overlay honours the declared R-K stage — a
// stage excluding G8 (no current POST goldens) is not hard-stopped by the
// golden-derived registry gates (#30 C, #31 D, #38-#40 G); one excluding G7 is
// not hard-stopped by #41 (K). shape_clean / converted exclude nothing.
// ---------------------------------------------------------------------------
describe('gates from ① — stage-scoped registry exclusions (the R-K stage vocabulary, no new one)', () => {
  it('descriptor_only excludes #30/#31/#38-#41 but never a declaration gate (#28 A, #29 B)', async () => {
    const sv = await import('../../scripts/analysis/step-validate.mjs');
    for (const id of [30, 31, 38, 39, 40, 41]) expect(sv.stageExcludesRegistry(id, 'descriptor_only'), `#${id}`).toBe(true);
    for (const id of [28, 29, 32, 33, 37]) expect(sv.stageExcludesRegistry(id, 'descriptor_only'), `#${id}`).toBe(false);
  });

  it('compute_ported excludes the golden gates but not #41; shape_clean and a converted step exclude nothing', async () => {
    const sv = await import('../../scripts/analysis/step-validate.mjs');
    expect(sv.stageExcludesRegistry(38, 'compute_ported')).toBe(true);
    expect(sv.stageExcludesRegistry(41, 'compute_ported')).toBe(false);
    for (const id of [29, 30, 38, 41]) {
      expect(sv.stageExcludesRegistry(id, 'shape_clean')).toBe(false);
      expect(sv.stageExcludesRegistry(id, undefined)).toBe(false);
    }
  });
});
