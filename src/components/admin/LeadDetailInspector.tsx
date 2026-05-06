// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5
//             docs/specs/03-mobile/91_mobile_lead_feed.md §4.3.1
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3 + §13
//
// Lead Detail Inspector — paste a lead_id, see the full LeadDetail
// payload from /api/leads/detail/:id. Spec 91 §4.3.1 has 18 fields
// (cost / neighbourhood / target_window / opportunity_score /
// competition_count / applicant / work_description / is_saved); the
// structured render covers them all. JSON tree under a <details>
// disclosure for raw inspection.
//
// Three-state UI per Spec 76 §3.5: idle / loading / result-or-error.
// Schema drift surfaces as a parse_error UI state with the issue
// list rendered side-by-side (NOT ErrorBoundary escalation).

'use client';

import React, { useState } from 'react';
import {
  useLeadDetail,
  LeadDetailError,
} from '@/features/admin-flight-center/api/useLeadDetail';
import { ZodError } from 'zod';
import type { LeadDetail } from '@/lib/admin/lead-schemas';

interface Props {
  /** Optional pre-filled id (URL deep-link from Test Feed Tool). */
  initialId?: string | null;
}

export function LeadDetailInspector({ initialId = null }: Props) {
  const [pendingId, setPendingId] = useState(initialId ?? '');
  const [activeId, setActiveId] = useState<string | null>(initialId);

  const { data, isLoading, isError, error } = useLeadDetail(activeId);

  return (
    <div data-testid="lead-detail-inspector" className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = pendingId.trim();
          setActiveId(trimmed.length > 0 ? trimmed : null);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={pendingId}
          onChange={(e) => setPendingId(e.target.value)}
          placeholder="permit-num--revision (e.g. 20-101234--00) or COA-app-number"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          aria-label="Lead ID"
          data-testid="lead-detail-inspector-input"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          data-testid="lead-detail-inspector-submit"
        >
          Inspect
        </button>
      </form>

      {!activeId && (
        <p data-testid="lead-detail-inspector-idle" className="text-sm text-gray-500">
          Paste a lead id and press <strong>Inspect</strong>. Note: the endpoint
          is scoped to permits the admin has saved (Spec 91 §4.3.1).
        </p>
      )}

      {activeId && isLoading && (
        <p data-testid="lead-detail-inspector-loading" className="text-sm text-gray-500">
          Loading…
        </p>
      )}

      {activeId && isError && error instanceof LeadDetailError && (
        <ErrorPanel
          code={error.code}
          status={error.status}
          serverMessage={error.serverMessage}
        />
      )}

      {activeId && isError && error instanceof ZodError && (
        <ParseErrorPanel error={error} />
      )}

      {activeId && data && (
        <div data-testid="lead-detail-inspector-result" className="space-y-4">
          <StructuredLeadDetail data={data} />
          <details className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <summary className="cursor-pointer text-xs font-medium text-gray-600">
              Raw JSON
            </summary>
            <pre className="mt-2 overflow-x-auto text-xs text-gray-800">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function StructuredLeadDetail({ data }: { data: LeadDetail }) {
  return (
    <div className="space-y-4">
      <Section title="Identity">
        <Field label="lead_id" value={data.lead_id} />
        <Field label="lead_type" value={data.lead_type} />
        <Field label="permit_num" value={data.permit_num ?? '—'} />
        <Field label="revision_num" value={data.revision_num ?? '—'} />
        <Field label="address" value={data.address} />
        <Field
          label="location"
          value={
            data.location
              ? `${data.location.lat.toFixed(4)}, ${data.location.lng.toFixed(4)}`
              : '—'
          }
        />
      </Section>

      <Section title="Lifecycle">
        <Field label="lifecycle_phase" value={data.lifecycle_phase ?? '—'} />
        <Field label="lifecycle_stalled" value={String(data.lifecycle_stalled)} />
        <Field label="updated_at" value={data.updated_at} />
        <Field label="is_saved" value={String(data.is_saved)} />
      </Section>

      <Section title="Timing & Scoring">
        <Field label="target_window" value={data.target_window ?? '—'} />
        <Field
          label="opportunity_score"
          value={data.opportunity_score?.toFixed(3) ?? '—'}
        />
        <Field label="competition_count" value={String(data.competition_count)} />
        <Field label="predicted_start" value={data.predicted_start ?? '—'} />
        <Field label="p25_days" value={data.p25_days?.toString() ?? '—'} />
        <Field label="p75_days" value={data.p75_days?.toString() ?? '—'} />
      </Section>

      <Section title="Cost">
        {data.cost ? (
          <>
            <Field
              label="cost.estimated"
              value={data.cost.estimated?.toLocaleString() ?? '—'}
            />
            <Field label="cost.tier" value={data.cost.tier ?? '—'} />
            <Field
              label="cost.range_low"
              value={data.cost.range_low?.toLocaleString() ?? '—'}
            />
            <Field
              label="cost.range_high"
              value={data.cost.range_high?.toLocaleString() ?? '—'}
            />
            <Field
              label="cost.modeled_gfa_sqm"
              value={data.cost.modeled_gfa_sqm?.toString() ?? '—'}
            />
          </>
        ) : (
          <p className="col-span-2 text-xs text-gray-500">cost block null</p>
        )}
      </Section>

      <Section title="Neighbourhood">
        {data.neighbourhood ? (
          <>
            <Field label="neighbourhood.name" value={data.neighbourhood.name ?? '—'} />
            <Field
              label="neighbourhood.avg_household_income"
              value={
                data.neighbourhood.avg_household_income?.toLocaleString() ?? '—'
              }
            />
            <Field
              label="neighbourhood.median_household_income"
              value={
                data.neighbourhood.median_household_income?.toLocaleString() ?? '—'
              }
            />
            <Field
              label="neighbourhood.period_of_construction"
              value={data.neighbourhood.period_of_construction ?? '—'}
            />
          </>
        ) : (
          <p className="col-span-2 text-xs text-gray-500">neighbourhood block null</p>
        )}
      </Section>

      <Section title="Description">
        <Field label="applicant" value={data.applicant ?? '—'} />
        <Field label="work_description" value={data.work_description ?? '—'} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h4>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">{children}</dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-xs text-gray-500">{label}</dt>
      <dd className="text-xs text-gray-900">{value}</dd>
    </>
  );
}

function ErrorPanel({
  code,
  status,
  serverMessage,
}: {
  code: 'NOT_SAVED' | 'INVALID_ID' | 'PARSE_ERROR' | 'NETWORK';
  status: number | null;
  serverMessage: string | null;
}) {
  const testid = `lead-detail-inspector-error-${code.toLowerCase()}`;
  if (code === 'NOT_SAVED') {
    return (
      <div
        data-testid={testid}
        className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <p className="font-semibold">Permit not on your saved board</p>
        <p className="mt-1 text-xs">
          Spec 91 §4.3.1 — the LeadDetail endpoint is scoped to permits the
          admin has saved (LATERAL gate on <code>lead_views.saved=true</code>).
          Open <strong>Search permits</strong> on the Flight Center, claim the
          permit, then retry.
        </p>
      </div>
    );
  }
  if (code === 'INVALID_ID') {
    return (
      <div
        data-testid={testid}
        className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
      >
        <p className="font-semibold">Invalid lead id</p>
        {serverMessage && <p className="mt-1 text-xs font-mono">{serverMessage}</p>}
        <p className="mt-1 text-xs">
          Expected: <code>permit-num--revision</code> for permits or{' '}
          <code>COA-app-number</code> for committee-of-adjustment leads.
        </p>
      </div>
    );
  }
  return (
    <div
      data-testid={testid}
      className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      <p className="font-semibold">Network error</p>
      <p className="mt-1 text-xs">
        {status ? `HTTP ${status}` : 'fetch failed'} — try again or check the API.
      </p>
    </div>
  );
}

function ParseErrorPanel({ error }: { error: ZodError }) {
  return (
    <div
      data-testid="lead-detail-inspector-parse-error"
      className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      <p className="font-semibold">Schema drift</p>
      <p className="mt-1 text-xs">
        The endpoint returned a payload that doesn&apos;t match the LeadDetail
        contract. This is a server-side bug — see the issues below.
      </p>
      <pre className="mt-2 max-h-64 overflow-auto text-xs">
        {JSON.stringify(error.issues, null, 2)}
      </pre>
    </div>
  );
}
