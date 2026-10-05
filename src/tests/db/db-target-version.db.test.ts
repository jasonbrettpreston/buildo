// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.10 (Real-DB Integration Tests)
// 🔗 SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §Version pinning
//
// T-PIN-2 — WF3 PostGIS pin 2026-10-03. The DB-tier container must run the SAME engine
// the authoritative target runs: the same PostGIS major.minor and the same PostgreSQL
// major (measured local stack AND cloud, 2026-10-03, identical: PG 17.6 / PostGIS 3.3.7 /
// GEOS 3.14.1). The expected values are the declared contract — `docs/specs/_contracts
// .json#db_target` — read here with fs, NOT imported from the harness under test, so the
// lock does not depend on the code it grades. READ ONLY (SELECTs only). REQUIRED gate: in
// an opted-in run (BUILDO_TEST_DB=1 or CI=true) a missing pool THROWS rather than skipping.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const DB_TARGET = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'docs/specs/_contracts.json'), 'utf8'),
).db_target as { pg_major: number; postgis_major_minor: string };

const pool = getTestPool();

describe.skipIf(!dbAvailable())('T-PIN-2 — the DB-test container runs the target engine (db_target)', () => {
  if (!pool) {
    // Throw ONLY in an opted-in DB run — there a missing pool means silently
    // registering zero tests. In a plain `npm run test` this is the designed skip.
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  afterAll(async () => {
    await pool?.end();
  });

  it('T-PIN-2(a) — postgis_lib_version() major.minor equals db_target.postgis_major_minor', async () => {
    const { rows } = await pool!.query('SELECT postgis_lib_version() AS v');
    const v = rows[0].v as string;
    const [maj, min] = v.split('.');
    expect(
      `${maj}.${min}`,
      `container PostGIS ${v} vs contract ${DB_TARGET.postgis_major_minor}`,
    ).toBe(DB_TARGET.postgis_major_minor);
  });

  it('T-PIN-2(b) — server major equals db_target.pg_major', async () => {
    const { rows } = await pool!.query("SELECT current_setting('server_version_num')::int AS n");
    const n = rows[0].n as number;
    expect(
      Math.floor(n / 10000),
      `container server_version_num ${n} vs contract pg_major ${DB_TARGET.pg_major}`,
    ).toBe(DB_TARGET.pg_major);
  });

  it('T-PIN-2(c) — the suite connects as a NON-superuser, like the target (panel finding 1)', async () => {
    const { rows } = await pool!.query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user');
    expect(rows[0].rolsuper).toBe(false);
  });
});
