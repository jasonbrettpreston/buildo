'use strict';
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md
//
// Observer archetype (spec 30 §2.1) — reads pipeline_runs + pg_stat_statements only,
// no business table mutations. Spawned as a detached child by run-chain.js after the
// chain lock is released. Calls DeepSeek API (deepseek-chat) to surface warnings/failures
// vs baseline and appends findings to docs/reports/pipeline-observability/{chainId}-followup.md.

require('dotenv').config();
const pipeline = require('./lib/pipeline');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

// Lock ID 113 assigned sequentially per §A.5 Bundle G (governing spec is 48; no spec 113 exists).
// Changed from 112 → 113 in B1 fix to resolve collision with backup-db.js (ID 112).
// Effective per-chain lock = ADVISORY_LOCK_ID * 100 + chainOffset, allowing
// permits/coa/sources observations to run concurrently (see G2 fix below).
const ADVISORY_LOCK_ID = 113;
const REPORT_DIR = path.resolve(__dirname, '../docs/reports/pipeline-observability');
const MAX_HISTORY_DAYS = 7;
const API_TIMEOUT_MS = 30_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d) {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function secStr(ms) {
  return ms != null ? (ms / 1000).toFixed(1) + 's' : '—';
}

function verdictIcon(v) {
  return v === 'PASS' ? '✅' : v === 'WARN' ? '⚠️' : v === 'FAIL' ? '❌' : '—';
}

/**
 * Escape Markdown special characters in a table cell value.
 * Covers the full set that renders in CommonMark: \ ` * _ { } [ ] ( ) # + - . ! |
 */
function escapeMd(str) {
  return str.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
}

/**
 * Escape PostgreSQL LIKE wildcards using '!' as escape character.
 * chainId may contain '_' (allowed by /^[a-zA-Z0-9_-]+$/) which is a LIKE single-char wildcard.
 * Pair with ESCAPE '!' in SQL: WHERE pipeline LIKE $1 ESCAPE '!'
 */
function escapeLike(s) {
  return s.replace(/[!%_]/g, '!$&');
}

/**
 * Compute a chain-scoped advisory lock ID (G2 fix).
 * Different chains (permits, coa, sources) get distinct lock IDs so their
 * observe-chain processes can run concurrently without dropping observations.
 * The base ADVISORY_LOCK_ID (113) * 100 + chainOffset keeps IDs in the 11300–11399 range,
 * outside all script lock IDs (1–113) registered in §A.5.
 */
function chainScopedLockId(id) {
  const knownOffsets = { permits: 0, coa: 1, sources: 2, entities: 3, wsib: 4, deep_scrapes: 5 };
  if (Object.prototype.hasOwnProperty.call(knownOffsets, id)) {
    return ADVISORY_LOCK_ID * 100 + knownOffsets[id];
  }
  // Unknown chain: deterministic hash into [6, 93] so it stays in the 11300–11399 range
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return ADVISORY_LOCK_ID * 100 + (Math.abs(h) % 88) + 6;
}

/**
 * Pull WARN/FAIL rows from an audit_table stored in records_meta.
 */
function extractIssues(records_meta) {
  const rows = records_meta?.audit_table?.rows ?? [];
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r.status === 'WARN' || r.status === 'FAIL');
}

// ─── Main ───────────────────────────────────────────────────────────────────

