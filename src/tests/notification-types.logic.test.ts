// SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §2 (canonical type constants)
// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §6.1
//
// The canonical notification-type module is the single source of truth. These
// tests pin it against (a) the EXACT strings the mobile parser routes/styles on,
// (b) the v1 dispatchable/fenced partition, and (c) the pref-column + schedule
// contract the dispatcher relies on. A drift here is the class of bug that
// silenced NEW_HIGH_VALUE_LEAD and split PHASE_CHANGED across two spellings.

import { describe, it, expect } from 'vitest';

const NOTIF = require('../../scripts/lib/notification-types');

describe('notification-types — canonical constants', () => {
  it('the three v1 types equal the mobile-routed strings', () => {
    // These are the values mobile/src/components/shared/NotificationToast.tsx
    // routes + styles on (verified 2026-07-11). The dispatcher emits these into
    // Expo `data.notification_type`; a mismatch = a notification the app cannot
    // style or route.
    expect(NOTIF.LIFECYCLE_PHASE_CHANGED).toBe('LIFECYCLE_PHASE_CHANGED');
    expect(NOTIF.LIFECYCLE_STALLED).toBe('LIFECYCLE_STALLED');
    expect(NOTIF.START_DATE_URGENT).toBe('START_DATE_URGENT');
    expect(NOTIF.NEW_HIGH_VALUE_LEAD).toBe('NEW_HIGH_VALUE_LEAD');
  });

  it('DISPATCHABLE_TYPES_V1 is exactly the three lifecycle types', () => {
    expect([...NOTIF.DISPATCHABLE_TYPES_V1].sort()).toEqual(
      ['LIFECYCLE_PHASE_CHANGED', 'LIFECYCLE_STALLED', 'START_DATE_URGENT'].sort(),
    );
  });

  it('NEW_HIGH_VALUE_LEAD + all COA_* types are FENCED in v1 (never dispatched)', () => {
    expect(NOTIF.isDispatchableV1('NEW_HIGH_VALUE_LEAD')).toBe(false);
    expect(NOTIF.isDispatchableV1('COA_HEARING_IMMINENT')).toBe(false);
    expect(NOTIF.isDispatchableV1('COA_DECISION_RENDERED')).toBe(false);
    expect(NOTIF.isDispatchableV1('COA_STALLED')).toBe(false);
    for (const t of NOTIF.DISPATCHABLE_TYPES_V1) {
      expect(NOTIF.FENCED_TYPES_V1).not.toContain(t);
    }
  });

  it('each dispatchable type maps to a user_profiles pref column', () => {
    expect(NOTIF.PREF_COLUMN_BY_TYPE.LIFECYCLE_PHASE_CHANGED).toBe('phase_changed');
    expect(NOTIF.PREF_COLUMN_BY_TYPE.LIFECYCLE_STALLED).toBe('lifecycle_stalled_pref');
    expect(NOTIF.PREF_COLUMN_BY_TYPE.START_DATE_URGENT).toBe('start_date_urgent');
  });

  it('only PHASE_CHANGED is schedule-gated (STALLED + URGENT bypass the window)', () => {
    // Preserves the pre-P25 sender contract: stall + urgent alerts deliver
    // immediately (Spec 92 §2.2 urgency override); phase changes respect the
    // notification_schedule window.
    expect(NOTIF.isScheduleGated('LIFECYCLE_PHASE_CHANGED')).toBe(true);
    expect(NOTIF.isScheduleGated('LIFECYCLE_STALLED')).toBe(false);
    expect(NOTIF.isScheduleGated('START_DATE_URGENT')).toBe(false);
  });
});
