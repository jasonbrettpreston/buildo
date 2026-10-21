// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-HK (operator decision logs and their register rows);
//            R-HM (R-RS, CHAT-4) is recorded through these logs; its own lock is report-schema.logic (landed at integrate-13)
//
// R-HK: every operator ruling is committed verbatim as a decision log under docs/reports/decisions/, and every approved
// decision is recorded by a register row that cites `<log stem>#<decision id>`. scripts/analysis/decision-log.mjs
// --check (pre-commit) is RED when an approved decision has no citing row, when a row cites a decision or a log that
// does not exist, or when a routed decision's row is missing from its routed register; --write emits row skeletons.
// Red-first: docs/reports/red-evidence/decision-log/ (the committed logs with no rows → RED; with the rows → GREEN).

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as dl from '../../scripts/analysis/decision-log.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../');
const CLI = path.join(REPO_ROOT, 'scripts/analysis/decision-log.mjs');
const REG = 'docs/specs/01-pipeline/900_fixture_register.md';
const STEM = '2026-01-02-fixture-rulings';

function fixtureLog(over: Record<string, unknown> = {}) {
  return {
    log_id: STEM,
    source: { kind: 'page', title: 'Fixture', url: 'https://example.invalid/page' },
    decision_vocab: { keep: 'approve', drop: 'reject', later: 'defer' },
    decisions: [
      { id: 'R-1', question: 'Q one?', recommendation: 'Rec one.', decision: 'keep', decided_at: '2026-01-02T10:00:00.000Z' },
      { id: 'R-2', question: 'Q two?', recommendation: 'Rec two.', decision: 'keep', decided_at: '2026-01-02T10:01:00.000Z' },
      { id: 'R-3', question: 'Q three?', recommendation: 'Rec three.', decision: 'drop', decided_at: '2026-01-02T10:02:00.000Z' },
      { id: 'R-4', question: 'Q four?', recommendation: 'Rec four.', decision: 'later', decided_at: '2026-01-02T10:03:00.000Z' },
    ],
    routing: { 'R-1': { register: REG, row: 'X-1' }, 'R-2': { register: REG, row: 'X-2' } },
    amendments: {},
    ...over,
  };
}
const row = (id: string, cite: string) => `| ${id} | **A rule.** Operator approved (\`${cite}\`). | src | lock | RULED |`;
const spec = (...rows: string[]) => ({ rel: REG, text: ['# fixture', '', '| Id | Rule | Source | Lock | Status |', '|---|---|---|---|---|', ...rows, ''].join('\n') });

// The raw page export a fixture log was imported from (committed beside the log, R-HK raw arm).
const RAW_DIR = `docs/reports/decisions/raw/${STEM}`;
type FixtureDecision = { id: string; question: string; recommendation: string; decision: string; decided_at: string };
function rawExport(log: { decisions: FixtureDecision[] }) {
  return {
    answers: log.decisions.map((d) => ({ ref: d.id, decision: d.decision, updated_at: d.decided_at })),
    entries: log.decisions.map((d) => ({ ref: d.id, key: d.question, note: d.recommendation, evidence: [] })),
  };
}
function tree(log: unknown, specText: string | null, raw = rawExport(log as { decisions: FixtureDecision[] })): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-log-'));
  fs.mkdirSync(path.join(root, 'docs/reports/decisions'), { recursive: true });
  // The committed log is what --import makes of the raw export (the fixture log supplies only the lane fields).
  const fx = log as { source: { title: string; url: string } };
  const imported = dl.importPageExport({ stem: STEM, title: fx.source.title, url: fx.source.url, answers: raw.answers, entries: raw.entries, answersRel: `${RAW_DIR}/answers`, entriesRel: `${RAW_DIR}/entries.json`, previous: log });
  fs.writeFileSync(path.join(root, 'docs/reports/decisions', `${STEM}.json`), JSON.stringify(imported));
  fs.mkdirSync(path.join(root, RAW_DIR, 'answers'), { recursive: true });
  for (const a of raw.answers) fs.writeFileSync(path.join(root, RAW_DIR, 'answers', `${a.ref}.json`), JSON.stringify(a));
  fs.writeFileSync(path.join(root, RAW_DIR, 'entries.json'), JSON.stringify(raw.entries));
  fs.mkdirSync(path.join(root, 'docs/specs/01-pipeline'), { recursive: true });
  if (specText !== null) fs.writeFileSync(path.join(root, REG), specText);
  return root;
}
function runCli(args: string[], root?: string) {
  return spawnSync('node', [CLI, ...args], { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, ...(root ? { BUILDO_DECISION_LOG_ROOT: root } : {}) } });
}

