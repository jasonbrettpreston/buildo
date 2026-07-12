// SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §4
// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §3 (payload schema)
//
// CROSS-CONTRACT LOCK (P25 25D) — the dispatcher-payload → mobile-parser seam.
// The Spec 91 seam class: the 2026-07 mobile audit's worst finding was the feed
// emitting `NUM:REV` where the detail endpoint parsed `NUM--REV` — two green
// suites, one dead product loop, because no single test held BOTH sides.
// This test does: it runs the dispatcher's REAL entity_id composition
// (entityIdFromLead, shared module) through the mobile board-detail parser
// logic (`id.split('--')`, [flight-job].tsx:133) and asserts the round-trip,
// then source-pins the mobile side so a parser change reds this file.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const { entityIdFromLead } = require('../../scripts/lib/notification-types');

// The mobile parser logic, verbatim from mobile/app/(app)/[flight-job].tsx:133.
function mobileParse(id: string | undefined): [string | undefined, string | undefined] {
  const [permitNum, revisionNum] = (id ?? '').split('--');
  return [permitNum, revisionNum];
}

describe('notification dispatch → mobile board detail cross-contract', () => {
  it('a dispatcher-composed entity_id round-trips through the mobile parser', () => {
    // Real Toronto permit shapes (spaces + suffix, zero-padded revision).
    const cases: Array<{ leadId: string; permit: string; rev: string }> = [
      { leadId: 'permit:24 123456 BLD:00', permit: '24 123456 BLD', rev: '00' },
      { leadId: 'permit:19 987654 CMB:02', permit: '19 987654 CMB', rev: '02' },
    ];
    for (const c of cases) {
      const entityId = entityIdFromLead(c.leadId, null);
      expect(entityId).toBe(`${c.permit}--${c.rev}`);
      const [permitNum, revisionNum] = mobileParse(entityId as string);
      expect(permitNum).toBe(c.permit);
      expect(revisionNum).toBe(c.rev);
    }
  });

  it('the colon feed-format is NEVER emitted as an entity_id (the dead-loop class)', () => {
    const entityId = entityIdFromLead('permit:24 123456 BLD:00', null);
    expect(entityId).not.toContain(':');
  });

  it('non-permit lead ids fall back to the raw permit_num (no crash, no bogus split)', () => {
    expect(entityIdFromLead('coa:A0123/24TEY', 'A0123/24TEY')).toBe('A0123/24TEY');
    expect(entityIdFromLead(null, null)).toBeNull();
  });

  it('SOURCE PIN — the mobile parser still splits on "--" at the board detail route', () => {
    // If mobile changes its parse contract, this test (holding both sides)
    // must be the thing that reds — not a production push that routes nowhere.
    const mobileSrc = fs.readFileSync(
      path.resolve(__dirname, '../../mobile/app/(app)/[flight-job].tsx'),
      'utf-8',
    );
    expect(mobileSrc).toContain(".split('--')");
  });

  it('SOURCE PIN — the dispatcher emits route_domain flight_board + data.entity_id via entityIdFromLead', () => {
    const dispatchSrc = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/dispatch-notifications.js'),
      'utf-8',
    );
    expect(dispatchSrc).toContain("route_domain: 'flight_board'");
    expect(dispatchSrc).toContain('entity_id: entityIdFromLead(');
  });
});
