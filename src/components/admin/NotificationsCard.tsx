// 🔗 SPEC LINK: docs/specs/02-web-admin/102_admin_notifications_tool.md §2
//
// Read-only Notifications card for the /admin/users/[uid] detail page (P24's
// Spec 21 tool): the account's device tokens (masked server-side), its 5
// notification prefs, and its last dispatch. Contributed by P25 25C; the
// detail page (P24) mounts it after the persona card.

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

interface UserNotifications {
  tokens: Array<{ push_token: string | null; platform: string; updated_at: string }>;
  prefs: {
    phase_changed: boolean;
    lifecycle_stalled_pref: boolean;
    start_date_urgent: boolean;
    notification_schedule: string | null;
    new_lead_min_cost_tier: string | null;
  } | null;
  last_dispatch: {
    type: string;
    status: string;
    dispatched_at: string;
    lead_id: string;
  } | null;
}

interface Envelope {
  data: { dispatches: unknown[]; user: UserNotifications | null } | null;
  error: { code: string; message: string } | null;
}

export function NotificationsCard({ uid }: { uid: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'notifications', 'user', uid],
    queryFn: async (): Promise<UserNotifications | null> => {
      const res = await fetch(`/api/admin/notifications?user_id=${encodeURIComponent(uid)}&limit=1`);
      const json = (await res.json()) as Envelope;
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      return json.data?.user ?? null;
    },
  });

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6" data-testid="notifications-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
        <Link href="/admin/notifications" className="text-sm text-blue-600 hover:underline">
          Dispatch log &rarr;
        </Link>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {isError && <p className="text-sm text-red-600">Failed to load notification state.</p>}

      {data && (
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="text-gray-500 mb-2">Devices</h3>
            {data.tokens.length === 0 ? (
              <p className="text-gray-400">No registered devices.</p>
            ) : (
              <ul className="space-y-1">
                {data.tokens.map((t, i) => (
                  <li key={i} className="font-mono text-xs text-gray-700">
                    {t.push_token} <span className="text-gray-400">({t.platform})</span>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="text-gray-500 mt-4 mb-2">Last dispatch</h3>
            {data.last_dispatch ? (
              <p className="font-mono text-xs text-gray-700">
                {data.last_dispatch.type} · {data.last_dispatch.status} · {data.last_dispatch.dispatched_at}
              </p>
            ) : (
              <p className="text-gray-400">Never dispatched.</p>
            )}
          </div>
          <div>
            <h3 className="text-gray-500 mb-2">Preferences</h3>
            {data.prefs ? (
              <dl className="space-y-1 text-xs">
                <PrefRow label="Phase updates" on={data.prefs.phase_changed} />
                <PrefRow label="Stall alerts" on={data.prefs.lifecycle_stalled_pref} />
                <PrefRow label="Start-date urgent" on={data.prefs.start_date_urgent} />
                <div className="flex justify-between">
                  <dt className="text-gray-600">Schedule</dt>
                  <dd className="font-mono">{data.prefs.notification_schedule ?? 'anytime'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Min cost tier <span className="text-gray-400">(v1: inert)</span></dt>
                  <dd className="font-mono">{data.prefs.new_lead_min_cost_tier ?? '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-gray-400">No profile prefs.</p>
            )}
          </div>
        </div>
      )}

      {!isLoading && !isError && !data && (
        <p className="text-sm text-gray-400">No notification state for this account.</p>
      )}
    </section>
  );
}

function PrefRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className={`font-mono ${on ? 'text-green-600' : 'text-gray-400'}`}>{on ? 'ON' : 'off'}</dd>
    </div>
  );
}
