/**
 * Descriptor validation — the LOADER PROPERTY of `pipeline.step()`.
 *
 * Spec 122 §4.2: "pipeline.step() runs before compute does, so it AJV-validates
 * the descriptor against the canonical schema and throws." That is strictly
 * stronger than a build-time loader, which cannot fire on a hotfix that skipped
 * CI — so validation happens at CONSTRUCTION, not at run, and it opens no pool
 * (claim #86).
 *
 * The canonical vocabulary is the SCHEMA, not prose (operator ruling R2).
 *
 * ⚠️ AJV CONFIGURATION IS LOAD-BEARING, not incidental:
 *   - `ajv@8` is a REAL dependency (S2). Before this it resolved transitively to
 *     ajv 6 via eslint — a compiler nobody declared and nobody pinned.
 *   - `strict: true` (the ajv 8 default) is KEPT, so a typo'd real keyword
 *     (`requred`) is a compile error rather than a rule that silently never
 *     fires — the Spec 121 §12b.6 "green because it never looked" class.
 *   - the schema's own `x-*` annotation keywords are registered explicitly,
 *     enumerated FROM the schema, so strict mode survives. A blanket
 *     `strict: false` would have bought the same compile at the cost of the
 *     typo detection above.
 *   - `strictTypes: false` only silences the `if/then` type-inference chatter
 *     from the archetype profiles; it does not weaken any assertion.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.2, §7.1
 */
'use strict';

const path = require('path');
const Ajv = require('ajv');

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'steps', '_schema', 'step.schema.json');
const GRANDFATHERED_PATH = path.join(__dirname, '..', '..', 'steps', '_schema', 'grandfathered.json');

/** The descriptor path `x-banned-for-new` names for the guard axis. */
const GUARD_PATH = 'outputs.writes[].write_discipline.guard';
/**
 * WF3 (2026-09-24, class-C anti-bypass hardening) — the descriptor path
 * `x-banned-for-new` names for the write MECHANIC axis. `staging_full_replace`
 * (class C) skips `buildWritePlan`'s retract-all/no-scope throw as of this same
 * WF3, so declaring it needs its OWN Rule 9 adjudication — the schema's existing
 * `why` requirement (the `allOf` x-rule at `writeDiscipline.class === "staging_full_replace"`)
 * is a descriptor-authored justification, never a reviewed allowlist entry, and is
 * not a substitute for one (same reasoning `assertGrandfathered` already applies
 * to `GUARD_PATH`).
 */
const CLASS_PATH = 'outputs.writes[].write_discipline.class';
/** `columns[].source` value marking a column bound to the run clock (Spec 47 §R3.5). */
const RUN_CLOCK_SOURCE = 'run_at';
/** `guard_columns` shorthand the generator expands to every step-written non-key column. */
const ALL_DECLARED = 'all_declared';

/** Walk a schema and collect every `x-`-prefixed annotation keyword it uses. */
function collectExtensionKeywords(node, into = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) collectExtensionKeywords(item, into);
    return into;
  }
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      if (key.startsWith('x-')) into.add(key);
      collectExtensionKeywords(node[key], into);
    }
  }
  return into;
}

/**
 * Compile the step schema (or any schema shaped like it) under the house AJV
 * configuration. Exported so the schema's own tier-0 test and the library use
 * ONE compiler — two compilers with different options is two contracts.
 *
 * @param {object} [schema] - defaults to the canonical step schema
 * @returns {import('ajv').ValidateFunction}
 */
function compileStepSchema(schema) {
  const target = schema || loadSchema();
  const ajv = new Ajv({ allErrors: true, strictTypes: false });
  for (const keyword of collectExtensionKeywords(target)) {
    ajv.addKeyword({ keyword, valid: true });
  }
  return ajv.compile(target);
}

/** The canonical schema object. */
function loadSchema() {
  return require(SCHEMA_PATH);
}

let _validate = null;
/** Lazily compiled singleton — compiling is ~30ms and every step pays it once. */
function stepValidator() {
  if (!_validate) _validate = compileStepSchema(loadSchema());
  return _validate;
}

