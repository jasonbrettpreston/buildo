/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,tsx}', './src/**/*.{js,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Industrial Utilitarian design tokens
        'bg-feed': '#09090b',        // zinc-950 — primary background
        'bg-card': '#18181b',        // zinc-900 — card surface
        'bg-elevated': '#27272a',    // zinc-800 — elevated surfaces
        'border-subtle': '#3f3f46', // zinc-700 — borders
        'text-primary': '#f4f4f5',  // zinc-100 — primary text
        'text-secondary': '#a1a1aa', // zinc-400 — secondary text
        'text-muted': '#71717a',    // zinc-500 — muted text
        'amber-hardhat': '#f59e0b', // amber-500 — primary accent
        'amber-glow': '#fbbf24',    // amber-400 — highlighted accent
        'red-alert': '#ef4444',     // red-500 — stalled/error
        'green-go': '#22c55e',      // green-500 — good/work window
      },
      fontFamily: {
        mono: ['SpaceMono', 'monospace'],
        sans: ['Inter', 'system-ui'],
      },
    },
  },
  plugins: [],
};
