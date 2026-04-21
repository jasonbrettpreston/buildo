// SPEC LINK: docs/specs/pipeline/41_chain_permits.md §4
//
// Infra tests for assert-entity-tracing.js:
//   (a) Opportunity-score denominator must exclude expired forecast rows
//   (b) SKIP_PHASES_SQL must be imported from the shared lib, not defined locally
//   (c) Advisory lock ID = 110

import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'quality', 'assert-entity-tracing.js');
const LIFECYCLE_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'lifecycle-phase.js');

function src(): string {
  return fs.readFileSync(SCRIPT_PATH, 'utf8');
}

describe('assert-entity-tracing.js — file existence', () => {
  it('script file exists', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });
});

describe('assert-entity-tracing.js — advisory lock', () => {
  it('uses ADVISORY_LOCK_ID = 110', () => {
    expect(src()).toContain('ADVISORY_LOCK_ID = 110');
  });

  it('calls pipeline.withAdvisoryLock', () => {
    expect(src()).toMatch(/pipeline\.withAdvisoryLock/);
  });
});

describe('assert-entity-tracing.js — WF3-A: opportunity_score excludes expired forecast rows', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('opportunity_score query filters out expired urgency rows from denominator', () => {
    // compute_opportunity_scores only processes non-expired forecast rows.
    // The denominator must mirror this: including expired rows inflates the
    // total to ~81K and produces ~20.5% coverage → false FAIL.
    // tf.urgency is table-qualified (two-table JOIN — avoids future ambiguity).
    expect(content).toMatch(/tf\.urgency IS NULL OR tf\.urgency <> 'expired'/);
  });

  it('expired filter appears in the opportunity_score SELECT block', () => {
    // Ensures the filter is on the query that counts forecast_rows (denominator),
    // not in an unrelated query elsewhere in the file.
    const osSection = content.match(/─+ 5\. opportunity_score[\s\S]{0,1200}/)?.[0] ?? '';
    expect(osSection).toMatch(/tf\.urgency IS NULL OR tf\.urgency <> 'expired'/);
  });
});

describe('assert-entity-tracing.js — WF3-D: SKIP_PHASES_SQL imported from shared lib', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('requires SKIP_PHASES_SQL from scripts/lib/lifecycle-phase.js', () => {
    // Single source of truth: lifecycle-phase.js exports SKIP_PHASES_SQL so
    // all consumers stay in sync when the phase list changes.
    expect(content).toMatch(/require\(['"][^'"]*lifecycle-phase['"]\)/);
  });

  it('does not define SKIP_PHASES_SQL as a local backtick literal', () => {
    // Local backtick definitions were the pre-DRY pattern. After import, the
    // local `const SKIP_PHASES_SQL = \`...\`` must be gone.
    expect(content).not.toMatch(/const SKIP_PHASES_SQL\s*=\s*`/);
  });
});

describe('scripts/lib/lifecycle-phase.js — SKIP_PHASES_SQL export (WF3-D shared constant)', () => {
  let content: string;
  beforeAll(() => { content = fs.readFileSync(LIFECYCLE_PATH, 'utf8'); });

  it('defines SKIP_PHASES_SQL constant', () => {
    expect(content).toContain('SKIP_PHASES_SQL');
  });

  it('SKIP_PHASES_SQL contains all 7 skip phases', () => {
    // Must match compute-trade-forecasts.js SKIP_PHASES Set exactly.
    const match = content.match(/SKIP_PHASES_SQL\s*=\s*`([^`]+)`/);
    expect(match).not.toBeNull();
    const sqlLiteral = match?.[1] ?? '';
    for (const phase of ['P19', 'P20', 'O1', 'O2', 'O3', 'P1', 'P2']) {
      expect(sqlLiteral).toContain(phase);
    }
  });

  it('exports SKIP_PHASES_SQL in module.exports', () => {
    expect(content).toMatch(/module\.exports[\s\S]{0,500}SKIP_PHASES_SQL/);
  });
});
