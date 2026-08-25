# Phase B · B5 — runtime CKAN resource resolution (WF2)

**Status:** Planning — grounded; **v3's scope premise REFUTED, scope is materially larger than framed.**
**Domain Mode:** **Backend/Pipeline** (`scripts/load-*.js`) → `scripts/CLAUDE.md`.
**Workflow:** WF2 (`.claude/workflows.md:67-95`). **Doctrine:** Spec 119 §1/§2/§4.7/§5.6 · Spec 08 §11.
**Governing specs — READ, not cited:** Spec 56 (massing, 82 ln) · Spec 55 (parcels, 97 ln) · Spec 54 (address points, 97 ln) · Spec 47 §R1–R12 · Spec 43 (chain).
**Rollback anchor:** `1cb4e308`. **Database Impact: NO.**

---

## §0 Grounding ledger

| # | Claim | Command | Result | Prov |
|---|---|---|---|---|
| G1 | **Only ONE loader actually fetches `package_show`** | `grep -rln package_show scripts/` then read each | `load-zoning.js:362` (`httpGetJson(.../package_show?id=…)`) is the sole real call. `load-massing.js:35` is a **comment recommending it**; `:37` hardcodes a resource UUID + `…_2025_wgs84.zip`. `source-version.js` only *decides*, it never fetches. | [ME] |
| G2 | **The other two targets have NO version machinery at all** | grep for `sourceVersion\|source_dataset_version\|shouldSkip\|Last-Modified\|HEAD` | **zero hits** in `load-parcels.js` and `load-address-points.js` | [ME] |
| G3 | **B1's "four gates" exclude all three B5 targets** | `grep -rln source-version scripts/*.js` | 7 consumers: `compute-parcel-cost-estimates`, `link-parcel-addresses`, `link-wsib`, **`load-centreline`, `load-heritage`, `load-ravines`, `load-zoning`**. The four LOADER gates are centreline/heritage/ravines/zoning. **Not massing, not parcels, not address-points.** | [ME] |
| G4 | **v3's B5 premise is REFUTED for the code** | G1+G2+G3 | v3 says *"widen to all three pinned loaders … **since D3 already calls `package_show` for the latter two**."* It does not. D3's CKAN polling was **analyst-performed** — v3's own text reads *"CKAN polled 2026-08-05: address-points `last_modified 08-05T11:43`…"*, i.e. a human polled it while building the estimate. No code path does. | [ME] |
| G5 | **"has not rotated" — CONFIRMED** | `curl -I` the hardcoded URL | **HTTP 200**. The 2025 resource still resolves, so B5 is genuinely *preventive*, not a live outage. v3's urgency call was right. | [ME] |
| G6 | Massing's hardcoded URL carries **two** rotation risks | read `:37` | both a **resource UUID** (`667237d6-…`) and a **vintage in the filename** (`…_2025_wgs84.zip`). Either rotating breaks the loader. | [ME] |

## §1 The distinction v3 conflates — and it decides the deliverable

**B5 and D3 are different features that happen to share a `package_show` call.**

| | B5 — resource resolution | D3 — version skip gate |
|---|---|---|
| Problem | the pinned resource rotates → loader **breaks** (404) | data unchanged → we **re-download ~185 MB + ~327 MB** for nothing |
| Failure if absent | chain **hard-fails** on a vintage bump | chain is **slow but correct** |
| Ships as | resolve newest resource at runtime | tier-1 metadata + tier-2 content hash |
| Status | **none of the 3 targets have it** (G1) | shipped for 4 OTHER loaders (G3) |

v3 folded these together, which is what produced G4's false premise. **B5 is the not-breaking feature.** Treating it as "widen D3" would understate the work and mis-target the tests.

## §1b PIPELINE INVENTORY — grounded from `manifest.json` (the authority run-chain reads)

**6 chains / 86 steps:** permits **33** · coa **16** · **sources 27** · deep_scrapes 7 · entities 2 · wsib 1.
The sources chain's 27 steps contain **9 loaders**; the other 18 are links, enrichers, computes and asserts.

