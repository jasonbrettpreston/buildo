// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.6
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3.1
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3 + §13
//
// Flight Job Detail Inspector — paste a lead_id, see the
// FlightBoardDetail payload from /api/leads/flight-board/detail/:id.
// Used by the Flight Center drawer (initialId prefilled from the
// tapped card) AND by the paired-tab inspector page.
//
// Three-state display per Spec 76 §3.6:
//   - idle (no id selected) → input only
//   - loading → input + skeleton
//   - result OR error (NOT_SAVED / INVALID_ID / NETWORK / parse_error)
//
// Schema drift surfaces as a parse_error UI state (raw response +
// parse error side-by-side) rather than ErrorBoundary escalation,
// per Spec 76 §3.6 mandate.

'use client';

import React, { useState } from 'react';
import {
  useFlightBoardDetail,
  FlightBoardDetailError,
} from '@/features/admin-flight-center/api/useFlightBoardDetail';
import { ZodError } from 'zod';

interface Props {
  /** Optional pre-filled id (used by the Flight Center drawer). */
  initialId?: string | null;
}

export function FlightJobDetailInspector({ initialId = null }: Props) {
  const [pendingId, setPendingId] = useState(initialId ?? '');
  const [activeId, setActiveId] = useState<string | null>(initialId);

  const { data, isLoading, isError, error } = useFlightBoardDetail(activeId);

  return (
    <div data-testid="flight-job-inspector" className="space-y-4">
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
          placeholder="permit-num--revision (e.g. 20-101234--00)"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          aria-label="Lead ID"
          data-testid="flight-job-inspector-input"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          data-testid="flight-job-inspector-submit"
        >
          Inspect
        </button>
      </form>

      {!activeId && (
        <p data-testid="flight-job-inspector-idle" className="text-sm text-gray-500">
          Paste a lead id (e.g. <code>20-101234--00</code>) and press <strong>Inspect</strong>.
        </p>
      )}

      {activeId && isLoading && (
        <p data-testid="flight-job-inspector-loading" className="text-sm text-gray-500">
          Loading…
        </p>
      )}

      {activeId && isError && error instanceof FlightBoardDetailError && (
        <ErrorPanel
          code={error.code}
          status={error.status}
          serverMessage={error.serverMessage}
        />
      )}

      {activeId && isError && error instanceof ZodError && (
        <ParseErrorPanel error={error} testid="flight-job-inspector-parse-error" />
      )}

      {activeId && data && (
        <div data-testid="flight-job-inspector-result" className="space-y-4">
          <StructuredFlightDetail data={data} />
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

function StructuredFlightDetail({ data }: { data: { permit_num: string; revision_num: string; address: string; lifecycle_phase: string | null; lifecycle_stalled: boolean; predicted_start: string | null; p25_days: number | null; p75_days: number | null; temporal_group: string; updated_at: string } }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-gray-200 bg-white p-4 text-sm">
      <Field label="permit_num" value={data.permit_num} />
      <Field label="revision_num" value={data.revision_num} />
      <Field label="address" value={data.address} />
      <Field label="lifecycle_phase" value={data.lifecycle_phase ?? '—'} />
      <Field label="lifecycle_stalled" value={String(data.lifecycle_stalled)} />
      <Field label="predicted_start" value={data.predicted_start ?? '—'} />
      <Field label="p25_days" value={data.p25_days?.toString() ?? '—'} />
      <Field label="p75_days" value={data.p75_days?.toString() ?? '—'} />
      <Field label="temporal_group" value={data.temporal_group} />
      <Field label="updated_at" value={data.updated_at} />
    </dl>
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
  const testid = `flight-job-inspector-error-${code.toLowerCase()}`;
  if (code === 'NOT_SAVED') {
    return (
      <div
        data-testid={testid}
        className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <p className="font-semibold">Permit not on your saved board</p>
        <p className="mt-1 text-xs">
          Spec 91 §4.3.1 — the detail endpoint is scoped to permits the admin
          has saved. Open <strong>Search permits</strong> on the Flight Center
          and claim this permit, then retry.
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
          Expected shape: <code>permit-num--revision</code> for permits.
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

function ParseErrorPanel({ error, testid }: { error: ZodError; testid: string }) {
  return (
    <div
      data-testid={testid}
      className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      <p className="font-semibold">Schema drift</p>
      <p className="mt-1 text-xs">
        The endpoint returned a payload that doesn&apos;t match the contract.
        This is a server-side bug — see the issues below.
      </p>
      <pre className="mt-2 max-h-64 overflow-auto text-xs">
        {JSON.stringify(error.issues, null, 2)}
      </pre>
    </div>
  );
}
