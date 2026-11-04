import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound, redirect } from 'next/navigation';
import { getAddress, isAddress, type Address } from 'viem';

import { CATEGORY_BY_ID, GENERAL_CATEGORY_LABEL, classify } from '@/lib/agents/categories';
import { getBriefStore } from '@/lib/briefs/store';
import { quotePriceLabel } from '@/lib/find/price';
import { getProbeStore, type QuoteRecord } from '@/lib/history/store';
import { chainLabel, explorerBaseFor } from '@/lib/network/presentation';
import { settlementChainOf } from '@/lib/network/tokens';
import { agentJobs, agentRecord, eligibleReviews, hirerRecord, JOB_STATE_LABEL, operatorRecord, type NetworkRecord } from '@/lib/profiles/evidence';
import { avatarSrc, linkLabel, profileContentOf, profilePath, USAGES, type Profile } from '@/lib/profiles/model';
import { getProfileStore } from '@/lib/profiles/store';
import { resolveAgentImages } from '@/lib/registry/image';
import { registryOwner } from '@/lib/registry/onchain';
import { listAgents } from '@/lib/scan/client';
import { avatarUrl } from '@/lib/ui/avatar-art';
import { cn } from '@/lib/ui/cn';
import { ProfileShell } from '@/features/profile/ProfileShell';
import { ShareButton } from '@/features/profile/ShareButton';
import { AgentAvatar } from '@/ui/Agent';
import { AvatarImage } from '@/ui/AvatarImage';
import { CopyButton } from '@/ui/Data';
import { Icon } from '@/ui/icons';
import { getServiceStore } from '@/lib/services/store';
import { ServiceCard } from '@/features/services/ServiceCard';

export const dynamic = 'force-dynamic';

type View = 'building' | 'hiring';
type Tab = 'overview' | 'agents' | 'services' | 'work' | 'reviews' | 'requests';

/**
 * A wallet, resolved from its handle or its address. A handle resolves
 * only once its profile is published: an unpublished profile's handle is
 * as private as the rest of it.
 */
function resolve(param: string): { wallet: Address; profile: Profile | null } | null {
  const store = getProfileStore();
  if (isAddress(param)) return { wallet: getAddress(param), profile: store.get(param) };
  const profile = store.byHandle(decodeURIComponent(param));
  return profile?.published ? { wallet: getAddress(profile.wallet), profile } : null;
}

const short = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
function renderedAt(): number { return Date.now(); }

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const found = resolve((await params).address);
  if (!found) return { title: 'Profile' };
  const p = found.profile?.published ? found.profile : null;
  const name = p?.displayName || (p?.handle ? `@${p.handle}` : null);
  return {
    title: name ?? `Profile ${short(found.wallet)}`,
    description: p?.bio || `What ${name ?? short(found.wallet)} has done on Pokter, with the evidence behind it.`,
    alternates: { canonical: profilePath(found.wallet, p?.handle) },
    /* Search engines list a profile only when its owner published it and chose to be listed. */
    robots: p?.indexable ? undefined : { index: false, follow: false },
  };
}

