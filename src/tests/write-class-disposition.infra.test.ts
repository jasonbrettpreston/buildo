// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4, §1.10, §8.2
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-X, §7
//
// WD-1 (2026-09-09, WF5 audit + WF2 lock) — `outputs.write_discipline.class` (15
// values, x-frozen) and `sharing.on_contention` (3 values, x-frozen, folded in
// per Ask A3(ii)) are ENUMS: a descriptor may declare any live enum value and
// AJV alone will not stop it, even when the value has zero real executor in
// scripts/lib/step/. `scripts/steps/_schema/write-class-disposition.json` is
// the reviewed-diff disposition registry (implemented / executor_by_runner /
// banned_for_new / retire — the closed 4-value menu, Spec 124 R-X) for every
// one of those 18 values, mirroring grandfathered.json's proven posture
// applied to the enum itself. This suite is the both-directions lock:
//
//   (0) GREEN — every row's `disposition` (write_classes AND on_contention) is
//       one of EXACTLY the 4 closed-menu values — a typo or an invented fifth
//       value is RED, in-memory fixture.
//   (1) GREEN — every live enum value has a registry row; every
//       implemented/executor_by_runner row's executor_fn/runners[] resolve to
//       REAL EXPORTED SYMBOLS in scripts/lib/step/write.js or
//       scripts/lib/step/index.js (grep-verified against the live
//       module.exports block, never trusted from the registry's own prose);
//       and no live descriptor declares a banned_for_new/retire class OR
//       sharing.on_contention value — the on_contention half is checked
//       against its OWN registry rows (checkOnContentionBannedDeclared),
//       never inferred from the class-half's findings.
//   (2) RED — a descriptor declaring a banned/retired write_discipline.class
//       is refused, naming the class, step and path.
//   (2b) RED — a descriptor declaring a banned/retired sharing.on_contention
//       value is refused the same way, in-memory (flip self_skip -> retire on
//       a cloned registry; must red against all 9 converted descriptors that
//       declare self_skip today).
//   (3) RED — a registry missing a live enum row is refused, exercised via
//       BUILDO_WRITE_CLASS_DISPOSITION_PATH (an in-memory-mutated registry
//       written to a temp file, never a committed byte-copy fixture).
//   (4) RED — an orphan registry row (a key not in the live enum) is refused,
//       in-memory.
//   (5) Ask A1's drift guard — every converted descriptor's own
//       sharing.on_contention equals whichever on_contention key THIS
//       registry dispositions "implemented" (derived, never the literal
//       string "self_skip" hardcoded — the guard must track a future ruling
//       that changes which value is implemented).
//
// Per the anti-lesson guard (tasks/lessons.md:145, "a checker backfilled only
// against already-converted steps has never run against the path it gates"):
// the RED fixtures are NOT derived from a converted descriptor's current
// state. banned-class-declared.descriptor.json declares a class NO live step
// declares at all. The registry-mutation RED fixtures ((0), (2b), (3), (4))
// are synthesized in-memory from a clone of the REAL registry, never a
// separately-authored byte-copy — so they can never themselves rot out of
// step with the registry they are testing against.
//
// Per lessons.md:174 (LW-D20, "a fix landed against THE runner when several
// are structurally identical"): assertion (1) enumerates all 8 phase runners
// BY NAME from template-freeze.json's own frozen phase_runners list, never
// spot-checking one.
//
// Fixture injection mirrors the established BUILDO_PROGRAMME_ITEMS_PATH /
// BUILDO_VERDICT_CORPUS_EXTRA idiom (src/tests/step-conformance.infra.test.ts):
// BUILDO_WRITE_CLASS_DISPOSITION_PATH swaps the registry file wholesale
// (exercised by assertion (3), the ONLY place this suite needs an alternate
// registry on disk); BUILDO_WRITE_CLASS_DESCRIPTOR_EXTRA adds ONE extra
// descriptor path onto the live-descriptor scan, additive, never replacing
// the real 9 — assertion (2)'s test explicitly clears any ambient value of
// this env var before running (and restores it after) so a stray value left
// by another test/process can never inflate its strict `findings.length`
// assertion.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const REPO_ROOT = path.resolve(__dirname, '../../');
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/step.schema.json');
const WRITE_JS_PATH = path.join(REPO_ROOT, 'scripts/lib/step/write.js');
const INDEX_JS_PATH = path.join(REPO_ROOT, 'scripts/lib/step/index.js');
const TEMPLATE_FREEZE_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/template-freeze.json');
const DEFAULT_REGISTRY_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/write-class-disposition.json');
const BANNED_CLASS_FIXTURE = path.join(
  REPO_ROOT,
  'scripts/steps/_schema/fixtures/write-class/banned-class-declared.descriptor.json',
);

