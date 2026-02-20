// 🔗 SPEC LINK: docs/specs/01_database_schema.md, 02_data_ingestion.md, 03_change_detection.md
import { describe, it, expect } from 'vitest';
import { mapRawToPermit } from '@/lib/permits/field-mapping';
import { computePermitHash } from '@/lib/permits/hash';
import { diffPermitFields } from '@/lib/permits/diff';
import type { RawPermitRecord } from '@/lib/permits/types';
import {
  createMockRawPermit,
  createMockPermit,
} from './factories';
import {
  SAMPLE_DIRTY_COST_PERMIT,
  SAMPLE_PLUMBING_PERMIT,
  SAMPLE_BUILDING_PERMIT,
} from './fixtures/sample-permits';

describe('Field Mapping', () => {
  it('maps raw permit fields to snake_case DB fields', () => {
    const raw = createMockRawPermit();
    const mapped = mapRawToPermit(raw);

    expect(mapped.permit_num).toBe('24 101234');
    expect(mapped.revision_num).toBe('01');
    expect(mapped.permit_type).toBe('Building');
    expect(mapped.street_name).toBe('QUEEN');
    expect(mapped.ward).toBe('10');
  });

  it('parses EST_CONST_COST as number', () => {
    const raw = createMockRawPermit({ EST_CONST_COST: '250000' });
    const mapped = mapRawToPermit(raw);
    expect(mapped.est_const_cost).toBe(250000);
  });

  it('nullifies dirty EST_CONST_COST containing "DO NOT UPDATE"', () => {
    const mapped = mapRawToPermit(SAMPLE_DIRTY_COST_PERMIT);
    expect(mapped.est_const_cost).toBeNull();
  });

  it('trims whitespace-only STREET_DIRECTION to null', () => {
    const raw = createMockRawPermit({ STREET_DIRECTION: '   ' });
    const mapped = mapRawToPermit(raw);
    expect(mapped.street_direction).toBeNull();
  });

  it('preserves valid STREET_DIRECTION', () => {
    const raw = createMockRawPermit({ STREET_DIRECTION: 'W' });
    const mapped = mapRawToPermit(raw);
    expect(mapped.street_direction).toBe('W');
  });

  it('parses valid date strings to Date objects', () => {
    const raw = createMockRawPermit({
      APPLICATION_DATE: '2024-01-15T00:00:00.000',
    });
    const mapped = mapRawToPermit(raw);
    expect(mapped.application_date).toBeInstanceOf(Date);
    expect(mapped.application_date?.getFullYear()).toBe(2024);
  });

  it('handles empty date strings as null', () => {
    const raw = createMockRawPermit({ COMPLETED_DATE: '' });
    const mapped = mapRawToPermit(raw);
    expect(mapped.completed_date).toBeNull();
  });

  it('handles empty EST_CONST_COST as null', () => {
    const raw = createMockRawPermit({ EST_CONST_COST: '' });
    const mapped = mapRawToPermit(raw);
    expect(mapped.est_const_cost).toBeNull();
  });
});

describe('Permit Hashing', () => {
  it('produces a consistent SHA-256 hash for the same input', () => {
    const raw = createMockRawPermit();
    const hash1 = computePermitHash(raw);
    const hash2 = computePermitHash(raw);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  it('produces different hashes for different inputs', () => {
    const raw1 = createMockRawPermit({ STATUS: 'Issued' });
    const raw2 = createMockRawPermit({ STATUS: 'Under Review' });
    expect(computePermitHash(raw1)).not.toBe(computePermitHash(raw2));
  });

  it('is deterministic regardless of field order in source', () => {
    const raw1 = createMockRawPermit();
    // Create same data but in different order (JS objects)
    const raw2 = {} as Record<string, unknown>;
    const keys = Object.keys(raw1).reverse();
    for (const key of keys) {
      raw2[key] = (raw1 as unknown as Record<string, string>)[key];
    }
    expect(computePermitHash(raw1)).toBe(
      computePermitHash(raw2 as unknown as RawPermitRecord)
    );
  });
});

describe('Permit Diff', () => {
  it('detects changed fields between two permits', () => {
    const oldPermit = createMockPermit({ status: 'Application Filed' });
    const newPermit = createMockPermit({ status: 'Issued' });
    const changes = diffPermitFields(oldPermit, newPermit);

    expect(changes).toHaveLength(1);
    expect(changes[0].field_name).toBe('status');
    expect(changes[0].old_value).toBe('Application Filed');
    expect(changes[0].new_value).toBe('Issued');
  });

  it('returns empty array when permits are identical', () => {
    const permit = createMockPermit();
    const changes = diffPermitFields(permit, { ...permit });
    expect(changes).toHaveLength(0);
  });

  it('detects multiple changed fields', () => {
    const oldPermit = createMockPermit({
      status: 'Application Filed',
      est_const_cost: 100000,
    });
    const newPermit = createMockPermit({
      status: 'Issued',
      est_const_cost: 150000,
    });
    const changes = diffPermitFields(oldPermit, newPermit);
    expect(changes.length).toBeGreaterThanOrEqual(2);

    const fieldNames = changes.map((c) => c.field_name);
    expect(fieldNames).toContain('status');
    expect(fieldNames).toContain('est_const_cost');
  });

  it('skips data_hash, first_seen_at, last_seen_at fields', () => {
    const oldPermit = createMockPermit({
      data_hash: 'old_hash',
      first_seen_at: new Date('2024-01-01'),
    });
    const newPermit = createMockPermit({
      data_hash: 'new_hash',
      first_seen_at: new Date('2024-06-01'),
    });
    const changes = diffPermitFields(oldPermit, newPermit);
    const fieldNames = changes.map((c) => c.field_name);
    expect(fieldNames).not.toContain('data_hash');
    expect(fieldNames).not.toContain('first_seen_at');
    expect(fieldNames).not.toContain('last_seen_at');
  });
});
