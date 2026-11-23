// SPEC LINK: task-406 (V2.LIST round 2); 08_agents.md section 7 rules 3 and 4; Spec 124 Rule 13 (generated docs) and R-GW (role banner); Spec 128 line 182 (the panel record).
// The real table, pinned: the rows the grounder ruled on (engineering standards on the phone and surface rows, the panel record row, the generated and policy report rows) and the repo copy of the plan protocol.
import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, run, script, tmp } from './helpers';
import { REGISTER_REL, readFeRows } from '../../../scripts/surfaces/generate-surface-handbook.mjs';

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
  // task-431 (RR-0385 item 7): the phone row gets the front-end and shared sections; the surfaces row keeps the whole file
  it('a phone file gets the engineering standards front-end and shared sections (eng-front, eng-shared); a surface path that is not a descriptor keeps eng-all', () => {
    expect(lists('mobile/x.ts')).toEqual(expect.arrayContaining(['eng-front', 'eng-shared']));
    expect(lists('mobile/x.ts')).not.toContain('eng-all');
    expect(lists('scripts/surfaces/_schema/static-page.json')).toContain('eng-all');
    expect(table().rows.find((r) => r.id === 'mobile')!.lists, 'mobile').toEqual(expect.arrayContaining(['eng-front', 'eng-shared']));
    expect(table().rows.find((r) => r.id === 'surfaces')!.lists, 'surfaces').toContain('eng-all');
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
    const r = script(CLI, ['lens-input', '--context', path.join(ROOT, 'docs/reports/reviews/task-375/fixture-context.md'), '--list', 'policy-124-s2-s5', '--material', path.join(ROOT, 'package.json'), '--out', path.join(tmp('p124'), 'in-x')]);
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
    expect(j.lists.map((l) => l.id)).toEqual(['surface-136', 'eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);
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
// McFrontend frontend list (mcbylaws/protected-paths.json), so the surfaces row of the table attaches Spec 136 section 2 (task-439: no longer 126, 127, 128 and 135) to its reviewers.
describe('task-384: the McFrontend handbook reaches the reviewer of the web report renderer', () => {
  const FILES = ['src/components/report/ReportPage.tsx', 'src/components/report/ReportView.tsx', 'src/components/report/ReportPageToggles.tsx'];
  const SURFACE = ['surface-136'];
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
  it('the real tree: each of the three files resolves Spec 136 section 2 (task-439: Specs 126, 127, 128 and 135 no longer, RR-0380 Q1)', () => {
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
  // MF-95 C-T5 (task-430): the range is computed from the real register (readFeRows throws unless "Next free id" is the row count plus one),
  // not pinned to 44, so a new FE row moves it by itself; planted: one id more than the register holds is refused.
  it('the surface-136 lens input generated for the change holds fe.01 to fe.N, N the FE row count of Spec 135', () => {
    const r = script(CLI, ['lens-input', '--context', path.join(ROOT, 'docs/reports/reviews/task-375/fixture-context.md'), '--list', 'surface-136', '--material', path.join(ROOT, 'package.json'), '--out', path.join(tmp('fe'), 'in-x')]);
    expect(r.status, r.stderr).toBe(0);
    const text = r.stdout.trim().split('\n').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const ids = new Set(text.match(/\bfe\.\d\d\b/g));
    const n = readFeRows(fs.readFileSync(path.join(ROOT, REGISTER_REL), 'utf8')).length;
    const range = (k: number) => Array.from({ length: k }, (_, i) => `fe.${String(i + 1).padStart(2, '0')}`);
    expect(n).toBeGreaterThanOrEqual(57);
    expect([...ids].sort()).toEqual(range(n));
    expect([...ids, `fe.${n + 1}`].sort()).not.toEqual(range(n));
  });
});
// task-375: lens-input takes --context (A4); see the deviation note on the task

// task-412 FOLLOWUPS.ROW: Spec 08 section 7 rule 6 ("DEFER -> review_followups.md with reasons", 08_agents.md:350) names docs/reports/review_followups.md, so the table must know it
// (RR-0336, RR-0338). Without a row a lane's Files line naming it is refused. The row attaches agents-s7-s11 (holds rule 6) and queue-137.
describe('task-412: review_followups.md has its Spec 08 home', () => {
  const FILE = 'docs/reports/review_followups.md';
  const resolveIn = (rows: Row[]) => {
    const d = tmp('fu');
    fs.mkdirSync(path.join(d, 'mcbylaws'));
    fs.copyFileSync(path.join(ROOT, 'mcbylaws/protected-paths.json'), path.join(d, 'mcbylaws/protected-paths.json'));
    fs.writeFileSync(path.join(d, 'table.json'), JSON.stringify({ ...table(), rows }));
    run('git', ['init', '-q', '.'], { cwd: d });
    run('git', ['add', '-A'], { cwd: d });
    run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: d });
    return script(CLI, ['resolve', '--root', d, '--table', path.join(d, 'table.json'), '--files', FILE, '--type', 'build', '--letter', 'S']);
  };
  it('the real table: the file resolves agents-s7-s11 and queue-137 through exactly one row', () => {
    expect(lists(FILE)).toEqual(expect.arrayContaining(['agents-s7-s11', 'queue-137']));
    const rows = table().rows.filter((r) => r.id === 'review-followups');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lists).toEqual(expect.arrayContaining(['agents-s7-s11', 'queue-137']));
  });
  it('RED (planted): the table without the row refuses the file (exit 3, matched by no row); the real table is the control', () => {
    const all = table().rows;
    const control = resolveIn(all);
    expect(control.status, control.stderr).toBe(0);
    const bad = resolveIn(all.filter((r) => r.id !== 'review-followups'));
    expect(bad.status, bad.stderr).toBe(3);
    expect(bad.stderr).toContain('matched by no row');
  });
});

// task-431 INPUTS.3 (RR-0385 item 7, decision-170; RR-0380 Q1 and Q2, decision-165): the engineering seat gets the sections of the engineering standards that fit the task.
// Three section lists on the standards file: eng-front (section 1), eng-back (sections 3 and 9), eng-shared (the rest). The phone row gets front + shared; the step-pipeline and api-lib rows and
// the API routes (ui-app no longer matches src/app/api/**) get back + shared; every other row that had eng-all keeps it; the bylaw row gains none (RR-0380 Q4).
describe('task-431: the engineering standards sent by side', () => {
  const ENG = 'docs/specs/00_engineering_standards.md';
  const SIDES = ['eng-front', 'eng-back', 'eng-shared'];
  type Row431 = Row & { not?: string[] };
  const eng = (ids: string[]) => ids.filter((id) => table().lists[id]?.file === ENG);
  const sectionsOf = (ids: string[]) => ids.flatMap((id) => table().lists[id]?.sections ?? []);
  const withRow = (id: string, edit: (r: Row431) => Row431): Row431[] => table().rows.map((r) => (r.id === id ? edit({ ...r }) : r));
  const onAll = (r: Row431): Row431 => ({ ...r, lists: [...r.lists.filter((l) => !SIDES.includes(l)), 'eng-all'] });
  // the task-412 pattern: a temp tree with the McBylaws path map and a table copy with the given rows
  const resolveIn = (rows: Row431[], files: string): string[] => {
    const d = tmp('eng');
    fs.mkdirSync(path.join(d, 'mcbylaws'));
    fs.copyFileSync(path.join(ROOT, 'mcbylaws/protected-paths.json'), path.join(d, 'mcbylaws/protected-paths.json'));
    fs.writeFileSync(path.join(d, 'table.json'), JSON.stringify({ ...table(), rows }));
    run('git', ['init', '-q', '.'], { cwd: d });
    run('git', ['add', '-A'], { cwd: d });
    run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: d });
    const r = script(CLI, ['resolve', '--root', d, '--table', path.join(d, 'table.json'), '--files', files, '--type', 'build', '--letter', 'S']);
    expect(r.status, r.stderr).toBe(0);
    return (JSON.parse(r.stdout) as Res).lists.map((l) => l.id);
  };
  it('S1: the phone row gets eng-front + eng-shared; a step file, src/lib and an API route get eng-back + eng-shared; the bylaw row is unchanged (planted: each row back on eng-all, ui-app without its not)', () => {
    expect(eng(lists('mobile/x.ts')), 'mobile').toEqual(['eng-front', 'eng-shared']);
    for (const f of ['scripts/steps/x.json', 'src/lib/x.ts', 'src/app/api/parcels/search/route.ts']) expect(eng(lists(f)), f).toEqual(['eng-back', 'eng-shared']);
    expect(table().rows.find((r) => r.id === 'bylaw')!.lists, 'bylaw (control)').toEqual(['bylaw-133']);
    expect(eng(resolveIn(withRow('mobile', onAll), 'mobile/x.ts')), 'planted: the mobile row on eng-all').toEqual(['eng-all']);
    expect(eng(resolveIn(withRow('api-lib', onAll), 'src/lib/x.ts')), 'planted: the api-lib row on eng-all').toEqual(['eng-all']);
    expect(eng(resolveIn(withRow('ui-app', ({ not: _not, ...r }) => r), 'src/app/api/parcels/search/route.ts')), 'planted: the ui-app row without its not').toEqual(['eng-all']);
  });
  it('K1 (survive-the-fix): the web UI, surfaces, hooks and tests rows keep exactly eng-all', () => {
    for (const f of ['src/components/x.tsx', 'src/features/leads/lib/get-lead-feed.ts', 'src/app/(maxbld)/x/page.tsx', 'scripts/surfaces/x.mjs', 'scripts/hooks/x.mjs', 'src/tests/x.test.ts']) expect(eng(lists(f)), f).toEqual(['eng-all']);
  });
  it('K1 planted defect: ui-app on eng-front + eng-shared leaves get-lead-feed.ts (it imports pg) without section 3; the real table is the control', () => {
    const real = eng(lists('src/features/leads/lib/get-lead-feed.ts'));
    expect(real).toEqual(['eng-all']);
    const planted = eng(resolveIn(withRow('ui-app', (r) => ({ ...r, lists: ['eng-front', 'eng-shared'] })), 'src/features/leads/lib/get-lead-feed.ts'));
    expect(planted).not.toContain('eng-all');
    expect(sectionsOf(planted)).not.toContain('3. Database Management & Scaling');
  });
  it('P1: every level-2 heading of the standards file is in exactly one of the three lists, and the three lists joined are the text of the sections (planted: an appended "## 15. New" is unassigned)', async () => {
    const rl = (await import(path.join(ROOT, 'scripts/analysis/rule-lists.mjs'))) as {
      headings: (t: string) => { level: number; title: string; offset: number }[];
      listBlocks: (l: unknown, root: string, id: string) => { label: string; text: string }[];
    };
    const t = table();
    const three = SIDES.map((id) => t.lists[id]);
    expect(three.every((l) => l?.file === ENG && Array.isArray(l.sections)), 'the three lists exist on the standards file').toBe(true);
    const sels = three.map((l) => l!.sections!);
    const unassigned = (text: string) => rl.headings(text).filter((h) => h.level === 2 && sels.filter((s) => s.some((x) => h.title.startsWith(x))).length !== 1).map((h) => h.title);
    const text = fs.readFileSync(path.join(ROOT, ENG), 'utf8');
    expect(unassigned(text)).toEqual([]);
    expect(unassigned(`${text}\n## 15. New\n\nnew rule\n`)).toEqual(['15. New']);
    const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
    const blocks = SIDES.flatMap((id) => rl.listBlocks(t.lists[id], ROOT, id)).map((b) => b.text).sort((a, b) => text.indexOf(a.trimEnd()) - text.indexOf(b.trimEnd()));
    const first = rl.headings(text).find((h) => h.level === 2)!;
    expect(squash(blocks.join('\n'))).toBe(squash(text.slice(first.offset)));
  });
  it('X1: the lens input of eng-front holds 1.1 and not 9.1, eng-back the reverse (planted: a temp table whose eng-front selects section 9 fails the not half; the real table is the control)', () => {
    const CTX = path.join(ROOT, 'docs/reports/reviews/task-375/fixture-context.md');
    const input = (list: string, tableFile?: string) => {
      const r = script(CLI, ['lens-input', ...(tableFile ? ['--table', tableFile] : []), '--context', CTX, '--list', list, '--material', path.join(ROOT, 'package.json'), '--out', path.join(tmp('x1'), 'in-x')]);
      expect(r.status, r.stderr).toBe(0);
      return r.stdout.trim().split('\n').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    };
    const front = input('eng-front');
    expect(front).toContain('1.1 Mobile-First UI Mandate');
    expect(front).not.toContain('9.1 Transaction Boundaries');
    const back = input('eng-back');
    expect(back).toContain('9.1 Transaction Boundaries');
    expect(back).not.toContain('1.1 Mobile-First UI Mandate');
    const t = table();
    const fake = path.join(tmp('x1t'), 'table.json');
    fs.writeFileSync(fake, JSON.stringify({ ...t, lists: { ...t.lists, 'eng-front': { ...t.lists['eng-front'], sections: ['9. Pipeline & Script Safety'] } } }));
    expect(input('eng-front', fake), 'planted: eng-front on section 9').toContain('9.1 Transaction Boundaries');
  });
  // task-439 FINAL.4 (RR-0380 Q1, decision-165; RR-0378 step 3, decision-163; RR-0383, decision-168): the front-end and phone rows send the handbook (Spec 136 section 2),
  // not Specs 126, 127, 128 and 135; the specs-web-admin row keeps all five, so an edit to a surface spec is reviewed with that spec.
  const FOUR = ['surface-126', 'surface-127', 'surface-128', 'surface-135'];
  const MOBILE = ['mobile-90', 'mobile-98', 'mobile-99', 'mobile-100', 'mobile-96', 'surface-136', 'eng-front', 'eng-shared'];
  const handbookOnly = (ids: string[], what: string) => {
    expect(ids, what).toContain('surface-136');
    for (const id of FOUR) expect(ids, what).not.toContain(id);
  };
  it('N1: the front-end and phone rows send the handbook only (planted: the four back on the surfaces row, then on the mobile row; mobile-99 dropped from the mobile row)', () => {
    for (const f of ['src/components/report/ReportPage.tsx', 'scripts/surfaces/x.mjs', 'mobile/x.ts']) handbookOnly(lists(f), f);
    for (const id of ['surfaces', 'mobile']) handbookOnly(table().rows.find((r) => r.id === id)!.lists, `row ${id}`);
    // survive-the-fix: the hand edit of the mobile row keeps its other eight lists
    expect(lists('mobile/x.ts'), 'mobile/x.ts').toEqual(expect.arrayContaining(MOBILE));
    const addFour = (r: Row431): Row431 => ({ ...r, lists: [...r.lists, ...FOUR] });
    const surf = resolveIn(withRow('surfaces', addFour), 'scripts/surfaces/x.mjs');
    expect(surf, 'planted: the four on the surfaces row').toEqual(expect.arrayContaining(FOUR));
    expect(() => handbookOnly(surf, 'planted surfaces')).toThrow();
    const mob = resolveIn(withRow('mobile', addFour), 'mobile/x.ts');
    expect(mob, 'planted: the four on the mobile row').toEqual(expect.arrayContaining(FOUR));
    expect(() => handbookOnly(mob, 'planted mobile')).toThrow();
    const no99 = resolveIn(withRow('mobile', (r) => ({ ...r, lists: r.lists.filter((l) => l !== 'mobile-99') })), 'mobile/x.ts');
    expect(() => expect(no99).toEqual(expect.arrayContaining(MOBILE)), 'planted: mobile-99 dropped').toThrow();
  });
  it('N2 (survive-the-fix, RR-0383): an edit to a surface spec still gets the four specs and Spec 136 through the specs-web-admin row (planted: that row on surface-136 only)', () => {
    const SPECS = ['126_maxbld_surface_standard.md', '127_surface_conversion_procedure.md', '128_surface_standard_policy.md', '135_mcfrontend_decisions_register.md'].map((f) => `docs/specs/02-web-admin/${f}`);
    for (const f of [...SPECS, 'mobile/x.ts, docs/specs/02-web-admin/128_surface_standard_policy.md']) expect(lists(f), f).toEqual(expect.arrayContaining([...FOUR, 'surface-136']));
    expect(table().rows.find((r) => r.id === 'specs-web-admin')!.lists, 'row specs-web-admin').toEqual(expect.arrayContaining([...FOUR, 'surface-136']));
    const planted = resolveIn(withRow('specs-web-admin', (r) => ({ ...r, lists: ['surface-136'] })), 'docs/specs/02-web-admin/128_surface_standard_policy.md');
    expect(planted, 'planted: specs-web-admin on surface-136 only').not.toContain('surface-128');
  });
});
