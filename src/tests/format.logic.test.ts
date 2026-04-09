// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.4 + §4.5
//
// Pure unit tests for the Phase 3-iii format helpers. Each helper is the
// security/sanitization boundary between dirty source data (CKAN, WSIB)
// and the DOM, so the unhappy paths matter as much as the happy paths.

import { describe, expect, it } from 'vitest';
import {
  formatAddress,
  formatBuilderInitials,
  formatCostDisplay,
  formatDistance,
  sanitizeTelHref,
  sanitizeWebsite,
} from '@/features/leads/lib/format';

describe('formatDistance', () => {
  it('formats sub-1km distances in meters, rounded', () => {
    expect(formatDistance(0)).toBe('0m');
    expect(formatDistance(347)).toBe('347m');
    expect(formatDistance(347.6)).toBe('348m');
    expect(formatDistance(999)).toBe('999m');
  });

  it('formats >=1km distances in km with one decimal', () => {
    expect(formatDistance(1000)).toBe('1.0km');
    expect(formatDistance(1234)).toBe('1.2km');
    expect(formatDistance(12_345)).toBe('12.3km');
  });

  it('returns null for null/undefined/non-finite/negative input', () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(undefined)).toBeNull();
    expect(formatDistance(Number.NaN)).toBeNull();
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatDistance(-100)).toBeNull();
  });
});

