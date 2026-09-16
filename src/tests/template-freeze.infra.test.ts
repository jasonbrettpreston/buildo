// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8.2, §10.3
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §9, Rule 11 (GAP G-3)
//
// WF2 "Step Template Freeze" (2026-09-04). §8.2's prose promise ("freeze the
// template after the eighth, never the first") had no artifact and no gate —
// a schema field could be widened, a phase runner's call order reshuffled, or
// a new archetype dispatch path added with zero red anywhere (G1/G2/G9/G12,
// the plan's own grounding table). This suite is the both-directions lock:
//
//   C3 — scripts/steps/_schema/template-freeze.json is AJV-valid and every
//        field was DERIVED from the live tree, never hand-transcribed
//        (regeneration reproduces it byte-identically).
//   C4 — the R-E lock: the schema's live hash must equal the frozen
//        schema_sha256 UNLESS this commit deliberately re-froze it (a
//        template-freeze.json bump to match the new hash) AND carries a real
//        Spec 122 §8 text change in the SAME commit — the `f5446fa3`
//        "same-commit spec amendment missed 4x" lesson (Spec 124 §R-8).
//   C5 — GAP G-3 (Spec 124 Rule 11): each phase runner's frozen `phase_order`
//        (a mechanically-extracted, ordered, deduplicated sequence of
//        staleness.*/write.*/acquire.*/pipeline.*/preWriteGate library calls)
//        still matches the runner's live source — RED on a fixture that
//        reorders two calls, GREEN on the 7 real runners.
//
// Every checker lives in scripts/steps/_schema/generate-template-freeze.mjs
// (pure functions, unit-tested here with fixtures — Spec 121 §12b.6: "an
// untested checker proves nothing") and is ALSO wired into that generator's
// own `--check` (shelled by src/tests/step-conformance.infra.test.ts's
// R-R-style "generated-artifact --check" pattern, hook-wired via
// .husky/pre-commit).

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import Ajv from 'ajv';

const REPO_ROOT = path.resolve(__dirname, '../../');
const SCHEMA_DIR = path.join(REPO_ROOT, 'scripts/steps/_schema');
const ARTIFACT_PATH = path.join(SCHEMA_DIR, 'template-freeze.json');
const SCHEMA_PATH = path.join(SCHEMA_DIR, 'template-freeze.schema.json');
const STEP_SCHEMA_PATH = path.join(SCHEMA_DIR, 'step.schema.json');
const GENERATOR = path.join(SCHEMA_DIR, 'generate-template-freeze.mjs');
const INDEX_JS_PATH = path.join(REPO_ROOT, 'scripts/lib/step/index.js');
const GOOD_RUNNER_FIXTURE = path.join(SCHEMA_DIR, 'fixtures/freeze/good-runner-order.js');
const BAD_RUNNER_FIXTURE = path.join(SCHEMA_DIR, 'fixtures/freeze/bad-runner-reordered.js');

interface ArchetypeProfile {
  archetype: string;
  shapes: string[];
  runners: string[];
  first_step: string | null;
  proven: boolean;
}
interface PhaseRunner {
  shape: string;
  runner: string;
  phase_order: string[];
}
interface TemplateFreeze {
  contract_version: number;
  frozen_at: string;
  frozen_after_pilot: number;
  schema_sha256: string;
  categories: string[];
  archetype_profiles: ArchetypeProfile[];
  phase_runners: PhaseRunner[];
  lg21_decision: { ruling: string; reasons: string[]; superseded_items: string[] };
  batching_prereq_snapshot: Array<{ id: string; status: string; owner: string }>;
  does_not_freeze: string[];
}

const ARTIFACT: TemplateFreeze = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