/** One AJV error rendered as `path: keyword message` — path first, because that is what a human greps. */
function formatError(err) {
  const at = err.instancePath || '(root)';
  const extra = err.params && Object.keys(err.params).length > 0 ? ` ${JSON.stringify(err.params)}` : '';
  return `  ${at}: ${err.message}${extra}`;
}

/** The committed `x-banned-for-new` allowlist. */
function loadGrandfathered() {
  return require(GRANDFATHERED_PATH);
}

/** Every write target's declared step-written column names, in declaration order. */
function stepWrittenColumns(writeSpec) {
  return (writeSpec.columns || [])
    .filter((c) => (c.written || 'step') === 'step')
    .map((c) => c.name);
}

/** The guard set as the GENERATOR will resolve it — `all_declared` expanded, exactly as write.js does. */
function effectiveGuardColumns(writeSpec) {
  const declared = writeSpec.write_discipline && writeSpec.write_discipline.guard_columns;
  if (declared !== ALL_DECLARED) return Array.isArray(declared) ? declared : [];
  const keys = new Set(Array.isArray(writeSpec.key) ? writeSpec.key : [writeSpec.key]);
  return stepWrittenColumns(writeSpec).filter((c) => !keys.has(c));
}

/**
 * LG-9 / D-5 — A RUN-CLOCK COLUMN MAY NOT BE A CHANGE GUARD.
 *
 * THE MEASURED DEFECT THIS CLOSES. `write.js resolveGuardColumns` expands
 * `guard_columns: "all_declared"` to every step-written column except the key. On
 * `parcel_buildings` that set INCLUDES `linked_at`, whose value is `RUN_AT` — so
 * `parcel_buildings.linked_at IS DISTINCT FROM EXCLUDED.linked_at` is TRUE on every
 * run, every row updates every run, and `enrich-parcels.js buildMassingScopeWhere`
 * (which re-scopes on `pb.linked_at > p.massing_enriched_at`) goes from 1,395 parcels
 * to 485,135. One descriptor word, 520,492 rewritten rows and a ~46-53 min downstream
 * re-enrichment, with every check still green: the write really did happen, the guard
 * really did fire, and nothing in the audit table says the run was pointless.
 *
 * AJV cannot express it — the rule cross-references `columns[].source` against
 * `write_discipline.guard_columns` in the same target and has to expand a shorthand
 * first. So it lives here, where `pipeline.step()` runs it at construction.
 *
 * The escape hatch is `guard_columns_why`, deliberately narrow: a step that genuinely
 * needs the clock in its guard may say so, and the sentence is then in the diff.
 */
function assertNoRunClockGuard(descriptor, findings) {
  const outputs = descriptor.outputs;
  if (!outputs || outputs === 'none' || !Array.isArray(outputs.writes)) return;
  outputs.writes.forEach((w, i) => {
    const wd = w.write_discipline || {};
    if (wd.guard_columns_why) return;
    const clockColumns = (w.columns || []).filter((c) => c.source === RUN_CLOCK_SOURCE).map((c) => c.name);
    if (clockColumns.length === 0) return;
    const guarded = effectiveGuardColumns(w);
    const trapped = clockColumns.filter((c) => guarded.includes(c));
    if (trapped.length === 0) return;
    const how = wd.guard_columns === ALL_DECLARED
      ? `guard_columns "${ALL_DECLARED}" expands over ${trapped.join(', ')}`
      : `guard_columns names ${trapped.join(', ')} explicitly`;
    findings.push(
      `  /outputs/writes/${i}/write_discipline/guard_columns: ${how}, and ${trapped.join(', ')} `
      + `${trapped.length === 1 ? 'is' : 'are'} declared columns[].source "${RUN_CLOCK_SOURCE}" — the run clock is `
      + 'DISTINCT FROM its stored value on EVERY run, so every row of '
      + `${w.table} would rewrite every run and every downstream consumer keyed on that watermark would re-scope. `
      + 'Name the guard columns explicitly without it, or declare write_discipline.guard_columns_why (LG-9 / D-5).',
    );
  });
}

/**
 * THE `x-banned-for-new` ENFORCER (Fold B item 2).
 *
 * `x-banned-for-new` sat in the schema with NO consumer: the ban existed as prose, so a
 * new step could carry a banned value, satisfy the schema's own `*_why` requirement and
 * ship. Two things are required now, and the second one is the point — a `why` is written
 * by whoever wants the exception, an allowlist entry is a reviewed diff naming a SHA.
 */
