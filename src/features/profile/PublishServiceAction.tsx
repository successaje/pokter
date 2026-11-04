'use client';

import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

/** Publishing belongs to the wallet that owns this builder profile. */
export function PublishServiceAction({ wallet }: { wallet: string }) {
  const { address } = useActiveSigner();
  if (address?.toLowerCase() !== wallet.toLowerCase()) return null;

  return <LinkButton href={`/build/services/new?builder=${encodeURIComponent(wallet)}`} size="s" icon={<Icon.Plus size={14} />}>Publish a service</LinkButton>;
}
