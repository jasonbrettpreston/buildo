// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.2 (one props golden per reachable state per declared target),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31, FE-32; docs/specs/02-web-admin/33_web_admin_engineering_protocol.md
//            (server page -> client mount passes plain data only).
//
// MF-37 · T7. (a) the 17 committed admin media goldens equal a fresh build from the bindings byte for byte (RED: a hand edit differs);
// (b) each golden covers its own state and every declared state has one; (c) the server page hands the client mount plain data only
// (JSON values: no function, Date, Map, class instance or undefined), RED on a planted function prop. No DB, no network.
// Binding standard (MF-40 plan delta 1 section 8 folds 2 and 4): the builder is surface-goldens.ts over the converted manifest, and admin_media is
// built by the GENERIC LIST from its declared image column, id_field and delete row action; (a) is the fold-2 plant (the 7 admin_media goldens
// regenerate equal to the committed files), and (a2) shows the generic code is what decides it (RED: a sort_field on the image column differs).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { listTree } from '../../components/surfaces/web/ListBinding';
import { buildGoldens, convertedIds, descriptorFile, MOBILE_GOLDEN_TESTS, otherTarget } from './surface-goldens';

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
  // MF-40 (2026-11-10): the builder covers the three admin placements surfaces too (17 + 17 = 34 web goldens; mobile_parcel_search is built by mobile jest).
  // MF-44 (dated 2026-11-11): + the 10 web goldens of mobile_parcel_search (searchWebTree over the mobile golden's situation; 34 -> 44).
  it('44 goldens, byte for byte', () => {
    const fresh = buildGoldens(ROOT);
    expect(fresh.size).toBe(44);
    for (const [p, text] of fresh) expect([p, fs.readFileSync(path.join(ROOT, p), 'utf8') === text]).toEqual([p, true]);
  });
  it('RED: a hand edit of one golden differs from the fresh build', () => {
    const [p, text] = [...buildGoldens(ROOT)][0] as [string, string];
    expect(text.replace('"fetching": false', '"fetching": true')).not.toBe(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  });
});

describe('T7 (a2) admin_media comes from the generic LIST', () => {
  it('the descriptor declares the image column first, id_field and one delete action; the hit golden props equal listTree of it', () => {
    const d: Json = JSON.parse(fs.readFileSync(path.join(ROOT, descriptorFile(ROOT, 'admin_media')), 'utf8'));
    expect([d.render.list.columns[0], d.render.list.id_field, d.render.list.row_actions]).toEqual([
      { field: 'signed_url', label: 'admin_media.col.preview', display: 'image', alt_field: 'alt' }, 'asset_id', [{ kind: 'delete', label: 'admin_media.action.delete' }]]);
    const g: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/tests/fixtures/surfaces/admin_media/hit.web.json'), 'utf8'));
    expect(listTree(d as never, 'hit')).toEqual(g.props);
  });
  it('RED: a sort_field planted on the image column changes the props (the generic map, not a hard-coded preview)', () => {
    const d: Json = JSON.parse(fs.readFileSync(path.join(ROOT, descriptorFile(ROOT, 'admin_media')), 'utf8'));
    const g: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/tests/fixtures/surfaces/admin_media/hit.web.json'), 'utf8'));
    d.render.list.columns[0].display = 'text'; d.render.list.columns[0].sort_field = 'signed_url';
    expect(listTree(d as never, 'hit')).not.toEqual(g.props);
  });
});

describe('T7 (b) coverage', () => {
  it('each golden covers its state, every state of the three surfaces has one', () => {
    // MF-35 (dated 2026-11-10): mobile_parcel_search is converted too; its mobile goldens are built and checked by mobile jest
    // (mobile/__tests__/parcelScreens.golden.test.ts), so this web coverage case reads the web surfaces only.
    expect(convertedIds(ROOT)).toEqual(['admin_media', 'admin_media_upload', 'admin_media_delete', 'mobile_parcel_search', 'admin_placements', 'admin_offers', 'admin_advertiser_entry']);
    for (const id of convertedIds(ROOT).filter((x) => JSON.parse(fs.readFileSync(path.join(ROOT, descriptorFile(ROOT, x)), 'utf8')).identity.platforms.includes('web'))) {
      const d: Json = JSON.parse(fs.readFileSync(path.join(ROOT, descriptorFile(ROOT, id)), 'utf8'));
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

// MF-35 OUTPUT fold MEDIUM 2 (Spec 126 §11b.2 item (6): the builder covers every converted surface): a target the root builder cannot build is
// either declared in MOBILE_GOLDEN_TESTS (a mobile jest test that checks those goldens) or the build throws; never a silent skip.
describe('T7 (d) non-web targets fail closed', () => {
  it('every converted surface with a mobile target names its mobile golden test, and that file exists', () => {
    const mobile = convertedIds(ROOT).filter((id) => JSON.parse(fs.readFileSync(path.join(ROOT, descriptorFile(ROOT, id)), 'utf8')).identity.platforms.includes('mobile'));
    expect(mobile).toEqual(['mobile_parcel_search']);
    for (const id of mobile) expect([id, fs.existsSync(path.join(ROOT, MOBILE_GOLDEN_TESTS[id] ?? 'none'))]).toEqual([id, true]);
  });
  it('RED: a mobile target with no declared test, and a pdf target, throw', () => {
    expect(() => otherTarget('mobile_new_page', 'mobile')).toThrow('no mobile golden test declared for mobile_new_page');
    expect(() => otherTarget('mobile_parcel_search', 'pdf')).toThrow('no pdf binding for mobile_parcel_search');
    expect(otherTarget('mobile_parcel_search', 'mobile')).toBe('mobile/__tests__/parcelScreens.golden.test.ts');
  });
});
