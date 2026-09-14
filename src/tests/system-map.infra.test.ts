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
