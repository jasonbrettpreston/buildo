// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (RE-FREEZE; registry-truth Fold 20, ASSEMBLY 2.8 row)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1 / R-AV (declared ⇒ executed)
//
// Fold 20 (2026-10-05) schema locks, BOTH directions, each negative one mutation away from a valid
// real descriptor:
//   MQ-A7 — an INGESTOR whose guards.schema_drift declares "pause" (scalar or any per-layer arm) must
//           declare override.force_run as an env var: force_run is the only release of a paused drift.
//   Row 9 — guards.schema_drift other than "none" is INGESTOR-only: its only executor is the ingest path
//           (runIngestPhase -> schemaDriftDecision), so a non-INGESTOR propagate/pause is declared-but-inert.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const readJson = (p: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, p), 'utf8'));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { compileStepSchema } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js'));
const validate = compileStepSchema(readJson('scripts/steps/_schema/step.schema.json'));

type Desc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = (d: Desc): Desc => JSON.parse(JSON.stringify(d));
const ingestor = (): Desc => clone(readJson('scripts/load-ravines.descriptor.json'));
const enricher = (): Desc => clone(readJson('scripts/steps/_schema/fixtures/valid/enrich_heritage.descriptor.json'));
const errs = (): string =>
  ((validate.errors ?? []) as Array<{ instancePath?: string; keyword: string }>).map((e) => `${e.instancePath}:${e.keyword}`).join(', ');

describe('Fold 20 MQ-A7 — INGESTOR pause requires an override.force_run env', () => {
  it('GREEN control: load_ravines (pause + RAVINE_FORCE_RELOAD) validates', () => {
    expect(validate(ingestor()), errs()).toBe(true);
  });

  it('RED: the same INGESTOR with force_run "none" is refused', () => {
    const d = ingestor();
    d.override.force_run = 'none';
    expect(validate(d)).toBe(false);
  });

  it('RED: a per-layer schema_drift array with a pause arm and force_run "none" is refused', () => {
    const d = ingestor();
    d.guards.schema_drift = [
      { match: 'default', response: 'propagate', severity: 'WARN' },
      { match: 'base', response: 'pause', severity: 'FAIL' },
    ];
    d.override.force_run = 'none';
    expect(validate(d)).toBe(false);
  });

  it('GREEN: an INGESTOR with propagate (no pause) does not need force_run', () => {
    const d = ingestor();
    d.guards.schema_drift = 'propagate';
    d.override.force_run = 'none';
    expect(validate(d), errs()).toBe(true);
  });
});

describe('Fold 20 row 9 — schema_drift other than "none" is INGESTOR-only', () => {
  it('GREEN control: the ENRICHER exemplar with schema_drift "none" validates', () => {
    expect(validate(enricher()), errs()).toBe(true);
  });

  it('RED: the same ENRICHER with schema_drift "pause" is refused', () => {
    const d = enricher();
    d.guards.schema_drift = 'pause';
    expect(validate(d)).toBe(false);
  });

  it('RED: the same ENRICHER with schema_drift "propagate" is refused', () => {
    const d = enricher();
    d.guards.schema_drift = 'propagate';
    expect(validate(d)).toBe(false);
  });

  it('GREEN: an INGESTOR keeps propagate and pause', () => {
    const d = ingestor();
    expect(validate(d), errs()).toBe(true);
    d.guards.schema_drift = 'propagate';
    expect(validate(d), errs()).toBe(true);
  });
});