describe('R-HK — the CLI has explicit modes; no default write; an unknown flag exits 2', () => {
  it('parseArgs: exactly one mode, only the flags that mode takes, every value present', () => {
    expect(dl.parseArgs([]).error).toMatch(/exactly one mode/);
    expect(dl.parseArgs(['--check', '--write']).error).toMatch(/exactly one mode/);
    expect(dl.parseArgs(['--check', '--out', 'x']).error).toMatch(/unknown flag for --check: --out/);
    expect(dl.parseArgs(['--write', '--force']).error).toMatch(/unknown flag/);
    expect(dl.parseArgs(['--write', '--out']).error).toMatch(/needs a value/);
    expect(dl.parseArgs(['--import', '--out', 'a.json']).error).toMatch(/--import needs exactly one source/);
    expect(dl.parseArgs(['--import', '--chat', 'c.json', '--answers', 'd', '--out', 'a.json']).error).toMatch(/--import needs exactly one source/);
    expect(dl.parseArgs(['--import', '--chat', 'c.json', '--out', 'a.json'])).toEqual({ mode: '--import', values: { '--chat': 'c.json', '--out': 'a.json' } });
    expect(dl.parseArgs(['--check'])).toEqual({ mode: '--check', values: {} });
    expect(dl.parseArgs(['--write', '--out', 'f.md'])).toEqual({ mode: '--write', values: { '--out': 'f.md' } });
  });

  it('the real CLI: no mode, an unknown flag and a typo each exit 2 and write nothing', () => {
    const root = tree(fixtureLog(), spec().text);
    const before = fs.readFileSync(path.join(root, REG), 'utf8');
    for (const args of [[], ['--chek'], ['--check', '--write'], ['--write', '--outt', 'x']]) {
      const r = runCli(args, root);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr).toMatch(/usage:/);
    }
    expect(fs.readFileSync(path.join(root, REG), 'utf8')).toBe(before);
  });
});

