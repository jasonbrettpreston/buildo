// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.3 (sign-in and sign-up run through Server Actions);
//            Next.js 15 Server Actions: a 'use server' module may export only async functions (anything else fails the build and the page).
//
// MF-46 follow-up · McTest finding (2026-11-12): src/lib/supabase/maxbld-actions.ts exported a constant and a sync helper beside its actions,
// so every page that loads the sign-in form returned 500. This lock scans every file under src/ that starts with the 'use server' directive
// and refuses any export other than an async function or a type. RED: the planted texts below.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src');
const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return e.name === 'tests' || e.name === 'node_modules' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });

/** True when the module starts with the 'use server' directive (comments and blank lines before it allowed). */
const isServerModule = (src: string): boolean => /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use server['"]/.test(src);

/** Every export line that is not an async function or a type. */
export const badExports = (src: string): string[] =>
  src
    .split('\n')
    .filter((l) => /^export\b/.test(l))
    .filter((l) => !/^export\s+(?:async\s+function\b|type\b|interface\b)/.test(l));

describe("'use server' modules export only async functions (and types)", () => {
  it('every server-action module under src/ is clean', () => {
    const files = walk(ROOT).filter((f) => isServerModule(fs.readFileSync(f, 'utf8')));
    expect(files.length).toBeGreaterThan(1);
    const found = files.flatMap((f) => badExports(fs.readFileSync(f, 'utf8')).map((l) => `${path.relative(process.cwd(), f)}: ${l}`));
    expect(found).toEqual([]);
  });
  it('RED: a constant, a sync function, a class and a re-export are caught; an async function and a type are not', () => {
    const planted = ["'use server';", 'export const RECOVERY_WINDOW_S = 3600;', 'export function fromRecovery() {}', 'export class X {}', "export { a } from './a';",
      'export async function ok() {}', 'export type T = string;', 'export interface I { a: string }'].join('\n');
    expect(isServerModule(planted)).toBe(true);
    expect(badExports(planted)).toEqual(['export const RECOVERY_WINDOW_S = 3600;', 'export function fromRecovery() {}', 'export class X {}', "export { a } from './a';"]);
  });
});
