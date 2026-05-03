// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 11
// Drop-off recovery: step key advances ONLY after the PATCH for that step
// returns 200 — NOT on screen entry. On re-launch with onboarding_complete=false,
// AuthGate resumes at the stored step.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'onboarding-store' });

const mmkvStorage = {
  getItem: (key: string) => {
    try {
      return storage.getString(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      storage.set(key, value);
    } catch {
      /* device out of space — flow still completes in memory */
    }
  },
  removeItem: (key: string) => {
    try {
      storage.remove(key);
    } catch {
      /* best-effort */
    }
  },
};

type OnboardingStep =
  | 'profession'
  | 'path'
  | 'address'
  | 'supplier'
  | 'terms'
  | 'complete'
  | null;

type OnboardingPath = 'leads' | 'tracking' | 'realtor' | null;
type LocationMode = 'home_base_fixed' | 'gps_live' | null;

interface OnboardingState {
  currentStep: OnboardingStep;
  selectedTrade: string | null;
  selectedTradeName: string | null;
  selectedPath: OnboardingPath;
  locationMode: LocationMode;
  homeBaseLat: number | null;
  homeBaseLng: number | null;
  supplierSelection: string | null;

  setStep: (step: OnboardingStep) => void;
  setTrade: (slug: string, name: string) => void;
  setPath: (path: OnboardingPath) => void;
  setLocation: (opts: { mode: LocationMode; lat?: number; lng?: number }) => void;
  setSupplier: (name: string | null) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  currentStep: null as OnboardingStep,
  selectedTrade: null as string | null,
  selectedTradeName: null as string | null,
  selectedPath: null as OnboardingPath,
  locationMode: null as LocationMode,
  homeBaseLat: null as number | null,
  homeBaseLng: null as number | null,
  supplierSelection: null as string | null,
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      setStep: (step) => set({ currentStep: step }),
      setTrade: (slug, name) => set({ selectedTrade: slug, selectedTradeName: name }),
      setPath: (path) => set({ selectedPath: path }),
      setLocation: ({ mode, lat, lng }) =>
        set({
          locationMode: mode,
          homeBaseLat: lat ?? null,
          homeBaseLng: lng ?? null,
        }),
      setSupplier: (name) => set({ supplierSelection: name }),
      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'onboarding',
      storage: createJSONStorage(() => mmkvStorage),
      // Spec 99 §9.2c: bumped from version 0→1 when isComplete +
      // markComplete were removed (server profile.onboarding_complete is
      // now the sole source of truth — Spec 99 §3.5). The migrate function
      // explicitly whitelists known v1 keys, dropping `isComplete` from
      // MMKV-persisted state on existing installs and any future-unknown
      // keys that would otherwise leak through (DeepSeek WF2-B review M4 —
      // forward-compat for §9.3 multi-version migrate chain).
      // Zustand v5 `persist` normalizes a missing version to 0 before calling
      // migrate, so a `version === undefined` arm would be dead code
      // (code-reviewer WF2-B review H1).
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version < 1) {
          const v0 = (persistedState ?? {}) as Partial<OnboardingState>;
          // Whitelist: only known v1 keys survive. `isComplete` is dropped
          // (no longer in OnboardingState shape); any unknown keys also
          // dropped to prevent silent forward-bleed into v2.
          return {
            currentStep: v0.currentStep ?? null,
            selectedTrade: v0.selectedTrade ?? null,
            selectedTradeName: v0.selectedTradeName ?? null,
            selectedPath: v0.selectedPath ?? null,
            locationMode: v0.locationMode ?? null,
            homeBaseLat: v0.homeBaseLat ?? null,
            homeBaseLng: v0.homeBaseLng ?? null,
            supplierSelection: v0.supplierSelection ?? null,
          } as OnboardingState;
        }
        return persistedState as OnboardingState;
      },
    },
  ),
);
