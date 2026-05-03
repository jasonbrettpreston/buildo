// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §7 (Observability) + §9.5
//
// PERMANENT dev-only state-debug hub. Replaces the temporary `loopDetector.ts`
// that caught the 3 render-loop incidents on 2026-05-02. Per Spec 99 §7.1
// (and §9.5 promotion), the diagnostic stays in the codebase as a regression-
// catching tool — but every export is gated by `__DEV__` so production builds
// compile to no-op stubs. Metro's dead-code elimination strips the body of
// each function call site in release mode; only the empty function shells
// ship in the production bundle.
//
// Output legend (DEV builds, Metro/logcat — LogBox is silenced in _layout.tsx):
//   [render] <Tag> #<n>           → component rendered (every 5 after first 10)
//   [effect] <Tag> fire#<n>: ...  → effect ran; lists which dep changed
//   [store:<name>] <field>: a → b → Zustand mutation by field
//   [LOOP-DETECTED] ...           → >30 events for one tag in last 1s (logged once)
//
// Usage:
//   - Add `trackRender('MyComponent')` at the top of any function component
//   - Add `useDepsTracker('MyEffect.tag', [...sameDeps])` AFTER any useEffect
//     whose stability you want to observe (mirrors the deps array)
//   - Call `wireStoreLogging()` ONCE at app boot (mobile/app/_layout.tsx)
//   - Call `dumpDiagnostics()` from ErrorBoundary.componentDidCatch to log
//     the render/effect counts at the moment of the crash

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useFilterStore } from '@/store/filterStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { usePaywallStore } from '@/store/paywallStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useNotificationStore } from '@/store/notificationStore';

const LOOP_THRESHOLD = 30;
const LOOP_WINDOW_MS = 1000;
const RENDER_LOG_EVERY = 5;

const renderCounts = new Map<string, number>();
const renderWindow = new Map<string, number[]>();
const effectCounts = new Map<string, number>();
const loopDetected = new Set<string>();

function stringify(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undef';
  if (typeof v === 'function') return '<fn>';
  if (typeof v === 'string') return v.length > 40 ? `"${v.slice(0, 40)}..."` : `"${v}"`;
  if (typeof v === 'object') {
    try {
      const json = JSON.stringify(v);
      return json.length > 80 ? `${json.slice(0, 77)}...` : json;
    } catch {
      return `<${(v as object).constructor?.name ?? 'Object'}>`;
    }
  }
  return String(v);
}

function recordWindow(key: string): number {
  const now = Date.now();
  const w = renderWindow.get(key) ?? [];
  w.push(now);
  while (w.length > 0 && now - w[0] > LOOP_WINDOW_MS) w.shift();
  renderWindow.set(key, w);
  return w.length;
}

export function trackRender(tag: string): void {
  if (!__DEV__) return;
  const count = (renderCounts.get(tag) ?? 0) + 1;
  renderCounts.set(tag, count);
  const recent = recordWindow(`render:${tag}`);

  if (recent > LOOP_THRESHOLD && !loopDetected.has(`render:${tag}`)) {
    loopDetected.add(`render:${tag}`);
    console.error(
      `[LOOP-DETECTED] ${tag} rendered ${recent}x in last ${LOOP_WINDOW_MS}ms (total: ${count})`,
    );
  }
  if (count <= 10 || count % RENDER_LOG_EVERY === 0) {
    console.log(`[render] ${tag} #${count}`);
  }
}

// useEffect hook that mirrors the deps of an effect you want to observe.
// Place RIGHT AFTER the real useEffect with the same deps array. Logs
// fire-count + which dep index changed (with stringified before/after).
//
// In production: the hook itself still runs (React requires it for hook-order
// stability), but the body short-circuits via `__DEV__` so no Maps grow and no
// console output is emitted. Cost: one useRef + one no-op useEffect per call.
export function useDepsTracker(tag: string, deps: unknown[]): void {
  const prevDeps = useRef<unknown[] | null>(null);
  const fireCount = useRef(0);

  useEffect(() => {
    if (!__DEV__) return;
    fireCount.current++;
    const changed: string[] = [];
    if (prevDeps.current === null) {
      changed.push('(mount)');
    } else {
      deps.forEach((d, i) => {
        if (!Object.is(d, prevDeps.current![i])) {
          changed.push(`[${i}] ${stringify(prevDeps.current![i])} → ${stringify(d)}`);
        }
      });
    }
    prevDeps.current = [...deps];

    const total = (effectCounts.get(tag) ?? 0) + 1;
    effectCounts.set(tag, total);
    const recent = recordWindow(`effect:${tag}`);

    console.log(`[effect] ${tag} fire#${fireCount.current}: ${changed.join(' | ') || '(no diff)'}`);

    if (recent > LOOP_THRESHOLD && !loopDetected.has(`effect:${tag}`)) {
      loopDetected.add(`effect:${tag}`);
      console.error(
        `[LOOP-DETECTED] effect "${tag}" fired ${recent}x in last ${LOOP_WINDOW_MS}ms (total: ${total})`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function dumpDiagnostics(): string {
  if (!__DEV__) return '';
  const lines: string[] = ['=== STATE-DEBUG SNAPSHOT ==='];
  lines.push('Renders (sorted by total):');
  const renderEntries = [...renderCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of renderEntries) {
    const recent = renderWindow.get(`render:${tag}`)?.length ?? 0;
    lines.push(`  ${tag}: total=${count} last1s=${recent}`);
  }
  lines.push('Effects (sorted by total):');
  const effectEntries = [...effectCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of effectEntries) {
    const recent = renderWindow.get(`effect:${tag}`)?.length ?? 0;
    lines.push(`  ${tag}: total=${count} last1s=${recent}`);
  }
  return lines.join('\n');
}

interface SubscribableStore<T> {
  subscribe: (listener: (state: T, prev: T) => void) => () => void;
}

function subscribeStore<T extends object>(name: string, store: SubscribableStore<T>): void {
  store.subscribe((state, prev) => {
    const changed: string[] = [];
    for (const key of Object.keys(state) as Array<keyof T>) {
      const a = prev[key];
      const b = state[key];
      if (typeof a === 'function' || typeof b === 'function') continue;
      if (!Object.is(a, b)) {
        changed.push(`${String(key)}: ${stringify(a)} → ${stringify(b)}`);
      }
    }
    if (changed.length > 0) {
      console.log(`[store:${name}] ${changed.join(' | ')}`);
    }
  });
}

let wired = false;
export function wireStoreLogging(): void {
  if (!__DEV__) return;
  if (wired) return;
  wired = true;
  subscribeStore('auth', useAuthStore as unknown as SubscribableStore<object>);
  subscribeStore('filter', useFilterStore as unknown as SubscribableStore<object>);
  subscribeStore('onboarding', useOnboardingStore as unknown as SubscribableStore<object>);
  subscribeStore('paywall', usePaywallStore as unknown as SubscribableStore<object>);
  subscribeStore('userProfile', useUserProfileStore as unknown as SubscribableStore<object>);
  subscribeStore('notification', useNotificationStore as unknown as SubscribableStore<object>);
  console.log('[stateDebug] store subscriptions wired');
}