async function loadGenerator() {
  return (await import(pathToFileURL(GENERATOR).href)) as {
    deriveArtifact?: unknown;
    assembleArtifact: (frozenAt: string, frozenTier: unknown, liveTier: unknown) => TemplateFreeze;
    extractSection: (markdown: string, headingPattern: RegExp) => string;
    checkFrozenSchemaConsistency: (args: {
      oldFrozenSchemaSha256: string | null;
      newFrozenSchemaSha256: string | null;
      liveSchemaSha256: string;
      section8Changed: boolean;
    }) => { ok: boolean; reason: string };
    checkFreezeDeclarationHonesty: (args: {
      freezeItemStatus: string;
      otherOpenBatchingIds: string[];
      snapshotIds: string[];
      archetypeProfiles: ArchetypeProfile[];
    }) => { ok: boolean; reason: string };
    runnerRanges: (source: string) => { lines: string[]; ranges: Record<string, { start: number; end: number }> };
    extractPhaseOrder: (lines: string[], range: { start: number; end: number }) => string[];
    gitShowFile: (ref: string, relPath: string) => string | null;
  };
}

// ---------------------------------------------------------------------------
// C3 — declared data: AJV-valid, and regeneration reproduces it byte-identically.
// ---------------------------------------------------------------------------

describe('template-freeze.json — schema validity (C3)', () => {
  it('validates against template-freeze.schema.json', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(ARTIFACT);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('frozen_at is a full 40-char SHA and an ancestor of HEAD', () => {
    expect(ARTIFACT.frozen_at).toMatch(/^[0-9a-f]{40}$/);
    expect(() => execFileSync('git', ['merge-base', '--is-ancestor', ARTIFACT.frozen_at, 'HEAD'], { cwd: REPO_ROOT })).not.toThrow();
  });
});

describe('template-freeze.json — regeneration reproduces it byte-identically (C3, every field DERIVED)', () => {
  it('a fresh --check reports clean — no drift between the live tree and the committed artifact', () => {
    const result = execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(result).toContain('clean — no drift');
  });

  it('RED — a stale LIVE-tier field (batching_prereq_snapshot) is caught by --check (mutate a copy, prove the checker fires, restore)', () => {
    // Targets the LIVE tier deliberately, not the FROZEN tier (schema_sha256/
    // categories/archetype_profiles/phase_runners): those are, BY DESIGN,
    // preserved verbatim from the committed file on a plain regenerate (see
    // "TWO TIERS OF FIELD" in generate-template-freeze.mjs) — a hand-edit to
    // a frozen field is not this drift check's job, it is the R-E lock's
    // (checkFrozenSchemaConsistency, tested separately below). Mutating
    // batching_prereq_snapshot exercises the field this --check DOES
    // re-derive on every run.
    const original = fs.readFileSync(ARTIFACT_PATH, 'utf8');
    try {
      const mutated = JSON.parse(original);
      mutated.batching_prereq_snapshot = [...mutated.batching_prereq_snapshot, { id: 'FIXTURE-STALE', status: 'NOT_STARTED', owner: 'wf: fixture' }];
      fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(mutated, null, 2)}\n`);
      let threw = false;
      try {
        execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });
      } catch {
        threw = true;
      }
      expect(threw, '--check must exit non-zero on a stale/hand-edited batching_prereq_snapshot').toBe(true);
    } finally {
      fs.writeFileSync(ARTIFACT_PATH, original);
    }
  });

  it('the FROZEN tier (schema_sha256/categories/archetype_profiles/phase_runners) is preserved verbatim on a plain regenerate, by design — only --refresh re-derives it (proven directly against the exported assembleArtifact, not by mutating the committed file, since a plain --check cannot see a frozen-tier hand-edit)', async () => {
    const mod = await loadGenerator();
    const frozenTier = { schema_sha256: 'PINNED', categories: ['a', 'b'], archetype_profiles: [], phase_runners: [] };
    const liveTier = { batching_prereq_snapshot: [] };
    const artifact = mod.assembleArtifact('deadbeef'.repeat(5), frozenTier, liveTier);
    expect(artifact.schema_sha256).toBe('PINNED');
    expect(artifact.categories).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// The frozen surface actually matches the live tree — G6 (20, not 18) and
// the 7-runner set (G11).
// ---------------------------------------------------------------------------

describe('template-freeze.json — the frozen categories/runners match the live tree', () => {
  it('categories is exactly step.schema.json.required (measured 20, not the stale "18" some older prose claims)', () => {
    const stepSchema = JSON.parse(fs.readFileSync(STEP_SCHEMA_PATH, 'utf8'));
    expect(ARTIFACT.categories).toEqual(stepSchema.required);
    expect(ARTIFACT.categories.length).toBe(20);
  });

  it('phase_runners names exactly the 9 built runners (assert has none — ASSERT writes nothing) — RE-FREEZE #9 (I4, 2026-09-16) adds runLinkColumnPhase, the COLUMN-STAMPING LINK fork', () => {
    const names = ARTIFACT.phase_runners.map((r) => r.runner).sort();
    expect(names).toEqual(['runBackfillPhase', 'runCascadePhase', 'runEnrichPhase', 'runIngestPhase', 'runLinkColumnPhase', 'runLinkKeyedPhase', 'runLinkPhase', 'runMaterializePhase', 'runRecorderPhase']);
  });

  it('archetype_profiles names all 8 identity.archetype enum values, ALL 8 proven — RE-FREEZE #5 (pilot 9 commit 9, 2026-09-11) closes ENRICHER, the last unproven archetype', () => {
    const stepSchema = JSON.parse(fs.readFileSync(STEP_SCHEMA_PATH, 'utf8'));
    const enumValues = stepSchema.properties.identity.properties.archetype.enum as string[];
    expect(ARTIFACT.archetype_profiles.map((p) => p.archetype).sort()).toEqual([...enumValues].sort());
    const enricher = ARTIFACT.archetype_profiles.find((p) => p.archetype === 'ENRICHER');
    expect(enricher?.proven).toBe(true);
    expect(enricher?.first_step).toBe('enrich_parcels');
    expect(enricher?.shapes).toEqual(['enrich']);
    expect(enricher?.runners).toEqual(['runEnrichPhase']);
    expect(ARTIFACT.archetype_profiles.every((p) => p.proven)).toBe(true);
  });

  it('LINK is honestly recorded with 3 shapes (link, link_column, link_keyed) — a real branch not shown by Spec 124 §9\'s own 1-row-per-archetype table', () => {
    const link = ARTIFACT.archetype_profiles.find((p) => p.archetype === 'LINK');
    expect(link?.shapes.sort()).toEqual(['link', 'link_column', 'link_keyed']);
    expect(link?.runners.sort()).toEqual(['runLinkColumnPhase', 'runLinkKeyedPhase', 'runLinkPhase']);
  });
});

// ---------------------------------------------------------------------------
// C4 — the R-E lock, pure predicate, both directions (Spec 121 §12b.6).
// ---------------------------------------------------------------------------

describe('checkFrozenSchemaConsistency — the R-E lock (C4)', () => {
  it('GREEN — schema unchanged since the last freeze', async () => {
    const mod = await loadGenerator();
    const r = mod.checkFrozenSchemaConsistency({ oldFrozenSchemaSha256: 'aaa', newFrozenSchemaSha256: 'aaa', liveSchemaSha256: 'aaa', section8Changed: false });
    expect(r.ok).toBe(true);
  });

  it('RED — schema changed, template-freeze.json NOT re-frozen to match', async () => {
    const mod = await loadGenerator();
    const r = mod.checkFrozenSchemaConsistency({ oldFrozenSchemaSha256: 'aaa', newFrozenSchemaSha256: 'aaa', liveSchemaSha256: 'bbb', section8Changed: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not re-frozen/);
  });

  it('RED — schema changed, template-freeze.json bumped to match, but Spec 122 §8 carries no text change', async () => {
    const mod = await loadGenerator();
    const r = mod.checkFrozenSchemaConsistency({ oldFrozenSchemaSha256: 'aaa', newFrozenSchemaSha256: 'bbb', liveSchemaSha256: 'bbb', section8Changed: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no text change/);
  });

  it('GREEN — a genuine re-freeze: schema changed, template-freeze.json bumped to match, AND Spec 122 §8 amended, same commit', async () => {
    const mod = await loadGenerator();
    const r = mod.checkFrozenSchemaConsistency({ oldFrozenSchemaSha256: 'aaa', newFrozenSchemaSha256: 'bbb', liveSchemaSha256: 'bbb', section8Changed: true });
    expect(r.ok).toBe(true);
  });

  it('GENESIS — no prior freeze existed (oldFrozenSchemaSha256 null): passes once the new artifact matches the live schema, no spec-diff requirement yet', async () => {
    const mod = await loadGenerator();
    const good = mod.checkFrozenSchemaConsistency({ oldFrozenSchemaSha256: null, newFrozenSchemaSha256: 'aaa', liveSchemaSha256: 'aaa', section8Changed: false });
    expect(good.ok).toBe(true);
    const bad = mod.checkFrozenSchemaConsistency({ oldFrozenSchemaSha256: null, newFrozenSchemaSha256: 'aaa', liveSchemaSha256: 'bbb', section8Changed: false });
    expect(bad.ok).toBe(false);
  });

  it('extractSection isolates ONLY the named ## N. heading\'s text, stopping at the next ## heading', async () => {
    const mod = await loadGenerator();
    const md = '## 7. Foo\ntext A\n## 8. Bar\nline one\nline two\n## 9. Baz\nunrelated';
    const section = mod.extractSection(md, /^## 8\. /);
    expect(section).toBe('## 8. Bar\nline one\nline two');
  });

  it('the real Spec 122 §8 section extracts non-empty text from the live spec file (grounds the extractor against the real document, not just a synthetic string)', async () => {
    const mod = await loadGenerator();
    const specPath = path.join(REPO_ROOT, 'docs/specs/01-pipeline/122_pipeline_step_optimization.md');
    const md = fs.readFileSync(specPath, 'utf8');
    const section = mod.extractSection(md, /^## 8\. /);
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain('## 8. The conversion process');
  });

  // CRLF-tolerant section compare — remediation, 2026-09-04 (freeze WF's
  // Guardian finding). `gitShowFile` returns the COMMITTED blob (git stores
  // LF); `readFileSync` of the SAME file on a Windows checkout
  // (`core.autocrlf=true`, no `.gitattributes`) returns CRLF. Exercises the
  // REAL `extractSection` + `gitShowFile` path against the real Spec 122
  // file and the real git history, not a fixtured boolean — mirrors the
  // `heritage-418`/`cost-ledger-gate` CRLF-tolerant precedent
  // (`docs/reports/review_followups.md` "CRLF-tolerant").
  it('CRLF-tolerant: the committed blob (LF, via gitShowFile) and the disk copy of the SAME content (CRLF-normalized to match) compare EQUAL through extractSection — section8Changed must read false for a pure line-ending difference', async () => {
    const mod = await loadGenerator();
    const specRelPath = 'docs/specs/01-pipeline/122_pipeline_step_optimization.md';
    const committed = mod.gitShowFile('HEAD', specRelPath); // git blob — LF
    expect(committed, 'HEAD must carry this spec file').not.toBeNull();
    const asDiskWouldRead = (committed as string).replace(/\n/g, '\r\n'); // simulates a Windows checkout of the identical content
    const fromCommitted = mod.extractSection(committed as string, /^## 8\. /);
    const fromDiskLike = mod.extractSection(asDiskWouldRead, /^## 8\. /);
    expect(fromCommitted.length).toBeGreaterThan(0);
    expect(fromCommitted).toBe(fromDiskLike);
    expect(fromCommitted !== fromDiskLike).toBe(false); // section8Changed, byte-identical content modulo EOL
  });

  it('CRLF-tolerant: a genuine one-line content change inside §8 (on the CRLF-simulated disk copy) still reads as changed', async () => {
    const mod = await loadGenerator();
    const specRelPath = 'docs/specs/01-pipeline/122_pipeline_step_optimization.md';
    const committed = mod.gitShowFile('HEAD', specRelPath) as string;
    const fromCommitted = mod.extractSection(committed, /^## 8\. /);
    const mutatedDiskLike = committed
      .replace(/\n/g, '\r\n')
      .replace('## 8.', '## 8. MUTATED-BY-TEST'); // one real content edit inside the heading line
    const fromMutated = mod.extractSection(mutatedDiskLike, /^## 8\. /);
    expect(fromCommitted !== fromMutated).toBe(true); // section8Changed must fire for a real edit
  });
});

// ---------------------------------------------------------------------------
// C5 — GAP G-3 (Spec 124 Rule 11): phase_order re-derivation, both directions.
// ---------------------------------------------------------------------------

describe('phase_order — GAP G-3 re-derivation (C5)', () => {
  it('every frozen phase_order still matches a fresh extraction from the live scripts/lib/step/index.js', async () => {
    const mod = await loadGenerator();
    const source = fs.readFileSync(INDEX_JS_PATH, 'utf8');
    const { lines, ranges } = mod.runnerRanges(source);
    for (const row of ARTIFACT.phase_runners) {
      const range = ranges[row.runner];
      expect(range, `${row.runner} not found in index.js — has it been renamed?`).toBeDefined();
      const live = mod.extractPhaseOrder(lines, range!);
      expect(live, `${row.runner}: frozen phase_order has drifted from the live source — bump template-freeze.json (--refresh) and amend Spec 122 §8 in the same commit`).toEqual(row.phase_order);
    }
  });

  it('RED — a fixture with two calls reordered (preWriteGate moved before staleness.selectMode) yields a DIFFERENT phase_order than the un-reordered fixture', async () => {
    const mod = await loadGenerator();
    const goodSource = fs.readFileSync(GOOD_RUNNER_FIXTURE, 'utf8');
    const badSource = fs.readFileSync(BAD_RUNNER_FIXTURE, 'utf8');
    const good = mod.runnerRanges(goodSource);
    const bad = mod.runnerRanges(badSource);
    const goodOrder = mod.extractPhaseOrder(good.lines, good.ranges.runFixturePhase!);
    const badOrder = mod.extractPhaseOrder(bad.lines, bad.ranges.runFixturePhase!);
    expect(goodOrder).toEqual(['staleness.readPriorEmit', 'staleness.selectMode', 'write.assertWritePrivileges', 'preWriteGate', 'write.executeWrite']);
    expect(badOrder).not.toEqual(goodOrder);
    expect(badOrder).toEqual(['staleness.readPriorEmit', 'preWriteGate', 'staleness.selectMode', 'write.assertWritePrivileges', 'write.executeWrite']);
  });

  it('GREEN — the un-reordered fixture matches what a hand-verified frozen phase_order would say (proves extraction is deterministic, not just "different from bad")', async () => {
    const mod = await loadGenerator();
    const source = fs.readFileSync(GOOD_RUNNER_FIXTURE, 'utf8');
    const { lines, ranges } = mod.runnerRanges(source);
    const order = mod.extractPhaseOrder(lines, ranges.runFixturePhase!);
    expect(order).toEqual(['staleness.readPriorEmit', 'staleness.selectMode', 'write.assertWritePrivileges', 'preWriteGate', 'write.executeWrite']);
  });

  it('extraction is comment-blind — a line-comment mentioning a library call is never picked up as a phase', async () => {
    const mod = await loadGenerator();
    const source = [
      'async function runCommentTestPhase({ pool }) {',
      '  // this comment mentions write.executeWrite and staleness.selectMode but neither has run yet',
      '  const prior = await staleness.readPriorEmit(pool);',
      '  await write.assertWritePrivileges(pool);',
      '}',
    ].join('\n');
    const { lines, ranges } = mod.runnerRanges(source);
    const order = mod.extractPhaseOrder(lines, ranges.runCommentTestPhase!);
    expect(order).toEqual(['staleness.readPriorEmit', 'write.assertWritePrivileges']);
  });
});

// ---------------------------------------------------------------------------
// batching_prereq_snapshot — the LIVE tier tracks programme-items.json honestly.
// ---------------------------------------------------------------------------

describe('template-freeze.json — batching_prereq_snapshot is the live, honest open set', () => {
  it('matches programme-items.json\'s current open batching_prereq set exactly (same predicate as generate-programme-backlog.mjs\'s openBatchingCount, G9)', () => {
    const items = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'programme-items.json'), 'utf8')).items as Array<{
      id: string;
      status: string;
      gate: { blocks: string[] };
    }>;
    const openIds = items.filter((it) => it.gate.blocks.includes('batching') && it.status !== 'BUILT' && it.status !== 'SUPERSEDED').map((it) => it.id).sort();
    expect(ARTIFACT.batching_prereq_snapshot.map((s) => s.id).sort()).toEqual(openIds);
  });

  it('no BUILT/SUPERSEDED item ever appears in the snapshot (mirrors G9)', () => {
    const items = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'programme-items.json'), 'utf8')).items as Array<{ id: string; status: string }>;
    for (const s of ARTIFACT.batching_prereq_snapshot) {
      const real = items.find((it) => it.id === s.id);
      expect(real, `${s.id} not found in programme-items.json`).toBeDefined();
      expect(['NOT_STARTED', 'PARTIAL']).toContain(real!.status);
    }
  });
});

// ---------------------------------------------------------------------------
// checkFreezeDeclarationHonesty — the FREEZE-1 lock (WF2 "FREEZE-1, the
// freeze precondition" phase 1 commit 1, 2026-09-09). Spec 122 §8.2's
// PRECONDITION ("the template may honestly freeze after the eighth pilot
// only when the batching_prereq set is empty") had only a console line as
// its guard; this is the both-directions lock, pure fixtures (Spec 121
// §12b.6), mirroring checkFrozenSchemaConsistency's own test shape above.
// Arms per the plan's §2 table (operator Ask A1 ruled NO, 2026-09-09 — arm E
// is armed).
// ---------------------------------------------------------------------------

describe('checkFreezeDeclarationHonesty — the FREEZE-1 lock', () => {
  const PROVEN_PROFILES: ArchetypeProfile[] = [{ archetype: 'ENRICHER', shapes: ['enrich'], runners: ['runEnrichPhase'], first_step: 'enrich_parcels', proven: true }];
  const UNPROVEN_PROFILES: ArchetypeProfile[] = [{ archetype: 'ENRICHER', shapes: [], runners: [], first_step: null, proven: false }];

  it('RED (arm A) — FREEZE-1 declared BUILT but another batching_prereq item is still open: the declaration claims a precondition that is measurably unmet', async () => {
    const mod = await loadGenerator();
    const r = mod.checkFreezeDeclarationHonesty({ freezeItemStatus: 'BUILT', otherOpenBatchingIds: ['STD-7'], snapshotIds: ['STD-7'], archetypeProfiles: PROVEN_PROFILES });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/STD-7/);
    expect(r.reason).toMatch(/arm A/);
  });

  it('RED (arm B) — FREEZE-1 declared BUILT, no OTHER open item, but the LIVE snapshot itself still lists FREEZE-1 as open: the artifact and the ledger disagree', async () => {
    const mod = await loadGenerator();
    const r = mod.checkFreezeDeclarationHonesty({ freezeItemStatus: 'BUILT', otherOpenBatchingIds: [], snapshotIds: ['FREEZE-1'], archetypeProfiles: PROVEN_PROFILES });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/disagree/);
    expect(r.reason).toMatch(/arm B/);
  });

  it('GREEN, vacuous (arm C) — FREEZE-1 not yet declared (today\'s actual state: NOT_STARTED): the lock is vacuous no matter what else is open or unproven', async () => {
    const mod = await loadGenerator();
    const r = mod.checkFreezeDeclarationHonesty({ freezeItemStatus: 'NOT_STARTED', otherOpenBatchingIds: ['STD-7'], snapshotIds: ['STD-7', 'FREEZE-1'], archetypeProfiles: UNPROVEN_PROFILES });
    expect(r.ok).toBe(true);
    expect(r.reason).toMatch(/arm C/);
    // PARTIAL is equally vacuous — the arm is keyed on "not yet declared", not on NOT_STARTED specifically.
    const partial = mod.checkFreezeDeclarationHonesty({ freezeItemStatus: 'PARTIAL', otherOpenBatchingIds: ['STD-7'], snapshotIds: ['STD-7', 'FREEZE-1'], archetypeProfiles: UNPROVEN_PROFILES });
    expect(partial.ok).toBe(true);
  });

  it('RED (arm E, Ask A1 ruled NO) — FREEZE-1 declared BUILT, every other gate clear, but ENRICHER still reads proven:false: a freeze declared over that is counted, not honest', async () => {
    const mod = await loadGenerator();
    const r = mod.checkFreezeDeclarationHonesty({ freezeItemStatus: 'BUILT', otherOpenBatchingIds: [], snapshotIds: [], archetypeProfiles: UNPROVEN_PROFILES });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not proven:true/);
    expect(r.reason).toMatch(/arm E/);
  });

  it('RED (arm E) — a MISSING/non-boolean `proven` fails closed the same as an explicit false (output-review fix: `!== true`, never `=== false`)', async () => {
    const mod = await loadGenerator();
    const missingProven = [{ archetype: 'ENRICHER', shapes: [], runners: [], first_step: null }] as unknown as ArchetypeProfile[];
    const r = mod.checkFreezeDeclarationHonesty({ freezeItemStatus: 'BUILT', otherOpenBatchingIds: [], snapshotIds: [], archetypeProfiles: missingProven });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/arm E/);
  });

  it('GREEN (arm D) — FREEZE-1 declared BUILT, no other open item, snapshot empty, every archetype proven: the target state', async () => {
    const mod = await loadGenerator();
    const r = mod.checkFreezeDeclarationHonesty({ freezeItemStatus: 'BUILT', otherOpenBatchingIds: [], snapshotIds: [], archetypeProfiles: PROVEN_PROFILES });
    expect(r.ok).toBe(true);
    expect(r.reason).toMatch(/arm D/);
    // SUPERSEDED is the same declared-honest status as BUILT for this lock's purposes.
    const superseded = mod.checkFreezeDeclarationHonesty({ freezeItemStatus: 'SUPERSEDED', otherOpenBatchingIds: [], snapshotIds: [], archetypeProfiles: PROVEN_PROFILES });
    expect(superseded.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// does_not_freeze / lg21_decision — declared, present, non-vacuous.
// ---------------------------------------------------------------------------

describe('template-freeze.json — declared rulings are present and non-vacuous', () => {
  it('does_not_freeze names at least the 6 excluded surfaces from the plan', () => {
    expect(ARTIFACT.does_not_freeze.length).toBeGreaterThanOrEqual(6);
  });

  it('lg21_decision ratifies fork-over-share and supersedes LG-21', () => {
    expect(ARTIFACT.lg21_decision.ruling).toMatch(/RATIFIED/);
    expect(ARTIFACT.lg21_decision.superseded_items).toContain('LG-21');
    expect(ARTIFACT.lg21_decision.reasons.length).toBeGreaterThan(0);
  });

  it('frozen_after_pilot is 9 (the operator ruling — STD-7/ENRICHER is not closable before pilot 9)', () => {
    expect(ARTIFACT.frozen_after_pilot).toBe(9);
  });
});
