// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.10 (ad slots), 11a.7 (dated note 2026-11-09, MF-14: the preview page pattern),
//            §6.3 row 6 (dated notes 2026-11-10: trim 3, the saved draft on its own page through the real renderer),
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 8 (an admin RSC page that reads rows gates itself first).
//
// MF-40 · the saved-offer preview (outside the converted mounts, on the MF-14 report-preview pattern; a mount may not import ReportView, FE-31 C-2).
// A server component: it reads the saved offers, renders the chosen one through src/lib/placements/preview.ts (the landed buildTree, viewOf and
// ReportView over the synthetic ad_slot_present golden), with a toggle to the not_permitted base. Read-only; never saves. Labelled synthetic.
import { ReportView } from '@/components/report/ReportView';
import { ReportRenderError } from '@/lib/surfaces/report/core';
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { listPlacements } from '@/lib/placements/list';
import { PREVIEW_BASES, previewView, type PreviewBase } from '@/lib/placements/preview';

export const dynamic = 'force-dynamic';

type Q = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function PlacementsPreviewPage({ searchParams }: { searchParams: Promise<Q> }) {
  await requireAdminPage();
  const q = await searchParams;
  const { offers } = await listPlacements();
  const chosen = offers.find((o) => o.offer_id === one(q.offer)) ?? offers[0];
  const baseQ = one(q.base);
  const base: PreviewBase = PREVIEW_BASES.includes(baseQ as PreviewBase) ? (baseQ as PreviewBase) : 'permitted';
  const href = (offer: string, b: PreviewBase) => `/admin/placements-preview?${new URLSearchParams({ offer, base: b }).toString()}`;
  let body;
  if (!chosen) body = <p>No saved offers yet. Save one on the placements page first.</p>;
  else if (chosen.resolvable !== 'true') body = <p>This offer targets nothing the report shows, so it cannot be previewed.</p>;
  else {
    try {
      body = <ReportView view={previewView(chosen, base)} />;
    } catch (e) {
      if (!(e instanceof ReportRenderError)) throw e;
      body = <p role="alert">The renderer refused this preview: {e.message}</p>;
    }
  }
  return (
    <section aria-label="Saved offer preview" className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <h1 className="text-lg font-semibold">Saved offer preview</h1>
      <p data-synthetic className="rounded border border-amber-400 bg-amber-50 p-2 text-sm">Synthetic report fixture with this saved offer. Not a lot, and offers are not served into reports yet.</p>
      <nav aria-label="Offer" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Offer</span>
        {offers.map((o) => (
          <a key={o.offer_id} href={href(o.offer_id, base)} aria-current={o.offer_id === chosen?.offer_id ? 'true' : undefined} className={o.offer_id === chosen?.offer_id ? 'underline font-semibold' : 'text-blue-700'}>
            {o.advertiser_name}: {o.placement_key}
          </a>
        ))}
      </nav>
      {chosen ? (
        <nav aria-label="Base" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Base</span>
          {PREVIEW_BASES.map((b) => (
            <a key={b} href={href(chosen.offer_id, b)} aria-current={b === base ? 'true' : undefined} className={b === base ? 'underline font-semibold' : 'text-blue-700'}>{b}</a>
          ))}
        </nav>
      ) : null}
      {body}
    </section>
  );
}
