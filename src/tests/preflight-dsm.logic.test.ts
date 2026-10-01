// SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md §4.1a
// WF3 2026-09-30 — sys_dsm_capacity: local Supabase DB with dynamic_shared_memory_type=posix
// crashed link_parcel_addresses ("could not resize shared memory segment ... No space left on device").
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildDsmCapacityRow,
  findBlockingPreflightRow,
  readSupabaseDbPort,
  resolveDsmTarget,
  DSM_FIX_COMMAND,
} = require('../../scripts/lib/preflight-dsm.js');

const REPO_ROOT = path.resolve(__dirname, '../..');

/** The bloat FAIL row Phase 0 emits and which — per §4.1a — must stay warn-only. */
const bloatFailRow = {
  metric: 'sys_db_bloat_parcels',
  value: '70.0%',
  threshold: '< 50% (warn)',
  status: 'FAIL',
};

/** The row produced for the crashing configuration: local Supabase DB, posix DSM. */
const case1Row = buildDsmCapacityRow({
  dsmType: 'posix',
  isLocal: true,
  port: 54322,
  supabasePort: 54322,
});

/** The benign configuration: local Supabase DB, mmap DSM. */
const case2Row = buildDsmCapacityRow({
  dsmType: 'mmap',
  isLocal: true,
  port: 54322,
  supabasePort: 54322,
});

describe('buildDsmCapacityRow', () => {
  it('FAILs a local Supabase DB running posix DSM and names the exact remediation', () => {
    expect(case1Row.status).toBe('FAIL');
    expect(case1Row.metric).toBe('sys_dsm_capacity');
    expect(case1Row.value).toBe('posix');
    expect(String(case1Row.message)).toContain(DSM_FIX_COMMAND);
  });

  it('DSM_FIX_COMMAND is a runnable ALTER SYSTEM on the Buildo Supabase container', () => {
    expect(DSM_FIX_COMMAND).toContain("ALTER SYSTEM SET dynamic_shared_memory_type = 'mmap'");
    expect(DSM_FIX_COMMAND).toContain('supabase_db_Buildo');
  });

  it('PASSes a local Supabase DB already on mmap', () => {
    expect(case2Row.status).toBe('PASS');
  });

  it('INFOs a remote database (DSM type is not ours to assert)', () => {
    const row = buildDsmCapacityRow({
      dsmType: 'posix',
      isLocal: false,
      port: 5432,
      supabasePort: 54322,
    });
    expect(row.status).toBe('INFO');
    expect(String(row.threshold)).toContain('UNVERIFIED');
  });

  it('WARNs a local posix DB that is NOT on the Supabase port (visible, never blocking)', () => {
    const row = buildDsmCapacityRow({
      dsmType: 'posix',
      isLocal: true,
      port: 5432,
      supabasePort: 54322,
    });
    expect(row.status).toBe('WARN');
  });

  it('WARNs with value "unreadable" when SHOW dynamic_shared_memory_type failed', () => {
    const row = buildDsmCapacityRow({
      dsmType: null,
      isLocal: true,
      port: 54322,
      supabasePort: 54322,
    });
    expect(row.status).toBe('WARN');
    expect(row.value).toBe('unreadable');
  });
});

describe('findBlockingPreflightRow', () => {
  it('returns the DSM FAIL row even when a bloat FAIL row precedes it', () => {
    expect(findBlockingPreflightRow([bloatFailRow, case1Row])).toBe(case1Row);
  });

  it('returns null when the only FAIL row is bloat (warn-only, §4.1a)', () => {
    expect(findBlockingPreflightRow([bloatFailRow, case2Row])).toBeNull();
  });

  it('returns null for an empty pre-flight', () => {
    expect(findBlockingPreflightRow([])).toBeNull();
  });
});

describe('readSupabaseDbPort', () => {
  it('reads the [db] port and ignores the [api] port', () => {
    const text = '[api]\nport = 54321\n\n[db]\n# c\nport = 54322\nshadow_port = 54320\n';
    expect(readSupabaseDbPort(text)).toBe(54322);
  });

  it('returns null when there is no [db] section', () => {
    expect(readSupabaseDbPort('[api]\nport = 1\n')).toBeNull();
  });

  it('reads the real supabase/config.toml from the repo root', () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'config.toml'), 'utf8');
    expect(readSupabaseDbPort(text)).toBe(54322);
  });
});

describe('resolveDsmTarget', () => {
  it('resolves a local SUPABASE_DATABASE_URL to its host and port', () => {
    expect(
      resolveDsmTarget({
        SUPABASE_DATABASE_URL: 'postgresql://u:p@127.0.0.1:54322/postgres',
      }),
    ).toMatchObject({ isLocal: true, port: 54322 });
  });

  it('falls back to PG_HOST/PG_PORT when SUPABASE_DATABASE_URL is absent', () => {
    expect(resolveDsmTarget({ PG_HOST: 'localhost', PG_PORT: '5432' })).toMatchObject({
      isLocal: true,
      port: 5432,
    });
  });

  it('marks a hosted Supabase host as remote', () => {
    const target = resolveDsmTarget({
      SUPABASE_DATABASE_URL: 'postgresql://u:p@db.example.supabase.co:5432/postgres',
    });
    expect(target).toMatchObject({ isLocal: false });
  });
});

describe('run-chain source lock (§4.1a wiring)', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'run-chain.js'), 'utf8');

  it('wires the DSM row into Phase 0', () => {
    expect(source).toContain('buildDsmCapacityRow(');
    expect(source).toContain('findBlockingPreflightRow(');
    expect(source).toContain('SHOW dynamic_shared_memory_type');
  });
});
