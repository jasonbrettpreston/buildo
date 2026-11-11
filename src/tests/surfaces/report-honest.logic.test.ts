// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.3 (closed status list, with the 2026-11-08 dated note: `none`),
//            11a.4 (confidence, provenance), 11a.7 (structured tree), 126:295 (inherits Spec 122 1.2: omission is a build failure, "none" is valid per field),
//            126:552 (R-27: one home), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-06 (the lock), FE-28 (`none`, `lifecycle`), FE-29 (the node contract file).
//
// MF-12 tranche 1 · McFrontend queue · lane T. The FE-06 honest-display lock over the committed report goldens (operator L-1C and G-2 a, 2026-11-08).
// The node contract has ONE home, scripts/surfaces/_schema/report-tree.schema.json; this file holds no copy of its key list or closed sets.
// A golden tree must validate against it; on top of it: `none` appears only in a lifecycle tree, a lifecycle tree carries one message node,
// a `not_evaluated:<reason>` has text in the content registry, and every disclosure code is a key of disclosure_texts (F-3). Each check is proven RED on a mutated tree. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { honestProblems } from '../../../scripts/surfaces/report-checks.mjs'; // MF-15 D-1 a: the checks have one home, shared with surface-validate.mjs (R-27)

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'src/tests/fixtures/surfaces/report');
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const SCHEMA: Json = readJson('scripts/surfaces/_schema/report-tree.schema.json');
const LIFECYCLE: string[] = SCHEMA.properties.lifecycle.enum;
const PRESENTATION: Json = readJson('scripts/surfaces/_schema/report-presentation.json');
// The closed disclosure-code list is the keys of report-presentation.json `disclosure_texts` (Spec 126 11a.3: a closed list; MF-12 panel 2 F-3).
// The three keys below are the object's own metadata, not codes. Read at run time, never copied: an empty list means every code fails.
const DISCLOSURE_META = ['generated_from', 'note', 'importance_default'];
const CODES = Object.keys(PRESENTATION.disclosure_texts).filter((k) => !DISCLOSURE_META.includes(k));

const goldens = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'states.json').sort() : [];

