// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A19 (0z1; RE-FREEZE #30, logged in 122 §8)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (the geometry family + its axes)
// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §3 (F-M9, the legacy LineString reject rule)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1 (a new family/field carries an x-ruling)
//
// INGESTOR prerequisite 0z1 (2026-10-02) — `geometry_kind:"multiline"` (the ST_Multi line arm) plus
// `outputs.writes[].line_validity` (Spec 58 F-M9, `length_and_simple`).
//
// The legacy zoning loaders write `geometry(MultiLineString,4326)` columns filled by
// `ST_Multi(ST_CollectionExtract(ST_MakeValid(g), 2))`. The library's `line` arm does NEITHER: it
// collapses a single-member extract to a true `LineString` and accepts only `ST_LineString`, so it
// is a type mismatch against a MultiLineString column (plan §1.1). `multiline` is the FOURTH
// declared family — polygon's `ST_Multi(COALESCE(ST_CollectionExtract(repaired, N), repaired))`
// shape over extract type 2, accepting `('ST_LineString','ST_MultiLineString')`.
//
// F-M9 is the SECOND axis: a write may declare `line_validity:"length_and_simple"`, which renders
// `(ST_Length(geom::geography) > 0 AND ST_IsSimple(geom)) AS line_ok` over the PRE-repair `geom`
// (legacy's operand) and a FIRST CASE arm `WHEN NOT line_ok THEN 'skipped_degenerate_line'`. It is
// DECLARED-only: absent ⇒ not one byte of new text (0z1 inherits 0t's/0g's byte-identity locks).
//
// ── THIS FILE IS A PIN AND A RED ────────────────────────────────────────────────────────────────
//   · `0z1-T4` — PIN, GREEN before and after. `geometryValidationSql(...)` for polygon/point/line
//     (default repair) and polygon (repair `none`) is BYTE-IDENTICAL to the snapshots the
//     ORCHESTRATOR captured from the UNMODIFIED `write.js` (`src/tests/fixtures/0z1-pre-validation-sql.json`,
//     brief 2a, GR-5g — the fixture carries `geometryValidationSql` AND `ingestor_validation_sql`),
//     and every converted INGESTOR's `buildWritePlan(write, descriptor).validation_sql` equals its
//     snapshot. The fixture text contains NO `line_ok`: nothing new is appended unless declared.
//   · `0z1-T5` — RED until briefs 8–14 land (`write.js`) and 15 re-pins
//     `src/tests/step-library.logic.test.ts:5637`. One `it` per row.
//
// A NEW file, never appended to the 7,400-line `step-library.logic.test.ts`; its shape is copied
// from `src/tests/ingest-prereq-0u.logic.test.ts`.
//
// NOTE ON FIXTURE KEY NAMES: the brief 2b body calls the two maps `validation_sql` and
// `plan_validation_sql`, but the COMMITTED fixture (brief 2a) names them `geometryValidationSql`
// and `ingestor_validation_sql`. The fixture is the artifact of record, so this test reads the
// ACTUAL keys rather than renaming them from the test side.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const writeLib = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const PRE = require(path.join(process.cwd(), 'src/tests/fixtures/0z1-pre-validation-sql.json'));
const LOAD_RAVINES = require(path.join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
const LOAD_ADDRESS_POINTS = require(path.join(process.cwd(), 'scripts/load-address-points.descriptor.json'));
const LOAD_PARCELS = require(path.join(process.cwd(), 'scripts/load-parcels.descriptor.json'));
const LOAD_CENTRELINE = require(path.join(process.cwd(), 'scripts/load-centreline.descriptor.json'));
const LOAD_MASSING = require(path.join(process.cwd(), 'scripts/load-massing.descriptor.json'));
const LOAD_NEIGHBOURHOODS = require(path.join(process.cwd(), 'scripts/load-neighbourhoods.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** The T0 pin shape: the `sha256(sql).slice(0, 16)` digest the 0t/0u suites use (plan fact 8). */
const hash16 = (sql: string | null) =>
  createHash('sha256').update(String(sql)).digest('hex').slice(0, 16);

/** The PRE-change snapshots, keyed as brief 2a wrote them. */
const PRE_GEOMETRY_SQL = PRE.geometryValidationSql as Record<string, string>;
const PRE_INGESTOR_SQL = PRE.ingestor_validation_sql as Record<string, string>;

/**
 * The six converted INGESTOR descriptors whose `buildWritePlan(...).validation_sql` the fixture
 * captured. Keyed `<descriptor identity.name>|<write.table>` — the exact key shape brief 2a wrote.
 */
const CONVERTED: Array<[string, Record<string, unknown>]> = [
  ['load_ravines', LOAD_RAVINES],
  ['address_points', LOAD_ADDRESS_POINTS],
  ['parcels', LOAD_PARCELS],
  ['load_centreline', LOAD_CENTRELINE],
  ['massing', LOAD_MASSING],
  ['neighbourhoods', LOAD_NEIGHBOURHOODS],
];

/**
 * W — a minimal `multiline` write the T5 rows build plans from. A clone of `load_ravines`'s real
 * write (so every other axis the schema requires is declared), with the geometry axes set for the
 * line family. `line_validity` is added by the caller only where the row declares it.
 */
const MULTILINE_WRITE = (overrides: Record<string, unknown> = {}) => {
  const s = clone(LOAD_RAVINES.outputs.writes[0]) as Record<string, unknown>;
  s.geometry_kind = 'multiline';
  return Object.assign(s, overrides);
};

/** A `polygon` write, for the `line_validity`-on-polygon refusal row. */
const POLYGON_WRITE = () => {
  const s = clone(LOAD_RAVINES.outputs.writes[0]) as Record<string, unknown>;
  s.geometry_kind = 'polygon';
  return s;
};

/** Count occurrences of a fragment (so "contains NEITHER byte" is provable, not assumed). */
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('INGESTOR prerequisite 0z1 — SQL text: multiline arm + line_validity (T4 PIN / T5 RED)', () => {
  // ---------------------------------------------------------------------------
  // 0z1-T4 — PIN (GREEN before and after). The three existing families' text is
  // BYTE-IDENTICAL to the snapshots captured from the UNMODIFIED module, and no
  // `line_ok` byte exists in any of them. This is the plan §1.8 byte-identity lock.
  // ---------------------------------------------------------------------------
  describe('0z1-T4 — geometryValidationSql is byte-identical to the PRE-change snapshots', () => {
    it('0z1-T4 — polygon/point/line under default repair, and polygon under repair "none", match the fixture EXACTLY (string and digest)', () => {
      const cases: Array<[string, string, { repair?: 'make_valid' | 'none' }]> = [
        ['polygon|default', 'polygon', {}],
        ['point|default', 'point', {}],
        ['line|default', 'line', {}],
        ['polygon|none', 'polygon', { repair: 'none' }],
      ];
      for (const [fixtureKey, kind, opts] of cases) {
        const expected = PRE_GEOMETRY_SQL[fixtureKey];
        // The fixture row must be present and a real string — a missing key would let the
        // `===` below compare against `undefined` and pass for the wrong reason.
        expect(expected, `fixture must carry ${fixtureKey}`).toBeTypeOf('string');
        const actual = writeLib.geometryValidationSql('BIGINT', kind, null, opts) as string;
        // EXACT string identity — this is the byte-identity lock, not a `contains`.
        expect(actual, `${fixtureKey}: geometryValidationSql must be byte-identical`).toBe(expected);
        // …and the digest agrees (a cheaper, human-legible corroboration).
        expect(hash16(actual), `${fixtureKey}: sha256 digest`).toBe(hash16(expected ?? null));
        // NOTHING new is appended unless declared: the PRE text carries no `line_ok`.
        expect(actual, `${fixtureKey}: no line_ok before the field is declared`).not.toContain('line_ok');
      }
    });

    it('0z1-T4 — the fixture text itself contains NO `line_ok` (nothing new unless declared)', () => {
      for (const [key, sql] of Object.entries(PRE_GEOMETRY_SQL)) {
        expect(count(sql, 'line_ok'), `fixture ${key}: line_ok must not appear`).toBe(0);
        expect(count(sql, 'skipped_degenerate_line'), `fixture ${key}: the new status must not appear`).toBe(0);
      }
      for (const [key, sql] of Object.entries(PRE_INGESTOR_SQL)) {
        expect(count(sql, 'line_ok'), `fixture ${key}: line_ok must not appear`).toBe(0);
        expect(count(sql, 'skipped_degenerate_line'), `fixture ${key}: the new status must not appear`).toBe(0);
      }
    });

    it('0z1-T4 — every converted INGESTOR\'s buildWritePlan(...).validation_sql equals its snapshot', () => {
      for (const [name, descriptor] of CONVERTED) {
        const d = descriptor as { outputs: { writes: Array<Record<string, unknown>> } };
        for (const write of d.outputs.writes) {
          const table = String(write.table);
          const key = `${name}|${table}`;
          const expected = PRE_INGESTOR_SQL[key];
          // Only writes the fixture captured carry a `validation_sql` snapshot. A write with no
          // `wkb_geometry` column builds `validation_sql: null` and was (correctly) not captured.
          if (expected === undefined) continue;
          const plan = writeLib.buildWritePlan(write, descriptor);
          expect(plan.validation_sql, `${key}: buildWritePlan validation_sql must be byte-identical`)
            .toBe(expected);
          expect(hash16(plan.validation_sql as string | null), `${key}: sha256 digest`)
            .toBe(hash16(expected));
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 0z1-T5 — RED until briefs 8–14 (write.js) and 15 (step-library :5637) land.
  // ---------------------------------------------------------------------------
  describe('0z1-T5 — the `multiline` family and the `line_validity` axis (RED until 0z1 8–14)', () => {
    it('0z1-T5 — assertGeometryKind("multiline", "t") returns "multiline"', () => {
      // RED today: write.js throws `unknown geometry_kind 'multiline'` (GEOMETRY_KINDS has 3 members).
      expect(writeLib.assertGeometryKind('multiline', 't')).toBe('multiline');
    });

    it('0z1-T5 — GEOMETRY_KINDS is the four declared families', () => {
      // G: ONLY this `toEqual` list moves when 0z1 lands. Brief 15 re-pins the sibling copy at
      // `src/tests/step-library.logic.test.ts:5637` IN THE SAME COMMIT — and touches NOTHING else:
      // `:5373`/`:5642` (`/unknown geometry_kind/`) and the surrounding T5 assertions
      // (`.line === 2`, `ST_LineString` accepted, never `ST_Multi`, the curve throw) stay as they are.
      expect(writeLib.GEOMETRY_KINDS).toEqual(['polygon', 'point', 'line', 'multiline']);
    });

    it('0z1-T5 — the multiline extract type and accepted-type set mirror polygon\'s two-member shape', () => {
      // RED today: both maps are missing the `multiline` key.
      expect(writeLib.GEOMETRY_KIND_EXTRACT_TYPE.multiline).toBe(2);
      expect(writeLib.GEOMETRY_KIND_ACCEPTED_TYPES.multiline).toBe("('ST_LineString','ST_MultiLineString')");
    });

    it('0z1-T5 — buildWritePlan REFUSES line_validity on a polygon write BY NAME, before any SQL is built', () => {
      // RED today: `line_validity` is unknown to write.js and is silently ignored, so no throw.
      const w = POLYGON_WRITE();
      w.line_validity = 'length_and_simple';
      let caught: Error | null = null;
      try {
        writeLib.buildWritePlan(w, LOAD_RAVINES);
      } catch (err) {
        caught = err as Error;
      }
      expect(caught, 'a line_validity on a polygon write must be refused by name').not.toBeNull();
      const err = caught as unknown as Error;
      // The throw is a NAMED error (`InvalidLineValidityError` or an existing named error) whose
      // message names the field — never a generic crash.
      expect(err.name, 'the refusal must be a named error').toMatch(/Error$/);
      expect(err.message).toMatch(/line_validity/);
    });

    it('0z1-T5 — buildWritePlan REFUSES multiline + geometry_repair:"none" BY NAME, and validation_sql is never produced', () => {
      // RED today: `multiline` is refused only as `unknown geometry_kind` deeper in the builder
      // (an unnamed-for-this-reason error), and `geometry_repair:"none"` is not refused at all.
      const w = MULTILINE_WRITE({ geometry_repair: 'none' });
      let caught: Error | null = null;
      let plan: Record<string, unknown> | null = null;
      try {
        plan = writeLib.buildWritePlan(w, LOAD_RAVINES) as Record<string, unknown>;
      } catch (err) {
        caught = err as Error;
      }
      expect(caught, 'multiline + geometry_repair:"none" must be refused').not.toBeNull();
      expect((caught as unknown as Error).message).toMatch(/geometry_repair/);
      // The refusal precedes codegen: NO plan (hence no `validation_sql`) is produced.
      expect(plan, 'no plan may be returned for a refused write').toBeNull();
    });

    it('0z1-T5 — plan.line_validity is CARRIED, and validation_sql renders `line_ok` + the reject status', () => {
      // RED today: `multiline` is unknown, so the plan is never built.
      const plan = writeLib.buildWritePlan(
        MULTILINE_WRITE({ line_validity: 'length_and_simple' }),
        LOAD_RAVINES,
      ) as Record<string, unknown>;
      expect(plan.line_validity).toBe('length_and_simple');
      const sql = String(plan.validation_sql);
      expect(sql).toContain('AS line_ok');
      expect(sql).toContain("'skipped_degenerate_line'");
    });

    it('0z1-T5 — a multiline write declaring NO line_validity renders NEITHER fragment', () => {
      // RED today: `multiline` is unknown, so the plan is never built.
      const plan = writeLib.buildWritePlan(MULTILINE_WRITE(), LOAD_RAVINES) as Record<string, unknown>;
      const sql = String(plan.validation_sql);
      expect(count(sql, 'line_ok'), 'no line_validity ⇒ no line_ok').toBe(0);
      expect(count(sql, 'skipped_degenerate_line'), 'no line_validity ⇒ no reject status').toBe(0);
    });

    it('0z1-T5 — the multiline final expression is ST_Multi(COALESCE(ST_CollectionExtract(repaired, 2), repaired))', () => {
      // The polygon-mirroring shape (plan §3b): MIRRORS polygon's two-member form over extract 2.
      // RED today: `multiline` is unknown, so the statement is never built.
      const sql = writeLib.geometryValidationSql('BIGINT', 'multiline', null) as string;
      expect(sql).toContain('ST_Multi(COALESCE(ST_CollectionExtract(repaired, 2), repaired))');
    });
  });
});
