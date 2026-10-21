import { delegatedTrader } from '@/lib/trading/agents';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

/**
 * For an agent that trades from the buyer's own wallet: how that works, as
 * its operator says, where to set it up, and Pokter's watch over the wallet.
 * Shown beside the hire panel, never instead of its warnings.
 */
export function TradesForYouCard({ chainId, tokenId }: { chainId: number; tokenId: string }) {
  const t = delegatedTrader(chainId, tokenId);
  if (!t) return null;
  return (
    <aside aria-labelledby="trades-for-you" className="mt-4 flex flex-col gap-3 rounded-[16px] border border-rule bg-raised p-5">
      <span className="w-fit rounded-full bg-sunken px-2.5 py-0.5 text-[12px] font-medium text-ink-2">Trades within your limits</span>
      <h2 id="trades-for-you" className="text-[15px] font-semibold">
        It trades from your own wallet
      </h2>
      <p className="text-[13px] text-ink-2">{t.custody}</p>
      <p className="text-[13px] text-ink-2">{t.limits}</p>
      <div className="flex flex-col gap-2">
        <a href={t.setupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-ink px-4 text-[14px] font-medium text-paper hover:opacity-90">
          Set up on {t.operator} <Icon.ArrowUpRight size={14} aria-hidden />
        </a>
        <LinkButton href={`/trading?agent=${chainId}:${tokenId}`} intent="secondary" className="justify-center">
          Watch your trading wallet on Pokter
        </LinkButton>
      </div>
      <p className="text-[11.5px] text-ink-3">As {t.operator} describes it ({t.source}). Pokter takes no payment for this and holds no key.</p>
    </aside>
  );
}
