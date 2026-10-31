# CARD — McProof changes from the MB-64 increment-1 run (answered 2026-10-31)

Lessons (MB-64 review rounds 1–3, `MB-64/review/REVIEW*.md`):
- Stage 0 (question and inputs) plus City data found almost every defect. The blind check and the recompute found no arithmetic error.
- In round 3, Claude grounding changed 20 of DeepSeek's 39 verdicts, so DeepSeek alone is not enough.
- Fix rounds produced new small issues: three rounds instead of one.
- The DeepSeek script returned critique instead of answer tables on some blind calls.

Recommended changes to McProof (MB-77):
1. Run stage 0 and City data in full first, before any blind or recompute stage.
2. Skip the blind check and the recompute on low-risk Arithmetic examples, per the approved sizing (CARD-mcproof-sizing).
3. Build the MB-77 prompt builder (sub-item c) so that DeepSeek returns tables.

Operator answer, verbatim: "yes add to MB-77 the recommendations and let's move on and build Mb-67 as soon as MB-67 clears"
Reading of the second clause: build MB-73 (the queue checker, recommended in the same message) as soon as the MB-67 stage 8 review clears. MB-67 itself is already built.
