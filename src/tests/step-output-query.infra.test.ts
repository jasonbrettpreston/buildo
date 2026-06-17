// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector)
//   + docs/specs/00_engineering_standards.md §4.2 (dynamic-query safety)
//
// Source-shape regression locks for the read-only step-output query + route (no live DB),
// + behavioral test of the request Zod schema. Mirrors lead-inspect-query.infra.test.ts.

import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { StepOutputQuerySchema } from '@/lib/admin/types';

const QUERY_SRC = readFileSync(path.resolve(__dirname, '../lib/admin/step-output-query.ts'), 'utf-8');
const ROUTE_SRC = readFileSync(path.resolve(__dirname, '../app/api/admin/pipeline/step-output/route.ts'), 'utf-8');

describe('step-output-query.ts — SQL injection fences (source shape)', () => {
  it('quoteIdent-wraps the table + every projected/filter identifier', () => {
    expect(QUERY_SRC).toMatch(/quoteIdent\(table\)/);
    expect(QUERY_SRC).toMatch(/colNames\.map\(quoteIdent\)/);
    expect(QUERY_SRC).toMatch(/quoteIdent\(filterField\)/);
  });

  it('uses ORDER BY 1, ctid (deterministic, no dynamic sort column)', () => {
    expect(QUERY_SRC).toMatch(/ORDER BY 1, ctid/);
  });

  it('binds limit/offset + the filter value as $n params (no value concatenation)', () => {
    expect(QUERY_SRC).toMatch(/LIMIT \$\$\{limitIdx\} OFFSET \$\$\{offsetIdx\}/);
    expect(QUERY_SRC).toMatch(/ILIKE \$1/);
    expect(QUERY_SRC).toMatch(/`\$\{filterValue\}%`/); // prefix match, no leading wildcard
  });

  it('runs inside withTransaction with a SET LOCAL statement_timeout (pool-leak-safe)', () => {
    expect(QUERY_SRC).toMatch(/withTransaction/);
    expect(QUERY_SRC).toMatch(/SET LOCAL statement_timeout/);
  });

  it('falls back to exact COUNT when reltuples estimate is not usable (<= threshold / stale)', () => {
    expect(QUERY_SRC).toMatch(/reltuples/);
    expect(QUERY_SRC).toMatch(/COUNT\(\*\)/);
  });
});

describe('step-output route — contract (source shape)', () => {
  it('verifyAdminAuth is the first gate → 401', () => {
    expect(ROUTE_SRC).toMatch(/verifyAdminAuth\(request\)/);
    expect(ROUTE_SRC).toMatch(/status: 401/);
  });
  it('wraps in withApiEnvelope and Zod-parses the response at the boundary', () => {
    expect(ROUTE_SRC).toMatch(/withApiEnvelope/);
    expect(ROUTE_SRC).toMatch(/ok\(StepOutputSchema\.parse\(result\)\)/);
  });
  it('404 for a slug with no inspectable table; 400 for a non-filterable filterField', () => {
    expect(ROUTE_SRC).toMatch(/getStepTelemetryTable\(slug\)/);
    expect(ROUTE_SRC).toMatch(/notFound\(/);
    expect(ROUTE_SRC).toMatch(/isFilterable\(col\)/);
    expect(ROUTE_SRC).toMatch(/'VALIDATION_FAILED'/);
  });
  it('emits a logInfo audit line on success (§13.3)', () => {
    expect(ROUTE_SRC).toMatch(/logInfo\([^)]*uid/);
  });
});

describe('StepOutputQuerySchema — request validation', () => {
  it('defaults limit=50, offset=0 and requires a slug', () => {
    const r = StepOutputQuerySchema.safeParse({ slug: 'classify_permits' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(50);
      expect(r.data.offset).toBe(0);
    }
    expect(StepOutputQuerySchema.safeParse({}).success).toBe(false); // no slug
  });

  it('clamps limit to 1..100 and rejects negative offset', () => {
    expect(StepOutputQuerySchema.safeParse({ slug: 'x', limit: '0' }).success).toBe(false);
    expect(StepOutputQuerySchema.safeParse({ slug: 'x', limit: '101' }).success).toBe(false);
    expect(StepOutputQuerySchema.safeParse({ slug: 'x', offset: '-1' }).success).toBe(false);
    expect(StepOutputQuerySchema.safeParse({ slug: 'x', limit: '50', offset: '100' }).success).toBe(true);
  });
});
