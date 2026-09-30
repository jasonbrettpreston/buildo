// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (generated Target Files, WF2 2026-09-29)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §6
//
// Logic locks for the derivation wrapper `scripts/analysis/gates/step-registry.mjs` and the pure
// block editor `scripts/analysis/gates/generated-blocks.mjs` (brief gtf-01; the API under test is
// .cursor/engine-briefs/gtf-00-contract.md §A/§B). Written red-first (the modules did not exist).
//
// What is locked:
//   1. registryRows covers exactly manifest.chains.sources, every row owned by a real spec file.
//   2. resolveStep — slug / bare file / backslashed path / step test path → slug; anything outside
//      the repo root, a non-step script, a fixture path or the empty string → null.
//   3. derivation parity: stepFiles(row).files is EXACTLY computeSourceFingerprint's input list
//      (the resolver never invents a candidate the lockfile does not hash).
//   4/5. tests live under src/tests/steps/<slug>/; renderStepEntry backticks ONLY derivedPaths.
//   6. stepEdges is the ledger's own answer, both directions.
//   7. an inchain-exempt slug renders the "not in the cross-step ledger snapshot" line.
//   8. stepData finds the table's CREATE migration (one home: the migrations dir).
//   9. generated-blocks: find/strip/outside-marker/replace + the open-without-close throw.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import * as reg from '../../scripts/analysis/gates/step-registry.mjs';
import * as blocks from '../../scripts/analysis/gates/generated-blocks.mjs';

const require = createRequire(import.meta.url);
const golden = require('../../scripts/analysis/capture-step-golden.js');
const ledger = require('../../scripts/lib/ledger.js');

const REPO_ROOT = path.resolve(__dirname, '../..');

const inputs = reg.loadRegistryInputs(REPO_ROOT);

/** Sorted copy of an array of strings. */
function sorted(xs: readonly string[]): string[] {
  return [...xs].map(String).sort();
}

/** The manifest, read the way the manifest is stored (LF-normalised, forward-slash keys). */
const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'manifest.json'), 'utf8'));

/** The slugs of one chain, or [] when the chain is absent. */
function manifestChain(name: string): string[] {
  const c = manifest.chains && manifest.chains[name];
  return Array.isArray(c) ? c : [];
}

describe('step-registry — registryRows', () => {
  it('covers exactly the sources chain and every row is owned by an existing spec', () => {
    const rows = reg.registryRows(inputs);
    const slugs = rows.map((r: { slug: string }) => r.slug);

    expect(sorted(slugs)).toEqual(sorted(manifestChain('sources')));
    expect(new Set(slugs).size).toBe(slugs.length); // no duplicate slugs

    for (const row of rows) {
      expect(Array.isArray(row.owner_specs)).toBe(true);
      expect(row.owner_specs.length).toBeGreaterThan(0);
      for (const spec of row.owner_specs) {
        expect(spec).toMatch(/^docs\/specs\/[0-9a-z_-]+\/[0-9]+[a-z]?_[a-z0-9_]+[.]md$/);
        expect(fs.existsSync(path.join(REPO_ROOT, spec))).toBe(true);
      }
    }
  });
});

describe('step-registry — resolveStep', () => {
  it('resolves a slug, a bare descriptor path, an absolute path and a step test path', () => {
    expect(reg.resolveStep('parcels', inputs)).toBe('parcels');
    expect(reg.resolveStep('scripts/load-parcels.descriptor.json', inputs)).toBe('parcels');
    expect(
      reg.resolveStep(path.join(REPO_ROOT, 'scripts', 'load-parcels.descriptor.json').split('/').join('\\'), inputs),
    ).toBe('parcels');
    expect(reg.resolveStep('src\\tests\\steps\\parcels\\violations.test.ts', inputs)).toBe('parcels');
  });

  it('returns null for a component, a fixture, an outside-the-repo path and the empty string', () => {
    expect(reg.resolveStep('src\\components\\X.tsx', inputs)).toBeNull();
    expect(reg.resolveStep('scripts/steps/_schema/fixtures/valid/x.json', inputs)).toBeNull();
    expect(reg.resolveStep(path.resolve(REPO_ROOT, '..', 'elsewhere', 'scripts', 'load-parcels.js'), inputs)).toBeNull();
    expect(reg.resolveStep('', inputs)).toBeNull();
  });
});

describe('step-registry — derivation parity with the golden fingerprint', () => {
  it('stepFiles(row).files is exactly computeSourceFingerprint\'s fingerprint_files', () => {
    let compared = 0;
    for (const row of reg.registryRows(inputs)) {
      const files: string[] = reg.stepFiles(row).files;
      if (!files.some((f) => f.endsWith('.descriptor.json'))) continue;

      const descriptorPath = golden.descriptorPathFor(row.file);
      const notesPath = golden.notesPathFor(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, descriptorPath), 'utf8')), descriptorPath);
      const computePath = golden.computePathFor(row.file);

      const { fingerprint_files: fingerprintFiles } = golden.computeSourceFingerprint({
        step: row.file,
        descriptorPath,
        notesPath,
        computePath,
      });

      expect(sorted(files)).toEqual(sorted(fingerprintFiles));
      compared += 1;
    }
    expect(compared).toBeGreaterThanOrEqual(15);
  });
});

