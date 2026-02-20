// SPEC LINK: docs/specs/11_builder_enrichment.md
import { describe, it, expect } from 'vitest';
import { createMockBuilder } from './factories';

// Import normalize once the module exists
// Using inline implementations to test the logic patterns

describe('Builder Name Normalization', () => {
  function normalizeBuilderName(name: string): string {
    let normalized = name.toUpperCase().trim();
    // Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, ' ');
    // Remove common suffixes
    const suffixes = [
      'INCORPORATED',
      'CORPORATION',
      'LIMITED',
      'INC\\.?',
      'CORP\\.?',
      'LTD\\.?',
      'CO\\.?',
      'L\\.?P\\.?',
      'LP',
      'LLC',
    ];
    const suffixPattern = new RegExp(
      `\\s*\\b(${suffixes.join('|')})\\s*$`,
      'i'
    );
    normalized = normalized.replace(suffixPattern, '').trim();
    // Remove trailing punctuation
    normalized = normalized.replace(/[.,;]+$/, '').trim();
    return normalized;
  }

  function isIncorporated(name: string): boolean {
    const patterns = /\b(INC|LTD|CORP|CORPORATION|INCORPORATED|LIMITED|LLC|L\.?P\.?)\b/i;
    return patterns.test(name);
  }

  it('uppercases and trims whitespace', () => {
    expect(normalizeBuilderName('  abc builders  ')).toBe('ABC BUILDERS');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeBuilderName('SMITH   &   SONS')).toBe('SMITH & SONS');
  });

  it('strips INC suffix', () => {
    expect(normalizeBuilderName('ACME CONSTRUCTION INC')).toBe('ACME CONSTRUCTION');
  });

  it('strips LTD suffix', () => {
    expect(normalizeBuilderName('MAPLE BUILDERS LTD.')).toBe('MAPLE BUILDERS');
  });

  it('strips CORP suffix', () => {
    expect(normalizeBuilderName('ELITE HOMES CORP')).toBe('ELITE HOMES');
  });

  it('strips INCORPORATED suffix', () => {
    expect(normalizeBuilderName('FOUNDATION CORP INCORPORATED')).toBe('FOUNDATION CORP');
  });

  it('strips LIMITED suffix', () => {
    expect(normalizeBuilderName('URBAN DESIGN LIMITED')).toBe('URBAN DESIGN');
  });

  it('handles names with no suffix', () => {
    expect(normalizeBuilderName('BOB THE BUILDER')).toBe('BOB THE BUILDER');
  });

  it('isIncorporated detects INC', () => {
    expect(isIncorporated('ACME INC')).toBe(true);
  });

  it('isIncorporated detects LTD', () => {
    expect(isIncorporated('MAPLE LTD.')).toBe(true);
  });

  it('isIncorporated returns false for plain names', () => {
    expect(isIncorporated('BOB THE BUILDER')).toBe(false);
  });
});

describe('Builder Factory', () => {
  it('creates a builder with defaults', () => {
    const builder = createMockBuilder();
    expect(builder.name).toBe('ACME CONSTRUCTION INC');
    expect(builder.name_normalized).toBe('ACME CONSTRUCTION');
    expect(builder.permit_count).toBe(12);
    expect(builder.enriched_at).toBeNull();
  });

  it('allows overrides', () => {
    const builder = createMockBuilder({
      name: 'TEST BUILDER',
      google_rating: 4.8,
      permit_count: 50,
    });
    expect(builder.name).toBe('TEST BUILDER');
    expect(builder.google_rating).toBe(4.8);
    expect(builder.permit_count).toBe(50);
  });

  it('builder has enrichment fields', () => {
    const builder = createMockBuilder({
      google_place_id: 'ChIJ...',
      google_rating: 4.5,
      google_review_count: 42,
      obr_business_number: '123456789',
      wsib_status: 'active',
      enriched_at: new Date('2024-06-01'),
    });
    expect(builder.google_place_id).toBe('ChIJ...');
    expect(builder.wsib_status).toBe('active');
    expect(builder.enriched_at).toEqual(new Date('2024-06-01'));
  });
});

describe('Builder Link & Display', () => {
  function builderProfileUrl(builderId: number): string {
    return `/builders/${builderId}`;
  }

  function formatBuilderRating(rating: number | null, reviewCount: number | null): string {
    if (rating == null) return 'No rating';
    const stars = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
    const reviews = reviewCount != null ? ` (${reviewCount})` : '';
    return `${rating}/5 ${stars}${reviews}`;
  }

  function wsibBadgeColor(status: string | null): string {
    if (status === 'active') return '#16A34A';
    if (status === 'inactive') return '#DC2626';
    return '#6B7280';
  }

  function enrichmentStatus(builder: { enriched_at: Date | null; phone: string | null; website: string | null }): string {
    if (!builder.enriched_at) return 'pending';
    if (builder.phone || builder.website) return 'enriched';
    return 'no_data';
  }

  it('generates builder profile URL from ID', () => {
    expect(builderProfileUrl(42)).toBe('/builders/42');
  });

  it('formats rating with stars', () => {
    expect(formatBuilderRating(4.5, 23)).toBe('4.5/5 ★★★★★ (23)');
  });

  it('formats null rating', () => {
    expect(formatBuilderRating(null, null)).toBe('No rating');
  });

  it('wsib active is green', () => {
    expect(wsibBadgeColor('active')).toBe('#16A34A');
  });

  it('wsib inactive is red', () => {
    expect(wsibBadgeColor('inactive')).toBe('#DC2626');
  });

  it('wsib unknown is gray', () => {
    expect(wsibBadgeColor(null)).toBe('#6B7280');
  });

  it('enrichment status pending when not enriched', () => {
    expect(enrichmentStatus({ enriched_at: null, phone: null, website: null })).toBe('pending');
  });

  it('enrichment status enriched when has contact', () => {
    expect(enrichmentStatus({ enriched_at: new Date(), phone: '416-555-0100', website: null })).toBe('enriched');
  });

  it('enrichment status no_data when enriched but empty', () => {
    expect(enrichmentStatus({ enriched_at: new Date(), phone: null, website: null })).toBe('no_data');
  });
});
