// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 5, §10 determinism;
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (wave 2 = the INCLUDE-closed ranks after the top 220 with
//            closed lots ≥ census.min_direct_lots);
//            .cursor/mcbylaw/phase2-plan-v2.md P2-7; operator 2026-10-14 (W2 tooling; the 3 amended rows held).
//
// The committed wave-2 shard plan scripts/seeds/bylaw/w2-shards.json against the REAL seeds: generated and current
// (`keying-cli plan --batch W2 --check`), disjoint from W1, INCLUDE targets all in W1, holds recorded — and W1's plan
// is untouched (w1-shards.json still at the prereg-0 pinned blob).
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- seed JSON
const SEEDS = path.join(process.cwd(), 'scripts/seeds/bylaw');
const readJson = (f: string): Json => JSON.parse(fs.readFileSync(path.join(SEEDS, f), 'utf8'));
/** git's blob id of a file (LF bytes as committed). */
const blobSha = (f: string) => {
  const b = fs.readFileSync(path.join(SEEDS, f));
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
};

describe('w2-shards.json — wave 2 at leaf grain (generated, deterministic)', () => {
  it('W1 is untouched: w1-shards.json is still the prereg-0 pinned blob 31cf70eb…', () => {
    expect(blobSha('w1-shards.json')).toBe('31cf70ebad6bb3bc96dd4ce02e5aa608f43de8e3');
  });

  it('is current: `keying-cli plan --batch W2 --check` re-derives it byte-identically (exit 0)', () => {
    const out = execFileSync(process.execPath, ['scripts/analysis/bylaw/keying-cli.mjs', 'plan', '--batch', 'W2', '--check'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(out).toMatch(/w2-shards\.json: current/);
  }, 180_000);

  it('members are disjoint from W1, closed ≥ census.min_direct_lots, ranked after W1; every unit once; no shard 0', () => {
    const w1 = readJson('w1-shards.json');
    const w = readJson('w2-shards.json');
    const census = readJson('census.json');
    const w1ids = new Set(w1.members.map((m: Json) => m.regulation_id));
    for (const m of [...w.members, ...w.held]) {
      expect(w1ids.has(m.regulation_id)).toBe(false);
      expect(m.closed_lots).toBeGreaterThanOrEqual(census.min_direct_lots);
      expect(m.rank).toBeGreaterThan(w1.members.length);
    }
    expect(new Set(w.shards.flatMap((s: Json) => s.regulation_ids))).toEqual(new Set(w.members.map((m: Json) => m.regulation_id)));
    const units = w.shards.flatMap((s: Json) => s.unit_ids);
    expect(new Set(units).size).toBe(units.length);
    expect(units.length).toBe(w.totals.units);
    for (const s of w.shards) if (!s.row_chunk) expect(s.units).toBeLessThanOrEqual(w.max_units);
    expect(w.shards.map((s: Json) => s.wave_shard)).toEqual(w.shards.map((_: Json, i: number) => i + 1));
    expect(w.grain).toBe('leaf');
  });

  it('every INCLUDE target of a W2 member is a W1 member (satisfied); the amended-pending rows are held with a reason', () => {
    const w1ids = new Set(readJson('w1-shards.json').members.map((m: Json) => m.regulation_id));
    const w = readJson('w2-shards.json');
    for (const m of w.members) for (const t of m.includes) expect(w1ids.has(t)).toBe(true);
    expect(w.include.outside_wave).toEqual([]);
    expect(w.held.map((h: Json) => h.regulation_id).sort()).toEqual(['900.3.10(1007)', '900.3.10(1299)', '900.3.10(317)']);
    for (const h of w.held) expect(h.reason).toBe('amended_pending');
  });
});
