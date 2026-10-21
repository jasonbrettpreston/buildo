// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-260 (Spec 133, the By-law Handbook; operator y 2026-10-21,
//            `2026-10-21-chat-batch-m-43#CHAT-43`, "2 and 3 y"; ruled 2026-10-20 in `2026-10-20-spec132-rulings#HANDBOOK`)
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IY (the tooling half, keyed by spec id)
//
// Spec 133 is the by-law and lot-configuration reading spec, GENERATED from the by-law registers (Spec 69/69a M-rows and
// Spec 131 LC-rows; the standard half is Spec 68 and Spec 78). It mirrors Spec 132 (Spec 124 R-GU) and reuses the same
// machinery keyed by spec id: a generator with --check at pre-commit, a rule map generated from the registers, a
// citation resolver (spec-split-check arm iii-b) and a measured size cap (arm iv-b, generated_size_caps["133"]).
// Citation strings are built by concatenation so the arm (iii) census of this file never sees a fake one.

import { describe, expect, it, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(__dirname, '../../');
const SPEC_DIR = path.join(REPO_ROOT, 'docs/specs/01-pipeline');
const SPEC_133_REL = 'docs/specs/01-pipeline/133_bylaw_handbook.md';
const MAP_REL = 'scripts/analysis/bylaw/_schema/bylaw-rule-map.json';
const GENERATOR = path.join(REPO_ROOT, 'scripts/generate-bylaw-handbook.mjs');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

type Row = { family: string; clause: string | null; id: string; kind: string; file: string; section: string; headline: string; status: string; keyword: string; struck: boolean; owed: boolean; notes: number; enforcedBy: string };
type MapRule = { id: string; kind: string; handbook_line: string; status: string; source: { file: string; anchor: string } };
type RuleMap = { meta: Record<string, unknown>; sections: Array<{ id: string }>; lines: Array<{ id: string; section: string }>; rules: MapRule[] };
type Citation = { citation: string; kind: string; specId: string; lineId: string; rules: string[]; file: string; line: number };
type Checker = {
  SPEC_FILES: Record<string, string>;
  extractRoleBanners: (text: string) => string[];
  extractHandbookCitations: (text: string, file?: string) => Citation[];
  checkHandbookCitations: (citations: Citation[], maps: unknown) => string[];
  checkGeneratedSizeCaps: (texts: Record<string, string>, manifest: unknown) => string[];
};
type Reg = { headlineOf: (cell: string) => string; readBylawRegisterRows: (root?: string) => Row[]; familyOf: (text: string) => { clause: string | null; family: string } };
type Gen = { buildRuleMap: (rows: Row[]) => RuleMap; render: (map: RuleMap, rows: Row[]) => string };
type RuleMapMod = { HANDBOOKS: Record<string, { ruleMapRel: string; handbookRel: string }> };

let ck: Checker;
let reg: Reg;
let gen: Gen;
let rm: RuleMapMod;
beforeAll(async () => {
  ck = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/spec-split-check.mjs')).href)) as unknown as Checker;
  reg = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/bylaw/bylaw-register.mjs')).href)) as unknown as Reg;
  gen = (await import(pathToFileURL(GENERATOR).href)) as unknown as Gen;
  rm = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/gates/rule-map.mjs')).href)) as unknown as RuleMapMod;
});

const manifest = () => JSON.parse(fs.readFileSync(path.join(SPEC_DIR, '122_split_manifest.json'), 'utf8')) as Record<string, unknown> & {
  budgets: Record<string, unknown>;
  generated_size_caps: Record<string, { max_lines: number; max_bytes: number; why: string }>;
};
const cite133 = (line: string, rules = '') => `Spec 133 ${'§'}${line}${rules ? ` (${rules})` : ''}`;
const cite132 = (line: string, rules = '') => `Spec 132 ${'§'}${line}${rules ? ` (${rules})` : ''}`;
const run = (args: string[]) => spawnSync('node', [GENERATOR, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });

describe('M-260 — the register reader: every M-row and LC-row, one entry each', () => {
  it('reads the Spec 69a M-rows and the Spec 131 LC-rows, ids unique, dated notes folded into their row', () => {
    const rows = reg.readBylawRegisterRows();
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows.filter((r) => r.kind === 'M').length).toBeGreaterThanOrEqual(244);
    expect(rows.filter((r) => r.kind === 'LC').length).toBeGreaterThanOrEqual(62);
    expect(ids).toContain('M-176');
    expect(ids).toContain('LC-1');
    // M-19 is struck through in the register: it is history, not a rule.
    expect(rows.find((r) => r.id === 'M-19')!.struck).toBe(true);
    // M-15 carries dated notes under it.
    expect(rows.find((r) => r.id === 'M-15')!.notes).toBeGreaterThan(0);
    // Every row has a headline and a status keyword.
    for (const r of rows) {
      expect(r.headline.length, r.id).toBeGreaterThan(0);
      expect(r.keyword, r.id).toMatch(/^[A-Z]+$/);
    }
  });

  it('every register row id appears in the register file it is read from, and in no other', () => {
    for (const r of reg.readBylawRegisterRows()) expect(read(r.file), r.id).toContain(`**${r.id}**`.replace(/^\*\*(.*)\*\*$/, (_m, id) => (r.struck ? `~~${id}~~` : `**${id}**`)));
  });
});

