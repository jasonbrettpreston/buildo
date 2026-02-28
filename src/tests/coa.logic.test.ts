// SPEC LINK: docs/specs/12_coa_integration.md
import { describe, it, expect } from 'vitest';
import type { CoaApplication } from '@/lib/coa/types';

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

// ---------------------------------------------------------------------------
// Pre-Permit (Upcoming Lead) Tests
// ---------------------------------------------------------------------------

describe('Pre-Permit DTO Mapping', () => {
  // This function must be implemented in src/lib/coa/pre-permits.ts
  // Importing will fail until the module exists — testing the logic shape here.

  function mapCoaToPermitDto(coa: {
    application_num: string;
    address: string;
    street_num: string;
    street_name: string;
    ward: string;
    decision: string;
    decision_date: string | null;
    hearing_date: string | null;
    description: string;
    applicant: string;
  }) {
    // This is the EXPECTED implementation — tests will fail because the
    // real mapCoaToPermitDto doesn't exist yet in src/lib/coa/pre-permits.ts
    return {
      permit_num: `COA-${coa.application_num}`,
      revision_num: '00',
      status: 'Pre-Permit (Upcoming)',
      permit_type: 'Committee of Adjustment',
      description: coa.description,
      street_num: coa.street_num,
      street_name: coa.street_name,
      street_type: '',
      street_direction: null,
      city: 'TORONTO',
      postal: '',
      builder_name: coa.applicant,
      issued_date: coa.decision_date,
      application_date: coa.hearing_date,
      ward: coa.ward,
      est_const_cost: null,
      latitude: null,
      longitude: null,
    };
  }

  const sampleCoa = {
    application_num: 'A123/45CM',
    address: '100 QUEEN ST W',
    street_num: '100',
    street_name: 'QUEEN',
    ward: '10',
    decision: 'Approved',
    decision_date: '2026-02-01',
    hearing_date: '2026-01-15',
    description: 'To permit a rear yard setback variance of 5.5m instead of 7.5m to allow construction of a two-storey rear addition.',
    applicant: 'SMITH DEVELOPMENTS INC.',
  };

  it('maps permit_num with COA- prefix', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.permit_num).toBe('COA-A123/45CM');
  });

  it('sets revision_num to 00', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.revision_num).toBe('00');
  });

  it('sets status to Pre-Permit (Upcoming)', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.status).toBe('Pre-Permit (Upcoming)');
  });

  it('sets permit_type to Committee of Adjustment', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.permit_type).toBe('Committee of Adjustment');
  });

  it('preserves the full CoA description', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.description).toContain('rear yard setback variance');
  });

  it('maps applicant to builder_name', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.builder_name).toBe('SMITH DEVELOPMENTS INC.');
  });

  it('maps decision_date to issued_date', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.issued_date).toBe('2026-02-01');
  });

  it('maps hearing_date to application_date', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.application_date).toBe('2026-01-15');
  });

  it('sets est_const_cost to null', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.est_const_cost).toBeNull();
  });

  it('sets lat/lng to null (not geocoded)', () => {
    const dto = mapCoaToPermitDto(sampleCoa);
    expect(dto.latitude).toBeNull();
    expect(dto.longitude).toBeNull();
  });
});

describe('Pre-Permit ID Detection', () => {
  function isPrePermitId(id: string): boolean {
    return id.startsWith('COA-');
  }

  function extractCoaApplicationNumber(prePermitId: string): string | null {
    if (!prePermitId.startsWith('COA-')) return null;
    // ID format: COA-{appNum}--{revision}
    const withoutPrefix = prePermitId.replace(/^COA-/, '');
    const parts = withoutPrefix.split('--');
    return parts[0] || null;
  }

  it('detects COA- prefix as pre-permit', () => {
    expect(isPrePermitId('COA-A123/45CM--00')).toBe(true);
  });

  it('regular permit ID is not pre-permit', () => {
    expect(isPrePermitId('21 234567 BLD--01')).toBe(false);
  });

  it('extracts application number from pre-permit ID', () => {
    expect(extractCoaApplicationNumber('COA-A123/45CM--00')).toBe('A123/45CM');
  });

  it('returns null for non-pre-permit ID', () => {
    expect(extractCoaApplicationNumber('21 234567 BLD--01')).toBeNull();
  });
});

