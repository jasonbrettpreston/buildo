// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-AZ — execution.invocation is the per-chain argv PIN; manifest chain_args GENERATED from it)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md (step.schema.json execution.invocation — "manifest<->descriptor drift is a CHECKABLE difference")
//
// WF3 2026-10-02 — link_parcels never ran FULL in the sources chain. `scripts/link-parcels.descriptor.json`
// declares `execution.invocation.sources.argv = ["--full"]` (the R-AZ per-chain argv PIN), but
// `scripts/manifest.json`'s `scripts.link_parcels` carries no `chain_args`, and `scripts/run-chain.js`
// spawns each step with `[...(scriptEntry.chain_args?.[chainId] || [])]` — so the pinned `--full` never
// reaches the child. The fix (a LATER brief) adds `scripts/analysis/generate-chain-args.mjs`, which
// DERIVES every converted step's manifest `chain_args` from its own descriptor and fails closed on any
// drift in either direction. This suite is written RED-FIRST against that module: nothing here
// imports it into the production path, and the module does not exist yet — the import below is a
// module-not-found failure by design.
//
// Tests 1 and 2 stay RED until the orchestrator runs the generator's `--write` against the REAL
// manifest: test 1 is an independent fleet walk (no module import at all) that reads the live
// manifest + `converted.json` + every converted descriptor and reports `['link_parcels/sources']`
// today; test 2 drives the live CLI and sees the same drift. Test 3 reproduces that drift in a temp
// root and therefore stays STABLE across the real `--write` — it strips any `link_parcels` chain_args
// from the COPY first, so it reproduces the bug and proves the fix GREEN whether or not the committed
// manifest has been regenerated yet.
//
// What is locked, per test:
//   1. FLEET PARITY (module-free): every converted file's every slug agrees with `deriveChainArgs`.
//   2. LIVE CLI: `--check` on the real tree exits 0 with no `drift`/`violation` line.
//   3. TEMP-ROOT REPRODUCTION: `--check` names exactly one drift; `--write` edits exactly the
//      `link_parcels` line; `--check` then passes and a second `--write` is byte-identical.
//   4. `deriveChainArgs` unit table: non-empty argv only, declared order, empty/missing ⇒ null.
//   5. `findings` unhappy paths, each proven BOTH directions over ONE fixture (the two-slug shape
//      `scripts/enrich-permits.js` serves today as two manifest entries, `enrich_permits` +
//      `enrich_coa_zoning`).
//   6. `rewriteEntry` insert/replace/remove/unknown-slug, on a fixture whose entry is exactly one line.
//   7. CLI usage refusals: no flag, and both flags together.
import { describe, expect, it, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import * as gen from '../../scripts/analysis/generate-chain-args.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
const GENERATOR = 'scripts/analysis/generate-chain-args.mjs';
const MANIFEST_REL = 'scripts/manifest.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

/** Temp roots written by test 3, removed in `afterAll`. */
const tmpRoots: string[] = [];

/** A fresh temp directory, registered for cleanup in `afterAll`. */
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-args-'));
  tmpRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Run the generator through the real Node binary in a real child process, exactly as `npm run`
 * would — never an in-process import (the exit code and the stdout/stderr split ARE the contract).
 */
function cli(args: string[]) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, GENERATOR), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

/** The stdout of a spawnSync result, as the CLI writes it. */
function out(result: { stdout?: string | null }): string {
  return String(result.stdout || '');
}

// ---------------------------------------------------------------------------
// Small, typed views of the two JSON files this suite reads. Only the fields the
// contract names are modelled; everything else is carried as `unknown`.
// ---------------------------------------------------------------------------

interface ManifestEntry {
  file?: string | null;
  chain_args?: Record<string, string[]> | null;
  env?: Record<string, string>;
  [key: string]: unknown;
}
interface ManifestShape {
  chains: Record<string, string[]>;
  scripts: Record<string, ManifestEntry>;
  [key: string]: unknown;
}
/** Parse a descriptor-shaped value out of `unknown` without an `any`. */
function asDescriptor(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
}

