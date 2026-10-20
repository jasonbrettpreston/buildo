# Verification index — wf2/p4-integrate-15

R-EZ (124a_step_standard_policy_appendix.md:913, operator y 2026-10-20: "Findings block the integration until fixed or
ruled. The verification report is saved under `docs/reports/verification/<branch>.md` and the integrate commit cites
it."). Both branches merged by `wf2/p4-integrate-15` were verified by a lane that did not write them (verify-15),
read-only. The integrate-14 tip itself was verified by verify-14. Both reports are copied verbatim (`cmp`-identical)
from the orchestrator's scratchpad into this directory.

- **Integrate base:** `a7655cec` (= `wf2/p4-integrate-14` tip, pushed)

## Merged branches (in merge order)

| # | Branch @ tip | Base | Verdict | Report |
|---|---|---|---|---|
| 1 | `wf1/bylaw-fix-2` @ `5a26c383` (batch B CHAT-6/7/8/9/10/13; N-1/N-4) | `70ec6aed` | **PASS-WITH-NOTES** | [`bylaw-fix-2-and-v3-cite-1.md`](bylaw-fix-2-and-v3-cite-1.md) |
| 2 | `wf2/v3-cite-1` @ `18574feb` (R-EY E1 ratchet: v3[] 2 → 4) | `a7655cec` | **PASS** | [`bylaw-fix-2-and-v3-cite-1.md`](bylaw-fix-2-and-v3-cite-1.md) |

Verification of the base tip: `wf2/p4-integrate-14` @ `a7655cec`, verify-14, **PASS-WITH-NOTES**,
[`p4-integrate-14-verify.md`](p4-integrate-14-verify.md).

## Commit order note

Both reports were scanned with `spec-split-check.mjs`'s own extractors (`collectCitations`,
`checkCitationsResolve` for arm (iii), `checkHandbookCitations` for arm (iii-b)) before committing: 0 citations in
either report, so both land in this first commit. A positive control (a file citing one real and one unknown
Spec 124 ruling) was flagged as expected. No report text was changed.

## Integration actions taken on the verify findings

- **Merges.** `wf1/bylaw-fix-2` @ `5a26c383` (merge `e3d94582`) and `wf2/v3-cite-1` @ `18574feb` (merge
  `7e9a83cb`), each `--no-ff` with the hooks; both clean, as verify-15 checks 14 and 15 previewed.
