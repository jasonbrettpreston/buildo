// SPEC LINK: docs/specs/37_corporate_identity_hub.md
import { describe, it, expect } from 'vitest';
import { createMockEntity, createMockEntityProject } from './factories';
import { normalizeEntityName, isIncorporated } from '@/lib/builders/normalize';

describe('Entity Name Normalization (shared module)', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(normalizeEntityName(null)).toBeNull();
    expect(normalizeEntityName(undefined)).toBeNull();
    expect(normalizeEntityName('')).toBeNull();
    expect(normalizeEntityName('   ')).toBeNull();
  });

  it('uppercases and trims', () => {
    expect(normalizeEntityName('  abc builders  ')).toBe('ABC BUILDERS');
  });

  it('collapses multiple spaces and standardizes ampersands', () => {
    expect(normalizeEntityName('SMITH   &   SONS')).toBe('SMITH AND SONS');
  });

  it('strips INC suffix', () => {
    expect(normalizeEntityName('ACME CONSTRUCTION INC')).toBe('ACME CONSTRUCTION');
  });

  it('strips LTD. suffix', () => {
    expect(normalizeEntityName('MAPLE BUILDERS LTD.')).toBe('MAPLE BUILDERS');
  });

  it('strips CORP suffix', () => {
    expect(normalizeEntityName('ELITE HOMES CORP')).toBe('ELITE HOMES');
  });

  it('strips INCORPORATED suffix', () => {
    expect(normalizeEntityName('FOUNDATION INCORPORATED')).toBe('FOUNDATION');
  });

  it('strips double suffixes (CORP INCORPORATED)', () => {
    // Double-pass stripping: INCORPORATED first, then CORP
    expect(normalizeEntityName('FOUNDATION CORP INCORPORATED')).toBe('FOUNDATION');
  });

  it('strips double suffixes (INC. LTD.)', () => {
    expect(normalizeEntityName('XYZ INC. LTD.')).toBe('XYZ');
  });

  it('removes trailing punctuation', () => {
    expect(normalizeEntityName('TEST BUILDERS,')).toBe('TEST BUILDERS');
  });

  it('handles names with no suffix', () => {
    expect(normalizeEntityName('BOB THE BUILDER')).toBe('BOB THE BUILDER');
  });
});

describe('isIncorporated', () => {
  it('detects INC', () => {
    expect(isIncorporated('ACME INC')).toBe(true);
  });

  it('detects LTD', () => {
    expect(isIncorporated('MAPLE LTD.')).toBe(true);
  });

  it('returns false for plain names', () => {
    expect(isIncorporated('BOB THE BUILDER')).toBe(false);
  });
});

describe('Entity Factory', () => {
  it('creates an entity with all required fields', () => {
    const entity = createMockEntity();
    expect(entity.id).toBe(1);
    expect(entity.legal_name).toBe('ACME CONSTRUCTION INC');
    expect(entity.name_normalized).toBe('ACME CONSTRUCTION');
    expect(entity.primary_phone).toBe('416-555-1234');
    expect(entity.primary_email).toBe('info@acmeconstruction.ca');
    expect(entity.permit_count).toBe(12);
    expect(entity.last_enriched_at).toBeNull();
    expect(entity.is_wsib_registered).toBe(false);
  });

  it('allows overrides', () => {
    const entity = createMockEntity({
      legal_name: 'TEST CORP',
      is_wsib_registered: true,
      permit_count: 50,
    });
    expect(entity.legal_name).toBe('TEST CORP');
    expect(entity.is_wsib_registered).toBe(true);
    expect(entity.permit_count).toBe(50);
  });
});

describe('EntityProject Factory', () => {
  it('creates a junction row with defaults', () => {
    const ep = createMockEntityProject();
    expect(ep.entity_id).toBe(1);
    expect(ep.permit_num).toBe('24 101234');
    expect(ep.revision_num).toBe('01');
    expect(ep.coa_file_num).toBeNull();
    expect(ep.role).toBe('Builder');
  });

  it('supports CoA junction rows', () => {
    const ep = createMockEntityProject({
      permit_num: null,
      revision_num: null,
      coa_file_num: 'A0001/25TEY',
      role: 'Applicant',
    });
    expect(ep.permit_num).toBeNull();
    expect(ep.coa_file_num).toBe('A0001/25TEY');
    expect(ep.role).toBe('Applicant');
  });

  it('supports all project role values', () => {
    const roles = ['Builder', 'Architect', 'Applicant', 'Owner', 'Agent', 'Engineer'] as const;
    for (const role of roles) {
      const ep = createMockEntityProject({ role });
      expect(ep.role).toBe(role);
    }
  });
});

describe('Entity portfolio aggregation', () => {
  it('computes portfolio from multiple junction rows', () => {
    const entity = createMockEntity({ id: 5, permit_count: 3 });
    const projects = [
      createMockEntityProject({ entity_id: 5, permit_num: 'P001', role: 'Builder' }),
      createMockEntityProject({ entity_id: 5, permit_num: 'P002', role: 'Builder' }),
      createMockEntityProject({ entity_id: 5, coa_file_num: 'COA-1', permit_num: null, revision_num: null, role: 'Applicant' }),
    ];

    const builderPermits = projects.filter(p => p.role === 'Builder');
    const applicantCoAs = projects.filter(p => p.role === 'Applicant');

    expect(builderPermits).toHaveLength(2);
    expect(applicantCoAs).toHaveLength(1);
    expect(entity.permit_count).toBe(3);
  });
});
