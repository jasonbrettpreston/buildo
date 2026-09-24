// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (0t); 124 Rule 1
//
// INGESTOR prerequisite 0t (2026-09-24, WF2 plan §0t, Fold PB-1/PD) — `geometry_repair`.
//
// The validator ALWAYS repairs: `geometryValidationSql`'s inner subquery reads
// `ST_IsValid(geom) AS is_valid_original, ST_MakeValid(geom) AS repaired`, and every
// downstream expression is built from `repaired`. The legacy massing loader stored the
// UNREPAIRED source geometry (`scripts/load-massing.js`, measured 2026-09-24: 16 invalid
// geoms survive in `parcels` from the legacy path), so a converted step that must keep
// storing what the source said has no way to DECLARE that — the repair is hard-wired by
// the kind, not by a declaration.
//
// 0t is that declaration: `outputs.writes[].geometry_repair: "make_valid" | "none"`,
// ABSENT = `"make_valid"` = today, byte-identical. `"none"` renders `geom AS repaired`
// (no `ST_MakeValid`) and the final expression over `repaired` directly, so the validator
// measures the stored geometry rather than a repaired one; `is_valid_original` is
// UNCHANGED and `validateGeometries` carries `invalidStored` beside the counters.
//
// A NEW file, never appended to the 7,200-line `step-library.logic.test.ts`. Its stub
// helpers (`clone`, the fake pool) are copied from that file, never imported.
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

/** The T0 pin: the same `sha256(...).slice(0, 16)` shape the plan's fact 8 recorded. */
const hash16 = (sql: string | null) => createHash('sha256').update(String(sql)).digest('hex').slice(0, 16);

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/** A `wkb_geometry`-bound write cloned from a real descriptor with one axis set (or deleted). */
const specOf = (descriptor: Record<string, unknown>, key: string, value?: unknown) => {
  const s = clone((descriptor.outputs as { writes: Array<Record<string, unknown>> }).writes[0]) as Record<string, unknown>;
  if (value === undefined) delete s[key];
  else s[key] = value;
  return s;
};

