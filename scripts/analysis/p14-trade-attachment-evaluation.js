#!/usr/bin/env node
/**
 * P14-B + P14-C — trade-attachment ground truth + scenario evaluation.
 * SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.C (P14 baseline)
 *
 * READ-ONLY analysis. No production writes. Scores every trade-attachment
 * alternative against the `permit_inspections` ground-truth corpus and prints a
 * markdown report to stdout (redirect into
 * docs/reports/pipeline-validation/2026-07-09-p14-trade-attachment-evaluation.md).
 *
 * KNOWN LIMITATION (user 2026-07-09): deep_scrapes is paused → permit_inspections
 * is PARTIAL (122 permits). Confidence limits are stated per stratum.
 */
'use strict';

const { Client } = require('pg');
const { ARCHETYPE_BUNDLES, deriveArchetypes } = require('../lib/archetypes');
const { mapToLines, complementTradesFor } = require('../../src/features/leads/lib/archetype-cost-map');
const crypto = require('crypto');

// ── stage_name → trade-slug ground-truth map ────────────────────────────────
// Only stages that name a SPECIFIC trade are mapped. Milestone/rollup stages
// (Occupancy, Interior/Exterior Final, Change of Use, System, Repair/Retrofit,
// Tent) map to [] — they are NOT trade evidence. This ground truth is
// STRUCTURAL/SYSTEMS-biased: finishing trades (drywall/paint/floor/tile/
// cabinetry/trim/stone) + electrical (ESA-inspected, not here) never get a
// dedicated stage, so they CANNOT appear in G. => recall is the meaningful
// metric; raw precision is a lower-bound "confirmation rate".
const STAGE_TRADE = {
  'Structural Framing': ['framing'],
  'Insulation/Vapour Barrier': ['insulation'],
  'Footings/Foundations': ['concrete', 'excavation'],
  'Excavation/Shoring': ['excavation', 'shoring'],
  'Fire Separations': ['fire-protection'],       // ambiguous (rated drywall/framing assemblies); mapped to nearest named trade
  'Fire Protection Systems': ['fire-protection'],
  'Fire Service': ['fire-protection', 'plumbing'],
  'Plumbing Final': ['plumbing'],
  'Water Distribution': ['plumbing'],
  'Water Service': ['plumbing'],
  'Drain/Waste/Vents': ['drain-plumbing', 'plumbing'],
  'Sewers/Drains/Sewage System': ['drain-plumbing'],
  'HVAC Final': ['hvac'],
  'HVAC/Extraction Rough-in': ['hvac'],
  'Pool Suction/Gravity Outlets': ['pool-installation'],
  'Pool Circulation System': ['pool-installation'],
  'Site Grading Inspection': ['landscaping', 'site-preparation'],
  'Demolition': ['demolition'],
  'Security Device': ['security'],
  // milestone / non-trade (documented, mapped to nothing):
  'Occupancy': [], 'Interior Final Inspection': [], 'Exterior Final Inspection': [],
  'Change of Use': [], 'Repair/Retrofit': [], 'System': [], 'Tent/Portable Classroom': [],
  'Fire Access Routes': [],
};
// The universe of trades inspections CAN evidence (for the fair precision proxy).
const INSPECTABLE = new Set(Object.values(STAGE_TRADE).flat());

// line (mapToLines output) → archetype bundle code (scenario 3 union source)
const LINE_ARCHETYPE = {
  max_build: 'FB', coa_build: 'FB', addition: 'ADD', gut: 'INT',
  underpin: 'BAS', basement: 'BAS', garage: 'GAR', laneway_suite: 'LANE',
  garden_suite: 'LANE', kitchen: 'KIT', bath: 'BTH', solar: 'ENV',
};

// permit-type / narrow-code plumbing-family ceiling (scenario 5)
const PLUMBING_FAMILY = new Set(['plumbing', 'drain-plumbing', 'hvac', 'fire-protection']);
function narrowCode(permitNum) {
  if (!permitNum) return null;
  const m = permitNum.match(/\s([A-Z]{2,4})(?:\s|$)/);
  return m ? m[1] : null;
}
// permit_types that are BY-DEFINITION mechanical/plumbing-scoped
const PLUMBING_PERMIT_TYPES = new Set(['Plumbing(PS)', 'Mechanical(MS)', 'Drain and Site Service']);

