// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EY (condition 9; E1 ratchet, E2 cutover
//            gate, E3 hard gate); R-CV (pinned switch); R-DF (closed grandfather lists)
//
// Spec 124 R-EY (McDonald's Airtight V3, operator y 2026-10-20: "the label should reflect and enforce the
// approach" -> "y" to enforcement gates 1-3; "y on 2 and 4"; "y to all").
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');

type Entry = { source: string; key: string; text: string };
type Row = { slug: string; stage: string };
type L = {
  resolvingRuleIds: (text: string, ids: Set<string>) => string[];
  exceptionEntries: (slug: string, src: Record<string, unknown>) => Entry[];
  exceptionCitationFailures: (e: Entry[], ids: Set<string>) => { fails: string[]; uncited: Array<{ source: string; key: string }>; total: number };
  parseDefectRows: (text: string) => Array<{ id: string; step: string; status: string; text: string }>;
  ratchetFindings: (labels: Map<string, string>, r: unknown) => string[];
  cutoverFindings: (rows: Row[], labels: Map<string, string>, r: unknown) => string[];
  hardGateFindings: (a: { enabled: boolean; rows: Row[]; labels: Map<string, string>; registry: Row[]; exceptions?: unknown[] }) => { findings: string[]; wouldFail: string[] };
  hardGateEnabled: () => boolean;
  mergeRatchet: (existing: unknown, labels: Map<string, { standard: string; stage: string }>, today: string) => { v3: string[]; converted_baseline: string[]; $comment: string };
  loadRatchet: () => { v3: string[]; converted_baseline: string[]; $comment: string } | null;
  HARD_GATE_EXCEPTIONS: Array<{ slug: string; expires_when_converted: string; cites: string }>;
  HARD_GATE_VARIABLE: string;
  RATCHET_COMMENT: string;
  V3_RATCHET_REL: string;
};

let m: L;
beforeAll(async () => {
  m = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/gates/v3-label.mjs')).href)) as unknown as L;
});

const ids = new Set(['R-DT', 'R-K', 'R-K.1', 'R-EH']);

describe('R-EY (9) — every exception naming the step cites a resolving register rule id', () => {
  it('resolvingRuleIds keeps only ids in the register (an amendment suffix falls back to its base id)', () => {
    expect(m.resolvingRuleIds('Spec 124 R-DT; W4A-R6; R-ZZ; R-K.1 and R-EH-3', ids).sort()).toEqual(['R-DT', 'R-EH', 'R-K.1']);
    expect(m.resolvingRuleIds('operator y 2026-10-18 (wave-4 rulings Q-C2)', ids)).toEqual([]);
  });

  it('collects grandfathered, deviations[], declared-deviation ledger rows, spec_version and step_timeout entries', () => {
    const src = {
      descriptor: { deviations: [{ from: 'a', adjudicated_by: 'Spec 124 R-DT', why: 'x' }, { from: 'b', adjudicated_by: 'operator y', why: 'y' }] },
      grandfathered: { steps: { s: { why: 'no id' }, other: { why: 'R-DT' } } },
      staleness: { spec_version: { not_executed: { s: { why: { text: 'R-K' } } } } },
      budget: { declarations: { step_timeout: { pending: ['s'], pending_why: 'a declared gap' } } },
      defectRows: [
        { id: 'S-D1', step: 's', status: 'CLOSED · declared deviation at ② (R-EH)', text: '| S-D1 | s | … R-EH |' },
        { id: 'S-D2', step: 's', status: 'CLOSED · declared deviation', text: '| S-D2 | s | … |' },
        { id: 'S-D3', step: 's', status: 'CLOSED', text: '| S-D3 |' },
      ],
    };
    const e = m.exceptionEntries('s', src);
    expect(e.map((x) => `${x.source}:${x.key}`)).toEqual(['grandfathered:s', 'deviation:a', 'deviation:b', 'ledger:S-D1', 'ledger:S-D2', 'spec_version:not_executed', 'step_timeout:pending']);
    const f = m.exceptionCitationFailures(e, ids);
    expect(f.fails).toEqual(['grandfathered:s no rule id', 'deviations[] 1/2 no rule id', 'ledger S-D2 no rule id', 'step_timeout:pending no rule id']);
    expect(f.total).toBe(7);
    expect(m.exceptionCitationFailures(m.exceptionEntries('none', { ...src, descriptor: null }), ids).fails).toEqual([]);
  });

  it('parseDefectRows reads data rows only (R-FA) and splits on unescaped pipes', () => {
    const t = ['| ID | Step | Anchor | One-line | Status | Closes at | Source |', '|---|---|---|---|---|---|---|', '| LC-D6 | load_centreline | a \\| b | s | CLOSED · declared deviation | c | d |'].join('\n');
    expect(m.parseDefectRows(t)).toEqual([{ id: 'LC-D6', step: 'load_centreline', status: 'CLOSED · declared deviation', text: '| LC-D6 | load_centreline | a \\| b | s | CLOSED · declared deviation | c | d |' }]);
  });
});

