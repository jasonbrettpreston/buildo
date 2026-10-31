# CARD MB-17 answered 2026-10-29 (operator, verbatim): "1. yes 2. yes 3. yes" (in the order presented: Q3 attic fix, Q1 exception types, Q2 bounds)
Card: ~/Buildo-scratch/p2close/CARD-mb17-bounds.md.
## MB17-Q3 Mechanical attic allowance never breaks INV-7 — YES
mechanicalAtticExclusion (src/features/leads/lib/renovation-shared.js:95) must not let GFA exceed fsi x lot where FSI applies (INV-7); the exclusion counts only up to the room left under the cap. 17 options on 13 of 25 lots move (list ~/Buildo-scratch/p2close/mb17/inv7-lots.txt), pre-registered first.
Rule-text line: "Where FSI applies, no exclusion or allowance lets a scenario's GFA exceed FSI x lot area (INV-7)."
## MB17-Q1 An exception applies only to the building types it names — YES
A0399: an exception written for a detached house does not set the setback of a detached houseplex (base 1.2 m applies, not 0.6 m). Built under MB-18 (exception arms and building-type reading).
Rule-text line: "An exception applies only to the building types it names."
## MB17-Q2 No invented numeric plausibility bounds — YES
The gates are the ruled invariants INV-7, INV-8 and INV-10; a scenario that fails one is shown "not evaluated: implausible"; the oracles (MB-29) cover the rest.
Rule-text line: "Plausibility is gated by the ruled invariants (INV-7, INV-8, INV-10); a failure shows 'not evaluated: implausible'; no numeric bound is set without a ruled source."
