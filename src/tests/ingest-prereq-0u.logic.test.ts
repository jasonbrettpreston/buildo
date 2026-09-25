// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (0u, RE-FREEZE #24)
// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2 (the legacy post-INSERT area pass)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1 (a new schema field
//            carries an x-ruling) and Rule 3 (the unit factor is a constant, the scale is
//            descriptor data)
//
// INGESTOR prerequisite 0u (2026-09-24, WF2 plan §0u, Fold PB-2) — `columns[].derived_from_geometry`.
//
// The legacy massing loader seeds the areas with a SECOND statement, a post-INSERT UPDATE
// (`scripts/load-massing.js`, anchor `footprint_area_sqm = ROUND((ST_Area(`) that reads the
// STORED `geometry` column and writes `footprint_area_sqm = ROUND((ST_Area(<X>::geography))::numeric, 2)`
// and its ft² twin, X = `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)`
// — i.e. exactly the `input.geom` expression the validator already builds at `geometry_srid: 3857`.
//
// 0u makes that a DECLARATION: `columns[].derived_from_geometry {measure, unit, scale}` renders the
// area expression into the validator's OWN inner subquery, over the PRE-repair `geom`, and carries
// the value through `validated` and the final SELECT to the carried row — one round-trip, inside the
// INSERT transaction, with no second statement and no JS arithmetic (node-pg returns `numeric` as a
// STRING; a `Number()` hop would be an inexactness the legacy UPDATE never had).
//
// W (below) is `load_ravines`' real write with the four axes the founding case needs:
// `key_sql_type:"TEXT"`, `geometry_srid:3857`, `geometry_repair:"none"`, and the two derived
// `insert_only` columns. A NEW file, never appended to the 7,200-line `step-library.logic.test.ts`;
// its stub helpers are copied from that file, never imported.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const writeLib = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const pipeline = require(path.join(process.cwd(), 'scripts/lib/pipeline.js'));
const LOAD_RAVINES = require(path.join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
const LOAD_ADDRESS_POINTS = require(path.join(process.cwd(), 'scripts/load-address-points.descriptor.json'));
const LOAD_PARCELS = require(path.join(process.cwd(), 'scripts/load-parcels.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** The T0 pin: the same `sha256(...).slice(0, 16)` shape 0t's own T0 uses (plan fact 8). */
const hash16 = (sql: string | null) => createHash('sha256').update(String(sql)).digest('hex').slice(0, 16);

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/** Whitespace-stripped, so a rendered statement can be compared against legacy FILE TEXT. */
const strip = (sql: string) => sql.replace(/\s+/g, '');

const SQFT_FACTOR = '10.7639104167';

/**
 * W — the founding case's write spec: `load_ravines`' real write with the four declared axes.
 *
 * `footprint_area_sqm` / `footprint_area_sqft` are `insert_only` (prerequisite 0j): seeded on
 * INSERT, never rewritten by the conflict UPDATE — which is precisely the legacy semantics, where
 * the area pass runs ONCE after the INSERT and the UPDATE SET never mentions the columns.
 */
const W = () => {
  const s = clone(LOAD_RAVINES.outputs.writes[0]) as Record<string, unknown>;
  s.key_sql_type = 'TEXT';
  s.geometry_srid = 3857;
  s.geometry_repair = 'none';
  const cols = s.columns as Array<Record<string, unknown>>;
  cols.push({
    name: 'footprint_area_sqm',
    vocabulary: 'none',
    written: 'insert_only',
    bind: 'value',
    derived_from_geometry: { measure: 'geodesic_area', unit: 'm2', scale: 2 },
  });
  cols.push({
    name: 'footprint_area_sqft',
    vocabulary: 'none',
    written: 'insert_only',
    bind: 'value',
    derived_from_geometry: { measure: 'geodesic_area', unit: 'ft2', scale: 2 },
  });
  return s;
};

/**
 * T1's two expected lines, verbatim (the shape the legacy expressions reproduce once their
 * input expression is substituted by the validator's own `geom`).
 */
const AREA_SQM_EXPR = 'ROUND((ST_Area(geom::geography))::numeric, 2)';
const AREA_SQFT_EXPR = `ROUND((ST_Area(geom::geography) * ${SQFT_FACTOR})::numeric, 2)`;
const AREA_SQM_AS = `${AREA_SQM_EXPR} AS footprint_area_sqm`;
const AREA_SQFT_AS = `${AREA_SQFT_EXPR} AS footprint_area_sqft`;

describe('INGESTOR prerequisite 0u — derived_from_geometry', () => {
  // -------------------------------------------------------------------------
  // T0 — the six T0 hashes of the 0t suite are UNCHANGED: the default codegen
  // path (no column declares `derived_from_geometry`) is byte-identical, and
  // the derived axis is additive on the two descriptors that never declare it.
  // -------------------------------------------------------------------------
  it('T0 — the six 0t T0 hashes are unchanged: validation_sql (ravines/address_points/parcels) and upsert_sql (ravines/parcels), with the derived axis declared nowhere', () => {
    const cases: Array<[string, Record<string, unknown>, string, string | null]> = [
      ['load-ravines', LOAD_RAVINES, '7fc585fd9e9fa5aa', '0d4fdf73fc14b06b'],
      ['load-address-points', LOAD_ADDRESS_POINTS, '3be0ece91cd97212', null],
      ['load-parcels', LOAD_PARCELS, 'f36c68b29368ed2a', 'b9a3cdff3a99858a'],
    ];
    for (const [name, descriptor, validationHash, upsertHash] of cases) {
      const d = descriptor as { outputs: { writes: Array<Record<string, unknown>> } };
      const plan = writeLib.buildWritePlan(d.outputs.writes[0], descriptor);
      expect(hash16(plan.validation_sql), `${name} validation_sql`).toBe(validationHash);
      if (upsertHash !== null) expect(hash16(plan.upsert_sql), `${name} upsert_sql`).toBe(upsertHash);
      // No committed descriptor declares the axis, so the plan's derived set is empty …
      expect(plan.derived_columns, `${name}: no derived columns declared`).toEqual([]);
      // … and the rendered text carries no area expression.
      expect(String(plan.validation_sql)).not.toContain('footprint_area');
      expect(d.outputs.writes[0]!.geometry_repair, `${name}: still declares no repair arm`).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // T1 — W's validation_sql renders BOTH derived lines, from the PRE-repair `geom`,
  // between `ST_IsValid(geom)` and `FROM input`.
  // RED before 0u: neither `AS footprint_area_sqm` nor the ft² twin exists.
  // -------------------------------------------------------------------------
  it('T1 — W renders both derived expressions over geom inside the inner subquery, between ST_IsValid(geom) and FROM input', () => {
    const sql = writeLib.buildWritePlan(W(), LOAD_RAVINES).validation_sql as string;
    expect(sql).toContain(AREA_SQM_AS);
    expect(sql).toContain(AREA_SQFT_AS);
    // The `input` CTE's geom expression is the declared 3857 transform — the SAME expression
    // the legacy UPDATE substituted, which is what makes T2's identity exact.
    expect(sql).toContain('ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(g.geojson), 3857), 4326) AS geom');
    // ORDER: both derived lines sit AFTER `ST_IsValid(geom)   AS is_valid_original` and BEFORE
    // the `FROM input` that closes the inner SELECT (the PRE-repair geom is what they measure).
    const isValidAt = sql.indexOf('ST_IsValid(geom)   AS is_valid_original');
    const derivedAt = sql.indexOf(AREA_SQM_AS);
    const fromInputAt = sql.indexOf('FROM input');
    expect(isValidAt).toBeGreaterThan(-1);
    expect(derivedAt).toBeGreaterThan(isValidAt);
    expect(fromInputAt).toBeGreaterThan(derivedAt);
    // The repair arm declared by W is `none`, so nothing mends the measured geometry.
    expect(sql).not.toContain('ST_MakeValid');
    // The two names are carried by `validated` and re-selected by the final SELECT.
    const validatedAt = sql.indexOf('validated AS (');
    expect(validatedAt).toBeLessThan(derivedAt);
    // The LAST occurrence is the final SELECT's re-selection of the name — it sits in the
    // outer column list, after `ST_AsBinary(geom_final) AS geom_wkb` (a marker unique to that
    // SELECT) and necessarily BEFORE that same SELECT's own `FROM validated` clause.
    const geomWkbAt = sql.indexOf('ST_AsBinary(geom_final) AS geom_wkb');
    const fromValidatedAt = sql.indexOf('FROM validated');
    expect(sql.lastIndexOf('footprint_area_sqm')).toBeGreaterThan(geomWkbAt);
    expect(sql.lastIndexOf('footprint_area_sqm')).toBeLessThan(fromValidatedAt);
  });

  // -------------------------------------------------------------------------
  // T2 — THE LEGACY IDENTITY. The two expressions copied VERBATIM out of
  // `scripts/load-massing.js`, with only the input expression substituted, equal
  // T1's rendered lines whitespace-stripped.
  // RED before 0u: the rendered side does not exist.
  // -------------------------------------------------------------------------
  it('T2 — the LEGACY area UPDATE expressions (verbatim, input substituted) equal the rendered lines whitespace-stripped', () => {
    const LEGACY_GEOM = 'ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)';
    // scripts/load-massing.js, `areaUpdateRes` — copied verbatim (line breaks preserved; this
    // test strips whitespace on both sides, so only the token stream is compared).
    const LEGACY_SQM = `ROUND((ST_Area(
        ${LEGACY_GEOM}::geography
      ))::numeric, 2)`;
    const LEGACY_SQFT = `ROUND((ST_Area(
        ${LEGACY_GEOM}::geography
      ) * ${SQFT_FACTOR})::numeric, 2)`;
    // The ONLY substitution: the stored-column expression becomes the validator's own
    // pre-repair `geom` (identical to it by construction at `geometry_srid: 3857`).
    const renderedSqm = strip(LEGACY_SQM.split(LEGACY_GEOM).join('geom'));
    const renderedSqft = strip(LEGACY_SQFT.split(LEGACY_GEOM).join('geom'));
    expect(renderedSqm).toBe(strip(AREA_SQM_EXPR));
    expect(renderedSqft).toBe(strip(AREA_SQFT_EXPR));
    // …and the plan really contains them, so the identity is against rendered output.
    const sql = writeLib.buildWritePlan(W(), LOAD_RAVINES).validation_sql as string;
    expect(strip(sql)).toContain(renderedSqm);
    expect(strip(sql)).toContain(renderedSqft);
  });

  // -------------------------------------------------------------------------
  // T3 — the plan's declared shape: `derived_columns` in declaration order, the
  // two names in the INSERT list, and NEITHER in the conflict UPDATE / guard.
  // RED before 0u: `plan.derived_columns` is undefined.
  // -------------------------------------------------------------------------
  it('T3 — plan.derived_columns lists {name,measure,unit,scale}; both columns are INSERTed and neither is in update_columns / guard_columns / the SET / the WHERE', () => {
    const plan = writeLib.buildWritePlan(W(), LOAD_RAVINES);
    expect(plan.derived_columns).toEqual([
      { name: 'footprint_area_sqm', measure: 'geodesic_area', unit: 'm2', scale: 2 },
      { name: 'footprint_area_sqft', measure: 'geodesic_area', unit: 'ft2', scale: 2 },
    ]);
    for (const name of ['footprint_area_sqm', 'footprint_area_sqft']) {
      expect(plan.step_columns, `${name} is INSERTed`).toContain(name);
      expect(plan.insert_only_columns, `${name} is declared insert_only`).toContain(name);
      expect(plan.update_columns, `${name} is never rewritten`).not.toContain(name);
      expect(plan.guard_columns, `${name} is never guarded`).not.toContain(name);
      expect(String(plan.upsert_sql)).not.toContain(`${name} = EXCLUDED.${name}`);
      expect(String(plan.upsert_sql)).not.toContain(`${plan.table}.${name} IS DISTINCT FROM`);
    }
    // The bind stride follows the INSERT list, so the derived values are bound per row.
    expect(plan.columnsPerRow).toBe(plan.step_columns.length);
    // The upsert text NAMES the exclusion, exactly as the 0j comment contract requires.
    expect(String(plan.upsert_sql)).toContain(`seeded on INSERT, never rewritten by the conflict UPDATE (DB-recomputed): ${plan.insert_only_columns.join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // T4 — the carried-row half: the value comes BACK from the validator under the
  // column's own name and is passed through UNTOUCHED (node-pg hands `numeric`
  // over as a string; a `Number()` hop would be an inexactness legacy never had).
  // RED before 0u: the carried row keeps the feature's own `1`.
  // -------------------------------------------------------------------------
  it('T4 — validateGeometries carries the validator area STRING per derived column, after the geometry key, with no numeric coercion', async () => {
    const rows = [{
      source_key: 'a',
      status: 'accepted',
      geom_wkb: 'x',
      is_valid_original: true,
      footprint_area_sqm: '5231.07',
      footprint_area_sqft: '56307.44',
    }];
    const pool = { query: async () => ({ rows }) };
    const features = [{ source_id: 'a', geojson: '{}', footprint_area_sqm: 1 }];
    const classify = () => ({ repaired: 1, collectionExtracted: 0, skipped: 0, carry: true });

    const plan = writeLib.buildWritePlan(W(), LOAD_RAVINES);
    const v = await writeLib.validateGeometries(pool, plan, features, classify, { log: noopLog, tag: '[t4]' });
    expect(v.carried).toHaveLength(1);
    const row = v.carried[0] as Record<string, unknown>;
    expect(row.footprint_area_sqm).toBe('5231.07');
    expect(typeof row.footprint_area_sqm).toBe('string');
    expect(row.footprint_area_sqft).toBe('56307.44');
    // AFTER the geometry key, in declaration order — the carried object's key order is the
    // one `bindRow` reads, and a derived column silently landing before `geom` would mean the
    // geometry was overwritten by the derived pass.
    const keysOf = Object.keys(row);
    expect(keysOf.indexOf('geom')).toBeGreaterThan(keysOf.indexOf('source_id'));
    expect(keysOf.indexOf('footprint_area_sqm')).toBeGreaterThan(keysOf.indexOf('geom'));
    expect(keysOf.indexOf('footprint_area_sqft')).toBeGreaterThan(keysOf.indexOf('footprint_area_sqm'));

    // A plan with no derived columns carries no such key at all (the default path).
    const dflt = await writeLib.validateGeometries(
      pool,
      writeLib.buildWritePlan(clone(LOAD_RAVINES.outputs.writes[0]), LOAD_RAVINES),
      [{ source_id: 'a', geojson: '{}' }],
      classify,
      { log: noopLog, tag: '[t4]' },
    );
    expect((dflt.carried[0] as Record<string, unknown>).footprint_area_sqm).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // T5 — the named backstop (Rule 1): a derived column is refused BY NAME when it
  // has no PRE-repair geometry to measure, or is not a column the step supplies.
  // -------------------------------------------------------------------------
  it('T5 — DerivedMeasureError: a derived column with no wkb_geometry column, and a derived column declared neither step nor insert_only', () => {
    // (a) No geometry column: `geom` is what the derived expression measures.
    const noGeom = W();
    (noGeom.columns as Array<Record<string, unknown>>)
      .find((c) => c.name === 'geom')!.bind = 'value';
    expect(() => writeLib.buildWritePlan(noGeom, LOAD_RAVINES)).toThrow(writeLib.DerivedMeasureError);

    // (b) A `db_default` derived column: the step never binds it, so the expression's result
    // has nowhere to be carried to (the value would be computed and thrown away).
    const dbDefault = W();
    (dbDefault.columns as Array<Record<string, unknown>>)
      .find((c) => c.name === 'footprint_area_sqm')!.written = 'db_default';
    expect(() => writeLib.buildWritePlan(dbDefault, LOAD_RAVINES)).toThrow(writeLib.DerivedMeasureError);

    try {
      writeLib.buildWritePlan(noGeom, LOAD_RAVINES);
      throw new Error('expected a throw');
    } catch (err) {
      expect((err as Error).name).toBe('DerivedMeasureError');
      expect((err as Error).message).toContain('derived_from_geometry');
      expect((err as Error).message).toContain('wkb_geometry');
    }

    // The default path is untouched: no derived column anywhere, no throw.
    expect(() => writeLib.buildWritePlan(clone(LOAD_RAVINES.outputs.writes[0]), LOAD_RAVINES)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T6 — the schema: the axis is declarable in exactly the declared vocabulary.
  // -------------------------------------------------------------------------
  it('T6 — AJV: W passes; unit km2, scale 7 and a missing measure are rejected', () => {
    // W as a full descriptor — the axis is legal where the founding case needs it.
    const good = clone(LOAD_RAVINES) as { outputs: { writes: Array<Record<string, unknown>> } };
    good.outputs.writes[0] = W();
    expect(() => pipeline.step(good, async () => {})).not.toThrow();

    const derivedOf = (mutate: (d: Record<string, unknown>) => void) => {
      const d = clone(LOAD_RAVINES) as { outputs: { writes: Array<Record<string, unknown>> } };
      const s = W();
      mutate((s.columns as Array<Record<string, unknown>>)
        .find((c) => c.name === 'footprint_area_sqm')!.derived_from_geometry as Record<string, unknown>);
      d.outputs.writes[0] = s;
      return d;
    };

    // An unknown UNIT is refused — the unit selects a real conversion factor in the codegen.
    const km2 = derivedOf((d) => { d.unit = 'km2'; });
    expect(() => pipeline.step(km2, async () => {})).toThrow(/does not satisfy step\.schema\.json/);
    // A scale outside 0-6 is refused (numeric(_, s) precision is a declared fact).
    const scale7 = derivedOf((d) => { d.scale = 7; });
    expect(() => pipeline.step(scale7, async () => {})).toThrow(/does not satisfy step\.schema\.json/);
    // `measure` is REQUIRED — an unmeasured derivation must name what it measures.
    const noMeasure = derivedOf((d) => { delete d.measure; });
    expect(() => pipeline.step(noMeasure, async () => {})).toThrow(/does not satisfy step\.schema\.json/);
    // …and no unknown sibling key is smuggled in beside them.
    const extra = derivedOf((d) => { d.crs = 4326; });
    expect(() => pipeline.step(extra, async () => {})).toThrow(/does not satisfy step\.schema\.json/);
  });
});
