// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A17 (0fs; RE-FREEZE #28, logged in 122 §8)
//
// INGESTOR prerequisite 0fs (part C) — the SCHEMA arm of filesystem acquisition
// (`externals[].path`) and the no-geometry INGESTOR declaration (`guards.srid: "none"`).
//
// Today `externals.items` is `additionalProperties: false`, so a `path` is an UNKNOWN KEY:
// a descriptor that declares a local, operator-dropped CSV is unrepresentable, and a
// filesystem external is only expressible by omitting the very field that names the file.
// The schema also has no rule tying `guards.srid: "none"` to the absence of a geometry
// column, so an INGESTOR can declare "no SRID" while still binding `wkb_geometry`, and
// `runIngestPhase` discovers the contradiction at run time (write.js:1292 throws) rather
// than at load time.
//
// The five rules this file locks (122a §A17, RE-FREEZE #28):
//   item rule (1)  a `path` external IS a filesystem external: `kind` filesystem,
//                  `format` declared, no `url`, `role` never "lookup";
//   item rule (2)  `kind: "filesystem"` REQUIRES a `path` and forbids `url` (G2);
//   top-level G6   a path-bearing external REQUIRES `execution.shape: "ingest"` — without
//                  it `isIngestStep`'s url fallback (index.js:305) would route a
//                  filesystem-only step down the ASSERT path with no download at all;
//   top-level G1   an INGESTOR declaring `guards.srid: "none"` binds NO `wkb_geometry`
//                  column and declares NO `geometry_kind`.
//
// Every RED assertion below fails TODAY for the stated reason and NOT because of a typo:
//   T11's VALID case fails because `path` is an unknown key;
//   T11 (a)–(e) fail because no item rule mentions `path`/filesystem pairing yet;
//   T11 (f) fails because no top-level rule mentions a path external;
//   T9(iii) fails because the G1 rule is absent, so a geometry-bearing srid-"none"
//           INGESTOR validates.
import { describe, it, expect } from 'vitest';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- exercising the real CJS json */
const Ajv: any = require('ajv');
const SCHEMA_PATH = path.join(process.cwd(), 'scripts/steps/_schema/step.schema.json');
const ADDRESS_POINTS_PATH = path.join(process.cwd(), 'scripts/load-address-points.descriptor.json');
const SCHEMA = require(SCHEMA_PATH);
const ADDRESS_POINTS = require(ADDRESS_POINTS_PATH);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// §A17 fixture rules (A4): every `format:"csv"` fixture carries `csv_options`; every `path`
// fixture carries `cache`; the base A is a csv INGESTOR already declaring
// `execution.shape:"ingest"`. A's own `staleness.trigger` is "none", so `toFs` below has no
// trigger entries to re-point — it rewrites them defensively if a future base declares any.
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(SCHEMA);
const errText = (errors: unknown) => JSON.stringify(errors ?? []);

// The 0fs rules are `not`-shaped, and AJV's `not` error carries NO property name (measured:
// `{"schemaPath":"#/…/allOf/3/then/not","keyword":"not","params":{}}`). So each assertion
// below locates the branch by the rule's OWN TEXT (its `x-rule`/`x-profile`) and then names
// that branch's `not` in the error, rather than grepping for `url`/`wkb_geometry`/
// `geometry_kind` — which a pre-existing, unrelated error could satisfy just as well.
const ITEM_ALLOF = SCHEMA.properties.inputs.properties.reads.properties.externals.items.allOf as Array<{ 'x-rule'?: string }>;
const PATH_RULE_IDX = ITEM_ALLOF.findIndex((r) => typeof r['x-rule'] === 'string' && r['x-rule'].startsWith('0fs (RE-FREEZE #28)'));
const G1_RULE_IDX = (SCHEMA.allOf as Array<{ 'x-profile'?: string }>).findIndex((r) => typeof r['x-profile'] === 'string' && r['x-profile'].startsWith('0fs (RE-FREEZE #28, G1)'));

