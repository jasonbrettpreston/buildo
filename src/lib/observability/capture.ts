// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §7a + §13
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
  | 'lead_feed.refresh'
  | 'lead_feed.empty_state_shown';

type EventProperties = Record<string, unknown>;

interface QueuedEvent {
  name: EventName;
  props: EventProperties | undefined;
}

let initialized = false;
let loaded = false;
const queue: QueuedEvent[] = [];

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
  if (!key) return;

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
    // Init failed (network, blocked, etc.) — stay quiet.
  }
}

/**
 * Capture a product event. SSR-safe, error-safe. If PostHog hasn't loaded
 * yet, the event is queued and drained on load.
 */
export function captureEvent(name: EventName, props?: EventProperties): void {
  if (!isBrowser()) return;
  if (!loaded) {
    queue.push({ name, props });
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
