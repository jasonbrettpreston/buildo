// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector deep-link)
//
// formatLeadIdForUrl — inverse of parseLeadId; produces the Lead Detail Inspector URL id
// from a step-output row, or null when the row has no lead identity.

import { describe, expect, it } from 'vitest';
import { formatLeadIdForUrl } from '@/lib/leads/format-lead-id';
import { parseLeadId } from '@/lib/leads/parse-lead-id';

describe('formatLeadIdForUrl', () => {
  it('permit-keyed row (permit_num + revision_num) → `num--rev`', () => {
    expect(formatLeadIdForUrl({ permit_num: '23-145678-BLD', revision_num: '00', trade_id: 8 }))
      .toBe('23-145678-BLD--00');
  });

  it('lead_trades colon lead_id → URL form (keeps the 2-digit rev)', () => {
    expect(formatLeadIdForUrl({ lead_id: 'permit:23-145678-BLD:00', trade_id: 3 }))
      .toBe('23-145678-BLD--00');
    expect(formatLeadIdForUrl({ lead_id: 'coa:A0123/24EYK' })).toBe('COA-A0123/24EYK');
  });

  it('coa_applications row (application_number) → `COA-<app>`', () => {
    expect(formatLeadIdForUrl({ application_number: 'A0123/24', status: 'open' })).toBe('COA-A0123/24');
  });

  it('returns null for rows with no lead identity (geo/enrichment tables)', () => {
    expect(formatLeadIdForUrl({ id: 5, centroid_lat: 43.6, centroid_lng: -79.4 })).toBeNull();
    expect(formatLeadIdForUrl({})).toBeNull();
  });

  it('round-trips through parseLeadId (the URL form it produces is parseable)', () => {
    const url = formatLeadIdForUrl({ permit_num: '23-1-BLD', revision_num: '00' });
    expect(url).not.toBeNull();
    const parsed = parseLeadId(url);
    expect(parsed).toEqual({ kind: 'permit', permit_num: '23-1-BLD', revision_num: '00' });

    const coaUrl = formatLeadIdForUrl({ lead_id: 'coa:A99/24' });
    expect(parseLeadId(coaUrl)).toEqual({ kind: 'coa', application_number: 'A99/24' });
  });
});
