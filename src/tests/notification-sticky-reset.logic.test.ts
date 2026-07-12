// 🔗 SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §4 (state-change memory)
// 🔗 SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §2 (25-FOLD: sticky-flag reset)
//
// P25 25E — sticky-flag RESET lock (source altitude, the level this whole-table
// script is tested at repo-wide — see update-tracked-projects.infra.test.ts).
//
// The 25-FOLD requires the "memory" flags (last_notified_stalled /
// last_notified_urgency) to be CLEARED when the condition clears, else a stuck
// flag permanently silences a user/lead pair. The reset PATH exists on BOTH the
// permit branch (B3 stall-clear, B5 urgency-reset) and the CoA branch, guarded
// IS DISTINCT FROM for idempotency. This lock pins the actual RESET WRITES
// (not just the detection branch) so a future "clean rebuild" of the alert loop
// cannot silently drop the flag-clearing — the Chesterton's-Fence failure mode.
//
// Behavioral note (honest): an end-to-end run of update-tracked-projects.js is
// NOT used here for two independent reasons, both documented in the 25E report:
//   (1) a PRE-EXISTING (mig 141, not P25) bug — the lead_analytics sync INSERT
//       omits the NOT-NULL lead_id; Postgres checks NOT NULL BEFORE the
//       ON CONFLICT redirect, so the step throws on ANY non-empty
//       tracked_projects (masked in dev because the table is normally empty);
//   (2) the script is a WHOLE-TABLE mutator — running it in the shared-DB
//       integration suite would archive other test files' rows (hermeticity).
// The reset DECISION branches are already source-locked in
// update-tracked-projects.infra.test.ts:62-77; this file adds the reset-VALUE
// and idempotency-guard locks.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/update-tracked-projects.js'),
  'utf-8',
);

describe('update-tracked-projects — sticky-flag reset writes (P25 25E / Spec 82 §4)', () => {
  it('permit branch B3 clears last_notified_stalled → false on recovery', () => {
    // Condition (detection) + the reset WRITE must both be present.
    expect(SRC).toMatch(/lifecycle_stalled === false && row\.last_notified_stalled === true/);
    expect(SRC).toMatch(/last_notified_stalled:\s*false/);
  });

  it('permit branch B5 clears last_notified_urgency → null when urgency recedes from imminent', () => {
    expect(SRC).toMatch(/row\.last_notified_urgency === 'imminent' && row\.urgency !== 'imminent'/);
    expect(SRC).toMatch(/last_notified_urgency:\s*null/);
  });

  it('CoA branch mirrors both resets (fullyRecovered → stalled false; not-imminent → urgency null)', () => {
    expect(SRC).toMatch(/fullyRecovered && row\.last_notified_stalled === true/);
    expect(SRC).toMatch(/row\.last_notified_urgency === 'imminent' && !inImminentWindow/);
  });

  it('the reset UPDATEs are IS DISTINCT FROM-guarded (idempotent — no rewrite churn)', () => {
    // The guard is what makes a reset write actually land AND makes a re-run a no-op.
    expect(SRC).toMatch(/last_notified_stalled IS DISTINCT FROM false/);
    expect(SRC).toMatch(/last_notified_urgency IS DISTINCT FROM 'imminent'/);
  });
});
