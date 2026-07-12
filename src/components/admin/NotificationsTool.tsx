// 🔗 SPEC LINK: docs/specs/02-web-admin/102_admin_notifications_tool.md §2 + §4
//
// The Notifications admin tool: dispatch log (Spec 101 ledger + queue context,
// masked tokens), TEST-SEND (real Expo push, ticket in _debug), and READ-ONLY
// kill-switch/throttle status deep-linking to the Spec 86 Control Panel (one
// write path for logic_variables, not two).
//
// Conventions (Spec 33): TanStack Query for server state; Tailwind + native
// elements (no shadcn/lucide); useState + Zod-at-the-route for the form;
// captureEvent for read-surface telemetry is omitted (log renders no PII and
// the server tracks the test-send action).

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';

interface DispatchRow {
  id: number;
  user_id: string;
  lead_id: string;
  type: string;
  toronto_date: string;
  push_token: string | null;
  expo_ticket_id: string | null;
  status: string;
  detail: string | null;
  dispatched_at: string;
  title: string | null;
  body: string | null;
}

interface LogResponse {
  data: { dispatches: DispatchRow[]; user: unknown } | null;
  error: { code: string; message: string } | null;
  meta: {
    total: number;
    limit: number;
    offset: number;
    gates?: Record<string, unknown>;
  } | null;
}

interface TestSendResponse {
  data: { sent: boolean; token: string | null } | null;
  error: { code: string; message: string } | null;
  _debug?: {
    ticket_id: string | null;
    ticket_status: string | null;
    error_message: string | null;
    duration_ms: number;
  };
}

const PAGE_SIZE = 50;

export function NotificationsTool() {
  const [offset, setOffset] = useState(0);
  const [userFilter, setUserFilter] = useState('');

  const logQuery = useQuery({
    queryKey: ['admin', 'notifications', 'log', offset, userFilter],
    queryFn: async (): Promise<LogResponse> => {
      const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (userFilter.trim()) p.set('user_id', userFilter.trim());
      const res = await fetch(`/api/admin/notifications?${p.toString()}`);
      const json = (await res.json()) as LogResponse;
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      return json;
    },
  });

  const dispatches = logQuery.data?.data?.dispatches ?? [];
  const total = logQuery.data?.meta?.total ?? 0;
  const gates = logQuery.data?.meta?.gates ?? {};
  const dispatchEnabled = Number(gates['notifications_dispatch_enabled'] ?? 0) === 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">&larr; Admin home</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Kill-switch / throttle — READ-ONLY status; edits go to the Control Panel */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Dispatch engine</h2>
              <p className="text-sm text-gray-500 mt-1">
                Kill-switch + throttle are logic variables — edit them in the{' '}
                <Link href="/admin/control-panel" className="text-blue-600 hover:underline">Control Panel</Link>.
                This surface is read-only by design (one write path).
              </p>
            </div>
            <span
              data-testid="dispatch-gate-chip"
              className={`px-3 py-1 rounded-full text-sm font-semibold ${dispatchEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
            >
              {dispatchEnabled ? 'DISPATCH ON' : 'DISPATCH OFF'}
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-4 mt-4 text-sm">
            <div>
              <dt className="text-gray-500">notifications_dispatch_enabled</dt>
              <dd className="font-mono text-gray-900">{String(gates['notifications_dispatch_enabled'] ?? '—')}</dd>
            </div>
            <div>
              <dt className="text-gray-500">notifications_max_per_user_per_day</dt>
              <dd className="font-mono text-gray-900">{String(gates['notifications_max_per_user_per_day'] ?? '—')}</dd>
            </div>
            <div>
              <dt className="text-gray-500">notifications_disabled_types</dt>
              <dd className="font-mono text-gray-900">{JSON.stringify(gates['notifications_disabled_types'] ?? [])}</dd>
            </div>
          </dl>
        </section>

        <TestSendCard />

        {/* Dispatch log */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Dispatch log</h2>
            <input
              value={userFilter}
              onChange={(e) => { setOffset(0); setUserFilter(e.target.value); }}
              placeholder="Filter by user id…"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64"
              aria-label="Filter dispatch log by user id"
            />
          </div>

          {logQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {logQuery.isError && (
            <p className="text-sm text-red-600">Error: {(logQuery.error as Error).message}</p>
          )}
          {!logQuery.isLoading && !logQuery.isError && dispatches.length === 0 && (
            <p className="text-sm text-gray-500" data-testid="empty-state">
              No dispatches recorded. The engine is {dispatchEnabled ? 'ON but has not delivered yet' : 'gated OFF (expected until the kill-switch flips)'}.
            </p>
          )}

          {dispatches.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Lead</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Token</th>
                    <th className="py-2 pr-4">Ticket</th>
                    <th className="py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map((d) => (
                    <tr key={d.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-mono text-xs text-gray-600">{d.dispatched_at}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        <Link href={`/admin/users/${encodeURIComponent(d.user_id)}`} className="text-blue-600 hover:underline">
                          {d.user_id}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-gray-700">{d.lead_id}</td>
                      <td className="py-2 pr-4 text-xs">{d.type}</td>
                      <td className="py-2 pr-4">
                        <StatusChip status={d.status} />
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-gray-500">{d.push_token ?? '—'}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-gray-500">{d.expo_ticket_id ?? '—'}</td>
                      <td className="py-2 text-xs text-gray-500 max-w-xs truncate" title={d.detail ?? ''}>{d.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center gap-3 mt-4 text-sm">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-gray-500">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <button
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === 'sent' ? 'bg-green-100 text-green-700'
    : status === 'error' ? 'bg-red-100 text-red-700'
    : status === 'deferred' ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-600'; // deferred_expired
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>;
}

function TestSendCard() {
  const [target, setTarget] = useState('');
  const [result, setResult] = useState<TestSendResponse | null>(null);

  const send = useMutation({
    mutationFn: async (): Promise<TestSendResponse> => {
      const isToken = target.trim().startsWith('ExponentPushToken[');
      const body = isToken ? { push_token: target.trim() } : { user_id: target.trim() };
      const res = await fetch('/api/admin/notifications/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as TestSendResponse;
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      return json;
    },
    onSuccess: (json) => setResult(json),
    onError: (e) => setResult({ data: null, error: { code: 'SEND_FAILED', message: (e as Error).message } }),
  });

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900">Test send</h2>
      <p className="text-sm text-gray-500 mt-1">
        Sends ONE real Expo push through the same hardened transport the chain uses.
        Out-of-band: it does not touch the ledger or the daily throttle.
        Requires a per-admin session (shared admin-key auth gets 403).
      </p>
      <div className="flex gap-3 mt-4">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="ExponentPushToken[…] or user id"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          aria-label="Test send target: push token or user id"
        />
        <button
          onClick={() => send.mutate()}
          disabled={!target.trim() || send.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          {send.isPending ? 'Sending…' : 'Send test push'}
        </button>
      </div>
      {result && (
        <div className="mt-4 text-sm" data-testid="test-send-result">
          {result.error ? (
            <p className="text-red-600">Failed: {result.error.message}</p>
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-700">
              <p>sent: {String(result.data?.sent)} → {result.data?.token}</p>
              <p>ticket: {result._debug?.ticket_id ?? '—'} ({result._debug?.ticket_status ?? '—'})</p>
              {result._debug?.error_message && <p className="text-red-600">expo: {result._debug.error_message}</p>}
              <p>duration: {result._debug?.duration_ms}ms</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
