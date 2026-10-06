// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md (Phase 3 #37 execution.batch, WIRE -> G; FLEET-2 B-3, MQ-B1 (a))
//
// RED-FIRST (FLEET-2 B-3, #37). For an INGESTOR the effective write stride is
// pipeline.maxRowsPerInsert(columnsPerRow) per write target and no ingest runner reads
// execution.batch, so the declared value is generated (scripts/generate-ingest-batch.js):
// one target -> that stride; several targets -> "none"; a step whose compute reads the value
// (massing) is out of scope. RED until `node scripts/generate-ingest-batch.js --write` runs.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface Plan { rel: string; slug: string; declared: unknown; expected: unknown; drift: boolean }
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS generator under test
const gen = require('../../scripts/generate-ingest-batch.js') as { planDescriptor: (rel: string, text: string) => Plan | null };

const ROOT = process.cwd();
const files = ['scripts', 'scripts/quality'].flatMap((dir) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.descriptor.json')).map((f) => `${dir}/${f}`));
const plans = files
  .map((rel) => gen.planDescriptor(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')))
  .filter((p): p is Plan => p !== null);

describe('#37 — an ingestor\'s execution.batch is generated from its write stride (never hand-kept)', () => {
  it('the fixture is non-vacuous — at least 6 ingestors are in scope, and massing (its compute reads the value) is not', () => {
    expect(plans.length).toBeGreaterThanOrEqual(6);
    expect(plans.map((p) => p.slug)).not.toContain('massing');
  });

  for (const p of plans) {
    it(`${p.slug}: execution.batch == ${JSON.stringify(p.expected)}`, () => {
      expect(p.declared, `${p.rel}: declared ${JSON.stringify(p.declared)}, generated ${JSON.stringify(p.expected)} — run node scripts/generate-ingest-batch.js --write`).toEqual(p.expected);
    });
  }
});
