#!/usr/bin/env node
/**
 * Conversion roadmap generator — WF1 "conversion roadmap" (2026-09-10).
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.7, §1.10, §8.2, §10.3 (R-T)
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7
 *
 * WHY THIS EXISTS. `generate-programme-backlog.mjs` retired hand-maintained
 * cross-cutting promises for the same reason this file retires a hand-typed
 * forward plan for the 55 remaining step conversions: a prose table rots the
 * moment reality moves under it (Spec 120 §9.3 ⑤ and Spec 122 §1.7 both
 * undercounted, on record, three times combined). This generator computes
 * the whole-estate roadmap — which files remain, which archetype each one
 * declares (or does not), which chains/slots it touches, its churn×complexity
 * quadrant, and which cutover_prereq items still block it — from FIVE
 * declared inputs, never a hand-typed number:
 *   - scripts/manifest.json                      (chains -> slots, write hints)
 *   - scripts/steps/_schema/converted.json        (converted / pending)
 *   - scripts/steps/_schema/step-archetype-census.json  (declared archetype + batch)
 *   - scripts/steps/_schema/programme-items.json  (per-slug cutover_prereq rows)
 *   - docs/reports/generated/122-churn-complexity.md    (quadrant, `—` where absent)
 *
 * Archetype provenance ladder (no name-prefix inference — Ask A6's own
 * defect class): (1) a CONVERTED step's own descriptor.identity.archetype
 * (authoritative — read from disk, never re-declared in the census) ->
 * (2) the census row (covers the 19 truly-unconverted `sources` steps + the
 * 1 `pending` file, enrich_parcels, whose real descriptor exists but is not
 * yet in converted.json's own `converted[]`) -> (3) "UNDECLARED" (the 36
 * remaining files — Ask A3's own scope: seeding them is ARCH-CENSUS's future
 * WF, not this one).
 *
 * Refuses to emit (loud, never silent — the throw-on-bad-shape idiom
 * generate-programme-backlog.mjs already established):
 *   - a census slug/file pair that does not resolve to a real
 *     manifest.scripts entry with that exact file;
 *   - a duplicate census slug;
 *   - converted ⊄ manifest files (mirrors converted.json's own $comment);
 *   - a CONVERTED step whose real descriptor.identity.archetype disagrees
 *     with a census row that also happens to name it (the census is not
 *     supposed to carry converted rows at all today — this is the
 *     cross-check that fires if one ever drifts in);
 *   - any unconverted-or-pending slug with NO census row at all (totality,
 *     the OTHER direction of the same drift guard).
 *
 * Usage:
 *   node scripts/violations/generate-conversion-roadmap.mjs
 *   node scripts/violations/generate-conversion-roadmap.mjs --check   (exit 1 on drift, writes nothing)
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_PATH = path.join(ROOT, 'scripts/manifest.json');
const CONVERTED_PATH = path.join(ROOT, 'scripts/steps/_schema/converted.json');
// BUILDO_CENSUS_PATH is a TEST-ONLY override (same convention as
// BUILDO_PROGRAMME_ITEMS_PATH/BUILDO_CHURN_TABLE_PATH below and in
// scripts/analysis/step-validate.mjs) so the infra test can point this at a
// fixture file and prove the both-directions throws fire, without importing
// this module's exported functions against the real committed census.
const CENSUS_PATH = process.env.BUILDO_CENSUS_PATH
  ? path.join(ROOT, process.env.BUILDO_CENSUS_PATH)
  : path.join(ROOT, 'scripts/steps/_schema/step-archetype-census.json');
const PROGRAMME_ITEMS_PATH = process.env.BUILDO_PROGRAMME_ITEMS_PATH
  ? path.join(ROOT, process.env.BUILDO_PROGRAMME_ITEMS_PATH)
  : path.join(ROOT, 'scripts/steps/_schema/programme-items.json');
const CHURN_TABLE_PATH = process.env.BUILDO_CHURN_TABLE_PATH
  ? path.join(ROOT, process.env.BUILDO_CHURN_TABLE_PATH)
  : path.join(ROOT, 'docs/reports/generated/122-churn-complexity.md');
const OUT_PATH = path.join(ROOT, 'docs/reports/generated/122-conversion-roadmap.md');

// Risk-ascending, per Ask A1's own rationale — Spec 123 §2's PH-2 quadrant.
const QUADRANT_RANK = { 'bottom-left': 0, 'top-left': 1, 'bottom-right': 2, 'top-right': 3 };

export function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

export function loadConverted() {
  const raw = JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8'));
  return {
    converted: (raw.converted || []).map((f) => String(f).replace(/\\/g, '/')),
    pending: (raw.pending || []).map((p) => (typeof p === 'string' ? { file: p, stage: undefined } : { file: String(p.file).replace(/\\/g, '/'), stage: p.stage })),
  };
}

export function loadCensus() {
  const raw = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8'));
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    throw new Error('step-archetype-census.json declares no entries — an empty census is never a vacuous pass');
  }
  if (!Array.isArray(raw.exemptions) || raw.exemptions.length === 0) {
    throw new Error('step-archetype-census.json declares no exemptions — Ask A2 requires the python step be a declared exemption, never silently dropped');
  }
  return { entries: raw.entries, exemptions: raw.exemptions };
}

const TEMPLATE_FREEZE_PATH = path.join(ROOT, 'scripts/steps/_schema/template-freeze.json');
/**
 * The 6th declared input (LOW finding, WF1 "conversion roadmap" output-panel
 * remediation, 2026-09-10): template-freeze.json's `archetype_profiles[]` is
 * the FROZEN, generated record of which archetype each already-converted
 * step proved (Spec 122 §8.2). Cross-checking against it — rather than only
 * against a census row that (by design) never exists for a converted slug —
 * is what makes the converted-archetype cross-check fire on REAL data today:
 * 7 of 8 profiles are `proven:true` with a real `first_step`.
 */
