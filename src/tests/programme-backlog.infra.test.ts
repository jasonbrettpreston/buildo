// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §10.3 (R-T, 2026-08-29)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 (R-T register row)
//
// Spec 122's C1 programme shipped six pilots against per-step gates, but a
// battery of CROSS-CUTTING promises — the eight-archetype coverage claim,
// the four Spec 120 §6 state tables, the "freeze after the eighth" mechanism
// itself — belonged to no single pilot and were found only by a manually
// commissioned inventory. This suite is what stops that recurring: it
// enforces that scripts/steps/_schema/programme-items.json (R-T's declared
// data) stays internally honest, that the generated report
// (docs/reports/generated/122-programme-backlog.md) never drifts from it,
// and that step-validate.mjs's cutover-prereq lock genuinely fires — proven
// both directions with fixtures, mirroring step-conformance.infra.test.ts's
// own canary discipline (an untested checker proves nothing, Spec 121
// §12b.6).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import Ajv from 'ajv';

const REPO_ROOT = path.resolve(__dirname, '../../');
const ITEMS_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/programme-items.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/programme-items.schema.json');
const GENERATED_PATH = path.join(REPO_ROOT, 'docs/reports/generated/122-programme-backlog.md');
const GENERATOR = path.join(REPO_ROOT, 'scripts/violations/generate-programme-backlog.mjs');
const STEP_VALIDATE = path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs');
const BAD_FIXTURE = 'scripts/steps/_schema/fixtures/programme/bad-unmet-cutover-prereq.json';
const GOOD_FIXTURE = 'scripts/steps/_schema/fixtures/programme/good-met-cutover-prereq.json';
const BAD_APPLIES_WHEN_FIXTURE = 'scripts/steps/_schema/fixtures/programme/bad-applies-when-condition-met.json';
const FIXTURE_HONESTY = 'scripts/steps/_schema/fixtures/programme/batching-count-honesty.json';
const GOOD_APPLIES_WHEN_FIXTURE = 'scripts/steps/_schema/fixtures/programme/good-applies-when-condition-unmet.json';

interface ProgrammeOwner {
  kind: 'pilot' | 'wf' | 'followup' | 'library-wf' | 'none';
  ref: string;
}
interface ProgrammeGate {
  kind: 'batching_prereq' | 'cutover_prereq' | 'nice_to_have';
  blocks: string[];
  applies_when?: { descriptor_path: string; equals: unknown };
}
interface ProgrammeItem {
  id: string;
  spec: string;
  title: string;
  promised: string;
  status: 'NOT_STARTED' | 'PARTIAL' | 'BUILT' | 'SUPERSEDED';
  evidence: string;
  owner: ProgrammeOwner;
  gate: ProgrammeGate;
  last_reviewed: string;
}

const raw = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8')) as { contract_version: number; items: ProgrammeItem[] };
const ITEMS: ProgrammeItem[] = raw.items;

