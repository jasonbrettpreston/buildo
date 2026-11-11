// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-09, MF-14), 5.3 (client is glass),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 15 (same everywhere), Rule 17 (honest display),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24.
//
// MF-14 · lane E-MF14. THE one REPORT component: web, admin and pdf (the print row) render the same view. It reads the view only: no field name, no status
// word, no target comparison, no layout number. Every layout key is honoured through a data attribute and a class. No state: a collapsed block is a
// natively toggled <details>, so the component is safe in a server component.
import type { ReactElement } from 'react';
import type { ReportView as View, ViewChecked, ViewImage, ViewNode, ViewSlot } from '../../lib/surfaces/report/core';

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

// MF-20 (Spec 126 11a.10, Spec 128 R-17, R-34): a sponsored slot is an <aside> that is a SIBLING of the card, never inside it; the disclosure is always visible.
// It carries no data-field: it is not a report field.
const Slot = ({ s }: { s: ViewSlot }): ReactElement => (
  <aside data-block="ad-slot" data-slot={s.slot} data-ad-field={s.field} data-placement={s.placement} aria-label={s.disclosure} data-scenario={s.scenario ?? ''} className="rounded border p-3 md:w-64">
    <p data-disclosure className="text-xs uppercase text-gray-600">{s.disclosure}</p>
    <p className="text-base">{s.text}</p>
  </aside>
);

// MF-38 (Spec 126 11a.7 dated note 2026-11-11; O-1 b; plan D-5): the picked option's ONE image, a plain <img> with its alt and caption at the top of
// the card, the same on every target (pdf included: no script island in a print row). No carousel, dots or swipe. The URL is the server-issued one.
// MF-38 follow-up (operator 2026-11-11, "y to all as built"): the SAME figure fills the v21 option picture box of ReportPage (`fill`; no second
// picture part). There the caption sits on the dark frame report-outer in the named report colour report-soft (#8f8f99 on #141417, 5.7:1, WCAG 2.1
// SC 1.4.3; text-gray-600 there is 2.4:1). In the card on the light admin preview the caption keeps text-gray-600 (report-soft on white is 3.2:1).
export const Picture = ({ im, fill = false }: { im: ViewImage; fill?: boolean }): ReactElement => (
  <figure data-block="image" data-image-field={im.field} data-asset-id={im.asset_id} className={fill ? 'absolute inset-0 m-0 flex flex-col overflow-hidden bg-report-outer' : 'relative overflow-hidden rounded'}>
    {/* eslint-disable-next-line @next/next/no-img-element -- plan D-5: a native img (signed URL, print row); next/image would add a loader to the pdf row */}
    <img src={im.src} alt={im.alt} className={fill ? 'block min-h-0 w-full flex-1 object-cover' : 'block h-auto w-full'} />
    <figcaption className={fill ? 'self-end px-4 py-1 text-xs text-report-soft' : 'text-xs text-gray-600'}>{im.caption}</figcaption>
  </figure>
);

// MF-62 (Spec 126 11a.7 dated note 2026-11-11, FE-35; operator "Mf-62 - yes"): the loading state "What we checked", drawn from the view only.
// Every line sits in ONE role="log" region (WCAG 2.2 SC 4.1.3, ARIA23); the lines are in the DOM from the first paint, so the fade is visual only
// (opacity, globals.css .report-check-line) and nothing is announced per line. On a paced row each line carries the server delay as --d and the skip
// link appears after --skip (revealed by visibility, so it is not focusable while unseen); reduce motion and print show everything at once.
// No title and no section labels (operator 2026-11-11: "it doesnt need a title"). Admin and pdf (not paced) draw every line at once and no skip. No href, no skip: never an inert control. No state, no handler.
const Checked = ({ c }: { c: ViewChecked }): ReactElement => (
  <section data-block="checked" data-paced={c.paced ? 'true' : 'false'} className="space-y-4 rounded bg-report-page p-4 text-report-ink">
    <div role="log" className="grid gap-3">
      {c.groups.map((g) => (
        <div key={g.key} data-group={g.key} className="grid gap-2">
          <ul className="grid gap-1.5 text-sm text-report-muted">
            {g.lines.map((l) => (
              <li key={l.key} data-check={`${g.key}.${l.key}`} className={c.paced ? 'report-check-line' : undefined} style={c.paced ? { ['--d' as string]: `${l.delay_ms}ms` } : undefined}>{l.text}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    {c.dates ? <p data-block="checked-dates" className={c.paced ? 'report-check-line text-xs text-report-soft' : 'text-xs text-report-soft'} style={c.paced ? { ['--d' as string]: `${c.dates.delay_ms}ms` } : undefined}>{c.dates.text}</p> : null}
    {c.paced && c.href ? (
      <a href={c.href} data-block="checked-skip" className="report-check-skip flex min-h-12 items-center justify-center rounded-xl border border-report-button-border bg-report-button px-4 font-semibold text-report-ink" style={{ ['--skip' as string]: `${c.skip.after_ms}ms` }}>{c.skip.text}</a>
    ) : null}
  </section>
);

export function ReportView({ view }: { view: View }): ReactElement {
  const { layout } = view;
  const collapsed = layout.details === 'collapsed';
  const hasDetail = view.detail.length > 0;
  const beside = view.slots.filter((x) => x.placement === 'beside_card');
  const after = view.slots.filter((x) => x.placement === 'after_card');
  return (
    <div
      data-report
      data-target={view.target}
      data-columns={layout.columns}
      data-details={layout.details}
      data-meta={layout.meta}
      data-page-break={layout.page_break}
      data-lifecycle={view.lifecycle ?? ''}
      data-image={view.image_state}
      className="space-y-4"
    >
      {view.reason ? (
        <p data-block="reason" data-status={view.reason.status} className={view.checked ? 'sr-only' : 'text-base'}>
          {view.reason.badge ? <span data-badge className="mr-2 rounded border px-1 text-xs uppercase">{view.reason.badge}</span> : null}
          {view.reason.text}
        </p>
      ) : null}
      {view.checked ? <Checked c={view.checked} /> : null}
      <div data-block="card-row" className="flex flex-col gap-4 md:flex-row">
        <div data-block="card" className="min-w-0 flex-1 space-y-4">
          {view.image ? <Picture im={view.image} /> : null}
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
        {beside.map((x) => <Slot key={x.field} s={x} />)}
      </div>
      {after.map((x) => <Slot key={x.field} s={x} />)}
    </div>
  );
}
