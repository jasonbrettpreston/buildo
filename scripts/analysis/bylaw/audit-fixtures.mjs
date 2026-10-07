// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 ("every named reason code has a known-bad fixture that
//            fails for that reason, plus a good twin"), §9 G-AUDIT; docs/specs/01-pipeline/69_mcbylaw_policy.md M-29
//
// In-memory fixtures for G-AUDIT (audit.mjs): a synthetic population shaped like the Phase 1 table (the seven EXT-*
// rows, ABS-1, the four 900.1.10 rows, the M-39 adjudicated row, ~100 standard rows), a bar at the M-29 floor, and an
// in-memory linear git history (commits as cumulative file maps) standing in for the witness. PURE: no I/O, no clock.

import crypto from 'node:crypto';
import { AUDIT_DIR_REL, BAR_REL, BAR_SCHEMA, auditSeed, buildPopulation, buildSampleRecord, drawSample, scoreAudit } from './audit.mjs';
import { stableStringify } from './snapshot.mjs';
import { fakeWitness } from './git-witness.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (x) => JSON.parse(JSON.stringify(x));
const ARCH = ['LIMIT', 'LIMIT', 'PERMIT', 'DEFINE', 'LIMIT', 'REQUIRE', 'PROHIBIT', 'DISAPPLY'];

/** A bar exactly at the M-29 floor. */
export function goodBar(seed = 'bar-seed-1') {
  return {
    basis: 'Spec 69 M-29',
    pass_bar: { agree_rate_min: 0.95, numeric_disagreements_max: 0 },
    reviewer_roles: ['city_zoning_examiner', 'rpp'],
    sample_size: 50,
    schema: BAR_SCHEMA,
    seed,
    strata: [
      { id: 'external', take: 'all' },
      { id: 'precedence_900_1_10', take: 'all' },
      { id: 'absence', take: 'all' },
      { id: 'provincial_direction', take: 'all' },
      { id: 'enacting_text', take: 'all' },
      { id: 'archetype', min_per_value: 1 },
      { id: 'numeric', min: 20 },
      { id: 'seeded', take: 'fill' },
    ],
  };
}
const barText = (bar) => stableStringify(bar);

/** {population, required, confirmations} built through buildPopulation from a synthetic table + seeds. */
export function fixturePopulation({ bump = null } = {}) {
  const rows = [];
  const row = (id, archetypes, numeric) => rows.push({ archetypes, content_sha256: sha(`${id}${bump === id ? ':bumped' : ''}`), has_numeric_expression: archetypes.includes('LIMIT'), numeric, regulation_id: id, row_status: 'complete' });
  for (let k = 1; k <= 4; k++) row(`900.1.10(${k})`, ['PROCEDURAL'], false);
  row('600.60.40(3)', ['PERMIT', 'REQUIRE', 'DEFINE', 'PROHIBIT'], true);
  for (let k = 1; k <= 100; k++) {
    const a = ARCH[k % ARCH.length];
    row(`10.${10 + (k % 5) * 10}.40.${k}(1)`, [a], a === 'LIMIT' || k % 3 === 0);
  }
  rows.push({ archetypes: ['LIMIT'], content_sha256: sha('pending'), has_numeric_expression: true, numeric: true, regulation_id: '10.5.40.1(1)', row_status: 'pending' });
  const external = { entries: ['EXT-gov-1', 'EXT-prov-1', 'EXT-risk-1', 'EXT-risk-2', 'EXT-risk-3', 'EXT-risk-4', 'EXT-risk-5'].map((id) => ({ id, kind: 'x', ...(id === 'EXT-prov-1' ? { provincial_units: [{ direction_basis: 'inferred', limits_bylaw: 'max_requirement', unit_id: 's.4(1)2' }, { direction_basis: 'verbatim', limits_bylaw: 'min_permission', unit_id: 's.5(1)1' }, { direction_basis: 'verbatim', limits_bylaw: 'min_permission', unit_id: 's.5(1)2' }] } : {}) })).concat([{ id: 'REF-1', kind: 'ref' }]) };
  const absence = { rulings: [{ id: 'ABS-1', expert_sample: true }] };
  const adjudications = { adjudications: [{ kind: 'consolidation_mismatch', unit: '600.60.40(3)(C)' }, { kind: 'disagreement', unit: '10.20.40.1(1)' }] };
  return buildPopulation({ rows, external, absence, adjudications });
}

