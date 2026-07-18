# Spec 117 — MaxBLD Brand Identity

**Status:** DECIDED 2026-07-18 (5 enumerated open items carry recommended defaults; none block current build work)
**SPEC LINK:** `docs/specs/00-architecture/117_maxbld_brand.md`
**Brand name:** MaxBLD. **Domain:** maxbld.ca (purchased).
**Cross-references:** Spec 116 (multi-product architecture — App A / App B / Admin surfaces, App B "own accent tint" note in §6 below) · Spec 113 (Supabase migration — rename rollout should not collide with the migration's own EAS/build churn) · `docs/specs/archive/74_lead_feed_design.md` (Lead Feed Design System — the "Industrial Utilitarian" palette this spec ratifies as brand-primary) · `docs/specs/03-mobile/96_mobile_subscription.md` (Stripe checkout flow — §6 dashboard branding checklist) · `docs/specs/00-architecture/00_system_map.md`

<requirements>
## 1. Current-state inventory (grounding)

This spec does not invent a palette from nothing — it ratifies what two of the three real product surfaces already ship, and flags the one surface that drifted.

### 1.1 Palette actually shipped, by surface

| Surface | Token | Value | Source |
|---|---|---|---|
| **Mobile app (Expo, App A — the real product)** | Primary accent (tab bar active, notification icon) | `#F59E0B` (amber-hardhat) | `mobile/tailwind.config.js:16` (`amber-hardhat`), `mobile/app/(app)/_layout.tsx:54` (`tabBarActiveTintColor: '#f59e0b'`), `mobile/app.json:63` (`expo-notifications` plugin `color`) |
| Mobile | Inactive tint | `#71717a` (zinc-500) | `mobile/app/(app)/_layout.tsx:55` |
| Mobile | Background (primary) | `#09090b` (zinc-950) | `mobile/tailwind.config.js:9` (`bg-feed`), `mobile/app.json:14,29` (splash + Android adaptive-icon `backgroundColor`) |
| Mobile | Card surface | `#18181b` (zinc-900) | `mobile/tailwind.config.js:10` |
| Mobile | Elevated surface | `#27272a` (zinc-800) | `mobile/tailwind.config.js:11` |
| Mobile | Border | `#3f3f46` (zinc-700) | `mobile/tailwind.config.js:12` |
| Mobile | Text primary / secondary / muted | `#f4f4f5` / `#a1a1aa` / `#71717a` | `mobile/tailwind.config.js:13-15` |
| Mobile | Secondary accent | `#22c55e` (green-go), `#ef4444` (red-alert) | `mobile/tailwind.config.js:18-19` |
| Mobile | Font family (declared) | `sans: Inter`, `mono: SpaceMono` | `mobile/tailwind.config.js:21-24` |
| **Web admin — Lead Feed Design System tokens (Spec 74, defined but currently UNCONSUMED)** | Primary accent | `#F59E0B` (`--color-action-primary`, `--color-amber-hardhat`) | `src/app/globals.css:61,80,84` |
| Web (Spec 74 tokens) | Background / card / elevated | `#1C1F26` / `#272B33` / `#31363F` | `src/app/globals.css:43-47` |
| Web (Spec 74 tokens) | Semantic timing badges | amber `#F59E0B` / green `#10B981` / blue `#3B82F6` / gray `#6B7280` / red `#DC2626` | `src/app/globals.css:61-65` |
| **Web admin — internal tool pages (the ACTUAL day-to-day admin UI)** | Primary accent | `bg-blue-600` / `text-blue-600` (Tailwind default blue) | 165 occurrences across 43 files, e.g. `src/app/page.tsx:20,33,42`, `src/app/admin/page.tsx` (19 occurrences), `src/components/funnel/FunnelPanels.tsx` (12) |
| Web landing page (`src/app/page.tsx`) | Background | `bg-white` / `bg-gray-50`, light mode | `src/app/page.tsx:9,50` |
| Web | Font family | none loaded via `next/font` (system font stack, Tailwind default) | grep for `next/font` in `src/` returns zero matches |

**Key finding — the palette is split, not absent.** The mobile app (the actual shipped product, App A) and the Spec 74 web design-system tokens (defined in `globals.css` but **not referenced by any component** — zero usages of `bg-feed`/`timing-now`/`amber-hardhat` outside the definition file itself) agree on the same primary: **amber `#F59E0B` on dark zinc/charcoal**. The web admin's day-to-day tool pages (dashboard, `/admin/*`, the landing page) instead use vanilla Tailwind `blue-600` on white/light-gray — the framework default a developer gets by not choosing a color, not a deliberate brand choice. §3 ratifies amber as the single primary and treats admin blue-600 as legitimate internal-tool debt, not a second brand.

### 1.2 Fonts

- **Mobile:** `tailwind.config.js` declares `sans: Inter`, `mono: SpaceMono`, but no font files are loaded — no `mobile/assets/fonts/` directory exists, and no `useFonts`/`Font.loadAsync`/`expo-font` call was found anywhere in `mobile/app` or `mobile/src` (one bare `fontFamily: 'SpaceMono'` reference in `mobile/src/components/auth/OtpInputField.tsx:56` with nothing loading that family). In practice the app renders on the RN default system font (San Francisco on iOS, Roboto on Android) — the declared font names are currently **inert config**, not shipped typography.
- **Web:** no `next/font` usage anywhere in `src/`. Renders on the Tailwind/browser default system font stack.
- **Spec 74 (design doc, `docs/specs/archive/74_lead_feed_design.md`, status "FUTURE BUILD — Design locked, not yet implemented")** specifies `DM Sans` (display) + `IBM Plex Mono` (data) — never implemented; superseded by §4 below in favor of a lower-cost system-font-first approach given neither surface currently pays the font-loading cost.

### 1.3 "Buildo" name occurrences (rename is FUTURE work — inventoried, not executed here)

Case-insensitive `buildo` matches across `src/` + `mobile/` (`.ts`/`.tsx`/`.json`, excluding `node_modules`): **317 files**. Not all are user-facing strings — most are `SPEC LINK` comments, `db/client.ts` internals, and test file headers. User-facing occurrences requiring a rename pass:

| Location | String | Source |
|---|---|---|
| Web `<title>` / metadata | `"Buildo - Lead Generation for Trades"` | `src/app/layout.tsx:6` |
| Web landing header + hero | `"Buildo"` (nav logo text), `"Buildo monitors 237,000+ Toronto building permits..."`, footer `"Buildo - Toronto Building Permit Leads"` | `src/app/page.tsx:13,36,99` |
| Web login | `"Buildo"` heading, `"Sign In to Buildo"` | `src/app/login/page.tsx:24`, `src/components/auth/LoginForm.tsx:79` |
| Web dashboard | `"Buildo"` header | `src/app/dashboard/page.tsx:35` |
| Web subscribe flow | `"...return to the Buildo app..."` (cancel/success pages), `"...Buildo app and tap 'Continue at buildo.com'..."` | `src/app/subscribe/{page,cancel/page,success/page}.tsx` |
| Web admin page title | `"Flight Center — Buildo Admin"` | `src/app/admin/flight-center/page.tsx:18` |
| Web admin copy | `"...for Buildo accounts"` | `src/app/admin/users/page.tsx:34` |
| Mobile sign-in / sign-up header | `"Buildo"` | `mobile/app/(auth)/sign-in.tsx:411`, `mobile/app/(auth)/sign-up.tsx:181` |
| Mobile settings alert copy | `"...blocking alerts for Buildo..."` | `mobile/app/(app)/settings.tsx:174` |
| Mobile onboarding | `"Contact Buildo support"`, `"How will you use Buildo?"` | `mobile/app/(onboarding)/manufacturer-hold.tsx:28,30`, `mobile/app/(onboarding)/path.tsx:16` |
| Mobile parcel-tool copy | `"Buildo currently covers Toronto..."` | `mobile/app/(app)/parcel-tool/index.tsx:77` |
| **App identity (breaking to change — see §8 OD-B4)** | `expo.name: "Buildo"`, `expo.slug: "buildo"`, `expo.scheme: "buildo"`, `ios.bundleIdentifier: "com.buildo.app"`, `android.package: "com.buildo.app"` | `mobile/app.json:3-4,7,18,31` |
| **Package identity** | `package.json` root `name: "buildo"`; `@react-native-firebase`/Sentry org/project strings `"buildo"` / `"buildo-mobile"` | `package.json:2`, `mobile/app.json:79-80` |

**Stripe checkout:** no hardcoded product/brand strings found in `src/app/api/subscribe/session/route.ts` or `src/app/api/webhooks/stripe/route.ts` — checkout uses a Stripe-configured Price ID, so branding (logo, accent color, statement descriptor, business name) lives entirely in the Stripe Dashboard, not in code. See §6 dashboard checklist.

### 1.4 Existing icon/splash assets

`mobile/assets/{icon,adaptive-icon,splash-icon,favicon}.png` exist as files but were not opened for content (binary; out of scope for this text-grounding pass — art review is a separate step, see §5).
</requirements>

---

<architecture>
## 2. Brand definition

### 2.1 Name usage

- Canonical form: **MaxBLD** — capital M, capital B-L-D, lowercase everything else. This exact casing in all prose, UI copy, marketing, and legal text.
- **Never:** `MaxBld`, `MAXBLD`, `Maxbld`, `Max BLD` (no space), `maxbld` (mid-sentence prose — lowercase is reserved for the domain/URL only).
- Domain: lowercase `maxbld.ca` (URLs, email addresses, statement descriptors follow platform convention instead — see §6).
- Do not backronym "BLD" in copy (no "Build Lead Data" expansions etc.) — it reads as "build," full stop.

### 2.2 Tagline

**Placeholder — operator to ratify (OD-B2).** Working line for internal use only, not yet cleared for external copy: *"Building intelligence for the trades that build."* Do not ship this externally without explicit sign-off; use the bare name + a one-line factual description (e.g. "MaxBLD — building permit leads for Toronto trades") wherever copy is needed before OD-B2 resolves.

### 2.3 Mood / personality

Derived from the product, not from mood-boarding: a B2B tool trades use on a job site (App A: lead-gen + flight-center) expanding toward a B2C/developer audience (App B: lot-optimization, per Spec 116). The Spec 74 design brief already did this work correctly for App A ("Bloomberg-terminal efficiency over Pinterest-style browsing") — this spec generalizes it across the brand:

- **Confident** — states numbers and facts, doesn't hedge with marketing softness.
- **Precise** — data-forward, monospace for numbers, exact over approximate.
- **Industrial-modern** — construction-signage color language (safety amber, not corporate blue) on a modern dark-UI substrate, not a literal hard-hat/blueprint pastiche.
- **Data-forward** — every screen answers "what changed, what do I act on" before it decorates.
- **Not:** playful (no mascots, no bouncy motion — Spec 74 §8 "Minimal. This is a utility, not entertainment."), not corporate-sterile (avoid generic SaaS blue-on-white — that drift is exactly what §1.1 found in the admin/landing surfaces and what this spec corrects going forward).

### 2.4 Voice / tone

- Concise: short sentences, no filler adjectives ("robust," "seamless," "powerful").
- Evidence-first: lead with the number/fact ("237,000+ Toronto building permits monitored daily"), not the feeling.
- No hype: no exclamation points in product copy, no "revolutionize"/"game-changing"/"unlock." Matches the existing landing-page copy style (`src/app/page.tsx:36`) — keep that register, apply it everywhere else.
- Direct address in UI copy ("Your leads," "Set your home base"), third person in marketing copy.
</architecture>

---

<behavior>
## 3. Color system

### 3.1 Decision: ratify amber-on-charcoal as the single brand primary

Per §1.1, two of three real surfaces (mobile app — shipped and live; Spec 74 web tokens — defined, matching, just unconsumed) already agree on amber `#F59E0B` on dark zinc/charcoal. The admin/landing `blue-600`-on-white styling is Tailwind's un-chosen default, not a considered alternative — ratifying amber is the **least-churn** path: it requires zero changes to the mobile app (already shipping it) and turns the dormant Spec 74 web tokens from unused to load-bearing rather than replacing them. Blue-600 admin pages are not migrated by this spec (see §6 — admin is brand-lite by design) but MUST NOT be extended with new non-amber "primary" buttons going forward.

**Construction-industry justification (deliberate, not incidental):** amber is OSHA/CSA hard-hat and caution-tape color — it reads as "attention" and "action" in a trades context more naturally than blue or green (this reasoning is inherited verbatim from Spec 74 §3, which already made this call for the product surface; this spec extends the same call to the full brand).

### 3.2 Tokens

| Role | Hex | Tailwind token (web, `@theme` in `globals.css`) | Mobile constant (`mobile/tailwind.config.js`) |
|---|---|---|---|
| **Primary** | `#F59E0B` | `--color-action-primary`, `--color-amber-hardhat` → `bg-action-primary` / `bg-amber-hardhat` | `amber-hardhat` |
| Primary hover/active | `#D97E06` (darken ~12%, meets AA on white; use `#FBBF24` "amber-glow" for active/highlighted state on dark bg) | `--color-action-primary-hover` (NEW token — not yet defined; add alongside this spec's rollout) | `amber-glow` (already defined, `#fbbf24`, `mobile/tailwind.config.js:17`) |
| Neutral 950 (bg) | `#09090b` | `--color-feed` maps conceptually; web currently uses `#1C1F26` — reconcile per §3.3 | `bg-feed` |
| Neutral 900 (card) | `#18181b` / `#272B33` (two values in use — see §3.3) | `--color-card-permit` | `bg-card` |
| Neutral 800 (elevated) | `#27272a` / `#31363F` | `--color-elevated` | `bg-elevated` |
| Neutral 700 (border) | `#3f3f46` | (undefined on web — add `--color-border-subtle`) | `border-subtle` |
| Text primary | `#f4f4f5` / `#F5F6F7` | `--color-text-primary` | `text-primary` |
| Text secondary | `#a1a1aa` / `#B5B9C0` | `--color-text-secondary` | `text-secondary` |
| Text muted/tertiary | `#71717a` / `#9CA3AF` | `--color-text-tertiary` | `text-muted` |
| Semantic success | `#10B981` (green-safety) | `--color-green-safety` | `green-go` (`#22c55e` — near-equivalent, not identical; reconcile per §3.3) |
| Semantic warn | `#F59E0B` (shared with primary — timing/attention context differentiates it) | `--color-timing-now` | `amber-hardhat` |
| Semantic error | `#EF4444` / `#DC2626` (two reds in use — `red-stop` for actions, `timing-past`/`DC2626` for the "past-due" signal) | `--color-red-stop` | `red-alert` (`#ef4444`) |
| Semantic info | `#3B82F6` (blue-blueprint) | `--color-blue-blueprint` | (undefined — add `blue-blueprint` to mobile config) |

### 3.3 Known token drift to reconcile (flagged, not fixed by this spec)

Mobile (zinc scale) and the Spec 74 web tokens (bespoke hex) are **close but not byte-identical** — e.g. background `#09090b` (mobile) vs `#1C1F26` (web token), card `#18181b` (mobile) vs `#272B33` (web token), success green `#22c55e` (mobile) vs `#10B981` (web token). Both read as "dark charcoal + amber" to a human eye and both pass the WCAG audit already performed for the web set (Spec 74 §3, April 2026). This spec does not force byte-identical hex across surfaces — visual family consistency is the bar, not pixel-identical tokens — but flags it as technical debt for the Spec 116 §E4 shared-tokens package (§7 below) to resolve when it lands, at which point ONE set of hex values wins.

### 3.4 Dark mode

Both real surfaces (mobile, Spec 74 web tokens) are dark-mode-only today — there is no light-mode variant of the brand-primary experience to maintain. The admin blue/white pages are a separate, brand-lite surface (§6) and are exempt from a dark-mode requirement. Do not introduce a light-mode toggle for the brand-primary experience without a new spec — Spec 74 §1 made outdoor-glare dark-mode a deliberate differentiator, not a default worth diluting.

### 3.5 WCAG AA contrast requirements

- **Primary-on-dark:** amber `#F59E0B` text/icons on `#1C1F26`–`#272B33` backgrounds — already verified passing by the Spec 74 April 2026 audit (`docs/specs/archive/74_lead_feed_design.md` §3, `--text-primary` 13.3:1, `--text-secondary` 8.4:1, `--text-tertiary` 5.6:1).
- **Primary-on-light (new requirement, needed wherever brand touches a light/white surface — Stripe checkout page, future maxbld.ca marketing site, App B if it ships light-mode):** raw `#F59E0B` on white fails AA for normal text (contrast ≈ 2.0:1). Use the darker `#D97E06` hover/active variant (§3.2) for text-on-white, or reserve raw `#F59E0B` for large text (≥18pt / bold ≥14pt, 3:1 threshold) and non-text UI components (buttons with white text ON amber fill, not amber text on white).
- **Any new token added under §3.2/§3.3 reconciliation MUST be contrast-checked before merge** — this is a repeatable gate, not a one-time April 2026 audit.
</behavior>

---

<testing>
## 4. Typography

### 4.1 Web

- **Current:** no `next/font` load; system font stack via Tailwind default.
- **Ratify (do not change now):** keep the system-font-first approach for the admin tool (§6 — brand-lite, no font-loading cost justified for an internal tool). For any future brand-primary web surface (maxbld.ca marketing site, or if the Spec 74 tokens get wired into real components), load via `next/font/google` for `Inter` (already the mobile `sans` declaration in `mobile/tailwind.config.js:23` — reuse rather than introduce DM Sans per the archived Spec 74 draft, to keep one sans family across surfaces) with a numeric mono (`IBM Plex Mono` or `JetBrains Mono`) for data-heavy tables, reserved for when a component actually needs it.
- **Heading/body/mono scale (proposed, for when typography is actually wired):**

  | Level | Family | Size | Weight |
  |---|---|---|---|
  | H1 | Inter | 36–48px | 700 |
  | H2 | Inter | 24–28px | 700 |
  | Body | Inter | 14–16px | 400 |
  | Data / numeric | Mono | 13–14px | 500 |
  | Caption / metadata | Inter | 12–13px | 400 |

### 4.2 Mobile

- **Current:** `sans: Inter`, `mono: SpaceMono` declared in `mobile/tailwind.config.js` but never loaded (§1.2) — effectively inert, renders on RN system font.
- **Decision:** either (a) wire `expo-font` + `useFonts` to actually load Inter + SpaceMono (small binary-size + one-time load-flash cost, `expo-font` is already a listed plugin in `mobile/app.json:59`), or (b) delete the dead `fontFamily` config and formally adopt system-font (San Francisco/Roboto) as the shipped typography, updating the one live reference in `OtpInputField.tsx:56`. This spec does not resolve (a) vs (b) — it is implementation work, not a brand decision — but flags that the current state ("declared, not loaded") is the one option NOT to leave standing, since it silently no-ops today.
- **Consistency rule:** regardless of (a)/(b), the *hierarchy ratios* (H1:body:caption size ratios, weight steps) MUST match the web scale in §4.1 even where the concrete font families differ by platform (system Inter-alike on iOS/Android vs whatever the web ships) — the brand is expressed through scale and rhythm, not a single locked font file.
</testing>

---

<constraints>
## 5. Logo / mark

**Not designed yet.** `mobile/assets/{icon,adaptive-icon,splash-icon,favicon}.png` exist today under the Buildo name/scheme and were not evaluated for reuse (art review, not text grounding — out of scope for this pass).

### Requirements for the eventual mark
- Legible as a **favicon at 16×16px** (monochrome-safe silhouette, no fine detail).
- Legible as an **app icon at 1024×1024px** (iOS) and an **Android adaptive icon** foreground layer (must survive circular/squircle/rounded-square masking — keep the mark inside the safe zone, don't bleed to edges).
- A **monochrome variant** (single color, works on both light and dark backgrounds) for contexts that can't render the full-color mark (e.g. some notification icon slots, print).
- A **clear-space rule**: minimum padding around the mark equal to the height of the "M" in "MaxBLD," on any background.
- Background/splash color: amber `#F59E0B` mark on the neutral-950 dark background (`#09090b`, matching the currently-shipped `mobile/app.json` splash `backgroundColor`) is the working assumption until art exists — do not introduce a different splash color as a placeholder.

### Placeholder policy until art exists
- Do not commission or generate a placeholder logo file for interim use — ship text-only ("MaxBLD" in the primary sans, amber-on-dark) everywhere a mark would go, rather than a filler graphic that later needs a second replacement pass.
- App icon / favicon files stay as-is (current Buildo assets) until the real mark lands AND the rename executes together (§8 OD-B4) — do not swap icon files without the accompanying name change; a MaxBLD-colored icon under the `com.buildo.app` bundle id / "Buildo" app name is a worse intermediate state than staying consistent.

## 6. Per-surface application

| Surface | Brand posture | Notes |
|---|---|---|
| **App A (Expo, existing mobile — lead-gen + flight-center)** | Full brand-primary | Tab bar, buttons, paywall/subscribe screens use §3 tokens as already shipped (amber-hardhat primary, zinc neutrals). No change required — this IS the reference implementation the rest of the brand system was reverse-derived from. |
| **App B (future, lot-optimization — Spec 116)** | Shares the §3 palette family; MAY get its own accent tint | Per Spec 116 §2 ("distinct market, own navigation, own store listing"), App B is a separately-identified product. It should read as visibly "part of the MaxBLD family" (same neutrals, same typographic rhythm) but is free to swap the amber accent for a distinct tint if product/market research supports it (e.g. a cooler tone for a more consumer/homebuyer-facing feel) — see OD-B5. Do not force byte-identical accent color between App A and App B; do force the same neutral/typography system. |
| **Web admin (internal tool)** | Brand-lite | Correct name ("MaxBLD Admin" once renamed), correct favicon, §3 tokens available for accents where convenient — but no marketing-polish obligation. The existing `blue-600` internal-tool styling is NOT required to be re-skinned to amber; new admin surfaces SHOULD prefer neutral/gray + the semantic tokens (success/warn/error) over introducing yet a third ad hoc color choice. |
| **Stripe Checkout / Customer Portal** | Dashboard-configured — human checklist, not code | No brand strings are hardcoded in `src/app/api/subscribe/session/route.ts` or the webhook handler (§1.3) — checkout/portal branding lives entirely in the Stripe Dashboard. **Operator checklist (Settings → Branding in the Stripe Dashboard):** (1) upload the MaxBLD logo once art exists (§5), (2) set accent color to `#F59E0B`, (3) set **statement descriptor to `MAXBLD`** (≤22 characters, this fits with room to spare — Stripe uppercases it for the bank statement line regardless of the brand's mixed-case rule in §2.1, that's a platform constraint not a brand violation), (4) set the public business name to "MaxBLD". This is a manual dashboard action, not a deploy. |
| **maxbld.ca marketing site (future)** | Full brand-primary | Not built yet. When built: full §3/§4 system, likely the first surface that actually NEEDS the typography work deferred in §4.1/§4.2 to be done for real (marketing pages carry more brand weight than a utility app). |
| **Store listings (App Store / Play Store)** | Full brand-primary, ties to Spec 116 §E7 | App name, icon, screenshots all need the real mark (§5) and the renamed identity (§8 OD-B4) before listing — cannot ship "MaxBLD" store metadata pointing at a "Buildo"-branded icon/binary. |

## 7. Token single-source rule

Brand tokens live in exactly two places today, and MUST be updated together:

1. **Web:** `src/app/globals.css` `@theme` block (Tailwind v4 CSS-first config, no `tailwind.config.*` file for the web app).
2. **Mobile:** `mobile/tailwind.config.js` `theme.extend.colors` (NativeWind).

**Future single source:** Spec 116 §3 identifies a monorepo shared-library extraction as the natural home for cross-app-shared code once App B exists. When that lands, brand tokens (this spec's §3.2 table) become a shared `@maxbld/tokens` (or equivalent) package that both `globals.css` and `mobile/tailwind.config.js` derive from, collapsing the §3.3 drift permanently. Until then: **changing a brand token requires updating BOTH files in the same commit, plus this spec's §3.2 table** (same discipline as `_contracts.json` change-together rules elsewhere in the repo — but brand tokens are explicitly NOT added to `_contracts.json` itself; that file is reserved for pipeline data-quality thresholds, not visual design tokens, and mixing the two would make `_contracts.json` a dumping ground).

## 8. Open decisions (recommended defaults — override to change)

| ID | Decision | Recommended default | Reversible? | Notes |
|---|---|---|---|---|
| **OD-B1** | Final primary hex ratification | `#F59E0B` (amber-hardhat) | Yes, but expensive after App B/marketing ship | This spec treats §3.1's ratification as the working default; formal operator sign-off still needed before it's "locked" for external-facing collateral (store listings, marketing site). |
| **OD-B2** | Tagline | Defer external use of the §2.2 placeholder line; ship bare name + factual one-liner until ratified | Fully reversible (copy-only) | Low cost to leave open; does not block any current build. |
| **OD-B3** | Logo commission | Commission after OD-B4 (rename) is scheduled, not before | N/A | Commissioning art under the old name/bundle-id risk sequencing waste if the rename timeline shifts the mark's context (e.g. app icon safe-zone differs if paired with a new adaptive-icon strategy). |
| **OD-B4** | Rename rollout timing (`app.json` name/slug/scheme/bundleIdentifier/package, `package.json` name, store listing names) | **Coordinate with Supabase migration Phase 2/4** (per `.cursor/active_task.md` + Spec 116) — do NOT run the rename as an isolated change | Slug/bundle-id change is **NOT reversible** for existing installs | **Flagged clearly per task instructions:** changing `expo.slug` and `ios.bundleIdentifier`/`android.package` is a **BREAKING change for EAS builds and push notifications** — it mints a new app identity from Apple/Google/Expo's perspective (new EAS project association, new push token namespace, App Store Connect / Play Console treat it as a different app, not an update). Given the product is pre-launch with zero users (per the Supabase migration's own greenfield framing), the LOWEST-cost sequencing is: do the bundle-id/slug rename in the SAME build cycle as the Supabase migration's own app rebuild (Phase 2 mobile auth cutover already forces a fresh EAS build for the auth-provider swap) — avoids paying for two separate EAS build/re-signing/re-registration cycles. Do not rename post-launch once real users/push tokens exist without a formal migration plan. |
| **OD-B5** | App B accent tint | Inherit `#F59E0B` at launch; revisit once App B's homebuyer-facing UX research exists | Yes | Per §6 — App B is free to differentiate but shouldn't invent a divergent accent before there's product research to justify it. Cheapest default is "same brand, ship it." |

## Known Failure Modes

- **Rename breaks EAS / bundle identity.** Changing `mobile/app.json` `slug`/`bundleIdentifier`/`package` outside a coordinated build cycle silently orphans existing EAS project links, push token registrations, and store listings (each platform treats it as a new app, not a rename). Guard: OD-B4 ties the rename to the Supabase migration's already-scheduled Phase 2 rebuild — no standalone rename PR.
- **Statement descriptor mismatch confuses cardholders.** If the Stripe Dashboard statement descriptor (§6) is left as a legacy "BUILDO"/generic value while the app displays "MaxBLD," subscribers see a bank-statement line that doesn't match the product they signed up for, driving avoidable chargebacks/support tickets. Guard: §6 checklist step 3, must be updated in the same operator session as the logo/name dashboard update, not deferred.
- **Token drift between surfaces compounds silently.** §3.3 already documents mobile/web hex drift that "reads the same" today; without the §7 same-commit discipline, future edits (e.g. a designer nudges the web hex for a marketing page) can drift further with no test catching it, since brand tokens have no CI gate (deliberately — see §7, not added to `_contracts.json`). Guard: this spec's §3.2 table is the human-checked source of truth until the Spec 116 shared-tokens package exists; any brand-token PR should diff against it.
- **Contrast failures on light surfaces.** Raw amber `#F59E0B` text-on-white fails WCAG AA (§3.5). Any new light-background surface (Stripe checkout customization, marketing site, App B if it ships light mode) that naively reuses the raw primary hex for text risks an accessibility regression the dark-mode-only surfaces never hit. Guard: §3.5's explicit dark-variant-for-light-bg rule.

## Operating Boundaries

### Target Files
- None — this is a design-system/brand-decision spec, not an implementation spec. No code, config, or asset files are modified by this spec itself.
- Future implementation work this spec governs (separate WF2/WF3 tasks, not performed here): `mobile/app.json`, `mobile/tailwind.config.js`, `src/app/globals.css`, `package.json`, all "Buildo" string occurrences inventoried in §1.3, `mobile/assets/*.png`, the Stripe Dashboard (external, human-operated, no repo file).

### Out-of-Scope Files
- Actual logo/icon art files — no art asset is created or modified by this spec (§5 is a requirements doc for a future design pass).
- `docs/specs/archive/74_lead_feed_design.md` — left as an archived design doc; this spec supersedes its typography choice (§4.1) but does not edit the archived file.
- `_contracts.json` — explicitly NOT extended with brand tokens (§7); that file remains pipeline-data-quality-threshold-only.
- Any App B source — App B does not exist yet (Spec 116 §6).

### Cross-Spec Dependencies
- **Relies on:** `docs/specs/archive/74_lead_feed_design.md` (source of the amber-on-charcoal palette this spec ratifies as brand-primary), Spec 116 (App A/App B/Admin surface boundaries that §6 applies brand posture to).
- **Constrains:** any future rename PR (OD-B4, must sequence with the Supabase migration's Phase 2/4 mobile rebuild per `.cursor/active_task.md`), any future logo/art commission (OD-B3), any future `next/font`/`expo-font` wiring (§4), the Stripe Dashboard branding checklist (§6, human-operated).
- **Consumed by:** future maxbld.ca marketing site spec (not yet written), future store-listing rollout (Spec 116 §E7), the eventual Spec 116 shared-tokens package (§7).
</constraints>
