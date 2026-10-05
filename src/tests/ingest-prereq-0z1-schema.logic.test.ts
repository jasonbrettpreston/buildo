// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A19 (0z1; RE-FREEZE #30, logged in 122 §8)
//
// INGESTOR prerequisite 0z1 — the `multiline` geometry family (the ST_Multi line arm) and the
// `outputs.writes[].line_validity` declaration (Spec 58 F-M9), for the zoning LineString layers.
//
//   `outputs.writes[].geometry_kind` gains `"multiline"` — a `MultiLineString` column filled by
//     `ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 2))` (Spec 58:220 "Wrap in ST_Multi"),
//     accepting `ST_LineString`/`ST_MultiLineString` at the validator. The existing `line` arm
//     collapses a single-member extract to a `LineString` and accepts only `ST_LineString`
//     (`scripts/lib/step/write.js#geometryFinalExpr`) — it exists for `toronto_centreline`, whose
//     consumer requires a true LineString, so widening it would silently change centreline's accept
//     set; `multiline` is a NEW family value, the way `line` was added;
//   `outputs.writes[].line_validity` — enum `["length_and_simple"]`, absent = no test; Spec 58
//     F-M9 (:49, :220) requires `ST_Length(geom::geography) > 0 AND ST_IsSimple(geom)` on the SOURCE
//     geometry for a LineString target, and legacy discards a degenerate line even when it is valid.
//
// This file is the SCHEMA arm only (T1-T3). The SQL/text arm is `…-0z1-sql.logic.test.ts`, the
// executed PostGIS arm is `src/tests/db/ingest-prereq-0z1.db.test.ts`.
//
// Per Spec 124 Rule 1 a new schema field carries an `x-ruling` (the two enum copies are `x-frozen`
// and the new property/rule land in briefs 4-7); per Spec 58 F-M9 the predicate is
// `length_and_simple`; per Spec 124 R-AJ neither half has a consumer today (legacy always repairs).
//
// Today the `geometry_kind` enum is `[polygon, point, line]` in BOTH its copies — the PROPERTY
// itself (`step.schema.json:1181-1187`) and the INGESTOR-profile rule "a wkb_geometry bind REQUIRES
// a declared geometry_kind", which RE-LISTS the family (`:4610-4622`) — and the write item declares
// no `line_validity`, with `additionalProperties: false`. The descriptor the zoning ② conversion
// exists for — a `MultiLineString` target rejecting degenerate lines — is therefore UNREPRESENTABLE
// on both counts.
//
// Every RED assertion below fails TODAY for the stated reason and NOT because of a typo:
//   0z1-T1 fails because `"multiline"` is absent from BOTH enum copies AND because `line_validity`
//      is an unknown property of a write item declared `additionalProperties: false`;
//   0z1-T1(b) is the split proof: it replaces the INGESTOR-profile copy's enum with
//      `["polygon","point"]` in a cloned schema and still expects the `/allOf/…/geometry_kind/enum`
//      error — the profile re-lists the family, so fixing only the property copy cannot pass it;
//   0z1-T2(1) fails because `line_validity` is unknown, so a `geometry_kind:"polygon"` write with it
//      is reported as `additionalProperties`, never as the SPECIFIC `const` the rule promises;
//   0z1-T2(2) fails because no rule forbids `geometry_repair:"none"` beside `multiline` (and
//      `multiline` is not in the enum), so the `not` is unreachable;
//   0z1-T2(3) fails because `line_validity` is unknown, so its `enum` is never evaluated;
//   0z1-T2(4) fails because the GR-2 `if/then` does not exist, so NO `required` error is emitted;
//   0z1-T2(5) is the GR-2 ABSENT-CASE row: `multiline` with `geometry_repair` ABSENT must be VALID
//      once the enum lands — today it is invalid on the enum alone, so the row REDs today and PINS
//      the authored form against the RE-FREEZE #12 F-1 trap (a bare `not:{properties}` is FALSE
//      whenever the field is absent, so it would reject this row).
// Each T2 row asserts its SPECIFIC AJV error (keyword + instancePath + params), never a bare message.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- exercising the real CJS json */
const Ajv: any = require('ajv');
const SCHEMA_PATH = path.join(process.cwd(), 'scripts/steps/_schema/step.schema.json');
const SCHEMA = require(SCHEMA_PATH);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(SCHEMA);
const errText = (errors: unknown) => JSON.stringify(errors ?? []);

