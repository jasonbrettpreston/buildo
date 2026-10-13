// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-BZ C2; R-CN ledger key names the file)
//
// R-CN (2026-10-12): a gate-E ledger row names the file it allows. `step` is a
// basename, so two files sharing a basename in different directories were
// indistinguishable on the old `step\0item` key — one row could allow a site it
// was never written for. The gate-E key is now `step\0file\0item`: the row
// allows exactly the site in the file it names, and a same-named file elsewhere
// is UNALLOWED (a plain "no row", never a collision of a shared key).

import { describe, expect, it } from 'vitest';

const ledger = await import('../../scripts/analysis/gates/ledger.mjs');
const { matchLedger, validateRow, selfTest } = ledger;
const { gateEOrdinal } = await import('../../scripts/analysis/gates/compute-literals.mjs');

// A gate-E row with a well-formed shape; the spec citation is not exercised here
// (these cases run without fs deps), so `deps` supplies the cited file + anchor.
const specFixture = {
  'docs/specs/01-pipeline/999_fixture.md': 'the fixture sentence an anchor cites verbatim',
  'scripts/lib/x.js': '',
  'scripts/lib/compute/x.js': '',
};

const deps = {
  repoRoot: '/nonexistent-repo-root',
  fileExists: (p: string) => Object.prototype.hasOwnProperty.call(specFixture, p),
  readFile: (p: string) => (Object.prototype.hasOwnProperty.call(specFixture, p) ? specFixture[p as keyof typeof specFixture] : null),
};

const gateERow = (over: Record<string, unknown> = {}) => ({
  gate: 'E',
  step: 'x',
  file: 'scripts/lib/x.js',
  item: 'i',
  disposition: 'coordinate_reference',
  why: 'w',
  spec_ref: 'docs/specs/01-pipeline/999_fixture.md',
  anchor: 'the fixture sentence an anchor cites verbatim',
  filed: '2026-09-25',
  adjudicated_by: 'operator',
  ...over,
});

const gateBRow = (over: Record<string, unknown> = {}) => ({
  gate: 'B',
  step: 's',
  item: 'i',
  disposition: 'pending_remediation',
  why: 'w',
  closing_brief: '.cursor/plan.md row 1',
  filed: '2026-09-25',
  adjudicated_by: 'operator',
  ...over,
});

describe('matchLedger — gate-E key names the file (R-CN)', () => {
  // The plan's first test bullet: two violations with the SAME step and item but
  // in two different files, with one row naming only the first file. Under the
  // old `step\0item` key the row would allow one and report the other as a
  // COLLISION of that same key.
  it('allows the named file, UNALLOWS the same-basename file elsewhere, no orphans', () => {
    const violations = [
      { step: 'x', file: 'scripts/lib/x.js', item: 'i' },
      { step: 'x', file: 'scripts/lib/compute/x.js', item: 'i' },
    ];
    const rows = [gateERow({ file: 'scripts/lib/x.js' })];

    const result = matchLedger('E', violations, rows);

    // the first is allowed;
    expect(result.allowed).toHaveLength(1);
    const a0 = result.allowed[0];
    expect(a0).toBeDefined();
    expect(a0!.violation).toEqual({ step: 'x', item: 'i', file: 'scripts/lib/x.js' });

    // the second is UNALLOWED — not a collision, not allowed;
    expect(result.unallowed).toHaveLength(1);
    const u0 = result.unallowed[0];
    expect(u0).toBeDefined();
    expect(u0!.step).toBe('x');
    expect(u0!.item).toBe('i');
    expect(u0!.file).toBe('scripts/lib/compute/x.js');
    expect(u0!.collision).toBeUndefined();

    // no orphans.
    expect(result.orphans).toHaveLength(0);
  });

  // (a) A gate-E violation with no file cannot be keyed, so it fails LOUD: an
  // empty-file key would silently mis-match some other site.
  it('throws when a gate-E violation has no file', () => {
    expect(() => matchLedger('E', [{ step: 'x', item: 'i' }], [])).toThrow(/has no file/);
  });

  // (b) The no-file throw is gate E ONLY: a non-E violation without a file is
  // keyed as before and simply has no row → plain `unallowed`, exact shape.
  it('does NOT throw for a non-E violation without a file; returns it as plain unallowed', () => {
    const result = matchLedger('B', [{ step: 'x', item: 'i' }], []);
    expect(result.unallowed).toEqual([{ step: 'x', item: 'i' }]);
  });

  // (c) Gate-E unallowed and collision entries carry `file` (check-step-shape
  // looks unallowed entries up by (step, file, item)).
  it('carries `file` on gate-E collision and plain unallowed entries', () => {
    // collision: one row, two same-key violations.
    const collision = matchLedger('E', [
      { step: 'x', file: 'scripts/lib/x.js', item: 'i' },
      { step: 'x', file: 'scripts/lib/x.js', item: 'i' },
    ], [gateERow({ file: 'scripts/lib/x.js' })]);
    expect(collision.allowed).toHaveLength(1);
    const c0 = collision.allowed[0];
    expect(c0).toBeDefined();
    expect(c0!.violation).toEqual({ step: 'x', file: 'scripts/lib/x.js', item: 'i' });
    expect(collision.unallowed).toEqual([
      { step: 'x', file: 'scripts/lib/x.js', item: 'i', collision: true },
    ]);

    // plain unallowed: no row at all.
    const plain = matchLedger('E', [{ step: 'x', file: 'scripts/lib/x.js', item: 'i' }], []);
    expect(plain.unallowed).toEqual([{ step: 'x', file: 'scripts/lib/x.js', item: 'i' }]);
  });
});

