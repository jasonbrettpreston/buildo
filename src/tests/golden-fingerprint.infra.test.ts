// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3 (Condition 3 — the golden-master differential)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md ruling R-C (2026-08-28, ADVERSARY DELTA)
//
// "The golden capture is a LOCKFILE." Every docs/reports/golden/<slug>/post/*.json must
// carry a `source_fingerprint` that matches the CURRENT tree — a sha256 over (the step
// file, the descriptor, the notes file, the compute module), sorted path order,
// CRLF→LF normalised. Editing a converted step's compute/descriptor without re-capturing
// must go RED here: a commit-message claim of "differential green" is no longer evidence.
//
// Two things this file proves, both against the REAL committed captures:
//   1. INVOCATION COVERAGE — every declared invocation (each manifest chain containing
//      the step, with that chain's `chain_args` applied) ∪ standalone has at least one
//      capture, matched by the capture's OWN recorded `{chain, args}` fields — NEVER by
//      filename, because a filename is a human label and this suite must not trust one.
//   2. THE FINGERPRINT GATE — every capture's `source_fingerprint` equals the fingerprint
//      computed FRESH, right now, off disk, using the SAME exported helper the capture
//      harness itself uses (`computeSourceFingerprint` from capture-step-golden.js).
//
// `computeSourceFingerprint`'s own pure-function behaviour (sensitivity, the missing-file
// throw, CRLF normalisation) is proven separately below so a failure of the suite above
// points at STALE DATA, not at a broken hasher.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');
const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');
const GOLDEN_ROOT = path.join(REPO_ROOT, 'docs/reports/golden');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS harness
const harness = require(path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js')) as {
  computeSourceFingerprint: (paths: {
    step: string;
    descriptorPath: string;
    notesPath: string | null;
    computePath: string | null;
  }) => { source_fingerprint: string; fingerprint_files: string[] };
  computePathFor: (step: string) => string | null;
  notesPathFor: (descriptor: unknown, descriptorPath: string) => string | null;
  descriptorPathFor: (step: string) => string;
};

interface Manifest {
  scripts: Record<string, { file: string | null; chain_args?: Record<string, string[]> }>;
  chains: Record<string, string[]>;
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;

const convertedRaw = JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8')) as { converted?: unknown };
const CONVERTED: string[] = Array.isArray(convertedRaw.converted)
  ? (convertedRaw.converted as unknown[]).map((f) => String(f).replace(/\\/g, '/'))
  : [];

/** slug for a manifest step file (first slug that points at it) — throws rather than silently skipping. */
function slugFor(relFile: string): string {
  const found = Object.entries(manifest.scripts).find(([, e]) => e.file === relFile)?.[0];
  if (!found) throw new Error(`no manifest.scripts entry points at ${relFile}`);
  return found;
}

interface Invocation {
  chain: string;
  args: string[];
}

/** Every DECLARED invocation for a step: each manifest chain containing it (chain_args applied) ∪ standalone (chain "none"). */
function derivedInvocations(slug: string): Invocation[] {
  const chains = Object.entries(manifest.chains)
    .filter(([, slugs]) => slugs.includes(slug))
    .map(([id]) => id);
  const scriptEntry = manifest.scripts[slug];
  const out: Invocation[] = chains.map((chain) => ({ chain, args: [...(scriptEntry?.chain_args?.[chain] ?? [])] }));
  out.push({ chain: 'none', args: [] }); // standalone — never a manifest chain, always required
  return out;
}

function invocationKey(inv: Invocation): string {
  return `${inv.chain}::${inv.args.join(',')}`;
}

/** Every capture file's recorded {chain, args} — read from the FILE'S OWN content, never inferred from its name. */
function postCaptures(slug: string): Array<{ file: string; chain: string; args: string[] }> {
  const dir = path.join(GOLDEN_ROOT, slug, 'post');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { chain?: string; args?: unknown };
      return { file: f, chain: String(doc.chain), args: Array.isArray(doc.args) ? (doc.args as string[]) : [] };
    });
}

describe('golden-fingerprint — the golden capture is a LOCKFILE (ruling R-C, 2026-08-28)', () => {
  it('converted.json is non-empty (else this whole suite is a vacuous pass)', () => {
    expect(CONVERTED.length, 'converted.json is empty — the fingerprint gate has nothing to arm').toBeGreaterThan(0);
  });

  for (const relFile of CONVERTED) {
    const slug = slugFor(relFile);
    const descriptorPath = harness.descriptorPathFor(relFile);

    describe(`${relFile} (slug "${slug}")`, () => {
      it('has at least one capture under docs/reports/golden/<slug>/post/', () => {
        expect(postCaptures(slug).length, `${slug}/post has no captures`).toBeGreaterThan(0);
      });

      it('every DECLARED invocation (manifest chains containing it, chain_args applied, ∪ standalone) has ≥1 matching capture — matched by {chain, args}, NEVER filename', () => {
        const invocations = derivedInvocations(slug);
        const captures = postCaptures(slug);
        const captureKeys = new Set(captures.map((c) => invocationKey({ chain: c.chain, args: c.args })));
        const missing = invocations.filter((inv) => !captureKeys.has(invocationKey(inv)));
        expect(
          missing,
          `${slug}: declared invocation(s) with no matching capture (matched on the capture's OWN {chain,args}, not its filename) — ` +
            missing.map((m) => JSON.stringify(m)).join(', '),
        ).toEqual([]);
      });

      it('every post/ capture carries source_fingerprint === the CURRENT fingerprint over (step, descriptor, notes, compute)', () => {
        const descriptorAbs = path.join(REPO_ROOT, descriptorPath);
        const descriptor = fs.existsSync(descriptorAbs) ? (JSON.parse(fs.readFileSync(descriptorAbs, 'utf8')) as unknown) : null;
        const expected = harness.computeSourceFingerprint({
          step: relFile,
          descriptorPath,
          notesPath: harness.notesPathFor(descriptor, descriptorPath),
          computePath: harness.computePathFor(relFile),
        });
        const stale = postCaptures(slug).filter((c) => {
          const doc = JSON.parse(fs.readFileSync(path.join(GOLDEN_ROOT, slug, 'post', c.file), 'utf8')) as {
            source_fingerprint?: string;
          };
          return doc.source_fingerprint !== expected.source_fingerprint;
        });
        expect(
          stale.map((s) => s.file),
          `${slug}: capture(s) whose source_fingerprint does not match the current tree (re-capture required, R-C). ` +
            `expected=${expected.source_fingerprint} over [${expected.fingerprint_files.join(', ')}]`,
        ).toEqual([]);
      });
    });
  }
});

