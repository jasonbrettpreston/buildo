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
  mergeRatchet: (existing: unknown, labels: Map<string, { standard: string; stage: string }>, today: string, retire?: string[]) => { v3: string[]; converted_baseline: string[]; $comment: string };
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

  // Spec 124 R-IK (operator CHAT-37, 2026-10-21): the V3 label counts only steps converted or passing as-converted.
  it('R-IK: mergeRatchet retires a slug only when the run read it and it does not read V3 (strict view)', () => {
    const existing = { v3: ['a', 'x'], converted_baseline: ['a'] };
    const labels = new Map([['a', { standard: 'V3', stage: 'converted' }], ['x', { standard: 'V2', stage: 'pending' }]]);
    expect(m.mergeRatchet(existing, labels, '2026-10-21', ['x']).v3).toEqual(['a']);
    expect(() => m.mergeRatchet(existing, labels, '2026-10-21', ['a'])).toThrow(/reads V3/);
    expect(() => m.mergeRatchet(existing, labels, '2026-10-21', ['ghost'])).toThrow(/not read/);
    expect(m.mergeRatchet(existing, labels, '2026-10-21').v3).toEqual(['a', 'x']);
  });

  it('R-IK: the E1 generator run (--all --v3-json) judges pending steps as-converted; plain --all does not', async () => {
    const sv = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as {
      overlayRowsFor: (targets: Array<{ slug: string; stage: string }>, o: { all: boolean; step: string | null; v3Json: string | null }) => unknown[];
    };
    const targets = [{ slug: 'p', stage: 'pending' }, { slug: 'c', stage: 'converted' }];
    expect(sv.overlayRowsFor(targets, { all: true, step: null, v3Json: null })).toEqual([]);
    expect(sv.overlayRowsFor(targets, { all: true, step: null, v3Json: '/f.json' })).toEqual(targets);
  });

  it('R-IK: the committed ratchet lists no step that reads V2 as-converted (load_coa_notices retired; neighbourhoods added by R-JK, V3 = 28)', () => {
    const r = m.loadRatchet();
    expect(r!.v3).not.toContain('load_coa_notices');
    expect(r!.v3).toHaveLength(28); // 27 + neighbourhoods (R-JK, CHAT-52)
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

// rule-map: R-FI R-FJ R-FK R-FL R-FM R-FN R-FO R-FP R-FQ R-FR R-FS R-FT R-FU R-FV R-FW R-FX R-FY R-FZ R-GA R-GB R-GC
// R-GD R-GE R-GG R-GH R-GI R-GJ R-GK R-GL R-GM R-GN R-GO — each is a historical operator decision recorded as a
// register row by the V3 condition-9 backfill (backfill-9, operator y 2026-10-20; 124a §B21/§B22). The decision
// is what makes the exception entries it governs acceptable under R-EY (9); this lock asserts that record end to
// end: the row is a LIVE register row, every entry the citations record assigns to it exists where it says, an
// entry applied now carries the citation text in its file, and a converted-descriptor entry (applied on the
// bundled RE-FREEZE night, PIN FP-RECAPTURE) still names its declared deviation by index and `from`. R-GF is a
// register row that no entry cites (historical: the 0x O-1 scope cut), asserted as such. (integrate-12)
describe('V3 condition-9 backfill — rows R-FI…R-GO govern the exception entries they are cited by', () => {
  type Cite = { ref: string; step: string; source: string; file: string; key: string; deviation_index: number | null; rule_id: string | null; apply: string; append_text: string | null };
  const CITED_ROWS = ['R-FI', 'R-FJ', 'R-FK', 'R-FL', 'R-FM', 'R-FN', 'R-FO', 'R-FP', 'R-FQ', 'R-FR', 'R-FS', 'R-FT', 'R-FU', 'R-FV', 'R-FW', 'R-FX', 'R-FY', 'R-FZ', 'R-GA', 'R-GB', 'R-GC', 'R-GD', 'R-GE', 'R-GG', 'R-GH', 'R-GI', 'R-GJ', 'R-GK', 'R-GL', 'R-GM', 'R-GN', 'R-GO'];
  const record = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/2026-10-20-v3-condition9-backfill-citations.json'), 'utf8')) as { entries: Cite[] };
  const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  let registerIds: Set<string>;
  beforeAll(async () => {
    const ssc = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/spec-split-check.mjs')).href)) as unknown as { extractRegisterRulingIds: (a: string, b: string) => Set<string> };
    registerIds = ssc.extractRegisterRulingIds(read('docs/specs/01-pipeline/124_step_standard_policy.md'), read('docs/specs/01-pipeline/124a_step_standard_policy_appendix.md'));
  });

  it('every row is a LIVE register row, and R-GF is too', () => {
    for (const id of [...CITED_ROWS, 'R-GF']) expect(registerIds.has(id), id).toBe(true);
  });

  it.each(CITED_ROWS)('%s is cited by at least one exception entry, and each such entry is where the record says', (id) => {
    const mine = record.entries.filter((e) => e.rule_id === id);
    expect(mine.length).toBeGreaterThan(0);
    for (const e of mine) {
      const text = read(e.file);
      if (e.apply === 'now') {
        expect(e.append_text, e.ref).toContain(`Spec 124 ${id}`);
        expect(text.includes(e.append_text!), `${e.ref} ${e.file} carries "${e.append_text}"`).toBe(true);
      } else {
        expect(e.apply, e.ref).toBe('bundled-night');
        const dev = (JSON.parse(text) as { deviations?: Array<{ from?: string }> }).deviations?.[e.deviation_index ?? -1];
        expect(dev?.from, `${e.ref} ${e.file} deviations[${e.deviation_index}]`).toBe(e.key);
      }
    }
  });

  it('R-GF is cited by no entry (historical record of the 0x scope cut)', () => {
    expect(record.entries.filter((e) => e.rule_id === 'R-GF')).toEqual([]);
  });
});

// rule-map: R-HN R-HO R-HP R-HQ R-HR R-HS R-HT R-HU R-HV R-HW R-HX R-HY R-HZ R-IA R-IB R-IC R-ID R-IE R-IF — the
// operator's 2026-10-20 condition-9 family rulings (V3 Exception Rulings page + chat CHAT-22) and the six CoA
// cutover rulings (CHAT-15…CHAT-20), recorded as 124a rows by decision log (R-HK; 124a §B26 appended rows, §B31).
// This lock asserts the record end to end: each row is a LIVE register row cited by its decision log; every class-c
// entry the operator ruled is class d with its row; an entry applied now carries the citation in its file; a
// bundled-night entry still names its deviation by index and `from`; N-D1 alone stays class c (RULING-OWED); and
// R-HR's named exception is noted under Spec 123 §3.1. (steps-rulings-1)
describe('V3 condition-9 rulings — rows R-HN…R-IF govern the entries the operator ruled (steps-rulings-1)', () => {
  type Cite = { ref: string; class: string; file: string; key: string; deviation_index: number | null; rule_id: string | null; apply: string; append_text: string | null; decision_log?: string };
  const ROWS = ['R-HN', 'R-HO', 'R-HP', 'R-HQ', 'R-HR', 'R-HS', 'R-HT', 'R-HU', 'R-HV', 'R-HW', 'R-HX', 'R-HY', 'R-HZ', 'R-IA', 'R-IB', 'R-IC', 'R-ID', 'R-IE', 'R-IF'];
  const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  const record = JSON.parse(read('docs/reports/2026-10-20-v3-condition9-backfill-citations.json')) as { entries: Cite[] };
  const A = read('docs/specs/01-pipeline/124a_step_standard_policy_appendix.md');
  let registerIds: Set<string>;
  beforeAll(async () => {
    const ssc = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/spec-split-check.mjs')).href)) as unknown as { extractRegisterRulingIds: (a: string, b: string) => Set<string> };
    registerIds = ssc.extractRegisterRulingIds(read('docs/specs/01-pipeline/124_step_standard_policy.md'), A);
  });

  it.each(ROWS)('%s is a LIVE register row that cites its decision log, and every entry it governs is where the record says', (id) => {
    expect(registerIds.has(id), id).toBe(true);
    const row = A.split('\n').find((l) => l.startsWith(`| ${id} |`))!;
    expect(row).toMatch(/`2026-10-20-(v3-exception-rulings#[a-z0-9-]+|chat-batch-c-steps#CHAT-(1[5-9]|2[02]))`/);
    const mine = record.entries.filter((e) => e.rule_id === id);
    expect(mine.length, id).toBeGreaterThan(0);
    for (const e of mine) {
      expect(e.class, e.ref).toBe('d');
      expect(e.append_text, e.ref).toContain(`Spec 124 ${id}`);
      if (e.apply === 'now') {
        expect(read(e.file).includes(e.append_text!), `${e.ref} ${e.file}`).toBe(true);
      } else {
        expect(e.apply, e.ref).toBe('bundled-night');
        const dev = (JSON.parse(read(e.file)) as { deviations?: Array<{ from?: string }> }).deviations?.[e.deviation_index ?? -1];
        expect(dev?.from, `${e.ref} ${e.file} deviations[${e.deviation_index}]`).toBe(e.key);
      }
    }
  });

  it('the operator ruled every class-c entry except N-D1, and the bundled-night list grew 102 -> 141 -> 143 (CHAT-24, integrate-16)', () => {
    expect(record.entries.filter((e) => e.class === 'c').map((e) => e.key)).toEqual(['N-D1']);
    expect(record.entries.filter((e) => e.apply === 'bundled-night').length).toBe(143);
    expect(record.entries.filter((e) => e.class === 'd' && e.apply === 'now').map((e) => e.ref).sort()).toEqual(['g1-21', 'g1-26', 'g5-15', 'g5-17', 'g5-6']);
  });

  it('CHAT-24: enrich_permits\' twin deviations ride the night under R-IB and R-IC, and each row carries the dated note', () => {
    const twins = record.entries.filter((e) => e.decision_log === '2026-10-20-chat-batch-d-rulings#CHAT-24');
    expect(twins.map((e) => [e.ref, e.file, e.deviation_index, e.rule_id, e.apply])).toEqual([
      ['i16-1', 'scripts/enrich-permits.descriptor.json', 1, 'R-IB', 'bundled-night'],
      ['i16-2', 'scripts/enrich-permits.descriptor.json', 2, 'R-IC', 'bundled-night'],
    ]);
    for (const id of ['R-IB', 'R-IC']) expect(A.split('\n').find((l) => l.startsWith(`| ${id} |`)), id).toContain('**Dated note 2026-10-20 (CHAT-24, operator chat: "yes to all ensure they comply to the governing specs and are recorded as a ruling if necessary"; `2026-10-20-chat-batch-d-rulings#CHAT-24`):**');
  });

  it('R-HR is recorded under Spec 123 §3.1 as a dated named exception, and CCT-D10 takes the R-GR closed form', () => {
    const s123 = read('docs/specs/01-pipeline/123_step_opt_assessment_validation.md');
    const at = s123.indexOf('### 3.1 The rule for DEFECT');
    expect(s123.slice(at, s123.indexOf('### 3.2', at))).toContain('AMENDED 2026-10-20 (Spec 124 R-HR');
    const cct = read('docs/reports/defect-ledger.md').split('\n').find((l) => l.startsWith('| CCT-D10 |'))!;
    expect(cct).toContain('| CLOSED · declared deviation (R-HY) |');
  });
});

// rule-map: R-II — REFREEZE-BUNDLE-1 item (6) (124a:457), applied on night 1 (R-II, 124a §B26): every `apply:
// "bundled-night"` citation in docs/reports/2026-10-20-v3-condition9-backfill-citations.json is appended, exactly once,
// to its deviation's `adjudicated_by`, and the deviation is still the one the record names (index and `from`). s1-4
// was applied by the R-ID patch itself (its `from` drops the counters clause), so its `key` is the new `from`.
describe('REFREEZE-BUNDLE-1 item (6), night 1 — the 143 bundled-night citations are applied', () => {
  type Cite = { ref: string; file: string; key: string; deviation_index: number; apply: string; append_text: string };
  const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  const record = JSON.parse(read('docs/reports/2026-10-20-v3-condition9-backfill-citations.json')) as { entries: Cite[] };
  const night = record.entries.filter((e) => e.apply === 'bundled-night');

  it('143 entries, each naming its deviation by index and from, and each carrying its append_text exactly once', () => {
    expect(night).toHaveLength(143);
    for (const e of night) {
      const dev = (JSON.parse(read(e.file)) as { deviations: Array<{ from: string; adjudicated_by: string }> }).deviations[e.deviation_index]!;
      expect(dev.from, e.ref).toBe(e.key);
      expect(dev.adjudicated_by.split(e.append_text).length - 1, `${e.ref} ${e.file} deviations[${e.deviation_index}]`).toBe(1);
    }
  });

  it('s1-4 names the new from (the R-ID patch dropped the type-counter clause)', () => {
    const s14 = night.find((e) => e.ref === 's1-4')!;
    expect(s14.key).not.toMatch(/tier_1a_type_confirmed|tier_1a_type_tolerant/);
  });
});
