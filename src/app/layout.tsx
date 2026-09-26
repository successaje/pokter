import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import './globals.css';
import { Nav, MobileNav } from '@/components/shell/Nav';
import { Footer } from '@/components/shell/Footer';
import { WalletProviders } from '@/lib/wallet/Providers';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4311',
  ),
  title: {
    default: 'Pokter — The agent marketplace for BNB Chain',
    template: '%s · Pokter',
  },
  description:
    'Compare autonomous financial agents on BNB Chain using onchain identity, reputation, disclosed capabilities and live protocol checks.',
  applicationName: 'Pokter',
  openGraph: {
    type: 'website',
    siteName: 'Pokter',
    title: 'Pokter — Choose what deserves your money',
    description:
      'Discover, verify, compare and safely hire autonomous financial agents on BNB Chain.',
  },
  twitter: {
    card: 'summary_large_image',
    // Attributes the preview card to the account, so a shared link credits
    // Pokter rather than whoever happened to post it.
    site: '@usepokter',
    creator: '@usepokter',
    title: 'Pokter — Choose what deserves your money',
    description:
      'The evidence-first marketplace for autonomous financial agents on BNB Chain.',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /*
   * The theme is stamped during SSR from a cookie, so the correct palette is
   * in the first byte of HTML. No pre-paint script, therefore no flash and no
   * script element for React to warn about. Absent the cookie the attribute is
   * omitted and CSS falls back to the system preference.
   */
  const theme = (await cookies()).get('pokter-theme')?.value;
  const explicit = theme === 'light' || theme === 'dark' ? theme : undefined;

  return (
    <html lang="en" data-theme={explicit} suppressHydrationWarning>
      <body className="antialiased">
        <WalletProviders>
          <Nav />

          <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl px-5 pb-24 pt-8 sm:px-8 md:pb-16">
            {children}
          </main>

          <Footer />

          <MobileNav />
        </WalletProviders>
      </body>
    </html>
  );
}
