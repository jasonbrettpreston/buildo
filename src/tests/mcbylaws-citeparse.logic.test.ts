// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-KV (task trailer), R-KG (OWED blocks),
//            R-KH (RULED cites), R-LE (RULED closed list); plan arm C (MB-67): message parse, OWED set, register rows, sentinels.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RULED_STATUSES, isRuled, parseMessage, parseOwedTable, parseRegisterRows, sentinelsOk,
} from '../../scripts/analysis/mcbylaws/cite-parse.mjs';

const FIX = 'src/tests/fixtures/mcbylaws-gate';
const SPEC = 'docs/specs/01-pipeline';
const msg = (n: string) => readFileSync(`${FIX}/msg-${n}.txt`, 'utf8');
const spec = (n: string) => readFileSync(`${SPEC}/${n}.md`, 'utf8');

const real133 = spec('133_bylaw_handbook');
const realRegisters = ['69a_mcbylaw_register', '124a_step_standard_policy_appendix', '131_lot_configuration_policy']
  .map((n) => spec(n)).join('\n');

describe('parseMessage', () => {
  const cases: Array<[string, [string, unknown], (r: any) => void]> = [
    ['93feac54', ['task', null], (r) => { expect(r.ids).toContain('M-361'); expect(r.ids).toContain('M-376'); }],
    ['41719d27', ['task', null], (r) => { expect(r.ids).toContain('M-189'); expect(r.ids).toContain('R-EH'); }],
    ['1d4b20d9', ['task', null], (r) => { expect(r.ids).toEqual([]); }],
  ];
  for (const [name, [key, value], extra] of cases) {
    it(`msg-${name}.txt: ${key} is ${String(value)}`, () => {
      const r = parseMessage(msg(name));
      expect((r as any)[key]).toEqual(value);
      extra(r);
    });
  }
  it('reads the trailer and a Spec 133 section citation', () => {
    const r = parseMessage('feat: x\n\nMcBylaws-Task: MB-31\n\nSpec 133 section m.252 and M-77\n');
    expect(r.task).toBe('MB-31');
    expect(r.ids).toEqual(['M-252', 'M-77']);
  });
  it('never lists O-n ids; O-1 only sets usesBoot1', () => {
    const boot = parseMessage('O-1 approved; O-6 held; M-5 cited');
    expect(boot.usesBoot1).toBe(true);
    expect(boot.ids).toEqual(['M-5']);
    expect(parseMessage('O-6 held; O-17 approved').usesBoot1).toBe(false);
  });
});

describe('parseOwedTable', () => {
  it('counts only rows after the heading', () => {
    const text = [
      '| M-1 | m.1 | RULED · OWED |',
      '',
      '## 3. Rows with an OWED marker (n in force)',
      '',
      '| Rule | Line | Status |',
      '|---|---|---|',
      '| M-220 | m.220 | APPLIED 2026-10-18 · OWED |',
      '| LC-15 | lc.15 | RULED · OWED |',
      '| M-2 | m.2 | RULED |',
    ].join('\n');
    expect([...parseOwedTable(text)].sort()).toEqual(['LC-15', 'M-220']);
  });
  it('parses the real spec 133', () => {
    const owed = parseOwedTable(real133);
    expect(owed.has('M-361')).toBe(true);
    expect(owed.has('LC-15')).toBe(true);
    expect(owed.has('M-180')).toBe(false);
    expect(owed.size).toBeGreaterThan(90);
  });
});

