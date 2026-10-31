// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (the commit gate); plan §1, §8, G67-12;
//   R-KM (one verdict per line), R-KP (keep the pass honest), R-LF (base policy, git's own ref pairs).
//
// HOW the gate decides. One mode per entry point (`--commit-msg`, `--staged`, `--push`, `--ci`); the arms live in
// their own modules and this file only composes them, prints one verdict per line, and prints `GATE OK` / `GATE FAIL`.
// There is no flag, no word and no environment variable that turns an arm off: child processes inherit the
// environment untouched (the hook sets GIT_INDEX_FILE and friends and the gate must see them). Fail closed: an
// unreadable input, an unknown mode or any thrown error is `FAIL:X:cannot-decide` and exit 1, never a pass.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, readAt, listTracked } from './git-util.mjs';
import { parseNameStatusZ, allPaths } from './name-status.mjs';
import { classify, POLICY_PATH } from './paths.mjs';
import { resolvePolicy } from './policy-resolve.mjs';
import { holdForCommit, deadGlobLines } from './hold.mjs';
import { parseOwedTable, parseRegisterRows } from './cite-parse.mjs';
import { citeForCommit } from './cite-arms.mjs';
import { panelForCommit } from './panel.mjs';
import { scanScope, allowSet, deadScopeLines, RULE_FILE, ALLOW_REL } from './literal-scan.mjs';
import { buildSummary, parseRefLines, isZeroSha } from './pre-push-summary.mjs';
import { collectRef, heldCount, worktreeScan, pendingCount } from './summary-collect.mjs';
import { scanDbTargetsInFiles, isDbScopePath } from './db-target.mjs';

const CANNOT = 'FAIL:X:cannot-decide';
const DOCS = 'docs/specs/01-pipeline';
const CITE_INPUTS = {
  spec133: `${DOCS}/133_bylaw_handbook.md`,
  registers: [`${DOCS}/69a_mcbylaw_register.md`, `${DOCS}/124a_step_standard_policy_appendix.md`, `${DOCS}/131_lot_configuration_policy.md`],
};
// G67-12: the arms that live outside the repo are a fixed table; the policy names them by `id` only.
// O67-11: MB-68's CLI is `check --mode <commit|push|ci> [--base <rev>]`; exit 0 green, 1 red, 2 could not run.
const EXTERNAL_ARMS = {
  loop: { file: 'scripts/analysis/mcbylaws-loop/loop-gate.mjs', argv: (mode, base) => ['check', '--mode', mode, ...(base ? ['--base', base] : [])] },
};
const LOOP_LINES = 20;
// Operator CARD-gates-recheck item 1: a one-time, EXACT list of shas; never a pattern, never a rule.
const EXCEPTIONS_REL = 'mcbylaws/landing-exceptions.json';
const SHA40 = /^[0-9a-f]{40}$/;
// R-LS: the six pre-policy shas are frozen HERE, so no commit of a range can widen its own exception set.
const LANDING_FROZEN = [
  '42521481cab1ad58b848600367c8d11f1a185b8c',
  '3e7b592e9a21862c93db18bca890f74604c22db3',
  'bef5585e65ccc2a02169902dd18da1ba2fa9349a',
  '6474b00ef0f558f675a9c240a801a3aef05eb1b4',
  'ce116571ba381a0a1b51734820f45ccce2981244',
  '3e3212b99131a49441e06e8c655c8b9663ee36d3',
];
const FROZEN_REASON = 'frozen landing list';
// CARD-prepolicy-exempt (operator 2026-10-31, option A): a commit that is a STRICT ancestor of this bootstrap commit
// (c500c249, which adds the policy file alone) has no policy to be judged by, so it skips the per-commit arms H, C
// and P. Frozen here, never a list, never read from the tip or a data file; the bootstrap commit itself is judged
// through the bootstrap path. Tests give a different sha as a function parameter (`main(argv, { bootstrap })`);
// the CLI always uses this constant.
const BOOTSTRAP_FROZEN = 'c500c24904a80bee53769a660640226b1d0fd1ee';
const ancestryStatus = (cwd, sha, boot) => git(cwd, ['merge-base', '--is-ancestor', sha, boot]);

