// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EB (EXT-1 estate literal gate; PIN EXT-2);
//            R-DF EXTERNALIZED; R-CV (pinned form); R-BA gate E (#32)
//
// Gate E's estate arm: a numeric literal in scripts/analysis/gates/** (and scripts/lib/step/** from
// RE-FREEZE #37) is RED unless it sits in a closed AST category A–F; it can never be ledgered. Gate and
// tooling numbers are pinned logic variables read file-only through gates/variables.mjs gateVariable().
// The decision-bearing tooling outside scope is held by a per-file high-water mark (PIN EXT-2).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as estate from '../../scripts/analysis/gates/estate-literals.mjs';
import * as vars from '../../scripts/analysis/gates/variables.mjs';
import { standardFor } from '../../scripts/analysis/gates/compute-literals.mjs';
import { createRequire } from 'module';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SEED = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json'), 'utf8')) as Record<string, { default: unknown; min?: unknown; max?: unknown; admin?: { hidden?: string } }>;
const findings = (src: string, rel = 'scripts/analysis/gates/x.mjs') => estate.literalFindings(rel, src);

describe('R-EB — the estate arm finds every EXT-1 census shape (RED)', () => {
  const shapes: Array<[string, string]> = [
    ['row 1/2 — a `: 4` fallback', 'const c = Number.isFinite(x) && x > 0 ? Math.floor(x) : 4;'],
    ['rows 3-5 — distribution defaults', 'const p = Number.isFinite(o.p) ? o.p : 0.99;'],
    ['row 6 — a minutes default', 'const MAINTENANCE_DEFAULT_TIMEOUT_MS = 15 * 60000;'],
    ['row 7 — a persisted cap', 'const RENDER_VALUE_MAX_LENGTH = 300;'],
    ['rows 8-10 — module consts', 'const MAX_REDIRECTS = 5;'],
    ['rows 11-12 — floor and fraction', 'const r = Math.min(cap, Math.max(50, Math.round(t / 4)));'],
    ['row 13 — a multiplier', 'setInterval(f, intervalMs * 2);'],
    ['row 14 — a `||` fallback', 'const qs = new QueryStream(sql, p, { batchSize: o.batchSize || 100 });'],
    ['rows 15-16 — a SQL LIMIT', 'const sql = `SELECT id FROM pipeline_runs ORDER BY id DESC LIMIT 40`;'],
    ['a SQL interval', "const sql = \"WHERE t > now() - interval '7 days'\";"],
    ['rows 17-21 — gate constants', 'export const SCORE_FLOOR = 14;'],
    ['rows 22-25 — a spawn buffer', "spawnSync('git', [], { maxBuffer: 32 * 1024 * 1024 });"],
  ];
  for (const [name, src] of shapes) {
    it(`${name} is a finding`, () => {
      expect(findings(src).length).toBeGreaterThan(0);
    });
  }
});

describe('R-EB — each closed allowed category is GREEN', () => {
  const allowed: Array<[string, string]> = [
    ['(A) identity', 'let i = 0; i += 1; const last = xs[xs.length - 1];'],
    ['(B) subscript / regex group', 'const a = m[2];'],
    ['(B) argv.slice(2)', 'main(process.argv.slice(2));'],
    ['(B) JSON indent', 'w(JSON.stringify(x, null, 2));'],
    ['(B) exit code', 'process.exitCode = 2;'],
    ['(B) ISO date', 'const d = new Date().toISOString().slice(0, 10);'],
    ['(B) radix', 'const n = Number.parseInt(s, 10);'],
    ['(B) two or more', 'if (externals.length < 2) refuse();'],
    ['(B) fast-invariant id', 'return { id: 43, pass, detail };'],
    ['(C) units', 'const s = ms / 1000; const ms2 = minutes * 60000; const days = d / 86400000; const pct = (100 * a) / b;'],
    ['(D) SRID', 'if (srid !== 4326) bad();'],
    ['(D) HTTP 3xx', 'if (res.status >= 300 && res.status < 400) follow();'],
    ['(D) enum map', 'const SEVERITY_RANK = { PASS: 0, INFO: 0, WARN: 1, FAIL: 2 };'],
    ['(E) self-test', 'export function selfTest() { want(f(17), 17); }'],
    ['(E) self-test cases', 'export function selfTestCases() { return [{ total: 10, maxTotal: 17 }]; }'],
    ['(F) error text', 'throw new Error(`got: ${sql.slice(0, 200)}${sql.length > 200 ? "…" : ""}`);'],
    ['(F) log text', "log.info(tag, `sha ${h.slice(0, 8)}`);"],
    ['LIMIT 1', 'const sql = `SELECT 1 FROM t LIMIT 1`;'],
  ];
  for (const [name, src] of allowed) {
    it(`${name}`, () => {
      expect(findings(src)).toEqual([]);
    });
  }
  it('(E) a file under fixtures/ is fixture data', () => {
    expect(findings('const X = 20;', 'scripts/analysis/gates/fixtures/f.mjs')).toEqual([]);
  });
  it('(D) 300 is allowed only against a response status', () => {
    expect(findings('if (n >= 300) cap();').length).toBe(1);
  });
});

describe('R-EB — live estate', () => {
  it('scripts/analysis/gates/** has 0 findings (census rows 17-25 fixed; RED before R-EB: 9)', () => {
    const r = estate.checkEstateLiterals(REPO_ROOT);
    expect(r.findings).toEqual([]);
    expect(r.pass).toBe(true);
  });

  it('PIN EXT-2: the tooling ratchet lists exactly TOOLING_RATCHET_FILES and every live count is at or below its mark', () => {
    const hwm = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, estate.HIGH_WATER_MARK_REL_PATH), 'utf8'));
    expect(Object.keys(hwm.marks).sort()).toEqual([...estate.TOOLING_RATCHET_FILES].sort());
    const counts = estate.toolingCounts(REPO_ROOT);
    expect(estate.ratchetDecision(counts, hwm)).toEqual({ pass: true, problems: [] });
  });

  it('the estate gate passes its own scan: its closed lists are declarations, not findings', () => {
    const rel = 'scripts/analysis/gates/estate-literals.mjs';
    expect(estate.literalFindings(rel, fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'))).toEqual([]);
  });
});

