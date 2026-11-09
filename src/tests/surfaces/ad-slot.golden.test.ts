// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-23 (ad slots: own source `ad_slot` and disclosure R-17, never inside a card R-34, outside the card list),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.10 (dated note 2026-11-09, MF-20), 11a.1 (the closed binding set),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 17 (disclosure), Rule 34 (ad policy),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-29 (the node contract).
//
// MF-20 · McFrontend queue · lane E-MF20b. THE FE-23 LOCK over the ad_slot_present and ad_slot_absent goldens (four targets each) and the renderer branch.
// Present: each pick shows the unscoped slots after the card and ONLY its own scenario's slot, BESIDE the card as a sibling element (never inside the
// card), each with the visible "Sponsored" disclosure from the content registry. Absent: no slot, no disclosure, no empty box. RED: a slot without the
// disclosure, an ad_slot source inside nodes, an unknown slot id, a scenario that does not match the contract, a slot on a lifecycle tree, a duplicate.
// The renderer and the gate (report-checks.mjs) are both proven RED on the same mutations. Mutations are applied to copies. No DB, no network.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { ReportRenderError, assertTree, buildTree, viewOf } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { ReportView } from '../../components/report/ReportView';
import { TARGETS, honestProblems } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const GOLD = path.join(process.cwd(), 'src/tests/fixtures/surfaces/report');
const golden = (state: string, target: string): Json => JSON.parse(fs.readFileSync(path.join(GOLD, `${state}.${target}.json`), 'utf8'));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const SCENARIOS = Object.keys(reportCtx.lists as Json);
const AD: Json = reportCtx.adContract as Json;
const SPONSORED: string = reportCtx.content.sponsored_label;
const html = (target: string, tree: Json, scenario: string | null, ctx: Json = reportCtx): Document => {
  const box = document.createElement('div');
  box.innerHTML = renderToStaticMarkup(createElement(ReportView, { view: viewOf(tree, { scenario, target }, ctx) as never }));
  return box as unknown as Document;
};
const throwsRR = (fn: () => unknown, needle: string): void => {
  let err: unknown;
  try { fn(); } catch (e) { err = e; }
  expect(err).toBeInstanceOf(ReportRenderError);
  expect((err as ReportRenderError).message).toContain(needle);
};

describe('FE-23 ad_slot_present: slots beside their card, outside it, disclosed (four targets)', () => {
  it.each(TARGETS as string[])('%s: each pick shows its own scenario slot beside the card and the two Q-8 slots after it', (target) => {
    const tree = golden('ad_slot_present', target).rendered_tree;
    expect(tree.slots).toHaveLength(4);
    for (const sc of SCENARIOS) {
      const box = html(target, tree, sc) as unknown as HTMLElement;
      const card = box.querySelector('[data-block="card"]') as HTMLElement;
      const row = box.querySelector('[data-block="card-row"]') as HTMLElement;
      const beside = [...box.querySelectorAll('aside[data-placement="beside_card"]')] as HTMLElement[];
      const after = [...box.querySelectorAll('aside[data-placement="after_card"]')] as HTMLElement[];
      expect(beside).toHaveLength(1);
      expect(beside[0]?.getAttribute('data-scenario')).toBe(sc);
      expect(beside[0]?.getAttribute('data-ad-field')).toBe(AD.scenario_fields[sc]);
      expect(after.map((a) => a.getAttribute('data-slot')).sort()).toEqual(['detail_footer', 'renovation_section']);
      for (const a of [...beside, ...after]) {
        expect(card.contains(a), 'a slot is never inside the card (R-34)').toBe(false); // sibling, not descendant
        expect(a.querySelector('[data-disclosure]')?.textContent).toBe(SPONSORED); // R-17, from the registry
        expect(a.hasAttribute('data-field')).toBe(false);
      }
      expect(beside[0]?.parentElement).toBe(row);
      expect(card.parentElement).toBe(row);
      expect(card.querySelector('[data-block="ad-slot"]')).toBeNull();
      for (const other of SCENARIOS.filter((x) => x !== sc)) expect(box.innerHTML).not.toContain(`data-scenario="${other}"`); // the other scenario's ad is absent
      expect(box.querySelector('[data-block="reason"]')?.closest('[data-block="card"]'), 'the reason stays outside the card').toBeNull();
    }
  });
  it.each(TARGETS as string[])('%s: a pick with no scenario shows only the unscoped slots', (target) => {
    const box = html(target, golden('ad_slot_present', target).rendered_tree, null) as unknown as HTMLElement;
    expect(box.querySelectorAll('aside[data-placement="beside_card"]')).toHaveLength(0);
    expect(box.querySelectorAll('aside[data-placement="after_card"]')).toHaveLength(2);
  });
  it('the fixture offers are the ruled synthetic copy (D-6) and the four targets carry one tree (parity)', () => {
    const t0 = golden('ad_slot_present', 'mobile');
    for (const s of t0.rendered_tree.slots) expect(s.value).toMatch(/^Example sponsor offer \(.+\)$/);
    for (const t of TARGETS as string[]) expect(JSON.stringify(golden('ad_slot_present', t).rendered_tree)).toBe(JSON.stringify(t0.rendered_tree));
  });
  it('every declared ad field is bound ad_slot to a slot id of the contract; the scenario map names exactly the scenario keys (both directions)', () => {
    const decl: Json[] = reportCtx.decl.sections.flatMap((s: Json) => s.fields);
    const ads = decl.filter((f) => String(f.source).startsWith('ad_slot:'));
    for (const f of ads) expect(AD.slots).toContain(String(f.source).split(':')[1]);
    expect(Object.keys(AD.scenario_fields).sort()).toEqual([...SCENARIOS].sort());
    for (const name of Object.values(AD.scenario_fields) as string[]) expect(ads.find((f) => f.name === name)?.source).toBe('ad_slot:scenario_card');
    expect(ads).toHaveLength(2 + SCENARIOS.length);
  });
});

