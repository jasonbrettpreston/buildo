// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-321 (each round pre-registers, committed alone and before the round, the rows it expects to move and the expected totals; an unexpected move is a finding, not a pass)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 7 and the "Prereg path" section (the prereg lives at coa-expected/prereg-<MB-id>-<round>.json, MB-67 P67-1; coa-round.mjs is imported unchanged)
// Pure functions return string[] of violation codes (empty = green); a code with a detail is `code:detail`.
// coa-round.mjs is IMPORTED UNCHANGED: the shape, the moves and the totals are its C-4 form, never a second copy here.
// The only IO is gitPreregHistory, which reads git; it scrubs every GIT_* variable so a -C <dir> argument alone decides the repository.
import { execFileSync } from 'node:child_process';
import { diffMoves, checkPrereg, checkPreregShape } from '../bylaw-validation/coa-round.mjs';
import { isRuled, sentinelsOk } from '../mcbylaws/cite-parse.mjs';
import { landsId } from '../mcbylaws/cite-arms.mjs';

const PREREG_DIR = 'scripts/analysis/bylaw-validation/coa-expected';
const TASK_ID = /^MB-\d+$/;
// O68-04: the group whose totals a prereg registers when it names none (the 172 set, the only group with percent floors).
const DEFAULT_GROUP = 'coa172';

/** A prereg path coa-expected/prereg-<MB-id>-<n>.json for a given n. Under R-MA (MB-79 h) n is the task's own number (1, 2, ...), not the loop round, and the name form is owned by ../mcbylaws/prereg-name.mjs (PREREG_FORM_RE). This helper does not validate the form, and no gate path calls it. */
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

/**
 * Expected against actual on the gate's rows, for ONLY the group the prereg registers (`pre.group`, default 'coa172'): the totals
 * of one group are never compared with another group's rows (O68-04). baseRows null = no baseline, so moves are not compared here;
 * evaluateGate refuses that round (prereg_moves_unchecked, MB-79 j-1)
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

/**
 * The commit that adds `rel`: the LAST line of `git log --diff-filter=A --format=%H <rev> -- <rel>` from `rev` (default HEAD; MB-79 (o):
 * the pushed tip), i.e. the oldest add, or null.
 * `git(root, args)` returns stdout and throws on a git failure (the throw is the caller's to handle). R-MA (MB-79 h) and gitPreregHistory share it.
 */
export function recordAddCommit(git, root, rel, rev = 'HEAD') {
  const added = nonEmpty(String(git(root, ['log', '--diff-filter=A', '--format=%H', rev, '--', rel]) ?? ''));
  return added.length ? added[added.length - 1] : null;
}

/**
 * The argument checkPreregHistory takes, read from git. The round record's first add is its last log line; the round is unwritten until then.
 * Every log reads from `rev` (default HEAD; MB-79 (o)).
 */
export function gitPreregHistory(root, preregFile, recordFile, rev = 'HEAD') {
  const g = (args) => gitTemp(root, args);
  const add = recordAddCommit(gitTemp, root, recordFile, rev);
  const roundCommit = add ? { sha: add } : null;
  const preregCommits = nonEmpty(g(['log', '--reverse', '--format=%H', rev, '--', preregFile])).map((sha) => ({ sha, files: nonEmpty(g(['show', '--name-only', '--format=', sha])) }));
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

// The label a per-move finding carries: the entry's index and its clause, capped, JSON-escaped so a newline cannot forge a second line.
const moveLabel = (i, entry) => {
  const clause = entry && typeof entry === 'object' && typeof entry.clause === 'string' ? entry.clause : '';
  return `${i}:${JSON.stringify(clause.slice(0, 80))}`;
};

// R-LE (124a:1049): an unreadable input is refused by name, never a crash that loses the whole verdict. String(v)
// throws for a null-prototype object and for an object whose toString throws; fall back to the value's typeof.
const safeText = (v) => { try { return String(v); } catch { return typeof v; } };

const isRegister = (register) => Boolean(register) && typeof register === 'object' && register.rows instanceof Map && register.owed instanceof Set;

/**
 * R-LZ (drafts.md:237): "the gate will refuse a move the prereg does not list and a listed move with no RULED id".
 * R-LE (124a:1049): RULED is the closed list of in-force Status words the generator emits (RETIRED, SUPERSEDED,
 * PROPOSED and OWED are not RULED). R-KG (124a:1015): an OWED rule is usable only when its own lock lands in the
 * same commit, so the arm C landsId is reused for it, never copied.
 * Pure: never throws, never mutates; [] is green. `entries` are the commit's {status, path} rows (default []).
 * @returns {string[]} one code per refused move, in array order
 */
export function checkMoveRulings(pre, register, entries = []) {
  const moves = pre && typeof pre === 'object' && Array.isArray(pre.expected_moves) ? pre.expected_moves : [];
  if (moves.length === 0) return [];
  if (!isRegister(register)) return ['move_ruling_register_missing'];
  const { rows, owed } = register;
  if (!sentinelsOk(owed, rows)) return ['move_ruling_register_empty'];
  const list = Array.isArray(entries) ? entries : [];
  const out = [];
  moves.forEach((entry, i) => {
    const ruling = entry && typeof entry === 'object' ? entry.ruling : undefined;
    const label = moveLabel(i, entry);
    if (ruling === undefined || ruling === null || ruling === '') {
      out.push(`move_ruling_missing:${label}`);
      return;
    }
    const id = typeof ruling === 'string' ? ruling : '';
    const lands = () => { try { return landsId(id, rows, owed, list); } catch { return false; } };
    const usable = id !== '' && ((isRuled(rows, id) && !owed.has(id)) || lands());
    if (!usable) out.push(`move_ruling_not_ruled:${label}:${JSON.stringify(safeText(ruling).slice(0, 80))}`);
  });
  return out;
}
