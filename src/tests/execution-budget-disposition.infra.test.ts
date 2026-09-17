// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-X
// SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §3 (stop-mechanism hierarchy)
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6 (silent-timeout class)
//
// EP-PHASE-DEADLINE (WF3, .cursor/wf3_enrich_parcels_pass3_backlog_active_task.md C2,
// 2026-09-15) — the R-X lock for the `execution.*` DURATION declarations.
//
// R-X: a frozen declaration with no live executor must carry a DISPOSITION row, never
// silently drift. Its existing registry (`write-class-disposition.json`) covers only
// `outputs.write_discipline.class` and `sharing.on_contention`; R-X's own text records
// extending it to the other `execution.*` postures as "not yet built". This suite builds
// that generalization for the four duration fields, against
// `scripts/steps/_schema/execution-budget-disposition.json`.
//
// The measurement that forced it (cloud run 34971921328, main@824ef357, 2026-09-15):
// `enrich_parcels` declares budget:150m, txn_budget:130m, statement_timeout:75m and
// step_timeout:180m. Three of the four had NO executor at all — `execution.step_timeout`'s
// only reader (`run-chain.js`) reads `scripts/manifest.json`, not the descriptor, and the
// manifest entry had no `step_timeout_minutes` key (so `|| 0` => INERT, per run-chain's own
// docblock). The declarations read as enforcement to every reader and enforced nothing; the
// step ran 300 minutes and was killed by the GitHub Actions wall clock, the only live rung
// of the entire declared ladder.
//
// Assertions, both directions:
//  (0) every row's `disposition` is one of EXACTLY the registry's own closed 2-value menu;
//  (1) every duration key a LIVE descriptor declares has a row, and no row is an orphan;
//  (2) every `executed` row's cited executor anchor is GREPPED out of its cited file,
//      never trusted from the registry's own prose;
//  (3) `step_timeout` drift, both ways — every `wired[]` slug's descriptor duration and
//      `manifest.scripts[slug].step_timeout_minutes` agree in minutes, and every OTHER
//      converted step declaring `step_timeout` appears in `pending[]`;
//  (4) every `descriptive` row is named in Spec 124's own R-X disposition table (a reader
//      of the spec, not just of this file, learns the declaration is inert);
//  (5) the enrich_parcels stop-mechanism LADDER (Spec 118 §3) holds and every rung's
//      value is read from its OWN cited source file, never from the registry's copy.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const REGISTRY_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/execution-budget-disposition.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');
const SPEC124_PATH = path.join(REPO_ROOT, 'docs/specs/01-pipeline/124_step_standard_policy.md');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/chain-sources.yml');
const LOGIC_VARS_PATH = path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json');

/** The four `execution.*` fields whose value is a `duration` in step.schema.json. */
const DURATION_KEYS = ['budget', 'txn_budget', 'statement_timeout', 'step_timeout'] as const;

interface ExecutorRow { file: string; anchor: string; role?: string }
interface DispositionRow {
  disposition: string;
  executor?: ExecutorRow;
  wired?: Record<string, number>;
  pending?: string[];
  why?: string;
}
interface Registry {
  menu: string[];
  declarations: Record<string, DispositionRow>;
  ladder: {
    step: string;
    outer_ci_minutes: { value: number; source: string; key: string };
    step_ceiling_minutes: { value: number; source: string; key: string };
    phase_deadline_minutes: { value: number; source: string; key: string };
  };
}

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as Registry;
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as {
  scripts: Record<string, { step_timeout_minutes?: number }>;
};

/** Every live descriptor, keyed by identity.name (the manifest slug). */
function liveDescriptors(): Array<{ slug: string; file: string; execution: Record<string, unknown> }> {
  const dirs = ['scripts', 'scripts/quality'];
  const out: Array<{ slug: string; file: string; execution: Record<string, unknown> }> = [];
  for (const dir of dirs) {
    const abs = path.join(REPO_ROOT, dir);
    for (const f of fs.readdirSync(abs)) {
      if (!f.endsWith('.descriptor.json')) continue;
      const file = path.join(dir, f);
      const d = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')) as {
        identity: { name: string }; execution?: Record<string, unknown>;
      };
      out.push({ slug: d.identity.name, file, execution: d.execution || {} });
    }
  }
  return out;
}

/** "180m" / "2h" / "90s" -> minutes. Mirrors scripts/lib/step/plausibility.js parseDurationMs. */
function durationToMinutes(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw === 'none') return null;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'ms': return n / 60000;
    case 's': return n / 60;
    case 'm': return n;
    case 'h': return n * 60;
    default: return null;
  }
}

