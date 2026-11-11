// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §7 (usage_events; the period is derived at query time),
//             §11b.7 rules 5-6 (dated note 2026-11-11: 20 a month, plan and trial, D-2..D-6 a)
//             docs/specs/03-mobile/100_mobile_parcel_cost_tool.md header item 2 (dated note 2026-11-11)
//
// MF-45 · the report meter's pure parts and its locks (plan T6, T7, T13 and the T14 descriptor case, section 12 folds 6, 9, 15):
//   T6  reportPeriod: whole months stepped from the billing anchor, UTC, day clamped to the month end; start <= now < end.
//   T7  readReportLimits: both allowances read from logic_variables, fail closed (missing, NaN, not an integer, outside the
//       seed bounds); no literal fallback.
//   T13 the only importers of openReport are the listed callers (the lookup route); a shared-view route never counts.
//   T14 every parcel_tool descriptor still served on the App A shelf carries the transitional lead_gen deviation.
// Each RED plant is an in-memory copy, never a file edit.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  reportPeriod,
  readReportLimits,
  ReportLimitsMissingError,
  REPORT_LIMIT_KEYS,
  readParcelToolUsage,
  type Queryable,
} from '@/lib/entitlements';

const ROOT = process.cwd();
const iso = (s: string): Date => new Date(s);
const period = (a: string, n: string): [string, string] => {
  const p = reportPeriod(iso(a), iso(n));
  return [p.start.toISOString(), p.end.toISOString()];
};

describe('T6 reportPeriod (billing-date window, D-2 a)', () => {
  it('anchor ahead of now (current_period_end): the window is the month ending at the anchor', () => {
    expect(period('2026-12-05T10:00:00.000Z', '2026-11-20T00:00:00.000Z')).toEqual(['2026-11-05T10:00:00.000Z', '2026-12-05T10:00:00.000Z']);
  });
  it('anchor ahead by more than a month still yields the window holding now', () => {
    expect(period('2027-03-05T10:00:00.000Z', '2026-11-20T00:00:00.000Z')).toEqual(['2026-11-05T10:00:00.000Z', '2026-12-05T10:00:00.000Z']);
  });
  it('a stale anchor several months behind (late renewal webhook, or created_at) yields the current month, never an empty window', () => {
    expect(period('2026-02-05T10:00:00.000Z', '2026-11-20T00:00:00.000Z')).toEqual(['2026-11-05T10:00:00.000Z', '2026-12-05T10:00:00.000Z']);
    expect(period('2024-06-05T10:00:00.000Z', '2026-11-01T00:00:00.000Z')).toEqual(['2026-10-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z']);
  });
  it('the boundary: now == start is inside; now == end is the next window', () => {
    expect(period('2026-12-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z')).toEqual(['2026-11-05T10:00:00.000Z', '2026-12-05T10:00:00.000Z']);
    expect(period('2026-12-05T10:00:00.000Z', '2026-12-05T10:00:00.000Z')).toEqual(['2026-12-05T10:00:00.000Z', '2027-01-05T10:00:00.000Z']);
  });
  it('a Jan 31 anchor clamps to the month end (Feb 28, leap Feb 29), from the anchor each time, never cumulative', () => {
    expect(period('2026-01-31T00:00:00.000Z', '2026-02-15T00:00:00.000Z')).toEqual(['2026-01-31T00:00:00.000Z', '2026-02-28T00:00:00.000Z']);
    expect(period('2026-01-31T00:00:00.000Z', '2026-03-10T00:00:00.000Z')).toEqual(['2026-02-28T00:00:00.000Z', '2026-03-31T00:00:00.000Z']);
    expect(period('2028-01-31T00:00:00.000Z', '2028-02-15T00:00:00.000Z')).toEqual(['2028-01-31T00:00:00.000Z', '2028-02-29T00:00:00.000Z']);
  });
  it('across a year end', () => {
    expect(period('2026-12-20T00:00:00.000Z', '2027-01-03T00:00:00.000Z')).toEqual(['2026-12-20T00:00:00.000Z', '2027-01-20T00:00:00.000Z']);
  });
  it('every window holds now and spans one stepped month (property sweep)', () => {
    const anchors = ['2026-01-31T23:59:59.999Z', '2025-05-15T12:00:00.000Z', '2027-08-01T00:00:00.000Z', '2024-02-29T06:30:00.000Z'];
    for (const a of anchors) {
      for (let d = 0; d < 800; d += 7) {
        const now = new Date(Date.UTC(2025, 0, 1) + d * 86_400_000);
        const p = reportPeriod(iso(a), now);
        expect(p.start.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(now.getTime()).toBeLessThan(p.end.getTime());
        const months = (p.end.getUTCFullYear() - p.start.getUTCFullYear()) * 12 + p.end.getUTCMonth() - p.start.getUTCMonth();
        expect(months).toBe(1);
      }
    }
  });
});

const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8')) as Record<string, { default: number; min?: number; max?: number }>;
const fakeDb = (rows: Array<{ variable_key: string; variable_value: unknown }>): Queryable =>
  ({ query: async () => ({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] }) }) as unknown as Queryable;
