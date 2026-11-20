// SPEC LINK: task-406 (V2.LIST round 2); 08_agents.md section 7 rules 3 and 4; Spec 124 Rule 13 (generated docs) and R-GW (role banner); Spec 128 line 182 (the panel record).
// The real table, pinned: the rows the grounder ruled on (engineering standards on the phone and surface rows, the panel record row, the generated and policy report rows) and the repo copy of the plan protocol.
import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, run, script, tmp } from './helpers';

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
type CensusEntry = { identity?: { id?: string }; programme?: { scope?: string }; evidence?: { files?: string[] } };
const ATTACHED_SCOPES = ['parcel_product', 'parcel_admin'];
// In-scope census entries that name no route file TODAY, by identity id, stated here so the skip is explicit: a route file added to one of them later makes this list stale and fails the test (the row then needs the new route).
const EXPECTED_UNROUTED = ['contract_parcels_tracked']; // /api/parcels/tracked: its evidence names only the typed client stub mobile/src/hooks/useTrackedLots.ts, the route does not exist yet
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
const routeOf = (e: CensusEntry) => (e.evidence?.files ?? []).map((x) => x.replace(/:\d+.*$/, '')).find((x) => /^src\/app\/api\/.+\/route\.ts$/.test(x));
/** The identity ids of the in-scope census entries that name no route file. */
export const unroutedContracts = (census: Record<string, CensusEntry>, scopes = ATTACHED_SCOPES): string[] =>
  Object.entries(census).filter(([, e]) => scopes.includes(e.programme?.scope ?? '') && !routeOf(e)).map(([k, e]) => e.identity?.id ?? `entry ${k}`).sort();
/** What a row misses and what it holds that the census no longer names. */
export const routeDrift = (rowGlobs: string[], census: Record<string, CensusEntry>) => {
  const want = new Set(censusRoutes(census));
  const have = new Set(rowGlobs);
  return { missing: [...want].filter((x) => !have.has(x)).sort(), stale: [...have].filter((x) => !want.has(x)).sort() };
};
const censusFile = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/surfaces/_schema/census/contracts.json'), 'utf8')) as Record<string, CensusEntry>;
const entry = (scope: string, file: string, id = file): CensusEntry => ({ identity: { id }, programme: { scope }, evidence: { files: [`${file}:1`] } });

