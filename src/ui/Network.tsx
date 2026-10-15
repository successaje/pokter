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
    <div className={cn('flex items-center gap-3 border-y border-rule py-3', className)}>
      <BnbMark size={28} />
      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">
        {stage ? `BNB Chain · ${stage}` : money.network}
      </span>
      {money.money && (
        <span className={cn('shrink-0 text-[13px]', money.real === false ? 'font-semibold text-watch' : 'text-ink-3')}>{money.money}</span>
      )}
    </div>
  );
}
