// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5 (dated note 2026-11-09)
//             docs/specs/00-architecture/114_rls_policy_catalog.md §6 (dated notes 2026-11-09)
//             FE-31 (surface conformance: request schemas in MF-42's keyword subset)
//
// T2 (MF-37 plan.v3 §4): the media contract scripts/surfaces/_schema/media-contract.json and its reader
// src/lib/media/contract.ts. Closed kinds and MIME set (no SVG); the object path carries the asset id and
// no user segment; the bucket is private; alt required for both kinds; request_schema and delete_schema use
// only the keyword subset and compile under z.fromJSONSchema; scenario_key enum = row-presentation keys
// (both ways); kind enum = kinds; the five limit keys exist in the seed; the seed max fits the request
// limit; the strict data-URL decode. Each RED plant is an in-memory copy, never a file edit.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  CONTRACT,
  MediaDecodeError,
  decodeDataUrl,
  maxRequestBytes,
  readMediaLimits,
  LIMIT_KEYS,
  MediaLimitsMissingError,
  pathFor,
  requestValidator,
  deleteValidator,
  schemaKeywordViolations,
} from '@/lib/media/contract';

const ROOT = path.resolve(__dirname, '../..');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf-8')) as Record<string, unknown>;
const ROW_PRESENTATION = readJson('scripts/surfaces/_schema/report-v2-seed/row-presentation.json');
const SEED = readJson('scripts/seeds/logic_variables.json') as Record<string, { default: number; max?: number }>;
const REQUEST_LIMIT_BYTES = 4_500_000;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Props = Record<string, Record<string, unknown>>;
const props = (s: Record<string, unknown>) => s.properties as Props;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const url = (mime: string, b: Buffer, name = '') => `data:${mime}${name};base64,${b.toString('base64')}`;
const ASSET = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/** The contract-level checks T2 asserts, as one function so a planted copy can be run through it. */
function contractFindings(c: typeof CONTRACT): string[] {
  const f: string[] = [];
  const kinds = Object.keys(c.kinds).sort();
  if (JSON.stringify(kinds) !== JSON.stringify(['ad_creative', 'report_image'])) f.push(`kinds ${kinds}`);
  const mimes = Object.keys(c.ext_by_mime).sort();
  if (JSON.stringify(mimes) !== JSON.stringify(['image/jpeg', 'image/png', 'image/webp'])) f.push(`mimes ${mimes}`);
  if (mimes.some((m) => m.includes('svg'))) f.push('svg');
  if (!c.path_template.includes('{asset_id}') || /uid|user/.test(c.path_template)) f.push('path_template');
  if (c.bucket.public !== false) f.push('bucket public');
  for (const [k, v] of Object.entries(c.kinds)) if (v.alt_required !== true) f.push(`alt not required for ${k}`);
  for (const [name, s] of [['request', c.request_schema], ['delete', c.delete_schema]] as const) {
    f.push(...schemaKeywordViolations(s).map((v) => `${name} ${v}`));
    try {
      z.fromJSONSchema(s as Parameters<typeof z.fromJSONSchema>[0]);
    } catch (e) {
      f.push(`${name} does not compile: ${String(e)}`);
    }
  }
  const kindEnum = (props(c.request_schema).kind!.enum as string[]).slice().sort();
  if (JSON.stringify(kindEnum) !== JSON.stringify(kinds)) f.push('kind enum != kinds');
  return f;
}

