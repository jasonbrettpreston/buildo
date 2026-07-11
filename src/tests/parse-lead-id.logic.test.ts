// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3.1 (id-format)
//
// Logic tests for parseLeadId — pins all accepted forms (P21 21A).
// Deliberately covers every form so that adding a new form without adding
// tests here would be visible as a coverage gap.
//
// Accepted forms:
//   Legacy:   NUM--REV          (URL-safe double-dash form used by mobile UI)
//             COA-APP           (uppercase CoA prefix, used by mobile UI)
//   P21 new:  NUM:REV           (feed-emitted: permit_num || ':' || LPAD(rev,2,'0'))
//             permit:NUM:REV    (lead_key / lead_trades canonical form)
//             coa:APP           (feed-emitted CoA: 'coa:' || application_number)

import { describe, expect, it } from 'vitest';
import { parseLeadId } from '@/lib/leads/parse-lead-id';

// ---------------------------------------------------------------------------
// Legacy forms (must remain green — fences must not be altered)
// ---------------------------------------------------------------------------

describe('parseLeadId — legacy NUM--REV form', () => {
  it('parses standard permit id', () => {
    expect(parseLeadId('23-145678-BLD--01')).toEqual({
      kind: 'permit',
      permit_num: '23-145678-BLD',
      revision_num: '01',
    });
  });

  it('parses space-separated Toronto format', () => {
    expect(parseLeadId('23 145678 BLD--01')).toEqual({
      kind: 'permit',
      permit_num: '23 145678 BLD',
      revision_num: '01',
    });
  });

  it('parses zero revision', () => {
    expect(parseLeadId('24-001234--00')).toEqual({
      kind: 'permit',
      permit_num: '24-001234',
      revision_num: '00',
    });
  });

  it('returns null for leading --', () => {
    expect(parseLeadId('--01')).toBeNull();
  });

  it('returns null for trailing --', () => {
    expect(parseLeadId('24-101234--')).toBeNull();
  });
});

describe('parseLeadId — legacy COA-APP form', () => {
  it('parses standard CoA application number', () => {
    expect(parseLeadId('COA-A0123/24EYK')).toEqual({
      kind: 'coa',
      application_number: 'A0123/24EYK',
    });
  });

  it('returns null for empty application_number after COA-', () => {
    expect(parseLeadId('COA-')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P21 new forms (feed-emitted and lead_key)
// ---------------------------------------------------------------------------

describe('parseLeadId — P21 NUM:REV (feed-emitted, no prefix)', () => {
  it('parses dash-separated Toronto permit num', () => {
    expect(parseLeadId('23-145678-BLD:01')).toEqual({
      kind: 'permit',
      permit_num: '23-145678-BLD',
      revision_num: '01',
    });
  });

  it('parses space-separated Toronto permit num', () => {
    expect(parseLeadId('23 145678 BLD:01')).toEqual({
      kind: 'permit',
      permit_num: '23 145678 BLD',
      revision_num: '01',
    });
  });

  it('parses zero revision (LPAD output)', () => {
    expect(parseLeadId('24-001234:00')).toEqual({
      kind: 'permit',
      permit_num: '24-001234',
      revision_num: '00',
    });
  });

  it('returns null when revision_num contains a colon (malformed)', () => {
    expect(parseLeadId('24-001234:00:extra')).toBeNull();
  });

  it('returns null when permit_num is empty (leading colon)', () => {
    expect(parseLeadId(':01')).toBeNull();
  });

  it('returns null when revision_num is empty (trailing colon)', () => {
    expect(parseLeadId('24-001234:')).toBeNull();
  });
});

describe('parseLeadId — P21 permit:NUM:REV (lead_key / lead_trades form)', () => {
  it('parses full lead_key format', () => {
    expect(parseLeadId('permit:23-145678-BLD:01')).toEqual({
      kind: 'permit',
      permit_num: '23-145678-BLD',
      revision_num: '01',
    });
  });

  it('parses space-separated permit_num', () => {
    expect(parseLeadId('permit:23 145678 BLD:01')).toEqual({
      kind: 'permit',
      permit_num: '23 145678 BLD',
      revision_num: '01',
    });
  });

  it('returns null when no colon after permit: prefix', () => {
    expect(parseLeadId('permit:24-001234')).toBeNull();
  });

  it('returns null for empty revision after permit: form', () => {
    expect(parseLeadId('permit:24-001234:')).toBeNull();
  });
});

describe('parseLeadId — P21 coa:APP (feed-emitted, lowercase prefix)', () => {
  it('parses standard application number with slash', () => {
    expect(parseLeadId('coa:A0123/24EYK')).toEqual({
      kind: 'coa',
      application_number: 'A0123/24EYK',
    });
  });

  it('parses simple application number', () => {
    expect(parseLeadId('coa:B1234-56')).toEqual({
      kind: 'coa',
      application_number: 'B1234-56',
    });
  });

  it('returns null for empty application_number after coa:', () => {
    expect(parseLeadId('coa:')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Null / malformed inputs
// ---------------------------------------------------------------------------

describe('parseLeadId — null / malformed', () => {
  it('returns null for null input', () => {
    expect(parseLeadId(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseLeadId(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseLeadId('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseLeadId('   ')).toBeNull();
  });

  it('returns null for single-dash permit_num (ambiguous — not a valid separator)', () => {
    // '24-101234-01' — single dashes are permit_num-internal, not separators
    expect(parseLeadId('24-101234-01')).toBeNull();
  });
});
