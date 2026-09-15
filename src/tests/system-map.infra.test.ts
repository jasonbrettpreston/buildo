// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (G0 — Target Spec filled from the system map's owner row)
// SPEC LINK: CLAUDE.md Prime Directive #2 (System Map Authority — `docs/specs/00-architecture/00_system_map.md` is the Single Source of Truth)
//
// WF2 2026-09-14 — the system map is DERIVED from the specs and never hand-edited, so the only
// way it stays accurate is a lock that regenerates it in memory on every test run (the existing
// pre-commit hook — no new process) and fails when the committed file has drifted from what the
// specs produce. Also locks the G0 contract this WF2 repaired: every file a spec declares under
// `### Target Files` appears verbatim in that spec's map row (the former 3-file `+N more` cap made
// `grep <step-file> 00_system_map.md` a false negative for every spec with >3 target files —
// measured 2026-09-14: `scripts/quality/assert-data-bounds.js`, declared in Spec 44, had 0 hits).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');
const MAP_PATH = path.join(REPO_ROOT, 'docs/specs/00-architecture/00_system_map.md');
const GENERATOR = path.join(REPO_ROOT, 'scripts/generate-system-map.mjs');

const normalize = (s: string) => s.replace(/\r\n/g, '\n');

async function generated(): Promise<string> {
  const mod = await import(pathToFileURL(GENERATOR).href);
  return normalize(mod.buildSystemMap().md);
}

describe('system map — derived, never hand-edited (drift lock)', () => {
  it('the committed map is byte-identical to what the specs currently generate (run `npm run system-map` to fix)', async () => {
    const committed = normalize(fs.readFileSync(MAP_PATH, 'utf8'));
    expect(committed).toBe(await generated());
  });

  it('no row collapses its files into "+N more" — the map lists every target file (G0 grep is real)', async () => {
    expect(await generated()).not.toMatch(/, \+\d+ more/);
  });
});

describe('system map — G0 owner-row contract (both directions)', () => {
  it('every `scripts/` and `src/` ref under a spec\'s ### Target Files appears verbatim in that spec\'s row', async () => {
    const md = await generated();
    const rows = new Map<string, string>();
    for (const line of md.split('\n')) {
      const m = line.match(/^\| [^|]+ \| `([^`]+)` \|/);
      if (m && m[1]) rows.set(m[1], line);
    }
    const specsDir = path.join(REPO_ROOT, 'docs/specs');
    const missing: string[] = [];
    let checked = 0;
    for (const sub of ['00-architecture', '01-pipeline', '02-web-admin', '03-mobile']) {
      const dir = path.join(specsDir, sub);
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md') && x !== '00_system_map.md' && x !== '_spec_template.md')) {
        const content = normalize(fs.readFileSync(path.join(dir, f), 'utf8'));
        const section = content.match(/### Target Files[\s\S]*?(?=###|## |$)/);
        if (!section) continue;
        const row = rows.get(`${sub}/${f}`);
        for (const [, ref] of section[0].matchAll(/`((?:scripts|src)\/[^`]+)`/g)) {
          checked += 1;
          if (!ref) continue;
          if (!row || !row.includes(`\`${ref}\``)) missing.push(`${sub}/${f} -> ${ref}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(100); // the contract is not vacuous
    expect(missing).toEqual([]);
  });

  it('every chained manifest step has an owner row (WF2 2026-09-14: 26 of 65 chained steps had none — their chain specs said "all N scripts listed above" in prose the generator cannot read)', async () => {
    const md = await generated();
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/manifest.json'), 'utf8')) as {
      scripts: Record<string, { file: string }>;
      chains: Record<string, string[]>;
    };
    const chained = new Set(Object.values(manifest.chains).flat());
    const unowned: string[] = [];
    let checked = 0;
    for (const [slug, entry] of Object.entries(manifest.scripts)) {
      if (!chained.has(slug)) continue;
      checked += 1;
      if (!md.includes(`\`${entry.file}\``)) unowned.push(`${slug} (${entry.file})`);
    }
    expect(checked).toBeGreaterThanOrEqual(65);
    expect(unowned).toEqual([]);
  });

  it('the measured false negative is closed: assert-data-bounds.js (Spec 44 Target Files) greps in row 44', async () => {
    const md = await generated();
    const row44 = md.split('\n').find((l) => l.startsWith('| 44 | `01-pipeline/44_chain_deep_scrapes.md`'));
    expect(row44).toBeDefined();
    expect(row44).toContain('`scripts/quality/assert-data-bounds.js`');
  });

  it('RED direction — collapsing row 44 of the REAL generated map back to "+N more" trips both locks (drift + no-collapse)', async () => {
    const md = await generated();
    const rowStart = '| 44 | `01-pipeline/44_chain_deep_scrapes.md` |';
    const tampered = md
      .split('\n')
      .map((l) => (l.startsWith(rowStart) ? l.replace(/`scripts\/quality\/assert-data-bounds\.js`/, '+11 more') : l))
      .join('\n');
    expect(tampered).not.toBe(md); // the drift lock (test 1's comparison) would go RED on this content
    expect(tampered).toMatch(/, \+\d+ more/); // and so would the no-collapse lock
    const tamperedRow44 = tampered.split('\n').find((l) => l.startsWith(rowStart));
    expect(tamperedRow44).not.toContain('`scripts/quality/assert-data-bounds.js`'); // and the owner-row lock (row-scoped: Specs 42/43 also declare the file)
  });
});

