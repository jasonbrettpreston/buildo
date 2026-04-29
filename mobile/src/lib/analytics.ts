// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §11
//
// PostHog product telemetry — funnel events for the mobile app.
// Spec 90 §11 mandates PII stripping, so all event payloads pass through a
// whitelist (`ALLOWED_KEYS`) that drops any key not enumerated in the funnel
// catalogue documented in the WF3 active task. Email, phone number,
// displayName, idToken etc. cannot leak into PostHog regardless of how a
// caller composes the props object.
//
// Identity: Firebase `uid` is used as PostHog `distinctId` via `identifyUser`.
// The uid is an opaque server-generated token (not personally identifying on
// its own). User properties on `identify` are limited to `{ first_seen_at }`.
import PostHog from 'posthog-react-native';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

// Lazy singleton — only constructed if the API key is set so local dev
// without a PostHog project is silent rather than throwing on every event.
let client: PostHog | null = null;
function getClient(): PostHog | null {
  if (!apiKey) return null;
  if (client) return client;
  try {
    client = new PostHog(apiKey, { host, captureAppLifecycleEvents: false });
    return client;
  } catch {
    return null;
  }
}

// Whitelist of allowed event property keys — any unlisted key is dropped.
// Exhaustive list mirrors the funnel catalogue in the WF3 active task.
const ALLOWED_KEYS = new Set([
  'screen',
  'method',
  'code',
  'existing_method',
  'new_method',
  'first_seen_at',
] as const);

type AllowedKey = 'screen' | 'method' | 'code' | 'existing_method' | 'new_method' | 'first_seen_at';
type EventValue = string | number | boolean | null;
type EventProps = Partial<Record<AllowedKey, EventValue>>;

function stripPii(props: Record<string, unknown> | undefined): EventProps {
  if (!props) return {};
  const safe: EventProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (ALLOWED_KEYS.has(key as AllowedKey)) {
      safe[key as AllowedKey] = value as EventValue;
    } else if (__DEV__) {
      // Dev-only signal so a developer accidentally logging PII gets immediate
      // feedback. In production this is silent — the key is just dropped.
      // eslint-disable-next-line no-console
      console.warn(`[analytics] dropped non-whitelisted key "${key}" from event payload`);
    }
  }
  return safe;
}

export function track(eventName: string, props?: Record<string, unknown>): void {
  const c = getClient();
  if (!c) return;
  try {
    c.capture(eventName, stripPii(props));
  } catch {
    // Telemetry failure is intentionally silent — a broken capture call must
    // never crash an auth flow or surface to the user.
  }
}

// Tracks the uid we have already identified in this PostHog session so a
// second `identifyUser(sameUid)` call (which fires on every Firebase token
// refresh and cold boot via onAuthStateChanged) does NOT overwrite the
// `first_seen_at` user property. PostHog's `identify` is upsert semantics —
// resending it with a new timestamp would destroy the cohort data §11
// intends to capture. `resetIdentity()` clears this so a different user
// signing in on the same device re-runs the full identify path.
let identifiedUid: string | null = null;

export function identifyUser(uid: string): void {
  const c = getClient();
  if (!c) return;
  if (identifiedUid === uid) return;
  try {
    c.identify(uid, { first_seen_at: new Date().toISOString() });
    identifiedUid = uid;
  } catch {
    /* non-fatal */
  }
}

export function resetIdentity(): void {
  const c = getClient();
  if (!c) return;
  try {
    c.reset();
    identifiedUid = null;
  } catch {
    /* non-fatal */
  }
}

// Test-only hook so analytics.test.ts can reset the singleton between cases.
// Not exported in production builds — the import path is suppressed by Metro
// because no production code imports `__resetForTests`.
export function __resetForTests(): void {
  client = null;
  identifiedUid = null;
}
