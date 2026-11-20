◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
REVIEW template=lens-error-paths.md model=deepseek-reasoner at=2026-11-20T15:27:12.975Z file_sha256=a7fcc4b0f8c39195da7086a09efb5ddd34328198eb4d6a26ae77521385c9640c prompt_sha256=b2d38d22a423ecb9e13069d0cc6a0a93cc605db6e4acdbda4f82e78dfecedb3c
🔍 Lens review of /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/fixspecs/lens/material.txt (model: deepseek-reasoner)

[deepseek-review] deepseek-reasoner working… reasoning 9789 chars, answer 0 chars, 15s
[deepseek-review] deepseek-reasoner working… reasoning 20478 chars, answer 0 chars, 30s
[deepseek-review] deepseek-reasoner working… reasoning 31953 chars, answer 0 chars, 45s
BUG severity=HIGH — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 "a `parcel_tool` hit counts one report (the `usage_events` row through `openReport`) only when the lookup has a lot" — no idempotency key is named for that row, so a client retry after a timeout or a double tap on the same lot produces the page twice and counts two reports for one produced report — name the dedup key (for example one counted row per user_id and subject_key per produced page) or state that a repeat request is a no-op.

BUG severity=MED — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 "the `usage_events` row through `openReport`" — the insert sits between a produced page and the charge and the note names no outcome if it throws, so the request either serves a produced report uncounted (silent revenue loss) or 500s after the compute (the user retries and can then double count), route body cannot be seen — state the failure mode explicitly (serve and retry the write, or fail closed before serving).

BUG severity=MED — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 "when the server's own read of `lotForm` says `unsure` and the request does not carry `semi=answered`, `page` is sent null" — a read that throws does not "say unsure", so a DB error on the held-lot check falls outside both the hold and the no-count branch, leaving the charge undefined on the one dependency the meter trusts for safety, route body cannot be seen — state that a failed `lotForm` read holds the page and counts nothing (fail closed).

BUG severity=MED — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 "while the question is owed it shows the loading state, not the approved miss text, until the redirect to the question" — no timeout or fallback is named, so a client that cannot render the semi question (an installed build from before task 360/319) or a failed navigation sits in loading forever for an unsure lot — bound the hold with a timeout that falls back to the approved miss text, or gate the hold on a client that can send `semi=answered`.

DEFER severity=LOW — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 "A hit with no `page` is served and logged `meter: not_produced`" and "the meter is logged `semi_pending`" — a held lot also has no page and the note does not order the two checks, so held hits can be logged `not_produced` (holds undercounted in monitoring) or double-logged — state that the held check runs before the generic no-page log.

DEFER severity=NIT — src/tests/spec-notes-1b.logic.test.ts (pasted) "const parity = d.checks.find((c: Json) => c.id === 'contract_parcels_entitlement__field_whitelist_parity');" — if that check id is ever renamed, the next line reading `parity.why` throws "Cannot read properties of undefined" instead of a named assertion, so the next editor gets an opaque failure — assert `parity` is defined before reading `why`.

VERDICT: FAIL on error-path safety
Paths walked: retry, double-submit, dependency read error (lotForm, openReport), timeout/redirect of the held lot, no-page empty state, meter log precedence   Unguarded: 4

---
⏱  50909ms (50.9s)
📊 Tokens — total: 33873, input: 24443, output: 9430, reasoning: 8634
