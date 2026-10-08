#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 (the validator; exit codes), §10 (process + artifacts),
//            §12 (order; no mode writes to the DB); docs/specs/01-pipeline/69_mcbylaw_policy.md M-32 (pre-commit --check),
//            M-36 (enacting capture); docs/reports/mcbylaw-phase1-plan.md S3, S5 (--accept), S7 (--validate,
//            --plan-batches, render), S8 (--check / --self-test), S10 (--amendments, enacting), S11 (--refresh-census)
//
// McBylaw generator CLI.
//
//   --check            every pre-commit gate offline, the in-memory render byte-compared with docs/reference/ (G-DRIFT),
//                      the five lines + PHASE 1. The pre-commit stage (M-32). Writes nothing.
//   --validate         as --check, plus every gate's arms, notes and violations.
//   --write            as --check, then writes docs/reference/bylaw-provisions.{json,md} and bylaw-code-findings.md.
//   --self-test        every gate module's known-bad fixtures + the registry ⇄ fixture-provider check.
//   --plan-batches     A1..A7 membership of the in-scope rows (printed; nothing written).
//   --refresh [--baseline=<Phase 0 pages dir>] [--delay-ms=1000]   (also records the City's enacted, not-yet-consolidated list, M-57 R5)
//                      fetch the pinned pages into the git-ignored .staging/, all or nothing, print the change report.
//   --adopt            re-validate the staging, write pages/, manifest.json, adoptions.json; then rebuild amendments.json
//                      (authored statuses carried, tag delta printed) and re-pin slice.lock.json under the new adoption.
//   --amendments       rebuild amendments.json from the adopted pages; print totals and any authored status dropped.
//   --capture-enacting=<NNNN-YYYY> --url=<toronto.ca pdf> --sha256=<pinned>
//                      fetch + sha-check + extract (pdftotext, twice) one enacting by-law into .staging/enacting/ (M-36).
//   --adopt-enacting=<NNNN-YYYY>
//                      re-validate that staging and write enacting/<bylaw>.{extracted.txt,txt} + enacting/manifest.json.
//   --accept --ruling=<Spec 69 id>
//                      pin the universe (universe.lock.json + a ratchet-exceptions.json universe_pin row); refused unless the
//                      id is RATIFIED, G-UNIVERSE has no violation and nothing awaits a ruling (Spec 68 §8 rule 7).
//   --refresh-census   witness-check census.sql, run it in ONE BEGIN TRANSACTION READ ONLY session, write census.json.
//   (--sample, G-AUDIT, lands at S14.)
//
// Exit: 0 pass · 1 drift, a failed row, a gate failure or a self-test fixture that did not fire · 2 structural (bad args,
// a gate threw, a refused refresh/adopt/accept/capture; nothing written). --adopt writes in three steps (adopt, then
// amendments.json, then slice.lock.json): a failure after the first leaves the adoption written, and G-PROV (amendment
// arm) / G-TEXT (lock_stale) then name what is unrebuilt; --amendments rebuilds amendments.json.

import fs from 'node:fs';
import path from 'node:path';
import { nowIso, sleep } from './analysis/bylaw/clock.mjs';
import { AmendmentsError, buildAmendments, droppedStatuses } from './analysis/bylaw/amendments.mjs';
import { CensusError, refreshCensus } from './analysis/bylaw/census.mjs';
import { tagDelta } from './analysis/bylaw/change.mjs';
import { adoptEnacting, captureEnacting, pdftotextExtractor } from './analysis/bylaw/enacting.mjs';
import { loadSnapshotPages, sliceSnapshot } from './analysis/bylaw/slice.mjs';
import { adopt, refresh, seedsDir, SnapshotError, stableStringify, writeAtomic } from './analysis/bylaw/snapshot.mjs';
import { writeSliceLock } from './analysis/bylaw/standardized.mjs';
import { refreshUnconsolidated } from './analysis/bylaw/unconsolidated.mjs';
import { acceptUniverse, universeInputs, UniverseError } from './analysis/bylaw/universe.mjs';
import { check, GATES, planBatches, selfTest } from './analysis/bylaw/validate.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FLAG_MODES = ['refresh', 'adopt', 'accept', 'refresh-census', 'amendments', 'check', 'validate', 'write', 'self-test', 'plan-batches'];
const VALUE_MODES = ['capture-enacting', 'adopt-enacting'];
const USAGE = 'usage: generate-bylaw-provisions.mjs --check | --validate | --write | --self-test | --plan-batches | --refresh [--baseline=<dir>] [--delay-ms=<500..600000>] | --adopt | --amendments | --capture-enacting=<bylaw> --url=<pdf> --sha256=<sha> | --adopt-enacting=<bylaw> | --accept --ruling=<Spec 69 id> | --refresh-census';

