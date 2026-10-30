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
import { holdForCommit, holdForRange, deadGlobLines } from './hold.mjs';
import { parseOwedTable, parseRegisterRows } from './cite-parse.mjs';
import { citeForCommit } from './cite-arms.mjs';
import { panelForCommit } from './panel.mjs';
import { scanScope, allowSet, deadScopeLines, RULE_FILE, ALLOW_REL } from './literal-scan.mjs';
import { buildSummary, parseRefLines, isZeroSha } from './pre-push-summary.mjs';
import { collectRef, heldCount, worktreeScan, pendingCount } from './summary-collect.mjs';

const CANNOT = 'FAIL:X:cannot-decide';
const DOCS = 'docs/specs/01-pipeline';
const CITE_INPUTS = {
  spec133: `${DOCS}/133_bylaw_handbook.md`,
  registers: [`${DOCS}/69a_mcbylaw_register.md`, `${DOCS}/124a_step_standard_policy_appendix.md`, `${DOCS}/131_lot_configuration_policy.md`],
};
// G67-12: the arms that live outside the repo are a fixed table; the policy names them by `id` only.
const EXTERNAL_ARMS = { loop: { file: 'scripts/analysis/mcbylaws-loop/loop-gate.mjs', argv: (mode) => ['--mode', mode] } };

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

function externalArmLines(cwd, policy, mode) {
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
    const r = spawnSync(process.execPath, [file, ...spec.argv(mode)], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status !== 0) out.push(`FAIL:X:arm-failed:${arm.id}`);
  }
  return out;
}

/** Arm L over repo-relative `files` materialised under `root`, with the allow list read at `rev`. */
function literalLines({ root, cwd, rev, files, policy }) {
  const allowText = readAt(cwd, rev, ALLOW_REL);
  let allow;
  try { allow = allowText === null ? null : JSON.parse(allowText); } catch { allow = null; }
  if (allow === null) return ['FAIL:L:cannot-decide'];
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
  // Fast path: nothing staged is Layer 2/3 or in literal scope, and no glob list needs the tracked tree.
  const touches = paths.some((p) => { const c = classify(policy, p); return c.layer23 || c.literalScope; });
  if (!touches) return [];
  const tracked = listTracked(cwd, 'HEAD');
  if (tracked === null) return ['FAIL:H:cannot-decide'];
  const scope = paths.filter((p) => classify(policy, p).literalScope);
  const onDisk = exists(path.join(cwd, 'mcbylaws/APPROVED'));
  return [
    ...holdForCommit({ cwd, policy, entries, parentRev: 'HEAD', onDiskApproved: onDisk }),
    ...deadGlobLines(policy, tracked),
    ...(scope.length > 0 ? literalLines({ root: cwd, cwd, rev: 'HEAD', files: scope, policy }) : []),
    ...deadScopeLines(policy, tracked),
    ...externalArmLines(cwd, policy, 'staged'),
  ];
}