/**
 * WF3 (2026-09-24) — every `x-banned-for-new.values` path this function
 * enforces, each keyed to the descriptor field it reads the declared value
 * from. `nested` names the object the field actually lives on relative to a
 * write item (`write_discipline` for guard/class). `outputs.writes[].replay
 * and execution.criticality were deleted with their x-banned-for-new keys in
 * the Phase 3 RE-FREEZE (registry-truth plan, DELETE row #18/#45 — zero
 * runtime readers).
 * `scripts/analysis/gates/registries.mjs`'s `enforcedBannedPaths` parses
 * this exact array's `path:` literals as the coverage answer (gate I #33) —
 * every entry MUST stay inside this one array text for that scan to see it.
 */
const GRANDFATHERED_VALUE_PATHS = [
  { path: GUARD_PATH, field: 'guard', whyField: 'guard_why', nested: 'write_discipline' },
  { path: CLASS_PATH, field: 'class', whyField: 'why', nested: 'write_discipline' },
];

function assertGrandfathered(descriptor, findings) {
  const schema = loadSchema();
  const values = (schema['x-banned-for-new'] || {}).values || {};
  const slug = descriptor.identity && descriptor.identity.name;
  const entry = (loadGrandfathered().steps || {})[slug];

  for (const { path: bannedPath, field, whyField, nested } of GRANDFATHERED_VALUE_PATHS) {
    const banned = values[bannedPath] || [];
    if (banned.length === 0) continue;
    const allowed = entry && entry.paths && banned.includes(entry.paths[bannedPath]);

    const outputs = descriptor.outputs;
    if (!outputs || outputs === 'none' || !Array.isArray(outputs.writes)) continue;
    outputs.writes.forEach((w, i) => {
      const wd = nested ? (w[nested] || {}) : w;
      if (!banned.includes(wd[field])) return;
      if (!wd[whyField]) return; // AJV already reports the missing why at this path
      if (allowed) return;
      findings.push(
        `  /outputs/writes/${i}${nested ? `/${nested}` : ''}/${field}: "${wd[field]}" is x-banned-for-new at `
        + `${bannedPath}, and "${slug}" has no entry in scripts/steps/_schema/grandfathered.json. `
        + `A ${whyField} alone does not grandfather a banned value — the allowlist entry (step, path, value, `
        + 'why, commit) is the adjudication, and it is a reviewed diff rather than something a descriptor '
        + 'can grant itself.',
      );
    });
  }
}

/**
 * THE V7 `no_retraction` ENFORCER (Spec 122 V7; Spec 124 GAP V7 no_retraction).
 *
 * `x-banned-for-new.rules` already NAMES three predicates (`no_retraction`,
 * `unscoped_set_based`, `unguarded_write`) as of the V7 decoupling, but until this
 * function only `unguarded_write` had a consumer (`assertGrandfathered`, keyed on
 * the `guard` axis) — `no_retraction` sat in the schema exactly as `unguarded_write`
 * once did: metadata with no enforcer, so a new step could carry the banned shape,
 * satisfy every AJV requirement, and ship. This closes that half.
 *
 * The `no_retraction` rule's own `banned_when` text: "write_discipline.class is an
 * insert-only mechanic AND retract == 'none'". The class enum still carries the old
 * fused D-class identity as a literal value (`insert_only_no_retraction`) rather than
 * a separately-named mechanic, so the mechanic half of the predicate is exactly that
 * one enum value — the retract-axis half is still checked independently, matching the
 * rule's own stated shape (a class that later gains a genuine retraction path is no
 * longer banned, even under the same class name).
 *
 * Grandfathering uses the SAME allowlist file as `assertGrandfathered`, but a
 * different shape: `grandfathered.json`'s per-step entry gains an optional
 * `rules: string[]` array (rule ids from `x-banned-for-new.rules[].id`), read
 * independently of `paths` — `no_retraction` has no single `path→value` pair to
 * grandfather (the predicate spans two fields), so it is named as a RULE, not a path.
 */
const NO_RETRACTION_CLASSES = new Set(['insert_only_no_retraction']);

