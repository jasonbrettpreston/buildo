// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-UNIVERSE (census arm), §10 (determinism);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-15, M-42 (R-ZV); docs/reports/mcbylaw-phase1-plan.md S11
//
// S11 locks over the COMMITTED census (offline, no DB): census.json matches the census.sql blob in the
// working tree, census.sql passes the witness check against the committed catalog, the counts are present
// and partition, and the census reads only dominant-label / provenance columns (never parcels.bylaw_*).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const ROOT = process.cwd();
const C = await load('scripts/analysis/bylaw/census.mjs');
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');
const CENSUS_JSON = path.join(ROOT, 'scripts/seeds/bylaw/census.json');

describe('G-UNIVERSE census arm on the committed census', () => {
  it('checkCensus passes on the real root (sha = working tree, SELECT-only, counts present, current adoption)', async () => {
    const r = await C.checkCensus({ root: ROOT });
    expect(r.violations).toEqual([]);
    expect(r.status).toBe('pass');
  });

  it('census.sql passes the witness check against the committed catalog and reads no parcels.bylaw_* column', async () => {
    const sql = fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/census.sql'), 'utf8');
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/witness/_catalog.json'), 'utf8')).tables;
    const r = await C.witnessCheck(sql, catalog);
    expect(r.violations).toEqual([]);
    expect(Object.keys(r.reads)).toEqual(['parcels']);
    for (const col of r.reads.parcels) expect(col).not.toMatch(/^bylaw_/);
    expect(sql.includes('\r')).toBe(false);
  });

  it('census.json is LF, sorted-key stable, carries no clock field, and records the witness reads', () => {
    const text = fs.readFileSync(CENSUS_JSON, 'utf8');
    expect(text.includes('\r')).toBe(false);
    const census = JSON.parse(text);
    expect(SNAP.stableStringify(census)).toBe(text);
    expect(text).not.toMatch(/generated_at|refreshed_at|mtime/);
    expect(Object.keys(census.source_tables)).toEqual(Object.keys(census.reads));
  });
});
