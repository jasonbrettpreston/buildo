// 🔗 SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §3
//
// Regression lock for the src/lib/db/client.ts DB connection-string var alias
// (OD-A, Phase 4 ballot #1): the Vercel-deployed app's raw-pg pool must read
// `POSTGRES_URL` (integration-injected) with a fall-back to `DATABASE_URL`
// (local dev). `??` semantics: POSTGRES_URL wins whenever it is present.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveRuntimeConnectionString, pool } from '@/lib/db/client';

describe('resolveRuntimeConnectionString — Spec 113 §3 DB-var alias (OD-A)', () => {
  it('prefers POSTGRES_URL (Vercel-injected) when present', () => {
    const env = {
      POSTGRES_URL: 'postgresql://app:pw@pooler:6543/postgres',
      DATABASE_URL: 'postgresql://dev:pw@127.0.0.1:54322/postgres',
    } as unknown as NodeJS.ProcessEnv;
    expect(resolveRuntimeConnectionString(env)).toBe('postgresql://app:pw@pooler:6543/postgres');
  });

  it('falls back to DATABASE_URL when POSTGRES_URL is absent (local dev / pipeline)', () => {
    const env = {
      DATABASE_URL: 'postgresql://dev:pw@127.0.0.1:54322/postgres',
    } as unknown as NodeJS.ProcessEnv;
    expect(resolveRuntimeConnectionString(env)).toBe('postgresql://dev:pw@127.0.0.1:54322/postgres');
  });

  it('returns POSTGRES_URL when only it is set (Vercel runtime, no DATABASE_URL)', () => {
    const env = {
      POSTGRES_URL: 'postgresql://app:pw@pooler:6543/postgres',
    } as unknown as NodeJS.ProcessEnv;
    expect(resolveRuntimeConnectionString(env)).toBe('postgresql://app:pw@pooler:6543/postgres');
  });

  it('returns undefined when neither is set (falls through to the PG_* host-config branch)', () => {
    const env = {} as unknown as NodeJS.ProcessEnv;
    expect(resolveRuntimeConnectionString(env)).toBeUndefined();
  });

  it('C3: an empty-string POSTGRES_URL is treated as absent — DATABASE_URL wins, not the shadow', () => {
    const env = {
      POSTGRES_URL: '',
      DATABASE_URL: 'postgresql://dev:pw@127.0.0.1:54322/postgres',
    } as unknown as NodeJS.ProcessEnv;
    expect(resolveRuntimeConnectionString(env)).toBe('postgresql://dev:pw@127.0.0.1:54322/postgres');
  });

  it('C3: a whitespace-only POSTGRES_URL is also treated as absent', () => {
    const env = {
      POSTGRES_URL: '   ',
      DATABASE_URL: 'postgresql://dev:pw@127.0.0.1:54322/postgres',
    } as unknown as NodeJS.ProcessEnv;
    expect(resolveRuntimeConnectionString(env)).toBe('postgresql://dev:pw@127.0.0.1:54322/postgres');
  });

  it('C3: both empty resolves to undefined (PG_* branch), never an empty string', () => {
    const env = { POSTGRES_URL: '', DATABASE_URL: '' } as unknown as NodeJS.ProcessEnv;
    expect(resolveRuntimeConnectionString(env)).toBeUndefined();
  });
});

// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1
//
// P1-C-src (c): the test-mode SQL caller tag must be wired into the app's ONE
// pool (src/lib/db/client.ts) so the single witness tracer can attribute each
// statement to the file that issued it. Source-text assertions lock the exact
// wiring; the GREEN control proves the tag stays INERT in a non-traced run
// (this process has BUILDO_SQL_TRACE unset), so shipped behaviour is unchanged.
describe('client.ts — test-mode SQL caller tag wiring (P1-C-src (c))', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/db/client.ts'),
    'utf8'
  );

  it("imports installSqlCallerTag and withSqlCaller from './sql-trace-caller'", () => {
    expect(source).toContain(
      "import { installSqlCallerTag, withSqlCaller } from './sql-trace-caller';"
    );
  });

  it("calls installSqlCallerTag(pool) AFTER the pool.on('error') block", () => {
    const errorBlockIndex = source.indexOf("pool.on('error'");
    const installIndex = source.indexOf('installSqlCallerTag(pool);');
    expect(errorBlockIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(errorBlockIndex);
  });

  it('runs the withTransaction body inside withSqlCaller(', () => {
    expect(source).toMatch(/export async function withTransaction[\s\S]*?withSqlCaller\(/);
  });

  it('GREEN control: the tag is inert here (NODE_ENV/ BUILDO_SQL_TRACE not a traced run)', () => {
    const installed = (pool as unknown as Record<symbol, unknown>)[
      Symbol.for('buildo.sql-witness.caller-installed')
    ];
    expect(installed).toBeUndefined();
  });
});
