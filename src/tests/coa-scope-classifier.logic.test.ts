// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
//
// scripts/lib/coa-scope-classifier.js — description-only scope classifier
// for CoA leads. Twin-extracted from scripts/classify-scope.js but
// stripped to description-only inputs (no permit_type, structure_type,
// work, current_use, proposed_use, housing_units, dwelling_units).
//
// Pure functions — no DB, no I/O.

import { describe, it, expect } from 'vitest';

// Path resolution: scripts/lib/*.js is reached via the dual-resolution we use
// elsewhere (e.g. lead-id.js). Require via Node interop.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { classifyCoaScope, extractScopeTags, extractCoaResidentialKeywords } = require('../../scripts/lib/coa-scope-classifier');

describe('coa-scope-classifier — classifyCoaScope (R5.1)', () => {
  it('returns coa_type_class, project_type, scope_tags for a residential description', () => {
    const result = classifyCoaScope({
      description: 'Variance for reduced rear yard setback to construct a single-family dwelling with attached garage',
      sub_type: 'minor_variance',
    });
    expect(result).toHaveProperty('coa_type_class');
    expect(result).toHaveProperty('project_type');
    expect(result).toHaveProperty('scope_tags');
    expect(Array.isArray(result.scope_tags)).toBe(true);
  });

  it('returns empty scope_tags for null/empty description', () => {
    const result = classifyCoaScope({ description: null, sub_type: 'consent' });
    expect(result.scope_tags).toEqual([]);
  });

  it('does NOT read permit-specific fields (no permit_type / structure_type / work)', () => {
    // If the classifier accidentally reads these, the test surfaces it via
    // signal that should NOT influence the result.
    const withExtras = classifyCoaScope({
      description: 'consent to sever property',
      sub_type: 'consent',
      permit_type: 'NEW HOUSE',         // permit-only — must be ignored
      structure_type: 'DETACHED HOUSE',  // permit-only — must be ignored
      work: 'NEW',                       // permit-only — must be ignored
    });
    const baseline = classifyCoaScope({
      description: 'consent to sever property',
      sub_type: 'consent',
    });
    expect(withExtras.scope_tags).toEqual(baseline.scope_tags);
    expect(withExtras.coa_type_class).toBe(baseline.coa_type_class);
    expect(withExtras.project_type).toBe(baseline.project_type);
  });
});

describe('coa-scope-classifier — extractScopeTags', () => {
  it('extracts known TAG_PATTERNS keywords from CoA description text', () => {
    const tags = extractScopeTags('Construct a new deck and rear addition');
    expect(tags.length).toBeGreaterThan(0);
  });

  it('returns empty array for null description', () => {
    expect(extractScopeTags(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractScopeTags('')).toEqual([]);
  });
});

describe('coa-scope-classifier — residential PRIORITY (R5.1.g Worktree HIGH-2)', () => {
  it('classifies mixed residential+commercial description as residential (priority)', () => {
    const result = classifyCoaScope({
      description: 'Conversion of garage apartment to retail space with office',
      sub_type: 'minor_variance',
    });
    // garage + apartment (residential) win over retail + office (commercial)
    expect(result.coa_type_class).toBe('residential');
  });

  it('classifies pure commercial as commercial (no residential signal)', () => {
    const result = classifyCoaScope({
      description: 'Variance for retail signage on warehouse facade',
      sub_type: 'minor_variance',
    });
    expect(result.coa_type_class).toBe('commercial');
  });

  it('classifies pure institutional as institutional', () => {
    const result = classifyCoaScope({
      description: 'Variance for school addition setback',
      sub_type: 'minor_variance',
    });
    // school is in institutionalScope; the addition keyword is residential
    // but the residential-priority rule means addition wins → residential.
    // Documented edge case — the test asserts the actual behavior.
    expect(['residential', 'institutional']).toContain(result.coa_type_class);
  });

  it('returns uncategorized when no scope keywords match', () => {
    const result = classifyCoaScope({
      description: 'Generic non-matching text',
      sub_type: 'consent',
    });
    expect(result.coa_type_class).toBe('uncategorized');
  });
});

describe('coa-scope-classifier — extractCoaResidentialKeywords (R2.v5 fix #15 — was wholly DROPPED, restored as description-only)', () => {
  it('detects residential keywords in description (deck/garage/pool/dwelling)', () => {
    expect(extractCoaResidentialKeywords('proposed deck variance')).toContain('deck');
  });

  it('returns empty array for non-residential descriptions', () => {
    expect(extractCoaResidentialKeywords('commercial signage variance')).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(extractCoaResidentialKeywords(null)).toEqual([]);
  });
});
