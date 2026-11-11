// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-09, MF-14),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24; operator T-3 (admin-only preview page, synthetic goldens labelled).
//
// MF-14 · lane E-MF14. /admin/report-preview: a server component that renders the committed synthetic goldens through the real renderer.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ReportPreviewPage from '../app/admin/report-preview/page';

const open = async (q: Record<string, string> = {}) => render(await ReportPreviewPage({ searchParams: Promise.resolve(q) }));
afterEach(cleanup);

describe('/admin/report-preview', () => {
  it('shows the region, the synthetic banner and one report for the default pick', async () => {
    const { container, getByRole } = await open();
    expect(getByRole('region', { name: 'Report renderer preview' })).toBeTruthy();
    expect(container.textContent).toContain('Synthetic golden fixture. Not this lot.');
    expect(container.querySelectorAll('[data-report]')).toHaveLength(1);
  });
  it('every state and target picks through the query string', async () => {
    for (const state of ['permitted', 'not_permitted', 'not_evaluated', 'variant_flat', 'variant_pitched_a', 'variant_pitched_b', 'at_least', 'loading', 'miss', 'error', 'ad_slot_present', 'ad_slot_absent', 'images_present', 'images_empty']) {
      for (const target of ['mobile', 'web', 'admin', 'pdf']) {
        const { container } = await open({ state, target });
        expect((container.querySelector('[data-report]') as HTMLElement).dataset.target).toBe(target);
        cleanup();
      }
    }
  });
  it('an unknown pick falls back to the defaults; the scenario picker changes the headline', async () => {
    const { container } = await open({ state: 'zzz', target: 'zzz', scenario: 'zzz' });
    expect((container.querySelector('[data-report]') as HTMLElement).dataset.target).toBe('web');
    cleanup();
    const flat = await open({ scenario: 'detached_house/flat_or_shallow_roof' });
    expect(flat.container.querySelector('[data-block="headline"]')).toBeTruthy();
  });
  // MF-38 (RG-8 fold): image states show the picked option's one image through a synthetic placeholder URL, labelled synthetic; never a real asset.
  it('images_present shows one image per picked option with a synthetic URL; images_empty shows none', async () => {
    for (const scenario of ['detached_house/pitched', 'detached_house/flat_or_shallow_roof']) {
      const { container } = await open({ state: 'images_present', target: 'pdf', scenario });
      const imgs = container.querySelectorAll('img');
      expect(imgs).toHaveLength(1);
      expect(imgs[0]?.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
      expect(imgs[0]?.getAttribute('alt')).toBeTruthy();
      expect(container.textContent).toContain('Synthetic golden fixture. Not this lot.');
      cleanup();
    }
    const empty = await open({ state: 'images_empty', scenario: 'detached_house/pitched' });
    expect(empty.container.querySelectorAll('img')).toHaveLength(0);
  });
});