describe('V2.LIST round 4: the surface-contract-routes row equals the census (drift test)', () => {
  it('the real row lists exactly the route files the census names for parcel_product and parcel_admin, and attaches Specs 126, 128, 135 and 136 (operator "1-5 y", MORNING-DECISIONS.md:1520, item 2)', () => {
    const row = table().rows.find((r) => r.id === 'surface-contract-routes')!;
    expect(row, 'row surface-contract-routes').toBeDefined();
    expect(row.lists).toEqual(['surface-126', 'surface-128', 'surface-135', 'surface-136']);
    expect(row.why).toContain('left out for Increment 1·B');
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
  it('the lookup route and a parcel_admin route gain all four surface lists; an estate_other route (leads/detail/[id]) and a platform_shared admin route (admin/stats, left out for Increment 1·B) gain none', () => {
    const four = ['surface-126', 'surface-128', 'surface-135', 'surface-136'];
    expect(lists('src/app/api/parcels/lookup/route.ts')).toEqual(expect.arrayContaining(four));
    expect(lists('src/app/api/admin/media/route.ts')).toEqual(expect.arrayContaining(four));
    for (const p of ['src/app/api/leads/detail/[id]/route.ts', 'src/app/api/admin/stats/route.ts']) for (const l of four) expect(lists(p), `${p}: ${l}`).not.toContain(l);
  });
});

describe('V2.LIST round 5: an in-scope census entry with no route file is skipped by name, never silently', () => {
  it('the real census: the in-scope entries naming no route file are exactly the expected list (a route added later fails here and in the row drift test)', () => {
    expect(unroutedContracts(censusFile())).toEqual(EXPECTED_UNROUTED);
  });
  it('control, PLANTED DEFECTS: an unlisted entry with no route fails; a listed entry that now names a route fails; the control equals the list', () => {
    const base = { a: entry('parcel_product', 'src/app/api/x/route.ts', 'contract_x') };
    const noRoute: CensusEntry = { identity: { id: 'contract_new' }, programme: { scope: 'parcel_admin' }, evidence: { files: ['mobile/src/hooks/useNew.ts:1'] } };
    expect(unroutedContracts({ ...base, n: noRoute })).toEqual(['contract_new']);
    expect(unroutedContracts({ ...base, n: noRoute })).not.toEqual([]);
    expect(unroutedContracts(base)).toEqual([]);
    const nowRouted: CensusEntry = { identity: { id: 'contract_parcels_tracked' }, programme: { scope: 'parcel_product' }, evidence: { files: ['src/app/api/parcels/tracked/route.ts:1'] } };
    expect(unroutedContracts({ ...base, t: nowRouted })).not.toEqual(EXPECTED_UNROUTED);
    expect(unroutedContracts({ ...base, t: { ...nowRouted, evidence: { files: ['mobile/x.ts:1'] } } })).toEqual(EXPECTED_UNROUTED);
    expect(unroutedContracts({ ...base, e: { identity: { id: 'contract_lead' }, programme: { scope: 'estate_other' }, evidence: { files: [] } } })).toEqual([]);
  });
});

// V2.LIST round 7 (task-406; operator, 2026-11-20, "you are probaley rebuilding stuff that already exists you do this all the time. 1-5 y", MORNING-DECISIONS.md:1520, item 3 put to him as "3. Exempt generated snapshots from review material. My recommendation: yes."):
// the table's own exempt key lists the golden snapshot files that one existing check validates. The review material is the task range minus matchesAny(exempt) (the close check and the launch brief); list resolution is NOT changed.
describe('V2.LIST round 7: golden snapshot files are exempt from the review material, each glob names the check that proves it', () => {
  const CHECKS = ['goldenProblems', 'screenArm', 'report-page-capture.ts --check'];
  const raw = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as { exempt: string[]; $comment: string[] };
  const matcher = async () => (await import(path.join(ROOT, 'scripts/analysis/mcbylaws/paths.mjs'))) as { matchesAny: (globs: string[], p: string) => boolean };
  it('a real golden file of each folder is exempt (the surface folders, the report folder, the report-page captures and their mobile views)', async () => {
    const { matchesAny } = await matcher();
    const ex = raw().exempt;
    for (const p of ['src/tests/fixtures/surfaces/report/v21.web.json', 'src/tests/fixtures/surfaces/report/v21.pdf.json', 'src/tests/fixtures/surfaces/web_landing/static.web.json', 'src/tests/fixtures/surfaces/admin_media/hit.web.json', 'src/tests/fixtures/surfaces/mobile_parcel_search/hit.mobile.json', 'src/tests/fixtures/surfaces/admin_media/hit.admin.json', 'src/tests/fixtures/report-page/v21.mobile.json', 'src/tests/fixtures/report-page/entered.pdf.json', 'src/tests/fixtures/report-page/entered.web.json', 'src/tests/fixtures/report-page/v21.admin.json', 'src/tests/fixtures/report-page/props/error.mobile.json']) {
      expect(matchesAny(ex, p), p).toBe(true);
    }
  });
  it('a code file, the manifest, a script or a nested golden-looking file is NOT exempt', async () => {
    const { matchesAny } = await matcher();
    const ex = raw().exempt;
    for (const p of ['src/tests/fixtures/surfaces/x/evil.ts', 'src/tests/fixtures/report-page/run.mjs', 'src/tests/fixtures/surfaces/report/states.json', 'src/tests/fixtures/surfaces/x/y/a.mobile.json', 'src/tests/fixtures/report-page/props/notes.json', 'src/tests/fixtures/report-page/props/x/a.mobile.json', 'scripts/surfaces/report-page-capture.ts']) {
      expect(matchesAny(ex, p), p).toBe(false);
    }
  });
  it('list resolution of a golden path is unchanged by the exempt globs (a row still matches it; exempt stays empty in resolve)', () => {
    const r = script(CLI, ['resolve', '--files', 'src/tests/fixtures/surfaces/report/v21.web.json', '--type', 'record', '--letter', 'S']);
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout) as { exempt: string[]; lists: { id: string }[] };
    expect(j.exempt).toEqual([]);
    expect(j.lists.map((l) => l.id)).toEqual(['surface-136', 'surface-126', 'surface-127', 'surface-128', 'surface-135', 'eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);
  });
  it('every exempt glob beyond the lane and review records names its proving check in $comment (planted defect: a glob with no named check fails)', () => {
    const t = raw();
    const text = t.$comment.join('\n');
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const golden = t.exempt.filter((g) => !g.startsWith('docs/reports/'));
    expect(golden.length).toBe(9);
    const unnamed = (globs: string[], comment: string) => globs.filter((g) => !CHECKS.some((c) => new RegExp(esc(g) + '[^\\n]*proved by[^\\n]*' + esc(c)).test(comment)));
    expect(unnamed(golden, text)).toEqual([]);
    expect(unnamed([...golden, 'src/tests/fixtures/zzz/*.json'], text)).toEqual(['src/tests/fixtures/zzz/*.json']);
  });
});

// task-384 STD.REPORT-OWN part two (operator 2026-11-20, MORNING-DECISIONS.md:1421-1422, item 3 "bring them under the existing checks"): the web report renderer is under the
// McFrontend frontend list (mcbylaws/protected-paths.json), so the surfaces row of the table attaches Spec 136 section 2, 126, 127, 128 and 135 to its reviewers.
describe('task-384: the McFrontend handbook reaches the reviewer of the web report renderer', () => {
  const FILES = ['src/components/report/ReportPage.tsx', 'src/components/report/ReportView.tsx', 'src/components/report/ReportPageToggles.tsx'];
  const SURFACE = ['surface-136', 'surface-126', 'surface-127', 'surface-128', 'surface-135'];
  const glob = 'src/components/report/**';
  const resolveIn = (frontend: string[], file: string): string[] => {
    const d = tmp('rep');
    const pol = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcbylaws/protected-paths.json'), 'utf8')) as { frontend: string[] };
    fs.mkdirSync(path.join(d, 'mcbylaws'));
    fs.writeFileSync(path.join(d, 'mcbylaws/protected-paths.json'), JSON.stringify({ ...pol, frontend }));
    fs.copyFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), path.join(d, 'table.json'));
    run('git', ['init', '-q', '.'], { cwd: d });
    run('git', ['add', '-A'], { cwd: d });
    run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: d });
    const r = script(CLI, ['resolve', '--root', d, '--table', path.join(d, 'table.json'), '--files', file, '--type', 'build', '--letter', 'S']);
    expect(r.status, r.stderr).toBe(0);
    return (JSON.parse(r.stdout) as Res).lists.map((l) => l.id);
  };
  it('the real tree: each of the three files resolves Spec 136, 126, 127, 128 and 135 (before the change: eng-all five-words plan-protocol inc-S ms-S only)', () => {
    expect(JSON.parse(fs.readFileSync(path.join(ROOT, 'mcbylaws/protected-paths.json'), 'utf8')).frontend).toContain(glob);
    for (const f of FILES) expect([f, lists(f)]).toEqual([f, expect.arrayContaining(SURFACE)]);
  });
  it('RED (planted): the glob removed from the frontend list, the surface lists vanish; the real list with the glob is the control', () => {
    const real = (JSON.parse(fs.readFileSync(path.join(ROOT, 'mcbylaws/protected-paths.json'), 'utf8')) as { frontend: string[] }).frontend;
    expect(resolveIn(real, FILES[0] as string)).toEqual(expect.arrayContaining(SURFACE));
    const without = resolveIn(real.filter((g) => g !== glob), FILES[0] as string);
    for (const id of SURFACE) expect(without).not.toContain(id);
    expect(without).toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);
  });
  it('the surface-136 lens input generated for the change holds fe.01 to fe.44 (44 distinct ids)', () => {
    const r = script(CLI, ['lens-input', '--list', 'surface-136', '--material', path.join(ROOT, 'package.json'), '--out', path.join(tmp('fe'), 'in-x')]);
    expect(r.status, r.stderr).toBe(0);
    const text = r.stdout.trim().split('\n').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const ids = new Set(text.match(/\bfe\.\d\d\b/g));
    expect([...ids].sort()).toEqual(Array.from({ length: 44 }, (_, i) => `fe.${String(i + 1).padStart(2, '0')}`));
  });
});