describe('R-EY E1 — the V3 ratchet only grows, through its generator', () => {
  it('a listed step that reads V2 is RED; an unlisted V2 step and an unevaluated listed step are not', () => {
    const r = { v3: ['a', 'b'], converted_baseline: [] };
    expect(m.ratchetFindings(new Map([['a', 'V3'], ['c', 'V2']]), r)).toEqual([]);
    expect(m.ratchetFindings(new Map([['a', 'V2']]), r)).toEqual(['E1: a is on the V3 ratchet but reads V2']);
    expect(m.ratchetFindings(new Map(), null)[0]).toMatch(/^E1: .* is missing/);
  });

  it('mergeRatchet unions (never removes) and seeds converted_baseline once', () => {
    const labels = new Map([['a', { standard: 'V2', stage: 'converted' }], ['n', { standard: 'V3', stage: 'pending' }]]);
    const seeded = m.mergeRatchet(null, labels, '2026-10-20');
    expect(seeded.v3).toEqual(['n']);
    expect(seeded.converted_baseline).toEqual(['a']);
    const next = m.mergeRatchet({ v3: ['z'], converted_baseline: ['a'] }, new Map([['z', { standard: 'V2', stage: 'converted' }], ['q', { standard: 'V3', stage: 'converted' }]]), '2026-10-21');
    expect(next.v3).toEqual(['q', 'z']);
    expect(next.converted_baseline).toEqual(['a']);
  });

  it('the committed ratchet file is in its generator\'s shape (comment, sorted, baseline = converted[] at R-EY)', () => {
    const r = m.loadRatchet();
    expect(r).not.toBeNull();
    expect(r!.$comment).toBe(m.RATCHET_COMMENT);
    expect(r!.v3).toEqual([...r!.v3].sort());
    expect(r!.converted_baseline).toEqual([...r!.converted_baseline].sort());
    expect(r!.converted_baseline).toHaveLength(29);
  });
});

describe('R-EY E2 — no ③ cutover unless the step reads V3', () => {
  const r = { v3: [], converted_baseline: ['old'] };
  it('a converted step outside the R-EY baseline that reads V2 is RED; baseline and pending steps are not', () => {
    const rows = [{ slug: 'old', stage: 'converted' }, { slug: 'new', stage: 'converted' }, { slug: 'p', stage: 'pending' }];
    expect(m.cutoverFindings(rows, new Map([['old', 'V2'], ['new', 'V3'], ['p', 'V2']]), r)).toEqual([]);
    expect(m.cutoverFindings(rows, new Map([['old', 'V2'], ['new', 'V2'], ['p', 'V2']]), r)).toEqual([
      'E2: new entered converted[] after R-EY and reads V2 (a cutover needs V3 under all nine conditions)',
    ]);
  });
});

describe('R-EY E3 — the hard gate: built OFF behind one pinned switch, one closed exception', () => {
  const registry = [{ slug: 'refresh_snapshot', stage: 'converted' }, { slug: 'x', stage: 'converted' }, { slug: 'permits', stage: 'pending' }];
  const labels = new Map([['refresh_snapshot', 'V2'], ['x', 'V2']]);

  it('the switch is the pinned seed variable gate_v3_hard_gate_enabled, default 0 (off)', () => {
    expect(m.HARD_GATE_VARIABLE).toBe('gate_v3_hard_gate_enabled');
    const seed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));
    expect(seed.gate_v3_hard_gate_enabled).toMatchObject({ default: 0, min: 0, max: 0, admin: { hidden: 'internal' } });
    expect(m.hardGateEnabled()).toBe(false);
    expect(fs.readFileSync(path.join(REPO_ROOT, 'migrations/279_gate_v3_hard_gate_switch.sql'), 'utf8')).toContain("('gate_v3_hard_gate_enabled', 0,");
  });

  it('off: no finding, but the converted V2 steps are named; on: each fires, the exception does not', () => {
    const off = m.hardGateFindings({ enabled: false, rows: registry, labels, registry });
    expect(off).toEqual({ findings: [], wouldFail: ['x'] });
    const on = m.hardGateFindings({ enabled: true, rows: registry, labels, registry });
    expect(on.findings).toEqual(['E3: converted step x reads V2 (hard gate on)']);
  });

  it('the exception list is closed: exactly refresh_snapshot, citing D-P1, expiring at permits ③', () => {
    expect(m.HARD_GATE_EXCEPTIONS.map((e) => [e.slug, e.expires_when_converted])).toEqual([['refresh_snapshot', 'permits']]);
    expect(m.HARD_GATE_EXCEPTIONS[0]!.cites).toContain('D-P1');
    expect(m.HARD_GATE_EXCEPTIONS[0]!.cites).toContain('docs/reports/2026-10-17-batch4-p1-1-permits-assessment.md §6.2 lines 125-144');
    expect(m.HARD_GATE_EXCEPTIONS[0]!.cites).toContain('PM-D5');
    expect(Object.isFrozen(m.HARD_GATE_EXCEPTIONS)).toBe(true);
  });

  it('the exception auto-expires: permits converted with refresh_snapshot still listed is RED, on or off', () => {
    const converted = registry.map((r) => (r.slug === 'permits' ? { ...r, stage: 'converted' } : r));
    for (const enabled of [false, true]) {
      const r = m.hardGateFindings({ enabled, rows: converted, labels: new Map([...labels, ['permits', 'V3']]), registry: converted });
      expect(r.findings[0]).toBe('E3: exception refresh_snapshot expired — permits reached ③; remove it from HARD_GATE_EXCEPTIONS');
      if (enabled) expect(r.findings).toContain('E3: converted step refresh_snapshot reads V2 (hard gate on)');
    }
  });

  it('step-validate wires E1/E2/E3 into the hard stop and the generator flag', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
    expect(src).toContain('const e1 = ratchetFindings(labels, ratchet);');
    expect(src).toContain('const e2 = cutoverFindings(targets, labels, ratchet);');
    expect(src).toContain('const e3 = hardGateFindings({ enabled: e3on, rows: targets, labels, registry });');
    expect(src).toContain('if (e1.length || e2.length || e3.findings.length) anyHardStop = true;');
    expect(src).toContain("else if (a.startsWith('--v3-json=')) out.v3Json");
  });
});
