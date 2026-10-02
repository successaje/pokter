import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import localFont from 'next/font/local';

import './globals.css';
import { Nav, MobileNav } from '@/components/shell/Nav';
import { Footer } from '@/components/shell/Footer';
import { SmoothHashScroll } from '@/components/shell/SmoothHashScroll';
import { WalletProviders } from '@/lib/wallet/Providers';
import { PwaProvider } from '@/components/pwa/PwaProvider';
import { SavedAgentMonitor } from '@/components/saved/SavedAgentMonitor';
import { siteUrl } from '@/lib/site';

/*
 * Three families, each with a job.
 *
 * Until now the stylesheet asked for "Geist" and nothing ever loaded it, so
 * every page has been rendering in whatever sans the system had. These are
 * The files live in this repository and are loaded with next/font/local.
 *
 * They were next/font/google, which self-hosts the *result* but fetches the
 * face from Google during the production build. That fetch failed twice in
 * one week mid-release — "Cannot read properties of null" out of the font
 * loader — on commits that built clean locally and clean on the retry, and
 * one of those left a merge undeployed until somebody noticed by hand. A
 * release that can fail because a third party had a bad second is not a
 * release process, and no amount of retrying fixes the dependency itself.
 *
 * Newsreader and Manrope ship as variable fonts, so one file covers every
 * weight in their range; DM Mono has no variable cut and takes one file per
 * weight. Basic-latin subsets only, which is what the previous setup
 * requested too: 172KB for all five.
 *
 * All three are SIL Open Font License 1.1 — see fonts/OFL.txt.
 *
 * Newsreader carries the display voice. It is the whole reason the design
 * reads as an editorial financial publication rather than a dashboard, and
 * it is used at heading sizes only — a serif at 11px in a dense row is worse
 * than the sans it replaced.
 */
const display = localFont({
  src: [
    { path: './fonts/newsreader-latin.woff2', weight: '500 700', style: 'normal' },
    { path: './fonts/newsreader-italic-latin.woff2', weight: '500 700', style: 'italic' },
  ],
  variable: '--font-display',
  display: 'swap',
});

const sans = localFont({
  src: [
    { path: './fonts/manrope-latin.woff2', weight: '400 700', style: 'normal' },
  ],
  variable: '--font-sans-family',
  display: 'swap',
});

/*
 * DM Mono stops at 500. The mock asks for 600 in places, which a browser can
 * only fake by smearing the glyphs, so those call sites use 500 instead.
 */
const mono = localFont({
  src: [
    { path: './fonts/dm-mono-400-latin.woff2', weight: '400', style: 'normal' },
    { path: './fonts/dm-mono-500-latin.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono-family',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#f0b90b',
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Pokter — The agent marketplace for BNB Chain',
    template: '%s · Pokter',
  },
  description:
    'Compare autonomous financial agents on BNB Chain using onchain identity, reputation, disclosed capabilities and live protocol checks.',
  applicationName: 'Pokter',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pokter',
  },
  formatDetection: {
    telephone: false,
  },
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
  const origin = siteUrl();
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'Pokter',
        url: origin,
        logo: `${origin}/brand/pokter-app-icon-512.png`,
        sameAs: ['https://x.com/usepokter', 'https://github.com/successaje/pokter'],
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: origin,
        name: 'Pokter',
        description: 'The evidence-first marketplace for autonomous financial agents on BNB Chain.',
        publisher: { '@id': `${origin}/#organization` },
        inLanguage: 'en',
      },
    ],
  };

  return (
    <html
      lang="en"
      data-theme={explicit}
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
        />
      </head>
      <body className="antialiased">
        <SmoothHashScroll />
        <PwaProvider>
          <WalletProviders>
            <SavedAgentMonitor />
            <Nav />

            <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl px-5 pb-28 pt-8 sm:px-8 md:pb-16">
              {children}
            </main>

            <Footer />

            <MobileNav />
          </WalletProviders>
        </PwaProvider>
      </body>
    </html>
  );
}
