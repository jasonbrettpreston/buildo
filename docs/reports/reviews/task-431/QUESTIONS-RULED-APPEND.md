# task-431: ruling after the build (Cairn-Ground-P431)

## Q-H. rule-lists.logic.test.ts:152 goes red on the de-dup, and K1's planted test is red before the table edit. RULED: change line 152 to expect 'whole'; K1's planted test is acceptable as written. Not OPERATOR.

Finding to record: post-build#1 MED. The plan listed this test neither as changed nor as unchanged, and the work commit was refused by it. Cause: the plan's own D1 behaviour, not a defect in the lane's work.

Evidence, read in the lane's tree (~/Buildo-wt-tbl431, staged, HEAD f5014af6c) and resolved in memory with the lane's rule-lists.mjs. The de-dup line is present there. The fixture was simulated with fs patched in node, with no files written.
- **The test.** rule-lists.logic.test.ts:149-154 is "a dir entry and a glob entry match through tracked files; a new file in a new dir matches by probe".
  - Fixture rows (:111-113): src-row (`src/**`, list `first`) and imp (`src/**/*.ts`, imports scripts/lib/compute, list `whole`).
  - Both `first` and `whole` are lists of docs/a.md.
- **Resolution of Files `src/*.ts` before and after the line.** The glob expands to tracked src/one.ts, which imports compute, so the imp row matches.
  - Before the line: `first, whole, inc-F`.
  - After the line: `whole, inc-F`. This is the D1 effect; the lane's reading is correct.
- **The other two assertions in the test.**
  - `src/` gives `whole, queue, inc-F`. :151 already expects 'whole' and is unaffected.
  - `src/newdir/new-*.ts` gives `first, inc-F`. The probe path does not exist, so it cannot import, and the imp row cannot match. :153 is unaffected.
- **Purpose.** The test locks two things: a glob entry is expanded through the tracked files, and a new file in a new directory is matched by the probe candidate. Whether `first` appears is incidental. It appeared at :152 only because src-row matches every src path, including the probe literal.
- **The old assertion was too weak.** I resolved `src/*.ts` with tracked files removed, which is the defect "glob not expanded through tracked files".
  - It gives `first, inc-F`. The old assertion `toContain('first')` stays green under that defect.
  - With tracked files present the result is `whole, inc-F`, so an assertion on 'whole' goes red under the defect.
  - 'whole' can only arrive through src/one.ts, a tracked file whose content makes the imp row match, so it proves the expansion.
- **Other tests reached by the same effect.** I found none. The de-dup only acts where `first` and `whole` both resolve, and that needs src/one.ts or a glob or dir that expands to it.
  - Every other `res(f, …)` in the file uses src/two.ts, docs paths, mobile/m.tsx or empty or exempt entries.
  - The fixture is used only in rule-lists.logic.test.ts.
  - The lane's 360 passed fits this.

Ruling, the smallest correction. In rule-lists.logic.test.ts:152 (line as in the lane's tree), change the expected list from `'first'` to `'whole'`: `expect(ids(JSON.parse(res(f, 'src/*.ts', ['--type', 'build']).stdout) as Res)).toContain('whole');`
- Do not add a `not.toContain('first')` there. D1 already locks the de-dup, and a second copy adds nothing.
- Leave :151 and :153 as they are.
- Add a short comment above the line: task-431: the glob resolves src/one.ts, whose import row gives `whole`, and the de-dup drops `first`; 'whole' also proves the glob was expanded through tracked files.
- This is a lock, not a control, per 08_agents.md:488.
  - It is red against the defect "a glob entry is not expanded through tracked files". I computed that result above in memory.
  - It is stronger than the assertion it replaces, which stayed green under that defect.
  - It does not weaken the glob proof or the probe proof. The probe case at :153 still asserts `first`, and `first` is not touched by the de-dup there.
- Its red is designed. I did not run it; the lane's own red.out should show it red under the planted "no tracked match" case if the lane wants it recorded.
- Nothing else in the plan moves. D1 stands. The Changed list gains rule-lists.logic.test.ts:152 (one assertion). The Unchanged list loses nothing, because :31-40 and the other cited lines are unaffected. The Files line is unchanged, because the test file is already on it.

K1's planted test (rule-lists-table.logic.test.ts:283-289 in the lane's tree). RULED: acceptable, no change.
- **Why it is red before the table edit.** It is red then because eng-front is not defined. That is the missing-list branch that 08_agents.md:488 says does not count as proof.
- **What the lock is.** The plan's K1 text already treats the planted defect as a demonstration, not as the lock. The lock is K1 itself (every file in K1 resolves exactly `['eng-all']`, survive-the-fix). The planted test shows that the real table gives `['eng-all']` and that a table with ui-app on eng-front + eng-shared gives something that is not eng-all and has no section 3. That shows K1 would fail under that defect.
- **What the lane records.** The red that counts is the planted assertion, observed green once the lists exist (`planted` is not eng-all and lacks section 3). The lane's REPORT.md or red.out should say that in one line. The not-defined red before the edit is not claimed as proof.
- **Same form as P1.** This matches how the plan treats the first assertion of P1.

Operator. Settled by this ruling under RR-0385 item 4.
- The lane's own record gives no sign that an earlier answer of his reads two ways.
- The change is one assertion in a test file already on the Files line, with no change to the design.
- No new gate work.

Plain lines for the operator:
1. One old test was red because of the new "whole file wins" rule. The rule is working as designed, so only that test's expected answer changes.
2. Nothing needs your word.

Could not verify: I did not run either test. The fixture result is simulated with fs patched in node on the lane's rule-lists.mjs; the lane's own commit.out near line 1125 is not read.
