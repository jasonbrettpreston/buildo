// SPEC LINK: docs/specs/12_coa_integration.md
import { describe, it, expect } from 'vitest';

describe('CoA Address Parsing', () => {
  function parseCoaAddress(address: string): { street_num: string; street_name: string } {
    const trimmed = address.trim().toUpperCase();
    const match = trimmed.match(/^(\d+[\w-]*)\s+(.+)$/);
    if (!match) {
      return { street_num: '', street_name: trimmed };
    }
    return {
      street_num: match[1],
      street_name: match[2].replace(/\s+(ST|AVE|RD|BLVD|DR|CRES|CT|PL|WAY|CIR|LANE|TERR)\.?$/i, '').trim(),
    };
  }

  it('parses simple address', () => {
    const result = parseCoaAddress('123 MAIN ST');
    expect(result.street_num).toBe('123');
    expect(result.street_name).toBe('MAIN');
  });

  it('parses address with avenue', () => {
    const result = parseCoaAddress('456 QUEEN AVE');
    expect(result.street_num).toBe('456');
    expect(result.street_name).toBe('QUEEN');
  });

  it('handles multi-word street names', () => {
    const result = parseCoaAddress('789 OLD MILL RD');
    expect(result.street_num).toBe('789');
    expect(result.street_name).toBe('OLD MILL');
  });

  it('handles lowercase input', () => {
    const result = parseCoaAddress('100 king st');
    expect(result.street_num).toBe('100');
    expect(result.street_name).toBe('KING');
  });

  it('handles address with unit number format', () => {
    const result = parseCoaAddress('10A FRONT ST');
    expect(result.street_num).toBe('10A');
    expect(result.street_name).toBe('FRONT');
  });

  it('handles address without number', () => {
    const result = parseCoaAddress('UNKNOWN LOCATION');
    expect(result.street_num).toBe('');
    expect(result.street_name).toBe('UNKNOWN LOCATION');
  });
});

describe('CoA Link Confidence', () => {
  function computeLinkConfidence(
    matchType: 'exact_address' | 'fuzzy_address' | 'description_similarity',
    sameWard: boolean,
    dateDiffDays: number
  ): number {
    let base: number;
    switch (matchType) {
      case 'exact_address':
        base = 0.9;
        break;
      case 'fuzzy_address':
        base = 0.6;
        break;
      case 'description_similarity':
        base = 0.4;
        break;
    }

    // Ward match boost
    if (sameWard) {
      base += 0.05;
    }

    // Date proximity bonus (closer dates = higher confidence)
    if (dateDiffDays <= 30) {
      base += 0.05;
    } else if (dateDiffDays <= 90) {
      base += 0.02;
    }
    // Distant dates = slight penalty
    if (dateDiffDays > 365) {
      base -= 0.1;
    }

    return Math.min(1.0, Math.max(0, base));
  }

  it('exact address match gets high confidence', () => {
    const conf = computeLinkConfidence('exact_address', true, 15);
    expect(conf).toBeGreaterThanOrEqual(0.9);
    expect(conf).toBeLessThanOrEqual(1.0);
  });

  it('fuzzy address match gets medium confidence', () => {
    const conf = computeLinkConfidence('fuzzy_address', true, 60);
    expect(conf).toBeGreaterThan(0.5);
    expect(conf).toBeLessThan(0.8);
  });

  it('description similarity gets low confidence', () => {
    const conf = computeLinkConfidence('description_similarity', false, 200);
    expect(conf).toBeGreaterThan(0.2);
    expect(conf).toBeLessThan(0.6);
  });

  it('same ward adds bonus', () => {
    const withWard = computeLinkConfidence('fuzzy_address', true, 60);
    const withoutWard = computeLinkConfidence('fuzzy_address', false, 60);
    expect(withWard).toBeGreaterThan(withoutWard);
  });

  it('very old date reduces confidence', () => {
    const recent = computeLinkConfidence('exact_address', true, 15);
    const old = computeLinkConfidence('exact_address', true, 500);
    expect(recent).toBeGreaterThan(old);
  });

  it('confidence clamped to [0, 1]', () => {
    const conf = computeLinkConfidence('exact_address', true, 1);
    expect(conf).toBeLessThanOrEqual(1.0);
    expect(conf).toBeGreaterThanOrEqual(0.0);
  });
});