describe('execution-budget-disposition (Spec 124 R-X) — every execution.* duration declaration is executed or dispositioned', () => {
  it('(0) every row declares one of EXACTLY the registry\'s own closed menu values', () => {
    expect(registry.menu.slice().sort()).toEqual(['descriptive', 'executed']);
    for (const [key, row] of Object.entries(registry.declarations)) {
      expect(registry.menu, `${key}: disposition "${row.disposition}" is not on the closed menu`).toContain(row.disposition);
    }
  });

  it('(1) every execution.* duration key any LIVE descriptor declares has a registry row, and no row is an orphan', () => {
    const declared = new Set<string>();
    for (const d of liveDescriptors()) {
      for (const k of DURATION_KEYS) {
        if (d.execution[k] !== undefined) declared.add(k);
      }
    }
    expect(declared.size, 'at least one live descriptor must declare a duration, or this lock is vacuous').toBeGreaterThan(0);
    for (const k of declared) {
      expect(Object.keys(registry.declarations), `execution.${k} is declared live but carries no R-X disposition row`).toContain(k);
    }
    for (const k of Object.keys(registry.declarations)) {
      expect(declared, `orphan registry row: execution.${k} is dispositioned but no live descriptor declares it`).toContain(k);
    }
  });

  it('(2) every `executed` row\'s cited executor anchor is GREPPED out of its cited file — never trusted from the registry\'s own prose', () => {
    const executed = Object.entries(registry.declarations).filter(([, r]) => r.disposition === 'executed');
    expect(executed.length, 'at least one executed row, or (2) proves nothing').toBeGreaterThan(0);
    for (const [key, row] of executed) {
      expect(row.executor, `execution.${key}: an "executed" row must cite its executor`).toBeTruthy();
      const abs = path.join(REPO_ROOT, row.executor!.file);
      expect(fs.existsSync(abs), `execution.${key}: cited executor file ${row.executor!.file} does not exist`).toBe(true);
      const src = fs.readFileSync(abs, 'utf8');
      expect(src.includes(row.executor!.anchor), `execution.${key}: cited anchor "${row.executor!.anchor}" not found in ${row.executor!.file} — the citation has rotted or was never true`).toBe(true);
    }
  });

  it('(3) step_timeout drift, BOTH ways — every `wired` slug agrees with the manifest in minutes, and every other converted step declaring step_timeout is named in `pending`', () => {
    const row = registry.declarations.step_timeout!;
    const wired = row.wired || {};
    const pending = new Set(row.pending || []);
    const declaring = liveDescriptors().filter((d) => d.execution.step_timeout !== undefined);
    expect(declaring.length, 'converted descriptors declaring execution.step_timeout').toBeGreaterThan(0);

    for (const d of declaring) {
      const declaredMinutes = durationToMinutes(d.execution.step_timeout);
      expect(declaredMinutes, `${d.slug}: execution.step_timeout "${String(d.execution.step_timeout)}" is not a parseable duration`).not.toBeNull();
      const manifestMinutes = manifest.scripts[d.slug]?.step_timeout_minutes;
      if (Object.prototype.hasOwnProperty.call(wired, d.slug)) {
        // WIRED: the declaration is EXECUTED, and the two numbers may never drift apart.
        expect(manifestMinutes, `${d.slug} is registered as wired but manifest.scripts.${d.slug}.step_timeout_minutes is absent — run-chain reads 0, which is INERT`).toBe(wired[d.slug]);
        expect(manifestMinutes, `${d.slug}: descriptor execution.step_timeout (${declaredMinutes}m) and manifest step_timeout_minutes (${String(manifestMinutes)}) disagree`).toBe(declaredMinutes);
      } else {
        // NOT WIRED: a DECLARED gap, never an invisible one.
        expect(pending.has(d.slug), `${d.slug} declares execution.step_timeout with no manifest wiring and is absent from the registry's pending[] list — an undeclared inert declaration is exactly what R-X forbids`).toBe(true);
        expect(manifestMinutes, `${d.slug} is listed pending, but the manifest DOES wire it — move it to wired[]`).toBeUndefined();
      }
    }
    for (const slug of pending) {
      expect(declaring.map((d) => d.slug), `pending[] names ${slug}, which declares no execution.step_timeout`).toContain(slug);
    }
  });

  it('(4) every `descriptive` row is named in Spec 124\'s own R-X disposition table — a spec reader learns the declaration is inert, not only a reader of this file', () => {
    const spec = fs.readFileSync(SPEC124_PATH, 'utf8');
    const descriptive = Object.entries(registry.declarations).filter(([, r]) => r.disposition === 'descriptive');
    expect(descriptive.length, 'budget and txn_budget are the two measured-inert declarations this WF3 dispositioned').toBe(2);
    for (const [key] of descriptive) {
      expect(spec, `Spec 124 never names execution.${key} as descriptive — the disposition lives only in a JSON file no reader of the policy will open`).toMatch(
        new RegExp(`execution\\.${key}[^\\n]*descriptive|descriptive[^\\n]*execution\\.${key}`),
      );
    }
  });

  it('(4b) a `descriptive` row is REFUTED by the code, not just by prose — scripts/lib is grepped for a real consumer of each descriptive field, and a hit is RED', () => {
    // Observability fold (2026-09-15). Assertion (4) proves a descriptive row is DECLARED
    // in Spec 124; it cannot prove the declaration is still TRUE. "No executor exists" is
    // the whole content of `descriptive`, and it is exactly the kind of claim that rots
    // silently the moment someone wires the field up: the row would keep saying "declared,
    // not enforced" about a field that is now enforced, which is R-X's own failure mode
    // pointed the other way. So the claim is RE-EXECUTED here rather than trusted.
    const descriptive = Object.entries(registry.declarations)
      .filter(([, r]) => r.disposition === 'descriptive')
      .map(([k]) => k);
    expect(descriptive.length, 'at least one descriptive row, or this arm proves nothing').toBeGreaterThan(0);

    // Every .js under scripts/lib, recursively — the runner library is where an executor
    // for an `execution.*` field would have to live (that is where every other one lives).
    const libFiles: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else if (e.name.endsWith('.js')) libFiles.push(abs);
      }
    };
    walk(path.join(REPO_ROOT, 'scripts/lib'));
    expect(libFiles.length, 'the library scan must find files, or the grep is vacuous').toBeGreaterThan(10);

    const consumersOf = (key: string): string[] => {
      const hits: string[] = [];
      for (const abs of libFiles) {
        const src = fs.readFileSync(abs, 'utf8');
        // Comment-blind: strip line and block comments first, so the prose explaining WHY
        // a field is unexecuted (which necessarily names it) is not mistaken for a
        // consumer of it. Only real code counts.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*\/\/.*$/gm, '');
        // A consumer reads it off an execution object: `execution.budget`,
        // `.execution.txn_budget`, `execution['budget']`, or a destructure of one.
        const re = new RegExp(`execution\\s*(?:\\.\\s*${key}\\b|\\[\\s*['"\`]${key}['"\`]\\s*\\])|\\{[^}]*\\b${key}\\b[^}]*\\}\\s*=\\s*[A-Za-z_$][\\w$]*\\.execution`);
        if (re.test(code)) hits.push(path.relative(REPO_ROOT, abs).replace(/\\/g, '/'));
      }
      return hits;
    };

    // POSITIVE CONTROL, first — a detector that finds nothing reports "no consumer" for a
    // field that HAS one just as cheerfully as for one that does not (Spec 123 KFM 1,
    // green-because-it-never-looked). `execution.statement_timeout` is dispositioned
    // `executed` and is genuinely read at scripts/lib/step/index.js's post-check ceiling
    // fallback, so the SAME predicate must find it. If this ever reads empty, the
    // assertions below are vacuous and mean nothing.
    expect(
      consumersOf('statement_timeout'),
      'the consumer detector found nothing for execution.statement_timeout, which IS consumed — the detector is broken, so every "no consumer" result below is meaningless',
    ).not.toEqual([]);

    for (const key of descriptive) {
      expect(
        consumersOf(key),
        `execution.${key} is dispositioned "descriptive" ("declared, NOT enforced"), but scripts/lib now contains a consumer of it. Either the disposition is stale — flip the row to "executed" and cite the executor, which assertion (2) will then grep-verify — or the consumer is reading a field nobody enforces.`,
      ).toEqual([]);
    }
  });

  it('(5) the enrich_parcels stop-mechanism LADDER holds, each rung read from its OWN source file (Spec 118 §3)', () => {
    const l = registry.ladder;
    // Outer rung — the CI wall clock, the only live element on 2026-09-15.
    const wf = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    const ciMatch = /SOURCES_STEP_TIMEOUT_MINUTES:\s*'(\d+)'/.exec(wf);
    expect(ciMatch, 'SOURCES_STEP_TIMEOUT_MINUTES not found in chain-sources.yml').toBeTruthy();
    const ci = Number(ciMatch![1]);
    expect(ci, 'registry ladder drifted from the workflow').toBe(l.outer_ci_minutes.value);
    // Middle rung — run-chain's own per-step SIGTERM ceiling.
    const stepCeiling = manifest.scripts[l.step]?.step_timeout_minutes;
    expect(stepCeiling, `manifest.scripts.${l.step}.step_timeout_minutes must exist for the middle rung to exist at all`).toBe(l.step_ceiling_minutes.value);
    // Inner rung — the per-phase deadline EP-PHASE-DEADLINE armed, seeded as an admin
    // logic variable (never a literal), read here from the seed file itself.
    const seeds = JSON.parse(fs.readFileSync(LOGIC_VARS_PATH, 'utf8')) as Record<string, { default: number }>;
    const phase = seeds[l.phase_deadline_minutes.key]?.default;
    expect(phase, `${l.phase_deadline_minutes.key} must be seeded`).toBe(l.phase_deadline_minutes.value);
    // The point of the whole exercise: strictly tightening inwards. An inversion means the
    // outer rung is the only one that can ever fire — the 2026-09-15 incident, re-armed.
    expect(ci, 'the CI wall clock must be looser than run-chain\'s own step ceiling').toBeGreaterThan(stepCeiling!);
    expect(stepCeiling, 'the step ceiling must be looser than a single phase\'s deadline').toBeGreaterThan(phase!);
  });

  // -------------------------------------------------------------------------
  // (6) WF3 2026-09-17 — the PER-PHASE bound is finite-or-declared-disabled.
  //
  // `docs/reports/review_followups.md:3788`: the runner evaluated
  // `Number(config[phase.timeout_minutes_from_config])` bare, so a TYPO and the literal
  // `"none"` both produced NaN — no `SET LOCAL statement_timeout`, a no-op
  // `startPhaseDeadline`, and `timeout NaNmin` in the log. Exactly ER-D1's silence class
  // (Spec 48 §3.6), one field over from the two `resolveInterval` already covered.
  //
  // Two arms, because the runtime guard alone would only fire on the cloud:
  //   (a) STATIC — every declared phase-timeout name is `"none"` or a SEEDED variable, so a
  //       typo REDs here rather than at 20:16Z in a 300-minute job;
  //   (b) ANCHOR — the runtime guard itself is still present in the library (a future
  //       refactor that drops it must red this lock, not just this file's prose).
  // -------------------------------------------------------------------------
  it('(6) every execution.phases[].timeout_minutes_from_config is "none" or a SEEDED logic variable (review_followups.md:3788)', () => {
    const seeds = JSON.parse(fs.readFileSync(LOGIC_VARS_PATH, 'utf8')) as Record<string, unknown>;
    const declared: Array<{ slug: string; phase: string; varName: unknown }> = [];
    for (const d of liveDescriptors()) {
      const phases = (d.execution.phases as Array<Record<string, unknown>> | undefined) || [];
      for (const p of phases) declared.push({ slug: d.slug, phase: String(p.name), varName: p.timeout_minutes_from_config });
    }
    expect(declared.length, 'no live descriptor declares execution.phases[] — this lock would be vacuous').toBeGreaterThan(0);
    for (const { slug, phase, varName } of declared) {
      expect(
        typeof varName,
        `${slug}.${phase}: execution.phases[].timeout_minutes_from_config must be declared (the literal "none" to disable)`,
      ).toBe('string');
      if (varName === 'none') continue;
      expect(
        Object.prototype.hasOwnProperty.call(seeds, varName as string),
        `${slug}.${phase}: timeout_minutes_from_config names "${String(varName)}", which is NOT in scripts/seeds/logic_variables.json. Before WF3 2026-09-17 that resolved to NaN and silently disabled BOTH the SET LOCAL statement_timeout and the phase deadline; it now throws at construction, but a typo must red HERE, not on the cloud.`,
      ).toBe(true);
    }
  });

  it('(6b) the runtime guard that makes a mis-declared phase timeout a THROW is still in scripts/lib/step/index.js', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/step/index.js'), 'utf8');
    expect(
      src,
      'the per-phase timeout must still be resolved up front (phaseTimeouts), not re-derived at the call sites',
    ).toMatch(/const phaseTimeouts = new Map\(\)/);
    expect(
      src,
      'the finite-or-throw arm must still be there — Number.isFinite, never !x, so a declared 0 stays a deliberate disable',
    ).toMatch(/execution\.phases\[\$\{phase\.name\}\]\.timeout_minutes_from_config/);
    // Comments stripped FIRST — `tasks/lessons.md`'s recurring class: a text-scanning lock
    // over a corpus that documents its own rules reports the promise as the breach (the
    // fix's own docblock quotes the retired expression verbatim).
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(
      code.match(/Number\(config\[phase\.timeout_minutes_from_config\]\)/g),
      'no call site may re-derive the bound bare — that is the NaN path this lock retired',
    ).toBeNull();
  });
});