| Loader | CKAN? | Runtime resource resolution | Version/skip gate | In v3's B5 scope? |
|---|---|---|---|---|
| `load-zoning` | ✓ | **`package_show` ✓ (the ONLY one)** | ✓ | — already has it |
| `load-centreline` | ✓ | **pinned** | HTTP **HEAD** + ETag | — |
| `load-heritage` | ✓ | **pinned** | HTTP **HEAD** + ETag | — |
| `load-ravines` | ✓ | **pinned** | HTTP **HEAD** + ETag | — |
| `load-massing` | ✓ | **pinned** (UUID **+ `_2025_` vintage**) | none | ✓ |
| `load-parcels` | ✓ | **pinned** | none | ✓ |
| `load-address-points` | ✓ | **pinned** | none | ✓ |
| **`load-neighbourhoods`** | ✓ | **pinned — TWO resource UUIDs (`:23`, `:26`)** | none | ❌ **OMITTED** |
| `load-wsib` | ✗ not CKAN | n/a | none | correctly excluded |

**Three corrections this inventory forces:**

1. **`load-neighbourhoods` is missing from B5's scope.** It is CKAN-sourced, ungated, and pins **two** resource UUIDs — the same rotation failure as massing, with two failure points instead of one. v3 says "all three pinned loaders"; there are **four** ungated CKAN loaders. *(`load-wsib` is correctly out — it is not a CKAN source, which is why "three" looked right if you counted ungated loaders and stopped at the CKAN ones you happened to name.)*
2. **A version gate is NOT resource resolution.** centreline/heritage/ravines gate via **HTTP HEAD + ETag against their pinned URL** — `package_show: 0` for all three. So they detect *content* change but would still **404 on a resource rotation**, because the URL they HEAD is itself pinned. Their gate fails loudly rather than silently, which is better, but they are not immune.
3. **Only 1 of 8 CKAN loaders resolves resources at runtime.** The pinned-URL exposure is **7 of 8**, not 3. B5 should state which of the 7 it closes and why it stops there, rather than implying the rest are covered.

**SCOPE — OPERATOR RULING 2026-08-19: ALL SEVEN pinned CKAN loaders.** Not four, and the HEAD-gated three are **not** deferred to a follow-up:

| # | Loader | Today | What B5 adds |
|---|---|---|---|
| 1 | `load-massing` | pinned UUID + `_2025_` vintage, no gate | resolver |
| 2 | `load-parcels` | pinned, no gate | resolver |
| 3 | `load-address-points` | pinned, no gate | resolver |
| 4 | `load-neighbourhoods` | pinned ×2 UUIDs, no gate | resolver (both) |
| 5 | `load-centreline` | pinned + HEAD/ETag gate | resolver **feeding** the existing gate |
| 6 | `load-heritage` | pinned + HEAD/ETag gate | resolver **feeding** the existing gate |
| 7 | `load-ravines` | pinned + HEAD/ETag gate | resolver **feeding** the existing gate |
| — | `load-zoning` | already resolves via `package_show` | **the precedent** — do not rewrite it; extract from it |
| — | `load-wsib` | not a CKAN source | out of scope, correctly |

**⚠ The HEAD-gated three carry a design constraint the ungated four do not — and getting it backwards breaks them.**

Their existing gate is *"HTTP HEAD + ETag **against their pinned URL**."* The resolver does **not replace** that gate — it supplies the URL the gate then HEADs. So the ordering is load-bearing:

```
resolve newest resource (package_show)  →  HEAD that resolved URL  →  skip/download decision
```

Get it backwards — HEAD first, resolve second — and on a rotation you HEAD a dead URL, the gate fails on a 404, and it fails for the *wrong reason*: it reports "source unreachable" when the truth is "resource rotated." That is a **misdiagnosis machine**, not a safety net. Worse, these three currently pass their gate by HEADing a URL that happens to still exist; the failure is latent until the day it rotates, at which point the loudest signal points away from the cause.

