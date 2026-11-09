// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 0a (P1) and 11a.1 (Generation: "A row on in the switchboard yields a field set; off yields
//            none; off beats on"; dated note 2026-11-09), 11a.7 (labels are content),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-30 (every effective-ON catalogue row is a field; one ordered headline list per
//            scenario; one check; a headline row needs a label), FE-24 (dated note 2026-11-09: the GEN-* grammar), FE-18, FE-02,
//            docs/specs/01-pipeline/124_step_standard_policy.md §5 R-HM (generated outputs are never hand-edited).
//
// MF-13 · McFrontend queue. Locks of the catalogue-to-report generator scripts/surfaces/_schema/seed-report-v2.mjs (--check / --write), written RED first.
// Each case runs a COPY of the generator in a throwaway tree (the committed tree is never touched). A finding is one line `GEN-<CODE> <subject>` on stderr, exit 1.
// Cases marked GREEN-BOTH pass before and after the generator change (survive-the-fix locks). No DB, no network.
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
const FLAT = 'detached_house/flat_or_shallow_roof';
const PITCHED = 'detached_house/pitched';
const PLAIN = 'detached_house';

let tmpRoot = '';

const readJson = (dir: string, rel: string): Json => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const writeJson = (dir: string, rel: string, doc: Json): void => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), `${JSON.stringify(doc, null, 2)}\n`);
};
// A throwaway tree holding exactly what the generator reads. The authored files are created when the committed tree lacks them (the tip), so the
// cases fail at the designed assertion and not at a missing file.
const sandbox = (): string => {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'tree-'));
  fs.cpSync(path.join(ROOT, SCHEMA_DIR), path.join(dir, SCHEMA_DIR), { recursive: true });
  for (const rel of [CATALOGUE, SWITCHBOARD, Q7_LOG]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
  }
  if (!fs.existsSync(path.join(dir, PRES))) writeJson(dir, PRES, { [PLAIN]: [], [FLAT]: [], [PITCHED]: [] });
  if (!fs.existsSync(path.join(dir, LABELS))) writeJson(dir, LABELS, { gfa_flat_m2: 'GFA (flat roof)', gfa_pitched_m2: 'GFA (pitched roof)' });
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
// every catalogue row is ON in the committed switchboard (measured: 47 of 47)
const ON_IDS = (): string[] => catalogue().map((r) => r.id);

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf13-'));
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('G1 totality (FE-30, 126 11a.1)', () => {
  it('RED: the committed declaration holds one catalogue field per effective-ON row, in catalogue order, and not_in_report is empty', () => {
    const decl = readJson(ROOT, DECL);
    expect(catFieldsOf(ROOT).map((f) => f.name)).toEqual(ON_IDS());
    expect(catFieldsOf(ROOT)).toHaveLength(47);
    expect(decl.not_in_report).toEqual([]);
  });
  it('RED: one row switched OFF loses exactly that field and lands in not_in_report; back ON restores the bytes', () => {
    const dir = sandbox();
    setSwitch(dir, 'formula:height_max_m', 'on'); // normalise the file formatting the same way the later toggles do (the digest covers the file bytes)
    expect(run(dir, '--write').status).toBe(0);
    const on = snapshot(dir);
    setSwitch(dir, 'formula:height_max_m', 'off');
    expect(run(dir, '--write').status).toBe(0);
    const names = catFieldsOf(dir).map((f) => f.name);
    expect(names).not.toContain('height_max_m');
    expect(names).toHaveLength(ON_IDS().length - 1);
    expect(readJson(dir, DECL).not_in_report.map((n: Json) => n.field)).toEqual(['height_max_m']);
    setSwitch(dir, 'formula:height_max_m', 'on');
    expect(run(dir, '--write').status).toBe(0);
    expect(snapshot(dir)).toBe(on);
  });
});