describe('M-260 — the rule map is generated from the registers, never hand-written', () => {
  it('the committed rule map equals the map built from the registers (every row mapped once, none extra)', () => {
    const rows = reg.readBylawRegisterRows();
    const built = gen.buildRuleMap(rows);
    expect(JSON.parse(read(MAP_REL))).toEqual(JSON.parse(JSON.stringify(built)));
    expect(built.rules.map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it('each rule maps to exactly one line, and each line cites exactly one rule (id m.<n> / lc.<n>)', () => {
    const map = JSON.parse(read(MAP_REL)) as RuleMap;
    const lineIds = new Set(map.lines.map((l) => l.id));
    expect(lineIds.size).toBe(map.lines.length);
    for (const r of map.rules) {
      expect(lineIds.has(r.handbook_line), r.id).toBe(true);
      expect(r.handbook_line, r.id).toBe(r.id.toLowerCase().replace('-', '.'));
    }
    for (const l of map.lines) expect(map.rules.filter((r) => r.handbook_line === l.id).length, l.id).toBe(1);
    const sections = new Set(map.sections.map((s) => s.id));
    for (const l of map.lines) expect(sections.has(l.section), l.id).toBe(true);
  });

  it('the shared registry keys the handbooks by spec id: 132 and 133', () => {
    expect(rm.HANDBOOKS['132']!.handbookRel).toBe('docs/specs/01-pipeline/132_step_standard_handbook.md');
    expect(rm.HANDBOOKS['133']!.handbookRel).toBe(SPEC_133_REL);
    expect(rm.HANDBOOKS['133']!.ruleMapRel).toBe(MAP_REL);
  });
});

describe('M-260 — Spec 133 is a generated reading spec', () => {
  it('the committed file equals the render (the generator --check)', () => {
    const rows = reg.readBylawRegisterRows();
    expect(read(SPEC_133_REL)).toBe(gen.render(gen.buildRuleMap(rows), rows));
    const r = run(['--check']);
    expect(r.status, r.stderr).toBe(0);
  });

  it('carries the spec header: title, Status GENERATED, one role banner, authority sentence and the citation form', () => {
    const text = read(SPEC_133_REL);
    expect(text.split('\n')[0]).toBe('# SPEC 133 — By-law Handbook');
    expect(text).toMatch(/^\*\*Status:\*\* GENERATED$/m);
    expect(ck.extractRoleBanners(text)).toEqual(['generated handbook']);
    expect(text).toContain('Authority: Spec 69/69a M-rows and Spec 131 LC-rows (policy) + Spec 68 and Spec 78 (standard and behaviour); this spec is GENERATED from bylaw-rule-map.json — do not hand-edit');
    expect(text).toContain('`Spec 133 §<line id> (M-xx / LC-xx)`');
    // The by-law pair is 68 + 69/69a, lot configuration is 78 + 131 (Spec 124 R-GV).
    expect(text).toMatch(/By-laws.*Spec 68.*Spec 69\/69a/);
    expect(text).toMatch(/Lot configuration.*Spec 78.*Spec 131/);
    // The worked example in the header is a real line and a real rule that maps to it.
    const ex = /e\.g\. `(Spec 133 §[^`]+)`/.exec(text);
    expect(ex).not.toBeNull();
    const map = JSON.parse(read(MAP_REL)) as RuleMap;
    expect(ck.checkHandbookCitations(ck.extractHandbookCitations(ex![1]!), { '133': map })).toEqual([]);
  });

  it('renders every rule once, each line citing its binding rule id; rulings stay in the registers', () => {
    const rows = reg.readBylawRegisterRows();
    const text = read(SPEC_133_REL);
    const lineBlocks = text.split('\n').filter((l) => /^- \*\*(m|lc)\.[0-9]+\*\* /.test(l));
    expect(lineBlocks.length).toBe(rows.length);
    for (const r of rows) {
      const id = r.id.toLowerCase().replace('-', '.');
      expect(text, r.id).toContain(`- **${id}** `);
      expect(text, r.id).toContain(`Rules: \`${r.id}\``);
    }
    // No register table rows are copied in.
    expect(text).not.toMatch(/^\| \*\*(M|LC)-/m);
    // A line is a reading summary, not the ruling: no rendered line is longer than the clip.
    for (const l of lineBlocks) expect(l.length).toBeLessThanOrEqual(520);
  });

  it('M-19 (struck) is listed under history, not as an in-force rule', () => {
    const text = read(SPEC_133_REL);
    const at = text.search(/^## \d+\. History$/m);
    expect(at).toBeGreaterThan(0);
    const hist = text.slice(at);
    expect(hist).toContain('- **m.19** ');
    expect(text.slice(0, at)).not.toContain('- **m.19** ');
  });

  it('--write and --check need exactly one flag (an unknown or missing flag exits 2)', () => {
    expect(run([]).status).toBe(2);
    expect(run(['--write', '--check']).status).toBe(2);
    expect(run(['--nope']).status).toBe(2);
  });
});

