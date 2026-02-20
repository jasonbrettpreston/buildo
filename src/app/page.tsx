'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900">Buildo</span>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm text-gray-600 hover:text-gray-900">
              Sign In
            </a>
            <a
              href="/login"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Get Started
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
          Find Construction Leads
          <br />
          <span className="text-blue-600">Before Your Competition</span>
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
          Buildo monitors 237,000+ Toronto building permits daily and matches
          them to your trade. Get notified when new projects need your services.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            View Live Permits
          </button>
          <button
            onClick={() => router.push('/search')}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
          >
            Search Permits
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              title="Daily Sync"
              description="We pull 237K+ permits from Toronto Open Data every morning, detecting new filings and status changes."
            />
            <FeatureCard
              title="Trade Classification"
              description="Our 3-tier engine classifies permits into 20 trades with confidence scores, so you only see relevant leads."
            />
            <FeatureCard
              title="Smart Scoring"
              description="Each lead gets a 0-100 score based on project phase, cost, freshness, and match confidence."
            />
          </div>
        </div>
      </section>

      {/* Trades */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            20 Trade Categories
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              'Excavation', 'Shoring', 'Concrete', 'Structural Steel', 'Framing',
              'Masonry', 'Roofing', 'Plumbing', 'HVAC', 'Electrical',
              'Fire Protection', 'Insulation', 'Drywall', 'Painting', 'Flooring',
              'Glazing', 'Elevator', 'Demolition', 'Landscaping', 'Waterproofing',
            ].map((trade) => (
              <span
                key={trade}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm"
              >
                {trade}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between text-sm text-gray-500">
          <span>Buildo - Toronto Building Permit Leads</span>
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="hover:text-gray-900">Dashboard</a>
            <a href="/search" className="hover:text-gray-900">Search</a>
            <a href="/map" className="hover:text-gray-900">Map</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}
