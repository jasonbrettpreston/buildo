// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DL, R-DV, R-DW
//
// R-DL (McDonald's Airtight V3, operator y 2026-10-17: "when we are adding new steps we
// need to be aware of the admin as well — this is how we verify the output"). Every
// converted or pending step is verifiable in the admin data-quality surface
// (/admin/data-quality → DataQualityDashboard → FreshnessTimeline), and the expected
// registration is DERIVED from each step's own descriptor — never a hand list, no
// grandfathering. A missing entry fails naming the slug and the datum:
//   - PIPELINE_REGISTRY (row label) and STEP_DESCRIPTIONS (drill-down text);
//   - PIPELINE_TABLE_MAP (the "All Time" yield tiles) names one of the step's declared
//     outputs.writes tables; an ASSERT with `outputs: "none"` maps to pipeline_runs, its
//     audit home (the assert_schema / assert_data_bounds form);
//   - manifest telemetry_tables (the "Inspect output" links) contains every declared
//     write table.
// Expected-range badges are not hand-required here (operator 2026-10-17: derived from
// the declared check bounds instead).
//
// R-DW (amends R-DL; McDonald's Airtight V3, operator y 2026-10-18; R-DF EXTERNALIZED): a badge that
// shows a step's bound reads that step's own variable, never a hand-written number.
//   - A converted step, or a pending step whose descriptor exists, carries NO STEP_EXPECTED_RANGES
//     entry: its badge is its audit_table check row (status = verdict, bound = the value the runner
//     resolved from checks[].limit_from_config / warn_limit_from_config), and every such variable is
//     a registered seed key. A hand-written range for it fails naming the slug.
//   - The remaining entries are a closed grandfather list of UNCONVERTED steps (R-DF SCALABLE),
//     shrinking as each converts; a new entry fails.
//   - getRangeStatus's borderline margin is the admin_range_badge_borderline_margin_ratio logic
//     variable (seeded at the former 0.2 by migration 266), passed in — no literal in its body.
//
// R-DV (the R-DL red_suite carve-out, operator y 2026-10-18; amends R-DL, applies R-DU's
// reason): a pending entry whose descriptor FILE is absent (an early ①, stage red_suite —
// R-K.1 forbids the descriptor there) has nothing a descriptor-derived check reads. It is
// still in the expected set and still needs its slug-keyed arms (PIPELINE_REGISTRY,
// STEP_DESCRIPTIONS); only the descriptor-derived arms (PIPELINE_TABLE_MAP, telemetry_tables)
// wait for ②. Keyed on the file, never the stage label, so the carve-out ends when the
// descriptor lands. A converted step with no descriptor still fails (ENOENT), never skipped.

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { spawnSync } from 'node:child_process';
import path from 'path';
import { PIPELINE_REGISTRY } from '@/components/FreshnessTimeline';
import { STEP_DESCRIPTIONS, PIPELINE_TABLE_MAP, STEP_EXPECTED_RANGES, RANGE_BADGE_MARGIN_VARIABLE, getRangeStatus } from '@/lib/admin/funnel';
import * as gate from '../../scripts/analysis/gates/admin-registration.mjs';
import { rowBlocks } from '../../scripts/analysis/step-validate.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../');
const ASSERT_AUDIT_TABLE = gate.ASSERT_AUDIT_TABLE;

type ManifestEntry = { file?: string; telemetry_tables?: string[] };
type Check = { id: string; limit_from_config?: string; warn_limit_from_config?: string };
type Descriptor = {
  identity: { archetype: string };
  outputs: 'none' | { writes?: Array<{ table: string }> };
  checks?: Check[];
};
type Registered = {
  registry: Record<string, unknown>;
  descriptions: Record<string, unknown>;
  tableMap: Record<string, string>;
  scripts: Record<string, ManifestEntry>;
};
/** descriptor null = a pending entry whose descriptor file is absent (R-DV / R-DU). */
type Step = { slug: string; descriptor: Descriptor | null };

const readJson = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')) as T;