function assertNoRetraction(descriptor, findings) {
  const outputs = descriptor.outputs;
  if (!outputs || outputs === 'none' || !Array.isArray(outputs.writes)) return;
  const rules = (loadSchema()['x-banned-for-new'] || {}).rules || [];
  const rule = rules.find((r) => r.id === 'no_retraction');
  if (!rule) return; // the schema stopped naming this rule — nothing to enforce against
  const slug = descriptor.identity && descriptor.identity.name;
  const entry = (loadGrandfathered().steps || {})[slug];
  const allowed = !!(entry && Array.isArray(entry.rules) && entry.rules.includes('no_retraction'));
  outputs.writes.forEach((w, i) => {
    const wd = w.write_discipline || {};
    if (!NO_RETRACTION_CLASSES.has(wd.class)) return;
    if (w.retract !== 'none') return; // genuinely retracts elsewhere — not the banned shape
    if (allowed) return;
    findings.push(
      `  /outputs/writes/${i}: write_discipline.class "${wd.class}" with retract:"none" is `
      + `x-banned-for-new rule "no_retraction" (${rule.why}), and "${slug}" has no `
      + 'rules:["no_retraction"] entry in scripts/steps/_schema/grandfathered.json. A write_discipline.why '
      + 'alone does not grandfather a banned shape — the allowlist entry (step, rule id, why, commit) is the '
      + 'adjudication, and it is a reviewed diff rather than something a descriptor can grant itself.',
    );
  });
}

/**
 * THE FIELD-PRESENCE ENFORCER for `x-banned-for-new.scalar_fields` (RE-FREEZE #12
 * output-panel peel, R-AX, 2026-09-22) — the sibling of `assertGrandfathered`'s
 * `values` (a banned ENUM VALUE within a field) for a field banned in its ENTIRETY:
 * any presence at all is the banned state, so there is no value to name, only a
 * dot-path. Mirrors `assertNoRetraction`'s grandfathering shape (a named array on
 * the step's `grandfathered.json` entry, checked independently of `paths`) rather
 * than `assertGrandfathered`'s value-list shape, because a presence ban has nothing
 * for `paths[path]` to hold besides the path itself.
 *
 * Resolves each declared path against the descriptor with a plain dot-walk — every
 * `x-banned-for-new.scalar_fields.paths[]` entry today is a SCALAR field directly
 * under a category (`execution.on_row_error_max_pct`), never inside an array, so
 * no `[]` segment-handling is needed; a future path with one would need this
 * resolver extended, not silently mis-walked.
 */
function resolveScalarPath(descriptor, dotPath) {
  return dotPath.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), descriptor);
}

function assertBannedScalarFields(descriptor, findings) {
  const paths = ((loadSchema()['x-banned-for-new'] || {}).scalar_fields || {}).paths || [];
  if (paths.length === 0) return;
  const slug = descriptor.identity && descriptor.identity.name;
  const entry = (loadGrandfathered().steps || {})[slug];
  const grandfatheredPaths = new Set((entry && Array.isArray(entry.scalar_fields) && entry.scalar_fields) || []);
  for (const dotPath of paths) {
    const value = resolveScalarPath(descriptor, dotPath);
    if (value === undefined) continue; // not declared — nothing banned to find
    if (grandfatheredPaths.has(dotPath)) continue;
    findings.push(
      `  /${dotPath.replace(/\./g, '/')}: field is x-banned-for-new (scalar_fields), and "${slug}" has no `
      + `scalar_fields:["${dotPath}"] entry in scripts/steps/_schema/grandfathered.json. Declaring the field `
      + 'with a why alone does not grandfather it — the allowlist entry (step, path, why, commit) is the '
      + 'adjudication, and it is a reviewed diff rather than something a descriptor can grant itself.',
    );
  }
}

