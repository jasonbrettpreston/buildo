// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-09, MF-14), 5.3 (RSC; the server projects),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24; operator T-3 (separate admin-only page, labelled synthetic goldens).
//
// MF-14 · lane E-MF14. Admin report-renderer preview. A server component: it runs viewOf over the committed synthetic golden trees and renders the one
// ReportView. No state, no client bundle. Admin-only via route-guard.ts (/admin/* blanket), as the other admin pages. Not stored lot data.
// MF-57: `?view=page&target=<t>` renders the approved v21 report PAGE (pageViewOf over the synthetic page golden) full-bleed on the report page
// colour, with the synthetic banner and the target picker above it; the existing states are unchanged.
import { ReportView } from '@/components/report/ReportView';
import { ReportPage } from '@/components/report/ReportPage';
import { pageViewOf, viewOf, type PageView, type ReportView as View } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';
import { GOLDENS, PAGE_GOLDENS, STATES } from './goldens';

export const dynamic = 'force-dynamic';

const TARGETS = Object.keys((reportCtx.layout as { targets: object }).targets);
const SCENARIOS = Object.keys(reportCtx.lists);
type Q = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
// MF-38 (plan fold RG-8): the goldens carry asset ids only, never a URL, so the preview gives every image item one synthetic same-origin placeholder
// (an inline SVG data URL, under the synthetic banner). It is never a real asset and never stored.
const PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#3f3f46"/></svg>')}`;
type Tree = { nodes: Array<{ kind?: string; images?: Array<{ asset_id: string }> }> };
const syntheticUrls = (tree: Tree): Record<string, string> => Object.fromEntries((tree.nodes.find((n) => n.kind === 'image')?.images ?? []).map((i) => [i.asset_id, PLACEHOLDER]));
const pick = (v: string | undefined, allowed: string[], fallback: string): string => (v !== undefined && allowed.includes(v) ? v : fallback);

export default async function ReportPreviewPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const state = pick(one(q.state), STATES, STATES[0] as string);
  const target = pick(one(q.target), TARGETS, 'web');
  const scenarioQ = one(q.scenario);
  const scenario = scenarioQ !== undefined && SCENARIOS.includes(scenarioQ) ? scenarioQ : null;
  if (one(q.view) === 'page') {
    const pg = PAGE_GOLDENS[target] as { response_fixture: { synthetic?: boolean }; rendered_tree: object };
    const pv = pageViewOf(pg.rendered_tree, { target }, reportCtx) as PageView;
    const link = (t: string): string => `/admin/report-preview?view=page&target=${t}`;
    return (
      <section aria-label="Report page preview (v21)" className="min-h-screen bg-report-page">
        <div className="mx-auto max-w-[430px] space-y-2 px-4 pt-4 text-sm text-report-muted">
          {pg.response_fixture.synthetic ? <p data-synthetic className="rounded border border-report-amber p-2">Synthetic golden fixture. Not this lot.</p> : null}
          <nav aria-label="Target" className="flex flex-wrap gap-2">{TARGETS.map((t) => <a key={t} href={link(t)} aria-current={t === target ? 'true' : undefined} className={t === target ? 'font-semibold underline' : ''}>{t}</a>)}<a href="/admin/report-preview">states</a></nav>
        </div>
        <ReportPage view={pv} />
      </section>
    );
  }
  const golden = GOLDENS[state] as { response_fixture: { synthetic?: boolean }; rendered_tree: object };
  const view = viewOf(golden.rendered_tree, { scenario, target, urls: syntheticUrls(golden.rendered_tree as Tree) }, reportCtx) as View;
  const href = (patch: Record<string, string | null>): string => {
    const p = new URLSearchParams();
    const next = { state, target, scenario, ...patch } as Record<string, string | null>;
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return `/admin/report-preview?${p.toString()}`;
  };
  const Picker = ({ label, name, items, current }: { label: string; name: string; items: string[]; current: string | null }) => (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{label}</span>
      {items.map((i) => (
        <a key={i} href={href({ [name]: i })} aria-current={i === current ? 'true' : undefined} className={i === current ? 'underline font-semibold' : 'text-blue-700'}>{i}</a>
      ))}
      {name === 'scenario' ? <a href={href({ scenario: null })} aria-current={current === null ? 'true' : undefined} className={current === null ? 'underline font-semibold' : 'text-blue-700'}>none</a> : null}
    </nav>
  );
  return (
    <section aria-label="Report renderer preview" className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <h1 className="text-lg font-semibold">Report renderer preview</h1>
      {golden.response_fixture.synthetic ? <p data-synthetic className="rounded border border-amber-400 bg-amber-50 p-2 text-sm">Synthetic golden fixture. Not this lot.</p> : null}
      <Picker label="State" name="state" items={STATES} current={state} />
      <Picker label="Target" name="target" items={TARGETS} current={target} />
      <Picker label="Scenario" name="scenario" items={SCENARIOS} current={scenario} />
      <ReportView view={view} />
    </section>
  );
}
