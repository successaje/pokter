'use client';

import { formatEther, formatUnits } from 'viem';
import { useConnect, useSwitchChain } from 'wagmi';

import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { useActiveWallet } from '@/lib/wallet/active';
import { useWalletFunding } from '@/lib/wallet/use-funding';
import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { shortAddress } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/components/ui/Button';
import { useGasSponsorship } from '@/lib/wallet/sponsor-client';

type RowState = 'ready' | 'missing' | 'unknown';

/**
 * What has to be true before a hire can go through, each with its fix.
 *
 * One component for both wallets and both places it appears. A missing item
 * is never only a mark: the thing that fixes it sits in the same row, so
 * connect, switch network or the faucet is one tap from the reason.
 */
function Row({ state, label, value, fix }: { state: RowState; label: string; value?: string; fix?: React.ReactNode }) {
  return (
    <li className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1 text-body-s">
      <span
        aria-hidden
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
          state === 'ready' ? 'bg-positive text-brand-ink' : state === 'missing' ? 'border border-caution text-caution' : 'border border-line-strong text-ink-faint',
        )}
      >
        {state === 'ready' ? '✓' : state === 'missing' ? '!' : '·'}
      </span>
      <span className="sr-only">{state === 'ready' ? 'Ready:' : state === 'missing' ? 'Needed:' : 'Checking:'}</span>
      <span className="min-w-0 flex-1 truncate text-ink-secondary">
        {label}
        {value && <span className="tabular text-ink-faint"> · {value}</span>}
      </span>
      {fix && <span className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">{fix}</span>}
    </li>
  );
}

const linkClass = 'tap text-meta font-medium text-info underline decoration-dotted underline-offset-2';

export function ReadinessRow({
  priceU,
  variant = 'glance',
  className,
}: {
  priceU: number;
  /** `full` offers connect and passkey actions inline; `glance` only reports. */
  variant?: 'glance' | 'full';
  className?: string;
}) {
  const active = useActiveWallet();
  const passkey = usePasskeyWallet();
  const funding = useWalletFunding(active.address, priceU);
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0];

  const sponsored = useGasSponsorship() && active.mode === 'passkey';
  const walletState: RowState = active.mode ? 'ready' : 'missing';
  const networkState: RowState = active.wrongChain ? 'missing' : active.mode ? 'ready' : 'unknown';
  const gasState: RowState = !funding.connected || !funding.gasKnown ? 'unknown' : funding.gasReady || sponsored ? 'ready' : 'missing';
  const payState: RowState = !funding.connected || !funding.paymentKnown ? 'unknown' : funding.paymentReady ? 'ready' : 'missing';

  return (
    <ul className={cn('flex flex-col gap-1', className)} aria-label="What funding needs">
      <Row
        state={walletState}
        label={active.mode ? (active.mode === 'passkey' ? 'Passkey wallet' : 'Your wallet') : 'A wallet to sign'}
        value={active.address ? shortAddress(active.address) : undefined}
        fix={
          variant === 'full' && !active.mode ? (
            <>
              {injected && (
                <Button size="sm" onClick={() => connect({ connector: injected })} loading={connecting}>
                  Use my own wallet
                </Button>
              )}
              {passkey.supported && (
                <Button size="sm" onClick={() => passkey.create()} loading={passkey.busy === 'creating'} disabled={passkey.busy !== null}>
                  Create a passkey wallet
                </Button>
              )}
            </>
          ) : null
        }
      />
      {(active.wrongChain || active.mode === 'external') && (
        <Row
          state={networkState}
          label={active.wrongChain ? 'Wrong network' : ESCROW_CHAIN.name}
          fix={
            active.wrongChain ? (
              <Button size="sm" onClick={() => switchChain({ chainId: ESCROW_CHAIN.id })} loading={switching}>
                Switch to {ESCROW_CHAIN.name}
              </Button>
            ) : null
          }
        />
      )}
      <Row
        state={gasState}
        label={sponsored && !funding.gasReady ? 'Gas · Pokter covers the fee' : 'Gas'}
        value={sponsored && !funding.gasReady ? undefined : funding.native !== undefined ? `${Number(formatEther(funding.native)).toFixed(3)} ${NATIVE_SYMBOL}` : undefined}
        fix={
          gasState === 'missing' && FAUCETS ? (
            <a href={FAUCETS.native} target="_blank" rel="noreferrer noopener" className={linkClass}>
              Get {NATIVE_SYMBOL} ↗
            </a>
          ) : null
        }
      />
      <Row
        state={payState}
        label="$U for the budget"
        value={funding.token?.ok ? `${Number(formatUnits(funding.token.raw, 18)).toFixed(2)} $U` : undefined}
        fix={
          payState === 'missing' && FAUCETS?.paymentTokenBot ? (
            <a href={FAUCETS.paymentTokenBot.url} target="_blank" rel="noreferrer noopener" className={linkClass}>
              Get free $U ↗
            </a>
          ) : null
        }
      />
      {passkey.error && variant === 'full' && (
        <li className="text-meta text-negative" role="alert">
          {passkey.error}
        </li>
      )}
    </ul>
  );
}
