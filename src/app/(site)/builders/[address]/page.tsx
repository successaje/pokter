import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUnits, getAddress, isAddress } from 'viem';

import { CATEGORY_BY_ID, classify } from '@/lib/agents/categories';
import { resolveAgentImages } from '@/lib/registry/image';
import { verifiedPublisherByOwner } from '@/lib/builders/store';
import { earnedByNetwork } from '@/lib/builder/earnings';
import { getJobStore } from '@/lib/erc8183/store';
import { chainLabel } from '@/lib/network/presentation';
import { listAgents } from '@/lib/scan/client';
import { ProfileAbout } from '@/features/profile/ProfileAbout';
import { getBriefStore } from '@/lib/briefs/store';
import { getProfileStore } from '@/lib/profiles/store';
import { AgentAvatar } from '@/ui/Agent';
import { AvatarImage } from '@/ui/AvatarImage';
import { avatarUrl } from '@/lib/ui/avatar-art';
import { Address } from '@/ui/Data';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) return { title: 'Profile' };
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const name = getProfileStore().get(address)?.displayName;
  return {
    /* The address always travels with a self-provided name, so a name alone never stands for the wallet. */
    title: name ? `${name} (${short})` : `Profile ${short}`,
    description: `What ${short} has done on Pokter: the agents it owns on BNB Chain, paid work, hires, requests and proposals.`,
  };
}

/**
 * A wallet's profile, in two parts that never mix.
 *
 * "About" is what the wallet says about itself: a name, a picture, a bio
 * and links, signed by the wallet and labelled as self-provided. "Evidence
 * and activity" is what the registry and Pokter's own records show, each
 * part with its source, and nothing in it can be edited by the wallet.
 * Every address has a page, so "My profile" never lands on "not found".
 */
