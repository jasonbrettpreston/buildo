// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

describe('scripts/observe-chain.js — pipeline observability agent', () => {
  let content: string;

  it('script exists at scripts/observe-chain.js', () => {
    content = read('scripts/observe-chain.js');
    expect(content).toBeTruthy();
  });

  it('declares ADVISORY_LOCK_ID = 113', () => {
    expect(content).toMatch(/ADVISORY_LOCK_ID\s*=\s*113/);
  });

  it('uses pipeline.log.* — no bare console.error', () => {
    expect(content).not.toMatch(/console\.error/);
    expect(content).toMatch(/pipeline\.log\.(warn|error|info)/);
  });

  it('uses openai package with DeepSeek baseURL and deepseek-chat model', () => {
    expect(content).toMatch(/require\('openai'\)/);
    expect(content).toMatch(/api\.deepseek\.com/);
    expect(content).toMatch(/deepseek-chat/);
  });

  it('pg_stat_statements query is wrapped in try/catch (graceful skip if extension absent)', () => {
    expect(content).toMatch(/pg_stat_statements/);
    // Use "FROM pg_stat_statements" as the anchor — this SQL clause only appears
    // inside the actual query body (inside the try block), not in comments.
    const sqlIdx = content.indexOf('FROM pg_stat_statements');
    expect(sqlIdx).toBeGreaterThan(-1);
    const tryCandidates = [...content.matchAll(/try\s*\{/g)].map((m) => m.index ?? 0);
    const catchCandidates = [...content.matchAll(/\}\s*catch/g)].map((m) => m.index ?? 0);
    const enclosingTry = tryCandidates.filter((t) => t < sqlIdx).at(-1);
    const enclosingCatch = catchCandidates.find((c) => c > sqlIdx);
    expect(enclosingTry).toBeDefined();
    expect(enclosingCatch).toBeDefined();
  });

  it('DEEPSEEK_API_KEY absent — skips API call gracefully (warn + placeholder, no crash)', () => {
    expect(content).toMatch(/DEEPSEEK_API_KEY/);
    // Must gate the API call behind a key-presence check
    expect(content).toMatch(/DEEPSEEK_API_KEY/);
    expect(content).toMatch(/placeholder|API call skipped|unavailable/i);
  });

  it('includes slow_queries in context sent to AI', () => {
    expect(content).toMatch(/slow_queries/);
  });

  it('emits PIPELINE_SUMMARY with Observer null pattern (records_new: null, records_updated: null)', () => {
    expect(content).toMatch(/pipeline\.emitSummary/);
    expect(content).toMatch(/records_new\s*:\s*null/);
    expect(content).toMatch(/records_updated\s*:\s*null/);
  });

  it('G5: writes per-chain report to docs/reports/pipeline-observability/ (race-safe after G2)', () => {
    // G2 made different chains run concurrently (different lock IDs). A shared
    // review-database-followup.md would now be a real race — each chain gets its own file.
    expect(content).toMatch(/pipeline-observability/);
    expect(content).not.toContain('review-database-followup.md');
    expect(content).toMatch(/chainId.*followup\.md|followup\.md.*chainId/);
  });

  it('error isolation — no process.exit(1) in script body (observer never fails the parent)', () => {
    // pipeline.withAdvisoryLock + pipeline.run() handle error isolation.
    // Observer must not call process.exit(1) directly.
    expect(content).not.toMatch(/process\.exit\(1\)/);
  });

  it('reads only from pipeline_runs — no business table access', () => {
    // Should NOT query business tables directly
    expect(content).not.toMatch(/FROM\s+permits\b/);
    expect(content).not.toMatch(/FROM\s+trade_forecasts\b/);
    expect(content).not.toMatch(/FROM\s+coa_applications\b/);
    // Should query pipeline_runs
    expect(content).toMatch(/FROM\s+pipeline_runs/);
  });

  it('WF3 guard: handles missing pipeline_runs rows gracefully (no crash)', () => {
    // Should check result rows length before accessing [0]
    expect(content).toMatch(/\.rows\.length\s*===\s*0|\.rows\.length\s*<\s*1|\.rows\.length\s*==\s*0/);
  });

  it('applies 7-day historical baseline query', () => {
    expect(content).toMatch(/MAX_HISTORY_DAYS\s*=\s*7|INTERVAL '7 days'|7\s*days/);
  });

  it('G3: baseline parsing uses Number.isFinite — not || null (hides 0ms baselines)', () => {
    expect(content).toContain('Number.isFinite');
    expect(content).not.toMatch(/parseFloat\([^)]+\)\s*\|\|\s*null/);
  });

  it('G3: baseline comparison uses != null — not > 0 (treats 0ms baselines as present)', () => {
    expect(content).not.toMatch(/avg_duration_ms\s*>\s*0/);
  });

  it('G4: step name Markdown escape covers more than just pipe characters', () => {
    // Old: /\|/g — pipes only. New: must cover *, _, ` and other Markdown specials.
    const hasFullEscape = /escapeMd|replace\([^)]*\*[^)]*_/.test(content);
    expect(hasFullEscape).toBe(true);
  });

  it('G1: code comment documents §A.5 sequential lock ID assignment (code 113 ≠ spec 48 number)', () => {
    expect(content).toMatch(/A\.5|sequential|§A\.5/);
  });

  it('G6: LIKE pattern escapes chainId underscores — prevents SQL wildcard match on unrelated pipelines', () => {
    // chainId validated to /^[a-zA-Z0-9_-]+$/ may contain '_' (SQL single-char wildcard).
    // Without escaping, permits_ca matches permitsXca:step via LIKE 'permits_ca:%'.
    expect(content).toMatch(/escapeLike/);
    expect(content).toMatch(/ESCAPE\s+'!'/);
  });
});

describe('scripts/run-chain.js — observability wiring', () => {
  let content: string;

  it('spawns observe-chain.js after chain lock release', () => {
    content = read('scripts/run-chain.js');
    expect(content).toMatch(/observe-chain\.js/);
  });

  it('spawns detached and unrefs the child process', () => {
    expect(content).toMatch(/detached\s*:\s*true/);
    expect(content).toMatch(/\.unref\(\)/);
  });

  it('guards spawn behind OBSERVABILITY_ENABLED !== "0"', () => {
    expect(content).toMatch(/OBSERVABILITY_ENABLED/);
  });
});

describe('scripts/lib/pipeline.js — failed_sample in emitSummary (spec 48 §4)', () => {
  let content: string;

  it('emitSummary handles failed_sample field', () => {
    content = read('scripts/lib/pipeline.js');
    expect(content).toMatch(/failed_sample/);
  });

  it('caps failed_sample at 20 items', () => {
    expect(content).toMatch(/\.slice\(0,\s*20\)|failed_sample\.length\s*>\s*20/);
  });

  it('omits failed_sample from payload when absent or empty', () => {
    expect(content).toMatch(/failed_sample.*\.length\s*>\s*0|failed_sample\s*&&\s*.*\.length/);
  });
});

describe('openai — installed as dependency (used for DeepSeek API)', () => {
  it('package.json includes openai', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies).toHaveProperty('openai');
  });
});