describe('chain-spec Step Breakdown tables — membership + position vs manifest.chains (WF2 SPECTBL-1, 2026-09-15)', () => {
  // A chain spec's `### Step Breakdown` table is the human-readable face of `manifest.chains[X]`.
  // Its `#`, Slug and Script columns are fully DERIVABLE from the manifest, so they are locked here;
  // Purpose and Writes-To stay hand-authored prose and are deliberately NOT locked (a generator
  // would be an R-AA content move — filed as SPECTBL-GEN, built only if prose drift is ever measured).
  // Measured 2026-09-15 before this lock: `sources` (Spec 43) omitted `reconcile` and was uniformly
  // +1 off for all 27 rows; `coa` (Spec 42) omitted 6 live steps, listed 2 retired Phase-G steps and
  // had 7 position mismatches; `permits` (Spec 41) omitted `dispatch_notifications` and was off by one
  // for its last 3 rows. 44/45/46 were already clean — that split is the premise proof.
  const CHAIN_SPEC: Record<string, string> = {
    permits: '41_chain_permits.md',
    coa: '42_chain_coa.md',
    sources: '43_chain_sources.md',
    deep_scrapes: '44_chain_deep_scrapes.md',
    entities: '45_chain_entities.md',
    wsib: '46_wsib_enrichment.md',
  };

  const loadManifest = () =>
    JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/manifest.json'), 'utf8')) as {
      scripts: Record<string, { file: string }>;
      chains: Record<string, string[]>;
    };

  type Row = { n: number; slug: string; script: string };

  /** Parse a chain spec's `### Step Breakdown` table into {n, slug, script}. Header/separator rows skipped. */
  function parseStepBreakdown(specFile: string): Row[] {
    const md = normalize(fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/01-pipeline', specFile), 'utf8'));
    const lines = md.split('\n');
    const start = lines.findIndex((l) => l.trim() === '### Step Breakdown');
    if (start < 0) throw new Error(`${specFile}: no "### Step Breakdown" heading`);
    const rows: Row[] = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const l = lines[i] ?? '';
      if (!l.startsWith('|')) {
        if (rows.length > 0) break; // table ended
        if (l.startsWith('#')) break; // next heading before any row
        continue; // blank line between heading and table
      }
      // Split on cells rather than matching the whole row: the Script cell legitimately carries
      // trailing prose after the path (Spec 41 row 10 — "`enrich-permits.js` (`ENRICH_TARGET=permits`)"),
      // and a whole-row regex silently DROPS such a row, which would make the membership arm
      // report a false "missing live step". Measured 2026-09-15.
      const cells = l.split('|');
      const n = (cells[1] ?? '').trim();
      if (!/^\d+$/.test(n)) continue; // header + separator rows
      const slug = ((cells[2] ?? '').match(/`([^`]+)`/) || [])[1];
      const script = ((cells[3] ?? '').match(/`([^`]+)`/) || [])[1];
      if (!slug || !script) throw new Error(`${specFile}: step row ${n} has no backticked slug/script cell`);
      rows.push({ n: Number(n), slug, script });
    }
    if (rows.length === 0) throw new Error(`${specFile}: Step Breakdown table parsed to 0 rows`);
    return rows;
  }

  /** Manifest script path as the spec writes it — chain specs omit the leading `scripts/`. */
  const specScript = (file: string) => file.replace(/^scripts\//, '');

  /** The two graded arms, as pure functions — so the RED test can grade a tampered table with the SAME code the GREEN tests run. */
  const membershipProblems = (chain: string, specFile: string, live: string[], rows: Row[]): string[] => {
    const problems: string[] = [];
    const specSlugs = rows.map((r) => r.slug);
    for (const slug of live) if (!specSlugs.includes(slug)) problems.push(`${specFile}: missing live step \`${slug}\` (chain position ${live.indexOf(slug) + 1})`);
    for (const slug of specSlugs) if (!live.includes(slug)) problems.push(`${specFile}: lists \`${slug}\` which is not in chains.${chain}`);
    return problems;
  };

  const positionProblems = (
    specFile: string,
    live: string[],
    rows: Row[],
    scripts: Record<string, { file: string }>,
  ): string[] => {
    const problems: string[] = [];
    for (const row of rows) {
      const idx = live.indexOf(row.slug);
      if (idx < 0) continue; // membership arm owns unknown slugs
      if (row.n !== idx + 1) problems.push(`${specFile}: \`${row.slug}\` numbered ${row.n}, live position ${idx + 1}`);
      const want = specScript(scripts[row.slug]!.file);
      if (row.script !== want) problems.push(`${specFile}: \`${row.slug}\` script \`${row.script}\`, manifest says \`${want}\``);
    }
    return problems;
  };

  it('the chain -> spec map covers every manifest chain exactly (a new chain with no spec table reds here, never silently skips)', () => {
    const manifest = loadManifest();
    expect(Object.keys(CHAIN_SPEC).sort()).toEqual(Object.keys(manifest.chains).sort());
  });

  it('MEMBERSHIP — every chain spec table lists exactly the slugs in manifest.chains[chain] (no missing, no extra)', () => {
    const manifest = loadManifest();
    const problems: string[] = [];
    let checked = 0;
    for (const [chain, specFile] of Object.entries(CHAIN_SPEC)) {
      const live = manifest.chains[chain]!;
      checked += live.length;
      problems.push(...membershipProblems(chain, specFile, live, parseStepBreakdown(specFile)));
    }
    expect(checked).toBe(87); // 33+16+28+7+2+1, MEASURED 2026-09-15 — exact, so a chain losing steps cannot quietly shrink the corpus this arm grades
    expect(problems).toEqual([]);
  });

  it('POSITION + SCRIPT — each row\'s `#` equals chains[chain].indexOf(slug)+1 and its script matches manifest.scripts[slug].file', () => {
    const manifest = loadManifest();
    const problems: string[] = [];
    for (const [chain, specFile] of Object.entries(CHAIN_SPEC)) {
      problems.push(...positionProblems(specFile, manifest.chains[chain]!, parseStepBreakdown(specFile), manifest.scripts));
    }
    expect(problems).toEqual([]);
  });

  /** Slugs named on a spec's `**Shared steps (current state):**` bullet — a second, prose-shaped claim about chain membership. */
  const sharedStepsClaims = (specFile: string): { line: number; slugs: string[] }[] => {
    const lines = normalize(fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/01-pipeline', specFile), 'utf8')).split('\n');
    const out: { line: number; slugs: string[] }[] = [];
    for (const [i, l] of lines.entries()) {
      if (!/Shared steps \(current state\)/.test(l)) continue;
      // Only the sentence up to the first period — the trailing prose legitimately discusses
      // retirement history ("`create_pre_permits` is retired in §6 Phase G"), which is not a claim
      // that the step is IN the chain today.
      const claim = l.split('. ')[0] ?? l;
      out.push({ line: i + 1, slugs: [...claim.matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]!) });
    }
    return out;
  };

  it('SHARED-STEPS PROSE — every slug a chain spec names as a "Shared steps (current state)" step is actually in manifest.chains[chain] (Guardian fold, 2026-09-15: Spec 42 named the Phase-G-retired `create_pre_permits` here long after the table stopped listing it)', () => {
    const manifest = loadManifest();
    const problems: string[] = [];
    let slugsChecked = 0;
    for (const [chain, specFile] of Object.entries(CHAIN_SPEC)) {
      for (const { line, slugs } of sharedStepsClaims(specFile)) {
        for (const slug of slugs) {
          slugsChecked += 1;
          if (!manifest.chains[chain]!.includes(slug)) problems.push(`${specFile}:${line} names \`${slug}\` as a current shared step, but it is not in chains.${chain}`);
        }
      }
    }
    expect(slugsChecked).toBeGreaterThan(0); // no chain spec carries the bullet => this arm proved nothing
    expect(problems).toEqual([]);
  });

  it('RED direction — a table that is correct by construction grades clean, and each tamper (drop / insert / shift / swap script) trips the arm that owns it', () => {
    const manifest = loadManifest();
    const live = manifest.chains.sources!;
    // Correct-by-construction baseline, derived from the manifest — independent of what the spec
    // file happens to say today, so this arm proves the grader BOTH directions at any repo state.
    const correct: Row[] = live.map((slug, i) => ({ n: i + 1, slug, script: specScript(manifest.scripts[slug]!.file) }));
    expect(membershipProblems('sources', 'X.md', live, correct)).toEqual([]);
    expect(positionProblems('X.md', live, correct, manifest.scripts)).toEqual([]);

    // (a) drop row 1 -> membership names the missing live step
    expect(membershipProblems('sources', 'X.md', live, correct.slice(1))).toEqual([
      `X.md: missing live step \`${live[0]}\` (chain position 1)`,
    ]);

    // (b) an extra row the chain does not contain -> membership fails the other way
    const extra = [...correct, { n: correct.length + 1, slug: 'create_pre_permits', script: 'create-pre-permits.js' }];
    expect(membershipProblems('sources', 'X.md', live, extra)).toEqual([
      'X.md: lists `create_pre_permits` which is not in chains.sources',
    ]);

    // (c) the measured defect shape — every number off by one -> position fails for EVERY row
    const shifted = correct.map((r) => ({ ...r, n: r.n - 1 })).slice(1);
    expect(positionProblems('X.md', live, shifted, manifest.scripts)).toHaveLength(shifted.length);

    // (d) a wrong script cell -> the script arm fires, on its own
    const swapped = correct.map((r, i) => (i === 0 ? { ...r, script: 'not-a-real-script.js' } : r));
    expect(positionProblems('X.md', live, swapped, manifest.scripts)).toEqual([
      `X.md: \`${live[0]}\` script \`not-a-real-script.js\`, manifest says \`${specScript(manifest.scripts[live[0]!]!.file)}\``,
    ]);
  });
});

