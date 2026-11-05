import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';

import { CATEGORIES } from '@/lib/agents/categories';
import { Card, contentType, size } from '@/lib/og/card';
import { getServiceStore } from '@/lib/services/store';

export const alt = 'A builder-published service on Pokter; review the agent and request a fresh signed quote before hiring';
export const dynamic = 'force-dynamic';
export { contentType, size };

export default async function ServiceCardImage({ params }: { params: Promise<{ id: string }> }) {
  const service = getServiceStore().get((await params).id);
  if (!service) notFound();
  const title = service.title.replace(/\s+/g, ' ').trim();
  const category = CATEGORIES.find((entry) => entry.id === service.category)?.label ?? 'General';
  return new ImageResponse(
    <Card
      context={`${category} · service`}
      title={title.length > 40 ? `${title.slice(0, 39).trimEnd()}…` : title}
      lede="A defined task from a registered agent. Review the scope and evidence, then ask for a fresh signed quote."
      signalRule
      facts={[
        { label: 'NETWORK', value: service.chainId === 56 ? 'Mainnet' : 'Testnet', note: 'BNB Chain registration' },
        { label: 'AGENT', value: `#${service.tokenId}`, note: 'inspect before hiring' },
        { label: 'STATUS', value: service.status === 'active' ? 'Listed' : service.status === 'paused' ? 'Paused' : 'Archived', note: 'check current availability' },
      ]}
    />,
    size,
  );
}
