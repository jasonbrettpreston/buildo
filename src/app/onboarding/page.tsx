'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import type { AccountType, UserPreferences } from '@/lib/auth/types';

export default function OnboardingPage() {
  const router = useRouter();
  const [accountType] = useState<AccountType>('individual');

  async function handleComplete(preferences: UserPreferences) {
    try {
      // In production, this saves to Firestore via session.ts completeOnboarding()
      console.log('Onboarding complete with preferences:', preferences);
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to save onboarding preferences:', err);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome to Buildo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Let&apos;s set up your preferences to find the best leads
        </p>
      </div>
      <OnboardingWizard accountType={accountType} onComplete={handleComplete} />
    </div>
  );
}
