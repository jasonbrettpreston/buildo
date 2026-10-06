// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A19 (0y; RE-FREEZE #30, logged in 122 §8)
//
// INGESTOR prerequisite 0y — the SCHEMA arm of the CKAN DataStore acquisition, the
// `ckan_metadata` staleness style and the all-primaries skip scope.
//
//   `externals[].format` gains `"ckan_datastore"` — a primary acquired through paginated
//     CKAN `datastore_search`, whose `source_dataset_version` is the resource's
//     `package_show` `last_modified` (never a content hash);
//   `externals[].ckan` — the CKAN coordinates of that one primary
//     ({resource_id, package_url, page_size_from_config}, all three required);
//   `staleness.trigger[].style` — enum `validator_equality|ckan_metadata` (absent =
//     `validator_equality`, today's behaviour), with `max_age_days_from_config` naming the
//     F-M4 force-reload window the `ckan_metadata` arm reads;
//   `staleness.skip_scope` — enum `per_primary|all_primaries` (absent = `per_primary`,
//     0x's behaviour); `all_primaries` decides skip-or-load ONCE for every primary.
//
// Today `externals.items` is `additionalProperties: false` and declares no `ckan`, and the
// `format` enum is `[shapefile_zip, csv, geojson, xlsx]`: the descriptor the whole plan
// exists for — three CKAN primaries gated by one metadata comparison — is UNREPRESENTABLE.
// `staleness` declares no `skip_scope` and the trigger item declares no `style`.
//
// Every RED assertion below fails TODAY for the stated reason and NOT because of a typo:
//   0y-T1 fails because `ckan` is an unknown property of an item declared
//      `additionalProperties: false` and because `"ckan_datastore"` is not in the enum;
//   0y-T2(1) fails because no rule requires `ckan` beside `format:"ckan_datastore"`, so
//      deleting it leaves a descriptor the schema accepts;
//   0y-T2(2) fails because `ckan` is an unknown key, so `ckan` on a shapefile external is
//      reported as `additionalProperties` — never as the SPECIFIC `not` the rule promises;
//   0y-T2(3) fails because `format:"ckan_datastore"` is rejected by the enum, so the `kind`
//      `const` is unreachable;
//   0y-T2(4) fails for the same reason — the `url` `pattern` is never reached;
//   0y-T2(5) fails because no rule forbids `on_head_error:"warn_row"` beside the arm (and
//      `ckan`/`ckan_datastore` are themselves unknown/rejected);
//   0y-T2(6) fails because the trigger item has no `style`/`max_age_days_from_config`, so
//      `style:"ckan_metadata"` is an unknown property and NO `required` error is emitted;
//   0y-T2(7) fails because `style` is an unknown trigger key, so its `const` is never
//      evaluated against a `content_hash` signal;
//   0y-T2(8) fails because top-level rule M3 does not exist (and `skip_scope` is unknown);
//   0y-T2(9) fails because top-level rule M4 does not exist (and `skip_scope` is unknown);
//   0y-T2(10) fails because Y-I1's `target` clause does not exist;
//   0y-T2(11) is the GR-2 ABSENT-CASE pair: both must be VALID once the fields land, and
//      today both are invalid — so the pair REDs today and PINS the authored `required`+
//      `const` / `not:{required,properties}` forms against the RE-FREEZE #12 F-1 trap (a
//      bare `not:{properties}` is FALSE whenever the field is absent, so it would reject
//      every absent case).
// Each T2 row asserts its SPECIFIC AJV error (keyword + instancePath + params), never only
// `additionalProperties`.
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

type AjvError = { keyword?: string; instancePath?: string; params?: Record<string, unknown> };

/** Locate one AJV error by keyword + instancePath (+ params), never by a bare boolean. */
const errAt = (errors: unknown, match: Record<string, unknown>) =>
  ((errors as AjvError[] | null) ?? []).some(
    (e) =>
      e.keyword === match.keyword &&
      e.instancePath === match.instancePath &&
      Object.entries((match.params as Record<string, unknown>) ?? {}).every(([k, v]) => e.params?.[k] === v),
  );