// The closed 4-value disposition menu (Spec 124 §5 R-X). A row's `disposition`
// must be exactly one of these — never a free string.
const DISPOSITION_MENU = ['implemented', 'executor_by_runner', 'banned_for_new', 'retire'] as const;

function loadJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function registryPath(): string {
  const override = process.env.BUILDO_WRITE_CLASS_DISPOSITION_PATH;
  if (!override) return DEFAULT_REGISTRY_PATH;
  return path.isAbsolute(override) ? override : path.join(REPO_ROOT, override);
}

/** The real live descriptor corpus (never fixtures/), plus one optional
 * additive extra path for RED-fixture injection — the BUILDO_VERDICT_CORPUS_EXTRA
 * idiom, never a replacement of the real corpus. */
function liveDescriptorPaths(): string[] {
  const dirs = [path.join(REPO_ROOT, 'scripts'), path.join(REPO_ROOT, 'scripts/quality')];
  const found: string[] = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.descriptor.json')) found.push(path.join(dir, f));
    }
  }
  const extra = process.env.BUILDO_WRITE_CLASS_DESCRIPTOR_EXTRA;
  if (extra) found.push(path.join(REPO_ROOT, extra));
  return found;
}

/** Extract the flat identifier list of a `module.exports = { a, b, c };` block
 * via brace-counting (never `require()` — these modules pull in pipeline/DB
 * dependencies at require-time that this static-estate lock has no business
 * touching). Grep-verified, not trusted. */
function exportedSymbols(filePath: string): Set<string> {
  const src = fs.readFileSync(filePath, 'utf8');
  const startMarker = 'module.exports = {';
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`[write-class-disposition] no "module.exports = {" found in ${filePath}`);
  let depth = 0;
  let end = -1;
  for (let i = start + startMarker.length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`[write-class-disposition] unterminated module.exports block in ${filePath}`);
  const body = src.slice(start + startMarker.length, end);
  const names = body
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    // drop trailing comments / whitespace-only fragments from a multi-line block
    .map((s) => (s.split(/\s|\/\//)[0] ?? '').trim())
    .filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s));
  return new Set(names);
}

function liveClassEnum(): string[] {
  const schema = loadJson(SCHEMA_PATH);
  return schema.definitions.writeDiscipline.properties.class.enum as string[];
}

function liveOnContentionEnum(): string[] {
  const schema = loadJson(SCHEMA_PATH);
  return schema.properties.sharing.properties.on_contention.enum as string[];
}

type DispositionRow = { disposition: string; executor?: { executor_fn?: string[] | null; runners?: string[] } | null };
type Registry = {
  write_classes: Record<string, DispositionRow>;
  on_contention: Record<string, DispositionRow>;
};

function writeTempRegistry(registry: Registry): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd1-registry-'));
  const file = path.join(dir, 'mutated-registry.json');
  fs.writeFileSync(file, JSON.stringify(registry));
  return { dir, file };
}

/** Assertion (0): every row's `disposition` (both halves) is in the closed
 * 4-value menu — never a free string. */
