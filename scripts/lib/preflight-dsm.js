/**
 * SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md §4.1a
 *
 * Why: the local Supabase DB container (`supabase_db_Buildo`) runs with a
 * 64 MB `/dev/shm`; `dynamic_shared_memory_type=posix` places parallel-query
 * DSM there, so a large parallel query dies with "could not resize shared
 * memory segment ... No space left on device" — measured 2026-09-30 on
 * link_parcel_addresses.
 *
 * The fix is `mmap`, which puts DSM files under PGDATA (real disk) instead of
 * the tiny `/dev/shm` tmpfs. `DSM_FIX_COMMAND` below is the exact, runnable
 * remediation.
 *
 * This module is PURE: it never opens a DB connection and never reads
 * `process.env` itself — every environment value arrives through a function
 * argument. That keeps it trivially unit-testable and side-effect-free; the
 * Phase-0 preflight in `scripts/run-chain.js` (wired by a later brief) does
 * the I/O and feeds the pure row builders here.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { LOOPBACK_HOSTS } = require('./ssl-config');

/** The metrics name emitted into the Phase-0 preflight rows. */
const DSM_METRIC = 'sys_dsm_capacity';

/**
 * The exact remediation for the crashing configuration: flip the local
 * Supabase DB container to `mmap` DSM and restart it so the setting takes
 * effect. Run as `ALTER SYSTEM` (not per-session) so every future connection
 * — including parallel workers — inherits it.
 */
const DSM_FIX_COMMAND =
  `docker exec supabase_db_Buildo psql -U supabase_admin -d postgres -c "ALTER SYSTEM SET dynamic_shared_memory_type = 'mmap'" && docker restart supabase_db_Buildo`;

/**
 * The ONLY Phase-0 metrics whose `FAIL` refuses the chain (Spec 30 §4.1a).
 * Bloat rows deliberately stay warn-only — they are emitted with a `FAIL`
 * status for visibility, but `findBlockingPreflightRow` never blocks on them.
 */
const BLOCKING_PREFLIGHT_METRICS = new Set([DSM_METRIC]);

const THRESHOLD_UNREADABLE = 'SHOW dynamic_shared_memory_type failed';
const THRESHOLD_REMOTE = 'remote target: /dev/shm capacity UNVERIFIED (recorded only)';
const THRESHOLD_NOT_POSIX = 'local: != posix';
const THRESHOLD_NON_SUPABASE = 'local non-Supabase target: posix DSM, /dev/shm size unmeasured';

/**
 * Build the `sys_dsm_capacity` preflight row for one target.
 *
 * Rule order is load-bearing (first match wins):
 *   1. unreadable DSM type           -> WARN  (can't assert anything)
 *   2. remote target                 -> INFO  (recorded, not ours to assert)
 *   3. local, DSM type != posix      -> PASS  (mmap etc. — /dev/shm not used)
 *   4. local, posix, Supabase port   -> FAIL  (the crash class; names the fix)
 *   5. local, posix, other port      -> WARN  (visible, never blocking)
 *
 * @param {{dsmType?: string|null, isLocal?: boolean, port?: number|string|null, supabasePort?: number|string|null}} opts
 * @returns {{metric: string, value: string, threshold: string, status: 'PASS'|'INFO'|'WARN'|'FAIL', message?: string}}
 */
function buildDsmCapacityRow(opts) {
  const o = opts || {};
  const { dsmType, isLocal, port, supabasePort } = o;
  const metric = DSM_METRIC;

  // 1. The SHOW query itself failed — report it, never block on it.
  if (dsmType === null || dsmType === undefined || dsmType === '') {
    return {
      metric,
      value: 'unreadable',
      threshold: THRESHOLD_UNREADABLE,
      status: 'WARN',
    };
  }

  // 2. Remote target: we have no visibility into (or ownership of) its
  //    /dev/shm sizing, so record the type and move on.
  if (!isLocal) {
    return {
      metric,
      value: String(dsmType),
      threshold: THRESHOLD_REMOTE,
      status: 'INFO',
    };
  }

  // 3. Local and NOT posix (mmap is the healthy setting) — nothing to fix.
  if (dsmType !== 'posix') {
    return {
      metric,
      value: String(dsmType),
      threshold: THRESHOLD_NOT_POSIX,
      status: 'PASS',
    };
  }

  // 4. Local Supabase DB on posix DSM — the measured crash configuration.
  if (supabasePort !== null && supabasePort !== undefined && Number(port) === Number(supabasePort)) {
    return {
      metric,
      value: String(dsmType),
      threshold: `local Supabase (:${supabasePort}, 64 MB /dev/shm): != posix`,
      status: 'FAIL',
      message:
        `Local Supabase DB runs posix dynamic shared memory, so parallel queries size DSM ` +
        `against the container's 64 MB /dev/shm and die with "could not resize shared memory ` +
        `segment ... No space left on device". Fix: ${DSM_FIX_COMMAND} See docs/runbook/README.md §3d.`,
    };
  }

  // 5. Local posix but on some other port (e.g. a CI/test container) — flag it
  //    for a human, but never refuse the chain.
  return {
    metric,
    value: String(dsmType),
    threshold: THRESHOLD_NON_SUPABASE,
    status: 'WARN',
  };
}

