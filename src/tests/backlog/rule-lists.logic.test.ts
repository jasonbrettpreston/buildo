// SPEC LINK: task-366 (COMPLY.2); Spec 08 section 7 rule 4 and section 5.3 (08_agents.md); 00_engineering_standards.md section 14 (findings to protocols to gates).
// scripts/analysis/rule-lists.mjs + scripts/analysis/rule-lists.json: the path to rule-list table is DATA. Run as a CLI (validate, resolve, lens-input, findings).
// Real table: every list file exists, every section selector names exactly one heading, every row glob matches a tracked path. Fixture trees: resolution by Files line, exempt,
// import row, record-only default, lens input (one file when small, split by the list's own headings when big, never trims, refuses what cannot fit).
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
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
    expect(ids(res)).not.toContain('storage-doc16'); // task-448 (RR-0421 item 3 a)
  });
  // task-431 D2 (survive-the-fix): the phone row sends eng-front + eng-shared and the tests row eng-all; the de-dup line keeps the whole list only (planted defect: the line removed gives eng-all, eng-front and eng-shared)
  it('task-431 D2: a phone file plus a test file get exactly eng-all among the lists on the engineering standards file (whole wins)', () => {
    const r = script(CLI, ['resolve', '--files', 'mobile/x.ts, src/tests/x.test.ts', '--type', 'build', '--letter', 'S']);
    expect(r.status, r.stderr).toBe(0);
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/rule-lists.json'), 'utf8')) as { lists: Record<string, { file: string }> };
    const engFile = t.lists['eng-all']!.file;
    expect((JSON.parse(r.stdout) as Res).lists.filter((l) => l.file === engFile).map((l) => l.id)).toEqual(['eng-all']);
  });
  it('a src file that imports from scripts/lib/compute gets the step handbook list and no Airtight list (import row; task-448, RR-0421 item 3 a)', () => {
    const r = script(CLI, ['resolve', '--files', 'src/lib/parcels/report-compute.ts', '--type', 'build', '--letter', 'S']);
    const res = JSON.parse(r.stdout) as Res;
    expect(ids(res)).toContain('step-132');
    for (const l of ['airtight-124a', 'airtight-v3-122', 'airtight-v2-122', 'airtight-122a']) expect(ids(res)).not.toContain(l);
  });
  it('ATTACK 12: the real paths that matched no row now resolve (components, app pages, middleware, package.json, CI), and a surfaces importer no longer gets Specs 126 and 128 (task-448, RR-0421 item 1 a)', () => {
    for (const p of ['src/components/report/X.tsx', 'src/app/(maxbld)/page.tsx', 'src/middleware.ts', 'package.json', '.github/workflows/test.yml']) {
      const r = script(CLI, ['resolve', '--files', p, '--type', 'build', '--letter', 'S']);
      expect(r.status, `${p}: ${r.stderr}`).toBe(0);
    }
    const imp = JSON.parse(script(CLI, ['resolve', '--files', 'src/lib/parcels/lot-size-entry.ts', '--type', 'build', '--letter', 'S']).stdout) as Res;
    for (const l of ['surface-126', 'surface-128']) expect(ids(imp)).not.toContain(l);
    console.log(`ATTACK 12: RESOLVES: src/components, src/app, src/middleware.ts, package.json, .github ; importer lists ${ids(imp).join(',')}`);
  });
  it('task-376: a task that edits spec files resolves; a mobile or web-admin spec also gets that surface\'s own lists', () => {
    const lists = (files: string) => { const r = script(CLI, ['resolve', '--files', files, '--type', 'build', '--letter', '1']); expect(r.status, r.stderr).toBe(0); return ids(JSON.parse(r.stdout) as Res); };
    const mobile = lists('docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json');
    for (const l of ['eng-all', 'mobile-90', 'mobile-98', 'mobile-99', 'surface-136']) expect(mobile).toContain(l);
    for (const l of ['agents-s7-s11', 'queue-137', 'mobile-100', 'mobile-96']) expect(mobile).not.toContain(l);
    const web = lists('docs/specs/02-web-admin/128_surface_standard_policy.md');
    for (const l of ['eng-all', 'surface-136']) expect(web).toContain(l);
    for (const l of ['agents-s7-s11', 'queue-137', 'surface-128', 'surface-135']) expect(web).not.toContain(l);
    const pipe = lists('docs/specs/01-pipeline/132_step_standard_handbook.md');
    expect(pipe).toEqual(['eng-all', 'plan-protocol', 'inc-1', 'ms-1']);
    expect(pipe).not.toContain('mobile-100');
    expect(lists('backlog/docs/doc-16 - McStorage-policy-v2.md')).not.toContain('queue-137');
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
  // task-431 D1 (RR-0385 item 7, RR-0380 Q1; the de-dup line in resolveTask): src/one.ts resolves `first` (sections of docs/a.md) and `whole` (docs/a.md whole); the whole list is kept and the sections list dropped
  it('src/two.ts gets only the src row; src/one.ts (imports compute) also gets the import row, and its whole list of docs/a.md drops the sections list of the same file (task-431 de-dup); the increment doc is always added', () => {
    const f = fixture();
    const a = JSON.parse(res(f, 'src/two.ts', ['--type', 'build']).stdout) as Res;
    expect(ids(a).sort()).toEqual(['first', 'inc-F']);
    const b = JSON.parse(res(f, 'src/one.ts', ['--type', 'build']).stdout) as Res;
    expect(ids(b)).not.toContain('first');
    expect(ids(b).sort()).toEqual(['inc-F', 'whole']);
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
    // task-431: the glob resolves src/one.ts, whose import row gives whole, and the de-dup drops first; whole also proves the glob was expanded through tracked files
    expect(ids(JSON.parse(res(f, 'src/*.ts', ['--type', 'build']).stdout) as Res)).toContain('whole');
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

const CTX = (d: string, desc = 'the description', extra = '') => {
  const p = path.join(d, 'context-r1.md');
  fs.writeFileSync(p, `# Review context\n\n## Task\ntask-1 t\n\n## Description\n${desc}\n\n## Acceptance criteria\n- #1 a\n\n## Implementation Plan\nTHE-PLAN\n\n## Implementation Notes\n(none)\n\n## Decisions naming this task\n- (none)\n${extra}`);
  return p;
};
const TPL = '## System persona\nsys\n\n## User prompt\nSPECS:\n{{SPECS}}\nPLAN:\n{{PLAN}}\nAGAIN:\n{{PLAN}}\n';
function lens(f: ReturnType<typeof fixture>, list: string, material: string, max: number, name = 'o') {
  const m = path.join(f.d, `${name}.material`); fs.writeFileSync(m, material);
  const tpl = path.join(f.d, 'tpl.md'); fs.writeFileSync(tpl, TPL);
  const out = path.join(f.d, 'out', name);
  const r = script(CLI, ['lens-input', '--root', f.d, '--table', f.table, '--list', list, '--material', m, '--out', out, '--template', tpl, '--max', String(max), '--context', CTX(f.d)]);
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
  it('the table names every_task = plan-protocol (the repo copy; five-words, the Spec 132 Glossary, is defined but off since task-453, RR-0452), and no removed engineering list id is left anywhere', () => {
    const t = real();
    expect(t.every_task).toEqual(['plan-protocol']);
    expect(t.lists['five-words']).toMatchObject({ file: 'docs/specs/01-pipeline/132_step_standard_handbook.md', sections: ['Glossary'] });
    expect(t.lists['plan-protocol']).toMatchObject({ file: 'docs/specs/00-architecture/plan-protocol.md', whole: true });
    const text = JSON.stringify(t);
    for (const gone of ['"eng-s1"', 'eng-s2-s4-s10-s11', 'eng-s3-s9', 'eng-s5-s9-s14', '"eng-s5"']) expect(text, gone).not.toContain(gone);
    expect(t.lists['eng-all']).toMatchObject({ file: 'docs/specs/00_engineering_standards.md', whole: true });
  });
  it('the Glossary block of Spec 132 carries the five words statement, and the repo plan protocol carries the five principles line', () => {
    const r = script(CLI, ['lens-input', '--context', path.join(ROOT, 'docs/reports/reviews/task-375/fixture-context.md'), '--list', 'five-words', '--material', path.join(ROOT, 'package.json'), '--out', path.join(tmp('fw'), 'in-x')]);
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
      expect(ids(JSON.parse(r.stdout) as Res), k).toEqual(expect.arrayContaining(['plan-protocol', 'ms-S', 'inc-S']));
      expect(ids(JSON.parse(r.stdout) as Res), k).not.toContain('five-words');
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
    const planted = { lists: good.lists.filter((l) => l.id !== 'plan-protocol' && l.id !== 'ms-S') };
    expect(verifyResolved(t, planted, 'S').join('|')).toMatch(/plan-protocol/);
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
    expect(page).toMatch(/plan-protocol[^\n]*\|\s*[\d,]+\s*\|\s*\d+\s*\|/);
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
    const r = script(CLI, ['lens-input', '--context', path.join(ROOT, 'docs/reports/reviews/task-375/fixture-context.md'), '--root', f.d, '--table', f.table, '--material', m, '--out', path.join(f.d, 'out/nl'), '--template', tpl, '--max', '9000']);
    expect(r.status, r.stderr).toBe(0);
    const files = r.stdout.split('\n').filter(Boolean);
    const st = files.map((x) => stampOf(fs.readFileSync(x, 'utf8')));
    expect(st[0]!.id).toBe('none');
    expect(st[0]!.chunks).toBeGreaterThan(1);
    expect(files.length).toBe(st[0]!.chunks);
    expect([...st.flatMap((s) => s.paths ?? [])].sort()).toEqual([...FILES].sort());
  });
});

// task-419 (gap 2): the close check reads an unsuffixed out-<lens>.txt as a review of the raw diff and only -pN outputs as tool-made inputs, so the tool names a no-list input -pN always.
describe('task-419: a no-list lens input is always named -pN; a rule-list input keeps its unsuffixed name for one file', () => {
  const noList = (f: ReturnType<typeof fixture>, material: string, out: string, max = '20000') => {
    const m = path.join(f.d, 'nl1.material'); fs.writeFileSync(m, material);
    const tpl = path.join(f.d, 'tpl.md'); fs.writeFileSync(tpl, TPL);
    const outDir = path.join(f.d, 'out1'); fs.mkdirSync(outDir, { recursive: true });
    const r = script(CLI, ['lens-input', '--context', path.join(ROOT, 'docs/reports/reviews/task-375/fixture-context.md'), '--root', f.d, '--table', f.table, '--material', m, '--out', path.join(outDir, out), '--template', tpl, '--max', max]);
    return { r, outDir, listed: r.stdout.split('\n').filter(Boolean), written: fs.readdirSync(outDir).sort() };
  };
  it('(c) no --list, a one-file diff that fits: the printed path and the only file written end in -p1.txt, stamped chunk 1 of 1', () => {
    const f = fixture();
    const n = noList(f, dfile('src/a.ts', 3), 'in-out-code-review');
    expect(n.r.status, n.r.stderr).toBe(0);
    expect(n.listed.map((x) => path.basename(x))).toEqual(['in-out-code-review-p1.txt']);
    expect(n.written).toEqual(['in-out-code-review-p1.txt']);
    const s = stampOf(fs.readFileSync(n.listed[0]!, 'utf8'));
    expect([s.id, s.chunk, s.chunks, s.paths]).toEqual(['none', 1, 1, ['src/a.ts']]);
  });
  it('a round file made with no list is -rN-p1: --out in-out-code-review-r2 writes in-out-code-review-r2-p1.txt', () => {
    const f = fixture();
    const n = noList(f, dfile('src/a.ts', 3), 'in-out-code-review-r2');
    expect(n.r.status, n.r.stderr).toBe(0);
    expect(n.written).toEqual(['in-out-code-review-r2-p1.txt']);
  });
  it('control: with --list and one chunk the name stays unsuffixed', () => {
    const f = fixture();
    const l = lens(f, 'first', dfile('src/a.ts', 3), 20000, 'keep');
    expect(l.r.status, l.r.stderr).toBe(0);
    expect(l.files.map((x) => path.basename(x))).toEqual(['keep.txt']);
  });
  it('control: no --list and several chunks keeps -p1..-pN, unchanged', () => {
    const f = fixture();
    const n = noList(f, BIGDIFF, 'in-out-code-review', '9000');
    expect(n.r.status, n.r.stderr).toBe(0);
    expect(n.listed.length).toBeGreaterThan(1);
    expect(n.listed.map((x) => path.basename(x))).toEqual(n.listed.map((_, i) => `in-out-code-review-p${i + 1}.txt`));
    expect(n.written).toEqual(n.listed.map((x) => path.basename(x)).sort());
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
    const r = script(CLI, ['lens-input', '--context', path.join(ROOT, 'docs/reports/reviews/task-375/fixture-context.md'), '--root', f.d, '--table', f.table, '--material', m, '--out', path.join(f.d, 'out/f5'), '--template', tpl, '--max', '40000']);
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
    const r = script(CLI, ['lens-input', '--context', path.join(ROOT, 'docs/reports/reviews/task-375/fixture-context.md'), '--root', f.d, '--table', f.table, '--material', m, '--out', path.join(f.d, 'out/f13'), '--template', tpl, '--max', String(max)]);
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

describe('D11b (task-375): the security lens fires for admin and PII paths, as README.md:104 and lens-security.md:48 say', () => {
  const lens = async (files: string) => {
    const m = await import('../../../scripts/analysis/rule-lists.mjs');
    return m.lensSet({ type: 'build', files }) as { plan: string[]; out: string[] };
  };
  it('an admin path and a PII path add the security lens on both phases', async () => {
    for (const f of ['src/app/admin/page.tsx', 'src/lib/pii/redact.ts', 'src/lib/admin-users.ts', 'scripts/pii-scrub.mjs']) {
      const r = await lens(f);
      expect(r.plan, f).toContain('security');
      expect(r.out, f).toContain('security');
    }
  });
  it('control: a path naming none of these adds no security lens', async () => {
    const r = await lens('scripts/analysis/proof-slice.mjs');
    expect(r.plan).not.toContain('security');
    expect(r.out).not.toContain('security');
  });
  it('control: the existing words still fire it', async () => {
    expect((await lens('src/lib/stripe/webhook.ts')).out).toContain('security');
  });
});

// task-445 (FINAL.8, RR-0391): the security lens also runs when a Files entry is under src/app/api/ or src/lib/ (the api-lib row of rule-lists.json); the six words stay (D11b above is their survive-the-fix lock).
describe('task-445: the security lens runs on an API route or library path (lensSet)', () => {
  const lens = async (type: string, files: string) => {
    const m = await import('../../../scripts/analysis/rule-lists.mjs');
    return m.lensSet({ type, files }) as { plan: string[]; out: string[] };
  };
  it('S1(a): a src/lib path adds security on both phases, for build and fix (exact sets)', async () => {
    for (const type of ['build', 'fix']) for (const f of ['src/lib/massing/geometry.ts', './src/lib/x.ts', 'src/lib/**', 'src/a.ts, src/lib/b.ts']) {
      const r = await lens(type, f);
      expect(r.plan, `${type} ${f}`).toEqual(['plan-review-deepseek', 'error-paths', 'security']);
      expect(r.out, `${type} ${f}`).toEqual(['code-review', 'error-paths', 'security']);
    }
  });
  it('S1(b): an API route adds security on both phases, for build and fix (toContain: the route also gets ux today, not pinned here)', async () => {
    for (const type of ['build', 'fix']) for (const f of ['src/app/api/parcels/search/route.ts', 'src/app/api/']) {
      const r = await lens(type, f);
      expect(r.plan, `${type} ${f}`).toContain('security');
      expect(r.out, `${type} ${f}`).toContain('security');
    }
  });
  it('S3 controls (green before and after; each proven by a planted defect): no security for front-end, near-miss and other paths', async () => {
    for (const f of ['src/components/report/ReportView.tsx', 'mobile/src/lib/analytics.ts', 'mobile/app/(app)/x.tsx', 'src/library.ts', 'src/app/apiary/x.ts', 'scripts/analysis/x.mjs', 'docs/specs/03-mobile/x.md', 'src/tests/x.test.ts']) {
      const r = await lens('build', f);
      expect(r.plan, f).not.toContain('security');
      expect(r.out, f).not.toContain('security');
    }
  });
  it('S4 (survive-the-fix, green both ways): the type gate is unchanged; on an API route a record task and an empty type get no lens beyond the plan review', async () => {
    for (const type of ['record', '']) {
      const r = await lens(type, 'src/app/api/parcels/search/route.ts');
      expect(r.plan, `type '${type}'`).toEqual(['plan-review-deepseek']);
      expect(r.out, `type '${type}'`).toEqual([]);
    }
  });
});

describe('task-375 A4: lens-input takes the reviewer context, counts it in the room and can cut the plan material from it', () => {
  const base = (f: ReturnType<typeof fixture>, extra: string[]) => {
    const tpl = path.join(f.d, 'tpl.md'); fs.writeFileSync(tpl, TPL);
    const m = path.join(f.d, 'mat.txt'); fs.writeFileSync(m, 'MAT');
    return script(CLI, ['lens-input', '--root', f.d, '--table', f.table, '--list', 'first', '--out', path.join(f.d, 'out/ctx'), '--template', tpl, ...extra, ...(extra.includes('--material-from') ? [] : ['--material', m])]);
  };
  it('refuses without --context (exit 2, says so) and control: with it exits 0', () => {
    const f = fixture();
    const no = base(f, []);
    expect(no.status, no.stderr).toBe(2);
    expect(no.stderr).toMatch(/--context/);
    const yes = base(f, ['--context', CTX(f.d)]);
    expect(yes.status, yes.stderr).toBe(0);
  });
  it('a context without a required heading is refused naming the heading', () => {
    const f = fixture();
    const p = path.join(f.d, 'bad.md'); fs.writeFileSync(p, '# x\n\n## Task\nt\n');
    const r = base(f, ['--context', p]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Description/);
  });
  it('the selected sections are counted in the room: no input plus its context passes --max; a context too big for the room is refused', () => {
    const f = fixture();
    const run1 = (ctx: string) => { const tpl = path.join(f.d, 'tpl.md'); fs.writeFileSync(tpl, TPL); const m = path.join(f.d, 'mat.txt'); fs.writeFileSync(m, 'MAT'); return script(CLI, ['lens-input', '--root', f.d, '--table', f.table, '--list', 'whole', '--material', m, '--out', path.join(f.d, 'out/room'), '--template', tpl, '--max', '4000', '--context', ctx]); };
    const small = run1(CTX(f.d));
    expect(small.status, small.stderr).toBe(0);
    const midCtx = CTX(f.d, 'D'.repeat(400));
    const mid = run1(midCtx);
    expect(mid.status, mid.stderr).toBe(0);
    const rt = createRequire(import.meta.url)(path.join(ROOT, 'scripts/lib/review-template.js'));
    const sel = rt.extractSections(fs.readFileSync(midCtx, 'utf8'), rt.CONTEXT_SECTIONS);
    const files = mid.stdout.split('\n').filter(Boolean);
    expect(files.length).toBeGreaterThanOrEqual(small.stdout.split('\n').filter(Boolean).length);
    for (const x of files) expect(('sys' + rt.substitutePlaceholders('SPECS:\n{{SPECS}}\nPLAN:\n{{PLAN}}\nAGAIN:\n{{PLAN}}\n', { plan: fs.readFileSync(x, 'utf8'), specs: sel })).length).toBeLessThanOrEqual(4000);
    const huge = run1(CTX(f.d, 'D'.repeat(3900)));
    expect(huge.status).toBe(1);
  });
  it('--material-from cuts the plan sections (Description, Acceptance criteria, Implementation Plan) and uses the same file as the context', () => {
    const f = fixture();
    const c = CTX(f.d);
    const r = base(f, ['--material-from', c]);
    expect(r.status, r.stderr).toBe(0);
    const t = fs.readFileSync(r.stdout.split('\n').filter(Boolean)[0]!, 'utf8');
    expect(t).toContain('THE-PLAN');
    expect(t).toContain('## Acceptance criteria');
    expect(t).not.toContain('## Implementation Notes');
  });
  it('--material-from a file without an Implementation Plan heading is refused', () => {
    const f = fixture();
    const p = path.join(f.d, 'noplan.md'); fs.writeFileSync(p, '# x\n\n## Task\nt\n\n## Description\nd\n\n## Acceptance criteria\na\n\n## Decisions naming this task\n-\n\n## Implementation Notes\nn\n');
    const r = base(f, ['--material-from', p]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Implementation Plan/);
  });
});

describe('task-375 A6: a block with no deeper heading is cut between table rows or paragraphs', () => {
  const tableDoc = (n: number) => '# T\n\n## 5. Register\n\n| id | rule |\n| --- | --- |\n' + Array.from({ length: n }, (_, i) => `| R${i} | rule text number ${i} that is long enough to count ${'x'.repeat(40)} |`).join('\n') + '\n\n## 6. Next\n\nafter\n';
  const mk = (doc: string) => {
    const f = fixture();
    fs.writeFileSync(path.join(f.d, 'docs/t.md'), doc);
    const t = JSON.parse(fs.readFileSync(f.table, 'utf8'));
    t.lists.tab = { file: 'docs/t.md', sections: ['5. Register'], generated_by: 'hand-written' };
    fs.writeFileSync(f.table, JSON.stringify(t));
    return f;
  };
  it('a table too big for one file is split at rows, every row appears once across the parts, none over the bound', () => {
    const f = mk(tableDoc(60));
    const l = lens(f, 'tab', 'MAT', 4000);
    expect(l.r.status, l.r.stderr).toBe(0);
    expect(l.files.length).toBeGreaterThan(1);
    const all = l.text.join('\n');
    for (let i = 0; i < 60; i++) expect(all.split(`| R${i} |`).length - 1, 'R' + i).toBe(1);
  });
  it('control: the same table that fits is one file', () => {
    const f = mk(tableDoc(5));
    const l = lens(f, 'tab', 'MAT', 20000);
    expect(l.files).toHaveLength(1);
  });
  it('a single row that alone passes the room is refused naming the list and section (the old throw)', () => {
    const f = mk('# T\n\n## 5. Register\n\n| id | rule |\n| --- | --- |\n| R0 | ' + 'y'.repeat(5000) + ' |\n');
    const l = lens(f, 'tab', 'MAT', 4000);
    expect(l.r.status).toBe(1);
    expect(l.r.stderr).toContain('5. Register');
  });
});

describe('task-375 B1: compliance references (compliance:<list id> <file>) on each task, and check-tasks prints the commands for the open ones', () => {
  const board = () => {
    const f = fixture();
    const t = JSON.parse(fs.readFileSync(f.table, 'utf8')) as Record<string, unknown>;
    t.every_task = ['queue']; t.milestone_docs = { F: ['crlf'] };
    fs.writeFileSync(f.table, JSON.stringify(t));
    fs.mkdirSync(path.join(f.d, 'backlog/milestones'), { recursive: true });
    fs.writeFileSync(path.join(f.d, 'backlog/milestones/m-0 - a.md'), '---\nid: m-0\ntitle: "A [F]"\n---\n');
    const w = (n: string, refs: string[], body: string, status = 'WAITS') => { const p = path.join(f.d, `backlog/tasks/task-${n} - x.md`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, `---\nid: TASK-${n}\ntitle: x\nstatus: ${status}\ntype: build\nmilestone: m-0\n${refs.length ? `references:\n${refs.map((r) => `  - '${r}'`).join('\n')}\n` : ''}---\n\n## Description\n\n${body}\n`); };
    return { f, w };
  };
  const resolved = (f: ReturnType<typeof fixture>, files: string) => (JSON.parse(script(CLI, ['resolve', '--root', f.d, '--table', f.table, '--files', files, '--type', 'build', '--letter', 'F']).stdout) as Res).lists;
  it('a stale open task: prints the exact add-ref command, one entry per resolved list, each starting compliance:, exit 0', () => {
    const { f, w } = board();
    w('1', ['docs/a.md'], 'Files: src/two.ts');
    const want = resolved(f, 'src/two.ts');
    const r = script(CLI, ['check-tasks', '--root', f.d, '--table', f.table]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const line = r.stdout.split('\n').find((l) => l.includes('backlog task edit task-1 ')) ?? '';
    expect(line).toBeTruthy();
    const entries = [...line.matchAll(/--add-ref '(compliance:[^']*)'/g)].map((m) => m[1]!);
    expect(entries).toHaveLength(want.length);
    for (const l of want) expect(entries).toContain(`compliance:${l.id} ${l.file}`);
    expect(line).not.toContain('--remove-ref');
  });
  it('control: a task whose entries match its lists prints no command, a task with part of them prints only the rest, a stale entry gets --remove-ref', () => {
    const { f, w } = board();
    const want = resolved(f, 'src/two.ts');
    w('2', want.map((l) => `compliance:${l.id} ${l.file}`), 'Files: src/two.ts');
    w('3', [`compliance:${want[0]!.id} ${want[0]!.file}`], 'Files: src/two.ts');
    w('4', [...want.map((l) => `compliance:${l.id} ${l.file}`), 'compliance:gone docs/gone.md'], 'Files: src/two.ts');
    const r = script(CLI, ['check-tasks', '--root', f.d, '--table', f.table]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toContain('backlog task edit task-2 ');
    const l3 = r.stdout.split('\n').find((l) => l.includes('backlog task edit task-3 ')) ?? '';
    expect([...l3.matchAll(/--add-ref '(compliance:[^']*)'/g)]).toHaveLength(want.length - 1);
    expect(l3).not.toContain(`'compliance:${want[0]!.id} `);
    const l4 = r.stdout.split('\n').find((l) => l.includes('backlog task edit task-4 ')) ?? '';
    expect(l4).toContain("--remove-ref 'compliance:gone docs/gone.md'");
    expect(l4).not.toContain('--add-ref');
  });
  it('complianceRefs: an entry for a file path with a comma is the id alone (backlog splits --add-ref at commas); entries compare by the id token', async () => {
    const m = await import('../../../scripts/analysis/rule-lists.mjs');
    const r = m.complianceRefs([{ id: 'ms-9', file: 'docs/a, b.md' }, { id: 'eng-all', file: 'docs/e.md' }, { id: 'five', file: 'docs/f.md' }], ['compliance:eng-all some other path', 'docs/a.md']);
    expect(r.add).toEqual(['compliance:ms-9', 'compliance:five docs/f.md']);
    expect(r.remove).toEqual([]);
  });
});

describe('task-375 (suite fix): the repo a read names is the one its root names, never the ambient GIT_* of a hook', () => {
  it('trackedFiles(root) answers from root even when GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE name another repository (a commit hook exports them)', async () => {
    const m = await import('../../../scripts/analysis/rule-lists.mjs');
    const f = fixture();
    const real = run('git', ['rev-parse', '--absolute-git-dir'], { cwd: ROOT }).stdout.trim();
    const saved = { d: process.env.GIT_DIR, i: process.env.GIT_INDEX_FILE, w: process.env.GIT_WORK_TREE };
    try {
      process.env.GIT_DIR = real; process.env.GIT_INDEX_FILE = path.join(real, 'index'); process.env.GIT_WORK_TREE = ROOT;
      const got = m.trackedFiles(f.d) as string[];
      expect(got).toContain('docs/a.md');
      expect(got).not.toContain('package.json');
    } finally {
      for (const [k, v] of [['GIT_DIR', saved.d], ['GIT_INDEX_FILE', saved.i], ['GIT_WORK_TREE', saved.w]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
  it('control: with no GIT_* set, a directory that is not a repository is refused (git ls-files failed), not answered from another repo', async () => {
    const m = await import('../../../scripts/analysis/rule-lists.mjs');
    expect(() => m.trackedFiles(tmp('norepo'))).toThrow(/git ls-files failed/);
  });
});

// ---- task-423 (PROTOCOL.SIMPLE, card A, adjustment 1): the resolved lists joined whole into one virtual list, packed by size ----
// Rule: 08_agents.md section 7 rule 4 and section 5.3 (the compliance lens reviews the whole lists, never trimmed); PLAN-PROTOCOL.md:3 simple, no scope creep.
type JM = { joinLists: (t: unknown, ids: string[]) => { lists: Record<string, { members?: { id: string }[]; file: string; whole?: boolean }> }; parseLensInput: (t: string) => { listPart: string; id: string } | null; wholeListText: (l: unknown, root: string, id: string) => string; readTable: () => { lists: Record<string, unknown> } };
const jmod = () => import(path.join(ROOT, 'scripts/analysis/rule-lists.mjs')) as Promise<JM>;
const filesLineOf = (n: number) => /^Files: (.*)$/m.exec(fs.readFileSync(path.join(ROOT, 'backlog/tasks', fs.readdirSync(path.join(ROOT, 'backlog/tasks')).find((f) => f.startsWith(`task-${n} -`)) as string), 'utf8'))?.[1] as string;
const FILES_423 = 'scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, scripts/analysis/backlog-brief.mjs, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/backlog-brief.logic.test.ts';
const resolvedIds = (files: string) => { const r = script(CLI, ['resolve', '--files', files, '--type', 'build', '--letter', 'S']); expect(r.status, r.stderr).toBe(0); return ids(JSON.parse(r.stdout) as Res); };
// a reviewer context of the size the plan stage carries (rulings context about 4,620 characters)
const BIGCTX = (d: string) => CTX(d, 'the description', `\n## Pad\n${'x'.repeat(4400)}\n`);
const joinedCount = (listIds: string[], material: number, max?: number) => {
  const d = tmp('join');
  const m = path.join(d, 'mat.txt'); fs.writeFileSync(m, 'm'.repeat(material));
  const r = script(CLI, ['lens-input', '--list', 'rules', '--lists', listIds.join(','), '--material', m, '--context', BIGCTX(d), '--out', path.join(d, 'in-x-compliance-rules'), ...(max ? ['--max', String(max)] : [])]);
  return { r, files: r.stdout.split('\n').filter(Boolean) };
};

describe('task-423 (a): joined input: the six lists of the tooling kind (nine until task-453: five-words, queue-137 and orchestrator-doc17 are off), whole, in table order, packed by size', () => {
  it('writes at most 3 files for the tooling kind at a plan material of 12,400 characters; the stitched list parts equal the whole text of the six lists in table order', async () => {
    const m = await jmod();
    const lists = resolvedIds(FILES_423);
    expect(lists).toHaveLength(6);
    const { r, files } = joinedCount(lists, 12400);
    expect(r.status, r.stderr).toBe(0);
    expect(files.length).toBeGreaterThan(0);
    expect(files.length).toBeLessThanOrEqual(3);
    const t = m.readTable();
    const order = Object.keys(t.lists).filter((k) => lists.includes(k));
    const want = order.map((id) => m.wholeListText(t.lists[id], ROOT, id)).join('').replace(/\s+/g, '');
    const got = files.map((f) => (m.parseLensInput(fs.readFileSync(f, 'utf8')) as { listPart: string }).listPart).join('').replace(/\s+/g, '');
    expect(got).toBe(want);
    expect(fs.readFileSync(files[0] as string, 'utf8')).toMatch(/^LIST rules sha256:[0-9a-f]{64} material sha256:[0-9a-f]{64} part 1 of \d+\nRULE LIST rules \(6 lists: /);
  });
  it('with --max small the parts are more and every file is under the bound; control: an input with a part shortened no longer matches its stamp', async () => {
    const m = await jmod();
    const lists = resolvedIds(FILES_423);
    const big = joinedCount(lists, 12400);
    const small = joinedCount(lists, 12400, 60000);
    expect(small.r.status, small.r.stderr).toBe(0);
    expect(small.files.length).toBeGreaterThan(big.files.length);
    for (const f of small.files) expect(fs.readFileSync(f, 'utf8').length, f).toBeLessThan(60000);
    const text = fs.readFileSync(big.files[0] as string, 'utf8');
    expect((m.parseLensInput(text) as { id: string }).id).toBe('rules');
    const at = text.indexOf('\n\n') + 2; // the start of the list part, after the stamp and head lines
    const cut = text.slice(0, at) + text.slice(at + 50);
    expect(cut).not.toBe(text);
    expect((m.parseLensInput(cut) as unknown as { ok: boolean }).ok).toBe(false);
  });
  it('joinLists: one extra list named rules with the members whole in table order; an id not in the table, or a table list named rules, is refused', async () => {
    const m = await jmod();
    const t = m.readTable();
    const j = m.joinLists(t, ['plan-protocol', 'five-words']);
    expect(j.lists.rules?.members?.map((x) => x.id)).toEqual(Object.keys(t.lists).filter((k) => ['plan-protocol', 'five-words'].includes(k)));
    expect(j.lists.rules?.whole).toBe(true);
    expect(() => m.joinLists(t, ['nope'])).toThrow(/nope/);
    const f = fixture();
    const bad = JSON.parse(fs.readFileSync(f.table, 'utf8'));
    bad.lists.rules = { file: 'docs/a.md', whole: true, generated_by: 'hand-written' };
    fs.writeFileSync(f.table, JSON.stringify(bad));
    const v = script(CLI, ['validate', '--root', f.d, '--table', f.table]);
    expect(v.status).toBe(1);
    expect(v.stderr).toMatch(/list rules: the id "rules"/);
  });
});

describe('task-423 (e): counts pinned at most, on the real table', () => {
  it('the tooling kind and the task-419 Files line: 3 compliance files at the plan (material 12,400) and 3 at the output (diff 29,700); the task-412 Files line: 3 and 3', () => {
    for (const files of [FILES_423, filesLineOf(419), filesLineOf(412)]) {
      const lists = resolvedIds(files);
      for (const mat of [12400, 29700]) {
        const { r, files: out } = joinedCount(lists, mat);
        expect(r.status, `${files.slice(0, 40)} ${mat}: ${r.stderr}`).toBe(0);
        expect(out.length, `${files.slice(0, 40)} material ${mat}`).toBeLessThanOrEqual(3);
      }
    }
  });
  it('the old per-list form is unchanged: one lens-input per list still writes that list alone (control)', () => {
    const d = tmp('perlist');
    const m = path.join(d, 'mat.txt'); fs.writeFileSync(m, 'm'.repeat(12400));
    const r = script(CLI, ['lens-input', '--list', 'five-words', '--material', m, '--context', BIGCTX(d), '--out', path.join(d, 'in-x-compliance-five-words')]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
    expect(fs.readFileSync(r.stdout.trim(), 'utf8')).toMatch(/^LIST five-words sha256:/);
  });
  it('lens-input --list rules with no --lists is refused with a usage line', () => {
    const d = tmp('nolists');
    const m = path.join(d, 'mat.txt'); fs.writeFileSync(m, 'm');
    const r = script(CLI, ['lens-input', '--list', 'rules', '--material', m, '--context', BIGCTX(d), '--out', path.join(d, 'in-x')]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--lists/);
  });
});

// ---- task-433 (INPUTS.5, RR-0378 step 6, RR-0381): the Rules met line and the unmentioned report ----
// Rule: "Let's add a dn b to the plan" (decision-163, MORNING-DECISIONS.md:1853); 08_agents.md:462 both directions; PLAN-PROTOCOL.md:3 simple, no scope creep. A REPORT for the grounder, never a gate.
describe('task-433: unmentioned prints the rule ids of the sent list part that appear nowhere in the output (a report, not a gate)', () => {
  type RM = { renderLensInput: (a: Record<string, unknown>) => string; findingsIn: (f: { name: string; text: string }[]) => { id: string }[]; looseFindingCount: (t: string) => number };
  const rm = () => import(path.join(ROOT, 'scripts/analysis/rule-lists.mjs')) as Promise<RM>;
  const pair = async (listPart: string, output: string, name = 'out-compliance-hb.txt') => {
    const m = await rm();
    const d = tmp('unm');
    const input = m.renderLensInput({ id: 'hb', list: { file: 'docs/x.md', whole: true }, part: listPart, i: 1, n: 1, material: 'MAT', paths: null });
    fs.writeFileSync(path.join(d, `in-${name}`), input);
    fs.writeFileSync(path.join(d, name), output);
    return { d, out: path.join(d, name) };
  };
  const LIST = '# Handbook\n- **fe.01** one\n- **fe.02** two\n- **fe.03** three\n- **fe.12** twelve\n';
  const BODY = 'REVIEW template=lens-compliance.md model=x\nBUG severity=HIGH — fe.02 "two" — a.ts:1 "x" — claim — fix\nVERDICT: FAIL\nClauses checked: 4   Unmet: 1\n';
  it('T1 plant: a finding names fe.02 and the Rules met line names fe.01 and fe.12, so exactly fe.03 is printed', async () => {
    const { out } = await pair(LIST, `${BODY}Rules met: fe.01, fe.12\n`);
    const r = script(CLI, ['unmentioned', '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('out-compliance-hb.txt: list hb part 1 of 1: 1 of 4 rule ids are in no finding and not in the Rules met line: fe.03');
  });
  it('control (a): every id mentioned prints none and exits 0', async () => {
    const { out } = await pair(LIST, `${BODY}Rules met: fe.01, fe.03, fe.12\n`);
    const r = script(CLI, ['unmentioned', '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('out-compliance-hb.txt: list hb part 1 of 1: 0 of 4 rule ids are in no finding and not in the Rules met line: none');
  });
  it('control (b): fe.1 is not covered by fe.12, and the dot is literal (feX01 does not cover fe.01)', async () => {
    const { out } = await pair('- **fe.1** a\n- **fe.12** b\n- **fe.01** c\n', 'Rules met: fe.12, feX01\n');
    const r = script(CLI, ['unmentioned', '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('fe.1, fe.01');
    expect(r.stdout).not.toContain('fe.12,');
  });
  it('control (c): a REJECT or MET line naming the id counts as a mention', async () => {
    const { out } = await pair(LIST, 'REJECT — fe.01 — accused — not real\nMET — fe.03 — a.ts:2 — ok\nRules met: fe.12\n');
    const r = script(CLI, ['unmentioned', '--out', out]);
    expect(r.stdout.trim().endsWith('fe.02')).toBe(true);
    expect(r.stdout).toContain('1 of 4');
  });
  it('control (d): an output with no Rules met line gets the note and ids absent from findings are listed', async () => {
    const { out } = await pair(LIST, BODY);
    const r = script(CLI, ['unmentioned', '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('fe.01, fe.03, fe.12');
    expect(r.stdout).toContain('[no "Rules met:" line in the output]');
  });
  it('control (e): a list part with no rule ids (the glossary form) prints "holds no rule ids", nothing invented', async () => {
    const { out } = await pair('- **slug**: a glossary line\n- **other**: another\n', 'Rules met: none\n');
    const r = script(CLI, ['unmentioned', '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('out-compliance-hb.txt: the sent list part holds no name.N bullet rule ids (ids of another shape are not read), nothing to report');
  });
  it('T2 plant: flagged ids still exit 0; controls: missing --out exits 2, a file that is not a lens input exits 1, --in is honoured', async () => {
    const { d, out } = await pair(LIST, 'nothing\n');
    expect(script(CLI, ['unmentioned', '--out', out]).status).toBe(0);
    expect(script(CLI, ['unmentioned']).status).toBe(2);
    fs.writeFileSync(path.join(d, 'in-plain.txt'), 'not a lens input\n');
    fs.writeFileSync(path.join(d, 'plain.txt'), 'x\n');
    const bad = script(CLI, ['unmentioned', '--out', path.join(d, 'plain.txt')]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/not a lens input/);
    const other = path.join(d, 'elsewhere-input.txt');
    fs.copyFileSync(path.join(d, 'in-out-compliance-hb.txt'), other);
    fs.writeFileSync(path.join(d, 'solo.txt'), 'Rules met: fe.01\n');
    const r = script(CLI, ['unmentioned', '--out', path.join(d, 'solo.txt'), '--in', other]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('fe.02, fe.03, fe.12');
  });
  it('T4 (green-both lock, parsers unchanged): the Rules met line and the tool trailer change neither the strict nor the loose finding count', async () => {
    const m = await rm();
    const plain = `${BODY}`;
    const withLine = `${BODY}Rules met: fe.01, fe.12\n---\ntook 12.3s\n`;
    for (const text of [plain, withLine]) {
      expect(m.findingsIn([{ name: 'out-compliance-hb.txt', text }]).length).toBe(1);
      expect(m.looseFindingCount(text)).toBe(1);
    }
  });
});

// task-438 T2 (FINAL.3, RR-0385 item 2, decision-170): one routing predicate decides the seat of a rule list: a list whose file is the engineering standards file goes to the engineering seat,
// every other list (and the joined list of lens-input --list rules) to the compliance seat. No table field: the ruling names the document.
describe('task-438 T2: seatOf routes a rule list to the engineering or the compliance seat', () => {
  type SM = { seatOf?: (l: unknown) => string; ENG_FILE?: string; readTable: () => { lists: Record<string, { file: string }> }; joinLists: (t: unknown, ids: string[]) => { lists: Record<string, { file: string }> } };
  const sm = async () => (await import('../../../scripts/analysis/rule-lists.mjs')) as unknown as SM;
  it('eng-all, and a sections list on the engineering standards file, are engineering', async () => {
    const m = await sm();
    expect(typeof m.seatOf, 'seatOf is exported').toBe('function');
    expect(m.ENG_FILE).toBe('docs/specs/00_engineering_standards.md');
    const t = m.readTable();
    expect(m.seatOf!({ id: 'eng-all', ...t.lists['eng-all'] })).toBe('engineering');
    expect(m.seatOf!({ id: 'eng-s4', file: 'docs/specs/00_engineering_standards.md', sections: ['4. Security & API Contracts'] })).toBe('engineering');
  });
  it('control: bylaw-133 and the joined list (joinLists, even when it holds eng-all) are compliance', async () => {
    const m = await sm();
    expect(typeof m.seatOf, 'seatOf is exported').toBe('function');
    const t = m.readTable();
    expect(m.seatOf!({ id: 'bylaw-133', ...t.lists['bylaw-133'] })).toBe('compliance');
    const j = m.joinLists(t, ['eng-all', 'five-words']);
    expect(m.seatOf!({ id: 'rules', ...j.lists.rules })).toBe('compliance');
  });
});

// task-453 (SEARCHFIX.5 item 1; RR-0440 MORNING-DECISIONS.md:2265, RR-0450 :2325, RR-0452 :2336): output_off is one data line that turns a list off for output reviews only; validate fails closed on a typo
describe('task-453: output_off and validate robustness', () => {
  type V = { validateTable: (t: unknown, root: string) => string[]; outputLists: (t: unknown, l: { id: string }[]) => { id: string }[] };
  const vmod = () => import(path.join(ROOT, 'scripts/analysis/rule-lists.mjs')) as Promise<V>;
  it('the real table switches plan-protocol off for output reviews (output_off) and keeps it in every_task', () => {
    const t = real() as Table & { output_off?: string[] };
    expect(t.output_off).toEqual(['plan-protocol']);
    expect(t.every_task).toContain('plan-protocol');
  });
  it('outputLists drops the output_off lists and keeps the rest; an empty or missing output_off keeps every list (AC #2)', async () => {
    const { outputLists } = await vmod();
    const ls = [{ id: 'plan-protocol' }, { id: 'eng-all' }, { id: 'inc-S' }];
    expect(outputLists({ output_off: ['plan-protocol'] }, ls).map((l) => l.id)).toEqual(['eng-all', 'inc-S']);
    expect(outputLists({ output_off: [] }, ls).map((l) => l.id)).toEqual(['plan-protocol', 'eng-all', 'inc-S']);
    expect(outputLists({}, ls).map((l) => l.id)).toEqual(['plan-protocol', 'eng-all', 'inc-S']);
  });
  it('validate refuses an output_off id that is not in every_task, and an output_off that is not a list (fails closed on a typo)', async () => {
    const { validateTable } = await vmod();
    expect(validateTable({ ...real(), output_off: ['nope'] }, ROOT).join('|')).toMatch(/output_off: list nope is not in every_task/);
    expect(validateTable({ ...real(), output_off: 'plan-protocol' }, ROOT).join('|')).toMatch(/output_off: must be a list/);
    expect(validateTable(real(), ROOT)).toEqual([]);
  });
  it('T10: a null list or a null row is a problem line, not a TypeError', async () => {
    const { validateTable } = await vmod();
    const t = real();
    const bad = validateTable({ ...t, lists: { ...t.lists, broken: null }, rows: [...(t as unknown as { rows: unknown[] }).rows, null] }, ROOT).join('|');
    expect(bad).toMatch(/list broken: not an object/);
    expect(bad).toMatch(/rows\[\d+\]: not an object/);
  });
});
