// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 0a (P1: a new scenario reaches the report with no code) and 11a.1 (Generation:
//            "A row on in the switchboard yields a field set; off yields none"; fields are generated into the SEED, never by hand),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-02 (declared, not coded), FE-24 (a new catalogue row reaches every
//            target with zero front-end code), FE-18 (a field binds to a catalogue row that exists),
//            docs/specs/01-pipeline/124_step_standard_policy.md §5 R-HM (generated outputs are never hand-edited; --check fails on drift).
//
// MF-11 · McFrontend queue · lane T. RED tests first for the catalogue-to-report generator (MF-13), Spec 08 §11.3-11.4. The generator is
// scripts/surfaces/_schema/seed-report-v2.mjs (--check / --write). Each case runs a COPY of it in a throwaway tree (the committed tree is never
// touched) and asserts the DESIGNED diagnostic contract MF-13 must meet:
//   a finding is one line `GEN-<CODE> <subject>` on stderr, exit 1.
//   GEN-ROW-NO-FIELD <row id>      a catalogue row ON in the switchboard has no field in the report
//   GEN-FIELD-NO-ROW <row id>      a field binds `catalogue:<id>` and no catalogue row <id> exists
//   GEN-HAND-EDIT <file>           a generated file differs from a regeneration of UNCHANGED inputs
// RED today means: the case fails at the contract assertion (the token / the field), not at a missing file. Controls marked GREEN-BOTH pass
// before and after MF-13 (survive-the-fix locks) and prove a red case is not red because the throwaway tree is broken. No DB, no network.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON documents
const ROOT = process.cwd();
const SCHEMA_DIR = 'scripts/surfaces/_schema';
const GEN = `${SCHEMA_DIR}/seed-report-v2.mjs`;
const CATALOGUE = 'scripts/seeds/bylaw/layer3-catalogue.json';
const SWITCHBOARD = 'scripts/seeds/bylaw/switchboard.json';
const Q7_LOG = 'docs/reports/decisions/2026-10-20-chat-batch-b.json';
const GENERATED = [`${SCHEMA_DIR}/report-v2.decl.json`, `${SCHEMA_DIR}/report-presentation.json`, `${SCHEMA_DIR}/report-v2.rulings.json`];
const DECL_FILE = GENERATED[0] as string;
const PROBE = 'zz_mf11_probe_m2'; // a catalogue row that exists in no real file

let tmpRoot = '';

