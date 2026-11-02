// SPEC LINK: docs/reports/decisions/2026-10-31-batch-an.json (M-440 six-stage review, M-444 sizing by risk,
//            M-445 the generated sizing decision, M-446 record integrity)
//
// MB-77 (a) — the config module for the McProof sizing generator.
//
// One config shape: `loadConfig(path?)` reads `mcproof.config.json` (beside this module by default) and returns
// `{ values, config_sha }`. Every key not starting `_` must be `{ value, reason }` with a non-empty reason, else
// it throws `config_missing_reason:<key>`; `values[key] = entry.value`, and `config_sha` is the sha16 of the
// canonical JSON of `values`. Everything downstream reads a settled value through `cv(config, key)`, which
// throws `config_key_missing:<key>` — never a literal in code (MCPROOF-10: changing a value is a ruling).
//
// Pure functions, no clock, no environment: the same file yields the same `values` and the same `config_sha`.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The module directory; the default config lives beside this file. */
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The default config path: `mcproof.config.json` beside the module. */
export const DEFAULT_CONFIG_PATH = path.join(HERE, 'mcproof.config.json');

/** Map keys that would reach the prototype chain; never a legal id or map key. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Throw `forbidden_key:<k>` when `value` (at any depth, in an array or an object) carries a forbidden map key.
 * Pure and total: it returns nothing when the value is safe.
 */
export function assertSafeKeys(value) {
  const stack = [value];
  const seen = new Set();
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object') continue;
    if (seen.has(node)) continue;
    seen.add(node);
    if (node instanceof Map) {
      for (const [k, v] of node.entries()) {
        if (FORBIDDEN_KEYS.has(String(k))) throw new Error(`forbidden_key:${String(k)}`);
        stack.push(v);
      }
      continue;
    }
    for (const k of Object.getOwnPropertyNames(node)) {
      if (FORBIDDEN_KEYS.has(k)) throw new Error(`forbidden_key:${k}`);
      stack.push(node[k]);
    }
  }
}

/** A null-prototype object carrying the string keys of `obj`, in their own order. */
function nullProtoMap(obj) {
  const out = Object.create(null);
  for (const k of Object.keys(obj)) out[k] = obj[k];
  return out;
}

/**
 * Canonical JSON: object keys sorted by UTF-16 code unit at every depth, arrays in order, no whitespace.
 * The same value always yields the same string, so its hash is a stable fingerprint.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k]));
  return '{' + parts.join(',') + '}';
}

/** The first 16 hex of the sha256 of a string: the one finger named `sha16`. */
export function sha16(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 16);
}

/** Read a settled value by key; a missing key throws `config_key_missing:<key>`. */
export function cv(config, key) {
  const values = config?.values;
  const has = values !== null && typeof values === 'object' && Object.prototype.hasOwnProperty.call(values, key);
  if (!has || values[key] === undefined) throw new Error(`config_key_missing:${key}`);
  return values[key];
}

/** The sha16 of `{key, value}`: names the exact key and value it covers, so a change moves it and nothing else. */
export function keySha(config, key) {
  return sha16(canonicalJson({ key, value: cv(config, key) }));
}

/**
 * Compare two ids totally: digit runs compare as numbers, other runs by UTF-16 code unit (never
 * `localeCompare`); equal numeric value falls back to the raw UTF-16 comparison of the whole id, so
 * `e09` sorts before `e9` ('0' is code unit 48, '9' is 57) and `e9` before `e10`.
 */
export function compareIds(a, b) {
  const sa = String(a);
  const sb = String(b);
  const ta = tokenize(sa);
  const tb = tokenize(sb);
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i += 1) {
    const x = ta[i];
    const y = tb[i];
    if (x.digit !== y.digit) {
      // A digit run and a text run at the same position: order the whole ids by code unit.
      const raw = sa < sb ? -1 : sa > sb ? 1 : 0;
      if (raw !== 0) return raw;
    }
    if (x.digit && y.digit) {
      const nx = trimZeros(x.text);
      const ny = trimZeros(y.text);
      if (nx !== ny) {
        // Numeric comparison: a longer digit string (leading zeros stripped) is the larger number, and equal
        // lengths compare by code unit.
        if (nx.length !== ny.length) return nx.length < ny.length ? -1 : 1;
        return nx < ny ? -1 : 1;
      }
      // Equal numeric value ('9' vs '09'): fall back to the raw UTF-16 comparison of the whole id, so the
      // order is total and `e09` sorts before `e9` ('0' is code unit 48, '9' is 57).
      const raw = sa < sb ? -1 : sa > sb ? 1 : 0;
      if (raw !== 0) return raw;
    } else if (x.text !== y.text) {
      return x.text < y.text ? -1 : 1;
    }
  }
  if (ta.length !== tb.length) return ta.length < tb.length ? -1 : 1;
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

/** Runs of digits and runs of non-digits, each tagged, so comparison can treat the runs differently. */
function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const digit = s[i] >= '0' && s[i] <= '9';
    let j = i + 1;
    while (j < s.length) {
      const d = s[j] >= '0' && s[j] <= '9';
      if (d !== digit) break;
      j += 1;
    }
    out.push({ digit, text: s.slice(i, j) });
    i = j;
  }
  return out;
}

/** Strip leading zeros from a digit run; an all-zero run becomes '0'. */
function trimZeros(digits) {
  let k = 0;
  while (k < digits.length - 1 && digits[k] === '0') k += 1;
  return digits.slice(k);
}

/** True when `reason` is a non-empty, non-blank string. */
function hasReason(entry) {
  return entry !== null && typeof entry === 'object' && typeof entry.reason === 'string' && entry.reason.trim().length > 0;
}

/**
 * Load the config: default path = `mcproof.config.json` beside this module. Every key not starting `_` must be
 * `{value, reason}` with a non-empty reason, else `config_missing_reason:<key>`. Returns `{values, config_sha}`.
 */
export function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  const rawText = fs.readFileSync(configPath, 'utf8');
  const raw = JSON.parse(rawText);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('config_not_an_object');
  assertSafeKeys(raw);
  const keys = Object.keys(raw).filter((k) => !k.startsWith('_')).sort();
  const values = Object.create(null);
  for (const key of keys) {
    const entry = raw[key];
    if (!hasReason(entry)) throw new Error(`config_missing_reason:${key}`);
    values[key] = entry.value;
  }
  return { values: nullProtoMap(values), config_sha: sha16(canonicalJson(values)) };
}
