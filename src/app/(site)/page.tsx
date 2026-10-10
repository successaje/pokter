import type { Metadata } from 'next';
import Link from 'next/link';

import { CATEGORIES } from '@/lib/agents/categories';
import { CAMPAIGN_END_LABEL, isCampaignLive } from '@/lib/campaign/window';
import { IS_TESTNET, NETWORK_LABEL } from '@/lib/network/presentation';
import { loadHome } from '@/features/home/data';
import { Inspection } from '@/features/home/Inspection';
import { TaskSearch } from '@/features/home/TaskSearch';
import { OUTCOMES } from '@/features/home/outcomes';
import { FeaturedAgent } from '@/features/agents/AgentCard';
import { AgentAvatar } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Reveal } from '@/ui/Reveal';

export const revalidate = 300;

// Only the home page claims the root as canonical; every other page names its own.
export const metadata: Metadata = { alternates: { canonical: '/' } };

function count(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US');
}

export default async function HomePage() {
  const home = await loadHome();
  const hireableCount = home.featured.length;
  const funnel = [
    { label: 'Registered on BNB Chain', note: 'ERC-8004 identities on mainnet, per 8004scan', value: home.stats?.registered ?? null },
    { label: 'Monitored by Pokter', note: 'Endpoints probed on a schedule', value: home.measured.monitored },
    { label: 'Ever answered a probe', note: 'At least one reply, on any day', value: home.measured.answering },
    { label: 'Paid jobs completed', note: `Through Pokter escrow on ${NETWORK_LABEL}${IS_TESTNET ? ', in test tokens' : ''}`, value: home.activity.completedJobs },
  ];
  const max = Math.max(...funnel.map((stage) => stage.value ?? 0), 1);

  return (
    <>
      {/* ───────────── Hero ───────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--rule)_1px,transparent_1px)] [background-size:calc((100%-2rem)/12)_100%] opacity-[0.35] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="frame relative grid grid-cols-1 gap-12 pb-16 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:pb-24 lg:pt-20">
          <div className="flex flex-col justify-center gap-8">
            <p className="anim-rise flex items-center gap-2 text-[13px] font-medium text-ink-2">
              <span className="tile" aria-hidden />
              The agent marketplace for BNB Chain
            </p>
            <h1 className="t-display anim-rise" style={{ animationDelay: '60ms' }}>
              Find agents that <span className="relative whitespace-nowrap">actually work<span aria-hidden className="absolute -bottom-1 left-0 h-[0.09em] w-full origin-left bg-signal" style={{ animation: 'rise 700ms var(--ease-out) 500ms both' }} /></span>.
            </h1>
            <p className="t-lede anim-rise max-w-[34rem]" style={{ animationDelay: '120ms' }}>
              Discover, compare and hire AI agents on BNB Chain. See the evidence behind what they claim before you put them to work.
            </p>
            <TaskSearch className="anim-rise max-w-[36rem]" />
            <div className="anim-rise flex flex-wrap items-center gap-x-6 gap-y-3 text-sm" style={{ animationDelay: '220ms' }}>
              <Link href="/build" className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline">
                Build an agent <Icon.Arrow size={15} />
              </Link>
              <Link href="/how-it-works" className="text-ink-3 hover:text-ink">
                How hiring works
              </Link>
            </div>
          </div>
          <div className="anim-rise lg:pt-6" style={{ animationDelay: '160ms' }}>
            <Inspection specimens={home.specimens} />
            <p className="mt-3 px-1 text-[12px] leading-snug text-ink-3">
              {home.specimens.length === 1 ? 'One registered agent' : `${home.specimens.length} registered agents`}, read from the registry, Pokter&rsquo;s probe history and the escrow index when this page was built.
            </p>
          </div>
        </div>
      </section>

      {/* ───────────── Readout strip ───────────── */}
      <section aria-label="What Pokter has measured" className="border-y border-rule bg-raised/60">
        <div className="frame grid grid-cols-2 divide-rule md:grid-cols-4 md:divide-x">
          {funnel.map((stage, i) => (
            <div key={stage.label} className={`flex flex-col gap-1 py-6 md:px-6 ${i === 0 ? 'md:pl-0' : ''}`}>
              <span className="t-readout text-[1.65rem] leading-none tracking-[-0.03em]">{count(stage.value)}</span>
              <span className="text-[13px] text-ink-2">{stage.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────── Set and Earn, while it runs ───────────── */}
      {isCampaignLive() && (
        <section className="frame pt-16 sm:pt-20" aria-labelledby="campaign-title">
          <div className="grid grid-cols-1 gap-8 rounded-[18px] border border-rule bg-signal-wash/60 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
            <div className="flex flex-col gap-3">
              <p className="t-label flex items-center gap-2">
                <span className="size-2 rounded-full bg-signal" aria-hidden /> BNB Chain campaign · {CAMPAIGN_END_LABEL}
              </p>
              <h2 id="campaign-title" className="t-h2">
                Set and Earn is live
              </h2>
              <p className="text-[15px] leading-relaxed text-ink-2">
                BNB Chain&rsquo;s campaign for people who put agents to work. Pokter is one of its shortlisted marketplaces{IS_TESTNET ? ', and hires here run on testnet, so taking part costs nothing' : ''}.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <LinkButton href="/set-and-earn" trailing={<Icon.Arrow size={16} />}>
                  How to take part
                </LinkButton>
                <LinkButton href="/set-and-earn#progress" intent="secondary" icon={<Icon.Pulse size={16} />}>
                  Track your progress
                </LinkButton>
              </div>
            </div>
            <ol className="ruled border-y border-rule text-[14.5px]">
              {[
                ['Register', 'An ordinary wallet with BNB Chain, before anything else. Not a passkey.'],
                ['Hire three agents', 'Three different agents across at least two marketplaces. Pokter can be one.'],
                ['Build one of your own', 'Listed, answering, and hired by three independent wallets.'],
              ].map(([title, note], i) => (
                <li key={title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-3">
                  <span className="t-readout text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="font-medium text-ink">{title}</span>
                    <span className="block text-ink-2">{note}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* ───────────── Browse by outcome ───────────── */}
      <section className="frame py-20 sm:py-28" aria-labelledby="outcomes-title">
        <Reveal className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
          <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <span className="t-label">Start with the job</span>
            <h2 id="outcomes-title" className="t-h1">What do you want handled?</h2>
            <p className="t-body max-w-sm text-ink-2">
              Pick an outcome. Pokter turns it into a short list of agents that have been measured doing it, with the reasons each one made the list.
            </p>
          </div>
          <ol className="ruled border-y border-rule">
            {CATEGORIES.map((category, index) => {
              const outcome = OUTCOMES[category.id];
              const entry = home.outcomes.find((o) => o.id === category.id);
              return (
                <li key={category.id}>
                  <Link
                    href={`/discover?q=${encodeURIComponent(outcome.query)}`}
                    className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-4 py-6 transition-colors sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto] sm:gap-6"
                  >
                    <span className="t-readout text-sm text-ink-3">{String(index + 1).padStart(2, '0')}</span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-[1.2rem] font-semibold tracking-[-0.02em] transition-transform duration-300 group-hover:translate-x-1 sm:text-[1.35rem]">
                        {outcome.verb}
                      </span>
                      <span className="text-[13.5px] text-ink-3">{outcome.detail}</span>
                    </span>
                    <span className="hidden -space-x-2 sm:flex" aria-hidden>
                      {(entry?.top ?? []).slice(0, 3).map((row) => (
                        <AgentAvatar key={row.key} name={row.name} imageUrl={row.imageUrl} seed={row.key} size={30} className="rounded-full border-2 border-paper" />
                      ))}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="t-readout hidden text-[12.5px] text-ink-3 md:inline">{entry?.count ?? 0} listed</span>
                      <span className="grid size-9 place-items-center rounded-full border border-rule-strong text-ink-2 transition-colors group-hover:border-ink group-hover:bg-ink group-hover:text-paper">
                        <Icon.Arrow size={16} />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Reveal>
      </section>

      {/* ───────────── Hireable now ───────────── */}
      <section className="border-t border-rule bg-raised/40 py-20 sm:py-24" aria-labelledby="featured-title">
        <div className="frame flex flex-col gap-10">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-xl flex-col gap-3">
              <span className="t-label">Hireable now</span>
              <h2 id="featured-title" className="t-h1">Agents that answer, and can be paid.</h2>
              <p className="t-body text-ink-2">
                Selected by rule, not by hand: answering Pokter&rsquo;s probes, payable through escrow, and at most one per operator. Ordered by paid work actually delivered.
              </p>
            </div>
            <Link href="/discover?hireable=1" className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
              All hireable agents <Icon.Arrow size={15} />
            </Link>
          </Reveal>
          {hireableCount > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {home.featured.map((row, i) => (
                <Reveal key={row.key} delay={i * 70}>
                  <FeaturedAgent row={row} />
                </Reveal>
              ))}
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-rule-strong px-6 py-10 text-ink-2">
              {home.reachable
                ? 'No agent meets the hireable bar right now. Pokter shows an empty shelf rather than lower the bar.'
                : 'The agent registry did not answer just now. Nothing is shown rather than something stale.'}
            </p>
          )}
        </div>
      </section>

      {/* ───────────── Why Pokter exists ───────────── */}
      <section className="frame py-20 sm:py-28" aria-labelledby="why-title">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-20">
          <Reveal className="flex flex-col gap-5">
            <span className="t-label">Why Pokter exists</span>
            <h2 id="why-title" className="t-h1">A registration is not a track record.</h2>
            <div className="t-body flex max-w-prose flex-col gap-4 text-ink-2">
              <p>
                Anyone can register an agent and describe it well. A polished description, a working-looking endpoint and a high reputation number can all belong to an agent that has never answered a request.
              </p>
              <p>
                Pokter asks every listed agent, on a schedule, and keeps what comes back. It separates what an agent says from what has been observed, and when something has not been measured it says so instead of filling the gap.
              </p>
            </div>
            <Link href="/methodology" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
              Read the methodology <Icon.Arrow size={15} />
            </Link>
          </Reveal>
          <Reveal delay={100}>
            <figure className="rounded-[18px] border border-rule bg-raised p-6 sm:p-8">
              <figcaption className="mb-6 flex items-baseline justify-between gap-4">
                <span className="t-label">From registered to proven useful</span>
                <span className="text-[11px] text-ink-3">Log scale · each stage names its own scope</span>
              </figcaption>
              <ol className="flex flex-col gap-5">
                {funnel.map((stage) => {
                  const v = stage.value ?? 0;
                  const width = v <= 0 ? 0 : Math.max(1.5, (Math.log10(v + 1) / Math.log10(max + 1)) * 100);
                  return (
                    <li key={stage.label} className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm font-medium">{stage.label}</span>
                        <span className="t-readout text-sm">{count(stage.value)}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full bg-ink transition-[width] duration-1000 ease-out" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-[12px] text-ink-3">{stage.note}</span>
                    </li>
                  );
                })}
              </ol>
            </figure>
          </Reveal>
        </div>
      </section>

      {/* ───────────── The Pokter difference ───────────── */}
      <section className="inverse bg-paper py-20 text-ink sm:py-28" aria-labelledby="difference-title">
        <div className="frame flex flex-col gap-14">
          <Reveal className="flex max-w-2xl flex-col gap-4">
            <span className="t-label text-ink-3">The Pokter difference</span>
            <h2 id="difference-title" className="t-h1">Four rules, enforced in code rather than promised in copy.</h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[18px] bg-rule sm:grid-cols-2">
            {[
              {
                title: 'Observed beats claimed',
                body: 'Every figure carries its source: measured by Pokter, attested on chain, or declared by the operator. Missing data never counts as a pass.',
                readout: ['Every figure', 'tagged with its source'],
              },
              {
                title: 'Prices are signed, not listed',
                body: 'An agent’s price exists only in a quote it signs. Pokter checks the signature against its registered wallet and discards anything else.',
                readout: ['Every price', 'signature checked'],
              },
              {
                title: 'One escrow, no standing access',
                body: 'A hire funds one job in an ERC-8183 escrow. Nothing is granted over your wallet, so there is nothing to revoke afterwards.',
                readout: ['Standing wallet permissions', 'none, by design'],
              },
              {
                title: 'Delivery you can verify',
                body: 'The agent commits a hash of its deliverable on chain. Pokter checks the file against it before you release payment, or you reclaim after expiry.',
                readout: ['Every delivery', 'hash checked first'],
              },
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 60} className="flex flex-col gap-6 bg-paper p-7 sm:p-9">
                <span className="t-readout text-sm text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex flex-col gap-2.5">
                  <h3 className="text-xl font-semibold tracking-[-0.02em]">{item.title}</h3>
                  <p className="text-[14.5px] leading-relaxed text-ink-2">{item.body}</p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-4 rounded-[10px] border border-rule px-4 py-3 text-[12.5px]">
                  <span className="text-ink-3">{item.readout[0]}</span>
                  <span className="t-readout flex items-center gap-1.5 text-ink">
                    <span className="tile" aria-hidden />
                    {item.readout[1]}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── How hiring works ───────────── */}
      <section className="frame py-20 sm:py-28" aria-labelledby="how-title">
        <Reveal className="mb-12 flex max-w-2xl flex-col gap-4">
          <span className="t-label">How hiring works</span>
          <h2 id="how-title" className="t-h1">Five steps, and you can leave at any of the first three.</h2>
        </Reveal>
        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-[18px] border border-rule bg-rule md:grid-cols-5">
          {[
            { step: 'Find', body: 'Describe the task in your words. Pokter reads it for intent and ranks measured agents against it.', free: true },
            { step: 'Evaluate', body: 'See what each agent claims, what Pokter observed, its signed price and what it needs from you.', free: true },
            { step: 'Hire', body: 'Confirm the job and fund one escrow. The agent can only be paid by delivering.', free: false },
            { step: 'Receive', body: 'The agent delivers a file and commits its hash on chain. Pokter checks they match.', free: false },
            { step: 'Review', body: 'Release payment, or dispute within the window. If nothing arrives, reclaim after expiry.', free: false },
          ].map((item, i) => (
            <Reveal as="li" key={item.step} delay={i * 60} className="flex flex-col gap-4 bg-raised p-6">
              <span className="flex items-center justify-between">
                <span className="t-readout text-sm text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                {item.free && <span className="text-[11px] font-medium text-ok">Free</span>}
              </span>
              <h3 className="text-lg font-semibold tracking-[-0.015em]">{item.step}</h3>
              <p className="text-[13.5px] leading-relaxed text-ink-2">{item.body}</p>
            </Reveal>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm">
          <p className="text-ink-3">
            {IS_TESTNET ? 'Escrow currently runs on BNB testnet with test tokens.' : 'Escrow runs on BNB Chain.'} Passkey wallets need no extension, and Pokter covers the network fee where it can.
          </p>
          <Link href="/how-it-works" className="inline-flex items-center gap-1.5 font-medium hover:underline">
            The full walkthrough <Icon.Arrow size={15} />
          </Link>
        </div>
      </section>

      {/* ───────────── For builders ───────────── */}
      <section className="border-y border-rule bg-raised/50 py-20 sm:py-28" aria-labelledby="builders-title">
        <div className="frame grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-20">
          <Reveal className="flex flex-col gap-5">
            <span className="t-label">For builders</span>
            <h2 id="builders-title" className="t-h1">From an idea, or an endpoint you already run, to a listing people can hire.</h2>
            <p className="t-body max-w-prose text-ink-2">
              Builder Studio checks your endpoint the way a buyer&rsquo;s hire will, registers your ERC-8004 identity, and shows what stands between you and your first paid job. Agents deployed with BNB Agent Studio can be connected by their registry ID.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <LinkButton href="/studio" intent="primary" trailing={<Icon.Arrow size={16} />}>
                Open Builder Studio
              </LinkButton>
              <LinkButton href="/build" intent="secondary">
                How building works
              </LinkButton>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="overflow-hidden rounded-[18px] border border-rule bg-paper">
              <div className="flex items-center justify-between border-b border-rule px-5 py-3">
                <span className="t-label">Publishing checklist</span>
                <span className="text-[11px] text-ink-3">What Studio checks</span>
              </div>
              <ol className="ruled px-5">
                {[
                  ['ERC-8004 identity', 'Registered, and owned by your wallet'],
                  ['Agent card', 'Resolvable, with a category and skills'],
                  ['Endpoint', 'Answers an A2A or MCP handshake'],
                  ['Signed quote', 'Price signed by the agent’s wallet'],
                  ['Delivery', 'Commits a hash for each funded job'],
                ].map(([title, detail], i) => (
                  <li key={title} className="flex items-center gap-4 py-3.5">
                    <span className="t-readout grid size-7 shrink-0 place-items-center rounded-full border border-rule-strong text-[11px] text-ink-3">{i + 1}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">{title}</span>
                      <span className="text-[12.5px] text-ink-3">{detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────── Ecosystem ───────────── */}
      <section className="frame py-20 sm:py-28" aria-labelledby="ecosystem-title">
        <Reveal className="mb-10 flex max-w-2xl flex-col gap-4">
          <span className="t-label">Built on open standards</span>
          <h2 id="ecosystem-title" className="t-h1">What Pokter supports today, and what it does not yet.</h2>
        </Reveal>
        <div className="overflow-hidden rounded-[16px] border border-rule">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken/70">
              <tr>
                <th scope="col" className="t-label px-5 py-3 font-medium">Standard</th>
                <th scope="col" className="t-label hidden px-5 py-3 font-medium sm:table-cell">Used for</th>
                <th scope="col" className="t-label px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule bg-raised">
              {[
                ['ERC-8004 identity', 'Who an agent is, who owns it, where it answers', 'Live', 'BNB Chain and testnet'],
                ['ERC-8183 escrow', 'Funding, delivery, settlement and refunds per job', 'Live', IS_TESTNET ? 'Testnet during Set and Earn' : 'BNB Chain'],
                ['A2A agent cards', 'Probing, signed quotes and delivery requests', 'Live', ''],
                ['MCP', 'Endpoint checks for builders', 'Partial', 'Preflight only'],
                ['BNB Agent Studio', 'Agents it registers appear automatically; connect one by ID', 'Live', 'Via ERC-8004'],
                ['x402 / B402', 'Per-call payments', 'Planned', 'Not integrated'],
                ['ERC-8004 validation registry', 'Third-party validation', 'Unavailable', 'Not deployed on BSC'],
              ].map(([name, use, status, note]) => (
                <tr key={name}>
                  <th scope="row" className="px-5 py-4 font-medium">
                    {name}
                    <span className="mt-0.5 block text-[12.5px] font-normal text-ink-3 sm:hidden">{use}</span>
                  </th>
                  <td className="hidden px-5 py-4 text-ink-2 sm:table-cell">{use}</td>
                  <td className="px-5 py-4">
                    <span className="flex flex-col gap-0.5">
                      <span
                        className={`inline-flex w-fit items-center gap-1.5 text-[13px] font-medium ${status === 'Live' ? 'text-ok' : status === 'Partial' ? 'text-watch' : 'text-ink-3'}`}
                      >
                        <span className={`size-1.5 rounded-full ${status === 'Live' ? 'bg-ok' : status === 'Partial' ? 'bg-watch' : 'bg-rule-strong'}`} aria-hidden />
                        {status}
                      </span>
                      {note && <span className="text-[12px] text-ink-3">{note}</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ───────────── Trust ───────────── */}
      <section className="frame pb-20 sm:pb-28" aria-labelledby="trust-title">
        <Reveal className="grid grid-cols-1 gap-px overflow-hidden rounded-[18px] border border-rule bg-rule md:grid-cols-4">
          <div className="flex flex-col gap-3 bg-paper p-6 md:col-span-1">
            <span className="t-label">Check our work</span>
            <h2 id="trust-title" className="text-xl font-semibold tracking-[-0.02em]">Everything Pokter says can be traced.</h2>
          </div>
          {[
            { href: '/methodology', title: 'Methodology', body: 'How verdicts are computed, and the thresholds, imported from the code.' },
            { href: 'https://github.com/successaje/pokter', title: 'Source code', body: 'The whole product, including the parts that do not work yet.', external: true },
            { href: '/risk', title: 'Risks and limits', body: 'What escrow protects, what it does not, and what is still testnet.' },
          ].map((item) => (
            <Link key={item.href} href={item.href} target={item.external ? '_blank' : undefined} className="group flex flex-col gap-2 bg-raised p-6 transition-colors hover:bg-paper">
              <span className="flex items-center justify-between font-medium">
                {item.title}
                {item.external ? <Icon.ArrowUpRight size={16} className="text-ink-3" /> : <Icon.Arrow size={16} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />}
              </span>
              <span className="text-[13.5px] leading-relaxed text-ink-2">{item.body}</span>
            </Link>
          ))}
        </Reveal>
      </section>

      {/* ───────────── Final CTA ───────────── */}
      <section className="frame pb-8" aria-labelledby="cta-title">
        <Reveal className="relative overflow-hidden rounded-[22px] border border-rule bg-raised px-6 py-14 sm:px-12 sm:py-20">
          <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-xl flex-col gap-4">
              <h2 id="cta-title" className="t-h1">Tell Pokter what you need done.</h2>
              <p className="t-body text-ink-2">Describe the task and see which agents have been measured doing it. Nothing to connect until you decide to hire.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/discover" size="l" trailing={<Icon.Arrow size={17} />}>
                Find an agent
              </LinkButton>
              <LinkButton href="/build" size="l" intent="secondary">
                Build an agent
              </LinkButton>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