describe('media contract — closed sets and privacy', () => {
  it('the committed contract has no findings', () => {
    expect(contractFindings(CONTRACT)).toEqual([]);
  });

  it('bucket id is surface-media and the path template is {kind}/{asset_id}.{ext}', () => {
    expect(CONTRACT.bucket).toEqual({ id: 'surface-media', public: false });
    expect(CONTRACT.path_template).toBe('{kind}/{asset_id}.{ext}');
    expect(pathFor('report_image', ASSET, 'image/jpeg')).toBe(`report_image/${ASSET}.jpg`);
    expect(() => pathFor('report_image', 'not-a-uuid', 'image/png')).toThrow();
    expect(() => pathFor('report_image', ASSET, 'image/svg+xml')).toThrow();
  });

  it('report_image requires scenario_key and position; ad_creative requires nothing', () => {
    expect(CONTRACT.kinds.report_image!.requires).toEqual(['scenario_key', 'position']);
    expect(CONTRACT.kinds.ad_creative!.requires).toEqual([]);
  });

  it('RED plants: public bucket, svg MIME, a uid path segment, a third kind, alt optional', () => {
    const plants: Array<[string, (c: typeof CONTRACT) => void]> = [
      ['bucket public', (c) => { c.bucket.public = true; }],
      ['svg', (c) => { c.ext_by_mime['image/svg+xml'] = 'svg'; }],
      ['path_template', (c) => { c.path_template = '{uid}/{kind}/{asset_id}.{ext}'; }],
      ['kinds', (c) => { c.kinds.banner = { requires: [], alt_required: true }; }],
      ['alt not required', (c) => { c.kinds.ad_creative!.alt_required = false; }],
    ];
    for (const [needle, plant] of plants) {
      const c = clone(CONTRACT);
      plant(c);
      expect(contractFindings(c).join('|'), needle).toContain(needle);
    }
  });
});

