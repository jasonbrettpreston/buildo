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
import { headlineOf, splitRow } from '../../../scripts/analysis/bylaw/bylaw-register.mjs';
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
      // MF-95 A-T3 (task-430, RR-0384 "stop the clipping"): the 300-character clip of the shared headlineOf no longer reaches Spec 136;
      // a ruling prints whole, so no headline ends in the clip ellipsis (the pin on the shared function below stays).
      expect(r.headline.endsWith('…'), r.id).toBe(false);
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

// MF-95 commit A (task-430, RR-0384 "stop the clipping"; plan section 4, A1). The shared headlineOf (scripts/analysis/bylaw/bylaw-register.mjs)
// still clips at 300 characters for Spec 133 (pinned above); the Spec 136 generator prints the plain text of the Ruling cell instead wherever the
// shared result was clipped. The test-side plain() is the same three replacements as the shared reader (bylaw-register.mjs plain()).
const plainCell = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/\*\*|~~|`/g, '').replace(/\s+/g, ' ').trim();
const rulingCells = (text: string) => new Map(text.split('\n').filter((l) => /^\| FE-\d+ \|/.test(l)).map((l) => { const c = splitRow(l); return [c[0]!, c[1]!] as const; }));
const sized = (n: number, tail = '.') => { let s = 'Ruling'; for (let i = 0; s.length < n - tail.length; i += 1) s += ` w${i % 10}`; return `${s.slice(0, n - tail.length)}${tail}`; };
const CLIPPED_TODAY = ['FE-18', 'FE-19', 'FE-29', 'FE-30', 'FE-31', 'FE-34', 'FE-35', 'FE-36', 'FE-37', 'FE-38', 'FE-39', 'FE-40', 'FE-41', 'FE-42', 'FE-43', 'FE-44'];
// A literal bar in a real cell is written back escaped (splitRow reads a backslash-bar as a literal bar), so the planted row keeps six cells.
const headlineFor = (cell: string) => readFeRows(reg([row('FE-01', 'RULED 2026-11-04.', cell.replace(/\|/g, '\\|'))]))[0]!.headline;

describe('MF-95 A — Spec 136 prints every ruling whole (no clip)', () => {
  it('A-T1 RED: a 700-character ruling with no bold prints whole; control: a 120-character ruling equals the shared headlineOf', () => {
    const long = sized(700);
    expect(long.length).toBe(700);
    expect(headlineOf(long).endsWith('…')).toBe(true);
    const h = headlineFor(long);
    expect(h.endsWith('…')).toBe(false);
    expect(h).toBe(plainCell(long));
    const short = sized(120);
    expect(headlineFor(short)).toBe(headlineOf(short));
  });

  it('A-T2 real register: no headline ends in an ellipsis; the 16 rows clipped before MF-95 are longer than 300; every headline is the plain text of its cell', () => {
    const cells = rulingCells(REGISTER);
    for (const r of realRows()) {
      expect(r.headline.endsWith('…'), r.id).toBe(false);
      expect(r.headline, r.id).toBe(plainCell(cells.get(r.id)!));
    }
    for (const id of CLIPPED_TODAY) expect(realRows().find((r: Row) => r.id === id)!.headline.length, id).toBeGreaterThan(300);
  });

  it('A-T5: a 299-character cell with an authored ellipsis is unchanged; 700 and 990 characters print whole', () => {
    const authored = sized(299, '…');
    expect(authored.length).toBe(299);
    expect(headlineFor(authored)).toBe(headlineOf(authored));
    expect(headlineFor(authored).endsWith('…')).toBe(true);
    for (const n of [700, 990]) {
      const cell = sized(n);
      expect(headlineFor(cell), String(n)).toBe(cell);
      expect(headlineFor(cell).length, String(n)).toBe(n);
    }
  });

  it('A-T6 drift lock (ruling Q9): the copy equals the shared headlineOf wherever the shared one is neither clipped nor stripped of a trailing bracket, and is the plain cell where it is (real rows and planted cells)', () => {
    const cells = [...rulingCells(REGISTER).values()];
    const planted = [
      sized(500), // a long cell
      `${sized(400, '')} (operator, verbatim 2026-11-09).`, // a long cell ending in a provenance bracket: the copy keeps the bracket (it does not call stripProvenance)
      `${sized(200, '')}<br>${sized(200)}`, // a cell with a br tag
      `${sized(120, '')} (operator, verbatim 2026-11-09).`, // short with provenance: unclipped, the shared rule strips the bracket; the copy keeps it (Q9: a handbook headline keeps its cite)
    ];
    for (const cell of [...cells, ...planted]) {
      const shared = headlineOf(cell);
      const mine = headlineFor(cell);
      if (shared === plainCell(cell)) expect(mine).toBe(shared);
      else if (!shared.endsWith('…') || plainCell(cell).length <= 300) {
        expect(mine).toBe(plainCell(cell));
        expect(mine.startsWith(shared.replace(/[.;:]$/, ''))).toBe(true);
      } else {
        expect(mine.startsWith(shared.slice(0, -1).trimEnd())).toBe(true);
        expect(mine.length).toBeGreaterThan(shared.length);
        expect(mine).toBe(plainCell(cell));
      }
    }
    expect(headlineFor(planted[1]!)).toMatch(/\(operator, verbatim 2026-11-09\)\.$/);
    expect(headlineFor(planted[3]!)).toMatch(/\(operator, verbatim 2026-11-09\)\.$/);
  });

  it('Q9 pin: the FE-54 line keeps its cite (the shared stripProvenance would drop it)', () => {
    // found by its lock path, not its id (FE-54 on this branch; renumbered at landing, plan 17.5)
    expect(realRows().find((r: Row) => r.locks[0] === 'src/tests/surfaces/failure-state-declared.logic.test.ts')!.headline.endsWith('(Spec 128 Rule 12, 128:39).')).toBe(true);
  });
});

// MF-95 commit B (task-430, RR-0384 "make each line reflect its notes"; plan sections 5, 17.3, 17.4). A Current reading is ONE dated note in the
// strict form of 17.4, last in its row's Status cell; the generator prints it on the SAME line as the headline (the OWED pin of H4 matches
// `^- **fe.N**[^\n]*\n  Status: OWED`, and Spec 133's renderLine is not touched). Refusals (i)..(vii) of 17.4 are each planted below.
const readingOf = (r: Row) => (r as unknown as { reading?: { text: string; dates: string[] } }).reading;
const READING_IDS = ['FE-01', 'FE-02', 'FE-07', 'FE-11', 'FE-14', 'FE-18', 'FE-19', 'FE-20', 'FE-29', 'FE-31', 'FE-38', 'FE-39'];
const readingNote = (id: string, text: string, dates: string, own = '2026-11-22') =>
  `Dated note ${own} (M-246, prior text kept; ${id} · McFrontend queue · lane BL-HB430; RR-0384, operator, verbatim: "Approved"; lane text restating the notes dated ${dates} of this row, not an operator word and not a ruling): Current reading: ${text} (from notes dated ${dates}). The cell text above is kept.`;
const BASE2 = `RULED 2026-11-09, lock landed abc. Lock: \`${LOCK}\`. Dated note 2026-11-09 (a). Dated note 2026-11-10 (b).`;
const withReading = (status: string, note: string) => [GOOD[0]!, row('FE-02', `${status} ${note}`), GOOD[2]!];
const lineOf2 = (text: string) => text.split('\n').find((l) => l.startsWith('- **fe.02** '))!;

