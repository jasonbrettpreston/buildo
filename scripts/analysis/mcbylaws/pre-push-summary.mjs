// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-KY, R-LD, R-KL (the pre-push summary);
//            69a M-382; plan MB-67 section 4, arm S (S1..S11), G6, G11, F-34, M-382.
//
// PURE: no git, no fs, no tty. The caller collects refs, policy, held/worktree counts and asks the operator.
// A missing input is a failure line, never a quiet pass. Control characters in a path are escaped (R2).
import { classify, matchesAny } from './paths.mjs';

export const HARD_FLOOR = [
  '.husky/**', 'mcbylaws/**', '.github/workflows/test.yml', 'scripts/analysis/mcbylaws/**', 'src/tests/mcbylaws-*',
  'src/tests/fixtures/mcbylaws-gate/**', 'docs/reports/generated/precommit-budget.json',
];
const EXPECTED_ANSWERS = ['mcbylaws/oracle/**', 'src/tests/fixtures/bylaw-golden-lots/**', 'scripts/analysis/bylaw-validation/coa-expected/**'];
const MAX_LINES = 40;

/** @param {string} p */
export function escapePath(p) {
  let out = '';
  for (const ch of String(p)) {
    const code = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`;
    else out += ch;
  }
  return out;
}

/** @param {string} s a sha */
export const isZeroSha = (s) => s === '0'.repeat(40);

/** git ref name a pre-push line carries (refs/heads/x -> x); anything else is used as is. */
const refName = (ref) => String(ref).replace(/^refs\/(heads|tags)\//, '');
/** pre-push kind: a zero local sha is a delete, a tag ref is unsupported. */
const refKind = (r) => (r.kind ? r.kind : (isZeroSha(r.localSha) ? 'delete' : (String(r.localRef || '').startsWith('refs/tags/') ? 'tag' : 'branch')));

/**
 * PURE: git's pre-push stdin, four space-separated fields per line.
 * @param {string} stdin
 * @returns {Array<{localRef:string, localSha:string, remoteRef:string, remoteSha:string}>}
 */
export function parseRefLines(stdin) {
  return String(stdin || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [localRef, localSha, remoteRef, remoteSha] = l.split(' ');
    return { localRef, localSha, remoteRef, remoteSha };
  });
}

const head = (ref) => {
  const { sha, subject, date } = ref.approvedChange || ref.approvedSince || {};
  if (ref.approvedChange) return `APPROVED CHANGED in ${sha} ${escapePath(subject)}`;
  if (ref.approvedSince) return `APPROVED present since ${sha} ${escapePath(date)}`;
  return 'HOLD       APPROVED absent';
};
const isProtected = (policy, p) => classify(policy, p).protected || matchesAny(HARD_FLOOR, p) || classify(policy, p).layer23;
const row = (p, c) => `  ${escapePath(p)}   +${c.added ?? 0} -${c.deleted ?? 0}${matchesAny(EXPECTED_ANSWERS, p) ? ' ** EXPECTED ANSWERS MOVED **' : ''}`;
/** S4: a protected side is shown; a rename fills in the other side only when it too is protected. */
const sides = (policy, c) => {
  const hit = [c.path, c.oldPath].filter((p) => p && isProtected(policy, p));
  return hit.length === 1 && c.oldPath && c.path ? [c.path, c.oldPath].filter(Boolean) : hit;
};

function section(ref, input) {
  const { policy } = input;
  const name = escapePath(refName(ref.ref));
  if (refKind(ref) !== 'branch') return { lines: [`PUSH ${name}`, head(ref), `MCBYLAWS: FAIL:S:unsupported-ref ${name}`], fail: true };
  const out = [`PUSH ${name}  ${head(ref)}`];
  let fail = false;
  const rows = [];
  for (const c of ref.changes || []) for (const p of sides(policy, c)) rows.push(row(p, c));
  if (rows.length > 0) out.push('PROTECTED:', ...rows);
  else out.push('MCBYLAWS: no protected paths changed');
  for (const c of ref.commits || []) {
    const sha7 = String(c.sha).slice(0, 7);
    const label = c.panel === 'invalid' ? 'INVALID' : c.panel === 'exempt' ? 'exempt' : c.panel ? 'present' : 'MISSING';
    if (c.layer23 === true) out.push(`  ${sha7} ${c.task} ${(c.rules || []).join(',')} ${label}`);
    if (c.panel === false) { out.push(`PANEL MISSING ${sha7} ${escapePath(c.task)}`); fail = true; }
    // S7: a record the panel arm would refuse (wrong task, unreadable) fails the push too.
    if (c.panel === 'invalid') { out.push(`PANEL INVALID ${sha7} ${escapePath(c.task)}`); fail = true; }
  }
  return { lines: out, fail };
}

function groups(lines) {
  const counts = new Map();
  for (const l of lines) {
    const p = l.trim().split(' ')[0].replace(/^PUSH /, '');
    const g = p.split('/')[0] || '(root)';
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  return [...counts].map(([g, n]) => `  ${g}: ${n}`);
}

const collect = (input) => {
  const { policy, basePolicy, ci } = input;
  const out = [];
  let fail = false;
  let review = false;
  for (const ref of input.refs || []) {
    const s = section(ref, input);
    out.push('', ...s.lines);
    if (s.fail) fail = true;
  }
  const held = input.held || {};
  const limit = Number.isInteger(policy && policy.held_limit) ? policy.held_limit : -1;
  if (limit < 1 || !Number.isInteger(held.count)) out.push(`MCBYLAWS: FAIL:S:held-over-n held limit unknown`);
  else if (held.count > limit) { out.push(`MCBYLAWS: FAIL:S:held-over-n ${held.count} of ${limit}`); fail = true; }
  else out.push(`HELD PATCHES  ${held.count} of ${limit}${held.count === limit ? ', may only fall' : ''}`);
  const baseLimit = Number.isInteger(basePolicy && basePolicy.held_limit) ? basePolicy.held_limit : Infinity;
  if (Number.isInteger(policy && policy.held_limit) && policy.held_limit > baseLimit) { out.push('MCBYLAWS: FAIL:S:n-raised'); fail = true; }
  const wt = input.worktrees || {};
  if (ci) out.push('held, worktrees: not evaluated in CI');
  else if (!Number.isInteger(wt.count) || !Number.isInteger(wt.dirty) || !Number.isInteger(wt.unpushed)) { out.push('MCBYLAWS: FAIL:S:worktrees-unknown'); fail = true; }
  else {
    out.push(`WORKTREES  ${wt.count} McBylaws worktrees: ${wt.dirty} dirty, ${wt.unpushed} commits not on any remote${wt.dirty > 0 ? ' DIRTY' : ''}`);
    if (wt.dirty > 0) review = true;
  }
  const pending = input.pending || {};
  if (!Number.isInteger(pending.now)) out.push(`MCBYLAWS: FAIL:S:pending-unknown`);
  else out.push(`pending/  ${pending.now} red-by-design tests (was ${pending.was})${pending.now > pending.was ? ' RISING' : ''}`);
  for (const v of input.armVerdicts || []) { out.push(`MCBYLAWS: ${v}`); if (v.startsWith('FAIL:')) fail = true; }
  if (!ci && input.tty === false) { out.push('MCBYLAWS: FAIL:S:no-tty'); fail = true; }
  const verdict = fail ? 'FAIL' : review ? 'REVIEW' : 'OK';
  const asks = !fail && !ci && input.tty !== false && out.some((l) => l.startsWith('PROTECTED:'));
  return { lines: out, verdict, ask: asks ? 'Approve this push? [y/N]' : null };
};

/**
 * @param {object} input `{refs, policy, basePolicy, held, worktrees, pending, armVerdicts, tty, ci, writeFull}`
 * @returns {{text:string, verdict:'FAIL'|'REVIEW'|'OK', lines:string[]}}
 */
export function buildSummary(input) {
  const { lines, verdict, ask } = collect(input || {});
  const body = lines.filter(Boolean);
  if (body.length <= MAX_LINES) return { text: [body.join('\n'), ask].filter(Boolean).join('\n'), verdict, lines: body };
  // S11: the page is at most MAX_LINES; more than that is counted per group and the full list is written out.
  const all = input || {};
  if (typeof all.writeFull !== 'function') return { text: [...body, 'MCBYLAWS: FAIL:S:overflow'].join('\n'), verdict: 'FAIL', lines: body };
  const path = all.writeFull(body.join('\n'));
  const page = body.filter((l) => !l.startsWith('  '));
  const text = [...page, ...groups(body), `full list: ${path}`, ask].filter(Boolean).join('\n');
  return { text, verdict, lines: body };
}
