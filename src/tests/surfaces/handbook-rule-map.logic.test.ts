// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-10 (the generator lives in the spec; this is its named lock),
//            docs/specs/01-pipeline/124_step_standard_policy.md R-GU (the generated handbook form), R-IY (tooling keyed by spec id),
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IY.
//
// MF-18 · McFrontend queue · lane G. The lock for FE-10 and for the Spec 136 generator (scripts/surfaces/generate-surface-handbook.mjs).
// It is NOT the Spec 132 lock (src/tests/handbook-rule-map.logic.test.ts) and not the Spec 133 lock (src/tests/spec133-bylaw-handbook.logic.test.ts);
// it holds the same statement for the McFrontend handbook: "the committed rule map and the committed Spec 136 equal what the generator builds from
// the Spec 135 FE rows". Every RED case plants a defect in an in-memory register text or a temp root, never in the repo. No DB, no network.
// The shared CLI shell (runHandbookCli, scripts/analysis/gates/rule-map.mjs) is exercised here through the 136 entry (case H6).
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HANDBOOKS, runHandbookCli } from '../../../scripts/analysis/gates/rule-map.mjs';
import { headlineOf } from '../../../scripts/analysis/bylaw/bylaw-register.mjs';
import { parseRegisterRows } from '../../../scripts/analysis/mcbylaws/cite-parse.mjs';
import { mapFindings } from '../../../scripts/generate-bylaw-handbook.mjs';
import { checkHandbookCitations, extractRoleBanners } from '../../../scripts/analysis/spec-split-check.mjs';
import { NAMED_PATHS, REGISTER_REL, build, buildRuleMap, readFeRows, render } from '../../../scripts/surfaces/generate-surface-handbook.mjs';

const ROOT = path.resolve(__dirname, '../../../');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SPEC = HANDBOOKS['136' as keyof typeof HANDBOOKS] as { ruleMapRel: string; handbookRel: string; generator: string; tag: string };
const REGISTER = read(REGISTER_REL);
const realRows = () => readFeRows(REGISTER);
type Row = ReturnType<typeof realRows>[number];

// A register text with the given rows (id, ruling, status cell); the "Next free id" line follows the last row.
const row = (id: string, status: string, ruling = `Ruling for ${id}, a plain sentence.`, idCell = id) => `| ${idCell} | ${ruling} | 126 0a | D | Operator verbatim: "x". | ${status} |`;
const reg = (rows: string[], next?: number) => `# R\n\n**Next free id:** \`FE-${String(next ?? rows.length + 1).padStart(2, '0')}\`.\n\n## Register\n\n| # | Ruling | Amends | Six | Full | Status |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
const LOCK = 'src/tests/surfaces/x.logic.test.ts';
const GOOD = [row('FE-01', 'RULED 2026-11-04. Lock: see FE-02.'), row('FE-02', `RULED 2026-11-09, lock landed abc. Lock: \`${LOCK}\`. Dated note 2026-11-09 (a). Dated note 2026-11-10 (b).`), row('FE-03', 'OWED `src/tests/surfaces/y.logic.test.ts`')];

