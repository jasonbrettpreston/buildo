// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md (§P0 — "the audit instrument is lying")
// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §4.1 (ssl-config is the only ssl builder)
//
// Contract locks for scripts/lib/resolve-db.js (WF3 2026-08-23).
//
// THE BUG THIS PINS. 24 files under scripts/ resolved their Postgres target
// through `|| 'localhost'` / `|| '5432'` / `|| 'buildo'` fallbacks, so with no
// env set they connected — silently, successfully, no log line — to the
// PRE-CUTOVER database (222 migrations) instead of the authoritative one (241).
// The same audit at the same commit read 2,394 violations against one and
// 30,288 against the other. Nothing in the output said which DB was graded.
//
// Two properties are load-bearing and are asserted BOTH directions here
// (a refusal test that never proves the accept case cannot tell "correctly
// refused" from "refuses everything"):
//   (a) no explicit target        → THROW, message names the fix
//   (b) below the migration floor → THROW, and 237 (cloud) / 241 (local) pass
//
// ⚠️ The floor is a COUNT, not a parsed MAX(filename). Measured live 2026-08-23:
// pre-cutover = 222 rows / MAX '225_…'; cloud = 237 / '241_…'; local = 241 / '244_…'.
// A max-based floor of 223 would ACCEPT the pre-cutover DB (225 > 223). The
// `max-based floor` case below is the lock on that.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { floorExemptionCallSites } from './script-source-scan';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolveDb = require('../../scripts/lib/resolve-db.js') as {
  DEFAULT_MIN_MIGRATION: number;
  REQUIRED_PG_VARS: string[];
  resolveDbConfig: (opts?: Record<string, unknown>) => {
    poolConfig: Record<string, unknown>;
    description: string;
    source: string;
  };
  assertDbTarget: (
    client: { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> },
    opts?: Record<string, unknown>,
  ) => Promise<{ database: string; migrationCount: number; hasTracking: boolean }>;
  createResolvedPool: (opts?: Record<string, unknown>) => unknown;
};

const ROOT = process.cwd();
const QUIET = { log: () => {}, warn: () => {} };

/**
 * A pg-shaped stub answering resolve-db's two probes: the identity row, then
 * the `schema_migrations` count. `hasTracking:false` models a fresh database
 * where the table does not exist at all.
 */
function stubClient(opts: { database?: string; count?: number; hasTracking?: boolean }) {
  const database = opts.database ?? 'buildo';
  const hasTracking = opts.hasTracking ?? true;
  const count = opts.count ?? 0;
  const seen: string[] = [];
  return {
    seen,
    query: async (sql: string) => {
      seen.push(sql);
      if (/current_database/.test(sql)) {
        return { rows: [{ database, db_user: 'postgres', has_tracking: hasTracking }] };
      }
      return { rows: [{ n: count }] };
    },
  };
}