/**
 * THE `invalidates[].set_null_on_change_of` TARGET ENFORCER (prerequisite 0l,
 * 2026-09-24). AJV cannot cross-reference one array (`outputs.invalidates[]`) against
 * another (`outputs.writes[]`) on the same descriptor, so the check lives here.
 *
 * `write.js buildWritePlan` EXECUTES an entry's CASE arm against the write target whose
 * `table` the entry names (filtering `outputs.invalidates` by `e.table === table` for
 * each declared write). An entry naming a table with NO matching `outputs.writes[].table`
 * would therefore silently NEVER render its CASE arm — no error, no SQL, no stamp ever
 * nulled — the same "declared but the generator never reads it" shape LG-9 closes for
 * a run-clock guard column. The BASE `{table, column, when}` entry (no
 * `set_null_on_change_of`) is unaffected: it stays declarative-only and may legitimately
 * name a DIFFERENT step's consumer table (load_ravines' own entry names `parcels` while
 * its write target is `ravines` — exactly the shape this check must NOT flag).
 */
function assertInvalidatesTargetMatchesWrite(descriptor, findings) {
  const outputs = descriptor.outputs;
  if (!outputs || outputs === 'none') return;
  const invalidates = Array.isArray(outputs.invalidates) ? outputs.invalidates : [];
  const writeTables = new Set((Array.isArray(outputs.writes) ? outputs.writes : []).map((w) => w.table));
  invalidates.forEach((entry, i) => {
    if (!entry.set_null_on_change_of) return; // declarative-only — no cross-reference to enforce
    if (writeTables.has(entry.table)) return;
    findings.push(
      `  /outputs/invalidates/${i}: set_null_on_change_of "${entry.set_null_on_change_of}" is declared but `
      + `table "${entry.table}" names no outputs.writes[].table on this descriptor `
      + `(${[...writeTables].join(', ') || '(no writes declared)'}) — the codegen executes this entry against `
      + 'the write target whose table it names (prerequisite 0l), so a mismatched table would silently never '
      + 'fire: no CASE arm, no error, the stamp never nulled.',
    );
  });
}

/**
 * GEOM-DRIFT WF3 COMMIT 2 — the `columns[].materiality` cross-reference rules AJV
 * cannot express.
 *
 * The axis declares a TOLERANCE predicate as a column's change test (a jittered
 * source needs `public.<fn>(<table>.<col>, EXCLUDED.<col>)`, not an exact
 * `IS DISTINCT FROM`). Every rule below is a cross-reference between the axis and
 * some other declaration on the SAME target — the bound column's `bind`, its
 * `on_empty`, the resolved guard set, the `set_null_on_change_of` watchers, the
 * step-written set, and its own `carries` list. None of it is schema-expressible,
 * so it lives here, where `pipeline.step()` runs it at construction.
 *
 * The `carries` list is checked against the watchers too: a carried column is
 * replaced only when the materiality predicate fires, so a `set_null_on_change_of`
 * naming it re-introduces the byte-wise `IS DISTINCT FROM` compare the axis exists
 * to remove (DeepSeek lens on write.js, executed 2026-10-08).
 */
function assertMaterialityDeclared(descriptor, findings) {
  const outputs = descriptor.outputs;
  if (!outputs || outputs === 'none' || !Array.isArray(outputs.writes)) return;
  const invalidates = Array.isArray(outputs.invalidates) ? outputs.invalidates : [];
  outputs.writes.forEach((w, i) => {
    const cols = w.columns || [];
    const axisCols = cols.filter((c) => c.materiality);
    if (axisCols.length === 0) return;

    if (axisCols.length > 1) {
      findings.push(
        `  /outputs/writes/${i}: more than one materiality column (${axisCols.map((c) => c.name).join(', ')}) `
        + `— one predicate per write target.`,
      );
    }

    const guards = effectiveGuardColumns(w);
    const watched = new Set(
      invalidates
        .filter((e) => e.table === w.table && e.set_null_on_change_of)
        .map((e) => e.set_null_on_change_of),
    );
    const stepWritten = new Set(stepWrittenColumns(w));

    cols.forEach((c, j) => {
      if (!c.materiality) return;

      if (c.bind !== 'wkb_geometry') {
        findings.push(
          `  /outputs/writes/${i}/columns/${j}: materiality on "${c.name}" requires bind "wkb_geometry" `
          + '(the predicate compares PostGIS geometries).',
        );
      }
      if (c.on_empty) {
        findings.push(
          `  /outputs/writes/${i}/columns/${j}: materiality on "${c.name}" cannot also declare on_empty `
          + '(two SET forms for one column).',
        );
      }
      if (!guards.includes(c.name) && !watched.has(c.name)) {
        findings.push(
          `  /outputs/writes/${i}/columns/${j}: materiality column "${c.name}" is neither in guard_columns `
          + 'nor watched by a set_null_on_change_of — it would silently become write-once.',
        );
      }

      const carries = (c.materiality && c.materiality.carries) || [];
      for (const k of carries) {
        const kc = cols.find((x) => x.name === k);
        if (k === c.name) {
          findings.push(`  /outputs/writes/${i}/columns/${j}: materiality carries "${k}" — carries the column itself.`);
        }
        if (!kc) {
          findings.push(`  /outputs/writes/${i}/columns/${j}: materiality carries "${k}" — is not a declared column.`);
        }
        if (kc && !stepWritten.has(k)) {
          findings.push(`  /outputs/writes/${i}/columns/${j}: materiality carries "${k}" — is not step-written.`);
        }
        if (kc && kc.on_empty) {
          findings.push(`  /outputs/writes/${i}/columns/${j}: materiality carries "${k}" — declares on_empty.`);
        }
        if (guards.includes(k)) {
          findings.push(
            `  /outputs/writes/${i}/columns/${j}: materiality carries "${k}" — is also in guard_columns `
            + '(a carried column has no guard term of its own).',
          );
        }
        if (watched.has(k)) {
          findings.push(
            `  /outputs/writes/${i}/columns/${j}: materiality carries "${k}" — is also watched by a `
            + `set_null_on_change_of (watch the materiality column "${c.name}" instead; a watched carried `
            + 'column re-introduces the exact compare).',
          );
        }
      }
    });
  });
}

