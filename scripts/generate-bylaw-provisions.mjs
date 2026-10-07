#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 (exit codes), §10 (process + artifacts);
//            docs/reports/mcbylaw-phase1-plan.md S3, S5 (--accept), S11 (--refresh-census)
//
// McBylaw generator CLI. S3 landed the snapshot modes; S5 adds --accept, S11 --refresh-census; the other Spec 68
// §10 modes (--write | --check | --validate | --self-test | --sample | --plan-batches) arrive with their steps.
//
//   node scripts/generate-bylaw-provisions.mjs --refresh [--baseline=<Phase 0 pages dir>] [--delay-ms=1000]
//       fetch the pinned pages (scripts/seeds/bylaw/page-set.json) into the git-ignored .staging/,
//       all or nothing, and print the change report. --baseline is required for adoption 1 only.
//   node scripts/generate-bylaw-provisions.mjs --adopt
//       re-validate the staging and write pages/, manifest.json, adoptions.json.
//   node scripts/generate-bylaw-provisions.mjs --accept --ruling=<Spec 69 id>
//       pin the universe (universe.lock.json + a ratchet-exceptions.json universe_pin row); refused unless the id is
//       RATIFIED, G-UNIVERSE has no violation and nothing awaits a ruling (Spec 68 §8 rule 7).
//   node scripts/generate-bylaw-provisions.mjs --refresh-census
//       run census.sql in one BEGIN TRANSACTION READ ONLY session and write census.json (Spec 68 §11 Inputs).
//
// Exit: 0 ok · 2 structural (bad args, refused or failed refresh/adopt; nothing written).

import path from 'node:path';
import { nowIso, sleep } from './analysis/bylaw/clock.mjs';
import { adopt, refresh, SnapshotError } from './analysis/bylaw/snapshot.mjs';
import { acceptUniverse, universeInputs, UniverseError } from './analysis/bylaw/universe.mjs';
import { loadSnapshotPages, sliceSnapshot } from './analysis/bylaw/slice.mjs';
import { CensusError, refreshCensus } from './analysis/bylaw/census.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const args = { modes: [], baseline: null, delayMs: 1000, ruling: null };
  for (const a of argv) {
    if (a === '--refresh' || a === '--adopt' || a === '--accept' || a === '--refresh-census') args.modes.push(a.slice(2));
    else if (a.startsWith('--ruling=')) args.ruling = a.slice('--ruling='.length);
    else if (a.startsWith('--baseline=')) args.baseline = path.resolve(a.slice('--baseline='.length));
    else if (a.startsWith('--delay-ms=')) args.delayMs = Number(a.slice('--delay-ms='.length));
    else args.unknown = a;
  }
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const badRuling = (args.modes[0] === 'accept') !== Boolean(args.ruling);
  if (args.unknown || args.modes.length !== 1 || badRuling || !Number.isFinite(args.delayMs) || args.delayMs < 500) {
    console.error('usage: generate-bylaw-provisions.mjs --refresh [--baseline=<dir>] [--delay-ms>=500] | --adopt | --accept --ruling=<Spec 69 id> | --refresh-census');
    return 2;
  }
  const mode = args.modes[0];
  try {
    if (mode === 'refresh') {
      const { fetchId, report } = await refresh({
        root: ROOT,
        baselineDir: args.baseline,
        fetchImpl: fetch,
        nowIso,
        sleep,
        delayMs: args.delayMs,
        log: (m) => console.log(m),
      });
      console.log(`staged ${fetchId}`);
      printReport(report);
      return 0;
    }
    if (mode === 'accept') {
      const snap = loadSnapshotPages(path.join(ROOT, 'scripts', 'seeds', 'bylaw'));
      const inputs = universeInputs({ root: ROOT, slice: sliceSnapshot(snap), pages: snap.pages, adoptionId: snap.adoption_id });
      const r = acceptUniverse({ root: ROOT, ruling: args.ruling, inputs });
      console.log(`${r.unchanged ? 'unchanged' : 'pinned'} universe under ${args.ruling}: in scope ${r.counts.in_scope} of ${r.counts.rows} rows (${snap.adoption_id})`);
      return 0;
    }
    if (mode === 'refresh-census') {
      await refreshCensus({ root: ROOT, log: (m) => console.log(m) });
      return 0;
    }
    const { adoptionId, manifest } = adopt({ root: ROOT });
    console.log(`adopted ${adoptionId}: ${manifest.pages.length} pages`);
    return 0;
  } catch (err) {
    if (err instanceof SnapshotError || err instanceof UniverseError || err instanceof CensusError) {
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
