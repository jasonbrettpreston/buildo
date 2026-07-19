// 🔗 SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.6 (MFA gate)
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.1 + §7.1
//             .cursor/phase1_plan.md Item 6 / P1-F4.3
//
// TanStack Query hooks for the admin Security page (MFA enrollment).
// Reads are queries; mutations fire telemetry in onMutate (Spec 35 §7.1 —
// intent capture BEFORE the network call). No secret material (TOTP secret,
// backup codes) ever goes into telemetry props.

'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import { captureEvent } from '@/lib/observability/capture';
import { logError } from '@/lib/logger';

export const ADMIN_SECURITY_KEY = ['admin', 'security'] as const;

export interface MfaFactor {
  id: string;
  friendly_name: string | null;
  status: 'verified' | 'unverified';
  created_at: string;
}

export interface MfaStatus {
  factors: MfaFactor[];
  backup_codes_remaining: number;
}

export interface EnrollResult {
  factor_id: string;
  /** QR (SVG or data URI) — display ONCE, never re-fetchable. */
  qr_code: string;
  /** Base32 TOTP secret — display ONCE, never re-fetchable. */
  secret: string;
  uri: string;
}

export interface VerifyResult {
  verified: boolean;
  /** Plaintext backup codes — display ONCE; server stores hashes only. */
  backup_codes: string[];
}

interface Envelope<T> {
  data: T;
  error: { code: string; message: string } | null;
  meta: unknown;
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `request failed (${res.status})`);
  }
  return json.data;
}

export function useMfaStatus(): UseQueryResult<MfaStatus, Error> {
  return useQuery<MfaStatus, Error>({
    queryKey: [...ADMIN_SECURITY_KEY, 'mfa-status'],
    queryFn: async () => parseEnvelope<MfaStatus>(await fetch('/api/admin/security/mfa')),
    staleTime: 10_000,
  });
}

export function useMfaEnroll() {
  return useMutation<EnrollResult, Error, void>({
    mutationFn: async () =>
      parseEnvelope<EnrollResult>(await fetch('/api/admin/security/mfa', { method: 'POST' })),
    onMutate: () => {
      Sentry.addBreadcrumb({ category: 'admin_action', message: 'mfa_enroll_started' });
      captureEvent('admin_action_performed', { action: 'mfa_enroll_started', target: 'security' });
    },
    // No status invalidation here: the factor is unverified until verify
    // succeeds, and the enroll payload (QR/secret) lives only in local state.
    onError: (mutationErr) => logError('[admin/security/enroll]', mutationErr, {}),
  });
}

export function useMfaVerify() {
  const qc = useQueryClient();
  return useMutation<VerifyResult, Error, { factor_id: string; code: string }>({
    mutationFn: async (body) =>
      parseEnvelope<VerifyResult>(
        await fetch('/api/admin/security/mfa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ),
    onMutate: () => {
      // NB: telemetry carries the action only — never the TOTP code.
      Sentry.addBreadcrumb({ category: 'admin_action', message: 'mfa_verify_attempted' });
      captureEvent('admin_action_performed', { action: 'mfa_verify_attempted', target: 'security' });
    },
    onSuccess: () => {
      // This refetch makes the status report the factor as VERIFIED while the
      // one-time backup-codes panel is still on screen. The page holds the
      // plaintext codes in local component state and renders the panel as its
      // FIRST branch (dismissed only by the explicit "I have saved these
      // codes" button) — a status refetch must never unmount it (live repro,
      // P1-F4 shakeout 2026-07-19).
      void qc.invalidateQueries({ queryKey: [...ADMIN_SECURITY_KEY, 'mfa-status'] });
    },
    onError: (mutationErr) => logError('[admin/security/verify]', mutationErr, {}),
  });
}

export function useMfaUnenroll() {
  const qc = useQueryClient();
  return useMutation<{ unenrolled: boolean }, Error, { factor_id: string }>({
    mutationFn: async ({ factor_id }) =>
      parseEnvelope<{ unenrolled: boolean }>(
        await fetch(`/api/admin/security/mfa?factor_id=${encodeURIComponent(factor_id)}`, {
          method: 'DELETE',
        }),
      ),
    onMutate: () => {
      Sentry.addBreadcrumb({ category: 'admin_action', message: 'mfa_unenroll' });
      captureEvent('admin_action_performed', { action: 'mfa_unenroll', target: 'security' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...ADMIN_SECURITY_KEY, 'mfa-status'] });
    },
    onError: (mutationErr) => logError('[admin/security/unenroll]', mutationErr, {}),
  });
}