const PATHS = {
  base: '/inputs/reads/externals/0',
  ovA: '/inputs/reads/externals/1',
  ovB: '/inputs/reads/externals/2',
  targets: [
    { keyword: 'required', instancePath: '/inputs/reads/externals/0', params: { missingProperty: 'target' } },
    { keyword: 'required', instancePath: '/inputs/reads/externals/1', params: { missingProperty: 'target' } },
    { keyword: 'required', instancePath: '/inputs/reads/externals/2', params: { missingProperty: 'target' } },
  ] as const,
};

/**
 * `Z3()` — the zoning-shaped fixture (plan §4): three `ckan_datastore` primaries (`base`
 * → `tbase`, `ov_a` → `tov_a`, `ov_b` → `tov_b`) sharing one `package_url`, each keyed on
 * the DataStore's `_id`, each with its own `ckan` block. `base` declares NO `on_failure`
 * (absent = `abort_step`) and the two overlays declare `warn_row_continue` (DEC-K).
 *
 * Deliberate fixture rules:
 *   GR-2  the positive fixture OMITS `on_head_error` entirely — the authored forbid is
 *         `not:{required:["on_head_error"], properties:{on_head_error:{const:"warn_row"}}}`
 *         so an ABSENT `on_head_error` on a `ckan_datastore` item must stay VALID;
 *   I-A3  every `emits[]` item carries `consumers` (the schema requires key/type/consumers)
 *         and there is NO per-id `skeleton` — `all_primaries` reads no per-primary sub-block;
 *   GR-5c the trigger's `emit_key` names Z3's OWN emit (`layer_versions`), never another
 *         step's;
 *   GR-4  `recovery.interrupted:"force_full_on_next_run"` is the declaration
 *         `detectInterruptedRetraction` is gated on.
 *
 * Built from scratch rather than cloned from a committed descriptor: the 0x model file
 * clones load-ravines (a `shapefile_zip` INGESTOR) and reshapes it; a 0y fixture must be
 * CKAN-shaped from the first byte, every external respecified, the emits block replaced
 * and the triggers replaced, so the clone would save nothing and only add coupling to a
 * descriptor this arm must never touch.
 */
