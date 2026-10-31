# CARD Q-STAMP — ANSWERED 2026-10-30
Question (chat): should unchanged Layer 2 rows be re-stamped automatically when the version moves but nothing in the law changed? Recommendation: no; keep failing loudly (CHAT-180 disclosure-on-read, bylaw-materialize.js permissionDisclosuresOf throws PermissionRecomputeStaleError).
Operator words (verbatim): "No - thanks for finding the ruling - this is key and ensuring no conflicts."
Ruling: NO automatic re-stamp. Reads through the materialize path keep refusing on a stamp mismatch until a Layer 2 night recomputes the rows. Consequence recorded: the MB-26 Layer 2 night is a hard prerequisite before MB-31 integrates against stored Phase 2.
