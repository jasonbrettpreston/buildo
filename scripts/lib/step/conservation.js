/**
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §11 KFM 9
 *
 * Row conservation — the ingest identity, and the reason it is an IDENTITY and not a
 * derivation.
 *
 * KFM 9 (Spec 122 §11): a runner-side key-type mismatch silently dropped EVERY row
 * from `validateGeometries` — `parcels` wrote 0 of 495,495 and the run read PASS,
 * because the reported `records_unchanged` was DERIVED (`rows_read - inserted -
 * updated`) rather than MEASURED. A derivation has no way to tell "the write was a
 * no-op" from "the write never happened": both leave `inserted + updated` at 0, so
 * every dropped row — a bad key, a null geometry, a shaped skip, a deduped duplicate,
 * an invalid-geometry skip — silently absorbed into "unchanged" and the audit table
 * showed a healthy corpus. The write bug's 0/495,495 became 495,495 unchanged, PASS.
 *
 * The fix is arithmetic that cannot be satisfied by a bug. Every row the source
 * yielded is accounted for EXACTLY ONCE:
 *
 *     rows_read = Σ(skip counters) + inserted + updated + unchanged
 *
 * `inserted`/`updated`/`unchanged` are what the WRITE measured (the guarded upsert's
 * own no-op count — `rows_scanned - rows_changed` of that write); the skip counters
 * are what the ACQUIRE/SHAPE phase named as a deliberate drop. The identity is
 * checked, never assumed: a mismatch THROWS `RowConservationError` naming every
 * count, so a dropped row is a loud failure instead of a green PASS.
 *
 * A MEASUREMENT GAP IS NEVER A PASS. An absent `rows_read`, or a counter that is
 * present but not a finite number, THROWS — it does not read as 0. "The runner did
 * not measure it" and "the runner measured 0" are different facts, and only the
 * second one is allowed to satisfy the identity.
 *
 * This module is PURE: no clock, no pool, no config, no I/O. It is handed the two
 * counter blocks and returns a verdict-shaped result OR throws. `runIngestPhase`
 * (scripts/lib/step/index.js) calls it after the write; the computes read the
 * measured `written.unchanged` for their `records_unchanged` rows rather than
 * re-deriving it (Spec 122 §11 KFM 9).
 */
'use strict';

/**
 * The acquired counters that name a row the ingest dropped ON PURPOSE. Each is a
 * count of rows the source yielded that the step deliberately did NOT carry to the
 * write — so each must appear on the LEFT of the conservation identity beside
 * inserted/updated/unchanged, never be absorbed into any of them:
 *
 *   · `bad_key_count`             — `coerceKey` could not coerce a usable key
 *   · `null_geometry_count`       — the acquisition seam dropped a geometry-less feature
 *   · `shaped_skipped`            — `shapeRecord` refused the row (feature-type/expiry/empty key)
 *   · `duplicate_key_count`       — `dedupeBySourceId` superseded a repeated key
 *   · `invalid_geometry_skipped`  — the geometry validator dropped the row
 *
 * Absent ⇒ 0 (the step declares it and never dropped any). Present-but-not-finite
 * ⇒ THROW (a counter that is not a number is a measurement bug, not a zero).
 */
// A future on_batch_error "drop_batch" arm in executeWrite (declared by parcels/address_points, unimplemented today — a batch failure rolls back the step txn) MUST add its dropped-ROW count here, or every drop throws RowConservationError (review_followups #68).
const SKIP_COUNTERS = Object.freeze([
  'bad_key_count',
  'null_geometry_count',
  'shaped_skipped',
  'duplicate_key_count',
  'invalid_geometry_skipped',
]);

/**
 * A row-conservation violation — the ingest identity did not hold, or a count it
 * needed was never measured. Carries `counts` (every number the check saw) so a
 * caller or test can read the arithmetic that failed without re-parsing the message.
 */
class RowConservationError extends Error {
  constructor(message, counts) {
    super(message);
    this.name = 'RowConservationError';
    this.counts = counts;
  }
}