describe('M-260 — spec-split-check resolves `Spec 133 §<line id> (M-xx / LC-xx)` (arm iii-b), keyed by spec id', () => {
  const maps = () => ({ '133': JSON.parse(read(MAP_REL)) as RuleMap });
  it('GREEN — a real line with its own M-row or LC-row resolves; Spec 132 citations still resolve against the step map', () => {
    const good = ck.extractHandbookCitations(`${cite133('m.176', 'M-176')} and ${cite133('lc.1', 'LC-1')} and ${cite133('m.0')}`);
    expect(good.map((c) => [c.specId, c.lineId, c.rules.join(',')])).toEqual([['133', 'm.176', 'M-176'], ['133', 'lc.1', 'LC-1'], ['133', 'm.0', '']]);
    expect(ck.checkHandbookCitations(good, maps())).toEqual([]);
    const stepMap = JSON.parse(read('scripts/steps/_schema/rule-map.json'));
    const mixed = ck.extractHandbookCitations(`${cite132('core.1')} ${cite133('m.176', 'M-176')}`);
    expect(ck.checkHandbookCitations(mixed, { '132': stepMap, ...maps() })).toEqual([]);
    // The single-map form (Spec 132 only) still works.
    expect(ck.checkHandbookCitations(ck.extractHandbookCitations(cite132('core.1')), stepMap)).toEqual([]);
  });
  it('RED — a missing line, a rule mapped elsewhere and an unknown rule each fire', () => {
    expect(ck.checkHandbookCitations(ck.extractHandbookCitations(cite133('m.99999')), maps()).join(' ')).toMatch(/m\.99999 is not a handbook line/);
    expect(ck.checkHandbookCitations(ck.extractHandbookCitations(cite133('m.176', 'M-175')), maps()).join(' ')).toMatch(/M-175 maps to m\.175, not m\.176/);
    expect(ck.checkHandbookCitations(ck.extractHandbookCitations(cite133('m.176', 'M-99999')), maps()).join(' ')).toMatch(/M-99999 is not a rule-map id/);
    expect(ck.checkHandbookCitations(ck.extractHandbookCitations(cite133('m.176', 'M-176')), {}).join(' ')).toMatch(/no rule map for Spec 133/);
  });
});