describe('validateRow — gate-E row must name its file (R-CN)', () => {
  it('reports a gate-E row without `file`', () => {
    const problems = validateRow(gateERow({ file: undefined }), deps);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('file');
  });

  it('reports a gate-E row whose step differs from basename(file)', () => {
    const problems = validateRow(gateERow({ step: 'not-x' }), deps);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('step');
  });

  it('reports a gate-B row that carries `file`', () => {
    const problems = validateRow(gateBRow({ file: 'scripts/lib/x.js' }), deps);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p: string) => p.includes('only gate E rows name a file'))).toBe(true);
  });

  it('accepts a well-formed gate-E row', () => {
    expect(validateRow(gateERow(), deps)).toEqual([]);
  });

  // (d) R-CN: the file must be a normalized posix path ending .js/.cjs. `fileExists`
  // always true so only the path-shape problems can fire.
  it('flags a non-normalized file path and a non-.js/.cjs file', () => {
    const always = { repoRoot: '/nonexistent-repo-root', fileExists: () => true, readFile: () => '' };

    const unnormalized = validateRow(
      gateERow({ file: 'scripts//lib/x.js', step: 'x' }),
      always,
    );
    expect(unnormalized.some((p: string) => p.includes('normalized'))).toBe(true);

    const wrongExt = validateRow(
      gateERow({ file: 'scripts/lib/x.mjs', step: 'x' }),
      always,
    );
    expect(wrongExt.some((p: string) => p.includes('.js/.cjs'))).toBe(true);
  });
});

describe('scanGateE — the `#n` ordinal is per FILE (R-CN)', () => {
  // The bare-first-occurrence invariant (CP-B11 fix 6) is keyed on the FILE now
  // that `step` is a basename: the same base in two files that share a basename
  // must both stay BARE (two ledger rows, no `#2`), while a genuine duplicate
  // twice in ONE file still gets bare then `#2`.
  it('keeps the same base bare in two files; `#2` only for a repeat in one file', () => {
    const ord = gateEOrdinal();

    // Same basename, two directories, same item → both bare.
    expect(ord('scripts/lib/x.js', 'r@line')).toBe('r@line');
    expect(ord('scripts/lib/compute/x.js', 'r@line')).toBe('r@line');

    // A genuine repeat inside one file → bare then `#2`.
    expect(ord('scripts/lib/x.js', 'r@line')).toBe('r@line#2');
    expect(ord('scripts/lib/compute/x.js', 'r@line')).toBe('r@line#2');
  });
});

describe('ledger selfTest (R-CN)', () => {
  it('does not throw', () => {
    expect(() => selfTest()).not.toThrow();
  });
});
