// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-II (Layer 1 reaches the compute as one generated
//            file; operator chat batch J, 2026-10-21-chat-batch-j#CHAT-36.OQ1, simplified), R-IT (the version hash
//            recipe, #CHAT-36.OQ12), R-DJ (1) (every generator --check runs at pre-commit);
//            docs/specs/01-pipeline/134_resolve_bylaws.md §2 (134:32, table_version and evaluator_version)
//
// scripts/generate-bylaw-layer2-input.mjs builds the Layer 1 assembly with loadRealLotAssembly unchanged (the function
// the golden-lot helper uses) and writes docs/reference/bylaw-layer2-input.json, the one file the resolve_bylaws
// compute will require(): the agreed units, the evaluator vocabulary, enactments, absence rulings, the exception
// authoring map, and the two versions. This lock proves the committed file is current (versions and body hash
// recomputed from the tree), is the assembly itself (a full rebuild compares equal and rebuilds the same evaluator
// context), and that the CLI has explicit modes.
//
// RED FIRST: committed as it.fails at 577f239f, before the generator existed (gate K artifact
// docs/reports/red-evidence/resolve_bylaws/layer2-input-red.json); flipped to it with the generator.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs / JSON surface
const ROOT = path.resolve(__dirname, '../../../../');
const GEN_REL = 'scripts/generate-bylaw-layer2-input.mjs';
const OUT_REL = 'docs/reference/bylaw-layer2-input.json';
const gen = async (): Promise<Json> => {
  expect(fs.existsSync(path.join(ROOT, GEN_REL)), `${GEN_REL} should exist`).toBe(true);
  return (await import(pathToFileURL(path.join(ROOT, GEN_REL)).href)) as Json;
};
const committed = (): Json => {
  expect(fs.existsSync(path.join(ROOT, OUT_REL)), `${OUT_REL} should exist`).toBe(true);
  return JSON.parse(fs.readFileSync(path.join(ROOT, OUT_REL), 'utf8')) as Json;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
const cli = (...args: string[]) => spawnSync(process.execPath, [path.join(ROOT, GEN_REL), ...args], { cwd: ROOT, encoding: 'utf8' });

describe('R-II / R-IT: the committed Layer 1 input is current', () => {
  it('table_version is filesHash over every file under scripts/seeds/bylaw and scripts/analysis/bylaw, the assembly and the generator', async () => {
    const g = await gen();
    const entries = g.inputEntries(ROOT) as Array<{ path: string; sha256: string }>;
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('scripts/seeds/bylaw/vocab.json');
    expect(paths).toContain('scripts/seeds/bylaw/adjudications.json');
    expect(paths).toContain('scripts/seeds/bylaw/layer2-map.json');
    expect(paths).toContain('scripts/analysis/bylaw/evaluate.mjs');
    expect(paths).toContain('scripts/analysis/bylaw-validation/assembly.mjs');
    expect(paths).toContain(GEN_REL);
    expect(paths.some((p) => p.split('/').some((s) => s.startsWith('.')))).toBe(false);
    expect(committed().table_version).toBe(lib.filesHash(entries));
  });

  it('evaluator_version is filesHash over evaluate.mjs and dsl.mjs', async () => {
    const g = await gen();
    const files = ['scripts/analysis/bylaw/evaluate.mjs', 'scripts/analysis/bylaw/dsl.mjs'];
    expect(g.EVALUATOR_FILES).toEqual(files);
    const expected = lib.filesHash(files.map((p) => ({ path: p, sha256: lib.sha256Hex(fs.readFileSync(path.join(ROOT, p))) })));
    expect(committed().evaluator_version).toBe(expected);
  });

  it('body_sha256 is the sha256 of the serialized body', async () => {
    const g = await gen();
    const doc = committed();
    expect(doc.body_sha256).toBe(lib.sha256Hex(g.serializeBody(doc.body)));
  });

  it('checkDoc is RED on a stale table_version, evaluator_version or body, and clean on the committed file', async () => {
    const g = await gen();
    const doc = committed();
    expect(g.checkDoc(ROOT, doc)).toEqual([]);
    expect(g.checkDoc(ROOT, { ...doc, table_version: '0'.repeat(64) }).join('\n')).toMatch(/table_version/);
    expect(g.checkDoc(ROOT, { ...doc, evaluator_version: '0'.repeat(64) }).join('\n')).toMatch(/evaluator_version/);
    expect(g.checkDoc(ROOT, { ...doc, body: { ...doc.body, units: [] } }).join('\n')).toMatch(/body/);
  });
});

describe('R-II: the committed body is the assembly (one function, no drift)', () => {
  it('a full rebuild with loadRealLotAssembly equals the committed body', async () => {
    const g = await gen();
    const body = await g.buildBody(ROOT);
    expect(g.serializeBody(body)).toBe(g.serializeBody(committed().body));
  }, 60_000);

  it('the evaluator context rebuilt from the body equals the assembly context', async () => {
    const A = (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href)) as Json;
    const E = (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')).href)) as Json;
    const { C, units } = await A.loadRealLotAssembly(ROOT);
    const b = committed().body;
    expect(E.makeContext(b.evaluator_vocab, { enactments: b.enactments, absences: b.absences, authored: b.authored })).toEqual(C);
    expect(b.units).toEqual(JSON.parse(JSON.stringify(units)));
  }, 60_000);
});

describe('R-II: explicit modes; no default write', () => {
  it('no mode, two modes and an unknown flag each exit 2 and write nothing', () => {
    const before = fs.statSync(path.join(ROOT, OUT_REL)).mtimeMs;
    expect(cli().status).toBe(2);
    expect(cli('--check', '--write').status).toBe(2);
    expect(cli('--chek').status).toBe(2);
    expect(fs.statSync(path.join(ROOT, OUT_REL)).mtimeMs).toBe(before);
  });

  it('--check exits 0 on the committed tree', () => {
    const r = cli('--check');
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});
