import { createReadStream } from 'fs';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import type { RawPermitRecord } from '@/lib/permits/types';

/**
 * Stream-parse a large JSON file of Toronto Open Data building permits.
 *
 * The file is expected to be a root-level JSON array of objects, potentially
 * 220 MB or more. We use `stream-json` so that memory usage stays bounded
 * regardless of file size.
 *
 * Records are accumulated into batches of `batchSize` (default 5 000) and
 * handed off to the `onBatch` callback. The final partial batch (if any)
 * is flushed after the stream ends.
 *
 * @returns The total number of records processed.
 */
export async function parsePermitsStream(
  filePath: string,
  onBatch: (batch: RawPermitRecord[]) => Promise<void>,
  batchSize: number = 5000
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let total = 0;
    let batch: RawPermitRecord[] = [];

    const pipeline = createReadStream(filePath)
      .pipe(parser())
      .pipe(streamArray());

    // Track whether we are currently draining a batch so we can apply
    // backpressure to the readable stream and avoid unbounded buffering.
    let processing = false;

    async function flushBatch(): Promise<void> {
      if (batch.length === 0) return;
      const current = batch;
      batch = [];
      await onBatch(current);
    }

    pipeline.on('data', ({ value }: { key: number; value: RawPermitRecord }) => {
      batch.push(value);
      total++;

      if (batch.length >= batchSize && !processing) {
        processing = true;
        pipeline.pause();

        flushBatch()
          .then(() => {
            processing = false;
            pipeline.resume();
          })
          .catch((err) => {
            pipeline.destroy(err);
          });
      }
    });

    pipeline.on('end', () => {
      // Flush any remaining records in the final partial batch.
      flushBatch()
        .then(() => resolve(total))
        .catch(reject);
    });

    pipeline.on('error', (err: Error) => {
      reject(err);
    });
  });
}
