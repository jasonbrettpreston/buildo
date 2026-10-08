// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 5 ("keyer B (DeepSeek, separate worktree at a commit
//            without A's draft, `.b` write scope) … seals A's hash before B's brief"), §9 G-PROV keyer arm (witnessed:
//            the `.a` path is absent from the tree of B's recorded worktree commit; declared-only: B's engine-ledger read
//            paths contain no `.a` path); docs/specs/01-pipeline/69_mcbylaw_policy.md M-17;
//            docs/reports/mcbylaw-phase1-plan.md A1..A7 step (1); docs/specs/00-architecture/08_agents.md §C (engine)
//
// The keyer-B RUNNER: one shard → one DeepSeek engine run in a separate git worktree, fail-closed on every ordering and
// blindness precondition. I/O module (git, fs, child process); every dependency is injectable for the tests.
//
//   ensureKeyerBWorktree({mainRoot, bRoot, commit, git})       create the detached B worktree once; → its HEAD commit
//   assertBlind({bRoot, commit, aPaths, lsTree, git, fs})       the witness, before B runs (throws KeyingError)
//   runKeyerB({bRoot, shard, briefB, seal, aSha, runEngine, …})  seal check → witness → brief → engine → collect
//   spawnEngine({engine, env})                                  the default runEngine: node deepseek-exec.js (async)
//   readEnvKey(file, name)                                      one key from a .env file (never printed)
//
// Closed failure codes (KeyingError.code): seal_missing · seal_mismatch · witness_commit_unknown · a_visible_to_b ·
// a_present_in_b_worktree · same_tree · brief_mismatch · engine_failed · b_head_moved · b_missing · b_shape · b_units_mismatch ·
// a_in_b_read_paths · ledger_missing

import { execFileSync, spawn } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';
import { AUTHORED_REL, AUTHORED_SCHEMA, sha256 } from './authored.mjs';
import { KeyingError, extractReadPaths, shardPaths, shardSlug, unitCoverage } from './keying.mjs';
import { gitLsTree } from './keyer-prov.mjs';

const A_DRAFT = /\.a\.json\b/; // \b, not end-of-string: a ledger token may carry a `:line` suffix or punctuation

/** The environment minus GIT_* (a hook's GIT_DIR / GIT_INDEX_FILE would redirect a cwd-based call to another repo). */
export const gitEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !/^GIT_/.test(k)));
/** git in a directory → trimmed stdout (throws on a non-zero exit). Always the repo at `cwd`, never an inherited GIT_DIR. */
export function gitIn(cwd, args) {
  return execFileSync('git', args, { cwd, env: gitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}

/**
 * The keyer-B worktree: created detached at `commit` (default: the main tree's HEAD, which never holds an uncommitted
 * A draft) when absent; an existing one is used at its own HEAD (the witness below decides whether it is blind).
 */
export function ensureKeyerBWorktree({ mainRoot, bRoot, commit = null, git = gitIn, fs = nodeFs }) {
  if (!fs.existsSync(path.join(bRoot, '.git'))) {
    const at = commit || git(mainRoot, ['rev-parse', 'HEAD']);
    git(mainRoot, ['worktree', 'add', '--detach', bRoot, at]);
  }
  return git(bRoot, ['rev-parse', 'HEAD']);
}

/**
 * The blindness witness, run BEFORE the engine: (1) B's commit resolves and its tree holds none of `aPaths` (the same
 * `git ls-tree` witness G-PROV re-runs at --check); (2) no A draft exists in B's working tree (tracked or not).
 */
export function assertBlind({ bRoot, commit, aPaths, lsTree = gitLsTree(bRoot), git = gitIn, fs = nodeFs }) {
  const tree = lsTree(commit);
  if (!tree) throw new KeyingError('witness_commit_unknown', `B's worktree commit ${commit} does not resolve`);
  const seen = new Set(tree);
  const visible = aPaths.filter((p) => seen.has(p));
  if (visible.length) throw new KeyingError('a_visible_to_b', `${visible.join(', ')} in B's commit ${commit}`);
  const present = aPaths.filter((p) => fs.existsSync(path.join(bRoot, p)));
  const dir = path.join(bRoot, AUTHORED_REL);
  const untracked = fs.existsSync(dir) ? git(bRoot, ['ls-files', '-z', '--cached', '--others', '--', AUTHORED_REL]).split('\0').filter((p) => A_DRAFT.test(p)) : [];
  const all = [...new Set([...present, ...untracked])];
  if (all.length) throw new KeyingError('a_present_in_b_worktree', all.join(', '));
}

/** One `NAME=value` line of a .env file (quotes stripped); null when absent. The value is never logged. */
export function readEnvKey(file, name, fs = nodeFs) {
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const k = line.indexOf('=');
    if (k > 0 && line.slice(0, k).trim().replace(/^export\s+/, '') === name) return line.slice(k + 1).trim().replace(/^(['"])(.*)\1$/, '$2') || null;
  }
  return null;
}

/**
 * The default engine call: `node <engine> --repo <bRoot> --brief <rel> --provider=deepseek --max-iterations 40`,
 * async (several shards run in parallel). Resolves with the engine's JSON summary (its last stdout line).
 */
/** The engine's environment: the parent's minus database / cloud / other-provider credentials (B gets page text only). */
export function engineEnv(env, key) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!/^(PG|DATABASE_URL|SUPABASE|ANTHROPIC|OPENAI|GEMINI|GOOGLE|AWS|AZURE|SERPER|GITHUB|GH_|VERCEL|NPM_TOKEN)/i.test(k)) out[k] = v;
  out.DEEPSEEK_API_KEY = key;
  return out;
}

export function spawnEngine({ engine, env, maxIterations = 40 }) {
  return ({ bRoot, briefRel }) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [engine, '--repo', bRoot, '--brief', briefRel, '--provider=deepseek', '--max-iterations', String(maxIterations)], { cwd: bRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => {
        out += d;
      });
      child.stderr.on('data', (d) => {
        err += d;
      });
      child.on('error', (e) => reject(new KeyingError('engine_failed', `spawn: ${e && e.message}`)));
      child.on('close', (code, signal) => {
        if (code !== 0 || signal) {
          reject(new KeyingError('engine_failed', `exit ${code}${signal ? ` signal ${signal}` : ''}; ${(out.trim().split('\n').pop() || '').slice(0, 300)} ${err.trim().slice(-300)}`));
          return;
        }
        const last = out.trim().split('\n').filter(Boolean).pop() || '';
        try {
          resolve(JSON.parse(last));
        } catch (parseErr) {
          reject(new KeyingError('engine_failed', `exit ${code}, no JSON summary (${String(parseErr && parseErr.message)}); stderr: ${err.trim().slice(-400)}`));
        }
      });
    });
}