/**
 * The commits of `shas` that are strict ancestors of `ctx.bootstrap`, decided one by one by `git merge-base
 * --is-ancestor` (exit 0 yes, 1 no). A bootstrap that is not a commit here, or any other exit, is `FAIL:X:cannot-decide`
 * and NOTHING is exempted (fail closed).
 */
function prePolicyCommits(cwd, shas, ctx) {
  const none = new Set();
  if (shas.length === 0) return { set: none, fail: [] };
  const have = git(cwd, ['cat-file', '-e', `${ctx.bootstrap}^{commit}`]);
  if (have.status !== 0) return { set: none, fail: [CANNOT] };
  const set = new Set();
  for (const sha of shas) {
    if (sha === ctx.bootstrap) continue;
    const st = ctx.ancestry(cwd, sha, ctx.bootstrap).status;
    if (st === 0) set.add(sha);
    else if (st !== 1) return { set: none, fail: [CANNOT] };
  }
  return { set, fail: [] };
}

/**
 * CARD-gate-scope-from-bootstrap (operator 2026-10-31, option A): when the range base is a (non-strict) ancestor of the
 * frozen bootstrap, EVERY arm that diffs base..tip -- H/C/P per commit, merges, V, L, the loop arm, the landing-exception
 * and allow-list reads, the policy read -- uses the bootstrap as its effective base: nothing before the policy existed is
 * judged. A base at or after the bootstrap (or on a side line) is unchanged. A bootstrap that is not a commit here, or
 * an ancestry error, is `FAIL:X:cannot-decide` and the base is left as given (fail closed).
 */
function effectiveBase(cwd, b, ctx) {
  const have = git(cwd, ['cat-file', '-e', `${ctx.bootstrap}^{commit}`]);
  if (have.status !== 0) return { base: b, moved: false, fail: [CANNOT] };
  const st = ctx.ancestry(cwd, b, ctx.bootstrap).status;
  if (st === 0) return { base: ctx.bootstrap, moved: true, fail: [] };
  if (st === 1) return { base: b, moved: false, fail: [] };
  return { base: b, moved: false, fail: [CANNOT] };
}

const top = (cwd) => {
  const r = git(cwd, ['rev-parse', '--show-toplevel']);
  return r.status === 0 && r.stdout.trim() !== '' ? r.stdout.trim() : null;
};
const at = (cwd, rev, rel) => readAt(cwd, rev, rel);
const exists = (file) => fs.existsSync(file);

/** The `owed` set and `rows` map arm C reads, from the copies at `rev`. `null` when any copy is missing. */
function citeInputs(cwd, rev) {
  const spec = at(cwd, rev, CITE_INPUTS.spec133);
  const regs = CITE_INPUTS.registers.map((p) => at(cwd, rev, p));
  if (spec === null || regs.some((t) => t === null)) return null;
  const rows = new Map();
  for (const t of regs) for (const [id, v] of parseRegisterRows(t)) if (!rows.has(id)) rows.set(id, v);
  return { owed: parseOwedTable(spec), rows };
}