describe('MF-95 B — each line reflects its notes (Current reading)', () => {
  it('B-T1 RED: a row whose last note is a Current reading prints it on its line; B-T2 control: the same row without it prints as before', () => {
    const t = build(makeRoot(reg(withReading(BASE2, readingNote('FE-02', 'The rule now reaches every page.', '2026-11-09, 2026-11-10'))))).text;
    expect(lineOf2(t)).toBe('- **fe.02** Ruling for FE-02, a plain sentence. Current reading (lane text, notes 2026-11-09, 2026-11-10): The rule now reaches every page.');
    expect(t).toMatch(/- \*\*fe\.02\*\* [^\n]*\n {2}Status: RULED 2026-11-09 · Enforced by: [^\n]* · \+3 dated notes\n/);
    const plainT = build(makeRoot(reg(GOOD))).text;
    expect(lineOf2(plainT)).toBe('- **fe.02** Ruling for FE-02, a plain sentence.');
    expect(plainT.split('## 2. Rules')[1]).not.toMatch(/Current reading/);
    const r = readFeRows(reg(withReading(BASE2, readingNote('FE-02', 'X.', '2026-11-10'))))[1]!;
    expect(readingOf(r)).toEqual({ text: 'X.', dates: ['2026-11-10'] });
  });

  it('B-T3 RED (i): a dated note after the Current reading throws; control: the reading last builds', () => {
    const note = readingNote('FE-02', 'X.', '2026-11-10');
    expect(() => readFeRows(reg(withReading(BASE2, `${note} Dated note 2026-11-23 (c).`)))).toThrow(/FE-02: a dated note follows the Current reading; restate it/);
    expect(() => readFeRows(reg(withReading(BASE2, note)))).not.toThrow();
  });

  it('B-T4 RED (ii): a cited date that is not the date of an earlier note of the row throws; control: real dates', () => {
    expect(() => readFeRows(reg(withReading(BASE2, readingNote('FE-02', 'X.', '2026-11-08'))))).toThrow(/FE-02: the Current reading cites 2026-11-08/);
    expect(() => readFeRows(reg(withReading(BASE2, readingNote('FE-02', 'X.', '2026-11-09'))))).not.toThrow();
  });

  it('B-T5 RED (iii): a reading of 801 characters throws; control: 800', () => {
    expect(() => readFeRows(reg(withReading(BASE2, readingNote('FE-02', `${'y'.repeat(800)}.`, '2026-11-09'))))).toThrow(/FE-02: the Current reading is 801 characters/);
    expect(() => readFeRows(reg(withReading(BASE2, readingNote('FE-02', `${'y'.repeat(799)}.`, '2026-11-09'))))).not.toThrow();
  });

  it('B-T8 RED (v): a malformed reading note throws; the words Current reading in the prose of an earlier note are not a reading', () => {
    const broken = readingNote('FE-02', 'X.', '2026-11-10').replace(' (from notes dated 2026-11-10)', '');
    expect(() => readFeRows(reg(withReading(BASE2, broken)))).toThrow(/FE-02: the Current reading note does not parse/);
    const wrongRow = readingNote('FE-07', 'X.', '2026-11-10');
    expect(() => readFeRows(reg(withReading(BASE2, wrongRow)))).toThrow(/FE-02: the Current reading note does not parse/);
    const prose = 'RULED 2026-11-09. Lock: `src/tests/surfaces/x.logic.test.ts`. Dated note 2026-11-09 (the old Current reading: words were dropped).';
    const r = readFeRows(reg(withReading(prose, readingNote('FE-02', 'The new words.', '2026-11-09'))))[1]!;
    expect(readingOf(r)).toEqual({ text: 'The new words.', dates: ['2026-11-09'] });
  });

  it('B-T9 RED (vi): a reading that cites its own date throws (the own date is also not an earlier note)', () => {
    const own = `${BASE2} Dated note 2026-11-22 (d).`;
    expect(() => readFeRows(reg(withReading(own, readingNote('FE-02', 'X.', '2026-11-22'))))).toThrow(/FE-02: the Current reading cites its own date 2026-11-22/);
  });

  it('(vii) RED: a reading text holding a bar throws', () => {
    expect(() => readFeRows(reg(withReading(BASE2, readingNote('FE-02', 'a \\| b.', '2026-11-09'))))).toThrow(/FE-02: the Current reading holds a bar/);
  });

  it('B-T10: an OWED row with a reading renders it on the headline line, the Status line next (the RULED case is B-T1)', () => {
    const owed = [GOOD[0]!, GOOD[1]!, row('FE-03', `OWED \`src/tests/surfaces/y.logic.test.ts\` Dated note 2026-11-12 (q). ${readingNote('FE-03', 'Now owed wider.', '2026-11-12')}`)];
    const t = build(makeRoot(reg(owed))).text;
    expect(t).toMatch(/^- \*\*fe\.03\*\* Ruling for FE-03, a plain sentence\. Current reading \(lane text, notes 2026-11-12\): Now owed wider\.\n {2}Status: OWED · lock owed: src\/tests\/surfaces\/y\.logic\.test\.ts · \+2 dated notes$/m);
  });

  it('B-T6, B-T7, B-T11 real register: exactly the 12 ruled rows carry a reading (pinned), each parses, is at most 800 characters, is printed, and adds exactly one dated note', () => {
    const rows = realRows();
    expect(rows.filter((r: Row) => readingOf(r)).map((r: Row) => r.id)).toEqual(READING_IDS);
    const text = read(SPEC.handbookRel);
    const cells = new Map(REGISTER.split('\n').filter((l) => /^\| FE-\d+ \|/.test(l)).map((l) => { const c = splitRow(l); return [c[0]!, c[5]!] as const; }));
    for (const r of rows) {
      const line = text.split('\n').find((l) => l.startsWith(`- **fe.${r.id.slice(3)}** `))!;
      const rd = readingOf(r);
      if (!rd) { expect(line, r.id).not.toMatch(/Current reading/); continue; }
      expect(rd.text.length, r.id).toBeLessThanOrEqual(800);
      expect(line, r.id).toBe(`- **fe.${r.id.slice(3)}** ${r.headline} Current reading (lane text, notes ${rd.dates.join(', ')}): ${rd.text}`);
      const cell = cells.get(r.id)!;
      const before = cell.slice(0, cell.lastIndexOf('Dated note '));
      expect(r.notes, r.id).toBe((before.match(/Dated note \d{4}-\d{2}-\d{2}/g) || []).length + 1);
    }
  });
});