const seeded = (over: Record<string, unknown> = {}) =>
  Object.values(REPORT_LIMIT_KEYS).map((k) => ({ variable_key: k, variable_value: k in over ? over[k] : String(SEED[k]?.default) }));

describe('T7 readReportLimits (operator: every number is a setting; fail closed)', () => {
  it('the two keys exist in the seed with default 20 and bounds 1..1000 (oq rulings: plan 20, trial 20)', () => {
    for (const k of Object.values(REPORT_LIMIT_KEYS)) {
      expect(SEED[k], k).toMatchObject({ default: 20, min: 1, max: 1000 });
    }
  });
  it('reads plan and trial from the rows (pg returns NUMERIC as text)', async () => {
    await expect(readReportLimits(fakeDb(seeded({ [REPORT_LIMIT_KEYS.trial]: '7' })))).resolves.toEqual({ plan: 20, trial: 7 });
  });
  it.each([
    ['missing', undefined],
    ['null', null],
    ['NaN', 'abc'],
    ['zero (below min 1)', '0'],
    ['above max 1000', '1001'],
    ['not an integer', '12.5'],
  ])('throws ReportLimitsMissingError when the plan value is %s', async (_label, v) => {
    const rows = seeded().filter((r) => !(v === undefined && r.variable_key === REPORT_LIMIT_KEYS.plan))
      .map((r) => (r.variable_key === REPORT_LIMIT_KEYS.plan && v !== undefined ? { ...r, variable_value: v } : r));
    await expect(readReportLimits(fakeDb(rows))).rejects.toBeInstanceOf(ReportLimitsMissingError);
  });
  it('RED plant: a reader with a literal 20 fallback would serve on a missing row; the real one refuses', async () => {
    const planted = async (db: Queryable) => { try { return await readReportLimits(db); } catch { return { plan: 20, trial: 20 }; } };
    await expect(planted(fakeDb([]))).resolves.toEqual({ plan: 20, trial: 20 });
    await expect(readReportLimits(fakeDb([]))).rejects.toBeInstanceOf(ReportLimitsMissingError);
  });
  it('the lib carries no literal allowance (the number lives only in the seed and migration)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/lib/entitlements/index.ts'), 'utf8');
    expect(src).not.toMatch(/\?\?\s*20\b|\|\|\s*20\b|=\s*20\s*;/);
  });
});

/** Every file under src/ and mobile/src/ that imports openReport (by name), relative to the repo. */
export function openReportImporters(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'tests' && e.name !== '__tests__') walk(p); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(e.name)) continue;
      const s = fs.readFileSync(p, 'utf8');
      if (/import\s*\{[^}]*\bopenReport\b[^}]*\}\s*from/.test(s)) out.push(path.relative(root, p));
    }
  };
  walk(path.join(root, 'src'));
  walk(path.join(root, 'mobile/src'));
  return out.sort();
}
// The caller list. MF-44 adds its web report page here in its own commit; MF-56's shared view must never appear (oq:829).
const METER_CALLERS = ['src/app/api/parcels/lookup/route.ts'];