describe('FE-23 ad_slot_absent: nothing renders (four targets)', () => {
  it.each(TARGETS as string[])('%s: no slots key, no ad block, no Sponsored text, no empty box', (target) => {
    const g = golden('ad_slot_absent', target);
    expect('slots' in g.rendered_tree).toBe(false);
    expect(Object.values(g.response_fixture).filter((v) => v === null)).toHaveLength(4); // the four ad fields are declared and null
    for (const sc of [null, ...SCENARIOS]) {
      const box = html(target, g.rendered_tree, sc) as unknown as HTMLElement;
      expect(box.querySelector('aside, [data-block="ad-slot"]')).toBeNull();
      expect(box.textContent).not.toContain(SPONSORED);
    }
  });
});

describe('FE-23 buildTree: ad fields go to slots, never to nodes', () => {
  const base = (over: Json): Json => ({ synthetic: true, status: 'permitted', gfa_flat_m2: 1, ...over });
  it('an ad field becomes a root slot with the registry disclosure; no node carries an ad_slot source', () => {
    const t = buildTree(base({ detail_footer: 'Example sponsor offer (x)' }), reportCtx);
    expect(t.slots).toEqual([{ field: 'detail_footer', slot: 'detail_footer', source: 'ad_slot', label: expect.any(String), value: 'Example sponsor offer (x)', disclosure: SPONSORED }]);
    expect((t.nodes as Json[]).some((n) => n.source === 'ad_slot' || n.field === 'detail_footer')).toBe(false);
  });
  it('a scenario field carries its scenario from the contract', () => {
    const [sc, name] = Object.entries(AD.scenario_fields)[0] as [string, string];
    const t = buildTree(base({ [name]: 'Example sponsor offer (y)' }), reportCtx);
    expect(t.slots[0]).toMatchObject({ slot: 'scenario_card', scenario: sc });
  });
  it('null and empty values yield no slot and no empty box', () => {
    for (const v of [null, '']) expect('slots' in buildTree(base({ detail_footer: v }), reportCtx)).toBe(false);
  });
  it('a report-level ad value is independent of the lot status: it shows with a not_permitted card too', () => {
    const t = buildTree({ status: 'not_permitted:10.20.20.40(1)', detail_footer: 'Example sponsor offer (z)' }, reportCtx);
    expect(t.slots).toHaveLength(1);
    expect((t.nodes as Json[]).every((n) => n.source !== 'ad_slot')).toBe(true);
  });
  // Operator 2026-11-09, "4. D-7 yes": no per-scenario ad beside a card whose scenario is not_permitted or not_evaluated; the report-level slots are unchanged.
  it.each(['not_permitted:10.20.20.40(1)', 'not_evaluated:no_existing_house'])('D-7: status %s omits the scenario slot (no slot, no disclosure, no box) and keeps the report-level slots', (status) => {
    const [sc, name] = Object.entries(AD.scenario_fields)[0] as [string, string];
    const t = buildTree({ status, [name]: 'Example sponsor offer (s)', detail_footer: 'Example sponsor offer (d)', renovation_section: 'Example sponsor offer (r)' }, reportCtx);
    expect((t.slots as Json[]).map((x) => x.slot).sort()).toEqual(['detail_footer', 'renovation_section']);
    const box = html('web', t, sc) as unknown as HTMLElement;
    expect(box.querySelector('aside[data-placement="beside_card"]')).toBeNull();
    expect(box.querySelectorAll('aside[data-placement="after_card"]')).toHaveLength(2);
  });
  it('D-7: a permitted or at_least scenario still shows its scenario slot beside the card', () => {
    const [sc, name] = Object.entries(AD.scenario_fields)[0] as [string, string];
    for (const status of ['permitted', 'at_least']) {
      const t = buildTree({ status, gfa_flat_m2: 1, [name]: 'Example sponsor offer (s)' }, reportCtx);
      expect((t.slots as Json[]).map((x) => x.slot)).toEqual(['scenario_card']);
      expect((html('web', t, sc) as unknown as HTMLElement).querySelectorAll('aside[data-placement="beside_card"]')).toHaveLength(1);
    }
  });
  it('a lifecycle response cannot carry an ad field; a context without the contract throws RR-SLOT, not a TypeError', () => {
    throwsRR(() => buildTree({ lifecycle: 'miss', detail_footer: 'x' }, reportCtx), 'unexpected field on a lifecycle response');
    const noAd = { ...reportCtx, adContract: undefined };
    throwsRR(() => buildTree(base({ detail_footer: 'x' }), noAd), 'RR-SLOT ad contract missing');
  });
});