/** Base `A`: the address_points descriptor (csv INGESTOR, `execution.shape:"ingest"`). */
const A = clone(ADDRESS_POINTS);

/**
 * `A` with its single external replaced by the filesystem form this WF introduces, keeping
 * the same `id` (so every `staleness.trigger[].external` still resolves) and the same
 * `key_property`.
 */
function toFs(base: unknown) {
  const d = clone(base) as {
    inputs: { reads: { externals: Array<Record<string, unknown>> } };
    staleness?: { trigger?: Array<{ external?: string }> };
    execution: Record<string, unknown>;
  };
  const original = d.inputs.reads.externals[0]!;
  const id = original.id;
  d.inputs.reads.externals[0] = {
    id,
    kind: 'filesystem',
    path: 'data/B*.csv',
    format: 'csv',
    csv_options: { bom: true, relax_quotes: false },
    key_property: original.key_property,
    cache: 'none',
  };
  if (Array.isArray(d.staleness?.trigger)) {
    for (const t of d.staleness.trigger) t.external = id as string;
  }
  return d;
}

/** The external the fixture declares (always position 0 after `toFs`). */
const externalOf = (d: ReturnType<typeof toFs>) => d.inputs.reads.externals[0]!;

describe('INGESTOR prerequisite 0fs — externals[].path + no-geometry INGESTOR (schema)', () => {
  // -------------------------------------------------------------------------
  // T11 — filesystem acquisition is expressible, and only in the shapes 122a §A17
  // allows. The VALID case is RED today: `path` is an unknown property of an item
  // declared `additionalProperties: false`.
  // -------------------------------------------------------------------------
  it('T11 — a filesystem+path csv external is valid; six malformed variants are rejected by the NEW rules', () => {
    const valid = toFs(A);
    expect(validate(valid), `a filesystem external with a path must be representable: ${errText(validate.errors)}`).toBe(true);

    // (a) path ⇒ kind filesystem: a path on an http_file transport is unrepresentable.
    const wrongKind = toFs(A);
    externalOf(wrongKind).kind = 'http_file';
    expect(validate(wrongKind), 'a `path` external must declare kind "filesystem"').toBe(false);
    expect(errText(validate.errors)).toContain('kind');

    // (b) path ⇒ no url: a url+path pair would name two sources for one primary.
    const withUrl = toFs(A);
    externalOf(withUrl).url = 'http://x';
    expect(validate(withUrl), 'a `path` external must not also declare a `url`').toBe(false);
    expect(PATH_RULE_IDX, 'the 0fs path rule exists').toBeGreaterThanOrEqual(0);
    expect(errText(validate.errors)).toContain(`externals/items/allOf/${PATH_RULE_IDX}/then/not`);

    // (c) path ⇒ format declared: the payload parser is selected by format, never sniffed.
    const noFormat = toFs(A);
    delete externalOf(noFormat).format;
    delete externalOf(noFormat).csv_options;
    expect(validate(noFormat), 'a `path` external must declare its payload `format`').toBe(false);
    expect(errText(validate.errors)).toContain('"missingProperty":"format"');

    // (d) path is never a lookup: a local file is the step's own input, not a joined payload.
    const lookup = toFs(A);
    externalOf(lookup).role = 'lookup';
    expect(validate(lookup), 'a `path` external must not declare role "lookup"').toBe(false);
    expect(errText(validate.errors)).toContain('role');

    // (e) G2 — kind filesystem ⇒ path declared (a pathless filesystem external names no file).
    const pathless = toFs(A);
    pathless.inputs.reads.externals.push({ id: 'nf', kind: 'filesystem', cache: 'none' });
    expect(validate(pathless), 'a filesystem external must declare a `path`').toBe(false);
    expect(errText(validate.errors)).toContain('"missingProperty":"path"');

    // (f) G6 — a path external ⇒ execution.shape "ingest" (else the ASSERT path would run
    // with no download at all: index.js:305's url fallback).
    const noShape = toFs(A);
    delete noShape.execution.shape;
    expect(validate(noShape), 'a path external must declare execution.shape "ingest"').toBe(false);
    expect(errText(validate.errors)).toContain('shape');
  });

  // -------------------------------------------------------------------------
  // T11-pin — PIN: the rule set is ADDITIVE. Every converted INGESTOR keeps validating,
  // and none of them declares a path or a filesystem external (so 0fs's byte change
  // cannot alter their behaviour).
  // -------------------------------------------------------------------------
  it('T11-pin — all six converted INGESTOR descriptors still validate, none declares a path or a filesystem external', () => {
    const slugs = ['ravines', 'address-points', 'parcels', 'centreline', 'massing', 'neighbourhoods'];
    for (const slug of slugs) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const descriptor = require(path.join(process.cwd(), `scripts/load-${slug}.descriptor.json`));
      expect(validate(descriptor), `${slug} must stay valid: ${errText(validate.errors)}`).toBe(true);
      for (const e of descriptor.inputs.reads.externals) {
        expect(e.path, `${slug}'s external ${e.id} must not declare a path`).toBeUndefined();
        expect(e.kind, `${slug}'s external ${e.id} must not be a filesystem external`).not.toBe('filesystem');
      }
    }
  });

  // -------------------------------------------------------------------------
  // T9(iii) — G1. `guards.srid: "none"` is the explicit NO-GEOMETRY declaration: it is the
  // flag 0fs's second arm keys on (index.js:1082), so a geometry bind beside it is a
  // contradiction the schema must make unexpressible (today: valid, and write.js:1292
  // throws at run time instead).
  // -------------------------------------------------------------------------
  it('T9(iii) — an INGESTOR declaring guards.srid "none" may bind no wkb_geometry column and declare no geometry_kind', () => {
    // (i) srid "none" + the existing wkb_geometry bind ⇒ rejected.
    const withBind = clone(A);
    withBind.guards.srid = 'none';
    expect(validate(withBind), 'srid "none" beside a wkb_geometry bind is a contradiction').toBe(false);
    expect(G1_RULE_IDX, 'the 0fs G1 rule exists').toBeGreaterThanOrEqual(0);
    expect(errText(validate.errors)).toContain(`#/allOf/${G1_RULE_IDX}/then/properties/outputs/properties/writes/items/not`);

    // (ii) srid "none" with the bind removed but `geometry_kind` kept ⇒ still rejected:
    // the declared family is exactly what the geometry validator would run.
    const withKind = clone(withBind);
    withKind.outputs.writes[0].columns = withKind.outputs.writes[0].columns.filter(
      (c: { bind?: string }) => c.bind !== 'wkb_geometry',
    );
    expect(validate(withKind), 'srid "none" beside a declared geometry_kind is a contradiction').toBe(false);
    expect(errText(validate.errors)).toContain(`#/allOf/${G1_RULE_IDX}/then/properties/outputs/properties/writes/items/not`);

    // (iii) both removed ⇒ the shape 0fs's no-geometry INGESTOR arm exists for. Valid as far
    // as G1 is concerned; whatever else the schema reports must not be about geometry.
    const noGeometry = clone(A);
    noGeometry.guards.srid = 'none';
    noGeometry.outputs.writes[0].columns = noGeometry.outputs.writes[0].columns.filter(
      (c: { bind?: string }) => c.bind !== 'wkb_geometry',
    );
    delete noGeometry.outputs.writes[0].geometry_kind;
    const noGeometryValid = validate(noGeometry);
    const reported = errText(validate.errors);
    for (const term of ['srid', 'geometry_kind', 'wkb_geometry']) {
      expect(reported, `the G1 clause must not reject a geometry-free srid-"none" INGESTOR (${term}) (valid=${noGeometryValid}): ${reported}`).not.toContain(term);
    }
    // …and no error may come from the G1 rule itself (its `not` carries no property name, so
    // the term loop above cannot see it).
    expect(reported).not.toContain(`#/allOf/${G1_RULE_IDX}/`);
  });
});