/**
 * RE-FREEZE #37 (Spec 124 R-DY, R-DM, R-DZ, R-EA) — the cross-field rules of the four library forms
 * that AJV cannot express. Every refusal names the field and the index, before any I/O (R-BA).
 *   derive        (R-DY): only on an INGESTOR, only at outputs.writes[i >= 1], from === writes[0].table,
 *                 prior_columns ⊆ inputs.reads.tables[<from>].columns (a declared self-read).
 *   on_error      (R-DM): "warn_row" only on a derived target; on_error_why.liveness cites a declared
 *                 check {kind:"check", ref} of severity WARN bounded at exact zero ("viol == 0").
 *   written "seen" (R-DZ): at most one per target, never a key, never an explicit guard column.
 *   set_null_unless (R-EA): the entry's table is a declared write target and set_null_unless.column is a
 *                 written:"step" column of it.
 */
function assertRefreeze37Forms(descriptor, findings) {
  const outputs = descriptor.outputs;
  if (!outputs || outputs === 'none' || !Array.isArray(outputs.writes)) return;
  const writes = outputs.writes;
  const archetype = descriptor.identity && descriptor.identity.archetype;
  const reads = descriptor.inputs && descriptor.inputs.reads && Array.isArray(descriptor.inputs.reads.tables)
    ? descriptor.inputs.reads.tables : [];
  const checks = Array.isArray(descriptor.checks) ? descriptor.checks : [];
  writes.forEach((w, i) => {
    const at = `  /outputs/writes/${i}`;
    if (w.derive) {
      if (i === 0) findings.push(`${at}: derive is not legal on the primary write (writes[0]); a derived target follows it (R-DY)`);
      if (archetype !== 'INGESTOR') findings.push(`${at}: derive is legal only on an INGESTOR (identity.archetype is ${JSON.stringify(archetype)}) (R-DY)`);
      if (i > 0 && w.derive.from !== writes[0].table) {
        findings.push(`${at}: derive.from "${w.derive.from}" must equal outputs.writes[0].table "${writes[0].table}" — the prior state is the primary's (R-DY)`);
      }
      const declared = reads.filter((r) => r && r.table === w.derive.from).flatMap((r) => (Array.isArray(r.columns) ? r.columns : []));
      const missing = (w.derive.prior_columns || []).filter((c) => !declared.includes(c));
      if (missing.length) {
        findings.push(`${at}: derive.prior_columns [${missing.join(', ')}] are not declared in inputs.reads.tables["${w.derive.from}"].columns — the prior read is a declared self-read (R-DY (b))`);
      }
    }
    if (w.on_error === 'warn_row') {
      if (!w.derive) findings.push(`${at}: on_error "warn_row" is legal only on a derived target (derive declared); a primary failure stays fatal (R-DM)`);
      const live = w.on_error_why && w.on_error_why.liveness;
      if (!live || live === 'none' || live.kind !== 'check') {
        findings.push(`${at}: on_error "warn_row" needs on_error_why.liveness {kind:"check", ref} naming the WARN check that reads written.e${i}.errors (R-DM)`);
      } else {
        const c = checks.find((x) => x && x.id === live.ref);
        if (!c) findings.push(`${at}: on_error_why cites check "${live.ref}", which is not a declared checks[].id (R-DM)`);
        else if (c.severity !== 'WARN' || String(c.limit).replace(/\s+/g, ' ').trim() !== 'viol == 0') {
          findings.push(`${at}: on_error_why cites check "${live.ref}" (severity ${c.severity}, limit ${JSON.stringify(c.limit)}); it must be a WARN check bounded at exact zero "viol == 0" (R-DM)`);
        }
      }
    }
    const seen = (w.columns || []).filter((c) => c.written === 'seen').map((c) => c.name);
    if (seen.length > 1) findings.push(`${at}: ${seen.length} columns declare written "seen" (${seen.join(', ')}); at most one per target (R-DZ)`);
    const keys = Array.isArray(w.key) ? w.key : [w.key];
    const guard = w.write_discipline && Array.isArray(w.write_discipline.guard_columns) ? w.write_discipline.guard_columns : [];
    for (const name of seen) {
      if (keys.includes(name)) findings.push(`${at}: the written "seen" column "${name}" is a key column (R-DZ)`);
      if (guard.includes(name)) findings.push(`${at}: the written "seen" column "${name}" is listed in guard_columns; a seen column is never guarded (R-DZ)`);
    }
  });
  const invalidates = Array.isArray(outputs.invalidates) ? outputs.invalidates : [];
  invalidates.forEach((e, i) => {
    if (!e || e.by !== 'set_null_unless' || !e.set_null_unless) return;
    const target = writes.find((w) => w.table === e.table);
    const col = target && (target.columns || []).find((c) => c.name === e.set_null_unless.column);
    if (!target || !col || (col.written || 'step') !== 'step') {
      findings.push(`  /outputs/invalidates/${i}: set_null_unless.column "${e.set_null_unless.column}" must be a written:"step" column of the write target "${e.table}" (R-EA)`);
    }
  });
}

