// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EO (admin shows whether a setting is in effect),
//            R-DL (admin visibility, derived never hand-listed), R-EF / W4A-R6 (the copy window)
//
// VARIABLE-EFFECT (fast invariant #53; Spec 124 R-EO, operator Q6 y 2026-10-19). A declared logic variable that
// the live step does not read carries an admin badge with a reason:
//   (a) BADGE_CUTOVER "Takes effect at cutover": a pending step is in its COPY WINDOW (descriptor landed at a
//       stage whose legacy shell is still the live step: descriptor_only / compute_ported) and declares the
//       variable; the live legacy script reads <legacy name> (from the copy migration) or a built-in value.
//   (b) BADGE_UNREAD "Not read — scheduled for retirement": no live code reads it and no descriptor declares it.
// Everything is DERIVED — the seeds, converted.json stages, the descriptors, the live code text and the copy
// migrations — never a hand list (the R-DL form). The admin card reads the generated badge file
// src/features/admin-controls/generated/logic-variable-effect.json (scripts/generate-logic-variable-effect.mjs);
// #53 fails when that file and this derivation disagree, i.e. on an unread variable with no badge or a stale one.
//
// "Live code" is every non-test source under scripts/ and src/, minus: the generators that only LIST every key
// (logic-variable groups / docs), the admin UI and admin step descriptions that only render keys, and modules reachable ONLY from a
// copy-window step's new compute (not running yet). A read is a whole-word occurrence of the key, a template
// literal whose static parts match it (`lifecycle_seq_band_${seq}_min`), or a string value in a live descriptor
// (converted, or pending past its copy window). Known limit: a key that is read but has no effect (a console-only
// read) counts as read; such keys are badged at their step's ② when the converted descriptor drops them.
//
// File-only (R-DJ (2)): no DB, no network.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireClosure, RUNNER_ENTRY_FILES } from './compute-closure.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export const BADGE_CUTOVER = 'takes_effect_at_cutover';
export const BADGE_UNREAD = 'not_read_scheduled_for_retirement';
export const BADGE_LABELS = Object.freeze({
  [BADGE_CUTOVER]: 'Takes effect at cutover',
  [BADGE_UNREAD]: 'Not read — scheduled for retirement',
});
/** Pending stages at which a descriptor exists but the legacy shell is still the live step (R-EF, W4A-R6). */
export const COPY_WINDOW_STAGES = Object.freeze(new Set(['descriptor_only', 'compute_ported']));

export const EFFECT_REL = 'src/features/admin-controls/generated/logic-variable-effect.json';
const SEEDS_REL = 'scripts/seeds/logic_variables.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const MANIFEST_REL = 'scripts/manifest.json';
/** Files that only LIST or RENDER keys; a key named there is not read by a step. */
const NON_READER_FILES = new Set(['scripts/generate-logic-variable-groups.mjs', 'scripts/generate-logic-vars-docs.mjs', 'scripts/generate-logic-variable-effect.mjs', 'scripts/analysis/gates/variable-effect.mjs']);
const NON_READER_DIRS = ['src/features/admin-controls/', 'src/lib/admin/control-panel', 'src/lib/admin/funnel.ts'];
const SKIP_DIRS = new Set(['node_modules', 'fixtures', 'generated', 'seeds', 'tests', '__tests__', 'golden', 'red-evidence']);
/** A template counts as a key only when one static part spells two words joined by `_` (`lifecycle_band_`, `_heartbeat_minutes`), so `${a}_${b}` never matches every key. */
const NAMED_PART = /[a-z]+_[a-z]+/;

const descriptorRel = (file) => String(file).replace(/\.(js|py)$/, '') + '.descriptor.json';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function stringsOf(value, acc = []) {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, acc);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) stringsOf(v, acc);
  return acc;
}

/** The variable names a descriptor declares it reads: config.logic_variables plus every *_from_config field. */
function declaredNames(descriptor) {
  const names = new Set(((descriptor && descriptor.config && descriptor.config.logic_variables) || []).map((v) => v.name));
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === 'string' && /_from_config$/.test(k)) names.add(x);
        else walk(x);
      }
    }
  };
  walk(descriptor);
  return names;
}

/**
 * PURE. Copy pairs `{ new_key: old_key }` from the copy migrations' two committed forms:
 * `SELECT '<new>', COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = '<old>'), …)` and a
 * `VALUES ('<new>', '<old>', <default>, …) … AS n(new_key, old_key, …)` table. Commented-out lines (a DOWN
 * block) are ignored.
 */