describe('T13 the report meter has exactly the listed callers (a shared view never counts)', () => {
  it('only the lookup route imports openReport', () => {
    expect(openReportImporters(ROOT)).toEqual(METER_CALLERS);
  });
  it('RED plant: an extra importer (a shared-view route) is caught', () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mf45-'));
    for (const f of [...METER_CALLERS, 'src/app/api/share/[token]/route.ts']) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.writeFileSync(path.join(tmp, f), "import { openReport } from '@/lib/entitlements';\n");
    }
    expect(openReportImporters(tmp)).not.toEqual(METER_CALLERS);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

type Desc = { guards?: { entitlement?: unknown }; deviations?: unknown; metering?: Record<string, unknown> };
const DESCRIPTORS = [
  'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json',
  'scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json',
  'scripts/surfaces/parcel_product/F17/contracts/contract_parcels_tracked.descriptor.json',
  'scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json',
];
/** Findings for a descriptor that declares parcel_tool but is still served through the lead_gen gate. */
export function transitionalProblems(id: string, d: Desc): string[] {
  const out: string[] = [];
  const ent = d.guards?.entitlement as { product?: string } | string | undefined;
  const meteredProduct = d.metering?.product;
  const declaresParcelTool = (typeof ent === 'object' && ent?.product === 'parcel_tool') || meteredProduct === 'parcel_tool';
  if (!declaresParcelTool) out.push(`${id}: does not declare parcel_tool`);
  const devs = Array.isArray(d.deviations) ? (d.deviations as Array<{ from?: string; why?: string }>) : [];
  if (!devs.some((x) => /MF-50/.test(`${x.from} ${x.why}`) && /lead_gen/.test(`${x.from} ${x.why}`))) {
    out.push(`${id}: no transitional lead_gen deviation naming MF-50`);
  }
  return out;
}

describe('T14 descriptors declare parcel_tool and carry the transitional deviation (fold 15)', () => {
  it('each of the four descriptors declares parcel_tool and the lead_gen deviation removed by MF-50', () => {
    const problems = DESCRIPTORS.flatMap((f) => transitionalProblems(path.basename(f), JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')) as Desc));
    expect(problems).toEqual([]);
  });
  it('the lookup contract is metered on parcel_tool with the ledger event, subject kind and the two 403 codes', () => {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, DESCRIPTORS[3]!), 'utf8')) as Desc & { errors: { classes: Array<{ class: string; ui: string; fields?: string[] }> } };
    expect(d.metering).toMatchObject({ answer: 'metered', product: 'parcel_tool', ledger_event: 'property_view', subject_kind: 'parcel_ref', on_exceeded: '403' });
    const c403 = d.errors.classes.find((c) => c.class === '403');
    expect(c403?.ui).toContain('SUBSCRIPTION_REQUIRED');
    expect(c403?.ui).toContain('REPORT_LIMIT_REACHED');
    expect(c403?.fields).toEqual(['reportsLimit', 'resetsOn']);
  });
  it('RED plant: removing the deviation is caught', () => {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, DESCRIPTORS[0]!), 'utf8')) as Desc;
    const devs = Array.isArray(d.deviations) ? (d.deviations as Array<{ from?: string; why?: string }>) : [];
    const planted = { ...d, deviations: devs.filter((x) => !/MF-50/.test(`${x.from} ${x.why}`)) };
    expect(transitionalProblems('plant', planted)).toEqual(['plant: no transitional lead_gen deviation naming MF-50']);
  });
});