describe('FE-23 RED: the renderer and the gate refuse a bad slot (R-17, R-34, the contract)', () => {
  const good = (): Json => clone(golden('ad_slot_present', 'web').rendered_tree);
  const slotOf = (t: Json, slot: string): Json => t.slots.find((s: Json) => s.slot === slot);
  const cases: Array<[string, (t: Json) => void, string]> = [
    ['empty disclosure (R-17)', (t) => { slotOf(t, 'detail_footer').disclosure = ''; }, 'disclosure'],
    ['a disclosure that is not the registry label (R-17)', (t) => { slotOf(t, 'detail_footer').disclosure = 'Ad'; }, 'sponsored_label'],
    ['a missing disclosure (R-17)', (t) => { delete slotOf(t, 'detail_footer').disclosure; }, 'disclosure'],
    ['an empty value', (t) => { slotOf(t, 'detail_footer').value = ''; }, 'value'],
    ['a slot id that is not in the contract', (t) => { slotOf(t, 'detail_footer').slot = 'not_a_slot'; }, 'not'],
    ['a scenario slot without its scenario', (t) => { delete slotOf(t, 'scenario_card').scenario; }, 'scenario'],
    ['a scenario that is not the contract\'s', (t) => { slotOf(t, 'scenario_card').scenario = 'detached_house/other'; }, 'scenario'],
    ['a scenario on an unscoped slot', (t) => { slotOf(t, 'detail_footer').scenario = SCENARIOS[0]; }, 'scenario'],
    ['a duplicate slot', (t) => { t.slots.push(clone(t.slots[0])); }, 'duplicate'],
    ['a slot id that is in the contract but is not the declared member of the field', (t) => { slotOf(t, 'detail_footer').slot = 'renovation_section'; }, 'declared member'],
    ['a label that is not the declared label', (t) => { slotOf(t, 'detail_footer').label = 'Changed'; }, 'declared label'],
    ['an undeclared field', (t) => { slotOf(t, 'detail_footer').field = 'no_such_field'; }, 'declared'],
    ['an extra key on a slot (a targeting or identity field)', (t) => { slotOf(t, 'detail_footer').targeting = ['income']; }, 'additional'],
    ['an ad_slot source inside nodes (R-34)', (t) => { t.nodes[1].source = 'ad_slot'; }, 'ad_slot'],
    ['a slot on a lifecycle tree', (t) => { t.lifecycle = 'miss'; }, 'lifecycle'],
    ['a slot whose source is not ad_slot', (t) => { slotOf(t, 'detail_footer').source = 'parcels'; }, 'source'],
  ];
  it.each(cases)('renderer: %s', (_name, mutate, needle) => {
    const t = good();
    mutate(t);
    let err: unknown;
    try { assertTree(t, reportCtx); } catch (e) { err = e; }
    expect(err, 'assertTree must throw before any render').toBeInstanceOf(ReportRenderError);
    expect((err as ReportRenderError).message.toLowerCase()).toContain(needle.toLowerCase());
    expect(() => viewOf(t, { scenario: SCENARIOS[0], target: 'web' }, reportCtx)).toThrow(ReportRenderError);
  });
  it.each(cases)('gate: %s', (_name, mutate) => {
    const t = good();
    mutate(t);
    expect(honestProblems(t).length).toBeGreaterThan(0);
  });
  it('GREEN the other direction: the unmutated present golden passes both', () => {
    expect(() => assertTree(good(), reportCtx)).not.toThrow();
    expect(honestProblems(good())).toEqual([]);
  });
  it('a contract-less context refuses a tree with slots', () => {
    throwsRR(() => assertTree(good(), { ...reportCtx, adContract: undefined }), 'RR-SLOT ad contract missing');
  });
});

describe('FE-23 binding: the ad_slot source resolves in the contract file, and only there', () => {
  it('binding-sources.json names the ad contract as the ad_slot file, and the file exists with the declared slot ids', () => {
    const bs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/surfaces/_schema/binding-sources.json'), 'utf8'));
    expect(bs.sources.ad_slot.file).toBe('scripts/surfaces/_schema/ad-contract.json');
    expect(AD.slots).toEqual(['detail_footer', 'renovation_section', 'scenario_card']);
  });
  it('ad_placements agrees with the contract: same slot ids, max_slots 1, the visible label and a FAIL blocking disclosure', () => {
    const pl: Json[] = reportCtx.content.ad_placements.placements;
    expect(pl.map((p) => p.key).sort()).toEqual([...AD.slots].sort());
    for (const p of pl) {
      expect(p.max_slots, p.key).toBe(1);
      expect(p.disclosure).toMatchObject({ label: SPONSORED, severity: 'FAIL', blocking: true });
    }
  });
});
