// SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md §8 (Surface registry (generated))
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §2, §3, §10
// SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md §5 R-13 (owns.components[] totality)
//
// The estate has a System Map for specs and nothing at all for surfaces — which
// is how `/api/leads/view` stayed a live, 153-line, 44-test, ZERO-CALLER meter
// for months, with an unreachable paywall branch downstream of it. Nothing held
// the join between "a contract exists" and "a surface calls it".
//
// docs/reports/generated/127-surface-registry.md is that join, generated from
// scripts/surfaces/_schema/surface-census.json. This suite is what stops the
// registry becoming another hand-maintained table that rots: it re-runs the
// generator and asserts the committed artifact is byte-identical, proves the
// generator's refusals genuinely FIRE (an untested checker proves nothing —
// Spec 121 §12b.6), and holds the R-13 component-ownership totality in BOTH
// directions. Mirrors programme-backlog.infra.test.ts's canary discipline.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const CENSUS_DIR = path.join(REPO_ROOT, 'scripts/surfaces/_schema/census');
const CENSUS_SHARDS = ['mobile-product', 'web-product', 'admin-existing', 'admin-new', 'contracts', 'jobs'];
const SCHEMA_PATH = path.join(REPO_ROOT, 'scripts/surfaces/_schema/surface.schema.json');
const GENERATED_PATH = path.join(REPO_ROOT, 'docs/reports/generated/127-surface-registry.md');
const QUEUE_PATH = path.join(REPO_ROOT, 'docs/reports/generated/127-surface-review-queue.md');
const GENERATOR = path.join(REPO_ROOT, 'scripts/violations/generate-surface-registry.mjs');

const COMPONENT_ROOTS = ['src/components', 'mobile/src/components'];