export function copyPairsFromMigrations(migrations) {
  const pairs = {};
  for (const [, raw] of migrations) {
    const text = raw.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    for (const m of text.matchAll(/SELECT\s+'([a-z0-9_]+)'\s*,\s*COALESCE\s*\(\s*\(\s*SELECT\s+variable_value\s+FROM\s+logic_variables\s+WHERE\s+variable_key\s*=\s*'([a-z0-9_]+)'/gi)) {
      pairs[m[1]] = m[2];
    }
    if (/AS\s+n\s*\(\s*new_key\s*,\s*old_key/i.test(text)) {
      for (const m of text.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*,\s*-?[0-9.]+\s*,/g)) pairs[m[1]] = m[2];
    }
  }
  return pairs;
}

/** PURE. Template literals in source text whose static parts can spell a variable name, as anchored regexes. */
function templatePatterns(text) {
  const out = [];
  for (const m of text.matchAll(/`([^`\n]*\$\{[^`\n]*)`/g)) {
    const parts = m[1].split(/\$\{[^}]*\}/);
    if (!parts.every((p) => /^[a-z0-9_]*$/.test(p))) continue;
    if (!parts.some((p) => NAMED_PART.test(p))) continue;
    out.push(new RegExp('^' + parts.map(escapeRe).join('[a-z0-9_]+') + '$'));
  }
  return out;
}

/**
 * PURE. The R-EO derivation.
 * @param {{seedKeys: string[], pending: Array<{slug,file,stage,descriptor}>, liveDescriptors: object[],
 *          codeTexts: Array<[string,string]>, copyPairs: Record<string,string>, windowOnlyFiles?: Set<string>}} input
 * @returns {{entries: Record<string, {badge, label, reason, step?, legacy_name?}>}}
 */
export function deriveVariableEffect({ seedKeys, pending, liveDescriptors, codeTexts, copyPairs, windowOnlyFiles = new Set() }) {
  const live = codeTexts.filter(([f]) => !windowOnlyFiles.has(f) && !NON_READER_FILES.has(f) && !NON_READER_DIRS.some((d) => f.startsWith(d)));
  const liveText = live.map(([, t]) => t).join('\n');
  const patterns = live.flatMap(([, t]) => templatePatterns(t));
  const liveDescriptorStrings = new Set(liveDescriptors.flatMap((d) => stringsOf(d)));
  const windowSteps = pending.filter((p) => p.descriptor && COPY_WINDOW_STAGES.has(p.stage));
  const declaredByAny = new Set([...liveDescriptors, ...pending.map((p) => p.descriptor).filter(Boolean)].flatMap((d) => [...declaredNames(d)]));

  const isRead = (key) => liveDescriptorStrings.has(key)
    || new RegExp(`(^|[^A-Za-z0-9_])${escapeRe(key)}($|[^A-Za-z0-9_])`).test(liveText)
    || patterns.some((re) => re.test(key));

  const entries = {};
  for (const key of [...seedKeys].sort()) {
    if (isRead(key)) continue;
    const owner = windowSteps.find((p) => declaredNames(p.descriptor).has(key));
    if (owner) {
      const legacy = copyPairs[key] && seedKeys.includes(copyPairs[key]) ? copyPairs[key] : null;
      entries[key] = {
        badge: BADGE_CUTOVER,
        label: BADGE_LABELS[BADGE_CUTOVER],
        step: owner.slug,
        legacy_name: legacy,
        reason: legacy
          ? `${owner.slug} still runs its legacy script, which reads ${legacy}; this value is used from the step's cutover (stage ${owner.stage}).`
          : `${owner.slug} still runs its legacy script, which uses a built-in value; this value is used from the step's cutover (stage ${owner.stage}).`,
      };
    } else if (!declaredByAny.has(key)) {
      entries[key] = {
        badge: BADGE_UNREAD,
        label: BADGE_LABELS[BADGE_UNREAD],
        reason: 'No step or app code reads this setting, so changing it has no effect; it is scheduled for retirement.',
      };
    }
  }
  return { entries };
}

/** PURE. #53: the committed badge file must equal the derivation, key by key (badge, step, legacy name). */
export function checkVariableEffect(derived, committed) {
  const want = derived.entries;
  const have = (committed && committed.entries) || {};
  const violations = [];
  for (const [k, e] of Object.entries(want)) {
    const h = have[k];
    if (!h) violations.push({ key: k, why: `missing badge (${e.badge})` });
    else if (h.badge !== e.badge || (h.step ?? null) !== (e.step ?? null) || (h.legacy_name ?? null) !== (e.legacy_name ?? null)) {
      violations.push({ key: k, why: `badge drift (committed ${h.badge}/${h.legacy_name ?? '-'}, derived ${e.badge}/${e.legacy_name ?? '-'})` });
    }
  }
  for (const k of Object.keys(have)) if (!want[k]) violations.push({ key: k, why: 'stale badge (the setting is in effect)' });
  const counts = Object.values(want).reduce((a, e) => ((a[e.badge] = (a[e.badge] || 0) + 1), a), {});
  return {
    pass: violations.length === 0,
    blockedSlugs: violations.length ? ['(registry)'] : [],
    violations,
    detail: violations.length
      ? `VARIABLE-EFFECT (R-EO): ${violations.length} admin badge(s) out of date — ${violations.map((v) => `${v.key}: ${v.why}`).join('; ')} — run node scripts/generate-logic-variable-effect.mjs`
      : `VARIABLE-EFFECT (R-EO): ${counts[BADGE_CUTOVER] || 0} take effect at cutover, ${counts[BADGE_UNREAD] || 0} not read; admin badges current`,
  };
}

function listCode(root) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = path.posix.join(rel, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(r); }
      else if (/\.(js|mjs|cjs|ts|tsx|py)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(r);
    }
  };
  walk('scripts');
  walk('src');
  return out;
}