describe('G2 off beats on (126 11a.1)', () => {
  it('RED: the building type OFF yields zero catalogue fields even with every row ON', () => {
    const dir = sandbox();
    setSwitch(dir, 'building_type:detached_house', 'off');
    expect(run(dir, '--write').status).toBe(0);
    expect(catFieldsOf(dir)).toEqual([]);
    expect(readJson(dir, DECL).not_in_report).toHaveLength(ON_IDS().length);
  });
  it('RED: a building type with no switch row: `GEN-ROW-NO-SWITCH building_type:detached_house`, exit 1, --write refuses', () => {
    const dir = sandbox();
    const before = snapshot(dir);
    setSwitch(dir, 'building_type:detached_house', 'delete');
    for (const mode of ['--check', '--write'] as const) {
      const r = run(dir, mode);
      expect(r.status).toBe(1);
      expect(r.err).toContain('GEN-ROW-NO-SWITCH building_type:detached_house');
    }
    expect(snapshot(dir)).toBe(before);
  });
});

describe('G3 a catalogue row with no switch row (fail closed)', () => {
  it('RED: `GEN-ROW-NO-SWITCH formula:<row>`, exit 1, and --write writes nothing', () => {
    const dir = sandbox();
    const before = snapshot(dir);
    setSwitch(dir, 'formula:front_setback_used_m', 'delete');
    const c = run(dir, '--check');
    expect(c.status).toBe(1);
    expect(c.err).toContain('GEN-ROW-NO-SWITCH formula:front_setback_used_m');
    const w = run(dir, '--write');
    expect(w.status).toBe(1);
    expect(w.err).toContain('GEN-ROW-NO-SWITCH formula:front_setback_used_m');
    expect(snapshot(dir)).toBe(before);
  });
});

describe('G3b a switch row whose state is not on or off (fail closed)', () => {
  it('RED: `GEN-ROW-BAD-STATE <switch id> <state>`, exit 1, nothing written, never treated as OFF', () => {
    for (const bad of ['ON', 'maybe', '']) {
      const dir = sandbox();
      const before = snapshot(dir);
      const sw = readJson(dir, SWITCHBOARD);
      sw.rows.find((r: Json) => r.id === 'formula:front_setback_used_m').state = bad;
      writeJson(dir, SWITCHBOARD, sw);
      for (const mode of ['--check', '--write'] as const) {
        const r = run(dir, mode);
        expect(r.status).toBe(1);
        expect(r.err).toContain(`GEN-ROW-BAD-STATE formula:front_setback_used_m ${bad}`);
      }
      expect(snapshot(dir)).toBe(before);
    }
  });
});

describe('G4 labels (126 11a.7, FE-30)', () => {
  it('RED: a labelled row carries its label; a detail row with no label shows its row id and is listed `labels owed: <id>` (exit 0)', () => {
    const dir = sandbox();
    const w = run(dir, '--write');
    expect(w.status).toBe(0);
    const by = Object.fromEntries(catFieldsOf(dir).map((f) => [f.name, f]));
    expect(Object.keys(by)).toContain('height_max_m'); // every effective-ON row is a field
    expect(by.gfa_flat_m2.label).toBe('GFA (flat roof)');
    expect(by.height_max_m.label).toBe('height_max_m');
    expect(owed(w.stdout)).toContain('height_max_m');
    expect(owed(w.stdout)).not.toContain('gfa_flat_m2');
    expect(owed(run(dir, '--check').stdout)).toContain('height_max_m');
  });
  it('RED: a fully labelled tree prints zero owed lines', () => {
    const dir = sandbox();
    setLabels(dir, Object.fromEntries(ON_IDS().map((id) => [id, `Label ${id}`])));
    const w = run(dir, '--write');
    expect(w.status).toBe(0);
    expect(catFieldsOf(dir)).toHaveLength(ON_IDS().length); // dead-man: the fields exist, so zero owed is not zero fields
    expect(owed(w.stdout)).toEqual([]);
  });
  it('RED: a headline row with no label is never on the owed list (it is the GEN-ROW-NO-LABEL failure)', () => {
    const dir = sandbox();
    setLists(dir, { [PLAIN]: ['height_max_m'], [FLAT]: [], [PITCHED]: [] });
    const c = run(dir, '--check');
    expect(c.status).toBe(1);
    expect(c.err).toContain('GEN-ROW-NO-LABEL height_max_m');
    expect(owed(c.stdout)).not.toContain('height_max_m');
  });
});