describe('R-EB (b) — gate and tooling variables are pinned seeds, read by one helper', () => {
  const gateKeys = Object.keys(SEED).filter((k) => vars.GATE_VARIABLE_PREFIXES.some((p: string) => k.startsWith(p)));
  const migration = fs.readFileSync(path.join(REPO_ROOT, 'migrations/267_gate_tooling_variables.sql'), 'utf8');

  it('every gate_/tooling_ seed is pinned (min = max = default) and admin-hidden internal', () => {
    expect(gateKeys.length).toBeGreaterThanOrEqual(6);
    for (const k of gateKeys) {
      const e = SEED[k]!;
      expect(e.min, k).toBe(e.default);
      expect(e.max, k).toBe(e.default);
      expect(e.admin?.hidden, k).toBe('internal');
      expect(vars.gateVariable(k)).toBe(e.default);
    }
  });

  it('migration 267 seeds every R-EB gate/tooling key with its seed default', () => {
    for (const k of ['gate_f_score_floor', 'gate_notes_cap', 'gate_why_min_chars', 'gate_na_reason_min_chars', 'gate_red_evidence_min_name_chars', 'tooling_spawn_max_buffer_mb']) {
      expect(migration, k).toMatch(new RegExp(`\\('${k}', ${String(SEED[k]!.default)},`));
    }
  });

  it('gateVariable refuses an unprefixed, an unpinned and an unregistered name', () => {
    const seed = { gate_loose: { default: 3, min: 1, max: 5 }, step_x: { default: 3, min: 3, max: 3 } };
    expect(vars.gateVariableDecision('step_x', seed).ok).toBe(false);
    expect(vars.gateVariableDecision('gate_loose', seed).ok).toBe(false);
    expect(vars.gateVariableDecision('gate_nope', seed).ok).toBe(false);
    expect(() => vars.gateVariable('step_post_check_concurrency')).toThrow(/not a gate or tooling variable/);
  });

  it('the copied why length is one variable: captures.mjs and capture-step-golden.js read gate_why_min_chars', () => {
    const cap = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/gates/captures.mjs'), 'utf8');
    const golden = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js'), 'utf8');
    expect(cap).toContain("gateVariable('gate_why_min_chars')");
    expect(golden).toContain("gateVariable('gate_why_min_chars')");
  });

  it('standardFor is unchanged by the estate arm (R-DT reads the same inputs)', () => {
    expect(standardFor('m', [], { hardStop: false })).toBe('V3');
    expect(standardFor('m', [], { hardStop: true })).toBe('V2');
  });
});

// RE-FREEZE #37 half of R-EB (census rows 1-16): scripts/lib/step/** joins the estate scope once its
// literals are registered runner-owned step_* variables (RUNNER_VARIABLES, config.js) or deleted
// fallbacks. Any scripts/lib/step byte moves lib_fingerprint and stales every capture, so these rows land
// with the one replay-all night (N1). RED on the pre-#37 tree (19 findings: census 16 + acquire.js:506,
// index.js:4463, verdict.js:412); flips at RE-FREEZE #37.
describe('R-EB (a) — the runner scope (RE-FREEZE #37)', () => {
  it.fails('scripts/lib/step/** is in ESTATE_SCOPES and has 0 findings (flips at RE-FREEZE #37)', () => {
    expect(estate.ESTATE_SCOPES).toContain('scripts/lib/step');
    expect(estate.scanFiles(estate.scopeFiles(['scripts/lib/step'], REPO_ROOT), REPO_ROOT)).toEqual([]);
  });

  it.fails('RUNNER_VARIABLES is a closed config.js export of step_* names, each a bounded seed in the "Pipeline Runner" admin group (flips at RE-FREEZE #37)', () => {
    const req = createRequire(import.meta.url);
    const { RUNNER_VARIABLES } = req(path.join(REPO_ROOT, 'scripts/lib/step/config.js')) as { RUNNER_VARIABLES?: readonly string[] };
    expect(Array.isArray(RUNNER_VARIABLES)).toBe(true);
    expect(Object.isFrozen(RUNNER_VARIABLES)).toBe(true);
    for (const n of ['step_post_check_concurrency', 'step_maintenance_default_timeout_minutes', 'step_audit_value_max_chars', 'step_acquire_pdf_pace_ms', 'step_acquire_max_redirects', 'step_phase_recancel_max_ms', 'step_phase_recancel_min_ms', 'step_phase_recancel_divisor', 'step_stall_ticker_multiplier', 'step_seam_chain_run_scan_limit']) {
      expect(RUNNER_VARIABLES, n).toContain(n);
    }
    for (const n of RUNNER_VARIABLES ?? []) {
      expect(n.startsWith('step_'), n).toBe(true);
      const e = SEED[n];
      expect(e, `${n} must be a registered seed`).toBeDefined();
      expect(typeof e!.min === 'number' && typeof e!.max === 'number', `${n} bounded`).toBe(true);
      expect((e as { admin?: { group?: string } }).admin?.group, n).toBe('Pipeline Runner');
    }
    // the politeness floor is a bound, not a default (Spec 129 §2)
    expect(SEED.step_acquire_pdf_pace_ms!.min).toBe(2000);
  });
});
