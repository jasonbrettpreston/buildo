import type { Metadata } from 'next';
import './globals.css';

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
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
