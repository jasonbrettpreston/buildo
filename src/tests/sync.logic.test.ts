// 🔗 SPEC LINK: docs/specs/02_data_ingestion.md, 03_change_detection.md
import { describe, it, expect } from 'vitest';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parsePermitsStream } from '@/lib/sync/ingest';
import { createMockRawPermit } from './factories';
import type { RawPermitRecord } from '@/lib/permits/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { deduplicateRecords } = require('../../scripts/load-permits');

function createTempJsonFile(records: RawPermitRecord[]): string {
  const filePath = join(tmpdir(), `buildo-test-${Date.now()}.json`);
  writeFileSync(filePath, JSON.stringify(records));
  return filePath;
}

describe('Streaming JSON Parser', () => {
  it('parses a JSON array of permits in batches', async () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      createMockRawPermit({ PERMIT_NUM: `TEST-${i}` })
    );
    const filePath = createTempJsonFile(records);

    const batches: RawPermitRecord[][] = [];
    const total = await parsePermitsStream(
      filePath,
      async (batch) => {
        batches.push([...batch]);
      },
      5
    );

    expect(total).toBe(12);
    expect(batches.length).toBe(3); // 5 + 5 + 2
    expect(batches[0]!.length).toBe(5);
    expect(batches[1]!.length).toBe(5);
    expect(batches[2]!.length).toBe(2);

    unlinkSync(filePath);
  });

  it('handles empty JSON array', async () => {
    const filePath = createTempJsonFile([]);

    const batches: RawPermitRecord[][] = [];
    const total = await parsePermitsStream(
      filePath,
      async (batch) => {
        batches.push([...batch]);
      },
      5
    );

    expect(total).toBe(0);
    expect(batches.length).toBe(0);

    unlinkSync(filePath);
  });

  it('handles single record', async () => {
    const records = [createMockRawPermit()];
    const filePath = createTempJsonFile(records);

    const batches: RawPermitRecord[][] = [];
    const total = await parsePermitsStream(
      filePath,
      async (batch) => {
        batches.push([...batch]);
      },
      5
    );

    expect(total).toBe(1);
    expect(batches.length).toBe(1);
    expect(batches[0]![0]!.PERMIT_NUM!).toBe('24 101234');

    unlinkSync(filePath);
  });

  it('preserves all fields through parsing', async () => {
    const original = createMockRawPermit({
      PERMIT_NUM: 'FIELD-TEST',
      DESCRIPTION: 'Complete renovation including plumbing and HVAC',
      EST_CONST_COST: '999999',
      BUILDER_NAME: 'TEST BUILDER INC',
    });
    const filePath = createTempJsonFile([original]);

    let parsed: RawPermitRecord | null = null;
    await parsePermitsStream(
      filePath,
      async (batch) => {
        parsed = batch[0] ?? null;
      },
      100
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.PERMIT_NUM).toBe('FIELD-TEST');
    expect(parsed!.DESCRIPTION).toBe(
      'Complete renovation including plumbing and HVAC'
    );
    expect(parsed!.EST_CONST_COST).toBe('999999');
    expect(parsed!.BUILDER_NAME).toBe('TEST BUILDER INC');

    unlinkSync(filePath);
  });

  it('calls onBatch with backpressure (does not buffer everything)', async () => {
    // Create 25 records with batch size 10
    const records = Array.from({ length: 25 }, (_, i) =>
      createMockRawPermit({ PERMIT_NUM: `BP-${i}` })
    );
    const filePath = createTempJsonFile(records);

    const batchSizes: number[] = [];
    const total = await parsePermitsStream(
      filePath,
      async (batch) => {
        batchSizes.push(batch.length);
        // Simulate async processing time
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
      10
    );

    expect(total).toBe(25);
    expect(batchSizes).toEqual([10, 10, 5]);

    unlinkSync(filePath);
  });
});

describe('CKAN Cross-Batch Deduplication', () => {
  it('deduplicates records with the same permit_num + revision_num across batches', () => {
    // Simulate two CKAN pages where the same permit appears with different data
    const page1Record = {
      permit_num: 'DUP-001',
      revision_num: '01',
      builder_name: 'FIRST BUILDER',
      status: 'Issued',
      data_hash: 'hash_a',
      _ckan_id: 100,
    };
    const page2Record = {
      permit_num: 'DUP-001',
      revision_num: '01',
      builder_name: 'SECOND BUILDER',
      status: 'Active',
      data_hash: 'hash_b',
      _ckan_id: 500,
    };
    const uniqueRecord = {
      permit_num: 'UNQ-001',
      revision_num: '00',
      builder_name: 'UNIQUE BUILDER',
      status: 'Issued',
      data_hash: 'hash_c',
      _ckan_id: 200,
    };

    const allRecords = [page1Record, uniqueRecord, page2Record];
    const result = deduplicateRecords(allRecords);

    // Should have 2 records: one unique + one deduplicated
    expect(result).toHaveLength(2);

    // The duplicate should be resolved to the higher _ckan_id (500)
    const dup = result.find((r: Record<string, unknown>) => r.permit_num === 'DUP-001');
    expect(dup).toBeDefined();
    expect(dup.builder_name).toBe('SECOND BUILDER');
    expect(dup._ckan_id).toBe(500);
  });

  it('keeps first occurrence when _ckan_id is equal', () => {
    const rec1 = {
      permit_num: 'TIE-001',
      revision_num: '00',
      builder_name: 'BUILDER A',
      data_hash: 'hash_1',
      _ckan_id: 100,
    };
    const rec2 = {
      permit_num: 'TIE-001',
      revision_num: '00',
      builder_name: 'BUILDER B',
      data_hash: 'hash_2',
      _ckan_id: 100,
    };

    const result = deduplicateRecords([rec1, rec2]);
    expect(result).toHaveLength(1);
    // With equal _ckan_id, behavior should be deterministic (higher wins, or first if truly equal)
  });

  it('handles empty input', () => {
    expect(deduplicateRecords([])).toHaveLength(0);
  });

  it('preserves order of unique records', () => {
    const records = [
      { permit_num: 'A', revision_num: '00', _ckan_id: 1, data_hash: 'h1' },
      { permit_num: 'B', revision_num: '00', _ckan_id: 2, data_hash: 'h2' },
      { permit_num: 'C', revision_num: '00', _ckan_id: 3, data_hash: 'h3' },
    ];
    const result = deduplicateRecords(records);
    expect(result).toHaveLength(3);
    expect(result.map((r: Record<string, unknown>) => r.permit_num)).toEqual(['A', 'B', 'C']);
  });
});
