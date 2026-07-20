/**
 * Shared chain-concurrency query helper — the SINGLE source of the
 * `isChainRunning` "exact query" Spec 113 §8.3 / G8 requires to stay
 * byte-identical across every caller. `scripts/check-chain-running.js`
 * (GitHub Actions guard step) and the demoted `scripts/local-cron.js` (dev
 * convenience) BOTH import this rather than maintaining independent copies
 * of the query — substituting a different concurrency primitive in only one
 * caller would silently change the correctness guarantee the other still
 * relies on (Spec 115 §7 item 2).
 *
 * Two queries, both against `pipeline_runs`:
 *   - `isChainRunning`      — the blocking check (12h TTL window)
 *   - `findStaleRunningRow` — the companion, non-blocking "row aged past the
 *                             TTL but never got a terminal status" check
 *                             (Spec 115 §4 item 5's stale-row alert)
 *
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §8.3
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §4
 */
'use strict';

/**
 * Is `chain_${chainId}` currently "running" per the 12h TTL contract?
 *
 * MUST reproduce the exact query Spec 113 §8.3 pins — a crashed run older
 * than 12h simply stops matching (self-expiry), no separate cleanup step.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {string} chainId - bare chain id (e.g. 'coa', 'permits') — NOT pre-prefixed with `chain_`
 * @returns {Promise<{ running: boolean, row: {id: number, started_at: string}|null }>}
 */
async function isChainRunning(pool, chainId) {
  const chainSlug = `chain_${chainId}`;
  const res = await pool.query(
    `SELECT id, started_at FROM pipeline_runs
      WHERE pipeline = $1 AND status = 'running'
        AND started_at > NOW() - INTERVAL '12 hours'
      LIMIT 1`,
    [chainSlug]
  );
  return { running: res.rows.length > 0, row: res.rows[0] || null };
}

/**
 * Stale-row companion query (Spec 115 §4 item 5) — finds a `running` row
 * whose `started_at` is beyond the 12h TTL and therefore no longer blocks
 * new runs (correctness-harmless), but whose status is a dashboard lie
 * until something notices and surfaces it.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {string} chainId - bare chain id, same convention as isChainRunning
 * @returns {Promise<{id: number, started_at: string}|null>}
 */
async function findStaleRunningRow(pool, chainId) {
  const chainSlug = `chain_${chainId}`;
  const res = await pool.query(
    `SELECT id, started_at FROM pipeline_runs
      WHERE pipeline = $1 AND status = 'running'
        AND started_at <= NOW() - INTERVAL '12 hours'
      LIMIT 1`,
    [chainSlug]
  );
  return res.rows[0] || null;
}

module.exports = { isChainRunning, findStaleRunningRow };
