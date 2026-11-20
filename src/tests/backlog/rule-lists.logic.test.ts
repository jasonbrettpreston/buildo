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
  w('src/one.ts', "import { x } from '../../scripts/lib/" + "compute/thing';\nexport const a = x;\n");
  w('src/two.ts', 'export const b = 2;\n');
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
      { id: 'mob', globs_from: { file: 'pol/protected.json', key: 'frontend' }, lists: ['big'], why: 'frontend' },
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
  it('an exempt entry resolves to no list and is flagged; exempt is not unmatched', () => {
    const f = fixture();
    const r = res(f, 'docs/reports/lanes/x/', ['--type', 'build']);
    expect(r.status, r.stderr).toBe(0);
    const a = JSON.parse(r.stdout) as Res;
    expect(a.exempt).toEqual(['docs/reports/lanes/x/']);
    expect(a.unmatched).toEqual([]);
    expect(ids(a)).toEqual(['inc-F']);
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
