'use client';

import { useState } from 'react';
import { TRADES } from '@/lib/classification/trades';
import type { AccountType, UserPreferences } from '@/lib/auth/types';

interface OnboardingWizardProps {
  accountType: AccountType;
  onComplete: (preferences: UserPreferences) => void;
}

const STEPS = ['Trades', 'Location', 'Notifications', 'Confirm'];

export function OnboardingWizard({ accountType, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [postalCodes, setPostalCodes] = useState('');
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  const [alertFrequency, setAlertFrequency] = useState<'instant' | 'daily_digest' | 'weekly'>('daily_digest');
  const [emailNotifications, setEmailNotifications] = useState(true);

  function toggleTrade(slug: string) {
    setSelectedTrades((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug]
    );
  }

  function toggleWard(ward: string) {
    setSelectedWards((prev) =>
      prev.includes(ward)
        ? prev.filter((w) => w !== ward)
        : [...prev, ward]
    );
  }

  function handleComplete() {
    const preferences: UserPreferences = {
      trade_filters: selectedTrades,
      postal_codes: postalCodes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      wards: selectedWards,
      alert_frequency: alertFrequency,
      email_notifications: emailNotifications,
      push_notifications: false,
    };
    onComplete(preferences);
  }

  const canProceed = step === 0 ? selectedTrades.length > 0 : true;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((name, i) => (
          <div key={name} className="flex-1">
            <div
              className={`h-1.5 rounded-full transition-colors ${
                i <= step ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
            <p
              className={`text-xs mt-1 ${
                i <= step ? 'text-blue-600 font-medium' : 'text-gray-400'
              }`}
            >
              {name}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Step 0: Trade Selection */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Select Your Trades
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Choose the trades you work in. You&apos;ll see permits that need these services.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TRADES.map((trade) => {
                const selected = selectedTrades.includes(trade.slug);
                return (
                  <button
                    key={trade.slug}
                    onClick={() => toggleTrade(trade.slug)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: trade.color }}
                    />
                    {trade.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Location */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Set Your Area
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Tell us where you work. Leave blank to see all of Toronto.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Postal Code Prefixes (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="M5V, M4K, M6G"
                  value={postalCodes}
                  onChange={(e) => setPostalCodes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Wards (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 25 }, (_, i) => {
                    const ward = String(i + 1).padStart(2, '0');
                    const selected = selectedWards.includes(ward);
                    return (
                      <button
                        key={ward}
                        onClick={() => toggleWard(ward)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {ward}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Notifications */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Notification Preferences
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              How do you want to hear about new leads?
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alert Frequency
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'instant', label: 'Instant', desc: 'Get notified as permits come in' },
                    { value: 'daily_digest', label: 'Daily Digest', desc: 'One email each morning' },
                    { value: 'weekly', label: 'Weekly Summary', desc: 'Once per week' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        alertFrequency === opt.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="frequency"
                        value={opt.value}
                        checked={alertFrequency === opt.value}
                        onChange={() => setAlertFrequency(opt.value as typeof alertFrequency)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                />
                <span className="text-sm text-gray-700">Send email notifications</span>
              </label>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              You&apos;re All Set!
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Here&apos;s a summary of your preferences:
            </p>
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-700">Trades:</span>{' '}
                <span className="text-gray-600">
                  {selectedTrades.length > 0
                    ? selectedTrades
                        .map((s) => TRADES.find((t) => t.slug === s)?.name)
                        .join(', ')
                    : 'None selected'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Areas:</span>{' '}
                <span className="text-gray-600">
                  {postalCodes || selectedWards.length > 0
                    ? [postalCodes, selectedWards.length > 0 ? `Wards ${selectedWards.join(', ')}` : '']
                        .filter(Boolean)
                        .join(' | ')
                    : 'All of Toronto'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Alerts:</span>{' '}
                <span className="text-gray-600">
                  {alertFrequency.replace('_', ' ')}{emailNotifications ? ' + email' : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              Start Finding Leads
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
