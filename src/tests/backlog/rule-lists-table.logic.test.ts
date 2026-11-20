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

// V2.LIST round 4 (task-406; operator, 2026-11-20, "yes, ground it and resolve it. don't makr the task complete until it actually works.", MORNING-DECISIONS.md:1517): the contract routes of the programme get the surface standard (Spec 126) and the surface standard policy (Spec 128).
// Census scopes parcel_product and parcel_admin are attached (Spec 126:135 and :136 "Yes"); platform_shared (36 entries) waits for the operator (Spec 126:1132 "Admin pages other than D1-D4 are estate admin, not MaxBLD pages" is read against its 20 admin routes); estate_other is "No" (Spec 126:138).
type CensusEntry = { programme?: { scope?: string }; evidence?: { files?: string[] } };
const ATTACHED_SCOPES = ['parcel_product', 'parcel_admin'];
/** The route file of each census entry in the attached scopes: the first route.ts under src/app/api in evidence.files, its :line suffix removed; an entry naming none is skipped. */
export const censusRoutes = (census: Record<string, CensusEntry>, scopes = ATTACHED_SCOPES): string[] => {
  const out = new Set<string>();
  for (const e of Object.values(census)) {
    if (!scopes.includes(e.programme?.scope ?? '')) continue;
    const f = (e.evidence?.files ?? []).map((x) => x.replace(/:\d+.*$/, '')).find((x) => /^src\/app\/api\/.+\/route\.ts$/.test(x));
    if (f) out.add(f);
  }
  return [...out].sort();
};
/** What a row misses and what it holds that the census no longer names. */
export const routeDrift = (rowGlobs: string[], census: Record<string, CensusEntry>) => {
  const want = new Set(censusRoutes(census));
  const have = new Set(rowGlobs);
  return { missing: [...want].filter((x) => !have.has(x)).sort(), stale: [...have].filter((x) => !want.has(x)).sort() };
};
const censusFile = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/surfaces/_schema/census/contracts.json'), 'utf8')) as Record<string, CensusEntry>;
const entry = (scope: string, file: string): CensusEntry => ({ programme: { scope }, evidence: { files: [`${file}:1`] } });

describe('V2.LIST round 4: the surface-contract-routes row equals the census (drift test)', () => {
  it('the real row lists exactly the route files the census names for parcel_product and parcel_admin, and attaches surface-126 and surface-128 only', () => {
    const row = table().rows.find((r) => r.id === 'surface-contract-routes')!;
    expect(row, 'row surface-contract-routes').toBeDefined();
    expect(row.lists).toEqual(['surface-126', 'surface-128']);
    expect(routeDrift(row.globs ?? [], censusFile())).toEqual({ missing: [], stale: [] });
    expect(row.why).toContain('The client is just glass');
    expect(row.why).toContain('one API route');
  });
  it('control, PLANTED DEFECTS: a census entry in scope with its route missing from the row fails; a row route the census no longer names fails; an estate_other or platform_shared route is not required', () => {
    const census = { a: entry('parcel_product', 'src/app/api/x/route.ts'), b: entry('parcel_admin', 'src/app/api/admin/y/route.ts'), c: entry('estate_other', 'src/app/api/leads/z/route.ts'), d: entry('platform_shared', 'src/app/api/admin/w/route.ts') };
    expect(routeDrift(['src/app/api/x/route.ts', 'src/app/api/admin/y/route.ts'], census)).toEqual({ missing: [], stale: [] });
    expect(routeDrift(['src/app/api/x/route.ts'], census).missing).toEqual(['src/app/api/admin/y/route.ts']);
    expect(routeDrift(['src/app/api/x/route.ts', 'src/app/api/admin/y/route.ts', 'src/app/api/gone/route.ts'], census).stale).toEqual(['src/app/api/gone/route.ts']);
  });
  it('the lookup route and a parcel_admin route gain surface-126 and surface-128; an estate_other route (leads/detail/[id]) does not', () => {
    expect(lists('src/app/api/parcels/lookup/route.ts')).toEqual(expect.arrayContaining(['surface-126', 'surface-128']));
    expect(lists('src/app/api/admin/media/route.ts')).toEqual(expect.arrayContaining(['surface-126', 'surface-128']));
    const lead = lists('src/app/api/leads/detail/[id]/route.ts');
    expect(lead).not.toContain('surface-126');
    expect(lead).not.toContain('surface-128');
  });
});