describe('(a) no explicit target is a REFUSAL, never a default', () => {
  it('throws when neither a caller config nor any env var names a target', () => {
    expect(() => resolveDb.resolveDbConfig({ label: 't', env: {} })).toThrow(
      /no explicit database target/,
    );
  });

  it('the refusal message names the FIX, not just the problem', () => {
    // An error that says "no target" and stops is a worse version of the same
    // silence. The operator must be able to act on the message alone.
    let msg = '';
    try {
      resolveDb.resolveDbConfig({ label: 't', env: {} });
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).toContain('DATABASE_URL');
    expect(msg).toContain('127.0.0.1:54322/postgres');
    expect(msg).toMatch(/PG_HOST, PG_PORT, PG_DATABASE/);
  });

  it('a PARTIAL discrete PG_* config is refused, and the message says which vars are missing', () => {
    // This is the precise shape of the original defect: PG_HOST set, PG_PORT
    // and PG_DATABASE defaulted to 5432/buildo. A partial triple must NOT be
    // completed from defaults.
    let msg = '';
    try {
      resolveDb.resolveDbConfig({ label: 't', env: { PG_HOST: '127.0.0.1' } });
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).toMatch(/Partial discrete config found \(PG_HOST\)/);
    expect(msg).toMatch(/still missing: PG_PORT, PG_DATABASE/);
  });

  it('an empty-string env var is NOT a target', () => {
    expect(() => resolveDb.resolveDbConfig({ label: 't', env: { DATABASE_URL: '   ' } })).toThrow(
      /no explicit database target/,
    );
  });

  // The accept side — without it, "throws" could just mean "always throws".
  it('ACCEPTS an explicit DATABASE_URL, and redacts the password when describing it', () => {
    const r = resolveDb.resolveDbConfig({
      label: 't',
      env: { DATABASE_URL: 'postgresql://postgres:hunter2@127.0.0.1:54322/postgres' },
    });
    expect(r.source).toBe('env:DATABASE_URL');
    expect(r.description).toContain('***');
    expect(r.description).not.toContain('hunter2');
  });

  it('ACCEPTS a COMPLETE discrete PG_* triple', () => {
    const r = resolveDb.resolveDbConfig({
      label: 't',
      env: { PG_HOST: '127.0.0.1', PG_PORT: '54322', PG_DATABASE: 'postgres' },
    });
    expect(r.source).toBe('env:PG_*');
    expect(r.description).toBe('127.0.0.1:54322/postgres');
  });

  it('DATABASE_URL wins over PG_* (preserves migrate.js precedence, Spec 113 §3 D14)', () => {
    const r = resolveDb.resolveDbConfig({
      label: 't',
      env: {
        DATABASE_URL: 'postgresql://postgres:p@127.0.0.1:54322/postgres',
        PG_HOST: 'localhost',
        PG_PORT: '5432',
        PG_DATABASE: 'buildo',
      },
    });
    expect(r.source).toBe('env:DATABASE_URL');
  });

  it('dev: a missing PG_PASSWORD keeps the local-stack convenience default', () => {
    // FENCE, carried from the ~20 converted sites (each spelled
    // `PG_PASSWORD || 'postgres'`) and from pipeline.js#createPool. 'postgres'
    // is the local stack's ACTUAL password (docker-compose pins
    // `POSTGRES_PASSWORD:-postgres`), so yielding `undefined` here would break
    // every zero-PG_PASSWORD local invocation.
    const r = resolveDb.resolveDbConfig({
      label: 't',
      env: { PG_HOST: '127.0.0.1', PG_PORT: '54322', PG_DATABASE: 'postgres' },
    });
    expect(r.poolConfig.password).toBe('postgres');
  });

  it('an explicit PG_PASSWORD still wins over the dev default', () => {
    const r = resolveDb.resolveDbConfig({
      label: 't',
      env: { PG_HOST: 'h', PG_PORT: '5432', PG_DATABASE: 'd', PG_PASSWORD: 's3cret' },
    });
    expect(r.poolConfig.password).toBe('s3cret');
  });

  it('production/staging: a missing PG_PASSWORD THROWS (WF3 B3-H5, mirrored from pipeline.js)', () => {
    // pipeline.js:118-127 (cedf6dd1) throws here so a misconfigured prod DB
    // fails loudly instead of silently connecting as the default dev user.
    // The resolver is where createPool's discrete path is heading, so the
    // guard must live here too or it evaporates fleet-wide at that follow-up.
    for (const NODE_ENV of ['production', 'staging']) {
      expect(() =>
        resolveDb.resolveDbConfig({
          label: 't',
          env: { PG_HOST: 'h', PG_PORT: '5432', PG_DATABASE: 'd', NODE_ENV },
        }),
      ).toThrow(/PG_PASSWORD env var is required in production\/staging/);
    }
  });

  it('production WITH PG_PASSWORD resolves normally — the guard is about absence, not env', () => {
    const r = resolveDb.resolveDbConfig({
      label: 't',
      env: {
        PG_HOST: 'h',
        PG_PORT: '5432',
        PG_DATABASE: 'd',
        PG_PASSWORD: 'real',
        NODE_ENV: 'production',
      },
    });
    expect(r.poolConfig.password).toBe('real');
  });

  it('refuses a non-numeric PG_PORT rather than coercing it', () => {
    expect(() =>
      resolveDb.resolveDbConfig({
        label: 't',
        env: { PG_HOST: 'h', PG_PORT: 'abc', PG_DATABASE: 'd' },
      }),
    ).toThrow(/PG_PORT must be a valid port number/);
  });
});

