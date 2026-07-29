// 🔗 SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
//
// Parse-smoke for the Python scraper pair — the same zero-CI-coverage class
// as the load-parcels.js backtick incident (tasks/lessons.md "scripts/ is
// unlinted AND untyped"): python files are invisible to tsc/eslint, so a
// syntax error ships silently and the deep_scrapes chain hard-fails at
// step 1. `py_compile` is parse-only — no module-level code runs (unlike an
// import, which would fire env reads and a DB connect).

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPTS = ['aic-orchestrator.py', 'aic-scraper-nodriver.py'];
const pythonBin = process.platform === 'win32' ? 'python' : 'python3';

describe('AIC python scrapers — parse smoke', () => {
  for (const script of SCRIPTS) {
    it(`${script} compiles (py_compile)`, () => {
      const full = path.resolve(__dirname, '../../scripts', script);
      try {
        execFileSync(pythonBin, ['-m', 'py_compile', full], { stdio: 'pipe' });
      } catch (err) {
        const e = err as NodeJS.ErrnoException & { stderr?: Buffer };
        if (e.code === 'ENOENT') {
          // No python on this box (e.g. a JS-only CI runner) — parse cannot
          // be checked here; the deep-scrapes workflow's own setup-python
          // step is the fallback gate.
          return;
        }
        expect.fail(`${script} failed py_compile:\n${e.stderr?.toString() ?? String(err)}`);
      }
    });
  }

  it('env int reads use the `or`-default form (GH Actions interpolates undefined vars as EMPTY strings, defeating .get() defaults — 2026-07-29 first-cron crash)', () => {
    for (const script of SCRIPTS) {
      const src = fs.readFileSync(path.resolve(__dirname, '../../scripts', script), 'utf-8');
      const bad = src.match(/int\(os\.environ\.get\('[A-Z_]+', '[^']*'\)\)/g);
      expect(bad, `${script} has two-arg .get() int reads (empty-string trap): ${bad?.join(', ')}`).toBeNull();
    }
  });
});
