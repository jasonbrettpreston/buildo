// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (the binding standard, dated note 2026-11-10),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (descriptor + content + standard components), FE-32 (contract refs,
//            dated note 2026-11-10: paths), FE-33 (every displayed string from content; data shown as sent).
//
// Binding standard (MF-40 plan delta 1, option C; operator 2026-11-10 "y recommendation: C, with the four trims. approved"; section 8 folds 2, 9, 13).
// The generic bindings on planted descriptors (the live admin_media stays the T7 byte-identity case):
//   (a) LIST: rows path -> record refs <rows>.0.<field>; row actions delete | edit | toggle_active (only delete red; delete and edit get a Modal);
//       boolean and enum cells show <label>.option.<value> from content, null shows nothing, a value outside the options throws; the default sort
//       is the first column with a sort_field that is not an image, ascending, and none without one; an image column without alt_field throws;
//   (b) FORM: an options_from select carries contract refs in the golden and takes its options from FormRuntime.options as data;
//   (c) admin_media through the generic LIST (OUTPUT regression-guardian MEDIUM-1, LOW-2; MF-37 behaviours): a truthy signed_url renders an <img>
//       with that src and the alt_field text and no fallback; a click on the delete row action calls actionForm with the row and kind delete and
//       shows the Modal title from content.
// Not an FE lock of its own (the locks are surface-conformance, contract-binding and render-smoke). No DB, no network.
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminMantineProvider } from '../../components/surfaces/web/AdminMantineProvider';
import { formProps, formTree, type Node } from '../../components/surfaces/web/FormBinding';
import { ListBinding, listProps, listTree, type Row } from '../../components/surfaces/web/ListBinding';
import { MEDIA_CONTENT as MC, MEDIA_SURFACES } from '../../lib/media/surfaces';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- descriptor JSON and library props
const ssr = (el: ReactElement): string => renderToStaticMarkup(h(AdminMantineProvider, { scheme: 'light', children: el })).replace(/&#x27;|&#39;/g, "'");

const LIST: Json = {
  identity: { id: 'fx_offers' },
  inputs: { contract_ref: ['contract_fx_list'], field_whitelist: ['offer_id', 'placement', 'over_cap'] },
  render: { list: {
    id_field: 'offer_id', rows: 'contract_fx_list.offers',
    columns: [
      { field: 'placement', label: 'fx_offers.col.placement', display: 'enum', values: ['detail_footer', 'scenario_card'], sort_field: 'placement' },
      { field: 'over_cap', label: 'fx_offers.col.over_cap', display: 'boolean' },
    ],
    row_actions: [{ kind: 'edit', label: 'fx_offers.action.edit' }, { kind: 'toggle_active', label: 'fx_offers.action.toggle' }],
  } },
};
const C: Record<string, string> = {
  'fx_offers.col.placement': 'Placement', 'fx_offers.col.placement.option.detail_footer': 'Detail footer', 'fx_offers.col.placement.option.scenario_card': 'Scenario card',
  'fx_offers.col.over_cap': 'Over cap', 'fx_offers.col.over_cap.option.true': 'Yes', 'fx_offers.col.over_cap.option.false': 'No',
  'fx_offers.col.actions': 'Actions', 'fx_offers.action.edit': 'Edit', 'fx_offers.action.toggle': 'Turn on or off',
  'fx_offers.edit.title': 'Edit offer', 'fx_offers.edit.close': 'Close', 'fx_offers.empty': 'No offers', 'fx_offers.loading': 'Loading',
};
const ROWS: Row[] = [{ offer_id: 'o1', placement: 'scenario_card', over_cap: 'true' }, { offer_id: 'o2', placement: 'detail_footer', over_cap: null }];

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }) });
  if (!('ResizeObserver' in globalThis)) Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: class { observe(): void { /* jsdom stub */ } unobserve(): void { /* jsdom stub */ } disconnect(): void { /* jsdom stub */ } } });
});
afterEach(() => cleanup());

