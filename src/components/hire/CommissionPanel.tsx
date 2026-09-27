'use client';

import Link from 'next/link';
import {
  explorerTxUrl,
  FAUCETS,
  NATIVE_SYMBOL,
  NETWORK_LABEL,
  PAYMENT_VALUE_NOTE,
} from '@/lib/network/presentation';
import {
  buildSwapCalls,
  quoteBnbForPaymentToken,
  type SwapQuote,
} from '@/lib/pancakeswap/swap';
import { createPublicClient, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { DEFAULT_BUDGET_U, formatBudget } from '@/lib/erc8183/pricing';
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
import { walletActionError } from '@/lib/wallet/errors';
import { WalletReadiness } from '@/components/hire/WalletReadiness';

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
  relationship: 'registry-agent' | 'separate-provider';
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
  const [budget, setBudget] = useState(DEFAULT_BUDGET_U);
  const [riskAccepted, setRiskAccepted] = useState(riskWarnings.length === 0);
  const [flowStep, setFlowStep] = useState<'configure' | 'review'>('configure');

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

  /*
   * The one failure a retry cannot clear. `assertPubliclyFetchable` refuses to
   * write a deliverable URL that points at a machine only the developer can
   * reach, and no amount of pressing retry changes where the app is deployed.
   */
  const isConfigFailure = Boolean(
    notificationDetail && /publicly fetchable|NEXT_PUBLIC_APP_URL/i.test(notificationDetail),
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
        agentName: agent.name,
        category: agent.category,
        provider: providerAddress as `0x${string}`,
        providerLabel: provider?.label,
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
        agentChainId: agent.chainId,
        agentTokenId: agent.tokenId,
        agentName: agent.name,
        providerLabel: provider?.label,
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
      setError(walletActionError(caught, 'Commissioning'));
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
      setError(walletActionError(caught, 'Status refresh'));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="flex flex-col gap-5">
      {state !== 'hired' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)]">
            <ol aria-label="Commission progress" className="grid grid-cols-2 border-b border-[color:var(--border)] bg-[color:var(--bg-subtle)]">
              {[
                { id: 'configure', label: 'Configure', number: 1 },
                { id: 'review', label: 'Review & fund', number: 2 },
              ].map((item) => {
                const active = flowStep === item.id;
                return (
                  <li key={item.id} className={cn('flex items-center gap-2 px-4 py-3 text-[11px]', active ? 'text-[color:var(--text)]' : 'text-[color:var(--text-faint)]')}>
                    <span className={cn('flex size-5 items-center justify-center rounded-full border text-[9px]', active ? 'border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand)]' : 'border-[color:var(--border)]')}>
                      {item.number}
                    </span>
                    <span className="font-medium">{item.label}</span>
                  </li>
                );
              })}
            </ol>

            {flowStep === 'configure' ? (
              <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">What should the agent deliver?</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                    Describe one specific outcome. Your final task and budget are written into the escrow job.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="task" className="text-xs font-medium">Task</label>
                  <textarea
                    id="task"
                    rows={5}
                    value={task}
                    disabled={state === 'hiring'}
                    onChange={(event) => setTask(event.target.value)}
                    className="rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-3 text-[13px] leading-relaxed outline-none transition-colors focus:border-[color:var(--brand)]"
                  />
                  <p className="text-[10px] text-[color:var(--text-faint)]">Include the expected result and any constraints. Do not include private keys or seed phrases.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="budget" className="text-xs font-medium">Escrow budget</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] focus-within:border-[color:var(--brand)]">
                      <input
                        id="budget"
                        type="number"
                        min={0.01}
                        max={5}
                        step={0.05}
                        value={budget}
                        disabled={state === 'hiring'}
                        onChange={(event) => setBudget(Number(event.target.value))}
                        className="mono w-24 bg-transparent px-3 py-2 text-[13px] outline-none"
                      />
                      <span className="border-l border-[color:var(--border)] px-3 py-2 text-[12px] text-[color:var(--text-muted)]">$U</span>
                    </div>
                    {[0.05, 0.1, 0.25, 0.5].map((amount) => (
                      <button key={amount} type="button" onClick={() => setBudget(amount)} className={cn('min-h-10 rounded-full border px-3 text-[11px]', budget === amount ? 'border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)]' : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)]')}>
                        {amount} $U
                      </button>
                    ))}
                  </div>
                  {PAYMENT_VALUE_NOTE && <p className="text-[10px] text-[color:var(--text-faint)]">{PAYMENT_VALUE_NOTE}</p>}
                </div>

                <details className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)]">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[11px] font-medium [&::-webkit-details-marker]:hidden">
                    <span>Advanced · delivery route</span>
                    <span className="text-[color:var(--text-faint)]">{provider?.label ?? 'Choose provider'} · change</span>
                  </summary>
                  <div className="flex flex-col gap-2 border-t border-[color:var(--border)] p-3">
                    <p className="text-[10px] leading-relaxed text-[color:var(--text-muted)]">The agent is the identity you evaluated. The delivery provider is the address that receives this testnet escrow and returns the work.</p>
                    {providers.map((option) => (
                      <button
                        key={option.address}
                        type="button"
                        onClick={() => setProviderAddress(option.address)}
                        className={cn('flex flex-col gap-1 rounded-[var(--radius)] border p-3 text-left', providerAddress === option.address ? 'border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)]' : 'border-[color:var(--border)]')}
                      >
                        <span className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                          {option.label}
                          <span className={cn('rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide', option.reachable ? 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : 'bg-[color:var(--caution-dim)] text-[color:var(--caution)]')}>
                            {option.automatedDelivery ? 'recommended' : option.reachable ? 'compatible' : 'different chain'}
                          </span>
                        </span>
                        <span className="mono text-[10px] text-[color:var(--text-faint)]">{shortAddress(option.address)}</span>
                        <span className="text-[10px] leading-relaxed text-[color:var(--text-muted)]">{option.note}</span>
                      </button>
                    ))}
                  </div>
                </details>

                <button
                  type="button"
                  onClick={() => setFlowStep('review')}
                  disabled={!task.trim() || !Number.isFinite(budget) || budget < 0.01 || budget > 5 || !provider?.reachable}
                  className="action-primary flex min-h-11 w-full items-center justify-center rounded-[var(--radius)] px-5 text-[13px] font-semibold sm:w-fit sm:self-end"
                >
                  Review commission
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-5 p-4 sm:p-6">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Review before funding</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">Nothing moves until your passkey wallet signs the escrow transaction.</p>
                </div>

                <WalletReadiness requiredBudgetU={budget} />

                {riskWarnings.length > 0 && (
                  <div className="rounded-[var(--radius)] border border-[color:var(--caution)]/40 bg-[color:var(--caution-dim)] p-4">
                    <p className="text-[11px] font-semibold text-[color:var(--caution)]">Additional risk acceptance required</p>
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
                      {riskWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
                      <input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[color:var(--brand)]" />
                      I understand these warnings and still want to fund this commission.
                    </label>
                  </div>
                )}

                {provider?.relationship === 'separate-provider' && (
                  <div className="rounded-[var(--radius)] border border-[color:var(--info)]/30 bg-[color:var(--info-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
                    <strong>{agent.name}</strong> is the identity being evaluated. <strong>{provider.label}</strong> delivers this testnet job. Both are recorded in the immutable job envelope.
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ['1', 'Funded', 'Your budget enters ERC-8183 escrow.'],
                    ['2', 'Delivered', 'The provider submits an execution receipt.'],
                    ['3', 'Released', 'Escrow releases after accepted delivery.'],
                  ].map(([number, label, copy]) => (
                    <div key={number} className="rounded-[var(--radius)] border border-[color:var(--border)] p-3">
                      <span className="flex size-5 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[9px] text-[color:var(--brand)]">{number}</span>
                      <p className="mt-2 text-[11px] font-medium">{label}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-[color:var(--text-muted)]">{copy}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setFlowStep('configure')} disabled={state === 'hiring'} className="min-h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 text-[12px] font-medium">
                    Back to edit
                  </button>
                  <button
                    type="button"
                    onClick={commission}
                    disabled={state === 'hiring' || locked || !providerAddress || !provider?.reachable || !riskAccepted || task.trim().length === 0}
                    title={reason ?? undefined}
                    className="action-primary min-h-11 rounded-[var(--radius)] px-5 text-[13px] font-semibold"
                  >
                    {state === 'hiring' ? (stage === 'swapping' ? 'Acquiring $U…' : 'Funding escrow…') : locked ? 'Connect passkey wallet to fund' : `Fund ${formatBudget(budget)} commission`}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="border-t border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-4">
                <p className="text-[11px] font-medium text-[color:var(--negative)]">The job was not created</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">{error}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {FAUCETS && /tBNB/i.test(error) && <a href={FAUCETS.native} target="_blank" rel="noreferrer noopener" className="text-[11px] font-medium text-[color:var(--info)] underline decoration-dotted">Open BNB testnet faucet ↗</a>}
                  {FAUCETS && /\$U/i.test(error) && <a href={FAUCETS.paymentToken} target="_blank" rel="noreferrer noopener" className="text-[11px] font-medium text-[color:var(--info)] underline decoration-dotted">Open testnet $U faucet ↗</a>}
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] lg:sticky lg:top-24">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand)]">Commission summary</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold [overflow-wrap:anywhere]">{agent.name}</p>
            </div>
            <dl className="flex flex-col divide-y divide-[color:var(--border)] text-[11px]">
              <div className="p-4"><dt className="text-[color:var(--text-faint)]">Task</dt><dd className="mt-1 line-clamp-3 leading-relaxed">{task.trim() || 'Not described yet'}</dd></div>
              <div className="flex items-start justify-between gap-3 p-4"><dt className="text-[color:var(--text-faint)]">Budget</dt><dd className="tabular text-right font-semibold">{formatBudget(budget)}</dd></div>
              <div className="flex items-start justify-between gap-3 p-4"><dt className="text-[color:var(--text-faint)]">Escrow</dt><dd className="text-right">ERC-8183 · {NETWORK_LABEL}</dd></div>
              <div className="flex items-start justify-between gap-3 p-4"><dt className="text-[color:var(--text-faint)]">Delivery</dt><dd className="text-right">{provider?.label ?? 'Not selected'}</dd></div>
              <div className="flex items-start justify-between gap-3 p-4"><dt className="text-[color:var(--text-faint)]">Wallet access</dt><dd className="text-right font-medium text-[color:var(--positive)]">None</dd></div>
            </dl>
            <div className="border-t border-[color:var(--border)] bg-[color:var(--positive-dim)] px-4 py-3 text-[10px] leading-relaxed text-[color:var(--positive)]">
              Funds release through the job lifecycle—not when you open this page.
            </div>
          </aside>
        </div>
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

      {/*
        The receipt is contained and centred. Left to fill the page it
        stretched a short confirmation across sixteen hundred pixels, which is
        what made it read as cluttered rather than dense — the design keeps the
        same content in a column you can take in at a glance.
      */}
      {job && (
        <div className="surface-card mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
          {/*
            The moment the money moves deserves more than an 11px line at the
            foot of the form it came from. It names the agent, because "Job
            #1353 created" tells you a row exists somewhere and not that the
            thing you wanted is now happening.

            It stops short of congratulating anyone. The escrow is funded and
            nothing has been delivered, so the heading says begun rather than
            done, and the lifecycle track underneath carries the rest.
          */}
          <div className="flex flex-col items-center gap-2 text-center">
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-full bg-[color:var(--positive-dim)]"
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-[color:var(--positive)]" strokeWidth="2.2">
                <path d="m5 13 4 4L19 7" />
              </svg>
            </span>
            <h3 className="font-[family-name:var(--font-serif)] text-xl">
              {job.agentName} is ready to begin.
            </h3>
            <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
              Job #{job.jobId} is funded on {NETWORK_LABEL}.{' '}
              {job.hireTxHash ? (
                <a
                  href={explorerTxUrl(job.hireTxHash)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
                >
                  {shortHash(job.hireTxHash)} ↗
                </a>
              ) : null}
            </p>
            <Link
              href="/my-agents"
              className="action-primary mt-1 inline-flex items-center rounded-[var(--radius)] px-4 py-2.5 text-[13px]"
            >
              Track in My agents
            </Link>
          </div>

          <JobStatusTrack status={job.status} />

          <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            {JOB_STAGE_COPY[job.status]}
          </p>

          <dl className="grid gap-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3 text-[10px] sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="uppercase tracking-wide text-[color:var(--text-faint)]">
                ERC-8004 identity
              </dt>
              <dd className="mt-1 break-words text-[color:var(--text-secondary)] [overflow-wrap:anywhere]">
                {agent.name} · chain {agent.chainId} · token #{agent.tokenId}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="uppercase tracking-wide text-[color:var(--text-faint)]">
                ERC-8183 provider
              </dt>
              <dd className="mono mt-1 break-all text-[color:var(--text-secondary)]">
                {provider?.label ?? 'Provider'} · {job.provider}
              </dd>
            </div>
          </dl>

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
                        ? 'The seller was not notified'
                        : 'Delivery not automatically requested'}
              </span>

              {/*
                §16. What happened to the money, before what happened to the
                request. The escrow is funded and on chain by this point; only
                the notification failed, and a buyer reading "Seller
                notification failed" has no way to know their 0.10 $U is not
                the thing that went wrong.
              */}
              {notification === 'failed' && (
                <p className="mt-1">
                  Your escrow is funded and the job exists on chain. Nothing
                  was lost — the seller simply has not been told yet.
                </p>
              )}

              {/*
                The detail is the developer's line, not the buyer's, so it is
                set smaller and quieter than the sentence about their money.

                It used to be followed by a paragraph of mine restating it —
                that the URL is written on chain, that the origin has to be
                reachable, that this is configuration rather than a hiccup.
                The detail already says all three, and saying them twice is
                what made this box read as noise rather than as an answer.

                Retry is still withheld when the cause is configuration:
                pressing it produces the same refusal every time, and offering
                the button implies otherwise.
              */}
              {notificationDetail && (
                <p className="mt-1.5 text-[11px] leading-relaxed opacity-75">
                  {notificationDetail}
                </p>
              )}

              {((notification === 'failed' && !isConfigFailure) ||
                notification === 'rejected') && (
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

          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
            >
              {refreshing ? 'Reading chain…' : 'Refresh status'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
