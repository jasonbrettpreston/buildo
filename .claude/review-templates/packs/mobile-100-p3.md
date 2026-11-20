# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Mobile parcel cost tool (Spec 100, whole)
Source: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:1-186
Generator: hand-written
Rules in the whole list: 7 (counted by pattern /^## \d+\./) · this is part 3 of 3

## Known Failure Modes

- **Whitelist leak (NEW).** A future migration adds a Tier-2/Tier-3 `parcels` column and a naive assembler spreads it into the response. Guard: the §3.2 explicit pick-by-name assembler + the `.infra` whitelist test (no unlisted key; no `groups`; no Spec 89 Tier-3 column name).
- **`address_status='CURRENT'`-only filter** — matches 0 production rows (data is `'None'`/NULL). Guard: the resolver reuses the Spec 89 §3 filter (`NULL/CURRENT/NONE` + `maint_stage='REGULAR'`); the admin lib's own test pins it, and this route imports that lib.
- **Third normalizer copy** — a new TS/JS port would silently diverge from the JOIN keys. Guard: reuse `@/lib/parcels/address` via the admin lib; never fork.
- **No-match-is-a-result** — treating a miss or an unknown `parcelId` as a 404 breaks the client state machine. Guard: the §2.6 200-with-null contract + the `.db` unknown-`parcelId` case.
- **Tier-stratified degradation** — a whole-payload strict Zod would blank the Tier-1 cost menu when a Tier-2 blob drifts. Guard: independent `safeParse` per tier + `warnings[]` (Spec 89 §2.4), tested in `.db`.
- **Envelope-fallback mislabel (NEW).** Labeling a `max_build` line "as-of-right" when it was priced off the max envelope (`opt_aor` NULL) misrepresents the number. Guard: the §2.4 label rule + the `parcelCostFormat` helper test.
- **Sponsor-slot empty DOM (NEW).** The reserved region must render `null` (not an empty styled box) until flag-gated. Guard: `SponsorSlot` returns `null` while off + its Jest test. Dated note 2026-11-12 (M-246, prior text kept; MF-48 Stage B with MF-74, operator "Ball y" B-6; OUTPUT panel regression guardian item 5): `SponsorSlot` and its Jest test are deleted with the old lot screen. The failure mode stays: the report's ad slots are the v21 page `ad` sections, and an ad section with no ad value draws nothing (no empty box). Guard now: the MF-48 mobile props goldens and render test (`mobile/__tests__/reportScreens.golden.test.ts` "page_no_ad has no ad ref"; `reportPage.behaviour.test.tsx` "no ad value, no ad box").
- **Raw `q` in logs.** Search text is user input; logging it is a hygiene regression. Guard: the observability logs `outcome` + `parcelId` + `matchType` only; the `.infra` log-hygiene lock asserts `q` is never passed to `logInfo`.

## 8. Future (reserved — no v1 code beyond the null placeholder)

- **Sponsor slots** — architect / designer / trade sponsorships rendered in the reserved `SponsorSlot` region on the detail screen, flag-gated (`EXPO_PUBLIC_PARCEL_SPONSORS`). A future spec defines the slot inventory, targeting, and billing.
- **Map fast-follow (23C — own WF):** a map pane with the parcel + example pins, a map-search mode, and a Maestro `parcel-cost.yaml` battery. Requires exposing `centroid_lat/lng` in the response (a conscious whitelist extension) and is out of v1 scope.
- **Home-looker persona / pricing** — v1 access is existing subscribed app users; a distinct home-looker persona, entitlement, and pricing (and an optional `parcel_view_events` trial counter) are a later product decision.


