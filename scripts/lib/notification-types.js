#!/usr/bin/env node
/**
 * Canonical notification type constants — the ONE source of truth.
 *
 * Before P25 the type strings lived scattered across the sender
 * (classify-lifecycle-phase.js), the queue-writer (update-tracked-projects.js),
 * the mobile toast enum (mobile/src/components/shared/NotificationToast.tsx),
 * and three spec docs — with a documented drift (Spec 92 §6.1 wrote
 * `PHASE_CHANGED`; the code emits `LIFECYCLE_PHASE_CHANGED`). This module is
 * the canonical set. The strings here MUST equal the strings the mobile parser
 * routes on (NotificationToast.tsx `NotificationType`), because those are the
 * values delivered in the Expo push `data.notification_type` field.
 *
 * SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §2
 * SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §6.1
 */
'use strict';

// The three v1 dispatchable types (the "real" consolidated set). These are the
// EXACT strings the mobile app routes + styles on (verified against
// mobile/src/components/shared/NotificationToast.tsx:19-23, 2026-07-11).
const LIFECYCLE_PHASE_CHANGED = 'LIFECYCLE_PHASE_CHANGED';
const LIFECYCLE_STALLED = 'LIFECYCLE_STALLED';
const START_DATE_URGENT = 'START_DATE_URGENT';

// v1.1 / 25F — has a mobile toast style + a (dead) preference, but zero server
// implementation today. Fenced behind its own gate; NOT dispatched in v1.
const NEW_HIGH_VALUE_LEAD = 'NEW_HIGH_VALUE_LEAD';

// CoA alert subtypes (Spec 82 §4). FENCED in v1 — the CoA alert path has a
// pre-existing global-tracker multi-user residual (uniq_tracked_projects_lead_id,
// mig 140) and no mobile CoA card. These file to the CoA-launch WF. Listed here
// so the dispatcher can recognise-and-skip them explicitly rather than treating
// them as unknown.
const COA_HEARING_IMMINENT = 'COA_HEARING_IMMINENT';
const COA_DECISION_RENDERED = 'COA_DECISION_RENDERED';
const COA_STALLED = 'COA_STALLED';

// Spec 82 claimed-state alert subtypes written by update-tracked-projects.js (the
// claimed-lead evaluator). FENCED in v1 (25E #9): they fire only on CLAIMED leads
// and mobile has no claim flow, so ~none are written today. Fencing makes the
// engine recognise-and-skip them explicitly rather than leave them as an
// unrecognised dead-letter class. Doc/contract-only — the dispatcher already
// excludes any non-DISPATCHABLE type via `type = ANY(DISPATCHABLE_TYPES_V1)`.
const STALL_WARNING = 'STALL_WARNING';
const STALL_CLEARED = 'STALL_CLEARED';
const START_IMMINENT = 'START_IMMINENT';

// The set the dispatcher will actually deliver in v1.
const DISPATCHABLE_TYPES_V1 = Object.freeze([
  LIFECYCLE_PHASE_CHANGED,
  LIFECYCLE_STALLED,
  START_DATE_URGENT,
]);

// Fenced / not-yet-dispatchable — recognised, skipped, never sent in v1.
const FENCED_TYPES_V1 = Object.freeze([
  NEW_HIGH_VALUE_LEAD,
  COA_HEARING_IMMINENT,
  COA_DECISION_RENDERED,
  COA_STALLED,
  STALL_WARNING,
  STALL_CLEARED,
  START_IMMINENT,
]);

// type → the user_profiles preference column that gates it. A row whose pref
// column is false is skipped by the dispatcher. (Columns per mig 117.)
const PREF_COLUMN_BY_TYPE = Object.freeze({
  [LIFECYCLE_PHASE_CHANGED]: 'phase_changed',
  [LIFECYCLE_STALLED]: 'lifecycle_stalled_pref',
  [START_DATE_URGENT]: 'start_date_urgent',
  [NEW_HIGH_VALUE_LEAD]: 'new_lead_min_cost_tier', // tier, not boolean — 25F handles
});

// Quiet-hours behaviour per type. Only PHASE_CHANGED respects the user's
// notification_schedule window (matches the pre-P25 sender: STALLED and
// START_DATE_URGENT bypass the schedule gate — Spec 92 §2.2 urgency override).
// `deferrable: true` means an out-of-window row is DEFERRED (valid_until) rather
// than sent immediately.
const SCHEDULE_GATED_TYPES = Object.freeze([LIFECYCLE_PHASE_CHANGED]);

/**
 * lead_id (permit:NUM:REV) → the mobile deep-link entity_id (NUM--REV).
 *
 * CROSS-CONTRACT SEAM (the Spec 91 class): the mobile board detail route parses
 * this with `id.split('--')` (mobile/app/(app)/[flight-job].tsx:133). The feed's
 * colon-format lead ids are NOT valid here — the 2026-07 mobile audit found a
 * dead product loop from exactly this mismatch class (`NUM:REV` emitted where
 * `NUM--REV` was parsed). Locked by notification-dispatch-contract.logic.test.ts.
 * Lives here (not in dispatch-notifications.js) so tests can require it without
 * executing pipeline.run.
 */
function entityIdFromLead(leadId, permitNum) {
  if (typeof leadId === 'string' && leadId.startsWith('permit:')) {
    const parts = leadId.split(':');
    if (parts.length >= 3) return `${parts[1]}--${parts[2]}`;
  }
  return permitNum != null ? String(permitNum) : null;
}

/** True when `type` should be delivered in v1. */
function isDispatchableV1(type) {
  return DISPATCHABLE_TYPES_V1.includes(type);
}

/** True when `type` respects the user's notification_schedule window. */
function isScheduleGated(type) {
  return SCHEDULE_GATED_TYPES.includes(type);
}

module.exports = {
  LIFECYCLE_PHASE_CHANGED,
  LIFECYCLE_STALLED,
  START_DATE_URGENT,
  NEW_HIGH_VALUE_LEAD,
  COA_HEARING_IMMINENT,
  COA_DECISION_RENDERED,
  COA_STALLED,
  STALL_WARNING,
  STALL_CLEARED,
  START_IMMINENT,
  DISPATCHABLE_TYPES_V1,
  FENCED_TYPES_V1,
  PREF_COLUMN_BY_TYPE,
  SCHEDULE_GATED_TYPES,
  entityIdFromLead,
  isDispatchableV1,
  isScheduleGated,
};
