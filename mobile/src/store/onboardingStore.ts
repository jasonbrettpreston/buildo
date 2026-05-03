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
      // Spec 99 §9.2c: bumped from version undefined→1 when isComplete +
      // markComplete were removed (server profile.onboarding_complete is
      // now the sole source of truth — Spec 99 §3.5). The migrate function
      // strips the legacy `isComplete` key from MMKV-persisted state on
      // existing installs so it doesn't linger forever after upgrade.
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === undefined || version < 1) {
          // v0 had `isComplete: boolean`. Drop it; server is canonical now.
          const { isComplete: _isComplete, ...rest } =
            (persistedState ?? {}) as { isComplete?: boolean } & Partial<OnboardingState>;
          return rest as OnboardingState;
        }
        return persistedState as OnboardingState;
      },
    },
  ),
);
