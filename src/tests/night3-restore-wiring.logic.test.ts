// 🔗 SPEC LINK: task MB-30 stage 7, rule M-368: the night restore disables user
// triggers inside the restore transaction and re-enables them before COMMIT.
//
// Wiring tests W0-W9 (written red first) for the STAGED night tool.
// Tool resolution, in order: env N3DB_UNDER_TEST (the only env read in this file),
// then <home>/Buildo-scratch/rarms/night-tools/night3.next/n3db.cjs, then
// <home>/Buildo-scratch/rarms/night-tools/night3/n3db.cjs. First existing wins;
// restore.zsh is the file of that name beside it. Nothing is ever skipped.

import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OWNER = "pg_has_role(current_user, relowner, 'USAGE')";
const TABLES4 = ['coa_applications', 'parcel_abutments', 'parcels', 'permits'];
const DIS_ECHO = '\\echo night-restore: triggers DISABLED';
const RE_ECHO = '\\echo night-restore: triggers RE-ENABLED';

let TOOL = '';
let RESTORE = '';
let TOOL_TEXT = '';
let DIR = '';

const lines = (s: string): string[] => s.split('\n');
const dis = (t: string): string => `ALTER TABLE public."${t}" DISABLE TRIGGER USER;`;
const ena = (t: string): string => `ALTER TABLE public."${t}" ENABLE TRIGGER USER;`;

function childEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GIT_') || k === 'DATABASE_URL') continue;
    if (typeof v === 'string') env[k] = v;
  }
  return { ...env, ...(extra ?? {}) };
}

function run(args: string[], extra?: Record<string, string>) {
  const r = spawnSync('node', [TOOL, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: childEnv(extra) as NodeJS.ProcessEnv,
  });
  const out = (r.stdout ?? '').split(DIR).join('<DIR>');
  return { status: r.status, out, err: r.stderr ?? '' };
}

const planJson = JSON.stringify({
  made_at: 'fixture',
  total: 0,
  triggers: [],
  order: ['parcels', 'coa_applications', 'parcel_abutments'],
  tables: [
    { t: 'coa_applications', pk: ['id'], cols: ['id', 'application_number', 'lead_id'], rows: 0 },
    { t: 'parcel_abutments', pk: ['parcel_id', 'neighbour_id'], cols: ['parcel_id', 'neighbour_id'], rows: 0 },
    { t: 'parcels', pk: ['id'], cols: ['id', 'geom'], rows: 0 },
  ],
  setnull: [
    { child: 'permits', parent: 'neighbourhoods', pk: ['permit_num', 'revision_num'],
      cols: ['neighbourhood_id'], file: 'setnull-permits-neighbourhood_id', count: 0 },
  ],
});

