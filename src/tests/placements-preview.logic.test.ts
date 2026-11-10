// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.10 (ad slots), 11a.7 (goldens)
//             docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-23 (own source, the Sponsored disclosure, never inside a card)
//             docs/specs/02-web-admin/128_surface_standard_policy.md R-17, R-34
//
// MF-40 · plan section 3.5 lock 6 with fold 1 and trim 3: the saved-offer preview goes through the landed buildTree and viewOf and the one
// ReportView. (a) A detail_footer offer renders after the card with the Sponsored label from the registry, its text, data-slot; only that ad
// shows. (b) A scenario_card offer renders beside its scenario's card and nowhere else. (c) On the not_permitted base the scenario ad is gone
// and the footer ad stays (operator "4. D-7 yes"). (d) The landed REPORT goldens the preview reads are unchanged by MF-40. RED plants, on
// copies: a renderer context without the Sponsored label must not render the ad unlabelled; an unknown scenario pair throws.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportView } from '@/components/report/ReportView';
import { buildTree, viewOf } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';
import { previewResponse, previewView, slotFieldOf, type PreviewOffer } from '@/lib/placements/preview';

const SPONSORED = String((reportCtx.content as { sponsored_label: string }).sponsored_label);
const footer: PreviewOffer = { placement_key: 'detail_footer', building_type: null, design_option: null, creative_text: 'Example sponsor offer (preview footer)' };
const card: PreviewOffer = { placement_key: 'scenario_card', building_type: 'detached_house', design_option: 'pitched', creative_text: 'Example sponsor offer (preview card)' };
const html = (o: PreviewOffer, base: 'permitted' | 'not_permitted') => renderToStaticMarkup(createElement(ReportView, { view: previewView(o, base) }));

describe('MF-40 saved-offer preview through the real renderer', () => {
  it('(a) a footer offer: after the card, the Sponsored label, its text and data-slot; no other ad', () => {
    const v = previewView(footer, 'permitted');
    expect(v.slots).toEqual([expect.objectContaining({ slot: 'detail_footer', text: footer.creative_text, disclosure: SPONSORED, placement: 'after_card' })]);
    const out = html(footer, 'permitted');
    expect(SPONSORED).not.toBe('');
    expect(out).toContain(SPONSORED);
    expect(out).toContain(footer.creative_text);
    expect(out).toMatch(/data-slot="detail_footer"/);
    expect(out).not.toContain('Example sponsor offer (renovation)');
  });

  it('(b) a scenario_card offer: beside its scenario card only', () => {
    expect(slotFieldOf(card)).toEqual({ field: 'ad_scenario_detached_house_pitched', scenario: 'detached_house/pitched' });
    expect(previewView(card, 'permitted').slots).toEqual([expect.objectContaining({ scenario: 'detached_house/pitched', placement: 'beside_card', disclosure: SPONSORED })]);
    expect(html(card, 'permitted')).toContain(card.creative_text);
  });

  it('(c) not_permitted base: the scenario ad disappears, the footer ad stays', () => {
    expect(previewView(card, 'not_permitted').slots).toEqual([]);
    expect(html(card, 'not_permitted')).not.toContain(card.creative_text);
    expect(previewView(footer, 'not_permitted').slots).toHaveLength(1);
  });

  it('(d) the landed REPORT goldens the preview reads are the committed files (MF-40 does not edit them)', () => {
    for (const f of ['ad_slot_present', 'not_permitted']) {
      const p = path.join(process.cwd(), `src/tests/fixtures/surfaces/report/${f}.web.json`);
      expect(fs.existsSync(p)).toBe(true);
    }
    expect(Object.keys(previewResponse(footer, 'permitted'))).toEqual(Object.keys((JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/tests/fixtures/surfaces/report/ad_slot_present.web.json'), 'utf8')) as { response_fixture: object }).response_fixture));
  });

  it('RED plants: a context with no Sponsored label never renders the ad unlabelled; an unknown pair throws', () => {
    const ctx = { ...reportCtx, content: { ...(reportCtx.content as object), sponsored_label: '' } };
    const tree = buildTree(previewResponse(footer, 'permitted'), ctx);
    expect(() => viewOf(tree, { scenario: null, target: 'web' }, ctx), 'the renderer must refuse a slot without its Sponsored label').toThrow();
    expect(() => previewView({ ...card, design_option: 'mansard' }, 'permitted')).toThrow(/not a report scenario/);
  });
});
