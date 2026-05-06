// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4 + §2.4
//
// Canonical admin uid sentinel. Single source for the synthetic `user_id`
// used by admin-scoped tools that bypass `getCurrentUserContext` — e.g.,
// the Test Feed Tool's synthesised `LeadFeedInput` (Spec 76 §3.2 line 139)
// uses this when constructing a feed query that doesn't require a real
// `user_profiles` entry.
//
// The Flight Center (Spec 76 §3.4) does NOT use this sentinel — it
// reuses `/api/leads/flight-board` which reads the real admin's session
// uid via `getCurrentUserContext`. The sentinel is reserved for the
// "no real user" code paths only.

const DEFAULT_ADMIN_UID = 'admin-test';

/**
 * Resolve the admin sentinel uid. `ADMIN_TEST_UID` env var override is
 * supported so test DBs can seed a different uid without recompiling.
 */
export function getAdminUid(): string {
  return process.env.ADMIN_TEST_UID?.trim() || DEFAULT_ADMIN_UID;
}