beforeAll(() => {
  const home = os.homedir();
  const candidates = [
    process.env.N3DB_UNDER_TEST,
    path.join(home, 'Buildo-scratch/rarms/night-tools/night3.next/n3db.cjs'),
    path.join(home, 'Buildo-scratch/rarms/night-tools/night3/n3db.cjs'),
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  TOOL = candidates.find((c) => fs.existsSync(c)) ?? candidates[candidates.length - 1] ?? '';
  RESTORE = path.join(path.dirname(TOOL), 'restore.zsh');
  if (fs.existsSync(TOOL)) TOOL_TEXT = fs.readFileSync(TOOL, 'utf8');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb30-w-'));
  DIR = fs.realpathSync(tmp);
  fs.writeFileSync(path.join(DIR, 'plan.json'), planJson);
  for (const f of ['coa_applications', 'parcel_abutments', 'parcels', 'setnull-permits-neighbourhood_id']) {
    fs.writeFileSync(path.join(DIR, `${f}.bin.gz`), '');
  }
});

describe('night3 restore wiring W0: tool present', () => {
  it('W0 the tool file exists and restore.zsh exists beside it', () => {
    expect(fs.existsSync(TOOL)).toBe(true);
    expect(fs.existsSync(RESTORE)).toBe(true);
  });
});

describe('night3 restore wiring W1: disable/enable lines', () => {
  it('W1 exactly four DISABLE and four ENABLE USER lines, no TRIGGER ALL', () => {
    const r = run(['restore-sql', DIR]);
    expect(r.status).toBe(0);
    const ls = lines(r.out);
    const disLines = ls.filter((l) => / DISABLE TRIGGER USER;$/.test(l));
    const enaLines = ls.filter((l) => / ENABLE TRIGGER USER;$/.test(l));
    expect(disLines).toHaveLength(4);
    expect(enaLines).toHaveLength(4);
    expect(new Set(disLines)).toEqual(new Set(TABLES4.map(dis)));
    expect(new Set(enaLines)).toEqual(new Set(TABLES4.map(ena)));
    expect(r.out).not.toContain('TRIGGER ALL');
  });
});

describe('night3 restore wiring W2: ordering inside the transaction', () => {
  it('W2 lock_timeout < copies < owner < DISABLED echo < DELETE; ENABLE/re-enabled before COMMIT', () => {
    const r = run(['restore-sql', DIR]);
    expect(r.status).toBe(0);
    const ls = lines(r.out);
    const idx = (p: (l: string) => boolean, from = 0) => ls.findIndex((l, i) => i >= from && p(l));
    const lockIdx = idx((l) => l.startsWith('SET LOCAL lock_timeout'));
    const lastCopy = ls.reduce((a, l, i) => (l.startsWith('\\copy ') ? i : a), -1);
    const ownerIdx = idx((l) => l.includes(OWNER));
    const disEcho = idx((l) => l.startsWith(DIS_ECHO));
    const firstDel = idx((l) => l.startsWith('DELETE FROM '));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(lastCopy).toBeGreaterThan(lockIdx);
    expect(ownerIdx).toBeGreaterThan(lastCopy);
    expect(disEcho).toBeGreaterThan(ownerIdx);
    expect(firstDel).toBeGreaterThan(disEcho);
    expect(disEcho + 1).toBe(firstDel);

    const lastEnable = ls.reduce((a, l, i) => (l.includes(' ENABLE TRIGGER USER;') ? i : a), -1);
    const lastSelect = ls.reduce((a, l, i) => (l.startsWith("SELECT '") ? i : a), -1);
    expect(lastEnable).toBeGreaterThan(lastSelect);

    const commit = ls.indexOf('COMMIT;');
    expect(commit).toBeGreaterThan(lastEnable);
    const reEcho = idx((l) => l.startsWith(RE_ECHO));
    expect(reEcho).toBeGreaterThan(lastEnable);
    expect(reEcho).toBeLessThan(commit);
    expect((ls[commit - 1] ?? '').startsWith(RE_ECHO)).toBe(true);
    expect(ls.filter((l) => l === 'COMMIT;')).toHaveLength(1);
    const nonEmpty = ls.filter((l) => l.length > 0);
    expect(nonEmpty[nonEmpty.length - 1]).toBe('COMMIT;');
  });
});

describe('night3 restore wiring W3: explain-sql regression', () => {
  it('W3 explain-sql exits 0, has no TRIGGER, matches the committed fixture', () => {
    const fixture = fs.readFileSync(
      path.join(process.cwd(), 'src/tests/fixtures/night3-explain-sql.pre-mb30.sql'),
      'utf8',
    );
    const r = run(['explain-sql', DIR]);
    expect(r.status).toBe(0);
    expect(r.out).not.toContain('TRIGGER');
    expect(r.out).toBe(fixture);
  });
});

describe('night3 restore wiring W4: --only filter', () => {
  it('W4 --only=parcels disables parcels and permits only, echo says 2', () => {
    const r = run(['restore-sql', DIR, '--only=parcels']);
    expect(r.status).toBe(0);
    const ls = lines(r.out);
    const disLines = ls.filter((l) => / DISABLE TRIGGER USER;$/.test(l));
    expect(disLines).toHaveLength(2);
    expect(new Set(disLines)).toEqual(new Set(['parcels', 'permits'].map(dis)));
    expect(ls.some((l) => l.startsWith(DIS_ECHO) && l.includes('on 2 table(s)'))).toBe(true);
  });
});

describe('night3 restore wiring W5: markers match the module', () => {
  it('W5 the marker block equals scripts/lib/night-restore-triggers.js minus its export line', () => {
    const ls = lines(TOOL_TEXT);
    const start = ls.map((l, i) => (l.trim() === '// >>> night-restore-triggers' ? i : -1)).filter((i) => i >= 0);
    const end = ls.map((l, i) => (l.trim() === '// <<< night-restore-triggers' ? i : -1)).filter((i) => i >= 0);
    expect(start).toHaveLength(1);
    expect(end).toHaveLength(1);
    const s0 = start[0] ?? -1;
    const e0 = end[0] ?? -1;
    expect(s0).toBeLessThan(e0);
    const between = ls.slice(s0 + 1, e0).join('\n').trim();
    const mod = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/night-restore-triggers.js'), 'utf8');
    const modBody = mod
      .split('\n')
      .filter((l) => !l.startsWith('module.exports ='))
      .join('\n')
      .trim();
    expect(between).toBe(modBody);
  });
});

describe('night3 restore wiring W6: restore.zsh checks', () => {
  it('W6 trigger-state, both echoes, planned-N line, zsh -n clean', () => {
    const text = fs.readFileSync(RESTORE, 'utf8');
    expect(text).toContain('trigger-state');
    expect(text).toContain('DISABLED (USER) on');
    expect(text).toContain('RE-ENABLED (USER) on');
    const planLine = lines(text).find(
      (l) => l.includes('plan.json') && l.includes('new Set') && l.includes('tables') && l.includes('setnull'),
    );
    expect(planLine).toBeDefined();
    const syntax = spawnSync('zsh', ['-n', RESTORE], { encoding: 'utf8' });
    expect(syntax.status).toBe(0);
  });
});

describe('night3 restore wiring W7: usage, read-only block, trigger-state exits', () => {
  it('W7 usage names trigger-state and plan; command block is read-only; exits 0/1/2', () => {
    const u = run([]);
    expect(u.status).toBe(2);
    const usageLine = lines(u.out).find((l) => /usage/i.test(l) || l.includes('restore-sql'));
    expect(usageLine).toBeDefined();
    expect(usageLine ?? '').toContain('trigger-state');
    expect(usageLine ?? '').toContain('plan');

    const ls = lines(TOOL_TEXT);
    const blockStart = ls.findIndex((l) => l.includes("cmd === 'trigger-state'"));
    expect(blockStart).toBeGreaterThanOrEqual(0);
    const block = ls.slice(blockStart, blockStart + 25).join('\n');
    expect(block).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER)\b/);
    expect(TOOL_TEXT).toContain('READ ONLY');

    const file = path.join(DIR, 'states.json');
    fs.writeFileSync(file, JSON.stringify([{ t: 'parcels', name: 'x', state: 'O' }]));
    const ok = run(['trigger-state', DIR, '--test-states=' + file]);
    expect(ok.status).toBe(0);
    expect(lines(ok.out).some((l) => l.includes('trigger-state') && l.includes('PASS'))).toBe(true);

    fs.writeFileSync(file, JSON.stringify([{ t: 'parcels', name: 'x', state: 'D' }]));
    const bad = run(['trigger-state', DIR, '--test-states=' + file]);
    expect(bad.status).toBe(1);
    expect(bad.out).toContain('STOP');

    const down = run(['trigger-state', DIR], { DATABASE_URL: 'postgres://127.0.0.1:1/none' });
    expect(down.status).toBe(2);

    const zsh = fs.readFileSync(RESTORE, 'utf8');
    expect(zsh).not.toContain('--test-states');
    expect(zsh).toContain('COMMITTED but');
  });
});

