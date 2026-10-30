// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 (one gate command: exit 0 green, 1 red; MB-67 treats 2 as a FAIL)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 1, 6, 7, 8 (the gate contract, the classes V68-1, the prereg path, O5)
//
// PR-68-6: the REAL-DATA end-to-end round. Nothing is stubbed: the REAL CLI (loop-gate.mjs spawned as a child process) runs the REAL
// scorer over the REAL 172 and 4d CoA data, inside a throw-away `git clone --local` of the working tree (the UNCOMMITTED gate sources
// are copied over it, so this test judges the working copy, not the last commit). No `computeRun` seam, no fake scorer, no injected
// verdicts: an honest round goes green through the CLI and every dishonest variant goes red.
//
// The external data directory is REQUIRED: when it is absent this suite FAILS (never skips), because a silent skip would let a
// real-data round rot unnoticed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(os.homedir(), 'Buildo-scratch', 'coa-data');
const GATE_REL = 'scripts/analysis/mcbylaws-loop/loop-gate.mjs';
const CLONE_OVERLAY = ['scripts/analysis/mcbylaws-loop', path.join('mcbylaws', 'loop')];
const ASSEMBLY = 'scripts/analysis/bylaw-validation/assembly.mjs';
const RULE_MAP = 'scripts/analysis/bylaw/_schema/bylaw-rule-map.json';
const PIN_172 = 'scripts/analysis/bylaw-validation/coa-expected/expected-172.json';
const FLOORS_172 = 'scripts/analysis/bylaw-validation/coa-expected/floors-172.json';
const PREREG_REL = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-99-1.json';
const RECORD_1 = 'docs/reports/loop-records/1/round-01.json';
const SPAWN_BUDGET_MS = 240_000;
const FIXTURE_BUDGET_MS = 300_000;

type Run = { status: number; stdout: string };

/** The env every child process gets: no GIT_* variable (a hook would redirect -C <root>) and no database (the scorer never connects). */
function childEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(out)) if (k.startsWith('GIT_')) delete out[k];
  out.DATABASE_URL = '';
  out.DIRECT_URL = '';
  return out;
}

/** `git -C <cwd> <args>`, scrubbed: the clone's own repository decides everything. */
function git(cwd: string, args: string[], timeout = 120_000) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: childEnv(), timeout });
}

function gitOk(cwd: string, args: string[], timeout = 120_000): string {
  const r = git(cwd, args, timeout);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed (${String(r.status)}): ${String(r.stderr)}`);
  return String(r.stdout);
}

function revParse(cwd: string, ref: string): string {
  const sha = gitOk(cwd, ['rev-parse', '--verify', ref]).trim();
  // a value handed back to the CLI must never look like a flag
  expect(sha).toMatch(/^[0-9a-f]{40,64}$/);
  return sha;
}

function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function writeText(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function appendLine(file: string, line: string): void {
  const text = readText(file);
  writeText(file, `${text}${line}`);
}

let stamp = 0;
/** A fresh comment line every call: two identical lines would make a second append a no-op the index cannot see. */
function commentLine(): string {
  stamp += 1;
  return `// e2e round ${String(stamp)}\n`;
}

