import { briefFromLink, HireContents } from '@/features/hire/HireContents';
import { HireSheet } from '@/features/hire/HireSheet';
import { WalletRoot } from '@/shell/wallet/WalletRoot';

export const dynamic = 'force-dynamic';

/*
 * Hire opened from a page on this site: the flow in a sheet over that page,
 * so the reader keeps their place in the catalogue. A shared link, a
 * refresh or "Open as a page" loads /hire itself.
 *
 * `WalletRoot` is here because `(site)` has none — only `(app)` and
 * `(flow)` wrap one, and the form cannot ask for a signature without it.
 */
export default async function HireInSheet({
  params,
  searchParams,
}: {
  params: Promise<{ chainId: string; tokenId: string }>;
  searchParams: Promise<{ escrow?: string; task?: string }>;
}) {
  const [{ chainId, tokenId }, { escrow, task }] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams();
  if (escrow) query.set('escrow', escrow);
  if (task) query.set('task', task);
  const suffix = query.toString();
  return (
    <HireSheet fullPageHref={`/hire/${chainId}/${tokenId}${suffix ? `?${suffix}` : ''}`}>
      <WalletRoot>
        <HireContents chainId={Number(chainId)} tokenId={tokenId} escrow={escrow} initialTask={briefFromLink(task)} embedded />
      </WalletRoot>
    </HireSheet>
  );
}