/**
 * RE-FREEZE #37 (Spec 124 R-EH, wave-4 Q-MZ) — the cross-target rules of the MATERIALIZER ROWS arm that AJV cannot
 * express. Returns the findings (each names the field and the index), so a test can read them without AJV.
 *   materialize_form "rows": materialize_source declared, its table one of inputs.reads.tables and never a lookup;
 *   retract "replace_keys": class link_full_retraction, under "rows", immediately followed by a guarded_upsert on the
 *                 same table;
 *   write_discipline.rows "compute": class set_based_scoped, under "rows";
 *   key_prefix: under "rows", on a key column of its target.
 */
function materializeRowsFindings(descriptor) {
  const findings = [];
  const e = descriptor.execution && typeof descriptor.execution === 'object' ? descriptor.execution : {};
  const rowsForm = e.materialize_form === 'rows';
  const reads = descriptor.inputs && descriptor.inputs.reads && Array.isArray(descriptor.inputs.reads.tables)
    ? descriptor.inputs.reads.tables : [];
  if (rowsForm) {
    const src = e.materialize_source;
    if (!src) findings.push('  /execution: materialize_form "rows" requires execution.materialize_source (R-EH)');
    else {
      const read = reads.find((r) => r && r.table === src.table);
      if (!read) findings.push(`  /execution/materialize_source: table "${src.table}" is not one of inputs.reads.tables (R-EH)`);
      else if (read.role === 'lookup') findings.push(`  /execution/materialize_source: table "${src.table}" is declared role "lookup"; the source is paged, a lookup is read once (R-EH)`);
    }
  }
  const writes = descriptor.outputs && descriptor.outputs !== 'none' && Array.isArray(descriptor.outputs.writes) ? descriptor.outputs.writes : [];
  writes.forEach((w, i) => {
    const at = `  /outputs/writes/${i}`;
    const wd = w.write_discipline || {};
    if (w.retract === 'replace_keys') {
      if (!rowsForm) findings.push(`${at}: retract "replace_keys" is legal only under execution.materialize_form "rows" (R-EH)`);
      if (wd.class !== 'link_full_retraction') findings.push(`${at}: retract "replace_keys" is legal only on class link_full_retraction (got ${JSON.stringify(wd.class)}) (R-EH)`);
      const next = writes[i + 1];
      if (!next || next.table !== w.table || !next.write_discipline || next.write_discipline.class !== 'guarded_upsert') {
        findings.push(`${at}: retract "replace_keys" must be immediately followed by a guarded_upsert on "${w.table}" (the replace is a delete-then-insert pair) (R-EH)`);
      }
    }
    if (wd.rows === 'compute') {
      if (!rowsForm) findings.push(`${at}: write_discipline.rows "compute" is legal only under execution.materialize_form "rows" (R-EH)`);
      if (wd.class !== 'set_based_scoped') findings.push(`${at}: write_discipline.rows "compute" is legal only on class set_based_scoped (got ${JSON.stringify(wd.class)}) (R-EH)`);
    }
    if (wd.key_prefix) {
      if (!rowsForm) findings.push(`${at}: write_discipline.key_prefix is legal only under execution.materialize_form "rows" (R-EH)`);
      const keys = Array.isArray(w.key) ? w.key : [w.key];
      if (!keys.includes(wd.key_prefix.column)) findings.push(`${at}: write_discipline.key_prefix.column "${wd.key_prefix.column}" is not a key column of "${w.table}" (R-EH)`);
    }
  });
  return findings;
}

