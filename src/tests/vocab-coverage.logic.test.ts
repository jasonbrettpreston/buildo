// 🔗 SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md §3 (vocabulary dimension)
//    + 30_pipeline_architecture.md §3 + 48_pipeline_observability.md §3.5 (cov_ primitive)
//
// Source-text lock for scripts/lib/vocab-coverage.js — the shared resolve+count behind BOTH the
// global profiler (assert-global-coverage.js) and the SDK cov_* primitive (pipeline.computeVocabCoverage).
// The COUNT(DISTINCT …) SQL + the enumerated unresolved reasons were extracted here from
// assert-global-coverage.js (the F2 split); these asserts are their new home.

import { readFileSync } from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';

const LIB_PATH = path.resolve(__dirname, '../../scripts/lib/vocab-coverage.js');

describe('vocab-coverage.js — resolveAndCountTriple', () => {
  let content: string;
  beforeAll(() => { content = readFileSync(LIB_PATH, 'utf-8'); });

  it('exports resolveAndCountTriple', () => {
    expect(content).toMatch(/module\.exports = \{ resolveAndCountTriple \}/);
  });

  it('counts coverage with COUNT(DISTINCT …) on both the data and vocab sides', () => {
    expect(content).toMatch(/COUNT\(DISTINCT \$\{dC\}\)/);
    expect(content).toMatch(/COUNT\(DISTINCT \$\{vC\}\)/);
  });

  it('uses INTERSECTION semantics (data values that ARE in the vocab) — bounds coverage <= 100%', () => {
    // present counts distinct data values restricted to those present in the vocabulary.
    expect(content).toMatch(/IN \(SELECT \$\{vC\} FROM \$\{vT\}/);
  });

  it('applies dataFilter to the data side and vocabFilter to the vocab side (independent)', () => {
    expect(content).toMatch(/t\.dataFilter/);
    expect(content).toMatch(/t\.vocabFilter/);
  });

  it('returns enumerated unresolved reasons (never raw error into the row value)', () => {
    expect(content).toMatch(/unresolved: 'bad identifier'/);
    expect(content).toMatch(/unresolved: 'missing column'/);
    expect(content).toMatch(/unresolved: 'type mismatch'/);
    expect(content).toMatch(/'timeout'/);
    expect(content).toMatch(/'query error'/);
    // raw error detail is logged, not returned
    expect(content).toMatch(/logWarn\(/);
  });

  it('validates identifiers with a regex before interpolation (graceful, not a throw)', () => {
    expect(content).toMatch(/IDENT_RE/);
    expect(content).toMatch(/\[a-z_\]\[a-z0-9_\]\*/);
  });

  it('guards query cost with a transaction-scoped statement_timeout', () => {
    expect(content).toMatch(/SET LOCAL statement_timeout/);
    expect(content).toMatch(/57014/); // query_canceled → 'timeout' reason
  });

  it('never throws — every failure path returns an unresolved marker', () => {
    // no `throw` STATEMENTS in the module (failures degrade to { unresolved }); the word "throw"
    // may appear in prose, so match the statement form specifically.
    expect(content).not.toMatch(/\bthrow\s+new\b/);
  });
});
