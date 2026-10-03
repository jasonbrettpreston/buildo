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
import { Writable } from 'node:stream';

import { main } from '../../scripts/analysis/step-registry.mjs';
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
    const { inchain } = ledger.effectiveLedger();
    const { env } = inputs;

    for (const row of reg.registryRows(inputs)) {
      const { upstream, downstream } = reg.stepEdges(row.slug, inputs);
      const chains: string[] = (inchain[row.slug] && inchain[row.slug].chains) || [];

      const expected = new Set<string>();
      for (const chain of chains) {
        for (const up of ledger.stepUpstreams(row.slug, { chain, env, ledger: inputs.ledger })) expected.add(up);
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

describe('step-registry — the effective cross-step ledger (P1-C5, plan Fold 9 D-A/D-D)', () => {
  const effInputs = inputs.ledger as { inchain: Record<string, { source?: string; reads?: unknown }> };
  it('RED: inputs.ledger is the effective ledger — every converted row is source-tagged descriptor', () => {
    const eff = ledger.effectiveLedger();
    expect(Object.keys(effInputs.inchain).sort()).toEqual(Object.keys(eff.inchain).sort());

    let converted = 0;
    for (const k of Object.keys(eff.inchain)) {
      if (eff.inchain[k].source !== 'descriptor') continue;
      converted += 1;
      expect(effInputs.inchain[k]?.source).toBe('descriptor');
      expect(effInputs.inchain[k]?.reads).toEqual(eff.inchain[k].reads);
    }
    expect(converted).toBeGreaterThan(0);
  });

  it('RED: the rendered data line names its source', () => {
    const rows = reg.registryRows(inputs);
    const parcels = rows.find((r: { slug: string }) => r.slug === 'parcels');
    expect(parcels).toBeTruthy();
    expect(reg.renderStepEntry(parcels!, inputs)).toContain('  - data (descriptor): ');

    let snapshotRows = 0;
    for (const row of rows) {
      const entry = effInputs.inchain[row.slug];
      if (!entry || entry.source !== 'snapshot') continue;
      snapshotRows += 1;
      expect(reg.renderStepEntry(row, inputs)).toContain('  - data (lineage snapshot, declared not witnessed): ');
    }
    // skip-if-none: the loop above is a no-op when no rendered row is a snapshot row
    void snapshotRows;
  });
});

describe('step-registry — grouped src/ consumers + declared vs observed (P1-C6, Fold 9b / Fold 14)', () => {
  it('RED: src/ table consumer rows are grouped per (consumer, table) with a column count', () => {
    const fake = {
      consumerRows: [
        { consumer: 'src/a.ts', producer: 'p', kind: 'table', key: 't.x' },
        { consumer: 'src/a.ts', producer: 'p', kind: 'table', key: 't.y' },
        { consumer: 'src/a.ts', producer: 'p', kind: 'table', key: 'u.z' },
        { consumer: 'src/b.ts', producer: 'p', kind: 'table', key: 't.x' },
        { consumer: 'enrich_parcels', producer: 'p', kind: 'records_meta', key: 'k' },
        { consumer: 'src/c.ts', producer: 'q', kind: 'table', key: 't.x' },
      ],
    };
    expect(reg.stepConsumers('p', fake)).toEqual([
      'enrich_parcels (records_meta k)',
      'src/a.ts (table t: 2 columns)',
      'src/a.ts (table u: 1 column)',
      'src/b.ts (table t: 1 column)',
    ]);
  });

  it('RED: declaredVsObserved splits each table into both / declaredOnly / observedOnly', () => {
    const declared = { reads: { t: ['a', 'b'], u: ['k'] }, writes: { t: ['a'] } };
    const observed = { reads: { t: ['b', 'c'] }, writes: {} };
    expect(reg.declaredVsObserved(declared, observed)).toEqual({
      reads: [
        { table: 't', both: ['b'], declaredOnly: ['a'], observedOnly: ['c'] },
        { table: 'u', both: [], declaredOnly: ['k'], observedOnly: [] },
      ],
      writes: [{ table: 't', both: [], declaredOnly: ['a'], observedOnly: [] }],
    });
  });

  it('RED: loadObserved unions committed POST traces and the fixture record', () => {
    const linkWsib = reg.loadObserved(REPO_ROOT, 'link_wsib');
    expect(linkWsib.traces).toBe(2);
    expect(linkWsib.fixtureSuites).toBeGreaterThanOrEqual(0);
    expect(linkWsib.reads.wsib_registry).toContain('linked_entity_id');
    expect(linkWsib.writes.wsib_registry).toContain('linked_entity_id');

    const enrichParcels = reg.loadObserved(REPO_ROOT, 'enrich_parcels');
    expect(enrichParcels.traces).toBe(0);
    expect(enrichParcels.fixtureSuites).toBeGreaterThanOrEqual(1);
    expect(Object.keys(enrichParcels.reads).length).toBeGreaterThan(0);

    expect(reg.loadObserved(REPO_ROOT, 'no_such_slug')).toEqual({
      traces: 0,
      fixtureSuites: 0,
      unreadable: 0,
      reads: {},
      writes: {},
    });
  });

  it('RED: renderDeclaredVsObserved renders the declared/observed table per slug', () => {
    const linkWsib = reg.renderDeclaredVsObserved('link_wsib', inputs, reg.loadObserved(REPO_ROOT, 'link_wsib'));
    expect(linkWsib.startsWith('declared: descriptor (deriveMeta) · observed: 2 POST trace(s) + ')).toBe(true);
    expect(linkWsib).toContain('\nreads:\n');
    expect(linkWsib).toContain('\nwrites:\n');
    expect(linkWsib.split('\n').some((line) => line.startsWith('  wsib_registry: both '))).toBe(true);
    expect(linkWsib.endsWith('\n')).toBe(true);

    const emptyObserved = { traces: 0, fixtureSuites: 0, unreadable: 0, reads: {}, writes: {} };
    const pending = reg.renderDeclaredVsObserved('parcels', inputs, emptyObserved);
    expect(pending).toContain('observed: none — no committed POST trace or fixture record (witness pending)');
    expect(pending).toContain('\nreads:\n');
    expect(pending).toContain('\nwrites:\n');
    expect(pending.split('\n').some((line) => line === '  none')).toBe(true);
    expect(pending.endsWith('\n')).toBe(true);
  });
});

describe('step:registry CLI — ADVISORY readers grep retired, DECLARED vs OBSERVED section (P1-C6)', () => {
  it('RED: the CLI prints DECLARED, ADVISORY, then DECLARED vs OBSERVED, and no git-grep readers', () => {
    let out = '';
    const stdout = new Writable({
      write(chunk, _enc, cb) {
        out += String(chunk);
        cb();
      },
    });
    const stderr = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });

    const code = main(['link_wsib'], { stdout, stderr });
    expect(code).toBe(0);

    const declared = out.indexOf('== DECLARED ==\n');
    const advisory = out.indexOf('== ADVISORY ==\n');
    const dvo = out.indexOf('== DECLARED vs OBSERVED ==\n');
    expect(declared).toBeGreaterThanOrEqual(0);
    expect(advisory).toBeGreaterThan(declared);
    expect(dvo).toBeGreaterThan(advisory);

    expect(out).toContain('declared: descriptor (deriveMeta) · observed: 2 POST trace(s)');
    expect(out).toContain('tests naming the script or its tables');
    expect(out).not.toContain('undeclared readers');
    expect(out).not.toContain('git grep of the step');
  });

  it('RED: the CLI module defines neither undeclaredReaders nor advisoryTerms', () => {
    const cliSource = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts', 'analysis', 'step-registry.mjs'),
      'utf8',
    );
    expect(cliSource).not.toContain('function undeclaredReaders');
    expect(cliSource).not.toContain('function advisoryTerms');
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