function checkDispositionMenu(registry: Registry): string[] {
  const findings: string[] = [];
  for (const [cls, row] of Object.entries(registry.write_classes)) {
    if (!(DISPOSITION_MENU as readonly string[]).includes(row.disposition)) {
      findings.push(`write_classes["${cls}"].disposition = "${row.disposition}" is not one of the closed menu: ${DISPOSITION_MENU.join(', ')}`);
    }
  }
  for (const [val, row] of Object.entries(registry.on_contention)) {
    if (!(DISPOSITION_MENU as readonly string[]).includes(row.disposition)) {
      findings.push(`on_contention["${val}"].disposition = "${row.disposition}" is not one of the closed menu: ${DISPOSITION_MENU.join(', ')}`);
    }
  }
  return findings;
}

/** Assertion (2) shape: any live descriptor declaring a write_discipline.class
 * dispositioned banned_for_new/retire in the given registry is a finding. */
function checkNoBannedClassDeclared(registry: Registry, descriptorPaths: string[]): string[] {
  const findings: string[] = [];
  for (const dPath of descriptorPaths) {
    const d = loadJson(dPath);
    const outputs = d.outputs;
    const isNone = outputs === 'none' || (outputs && outputs.const === 'none');
    const writes = isNone ? [] : (outputs && outputs.writes) || [];
    for (const w of writes) {
      const cls = w.write_discipline && w.write_discipline.class;
      if (!cls) continue;
      const row = registry.write_classes[cls];
      if (row && (row.disposition === 'banned_for_new' || row.disposition === 'retire')) {
        findings.push(
          `${d.identity.name} (${path.relative(REPO_ROOT, dPath)}) declares write_discipline.class="${cls}" ` +
            `on target "${w.table}", dispositioned "${row.disposition}" in write-class-disposition.json`,
        );
      }
    }
  }
  return findings;
}

/** Assertion (2b) shape: any live descriptor declaring a sharing.on_contention
 * value dispositioned banned_for_new/retire in the given registry is a
 * finding — checked against on_contention's OWN registry rows, never
 * inferred from the write_classes half. */
function checkOnContentionBannedDeclared(registry: Registry, descriptorPaths: string[]): string[] {
  const findings: string[] = [];
  for (const dPath of descriptorPaths) {
    const d = loadJson(dPath);
    const value = d.sharing && d.sharing.on_contention;
    if (!value) continue;
    const row = registry.on_contention[value];
    if (row && (row.disposition === 'banned_for_new' || row.disposition === 'retire')) {
      findings.push(
        `${d.identity.name} (${path.relative(REPO_ROOT, dPath)}) declares sharing.on_contention="${value}", ` +
          `dispositioned "${row.disposition}" in write-class-disposition.json`,
      );
    }
  }
  return findings;
}

/** Assertion (3): a live enum value with no registry row. */
function checkNoMissingRows(liveEnum: string[], registryKeys: string[], label: string): string[] {
  return liveEnum
    .filter((v) => !registryKeys.includes(v))
    .map((v) => `${label} enum value "${v}" has no disposition row in the registry`);
}

/** Assertion (4): a registry row whose key is not a live enum value. */
function checkNoOrphanRows(liveEnum: string[], registryKeys: string[], label: string): string[] {
  return registryKeys
    .filter((k) => !liveEnum.includes(k))
    .map((k) => `registry key "${k}" is not a live ${label} enum value (orphan row)`);
}

/** Assertion (1)'s executor-resolution half: every implemented/executor_by_runner
 * write_classes row's executor_fn (if declared, an array) must resolve to a
 * real write.js export, and its runners[] must resolve to real index.js
 * exports. (on_contention rows are deliberately NOT put through this check —
 * their "implemented" disposition, e.g. self_skip's, is proven true by
 * construction rather than by a scripts/lib/step/ symbol; that distinction
 * lives in the optional `basis` field, never in a fifth disposition value.) */