// MF-95 commit C (task-430, RR-0384 "add these 13 lines"; plan sections 6, 17.2, 17.6). The thirteen rows are OWED, each naming one lock path
// that does not exist yet (Spec 135 rules 3 and 5; the locks are task-434's). Pinned by their lock paths, in item order, not by id: the ids are
// set at landing from "Next free id" and the second lander of task-388 and this task renumbers them (plan 17.5), so this lock needs no edit then.
const NEW_LOCKS = ['client-glass-boundary', 'ui-library-set', 'tunables-are-data', 'scratch-mocks-not-in-repo', 'scope-fence', 'auth-checkout-hosted', 'nav-tab-switch', 'parcel-id-names', 'page-set-pointer', 'failure-state-declared', 'admin-same-descriptor', 'lock-planted-defect', 'a11y-category'].map((n) => `src/tests/surfaces/${n}.logic.test.ts`);
const stripRows = (text: string, ids: string[], next: number) => text.split('\n').filter((l) => !ids.some((id) => l.startsWith(`| ${id} |`))).join('\n').replace(/(\*\*Next free id:\*\*\s*`FE-)\d+`/, `$1${String(next).padStart(2, '0')}\``);

describe('MF-95 C — the thirteen RR-0384 rows', () => {
  const rows = realRows();
  const fresh = rows.filter((r: Row) => r.locks.length === 1 && NEW_LOCKS.includes(r.locks[0]!));

  it('C-T2 RED: thirteen rows, in item order, are contiguous, in item order (task-446 appends after them), each OWED with exactly its one reserved lock path, none of which exists', () => {
    expect(fresh.map((r: Row) => r.locks[0])).toEqual(NEW_LOCKS);
    // the ! is safe: the first expect of this case proves fresh holds the thirteen locks
    const at = rows.findIndex((r: Row) => r.id === fresh[0]!.id);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(rows.slice(at, at + 13).map((r: Row) => r.id)).toEqual(fresh.map((r: Row) => r.id));
    expect(rows.length).toBeGreaterThanOrEqual(57);
    for (const r of fresh) {
      expect(r.status, r.id).toBe('OWED');
      expect(fs.existsSync(path.join(ROOT, r.locks[0]!)), r.locks[0]).toBe(false);
    }
  });

  it('C-T3: Spec 136 renders every row and counts the OWED rows from the register; each new line is OWED with its lock owed and no "Enforced by"', () => {
    const text = read(SPEC.handbookRel);
    const owed = rows.filter((r: Row) => r.status === 'OWED').length;
    expect(owed).toBeGreaterThanOrEqual(21);
    expect(text).toContain(`**Rules rendered: ${rows.length}**: ${rows.length} in force (${owed} OWED, whose lock is still to land), 0 history.`);
    for (const r of fresh) expect(text, r.id).toMatch(new RegExp(`^- \\*\\*fe\\.${r.id.slice(3)}\\*\\* [^\\n]*\\n {2}Status: OWED · lock owed: ${r.locks[0]!.replace(/[.]/g, '\\.')}$`, 'm'));
  });

  it('C-T1 and C-T3 planted: the register with the rows and the files built without them: --check exits 1 naming both; --write then --check exits 0; a removed middle row is a gap', () => {
    const run = (root: string, argv: string[]) => { const err: string[] = []; const code = runHandbookCli({ spec: '136', argv, build: (r: string) => build(r), root, out: () => {}, err: (s: string) => err.push(s), process: {} as never }); return { code, err: err.join('\n') }; };
    const ids = fresh.map((r: Row) => r.id);
    expect(ids).toHaveLength(13);
    // the strip also removes any row after the thirteen (task-446 appends FE rows after them), so no gap is left
    const idx = rows.findIndex((r: Row) => r.id === ids[0]);
    expect(idx).toBeGreaterThanOrEqual(0);
    const tail = rows.slice(idx).map((r: Row) => r.id);
    const old = build(makeRoot(stripRows(REGISTER, tail, rows.length - tail.length + 1)));
    const root = makeRoot(REGISTER, rows.flatMap((r: Row) => (r.status === 'RULED' ? r.locks : [])));
    for (const [rel, body] of [[SPEC.ruleMapRel, `${JSON.stringify(old.map, null, 2)}\n`], [SPEC.handbookRel, old.text]] as const) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body); }
    const stale = run(root, ['--check']);
    expect(stale.code).toBe(1);
    expect(stale.err).toContain(SPEC.ruleMapRel);
    expect(stale.err).toContain(SPEC.handbookRel);
    expect(run(root, ['--write']).code).toBe(0);
    expect(run(root, ['--check']).code).toBe(0);
    expect(() => readFeRows(stripRows(REGISTER, [ids[6]!], rows.length + 1))).toThrow(/no gap or reorder/);
    // the ! is safe: the register is not empty (H1 reads >= 30 rows)
    expect(() => readFeRows(stripRows(REGISTER, [rows.at(-1)!.id], rows.length))).not.toThrow();
  });
});

