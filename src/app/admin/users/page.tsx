// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3.1 + §5
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §6 + §14
//
// Admin User Management — directory page. Desktop-first internal tool. Search
// email/phone/name/company; filter preset / status / trade / stripe-cancel-failed;
// server-paginated. Row → detail. Create supplier/enterprise via a modal.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Toaster, toast } from 'sonner';
import { useUserDirectoryStore } from '@/features/admin-users/store/useUserDirectoryStore';
import { useUserDirectory, useCreateUser } from '@/features/admin-users/api/useAdminUsers';
import { ACCOUNT_PRESET_VALUES, SUBSCRIPTION_STATUS_VALUES, ASSIGNABLE_TRADE_SLUGS } from '@/lib/admin/user-management-schemas';

export default function AdminUsersPage() {
  const { q, preset, subscription_status, trade_slug, stripe_cancel_failed, offset, setFilter, nextPage, prevPage } = useUserDirectoryStore();
  const { data, isLoading, isError, error } = useUserDirectory({ q, preset, subscription_status, trade_slug, stripe_cancel_failed, offset });
  const [createOpen, setCreateOpen] = useState(false);

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 25;
  const page = Math.floor(offset / limit) + 1; // offset is a raw row offset, not a page index
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster richColors position="top-right" />
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-500">Directory, details, and mutations for Buildo accounts</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCreateOpen(true)}
              className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700"
            >
              + Create account
            </button>
            <Link href="/admin" className="text-sm text-blue-600 hover:underline">&larr; Admin</Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 grid grid-cols-1 md:grid-cols-6 gap-3">
          <input
            value={q}
            onChange={(e) => setFilter('q', e.target.value)}
            placeholder="Search email / phone / name / company"
            className="md:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <select value={preset} onChange={(e) => setFilter('preset', e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Any persona</option>
            {ACCOUNT_PRESET_VALUES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={subscription_status} onChange={(e) => setFilter('subscription_status', e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Any status</option>
            {SUBSCRIPTION_STATUS_VALUES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={trade_slug} onChange={(e) => setFilter('trade_slug', e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Any trade</option>
            {ASSIGNABLE_TRADE_SLUGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* P26-26D sweep surface (Spec 21 §6): accounts with an outstanding delete-time Stripe-cancel failure. */}
          <label className="flex items-center gap-2 text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={stripe_cancel_failed}
              onChange={(e) => setFilter('stripe_cancel_failed', e.target.checked)}
            />
            Cancel-failed
          </label>
        </div>

        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {isError && <p className="text-sm text-red-600">Error: {error?.message}</p>}

        {data && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Name / Company</th>
                  <th className="px-4 py-3 font-medium">Persona</th>
                  <th className="px-4 py-3 font-medium">Trade(s)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users match these filters</td></tr>
                )}
                {data.rows.map((r) => {
                  const trades = [r.trade_slug, ...(r.trade_slugs_override ?? [])].filter(Boolean);
                  return (
                    <tr key={r.user_id} className={r.account_deleted_at ? 'bg-red-50/40' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3">
                        <div className="text-gray-900">{r.email ?? '—'}</div>
                        <div className="text-xs text-gray-400">{r.phone_number ?? ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900">{r.full_name ?? '—'}</div>
                        <div className="text-xs text-gray-400">{r.company_name ?? ''}</div>
                      </td>
                      <td className="px-4 py-3">{r.account_preset ?? <span className="text-gray-300">unset</span>}</td>
                      <td className="px-4 py-3 font-mono text-xs">{trades.length ? trades.join(', ') : '—'}</td>
                      <td className="px-4 py-3">
                        {r.account_deleted_at ? <span className="text-red-600">deletion-window</span> : (r.subscription_status ?? '—')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/users/${encodeURIComponent(r.user_id)}`} className="text-blue-600 hover:underline">View</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100 text-sm text-gray-600">
              <span>{total} total · page {page} / {pages}</span>
              <div className="flex gap-2">
                <button disabled={offset === 0} onClick={() => prevPage(limit)} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40">Prev</button>
                <button disabled={page >= pages} onClick={() => nextPage(limit)} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40">Next</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create account modal (supplier / enterprise)
// ---------------------------------------------------------------------------
function CreateUserModal({ onClose }: { onClose: () => void }) {
  const create = useCreateUser();
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [presetVal, setPresetVal] = useState<'supplier' | 'manufacturer'>('supplier');
  const [trades, setTrades] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  // [P1-F6 fold — Security M1] One-time material held ONLY in local state —
  // never in the query cache, never re-fetchable (the BackupCodesPanel
  // discipline, src/app/admin/security/page.tsx). Closing the modal = gone.
  const [resetLink, setResetLink] = useState<string | null>(null);

  const toggle = (slug: string) =>
    setTrades((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));

  const submit = () => {
    if (!email || trades.length === 0 || reason.trim().length < 3) {
      toast.error('Email, at least one trade, and a reason (3+ chars) are required');
      return;
    }
    create.mutate(
      { email, company_name: company || undefined, account_preset: presetVal, trade_slugs: trades, reason },
      {
        onSuccess: (d) => {
          if (d.password_reset_link) {
            // Hold the link for a single copy-once display; do NOT close yet.
            toast.success('Account created — copy the reset link now');
            setResetLink(d.password_reset_link);
          } else {
            toast.success('Account created');
            onClose();
          }
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (resetLink) {
    return (
      <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Password reset link</h2>
          <ResetLinkPanel link={resetLink} onDone={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Create supplier / enterprise account</h2>
        <div className="space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <select value={presetVal} onChange={(e) => setPresetVal(e.target.value as 'supplier' | 'manufacturer')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="supplier">supplier (single/few trades)</option>
            <option value="manufacturer">manufacturer / enterprise (multi-trade)</option>
          </select>
          <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto grid grid-cols-2 gap-1">
            {ASSIGNABLE_TRADE_SLUGS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={trades.includes(t)} onChange={() => toggle(t)} />
                {t}
              </label>
            ))}
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit-logged)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
          <button onClick={submit} disabled={create.isPending} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One-time password-reset-link display
// ---------------------------------------------------------------------------
// [P1-F6 fold — Security M1] The reset link is a live credential. Same
// one-time/copy-once discipline as BackupCodesPanel (admin/security): shown
// exactly once from ephemeral local state, never written to any store, gone
// when the panel closes. The API response itself is Cache-Control: no-store.
function ResetLinkPanel({ link, onDone }: { link: string; onDone: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Reset link copied');
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        This password reset link is shown <strong>once</strong> and grants access to the account.
        Copy it now and deliver it to the account owner through a trusted channel — it cannot be
        retrieved again (a fresh link can be re-issued if lost).
      </div>
      <code className="block bg-gray-100 rounded-lg px-3 py-2 font-mono text-xs break-all select-all">
        {link}
      </code>
      <div className="flex gap-2">
        <button onClick={() => void copy()} className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50">
          Copy link
        </button>
        <button onClick={onDone} className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">
          I have copied the link
        </button>
      </div>
    </div>
  );
}
