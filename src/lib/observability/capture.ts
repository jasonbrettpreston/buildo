// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §7a + §13
//
// PostHog wrapper for product telemetry. Designed so callers never crash:
// every public function is SSR-safe (no-op when window is undefined) and
// swallows internal errors silently.
//
// Events fired before initObservability() resolves are queued and drained
// once PostHog finishes loading.

import posthog from 'posthog-js';

/** Type-safe event name union — extend as new events are added. */
export type EventName =
  | 'lead_feed.viewed'
  | 'lead_feed.lead_clicked'
  | 'lead_feed.lead_saved'
  | 'lead_feed.lead_unsaved'
  | 'lead_feed.lead_save_failed'
  | 'lead_feed.builder_called'
  | 'lead_feed.builder_emailed'
  | 'lead_feed.builder_website_opened'
  | 'lead_feed.directions_opened'
  | 'lead_feed.filter_changed'
  | 'lead_feed.filter_sheet_opened'
  | 'lead_feed.refresh'
  | 'lead_feed.empty_state_shown'
  // Phase 3-vi observability sibling: silent-failure visibility events.
  // These fire from non-user-driven code paths so engineering can see
  // failure modes that the user never explicitly triggered.
  | 'lead_feed.persisted_state_recovered'
  | 'lead_feed.geolocation_query_failed'
  | 'lead_feed.client_error'
  // Phase 6 step 1: LeadMapPane marker interactions. `position` is the
  // index of the marker's lead in the feed list (bounded cardinality)
  // — the lead_id is intentionally NOT a property to keep PostHog
  // event property cardinality bounded and to avoid tying named users
  // to specific permit/property activity beyond what we already do for
  // lead_clicked. The hover variant is sampled (ref-deduped per
  // (lead_type, marker) pair) at the call site so it doesn't blow up
  // event volume on mousemove storms.
  | 'lead_feed.map_marker_clicked'
  | 'lead_feed.map_marker_hovered'
  | 'lead_feed.map_unavailable'
  // Phase 6 step 2: map pan refetch + click-to-deselect.
  // map_panned fires once per debounced pan that exceeds the 500m snap
  // threshold (naturally deduplicated by the debounce timer + threshold
  // gate). map_deselected fires when the user clicks the map background
  // to clear the selected marker.
  | 'lead_feed.map_panned'
  | 'lead_feed.map_deselected'
  // Admin Control Panel (Spec 86) — operator gravity-config events
  | 'admin_gravity_adjusted'
  | 'admin_gravity_discarded'
  | 'admin_gravity_save_failed'
  | 'admin_pipeline_resync_triggered';

type EventProperties = Record<string, unknown>;

interface QueuedEvent {
  name: EventName;
  props: EventProperties | undefined;
}

let initialized = false;
let loaded = false;
let initFailed = false;
const queue: QueuedEvent[] = [];

// Cap the queue to prevent unbounded memory growth in two scenarios:
//   1. PostHog init throws (ad blocker, network failure, blocked
//      domain) and the `loaded` callback never fires. Without a cap,
//      every captureEvent for the entire session would queue forever.
//   2. PostHog init succeeds but `loaded` is delayed by network
//      latency, AND the page generates a burst of telemetry events
//      faster than the load can complete.
// 100 events is enough to capture the relevant pre-load activity
// (page mount + a handful of user interactions) without becoming a
// memory leak. Older events are dropped on overflow — the recent
// ones are more diagnostically valuable. Caught by Gemini holistic
// review of the Phase 3-vi observability sibling.
const MAX_QUEUE_SIZE = 100;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Initialize PostHog. Safe to call multiple times — only the first call
 * actually runs init. SSR-safe (no-op without window).
 */
export function initObservability(): void {
  if (initialized || !isBrowser()) return;
  initialized = true;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
  if (!key) {
    // No PostHog key configured — mark init as failed so future
    // captureEvents don't queue indefinitely.
    initFailed = true;
    queue.length = 0;
    return;
  }

  try {
    posthog.init(key, {
      api_host: host,
      capture_pageview: true,
      capture_pageleave: true,
      loaded: () => {
        loaded = true;
        // Drain anything captured before posthog finished loading.
        while (queue.length > 0) {
          const evt = queue.shift();
          if (!evt) break;
          try {
            posthog.capture(evt.name, evt.props);
          } catch {
            // Swallow — never crash on telemetry.
          }
        }
      },
    });
  } catch {
    // Init failed (network, blocked, etc.) — mark as failed and
    // drop the queue so the queue doesn't grow unbounded for the
    // rest of the session. Subsequent captureEvent calls will
    // see initFailed and become a no-op.
    initFailed = true;
    queue.length = 0;
  }
}

/**
 * Capture a product event. SSR-safe, error-safe. If PostHog hasn't loaded
 * yet, the event is queued and drained on load (capped at MAX_QUEUE_SIZE
 * to bound memory growth — older events are dropped on overflow).
 * If init failed permanently, becomes a no-op.
 */
export function captureEvent(name: EventName, props?: EventProperties): void {
  if (!isBrowser()) return;
  if (initFailed) return; // No-op after permanent init failure.
  if (!loaded) {
    queue.push({ name, props });
    // Drop oldest events on overflow.
    if (queue.length > MAX_QUEUE_SIZE) {
      queue.shift();
    }
    return;
  }
  try {
    posthog.capture(name, props);
  } catch {
    // Swallow.
  }
}

/**
 * Identify the current user with PostHog. SSR-safe, error-safe.
 */
export function identifyUser(uid: string, traits?: EventProperties): void {
  if (!isBrowser()) return;
  try {
    posthog.identify(uid, traits);
  } catch {
    // Swallow.
  }
}

/**
 * Check whether a feature flag is enabled. Returns false on SSR or error.
 */
export function isFeatureEnabled(flag: string): boolean {
  if (!isBrowser()) return false;
  try {
    return posthog.isFeatureEnabled(flag) === true;
  } catch {
    return false;
  }
}
