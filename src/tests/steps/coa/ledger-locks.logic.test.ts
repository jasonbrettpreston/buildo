// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JD (a green ② lock closes a defect-ledger row; dated note CHAT-191)
// SPEC LINK: docs/specs/01-pipeline/51_source_coa.md §3
//
// Ledger locks for coa COA-D2 (one inclusive bound read from config) and COA-D7 (execution.maintenance,
// EVE.LEDGER-1, met per CHAT-191.CL-Q11). Each helper is GREEN on the live artifact and RED on a mutant. No DB.
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
/* eslint-disable @typescript-eslint/no-require-imports */
const verdictLib = require(join(process.cwd(), 'scripts/lib/step/verdict.js'));
const { runMaintenance } = require(join(process.cwd(), 'scripts/lib/step/plausibility.js'));
const D = require(join(process.cwd(), 'scripts/load-coa.descriptor.json'));
const SEEDS = require(join(process.cwd(), 'scripts/seeds/logic_variables.json'));
/* eslint-enable @typescript-eslint/no-require-imports */
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const status = (d: any, n: number, warn = 45) => verdictLib.buildAuditTable(d, 'coa', { max_days_stale: { value: n } }, [], { coa_max_days_stale_warn: warn }, new Set(['max_days_stale'])).rows.find((r: any) => r.metric === 'max_days_stale')?.status;
function assertOneBound(d: any, computeSrc: string) {
  if (status(d, 45) !== 'PASS' || status(d, 46) !== 'WARN') throw new Error('bound not inclusive 45');
  if (status(d, 46, 46) !== 'PASS' || status(d, 47, 46) !== 'WARN') throw new Error('config arm not honoured');
  const code = computeSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  if (/\b45\b/.test(code) || /log[\s\S]{0,80}stale/i.test(code)) throw new Error('second (log) comparison in compute');
}
function fake(dead: number, live: number) {
  const client: any = { q: [] as string[], query: vi.fn(async (s: string) => { client.q.push(s); return { rows: [] }; }), release: vi.fn() };
  return { client, pool: { query: vi.fn(async () => ({ rows: [{ live, dead }] })), connect: vi.fn(async () => client) } };
}
describe('coa ledger locks', () => {
  it('COA-D2 — one inclusive bound: 45 PASS, 46 WARN; no second (log) comparison in compute', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/lib/compute/load-coa.js'), 'utf8');
    expect(() => assertOneBound(D, src)).not.toThrow();
    // F4 red: the log comparison re-added to compute
    const mut = src.replace("ctx.report('max_days_stale', { value: daysSince(newest, ctx.clock()) });", "if (daysSince(newest, ctx.clock()) > 45) ctx.log.warn('portal rot: coa data stale');\n  ctx.report('max_days_stale', { value: daysSince(newest, ctx.clock()) });");
    expect(mut).not.toBe(src);
    expect(() => assertOneBound(D, mut)).toThrow(/second \(log\) comparison/);
    // F4 config arm red: the bound no longer read from config
    const m = clone(D); delete m.checks.find((c: any) => c.id === 'max_days_stale').limit_from_config;
    expect(() => assertOneBound(m, src)).toThrow(/config arm/);
  });
  it('COA-D7 — execution.maintenance runs VACUUM (ANALYZE) "coa_applications" when a dead tuple exists, skips at 0', async () => {
    // The seeded threshold (scripts/seeds/logic_variables.json, migration 278), never a literal.
    const cfg = { coa_applications_dead_tuple_ratio_warn_max: SEEDS.coa_applications_dead_tuple_ratio_warn_max.default };
    expect(cfg.coa_applications_dead_tuple_ratio_warn_max).toBe(0);
    const runs = async (d: any, dead: number) => {
      const f = fake(dead, 100);
      const rows = await runMaintenance(f.pool, d.execution.maintenance, cfg, { log: { warn: vi.fn(), info: vi.fn() }, defaultTimeoutMinutes: 5 });
      return { vacuumed: f.client.q.some((s: string) => s.includes('VACUUM (ANALYZE) "coa_applications"')), rows };
    };
    const a = await runs(D, 1);
    expect(a.vacuumed).toBe(true);
    expect(a.rows[0]?.metric).toBe('sys_maintenance_coa_applications_vacuum_analyze');
    const b = await runs(D, 0);
    expect(b.vacuumed).toBe(false);
    expect(b.rows[0]?.note).toMatch(/skipped/);
    // RED direction: the declaration removed (maintenance "none") — nothing runs, no row.
    const m = clone(D); m.execution.maintenance = 'none';
    const r = await runs(m, 1);
    expect(r.vacuumed).toBe(false);
    expect(r.rows).toEqual([]);
  });
});
