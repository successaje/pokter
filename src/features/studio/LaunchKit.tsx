'use client';

import { useState } from 'react';

import type { BuilderGrowthSnapshot } from '@/lib/builders/growth';
import { buyerPostText, evidenceShareText, launchPostText } from '@/lib/builders/growth';
import { Button, LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';

type CopyTarget = 'launch' | 'buyer' | 'evidence' | 'hire' | null;

export function LaunchKit({
  name,
  listingPath,
  hirePath,
  growth,
}: {
  name: string;
  listingPath: string;
  hirePath: string | null;
  growth: BuilderGrowthSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<CopyTarget>(null);

  const copy = async (target: Exclude<CopyTarget, null>, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard permission can be blocked by the browser; the text remains selectable below.
    }
  };

  const absolute = (path: string) => new URL(path, window.location.origin).toString();
  const withListing = (text: string) => `${text}\n\n${absolute(listingPath)}`;
  const posts = [
    { id: 'launch' as const, label: 'Launch announcement', text: launchPostText(name, growth) },
    { id: 'buyer' as const, label: 'Buyer invitation', text: buyerPostText(name, growth) },
    { id: 'evidence' as const, label: 'Evidence update', text: evidenceShareText(name, growth) },
  ];

  return (
    <>
      <Button intent="secondary" size="s" icon={<Icon.Rocket size={14} />} onClick={() => setOpen(true)}>
        Launch kit
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Launch ${name}`}
        description="Post-ready copy and canonical links built only from evidence Pokter can show."
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-6">
          <section className="overflow-hidden rounded-[14px] border border-rule bg-paper">
            <div className="border-b border-rule p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="t-label">SHARED-LINK CARD</p>
                  <h3 className="mt-2 t-h3">{name}</h3>
                  <p className="mt-1 text-[13px] text-ink-3">{growth.categoryLabel} · {growth.hireNetworks.length ? growth.hireNetworks.map((network) => network.label).join(' + ') : 'Hire route not verified'}</p>
                </div>
                <span className={growth.check?.status === 'passed' ? 'rounded-full bg-ok/10 px-2.5 py-1 text-[12px] font-medium text-ok' : 'rounded-full bg-sunken px-2.5 py-1 text-[12px] font-medium text-ink-3'}>
                  {growth.check?.status === 'passed' ? 'Category check passed' : 'Evidence building'}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-rule pt-4 text-center">
                <div><strong className="t-readout block text-lg">{growth.outcomes.completed}</strong><span className="text-[11px] text-ink-3">Accepted</span></div>
                <div><strong className="t-readout block text-lg">{growth.outcomes.uniqueBuyers}</strong><span className="text-[11px] text-ink-3">Buyer wallets</span></div>
                <div><strong className="t-readout block text-lg">{growth.rankingEligible ? 'Yes' : 'Not yet'}</strong><span className="text-[11px] text-ink-3">Ranking eligible</span></div>
              </div>
            </div>
            <p className="px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">Social platforms that support link previews receive Pokter&rsquo;s canonical evidence card from the public listing.</p>
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-[13px] font-medium">Ready-to-post messages</h3>
              <p className="mt-1 text-[12px] text-ink-3">Use the launch post first, then share evidence updates as the record grows.</p>
            </div>
            {posts.map((post) => (
              <div key={post.id} className="rounded-[12px] border border-rule p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-medium text-ink-2">{post.label}</span>
                  <Button intent="ghost" size="s" icon={copied === post.id ? <Icon.Check size={13} /> : <Icon.Copy size={13} />} onClick={() => copy(post.id, withListing(post.text))}>
                    {copied === post.id ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{post.text}</p>
              </div>
            ))}
          </section>

          <section className="flex flex-wrap gap-2 border-t border-rule pt-4">
            {hirePath ? (
              <Button intent="primary" size="s" icon={copied === 'hire' ? <Icon.Check size={13} /> : <Icon.Copy size={13} />} onClick={() => copy('hire', absolute(hirePath))}>
                {copied === 'hire' ? 'Hire link copied' : 'Copy direct hire link'}
              </Button>
            ) : null}
            <LinkButton href={listingPath} intent="secondary" size="s" trailing={<Icon.ArrowUpRight size={13} />}>Open public card</LinkButton>
          </section>
        </div>
      </Sheet>
    </>
  );
}
