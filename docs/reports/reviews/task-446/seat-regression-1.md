# Seat: regression: task-446 plan (PLAN-446-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head eb7aad381. Read: handbook-rule-map.logic.test.ts whole (every describe: H1, A-T1..A-T6, B-tests, C-T1..C-T3, H2/H3, H4, H5, H6, FE-10 cases), register-locks-resolve.infra.test.ts, rule-lists-table.logic.test.ts :195-235, mcfrontend-queue.infra.test.ts, generate-surface-handbook.mjs, cite-parse.mjs, spec-split-check.mjs size-cap code and 122_split_manifest.json (generated_size_caps keys: 132, 133 only; no 135 or 136 entry), .husky/pre-commit, the generated pages and the system map. Greps for every pin on the numbers 57, 21, 28,690, 111,851, "Rules rendered", fe.57, FE-57: outside Spec 135, 136 and review records they hit only src/tests/surfaces/handbook-rule-map.logic.test.ts (:268 `>= 57`, :278 `>= 21`), src/tests/backlog/rule-lists-table.logic.test.ts :218 (`>= 57`, range computed), docs/reports/generated/rule-lists-by-kind.md (:33, :37, :60, :64) and scripts/surfaces/_schema/surface-rule-map.json (:256, :878-885). The census in the plan is right.

