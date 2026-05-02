// TEMPORARY DIAGNOSTIC INSTRUMENTATION — remove once the post-onboarding
// "Maximum update depth exceeded" loop on /(app) is identified and fixed.
//
// Tracks render counts, effect fires (with dep diffs), and Zustand mutations
// so the loop's origin can be identified from Metro / `adb logcat | grep
// ReactNativeJS`. LogBox is disabled in _layout.tsx, so these logs do NOT
// appear as on-screen toasts — Metro/logcat only.
//
// Output legend:
//   [render] <Tag> #<n>           → component rendered (every 5 after the first 10)
//   [effect] <Tag> fire#<n>: ...  → effect ran; lists which dep changed
//   [store:<name>] <field>: a → b → Zustand mutation by field
//   [LOOP-DETECTED] ...           → >30 events for one tag in last 1s (logged once)
//
// To remove: delete this file, drop the trackRender/useDepsTracker calls in
// the 6 patched files, and the wireStoreLogging() call in app/_layout.tsx.

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
export function useDepsTracker(tag: string, deps: unknown[]): void {
  const prevDeps = useRef<unknown[] | null>(null);
  const fireCount = useRef(0);

  useEffect(() => {
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
  const lines: string[] = ['=== LOOP DETECTOR SNAPSHOT ==='];
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
  if (wired) return;
  wired = true;
  subscribeStore('auth', useAuthStore as unknown as SubscribableStore<object>);
  subscribeStore('filter', useFilterStore as unknown as SubscribableStore<object>);
  subscribeStore('onboarding', useOnboardingStore as unknown as SubscribableStore<object>);
  subscribeStore('paywall', usePaywallStore as unknown as SubscribableStore<object>);
  subscribeStore('userProfile', useUserProfileStore as unknown as SubscribableStore<object>);
  subscribeStore('notification', useNotificationStore as unknown as SubscribableStore<object>);
  console.log('[loopDetector] store subscriptions wired');
}