function checkExecutorsResolve(registry: Registry, writeJsExports: Set<string>, indexJsExports: Set<string>): string[] {
  const findings: string[] = [];
  for (const [cls, row] of Object.entries(registry.write_classes)) {
    if (row.disposition !== 'implemented' && row.disposition !== 'executor_by_runner') continue;
    const executor = row.executor;
    if (!executor) {
      findings.push(`class "${cls}" is dispositioned "${row.disposition}" but declares no executor block`);
      continue;
    }
    if (executor.executor_fn) {
      for (const fn of executor.executor_fn) {
        if (!writeJsExports.has(fn)) {
          findings.push(`class "${cls}" cites executor_fn "${fn}" which is not an exported symbol of scripts/lib/step/write.js`);
        }
      }
    }
    if (!executor.runners || executor.runners.length === 0) {
      findings.push(`class "${cls}" (${row.disposition}) declares no runners[] — every implemented/executor_by_runner row must cite at least one real dispatching runner`);
      continue;
    }
    for (const runner of executor.runners) {
      if (!indexJsExports.has(runner)) {
        findings.push(`class "${cls}" cites runner "${runner}" which is not an exported symbol of scripts/lib/step/index.js`);
      }
    }
  }
  return findings;
}

/** Ask A1's drift guard target: the on_contention key THIS registry
 * dispositions "implemented" — derived, never a hardcoded literal, so the
 * guard tracks a future ruling that changes which value is implemented. */
function expectedOnContentionValue(registry: Registry): string {
  const implementedKeys = Object.entries(registry.on_contention)
    .filter(([, row]) => row.disposition === 'implemented')
    .map(([k]) => k);
  if (implementedKeys.length !== 1) {
    throw new Error(
      `[write-class-disposition] expected exactly one on_contention value dispositioned "implemented", found ${implementedKeys.length}: ${implementedKeys.join(', ') || '(none)'}`,
    );
  }
  return implementedKeys[0] as string;
}

