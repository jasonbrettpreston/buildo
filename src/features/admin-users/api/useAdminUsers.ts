// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3 + §4 + §5
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.1 + §7.1
//
// TanStack Query hooks for the admin User Management tool. Reads are queries;
// the mutation set + creation are useMutation with telemetry fired in onMutate
// (Spec 35 §7.1 — intent capture BEFORE the network call).

'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import { captureEvent } from '@/lib/observability/capture';
import { logError } from '@/lib/logger';
import type { AdminUserMutation, CreateUserBody } from '@/lib/admin/user-management-schemas';

export const ADMIN_USERS_KEY = ['admin', 'users'] as const;

export interface DirectoryRow {
  user_id: string;
  email: string | null;
  phone_number: string | null;
  full_name: string | null;
  company_name: string | null;
  trade_slug: string | null;
  trade_slugs_override: string[] | null;
  account_preset: string | null;
  subscription_status: string | null;
  onboarding_complete: boolean;
  account_deleted_at: string | null;
  created_at: string | null;
}

export interface DirectoryResult {
  rows: DirectoryRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserDetail extends DirectoryRow {
  display_name: string | null;
  radius_km: number | null;
  radius_cap_km: number | null;
  location_mode: string | null;
  trial_started_at: string | null;
  stripe_customer_id: string | null;
  stripe_cancel_failed_at?: string | null; // P26 26D column — optional until it lands
  tos_accepted_at: string | null;
  updated_at: string | null;
  lead_views_count: number;
  saved_count: number;
  view_events: number;
}

interface Envelope<T> {
  data: T;
  error: { code: string; message: string } | null;
  meta: unknown;
}

async function getJson<T>(url: string): Promise<{ data: T; meta: unknown }> {
  const res = await fetch(url);
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `${url} returned ${res.status}`);
  }
  return { data: json.data, meta: json.meta };
}

export interface DirectoryQueryArgs {
  q?: string;
  preset?: string;
  subscription_status?: string;
  trade_slug?: string;
  stripe_cancel_failed?: boolean; // P26-26D sweep surface (Spec 21 §6)
  offset?: number;
}

function buildDirectoryUrl(args: DirectoryQueryArgs): string {
  const p = new URLSearchParams();
  if (args.q) p.set('q', args.q);
  if (args.preset) p.set('preset', args.preset);
  if (args.subscription_status) p.set('subscription_status', args.subscription_status);
  if (args.trade_slug) p.set('trade_slug', args.trade_slug);
  // Only send when ON — the route enum is 'true'/'false'; omit = no filter.
  if (args.stripe_cancel_failed) p.set('stripe_cancel_failed', 'true');
  if (args.offset) p.set('offset', String(args.offset));
  const qs = p.toString();
  return `/api/admin/users${qs ? `?${qs}` : ''}`;
}

export function useUserDirectory(args: DirectoryQueryArgs): UseQueryResult<DirectoryResult, Error> {
  return useQuery<DirectoryResult, Error>({
    queryKey: [...ADMIN_USERS_KEY, 'directory', args],
    queryFn: async () => {
      const { data, meta } = await getJson<DirectoryRow[]>(buildDirectoryUrl(args));
      const m = (meta ?? {}) as { total?: number; limit?: number; offset?: number };
      return { rows: data, total: m.total ?? 0, limit: m.limit ?? 25, offset: m.offset ?? 0 };
    },
    staleTime: 15_000,
    gcTime: 3_600_000,
  });
}

export function useUserDetail(uid: string | null): UseQueryResult<{ detail: UserDetail; deleted: boolean }, Error> {
  return useQuery<{ detail: UserDetail; deleted: boolean }, Error>({
    queryKey: [...ADMIN_USERS_KEY, 'detail', uid],
    enabled: uid != null && uid.length > 0,
    queryFn: async () => {
      const { data, meta } = await getJson<UserDetail>(`/api/admin/users/${encodeURIComponent(uid!)}`);
      return { detail: data, deleted: Boolean((meta as { deleted?: boolean })?.deleted) };
    },
    staleTime: 10_000,
  });
}

export function useUserMutation(uid: string) {
  const qc = useQueryClient();
  return useMutation<UserDetail, Error, AdminUserMutation>({
    mutationFn: async (mutation) => {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation),
      });
      const json = (await res.json()) as Envelope<UserDetail>;
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `mutation failed (${res.status})`);
      return json.data;
    },
    onMutate: (mutation) => {
      Sentry.addBreadcrumb({ category: 'admin_action', message: `user_${mutation.action}`, data: { target: uid } });
      captureEvent('admin_action_performed', { action: mutation.action, target: 'user_mutation' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...ADMIN_USERS_KEY, 'detail', uid] });
      void qc.invalidateQueries({ queryKey: [...ADMIN_USERS_KEY, 'directory'] });
    },
    onError: (err) => logError('[admin/users/mutation]', err, { uid }),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation<{ user_id: string; password_reset_link: string | null }, Error, CreateUserBody>({
    mutationFn: async (body) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Envelope<{ user_id: string; password_reset_link: string | null }>;
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `create failed (${res.status})`);
      return json.data;
    },
    onMutate: (body) => {
      Sentry.addBreadcrumb({ category: 'admin_action', message: 'user_create', data: { preset: body.account_preset } });
      captureEvent('admin_action_performed', { action: 'create_account', target: 'user', account_preset: body.account_preset });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...ADMIN_USERS_KEY, 'directory'] }),
    onError: (err) => logError('[admin/users/create]', err, {}),
  });
}
