// SPEC LINK: task-366 (COMPLY.2); Spec 08 section 7 rule 4 and section 5.3 (08_agents.md); 00_engineering_standards.md section 14 (findings to protocols to gates).
// scripts/analysis/rule-lists.mjs + scripts/analysis/rule-lists.json: the path to rule-list table is DATA. Run as a CLI (validate, resolve, lens-input, findings).
// Real table: every list file exists, every section selector names exactly one heading, every row glob matches a tracked path. Fixture trees: resolution by Files line, exempt,
// import row, record-only default, lens input (one file when small, split by the list's own headings when big, never trims, refuses what cannot fit).
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, run, script, tmp } from './helpers';

const CLI = 'scripts/analysis/rule-lists.mjs';
type Lst = { id: string; file: string; rows: string[]; why: string[]; status?: string; generated_by: string };
type Res = { lists: Lst[]; exempt: string[]; unmatched: string[] };
const ids = (r: Res) => r.lists.map((l) => l.id);

describe('the real table (AC #1: data, every listed rule file exists)', () => {
  it('validates: files exist, each section selector names exactly one heading, every glob matches a tracked path', () => {
    const r = script(CLI, ['validate']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/rule-lists: ok \d+ lists, \d+ rows/);
  });
  it('every list file named in the table is on disk (independent read of the JSON)', () => {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as { lists: Record<string, { file: string }> };
    expect(Object.keys(t.lists).length).toBeGreaterThan(20);
    for (const [id, l] of Object.entries(t.lists)) expect(fs.existsSync(path.join(ROOT, l.file)), `${id}: ${l.file}`).toBe(true);
  });
  it('reuses the McBylaws path map instead of copying it (globs_from)', () => {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as { rows: { id: string; globs_from?: { key: string } }[] };
    expect(t.rows.filter((r) => r.globs_from).map((r) => r.globs_from!.key).sort()).toEqual(['frontend', 'layer23']);
  });
  it('a mobile file plus an API route names every list of both rows (AC #2, resolution half)', () => {
    const r = script(CLI, ['resolve', '--files', 'mobile/src/app/x.tsx, src/app/api/parcels/search/route.ts', '--type', 'build', '--letter', 'S']);
    expect(r.status, r.stderr).toBe(0);
    const res = JSON.parse(r.stdout) as Res;
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as { rows: { id: string; lists: string[] }[] };
    for (const row of ['mobile', 'api-lib', 'storage']) for (const l of t.rows.find((x) => x.id === row)!.lists) expect(ids(res), `${row}: ${l}`).toContain(l);
    expect(ids(res)).toContain('inc-S');
    const doc16 = res.lists.find((l) => l.id === 'storage-doc16');
    expect(doc16?.status).toMatch(/draft, operator to confirm it binds/);
  });
  it('a src file that imports from scripts/lib/compute gets the step and Airtight lists (import row)', () => {
    const r = script(CLI, ['resolve', '--files', 'src/lib/parcels/report-compute.ts', '--type', 'build', '--letter', 'S']);
    const res = JSON.parse(r.stdout) as Res;
    expect(ids(res)).toContain('step-132');
    expect(ids(res)).toContain('airtight-v3-122');
  });
  it('ATTACK 12: the real paths that matched no row now resolve (components, app pages, middleware, package.json, CI), and a surfaces importer gets Specs 126 and 128', () => {
    for (const p of ['src/components/report/X.tsx', 'src/app/(maxbld)/page.tsx', 'src/middleware.ts', 'package.json', '.github/workflows/test.yml']) {
      const r = script(CLI, ['resolve', '--files', p, '--type', 'build', '--letter', 'S']);
      expect(r.status, `${p}: ${r.stderr}`).toBe(0);
    }
    const imp = JSON.parse(script(CLI, ['resolve', '--files', 'src/lib/parcels/lot-size-entry.ts', '--type', 'build', '--letter', 'S']).stdout) as Res;
    expect(ids(imp)).toEqual(expect.arrayContaining(['surface-126', 'surface-128']));
    console.log(`ATTACK 12: RESOLVES: src/components, src/app, src/middleware.ts, package.json, .github ; importer lists ${ids(imp).join(',')}`);
  });
  it('task-376: a task that edits spec files resolves; a mobile or web-admin spec also gets that surface\'s own lists', () => {
    const lists = (files: string) => { const r = script(CLI, ['resolve', '--files', files, '--type', 'build', '--letter', '1']); expect(r.status, r.stderr).toBe(0); return ids(JSON.parse(r.stdout) as Res); };
    const mobile = lists('docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json');
    for (const l of ['eng-all', 'agents-s7-s11', 'queue-137', 'mobile-100', 'mobile-90', 'surface-136']) expect(mobile).toContain(l);
    const web = lists('docs/specs/02-web-admin/128_surface_standard_policy.md');
    for (const l of ['eng-all', 'agents-s7-s11', 'queue-137', 'surface-128', 'surface-135']) expect(web).toContain(l);
    const pipe = lists('docs/specs/01-pipeline/132_step_standard_handbook.md');
    for (const l of ['eng-all', 'agents-s7-s11', 'queue-137']) expect(pipe).toContain(l);
    expect(pipe).not.toContain('mobile-100');
    expect(lists('backlog/docs/doc-16 - McStorage-policy-v2.md')).toContain('queue-137');
  });
  it('an unmatched path is refused and named (exit 3)', () => {
    const r = script(CLI, ['resolve', '--files', 'zzz-unknown/dir/file.txt', '--type', 'build', '--letter', 'S']);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('zzz-unknown/dir/file.txt');
  });
});

