// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-321 (each round pre-registers, committed alone and before the round, the rows it expects to move and the expected totals; an unexpected move is a finding, not a pass)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 7 and the "Prereg path" section (the prereg lives at coa-expected/prereg-<MB-id>-<round>.json, MB-67 P67-1; coa-round.mjs is imported unchanged)
// Pure functions return string[] of violation codes (empty = green); a code with a detail is `code:detail`.
// coa-round.mjs is IMPORTED UNCHANGED: the shape, the moves and the totals are its C-4 form, never a second copy here.
// The only IO is gitPreregHistory, which reads git; it scrubs every GIT_* variable so a -C <dir> argument alone decides the repository.
import { execFileSync } from 'node:child_process';
import { diffMoves, checkPrereg, checkPreregShape } from '../bylaw-validation/coa-round.mjs';

const PREREG_DIR = 'scripts/analysis/bylaw-validation/coa-expected';
const TASK_ID = /^MB-\d+$/;
// O68-04: the group whose totals a prereg registers when it names none (the 172 set, the only group with percent floors).
const DEFAULT_GROUP = 'coa172';

/** The one home of a round's pre-registration (plan "Prereg path"; MB-67 P67-1): coa-expected/prereg-<MB-id>-<round>.json. */
export function preregPath(task, round) {
  return `${PREREG_DIR}/prereg-${task}-${round}.json`;
}

/** The coa-round form, plus the task the prereg names (MB-67 reads it) and the optional group (absence reads as the default group). */
export function checkPreregFile(pre) {
  const out = checkPreregShape(pre).map((msg) => `prereg_shape:${msg}`);
  if (typeof pre.task !== 'string' || !TASK_ID.test(pre.task)) out.push('prereg_task_missing');
  if (typeof pre.increment !== 'string') out.push('prereg_shape:increment must be a string');
  if (pre.group !== undefined && typeof pre.group !== 'string') out.push('prereg_shape:group must be a string');
  return out;
}

/** The group a prereg registers totals for (O68-04): its own `group`, else the 172 set (the only group with percent floors). */
const groupOf = (pre) => (pre && typeof pre.group === 'string' && pre.group ? pre.group : DEFAULT_GROUP);

const rowsOfGroup = (rows, group) => (rows || []).filter((r) => r && (r.group === undefined || r.group === group));

const itemOf = (n) => (/^\d+$/.test(String(n)) ? Number(n) : n);

/** Gate-form rows [{group, id: '<notice>|<n>', status, clause}] -> scorer rows the C-4 diff keys by notice and item. */
export function toScorerRows(rows) {
  return (rows || []).map((r) => {
    let s = String(r.id || '');
    // ids are group-qualified ("<group>|<notice>|<n>", O68-07); a prereg names the NOTICE, so the group prefix is stripped
    if (r.group && s.startsWith(`${r.group}|`)) s = s.slice(String(r.group).length + 1);
    const i = s.lastIndexOf('|');
    return {
      notice: i < 0 ? s : s.slice(0, i),
      n: itemOf(i < 0 ? '' : s.slice(i + 1)),
      class: r.status,
      clause_norm: r.clause,
      clause: r.clause,
    };
  });
}

const counts = (rows) => {
  const out = {};
  for (const r of rows || []) out[r.status] = (out[r.status] || 0) + 1;
  return out;
};

const BASE_ROWS_NOTE = 'prereg moves not checked: no base rows';

/**
 * The notes a prereg verdict owes the operator (O68-04), never a violation: a prereg checked with no base rows cannot compare moves,
 * so `evaluateGate` must SAY so instead of passing silently. Returns ['prereg moves not checked: no base rows'] when baseRows is null.
 */
export function preregNotes(pre, baseRows) {
  void pre;
  return baseRows == null ? [BASE_ROWS_NOTE] : [];
}

/**
 * Expected against actual on the gate's rows, for ONLY the group the prereg registers (`pre.group`, default 'coa172'): the totals
 * of one group are never compared with another group's rows (O68-04). baseRows null = no baseline, so moves are not checked (the
 * totals still are; preregNotes reports the unchecked moves).
 */
export function checkPreregMoves(pre, baseRows, curRows) {
  const group = groupOf(pre);
  const cur = rowsOfGroup(curRows, group);
  const base = baseRows == null ? null : rowsOfGroup(baseRows, group);
  const moves = base == null ? null : diffMoves(toScorerRows(base), toScorerRows(cur));
  const r = checkPrereg(pre, moves, counts(cur));
  return [
    ...r.unexpected.map((m) => `unexpected_move:${m.notice}#${m.n} ${m.from}->${m.to}`),
    ...r.missing.map((m) => `missing_move:${m.clause}`),
    ...r.totals_diff.map((t) => `totals_diff:${t}`),
  ];
}

/** A finding cannot be accepted into the record: accept over any violation is refused by name. */
export function preregRefusesAccept(verdictViolations, decision) {
  return decision === 'accept' && (verdictViolations || []).length > 0 ? ['accept_with_prereg_finding'] : [];
}

/**
 * M-321 over git history: the prereg is ONE commit and it lands before the round.
 * preregCommits = commits touching the prereg, oldest first, each {sha, files}; roundCommit = the commit that ADDED the round record, or null.
 * isStrictAncestor(a, b) = a is an ancestor of b and not b itself.
 */
export function checkPreregHistory({ preregCommits, roundCommit, isStrictAncestor, preregFile }) {
  if (!roundCommit) return []; // the round has not landed: nothing to order yet
  const commits = preregCommits || [];
  if (!commits.length) return ['prereg_missing'];
  const out = [];
  if (commits.length > 1) out.push('prereg_edited_after_first_commit');
  const first = commits[0];
  if (!isStrictAncestor(first.sha, roundCommit.sha)) out.push('prereg_not_strictly_before_round');
  const files = first.files || [];
  if (files.length !== 1 || files[0] !== preregFile) out.push('prereg_commit_not_alone');
  return out;
}

// A hook exports GIT_DIR / GIT_INDEX_FILE; without this scrub a `git -C <dir>` call would read and write the CALLING repository
// (observed in src/tests/bylaw-use-scope-prereg.infra.test.ts). Reading process.env only to build the scrubbed copy is the single permitted use.
const scrubbedEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

const gitTemp = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: scrubbedEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const nonEmpty = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** The argument checkPreregHistory takes, read from git. The round record's first add is its last log line; the round is unwritten until then. */
export function gitPreregHistory(root, preregFile, recordFile) {
  const g = (args) => gitTemp(root, args);
  const added = nonEmpty(g(['log', '--diff-filter=A', '--format=%H', '--', recordFile]));
  const roundCommit = added.length ? { sha: added[added.length - 1] } : null;
  const preregCommits = nonEmpty(g(['log', '--reverse', '--format=%H', '--', preregFile])).map((sha) => ({ sha, files: nonEmpty(g(['show', '--name-only', '--format=', sha])) }));
  const isStrictAncestor = (a, b) => {
    if (!a || !b || a === b) return false;
    try {
      gitTemp(root, ['merge-base', '--is-ancestor', a, b]);
      return true;
    } catch {
      return false;
    }
  };
  return { preregCommits, roundCommit, isStrictAncestor, preregFile };
}
