// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.1 (a row on yields a field set; off beats on; dated note 2026-11-09),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-30 (every effective-ON catalogue row is a field; one headline list per scenario),
//            FE-24 dated note 2026-11-09 (the GEN-* grammar: no new code), the operator rulings of 2026-11-09 in ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
//            ("approve generator fix"; DL-21 a move 1 / Q2 a, C-2, C-4, D-1 b).
//
// MF-13 follow-up (lane E-GENLIST) · McFrontend queue. The generator scripts/surfaces/_schema/seed-report-v2.mjs reads a catalogue row's `building_type` as a LIST;
// a string is a one-item list. Written RED first. Each case runs a COPY of the generator in a throwaway tree (the committed tree is never touched).
// Cases marked GREEN-BOTH pass before and after the generator change. No DB, no network.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON documents
const ROOT = process.cwd();
const SCHEMA_DIR = 'scripts/surfaces/_schema';
const SEED = `${SCHEMA_DIR}/report-v2-seed`;
const GEN = `${SCHEMA_DIR}/seed-report-v2.mjs`;
const CATALOGUE = 'scripts/seeds/bylaw/layer3-catalogue.json';
const SWITCHBOARD = 'scripts/seeds/bylaw/switchboard.json';
const Q7_LOG = 'docs/reports/decisions/2026-10-20-chat-batch-b.json';
const DECL = `${SCHEMA_DIR}/report-v2.decl.json`;
const PRES = `${SEED}/row-presentation.json`;
const LABELS = `${SEED}/row-labels.json`;
const CATFIELDS = `${SEED}/catalogue-fields.json`;
const HOUSE = 'detached_house';
const PLEX = 'detached_houseplex';
const PLEX_FLAT = `${PLEX}/flat_or_shallow_roof`;
const PLEX_PITCHED = `${PLEX}/pitched`;
const HOUSE_PITCHED = `${HOUSE}/pitched`;
const HOUSE_FLAT = `${HOUSE}/flat_or_shallow_roof`;

let tmpRoot = '';

