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

import { decideTestDbTarget } from './db/setup-testcontainer';

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
