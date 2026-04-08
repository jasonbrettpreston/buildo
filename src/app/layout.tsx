import type { Metadata } from 'next';
import './globals.css';
import { PostHogProvider } from '@/components/observability/PostHogProvider';

export const metadata: Metadata = {
  title: 'Buildo - Lead Generation for Trades',
  description: 'Discover building permits and connect with construction projects in Toronto',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning><PostHogProvider>{children}</PostHogProvider></body>
    </html>
  );
}
