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

  it('SKIP_PHASES_SQL contains exactly the terminal/orphan phases (P19, P20, O1, O2, O3)', () => {
    // WF3 2026-04-21: P1 and P2 were intentionally removed from SKIP_PHASES_SQL to
    // enable P1/P2 early-funnel inclusion in the PERT pipeline (Branch A in SOURCE_SQL).
    // The set is now exactly 5 terminal/orphan phases.
    const match = content.match(/SKIP_PHASES_SQL\s*=\s*`\(([^`]+)\)`/);
    expect(match, 'SKIP_PHASES_SQL constant not found').not.toBeNull();
    const sqlLiteral = match?.[1] ?? '';
    // Exact phase matches using word boundaries (not .toContain which would
    // match 'P1' as substring of 'P19' and 'P2' as substring of 'P20').
    for (const phase of ['P19', 'P20', 'O1', 'O2', 'O3']) {
      expect(sqlLiteral, `Expected '${phase}' in SKIP_PHASES_SQL`).toMatch(
        new RegExp(`'${phase}'`),
      );
    }
    // P1 and P2 must NOT be present as discrete phases (removed for PERT pipeline).
    expect(sqlLiteral).not.toMatch(/'P1'(?!')/);
    expect(sqlLiteral).not.toMatch(/'P2'(?!')/);
  });

  it('exports SKIP_PHASES_SQL in module.exports', () => {
    expect(content).toMatch(/module\.exports[\s\S]{0,500}SKIP_PHASES_SQL/);
  });
});

describe('assert-entity-tracing.js — WF3 Zombie Gate: eligible denominator uses COALESCE recency gate', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('eligiblePermits denominator has COALESCE(phase_started_at, issued_date, application_date) recency gate', () => {
    // After the 3-year zombie gate was added to compute-trade-forecasts SOURCE_SQL,
    // the eligible denominator must mirror it. Without this, the denominator counts
    // old permits (>3 years) the engine intentionally ignores → false low coverage.
    // Red Light: this test MUST fail before the eligiblePermits query is updated.
    expect(content).toMatch(
      /COALESCE\(p\.phase_started_at,\s*p\.issued_date,\s*p\.application_date\)\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'3 years'/,
    );
  });

  it('eligiblePermits denominator does NOT use phase_started_at IS NOT NULL in the SQL query (replaced by COALESCE gate)', () => {
    // The old IS NOT NULL guard excluded P1/P2 (now eligible via application_date)
    // and did not enforce the 3-year recency window. Must be removed from the SQL.
    // Anchors on the query string itself (backtick template literal) — comments are excluded.
    const sqlBlocks = content.match(/`[^`]+`/g) ?? [];
    const eligSql = sqlBlocks.find(b => b.includes('eligible_permits')) ?? '';
    expect(eligSql, 'eligiblePermits SQL should not have phase_started_at IS NOT NULL').not.toMatch(
      /phase_started_at\s+IS\s+NOT\s+NULL/,
    );
  });

  it('trade_forecasts numerator has the same COALESCE recency gate (numerator/denominator parity)', () => {
    // Numerator and denominator must use identical eligibility criteria.
    // A permit excluded from the denominator by the recency gate cannot appear
    // in the numerator without producing a coverage ratio > 1.
    // Anchors on the SQL template literal that SELECTs from trade_forecasts.
    const sqlBlocks = content.match(/`[^`]+`/g) ?? [];
    const tfSql = sqlBlocks.find(b => b.includes('trade_forecasts tf') && b.includes('AS matched')) ?? '';
    expect(tfSql, 'trade_forecasts numerator SQL not found').not.toBe('');
    expect(tfSql).toMatch(
      /COALESCE\(p\.phase_started_at,\s*p\.issued_date,\s*p\.application_date\)\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'3 years'/,
    );
  });

  it('trade_forecasts numerator does NOT use phase_started_at IS NOT NULL in the SQL query', () => {
    const sqlBlocks = content.match(/`[^`]+`/g) ?? [];
    const tfSql = sqlBlocks.find(b => b.includes('trade_forecasts tf') && b.includes('AS matched')) ?? '';
    expect(tfSql).not.toMatch(/phase_started_at\s+IS\s+NOT\s+NULL/);
  });
});