describe('step-registry — declared tests', () => {
  it('every test is a real .test.ts under src/tests/steps/<slug>/', () => {
    for (const row of reg.registryRows(inputs)) {
      const tests: string[] = reg.stepFiles(row).tests;
      for (const test of tests) {
        expect(test).toMatch(/\.test\.ts$/);
        expect(test.startsWith(`src/tests/steps/${row.slug}/`)).toBe(true);
        expect(fs.existsSync(path.join(REPO_ROOT, test))).toBe(true);
      }
    }
  });
});

describe('step-registry — renderStepEntry', () => {
  it('emits no markdown heading and backticks only paths the entry is allowed to own', () => {
    const derived = reg.derivedPaths(inputs);
    for (const row of reg.registryRows(inputs)) {
      const text: string = reg.renderStepEntry(row, inputs);
      for (const line of String(text).split('\n')) {
        expect(line).not.toMatch(/^#{2,3} /);
      }
      expect(String(text)).not.toContain('## ');
      for (const match of String(text).matchAll(/`([^`]+)`/g)) {
        const ref = match[1] ?? '';
        if (!ref.startsWith('scripts/') && !ref.startsWith('src/')) continue;
        expect(derived.has(ref), `${row.slug}: ${ref}`).toBe(true);
      }
    }
  });
});

describe('step-registry — stepEdges', () => {
  it('upstream/downstream are the ledger\'s own answer in both directions', () => {
    const { inchain } = ledger.loadLedger();
    const { env } = inputs;

    for (const row of reg.registryRows(inputs)) {
      const { upstream, downstream } = reg.stepEdges(row.slug, inputs);
      const chains: string[] = (inchain[row.slug] && inchain[row.slug].chains) || [];

      const expected = new Set<string>();
      for (const chain of chains) {
        for (const up of ledger.stepUpstreams(row.slug, { chain, env })) expected.add(up);
      }
      expect(sorted(upstream)).toEqual(sorted([...expected]));

      for (const b of expected) {
        expect(sorted(reg.stepEdges(b, inputs).downstream)).toContain(row.slug);
      }
    }
  });
});

describe('step-registry — a slug outside the cross-step ledger snapshot', () => {
  it('reconcile is declared, not in the ledger, and carries no data rows', () => {
    const rows = reg.registryRows(inputs);
    const reconcile = rows.find((r: { slug: string }) => r.slug === 'reconcile');
    expect(reconcile).toBeTruthy();

    const { inchain } = ledger.loadLedger();
    expect(Object.prototype.hasOwnProperty.call(inchain, 'reconcile')).toBe(false);

    expect(reg.renderStepEntry(reconcile!, inputs)).toContain('not in the cross-step ledger snapshot');
    expect(reg.stepData('reconcile', inputs)).toEqual([]);
  });
});

describe('step-registry — stepData', () => {
  it('parcels writes the parcels table, created by migrations/011_parcels.sql', () => {
    const rows: Array<{ table: string; access: string; migration: string | null }> = reg.stepData('parcels', inputs);
    const row = rows.find((r) => r.table === 'parcels');
    expect(row).toBeTruthy();
    expect(row!.migration).toBe('migrations/011_parcels.sql');
  });
});

describe('generated-blocks — find / strip / outsideMarkerChanged / replaceBlockBody', () => {
  const T = 'a\n<!-- generated:target-files -->\nX\n<!-- /generated:target-files -->\nb\n';

  it('findBlocks reads one block, its id and its body', () => {
    const found = blocks.findBlocks(T);
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe('target-files');
    expect(found[0]!.body).toBe('X\n');
  });

  it('outsideMarkerChanged ignores the inside and sees the outside', () => {
    expect(blocks.outsideMarkerChanged(T, T.replace('X', 'Y'))).toBe(false);
    expect(blocks.outsideMarkerChanged(T, T.replace('b', 'c'))).toBe(true);
    expect(blocks.outsideMarkerChanged(null, T)).toBe(true);
  });

  it('an open marker without a close throws', () => {
    expect(() => blocks.findBlocks('<!-- generated:target-files -->\nX\n')).toThrow(/without a close/);
  });

  it('stripGeneratedBlocks removes the body; replaceBlockBody swaps it', () => {
    expect(blocks.stripGeneratedBlocks(T)).not.toContain('X');
    expect(blocks.replaceBlockBody(T, 'target-files', 'Z\n')).toContain('Z\n<!-- /generated:target-files -->');
  });
});
