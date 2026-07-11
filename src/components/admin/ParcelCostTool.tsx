// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §2 (Behavioral Contract)
//
// Parcel Cost Model Tool — the admin prototype of the future consumer parcel screen. Search any
// Toronto address → the parcel with ALL pipeline-derived fields in the NORMATIVE 3-tier order:
//   ① proprietary cost menu + area headlines (always expanded, top)
//   ② the neighbourhood: summary headline + specific projects in front of the CoA + comparables
//   ③ everything else — 9 collapsed groups via GenericFieldRenderer
// READ-ONLY: renders existing values; computes nothing. Absent menu line ≠ fits:false (§2.3).
// Desktop-first admin layout (Spec 33 override of the mobile-first default).

'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useParcelLookup, ParcelLookupError } from '@/features/admin-flight-center/api/useParcelLookup';
import { GenericFieldRenderer } from '@/components/admin/GenericFieldRenderer';
import { captureEvent } from '@/lib/observability/capture';
import {
  GROUP_KEYS,
  type CostLine,
  type GroupKey,
  type ParcelLookupResponse,
} from '@/app/api/admin/parcels/lookup/types';

// ── Search form ───────────────────────────────────────────────────────────────
// Pending/applied useState pattern — mirrors StepOutputInspector (the newest admin-form precedent).
// NB: react-hook-form is NOT in the dependency tree and no admin component uses it; the domain
// doc's RHF mandate can't be met without a new dependency (recorded as a DEFER for review).
// Zod still validates the submitted value (same schema family as the API's request schema).
const SearchSchema = z.object({ q: z.string().trim().min(3, 'enter at least 3 characters') });

// Presentation labels (fallback = prettified raw key — presentation only, never filtered).
const LINE_LABELS: Record<string, string> = {
  full_build: 'Max build (as-of-right)',
  coa_build: 'Max build (with CoA)',
  solar_max: 'Solar (max build)',
  solar_coa: 'Solar (CoA build)',
  garden_suite: 'Garden suite',
  laneway_suite: 'Laneway suite',
  kitchen: 'Kitchen',
  bath: 'Bathroom',
  garage: 'Garage',
  basement_underpin: 'Basement (underpin)',
  basement_reno: 'Basement (reno)',
  gut: 'Gut renovation',
  addition_storey: 'Addition + storey',
};
const GROUP_LABELS: Record<GroupKey, string> = {
  identity: 'Identity & location',
  lot_address: 'Lot & address',
  zoning: 'Zoning & by-law (Spec 58)',
  heritage_ravine_centreline: 'Heritage · Ravine · Streets',
  existing_structure: 'Existing structure',
  max_build: 'Max-build envelope',
  scenarios: 'Renovation scenario areas',
  accessory: 'Garage & suites',
  optimal_config: 'Optimal configuration',
};

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Math.round(n).toLocaleString()}`;
const sqm = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} m²`;

function prettify(key: string): string {
  return key.replaceAll('_', ' ');
}

// ── Tier 1: one cost-menu line ────────────────────────────────────────────────
// line === null ⇒ the line is ABSENT from the menu = "not computable" (Spec 88 §2.4 / Spec 89 §2.3)
// — rendered as an explicit n/a row, DISTINCT from a computed line with fits:false (amber badge).
function CostLineRow({ id, line }: { id: string; line: CostLine | null }) {
  if (line === null) {
    return (
      <tr className="border-b border-gray-100 text-gray-400 last:border-0">
        <td className="py-2 pr-3 font-medium">{LINE_LABELS[id] ?? prettify(id)}</td>
        <td className="py-2 pr-3 text-right" colSpan={4}>
          n/a — not computable for this parcel
        </td>
        <td className="py-2" />
      </tr>
    );
  }
  const fits = line.fits;
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 pr-3 font-medium text-gray-800">{LINE_LABELS[id] ?? prettify(id)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{money(line.total)}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-gray-500">
        {line.per_sqm != null ? `$${Math.round(line.per_sqm).toLocaleString()}/m²` : '—'}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{sqm(line.area)}</td>
      <td className="py-2 pr-3 text-gray-500">{line.area_confidence ?? '—'}</td>
      <td className="py-2">
        {fits === false ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">doesn’t fit</span>
        ) : fits === true ? (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">fits</span>
        ) : fits === undefined ? (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">?</span>
        ) : null}
      </td>
    </tr>
  );
}

/** Fixed, spec-ordered line list: the 13 known lines first, then any unknown menu keys verbatim. */
function menuRows(menu: Record<string, unknown>): Array<{ id: string; line: CostLine | null }> {
  const known = Object.keys(LINE_LABELS).map((id) => {
    const v = menu[id];
    return { id, line: typeof v === 'object' && v !== null ? (v as CostLine) : null };
  });
  const extras = Object.entries(menu)
    .filter(([k, v]) => k !== '_schema_version' && !(k in LINE_LABELS) && typeof v === 'object' && v !== null)
    .map(([k, v]) => ({ id: k, line: v as CostLine }));
  return [...known, ...extras];
}