Existing tests walked against the new row (all stay green, or go red only as the plan predicts):
- H1 (:47-60): `rows.length` and Next free id are computed; green once the note moves the first value to FE-59.
- A-T1..A-T6: A-T2 "every headline is the plain text of its cell" and A-T6 hold (cell is about 360 characters, over the 300 clip, and ends in a "(Spec 128 ...)" bracket, so `wholeHeadline` returns `plainCell`); A-T3 (no headline ends in an ellipsis) holds; CLIPPED_TODAY (16 ids) unchanged.
- B-tests: the new row has no reading, so `expect(line).not.toMatch(/Current reading/)` holds and READING_IDS (12) is unchanged.
- C-T3 (:275-281): counts computed (58 and 22); the per-row regex covers only the 13 NEW_LOCKS rows, so R-22 is covered only by the new T2.
- H2/H3, H4 (OWED lines in text equal the gate's OWED set; no "Enforced by" on OWED; each fe line appears once), H5 (`v1 covers the ${n}`), H6: all computed from the register.
- register-locks-resolve.infra.test.ts: the OWED lock path matches `OWED_LOCK_RE`, is untracked, one lock per row; green. `owedStandIn` picks the first OWED row (FE-44 or earlier), not the new one.
- rule-lists-table.logic.test.ts :209-222 (range fe.01..fe.N, N from readFeRows): green when the page is rewritten and 136 section 2 stays one part.
- mcfrontend-queue.infra.test.ts: green for MF-96 under Phase 2 with no "admin" outside parentheses.
- spec-split-check: no size cap on 136, no budget on 135, so the growth is not capped (`generated_size_caps` has 132 and 133 only).
- system-map.infra (pre-commit): green after `npm run system-map` (map line 100 gains the lock path, as in d429b287d).

FINDINGS:

rg#1 MED. T2 is built to go red when the lock lands and the row flips.
- Plan: "T2 ... status is 'OWED'; locks equal [R22_LOCK]; ... `fs.existsSync(R22_LOCK)` is false; Spec 136 matches `^- \*\*fe\.<n>\*\* ... Status: OWED · lock owed: <lock>$`", and "Status: OWED, like task-430's 13 rows."
- Evidence: the same shape is already in C-T2 (:269-271: `expect(r.status, r.id).toBe('OWED'); expect(fs.existsSync(path.join(ROOT, r.locks[0]!)), r.locks[0]).toBe(false)`) and C-T3 (:279-280 regex `Status: OWED · lock owed`). register-locks-resolve.infra.test.ts has a `FLIP_PENDING` list (:23-30) so a landed lock and a flipped row do not fail that lock; handbook-rule-map has no equivalent.
- What goes wrong: when task-367 builds the lock and flips the row to RULED (or builds it at a different path), T2 and the new handbook regex go red, so the lock-building task must edit a test it does not own. T2 also pins the full 360-character headline, so any later wording change to the row fails T2.
- Smallest fix: key T2 on the lock path only while the row is OWED (`if (row.status==='OWED')` branch), assert the status only as "OWED or RULED with the lock existing", and leave "lock does not exist" to register-locks-resolve (FE-09), which already owns it; or add a one-line comment naming task-367's flip as the planned edit point.

rg#2 LOW. T1 "exactly one" counts headline substrings only.
- Plan: `citing = (rs, cite) => rs.filter(r => r.headline.includes(cite))` over '128:205', '128:206', '128:224'.
- Evidence: FE-49's and FE-52's headlines carry "128:205" and "128:206" today; the Amends cell (not read by T1) also carries them.
- What goes wrong: (a) if FE-49 or FE-52 is later reworded to cite "Spec 128 R-03" without the line number, T1 goes red though the rule is stated; (b) a lower-rank row added "over time" (RR-0379) that quotes 128:205 turns T1 red, which may be the intent but is not stated as a rule anywhere (Spec 135 has no "one line per rule" rule).
- Smallest fix: say in the T1 it-title that "exactly one" is the pin, and name Amends as the stable key (`r` has no amends field today, so state that the headline is the key).

rg#3 LOW. C-T1's planted register now removes 14 rows, and its title and arithmetic still say thirteen.
- Plan: ":287 ... `const tail = rows.slice(rows.findIndex(r => r.id === ids[0])).map(r => r.id)` with `stripRows(REGISTER, tail, rows.length - tail.length + 1)`".
- Evidence: test title (:283) "C-T1 and C-T3 planted: the register with the rows and the files built without them"; `expect(ids).toHaveLength(13)` stays; `old = build(makeRoot(stripRows(...)))` now omits FE-45..FE-58 (14 ids). The arithmetic is right: 58 - 14 + 1 = 45 is the Next free id for a 44-row register.
- What goes wrong: nothing red. The test still proves stale detection and the gap case, but it no longer isolates the 13 rows (it would stay green if only FE-58 mattered).
- Smallest fix: comment "(the thirteen and any rows after them)"; or strip `ids` and the row after them separately.

rg#4 LOW. The rewritten :297 changes which row the "last row is not a gap" case removes.
- Plan: ":297. `stripRows(REGISTER, [ids[12]!], rows.length)` would leave a gap at FE-57. It becomes `[rows.at(-1)!.id]`."
- Evidence: original removed FE-57, the last of the thirteen (then the last row); `stripRows(.., next=rows.length)` with FE-58 removed gives 57 rows and "Next free id: FE-58", which `readFeRows` accepts (:133 requires nums.length+1). `.at()` compiles (tsconfig lib esnext).
- What goes wrong: the property tested (the tail row can be removed without a gap error) is the same, but it is now about whatever row is last and moves with every appended row (task-388's row, later rows). No red.
- Smallest fix: none required; keep as written.

rg#5 LOW. C-T2's "LAST rows" pin is weakened by design; the new pin is adequate but should say what it still forbids.
- Plan: ":267 ... `rows.slice(at, at + 13).map(...)` ... it-title becomes 'are contiguous, in item order (task-446 appends after them)'".
- Evidence: the old assertion forbade any row after the thirteen; the new one forbids a row inside them or reordered, and still pins the lock set via `fresh.map(locks) toEqual NEW_LOCKS`.
- What goes wrong: nothing red; a row can now sit after them without a test noticing (intended).
- Smallest fix: none; keep as written.

rg#6 LOW. The generated outputs: the plan lists four regenerations; the surface-135 part count is unverified.
- Plan: `generate-surface-handbook.mjs --write`, `rule-lists.mjs page --write`, `npm run system-map`.
- Evidence: rule-lists-by-kind.md rows :33 (surface-136 28,690 / 1) and :37 (surface-135 111,851 / 3), repeated at :60, :64; adding about 385 characters keeps surface-136 at 1 part (surface-128 at 77,169 is still 1 part); surface-135 grows by the row (about 1.6K) plus the Next free id note (about 0.6K) and might cross a part boundary.
- What goes wrong: a part count change shows as a second changed page row; `page --check` in pre-commit and rule-lists.logic.test.ts are green only after `--write`.
- Smallest fix: none beyond running `--write` after the register edit (plan step 4 does).

rg#7 NIT. Typing detail in the new tests.
- Plan: T1 and T2 snippets (`citing = (rs, cite) => ...`, `realRows().filter(r => r.locks.includes(R22_LOCK))`).
- Evidence: `noUncheckedIndexedAccess` is on and the file annotates callbacks `(r: Row)`.
- What goes wrong: untyped parameters fail `npm run typecheck` in pre-commit.
- Smallest fix: annotate.

Existing tests the plan missed: none found. Every test that reads the register, the handbook or the rule map was walked above and none pins the row count, the last row or a size beyond what the plan lists. The plan's list of "must NOT change" tests is complete.

Not checked / UNVERIFIED: the exact post-write part count of surface-135; behaviour of the pre-push `npm run test` as a whole (not run).