describe('FE-06 report-honest lock (schema: report-tree.schema.json)', () => {
  it('there are 64 goldens to check', () => { // MF-38: + images_present, images_empty x 4 targets
    expect(goldens).toHaveLength(64);
  });

  for (const f of goldens) {
    it(`${f}: validates against the node contract; none only in lifecycle trees; lifecycle closed`, () => {
      const g: Json = readJson(path.join('src/tests/fixtures/surfaces/report', f));
      expect(honestProblems(g.rendered_tree)).toEqual([]);
      const life = LIFECYCLE.includes(g.state);
      expect('lifecycle' in g.rendered_tree).toBe(life);
      if (life) expect(g.rendered_tree.lifecycle).toBe(g.state);
    });
  }

  it('RED fixtures: each defect is caught', () => {
    const ok: Json = { nodes: [{ field: 'status_text', source: 'content', label: 'l', value: 'v', status: 'permitted', confidence: 'none', provenance: 'none', disclosures: [] }] };
    const life: Json = { lifecycle: 'miss', nodes: [{ ...ok.nodes[0], value: null, status: 'none' }] };
    const mut = (t: Json, over: Json, tree: Json = {}): Json => ({ ...t, ...tree, nodes: [{ ...t.nodes[0], ...over }] });
    const drop = (t: Json, key: string): Json => { const { [key]: _gone, ...rest } = t.nodes[0]; return { ...t, nodes: [rest] }; }; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(honestProblems(ok)).toEqual([]);
    expect(honestProblems(life)).toEqual([]);
    for (const key of SCHEMA.$defs.node.required as string[]) expect(honestProblems(drop(ok, key)), `missing ${key}`).not.toEqual([]);
    expect(honestProblems(mut(ok, { extra: 1 }))).not.toEqual([]);
    expect(honestProblems(mut(ok, { status: null }))).not.toEqual([]);
    expect(honestProblems(mut(ok, { status: 'not_buildable' }))).toEqual([]);
    expect(honestProblems(mut(ok, { status: 'loading' }))).not.toEqual([]);
    expect(honestProblems(mut(ok, { status: 'none' }))).not.toEqual([]);
    expect(honestProblems(mut(ok, { status: 'not_evaluated:made_up' }))).not.toEqual([]);
    expect(honestProblems(mut(ok, { disclosures: ['made_up_code'] }))).not.toEqual([]);
    expect(honestProblems(mut(ok, { disclosures: ['made_up_code'] })).join()).toContain('disclosure code not in disclosure_texts');
    if (CODES.length > 0) expect(honestProblems(mut(ok, { disclosures: [CODES[0]] }))).toEqual([]);
    expect(honestProblems(mut(ok, { confidence: null }))).not.toEqual([]);
    expect(honestProblems(mut(ok, { confidence: 'very-high' }))).not.toEqual([]);
    expect(honestProblems(mut(ok, { provenance: 'guess' }))).not.toEqual([]);
    expect(honestProblems(mut(ok, { value: 5 }))).not.toEqual([]);
    expect(honestProblems(mut(life, { status: 'permitted' }))).not.toEqual([]);
    expect(honestProblems(mut(life, {}, { lifecycle: 'empty' }))).not.toEqual([]);
    expect(honestProblems({ ...life, nodes: [life.nodes[0], life.nodes[0]] })).not.toEqual([]);
    expect(honestProblems({ nodes: [] })).not.toEqual([]);
  });

  // MF-38 (FE-29 dated note 2026-11-11): ONE closed image node kind, single image per option. It carries no reading (no value, status,
  // confidence, provenance or disclosures); each item names its scenario; alt is required, non-blank and concrete; no URL ever.
  it('RED fixtures: the image node (MF-38)', () => {
    const reason = { field: 'status_text', source: 'content', label: 'l', value: 'v', status: 'permitted', confidence: 'none', provenance: 'none', disclosures: [] };
    const item = { scenario: 'detached_house/pitched', asset_id: 'a1', alt: 'A pitched-roof house', caption: 'Illustrative — not this lot' };
    const image = { field: 'card_image', source: 'content', kind: 'image', label: 'Illustration', images: [item] };
    const t = (img: Json, extra: Json[] = []): Json => ({ nodes: [reason, img, ...extra] });
    const withItem = (over: Json): Json => t({ ...image, images: [{ ...item, ...over }] });
    expect(honestProblems(t(image))).toEqual([]);
    expect(honestProblems(t({ ...image, images: [item, { ...item, scenario: 'detached_house/flat_or_shallow_roof', asset_id: 'a2' }] }))).toEqual([]);
    for (const key of SCHEMA.$defs.image_node.required as string[]) { const { [key]: _gone, ...rest } = image as Json; expect(honestProblems(t(rest)), `missing ${key}`).not.toEqual([]); } // eslint-disable-line @typescript-eslint/no-unused-vars
    for (const key of SCHEMA.$defs.image_item.required as string[]) { const { [key]: _gone, ...rest } = item as Json; expect(honestProblems(t({ ...image, images: [rest] })), `item missing ${key}`).not.toEqual([]); } // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(honestProblems(withItem({ alt: '' }))).not.toEqual([]);
    expect(honestProblems(withItem({ alt: '   ' }))).not.toEqual([]);
    expect(honestProblems(withItem({ alt: 'Houseplex {dwelling_units} units' }))).not.toEqual([]);
    expect(honestProblems(withItem({ caption: '' }))).not.toEqual([]);
    expect(honestProblems(withItem({ url: 'https://x/y.png' }))).not.toEqual([]);
    expect(honestProblems(withItem({ asset_id: '' }))).not.toEqual([]);
    expect(honestProblems(withItem({ scenario: 'made/up' }))).not.toEqual([]);
    expect(honestProblems(t({ ...image, images: [] }))).not.toEqual([]);
    for (const k of ['value', 'status', 'confidence', 'provenance', 'disclosures', 'url', 'extra']) expect(honestProblems(t({ ...image, [k]: k === 'disclosures' ? [] : 'none' })), `image with ${k}`).not.toEqual([]);
    expect(honestProblems(t({ ...image, kind: 'video' }))).not.toEqual([]);
    expect(honestProblems(t(image, [{ ...image }]))).not.toEqual([]); // two image nodes
    expect(honestProblems(t({ ...image, images: [item, { ...item, asset_id: 'a2' }] }))).not.toEqual([]); // two images for one option
    expect(honestProblems(t({ ...image, source: 'catalogue' }))).not.toEqual([]);
    expect(honestProblems({ lifecycle: 'miss', nodes: [{ ...reason, value: null, status: 'none' }, image] })).not.toEqual([]); // no image in a lifecycle tree
    expect(honestProblems({ nodes: [image] })).toEqual([]); // an image needs no reading beside it
  });
});
