// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6.4 rule 8 (code is parsed, never executed);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-69 (the report-field inventory, evidence classes);
//            operator ruling Q6 2026-10-07 (the witness uses recorded sql-witness traces ONLY)
//
// Ruling Q6: the report-field inventory generator never executes a SQL builder. A field's witness (evidence W) is
// the fingerprint of the STATIC render (template spans → placeholder, parsed by libpg-query) found in a committed
// sql-witness trace; a field whose static render is not in a trace shows evidence R, honestly.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const RF = await load('scripts/analysis/report-fields.mjs');
const DECL: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/surfaces/_schema/report-fields.decl.json'), 'utf8'));
const builderFiles = new Set<string>();
for (const p of DECL.producers as Json[]) { builderFiles.add(path.resolve(ROOT, p.file)); if (p.row) builderFiles.add(path.resolve(ROOT, p.row.file)); }

const loaded: string[] = [];
let built: Json = {};
beforeAll(async () => {
  const M = Module as unknown as { _load: (req: string, parent: Json, isMain: boolean) => unknown; _resolveFilename: (req: string, parent: Json) => string };
  const orig = M._load;
  M._load = function patched(req: string, parent: Json, isMain: boolean) {
    try { const f = M._resolveFilename(req, parent); if (builderFiles.has(path.resolve(f))) loaded.push(f); } catch { /* unresolvable: not a builder file */ }
    return orig.call(this, req, parent, isMain);
  };
  try { built = await RF.buildInventory({ root: ROOT }); } finally { M._load = orig; }
}, 120_000);

describe('ruling Q6: the report-field witness uses recorded sql-witness traces only (Spec 68 §6.4 rule 8)', () => {
  it('no declared SQL-builder / producer module is loaded (so none is executed)', () => {
    expect(RF.importError).toBeUndefined();
    expect(loaded).toEqual([]);
  });
  it('every witness entry is witnessed exactly when its static-render fingerprint is in a committed trace', () => {
    const fps = new Set<string>();
    for (const list of Object.values(DECL.witness_traces) as string[][]) for (const rel of list) for (const s of JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')).statements) fps.add(s.fingerprint);
    const ws = (JSON.parse(built.json).fields as Json[]).flatMap((f) => f.witness || []);
    expect(ws.length).toBeGreaterThan(0);
    for (const w of ws) expect({ b: w.builder, w: w.witnessed }).toEqual({ b: w.builder, w: Boolean(w.fingerprint) && fps.has(w.fingerprint) });
    expect(ws.filter((w) => /render failed/.test(String(w.reason)))).toEqual([]);
  });
  it('evidence W only where every witness is recorded; the notes no longer describe an in-process render', () => {
    for (const f of JSON.parse(built.json).fields as Json[]) if (f.evidence === 'W') expect(f.witness.every((w: Json) => w.witnessed)).toBe(true);
    expect(built.markdown.includes('rendered in-process')).toBe(false);
    expect(RF.EVIDENCE.W).toMatch(/static render/);
  });
});
