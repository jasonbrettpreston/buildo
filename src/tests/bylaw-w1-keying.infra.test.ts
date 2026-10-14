// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 5 (blind double-keying per shard), §10 determinism;
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (wave 1 = the top 220 by INCLUDE-closed lots);
//            .cursor/mcbylaw/phase2-plan-v2.md §D.2 (shard 0 = the E-5 30; ≈ 25 units by lot weight; INCLUDE targets
//            keyed before includers), P2-5; operator 2026-10-14 Q2 (LEAF-CLAUSE grain) and Q3 (Phase 1 door before P2-0).
//
// The committed wave-1 shard plan scripts/seeds/bylaw/w1-shards.json against the REAL seeds: generated and current
// (`keying-cli plan --batch W1 --check` re-derives it from census.json + k7-exceptions.json + the slice), and its
// structural invariants hold.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- seed JSON
const SEEDS = path.join(process.cwd(), 'scripts/seeds/bylaw');
const readJson = (f: string): Json => JSON.parse(fs.readFileSync(path.join(SEEDS, f), 'utf8'));

describe('w1-shards.json — wave 1 at leaf grain (generated, deterministic)', () => {
  it('is current: `keying-cli plan --batch W1 --check` re-derives it byte-identically (exit 0)', () => {
    const out = execFileSync(process.execPath, ['scripts/analysis/bylaw/keying-cli.mjs', 'plan', '--batch', 'W1', '--check'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(out).toMatch(/w1-shards\.json: current/);
  }, 180_000);

  it('shard 0 = exactly the E-5 30 of k7-exceptions.json; every member once; every unit once; shards ≤ max_units unless a row chunk', () => {
    const w = readJson('w1-shards.json');
    const k7 = readJson('k7-exceptions.json');
    const s0 = w.shards.filter((s: Json) => s.wave_shard === 0);
    expect(new Set(s0.flatMap((s: Json) => s.regulation_ids))).toEqual(new Set(k7.exceptions.map((e: Json) => e.regulation_id)));
    expect(w.members).toHaveLength(k7.wave1_size);
    expect(new Set(w.shards.flatMap((s: Json) => s.regulation_ids))).toEqual(new Set(w.members.map((m: Json) => m.regulation_id)));
    const units = w.shards.flatMap((s: Json) => s.unit_ids);
    expect(new Set(units).size).toBe(units.length);
    expect(units.length).toBe(w.totals.units);
    for (const s of w.shards) if (!s.row_chunk) expect(s.units).toBeLessThanOrEqual(w.max_units);
    expect(w.grain).toBe('leaf');
  });

  it('INCLUDE targets are keyed in an earlier or the same shard as their includers; wave shards are numbered 1…N in order', () => {
    const w = readJson('w1-shards.json');
    const at = new Map<string, number>();
    w.shards.forEach((s: Json, i: number) => s.regulation_ids.forEach((r: string) => at.has(r) || at.set(r, i)));
    for (const m of w.members) for (const t of m.includes) if (at.has(t)) expect(at.get(t)!).toBeLessThanOrEqual(at.get(m.regulation_id)!);
    const ws = w.shards.filter((s: Json) => s.wave_shard > 0).map((s: Json) => s.wave_shard);
    expect(ws).toEqual(ws.map((_: number, i: number) => i + 1));
    expect(w.include.cycles).toEqual([]);
  });
});
