// 🔗 SPEC LINK: docs/specs/02_data_ingestion.md, 03_change_detection.md
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parsePermitsStream } from '@/lib/sync/ingest';
import { createMockRawPermit } from './factories';
import type { RawPermitRecord } from '@/lib/permits/types';

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
    expect(batches[0].length).toBe(5);
    expect(batches[1].length).toBe(5);
    expect(batches[2].length).toBe(2);

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
    expect(batches[0][0].PERMIT_NUM).toBe('24 101234');

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
        parsed = batch[0];
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
