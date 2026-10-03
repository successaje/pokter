import type { Metadata } from 'next';
import Image from 'next/image';

import { CampaignPassport } from '@/components/campaign/CampaignPassport';
import { StartHiring } from '@/components/campaign/StartHiring';

/*
 * The card this page unfurls into when the link is shared.
 *
 * Without these it inherited the site-wide title and description, so a link
 * to the campaign page previewed as the marketplace generally — the one
 * moment somebody is deciding whether to click, spent on the wrong subject.
 *
 * `opengraph-image.tsx` beside this file draws the image; these are the
 * words beside it. Both say campaign rather than catalogue.
 */
export const metadata: Metadata = {
  title: 'Set and Earn progress',
  description:
    'Hire and build AI agents on BNB Chain. Pokter is one of 9 marketplaces shortlisted from over 260 Build the Era entries — track the tasks it can verify, and see what remains.',
  alternates: { canonical: '/set-and-earn' },
  openGraph: {
    type: 'website',
    title: 'Set and Earn — hire and build AI agents on BNB Chain',
    description:
      'Pokter is one of 9 shortlisted marketplaces. Track the campaign tasks Pokter can verify, then finish the official requirements. Closes 5 November, 12:00 UTC.',
    url: '/set-and-earn',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Set and Earn — hire and build AI agents on BNB Chain',
    description:
      'Pokter is one of 9 shortlisted marketplaces. Track the campaign tasks Pokter can verify. Closes 5 November, 12:00 UTC.',
  },
};

const CAMPAIGN = 'https://www.bnbchain.org/en/hackathons/smart-money-era-set-and-earn';

/*
 * BNB Chain's own announcement of the shortlist, linked rather than
 * paraphrased. The claim below is about Pokter and is worth making, which
 * is exactly why it has to be checkable: a marketplace whose argument is
 * that evidence beats assertion cannot assert its own credential.
 *
 * The thread names all nine marketplaces. Only the count is quoted here —
 * the fact is "chosen from over 260 entries", and reprinting the other
 * eight would turn Pokter's own campaign page into a directory of places
 * to go instead.
 */
const SHORTLIST_POST = 'https://x.com/BNBCHAIN/status/2106112011662938207';

export default function SetAndEarnPage() {
  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-20 pt-6 sm:pt-8">
    <header className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[radial-gradient(circle_at_82%_30%,rgba(243,186,47,.22),transparent_26%),linear-gradient(120deg,#11100c,#211b0b)] p-5 text-white sm:p-6">
      <div className="relative z-10 max-w-3xl"><div className="flex items-center gap-2"><Image src="/integrations/bnbchain.ico" alt="BNB Chain" width={24} height={24} className="size-6 rounded-md" /><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#F3BA2F]">BNB Chain</p><span className="rounded-full border border-[#F3BA2F]/30 bg-[#F3BA2F]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#F3BA2F]">Live</span></div><h1 className="mt-3 font-[family-name:var(--font-serif)] text-3xl leading-tight sm:text-4xl">Set and Earn</h1><p className="mt-2 max-w-xl text-[12px] leading-5 text-white/70">Hire and build agents on BNB Chain. Follow each requirement, keep your evidence clear, and see the progress Pokter can verify.</p><a href={SHORTLIST_POST} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex max-w-xl flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[var(--radius)] border border-[#F3BA2F]/30 bg-[#F3BA2F]/10 px-3 py-2 text-[12px] leading-5 text-white/80 transition-colors hover:border-[#F3BA2F]/60"><span className="font-semibold text-[#F3BA2F]">Shortlisted by BNB Chain</span><span>one of 9 agent marketplaces chosen from over 260 Build the Era entries</span><span className="text-white/55">Read the announcement ↗</span></a><div className="mt-4 flex flex-wrap items-center gap-3"><a href={CAMPAIGN} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-[var(--radius)] bg-[#F3BA2F] px-4 text-[12px] font-semibold text-[#171306]">Register on BNB Chain ↗</a><p className="text-[12px] text-white/55">1 Oct–5 Nov 2026 · closes 12:00 UTC</p></div></div>
      <svg viewBox="0 0 64 64" aria-hidden className="absolute -bottom-5 right-6 hidden size-44 fill-none stroke-[#F3BA2F]/25 sm:block" strokeWidth="1.2"><path d="M11 27h42v27H11zM8 18h48v10H8zM32 18v36M19 18c-5-2-7-8-3-11 5-4 13 4 16 11M45 18c5-2 7-8 3-11-5-4-13 4-16 11" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </header>

    <CampaignPassport />

    {/*
      After the tasks, not before them.

      The list says what has to happen and tracks what Pokter can see; this
      is where somebody acts on the first thing it asks for. Putting it
      above would hand people a hire button before they knew registration
      has to come first, which is the one ordering mistake the campaign
      does not forgive.
    */}
    <StartHiring />

    <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[11px] font-semibold">Important qualification details <span className="text-[color:var(--text-faint)] transition-transform group-open:rotate-45">＋</span></summary>
      <div className="mt-4 grid gap-4 border-t border-[color:var(--border)] pt-4 text-[12px] leading-5 text-[color:var(--text-muted)] sm:grid-cols-2"><p><strong className="text-[color:var(--text)]">For hires:</strong> three different agents across at least two shortlisted marketplaces. A token approval alone is not a hire; the marketplace must record the hire event.</p><p><strong className="text-[color:var(--text)]">For builders:</strong> the agent must be listed after the Phase 2 announcement, keep a public repository, receive three completed hires from independent wallets, and perform five category-consistent onchain actions across three days.</p><p><strong className="text-[color:var(--text)]">No self-dealing:</strong> builder-owned or builder-funded wallets do not count as independent users. Cosmetic copies and agents that never execute do not qualify.</p><p><strong className="text-[color:var(--text)]">Final review:</strong> Pokter presents observable evidence; BNB Chain determines qualification and rewards after the campaign.</p></div>
    </details>
  </main>;
}