function Z3() {
  const external = (id: string, target: string, onFailure?: string) => ({
    id,
    kind: 'http_api',
    format: 'ckan_datastore',
    url: 'https://ex/api/3/action/datastore_search',
    ckan: {
      resource_id: `R${id}`,
      package_url: 'https://ex/api/3/action/package_show?id=p',
      page_size_from_config: 'load_zoning_datastore_page_size',
    },
    key_property: '_id',
    target,
    ...(onFailure ? { on_failure: onFailure } : {}),
  });

  return {
    identity: {
      name: 'load_zoning',
      display_name: 'Zoning By-law',
      owner: 'data',
      description: 'Loads the zoning by-law layers from the CKAN DataStore.',
      lock: 194,
      why_lock: {
        text: 'One writer of the zoning layers; a second concurrent load would interleave the per-layer upserts.',
        liveness: { kind: 'table', ref: 'zoning_base' },
      },
      spec: '58',
      spec_version: '1.0',
      archetype: 'INGESTOR',
      contract_version: 1,
      gate_exempt: false,
    },

    inputs: {
      reads: {
        steps: [],
        tables: [],
        externals: [
          external('base', 'tbase'),
          external('ov_a', 'tov_a', 'warn_row_continue'),
          external('ov_b', 'tov_b', 'warn_row_continue'),
        ],
      },
      expect_nonempty: true,
      on_missing: 'halt',
    },

    outputs: {
      writes: ['tbase', 'tov_a', 'tov_b'].map((table) => ({
        table,
        key: 'zone_id',
        key_sql_type: 'BIGINT',
        columns: [
          { name: 'zone_id', vocabulary: 'none', written: 'step', bind: 'value' },
          { name: 'source_dataset_version', vocabulary: 'none', written: 'step', bind: 'value' },
        ],
        write_discipline: {
          class: 'insert_only_no_retraction',
          guard: 'is_distinct_from',
          guard_columns: ['source_dataset_version'],
          scope: 'none',
          expected_change_ratio: '<= 0.5',
          idempotent_rerun: 'zero_writes',
          txn_scope: 'step',
          why: { text: 'The zoning layers are replaced layer by layer.', liveness: { kind: 'table', ref: table } },
        },
        retract: 'departed',
      })),
      invalidates: [],
      write_inventory: {
        statements: 3,
        why: { text: 'One guarded upsert per declared target.', liveness: { kind: 'file', ref: 'scripts/lib/step/write.js' } },
      },
    },

    staleness: {
      trigger: [
        {
          signal: 'source_validator',
          position: 'pre_acquisition',
          style: 'ckan_metadata',
          emit_key: 'layer_versions',
          max_age_days_from_config: 'load_zoning_force_reload_max_age_days',
        },
      ],
      skip_scope: 'all_primaries',
      mode_select: 'skip',
      fingerprint: 'derived',
      fingerprint_inputs: ['scripts/lib/source-version.js'],
      logic_version: 'none',
      on_fingerprint_change: 'run',
      on_prior_run_error: 'fail_step',
    },

    guards: { requires: [], srid: 'none', empty_source: 'none', schema_drift: 'pause' },

    execution: {
      txn_scope: 'step',
      statement_timeout: 'none',
      step_timeout: '15m',
      batch: 10000,
      shape: 'ingest',
      on_row_error: 'skip',
      on_row_error_why: {
        text: 'A DataStore page can carry a record the key coercion drops; the tally is reported and the load continues.',
        liveness: { kind: 'file', ref: 'scripts/lib/step/acquire.js' },
      },
      on_batch_error: 'fail_step',
      on_check_error: 'fail_step',
      on_degrade: 'none',
      network: {
        timeout: '60000ms',
        timeout_from_config: 'load_zoning_download_timeout_ms',
        retries: 0,
      },
      invocation: {
        sources: { argv: [], env: { PIPELINE_CHAIN: 'sources' } },
      },
      maintenance: 'none',
    },

    checks: [
      {
        id: 'zoning_layer_count',
        kind: 'field_coverage',
        expect: { reports: 'the DataStore record count the base layer yielded' },
        limit: 'viol == 0',
        severity: 'INFO',
        blocking: false,
        when: 'post',
        chains: 'all',
        accept_until: 'none',
        why: {
          text: 'The denominator every ratio in this table reads; a page loop that silently truncated would under-state the by-law.',
          liveness: { kind: 'table', ref: 'zoning_base' },
        },
      },
    ],

    emits: [
      { key: 'layer_versions', type: 'object', consumers: [] },
      { key: 'layers_loaded', type: 'object', consumers: [] },
      { key: 'audit_table', type: 'object', consumers: [] },
    ],

    deviations: 'none',

    limitations: 'none',

    interpretation: 'none',

    recovery: {
      reset: 'none',
      resume: 'none',
      force: 'none',
      rollback: 'none',
      verify_clean: 'generated',
      cascades: 'derived',
      interrupted: 'force_full_on_next_run',
      before_image: 'none',
      before_image_why: {
        text: 'Every write target declares retract "departed", a keyed departure DELETE an incremental gate reads correctly; no before-image is mirrored.',
        liveness: 'none',
      },
    },

    database: { class: 'primary', min_migration: 1, assert_current_database: 'postgres' },

    invariants: 'none',
    plausibility: 'none',
    // FLEET-2 MQ-A7 (step.schema.json allOf[11]): schema_drift "pause" requires override.force_run as an env var.
    // Same shape as the real load-zoning descriptor.
    override: { force_full: 'none', force_run: 'ZONING_FORCE_RELOAD', dry_run: 'none' },

    counters: {
      records_total: { source: 'acquired.feature_count' },
      records_new: { source: 'written.inserted' },
      records_updated: { source: 'written.updated' },
    },

    config: {
      logic_variables: [
        { name: 'load_zoning_datastore_page_size', min: 1, max: 32000, on_invalid: 'fail' },
        { name: 'load_zoning_force_reload_max_age_days', min: 1, max: 3650, on_invalid: 'fail' },
        { name: 'load_zoning_download_timeout_ms', min: 1000, max: 600000, on_invalid: 'clamp' },
      ],
      validation: 'strict',
      hoisted_above_gate: true,
    },

    sharing: {
      chains: 'derived',
      shared: 'derived',
      slug_forms: 'derived',
      varies_by_chain: { checks: 'none', phase: { sources: 58 }, audit_table: 'one', scope: 'none' },
      on_contention: 'self_skip',
    },

    terminals: [
      {
        id: 'loaded',
        kind: 'success',
        status: 'completed',
        records_meta: { layer_versions: 'object', layers_loaded: 'object', audit_table: 'object' },
      },
    ],
  };
}

