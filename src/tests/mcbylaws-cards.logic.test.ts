// SPEC LINK: plan MB-67 lines 123-129, arm D (R-KO — cards and briefs)
// D1 quote at its cited line (line is a hint, content decides), D2 recommendation without a cite,
// D3 brief run lines vs exec-policy bash_allow (or provider claude + reason), D4 brief write_scope.
// Verdicts are `FAIL:<ARM>:<code>` with an optional `:<detail>`; tables list expected codes.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkCard, checkBrief, commandAllowed } from '../../scripts/analysis/mcbylaws/card-cite-check.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../');
const SPEC = 'docs/specs/01-pipeline/69a_mcbylaw_register.md';
const specText = fs.readFileSync(path.join(REPO_ROOT, SPEC), 'utf8');
const head = (s: string[]) => s.map((v) => v.split(':').slice(0, 3).join(':'));
const specLines = specText.split('\n');
const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));

// a 40-character run taken from the real M-180 row (line 295 today)
const M180_LINE = (specLines.findIndex((l) => l.includes('M-180')) ?? -1) + 1;
const QUOTE = (M180_LINE > 0 ? (specLines[M180_LINE - 1] ?? '') : '').slice(120, 160);
// a well-formed card line, filled with a line number
const cardAt = (line: number) => `Rule: the more permissive regulation prevails ("${QUOTE}") (spec ${SPEC}:${line})`;
const readSpec = (name: string) => (name.includes('69a') ? specText : null);

const brief = (body: string) => ['---', 'task: MB-67', body, '---', '', '# brief', ''].join('\n');

describe('D1 a card quote must appear in the cited file near the cited line', () => {
  it(`M-180 quote is read from line ${M180_LINE} of the register`, () => {
    expect(QUOTE.length).toBe(40);
  });

  const rows: Array<[string, string, (n: string) => string | null, string[]]> = [
    ['quote appears nowhere', `Rule-text line: "a quote that appears nowhere in the file at all" (69a:295)`, readSpec, ['FAIL:D:quote-not-found']],
    ['real quote at its line', cardAt(M180_LINE), readSpec, []],
    ['real quote a few lines off', cardAt(M180_LINE + 3), readSpec, []],
    ['real quote far from its line', cardAt(1), readSpec, ['FAIL:D:quote-not-found']],
    ['cited file unreadable', cardAt(M180_LINE), () => null, ['FAIL:D:quote-not-found']],
    ['no quote, cite only', `- Rule: see ${SPEC}:295 for the rule`, readSpec, []],
  ];
  it.each(rows)('%s', (_, cardText, readCited, expected) => {
    expect(head(checkCard({ cardText, readCited }))).toEqual(expected);
  });
});

describe('D2 a recommendation must cite a rule', () => {
  const rows: Array<[string, string, string[]]> = [
    ['no cite', '> **Recommend** use the more permissive arm', ['FAIL:D:no-cite']],
    ['with cite', '**Recommend** use the more permissive arm (69a:295)', []],
    ['with full cite', `Recommend apply M-180 (${SPEC}:${M180_LINE})`, []],
    ['no cite, quoted but uncited', '> **Recommend** "we should follow the more permissive arm here"', ['FAIL:D:no-cite']],
  ];
  it.each(rows)('%s', (_, cardText, expected) => {
    expect(head(checkCard({ cardText, readCited: readSpec }))).toEqual(expected);
  });
});

describe('D3 brief run lines must match a bash_allow entry unless provider claude with a reason', () => {
  const rows: Array<[string, string, string[]]> = [
    ['gate run, no provider', 'provider: deepseek', ['FAIL:D:not-in-bash-allow']],
    ['wrapped in vitest', 'provider: deepseek', []],
    ['provider claude with reason', 'provider: claude\nreason: hook wiring', []],
    ['provider with empty reason', 'provider: claude\nreason:', ['FAIL:D:not-in-bash-allow']],
  ];
  const runLine = (label: string) => (label === 'wrapped in vitest'
    ? 'run: npx vitest run src/tests/mcbylaws-hold.logic.test.ts --run'
    : 'run: node scripts/analysis/mcbylaws/gate.mjs --staged');
  it.each(rows)('%s', (label, provider, expected) => {
    const text = brief(['write_scope:', '  - scripts/analysis/mcbylaws/card-cite-check.mjs', provider, runLine(label)].join('\n'));
    expect(head(checkBrief({ briefText: text, policy }))).toEqual(expected);
  });

  const allowed: Array<[string, boolean]> = [
    ['npm run typecheck', true],
    ['npx vitest run src/tests/x.test.ts --run', true],
    ['npx vitest run src/tests/x.test.ts', true],
    ['git status --porcelain', true],
    ['git status', false],
    ['git log --oneline -n 5', true],
    ['node scripts/analysis/mcbylaws/gate.mjs --staged', false],
    ['rm -rf x', false],
  ];
  it.each(allowed)('commandAllowed(%s) -> %s', (line, expected) => {
    expect(commandAllowed(line.split(/\s+/), policy)).toBe(expected);
  });
});

describe('D4 a brief must declare its write scope', () => {
  const rows: Array<[string, string[]]> = [
    ['task: MB-67', ['FAIL:D:no-write-scope']],
    ['write_scope:\n  - scripts/analysis/mcbylaws/card-cite-check.mjs', []],
  ];
  it.each(rows)('%s', (frontMatter, expected) => {
    expect(head(checkBrief({ briefText: brief(frontMatter), policy }))).toEqual(expected);
  });
});
