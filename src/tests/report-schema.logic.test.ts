// SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md R-21 (one descriptor set, three renderers),
//            R-27 (one home; tables generated from it), R-17 + R-34 (a SLOT declares a FAIL, blocking disclosure);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.12 (closed disclosure codes) + §6.6 (display rules);
//            docs/reference/maxbld-field-lineage.json (the lineage the report names must match).
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
  it('no gate FAILs; pending rows WARN', () => {
    const ev = RS.evaluate(fresh());
    expect(ev.gates.filter((g: Json) => g.state === 'FAIL').map((g: Json) => `${g.id}: ${g.failing.join('; ')}`)).toEqual([]);
    expect(ev.gates.find((g: Json) => g.id === 'RS-5').state).toBe('WARN');
  });
  it('--check finds no drift in the generated outputs', async () => {
    const r = await RS.run({ root: ROOT, mode: 'check' });
    expect(r.drift).toEqual([]);
  });
});

describe('RS-1 lineage names and types', () => {
  it('FAILs on a misspelled lineage field', () => {
    const inp = fresh();
    field(inp, 'scenarios.cards[].total_gfa_sqm').source = 'lineage:total_gfa_sqmm';
    const g = gate(inp, 'RS-1');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('total_gfa_sqmm');
  });
  it('FAILs when the declared type disagrees with lineage (main_storeys is an integer)', () => {
    const inp = fresh();
    field(inp, 'scenarios.cards[].main_storeys').type = 'number';
    expect(gate(inp, 'RS-1').failing.join('\n')).toContain('main_storeys');
  });
  it('FAILs when the payload key renames the lineage field', () => {
    const inp = fresh();
    const f = field(inp, 'scenarios.cards[].main_gfa_sqm');
    f.path = 'scenarios.cards[].main_floor_area';
    f.name = 'main_floor_area';
    expect(gate(inp, 'RS-1').state).toBe('FAIL');
  });
});

describe('RS-4 presentation keys both ways', () => {
  it('FAILs on an unknown presentation key', () => {
    const inp = fresh();
    field(inp, 'scenarios.cards[].trust_label').source = 'presentation:trust_labels';
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

describe('RS-5 pending rows', () => {
  it('FAILs a lineage_queue row once lineage has the field (stale pending)', () => {
    const inp = fresh();
    inp.lineage.fields.push({ field: 'avg_unit_gfa_sqm', type: 'numeric m²', scenarios: ['H'], trust_tier: 'bylaw_derived' });
    const g = gate(inp, 'RS-5');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('avg_unit_gfa_sqm');
  });
  it('FAILs a row still pending on a ruling the operator has decided (Q-5 is decided in the register)', () => {
    const inp = fresh();
    expect(inp.rulings.rulings.find((r: Json) => r.ref === 'Q-5').status).toBe('decided');
    field(inp, 'scenarios.cards[].market.comp_count_same_form').source = 'pending:operator_ruling:Q-5';
    expect(gate(inp, 'RS-5').failing.join('\n')).toContain('Q-5');
  });
  it('FAILs a spec100_amendment row once the S-001 whitelist carries its target', () => {
    const inp = fresh();
    expect(field(inp, 'parcel.lot.frontage_m').source).toBe('pending:spec100_amendment:Q-7');
    inp.consumer.whitelist.push('parcel.lot.frontage_m');
    expect(gate(inp, 'RS-5').failing.join('\n')).toContain('parcel.lot.frontage_m');
  });
  it('FAILs a pending row naming an unknown ruling', () => {
    const inp = fresh();
    field(inp, 'offers[].advertiser_name').source = 'pending:operator_ruling:Q-99';
    expect(gate(inp, 'RS-5').state).toBe('FAIL');
  });
});

describe('RS-6 disclosure codes', () => {
  it('FAILs on a disclosure code that is not in Spec 78 P5.12', () => {
    const inp = fresh();
    inp.decl.samples[1].cards[0].disclosures.push('no_such_disclosure');
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
  it('FAILs a new-build card on a lot whose effective form is semi_half (Q-1)', () => {
    const inp = fresh();
    inp.decl.samples[0].cards.push(structuredClone(inp.decl.samples[1].cards[0]));
    expect(gate(inp, 'RS-7').state).toBe('FAIL');
  });
  it('FAILs a rendered card in a hidden state (§6.6 rule 1)', () => {
    const inp = fresh();
    inp.decl.samples[1].cards[0].values.scenario_status = 'not_permitted:10.5.30.21(3)';
    expect(gate(inp, 'RS-7').state).toBe('FAIL');
  });
});

describe('RS-8 sponsored slots', () => {
  it('FAILs a placement without a FAIL+blocking disclosure (R-17, R-34)', () => {
    const inp = fresh();
    delete inp.presentation.ad_placements.placements[0].disclosure;
    expect(gate(inp, 'RS-8').state).toBe('FAIL');
  });
});

describe('RS-9 lineage totality', () => {
  it('FAILs when a lineage field is neither declared nor listed not_in_report', () => {
    const inp = fresh();
    inp.decl.not_in_report = inp.decl.not_in_report.filter((x: Json) => x.field !== 'roof_pitch');
    expect(gate(inp, 'RS-9').failing.join('\n')).toContain('roof_pitch');
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
  it('keeps only the approved list on spec100_amendment; the rest wait on operator_confirm', () => {
    const inp = fresh();
    expect(field(inp, 'parcel.lot.zone_label').source).toBe('pending:spec100_amendment:Q-7');
    expect(field(inp, 'parcel.lot.centroid_lat').source).toBe('pending:operator_confirm:Q-7-scope');
  });
  it('FAILs an operator_confirm row once the whitelist carries its target', () => {
    const inp = fresh();
    inp.consumer.whitelist.push('parcel.lot.exception_number');
    expect(gate(inp, 'RS-5').failing.join('\n')).toContain('parcel.lot.exception_number');
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