/** A fake db for readParcelToolUsage: the entitlement row, the limits rows, the window count. */
const usageDb = (o: { row?: Record<string, unknown> | null; plan?: unknown; trial?: unknown; used?: number }): Queryable & { texts: string[] } => {
  const texts: string[] = [];
  return {
    texts,
    query: async (text: string) => {
      texts.push(text);
      if (/FROM entitlements/.test(text)) return { rows: o.row ? [o.row] : [], rowCount: o.row ? 1 : 0 };
      if (/FROM logic_variables/.test(text)) {
        return { rows: [
          { variable_key: REPORT_LIMIT_KEYS.plan, variable_value: o.plan === undefined ? '20' : o.plan },
          { variable_key: REPORT_LIMIT_KEYS.trial, variable_value: o.trial === undefined ? '10' : o.trial },
        ] };
      }
      if (/FROM usage_events/.test(text)) return { rows: [{ used: o.used ?? 0, already: false }] };
      throw new Error(`unexpected ${text}`);
    },
  } as unknown as Queryable & { texts: string[] };
};
const UID = '00000000-0000-0000-0000-0000000045b1';
const row = (status: string) => ({ status, current_period_end: '2026-12-05T10:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z', now: '2026-11-20T12:00:00.000Z' });

describe('the read-contract values (readParcelToolUsage): server-computed, FE-05; a display, never a gate', () => {
  it('no parcel_tool row -> every field null (a zero-entitlement user is a legal state)', async () => {
    await expect(readParcelToolUsage(usageDb({ row: null }), UID)).resolves.toEqual({ status: null, reportsUsed: null, reportsLimit: null, reportsLeft: null, reportsLimitReached: null, resetsOn: null });
  });
  it('a status outside the allowed set -> the status, every count null, no count query', async () => {
    const db = usageDb({ row: row('expired') });
    await expect(readParcelToolUsage(db, UID)).resolves.toMatchObject({ status: 'expired', reportsUsed: null, reportsLeft: null, reportsLimitReached: null });
    expect(db.texts.some((t) => /usage_events/.test(t))).toBe(false);
  });
  it('active, 5 used of 20 -> 15 left, not reached, resetsOn = the billing-month end; unlocked read', async () => {
    const db = usageDb({ row: row('active'), used: 5 });
    await expect(readParcelToolUsage(db, UID)).resolves.toEqual({ status: 'active', reportsUsed: 5, reportsLimit: 20, reportsLeft: 15, reportsLimitReached: false, resetsOn: '2026-12-05T10:00:00.000Z' });
    expect(db.texts.some((t) => /FOR UPDATE/.test(t))).toBe(false);
  });
  it('trial takes the trial allowance; used at the limit -> 0 left, reached (D-5 a)', async () => {
    await expect(readParcelToolUsage(usageDb({ row: row('trial'), used: 10 }), UID)).resolves.toMatchObject({ reportsLimit: 10, reportsLeft: 0, reportsLimitReached: true });
  });
  it('limits unreadable -> the status with null counts (degrades; the meter itself stays fail-closed)', async () => {
    await expect(readParcelToolUsage(usageDb({ row: row('active'), plan: '0' }), UID)).resolves.toMatchObject({ status: 'active', reportsUsed: null, reportsLimit: null });
  });
  it('a non-uuid uid (dev bypass) -> every field null, no query', async () => {
    const db = usageDb({ row: row('active') });
    await expect(readParcelToolUsage(db, 'dev-user')).resolves.toMatchObject({ status: null });
    expect(db.texts).toEqual([]);
  });
});

describe('T14b the entitlement read contract descriptor (operator 2026-11-11 "4. ... we have the tokens now")', () => {
  const rel = 'scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json';
  it('a QUERY contract on /api/parcels/entitlement, read-only, unmetered, no entitlement guard (it reports the entitlement, including its absence)', () => {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as {
      identity: { id: string; route: string; archetype: string }; guards: { entitlement: unknown; rate_bucket: string };
      metering: { answer: string }; outputs: { answer: string }; errors: { classes: Array<{ class: string }> };
    };
    expect(d.identity).toMatchObject({ id: 'contract_parcels_entitlement', route: '/api/parcels/entitlement', archetype: 'QUERY' });
    expect(d.guards.entitlement).toBe('none');
    expect(d.guards.rate_bucket).toContain('parcels-entitlement:');
    expect(d.metering.answer).toBe('none');
    expect(d.outputs.answer).toBe('none');
    expect(d.errors.classes.map((c) => c.class)).toEqual(['401', '429', '500']);
  });
});