- **verify-15 N2 (CHAT-9 amends M-102 / M-106).** 69a M-239's conflict check and its Amends cell now name M-102
  (69a:183, *"or mixed bound directions or measures in one unit — the unit is UNUSUAL"*) and M-106 (69a:190, *"A unit
  whose statements bound `encroachment_m` (max) and `encroachment_clearance_m` (min, …) mixes bound directions, which
  one unit `bound` cannot carry"*). In plain words: the eight x.40.10(2) units now put a max (`main_wall_height_m`) and
  a min (the share) on one LIMIT unit, which M-102 and M-106 had made UNUSUAL; M-239 amends them for targets that
  declare their own bound. Only the six M-239 targets declare one (`vocab.json` `dsl_target.<t>.bound`: the two share
  tiers `min`, the four attic thresholds `exact`); `encroachment_clearance_m` declares none, so the M-106 pair is
  untouched. Authority: the operator's CHAT-9 words in
  `docs/reports/decisions/raw/2026-10-20-chat-batch-b/2026-10-20-batch-b.json` (*"the operator approves the target
  shape"*). No code, data or test changed: the shape was already applied at `06f7fb6d`; only the row's record of what it
  amends was incomplete.
- **verify-15 N3 (Spec 68 §7.5 text behind the register).** Each change quotes the register row's Amends text as its
  authority; no code, data or test changed (the behaviour landed at `20582cea` / `06f7fb6d`).
  - *Rule 7a and its hardening line* — M-237 (69a:384) Amends: *"Amends Spec 68 §7.5 rule 7a as approved."* Rule 7a's
    heading now reads `(Spec 69 M-54 note 2026-10-07; M-237)`, and the hardening line (Spec 68:379) reads *"no by-law
    unit (keyed or pending; `vocab.absence_ignore` units aside, M-237) for the target"*, M-237's own words: *"rule 7a's
    "no by-law unit … for the target" skips a unit … declared as `vocab.absence_ignore`"*.
  - *Rule 4* — M-239 (69a:386) Amends: *"Spec 68 §7.5 rule 4 (a declared target bound)"*. Rule 4 now reads *"with the
    same bound direction (a target's declared bound governs, M-239)"*, M-239's conflict check: *"a declared target bound
    is the unit's bound for that target"*.
  - *Spec 69 M-76 A10 pointer* — M-239 Amends *"M-76 A10 (threshold DEFINE lists)"*, so M-76's status cell (69a:154)
    now ends *"(A10) AMENDED 2026-10-20 by M-239 (…; operator CHAT-9)"*. Spec 69's header: *"Amended only by adding rows
    (or appending a dated note to a row)"*; a dated-note row would shift every 69a line after 154 by one and stale the
    live cite *"69a:223"* in the M-207 dated note (69a:345), so the pointer rides in the status cell, as bylaw-fix-2 did for M-219,
    M-220 and M-223 (69a's header: *"the status column of each row below is authoritative"*). The status still starts
    `RATIFIED`, so `readSpec69Rulings` reads it unchanged.
  - *Budget* — Spec 68 is 103,123 bytes / 530 lines against the arm (iv) ceiling of 103,163 bytes / 589 lines
    (`measured_at` 93,785 × 1.1); `spec-split-check --check` reports "budgets held". 40 bytes of headroom remain.
- **verify-14 N2 (recorded, not recaptured).** The coa forced-status bracket golden's `lifecycle_status_history` hash
  moved `dc3aae31` (night-c `51874abd`) → `f764b546` (integrate-14 tip `a7655cec`) at the same row count, 381,748. Bracket
  captures are not in G8's PRE→POST comparison and step-validate reports unexplained-diffs=0, but neither the
  integrate-14 merge message nor its index listed the move. verify-14's likely cause: the timestamps on the 50 rows the
  bracket writes; not confirmed (that needs the DB). Recorded here only; nothing is recaptured (brief scope).
- **verify-15 N6 (recorded, never amended).** Commit `5a26c383`'s message cites Spec 68 §2 for "a gap is a drafted
  ruling, not a change"; Spec 68 §2 is "Intent — why this exists" and says nothing of the kind. The real source is the
  lane constraints rule (*"a gap → draft a rule with a McDonald's Airtight V3 seven-question table … and leave it for
  the operator"*). The mis-cite is in the message only, not in the tree; it stays on record because an amend is
  forbidden (lane constraints: *"Never: … --amend"*).

## Carried forward (verify findings not acted on in this integration)

- **verify-15 N1 — CHAT-8 under-delivered, disclosed.** Only RT main wall was done (ABS-2; INV-19 ratchet 19 → 16).
  **16 of the 19 CHAT-8 cells stay OWED** until the operator rules on the drafted R-7a-v2 (rule 7a v2: DEFINE units
  with no value statement, other-principal-type units, RM houseplex `not_applicable`). Small widening to tell the
  operator: `vocab.absence_ignore` also skips accessory-structure-use units (M-159(2)); the approved wording was
  "lawfully-existing or ancillary-only".
- **verify-15 N4 — R 10.10.40.10(2)(B) drops `frontage_band`** (5 records). Justified (no `condition.if`, Spec 68 §6)
  and harmless to the numbers (eval-perf and golden counts unchanged), but it changes when an R unit applies; the
  operator should be told.
- **verify-15 N5 — N-1 knock-ons beyond the single finding.** 10.5.60.70(1)(B) re-targeted `lot_coverage_pct` →
  `ancillary_coverage_pct` (with that target's licence patterns extended); 10.5.60.70(1)(C) `ancillary_building` →
  `secondary_suite`. Both text-supported, citing M-179(1) and M-182(1).
- **verify-15 N7 — batch B not imported into the decision log.** `settled` / `bug_fix` are not in the generator's
  meanings, so M-235…M-239 are generator skeleton rows, hand-completed, with a prose pointer to the raw record and no
  `<log>#<id>` citation; they are outside the coverage lock. The `no_ruling` meaning is drafted as **R-DV-1**; until
  the operator rules, CHAT-11's ten report rows stay pending.
- verify-15 N8 (report-fields generated files touched by both sides) needed no action: `report-fields --check` passes on
  the merged tip (see the checks below). verify-14 N1, N3, N4, N5, N7 are notes with no action owed.

## Open items

### Owed cutover rulings (verify-14 N6, verbatim)

- **enrich_coa_zoning, ×3:** all three `adjudicated_by` entries read "operator ruling owed at integration". They do cite rule ids: #1 cites R-GO, and #2 and #3 cite R-BZ. That is why R-EY (9) does not flag them.
- **link_coa_to_parcels, deviation 4:** reads "the type counters await the operator".
- **coa, ×2 without rule ids:** step-validate's R-EY (9) gives coa 2/10 uncited. They are deviation 5 (`$9/$10::timestamptz[]` into DATE columns, adjudicated by COA-D3) and deviation 6 (`avg_latency_ms` / `api_errors`, adjudicated by the load_zoning precedent). verify-13 named deviations 4 and 8 at night-c. Since then, int12's backfill gave deviation 4 a rule id (R-GM), and deviation 8 is not flagged at the tip.
- None of these was ruled in integrate-14, and none moved to ③.
- The integrate-14 index records actions only for verify-13's N1 and N3. It does not carry forward verify-13's N2, that the operator should rule before ③.

None of these was ruled in integrate-15 either, and none moved to ③.

### Pending operator rulings

- **R-DV-1** — the `no_ruling` decision-log meaning (batch B import; verify-15 N7).
- **R-7a-v2** — rule 7a v2, the 16 OWED CHAT-8 cells (verify-15 N1; M-237).
- **N-2, N-3, D-3, D-1, M-205(1)-floor** — the Committee of Adjustment findings drafted in the 69a dated note under
  M-239 (lane wf1/bylaw-fix-2; N-3 stays `it.fails`). D-3 also puts M-106 to the operator directly (see verify-15 N2
  above).
- **The 13 V3 condition-9 families** (the count as the integrate-15 brief lists it; not re-derived in this lane).