describe('M-260 — Spec 133 has a measured size cap, not a hand-written line budget (arm iv-b)', () => {
  it('generated_size_caps["133"] holds the file with its why; a tight cap or a hand-written budget fires', () => {
    const m = manifest();
    expect(m.budgets['133']).toBeUndefined();
    const cap = m.generated_size_caps['133']!;
    expect(cap.why.length).toBeGreaterThan(80);
    const text = read(SPEC_133_REL);
    const only133 = { ...m, generated_size_caps: { '133': cap } };
    expect(ck.checkGeneratedSizeCaps({ '133': text }, only133)).toEqual([]);
    // The cap is measured: above the file (room to grow) but not unbounded (at most 2x the measured size).
    const lines = text.split('\n').length - 1;
    const bytes = Buffer.byteLength(text, 'utf8');
    expect(cap.max_lines).toBeGreaterThanOrEqual(lines);
    expect(cap.max_bytes).toBeGreaterThanOrEqual(bytes);
    expect(cap.max_lines).toBeLessThanOrEqual(lines * 2);
    expect(cap.max_bytes).toBeLessThanOrEqual(bytes * 2);
    const tight = { ...m, generated_size_caps: { '133': { ...cap, max_bytes: 10 } } };
    expect(ck.checkGeneratedSizeCaps({ '133': text }, tight).join(' ')).toMatch(/SIZE CAP spec 133/);
    const both = { ...m, generated_size_caps: { '133': cap }, budgets: { ...m.budgets, '133': { headroom_pct: 10, measured_at: { lines: 1, bytes: 1, commit: 'x' } } } };
    expect(ck.checkGeneratedSizeCaps({ '133': text }, both).join(' ')).toMatch(/generated spec 133 also has a hand-written budget/);
    expect(ck.SPEC_FILES['133']).toBe('133_bylaw_handbook.md');
  });
});