/** The committed converted-slug file list (scripts/steps/_schema/converted.json), for section 8's STA-1 corpus check. */
const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');
const CONVERTED: string[] = (JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8')).converted as string[]).map((f) => f.replace(/\\/g, '/'));

// ---------------------------------------------------------------------------
// 1. Schema validity (AJV — the same library scripts/lib/step/validate.js uses)
// ---------------------------------------------------------------------------

describe('programme-items.json — schema validity', () => {
  it('validates against programme-items.schema.json', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(raw);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('has no duplicate ids', () => {
    const ids = ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares at least one item (an empty backlog is a vacuous pass, not a clean programme)', () => {
    expect(ITEMS.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Owner rule — every NOT_STARTED/PARTIAL item has a real owner
// ---------------------------------------------------------------------------

describe('programme-items.json — every item has an owner', () => {
  it('no NOT_STARTED or PARTIAL item has owner.kind "none"', () => {
    const bad = ITEMS.filter((i) => (i.status === 'NOT_STARTED' || i.status === 'PARTIAL') && i.owner.kind === 'none');
    expect(
      bad.map((i) => i.id),
      'a promise with no owner is exactly the failure class this file exists to stop — see docs/reports/generated/122-programme-backlog.md',
    ).toEqual([]);
  });

  it('owner.kind "none" is used ONLY for status SUPERSEDED (schema allOf, re-asserted here explicitly)', () => {
    const bad = ITEMS.filter((i) => i.owner.kind === 'none' && i.status !== 'SUPERSEDED');
    expect(bad.map((i) => i.id)).toEqual([]);
  });

  it('RED canary — a NOT_STARTED item with owner.kind "none" fails the schema (proves the rule fires)', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const bad = {
      contract_version: 1,
      items: [
        {
          id: 'FIXTURE-NO-OWNER',
          spec: '122 §10.3',
          title: 'canary',
          promised: 'canary',
          status: 'NOT_STARTED',
          evidence: 'canary',
          owner: { kind: 'none', ref: '' },
          gate: { kind: 'nice_to_have', blocks: [] },
          last_reviewed: '2026-08-29',
        },
      ],
    };
    expect(validate(bad)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Evidence rule — every BUILT item's evidence resolves to a real file or commit
// ---------------------------------------------------------------------------

/** Strip common trailing/leading punctuation a prose sentence wraps a path/hash in. */
function stripPunct(tok: string): string {
  return tok.replace(/^["'([]+/, '').replace(/["'):,.;\]]+$/, '');
}

/** True if `text` contains a token that resolves to a real repo-relative file, or a resolvable git object. */
function evidenceResolves(text: string): boolean {
  const tokens = text.split(/\s+/);
  for (const raw of tokens) {
    const tok = stripPunct(raw);
    const filePart = tok.split(':')[0] ?? '';
    if (filePart.includes('/') && fs.existsSync(path.join(REPO_ROOT, filePart))) return true;
    if (/^[0-9a-f]{7,40}$/.test(tok)) {
      try {
        execFileSync('git', ['cat-file', '-e', tok], { cwd: REPO_ROOT, stdio: 'ignore' });
        return true;
      } catch {
        /* not a real object — keep scanning */
      }
    }
  }
  return false;
}

describe('programme-items.json — every BUILT item has resolvable evidence', () => {
  const builtItems = ITEMS.filter((i) => i.status === 'BUILT');

  it('the BUILT corpus is not empty (a vacuous loop proves nothing)', () => {
    expect(builtItems.length).toBeGreaterThan(0);
  });

  for (const item of builtItems) {
    it(`${item.id} — evidence resolves (commit or file:line)`, () => {
      expect(evidenceResolves(item.evidence), `${item.id}.evidence = "${item.evidence}"`).toBe(true);
    });
  }

  it('RED canary — evidence with no real path or commit hash does NOT resolve (proves the resolver fires)', () => {
    expect(evidenceResolves('this promise was fulfilled, trust me')).toBe(false);
  });

  it('GREEN canary — a real file path resolves', () => {
    expect(evidenceResolves('see scripts/steps/_schema/programme-items.json for detail')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. The generated report never drifts from the seed
// ---------------------------------------------------------------------------

describe('docs/reports/generated/122-programme-backlog.md — generated, drift-guarded', () => {
  it('exists', () => {
    expect(fs.existsSync(GENERATED_PATH)).toBe(true);
  });

  it('a fresh run of the generator produces byte-identical output to the committed file (no drift)', () => {
    const result = execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(result).toContain('clean — no drift');
  });

  it('RED — a stale committed file is caught by --check (mutate a copy, prove the checker fires, restore)', () => {
    const original = fs.readFileSync(GENERATED_PATH, 'utf8');
    try {
      fs.writeFileSync(GENERATED_PATH, `${original}\nSTALE APPEND — this line should never survive a real regenerate\n`);
      let threw = false;
      try {
        execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });
      } catch {
        threw = true;
      }
      expect(threw, '--check must exit non-zero on a stale generated file').toBe(true);
    } finally {
      fs.writeFileSync(GENERATED_PATH, original);
    }
  });
});

// ---------------------------------------------------------------------------
// 4b. G9 (WF2 "template freeze" C1, 2026-09-04) — generate-programme-backlog.mjs's
//    render() mirrors step-validate.mjs's blocksBatchingCount honesty fix: both
//    the "**blocks batching: N**" summary line and the closing freeze-readiness
//    sentence must exclude BUILT/SUPERSEDED items, and must agree with each
//    other (they now share one computed count — see generate-programme-
//    backlog.mjs's `openBatchingPrereq`).
// ---------------------------------------------------------------------------

describe('generate-programme-backlog.mjs — render() blocksBatching honesty (G9)', () => {
  it('over the honesty fixture, both the summary line and the freeze-readiness sentence report 1, never 3', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as { render: (items: ProgrammeItem[]) => string };
    const fixture = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, FIXTURE_HONESTY), 'utf8')) as { items: ProgrammeItem[] };
    const rendered = mod.render(fixture.items);
    expect(rendered).toContain('**blocks batching: 1**');
    expect(rendered).toContain('Currently **1** item(s) block it.');
    expect(rendered).not.toContain('blocks batching: 3');
  });

  it('the two lines never disagree over the real committed data either', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as { render: (items: ProgrammeItem[]) => string };
    const rendered = mod.render(ITEMS);
    const summaryMatch = rendered.match(/\*\*blocks batching: (\d+)\*\*/);
    const readinessMatch = rendered.match(/Currently \*\*(\d+)\*\* item\(s\) block it\./);
    expect(summaryMatch, rendered).not.toBeNull();
    expect(readinessMatch, rendered).not.toBeNull();
    expect(summaryMatch![1]).toBe(readinessMatch![1]);
  });

  it('exported openBatchingCount() is the ONE implementation main()\'s --write console line, render()\'s summary line, and render()\'s freeze-readiness line all share (found live, C2: main()\'s console line still read the raw unfiltered count after render() was fixed — a third independent reimplementation of the same predicate)', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as { render: (items: ProgrammeItem[]) => string; openBatchingCount: (items: ProgrammeItem[]) => number };
    expect(typeof mod.openBatchingCount).toBe('function');
    const fixture = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, FIXTURE_HONESTY), 'utf8')) as { items: ProgrammeItem[] };
    expect(mod.openBatchingCount(fixture.items)).toBe(1);
    expect(mod.openBatchingCount(ITEMS)).toBe(
      ITEMS.filter((it) => it.gate.blocks.includes('batching') && it.status !== 'BUILT' && it.status !== 'SUPERSEDED').length,
    );
    // The CLI's own --write console line uses the same function — spawn it for real
    // and check the printed count agrees with the exported function over the real data.
    const out = execFileSync('node', [GENERATOR], { cwd: REPO_ROOT, encoding: 'utf8' });
    const cliMatch = out.match(/blocks batching: (\d+)\)/);
    expect(cliMatch, out).not.toBeNull();
    expect(Number(cliMatch![1])).toBe(mod.openBatchingCount(ITEMS));
  });
});

// ---------------------------------------------------------------------------
// 5. step:validate's programme section — "blocks batching: N", per-step
//    blocking items, and the cutover-prereq lock proven BOTH directions
// ---------------------------------------------------------------------------

describe('step-validate.mjs — programme section', () => {
  it('prints "blocks batching: N" unconditionally (the hook fast path line)', () => {
    const out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(out).toMatch(/\[step-validate\] programme: blocks batching: \d+/);
  });

  it('the real (committed) data is clean — no converted slug is blocked by an unmet cutover_prereq item', () => {
    const out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(out).toMatch(/\| 9 \| \(registry\) \| PASS \| clean \(0 converted slugs blocked/);
  });

  it('RED — the fixture with an unmet cutover_prereq blocking an already-converted slug fails the hard stop (exit 1)', () => {
    let threw = false;
    let out = '';
    try {
      out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, BUILDO_PROGRAMME_ITEMS_PATH: BAD_FIXTURE },
      });
    } catch (err) {
      threw = true;
      out = String((err as { stdout?: string }).stdout ?? '');
    }
    expect(threw, 'an unmet cutover_prereq blocking an already-converted slug must be a hard stop').toBe(true);
    expect(out).toMatch(/unmet cutover_prereq blocking an already-converted slug: compute_centroids/);
  });

  it('GREEN (EP-D13-adjacent, pilot 9 commit 8 P9, 2026-09-08) — the SAME bad fixture (blocks compute_centroids ONLY) does NOT hard-stop an UNRELATED step\'s own --fast run: gate.blocks is honoured literally, one blocked slug is not everyone\'s problem', () => {
    // Same BAD_FIXTURE as the RED test above (blocks ONLY compute_centroids), but this
    // invocation validates link_massing — a completely different, unrelated converted
    // step. Before the P9 fix, invariant #9's registry-wide FAIL made every step's own
    // --fast run hard-stop regardless of which slug was actually named — the exact
    // "cloud_deploy token or similar" over-broad wiring CLOUDPARITY's own real-world use
    // (blocking `enrich_parcels` alone, EP-D13) surfaced live.
    const out = execFileSync('node', [STEP_VALIDATE, '--step=link_massing', '--fast'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, BUILDO_PROGRAMME_ITEMS_PATH: BAD_FIXTURE },
    });
    expect(out, 'link_massing must NOT hard-stop on compute_centroids\' own unmet cutover_prereq').toMatch(/link_massing: \d+\/\d+ hard-stop=false/);
    // The registry-wide fact is still SURFACED (nothing hidden) — just not gating.
    expect(out).toMatch(/#9: unmet cutover_prereq blocking an already-converted slug: compute_centroids.*\(informational — does not name a slug in this run\)/);
  });

  it('RED-proof (EP-D13-adjacent, P9) — when the VALIDATED step IS the blocked slug, it still hard-stops (the GREEN test above is a real scope narrowing, not a blanket suppression)', () => {
    let threw = false;
    let out = '';
    try {
      out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, BUILDO_PROGRAMME_ITEMS_PATH: BAD_FIXTURE },
      });
    } catch (err) {
      threw = true;
      out = String((err as { stdout?: string }).stdout ?? '');
    }
    expect(threw, 'the NAMED slug\'s own --fast run must still hard-stop').toBe(true);
    expect(out).not.toMatch(/informational — does not name a slug in this run/);
  });

  it('GREEN — the same slug, same shape, but the item is BUILT — passes clean (proves the finding names the STATUS, not the fixture)', () => {
    const out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, BUILDO_PROGRAMME_ITEMS_PATH: GOOD_FIXTURE },
    });
    expect(out).toMatch(/\| 9 \| \(registry\) \| PASS \| clean \(0 converted slugs blocked/);
  });

  it('prints per-step blocking items when the fixture names this slug directly', () => {
    const out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, BUILDO_PROGRAMME_ITEMS_PATH: GOOD_FIXTURE },
    });
    expect(out).toMatch(/programme: compute_centroids is named by 1 blocking item\(s\)/);
  });

  // -------------------------------------------------------------------------
  // RS-D-STA (pilot 8 commit 9, operator ruling, 2026-09-03) — gate.applies_when.
  // A programme item may declare its applicability as a fact about the BLOCKED
  // slug's own descriptor (dot-path lookup) rather than a hand-adjudicated
  // exemption. Proven both directions against compute_centroids's REAL,
  // already-converted descriptor (scripts/compute-centroids.descriptor.json,
  // identity.archetype === "BACKFILL", verified) — the fixture only supplies
  // the programme-items.json side; the descriptor read is always the real one.
  // -------------------------------------------------------------------------

  it('RED — applies_when: a condition that MATCHES the blocked slug\'s descriptor still blocks (exit 1)', () => {
    let threw = false;
    let out = '';
    try {
      out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, BUILDO_PROGRAMME_ITEMS_PATH: BAD_APPLIES_WHEN_FIXTURE },
      });
    } catch (err) {
      threw = true;
      out = String((err as { stdout?: string }).stdout ?? '');
    }
    expect(threw, 'applies_when whose condition holds must still be a hard stop').toBe(true);
    expect(out).toMatch(/unmet cutover_prereq blocking an already-converted slug: compute_centroids <- FIXTURE-BAD-APPLIES-WHEN-1/);
  });

  it('GREEN — applies_when: a condition that does NOT match the blocked slug\'s descriptor does not block, even NOT_STARTED', () => {
    const out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, BUILDO_PROGRAMME_ITEMS_PATH: GOOD_APPLIES_WHEN_FIXTURE },
    });
    expect(out).toMatch(/\| 9 \| \(registry\) \| PASS \| clean \(0 converted slugs blocked/);
  });

  it('RED — an item with NO applies_when at all still blocks unconditionally (pre-existing behaviour, unchanged)', () => {
    // Re-states the BAD_FIXTURE proof above explicitly under the applies_when
    // feature's own describe scope, so this file documents both branches
    // (declared applies_when vs. none) side by side rather than relying on a
    // reader to notice the earlier block covers the "none" case.
    let threw = false;
    let out = '';
    try {
      out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, BUILDO_PROGRAMME_ITEMS_PATH: BAD_FIXTURE },
      });
    } catch (err) {
      threw = true;
      out = String((err as { stdout?: string }).stdout ?? '');
    }
    expect(threw, 'an item with no applies_when must keep blocking unconditionally').toBe(true);
    expect(out).toMatch(/unmet cutover_prereq blocking an already-converted slug: compute_centroids <- FIXTURE-BAD-1/);
  });
});

