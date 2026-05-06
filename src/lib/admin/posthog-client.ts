// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2 + §4a.2
//
// Thin wrapper around PostHog's Query API for the App Health Dashboard
// aggregator. Three methods:
//   - getEventCount: count of a single event over a time window.
//     Used by lead_save_funnel + paywall_conversion tiles.
//   - getAuthMethodFunnel: per-method auth_method_attempted ÷ succeeded
//     ratio over 7d.
//
// Per Spec 30 §2.6 every external-API call MUST emit its own Sentry
// breadcrumb (`category: 'app_health'`) so tile failures are debuggable.
//
// Per Spec 30 §2.2 each method returns `TileResult<T>` — graceful
// degradation: missing env var, rate limit, upstream 5xx all map to
// `{status: 'unavailable', reason}`.

import * as Sentry from '@sentry/nextjs';
import { logError } from '@/lib/logger';
import type {
  AuthConversion7dPayload,
  LeadSaveFunnel7dPayload,
  PaywallConversion7dPayload,
  TileResult,
} from '@/lib/admin/healthSchema';

const apiKey = process.env.POSTHOG_API_KEY;
const projectId = process.env.POSTHOG_PROJECT_ID;
const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

interface PostHogQueryRequest {
  query: {
    kind: 'HogQLQuery';
    query: string;
  };
}

interface PostHogQueryResponse {
  results?: Array<Array<unknown>>;
}

/**
 * Make an authenticated PostHog Query API call.
 *
 * Failure shapes mirror sentry-client:
 *   - 'env_missing'      — POSTHOG_API_KEY or POSTHOG_PROJECT_ID unset
 *   - 'rate_limited'     — 429
 *   - 'upstream_unavailable' — 5xx
 *   - 'parse_error'      — non-JSON body
 *   - 'network_error'    — fetch threw
 */
async function posthogQuery<T = PostHogQueryResponse>(
  hogQL: string,
  tileName: string,
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  if (!apiKey || !projectId) {
    return { ok: false, reason: 'env_missing' };
  }
  const url = `${host}/api/projects/${projectId}/query/`;
  const body: PostHogQueryRequest = {
    query: { kind: 'HogQLQuery', query: hogQL },
  };
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    Sentry.addBreadcrumb({
      category: 'app_health',
      message: 'posthog_api_call',
      data: {
        tile: tileName,
        status: response.status,
        duration_ms: Date.now() - start,
      },
    });
    if (response.status === 429) return { ok: false, reason: 'rate_limited' };
    if (response.status >= 500)
      return { ok: false, reason: 'upstream_unavailable' };
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    try {
      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch {
      return { ok: false, reason: 'parse_error' };
    }
  } catch (err) {
    logError('[admin/posthog-client]', err, { tile: tileName, stage: 'fetch' });
    return { ok: false, reason: 'network_error' };
  }
}

function projectInsightsLink(): string {
  return projectId
    ? `${host.replace('us.i.', 'us.')}/project/${projectId}/insights`
    : `${host.replace('us.i.', 'us.')}/projects/`;
}

// ---------------------------------------------------------------------------
// Lead save funnel: lead_detail_viewed → lead_saved (7d)
// ---------------------------------------------------------------------------

export async function getLeadSaveFunnel7d(): Promise<
  TileResult<LeadSaveFunnel7dPayload>
> {
  const hogQL = `
    SELECT
      countIf(event = 'lead_detail_viewed') AS viewed,
      countIf(event = 'lead_saved') AS saved
    FROM events
    WHERE timestamp >= now() - INTERVAL 7 DAY
  `;
  const res = await posthogQuery<PostHogQueryResponse>(hogQL, 'lead_save_funnel_7d');
  if (!res.ok) return { status: 'unavailable', reason: res.reason };
  const row = res.data.results?.[0];
  const viewed = toNonNegInt(row?.[0]);
  const saved = toNonNegInt(row?.[1]);
  const ratio = viewed === 0 ? 0 : Math.min(1, saved / viewed);
  return {
    status: 'ok',
    payload: {
      viewed,
      saved,
      ratio,
      posthog_link: projectInsightsLink(),
    },
  };
}

// ---------------------------------------------------------------------------
// Paywall conversion: paywall_shown → subscribe_button_clicked (7d)
// ---------------------------------------------------------------------------

export async function getPaywallConversion7d(): Promise<
  TileResult<PaywallConversion7dPayload>
> {
  const hogQL = `
    SELECT
      countIf(event = 'paywall_shown') AS shown,
      countIf(event = 'subscribe_button_clicked') AS clicked
    FROM events
    WHERE timestamp >= now() - INTERVAL 7 DAY
  `;
  const res = await posthogQuery<PostHogQueryResponse>(hogQL, 'paywall_conversion_7d');
  if (!res.ok) return { status: 'unavailable', reason: res.reason };
  const row = res.data.results?.[0];
  const shown = toNonNegInt(row?.[0]);
  const clicked = toNonNegInt(row?.[1]);
  const ratio = shown === 0 ? 0 : Math.min(1, clicked / shown);
  return {
    status: 'ok',
    payload: {
      shown,
      clicked,
      ratio,
      posthog_link: projectInsightsLink(),
    },
  };
}

// ---------------------------------------------------------------------------
// Auth method conversion: per-method auth_method_attempted → succeeded (7d)
// ---------------------------------------------------------------------------

export async function getAuthMethodFunnel7d(): Promise<
  TileResult<AuthConversion7dPayload>
> {
  const hogQL = `
    SELECT
      properties.method AS method,
      countIf(event = 'auth_method_attempted') AS attempted,
      countIf(event = 'auth_method_succeeded') AS succeeded
    FROM events
    WHERE timestamp >= now() - INTERVAL 7 DAY
      AND properties.method IN ('apple', 'google', 'email', 'phone')
    GROUP BY properties.method
  `;
  const res = await posthogQuery<PostHogQueryResponse>(hogQL, 'auth_conversion_7d');
  if (!res.ok) return { status: 'unavailable', reason: res.reason };
  const rows = res.data.results ?? [];
  // Synthesize all 4 methods even when zero events — UI tiles render
  // the full grid; missing methods would create alignment gaps.
  const ALL_METHODS: Array<'apple' | 'google' | 'email' | 'phone'> = [
    'apple',
    'google',
    'email',
    'phone',
  ];
  const byMethod = new Map<string, { attempted: number; succeeded: number }>();
  for (const row of rows) {
    const method = String(row[0] ?? '');
    const attempted = toNonNegInt(row[1]);
    const succeeded = toNonNegInt(row[2]);
    byMethod.set(method, { attempted, succeeded });
  }
  const per_method = ALL_METHODS.map((method) => {
    const counts = byMethod.get(method) ?? { attempted: 0, succeeded: 0 };
    const ratio =
      counts.attempted === 0 ? 0 : Math.min(1, counts.succeeded / counts.attempted);
    return {
      method,
      attempted: counts.attempted,
      succeeded: counts.succeeded,
      ratio,
    };
  });
  return {
    status: 'ok',
    payload: {
      per_method,
      posthog_link: projectInsightsLink(),
    },
  };
}

function toNonNegInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
