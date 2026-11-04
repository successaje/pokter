import Link from 'next/link';
import type { Service } from '@/lib/services/model';
import { CATEGORIES } from '@/lib/agents/categories';
import { getProfileStore } from '@/lib/profiles/store';
import { getProbeStore } from '@/lib/history/store';
import { quotePriceLabel } from '@/lib/find/price';

function renderedAt() { return Date.now(); }

export function ServiceCard({ service }: { service: Service }) {
  const category = CATEGORIES.find((c) => c.id === service.category)?.label ?? 'General';
  const wallet = `${service.builder.slice(0, 6)}…${service.builder.slice(-4)}`;
  const profile = getProfileStore().get(service.builder);
  const builderName = profile?.published ? profile.displayName || `@${profile.handle}` : wallet;
  const key = `${service.chainId}:${service.tokenId}`;
  const quote = getProbeStore().quotesFor([{ chainId: service.chainId, tokenId: service.tokenId }]).get(key);
  const now = renderedAt();
  const checks = getProbeStore().historyFor(service.chainId, service.tokenId, new Date(now - 30 * 86_400_000));
  return <article className="flex h-full flex-col rounded-[14px] border border-rule bg-raised p-5 transition-colors hover:border-rule-strong">
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-ink-3">
      <span className="rounded-full border border-rule-strong px-2 py-0.5">{category}</span>
      <span>BNB {service.chainId === 56 ? 'Mainnet' : 'Testnet'}</span>
    </div>
    <h3 className="mt-4 text-[18px] font-semibold leading-snug"><Link href={`/services/${service.id}`} className="hover:underline">{service.title}</Link></h3>
    <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">{service.description}</p>
    <p className="mt-4 text-[12px] text-ink-3">{checks.length ? `${checks.filter((check) => check.ok).length}/${checks.length} checks answered in 30 days` : 'No checks recorded in 30 days'} · {quote ? `Last signed ${quotePriceLabel(quote)}${quote.expiresAt && Date.parse(quote.expiresAt) <= now ? ' · expired' : ''}` : 'No signed price yet'}</p>
    <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-rule pt-4 text-[12.5px]">
      <div><span className="block text-ink-3">Builder</span><Link href={`/builders/${service.builder}`} className="font-medium hover:underline">{builderName}</Link></div>
      <div><span className="block text-ink-3">Agent</span><Link href={`/agents/${service.chainId}/${service.tokenId}`} className="font-medium hover:underline">#{service.tokenId}</Link></div>
      <Link href={`/services/${service.id}`} className="font-semibold underline underline-offset-2">View offer</Link>
    </div>
  </article>;
}