// ONE definition (operator y 2026-10-18): the pure functions live in the #51 gate module, which
// step-validate runs at pre-commit (--staged --fast) and pre-push (--all --fast); this lock imports them.
const convertedAndPendingSteps = gate.convertedAndPendingSteps as (
  scripts: Record<string, ManifestEntry>,
  converted: { converted: string[]; pending: Array<{ file: string }> },
  exists: (rel: string) => boolean,
  read: (rel: string) => Descriptor,
) => Step[];
const adminRegistrationViolations = gate.adminRegistrationViolations as (steps: Step[], reg: Registered) => string[];

/**
 * R-DW — the UNCONVERTED steps whose hand-written STEP_EXPECTED_RANGES entries remain (closed,
 * shrink-only). A step leaves this list in the commit that gives it a descriptor.
 */
const UNCONVERTED_RANGE_GRANDFATHER = Object.freeze([
  'permits', 'builders', 'link_coa', 'enrich_wsib_builders', 'enrich_named_builders',
  'enrich_wsib_registry', 'link_similar', 'create_pre_permits', 'classify_scope', 'classify_permits',
  'inspections',
]);

/**
 * The R-DW badge violations: the gate's descriptor-bearing arms (a hand-written range, an
 * unregistered check-bound variable) plus the suite-only arm — a range entry outside the closed
 * grandfather list (not a converted/pending slug, so no step-validate row can carry it).
 */
function rangeBadgeViolations(steps: Step[], rangeKeys: string[], seedKeys: Set<string>, grandfather: readonly string[]): string[] {
  const out = (gate.rangeBadgeViolations as (s: Step[], r: string[], k: Set<string>) => string[])(steps, rangeKeys, seedKeys);
  const allowed = new Set(grandfather);
  for (const k of rangeKeys) if (!allowed.has(k)) out.push(`${k}: STEP_EXPECTED_RANGES entry outside the closed unconverted grandfather list`);
  return out;
}

