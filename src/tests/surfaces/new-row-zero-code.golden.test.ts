// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24 (a new catalogue row reaches mobile, web, admin and PDF with zero
//            front-end code; the renderer throws on an unknown field or status),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 0a (P1), 11a.7 (dated note 2026-11-09, MF-14).
//
// MF-14 · McFrontend queue · lane E-MF14. THE FE-24 LOCK. A declaration with ONE new catalogue-style field and a response that carries it
// render on every layout row with no renderer change: the test supplies data only. Removing the field from the declaration, or an
// unknown status, throws. A renderer holding a hard-coded field list fails here (proven RED, docs/reports/red-evidence/MF-14/).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportRenderError, buildTree, viewOf } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { ReportView } from '../../components/report/ReportView';
import { TARGETS } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const NEW = { name: 'zz_new_row_m2', label: 'Brand new row', source: 'catalogue:zz_new_row_m2', type: ['number', 'm²'], unit: 'm²' };
const ctxWith = (field: Json | null): Json => {
  const c = JSON.parse(JSON.stringify(reportCtx)) as Json;
  if (field) c.decl.sections.push({ id: 'zz', fields: [field] });
  return c;
};
const render = (c: Json, response: Json, target: string): string =>
  renderToStaticMarkup(createElement(ReportView, { view: viewOf(buildTree(response, c), { scenario: 'detached_house/flat_or_shallow_roof', target }, c) } as never));

describe('FE-24: a new catalogue row needs no front-end code', () => {
  for (const target of TARGETS as string[]) {
    it(`reaches ${target} in the detail block with its label, value and unit`, () => {
      const html = render(ctxWith(NEW), { status: 'permitted', zz_new_row_m2: 77.5 }, target);
      expect(html).toContain('Brand new row');
      expect(html).toContain('77.5 m²');
      expect(html).toContain('data-field="zz_new_row_m2"');
    });
  }
  it('a declared field absent from the response renders nothing; a null shows the dash', () => {
    expect(render(ctxWith(NEW), { status: 'permitted' }, 'web')).not.toContain('Brand new row');
    expect(render(ctxWith(NEW), { status: 'permitted', zz_new_row_m2: null }, 'web')).toMatch(/Brand new row[\s\S]*—/);
  });
  it('removing the field from the declaration throws RR-FIELD', () => {
    try { buildTree({ status: 'permitted', zz_new_row_m2: 1 }, ctxWith(null)); throw new Error('did not throw'); } catch (e) {
      expect(e).toBeInstanceOf(ReportRenderError);
      expect((e as ReportRenderError).problems[0]).toMatch(/^RR-FIELD unknown field: zz_new_row_m2/);
    }
  });
  it('an unknown status throws', () => {
    expect(() => buildTree({ status: 'maybe', zz_new_row_m2: 1 }, ctxWith(NEW))).toThrow(ReportRenderError);
  });
});