/** File-only loader for the real tree. */
export function loadVariableEffect(root = REPO_ROOT) {
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  const seedKeys = Object.keys(JSON.parse(read(SEEDS_REL)));
  const converted = JSON.parse(read(CONVERTED_REL));
  const slugOf = (d, file) => (d && d.identity && d.identity.name) || path.basename(file, '.js');
  const liveDescriptors = [];
  const pending = [];
  for (const e of converted.converted || []) {
    const file = typeof e === 'string' ? e : e.file;
    if (exists(descriptorRel(file))) liveDescriptors.push(JSON.parse(read(descriptorRel(file))));
  }
  for (const p of converted.pending || []) {
    const d = exists(descriptorRel(p.file)) ? JSON.parse(read(descriptorRel(p.file))) : null;
    if (d && !COPY_WINDOW_STAGES.has(p.stage)) liveDescriptors.push(d);
    pending.push({ slug: slugOf(d, p.file), file: p.file, stage: p.stage, descriptor: d });
  }
  // Modules reachable ONLY from a copy-window step's new compute are not running yet.
  const windowCompute = pending
    .filter((p) => p.descriptor && COPY_WINDOW_STAGES.has(p.stage))
    .map((p) => `scripts/lib/compute/${path.basename(p.file)}`)
    .filter(exists);
  const manifest = JSON.parse(read(MANIFEST_REL));
  const liveEntries = [...new Set(Object.values(manifest.scripts || {}).map((s) => s.file).filter((f) => f && /\.js$/.test(f) && exists(f))), ...RUNNER_ENTRY_FILES];
  const liveClosure = new Set(requireClosure(liveEntries, { repoRoot: root, includeEntries: true }).modules);
  const windowOnlyFiles = new Set(requireClosure(windowCompute, { repoRoot: root, includeEntries: true }).modules.filter((f) => !liveClosure.has(f)));
  const codeTexts = listCode(root).map((f) => [f, read(f)]);
  const migrations = fs.readdirSync(path.join(root, 'migrations')).filter((n) => n.endsWith('.sql')).map((n) => [`migrations/${n}`, read(`migrations/${n}`)]);
  return deriveVariableEffect({ seedKeys, pending, liveDescriptors, codeTexts, copyPairs: copyPairsFromMigrations(migrations), windowOnlyFiles });
}

/** The committed badge file's content for a derivation (stable key order). */
export function renderEffectFile(derived) {
  return JSON.stringify({
    $comment: [
      'GENERATED by scripts/generate-logic-variable-effect.mjs — do not hand-edit (Spec 124 R-EO, operator Q6 y 2026-10-19).',
      'One entry per declared logic variable the live step does not read: takes_effect_at_cutover (a pending step in its copy window declares it; the live legacy script reads legacy_name or a built-in value) or not_read_scheduled_for_retirement.',
      'Derived from the seeds, converted.json stages, the descriptors, the live code and the copy migrations (scripts/analysis/gates/variable-effect.mjs); locked by step-validate fast invariant #53.',
    ],
    entries: derived.entries,
  }, null, 2) + '\n';
}
