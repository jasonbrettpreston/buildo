/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §2b
 *
 * build-values-batch — the OFFLINE tool that turns one intake drop (coa-parse/1-shaped notices, values plus the
 * requirement sentence) into a committed VALUES-ONLY batch file and its entry in
 * `scripts/seeds/coa-notices/manifest-aic-values.json` (CHAT-71.2; routine C-6). It is not a step and never
 * touches the network or the AIC captcha: the input is a file a lane already extracted.
 *
 * USAGE
 *   node scripts/analysis/coa-notices/build-values-batch.mjs --build <notices.json> --batch-id coa-2026-a \
 *        [--captured-on YYYY-MM-DD] [--exclude 'A0974/16EYK=in_pdf_allotment' ...] [--plan-facts <dir of plan-facts/*.json>] [--hearing-dates <hearing-dates.json>] [--root <repo root>]
 *   node scripts/analysis/coa-notices/build-values-batch.mjs --verify [--root <repo root>]
 *
 * The requirement sentence is read in memory only to call `mapTarget`; the batch file holds closed-set values,
 * numbers, dates and identifiers (validated by `validateBatch` BEFORE anything is written). Output JSON uses the
 * same `stableStringify` as the other manifest tools (sorted keys, LF).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { sha256, stableStringify } from '../bylaw/snapshot.mjs';

const require = createRequire(import.meta.url);
const A = require('../../lib/coa-notices/aic-values.js');
const VOCAB = require('../../lib/coa-notices/vocab.json');
const TARGET_MAP = require('../../lib/coa-notices/target-map.json');

export const MANIFEST_REL = 'scripts/seeds/coa-notices/manifest-aic-values.json';
export const PARSER_VERSION_RE = /^[A-Za-z0-9._/-]{1,40}$/;

/**
 * Pure: raw notices -> `{batch, serialized, sha256, excluded, counts}` or throws a closed error. `excludes` is
 * `{[application_number]: reason}` for notices the operator keeps out (never `hearing_date_unread`, which the
 * mapping assigns itself).
 */
export function buildBatch(rawNotices, { batchId, excludes = {}, parserVersion, planFacts = [], hearingDates = {} }) {
  if (!A.VALUES_CONTRACT.batch_id_re.test(String(batchId))) throw new Error('COA_VALUES_E_BATCH_ID');
  const list = Array.isArray(rawNotices) ? rawNotices : Object.values(rawNotices || {});
  const notices = [];
  const excluded = [];
  for (const raw of list) {
    const why = excludes[raw && raw.file_number];
    if (why !== undefined) {
      if (!A.VALUES_CONTRACT.excluded_reasons.includes(why) || why === 'hearing_date_unread') throw new Error('COA_VALUES_E_EXCLUDE_REASON');
      excluded.push({ application_number: raw.file_number, batch_id: batchId, reason: why });
      continue;
    }
    const m = A.mapNotice(raw, { hearingDates });
    if (m.excluded) excluded.push({ application_number: raw.file_number, batch_id: batchId, reason: m.excluded });
    else notices.push(m.notice);
  }
  notices.sort((a, b) => (a.application_number < b.application_number ? -1 : 1));
  const pv = parserVersion || (list[0] && list[0].parser_version);
  if (!PARSER_VERSION_RE.test(String(pv))) throw new Error('COA_VALUES_E_PARSER_VERSION');
  // Spec 129 §2c: plan facts of the applications in THIS drop (loaded or excluded notices alike).
  const dropApps = new Set(list.map((r) => r && r.file_number));
  const plan_facts = planFacts.filter((f) => dropApps.has(f.file_number)).map((f) => A.mapPlanFacts(f))
    .sort((a, b2) => (a.application_number < b2.application_number ? -1 : 1));
  const batch = {
    schema: A.VALUES_CONTRACT.batch_schema,
    batch_id: batchId,
    parser_version: pv,
    vocab_version: VOCAB.version,
    target_map_version: TARGET_MAP.version,
    notices,
    ...(plan_facts.length > 0 ? { plan_facts } : {}),
  };
  const problems = A.validateBatch(batch);
  if (problems.length > 0) throw new Error(`COA_VALUES_E_INVALID_BATCH ${problems.slice(0, 5).join(' | ')}`);
  const serialized = stableStringify(batch);
  return {
    batch,
    serialized,
    sha256: sha256(serialized),
    excluded,
    counts: { notices: notices.length, items: notices.reduce((n, x) => n + x.items.length, 0), plan_facts: plan_facts.length },
  };
}

/** Pure: the manifest with this batch's entry (replaced if the id exists) and its exclusions swapped in. */
export function upsertManifest(manifest, built, capturedOn) {
  const base = manifest || { schema: A.VALUES_CONTRACT.manifest_schema, source_family: A.SOURCE_FAMILY, batches: [], excluded: [] };
  const id = built.batch.batch_id;
  const entry = {
    batch_id: id,
    path: A.batchPathFor(id),
    sha256: built.sha256,
    notices: built.counts.notices,
    items: built.counts.items,
    captured_on: capturedOn,
  };
  const batches = base.batches.filter((b) => b.batch_id !== id).concat(entry).sort((a, b) => (a.batch_id < b.batch_id ? -1 : 1));
  const excluded = (base.excluded || []).filter((e) => e.batch_id !== id).concat(built.excluded)
    .sort((a, b) => `${a.batch_id}|${a.application_number}`.localeCompare(`${b.batch_id}|${b.application_number}`));
  const next = { ...base, batches, excluded };
  const problems = A.validateValuesManifest(next);
  if (problems.length > 0) throw new Error(`COA_VALUES_E_INVALID_MANIFEST ${problems.slice(0, 5).join(' | ')}`);
  return next;
}

/** Pure: re-hash each pinned batch through `readBytes(relPath)`; returns `{ok, results[]}`. */
export function verifyBatches(manifest, readBytes) {
  const results = manifest.batches.map((b) => {
    let bytes = null;
    try {
      bytes = readBytes(b.path);
    } catch {
      return { batch_id: b.batch_id, status: 'missing' };
    }
    return { batch_id: b.batch_id, status: sha256(bytes) === b.sha256 ? 'match' : 'sha_changed' };
  });
  return { ok: results.every((r) => r.status === 'match'), results };
}

function parseArgs(argv) {
  const args = { exclude: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verify') args.verify = true;
    else if (a === '--build' || a === '--batch-id' || a === '--captured-on' || a === '--root' || a === '--plan-facts' || a === '--hearing-dates') args[a.slice(2)] = argv[++i];
    else if (a === '--exclude') {
      const [app, reason] = String(argv[++i]).split('=');
      args.exclude[app] = reason;
    } else throw new Error(`COA_VALUES_E_ARG ${a}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root ? path.resolve(args.root) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const manifestAbs = path.join(root, MANIFEST_REL);
  const readManifest = () => (fs.existsSync(manifestAbs) ? JSON.parse(fs.readFileSync(manifestAbs, 'utf8')) : null);
  if (args.verify) {
    const m = readManifest();
    if (!m) throw new Error('COA_VALUES_E_NO_MANIFEST');
    const v = verifyBatches(m, (rel) => fs.readFileSync(path.join(root, rel)));
    process.stdout.write(stableStringify(v));
    process.exitCode = v.ok ? 0 : 1;
    return;
  }
  if (!args.build || !args['batch-id']) throw new Error('usage: --build <notices.json> --batch-id <id> [--captured-on D] [--exclude APP=reason] | --verify');
  const raw = JSON.parse(fs.readFileSync(path.resolve(args.build), 'utf8'));
  const planFacts = args['plan-facts']
    ? fs.readdirSync(path.resolve(args['plan-facts'])).filter((f) => f.endsWith('.json')).sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(path.resolve(args['plan-facts']), f), 'utf8')))
      .filter((f) => f && typeof f.file_number === 'string') // the intake store's index file carries none
    : [];
  // --hearing-dates <json>: {items:[{file_number, hearing_date}]}; only file_number + hearing_date are read.
  const hearingDates = args['hearing-dates']
    ? Object.fromEntries(JSON.parse(fs.readFileSync(path.resolve(args['hearing-dates']), 'utf8')).items
      .filter((i) => i && typeof i.file_number === 'string' && typeof i.hearing_date === 'string').map((i) => [i.file_number, i.hearing_date]))
    : {};
  const built = buildBatch(raw, { batchId: args['batch-id'], excludes: args.exclude, planFacts, hearingDates });
  const capturedOn = args['captured-on'] || new Date().toISOString().slice(0, 10);
  const next = upsertManifest(readManifest(), built, capturedOn);
  const out = path.join(root, A.batchPathFor(args['batch-id']));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, built.serialized);
  fs.writeFileSync(manifestAbs, stableStringify(next));
  process.stdout.write(stableStringify({ batch_id: args['batch-id'], sha256: built.sha256, ...built.counts, excluded: built.excluded.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