describe('MB-68 O5: the REAL CLI over the REAL 172 and 4d CoA data (git clone of the working tree, nothing stubbed)', () => {
  let tmp = '';
  let clone = '';
  let base = '';

  /** The gate as the hooks call it: the real entry point, the clone as --root and cwd. Never throws on a non-zero exit. */
  const gate = (args: string[]): Run => {
    const r = spawnSync(process.execPath, [path.join(clone, GATE_REL), ...args, '--root', clone], {
      cwd: clone,
      encoding: 'utf8',
      timeout: SPAWN_BUDGET_MS,
      env: childEnv(),
    });
    if (r.error) throw r.error;
    return { status: typeof r.status === 'number' ? r.status : -1, stdout: String(r.stdout) };
  };

  const commitAll = (message: string): string => {
    gitOk(clone, ['add', '-A']);
    gitOk(clone, ['commit', '-q', '-m', message]);
    return revParse(clone, 'HEAD');
  };

  /**
   * Every `it` starts from the clone's committed state: leftovers of an earlier step (a staged comment, a written record, a reset
   * pin) made later checks answer for the wrong change set (observed as false results), so the state is cleared first.
   */
  const cleanState = (): void => {
    gitOk(clone, ['reset', '-q', '--hard', 'HEAD']);
    gitOk(clone, ['clean', '-fdq']);
  };

  /** Write (never stage) a comment line in a CODE-class file: it cannot move a scorer row, the gate must demand a record for it. */
  const appendComment = (): void => {
    appendLine(path.join(clone, ASSEMBLY), commentLine());
  };

  /** Append a comment line to the code file AND stage it. */
  const stageComment = (): void => {
    appendComment();
    gitOk(clone, ['add', '--', ASSEMBLY]);
  };

  /** `run --write` for increment 1: the record is written by the tool, never typed by the test. */
  const runWrite = (reason: string): void => {
    const run = gate(['run', '--write', '--mode', 'push', '--increment', '1', '--decision', 'revert', '--reason', reason]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('record written');
  };

  /**
   * `run --write` and STAGE the record it wrote. The round number is read off the written file's own name (the tool numbers rounds):
   * nothing about a path is asserted here, only that the tool wrote one the commit stage can see as an added record.
   */
  const writeRecord = (reason: string): string => {
    runWrite(reason);
    const added = gitOk(clone, ['ls-files', '--others', '--exclude-standard', '--', 'docs/reports/loop-records/1']);
    const paths = added.split('\n').map((s) => s.trim()).filter(Boolean);
    expect(paths.length).toBe(1);
    const rel = paths[0] as string;
    expect(rel).toMatch(/^docs\/reports\/loop-records\/1\/round-\d+\.json$/);
    gitOk(clone, ['add', '--', rel]);
    return rel;
  };

  /** Write a pin/floor file and stage it as a GENERATED change. */
  const editJson = (rel: string, mutate: (obj: Record<string, unknown>) => void): void => {
    const file = path.join(clone, rel);
    const parsed: unknown = JSON.parse(readText(file));
    expect(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)).toBe(true);
    const obj = parsed as Record<string, unknown>;
    mutate(obj);
    writeText(file, `${JSON.stringify(obj, null, 2)}\n`);
    gitOk(clone, ['add', '--', rel]);
  };

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-loop-realdata-'));
    clone = path.join(tmp, 'clone');
    const cl = git(os.tmpdir(), ['clone', '--local', '--quiet', ROOT, clone], FIXTURE_BUDGET_MS);
    if (cl.status !== 0) throw new Error(`clone failed (${String(cl.status)}): ${String(cl.stderr)}`);
    // the UNCOMMITTED working copy of the gate is what is tested: copy it over the clone
    for (const rel of CLONE_OVERLAY) {
      const from = path.join(ROOT, rel);
      const to = path.join(clone, rel);
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true });
    }
    // node_modules is a symlink: the clone always resolves the repo's install
    fs.rmSync(path.join(clone, 'node_modules'), { recursive: true, force: true });
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(clone, 'node_modules'), 'dir');
    gitOk(clone, ['config', 'user.email', 't@t']);
    gitOk(clone, ['config', 'user.name', 't']);
    gitOk(clone, ['add', '-A']);
    gitOk(clone, ['commit', '-q', '--allow-empty', '-m', 'overlay']);
    base = revParse(clone, 'HEAD');
  }, FIXTURE_BUDGET_MS);

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('PR-68-6: the external CoA data directory EXISTS (this suite never skips)', () => {
    expect(fs.existsSync(DATA_DIR)).toBe(true);
    expect(base).toMatch(/^[0-9a-f]{40,64}$/);
  });

  it('1. honest round (a comment, no scorer row moves) goes green through the real CLI', () => {
    cleanState();
    // (a) the round's prereg, committed ALONE (M-321: it lands before the round)
    const pin: unknown = JSON.parse(readText(path.join(clone, PIN_172)));
    const totals = (pin as { totals?: Record<string, number> }).totals;
    expect(totals !== undefined && typeof totals === 'object').toBe(true);
    writeText(
      path.join(clone, PREREG_REL),
      `${JSON.stringify(
        {
          $comment: 'real-data e2e',
          schema: 'coa-round-prereg-v1',
          task: 'MB-99',
          round: 15,
          increment: '1',
          group: 'coa172',
          plan_ref: 'e2e',
          expected_moves: [],
          expected_totals: totals,
        },
        null,
        2,
      )}\n`,
    );
    gitOk(clone, ['add', '--', PREREG_REL]);
    gitOk(clone, ['commit', '-q', '-m', 'prereg MB-99 round 15 (alone)']);

    // (b) a comment in a CODE file: the gate must ask for a record
    stageComment();

    // (c) the tool writes the round's record (a revert: increment 1 cannot be accepted green yet)
    writeRecord('honest real-data round: a comment only, no scorer row moves');
    expect(fs.existsSync(path.join(clone, RECORD_1))).toBe(true);

    // (d) the commit gate is green on the staged round
    const commit = gate(['--mode', 'commit']);
    expect(commit.stdout).not.toContain('FAIL');
    expect(commit.status).toBe(0);

    // (e) the push gate over base..HEAD is green too
    commitAll('honest real-data round');
    const push = gate(['--mode', 'push', '--base', base]);
    expect(push.stdout).not.toContain('FAIL');
    expect(push.status).toBe(0);
  });

  it('2. dishonest: a code change AFTER the record was written is stale_green', () => {
    cleanState();
    // the record is written and STAGED for the round's first comment line (the commit stage sees the added record)...
    stageComment();
    writeRecord('e2e: stale round, the record lands before the second comment');
    // ...and only THEN a second code change lands: the record no longer describes the change set it is committed with
    stageComment();
    const r = gate(['--mode', 'commit']);
    expect(r.stdout).toContain('FAIL');
    expect(r.stdout).toContain('stale_green');
    expect(r.status).toBe(1);
  });

  it('2b. a code change with no record at all is record_missing', () => {
    cleanState();
    stageComment();
    const r = gate(['--mode', 'commit']);
    expect(r.stdout).toContain('FAIL');
    expect(r.stdout).toContain('record_missing');
    expect(r.status).toBe(1);
  });

  it('3. dishonest: a forged case status in a COMMITTED record is record_differs_from_run', async () => {
    // --mode push reads COMMITTED state (HEAD against --base), never the index: the forged round must be a commit of its own.
    cleanState();
    const before = revParse(clone, 'HEAD');
    // the round's code edit lands FIRST: the forged record is re-bound to this committed tree and rewrites that record
    stageComment();
    commitAll('the round code edit');
    const recordRel = writeRecord('e2e: round to be forged');
    const committed = commitAll('the round record (to be forged)');

    const recordFile = path.join(clone, recordRel);
    const parsed: unknown = JSON.parse(readText(recordFile));
    const rec = parsed as { cases?: Array<{ id?: string; status?: string }> };
    expect(Array.isArray(rec.cases) && rec.cases.length > 0).toBe(true);
    const cases = rec.cases as Array<{ id?: string; status?: string }>;
    const first = cases[0];
    expect(first !== undefined && typeof first.status === 'string').toBe(true);
    const flip = (s: string): string => (s === 'pass' ? 'fail' : 'pass');
    const [head, ...rest] = cases;
    expect(head !== undefined).toBe(true);
    const forged = { ...rec, cases: [{ ...(head as { id?: string; status?: string }), status: flip(String((head as { status?: string }).status)) }, ...rest] };
    // a real re-binding: the forged record carries a VALID binding, so only run honesty can catch it
    const recordMod: unknown = await import(pathToFileURL(path.join(clone, 'scripts/analysis/mcbylaws-loop/loop-record.mjs')).href);
    const bindRecord = (recordMod as { bindRecord: (r: unknown) => unknown }).bindRecord;
    writeText(recordFile, `${JSON.stringify(bindRecord(forged), null, 2)}\n`);
    // the forged record lands beside a code edit, so the round's change set is otherwise honest (only run honesty can catch it)
    const rewritten = git(clone, ['diff', '--quiet', 'HEAD', '--', recordRel]);
    expect(rewritten.status).toBe(1);
    stageComment();
    commitAll('forged round (the case status is flipped)');

    expect(before).not.toBe(committed);
    const r = gate(['--mode', 'push', '--base', before]);
    expect(r.stdout).toContain('record_differs_from_run');
    expect(r.status).toBe(1);
  });

  it('4. dishonest: a hand-edited pin is generated_not_regenerable', () => {
    cleanState();
    stageComment();
    // the pin claims one more MATCH than the real 172 rows score
    editJson(PIN_172, (obj) => {
      const totals = obj.totals;
      expect(totals !== null && typeof totals === 'object').toBe(true);
      const t = totals as Record<string, number>;
      t.MATCH = Number(t.MATCH) + 1;
    });
    // a fresh round record: the run is honest, only the pin is a hand edit
    writeRecord('e2e: hand-edited pin');
    const r = gate(['--mode', 'commit']);
    expect(r.stdout).toContain('generated_not_regenerable');
    expect(r.status).toBe(1);
  });

  it('5. metadata only: a rule-map touch needs no record, but beside a code edit it is record_missing', () => {
    cleanState();
    // alone: no code, oracle or generated path changed, so the record stages never fire (the pin and the floors still run)
    appendLine(path.join(clone, RULE_MAP), '\n');
    gitOk(clone, ['add', '--', RULE_MAP]);
    const alone = gate(['--mode', 'commit']);
    expect(alone.status).toBe(0);
    expect(alone.stdout).not.toContain('FAIL');

    // beside a code edit: the record stage fires and no record was added (the rule-map edit is still staged)
    stageComment();
    const beside = gate(['--mode', 'commit']);
    expect(beside.stdout).toContain('record_missing');
    expect(beside.status).toBe(1);
  });

  it('6. prereg-only add: a new prereg file is out of scope', () => {
    cleanState();
    const fresh = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-99-2.json';
    writeText(
      path.join(clone, fresh),
      `${JSON.stringify({ $comment: 'prereg only', schema: 'coa-round-prereg-v1', task: 'MB-99', round: 16, increment: '1', plan_ref: 'e2e', expected_moves: [], expected_totals: {} }, null, 2)}\n`,
    );
    gitOk(clone, ['add', '--', fresh]);
    const r = gate(['--mode', 'commit']);
    expect(r.stdout).toContain('out of scope');
    expect(r.status).toBe(0);
  });

  it('7. floors still guard the real data: a raised floor over the real rows is floor_fell', () => {
    cleanState();
    stageComment();
    // accuracy 99 sits above the measured MATCH/(MATCH+DIFFER) of the real 172 rows
    editJson(FLOORS_172, (obj) => {
      const overall = obj.overall;
      expect(overall !== null && typeof overall === 'object').toBe(true);
      (overall as Record<string, number>).accuracy = 99;
    });
    writeRecord('e2e: raised floor');
    // the tool numbers its rounds, so no record path is asserted here: only the verdict of the commit stage
    const r = gate(['--mode', 'commit']);
    expect(r.stdout).toContain('floor_fell');
    expect(r.status).toBe(1);
  });
});
