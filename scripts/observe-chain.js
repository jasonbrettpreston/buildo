'use strict';
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md
//
// Observer archetype (spec 30 §2.1) — reads pipeline_runs only, no business
// table mutations. Spawned as a detached child by run-chain.js after the chain
// lock is released. Calls Claude API to surface warnings/failures vs baseline
// and appends findings to docs/reports/pipeline-observability/review-database-followup.md.

const pipeline = require('./lib/pipeline');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const ADVISORY_LOCK_ID = 112;
const REPORT_PATH = path.resolve(__dirname, '../docs/reports/pipeline-observability/review-database-followup.md');
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
 * Pull WARN/FAIL rows from an audit_table stored in records_meta.
 */
function extractIssues(records_meta) {
  const rows = records_meta?.audit_table?.rows ?? [];
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
  const runId = parseInt(runIdStr, 10);
  if (!Number.isFinite(runId)) {
    pipeline.log.warn('[observe-chain]', `Invalid run_id: ${runIdStr}`);
    pipeline.emitSummary({ records_total: 0, records_new: null, records_updated: null });
    return;
  }

  const startMs = Date.now();

  // pipeline.withAdvisoryLock handles: xact-scoped lock, SIGKILL safety, skip emit.
  // Pass skipEmit: false so we control the null-pattern summary ourselves (spec 48 §3.5).
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

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

    // ── 2. Fetch step-level rows for this run ─────────────────────────────────
    const stepRowsRes = await pool.query(
      `SELECT pipeline, status, started_at, completed_at, duration_ms,
              records_total, records_new, records_updated, records_meta
       FROM pipeline_runs
       WHERE pipeline LIKE $1
         AND started_at >= $2
       ORDER BY started_at ASC`,
      [`${chainId}:%`, chainRow.started_at],
    );
    const stepRows = stepRowsRes.rows;

    // ── 3. Fetch 7-day historical baselines per step slug ─────────────────────
    const cutoff = new Date(Date.now() - MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const histRes = await pool.query(
      `SELECT pipeline, AVG(duration_ms) AS avg_duration_ms,
              AVG(records_total) AS avg_records_total,
              COUNT(*) AS run_count
       FROM pipeline_runs
       WHERE pipeline LIKE $1
         AND started_at >= $2
         AND id < $3
         AND status = 'completed'
       GROUP BY pipeline`,
      [`${chainId}:%`, cutoff, runId],
    );
    const baseline = {};
    for (const r of histRes.rows) {
      baseline[r.pipeline] = {
        avg_duration_ms: parseFloat(r.avg_duration_ms) || null,
        avg_records_total: parseFloat(r.avg_records_total) || null,
        run_count: parseInt(r.run_count, 10),
      };
    }

    // ── 4. Build context for Claude ───────────────────────────────────────────
    const stepSummaries = stepRows.map((s) => {
      const slug = s.pipeline.replace(`${chainId}:`, '');
      const issues = extractIssues(s.records_meta);
      const b = baseline[s.pipeline];
      const durationDelta = b?.avg_duration_ms && s.duration_ms
        ? (((s.duration_ms - b.avg_duration_ms) / b.avg_duration_ms) * 100).toFixed(1) + '%'
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
    }, null, 2);

    const systemPrompt = `You are a pipeline health analyst for the Buildo permit-data pipeline.
You receive structured run data and 7-day baselines. Your job:
1. Identify FAIL and WARN metrics that matter — skip routine INFO
2. Flag velocity drops >30% vs baseline as anomalies
3. Classify each issue: CRITICAL (data integrity risk, requires WF3) or HIGH or INFO
4. For CRITICAL issues, write a one-line WF3 prompt: "WF3 [concise description of bug to fix]"
5. If chain is healthy, say so in one sentence

Be concise. Developers read this at 9am — no padding.`;

    const userPrompt = `Pipeline run data:\n\`\`\`json\n${contextJson}\n\`\`\`\n\nProvide your analysis in this exact Markdown structure:

### Summary
[1-2 sentences]

### Anomalies & Warnings
[bullet list, or "None detected"]

### Critical Issues — WF3 Prompts
["> **WF3** ..." for each CRITICAL, or "None"]`;

    // ── 5. Call Claude API ────────────────────────────────────────────────────
    let analysisText = '_AI analysis unavailable — API call skipped or failed._';
    try {
      const client = new Anthropic.default({ timeout: API_TIMEOUT_MS });
      const response = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      analysisText = response.content[0]?.text ?? analysisText;
    } catch (apiErr) {
      pipeline.log.warn('[observe-chain]', 'Claude API call failed — writing placeholder', {
        err: apiErr instanceof Error ? apiErr.message : String(apiErr),
      });
    }

    // ── 6. Build step verdict table ───────────────────────────────────────────
    const tableRows = stepSummaries.map((s) => {
      const b = baseline[`${chainId}:${s.step}`];
      const deltaStr = b?.avg_duration_ms && s.duration_ms
        ? s.vs_baseline.duration_delta
        : 'no baseline';
      return `| ${s.step} | ${verdictIcon(s.verdict)} ${s.verdict} | ${secStr(s.duration_ms)} | ${s.records_total ?? '—'} | ${deltaStr} |`;
    }).join('\n');

    // ── 7. Append to report file ──────────────────────────────────────────────
    const dir = path.dirname(REPORT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const section = `\n## ${chainId} — ${formatDate(chainRow.started_at)}  (run_id: ${runId})\n
**Chain status:** ${chainRow.status} | **Duration:** ${secStr(chainRow.duration_ms)}\n
### Step Verdicts
| Step | Verdict | Duration | Records | vs 7-day Baseline |
|------|---------|----------|---------|-------------------|
${tableRows}

${analysisText}

---\n`;

    fs.appendFileSync(REPORT_PATH, section, 'utf8');
    pipeline.log.info('[observe-chain]', `Report appended to ${REPORT_PATH}`);

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
    pipeline.log.info('[observe-chain]', 'Advisory lock held — skipping this run');
    pipeline.emitSummary({
      records_total: 0,
      records_new: null,
      records_updated: null,
      records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere' },
    });
  }
});
