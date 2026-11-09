// SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md (gate table rows S-gen, S-golden, S-parity; dated notes 2026-11-04 and 2026-11-09),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 13 (one command), Rule 20 (binding),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-13 (the gate), FE-06 (honest display), FE-29 (the node contract file).
//
// MF-15 · McFrontend queue · lane G. The lock for scripts/surfaces/surface-validate.mjs (`--check`, the only flag). Every check is proven RED on a planted defect
// in a temp copy of the tree (the gate reads the tree it sits in, never the cwd) and GREEN on the real tree. Each test asserts the exact finding line.
// Generators in the temp copy are stubs (a real script that writes a line and exits 0 or 1); the real tree is run once with the real generators. No DB, no network.
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FP_FILES, TARGETS } from '../../../scripts/surfaces/report-checks.mjs'; // the closed lists have one home (R-27)

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const REPO = process.cwd();
const GATE = 'scripts/surfaces/surface-validate.mjs';
const SCHEMA = 'scripts/surfaces/_schema';
const FP: string[] = FP_FILES.map((p: string) => path.basename(p));
const GOLD = 'src/tests/fixtures/surfaces/report';
const SEED_GEN = `${SCHEMA}/seed-report-v2.mjs`;
const RS_GEN = 'scripts/analysis/report-schema.mjs';
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const wj = (p: string, j: Json): void => fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`);
const sha16 = (p: string): string => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
const stub = (root: string, rel: string, body: string): void => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body); };

// A temp tree: the gate, the module, the four input files, the goldens, exit-0 stub generators, node_modules linked for ajv.
const mkRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mf15-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, SCHEMA), { recursive: true });
  for (const f of ['surface-validate.mjs', 'report-checks.mjs']) fs.copyFileSync(path.join(REPO, 'scripts/surfaces', f), path.join(root, 'scripts/surfaces', f));
  for (const f of FP) fs.copyFileSync(path.join(REPO, SCHEMA, f), path.join(root, SCHEMA, f));
  fs.cpSync(path.join(REPO, GOLD), path.join(root, GOLD), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'));
  stub(root, SEED_GEN, 'process.exit(0);\n');
  stub(root, RS_GEN, 'process.exit(0);\n');
  return root;
};
const run = (root: string, args: string[] = ['--check'], cwd = root): { code: number | null; out: string; err: string; lines: string[] } => {
  const r = spawnSync(process.execPath, [path.join(root, GATE), ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, lines: r.stderr.split('\n').filter(Boolean) };
};
const gold = (root: string, state: string, target: string): string => path.join(root, GOLD, `${state}.${target}.json`);
const edit = (root: string, state: string, target: string, fn: (g: Json) => void): void => { const g = rj(gold(root, state, target)); fn(g); wj(gold(root, state, target), g); };
const eachGolden = (root: string, fn: (g: Json, file: string) => void): void => {
  for (const f of fs.readdirSync(path.join(root, GOLD)).filter((n) => n !== 'states.json')) { const p = path.join(root, GOLD, f); const g = rj(p); fn(g, f); wj(p, g); }
};
const restamp = (root: string): void => eachGolden(root, (g) => { for (const f of FP) g.fingerprint.files[`${SCHEMA}/${f}`] = sha16(path.join(root, SCHEMA, f)); });

describe('FE-13 surface-validate gate: real tree', () => {
  it('GREEN on the real tree with the real generators; budget is a stated waiting', () => {
    const r = spawnSync(process.execPath, [path.join(REPO, GATE), '--check'], { cwd: os.tmpdir(), encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('surface-validate current; S-gen ok · S-golden ok (12 states x 4; owed 15 states / 60 files) · S-parity ok · binding ok · closed-status ok · budget WAITS MF-08\n');
  });

  it('the real goldens cover each lifecycle state and an at_least tree (guards against a vacuous status arm)', () => {
    const states: string[] = rj(path.join(REPO, GOLD, 'states.json')).states;
    for (const s of ['loading', 'miss', 'error', 'at_least']) expect(states).toContain(s);
  });
});

describe('S-gen: the committed generators\' --check', () => {
  it('a failing report-schema --check is relayed line by line; the warning line is not taken for the finding', () => {
    const root = mkRoot();
    stub(root, RS_GEN, "console.error('warning: slow'); console.error('RS-1 FAIL x'); process.exit(1);\n");
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.lines).toEqual(['SV-GEN report-schema.mjs: exit 1', 'SV-GEN report-schema.mjs: warning: slow', 'SV-GEN report-schema.mjs: RS-1 FAIL x']);
  });
  it('a missing generator is a finding', () => {
    const root = mkRoot();
    fs.rmSync(path.join(root, SEED_GEN));
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.lines).toEqual(['SV-GEN seed-report-v2.mjs: missing']);
  });
  it('both generators exit 0: the GEN arm is clean', () => {
    expect(run(mkRoot()).code).toBe(0);
  });
});

describe('S-golden: existence and fingerprint', () => {
  it('a deleted target file', () => {
    const root = mkRoot();
    fs.rmSync(gold(root, 'at_least', 'pdf'));
    expect(run(root).lines).toEqual(['SV-GOLDEN at_least.pdf.json: missing']);
  });
  it('manifest targets are three', () => {
    const root = mkRoot();
    const p = path.join(root, GOLD, 'states.json');
    const m = rj(p); m.targets = ['mobile', 'web', 'admin']; wj(p, m);
    expect(run(root).lines).toEqual(['SV-GOLDEN states.json: targets are not mobile,web,admin,pdf']);
  });
  it('a stray file beside the goldens', () => {
    const root = mkRoot();
    fs.writeFileSync(path.join(root, GOLD, 'stray.json'), '{}\n');
    expect(run(root).lines).toEqual(['SV-GOLDEN stray.json: not in manifest']);
  });
  it('a state dropped from the manifest while its files remain: each file is not in manifest', () => {
    const root = mkRoot();
    const p = path.join(root, GOLD, 'states.json');
    const m = rj(p); m.states = m.states.filter((s: string) => s !== 'miss'); wj(p, m);
    expect(run(root).lines).toEqual(TARGETS.map((t) => `SV-GOLDEN miss.${t}.json: not in manifest`).sort());
  });
  it('a missing file and a bad target list together give two lines in the fixed order', () => {
    const root = mkRoot();
    fs.rmSync(gold(root, 'at_least', 'pdf'));
    const p = path.join(root, GOLD, 'states.json');
    const m = rj(p); m.targets = ['mobile', 'web', 'admin']; wj(p, m);
    expect(run(root).lines).toEqual(['SV-GOLDEN states.json: targets are not mobile,web,admin,pdf', 'SV-GOLDEN at_least.pdf.json: missing']);
  });
  it('a missing manifest is a finding, not a usage error', () => {
    const root = mkRoot();
    fs.rmSync(path.join(root, GOLD, 'states.json'));
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.lines).toContain('SV-GOLDEN states.json: missing or not JSON');
  });
  for (const f of FP) {
    it(`one byte changed in ${f}: every golden is stale on it`, () => {
      const root = mkRoot();
      fs.appendFileSync(path.join(root, SCHEMA, f), ' ');
      const r = run(root);
      expect(r.code).toBe(1);
      const stale = r.lines.filter((l) => l.endsWith(`fingerprint stale: ${f}`));
      expect(stale).toHaveLength(48);
      expect(stale).toContain(`SV-GOLDEN at_least.web.json: fingerprint stale: ${f}`);
    });
  }
  it('a changed response_fixture value: fixture hash (and parity, which sees the same change)', () => {
    const root = mkRoot();
    edit(root, 'permitted', 'web', (g) => { g.response_fixture.synthetic = 'changed'; });
    expect(run(root).lines).toContain('SV-GOLDEN permitted.web.json: fingerprint stale: fixture hash');
  });
  it('a dropped fingerprint.files key', () => {
    const root = mkRoot();
    edit(root, 'permitted', 'web', (g) => { delete g.fingerprint.files[`${SCHEMA}/binding-sources.json`]; });
    expect(run(root).lines).toEqual(['SV-GOLDEN permitted.web.json: fingerprint files differ']);
  });
  it('a stale declaration and a dropped key together: two lines for that file', () => {
    const root = mkRoot();
    edit(root, 'permitted', 'web', (g) => { delete g.fingerprint.files[`${SCHEMA}/binding-sources.json`]; });
    fs.appendFileSync(path.join(root, SCHEMA, 'report-v2.decl.json'), ' ');
    const own = run(root).lines.filter((l) => l.startsWith('SV-GOLDEN permitted.web.json:'));
    expect(own).toEqual(['SV-GOLDEN permitted.web.json: fingerprint files differ', 'SV-GOLDEN permitted.web.json: fingerprint stale: report-v2.decl.json']);
  });
});

describe('S-parity: the four target files agree', () => {
  it('one node value changed in one target', () => {
    const root = mkRoot();
    edit(root, 'variant_flat', 'admin', (g) => { g.rendered_tree.nodes[0].value = 'changed'; });
    expect(run(root).lines).toContain('SV-PARITY variant_flat: rendered_tree differs: mobile vs admin');
  });
  it('a changed response_fixture in one target', () => {
    const root = mkRoot();
    edit(root, 'variant_flat', 'admin', (g) => { g.response_fixture.extra = 1; });
    expect(run(root).lines).toContain('SV-PARITY variant_flat: response_fixture differs: mobile vs admin');
  });
  it('the target field names the wrong target', () => {
    const root = mkRoot();
    edit(root, 'variant_flat', 'admin', (g) => { g.target = 'web'; });
    expect(run(root).lines).toEqual(['SV-PARITY variant_flat.admin.json: target field is web']);
  });
  it('the state field names the wrong state', () => {
    const root = mkRoot();
    edit(root, 'variant_flat', 'admin', (g) => { g.state = 'permitted'; });
    expect(run(root).lines).toEqual(['SV-PARITY variant_flat.admin.json: state field is permitted']);
  });
});

// All four targets are changed alike, so only the check under test fires.
const planted = (state: string, fn: (g: Json) => void): string[] => {
  const root = mkRoot();
  for (const t of TARGETS) edit(root, state, t, fn);
  return run(root).lines;
};
const statusNode = (g: Json): Json => g.rendered_tree.nodes.find((n: Json) => n.field === 'status_text');

describe('binding: each node binds to a declared field and the closed source set', () => {
  it('a node source not in binding-sources.json', () => {
    const lines = planted('permitted', (g) => { g.rendered_tree.nodes[0].source = 'made_up_kind'; });
    const f = rj(path.join(REPO, GOLD, 'permitted.web.json')).rendered_tree.nodes[0].field;
    expect(lines).toContain(`SV-BIND permitted.web.json: node ${f}: source kind not in binding-sources.json: made_up_kind`);
    expect(lines).toContain(`SV-BIND permitted.web.json: node ${f}: source made_up_kind is not the declared content`);
  });
  it('a node field not in the declaration', () => {
    const lines = planted('permitted', (g) => { g.rendered_tree.nodes[0].field = 'made_up_field'; });
    expect(lines).toContain('SV-BIND permitted.web.json: node made_up_field: field not in declaration');
  });
  it('a node source unequal to the declaration\'s kind', () => {
    const lines = planted('permitted', (g) => { g.rendered_tree.nodes[0].source = 'catalogue'; });
    expect(lines.filter((l) => l.startsWith('SV-BIND permitted.web.json:') && l.includes('is not the declared'))).toHaveLength(1);
  });
  it('a wrong base label', () => {
    const lines = planted('permitted', (g) => { g.rendered_tree.nodes[0].label = 'Wrong'; });
    expect(lines.filter((l) => l.startsWith('SV-BIND permitted.web.json:') && l.endsWith('label is not the declared label'))).toHaveLength(1);
  });
  it('an at_least label without the suffix', () => {
    const lines = planted('at_least', (g) => { const n = g.rendered_tree.nodes.find((x: Json) => x.status === 'at_least'); n.label = n.label.replace(', at least', ''); });
    expect(lines.filter((l) => l.startsWith('SV-BIND at_least.web.json:') && l.endsWith('label is not the declared label'))).toHaveLength(1);
  });
  it('a status_text value that is not the content text', () => {
    const lines = planted('not_permitted', (g) => { statusNode(g).value = 'made up words'; });
    expect(lines).toContain('SV-BIND not_permitted.web.json: node status_text: status_text value is not the content text');
  });
});

describe('closed-status: the node contract and the honest extras', () => {
  it('a status outside the closed list fails the schema', () => {
    const lines = planted('permitted', (g) => { g.rendered_tree.nodes[0].status = 'maybe'; });
    expect(lines.some((l) => l.startsWith('SV-STATUS permitted.web.json: /nodes/0/status '))).toBe(true);
  });
  it('an extra node key fails the schema', () => {
    const lines = planted('permitted', (g) => { g.rendered_tree.nodes[0].extra = 1; });
    expect(lines.some((l) => l.startsWith('SV-STATUS permitted.web.json: /nodes/0 '))).toBe(true);
  });
  it('none outside a lifecycle tree', () => {
    const lines = planted('permitted', (g) => { g.rendered_tree.nodes[0].status = 'none'; });
    expect(lines).toContain('SV-STATUS permitted.web.json: node 0: none outside a lifecycle tree');
  });
  it('a lifecycle tree with two nodes', () => {
    const lines = planted('error', (g) => { g.rendered_tree.nodes.push(g.rendered_tree.nodes[0]); });
    expect(lines).toContain('SV-STATUS error.web.json: a lifecycle tree carries exactly one message node');
  });
  it('a not_evaluated reason with no content text', () => {
    const lines = planted('not_evaluated', (g) => { statusNode(g).status = 'not_evaluated:made_up'; });
    expect(lines).toContain('SV-STATUS not_evaluated.web.json: node 0: not_evaluated reason has no content text: not_evaluated:made_up');
  });
  it('a disclosure code not in disclosure_texts', () => {
    const lines = planted('permitted', (g) => { g.rendered_tree.nodes[0].disclosures = ['made_up_code']; });
    expect(lines).toContain('SV-STATUS permitted.web.json: node 0: disclosure code not in disclosure_texts: made_up_code');
  });
  it('the lifecycle key missing on a lifecycle state', () => {
    const lines = planted('miss', (g) => { delete g.rendered_tree.lifecycle; });
    expect(lines).toContain('SV-STATUS miss.web.json: lifecycle key missing');
  });
});

describe('done-condition: a planted bad descriptor exits 1', () => {
  const bad = (root: string): string => {
    const field = rj(gold(root, 'permitted', 'web')).rendered_tree.nodes[0].field;
    const p = path.join(root, SCHEMA, 'report-v2.decl.json');
    const d = rj(p);
    for (const s of d.sections) for (const f of s.fields) if (f.name === field) f.source = 'made_up:x';
    wj(p, d);
    return field;
  };
  it('case A: fingerprints left stale: the stale line and the bind line', () => {
    const root = mkRoot();
    const field = bad(root);
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.lines).toContain('SV-GOLDEN permitted.web.json: fingerprint stale: report-v2.decl.json');
    expect(r.lines).toContain(`SV-BIND permitted.web.json: node ${field}: declared source kind not in binding-sources.json: made_up`);
  });
  it('case B: goldens re-stamped so the hash is clean: the descriptor itself is judged, SV-BIND lines alone', () => {
    const root = mkRoot();
    const field = bad(root);
    restamp(root);
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.lines.every((l) => l.startsWith('SV-BIND '))).toBe(true);
    expect(r.lines).toContain(`SV-BIND permitted.web.json: node ${field}: declared source kind not in binding-sources.json: made_up`);
  });
  it('the same tree unedited exits 0', () => {
    expect(run(mkRoot()).code).toBe(0);
  });
});

describe('malformed input is a finding, never a crash', () => {
  it('an empty state list is a finding, not a pass', () => {
    const root = mkRoot();
    const p = path.join(root, GOLD, 'states.json');
    const m = rj(p); m.states = []; wj(p, m);
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.lines).toContain('SV-GOLDEN states.json: states is not a non-empty list');
  });
  it('a golden that is JSON null gives SV lines and exit 1, no stack trace', () => {
    const root = mkRoot();
    fs.writeFileSync(gold(root, 'permitted', 'web'), 'null\n');
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.lines.every((l) => l.startsWith('SV-'))).toBe(true);
    expect(r.err).not.toContain('at ');
  });
  it('a declaration whose sections are not a list gives an SV-BIND line and exit 1', () => {
    const root = mkRoot();
    const p = path.join(root, SCHEMA, 'report-v2.decl.json');
    const d = rj(p); d.sections = null; wj(p, d);
    restamp(root);
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.lines.some((l) => l.startsWith('SV-BIND arm: input of the wrong shape'))).toBe(true);
  });
  it('an unreadable golden is reported once, by the GOLDEN arm', () => {
    const root = mkRoot();
    fs.writeFileSync(gold(root, 'permitted', 'web'), '{ not json');
    const r = run(root);
    expect(r.lines.filter((l) => l.includes('permitted.web.json'))).toEqual(['SV-GOLDEN permitted.web.json: unreadable or not JSON']);
  });
});

describe('usage, output and read-only', () => {
  it('any flag but --check exits 2', () => {
    const root = mkRoot();
    for (const a of [['--nope'], ['--surface=report'], ['--write'], ['--check', '--check']]) {
      const r = run(root, a);
      expect(r.code, a.join(' ')).toBe(2);
      expect(r.err).toBe('usage: node scripts/surfaces/surface-validate.mjs [--check]\n');
    }
  });
  it('no flag is the same run as --check', () => {
    const root = mkRoot();
    expect(run(root, [])).toEqual(run(root, ['--check']));
  });
  it('the real tree twice from two cwd: byte-identical output, and no input file changes', () => {
    const files = fs.readdirSync(path.join(REPO, SCHEMA)).filter((n) => n.endsWith('.json')).map((n) => path.join(REPO, SCHEMA, n))
      .concat(fs.readdirSync(path.join(REPO, GOLD)).map((n) => path.join(REPO, GOLD, n)));
    const before = files.map(sha16);
    const a = spawnSync(process.execPath, [path.join(REPO, GATE), '--check'], { cwd: REPO, encoding: 'utf8' });
    const b = spawnSync(process.execPath, [path.join(REPO, GATE), '--check'], { cwd: os.tmpdir(), encoding: 'utf8' });
    expect([a.status, a.stdout, a.stderr]).toEqual([b.status, b.stdout, b.stderr]);
    expect(files.map(sha16)).toEqual(before);
  });
  it('a two-defect tree twice (fresh copy each time): identical findings in a fixed order', () => {
    const one = (): string[] => {
      const root = mkRoot();
      fs.rmSync(gold(root, 'at_least', 'pdf'));
      edit(root, 'variant_flat', 'admin', (g) => { g.target = 'web'; });
      return run(root).lines;
    };
    const a = one();
    expect(a).toEqual(['SV-GOLDEN at_least.pdf.json: missing', 'SV-PARITY variant_flat.admin.json: target field is web']);
    expect(one()).toEqual(a);
  });
});