/** One ref's arms: per commit H, C, P over the range, then L over the range's in-scope files from `git archive`. */
function rangeArms({ cwd, base, tip, policy }) {
  const res = resolvePolicy(cwd, base);
  if (!res.ok) return ['FAIL:H:cannot-decide', 'FAIL:C:cannot-decide', 'FAIL:P:cannot-decide'];
  const inputs = citeInputs(cwd, tip);
  const out = holdForRange({ cwd, policy: res.policy, base, tip });
  const shas = git(cwd, ['rev-list', '--no-merges', '--reverse', `${base}..${tip}`]);
  if (shas.status !== 0) return [...out, 'FAIL:C:cannot-decide', 'FAIL:P:cannot-decide'];
  for (const sha of shas.stdout.split('\n').filter(Boolean)) {
    const changes = git(cwd, ['diff-tree', '-r', '-z', '-M', '--name-status', '--no-commit-id', '--root', sha]);
    const entries = changes.status === 0 ? parseNameStatusZ(changes.stdout) : null;
    const msg = git(cwd, ['log', '-1', '--format=%B', sha]);
    if (entries === null || msg.status !== 0 || inputs === null) {
      out.push(`FAIL:C:cannot-decide:${sha}`, `FAIL:P:cannot-decide:${sha}`);
      continue;
    }
    const message = msg.stdout;
    out.push(
      ...citeForCommit({ cwd, policy: res.policy, entries, message, parentRev: `${sha}^`, ownRev: sha, sha, ...inputs }),
      ...panelForCommit({ cwd, policy: res.policy, entries, message, ownRev: sha, sha }),
    );
  }
  const diff = git(cwd, ['diff', '--name-only', '-z', '-M', base, tip]);
  const files = diff.status !== 0 ? null : diff.stdout.split('\0').filter(Boolean)
    .filter((p) => classify(res.policy, p).literalScope);
  if (files === null) return [...out, 'FAIL:L:cannot-decide'];
  if (files.length === 0) return out;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-archive-'));
  try {
    const tar = spawnSync('git', ['archive', '--format=tar', tip, '--', ...files], { cwd, maxBuffer: 64 * 1024 * 1024 });
    const ex = tar.status === 0
      ? spawnSync('tar', ['-x', '-C', tmp], { input: tar.stdout, maxBuffer: 64 * 1024 * 1024 })
      : { status: -1 };
    if (ex.status !== 0) return [...out, 'FAIL:L:cannot-decide'];
    return [...out, ...literalLines({ root: tmp, cwd, rev: tip, files, policy: res.policy })];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const DEFAULT_BASE = (cwd) => (git(cwd, ['rev-parse', '--verify', '--quiet', 'origin/main']).status === 0 ? 'origin/main' : 'main');

/** Build `buildSummary`'s input for `refs` (`[{ref, localSha, remoteSha}]`), arms included. */
function summaryInput({ cwd, refs, ci }) {
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
      out.push({ kind: 'unknown' });
      continue;
    }
    const b = base.stdout.trim();
    const res = resolvePolicy(cwd, b);
    if (!res.ok) { arms.push('FAIL:H:cannot-decide'); out.push({ kind: 'unknown' }); continue; }
    const collected = collectRef({ cwd, ref: r.ref, localSha: r.localSha, remoteSha: zero ? '' : r.remoteSha, policy: res.policy, defaultBase });
    if (collected.error) { arms.push(CANNOT); out.push({ kind: 'unknown' }); continue; }
    arms.push(...rangeArms({ cwd, base: b, tip: r.localSha, policy }));
    // S2: the tip's copy of the policy may not raise held_limit above the base copy's.
    let tipLimit = res.policy.held_limit;
    try { tipLimit = JSON.parse(readAt(cwd, r.localSha, POLICY_PATH) ?? '{}').held_limit ?? tipLimit; } catch { arms.push(CANNOT); }
    basePolicy = res.policy;
    policy = { ...res.policy, held_limit: tipLimit };
    out.push(collected);
  }
  const held = heldCount(policy);
  const worktrees = worktreeScan(policy);
  if (worktrees.error) arms.push('FAIL:S:worktrees-unknown');
  const now = pendingCount(cwd, 'HEAD');
  return {
    refs: out, policy: policy || {}, basePolicy, held, worktrees, ci,
    pending: now === null ? { now: null, was: null } : { now, was: now }, armVerdicts: arms,
  };
}

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

function push(cwd, stdin) {
  const refs = parseRefLines(stdin);
  if (refs.length === 0) return [CANNOT];
  const input = summaryInput({ cwd, refs, ci: false });
  const summary = buildSummary(input);
  const lines = [...summary.lines.map((l) => (l.startsWith('MCBYLAWS: ') ? l.slice(11) : l))];
  if (summary.verdict === 'FAIL') return lines;
  const protectedChange = input.refs.some((r) => (r.changes || []).some((c) => isProtected(input.policy, c.path)
    || (c.oldPath && isProtected(input.policy, c.oldPath))));
  if (!protectedChange) return lines;
  const ask = askTty();
  return ask === '' ? [...lines, 'GATE OK'] : [...lines, ask];
}

function ci(cwd, baseRev) {
  const res = resolvePolicy(cwd, 'HEAD');
  const input = summaryInput({ cwd, refs: [{ ref: 'refs/heads/HEAD', localSha: 'HEAD', remoteSha: baseRev }], ci: true });
  const summary = buildSummary(input);
  const lines = [...summary.lines.map((l) => (l.startsWith('MCBYLAWS: ') ? l.slice(11) : l)), 'held, worktree and tty: not evaluated in CI'];
  return { verdict: summary.verdict, lines, ok: res.ok };
}

function run(argv) {
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
    return { cwd, lines: push(cwd, stdin) };
  }
  if (argv[0] === '--ci') {
    const cwd = top(process.cwd());
    const base = flag('--base');
    if (!cwd || typeof base !== 'string' || base === '') return { cwd, lines: [CANNOT] };
    const r = ci(cwd, base);
    return { cwd, lines: r.ok ? r.lines : [...r.lines, 'FAIL:H:cannot-decide'] };
  }
  return { cwd: null, lines: [CANNOT] };
}

// arm Q: wired after the queue-tracking commit (plan section 10)

export function main(argv) {
  let lines;
  try {
    lines = run(argv).lines;
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
