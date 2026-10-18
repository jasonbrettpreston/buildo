// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BC (chain completion), R-DJ (CHAIN-TOOLING part 3)
//
// `scripts/analysis/gates/chain-status.mjs` — one R-BC (a)–(e) status line per chain, derived from the
// registries only (manifest, converted.json, census exemptions, gates ledger, programme-items), printed by
// `scripts/ai-env-check.mjs`. Both directions on fixtures, then the live registries.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as chainStatus from '../../scripts/analysis/gates/chain-status.mjs';

const REPO_ROOT = process.cwd();

type Registries = Parameters<typeof chainStatus.computeChainStatus>[0];

const fixture = (): Registries => ({
  manifest: {
    chains: { sources: ['a', 'b', 'r'], other: ['c'] },
    scripts: { a: { file: 'scripts/a.js' }, b: { file: 'scripts/b.js' }, r: { file: 'scripts/r.js' }, c: { file: 'scripts/c.js' } },
  },
  converted: { converted: ['scripts/a.js', 'scripts/b.js', 'scripts/c.js'], pending: [] },
  census: { exemptions: [{ slug: 'r' }] },
  ledgerRows: [],
  programmeItems: [
    { id: 'LDG-10', status: 'BUILT' },
    { id: 'EP-PIN-D17', status: 'BUILT' },
    { id: 'CHAIN-TOOLING', status: 'BUILT' },
  ],
});

const sourcesOf = (reg: Registries) => chainStatus.computeChainStatus(reg).find((s) => s.chain === 'sources')!;

describe('chain-status (R-BC (a)–(e), CHAIN-TOOLING part 3)', () => {
  it('GREEN — every gate held: converted (exemption excluded), no ledger row, every acceptance item BUILT', () => {
    const s = sourcesOf(fixture());
    expect(s).toMatchObject({ steps: 2, exempt: 1, converted: 2, ledger: 0, complete: true });
    expect(chainStatus.formatChainStatusLine(s)).toBe(
      '✔ chain sources: converted 2/2 (1 exempt) · ledger 0 · LDG-10 BUILT · cloud EP-PIN-D17 BUILT · tooling BUILT',
    );
  });

  it('RED (a) — a pending step blocks completion and is named', () => {
    const reg = fixture();
    reg.converted = { converted: ['scripts/a.js'], pending: [{ file: 'scripts/b.js' }] };
    const s = sourcesOf(reg);
    expect(s.complete).toBe(false);
    expect(s.pending).toEqual(['b']);
  });

  it('RED (b) — a ledger row on a chain step (slug or hyphenated slug) blocks; a foreign row does not count', () => {
    const reg = fixture();
    reg.ledgerRows = [{ step: 'a' }, { step: 'b' }, { step: '(registry)' }, { step: 'c' }];
    expect(sourcesOf(reg)).toMatchObject({ ledger: 2, complete: false });
  });

  it('RED (c)–(e) — an unbuilt or missing acceptance item blocks; a chain with no registered items never reads complete', () => {
    const reg = fixture();
    reg.programmeItems = [{ id: 'LDG-10', status: 'NOT_STARTED' }];
    const s = sourcesOf(reg);
    expect(s.complete).toBe(false);
    expect(s.items?.cloud?.status).toBe('MISSING');
    const other = chainStatus.computeChainStatus(fixture()).find((x) => x.chain === 'other')!;
    expect(other.complete).toBe(false);
    expect(chainStatus.formatChainStatusLine(other)).toContain('acceptance items: none registered');
  });

  // Admin visibility (operator 2026-10-17: "when we are adding new steps we need to be aware of the admin as well — this
  // is how we verify the output"): REPORT-ONLY — counted on the line, never deciding `complete`.
  it('admin — a converted step missing from the admin surface is counted on the line but never blocks completion', () => {
    const reg = { ...fixture(), adminRegistered: new Set(['a']) };
    const s = sourcesOf(reg);
    expect(s.adminUnregistered).toEqual(['b']);
    expect(s.complete).toBe(true);
    expect(chainStatus.formatChainStatusLine(s)).toMatch(/ · admin unregistered 1$/);
  });

  it('admin — objectLiteralKeys reads only the first-level keys of the named object literal', () => {
    const src = "const X = { z: 1 };\nexport const M: Record<string, X> = {\n  a: { n: { deep: 1 } },\n  'b:c': 2, d: 'x',\n};";
    expect([...chainStatus.objectLiteralKeys(src, 'M')]).toEqual(['a', 'b:c', 'd']);
    expect(() => chainStatus.objectLiteralKeys(src, 'Missing')).toThrow(/Missing not found/);
  });

  it('admin — live: every converted step has a STEP_DESCRIPTIONS entry, so none is unregistered (R-DW: STEP_EXPECTED_RANGES is not an arm)', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'src/lib/admin/funnel.ts'), 'utf8');
    const desc = chainStatus.objectLiteralKeys(src, 'STEP_DESCRIPTIONS');
    expect([...chainStatus.adminRegisteredSlugs(REPO_ROOT)].sort()).toEqual([...desc].sort());
    const reg = chainStatus.loadRegistries(REPO_ROOT);
    for (const s of chainStatus.computeChainStatus(reg)) expect(s.adminUnregistered ?? [], s.chain).toEqual([]);
  });

  it('the module self-test passes', () => {
    expect(chainStatus.selfTest()).toBe('chain-status self-test PASSED');
  });

  it('live — one line per manifest chain; counts agree with converted.json; sources is not complete while LDG-10 is not BUILT', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/manifest.json'), 'utf8')) as { chains: Record<string, string[]> };
    const live = chainStatus.computeChainStatus(chainStatus.loadRegistries(REPO_ROOT));
    expect(live.map((s) => s.chain)).toEqual(Object.keys(manifest.chains));
    for (const s of live) expect(s.converted + s.pending.length + s.unconverted.length).toBe(s.steps);
    const sources = live.find((s) => s.chain === 'sources')!;
    const ldg10 = sources.items?.ledger?.status;
    if (ldg10 !== 'BUILT') expect(sources.complete).toBe(false);
  });

  it('ai-env-check prints the chain-status lines (one per chain)', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/ai-env-check.mjs'), 'utf8');
    expect(src).toMatch(/import \{ chainStatusLines \} from '\.\/analysis\/gates\/chain-status\.mjs'/);
    const r = spawnSync('node', ['scripts/analysis/gates/chain-status.mjs'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/manifest.json'), 'utf8')) as { chains: Record<string, string[]> };
    expect(r.stdout.trim().split('\n').filter((l) => / chain /.test(l))).toHaveLength(Object.keys(manifest.chains).length);
  });
});
