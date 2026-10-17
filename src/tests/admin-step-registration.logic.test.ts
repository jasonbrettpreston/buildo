// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DL
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

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PIPELINE_REGISTRY } from '@/components/FreshnessTimeline';
import { STEP_DESCRIPTIONS, PIPELINE_TABLE_MAP } from '@/lib/admin/funnel';

const REPO_ROOT = path.resolve(__dirname, '../../');
const ASSERT_AUDIT_TABLE = 'pipeline_runs';

type ManifestEntry = { file?: string; telemetry_tables?: string[] };
type Descriptor = {
  identity: { archetype: string };
  outputs: 'none' | { writes?: Array<{ table: string }> };
};
type Registered = {
  registry: Record<string, unknown>;
  descriptions: Record<string, unknown>;
  tableMap: Record<string, string>;
  scripts: Record<string, ManifestEntry>;
};
type Step = { slug: string; descriptor: Descriptor };

const readJson = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')) as T;

/** Every converted and pending step with its descriptor — the expected set, derived. */
function convertedAndPendingSteps(scripts: Record<string, ManifestEntry>): Step[] {
  const converted = readJson<{ converted: string[]; pending: Array<{ file: string }> }>(
    'scripts/steps/_schema/converted.json',
  );
  const files = [...converted.converted, ...converted.pending.map((p) => p.file)];
  return files.map((file) => {
    const slug = Object.entries(scripts).find(([, e]) => e.file === file)?.[0];
    if (!slug) throw new Error(`no manifest.scripts entry points at ${file}`);
    const descriptor = readJson<Descriptor>(file.replace(/\.(js|py)$/, '') + '.descriptor.json');
    return { slug, descriptor };
  });
}

function declaredWriteTables(d: Descriptor): string[] {
  return d.outputs === 'none' ? [] : [...new Set((d.outputs.writes || []).map((w) => w.table))];
}

/** The R-DL violations for a set of steps, each `<slug>: <datum>` (pure). */
function adminRegistrationViolations(steps: Step[], reg: Registered): string[] {
  const out: string[] = [];
  for (const { slug, descriptor } of steps) {
    const writes = declaredWriteTables(descriptor);
    if (!(slug in reg.registry)) out.push(`${slug}: PIPELINE_REGISTRY`);
    if (!(slug in reg.descriptions)) out.push(`${slug}: STEP_DESCRIPTIONS`);
    const mapped = reg.tableMap[slug];
    const allowed = writes.length === 0 && descriptor.identity.archetype === 'ASSERT' ? [ASSERT_AUDIT_TABLE] : writes;
    if (mapped === undefined) out.push(`${slug}: PIPELINE_TABLE_MAP (expected one of ${allowed.join(', ')})`);
    else if (!allowed.includes(mapped)) out.push(`${slug}: PIPELINE_TABLE_MAP "${mapped}" is not a declared write table (${allowed.join(', ')})`);
    const telemetry = new Set(reg.scripts[slug]?.telemetry_tables || []);
    for (const t of writes) if (!telemetry.has(t)) out.push(`${slug}: telemetry_tables missing ${t}`);
  }
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
  const steps = convertedAndPendingSteps(scripts);

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
});
