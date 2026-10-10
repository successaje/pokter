import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import localFont from 'next/font/local';

import './globals.css';
import { CAMPAIGN_BAR_KEY } from '@/lib/campaign/bar';
import { CAMPAIGN_ENDS_AT } from '@/lib/campaign/window';
import { siteUrl } from '@/lib/site';
import { PwaProvider } from '@/shell/PwaProvider';
import { SavedAgentMonitor } from '@/shell/SavedAgentMonitor';

/*
 * One family and a readout face, both self-hosted (SIL OFL 1.1, licences in
 * ./fonts). Instrument Sans is variable in weight and width, so display
 * sizes run it condensed and working sizes at normal width without a
 * second family. JetBrains Mono carries every measurement.
 */
const instrument = localFont({
  src: [{ path: './fonts/instrument-sans.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-instrument',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '75% 100%' }],
});

const jetbrains = localFont({
  src: [{ path: './fonts/jetbrains-mono.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f1eb' },
    { media: '(prefers-color-scheme: dark)', color: '#141517' },
  ],
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Pokter — Find agents that actually work',
    template: '%s · Pokter',
  },
  description:
    'Discover, compare and hire AI agents on BNB Chain. See the evidence behind their capabilities before you put them to work.',
  applicationName: 'Pokter',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Pokter' },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'Pokter',
    title: 'Pokter — Find agents that actually work',
    description: 'Discover, compare and hire AI agents on BNB Chain, with the evidence in plain view.',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@usepokter',
    creator: '@usepokter',
    title: 'Pokter — Find agents that actually work',
    description: 'Discover, compare and hire AI agents on BNB Chain, with the evidence in plain view.',
  },
};

/*
 * Runs once, before first paint, on a full page load only. Two jobs:
 * hide the campaign strip if it was dismissed or the deadline has passed
 * (static pages can be older than the deadline), and mark which hash tab a
 * shared link points at so that tab paints first. The tab CSS is generated
 * per page for its own tab ids, so an unknown id here does nothing.
 */
const BOOT = `(function(){var d=document.documentElement;try{if(Date.now()>${CAMPAIGN_ENDS_AT.getTime()}||localStorage.getItem(${JSON.stringify(CAMPAIGN_BAR_KEY)})==='hidden')d.dataset.campaignBar='hidden';}catch(e){}var h=location.hash.slice(1);if(/^[a-z][a-z0-9-]{0,31}$/.test(h))d.dataset.hashTab=h;})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Stamped from a cookie during SSR so the first byte has the right palette.
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
        description: 'Discover, compare and hire AI agents on BNB Chain.',
        publisher: { '@id': `${origin}/#organization` },
        inLanguage: 'en',
      },
    ],
  };

  return (
    <html lang="en" data-theme={explicit} className={`${instrument.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
        />
      </head>
      <body>
        <PwaProvider>
          <SavedAgentMonitor />
          {children}
        </PwaProvider>
      </body>
    </html>
  );
}
