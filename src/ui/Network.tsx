import { hireNetworkTags } from '@/lib/network/hire-networks';
import { escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';

/** BNB Chain's mark, in its own yellow: it identifies the network, so it keeps the network's colour in both themes. */
export function BnbMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 126.61 126.61" width={size} height={size} aria-hidden className={cn('shrink-0', className)}>
      <path
        fill="#F0B90B"
        d="M38.73 53.2l24.59-24.58 24.6 24.6 14.3-14.31L63.32 0 24.42 38.9zM0 63.31l14.3-14.31 14.31 14.31-14.31 14.3zm38.73 10.11l24.59 24.59 24.6-24.6 14.31 14.29-38.9 38.91-38.91-38.88-.02-.02zm59.27-10.1l14.3-14.31 14.31 14.3-14.31 14.31zM77.83 63.3L63.32 48.78 52.59 59.51l-1.24 1.23-2.54 2.54 14.51 14.5 14.51-14.47z"
      />
    </svg>
  );
}

/**
 * Which network a hire is funded on, and whether its money is real, as one
 * row: the chain's mark, "BNB Chain · Mainnet" or "BNB Chain · Testnet",
 * and the money on the right. Test tokens read in the warning colour, so
 * the two never look alike at a glance.
 */
export function NetworkRow({ chainId, className }: { chainId: number; className?: string }) {
  const money = escrowMoney(chainId);
  const stage = chainId === 56 ? 'Mainnet' : chainId === 97 ? 'Testnet' : null;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BnbMark size={24} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
        {stage ? `BNB Chain · ${stage}` : money.network}
      </span>
      {money.money && (
        <span className={cn('shrink-0 text-[13px]', money.real === false ? 'font-semibold text-watch' : 'text-ink-3')}>{money.money}</span>
      )}
    </div>
  );
}

/**
 * Where money settles, as a tag under a price: on agent cards (where a hire
 * settles) and on request cards (where a request's budget is paid). On the
 * homepage three of four featured agents were testnet, and the only sign
 * was the last line of a caption under the price, wrapped to two lines.
 *
 * "Mainnet" or "Testnet": every agent here is on BNB Chain, so the chain's
 * name told nobody anything. What the money is stays in the tooltip and
 * the screen-reader text (`hireNetworkTags`).
 *
 * An agent that can be hired on both is one tag in two halves, Mainnet
 * first, rather than two tags or a sentence: the price beside it is the
 * mainnet one, and the tooltip says the testnet hire is in test tokens.
 * `alsoHireOn` is only ever networks where the agent has a verified price
 * of its own (Discover's and the home page's `hireChainIds`), never a registration alone.
 */
export function NetworkTag({ chainId, alsoHireOn = [], className }: { chainId: number | null; alsoHireOn?: number[]; className?: string }) {
  /* Nothing without a price on this card: a testnet tag beside no price would read as this card's price being in test tokens. */
  if (chainId === null) return null;
  const tags = hireNetworkTags([chainId, ...alsoHireOn]);
  if (tags.length === 0) return null;
  /* Coloured both ways, so the two read apart at a glance across a grid: green for money that is real, amber for money that is not. The words carry it too, for anyone who cannot tell the colours apart. */
  const tone = (real: boolean) => (real ? 'bg-ok-wash text-ok' : 'bg-watch-wash text-watch');
  if (tags.length === 1) {
    const [tag] = tags;
    return (
      <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium', tone(tag.real), className)} title={tag.meaning}>
        {tag.label}
        <span className="sr-only">: {tag.meaning.toLowerCase()}</span>
      </span>
    );
  }
  return (
    <span className={cn('inline-flex shrink-0 items-stretch overflow-hidden rounded-full text-[11.5px] font-medium', className)} title={tags.map((tag) => `${tag.label}: ${tag.meaning.toLowerCase()}`).join('. ')}>
      {tags.map((tag, i) => (
        <span key={tag.chainId} className={cn('px-2 py-0.5', tone(tag.real), i > 0 && 'border-l border-paper/70')}>
          {tag.label}
          <span className="sr-only">: {tag.meaning.toLowerCase()}{i < tags.length - 1 ? ';' : ''}</span>
        </span>
      ))}
    </span>
  );
}