describe('night3 restore wiring W8: resolvedSet', () => {
  it('W8 resolvedSet is defined and used; --only reports 3 vs 4 planned tables', () => {
    const defined = TOOL_TEXT.includes('function resolvedSet') || TOOL_TEXT.includes('const resolvedSet');
    expect(defined).toBe(true);
    const uses = TOOL_TEXT.split('resolvedSet(').length - 1;
    expect(uses).toBeGreaterThanOrEqual(3);
    const two = run(['restore-sql', DIR, '--only=parcels,coa_applications']);
    expect(two.status).toBe(0);
    expect(lines(two.out).some((l) => l.startsWith(DIS_ECHO) && l.includes('on 3 table(s)'))).toBe(true);
    const all = run(['restore-sql', DIR]);
    expect(all.status).toBe(0);
    expect(lines(all.out).some((l) => l.startsWith(DIS_ECHO) && l.includes('on 4 table(s)'))).toBe(true);
  });
});

describe('night3 restore wiring W9: known triggers and plan()', () => {
  it('W9 KNOWN_TRIGGERS keeps the three permits triggers; plan() uses resolvedSet', () => {
    const known = lines(TOOL_TEXT).filter((l) => l.includes('KNOWN_TRIGGERS')).join('\n');
    expect(known).toContain('permits.set_updated_at');
    expect(known).toContain('permits.trg_permits_lead_id');
    expect(known).toContain('permits.trg_permits_set_location');
    const ls = lines(TOOL_TEXT);
    const start = ls.findIndex((l) => l.startsWith('async function plan('));
    expect(start).toBeGreaterThanOrEqual(0);
    let end = ls.findIndex((l, i) => i > start && l.startsWith('const load'));
    if (end < 0) end = ls.length;
    expect(ls.slice(start, end).join('\n')).toContain('resolvedSet(');
  });
});