describe('media contract — request_schema and delete_schema', () => {
  it('RED: a `format: data-url` keyword is refused by the subset check', () => {
    const c = clone(CONTRACT);
    props(c.request_schema).file!.format = 'data-url';
    expect(contractFindings(c)).toContain('request #/properties/file: format');
  });

  it('RED: an if/then conditional is refused (subset check and z.fromJSONSchema both)', () => {
    const c = clone(CONTRACT);
    c.request_schema.if = { properties: { kind: { const: 'report_image' } } };
    c.request_schema.then = { required: ['scenario_key'] };
    const f = contractFindings(c).join('|');
    expect(f).toContain('request #: if');
    expect(f).toContain('request does not compile');
  });

  it('RED: additionalProperties true is refused', () => {
    const c = clone(CONTRACT);
    c.delete_schema.additionalProperties = true;
    expect(contractFindings(c).join('|')).toContain('delete #: additionalProperties must be false');
  });

  it('request properties and required are exactly the contract', () => {
    expect(Object.keys(props(CONTRACT.request_schema)).sort()).toEqual(['alt', 'file', 'kind', 'position', 'scenario_key']);
    expect(CONTRACT.request_schema.required).toEqual(['kind', 'alt', 'file']);
    expect(CONTRACT.delete_schema.required).toEqual(['asset_id', 'confirm']);
  });

  it('scenario_key enum equals the row-presentation keys, both ways (kept verbatim, "/" included)', () => {
    const enumKeys = (props(CONTRACT.request_schema).scenario_key!.enum as string[]).slice().sort();
    const seedKeys = Object.keys(ROW_PRESENTATION).sort();
    expect(enumKeys.filter((k) => !seedKeys.includes(k))).toEqual([]);
    expect(seedKeys.filter((k) => !enumKeys.includes(k))).toEqual([]);
  });

  it('the validator applies the kind requires and the schema bounds', () => {
    const file = url('image/png', PNG);
    expect(requestValidator.safeParse({ kind: 'ad_creative', alt: 'a', file }).success).toBe(true);
    expect(requestValidator.safeParse({ kind: 'report_image', alt: 'a', file }).success).toBe(false);
    const sk = Object.keys(ROW_PRESENTATION)[0];
    expect(requestValidator.safeParse({ kind: 'report_image', alt: 'a', file, scenario_key: sk, position: 0 }).success).toBe(true);
    for (const bad of [
      { kind: 'ad_creative', alt: '', file },
      { kind: 'ad_creative', alt: 'a', file, extra: 1 },
      { kind: 'ad_creative', alt: 'a', file: 'data:image/svg+xml;base64,AA==' },
      { kind: 'report_image', alt: 'a', file, scenario_key: sk, position: -1 },
      { kind: 'report_image', alt: 'a', file, scenario_key: sk, position: 1.5 },
      { kind: 'report_image', alt: 'a', file, scenario_key: 'nope', position: 0 },
    ]) {
      expect(requestValidator.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(deleteValidator.safeParse({ asset_id: ASSET, confirm: 'x' }).success).toBe(true);
    expect(deleteValidator.safeParse({ asset_id: ASSET, confirm: '' }).success).toBe(false);
    expect(deleteValidator.safeParse({ asset_id: ASSET }).success).toBe(false);
  });
});

describe('media contract — limits', () => {
  it('the five limit keys exist in the logic_variables seed', () => {
    expect(Object.keys(CONTRACT.limits).sort()).toEqual(
      ['list_cache_seconds', 'list_page_max', 'max_bytes', 'signed_url_ttl_seconds', 'storage_timeout_ms'],
    );
    for (const key of Object.values(CONTRACT.limits)) expect(SEED[key], key).toBeDefined();
  });

  it('the seed max upload, base64-encoded plus 64 KiB, stays under the 4.5 MB request limit', () => {
    const max = SEED[CONTRACT.limits.max_bytes]!.max!;
    expect(maxRequestBytes({ max_bytes: max })).toBeLessThan(REQUEST_LIMIT_BYTES);
    expect(SEED[CONTRACT.limits.max_bytes]!.default).toBeLessThanOrEqual(max);
  });

  it('RED: a 5,000,000 max does not fit', () => {
    expect(maxRequestBytes({ max_bytes: 5_000_000 })).toBeGreaterThanOrEqual(REQUEST_LIMIT_BYTES);
  });
  // Security OUTPUT seat F1 (2026-11-09): the live values are refused outside the seed's [min, max], fail closed.
  const fakeDb = (over: Record<string, number>) => ({
    query: async () => ({ rows: Object.values(LIMIT_KEYS).map((k) => ({ variable_key: k, variable_value: over[k] ?? SEED[k]!.default })) }),
  }) as unknown as Parameters<typeof readMediaLimits>[0];
  it('readMediaLimits returns the seed defaults when the rows hold them; LIMIT_KEYS equals the contract limits', async () => {
    expect(LIMIT_KEYS).toEqual(CONTRACT.limits);
    expect((await readMediaLimits(fakeDb({}))).max_bytes).toBe(SEED[LIMIT_KEYS.max_bytes]!.default);
  });
  it('RED: a 3,000,001-byte cap and a one-day signed-URL TTL are refused (fail closed)', async () => {
    await expect(readMediaLimits(fakeDb({ [LIMIT_KEYS.max_bytes]: 3_000_001 }))).rejects.toBeInstanceOf(MediaLimitsMissingError);
    await expect(readMediaLimits(fakeDb({ [LIMIT_KEYS.signed_url_ttl_seconds]: 86_400 }))).rejects.toThrow('media_signed_url_ttl_seconds');
  });
});

describe('decodeDataUrl — strict', () => {
  it('accepts png, jpeg and webp, plain and with RJSF ;name=', () => {
    expect(decodeDataUrl(url('image/png', PNG))).toMatchObject({ mime: 'image/png', ext: 'png' });
    expect(decodeDataUrl(url('image/jpeg', JPEG, ';name=photo%201.jpg'))).toMatchObject({ mime: 'image/jpeg', ext: 'jpg' });
    expect(decodeDataUrl(url('image/webp', WEBP)).bytes.equals(WEBP)).toBe(true);
  });

  const rejects: Array<[string, string, string]> = [
    ['missing ;base64,', `data:image/png,${PNG.toString('base64')}`, 'shape'],
    ['odd ;name= (a quote/semicolon smuggle)', `data:image/png;name=a";x=1;base64,${PNG.toString('base64')}`, 'shape'],
    ['invalid base64 chars', 'data:image/png;base64,iVBO$$==', 'shape'],
    ['bad base64 length', 'data:image/png;base64,iVBORw0', 'base64'],
    ['non-canonical base64 padding bits', 'data:image/png;base64,iVBORw1=', 'base64'],
    ['empty payload', 'data:image/png;base64,', 'empty'],
    ['svg MIME', url('image/svg+xml', PNG), 'mime'],
    ['MIME says png, bytes are jpeg', url('image/png', JPEG), 'magic'],
    ['MIME says webp, RIFF but not WEBP', url('image/webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])), 'magic'],
    ['not a data URL', 'https://example.test/a.png', 'shape'],
  ];
  for (const [label, input, reason] of rejects) {
    it(`rejects: ${label}`, () => {
      let caught: unknown;
      try {
        decodeDataUrl(input);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MediaDecodeError);
      expect((caught as MediaDecodeError).reason).toBe(reason);
    });
  }
});