/**
 * The three CKAN primaries, viewed as loose records so one builder can rewrite the
 * overrides (shape mutations the schema rejects, absent-field deletions) without the
 * fixture's inferred literal type — which `noUncheckedIndexedAccess` would make
 * `… | undefined` at every index — getting in the way.
 */
const externalsOf = (d: ReturnType<typeof Z3>): Array<Record<string, any>> =>
  d.inputs.reads.externals as Array<Record<string, any>>;

/** Every external is FK-shaped the same way, so one builder rewrites the overrides. */
const withExternals = (mutate: (externals: Array<Record<string, any>>) => void) => {
  const d = Z3();
  mutate(externalsOf(d));
  return d as Record<string, any>;
};

describe('INGESTOR prerequisite 0y — ckan_datastore + ckan + trigger style + skip_scope (schema)', () => {
  // -------------------------------------------------------------------------
  // 0y-T1 — the CKAN-shaped, all-primaries descriptor is EXPRESSIBLE. RED today: `ckan`
  // is an unknown property of an item declared `additionalProperties: false` and
  // `"ckan_datastore"` is absent from the `format` enum, so the descriptor the whole plan
  // exists for is rejected by the schema.
  // -------------------------------------------------------------------------
  it('0y-T1 — a three-primary CKAN DataStore INGESTOR with ckan_metadata + all_primaries validates', () => {
    expect(
      validate(Z3()),
      `a three-primary ckan_datastore INGESTOR with ckan_metadata + skip_scope:"all_primaries" must be representable: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 0y-T2 — the refusals, each located by its OWN AJV error.
  // -------------------------------------------------------------------------
  it('0y-T2(1) — Y-I1: `format:"ckan_datastore"` requires the `ckan` block', () => {
    const d = withExternals((externals) => {
      const base = externals[0];
      expect(base, 'the T1 fixture must carry a first (base) external to reshape').toBeDefined();
      if (!base) throw new Error('Z3() must expose a first external to mutate');
      delete base.ckan;
    });
    expect(validate(d), 'a ckan_datastore external with no ckan block cannot be acquired').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'required', instancePath: PATHS.base, params: { missingProperty: 'ckan' } }),
      `expected the Y-I1 required/ckan error at ${PATHS.base}: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(2) — Y-I1: `ckan` on a `shapefile_zip` external is refused at the offending item', () => {
    const d = withExternals((externals) => {
      externals.push({
        id: 'shp',
        kind: 'http_file',
        format: 'shapefile_zip',
        url: 'https://ex/layer.zip',
        ckan: {
          resource_id: 'Rshp',
          package_url: 'https://ex/api/3/action/package_show?id=p',
          page_size_from_config: 'load_zoning_datastore_page_size',
        },
        target: 'tbase',
      });
    });
    expect(validate(d), '`ckan` names CKAN coordinates only the ckan_datastore arm reads').toBe(false);
    // The grounder-verified Y-I1 (fix F1) refuses `ckan` on a `shapefile_zip` external through the
    // `then` branch (a `const` error on `format`), NOT through an item-level `not`. So DO NOT pin a
    // keyword: require only that at least one AJV error sits at the offending external's path (or a
    // child of it).
    const offendingPath = '/inputs/reads/externals/3';
    expect(
      ((validate.errors as AjvError[] | null) ?? []).some((e) => (e.instancePath ?? '').startsWith(offendingPath)),
      `expected at least one Y-I1 error at ${offendingPath} (or a child): ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(3) — Y-I1: the arm is `kind:"http_api"`, never a file transport', () => {
    const d = withExternals((externals) => {
      const base = externals[0];
      expect(base, 'the T1 fixture must carry a first (base) external to reshape').toBeDefined();
      if (!base) throw new Error('Z3() must expose a first external to mutate');
      base.kind = 'http_file';
    });
    expect(validate(d), 'datastore_search is a JSON API, not a file download').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'const', instancePath: `${PATHS.base}/kind` }),
      `expected the Y-I1 const/http_api error at ${PATHS.base}/kind: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(4) — Y-I1: the `url` is the BARE endpoint (the arm appends the query)', () => {
    const d = withExternals((externals) => {
      const base = externals[0];
      expect(base, 'the T1 fixture must carry a first (base) external to reshape').toBeDefined();
      if (!base) throw new Error('Z3() must expose a first external to mutate');
      base.url = 'https://ex/datastore_search?x=1';
    });
    expect(validate(d), 'a url already carrying a query string cannot have resource_id/limit/offset appended').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'pattern', instancePath: `${PATHS.base}/url` }),
      `expected the Y-I1 pattern error at ${PATHS.base}/url: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(5) — Y-I1: `on_head_error:"warn_row"` beside the arm is refused (inert with no version)', () => {
    const d = withExternals((externals) => {
      const base = externals[0];
      expect(base, 'the T1 fixture must carry a first (base) external to reshape').toBeDefined();
      if (!base) throw new Error('Z3() must expose a first external to mutate');
      base.on_head_error = 'warn_row';
    });
    expect(validate(d), 'with no package_show version the arm cannot load, so a swallowed HEAD is inert (R-AJ)').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'not', instancePath: PATHS.base }),
      `expected the Y-I1 not/on_head_error error at ${PATHS.base}: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(6) — Y-T1: `style:"ckan_metadata"` requires `max_age_days_from_config` and `emit_key`', () => {
    const noMaxAge = Z3();
    delete (noMaxAge.staleness.trigger[0] as Record<string, any>).max_age_days_from_config;
    expect(validate(noMaxAge), 'the F-M4 force-reload window is read by the ckan_metadata decision').toBe(false);
    expect(
      errAt(validate.errors, {
        keyword: 'required',
        instancePath: '/staleness/trigger/0',
        params: { missingProperty: 'max_age_days_from_config' },
      }),
      `expected the Y-T1 required/max_age_days_from_config error at /staleness/trigger/0: ${errText(validate.errors)}`,
    ).toBe(true);

    const noEmitKey = Z3();
    delete (noEmitKey.staleness.trigger[0] as Record<string, any>).emit_key;
    expect(validate(noEmitKey), 'the prior emit mapping primary id to stored version is what the style compares against').toBe(false);
    expect(
      errAt(validate.errors, {
        keyword: 'required',
        instancePath: '/staleness/trigger/0',
        params: { missingProperty: 'emit_key' },
      }),
      `expected the Y-T1 required/emit_key error at /staleness/trigger/0: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(7) — Y-T1: a `content_hash` signal cannot carry the `ckan_metadata` style', () => {
    const d = Z3();
    (d.staleness.trigger[0] as Record<string, any>).signal = 'content_hash';
    expect(validate(d), 'the style is a PRE-ACQUISITION metadata comparison, not a post-download hash').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'const', instancePath: '/staleness/trigger/0/signal' }),
      `expected the Y-T1 const/source_validator error at /staleness/trigger/0/signal: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(8) — M3: `skip_scope` with no targeted external is refused (inert on a single-primary step)', () => {
    const d = withExternals((externals) => {
      for (const e of externals) delete e.target;
    });
    expect(validate(d), 'skip_scope decides for all primaries; with no primary there is nothing to decide (R-AJ)').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'contains', instancePath: '/inputs/reads/externals' }),
      `expected the M3 contains/target error at /inputs/reads/externals: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(9) — M4: a `ckan_metadata` trigger requires `staleness.skip_scope` (GR-2 `required`+`const`)', () => {
    const d = Z3();
    delete (d.staleness as Record<string, any>).skip_scope;
    expect(validate(d), 'the metadata comparison decides ONCE for all primaries, so it requires the all_primaries scope').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'required', instancePath: '/staleness', params: { missingProperty: 'skip_scope' } }),
      `expected the M4 required/skip_scope error at /staleness: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(10) — Y-I1 (I-A7): `ckan_datastore` requires `target`', () => {
    const d = withExternals((externals) => {
      const base = externals[0];
      expect(base, 'the T1 fixture must carry a first (base) external to reshape').toBeDefined();
      if (!base) throw new Error('Z3() must expose a first external to mutate');
      delete base.target;
    });
    expect(validate(d), 'the arm exists for the multi-primary binding; an untargeted primary has no write target').toBe(false);
    expect(
      errAt(validate.errors, { keyword: 'required', instancePath: PATHS.base, params: { missingProperty: 'target' } }),
      `expected the Y-I1 required/target error at ${PATHS.base}: ${errText(validate.errors)}`,
    ).toBe(true);
  });

  it('0y-T2(11) — GR-2 ABSENT CASES: no `on_head_error`, and `skip_scope` with no `ckan_metadata` trigger, are both VALID', () => {
    // (a) `on_head_error` ABSENT on a ckan_datastore item. The authored forbid is
    // `not:{required:["on_head_error"], properties:{on_head_error:{const:"warn_row"}}}`; a
    // bare `not:{properties}` would be FALSE whenever the field is absent (RE-FREEZE #12
    // F-1) and would reject this row.
    const absentHeadError = Z3();
    for (const e of absentHeadError.inputs.reads.externals) {
      expect(e, 'the T1 fixture must omit on_head_error entirely (GR-2)').not.toHaveProperty('on_head_error');
    }
    expect(
      validate(absentHeadError),
      `a ckan_datastore external with NO on_head_error must stay valid: ${errText(validate.errors)}`,
    ).toBe(true);

    // (b) `skip_scope:"all_primaries"` with NO `cnan_metadata` trigger. M4 refuses the
    // converse (style without skip_scope); it must NOT refuse this direction, and M3 is
    // satisfied by the three targeted externals.
    const noMetadataTrigger = Z3();
    noMetadataTrigger.staleness.trigger = [
      { signal: 'source_validator', position: 'pre_acquisition', external: 'base' },
    ] as unknown as typeof noMetadataTrigger.staleness.trigger;
    for (const e of noMetadataTrigger.inputs.reads.externals) {
      expect(e.target, 'M3 is satisfied by targeted externals').toBeTruthy();
    }
    expect(
      validate(noMetadataTrigger),
      `skip_scope is NOT refused when no trigger declares ckan_metadata (still M3 + runtime Y2): ${errText(validate.errors)}`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 0y-T3 — PIN: the rule set is ADDITIVE. Every committed descriptor keeps validating,
  // and NONE declares a 0y field — so 0y's byte change cannot alter their behaviour.
  // The set is ENUMERATED BY GLOB (I-A4 / grounder 5f), never a hard-coded count: the
  // directory lists grow as steps convert, and a pinned literal would rot silently.
  // -------------------------------------------------------------------------
  it('0y-T3 — every descriptor (by glob) still validates, and none declares a 0y field', () => {
    const dirs = ['scripts', path.join('scripts', 'quality')];
    const globbed: string[] = [];
    for (const dir of dirs) {
      for (const name of fs.readdirSync(path.join(process.cwd(), dir))) {
        if (!name.endsWith('.descriptor.json')) continue;
        globbed.push(path.join(process.cwd(), dir, name));
      }
    }
    expect(globbed.length, 'the glob must find the committed descriptor set (non-recursive)').toBeGreaterThan(0);

    const triggersAt = (descriptor: Record<string, any>) =>
      Array.isArray(descriptor.staleness?.trigger) ? (descriptor.staleness.trigger as Array<Record<string, any>>) : [];

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
        for (const e of (descriptor.inputs?.reads?.externals as Array<Record<string, any>>) ?? []) {
          expect(e.format, `${label}'s external ${e.id} must declare the 0y \`ckan_datastore\` format`).toBe(
            'ckan_datastore',
          );
          expect(e.ckan, `${label}'s external ${e.id} must declare the 0y \`ckan\` block`).toBeDefined();
        }
        expect(
          descriptor.staleness?.skip_scope,
          `${label} is the declared all-primaries consumer and must declare staleness.skip_scope`,
        ).toBe('all_primaries');
        expect(triggersAt(descriptor), `${label} must declare exactly the one ckan_metadata trigger`).toHaveLength(1);
        expect(triggersAt(descriptor)[0]!.style, `${label}'s trigger must declare the 0y \`ckan_metadata\` style`).toBe(
          'ckan_metadata',
        );
        continue;
      }

      for (const e of (descriptor.inputs?.reads?.externals as Array<Record<string, any>>) ?? []) {
        expect(e.ckan, `${label}'s external ${e.id} must not declare a 0y \`ckan\` block`).toBeUndefined();
        expect(e.format, `${label}'s external ${e.id} must not declare a 0y format`).not.toBe('ckan_datastore');
      }
      expect(
        descriptor.staleness?.skip_scope,
        `${label} must not declare staleness.skip_scope (absent = per_primary)`,
      ).toBeUndefined();
      for (const trigger of triggersAt(descriptor)) {
        expect(trigger.style, `${label} has a trigger declaring a 0y \`style\``).toBeUndefined();
      }
    }

    expect(consumerSeen, 'the glob must reach scripts/load-zoning.descriptor.json (the declared consumer)').toBe(true);
  });
});