describe('write-class-disposition — WD-1 both-directions lock (Spec 122 §1.4/§1.10/§8.2, Spec 124 §5 R-X)', () => {
  it('assertion (1): every live class + on_contention enum value has a registry row, every implemented/executor_by_runner row resolves to real exported symbols, and no live descriptor declares a banned/retired class or on_contention value', () => {
    const registry: Registry = loadJson(registryPath());
    const writeJsExports = exportedSymbols(WRITE_JS_PATH);
    const indexJsExports = exportedSymbols(INDEX_JS_PATH);
    const classEnum = liveClassEnum();
    const contentionEnum = liveOnContentionEnum();

    expect(classEnum.length).toBe(15);
    expect(contentionEnum.length).toBe(3);

    const missing = [
      ...checkNoMissingRows(classEnum, Object.keys(registry.write_classes), 'write_discipline.class'),
      ...checkNoMissingRows(contentionEnum, Object.keys(registry.on_contention), 'sharing.on_contention'),
    ];
    expect(missing, missing.join('\n')).toEqual([]);

    const orphans = [
      ...checkNoOrphanRows(classEnum, Object.keys(registry.write_classes), 'write_discipline.class'),
      ...checkNoOrphanRows(contentionEnum, Object.keys(registry.on_contention), 'sharing.on_contention'),
    ];
    expect(orphans, orphans.join('\n')).toEqual([]);

    const menuFindings = checkDispositionMenu(registry);
    expect(menuFindings, menuFindings.join('\n')).toEqual([]);

    const executorFindings = checkExecutorsResolve(registry, writeJsExports, indexJsExports);
    expect(executorFindings, executorFindings.join('\n')).toEqual([]);

    // LW-D20 — enumerate every phase runner BY NAME from the frozen artifact,
    // never spot-check one: every runner any registry row cites must be a
    // member of template-freeze.json's own frozen phase_runners list (the
    // canonical 8-runner dispatch surface), not merely "some index.js export".
    const freeze = loadJson(TEMPLATE_FREEZE_PATH);
    const frozenRunnerNames: string[] = (freeze.phase_runners || []).map((r: any) => r.runner);
    const citedRunners = new Set<string>();
    for (const row of Object.values(registry.write_classes)) {
      for (const r of (row.executor && row.executor.runners) || []) citedRunners.add(r);
    }
    const unknownRunners = [...citedRunners].filter((r) => r !== 'executeOrderedWrites' && !frozenRunnerNames.includes(r));
    expect(unknownRunners, `runners cited but absent from template-freeze.json's frozen phase_runners: ${unknownRunners.join(', ')}`).toEqual([]);

    const bannedClassFindings = checkNoBannedClassDeclared(registry, liveDescriptorPaths());
    expect(bannedClassFindings, bannedClassFindings.join('\n')).toEqual([]);

    const bannedContentionFindings = checkOnContentionBannedDeclared(registry, liveDescriptorPaths());
    expect(bannedContentionFindings, bannedContentionFindings.join('\n')).toEqual([]);
  });

  it('assertion (0) RED: a disposition outside the closed 4-value menu is refused, in-memory (a typo + a bogus executor_fn stays invisible to every other check)', () => {
    const registry: Registry = loadJson(DEFAULT_REGISTRY_PATH);
    const mutated: Registry = {
      ...registry,
      write_classes: {
        ...registry.write_classes,
        guarded_upsert: { ...registry.write_classes.guarded_upsert, disposition: 'implementedd', executor: { executor_fn: ['totallyNotARealFunction'], runners: ['totallyNotARealRunner'] } },
      },
    };
    const findings = checkDispositionMenu(mutated);
    expect(findings.length).toBe(1);
    expect(findings[0]).toContain('guarded_upsert');
    expect(findings[0]).toContain('implementedd');
    // and prove the OTHER checks really do stay blind to it (this is what made
    // the gap invisible before checkDispositionMenu existed):
    const writeJsExports = exportedSymbols(WRITE_JS_PATH);
    const indexJsExports = exportedSymbols(INDEX_JS_PATH);
    const executorFindings = checkExecutorsResolve(mutated, writeJsExports, indexJsExports);
    expect(executorFindings).toEqual([]);
  });

  it('assertion (2) RED: a live descriptor declaring a banned/retired write_discipline.class is refused, naming the class, step and path', () => {
    const registry: Registry = loadJson(DEFAULT_REGISTRY_PATH);
    const savedExtra = process.env.BUILDO_WRITE_CLASS_DESCRIPTOR_EXTRA;
    delete process.env.BUILDO_WRITE_CLASS_DESCRIPTOR_EXTRA; // a stray ambient value must not inflate this strict count
    try {
      const findings = checkNoBannedClassDeclared(registry, [...liveDescriptorPaths(), BANNED_CLASS_FIXTURE]);
      expect(findings.length).toBeGreaterThan(0);
      const hit = findings.find((f) => f.includes('staging_full_replace'));
      expect(hit).toBeTruthy();
      expect(hit).toContain('fixture_banned_class_declared');
      expect(hit).toContain('banned-class-declared.descriptor.json');
      // and the real 9 descriptors must NOT be implicated — this fixture is
      // additive, never a replacement corpus (BUILDO_VERDICT_CORPUS_EXTRA idiom).
      expect(findings.length).toBe(1);
    } finally {
      if (savedExtra === undefined) delete process.env.BUILDO_WRITE_CLASS_DESCRIPTOR_EXTRA;
      else process.env.BUILDO_WRITE_CLASS_DESCRIPTOR_EXTRA = savedExtra;
    }
  });

  it('assertion (2b) RED: flipping on_contention.self_skip to retire is caught even though checkNoBannedClassDeclared (the class-only check) would stay GREEN — proves the on_contention half is not decorative', () => {
    const registry: Registry = loadJson(DEFAULT_REGISTRY_PATH);
    const mutated: Registry = {
      ...registry,
      on_contention: { ...registry.on_contention, self_skip: { ...registry.on_contention.self_skip, disposition: 'retire' } },
    };
    const descriptorPaths = liveDescriptorPaths();

    // the class-only checker never even looks at sharing.on_contention:
    const classOnlyFindings = checkNoBannedClassDeclared(mutated, descriptorPaths);
    expect(classOnlyFindings).toEqual([]);

    // the on_contention-aware checker catches every one of the 14 live descriptors
    // that currently declare self_skip (9 converted + assert_global_coverage,
    // C4 batch 1 I1 commit 7, + assert_data_bounds, C4 batch 1 I2 commit 7, +
    // assert_engine_health, C4 batch 1 I3 commit 7, + link_neighbourhoods, batch-2
    // I4 commit 1, 2026-09-16, + geocode_permits, batch-2 I5 folded commit 5,
    // 2026-09-16 — every one of those still pending at the moment it was counted but
    // its descriptor already on disk, which is exactly why this count is
    // DESCRIPTOR-scoped and not converted-scoped: the pin moves the instant a
    // descriptor file lands, not at cutover):
    const contentionFindings = checkOnContentionBannedDeclared(mutated, descriptorPaths);
    expect(contentionFindings.length).toBe(14);
    expect(contentionFindings.every((f) => f.includes('self_skip') && f.includes('"retire"'))).toBe(true);
  });

  it('assertion (3) RED: a registry missing a live enum row is refused, exercised via BUILDO_WRITE_CLASS_DISPOSITION_PATH (in-memory mutation, never a byte-copy fixture)', () => {
    const registry: Registry = loadJson(DEFAULT_REGISTRY_PATH);
    const remainingClasses = { ...registry.write_classes };
    delete remainingClasses.link_full_retraction;
    const mutated: Registry = { ...registry, write_classes: remainingClasses };
    const { dir, file } = writeTempRegistry(mutated);
    const saved = process.env.BUILDO_WRITE_CLASS_DISPOSITION_PATH;
    process.env.BUILDO_WRITE_CLASS_DISPOSITION_PATH = file; // absolute path — registryPath() honours it directly
    try {
      const reread: Registry = loadJson(registryPath());
      const missing = checkNoMissingRows(liveClassEnum(), Object.keys(reread.write_classes), 'write_discipline.class');
      expect(missing.length).toBe(1);
      expect(missing[0]).toContain('link_full_retraction');
    } finally {
      if (saved === undefined) delete process.env.BUILDO_WRITE_CLASS_DISPOSITION_PATH;
      else process.env.BUILDO_WRITE_CLASS_DISPOSITION_PATH = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('assertion (4) RED: an orphan registry row (a key not in the live enum) is refused', () => {
    const registry: Registry = loadJson(DEFAULT_REGISTRY_PATH);
    const withOrphan: Registry = {
      ...registry,
      write_classes: { ...registry.write_classes, bogus_never_real_class: { disposition: 'retire', executor: null } },
    };
    const { dir, file } = writeTempRegistry(withOrphan);
    try {
      const reread: Registry = loadJson(file);
      const orphans = checkNoOrphanRows(liveClassEnum(), Object.keys(reread.write_classes), 'write_discipline.class');
      expect(orphans.length).toBe(1);
      expect(orphans[0]).toContain('bogus_never_real_class');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Ask A1 drift guard: every converted descriptor\'s sharing.on_contention equals the registry\'s own "implemented" on_contention value', () => {
    const registry: Registry = loadJson(DEFAULT_REGISTRY_PATH);
    const expected = expectedOnContentionValue(registry);
    expect(expected).toBe('self_skip'); // today's known-good value — the guard below is what actually tracks drift
    const offenders: string[] = [];
    for (const dPath of liveDescriptorPaths()) {
      const d = loadJson(dPath);
      const value = d.sharing && d.sharing.on_contention;
      if (value !== expected) {
        offenders.push(`${d.identity.name} (${path.relative(REPO_ROOT, dPath)}) declares sharing.on_contention="${value}", expected "${expected}"`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
