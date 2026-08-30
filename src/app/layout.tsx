import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';

import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Proving Ground — hire agents you have watched trade',
  description:
    'A BNB Chain agent marketplace where every number is traced to an on-chain attestation, and unproven agents cannot be hired.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
          <header className="flex items-center justify-between gap-4 border-b border-[color:var(--border)] py-5">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="text-sm font-semibold tracking-tight">Proving Ground</span>
              <span className="hidden text-[11px] text-[color:var(--muted-dim)] sm:inline">
                BNB Agent Studio marketplace
              </span>
            </Link>
            <span className="tabular rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[11px] text-[color:var(--muted)]">
              BSC mainnet · chain 56
            </span>
          </header>

          <main className="flex-1 py-8">{children}</main>

          <footer className="border-t border-[color:var(--border)] py-6 text-[11px] leading-relaxed text-[color:var(--muted-dim)]">
            Evidence is read from the ERC-8004 registry via 8004scan and measured
            live by Proving Ground. Nothing here is investment advice, and a
            passing record is not a promise about future trades.
          </footer>
        </div>
      </body>
    </html>
  );
}
