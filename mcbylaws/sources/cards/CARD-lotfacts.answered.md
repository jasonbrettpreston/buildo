# CARD answered 2026-10-29 (operator, verbatim): "definitely for all recommended. Add to the queue to ensure completiion and ensure compliance" (in reply to MB-54 and MB-55), with earlier answers: "Mb-53 needs wiring" and "Mb-56 - our current building footprint data isnt great - this is just a disclosure - for the renovation scenario - we need a user input"

## MB-53 Street name into the lot vector — YES
Wire `parcels.primary_frontage_street_name` into the resolve_bylaws lot vector so `abuts_named_street` units decide.
Rule-text line: "The lot's frontage street name is a Layer 2 lot fact; clauses that name a street are evaluated from it."
## MB-54 Neighbour data (parcel_abutments) for front-yard averaging — YES
Wire parcel_abutments into Layer 2 and the max build as the FS-SB1/FS-SB2 neighbour front-setback input (one shared function) plus the abutting tokens; its costing use is separate.
Rule-text line: "Front-yard averaging and the abutting-building clauses read the neighbours from parcel_abutments through the FS-SB1/FS-SB2 chain."
## MB-55 Overlays — AS RECOMMENDED
Building setback overlay (15,296 lots) and the holding (H) symbol (105 lots) are wired into Layer 2 and the max build; policy area (29,757) and parking zone (73,778) feed the parking lot checks (MR-Q7); rooming house overlay (109,743) and the irregular-lot flag (127,115, our own) are disclosures.
Rule-text line: "By-law overlays that change the building (building setback overlay, holding symbol) are applied in Layer 2 and the max build; parking overlays feed the parking lot checks; use-only overlays and the irregular-lot flag are disclosed."
## MB-56 Lawfully existing — disclosure; renovation user input
Not derived from building footprints (not reliable enough). On ordinary lots: a disclosure that the existing-building allowance may apply and is not evaluated. In the renovation scenario: a user input ("is the existing building lawful?") that the model applies.
Rule-text line: "Lawfully existing status is never inferred from footprint data; it is disclosed on ordinary lots and taken from a user input in the renovation scenario."
