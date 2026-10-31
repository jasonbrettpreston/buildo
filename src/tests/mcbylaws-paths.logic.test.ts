// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md R-KP (protected paths), R-LD (layer 2/3 scope);
//            plan section 3 (MB-67): mcbylaws/protected-paths.json shape, glob semantics, dead-glob lint (H7, L10, G67-10c/E9)
//
// scripts/analysis/mcbylaws/paths.mjs validates the policy file, compiles its globs to anchored RegExps, classifies a
// path, and names dead globs (matching no tracked file and not listed in pending_globs). Pure module: no git, no fs.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { POLICY_PATH, validatePolicy, globToRegExp, matchesAny, classify, deadGlobs }
  from '../../scripts/analysis/mcbylaws/paths.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../');
const realPolicy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, POLICY_PATH), 'utf8'));

function policy(over: Record<string, unknown> = {}) {
  return {
    pending_globs: [], layer23: ['scripts/analysis/bylaw/**'], protected: ['mcbylaws/APPROVED'],
    literal_scope: ['scripts/analysis/bylaw/evaluate.mjs'], literal_exempt: [], held_dirs: ['~/x/held'], held_limit: 12, worktrees: ['~/w*'],
    boot1: { tasks: [], exempt_ids: [] }, external_arms: [{ id: 'loop', required: false }], ...over,
  };
}

describe('POLICY_PATH', () => {
  it('names the policy file', () => expect(POLICY_PATH).toBe('mcbylaws/protected-paths.json'));
});

describe('validatePolicy', () => {
  it('accepts the minimal valid object and returns it as policy', () => {
    const p = policy({ $comment: 'extra keys allowed' });
    const v = validatePolicy(p);
    expect(v.ok).toBe(true);
    expect((v as { policy: unknown }).policy).toBe(p);
  });

  const rows: Array<[string, unknown]> = [
    ['a non-object', undefined],
    ['missing layer23', policy(Object.assign(policy(), { layer23: undefined }))],
    ['a non-array layer23', policy({ layer23: 'scripts/analysis/bylaw/**' })],
    ['held_limit 0', policy({ held_limit: 0 })],
    ['a non-integer held_limit', policy({ held_limit: 1.5 })],
    ['an empty glob', policy({ layer23: [''] })],
    ['a trailing-slash glob', policy({ protected: ['docs/reports/**/'] })],
    ['a backslash glob', policy({ literal_scope: ['src\\tests\\bylaw.ts'] })],
    ['a non-string glob', policy({ pending_globs: [3] })],
    ['boot1 missing tasks', policy({ boot1: { exempt_ids: [] } })],
    ['a non-object boot1', policy({ boot1: [] })],
    ['external_arms with a non-boolean required', policy({ external_arms: [{ id: 'loop', required: 'no' }] })],
    ['external_arms with an empty id', policy({ external_arms: [{ id: '', required: false }] })],
  ];
  rows.forEach(([name, v]) => {
    it(`rejects ${name}`, () => {
      const r = validatePolicy(v) as { ok: boolean; error: string };
      expect(r.ok).toBe(false);
      expect(typeof r.error).toBe('string');
      expect(r.error.length).toBeGreaterThan(0);
    });
  });

  it('names the failing key in error', () => {
    const r = validatePolicy(policy({ held_limit: 0 })) as { error: string };
    expect(r.error).toContain('held_limit');
  });
});

describe('globToRegExp / matchesAny', () => {
  const ok: Array<[string, string]> = [
    ['src/tests/**/bylaw*', 'src/tests/bylaw-x.test.ts'],
    ['src/tests/**/bylaw*', 'src/tests/a/b/bylaw.x.ts'],
    ['.husky/*', '.husky/pre-commit'],
    ['**/pending/**', 'src/tests/pending/x.ts'],
    ['scripts/lib/maxbld-*.js', 'scripts/lib/maxbld-a.js'],
    ['docs/specs/**/133_bylaw_handbook.md', 'docs/specs/01-pipeline/133_bylaw_handbook.md'],
    ['a.b+c', 'a.b+c'],
    ['a/**', 'a/x'],
    ['a/**', 'a/x/y'],
    ['f?.txt', 'fx.txt'],
  ];
  const no: Array<[string, string]> = [
    ['src/tests/**/bylaw*', 'src/tests/other.ts'],
    ['.husky/*', '.husky/a/b'],
    ['scripts/lib/maxbld-*.js', 'scripts/lib/x/maxbld-a.js'],
    ['**/pending/**', 'src/tests/other/x.ts'],
    ['a.b+c', 'axbxc'],
    ['a/**', 'a'],
    ['a/*', 'a/x/y'],
    ['f?.txt', 'f/x.txt'],
    ['a/**', 'b/a/x'],
  ];
  ok.forEach(([g, p]) => it(`${g} matches ${p}`, () => expect(globToRegExp(g).test(p)).toBe(true)));
  no.forEach(([g, p]) => it(`${g} rejects ${p}`, () => expect(globToRegExp(g).test(p)).toBe(false)));
  it('is anchored at both ends', () => {
    expect(globToRegExp('a/**').test('xa/y')).toBe(false);
    expect(globToRegExp('.husky/*').test('.husky/pre-commit/more')).toBe(false);
  });
  it('matchesAny over a list', () => {
    expect(matchesAny(['x', '.husky/*'], '.husky/pre-commit')).toBe(true);
    expect(matchesAny([], '.husky/pre-commit')).toBe(false);
  });
});