// ---------------------------------------------------------------------------
// 5b. G9 (WF2 "template freeze" C1, 2026-09-04) — blocksBatchingCount excludes
//    BUILT/SUPERSEDED items. Before this fix the count filtered on
//    gate.blocks.includes('batching') only, never status — a BUILT item's
//    already-delivered promise still counted as an open blocker forever,
//    meaning Spec 122 §8.2's "empty set" precondition could never be
//    satisfied except by deleting the row. FIXTURE_HONESTY carries one BUILT,
//    one SUPERSEDED, and one genuinely open batching_prereq item — the honest
//    count is 1, never 3.
// ---------------------------------------------------------------------------

describe('step-validate.mjs — blocksBatchingCount honesty (G9)', () => {
  it('a BUILT item and a SUPERSEDED item naming "batching" are NOT counted as open blockers — only the genuinely open one is', () => {
    const out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, BUILDO_PROGRAMME_ITEMS_PATH: FIXTURE_HONESTY },
    });
    expect(out).toMatch(/\[step-validate\] programme: blocks batching: 1 /);
    expect(out).toMatch(/blocks batching: 1\)/);
  });

  it('RED (status-blind, pre-fix) — a naive count that ignores status would report 3 over the same fixture, proving the fix is load-bearing', () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, FIXTURE_HONESTY), 'utf8')) as { items: ProgrammeItem[] };
    const naiveCount = fixture.items.filter((it) => it.gate.blocks.includes('batching')).length;
    const honestCount = fixture.items.filter((it) => it.gate.blocks.includes('batching') && it.status !== 'BUILT' && it.status !== 'SUPERSEDED').length;
    expect(naiveCount).toBe(3);
    expect(honestCount).toBe(1);
  });

  it('the real committed programme-items.json: an unfiltered count and the honest count now disagree by exactly the BUILT+SUPERSEDED batching_prereq rows (proves the live data actually exercises the fix, not just the fixture)', () => {
    const naiveCount = ITEMS.filter((it) => it.gate.blocks.includes('batching')).length;
    const honestCount = ITEMS.filter((it) => it.gate.blocks.includes('batching') && it.status !== 'BUILT' && it.status !== 'SUPERSEDED').length;
    const closedCount = ITEMS.filter((it) => it.gate.blocks.includes('batching') && (it.status === 'BUILT' || it.status === 'SUPERSEDED')).length;
    expect(closedCount).toBeGreaterThan(0);
    expect(naiveCount - honestCount).toBe(closedCount);
    const out = execFileSync('node', [STEP_VALIDATE, '--step=compute_centroids', '--fast'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(out).toMatch(new RegExp(`blocks batching: ${honestCount}\\b`));
  });
});