function runGenerator(args: string[], env: Record<string, string | undefined> = {}) {
  return execFileSync('node', [GENERATOR, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function tryGenerator(args: string[], env: Record<string, string | undefined> = {}): { code: number; out: string } {
  try {
    const out = runGenerator(args, env);
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** A census row IS a descriptor in the exact shape surface.schema.json defines. */
type Row = {
  kind: 'SURFACE' | 'CONTRACT' | 'JOB';
  status: 'exists' | 'new' | 'generated';
  docs: { purpose: string; data_story: string; under_126: string };
  identity: { id: string; ref: string; archetype: string; platforms: string[]; owns: { components: string[] }; route?: string };
  inputs: { contract_ref?: string[] };
  sharing: { surfaces?: string[] };
  categories?: Record<string, unknown>;
  'x-draft'?: { consumers?: string[] };
  programme: { scope: string; phase: string; pilot?: boolean; why: string; feature: string; build_order: number; review: { status: string } };
};
const idOf = (r: Row) => r.identity.id;
const archOf = (r: Row) => r.identity.archetype;

function loadCensus(): Row[] {
  const out: Row[] = [];
  for (const name of CENSUS_SHARDS) {
    const f = path.join(CENSUS_DIR, `${name}.json`);
    const list = JSON.parse(fs.readFileSync(f, 'utf8')) as Row[];
    for (const r of list) out.push(r);
  }
  return out;
}

function componentsOwnedBy(row: Row): string[] {
  return (row.identity.owns.components ?? []).filter((f) => COMPONENT_ROOTS.some((rt) => f.startsWith(`${rt}/`)));
}

function allComponentFiles(): string[] {
  const out: string[] = [];
  for (const rt of COMPONENT_ROOTS) {
    const abs = path.join(REPO_ROOT, rt);
    if (!fs.existsSync(abs)) continue;
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(p);
          continue;
        }
        if (!e.name.endsWith('.tsx') || e.name.endsWith('.test.tsx')) continue;
        out.push(path.relative(REPO_ROOT, p).split(path.sep).join('/'));
      }
    };
    walk(abs);
  }
  return out.sort();
}

function withTempCensus(rows: unknown, fn: (p: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-census-'));
  const p = path.join(dir, 'census.json');
  fs.writeFileSync(p, JSON.stringify(rows));
  try {
    fn(p);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('surface registry — generated, never hand-edited (drift lock)', () => {
  it('the committed registry is byte-identical to what the census currently generates', () => {
    const { code, out } = tryGenerator(['--check']);
    expect(out).not.toMatch(/DRIFT/);
    expect(code).toBe(0);
  });

  it('the census parses and every row carries the required fields', () => {
    const rows = loadCensus();
    expect(rows.length).toBeGreaterThan(50);
    for (const r of rows) {
      expect(idOf(r), `row without identity.id: ${JSON.stringify(r).slice(0, 80)}`).toBeTruthy();
      expect(['SURFACE', 'CONTRACT', 'JOB']).toContain(r.kind);
      expect(['exists', 'new', 'generated']).toContain(r.status);
      expect(r.docs.purpose.length, `row ${idOf(r)} has no prose purpose`).toBeGreaterThan(20);
      expect(r.docs.data_story.length, `row ${idOf(r)} has no data story`).toBeGreaterThan(20);
      expect(r.docs.under_126.length, `row ${idOf(r)} has no under-126 verdict`).toBeGreaterThan(20);
    }
  });

  it('every census archetype is declared in the surface schema (or is a CONTRACT/JOB archetype)', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const node = schema.properties.identity.properties.archetype;
    const surfaceArchetypes: string[] = Array.isArray(node.enum)
      ? node.enum
      : (node.oneOf as Array<{ const?: string }>).map((o) => o.const).filter((v): v is string => typeof v === 'string');
    const other = ['QUERY', 'MUTATION', 'WEBHOOK', 'COMMAND', 'EXPORT', 'TRANSLATION', 'SCHEDULED', 'DISPATCH'];
    const allowed = new Set([...surfaceArchetypes, ...other]);
    const unknown = loadCensus()
      .filter((r) => !allowed.has(archOf(r)))
      .map((r) => `${idOf(r)} -> ${archOf(r)}`);
    expect(unknown).toEqual([]);
  });

  it('the surface schema is still DRAFT and x-frozen is false (Spec 124 R-X — never freeze an archetype with no converted member)', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    expect(schema['x-status']).toBe('DRAFT');
    expect(schema['x-frozen']).toBe(false);
    expect(schema.properties.identity.properties.archetype['x-frozen']).toBe(false);
  });
});

describe('surface registry — the sharded census', () => {
  it('every declared shard exists, and a missing shard is a refusal rather than a smaller estate', () => {
    for (const name of CENSUS_SHARDS) {
      expect(fs.existsSync(path.join(CENSUS_DIR, `${name}.json`)), `missing shard ${name}.json`).toBe(true);
    }
    const stray = fs
      .readdirSync(CENSUS_DIR)
      .filter((f) => f.endsWith('.json'))
      .filter((f) => !CENSUS_SHARDS.includes(f.replace(/\.json$/, '')));
    expect(stray, 'a shard on disk that the generator does not merge would be invisible').toEqual([]);
  });

  it('an open field is the literal string UNRESEARCHED — never blank, never null', () => {
    const offenders: string[] = [];
    const walk = (v: unknown, p: string) => {
      if (v === null || v === '') offenders.push(p);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk((v as Record<string, unknown>)[k], `${p}.${k}`);
    };
    // Walk the whole descriptor, not just a categories sub-object: under the descriptor
    // shape the 21 categories ARE top-level keys.
    for (const r of loadCensus()) walk(r, `${idOf(r)}`);
    expect(offenders).toEqual([]);
  });

  it('the registry renders a research-progress summary with a real count', () => {
    const md = fs.readFileSync(GENERATED_PATH, 'utf8');
    expect(md).toMatch(/### 2\.2 Research progress/);
    expect(md).toMatch(/\*\*\d+ of \d+ rows fully researched · \d+ still open · \d+ unresearched fields in total\.\*\*/);
  });
});

describe('surface registry — R-13 component ownership totality (both directions)', () => {
  it('direction 1: no component file is claimed by two surfaces', () => {
    const owner = new Map<string, string>();
    const collisions: string[] = [];
    for (const r of loadCensus()) {
      for (const f of componentsOwnedBy(r)) {
        if (owner.has(f)) collisions.push(`${f}: ${owner.get(f)} and ${idOf(r)}`);
        else owner.set(f, idOf(r));
      }
    }
    expect(collisions).toEqual([]);
  });

  it.fails(
    'direction 2: every component file on disk is owned by exactly one surface — RED until the estate is brought under ownership (Spec 128 R-13; registry §4 renders the list)',
    () => {
      const owner = new Set<string>();
      for (const r of loadCensus()) for (const f of componentsOwnedBy(r)) owner.add(f);
      const unowned = allComponentFiles().filter((f) => !owner.has(f));
      expect(unowned).toEqual([]);
    },
  );

  it('the registry RENDERS the unowned set rather than hiding it, and the rendered count equals the measured count', () => {
    const owner = new Set<string>();
    for (const r of loadCensus()) for (const f of componentsOwnedBy(r)) owner.add(f);
    const unowned = allComponentFiles().filter((f) => !owner.has(f));
    const md = fs.readFileSync(GENERATED_PATH, 'utf8');
    expect(md).toContain('## 5. Unowned components');
    const rendered = [...md.matchAll(/^\| `((?:src|mobile\/src)\/components\/[^`]+)` \| \*\*none\*\* \|$/gm)].map((m) => m[1]);
    expect(new Set(rendered)).toEqual(new Set(unowned));
  });
});

describe('surface registry — the generator refuses, and the refusals fire', () => {
  it('--self-test passes (every refusal proven to fire)', () => {
    const out = runGenerator(['--self-test']);
    expect(out).toMatch(/self-test: (\d+)\/\1 passed/);
    expect(out).not.toMatch(/^FAIL/m);
  });

  it('RED canary: a tampered census makes --check fail', () => {
    const rows = loadCensus();
    const tampered = rows.map((r, i) => (i === 0 ? { ...r, docs: { ...r.docs, purpose: `${r.docs.purpose} TAMPERED` } } : r));
    withTempCensus(tampered, (p) => {
      const { code, out } = tryGenerator(['--check'], { BUILDO_SURFACE_CENSUS_PATH: p });
      expect(code).toBe(1);
      expect(out).toMatch(/DRIFT/);
    });
  });

  it('RED canary: a census row with an undeclared archetype is refused, not rendered', () => {
    withTempCensus(
      [{ kind: 'SURFACE', status: 'exists', identity: { id: 'ghost', archetype: 'MAP', platforms: ['web'], owns: { components: [] } }, docs: { purpose: 'a'.repeat(40), data_story: 'b'.repeat(40), under_126: 'c'.repeat(40) } }],
      (p) => {
        const { code, out } = tryGenerator([], { BUILDO_SURFACE_CENSUS_PATH: p });
        expect(code).not.toBe(0);
        expect(out).toMatch(/do not validate against|is not declared in/);
      },
    );
  });

  it('RED canary: a row missing its prose purpose is refused', () => {
    withTempCensus([{ kind: 'SURFACE', status: 'exists', identity: { id: 'x', archetype: 'LIST', platforms: ['web'], owns: { components: [] } } }], (p) => {
      const { code, out } = tryGenerator([], { BUILDO_SURFACE_CENSUS_PATH: p });
      expect(code).not.toBe(0);
      expect(out).toMatch(/do not validate against/);
    });
  });
});

describe('surface registry — descriptors are the transport, with no re-keying', () => {
  it('every census row validates against surface.schema.json, and the emitted files equal the shards both ways', () => {
    const { code, out } = tryGenerator(['--check']);
    expect(out).not.toMatch(/DESCRIPTOR DRIFT/);
    expect(out).toMatch(/clean — no drift/);
    expect(code).toBe(0);
  });

  it('one descriptor file exists per row, under its PROGRAMME SCOPE, then its FEATURE MODULE, then its kind — the tree the engine reads', () => {
    const missing: string[] = [];
    for (const r of loadCensus()) {
      const dir = { SURFACE: 'surfaces', CONTRACT: 'contracts', JOB: 'jobs' }[r.kind];
      const f = path.join(REPO_ROOT, 'scripts/surfaces', r.programme.scope, r.programme.feature, dir, `${idOf(r)}.descriptor.json`);
      if (!fs.existsSync(f)) missing.push(f);
    }
    expect(missing).toEqual([]);
  });

  it('the review queue exists, is drift-locked, and carries one card per governed entry in build order', () => {
    expect(fs.existsSync(QUEUE_PATH)).toBe(true);
    const md = fs.readFileSync(QUEUE_PATH, 'utf8');
    const governed = loadCensus().filter((r) => r.programme.scope !== 'estate_other');
    const cards = [...md.matchAll(/^## Card \d+ — `([SCJ]-\d{3})`/gm)].map((m) => m[1]);
    expect(cards.length).toBe(governed.length);
    const expected = governed
      .slice()
      .sort((a, b) => a.programme.build_order - b.programme.build_order || idOf(a).localeCompare(idOf(b)))
      .map((r) => r.identity.ref);
    expect(cards).toEqual(expected);
    // the question set is fixed: a card that drops a question is not the same pass
    for (const qn of [
      'What does it do, and for whom',
      'Which tables and columns, produced by which step',
      'Which contracts, and who calls them',
      'What gate, role or entitlement',
      'What archetype, and why that one',
      'Is any behaviour here lead-gen leakage',
      'Does it match its owning spec section',
      'What is still unresearched',
      'What would removing it delete',
    ]) {
      expect(md, `the review card question set is missing: ${qn}`).toContain(qn);
    }
  });

  it('every entry carries a stable ref, a feature module and a derived build order; refs are unique', () => {
    const rows = loadCensus();
    const bad = rows.filter((r) => !/^[SCJ]-\d{3}$/.test(r.identity.ref ?? '')).map(idOf);
    expect(bad).toEqual([]);
    const refs = rows.map((r) => r.identity.ref);
    expect(new Set(refs).size).toBe(refs.length);
    const feats = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/surfaces/_schema/features.json'), 'utf8')) as Array<{ id: string }>;
    const known = new Set(feats.map((f) => f.id));
    expect(rows.filter((r) => !known.has(r.programme.feature)).map(idOf)).toEqual([]);
    expect(rows.filter((r) => !Number.isInteger(r.programme.build_order)).map(idOf)).toEqual([]);
  });

  it('every row declares a programme scope from the closed set, with a measured why — and exactly one row is the pilot', () => {
    const rows = loadCensus();
    const SCOPES = ['parcel_product', 'parcel_admin', 'platform_shared', 'estate_other'];
    const bad = rows.filter((r) => !SCOPES.includes(r.programme?.scope)).map(idOf);
    expect(bad).toEqual([]);
    const thin = rows.filter((r) => !r.programme.why || r.programme.why.length < 10).map(idOf);
    expect(thin).toEqual([]);
    const pilots = rows.filter((r) => r.programme.pilot === true).map(idOf);
    expect(pilots).toEqual(['mobile_parcel_detail']);
  });

  it('no estate_other row is batched — scope D is inventory and seam only (Spec 126 §2.0, R-03)', () => {
    const scheduled = loadCensus()
      .filter((r) => r.programme.scope === 'estate_other' && r.programme.phase !== 'not_scheduled')
      .map((r) => `${idOf(r)} -> ${r.programme.phase}`);
    expect(scheduled).toEqual([]);
  });

  it('the generated types and the runtime validator exist and are generated FROM the schema', () => {
    const types = path.join(REPO_ROOT, 'src/lib/surfaces/generated/surface-descriptor.d.ts');
    const validator = path.join(REPO_ROOT, 'src/lib/surfaces/generated/validate-descriptor.mjs');
    expect(fs.existsSync(types)).toBe(true);
    expect(fs.existsSync(validator)).toBe(true);
    const t = fs.readFileSync(types, 'utf8');
    expect(t).toMatch(/GENERATED FROM scripts\/surfaces\/_schema\/surface\.schema\.json/);
    expect(t).toMatch(/export type SurfaceDescriptor/);
    expect(t).toMatch(/export type Archetype/);
    expect(fs.readFileSync(validator, 'utf8')).toMatch(/export function assertDescriptor/);
  });
});

describe('surface registry — the orphan join it exists to hold', () => {
  it('every CONTRACT declares consumers, and a contract with an empty consumers list renders as an orphan', () => {
    const contracts = loadCensus().filter((r) => r.kind === 'CONTRACT');
    expect(contracts.length).toBeGreaterThan(0);
    const orphans = contracts.filter((c) => Array.isArray(c['x-draft']?.consumers) && c['x-draft']!.consumers!.length === 0);
    expect(orphans.length, 'the estate has measured orphan contracts; a 0 here means the join stopped being computed').toBeGreaterThan(0);
    const md = fs.readFileSync(GENERATED_PATH, 'utf8');
    for (const o of orphans) {
      expect(md, `orphan ${idOf(o)} is not rendered as one`).toContain('**nothing — orphan contract**');
    }
  });

  it('no surface calls a contract path that is not in the census (a dangling edge is how a fan-out graph lies)', () => {
    const rows = loadCensus();
    const paths = new Set(rows.filter((r) => r.kind === 'CONTRACT').map((r) => r.identity.route));
    const ids = new Set(rows.map(idOf));
    const dangling: string[] = [];
    for (const r of rows) {
      if (r.kind !== 'SURFACE') continue;
      for (const c of r.inputs.contract_ref ?? []) {
        if (!paths.has(c) && !ids.has(c)) dangling.push(`${idOf(r)} -> ${c}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});
