// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BB (OWNER-SPEC-DIFF, fast invariant #43)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 row 9(b)
//
// Fast invariant #43 OWNER-SPEC-DIFF — COMMIT-SCOPED. A change set that appends a file to
// converted.json converted[] must also touch every spec whose system-map Implementation cell
// names that file (archive/ rows excluded), OR the file's census row carries
// spec_diff:"N-A" + spec_diff_reason (>= NA_REASON_MIN chars). Replaces Spec 123 §7 row 9(b)'s
// commit-body "N-A" convention. Run by step-validate.mjs --staged BEFORE its early return
// (never a fastInvariants() row: its result depends on git state, so it would make every
// generated scorecard non-reproducible). cutover.mjs prints ownerSpecsFor() in its closing note.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Repo-relative path of the converted[] registry this invariant is scoped to. */
export const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

/** Repo-relative path of the system map whose Implementation cells name owner specs. */
export const SYSTEM_MAP_REL = 'docs/specs/00-architecture/00_system_map.md';

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
 * Every non-archive spec whose system-map Implementation cell names `file` (sorted, unique).
 * @param {string} file
 * @param {string|null} systemMapText
 * @returns {string[]}
 */
export function ownerSpecsFor(file, systemMapText) {
  if (!systemMapText) return [];
  const out = [];
  for (const line of String(systemMapText).split('\n')) {
    const m = line.match(/^\|\s*\d+[a-z]?\s*\|\s*`([^`]+)`/);
    if (!m) continue;
    const impl = line.split('|')[4] || '';
    if (!impl.includes('`' + file + '`')) continue;
    const spec = m[1];
    if (spec.startsWith('archive/')) continue;
    out.push(spec.startsWith('docs/') ? spec : 'docs/specs/' + spec);
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
 * @param {{baseConverted?: string[], headConverted?: string[], changedPaths?: string[], systemMapText?: string|null, censusEntries?: unknown[], mode?: string, error?: string|null}} cs
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

  const problems = [];
  const blockedFiles = [];
  for (const file of appended) {
    const owners = ownerSpecsFor(file, cs.systemMapText);
    const missing = owners.filter((s) => !changed.has(s));
    const na = naDeclared(census.find((e) => e && e.file === file));
    const ok = na || (owners.length > 0 && missing.length === 0);
    if (ok) continue;
    blockedFiles.push(file);
    if (owners.length === 0) {
      problems.push(
        `${file}: no owner spec names it in the system map${cs.systemMapText ? '' : ' (system map absent)'} — census spec_diff "N-A" + spec_diff_reason (>= ${NA_REASON_MIN} chars) required`,
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
 * @returns {{error: string|null, baseConverted: string[], headConverted: string[], changedPaths: string[], systemMapText: string|null, censusEntries: unknown[], mode: string}}
 */
export function readCommitChangeSet(root, git = defaultGit) {
  const readSideFiles = () => {
    let systemMapText = null;
    const mapAbs = path.join(root, SYSTEM_MAP_REL);
    if (fs.existsSync(mapAbs)) systemMapText = fs.readFileSync(mapAbs, 'utf8');
    let censusEntries = [];
    const censusAbs = path.join(root, CENSUS_REL);
    if (fs.existsSync(censusAbs)) {
      const doc = JSON.parse(fs.readFileSync(censusAbs, 'utf8'));
      censusEntries = (doc && doc.entries) || [];
    }
    return { systemMapText, censusEntries };
  };

  /** Split a git stdout into trimmed, forward-slashed, non-empty names. */
  const names = (r) =>
    (r.stdout || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/\\/g, '/'));

  /** converted[] at `rev` (`''` = the index's `:path` form); null when that blob is absent. */
  const showConverted = (rev) => {
    const r = git(root, ['show', `${rev}:${CONVERTED_REL}`]);
    if (r.status !== 0) return null;
    return convertedFilesOf(JSON.parse(r.stdout));
  };

  let systemMapText = null;
  let censusEntries = [];
  try {
    const side = readSideFiles();
    systemMapText = side.systemMapText;
    censusEntries = side.censusEntries;

    const cached = git(root, ['diff', '--cached', '--name-only']);
    if (cached.status !== 0) {
      return {
        error: 'git diff --cached failed',
        baseConverted: [],
        headConverted: [],
        changedPaths: [],
        systemMapText,
        censusEntries,
        mode: 'error',
      };
    }

    let mode;
    let baseConverted;
    let headConverted;
    let changedPaths;

    if (names(cached).length > 0) {
      mode = 'index vs HEAD';
      baseConverted = showConverted('HEAD') ?? []; // null => converted.json is new at this commit
      headConverted = showConverted(''); // rev '' => the index form `:path`
      if (headConverted === null) {
        return {
          error: 'converted.json not in the index',
          baseConverted: [],
          headConverted: [],
          changedPaths: [],
          systemMapText,
          censusEntries,
          mode: 'error',
        };
      }
      changedPaths = names(cached);
    } else {
      const prev = git(root, ['rev-parse', '--verify', '--quiet', 'HEAD~1']);
      if (prev.status !== 0) {
        return {
          error: null,
          baseConverted: [],
          headConverted: [],
          changedPaths: [],
          systemMapText,
          censusEntries,
          mode: 'no HEAD~1 — nothing to compare',
        };
      }
      mode = 'HEAD vs HEAD~1';
      const d = git(root, ['diff', '--name-only', 'HEAD~1', 'HEAD']);
      if (d.status !== 0) {
        return {
          error: 'git diff --name-only HEAD~1 HEAD failed',
          baseConverted: [],
          headConverted: [],
          changedPaths: [],
          systemMapText,
          censusEntries,
          mode: 'error',
        };
      }
      baseConverted = showConverted('HEAD~1') ?? [];
      headConverted = showConverted('HEAD') ?? [];
      changedPaths = names(d);
    }

    return { error: null, baseConverted, headConverted, changedPaths, systemMapText, censusEntries, mode };
  } catch (err) {
    return {
      error: String((err && err.message) || err),
      baseConverted: [],
      headConverted: [],
      changedPaths: [],
      systemMapText,
      censusEntries,
      mode: 'error',
    };
  }
}

/** Spawn `git args` in `root`, capturing stdout/stderr as utf8. */
function defaultGit(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