const jaccardStrata = (t) => t; // identity; strata assigned below

function setOf(arr) { return new Set(arr); }
function inter(a, b) { let n = 0; for (const x of a) if (b.has(x)) n++; return n; }

async function main() {
  const c = new Client({ host: 'localhost', user: 'postgres', password: 'postgres', database: 'buildo' });
  await c.connect();

  const trades = (await c.query('SELECT id, slug FROM trades')).rows;
  const idToSlug = new Map(trades.map((r) => [r.id, r.slug]));

  // inspected permits + metadata
  const permits = (await c.query(`
    SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type, p.project_type,
           p.scope_tags, p.status
    FROM permits p
    WHERE p.permit_num IN (SELECT DISTINCT permit_num FROM permit_inspections)
  `)).rows;
  // one metadata row per permit_num (dedupe revisions — keep the max active-trade revision later)
  const byNum = new Map();
  for (const p of permits) if (!byNum.has(p.permit_num)) byNum.set(p.permit_num, p);

  // ground-truth trade set per permit
  const insp = (await c.query('SELECT permit_num, stage_name FROM permit_inspections')).rows;
  const truthByNum = new Map();
  const unmappedStages = new Map();
  for (const r of insp) {
    if (!truthByNum.has(r.permit_num)) truthByNum.set(r.permit_num, new Set());
    const mapped = STAGE_TRADE[r.stage_name];
    if (mapped === undefined) unmappedStages.set(r.stage_name, (unmappedStages.get(r.stage_name) || 0) + 1);
    for (const t of (mapped || [])) truthByNum.get(r.permit_num).add(t);
  }

  // current active (evidence-only / P13-3) + all-active backup (pre-P13-3), per permit_num
  const curRows = (await c.query(`
    SELECT permit_num, trade_id FROM permit_trades
    WHERE is_active AND permit_num IN (SELECT DISTINCT permit_num FROM permit_inspections)
  `)).rows;
  const bakRows = (await c.query(`
    SELECT permit_num, trade_id FROM _backup_permit_trades_active_20260709
    WHERE is_active AND permit_num IN (SELECT DISTINCT permit_num FROM permit_inspections)
  `)).rows;
  const curByNum = new Map(); const bakByNum = new Map();
  for (const r of curRows) { if (!curByNum.has(r.permit_num)) curByNum.set(r.permit_num, new Set()); const s = idToSlug.get(r.trade_id); if (s) curByNum.get(r.permit_num).add(s); }
  for (const r of bakRows) { if (!bakByNum.has(r.permit_num)) bakByNum.set(r.permit_num, new Set()); const s = idToSlug.get(r.trade_id); if (s) bakByNum.get(r.permit_num).add(s); }

  // ── build per-permit records with each alternative's attached set ──
  const STRATA = {
    'PLB/narrow-trade (Plumbing(PS))': (p) => p.permit_type === 'Plumbing(PS)',
    'small residential': (p) => p.permit_type === 'Small Residential Projects',
    'mid multi-scope (Additions/Alterations)': (p) => p.permit_type === 'Building Additions/Alterations',
    'large new-build (New Houses)': (p) => p.permit_type === 'New Houses',
  };
  function stratumOf(p) { for (const [k, f] of Object.entries(STRATA)) if (f(p)) return k; return 'other'; }

  const records = [];
  for (const [num, p] of byNum) {
    const truth = truthByNum.get(num) || new Set();
    if (truth.size === 0) continue; // no trade-mappable inspection evidence → cannot score

    const evid = curByNum.get(num) || new Set();          // (2) evidence-only / P13-3
    const preP13 = bakByNum.get(num) || new Set();         // (1) status-quo pre-P13-3

    // (3) scope-mapped UNION bundles via mapToLines
    const mapped = mapToLines({
      projectType: p.project_type, scopeTags: p.scope_tags,
      structureType: p.structure_type, isCoa: false,
      activeTradeCount: evid.size,
    });
    const scopeUnion = new Set();
    if (mapped && mapped.lines) {
      for (const line of mapped.lines) {
        const code = LINE_ARCHETYPE[line];
        const b = code && ARCHETYPE_BUNDLES[code];
        if (b) for (const t of b.trades) scopeUnion.add(t);
      }
    }

    // (5) permit-type hard ceiling: if PLB/MEC/DRN scoped, cap to plumbing family.
    // Applied to each base set (the ceiling only bites where the base carries
    // non-plumbing trades — on evidence-only P13-3 already plumbing-scopes PLB).
    const isPlumbCeiling = PLUMBING_PERMIT_TYPES.has(p.permit_type) ||
      (['PLB', 'PSA', 'DRN', 'STS', 'HVA', 'MSA'].includes(narrowCode(num)));
    const cap = (s) => isPlumbCeiling ? new Set([...s].filter((t) => PLUMBING_FAMILY.has(t))) : s;

    // (6) P16 lean scope-mapped complement — UNIONED onto evidence-only per D1
    // (attached = evidence ∪ lean_inference). The complement derives from the SAME mapToLines
    // detection as scenario 3, but attaches LINE_TRADE_COMPLEMENT (lean) instead of the coarse
    // ARCHETYPE_BUNDLES. Faithful to 16C: inference is gated by the same narrow/permit_type ceiling
    // (a narrow/plumb-ceiling permit gains NO inference), so we cap() the complement before union.
    const complement = mapped && mapped.lines ? new Set(complementTradesFor(mapped.lines)) : new Set();
    const gatedComplement = cap(complement); // narrow/plumb permits get no non-family inference
    const lean6 = new Set([...evid, ...gatedComplement]); // evidence ∪ lean inference

    records.push({ num, p, stratum: stratumOf(p), truth,
      alt: { pre: preP13, evid, scope: scopeUnion, lean6,
        ceilEvid: cap(evid), ceilPre: cap(preP13), ceilScope: cap(scopeUnion) } });
  }

  // ── scoring ──
  // recall = |A∩G|/|G|; conf = |A∩G|/|A| (lower bound); prec_insp = |(A∩INSPECTABLE)∩G|/|A∩INSPECTABLE|
  function score(recs, key) {
    let g = 0, a = 0, ag = 0, aInsp = 0, aInspG = 0, count = 0, aTot = 0;
    for (const r of recs) {
      const A = r.alt[key], G = r.truth;
      count++; g += G.size; a += A.size; aTot += A.size;
      ag += inter(A, G);
      const Ai = new Set([...A].filter((t) => INSPECTABLE.has(t)));
      aInsp += Ai.size; aInspG += inter(Ai, G);
    }
    return {
      count, meanAttached: a / count,
      recall: g ? ag / g : 0,
      conf: a ? ag / a : 0,
      precInsp: aInsp ? aInspG / aInsp : 0,
    };
  }

  const ALTS = [
    ['(1) status-quo pre-P13-3 (all bundle active)', 'pre'],
    ['(2) P13-3 evidence-only (current)', 'evid'],
    ['(3) scope-mapped UNION bundles (mapToLines)', 'scope'],
    ['(5a) plumbing ceiling on evidence-only (2)', 'ceilEvid'],
    ['(5b) plumbing ceiling on pre-P13-3 (1)', 'ceilPre'],
    ['(5c) plumbing ceiling on scope-union (3)', 'ceilScope'],
    ['(6) P16 lean complement ∪ evidence', 'lean6'],
  ];

  // per-trade lead-volume impact (corpus-wide, from full DB) — starvation check
  const volRows = (await c.query(`
    SELECT t.slug, COUNT(*) FILTER (WHERE pt.is_active) act, COUNT(*) tot
    FROM permit_trades pt JOIN trades t ON t.id=pt.trade_id GROUP BY t.slug
  `)).rows.sort((x, y) => Number(x.act) - Number(y.act));

  // (4) finer-archetype marginal coverage — which archetypes the inspected corpus needs
  const archCount = new Map();
  const perPermitArch = [];
  for (const r of records) {
    const arches = deriveArchetypes(r.p.project_type, r.p.scope_tags || []);
    perPermitArch.push({ num: r.num, arches: new Set(arches) });
    for (const a of arches) archCount.set(a, (archCount.get(a) || 0) + 1);
  }
  // greedy marginal-coverage curve: order archetypes by incremental permits covered
  const remaining = new Set(perPermitArch.map((x) => x.num));
  const curve = [];
  const avail = new Set([...archCount.keys()]);
  while (avail.size && remaining.size) {
    let best = null, bestGain = -1;
    for (const a of avail) {
      let gain = 0;
      for (const x of perPermitArch) if (remaining.has(x.num) && x.arches.has(a)) gain++;
      if (gain > bestGain) { bestGain = gain; best = a; }
    }
    if (bestGain <= 0) break;
    for (const x of perPermitArch) if (remaining.has(x.num) && x.arches.has(best)) remaining.delete(x.num);
    curve.push({ arch: best, gain: bestGain, covered: perPermitArch.length - remaining.size });
    avail.delete(best);
  }

  // ── emit markdown ──
  const L = [];
  const scorable = records.length;
  L.push('# P14 — Trade-Attachment Evaluation (ground truth + scenarios)');
  L.push('');
  L.push('_Generated by `scripts/analysis/p14-trade-attachment-evaluation.js` (READ-ONLY). Spec 80 §5.C._');
  L.push('');
  L.push('## Corpus confidence (P14-B)');
  L.push('');
  L.push(`- \`permit_inspections\` = **792 rows across 122 permits** (deep_scrapes PAUSED — PARTIAL corpus).`);
  L.push(`- Permits with ≥1 **trade-mappable** inspection stage (scorable G non-empty): **${scorable}**.`);
  L.push('- Ground truth is STRUCTURAL/SYSTEMS-biased: finishing trades (drywall/paint/floor/tile/cabinetry/trim/stone) + electrical (ESA-inspected, absent here) have NO dedicated stage → they cannot enter G. **Recall is the load-bearing metric; raw "confirmation" is a lower bound.**');
  L.push('');
  // stratum counts
  const stratCounts = new Map();
  for (const r of records) stratCounts.set(r.stratum, (stratCounts.get(r.stratum) || 0) + 1);
  L.push('| Stratum | Scorable permits | Confidence |');
  L.push('|---|--:|---|');
  const confLabel = (n) => n >= 30 ? 'moderate' : n >= 10 ? 'low' : n >= 3 ? 'very low' : 'anecdotal (n<3)';
  for (const [k, v] of [...stratCounts.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`| ${k} | ${v} | ${confLabel(v)} |`);
  }
  L.push('');
  if (unmappedStages.size) {
    L.push(`Unmapped stage names encountered (treated as non-trade milestones): ${[...unmappedStages.keys()].map((s) => `\`${s}\``).join(', ')}.`);
    L.push('');
  }

  L.push('## Scenario scores — whole scorable corpus (P14-C)');
  L.push('');
  L.push('- **recall** = |attached ∩ inspected| / |inspected| (the trades that PROVABLY showed up — did we attach them).');
  L.push('- **conf** = |attached ∩ inspected| / |attached| (lower bound; dragged down by un-inspectable finishing trades — NOT true precision).');
  L.push('- **prec(insp)** = precision restricted to the inspectable trade universe = |(attached∩INSPECTABLE) ∩ inspected| / |attached∩INSPECTABLE| (the fair precision proxy).');
  L.push('- **mean attached** = mean active/attached trades per permit (inflation signal).');
  L.push('');
  L.push('| Scenario | mean attached | recall | prec(insp) | conf |');
  L.push('|---|--:|--:|--:|--:|');
  const whole = {};
  for (const [label, key] of ALTS) {
    const s = score(records, key); whole[key] = s;
    L.push(`| ${label} | ${s.meanAttached.toFixed(1)} | ${(s.recall * 100).toFixed(1)}% | ${(s.precInsp * 100).toFixed(1)}% | ${(s.conf * 100).toFixed(1)}% |`);
  }
  L.push('');
  const demotedRecall = (whole.pre.recall - whole.evid.recall) * 100;
  L.push(`**Demoted-bundle recall value** (P14-B item 3): pre-P13-3 recall ${(whole.pre.recall * 100).toFixed(1)}% − evidence-only recall ${(whole.evid.recall * 100).toFixed(1)}% = **${demotedRecall.toFixed(1)} pts** of recall the demoted bundle tier was contributing — at the cost of ${whole.pre.meanAttached.toFixed(1)}−${whole.evid.meanAttached.toFixed(1)} = ${(whole.pre.meanAttached - whole.evid.meanAttached).toFixed(1)} extra attached trades/permit and prec(insp) ${(whole.pre.precInsp * 100).toFixed(1)}% vs ${(whole.evid.precInsp * 100).toFixed(1)}%.`);
  L.push('');

  L.push('## Scenario scores — per stratum (recall / prec(insp))');
  L.push('');
  L.push('| Stratum (n) | (1) pre-P13-3 | (2) evidence | (3) scope-union | (5a) ceil-evid |');
  L.push('|---|---|---|---|---|');
  for (const [k, v] of [...stratCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const recs = records.filter((r) => r.stratum === k);
    const cell = (key) => { const s = score(recs, key); return `${(s.recall * 100).toFixed(0)}% / ${(s.precInsp * 100).toFixed(0)}%`; };
    L.push(`| ${k} (${v}) | ${cell('pre')} | ${cell('evid')} | ${cell('scope')} | ${cell('ceilEvid')} |`);
  }
  L.push('');

  L.push('## Per-trade lead-volume impact + starvation check (corpus-wide, full DB)');
  L.push('');
  L.push('Trades with **0 active** rows are the "overhead-doors class" — starved by P13-3 because the LIVE JS `TAG_TRADE_MATRIX` never emits them directly (bundle-only).');
  L.push('');
  L.push('| trade | active | total | note |');
  L.push('|---|--:|--:|---|');
  for (const r of volRows) {
    const starved = Number(r.act) === 0 && Number(r.tot) > 0;
    if (starved || Number(r.act) < 2000) {
      L.push(`| ${r.slug} | ${Number(r.act).toLocaleString()} | ${Number(r.tot).toLocaleString()} | ${starved ? '**STARVED (0 active)**' : ''} |`);
    }
  }
  L.push('');

  L.push('## (4) Finer-archetype marginal-coverage curve');
  L.push('');
  L.push('Greedy: each row = the next archetype that covers the most still-uncovered scorable permits. Where `covered` flattens = "how many archetypes we need".');
  L.push('');
  L.push('| # | archetype added | permits gained | cumulative covered | of ' + perPermitArch.length + ' |');
  L.push('|--:|---|--:|--:|--:|');
  curve.forEach((x, i) => L.push(`| ${i + 1} | ${x.arch} | ${x.gain} | ${x.covered} | ${(100 * x.covered / perPermitArch.length).toFixed(0)}% |`));
  const uncovered = perPermitArch.length - (curve.length ? curve[curve.length - 1].covered : 0);
  L.push('');
  L.push(`Permits with NO derivable archetype (deriveArchetypes → []): **${uncovered}** of ${perPermitArch.length}.`);
  L.push('');

  // ── (6) P16 GO/NO-GO gate: DEV/HOLD-OUT split + bootstrap CIs ──────────────
  // Deterministic stratified split (md5(permit_num) order, alternate within each stratum) so the
  // complement is CALIBRATED on DEV and SCORED on the held-out half (n≈61 → CIs mandatory).
  const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');
  const byStrat = new Map();
  for (const r of records) { if (!byStrat.has(r.stratum)) byStrat.set(r.stratum, []); byStrat.get(r.stratum).push(r); }
  const dev = [], hold = [];
  for (const [, recs] of byStrat) {
    const sorted = recs.slice().sort((a, b) => (md5(a.num) < md5(b.num) ? -1 : 1));
    sorted.forEach((r, i) => (i % 2 === 0 ? dev : hold).push(r));
  }
  // seeded RNG (mulberry32) for a reproducible percentile bootstrap.
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function bootCI(recs, key, pick, B = 3000, seed = 20260710) {
    const rng = mulberry32(seed); const n = recs.length; const vals = [];
    for (let b = 0; b < B; b++) { const s = []; for (let i = 0; i < n; i++) s.push(recs[Math.floor(rng() * n)]); vals.push(pick(score(s, key))); }
    vals.sort((x, y) => x - y);
    return [vals[Math.floor(0.025 * B)], vals[Math.floor(0.975 * B)]];
  }
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const ciPct = (ci) => `[${pct(ci[0])}, ${pct(ci[1])}]`;
  const ciNum = (ci) => `[${ci[0].toFixed(1)}, ${ci[1].toFixed(1)}]`;

  L.push('## (6) P16 lean-complement GO/NO-GO gate (DEV/HOLD-OUT + bootstrap 95% CI)');
  L.push('');
  const stratSplit = new Map();
  for (const r of records) { const k = r.stratum; if (!stratSplit.has(k)) stratSplit.set(k, [0, 0]); }
  for (const r of dev) stratSplit.get(r.stratum)[0]++;
  for (const r of hold) stratSplit.get(r.stratum)[1]++;
  L.push('| Stratum | DEV n | HOLD n |'); L.push('|---|--:|--:|');
  for (const [k, [d, h]] of stratSplit) L.push(`| ${k} | ${d} | ${h} |`);
  L.push(`| **total** | **${dev.length}** | **${hold.length}** |`);
  L.push('');
  // Gate thresholds — MIRROR of docs/specs/_contracts.json `p16_gate` (pinned by contracts.infra.test.ts).
  const gateThresholds = { recallFloor: 0.5, precFloor: 0.558, meanLo: 8, meanHi: 11 };
  function gateRow(label, recs) {
    const s = score(recs, 'lean6');
    return { label, s,
      recallCI: bootCI(recs, 'lean6', (x) => x.recall),
      precCI: bootCI(recs, 'lean6', (x) => x.precInsp),
      meanCI: bootCI(recs, 'lean6', (x) => x.meanAttached) };
  }
  const evidHold = score(hold, 'evid');
  const rows6 = [['HOLD-OUT (gate)', hold], ['DEV', dev], ['whole corpus', records]].map(([lab, r]) => gateRow(lab, r));
  L.push('| Split | mean attached (95% CI) | recall (95% CI) | prec(insp) (95% CI) |');
  L.push('|---|---|---|---|');
  for (const g of rows6) {
    L.push(`| ${g.label} | ${g.s.meanAttached.toFixed(1)} ${ciNum(g.meanCI)} | ${pct(g.s.recall)} ${ciPct(g.recallCI)} | ${pct(g.s.precInsp)} ${ciPct(g.precCI)} |`);
  }
  L.push('');
  L.push(`Evidence-only baseline on the HOLD split (reference): recall ${pct(evidHold.recall)}, prec(insp) ${pct(evidHold.precInsp)}, mean ${evidHold.meanAttached.toFixed(1)}.`);
  L.push('');
  const holdG = rows6[0].s;
  const goRecall = holdG.recall > gateThresholds.recallFloor;
  const goPrec = holdG.precInsp >= gateThresholds.precFloor;
  const goMean = holdG.meanAttached >= gateThresholds.meanLo && holdG.meanAttached <= gateThresholds.meanHi;
  const GO = goRecall && goPrec && goMean;
  L.push('**Gate (all three on the HOLD-OUT, point estimates):**');
  L.push(`- recall > ${pct(gateThresholds.recallFloor)}: ${pct(holdG.recall)} → ${goRecall ? 'PASS' : 'FAIL'}`);
  L.push(`- prec(insp) ≥ ${pct(gateThresholds.precFloor)} (10 pts off the 65.8% evidence baseline [FAB3]): ${pct(holdG.precInsp)} → ${goPrec ? 'PASS' : 'FAIL'}`);
  L.push(`- mean attached ∈ [${gateThresholds.meanLo}, ${gateThresholds.meanHi}]: ${holdG.meanAttached.toFixed(1)} → ${goMean ? 'PASS' : 'FAIL'}`);
  L.push('');
  L.push(`### VERDICT: **${GO ? 'GO' : 'NO-GO'}** _(PROVISIONAL — 122-permit partial corpus; deep_scrapes-resume re-measure is a STANDING OBLIGATION)_`);
  L.push('');
  L.push('_CIs are a 3000-sample percentile bootstrap over the split permits (seed 20260710). The point estimate governs the gate; the CI states the small-n uncertainty (Gemini/DeepSeek converged ruling)._');

  console.log(L.join('\n'));
  // Machine-readable gate line for the caller (stderr, so it does not pollute the md report on stdout).
  console.error(`P16_GATE_VERDICT=${GO ? 'GO' : 'NO-GO'} recall=${holdG.recall.toFixed(4)} prec_insp=${holdG.precInsp.toFixed(4)} mean=${holdG.meanAttached.toFixed(3)} hold_n=${hold.length} dev_n=${dev.length}`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