const tmps: string[] = [];
// A temp repo root: the register text, every path the handbook names, and every lock a row names (empty files).
function makeRoot(registerText: string, extra: string[] = []): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mf18-'));
  tmps.push(root);
  const put = (rel: string, text = '') => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  put(REGISTER_REL, registerText);
  for (const p of NAMED_PATHS as string[]) if (p !== REGISTER_REL) put(p);
  for (const m of registerText.matchAll(/`(src\/tests\/[^`]+\.test\.ts)`/g)) put(m[1]!);
  for (const p of extra) put(p);
  return root;
}
afterAll(() => { for (const t of tmps) fs.rmSync(t, { recursive: true, force: true }); });

describe('FE-10 H1 — the reader: every FE row, no row can vanish', () => {
  it('reads the live register: >= 30 rows, FE-01..FE-nn contiguous, "Next free id" follows the last, status and locks equal the gate reader', () => {
    const rows = realRows();
    expect(rows.length).toBeGreaterThanOrEqual(30);
    const next = /\*\*Next free id:\*\*\s*`FE-(\d+)`/.exec(REGISTER);
    expect(Number(next![1])).toBe(rows.length + 1);
    rows.forEach((r: Row, i: number) => expect(r.id).toBe(`FE-${String(i + 1).padStart(2, '0')}`));
    expect(new Set(rows.map((r: Row) => r.id)).size).toBe(rows.length);
    const gate = parseRegisterRows(REGISTER);
    for (const r of rows) {
      expect(r.headline.length, r.id).toBeGreaterThan(0);
      expect(r.headline.length, r.id).toBeLessThanOrEqual(300);
      // A headline over 300 characters is clipped by headlineOf and ends in an ellipsis; the full ruling stays in Spec 135.
      if (r.headline.endsWith('…')) expect(r.headline.length, r.id).toBeGreaterThan(250);
      expect(['RULED', 'OWED', 'RETIRED']).toContain(r.status);
      expect(r.status, r.id).toBe(gate.get(r.id)!.status);
      expect(r.locks, r.id).toEqual(gate.get(r.id)!.locks);
    }
  });

  it('RED: a struck id, a bold id, a PROPOSED row, a numbering gap, a wrong "Next free id" and a short row each throw', () => {
    expect(() => readFeRows(reg([...GOOD.slice(0, 2), row('FE-03', 'OWED `a.logic.test.ts`', 'r', '~~**FE-03**~~')]))).toThrow(/not plain/);
    expect(() => readFeRows(reg([...GOOD.slice(0, 2), row('FE-03', 'OWED `a.logic.test.ts`', 'r', '**FE-03**')]))).toThrow(/not plain/);
    expect(() => readFeRows(reg([...GOOD.slice(0, 2), row('FE-03', 'PROPOSED')]))).toThrow(/PROPOSED/);
    expect(() => readFeRows(reg([GOOD[0]!, row('FE-03', 'RULED 2026-11-04.')], 4))).toThrow(/no gap/);
    expect(() => readFeRows(reg(GOOD, 9))).toThrow(/Next free id/);
    expect(() => readFeRows(reg([...GOOD, '| FE-04 | too | few |'], 5))).toThrow(/cells/);
    expect(() => readFeRows(reg([...GOOD, GOOD[0]!], 5))).toThrow(/twice/);
    for (const bad of ['pending', '', 'RULD 2026-11-09', 'ratified']) expect(() => readFeRows(reg([...GOOD.slice(0, 2), row('FE-03', bad)])), bad).toThrow(/closed word/);
  });

  it('control: the planted-text reader reads status, date, locks and counts only the dated notes of the form "Dated note <date>"', () => {
    const r = readFeRows(reg([...GOOD, row('FE-04', 'RULED 2026-11-05. A Dated note appears here in prose. Dated note 2026-11-06 (z).')]));
    expect(r.map((x: Row) => [x.id, x.status, x.date, x.locks.length, x.notes])).toEqual([['FE-01', 'RULED', '2026-11-04', 0, 0], ['FE-02', 'RULED', '2026-11-09', 1, 2], ['FE-03', 'OWED', '', 1, 0], ['FE-04', 'RULED', '2026-11-05', 0, 1]]);
  });

  it('Spec 135 FE-10 reads RULED and names exactly this lock (the FE-10 flip, MF-18)', () => {
    const fe10 = realRows().find((r: Row) => r.id === 'FE-10');
    expect(fe10?.status).toBe('RULED');
    expect(fe10?.locks).toEqual(['src/tests/surfaces/handbook-rule-map.logic.test.ts']);
  });

  it('pins headlineOf on three FE-shaped cells, so a change in the by-law reader fails this lock by name', () => {
    expect(headlineOf('P1 Declared, not coded: a screen is a descriptor.')).toBe('P1 Declared, not coded: a screen is a descriptor.');
    expect(headlineOf('`parcels` is a source in the closed binding set: a `column`.')).toBe('parcels is a source in the closed binding set: a column.');
    const long = headlineOf(`Word ${'long text here '.repeat(40)}end.`);
    expect(long.length).toBeLessThanOrEqual(300);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('FE-10 H2/H3 — the rule map: built from the register, one rule per line', () => {
  const rows = realRows();
  const committed = JSON.parse(read(SPEC.ruleMapRel));
  const regRead = (rel: string) => read(rel);

  it('the committed map deep-equals the map built from the register; it has >= 30 rules', () => {
    expect(committed.rules.length).toBeGreaterThanOrEqual(30);
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildRuleMap(rows))));
  });

  it('RED: a flipped status, a dropped rule and an extra rule each differ from the build (plant detected)', () => {
    const flip = structuredClone(committed); flip.rules[0].status = flip.rules[0].status === 'owed' ? 'active' : 'owed';
    const drop = structuredClone(committed); drop.rules.pop();
    const extra = structuredClone(committed); extra.rules.push({ ...extra.rules[0], id: 'FE-99' });
    for (const m of [flip, drop, extra]) expect(m).not.toEqual(JSON.parse(JSON.stringify(buildRuleMap(rows))));
  });

  it('shape: closed sections, one rule per line and one line per rule, line ids fe.nn, map vs register findings are empty', () => {
    expect(committed.sections.map((s: { id: string }) => s.id)).toEqual(['rules', 'history']);
    expect(committed.lines.length).toBe(committed.rules.length);
    for (const l of committed.lines) {
      expect(l.id).toMatch(/^fe\.\d+$/);
      expect(['rules', 'history']).toContain(l.section);
      expect(committed.rules.filter((r: { handbook_line: string }) => r.handbook_line === l.id).length).toBe(1);
    }
    expect(mapFindings(committed, rows, regRead)).toEqual([]);
  });

  it('RED: an unmapped row, a stale rule, a missing anchor and a line with no rule each produce a finding', () => {
    const unmapped = structuredClone(committed); unmapped.rules.pop(); unmapped.lines.pop();
    const stale = structuredClone(committed); stale.rules.push({ ...stale.rules[0], id: 'FE-98', handbook_line: 'fe.98' }); stale.lines.push({ id: 'fe.98', section: 'rules' });
    const anchor = structuredClone(committed); anchor.rules[0].source.anchor = 'FE-97';
    const noRule = structuredClone(committed); noRule.lines.push({ id: 'fe.96', section: 'rules' });
    expect(mapFindings(unmapped, rows, regRead).join()).toMatch(/no rule-map entry/);
    expect(mapFindings(stale, rows, regRead).join()).toMatch(/not in a register/);
    expect(mapFindings(anchor, rows, regRead).join()).toMatch(/anchor FE-97 not found/);
    expect(mapFindings(noRule, rows, regRead).join()).toMatch(/does not cite exactly one rule/);
  });

  it('status mapping: RULED to active, OWED to owed, RETIRED to history (a history line), planted', () => {
    const planted = readFeRows(reg([...GOOD, row('FE-04', 'RETIRED 2026-11-09. Superseded.')]));
    const map = buildRuleMap(planted);
    expect(map.rules.map((r: { status: string }) => r.status)).toEqual(['active', 'active', 'owed', 'history']);
    expect(map.lines.map((l: { section: string }) => l.section)).toEqual(['rules', 'rules', 'rules', 'history']);
  });
});

describe('FE-10 H4 — the committed Spec 136 equals the render, and tells the truth about enforcement', () => {
  const text = read(SPEC.handbookRel);
  it('equals the build, and two builds are identical', () => {
    expect(text).toBe(build(ROOT).text);
    expect(build(ROOT).text).toBe(build(ROOT).text);
  });

  it('every FE row appears exactly once as a line; no register table row is copied in; OWED rows are the gate reader\'s OWED rows', () => {
    const gate = parseRegisterRows(REGISTER);
    for (const r of realRows()) expect(text.split(`- **fe.${r.id.slice(3)}** `).length - 1, r.id).toBe(1);
    expect(text).not.toMatch(/^\| FE-\d+ \|/m);
    const owedInText = [...text.matchAll(/^- \*\*fe\.(\d+)\*\*[^\n]*\n {2}Status: OWED/gm)].map((m) => `FE-${m[1]}`);
    const owedGate = [...gate].filter(([id, v]) => /^FE-\d+$/.test(id) && v.status === 'OWED').map(([id]) => id);
    expect(owedInText.sort()).toEqual(owedGate.sort());
  });

  it('no OWED line says "Enforced by"; every "Enforced by" path exists', () => {
    for (const m of text.matchAll(/^ {2}Status: (.*)$/gm)) {
      const st = m[1]!;
      if (st.startsWith('OWED')) expect(st).not.toMatch(/Enforced by/);
      const e = /Enforced by: ([^·]+)/.exec(st);
      if (e) for (const p of e[1]!.split(',').map((s) => s.trim())) expect(fs.existsSync(path.join(ROOT, p)), p).toBe(true);
    }
  });

  it('RED: a RULED row that names a missing lock, a missing named path and a map that disagrees with the register each make the render throw', () => {
    const planted = reg([row('FE-01', 'RULED 2026-11-04. Lock: `src/tests/surfaces/gone.logic.test.ts`.')]);
    const root = makeRoot(planted);
    fs.rmSync(path.join(root, 'src/tests/surfaces/gone.logic.test.ts'));
    expect(() => build(root)).toThrow(/lock that does not exist/);
    const root2 = makeRoot(reg(GOOD));
    fs.rmSync(path.join(root2, NAMED_PATHS[0]!));
    expect(() => build(root2)).toThrow(/does not exist/);
    const rows = readFeRows(reg(GOOD));
    const bad = buildRuleMap(rows); bad.rules.pop(); bad.lines.pop();
    expect(() => render(bad, rows, makeRoot(reg(GOOD)))).toThrow(/does not match the register/);
  });

  it('a RETIRED row renders only under History; an empty History says "None yet."', () => {
    const planted = reg([...GOOD, row('FE-04', 'RETIRED 2026-11-09.')]);
    const t = build(makeRoot(planted)).text;
    expect(t.indexOf('- **fe.04**')).toBeGreaterThan(t.indexOf('## 3. History'));
    expect(build(makeRoot(reg(GOOD))).text).toMatch(/## 3\. History[\s\S]*None yet\./);
    expect(text).toMatch(/## 3\. History[\s\S]*None yet\./);
  });
});

describe('FE-10 H5 — the header: status, one banner, authority sentence, citation form that resolves', () => {
  const text = read(SPEC.handbookRel);
  it('Status GENERATED, exactly one generated-handbook banner, the authority sentence, the scope line', () => {
    expect(text).toMatch(/^\*\*Status:\*\* GENERATED$/m);
    expect(extractRoleBanners(text)).toEqual(['generated handbook']);
    expect(text).toContain('If this page and a register row disagree, the register row governs on policy');
    expect(text).toContain(`v1 covers the ${realRows().length} FE rulings of Spec 135. The policy rows R-01..R-34 are in Spec 128 §5 until MF-31.`);
  });

  it('the worked example is a real line and its rule maps to it (arm iii-b resolver, called with a built citation)', () => {
    const m = /e\.g\. `Spec 136 §(fe\.\d+) \((FE-\d+)\)`/.exec(text)!;
    expect(m).not.toBeNull();
    const map = JSON.parse(read(SPEC.ruleMapRel));
    const cite = { citation: m[0], kind: 'handbook', specId: '136', lineId: m[1], rules: [m[2]], file: '', line: 1 };
    expect(checkHandbookCitations([cite], { 136: map })).toEqual([]);
    expect(checkHandbookCitations([{ ...cite, lineId: 'fe.99' }], { 136: map })).not.toEqual([]);
    expect(checkHandbookCitations([{ ...cite, rules: ['FE-02'], lineId: 'fe.03' }], { 136: map })).not.toEqual([]);
  });
});

describe('FE-10 H6 — the shell: --check and --write on a temp root, exit codes and messages', () => {
  const run = (root: string, argv: string[]) => {
    const out: string[] = []; const err: string[] = [];
    const code = runHandbookCli({ spec: '136', argv, build: (r: string) => build(r), root, out: (s: string) => out.push(s), err: (s: string) => err.push(s), process: {} as never });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };
  const files = (root: string) => [SPEC.ruleMapRel, SPEC.handbookRel].map((p) => fs.readFileSync(path.join(root, p), 'utf8'));

  it('registry: the 136 entry names the files and the generator; 132 and 133 keep theirs', () => {
    expect(SPEC.ruleMapRel).toBe('scripts/surfaces/_schema/surface-rule-map.json');
    expect(SPEC.handbookRel).toBe('docs/specs/02-web-admin/136_mcfrontend_handbook.md');
    expect(SPEC.generator).toBe('scripts/surfaces/generate-surface-handbook.mjs');
    expect(HANDBOOKS['133'].handbookRel).toBe('docs/specs/01-pipeline/133_bylaw_handbook.md');
    expect(HANDBOOKS['132'].handbookRel).toBe('docs/specs/01-pipeline/132_step_standard_handbook.md');
  });

  it('missing files, then --write, then --check exit 0; --write twice is byte-identical (second run changes nothing)', () => {
    const root = makeRoot(REGISTER, realRows().flatMap((r: Row) => r.locks));
    const missing = run(root, ['--check']);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain(SPEC.ruleMapRel);
    expect(missing.err).toContain(SPEC.handbookRel);
    expect(missing.err).toContain('--write');
    expect(run(root, ['--write']).code).toBe(0);
    const first = files(root);
    expect(run(root, ['--check']).code).toBe(0);
    expect(run(root, ['--write']).code).toBe(0);
    expect(files(root)).toEqual(first);
    expect(first[1]).toBe(build(root).text);
  });

  it('RED: a stale handbook and a stale map each exit 1 and name that file only', () => {
    const root = makeRoot(REGISTER, realRows().flatMap((r: Row) => r.locks));
    run(root, ['--write']);
    fs.appendFileSync(path.join(root, SPEC.handbookRel), 'hand edit\n');
    const a = run(root, ['--check']);
    expect(a.code).toBe(1);
    expect(a.err).toContain(SPEC.handbookRel);
    expect(a.err).not.toContain(SPEC.ruleMapRel);
    run(root, ['--write']);
    fs.appendFileSync(path.join(root, SPEC.ruleMapRel), ' ');
    const b = run(root, ['--check']);
    expect(b.code).toBe(1);
    expect(b.err).toContain(SPEC.ruleMapRel);
    expect(b.err).not.toContain(SPEC.handbookRel);
  });

  it('usage: no flag, both flags and an unknown flag exit 2; a build that throws exits 1 with its message', () => {
    const root = makeRoot(REGISTER, realRows().flatMap((r: Row) => r.locks));
    for (const argv of [[], ['--write', '--check'], ['--nope'], ['--check', '--nope']]) {
      const r = run(root, argv);
      expect(r.code, argv.join(' ')).toBe(2);
      expect(r.err).toContain(`usage: node ${SPEC.generator} --write | --check`);
    }
    const bad = makeRoot(reg(GOOD, 9));
    const r = run(bad, ['--check']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Next free id');
  });

  it('the committed files are current: --check on the repo exits 0', () => {
    const r = run(ROOT, ['--check']);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain(SPEC.tag);
  });
});