// task-446 FINAL.9 (RR-0395 "Agreed. Plan approved"; RR-0396 "Question1 yes"): one OWED row restates Spec 128 R-22 (128:224); R-03 (128:205)
// and R-04 (128:206) are already fe.49 and fe.52. T1 is a handbook-consistency pin (exactly one line states each rule, keyed on the cite string in
// the headline), not the R-22 lock, which is task-367's. T2 finds the row by its lock path, not its id, so a renumber at landing needs no edit;
// when task-367 builds the lock and flips the row, the same commit edits T2's status line and the Spec 136 pattern.
const R22_LOCK = 'src/tests/surfaces/mobile-no-rsc.logic.test.ts';
const R22_HEADLINE = 'No Server Components on mobile. "React Native has no Server Components. Web is RSC on Vercel (max server side); mobile is a fetched projection plus build-time generation. Any Spec 125 mechanism assuming SSR must be re-specified for mobile before it is planned." (Spec 128 R-22, 128:224, ACCEPTED).';
const citing = (rs: Row[], cite: string) => rs.filter((r: Row) => r.headline.includes(cite)).map((r: Row) => r.id);
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('task-446 — the R-22 line (RR-0395)', () => {
  it('T1 RED: each of R-03, R-04 and R-22 is stated by exactly one line; planted: two lines citing one rule are seen, control: one line', () => {
    for (const [rule, cite] of [['R-03', '128:205'], ['R-04', '128:206'], ['R-22', '128:224']] as const) expect(citing(realRows(), cite), rule).toHaveLength(1);
    const dup = readFeRows(reg([...GOOD, row('FE-04', 'OWED `src/tests/surfaces/z.logic.test.ts`', 'A (128:205).'), row('FE-05', 'OWED `src/tests/surfaces/w.logic.test.ts`', 'B (128:205).')]));
    expect(citing(dup, '128:205')).toHaveLength(2);
    const one = readFeRows(reg([...GOOD, row('FE-04', 'OWED `src/tests/surfaces/z.logic.test.ts`', 'A (128:205).')]));
    expect(citing(one, '128:205')).toHaveLength(1);
  });

  it('T2 RED: one row holds the R-22 lock, OWED with exactly that lock, its headline the exact text, no placeholder left, its Spec 136 line OWED; planted: a duplicated lock is seen, control: one', () => {
    const hit = realRows().filter((r: Row) => r.locks.includes(R22_LOCK));
    expect(hit).toHaveLength(1);
    // the ! is safe: the toHaveLength(1) above proves hit holds one row
    const r = hit[0]!;
    expect(r.status).toBe('OWED');
    expect(r.locks).toEqual([R22_LOCK]);
    expect(r.headline).toBe(R22_HEADLINE);
    expect(REGISTER).not.toContain('<date of the work commit>');
    expect(read(SPEC.handbookRel)).toMatch(new RegExp(`^- \\*\\*fe\\.${r.id.slice(3)}\\*\\* ${escRe(R22_HEADLINE)}\\n {2}Status: OWED · lock owed: ${escRe(R22_LOCK)}$`, 'm'));
    const two = readFeRows(reg([...GOOD, row('FE-04', `OWED \`${R22_LOCK}\``), row('FE-05', `OWED \`${R22_LOCK}\``)]));
    expect(two.filter((x: Row) => x.locks.includes(R22_LOCK))).toHaveLength(2);
    const once = readFeRows(reg([...GOOD, row('FE-04', `OWED \`${R22_LOCK}\``)]));
    expect(once.filter((x: Row) => x.locks.includes(R22_LOCK))).toHaveLength(1);
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
