// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (the five lines: common fields, per-line extensions,
//            gate state pass · fail · not_run — a gate not run is never a PASS; on-demand gates count as run only when
//            bound to the current snapshot; row state; "pending never fails a gate"; a word PASSes when every pre-commit
//            gate under it passes and no row it covers is failed; PHASE 1: DONE|NOT_DONE), §8 rule 8 (a frozen gate
//            registry whose keys equal the fixture providers both ways; the word verdict derived only from gate results
//            and computed row states), §9 (13 gates; exit 2 structural or a gate threw (named) · 1 drift, a failed row or
//            a gate failure · 0 pass; a report-only arm never changes the exit code), §12 (order: schema-load → G-PROV →
//            slice, G-TEXT → G-UNIVERSE → G-CLAUSE, G-XREF, G-READ, G-AGREE, G-EVAL → G-CODE → G-SHAPE → render →
//            G-DRIFT → five lines); docs/specs/01-pipeline/69_mcbylaw_policy.md M-32 (pre-commit `--check`), M-45 (absent
//            and stale rows are pending), M-52 (feeds counts), M-54 note (absence-rulings.json into the evaluator context);
//            docs/reports/mcbylaw-phase1-plan.md S7 (five lines, --validate, --plan-batches), S8 (--check / --self-test;
//            each gate run once on the REAL snapshot)
//
// The validator: loads the committed inputs ONCE (one slice), runs every gate module, computes row states, renders in
// memory and byte-compares (G-DRIFT), and derives the five lines. Arm states are closed: pass · fail · not_run ·
// vacuous. `vacuous` = an arm whose input is empty (e.g. the keyer-provenance arm with 0 authored shards): it never
// makes a gate pass on its own, and once its input exists an unbuilt arm is `not_run`. A gate whose module is not built
// yet (G-CLAUSE, G-XREF, G-AGREE; S6) is `not_run`, never a PASS (Spec 79's rule).

import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './clock.mjs';
import { changeGateState } from './change.mjs';
import { checkCensus } from './census.mjs';
import { buildReportFromTree, FINDINGS_PATH, selfTest as codeLinkSelfTest } from './code-link.mjs';
import { checkDefinitions, loadFidelity, selfTest as definitionsSelfTest } from './definitions.mjs';
import { checkEval, selfTest as evaluateSelfTest } from './evaluate.mjs';
import { checkExternalFile, selfTest as externalSelfTest } from './external.mjs';
import { checkProvAll, checkRulingCitations, selfTest as observableSelfTest } from './observable.mjs';
import { buildTable, escapeMd, JSON_REL, MD_REL, readCommitted, renderAll, renderJson, renderMarkdown, writeFiles } from './render.mjs';
import { loadSnapshotPages, sliceSnapshot } from './slice.mjs';
import { cmpSection, sha256 } from './snapshot.mjs';
import { checkTextSlice, LOCK_FILE, selfTest as standardizedSelfTest } from './standardized.mjs';
import { checkUniverse, universeInputs, selfTest as universeSelfTest } from './universe.mjs';
import { checkFeedsTotality, checkVocab, evaluatorVocab, selfTest as vocabSelfTest } from './vocab.mjs';

export const WORDS = Object.freeze(['STANDARDIZED', 'OBSERVABLE', 'ACCURATE', 'UNDERSTANDABLE', 'SCALABLE']);
export const GATE_STATES = Object.freeze(['pass', 'fail', 'not_run']);
export const ARM_STATES = Object.freeze(['pass', 'fail', 'not_run', 'vacuous']);