function parseArgs(argv) {
  const args = { modes: [], baseline: null, delayMs: 1000, ruling: null, bylaw: null, url: null, sha256: null };
  for (const a of argv) {
    const flag = a.startsWith('--') ? a.slice(2) : null;
    const eq = flag ? flag.indexOf('=') : -1;
    if (flag && eq === -1 && FLAG_MODES.includes(flag)) args.modes.push(flag);
    else if (flag && eq > 0 && VALUE_MODES.includes(flag.slice(0, eq))) {
      args.modes.push(flag.slice(0, eq));
      args.bylaw = flag.slice(eq + 1);
    } else if (a.startsWith('--ruling=')) args.ruling = a.slice('--ruling='.length);
    else if (a.startsWith('--url=')) args.url = a.slice('--url='.length);
    else if (a.startsWith('--sha256=')) args.sha256 = a.slice('--sha256='.length);
    else if (a.startsWith('--baseline=')) args.baseline = path.resolve(a.slice('--baseline='.length));
    else if (a.startsWith('--delay-ms=')) args.delayMs = Number(a.slice('--delay-ms='.length));
    else args.unknown = a;
  }
  for (const k of ['baseline', 'ruling', 'bylaw', 'url', 'sha256']) if (args[k] === '' || args[k] === path.resolve('')) args.unknown = `--${k}= (empty)`;
  return args;
}

function printReport(report) {
  const s = report.summary;
  console.log(`change report vs ${report.baseline.kind} (${report.baseline.label}): pinned ${s.pinned} · new ${s.new} · unchanged ${s.unchanged} · changed ${s.changed} · not carried ${s.not_carried} (undeclared ${s.not_carried_undeclared})`);
  for (const p of report.pages) {
    if (p.status === 'unchanged') continue;
    const extra = p.status === 'changed' ? ` vs ${p.compared_with}: -${p.segments_removed}/+${p.segments_added} segments, tags ${p.tags_before}->${p.tags_after}` : ` (${p.basis})`;
    console.log(`  ${p.status.padEnd(9)} ${p.key}${extra}`);
  }
  for (const n of report.not_carried) console.log(`  not carried ${n.key} (${n.section}): ${n.ruling || 'NO RULING'} — ${n.reason}`);
}

/** Rebuild amendments.json from the adopted pages, carrying authored statuses (S10). */
function writeAmendments() {
  const seeds = seedsDir(ROOT);
  const file = path.join(seeds, 'amendments.json');
  const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const doc = buildAmendments({ seeds, prior });
  writeAtomic(file, stableStringify(doc));
  const t = doc.totals;
  console.log(`amendments.json (${doc.adoption_id}): ${t.tags} tags + ${t.list_tags} list tags over ${t.pages} pages; ${t.bylaws} by-laws`);
  for (const b of droppedStatuses(prior, doc)) console.log(`  status dropped (no tag references it): ${b}`);
  if (prior) {
    const d = tagDelta(prior, doc);
    for (const p of d.pages) console.log(`  tags ${p.page}: ${p.tags_before} -> ${p.tags_after}`);
    console.log(`  tags added ${d.tags_added.length} · removed ${d.tags_removed.length} · by-laws added [${d.bylaws_added.join(', ')}] · removed [${d.bylaws_removed.join(', ')}]`);
  }
}

