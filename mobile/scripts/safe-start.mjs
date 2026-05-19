#!/usr/bin/env node
// SPEC LINK: docs/specs/03-mobile/98_mobile_testing_protocol.md §2.2 Boot Sequence
//
// Mobile safe-start preflight. Validates the Windows/Android local
// development prerequisites BEFORE attempting `expo run:android`, so the
// most common failure modes (missing ADB, dead emulator, stale plugin
// resolution) surface as actionable errors rather than 30-second compile
// failures buried in a Gradle log.
//
// Usage:
//   npm run safe-start            (just preflight — does not boot anything)
//   npm run safe-start -- --boot  (preflight + run:android if all green)
//
// Exit code 0 = all green. Non-zero = at least one prerequisite failed.

import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const BOOT = args.includes('--boot');

let failures = 0;
const results = [];

function check(label, fn) {
  try {
    const result = fn();
    results.push({ label, status: 'PASS', detail: result ?? '' });
  } catch (err) {
    failures += 1;
    const message = err instanceof Error ? err.message : String(err);
    results.push({ label, status: 'FAIL', detail: message });
  }
}

function runQuiet(cmd, options = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', cwd: ROOT, ...options }).trim();
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

check('Node version', () => {
  const v = process.versions.node.split('.').map(Number);
  if (v[0] < 18) throw new Error(`Node ${process.versions.node} — Expo SDK 54 requires Node 18+`);
  return `v${process.versions.node}`;
});

check('mobile/package.json present', () => {
  if (!existsSync(resolve(ROOT, 'package.json'))) {
    throw new Error('not in mobile/ — run from mobile directory');
  }
  return 'ok';
});

check('node_modules installed', () => {
  if (!existsSync(resolve(ROOT, 'node_modules', 'expo'))) {
    throw new Error('node_modules missing or incomplete — run `npm install --legacy-peer-deps`');
  }
  return 'expo present';
});

check('@sentry/react-native plugin resolves', () => {
  // The v7 plugin path changed from /app-plugin to top-level. If app.json
  // still references the old path, expo prebuild will fail with
  // "Failed to resolve plugin for module @sentry/react-native/app-plugin".
  const appJson = JSON.parse(readFileSync(resolve(ROOT, 'app.json'), 'utf8'));
  const plugins = appJson?.expo?.plugins ?? [];
  const sentry = plugins.find((p) => {
    const name = Array.isArray(p) ? p[0] : p;
    return typeof name === 'string' && name.includes('sentry/react-native');
  });
  if (!sentry) throw new Error('no @sentry/react-native plugin entry in app.json');
  const sentryName = Array.isArray(sentry) ? sentry[0] : sentry;
  if (sentryName === '@sentry/react-native/app-plugin') {
    throw new Error(
      'app.json references @sentry/react-native/app-plugin (legacy v6 path). ' +
      'In Sentry v7+ use @sentry/react-native (top-level) — fix in mobile/app.json',
    );
  }
  return sentryName;
});

check('ANDROID_HOME or ANDROID_SDK_ROOT set', () => {
  const home = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!home) {
    throw new Error(
      'ANDROID_HOME / ANDROID_SDK_ROOT is not set. Add the Android SDK to your environment ' +
      '(typically C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk on Windows).',
    );
  }
  if (!existsSync(home)) {
    throw new Error(`ANDROID_HOME points at ${home} which does not exist`);
  }
  return home;
});

check('adb on PATH', () => {
  // Spec 98 §6.1 "The Pointing Issues": persistent failures from ADB not
  // being on PATH. The safe-start fails fast here so the user knows to
  // fix their PATH before chasing red-screen Gradle output.
  try {
    const v = runQuiet('adb version');
    return v.split('\n')[0];
  } catch {
    throw new Error('adb not on PATH. Add %ANDROID_HOME%\\platform-tools to System PATH.');
  }
});

check('Android emulator running (adb devices)', () => {
  // Spec 98 §2.2 Step 1: emulator must be booted via Android Studio BEFORE
  // any Expo commands so background ADB daemons initialize correctly.
  const out = runQuiet('adb devices');
  const lines = out.split('\n').slice(1).filter((l) => l.trim().length > 0);
  const online = lines.filter((l) => l.includes('\tdevice'));
  if (online.length === 0) {
    throw new Error(
      'no Android device/emulator detected. Open Android Studio → Device Manager → ' +
      'Play on the Pixel 8 emulator, then re-run safe-start.',
    );
  }
  return `${online.length} device(s) online: ${online.map((l) => l.split('\t')[0]).join(', ')}`;
});

check('Expo prebuild config resolves', () => {
  // Catches plugin resolution errors (Sentry, expo-location, etc.) before
  // the long Gradle compile. `expo config --type prebuild` is a dry-run
  // that exits non-zero on plugin errors.
  try {
    runQuiet('npx expo config --type prebuild', { timeout: 60000 });
    return 'ok';
  } catch (err) {
    const msg = err.stderr?.toString() ?? err.message ?? String(err);
    throw new Error(`expo prebuild config failed:\n${msg.split('\n').slice(0, 5).join('\n')}`);
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('\n--- Mobile safe-start preflight ---\n');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✓' : '✗';
  const detail = r.detail ? `  ${r.detail.split('\n')[0]}` : '';
  console.log(`${icon} ${r.label}${detail}`);
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed — fix above and re-run.\n`);
  process.exit(1);
}

console.log('\nAll checks passed.\n');

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

if (BOOT) {
  console.log('--boot specified → running `npx expo run:android` (will keep Metro open)\n');
  const child = spawn('npx', ['expo', 'run:android'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  console.log('Run `npm run safe-start -- --boot` to compile + launch on the emulator.');
  console.log('Or run `npx expo run:android` directly if you prefer to keep this terminal free.\n');
}
