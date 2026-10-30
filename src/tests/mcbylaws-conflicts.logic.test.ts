// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md (register rows); plan arm K (MB-67, M-381, R-KZ)
// K1 no "Conflict check" paragraph · K2 paragraph omits an id the search returns · K3 named id with no
// verdict · K4 card "Rule-text line" with no register search · K5 clause-key precision (and the CLI shim).
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  checkCard,
  checkRow,
  conflictCandidates,
  searchKeys,
} from '../../scripts/analysis/mcbylaws/register-conflicts.mjs';

const FIX = path.resolve(__dirname, 'fixtures/mcbylaws-gate');
const read = (name: string): string => fs.readFileSync(path.join(FIX, name), 'utf8');
const DRAFT = read('mb17q1-draft.txt');
const TEN = ['M-60', 'M-173', 'M-180', 'M-207', 'M-234', 'M-237', 'M-240', 'M-252', 'M-265', 'M-376'];
// The frozen c5 copy (register-rows-c5.txt) is the c5 claim set; an absent fixture is RED.
const FIXTURE = path.join(FIX, 'register-rows-c5.txt');
if (!fs.existsSync(FIXTURE)) throw new Error('missing fixture register-rows-c5.txt (frozen c5 register rows)');
const REGISTER = read('register-rows-c5.txt');
const row = (id: string, body: string): string => `| **${id}** | ${body} | src | lock | RULED |`;
const paragraph = (ids: string[], amends: string[] = []): string =>
  ids.map((id) => `${id}: ${amends.includes(id) ? 'amends' : 'no conflict (fixture reason)'}`).join('; ');
const OMITS_M180 = TEN.filter((id) => id !== 'M-180');
const greenTwin = (): string => row('M-500', `${DRAFT}\n\n**Conflict check.** ${paragraph(TEN, ['M-180'])}`);
const fixtureRow = (id: string): string => REGISTER.split('\n').find((l) => l.startsWith(`| **${id}** |`)) as string;

describe('searchKeys + conflictCandidates (K5)', () => {
  it('10.40.40.1(5) is a clause key and returns exactly M-180', () => {
    expect(searchKeys('... 10.40.40.1(5) ...').clauseKeys).toContain('10.40.40.1(5)');
    expect(conflictCandidates(REGISTER, { clauseKeys: ['10.40.40.1(5)'], typeKeys: [] })).toEqual(['M-180']);
  });

  it('the draft carries the three type keys and returns the ten ids', () => {
    expect(searchKeys(DRAFT).typeKeys).toEqual(['houseplex', 'exception', 'detached']);
    expect(conflictCandidates(REGISTER, searchKeys(DRAFT))).toEqual(TEN);
  });

  it('an empty key set returns []', () => {
    expect(searchKeys('nothing relevant here')).toEqual({ clauseKeys: [], typeKeys: [] });
    expect(conflictCandidates(REGISTER, { clauseKeys: [], typeKeys: [] })).toEqual([]);
  });

  it('a row is not its own candidate', () => {
    const own = fixtureRow('M-180');
    expect(own.startsWith('| **M-180** |')).toBe(true);
    expect(checkRow({ rowText: own, registerText: REGISTER })).not.toContain('FAIL:K:omits:M-180');
  });

  it('the frozen fixture carries exactly the ten c5 ids', () => {
    expect(REGISTER.split('\n').filter(Boolean).map((l) => (/^\| \*\*(M-\d+)\*\*/.exec(l) || [])[1])).toEqual(TEN);
  });
});

describe('checkRow (K1, K2, K3)', () => {
  const cases: Array<[string, string, string, string[]]> = [
    ['K1 no paragraph', row('M-500', DRAFT), REGISTER, ['FAIL:K:no-conflict-check']],
    ['K2 omits M-180', row('M-500', `${DRAFT}\n\n**Conflict check.** ${paragraph(OMITS_M180)}`), REGISTER, ['FAIL:K:omits:M-180']],
    ['K2 green twin', greenTwin(), REGISTER, []],
    ['K3 named, no verdict', row('M-500', `${DRAFT}\n\n**Conflict check.** ${paragraph(OMITS_M180)} M-180 is relevant.`), REGISTER, ['FAIL:K:no-verdict:M-180']],
  ];
  it.each(cases)('%s', (_name, rowText, registerText, expected) => {
    const got = checkRow({ rowText, registerText });
    if (expected.length === 0) expect(got).toEqual([]); else expect(got).toEqual(expect.arrayContaining(expected));
  });
});

describe('checkCard (K4) and the CLI shim', () => {
  const cases: Array<[string, string, string[]]> = [
    ['card without register search', 'Rule-text line: "An exception applies."\n', ['FAIL:K:card-no-search']],
    ['card with the search attached', `Rule-text line: "An exception applies."\nRegister search: ${TEN.join(', ')}\n`, []],
  ];
  it.each(cases)('%s', (_name, cardText, expected) => {
    expect(checkCard(cardText)).toEqual(expected);
  });

  it('--text prints one candidate id per line', () => {
    const cli = path.resolve(__dirname, '../../scripts/analysis/mcbylaws/register-conflicts.mjs');
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
    const r = spawnSync(process.execPath, [cli, '--text', path.join(FIX, 'mb17q1-draft.txt')], { encoding: 'utf8', env: env as NodeJS.ProcessEnv });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n')).toEqual(TEN);
  });
});