describe('R-DL — every converted or pending step is admin-verifiable (derived from its descriptor)', () => {
  const scripts = readJson<{ scripts: Record<string, ManifestEntry> }>('scripts/manifest.json').scripts;
  const live: Registered = {
    registry: PIPELINE_REGISTRY,
    descriptions: STEP_DESCRIPTIONS,
    tableMap: PIPELINE_TABLE_MAP,
    scripts,
  };
  const convertedJson = readJson<{ converted: string[]; pending: Array<{ file: string }> }>('scripts/steps/_schema/converted.json');
  const steps = convertedAndPendingSteps(
    scripts, convertedJson, (rel) => fs.existsSync(path.join(REPO_ROOT, rel)), (rel) => readJson<Descriptor>(rel),
  );

  it('derives the expected set from converted.json (converted + pending), not a hand list', () => {
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.map((s) => s.slug)).toContain('load_coa_notices');
  });

  it('every converted or pending step is registered, maps a declared write table, and exposes every write table', () => {
    expect(adminRegistrationViolations(steps, live)).toEqual([]);
  });

  it('RED direction — each datum fails by name when missing or wrong', () => {
    const writer: Step = { slug: 'x_writer', descriptor: { identity: { archetype: 'INGESTOR' }, outputs: { writes: [{ table: 't1' }, { table: 't2' }] } } };
    const assertStep: Step = { slug: 'x_assert', descriptor: { identity: { archetype: 'ASSERT' }, outputs: 'none' } };
    const empty: Registered = { registry: {}, descriptions: {}, tableMap: {}, scripts: {} };
    expect(adminRegistrationViolations([writer], empty)).toEqual([
      'x_writer: PIPELINE_REGISTRY',
      'x_writer: STEP_DESCRIPTIONS',
      'x_writer: PIPELINE_TABLE_MAP (expected one of t1, t2)',
      'x_writer: telemetry_tables missing t1',
      'x_writer: telemetry_tables missing t2',
    ]);
    const wrongMap: Registered = {
      registry: { x_writer: {}, x_assert: {} },
      descriptions: { x_writer: {}, x_assert: {} },
      tableMap: { x_writer: 'not_written', x_assert: ASSERT_AUDIT_TABLE },
      scripts: { x_writer: { telemetry_tables: ['t1', 't2'] } },
    };
    expect(adminRegistrationViolations([writer, assertStep], wrongMap)).toEqual([
      'x_writer: PIPELINE_TABLE_MAP "not_written" is not a declared write table (t1, t2)',
    ]);
  });

  it('R-DV — a pending entry with no descriptor file keeps only its slug-keyed arms; with a descriptor it is fully checked', () => {
    const fixtureScripts: Record<string, ManifestEntry> = {
      x_red: { file: 'scripts/x-red.js' },
      x_desc: { file: 'scripts/x-desc.js' },
      x_conv: { file: 'scripts/x-conv.js' },
    };
    const fixtureConverted = { converted: ['scripts/x-conv.js'], pending: [{ file: 'scripts/x-red.js' }, { file: 'scripts/x-desc.js' }] };
    const writer: Descriptor = { identity: { archetype: 'INGESTOR' }, outputs: { writes: [{ table: 't1' }] } };
    const onDisk = new Set(['scripts/x-desc.descriptor.json', 'scripts/x-conv.descriptor.json']);
    const fixtureSteps = convertedAndPendingSteps(fixtureScripts, fixtureConverted, (rel) => onDisk.has(rel), () => writer);
    expect(fixtureSteps).toEqual([
      { slug: 'x_conv', descriptor: writer },
      { slug: 'x_red', descriptor: null },
      { slug: 'x_desc', descriptor: writer },
    ]);
    // GREEN: the red_suite entry has its registry row and description; the others are complete.
    const complete: Registered = {
      registry: { x_red: {}, x_desc: {}, x_conv: {} },
      descriptions: { x_red: {}, x_desc: {}, x_conv: {} },
      tableMap: { x_desc: 't1', x_conv: 't1' },
      scripts: { x_desc: { telemetry_tables: ['t1'] }, x_conv: { telemetry_tables: ['t1'] } },
    };
    expect(adminRegistrationViolations(fixtureSteps, complete)).toEqual([]);
    // RED: the red_suite entry without its slug-keyed arms; the pending-with-descriptor entry
    // still owes its descriptor-derived arms.
    const missing: Registered = {
      registry: { x_desc: {}, x_conv: {} },
      descriptions: { x_desc: {}, x_conv: {} },
      tableMap: { x_conv: 't1' },
      scripts: { x_conv: { telemetry_tables: ['t1'] } },
    };
    expect(adminRegistrationViolations(fixtureSteps, missing)).toEqual([
      'x_red: PIPELINE_REGISTRY',
      'x_red: STEP_DESCRIPTIONS',
      'x_desc: PIPELINE_TABLE_MAP (expected one of t1)',
      'x_desc: telemetry_tables missing t1',
    ]);
    // A converted entry with no descriptor file is never carved out: it still reads (and throws).
    expect(() => convertedAndPendingSteps(fixtureScripts, fixtureConverted, () => false, (rel) => { throw new Error(`ENOENT ${rel}`); }))
      .toThrow('ENOENT scripts/x-conv.descriptor.json');
  });
});

