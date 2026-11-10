// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-09 (a separate decisions spec with a Lock column that resolves) and
//            rule 5 (a RULED row's lock paths exist; an OWED row's lock path is a valid src/tests/surfaces/*.test.ts that does NOT yet exist),
//            rule 3 (never an OWED marker with no lock path), rule 2 (one lock per row, in the last cell, read by arm C).
//
// MF-43 · McFrontend queue · lane T. The FE-09 lock. The register is parsed by the gate's own parser (`parseRegisterRows`, cite-parse.mjs), so this
// lock and arm C can never read a row two ways (plan D-3, R-27). "Exists" means TRACKED by git (`git ls-files`), so an untracked local file never
// satisfies a lock (the Spec 124 register-lock idea). PROSE-ONLY (D-4): rule 5's third clause, "a .db.test.ts lock must be named in a CI step
// (test.yml)", is not asserted here: `npm run test` excludes every *.db.test.ts and no workflow step names a surface test file today; it is MF-25's.
// FLIP_PENDING is the plan's shrink-only list (section 5 fallback, the Spec 124 grandfather pattern): it must equal exactly the OWED rows whose lock
// is already landed, and the lane R commit that flips such a row removes its id here.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseRegisterRows } from '../../../scripts/analysis/mcbylaws/cite-parse.mjs';

const ROOT = process.cwd();
const REGISTER = 'docs/specs/02-web-admin/135_mcfrontend_decisions_register.md';
const OWED_LOCK_RE = /^src\/tests\/surfaces\/[^/]+\.test\.tsx?$/;
const ROW_HEAD_RE = /^\| (?:~~\*\*)?(FE-\d+)(?:\*\*~~)? \|/;
const SEE_RE = /\bsee (FE-\d+)\b/;
const SENTINEL = 'FE-01';
// Empty since the FE-10 flip (RULED 2026-11-09, lock 6aca7c76d, MF-18). Closed and shrink-only.
// Dated 2026-11-09 (MF-37): FE-32 and FE-33 join it because their locks landed in the MF-37 code commit (7ad4ec42c) while the rows stay OWED
// until the operator approves the flip (plan v3 section 7 step 8); the flip commit removes both ids. The list then shrinks back to empty.
// Dated 2026-11-09 (MF-37 flip; operator "a, 1-3 approved"): FE-32 and FE-33 are RULED, so the list is empty again.
const FLIP_PENDING: readonly string[] = [];

type Row = { status: string; locks: string[] };

/** The last pipe cell of each FE row line (first wins), split exactly as cite-parse does. */
function lastCells(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    const m = ROW_HEAD_RE.exec(line);
    if (!m?.[1] || out.has(m[1])) continue;
    out.set(m[1], line.split(' | ').pop()!.replace(/\|+\s*$/, '').trim());
  }
  return out;
}

function registerLockProblems(text: string, tracked: ReadonlySet<string>, flipPending: readonly string[] = FLIP_PENDING): string[] {
  const problems: string[] = [];
  const rows = parseRegisterRows(text) as Map<string, Row>;
  const heads = text.split('\n').map((l) => ROW_HEAD_RE.exec(l)?.[1]).filter((id): id is string => Boolean(id));
  if (!rows.has(SENTINEL)) problems.push(`sentinel ${SENTINEL} missing: the register parse is empty or foreign`);
  const seen = new Set<string>();
  for (const id of heads) {
    if (seen.has(id)) problems.push(`${id}: duplicate row id`);
    seen.add(id);
  }
  const feRows = [...rows].filter(([id]) => /^FE-\d+$/.test(id));
  if (feRows.length !== seen.size) problems.push(`parsed ${feRows.length} FE rows but the register has ${seen.size} row-head lines`);
  const cells = lastCells(text);
  for (const id of flipPending) {
    const row = rows.get(id);
    if (!row) problems.push(`${id}: on FLIP_PENDING but not a register row`);
    else if (row.status !== 'OWED') problems.push(`${id}: reads ${row.status} but is still on FLIP_PENDING (remove it in the flip commit)`);
    else if (!row.locks.some((p) => tracked.has(p))) problems.push(`${id}: on FLIP_PENDING but its lock is not landed`);
  }
  for (const [id, row] of feRows) {
    if (row.status === 'RULED') {
      if (row.locks.length === 0) {
        const see = SEE_RE.exec(cells.get(id) ?? '')?.[1];
        if (!see) problems.push(`${id}: RULED with no lock path and no "see FE-nn" (rule 2)`);
        else if (!rows.has(see)) problems.push(`${id}: RULED, "see ${see}" names no register row`);
      }
      for (const p of row.locks) if (!tracked.has(p)) problems.push(`${id}: RULED but its lock is not tracked: ${p} (rule 5)`);
    } else if (row.status === 'OWED') {
      if (row.locks.length === 0) problems.push(`${id}: OWED with no lock path (rule 3)`);
      for (const p of row.locks) {
        if (!OWED_LOCK_RE.test(p)) problems.push(`${id}: OWED lock is not a src/tests/surfaces/*.test.ts path: ${p} (rule 5)`);
        if (tracked.has(p) && !flipPending.includes(id)) problems.push(`${id}: OWED but its lock already exists: ${p} (rule 5; flip the row)`);
      }
    }
  }
  return problems;
}