// A tiny sanity net for the T2(11) list, so the "no targeted external" precondition in
// T2(8) and the "targeted externals" precondition in T2(11b) can never silently drift
// into passing against an empty array.
describe('INGESTOR prerequisite 0y — fixture preconditions', () => {
  it('Z3 declares exactly the three targeted CKAN primaries the 0y rules are stated over', () => {
    const d = Z3();
    expect(d.inputs.reads.externals).toHaveLength(3);
    for (const [i, external] of d.inputs.reads.externals.entries()) {
      expect(external.format).toBe('ckan_datastore');
      expect(external.kind).toBe('http_api');
      expect(external.target).toBeTruthy();
      expect(external.key_property).toBe('_id');
      expect(external.url).not.toContain('?');
      expect(external.ckan.package_url).toBe('https://ex/api/3/action/package_show?id=p');
      if (i === 0) expect(external).not.toHaveProperty('on_failure');
      else expect(external.on_failure).toBe('warn_row_continue');
    }
    expect(d.staleness.skip_scope).toBe('all_primaries');
    expect(d.staleness.trigger).toHaveLength(1);
    const trigger = d.staleness.trigger[0];
    expect(trigger, 'Z3 declares exactly one staleness trigger').toBeDefined();
    if (!trigger) throw new Error('Z3() must declare a staleness trigger at index 0');
    expect(trigger.emit_key).toBe('layer_versions');
    expect(new Set(d.outputs.writes.map((w: { table: string }) => w.table))).toEqual(new Set(['tbase', 'tov_a', 'tov_b']));
    expect(new Set(d.outputs.writes.map((w: { table: string }) => w.table)).size).toBe(d.inputs.reads.externals.length);
    expect(clone(Z3())).toEqual(Z3());
  });
});
