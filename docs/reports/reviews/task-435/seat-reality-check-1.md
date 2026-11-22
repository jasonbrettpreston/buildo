# Seat: reality-check: task-435 plan (PLAN-435-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 6c3f450c9, ~/Buildo-wt-board. Read-only greps and reads; `git blame`; package.json; the files named below; `resolve` once. Nothing written, no .env, no model calls, no runner named.

Verified true (no finding): file is 467 lines; section 12 heading ":304", Status line ":306"; RHF line :280, Drawer line :283, Sonner line :285; 12.3 / 12.5 / 12.7 content as quoted; package.json :78-80 @mantine core/dates/hooks "8.3.18", :82 @rjsf/mantine 6.11.1, :107 mantine-datatable 8.3.13, :122 sonner ^2.0.7, :125 zod ^4.3.6, :157 tailwindcss ^4; no react-hook-form, @hookform, vaul, @mantine/notifications, shadcn package; no components.json; src/components/ui = Badge.tsx, ScoreBadge.tsx; no import of react-hook-form/vaul anywhere in src or mobile/src (only comments); Spec 33:44, :45 and :47 quote correctly ("P42 decisions approved", "approved smaller version"); Spec 126:467 quote is exact; 126:1005-1006 exist as quoted; "Mantine 9" in 126 is amended to 8.3 in the same cell; Spec 126 and Specs 135/136 contain no "sonner/toast/shadcn/mantine/react-hook-form" (count 0 in 135 and 136).

### rc#1 MED: the 126:467 note does NOT say what the plan's note says it says
Plan sentence (note text): "...superseded by Spec 126 §11b.4 ..., as that spec's dated note 2026-11-09 (Spec 126 §5.4: ""Shadcn/Tailwind" above is superseded. shadcn/ui is not installed (Spec 33:44)") already says."
Evidence: 126:467 sits in "### 5.4 Arrow 4" (:463-468), so "§5.4" is correct. But "above" is 126:465, Spec 126's own sentence "a different archetype component set (Shadcn/Tailwind, desktop-first `md:` breakpoints per `.claude/domain-admin.md`...)". The note supersedes Spec 126's own word, not the engineering standards, and says nothing about React Hook Form, the Drawer, §12.3 or §12.5. The supersession of the engineering standards is carried by §11b.4's table (126:1005-1006) and the operator's ruling RR-0382.
What would go wrong: a reader of the engineering standards who follows the pointer to 126:467 finds a note about a different sentence, and "already says" overstates it.
Smallest correction: cite 126 §11b.4 (:999-1006) as the authority and 126:467 only as "the same supersession recorded for Spec 126's own Shadcn/Tailwind wording", or drop "already says".

### rc#2 MED: the "three example paths" - the draft text is still wrong; the correction is outside the note
Plan sentence: "for example `src/app/(maxbld)/admin/control-panel/page.tsx`, `src/features/admin-controls/components/ControlPanelShell.tsx`, `src/lib/media/useUploadMedia.ts`" and "use these three: `src/app/admin/control-panel/page.tsx`, `src/app/(maxbld)/admin/layout.tsx`, `src/lib/media/useUploadMedia.ts`".
Evidence (ls and grep): `src/app/(maxbld)/admin/control-panel/page.tsx` does NOT exist (wrong). TRUE: src/app/admin/control-panel/page.tsx, src/app/(maxbld)/admin/layout.tsx, src/lib/media/useUploadMedia.ts, and also src/features/admin-controls/components/ControlPanelShell.tsx (all import 'sonner'). Count: 19 files import from 'sonner' (grep over src and mobile; no dynamic import or require); 2 are tests (src/tests/admin-watchlist-hooks.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts), 17 are code.
What would go wrong: the EXACT NOTE TEXT block, as written, still has the false path; the fix is only an instruction beneath it. If the builder copies the block, a false path lands in a standard. "19 files" also includes two tests; "installed and imported in 19 files" is true, "in use" in 19 is 17.
Smallest correction: put the corrected three in the note text itself; say "imported in 19 files (17 in code)" or give one count; consider fewer examples (the ruling needs one fact: installed and in use).

### rc#3 LOW: the plan's section-11 list is off by three lines; the heading is :277, not :274
Plan sentence: "The section 11 checklist block at :274-285 is headed "new code in `src/features/`"".
Evidence: "### Frontend Foundation Check (new code in `src/features/`):" is :277; :274 is "API route returns stable field names" (Frontend Boundary Check). The three library lines are right (:280, :283, :285). The plan's table rows and "two Frontend Foundation Check lines of §11" are correct: :280 (RHF, cites §12.3) and :283 (Shadcn Drawer, cites §12.5) are superseded in words; :285 (Sonner) is not. The count "two" is right.
Smallest correction: say ":277-285".

### rc#4 MED: the "Sonner is unsettled" premise is weaker than the plan says; the record is three places, not one
Plan sentence: "Spec 126 does not name a toast library ... Spec 33 (dated note 2026-11-09, MF-42) records toasts as unchanged: `sonner`."
Evidence: true that 126, 135, 136 name no toast library. Also on record: Spec 33:45 ("Toasts: **`sonner`** (already a dependency...)"), Spec 33:47 (operator, verbatim: "P42 decisions approved" and "approved smaller version": "toasts are unchanged: `sonner`, for the MaxBLD web pages too (no `@mantine/notifications`)"), and .claude/domain-admin.md:20 ("Sonner for toasts") and :53 ("Sonner ... Standalone dep (NOT "via shadcn")"). The last one also says the engineering standards' "Shadcn's Sonner integration" wording (12.7) is stale, though nobody ruled it. So the card's statement "rules nothing on it" is consistent, but "Spec 126 names no toast library" alone can read as "no ruling exists", which the record contradicts. Note the operator did not rule Sonner on RR-0382; Spec 33:47's operator words are about the MF-42 decisions, an earlier ruling. See Q1 below.
Smallest correction: say "Spec 126 names no toast library; Spec 33:47 records toasts unchanged: sonner" in one clause, or leave Sonner out of the note entirely (card scope).