pipeline.run('observe-chain', async (pool) => {
  const [chainId, runIdStr] = process.argv.slice(2);
  if (!chainId || !runIdStr) {
    pipeline.log.warn('[observe-chain]', 'Missing chain_id or run_id args — nothing to observe');
    pipeline.emitSummary({ records_total: 0, records_new: null, records_updated: null });
    return;
  }
  const SAFE_CHAIN_ID_RX = /^[a-zA-Z0-9_-]+$/;
  if (!SAFE_CHAIN_ID_RX.test(chainId)) {
    pipeline.log.warn('[observe-chain]', `Invalid chainId format (must be alphanumeric/-/_): ${chainId}`);
    pipeline.emitSummary({ records_total: 0, records_new: null, records_updated: null });
    return;
  }
  const runId = parseInt(runIdStr, 10);
  if (!Number.isFinite(runId)) {
    pipeline.log.warn('[observe-chain]', `Invalid run_id: ${runIdStr}`);
    pipeline.emitSummary({ records_total: 0, records_new: null, records_updated: null });
    return;
  }

  const startMs = Date.now();
  // Escape LIKE wildcards — chainId may contain '_' (SQL single-char wildcard).
  // Without escaping, 'permits_ca' would match 'permitsXca:step' via LIKE 'permits_ca:%'.
  const LIKE_PREFIX = escapeLike(chainId) + ':%';
  // Per-chain report file — prevents concurrent chain observers (G2 fix) from interleaving
  // writes on a previously shared single report file.
  const reportPath = path.join(REPORT_DIR, `${chainId}-followup.md`);

  // G2: chain-scoped lock — different chains acquire different effective IDs so
  // permits + coa observations can run concurrently (see chainScopedLockId above).
  const effectiveLockId = chainScopedLockId(chainId);

  // pipeline.withAdvisoryLock handles: xact-scoped lock, SIGKILL safety, skip emit.
  // Pass skipEmit: false so we control the null-pattern summary ourselves (spec 48 §3.5).
  const lockResult = await pipeline.withAdvisoryLock(pool, effectiveLockId, async () => {

    // ── 1. Fetch chain-level run row ──────────────────────────────────────────
    const chainRowRes = await pool.query(
      `SELECT id, pipeline, status, started_at, completed_at, duration_ms,
              records_total, records_new, records_updated, records_meta
       FROM pipeline_runs
       WHERE id = $1`,
      [runId],
    );
    if (chainRowRes.rows.length === 0) {
      pipeline.log.warn('[observe-chain]', `No pipeline_runs row found for id=${runId}`);
      pipeline.emitSummary({ records_total: 0, records_new: null, records_updated: null });
      return;
    }
    const chainRow = chainRowRes.rows[0];

    if (!chainRow.started_at) {
      pipeline.log.warn('[observe-chain]', `chain row id=${runId} has NULL started_at — skipping step analysis`);
      pipeline.emitSummary({ records_total: 0, records_new: null, records_updated: null });
      return;
    }

    // ── 2. Fetch step-level rows for this run ─────────────────────────────────
    // Upper bound (completed_at or NOW()) prevents cross-run contamination when
    // two chains overlap and share the same pipeline LIKE prefix.
    const stepRowsRes = await pool.query(
      `SELECT pipeline, status, started_at, completed_at, duration_ms,
              records_total, records_new, records_updated, records_meta
       FROM pipeline_runs
       WHERE pipeline LIKE $1 ESCAPE '!'
         AND started_at >= $2
         AND started_at <= COALESCE($3::timestamptz, $4::timestamptz)
       ORDER BY started_at ASC`,
      [LIKE_PREFIX, chainRow.started_at, chainRow.completed_at, new Date(startMs).toISOString()],
    );
    const stepRows = stepRowsRes.rows;

    // ── 3. Fetch 7-day historical baselines per step slug ─────────────────────
    const cutoff = new Date(Date.now() - MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const histRes = await pool.query(
      `SELECT pipeline, AVG(duration_ms) AS avg_duration_ms,
              AVG(records_total) AS avg_records_total,
              COUNT(*) AS run_count
       FROM pipeline_runs
       WHERE pipeline LIKE $1 ESCAPE '!'
         AND started_at >= $2
         AND id < $3
         AND status = 'completed'
       GROUP BY pipeline`,
      [LIKE_PREFIX, cutoff, runId],
    );
    const baseline = {};
    for (const r of histRes.rows) {
      const parsedDuration = parseFloat(r.avg_duration_ms);
      const parsedRecords = parseFloat(r.avg_records_total);
      baseline[r.pipeline] = {
        avg_duration_ms: Number.isFinite(parsedDuration) ? parsedDuration : null,
        avg_records_total: Number.isFinite(parsedRecords) ? parsedRecords : null,
        run_count: parseInt(r.run_count, 10),
      };
    }

    // ── 3.5. Fetch top 10 slow queries from pg_stat_statements (optional) ───────
    let slowQueries = null;
    try {
      const slowRes = await pool.query(
        `SELECT LEFT(query, 200) AS query_snippet, calls,
                ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
                ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
                ROUND(stddev_exec_time::numeric, 2) AS stddev_exec_time_ms, rows
         FROM pg_stat_statements
         WHERE query NOT ILIKE '%pg_stat_statements%' AND mean_exec_time > 0
         ORDER BY mean_exec_time DESC LIMIT 10`,
      );
      slowQueries = slowRes.rows;
    } catch (pgssErr) {
      pipeline.log.warn('[observe-chain]', 'pg_stat_statements unavailable — skipping slow query analysis', {
        err: pgssErr instanceof Error ? pgssErr.message : String(pgssErr),
      });
    }

    // ── 4. Build context for DeepSeek ────────────────────────────────────────
    const stepSummaries = stepRows.map((s) => {
      const slug = s.pipeline.replace(`${chainId}:`, '');
      const issues = extractIssues(s.records_meta);
      const b = baseline[s.pipeline];
      const durationDelta = b?.avg_duration_ms != null && s.duration_ms != null
        ? b.avg_duration_ms === 0
          ? (s.duration_ms > 0 ? '+∞%' : '0.0%')
          : (((s.duration_ms - b.avg_duration_ms) / b.avg_duration_ms) * 100).toFixed(1) + '%'
        : 'no baseline';
      return {
        step: slug,
        status: s.status,
        verdict: s.records_meta?.audit_table?.verdict ?? '—',
        duration_ms: s.duration_ms,
        records_total: s.records_total,
        issues,
        failed_sample: s.records_meta?.failed_sample ?? [],
        vs_baseline: { duration_delta: durationDelta, baseline_runs: b?.run_count ?? 0 },
      };
    });

    const contextJson = JSON.stringify({
      chain: chainId,
      run_id: runId,
      chain_status: chainRow.status,
      chain_duration_ms: chainRow.duration_ms,
      started_at: chainRow.started_at,
      steps: stepSummaries,
      slow_queries: slowQueries,
    }, null, 2);

    const systemPrompt = `You are a pipeline health analyst for the Buildo permit-data pipeline.
You receive structured run data, 7-day baselines, and optional slow query statistics. Your job:
1. Identify FAIL and WARN metrics that matter — skip routine INFO
2. Flag velocity drops >30% vs baseline as anomalies
3. Flag slow queries with mean_exec_time_ms >100ms as performance risks
4. Classify each issue: CRITICAL (data integrity risk, requires WF3) or HIGH or INFO
5. For CRITICAL issues, write a one-line WF3 prompt: "WF3 [concise description of bug to fix]"
6. If chain is healthy, say so in one sentence

Be concise. Developers read this at 9am — no padding.`;

    const userPrompt = `Pipeline run data:\n\`\`\`json\n${contextJson}\n\`\`\`\n\nProvide your analysis in this exact Markdown structure:

### Summary
[1-2 sentences]

### Anomalies & Warnings
[bullet list, or "None detected"]

### Critical Issues — WF3 Prompts
["> **WF3** ..." for each CRITICAL, or "None"]`;

    // ── 5. Call DeepSeek API ──────────────────────────────────────────────────
    let analysisText = '_AI analysis unavailable — API call skipped or failed._';
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) {
      pipeline.log.warn('[observe-chain]', 'DEEPSEEK_API_KEY absent — AI analysis placeholder written');
    } else {
      try {
        const client = new OpenAI({
          apiKey: deepseekKey,
          baseURL: 'https://api.deepseek.com',
          timeout: API_TIMEOUT_MS,
        });
        const response = await client.chat.completions.create({
          model: 'deepseek-chat',
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });
        analysisText = response.choices[0]?.message?.content ?? analysisText;
      } catch (apiErr) {
        pipeline.log.warn('[observe-chain]', 'DeepSeek API call failed — writing placeholder', {
          err: apiErr instanceof Error ? apiErr.message : String(apiErr),
        });
      }
    }

    // ── 6. Build step verdict table ───────────────────────────────────────────
    const tableRows = stepSummaries.map((s) => {
      const b = baseline[`${chainId}:${s.step}`];
      const deltaStr = b?.avg_duration_ms != null && s.duration_ms != null
        ? s.vs_baseline.duration_delta
        : 'no baseline';
      const safeStep = escapeMd(s.step);
      return `| ${safeStep} | ${verdictIcon(s.verdict)} ${s.verdict} | ${secStr(s.duration_ms)} | ${s.records_total ?? '—'} | ${deltaStr} |`;
    }).join('\n');

    // ── 7. Append to per-chain report file ───────────────────────────────────
    // One file per chain (e.g. permits-followup.md) so concurrent observers
    // after the G2 lock-scoping fix cannot interleave writes on a shared file.
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const section = `\n## ${chainId} — ${formatDate(chainRow.started_at)}  (run_id: ${runId})\n
**Chain status:** ${chainRow.status} | **Duration:** ${secStr(chainRow.duration_ms)}\n
### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
${tableRows}

${analysisText}

---\n`;

    fs.appendFileSync(reportPath, section, 'utf8');
    pipeline.log.info('[observe-chain]', `Report appended to ${reportPath}`);

    pipeline.emitMeta(
      { pipeline_runs: ['id', 'verdict', 'started_at', 'completed_at', 'pipeline', 'records_meta'] },
      {},
    );

    pipeline.emitSummary({
      records_total: 0,
      records_new: null,
      records_updated: null,
      records_meta: {
        audit_table: {
          phase: 0,
          name: 'Observability Agent',
          verdict: 'PASS',
          rows: [
            { metric: 'chain_id', value: chainId, threshold: null, status: 'INFO' },
            { metric: 'steps_analysed', value: stepSummaries.length, threshold: null, status: 'INFO' },
            { metric: 'sys_duration_ms', value: Date.now() - startMs, threshold: null, status: 'INFO' },
          ],
        },
      },
    });

  }, { skipEmit: false });

  if (!lockResult.acquired) {
    pipeline.log.info('[observe-chain]', `Advisory lock held for chain ${chainId} (lock ${effectiveLockId}) — skipping this run`);
    pipeline.emitSummary({
      records_total: 0,
      records_new: null,
      records_updated: null,
      records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere' },
    });
  }
});
