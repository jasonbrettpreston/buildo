# CARD answered 2026-10-29 (operator, verbatim): "amend M-172(2) approved"
## M172-AM Abutting facts read from the neighbour relation
- M-172(2) (and its 2026-10-15 note) kept the abutting-lot facts (neighbouring lot is a park, a lane, holds a building) as site facts only, because no abutting-lot relation was held. MB-54 (CHAT-204) wires parcel_abutments (Spec 130).
- Amendment: where parcel_abutments holds the neighbour, the abutting facts are read from it; where it does not, they stay site facts the user can supply.
Rule-text line: "Abutting-lot facts are read from the Spec 130 neighbour relation where it holds the neighbour, and remain user-supplied site facts where it does not (amends M-172(2))."
