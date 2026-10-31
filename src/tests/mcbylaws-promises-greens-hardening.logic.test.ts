// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-73 plan sections 3 and 4); K-1 (a green must bind its artifact
//            as an input), K-6 / R-LG (the red record's binding is judged like the green's: a rewritten red is red).

import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { bindRecord } from '../../scripts/analysis/mcbylaws-loop/loop-record.mjs';
import { blobsFor } from '../../scripts/analysis/mcbylaws-promises/promise-record.mjs';
import { identityHash } from '../../scripts/analysis/mcbylaws-promises/promise-register.mjs';
import { greenLines } from '../../scripts/analysis/mcbylaws-promises/promise-greens.mjs';

const ART = 't.test.mjs';
const OTHER = 'other.test.mjs';
const GREEN_P = 'mcbylaws/promises/green/R-1.json';
const RED_P = 'mcbylaws/promises/red/R-1.json';
const ROW = { id: 'R-1', file: 'docs/specs/x.md', quoted_line: 'the promise' };
const ENTRY = { artifact: ART, test_name: 'suite does it' };
const RUN = { passed: 1, failed: 0, skipped: 0, total: 1 };
const PASSED = { 'R-1': { state: 'passed', fullName: ENTRY.test_name } };
const BLOB = 'a'.repeat(40);

type Rec = Record<string, unknown>;

type Over = {
  greenPatch?: (g: Rec) => Rec;
  redPatch?: (r: Rec) => Rec;
  redUnbound?: boolean;
  redAfterBind?: (r: Rec) => Rec;
  greenAfterBind?: (g: Rec) => Rec;
};

let repo: Repo;
afterEach(() => repo && repo.cleanup());

type Call = () => { lines: string[]; states: Record<string, string> };

function build(over: Over = {}) {
  repo = makeRepo();
  repo.write(ART, "import { it, expect } from 'vitest';\nit('does it', () => { expect(1).toBe(1); });\n");
  repo.write(OTHER, "import { it, expect } from 'vitest';\nit('other', () => { expect(1).toBe(1); });\n");
  repo.write('docs/specs/x.md', `## R-1 — the promise\n\n> ${ROW.quoted_line}\n`);
  const base = repo.commit('base');
  const blobs = blobsFor(repo.dir, 'HEAD', [ART, OTHER]) as Record<string, string>;
  let red: Rec = { schema: 'promise-red-v1', id: 'R-1', artifact: ENTRY.artifact, test_name: ENTRY.test_name,
    artifact_blob: blobs[ART], commit: base, run: RUN };
  let green: Rec = { schema: 'promise-green-v1', id: 'R-1', artifact: ENTRY.artifact, test_name: ENTRY.test_name,
    artifact_blob: blobs[ART], red_of: blobs[ART], identity_sha: identityHash(ROW, ENTRY),
    inputs: { [ART]: blobs[ART] }, commit: base, run: RUN };
  if (over.redPatch) red = over.redPatch(red);
  if (over.greenPatch) green = over.greenPatch(green);
  red = over.redUnbound ? red : bindRecord(red);
  green = bindRecord(green);
  if (over.redAfterBind) red = over.redAfterBind(red);
  if (over.greenAfterBind) green = over.greenAfterBind(green);
  repo.write(RED_P, `${JSON.stringify(red)}\n`);
  repo.write(GREEN_P, `${JSON.stringify(green)}\n`);
  repo.write('records.txt', 'x\n');
  repo.commit('records');
  const call: Call = () =>
    greenLines({ cwd: repo.dir, rev: 'HEAD', rows: [ROW], artifacts: { 'R-1': ENTRY }, matches: PASSED }) as
      { lines: string[]; states: Record<string, string> };
  return { repo, call, blobs };
}

const count = (lines: string[], line: string) => lines.filter((l) => l === line).length;

describe('greenLines hardening (K-1, K-6)', () => {
  const cases: [string, Over, string, string[]][] = [
    ['empty inputs -> stale green once', { greenPatch: (g) => ({ ...g, inputs: {} }) }, 'red',
      ['FAIL:R:stale-green:R-1']],
    ['no inputs field -> stale green', { greenPatch: (g) => { const r = { ...g }; delete r.inputs; return r; } }, 'red',
      ['FAIL:R:stale-green:R-1']],
    ['inputs with only another file -> stale green', { greenPatch: (g) => ({ ...g, inputs: { [OTHER]: g.artifact_blob } }) },
      'red', ['FAIL:R:stale-green:R-1']],
    ['red edited after its binding -> record-rewritten', { redAfterBind: (r) => ({ ...r, commit: 'edited-by-hand' }) },
      'red', [`FAIL:R:record-rewritten:${RED_P}`]],
    ['red without a binding field -> record-rewritten', { redUnbound: true }, 'red',
      [`FAIL:R:record-rewritten:${RED_P}`]],
  ];
  it.each(cases)('%s', (_name, over, state, lines) => {
    const res = build(over).call();
    expect(res.states['R-1']).toBe(state);
    expect(res.lines).toStrictEqual(lines);
  });

  it('a green binding its artifact as an input is fresh -> no stale line, state done', () => {
    const res = build().call();
    expect(res.states['R-1']).toBe('done');
    expect(res.lines.filter((l) => l.includes('stale-green'))).toStrictEqual([]);
    expect(res.lines).toStrictEqual([]);
  });

  it('empty inputs emits the stale-green line exactly once, with no duplicate', () => {
    const res = build({ greenPatch: (g) => ({ ...g, inputs: {} }) }).call();
    expect(count(res.lines, 'FAIL:R:stale-green:R-1')).toBe(1);
    expect(res.lines.length).toBe(1);
  });

  it('a rebound red (binding intact) passes and the green is done', () => {
    const b = build();
    const res = b.call();
    expect(res.states['R-1']).toBe('done');
    expect(res.lines).toStrictEqual([]);
  });

  it('a red edited after binding is red once even with another red problem', () => {
    const res = build({
      redAfterBind: (r) => ({ ...r, artifact_blob: BLOB }),
    }).call();
    expect(count(res.lines, `FAIL:R:record-rewritten:${RED_P}`)).toBe(1);
    expect(res.states['R-1']).toBe('red');
  });
});
