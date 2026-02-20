import type { Permit, PermitChange } from '@/lib/permits/types';

/** Fields that should be excluded from diff comparison. */
const SKIP_FIELDS = new Set<string>([
  'data_hash',
  'first_seen_at',
  'last_seen_at',
]);

/**
 * Convert an arbitrary value to a string for comparison purposes.
 * Dates are serialised as ISO strings; null/undefined become the literal "null".
 */
function toComparable(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Compare two partial Permit objects field-by-field and return an array
 * of PermitChange entries for every field whose stringified value differs.
 *
 * `data_hash`, `first_seen_at`, and `last_seen_at` are intentionally
 * excluded because they are bookkeeping values, not permit data.
 */
export function diffPermitFields(
  oldPermit: Partial<Permit>,
  newPermit: Partial<Permit>
): PermitChange[] {
  const changes: PermitChange[] = [];

  // Collect the union of all keys present in either object.
  const allKeys = new Set<string>([
    ...Object.keys(oldPermit),
    ...Object.keys(newPermit),
  ]);

  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;

    const oldVal = toComparable((oldPermit as Record<string, unknown>)[key]);
    const newVal = toComparable((newPermit as Record<string, unknown>)[key]);

    if (oldVal !== newVal) {
      changes.push({
        permit_num: newPermit.permit_num ?? oldPermit.permit_num ?? '',
        revision_num: newPermit.revision_num ?? oldPermit.revision_num ?? '',
        field_name: key,
        old_value: oldVal === 'null' ? null : oldVal,
        new_value: newVal === 'null' ? null : newVal,
      });
    }
  }

  return changes;
}