/** Fill a record's results: all agree; `disagree` rows disagree (the first `numeric` of them on numeric_expression). */
export function withResults(rec, { disagree = 0, numeric = 0, missing = 0, dropConfirm = false, unresolved = false, invalid = 0 } = {}) {
  const r = clone(rec);
  const pop = new Map(r.population.map((x) => [x.id, x]));
  r.reviewer = { credential: 'RPP', organization: 'fixture', role: 'rpp' };
  r.results = {};
  for (const s of r.sample) {
    const x = pop.get(s.id);
    r.results[s.id] = { explanation: 'agree', numeric_expression: x.has_numeric_expression ? 'agree' : 'none', values: 'agree', ...(x.confirm.length ? { confirmations: Object.fromEntries(x.confirm.map((c) => [c, 'agree'])) } : {}) };
  }
  const numericRows = r.sample.map((s) => s.id).filter((id) => pop.get(id).has_numeric_expression);
  const otherRows = r.sample.map((s) => s.id).filter((id) => !pop.get(id).has_numeric_expression && !pop.get(id).confirm.length);
  const picks = [...numericRows.slice(0, numeric), ...otherRows.slice(0, disagree - numeric)];
  for (const [i, id] of picks.entries()) {
    const res = r.results[id];
    if (i < numeric) res.numeric_expression = 'disagree';
    else res.values = 'disagree';
    if (!unresolved) res.resolution = { kind: 'fixed', note: 'row fixed per the expert' };
  }
  for (const id of otherRows.slice(-missing || r.sample.length)) if (missing) delete r.results[id];
  if (dropConfirm) delete r.results['EXT-prov-1'].confirmations;
  for (const id of otherRows.slice(disagree, disagree + invalid)) r.results[id].values = 'maybe';
  return r;
}

/** A first-audit record with results, for scoreAudit. */
export function scoredRecord(opts = {}) {
  const bar = goodBar();
  const p = fixturePopulation();
  const { record } = buildSampleRecord({ bar, barText: barText(bar), population: p.population, required: p.required, date: '2026-10-07' });
  return withResults(record, opts);
}

/** The in-memory witness (git-witness.mjs fakeWitness). */
export const fakeRepo = fakeWitness;

const text = (rec) => stableStringify(rec);
const recPath = (rec) => `${AUDIT_DIR_REL}/${rec.date}-${rec.audit_n}.json`;

/** A chain of audits: outcomes = ['fail', 'pass', …]; each drawn by buildSampleRecord, committed (draw) then results. */
function chain(outcomes, { bar = goodBar(), pop = fixturePopulation(), ruling = 'M-99' } = {}) {
  const bt = barText(bar);
  const steps = [{ [BAR_REL]: bt }];
  const recs = [];
  for (const [i, o] of outcomes.entries()) {
    const n = i + 1;
    const { record } = buildSampleRecord({ bar, barText: bt, population: pop.population, required: pop.required, priorRecords: recs, date: '2026-10-07', operatorRuling: n >= 4 ? ruling : null });
    const done = withResults(record, o === 'fail' ? { disagree: 3 } : o === 'pending' ? { missing: 1 } : { disagree: 1 });
    steps.push({ [recPath(record)]: text(record) });
    steps.push({ [recPath(record)]: text(done) });
    recs.push(done);
  }
  return { bar, bt, pop, steps, recs };
}
const input = ({ bar, bt, pop, steps, recs }, over = {}) => ({
  bar,
  barText: bt,
  records: recs.map((r) => ({ path: recPath(r), text: text(r) })),
  population: pop.population,
  required: pop.required,
  witness: fakeRepo(steps),
  ...over,
});