function trackedSet(): Set<string> {
  // The whole tracked tree: rule 5 puts no directory limit on a RULED lock (an OWED lock is held to src/tests/surfaces by OWED_LOCK_RE).
  const r = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  expect(r.status).toBe(0);
  return new Set(r.stdout.split('\n').filter(Boolean));
}

const REAL = fs.readFileSync(path.join(ROOT, REGISTER), 'utf8');
const TRACKED = trackedSet();

/** A mutated copy of the real text; the dead-man assert proves the mutation changed it. */
function mutate(text: string, from: string | RegExp, to: string): string {
  const out = text.replace(from, to);
  expect(out).not.toBe(text);
  return out;
}
const rowLine = (text: string, id: string) => text.split('\n').find((l) => l.startsWith(`| ${id} |`))!;
const mutateRow = (text: string, id: string, from: string, to: string) => {
  const line = rowLine(text, id);
  expect(line).toBeTruthy();
  return mutate(text, line, mutate(line, from, to));
};

/**
 * The planted OWED stand-in, chosen at test time (D-21): the first register row the gate's own parser reads OWED with exactly one lock,
 * a src/tests/surfaces path that is not yet tracked. If no row qualifies, a synthetic OWED row is appended to the temp copy, so the
 * planted cases never depend on a particular row staying OWED (a row flipping RULED once broke them).
 */
type StandIn = { text: string; id: string; lock: string };
function owedStandIn(text: string, tracked: ReadonlySet<string>): StandIn {
  const rows = parseRegisterRows(text) as Map<string, Row>;
  for (const [id, row] of rows) {
    if (!/^FE-\d+$/.test(id) || row.status !== 'OWED' || row.locks.length !== 1) continue;
    const lock = row.locks[0]!;
    if (OWED_LOCK_RE.test(lock) && !tracked.has(lock) && rowLine(text, id)?.includes(`\`${lock}\``)) return { text, id, lock };
  }
  let n = 98;
  while (rows.has(`FE-${n}`)) n -= 1;
  const id = `FE-${n}`;
  const lock = 'src/tests/surfaces/planted-stand-in.logic.test.ts';
  return { text: `${text.trimEnd()}\n| ${id} | planted stand-in | n/a | n/a | planted | OWED \`${lock}\` |\n`, id, lock };
}
const STANDIN = owedStandIn(REAL, TRACKED);