export function loadTemplateFreeze() {
  if (!fs.existsSync(TEMPLATE_FREEZE_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(TEMPLATE_FREEZE_PATH, 'utf8'));
  return Array.isArray(raw.archetype_profiles) ? raw.archetype_profiles : [];
}

export function loadProgrammeItems() {
  if (!fs.existsSync(PROGRAMME_ITEMS_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(PROGRAMME_ITEMS_PATH, 'utf8'));
  return Array.isArray(raw.items) ? raw.items : [];
}

/**
 * Minimal, self-contained churn×complexity table parse — deliberately NOT an
 * import of scripts/analysis/step-validate.mjs's own parseChurnTable: that
 * module runs its own CLI as an import-time side effect (a bare
 * `try { main(); } catch` at file end), so importing it from a generator
 * that itself runs unconditionally would double-invoke step:validate's own
 * CLI. Same table, same columns, independently re-derived — the two readers
 * agreeing is itself a cheap cross-check, not a risk.
 */
export function parseChurnTable(text) {
  const bySlug = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    if (/^\|[-\s|:]+\|$/.test(line)) continue;
    const cells = line.slice(1, -1).split('|').map((c) => c.trim());
    const [slug, , , , , , quadrantRaw] = cells;
    if (!slug || slug === 'slug') continue;
    const quadrant = quadrantRaw && quadrantRaw.length > 0 && !quadrantRaw.startsWith('excluded') ? quadrantRaw : null;
    bySlug.set(slug, { quadrant });
  }
  return bySlug;
}

function loadChurn() {
  if (!fs.existsSync(CHURN_TABLE_PATH)) return new Map();
  return parseChurnTable(fs.readFileSync(CHURN_TABLE_PATH, 'utf8'));
}

function slugFor(manifest, relFile) {
  const found = Object.entries(manifest.scripts).find(([, e]) => e.file === relFile)?.[0];
  if (!found) throw new Error(`no manifest.scripts entry points at ${relFile}`);
  return found;
}

function chainsFor(manifest, slug) {
  return Object.entries(manifest.chains).filter(([, slugs]) => slugs.includes(slug)).map(([id]) => id);
}

/**
 * Build the full remaining-estate row set. Throws loudly on every "refuses
 * to emit" condition documented in the file header — never a silent skip.
 */
export function buildRoadmap({ manifest, convertedInfo, census, exemptions, programmeItems, churn, archetypeProfiles = [] }) {
  const { converted, pending } = convertedInfo;
  const convertedSet = new Set(converted);
  const pendingFiles = new Set(pending.map((p) => p.file));

  // Declared exemptions (Ask A2, HIGH-1) — every one must resolve to the
  // EXACT manifest.scripts file it claims (both directions: an exemption
  // naming a real slug with the wrong file throws here; a manifest slug
  // with no JS file that ISN'T exempted throws below, in the totality pass).
  const exemptedSlugs = new Set();
  for (const ex of exemptions) {
    const entry = manifest.scripts[ex.slug];
    if (!entry) throw new Error(`step-archetype-census.json exemptions: slug "${ex.slug}" has no manifest.scripts entry`);
    if (entry.file !== ex.file) {
      throw new Error(`step-archetype-census.json exemptions: slug "${ex.slug}" declares file ${JSON.stringify(ex.file)} but manifest.scripts says ${JSON.stringify(entry.file)}`);
    }
    if (entry.file && !entry.file.endsWith('.py') && ex.reason !== 'no_file') {
      throw new Error(`step-archetype-census.json exemptions: slug "${ex.slug}" has a real JS file (${entry.file}) — not eligible for a "${ex.reason}" exemption`);
    }
    if (exemptedSlugs.has(ex.slug)) throw new Error(`step-archetype-census.json exemptions: duplicate slug "${ex.slug}"`);
    exemptedSlugs.add(ex.slug);
  }
  // The OTHER direction: every manifest slug with no JS file (a `.py` file,
  // or `file:null`) MUST be declared exempt — never silently dropped from
  // the roadmap's totality the way the pre-fix generator dropped both
  // `inspections` and `coa_documents` (HIGH-1).
  for (const [slug, entry] of Object.entries(manifest.scripts)) {
    const hasNoJsFile = !entry.file || entry.file.endsWith('.py');
    if (hasNoJsFile && !exemptedSlugs.has(slug)) {
      throw new Error(`manifest.scripts: slug "${slug}" (file=${JSON.stringify(entry.file)}) has no JS file to convert and is NOT a declared exemption in step-archetype-census.json's exemptions[] — Ask A2 requires this be explicit, never silent`);
    }
  }

  // Every unconverted-or-pending slug -> file must resolve to a real
  // manifest.scripts entry with the EXACT declared file (both directions:
  // an unknown slug/file pair throws here; totality is checked below).
  const censusBySlug = new Map();
  for (const e of census) {
    if (censusBySlug.has(e.slug)) throw new Error(`step-archetype-census.json: duplicate slug "${e.slug}"`);
    const entry = manifest.scripts[e.slug];
    if (!entry) throw new Error(`step-archetype-census.json: slug "${e.slug}" has no manifest.scripts entry`);
    if (entry.file !== e.file) {
      throw new Error(`step-archetype-census.json: slug "${e.slug}" declares file "${e.file}" but manifest.scripts says "${entry.file}"`);
    }
    censusBySlug.set(e.slug, e);
  }

  // converted ⊆ manifest files (mirrors converted.json's own $comment claim).
  for (const f of converted) {
    if (!Object.values(manifest.scripts).some((e) => e.file === f)) {
      throw new Error(`converted.json: "${f}" has no manifest.scripts entry`);
    }
  }

  // Cross-check: a CONVERTED step's real descriptor.identity.archetype must
  // agree with a census row that ALSO names it, if one exists (the census
  // is not supposed to carry converted rows at all today — this fires the
  // moment one drifts in with a wrong value).
  for (const f of converted) {
    const slug = slugFor(manifest, f);
    const censusRow = censusBySlug.get(slug);
    if (!censusRow) continue;
    const descPath = path.join(ROOT, f.replace(/\.js$/, '.descriptor.json'));
    // LOW finding: a converted step with NO sibling descriptor is a real
    // anomaly (conversion requires one) — throw loudly, never silently skip
    // the cross-check as if the step were merely unconverted.
    if (!fs.existsSync(descPath)) throw new Error(`converted.json: "${f}" has no sibling descriptor at ${path.relative(ROOT, descPath)} — a converted step without a descriptor is a structural defect, not a skippable case`);
    const descriptor = JSON.parse(fs.readFileSync(descPath, 'utf8'));
    const real = descriptor.identity && descriptor.identity.archetype;
    if (real && censusRow.archetype !== 'UNDECLARED' && real !== censusRow.archetype) {
      throw new Error(`step-archetype-census.json: converted slug "${slug}" declares archetype "${censusRow.archetype}" but its real descriptor says "${real}"`);
    }
  }

  // 6th input (LOW finding): template-freeze.json's archetype_profiles[] is
  // the FROZEN record of which archetype each `proven:true` profile's own
  // `first_step` demonstrated (Spec 122 §8.2). Cross-check fires on REAL
  // data today (7 of 8 profiles proven) — the descriptor-vs-census check
  // above never fires live because the census deliberately carries no
  // converted rows; this one does.
  for (const profile of archetypeProfiles) {
    if (!profile.proven || !profile.first_step) continue;
    const firstStepSlug = profile.first_step;
    const entry = manifest.scripts[firstStepSlug];
    if (!entry) throw new Error(`template-freeze.json: archetype_profiles[${profile.archetype}].first_step "${firstStepSlug}" has no manifest.scripts entry`);
    if (!convertedSet.has(entry.file)) {
      throw new Error(`template-freeze.json: archetype_profiles[${profile.archetype}] is proven:true with first_step "${firstStepSlug}", but ${entry.file} is not in converted.json's converted[]`);
    }
    const descPath = path.join(ROOT, entry.file.replace(/\.js$/, '.descriptor.json'));
    if (!fs.existsSync(descPath)) throw new Error(`template-freeze.json: archetype_profiles[${profile.archetype}]'s first_step "${firstStepSlug}" (${entry.file}) has no sibling descriptor at ${path.relative(ROOT, descPath)}`);
    const descriptor = JSON.parse(fs.readFileSync(descPath, 'utf8'));
    const real = descriptor.identity && descriptor.identity.archetype;
    if (real && real !== profile.archetype) {
      throw new Error(`template-freeze.json: archetype_profiles[${profile.archetype}].first_step "${firstStepSlug}"'s real descriptor declares archetype "${real}", not "${profile.archetype}"`);
    }
  }

  // Totality: every non-exempt manifest file that is neither converted nor
  // (for the 55-count) pending must have EXACTLY one census row; the one
  // pending file must have exactly one census row tagged batch:"pending".
  // Exempted slugs (HIGH-1) are excluded here — they have no JS file to
  // place in a per-file row at all — and are counted separately, explicitly,
  // in the totality sentence render() emits.
  const fileToSlugs = {};
  for (const [slug, e] of Object.entries(manifest.scripts)) {
    if (exemptedSlugs.has(slug)) continue;
    (fileToSlugs[e.file] = fileToSlugs[e.file] || []).push(slug);
  }
  const remainingFiles = Object.keys(fileToSlugs).filter((f) => !convertedSet.has(f));
  const seenSlugs = new Set();
  for (const f of remainingFiles) {
    for (const slug of fileToSlugs[f]) {
      const row = censusBySlug.get(slug);
      if (!row) throw new Error(`step-archetype-census.json: no census row for remaining slug "${slug}" (${f}) — totality violated`);
      if (pendingFiles.has(f) && row.batch !== 'pending') {
        throw new Error(`step-archetype-census.json: slug "${slug}" (${f}) is in converted.json's pending[] but its census row's batch is "${row.batch}", not "pending"`);
      }
      if (!pendingFiles.has(f) && row.batch === 'pending') {
        throw new Error(`step-archetype-census.json: slug "${slug}" (${f}) is not pending, but its census row's batch is "pending"`);
      }
      seenSlugs.add(slug);
    }
  }
  for (const row of census) {
    if (!seenSlugs.has(row.slug)) throw new Error(`step-archetype-census.json: row for slug "${row.slug}" does not correspond to any remaining/pending manifest file (stale row)`);
  }

  // Rows for rendering — one per remaining FILE (pending included, tagged).
  const rows = remainingFiles.map((f) => {
    const slugs = fileToSlugs[f];
    const primarySlug = slugs[0];
    const censusRow = censusBySlug.get(primarySlug);
    const isPending = pendingFiles.has(f);
    const pendingStage = isPending ? pending.find((p) => p.file === f)?.stage : undefined;
    const allChains = new Set();
    for (const s of slugs) for (const c of chainsFor(manifest, s)) allChains.add(c);
    const cutoverIds = [];
    for (const s of slugs) {
      for (const it of programmeItems) {
        if (it.gate?.kind === 'cutover_prereq' && it.gate.blocks?.includes(s) && it.status !== 'BUILT') {
          cutoverIds.push(`${it.id} (${s})`);
        }
      }
    }
    const quadrant = churn.get(primarySlug)?.quadrant ?? null;
    const scriptEntry = manifest.scripts[primarySlug] || {};
    const writeHints = [
      scriptEntry.supports_full ? 'supports_full' : null,
      scriptEntry.supports_dry_run ? 'supports_dry_run' : null,
      scriptEntry.chain_args ? `chain_args=${JSON.stringify(scriptEntry.chain_args)}` : null,
    ].filter(Boolean);
    return {
      file: f,
      slugs,
      archetype: censusRow.archetype,
      batch: censusRow.batch,
      reason: censusRow.reason,
      chains: [...allChains].sort(),
      slots: [...allChains].reduce((n, c) => n + slugs.filter((s) => manifest.chains[c].includes(s)).length, 0),
      quadrant,
      quadrantRank: quadrant ? QUADRANT_RANK[quadrant] ?? 99 : 99,
      pending: isPending,
      pendingStage,
      writeHints,
      cutoverIds,
    };
  });

  return rows;
}

function c6SubBucket(row, manifest) {
  // Chain-native, computed — never hand-declared (the census only tags
  // C4/C5/C6/pending; C6's own permits/coa/deep_scrapes/entities+wsib split
  // is fully derivable from manifest.chains and must never be re-declared).
  const order = ['permits', 'coa', 'entities', 'wsib', 'deep_scrapes'];
  for (const chain of order) {
    for (const s of row.slugs) if ((manifest.chains[chain] || []).includes(s)) return chain === 'entities' || chain === 'wsib' ? 'entities_wsib' : chain;
  }
  return 'orphan';
}

function fmtSlugs(row) {
  return row.slugs.map((s) => (row.pending ? `${s} [pending: ${row.pendingStage ?? 'no stage'}]` : s)).join(', ');
}

export function render(rows, manifest, exemptions = [], convertedInfo = { converted: [], pending: [] }) {
  const parts = [];
  parts.push('# Spec 122 conversion roadmap — every remaining step, generated');
  parts.push('');
  parts.push('> **GENERATED — do not hand-edit.** Sources: `scripts/manifest.json`, `scripts/steps/_schema/{converted,step-archetype-census,programme-items}.json`, `docs/reports/generated/122-churn-complexity.md`.');
  parts.push('> Regenerate: `npm run conversion-roadmap`. Drift-guarded by `src/tests/conversion-roadmap.infra.test.ts`.');
  parts.push('> SPEC LINK: `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §1.7, §1.10, §8.2, §10.3 (R-T)');
  parts.push('> Sequence source of record: `.cursor/c4_batching_entry_active_task.md` (C4/C5 batch membership) — this report does not re-sequence it, only renders it alongside declared risk/gate data.');
  parts.push('');

  const nonPending = rows.filter((r) => !r.pending);
  const pendingRows = rows.filter((r) => r.pending);
  parts.push('## Counts');
  parts.push('');
  parts.push(`Remaining files: **${nonPending.length}** (+ **${pendingRows.length}** pending) · remaining slugs: **${nonPending.reduce((n, r) => n + r.slugs.length, 0)}** (+ **${pendingRows.reduce((n, r) => n + r.slugs.length, 0)}** pending)`);
  parts.push('');

  const byBatch = { C4: [], C5: [], C6: [] };
  for (const r of nonPending) byBatch[r.batch].push(r);
  for (const r of pendingRows) byBatch.C5.push(r); // enrich_parcels renders alongside its C5 ENRICHER siblings, tagged [pending]

  parts.push('| Batch | Files | Slots |');
  parts.push('|---|---:|---:|');
  for (const b of ['C4', 'C5', 'C6']) {
    parts.push(`| ${b} | ${byBatch[b].length} | ${byBatch[b].reduce((n, r) => n + r.slots, 0)} |`);
  }
  parts.push('');

  for (const b of ['C4', 'C5']) {
    parts.push(`## ${b} — archetype-grouped, risk-ascending`);
    parts.push('');
    parts.push('| Archetype | File | Slug(s) | Chains (slots) | Quadrant | Write hints | Open cutover_prereq |');
    parts.push('|---|---|---|---|---|---|---|');
    const byArch = new Map();
    for (const r of byBatch[b]) {
      if (!byArch.has(r.archetype)) byArch.set(r.archetype, []);
      byArch.get(r.archetype).push(r);
    }
    const archOrder = [...byArch.keys()].sort();
    for (const arch of archOrder) {
      const group = byArch.get(arch).slice().sort((a, c) => a.quadrantRank - c.quadrantRank || a.file.localeCompare(c.file));
      for (const r of group) {
        parts.push(`| ${arch} | \`${r.file}\` | ${fmtSlugs(r)} | ${r.chains.join('+')} (${r.slots}) | ${r.quadrant ?? '—'} | ${r.writeHints.join(', ') || '—'} | ${r.cutoverIds.join('; ') || '—'} |`);
      }
    }
    parts.push('');
    parts.push(`<details><summary>${b} — why each archetype (census <code>reason</code>)</summary>\n`);
    for (const r of byBatch[b].slice().sort((a, c) => a.file.localeCompare(c.file))) {
      parts.push(`- \`${r.file}\` (${r.archetype}): ${r.reason}`);
    }
    parts.push('\n</details>');
    parts.push('');
  }

  parts.push('## C6 — UNDECLARED (Ask A3: no archetype, no PH-2 risk data — ordered by chain, not risk)');
  parts.push('');
  parts.push('| Chain bucket | File | Slug(s) | Chains (slots) |');
  parts.push('|---|---|---|---|');
  const c6Order = ['permits', 'coa', 'deep_scrapes', 'entities_wsib', 'orphan'];
  const byChainBucket = new Map(c6Order.map((c) => [c, []]));
  for (const r of byBatch.C6) byChainBucket.get(c6SubBucket(r, manifest)).push(r);
  for (const bucket of c6Order) {
    const group = byChainBucket.get(bucket).slice().sort((a, c) => a.file.localeCompare(c.file));
    for (const r of group) {
      parts.push(`| ${bucket} | \`${r.file}\` | ${fmtSlugs(r)} | ${r.chains.join('+')} (${r.slots}) |`);
    }
  }
  parts.push('');
  parts.push('*C6 chain-bucket counts (files):* ' + c6Order.map((c) => `${c}=${byChainBucket.get(c).length}`).join(' · '));
  parts.push('');

  parts.push('## Declared exemptions (Ask A2) — manifest slugs with NO JS file, excluded by ruling, never silently dropped');
  parts.push('');
  parts.push('| Slug | File | Reason | Ruling | Scope |');
  parts.push('|---|---|---|---|---|');
  for (const ex of exemptions.slice().sort((a, c) => a.slug.localeCompare(c.slug))) {
    parts.push(`| ${ex.slug} | ${ex.file === null ? '\`null\`' : `\`${ex.file}\``} | ${ex.reason} | ${ex.ruling} | ${ex.scope} |`);
  }
  parts.push('');
  parts.push('---');
  parts.push('');
  // SLUG-grain totality (never file-grain here — 2 remaining files carry 2
  // slugs each, so a file-count subtraction would silently under/overcount).
  const totalManifestSlugs = Object.keys(manifest.scripts).length;
  const remainingSlugCount = rows.filter((r) => !r.pending).reduce((n, r) => n + r.slugs.length, 0);
  const pendingSlugCount = rows.filter((r) => r.pending).reduce((n, r) => n + r.slugs.length, 0);
  const convertedSlugCount = convertedInfo.converted.reduce((n, f) => n + Object.values(manifest.scripts).filter((e) => e.file === f).length, 0);
  const identityHolds = convertedSlugCount + pendingSlugCount + exemptions.length + remainingSlugCount === totalManifestSlugs;
  parts.push(
    `*Totality (both directions, proven by \`src/tests/conversion-roadmap.infra.test.ts\`; slug-grain, ${identityHolds ? 'IDENTITY HOLDS' : '⚠️ IDENTITY VIOLATED — this is a generator bug, file immediately'}): **${totalManifestSlugs}** manifest.scripts slugs = ` +
      `**${convertedSlugCount}** converted + **${pendingSlugCount}** pending + **${exemptions.length}** declared exemptions (Ask A2, excluded from the conversion programme entirely — never silently dropped, see the table above) + ` +
      `**${remainingSlugCount}** remaining, each counted exactly once, in exactly one of C4/C5/C6/pending/exempted.*`,
  );
  parts.push('');
  return parts.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const manifest = loadManifest();
  const convertedInfo = loadConverted();
  const { entries: census, exemptions } = loadCensus();
  const programmeItems = loadProgrammeItems();
  const churn = loadChurn();
  const archetypeProfiles = loadTemplateFreeze();
  const rows = buildRoadmap({ manifest, convertedInfo, census, exemptions, programmeItems, churn, archetypeProfiles });
  const rendered = render(rows, manifest, exemptions, convertedInfo);
  if (check) {
    const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : null;
    if (current !== rendered) {
      console.error('[generate-conversion-roadmap] DRIFT — docs/reports/generated/122-conversion-roadmap.md is stale. Run `npm run conversion-roadmap` to regenerate.');
      process.exit(1);
    }
    console.log('[generate-conversion-roadmap] clean — no drift');
    return;
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, rendered);
  console.log(`[generate-conversion-roadmap] wrote ${path.relative(ROOT, OUT_PATH)} (${rows.length} remaining rows)`);
}

const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntry) main();