describe('spec Operating Boundaries — every step a spec names is classified (Spec 124 R-AF, 2026-09-14)', () => {
  // A spec that names a chained step script anywhere in its body must place it in exactly one of
  // its Operating Boundaries lists: `### Target Files` (the spec defines the step's behaviour,
  // thresholds or written columns) or `### Cross-Spec Dependencies` (it consumes the step's output
  // or references it) or `### Out-of-Scope Files`. Measured 2026-09-14 before the classification:
  // 216 undeclared spec->step pairs across 42 specs — the domain specs (54-62, 65/66, 80-88 …) had
  // never declared the steps they govern, so G0's owner lookup was true only for the chain specs.
  // Cross-cutting architecture specs are exempt readers (they name every script by design).
  const CROSS_CUTTING = new Set(['30', '40', '47', '48', '79', '118', '119', '120', '121', '122', '122a', '123', '124']);
  const section = (c: string, name: string) => (c.match(new RegExp(`### ${name}[\\s\\S]*?(?=###|## |$)`)) || [''])[0];

  it('Operating Boundaries sub-headings are spelled canonically and appear at most once per spec (the generator and this lock read the FIRST exact match only)', () => {
    // Measured 2026-09-14: specs 50-53 wrote "### Out-of-Scope", 59/61/62 "### Cross-spec dependencies",
    // 59 "### Target files (…)", and several carried suffixes ("(Modify / Create)", "(P1)") — the map
    // generator's exact `### Target Files` match never saw those bullets, and a second canonical
    // heading added beside a variant left its bullets invisible too.
    const CANON = ['### Target Files', '### Out-of-Scope Files', '### Cross-Spec Dependencies'];
    const variant = /^###\s*(target files?|out-of-scope(?: files)?|cross-spec dependencies)/i;
    const problems: string[] = [];
    for (const sub of ['01-pipeline', '02-web-admin', '03-mobile']) {
      const dir = path.join(REPO_ROOT, 'docs/specs', sub);
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md') && !x.startsWith('_'))) {
        const lines = normalize(fs.readFileSync(path.join(dir, f), 'utf8')).split('\n');
        const seen = new Map<string, number>();
        for (const [i, l] of lines.entries()) {
          if (!variant.test(l)) continue;
          if (!CANON.includes(l)) problems.push(`${sub}/${f}:${i + 1} non-canonical heading "${l}"`);
          seen.set(l, (seen.get(l) ?? 0) + 1);
        }
        for (const [h, n] of seen) if (n > 1) problems.push(`${sub}/${f} has ${n}x "${h}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('no spec names a chained step script without classifying it in Target Files, Cross-Spec Dependencies or Out-of-Scope Files', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/manifest.json'), 'utf8')) as {
      scripts: Record<string, { file: string }>;
      chains: Record<string, string[]>;
    };
    const chained = new Set(Object.values(manifest.chains).flat());
    const steps = Object.entries(manifest.scripts).filter(([slug, e]) => chained.has(slug) && e.file);
    const violations: string[] = [];
    let specsChecked = 0;
    for (const sub of ['01-pipeline', '02-web-admin', '03-mobile']) {
      const dir = path.join(REPO_ROOT, 'docs/specs', sub);
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md') && !x.startsWith('_'))) {
        const id = (f.match(/^(\d+[a-z]?)_/) || [])[1];
        if (!id || CROSS_CUTTING.has(id)) continue;
        specsChecked += 1;
        const c = normalize(fs.readFileSync(path.join(dir, f), 'utf8'));
        const tf = section(c, 'Target Files');
        const dep = section(c, 'Cross-Spec Dependencies');
        const oos = section(c, 'Out-of-Scope Files');
        for (const [slug, e] of steps) {
          const base = e.file.split('/').pop()!;
          // Script FILENAME only — a backticked slug (`permits`, `parcels`, `massing` …) collides with
          // the table/entity of the same name and produced false positives (group B, 2026-09-14).
          const named = c.includes(base);
          if (!named) continue;
          const classified = tf.includes(`\`${e.file}\``) || dep.includes(base) || oos.includes(base);
          if (!classified) violations.push(`${sub}/${f} names ${e.file} (${slug}) but classifies it nowhere`);
        }
      }
    }
    expect(specsChecked).toBeGreaterThan(40);
    expect(violations).toEqual([]);
  });
});