function externalArmLines(cwd, policy, mode, base) {
  const out = [];
  for (const arm of Array.isArray(policy.external_arms) ? policy.external_arms : []) {
    if (!arm || typeof arm.id !== 'string') return [CANNOT];
    const spec = EXTERNAL_ARMS[arm.id];
    const file = spec ? path.join(cwd, spec.file) : null;
    if (!spec || !exists(file)) {
      if (arm.required) out.push(`FAIL:X:arm-missing:${arm.id}`);
      else out.push(`external arm ${arm.id}: pending`);
      continue;
    }
    const r = spawnSync(process.execPath, [file, ...spec.argv(mode, base)], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    // O67-11: the arm's own first lines are shown, prefixed; exit 1 or 2 (or a spawn error) is a failure.
    const shown = r.stdout ? String(r.stdout).split('\n').filter(Boolean).slice(0, LOOP_LINES) : [];
    for (const l of shown) out.push(`loop: ${l}`);
    if (r.error || r.status !== 0) out.push(`FAIL:X:arm-failed:${arm.id}`);
  }
  return out;
}

/** Arm V over the DB-scope subset of `paths`, read at `rev` (`''` = the index). Unreadable → `FAIL:V:cannot-decide`. */
function dbLines(cwd, rev, paths) {
  const files = [];
  for (const p of paths) {
    const text = readAt(cwd, rev, p);
    if (text === null) return ['FAIL:V:cannot-decide'];
    files.push({ path: p, text });
  }
  return files.length === 0 ? [] : scanDbTargetsInFiles(files);
}

/** The external arms for one range `base..tip`: one call per ref is enough. */

/**
 * O67-01: the allow object for a range — `allowRev`'s copy (absent = nothing allowed) keeps its number and string
 * lists, but its `baseline` is BASE's (absent base file or baseline = `{}`). An unparsable copy is undecidable.
 */
function allowAtBase(cwd, allowRev, baseRev) {
  const parse = (rev) => {
    const text = readAt(cwd, rev, ALLOW_REL);
    return text === null ? null : JSON.parse(text);
  };
  let allow;
  let base;
  try { allow = parse(allowRev); } catch { return null; }
  try { base = parse(baseRev); } catch { return null; }
  if (allow === null) allow = {};
  if (!allow || typeof allow !== 'object' || Array.isArray(allow)) return null;
  if (base !== null && (typeof base !== 'object' || Array.isArray(base))) return null;
  const baseline = base && base.baseline && typeof base.baseline === 'object' ? base.baseline : {};
  return { ...allow, baseline };
}

/** Arm L over repo-relative `files` materialised under `root`, with the allow list read at `rev`. */
function literalLines({ root, cwd, rev, files, policy, allowOwnerRev }) {
  const allowText = readAt(cwd, rev, ALLOW_REL);
  let allow;
  try { allow = allowText === null ? null : JSON.parse(allowText); } catch { allow = null; }
  if (allow === null) return ['FAIL:L:cannot-decide'];
  if (allowOwnerRev !== undefined) {
    allow = allowAtBase(cwd, rev, allowOwnerRev);
    if (allow === null) return ['FAIL:L:cannot-decide'];
  }
  const res = scanScope({
    root, files, policy, allow,
    astGrepBin: path.join(cwd, 'node_modules', '.bin', 'ast-grep'),
    ruleFile: path.join(cwd, RULE_FILE),
  });
  return res.flatMap((v) => v.verdicts);
}

function commitMsg(cwd, msgFile) {
  let text;
  try { text = fs.readFileSync(msgFile, 'utf8'); } catch { return [CANNOT]; }
  if (/^(Merge|Revert) /.test(text)) return [];
  const raw = git(cwd, ['diff', '--cached', '--name-status', '-z', '-M']);
  if (raw.status !== 0) return [CANNOT];
  const entries = parseNameStatusZ(raw.stdout);
  if (entries === null) return [CANNOT];
  const res = resolvePolicy(cwd, 'HEAD', { ownRev: '', entries });
  if (!res.ok) return ['FAIL:H:cannot-decide'];
  const inputs = citeInputs(cwd, '') || { owed: new Set(), rows: new Map() }; // empty sentinels make arm C fail closed on a Layer 2/3 path
  const onDisk = exists(path.join(cwd, 'mcbylaws/APPROVED'));
  return [
    ...holdForCommit({ cwd, policy: res.policy, entries, parentRev: 'HEAD', onDiskApproved: onDisk }),
    ...citeForCommit({ cwd, policy: res.policy, entries, message: text, parentRev: 'HEAD', ownRev: '', ...inputs }),
    ...panelForCommit({ cwd, policy: res.policy, entries, message: text, ownRev: '' }),
  ];
}

function staged(cwd) {
  const raw = git(cwd, ['diff', '--cached', '--name-status', '-z', '-M']);
  if (raw.status !== 0) return [CANNOT];
  const entries = parseNameStatusZ(raw.stdout);
  if (entries === null) return [CANNOT];
  const res = resolvePolicy(cwd, 'HEAD', { ownRev: '', entries });
  if (!res.ok) return ['FAIL:H:cannot-decide'];
  const { policy } = res;
  const paths = allPaths(entries);
  // Fast path: nothing staged is Layer 2/3, in literal scope or in DB scope, and no glob list needs the tree.
  const touches = paths.some((p) => { const c = classify(policy, p); return c.layer23 || c.literalScope || isDbScopePath(p); });
  if (!touches) return [];
  const tracked = listTracked(cwd, 'HEAD');
  if (tracked === null) return ['FAIL:H:cannot-decide'];
  // O67-12: a deleted path has no worktree file and a rename's OLD path is gone too; scan the live paths only.
  const live = entries.filter((e) => e.status !== 'D').map((e) => e.path);
  const scope = live.filter((p) => classify(policy, p).literalScope);
  const db = live.filter((p) => isDbScopePath(p));
  const onDisk = exists(path.join(cwd, 'mcbylaws/APPROVED'));
  return [
    ...holdForCommit({ cwd, policy, entries, parentRev: 'HEAD', onDiskApproved: onDisk }),
    ...deadGlobLines(policy, tracked),
    ...(scope.length > 0 ? literalLines({ root: cwd, cwd, rev: 'HEAD', files: scope, policy }) : []),
    ...dbLines(cwd, '', db),
    ...deadScopeLines(policy, tracked),
    ...externalArmLines(cwd, policy, 'commit'),
  ];
}

/**
 * The dense combined form: one path per file that differs from EVERY parent (a clean merge yields nothing). git
 * writes a NUL per path and, from git 2.42, a NUL before each path too; both give the same path list here.
 */
function combinedPaths(raw) {
  const text = raw.startsWith('\0') ? raw.slice(1) : raw;
  return text.split('\0').filter(Boolean);
}

/**
 * O67-02 (`evil` merge): a merge is judged by its own combined diff, through the same arms as a commit — so a
 * conflict resolved OFF Layer 2/3 (what `--no-merges` hides, and what a clean merge cannot show) still fails.
 */
function mergeArms({ cwd, base, tip, excused = new Set() }) { // `excused` = landing exceptions UNION pre-policy commits
  const merges = git(cwd, ['rev-list', '--merges', '--reverse', `${base}..${tip}`]);
  if (merges.status !== 0) return ['FAIL:C:cannot-decide'];
  const out = [];
  for (const sha of merges.stdout.split('\n').filter(Boolean)) {
    const raw = git(cwd, ['diff-tree', '-r', '-z', '--name-only', '-c', '--no-commit-id', sha]);
    if (raw.status !== 0) { out.push(`FAIL:C:cannot-decide:${sha}`); continue; }
    const entries = combinedPaths(raw.stdout).map((p) => ({ status: 'M', score: null, path: p, oldPath: null }));
    if (entries.length === 0) continue;
    const parentRev = `${sha}^1`;
    if (excused.has(sha)) continue;
    const res = resolvePolicy(cwd, parentRev, { ownRev: sha, entries });
    if (!res.ok) { out.push(`FAIL:H:cannot-decide:${sha}`); continue; }
    const message = git(cwd, ['log', '-1', '--format=%B', sha]);
    if (message.status !== 0) { out.push(`FAIL:C:cannot-decide:${sha}`); continue; }
    const inputs = citeInputs(cwd, parentRev) || { owed: new Set(), rows: new Map() };
    out.push(
      ...holdForCommit({ cwd, policy: res.policy, entries, parentRev, sha, onDiskApproved: false }),
      ...citeForCommit({ cwd, policy: res.policy, entries, message: message.stdout, parentRev, ownRev: sha, sha, ...inputs }),
      ...panelForCommit({ cwd, policy: res.policy, entries, message: message.stdout, ownRev: sha, sha }),
    );
  }
  return out;
}

/**
 * O67-03: one policy for arm L over a whole range — the first policy in force, with `literal_scope` = the UNION of
 * every policy's and `literal_exempt` = the INTERSECTION (an exemption must hold in all of them). `null` = nothing
 * resolved, which arm L reads as `cannot-decide`.
 */
function mergedLiteralPolicy(policies) {
  if (!Array.isArray(policies) || policies.length === 0) return null;
  const scope = [...new Set(policies.flatMap((p) => p.literal_scope || []))];
  const exempt = (policies[0].literal_exempt || []).filter((g) => policies.every((p) => (p.literal_exempt || []).includes(g)));
  return { ...policies[0], literal_scope: scope, literal_exempt: exempt };
}

/**
 * R-LS: the frozen six UNION the list read at the range BASE (never at the tip, so no commit of the range can name
 * itself or an earlier unlisted commit). Absent base file = the frozen six; unparsable or off-shape base file =
 * `FAIL:X:cannot-decide` and only the frozen six apply.
 */
function landingExceptions(cwd, base) {
  const frozen = new Map(LANDING_FROZEN.map((sha) => [sha, FROZEN_REASON]));
  const text = readAt(cwd, base, EXCEPTIONS_REL);
  if (text === null) return { reasons: frozen, fail: [] };
  let data;
  try { data = JSON.parse(text); } catch { return { reasons: frozen, fail: ['FAIL:X:cannot-decide'] }; }
  const list = data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.commits) ? data.commits : null;
  if (list === null || list.some((c) => !c || typeof c !== 'object' || !SHA40.test(c.sha))) {
    return { reasons: frozen, fail: ['FAIL:X:cannot-decide'] };
  }
  for (const c of list) if (!frozen.has(c.sha)) frozen.set(c.sha, c.reason);
  return { reasons: frozen, fail: [] };
}