/** Named gate scenarios for the state tests. */
export function gateScenario(name) {
  if (name === 'no_records') {
    const c = chain([]);
    return input(c);
  }
  if (name === 'awaiting_expert') return input(chain(['pending']));
  if (name === 'pass') return input(chain(['pass']));
  if (name === 'pass_row_changed') {
    const c = chain(['pass']);
    const moved = c.recs[0].sample.find((s) => s.strata.includes('seeded')).id;
    return input(c, { population: fixturePopulation({ bump: moved }).population });
  }
  if (name === 'fail') return input(chain(['fail']));
  if (name === 'reaudit_pass') return input(chain(['fail', 'pass']));
  if (name === 'uncommitted') {
    const c = chain(['pass']);
    c.steps = c.steps.slice(0, 1);
    return input(c);
  }
  throw new Error(`no scenario ${name}`);
}

/** {name, reason (null = good twin), twin_of, input}: one known-bad per G-AUDIT reason code + a good twin each. */
export function auditFixtures() {
  const f = [];
  const add = (reason, bad, good) => {
    f.push({ name: `bad: ${reason}`, reason, input: bad });
    f.push({ name: `good twin of ${reason}`, reason: null, twin_of: reason, input: good });
  };
  const pass = () => input(chain(['pass']));
  const re = () => input(chain(['fail', 'pass']));

  add('bar_missing', { ...pass(), bar: null, barText: null }, pass());
  {
    const bar = { ...goodBar(), sample_size: 40 };
    add('bar_invalid', { ...pass(), bar, barText: barText(bar) }, pass());
  }
  {
    const c = chain(['pass']);
    const r = clone(c.recs[0]);
    r.bar_blob = '0'.repeat(40);
    add('bar_changed', input(c, { records: [{ path: recPath(r), text: text(r) }] }), pass());
  }
  {
    const c = chain(['pass']);
    c.steps = [{ ...c.steps[0], ...c.steps[1] }, c.steps[2]]; // the bar and the draw in ONE commit
    add('bar_not_before_sample', input(c), pass());
  }
  add('witness_unavailable', { ...pass(), witness: { ...fakeRepo(chain(['pass']).steps), commitsTouching: () => null } }, pass());
  {
    const c = chain(['pass']);
    add('audit_numbering_gap', input(c, { records: [{ path: `${AUDIT_DIR_REL}/2026-10-08-1.json`, text: text(c.recs[0]) }] }), pass());
  }
  {
    const c = chain(['pass']);
    const first = JSON.parse(c.steps[1][recPath(c.recs[0])]);
    first.note = 'x';
    first.forced = ['10.20.40.1(1)']; // the first-committed draw differs from today's
    c.steps[1] = { [recPath(c.recs[0])]: text(first) };
    add('sample_rewritten', input(c), pass());
  }
  {
    const c = chain(['pass']);
    const r = clone(c.recs[0]);
    r.sample = r.sample.slice(0, 49);
    c.steps = [c.steps[0], { [recPath(r)]: text(r) }];
    add('sample_size_wrong', input(c, { records: [{ path: recPath(r), text: text(r) }] }), pass());
  }
  {
    // drawn with a seed that is not the bar's (reproducible from its own seed; strata met)
    const bar = goodBar();
    const pop = fixturePopulation();
    const bt = barText(bar);
    const { record } = buildSampleRecord({ bar: goodBar('other-seed'), barText: bt, population: pop.population, required: pop.required, date: '2026-10-07' });
    const done = withResults(record, { disagree: 1 });
    add('seed_wrong', input({ bar, bt, pop, steps: [{ [BAR_REL]: bt }, { [recPath(record)]: text(record) }, { [recPath(record)]: text(done) }], recs: [done] }), pass());
  }
  {
    // audit 2 after a PASS
    const c = chain(['pass']);
    const r2 = clone(c.recs[0]);
    Object.assign(r2, { audit_n: 2, seed: auditSeed(c.bar.seed, 2), forced: [], results: {}, reviewer: null });
    r2.sample = drawSample({ bar: c.bar, population: r2.population, required: r2.required, seed: r2.seed, forced: [] });
    const done = withResults(r2, { disagree: 1 });
    c.steps.push({ [recPath(r2)]: text(r2) }, { [recPath(r2)]: text(done) });
    c.recs.push(done);
    add('reaudit_without_fail', input(c), re());
  }
  {
    // audit 2 after a FAIL, drawn without the failed rows
    const c = chain(['fail']);
    const r2 = clone(c.recs[0]);
    Object.assign(r2, { audit_n: 2, seed: auditSeed(c.bar.seed, 2), forced: [], results: {}, reviewer: null });
    r2.sample = drawSample({ bar: c.bar, population: r2.population, required: r2.required, seed: r2.seed, forced: [] });
    const done = withResults(r2, { disagree: 1 });
    c.steps.push({ [recPath(r2)]: text(r2) }, { [recPath(r2)]: text(done) });
    c.recs.push(done);
    add('failed_rows_not_forced', input(c), re());
  }
  {
    // audit 4 after a third FAIL, with the operator ruling stripped from the draw (the producer itself refuses this)
    const c = chain(['fail', 'fail', 'fail', 'pass']);
    const p4 = recPath(c.recs[3]);
    for (const s of c.steps) if (s[p4]) s[p4] = text({ ...JSON.parse(s[p4]), operator_ruling: null });
    c.recs[3] = { ...c.recs[3], operator_ruling: null };
    add('operator_ruling_missing', input(c), input(chain(['fail', 'fail', 'fail', 'pass'])));
  }
  {
    // a required row that was eligible when drawn but is not in the sample
    const p = pass();
    const drawn = new Set(JSON.parse(p.records[0].text).sample.map((s) => s.id));
    const extra = p.population.find((x) => !drawn.has(x.id)).id;
    add('stratum_unmet', { ...p, required: [...p.required, extra] }, pass());
  }
  {
    const c = chain(['pass']);
    const r = clone(c.recs[0]);
    const pop = new Map(r.population.map((x) => [x.id, x]));
    const inS = new Set(r.sample.map((s) => s.id));
    const key = (x) => `${x.numeric}|${x.archetypes.join(',')}|${x.has_numeric_expression}`;
    const out = r.sample.find((s) => s.strata.length === 1 && s.strata[0] === 'seeded');
    const sub = r.population.find((x) => !inS.has(x.id) && key(x) === key(pop.get(out.id)) && !x.confirm.length);
    r.sample = r.sample.map((s) => (s.id === out.id ? { content_sha256: sub.content_sha256, id: sub.id, strata: ['seeded'] } : s)).sort((a, b) => (a.id < b.id ? -1 : 1));
    r.results[sub.id] = r.results[out.id];
    delete r.results[out.id];
    const draw = clone(r);
    draw.results = {};
    draw.reviewer = null;
    c.steps = [c.steps[0], { [recPath(r)]: text(draw) }, { [recPath(r)]: text(r) }];
    add('sample_not_reproducible', input(c, { records: [{ path: recPath(r), text: text(r) }] }), pass());
  }
  {
    const c = chain(['pass']);
    const r = withResults(c.recs[0], { disagree: 1, invalid: 1 });
    c.steps[2] = { [recPath(r)]: text(r) }; // the invalid verdict is the one first committed
    add('result_invalid', input(c, { records: [{ path: recPath(r), text: text(r) }] }), pass());
  }
  {
    const c = chain(['pass']);
    const r = clone(c.recs[0]);
    r.population[0].numeric = 'yes'; // not the closed shape
    add('record_malformed', input(c, { records: [{ path: recPath(r), text: text(r) }] }), pass());
  }
  {
    // the FAIL laundered in place: a later commit flips the expert's verdicts, the draw untouched
    const c = chain(['fail']);
    const r = withResults(c.recs[0], { disagree: 1 });
    c.steps.push({ [recPath(r)]: text(r) });
    add('results_rewritten', input(c, { records: [{ path: recPath(r), text: text(r) }] }), input(chain(['fail', 'pass'])));
  }
  {
    // two FAILs deleted, a fresh "audit 1" drawn: the history still holds the deleted records
    const c = chain(['fail', 'fail']);
    const p2 = recPath(c.recs[1]);
    const p1 = recPath(c.recs[0]);
    const fresh = withResults(c.recs[0], { disagree: 1 });
    const freshPath = `${AUDIT_DIR_REL}/2026-10-08-1.json`;
    const freshRec = { ...fresh, date: '2026-10-08' };
    const draw = { ...clone(freshRec), results: {}, reviewer: null };
    c.steps.push({ [p1]: null, [p2]: null }, { [freshPath]: text(draw) }, { [freshPath]: text(freshRec) });
    add('record_deleted', input(c, { records: [{ path: freshPath, text: text(freshRec) }] }), pass());
  }
  {
    // a PASS whose "fixed" row moved invalidates it: a re-audit is allowed, forcing that row in (no deadlock)
    const pop = fixturePopulation();
    const bar = goodBar();
    const bt = barText(bar);
    const { record: r1 } = buildSampleRecord({ bar, barText: bt, population: pop.population, required: pop.required, date: '2026-10-07' });
    const d1 = withResults(r1, { disagree: 1 });
    const fixedId = Object.entries(d1.results).find(([, x]) => x.values === 'disagree')[0];
    const pop2 = fixturePopulation({ bump: fixedId });
    const { record: r2 } = buildSampleRecord({ bar, barText: bt, population: pop2.population, required: pop2.required, priorRecords: [d1], date: '2026-10-08' });
    const d2 = withResults(r2, { disagree: 0 });
    const steps = [{ [BAR_REL]: bt }, { [recPath(r1)]: text(r1) }, { [recPath(r1)]: text(d1) }, { [recPath(r2)]: text(r2) }, { [recPath(r2)]: text(d2) }];
    f.push({ name: 'good: re-audit after an invalidated PASS', reason: null, twin_of: null, input: { bar, barText: bt, records: [d1, d2].map((x) => ({ path: recPath(x), text: text(x) })), population: pop2.population, required: pop2.required, witness: fakeWitness(steps) } });
  }
  {
    // verdicts arrive in two commits (add-only): fine; a committed verdict deleted later: results_rewritten
    const c = chain(['pass']);
    const full = c.recs[0];
    const half = clone(full);
    const keys = Object.keys(half.results).sort();
    for (const k of keys.slice(25)) delete half.results[k];
    const draw = c.steps[1];
    const p0 = recPath(full);
    f.push({ name: 'good: verdicts added in two commits', reason: null, twin_of: null, input: input({ ...c, steps: [c.steps[0], draw, { [p0]: text(half) }, { [p0]: text(full) }] }) });
    const dropped = clone(full);
    delete dropped.results[keys[0]];
    f.push({ name: 'bad: results_rewritten (a committed verdict deleted)', reason: 'results_rewritten', input: input({ ...c, steps: [...c.steps, { [p0]: text(dropped) }], recs: [dropped] }) });
  }
  add('audit_failed', input(chain(['fail'])), pass());
  return f;
}

/** For tests: score a chain's last record. */
export const lastScore = (name) => {
  const i = gateScenario(name);
  const r = JSON.parse(i.records.at(-1).text);
  return scoreAudit(r, i.bar);
};
