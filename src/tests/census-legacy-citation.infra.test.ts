// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-AO
//
// Operator ruling R4 (2026-09-29, .cursor/programme_ledger_to_zero_active_task.md §6b),
// Regression Guardian condition 4. The eight slugs converted before the R-AO retention
// amendment (C1 pilots 1-8) had NO census row, so fast invariant #25 ARCHETYPE-PARITY
// could only compare the descriptor with itself. R4 authored their rows from an
// INDEPENDENT source: a blind classification of the LEGACY script at its pre-conversion
// SHA. This lock proves each of those rows cites a legacy source that is NOT the
// descriptor's own provenance — every git fact below is derived here, never retyped:
//   (1) legacy_citation.path is the legacy script itself (== the row's `file`);
//   (2) legacy_citation.sha is neither the row's cutover commit (the first commit whose
//       converted.json `converted[]` lists the file) nor the commit that ADDED the
//       descriptor;
//   (3) the descriptor did not exist at legacy_citation.sha and the script did — the
//       cited blob really is the pre-conversion script;
//   (4) converted_at matches the mechanically-derived cutover commit.
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const CENSUS_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/step-archetype-census.json');
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

const R4_SLUGS = [
  'assert_schema',
  'load_ravines',
  'link_massing',
  'link_wsib',
  'link_parcel_addresses',
  'compute_centroids',
  'link_parcels',
  'refresh_snapshot',
];

interface CensusRow {
  slug: string;
  file: string;
  status?: string;
  converted_at?: string;
  legacy_citation?: { sha: string; path: string; cutover_date: string; rationale: string };
}

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const blobExists = (sha: string, rel: string): boolean =>
  spawnSync('git', ['cat-file', '-e', `${sha}:${rel}`], { cwd: REPO_ROOT }).status === 0;

function convertedListAt(sha: string): string[] {
  const r = spawnSync('git', ['show', `${sha}:${CONVERTED_REL}`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return [];
  try {
    const parsed = JSON.parse(r.stdout) as { converted?: string[] };
    return Array.isArray(parsed.converted) ? parsed.converted : [];
  } catch {
    return [];
  }
}

/** The commit that first registers `file` in converted.json's converted[] (parent does not). */
function cutoverSha(file: string): string {
  // -G (a diff LINE mentions the file), not -S (occurrence COUNT changes): a cutover
  // commit that moves the file from pending[] to converted[] leaves the count unchanged.
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = git('log', '--format=%H', '--reverse', `-G"${escaped}"`, '--', CONVERTED_REL).split('\n').filter(Boolean);
  for (const sha of candidates) {
    if (convertedListAt(sha).includes(file) && !convertedListAt(`${sha}^`).includes(file)) return sha;
  }
  throw new Error(`no cutover commit found for ${file}`);
}

function descriptorAddSha(descriptorRel: string): string {
  const shas = git('log', '--diff-filter=A', '--format=%H', '--', descriptorRel).split('\n').filter(Boolean);
  const first = shas[shas.length - 1];
  if (!first) throw new Error(`no descriptor-add commit for ${descriptorRel}`);
  return first;
}

const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { entries: CensusRow[] };

describe('R4 census rows carry a non-descriptor legacy citation (Guardian condition 4)', () => {
  for (const slug of R4_SLUGS) {
    it(`${slug}: row exists, cites the legacy script at a pre-conversion SHA independent of the descriptor`, () => {
      const row = census.entries.find((e) => e.slug === slug);
      expect(row, `no census row for ${slug}`).toBeDefined();
      if (!row) return;
      expect(row.status).toBe('converted');
      const cit = row.legacy_citation;
      expect(cit, `${slug} has no legacy_citation`).toBeDefined();
      if (!cit) return;

      // (1) the cited path is the legacy script itself
      expect(cit.path).toBe(row.file);

      const citSha = git('rev-parse', '--verify', `${cit.sha}^{commit}`);
      const cutover = cutoverSha(row.file);
      const descriptorRel = row.file.replace(/\.js$/, '.descriptor.json');
      const descAdd = descriptorAddSha(descriptorRel);

      // (2) neither the cutover commit nor the descriptor-add commit
      expect(citSha).not.toBe(cutover);
      expect(citSha).not.toBe(descAdd);

      // (3) the cited blob is the pre-conversion script: script present, descriptor absent
      expect(blobExists(citSha, cit.path)).toBe(true);
      expect(blobExists(citSha, descriptorRel)).toBe(false);
      // and it is an ancestor of the descriptor-add commit (pre-conversion, not a later rewrite)
      expect(spawnSync('git', ['merge-base', '--is-ancestor', citSha, descAdd], { cwd: REPO_ROOT }).status).toBe(0);

      // (4) converted_at names the derived cutover commit
      expect(row.converted_at).toBeDefined();
      expect(cutover.startsWith(git('rev-parse', '--verify', `${row.converted_at}^{commit}`))).toBe(true);
    });
  }
});
