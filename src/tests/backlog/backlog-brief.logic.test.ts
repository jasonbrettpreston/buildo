// SPEC LINK: Spec 08 §11.9 TKT-1 (08_agents.md:504), Spec 08 §7 rule 10 (a) (:341), Spec 137 §4 rule 3 (137_mcqueue.md:84); plan v8.1 section 3 gate G1 (RR-0207, RR-0212).
// Test 4 of 11: scripts/analysis/backlog-brief.mjs --task task-N --lane <name> emits the brief from the Backlog task, on a hand-built fixture project (no loader).
import { describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { backlog, makeProject, mk, script } from './helpers';

const AC1 = 'Pre-register the expected moves, committed alone — "Pre-register the task\'s `rules[]` and expected moves" (MBQ:109)';
const AC2 = 'Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (08:490)';

function fixture() {
  const d = makeProject();
  const plan = mk(d, 'Plan item CHK.5 scope check', ['-l', 'plan:CHK.5,F', '--type', 'build', '--ac', AC1, '--ac', AC2, '-d', 'Scope text for the plan item.']);
  const row = mk(d, 'MB-77 queue row item', ['-l', 'queue-row', '--ref', 'ROW:MB-77', '--ac', AC2]);
  backlog(d, ['decision', 'create', 'RR-0101 Backlog is the home', '-s', 'accepted', '--plain']);
  return { d, plan, row };
}
const brief = (d: string, task: string, extra: string[] = []) => script('scripts/analysis/backlog-brief.mjs', ['--task', task, '--lane', 'BL-R1', '--stage', '2', '--root', d, '--date', '2026-11-19', ...extra]);

describe('G1 backlog-brief (test 4)', () => {
  it('emits the exact TKT-1 form for a plan item: Ticket: task-N (<plan id>) · lane X · stage N', () => {
    const { d, plan } = fixture();
    const r = brief(d, plan);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`Ticket: ${plan} (CHK.5) · lane BL-R1 · stage 2`);
  });

  it('emits the exact TKT-1 form for a queue-row item: Ticket: task-N (MB-nn) · lane X · stage N', () => {
    const { d, row } = fixture();
    const r = brief(d, row);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`Ticket: ${row} (MB-77) · lane BL-R1 · stage 2`);
  });

  it('carries the rule quotes, the AC list as the done-condition, scope, max_fix_rounds and the Spec 137 rule 3 line', () => {
    const { d, plan } = fixture();
    const r = brief(d, plan);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^Rule:/m);
    expect(r.stdout).toContain('Red tests first, then the code, through the real hooks.');
    expect(r.stdout).toContain("Pre-register the task's `rules[]` and expected moves");
    expect(r.stdout).toMatch(/^Scope:/m);
    expect(r.stdout).toMatch(/^Done-condition:/m);
    expect(r.stdout).toContain(AC1);
    expect(r.stdout).toMatch(/max_fix_rounds: 2/);
    expect(r.stdout).toMatch(/Spec 137 rule 3/);
  });

  it('carries the Spec 08 substrate lines (08:334 and :339), the take order, the review command with the provider note, and the close step', () => {
    const { d, plan } = fixture();
    const r = brief(d, plan);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/08_agents\.md:334/);
    expect(r.stdout).toMatch(/08_agents\.md:339/);
    expect(r.stdout).toContain(`task edit ${plan} -s RUNNING -a @lane-BL-R1`);
    expect(r.stdout).toMatch(/--plan/);
    expect(r.stdout).not.toMatch(/Review \(plan or output\)/); // task-423 D2: the brief orders no plan review (RR-0374)
    expect(r.stdout).not.toContain('plan-review-deepseek.md');
    expect(r.stdout).toMatch(/Review \(output only\):/);
    expect(r.stdout).toMatch(/provider claude/i);
    expect(r.stdout).toMatch(/bash_allow/);
    expect(r.stdout).toMatch(/--final-summary/);
    expect(r.stdout).toMatch(/--check-ac/);
    expect(r.stdout).toMatch(/--append-final-summary/);
    expect(r.stdout).toMatch(/-s BUILT/);
    expect(r.stdout).toMatch(/from round 2 on use only --append-final-summary/);
    expect(r.stdout).toMatch(/check-lane-close\.mjs --outcomes/);
    expect(r.stdout).toMatch(/do NOT run --plan/);
    // task-375 D6: what the brief tells a lane about the plan that the launch gate checked
    expect(r.stdout).toMatch(/The plan is the task text at launch, checked before launch/);
    expect(r.stdout).toMatch(/do not edit the Description, Acceptance or Plan/);
    expect(r.stdout).toMatch(/record deviations in Implementation Notes/);
    expect(r.stdout).toMatch(/plan findings were ruled once, at the plan: the lane runs no plan lens and its GROUNDER\.md rules the output findings only/);
    expect(r.stdout).not.toMatch(/still runs at least one plan-stage lens/);
    expect(r.stdout).toMatch(/STATUS: ready\|blocked\|failed\|dropped/);
  });

  it('writes the review context file from the task, its docs and its decisions, and the brief carries its sha256', () => {
    const { d, plan } = fixture();
    const r = brief(d, plan);
    expect(r.status, r.stderr).toBe(0);
    const ctx = path.join(d, `docs/reports/reviews/${plan}/context-r1.md`);
    expect(fs.existsSync(ctx), ctx).toBe(true);
    const body = fs.readFileSync(ctx, 'utf8');
    expect(body).toContain('Plan item CHK.5 scope check');
    expect(body).toContain(AC2);
    expect(body).toMatch(/RR-0101 Backlog is the home/);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(ctx)).digest('hex');
    expect(r.stdout).toContain(sha.slice(0, 12));
  });

  it('refuses a task that does not exist (exit 1, names the id)', () => {
    const { d } = fixture();
    const r = brief(d, 'task-999');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/task-999/);
    expect(r.stderr).toMatch(/not found|no such task|does not exist/i);
  });
});

// task-453 (SEARCHFIX.5 T1, T8; GROUNDER-C, Spec 137 Rule 3 as amended, 137_mcqueue.md:98): a build or fix ticket names the two-commit close; an empty AC block says so
describe('task-453: the two-commit Status line and the empty AC block', () => {
  it('T1: a build task ticket names the amended Rule 3 (137_mcqueue.md:98) and the closing commit limits; a queue-row task keeps the old line', () => {
    const { d, plan, row } = fixture();
    const r = brief(d, plan);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Spec 137 rule 3/);
    expect(r.stdout).toContain('Status line (Spec 137 rule 3 as amended by its note of 2026-11-20, 137_mcqueue.md:98): the work lands first; the closing commit carries only the lane report dir, the review context dir, the task file and the decision record');
    const q = brief(d, row);
    expect(q.status, q.stderr).toBe(0);
    expect(q.stdout).toContain('Status line (Spec 137 rule 3, docs/specs/00-architecture/137_mcqueue.md:84)');
  });
  it('T8: a task with no acceptance criteria prints "(none found in <task file>)" under the Done-condition', () => {
    const d = makeProject();
    const t = mk(d, 'No criteria here', ['--type', 'build', '-d', 'Scope text.']);
    const r = brief(d, t);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^Done-condition:.*\n {2}\(none found in .*task-\d+ - No-criteria-here\.md\)$/m);
  });
});
