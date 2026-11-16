// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 rules 5-6 (dated note 2026-11-14, MF-47)
//             docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-18 (every string is content; no number typed)
//
// MF-47 (RULED 2026-11-14, C-7: "consent text stored as versioned content"; the final sentence and the wording are operator values) · the consent text
// is a content file with a version. Until the operator names the sentence and the lawyer list clears it, the version MUST read PLACEHOLDER, the final
// sentence MUST be the marked open value, and no price, count or allowance may be typed in the text (every number is a [bracketed] read of a setting
// or of the Stripe price). A real version replaces the file and this test in the same commit (the lock is meant to be edited then, never skipped).
import { describe, it, expect } from 'vitest';
import content from '@/lib/stripe/overage-consent.content.json';

describe('overage consent content (versioned PLACEHOLDER)', () => {
  it('carries a version that says PLACEHOLDER and a status line saying it is not approved', () => {
    expect(content.version).toMatch(/^PLACEHOLDER-v\d+$/);
    expect(content.status).toMatch(/PLACEHOLDER/);
  });
  it('the final sentence is the marked open operator value', () => {
    expect(content.text.endsWith('[OPERATOR: final sentence]')).toBe(true);
  });
  it('no digit and no currency sign is typed in the text: every figure is a bracketed read', () => {
    const outside = content.text.replace(/\[[^\]]*\]/g, '');
    expect(outside).not.toMatch(/[0-9$]/);
    expect(content.text).toMatch(/\[plan allowance\].*\[extra price\].*\[cap\]/);
  });
  it('RED plant: a typed price or count is caught', () => {
    const planted = content.text.replace('[extra price]', '$0.99');
    expect(planted.replace(/\[[^\]]*\]/g, '')).toMatch(/[0-9$]/);
  });
  it('the open items for the lawyer list are written down', () => {
    expect(content.open_for_lawyer_list.length).toBeGreaterThanOrEqual(4);
  });
});
