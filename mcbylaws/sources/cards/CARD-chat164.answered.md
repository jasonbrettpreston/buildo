# CARD answered 2026-10-27 (operator: "READ-SOURCE revised, CONTRADICTED as recommended")

## CHAT-164.READ-SOURCE (revised)
- Current rule (CHAT-164): "re-read against their documents, values only, and reclassified in their own pre-registered round; until then they are not read."
- Example: A0388 area 230.1 keyed "confirmed"; plan facts source unknown; parcel 211.74; City-implied area within 0.75 %.
- Answer: an operator-keyed figure with status "confirmed" counts as read against that case's documents. No page number is required. The document is recorded per figure. A figure with no source gets its source filled only where exactly one document prints that value. Mismatches go to the operator.
- Alternative (not chosen): re-read each figure from its PDF in the round, keyed values not used.
- Cost: a per-figure source check (script) and a read-record; no page capture. Alternative needs one document read per figure.
- Rule-text line: "A keyed figure with status confirmed counts as read against the case's documents; its source is recorded per figure and auto-filled only where exactly one document prints the value; any mismatch goes to the operator."

## CHAT-164.CONTRADICTED
- Current rule (CHAT-164): unknown-source figures "are not read" until the round.
- Example: A0399 corner plan facts true, golden none; A0578 area 356.65 vs golden 345.22.
- Answer: the golden value wins; the other figure stays disclosed (lot_held_unread).
- Alternative (not chosen): stay unread until a document read.
- Cost: none beyond the read-record; 2 lots known.
- Rule-text line: "Where a keyed value contradicts an unknown-source figure, the keyed value is read and the other figure stays disclosed."
