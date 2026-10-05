// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.10 (Real-DB Integration Tests — the harness may only migrate its own disposable DB)
//
// WF3 2026-10-03 anti-regression lock — DB-FREE (pure decision function).
// A pre-commit `vitest related` ran with the local dev DB env exported and the
// db-test globalSetup migrated/seeded against 127.0.0.1:54322/postgres (stopped
// only by `permission denied for schema auth`). The decision is now a pure,
// exported function; these cases pin it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  decideTestDbTarget,
  applyAuthBaselineIfMissing,
  migrationChildEnv,
  readDbTarget,
  AUTH_BASELINE_PROBE_SQL,
} from './db/setup-testcontainer';

const DEV = 'postgresql://postgres:s3cretpw@127.0.0.1:54322/postgres';
const CI_URL = 'postgres://buildo:buildo@localhost:5432/postgres';
const CLOUD =
  'postgresql://postgres.abcdefgh:s3cretpw@aws-0-ca-central-1.pooler.supabase.com:6543/postgres';

const REPO_ROOT = path.resolve(__dirname, '../../');

describe('decideTestDbTarget — the db-test harness only migrates a disposable database', () => {
  it('no database signal at all is a no-op, and blank values count as no signal', () => {
    expect(decideTestDbTarget({})).toBe('noop');
    expect(decideTestDbTarget({ DATABASE_URL: '' })).toBe('noop');
    expect(decideTestDbTarget({ DATABASE_URL: '   ' })).toBe('noop');
  });

  it('BUILDO_TEST_DB=1 opts into the disposable testcontainer', () => {
    expect(decideTestDbTarget({ BUILDO_TEST_DB: '1' })).toBe('testcontainer');
  });

  it('BUILDO_TEST_DB=1 wins over an exported DATABASE_URL — the dev DB is never touched', () => {
    expect(decideTestDbTarget({ BUILDO_TEST_DB: '1', DATABASE_URL: DEV })).toBe('testcontainer');
  });

  it('BUILDO_TEST_DB=1 replaces an UNQUALIFIED exported URL with a testcontainer (dev, unmarked loopback, unmarked cloud, garbage)', () => {
    expect(decideTestDbTarget({ BUILDO_TEST_DB: '1', DATABASE_URL: DEV, CI: 'true' })).toBe('testcontainer');
    expect(decideTestDbTarget({ BUILDO_TEST_DB: '1', DATABASE_URL: DEV, BUILDO_TEST_DB_EXTERNAL: '1' })).toBe('testcontainer');
    expect(decideTestDbTarget({ BUILDO_TEST_DB: '1', DATABASE_URL: CI_URL })).toBe('testcontainer');
    expect(decideTestDbTarget({ BUILDO_TEST_DB: '1', DATABASE_URL: CLOUD, CI: 'true' })).toBe('testcontainer');
    expect(decideTestDbTarget({ BUILDO_TEST_DB: '1', DATABASE_URL: 'not a url' })).toBe('testcontainer');
  });

  it('a QUALIFIED external URL wins over BUILDO_TEST_DB=1 (original precedence)', () => {
    expect(decideTestDbTarget({ BUILDO_TEST_DB: '1', DATABASE_URL: CI_URL, CI: 'true' })).toBe('external-ci');
    expect(decideTestDbTarget({ BUILDO_TEST_DB: '1', DATABASE_URL: CLOUD, BUILDO_TEST_DB_EXTERNAL: '1' })).toBe('external-ci');
  });

  it('the local dev stack is refused with no signal, and the refusal never leaks the password', () => {
    expect(() => decideTestDbTarget({ DATABASE_URL: DEV })).toThrow(/REFUSING/);

    let message = '';
    try {
      decideTestDbTarget({ DATABASE_URL: DEV });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('127.0.0.1:54322');
    expect(message).not.toContain('s3cretpw');
  });

  it('the local dev stack is refused EVEN WITH an opt-in signal', () => {
    expect(() => decideTestDbTarget({ DATABASE_URL: DEV, CI: 'true' })).toThrow(/REFUSING/);
    expect(() => decideTestDbTarget({ DATABASE_URL: DEV, BUILDO_TEST_DB_EXTERNAL: '1' })).toThrow(
      /REFUSING/,
    );
    expect(() =>
      decideTestDbTarget({
        DATABASE_URL: 'postgresql://postgres:x@localhost:54322/postgres',
        CI: 'true',
        BUILDO_TEST_DB_EXTERNAL: '1',
      }),
    ).toThrow(/REFUSING/);
  });

  it('a cloud host is refused without the explicit external marker, and leaks no password', () => {
    expect(() => decideTestDbTarget({ DATABASE_URL: CLOUD })).toThrow(/REFUSING/);
    expect(() => decideTestDbTarget({ DATABASE_URL: CLOUD, CI: 'true' })).toThrow(/REFUSING/);

    let message = '';
    try {
      decideTestDbTarget({ DATABASE_URL: CLOUD, CI: 'true' });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toContain('s3cretpw');
  });

  it('a cloud host is allowed only with the explicit external marker', () => {
    expect(decideTestDbTarget({ DATABASE_URL: CLOUD, BUILDO_TEST_DB_EXTERNAL: '1' })).toBe(
      'external-ci',
    );
  });

  it('the CI service container is external-ci, whether flagged by CI or by the explicit marker', () => {
    expect(decideTestDbTarget({ DATABASE_URL: CI_URL, CI: 'true' })).toBe('external-ci');
    expect(decideTestDbTarget({ DATABASE_URL: CI_URL, BUILDO_TEST_DB_EXTERNAL: '1' })).toBe(
      'external-ci',
    );
    expect(
      decideTestDbTarget({
        DATABASE_URL: 'postgres://buildo:buildo@127.0.0.1:5432/postgres',
        CI: 'true',
      }),
    ).toBe('external-ci');
  });

  it('a loopback non-dev URL with no signal is refused — never silently migrated, never left exported', () => {
    expect(() => decideTestDbTarget({ DATABASE_URL: CI_URL })).toThrow(/REFUSING/);
    expect(() => decideTestDbTarget({ DATABASE_URL: CI_URL, CI: 'false' })).toThrow(/REFUSING/);
  });

  it('an unparseable URL is refused', () => {
    expect(() => decideTestDbTarget({ DATABASE_URL: 'not a url', CI: 'true' })).toThrow(/REFUSING/);
  });

  it('the real db-tests workflow DATABASE_URL resolves to external-ci under CI', () => {
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, '.github/workflows/db-tests.yml'),
      'utf8',
    );
    const match = workflow.match(/^\s*DATABASE_URL:\s*(\S+)\s*$/m);
    expect(match).toBeTruthy();
    expect(decideTestDbTarget({ DATABASE_URL: match![1], CI: 'true' })).toBe('external-ci');

    // CI runs `npm run test:db`, which sets BUILDO_TEST_DB=1 via cross-env — the
    // service container must STILL win (original precedence), not a testcontainer.
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:db']).toMatch(/BUILDO_TEST_DB=1/);
    expect(
      decideTestDbTarget({ DATABASE_URL: match![1], CI: 'true', BUILDO_TEST_DB: '1' }),
    ).toBe('external-ci');
  });

  it('setup() routes through the decision before any migration', () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'src/tests/db/setup-testcontainer.ts'),
      'utf8',
    );
    const fn = source.match(/export async function setup\([\s\S]*?\n\}\n/);
    expect(fn, 'export async function setup() not found').toBeTruthy();
    const body = fn![0];
    expect(body).toMatch(/decideTestDbTarget\(process\.env\)/);
    expect(body).not.toMatch(/if \(process\.env\.DATABASE_URL\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WF3 PostGIS pin — the two defects the plan panel found in the migration path
// (2026-10-03): (1) on the Supabase target image the auth objects already exist
// and the non-superuser `postgres` cannot create in schema `auth` (42501), so the
// baseline seed must be PROBED and skipped there — but kept, not deleted, for
// GoTrue-less images (review_followups 2942); (2) `migrate.js` resolves
// DATABASE_URL before PG_*, so the child must be handed an EXPLICIT DATABASE_URL
// or a stray exported one wins (F14: the spike migrated the dev DB that way).
// Pure/DB-free: a fake query function and an env object.
// ─────────────────────────────────────────────────────────────────────────────

/** A fake SQL executor: first call returns the probe row, every later call an empty result. */
function fakeQuery(probeRow: Record<string, unknown>): {
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
  calls: string[];
} {
  const calls: string[] = [];
  const query = async (sql: string) => {
    calls.push(sql);
    return { rows: calls.length === 1 ? [probeRow] : [] };
  };
  return { query, calls };
}

describe('WF3 PostGIS pin — seed skip + migrate child env (panel findings 1/2)', () => {
  it('the probe asks about BOTH the table and the function before seeding', () => {
    expect(AUTH_BASELINE_PROBE_SQL).toContain("to_regclass('auth.users')");
    expect(AUTH_BASELINE_PROBE_SQL).toContain("to_regprocedure('auth.uid()')");
  });

  it('a complete baseline is SKIPPED with no other SQL issued', async () => {
    const { query, calls } = fakeQuery({ users: 'auth.users', uid: 'auth.uid()' });
    await expect(applyAuthBaselineIfMissing(query)).resolves.toBe('skipped');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(AUTH_BASELINE_PROBE_SQL);
    expect(calls.some((c) => c.includes('CREATE'))).toBe(false);
  });

  it('a partial or absent baseline is SEEDED (the probe is non-null only when both are present)', async () => {
    const partials: Array<Record<string, unknown>> = [
      { users: null, uid: 'auth.uid()' },
      { users: 'auth.users', uid: null },
      { users: null, uid: null },
    ];
    for (const probeRow of partials) {
      const { query, calls } = fakeQuery(probeRow);
      await expect(applyAuthBaselineIfMissing(query)).resolves.toBe('seeded');
      expect(calls).toHaveLength(2);
      expect(calls[1]).toContain('CREATE TABLE IF NOT EXISTS auth.users');
      expect(calls[1]).toContain('auth.uid()');
    }
  });

  it('migrationChildEnv overrides an exported dev DATABASE_URL (the F14 hijack)', () => {
    const env = migrationChildEnv('postgres://postgres:pw@127.0.0.1:55432/postgres', {
      DATABASE_URL: DEV,
      PG_HOST: 'stale',
      FOO: 'bar',
    });
    expect(env.DATABASE_URL).toBe('postgres://postgres:pw@127.0.0.1:55432/postgres');
    expect(env.DATABASE_URL).not.toBe(DEV);
    expect(env.PG_HOST).toBe('127.0.0.1');
    expect(env.PG_PORT).toBe('55432');
    expect(env.PG_USER).toBe('postgres');
    expect(env.PG_PASSWORD).toBe('pw');
    expect(env.PG_DATABASE).toBe('postgres');
    expect(env.FOO).toBe('bar');
  });

  it('readDbTarget() reads the declared engine from _contracts.json#db_target', () => {
    const contracts = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/_contracts.json'), 'utf8'),
    ) as {
      db_target: { pg_major: number; postgis_major_minor: string; test_image: string };
    };
    const { pg_major, postgis_major_minor, test_image } = contracts.db_target;
    expect(readDbTarget()).toEqual({ pg_major, postgis_major_minor, test_image });
  });
});
