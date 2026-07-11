// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6 (Subscription-Ops)
//             docs/specs/02-web-admin/20_stripe_web_checkout.md (the P26 routes)
//
// The P26 alignment surface on the Subscription card. The three server routes
// (/api/admin/users/[uid]/subscription/{reconcile,retry-cancel,events}) are
// owned by the concurrent P26 lane; this component renders their SURFACE and
// DEGRADES GRACEFULLY when a route is absent (404) — it never hard-fails the
// detail page while the routes land.

'use client';

import { useState } from 'react';
import { toast } from 'sonner';

interface WebhookEvent {
  event_id?: string;
  type?: string;
  processed_at?: string;
}

interface ReconcileResult {
  stored_status?: string;
  stripe_status?: string;
  drift?: boolean;
}

async function callOps(url: string, method: 'GET' | 'POST', body?: unknown): Promise<{ ok: boolean; status: number; json: unknown }> {
  try {
    const res = await fetch(url, {
      method,
      ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    let json: unknown = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

export function SubscriptionOps({ uid, cancelFailedAt }: { uid: string; cancelFailedAt: string | null }) {
  const base = `/api/admin/users/${encodeURIComponent(uid)}/subscription`;
  const [drift, setDrift] = useState<ReconcileResult | null>(null);
  const [events, setEvents] = useState<WebhookEvent[] | null>(null);
  const [routesMissing, setRoutesMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const reconcile = async () => {
    setBusy(true);
    const r = await callOps(`${base}/reconcile`, 'GET');
    setBusy(false);
    if (r.status === 404) { setRoutesMissing(true); return; }
    if (!r.ok) { toast.error('Reconcile failed'); return; }
    setDrift((r.json as { data?: ReconcileResult })?.data ?? null);
  };

  const applyStripeTruth = async (reason: string) => {
    setBusy(true);
    const r = await callOps(`${base}/reconcile`, 'POST', { apply: true, reason });
    setBusy(false);
    if (r.status === 404) { setRoutesMissing(true); return; }
    if (r.ok) toast.success('Applied Stripe truth (audit-logged)'); else toast.error('Apply failed');
  };

  const retryCancel = async (reason: string) => {
    setBusy(true);
    const r = await callOps(`${base}/retry-cancel`, 'POST', { reason });
    setBusy(false);
    if (r.status === 404) { setRoutesMissing(true); return; }
    if (r.ok) toast.success('Cancel retried'); else toast.error('Retry failed');
  };

  const loadEvents = async () => {
    setBusy(true);
    const r = await callOps(`${base}/events`, 'GET');
    setBusy(false);
    if (r.status === 404) { setRoutesMissing(true); return; }
    if (r.ok) setEvents(((r.json as { data?: WebhookEvent[] })?.data ?? []));
  };

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Subscription ops</h3>

      {cancelFailedAt && (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">cancel failed · {cancelFailedAt}</span>
          <ReasonButton label="Retry cancel" onRun={retryCancel} disabled={busy} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={reconcile} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Reconcile with Stripe</button>
        <button onClick={loadEvents} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Load webhook events</button>
      </div>

      {routesMissing && (
        <p className="text-xs text-gray-400 mt-2">Subscription-ops routes not deployed yet (P26 lane) — surface is ready.</p>
      )}

      {drift && (
        <div className="mt-3 text-sm">
          <span className="text-gray-600">stored: <b>{drift.stored_status ?? '—'}</b> · Stripe: <b>{drift.stripe_status ?? '—'}</b></span>
          {drift.drift && <ReasonButton label="Apply Stripe truth" destructive onRun={applyStripeTruth} disabled={busy} />}
        </div>
      )}

      {events && (
        <ul className="mt-3 text-xs text-gray-600 divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {events.length === 0 && <li className="px-3 py-2 text-gray-400">No webhook events</li>}
          {events.map((e, i) => (
            <li key={e.event_id ?? i} className="px-3 py-2 flex justify-between">
              <span className="font-mono">{e.type ?? e.event_id}</span>
              <span className="text-gray-400">{e.processed_at}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReasonButton({ label, destructive, onRun, disabled }: { label: string; destructive?: boolean; onRun: (reason: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <>
      <button onClick={() => setOpen(true)} disabled={disabled} className={`ml-2 text-sm px-2.5 py-1 rounded-lg border disabled:opacity-50 ${destructive ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-gray-300 hover:bg-gray-50'}`}>{label}</button>
      {open && (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-gray-900 mb-3">{label}</h3>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit-logged)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
              <button onClick={() => { if (reason.trim().length < 3) { toast.error('Reason required'); return; } onRun(reason); setOpen(false); setReason(''); }} className={`px-4 py-2 text-sm rounded-lg text-white ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
