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

// Spec 99 §3.3 + §9.3: onboardingStore is now ONLY the genuinely-local
// onboarding-flow state (currentStep + selectedPath). All previously-mirrored
// fields (selectedTrade, selectedTradeName, locationMode, homeBaseLat/Lng,
// supplierSelection) live in filterStore (B2-hydrated from server) — the
// duplicates were removed in Spec 99 §9.3 to eliminate dual-source-of-truth
// drift risk.
interface OnboardingState {
  currentStep: OnboardingStep;
  selectedPath: OnboardingPath;

  setStep: (step: OnboardingStep) => void;
  setPath: (path: OnboardingPath) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  currentStep: null as OnboardingStep,
  selectedPath: null as OnboardingPath,
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      setStep: (step) => set({ currentStep: step }),
      setPath: (path) => set({ selectedPath: path }),
      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'onboarding',
      storage: createJSONStorage(() => mmkvStorage),
      // Migration history (Spec 99 §9.2c + §9.3):
      //   v0 → v1: dropped `isComplete` (server profile.onboarding_complete
      //            is now the sole source of truth — Spec 99 §3.5).
      //   v1 → v2: dropped 6 duplicate-mirror fields + their actions
      //            (selectedTrade, selectedTradeName, locationMode,
      //            homeBaseLat/Lng, supplierSelection) per §9.3. filterStore
      //            holds the canonical values, B2-hydrated from server.
      // The migrate function whitelists known v2 keys (currentStep +
      // selectedPath) so all legacy fields are stripped on existing installs.
      // Zustand v5 chains migrates correctly when a v0 user upgrades through
      // v1→v2 — the if-chain runs sequentially per stored version.
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const legacy = (persistedState ?? {}) as Partial<OnboardingState> & {
          // Legacy v0 + v1 fields the migrate must read but not preserve:
          isComplete?: boolean;
          selectedTrade?: string | null;
          selectedTradeName?: string | null;
          locationMode?: string | null;
          homeBaseLat?: number | null;
          homeBaseLng?: number | null;
          supplierSelection?: string | null;
        };
        if (version < 2) {
          // Whitelist: only v2 keys survive. All v0/v1 mirror fields drop.
          return {
            currentStep: legacy.currentStep ?? null,
            selectedPath: legacy.selectedPath ?? null,
          } as OnboardingState;
        }
        return persistedState as OnboardingState;
      },
    },
  ),
);
