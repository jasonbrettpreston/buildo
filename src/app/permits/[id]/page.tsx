'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { ScoreBadge } from '@/components/ui/ScoreBadge';
import PropertyPhoto from '@/components/permits/PropertyPhoto';
import NeighbourhoodProfile from '@/components/permits/NeighbourhoodProfile';

interface ParcelInfo {
  lot_size_sqft: number | null;
  lot_size_sqm: number | null;
  frontage_ft: number | null;
  frontage_m: number | null;
  depth_ft: number | null;
  depth_m: number | null;
  feature_type: string | null;
  link_confidence: number | null;
}

interface PermitDetail {
  permit: Record<string, unknown>;
  trades: {
    trade_slug: string;
    trade_name: string;
    icon: string;
    color: string;
    lead_score: number;
    confidence: number;
    phase: string;
    tier: number;
  }[];
  history: {
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    changed_at: string;
  }[];
  builder: Record<string, unknown> | null;
  parcel: ParcelInfo | null;
  neighbourhood: Record<string, unknown> | null;
}

export default function PermitDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<PermitDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/permits/${id}`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading permit details...</div>
      </div>
    );
  }

  if (!data?.permit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Permit Not Found</h2>
          <a href="/dashboard" className="text-blue-600 hover:underline mt-2 block">
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const p = data.permit as Record<string, string | number | null>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
            &larr; Back to Dashboard
          </a>
          <h1 className="text-xl font-bold text-gray-900 mt-2">
            {[p.street_num, p.street_name, p.street_type, p.city].filter(Boolean).join(' ')}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500 font-mono">{p.permit_num as string}</span>
            <Badge label={p.status as string} color="#2563EB" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Property Photo */}
        <PropertyPhoto
          lat={p.latitude as number | null}
          lng={p.longitude as number | null}
          address={[p.street_num, p.street_name, p.street_type].filter(Boolean).join(' ')}
        />

        {/* Trade Matches */}
        {data.trades.length > 0 && (
          <Section title="Trade Classification">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.trades.map((t) => (
                <div
                  key={t.trade_slug}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200"
                >
                  <ScoreBadge score={t.lead_score} size="sm" />
                  <div>
                    <p className="font-medium text-sm" style={{ color: t.color }}>
                      {t.trade_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Tier {t.tier} &middot; {Math.round(t.confidence * 100)}% confidence &middot; {t.phase}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Builder - always visible */}
        <Section title="Builder">
          {data.builder ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</p>
                <a
                  href={`/builders/${data.builder.id}`}
                  className="text-sm text-blue-600 hover:underline mt-0.5 block font-medium"
                >
                  {p.builder_name as string || data.builder.name as string}
                </a>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</p>
                {data.builder.phone ? (
                  <a href={`tel:${data.builder.phone}`} className="text-sm text-blue-600 hover:underline mt-0.5 block">
                    {data.builder.phone as string}
                  </a>
                ) : (
                  <p className="text-sm text-gray-400 mt-0.5 italic">Enrichment pending</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
                {data.builder.email ? (
                  <a href={`mailto:${data.builder.email}`} className="text-sm text-blue-600 hover:underline mt-0.5 block">
                    {data.builder.email as string}
                  </a>
                ) : (
                  <p className="text-sm text-gray-400 mt-0.5 italic">Enrichment pending</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Website</p>
                {data.builder.website ? (
                  <a
                    href={(data.builder.website as string).startsWith('http') ? data.builder.website as string : `https://${data.builder.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline mt-0.5 block"
                  >
                    {(data.builder.website as string).replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  <p className="text-sm text-gray-400 mt-0.5 italic">Enrichment pending</p>
                )}
              </div>
              {data.builder.google_rating != null && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Google Rating</p>
                  <p className="text-sm text-gray-900 mt-0.5">
                    <span className="text-yellow-400">{'★'.repeat(Math.round(Number(data.builder.google_rating)))}</span>{' '}
                    {String(data.builder.google_rating)}/5 ({String(data.builder.google_review_count)} reviews)
                  </p>
                </div>
              )}
              {data.builder.wsib_status != null && (
                <Field
                  label="WSIB Status"
                  value={String(data.builder.wsib_status) === 'active' ? 'Active' : String(data.builder.wsib_status) === 'inactive' ? 'Inactive' : 'Unknown'}
                />
              )}
              <Field label="Total Permits" value={String(data.builder.permit_count)} />
            </div>
          ) : p.builder_name ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Name" value={p.builder_name as string} />
              <div className="col-span-2">
                <p className="text-sm text-gray-400 italic">
                  Builder not yet in database. Contact info unavailable.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              No builder listed for this permit.
            </p>
          )}
          {data.builder && (
            <a
              href={`/builders/${data.builder.id}`}
              className="inline-block mt-4 text-sm text-blue-600 hover:underline"
            >
              View full builder profile &rarr;
            </a>
          )}
        </Section>

        {/* Property Details (from parcel data) - always visible */}
        <Section title="Property Details">
          {data.parcel ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field
                label="Lot Size"
                value={data.parcel.lot_size_sqft ? `${Number(data.parcel.lot_size_sqft).toLocaleString()} sq ft` : 'N/A'}
              />
              <Field
                label="Frontage"
                value={data.parcel.frontage_ft ? `${Number(data.parcel.frontage_ft).toFixed(1)} ft` : 'N/A'}
              />
              <Field
                label="Depth"
                value={data.parcel.depth_ft ? `${Number(data.parcel.depth_ft).toFixed(1)} ft` : 'N/A'}
              />
              <Field
                label="Lot Size (metric)"
                value={data.parcel.lot_size_sqm ? `${Number(data.parcel.lot_size_sqm).toLocaleString()} sq m` : 'N/A'}
              />
              <Field
                label="Parcel Type"
                value={data.parcel.feature_type || 'N/A'}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              Property data not yet linked to this permit.
            </p>
          )}
        </Section>

        {/* Neighbourhood Profile - always visible */}
        <NeighbourhoodProfile neighbourhood={data.neighbourhood as {
          name: string;
          neighbourhood_id: number;
          avg_household_income: number | null;
          median_household_income: number | null;
          avg_individual_income: number | null;
          low_income_pct: number | null;
          tenure_owner_pct: number | null;
          tenure_renter_pct: number | null;
          period_of_construction: string | null;
          couples_pct: number | null;
          lone_parent_pct: number | null;
          married_pct: number | null;
          university_degree_pct: number | null;
          immigrant_pct: number | null;
          visible_minority_pct: number | null;
          english_knowledge_pct: number | null;
          top_mother_tongue: string | null;
          census_year: number;
        } | null} />

        {/* Project Details */}
        <Section title="Project Details">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Permit Type" value={p.permit_type as string} />
            <Field label="Work" value={p.work as string} />
            <Field label="Structure Type" value={p.structure_type as string} />
            <Field label="Building Type" value={p.building_type as string} />
            <Field label="Storeys" value={p.storeys as string} />
            <Field label="Est. Cost" value={p.est_const_cost != null ? `$${Number(p.est_const_cost).toLocaleString()}` : 'N/A'} />
            <Field label="Current Use" value={p.current_use as string} />
            <Field label="Proposed Use" value={p.proposed_use as string} />
            <Field label="Ward" value={p.ward as string} />
          </div>
        </Section>

        {/* Description */}
        {p.description && (
          <Section title="Description">
            <p className="text-sm text-gray-700">{String(p.description)}</p>
          </Section>
        )}

        {/* Timeline */}
        <Section title="Timeline">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Application Date" value={formatDate(p.application_date as string)} />
            <Field label="Issued Date" value={formatDate(p.issued_date as string)} />
            <Field label="Completed Date" value={formatDate(p.completed_date as string)} />
            <Field label="First Seen" value={formatDate(p.first_seen_at as string)} />
          </div>
        </Section>

        {/* Change History */}
        {data.history.length > 0 && (
          <Section title="Change History">
            <div className="space-y-2">
              {data.history.map((h, i) => (
                <div key={i} className="flex items-start gap-3 text-sm py-2 border-b border-gray-100 last:border-0">
                  <span className="text-xs text-gray-400 w-24 shrink-0">
                    {new Date(h.changed_at).toLocaleDateString()}
                  </span>
                  <span className="font-medium text-gray-700 w-32 shrink-0">
                    {h.field_name}
                  </span>
                  <span className="text-red-500 line-through">{h.old_value || 'null'}</span>
                  <span className="text-gray-400">&rarr;</span>
                  <span className="text-green-600">{h.new_value || 'null'}</span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value || 'N/A'}</p>
    </div>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-CA');
  } catch {
    return 'N/A';
  }
}