/**
 * Return the first blocking preflight row, or `null` when none blocks.
 *
 * Row-derived by design: there is no separate "blocked" boolean to drift out
 * of sync with the rows themselves. Only `BLOCKING_PREFLIGHT_METRICS` can
 * block; a bloat `FAIL` yields `null` (Spec 30 §4.1a warn-only).
 *
 * @param {Array<{metric: string, status: string}>} [rows]
 * @returns {object|null}
 */
function findBlockingPreflightRow(rows) {
  for (const row of rows || []) {
    if (row && BLOCKING_PREFLIGHT_METRICS.has(row.metric) && row.status === 'FAIL') {
      return row;
    }
  }
  return null;
}

/**
 * Extract the `port = N` value from the `[db]` table of a Supabase
 * `config.toml`. Only lines AFTER an exact `[db]` header and BEFORE the next
 * `[...]` header are considered, so the `[api]` port and the `shadow_port`
 * under `[db]` are both ignored.
 *
 * @param {string} text - full config.toml contents
 * @returns {number|null}
 */
function readSupabaseDbPort(text) {
  if (typeof text !== 'string') return null;
  let inDb = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '[db]') {
      inDb = true;
      continue;
    }
    // Any new table header ends the [db] section.
    if (line.startsWith('[')) {
      inDb = false;
      continue;
    }
    if (!inDb) continue;
    // `shadow_port = 54320` must not match: require the key be exactly `port`.
    const m = /^port\s*=\s*(\d+)\s*$/.exec(line);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/**
 * Read the local Supabase DB port from `<repoRoot>/supabase/config.toml`.
 * Any read error degrades to `null` (the port is a hint, not a gate).
 *
 * @param {string} repoRoot
 * @returns {number|null}
 */
function loadSupabaseDbPort(repoRoot) {
  try {
    const text = fs.readFileSync(path.join(repoRoot, 'supabase', 'config.toml'), 'utf8');
    return readSupabaseDbPort(text);
  } catch {
    // Missing/unreadable config.toml just means "port unknown" — the DSM row
    // then falls through to the non-Supabase WARN branch. Never fatal.
    return null;
  }
}

/**
 * Resolve the preflight DB target from an env-like object.
 *
 * Mirrors `createPool` in `scripts/lib/pipeline.js` (Spec 113 §3 / D14):
 * discrete `PG_HOST` wins; only when it is unset do we fall back to
 * `SUPABASE_DATABASE_URL`, whose host/port are parsed from the URL.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {{isLocal: boolean, host: string|undefined, port: number}}
 */
function resolveDsmTarget(env) {
  const e = env || {};
  let host;
  let port;

  if (!e.PG_HOST && e.SUPABASE_DATABASE_URL) {
    try {
      const url = new URL(e.SUPABASE_DATABASE_URL);
      // URL hostnames are lowercased and IPv6 literals are bracketed; strip
      // the brackets so '::1' compares equal against LOOPBACK_HOSTS.
      host = url.hostname.replace(/^\[|\]$/g, '');
      port = Number(url.port || 5432);
    } catch {
      // Unparseable connection string: fail toward "remote / unknown" so the
      // caller never mistakes it for a verified local target.
      return { isLocal: false, host: undefined, port: NaN };
    }
  } else {
    host = e.PG_HOST;
    port = Number(e.PG_PORT);
  }

  const isLocal = LOOPBACK_HOSTS.has(String(host).toLowerCase());
  return { isLocal, host, port };
}

module.exports = {
  DSM_METRIC,
  DSM_FIX_COMMAND,
  BLOCKING_PREFLIGHT_METRICS,
  buildDsmCapacityRow,
  findBlockingPreflightRow,
  readSupabaseDbPort,
  loadSupabaseDbPort,
  resolveDsmTarget,
};