describe('R-HK — --check: every approved decision has a citing register row', () => {
  it('RED — a log with no rows: each approved decision is named; rejected and deferred ones need no row', () => {
    const r = dl.checkDecisionLogs([{ stem: STEM, log: fixtureLog() }], [spec()]);
    expect(r.problems).toEqual([
      `${STEM}#R-1: approved 2026-01-02, but no register row cites it`,
      `${STEM}#R-2: approved 2026-01-02, but no register row cites it`,
    ]);
    expect(r.missing.map((m: { id: string }) => m.id)).toEqual(['R-1', 'R-2']);
  });

  it('GREEN — a row per approved decision, in its routed register under its routed id', () => {
    const r = dl.checkDecisionLogs([{ stem: STEM, log: fixtureLog() }], [spec(row('X-1', `${STEM}#R-1`), row('**X-2**', `${STEM}#R-2`))]);
    expect(r.problems).toEqual([]);
    expect(r.decisions).toBe(4);
    expect(r.rows).toBe(2);
  });

  it('RED — prose that cites a decision is not a register row', () => {
    const r = dl.checkDecisionLogs([{ stem: STEM, log: fixtureLog() }], [spec(row('X-1', `${STEM}#R-1`), `See ${STEM}#R-2 for context.`)]);
    expect(r.problems).toEqual([`${STEM}#R-2: approved 2026-01-02, but no register row cites it`]);
  });

  it('RED — a row citing an unknown decision, and a row citing a log that does not exist', () => {
    const r = dl.checkDecisionLogs(
      [{ stem: STEM, log: fixtureLog() }],
      [spec(row('X-1', `${STEM}#R-1`), row('X-2', `${STEM}#R-2`), row('X-9', `${STEM}#R-99`), row('X-8', '2026-01-03-missing-log#R-1'))],
    );
    expect(r.problems).toEqual([
      `${REG}:7: cites ${STEM}#R-99, which is not a decision in that log`,
      `${REG}:8: cites 2026-01-03-missing-log#R-1, but there is no decision log docs/reports/decisions/2026-01-03-missing-log.json`,
    ]);
  });

  it('RED — a row in the wrong register, and a row under the wrong id', () => {
    const other = { rel: 'docs/specs/01-pipeline/901_other.md', text: row('X-1', `${STEM}#R-1`) };
    const r = dl.checkDecisionLogs([{ stem: STEM, log: fixtureLog() }], [other, spec(row('X-7', `${STEM}#R-2`))]);
    expect(r.problems).toEqual([
      `${STEM}#R-1: routed to ${REG}, but its register rows are in docs/specs/01-pipeline/901_other.md`,
      `${STEM}#R-2: routed to row X-2 in ${REG}, but the citing rows there are X-7`,
    ]);
  });

  it('RED — a malformed log: wrong log_id, a decision outside the vocabulary, a chat source with no quote, routing to an unknown id', () => {
    const bad = fixtureLog({ log_id: 'other', source: { kind: 'chat' }, routing: { 'R-9': { register: REG } } });
    (bad.decisions as Array<Record<string, string>>)[0]!.decision = 'maybe';
    expect(dl.validateLog(STEM, bad)).toEqual([
      `${STEM}: log_id "other" differs from the file name`,
      `${STEM}: a chat source needs the operator's quote`,
      `${STEM}#R-1: decision "maybe" is not in decision_vocab`,
      `${STEM}: routing names unknown decision R-9`,
    ]);
  });

  it('an amendment makes the decision `amend`: it still needs a row, and the amendment needs its quote', () => {
    const log = fixtureLog({ amendments: { 'R-1': { text: 'Changed.', operator_quote: 'yes change it', decided_at: '2026-01-03', source: 'chat' } } });
    expect(dl.meaningOf(log, log.decisions[0])).toBe('amend');
    expect(dl.validateLog(STEM, { ...log, amendments: { 'R-1': { text: 'Changed.' } } })).toEqual([`${STEM}: amendments.R-1 needs text, operator_quote and decided_at`]);
    const sk = dl.skeletons(dl.checkDecisionLogs([{ stem: STEM, log }], [spec()]).missing);
    expect(sk).toContain('approved, then amended 2026-01-02');
    expect(sk).toContain('Amended 2026-01-03 (chat: "yes change it"): Changed.');
  });
});

describe('R-HK — --write emits a skeleton row per uncovered decision; the real CLI goes RED then GREEN', () => {
  it('RED (exit 1) with no rows → --write emits the routed skeletons → GREEN (exit 0) once rows cite them', () => {
    const root = tree(fixtureLog(), spec().text);
    const red = runCli(['--check'], root);
    expect(red.status).toBe(1);
    expect(red.stderr).toContain(`${STEM}#R-1: approved 2026-01-02, but no register row cites it`);

    const out = path.join(root, 'skeleton.md');
    const w = runCli(['--write', '--out', out], root);
    expect(w.status).toBe(0);
    const sk = fs.readFileSync(out, 'utf8');
    expect(sk).toContain(`## ${REG}`);
    expect(sk).toContain(`| X-1 | **Q one?** Operator approved 2026-01-02 (Fixture, https://example.invalid/page; \`${STEM}#R-1\`). Approved: Rec one.`);
    expect(sk).toContain('| X-2 | **Q two?**');
    expect(sk).not.toContain('Q three?');
    expect(fs.readFileSync(path.join(root, REG), 'utf8')).toBe(spec().text); // --write writes no spec

    fs.writeFileSync(path.join(root, REG), spec(row('X-1', `${STEM}#R-1`), row('X-2', `${STEM}#R-2`)).text);
    const green = runCli(['--check'], root);
    expect(green.status).toBe(0);
    expect(green.stdout).toMatch(/clean — 1 log\(s\), 4 decision\(s\), 2 register row\(s\)/);
  });
});

