// SPEC LINK: task-406 (V2.LIST round 2); 08_agents.md section 7 rules 3 and 4; Spec 124 Rule 13 (generated docs) and R-GW (role banner); Spec 128 line 182 (the panel record).
// The real table, pinned: the rows the grounder ruled on (engineering standards on the phone and surface rows, the panel record row, the generated and policy report rows) and the repo copy of the plan protocol.
import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, script, tmp } from './helpers';

const CLI = 'scripts/analysis/rule-lists.mjs';
type Res = { lists: { id: string; rows: string[] }[] };
type Row = { id: string; globs?: string[]; lists: string[]; why: string };
const lists = (files: string, type = 'build') => {
  const r = script(CLI, ['resolve', '--files', files, '--type', type, '--letter', 'S']);
  expect(r.status, `${files}: ${r.stderr}`).toBe(0);
  return (JSON.parse(r.stdout) as Res).lists.map((l) => l.id);
};
const table = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as { rows: Row[]; lists: Record<string, { file: string; sections?: string[] }> };

describe('V2.LIST round 2: the table rows', () => {
  it('a phone file and a surface path that is not a descriptor get the engineering standards (eng-all)', () => {
    expect(lists('mobile/x.ts')).toContain('eng-all');
    expect(lists('scripts/surfaces/_schema/static-page.json')).toContain('eng-all');
    for (const id of ['mobile', 'surfaces']) expect(table().rows.find((r) => r.id === id)!.lists, id).toContain('eng-all');
  });
  it('a panel record (docs/reports/panels/**) gets Specs 128, 126, 08 sections 7 and 11, and 137', () => {
    expect(lists('docs/reports/panels/MF-94.json')).toEqual(expect.arrayContaining(['surface-128', 'surface-126', 'agents-s7-s11', 'queue-137']));
  });
  it('a generated report gets the Spec 124 list (Rule 13, R-GW) and not surface-127; a 127-* generated file keeps surface-127 and gets it too', () => {
    const g = lists('docs/reports/generated/x.md');
    expect(g).toContain('policy-124-s2-s5');
    expect(g).not.toContain('surface-127');
    const g127 = lists('docs/reports/generated/127-surface-registry.md');
    expect(g127).toEqual(expect.arrayContaining(['surface-127', 'policy-124-s2-s5']));
    const t = table().lists['policy-124-s2-s5']!;
    expect(t.file).toBe('docs/specs/01-pipeline/124_step_standard_policy.md');
    expect(t.sections).toEqual(['2. The rules', '5. Register of rulings']);
  });
  it('the policy report row says plainly that it has nearest lists and no governing spec: operator ruling owed', () => {
    expect(lists('docs/reports/policy/x.md')).toContain('queue-137');
    const row = table().rows.find((r) => r.globs?.includes('docs/reports/policy/**'))!;
    expect(row.why).toContain('nearest lists, no governing spec: operator ruling owed');
  });
  it('docs/reference (generated reference files) resolves to the nearest lists and says: no governing spec found: operator ruling owed', () => {
    expect(lists('docs/reference/logic-variables-registry.md')).toEqual(expect.arrayContaining(['queue-137', 'eng-all']));
    const row = table().rows.find((r) => r.globs?.includes('docs/reference/**'))!;
    expect(row.why).toContain('no governing spec found: operator ruling owed');
  });
  it('the Spec 124 list block carries Rule 13 and the role banner rule R-GW', () => {
    const r = script(CLI, ['lens-input', '--list', 'policy-124-s2-s5', '--material', path.join(ROOT, 'package.json'), '--out', path.join(tmp('p124'), 'in-x')]);
    expect(r.status, r.stderr).toBe(0);
    const text = r.stdout.trim().split('\n').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(text).toContain('Rule 13 added by R-R');
    expect(text).toContain('| R-GW |');
  });
});

describe('V2.LIST round 2: the repo copy of the plan protocol', () => {
  it('the bytes after the role banner hash to the source file the operator rules came from (d92940f4...), so the copy cannot drift silently', () => {
    const text = fs.readFileSync(path.join(ROOT, 'docs/specs/00-architecture/plan-protocol.md'), 'utf8');
    expect(text.startsWith('> **Role: ')).toBe(true);
    const body = text.slice(text.indexOf('\n\n') + 2);
    expect(crypto.createHash('sha256').update(body).digest('hex')).toBe('d92940f479c51d30b0622b2b6236a0286cb5c9124add4c778d3c173e27d9942a');
  });
});