/**
 * Read a count from a counter block: absent ⇒ 0, present-but-not-finite ⇒ throw.
 *
 * The distinction is the whole point (KFM 9): a counter that is MISSING is a declared
 * zero (the step's arms never fired); a counter that is present and garbage (`NaN`,
 * `'x'`, `null` explicitly set) is a MEASUREMENT BUG and must never read as a green 0.
 *
 * @param {object} block the acquired (or written) counter block
 * @param {string} key the counter name
 * @param {string} source which block `key` was read from, for the error message
 * @param {object} counts the counts gathered so far, carried onto the error
 * @returns {number}
 */
function readCount(block, key, source, counts) {
  const raw = block == null ? undefined : block[key];
  if (raw === undefined) return 0;
  if (!Number.isFinite(raw)) {
    throw new RowConservationError(
      `row conservation broken: ${source}.${key} is ${JSON.stringify(raw)}, not a finite number`
        + ' — a measurement gap is never a pass (Spec 122 §11 KFM 9)',
      { ...counts, [key]: raw },
    );
  }
  return raw;
}

/**
 * `rowConservation(acquired, written)` — the ingest conservation identity, checked.
 *
 * PURE. Reads `acquired.rows_read` and every `SKIP_COUNTERS` entry from `acquired`,
 * and `inserted`/`updated`/`unchanged` from `written`, then asserts:
 *
 *     accounted = Σ(skipped) + inserted + updated + unchanged === read
 *
 * A `read` that is not a finite number THROWS (KFM 9: a measurement gap is never a
 * pass). A counter present but not finite THROWS. If `accounted !== read`, THROWS a
 * `RowConservationError` whose message names EVERY count — the exact shape the
 * 2026-09-24 write bug needed: `row conservation broken: read 495495 ≠ accounted 0
 * (inserted 0, updated 0, unchanged 0, bad_key_count 0, …) — 495495 row(s)
 * unaccounted for`.
 *
 * @param {object} acquired the acquisition/shape counter block (`rows_read`, the skips)
 * @param {object} written the write's measured counter block (`inserted/updated/unchanged`)
 * @returns {{read:number, skipped:Record<string,number>, inserted:number, updated:number,
 *   unchanged:number, accounted:number}}
 */
function rowConservation(acquired, written) {
  const a = acquired == null ? {} : acquired;
  const w = written == null ? {} : written;

  const counts = {};
  // `rows_read` is the one count that may NOT default to 0: it is the identity's left side,
  // and an absent read would let a run that measured nothing balance at 0 = 0.
  if (a.rows_read === undefined) {
    throw new RowConservationError('row conservation broken: acquired.rows_read was never measured'
      + ' — a measurement gap is never a pass (Spec 122 §11 KFM 9)', {});
  }
  const read = readCount(a, 'rows_read', 'acquired', counts);
  counts.read = read;

  const skipped = {};
  for (const key of SKIP_COUNTERS) {
    skipped[key] = readCount(a, key, 'acquired', counts);
    counts[key] = skipped[key];
  }

  const inserted = readCount(w, 'inserted', 'written', counts);
  const updated = readCount(w, 'updated', 'written', counts);
  const unchanged = readCount(w, 'unchanged', 'written', counts);
  counts.inserted = inserted;
  counts.updated = updated;
  counts.unchanged = unchanged;

  const accounted = SKIP_COUNTERS.reduce((sum, key) => sum + skipped[key], 0)
    + inserted + updated + unchanged;

  if (accounted !== read) {
    const named = [
      `inserted ${inserted}`,
      `updated ${updated}`,
      `unchanged ${unchanged}`,
      ...SKIP_COUNTERS.map((key) => `${key} ${skipped[key]}`),
    ].join(', ');
    const delta = read - accounted;
    throw new RowConservationError(
      `row conservation broken: read ${read} ≠ accounted ${accounted} (${named}) — `
        + `${delta} row(s) unaccounted for (Spec 122 §11 KFM 9)`,
      { ...counts, accounted },
    );
  }

  return { read, skipped, inserted, updated, unchanged, accounted };
}

module.exports = { RowConservationError, SKIP_COUNTERS, rowConservation };