describe('R-HK — a skeleton row is one table row', () => {
  it('a multi-line recommendation with a pipe stays one row (line breaks become spaces, the pipe is escaped)', () => {
    const log = fixtureLog();
    (log.decisions as Array<Record<string, string>>)[0]!.recommendation = 'Choose one:\n- (a) x | y\n- (b) z';
    const sk = dl.skeletons(dl.checkDecisionLogs([{ stem: STEM, log }], [spec()]).missing);
    const rows = sk.split('\n').filter((l: string) => l.startsWith('| '));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Approved: Choose one: - (a) x \\| y - (b) z');
  });
});

describe('R-HK — --import copies the review page export verbatim', () => {
  const entries = [
    { ref: 'R-2', step: 'g', key: 'Second question', note: 'Recommendation: two.', evidence: [{ file: 'Where', quote: 'q2' }] },
    { ref: 'R-10', step: 'g', key: 'Tenth question', note: 'Recommendation: ten.', evidence: [] },
  ];
  const answers = [
    { ref: 'R-10', decision: 'keep', updated_at: '2026-01-02T10:10:00.000Z' },
    { ref: 'R-2', decision: 'keep', updated_at: '2026-01-02T10:02:00.000Z' },
  ];

  it('joins answers and entries by ref in natural id order, keeping the lane-added fields of an existing log', () => {
    const previous = { decision_vocab: { keep: 'approve' }, routing: { 'R-2': { register: REG, row: 'X-2' } }, amendments: {} };
    const log = dl.importPageExport({ stem: STEM, title: 'T', url: 'https://example.invalid/p', answers, entries, answersRel: 'a', entriesRel: 'e', previous });
    expect(log.decisions.map((d: { id: string }) => d.id)).toEqual(['R-2', 'R-10']);
    expect(log.decisions[0]).toMatchObject({ question: 'Second question', recommendation: 'Recommendation: two.', decision: 'keep', decided_at: '2026-01-02T10:02:00.000Z' });
    expect(log.routing).toEqual(previous.routing);
    expect(dl.validateLog(STEM, log)).toEqual([]);
  });

  it('refuses an incomplete export (an entry with no decision) and a decision with no entry', () => {
    expect(() => dl.importPageExport({ stem: STEM, title: 'T', url: 'https://x.invalid', answers: answers.slice(0, 1), entries, answersRel: 'a', entriesRel: 'e', previous: null })).toThrow(/entry R-2 has no exported decision/);
    expect(() => dl.importPageExport({ stem: STEM, title: 'T', url: 'https://x.invalid', answers: [...answers, { ref: 'R-3', decision: 'keep', updated_at: 'x' }], entries, answersRel: 'a', entriesRel: 'e', previous: null })).toThrow(/decision R-3 has no entry/);
  });
});