describe('G5 units and equality (126 11a.1, RS-1)', () => {
  it('RED: the unit table: m2 -> number m², m -> number m, storeys/units/ratio -> number with no unit, status form -> text', () => {
    const dir = sandbox();
    expect(run(dir, '--write').status).toBe(0);
    const by = Object.fromEntries(catFieldsOf(dir).map((f) => [f.name, f]));
    expect(Object.keys(by)).toHaveLength(ON_IDS().length);
    expect([by.gfa_max_m2.type, by.gfa_max_m2.unit]).toEqual(['number', 'm²']);
    expect([by.height_max_m.type, by.height_max_m.unit]).toEqual(['number', 'm']);
    for (const id of ['storeys_max', 'units_max', 'roof_pitch_a']) expect([by[id].type, by[id].unit]).toEqual(['number', undefined]);
    expect([by.permitted.type, by.permitted.unit]).toEqual(['text', undefined]);
    for (const f of Object.values(by) as Json[]) expect([f.status, f.render, f.path, f.source]).toEqual(['planned', 'rendered', `scenarios.cards[].${f.name}`, `catalogue:${f.name}`]);
  });
  it('RED: an unknown unit on an ON row: `GEN-UNIT-UNKNOWN <row> <unit>`, exit 1, nothing written', () => {
    const dir = sandbox();
    const before = snapshot(dir);
    const cat = readJson(dir, CATALOGUE);
    cat.rows.find((r: Json) => r.id === 'height_max_m').unit = 'furlong';
    writeJson(dir, CATALOGUE, cat);
    const w = run(dir, '--write');
    expect(w.status).toBe(1);
    expect(w.err).toContain('GEN-UNIT-UNKNOWN height_max_m furlong');
    expect(snapshot(dir)).toBe(before);
  });
  it('RED: the two existing gfa fields equal the committed ones except `note`', () => {
    const dir = sandbox();
    expect(run(dir, '--write').status).toBe(0);
    const old = Object.fromEntries(fieldsOf(readJson(ROOT, DECL)).filter((f) => f.source === 'catalogue:gfa_flat_m2' || f.source === 'catalogue:gfa_pitched_m2').map((f) => { const { note: _note, ...rest } = f; return [f.name, rest]; }));
    expect(Object.keys(old)).toHaveLength(2);
    for (const f of catFieldsOf(dir).filter((x) => x.name in old)) { const { note: _note, ...rest } = f; expect(rest).toEqual(old[f.name]); }
    expect(catFieldsOf(dir).map((f) => f.name)).toEqual(expect.arrayContaining(Object.keys(old)));
    expect(catFieldsOf(dir)).toHaveLength(ON_IDS().length); // dead-man: more than the two exist
  });
  it('GREEN-BOTH: report-schema.mjs --check (RS-0..RS-11) is green on the committed tree', () => {
    const r = spawnSync(process.execPath, ['scripts/analysis/report-schema.mjs', '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    expect(r.stdout + r.stderr).not.toMatch(/FAIL/);
    expect(r.status).toBe(0);
  });
});

describe('G7 stale versus hand edit (R-HM, FE-02)', () => {
  it('RED: an input change without --write is GEN-STALE (labels file, then the presentation file), never GEN-HAND-EDIT', () => {
    const labels = sandbox();
    expect(run(labels, '--write').status).toBe(0);
    setLabels(labels, { gfa_flat_m2: 'GFA, flat roof' });
    const a = run(labels, '--check');
    expect(a.status).toBe(1);
    expect(a.err).toContain(`GEN-STALE ${DECL}`);
    expect(a.err).not.toContain('GEN-HAND-EDIT');
    const lists = sandbox();
    expect(run(lists, '--write').status).toBe(0);
    setLists(lists, { [PLAIN]: [], [FLAT]: ['gfa_flat_m2'], [PITCHED]: [] });
    const b = run(lists, '--check');
    expect(b.status).toBe(1);
    expect(b.err).toContain(`GEN-STALE ${DECL}`);
    expect(b.err).not.toContain('GEN-HAND-EDIT');
  });
  it('RED: a hand edit of catalogue-fields.json is `GEN-HAND-EDIT <file>`', () => {
    const dir = sandbox();
    expect(run(dir, '--write').status).toBe(0);
    expect(fs.existsSync(path.join(dir, CATFIELDS))).toBe(true); // the generated seed file exists
    const doc = readJson(dir, CATFIELDS);
    doc.hand_edit = 'MF-13 probe';
    writeJson(dir, CATFIELDS, doc);
    const r = run(dir, '--check');
    expect(r.status).toBe(1);
    expect(r.err).toContain(`GEN-HAND-EDIT ${CATFIELDS}`);
    expect(r.err).not.toContain('GEN-STALE');
  });
});

describe('G8 determinism', () => {
  it('RED: two --write runs are byte-identical, and the field order is catalogue order', () => {
    const dir = sandbox();
    expect(run(dir, '--write').status).toBe(0);
    const first = snapshot(dir);
    expect(run(dir, '--write').status).toBe(0);
    expect(snapshot(dir)).toBe(first);
    expect(first).not.toContain('<missing>');
    expect(catFieldsOf(dir).map((f) => f.name)).toEqual(ON_IDS());
  });
});

describe('P1 unlisted = detail (D0-2)', () => {
  it('RED: a row in no list is still a field, in catalogue order, and --check exits 0', () => {
    const dir = sandbox();
    setLists(dir, { [PLAIN]: [], [FLAT]: [], [PITCHED]: [] });
    expect(run(dir, '--write').status).toBe(0);
    expect(catFieldsOf(dir).map((f) => f.name)).toEqual(ON_IDS());
    const c = run(dir, '--check');
    expect(c.status).toBe(0);
    expect(c.stdout).toContain('current');
  });
});

describe('P2 the one check (D0-5, C-1, C-2)', () => {
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
  it('RED: a listed row that does not exist: `GEN-LIST-NO-ROW <scenario> <row>`', () => {
    const dir = sandbox();
    setLists(dir, { [PLAIN]: ['no_such_row'], [FLAT]: [], [PITCHED]: [] });
    REFUSED(dir, `GEN-LIST-NO-ROW ${PLAIN} no_such_row`);
  });
  it('RED: a listed row that exists in another scenario (design option mismatch): `GEN-LIST-NO-ROW`', () => {
    const dir = sandbox();
    setLists(dir, { [PLAIN]: [], [FLAT]: [], [PITCHED]: ['gfa_flat_m2'] });
    REFUSED(dir, `GEN-LIST-NO-ROW ${PITCHED} gfa_flat_m2`);
  });
  it('RED (C-2 correction): a row with NO design option belongs to every scenario of its building type: it may lead the flat and the pitched card (and the plain one)', () => {
    const dir = sandbox();
    setLabels(dir, { gfa_max_m2: 'Counted GFA' });
    setLists(dir, { [PLAIN]: ['gfa_max_m2'], [FLAT]: ['gfa_max_m2'], [PITCHED]: ['gfa_max_m2'] });
    expect(run(dir, '--write').status).toBe(0);
    expect(run(dir, '--check').status).toBe(0);
  });
  it('GREEN-BOTH (C-2 correction): a pitched-only row in the flat list fails `GEN-LIST-NO-ROW`, and a flat-only row in the pitched list too', () => {
    const dir = sandbox();
    setLists(dir, { [PLAIN]: [], [FLAT]: ['gfa_pitched_a_m2'], [PITCHED]: [] });
    REFUSED(dir, `GEN-LIST-NO-ROW ${FLAT} gfa_pitched_a_m2`);
  });
  it('RED: a scenario no catalogue row carries: `GEN-LIST-NO-SCENARIO <scenario>`', () => {
    const dir = sandbox();
    setLists(dir, { [PLAIN]: [], [FLAT]: [], [PITCHED]: [], 'detached_house/pitchd': [] });
    REFUSED(dir, 'GEN-LIST-NO-SCENARIO detached_house/pitchd');
  });
  it('RED: a listed row switched OFF: `GEN-LIST-OFF <scenario> <row>` (row switch off, and separately the building type off)', () => {
    const a = sandbox();
    setLabels(a, { height_max_m: 'Height' });
    setLists(a, { [PLAIN]: ['height_max_m'], [FLAT]: [], [PITCHED]: [] });
    setSwitch(a, 'formula:height_max_m', 'off');
    REFUSED(a, `GEN-LIST-OFF ${PLAIN} height_max_m`);
    const b = sandbox();
    setLabels(b, { height_max_m: 'Height' });
    setLists(b, { [PLAIN]: ['height_max_m'], [FLAT]: [], [PITCHED]: [] });
    setSwitch(b, 'building_type:detached_house', 'off');
    REFUSED(b, `GEN-LIST-OFF ${PLAIN} height_max_m`);
  });
  it('RED: a listed row with no switch row reports `GEN-ROW-NO-SWITCH` only (it wins over GEN-LIST-OFF)', () => {
    const dir = sandbox();
    setLabels(dir, { height_max_m: 'Height' });
    setLists(dir, { [PLAIN]: ['height_max_m'], [FLAT]: [], [PITCHED]: [] });
    setSwitch(dir, 'formula:height_max_m', 'delete');
    REFUSED(dir, 'GEN-ROW-NO-SWITCH formula:height_max_m', ['GEN-LIST-OFF']);
  });
  it('RED: a row listed twice in one list: `GEN-LIST-DUP <scenario> <row>`', () => {
    const dir = sandbox();
    setLabels(dir, { height_max_m: 'Height' });
    setLists(dir, { [PLAIN]: ['height_max_m', 'height_max_m'], [FLAT]: [], [PITCHED]: [] });
    REFUSED(dir, `GEN-LIST-DUP ${PLAIN} height_max_m`);
  });
  it('RED: a clean list (listed rows exist in the scenario, are ON and labelled) exits 0 on --write then --check', () => {
    const dir = sandbox();
    setLabels(dir, { height_max_m: 'Height', permitted: 'Permitted' });
    setLists(dir, { [PLAIN]: ['permitted', 'height_max_m'], [FLAT]: ['gfa_flat_m2'], [PITCHED]: [] });
    expect(run(dir, '--write').status).toBe(0);
    expect(catFieldsOf(dir).map((f) => f.name)).toEqual(ON_IDS()); // dead-man: a clean list still emits every row
    expect(run(dir, '--check').status).toBe(0);
  });
});

describe('P3 headline label (D0-8)', () => {
  it('RED: a listed row with no label: `GEN-ROW-NO-LABEL <row>`, exit 1; with a label exits 0; the same row unlisted shows its id and exits 0', () => {
    const dir = sandbox();
    setLists(dir, { [PLAIN]: ['permitted'], [FLAT]: [], [PITCHED]: [] });
    const bad = run(dir, '--check');
    expect(bad.status).toBe(1);
    expect(bad.err).toContain('GEN-ROW-NO-LABEL permitted');
    expect(run(dir, '--write').status).toBe(1);
    setLabels(dir, { permitted: 'Permitted' });
    expect(run(dir, '--write').status).toBe(0);
    expect(catFieldsOf(dir).find((f) => f.name === 'permitted')?.label).toBe('Permitted');
    expect(run(dir, '--check').status).toBe(0);
    const unlisted = sandbox();
    const w = run(unlisted, '--write');
    expect(w.status).toBe(0);
    expect(catFieldsOf(unlisted).find((f) => f.name === 'permitted')?.label).toBe('permitted');
    expect(owed(w.stdout)).toContain('permitted');
  });
});

describe('P4 order is authored, not generated (D0-3)', () => {
  it('RED: a list [b, a] passes and every generated file equals the one for [a, b]', () => {
    const ab = sandbox();
    const ba = sandbox();
    for (const dir of [ab, ba]) setLabels(dir, { permitted: 'Permitted', height_max_m: 'Height' });
    setLists(ab, { [PLAIN]: ['permitted', 'height_max_m'], [FLAT]: [], [PITCHED]: [] });
    setLists(ba, { [PLAIN]: ['height_max_m', 'permitted'], [FLAT]: [], [PITCHED]: [] });
    expect(run(ab, '--write').status).toBe(0);
    expect(run(ba, '--write').status).toBe(0);
    expect(catFieldsOf(ab).find((f) => f.name === 'permitted')?.label).toBe('Permitted'); // dead-man: the listed rows are real fields
    // the authored list file is an input, so only its digest differs; nothing else (no order, no placement) is emitted
    const unDigest = (t: string): string => t.replace(/"inputs_sha256_16": "[0-9a-f]+"/, '"inputs_sha256_16": "-"');
    expect(unDigest(snapshot(ab))).toBe(unDigest(snapshot(ba)));
    expect(unDigest(snapshot(ab))).toContain('inputs_sha256_16'); // dead-man: the digest line exists to be normalised
  });
});