type AjvError = { keyword?: string; instancePath?: string; schemaPath?: string; params?: Record<string, unknown> };

/** Locate one AJV error by keyword + instancePath (+ params), never by a bare boolean. */
const errAt = (errors: unknown, match: Record<string, unknown>) =>
  ((errors as AjvError[] | null) ?? []).some(
    (e) =>
      e.keyword === match.keyword &&
      e.instancePath === match.instancePath &&
      Object.entries((match.params as Record<string, unknown>) ?? {}).every(([k, v]) => e.params?.[k] === v),
  );

/**
 * Every AJV error whose `schemaPath` CONTAINS every given fragment — used for the INGESTOR-profile
 * re-listing, which lives under the composed `#/allOf/4/then/allOf/0/then/…/geometry_kind/enum`
 * schema path (the `/allOf/` fragment is in the SCHEMA path; `instancePath` is the DATA path).
 */
const errsMatchingSchema = (errors: unknown, keyword: string, schemaPathFragments: string[]) =>
  ((errors as AjvError[] | null) ?? []).filter(
    (e) => e.keyword === keyword && schemaPathFragments.every((f) => (e.schemaPath ?? '').includes(f)),
  );

const WRITE = '/outputs/writes/0';

/**
 * `MZ()` — the zoning-shaped fixture: a ravines-clone INGESTOR (Spec 124 §4 model: clone a committed
 * descriptor, reshape only what this arm declares) whose single write target declares the new
 * `multiline` family and the F-M9 `line_validity` test.
 *
 * Unlike the 0y file's from-scratch CKAN fixture, 0z1 changes exactly two fields on an
 * already-ingesting write — `geometry_kind` and `line_validity` — so cloning `load-ravines` (a
 * `polygon` INGESTOR with a real `wkb_geometry` bind, a real `write_discipline`, and a real
 * scoped departure delete) keeps every OTHER field byte-identical to a committed, passing descriptor
 * and isolates the delta to the arm under test.
 */
function MZ() {
  const d = clone(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(path.join(process.cwd(), 'scripts/load-ravines.descriptor.json')),
  ) as Record<string, any>;
  const write = d.outputs.writes[0] as Record<string, any>;
  write.geometry_kind = 'multiline';
  write.line_validity = 'length_and_simple';
  return d;
}