function fixture() {
  const d = tmp('rl');
  const w = (f: string, t: string) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  const pad = 'pad line of rule text\n'.repeat(25);
  w('docs/a.md', `# A\n\n## 1. First\n\nfirst text with $' and $& marks\n\n\`\`\`\n## 2. Not a heading (fenced)\n\`\`\`\n\n${pad}### 1.1 Sub\n\nsub text\n${pad}\n## 2. Second\n\nsecond text\n${pad}\n## 3. Third\n\nthird text\n${pad}`);
  w('docs/c.md', '# C\r\n\r\n## 1. One\r\n\r\none line\r\n\r\n## 2. Two\r\n\r\ntwo line\r\n');
  w('docs/inc.md', '# Inc\n\nincrement requirements\n');
  w('docs/q.md', '# Q\n\nqueue rules\n');
  w('docs/e.md', '# E\n\n## 7. Rules\n\n' + 'rule line\n'.repeat(400) + '\n## 8. After\n\nafter\n');
  w('src/one.ts', "import { x } from '../scripts/lib/" + "compute/thing';\nexport const a = x;\n");
  w('src/two.ts', 'export const b = 2;\n');
  w('src/four.ts', "import { s } from '@/lib/surfaces/x';\nexport const d = s;\n");
  w('src/five.ts', "import { s } from '../scripts/lib/" + "compute-old/x';\nexport const e = s;\n");
  w('src/six.ts', "// scripts/lib/" + "compute is only named in this comment\nconst text = 'from ../scripts/lib/" + "compute/x';\nexport const f = text;\n");
  w('mobile/m.tsx', 'export const m = 1;\n');
  w('scripts/lib/compute/thing.js', 'x\n');
  w('pol/protected.json', JSON.stringify({ frontend: ['mobile/**'] }));
  w('docs/reports/lanes/2026-11-20/L/REPORT.md', 'r\n');
  const table = {
    contract_version: 1,
    lists: {
      first: { file: 'docs/a.md', sections: ['1. First'], generated_by: 'hand-written' },
      whole: { file: 'docs/a.md', whole: true, generated_by: 'hand-written' },
      crlf: { file: 'docs/c.md', sections: ['1. One'], generated_by: 'hand-written' },
      queue: { file: 'docs/q.md', whole: true, generated_by: 'hand-written' },
      big: { file: 'docs/e.md', sections: ['7. Rules'], generated_by: 'hand-written', status: 'draft' },
      'inc-F': { file: 'docs/inc.md', whole: true, generated_by: 'hand-written' },
    },
    rows: [
      { id: 'src-row', globs: ['src/**'], lists: ['first'], why: 'src' },
      { id: 'imp', globs: ['src/**/*.ts'], imports_from: ['scripts/lib/compute'], lists: ['whole'], why: 'imports compute' },
      { id: 'surf', globs: ['src/**/*.ts'], imports_from: ['src/lib/surfaces'], lists: ['queue'], why: 'imports surfaces' },
      { id: 'mob', globs_from: { file: 'pol/protected.json', key: 'frontend' }, lists: ['big'], why: 'frontend' },
      { id: 'nr', globs: ['docs/*.md'], not: ['docs/q.md'], lists: ['crlf'], why: 'a row with an exclusion' },
      { id: 'queue-records', globs: ['docs/*.md'], lists: ['queue'], why: 'records' },
    ],
    exempt: ['docs/reports/lanes/**'],
    no_files_default: { types: ['record'], row: 'queue-records' },
    increment_docs: { F: 'inc-F' },
  };
  w('pol/table.json', JSON.stringify(table));
  const g = (...a: string[]) => run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d });
  g('init', '-q', '.'); g('add', '-A'); g('commit', '-qm', 'x');
  return { d, table: path.join(d, 'pol/table.json') };
}
const res = (f: ReturnType<typeof fixture>, files: string, extra: string[] = []) => script(CLI, ['resolve', '--root', f.d, '--table', f.table, '--files', files, '--letter', 'F', ...extra]);