describe("R-DW — admin range badges derive from each step's own declared bounds, never hand-written", () => {
  const scripts = readJson<{ scripts: Record<string, ManifestEntry> }>('scripts/manifest.json').scripts;
  const convertedJson = readJson<{ converted: string[]; pending: Array<{ file: string }> }>('scripts/steps/_schema/converted.json');
  const steps = convertedAndPendingSteps(
    scripts, convertedJson, (rel) => fs.existsSync(path.join(REPO_ROOT, rel)), (rel) => readJson<Descriptor>(rel),
  );
  const seed = readJson<Record<string, { default: unknown }>>('scripts/seeds/logic_variables.json');
  const seedKeys = new Set(Object.keys(seed));

  it('live — no converted step carries a hand-written range; every badge bound reads a registered variable; the remainder is the grandfather list', () => {
    expect(rangeBadgeViolations(steps, Object.keys(STEP_EXPECTED_RANGES), seedKeys, UNCONVERTED_RANGE_GRANDFATHER)).toEqual([]);
  });

  it('RED — a hand-written bound fails; GREEN — the same step deriving from its declared check passes', () => {
    const converted: Step = { slug: 'x_conv', descriptor: { identity: { archetype: 'LINK' }, outputs: 'none', checks: [{ id: 'link_rate', limit_from_config: 'x_conv_link_rate_warn_pct' }] } };
    const keys = new Set(['x_conv_link_rate_warn_pct']);
    // hand-written: a range entry for the converted step
    expect(rangeBadgeViolations([converted], ['x_conv'], keys, ['x_conv'])).toEqual([
      'x_conv: STEP_EXPECTED_RANGES hand-written bound — its badge is its audit_table check row (checks[].limit_from_config)',
    ]);
    // derived: no entry, and the check bound names a registered variable
    expect(rangeBadgeViolations([converted], [], keys, [])).toEqual([]);
    // a bound that names an unregistered variable is not derived
    expect(rangeBadgeViolations([converted], [], new Set(), [])).toEqual([
      'x_conv: check link_rate badge bound reads x_conv_link_rate_warn_pct, not a registered logic variable',
    ]);
    // R-DV: a pending step with no descriptor keeps its range until ②; a new unlisted entry fails
    const red: Step = { slug: 'x_red', descriptor: null };
    expect(rangeBadgeViolations([red], ['x_red'], keys, ['x_red'])).toEqual([]);
    expect(rangeBadgeViolations([red], ['x_red', 'x_new'], keys, ['x_red'])).toEqual([
      'x_new: STEP_EXPECTED_RANGES entry outside the closed unconverted grandfather list',
    ]);
  });

  it('the margin is a registered logic variable, seeded by migration at the former 0.2, read through the parameter', () => {
    const entry = seed[RANGE_BADGE_MARGIN_VARIABLE] as { default: number; min: number; max: number; admin: { group?: string } };
    expect(entry.default).toBe(0.2);
    const migrations = fs.readdirSync(path.join(REPO_ROOT, 'migrations')).filter((f) => f.endsWith('.sql'));
    const seeding = migrations.filter((f) => new RegExp(`\\('${RANGE_BADGE_MARGIN_VARIABLE}',\\s*${entry.default}\\b`).test(fs.readFileSync(path.join(REPO_ROOT, 'migrations', f), 'utf8')));
    expect(seeding, 'a migration seeds the variable at its seed default').toHaveLength(1);
    // getRangeStatus holds no numeric literal: the margin arrives as its parameter.
    const funnelSrc = fs.readFileSync(path.join(REPO_ROOT, 'src/lib/admin/funnel.ts'), 'utf8');
    const start = funnelSrc.indexOf('export function getRangeStatus(');
    const body = funnelSrc.slice(start, funnelSrc.indexOf('\n}\n', start));
    expect(body.match(/\b\d+(\.\d+)?\b/g), 'getRangeStatus body literals').toBeNull();
    expect(getRangeStatus(170, [50, 150], entry.default)).toBe('borderline');
    expect(getRangeStatus(170, [50, 150], entry.default / 2)).toBe('anomaly');
    // the route resolves it from logic_variables (the seeded default is the only fallback)
    const route = fs.readFileSync(path.join(REPO_ROOT, 'src/app/api/quality/route.ts'), 'utf8');
    expect(route).toMatch(/LOGIC_VAR_DEFAULTS\[RANGE_BADGE_MARGIN_VARIABLE\]/);
  });
});

