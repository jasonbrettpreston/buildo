// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BB (OWNER-SPEC-DIFF, fast invariant #43)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 row 9(b)
//
// Fast invariant #43 OWNER-SPEC-DIFF — COMMIT-SCOPED. A change set that appends a file to
// converted.json converted[] must also touch every owner spec named for that file, OR the
// file's census row carries spec_diff:"N-A" + spec_diff_reason (>= NA_REASON_MIN chars).
// "Owner specs" are the census `owner_specs` of the row whose `file` matches, read from
// `entries` AND `exemptions`; a spec counts as touched only if its text OUTSIDE `generated:`
// blocks changed (`outsideMarkerChanged`). Replaces Spec 123 §7 row 9(b)'s commit-body "N-A"
// convention. Retired knowingly (Spec 124 register row, WF2 generated Target Files): the
// system-map Implementation-cell inference. Run by step-validate.mjs --staged BEFORE its early
// return (never a fastInvariants() row: its result depends on git state, so it would make every
// generated scorecard non-reproducible). cutover.mjs prints ownerSpecsFor() in its closing note.
// Owner sets are the UNION of the row's `owner_specs` in the base census (HEAD, or HEAD~1 pre-push)
// and the staged census, so a cutover cannot re-point its own owners away from a spec it does not
// touch (output-panel F1, 2026-09-30).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { outsideMarkerChanged } from './generated-blocks.mjs';

/** Repo-relative path of the converted[] registry this invariant is scoped to. */
export const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

/** Repo-relative path of the step-archetype census carrying the spec_diff "N-A" escape hatch. */
export const CENSUS_REL = 'scripts/steps/_schema/step-archetype-census.json';

/** Minimum length of an `spec_diff_reason` for a census "N-A" to excuse an owner-spec touch. */
export const NA_REASON_MIN = 20;

/**
 * Normalize a parsed converted.json into forward-slash file paths (string or {file} entries).
 * @param {{converted?: unknown[]}|null|undefined} parsed
 * @returns {string[]}
 */
export function convertedFilesOf(parsed) {
  const entries = parsed && Array.isArray(parsed.converted) ? parsed.converted : [];
  return entries.map((entry) => {
    const raw = entry && typeof entry === 'object' ? entry.file : entry;
    return String(raw).replace(/\\/g, '/');
  });
}

/**
 * Every owner spec declared for `file` by the census (sorted, unique).
 * @param {string} file
 * @param {Array<{file?: unknown, owner_specs?: unknown}>|null|undefined} censusRows census entries[] + exemptions[]
 * @returns {string[]}
 */
export function ownerSpecsFor(file, censusRows) {
  if (!Array.isArray(censusRows)) return [];
  const out = [];
  for (const row of censusRows) {
    if (!row || row.file !== file || !Array.isArray(row.owner_specs)) continue;
    for (const spec of row.owner_specs) out.push(String(spec));
  }
  return [...new Set(out)].sort();
}

/**
 * True iff a census entry declares `spec_diff: "N-A"` with a long-enough reason.
 * @param {{spec_diff?: unknown, spec_diff_reason?: unknown}|null|undefined} entry
 * @returns {boolean}
 */
export function naDeclared(entry) {
  return Boolean(
    entry &&
      entry.spec_diff === 'N-A' &&
      typeof entry.spec_diff_reason === 'string' &&
      entry.spec_diff_reason.trim().length >= NA_REASON_MIN,
  );
}

/**
 * Judge a change set: every appended converted[] file must touch all its owner specs or be excused.
 * @param {{baseConverted?: string[], headConverted?: string[], changedPaths?: string[], censusEntries?: unknown[], baseCensusEntries?: unknown[], mode?: string, error?: string|null}} cs
 * @returns {{id: number, pass: boolean, appended: string[], blockedFiles: string[], detail: string}}
 */
export function checkOwnerSpecDiff(cs) {
  if (cs.error) {
    return {
      id: 43,
      pass: false,
      appended: [],
      blockedFiles: [],
      detail: `OWNER-SPEC-DIFF: change set unreadable (${cs.error}) — cannot verify owner-spec touches; fix the git state and re-run`,
    };
  }

  const base = new Set(cs.baseConverted || []);
  const appended = (cs.headConverted || []).filter((f) => !base.has(f));
  const changed = new Set(cs.changedPaths || []);
  const census = cs.censusEntries || [];
  const baseCensus = cs.baseCensusEntries || [];

  const problems = [];
  const blockedFiles = [];
  for (const file of appended) {
    const owners = [...new Set([...ownerSpecsFor(file, census), ...ownerSpecsFor(file, baseCensus)])].sort();
    const missing = owners.filter((s) => !changed.has(s));
    const na = naDeclared(census.find((e) => e && e.file === file));
    const ok = na || (owners.length > 0 && missing.length === 0);
    if (ok) continue;
    blockedFiles.push(file);
    if (owners.length === 0) {
      problems.push(
        `${file}: no owner spec declared (census owner_specs) — census spec_diff "N-A" + spec_diff_reason (>= ${NA_REASON_MIN} chars) required`,
      );
    } else {
      problems.push(
        `${file}: owner spec(s) not in this change set: ${missing.join(', ')} — touch them or set census spec_diff "N-A" + spec_diff_reason (>= ${NA_REASON_MIN} chars)`,
      );
    }
  }

  const pass = blockedFiles.length === 0;
  const head = `OWNER-SPEC-DIFF: ${appended.length} file(s) appended to converted[] (${cs.mode || 'change set'})`;
  let detail;
  if (pass && appended.length === 0) {
    detail = `${head} — nothing to check`;
  } else if (pass) {
    detail = `${head}; every owner spec touched or census spec_diff "N-A" declared`;
  } else {
    detail = `${head}; ${problems.join('; ')}`;
  }

  return { id: 43, pass, appended, blockedFiles, detail };
}

