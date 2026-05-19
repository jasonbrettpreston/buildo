#!/usr/bin/env node
/**
 * Spec 79 per-step validation runner.
 *
 * Usage:
 *   node scripts/validation/run-step.mjs <chain> <step_number>
 *
 * Examples:
 *   node scripts/validation/run-step.mjs permits 1
 *   node scripts/validation/run-step.mjs coa 2
 *
 * For each step this:
 *   1. Loads config from scripts/validation/step-config.json
 *   2. Captures pre-run snapshot (output table counts; last successful run)
 *   3. Executes the script via child_process.spawn
 *   4. Captures post-run snapshot (new pipeline_runs row; audit_table; records_meta; deltas)
 *   5. Runs C1-C9 + C11 mechanical checklist
 *   6. Runs C12 hidden-failure tripwires per the step's risk-class profile
 *   7. Emits a validation record markdown at docs/reports/pipeline-validation/<chain>/step_<NN>_<slug>.md
 *
 * Cross-ref steps (no script field) produce a stub record pointing at the canonical step.
 *
 * C10 calculation invariants are NOT run by this script — they need per-step SQL
 * pages. The runner emits a C10 placeholder section; calc-step invariants run via
 * a separate invocation (or inline in the validation record post-hoc).
 *
 * SPEC LINK: docs/specs/01-pipeline/79_pipeline_step_validation.md
 */

import { Pool } from 'pg';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const CONFIG_PATH = resolve(__dirname, 'step-config.json');
const REPORTS_DIR = resolve(REPO_ROOT, 'docs/reports/pipeline-validation');

// ─────────────────────────────────────────────────────────────────────────────
// Args + config
// ─────────────────────────────────────────────────────────────────────────────

const [, , chainArg, stepNumArg] = process.argv;
if (!chainArg || !stepNumArg) {
  console.error('Usage: node scripts/validation/run-step.mjs <chain> <step_number>');
  process.exit(2);
}

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
if (!config[chainArg]) {
  console.error(`Unknown chain: ${chainArg}. Known: permits, coa`);
  process.exit(2);
}
const stepConfig = config[chainArg][stepNumArg];
if (!stepConfig) {
  console.error(`Unknown step: ${chainArg}/${stepNumArg}`);
  process.exit(2);
}

const STEP_NUM = parseInt(stepNumArg, 10);
const STEP_NUM_PADDED = String(STEP_NUM).padStart(2, '0');
const RECORD_PATH = resolve(REPORTS_DIR, chainArg, `step_${STEP_NUM_PADDED}_${stepConfig.slug}.md`);

// ─────────────────────────────────────────────────────────────────────────────
// DB pool helper
// ─────────────────────────────────────────────────────────────────────────────

function createPool() {
  return new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
  });
}