describe('INGESTOR prerequisite 0z1 — geometry_kind "multiline" + writes[].line_validity (schema)', () => {
  // -------------------------------------------------------------------------
  // 0z1-T1 — the zoning LineString descriptor is EXPRESSIBLE. RED today: `"multiline"` is
  // absent from BOTH enum copies and `line_validity` is an unknown property of a write item
  // declared `additionalProperties: false`, so the descriptor the zoning ② conversion exists
  // for is rejected by the schema.
  // -------------------------------------------------------------------------
  it('0z1-T1 — a multiline write declaring line_validity:"length_and_simple" validates', () => {
    expect(
      validate(MZ()),
      `a MultiLineString INGESTOR declaring line_validity must be representable: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0z1-T1(b) — the INGESTOR-profile copy re-lists the family and cannot be left behind', () => {
    // The profile's `then` re-declares the `geometry_kind` enum (a wkb_geometry bind REQUIRES a
    // declared geometry_kind). In a CLONED schema, REMOVE `multiline` from the profile copy ONLY,
    // leaving the property copy intact: the composed schema must still reject the descriptor, with
    // an `enum` error under `/allOf/`. A fix that touched only the property copy would go green on
    // T1 and fail HERE — this is the proof that the profile copy is the one EXERCISED.
    const patched = clone(SCHEMA) as Record<string, any>;
    const allOf = patched.allOf as Array<Record<string, any>>;
    // SEVERAL entries key on `identity.archetype.const:"INGESTOR"` (the 0fs G1 near-miss arm too),
    // so identify the ONE whose `then` carries the wkb_geometry→geometry_kind re-listing.
    const profileEntry = allOf.find(
      (entry: Record<string, any>) =>
        entry.if?.properties?.identity?.properties?.archetype?.const === 'INGESTOR' &&
        entry.then?.allOf?.[0]?.then?.properties?.outputs?.properties?.writes?.items?.properties?.geometry_kind,
    );
    expect(profileEntry, 'the INGESTOR profile entry carrying the geometry_kind re-listing must exist').toBeTruthy();

    // The wkb_geometry rule is the profile `then`'s own `allOf[0]`, whose `then` re-lists the enum.
    const profileWritesItems =
      profileEntry!.then.allOf[0].then.properties.outputs.properties.writes.items.properties;
    const profileEnum = profileWritesItems.geometry_kind.enum as string[];
    expect(
      profileEnum,
      'the INGESTOR-profile copy must itself gain `multiline` (this is the pre-change RED: the profile copy today is [polygon,point,line] and cannot be left behind)',
    ).toContain('multiline');
    profileWritesItems.geometry_kind.enum = profileEnum.filter((v) => v !== 'multiline');
    expect(profileWritesItems.geometry_kind.enum, 'the property copy must NOT be the only one patched').toEqual(['polygon', 'point', 'line']);

    const patchedValidate = new Ajv({ allErrors: true, strict: false }).compile(patched);
    expect(
      patchedValidate(MZ()),
      'with `multiline` removed from the profile copy ONLY, the descriptor must be rejected',
    ).toBe(false);
    expect(
      errsMatchingSchema(patchedValidate.errors, 'enum', ['/allOf/', 'geometry_kind/enum']).length,
      `expected the profile re-listing to produce a #/allOf/…/geometry_kind/enum error: ${errText(patchedValidate.errors)}`,
    ).toBeGreaterThan(0);

    // Sanity: the UNPATCHED compiled validator still accepts the same fixture — so the RED above
    // is caused by the patch, not by the fixture being invalid for an unrelated reason.
    expect(validate(MZ()), `the unpatched fixture must be valid: ${errText(validate.errors)}`).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 0z1-T2 — the refusals, each located by its OWN AJV error.
  // -------------------------------------------------------------------------
  it('0z1-T2(1) — Z-I1: `line_validity` on a `polygon` write is refused by a `const` at the item', () => {
    const d = MZ();
    const write = d.outputs.writes[0] as Record<string, any>;
    write.geometry_kind = 'polygon';
    expect(validate(d), 'F-M9 is a LineString predicate; it is meaningless on a polygon target (Rule 10)').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'const', instancePath: `${WRITE}/geometry_kind` }),
      `expected the Z-I1 const/multiline error at ${WRITE}/geometry_kind: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0z1-T2(2) — Z-I1: `multiline` forbids `geometry_repair:"none"` via a `not` at the item', () => {
    const d = MZ();
    const write = d.outputs.writes[0] as Record<string, any>;
    write.geometry_repair = 'none';
    expect(validate(d), 'legacy always repairs (Spec 58 F-M9); a multiline write cannot skip the repair (R-AJ)').toBe(
      false,
    );
    expect(
      errAt(validate.errors, { keyword: 'not', instancePath: WRITE }),
      `expected the Z-I1 not/geometry_repair error at ${WRITE}: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0z1-T2(3) — Z-I1: `line_validity:"x"` is refused by the `enum`', () => {
    const d = MZ();
    const write = d.outputs.writes[0] as Record<string, any>;
    write.line_validity = 'x';
    expect(validate(d), '`length_and_simple` is the only declared predicate; the enum is closed').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'enum', instancePath: `${WRITE}/line_validity` }),
      `expected the Z-I1 enum/line_validity error at ${WRITE}/line_validity: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0z1-T2(4) — Z-I1 (GR-2): `line_validity` with NO `geometry_kind` fails `required`', () => {
    const d = MZ();
    const write = d.outputs.writes[0] as Record<string, any>;
    delete write.geometry_kind;
    expect(validate(d), 'the authored form is `required:["geometry_kind"]` + `const:"multiline"` (GR-2)').toBe(false);
    expect(
      errAt(validate.errors, {
        keyword: 'required',
        instancePath: WRITE,
        params: { missingProperty: 'geometry_kind' },
      }),
      `expected the Z-I1 required/geometry_kind error at ${WRITE}: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0z1-T2(5) — GR-2 ABSENT CASE: `multiline` with `geometry_repair` ABSENT is VALID', () => {
    // The forbid is `not:{required:["geometry_repair"], properties:{geometry_repair:{const:"none"}}}`.
    // A bare `not:{properties:…}` would be FALSE whenever the field is absent (RE-FREEZE #12 F-1)
    // and would reject this row. The T1 fixture already omits `geometry_repair`; assert it, then
    // assert the descriptor validates.
    const d = MZ();
    expect(d.outputs.writes[0], 'the T1 fixture must omit geometry_repair entirely (GR-2)').not.toHaveProperty(
      'geometry_repair',
    );
    expect(
      validate(d),
      `a multiline write with NO geometry_repair must stay valid (absent = make_valid): ${errText(validate.errors)}`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 0z1-T3 — PIN: the rule set is ADDITIVE. Every committed descriptor keeps validating, and
  // NONE declares a 0z1 field — so 0z1's byte change cannot alter their behaviour.
  // The set is ENUMERATED BY GLOB (I-A4 / grounder 5f), never a hard-coded count: the
  // directory lists grow as steps convert, and a pinned literal would rot silently.
  // -------------------------------------------------------------------------
  it('0z1-T3 — every descriptor (by glob) still validates, and none declares a 0z1 field', () => {
    const dirs = ['scripts', path.join('scripts', 'quality')];
    const globbed: string[] = [];
    for (const dir of dirs) {
      for (const name of fs.readdirSync(path.join(process.cwd(), dir))) {
        if (!name.endsWith('.descriptor.json')) continue;
        globbed.push(path.join(process.cwd(), dir, name));
      }
    }
    expect(globbed.length, 'the glob must find the committed descriptor set (non-recursive)').toBeGreaterThan(0);

    let consumerSeen = false;
    for (const file of globbed) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const descriptor = require(file);
      const label = path.relative(process.cwd(), file);

      expect(validate(descriptor), `${label} must stay valid: ${errText(validate.errors)}`).toBe(true);

      // ② (batch-2 row 3.3, 2026-10-03): load_zoning is the ONE declared consumer of these fields — it must
      // declare them (never vacuous); every other descriptor keeps the "none declares" pin below.
      if (path.basename(file) === 'load-zoning.descriptor.json') {
        consumerSeen = true;
        const writes = (descriptor.outputs?.writes as Array<Record<string, any>>) ?? [];
        const multiline = writes
          .filter((write) => write.geometry_kind === 'multiline')
          .map((write) => write.table)
          .sort();
        expect(multiline, `${label} is the declared multiline consumer and must declare both multiline writes`).toEqual([
          'zoning_policy_road_overlay',
          'zoning_priority_retail_overlay',
        ]);
        for (const table of multiline) {
          const write = writes.find((candidate) => candidate.table === table) as Record<string, any>;
          expect(
            write.line_validity,
            `${label}'s multiline write target ${table} must declare line_validity`,
          ).toBe('length_and_simple');
        }
        for (const write of writes) {
          if (write.geometry_kind === 'multiline') continue;
          expect(
            write.line_validity,
            `${label}'s non-multiline write target ${write.table} must not declare line_validity`,
          ).toBeUndefined();
        }
        continue;
      }

      for (const write of (descriptor.outputs?.writes as Array<Record<string, any>>) ?? []) {
        expect(
          write.geometry_kind,
          `${label}'s write target ${write.table} must not declare the 0z1 \`multiline\` family`,
        ).not.toBe('multiline');
        expect(
          write.line_validity,
          `${label}'s write target ${write.table} must not declare the 0z1 \`line_validity\` (load_centreline is the only \`line\` declarer; load_zoning is the one multiline consumer)`,
        ).toBeUndefined();
      }
    }

    expect(consumerSeen, 'the glob must reach scripts/load-zoning.descriptor.json (the declared consumer)').toBe(true);
  });
});

// A tiny sanity net for the fixture, so the "single multiline write" preconditions above can never
// silently drift into passing against an empty or malformed descriptor.
describe('INGESTOR prerequisite 0z1 — fixture preconditions', () => {
  it('MZ declares exactly the one multiline write the 0z1 rules are stated over', () => {
    const d = MZ();
    expect(d.identity.archetype).toBe('INGESTOR');
    expect(d.outputs.writes).toHaveLength(1);
    const write = d.outputs.writes[0] as Record<string, any>;
    expect(write.geometry_kind).toBe('multiline');
    expect(write.line_validity).toBe('length_and_simple');
    expect(write).not.toHaveProperty('geometry_repair');
    // The clone must carry a real wkb_geometry bind — the field the INGESTOR-profile rule keys on.
    expect(
      (write.columns as Array<Record<string, any>>).some((c) => c.bind === 'wkb_geometry'),
      'the fixture must bind a wkb_geometry column, or the profile rule under test never fires',
    ).toBe(true);
    // Round-trip stability (the 0y fixture's own guard).
    expect(clone(MZ())).toEqual(MZ());
  });
});
