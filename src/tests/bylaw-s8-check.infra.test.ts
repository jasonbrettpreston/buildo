// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (gate state pass · fail · not_run; pending never fails;
//            "at S8, with 0 agreed rows, `--check` exits 0"), §8 rule 8 (frozen gate registry; keys = fixture providers,
//            both ways), §9 (13 gates; G-DRIFT: `--check` regenerates in memory and byte-compares; a report-only arm never
//            changes the exit code), §10 (determinism: `--check` twice under different TZ / locale, byte-compared), §12
//            (infra: statically imports check() / selfTest(), offline); docs/specs/01-pipeline/69_mcbylaw_policy.md M-32
//            (pre-commit `--check`), M-45; docs/reports/mcbylaw-phase1-plan.md S8 (each gate run once on the REAL snapshot;
//            infra timeout measured with 10 % headroom; package.json script; 68/69 registered in spec-split-check)
//
// S8 FIRST LANDING locks over the REAL committed snapshot (offline, no DB).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as validateRaw from '../../scripts/analysis/bylaw/validate.mjs';
import * as splitRaw from '../../scripts/analysis/spec-split-check.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
// Static imports (Spec 68 §9 placement: the infra test statically imports check() / selfTest()); the .mjs surface is untyped.
const { check, selfTest, GATES, GATE_STATES, registryViolations } = validateRaw as unknown as Json;
const { SPEC_FILES } = splitRaw as unknown as Json;
const CLI = path.join(ROOT, 'scripts/generate-bylaw-provisions.mjs');

// Measured 2026-10-07 (S8) on the operator workstation with five other lanes running: in-process check() 1.8–4.2 s,
// one `--check` spawn 3.5–5.5 s (7.6 s cold, first run after a checkout), selfTest() 46–120 ms. Budget = the worst warm
// measurement × 1.1. R-H "WARN then tighten": past its budget a run WARNs (re-measure; tighten, never widen silently);
// the hard vitest timeout is 3 × budget (never below the 5 s vitest default), so only a hang fails.
const CHECK_BUDGET_MS = 4_700;
const SPAWN_BUDGET_MS = 6_100;
const SELFTEST_BUDGET_MS = 140;
const warnIfNear = (what: string, ms: number, budget: number) => {
  if (ms > budget) console.warn(`[bylaw-s8] ${what} took ${ms} ms, past its ${budget} ms budget (measured × 1.1) — re-measure (R-H)`);
};

let real: Json = {};
const t0 = Date.now();
real = await check({ root: ROOT });
const checkMs = Date.now() - t0;

describe('--check on the real snapshot (every gate run once)', () => {
  it('exits 0: 0 agreed rows, every in-scope row pending, nothing failed (Spec 68 §4, M-45)', () => {
    warnIfNear('check()', checkMs, CHECK_BUDGET_MS);
    expect(real.errors).toEqual([]);
    expect(real.drift).toEqual([]);
    expect(real.code).toBe(0);
    expect(real.counts.complete).toBe(0);
    expect(real.counts.failed).toBe(0);
    expect(real.counts.pending).toBe(real.counts.in_scope);
    expect(real.counts.in_scope).toBeGreaterThan(0);
  });

  it('every one of the 13 gates has a closed state; no unbuilt or unpinned gate is reported as a pass', () => {
    expect(Object.keys(real.gates)).toEqual(GATES.map((g: Json) => g.id));
    for (const g of GATES) expect([g.id, GATE_STATES.includes(real.gates[g.id].state)]).toEqual([g.id, true]);
    for (const g of GATES.filter((x: Json) => !x.built)) expect([g.id, real.gates[g.id].state]).toEqual([g.id, 'not_run']);
    // the arms that exist ran on the real snapshot and passed
    for (const id of ['G-TEXT', 'G-PROV', 'G-DRIFT', 'G-READ', 'G-EVAL']) expect([id, real.gates[id].state, real.gates[id].violations]).toEqual([id, 'pass', []]);
    // G-UNIVERSE stays not_run until --accept pins the universe after the S4 re-slice; never a silent pass
    const locked = fs.existsSync(path.join(ROOT, 'scripts/seeds/bylaw/universe.lock.json'));
    expect(real.gates['G-UNIVERSE'].state).toBe(locked ? 'pass' : 'not_run');
    // G-CODE (i) checks authored rows only: none yet → not_run (report-only arms ran)
    expect(real.gates['G-CODE'].state).toBe('not_run');
    expect(['G-CHANGE', 'G-AUDIT'].map((id) => real.gates[id].state)).toEqual(['not_run', 'not_run']);
  });

  it('prints the five lines + PHASE 1, gates pass/run/total computed from the states (total 13)', () => {
    expect(real.lines.length).toBe(6);
    const pass = Object.values(real.gates as Record<string, Json>).filter((g: Json) => g.state === 'pass').length;
    const run = Object.values(real.gates as Record<string, Json>).filter((g: Json) => g.state !== 'not_run').length;
    for (const l of real.lines.slice(0, 5)) expect(l).toContain(`gates pass ${pass} / run ${run} / total 13`);
    expect(real.lines[5]).toBe('PHASE 1: NOT_DONE');
  });

  it('the committed render equals the in-memory regeneration (G-DRIFT), LF, fixed heading', () => {
    for (const [rel, text] of Object.entries(real.files as Record<string, string>)) {
      expect(fs.readFileSync(path.join(ROOT, rel), 'utf8') === text, `${rel} drifted — run node scripts/generate-bylaw-provisions.mjs --write`).toBe(true);
      expect(text.includes('\r')).toBe(false);
    }
    expect(Object.keys(real.files).sort()).toEqual(['docs/reference/bylaw-provisions.json', 'docs/reference/bylaw-provisions.md']);
  });

  it('bylaw-code-findings.md and census.json are outside the byte compare (staleness is report-only)', () => {
    expect(Object.keys(real.files)).not.toContain('docs/reference/bylaw-code-findings.md');
    expect(typeof real.findingsStale).toBe('boolean');
  });
});