// ---------------------------------------------------------------------------
// 6. checkCutoverPrereqs / blockingItemsFor — the exported predicates, unit-level
// ---------------------------------------------------------------------------
//
// step-validate.mjs runs its own CLI unconditionally at import time (a bare
// `try { main(); } catch` at file end — by design, so a bad invocation exits
// loudly rather than silently no-op'ing), so its exports cannot be safely
// `import()`ed from a test process the way scripts/violations/*.mjs's pure
// generators can (see the drift-guard describe above, which DOES import
// generate-programme-backlog.mjs directly). The spawn-based fixture proof
// above already exercises checkCutoverPrereqs()/blockingItemsFor() at full
// fidelity (the real code path, real process boundary); this block re-states
// the predicate in miniature so the LOGIC itself has a fast, DB-free,
// spawn-free lock too — both are load-bearing, neither substitutes the other.

/** Mirrors scripts/analysis/step-validate.mjs's own getByPath — generic dot-path lookup. */
function getByPathMirror(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function checkCutoverPrereqsMirror(convertedSlugs: string[], items: ProgrammeItem[], descriptorsBySlug: Record<string, unknown> = {}) {
  const violations: Array<{ slug: string; id: string; status: string }> = [];
  for (const slug of convertedSlugs) {
    for (const it of items) {
      if (it.gate.kind !== 'cutover_prereq') continue;
      if (!it.gate.blocks.includes(slug)) continue;
      if (it.gate.applies_when) {
        const descriptor = descriptorsBySlug[slug];
        if (descriptor !== undefined) {
          const actual = getByPathMirror(descriptor, it.gate.applies_when.descriptor_path);
          if (actual !== it.gate.applies_when.equals) continue;
        }
      }
      if (it.status !== 'BUILT') violations.push({ slug, id: it.id, status: it.status });
    }
  }
  return violations;
}

describe('checkCutoverPrereqs predicate — mirrored unit lock (spec for the spawn-tested real implementation above)', () => {
  it('fires on an unmet cutover_prereq blocking a converted slug', () => {
    const items = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, BAD_FIXTURE), 'utf8')).items as ProgrammeItem[];
    expect(checkCutoverPrereqsMirror(['compute_centroids'], items)).toHaveLength(1);
  });

  it('stays clean when the item is BUILT', () => {
    const items = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, GOOD_FIXTURE), 'utf8')).items as ProgrammeItem[];
    expect(checkCutoverPrereqsMirror(['compute_centroids'], items)).toHaveLength(0);
  });

  it('ignores batching_prereq items (they gate the freeze declaration, never one slug\'s own cutover)', () => {
    const items: ProgrammeItem[] = [
      {
        id: 'X',
        spec: '122',
        title: 't',
        promised: 'p',
        status: 'NOT_STARTED',
        evidence: 'e',
        owner: { kind: 'wf', ref: 'r' },
        gate: { kind: 'batching_prereq', blocks: ['batching'] },
        last_reviewed: '2026-08-29',
      },
    ];
    expect(checkCutoverPrereqsMirror(['compute_centroids'], items)).toHaveLength(0);
  });

  it('the real committed data, run through the mirror, agrees with the spawn-tested real implementation (clean)', () => {
    // Derive the same converted-slug set step-validate.mjs's fast invariant #9 uses.
    const convertedRaw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/manifest.json'), 'utf8')) as {
      scripts: Record<string, { file: string | null }>;
    };
    const convertedFiles = convertedRaw.converted as string[];
    const slugs = convertedFiles.map((f) => {
      const found = Object.entries(manifest.scripts).find(([, e]) => e.file === f)?.[0];
      if (!found) throw new Error(`no manifest.scripts entry points at ${f}`);
      return found;
    });
    // Same slug -> descriptor map shape step-validate.mjs's real call site builds,
    // so this mirror exercises the applies_when path against REAL descriptors
    // (e.g. refresh_snapshot's recovery.reset, STA-2/STA-3's own RS-D-STA condition).
    const descriptorsBySlug: Record<string, unknown> = {};
    convertedFiles.forEach((relFile, i) => {
      const descPath = path.join(REPO_ROOT, relFile.replace(/\.js$/, '.descriptor.json'));
      if (fs.existsSync(descPath)) descriptorsBySlug[slugs[i]!] = JSON.parse(fs.readFileSync(descPath, 'utf8'));
    });
    expect(checkCutoverPrereqsMirror(slugs, ITEMS, descriptorsBySlug)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. gate.applies_when (RS-D-STA, pilot 8 commit 9, 2026-09-03) — mirror-level,
//    proven both directions independent of the CLI-spawn fixtures above.
// ---------------------------------------------------------------------------

describe('checkCutoverPrereqs predicate — gate.applies_when (RS-D-STA)', () => {
  const baseItem: ProgrammeItem = {
    id: 'X',
    spec: '122',
    title: 't',
    promised: 'p',
    status: 'NOT_STARTED',
    evidence: 'e',
    owner: { kind: 'wf', ref: 'r' },
    gate: { kind: 'cutover_prereq', blocks: ['some_slug'], applies_when: { descriptor_path: 'recovery.reset', equals: 'generated' } },
    last_reviewed: '2026-09-03',
  };

  it('RED — applies_when condition MATCHES the slug\'s descriptor: still blocks', () => {
    const descriptorsBySlug = { some_slug: { recovery: { reset: 'generated' } } };
    expect(checkCutoverPrereqsMirror(['some_slug'], [baseItem], descriptorsBySlug)).toHaveLength(1);
  });

  it('GREEN — applies_when condition does NOT match the slug\'s descriptor (prose reset, e.g. refresh_snapshot\'s real shape): does not block', () => {
    const descriptorsBySlug = { some_slug: { recovery: { reset: 'No TRUNCATE/rebuild mechanism exists.' } } };
    expect(checkCutoverPrereqsMirror(['some_slug'], [baseItem], descriptorsBySlug)).toHaveLength(0);
  });

  it('RED — applies_when with no descriptor supplied for the slug: conservative default is to STILL block (never silently exempt for lack of wiring)', () => {
    expect(checkCutoverPrereqsMirror(['some_slug'], [baseItem], {})).toHaveLength(1);
  });

  it('RED — an item with NO applies_when at all still blocks unconditionally, regardless of descriptor content', () => {
    const itemNoAppliesWhen: ProgrammeItem = { ...baseItem, gate: { kind: 'cutover_prereq', blocks: ['some_slug'] } };
    const descriptorsBySlug = { some_slug: { recovery: { reset: 'anything at all' } } };
    expect(checkCutoverPrereqsMirror(['some_slug'], [itemNoAppliesWhen], descriptorsBySlug)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 8. STA-1 (WF1 "state tables reset", 2026-09-03) — reclassified batching_prereq
//    -> cutover_prereq with applies_when: {descriptor_path: "outputs.publish",
//    equals: "pointer"} and blocks: [] (a FORWARD-DECLARED prerequisite — real,
//    but armed against zero current victims because no descriptor declares
//    outputs.publish:"pointer" today; schema RS-D-STA follow-on permits
//    cutover_prereq blocks:[] exactly when applies_when is present).
//
//    checkCutoverPrereqsMirror only checks a slug present in gate.blocks[], so
//    the REAL STA-1 item (blocks: []) cannot be exercised end-to-end against a
//    real converted slug — this proves the applies_when CONDITION ITSELF
//    correctly discriminates "outputs.publish" using a fixture item shaped
//    identically to STA-1 but with blocks naming a slug, the same technique
//    section 7 above uses for STA-2/STA-3's "recovery.reset" condition.
// ---------------------------------------------------------------------------

describe('STA-1 — outputs.publish:"pointer" applies_when condition (RS-D-STA follow-on)', () => {
  const sta1Shaped: ProgrammeItem = {
    id: 'FIXTURE-STA-1',
    spec: '120 §6',
    title: 'fixture mirror of STA-1\'s own gate shape',
    promised: 'p',
    status: 'NOT_STARTED',
    evidence: 'e',
    owner: { kind: 'wf', ref: 'r' },
    gate: { kind: 'cutover_prereq', blocks: ['fixture_pointer_publisher'], applies_when: { descriptor_path: 'outputs.publish', equals: 'pointer' } },
    last_reviewed: '2026-09-03',
  };

  it('RED — a fixture descriptor with outputs.publish:"pointer" trips the gate', () => {
    const descriptorsBySlug = { fixture_pointer_publisher: { outputs: { publish: 'pointer' } } };
    expect(checkCutoverPrereqsMirror(['fixture_pointer_publisher'], [sta1Shaped], descriptorsBySlug)).toHaveLength(1);
  });

  it('GREEN — the same gate does NOT trip for a "direct" publisher', () => {
    const descriptorsBySlug = { fixture_pointer_publisher: { outputs: { publish: 'direct' } } };
    expect(checkCutoverPrereqsMirror(['fixture_pointer_publisher'], [sta1Shaped], descriptorsBySlug)).toHaveLength(0);
  });

  it('GREEN — not for the 8 real converted descriptors: none declares outputs.publish:"pointer" (assert_schema has no outputs at all, ASSERT profile)', () => {
    for (const relFile of CONVERTED) {
      const descriptor = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relFile.replace(/\.js$/, '.descriptor.json')), 'utf8')) as { outputs: 'none' | { publish: string } };
      const publish = descriptor.outputs === 'none' ? undefined : descriptor.outputs.publish;
      expect(publish, `${relFile}: expected outputs.publish to be undefined ("none" archetype) or "direct", never "pointer"`).not.toBe('pointer');
    }
    // Re-run the SAME mirror against the real corpus, so the assertion above and the
    // mechanism this suite locks agree with each other, not just with a hand-read grep.
    const descriptorsBySlug: Record<string, unknown> = {};
    const item: ProgrammeItem = { ...sta1Shaped, gate: { ...sta1Shaped.gate, blocks: CONVERTED.map((f) => f) } };
    CONVERTED.forEach((relFile) => {
      descriptorsBySlug[relFile] = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relFile.replace(/\.js$/, '.descriptor.json')), 'utf8'));
    });
    expect(checkCutoverPrereqsMirror(CONVERTED, [item], descriptorsBySlug)).toEqual([]);
  });

  it('the REAL STA-1 entry in programme-items.json carries exactly this reclassified shape', () => {
    const sta1 = ITEMS.find((i) => i.id === 'STA-1');
    expect(sta1, 'STA-1 must still exist in programme-items.json').toBeDefined();
    expect(sta1!.gate.kind).toBe('cutover_prereq');
    expect(sta1!.gate.blocks).toEqual([]);
    expect(sta1!.gate.applies_when).toEqual({ descriptor_path: 'outputs.publish', equals: 'pointer' });
  });
});