describe('R-HK (verify-13 N5) — amendment quote, extra citations, owed rows, and the committed raw export', () => {
  const amended = () => fixtureLog({ amendments: { 'R-1': { text: 'Changed.', operator_quote: 'yes change it', decided_at: '2026-01-03', source: 'chat' } } });

  it('RED — an amended decision whose routed row does not carry the amendment quote; GREEN once it does', () => {
    const red = dl.checkDecisionLogs([{ stem: STEM, log: amended() }], [spec(row('X-1', `${STEM}#R-1`), row('X-2', `${STEM}#R-2`))]);
    expect(red.problems).toEqual([`${STEM}#R-1: amended 2026-01-03, but its row X-1 in ${REG} does not carry the amendment quote "yes change it"`]);
    const green = dl.checkDecisionLogs([{ stem: STEM, log: amended() }], [spec(`| X-1 | Amended: "yes change it" (\`${STEM}#R-1\`). | s | l | RULED |`, row('X-2', `${STEM}#R-2`))]);
    expect(green.problems).toEqual([]);
  });

  it('RED — a routed decision also cited by a register row in another register', () => {
    const other = { rel: 'docs/specs/01-pipeline/901_other.md', text: row('Y-7', `${STEM}#R-1`) };
    const r = dl.checkDecisionLogs([{ stem: STEM, log: fixtureLog() }], [other, spec(row('X-1', `${STEM}#R-1`), row('X-2', `${STEM}#R-2`))]);
    expect(r.problems).toEqual([`${STEM}#R-1: routed to ${REG}, but register row Y-7 in docs/specs/01-pipeline/901_other.md also cites it`]);
  });

  it('owed: a decision routed to a row another lane owes needs no row yet, and RED once the row exists while still marked owed', () => {
    const log = fixtureLog({ routing: { 'R-1': { register: REG, row: 'X-1' }, 'R-2': { register: REG, row: 'X-2', owed: 'wf1/other-lane' } } });
    const owed = dl.checkDecisionLogs([{ stem: STEM, log }], [spec(row('X-1', `${STEM}#R-1`))]);
    expect(owed.problems).toEqual([]);
    expect(owed.owed).toBe(1);
    const landed = dl.checkDecisionLogs([{ stem: STEM, log }], [spec(row('X-1', `${STEM}#R-1`), row('X-2', `${STEM}#R-2`))]);
    expect(landed.problems).toEqual([`${STEM}#R-2: routed row X-2 now exists, but the routing still says owed by wf1/other-lane — drop "owed"`]);
  });

  it('RED (real CLI) — a log with no committed raw export, and a hand-edited log that no longer matches its export', () => {
    const rows = spec(row('X-1', `${STEM}#R-1`), row('X-2', `${STEM}#R-2`)).text;
    const root = tree(fixtureLog(), rows);
    expect(runCli(['--check'], root).status).toBe(0);
    const logPath = path.join(root, 'docs/reports/decisions', `${STEM}.json`);
    const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    log.decisions[0].recommendation = 'Rec one, edited by hand.';
    fs.writeFileSync(logPath, JSON.stringify(log));
    const edited = runCli(['--check'], root);
    expect(edited.status).toBe(1);
    expect(edited.stderr).toContain(`${STEM}#R-1: recommendation differs from the committed raw export (${RAW_DIR}/entries.json) — re-import, never hand-edit`);
    delete log.source.raw;
    log.decisions[0].recommendation = 'Rec one.';
    fs.writeFileSync(logPath, JSON.stringify(log));
    const noRaw = runCli(['--check'], root);
    expect(noRaw.status).toBe(1);
    expect(noRaw.stderr).toContain(`${STEM}: no committed raw export (source.raw)`);
  });

  it('--import --chat builds a log from a committed chat record verbatim (per-decision quote, date from the source)', () => {
    const raw = { source: 'operator chat 2026-01-05', operator_quote: 'y to 1-2', decisions: [
      { id: 'CHAT-1', subject: 'Subject one', decision: 'approve', recommendation: 'Do one.' },
      { id: 'CHAT-2', subject: 'Subject two', decision: 'approve', recommendation: 'Do two.', operator_quote: 'y to two' },
    ] };
    const log = dl.importChat({ stem: STEM, raw, rawRel: 'raw/c.json', previous: null });
    expect(log.source).toMatchObject({ kind: 'chat', operator_quote: 'y to 1-2', raw: { form: 'chat', file: 'raw/c.json' } });
    expect(log.decisions[1]).toMatchObject({ id: 'CHAT-2', question: 'Subject two', recommendation: 'Do two.', decision: 'approve', decided_at: '2026-01-05', operator_quote: 'y to two' });
    expect(dl.validateLog(STEM, log)).toEqual([]);
  });

  it('--import --rulings-md takes each "## Spec N:" section\'s **Recommendation.** block verbatim', () => {
    const md = ['# Rulings', '', '## Spec 7: Seven (10 lines)', '', 'Body.', '', '**Recommendation.** Make it historical.', '', '---', '', '## Spec 9: Nine', '', '**Recommendation.** Keep it.', '- (a) one', '', '## Summary of asks', '', '| Spec | Today | Recommendation | Must go with |', '|---|---|---|---|', '| 7 | old | historical | none |', '| 9 | new | keep | 7 |', ''].join('\n');
    const log = dl.importRulingsMd({ stem: STEM, text: md, rawRel: 'raw/r.md', quote: 'y', decidedAt: '2026-01-06', previous: null });
    expect(log.decisions.map((d: { id: string }) => d.id)).toEqual(['SPEC-7', 'SPEC-9']);
    expect(log.decisions[0]).toMatchObject({ question: 'Role of Spec 7: Seven (10 lines). Today: old.', recommendation: '**Recommendation.** Make it historical.', summary_recommendation: 'historical', must_go_with: 'none', decision: 'y' });
    expect(log.decisions[1]!.recommendation).toBe('**Recommendation.** Keep it.\n- (a) one');
  });
});

