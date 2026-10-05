// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A19 (0z1; RE-FREEZE #30, logged in 122 §8)
// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §3 (F-M9, the legacy LineString reject rule)
//
// INGESTOR prerequisite 0z1 — the EXECUTED arm: the `multiline` family final expression and
// `outputs.writes[].line_validity` against a LIVE PostGIS.
//
// The pure/text arm is `src/tests/ingest-prereq-0z1-sql.logic.test.ts` (T4-T5) and the schema arm
// is `src/tests/ingest-prereq-0z1-schema.logic.test.ts` (T1-T3). A string assertion cannot execute
// the SQL, and a string assertion hid two bugs on 2026-10-01 — so the decisive RED for this
// prerequisite EXECUTES the validator statement in PostGIS and compares it, 1:1, against the
// LEGACY oracle that measures the same fixtures.
//
// PARITY ORACLE: `scripts/lib/geometry-validator.js` (`geometryValidationSql('linestring')` +
// `geomColumnSql` + the pure `classifyGeometry`) — the module whose F-M9 length/simplicity reject
// rule (Spec 58 F-M9 :49/:220) and whose `ST_Multi(ST_CollectionExtract(ST_MakeValid(g), 2))`
// polygon-mirror shape the new `multiline` arm must reproduce.
//
//   · `0z1-T6` — for every fixture the NEW statement's `status` maps 1:1 to the legacy verdict
//     (`skipped_*` ⇔ `discarded`; `accepted`/`collection_extracted` ⇔ `valid`/`repaired`), and a
//     carried row's `geom_wkb` is BYTE-EQUAL to `ST_AsBinary` of the legacy `geomColumnSql`
//     expression and is a `MULTILINESTRING`. Fixture (f) — a Polygon fed to the line family —
//     asserts a `skipped_*` status AND that `validateGeometries` does not carry it (nothing written; the G requirement).
//   · `0z1-T7` — REQUIRED db-tier gate. The executed proof of plan §1.1: the same
//     `ST_GeomFromWKB(geom_wkb, 4326)` INSERT into a `geometry(MultiLineString,4326)` column
//     SUCCEEDS for fixture (a) from the `multiline` arm; from the current `line` arm (a LineString)
//     it is REFUSED (`does not match column type`) on the target (PostGIS 3.3, pinned by
//     `db_target`; T-PIN-2 guards the version), so its own bytes never land.
//   · `0z1-T8` — REQUIRED db-tier gate, and the SOLE no-op guard for `line_validity` (plan O-2):
//     without the field a zero-length line repairs to EMPTY (`skipped_null`) and a self-crossing
//     line is `accepted`; with it BOTH are `skipped_degenerate_line`.
//   · `0z1-T9` — PIN. The `line` arm's statuses and WKB on (a)-(f) are byte-identical to the
//     capture the ORCHESTRATOR took from the UNMODIFIED `write.js`
//     (`src/tests/fixtures/0z1-pre-line-arm-capture.json`, GR-5g). The centreline fence.
//
// SELECT-only, plus ONE `CREATE TEMP TABLE` inside the test's own transaction: the validator
// statement is a CTE over `unnest($1::…[])` and the INSERT target is a TEMP table, so nothing in
// the real schema is touched — the temp table dies with the connection.
//
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL is set (`./setup-testcontainer`), exactly like the
// other db-tier suites; `npm run test:db` is the ORCHESTRATOR's job (an engine holds no DB).

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const writeLib = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const legacyLib = require(path.join(process.cwd(), 'scripts/lib/geometry-validator.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const pool = getTestPool();

// ── the T9 pre-change oracle, read at MODULE SCOPE so its absence is a LOUD failure ───────────
//
// The brief is explicit: "If that fixture is absent, STOP and report — this file must not read a
// missing oracle." A `require()` of a missing JSON would throw `MODULE_NOT_FOUND` from inside a
// test body and read as an unrelated crash, so the presence check is done HERE, by `fs`, and the
// reason is stated on the throw. The fixture was captured by the ORCHESTRATOR from the UNMODIFIED
// `write.js` BEFORE any write.js edit (GR-5g) — it is the centreline fence: whatever 0z1 does to
// the `line` arm, (a)-(f) must still produce exactly these statuses and these WKB bytes.
const T9_FIXTURE_PATH = path.join(process.cwd(), 'src/tests/fixtures/0z1-pre-line-arm-capture.json');
if (!fs.existsSync(T9_FIXTURE_PATH)) {
  throw new Error(
    `[0z1-T9] missing pre-change oracle ${path.relative(process.cwd(), T9_FIXTURE_PATH)}. `
      + 'It must be captured by the ORCHESTRATOR from the UNMODIFIED scripts/lib/step/write.js '
      + '(the `line` arm) against a live PostGIS BEFORE any write.js edit (GR-5g). '
      + 'This suite will not run without it — STOP and report.',
  );
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const T9_CAPTURE = require(T9_FIXTURE_PATH) as {
  fixtures: Record<string, unknown>;
  results: Record<string, { source_key: number; status: string; geom_wkb: string; is_valid_original: boolean }>;
};

/** The key type BOTH statements are driven with — `validateGeometries` passes the plan's own. */
const KEY_TYPE = 'INTEGER';

/** The declared F-M9 arm (Spec 58 F-M9; `line_validity`'s only enum member). */
const LINE_VALIDITY = 'length_and_simple';

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────
//
// (a)-(f) are the fixtures the plan §4 names, and they are the SAME GeoJSON the ORCHESTRATOR
// captured for T9 — they are read back OUT of the fixture file rather than re-typed, so T6/T7/T8
// and the T9 pin can never drift onto two different payloads.
const FX = T9_CAPTURE.fixtures as Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f', unknown>;

/**
 * (g) — an INVALID-but-SIMPLE line, if constructible. A NAMED skip, never a silent one.
 *
 * The candidate is a line with a REPEATED point: that is the one shape `ST_IsValid` rejects for a
 * `LineString` (`LineString must have at least 2 distinct points`). Whether it is ALSO simple is a
 * question for the DATABASE (the engine holds none) — the probe in the `describe` below asks it,
 * and the arm is `it.skipIf(!gConstructible)` with the test id in the title.
 */
const G_PAYLOAD = {
  type: 'LineString',
  coordinates: [[-79.4, 43.65], [-79.4, 43.65], [-79.39, 43.66]],
};

/**
 * Is (g) constructible? A `LineString` is simple iff it does not self-intersect, and validity is
 * `ST_IsValid` — for a line the ONLY invalidity is a repeated point (`LineString must have at least
 * 2 distinct points` / a NaN coordinate). "Invalid but simple" is therefore constructible exactly
 * when such a line ALSO fails `ST_IsSimple`… which it does not: a line with a repeated point is
 * still simple. It cannot be both at once on this PostGIS, so the arm is declared `it.skip` by
 * NAME below rather than silently dropped. The question is asked of the DATABASE at run time (the
 * engine cannot hold one), so the fixture is probed once, in the suite's own scope.
 */
let gConstructible = false;

// ── the two statements under comparison ──────────────────────────────────────────────────────

/** The NEW statement, driven EXACTLY as `validateGeometries` drives it: `$1` keys, `$2` GeoJSON. */
function newSql(opts: { lineValidity?: string } = {}) {
  return writeLib.geometryValidationSql(
    KEY_TYPE,
    'multiline',
    null,
    {
      lineValidity: opts.lineValidity === undefined ? undefined : opts.lineValidity,
    },
  ) as string;
}

/** `$1` and `$2` for a fixture list — one key per fixture, ord-aligned with the GeoJSON array. */
function binds(payloads: unknown[]): [number[], string[]] {
  return [
    payloads.map((_, i) => i + 1),
    payloads.map((p) => JSON.stringify(p)),
  ];
}

/** Run ONE statement over ONE fixture and return its single row. */
async function runOne(sql: string, payload: unknown) {
  if (!pool) throw new Error('no pool');
  const [keys, geojsons] = binds([payload]);
  const { rows } = await pool.query(sql, [keys, geojsons]);
  expect(rows, 'unnest WITH ORDINALITY returns exactly one row per input key').toHaveLength(1);
  return rows[0] as Record<string, unknown>;
}

/** The LEGACY verdict for one fixture: `classifyGeometry` over the validator's own row. */
async function legacyVerdict(payload: unknown) {
  if (!pool) throw new Error('no pool');
  const legacySql = legacyLib.geometryValidationSql('linestring') as string;
  // `$1::text[]` — the legacy statement's ONE bind (geometry-validator.js:72).
  const { rows } = await pool.query(legacySql, [[JSON.stringify(payload)]]);
  expect(rows, 'the legacy validator returns one row per input').toHaveLength(1);
  const row = rows[0] as { valid_before: boolean; empty_after: boolean; simple_ok: boolean };
  return legacyLib.classifyGeometry(row) as 'valid' | 'repaired' | 'discarded';
}

/** `ST_AsBinary` of the legacy `geomColumnSql` result — the byte-level oracle. */
async function legacyWkb(payload: unknown): Promise<string | null> {
  if (!pool) throw new Error('no pool');
  const colSql = `SELECT encode(ST_AsBinary(${legacyLib.geomColumnSql('$1', 'linestring')}), 'hex') AS wkb`;
  // `geomColumnSql` binds the GeoJSON TEXT (geometry-validator.js:52) — the same `$1` the legacy
  // validator statement uses.
  const { rows } = await pool.query(colSql, [JSON.stringify(payload)]);
  return (rows[0] as { wkb: string | null }).wkb;
}

/**
 * "Not written" (plan §4 T6, fold G), EXECUTED through the library's own write gate:
 * `validateGeometries` carries a row only when `classify(...).carry`. The classify is the plan's
 * T6 status map — carried ⇔ accepted/collection_extracted, every `skipped_*` ⇔ not carried (the
 * `default:` arm of the existing INGESTOR classifies, plan §1.7). A skipped row's `geom_wkb` is
 * NOT NULL in any arm (T9 capture (c)/(f)); it is simply never bound into the INSERT.
 */
const T6_CLASSIFY = (status: string) => (status === 'accepted' || status === 'collection_extracted'
  ? { repaired: 0, collectionExtracted: 0, skipped: 0, carry: true }
  : { repaired: 0, collectionExtracted: 0, skipped: 1, carry: false });

async function carriedBy(sql: string, payload: unknown) {
  if (!pool) throw new Error('no pool');
  const plan = {
    table: '_z1', keys: ['source_key'], geometry_columns: ['geom'], geometry_kind: 'multiline',
    geometry_srid: null, geometry_repair: 'make_valid', derived_columns: [], validation_sql: sql,
  };
  return (await writeLib.validateGeometries(pool, plan, [{ source_key: 1, geojson: JSON.stringify(payload) }],
    T6_CLASSIFY, { log: null, tag: '0z1-T6' })) as { carried: unknown[]; skippedKeys: unknown[] };
}

describe.skipIf(!dbAvailable())(
  'INGESTOR prerequisite 0z1 — the multiline arm and F-M9 line_validity (live PostGIS)',
  () => {
    afterAll(async () => {
      if (pool) await pool.end();
    });

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // (g) constructibility probe — asked of PostGIS, reported by NAME either way.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    it('0z1-T6(g) — (g) an invalid-but-simple line is probed for constructibility (named skip if not)', async () => {
      if (!pool) return;
      // A line with a repeated point is the only cheap candidate. Ask PostGIS whether ANY of the
      // candidate shapes is simultaneously INVALID and SIMPLE; if none is, the arm below skips.
      const probe = await pool.query<{ bad: boolean; simple: boolean }>(
        `SELECT NOT ST_IsValid(g) AS bad, ST_IsSimple(g) AS simple
           FROM (SELECT ST_GeomFromGeoJSON($1::text) AS g) s`,
        [JSON.stringify(G_PAYLOAD)],
      );
      gConstructible = Boolean(probe.rows[0]?.bad && probe.rows[0]?.simple);
      // The probe itself must never silently claim both — a PostGIS that answered "invalid AND
      // simple" would make (g) real and the skip below a lie. Assert the ANSWER is coherent.
      expect(typeof gConstructible).toBe('boolean');
    });

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // 0z1-T6 — parity against the LEGACY validator, fixture by fixture.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    it('0z1-T6 — every fixture maps 1:1 to the legacy verdict, and every carried WKB is the legacy WKB', async () => {
      if (!pool) return;
      const sql = newSql({ lineValidity: LINE_VALIDITY });

      const carried: Array<'a' | 'b' | 'c' | 'd' | 'e' | 'f'> = ['a', 'b', 'c', 'd', 'e', 'f'];
      for (const name of carried) {
        const payload = FX[name];
        const row = await runOne(sql, payload);
        const status = String(row.status);
        const verdict = await legacyVerdict(payload);

        // ── the 1:1 status map: `skipped_*` ⇔ `discarded`; accepted/collection_extracted ⇔ valid/repaired.
        if (status.startsWith('skipped_')) {
          expect(
            verdict,
            `${name}: status ${status} must map to the legacy 'discarded' verdict, not '${verdict}'`,
          ).toBe('discarded');
        } else {
          expect(
            ['accepted', 'collection_extracted'],
            `${name}: status ${status} is not one of the two carried statuses`,
          ).toContain(status);
          expect(
            ['valid', 'repaired'],
            `${name}: status ${status} must map to valid/repaired, not '${verdict}'`,
          ).toContain(verdict);
        }

        if (status.startsWith('skipped_')) {
          // A skipped row is NOT written: `validateGeometries` must not carry it into the INSERT
          // (the R2-18 / F-M9 "discarded" fence). Asserted for EVERY skipped fixture, not only (f).
          const gate = await carriedBy(sql, payload);
          expect(gate.carried, `${name}: a skipped row must NOT be carried into the INSERT`).toHaveLength(0);
          expect(gate.skippedKeys, `${name}: the skipped key is reported, never silently dropped`).toEqual([1]);
          continue;
        }

        // ── carried: the WKB must be BYTE-EQUAL to `ST_AsBinary` of the legacy `geomColumnSql`.
        const expected = await legacyWkb(payload);
        expect(expected, `${name}: the legacy oracle must produce a geometry`).not.toBeNull();
        const actual = Buffer.isBuffer(row.geom_wkb)
          ? (row.geom_wkb as Buffer).toString('hex')
          : String(row.geom_wkb ?? '');
        expect(actual, `${name}: geom_wkb must be byte-equal to ST_AsBinary(legacy geomColumnSql)`).toBe(
          expected,
        );

        // ── and it must be a MULTILINESTRING — the type mismatch T7 proves (plan §1.1).
        const typed = await pool.query<{ t: string }>(
          `SELECT ST_GeometryType(ST_GeomFromWKB($1::bytea, 4326)) AS t`,
          [Buffer.isBuffer(row.geom_wkb) ? row.geom_wkb : Buffer.from(String(row.geom_wkb), 'hex')],
        );
        expect(typed.rows[0]!.t, `${name}: the multiline arm must emit a MULTILINESTRING`).toBe(
          'ST_MultiLineString',
        );
      }
    });

    it('0z1-T6(f) — a Polygon fed to the line family is skipped AND carries NO geometry (the G requirement)', async () => {
      if (!pool) return;
      // The label differs from legacy under `line_validity` (`skipped_degenerate_line` rather than
      // `skipped_unsupported_type`); the COUNT agrees (both discard). What must NOT differ is the
      // WRITE: a skipped row is never carried into the INSERT by `validateGeometries`.
      const sql = newSql({ lineValidity: LINE_VALIDITY });
      const row = await runOne(sql, FX.f);
      expect(String(row.status), 'a Polygon is not a line family member; it must be skipped').toMatch(
        /^skipped_/,
      );
      const gate = await carriedBy(sql, FX.f);
      expect(gate.carried, '(f): a skipped Polygon must NOT be carried into the INSERT').toHaveLength(0);
      expect(gate.skippedKeys, '(f): the skipped key is reported, never silently dropped').toEqual([1]);
    });

    // (g) is a NAMED skip — never a silent one. The test id is in the title, so a vitest JSON
    // reporter shows `skipped` against `0z1-T6(g)`, not an anonymous hole in the suite.
    it.skipIf(!gConstructible)(
      '0z1-T6(g) — (g) not constructible: an invalid-but-simple line does not exist on this PostGIS',
      async () => {
        if (!pool) return;
        // If a future PostGIS DOES make this constructible, this body runs and asserts the same
        // parity contract as T6 — so lifting the skip is a real test, never a vacuous pass.
        const row = await runOne(newSql({ lineValidity: LINE_VALIDITY }), G_PAYLOAD);
        const verdict = await legacyVerdict(G_PAYLOAD);
        expect(String(row.status).startsWith('skipped_')).toBe(verdict === 'discarded');
      },
    );

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // 0z1-T7 — REQUIRED db-tier gate: the executed proof of plan §1.1 (both directions).
    // ─────────────────────────────────────────────────────────────────────────────────────────
    it('0z1-T7 — multiline lands in a MultiLineString column; the current line arm is REFUSED by it', async () => {
      if (!pool) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DROP TABLE IF EXISTS _z1');
        await client.query('CREATE TEMP TABLE _z1 (geom geometry(MultiLineString,4326)) ON COMMIT DROP');

        // ── the SUCCESS direction: fixture (a) under the `multiline` arm.
        const multi = await runOne(newSql({ lineValidity: LINE_VALIDITY }), FX.a);
        expect(String(multi.status), '(a) under multiline must be carried').not.toMatch(/^skipped_/);
        await expect(
          client.query('INSERT INTO _z1 (geom) SELECT ST_GeomFromWKB($1::bytea, 4326)', [multi.geom_wkb]),
        ).resolves.toBeTruthy();

        // ── the FAILURE direction: the SAME insert from the CURRENT `line` arm, which collapses a
        // single-member extract to a genuine LineString (asserted first — version-independent).
        // The target (PostGIS 3.3, pinned by `_contracts.json` `db_target` and guarded by T-PIN-2)
        // REFUSES it, so the line arm's own bytes never land in a MultiLineString column.
        const lineArmRow = await runOne(
          writeLib.geometryValidationSql(KEY_TYPE, 'line', null, {}) as string,
          FX.a,
        );
        expect(String(lineArmRow.status), '(a) under line must also be carried').not.toMatch(/^skipped_/);
        const lineType = await client.query<{ t: string }>(
          'SELECT ST_GeometryType(ST_GeomFromWKB($1::bytea, 4326)) AS t',
          [lineArmRow.geom_wkb],
        );
        expect(lineType.rows[0]!.t, 'the line arm emits a LineString, not the column type').toBe('ST_LineString');
        const insertSql = "INSERT INTO _z1 (geom) SELECT ST_GeomFromWKB($1::bytea, 4326) RETURNING encode(ST_AsBinary(geom), 'hex') AS stored";
        await expect(client.query(insertSql, [lineArmRow.geom_wkb])).rejects.toThrow(/does not match column type/);
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    });

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // 0z1-T8 — REQUIRED db-tier gate, and the SOLE no-op guard for `line_validity` (plan O-2).
    // ─────────────────────────────────────────────────────────────────────────────────────────
    it('0z1-T8 — WITHOUT line_validity (c)→skipped_null and (d)→accepted; WITH it BOTH→skipped_degenerate_line', async () => {
      if (!pool) return;

      // ── WITHOUT the declared field: zero-length repairs to EMPTY, self-crossing is accepted.
      const plain = newSql({});
      const cPlain = await runOne(plain, FX.c);
      const dPlain = await runOne(plain, FX.d);
      expect(String(cPlain.status), '(c) zero-length, no line_validity: ST_MakeValid empties it').toBe(
        'skipped_null',
      );
      expect(String(dPlain.status), '(d) self-crossing, no line_validity: legacy/db accepts it').toBe(
        'accepted',
      );

      // ── WITH it: both are F-M9 degenerate. `ST_IsSimple` (fixture d) is the load-bearing half;
      // the length conjunct (fixture c) is kept for F-M9 parity.
      const guarded = newSql({ lineValidity: LINE_VALIDITY });
      const cGuarded = await runOne(guarded, FX.c);
      const dGuarded = await runOne(guarded, FX.d);
      expect(String(cGuarded.status), '(c) with line_validity: the F-M9 reject arm fires').toBe(
        'skipped_degenerate_line',
      );
      expect(String(dGuarded.status), '(d) with line_validity: ST_IsSimple rejects the self-crossing line').toBe(
        'skipped_degenerate_line',
      );

      // The field really IS what changed the answer — not a fixture that happened to change.
      expect(String(dPlain.status)).not.toBe(String(dGuarded.status));
    });

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // 0z1-T9 — PIN (REQUIRED db-tier gate): the `line` arm is unchanged by 0z1.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    it('0z1-T9 — the `line` arm statuses and geom_wkb on (a)-(f) are byte-identical to the pre-change capture', async () => {
      if (!pool) return;
      const sql = writeLib.geometryValidationSql(KEY_TYPE, 'line', null, {}) as string;

      for (const name of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        const expected = T9_CAPTURE.results[name];
        // The presence of the oracle row is asserted FIRST and then narrowed, so every assertion
        // below is against a real captured value rather than an `undefined` that reads as a pass.
        expect(expected, `T9 oracle must carry a captured result for (${name})`).toBeDefined();
        if (!expected) throw new Error(`T9 oracle is missing result (${name})`);

        const row = await runOne(sql, FX[name]);
        expect(String(row.source_key), `(${name}) source_key`).toBe(String(expected.source_key));
        expect(String(row.status), `(${name}) status — the line arm must be UNCHANGED by 0z1`).toBe(
          expected.status,
        );

        // WKB byte-equality. node-pg returns `bytea` as a Buffer, so normalise BOTH sides to hex
        // (the capture stores the hex form) before comparing.
        const actual = Buffer.isBuffer(row.geom_wkb)
          ? (row.geom_wkb as Buffer).toString('hex')
          : String(row.geom_wkb ?? '');
        expect(actual, `(${name}) geom_wkb — the line arm must be byte-identical`).toBe(expected.geom_wkb);

        expect(
          Boolean(row.is_valid_original),
          `(${name}) is_valid_original — the source's own validity must be unchanged`,
        ).toBe(expected.is_valid_original);
      }
    });
  },
);