/**
 * The SEMANTIC rules — everything true of a descriptor that JSON Schema cannot say
 * because it needs a cross-reference between two fields, or a shorthand expanded first.
 * Run AFTER AJV, so a structurally broken descriptor reports its shape errors rather
 * than throwing here on a field that does not exist yet.
 */
function semanticFindings(descriptor) {
  const findings = [];
  assertNoRunClockGuard(descriptor, findings);
  assertGrandfathered(descriptor, findings);
  assertNoRetraction(descriptor, findings);
  assertBannedScalarFields(descriptor, findings);
  assertInvalidatesTargetMatchesWrite(descriptor, findings);
  assertMaterialityDeclared(descriptor, findings);
  assertRefreeze37Forms(descriptor, findings);
  findings.push(...materializeRowsFindings(descriptor));
  return findings;
}

/**
 * Validate a descriptor, or THROW. Never returns a boolean — a caller that can
 * ignore the result is a caller that will.
 *
 * @param {object} descriptor
 * @returns {object} the same descriptor, for chaining
 */
function validateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new Error('pipeline.step: descriptor must be an object (got ' + typeof descriptor + ')');
  }
  const slug = descriptor.identity && descriptor.identity.name ? descriptor.identity.name : '(no identity.name)';
  const validate = stepValidator();
  if (!validate(descriptor)) {
    const errors = (validate.errors || []).map(formatError).join('\n');
    const err = new Error(
      `pipeline.step: descriptor for "${slug}" does not satisfy step.schema.json:\n${errors}`,
    );
    err.validationErrors = validate.errors || [];
    throw err;
  }
  const findings = semanticFindings(descriptor);
  if (findings.length > 0) {
    const err = new Error(
      `pipeline.step: descriptor for "${slug}" satisfies step.schema.json but violates a semantic rule `
      + `AJV cannot express:\n${findings.join('\n')}`,
    );
    err.semanticFindings = findings;
    throw err;
  }
  return descriptor;
}

module.exports = {
  SCHEMA_PATH,
  GRANDFATHERED_PATH,
  loadSchema,
  loadGrandfathered,
  compileStepSchema,
  collectExtensionKeywords,
  effectiveGuardColumns,
  assertNoRetraction,
  assertBannedScalarFields,
  assertGrandfathered,
  assertInvalidatesTargetMatchesWrite,
  assertMaterialityDeclared,
  assertRefreeze37Forms,
  materializeRowsFindings,
  semanticFindings,
  validateDescriptor,
  GRANDFATHERED_VALUE_PATHS,
  GUARD_PATH,
  CLASS_PATH,
};
