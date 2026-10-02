'use client';

import { formatEther, formatUnits } from 'viem';

import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { useActiveWallet } from '@/lib/wallet/active';
import { useWalletFunding } from '@/lib/wallet/use-funding';
import { cn } from '@/lib/ui/cn';

/**
 * The three things that have to be true before a hire can go through,
 * answered on the page where the decision is made.
 *
 * All of this was discoverable only by starting the hire flow and failing:
 * the wallet prompt, then the gas error, then the balance error, each one a
 * screen further in. Three rows beside the price turn that into something a
 * reader settles before committing to anything.
 *
 * Deliberately not a copy of WalletReadiness, which is the full panel on the
 * hire page itself with amounts, faucet links and recovery advice. This is
 * the glance version: what is missing, and the one link that fixes it.
 */
function Row({
  state,
  index,
  label,
  value,
  action,
}: {
  state: 'ready' | 'missing' | 'unknown';
  index: number;
  label: string;
  value?: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5 text-[12px]">
      <span
        aria-hidden
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-semibold',
          state === 'ready'
            ? 'bg-[color:var(--positive)] text-[color:var(--brand-ink)]'
            : state === 'missing'
              ? 'border border-[color:var(--caution)] text-[color:var(--caution)]'
              : 'border border-[color:var(--border-strong)] text-[color:var(--text-faint)]',
        )}
      >
        {state === 'ready' ? '✓' : index}
      </span>
      <span className="min-w-0 flex-1 truncate text-[color:var(--text-secondary)]">
        {label}
        {value && (
          <span className="tabular text-[color:var(--text-faint)]"> · {value}</span>
        )}
      </span>
      {action}
    </li>
  );
}

export function HireReadiness({ priceU }: { priceU: number }) {
  const active = useActiveWallet();
  const funding = useWalletFunding(active.address, priceU);

  /*
   * Nothing is claimed while the balances are in flight. "Not funded" and
   * "not asked yet" look identical at that moment, and a red cross against
   * somebody who is perfectly funded is worse than a beat of silence.
   */
  const gasState = !funding.connected
    ? 'unknown'
    : !funding.gasKnown
      ? 'unknown'
      : funding.gasReady
        ? 'ready'
        : 'missing';
  const payState = !funding.connected
    ? 'unknown'
    : !funding.paymentKnown
      ? 'unknown'
      : funding.paymentReady
        ? 'ready'
        : 'missing';

  const linkClass =
    'shrink-0 text-[11px] font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2';

  return (
    <ul className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-4">
      <Row
        index={1}
        state={funding.connected ? 'ready' : 'missing'}
        label={funding.connected ? 'Wallet connected' : 'Connect a wallet'}
        value={
          funding.connected && active.address
            ? `${active.address.slice(0, 6)}…${active.address.slice(-4)}`
            : undefined
        }
      />
      <Row
        index={2}
        state={gasState}
        label="Gas"
        value={
          funding.native !== undefined
            ? `${Number(formatEther(funding.native)).toFixed(3)} ${NATIVE_SYMBOL}`
            : undefined
        }
        action={
          gasState === 'missing' && FAUCETS ? (
            <a
              href={FAUCETS.native}
              target="_blank"
              rel="noreferrer noopener"
              className={linkClass}
            >
              Get {NATIVE_SYMBOL} →
            </a>
          ) : null
        }
      />
      <Row
        index={3}
        state={payState}
        label="$U balance"
        value={
          funding.token?.ok
            ? Number(formatUnits(funding.token.raw, 18)).toFixed(2)
            : undefined
        }
        action={
          payState === 'missing' && FAUCETS?.paymentTokenBot ? (
            <a
              href={FAUCETS.paymentTokenBot.url}
              target="_blank"
              rel="noreferrer noopener"
              className={linkClass}
            >
              Get free $U →
            </a>
          ) : null
        }
      />
    </ul>
  );
}
