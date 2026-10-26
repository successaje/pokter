import { briefFromLink, currencyFromLink, HireContents, hireSheetAgent } from '@/features/hire/HireContents';
import { HireSheet } from '@/features/hire/HireSheet';
import { WalletRoot } from '@/shell/wallet/WalletRoot';

export const dynamic = 'force-dynamic';

/*
 * Hire opened from a page on this site: the flow in a sheet over that page,
 * so the reader keeps their place in the catalogue. A shared link or a
 * refresh loads /hire itself.
 *
 * `WalletRoot` is here because `(site)` has none — only `(app)` and
 * `(flow)` wrap one, and the form cannot ask for a signature without it.
 */
export default async function HireInSheet({
  params,
  searchParams,
}: {
  params: Promise<{ chainId: string; tokenId: string }>;
  searchParams: Promise<{ escrow?: string; task?: string; proposal?: string; pay?: string }>;
}) {
  const [{ chainId, tokenId }, { escrow, task, proposal, pay }] = await Promise.all([params, searchParams]);
  const agent = await hireSheetAgent(Number(chainId), tokenId, escrow);
  return (
    <HireSheet agent={agent}>
      <WalletRoot>
        <HireContents chainId={Number(chainId)} tokenId={tokenId} escrow={escrow} initialTask={briefFromLink(task)} initialCurrency={currencyFromLink(pay)} proposalId={proposal} embedded />
      </WalletRoot>
    </HireSheet>
  );
}
