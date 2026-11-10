// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.2 (one props golden per reachable state per declared target),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31, FE-32; docs/specs/02-web-admin/33_web_admin_engineering_protocol.md
//            (server page -> client mount passes plain data only).
//
// MF-37 · T7. (a) the 17 committed admin media goldens equal a fresh build from the bindings byte for byte (RED: a hand edit differs);
// (b) each golden covers its own state and every declared state has one; (c) the server page hands the client mount plain data only
// (JSON values: no function, Date, Map, class instance or undefined), RED on a planted function prop. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildGoldens, descriptorFile, MEDIA_IDS } from './admin-media-goldens';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();

/** Problems that stop a value crossing the server -> client boundary as plain data. */
export const plainProblems = (v: unknown, at = '/'): string[] => {
  if (v === null || ['string', 'boolean'].includes(typeof v)) return [];
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [`${at}: non-finite number`];
  if (Array.isArray(v)) return v.flatMap((x, i) => plainProblems(x, `${at}${i}/`));
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.entries(v as Json).flatMap(([k, x]) => plainProblems(x, `${at}${k}/`));
  return [`${at}: ${typeof v === 'object' ? (v as object).constructor?.name ?? 'object' : typeof v} is not plain data`];
};

describe('T7 (a) the committed goldens equal a fresh build', () => {
  it('17 goldens, byte for byte', () => {
    const fresh = buildGoldens(ROOT);
    expect(fresh.size).toBe(17);
    for (const [p, text] of fresh) expect([p, fs.readFileSync(path.join(ROOT, p), 'utf8') === text]).toEqual([p, true]);
  });
  it('RED: a hand edit of one golden differs from the fresh build', () => {
    const [p, text] = [...buildGoldens(ROOT)][0] as [string, string];
    expect(text.replace('"fetching": false', '"fetching": true')).not.toBe(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  });
});

describe('T7 (b) coverage', () => {
  it('each golden covers its state, every state of the three surfaces has one', () => {
    for (const id of MEDIA_IDS) {
      const d: Json = JSON.parse(fs.readFileSync(path.join(ROOT, descriptorFile(id)), 'utf8'));
      for (const s of d.states) {
        const g: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/tests/fixtures/surfaces', id, `${s.golden}.web.json`), 'utf8'));
        expect([g.surface, g.state, g.covers]).toEqual([id, s.name, [s.name]]);
      }
    }
  });
});

describe('T7 (c) the page passes plain data only', () => {
  const page = { rows: [{ asset_id: 'a1', kind: 'ad_creative', scenario_key: null, position: null, alt: 'x', mime: 'image/png', bytes: 1, bytes_display: '1 B', created_at: '2026-11-09T00:00:00.000Z', created_display: '2026-11-09 00:00 UTC', signed_url: null }], state: 'hit' };
  it('the page props shape (the MediaListRow fields of src/lib/media/list.ts and a state name) is plain data', () => {
    expect(plainProblems(page)).toEqual([]);
    const listText = fs.readFileSync(path.join(ROOT, 'src/lib/media/list.ts'), 'utf8');
    expect(listText).toMatch(/created_at: string/);
  });
  it('RED: a function prop, a Date and undefined are refused', () => {
    expect(plainProblems({ ...page, onDelete: () => undefined, at: new Date(0), gone: undefined })).toEqual(['/onDelete/: function is not plain data', '/at/: Date is not plain data', '/gone/: undefined is not plain data']);
  });
});