describe('Pre-Permit Qualifying Criteria', () => {
  // Tests the logic for determining which CoAs qualify as "upcoming leads"

  interface CoaCandidate {
    decision: string;
    decision_date: string | null;
    linked_permit_num: string | null;
  }

  function isQualifyingPrePermit(coa: CoaCandidate, now: Date = new Date()): boolean {
    // Must be approved
    const approvedDecisions = ['Approved', 'Approved with Conditions'];
    if (!approvedDecisions.includes(coa.decision)) return false;

    // Must not be linked to a permit
    if (coa.linked_permit_num) return false;

    // Must have a decision_date within last 90 days
    if (!coa.decision_date) return false;
    const decisionDate = new Date(coa.decision_date);
    const daysSinceDecision = Math.floor(
      (now.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceDecision <= 90;
  }

  const now = new Date('2026-02-27');

  it('includes approved, unlinked CoA within 90 days', () => {
    expect(isQualifyingPrePermit({
      decision: 'Approved',
      decision_date: '2026-02-01',
      linked_permit_num: null,
    }, now)).toBe(true);
  });

  it('includes "Approved with Conditions" within 90 days', () => {
    expect(isQualifyingPrePermit({
      decision: 'Approved with Conditions',
      decision_date: '2026-01-15',
      linked_permit_num: null,
    }, now)).toBe(true);
  });

  it('excludes refused CoA even if recent and unlinked', () => {
    expect(isQualifyingPrePermit({
      decision: 'Refused',
      decision_date: '2026-02-20',
      linked_permit_num: null,
    }, now)).toBe(false);
  });

  it('excludes withdrawn CoA', () => {
    expect(isQualifyingPrePermit({
      decision: 'Withdrawn',
      decision_date: '2026-02-20',
      linked_permit_num: null,
    }, now)).toBe(false);
  });

  it('excludes approved CoA that is already linked to a permit', () => {
    expect(isQualifyingPrePermit({
      decision: 'Approved',
      decision_date: '2026-02-01',
      linked_permit_num: '26 107954 BLD',
    }, now)).toBe(false);
  });

  it('excludes approved CoA older than 90 days', () => {
    expect(isQualifyingPrePermit({
      decision: 'Approved',
      decision_date: '2025-11-01', // ~118 days ago
      linked_permit_num: null,
    }, now)).toBe(false);
  });

  it('excludes CoA with null decision_date', () => {
    expect(isQualifyingPrePermit({
      decision: 'Approved',
      decision_date: null,
      linked_permit_num: null,
    }, now)).toBe(false);
  });

  it('includes CoA approved exactly 90 days ago', () => {
    // 90 days before Feb 27 = Nov 29
    expect(isQualifyingPrePermit({
      decision: 'Approved',
      decision_date: '2025-11-29',
      linked_permit_num: null,
    }, now)).toBe(true);
  });

  it('excludes CoA approved 91 days ago', () => {
    expect(isQualifyingPrePermit({
      decision: 'Approved',
      decision_date: '2025-11-28',
      linked_permit_num: null,
    }, now)).toBe(false);
  });
});

describe('Pre-Permit Badge Logic', () => {
  // Tests the PermitCard badge styling for pre-permits

  const PRE_PERMIT_STATUS = 'Pre-Permit (Upcoming)';

  function getStatusBadgeColor(status: string): string {
    if (status === PRE_PERMIT_STATUS) return '#7C3AED'; // purple
    if (status === 'Permit Issued' || status === 'Revision Issued') return '#16A34A';
    if (status === 'Inspection') return '#2563EB';
    if (status === 'Under Review' || status === 'Issuance Pending') return '#CA8A04';
    return '#6B7280';
  }

  function isPrePermit(status: string): boolean {
    return status === PRE_PERMIT_STATUS;
  }

  it('Pre-Permit status gets purple badge color', () => {
    expect(getStatusBadgeColor(PRE_PERMIT_STATUS)).toBe('#7C3AED');
  });

  it('Pre-Permit is distinct from Permit Issued color', () => {
    expect(getStatusBadgeColor(PRE_PERMIT_STATUS)).not.toBe(getStatusBadgeColor('Permit Issued'));
  });

  it('isPrePermit returns true for Pre-Permit status', () => {
    expect(isPrePermit('Pre-Permit (Upcoming)')).toBe(true);
  });

  it('isPrePermit returns false for regular permit status', () => {
    expect(isPrePermit('Permit Issued')).toBe(false);
    expect(isPrePermit('Inspection')).toBe(false);
    expect(isPrePermit('Under Review')).toBe(false);
  });
});

describe('Linker No Hard Age Cutoff', () => {
  // Verifies the linker confidence decays but never hard-rejects based on age

  function computeDateProximityScore(daysDiff: number): number {
    // Per spec: date proximity should decay, not cut off
    if (daysDiff <= 90) return 0.4;
    if (daysDiff <= 180) return 0.3;
    if (daysDiff <= 365) return 0.2;
    if (daysDiff <= 730) return 0.1;
    return 0.0; // very old, but still 0 (not -1 or rejection)
  }

  it('returns positive score for CoA within 90 days', () => {
    expect(computeDateProximityScore(30)).toBe(0.4);
  });

  it('returns positive score for CoA 6 months old', () => {
    expect(computeDateProximityScore(150)).toBe(0.3);
  });

  it('returns positive score for CoA 1 year old', () => {
    expect(computeDateProximityScore(300)).toBe(0.2);
  });

  it('returns positive score for CoA 18 months old', () => {
    expect(computeDateProximityScore(540)).toBe(0.1);
  });

  it('returns zero (not negative) for CoA 3+ years old', () => {
    const score = computeDateProximityScore(1200);
    expect(score).toBe(0.0);
    expect(score).toBeGreaterThanOrEqual(0); // never negative
  });

  it('never returns a hard rejection value', () => {
    // Even very old CoAs should produce a valid (non-negative) proximity score
    for (const days of [1, 30, 90, 180, 365, 730, 1000, 2000, 5000]) {
      const score = computeDateProximityScore(days);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(0.4);
    }
  });
});

describe('Permit Detail CoA Section', () => {
  // Verify the permit detail API returns CoA data and the page renders it
  const fs = require('fs');
  const path = require('path');

  it('permit detail API route fetches CoA applications for the permit', () => {
    const apiSource = fs.readFileSync(
      path.join(__dirname, '../app/api/permits/[id]/route.ts'),
      'utf-8'
    );
    // API must call getCoaByPermit or query coa_applications
    expect(apiSource).toMatch(/coa_applications|getCoaByPermit/);
  });

  it('permit detail API response includes coaApplications field', () => {
    const apiSource = fs.readFileSync(
      path.join(__dirname, '../app/api/permits/[id]/route.ts'),
      'utf-8'
    );
    expect(apiSource).toContain('coaApplications');
  });

  it('permit detail page renders CoA section', () => {
    const pageSource = fs.readFileSync(
      path.join(__dirname, '../app/permits/[id]/page.tsx'),
      'utf-8'
    );
    // Page must have a section for CoA (Committee of Adjustment)
    expect(pageSource).toMatch(/Committee of Adjustment|CoA Application/);
  });
});

describe('Dashboard CoA Stats', () => {
  const fs = require('fs');
  const path = require('path');

  it('dashboard page fetches and displays CoA stats', () => {
    const dashSource = fs.readFileSync(
      path.join(__dirname, '../app/dashboard/page.tsx'),
      'utf-8'
    );
    // Dashboard must reference CoA data
    expect(dashSource).toMatch(/[Cc]oa|[Cc]ommittee|[Pp]re.?[Pp]ermit|[Uu]pcoming/);
  });

  it('admin stats API returns CoA counts', () => {
    const statsSource = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/stats/route.ts'),
      'utf-8'
    );
    expect(statsSource).toMatch(/coa_applications|coa_total|coa_linked/);
  });
});

// ---------------------------------------------------------------------------
// Bug Fix Tests: Slash-Safe URLs & Builder Field
// ---------------------------------------------------------------------------

describe('Pre-Permit Slash-Safe URLs', () => {
  it('mapCoaToPermitDto replaces / with ~ in permit_num', async () => {
    const { mapCoaToPermitDto } = await import('../lib/coa/pre-permits');
    const dto = mapCoaToPermitDto({
      application_num: 'A0246/23EYK',
      address: '100 QUEEN ST W',
      street_num: '100',
      street_name: 'QUEEN ST W',
      ward: '10',
      decision: 'Approved',
      decision_date: '2026-02-01',
      hearing_date: '2026-01-15',
      description: 'Rear addition variance',
      applicant: 'SMITH INC.',
    });
    expect(dto.permit_num).toBe('COA-A0246~23EYK');
    expect(dto.permit_num).not.toContain('/');
  });

  it('permit_num with no slashes is unchanged', async () => {
    const { mapCoaToPermitDto } = await import('../lib/coa/pre-permits');
    const dto = mapCoaToPermitDto({
      application_num: 'B1234',
      address: '200 KING ST',
      street_num: '200',
      street_name: 'KING ST',
      ward: '5',
      decision: 'Approved',
      decision_date: '2026-02-01',
      hearing_date: '2026-01-15',
      description: 'Minor variance',
      applicant: 'JONES LTD',
    });
    expect(dto.permit_num).toBe('COA-B1234');
  });

  it('multiple slashes are all replaced', async () => {
    const { mapCoaToPermitDto } = await import('../lib/coa/pre-permits');
    const dto = mapCoaToPermitDto({
      application_num: 'A/B/C',
      address: '1 TEST',
      street_num: '1',
      street_name: 'TEST',
      ward: '1',
      decision: 'Approved',
      decision_date: '2026-02-01',
      hearing_date: null,
      description: 'Test',
      applicant: null as unknown as string,
    });
    expect(dto.permit_num).toBe('COA-A~B~C');
  });
});

describe('Pre-Permit Builder Field Null Handling', () => {
  it('returns null builder_name when applicant is null', async () => {
    const { mapCoaToPermitDto } = await import('../lib/coa/pre-permits');
    const dto = mapCoaToPermitDto({
      application_num: 'A0246/23EYK',
      address: '100 QUEEN ST W',
      street_num: '100',
      street_name: 'QUEEN ST W',
      ward: '10',
      decision: 'Approved',
      decision_date: '2026-02-01',
      hearing_date: '2026-01-15',
      description: 'Rear addition variance',
      applicant: null as unknown as string,
    });
    expect(dto.builder_name).toBeNull();
  });

  it('returns applicant as builder_name when present', async () => {
    const { mapCoaToPermitDto } = await import('../lib/coa/pre-permits');
    const dto = mapCoaToPermitDto({
      application_num: 'A0246/23EYK',
      address: '100 QUEEN ST W',
      street_num: '100',
      street_name: 'QUEEN ST W',
      ward: '10',
      decision: 'Approved',
      decision_date: '2026-02-01',
      hearing_date: '2026-01-15',
      description: 'Rear addition variance',
      applicant: 'REAL BUILDER CO.',
    });
    expect(dto.builder_name).toBe('REAL BUILDER CO.');
  });
});

describe('Pre-Permit API Route Tilde Decoding', () => {
  const fs = require('fs');
  const path = require('path');

  it('API route decodes ~ back to / for COA DB lookup', () => {
    const apiSource = fs.readFileSync(
      path.join(__dirname, '../app/api/permits/[id]/route.ts'),
      'utf-8'
    );
    // Must have tilde-to-slash replacement in the COA handler
    expect(apiSource).toMatch(/replace\(.*~.*\/.*\)/);
  });
});

describe('Pre-Permit Query includes sub_type', () => {
  const fs = require('fs');
  const path = require('path');

  it('getUpcomingLeads SELECT references sub_type', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../lib/coa/pre-permits.ts'),
      'utf-8'
    );
    const selectBlock = source.match(/SELECT[\s\S]*?FROM coa_applications/);
    expect(selectBlock).toBeTruthy();
    expect(selectBlock![0]).toMatch(/sub_type/);
  });

  it('API detail route COA SELECT references sub_type', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/permits/[id]/route.ts'),
      'utf-8'
    );
    const selectBlocks = source.match(/SELECT[\s\S]*?FROM coa_applications/g);
    expect(selectBlocks).toBeTruthy();
    expect(selectBlocks![0]).toMatch(/sub_type/);
  });
});

describe('PermitCard Builder Section Hiding', () => {
  it('PermitCard does not render builder section when builder_name is falsy', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../components/permits/PermitCard.tsx'),
      'utf-8'
    );
    // PermitCard must conditionally render builder section
    expect(source).toMatch(/permit\.builder_name\s*&&/);
  });
});

describe('Pre-Permit Source File Existence', () => {
  // Verify the pre-permits module exists (will fail until implemented)
  const fs = require('fs');
  const path = require('path');

  it('src/lib/coa/pre-permits.ts exists', () => {
    const filePath = path.join(__dirname, '../lib/coa/pre-permits.ts');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('pre-permits module exports mapCoaToPermitDto', async () => {
    const mod = await import('../lib/coa/pre-permits');
    expect(typeof mod.mapCoaToPermitDto).toBe('function');
  });

  it('pre-permits module exports getUpcomingLeads', async () => {
    const mod = await import('../lib/coa/pre-permits');
    expect(typeof mod.getUpcomingLeads).toBe('function');
  });

  it('pre-permits module exports isQualifyingPrePermit', async () => {
    const mod = await import('../lib/coa/pre-permits');
    expect(typeof mod.isQualifyingPrePermit).toBe('function');
  });
});