async function q(pool, sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function tableExists(pool, table) {
  const rows = await q(pool,
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [table]);
  return rows.length > 0;
}

async function tableCount(pool, table) {
  if (!(await tableExists(pool, table))) return { ok: false, error: 'table_not_found' };
  try {
    const rows = await q(pool, `SELECT COUNT(*)::bigint AS n FROM ${table}`);
    return { ok: true, n: Number(rows[0].n) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-ref handling
// ─────────────────────────────────────────────────────────────────────────────

if (stepConfig.skip_reason) {
  // Explicit skip — write a stub recording why
  const skipContent = `# Step ${STEP_NUM_PADDED}: ${stepConfig.slug}
**Chain:** ${chainArg}
**Validated:** ${new Date().toISOString().slice(0, 10)}
**Type:** SKIPPED
**Skip reason:** ${stepConfig.skip_reason}
**Notes:** ${stepConfig.notes}

This step was deliberately skipped for this validation run. No script execution; no checklist evaluation.
`;
  mkdirSync(dirname(RECORD_PATH), { recursive: true });
  writeFileSync(RECORD_PATH, skipContent);
  console.log(`✓ Wrote skip stub: ${RECORD_PATH}`);
  process.exit(0);
}

if (!stepConfig.script) {
  // Cross-ref stub — produce a record pointing at the canonical record
  const canonicalRef = stepConfig.agent.replace('cross-ref-', '').replace('permits-', 'permits/step_');
  const stubContent = `# Step ${STEP_NUM_PADDED}: ${stepConfig.slug}
**Chain:** ${chainArg}
**Validated:** ${new Date().toISOString().slice(0, 10)}
**Type:** CROSS-REFERENCE
**Canonical record:** ../permits/step_${canonicalRef.replace('permits/step_', '').padStart(2, '0')}_*.md

This step shares its script with the permits chain step listed above. The canonical validation record covers BOTH chains' processing of this step. See the canonical record for evidence.

**Notes:** ${stepConfig.notes}
`;
  mkdirSync(dirname(RECORD_PATH), { recursive: true });
  writeFileSync(RECORD_PATH, stubContent);
  console.log(`✓ Wrote cross-ref stub: ${RECORD_PATH}`);
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main per-step procedure
// ─────────────────────────────────────────────────────────────────────────────

const pool = createPool();
const HEAD_SHA = await getHeadSha();

async function getHeadSha() {
  return new Promise((res) => {
    const p = spawn('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => res(out.trim()));
  });
}

const evidence = {
  chain: chainArg,
  step_num: STEP_NUM,
  step_num_padded: STEP_NUM_PADDED,
  slug: stepConfig.slug,
  script: stepConfig.script,
  agent: stepConfig.agent,
  risk_class: stepConfig.risk_class,
  notes: stepConfig.notes,
  head_sha: HEAD_SHA,
  validated_at: new Date().toISOString(),
};

// ── Pre-snapshot ────────────────────────────────────────────────────────────
console.error(`[run-step] Pre-snapshot for ${chainArg}/${STEP_NUM_PADDED} ${stepConfig.slug}`);

evidence.pre = {
  output_table_counts: {},
  last_runs: [],
};
for (const t of stepConfig.output_tables) {
  evidence.pre.output_table_counts[t] = await tableCount(pool, t);
}
evidence.pre.last_runs = await q(pool, `
  SELECT id, status, completed_at,
         records_meta->'audit_table'->>'verdict' AS verdict,
         started_at,
         CASE WHEN completed_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (completed_at - started_at))*1000
              ELSE NULL END::bigint AS duration_ms
  FROM pipeline_runs
  WHERE pipeline IN ($1, $2)
  ORDER BY started_at DESC LIMIT 3
`, [`${chainArg}:${stepConfig.slug}`, stepConfig.slug]);

// ── Execute step ────────────────────────────────────────────────────────────
console.error(`[run-step] Executing: node ${stepConfig.script}`);
const start = Date.now();
const stdoutChunks = [];
const stderrChunks = [];

await new Promise((resolveExec) => {
  const p = spawn('node', [stepConfig.script], { cwd: REPO_ROOT, env: process.env });
  p.stdout.on('data', (d) => { stdoutChunks.push(d.toString()); });
  p.stderr.on('data', (d) => { stderrChunks.push(d.toString()); });
  p.on('close', (code) => {
    evidence.exec = {
      exit_code: code,
      duration_ms: Date.now() - start,
      stdout_tail: stdoutChunks.join('').split('\n').slice(-30).join('\n'),
      stderr_tail: stderrChunks.join('').split('\n').slice(-30).join('\n'),
      stdout_full_lines: stdoutChunks.join('').split('\n').length,
      stderr_full_lines: stderrChunks.join('').split('\n').length,
    };
    resolveExec();
  });
});

// ── Post-snapshot ───────────────────────────────────────────────────────────
console.error(`[run-step] Post-snapshot (exit=${evidence.exec.exit_code}, dur=${evidence.exec.duration_ms}ms)`);

evidence.post = {
  output_table_counts: {},
  new_run: null,
  audit_table: null,
  records_meta_minus_audit: null,
};
for (const t of stepConfig.output_tables) {
  evidence.post.output_table_counts[t] = await tableCount(pool, t);
}

const newRunRows = await q(pool, `
  SELECT id, status, completed_at,
         records_meta->'audit_table'->>'verdict' AS verdict,
         records_meta->'audit_table'->'rows' AS audit_rows,
         records_meta - 'audit_table' AS records_meta_other,
         records_total, records_new, records_updated,
         started_at,
         CASE WHEN completed_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (completed_at - started_at))*1000
              ELSE NULL END::bigint AS duration_ms
  FROM pipeline_runs
  WHERE pipeline IN ($1, $2)
  ORDER BY started_at DESC LIMIT 1
`, [`${chainArg}:${stepConfig.slug}`, stepConfig.slug]);
evidence.post.new_run = newRunRows[0] || null;

// ── Tripwires per risk class ────────────────────────────────────────────────
const tripwireProfile = config.tripwire_profiles[stepConfig.risk_class] || [];
evidence.tripwires = await runTripwires(pool, stepConfig, evidence.post, tripwireProfile);

async function runTripwires(pool, sc, post, profile) {
  const results = {};
  const newRun = post.new_run;
  if (!newRun) {
    for (const t of profile) results[t] = { status: 'INVESTIGATE', note: 'no new pipeline_runs row' };
    return results;
  }
  // T1 — SAVEPOINT-swallowed errors (scan *_errors audit rows)
  if (profile.includes('T1')) {
    const rows = (newRun.audit_rows || []).filter((r) => /_errors$/.test(r.metric));
    const nonZero = rows.filter((r) => r.value > 0);
    results.T1 = {
      status: nonZero.length === 0 ? 'PASS' : 'INVESTIGATE',
      evidence: rows.length === 0 ? 'no *_errors rows' : `*_errors rows: ${JSON.stringify(rows)}`,
    };
  }
  // T2 — zero-row emission (source grep) — done in markdown post-render manually
  if (profile.includes('T2')) {
    results.T2 = { status: 'N/A-MANUAL', evidence: 'source grep — verify in record post-hoc' };
  }
  // T3 — IS DISTINCT FROM silent skips (records_updated reasonable vs pre/post delta)
  if (profile.includes('T3')) {
    const total = newRun.records_total ?? 0;
    const upd = newRun.records_updated ?? 0;
    results.T3 = {
      status: 'INFO',
      evidence: `records_total=${total} records_new=${newRun.records_new ?? 0} records_updated=${upd}`,
    };
  }
  // T4/T5 — manual per step (need join-key context)
  if (profile.includes('T4')) results.T4 = { status: 'N/A-MANUAL', evidence: 'requires join-key knowledge per step' };
  if (profile.includes('T5')) results.T5 = { status: 'N/A-MANUAL', evidence: 'requires LEFT JOIN context per step' };
  // T6 — stale read/write race (table-specific; manual)
  if (profile.includes('T6')) {
    results.T6 = { status: 'N/A-MANUAL', evidence: 'table-specific; verify last_seen_at vs classified_at per step' };
  }
  // T7-T11 — script-specific; manual
  if (profile.includes('T7')) results.T7 = { status: 'N/A-MANUAL', evidence: 'sentinel-set specific per step' };
  if (profile.includes('T8')) results.T8 = { status: 'N/A-MANUAL', evidence: 'time-bucket boundaries per step' };
  if (profile.includes('T9')) results.T9 = { status: 'N/A-MANUAL', evidence: 'distribution baseline manual (last 7 runs comparison)' };
  if (profile.includes('T10')) results.T10 = { status: 'N/A-MANUAL', evidence: 'calibration cohort thinning manual' };
  if (profile.includes('T11')) results.T11 = { status: 'N/A-MANUAL', evidence: 'catchall rule rate per step' };
  // T12 — STDERR pipeline.log.warn lines (count from captured stderr)
  if (profile.includes('T12')) {
    const stderrFull = stderrChunks.join('');
    const warnMatches = stderrFull.match(/pipeline\.log\.warn|\[.*\]\s*WARN/g) || [];
    results.T12 = {
      status: warnMatches.length === 0 ? 'PASS' : 'INVESTIGATE',
      evidence: warnMatches.length === 0 ? '0 warn lines in stderr' : `${warnMatches.length} warn lines in stderr`,
    };
  }
  return results;
}

// ── Derive checklist statuses ───────────────────────────────────────────────
evidence.checklist = deriveChecklist(evidence);

function deriveChecklist(ev) {
  const c = {};
  const newRun = ev.post.new_run;
  const verdict = newRun?.verdict ?? null;

  // C1 — exit code
  c.C1 = ev.exec.exit_code === 0
    ? { status: 'PASS', evidence: `exit=0 duration=${ev.exec.duration_ms}ms` }
    : { status: 'FAIL', evidence: `exit=${ev.exec.exit_code} duration=${ev.exec.duration_ms}ms` };

  // C2 — pipeline_runs row created
  if (!newRun) {
    c.C2 = { status: 'FAIL', evidence: 'no new pipeline_runs row found' };
  } else if (newRun.status === 'completed' && newRun.completed_at) {
    c.C2 = { status: 'PASS', evidence: `id=${newRun.id} status=${newRun.status} completed_at=${newRun.completed_at}` };
  } else {
    c.C2 = { status: 'INVESTIGATE', evidence: `id=${newRun.id} status=${newRun.status} completed_at=${newRun.completed_at}` };
  }

  // C3 — audit_table.verdict = PASS exactly (SKIP / WARN / FAIL all = non-PASS)
  if (verdict === 'PASS') {
    c.C3 = { status: 'PASS', evidence: `verdict='PASS'` };
  } else if (verdict === 'SKIP') {
    c.C3 = { status: 'INVESTIGATE', evidence: `verdict='SKIP' (advisory lock not acquired — execution failure not success)` };
  } else if (verdict === 'WARN') {
    c.C3 = { status: 'INVESTIGATE', evidence: `verdict='WARN'` };
  } else if (verdict === 'FAIL') {
    c.C3 = { status: 'FAIL', evidence: `verdict='FAIL'` };
  } else {
    c.C3 = { status: 'INVESTIGATE', evidence: `verdict=${JSON.stringify(verdict)} (missing or unexpected)` };
  }

  // C4 — audit_table.rows non-empty
  const auditRows = newRun?.audit_rows || [];
  c.C4 = {
    status: auditRows.length > 0 ? 'PASS' : 'INVESTIGATE',
    evidence: auditRows.length > 0
      ? `${auditRows.length} audit rows: [${auditRows.map((r) => r.metric).join(', ')}]`
      : 'audit_table.rows empty or missing',
  };

  // C5 — verdict cascade row-derived — manual grep (placeholder)
  c.C5 = { status: 'N/A-MANUAL', evidence: 'grep script source; cross-ref with C3' };

  // C6 — zero-row preservation (ledger writers only)
  c.C6 = stepConfig.risk_class === 'ledger_writer' || stepConfig.risk_class === 'multi_domain'
    ? { status: 'N/A-MANUAL', evidence: 'grep audit_table push for *_inserted INFO row not gated by if(count>0)' }
    : { status: 'N/A', evidence: 'not a ledger writer' };

  // C7 — records_meta distributions populated
  const meta = newRun?.records_meta_other || {};
  const metaKeys = Object.keys(meta);
  c.C7 = metaKeys.length > 0
    ? { status: 'PASS', evidence: `${metaKeys.length} records_meta keys: [${metaKeys.join(', ')}]` }
    : { status: 'INVESTIGATE', evidence: 'records_meta empty or audit_table-only' };

  // C8 — output-table delta vs audit claims
  const deltas = {};
  for (const t of stepConfig.output_tables) {
    const pre = ev.pre.output_table_counts[t];
    const post = ev.post.output_table_counts[t];
    if (pre?.ok && post?.ok) {
      deltas[t] = { pre: pre.n, post: post.n, delta: post.n - pre.n };
    } else {
      deltas[t] = { error: pre?.error || post?.error };
    }
  }
  const claimed = (newRun?.records_new ?? 0) + (newRun?.records_updated ?? 0);
  c.C8 = stepConfig.output_tables.length === 0
    ? { status: 'N/A', evidence: 'no output tables declared (read-only / sanity step)', deltas }
    : { status: 'N/A-MANUAL', evidence: `claimed records_new+records_updated=${claimed}; deltas=${JSON.stringify(deltas)}` };

  // C9 — schema present — manual (check information_schema vs script writes)
  c.C9 = { status: 'N/A-MANUAL', evidence: 'compare information_schema columns to script INSERT/UPDATE column list' };

  // C10 — calculation invariants — manual per calc step
  c.C10 = stepConfig.risk_class === 'calculation' || stepConfig.risk_class === 'multi_domain'
    ? { status: 'N/A-MANUAL', evidence: `run §11 invariants from spec for ${stepConfig.slug}` }
    : { status: 'N/A', evidence: 'not a calculation step' };

  // C11 — Spec 47 §11 counter semantics
  c.C11 = newRun
    ? { status: 'N/A-MANUAL', evidence: `records_total=${newRun.records_total} records_new=${newRun.records_new} records_updated=${newRun.records_updated}; verify primary entity scoping per §11.1` }
    : { status: 'INVESTIGATE', evidence: 'no pipeline_runs row' };

  // C12 — derived from tripwire results
  const tripwireStatuses = Object.values(ev.tripwires).map((t) => t.status);
  const anyFail = tripwireStatuses.includes('FAIL');
  const anyInvestigate = tripwireStatuses.includes('INVESTIGATE');
  c.C12 = anyFail ? { status: 'FAIL', evidence: 'tripwire(s) FAIL' }
    : anyInvestigate ? { status: 'INVESTIGATE', evidence: 'tripwire(s) INVESTIGATE' }
    : { status: 'PASS', evidence: 'all applicable tripwires PASS or N/A' };

  return c;
}

// ── Derive final status ────────────────────────────────────────────────────
const checks = Object.values(evidence.checklist);
const hasFAIL = checks.some((c) => c.status === 'FAIL');
const hasINVESTIGATE = checks.some((c) => c.status === 'INVESTIGATE');
const hasNAMANUAL = checks.some((c) => c.status === 'N/A-MANUAL');
evidence.final_status = hasFAIL
  ? 'FAIL'
  : hasINVESTIGATE
  ? 'INVESTIGATE'
  : hasNAMANUAL
  ? 'PASS-pending-manual'
  : 'PASS';

// ── Render markdown record ─────────────────────────────────────────────────
function renderRecord(ev) {
  const C = ev.checklist;
  const T = ev.tripwires;
  return `# Step ${ev.step_num_padded}: ${ev.slug}
**Chain:** ${ev.chain}
**Validated:** ${ev.validated_at.slice(0, 10)}
**HEAD commit:** ${ev.head_sha}
**Risk class:** ${ev.risk_class}
**Per-step agent:** ${ev.agent}
**Final status:** ${ev.final_status}
**Notes:** ${ev.notes}

## Pre-run state
- Output table counts: ${JSON.stringify(ev.pre.output_table_counts)}
- Last 3 runs: ${JSON.stringify(ev.pre.last_runs.slice(0, 3), null, 2)}

## Execution
- Command: \`node ${ev.script}\`
- Exit code: ${ev.exec.exit_code}
- Duration: ${ev.exec.duration_ms}ms
- New \`pipeline_runs.id\`: ${ev.post.new_run?.id ?? 'NONE'}

## Post-run state
- Output table counts: ${JSON.stringify(ev.post.output_table_counts)}
- New run: ${JSON.stringify({
    id: ev.post.new_run?.id,
    status: ev.post.new_run?.status,
    verdict: ev.post.new_run?.verdict,
    duration_ms: ev.post.new_run?.duration_ms,
    records_total: ev.post.new_run?.records_total,
    records_new: ev.post.new_run?.records_new,
    records_updated: ev.post.new_run?.records_updated,
  })}

### audit_table.rows
\`\`\`json
${JSON.stringify(ev.post.new_run?.audit_rows ?? null, null, 2)}
\`\`\`

### records_meta (minus audit_table)
\`\`\`json
${JSON.stringify(ev.post.new_run?.records_meta_other ?? null, null, 2)}
\`\`\`

### stdout tail
\`\`\`
${ev.exec.stdout_tail}
\`\`\`

### stderr tail
\`\`\`
${ev.exec.stderr_tail}
\`\`\`

## Checklist evidence (C1-C12)

${Object.entries(C).map(([cid, c]) => `### ${cid}: ${c.status}\n**Evidence:** ${c.evidence}`).join('\n\n')}

## Tripwires (per-risk-class profile: ${ev.risk_class})

${Object.entries(T).map(([tid, t]) => `- **${tid}:** ${t.status} — ${t.evidence}`).join('\n')}

## N/A-MANUAL items requiring follow-up

${Object.entries(C).filter(([_, c]) => c.status === 'N/A-MANUAL')
    .map(([cid, c]) => `- **${cid}:** ${c.evidence}`).join('\n') || '(none)'}

## Specialized agent finding
${ev.agent === 'none' ? '_No agent for this step (sanity/cross-ref)._' : `_Pending: ${ev.agent} agent to run separately and append findings here._`}
`;
}

mkdirSync(dirname(RECORD_PATH), { recursive: true });
writeFileSync(RECORD_PATH, renderRecord(evidence));

console.error(`[run-step] Wrote record: ${RECORD_PATH}`);
console.error(`[run-step] Final status: ${evidence.final_status}`);

await pool.end();
process.exit(0);
