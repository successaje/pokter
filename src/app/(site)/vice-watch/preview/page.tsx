import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { connection } from 'next/server';

import { viceWatch } from '@/lib/house/agents/vice-watch';
import { readViceSources, VICE_SOURCES } from '@/lib/house/agents/vice-watch-source';

export const metadata: Metadata = { title: 'Vice Watch preview', description: 'A live-source preview of Pokter’s independent GTA VI briefing agent.', robots: { index: false, follow: false } };

export default async function ViceWatchPreview() {
  await connection();
  const snapshot = await readViceSources().catch(() => null);
  const updates = snapshot?.updates ?? [];
  return <main className="frame pb-24 pt-8 sm:pt-12">
    <Link href="/discover?category=research" className="text-[13px] text-ink-2 hover:text-ink">← Discover research agents</Link>
    <div className="mt-7 overflow-hidden rounded-[22px] border border-rule bg-raised">
      <div className="relative min-h-44 overflow-hidden bg-[#151827] p-6 text-white sm:min-h-52 sm:p-9" style={{ backgroundImage: 'radial-gradient(circle at 75% 30%, #dd788d55, transparent 40%), linear-gradient(130deg, #121523, #332640 62%, #604c55)' }}>
        <div className="absolute -bottom-24 right-[-3rem] h-64 w-64 rounded-full border-[32px] border-[#e8a27855] sm:right-12" aria-hidden />
        <p className="relative text-[12px] font-semibold uppercase tracking-[0.18em] text-[#ffd2b8]">Pokter field notes · independent fan tool</p>
        <p className="relative mt-12 max-w-2xl text-[25px] font-semibold leading-tight sm:mt-16 sm:text-[34px]">The sunny side of official GTA VI news.</p>
      </div>
      <div className="grid gap-6 p-6 sm:grid-cols-[88px_minmax(0,1fr)] sm:p-9">
        <Image src="/agents/vice-watch.svg" alt="Vice Watch abstract neon compass icon" width={88} height={88} className="h-[72px] w-[72px] rounded-[18px] sm:h-[88px] sm:w-[88px]" />
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="t-h1">Vice Watch</h1><span className="rounded-full border border-[#c68880] px-2.5 py-1 text-[11px] font-semibold text-[#9f5d5b]">Development preview</span></div>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">A one-time briefing on Rockstar’s latest featured GTA VI posts, release schedule, consoles, preload and storage. Every claim points to an official page. It tells you when a page could not be read.</p>
          <p className="mt-3 text-[12px] text-ink-3">{viceWatch.priceU} units of the selected escrow token per job when registered; a fresh signed quote controls the actual price. Wallet gas may apply. No hire is available from this preview.</p>
        </div>
      </div>
    </div>
    <div className="mt-9 grid gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.7fr)]">
      <section aria-labelledby="live-title" className="rounded-[18px] border border-rule bg-raised p-6 sm:p-8">
        <p className="t-label">Official-source snapshot</p>
        <h2 id="live-title" className="t-h2 mt-2">What Rockstar currently shows</h2>
        {snapshot ? <>
          <p className="mt-2 text-[12px] text-ink-3">Checked {new Date(snapshot.checkedAt).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC · {snapshot.sourceState === 'cached' ? 'Earlier cached snapshot' : 'Live page read'}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[12px] border border-rule bg-sunken p-4"><p className="t-label">Scheduled release</p><p className="mt-2 text-[18px] font-semibold">{snapshot.release?.value.replace('Scheduled for ', '') ?? 'Could not verify'}</p><p className="mt-1 text-[12px] text-ink-3">Schedule can change; this is not confirmation of release.</p></div>
            <div className="rounded-[12px] border border-rule bg-sunken p-4"><p className="t-label">Listed consoles</p><p className="mt-2 text-[16px] font-semibold">{snapshot.platforms?.value ?? 'Could not verify'}</p><p className="mt-1 text-[12px] text-ink-3">From Rockstar’s game page.</p></div>
          </div>
          <h3 className="mt-7 text-[15px] font-semibold">Featured updates</h3>
          {updates.length ? <ul className="mt-3 divide-y divide-rule border-y border-rule">{updates.map((item) => <li key={item.url} className="py-3"><a href={item.url} target="_blank" rel="noopener noreferrer" className="block text-[14px] font-medium underline decoration-rule-strong underline-offset-4 hover:decoration-current">{item.title} ↗</a><p className="mt-1 text-[12px] text-ink-3">{item.publishedAt ?? 'Publication date not shown'}</p></li>)}</ul> : <p className="mt-3 text-[13px] text-ink-2">No readable featured posts were exposed in this check.</p>}
          <p className="mt-4 text-[12px] text-ink-3">Featured posts are a selection, not the full Newswire archive. <a href={VICE_SOURCES.game} className="underline">View Rockstar’s page ↗</a></p>
        </> : <p className="mt-6 rounded-[12px] border border-rule bg-sunken p-4 text-[13px] text-ink-2">Rockstar’s game page could not be checked right now. Vice Watch does not invent a current update; please retry later.</p>}
      </section>
      <aside className="rounded-[18px] border border-rule bg-raised p-6 sm:p-8">
        <p className="t-label">Try asking</p><h2 className="t-h2 mt-2">One clear question</h2>
        <ul className="mt-5 space-y-3 text-[14px] text-ink-2">{viceWatch.skill.examples.slice(0, 4).map((item) => <li key={item} className="rounded-[10px] border border-rule p-3">“{item}”</li>)}</ul>
        <div className="mt-6 border-t border-rule pt-5 text-[13px] leading-relaxed text-ink-2"><p className="font-semibold text-ink">Source limits</p><p className="mt-2">Exact regional preload times and storage require readable Rockstar Support pages. This environment could not reach those pages during development.</p><p className="mt-3">No leaks, rumours, alerts or automatic updates. Independent of Rockstar Games and Take-Two.</p></div>
      </aside>
    </div>
  </main>;
}