/** --check / --validate / --write output. Five lines first; detail lines are indented (never `WORD:`-shaped). */
async function runCheck(mode) {
  const r = await check({ root: ROOT, write: mode === 'write' });
  for (const l of r.lines) console.log(l);
  for (const g of GATES) {
    const x = r.gates[g.id];
    if (mode === 'validate') {
      console.log(`  gate ${g.id} (${g.word}, ${g.when}): ${x.state}`);
      for (const a of x.arms) console.log(`    arm ${a.name}: ${a.state}${a.checked === null || a.checked === undefined ? '' : ` (checked ${a.checked})`}`);
      for (const n of x.notes) console.log(`    note ${n}`);
      for (const v of x.violations.slice(0, 50)) console.log(`    violation ${v}`);
      if (x.violations.length > 50) console.log(`    … ${x.violations.length - 50} more`);
    } else if (x.state === 'fail') {
      console.log(`  gate ${g.id} FAIL: ${x.violations.length} violation(s)`);
      for (const v of x.violations.slice(0, 10)) console.log(`    ${v}`);
      if (x.violations.length > 10) console.log(`    … ${x.violations.length - 10} more (--validate lists them)`);
    }
  }
  for (const e of r.errors) console.error(`  ${e}`);
  for (const rel of r.drift) console.log(`  drift ${rel}: differs from the in-memory regeneration — run node scripts/generate-bylaw-provisions.mjs --write`);
  console.log(`  report-only docs/reference/bylaw-code-findings.md ${r.findingsStale ? 'STALE (never a blocker; --write refreshes it)' : 'current'}`);
  if (mode === 'write') console.log(r.written ? `  wrote ${Object.keys(r.files).sort().join(', ')} and docs/reference/bylaw-code-findings.md` : '  nothing written: a gate threw (exit 2)');
  for (const l of r.renderShaLines) console.log(l);
  return r.code;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.modes[0];
  const badRuling = (mode === 'accept') !== Boolean(args.ruling);
  const badCapture = (mode === 'capture-enacting') !== Boolean(args.url && args.sha256);
  if (args.unknown || args.modes.length !== 1 || badRuling || badCapture || !Number.isFinite(args.delayMs) || args.delayMs < 500 || args.delayMs > 600000) {
    if (args.unknown) console.error(`unknown or empty argument: ${args.unknown}`);
    console.error(USAGE);
    return 2;
  }
  try {
    if (mode === 'check' || mode === 'validate' || mode === 'write') return await runCheck(mode);
    if (mode === 'self-test') {
      const r = await selfTest({ root: ROOT });
      for (const x of r.results) console.log(`${x.pass ? 'ok  ' : 'FAIL'} ${x.name}${x.detail.length ? ` — ${x.detail.join('; ')}` : ''}`);
      console.log(`self-test ${r.pass ? 'PASS' : 'FAIL'}: ${r.results.filter((x) => x.pass).length} / ${r.results.length} providers`);
      return r.pass ? 0 : 1; // a fixture that fails to fire is a G-DRIFT failure (Spec 68 §9), not a structural error
    }
    if (mode === 'plan-batches') {
      const r = await check({ root: ROOT });
      if (r.errors.length) {
        for (const e of r.errors) console.error(`  ${e}`);
        return 2; // a gate threw: the scope the batches read is not trustworthy
      }
      const b = planBatches({ scoped: r.scoped });
      console.log('PROVISIONAL membership (plan A1..A7 text read literally; A6 = every in-scope row no other batch names):');
      for (const x of b.batches) console.log(`  ${x.id} ${x.label}: ${x.rows.length} rows in ${x.shards.length} article shards`);
      console.log(`  total ${b.batches.reduce((n, x) => n + x.rows.length, 0)} = in scope ${r.counts.in_scope}`);
      return 0;
    }
    if (mode === 'refresh') {
      const { fetchId, report } = await refresh({ root: ROOT, baselineDir: args.baseline, fetchImpl: fetch, nowIso, sleep, delayMs: args.delayMs, log: (m) => console.log(m) });
      console.log(`staged ${fetchId}`);
      printReport(report);
      const uc = await refreshUnconsolidated({ seeds: path.join(ROOT, 'scripts', 'seeds', 'bylaw'), fetchImpl: fetch, nowIso, sleep, delayMs: args.delayMs });
      console.log(`unconsolidated list: ${uc.bylaws.length} by-laws (${uc.bylaws.filter((b) => b.captured).length} captured)`);
      return 0;
    }
    if (mode === 'accept') {
      const snap = loadSnapshotPages(seedsDir(ROOT));
      const inputs = universeInputs({ root: ROOT, slice: sliceSnapshot(snap), pages: snap.pages, adoptionId: snap.adoption_id });
      const r = acceptUniverse({ root: ROOT, ruling: args.ruling, inputs });
      console.log(`${r.unchanged ? 'unchanged' : 'pinned'} universe under ${args.ruling}: in scope ${r.counts.in_scope} of ${r.counts.rows} rows (${snap.adoption_id})`);
      return 0;
    }
    if (mode === 'refresh-census') {
      const { census } = await refreshCensus({ root: ROOT, log: (m) => console.log(m) });
      const t = census.at_or_above_threshold;
      console.log(`census ${census.adoption_id} on ${census.database}: ${t.exceptions} exceptions >= ${census.min_direct_lots} direct lots cover ${t.lots} / ${census.excepted.lots} excepted lots`);
      return 0;
    }
    if (mode === 'amendments') {
      writeAmendments();
      return 0;
    }
    if (mode === 'capture-enacting') {
      const { record } = await captureEnacting({ root: ROOT, bylaw: args.bylaw, url: args.url, expectedSha256: args.sha256, fetchImpl: fetch, nowIso, extractor: pdftotextExtractor() });
      console.log(`staged ${record.bylaw}: pdf ${record.pdf_sha256} · extraction ${record.extraction_sha256} (${record.extractor_version})`);
      return 0;
    }
    if (mode === 'adopt-enacting') {
      const { record } = adoptEnacting({ root: ROOT, bylaw: args.bylaw });
      console.log(`adopted enacting ${record.bylaw}: normalized ${record.normalized_sha256}`);
      return 0;
    }
    if (mode !== 'adopt') throw new Error(`unhandled mode ${mode}`); // never fall through into a writing mode
    const { adoptionId, manifest } = adopt({ root: ROOT });
    console.log(`adopted ${adoptionId}: ${manifest.pages.length} pages`);
    writeAmendments(); // the adoption re-pins per-page tag counts under its id (Spec 68 §8 rule 7)
    const lock = writeSliceLock({ seeds: seedsDir(ROOT) }); // per-page slice counts re-pinned under the adoption (G-TEXT)
    console.log(`slice.lock.json (${lock.adoption_id}): ${lock.totals.rows} rows, ${lock.totals.units} units`);
    return 0;
  } catch (err) {
    if (err instanceof SnapshotError || err instanceof UniverseError || err instanceof CensusError || err instanceof AmendmentsError) {
      console.error(`refused — ${err.message}`);
      return 2;
    }
    throw err;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err);
    process.exitCode = 2;
  },
);