const deepFreeze = (o) => {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

/**
 * The 13 Phase 1 gates (Spec 68 §9), in the order the five lines read them. `built` = a module computes it here;
 * `selfTests` = the in-memory known-bad fixture providers (SELF_TESTS keys) that prove its reason codes fire.
 */
export const GATES = deepFreeze([
  { id: 'G-TEXT', word: 'STANDARDIZED', when: 'pre-commit', built: true, selfTests: ['standardized'] },
  { id: 'G-SHAPE', word: 'STANDARDIZED', when: 'pre-commit', built: true, selfTests: ['vocab'] },
  { id: 'G-PROV', word: 'OBSERVABLE', when: 'pre-commit', built: true, selfTests: ['observable'] },
  { id: 'G-DRIFT', word: 'OBSERVABLE', when: 'pre-commit', built: true, selfTests: ['render'] },
  { id: 'G-CLAUSE', word: 'ACCURATE', when: 'pre-commit', built: false, selfTests: [] },
  { id: 'G-XREF', word: 'ACCURATE', when: 'pre-commit', built: false, selfTests: [] },
  { id: 'G-AGREE', word: 'ACCURATE', when: 'pre-commit', built: false, selfTests: [] },
  { id: 'G-EVAL', word: 'ACCURATE', when: 'pre-commit', built: true, selfTests: ['evaluate'] },
  { id: 'G-CODE', word: 'ACCURATE', when: 'pre-commit', built: true, selfTests: ['code-link'] },
  { id: 'G-READ', word: 'UNDERSTANDABLE', when: 'pre-commit', built: true, selfTests: ['definitions', 'external'] },
  { id: 'G-UNIVERSE', word: 'SCALABLE', when: 'pre-commit', built: true, selfTests: ['universe'] },
  { id: 'G-CHANGE', word: 'SCALABLE', when: 'on_demand', built: true, selfTests: [] },
  { id: 'G-AUDIT', word: 'SCALABLE', when: 'on_demand', built: false, selfTests: [] },
]);

/** Fixture providers: name → () => {pass, results?|violations?}. Keys must equal the union of GATES[].selfTests. */
const SELF_TESTS = Object.freeze({
  standardized: () => standardizedSelfTest(),
  vocab: () => vocabSelfTest(),
  observable: () => observableSelfTest(),
  render: () => renderSelfTest(),
  evaluate: (ctx) => evaluateSelfTest(evaluatorVocab(ctx.vocab)),
  'code-link': () => codeLinkSelfTest(),
  definitions: () => definitionsSelfTest(),
  external: () => ({ pass: externalSelfTest() > 0 }), // throws on the first failing case
  universe: () => universeSelfTest(),
});

/** Registry ⇄ fixture providers, both directions (Spec 68 §8 rule 8). PURE. */
export function registryViolations(gates = GATES, providers = Object.keys(SELF_TESTS)) {
  const v = [];
  const used = new Set();
  for (const g of gates) {
    if (!WORDS.includes(g.word)) v.push(`registry: ${g.id} word ${g.word} is not one of the five`);
    if (g.built && g.when === 'pre-commit' && g.selfTests.length === 0) v.push(`registry: built pre-commit gate ${g.id} names no fixture provider`);
    for (const s of g.selfTests) {
      used.add(s);
      if (!providers.includes(s)) v.push(`registry: ${g.id} names fixture provider ${s}, which does not exist`);
    }
  }
  for (const p of providers) if (!used.has(p)) v.push(`registry: fixture provider ${p} belongs to no gate`);
  if (gates.length !== 13) v.push(`registry: ${gates.length} gates, Spec 68 §9 names 13`);
  const ids = gates.map((g) => g.id);
  for (const id of ids.filter((x, i) => ids.indexOf(x) !== i)) v.push(`registry: gate id ${id} repeated`);
  for (const g of gates) if (!['pre-commit', 'on_demand'].includes(g.when)) v.push(`registry: ${g.id} when ${g.when} is not pre-commit | on_demand`);
  for (const w of WORDS) if (!gates.some((g) => g.word === w && g.when === 'pre-commit')) v.push(`registry: word ${w} has no pre-commit gate (its PASS would be vacuous)`);
  return v;
}

// ---------------------------------------------------------------- arms → gate state

/** fail if any arm failed; else not_run if any arm did not run or nothing ran; else pass. PURE. */
export function combineArms(arms) {
  if (arms.some((a) => a.state === 'fail')) return 'fail';
  if (arms.some((a) => a.state === 'not_run')) return 'not_run';
  return arms.some((a) => a.state === 'pass') ? 'pass' : 'not_run';
}

const arm = (name, state, violations = [], notes = [], extra = {}) => {
  if (!ARM_STATES.includes(state)) throw new Error(`arm ${name}: state ${JSON.stringify(state)} is outside ${ARM_STATES.join(' · ')}`);
  return { checked: null, ...extra, name, state, violations, notes };
};
const fromCheck = (name, r, extra = {}) => arm(name, r.pass ? 'pass' : 'fail', r.violations || [], [], { checked: r.checked ?? null, ...extra });
const fromStatus = (name, r) => arm(name, r.status, r.status === 'fail' ? r.violations || [] : [], [...(r.notes || []), ...(r.status === 'not_run' ? r.violations || [] : [])], { checked: r.checked ?? null });
/** An arm not built yet: vacuous while its input is empty, not_run once it is not. */
const unbuilt = (name, inputCount, what) => arm(name, inputCount === 0 ? 'vacuous' : 'not_run', [], [`${inputCount === 0 ? 'vacuous (0 inputs)' : `not built, ${inputCount} input(s) unchecked`}: ${what}`]);

// ---------------------------------------------------------------- five lines

/** {pass, run, total}: run = pass + fail; not_run is never counted as run or pass. PURE. */
export function gateTally(gates) {
  const states = GATES.map((g) => (gates[g.id] ? gates[g.id].state : 'not_run'));
  return { pass: states.filter((s) => s === 'pass').length, run: states.filter((s) => s !== 'not_run').length, total: GATES.length };
}

/** Word → PASS|FAIL: every pre-commit gate under it passes and no row is failed (pending never FAILs a word). PURE. */
export function wordVerdicts(gates, counts) {
  const out = {};
  for (const w of WORDS) {
    const pre = GATES.filter((g) => g.word === w && g.when === 'pre-commit');
    out[w] = counts.failed === 0 && pre.every((g) => gates[g.id] && gates[g.id].state === 'pass') ? 'PASS' : 'FAIL';
  }
  return out;
}

/**
 * The five `--validate` lines + `PHASE 1: DONE|NOT_DONE` (Spec 68 §4). `counts` = {in_scope, complete, pending, stale,
 * failed, draft_failures, disagreements, disclosed_defects}; `extras` = {snapshot_age_days, max_snapshot_age_days,
 * findings{ii, iv_unmapped}, eval_mismatches_adjudicated, expert_rulings_against, agreement_rate (null ⇒ n/a)}. PURE.
 */
export function fiveLines({ gates, counts: c, extras: x }) {
  const t = gateTally(gates);
  const v = wordVerdicts(gates, c);
  const common = `complete ${c.complete} / in_scope ${c.in_scope}; pending ${c.pending} (stale ${c.stale}); failed ${c.failed}; draft_failures ${c.draft_failures ?? 'unknown'}; disagreements ${c.disagreements ?? 'unknown'}; disclosed_defects ${c.disclosed_defects}; gates pass ${t.pass} / run ${t.run} / total ${t.total}`;
  const age = x.snapshot_age_days;
  const ext = {
    OBSERVABLE: `; snapshot_age_days ${age === null || age === undefined ? 'unknown' : age}${typeof age === 'number' && age > x.max_snapshot_age_days ? ` WARN>${x.max_snapshot_age_days}` : ''}`,
    ACCURATE: `; findings ${x.findings.ii + x.findings.iv_unmapped} (ii ${x.findings.ii} · iv unmapped ${x.findings.iv_unmapped}); eval_mismatches_adjudicated ${x.eval_mismatches_adjudicated}; expert_rulings_against ${x.expert_rulings_against}; agreement_rate ${x.agreement_rate === null || x.agreement_rate === undefined ? 'n/a' : x.agreement_rate.toFixed(3)} agreement≠correctness; code_linkage=declared-only`,
  };
  const lines = WORDS.map((w) => `${w}: ${v[w]} (${common}${ext[w] || ''})`);
  const done = WORDS.every((w) => v[w] === 'PASS') && c.pending === 0 && c.stale === 0 && c.failed === 0 && t.run === t.total && t.pass === t.total && gates['G-AUDIT'] && gates['G-AUDIT'].state === 'pass';
  lines.push(`PHASE 1: ${done ? 'DONE' : 'NOT_DONE'}`);
  return lines;
}

/** 2 if a gate threw (structural) · 1 drift, a failed row or a gate failure · 0. `reportOnly` never matters. PURE. */
export function exitCode({ gates, counts, drift }) {
  const g = Object.values(gates);
  if (g.some((x) => x.error)) return 2;
  if (g.some((x) => x.state === 'fail') || counts.failed > 0 || (drift && drift.length > 0)) return 1;
  return 0;
}

// ---------------------------------------------------------------- --plan-batches

/**
 * A1..A7 membership from the plan's batch text (docs/reports/mcbylaw-phase1-plan.md A1..A7). PROVISIONAL: the plan
 * names the batches, not a rule; these rules read it literally and A6 ("existing-building, permission and
 * informational rows") takes every in-scope row no other batch names, because `relevance` is not generated yet.
 */
export const BATCH_RULES = deepFreeze([
  { id: 'A1', label: 'RD/RS/RT/RM + 10.5 principal-building envelope', sections: ['10.20', '10.40', '10.60', '10.80'], articles: ['10.5.40'] },
  { id: 'A2', label: 'R zone', sections: ['10.10'] },
  { id: 'A3', label: '10.5.60 ancillary + 150.7 / 150.8 / 150.10', sections: ['150.7', '150.8', '150.10'], articles: ['10.5.60'] },
  { id: 'A4', label: 'used definitions + input fidelity', kinds: ['definition'] },
  { id: 'A5', label: 'Ch.5 subset + 200.5', chapters: ['5'], sections: ['200.5'] },
  { id: 'A6', label: 'existing-building, permission and informational rows (every in-scope row no other batch names)', rest: true },
  { id: 'A7', label: '900.1 + 1.5.7(1) + 600.60 overlay rows', sections: ['900.1', '600.60'], regulation_ids: ['1.5.7(1)'] },
]);

const underArticle = (article, prefix) => article === prefix || String(article).startsWith(`${prefix}.`);
function batchOf(r) {
  for (const b of BATCH_RULES) {
    if (b.rest) continue;
    if ((b.kinds || []).includes(r.kind)) return b.id;
    if ((b.regulation_ids || []).includes(r.regulation_id)) return b.id;
    if (r.kind === 'definition') continue; // definitions belong to A4 only
    if ((b.sections || []).includes(r.section)) return b.id;
    if ((b.chapters || []).includes(String(r.section).split('.')[0])) return b.id;
    if ((b.articles || []).some((p) => underArticle(r.article, p))) return b.id;
  }
  return 'A6';
}

/** {batches: [{id, label, rows[], shards[] (articles)}]} over in-scope rows; each row in exactly one batch. PURE. */
export function planBatches({ scoped }) {
  const by = new Map(BATCH_RULES.map((b) => [b.id, { id: b.id, label: b.label, rows: [], shards: new Set() }]));
  for (const r of scoped) {
    if (r.scope !== 'in_scope') continue;
    const b = by.get(batchOf(r));
    b.rows.push(r.regulation_id);
    b.shards.add(r.article);
  }
  return { batches: [...by.values()].map((b) => ({ ...b, shards: [...b.shards].sort(cmpSection) })) };
}

// ---------------------------------------------------------------- inputs

const readJsonIf = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

/** authored/<page>/<article>.{a,b,prov}.json files (S6/A1 owns their loader; S8 only counts them). */
function authoredFiles(seeds) {
  const dir = path.join(seeds, 'authored');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith('.json')) out.push(path.relative(dir, path.join(d, e.name)).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

/** Every committed input, read once; the snapshot sliced once. Throws on a structural defect (exit 2). */
export function loadInputs({ root }) {
  const seeds = path.join(root, 'scripts', 'seeds', 'bylaw');
  const snap = loadSnapshotPages(seeds);
  const slice = sliceSnapshot({ pages: snap.pages });
  const vocab = JSON.parse(fs.readFileSync(path.join(seeds, 'vocab.json'), 'utf8'));
  return {
    root,
    seeds,
    snap,
    slice,
    vocab,
    manifest: JSON.parse(fs.readFileSync(path.join(seeds, 'manifest.json'), 'utf8')),
    adoptions: JSON.parse(fs.readFileSync(path.join(seeds, 'adoptions.json'), 'utf8')).adoptions || [],
    amendments: readJsonIf(path.join(seeds, 'amendments.json')),
    adjudications: readJsonIf(path.join(seeds, 'adjudications.json')),
    vectors: (readJsonIf(path.join(seeds, 'eval-vectors.json')) || { vectors: [] }).vectors,
    absences: (readJsonIf(path.join(seeds, 'absence-rulings.json')) || { rulings: [] }).rulings,
    sliceLock: readJsonIf(path.join(seeds, LOCK_FILE)),
    authored: authoredFiles(seeds),
    expertAudits: fs.existsSync(path.join(seeds, 'expert-audit')) ? fs.readdirSync(path.join(seeds, 'expert-audit')).filter((f) => f.endsWith('.json')).sort() : [],
    universeIn: null,
  };
}

const daysBetween = (fromIso, toIso) => {
  const d = (Date.parse(toIso) - Date.parse(fromIso)) / 86400000;
  return Number.isFinite(d) ? Math.floor(d) : null;
};

// ---------------------------------------------------------------- the gates

/** Run one gate body; a throw is recorded as the gate's error (exit 2, the gate named), never swallowed. */
async function runGate(id, body) {
  try {
    const arms = await body();
    const violations = arms.flatMap((a) => a.violations);
    return { state: combineArms(arms), arms, violations, notes: arms.flatMap((a) => a.notes.map((n) => `${a.name}: ${n}`)) };
  } catch (err) {
    return { state: 'not_run', arms: [], violations: [], notes: [], error: `${id} threw: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : String(err)}` };
  }
}

/**
 * Every gate but G-DRIFT over the loaded inputs, in the Spec 68 §12 order. Returns {gates, scoped, report, evalResult,
 * agreedUnits}. G-DRIFT is added by check() after the in-memory render.
 */
export async function runGates(I) {
  const gates = {};
  const ctx = {};
  const agreedUnits = []; // agreed / adjudicated clause units: none before A1 (S6 owns the authored loader)
  const authoredN = I.authored.length; // every authored/ file: the input of each unbuilt authored-content arm

  gates['G-PROV'] = await runGate('G-PROV', () => {
    const prov = checkProvAll({ seeds: I.seeds });
    const deferred = [];
    const uni = readJsonIf(path.join(I.seeds, 'universe.json')) || {};
    for (const r of [...(uni.page_rules || []), ...(uni.scope_rules || [])]) if (r.reason === 'deferred_by_ruling' && r.ruling) deferred.push(r.ruling);
    const rulings = checkRulingCitations({
      spec69Text: fs.readFileSync(path.join(I.root, 'docs/specs/01-pipeline/69_mcbylaw_policy.md'), 'utf8'),
      ledger: readJsonIf(path.join(I.root, 'scripts/seeds/bylaw/ratchet-exceptions.json')),
      adjudications: I.adjudications,
      deferred,
    });
    return [
      ...prov.arms.map((a) => fromCheck(a.name, a)),
      fromCheck('ruling_citations', rulings),
      unbuilt('keyer_provenance', authoredN, 'two distinct keyers, A seal = A draft hash, .a absent from B worktree tree, ledger read paths (§10 stage 5)'),
    ];
  });

  gates['G-TEXT'] = await runGate('G-TEXT', () => {
    const pages = Object.fromEntries(I.snap.pages.map((p) => [p.key, p.normalized]));
    const r = checkTextSlice({ slice: I.slice, pages, lock: I.sliceLock, expect: { adoption_id: I.snap.adoption_id, normalizer_version: I.snap.normalizer_version } });
    ctx.textDisclosures = r.disclosures;
    return [fromCheck('slice', r), unbuilt('unit_pins', authoredN, 'each authored unit pinned to its current unit sha, else pending:stale')];
  });

  gates['G-UNIVERSE'] = await runGate('G-UNIVERSE', async () => {
    I.universeIn = universeInputs({ root: I.root, slice: I.slice, pages: I.snap.pages, adoptionId: I.snap.adoption_id });
    const u = checkUniverse(I.universeIn);
    ctx.universe = u;
    const census = await checkCensus({ root: I.root });
    return [fromStatus('toc_scope', u), fromStatus('census', census)];
  });

  for (const id of ['G-CLAUSE', 'G-XREF']) {
    gates[id] = await runGate(id, () => [arm('module', 'not_run', [], ['not built: the authored-field gate module lands with S6 (Spec 68 §9); never a PASS'])]);
  }

  gates['G-READ'] = await runGate('G-READ', () => {
    const inScope = new Set((ctx.universe ? ctx.universe.scoped : []).filter((x) => x.scope === 'in_scope').map((x) => x.regulation_id));
    const defs = checkDefinitions({ rows: I.slice.rows, vocab: I.vocab, fidelity: loadFidelity(I.root), inScopeIds: ctx.universe ? inScope : null });
    const ext = checkExternalFile({ seeds: I.seeds });
    ctx.external = ext;
    return [fromCheck('definitions', defs), fromCheck('external', ext), unbuilt('explanations', authoredN, 'explanations mention every expression literal, word bound, banned words, cite only cross_refs')];
  });

  gates['G-AGREE'] = await runGate('G-AGREE', () => [arm('module', 'not_run', [], ['not built: the authored-field gate module lands with S6 (Spec 68 §9); never a PASS'])]);

  gates['G-EVAL'] = await runGate('G-EVAL', () => {
    const ev = evaluatorVocab(I.vocab);
    const r = checkEval({ units: agreedUnits, vectors: I.vectors, vocab: ev, enactments: {}, absences: I.absences });
    ctx.evalResult = r;
    const fx = evaluateSelfTest(ev);
    return [fromCheck('expressions_and_vectors', r, { counts: r.counts }), fromCheck('precedence_fixtures', fx)];
  });

  gates['G-CODE'] = await runGate('G-CODE', () => {
    const rep = buildReportFromTree({ root: I.root });
    ctx.report = rep;
    const s = rep.linkage.state;
    return [arm('linkage_i', s, s === 'fail' ? rep.linkage.violations : [], s === 'not_run' ? [`0 authored rows carry code_refs (pending ${rep.linkage.pending}); (ii)/(iv) report-only arms ran`] : [], { checked: rep.linkage.checked })];
  });

  gates['G-SHAPE'] = await runGate('G-SHAPE', () => {
    const v = checkVocab(I.vocab);
    const f = checkFeedsTotality(agreedUnits, I.vocab);
    ctx.feeds = f;
    return [
      fromCheck('vocab', v),
      f.checked === 0 ? arm('feeds_totality', 'vacuous', [], ['vacuous (0 agreed LIMIT/PERMIT/PROHIBIT units)']) : fromCheck('feeds_totality', f),
      unbuilt('schema_and_unit_shape', 1 + I.authored.length, 'JSON Schema on every seed and authored file; §7.3 shape per unit; every authored key resolves; row_status folded from all gate results (S6)'),
    ];
  });

  gates['G-CHANGE'] = await runGate('G-CHANGE', () => {
    const s = changeGateState({ adoptions: I.adoptions, record: null });
    return [arm('stale_units', s, [], s === 'not_run' ? [`no committed change record bound to ${I.snap.adoption_id} (on demand, after an adoption with a base)`] : [])];
  });

  gates['G-AUDIT'] = await runGate('G-AUDIT', () => [arm('expert_sample', 'not_run', [], [`${I.expertAudits.length} expert-audit record(s); the bar + --sample land at S14`])]);

  return { gates, ctx, agreedUnits };
}

/** In-scope row states (Spec 68 §4): no agreed record yet ⇒ pending (M-45); complete only once G-SHAPE folds every gate. */
function rowStates(scoped) {
  const out = {};
  for (const s of scoped) if (s.scope === 'in_scope') out[s.regulation_id] = 'pending';
  return out;
}

/**
 * `--check` / `--validate` / `--write`: every gate, the in-memory render, G-DRIFT, the five lines. `write` replaces the
 * committed renders (and the code-findings report) with the regeneration. Returns everything the CLI prints.
 */
export async function check({ root, write = false, now = nowIso }) {
  const I = loadInputs({ root });
  const { gates: g, ctx } = await runGates(I);
  const scoped = ctx.universe ? ctx.universe.scoped : [];
  const doc = buildTable({ slice: I.slice, scoped, manifest: I.manifest, amendments: I.amendments, vocab: I.vocab, rowStatus: rowStates(scoped), feeds: { checked: ctx.feeds ? ctx.feeds.checked : 0, counts: ctx.feeds ? ctx.feeds.counts : {} } });
  const files = renderAll(doc);
  const findings = ctx.report ? ctx.report.markdown : null;
  const threw = Object.values(g).some((x) => x.error);
  if (write && !threw) writeFiles(root, findings === null ? files : { ...files, [FINDINGS_PATH]: findings });
  const committed = readCommitted(root, [...Object.keys(files), FINDINGS_PATH]);
  const drift = Object.keys(files).filter((rel) => committed[rel] !== files[rel]);
  const regV = registryViolations();
  const gates = {};
  for (const gate of GATES) {
    if (gate.id === 'G-DRIFT') {
      const arms = [
        arm('render', drift.length ? 'fail' : 'pass', drift.map((rel) => `render_drift: ${rel} differs from the in-memory regeneration (run --write)`), [], { checked: Object.keys(files).length }),
        arm('registry', regV.length ? 'fail' : 'pass', regV, [], { checked: GATES.length }),
      ];
      gates['G-DRIFT'] = { state: combineArms(arms), arms, violations: arms.flatMap((a) => a.violations), notes: [] };
    } else gates[gate.id] = g[gate.id];
  }
  const sc = doc.counts.row_states;
  const counts = {
    in_scope: doc.counts.in_scope,
    complete: sc.complete,
    pending: sc.pending + sc['pending:stale'],
    stale: sc['pending:stale'],
    failed: sc.failed,
    draft_failures: I.authored.length ? null : 0,
    disagreements: I.authored.length ? null : 0,
    disclosed_defects: I.slice.defects.length + ((I.adjudications && I.adjudications.adjudications) || []).filter((a) => a.disclosure_reason && a.disclosure_reason !== 'source_defect').length,
  };
  const fetched = I.manifest.pages.map((p) => p.fetched_at).filter(Boolean).sort();
  const rep = ctx.report;
  const extras = {
    snapshot_age_days: fetched.length ? daysBetween(fetched[0], now()) : null,
    max_snapshot_age_days: I.vocab.max_snapshot_age_days,
    findings: { ii: rep ? rep.linkage.findings.filter((f) => f.code === 'expects_mismatch').length : 0, iv_unmapped: rep ? rep.classification.counts.unmapped : 0 },
    eval_mismatches_adjudicated: ctx.evalResult ? ctx.evalResult.counts.mismatch_adjudicated : 0,
    expert_rulings_against: 0,
    agreement_rate: null,
  };
  const lines = fiveLines({ gates, counts, extras });
  const errors = Object.values(gates).filter((x) => x.error).map((x) => x.error);
  const findingsStale = findings !== null && committed[FINDINGS_PATH] !== findings;
  return {
    code: exitCode({ gates, counts, drift }),
    written: write && !threw,
    counts,
    drift,
    errors,
    extras,
    files,
    findingsStale,
    gates,
    lines,
    renderShaLines: Object.keys(files).sort().map((rel) => `render ${rel} sha256 ${sha256(Buffer.from(files[rel], 'utf8'))}`),
    scoped: (() => {
      const byId = new Map(I.slice.rows.map((r) => [r.regulation_id, r]));
      return scoped.map((s) => ({ ...s, article: byId.get(s.regulation_id)?.article ?? null, section: byId.get(s.regulation_id)?.section ?? null }));
    })(),
  };
}

// ---------------------------------------------------------------- self-test

/** Render / five-line / exit-code fixtures (G-DRIFT's own known-bad cases). PURE. */
export function renderSelfTest() {
  const results = [];
  const t = (name, ok, got) => results.push({ name, pass: Boolean(ok), got });
  const verb = '(1) Pipes | and <!-- x --> and `t` and \\ and\nnewline 6.0 metres.';
  const mk = (rows) => ({
    slice: { rows, units: rows.map((r) => ({ clause_path: '(1)', regulation_id: r.regulation_id, sha256: 'b'.repeat(64), unit_id: `${r.regulation_id}#(1)` })), slicer_version: 'slice-v1' },
    scoped: rows.map((r) => ({ regulation_id: r.regulation_id, scope: 'in_scope', reason: null, rule_id: 'R', ruling: null })),
    manifest: { adoption_id: 'adoption-x', normalizer_version: 'norm-v1', pages: [{ key: 'p1', role: 'section', section: '10.20', url: 'u', raw_sha256: 'r', normalized_sha256: 'n'.repeat(64), fetch_id: 'F', consolidation: null }] },
    amendments: { statuses: {} },
    vocab: { version: 'v' },
  });
  const rows = ['10.20.40.70(2)', '10.20.40.70(1)'].map((id, i) => ({ regulation_id: id, page: 'p1', section: '10.20', article: '10.20.40.70', kind: 'regulation', start: 100 - i * 50, verbatim: verb, sha256: 'a', clauses: [], literals: [], refs: [], tags: [], defects: [] }));
  const a = renderAll(buildTable(mk(rows)));
  const b = renderAll(buildTable(mk([...rows].reverse())));
  t('render: total sort (input order never changes the bytes)', a[JSON_REL] === b[JSON_REL] && a[MD_REL] === b[MD_REL]);
  t('render: LF only, one trailing newline', !/\r/.test(a[MD_REL] + a[JSON_REL]) && a[MD_REL].endsWith('\n') && !a[MD_REL].endsWith('\n\n'));
  t('render: no Status line; escaped verbatim cannot open a comment or split a cell', !/\*\*Status/.test(a[MD_REL]) && !a[MD_REL].includes('<!--') && escapeMd('a|b') === 'a\\|b');
  t('render: canonical JSON round-trips', renderJson(JSON.parse(a[JSON_REL])) === a[JSON_REL]);
  t('render: a hand edit is drift (byte compare fails)', a[MD_REL].replace('pending', 'complete') !== renderMarkdown(buildTable(mk(rows))));
  const gs = (state, over = {}) => Object.fromEntries(GATES.map((g) => [g.id, { state: over[g.id] || state }]));
  const zero = { in_scope: 2, complete: 0, pending: 2, stale: 0, failed: 0, draft_failures: 0, disagreements: 0, disclosed_defects: 0 };
  const x = { snapshot_age_days: 0, max_snapshot_age_days: 90, findings: { ii: 0, iv_unmapped: 0 }, eval_mismatches_adjudicated: 0, expert_rulings_against: 0, agreement_rate: null };
  t('five lines: a not_run gate is never a pass', fiveLines({ gates: gs('not_run'), counts: zero, extras: x })[0].includes('gates pass 0 / run 0 / total 13'));
  t('exit: 0 agreed rows, all pending, gates not_run → 0 (M-45)', exitCode({ gates: gs('not_run'), counts: zero, drift: [] }) === 0);
  t('exit: drift → 1', exitCode({ gates: gs('pass'), counts: zero, drift: ['x'] }) === 1);
  t('exit: a gate threw → 2', exitCode({ gates: { ...gs('pass'), 'G-EVAL': { state: 'not_run', error: 'boom' } }, counts: zero, drift: [] }) === 2);
  t('combineArms: vacuous alone never passes', combineArms([arm('a', 'vacuous')]) === 'not_run');
  return { pass: results.every((r) => r.pass), results };
}

/** Every fixture provider + the registry check (`--self-test`). Returns {pass, results: [{name, pass, detail}]}. */
export async function selfTest({ root }) {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
  const results = [];
  for (const name of Object.keys(SELF_TESTS).sort()) {
    try {
      const r = SELF_TESTS[name]({ vocab });
      const bad = (r.results || []).filter((x) => x.ok === false || x.pass === false).map((x) => x.name || x.reason || JSON.stringify(x));
      results.push({ name, pass: r.pass === true && bad.length === 0, detail: [...bad, ...(r.violations || [])].slice(0, 10) });
    } catch (err) {
      results.push({ name, pass: false, detail: [String(err && err.message ? err.message : err)] });
    }
  }
  const reg = registryViolations();
  results.push({ name: 'registry', pass: reg.length === 0, detail: reg });
  return { pass: results.every((r) => r.pass), results };
}
