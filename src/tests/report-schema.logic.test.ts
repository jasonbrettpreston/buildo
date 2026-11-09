// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-HM (drafted as R-RS: one field declaration per report
//            surface; this file is its lock, and runs report-schema.mjs --check and seed-report-v2.mjs --check);
//            docs/specs/02-web-admin/128_surface_standard_policy.md R-21 (one descriptor set, three renderers),
//            R-27 (one home; tables generated from it), R-17 + R-34 (a SLOT declares a FAIL, blocking disclosure);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.12 (closed disclosure codes) + §6.6 (display rules);
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.1 and scripts/surfaces/_schema/binding-sources.json (the closed
//            binding set every field binds to; MF-10, operator D-6 a and D-6+ a name the changed gates and tests here).
//
// Logic locks for scripts/analysis/report-schema.mjs — the generator that checks the v2 lot report's field names so the
// prototype, the API and the app cannot drift. Every gate is proven red on a mutated copy of the real inputs, and
// green on the committed tree. No DB, no network.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const GEN = 'scripts/analysis/report-schema.mjs';
const RS: Json = await import(pathToFileURL(path.join(ROOT, GEN)).href).catch((err: unknown) => ({ importError: String(err) }));

const fresh = (): Json => structuredClone(RS.loadInputs(ROOT));
const gate = (inputs: Json, id: string): Json => {
  const g = RS.evaluate(inputs).gates.find((x: Json) => x.id === id);
  if (!g) throw new Error(`no gate ${id}`);
  return g;
};
const allFields = (inputs: Json): Json[] => inputs.decl.sections.flatMap((s: Json) => s.fields);
const field = (inputs: Json, p: string): Json => {
  const f = allFields(inputs).find((x) => x.path === p);
  if (!f) throw new Error(`no field ${p}`);
  return f;
};

describe('report-schema generator: module surface', () => {
  it('loads and exports loadInputs / evaluate / run', () => {
    expect(RS.importError).toBeUndefined();
    expect(typeof RS.loadInputs).toBe('function');
    expect(typeof RS.evaluate).toBe('function');
    expect(typeof RS.run).toBe('function');
  });
});

describe('report-schema generator: the committed tree is green', () => {
  it('no gate FAILs; no pending row remains (RS-5 PASS)', () => {
    const ev = RS.evaluate(fresh());
    expect(ev.gates.filter((g: Json) => g.state === 'FAIL').map((g: Json) => `${g.id}: ${g.failing.join('; ')}`)).toEqual([]);
    expect(ev.gates.find((g: Json) => g.id === 'RS-5').state).toBe('PASS');
  });
  it('--check finds no drift in the generated outputs', async () => {
    const r = await RS.run({ root: ROOT, mode: 'check' });
    expect(r.drift).toEqual([]);
  });
});

describe('RS-1 closed binding set and members', () => {
  it('FAILs on a misspelled catalogue row id', () => {
    const inp = fresh();
    field(inp, 'scenarios.cards[].gfa_flat_m2').source = 'catalogue:gfa_flat_m22';
    const g = gate(inp, 'RS-1');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('gfa_flat_m22');
  });
  it('FAILs when the declared unit disagrees with the catalogue row (gfa_flat_m2 is m2)', () => {
    const inp = fresh();
    field(inp, 'scenarios.cards[].gfa_flat_m2').unit = 'm';
    expect(gate(inp, 'RS-1').failing.join('\n')).toContain('gfa_flat_m2');
  });
  it('FAILs when the payload key renames the catalogue row id', () => {
    const inp = fresh();
    const f = field(inp, 'scenarios.cards[].gfa_flat_m2');
    f.path = 'scenarios.cards[].gfa_flat_sqm';
    f.name = 'gfa_flat_sqm';
    expect(gate(inp, 'RS-1').state).toBe('FAIL');
  });
});

describe('RS-4 presentation keys both ways', () => {
  it('FAILs on an unknown presentation key', () => {
    const inp = fresh();
    field(inp, 'scenarios.cards[].trust_label').source = 'content:trust_labels';
    const g = gate(inp, 'RS-4');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('trust_labels');
  });
  it('FAILs on a registry key nothing references', () => {
    const inp = fresh();
    inp.presentation.orphan_key = { note: 'unused' };
    expect(gate(inp, 'RS-4').failing.join('\n')).toContain('orphan_key');
  });
});

describe('RS-5 no pending source', () => {
  it('FAILs a field that carries a pending source (a field with no source is left out, never pended)', () => {
    const inp = fresh();
    field(inp, 'scenarios.cards[].trust_label').source = 'pending:spec_owed:N11';
    const g = gate(inp, 'RS-5');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('scenarios.cards[].trust_label');
  });
  it('FAILs a card that carries a pending source', () => {
    const inp = fresh();
    inp.decl.cards.push({ code: 'X', scenario: 'x', kind: 'new_build', title: 'x', status: 'new', source: 'pending:row_owed:scenario:X' });
    expect(gate(inp, 'RS-5').failing.join('\n')).toContain('card X');
  });
  it('FAILs a proposed disclosure that names an unknown ruling', () => {
    const inp = fresh();
    inp.decl.proposed_disclosures.push({ code: 'x_code', ruling: 'Q-99', text: 'x' });
    expect(gate(inp, 'RS-5').failing.join('\n')).toContain('Q-99');
  });
  it('FAILs an operator_confirm form of pending as well', () => {
    const inp = fresh();
    field(inp, 'parcel.areas.lot_size_sqm').source = 'pending:operator_confirm:Q-7-scope';
    expect(gate(inp, 'RS-5').failing.join('\n')).toContain('parcel.areas.lot_size_sqm');
  });
});

describe('RS-6 disclosure codes', () => {
  it('FAILs on a disclosure code that is not in Spec 78 P5.12', () => {
    const inp = fresh();
    field(inp, 'scenarios.cards[].disclosure_texts[].code').disclosures = ['no_such_disclosure'];
    const g = gate(inp, 'RS-6');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('no_such_disclosure');
  });
  it('parses the P5.12 templates with slots, importance and mandatory', () => {
    const t = RS.disclosureTemplates(fresh().spec78);
    expect(t.get('front_yard_needs_survey')).toMatchObject({ mandatory: true, importance: 'high', slots: ['X'] });
    expect(t.get('holding_zone').slots).toEqual([]);
  });
});

describe('RS-7 display rules in the sample', () => {
  it('FAILs a sample value whose key is not a declared path', () => {
    const inp = fresh();
    inp.decl.samples[0].values['scenarios.not_declared'] = 1;
    const g = gate(inp, 'RS-7');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('scenarios.not_declared');
  });
  it('FAILs a sample with neither a headline nor a closed reason once the headline field is declared (§6.6 rule 5)', () => {
    const inp = fresh();
    expect(gate(inp, 'RS-7').state).toBe('PASS');
    const f = structuredClone(field(inp, 'scenarios.cards[].trust_label'));
    f.path = 'scenarios.headline.scenario';
    f.name = 'scenario';
    inp.decl.sections[0].fields.push(f);
    expect(gate(inp, 'RS-7').failing.join('\n')).toContain('headline');
  });
});

describe('RS-8 sponsored slots', () => {
  it('FAILs a placement without a FAIL+blocking disclosure (R-17, R-34)', () => {
    const inp = fresh();
    delete inp.presentation.ad_placements.placements[0].disclosure;
    expect(gate(inp, 'RS-8').state).toBe('FAIL');
  });
});

describe('RS-9 catalogue totality', () => {
  it('FAILs when a catalogue row is neither declared nor listed not_in_report', () => {
    const inp = fresh();
    for (const sec of inp.decl.sections) sec.fields = sec.fields.filter((x: Json) => x.source !== 'catalogue:front_setback_used_m'); // MF-13: the row is declared, so drop its field
    expect(gate(inp, 'RS-9').failing.join('\n')).toContain('front_setback_used_m');
  });
});

describe('RS-11 decided rulings pin the semi_half rules (Q-1/Q-2/Q-3)', () => {
  it('FAILs when the semi_half rules show new-build cards again (verify-13 N1)', () => {
    const inp = fresh();
    inp.presentation.lot_form_rules.semi_half.show_card_kinds = ['new_build', 'renovation'];
    const g = gate(inp, 'RS-11');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('Q-1');
  });
  it('FAILs when the suite add-on or the estimates come back (Q-3, Q-2)', () => {
    const inp = fresh();
    inp.presentation.lot_form_rules.semi_half.suite_add_on = true;
    inp.presentation.lot_form_rules.semi_half.existing_estimates = 'shown';
    const t = gate(inp, 'RS-11').failing.join('\n');
    expect(t).toContain('Q-3');
    expect(t).toContain('Q-2');
  });
});

describe('Q-7 scope', () => {
  it('no pending row remains: the Q-7 rows are left out until their parcels column and whitelist entry land, and the bound parcel facts read parcels columns', () => {
    const inp = fresh();
    expect(JSON.stringify(inp.decl)).not.toContain('pending:');
    expect(allFields(inp).some((f) => f.path.startsWith('parcel.lot.'))).toBe(false);
    expect(field(inp, 'parcel.areas.lot_size_sqm').source).toBe('parcels:lot_size_sqm');
  });
  it('FAILs a pending form once more (the same form the Q-7 rows used)', () => {
    const inp = fresh();
    field(inp, 'parcel.areas.lot_size_sqm').source = 'pending:spec100_amendment:Q-7';
    expect(gate(inp, 'RS-5').failing.join('\n')).toContain('parcel.areas.lot_size_sqm');
  });
});

describe('seed-report-v2 (provenance reproducible from the repo)', () => {
  it('--check: the committed decl / presentation / rulings reproduce from report-v2-seed/', () => {
    const r = spawnSync('node', ['scripts/surfaces/_schema/seed-report-v2.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('exits 2 without an explicit mode flag', () => {
    expect(spawnSync('node', ['scripts/surfaces/_schema/seed-report-v2.mjs'], { cwd: ROOT }).status).toBe(2);
  });
});

describe('CLI', () => {
  it('exits 2 on an unknown flag and on no mode flag', () => {
    expect(spawnSync('node', [GEN, '--chek'], { cwd: ROOT }).status).toBe(2);
    expect(spawnSync('node', [GEN], { cwd: ROOT }).status).toBe(2);
  });
});