describe('M-260 / R-IY — the rows, the decision log and the pre-commit wiring', () => {
  it('69a carries M-260 citing CHAT-43; 124a carries R-IY (amends R-GU, keyed by spec id) and not in Spec 124 itself', () => {
    const m260 = read('docs/specs/01-pipeline/69a_mcbylaw_register.md').split('\n').find((l) => l.startsWith('| **M-260** |'))!;
    expect(m260).toContain('2026-10-21-chat-batch-m-43#CHAT-43');
    expect(m260).toContain('Spec 133');
    const riy = read('docs/specs/01-pipeline/124a_step_standard_policy_appendix.md').split('\n').find((l) => l.startsWith('| R-IY |'))!;
    expect(riy).toContain('R-GU');
    expect(riy).toContain('M-260');
    expect(riy).not.toContain('chat-batch-m-43#CHAT-43');
    expect(read('docs/specs/01-pipeline/124_step_standard_policy.md')).not.toContain('| R-IY |');
  });

  it('decision-log --check is green (CHAT-43 has its routed row)', () => {
    const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts/analysis/decision-log.mjs'), '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('.husky/pre-commit runs the by-law handbook --check once, beside the step handbook', () => {
    const hook = read('.husky/pre-commit');
    const cmd = 'node scripts/generate-bylaw-handbook.mjs --check';
    expect(hook.split(cmd).length).toBe(2);
    expect(hook.indexOf(cmd)).toBeGreaterThan(hook.indexOf('node scripts/generate-step-handbook.mjs --check'));
  });
});

describe('M-260 — the handbook is grouped by provision family, derived from the first clause a row cites', () => {
  it('RED/GREEN — 10.20.40.10 and 10.80.40.10 share the family 40.10; 10.5 keeps its chapter; 150/800/900 are chapter families; no clause is general', () => {
    expect(reg.familyOf('Height 10.20.40.10(5) applies').family).toBe('40.10');
    expect(reg.familyOf('Height 10.80.40.10(1) applies').family).toBe('40.10');
    expect(reg.familyOf('R 10.10.40.10, RS 10.40.40.10').family).toBe('40.10');
    expect(reg.familyOf('platforms 10.5.40.60(3)').family).toBe('10.5.40.60');
    expect(reg.familyOf('garden suite 150.7.60.70(1)').family).toBe('150');
    expect(reg.familyOf('definition 800.50').family).toBe('800');
    expect(reg.familyOf('exception 900.3.10(42)').family).toBe('900');
    expect(reg.familyOf('no clause here, Spec 78 6.7').family).toBe('general');
    // verify-26 note 3: the old short form 5.10.x is its own family, like 10.5; zone shorthand x.40.10 joins 40.10
    expect(reg.familyOf('subject of 5.10.175.1(1) is a fence').family).toBe('5.10.175.1');
    expect(reg.familyOf('main-wall LIMITs x.40.10(2) displaced').family).toBe('40.10');
    expect(reg.familyOf('x.30.40(1)(D) frontage').family).toBe('30.40');
    expect(reg.familyOf('chapter 220.5.10.1 only').family).toBe('general');
    // several clauses: the first one in the text wins
    expect(reg.familyOf('10.80.40.10 then 10.20.30.1').clause).toBe('10.80.40.10');
    expect(reg.familyOf('10.80.40.10 then 10.20.30.1').family).toBe('40.10');
  });

  it('the rows really group across zones, and unmatched rows are general', () => {
    const rows = reg.readBylawRegisterRows();
    const zonesOf = (fam: string) => new Set(rows.filter((r) => r.family === fam && r.clause).map((r) => /^10\.(10|20|40|60|80)\./.exec(r.clause!)?.[1]).filter(Boolean));
    const fams = new Set(rows.map((r) => r.family));
    expect([...fams].some((f) => zonesOf(f).size >= 2)).toBe(true);
    for (const r of rows) if (!r.clause) expect(r.family, r.id).toBe('general');
    expect(rows.some((r) => r.family === 'general')).toBe(true);
  });

  it('every in-force line sits in exactly one family section; history stays apart; line ids are still m.<n> / lc.<n>', () => {
    const map = JSON.parse(read(MAP_REL)) as RuleMap;
    const rows = reg.readBylawRegisterRows();
    for (const l of map.lines) {
      const rule = map.rules.find((r) => r.handbook_line === l.id)!;
      const row = rows.find((r) => r.id === rule.id)!;
      expect(l.section, l.id).toBe(rule.status === 'history' ? 'history' : `fam-${row.family}`);
      expect(l.id).toBe(rule.id.toLowerCase().replace('-', '.'));
    }
    const text = read(SPEC_133_REL);
    expect(text).toMatch(/^### 40\.10( — .+)?$/m);
    expect(text).toMatch(/^### General \/ cross-cutting$/m);
  });
});

describe('M-260 — a headline sentence does not end at an abbreviation (verify-26 note A)', () => {
  it('e.g. and i.e. do not end the sentence', () => {
    const h = reg.headlineOf('**Sweep.** A mechanical sweep over every agreed unit, e.g. the M-75 units, is run; the rest is manual.');
    expect(h).toContain('e.g. the M-75 units');
    expect(h.endsWith('e.g.')).toBe(false);
    const h2 = reg.headlineOf('**Ok.** The rule applies i.e. everywhere in the zone. Second sentence.');
    expect(h2).toContain('i.e. everywhere in the zone.');
    expect(h2).not.toContain('Second sentence');
  });
  it('no rendered headline ends at an abbreviation', () => {
    for (const r of reg.readBylawRegisterRows()) expect(r.headline, r.id).not.toMatch(/\b(e\.g|i\.e|etc|vs|cf)\.?$/);
  });
});
