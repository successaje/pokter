import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';

import './globals.css';
import { Nav, MobileNav } from '@/components/shell/Nav';

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
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Nav />

        <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl px-5 pb-24 pt-8 sm:px-8 md:pb-16">
          {children}
        </main>

        <footer className="border-t border-[color:var(--border)] px-5 py-8 sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-3">
            {/* §84. Visible, but not intrusive. */}
            <p className="max-w-3xl text-[11px] leading-relaxed text-[color:var(--text-faint)]">
              Pokter provides information and tooling for evaluating autonomous
              financial agents. Historical performance is not a guarantee of
              future results. You remain responsible for reviewing permissions
              and risks before activating an agent.
            </p>
            <div className="flex gap-4 text-[11px] text-[color:var(--text-muted)]">
              <Link href="/methodology" className="hover:text-[color:var(--text)]">
                Methodology
              </Link>
              <span className="text-[color:var(--text-faint)]">
                Agent data from the ERC-8004 registry via 8004scan
              </span>
            </div>
          </div>
        </footer>

        <MobileNav />
      </body>
    </html>
  );
}