describe('R-HK — the committed decision logs are fully recorded (real tree)', () => {
  const { logs, specs, io } = dl.loadTree(REPO_ROOT);
  const byStem = new Map(logs.map((l: { stem: string; log: Record<string, unknown> }) => [l.stem, l.log]));

  it('the 2026-10-20 logs are present: 14 page decisions (R-12 amended in chat) and 3 chat decisions', () => {
    const page = byStem.get('2026-10-20-scenario-build-rulings') as { source: { url: string }; decisions: unknown[]; amendments: Record<string, { operator_quote: string }> };
    expect(page.source.url).toBe('https://claude.ai/artifact/MSZP9MjjXhBCnJmPsgVykw');
    expect(page.decisions).toHaveLength(14);
    expect(page.amendments['R-12']!.operator_quote).toBe('your rigth we want the renovation section');
    const roles = byStem.get('2026-10-20-spec-roles-rulings') as { source: { operator_quote: string }; decisions: Array<{ id: string }> };
    expect(roles.source.operator_quote).toBe('y');
    expect(roles.decisions.map((d) => d.id)).toEqual(['SPEC-120', 'SPEC-121', 'SPEC-123']);
    expect((byStem.get('2026-10-20-spec-roles-rulings') as { options: Record<string, string> }).options['SPEC-123']).toMatch(/^\(a\)/);
  });

  it('the chat logs: batch A (CHAT-1…5, "push failed 1 test y to 1-4") and the Spec 132 rulings (R-GU…R-GX)', () => {
    const batch = byStem.get('2026-10-20-chat-batch-a') as { source: { operator_quote: string }; routing: Record<string, { row: string; owed?: string }> };
    expect(batch.source.operator_quote).toBe('push failed 1 test y to 1-4');
    // CHAT-2 → R-HL, CHAT-3 → R-HK (confirmed), CHAT-4 → R-HM (R-RS); CHAT-5 → Spec 69a M-230, which wf1/bylaw-fix-1
    // landed (integrate-13), so the routing no longer says owed and the row cites the decision.
    expect(Object.fromEntries(Object.entries(batch.routing).map(([k, v]) => [k, v.row]))).toEqual({ 'CHAT-1': 'LC-62', 'CHAT-2': 'R-HL', 'CHAT-3': 'R-HK', 'CHAT-4': 'R-HM', 'CHAT-5': 'M-230' });
    expect(batch.routing['CHAT-5']!.owed).toBeUndefined();
    const m230 = fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/01-pipeline/69a_mcbylaw_register.md'), 'utf8').split('\n').find((l) => /^\|\s*\*{0,2}M-230\*{0,2}\s*\|/.test(l));
    expect(m230).toContain('`2026-10-20-chat-batch-a#CHAT-5`');
    const s132 = byStem.get('2026-10-20-spec132-rulings') as { decisions: Array<{ id: string; operator_quote: string }> };
    expect(s132.decisions.map((d) => [d.id, d.operator_quote])).toEqual([['HANDBOOK', 'y to both'], ['ROLES', 'y to this revised version']]);
  });

  it('the night-p4-c chat log (integrate-14): the operator\'s "y" to the two drafts routes to R-GZ and R-HA, and both rows cite it', () => {
    const np4c = byStem.get('2026-10-20-chat-night-p4c') as { source: { operator_quote: string }; decisions: Array<{ id: string; decision: string }>; routing: Record<string, { register: string; row: string; owed?: string }> };
    expect(np4c.source.operator_quote).toBe('y');
    expect(np4c.decisions.map((d) => [d.id, d.decision])).toEqual([['FIT-WIDTH', 'y'], ['DERIVED-WITNESS', 'y']]);
    expect(Object.fromEntries(Object.entries(np4c.routing).map(([k, v]) => [k, [v.register, v.row, v.owed]]))).toEqual({
      'FIT-WIDTH': ['docs/specs/01-pipeline/124_step_standard_policy.md', 'R-GZ', undefined],
      'DERIVED-WITNESS': ['docs/specs/01-pipeline/124_step_standard_policy.md', 'R-HA', undefined],
    });
    const rows = fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/01-pipeline/124_step_standard_policy.md'), 'utf8').split('\n');
    expect(rows.find((l) => l.startsWith('| R-GZ |'))).toContain('`2026-10-20-chat-night-p4c#FIT-WIDTH`');
    expect(rows.find((l) => l.startsWith('| R-HA |'))).toContain('`2026-10-20-chat-night-p4c#DERIVED-WITNESS`');
  });

  it('the steps-rulings-1 logs: 5 V3 page answers (legacy-row-or-query-retired amended by its note) and the chat CHAT-15…CHAT-20, CHAT-22 (CHAT-14 and CHAT-21 belong to another lane)', () => {
    const A = 'docs/specs/01-pipeline/124a_step_standard_policy_appendix.md';
    const page = byStem.get('2026-10-20-v3-exception-rulings') as { source: { url: string }; decisions: Array<{ id: string; decision: string }>; amendments: Record<string, { operator_quote: string }>; routing: Record<string, { register: string; row?: string }> };
    expect(page.source.url).toBe('https://claude.ai/artifact/KBCVRNvhQWd1powYowmZek');
    expect(page.decisions.map((d) => d.decision).sort()).toEqual(['approve', 'approve', 'approve', 'approve', 'change']);
    expect(page.amendments['legacy-row-or-query-retired']!.operator_quote).toBe('Approve with the evidence condition: the entry must cite a consumer grep (zero readers) or show the counted mechanism is gone.');
    expect(Object.values(page.routing).map((v) => [v.register, v.row])).toEqual([[A, 'R-HN'], [A, 'R-HO'], [A, 'R-HP'], [A, 'R-HQ'], [A, 'R-HR']]);
    const chat = byStem.get('2026-10-20-chat-batch-c-steps') as { decisions: Array<{ id: string }>; routing: Record<string, { register: string; row?: string }> };
    expect(chat.decisions.map((d) => d.id)).toEqual(['CHAT-15', 'CHAT-16', 'CHAT-17', 'CHAT-18', 'CHAT-19', 'CHAT-20', 'CHAT-22']);
    expect(Object.fromEntries(Object.entries(chat.routing).map(([k, v]) => [k, v.row ?? v.register]))).toEqual({ 'CHAT-15': 'R-IA', 'CHAT-16': 'R-IB', 'CHAT-17': 'R-IC', 'CHAT-18': 'R-ID', 'CHAT-19': 'R-IE', 'CHAT-20': 'R-IF', 'CHAT-22': A });
    const rows = fs.readFileSync(path.join(REPO_ROOT, A), 'utf8').split('\n').filter((l) => l.includes('`2026-10-20-chat-batch-c-steps#CHAT-22`') && /^\| R-H[S-Z] \|/.test(l));
    expect(rows).toHaveLength(8);
  });

  it('GREEN — every approved decision has its routed register row (or is owed), and every log matches its committed raw record', () => {
    const r = dl.checkDecisionLogs(logs, specs, { io });
    expect(r.problems).toEqual([]);
    expect(r.decisions).toBe(38);
    expect(r.owed).toBe(0);
  });
});