describe('resolve on a fixture tree (AC #2)', () => {
  it('src/two.ts gets only the src row; src/one.ts (imports compute) also gets the import row; the increment doc is always added', () => {
    const f = fixture();
    const a = JSON.parse(res(f, 'src/two.ts', ['--type', 'build']).stdout) as Res;
    expect(ids(a).sort()).toEqual(['first', 'inc-F']);
    const b = JSON.parse(res(f, 'src/one.ts', ['--type', 'build']).stdout) as Res;
    expect(ids(b).sort()).toEqual(['first', 'inc-F', 'whole']);
    expect(b.lists.find((l) => l.id === 'whole')!.rows).toEqual(['imp']);
  });
  it('a row may exclude paths (not): the review tool CLI is not a step shell', () => {
    const f = fixture();
    expect(ids(JSON.parse(res(f, 'docs/c.md', ['--type', 'build']).stdout) as Res)).toContain('crlf');
    expect(ids(JSON.parse(res(f, 'docs/q.md', ['--type', 'build']).stdout) as Res)).not.toContain('crlf');
    const real = JSON.parse(script(CLI, ['resolve', '--files', 'scripts/deepseek-review.js', '--type', 'build', '--letter', 'S']).stdout) as Res;
    expect(ids(real)).not.toContain('step-132');
    expect(ids(real)).toContain('agents-s5-1to3');
    expect(JSON.parse(script(CLI, ['resolve', '--files', 'scripts/load-permits.js', '--type', 'build', '--letter', 'S']).stdout) as Res).toMatchObject({ lists: expect.arrayContaining([expect.objectContaining({ id: 'step-132' })]) });
  });
  it('a dir entry and a glob entry match through tracked files; a new file in a new dir matches by probe', () => {
    const f = fixture();
    expect(ids(JSON.parse(res(f, 'src/', ['--type', 'build']).stdout) as Res)).toContain('whole');
    expect(ids(JSON.parse(res(f, 'src/*.ts', ['--type', 'build']).stdout) as Res)).toContain('first');
    expect(ids(JSON.parse(res(f, 'src/newdir/new-*.ts', ['--type', 'build']).stdout) as Res)).toContain('first');
  });
  it('globs_from reads the existing path map', () => {
    const f = fixture();
    expect(ids(JSON.parse(res(f, 'mobile/m.tsx', ['--type', 'build']).stdout) as Res)).toContain('big');
  });
  it('an exempt entry beside a matched one resolves to no list and is flagged; exempt is not unmatched', () => {
    const f = fixture();
    const r = res(f, 'src/two.ts, docs/reports/lanes/x/', ['--type', 'build']);
    expect(r.status, r.stderr).toBe(0);
    const a = JSON.parse(r.stdout) as Res;
    expect(a.exempt).toEqual(['docs/reports/lanes/x/']);
    expect(a.unmatched).toEqual([]);
    expect(ids(a).sort()).toEqual(['first', 'inc-F']);
  });
  it('ATTACK 11: a Files line of only exempt paths for a build or fix task is refused (a record-only task may keep it)', () => {
    const f = fixture();
    for (const type of ['build', 'fix']) {
      const r = res(f, 'docs/reports/lanes/x/', ['--type', type]);
      expect(r.status).toBe(3);
      expect(r.stderr).toMatch(/no rule list/);
      console.log(`ATTACK 11: REFUSED: ${r.stderr.trim().slice(0, 200)}`);
    }
    expect(res(f, 'docs/reports/lanes/x/', ['--type', 'record']).status).toBe(0);
  });
  it('the import row is anchored on the resolved module path: an alias, a relative path match; a longer sibling name, a comment and a string do not', () => {
    const f = fixture();
    const of = (p: string) => ids(JSON.parse(res(f, p, ['--type', 'build']).stdout) as Res);
    expect(of('src/four.ts')).toContain('queue'); // '@/lib/surfaces/x' resolves to src/lib/surfaces/x
    expect(of('src/one.ts')).toContain('whole'); // relative scripts/lib/compute/thing
    expect(of('src/five.ts')).not.toContain('whole'); // scripts/lib/compute-old is another directory
    expect(of('src/six.ts')).not.toContain('whole'); // only a comment and a string
  });
  it('an unmatched entry is refused with the path named, even beside matched ones', () => {
    const f = fixture();
    const r = res(f, 'src/two.ts, nowhere/else.txt', ['--type', 'build']);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('nowhere/else.txt');
    expect(r.stderr.trim().split('\n')).toHaveLength(1);
  });
  it('no Files line: refused for a build task, queue lists for a record-only task', () => {
    const f = fixture();
    const b = res(f, '', ['--type', 'build']);
    expect(b.status).toBe(3);
    expect(b.stderr).toMatch(/no Files/);
    const r = JSON.parse(res(f, '', ['--type', 'record']).stdout) as Res;
    expect(ids(r).sort()).toEqual(['inc-F', 'queue']);
  });
  it('a milestone letter with no increment_docs entry is refused naming the letter', () => {
    const f = fixture();
    const r = script(CLI, ['resolve', '--root', f.d, '--table', f.table, '--files', 'src/two.ts', '--letter', 'Q', '--type', 'build']);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('Q');
  });
  it('a row that names an undefined list, or a table with no rows, is refused with one named line, not a stack', () => {
    const f = fixture();
    const t = JSON.parse(fs.readFileSync(f.table, 'utf8'));
    t.rows[0].lists = ['nope'];
    fs.writeFileSync(f.table, JSON.stringify(t));
    const r = res(f, 'src/two.ts', ['--type', 'build']);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('nope');
    expect(r.stderr.trim().split('\n')).toHaveLength(1);
    delete t.rows;
    fs.writeFileSync(f.table, JSON.stringify(t));
    const v = script(CLI, ['validate', '--root', f.d, '--table', f.table]);
    expect(v.status).toBe(1);
    expect(v.stderr).toMatch(/rows/);
  });
  it('validate refuses a missing list file, a selector with no heading and a dead glob', () => {
    const f = fixture();
    const t = JSON.parse(fs.readFileSync(f.table, 'utf8'));
    t.lists.first.sections = ['9. Nope'];
    t.lists.queue.file = 'docs/gone.md';
    t.rows.push({ id: 'dead', globs: ['nothing/**'], lists: ['first'], why: 'dead' });
    t.rows.push({ id: 'badkey', globs_from: { file: 'pol/protected.json', key: 'zzz' }, lists: ['first'], why: 'x' });
    fs.writeFileSync(f.table, JSON.stringify(t));
    const r = script(CLI, ['validate', '--root', f.d, '--table', f.table]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/gone.md');
    expect(r.stderr).toContain('9. Nope');
    expect(r.stderr).toContain('nothing/**');
    expect(r.stderr).toContain('zzz');
  });
});

const TPL = '## System persona\nsys\n\n## User prompt\nSPECS:\n{{SPECS}}\nPLAN:\n{{PLAN}}\nAGAIN:\n{{PLAN}}\n';
function lens(f: ReturnType<typeof fixture>, list: string, material: string, max: number, name = 'o') {
  const m = path.join(f.d, `${name}.material`); fs.writeFileSync(m, material);
  const tpl = path.join(f.d, 'tpl.md'); fs.writeFileSync(tpl, TPL);
  const out = path.join(f.d, 'out', name);
  const r = script(CLI, ['lens-input', '--root', f.d, '--table', f.table, '--list', list, '--material', m, '--out', out, '--template', tpl, '--max', String(max)]);
  const files = r.stdout.split('\n').filter(Boolean);
  return { r, files, text: files.map((x) => fs.readFileSync(x, 'utf8')) };
}

describe('lens-input: list first, then the material, never trims', () => {
  it('one file when list plus material fit: the list text comes first, whole, with the material after it', () => {
    const f = fixture();
    const l = lens(f, 'first', 'MATERIAL-BODY', 20000);
    expect(l.r.status, l.r.stderr).toBe(0);
    expect(l.files).toHaveLength(1);
    const t = l.text[0]!;
    expect(t.indexOf('first text')).toBeGreaterThan(-1);
    expect(t.indexOf('first text')).toBeLessThan(t.indexOf('MATERIAL-BODY'));
    expect(t).toContain('## 2. Not a heading (fenced)');
    expect(t).toContain("$' and $&");
    expect(t).not.toContain('second text');
  });
  it('a big list is split by its own headings: every part carries the material, parts together hold every list line, none over the bound', () => {
    const f = fixture();
    const max = 3200; // the list section is about 4000 characters
    const l = lens(f, 'whole', 'MAT', max);
    expect(l.r.status, l.r.stderr).toBe(0);
    expect(l.files.length).toBeGreaterThan(1);
    for (const t of l.text) expect(t).toContain('MAT');
    const all = l.text.join('\n');
    for (const piece of ['first text', 'sub text', 'second text', 'third text']) expect(all).toContain(piece);
    expect(l.files.map((x) => path.basename(x))).toEqual(l.files.map((_, i) => `o-p${i + 1}.txt`));
  });
  it('a split of a long single heading list falls to its deeper headings, and a section that cannot fit is refused naming list and section', () => {
    const f = fixture();
    const bad = lens(f, 'big', 'MAT', 2600);
    expect(bad.r.status).toBe(1);
    expect(bad.r.stderr).toContain('big');
    expect(bad.r.stderr).toContain('7. Rules');
  });
  it('material too large for any part is refused, never trimmed', () => {
    const f = fixture();
    const r = lens(f, 'first', 'M'.repeat(30000), 3000);
    expect(r.r.status).toBe(1);
    expect(r.r.stderr).toMatch(/material/);
  });
  it('reads a CRLF spec: the section is found and cut at the next heading', () => {
    const f = fixture();
    const l = lens(f, 'crlf', 'MAT', 20000);
    expect(l.r.status, l.r.stderr).toBe(0);
    expect(l.text[0]).toContain('one line');
    expect(l.text[0]).not.toContain('two line');
  });
  it('refuses a --max that is not a positive number (the bound must be enforced)', () => {
    const f = fixture();
    const l = lens(f, 'first', 'MAT', Number.NaN);
    expect(l.r.status).toBe(1);
    expect(l.r.stderr).toMatch(/--max/);
  });
  it('removes its own earlier input files with the same prefix before writing', () => {
    const f = fixture();
    lens(f, 'whole', 'MAT', 3200);
    expect(fs.existsSync(path.join(f.d, 'out/o-p2.txt'))).toBe(true);
    const l = lens(f, 'first', 'MAT', 20000);
    expect(l.files.map((x) => path.basename(x))).toEqual(['o.txt']);
    expect(fs.existsSync(path.join(f.d, 'out/o-p2.txt'))).toBe(false);
  });
});

describe('lens-input stamps what it wrote (the close check recomputes it)', () => {
  it('the first line is LIST <id> sha256:<hex of the list part> material sha256:<hex of the material> part i of n', () => {
    const f = fixture();
    const l = lens(f, 'first', 'MAT', 20000);
    expect(l.r.status, l.r.stderr).toBe(0);
    expect(l.text[0]!.split('\n')[0]).toMatch(/^LIST first sha256:[0-9a-f]{64} material sha256:[0-9a-f]{64} part 1 of 1$/);
  });
});

describe('findings: ids are <file stem>#<ordinal among BUG and DEFER lines>', () => {
  it('lists BUG and DEFER lines only, with stable ordinals', () => {
    const d = tmp('fd');
    fs.writeFileSync(path.join(d, 'out-compliance-x.txt'), 'noise\nBUG severity=HIGH — a\nMET — b\n- DEFER severity=LOW — c\nVERDICT: PASS\n');
    fs.writeFileSync(path.join(d, 'notes.txt'), 'BUG severity=HIGH — not a lens output\n');
    const r = script(CLI, ['findings', '--dir', d]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n').filter((l) => l.includes('\t')).map((l) => l.split('\t')[0])).toEqual(['out-compliance-x#1', 'out-compliance-x#2']);
    expect(r.stdout).toMatch(/^Ruled: out-compliance-x\.txt sha256:[0-9a-f]{12} findings:2$/m);
  });
});

// ---- V2.LIST (task-406, McFix V2 step 1): the lists every compliance review receives; the check over every open task; the generated page ----
// Rule: Spec 126 section 0a principle 1 and section 11b.2; 08_agents.md section 7 rules 3 and 4 and section 11.1; PLAN-PROTOCOL.md:3 (docs/specs/00-architecture/plan-protocol.md) simple, no scope creep.
type Table = { every_task?: string[]; milestone_docs?: Record<string, string[]>; increment_docs: Record<string, string>; lists: Record<string, { file: string; sections?: string[]; whole?: boolean }>; rows: { id: string; lists: string[]; globs?: string[] }[]; kinds?: { id: string }[] };
const real = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as Table;
const mod = () => import(path.join(ROOT, 'scripts/analysis/rule-lists.mjs')) as Promise<{ verifyResolved: (t: Table, r: { lists: { id: string }[] }, letter?: string, type?: string) => string[] }>;

describe('V2.LIST: every task gets the five words, the plan protocol and its milestone objectives (data, not a hand-pick)', () => {
  it('the table names every_task = five-words (Spec 132 Glossary) and plan-protocol (the repo copy), and no removed engineering list id is left anywhere', () => {
    const t = real();
    expect(t.every_task).toEqual(['five-words', 'plan-protocol']);
    expect(t.lists['five-words']).toMatchObject({ file: 'docs/specs/01-pipeline/132_step_standard_handbook.md', sections: ['Glossary'] });
    expect(t.lists['plan-protocol']).toMatchObject({ file: 'docs/specs/00-architecture/plan-protocol.md', whole: true });
    const text = JSON.stringify(t);
    for (const gone of ['"eng-s1"', 'eng-s2-s4-s10-s11', 'eng-s3-s9', 'eng-s5-s9-s14', '"eng-s5"']) expect(text, gone).not.toContain(gone);
    expect(t.lists['eng-all']).toMatchObject({ file: 'docs/specs/00_engineering_standards.md', whole: true });
  });
  it('the Glossary block of Spec 132 carries the five words statement, and the repo plan protocol carries the five principles line', () => {
    const r = script(CLI, ['lens-input', '--list', 'five-words', '--material', path.join(ROOT, 'package.json'), '--out', path.join(tmp('fw'), 'in-x')]);
    expect(r.status, r.stderr).toBe(0);
    const text = fs.readFileSync(r.stdout.trim().split('\n')[0] as string, 'utf8');
    expect(text).toContain('STANDARDIZED, OBSERVABLE, SCALABLE, UNDERSTANDABLE, ACCURATE');
    expect(fs.readFileSync(path.join(ROOT, 'docs/specs/00-architecture/plan-protocol.md'), 'utf8')).toContain('standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep');
  });
  it('milestone_docs gives every increment letter its own milestone list (objectives sections), and the table validates', () => {
    const t = real();
    for (const k of Object.keys(t.increment_docs)) {
      const lids = t.milestone_docs?.[k] ?? [];
      expect(lids.length, `letter ${k}`).toBeGreaterThan(0);
      for (const id of lids) expect(t.lists[id]?.file, `${k}: ${id}`).toMatch(/^backlog\/milestones\/m-\d+ - /);
    }
    expect(script(CLI, ['validate']).status).toBe(0);
  });
  it('a real task of each kind resolves with the every_task lists and its milestone list (pipeline, web, phone, storage, tooling, spec-only)', () => {
    const kinds: Record<string, string> = {
      pipeline: 'scripts/steps/_schema/converted.json, scripts/load-permits.js', web: 'src/app/(maxbld)/page.tsx, src/features/x.ts', phone: 'mobile/src/app/x.tsx',
      storage: 'src/lib/parcels/report-compute.ts', tooling: 'scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/board/x.mjs', spec: 'docs/specs/00-architecture/08_agents.md',
    };
    for (const [k, files] of Object.entries(kinds)) {
      const r = script(CLI, ['resolve', '--files', files, '--type', 'build', '--letter', 'S']);
      expect(r.status, `${k}: ${r.stderr}`).toBe(0);
      expect(ids(JSON.parse(r.stdout) as Res), k).toEqual(expect.arrayContaining(['five-words', 'plan-protocol', 'ms-S', 'inc-S']));
    }
  });
  it('the paths that matched no row on 2026-11-20 now resolve (tasks 376, 378, 384, 372, 401, 408 and the paths of the coverage review)', () => {
    for (const p of ['docs/reports/generated/rule-lists-by-kind.md', 'docs/reports/policy/x.md', 'scripts/seeds/logic_variables.json', 'scripts/board/x.mjs', 'scripts/steps/_schema/converted.json', 'scripts/lib/step-x/y.js', 'scripts/ast-grep-rules/x.yml', 'src/features/x.ts', 'tests/x.ts', 'scripts/tests/x.mjs', 'supabase/tests/x.sql', 'CLAUDE.md', 'mcbylaws/protected-paths.json', 'tsconfig.json', 'eslint.config.mjs', 'biome.json', 'knip.json', 'next.config.ts', '.sqlfluff']) {
      const r = script(CLI, ['resolve', '--files', p, '--type', 'build', '--letter', 'S']);
      expect(r.status, `${p}: ${r.stderr}`).toBe(0);
    }
  });
  it('verifyResolved (what validate and check-tasks run): a resolved set that lacks an every_task list or the milestone list is named; the real resolution passes', async () => {
    const { verifyResolved } = await mod();
    const t = real();
    const good = JSON.parse(script(CLI, ['resolve', '--files', 'scripts/analysis/rule-lists.mjs', '--type', 'build', '--letter', 'S']).stdout) as Res;
    expect(verifyResolved(t, good, 'S')).toEqual([]);
    const planted = { lists: good.lists.filter((l) => l.id !== 'five-words' && l.id !== 'ms-S') };
    expect(verifyResolved(t, planted, 'S').join('|')).toMatch(/five-words/);
    expect(verifyResolved(t, planted, 'S').join('|')).toMatch(/ms-S/);
    expect(verifyResolved({ ...t, every_task: [] }, good, 'S').join('|')).toMatch(/every_task/);
  });
});

describe('V2.LIST: validate refuses a table that switches the always-attached lists off', () => {
  const edit = (fn: (t: Record<string, unknown>) => void) => {
    const f = fixture();
    const t = JSON.parse(fs.readFileSync(f.table, 'utf8')) as Record<string, unknown>;
    fn(t);
    fs.writeFileSync(f.table, JSON.stringify(t));
    return script(CLI, ['validate', '--root', f.d, '--table', f.table]);
  };
  it('control: the fixture with every_task and milestone_docs validates', () => {
    const r = edit((t) => { t.every_task = ['queue']; t.milestone_docs = { F: ['queue'] }; });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
  it('no every_task key, an empty one, or one naming an undefined list is refused', () => {
    expect(edit((t) => { t.milestone_docs = { F: ['queue'] }; }).stderr).toMatch(/every_task/);
    expect(edit((t) => { t.every_task = []; t.milestone_docs = { F: ['queue'] }; }).stderr).toMatch(/every_task/);
    expect(edit((t) => { t.every_task = ['nope']; t.milestone_docs = { F: ['queue'] }; }).stderr).toMatch(/every_task.*nope/);
  });
  it('an increment letter with no milestone_docs entry, or an entry naming an undefined list, is refused', () => {
    expect(edit((t) => { t.every_task = ['queue']; }).stderr).toMatch(/milestone_docs.*F/);
    expect(edit((t) => { t.every_task = ['queue']; t.milestone_docs = { F: ['nope'] }; }).stderr).toMatch(/milestone_docs F.*nope/);
  });
  it('resolution attaches every_task and the milestone list to a matched task, and an unmatched path is still refused (never a vacuous resolve)', () => {
    const f = fixture();
    const t = JSON.parse(fs.readFileSync(f.table, 'utf8')) as Record<string, unknown>;
    t.every_task = ['queue']; t.milestone_docs = { F: ['crlf'] };
    fs.writeFileSync(f.table, JSON.stringify(t));
    const ok = JSON.parse(res(f, 'src/two.ts', ['--type', 'build']).stdout) as Res;
    expect(ids(ok)).toEqual(expect.arrayContaining(['queue', 'crlf', 'first', 'inc-F']));
    expect(ids(ok).filter((x) => x === 'queue')).toHaveLength(1);
    const bad = res(f, 'zzz/none.txt', ['--type', 'build']);
    expect(bad.status).toBe(3);
    expect(bad.stderr).toContain('zzz/none.txt');
  });
});

describe('V2.LIST: check-tasks lists every open task as resolving or not yet resolvable, by id, with the reason', () => {
  it('a fixture board: a resolving task, a task with no Files line, a task whose path matches no row (listed first), a finished task (skipped)', () => {
    const f = fixture();
    const t = JSON.parse(fs.readFileSync(f.table, 'utf8')) as Record<string, unknown>;
    t.every_task = ['queue']; t.milestone_docs = { F: ['crlf'] };
    fs.writeFileSync(f.table, JSON.stringify(t));
    const w = (n: string, status: string, body: string) => { const p = path.join(f.d, `backlog/tasks/task-${n} - x.md`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, `---\nid: TASK-${n}\ntitle: x\nstatus: ${status}\ntype: build\nmilestone: m-0\n---\n\n## Description\n\n${body}\n`); };
    w('1', 'WAITS', 'Files: src/two.ts'); w('2', 'WAITS', 'no files here'); w('3', 'WAITS', 'Files: zzz/none.txt'); w('4', 'DONE', 'Files: zzz/none.txt');
    fs.mkdirSync(path.join(f.d, 'backlog/milestones'), { recursive: true });
    fs.writeFileSync(path.join(f.d, 'backlog/milestones/m-0 - a.md'), '---\nid: m-0\ntitle: "A [F]"\n---\n');
    const r = script(CLI, ['check-tasks', '--root', f.d, '--table', f.table]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/open 3: resolve 1, not yet resolvable 2/);
    expect(r.stdout.indexOf('task-3')).toBeGreaterThan(-1);
    expect(r.stdout.indexOf('task-3')).toBeLessThan(r.stdout.indexOf('task-2'));
    expect(r.stdout).toMatch(/task-3[^\n]*matches no row[^\n]*zzz\/none\.txt/);
    expect(r.stdout).toMatch(/task-2[^\n]*no Files line/);
    expect(r.stdout).not.toContain('task-4');
  });
  it('the real board: every open task that resolves carries the every_task lists (exit 0), and the count line is printed', () => {
    const r = script(CLI, ['check-tasks']);
    expect(r.status, r.stdout.slice(-600) + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/open \d+: resolve \d+, not yet resolvable \d+/);
  });
});

describe('V2.LIST: the generated page of what each kind of work receives', () => {
  it('the real page is current (page --check), names each kind with documents, sizes and part counts, and is a registered generated doc (gate J)', () => {
    const c = script(CLI, ['page', '--check']);
    expect(c.status, c.stdout + c.stderr).toBe(0);
    const page = fs.readFileSync(path.join(ROOT, 'docs/reports/generated/rule-lists-by-kind.md'), 'utf8');
    for (const k of ['pipeline step', 'McFrontend web', 'phone', 'storage', 'tooling', 'spec-only']) expect(page, k).toContain(k);
    expect(page).toMatch(/five-words[^\n]*\|\s*[\d,]+\s*\|\s*\d+\s*\|/);
    expect(page).toContain('plan-protocol');
    const g = run('node', ['scripts/analysis/gates/generated-docs.mjs'], { cwd: ROOT });
    expect(g.status, g.stdout + g.stderr).toBe(0);
    expect(fs.readFileSync(path.join(ROOT, 'scripts/analysis/gates/generated-docs.mjs'), 'utf8')).toContain("file: 'rule-lists-by-kind.md'");
  });
  it('fixture: --write makes the page, --check passes, and a shrunken document or a hand edit makes --check fail naming the page', () => {
    const f = fixture();
    const t = JSON.parse(fs.readFileSync(f.table, 'utf8')) as Record<string, unknown>;
    t.every_task = ['queue']; t.milestone_docs = { F: ['crlf'] };
    t.kinds = [{ id: 'k1', label: 'kind one', files: 'src/two.ts', type: 'build', letter: 'F' }];
    fs.writeFileSync(f.table, JSON.stringify(t));
    const w = script(CLI, ['page', '--write', '--root', f.d, '--table', f.table]);
    expect(w.status, w.stderr).toBe(0);
    const page = path.join(f.d, 'docs/reports/generated/rule-lists-by-kind.md');
    expect(fs.readFileSync(page, 'utf8')).toMatch(/kind one[\s\S]*queue/);
    expect(script(CLI, ['page', '--check', '--root', f.d, '--table', f.table]).status).toBe(0);
    fs.appendFileSync(path.join(f.d, 'docs/q.md'), 'one more rule line\n');
    const stale = script(CLI, ['page', '--check', '--root', f.d, '--table', f.table]);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('rule-lists-by-kind.md');
  });
});

// V2.LIST round 2 (task-406): the milestone guard. A build or fix task with no milestone cannot get its objectives and is refused; a missing milestone_docs key or entry counts as missing lists.
describe('V2.LIST round 2: the milestone guard', () => {
  it('resolve refuses a build or fix task with no milestone letter (one line naming the milestone); a record task and the control with a letter resolve', () => {
    const noLetter = script(CLI, ['resolve', '--files', 'scripts/analysis/rule-lists.mjs', '--type', 'build']);
    expect(noLetter.status, noLetter.stdout).toBe(3);
    expect(noLetter.stderr).toMatch(/no milestone/);
    expect(script(CLI, ['resolve', '--files', 'scripts/analysis/rule-lists.mjs', '--type', 'fix']).status).toBe(3);
    expect(script(CLI, ['resolve', '--files', 'scripts/analysis/rule-lists.mjs', '--type', 'build', '--letter', 'S']).status).toBe(0);
    expect(script(CLI, ['resolve', '--files', 'docs/specs/00-architecture/137_mcqueue.md', '--type', 'record']).status).toBe(0);
  });
  it('verifyResolved: a table with no milestone_docs key, or no entry for the letter, names the missing milestone lists; a build task with no letter is named', async () => {
    const { verifyResolved } = await mod();
    const t = real();
    const good = JSON.parse(script(CLI, ['resolve', '--files', 'scripts/analysis/rule-lists.mjs', '--type', 'build', '--letter', 'S']).stdout) as Res;
    expect(verifyResolved(t, good, 'S', 'build')).toEqual([]);
    const noKey = { ...t } as Table;
    delete noKey.milestone_docs;
    expect(verifyResolved(noKey, good, 'S', 'build').join('|')).toMatch(/milestone_docs/);
    expect(verifyResolved({ ...t, milestone_docs: { F: ['ms-F'] } }, good, 'S', 'build').join('|')).toMatch(/milestone_docs.*S/);
    expect(verifyResolved(t, good, undefined, 'build').join('|')).toMatch(/no milestone/);
    expect(verifyResolved(t, good, undefined, 'record')).toEqual([]);
  });
});

// V2.WHOLE (task-410): the review tool splits a change that does not fit one input at FILE boundaries (the tool, never by hand), each chunk against every list part,
// each input stamped "chunk c of m" with its path list; one file alone over the room is refused naming the file and its size. No --list (a non-compliance lens template) writes the same chunks.
const dfile = (p: string, n: number) => `diff --git a/${p} b/${p}\nindex 1111111..2222222 100644\n--- a/${p}\n+++ b/${p}\n@@ -1 +1 @@\n-old\n${'+line of new text\n'.repeat(n)}`;
const FILES = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts'];
const BIGDIFF = FILES.map((p) => dfile(p, 50)).join('');
const stampOf = (t: string) => {
  const m = /^LIST (\S+) sha256:[0-9a-f]{64} material sha256:([0-9a-f]{64}) part (\d+) of (\d+)(?: chunk (\d+) of (\d+))?\n/.exec(t);
  const pm = / paths: (\[.*\])\n/.exec(t.split('\n').slice(0, 3).join('\n') + '\n');
  return { id: m?.[1], matSha: m?.[2], part: Number(m?.[3]), parts: Number(m?.[4]), chunk: m?.[5] === undefined ? undefined : Number(m[5]), chunks: m?.[6] === undefined ? undefined : Number(m[6]), paths: pm ? (JSON.parse(pm[1] as string) as string[]) : undefined };
};
const materialOf = (t: string) => t.slice(t.indexOf('=== MATERIAL UNDER REVIEW (everything below this line) ===\n') + '=== MATERIAL UNDER REVIEW (everything below this line) ===\n'.length).replace(/\n$/, '');
describe('V2.WHOLE: lens-input splits a change that leaves no room for a list part, at file boundaries', () => {
  it('a diff too large for one input becomes chunks: every changed path in exactly one chunk, chunk texts joined are the diff, every input within the bound, each stamped chunk c of m with its paths', () => {
    const f = fixture();
    const max = 12000;
    const l = lens(f, 'first', BIGDIFF, max);
    expect(l.r.status, l.r.stderr).toBe(0);
    const st = l.text.map(stampOf);
    const m = st[0]!.chunks;
    expect(m, 'chunk stamp present').toBeGreaterThan(1);
    expect(l.files.length).toBe((m as number) * st[0]!.parts);
    for (const t of l.text) expect(t.length).toBeLessThanOrEqual(max);
    const seen = st.flatMap((s) => s.paths ?? []);
    expect([...seen].sort()).toEqual([...FILES].sort());
    expect(new Set(seen).size).toBe(seen.length);
    const byChunk = new Map<number, string>();
    l.text.forEach((t, i) => byChunk.set(st[i]!.chunk as number, materialOf(t)));
    expect([...byChunk.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join('')).toBe(BIGDIFF);
    expect(l.files.map((x) => path.basename(x))).toEqual(l.files.map((_, i) => `o-p${i + 1}.txt`));
    for (const t of l.text) expect(t).toContain('first text');
  });
  it('a chunk is never cut inside a file: each chunk text starts at a diff header and holds whole files', () => {
    const f = fixture();
    const l = lens(f, 'first', BIGDIFF, 12000);
    expect(l.r.status, l.r.stderr).toBe(0);
    for (const t of l.text) {
      const mat = materialOf(t);
      expect(mat.startsWith('diff --git ')).toBe(true);
      for (const p of stampOf(t).paths ?? []) expect(mat).toContain(dfile(p, 50).trimEnd());
    }
  });
  it('a list block that cannot be split still gets every chunk: the list part is whole in each input', () => {
    const f = fixture();
    const d = FILES.map((p) => dfile(p, 30)).join('');
    const l = lens(f, 'big', d, 12000);
    expect(l.r.status, l.r.stderr).toBe(0);
    expect(stampOf(l.text[0]!).chunks).toBeGreaterThan(1);
    for (const t of l.text) expect(t).toContain('rule line');
  });
  it('one file alone over the room is refused with a line naming the file and its size', () => {
    const f = fixture();
    const d = dfile('src/a.ts', 5) + dfile('src/huge.ts', 400) + dfile('src/z.ts', 5);
    const l = lens(f, 'first', d, 12000);
    expect(l.r.status).toBe(1);
    expect(l.r.stderr).toContain('src/huge.ts');
    expect(l.r.stderr).toMatch(/src\/huge\.ts[^\n]*\b\d{4,}\b/);
    expect(l.files).toEqual([]);
  });
  it('a material that is not a diff and does not fit is still refused, never trimmed (control)', () => {
    const f = fixture();
    const r = lens(f, 'first', 'plain text '.repeat(3000), 12000);
    expect(r.r.status).toBe(1);
    expect(r.r.stderr).toMatch(/material/);
  });
  it('a diff that fits is one input stamped chunk 1 of 1 with its paths (control: no split)', () => {
    const f = fixture();
    const l = lens(f, 'first', dfile('src/a.ts', 3) + dfile('src/b.ts', 3), 20000);
    expect(l.r.status, l.r.stderr).toBe(0);
    expect(l.files).toHaveLength(1);
    const s = stampOf(l.text[0]!);
    expect([s.chunk, s.chunks, s.paths]).toEqual([1, 1, ['src/a.ts', 'src/b.ts']]);
  });
  it('no --list with a lens template (code-review, error-paths, ux, security) writes the same chunk inputs with an empty list part', () => {
    const f = fixture();
    const m = path.join(f.d, 'nl.material'); fs.writeFileSync(m, BIGDIFF);
    const tpl = path.join(f.d, 'tpl.md'); fs.writeFileSync(tpl, TPL);
    const r = script(CLI, ['lens-input', '--root', f.d, '--table', f.table, '--material', m, '--out', path.join(f.d, 'out/nl'), '--template', tpl, '--max', '9000']);
    expect(r.status, r.stderr).toBe(0);
    const files = r.stdout.split('\n').filter(Boolean);
    const st = files.map((x) => stampOf(fs.readFileSync(x, 'utf8')));
    expect(st[0]!.id).toBe('none');
    expect(st[0]!.chunks).toBeGreaterThan(1);
    expect(files.length).toBe(st[0]!.chunks);
    expect([...st.flatMap((s) => s.paths ?? [])].sort()).toEqual([...FILES].sort());
  });
});

// V2.WHOLE fix round (grounder 2026-11-20): F2 the diff flags, F5 a measured chunk room, F6 the refusal for a name git quotes.
describe('V2.WHOLE fix round: DIFF_ARGS, chunk room and the unreadable name', () => {
  it('F2: the shared diff flags include --text and --full-index (a .gitattributes -diff line cannot turn code into "Binary files differ")', async () => {
    const m = (await import(path.join(ROOT, 'scripts/analysis/rule-lists.mjs'))) as { DIFF_ARGS: string[] };
    expect(m.DIFF_ARGS).toContain('--text');
    expect(m.DIFF_ARGS).toContain('--full-index');
  });
  it('F5: a long path list in the chunk head is counted in the room: 300 files with no --list, every input inside the bound (the fixed 800 reserve refused this)', () => {
    const f = fixture();
    const names = Array.from({ length: 300 }, (_, i) => `src/some/deeper/folder/file-number-${String(i).padStart(3, '0')}-with-a-long-name.ts`);
    const d = names.map((p) => dfile(p, 1)).join('');
    const m = path.join(f.d, 'f5.material'); fs.writeFileSync(m, d);
    const tpl = path.join(f.d, 'tpl.md'); fs.writeFileSync(tpl, TPL);
    const r = script(CLI, ['lens-input', '--root', f.d, '--table', f.table, '--material', m, '--out', path.join(f.d, 'out/f5'), '--template', tpl, '--max', '40000']);
    expect(r.status, r.stderr).toBe(0);
    const files = r.stdout.split('\n').filter(Boolean);
    const texts = files.map((x) => fs.readFileSync(x, 'utf8'));
    for (const t of texts) expect(2 * t.length + 80).toBeLessThanOrEqual(40000); // TPL puts the input twice
    expect([...texts.flatMap((t) => stampOf(t).paths ?? [])].sort()).toEqual([...names].sort());
  });
  it('F6: a name git quotes is refused with the header line and the remedy (core.quotepath, the brief command)', () => {
    const f = fixture();
    const d = 'diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"\nindex 1..2 100644\n--- "a/caf\\303\\251.ts"\n+++ "b/caf\\303\\251.ts"\n@@ -1 +1 @@\n-a\n+b\n';
    const l = lens(f, 'first', d, 20000);
    expect(l.r.status).toBe(1);
    expect(l.r.stderr).toContain('caf\\303\\251.ts');
    expect(l.r.stderr).toContain('core.quotepath=false');
  });
  it('F13: a diff that passes the room estimate but whose rendered head (141 long paths) pushes the final prompt over the bound is chunked, not refused', () => {
    const f = fixture();
    const names = Array.from({ length: 141 }, (_, i) => `src/some/deeper/folder/file-number-${String(i).padStart(3, '0')}-with-a-long-name.ts`);
    const d = names.map((p) => dfile(p, 1)).join('');
    const m = path.join(f.d, 'f13.material'); fs.writeFileSync(m, d);
    const tpl = path.join(f.d, 'tpl.md'); fs.writeFileSync(tpl, TPL);
    const max = 2 * (d.length + 900) + 300;
    const r = script(CLI, ['lens-input', '--root', f.d, '--table', f.table, '--material', m, '--out', path.join(f.d, 'out/f13'), '--template', tpl, '--max', String(max)]);
    expect(r.status, r.stderr).toBe(0);
    const texts = r.stdout.split('\n').filter(Boolean).map((x) => fs.readFileSync(x, 'utf8'));
    expect(texts.length).toBeGreaterThan(1);
    for (const x of texts) expect(2 * x.length + 80).toBeLessThanOrEqual(max);
    expect([...texts.flatMap((x) => stampOf(x).paths ?? [])].sort()).toEqual([...names].sort());
  });
});

// V2.WHOLE round 3, operator item 3 ("1-5 y"): the real table (task-406's fold) exempts a real golden from the review material and nothing that is not one.
describe('V2.WHOLE: the real table exempts golden snapshots by their file shape only', () => {
  it('a real golden is exempt; a code file in the golden folder, a stray runner and a nested golden are not', async () => {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as { exempt: string[] };
    const { matchesAny } = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws/paths.mjs'))) as { matchesAny: (g: string[], p: string) => boolean };
    const real = run('git', ['ls-files', 'src/tests/fixtures/surfaces/*/*.mobile.json'], { cwd: ROOT }).stdout.split('\n').filter(Boolean)[0] as string;
    expect(real).toBeTruthy();
    expect(matchesAny(t.exempt, real), real).toBe(true);
    for (const p of ['src/tests/fixtures/surfaces/x/evil.ts', 'src/tests/fixtures/report-page/run.mjs', 'src/tests/fixtures/surfaces/x/y/a.mobile.json', 'src/lib/a.ts']) expect(matchesAny(t.exempt, p), p).toBe(false);
  });
  it('H9 round 6: the diff flags also pin the algorithm, the indent heuristic and the inter-hunk context (the three config keys that change the text of a diff)', async () => {
    const m = (await import(path.join(ROOT, 'scripts/analysis/rule-lists.mjs'))) as { DIFF_ARGS: string[] };
    for (const a of ['--diff-algorithm=myers', '--indent-heuristic', '--inter-hunk-context=0']) expect(m.DIFF_ARGS, a).toContain(a);
  });
});