const readJson = (dir: string, rel: string): Json => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const writeJson = (dir: string, rel: string, doc: Json): void => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), `${JSON.stringify(doc, null, 2)}\n`);
};
const sandbox = (): string => {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'tree-'));
  fs.cpSync(path.join(ROOT, SCHEMA_DIR), path.join(dir, SCHEMA_DIR), { recursive: true });
  for (const rel of [CATALOGUE, SWITCHBOARD, Q7_LOG]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
  }
  // every case starts from the string form (the tip) whatever form the committed catalogue is in; toLists() makes it the list form
  const cat = readJson(dir, CATALOGUE);
  for (const r of cat.rows) r.building_type = HOUSE;
  writeJson(dir, CATALOGUE, cat);
  return dir;
};
const run = (dir: string, mode: '--check' | '--write'): { status: number | null; err: string; stdout: string } => {
  const r = spawnSync(process.execPath, [path.join(dir, GEN), mode], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  return { status: r.status, err: r.stderr, stdout: r.stdout };
};
const fieldsOf = (decl: Json): Json[] => decl.sections.flatMap((s: Json) => s.fields);
const catFieldsOf = (dir: string): Json[] => fieldsOf(readJson(dir, DECL)).filter((f) => String(f.source).startsWith('catalogue:'));
const owed = (stdout: string): string[] => stdout.split('\n').filter((l) => l.startsWith('labels owed: ')).map((l) => l.slice('labels owed: '.length));
const snapshot = (dir: string): string => {
  const files = [DECL, `${SCHEMA_DIR}/report-presentation.json`, `${SCHEMA_DIR}/report-v2.rulings.json`, CATFIELDS];
  return files.map((f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '<missing>')).join('\n#####\n');
};
const setSwitch = (dir: string, id: string, state: 'on' | 'off' | 'delete'): void => {
  const sw = readJson(dir, SWITCHBOARD);
  if (state === 'delete') sw.rows = sw.rows.filter((r: Json) => r.id !== id);
  else sw.rows.find((r: Json) => r.id === id).state = state;
  writeJson(dir, SWITCHBOARD, sw);
};
const setLists = (dir: string, lists: Json): void => writeJson(dir, PRES, lists);
const setLabels = (dir: string, extra: Json): void => writeJson(dir, LABELS, { ...readJson(dir, LABELS), ...extra });
const catalogue = (): Json[] => readJson(ROOT, CATALOGUE).rows;
const ROW_IDS = (): string[] => catalogue().map((r) => r.id);

// DL-21 a / Q2 a: every row lists both types. `only` keeps the list form for those rows and leaves the rest as they are (a mixed catalogue).
const toLists = (dir: string, only?: (r: Json) => boolean): void => {
  const cat = readJson(dir, CATALOGUE);
  for (const r of cat.rows) if (!only || only(r)) r.building_type = [HOUSE, PLEX];
  writeJson(dir, CATALOGUE, cat);
  const sw = readJson(dir, SWITCHBOARD);
  if (!sw.rows.some((r: Json) => r.id === `building_type:${PLEX}`)) {
    sw.rows.unshift({ id: `building_type:${PLEX}`, kind: 'building_type', state: 'on', ruling: 'LC-16; M-160', reason: 'increment 3 building type' });
    writeJson(dir, SWITCHBOARD, sw);
  }
};
// the committed headline lists name house rows; the houseplex scenarios carry none (C-4)
const listsFor = (extra: Json = {}): Json => ({ [HOUSE]: [], [HOUSE_FLAT]: [], [HOUSE_PITCHED]: [], ...extra });
const REFUSED = (dir: string, token: string, only: string[] = []): void => {
  const before = snapshot(dir);
  const c = run(dir, '--check');
  expect(c.status).toBe(1);
  expect(c.err).toContain(token);
  for (const other of only) expect(c.err).not.toContain(other);
  const w = run(dir, '--write');
  expect(w.status).toBe(1);
  expect(w.err).toContain(token);
  expect(snapshot(dir)).toBe(before);
};

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genlist-'));
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('L1 a list is read (DL-21 a, FE-30)', () => {
  it('RED: every row lists both types: --write exits 0, one field per ROW (not per row and type), in catalogue order; --check exits 0', () => {
    const dir = sandbox();
    toLists(dir);
    setLists(dir, listsFor());
    const w = run(dir, '--write');
    expect(w.err).toBe('');
    expect(w.status).toBe(0);
    expect(catFieldsOf(dir).map((f) => f.name)).toEqual(ROW_IDS());
    expect(new Set(catFieldsOf(dir).map((f) => f.path)).size).toBe(ROW_IDS().length);
    expect(readJson(dir, DECL).not_in_report).toEqual([]);
    expect(run(dir, '--check').status).toBe(0);
  });
  it('RED: a string row is a one-item list: the string tree and the list tree emit the same catalogue fields, byte for byte', () => {
    const a = sandbox();
    expect(run(a, '--write').status).toBe(0);
    const b = sandbox();
    toLists(b);
    setLists(b, readJson(a, PRES)); // the committed lists name house scenarios only
    expect(run(b, '--write').status).toBe(0);
    expect(fs.readFileSync(path.join(b, CATFIELDS), 'utf8')).toBe(fs.readFileSync(path.join(a, CATFIELDS), 'utf8'));
    expect(catFieldsOf(b)).toEqual(catFieldsOf(a));
  });
});

describe('L2 one scenario per (building type, design option)', () => {
  it('RED: the houseplex plain, flat and pitched scenarios are valid headline keys; an option no row carries is GEN-LIST-NO-SCENARIO', () => {
    const dir = sandbox();
    toLists(dir);
    setLists(dir, listsFor({ [PLEX]: [], [PLEX_FLAT]: [], [PLEX_PITCHED]: [] }));
    expect(run(dir, '--write').status).toBe(0);
    expect(run(dir, '--check').status).toBe(0);
    setLists(dir, listsFor({ [PLEX]: [], [PLEX_FLAT]: [], [PLEX_PITCHED]: [], [`${PLEX}/hip`]: [] }));
    REFUSED(dir, `GEN-LIST-NO-SCENARIO ${PLEX}/hip`);
  });
  it('GREEN-BOTH: a houseplex scenario on a catalogue of string rows is GEN-LIST-NO-SCENARIO', () => {
    const dir = sandbox();
    setLists(dir, listsFor({ [PLEX_PITCHED]: [] }));
    REFUSED(dir, `GEN-LIST-NO-SCENARIO ${PLEX_PITCHED}`);
  });
});

describe('L3 C-2 per listed type', () => {
  it('RED: a row with no design option leads the plain, flat and pitched lists of EACH listed type', () => {
    const dir = sandbox();
    toLists(dir);
    setLabels(dir, { gfa_max_m2: 'Counted GFA' });
    const lead = ['gfa_max_m2'];
    setLists(dir, { [HOUSE]: lead, [HOUSE_FLAT]: lead, [HOUSE_PITCHED]: lead, [PLEX]: lead, [PLEX_FLAT]: lead, [PLEX_PITCHED]: lead });
    expect(run(dir, '--write').status).toBe(0);
    expect(run(dir, '--check').status).toBe(0);
  });
  it('RED: a row with a design option belongs to its own option of each listed type only', () => {
    const dir = sandbox();
    toLists(dir);
    setLists(dir, listsFor({ [PLEX_FLAT]: ['gfa_pitched_a_m2'] }));
    REFUSED(dir, `GEN-LIST-NO-ROW ${PLEX_FLAT} gfa_pitched_a_m2`);
  });
  it('RED: a row that lists only the house is not in a houseplex scenario (mixed catalogue: a string row beside list rows)', () => {
    const dir = sandbox();
    toLists(dir, (r) => r.id !== 'gfa_max_m2');
    setLists(dir, listsFor({ [PLEX]: ['gfa_max_m2'] }));
    REFUSED(dir, `GEN-LIST-NO-ROW ${PLEX} gfa_max_m2`);
  });
});

describe('L4 off beats on, per type (126 11a.1)', () => {
  it('RED: one listed type OFF removes the row from that type only: every row stays a field while the other type is ON', () => {
    const dir = sandbox();
    toLists(dir);
    setLists(dir, listsFor());
    setSwitch(dir, `building_type:${PLEX}`, 'off');
    expect(run(dir, '--write').status).toBe(0);
    expect(catFieldsOf(dir).map((f) => f.name)).toEqual(ROW_IDS());
  });
  it('RED: every listed type OFF yields zero catalogue fields, all in not_in_report', () => {
    const dir = sandbox();
    toLists(dir);
    setLists(dir, listsFor());
    setSwitch(dir, `building_type:${PLEX}`, 'off');
    setSwitch(dir, `building_type:${HOUSE}`, 'off');
    expect(run(dir, '--write').status).toBe(0);
    expect(catFieldsOf(dir)).toEqual([]);
    expect(readJson(dir, DECL).not_in_report).toHaveLength(ROW_IDS().length);
  });
  it('RED: a listed row of an OFF type is GEN-LIST-OFF for that type\'s scenario and for no other', () => {
    const dir = sandbox();
    toLists(dir);
    setLabels(dir, { height_max_m: 'Height' });
    setLists(dir, listsFor({ [PLEX]: ['height_max_m'] }));
    setSwitch(dir, `building_type:${PLEX}`, 'off');
    REFUSED(dir, `GEN-LIST-OFF ${PLEX} height_max_m`, [`GEN-LIST-OFF ${HOUSE} `]);
  });
  it('RED: house OFF, houseplex ON: a row listed under a house scenario is GEN-LIST-OFF although it is still a field via houseplex', () => {
    const dir = sandbox();
    toLists(dir);
    setLabels(dir, { height_max_m: 'Height' });
    setLists(dir, listsFor({ [HOUSE]: ['height_max_m'] }));
    setSwitch(dir, `building_type:${HOUSE}`, 'off');
    REFUSED(dir, `GEN-LIST-OFF ${HOUSE} height_max_m`, [`GEN-LIST-OFF ${PLEX}`]);
  });
  it('RED: an empty building_type list is never a silent drop: GEN-ROW-NO-SWITCH, nothing written', () => {
    const dir = sandbox();
    toLists(dir);
    setLists(dir, listsFor());
    const cat = readJson(dir, CATALOGUE);
    cat.rows[0].building_type = [];
    writeJson(dir, CATALOGUE, cat);
    REFUSED(dir, 'GEN-ROW-NO-SWITCH');
  });
  it('RED: a listed type with no switch row: exactly `GEN-ROW-NO-SWITCH building_type:<type>`, nothing written', () => {
    const dir = sandbox();
    toLists(dir);
    setLists(dir, listsFor());
    setSwitch(dir, `building_type:${PLEX}`, 'delete');
    REFUSED(dir, `GEN-ROW-NO-SWITCH building_type:${PLEX}`, ['building_type:detached_house,']);
  });
});

describe('L5 houseplex scenarios ship with empty headline lists (C-4, D-1 b)', () => {
  it('RED: no houseplex list: --write exits 0 and each unlabelled row prints once as `labels owed`, never twice', () => {
    const dir = sandbox();
    toLists(dir);
    setLists(dir, listsFor());
    const w = run(dir, '--write');
    expect(w.status).toBe(0);
    const o = owed(w.stdout);
    expect(new Set(o).size).toBe(o.length);
    expect(o).toContain('gfa_max_m2');
    expect(o).not.toContain('gfa_flat_m2');
  });
});
