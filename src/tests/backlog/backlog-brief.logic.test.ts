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
    expect(r.stdout).toMatch(/node scripts\/deepseek-review\.js review docs\/reports\/reviews\/\S+\/context-2026-11-19\.md --context \.claude\/review-templates\/plan-review-deepseek\.md/);
    expect(r.stdout).toMatch(/provider claude/i);
    expect(r.stdout).toMatch(/bash_allow/);
    expect(r.stdout).toMatch(/--final-summary/);
    expect(r.stdout).toMatch(/--check-ac/);
    expect(r.stdout).toMatch(/--append-final-summary/);
    expect(r.stdout).toMatch(/-s BUILT/);
    expect(r.stdout).toMatch(/from round 2 on use only --append-final-summary/);
    expect(r.stdout).toMatch(/check-lane-close\.mjs --outcomes/);
    expect(r.stdout).toMatch(/do NOT run --plan/);
    expect(r.stdout).toMatch(/STATUS: ready\|blocked\|failed\|dropped/);
  });

  it('writes the review context file from the task, its docs and its decisions, and the brief carries its sha256', () => {
    const { d, plan } = fixture();
    const r = brief(d, plan);
    expect(r.status, r.stderr).toBe(0);
    const ctx = path.join(d, `docs/reports/reviews/${plan}/context-2026-11-19.md`);
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