**Preservation requirement (Regression Guardian's charter):** the HEAD/ETag gate and its `source-version.js` integration must survive byte-equivalent in behaviour. B5 changes *which URL is checked*, never *whether* it is checked. Their `source-version:2` wiring is a fence — B1 shipped it and tier-2 became newly live at `0b230472`; a resolver that bypasses it would silently retire a just-commissioned mechanism.

**Consequence for the shared helper:** it must return the resolved URL *plus* the resource's `last_modified`/ETag metadata, so the gated three can feed their existing comparison without a second HTTP round-trip — `load-zoning.js:360` already caches a `resource_id → last_modified` map from a single `package_show` (M5), which is exactly the shape needed. The precedent transfers.

## §2 Scope, corrected

Not *"widen an existing resolver."* It is: **give three loaders a runtime resource resolver they do not have**, with `load-zoning.js` as the **only implemented precedent** (cached single `package_show`, `resource_id → last_modified` map, max-age force-reload).

Per v3's surviving design constraints — **verified as still applicable, not assumed**: sort by `last_modified`; keep the `Shapefile` glob (the package also lists `Multipatch`); **do not parse the year** (vintages skip 2024, so year-parsing is a trap).

## §3 Tests — as CODE, reviewed at plan altitude BEFORE the file exists (§11.4)

```js
// src/tests/ckan-resource-resolver.logic.test.ts   (pure — no network)
// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md
// Fixture = a real package_show payload shape (resources[] with format/name/last_modified).

describe('resolveNewestResource', () => {
  const pkg = { resources: [
    { id: 'a', format: 'SHP',       name: '3dmassingshapefile_2023_wgs84.zip', last_modified: '2023-06-01T00:00:00' },
    { id: 'b', format: 'SHP',       name: '3dmassingshapefile_2025_wgs84.zip', last_modified: '2025-06-01T00:00:00' },
    { id: 'c', format: 'Multipatch',name: '3dmassing_multipatch_2026.zip',     last_modified: '2026-01-01T00:00:00' },
  ]};

  it('picks the newest by last_modified, NOT by the year in the filename', () => {
    // The Multipatch is newest by date but wrong format; 2025 SHP must win.
    expect(resolveNewestResource(pkg).id).toBe('b');
  });

  it('never parses a year out of the name (vintages skip 2024)', () => {
    // A 2024-named resource does not exist upstream; a year-parsing impl would
    // either crash or silently pick wrong when the sequence has gaps.
    const gapped = { resources: [
      { id: 'x', format: 'SHP', name: 'file_2023.zip', last_modified: '2026-09-01T00:00:00' },
      { id: 'y', format: 'SHP', name: 'file_2025.zip', last_modified: '2025-01-01T00:00:00' },
    ]};
    expect(resolveNewestResource(gapped).id).toBe('x');   // date wins over name
  });

  it('keeps the Shapefile glob — Multipatch is never selected', () => {
    const onlyMultipatch = { resources: [
      { id: 'm', format: 'Multipatch', name: 'x.zip', last_modified: '2026-01-01T00:00:00' }]};
    expect(() => resolveNewestResource(onlyMultipatch)).toThrow(/no .*shapefile/i);
  });

  // FAIL-LOUD, not fail-quiet: a resolver that returns undefined would make the
  // loader download `undefined` and fail far from the cause.
  it('throws on an empty or malformed resources array', () => {
    expect(() => resolveNewestResource({ resources: [] })).toThrow();
    expect(() => resolveNewestResource({})).toThrow();
  });

  it('is deterministic when two candidates tie on last_modified', () => {
    const tie = { resources: [
      { id: 'p', format: 'SHP', name: 'a.zip', last_modified: '2026-01-01T00:00:00' },
      { id: 'q', format: 'SHP', name: 'b.zip', last_modified: '2026-01-01T00:00:00' }]};
    expect(resolveNewestResource(tie).id).toBe(resolveNewestResource(tie).id);
  });
});
```

```js
// src/tests/ckan-loader-pinning.infra.test.ts — the REGRESSION the step exists to prevent,
// swept across ALL SEVEN loaders rather than spot-checked on massing.
const PINNED = ['load-massing','load-parcels','load-address-points','load-neighbourhoods',
                'load-centreline','load-heritage','load-ravines'];

it.each(PINNED)('%s pins no CKAN resource id or vintage', (name) => {
  const src = fs.readFileSync(`scripts/${name}.js`, 'utf-8');
  expect(src).not.toMatch(/\/resource\/[0-9a-f-]{36}\//);   // RED today, all 7
  expect(src).not.toMatch(/_20\d\d[_.]/);                   // vintage in a filename
});

// load-zoning is the PRECEDENT, not a target — assert it stays resolved, so a future
// refactor cannot quietly re-pin the one loader that already does this correctly.
it('load-zoning still resolves at runtime (the precedent must not regress)', () => {
  expect(fs.readFileSync('scripts/load-zoning.js','utf-8')).toMatch(/package_show/);
});
```

```js
// src/tests/ckan-resolver-ordering.logic.test.ts
// The HEAD-gated three: resolve MUST precede HEAD. Backwards, a rotation reports
// "source unreachable" instead of "resource rotated" — a misdiagnosis machine.
it('resolves the resource BEFORE the HEAD/ETag check', async () => {
  const calls = [];
  await runLoaderGate({
    packageShow: async () => { calls.push('resolve'); return FIXTURE_PKG; },
    head:        async () => { calls.push('head');    return { etag: 'x' }; },
  });
  expect(calls).toEqual(['resolve', 'head']);     // RED against a head-first impl
});

// PRESERVATION (Guardian): the gate must still fire. B5 changes WHICH url is
// checked, never WHETHER it is checked — source-version.js tier-2 went live at
// 0b230472 and must not be bypassed.
it('still consults the existing HEAD/ETag gate after resolving', async () => {
  const head = vi.fn(async () => ({ etag: 'unchanged' }));
  const r = await runLoaderGate({ packageShow: async () => FIXTURE_PKG, head });
  expect(head).toHaveBeenCalledTimes(1);
  expect(r.skip).toBe(true);                      // unchanged ETag still skips
});
```

**Red-first note:** the infra test is red **today** against `load-massing.js:37` — proven by the same grep in G1/G6. The logic tests red on absence of `resolveNewestResource`, and must fail with a message naming the missing export rather than an opaque `TypeError`.

## §4 Roster (§11.5 lean) — deliberately SMALLER than B4's

**PLAN (2 seats, not 4):** **Integration** (main tree — the only seat that can confirm the `load-zoning.js` precedent transfers, and whether the three loaders' download paths differ enough to break a shared resolver) · **Regression Guardian** (main tree — `load-massing.js:35`'s comment says the resolver was *intended* and never built; that history is a fence worth reading before removing the pin).

**NOT convened, with reason:** **Reality-Check** — B5 changes no derived values, only *which file is downloaded*; its subject-matter trigger does not fire. **Idempotency Lens** — no destructive write, no backfill, no transaction boundary; the resolver is a pure read. **CLIs** — demoted (§11.5). *Recording the non-convocations is the §5.6 discipline: the roster is a menu, and a seat that cannot fire is cost, not coverage.*

**FOLD-VALIDATION (2, mandatory):** grounder re-executes every claim in the fold · Cross-read Adversary (pairwise + staleness + suite coherence).

**OUTPUT (2):** Regression Guardian + one grounded reviewer.

## §5 Execution plan (WF2, verbatim)

- [ ] **State Verification** — §0 (done; G4 refutes v3's premise, scope corrected).
- [ ] **Contract Definition** — N/A, no API route.
- [ ] **Spec Update** — Specs 56/55/54: record that the resource is resolved at runtime; remove the pinned-URL text from Spec 56's `| URL |` row (`:15`), which currently documents the hardcoded 2025 path as the contract. `npm run system-map`.
- [ ] **Schema Evolution** — N/A (Database Impact NO).
- [ ] **Guardrail Test** — author §3 as written.
- [ ] **Red Light** — prove each red at its designed assertion; paste output.
- [ ] **Implementation** — extract the `load-zoning.js` resolver into a shared helper rather than copy-pasting it three times (three copies is the drift surface Spec 119 §4.6 warns about).
- [ ] **UI Regression** — N/A.
- [ ] **Pre-Review Self-Checklist** — 5–10 items from Spec 56's Behavioral Contract, walked against the ACTUAL diff, PASS/FAIL before tests.
- [ ] **Panel** — §4's 2 seats.
- [ ] **Fold-validation** — §4's pair. Mandatory.
- [ ] **Green Light** — `typecheck && lint && test && test:py && test:db`.
- [ ] **ARRIVAL** — branch work riding B7/B8; state it, don't default.

## §6 Known risks

* **Scope is larger than v3 framed** (G4) — three loaders gain machinery they lack, not a widening. Estimates derived from "widen" are wrong.
* **Only one precedent exists** (`load-zoning.js`) and it was written for zoning's package shape; whether it transfers is the Integration seat's first question.
* **`load-massing.js:35`'s comment says this was intended and never built** — the Guardian should establish *why* before the pin is removed.
* **Not urgent** (G5, HTTP 200) — so this must not preempt anything time-boxed. If B7 pressure appears, B5 is the correct thing to defer.

> **NOT PLAN LOCKED** — §3's tests have not been reviewed at plan altitude (§11.4), and the panel has not run. Scope is grounded; the design is not yet reviewed.
