import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';
import { Nav, MobileNav } from '@/components/shell/Nav';
import { Footer } from '@/components/shell/Footer';
import { THEME_SCRIPT } from '@/components/shell/ThemeToggle';
import { WalletProviders } from '@/lib/wallet/Providers';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Pokter — Choose what deserves your money',
  description:
    'Compare autonomous financial agents on BNB Chain using onchain activity, reputation, performance, risk and live execution data.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before paint so the theme never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
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
