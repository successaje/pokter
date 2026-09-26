'use client';

import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';
import {
  buildSwapCalls,
  quoteBnbForPaymentToken,
  type SwapQuote,
} from '@/lib/pancakeswap/swap';
import { createPublicClient, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { shortAddress, shortHash } from '@/lib/ui/format';
import { JOB_STAGE_COPY, type HiredJob } from '@/lib/erc8183/types';
import { JobStatusTrack } from '@/components/jobs/JobStatus';
import { useCommitLock } from '@/components/hire/WalletGate';
import {
  usePasskeySigner,
  usePasskeyWallet,
} from '@/components/wallet/PasskeyProvider';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { rememberJob } from '@/lib/wallet/activity';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { encodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { hireErc8183Agent } from '@altananetwork/sdk';
import { formatEther, formatUnits, parseUnits } from 'viem';

/**
 * A provider the escrow can actually reach.
 *
 * The marketplace indexes agents on BSC mainnet, while the ERC-8183 escrow we
 * can fund runs on testnet. A job created on chain 97 is invisible to a runtime
 * listening on chain 56, so commissioning against a mainnet agent's wallet
 * would produce a real transaction that no one will ever answer. Rather than
 * hide that, the panel says so and offers a provider that is demonstrably live
 * on the escrow chain.
 */
export interface ProviderChoice {
  address: string;
  label: string;
  note: string;
  reachable: boolean;
  automatedDelivery: boolean;
}

const MIN_TRANSACTION_GAS = parseUnits('0.002', 18);

/**
 * A read-only client for quoting the swap.
 *
 * Built per attempt rather than held: it is used once, immediately before
 * signing, and keeping a long-lived client around would invite quoting from a
 * connection older than the decision it informs.
 */
function readClient() {
  return createPublicClient({
    chain: WALLET_NETWORK.chainId === 56 ? bsc : bscTestnet,
    transport: http(),
  });
}

export function CommissionPanel({
  agent,
  providers,
  escrowChainId,
  explorerBase,
  riskWarnings = [],
}: {
  agent: {
    chainId: number;
    tokenId: string;
    name: string;
    category: string;
    wallet?: string | null;
  };
  providers: ProviderChoice[];
  escrowChainId: number;
  explorerBase: string;
  riskWarnings?: string[];
}) {
  const { locked, reason } = useCommitLock();
  const { wallet } = usePasskeyWallet();
  const signer = usePasskeySigner();
  const [providerAddress, setProviderAddress] = useState(
    providers.find((p) => p.reachable)?.address ?? providers[0]?.address ?? '',
  );
  const [task, setTask] = useState(
    'Create a verifiable execution receipt for this escrowed job. Include the chain, client, provider, budget and funded status.',
  );
  const [budget, setBudget] = useState(0.1);
  const [riskAccepted, setRiskAccepted] = useState(riskWarnings.length === 0);

  const [stage, setStage] = useState<'swapping' | 'hiring'>('hiring');
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [state, setState] = useState<'idle' | 'hiring' | 'hired' | 'error'>(
    'idle',
  );
  const [job, setJob] = useState<HiredJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notification, setNotification] = useState<
    'idle' | 'notifying' | 'accepted' | 'rejected' | 'failed' | 'not-applicable'
  >('idle');
  const [notificationDetail, setNotificationDetail] = useState<string | null>(
    null,
  );

  const provider = providers.find((p) => p.address === providerAddress);

  const notifySeller = async (hired: HiredJob) => {
    if (!provider?.automatedDelivery) {
      setNotification('not-applicable');
      setNotificationDetail(
        'Escrow is funded, but this seller has no discoverable delivery endpoint. Delivery was not automatically requested.',
      );
      return;
    }

    setNotification('notifying');
    setNotificationDetail(null);
    try {
      const response = await fetch('/api/notify-funded', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // The chain the agent is registered on, not the escrow chain.
          agentChainId: agent.chainId,
          tokenId: agent.tokenId,
          jobId: hired.jobId,
          provider: hired.provider,
        }),
      });
      const payload = (await response.json()) as {
        status?: string;
        error?: string;
        deliverableUrl?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? 'Seller notification failed.');
      if (payload.status === 'accepted') {
        setNotification('accepted');
        setNotificationDetail(
          'The seller verified the funded job and accepted the delivery request.',
        );
        try {
          const { getErc8183Job, getErc8183DeliverableUrl } = await import(
            '@altananetwork/sdk'
          );
          const current = await getErc8183Job(
            WALLET_NETWORK,
            BigInt(hired.jobId),
          );
          const deliverableUrl =
            payload.deliverableUrl ??
            (await getErc8183DeliverableUrl(
              WALLET_NETWORK,
              BigInt(hired.jobId),
            ).catch(() => undefined)) ??
            null;
          const updated: HiredJob = {
            ...hired,
            status: current.statusName,
            statusCheckedAt: new Date().toISOString(),
            deliverableUrl,
          };
          setJob(updated);
          if (wallet) rememberJob(wallet.address, updated);
        } catch {
          setNotificationDetail(
            'The seller accepted delivery. Refresh the on-chain status if the submitted receipt does not appear yet.',
          );
        }
      } else {
        setNotification('rejected');
        setNotificationDetail(
          'The seller verified the job but rejected the delivery request.',
        );
      }
    } catch (caught) {
      setNotification('failed');
      setNotificationDetail((caught as Error).message);
    }
  };

  const commission = async () => {
    setState('hiring');
    setStage('hiring');
    setSwapQuote(null);
    setError(null);
    try {
      if (!wallet || !signer) throw new Error('A passkey wallet is required.');
      if (!provider?.reachable) {
        throw new Error('Choose a provider that is live on the escrow chain.');
      }
      if (!Number.isFinite(budget) || budget < 0.01 || budget > 5) {
        throw new Error('The budget must be between 0.01 and 5 $U.');
      }
      if (!task.trim())
        throw new Error('Describe the work before funding escrow.');
      const committedTask = encodePokterJobEnvelope({
        identityChainId: agent.chainId,
        agentTokenId: agent.tokenId,
        category: agent.category,
        provider: providerAddress as `0x${string}`,
        task,
      });

      const budgetRaw = parseUnits(String(budget), 18);
      const { paymentToken } = correctedErc8183Addresses(
        WALLET_NETWORK.chainId,
      );
      const balances = await walletClient().balances({
        wallet: wallet.address,
        tokens: [paymentToken],
      });
      if (balances.native < MIN_TRANSACTION_GAS) {
        throw new Error(
          `Your passkey wallet needs at least 0.002 ${NATIVE_SYMBOL} before it can fund escrow.`,
        );
      }
      const paymentBalance = balances.tokens?.[0];
      const held = paymentBalance?.ok ? paymentBalance.raw : 0n;

      if (held < budgetRaw) {
        /*
         * Acquire exactly the shortfall, then hire.
         *
         * POK-018: this is two transactions, not one. `hireErc8183Agent`
         * executes its own batch and takes no extra calls, so making this
         * atomic would mean rebuilding the hire from `buildHireCalls` and
         * reproducing the SDK's jobId prediction and expiry arithmetic — two
         * things it already gets right, re-derived by hand on a path that
         * moves money.
         *
         * The sequential failure is mild by comparison. If the hire fails
         * after the swap, the user holds exactly the $U they needed, in a
         * liquid stablecoin, and pressing commission again works. They are
         * one retry further along, not stranded — and the error below says
         * so rather than leaving them to guess.
         */
        setStage('swapping');
        const shortfall = budgetRaw - held;

        // POK-019: quoted here, immediately before signing, not at render.
        const quote = await quoteBnbForPaymentToken(
          readClient(),
          paymentToken,
          shortfall,
        );
        if (!quote) {
          throw new Error(
            `No PancakeSwap route to $U is available right now. Fund the wallet with at least ${budget} $U directly.`,
          );
        }
        if (balances.native < quote.amountInMaximum + MIN_TRANSACTION_GAS) {
          throw new Error(
            `Swapping for ${formatUnits(shortfall, 18)} $U needs about ` +
              `${formatEther(quote.amountInMaximum)} ${NATIVE_SYMBOL} plus gas, ` +
              `and this wallet holds ${formatEther(balances.native)}.`,
          );
        }

        setSwapQuote(quote);
        await walletClient().execute({
          wallet: { address: wallet.address },
          signer,
          // POK-021: signed by the user's own admin authority, so no agent
          // session gains the router as an allowlisted target.
          calls: buildSwapCalls(quote, paymentToken, wallet.address),
          chainId: WALLET_NETWORK.chainId,
        });
        setStage('hiring');
      }

      const outcome = await hireErc8183Agent(
        { address: wallet.address },
        signer,
        {
          provider: providerAddress as `0x${string}`,
          task: committedTask,
          budget: budgetRaw,
        },
        { network: WALLET_NETWORK },
      );
      const now = new Date().toISOString();
      const hired: HiredJob = {
        id: crypto.randomUUID(),
        jobId: outcome.jobId.toString(),
        chainId: WALLET_NETWORK.chainId,
        isTestnet: WALLET_NETWORK.chainId === 97,
        agentTokenId: agent.tokenId,
        agentName: provider?.label ?? agent.name,
        provider: outcome.provider,
        task,
        budgetRaw: outcome.budget.toString(),
        expiredAt: new Date(Number(outcome.expiredAt) * 1000).toISOString(),
        hiredAt: now,
        hireTxHash: outcome.transactionHash ?? null,
        status: 'FUNDED',
        statusCheckedAt: now,
        deliverableUrl: null,
        settleTxHash: null,
      };
      rememberJob(wallet.address, hired);
      setJob(hired);
      setState('hired');
      await notifySeller(hired);
    } catch (caught) {
      setError((caught as Error).message);
      setState('error');
    }
  };

  const refresh = async () => {
    if (!job) return;
    setRefreshing(true);
    try {
      const { getErc8183Job, getErc8183DeliverableUrl } = await import(
        '@altananetwork/sdk'
      );
      const current = await getErc8183Job(WALLET_NETWORK, BigInt(job.jobId));
      const deliverableUrl =
        job.deliverableUrl ??
        (current.statusName === 'SUBMITTED' ||
        current.statusName === 'COMPLETED'
          ? await getErc8183DeliverableUrl(
              WALLET_NETWORK,
              BigInt(job.jobId),
            ).catch(() => undefined)
          : undefined) ??
        null;
      const updated: HiredJob = {
        ...job,
        status: current.statusName,
        statusCheckedAt: new Date().toISOString(),
        deliverableUrl,
      };
      setJob(updated);
      if (wallet) rememberJob(wallet.address, updated);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Commission work</h3>
        <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          Funds an ERC-8183 escrow from your passkey wallet. The budget is held
          by the kernel and released only through its job lifecycle.
        </p>
      </div>

      {riskWarnings.length > 0 && (
        <div className="rounded-[var(--radius)] border border-[color:var(--caution)]/40 bg-[color:var(--caution-dim)] p-3">
          <p className="text-[11px] font-semibold text-[color:var(--caution)]">
            Proceed with extra caution
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
            {riskWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
            <input
              type="checkbox"
              checked={riskAccepted}
              onChange={(event) => setRiskAccepted(event.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 accent-[color:var(--brand)]"
            />
            I reviewed the warnings above, explicitly accept the additional
            risk, and still want to commission this agent.
          </label>
        </div>
      )}

      {provider && !provider.reachable && (
        <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--caution)]">
          {agent.name} is registered on chain {agent.chainId}, but the escrow we
          can fund runs on chain {escrowChainId}. A job created here would be a
          real transaction that this agent&apos;s runtime never sees. Pick a
          provider live on the escrow chain to see the flow actually complete.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs text-[color:var(--text-muted)]">Provider</span>
        <div className="flex flex-col gap-2">
          {providers.map((option) => (
            <button
              key={option.address}
              type="button"
              onClick={() => setProviderAddress(option.address)}
              disabled={state === 'hiring' || state === 'hired'}
              className={cn(
                'flex flex-col gap-0.5 rounded-[var(--radius)] border p-3 text-left transition-colors',
                providerAddress === option.address
                  ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)]'
                  : 'border-[color:var(--border)] hover:border-[color:var(--border-strong)]',
              )}
            >
              <span className="flex items-center gap-2 text-[12px] font-medium">
                {option.label}
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                  style={{
                    background: option.reachable
                      ? 'var(--positive-dim)'
                      : 'var(--caution-dim)',
                    color: option.reachable
                      ? 'var(--positive)'
                      : 'var(--caution)',
                  }}
                >
                  {option.automatedDelivery
                    ? 'ready end to end'
                    : option.reachable
                      ? 'on escrow chain'
                      : 'different chain'}
                </span>
              </span>
              <span className="mono text-[10px] text-[color:var(--text-faint)]">
                {shortAddress(option.address)}
              </span>
              <span className="text-[10px] leading-relaxed text-[color:var(--text-muted)]">
                {option.note}
              </span>
            </button>
          ))}
        </div>
      </div>

      {provider?.automatedDelivery && (
        <p className="rounded-[var(--radius)] border border-[color:var(--brand)]/35 bg-[color:var(--brand-highlight-soft)] p-3 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          <span className="font-medium text-[color:var(--text)]">
            Guided testnet delivery.
          </span>{' '}
          This seller verifies the funded job and returns a canonical execution
          receipt. It demonstrates the complete escrow lifecycle; it does not
          claim trading performance or provide investment advice.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="task"
          className="text-xs text-[color:var(--text-muted)]"
        >
          Task
        </label>
        <textarea
          id="task"
          rows={3}
          value={task}
          disabled={state === 'hiring' || state === 'hired'}
          onChange={(event) => setTask(event.target.value)}
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-2.5 text-[12px] leading-relaxed"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="budget"
          className="text-xs text-[color:var(--text-muted)]"
        >
          Budget
        </label>
        <div className="flex items-center gap-2">
          <input
            id="budget"
            type="number"
            min={0.01}
            max={5}
            step={0.05}
            value={budget}
            disabled={state === 'hiring' || state === 'hired'}
            onChange={(event) => setBudget(Number(event.target.value))}
            className="mono w-28 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-2.5 py-1.5 text-[13px]"
          />
          <span className="text-[13px] text-[color:var(--text-muted)]">
            $U escrowed
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-3">
          <p className="text-[11px] font-medium text-[color:var(--negative)]">
            The job was not created
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
            {error}
          </p>
          {FAUCETS && /tBNB/i.test(error) && (
            <a
              href={FAUCETS.native}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-[11px] font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2"
            >
              Open the official BNB testnet faucet ↗
            </a>
          )}
          {FAUCETS && /\$U/i.test(error) && (
            <a
              href={FAUCETS.paymentToken}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-[11px] font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2"
            >
              Open the testnet $U faucet ↗
            </a>
          )}
        </div>
      )}

      {state !== 'hired' && (
        <button
          type="button"
          onClick={commission}
          disabled={
            state === 'hiring' ||
            locked ||
            !providerAddress ||
            !provider?.reachable ||
            !riskAccepted ||
            task.trim().length === 0
          }
          title={reason ?? undefined}
          className="action-primary w-fit rounded-[var(--radius)] px-4 py-2 text-[13px]"
        >
          {state === 'hiring'
            ? stage === 'swapping'
              ? `Acquiring $U…`
              : 'Funding escrow…'
            : locked
              ? 'Create a passkey to commission'
              : `Commission for ${budget} $U`}
        </button>
      )}

      {/*
        What the swap cost, once it has happened. Shown because the user
        authorised a maximum and was charged the real price — the difference
        is refunded in the same transaction, and they should be able to see
        that rather than take it on trust.
      */}
      {swapQuote && (
        <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          Acquired {formatUnits(swapQuote.amountOut, 18)} $U for about{' '}
          <span className="mono">
            {Number(formatEther(swapQuote.amountIn)).toFixed(6)} {NATIVE_SYMBOL}
          </span>{' '}
          through PancakeSwap. You authorised at most{' '}
          <span className="mono">
            {Number(formatEther(swapQuote.amountInMaximum)).toFixed(6)}
          </span>
          ; the remainder was refunded in the same transaction.
        </p>
      )}

      {job && (
        <div className="flex flex-col gap-3 border-t border-[color:var(--border)] pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-medium text-[color:var(--positive)]">
              Job #{job.jobId} created
            </span>
            <span className="mono text-[10px] text-[color:var(--text-faint)]">
              chain {job.chainId}
              {job.isTestnet && ' · testnet'}
            </span>
          </div>

          <JobStatusTrack status={job.status} />

          <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            {JOB_STAGE_COPY[job.status]}
          </p>

          {notification !== 'idle' && (
            <div
              className={cn(
                'rounded-[var(--radius)] border p-3 text-[11px] leading-relaxed',
                notification === 'accepted'
                  ? 'border-[color:var(--positive)]/30 bg-[color:var(--positive-dim)] text-[color:var(--positive)]'
                  : notification === 'notifying'
                    ? 'border-[color:var(--info)]/30 bg-[color:var(--info-dim)] text-[color:var(--info)]'
                    : 'border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] text-[color:var(--caution)]',
              )}
            >
              <span className="font-medium">
                {notification === 'accepted'
                  ? 'Delivery accepted'
                  : notification === 'notifying'
                    ? 'Notifying seller…'
                    : notification === 'rejected'
                      ? 'Delivery declined'
                      : notification === 'failed'
                        ? 'Seller notification failed'
                        : 'Delivery not automatically requested'}
              </span>
              {notificationDetail && (
                <p className="mt-1">{notificationDetail}</p>
              )}
              {(notification === 'failed' || notification === 'rejected') && (
                <button
                  type="button"
                  onClick={() => notifySeller(job)}
                  className="mt-2 font-medium underline decoration-dotted underline-offset-2"
                >
                  Retry seller notification
                </button>
              )}
            </div>
          )}

          {job.hireTxHash && (
            <a
              href={`${explorerBase}/tx/${job.hireTxHash}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mono w-fit text-[11px] text-[color:var(--info)] underline decoration-dotted underline-offset-2"
            >
              {shortHash(job.hireTxHash)}
            </a>
          )}

          {job.deliverableUrl && (
            <a
              href={job.deliverableUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="w-fit rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              Review submitted deliverable →
            </a>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
            >
              {refreshing ? 'Reading chain…' : 'Refresh status'}
            </button>
            <a
              href="/my-agents"
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              View in My agents →
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