describe('FE-09: the Spec 135 Lock column resolves (rule 5)', () => {
  it('the real register and tree have no problem', () => {
    expect(registerLockProblems(REAL, TRACKED)).toEqual([]);
  });

  it('examined every row (dead-man: a non-empty parse with the sentinel)', () => {
    const rows = parseRegisterRows(REAL) as Map<string, Row>;
    expect(rows.size).toBeGreaterThan(30);
    expect(rows.has(SENTINEL)).toBe(true);
    expect(TRACKED.size).toBeGreaterThan(0);
  });

  it('planted: a RULED row whose lock is missing', () => {
    const bad = mutateRow(REAL, 'FE-02', 'report-generated-only.infra.test.ts', 'report-generated-only-gone.infra.test.ts');
    expect(registerLockProblems(bad, TRACKED).join('\n')).toMatch(/FE-02: RULED but its lock is not tracked/);
  });

  it('planted: an uppercase "OWED:" in a flip note makes a landed row read OWED (keep "prior status: owed" lowercase)', () => {
    const bad = mutateRow(REAL, 'FE-02', 'prior status: owed', 'prior status: OWED:');
    expect(registerLockProblems(bad, TRACKED).join('\n')).toMatch(/FE-02: OWED but its lock already exists/);
  });

  it('planted: FE-08 without its "see FE-16" clause', () => {
    const bad = mutateRow(REAL, 'FE-08', 'Lock: see FE-16.', 'Lock: none.');
    expect(registerLockProblems(bad, TRACKED).join('\n')).toMatch(/FE-08: RULED with no lock path/);
  });

  it('planted: "see" names no row', () => {
    const bad = mutateRow(REAL, 'FE-08', 'see FE-16', 'see FE-99');
    expect(registerLockProblems(bad, TRACKED).join('\n')).toMatch(/FE-08: RULED, "see FE-99" names no register row/);
  });

  it('the planted OWED stand-in is chosen from the register at test time, or is synthetic, and is clean as planted', () => {
    expect(STANDIN.lock).toMatch(OWED_LOCK_RE);
    expect(TRACKED.has(STANDIN.lock)).toBe(false);
    expect((parseRegisterRows(STANDIN.text) as Map<string, Row>).get(STANDIN.id)?.status).toBe('OWED');
    expect(registerLockProblems(STANDIN.text, TRACKED)).toEqual([]);
    const owedLocks = [...(parseRegisterRows(REAL) as Map<string, Row>).values()].filter((r) => r.status === 'OWED').flatMap((r) => r.locks);
    const synthetic = owedStandIn(REAL, new Set([...TRACKED, ...owedLocks]));
    expect((parseRegisterRows(REAL) as Map<string, Row>).has(synthetic.id)).toBe(false);
    expect((parseRegisterRows(synthetic.text) as Map<string, Row>).get(synthetic.id)).toMatchObject({ status: 'OWED', locks: [synthetic.lock] });
  });

  it('planted: an OWED row whose lock already exists', () => {
    const { text, id, lock } = STANDIN;
    const tracked = new Set([...TRACKED, lock]);
    expect(registerLockProblems(text, tracked).join('\n')).toContain(`${id}: OWED but its lock already exists`);
  });

  it('planted: an OWED lock outside src/tests/surfaces', () => {
    const { text, id, lock } = STANDIN;
    const bad = mutateRow(text, id, lock, 'scripts/surfaces/planted-outside.test.mjs');
    expect(registerLockProblems(bad, TRACKED).join('\n')).toContain(`${id}: OWED lock is not a src/tests/surfaces`);
  });

  it('planted: an OWED row with no lock path', () => {
    const { text, id, lock } = STANDIN;
    const bad = mutateRow(text, id, `\`${lock}\``, 'planted-no-path');
    expect(registerLockProblems(bad, TRACKED).join('\n')).toContain(`${id}: OWED with no lock path`);
  });

  it('planted: a duplicated row id', () => {
    const line = rowLine(REAL, 'FE-03');
    const bad = mutate(REAL, line, `${line}\n${line}`);
    expect(registerLockProblems(bad, TRACKED).join('\n')).toMatch(/FE-03: duplicate row id/);
  });

  it('planted: the sentinel row removed, and an empty register', () => {
    const bad = mutate(REAL, `${rowLine(REAL, 'FE-01')}\n`, '');
    expect(registerLockProblems(bad, TRACKED).join('\n')).toMatch(/sentinel FE-01 missing/);
    expect(registerLockProblems('', TRACKED).join('\n')).toMatch(/sentinel FE-01 missing/);
  });

  it('FLIP_PENDING is exact: on the list a RULED row, an unlanded lock or a missing row is red; off the list a landed OWED lock is red', () => {
    expect(registerLockProblems(REAL, TRACKED, ['FE-02']).join('\n')).toMatch(/FE-02: reads RULED but is still on FLIP_PENDING/);
    const { text, id, lock } = STANDIN;
    expect(registerLockProblems(text, TRACKED, [id]).join('\n')).toContain(`${id}: on FLIP_PENDING but its lock is not landed`);
    expect(registerLockProblems(REAL, TRACKED, ['FE-99']).join('\n')).toMatch(/FE-99: on FLIP_PENDING but not a register row/);
    const tracked = new Set([...TRACKED, lock]);
    expect(registerLockProblems(text, tracked, [id, ...FLIP_PENDING])).not.toContain(`${id}: OWED but its lock already exists: ${lock} (rule 5; flip the row)`);
    expect(registerLockProblems(text, tracked, [id, ...FLIP_PENDING])).toEqual([]);
    expect(registerLockProblems(text, tracked, []).join('\n')).toContain(`${id}: OWED but its lock already exists`);
  });

  it('fold: a row head the gate parser reads but this lock head count does not (bold id) is red', () => {
    const bad = `${REAL.trimEnd()}\n| **FE-99** | x | y | n/a | z | OWED \`src/tests/surfaces/x.infra.test.ts\` |\n`;
    expect(registerLockProblems(bad, TRACKED).join('\n')).toMatch(/parsed \d+ FE rows but the register has \d+ row-head lines/);
  });

  it('fold: a RULED lock outside src/tests/surfaces resolves against the whole tracked tree', () => {
    const moved = mutateRow(REAL, 'FE-02', 'src/tests/surfaces/report-generated-only.infra.test.ts', 'src/tests/hooks-composition.infra.test.ts');
    expect(registerLockProblems(moved, TRACKED)).toEqual([]);
  });
});
