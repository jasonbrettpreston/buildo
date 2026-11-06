/**
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (the lot vector), §3 (row shape); inc1-plan.md 1.1 G, 6.1 briefs 3-4 (MB-31 golden 25)
 * Handbook:  Spec 132 §core.9 (R-W: the core is pure, so the inputs can be recomputed with no database)
 *
 * Makes `inputs.jsonl` for the 25 golden cases WITHOUT a database: the Layer 2 half of each case (`phase2`) is recomputed from
 * the saved `parcels` rows through the committed pure core (bylaw-materialize.js + bylaw-lot-row.js) and everything else is
 * copied from the frozen `source-inputs.jsonl` line. Only `phase2` is replaced; every other key keeps the source line's order.
 * MB-27 R2 (plan-reader-and-mech.md 1.4 R2 (6)): `phase2_options` follows `phase2`, the case's design-option slots and threshold
 * (the rows of bylaw_resolution_option_results: target, option (null for the threshold), shared, and the cell), so Layer 3 replays
 * its per-option runs from the same recompute.
 *
 *   node scripts/analysis/bylaw-validation/golden25-inputs.mjs [--dir <folder>] [--check]
 *
 * `--dir` is the golden-25 folder (default src/tests/fixtures/layer3/golden-25). Reads `parcels-rows.json` (25 parcels rows),
 * `source-inputs.jsonl` (one JSON object per case) and `expected.jsonl` (case -> parcel_id, the parcels row id). With `--check`
 * nothing is written: the file is recomputed and compared byte for byte with the existing `inputs.jsonl` (exit 1 on a difference).
 *
 * Plain Node ESM, no database, no network: node:fs, node:path, node:url, node:module only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..'); // the repository root: three levels above this file
const require = createRequire(import.meta.url);
const mz = require('../../lib/bylaw-materialize.js');
const lr = require('../../lib/bylaw-lot-row.js');
const rb = require('../../lib/bylaw-resolution.js');

const DEFAULT_DIR = 'src/tests/fixtures/layer3/golden-25';
const TOLERANCE = 0.01;
const ADDED_TARGET = 'averaging_distance_m'; // always written when the source line does not carry it
// golden-25 mode B (MB-31 inc1 plan 2.2): the MB-18 (j) slot, written so the chain-step-4 front fallback reaches the 25
const ADDED_TARGETS = [ADDED_TARGET, 'front_setback_fallback_m'];

function parseArgs(argv) {
  const opts = { dir: DEFAULT_DIR, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') opts.check = true;
    else if (a === '--dir') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error('--dir needs a folder argument');
      opts.dir = v;
      i += 1;
    } else throw new Error(`unknown argument ${JSON.stringify(a)} (usage: [--dir <folder>] [--check])`);
  }
  return opts;
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (e) {
      throw new Error(`${file}:${i + 1}: not JSON (${e.message})`);
    }
  });
}

/** The recomputed Layer 2 half of every case, keyed by parcels row id (the Layer 2 core, no database in the path). */
function recomputePhase2(rows) {
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = mz.makeEnv({
    body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList,
    versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version },
  });
  const out = mz.materializeBatch(rows, env);
  const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  // the base pairs in their array order (rb.scopePairs) and the M-465 option slots after them; the Map below keys the base rows only, so an
  // option row (which carries `option`) never overwrites a base row of the same target (F-10)
  const pairs = rb.scopePairs(SCOPE);
  const optionPairs = rb.optionPairs(SCOPE, VOCAB.design_options);
  const byParcel = new Map();
  const optionsByParcel = new Map();
  for (const lot of out.rows.lots) {
    const decoded = lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs });
    // The case is the principal detached house (the representative class of the golden lot).
    const recs = new Map(decoded.filter((d) => !d.option && d.class === 'detached_house' && d.structure === 'principal').map((d) => [d.target, d]));
    byParcel.set(lot.parcel_id, recs);
    const opts = lr.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs })
      .filter((d) => d.class === 'detached_house' && d.structure === 'principal');
    optionsByParcel.set(lot.parcel_id, opts);
  }
  return { byParcel, optionsByParcel };
}

/** The source `parcel` block against the parcels row it is supposed to be (a fixture that drifted stops the run). */
function checkConsistency(caseName, src, row) {
  const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= TOLERANCE;
  const bad = [];
  if (src.corner !== row.is_corner_lot) bad.push(`corner ${JSON.stringify(src.corner)} != is_corner_lot ${JSON.stringify(row.is_corner_lot)}`);
  if (!near(src.frontage, row.frontage_m)) bad.push(`frontage ${JSON.stringify(src.frontage)} != frontage_m ${JSON.stringify(row.frontage_m)}`);
  if (!near(src.depth, row.depth_m)) bad.push(`depth ${JSON.stringify(src.depth)} != depth_m ${JSON.stringify(row.depth_m)}`);
  if (!near(src.area, row.lot_size_sqm)) bad.push(`area ${JSON.stringify(src.area)} != lot_size_sqm ${JSON.stringify(row.lot_size_sqm)}`);
  if (bad.length) throw new Error(`${caseName}: source parcel disagrees with parcels row ${row.id}: ${bad.join('; ')}`);
}

