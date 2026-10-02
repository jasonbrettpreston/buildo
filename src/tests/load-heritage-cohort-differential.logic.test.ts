// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AS
// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §9
//
// R-AS (Spec 124 §5): a write target whose `IS DISTINCT FROM` guard includes the
// lineage/version stamp the step itself writes writes 0 rows on an unchanged source —
// so a forced FULL over an unchanged source proves NOTHING about value equivalence.
// LH-D2 (Spec 61 §9 as-built note) PINS the version stamp into BOTH heritage targets'
// guards, so a forced run over an unchanged source is a zero-writes no-op and the
// instrument that actually PROVES value equivalence is a COMMITTED PERTURBATION COHORT
// run against the LEGACY step (PRE) and the CONVERTED step (POST). Precedent:
// scripts/analysis/neighbourhoods-cohort-differential.js (batch-2 row 3.8), whose
// `--derive`/`--run` shape this script mirrors. `b2-row3.4-c2h2` writes the script
// (scripts/analysis/load-heritage-cohort-differential.js); THIS file is its RED lock
// for the two PURE exports, `deriveCohort` and `judge`, plus `SIZES`.
//
// The test EXECUTES those two exports — it never asserts on the script's source text.
// `deriveCohort` picks a DISJOINT perturbation cohort per heritage target keyed by the
// target's own key list; `judge` reads the run's `records_meta.heritage_load` plus the
// per-table before/after hashes and returns the list of failed R-AS claims ([] = PASS).

import { describe, it, expect } from 'vitest';

// The script is CommonJS (like every scripts/analysis/*.js driver); the require is
// intentional and exercised, not simulated.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module
const mod = require('../../scripts/analysis/load-heritage-cohort-differential.js') as {
  deriveCohort: (input: Cohorts) => DerivedCohort;
  judge: (input: { cohort: DerivedCohort; heritageLoad: HeritageLoad; hashes: Hashes; baselineExceptA?: Record<Table, string> }) => string[];
  SIZES: Record<Table, { U: number; D: number; A: number; P: number; negative_control: number }>;
  buildPhantomInsertSql: (table: Table, columns: string[]) => PhantomInsert;
  buildRestoreDeleteSql: (table: Table, dKeysPresent: number[]) => RestoreDelete;
  // hf3 — the PRE/POST gate signals and the abort/perturbed safety surface.
  sameSource: (a: string, b: string) => boolean;
  isConvertedShim: (text: string) => boolean;
  abortIfInterrupted: (state: { interrupted: boolean }) => void;
  parseArgs: (argv: string[]) => {
    derive: boolean; run: boolean; side: string | null; chain: string; out: string | null; legacyRef: string | null;
  };
};
const {
  deriveCohort, judge, SIZES, buildPhantomInsertSql, buildRestoreDeleteSql,
  sameSource, isConvertedShim, abortIfInterrupted, parseArgs,
} = mod;
type PhantomInsert = { text: string; typesUsed: string[] };
type RestoreDelete = { text: string; params: unknown[] };

type Table = 'heritage_properties' | 'heritage_districts';
type Cohorts = Record<Table, number[]>;
type Arm = { U: number[]; D: number[]; A: number[]; P: number[]; negative_control: number[] };
type DerivedCohort = Record<Table, Arm>;
type Counters = { features_inserted: number; features_updated: number; features_deleted: number };
/**
 * `records_meta.heritage_load` AS THE COMPUTE EMITS IT — i.e. the VALUE the run puts under
 * the `heritage_load` key, which is exactly what `--run` passes as `judge`'s `heritageLoad`
 * (`const heritageLoad = (summary.records_meta || {}).heritage_load || {}`). Its sub-blocks
 * are named by the contract's §9 emit keys (`EMIT.skeleton` in
 * scripts/load-heritage.descriptor.json), i.e. by the declared PRIMARY id — the register lane
 * emits `heritage_register`, NOT `heritage_properties` (hf2/B3: reading `heritageLoad[table]`
 * reads an absent key and every counter is `undefined`). `buildLoadMeta` spreads one
 * `subFor(ctx, lane)` per `inputs.reads.externals` id, so the key of the register's sub-block
 * is its own id — the register's counters are NOT the districts'.
 *
 * NOTE the shape: `heritageLoad` is the INNER object (`{ heritage_register, heritage_districts }`),
 * NOT `records_meta` and NOT a `{ heritage_load: … }` wrapper — `--run` has already unwrapped
 * the `heritage_load` key before calling `judge`.
 */