describe('computeSourceFingerprint — the pure-function proof (isolates a stale-data finding above from a broken hasher)', () => {
  it('is deterministic and sensitive to every one of its 4 inputs (real files, real content)', () => {
    const a = harness.computeSourceFingerprint({
      step: 'scripts/quality/assert-schema.js',
      descriptorPath: 'scripts/quality/assert-schema.descriptor.json',
      notesPath: 'scripts/quality/assert-schema.notes.json',
      computePath: 'scripts/lib/compute/assert-schema.js',
    });
    expect(a.source_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a.fingerprint_files).toEqual([
      'scripts/lib/compute/assert-schema.js',
      'scripts/quality/assert-schema.descriptor.json',
      'scripts/quality/assert-schema.js',
      'scripts/quality/assert-schema.notes.json',
    ]);
    // A different (but real) step's fingerprint must differ — the function is not a constant.
    const b = harness.computeSourceFingerprint({
      step: 'scripts/load-ravines.js',
      descriptorPath: 'scripts/load-ravines.descriptor.json',
      notesPath: 'scripts/load-ravines.notes.json',
      computePath: 'scripts/lib/compute/load-ravines.js',
    });
    expect(b.source_fingerprint).not.toBe(a.source_fingerprint);
    // Re-running over the identical inputs is byte-identical.
    const a2 = harness.computeSourceFingerprint({
      step: 'scripts/quality/assert-schema.js',
      descriptorPath: 'scripts/quality/assert-schema.descriptor.json',
      notesPath: 'scripts/quality/assert-schema.notes.json',
      computePath: 'scripts/lib/compute/assert-schema.js',
    });
    expect(a2.source_fingerprint).toBe(a.source_fingerprint);
  });

  it('RED — a null notesPath/computePath narrows the file set, and the fingerprint moves', () => {
    const withAll = harness.computeSourceFingerprint({
      step: 'scripts/quality/assert-schema.js',
      descriptorPath: 'scripts/quality/assert-schema.descriptor.json',
      notesPath: 'scripts/quality/assert-schema.notes.json',
      computePath: 'scripts/lib/compute/assert-schema.js',
    });
    const withoutNotes = harness.computeSourceFingerprint({
      step: 'scripts/quality/assert-schema.js',
      descriptorPath: 'scripts/quality/assert-schema.descriptor.json',
      notesPath: null,
      computePath: 'scripts/lib/compute/assert-schema.js',
    });
    expect(withoutNotes.source_fingerprint).not.toBe(withAll.source_fingerprint);
    expect(withoutNotes.fingerprint_files).not.toContain('scripts/quality/assert-schema.notes.json');
  });

  it('THROWS rather than silently omitting a missing fingerprint input', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-fp-missing-'));
    expect(() =>
      harness.computeSourceFingerprint({
        step: 'scripts/quality/assert-schema.js',
        descriptorPath: 'scripts/quality/assert-schema.descriptor.json',
        notesPath: path.join(dir, 'does-not-exist.notes.json'),
        computePath: null,
      }),
    ).toThrow(/does not exist/);
  });

  it('CRLF-normalises — the SAME file re-written with CRLF line endings fingerprints identically', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-fp-crlf-'));
    const file = path.join(dir, 'step.js');
    fs.writeFileSync(file, "'use strict';\nconst x = 1;\nconst y = 2;\n");
    const lf = harness.computeSourceFingerprint({ step: file, descriptorPath: file, notesPath: null, computePath: null });
    fs.writeFileSync(file, "'use strict';\r\nconst x = 1;\r\nconst y = 2;\r\n");
    const crlf = harness.computeSourceFingerprint({ step: file, descriptorPath: file, notesPath: null, computePath: null });
    expect(crlf.source_fingerprint).toBe(lf.source_fingerprint);
    // and a REAL content change (not just line endings) still moves it — CRLF-tolerance
    // is not accidentally masking every difference.
    fs.writeFileSync(file, "'use strict';\r\nconst x = 999;\r\nconst y = 2;\r\n");
    const changed = harness.computeSourceFingerprint({ step: file, descriptorPath: file, notesPath: null, computePath: null });
    expect(changed.source_fingerprint).not.toBe(lf.source_fingerprint);
  });
});