/** The source value against the recomputed one: the same number may render differently (0.9 vs 0.9000000000000001). */
function valueMatches(srcValue, recValue) {
  if (srcValue === recValue) return true;
  if (typeof srcValue !== 'number' || typeof recValue !== 'number') return false;
  return Math.abs(srcValue - recValue) <= Number.EPSILON * 8 * Math.max(1, Math.abs(srcValue), Math.abs(recValue));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dir = path.resolve(ROOT, opts.dir);
  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'parcels-rows.json'), 'utf8'));
  const source = readJsonl(path.join(dir, 'source-inputs.jsonl'));
  const expected = readJsonl(path.join(dir, 'expected.jsonl'));
  const { byParcel, optionsByParcel } = recomputePhase2(rows);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const idByCase = new Map(expected.map((e) => [e.case, e.parcel_id]));

  // The targets written: the first source line's phase2 keys plus averaging_distance_m, sorted.
  if (source.length === 0) throw new Error(`${path.join(dir, 'source-inputs.jsonl')} is empty`);
  const targets = [...new Set([...Object.keys(source[0].phase2), ...ADDED_TARGETS])].sort();

  const lines = [];
  const report = [];
  let differing = 0;
  let comparable = 0;
  for (const line of source) {
    const caseName = line.case;
    const parcelId = idByCase.has(caseName) ? idByCase.get(caseName) : NaN;
    if (!Number.isFinite(parcelId)) throw new Error(`${caseName}: no parcel_id in expected.jsonl`);
    const row = rowById.get(parcelId);
    if (!row) throw new Error(`${caseName}: parcel_id ${parcelId} is not in parcels-rows.json`);
    checkConsistency(caseName, line.parcel, row);
    const recs = byParcel.get(parcelId);
    if (!recs) throw new Error(`${caseName}: parcel ${parcelId} has no lot row (is it out of the Layer 2 population?)`);

    const phase2 = {};
    for (const target of targets) {
      const rec = recs.get(target);
      if (!rec) throw new Error(`${caseName}: no recomputed record for target ${target}`);
      phase2[target] = {
        status: rec.status,
        kind: rec.value_kind ?? '',
        value: rec.value,
        reason: rec.reason ?? '',
        clause: rec.winner_unit_id ?? '',
        ref: rec.evidence_ref ?? '',
      };
      const was = line.phase2[target];
      if (was !== undefined) {
        comparable += 1;
        const differs = was.status !== phase2[target].status || was.kind !== phase2[target].kind
          || was.reason !== phase2[target].reason || was.clause !== phase2[target].clause
          || !valueMatches(was.value, phase2[target].value);
        if (differs) differing += 1;
      }
    }
    // MB-27 R2: the option slots in the view's order (target, then option, the threshold's null first)
    const cellOf = (rec) => ({ status: rec.status, kind: rec.value_kind ?? '', value: rec.value, reason: rec.reason ?? '', clause: rec.winner_unit_id ?? '', ref: rec.evidence_ref ?? '' });
    const phase2Options = (optionsByParcel.get(parcelId) || [])
      .map((d) => ({ target: d.target, option: d.option, shared: d.shared_with_base === true, ...cellOf(d) }))
      .sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : String(a.option ?? '') < String(b.option ?? '') ? -1 : String(a.option ?? '') > String(b.option ?? '') ? 1 : 0));
    // Only phase2 is replaced (and phase2_options written after it); every other key keeps the source line's order.
    const out = {};
    for (const [k, v] of Object.entries(line)) {
      if (k === 'phase2_options') continue;
      out[k] = k === 'phase2' ? phase2 : v;
      if (k === 'phase2') out.phase2_options = phase2Options;
    }
    if (!Object.prototype.hasOwnProperty.call(out, 'phase2')) throw new Error(`${caseName}: the source line has no phase2 key to replace`);
    lines.push(JSON.stringify(out));
    report.push(`  ${caseName} ${parcelId}: ${ADDED_TARGET} ${phase2[ADDED_TARGET].status} ${JSON.stringify(phase2[ADDED_TARGET].value)}`);
  }

  const text = `${lines.join('\n')}\n`;
  const outFile = path.join(dir, 'inputs.jsonl');
  const summary = [
    `golden-25 inputs: ${source.length} cases, ${targets.length} targets`,
    `source phase2 cells ${comparable}, differing after recompute ${differing}`,
    ...report,
  ];

  if (opts.check) {
    let have = null;
    try {
      have = fs.readFileSync(outFile, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (have === null) {
      console.error(`${outFile} does not exist: run without --check to write it`);
      process.exitCode = 1;
      return;
    }
    if (have !== text) {
      console.error(`${outFile} differs from the recomputed file (${have.split('\n').length - 1} lines vs ${lines.length})`);
      process.exitCode = 1;
      return;
    }
    console.log(summary.join('\n'));
    console.log(`--check: ${outFile} matches byte for byte`);
    return;
  }

  fs.writeFileSync(outFile, text);
  console.log(summary.join('\n'));
  console.log(`wrote ${outFile} (${lines.length} lines)`);
}

try {
  main();
} catch (e) {
  console.error(`golden25-inputs: ${e.message}`);
  process.exitCode = 1;
}
