// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (map seed)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (A1, red until the Q-A1 seed fetch)
//
// A1 map seed lock over the ADOPTED seed (offline, no network): the seed + manifest exist, the
// manifest sha256 / byte count match the seed, the seed is 18 GIS + 9 ward areas, and the licence
// state is recorded as a datum; the Q-A1 ruling (2026-10-08) is recorded in the manifest, and RED
// by design until the orchestrator
// runs `map-seed.mjs --refresh --adopt` after the licence ruling.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const ROOT = process.cwd();
const M = await load('scripts/analysis/bylaw/map-seed.mjs');
const SEED = path.join(ROOT, M.SEED_REL);
const MANIFEST = path.join(ROOT, M.MANIFEST_REL);

describe('A1 map seed lock on the adopted seed', () => {
  it('the seed and its manifest exist and the seed is LF, sorted-key and newline-terminated', () => {
    expect(fs.existsSync(SEED), `${M.SEED_REL} is missing (run map-seed.mjs --refresh --adopt)`).toBe(true);
    expect(fs.existsSync(MANIFEST), `${M.MANIFEST_REL} is missing`).toBe(true);
    const seedText = fs.readFileSync(SEED, 'utf8');
    expect(seedText.includes('\r')).toBe(false);
    expect(M.stableStringify(JSON.parse(seedText))).toBe(seedText);
  });

  it('checkSeed passes on the committed seed + manifest and the counts are 18 GIS + 9 wards', () => {
    const seedText = fs.readFileSync(SEED, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    expect(M.checkSeed(seedText, manifest)).toEqual([]);
    expect(manifest.map_code).toBe('600.60');
    expect(manifest.sources[0].feature_count).toBe(18);
    expect(manifest.sources[1].ward_codes).toEqual([...M.TEY_WARDS, '23'].sort());
    const features = JSON.parse(seedText).features;
    expect(features.filter((f: Json) => f.properties.source === 'city_gis_layer80')).toHaveLength(18);
    expect(features.filter((f: Json) => f.properties.source === 'ckan_wards_2018')).toHaveLength(9);
    for (const f of features) expect(f.geometry.type).toBe('MultiPolygon');
  });

  it('records the licence state (Q-A1 ruling, 2026-10-08) rather than deciding it', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    expect(typeof manifest.sources[0].licence.ruling).toBe('string');
    expect(manifest.sources[0].licence.ruling.trim().length).toBeGreaterThan(0);
    expect(manifest.sources[0].licence.ruling).toBe('not stated — City of Toronto GIS, unverified');
    expect(manifest.sources[0].licence.publish_scope).toBe('local_only');
    expect(manifest.sources[0].licence.stated).toBe('none');
    expect(manifest.sources[1].licence.stated).toBe('Open Government Licence - Toronto');
    expect(typeof manifest.fetched_at).toBe('string');
    expect(manifest.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