describe('(a) end-to-end: a real node process REFUSES and exits non-zero with no target', () => {
  it('createResolvedPool in a scrubbed-env child process dies with the actionable message', () => {
    // Behavioural, not source-scan (the migration-hooks.behaviour.test.ts
    // convention): spawn the real thing and assert the exit code. A resolver
    // that throws in-process but is swallowed somewhere would still pass a
    // pure unit test.
    const script = [
      `const r = require(${JSON.stringify(join(ROOT, 'scripts', 'lib', 'resolve-db.js'))});`,
      `r.createResolvedPool({ label: 'probe' });`,
    ].join('\n');
    const env = { ...process.env };
    for (const k of ['DATABASE_URL', 'SUPABASE_DATABASE_URL', 'PG_HOST', 'PG_PORT', 'PG_DATABASE']) {
      delete env[k];
    }

    let status: number | null = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, ['-e', script], { stdio: 'pipe', env });
    } catch (err) {
      const e = err as { status?: number | null; stderr?: Buffer };
      status = e.status ?? null;
      stderr = e.stderr?.toString() ?? '';
    }

    expect(status, 'the child must exit non-zero — a silent default is the bug').toBe(1);
    expect(stderr).toContain('no explicit database target');
    expect(stderr).toContain('127.0.0.1:54322/postgres');
  });
});

describe('(b) the migration floor refuses a below-floor database', () => {
  it('REFUSES the pre-cutover DB shape (buildo, 222 migrations) at the default floor', async () => {
    await expect(
      resolveDb.assertDbTarget(stubClient({ database: 'buildo', count: 222 }), {
        label: 't',
        description: 'localhost:5432/buildo',
        logger: QUIET,
      }),
    ).rejects.toThrow(/REFUSING to run against a below-floor database/);
  });

  it('the refusal names the measured count, the floor, and the authoritative target', async () => {
    let msg = '';
    try {
      await resolveDb.assertDbTarget(stubClient({ database: 'buildo', count: 222 }), {
        label: 'audit',
        description: 'localhost:5432/buildo',
        logger: QUIET,
      });
    } catch (err) {
      msg = (err as Error).message;
    }
    expect(msg).toContain('migrations    : 222');
    expect(msg).toContain('required floor: 223');
    expect(msg).toContain('127.0.0.1:54322/postgres');
  });

  it('REFUSES a genuinely fresh DB with no schema_migrations table at all', async () => {
    await expect(
      resolveDb.assertDbTarget(stubClient({ database: 'postgres', hasTracking: false }), {
        label: 't',
        logger: QUIET,
      }),
    ).rejects.toThrow(/schema_migrations does not exist/);
  });

  // The accept side, at BOTH real depths. The cloud number is the binding
  // calibration constraint: migrations 240/242/243/244 are local-only until
  // programme stage P2, so cloud sits at 237 and MUST still pass.
  it('ACCEPTS the cloud DB depth (237) — the floor must not refuse cloud pre-P2', async () => {
    const r = await resolveDb.assertDbTarget(stubClient({ database: 'postgres', count: 237 }), {
      label: 't',
      logger: QUIET,
    });
    expect(r.migrationCount).toBe(237);
  });

  it('ACCEPTS the authoritative local DB depth (241)', async () => {
    const r = await resolveDb.assertDbTarget(stubClient({ database: 'postgres', count: 241 }), {
      label: 't',
      logger: QUIET,
    });
    expect(r.database).toBe('postgres');
  });

  it('the default floor sits in the ONLY gap that separates the three real DBs', () => {
    // 222 (pre-cutover) < floor <= 237 (cloud). Anything else is miscalibrated.
    expect(resolveDb.DEFAULT_MIN_MIGRATION).toBeGreaterThan(222);
    expect(resolveDb.DEFAULT_MIN_MIGRATION).toBeLessThanOrEqual(237);
  });

  it('a MAX-based floor would NOT have caught this — the count is load-bearing', async () => {
    // The pre-cutover DB's highest filename is '225_pin_function_search_path.sql'
    // while it holds only 222 rows (gaps). Parsing 225 out of MAX(filename) and
    // comparing to 223 would ACCEPT it. This test fails the moment someone
    // "simplifies" the probe to a MAX.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const src = fs.readFileSync(join(ROOT, 'scripts', 'lib', 'resolve-db.js'), 'utf8');
    expect(src).toContain('count(*)::int AS n FROM public.schema_migrations');
    // Strip block comments — the file's own header DOCUMENTS the MAX(filename)
    // trap in a table, which is the point; only executable code must be free of it.
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/max\(filename\)/i);
    // and behaviourally: 222 rows is refused no matter what the filenames say
    await expect(
      resolveDb.assertDbTarget(stubClient({ database: 'buildo', count: 222 }), {
        label: 't',
        logger: QUIET,
      }),
    ).rejects.toThrow();
  });

  it('an explicitly HIGHER caller floor is honoured', async () => {
    await expect(
      resolveDb.assertDbTarget(stubClient({ database: 'postgres', count: 237 }), {
        label: 't',
        minMigration: 241,
        logger: QUIET,
      }),
    ).rejects.toThrow(/required floor: 241/);
  });

  it('optional expectDatabase refuses a right-depth database with the wrong NAME', async () => {
    await expect(
      resolveDb.assertDbTarget(stubClient({ database: 'buildo', count: 300 }), {
        label: 't',
        expectDatabase: 'postgres',
        logger: QUIET,
      }),
    ).rejects.toThrow(/connected to database "buildo", expected one of "postgres"/);
  });
});