/** One ref's arms: per commit H, C, P over the range, then L over the range's in-scope files from `git archive`. */
function rangeArms({ cwd, base, tip, pre = { set: new Set(), fail: [] } }) {
  const shas = git(cwd, ['rev-list', '--no-merges', '--reverse', `${base}..${tip}`]);
  if (shas.status !== 0) return ['FAIL:H:cannot-decide', 'FAIL:C:cannot-decide', 'FAIL:P:cannot-decide'];
  // O67-02: an empty non-merge list does NOT mean an empty range -- a range of merges only must still be judged.
  const commits = shas.stdout.split('\n').filter(Boolean);
  const exceptions = landingExceptions(cwd, base);
  const excused = exceptions.reasons;
  const excLines = [...excused].map(([sha, reason]) => `landing exception: ${sha} (${reason || 'listed'})`);
  const out = [...exceptions.fail, ...excLines];

  const cache = new Map();
  const inputsFor = (rev) => {
    if (!cache.has(rev)) cache.set(rev, citeInputs(cwd, rev) || { owed: new Set(), rows: new Map() });
    return cache.get(rev);
  };
  // O67-03: arm L is judged by the policies in force BEFORE each commit, never by the last one (a narrowing
  // commit earlier in the range must not switch arm L off for a later commit that adds a literal).
  const policies = [];
  const baseRes = resolvePolicy(cwd, base);
  if (baseRes.ok) policies.push(baseRes.policy);
  for (const sha of commits) {
    // The landing exception: this exact sha skips H, C and P; every other commit is judged in full.
    if (excused.has(sha)) continue;
    // CARD-prepolicy-exempt: an ancestor of the bootstrap skips H, C and P (arms L and V below still run).
    if (pre.set.has(sha)) continue;
    // O67-03: the first policy in force may be a commit's OWN only when no base policy resolves (O67-04 bootstrap).
    if (policies.length === 0) {
      const at = resolvePolicy(cwd, `${sha}^`, { ownRev: sha });
      if (at.ok) policies.push(at.policy);
    }
    const changes = git(cwd, ['diff-tree', '-r', '-z', '-M', '--name-status', '--no-commit-id', '--root', sha]);
    const entries = changes.status === 0 ? parseNameStatusZ(changes.stdout) : null;
    if (entries === null) {
      out.push(`FAIL:H:cannot-decide:${sha}`, `FAIL:C:cannot-decide:${sha}`, `FAIL:P:cannot-decide:${sha}`);
      continue;
    }
    // O67-04: every commit is judged by its OWN parent's policy (a root commit's `sha^` reads as absent).
    const res = resolvePolicy(cwd, `${sha}^`, { ownRev: sha, entries });
    if (!res.ok) {
      out.push(`FAIL:H:cannot-decide:${sha}`);
      continue;
    }
    policies.push(res.policy);
    const msg = git(cwd, ['log', '-1', '--format=%B', sha]);
    if (msg.status !== 0) {
      out.push(`FAIL:C:cannot-decide:${sha}`, `FAIL:P:cannot-decide:${sha}`);
      continue;
    }
    const message = msg.stdout;
    out.push(
      ...holdForCommit({ cwd, policy: res.policy, entries, parentRev: `${sha}^`, sha, onDiskApproved: false }),
      ...citeForCommit({ cwd, policy: res.policy, entries, message, parentRev: `${sha}^`, ownRev: sha, sha, ...inputsFor(`${sha}^`) }),
      ...panelForCommit({ cwd, policy: res.policy, entries, message, ownRev: sha, sha }),
    );
  }
  out.push(...mergeArms({ cwd, base, tip, excused: new Set([...excused.keys(), ...pre.set]) }));
  // O67-12: a deleted path is not in `git archive <tip>` (the gate would go permanently red); the new side of a
  // rename is kept and its old side is not.
  const diff = git(cwd, ['diff', '--name-only', '-z', '--diff-filter=d', '-M', base, tip]);
  const changed = diff.status !== 0 ? null : diff.stdout.split('\0').filter(Boolean);
  if (changed === null) return [...out, 'FAIL:L:cannot-decide', 'FAIL:V:cannot-decide'];
  out.push(...dbLines(cwd, tip, changed.filter((p) => isDbScopePath(p))));
  // O67-03: scope = the UNION of every `literal_scope` in force, an exemption must hold in ALL of them.
  const literals = mergedLiteralPolicy(policies);
  if (literals === null) return [...out, 'FAIL:L:cannot-decide'];
  const files = changed.filter((p) => classify(literals, p).literalScope);
  if (files.length === 0) return out;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-archive-'));
  try {
    const tar = spawnSync('git', ['archive', '--format=tar', tip, '--', ...files], { cwd, maxBuffer: 64 * 1024 * 1024 });
    const ex = tar.status === 0
      ? spawnSync('tar', ['-x', '-C', tmp], { input: tar.stdout, maxBuffer: 64 * 1024 * 1024 })
      : { status: -1 };
    if (ex.status !== 0) return [...out, 'FAIL:L:cannot-decide'];
    return [...out, ...literalLines({ root: tmp, cwd, rev: tip, files, policy: literals, allowOwnerRev: base })];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const DEFAULT_BASE = (cwd) => (git(cwd, ['rev-parse', '--verify', '--quiet', 'origin/main']).status === 0 ? 'origin/main' : 'main');

/** Build `buildSummary`'s input for `refs` (`[{ref, localSha, remoteSha}]`), arms included. */
function summaryInput({ cwd, refs, ci, ctx }) {
  const arms = [];
  const out = [];
  let policy = null;
  let basePolicy = {};
  const defaultBase = DEFAULT_BASE(cwd);
  for (const r of refs) {
    const zero = !r.remoteSha || isZeroSha(r.remoteSha);
    if (String(r.ref).startsWith('refs/tags/') || isZeroSha(r.localSha)) {
      arms.push('FAIL:S:unsupported-ref');
      out.push({ kind: 'tag', ref: r.ref });
      continue;
    }
    const base = zero ? git(cwd, ['merge-base', r.localSha, defaultBase]) : { status: 0, stdout: r.remoteSha };
    if (base.status !== 0 || base.stdout.trim() === '') {
      arms.push(CANNOT);
      out.push({ kind: 'unknown', ref: r.ref });
      continue;
    }
    const pushBase = base.stdout.trim();
    const eff = effectiveBase(cwd, pushBase, ctx);
    const b = eff.base;
    arms.push(...eff.fail);
    if (eff.moved && b !== pushBase) arms.push(`effective base: ${b.slice(0, 8)} (the bootstrap; push base ${pushBase.slice(0, 8)} is an ancestor of it, so nothing older is judged)`);
    // O67-04: the summary only DISPLAYS; judging is per commit in `rangeArms`. A base without a policy is
    // shown through the tip's copy (the range bootstraps the policy); only when both fail is it undecidable.
    let res = resolvePolicy(cwd, b);
    if (!res.ok) res = resolvePolicy(cwd, r.localSha);
    if (!res.ok) { arms.push('FAIL:H:cannot-decide'); out.push({ kind: 'unknown', ref: r.ref }); continue; }
    const collected = collectRef({ cwd, ref: r.ref, localSha: r.localSha, remoteSha: eff.moved ? b : (zero ? '' : r.remoteSha), policy: res.policy, defaultBase });
    if (collected.error) { arms.push(CANNOT); out.push({ kind: 'unknown', ref: r.ref }); continue; }
    // R-LS: a listed commit is shown as exempt, so the summary prints neither MISSING nor a fail. The set comes from
    // the range BASE; a fail-closed base file adds its verdict here too.
    const exceptions = landingExceptions(cwd, b);
    // CARD-prepolicy-exempt: ancestors of the bootstrap are shown as `pre-policy`, distinct from `exempt`.
    const all = git(cwd, ['rev-list', `${b}..${r.localSha}`]);
    const pre = all.status === 0 ? prePolicyCommits(cwd, all.stdout.split('\n').filter(Boolean), ctx) : { set: new Set(), fail: [CANNOT] };
    const rows = (collected.commits || []).map((c) => (exceptions.reasons.has(c.sha) ? { ...c, panel: 'exempt' }
      : pre.set.has(c.sha) ? { ...c, panel: 'pre-policy' } : c));
    arms.push(...exceptions.fail, ...pre.fail);
    if (pre.set.size > 0) {
      arms.push(`pre-policy: ${[...pre.set].slice(0, 3).map((x) => x.slice(0, 7)).join(',')}${pre.set.size > 3 ? ',...' : ''} (${pre.set.size} commit(s), ancestors of the bootstrap ${ctx.bootstrap.slice(0, 8)}; arms H, C, P skipped)`);
    }
    arms.push(...rangeArms({ cwd, base: b, tip: r.localSha, policy, pre }));
    arms.push(...externalArmLines(cwd, res.policy, ci ? 'ci' : 'push', b));
    // S2: the tip's copy of the policy may not raise held_limit above the base copy's.
    let tipLimit = res.policy.held_limit;
    try { tipLimit = JSON.parse(readAt(cwd, r.localSha, POLICY_PATH) ?? '{}').held_limit ?? tipLimit; } catch { arms.push(CANNOT); }
    basePolicy = res.policy;
    policy = { ...res.policy, held_limit: tipLimit };
    out.push({ ...collected, commits: rows });
  }
  const held = heldCount(policy);
  const worktrees = worktreeScan(policy);
  if (worktrees.error) arms.push('FAIL:S:worktrees-unknown');
  const now = pendingCount(cwd, 'HEAD');
  // S11: a page that overflows writes the full list here; a write that fails throws and `main` reports cannot-decide.
  const writeFull = (text) => {
    const file = path.join(os.tmpdir(), `mcbylaws-summary-${process.pid}.txt`);
    fs.writeFileSync(file, String(text), 'utf8');
    return file;
  };
  return {
    refs: out, policy: policy || {}, basePolicy, held, worktrees, ci, writeFull,
    pending: now === null ? { now: null, was: null } : { now, was: now }, armVerdicts: arms,
  };
}

/** S11: what the operator (or the CI log) sees — `summary.text` unpaged, so `full list:` shows and nothing overflows. */
const shown = (summary) => String(summary.text || '').split('\n').filter(Boolean)
  .map((l) => (l.startsWith('MCBYLAWS: ') ? l.slice('MCBYLAWS: '.length) : l));

function askTty() {
  let fd;
  try { fd = fs.openSync('/dev/tty', 'r+'); } catch { return 'FAIL:S:no-tty'; }
  try {
    fs.writeSync(fd, 'Approve this push? [y/N] ');
    const buf = Buffer.alloc(64);
    const n = fs.readSync(fd, buf, 0, 64, null);
    const answer = n > 0 ? buf.toString('utf8', 0, n).trim() : '';
    return answer === 'y' || answer === 'Y' ? '' : 'FAIL:S:not-approved';
  } catch {
    return 'FAIL:S:no-tty';
  } finally {
    fs.closeSync(fd);
  }
}

const isProtected = (policy, p) => { const c = classify(policy, p); return c.layer23 || c.protected || c.literalScope; };

// A FAIL verdict whose lines carry no FAIL: prefix (a PANEL MISSING line, say) must still exit 1.
const failClosed = (summary, lines) => (summary.verdict === 'FAIL' && !lines.some((l) => String(l).startsWith('FAIL:')) ? [...lines, 'FAIL:S:summary'] : lines);

function push(cwd, stdin, ctx) {
  const refs = parseRefLines(stdin).map((r) => ({ ...r, ref: r.localRef }));
  if (refs.length === 0) return [CANNOT];
  const input = summaryInput({ cwd, refs, ci: false, ctx });
  const summary = buildSummary(input);
  const lines = shown(summary);
  if (summary.verdict === 'FAIL') return failClosed(summary, lines);
  const protectedChange = input.refs.some((r) => (r.changes || []).some((c) => isProtected(input.policy, c.path)
    || (c.oldPath && isProtected(input.policy, c.oldPath))));
  if (!protectedChange) return lines;
  const ask = askTty();
  return ask === '' ? lines : [...lines, ask];
}

function ci(cwd, baseRev, ctx) {
  const res = resolvePolicy(cwd, 'HEAD');
  const input = summaryInput({ cwd, refs: [{ ref: 'refs/heads/HEAD', localSha: 'HEAD', remoteSha: baseRev }], ci: true, ctx });
  const summary = buildSummary(input);
  const lines = [...shown(summary), 'held, worktree and tty: not evaluated in CI'];
  return { verdict: summary.verdict, lines: failClosed(summary, lines), ok: res.ok };
}

function run(argv, opts = {}) {
  const ctx = { bootstrap: opts.bootstrap ?? BOOTSTRAP_FROZEN, ancestry: opts.ancestry ?? ancestryStatus };
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv[0] === '--commit-msg') {
    const cwd = top(process.cwd());
    return { cwd, lines: cwd ? commitMsg(cwd, argv[1]) : [CANNOT] };
  }
  if (argv[0] === '--staged') {
    const cwd = top(process.cwd());
    return { cwd, lines: cwd ? staged(cwd) : [CANNOT] };
  }
  if (argv[0] === '--push') {
    const cwd = top(process.cwd());
    if (!cwd) return { cwd, lines: [CANNOT] };
    let stdin = '';
    try { stdin = fs.readFileSync(0, 'utf8'); } catch { return { cwd, lines: [CANNOT] }; }
    return { cwd, lines: push(cwd, stdin, ctx) };
  }
  if (argv[0] === '--ci') {
    const cwd = top(process.cwd());
    const base = flag('--base');
    if (!cwd || typeof base !== 'string' || base === '') return { cwd, lines: [CANNOT] };
    const r = ci(cwd, base, ctx);
    return { cwd, lines: r.ok ? r.lines : [...r.lines, 'FAIL:H:cannot-decide'] };
  }
  return { cwd: null, lines: [CANNOT] };
}

// arm Q: wired after the queue-tracking commit (plan section 10)

export function main(argv, opts = {}) {
  let lines;
  try {
    lines = run(argv, opts).lines;
  } catch {
    lines = [CANNOT];
  }
  const fails = lines.filter((l) => String(l).startsWith('FAIL:'));
  for (const l of lines) process.stdout.write(`${l}\n`);
  process.stdout.write(fails.length === 0 ? 'GATE OK\n' : 'GATE FAIL\n');
  process.exitCode = fails.length === 0 ? 0 : 1;
  return lines;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