describe('fast invariant #51 ADMIN-REGISTRATION — the R-DL lock at pre-commit (step-validate --staged/--all --fast)', () => {
  const live = gate.loadAdminRegistration(REPO_ROOT) as {
    steps: Step[]; reg: Registered; rangeKeys: string[]; seedKeys: Set<string>;
  };

  it('the file-only source parsers read exactly the live TypeScript maps (no drift between #51 and the modules)', () => {
    expect(Object.keys(live.reg.registry).sort()).toEqual(Object.keys(PIPELINE_REGISTRY).sort());
    expect(Object.keys(live.reg.descriptions).sort()).toEqual(Object.keys(STEP_DESCRIPTIONS).sort());
    expect(live.reg.tableMap).toEqual(PIPELINE_TABLE_MAP);
    expect([...live.rangeKeys].sort()).toEqual(Object.keys(STEP_EXPECTED_RANGES).sort());
  });

  it('GREEN on the live tree; the step set is the suite\'s own derived set', () => {
    const r = gate.checkAdminRegistration(live);
    expect(r.pass, r.detail).toBe(true);
    expect(r.blockedSlugs).toEqual([]);
    expect(live.steps.map((s) => s.slug).sort()).toEqual(
      convertedAndPendingSteps(
        readJson<{ scripts: Record<string, ManifestEntry> }>('scripts/manifest.json').scripts,
        readJson<{ converted: string[]; pending: Array<{ file: string }> }>('scripts/steps/_schema/converted.json'),
        (rel) => fs.existsSync(path.join(REPO_ROOT, rel)),
        (rel) => readJson<Descriptor>(rel),
      ).map((s) => s.slug).sort(),
    );
  });

  it('RED — a converted step missing its admin registration, or carrying a hand-written range, blocks by slug', () => {
    const conv = live.steps.find((s) => s.descriptor !== null)!;
    const registry = { ...live.reg.registry };
    delete registry[conv.slug];
    const missing = gate.checkAdminRegistration({ ...live, reg: { ...live.reg, registry } });
    expect(missing.pass).toBe(false);
    expect(missing.blockedSlugs).toEqual([conv.slug]);
    expect(missing.detail).toContain(`${conv.slug}: PIPELINE_REGISTRY`);
    const ranged = gate.checkAdminRegistration({ ...live, rangeKeys: [...live.rangeKeys, conv.slug] });
    expect(ranged.blockedSlugs).toEqual([conv.slug]);
    expect(ranged.detail).toContain(`${conv.slug}: STEP_EXPECTED_RANGES hand-written bound`);
  });

  it('R-DV + R-DU — a pending row with no descriptor is checked on its slug arms only, and never gates', () => {
    const red = live.steps.find((s) => s.descriptor === null);
    expect(red, 'a pending red_suite entry exists to exercise the carve-out').toBeDefined();
    // R-DV: its range entry and missing table-map entry are not violations; its registry row still is.
    expect(live.rangeKeys).toContain(red!.slug);
    const descriptions = { ...live.reg.descriptions };
    delete descriptions[red!.slug];
    const r = gate.checkAdminRegistration({ ...live, reg: { ...live.reg, descriptions } });
    expect(r.blockedSlugs).toEqual([red!.slug]);
    // R-DU: the row it names never blocks (rowBlocks keys on the absent descriptor file), so
    // step-validate prints the #51 FAIL as informational; the descriptor-bearing row blocks.
    const scripts = readJson<{ scripts: Record<string, ManifestEntry> }>('scripts/manifest.json').scripts;
    const exists = (rel: string) => fs.existsSync(path.join(REPO_ROOT, rel));
    expect(rowBlocks({ slug: red!.slug, relFile: scripts[red!.slug]!.file!, stage: 'pending' }, { exists })).toBe(false);
    const conv = live.steps.find((s) => s.descriptor !== null)!;
    expect(rowBlocks({ slug: conv.slug, relFile: scripts[conv.slug]!.file!, stage: 'converted' }, { exists })).toBe(true);
  });

  it('wired: step-validate prints #51 as a registry fast invariant, PASS on the live tree, and self-tests the gate', () => {
    const sv = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
    expect(sv).toMatch(/const admin51 = checkAdminRegistration\(loadAdminRegistration\(REPO_ROOT\)\);\s*results\.push\(\{\s*id: 51,/);
    expect(sv).toContain('adminRegistrationSelfTest();');
    expect(gate.selfTest()).toBe('admin-registration self-test PASSED');
    const run = spawnSync('node', ['scripts/analysis/step-validate.mjs', `--step=${live.steps.find((s) => s.descriptor !== null)!.slug}`, '--fast'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000 });
    expect(run.stdout).toMatch(/\| 51 \| \(registry\) \| PASS \| ADMIN-REGISTRATION \(R-DL\/R-DW\)/);
  }, 150_000);
});