/**
 * Run keyer B for one shard. Order (each step fail-closed): A's seal exists and equals the current A draft → the
 * blindness witness → B's brief written into B's worktree → the engine → B's draft read back and checked against the
 * planned unit ids → the ledger hashed and its read paths extracted (an `.a` read fails). Writes nothing in the main tree.
 * @returns {{b_bytes: string, b_run: {run_id, ledger_sha256, read_paths, worktree_commit}, engine_status}}
 */
export async function runKeyerB({ mainRoot = null, bRoot, shard, briefB, seal, aSha, aPaths = [], runEngine, git = gitIn, lsTree = gitLsTree(bRoot), fs = nodeFs }) {
  if (mainRoot && path.resolve(mainRoot) === path.resolve(bRoot)) throw new KeyingError('same_tree', 'keyer B must run in a separate worktree, never the authoring tree');
  if (briefB.sha256 && sha256(Buffer.from(briefB.text, 'utf8')) !== briefB.sha256) throw new KeyingError('brief_mismatch', `${shard.key}: B's brief differs from the recorded brief sha`);
  if (!seal || !seal.sha256 || !Number.isSafeInteger(seal.seal_id)) throw new KeyingError('seal_missing', `${shard.key}: A's draft is not sealed — seal before B runs`);
  if (seal.sha256 !== aSha) throw new KeyingError('seal_mismatch', `${shard.key}: A's draft changed after its seal (${seal.sha256.slice(0, 12)}… ≠ ${String(aSha).slice(0, 12)}…)`);
  const paths = shardPaths(shard.key);
  const commit = git(bRoot, ['rev-parse', 'HEAD']);
  assertBlind({ bRoot, commit, aPaths: [...new Set([paths.a, ...(Array.isArray(aPaths) ? aPaths : [])])], lsTree, git, fs }); // this shard's .a always
  const briefRel = `.cursor/keyer-b/${shardSlug(shard.key)}.b.md`;
  fs.mkdirSync(path.dirname(path.join(bRoot, briefRel)), { recursive: true });
  fs.writeFileSync(path.join(bRoot, briefRel), briefB.text);
  const bAbs = path.join(bRoot, paths.b);
  fs.mkdirSync(path.dirname(bAbs), { recursive: true });
  if (fs.existsSync(bAbs)) fs.rmSync(bAbs, { force: true }); // a previous failed attempt of B's own; never A's
  const summary = await runEngine({ bRoot, briefRel });
  const after = git(bRoot, ['rev-parse', 'HEAD']);
  if (after !== commit) throw new KeyingError('b_head_moved', `${shard.key}: B's worktree moved ${commit.slice(0, 12)} → ${after.slice(0, 12)} during the run; the witness no longer holds`);
  if (!summary || summary.status !== 'completed') throw new KeyingError('engine_failed', `${shard.key}: engine status ${summary && summary.status} (run ${summary && summary.run_id})`);
  if (!fs.existsSync(bAbs)) throw new KeyingError('b_missing', `${shard.key}: the engine completed without writing ${paths.b}`);
  const bBytes = fs.readFileSync(bAbs, 'utf8').replace(/\r\n/g, '\n');
  let doc;
  try {
    doc = JSON.parse(bBytes);
  } catch (err) {
    throw new KeyingError('b_shape', `${shard.key}: ${paths.b} does not parse (${err && err.message})`);
  }
  if (!doc || doc.schema !== AUTHORED_SCHEMA || doc.keyer !== 'B' || doc.shard !== shard.key) throw new KeyingError('b_shape', `${shard.key}: not a ${AUTHORED_SCHEMA} keyer-B draft of this shard`);
  const cov = unitCoverage(doc, shard);
  if (cov.missing.length || cov.extra.length) throw new KeyingError('b_units_mismatch', `${shard.key}: missing ${cov.missing.join(', ') || '-'}; extra ${cov.extra.join(', ') || '-'}`);
  if (!summary.ledger_path || !fs.existsSync(summary.ledger_path)) throw new KeyingError('ledger_missing', `${shard.key}: run ${summary.run_id} has no ledger at ${summary.ledger_path}`);
  const ledger = fs.readFileSync(summary.ledger_path);
  const readPaths = extractReadPaths(ledger.toString('utf8'));
  const leaked = readPaths.filter((p) => A_DRAFT.test(p));
  if (leaked.length) throw new KeyingError('a_in_b_read_paths', `${shard.key}: B's ledger read ${leaked.join(', ')}`);
  return { b_bytes: bBytes, b_run: { run_id: summary.run_id, ledger_sha256: sha256(ledger), read_paths: readPaths, worktree_commit: commit }, engine_status: summary.status };
}