function readJson<T>(absPath: string): T {
  return JSON.parse(fs.readFileSync(absPath, 'utf8')) as T;
}

/**
 * The `deriveChainArgs` rule restated as a standalone walker (test 1 must NOT import the module):
 * a chain appears iff its `argv` is a NON-EMPTY array — no invocation and no non-empty argv ⇒ null.
 */
function expectedChainArgs(descriptor: Record<string, unknown>): Record<string, string[]> | null {
  const execution = descriptor.execution;
  if (!execution || typeof execution !== 'object') return null;
  const invocation = (execution as { invocation?: unknown }).invocation;
  if (!invocation || typeof invocation !== 'object') return null;
  const out: Record<string, string[]> = {};
  for (const [chain, entry] of Object.entries(invocation as Record<string, unknown>)) {
    const argv = (entry && typeof entry === 'object' ? (entry as { argv?: unknown }).argv : undefined);
    if (Array.isArray(argv) && argv.length > 0) out[chain] = argv as string[];
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** `scripts/foo.js` ⇒ `scripts/foo.descriptor.json`, the seam.js rule. */
function descriptorRelFor(file: string): string {
  return file.replace(/\.(js|py)$/, '') + '.descriptor.json';
}

// ---------------------------------------------------------------------------
// Test 5's fixture — ONE object, deep-cloned per mutation so every case is
// independent and every "both directions" claim is measured against a green base.
// ---------------------------------------------------------------------------

interface Fixture {
  manifest: ManifestShape;
  converted: string[];
  descriptors: Record<string, Record<string, unknown>>;
}

function fixture(): Fixture {
  return {
    manifest: {
      chains: { sources: ['a', 'b', 'c'], permits: ['a'] },
      scripts: {
        a: { file: 'scripts/a.js', chain_args: { sources: ['--full'] } },
        b: { file: 'scripts/b.js' },
        c: { file: 'scripts/b.js' },
        u: { file: 'scripts/u.js', chain_args: { sources: ['--anything'] } },
      },
    },
    converted: ['scripts/a.js', 'scripts/b.js'],
    descriptors: {
      'scripts/a.js': {
        execution: {
          invocation: {
            sources: { argv: ['--full'], env: { PIPELINE_CHAIN: 'sources' } },
            permits: { argv: [], env: {} },
          },
        },
      },
      'scripts/b.js': { execution: { invocation: { sources: { argv: [] } } } },
    },
  };
}

/** A fresh, independently mutable copy of the fixture. */
function cloneFixture(): Fixture {
  return JSON.parse(JSON.stringify(fixture())) as Fixture;
}

/** Narrow a `findings` result without an `any`. */
interface DriftItem {
  slug: string;
  chain: string;
  expected: string[] | null;
  actual: string[] | null;
}

// ---------------------------------------------------------------------------
// Test 6's fixture — a manifest whose `x` entry is exactly ONE line, so the
// entry-line rewrite contract is observable.
// ---------------------------------------------------------------------------

const REWRITE_FIXTURE = [
  '{',
  '  "scripts": {',
  '    "x":  { "file": "scripts/x.js", "supports_full": true,  "supports_dry_run": false, "telemetry_tables": [] }',
  '  }',
  '}',
  '',
].join('\n');

describe('manifest chain_args are generated from execution.invocation (R-AZ)', () => {
  it(
    'fleet parity: every converted step matches its descriptor — and the fleet is not vacuous',
    { timeout: 60_000 },
    () => {
      const manifest = readJson<ManifestShape>(path.join(REPO_ROOT, MANIFEST_REL));
      const convertedJson = readJson<{ converted: string[] }>(path.join(REPO_ROOT, CONVERTED_REL));
      const converted = convertedJson.converted;

      // Non-vacuity: the fleet is the size this ruling was measured against, and at
      // least three converted slugs carry `chain_args` today (enrich_parcels,
      // link_massing, link_wsib) — a rule over an empty set proves nothing.
      expect(converted.length).toBeGreaterThanOrEqual(24);

      let convertedSlugsWithChainArgs = 0;
      const mismatches: string[] = [];

      for (const file of converted) {
        const descriptor = readJson<Record<string, unknown>>(
          path.join(REPO_ROOT, descriptorRelFor(file)),
        );
        const expected = expectedChainArgs(descriptor);
        const slugs = Object.entries(manifest.scripts)
          .filter(([, entry]) => entry.file === file)
          .map(([slug]) => slug);
        expect(slugs.length, `${file} maps to no slug`).toBeGreaterThan(0);

        for (const slug of slugs) {
          const actual = manifest.scripts[slug]?.chain_args ?? null;
          if (actual && Object.keys(actual).length > 0) convertedSlugsWithChainArgs += 1;
          const chains = new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})]);
          for (const chain of chains) {
            const expectedChain = expected?.[chain] ?? null;
            const actualChain = actual?.[chain] ?? null;
            if (JSON.stringify(expectedChain) !== JSON.stringify(actualChain)) {
              mismatches.push(`${slug}/${chain}`);
            }
          }
        }
      }

      expect(convertedSlugsWithChainArgs).toBeGreaterThanOrEqual(3);
      // RED today: the ONLY live divergence is `['link_parcels/sources']` — the pin the
      // descriptor declares and the manifest never carried.
      expect(mismatches).toEqual([]);
    },
  );

  it(
    'the live CLI is CLEAN: `--check` exits 0 with no drift and no violation',
    { timeout: 60_000 },
    () => {
      const r = cli(['--check']);
      expect(out(r)).not.toMatch(/^(drift|violation) /m);
      expect(r.status).toBe(0);
    },
  );

  it(
    'temp-root reproduction: exactly one drift, one rewritten line, then idempotent',
    { timeout: 60_000 },
    () => {
      const root = tmpDir();
      const converted = readJson<{ converted: string[] }>(
        path.join(REPO_ROOT, CONVERTED_REL),
      ).converted;

      // Mirror the real tree's three inputs at the same relative paths.
      const manifestRel = path.join(root, MANIFEST_REL);
      fs.mkdirSync(path.dirname(manifestRel), { recursive: true });
      fs.copyFileSync(path.join(REPO_ROOT, MANIFEST_REL), manifestRel);
      const convertedRel = path.join(root, CONVERTED_REL);
      fs.mkdirSync(path.dirname(convertedRel), { recursive: true });
      fs.copyFileSync(path.join(REPO_ROOT, CONVERTED_REL), convertedRel);
      for (const file of converted) {
        const rel = descriptorRelFor(file);
        const abs = path.join(root, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.copyFileSync(path.join(REPO_ROOT, rel), abs);
      }

      // Strip any `"chain_args": { … }, ` from the `link_parcels` line ONLY — a no-op
      // today (the line carries none), and the reason this test survives the real
      // `--write` unchanged: the COPY is always the un-generated shape.
      const before = fs.readFileSync(manifestRel, 'utf8');
      const stripped = before
        .split('\n')
        .map((line) =>
          line.includes('"link_parcels"')
            ? line.replace(/ "chain_args": \{[^\n]*?\},/g, '')
            : line,
        )
        .join('\n');
      fs.writeFileSync(manifestRel, stripped);

      // Direction 1 — RED: exactly one drift line, and it names `link_parcels/sources`.
      const red = cli(['--check', `--root=${root}`]);
      expect(red.status).toBe(1);
      const driftLines = out(red).split('\n').filter((line) => line.startsWith('drift '));
      expect(driftLines).toHaveLength(1);
      expect(driftLines[0]).toContain('link_parcels/sources');

      // Direction 2 — the write edits EXACTLY the one line, and only that line.
      const write = cli(['--write', `--root=${root}`]);
      expect(write.status).toBe(0);
      expect(out(write)).toContain('changed');

      const after = fs.readFileSync(manifestRel, 'utf8');
      const oldLines = stripped.split('\n');
      const newLines = after.split('\n');
      expect(newLines).toHaveLength(oldLines.length);
      const differing = newLines
        .map((line, i) => (line === oldLines[i] ? null : i))
        .filter((i): i is number => i !== null);
      expect(differing).toHaveLength(1);
      expect(newLines[differing[0]!]).toContain('"link_parcels"');
      expect(newLines[differing[0]!]).toContain('"chain_args": { "sources": ["--full"] }');

      const oldParsed = JSON.parse(stripped) as ManifestShape;
      const newParsed = JSON.parse(after) as ManifestShape;
      expect(newParsed.scripts.link_parcels?.chain_args).toEqual({ sources: ['--full'] });
      expect(newParsed.chains).toEqual(oldParsed.chains);
      // Every OTHER scripts entry is untouched, however it does not compare equal.
      const otherScriptsDiffer = Object.keys(newParsed.scripts).filter(
        (slug) =>
          slug !== 'link_parcels' &&
          JSON.stringify(newParsed.scripts[slug]) !== JSON.stringify(oldParsed.scripts[slug]),
      );
      expect(otherScriptsDiffer).toEqual([]);

      // Direction 3 — clean again, and the second write is a literal no-op.
      const green = cli(['--check', `--root=${root}`]);
      expect(green.status).toBe(0);
      const again = cli(['--write', `--root=${root}`]);
      expect(again.status).toBe(0);
      expect(fs.readFileSync(manifestRel, 'utf8')).toBe(after);
    },
  );

  it(
    '`deriveChainArgs` keeps every non-empty argv chain in declared order and is null otherwise',
    { timeout: 60_000 },
    () => {
      expect(
        gen.deriveChainArgs({
          execution: { invocation: { sources: { argv: ['--full'] }, permits: { argv: [] } } },
        }),
      ).toEqual({ sources: ['--full'] });

      expect(
        gen.deriveChainArgs({ execution: { invocation: { sources: { argv: [] } } } }),
      ).toBeNull();

      expect(gen.deriveChainArgs({ execution: { invocation: {} } })).toBeNull();
      expect(gen.deriveChainArgs({})).toBeNull();
      expect(gen.deriveChainArgs({ execution: {} })).toBeNull();
    },
  );

  it(
    '`findings` is GREEN on the fixture (an unconverted slug\'s chain_args is ignored)',
    { timeout: 60_000 },
    () => {
      const base = fixture();
      const result = gen.findings({
        manifest: asDescriptor(base.manifest),
        converted: base.converted,
        descriptors: base.descriptors,
      });
      expect(result.drift).toEqual([]);
      expect(result.violations).toEqual([]);
    },
  );

  it(
    '`findings` names argv drift in BOTH directions, per slug and per chain',
    { timeout: 60_000 },
    () => {
      // Missing on the manifest side: the descriptor pins `--full`, the entry dropped it.
      const missing = cloneFixture();
      delete missing.manifest.scripts.a!.chain_args;
      const missingFindings = gen.findings({
        manifest: asDescriptor(missing.manifest),
        converted: missing.converted,
        descriptors: missing.descriptors,
      });
      expect(missingFindings.drift).toEqual([
        { slug: 'a', chain: 'sources', expected: ['--full'], actual: null },
      ]);
      expect(missingFindings.violations).toEqual([]);

      // Extra on the manifest side: the descriptor has no non-empty argv, the entry invented one.
      const extra = cloneFixture();
      extra.manifest.scripts.b!.chain_args = { sources: ['--full'] };
      const extraFindings = gen.findings({
        manifest: asDescriptor(extra.manifest),
        converted: extra.converted,
        descriptors: extra.descriptors,
      });
      const bDrift = (extraFindings.drift as DriftItem[]).filter((d) => d.slug === 'b');
      expect(bDrift).toHaveLength(1);
      expect(bDrift[0]!.chain).toBe('sources');
      expect(bDrift[0]!.expected).toBeNull();
      expect(bDrift[0]!.actual).toEqual(['--full']);

      // ONE file, TWO slugs: `b` and `c` both map `scripts/b.js` — every one is checked.
      const both = cloneFixture();
      const bInvocation = (((both.descriptors['scripts/b.js']!.execution as Record<string, unknown>)
        .invocation) as Record<string, Record<string, unknown>>);
      bInvocation.sources!.argv = ['--full'];
      const bothFindings = gen.findings({
        manifest: asDescriptor(both.manifest),
        converted: both.converted,
        descriptors: both.descriptors,
      });
      expect(bothFindings.drift).toHaveLength(2);
      expect((bothFindings.drift as DriftItem[]).map((d) => d.slug).sort()).toEqual(['b', 'c']);
    },
  );

  it(
    '`findings` names a chain-membership violation in BOTH directions',
    { timeout: 60_000 },
    () => {
      // Direction 1 — the descriptor names a chain that does not contain the slug.
      const foreign = cloneFixture();
      const foreignInvocation = (((foreign.descriptors['scripts/a.js']!.execution as Record<string, unknown>)
        .invocation) as Record<string, unknown>);
      foreignInvocation.coa = { argv: [] };
      const foreignFindings = gen.findings({
        manifest: asDescriptor(foreign.manifest),
        converted: foreign.converted,
        descriptors: foreign.descriptors,
      });
      expect(foreignFindings.violations.some((v) => /a\b.*coa/.test(v))).toBe(true);

      // Direction 2 — the slug is a chain member the descriptor does not invoke on.
      const unlisted = cloneFixture();
      const unlistedInvocation = (((unlisted.descriptors['scripts/a.js']!.execution as Record<string, unknown>)
        .invocation) as Record<string, unknown>);
      delete unlistedInvocation.permits;
      const unlistedFindings = gen.findings({
        manifest: asDescriptor(unlisted.manifest),
        converted: unlisted.converted,
        descriptors: unlisted.descriptors,
      });
      expect(unlistedFindings.violations.some((v) => /a\b.*permits/.test(v))).toBe(true);
    },
  );

  it(
    '`findings` guards PIPELINE_CHAIN on both sides — invocation env and manifest env',
    { timeout: 60_000 },
    () => {
      // Invocation env that disagrees with its own chain key.
      const descriptorEnv = cloneFixture();
      const aInvocation = (((descriptorEnv.descriptors['scripts/a.js']!.execution as Record<string, unknown>)
        .invocation) as Record<string, { env?: Record<string, string> }>);
      aInvocation.sources!.env = { PIPELINE_CHAIN: 'permits' };
      const descriptorFindings = gen.findings({
        manifest: asDescriptor(descriptorEnv.manifest),
        converted: descriptorEnv.converted,
        descriptors: descriptorEnv.descriptors,
      });
      expect(descriptorFindings.violations.some((v) => v.includes('PIPELINE_CHAIN'))).toBe(true);

      // CONTROL — absent `env` entirely is fine (run-chain injects the real value).
      const noEnv = cloneFixture();
      const noEnvInvocation = (((noEnv.descriptors['scripts/a.js']!.execution as Record<string, unknown>)
        .invocation) as Record<string, Record<string, unknown>>);
      delete noEnvInvocation.sources!.env;
      const noEnvFindings = gen.findings({
        manifest: asDescriptor(noEnv.manifest),
        converted: noEnv.converted,
        descriptors: noEnv.descriptors,
      });
      expect(noEnvFindings.violations).toEqual([]);

      // Manifest `scripts[slug].env.PIPELINE_CHAIN` that no containing chain serves — run-chain
      // spreads `scriptEntry.env` AFTER the injected value, so it would silently override it.
      const manifestEnv = cloneFixture();
      manifestEnv.manifest.scripts.a!.env = { PIPELINE_CHAIN: 'permits' };
      const manifestFindings = gen.findings({
        manifest: asDescriptor(manifestEnv.manifest),
        converted: manifestEnv.converted,
        descriptors: manifestEnv.descriptors,
      });
      const manifestViolations = manifestFindings.violations.filter((v) => v.includes('PIPELINE_CHAIN'));
      expect(manifestViolations).toHaveLength(1);
      expect(manifestViolations[0]).toContain('a');
    },
  );

  it(
    '`findings` names a converted file that maps to no manifest slug — and the other direction is clean',
    { timeout: 60_000 },
    () => {
      const orphan = cloneFixture();
      orphan.converted = [...orphan.converted, 'scripts/zz.js'];
      orphan.descriptors['scripts/zz.js'] = { execution: { invocation: { sources: { argv: [] } } } };
      const orphanFindings = gen.findings({
        manifest: asDescriptor(orphan.manifest),
        converted: orphan.converted,
        descriptors: orphan.descriptors,
      });
      expect(orphanFindings.violations.some((v) => v.includes('scripts/zz.js'))).toBe(true);

      // CONTROL — the same file with a slug that DOES map it is clean.
      const mapped = cloneFixture();
      mapped.converted = [...mapped.converted, 'scripts/zz.js'];
      mapped.descriptors['scripts/zz.js'] = { execution: { invocation: { sources: { argv: [] } } } };
      mapped.manifest.scripts.zz = { file: 'scripts/zz.js' };
      mapped.manifest.chains.sources = [...(mapped.manifest.chains.sources ?? []), 'zz'];
      const mappedFindings = gen.findings({
        manifest: asDescriptor(mapped.manifest),
        converted: mapped.converted,
        descriptors: mapped.descriptors,
      });
      expect(mappedFindings.violations).toEqual([]);
      expect(mappedFindings.drift).toEqual([]);
    },
  );

  it(
    '`rewriteEntry` inserts, replaces and removes `chain_args` on the ONE entry line',
    { timeout: 60_000 },
    () => {
      const inserted = gen.rewriteEntry(REWRITE_FIXTURE, 'x', { sources: ['--full'] });
      const insertedLines = inserted.split('\n');
      expect(insertedLines).toHaveLength(REWRITE_FIXTURE.split('\n').length);
      const insertedEntry = insertedLines.find((line) => line.includes('"x"'));
      expect(insertedEntry).toBeDefined();
      expect(insertedEntry).toContain(
        '"supports_dry_run": false, "chain_args": { "sources": ["--full"] }, "telemetry_tables"',
      );
      expect(
        (JSON.parse(inserted) as ManifestShape).scripts.x?.chain_args,
      ).toEqual({ sources: ['--full'] });

      const replaced = gen.rewriteEntry(inserted, 'x', { permits: ['--a', '--b'] });
      const replacedEntry = replaced.split('\n').find((line) => line.includes('"x"'));
      expect(replacedEntry).toContain('"chain_args": { "permits": ["--a", "--b"] }');
      expect(
        (JSON.parse(replaced) as ManifestShape).scripts.x?.chain_args,
      ).toEqual({ permits: ['--a', '--b'] });

      // Removing the property is a byte-for-byte return to the original text.
      expect(gen.rewriteEntry(inserted, 'x', null)).toBe(REWRITE_FIXTURE);

      // An unknown slug is a refusal that names the slug — never a silent no-op.
      expect(() => gen.rewriteEntry(REWRITE_FIXTURE, 'nope', { sources: ['--full'] })).toThrow(/nope/);
    },
  );

  it(
    'the CLI refuses a missing flag and a contradictory pair with exit 2',
    { timeout: 60_000 },
    () => {
      const none = cli([]);
      expect(none.status).toBe(2);

      const both = cli(['--check', '--write']);
      expect(both.status).toBe(2);
    },
  );
});
