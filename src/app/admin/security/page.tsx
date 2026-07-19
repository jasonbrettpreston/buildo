// 🔗 SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.6 (MFA gate)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §6 + §14
//             .cursor/phase1_plan.md Item 6 / P1-F4.3 (fold 22 minimums)
//
// Admin Security — MFA (TOTP) enrollment. Desktop-first internal tool.
// Enrollment is gated by the authenticated admin session (fold 22 req 1):
// every API call behind this page runs verifyAdminAuth + session-mode check;
// an unauthenticated visitor gets 401s and sees no enrollment surface.
// The TOTP secret/QR and the backup codes are displayed exactly ONCE
// (fold 22 reqs 2+3) — leaving the screen discards them irrecoverably.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Toaster, toast } from 'sonner';
import { z } from 'zod';
import {
  useMfaStatus,
  useMfaEnroll,
  useMfaVerify,
  useMfaUnenroll,
  type EnrollResult,
} from '@/features/admin-security/api/useAdminSecurity';

const TotpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app');

export default function AdminSecurityPage() {
  const { data: status, isLoading, isError, error } = useMfaStatus();
  // One-time material held ONLY in local state — never in the query cache,
  // never re-fetchable. Unmount = gone (fold 22 one-time-display rule).
  const [enrollment, setEnrollment] = useState<EnrollResult | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [unenrollTarget, setUnenrollTarget] = useState<string | null>(null);

  const enroll = useMfaEnroll();
  const verify = useMfaVerify();
  const unenroll = useMfaUnenroll();

  const verifiedFactor = status?.factors.find((f) => f.status === 'verified') ?? null;

  const startEnroll = () => {
    enroll.mutate(undefined, {
      onSuccess: (data) => setEnrollment(data),
      onError: (e) => toast.error(e.message),
    });
  };

  const confirmUnenroll = () => {
    if (!unenrollTarget) return;
    unenroll.mutate(
      { factor_id: unenrollTarget },
      {
        onSuccess: () => {
          toast.success('TOTP factor removed — backup codes deleted');
          setUnenrollTarget(null);
          setEnrollment(null);
          setBackupCodes(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster richColors position="top-right" />
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Security</h1>
            <p className="text-sm text-gray-500">Two-factor authentication for your admin account</p>
          </div>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">&larr; Admin</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {isLoading && <p className="text-sm text-gray-500">Loading MFA status…</p>}
        {isError && <p className="text-sm text-red-600">Error: {error?.message}</p>}

        {status && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Authenticator app (TOTP)</h2>
            {backupCodes ? (
              // One-time backup-codes panel — MUST be the FIRST branch. After
              // verify succeeds, the mfa-status refetch (invalidated in
              // useMfaVerify.onSuccess) reports the factor as verified; if
              // `verifiedFactor` won the branch, the panel unmounted before
              // the operator could save the codes (live repro, P1-F4 shakeout
              // 2026-07-19). The codes live in local state that survives
              // refetches; the panel dismisses ONLY via the explicit
              // "I have saved these codes" button below.
              <BackupCodesPanel
                codes={backupCodes}
                onDone={() => {
                  setEnrollment(null);
                  setBackupCodes(null);
                  toast.success('MFA enrollment complete');
                }}
              />
            ) : verifiedFactor ? (
              <div className="space-y-3">
                <p className="text-sm text-green-700">
                  ✓ Enrolled{verifiedFactor.friendly_name ? ` — ${verifiedFactor.friendly_name}` : ''}
                  <span className="text-gray-400"> · since {new Date(verifiedFactor.created_at).toLocaleDateString()}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Backup codes remaining:{' '}
                  <span className={status.backup_codes_remaining <= 2 ? 'font-bold text-red-600' : 'font-medium text-gray-900'}>
                    {status.backup_codes_remaining}
                  </span>
                  {status.backup_codes_remaining <= 2 && ' — re-enroll to issue a fresh set'}
                </p>
                <button
                  onClick={() => setUnenrollTarget(verifiedFactor.id)}
                  className="text-sm border border-red-300 text-red-700 rounded-lg px-4 py-2 hover:bg-red-50"
                >
                  Remove TOTP factor
                </button>
              </div>
            ) : enrollment ? (
              <VerifyPanel
                enrollment={enrollment}
                pending={verify.isPending}
                onVerify={(code) =>
                  verify.mutate(
                    { factor_id: enrollment.factor_id, code },
                    {
                      onSuccess: (data) => setBackupCodes(data.backup_codes),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
                onCancel={() => setEnrollment(null)}
              />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Not enrolled. Once enrollment is enforced (P1-F4 go/no-go), admin routes require an
                  aal2 session — enroll a TOTP authenticator and store the backup codes safely.
                </p>
                <button
                  onClick={startEnroll}
                  disabled={enroll.isPending}
                  className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
                >
                  {enroll.isPending ? 'Starting…' : 'Enroll authenticator'}
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {unenrollTarget && (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Remove TOTP factor?</h2>
            <p className="text-sm text-gray-600 mb-5">
              Your authenticator app will stop working for this account and all backup codes will be
              deleted. If MFA enforcement is on, you will need the break-glass path to re-enroll.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setUnenrollTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300">
                Cancel
              </button>
              <button
                onClick={confirmUnenroll}
                disabled={unenroll.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {unenroll.isPending ? 'Removing…' : 'Remove factor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — scan QR + verify the first TOTP code
// ---------------------------------------------------------------------------
function VerifyPanel({
  enrollment,
  pending,
  onVerify,
  onCancel,
}: {
  enrollment: EnrollResult;
  pending: boolean;
  onVerify: (code: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  // qr_code arrives either as a data URI or raw SVG markup depending on the
  // GoTrue version — normalize to an <img> src so we never innerHTML it
  // (Admin rule: no dangerouslySetInnerHTML without DOMPurify).
  const qrSrc = enrollment.qr_code.startsWith('data:')
    ? enrollment.qr_code
    : `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qr_code)}`;

  const submit = () => {
    const parsed = TotpCodeSchema.safeParse(code.trim());
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid code');
      return;
    }
    onVerify(parsed.data);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This QR code and secret are shown <strong>once</strong>. They cannot be recovered after you
        leave this screen — scan now.
      </div>
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- one-time
            secret-bearing data-URI QR: next/image's optimizer pipeline adds
            nothing for an inline data URI and must never touch this content */}
        <img src={qrSrc} alt="TOTP enrollment QR code" className="w-44 h-44 border border-gray-200 rounded-lg bg-white" />
        <div className="space-y-2 text-sm">
          <p className="text-gray-600">Scan with your authenticator app, or enter the secret manually:</p>
          <code className="block bg-gray-100 rounded px-3 py-2 font-mono text-xs break-all select-all">
            {enrollment.secret}
          </code>
          <label htmlFor="totp-code" className="block text-gray-700 pt-2">First 6-digit code</label>
          <div className="flex gap-2">
            <input
              id="totp-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono w-32"
            />
            <button
              onClick={submit}
              disabled={pending}
              className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? 'Verifying…' : 'Verify'}
            </button>
            <button onClick={onCancel} className="text-sm border border-gray-300 rounded-lg px-4 py-2">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — one-time backup-code display
// ---------------------------------------------------------------------------
function BackupCodesPanel({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      toast.success('Backup codes copied');
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        Store these backup codes now — they are shown <strong>once</strong> and only hashes are kept
        server-side. Each code works exactly one time if you lose your authenticator.
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-gray-100 rounded-lg p-4 font-mono text-sm select-all">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button onClick={() => void copyAll()} className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50">
          Copy all
        </button>
        <button onClick={onDone} className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">
          I have saved these codes
        </button>
      </div>
    </div>
  );
}
