import Link from 'next/link';
import type { Service } from '@/lib/services/model';
import { CATEGORIES } from '@/lib/agents/categories';
import { getProfileStore } from '@/lib/profiles/store';
import { getProbeStore } from '@/lib/history/store';
import { quotePriceLabel } from '@/lib/find/price';
import { NetworkStageTag } from '@/ui/Network';

function renderedAt() { return Date.now(); }

export function ServiceCard({ service, preview = false }: { service: Service; preview?: boolean }) {
  const category = CATEGORIES.find((c) => c.id === service.category)?.label ?? 'General';
  const wallet = `${service.builder.slice(0, 6)}…${service.builder.slice(-4)}`;
  const profile = preview ? null : getProfileStore().get(service.builder);
  const builderName = preview ? 'Sample builder' : profile?.published ? profile.displayName || `@${profile.handle}` : wallet;
  const key = `${service.chainId}:${service.tokenId}`;
  const quote = preview ? null : getProbeStore().quotesFor([{ chainId: service.chainId, tokenId: service.tokenId }]).get(key);
  const now = renderedAt();
  const checks = preview ? [] : getProbeStore().historyFor(service.chainId, service.tokenId, new Date(now - 30 * 86_400_000));
  const href = preview ? `/services/preview/${service.id}` : `/services/${service.id}`;
  return <article className="flex h-full flex-col rounded-[14px] border border-rule bg-raised p-5 transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift">
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-ink-3">
      <span className="rounded-full border border-rule-strong px-2 py-0.5">{category}</span>
      <NetworkStageTag chainId={service.chainId} />
    </div>
    <h3 className="mt-4 text-[18px] font-semibold leading-snug"><Link href={href} className="hover:underline">{service.title}</Link></h3>
    <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{service.description}</p>
    <p className="mt-4 text-[12.5px] text-ink-2"><span className="text-ink-3">By </span>{preview ? <span className="font-medium">{builderName}</span> : <Link href={`/builders/${service.builder}`} className="font-medium hover:underline">{builderName}</Link>}<span className="text-ink-3"> · Agent </span>{preview ? <span className="font-medium">Sample</span> : <Link href={`/agents/${service.chainId}/${service.tokenId}`} className="font-medium hover:underline">#{service.tokenId}</Link>}</p>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4 text-[12.5px]">
      <span className="text-ink-3">{preview ? 'Sample offer · no quote' : quote ? `Last quoted ${quotePriceLabel(quote)}${quote.expiresAt && Date.parse(quote.expiresAt) <= now ? ' · expired' : ''}` : 'Fresh quote before hire'}<span className="block text-[11.5px]">{preview ? 'No evidence attached to this sample' : checks.length ? `${checks.filter((check) => check.ok).length}/${checks.length} checks answered · 30d` : 'No recent checks'}</span></span>
      <Link href={href} className="font-semibold text-[#9b6900] hover:underline">View service →</Link>
    </div>
  </article>;
}