describe('(a) the generic LIST', () => {
  it('rows path: every record ref is <rows>.0.<field>; idAccessor is id_field', () => {
    const table = (listTree(LIST as never, 'hit').children ?? [])[0] as Node;
    expect(table.props.idAccessor).toBe('offer_id');
    expect((table.props.records as Json[])[0]).toEqual({
      offer_id: { contract: 'contract_fx_list.offers.0.offer_id' }, placement: { contract: 'contract_fx_list.offers.0.placement' }, over_cap: { contract: 'contract_fx_list.offers.0.over_cap' },
    });
  });
  it('row actions: one Button each in order, none red unless delete; one Modal for edit only; derived keys; no Image without an image column', () => {
    const kids = (listTree(LIST as never, 'hit').children ?? []) as Node[];
    expect(kids.map((k) => k.component)).toEqual(['DataTable', 'Button', 'Button', 'Modal']);
    expect(kids[1]?.props).toEqual({ size: 'lg', variant: 'light' });
    expect(kids[3]?.props).toEqual({ title: { content: 'fx_offers.edit.title' }, closeButtonProps: { size: 'xl', 'aria-label': { content: 'fx_offers.edit.close' } } });
    const del = structuredClone(LIST); del.render.list.row_actions = [{ kind: 'delete', label: 'fx_offers.action.edit' }];
    expect(((listTree(del as never, 'hit').children ?? []) as Node[])[1]?.props.color).toBe('red');
  });
  it('boolean and enum cells show the content text of their option; null shows nothing', () => {
    const p = listProps(LIST as never, listTree(LIST as never, 'hit'), ROWS, C) as Json;
    const [placement, cap] = p.columns as [Json, Json];
    expect([placement.render(ROWS[0]), cap.render(ROWS[0]), cap.render(ROWS[1])]).toEqual(['Scenario card', 'Yes', null]);
  });
  it('RED: a value outside the declared options throws; a missing option key throws', () => {
    const p = listProps(LIST as never, listTree(LIST as never, 'hit'), ROWS, C) as Json;
    expect(() => ((p.columns as Json[])[0] as Json).render({ placement: 'renovation_section' })).toThrow('ListBinding: placement value renovation_section is not a declared option');
    const c = { ...C }; delete c['fx_offers.col.over_cap.option.true'];
    const q = listProps(LIST as never, listTree(LIST as never, 'hit'), ROWS, c) as Json;
    expect(() => ((q.columns as Json[])[1] as Json).render(ROWS[0])).toThrow('ListBinding: missing content key fx_offers.col.over_cap.option.true');
  });
  it('default sort: the first column with a sort_field (not an image), ascending; none sorts nothing', () => {
    const order = (d: Json): [number, number] => {
      const html = ssr(h(ListBinding, { descriptor: d as never, tree: listTree(d as never, 'hit'), rows: ROWS, content: C }));
      return [html.indexOf('Scenario card'), html.indexOf('Detail footer')];
    };
    const [s, d] = order(LIST);
    expect(d).toBeLessThan(s);
    const later = structuredClone(LIST); later.render.list.columns.reverse();
    const [s2, d2] = order(later);
    expect(d2).toBeLessThan(s2);
    const none = structuredClone(LIST); delete none.render.list.columns[0].sort_field;
    const [s3, d3] = order(none);
    expect(s3).toBeLessThan(d3);
  });
  it('RED: an image column without alt_field throws (no empty-path fallback)', () => {
    const img = structuredClone(LIST); img.render.list.columns.unshift({ field: 'preview', label: 'fx_offers.col.preview', display: 'image' });
    expect(() => listTree(img as never, 'hit')).toThrow('ListBinding: image column preview has no alt_field');
  });
  it('renders: both action labels and the option texts from content, every button lg', () => {
    const html = ssr(h(ListBinding, { descriptor: LIST as never, tree: listTree(LIST as never, 'hit'), rows: ROWS, content: C }));
    for (const s of ['Edit', 'Turn on or off', 'Scenario card', 'Detail footer', 'Yes', 'Placement']) expect(html).toContain(s);
    const buttons = [...html.matchAll(/<button[^>]*class="[^"]*mantine-Button-root[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(buttons.length).toBe(4);
    expect(buttons.filter((b) => !/data-size="lg"/.test(b))).toEqual([]);
  });
});

describe('(b) the options_from select', () => {
  const SCHEMA: Json = { type: 'object', additionalProperties: false, required: ['advertiser_id'], properties: { advertiser_id: { type: 'string', format: 'uuid' } } };
  const FORM: Json = { identity: { id: 'fx_offer' }, render: { form: { submit: 'fx_offer.submit', fields: [
    { field: 'advertiser_id', widget: 'select', label: 'fx_offer.field.advertiser', options_from: { items: 'contract_fx_list.advertisers', value: 'advertiser_id', label: 'name' } },
  ] } } };
  const FC = { 'fx_offer.field.advertiser': 'Advertiser', 'fx_offer.submit': 'Save', 'fx_offer.errors.required': 'Required', 'fx_offer.errors.type': 'Type', 'fx_offer.errors.const': 'Const', 'fx_offer.errors.format': 'Format', 'fx_offer.errors.additional_properties': 'Extra' };
  it('the golden carries contract refs, never option content keys', () => {
    const sel = (formTree(FORM as never, SCHEMA as never, 'static').children ?? [])[0] as Node;
    expect([sel.component, sel.props.data, sel.props.option]).toEqual(['Select', { contract: 'contract_fx_list.advertisers' },
      { value: { contract: 'contract_fx_list.advertisers.0.advertiser_id' }, label: { contract: 'contract_fx_list.advertisers.0.name' } }]);
  });
  it('the options are the run-time rows, labels shown as sent; with no rows the property is unchanged', () => {
    const tree = formTree(FORM as never, SCHEMA as never, 'static');
    const rows = [{ advertiser_id: 'a-1', name: 'North Co' }, { advertiser_id: 'a-2', name: 'South Co' }];
    const p = formProps(tree, SCHEMA as never, FC, { options: { advertiser_id: rows } }) as Json;
    expect(p.schema.properties.advertiser_id.oneOf).toEqual([{ const: 'a-1', title: 'North Co' }, { const: 'a-2', title: 'South Co' }]);
    expect((formProps(tree, SCHEMA as never, FC) as Json).schema.properties.advertiser_id).toEqual(SCHEMA.properties.advertiser_id);
  });
});

describe('(c) admin_media through the generic LIST (MF-37 behaviours)', () => {
  const media = MEDIA_SURFACES.list as unknown as Json;
  const ROW: Row = { asset_id: 'a1', kind: 'ad_creative', scenario_key: null, position: null, alt: 'A', mime: 'image/png', bytes: 1, bytes_display: '1 B', created_at: '2026-11-09T00:00:00Z', created_display: '2026-11-09 00:00 UTC', signed_url: 'https://x/y.png' };
  it('a truthy signed_url renders an <img> with that src and the alt_field text, and no preview fallback', () => {
    const html = ssr(h(ListBinding, { descriptor: media as never, tree: listTree(media as never, 'hit'), rows: [ROW], content: MC }));
    const imgs = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    expect(imgs.filter((t) => t.includes('src="https://x/y.png"') && t.includes('alt="A"')).length).toBe(1);
    expect(html).not.toContain(MC['admin_media.preview.unavailable'] as string);
  });
  it('a click on the delete row action calls actionForm once with the row and kind delete; the Modal title comes from content', async () => {
    const actionForm = vi.fn(() => null);
    // mantine-datatable hides a column whose media query does not match; the shared jsdom stub matches nothing, so this case matches every query.
    const stub = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...stub(q), matches: true })) as typeof window.matchMedia;
    onTestFinished(() => { window.matchMedia = stub; });
    render(h(AdminMantineProvider, { scheme: 'light', children: h(ListBinding, { descriptor: media as never, tree: listTree(media as never, 'hit'), rows: [ROW], content: MC, actionForm }) }));
    expect(actionForm).not.toHaveBeenCalled();
    expect(screen.queryByText(MC['admin_media.delete.title'] as string)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: MC['admin_media.action.delete'] as string }));
    expect(actionForm).toHaveBeenCalledTimes(1);
    expect(actionForm).toHaveBeenCalledWith(ROW, expect.any(Function), 'delete');
    expect(await screen.findByText(MC['admin_media.delete.title'] as string)).toBeTruthy();
  });
});
