// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-09, MF-14), 5.3 (client is glass),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 15 (same everywhere), Rule 17 (honest display),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24.
//
// MF-14 · lane E-MF14. THE one REPORT component: web, admin and pdf (the print row) render the same view. It reads the view only: no field name, no status
// word, no target comparison, no layout number. Every layout key is honoured through a data attribute and a class. No state: a collapsed block is a
// natively toggled <details>, so the component is safe in a server component.
import type { ReactElement } from 'react';
import type { ReportView as View, ViewNode } from '../../lib/surfaces/report/core';

const Item = ({ n }: { n: ViewNode }): ReactElement => (
  <div data-field={n.field} data-status={n.status} data-unavailable={n.unavailable ? 'true' : 'false'} className="py-1">
    <dt className="text-sm text-gray-600">
      {n.label}
      {n.badge ? <span data-badge className="ml-2 rounded border px-1 text-xs uppercase">{n.badge}</span> : null}
    </dt>
    <dd className="text-base font-medium">{n.text}</dd>
    {n.disclosures.map((d) => <dd key={d} data-disclosure className="text-sm text-gray-700">{d}</dd>)}
    {n.showMeta ? <dd data-meta-line className="font-mono text-xs text-gray-500">confidence: {n.confidence} · provenance: {n.provenance}</dd> : null}
  </div>
);

const Block = ({ name, nodes, columns }: { name: string; nodes: ViewNode[]; columns: number }): ReactElement => (
  <dl data-block={name} style={{ ['--cols' as string]: columns }} className="grid grid-cols-1 gap-x-6 md:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]">
    {nodes.map((n) => <Item key={n.field} n={n} />)}
  </dl>
);

export function ReportView({ view }: { view: View }): ReactElement {
  const { layout } = view;
  const collapsed = layout.details === 'collapsed';
  const hasDetail = view.detail.length > 0;
  return (
    <div
      data-report
      data-target={view.target}
      data-columns={layout.columns}
      data-details={layout.details}
      data-meta={layout.meta}
      data-page-break={layout.page_break}
      data-lifecycle={view.lifecycle ?? ''}
      className="space-y-4"
    >
      {view.reason ? (
        <p data-block="reason" data-status={view.reason.status} className="text-base">
          {view.reason.badge ? <span data-badge className="mr-2 rounded border px-1 text-xs uppercase">{view.reason.badge}</span> : null}
          {view.reason.text}
        </p>
      ) : null}
      {view.headline.length > 0 ? <Block name="headline" nodes={view.headline} columns={layout.columns} /> : null}
      {hasDetail ? (
        collapsed ? (
          <details data-block="details-wrap" className={layout.page_break === 'after_headline' ? 'break-before-page' : ''}>
            <summary className="cursor-pointer text-sm text-gray-600">Details</summary>
            <Block name="detail" nodes={view.detail} columns={layout.columns} />
          </details>
        ) : (
          <div data-block="details-wrap" className={layout.page_break === 'after_headline' ? 'break-before-page' : ''}>
            <Block name="detail" nodes={view.detail} columns={layout.columns} />
          </div>
        )
      ) : null}
    </div>
  );
}