type HeritageLoad = {
  heritage_register?: Counters;
  heritage_districts?: Counters;
  // The pre-hf2 shape the c2h1 lock used (`{ <table>: {...} }`) is kept OUT of the type: it
  // is exactly the wrong fixture shape, and hf2 re-pins that lock onto the real one.
} & Partial<Record<Table, Counters>>;
type Hashes = Record<Table, { baseline: string; afterExceptA: string; aPerturbedStill: boolean }>;

const TABLES: Table[] = ['heritage_properties', 'heritage_districts'];

/**
 * The sub-block a table's counters live in, inside `heritageLoad`. The register lane's
 * sub-block is named by the PRIMARY id (`heritage_register`), never by its write target
 * (`heritage_properties`) — the script's own `SUB_BLOCK` map, mirrored here as the fixture
 * contract so a test cannot accidentally hand `judge` the wrong shape.
 */
const SUB_BLOCK: Record<Table, string> = {
  heritage_properties: 'heritage_register',
  heritage_districts: 'heritage_districts',
};

/** Wrap per-table counters in the REAL emit shape: `{ <sub-block>: counters }` (the inner `heritage_load` value). */
function emitShaped(counters: Record<Table, Counters>): HeritageLoad {
  const sub: Record<string, Counters> = {};
  for (const t of TABLES) sub[SUB_BLOCK[t]] = counters[t];
  return sub as HeritageLoad;
}

