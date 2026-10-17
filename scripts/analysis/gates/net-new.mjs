// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DK (amends R-CS)
//
// R-DK (McDonald's Airtight V3, operator y 2026-10-17): a NET-NEW step has no PRE capture —
// there is no legacy script to capture it from, and a PRE copied from the step's own POST is
// forbidden by R-CS ("no PRE is ever made by copying the step's own POST"). A census row with
// `legacy: "none"` is net-new ONLY when the evidence below holds; then #22 and G8's PRE half
// print `net-new (R-DK)` instead of failing, and G8's stability half compares each retaken POST
// with the COMMITTED POST of the same file (`git show HEAD:`). A row that declares
// `legacy: "none"` without the evidence is refused by name — never a silent waiver.
//
// The closed evidence set (each one already a hard gate elsewhere; R-DK only requires them
// together before it lets the PRE half pass):
//   1. no legacy history — the script's oldest commit is not older than its descriptor's
//      (a renamed or pre-existing legacy script fails this);
//   2. no `legacy_citation` on the row (that field cites a legacy script — the opposite claim);
//   3. a nonzero recipe — `docs/reports/golden/<slug>/recapture.json` has >=1 entry with
//      `via` "bracket" or "env" (Spec 124 R-CZ, #38);
//   4. red-first evidence — >=1 `docs/reports/red-evidence/<slug>/*.json` (gate K, #41);
//   5. rerun-zero — every committed POST capture carries `rerun_proof.answer === "PASS"`.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const NET_NEW_TAG = 'net-new (R-DK)';
const CENSUS_REL = 'scripts/steps/_schema/step-archetype-census.json';

/**
 * PURE. Decide whether one census row is an accepted net-new step.
 * @param {{slug:string, legacy?:string, hasLegacyCitation:boolean, scriptFirstCommitTs:number|null,
 *   descriptorFirstCommitTs:number|null, nonzeroRecipes:number, redEvidenceFiles:number,
 *   postCaptures:number, postsWithRerunPass:number}} e
 * @returns {{netNew:boolean, ok:boolean, why:string}}
 */
export function netNewDecision(e) {
  if (e.legacy !== 'none') return { netNew: false, ok: false, why: 'not declared net-new' };
  const refuse = (why) => ({ netNew: true, ok: false, why: `legacy:"none" refused — ${why}` });
  if (e.hasLegacyCitation) return refuse('the row also carries legacy_citation (a legacy script is cited)');
  if (!Number.isFinite(e.scriptFirstCommitTs) || !Number.isFinite(e.descriptorFirstCommitTs)) {
    return refuse('the script or its descriptor has no git history to check');
  }
  if (e.scriptFirstCommitTs < e.descriptorFirstCommitTs) return refuse('the script has git history before its descriptor (a legacy script exists)');
  if (!(e.nonzeroRecipes > 0)) return refuse('no recapture.json entry with via bracket|env (R-CZ, #38)');
  if (!(e.redEvidenceFiles > 0)) return refuse('no docs/reports/red-evidence/<slug>/*.json (gate K)');
  if (!(e.postCaptures > 0) || e.postsWithRerunPass !== e.postCaptures) {
    return refuse(`rerun-zero proof missing on ${e.postCaptures - e.postsWithRerunPass} of ${e.postCaptures} POST capture(s)`);
  }
  return { netNew: true, ok: true, why: NET_NEW_TAG };
}

/** Oldest commit timestamp touching `rel` (merges included), or null. */
function firstCommitTs(repoRoot, rel) {
  const res = spawnSync('git', ['log', '--format=%ct', '--', rel], { cwd: repoRoot, encoding: 'utf8' });
  if (res.status !== 0) return null;
  const lines = res.stdout.trim().split('\n').filter(Boolean);
  return lines.length ? Number(lines[lines.length - 1]) : null;
}

function jsonFiles(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
}

/**
 * Impure loader: every census row declaring `legacy: "none"`, decided.
 * @returns {Map<string, {netNew:boolean, ok:boolean, why:string}>} keyed by slug
 */
export function loadNetNew(repoRoot) {
  const out = new Map();
  const censusPath = path.join(repoRoot, CENSUS_REL);
  if (!existsSync(censusPath)) return out;
  const census = JSON.parse(readFileSync(censusPath, 'utf8'));
  for (const row of census.entries || []) {
    if (row.legacy !== 'none') continue;
    const golden = path.join(repoRoot, 'docs/reports/golden', row.slug);
    let nonzeroRecipes = 0;
    const recipePath = path.join(golden, 'recapture.json');
    if (existsSync(recipePath)) {
      const caps = JSON.parse(readFileSync(recipePath, 'utf8')).captures || {};
      nonzeroRecipes = Object.values(caps).filter((c) => c && (c.via === 'bracket' || c.via === 'env')).length;
    }
    const posts = jsonFiles(path.join(golden, 'post'));
    let postsWithRerunPass = 0;
    for (const f of posts) {
      try {
        const doc = JSON.parse(readFileSync(path.join(golden, 'post', f), 'utf8'));
        if (doc && doc.rerun_proof && doc.rerun_proof.answer === 'PASS') postsWithRerunPass++;
      } catch {
        // an unparseable capture is counted as missing its proof
      }
    }
    out.set(
      row.slug,
      netNewDecision({
        slug: row.slug,
        legacy: row.legacy,
        hasLegacyCitation: Boolean(row.legacy_citation),
        scriptFirstCommitTs: firstCommitTs(repoRoot, row.file),
        descriptorFirstCommitTs: firstCommitTs(repoRoot, row.file.replace(/\.js$/, '.descriptor.json')),
        nonzeroRecipes,
        redEvidenceFiles: jsonFiles(path.join(repoRoot, 'docs/reports/red-evidence', row.slug)).length,
        postCaptures: posts.length,
        postsWithRerunPass,
      }),
    );
  }
  return out;
}

/** The committed (HEAD) version of a repo-relative file, parsed, or null when HEAD lacks it. */
export function headDoc(repoRoot, rel) {
  const res = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

export function selfTest() {
  const good = {
    slug: 's', legacy: 'none', hasLegacyCitation: false, scriptFirstCommitTs: 10, descriptorFirstCommitTs: 10,
    nonzeroRecipes: 1, redEvidenceFiles: 1, postCaptures: 2, postsWithRerunPass: 2,
  };
  const cases = [
    [good, true],
    [{ ...good, legacy: undefined }, false],
    [{ ...good, hasLegacyCitation: true }, false],
    [{ ...good, scriptFirstCommitTs: 5 }, false],
    [{ ...good, scriptFirstCommitTs: null }, false],
    [{ ...good, nonzeroRecipes: 0 }, false],
    [{ ...good, redEvidenceFiles: 0 }, false],
    [{ ...good, postsWithRerunPass: 1 }, false],
    [{ ...good, postCaptures: 0, postsWithRerunPass: 0 }, false],
  ];
  for (const [input, want] of cases) {
    const got = netNewDecision(input);
    if (got.ok !== want) throw new Error(`net-new self-test FAILED: ${JSON.stringify(input)} → ok=${got.ok}, want ${want}`);
    if (!want && input.legacy === 'none' && !got.why.startsWith('legacy:"none" refused')) {
      throw new Error(`net-new self-test FAILED: a refused net-new row must say why by name (${got.why})`);
    }
  }
  return 'net-new self-test PASSED';
}