/**
 * Read the change set (staged index vs HEAD, else HEAD vs HEAD~1) plus its side files.
 * @param {string} root repo root
 * @param {(root: string, args: string[]) => {status: number|null, stdout?: string, stderr?: string}} [git]
 * @returns {{error: string|null, baseConverted: string[], headConverted: string[], changedPaths: string[], censusEntries: unknown[], baseCensusEntries: unknown[], mode: string}}
 */
export function readCommitChangeSet(root, git = defaultGit) {
  const readSideFiles = () => {
    /** Census entries[] + exemptions[] flattened — both carry `owner_specs`. */
    let censusEntries = [];
    const censusAbs = path.join(root, CENSUS_REL);
    if (fs.existsSync(censusAbs)) {
      const doc = JSON.parse(fs.readFileSync(censusAbs, 'utf8'));
      censusEntries = [...((doc && doc.entries) || []), ...((doc && doc.exemptions) || [])];
    }
    return { censusEntries };
  };

  /** Split a git stdout into trimmed, forward-slashed, non-empty names. */
  const names = (r) =>
    (r.stdout || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/\\/g, '/'));

  /** A blob's text at `rev` for path `p` (`''` = index's `:path` form); null when absent. */
  const showText = (rev, p) => {
    const r = git(root, ['show', `${rev}:${p}`]);
    if (r.status !== 0) return null;
    return r.stdout ?? '';
  };

  /** converted[] at `rev` (`''` = the index's `:path` form); null when that blob is absent. */
  const showConverted = (rev) => {
    const text = showText(rev, CONVERTED_REL);
    if (text === null) return null;
    return convertedFilesOf(JSON.parse(text));
  };

  /**
   * Census entries[] + exemptions[] at `rev` (`''` = the index's `:path` form); null when absent.
   * Read from git, not the worktree, so a staged census cannot be bypassed by an on-disk edit.
   */
  const censusRowsAt = (rev) => {
    const text = showText(rev, CENSUS_REL);
    if (text === null) return null;
    const doc = JSON.parse(text);
    return [...((doc && doc.entries) || []), ...((doc && doc.exemptions) || [])];
  };

  /** Keep a spec path only when its text OUTSIDE generated blocks moved; others pass through. */
  const filterTouchedSpecs = (paths, baseRev, headRev) =>
    paths.filter(
      (p) =>
        !/^docs\/specs\/.+\.md$/.test(p) ||
        outsideMarkerChanged(showText(baseRev, p), showText(headRev, p)),
    );

  let censusEntries = [];
  let baseCensusEntries = [];
  try {
    const cached = git(root, ['diff', '--cached', '--name-only']);
    if (cached.status !== 0) {
      return {
        error: 'git diff --cached failed',
        baseConverted: [],
        headConverted: [],
        changedPaths: [],
        censusEntries,
        baseCensusEntries,
        mode: 'error',
      };
    }

    let mode;
    let baseConverted;
    let headConverted;
    let changedPaths;

    if (names(cached).length > 0) {
      mode = 'index vs HEAD';
      censusEntries = censusRowsAt('') ?? readSideFiles().censusEntries;
      baseCensusEntries = censusRowsAt('HEAD') ?? [];
      baseConverted = showConverted('HEAD') ?? []; // null => converted.json is new at this commit
      headConverted = showConverted(''); // rev '' => the index form `:path`
      if (headConverted === null) {
        return {
          error: 'converted.json not in the index',
          baseConverted: [],
          headConverted: [],
          changedPaths: [],
          censusEntries,
          baseCensusEntries,
          mode: 'error',
        };
      }
      changedPaths = filterTouchedSpecs(names(cached), 'HEAD', '');
    } else {
      const prev = git(root, ['rev-parse', '--verify', '--quiet', 'HEAD~1']);
      if (prev.status !== 0) {
        return {
          error: null,
          baseConverted: [],
          headConverted: [],
          changedPaths: [],
          censusEntries,
          baseCensusEntries,
          mode: 'no HEAD~1 — nothing to compare',
        };
      }
      mode = 'HEAD vs HEAD~1';
      censusEntries = censusRowsAt('HEAD') ?? readSideFiles().censusEntries;
      baseCensusEntries = censusRowsAt('HEAD~1') ?? [];
      const d = git(root, ['diff', '--name-only', 'HEAD~1', 'HEAD']);
      if (d.status !== 0) {
        return {
          error: 'git diff --name-only HEAD~1 HEAD failed',
          baseConverted: [],
          headConverted: [],
          changedPaths: [],
          censusEntries,
          baseCensusEntries,
          mode: 'error',
        };
      }
      baseConverted = showConverted('HEAD~1') ?? [];
      headConverted = showConverted('HEAD') ?? [];
      changedPaths = filterTouchedSpecs(names(d), 'HEAD~1', 'HEAD');
    }

    return { error: null, baseConverted, headConverted, changedPaths, censusEntries, baseCensusEntries, mode };
  } catch (err) {
    return {
      error: String((err && err.message) || err),
      baseConverted: [],
      headConverted: [],
      changedPaths: [],
      censusEntries,
      baseCensusEntries,
      mode: 'error',
    };
  }
}

/** Spawn `git args` in `root`, capturing stdout/stderr as utf8. */
function defaultGit(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