### rc#5 MED: "the library lines of this section" is ambiguous in the note text
Plan sentence: "the library lines of this section, §12.3 (React Hook Form) and §12.5 (Shadcn UI, Shadcn `<Drawer>`), and the two Frontend Foundation Check lines of §11 ... are superseded ... §12.7 (Sonner) is not superseded".
Evidence: "this section" is section 12, which holds six library-ish lines: 12.3 (RHF), 12.5 (Shadcn), 12.6 (TanStack Virtual), 12.7 (Sonner), and Biome/Zustand. The note first says "the library lines of this section" and then lists only 12.3 and 12.5, so "the library lines" can read as including 12.6 and 12.7, which the next sentence then excepts. Also "§12.5 (Shadcn UI ...)": 12.5 also says Dropdowns, Date Pickers, Forms; Spec 126 names `@mantine/dates` (126:1005) so "Date Pickers" is superseded in practice too, but nothing in 12.5's Rule line is excepted.
Smallest correction: drop "the library lines of this section," and name §12.3 and §12.5 only.

### rc#6 LOW: "Mantine 8.3.18" in the note, "Mantine 9" in 126
Evidence: package.json 8.3.18; 126:1005 amends D-2's "Mantine 9" to 8.3 and 126:467 still says "Mantine 9". The plan's note says "Mantine" bare in the parenthesis and 8.3.18 in the measured sentence: consistent and right. One reader trap: following the pointer to 126:467 shows "Mantine 9". Leave as is or add nothing.

### rc#7 LOW: the scope D reading of the Status line
Evidence: 126:129-147 says scope D `estate_other` is "**No — inventory and seam only.**", "fenced", "those surfaces convert under this same standard in a later programme" (:147). Section 12 Status (:306): "Adopted as of 2026-04-07 for the lead feed feature build (`src/features/leads/`)". Both quotes as in the plan. BUT the plan's claim that "in `src/features/leads/` ... these lines stand as written" has no code support: nothing in src or mobile/src imports react-hook-form, vaul or shadcn (shadcn is not installed anywhere; Spec 33:44 says "Do NOT install pre-styled UI libraries ... shadcn/ui ... without a Spec 33 amendment"). So in scope D, the 12.3 and 12.5 lines are not "standing"; they are un-followed.
What would go wrong: "stand as written" re-asserts a standard the same record (Spec 33:44, domain-admin.md:19) already says is not the house convention. That is a new ruling beyond "yes add".
Smallest correction: "this note does not change those lines for scope D" instead of "stand".

### rc#8 LOW: date claim on the card is supported
Plan sentence: "the card says "lines of 2026-06-16" and I could not find that date in the file (UNVERIFIED)".
Evidence: `git blame` on :270-290 and :304-343 gives commit 4416d843e, 2026-06-16 ("docs(00_engineering_standards): merge duplicate arch copy into root SoT") for all 40 lines of section 12's Status through 12.7 range blamed and the checklist. The text itself says it was adopted 2026-04-07 (Status :306); 06-16 is the last-touch date of those lines, not their authorship. Last file change fed94bd19, 2026-10-17.
Smallest correction: say "last changed 2026-06-16 (git blame); adopted 2026-04-07".

### rc#9 LOW: the red-first line number on the cards is drifted; correct line is 08_agents.md:485
Plan sentence: "my read of :460-464 shows a different sentence about panel seats, so the card's line number may have drifted: UNVERIFIED".
Evidence: "Every lock is proven in BOTH directions (fails on the old shape, passes on the new) before red is claimed" is docs/specs/00-architecture/08_agents.md:485; :462 is "> against its lens.** Precedent: ...". Every task card's DoD #2 carries :462 (task-430, 435).
Smallest correction: say so in OPEN 3; do not change cards here.

### rc#10 NIT: plan size claims
"467 lines" true. "Spec 126 note 2026-11-09" true. "operator D-0-D-4 approved" true (126:467 and :1001).

OPEN questions, what the record supports (no ruling):
- Q1 cite Spec 33:47: for citing: it is an operator-worded record (Spec 33:47) and domain-admin.md:53 agrees; the note then does not suggest Sonner is open. Against: RR-0382 said "Sonner: NOT answered" and the card says the note "states as a fact, and rules nothing on it" that 126 names no toast library and Sonner is installed and in use; Spec 33:47 is one more fact, and not stated by the card; it also cites an operator ruling (the M-246 form) the operator gave about the MaxBLD pages, a different question.
- Q2 second pointer in section 11: the code shows :280 and :283 are the only two section-11 lines that name the superseded libraries; :285 Sonner stays. The ruling named section 12 only.
- Q3 red-first: no test of the note's text exists; the pre-commit page check is the only gate that can go red and green on this change (red after the edit before `page --write`).
- Q4 scope D words: Spec 126 §2.0 supports "not governed by Spec 126 (D inventory and seam only)". It does not support "the old lines stand" (rc#7). Operator's words were "for the front end".
