import { createHash } from 'crypto';
import type { RawPermitRecord } from '@/lib/permits/types';

/**
 * Compute a deterministic SHA-256 hash of a raw permit record.
 *
 * The keys are sorted alphabetically so that object property order
 * (which is not guaranteed by the JSON spec) does not affect the digest.
 * Identical input always produces the identical hex string.
 */
export function computePermitHash(raw: RawPermitRecord): string {
  const sorted: Record<string, string> = {};
  const keys = Object.keys(raw).sort() as (keyof RawPermitRecord)[];

  for (const key of keys) {
    sorted[key] = raw[key];
  }

  const payload = JSON.stringify(sorted);
  return createHash('sha256').update(payload).digest('hex');
}