// A throwaway tree holding exactly what the generator reads. The generator resolves its root from its own location, so the copy is self-contained.
const sandbox = (): string => {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'tree-'));
  fs.cpSync(path.join(ROOT, SCHEMA_DIR), path.join(dir, SCHEMA_DIR), { recursive: true });
  for (const rel of [CATALOGUE, SWITCHBOARD, Q7_LOG]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
  }
  return dir;
};
const readJson = (dir: string, rel: string): Json => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const writeJson = (dir: string, rel: string, doc: Json): void => fs.writeFileSync(path.join(dir, rel), `${JSON.stringify(doc, null, 2)}\n`);
// Findings are a stderr contract: `out` is stderr only (stdout carries the success line and is read separately where a control needs it).
const run = (dir: string, mode: '--check' | '--write'): { status: number | null; out: string; stdout: string } => {
  const r = spawnSync(process.execPath, [path.join(dir, GEN), mode], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  return { status: r.status, out: r.stderr, stdout: r.stdout };
};
const sha = (dir: string, rel: string): string => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex');
const fieldsOf = (decl: Json): Json[] => decl.sections.flatMap((s: Json) => s.fields);

// Authored catalogue row, shaped like a real one (see layer3-catalogue.json gfa_flat_m2): unit m2, formula switch.
const addProbeRow = (dir: string, state: 'on' | 'off'): void => {
  const cat = readJson(dir, CATALOGUE);
  const model = structuredClone(cat.rows.find((r: Json) => r.id === 'gfa_flat_m2'));
  cat.rows.push({ ...model, id: PROBE, switch: `formula:${PROBE}` });
  writeJson(dir, CATALOGUE, cat);
  const sw = readJson(dir, SWITCHBOARD);
  sw.rows.push({ id: `formula:${PROBE}`, kind: 'formula', state, ruling: 'MF-11 probe', reason: 'throwaway tree only' });
  writeJson(dir, SWITCHBOARD, sw);
};

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf11-'));
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('controls (GREEN-BOTH): the throwaway tree is sound', () => {
  it('an untouched copy passes --check: the committed outputs reproduce from the committed inputs (exit 0)', () => {
    const r = run(sandbox(), '--check');
    expect(r.stdout).toContain('current');
    expect(r.status).toBe(0);
  });
  it('--write on an untouched copy changes no generated file (second run changes nothing)', () => {
    const dir = sandbox();
    const before = GENERATED.map((f) => sha(dir, f));
    expect(run(dir, '--write').status).toBe(0);
    expect(GENERATED.map((f) => sha(dir, f))).toEqual(before);
  });
});

describe('Case 1: a catalogue row with no field (FE-24, 126 11a.1)', () => {
  it('RED: --check names an ON row that has no field: exit 1 and `GEN-ROW-NO-FIELD <row>`, and no other class', () => {
    const dir = sandbox();
    addProbeRow(dir, 'on');
    const r = run(dir, '--check');
    expect(r.status).toBe(1);
    expect(r.out).toContain(`GEN-ROW-NO-FIELD ${PROBE}`); // red today: --check reports generic drift, never names the row
    expect(r.out).not.toContain('GEN-HAND-EDIT'); // the inputs moved, not the outputs
    expect(r.out).not.toContain('GEN-FIELD-NO-ROW');
  });
  it('RED: --write gives an ON row a field of its own, bound `catalogue:<row>`, and does not park it in not_in_report', () => {
    const dir = sandbox();
    addProbeRow(dir, 'on');
    expect(run(dir, '--write').status).toBe(0);
    const decl = readJson(dir, DECL_FILE);
    const bound = fieldsOf(decl).filter((f) => f.source === `catalogue:${PROBE}`);
    expect(bound.length).toBeGreaterThanOrEqual(1); // red today: the row lands in not_in_report with the generic reason
    expect(JSON.stringify(decl.not_in_report)).not.toContain(PROBE);
    expect(run(dir, '--check').status).toBe(0); // and the written tree is then current
  });
  // Note: today this passes partly because the generator does not read the switchboard; 1a/1b (same row, ON) carry the on-versus-off difference.
  it('GREEN-BOTH: a row switched OFF yields no field and no finding (off yields none)', () => {
    const dir = sandbox();
    addProbeRow(dir, 'off');
    const w = run(dir, '--write');
    expect(w.status).toBe(0);
    expect(fieldsOf(readJson(dir, DECL_FILE)).filter((f) => f.source === `catalogue:${PROBE}`)).toEqual([]);
    const c = run(dir, '--check');
    expect(c.status).toBe(0);
    expect(c.out).not.toContain('GEN-ROW-NO-FIELD');
  });
});

describe('Case 2: a field with no catalogue row (FE-18, FE-24)', () => {
  const field = 'gfa_flat_m2';
  const dropRow = (dir: string): void => {
    const cat = readJson(dir, CATALOGUE);
    cat.rows = cat.rows.filter((r: Json) => r.id !== field);
    writeJson(dir, CATALOGUE, cat);
    const sw = readJson(dir, SWITCHBOARD);
    sw.rows = sw.rows.filter((r: Json) => r.id !== `formula:${field}`);
    writeJson(dir, SWITCHBOARD, sw);
  };
  it('control: the committed declaration binds the field to the row (so the case drops a row a field really uses)', () => {
    const decl = readJson(sandbox(), DECL_FILE);
    expect(fieldsOf(decl).some((f) => f.source === `catalogue:${field}`)).toBe(true);
  });
  it('RED: --check names a field whose row was removed: exit 1 and `GEN-FIELD-NO-ROW <row>`, and no other class', () => {
    const dir = sandbox();
    dropRow(dir);
    const r = run(dir, '--check');
    expect(r.status).toBe(1);
    expect(r.out).toContain(`GEN-FIELD-NO-ROW ${field}`); // red today: exit 1 is generic drift; the field is dropped silently on --write
    expect(r.out).not.toContain('GEN-HAND-EDIT');
    expect(r.out).not.toContain('GEN-ROW-NO-FIELD');
  });
  it('RED: --write refuses (exit 1) rather than silently dropping the field, and leaves the generated files as they were', () => {
    const dir = sandbox();
    const before = GENERATED.map((f) => sha(dir, f));
    dropRow(dir);
    const r = run(dir, '--write');
    expect(r.status).toBe(1); // red today: --write exits 0 and the field vanishes
    expect(r.out).toContain(`GEN-FIELD-NO-ROW ${field}`);
    expect(GENERATED.map((f) => sha(dir, f))).toEqual(before);
  });
});

describe('Case 3: a hand edit of generated output (R-HM, FE-02)', () => {
  const handEdit = (dir: string, rel: string): void => {
    const doc = readJson(dir, rel);
    doc.hand_edit = 'MF-11 probe';
    writeJson(dir, rel, doc);
  };
  it.each(GENERATED)('RED: a hand edit of %s: exit 1 and `GEN-HAND-EDIT <file>`, and no input-class finding', (rel) => {
    const dir = sandbox();
    const before = sha(dir, rel);
    handEdit(dir, rel);
    expect(sha(dir, rel)).not.toBe(before); // dead-man: the edit really changed the file
    const r = run(dir, '--check');
    expect(r.status).toBe(1);
    expect(r.out).toContain(`GEN-HAND-EDIT ${rel}`); // red today: generic `DRIFT: <basename>` with no class and no path
    expect(r.out).not.toContain('GEN-ROW-NO-FIELD');
    expect(r.out).not.toContain('GEN-FIELD-NO-ROW');
  });
  it('GREEN-BOTH: --write restores a hand-edited file byte for byte, and --check is then current', () => {
    const dir = sandbox();
    const before = GENERATED.map((f) => sha(dir, f));
    for (const rel of GENERATED) handEdit(dir, rel);
    expect(run(dir, '--write').status).toBe(0);
    expect(GENERATED.map((f) => sha(dir, f))).toEqual(before);
    expect(run(dir, '--check').status).toBe(0);
  });
});
