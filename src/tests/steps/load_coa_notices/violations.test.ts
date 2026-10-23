// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §12 (sequencing), §10, §11
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (converted from day one)
//
// `load_coa_notices` — the RED SUITE for the claims that land AFTER commit A. Commit A landed the table,
// the pure library, the compute, the offline manifest tool and their own (green) tests. Every claim below
// pins an artifact a LATER step produces, so each is `it.fails` and its body's FIRST statement goes
// through `artifact()`: it fails as a NAMED MISSING ARTIFACT, never as an import error. The step that
// lands the artifact flips its `it.fails` to `it(` in the same commit (C-1..C-11 flipped at commit B):
//   · commit B (H lane, with the fleet recapture): C-1 … C-11
//   · §12 step 3 (the first pin): C-12
//   · §12 step 5 (the precision / link samples): C-13, C-14
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const abs = (rel: string) => path.join(REPO_ROOT, rel);

const DESCRIPTOR_REL = 'scripts/load-coa-notices.descriptor.json';
const NOTES_REL = 'scripts/load-coa-notices.notes.json';
const SHELL_REL = 'scripts/load-coa-notices.js';
const COMPUTE_REL = 'scripts/lib/compute/load-coa-notices.js';
const MANIFEST_REL = 'scripts/seeds/coa-notices/manifest-toronto-2017.json';

/** The first statement of every claim: a named missing artifact, never an import error. */
function artifact(rel: string, why = ''): string {
  expect(fs.existsSync(abs(rel)), `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''}`).toBe(true);
  return abs(rel);
}

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(artifact(rel), 'utf8')) as T;
}