/**
 * A person's profile on Pokter, for hiring, building or both.
 *
 * Two kinds of content, never mixed. The identity column is what the
 * person says about themselves, shown only once they publish it. The
 * main area is evidence, each figure defined and scoped: an agent's
 * record is the agent's (under every owner it has had), never added up
 * into the current owner's own track record, and a hirer's record is
 * the jobs this wallet funded. What appears is what the owner chose to
 * publish; an unpublished wallet shows only what the registry says.
 */
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ address: raw }, sp] = await Promise.all([params, searchParams]);
  const now = renderedAt();
  const found = resolve(raw);
  if (!found) notFound();
  const { wallet, profile } = found;
  const published = profile?.published ? profile : null;
  /* One address per published profile: the wallet's URL leads to the handle. */
  if (published?.handle && isAddress(raw)) {
    const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string')).toString();
    redirect(`${profilePath(wallet, published.handle)}${query ? `?${query}` : ''}`);
  }

  /* What the registry says this wallet owns now. A network the index did not answer for is said, not shown as nothing. */
  const pages = await Promise.all([56, 97].map((chainId) => listAgents({ chainId: chainId as 56 | 97, ownerAddress: wallet, limit: 100 }).catch(() => null)));
  const indexUnavailable = pages.some((p) => p === null);
  const owned = pages.flatMap((p) => p?.items ?? []);
  const images = await resolveAgentImages(owned);
  const ownedOptions = owned.map((a, i) => {
    const cat = classify(a);
    return { key: `${a.chain_id}:${a.token_id}`, chainId: a.chain_id, tokenId: a.token_id, name: a.name, description: a.description ?? '', imageUrl: images[i], category: cat === 'unclassified' ? null : (CATEGORY_BY_ID.get(cat)?.label ?? null) };
  });
  const byKey = new Map(ownedOptions.map((o) => [o.key, o]));
  const hiring = hirerRecord(wallet);
  const operator = operatorRecord(wallet);
  const hiringActivity = { requests: hiring.requestsPosted, jobsFunded: hiring.mainnet.funded + hiring.testnet.funded };

  /*
   * The agents the owner chose to show, each checked against the registry
   * now. "Unavailable" when the registry did not answer — never read as
   * "no longer owned"; an agent the registry says is someone else's is
   * left off the page.
   */
  const chosen = published?.showBuilding ? published.agents : [];
  const live = await Promise.all(chosen.map((key) => registryOwner(Number(key.split(':')[0]), key.split(':')[1]).catch(() => null)));
  const shown = chosen
    .map((key, i) => ({ key, status: live[i] === null ? ('unavailable' as const) : live[i] === wallet ? ('owned' as const) : ('elsewhere' as const) }))
    .filter((a): a is { key: string; status: 'owned' | 'unavailable' } => a.status !== 'elsewhere')
    .map((a) => {
      const [chain, token] = a.key.split(':');
      const option = byKey.get(a.key);
      return {
        ...a,
        chainId: Number(chain),
        tokenId: token,
        name: option?.name ?? `Agent #${token}`,
        description: option?.description ?? '',
        imageUrl: option?.imageUrl ?? null,
        category: option?.category ?? null,
        pinned: published!.pinned.includes(a.key),
      };
    })
    .sort((x, y) => Number(y.pinned) - Number(x.pinned));
  const quotes = getProbeStore().quotesFor(shown.map((agent) => ({ chainId: agent.chainId, tokenId: agent.tokenId })));
  const services = published?.showBuilding ? getServiceStore().byBuilder(wallet).filter((service) => service.status === 'active' && shown.some((agent) => agent.status === 'owned' && agent.chainId === service.chainId && agent.tokenId === service.tokenId)) : [];
  const checksSince = new Date(now - 30 * 86_400_000);
  const checks = ([56, 97] as const).map((chainId) => {
    const rows = shown.filter((agent) => agent.chainId === chainId).flatMap((agent) => getProbeStore().historyFor(agent.chainId, agent.tokenId, checksSince));
    return { chainId, total: rows.length, answered: rows.filter((row) => row.ok).length, last: rows.map((row) => row.probedAt).sort().at(-1) ?? null };
  });

  const sections: View[] = published ? [...(published.showBuilding ? (['building'] as const) : []), ...(published.showHiring ? (['hiring'] as const) : [])] : [];
  const preferred: View = published?.usage === 'hire' ? 'hiring' : 'building';
  const view: View = sections.includes(sp.view as View) ? (sp.view as View) : sections.includes(preferred) ? preferred : (sections[0] ?? 'building');
  const tabs: Tab[] = view === 'building' ? ['agents', 'services', 'overview', 'work', 'reviews'] : ['overview', 'requests'];
  const tab: Tab = tabs.includes(sp.tab as Tab) ? (sp.tab as Tab) : view === 'building' ? 'agents' : 'overview';
  const base = profilePath(wallet, published?.handle);
  const href = (v: View, t: Tab) => `${base}?view=${v}&tab=${t}`;

  const reviews = view === 'building' && shown.length > 0 ? eligibleReviews(shown, wallet) : { reviews: [], hidden: 0 };
  const name = published?.displayName || (published?.handle ? `@${published.handle}` : short(wallet));
  const role = published?.usage ? USAGES.find((u) => u.id === published.usage)?.role : null;
  const requests = getBriefStore().byPoster(wallet);
  const theme = published?.theme === 'forest' ? 'bg-[#173d33] text-white' : published?.theme === 'sand' ? 'bg-[#d9c9a8] text-[#222017]' : 'bg-[#191b20] text-white';
  const profileAgents = published ? shown : ownedOptions;
  const profileNetworks = [...new Set(profileAgents.map((agent) => agent.chainId))].sort((a, b) => b - a);

  const identity = (
    <div key="profile-identity" className="flex flex-col gap-4">
      <div className="flex items-center gap-4 lg:flex-col lg:items-start">
        {!published && <AvatarImage src={null} fallback={avatarUrl(wallet.toLowerCase())} name={name} size={88} className="shrink-0 rounded-full" eager />}
        <div className="flex min-w-0 flex-col gap-0.5">
          {!published && <h2 className="break-words text-[clamp(1.5rem,3vw,1.9rem)] font-semibold leading-tight tracking-[-0.02em]"><span className="t-readout">{short(wallet)}</span></h2>}
          {role && <span className="mt-1 w-fit rounded-full bg-sunken px-2.5 py-0.5 text-[12.5px] font-medium text-ink-2">{role}</span>}
        </div>
      </div>
      {published && ((published.bio && published.tagline) || published.tags.length > 0 || published.links.length > 0) && <span className="t-label">Builder-provided</span>}
      {published?.bio && published.tagline && <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-ink-2">{published.bio}</p>}
      {published && published.showBuilding && published.tags.length > 0 && (
        <ul aria-label="Builds" className="flex flex-wrap gap-1.5">
          {published.tags.map((t) => (
            <li key={t} className="rounded-full border border-rule-strong px-2.5 py-0.5 text-[12px] text-ink-2">
              {CATEGORY_BY_ID.get(t)?.label}
            </li>
          ))}
        </ul>
      )}
      {published && published.links.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {published.links.map((link) => (
            <li key={link}>
              <a href={link} target="_blank" rel="nofollow ugc noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-2 hover:text-ink hover:underline">
                <Icon.External size={13} aria-hidden /> {linkLabel(link)}
              </a>
            </li>
          ))}
        </ul>
      )}
      {!published && <p className="text-[13.5px] text-ink-3">No public profile. What follows is what the ERC-8004 registry says about this wallet.</p>}

      <div className="flex flex-wrap gap-2">
        {sections.includes('building') && shown.length > 0 && (
          <Link href={href('building', 'agents')} className="inline-flex h-9 items-center justify-center rounded-[9px] bg-ink px-3 text-[13.5px] font-medium text-paper hover:opacity-90">
            View agents
          </Link>
        )}
        {sections.includes('hiring') && hiring.requestsOpen > 0 && (
          <Link href={href('hiring', 'requests')} className={cn('inline-flex h-9 items-center justify-center rounded-[9px] px-3 text-[13.5px] font-medium', sections.includes('building') && shown.length > 0 ? 'border border-rule-strong text-ink-2 hover:text-ink' : 'bg-ink text-paper hover:opacity-90')}>
            View open requests
          </Link>
        )}
        <ShareButton path={base} title={name} />
      </div>

      {/* What was checked, said exactly. None of it is identity verification or an endorsement. */}
      <ul aria-label="Pokter-observed checks" className="flex flex-col gap-2 border-t border-rule pt-4 text-[12.5px]">
        <li className="t-label">Pokter-observed</li>
        {published && (
          <li className="flex flex-col">
            <span className="inline-flex items-center gap-1 font-medium text-ok">
              <Icon.Check size={13} aria-hidden /> Wallet control verified
            </span>
            <span className="text-ink-3">This wallet signed this profile. That proves who wrote it, not that it is true.</span>
          </li>
        )}
        {shown.some((a) => a.status === 'owned') && (
          <li className="flex flex-col">
            <span className="inline-flex items-center gap-1 font-medium text-ok">
              <Icon.Shield size={13} aria-hidden /> Agent ownership verified
            </span>
            <span className="text-ink-3">For the agents shown: the registry names the wallet that signed this profile as their owner, checked just now.</span>
          </li>
        )}
        {/* The address only when the owner chose to show it; a wallet without a profile has nothing else to be known by. */}
        {(!published || published.showWallet) && (
          <li className="flex items-center gap-2 text-ink-3">
            Wallet <span className="t-readout text-ink-2">{short(wallet)}</span> <CopyButton value={wallet} label="Copy address" />
          </li>
        )}
      </ul>

      {/* Hiring counts live here; the storefront header carries the building summary. */}
      {published && view === 'hiring' && sections.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
          <MiniStat label="Requests posted" value={String(hiring.requestsPosted)} />
          <MiniStat label="Jobs funded" value={`${hiring.mainnet.funded}`} note={`mainnet · ${hiring.testnet.funded} testnet`} />
        </dl>
      )}
      {published && <p className="text-[11.5px] leading-snug text-ink-3">Name, bio, tags and links are self-provided. Pokter does not endorse them or guarantee any agent&rsquo;s performance.</p>}
    </div>
  );

  return (
    <div className="frame pb-24 pt-6 sm:pt-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-[12.5px] text-ink-3">
        <Link href="/discover" className="hover:text-ink">Discover</Link><span aria-hidden>/</span><span>Builders</span><span aria-hidden>/</span><span className="truncate text-ink">{published?.handle ? `@${published.handle}` : short(wallet)}</span>
      </nav>
      {(
        <section className="overflow-hidden rounded-[18px] border border-rule bg-raised" aria-label="Builder storefront header">
          <div className={cn('relative h-28 overflow-hidden sm:h-36', theme)}>
            {published?.cover ? (
              <Image src={avatarSrc(published.cover) ?? ''} alt="" fill unoptimized sizes="(max-width: 768px) 100vw, 1200px" className="object-cover" />
            ) : (
              <div className="absolute inset-0" aria-hidden>
                <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
                <div className="absolute -right-20 -top-64 size-[540px] rounded-full border-[90px] border-current opacity-[0.07]" />
                <div className="absolute -right-20 -top-72 size-[420px] rounded-full border-[60px] border-[#f0b90b] opacity-[0.65]" />
                <div className="absolute -left-36 bottom-[-230px] size-[420px] rounded-full border-[65px] border-current opacity-[0.06]" />
                <span className="absolute bottom-3 right-7 text-[clamp(3rem,9vw,7rem)] font-black uppercase leading-none tracking-[-0.08em] opacity-[0.09]">{published?.handle || 'BNB'}</span>
              </div>
            )}
          </div>
          <div className="relative px-5 pb-4 pt-4 sm:px-7 sm:pb-5">
            <AvatarImage src={avatarSrc(published?.avatar ?? '')} fallback={avatarUrl(wallet.toLowerCase())} name={name} size={92} className="absolute -top-12 left-5 rounded-[18px] border-[4px] border-[var(--raised)] bg-raised shadow-sm sm:left-7" eager />
            <div className="flex flex-col gap-4 pt-10 sm:flex-row sm:items-center sm:justify-between sm:pl-28 sm:pt-1">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3"><h1 className="max-w-3xl break-words text-[clamp(1.8rem,3vw,2.5rem)] font-semibold leading-tight tracking-[-0.04em]">{name}</h1><span className="rounded-full border border-[#d99a11] px-2.5 py-1 text-[11.5px] font-medium text-[#9b6900]">{published ? 'Claimed profile' : 'Unclaimed profile'}</span></div>
                <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{published?.tagline || published?.bio || 'This wallet has not claimed a Pokter profile. Agent associations come from the registry.'}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <ShareButton path={base} title={name} />
                {published?.showBuilding && shown.some((agent) => agent.status === 'owned') ? <Link href={`/workspace/requests/new?builder=${encodeURIComponent(wallet)}`} className="inline-flex h-10 items-center justify-center rounded-[8px] bg-ink px-4 text-[13px] font-medium text-paper hover:opacity-90">Request custom work <Icon.Arrow size={14} className="ml-2" /></Link> : <span className="text-[12px] text-ink-3">{published ? 'Custom requests unavailable' : 'Custom requests after profile claim'}</span>}
              </div>
            </div>
          </div>
        </section>
      )}
      <div className="my-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[12px] border border-rule bg-raised px-5 py-3 text-[13px]">
        <span className="font-semibold">{profileAgents.length} {profileAgents.length === 1 ? 'agent' : 'agents'}</span><span className="hidden text-rule-strong sm:inline" aria-hidden>│</span>
        <span>{profileNetworks.length ? profileNetworks.map((chain) => chainLabel(chain)).join(' · ') : 'No network yet'}</span><span className="hidden text-rule-strong sm:inline" aria-hidden>│</span>
        <span className="text-ink-2">{indexUnavailable ? 'Registry index partly unavailable' : 'Agents from ERC-8004 registry'}</span>
      </div>
      <ProfileShell wallet={wallet} published={published ? profileContentOf(published) : null} hasSaved={Boolean(profile)} agents={ownedOptions} hiringActivity={hiringActivity} identity={identity}>
        {!published ? (
          <RegistryView agents={ownedOptions} unavailable={indexUnavailable} active={sp.tab === 'services' || sp.tab === 'evidence' ? sp.tab : 'agents'} base={base} wallet={wallet} />
        ) : sections.length === 0 ? (
          <Empty title="Nothing shown yet">This profile shows no building or hiring activity.</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule">
            <nav aria-label={`${view === 'building' ? 'Building' : 'Hiring'} tabs`} className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {tabs.map((t) => (
                <Link key={t} href={href(view, t)} aria-current={tab === t ? 'page' : undefined} className={cn('-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[14px] font-medium capitalize', tab === t ? 'border-[#e5a900] text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>
                  {t === 'overview' && view === 'building' ? 'Evidence' : t === 'reviews' ? `Reviews${reviews.reviews.length ? ` (${reviews.reviews.length})` : ''}` : t}
                </Link>
              ))}
            </nav>
            {sections.length > 1 && (
              <nav aria-label="Profile section" className="mb-1 inline-flex w-fit rounded-[10px] bg-sunken p-1">
                {sections.map((s) => (
                  <Link key={s} href={href(s, s === 'building' ? 'agents' : 'overview')} aria-current={view === s ? 'page' : undefined} className={cn('rounded-[7px] px-3 py-1 text-[12.5px] font-medium', view === s ? 'bg-raised text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}>
                    {s === 'building' ? 'Building' : 'Hiring'}
                  </Link>
                ))}
              </nav>
            )}
            </div>

            {view === 'building' && tab === 'overview' && <BuildingOverview agents={shown} wallet={wallet} operator={operator} reviews={reviews} checks={checks} quotes={quotes} now={now} reviewsHref={href('building', 'reviews')} agentsHref={href('building', 'agents')} />}
            {view === 'building' && tab === 'agents' && <AgentsTab agents={shown} wallet={wallet} quotes={quotes} now={now} />}
            {view === 'building' && tab === 'services' && (services.length ? <ul className="grid gap-4 sm:grid-cols-2">{services.map((service) => <li key={service.id}><ServiceCard service={service} /></li>)}</ul> : <Empty title="No published services">This builder has not published a specific offer yet. Browse their agents or request custom work.</Empty>)}
            {view === 'building' && tab === 'work' && <WorkTab agents={shown} wallet={wallet} takenOn={operator.jobIds} />}
            {view === 'building' && tab === 'reviews' && <ReviewsTab data={reviews} />}
            {view === 'hiring' && tab === 'overview' && <HiringOverview record={hiring} requestsHref={href('hiring', 'requests')} />}
            {view === 'hiring' && tab === 'requests' && <RequestsTab requests={requests} />}
          </div>
        )}
      </ProfileShell>
    </div>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[10px] border border-rule bg-raised px-3 py-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className="t-readout text-[16px] text-ink">
        {value} {note && <span className="text-[11px] text-ink-3">{note}</span>}
      </dd>
    </div>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-dashed border-rule-strong px-5 py-6">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="text-[13.5px] text-ink-2">{children}</p>
    </div>
  );
}

type ShownAgent = { key: string; chainId: number; tokenId: string; name: string; description: string; imageUrl: string | null; category: string | null; status: 'owned' | 'unavailable'; pinned: boolean };

/** The default storefront uses only network-specific registry associations. */
function RegistryView({ agents, unavailable, active, base, wallet }: { agents: Array<{ key: string; chainId: number; tokenId: string; name: string; imageUrl: string | null; category: string | null }>; unavailable: boolean; active: 'agents' | 'services' | 'evidence'; base: string; wallet: string }) {
  return <div className="flex flex-col gap-8">
    <nav aria-label="Builder profile sections" className="flex gap-8 border-b border-rule">
      {(['agents', 'services', 'evidence'] as const).map((section) => <Link key={section} href={`${base}?tab=${section}`} aria-label={section === 'agents' ? `Agents (${agents.length})` : section} aria-current={active === section ? 'page' : undefined} className={cn('-mb-px border-b-2 pb-3 text-[14px] font-medium capitalize', active === section ? 'border-[#e5a900] text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>{section}{section === 'agents' && <span className="ml-2 rounded-full bg-[#f8e7b9] px-2 py-0.5 text-[11px] text-[#6a4900]">{agents.length}</span>}</Link>)}
    </nav>
    {active === 'agents' && <section aria-labelledby="registry-title" className="flex flex-col gap-4">
      <div><h2 id="registry-title" className="text-[22px] font-semibold tracking-[-0.025em]">Agents owned by this wallet</h2><p className="mt-1 text-[13px] text-ink-3">Ownership is based on indexed ERC-8004 registry data.</p></div>
      {unavailable && <p className="text-[13px] text-watch">The index did not answer for one network. This list may be incomplete.</p>}
      {agents.length === 0 ? (!unavailable && <Empty title="No agents found">This wallet owns no indexed agents on BNB Chain or testnet.</Empty>) : <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => <li key={a.key}><Link href={`/agents/${a.chainId}/${a.tokenId}`} className="group flex h-full flex-col rounded-[14px] border border-rule bg-raised p-4 transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift">
          <span className="flex min-w-0 items-center gap-3"><AgentAvatar name={a.name} imageUrl={a.imageUrl} seed={a.key} size={48} /><span className="min-w-0"><strong className="block truncate text-[15px]">{a.name}</strong><span className="text-[12.5px] text-ink-3">#{a.tokenId} · {a.category ?? GENERAL_CATEGORY_LABEL}</span></span></span>
          <span className="mt-4 flex items-center justify-between border-t border-rule pt-3 text-[12.5px]"><span className="text-ink-2">{chainLabel(a.chainId)}</span><span className="font-medium text-[#9b6900]">View agent <Icon.Arrow size={13} className="inline-block transition-transform group-hover:translate-x-0.5" aria-hidden /></span></span>
        </Link></li>)}
      </ul>}
    </section>}
    {active === 'services' && <section className="rounded-[14px] border border-rule bg-raised p-6"><h2 className="text-[18px] font-semibold">No published services</h2><p className="mt-1 text-[13.5px] text-ink-2">This wallet has not claimed a profile or published an offer. You can still inspect its agents.</p><Link href={`${base}?tab=agents`} className="mt-4 inline-flex text-[13px] font-medium underline">View agents</Link></section>}
    {active === 'evidence' && <section className="rounded-[14px] border border-rule bg-raised p-6"><h2 className="text-[18px] font-semibold">What Pokter can verify</h2><p className="mt-2 text-[13.5px] text-ink-2">The ERC-8004 index associates the agents shown here with <span className="t-readout">{short(wallet)}</span> by network. The owner has not claimed this profile, and Pokter has not verified a name or published service for it.</p>{unavailable && <p className="mt-3 text-[13px] text-watch">One network’s index was unavailable during this read.</p>}</section>}
  </div>;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function RecordTable({ mainnet, testnet, caption = 'External customer jobs' }: { mainnet: NetworkRecord; testnet: NetworkRecord; caption?: string }) {
  const rows: Array<[string, keyof NetworkRecord, string]> = [
    ['Jobs funded', 'funded', 'A buyer funded the escrow.'],
    ['Deliveries submitted', 'submitted', 'The provider put a delivery on chain.'],
    ['Settled without dispute', 'settledUndisputed', 'Review window closed or buyer approved, and escrow paid out. Not proof of quality.'],
    ['Rejected after dispute', 'rejectedAfterDispute', 'The buyer disputed and the policy’s voters upheld it.'],
    ['Buyer wallets', 'buyerWallets', 'Distinct wallets, not people.'],
  ];
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-left text-[11.5px] text-ink-3">
          <th className="py-1.5 font-normal" scope="col">
            {caption}
          </th>
          <th className="py-1.5 text-right font-normal" scope="col">
            Mainnet
          </th>
          <th className="py-1.5 text-right font-normal" scope="col">
            Testnet
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule">
        {rows.map(([label, key, hint]) => (
          <tr key={key}>
            <th scope="row" className="py-1.5 text-left font-normal" title={hint}>
              {label}
            </th>
            <td className="t-readout py-1.5 text-right">{mainnet[key]}</td>
            <td className="t-readout py-1.5 text-right text-ink-2">{testnet[key]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * An agent as a portfolio piece: what it does, where it runs, whether
 * this person's ownership checks out, and the two things a visitor can
 * do with it. Its track record is one click away, not the card's bulk.
 */
function AgentCard({ agent, wallet, quote, now, compact = false }: { agent: ShownAgent; wallet: string; quote: QuoteRecord | null; now: number; compact?: boolean }) {
  const record = agentRecord(agent.chainId, agent.tokenId, wallet);
  const history = record.mainnet.funded + record.testnet.funded > 0;
  const testnet = agent.chainId === 97;
  if (compact) return <article className="flex h-full flex-col rounded-[14px] border border-rule bg-raised p-4 transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift">
    <div className="flex min-w-0 items-center gap-3"><AgentAvatar name={agent.name} imageUrl={agent.imageUrl} seed={agent.key} size={48} /><div className="min-w-0"><Link href={`/agents/${agent.chainId}/${agent.tokenId}`} className="block truncate text-[15px] font-semibold hover:underline">{agent.name}</Link><p className="text-[12.5px] text-ink-3">#{agent.tokenId} · {agent.category ?? GENERAL_CATEGORY_LABEL}</p></div></div>
    {agent.description && <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{agent.description}</p>}
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3 text-[12px]"><span className="text-ink-2">{chainLabel(agent.chainId)} · {agent.status === 'owned' ? 'Owner verified' : 'Ownership check pending'}</span><Link href={`/agents/${agent.chainId}/${agent.tokenId}`} className="font-medium text-[#9b6900] hover:underline">View agent →</Link></div>
    <p className="mt-2 text-[11.5px] text-ink-3">{quote ? `Last quoted ${quotePriceLabel(quote)}${quote.expiresAt && Date.parse(quote.expiresAt) <= now ? ' · expired' : ''}` : 'No signed price yet'}. Fresh quote before hire.</p>
  </article>;
  return (
    <article className="flex flex-col gap-3 rounded-[16px] border border-rule bg-raised p-5">
      <div className="flex items-start gap-3">
        <AgentAvatar name={agent.name} imageUrl={agent.imageUrl} seed={agent.key} size={44} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-start justify-between gap-2">
            <Link href={`/agents/${agent.chainId}/${agent.tokenId}`} className="min-w-0 break-words text-[15.5px] font-semibold hover:underline">
              {agent.name}
            </Link>
            {agent.pinned && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-ink-3">
                <Icon.Star size={12} aria-hidden /> Pinned
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
            {agent.category && <span className="rounded-full border border-rule-strong px-2 py-0.5 text-ink-2">{agent.category}</span>}
            <span className={cn('rounded-full px-2 py-0.5 font-medium', testnet ? 'bg-watch-wash text-watch' : 'bg-sunken text-ink-2')}>{testnet ? 'BNB Testnet' : 'BNB Chain'}</span>
          </span>
        </div>
      </div>
      {agent.description && <p className="line-clamp-3 break-words text-[13.5px] leading-relaxed text-ink-2">{agent.description}</p>}
      <div className="flex flex-col gap-0.5 border-t border-rule pt-3">
        <span className="t-label">{quote ? 'Last signed quote' : 'Price'}</span>
        {quote ? (
          <><span className="t-readout text-[17px]">{quotePriceLabel(quote)}</span><span className="text-[11.5px] text-ink-3">{settlementChainOf(quote.currency) ? chainLabel(settlementChainOf(quote.currency)!) : 'Currency not supported'} · quoted {day(quote.quotedAt)}{quote.expiresAt && Date.parse(quote.expiresAt) <= now ? ' · expired' : ''}. A fresh price is checked for your brief.</span></>
        ) : <span className="text-[12.5px] text-ink-3">No signed price observed yet.</span>}
      </div>
      <span className={cn('inline-flex items-center gap-1 text-[12.5px] font-medium', agent.status === 'owned' ? 'text-ok' : 'text-watch')}>
        {agent.status === 'owned' ? <Icon.Shield size={13} aria-hidden /> : <Icon.Alert size={13} aria-hidden />}
        {agent.status === 'owned' ? 'Ownership verified' : 'Ownership check unavailable'}
      </span>
      {history ? (
        <details className="group rounded-[10px] border border-rule">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            View track record
            <Icon.ChevronDown size={14} className="text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="flex flex-col gap-2 border-t border-rule px-3 py-2.5">
            <RecordTable mainnet={record.mainnet} testnet={record.testnet} />
            <p className="text-[11.5px] leading-snug text-ink-3">
              This agent&rsquo;s history under every owner it has had, not this person&rsquo;s own record: Pokter does not yet record who owned an agent at the time of each job. External customer jobs leave out jobs funded by Pokter, demonstrations, the agent paying itself, and jobs this wallet funded. &ldquo;Settled without dispute&rdquo; means the review window closed or the buyer approved, and the escrow paid out; it is not proof of quality.
            </p>
          </div>
        </details>
      ) : (
        <p className="text-[12.5px] text-ink-3">No external job history yet.</p>
      )}
      <div className="mt-auto flex gap-2 pt-1">
        <Link href={`/agents/${agent.chainId}/${agent.tokenId}`} className="inline-flex h-9 items-center rounded-[9px] border border-rule-strong px-3 text-[13.5px] font-medium text-ink-2 hover:text-ink">
          View agent
        </Link>
        <Link href={`/hire/${agent.chainId}/${agent.tokenId}`} className="inline-flex h-9 items-center rounded-[9px] bg-ink px-3 text-[13.5px] font-medium text-paper hover:opacity-90">
          Hire
        </Link>
      </div>
    </article>
  );
}

function BuildingOverview({
  agents,
  wallet,
  operator,
  reviews,
  checks,
  quotes,
  now,
  reviewsHref,
  agentsHref,
}: {
  agents: ShownAgent[];
  wallet: string;
  operator: ReturnType<typeof operatorRecord>;
  reviews: ReturnType<typeof eligibleReviews>;
  checks: Array<{ chainId: number; total: number; answered: number; last: string | null }>;
  quotes: Map<string, QuoteRecord>;
  now: number;
  reviewsHref: string;
  agentsHref: string;
}) {
  if (agents.length === 0) return <Empty title="No agents shown">This profile has not chosen any agents to show.</Empty>;
  /* Pinned first (the list is already ordered that way), then the rest, up to four. */
  const featured = agents.slice(0, 4);
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="builder-evidence" className="flex flex-col gap-3">
        <div>
          <span className="t-label">Pokter-observed evidence</span>
          <h2 id="builder-evidence" className="mt-1 text-[17px] font-semibold">What has been checked and paid for</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">Checks cover agents shown here over the last 30 days. Paid jobs and outside-buyer deliveries follow this wallet as owner at funding, including agents it no longer shows.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {checks.map((check) => {
            const jobs = check.chainId === 56 ? operator.mainnet : operator.testnet;
            const evidenceNote = check.total === 0 && jobs.funded === 0 ? 'Not enough evidence yet.' : jobs.funded === 0 ? 'No outside-buyer paid work yet.' : check.total < 10 ? 'Limited recent checks.' : null;
            return <div key={check.chainId} className="rounded-[12px] border border-rule bg-raised p-4">
              <p className="text-[13px] font-semibold">{chainLabel(check.chainId)}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <div><dt className="text-[11px] text-ink-3">Answered checks</dt><dd className="t-readout text-[16px]">{check.answered}/{check.total}</dd></div>
                <div><dt className="text-[11px] text-ink-3">Outside jobs</dt><dd className="t-readout text-[16px]">{jobs.funded}</dd></div>
                <div><dt className="text-[11px] text-ink-3">Outside deliveries</dt><dd className="t-readout text-[16px]">{jobs.submitted}</dd></div>
              </dl>
              <p className="mt-3 text-[11.5px] text-ink-3">{evidenceNote && <span className="font-medium text-ink-2">{evidenceNote} </span>}{check.last ? `Last check ${day(check.last)}` : 'No checks in 30 days'} · owner job records {operator.since ? `since ${day(operator.since)}` : 'not yet available'}</p>
            </div>;
          })}
        </div>
      </section>
      <section aria-labelledby="featured-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="featured-title" className="text-[17px] font-semibold">
            Featured agents
          </h2>
          {agents.length > featured.length && (
            <Link href={agentsHref} className="text-[13px] font-medium text-ink-2 hover:text-ink">
              All {agents.length} agents
            </Link>
          )}
        </div>
        <p className="text-[12.5px] text-ink-3">Descriptions are builder or agent claims. Prices are last signed quotes where available, not a promise of your final price.</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {featured.map((a) => (
            <AgentCard key={a.key} agent={a} wallet={wallet} quote={quotes.get(a.key) ?? null} now={now} />
          ))}
        </div>
      </section>
      <OperatorRecord operator={operator} />
      <section aria-labelledby="recent-reviews" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-reviews" className="text-[17px] font-semibold">
            Recent reviews
          </h2>
          {reviews.reviews.length > 0 && (
            <Link href={reviewsHref} className="text-[13px] font-medium text-ink-2 hover:text-ink">
              All {reviews.reviews.length}
            </Link>
          )}
        </div>
        {reviews.reviews.length === 0 ? <Empty title="No reviews yet">Only the buyer of a completed job can review an agent.</Empty> : <ReviewList reviews={reviews.reviews.slice(0, 2)} />}
      </section>
    </div>
  );
}

function AgentsTab({ agents, wallet, quotes, now }: { agents: ShownAgent[]; wallet: string; quotes: Map<string, QuoteRecord>; now: number }) {
  if (agents.length === 0) return <Empty title="No agents shown">This profile has not chosen any agents to show.</Empty>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((a) => (
        <AgentCard key={a.key} agent={a} wallet={wallet} quote={quotes.get(a.key) ?? null} now={now} compact />
      ))}
    </div>
  );
}

/** Evidence-only work: which outside jobs these agents did and how each ended. Never a brief or an output. */
/**
 * This builder's own record: jobs whose agent they owned when it was
 * funded, as recorded then. Unlike an agent's record, it follows the
 * person, not the agent, and starts the day recording began.
 */
function OperatorRecord({ operator }: { operator: ReturnType<typeof operatorRecord> }) {
  if (!operator.since) return null;
  const any = operator.mainnet.funded + operator.testnet.funded > 0;
  return (
    <section aria-labelledby="operator-record" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="operator-record" className="text-[17px] font-semibold">
          Track record as owner
        </h2>
        <p className="text-[13px] text-ink-3">
          Outside jobs taken on while this wallet owned the agent, across every agent it owned at the time. Counted only where the registry shows the agent did not change hands between the funding and Pokter’s check. Recorded since {day(operator.since)}; earlier jobs are not attributed to anyone.
        </p>
      </div>
      {any ? (
        <div className="rounded-[14px] border border-rule bg-raised px-4 py-2">
          <RecordTable mainnet={operator.mainnet} testnet={operator.testnet} caption="Jobs taken on" />
        </div>
      ) : (
        <Empty title="None recorded yet">No outside job has been funded for an agent while this wallet owned it, since recording began.</Empty>
      )}
    </section>
  );
}

function WorkTab({ agents, wallet, takenOn }: { agents: ShownAgent[]; wallet: string; takenOn: Set<string> }) {
  const jobs = agents
    .flatMap((a) => agentJobs(a.chainId, a.tokenId, wallet).map((job) => ({ job, agent: a })))
    .sort((x, y) => Date.parse(y.job.hiredAt) - Date.parse(x.job.hiredAt))
    .slice(0, 30);
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-3">Outside jobs these agents did, under all their owners, and how each ended on chain. Briefs and outputs belong to the buyers and are not shown.</p>
      {jobs.length === 0 ? (
        <Empty title="No outside jobs yet">When a buyer outside Pokter hires one of these agents, the job and how it ended appear here.</Empty>
      ) : (
        <ul className="ruled border-y border-rule">
          {jobs.map(({ job, agent }) => (
            <li key={`${job.chainId}:${job.jobId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-[13.5px]">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {agent.name}{' '}
                  <span className="font-normal text-ink-3">
                    · job #{job.jobId} · {chainLabel(job.chainId)}
                  </span>
                </span>
                <span className="text-[12.5px] text-ink-3">
                  {day(job.hiredAt)}
                  {takenOn.has(job.id) ? ' · taken on by this owner' : ''}
                </span>
              </span>
              <span className={cn('text-[12.5px] font-medium', job.status === 'COMPLETED' ? 'text-ok' : job.status === 'REJECTED' ? 'text-bad' : 'text-ink-2')}>{JOB_STATE_LABEL[job.status] ?? job.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewList({ reviews }: { reviews: ReturnType<typeof eligibleReviews>['reviews'] }) {
  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((r) => (
        <li key={`${r.chainId}:${r.jobId}`} className="flex flex-col gap-2 rounded-[14px] border border-rule bg-raised p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="flex items-center gap-1" role="img" aria-label={`${r.rating} out of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Icon.StarFilled key={i} size={14} className={i < r.rating ? 'text-ink' : 'text-rule-strong'} aria-hidden />
              ))}
            </span>
            <span className="text-[12px] text-ink-3">{new Date(r.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          {r.comment && <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink-2">{r.comment}</p>}
          <p className="text-[12px] text-ink-3">
            For{' '}
            <Link href={`/agents/${r.agentChainId}/${r.agentTokenId}`} className="underline underline-offset-2 hover:text-ink">
              {r.agentName}
            </Link>{' '}
            · job #{r.jobId} on {chainLabel(r.chainId)} · by its buyer, {short(r.buyer)}
            {r.onchainTx && (
              <>
                {' · '}
                <a href={`${explorerBaseFor(r.agentChainId)}/tx/${r.onchainTx}`} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-ink">
                  on chain
                </a>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ReviewsTab({ data }: { data: ReturnType<typeof eligibleReviews> }) {
  const count = data.reviews.length;
  const average = count ? data.reviews.reduce((n, r) => n + r.rating, 0) / count : null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold">{count === 0 ? 'No eligible reviews yet' : `${average!.toFixed(1)} out of 5 · ${count} eligible ${count === 1 ? 'review' : 'reviews'}`}</p>
        <p className="text-[12.5px] text-ink-3">
          All eligible reviews for these agents: each written and signed by the buyer of a completed job. The builder cannot hide or choose among them, and reviews by this wallet are left out.
          {data.hidden > 0 && ` ${data.hidden} ${data.hidden === 1 ? 'was' : 'were'} removed by Pokter’s moderation for breaking its rules.`}
        </p>
      </div>
      {count > 0 && <ReviewList reviews={data.reviews} />}
    </section>
  );
}

function HiringOverview({ record, requestsHref }: { record: ReturnType<typeof hirerRecord>; requestsHref: string }) {
  const rows: Array<[string, number, number]> = [
    ['Jobs funded', record.mainnet.funded, record.testnet.funded],
    ['Deliveries received', record.mainnet.submitted, record.testnet.submitted],
    ['Settled without dispute', record.mainnet.settledUndisputed, record.testnet.settledUndisputed],
    ['Rejected after dispute', record.mainnet.rejectedAfterDispute, record.testnet.rejectedAfterDispute],
  ];
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-[16px] border border-rule bg-raised p-5">
        <h2 className="text-[16px] font-semibold">As a buyer</h2>
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-[11.5px] text-ink-3">
              <th className="py-1.5 font-normal" scope="col">
                Jobs this wallet funded
              </th>
              <th className="py-1.5 text-right font-normal" scope="col">
                Mainnet
              </th>
              <th className="py-1.5 text-right font-normal" scope="col">
                Testnet
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map(([label, m, t]) => (
              <tr key={label}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  {label}
                </th>
                <td className="t-readout py-1.5 text-right">{m}</td>
                <td className="t-readout py-1.5 text-right text-ink-2">{t}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11.5px] text-ink-3">Counts only. Amounts, proposals and payment details stay private.</p>
      </section>
      <section className="flex items-center justify-between gap-4 rounded-[16px] border border-rule bg-raised p-5">
        <span className="flex flex-col">
          <span className="text-[16px] font-semibold">Requests</span>
          <span className="text-[13px] text-ink-3">
            {record.requestsPosted} posted · {record.requestsOpen} open
          </span>
        </span>
        <Link href={requestsHref} className="text-[13.5px] font-medium text-ink-2 hover:text-ink">
          See requests
        </Link>
      </section>
    </div>
  );
}

function RequestsTab({ requests }: { requests: ReturnType<ReturnType<typeof getBriefStore>['byPoster']> }) {
  if (requests.length === 0) return <Empty title="No requests posted">Requests this wallet posts appear here.</Empty>;
  return (
    <ul className="ruled border-y border-rule">
      {requests.map((r) => (
        <li key={r.id}>
          <Link href={`/requests/${r.id}`} className="flex items-center justify-between gap-4 py-3.5 hover:bg-sunken/40">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14.5px] font-medium">{r.title}</span>
              <span className="text-[12.5px] text-ink-3">
                {chainLabel(r.chainId)} · posted {new Date(r.postedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </span>
            <span className={cn('shrink-0 text-[12.5px] font-medium', r.state === 'open' ? 'text-ok' : 'text-ink-3')}>{r.state === 'open' ? 'Taking proposals' : r.state === 'awarded' ? 'Agent chosen' : 'Withdrawn'}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
