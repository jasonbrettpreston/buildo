# Verification index — wf2/p4-integrate-19

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

The branch merged by `wf2/p4-integrate-19` was verified in one round by verify-24. The verifier did not write the work
and read it only. The report is copied verbatim from the orchestrator's scratchpad
(`~/Buildo-scratch/verify-24/verify-24.md`) to [`layer2-build-1.md`](layer2-build-1.md). The copy is `cmp`-identical to
its source.

- **Integrate base:** `ee874371` (= `wf2/p4-integrate-18` tip, pushed)

## Merged branch

| # | Branch @ tip | Range verified | Verdict | Report |
|---|---|---|---|---|
| 1 | `wf2/layer2-build-1` @ `01917510` (Layer 2 `resolve_bylaws`, Spec 134: slice (a) pure functions, the generated Layer 1 input file, rulings R-IL..R-IX from chat batches J, K (CHAT-39) and L (CHAT-41), the round-0 measurement) | verify-24 read `b60f5158`; the three commits after it only fix its notes (see below) | PASS-WITH-NOTES | [`layer2-build-1.md`](layer2-build-1.md) |

## verify-24 notes and how each was resolved (on `wf2/layer2-build-1`)

| Note | Resolution | Commit |
|---|---|---|
| A (cosmetic, 124a:917 counter) | The sentence now says `R-IY`. | `01917510` |
| B (cosmetic, §B36 title) | The title now reads R-IL..R-IX (OQ-1..OQ-12 and Q-L2-3). | `01917510` |
| C (lane simplifications that depart from approved recommendations) | Not a code fix. Each is labelled "Simplified, with the reason" in its row. **Carried forward to the operator as one list** (below). | open |
| D (R-IU adds a variable name and an `inPopulation` guard) | Left as built, as instructed; going to the operator. | open |
| E (R-IN kept its superseded rule sentence; no conflict-check row for CHAT-41) | The pre-CHAT-41 rule sentence is marked `SUPERSEDED ... do not apply`. A §B36 conflict-check row for CHAT-41 is added, and the seven-question RECORDED cell cites `#CHAT-41`. | `01917510` |
| F (measurement script calls the old `cellKey`; 0.13 GB is a lower bound) | The script header now says it is the record of the run at `06a840b9`, not a runnable tool (not re-run). The lower-bound caveat is added in R-IN and Spec 134:33 and :159. | `49de58e3`, `01917510` |
| Plan lacked the R-IX lock-removal clause | Added to PIN L2-PREREQ. | `01917510` |
| (c) No gate-K red evidence for CHAT-41 | `docs/reports/red-evidence/resolve_bylaws/chat41-red.json`: the tip's test file run against `06a840b9`, 2 red and 43 green. | `2f1a7dfd`, `fb11d855` |
| Hazard (a) for step ②: `cellKey` is only as complete as the `readPaths` passed | New PIN L2-KEY-READPATHS in the plan: ② passes every read path including `building_type`, with a test that a class change moves the key. | `01917510` |
| Hazard (b), (c) | (b) is the open link-row question below. (c) is closed by the red-evidence file. | |

## Carried forward (open at this tip)

1. **Link-row size and form.** Option B (CHAT-41) leaves open how the lot link row points at its per-target rows. A
   per-lot map of about 53 short ids is about 0.5 GB (unmeasured) against the 1.64 GB kill line. Must be measured
   before commit ① freezes the row shape (plan §9, Spec 134:46 and :159).
2. **Migration 280 (not applied).** `resolve_bylaws_population_zone_classes` is at
   `docs/reports/layer2-measure/pending-migrations/280_resolve_bylaws_logic_variables.sql`, outside `migrations/` on
   purpose (a file in `migrations/` changes the migration count that 28 generated scorecards embed). It moves to
   `migrations/`, renumbered to the next free number (none of 280..289 exists on any branch today), at ①, with the
   seed-file entry, the registry row and the admin group, and the seed loader's decision on a list-valued type.
3. **R-IX lock.** The "nothing registered yet" case in `resolution.logic.test.ts` (the R-IX describe) is removed in the
   commit that lands ①. Recorded in plan PIN L2-PREREQ.
4. **Operator list for note C.** OQ-1: a generated file `require()`d statically instead of a runner `kind: "filesystem"`
   read, and `table_version` hashes all of `scripts/seeds/bylaw/**` and `scripts/analysis/bylaw/**` (1580 files), so an
   edit there re-stamps every row. OQ-3: no candidate-set signature or unit sha. OQ-4: the §5a string form is derived on
   read, `undecided` is not stored at v1, and the map has seven closed tables. OQ-9: no per-cell permission table.
   OQ-10: the existing `replace_keys` write instead of a `population_retract` runner field. Plus note D.
5. **Step ② PIN L2-KEY-READPATHS** (above) and the other Layer 2 PINs in the plan (§8).

## Integration actions taken

- **Merge.** `wf2/layer2-build-1` @ `01917510`, `--no-ff`, hooks on. `wf2/layer2-build-1` already contains `ee874371`
  (merged and renumbered there), so the merge was clean (merge commit `da53cccd`).
- **Checks on the merged tree:** `decision-log --check` clean (21 logs, 97 decisions); `spec-split-check --check` clean (8312 citations, 0 dangling); `generate-bylaw-layer2-input --check` clean; `generate-step-handbook --check` up to date; `system-map` unchanged; `tsc --noEmit` clean. Full suite (db tests excluded): 826 files, 19,606 tests passed, 0 failed. In this fresh worktree one file failed first, `admin-lead-schemas.contract.test.ts`, only because `mobile/node_modules` is absent here (PIN L2-3); with the symlink it passes (24 tests).
