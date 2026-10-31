# CARD MB-74 — ANSWERED 2026-10-30
Operator words (verbatim): "Mb-74 option A"
Option A, as presented in chat on 2026-10-30: take the single generated file scripts/analysis/bylaw/_schema/bylaw-rule-map.json out of the Layer 2 table_version recipe (Spec 134 §2, R-IW; scripts/generate-bylaw-layer2-input.mjs). The file is named, not the folder, so anything else added to _schema/ stays hashed (fail-safe). A lock test proves no file in Layer 2's evaluation path reads anything excluded from table_version, so "never stale law" holds. Readers today (executed grep, 2026-10-30): generate-bylaw-handbook.mjs, spec-split-check.mjs, gates/rule-map.mjs, spec133-bylaw-handbook.logic.test.ts. None is the evaluator or assembly.
The change takes the Spec 08 path (card → plan → panel → build); the ruling is recorded by decision-log with its lock; the pins and amendment index are re-recorded once after the build.
Rejected: B (re-pin after every ruling batch), C (move the file; same effect, more files).