describe('the resolved target is ALWAYS logged — the silence was the defect', () => {
  it('logs database, user and migration depth on assertion', async () => {
    const lines: string[] = [];
    await resolveDb.assertDbTarget(stubClient({ database: 'postgres', count: 241 }), {
      label: 'audit',
      description: '127.0.0.1:54322/postgres',
      logger: { log: (m: string) => lines.push(m), warn: () => {} },
    });
    expect(lines.join('\n')).toMatch(
      /\[audit\] target: 127\.0\.0\.1:54322\/postgres → database=postgres user=postgres migrations=241 \(floor 223\)/,
    );
  });
});

describe('migrate.js is the ONE sanctioned floor exemption', () => {
  // WHY. migrate.js is the tool that RAISES a database over the floor. Gating
  // it on the floor deadlocks it: a fresh DB has zero migrations, the resolver
  // refuses, and the migrations that would lift it can never be applied.
  it('minMigration:null accepts a FRESH database with no schema_migrations table', async () => {
    const r = await resolveDb.assertDbTarget(
      stubClient({ database: 'postgres', hasTracking: false }),
      { label: 'migrate', minMigration: null, logger: QUIET },
    );
    expect(r.migrationCount).toBe(0);
    expect(r.hasTracking).toBe(false);
  });

  it('minMigration:null accepts a below-floor database (the pre-cutover depth)', async () => {
    const r = await resolveDb.assertDbTarget(stubClient({ database: 'buildo', count: 222 }), {
      label: 'migrate',
      minMigration: null,
      logger: QUIET,
    });
    expect(r.migrationCount).toBe(222);
  });

  it('exempt still means LOUD — the target is logged and marked [floor exempt]', async () => {
    const lines: string[] = [];
    await resolveDb.assertDbTarget(stubClient({ database: 'postgres', hasTracking: false }), {
      label: 'migrate',
      description: '127.0.0.1:54322/postgres',
      minMigration: null,
      logger: { log: (m: string) => lines.push(m), warn: () => {} },
    });
    expect(lines.join('\n')).toContain('[floor exempt]');
    expect(lines.join('\n')).toContain('database=postgres');
  });

  it('the exemption is an EXPLICIT null sentinel — omitting the option cannot disable the floor', async () => {
    // `undefined` (option not passed) must fall back to the default floor, not
    // to "no floor". A falsy check instead of an === null check would silently
    // exempt every caller that forgot the option.
    await expect(
      resolveDb.assertDbTarget(stubClient({ database: 'buildo', count: 222 }), {
        label: 't',
        minMigration: undefined,
        logger: QUIET,
      }),
    ).rejects.toThrow(/below-floor/);
    // and 0 is a real floor of zero, not the exemption sentinel
    await expect(
      resolveDb.assertDbTarget(stubClient({ database: 'x', count: 0, hasTracking: false }), {
        label: 't',
        minMigration: 0,
        logger: QUIET,
      }),
    ).resolves.toBeTruthy();
  });

  it('scripts/migrate.js is the only file in scripts/ that passes minMigration: null', () => {
    // Was a raw `git grep 'minMigration: null'`, which read DOCUMENTATION as a
    // call site: resolve-db.js's own header explains the exemption at length,
    // so once it became a TRACKED file the grep returned two paths and this
    // lock went red. It now scans comment-stripped CODE of every tracked
    // script — prose about the sentinel is free, passing it is not.
    expect(floorExemptionCallSites()).toEqual(['scripts/migrate.js']);
  });

  it('the resolver DOCUMENTS the exemption without counting as a call site', () => {
    // The complement — proves the fix discriminates rather than just excluding
    // resolve-db.js by name. The explanation must survive; the call must not.
    const raw = readFileSync(join(ROOT, 'scripts', 'lib', 'resolve-db.js'), 'utf8');
    expect(raw).toMatch(/minMigration: null/); // documented in the header
    expect(floorExemptionCallSites()).not.toContain('scripts/lib/resolve-db.js');
  });
});