describe('parseRegisterRows + isRuled', () => {
  const rows: Array<[string, string, string]> = [
    ['| **M-1** | body | why | gate | RATIFIED 2026-10-06 |', 'M-1', 'RULED'],
    ['| **M-2** | body | why | gate | RULED (as-built) |', 'M-2', 'RULED'],
    ['| **LC-1** | body | why | gate | APPLIED 2026-10-18 |', 'LC-1', 'RULED'],
    ['| **M-3** | body | why | gate | PROPOSED 2026-11-01 |', 'M-3', 'PROPOSED'],
    ['| **M-4** | body | why | gate | OWED -> MB-67: gate arm |', 'M-4', 'OWED'],
    ['| R-KG | body | why | gate | OWED -> MB-67: lock |', 'R-KG', 'OWED'],
    ['| ~~**M-5**~~ | body | why | gate | RATIFIED 2026-10-06 |', 'M-5', 'RETIRED'],
    ['| **M-6** | body | why | gate | RETIRED 2026-10-07 |', 'M-6', 'RETIRED'],
    ['| **M-7** | body | why | gate | SUPERSEDED by M-9 |', 'M-7', 'RETIRED'],
    ['| **M-8** | body | why | gate | OWED |', 'M-8', 'OWED'],
    ['| not a row M-9 | x |', 'M-9', '<absent>'],
    // O67-09: an OWED marker in any decorated form reads OWED and can never be cited.
    ['| **LC-30** | b | w | g | **OWED:** a future ruling, once data exists |', 'LC-30', 'OWED'],
    ['| **M-10** | b | w | g | **OWED** |', 'M-10', 'OWED'],
    ['| **M-11** | b | w | g | ~~OWED~~ |', 'M-11', 'OWED'],
    ['| **M-12** | b | w | g | `OWED` |', 'M-12', 'OWED'],
    ['| **M-13** | b | w | g | OWED |', 'M-13', 'OWED'],
    ['| **M-14** | b | w | g |   OWED pending |', 'M-14', 'OWED'],
    ['| **M-15** | b | w | g | RATIFIED 2026-10-18 |', 'M-15', 'RULED'],
    ['| **M-16** | b | w | g | RULED (as-built) |', 'M-16', 'RULED'],
    ['| **M-17** | b | w | g | SUPERSEDED by M-9, was OWED |', 'M-17', 'RETIRED'],
    ['| **M-18** | b | w | g | ~~RETIRED 2026-10-07, was OWED~~ |', 'M-18', 'RETIRED'],
    ['| **M-19** | b | w | g | PROPOSED, not OWED |', 'M-19', 'PROPOSED'],
  ];
  for (const [line, id, status] of rows) {
    it(`${id} -> ${status}`, () => {
      const map = parseRegisterRows(line);
      if (status === '<absent>') return expect(map.has(id)).toBe(false);
      expect(map.get(id)?.status).toBe(status);
      expect(isRuled(map, id)).toBe(status === 'RULED');
    });
  }
  it('a row carries its named locks (backticked .test.* paths), never the record lock', () => {
    const lockRows: Array<[string, Array<[string, string[]]>]> = [
      ['| R-QA | body | why | gate | OWED -> MB-31: lock `src/tests/lock-qa.logic.test.ts`; record: `src/tests/chat-rulings-register.logic.test.ts` |',
        [['R-QA', ['src/tests/lock-qa.logic.test.ts']]]],
      ['| R-QB | body | why | gate | OWED -> MB-31: lock `src/tests/lock-qb.logic.test.ts` |',
        [['R-QB', ['src/tests/lock-qb.logic.test.ts']]]],
      ['| R-QC | body | why | gate | OWED -> MB-31: `src/tests/a.test.tsx` `src/tests/b.test.mjs` `docs/x.md` |',
        [['R-QC', ['src/tests/a.test.tsx', 'src/tests/b.test.mjs']]]],
      ['| R-QD | body | why | gate | OWED -> MB-31: record `src/tests/chat-rulings-register.logic.test.ts` |',
        [['R-QD', []]]],
      ['| R-QE | body | why | gate | OWED |', [['R-QE', []]]],
      ['| R-QF | body | why | gate | RULED |\n| R-QG | body | why | gate | RULED |', [['R-QF', []], ['R-QG', []]]],
    ];
    for (const [text, expectRows] of lockRows) {
      const map = parseRegisterRows(text);
      for (const [id, locks] of expectRows) expect(map.get(id), id).toEqual({ status: expect.any(String), locks });
    }
  });
  it('first occurrence wins', () => {
    const map = parseRegisterRows('| **M-1** | a | b | c | RETIRED |\n| **M-1** | a | b | c | RULED |');
    expect(map.get('M-1')?.status).toBe('RETIRED');
  });
  it('parses the real registers', () => {
    const map = parseRegisterRows(realRegisters);
    expect(isRuled(map, 'M-180')).toBe(true);
    expect(map.has('LC-15')).toBe(true);
    expect(map.has('R-KV')).toBe(true);
    expect(RULED_STATUSES).toEqual(['RULED']);
  });
  it('O67-09: the real spec 131 OWED rows are OWED, never citable', () => {
    const map = parseRegisterRows(spec('131_lot_configuration_policy'));
    expect(map.get('LC-30')?.status).toBe('OWED');
    expect(map.get('LC-46')?.status).toBe('OWED');
    expect(map.get('LC-15')?.status).toBe('OWED');
    expect(isRuled(map, 'LC-30')).toBe(false);
    expect(isRuled(map, 'LC-46')).toBe(false);
    expect(sentinelsOk(parseOwedTable(real133), parseRegisterRows(realRegisters))).toBe(true);
  });
});

describe('sentinelsOk', () => {
  it('holds on the real parses', () => {
    expect(sentinelsOk(parseOwedTable(real133), parseRegisterRows(realRegisters))).toBe(true);
  });
  it('fails closed on empty parses', () => {
    expect(sentinelsOk(new Set(), new Map())).toBe(false);
  });
});
