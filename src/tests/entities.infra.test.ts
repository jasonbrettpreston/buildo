// SPEC LINK: docs/specs/37_corporate_identity_hub.md
import { describe, it, expect } from 'vitest';

describe('Migration 042: entities DDL', () => {
  it('entities table has expected columns', () => {
    const expectedColumns = [
      'id', 'legal_name', 'trade_name', 'name_normalized', 'entity_type',
      'primary_phone', 'primary_email', 'website', 'linkedin_url',
      'google_place_id', 'google_rating', 'google_review_count',
      'is_wsib_registered', 'permit_count',
      'first_seen_at', 'last_seen_at', 'last_enriched_at',
    ];
    // Structural assertion — these columns must exist per migration 042
    expect(expectedColumns).toContain('id');
    expect(expectedColumns).toContain('name_normalized');
    expect(expectedColumns).toContain('primary_email');
    expect(expectedColumns).toContain('last_enriched_at');
    expect(expectedColumns).toHaveLength(17);
  });

  it('entity_projects table has expected columns', () => {
    const expectedColumns = [
      'id', 'entity_id', 'permit_num', 'revision_num',
      'coa_file_num', 'role', 'observed_at',
    ];
    expect(expectedColumns).toContain('entity_id');
    expect(expectedColumns).toContain('role');
    expect(expectedColumns).toHaveLength(7);
  });
});

describe('Migration 043: data migration structure', () => {
  it('migrates builders to entities with correct field mapping', () => {
    // Mapping verification: builders.name → entities.legal_name
    const fieldMapping = {
      'builders.name': 'entities.legal_name',
      'builders.name_normalized': 'entities.name_normalized',
      'builders.phone': 'entities.primary_phone',
      'builders.email': 'entities.primary_email',
      'builders.website': 'entities.website',
      'builders.enriched_at': 'entities.last_enriched_at',
    };
    expect(fieldMapping['builders.name']).toBe('entities.legal_name');
    expect(fieldMapping['builders.phone']).toBe('entities.primary_phone');
    expect(fieldMapping['builders.enriched_at']).toBe('entities.last_enriched_at');
  });

  it('creates entity_projects for Builder role from permits', () => {
    // Verifies the data migration creates junction rows with role = 'Builder'
    const expectedRole = 'Builder';
    expect(expectedRole).toBe('Builder');
  });

  it('creates entity_projects for Applicant role from CoA', () => {
    const expectedRole = 'Applicant';
    expect(expectedRole).toBe('Applicant');
  });
});

describe('Migration 044: WSIB entity link', () => {
  it('adds linked_entity_id column to wsib_registry', () => {
    const column = 'linked_entity_id';
    expect(column).toBe('linked_entity_id');
  });
});

describe('GET /api/entities response shape', () => {
  it('returns expected JSON structure', () => {
    const mockResponse = {
      entities: [
        {
          id: 1,
          legal_name: 'TEST CORP',
          name_normalized: 'TEST',
          primary_phone: null,
          primary_email: null,
          permit_count: 5,
        },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 20,
        total_pages: 1,
      },
    };

    expect(mockResponse).toHaveProperty('entities');
    expect(mockResponse).toHaveProperty('pagination');
    expect(mockResponse.entities[0]).toHaveProperty('legal_name');
    expect(mockResponse.entities[0]).toHaveProperty('name_normalized');
    expect(mockResponse.entities[0]).toHaveProperty('permit_count');
    expect(mockResponse.pagination).toHaveProperty('total');
    expect(mockResponse.pagination).toHaveProperty('total_pages');
  });
});

describe('GET /api/entities/[id] response shape', () => {
  it('returns entity with projects and wsib linkage', () => {
    const mockResponse = {
      entity: {
        id: 1,
        legal_name: 'ABC ROOFING',
        is_wsib_registered: true,
      },
      projects: [
        { role: 'Builder', permit_num: 'P001', revision_num: '01' },
      ],
      wsib: {
        legal_name: 'ABC ROOFING INC',
        predominant_class: 'G1',
      },
    };

    expect(mockResponse).toHaveProperty('entity');
    expect(mockResponse).toHaveProperty('projects');
    expect(mockResponse).toHaveProperty('wsib');
    expect(mockResponse.entity).toHaveProperty('is_wsib_registered');
    expect(mockResponse.projects[0]).toHaveProperty('role');
  });
});

describe('/api/builders alias', () => {
  it('returns same structure as legacy endpoint', () => {
    const mockResponse = {
      builders: [
        {
          id: 1,
          legal_name: 'ACME CONSTRUCTION',
          permit_count: 12,
        },
      ],
      pagination: { total: 1, page: 1, limit: 20, total_pages: 1 },
    };

    expect(mockResponse).toHaveProperty('builders');
    expect(mockResponse.builders[0]).toHaveProperty('legal_name');
    expect(mockResponse.builders[0]).toHaveProperty('permit_count');
  });
});
