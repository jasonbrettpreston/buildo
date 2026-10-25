// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DK (amends R-CS)
//
// R-DK (McDonald's Airtight V3, operator y 2026-10-17): a NET-NEW step (census `legacy: "none"`)
// has no PRE capture. #22 and G8's PRE half print `net-new (R-DK)` for it ONLY when the closed
// evidence set holds (no legacy git history, a nonzero recipe, red-first evidence, rerun-zero on
// every POST). Both directions: a step that is not net-new still FAILs without a PRE; a net-new
// row without the evidence, or with a PRE file (a copied POST), is RED by name.
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');

type NetNewVerdict = { netNew: boolean; ok: boolean; why: string };
type NetNewModule = {
  NET_NEW_TAG: string;
  netNewDecision: (e: Record<string, unknown>) => NetNewVerdict;
  loadNetNew: (repoRoot: string) => Map<string, NetNewVerdict>;
  isShallowRepo: (repoRoot: string) => boolean;
};
type PreFile = { file: string; exists: boolean; tracked: boolean; worktreeClean: boolean };
type StepValidateModule = {
  checkPreCapturesRecoverable: (
    preStates: Array<{ slug: string; files: PreFile[] }>,
    netNew?: Map<string, NetNewVerdict>,
  ) => { pass: boolean; blockedSlugs: string[]; detail: string };
  computePreInvocationsMissing: (
    slug: string,
    invocations: Array<{ chain: string; args: string[] }>,
    preDocs: unknown[],
    postDocs: unknown[],
    descriptor: unknown,
    netNew?: Map<string, NetNewVerdict>,
  ) => string[];
};

const GOOD = {
  slug: 'fx',
  legacy: 'none',
  hasLegacyCitation: false,
  shallowRepo: false,
  scriptFirstCommitTs: 100,
  descriptorFirstCommitTs: 100,
  nonzeroRecipes: 1,
  redEvidenceFiles: 1,
  postCaptures: 2,
  postsWithRerunPass: 2,
};
const tracked = (file: string): PreFile => ({ file, exists: true, tracked: true, worktreeClean: true });

describe('Spec 124 R-DK — a net-new step has no PRE; its reference is its own committed POST', () => {
  let nn: NetNewModule;
  let sv: StepValidateModule;
  beforeAll(async () => {
    nn = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/gates/net-new.mjs')).href)) as unknown as NetNewModule;
    sv = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as StepValidateModule;
  }, 120000);

  it('netNewDecision accepts only the full evidence set and refuses each gap by name', () => {
    expect(nn.netNewDecision(GOOD).ok).toBe(true);
    const gaps: Array<[string, Record<string, unknown>]> = [
      ['legacy history', { scriptFirstCommitTs: 50 }],
      ['legacy_citation', { hasLegacyCitation: true }],
      // Spec 08 output panel round 1, 2026-10-18: a shallow clone (or an unknown answer) cannot prove no legacy history.
      ['shallow repository', { shallowRepo: true }],
      ['shallow answer unknown', { shallowRepo: undefined }],
      ['no recipe', { nonzeroRecipes: 0 }],
      ['no red evidence', { redEvidenceFiles: 0 }],
      ['rerun-zero missing', { postsWithRerunPass: 1 }],
    ];
    for (const [label, patch] of gaps) {
      const v = nn.netNewDecision({ ...GOOD, ...patch });
      expect(v.ok, label).toBe(false);
      expect(v.why, label).toMatch(/^legacy:"none" refused/);
    }
    expect(nn.netNewDecision({ ...GOOD, legacy: undefined }).netNew).toBe(false);
  });

  it('isShallowRepo fails closed: a directory git cannot answer for reads as shallow', () => {
    // A missing cwd makes the git spawn itself fail (a hook's exported GIT_DIR cannot answer for it).
    expect(nn.isShallowRepo(path.join(os.tmpdir(), `r-dk-no-such-dir-${process.pid}-${Date.now()}`))).toBe(true);
  });

  it('#22: an accepted net-new step with no pre/ passes and is named; any other slug with no PRE still FAILs', () => {
    const accepted = new Map([['fx', nn.netNewDecision(GOOD)]]);
    const ok = sv.checkPreCapturesRecoverable([{ slug: 'fx', files: [] }], accepted);
    expect(ok.pass).toBe(true);
    expect(ok.detail).toContain(nn.NET_NEW_TAG);
    const other = sv.checkPreCapturesRecoverable([{ slug: 'legacy_step', files: [] }], accepted);
    expect(other.pass).toBe(false);
    expect(other.blockedSlugs).toEqual(['legacy_step']);
  });

  it('#22: a net-new row WITHOUT the evidence, or WITH a PRE file (a copied POST), is RED by name', () => {
    const refused = new Map([['fx', nn.netNewDecision({ ...GOOD, redEvidenceFiles: 0 })]]);
    const r1 = sv.checkPreCapturesRecoverable([{ slug: 'fx', files: [] }], refused);
    expect(r1.pass).toBe(false);
    expect(r1.detail).toContain('refused');
    const accepted = new Map([['fx', nn.netNewDecision(GOOD)]]);
    const r2 = sv.checkPreCapturesRecoverable([{ slug: 'fx', files: [tracked('docs/reports/golden/fx/pre/sources.json')] }], accepted);
    expect(r2.pass).toBe(false);
    expect(r2.detail).toContain('R-CS forbids');
  });

  it('G8 PRE half: no missing PRE invocations for an accepted net-new step; a non-net-new step still lists them', () => {
    const inv = [{ chain: 'sources', args: [] }];
    const accepted = new Map([['fx', nn.netNewDecision(GOOD)]]);
    expect(sv.computePreInvocationsMissing('fx', inv, [], [], null, accepted)).toEqual([]);
    expect(sv.computePreInvocationsMissing('legacy_step', inv, [], [], null, accepted).length).toBe(1);
  });

  it('live census: exactly the four net-new pending steps declare legacy:"none", and each is accepted', () => {
    const live = nn.loadNetNew(REPO_ROOT);
    expect([...live.keys()].sort()).toEqual(['link_parcel_abutments', 'load_bylaw_map_areas', 'load_coa_notices', 'resolve_bylaws']);
    for (const [slug, v] of live) expect(v.ok, `${slug}: ${v.why}`).toBe(true);
  });
});
