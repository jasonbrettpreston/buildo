# CARD SC-Q4 answered 2026-10-29 (operator, verbatim): "We need to include the ravine bylaws that impact the max build ? In the same way that a corner lot or a heritage building impact the max build. That's why we have these data sources as a step in the process"

## SC-Q4 Ravine by-laws in the max build — ANSWERED yes
- Every ravine provision that changes the maximum building is applied to the lot exactly as corner-lot and heritage facts are: a lot fact produced by a data-source pipeline step, read by Layer 2, applied by the Phase 3 engine.
- Provisions: 569-2013 5.10.40.70(6) and 5.10.40.80(1) (10 m from the shoreline hazard limit or stable top-of-bank), 5.10.40.40(1) (floor-area treatment), the ravine exceptions 900.3.10(4) and (729), and any other ravine clause the table holds; each keyed with a measurable target (today target "none", not_modelled).
- Data: acquire the TRCA top-of-bank / shoreline hazard line as a source step under the step handbook (Spec 132), producing the lot's distance to the line; the ravine polygon flag already held stays.
- Toronto Municipal Code Ch.658 (Ravine and Natural Feature Protection) sets no 10 m figure in our pinned text; where it applies to a lot it is a DISCLOSURE (a permit may be required), not a dimensional limit, unless a keyed clause says otherwise.
- Where the line is not held for a lot in the ravine area, the result reads "may exceed: TRCA line needed", never a guess. The old RAVINE_SETBACK_M constant (mislabelled Ch.658) is deleted.
Rule-text line: "Ravine provisions that change the maximum building are applied from keyed clauses and a TRCA top-of-bank source step, like corner and heritage lot facts; where the line is not held the result says so; Ch.658 is disclosed where it applies."
