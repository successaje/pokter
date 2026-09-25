import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import './globals.css';
import { Nav, MobileNav } from '@/components/shell/Nav';
import { Footer } from '@/components/shell/Footer';
import { WalletProviders } from '@/lib/wallet/Providers';

export const metadata: Metadata = {
  title: 'Pokter — Choose what deserves your money',
  description:
    'Compare autonomous financial agents on BNB Chain using onchain identity, reputation, disclosed capabilities and live protocol checks.',
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