export default async function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = getAddress(raw);
  const profile = getProfileStore().get(address);
  const verified = verifiedPublisherByOwner(address);
  const pages = await Promise.all([
    listAgents({ chainId: 56, ownerAddress: address, limit: 100 }).catch(() => null),
    listAgents({ chainId: 97, ownerAddress: address, limit: 100 }).catch(() => null),
  ]);
  /* A network the indexer did not answer for is said, not shown as "owns nothing". */
  const agentsUnavailable = pages.some((p) => p === null);
  const agents = pages.flatMap((p) => p?.items ?? []);
  /* The registry record first, since the indexer's media proxy misses for
     some agents — see `resolveAgentImage`. A builder's page is short. */
  const images = await resolveAgentImages(agents);
  const keys = new Set(agents.map((a) => `${a.chain_id}:${a.token_id}`));
  const jobStore = getJobStore();
  const jobs = jobStore
    .all()
    .filter((j) => keys.has(`${j.agentChainId ?? 56}:${j.agentTokenId}`) && j.status !== 'OPEN');
  const completed = jobs.filter((j) => j.status === 'COMPLETED');
  // Kept apart by network: test tokens have no cash value and were added in.
  const paid = earnedByNetwork(completed);
  const amount = (raw: bigint) => `${Number(formatUnits(raw, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 })} $U`;
  const completedOn = (chainId: number) => completed.filter((j) => j.chainId === chainId).length;
  const verifiedKeys = new Set(verified.map((v) => `${v.chainId}:${v.tokenId}`));
  const hires = jobStore.byClient(address).filter((j) => j.status !== 'OPEN');
  const hiresSettled = hires.filter((j) => j.status === 'COMPLETED').length;
  const briefs = getBriefStore();
  const requests = briefs.byPoster(address);
  const proposals = briefs.bidsBy(address);
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const nothing = agents.length === 0 && hires.length === 0 && requests.length === 0 && proposals.length === 0;

  return (
    <div className="frame pb-24 pt-10 sm:pt-14">
      <header className="mb-8 flex items-center gap-4">
        <AvatarImage
          src={profile?.avatarUrl || null}
          fallback={avatarUrl(address.toLowerCase())}
          name={profile?.displayName || short}
          size={64}
          className="rounded-full"
          eager
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="t-label">Profile</span>
          <h1 className="t-h1 break-words text-[clamp(1.5rem,3.2vw,2.1rem)]">{profile?.displayName || <span className="t-readout">{short}</span>}</h1>
          <Address address={address} />
        </div>
      </header>

      <div className="flex max-w-4xl flex-col gap-10">
        <ProfileAbout wallet={address} profile={profile} />

        <section aria-labelledby="evidence-title" className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 id="evidence-title" className="text-[20px] font-semibold tracking-[-0.015em]">
              Evidence and activity
            </h2>
            <p className="text-[13px] text-ink-3">From the ERC-8004 registry and Pokter&rsquo;s own records. Not editable by this wallet; each part names its source.</p>
          </div>

          {nothing && !agentsUnavailable && <p className="rounded-[12px] border border-dashed border-rule-strong px-5 py-4 text-[14px] text-ink-2">No public activity on Pokter yet.</p>}

          {(agents.length > 0 || agentsUnavailable) && (
            <div className="flex flex-col gap-3">
              <SourceHead title="Agents owned" source="ERC-8004 registry, via the agent index. The shield marks agents this wallet proved it owns by signing to Pokter." />
              {agentsUnavailable && <p className="text-[13px] text-watch">The agent index did not answer for one network, so this list may be incomplete.</p>}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: 'Agents', v: String(agents.length), note: verified.length ? `${verified.length} proved to Pokter` : null },
                  { k: 'Paid jobs completed', v: String(completed.length), note: `${completedOn(56)} on ${chainLabel(56)} · ${completedOn(97)} on ${chainLabel(97)}` },
                  { k: `Paid out on ${chainLabel(56)}`, v: amount(paid.real), note: 'Real $U' },
                  { k: `Test tokens on ${chainLabel(97)}`, v: amount(paid.test), note: 'No cash value' },
                ].map(({ k, v, note }) => (
                  <div key={k} className="rounded-[12px] border border-rule bg-raised px-4 py-3">
                    <dt className="t-label">{k}</dt>
                    <dd className="t-readout mt-1 text-lg">{v}</dd>
                    {note && <dd className="mt-0.5 text-[11.5px] text-ink-3">{note}</dd>}
                  </div>
                ))}
              </dl>
              <p className="text-[12px] text-ink-3">
                Paid amounts are the budgets of jobs that completed through Pokter escrow, which pays the budget to the agent. They are not net income: the operator&rsquo;s own costs are not known here.
              </p>
              <ul className="ruled border-y border-rule">
                {agents.map((a, i) => {
                  const key = `${a.chain_id}:${a.token_id}`;
                  const cat = classify(a);
                  return (
                    <li key={key}>
                      <Link href={`/agents/${a.chain_id}/${a.token_id}`} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 py-4 hover:bg-sunken/40">
                        <AgentAvatar name={a.name} imageUrl={images[i]} seed={key} size={40} />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex items-center gap-2 truncate font-medium">
                            {a.name}
                            {verifiedKeys.has(key) && (
                              <span className="inline-flex items-center gap-1 text-[12px] font-normal text-ok">
                                <Icon.Shield size={13} aria-hidden /> Ownership proved
                              </span>
                            )}
                          </span>
                          <span className="text-[12.5px] text-ink-3">
                            #{a.token_id} · {chainLabel(a.chain_id)} · {cat === 'unclassified' ? 'Unclassified' : (CATEGORY_BY_ID.get(cat)?.label ?? '')}
                          </span>
                        </span>
                        <Icon.ChevronRight size={16} className="text-ink-3" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {hires.length > 0 && (
            <div className="flex flex-col gap-3">
              <SourceHead title="Hiring" source="Jobs this wallet funded through Pokter escrow." />
              <p className="text-[14px] text-ink-2">
                <span className="t-readout text-ink">{hires.length}</span> {hires.length === 1 ? 'job' : 'jobs'} funded ·{' '}
                <span className="t-readout text-ink">{hiresSettled}</span> completed
              </p>
            </div>
          )}

          {(requests.length > 0 || proposals.length > 0) && (
            <div className="flex flex-col gap-3">
              <SourceHead title="Requests and proposals" source="Posted on Pokter and signed by this wallet." />
              <ul className="ruled border-y border-rule">
                {requests.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-sunken/40">
                      <span className="truncate text-[14px] font-medium">{r.title}</span>
                      <span className="shrink-0 text-[12.5px] text-ink-3">Request · {r.state === 'open' ? 'open' : r.state === 'awarded' ? 'agent chosen' : 'withdrawn'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {proposals.length > 0 && (
                <p className="text-[13.5px] text-ink-2">
                  <span className="t-readout text-ink">{proposals.length}</span> {proposals.length === 1 ? 'proposal' : 'proposals'} sent on requests
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SourceHead({ title, source }: { title: string; source: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="text-[12px] text-ink-3">Source: {source}</p>
    </div>
  );
}