// ── The tool ──────────────────────────────────────────────────────────────────
export function ParcelCostTool() {
  const [pendingQ, setPendingQ] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedQ, setSubmittedQ] = useState<string | null>(null);
  const [parcelId, setParcelId] = useState<string | null>(null);

  const lookup = useParcelLookup({ q: submittedQ, parcelId });
  const data: ParcelLookupResponse | undefined = lookup.data;

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = SearchSchema.safeParse({ q: pendingQ });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'invalid address');
      return;
    }
    setFormError(null);
    captureEvent('admin_parcel_lookup_searched', { length: parsed.data.q.length });
    setParcelId(null);
    setSubmittedQ(parsed.data.q);
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Parcel Cost Model Tool</h1>
      <p className="mt-1 text-sm text-gray-500">
        Search any Toronto address — read-only view of every pipeline-derived field for the parcel.
      </p>

      {/* Search bar */}
      <form onSubmit={onSearch} className="mt-4 flex flex-col gap-2 md:flex-row md:items-start">
        <div className="flex-1">
          <input
            type="text"
            placeholder="e.g. 26 Hurlingham Cres"
            aria-label="Address"
            value={pendingQ}
            onChange={(e) => {
              setPendingQ(e.target.value);
              if (formError) setFormError(null); // clear stale validation as the user corrects
            }}
            aria-describedby={formError ? 'parcel-search-error' : undefined}
            className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {formError && (
            <p id="parcel-search-error" className="mt-1 text-xs text-red-600">{formError}</p>
          )}
        </div>
        <button
          type="submit"
          className="h-11 rounded-md bg-blue-600 px-6 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Search
        </button>
      </form>

      {/* Idle */}
      {!submittedQ && !parcelId && (
        <div className="mt-10 text-center text-sm text-gray-400">Enter an address to look up a parcel.</div>
      )}

      {/* Loading */}
      {lookup.isLoading && (submittedQ || parcelId) && (
        <div className="mt-8 animate-pulse space-y-3" role="status" aria-label="Loading">
          <div className="h-6 w-1/3 rounded bg-gray-200" />
          <div className="h-40 rounded bg-gray-100" />
          <div className="h-24 rounded bg-gray-100" />
        </div>
      )}

      {/* Error */}
      {lookup.isError && (
        <div className="mt-8 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p className="font-medium">Lookup failed</p>
          <p className="mt-1">
            {lookup.error instanceof ParcelLookupError
              ? (lookup.error.serverMessage ?? lookup.error.message)
              : 'Unexpected error — try again.'}
          </p>
        </div>
      )}

      {/* Miss */}
      {!lookup.isLoading && data && !data.match && data.candidates.length === 0 && (
        <div className="mt-8 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          No parcel found for that address.
        </div>
      )}

      {/* Candidates (ambiguous) — click through by parcelId, never by re-parsed text */}
      {!lookup.isLoading && data && !data.match && data.candidates.length > 0 && (
        <div className="mt-8">
          <p className="text-sm font-medium text-gray-700">Did you mean:</p>
          <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {data.candidates.map((c) => (
              <li key={c.parcelId}>
                <button
                  type="button"
                  onClick={() => setParcelId(c.parcelId)}
                  className="min-h-[44px] w-full px-4 py-2 text-left text-sm text-blue-700 hover:bg-blue-50"
                >
                  {c.address} <span className="text-xs text-gray-400">({c.parcelId})</span>
                </button>
              </li>
            ))}
          </ul>
          {data.warnings.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">{data.warnings.join(' · ')}</p>
          )}
        </div>
      )}

      {/* Parcel view — the NORMATIVE 3-tier order */}
      {!lookup.isLoading && data?.match && data.parcel && (
        <div className="mt-8 space-y-8">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{data.match.address || data.match.parcelId}</h2>
            <p className="text-xs text-gray-400">
              parcel {data.match.parcelId} · match: {data.match.matchType}
            </p>
          </div>

          {data.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Data partially unavailable: {data.warnings.join(' · ')}
            </div>
          )}

          {/* ① PRIMARY — the proprietary cost menu + areas */}
          <section aria-label="Renovation cost menu">
            <h3 className="text-lg font-semibold text-gray-900">Renovation cost menu</h3>
            {data.parcel.costMenu.menu ? (
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-3">Line</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Rate</th>
                    <th className="py-2 pr-3 text-right">Area</th>
                    <th className="py-2 pr-3">Confidence</th>
                    <th className="py-2">Fit</th>
                  </tr>
                </thead>
                <tbody>
                  {menuRows(data.parcel.costMenu.menu).map(({ id, line }) => (
                    <CostLineRow key={id} id={id} line={line} />
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-gray-500">
                Cost menu not yet computed for this parcel (absent = not computable — distinct from “doesn’t fit”).
              </p>
            )}
            {/* The 12 headline cost scalars — rendered ALWAYS (even when the per-line menu is null). */}
            {data.parcel.costMenu.scalars ? (
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
                {Object.entries(data.parcel.costMenu.scalars).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-gray-50 py-1">
                    <span className="text-gray-500">{prettify(k.replace(/^cost_/, ''))}</span>
                    <span className="tabular-nums text-gray-800">
                      {v == null ? '—' : k.endsWith('_per_sqm') ? `$${Math.round(v).toLocaleString()}/m²` : money(v)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Cost scalars unavailable.</p>
            )}
            <h4 className="mt-4 text-sm font-semibold text-gray-700">Areas</h4>
            <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
              {data.parcel.areas && Object.entries(data.parcel.areas).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-gray-50 py-1">
                  <span className="text-gray-500">{prettify(k)}</span>
                  <span className="tabular-nums text-gray-800">
                    {v == null ? '—' : typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ② SECONDARY-A — the neighbourhood */}
          <section aria-label="Neighbourhood activity">
            <h3 className="text-lg font-semibold text-gray-900">What’s happening in the neighbourhood</h3>
            {data.parcel.neighbourhood.summary ? (
              <p className="mt-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
                {String(data.parcel.neighbourhood.summary.headline)}
                <span className="ml-2 text-xs text-blue-500">({String(data.parcel.neighbourhood.summary.basis)})</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No neighbourhood summary available.</p>
            )}

            <h4 className="mt-4 text-sm font-semibold text-gray-700">Projects in front of the CoA</h4>
            {(data.parcel.neighbourhood.coaProjects?.length ?? 0) > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="py-2 pr-3">Application</th>
                      <th className="py-2 pr-3">Address</th>
                      <th className="py-2 pr-3">Status / decision</th>
                      <th className="py-2 pr-3">Hearing</th>
                      <th className="py-2 pr-3 text-right">GFA</th>
                      <th className="py-2 text-right">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.parcel.neighbourhood.coaProjects ?? []).map((p, i) => (
                      <tr key={`${p.applicationNumber ?? i}`} className="border-b border-gray-100 align-top last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">{p.applicationNumber ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {p.address ?? '—'}
                          {p.description && (
                            <span className="mt-0.5 block max-w-xs text-xs text-gray-500">{p.description}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{p.decision ?? p.status ?? '—'}</td>
                        <td className="py-2 pr-3">{p.hearingDate ? p.hearingDate.slice(0, 10) : '—'}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{sqm(p.modeledGfaSqm)}</td>
                        <td className="py-2 text-right tabular-nums">{money(p.estimatedCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No CoA applications on record for this neighbourhood.</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
              <div className="flex justify-between gap-2 py-1">
                <span className="text-gray-500">comparable builds</span>
                <span className="tabular-nums">{data.parcel.neighbourhood.compStats.compCount ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2 py-1">
                <span className="text-gray-500">dominant build type</span>
                <span>{data.parcel.neighbourhood.compStats.compDominantBuild ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2 py-1">
                <span className="text-gray-500">comp FSI p50</span>
                <span className="tabular-nums">{data.parcel.neighbourhood.compStats.compFsiP50 ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2 py-1">
                <span className="text-gray-500">comp build ratio p50</span>
                <span className="tabular-nums">{data.parcel.neighbourhood.compStats.compBuildRatioP50 ?? '—'}</span>
              </div>
            </div>

            {data.parcel.neighbourhood.comparableBuilds && data.parcel.neighbourhood.comparableBuilds.length > 0 && (
              <details className="mt-3 rounded-md border border-gray-200 bg-white">
                <summary className="min-h-[44px] cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Comparable builds ({data.parcel.neighbourhood.comparableBuilds.length})
                </summary>
                <div className="px-4 pb-4">
                  <GenericFieldRenderer value={data.parcel.neighbourhood.comparableBuilds} />
                </div>
              </details>
            )}
          </section>

          {/* ③ SECONDARY-B — everything else, collapsed */}
          <section aria-label="All parcel fields">
            <h3 className="text-lg font-semibold text-gray-900">All fields</h3>
            <div className="mt-2 space-y-2">
              {GROUP_KEYS.map((g) => (
                <details
                  key={g}
                  className="rounded-md border border-gray-200 bg-white"
                  onToggle={(e) => {
                    if ((e.target as HTMLDetailsElement).open) {
                      captureEvent('admin_parcel_group_expanded', { group: g });
                    }
                  }}
                >
                  <summary className="min-h-[44px] cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    {GROUP_LABELS[g]}{' '}
                    <span className="text-xs text-gray-400">
                      ({Object.keys(data.parcel!.groups[g] ?? {}).length} fields)
                    </span>
                  </summary>
                  <dl className="grid grid-cols-1 gap-x-8 gap-y-1 px-4 pb-4 text-sm md:grid-cols-2">
                    {Object.entries(data.parcel!.groups[g] ?? {}).map(([field, value]) => (
                      <div key={field} className="flex items-start justify-between gap-3 border-b border-gray-50 py-1.5">
                        <dt className="shrink-0 font-mono text-xs text-gray-500">{field}</dt>
                        <dd className="min-w-0 text-right text-gray-800">
                          <GenericFieldRenderer value={value} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