describe('classify', () => {
  it('reports each list independently', () => {
    const c = classify(policy(), 'scripts/analysis/bylaw/evaluate.mjs');
    expect(c).toEqual({ layer23: true, protected: false, literalExempt: false, literalScope: true });
    const d = classify(policy(), 'mcbylaws/APPROVED');
    expect(d).toEqual({ layer23: false, protected: true, literalExempt: false, literalScope: false });
  });
});

describe('newlines in paths (O67-05)', () => {
  const nlLayer23True = ['scripts/analysis/bylaw/a\nb.mjs', 'scripts/analysis/bylaw/x\ny/z.mjs'];
  nlLayer23True.forEach((p) => it(`layer23 true for a path with a newline: ${JSON.stringify(p)}`, () => {
    expect(classify(policy({ layer23: ['scripts/analysis/bylaw/**'] }), p).layer23).toBe(true);
  }));
  it('src/*.ts matches src/a\\nb.ts but not src/x/y.ts', () => {
    expect(globToRegExp('src/*.ts').test('src/a\nb.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/x/y.ts')).toBe(false);
  });
});

describe('deadGlobs', () => {
  it('reports a layer23 glob matching no tracked path', () => {
    expect(deadGlobs(policy({ layer23: ['scripts/nope/**'] }), ['a.txt', 'scripts/analysis/bylaw/evaluate.mjs']))
      .toEqual([{ list: 'layer23', glob: 'scripts/nope/**' }]);
  });
  it('is green when the same glob is pending (G67-10c/E9)', () => {
    expect(deadGlobs(policy({ layer23: ['scripts/nope/**'], pending_globs: ['scripts/nope/**'] }), ['a.txt', 'scripts/analysis/bylaw/evaluate.mjs']))
      .toEqual([]);
  });
  it('reports a dead literal_scope glob with its list name', () => {
    expect(deadGlobs(policy({ literal_scope: ['scripts/nope/x.mjs'] }), ['a.txt', 'scripts/analysis/bylaw/evaluate.mjs']))
      .toEqual([{ list: 'literal_scope', glob: 'scripts/nope/x.mjs' }]);
  });
  it('keeps live globs', () => {
    expect(deadGlobs(policy(), ['scripts/analysis/bylaw/evaluate.mjs', 'a.mjs'])).toEqual([]);
  });
});

describe('the real policy file', () => {
  it('validates', () => expect(validatePolicy(realPolicy).ok).toBe(true));

  const layer23True = [
    'scripts/analysis/bylaw/evaluate.mjs',
    'scripts/seeds/bylaw/vocab.json',
    'src/tests/bylaw-twins.logic.test.ts',
  ];
  const layer23False = ['scripts/analysis/mcbylaws/hold.mjs', 'docs/specs/x.md'];
  const protectedTrue = ['.husky/pre-commit', 'mcbylaws/APPROVED', 'scripts/analysis/mcbylaws/hold.mjs'];

  layer23True.forEach((p) => it(`layer23 true for ${p}`, () => expect(classify(realPolicy, p).layer23).toBe(true)));
  layer23False.forEach((p) => it(`layer23 false for ${p}`, () => expect(classify(realPolicy, p).layer23).toBe(false)));
  protectedTrue.forEach((p) => it(`protected true for ${p}`, () => expect(classify(realPolicy, p).protected).toBe(true)));
  it('no pending_globs entry is reported dead (G67-10c/E9)', () => {
    expect(deadGlobs(realPolicy, []).filter((d) => realPolicy.pending_globs.includes(d.glob))).toEqual([]);
  });
});

describe('O67-24: the real literal scope is all Layer 2/3 code and data modules, not two files (R-KR, R-LA)', () => {
  const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, POLICY_PATH), 'utf8'));
  it.each([
    'scripts/analysis/bylaw/agree.mjs',
    'scripts/analysis/bylaw/evaluate.mjs',
    'scripts/analysis/bylaw/_schema/bylaw-rule-map.json',
    'scripts/lib/maxbld-layer2-view.js',
    'scripts/resolve-bylaws.js',
  ])('%s is in literal scope', (p) => expect(classify(real, p).literalScope).toBe(true));
  it('the declared catalogue, settings and switchboard files are exempt', () => {
    expect(classify(real, 'scripts/seeds/bylaw/switchboard.json').literalExempt).toBe(true);
  });
});