describe('a gate that throws (Spec 68 §9: exit 2, the gate named, nothing written)', () => {
  it('--write over a root whose universe.json is missing: G-UNIVERSE threw → code 2, the renders are not written', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-s8-throw-'));
    try {
      fs.cpSync(path.join(ROOT, 'scripts/seeds/bylaw'), path.join(tmp, 'scripts/seeds/bylaw'), { recursive: true });
      fs.rmSync(path.join(tmp, 'scripts/seeds/bylaw/universe.json'));
      fs.mkdirSync(path.join(tmp, 'docs/specs/01-pipeline'), { recursive: true });
      fs.copyFileSync(path.join(ROOT, 'docs/specs/01-pipeline/69_mcbylaw_policy.md'), path.join(tmp, 'docs/specs/01-pipeline/69_mcbylaw_policy.md'));
      const r = await check({ root: tmp, write: true });
      expect(r.code).toBe(2);
      expect(r.written).toBe(false);
      expect(r.errors.join(' ')).toMatch(/^G-UNIVERSE threw/);
      expect(fs.existsSync(path.join(tmp, 'docs/reference'))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('--self-test and the registry', () => {
  it('every module self-test passes (every reason code with a known-bad fixture fails for that reason)', async () => {
    const s0 = Date.now();
    const r = await selfTest({ root: ROOT });
    warnIfNear('selfTest()', Date.now() - s0, SELFTEST_BUDGET_MS);
    expect(r.results.filter((x: Json) => !x.pass)).toEqual([]);
    expect(r.pass).toBe(true);
  }, SELFTEST_BUDGET_MS * 3 + 5_000);

  it('registry keys equal the fixture providers, both ways', () => {
    expect(registryViolations()).toEqual([]);
  });
});

describe('determinism (Spec 68 §10): --check under a different TZ and locale gives byte-identical renders', () => {
  it('a spawned --check (TZ Pacific/Chatham, tr_TR) exits 0 and prints the same render shas as the in-process run', () => {
    const s0 = Date.now();
    const r = spawnSync(process.execPath, [CLI, '--check'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, TZ: 'Pacific/Chatham', LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' }, timeout: SPAWN_BUDGET_MS * 3 });
    warnIfNear('--check spawn', Date.now() - s0, SPAWN_BUDGET_MS);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const shas = (r.stdout.match(/^render .+ sha256 [0-9a-f]{64}$/gm) || []).sort();
    expect(shas).toEqual([...real.renderShaLines].sort());
    expect(shas.length).toBe(2);
    const strip = (t: string) => t.replace(/snapshot_age_days \d+( WARN>\d+)?/, 'snapshot_age_days N');
    expect(r.stdout.split('\n').filter((l) => /^[A-Z ]+[0-9]?: /.test(l)).map(strip)).toEqual(real.lines.map(strip));
  }, SPAWN_BUDGET_MS * 3 + 1_000);
});

describe('S8 registrations', () => {
  it('package.json carries the bylaw:provisions script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['bylaw:provisions']).toBe('node scripts/generate-bylaw-provisions.mjs');
  });

  it('Specs 68/69 are registered in spec-split-check SPEC_FILES with a 10 % budget (Spec 68 header)', () => {
    expect(SPEC_FILES[68]).toBe('68_mcbylaw_standard.md');
    expect(SPEC_FILES[69]).toBe('69_mcbylaw_policy.md');
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/122_split_manifest.json'), 'utf8'));
    for (const id of ['68', '69']) expect([id, m.budgets[id]?.headroom_pct]).toEqual([id, 10]);
  });

  it('the generated reference docs are listed for AI operators (scripts/CLAUDE.md) and the runbook names the modes', () => {
    expect(fs.readFileSync(path.join(ROOT, 'scripts/CLAUDE.md'), 'utf8')).toContain('docs/reference/bylaw-provisions.md');
    const rb = fs.readFileSync(path.join(ROOT, 'docs/runbook/README.md'), 'utf8');
    for (const mode of ['--refresh', '--adopt', '--refresh-census', '--accept --ruling', '--sample', '--write', '--check']) expect([mode, rb.includes(`generate-bylaw-provisions.mjs ${mode}`)]).toEqual([mode, true]);
  });

  it('enacting texts are -text in the scoped .gitattributes (their shas are pinned like the pages)', () => {
    expect(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/.gitattributes'), 'utf8')).toMatch(/^enacting\/\*\.txt -text$/m);
  });
});
