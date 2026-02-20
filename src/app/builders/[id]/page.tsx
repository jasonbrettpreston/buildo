'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';

interface BuilderDetail {
  builder: {
    id: number;
    name: string;
    name_normalized: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    google_place_id: string | null;
    google_rating: number | null;
    google_review_count: number | null;
    obr_business_number: string | null;
    wsib_status: string | null;
    permit_count: number;
    enriched_at: string | null;
  };
  permits: {
    permit_num: string;
    revision_num: string;
    permit_type: string;
    work: string;
    status: string;
    street_num: string;
    street_name: string;
    street_type: string;
    city: string;
    ward: string;
    est_const_cost: number | null;
    issued_date: string | null;
    description: string;
  }[];
  contacts: {
    id: number;
    contact_type: string;
    contact_value: string;
    source: string;
    verified: boolean;
  }[];
}

function wsibBadgeColor(status: string | null): string {
  if (status === 'active') return '#16A34A';
  if (status === 'inactive') return '#DC2626';
  return '#6B7280';
}

function wsibLabel(status: string | null): string {
  if (status === 'active') return 'WSIB Active';
  if (status === 'inactive') return 'WSIB Inactive';
  return 'WSIB Unknown';
}

function formatCost(cost: number | null): string {
  if (cost == null) return 'N/A';
  if (cost >= 1_000_000) return `$${(cost / 1_000_000).toFixed(1)}M`;
  if (cost >= 1_000) return `$${(cost / 1_000).toFixed(0)}K`;
  return `$${cost.toLocaleString()}`;
}

export default function BuilderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<BuilderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/builders/${id}`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading builder details...</div>
      </div>
    );
  }

  if (!data?.builder) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Builder Not Found</h2>
          <a href="/dashboard" className="text-blue-600 hover:underline mt-2 block">
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const b = data.builder;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
            &larr; Back to Dashboard
          </a>
          <h1 className="text-xl font-bold text-gray-900 mt-2">{b.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">{b.permit_count} permits</span>
            <Badge
              label={wsibLabel(b.wsib_status)}
              color={wsibBadgeColor(b.wsib_status)}
              size="sm"
            />
            {b.enriched_at && (
              <span className="text-xs text-gray-400">
                Enriched {new Date(b.enriched_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Contact Information */}
        <Section title="Contact Information">
          {!b.phone && !b.email && !b.website && data.contacts.length === 0 ? (
            <p className="text-sm text-gray-500">
              Contact info unavailable. {!b.enriched_at && 'Enrichment pending.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {b.phone && (
                <ContactField
                  label="Phone"
                  value={b.phone}
                  href={`tel:${b.phone}`}
                  source="Google Places"
                />
              )}
              {b.email && (
                <ContactField
                  label="Email"
                  value={b.email}
                  href={`mailto:${b.email}`}
                  source="Google Places"
                />
              )}
              {b.website && (
                <ContactField
                  label="Website"
                  value={b.website.replace(/^https?:\/\//, '')}
                  href={b.website.startsWith('http') ? b.website : `https://${b.website}`}
                  source="Google Places"
                />
              )}
              {data.contacts.map((c) => (
                <ContactField
                  key={c.id}
                  label={c.contact_type}
                  value={c.contact_value}
                  source={c.source}
                  verified={c.verified}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Google Rating */}
        {b.google_rating != null && (
          <Section title="Google Reviews">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-gray-900">{b.google_rating}</span>
              <div>
                <div className="text-yellow-400 text-lg">
                  {'★'.repeat(Math.round(b.google_rating))}
                  {'☆'.repeat(5 - Math.round(b.google_rating))}
                </div>
                {b.google_review_count != null && (
                  <p className="text-sm text-gray-500">
                    {b.google_review_count} reviews
                  </p>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* Business Information */}
        {b.obr_business_number && (
          <Section title="Business Registry">
            <div className="grid grid-cols-2 gap-4">
              <Field label="OBR Business Number" value={b.obr_business_number} />
              <Field label="Normalized Name" value={b.name_normalized} />
            </div>
          </Section>
        )}

        {/* Permits by this Builder */}
        <Section title={`Permits (${data.permits.length})`}>
          {data.permits.length === 0 ? (
            <p className="text-sm text-gray-500">No permits found</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.permits.map((p) => (
                <a
                  key={`${p.permit_num}--${p.revision_num}`}
                  href={`/permits/${p.permit_num}--${p.revision_num}`}
                  className="block py-3 hover:bg-gray-50 -mx-2 px-2 rounded"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {[p.street_num, p.street_name, p.street_type].filter(Boolean).join(' ')}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500 font-mono">{p.permit_num}</span>
                        <span className="text-xs text-gray-400">{p.status}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-sm font-medium text-gray-900">{formatCost(p.est_const_cost)}</p>
                      {p.issued_date && (
                        <p className="text-xs text-gray-400">
                          {new Date(p.issued_date).toLocaleDateString('en-CA')}
                        </p>
                      )}
                    </div>
                  </div>
                  {p.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{p.description}</p>
                  )}
                </a>
              ))}
            </div>
          )}
        </Section>
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

function ContactField({
  label,
  value,
  href,
  source,
  verified,
}: {
  label: string;
  value: string;
  href?: string;
  source?: string;
  verified?: boolean;
}) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      {href ? (
        <a
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="text-sm text-blue-600 hover:underline mt-0.5 block truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      ) : (
        <p className="text-sm text-gray-900 mt-0.5">{value}</p>
      )}
      <div className="flex items-center gap-1 mt-1">
        {source && (
          <span className="text-xs text-gray-400">via {source}</span>
        )}
        {verified && (
          <span className="text-xs text-green-600 font-medium">Verified</span>
        )}
      </div>
    </div>
  );
}