/** Ascending key list 1..n — the shape --derive reads from the table (ORDER BY key). */
const keys = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** A deterministic Fisher-Yates shuffle (fixed seed) — a DIFFERENT order, same key set. */
function shuffled<T>(input: T[]): T[] {
  const out = input.slice();
  let state = 0x2f6e2b1;
  const next = (): number => (state = (state * 1103515245 + 12345) & 0x7fffffff) % (out.length + 1);
  for (let i = out.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) throw new Error('shuffled: index out of range');
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** The live-sized source: heritage_properties 40 keys, heritage_districts 29 keys. */
const source = (): Cohorts => ({
  heritage_properties: keys(40),
  heritage_districts: keys(29),
});

const sortedAsc = (a: number[]): number[] => a.slice().sort((x, y) => x - y);

describe('load-heritage-cohort-differential — R-AS cohort derivation and judging (pure)', () => {
  describe('SIZES — the declared arm sizes', () => {
    it('properties {U:5, D:5, A:5, P:1}, districts {U:2, D:1, A:1, P:1}', () => {
      expect(SIZES.heritage_properties).toEqual({ U: 5, D: 5, A: 5, P: 1 });
      expect(SIZES.heritage_districts).toEqual({ U: 2, D: 1, A: 1, P: 1 });
    });
  });

  describe('deriveCohort — disjoint, exhaustive, phantom-P, order-independent', () => {
    it('returns { U, D, A, P, negative_control } per table at the declared sizes', () => {
      const derived = deriveCohort(source());
      for (const t of TABLES) {
        const arm = derived[t];
        for (const name of ['U', 'D', 'A', 'P', 'negative_control'] as const) {
          expect(Array.isArray(arm[name]), `${t}.${name} is an array`).toBe(true);
          expect(arm[name].length, `${t}.${name} size`).toBe(SIZES[t][name]);
        }
      }
    });

    it('U, D, A, negative_control are pairwise DISJOINT and their union is EXACTLY the input keys', () => {
      const input = source();
      const derived = deriveCohort(input);
      for (const t of TABLES) {
        const arm = derived[t];
        const sets = {
          U: new Set(arm.U),
          D: new Set(arm.D),
          A: new Set(arm.A),
          negative_control: new Set(arm.negative_control),
        };
        const names = Object.keys(sets) as Array<keyof typeof sets>;
        // Pairwise disjoint.
        for (let i = 0; i < names.length; i++) {
          for (let j = i + 1; j < names.length; j++) {
            const ni = names[i];
            const nj = names[j];
            if (ni === undefined || nj === undefined) throw new Error('sets: missing arm name');
            const left = sets[ni];
            const right = sets[nj];
            if (!left || !right) throw new Error('sets: missing arm set');
            const overlap = [...left].filter((k) => right.has(k));
            expect(overlap, `${t}: ${ni} ∩ ${nj}`).toEqual([]);
          }
        }
        // Exhaustive over U ∪ D ∪ A ∪ negative_control == the input key set.
        const union = new Set<number>([...arm.U, ...arm.D, ...arm.A, ...arm.negative_control]);
        expect(sortedAsc([...union]), `${t}: U∪D∪A∪negative_control`).toEqual(sortedAsc(input[t]));
      }
    });

    it('P is the phantom key max(input) + 100000 — absent from the source', () => {
      const input = source();
      const derived = deriveCohort(input);
      for (const t of TABLES) {
        const tx: Table = t;
        expect(derived[tx].P, `${tx}.P`).toEqual([Math.max(...input[tx]) + 100000]);
        expect(input[tx], `${tx}: phantom key is absent from the source`).not.toContain(derived[tx].P[0]);
      }
    });

    it('is deterministic — a shuffled input yields the SAME cohort', () => {
      const ordered = deriveCohort(source());
      const shuffledInput: Cohorts = {
        heritage_properties: shuffled(source().heritage_properties),
        heritage_districts: shuffled(source().heritage_districts),
      };
      // Sanity: the shuffled list is genuinely a permutation, not the same array object.
      expect(shuffledInput.heritage_properties).not.toEqual(source().heritage_properties);
      expect(deriveCohort(shuffledInput)).toEqual(ordered);
    });

    it('throws (by name) when a table has fewer keys than U + D + A + 1', () => {
      const pSizes = SIZES.heritage_properties;
      const dSizes = SIZES.heritage_districts;
      if (!pSizes || !dSizes) throw new Error('SIZES: missing table arm sizes');
      const tooShort: Cohorts = {
        heritage_properties: keys(pSizes.U + pSizes.D + pSizes.A),
        heritage_districts: keys(29),
      };
      expect(() => deriveCohort(tooShort)).toThrowError(/heritage_properties/);
      const tooShortDistricts: Cohorts = {
        heritage_properties: keys(40),
        heritage_districts: keys(dSizes.U + dSizes.D + dSizes.A),
      };
      expect(() => deriveCohort(tooShortDistricts)).toThrowError(/heritage_districts/);
    });
  });

  describe('judge — [] means PASS; each failed claim is NAMED', () => {
    /**
     * A fully PASSing fixture: the cohort, a load whose counters equal the arm sizes, and hashes
     * back to baseline. hf2 RE-PINNED: `heritageLoad` used to be keyed by the WRITE TARGET
     * (`{ heritage_properties: {...} }`), which no run ever emits — the compute emits per-primary
     * sub-blocks named by the §9 emit keys, so the register's counters live under
     * `heritage_load.heritage_register` and `heritageLoad.heritage_properties` was `undefined`.
     * The fixture now wraps the same numbers in the real emit shape, so these c2h1 assertions
     * exercise the same reading path as a live run (see the script's own `SUB_BLOCK`).
     */
    function passFixture(): {
      cohort: DerivedCohort; heritageLoad: HeritageLoad; hashes: Hashes; baselineExceptA: Record<Table, string>;
    } {
      const cohort = deriveCohort(source());
      const heritageLoad = emitShaped({
        heritage_properties: { features_inserted: 5, features_updated: 5, features_deleted: 1 },
        heritage_districts: { features_inserted: 1, features_updated: 2, features_deleted: 1 },
      });
      const hashes: Hashes = {
        heritage_properties: { baseline: 'h-p-base-whole', afterExceptA: 'h-p-base', aPerturbedStill: true },
        heritage_districts: { baseline: 'h-d-base-whole', afterExceptA: 'h-d-base', aPerturbedStill: true },
      };
      // The after-hash EXCLUDES the A arm, so its peer baseline must exclude it too (hf2). In a
      // real run this is measured live in step 2, with the same WHERE clause.
      const baselineExceptA: Record<Table, string> = {
        heritage_properties: 'h-p-base',
        heritage_districts: 'h-d-base',
      };
      return { cohort, heritageLoad, hashes, baselineExceptA };
    }

    it('PASS input returns [] for both tables', () => {
      const fx = passFixture();
      expect(judge(fx)).toEqual([]);
    });

    it('inserted ≠ |D| fails, naming inserted:heritage_properties', () => {
      const fx = passFixture();
      fx.heritageLoad.heritage_register!.features_inserted = 4;
      const failures = judge(fx);
      expect(failures.length).toBeGreaterThan(0);
      expect(failures.join('\n')).toContain('inserted:heritage_properties');
    });

    it('updated ≠ |U| fails, naming updated:heritage_districts', () => {
      const fx = passFixture();
      fx.heritageLoad.heritage_districts!.features_updated = 1;
      const failures = judge(fx);
      expect(failures.join('\n')).toContain('updated:heritage_districts');
    });

    it('deleted ≠ |P| fails, naming deleted:heritage_properties', () => {
      const fx = passFixture();
      fx.heritageLoad.heritage_register!.features_deleted = 0;
      const failures = judge(fx);
      expect(failures.join('\n')).toContain('deleted:heritage_properties');
    });

    it('a hash that did not return to baseline fails, naming hash:heritage_districts', () => {
      const fx = passFixture();
      fx.hashes.heritage_districts.afterExceptA = 'h-d-drifted';
      const failures = judge(fx);
      expect(failures.join('\n')).toContain('hash:heritage_districts');
    });

    it('a HEALED A arm fails (LH-D2: neither path names the A column), naming guard_composition:heritage_properties', () => {
      const fx = passFixture();
      fx.hashes.heritage_properties.aPerturbedStill = false;
      const failures = judge(fx);
      expect(failures.join('\n')).toContain('guard_composition:heritage_properties');
    });
  });

  // hf2 (grounder B3): `judge` read `heritageLoad[table]` — the WRITE TARGET name — while the
  // compute emits one sub-block per declared PRIMARY, keyed by the §9 emit keys
  // (`heritage_load.heritage_register` for the register lane, whose target is
  // heritage_properties; `heritage_load.heritage_districts` for the other). Every counter read
  // from the wrong key was `undefined`, and `Number(undefined) !== |arm|` failed EVERY claim on
  // EVERY real run. This describe's fixture is shaped exactly like the compute's emit, so a
  // regression to the target-keyed read fails here rather than only on a live `--run`.
  describe('hf2 — judge reads the §9 sub-block and the baseline-relative hash', () => {
    /** A REALISTIC load fixture + a matching cohort: perfect counters, afterExceptA back to baseline. */
    function realisticFixture(): {
      cohort: DerivedCohort; heritageLoad: HeritageLoad; hashes: Hashes; baselineExceptA: Record<Table, string>;
    } {
      const cohort = deriveCohort(source());
      const heritageLoad = emitShaped({
        heritage_properties: { features_inserted: 5, features_updated: 5, features_deleted: 1 },
        heritage_districts: { features_inserted: 1, features_updated: 2, features_deleted: 1 },
      });
      // The BASELINE minus the A arm — the value the step's run must return `afterExceptA` to.
      // It is deliberately NOT the whole-table baseline: a satisfied claim compares the same
      // WHERE clause on both sides (the after-hash excludes A, so its baseline must too).
      const baselineExceptA: Record<Table, string> = {
        heritage_properties: 'h-p-base-except-a',
        heritage_districts: 'h-d-base-except-a',
      };
      const hashes: Hashes = {
        heritage_properties: { baseline: 'h-p-base-whole', afterExceptA: baselineExceptA.heritage_properties, aPerturbedStill: true },
        heritage_districts: { baseline: 'h-d-base-whole', afterExceptA: baselineExceptA.heritage_districts, aPerturbedStill: true },
      };
      return { cohort, heritageLoad, hashes, baselineExceptA };
    }

    it('PASSes every claim on a load shaped exactly like the compute emit (sub-block keys per primary)', () => {
      const { cohort, heritageLoad, hashes, baselineExceptA } = realisticFixture();
      // Sanity: the fixture is NOT keyed by the write target — that was B3's wrong read.
      expect(heritageLoad.heritage_register).toBeDefined();
      expect((heritageLoad as Record<string, unknown>).heritage_properties).toBeUndefined();
      const failures = judge({ cohort, heritageLoad, hashes, baselineExceptA });
      expect(failures).toEqual([]);
    });

    it('a wrong counter fails, NAMING it (features_updated under the register sub-block)', () => {
      const { cohort, heritageLoad, hashes, baselineExceptA } = realisticFixture();
      // Mutate INSIDE the real sub-block: `heritageLoad.heritage_register.features_updated`.
      heritageLoad.heritage_register!.features_updated = 4;
      const failures = judge({ cohort, heritageLoad, hashes, baselineExceptA });
      expect(failures.join('\n')).toContain('updated:heritage_properties');
      // And ONLY that claim: the other counters are still perfect.
      expect(failures.length).toBe(1);
    });

    it('a wrong deleted counter fails, naming deleted:heritage_districts', () => {
      const { cohort, heritageLoad, hashes, baselineExceptA } = realisticFixture();
      heritageLoad.heritage_districts!.features_deleted = 0;
      const failures = judge({ cohort, heritageLoad, hashes, baselineExceptA });
      expect(failures.join('\n')).toContain('deleted:heritage_districts');
    });

    it('a wrong inserted counter fails, naming inserted:heritage_properties', () => {
      const { cohort, heritageLoad, hashes, baselineExceptA } = realisticFixture();
      heritageLoad.heritage_register!.features_inserted = 0;
      const failures = judge({ cohort, heritageLoad, hashes, baselineExceptA });
      expect(failures.join('\n')).toContain('inserted:heritage_properties');
    });

    it('afterExceptA != baselineExceptA fails, naming hash:<table> (the whole-table baseline can never equal it)', () => {
      const { cohort, heritageLoad, hashes, baselineExceptA } = realisticFixture();
      hashes.heritage_districts.afterExceptA = 'h-d-drifted';
      const failures = judge({ cohort, heritageLoad, hashes, baselineExceptA });
      expect(failures.join('\n')).toContain('hash:heritage_districts');
    });
  });

  // hf1: the phantom INSERT and the restore DELETE are BUILT BY these two pure functions, so the
  // two grounder-measured defects (B1: `$n::undefined` on the clock columns; B2: `id <> ALL('{NaN}')`
  // against a before-image that has no `id`) are pinned here rather than re-derived live.
  describe('hf1 — SQL builders (pure): phantom INSERT + restore DELETE', () => {
    const PROJ_BY_TABLE: Record<Table, string[]> = {
      heritage_properties: [
        'source_id', 'status', 'geom', 'designated_date', 'bylaw_no', 'htg_conser_name',
        'building_type', 'reason', 'address_text', 'construction_year', 'source_dataset_version',
      ],
      heritage_districts: [
        'source_id', 'name', 'hcd_type', 'geom', 'designated_date', 'bylaw_no', 'wards',
        'source_dataset_version',
      ],
    };

    describe('buildPhantomInsertSql — B1: no `::undefined`, defaults apply, geom via EWKB', () => {
      for (const table of TABLES) {
        it(`${table}: binds every projected column, names no id/created_at/updated_at`, () => {
          const cols = PROJ_BY_TABLE[table];
          const { text, typesUsed } = buildPhantomInsertSql(table, cols);
          // B1: a `::undefined` cast is the grounder-measured Postgres failure.
          expect(text).not.toContain('::undefined');
          // The DDL defaults apply — these three are never named (id is a serial, the clocks move).
          expect(text).not.toMatch(/\bid\b/);
          expect(text).not.toContain('created_at');
          expect(text).not.toContain('updated_at');
          // Every projected column IS bound (the INSERT lists exactly the projection).
          for (const c of cols) expect(text, `${table}: names ${c}`).toContain(c);
          // Each bound column has a real type, and none is `undefined`.
          expect(typesUsed.length).toBeGreaterThan(0);
          expect(typesUsed).not.toContain(undefined);
          // The geom column is bound from its WKB hex — the same bind the script uses elsewhere.
          if (cols.includes('geom')) {
            expect(text).toContain('ST_GeomFromEWKB(decode(');
          }
          // `source_id` keeps the explicit bigint cast the script already uses.
          expect(text).toContain('::bigint');
        });
      }

      it('THROWS by name when a non-geom column has no COLUMN_TYPE entry', () => {
        // `not_a_real_column` is deliberately absent from the script's COLUMN_TYPE map.
        const cols = [...PROJ_BY_TABLE.heritage_properties, 'not_a_real_column'];
        expect(() => buildPhantomInsertSql('heritage_properties', cols)).toThrowError(/not_a_real_column/);
      });
    });

    describe('buildRestoreDeleteSql — B2: delete by source_id, never `id`; no NaN params', () => {
      const KEY = 'source_id';
      for (const table of TABLES) {
        it(`${table}: deletes D-arm rows by ${KEY} = ANY($1::bigint[])`, () => {
          const dKeysPresent = [5862140, 5862141];
          const { text, params } = buildRestoreDeleteSql(table, dKeysPresent);
          // B2: the restore must address the cohort key, never the serial `id` of a row that a
          // `SELECT PROJ-minus-geom` before-image does not even carry.
          expect(text).toContain(`${KEY} = ANY($1::bigint[])`);
          expect(text).not.toMatch(/\bid\b/);
          expect(text).not.toContain('NaN');
          expect(params).toEqual([dKeysPresent]);
          for (const p of params as number[][]) {
            for (const v of p) expect(Number.isNaN(v), `${table}: param ${String(v)} is not NaN`).toBe(false);
          }
        });
      }
    });
  });

  // hf3 (grounder, executed): `--step=scripts/load-heritage.js` is HARD-CODED and in this
  // worktree that file is the CONVERTED shim (`module.exports = pipeline.step(...)`), so a
  // `--side=pre` run would record CONVERTED output as the legacy golden — the differential
  // would be void while reading green. The gate is `--legacy-ref=<ref>`: PRE reads the legacy
  // blob out of git and refuses unless the WORKING file is (a) not a converted shim and
  // (b) byte-equal to it (CRLF-normalised, so a Windows checkout is not a false refusal).
  // This describe is the RED lock for the pure gate signals + the argv refusals.
  describe('hf3 — PRE/POST gate signals and abort/mode refusals (pure)', () => {
    describe('isConvertedShim — the ONE converted-shape witness', () => {
      it('is TRUE for the converted shim (contains `pipeline.step(`)', () => {
        const shim = "'use strict';\nconst pipeline = require('./lib/pipeline');\nmodule.exports = pipeline.step(descriptor, compute);\n";
        expect(isConvertedShim(shim)).toBe(true);
      });

      it('is FALSE for a legacy step (no `pipeline.step(` anywhere)', () => {
        const legacy = "'use strict';\nconst { Pool } = require('pg');\nasync function main() { /* 808 legacy lines */ }\nmain();\n";
        expect(isConvertedShim(legacy)).toBe(false);
      });

      it('is FALSE for the EMPTY string (no false positive on an unread file)', () => {
        expect(isConvertedShim('')).toBe(false);
      });
    });

    describe('sameSource — CRLF-normalised equality', () => {
      it('is TRUE for byte-identical text', () => {
        expect(sameSource('a\nb\n', 'a\nb\n')).toBe(true);
      });

      it('is TRUE when only the line endings differ (LF vs CRLF — a Windows checkout)', () => {
        expect(sameSource('a\r\nb\r\n', 'a\nb\n')).toBe(true);
        expect(sameSource('a\nb\n', 'a\r\nb\r\n')).toBe(true);
      });

      it('is FALSE when a single content character differs', () => {
        expect(sameSource('a\nb\n', 'a\nc\n')).toBe(false);
      });

      it('is FALSE when a line is added or removed', () => {
        expect(sameSource('a\nb\n', 'a\nb\nc\n')).toBe(false);
      });
    });

    describe('abortIfInterrupted — throws only once the signal flag is set', () => {
      it('does not throw on the clean state', () => {
        expect(() => abortIfInterrupted({ interrupted: false })).not.toThrow();
      });

      it('throws (naming the interruption) once the flag is set', () => {
        expect(() => abortIfInterrupted({ interrupted: true })).toThrowError(/interrupt/i);
      });
    });

    describe('parseArgs — mode-count and PRE-gate refusals', () => {
      it('refuses multi-mode argv (`--derive --run` throws)', () => {
        expect(() => parseArgs(['--derive', '--run'])).toThrow();
      });

      it('accepts a single mode', () => {
        expect(parseArgs(['--derive']).derive).toBe(true);
        expect(parseArgs(['--run']).run).toBe(true);
      });

      it('refuses `--side=pre` without `--legacy-ref`', () => {
        expect(() => parseArgs(['--run', '--side=pre'])).toThrowError(/legacy-ref/i);
      });

      it('accepts `--side=pre` WITH `--legacy-ref=<ref>` and records it', () => {
        const args = parseArgs(['--run', '--side=pre', '--legacy-ref=451962ac']);
        expect(args.side).toBe('pre');
        expect(args.legacyRef).toBe('451962ac');
      });

      it('does NOT require `--legacy-ref` for `--side=post` (the converted shim is the premise)', () => {
        const args = parseArgs(['--run', '--side=post']);
        expect(args.side).toBe('post');
        expect(args.legacyRef).toBeNull();
      });
    });
  });
});
