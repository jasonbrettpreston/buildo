// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §11
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §7
//
// Server-side admin telemetry. Mirror of `mobile/src/lib/analytics.ts` shape:
// strict PII whitelist (`ALLOWED_KEYS`) — any unlisted property key is
// dropped, with a DEV-mode `console.warn` to surface the leak attempt to
// the developer.
//
// Why raw `fetch` instead of `posthog-node` SDK?
//   The SDK adds a dep + bundle weight for what is a single POST per event.
//   PostHog's capture endpoint accepts the same `{ api_key, event,
//   distinct_id, properties }` shape over plain HTTPS. Cleaner; no SDK
//   version drift; one less package to audit.
//
// Spec 33 §11 mandates that EVERY state-mutating admin action emits
// `track('admin_action_performed', { action, target })`. Spec 35 §B3
// mandates the same call from inside every B3 mutation's `onMutate` /
// `onSettled` flow. This module is the canonical implementation site.
//
// Failure semantics: telemetry MUST NOT crash an admin route. All
// failure paths (no API key, network error, JSON parse error from
// PostHog) silently no-op + log to Sentry as a breadcrumb. The admin
// action itself proceeds regardless.

import { logError } from '@/lib/logger';

const apiKey = process.env.POSTHOG_API_KEY;
const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

/**
 * Whitelist of allowed event property keys. Any key not in this set is
 * dropped before the event fires. Mirror of mobile `ALLOWED_KEYS` for
 * cross-platform consistency.
 *
 * Spec 33 §11 + Spec 35 §7 admin event keys:
 *   - `action` — the verb (e.g., 'config_committed', 'user_extended_trial')
 *   - `target` — the noun (e.g., 'logic_variables', 'user:abc123')
 *   - `keys_changed` — for config edits, the list of keys touched
 *   - `admin_uid_hashed` — hashed admin uid (NOT raw uid; PostHog has
 *     broader access than Sentry, so Spec 35 §7.3 mandates hashing)
 *   - `auth_method` — 'session' / 'admin_key' / 'dev_bypass'
 *   - `reason` — failure cause when applicable
 *   - `duration_ms` — admin action latency
 *   - `result` — 'ok' / 'error' (admin_action result)
 */
const ALLOWED_KEYS = new Set([
  'action',
  'target',
  'keys_changed',
  'admin_uid_hashed',
  'auth_method',
  'reason',
  'duration_ms',
  'result',
] as const);

type AllowedKey =
  | 'action'
  | 'target'
  | 'keys_changed'
  | 'admin_uid_hashed'
  | 'auth_method'
  | 'reason'
  | 'duration_ms'
  | 'result';

type EventValue = string | number | boolean | string[] | null;
export type AdminEventProps = Partial<Record<AllowedKey, EventValue>>;

/**
 * Strip non-whitelisted keys from event properties. DEV mode surfaces
 * dropped keys via `console.warn` so a developer accidentally sending
 * PII gets immediate feedback. Production silently drops.
 */
export function stripPii(
  props: Record<string, unknown> | undefined,
): AdminEventProps {
  if (!props) return {};
  const safe: AdminEventProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (ALLOWED_KEYS.has(key as AllowedKey)) {
      safe[key as AllowedKey] = value as EventValue;
    } else if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(
        `[admin/analytics] dropped non-whitelisted key "${key}" from event payload`,
      );
    }
  }
  return safe;
}

/**
 * Capture a server-side admin event. Fire-and-forget; the returned
 * promise resolves once the POST completes but callers don't need to
 * `await` — telemetry MUST NOT block admin actions.
 *
 * @param distinctId Caller-supplied opaque identifier. For admin events
 *                   per Spec 35 §7.3 this should be `admin_uid_hashed`,
 *                   NOT the raw uid (PostHog has broader access than
 *                   Sentry's per-org auth).
 * @param eventName  PostHog event name. Spec 33 §11 enumerates the
 *                   admin event catalogue: `admin_session_started`,
 *                   `admin_action_performed`, `admin_config_committed`,
 *                   etc.
 * @param props      Event properties. Non-whitelisted keys dropped.
 */
export async function track(
  distinctId: string,
  eventName: string,
  props?: Record<string, unknown>,
): Promise<void> {
  if (!apiKey) return;
  try {
    const safeProps = stripPii(props);
    const response = await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: eventName,
        distinct_id: distinctId,
        properties: safeProps,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      logError(
        '[admin/analytics]',
        new Error(`PostHog capture failed: ${response.status}`),
        { event: eventName, status: response.status },
      );
    }
  } catch (err) {
    // Network failure / fetch throws / JSON parse error. Telemetry
    // failure is intentionally silent at the API surface — surface only
    // to Sentry so the admin route's response shape is unaffected.
    logError('[admin/analytics]', err, {
      stage: 'capture',
      event: eventName,
    });
  }
}