describe('INGESTOR prerequisite 0t — geometry_repair', () => {
  // -------------------------------------------------------------------------
  // T0 — the default is byte-identical, pinned by hash on all three real
  // INGESTORs that run `validateGeometries` (fact 8's own measurement).
  // -------------------------------------------------------------------------
  it('T0 — absent geometry_repair: validation_sql is byte-identical for ravines, '
    + 'address_points and parcels, and upsert_sql for ravines/parcels (and identical to an '
    + 'explicit "make_valid")', () => {
    // ⚠️ The `upsert_sql` pin is asserted only where the descriptor's statement is a function
    // of the write target ALONE. `address_points` post-dates the fact-8 measurement (AP-D7
    // added `on_empty` to 12 columns, RE-FREEZE #19) so its upsert hash has moved — but the
    // repair axis does not touch the upsert at all, which the explicit-vs-absent equality
    // below proves for all three. fact 8's `1f5b604fc90e64dd` is the tooltip for
    // `git show 8360fc32^:scripts/load-address-points.descriptor.json`.
    const cases: Array<[string, Record<string, unknown>, string, string | null]> = [
      ['load-ravines', LOAD_RAVINES, '7fc585fd9e9fa5aa', '0d4fdf73fc14b06b'],
      ['load-address-points', LOAD_ADDRESS_POINTS, '3be0ece91cd97212', null],
      ['load-parcels', LOAD_PARCELS, 'f36c68b29368ed2a', 'b9a3cdff3a99858a'],
    ];
    for (const [name, descriptor, validationHash, upsertHash] of cases) {
      const d = descriptor as { outputs: { writes: Array<Record<string, unknown>> } };
      // Absent.
      const absent = writeLib.buildWritePlan(specOf(descriptor, 'geometry_repair'), descriptor);
      expect(hash16(absent.validation_sql), `${name} validation_sql (absent)`).toBe(validationHash);
      if (upsertHash !== null) {
        expect(hash16(absent.upsert_sql), `${name} upsert_sql (absent)`).toBe(upsertHash);
      }
      expect(absent.geometry_repair, `${name}: absent carries the default`).toBe('make_valid');
      expect(absent.validation_sql as string).toContain('ST_MakeValid(geom) AS repaired');
      // Explicitly declared — the SAME bytes, so a descriptor may say the default out loud.
      const declared = writeLib.buildWritePlan(specOf(descriptor, 'geometry_repair', 'make_valid'), descriptor);
      expect(declared.validation_sql, `${name} validation_sql (explicit make_valid)`).toBe(absent.validation_sql);
      expect(declared.upsert_sql, `${name} upsert_sql (explicit make_valid)`).toBe(absent.upsert_sql);
      expect(d.outputs.writes[0]!.geometry_repair, `${name}: the committed descriptor declares nothing`).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // T1 — "none" renders the UNREPAIRED geometry through the same four statuses.
  // RED before 0t: the text carries `ST_MakeValid(geom) AS repaired` unconditionally.
  // -------------------------------------------------------------------------
  it('T1 — geometry_repair "none" on a polygon: no ST_MakeValid and no ST_Multi, the four '
    + 'statuses survive, and the stored expression IS the source geometry', () => {
    const plan = writeLib.buildWritePlan(specOf(LOAD_RAVINES, 'geometry_repair', 'none'), LOAD_RAVINES);
    expect(plan.geometry_repair).toBe('none');
    const sql = plan.validation_sql as string;
    expect(sql, 'the repair call is what "none" REMOVES').not.toContain('ST_MakeValid');
    // The FAMILY's final expression is untouched — the repair axis is orthogonal to the
    // kind, so a `none` polygon still Multi-wraps what it stores (legacy parcels did not,
    // which is a family question, not a repair one).
    expect(sql).toContain('ST_Multi(COALESCE(ST_CollectionExtract(repaired, 3), repaired))');
    // The un-repaired text, exactly.
    expect(sql).toContain('geom AS repaired');
    // The ORIGINAL geometry is still measured — that is the whole point of "none".
    expect(sql).toContain('ST_IsValid(geom)   AS is_valid_original');
    for (const status of ['collection_extracted', 'accepted', 'skipped_null', 'skipped_unsupported_type']) {
      expect(sql, `${status} must survive`).toContain(status);
    }
    // The upsert statement is untouched by the repair axis.
    const baseline = writeLib.buildWritePlan(specOf(LOAD_RAVINES, 'geometry_repair'), LOAD_RAVINES);
    expect(plan.upsert_sql).toBe(baseline.upsert_sql);
  });

  // -------------------------------------------------------------------------
  // T2 — the repair axis is ORTHOGONAL to the SRID axis; both declared together
  // render both, and absent still means the default.
  // RED before 0t: `plan.geometry_repair` is undefined.
  // -------------------------------------------------------------------------
  it('T2 — geometry_repair "none" + geometry_srid 3857: the declared transform is present '
    + 'and the default plan still carries make_valid', () => {
    const spec = specOf(LOAD_RAVINES, 'geometry_repair', 'none');
    spec.geometry_srid = 3857;
    const plan = writeLib.buildWritePlan(spec, LOAD_RAVINES);
    expect(plan.geometry_repair).toBe('none');
    expect(plan.geometry_srid).toBe(3857);
    expect(plan.validation_sql as string).toContain(
      'ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(g.geojson), 3857), 4326)',
    );
    expect(plan.validation_sql as string).not.toContain('ST_MakeValid');
    // The default plan — and every plan whose descriptor never declares the axis.
    const dflt = writeLib.buildWritePlan(specOf(LOAD_RAVINES, 'geometry_repair'), LOAD_RAVINES);
    expect(dflt.geometry_repair).toBe('make_valid');
    expect(dflt.validation_sql as string).toContain('ST_MakeValid(geom) AS repaired');
    expect(writeLib.GEOMETRY_REPAIRS).toEqual(['make_valid', 'none']);
  });

  // -------------------------------------------------------------------------
  // T3 — an unrecognised repair is refused BY NAME (Rule 1), never silently defaulted.
  // -------------------------------------------------------------------------
  it('T3 — an unvalidated geometry_repair is refused by name (InvalidGeometryRepairError)', () => {
    // The named backstop, reachable directly on the builder …
    expect(() => writeLib.geometryValidationSql('BIGINT', 'polygon', null, { repair: 'raw' }))
      .toThrow(writeLib.InvalidGeometryRepairError);
    // … and through `buildWritePlan`, whose plan is a rendered statement, not just a field.
    expect(() => writeLib.buildWritePlan(specOf(LOAD_RAVINES, 'geometry_repair', 'raw'), LOAD_RAVINES))
      .toThrow(writeLib.InvalidGeometryRepairError);
    try {
      writeLib.geometryValidationSql('BIGINT', 'polygon', null, { repair: 'raw' });
      throw new Error('expected a throw');
    } catch (err) {
      expect((err as Error).name).toBe('InvalidGeometryRepairError');
      expect((err as Error).message).toContain('geometry_repair');
      expect((err as Error).message).toContain('make_valid');
    }
    // An ABSENT repair is not an error — it is the default.
    expect(() => writeLib.geometryValidationSql('BIGINT', 'polygon')).not.toThrow();
    expect(writeLib.geometryValidationSql('BIGINT', 'polygon', null, { repair: 'none' }))
      .toContain('geom AS repaired');
  });

  // -------------------------------------------------------------------------
  // T4 — the carried-row half: under "none" an invalid SOURCE geometry is STORED,
  // and the count must be reportable. `classify` sums only its three counters, so
  // the routed count is a fourth field the validator derives itself.
  // RED before 0t: `validated.invalidStored` is undefined.
  // -------------------------------------------------------------------------
  it('T4 — validateGeometries counts carried rows whose is_valid_original is false as '
    + 'invalidStored, only when the plan declared geometry_repair "none"', async () => {
    const rows = [
      { source_key: 'a', status: 'accepted', geom_wkb: 'x', is_valid_original: false },
      { source_key: 'b', status: 'accepted', geom_wkb: 'y', is_valid_original: true },
    ];
    const pool = { query: async () => ({ rows }) };
    const features = [
      { source_id: 'a', geojson: '{}' },
      { source_id: 'b', geojson: '{}' },
    ];
    // The three counters only — no `invalidStored` route exists through `classify` (fact 6).
    const classify = (status: string) => ({
      repaired: status === 'accepted' ? 1 : 0, collectionExtracted: 0, skipped: 0, carry: true,
    });

    const nonePlan = writeLib.buildWritePlan(specOf(LOAD_RAVINES, 'geometry_repair', 'none'), LOAD_RAVINES);
    const none = await writeLib.validateGeometries(pool, nonePlan, features, classify, { log: noopLog, tag: '[t4]' });
    expect(none.invalidStored).toBe(1);
    expect(none.carried).toHaveLength(2);

    const defaultPlan = writeLib.buildWritePlan(specOf(LOAD_RAVINES, 'geometry_repair'), LOAD_RAVINES);
    const dflt = await writeLib.validateGeometries(pool, defaultPlan, features, classify, { log: noopLog, tag: '[t4]' });
    expect(dflt.invalidStored).toBe(0);
  });

  // -------------------------------------------------------------------------
  // T5 — the schema: both values are declarable, anything else is not.
  // -------------------------------------------------------------------------
  it('T3 — AJV: geometry_srid 3857 is accepted; geometry_repair accepts make_valid and none '
    + 'and rejects an unrecognised value', () => {
    // The SRID anchor (0i, unchanged) — this file's schema fixture must not disturb it.
    const srid = clone(LOAD_RAVINES) as { outputs: { writes: Array<Record<string, unknown>> } };
    srid.outputs.writes[0]!.geometry_srid = 3857;
    expect(() => pipeline.step(srid, async () => {})).not.toThrow();

    for (const value of ['make_valid', 'none']) {
      const good = clone(LOAD_RAVINES) as { outputs: { writes: Array<Record<string, unknown>> } };
      good.outputs.writes[0]!.geometry_repair = value;
      expect(() => pipeline.step(good, async () => {}), `${value} must validate`).not.toThrow();
    }
    // ABSENT stays legal — the default is the pre-0t behaviour.
    expect(() => pipeline.step(clone(LOAD_RAVINES), async () => {})).not.toThrow();

    const bad = clone(LOAD_RAVINES) as { outputs: { writes: Array<Record<string, unknown>> } };
    bad.outputs.writes[0]!.geometry_repair = 'make_valid_multi';
    expect(() => pipeline.step(bad, async () => {})).toThrow(/does not satisfy step\.schema\.json/);
  });
});
