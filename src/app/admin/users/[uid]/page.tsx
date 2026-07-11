// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3.2 + §4 + §6
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §6 + §14
//
// Admin User Management — account detail. Profile / Subscription (+ ops) /
// Persona-and-trades (the JOIN editor) cards. Every mutation collects a
// mandatory reason and (destructive ones) confirms via a role="alertdialog"
// modal. Sonner toasts. No shadcn/lucide (Spec 33 §6 — inline elements).

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Toaster, toast } from 'sonner';
import { useUserDetail, useUserMutation, type UserDetail } from '@/features/admin-users/api/useAdminUsers';
import { ACCOUNT_PRESET_VALUES, ASSIGNABLE_TRADE_SLUGS } from '@/lib/admin/user-management-schemas';
import type { AdminUserMutation } from '@/lib/admin/user-management-schemas';
import { SubscriptionOps } from './SubscriptionOps';

export default function AdminUserDetailPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = use(params);
  const { data, isLoading, isError, error } = useUserDetail(uid);
  const mutation = useUserMutation(uid);

  const run = (m: AdminUserMutation, successMsg: string) =>
    mutation.mutate(m, {
      onSuccess: () => toast.success(successMsg),
      onError: (e) => toast.error(e.message),
    });

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster richColors position="top-right" />
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Account: <span className="font-mono text-base">{uid}</span></h1>
          <Link href="/admin/users" className="text-sm text-blue-600 hover:underline">&larr; Directory</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {isError && <p className="text-sm text-red-600">Error: {error?.message}</p>}
        {data && (
          <>
            {data.deleted && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                This account is in the 30-day deletion window. Your view of it has been audit-logged.
              </div>
            )}
            <ProfileCard d={data.detail} />
            <SubscriptionCard d={data.detail} uid={uid} run={run} pending={mutation.isPending} />
            <PersonaCard d={data.detail} run={run} pending={mutation.isPending} />
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm text-gray-900">{value ?? '—'}</div>
    </div>
  );
}

function ProfileCard({ d }: { d: UserDetail }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Identity & Profile</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Full name" value={d.full_name} />
        <Field label="Company" value={d.company_name} />
        <Field label="Email" value={d.email} />
        <Field label="Phone" value={d.phone_number} />
        <Field label="Location mode" value={d.location_mode} />
        <Field label="Created" value={d.created_at} />
        <Field label="Saved leads" value={d.saved_count} />
        <Field label="Lead views" value={d.lead_views_count} />
        <Field label="Onboarding" value={d.onboarding_complete ? 'complete' : 'incomplete'} />
      </div>
    </section>
  );
}

function SubscriptionCard({
  d, uid, run, pending,
}: {
  d: UserDetail; uid: string; run: (m: AdminUserMutation, msg: string) => void; pending: boolean;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Subscription & State</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <Field label="Status" value={d.subscription_status} />
        <Field label="Trial started" value={d.trial_started_at} />
        <Field
          label="Stripe customer"
          value={d.stripe_customer_id ? (
            <a href={`https://dashboard.stripe.com/customers/${d.stripe_customer_id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              {d.stripe_customer_id} ↗
            </a>
          ) : '—'}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <ReasonAction label="Extend trial (14d)" onRun={(reason) => run({ action: 'extend_trial', days: 14, reason }, 'Trial extended')} disabled={pending} />
        <ReasonAction label="Revoke" destructive onRun={(reason) => run({ action: 'revoke', reason }, 'Subscription revoked')} disabled={pending} />
        <ReasonAction label="Suspend" destructive onRun={(reason) => run({ action: 'suspend', reason }, 'Account suspended')} disabled={pending} />
        <ReasonAction label="Delete account" destructive onRun={(reason) => run({ action: 'delete', reason }, 'Account deleted')} disabled={pending} />
      </div>
      <SubscriptionOps uid={uid} cancelFailedAt={d.stripe_cancel_failed_at ?? null} />
    </section>
  );
}

function PersonaCard({
  d, run, pending,
}: {
  d: UserDetail; run: (m: AdminUserMutation, msg: string) => void; pending: boolean;
}) {
  const initial = [d.trade_slug, ...(d.trade_slugs_override ?? [])].filter((s): s is string => Boolean(s));
  const [selected, setSelected] = useState<string[]>(initial);
  const [presetVal, setPresetVal] = useState(d.account_preset ?? '');
  const [reason, setReason] = useState('');

  const toggle = (slug: string) =>
    setSelected((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Persona & Trades (JOIN editor)</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="text-xs text-gray-400 mb-2">Persona (account_preset)</div>
          <select value={presetVal} onChange={(e) => setPresetVal(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2">
            <option value="">unset</option>
            {ACCOUNT_PRESET_VALUES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            onClick={() => {
              if (reason.trim().length < 3) { toast.error('A reason (3+ chars) is required'); return; }
              if (!presetVal) { toast.error('Pick a persona'); return; }
              run({ action: 'set_preset', account_preset: presetVal as (typeof ACCOUNT_PRESET_VALUES)[number], reason }, 'Persona updated');
            }}
            disabled={pending}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Save persona
          </button>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-2">Trade set — first selected becomes the primary</div>
          <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto grid grid-cols-2 gap-1">
            {ASSIGNABLE_TRADE_SLUGS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={selected.includes(t)} onChange={() => toggle(t)} />
                <span className={selected[0] === t ? 'font-semibold text-blue-600' : ''}>{t}</span>
              </label>
            ))}
          </div>
          <div className="text-xs text-gray-400 mt-1">Primary: <span className="font-mono">{selected[0] ?? '—'}</span></div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit-logged)" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button
          onClick={() => {
            if (selected.length === 0) { toast.error('Select at least one trade'); return; }
            if (reason.trim().length < 3) { toast.error('A reason (3+ chars) is required'); return; }
            run({ action: 'set_trades', trade_slugs: selected, reason }, 'Trade set updated');
          }}
          disabled={pending}
          className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save trade set
        </button>
      </div>
    </section>
  );
}

// A button that opens a small confirm modal collecting the mandatory reason.
function ReasonAction({
  label, destructive, onRun, disabled,
}: {
  label: string; destructive?: boolean; onRun: (reason: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`text-sm px-3 py-1.5 rounded-lg border disabled:opacity-50 ${destructive ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-gray-300 hover:bg-gray-50'}`}
      >
        {label}
      </button>
      {open && (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-gray-900 mb-2">{label}</h3>
            {destructive && <p className="text-sm text-red-600 mb-3">This is a destructive action. It will be audit-logged.</p>}
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, audit-logged)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
              <button
                onClick={() => {
                  if (reason.trim().length < 3) { toast.error('A reason (3+ chars) is required'); return; }
                  onRun(reason);
                  setOpen(false);
                  setReason('');
                }}
                className={`px-4 py-2 text-sm rounded-lg text-white ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