interface Descriptor {
  identity: { name: string; lock: number; archetype: string };
  inputs: { reads: { externals: Array<{ id: string; format?: string; manifest?: string }> } };
  outputs: { writes: Array<{ table: string; key: string; retract?: string; columns: Array<{ name: string; written: string }>; write_discipline: { class: string } }> };
  checks: Array<{ id: string; when: string }>;
  emits: Array<{ key: string }>;
  config: { logic_variables: Array<{ name: string }> };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS compute (exists since commit A)
const COMPUTE = require(abs(COMPUTE_REL)) as { checks: Record<string, unknown>; ROW_COLUMNS: string[]; buildLoadMeta: (ctx: unknown) => Record<string, unknown> };

describe('load_coa_notices — commit B claims (flip at commit B)', () => {
  it('C-1 the descriptor validates against step.schema.json', () => {
    artifact(DESCRIPTOR_REL, 'commit B');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS validator
    const { validateDescriptor } = require(abs('scripts/lib/step/validate.js')) as { validateDescriptor: (d: unknown) => unknown };
    expect(() => validateDescriptor(readJson(DESCRIPTOR_REL))).not.toThrow();
  });

  it('C-2 the frozen shell declares lock 129 and it equals descriptor.identity.lock', () => {
    const text = fs.readFileSync(artifact(SHELL_REL, 'commit B'), 'utf8');
    expect(text).toMatch(/const ADVISORY_LOCK_ID = 129;/);
    expect(readJson<Descriptor>(DESCRIPTOR_REL).identity.lock).toBe(129);
  });

  it('C-3 the notes file exists', () => {
    artifact(NOTES_REL, 'commit B');
  });

  it('C-4 step.schema.json admits format "pdf_document_set" and acquire.js names it in its else-throw', () => {
    const schema = fs.readFileSync(artifact('scripts/steps/_schema/step.schema.json'), 'utf8');
    expect(schema).toContain('"pdf_document_set"');
    expect(fs.readFileSync(abs('scripts/lib/step/acquire.js'), 'utf8')).toMatch(/"ckan_datastore", "xlsx" or "pdf_document_set"|pdf_document_set/);
  });

  it('C-5 manifest.json declares the standalone chain coa_notices = [load_coa_notices]', () => {
    artifact(DESCRIPTOR_REL, 'commit B');
    const m = readJson<{ chains: Record<string, string[]> }>('scripts/manifest.json');
    expect(m.chains.coa_notices).toEqual(['load_coa_notices']);
    expect(m.chains.coa).not.toContain('load_coa_notices');
  });

  it('C-6 every logic variable the descriptor declares is seeded', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const seeds = fs.readFileSync(abs('scripts/seeds/logic_variables.json'), 'utf8');
    for (const v of d.config.logic_variables) expect(seeds, v.name).toContain(`"${v.name}"`);
  });

  it('C-7 the declared check ids are the compute dispatch table, in order', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.checks.map((c) => c.id)).toEqual(Object.keys(COMPUTE.checks));
  });

  it('C-8 the declared write columns are ROW_COLUMNS + retired_at (insert_only) + loaded_at (db_default)', () => {
    const w = readJson<Descriptor>(DESCRIPTOR_REL).outputs.writes[0]!;
    expect(w.table).toBe('coa_notice_variances');
    expect(w.key).toBe('variance_key');
    expect(w.retract).toBe('departed_mark');
    expect(w.write_discipline.class).toBe('guarded_upsert');
    const step = w.columns.filter((c) => c.written === 'step').map((c) => c.name).sort();
    expect(step).toEqual([...COMPUTE.ROW_COLUMNS].sort());
    expect(w.columns.find((c) => c.name === 'retired_at')?.written).toBe('insert_only');
    expect(w.columns.find((c) => c.name === 'loaded_at')?.written).toBe('db_default');
  });

  it('C-9 the one emit block coa_notices_load carries exactly the keys of buildLoadMeta', () => {
    const d = readJson<Descriptor & { emits: Array<{ key: string; skeleton: Record<string, unknown> }> }>(DESCRIPTOR_REL);
    // Spec 129 §2c: the derived plan-facts target's own int count rides beside the one object block (gate G #38 count_path).
    expect(d.emits.map((e) => e.key)).toEqual(['coa_notices_load', 'coa_plan_facts_written']);
    const keys = Object.keys(COMPUTE.buildLoadMeta({ acquired: {}, written: {} })).sort();
    expect(Object.keys(d.emits[0]!.skeleton).sort()).toEqual(keys);
  });

  it('C-10 the primary external is a pdf_document_set reading the pinned manifest', () => {
    const ext = readJson<Descriptor>(DESCRIPTOR_REL).inputs.reads.externals[0]!;
    expect(ext.format).toBe('pdf_document_set');
    expect(ext.manifest).toBe(MANIFEST_REL);
  });

  it('C-11 Spec 47 §A.5 registers lock 129 to scripts/load-coa-notices.js', () => {
    artifact(SHELL_REL, 'commit B');
    expect(fs.readFileSync(abs('docs/specs/01-pipeline/47_pipeline_script_protocol.md'), 'utf8')).toMatch(/\|\s*\*\*129\*\*\s*\|\s*`scripts\/load-coa-notices\.js`/);
  });
});

describe('load_coa_notices — after commit B (flip at the named §12 step)', () => {
  it('C-12 the pinned 2017 manifest is committed (§12 step 3)', () => {
    artifact(MANIFEST_REL, 'the first pin — H lane');
  });

  it('C-13 the precision sample for the current extractor version is committed (§12 step 5)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS compute
    const { EXTRACTOR_VERSION } = require(abs(COMPUTE_REL)) as { EXTRACTOR_VERSION: string };
    artifact(`scripts/seeds/coa-notices/precision-sample-${EXTRACTOR_VERSION}.json`, 'precision sample');
  });

  it('C-14 the link-precision sample for the current extractor version is committed (§12 step 5)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS compute
    const { EXTRACTOR_VERSION } = require(abs(COMPUTE_REL)) as { EXTRACTOR_VERSION: string };
    artifact(`scripts/seeds/coa-notices/link-precision-${EXTRACTOR_VERSION}.json`, 'link-precision sample');
  });
});