describe('formatAddress', () => {
  it('composes street_num + street_name', () => {
    expect(formatAddress('123', 'King St')).toBe('123 King St');
  });

  it('returns the non-null one alone if only one is present', () => {
    expect(formatAddress('123', null)).toBe('123');
    expect(formatAddress(null, 'King St')).toBe('King St');
  });

  it('returns null when both are null or whitespace', () => {
    expect(formatAddress(null, null)).toBeNull();
    expect(formatAddress('', '')).toBeNull();
    expect(formatAddress('   ', '   ')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(formatAddress('  123 ', '  King St ')).toBe('123 King St');
  });
});

describe('formatCostDisplay', () => {
  it('formats >= $1M with one decimal', () => {
    expect(formatCostDisplay(2_500_000, 'mega')).toBe('$2.5M');
    expect(formatCostDisplay(1_000_000, 'mega')).toBe('$1.0M');
  });

  it('formats >= $1K rounded to thousands', () => {
    expect(formatCostDisplay(750_000, 'large')).toBe('$750K');
    expect(formatCostDisplay(125_500, 'medium')).toBe('$126K');
  });

  it('formats < $1K as raw dollars', () => {
    expect(formatCostDisplay(950, 'small')).toBe('$950');
  });

  it('falls back to humanized tier label when estimated_cost is null', () => {
    expect(formatCostDisplay(null, 'small')).toBe('Small project');
    expect(formatCostDisplay(null, 'medium')).toBe('Medium project');
    expect(formatCostDisplay(null, 'large')).toBe('Large project');
    expect(formatCostDisplay(null, 'major')).toBe('Major project');
    expect(formatCostDisplay(null, 'mega')).toBe('Mega project');
  });

  it('returns null when both are null', () => {
    expect(formatCostDisplay(null, null)).toBeNull();
  });

  it('falls back to tier label when estimated_cost is non-finite or zero', () => {
    expect(formatCostDisplay(0, 'medium')).toBe('Medium project');
    expect(formatCostDisplay(Number.NaN, 'large')).toBe('Large project');
    expect(formatCostDisplay(-100, 'small')).toBe('Small project');
  });

  it('returns null when estimated_cost is invalid AND tier is null', () => {
    expect(formatCostDisplay(0, null)).toBeNull();
    expect(formatCostDisplay(Number.NaN, null)).toBeNull();
  });
});

describe('formatBuilderInitials', () => {
  it('returns first letters of first two words, uppercased', () => {
    expect(formatBuilderInitials('ACME CONSTRUCTION')).toBe('AC');
    expect(formatBuilderInitials('Plumbing Plus Inc')).toBe('PP');
    expect(formatBuilderInitials('plumbing plus')).toBe('PP');
  });

  it('returns single letter for single-word names', () => {
    expect(formatBuilderInitials('Plumbing')).toBe('P');
  });

  it('handles unicode names without crashing', () => {
    expect(formatBuilderInitials('Müller Builders')).toBe('MB');
    expect(formatBuilderInitials('Müller')).toBe('M');
  });

  it('returns "?" for empty / whitespace-only / null / undefined', () => {
    expect(formatBuilderInitials('')).toBe('?');
    expect(formatBuilderInitials('   ')).toBe('?');
    expect(formatBuilderInitials(null)).toBe('?');
    expect(formatBuilderInitials(undefined)).toBe('?');
  });

  it('collapses runs of whitespace between words', () => {
    expect(formatBuilderInitials('ACME    CONSTRUCTION')).toBe('AC');
  });
});

describe('sanitizeWebsite', () => {
  it('accepts http and https URLs', () => {
    expect(sanitizeWebsite('http://acme.example')).toBe('http://acme.example/');
    expect(sanitizeWebsite('https://acme.example/path')).toBe(
      'https://acme.example/path',
    );
  });

  it('REJECTS javascript: URLs (XSS guard)', () => {
    expect(sanitizeWebsite('javascript:alert(1)')).toBeNull();
    expect(sanitizeWebsite('  javascript:alert(1)  ')).toBeNull();
  });

  it('REJECTS data: URLs', () => {
    expect(sanitizeWebsite('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('REJECTS file: URLs', () => {
    expect(sanitizeWebsite('file:///etc/passwd')).toBeNull();
  });

  it('REJECTS mailto: URLs', () => {
    expect(sanitizeWebsite('mailto:foo@bar.example')).toBeNull();
  });

  it('REJECTS unparseable strings', () => {
    expect(sanitizeWebsite('not a url')).toBeNull();
    expect(sanitizeWebsite('//acme.example')).toBeNull(); // bare protocol-relative
  });

  it('returns null for empty / whitespace / null / undefined', () => {
    expect(sanitizeWebsite('')).toBeNull();
    expect(sanitizeWebsite('   ')).toBeNull();
    expect(sanitizeWebsite(null)).toBeNull();
    expect(sanitizeWebsite(undefined)).toBeNull();
  });
});

describe('sanitizeTelHref', () => {
  it('strips parens, spaces, and dashes from a North American number', () => {
    expect(sanitizeTelHref('(416) 555-1234')).toBe('4165551234');
  });

  it('strips extensions BEFORE digit pass (Gemini 2026-04-09 — was concatenating ext digits into the number)', () => {
    // Common extension markers — anything after them is dropped, NOT
    // concatenated into the number. tel: URI has no portable
    // extension syntax so the extension is unrecoverable; better to
    // dial the main line than a junk concatenation.
    expect(sanitizeTelHref('+1 416 555-1234 x99')).toBe('+14165551234');
    expect(sanitizeTelHref('(416) 555-1234 ext 99')).toBe('4165551234');
    expect(sanitizeTelHref('(416) 555-1234 ext. 99')).toBe('4165551234');
    expect(sanitizeTelHref('416-555-1234 #99')).toBe('4165551234');
    expect(sanitizeTelHref('416-555-1234, 99')).toBe('4165551234');
  });

  it('preserves a leading + on international numbers without extensions', () => {
    expect(sanitizeTelHref('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('returns null for vanity numbers that strip below the 10-digit floor', () => {
    // Letter-stripping is intentional, but the 10-digit floor (spec §9)
    // catches the post-strip remnants — "555-CALL-NOW" → "555" → null
    // (3 digits, below floor) → Call button disabled. Better than
    // dialing "555".
    expect(sanitizeTelHref('555-CALL-NOW')).toBeNull();
  });

  it('returns null for all-letter input', () => {
    expect(sanitizeTelHref('CALL US')).toBeNull();
  });

  it('returns null for digit strings below the 10-digit floor (spec §9)', () => {
    expect(sanitizeTelHref('555-1234')).toBeNull(); // 7 digits, too short
    expect(sanitizeTelHref('123456789')).toBeNull(); // 9 digits, too short
  });

  it('clamps overflows to E.164 max (15 digits, spec §9)', () => {
    // A corrupted WSIB row with 19 digits gets clamped to 15. The
    // result is still rendered (not nulled) because it's within the
    // valid window post-clamp.
    expect(sanitizeTelHref('1234567890123456789')).toBe('123456789012345');
  });

  it('returns null for empty / null / undefined', () => {
    expect(sanitizeTelHref('')).toBeNull();
    expect(sanitizeTelHref(null)).toBeNull();
    expect(sanitizeTelHref(undefined)).toBeNull();
  });
});
