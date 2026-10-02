'use client';

import Link from 'next/link';
import {
  explorerTxUrl,
  FAUCETS,
  NATIVE_SYMBOL,
  NETWORK_LABEL,
  PAYMENT_VALUE_NOTE, chainLabel} from '@/lib/network/presentation';
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
import { supportMailto } from '@/lib/support/contact';
import { shortAddress, shortHash } from '@/lib/ui/format';
import {
  JOB_STAGE_COPY,
  type HiredJob,
  type JobStatusName,
} from '@/lib/erc8183/types';
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
import { useActiveWallet } from '@/lib/wallet/active';
import { ExternalHireSteps } from '@/components/hire/ExternalHireSteps';
import type { HireStep } from '@/lib/wallet/external';
import {
  hireFromExternalWallet,
  revokeExternalWalletAllowance,
} from '@/lib/wallet/external';
import { WalletReadiness } from '@/components/hire/WalletReadiness';
import {
  commissionTaskTemplates,
  type CommissionTaskTemplate,
} from '@/lib/hire/taskTemplates';
import { commissionAuthority } from '@/lib/hire/commission-authority';
import { CommissionAuthorityReview } from '@/components/hire/CommissionAuthorityReview';

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
 * What the receipt says at the top, for each state the job can be in.
 *
 * The heading and the line beneath it used to be written for the instant the
 * escrow was funded and then never moved. Seen against a real delivered job
 * the card contradicted itself: "is ready to begin" and "is funded" sat four
 * lines above "Provider delivered", a lifecycle track pointing at SUBMITTED
 * and an accepted delivery. The track was honest and the headline was stale.
 *
 * `standing` is a verb phrase that has to read into "Job #N ___ on BNB
 * Testnet." Anything longer breaks it: "has a deliverable awaiting your
 * review" put the network on the reviewing, and "expired; the escrow is
 * reclaimable" swallowed it in a subordinate clause. What the state means for
 * the money is JOB_STAGE_COPY's job, immediately below.
 *
 * `settled` marks the states where a green tick would be a lie.
 */
const RECEIPT_HEADLINE: Record<
  JobStatusName,
  { heading: (agent: string) => string; standing: string; settled: boolean }
> = {
  OPEN: {
    heading: (agent) => `${agent} is ready to begin.`,
    standing: 'is open',
    settled: false,
  },
  FUNDED: {
    heading: (agent) => `${agent} is ready to begin.`,
    standing: 'is funded',
    settled: false,
  },
  SUBMITTED: {
    heading: (agent) => `${agent} has delivered.`,
    standing: 'has a submitted deliverable',
    settled: false,
  },
  COMPLETED: {
    heading: (agent) => `${agent} was paid.`,
    standing: 'is complete',
    settled: false,
  },
  REJECTED: {
    heading: () => 'This delivery was rejected.',
    standing: 'is in dispute',
    settled: true,
  },
  EXPIRED: {
    heading: (agent) => `${agent} never delivered.`,
    standing: 'expired',
    settled: true,
  },
};

/**
 * One mark per outcome, so the three cards can be told apart before they are
 * read. They are distinct actions — assess, decide, watch — and a row of three
 * identical boxes makes the reader parse prose to find that out.
 */
const TEMPLATE_ICON: Record<string, React.ReactNode> = {
  analyse: (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5M9 11h4M11 9v4" />
    </svg>
  ),
  recommend: (
    // A lamp rather than a signpost: two arms and a post collapse into a
    // squiggle at sixteen pixels, which is the only size this is ever drawn.
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" />
    </svg>
  ),
  monitor: (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ),
};

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
  signedQuoteU = null,
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
  /**
   * What this agent signed for its own work, in whole $U, when the quote is
   * still current. Null when it has never named a price or the quote lapsed.
   */
  signedQuoteU?: number | null;
  riskWarnings?: string[];
}) {
  const { locked, reason } = useCommitLock();
  const { wallet } = usePasskeyWallet();
  const signer = usePasskeySigner();
  const taskTemplates = commissionTaskTemplates(agent.category);
  const [providerAddress, setProviderAddress] = useState(
    providers.find((p) => p.reachable)?.address ?? providers[0]?.address ?? '',
  );
  const [selectedTemplate, setSelectedTemplate] = useState<
    CommissionTaskTemplate['id'] | null
  >(taskTemplates[0].id);
  const [task, setTask] = useState(taskTemplates[0].task);
  /*
   * The agent's own price, when it has one.
   *
   * This defaulted to a flat 0.10 $U regardless of what the agent had
   * signed, so an agent advertising 0.05 on its card arrived here asking for
   * double — the buyer picked a price and was quietly charged another. The
   * default is the quote where one exists; the preset buttons still let it
   * be changed, because the budget is an offer and not every agent has
   * named one.
   */
  const [budget, setBudget] = useState(signedQuoteU ?? DEFAULT_BUDGET_U);
  const [riskAccepted, setRiskAccepted] = useState(riskWarnings.length === 0);
  const [flowStep, setFlowStep] = useState<'configure' | 'review'>('configure');

  const [stage, setStage] = useState<'swapping' | 'hiring'>('hiring');
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [state, setState] = useState<'idle' | 'hiring' | 'hired' | 'error'>(
    'idle',
  );
  const [job, setJob] = useState<HiredJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** $U bought before a failure and still in the wallet, as a display amount. */
  const [heldAfterFailure, setHeldAfterFailure] = useState<string | null>(null);
  const active = useActiveWallet();
  const [externalStep, setExternalStep] = useState<HireStep | null>(null);
  const [externalJobId, setExternalJobId] = useState<bigint | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
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
  /*
   * True when the escrow recipient is somebody other than the agent whose
   * evidence the buyer just read.
   */
  const substituted = Boolean(
    provider && agent.wallet &&
      provider.address.toLowerCase() !== agent.wallet.toLowerCase(),
  );
  const commerceAddresses = correctedErc8183Addresses(WALLET_NETWORK.chainId);
  const authority = Number.isFinite(budget) && budget > 0
    ? commissionAuthority({
        paymentToken: commerceAddresses.paymentToken,
        escrowContract: commerceAddresses.commerce,
        budgetU: budget,
      })
    : null;

  const indexFundedJob = async (hired: HiredJob) => {
    if (!hired.hireTxHash) return;
    try {
      const response = await fetch('/api/jobs/index', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobId: hired.jobId,
          transactionHash: hired.hireTxHash,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        console.warn(payload.error ?? 'The funded job was not added to the public index.');
      }
    } catch (error) {
      // Indexing is a recoverable read-model operation. The chain transaction
      // remains authoritative and a network failure here must never turn a
      // successful hire into a failed hire in the buyer's UI.
      console.warn('The funded job was not added to the public index.', error);
    }
  };

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
    setHeldAfterFailure(null);
    setExternalStep(null);
    setRevoked(false);
    /** $U bought on the way here, so a later failure can say it is still held. */
    let acquired = 0n;
    try {
      /*
       * Whichever wallet is selected, hired the same way from here.
       *
       * This was two flows in two components saying the same thing twice. The
       * brief, the budget, the risk acceptance and the record afterwards are
       * identical whoever signs; only the signing differs, so only the signing
       * branches. The external route keeps its own input shape because it also
       * carries what the lib needs to rebuild a job record on recovery.
       */
      if (active.mode === 'external') {
        if (!active.address) {
          throw new Error('Connect your browser wallet before funding.');
        }

        const outcome = await hireFromExternalWallet({
          identityChainId: agent.chainId,
          agentTokenId: agent.tokenId,
          agentName: agent.name,
          category: agent.category,
          provider: providerAddress as `0x${string}`,
          providerLabel: provider?.label,
          task,
          budgetU: budget,
          ttlSeconds: 60 * 60 * 24,
          onProgress: ({ step: reached, jobId: reachedId }) => {
            setExternalStep(reached);
            if (reachedId) setExternalJobId(reachedId);
          },
        });

        const at = new Date().toISOString();
        const externalJob: HiredJob = {
          id: crypto.randomUUID(),
          jobId: outcome.jobId.toString(),
          chainId: WALLET_NETWORK.chainId,
          isTestnet: WALLET_NETWORK.chainId === 97,
          agentChainId: agent.chainId,
          agentTokenId: agent.tokenId,
          agentName: agent.name,
          providerLabel: provider?.label,
          provider: providerAddress as `0x${string}`,
          task,
          budgetRaw: parseUnits(String(budget), 18).toString(),
          expiredAt: new Date(Date.now() + 60 * 60 * 24 * 1000).toISOString(),
          hiredAt: at,
          hireTxHash: outcome.transactionHash,
          status: 'FUNDED',
          statusCheckedAt: at,
          deliverableUrl: null,
          settleTxHash: null,
        };

        rememberJob(active.address, externalJob);
        await indexFundedJob(externalJob);
        setJob(externalJob);
        setState('hired');
        await notifySeller(externalJob);
        return;
      }

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
        /*
         * Both numbers, not just the requirement. "Needs at least 0.002" left
         * the reader to go and look up what they hold before they could tell
         * how short they were, and the answer was already in hand here.
         */
        throw new Error(
          `You need ${NATIVE_SYMBOL} for this action. This wallet holds ` +
            `${formatEther(balances.native)} ${NATIVE_SYMBOL} and funding ` +
            `escrow needs at least ${formatEther(MIN_TRANSACTION_GAS)} ` +
            `${NATIVE_SYMBOL} for the network fee.`,
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
        // The swap settled. From here a failure leaves the user holding $U.
        acquired = shortfall;
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
      await indexFundedJob(hired);
      setJob(hired);
      setState('hired');
      await notifySeller(hired);
    } catch (caught) {
      /*
       * POK-018 above argues the sequential swap is acceptable because a
       * failure after it leaves the user one retry further along rather than
       * stranded, and says "the error below says so". It did not: every
       * failure took the same generic path, so the one piece of information
       * that made the trade-off defensible was the piece we withheld.
       */
      setError(walletActionError(caught, 'Commissioning'));
      /*
       * Kept out of `error` deliberately. The faucet links below are chosen by
       * matching the error text, so folding a sentence containing "$U" into it
       * would offer a $U faucet to someone who just bought $U.
       */
      setHeldAfterFailure(acquired > 0n ? formatUnits(acquired, 18) : null);
      setState('error');
    }
  };

  /*
   * The escape hatch for a sequence abandoned after the approval landed.
   *
   * Only the step-by-step path can strand one: the batched path is atomic, so
   * it either funds or leaves nothing behind. The approval is for exactly this
   * budget rather than an unlimited amount, and a later hire reuses or zeroes
   * it, so the standing exposure is one job to our own escrow — but leaving
   * someone to find `approve(0)` themselves is not an answer.
   */
  const revokeAllowance = async () => {
    if (!active.address) return;
    setRevoking(true);
    try {
      await revokeExternalWalletAllowance(active.address as `0x${string}`);
      setRevoked(true);
    } catch (caught) {
      setError(walletActionError(caught, 'Revoking the approval'));
    } finally {
      setRevoking(false);
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
            {/*
              A track rather than two boxes.
              
              Split in half, the two cells read as tabs — something to choose
              between — when they are a sequence you move along. Joining them
              says which way the flow runs and how far along it you are, and
              the finished step carries a tick because "done" is more useful
              to see than the number one again.
            */}
            <ol
              aria-label="Commission progress"
              className="flex items-center gap-3 border-b border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-3.5 sm:px-6"
            >
              {[
                { id: 'configure', label: 'Describe the work', number: 1 },
                { id: 'review', label: 'Review and fund', number: 2 },
              ].map((item, index) => {
                const active = flowStep === item.id;
                const done = index === 0 && flowStep === 'review';
                return (
                  <li
                    key={item.id}
                    aria-current={active ? 'step' : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2.5 last:flex-none"
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors',
                        done
                          ? 'border-[color:var(--positive)] bg-[color:var(--positive)] text-[color:var(--bg)]'
                          : active
                            ? 'border-[color:var(--brand)] bg-[color:var(--brand)] text-[color:var(--brand-ink)]'
                            : 'border-[color:var(--border-strong)] text-[color:var(--text-faint)]',
                      )}
                    >
                      {done ? (
                        <svg viewBox="0 0 24 24" aria-hidden className="size-3 fill-none stroke-current" strokeWidth="3">
                          <path d="m5 13 4 4L19 7" />
                        </svg>
                      ) : (
                        item.number
                      )}
                    </span>

                    <span
                      className={cn(
                        'truncate text-[12px] font-medium',
                        active || done
                          ? 'text-[color:var(--text)]'
                          : 'text-[color:var(--text-faint)]',
                      )}
                    >
                      {item.label}
                    </span>

                    {index === 0 && (
                      <span
                        aria-hidden
                        className={cn(
                          'hidden h-px min-w-6 flex-1 sm:block',
                          done
                            ? 'bg-[color:var(--positive)]/50'
                            : 'bg-[color:var(--border)]',
                        )}
                      />
                    )}
                  </li>
                );
              })}
            </ol>

            {flowStep === 'configure' ? (
              <div className="flex flex-col gap-6 p-4 sm:p-6">
                {/*
                  Who performs the work, said where the work is described.

                  This was disclosed at the review step, under a row labelled
                  "Advanced". By then the reader has chosen an agent on its
                  track record and written a brief for it, and the one fact
                  that makes that record irrelevant to the outcome arrives
                  last. It is not an advanced setting; it is the subject of
                  the transaction.

                  It is also not an edge case. A registry agent counts as
                  reachable only when its identity sits on the escrow chain,
                  and identities are on 56 while escrow is on 97 — so today
                  this is true of every hire, not a few.
                */}
                {substituted && (
                  <div className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3.5">
                    <p className="text-[12px] font-medium text-[color:var(--caution)]">
                      {provider?.label ?? 'Another agent'} performs this job, not {agent.name}
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                      {agent.name} is registered on BNB Chain and its runtime
                      does not watch the testnet where this escrow lives, so
                      Pokter&rsquo;s own agent carries out the brief using its
                      method. Both are written into the job record.
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                      Its measured track record describes {agent.name}, not
                      this result.
                    </p>
                  </div>
                )}
                <div>
                  <h2 className="font-[family-name:var(--font-serif)] text-xl sm:text-2xl">What should the agent deliver?</h2>
                  <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                    Start with a useful brief for this kind of agent, then make it yours. Your final task and budget are written into the escrow job.
                  </p>
                </div>

                <fieldset className="flex flex-col gap-2">
                  <legend className="text-xs font-medium">Start from an outcome</legend>
                  <p className="mb-2 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                    Each one writes a brief below that you can edit. None of
                    them execute anything.
                  </p>

                  {/*
                    A radio group, not three toggles.
                    
                    These were buttons carrying aria-pressed, which announces
                    three independent switches when exactly one can be chosen.
                    Radio semantics say what is true, and bring the arrow-key
                    behaviour a one-of-three choice is expected to have.
                  */}
                  <div
                    role="radiogroup"
                    aria-label="Start from an outcome"
                    onKeyDown={(event) => {
                      const delta =
                        event.key === 'ArrowRight' || event.key === 'ArrowDown'
                          ? 1
                          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                            ? -1
                            : 0;
                      if (delta === 0) return;
                      event.preventDefault();
                      const index = taskTemplates.findIndex(
                        (t) => t.id === selectedTemplate,
                      );
                      const next =
                        taskTemplates[
                          (index + delta + taskTemplates.length) %
                            taskTemplates.length
                        ];
                      setSelectedTemplate(next.id);
                      setTask(next.task);
                    }}
                    /*
                      Stacked below sm, not a snap scroller.

                      The scroller held three 240px cards that refused to
                      shrink, so it measured 768px inside a 595px column —
                      and because a flex child defaults to min-width:auto it
                      overflowed its parent instead of scrolling, which is
                      what dragged the whole form sideways when the third
                      card was chosen. The third card was off-screen anyway.

                      Three options on a page whose problem is people not
                      knowing what they get should all be visible, so they
                      stack. Nothing is hidden and there is nothing left to
                      overflow.
                    */
                    className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  >
                    {taskTemplates.map((template) => {
                      const chosen = selectedTemplate === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          role="radio"
                          aria-checked={chosen}
                          tabIndex={chosen ? 0 : -1}
                          onClick={() => {
                            setSelectedTemplate(template.id);
                            setTask(template.task);
                          }}
                          className={cn(
                            'group relative flex min-w-0 flex-col gap-2 rounded-[var(--radius)] border p-3.5 text-left transition-all',
                            chosen
                              ? 'border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)] shadow-[0_0_0_1px_var(--brand)]'
                              : 'border-[color:var(--border)] bg-[color:var(--bg-subtle)] hover:-translate-y-0.5 hover:border-[color:var(--border-strong)]',
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'flex size-7 items-center justify-center rounded-full transition-colors',
                                chosen
                                  ? 'bg-[color:var(--brand)] text-[color:var(--brand-ink)]'
                                  : 'bg-[color:var(--surface)] text-[color:var(--text-muted)]',
                              )}
                            >
                              {TEMPLATE_ICON[template.id]}
                            </span>

                            {/* Reserved either way, so choosing does not reflow the row. */}
                            <span
                              aria-hidden
                              className={cn(
                                'text-[color:var(--brand)] transition-opacity',
                                chosen ? 'opacity-100' : 'opacity-0',
                              )}
                            >
                              <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="2.6">
                                <path d="m5 13 4 4L19 7" />
                              </svg>
                            </span>
                          </span>

                          <span className="block text-[13px] font-semibold leading-tight">
                            {template.label}
                          </span>
                          <span className="block text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                            {template.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex flex-col gap-2">
                  <label htmlFor="task" className="text-xs font-medium">Commission brief</label>
                  <textarea
                    id="task"
                    rows={5}
                    value={task}
                    disabled={state === 'hiring'}
                    onChange={(event) => {
                      setSelectedTemplate(null);
                      setTask(event.target.value);
                    }}
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
                  {/*
                    How paying works, beside the first price.

                    A buyer arrives holding USDT and is quoted in "$U", with
                    "Test tokens — no real value" as a 10px footnote under a
                    24px number. Nothing said what $U is, whether real money
                    was at stake, or where to get any — so the most
                    decision-relevant fact on the page was also the least
                    visible, and the next step was unobtainable.
                  */}
                  {PAYMENT_VALUE_NOTE && (
                    <div className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3">
                      <p className="text-[12px] font-medium">
                        {PAYMENT_VALUE_NOTE} — you spend nothing real
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                        $U is the test currency this escrow settles in. It is
                        not your USDT and cannot be bought; it is free.
                        {FAUCETS?.paymentTokenBot && (
                          <>
                            {' '}Message{' '}
                            <a
                              href={FAUCETS.paymentTokenBot.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-medium text-[color:var(--info)] underline decoration-dotted"
                            >
                              {FAUCETS.paymentTokenBot.handle}
                            </a>{' '}
                            with &ldquo;{FAUCETS.paymentTokenBot.ask}&rdquo;
                            and it sends you some.
                          </>
                        )}
                      </p>
                      {FAUCETS && (
                        <p className="mt-1.5 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                          You also need a little {NATIVE_SYMBOL} for gas, from
                          the{' '}
                          <a
                            href={FAUCETS.native}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="underline decoration-dotted"
                          >
                            BNB testnet faucet
                          </a>
                          .
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/*
                  `group` so the chevron below can follow the open state.

                  The row ended in the word "change" set in the same muted grey
                  as the provider name beside it, which read as a label rather
                  than something to press. A mark that turns when the row opens
                  says it is a control and which way it goes.
                */}
                {/*
                  Open when somebody else will do the work.

                  The alternatives were always listed in here, with labels and
                  reasons — but behind a collapsed row marked "Advanced", so a
                  reader told their agent is being substituted had no visible
                  sign that a choice existed. Collapsed is right when the
                  default is the obvious one; it is not right when the default
                  is the surprising one.
                */}
                <details
                  open={substituted}
                  className="group rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)]"
                >
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[11px] font-medium [&::-webkit-details-marker]:hidden">
                    <span className="shrink-0">Advanced · delivery route</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[color:var(--text-faint)]">
                        {provider?.label ?? 'Choose provider'}
                      </span>
                      <span className="shrink-0 text-[color:var(--text-secondary)] underline decoration-dotted underline-offset-2">
                        Change
                      </span>
                      <span
                        aria-hidden
                        className="shrink-0 text-[color:var(--text-faint)] transition-transform group-open:rotate-180"
                      >
                        <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="2">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </span>
                  </summary>
                  <div className="flex flex-col gap-2 border-t border-[color:var(--border)] p-3">
                    <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">The agent is the identity you evaluated. The delivery provider is the address that receives this testnet escrow and returns the work.</p>
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
                        <span className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">{option.note}</span>
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
                  <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-muted)]">Confirm the outcome, protections and delivery route. Nothing moves until your passkey wallet signs the escrow transaction.</p>
                </div>

                <dl className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--border)] text-[11px] lg:hidden">
                  <div className="bg-[color:var(--bg-subtle)] p-3">
                    <dt className="text-[color:var(--text-faint)]">Commission brief</dt>
                    <dd className="mt-1 leading-relaxed">{task}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-[color:var(--border)]">
                    <div className="bg-[color:var(--surface)] p-3">
                      <dt className="text-[color:var(--text-faint)]">Budget in escrow</dt>
                      <dd className="mt-1 font-semibold">{formatBudget(budget)}</dd>
                    </div>
                    <div className="bg-[color:var(--surface)] p-3">
                      <dt className="text-[color:var(--text-faint)]">Wallet access</dt>
                      <dd className="mt-1 font-semibold text-[color:var(--positive)]">None</dd>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-[color:var(--border)]">
                    <div className="bg-[color:var(--surface)] p-3">
                      <dt className="text-[color:var(--text-faint)]">Delivery</dt>
                      <dd className="mt-1">{provider?.label ?? 'Not selected'}</dd>
                    </div>
                    <div className="bg-[color:var(--surface)] p-3">
                      <dt className="text-[color:var(--text-faint)]">If nothing arrives</dt>
                      <dd className="mt-1">Reclaim after expiry</dd>
                    </div>
                  </div>
                </dl>

                <WalletReadiness requiredBudgetU={budget} />

                {authority && <CommissionAuthorityReview authority={authority} />}

                {riskWarnings.length > 0 && (
                  <div className="rounded-[var(--radius)] border border-[color:var(--caution)]/40 bg-[color:var(--caution-dim)] p-4">
                    <p className="text-[11px] font-semibold text-[color:var(--caution)]">Additional risk acceptance required</p>
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                      {riskWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                      <input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[color:var(--brand)]" />
                      I understand these warnings and still want to fund this commission.
                    </label>
                  </div>
                )}

                {provider?.relationship === 'separate-provider' && (
                  <div className="rounded-[var(--radius)] border border-[color:var(--info)]/30 bg-[color:var(--info-dim)] p-3 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
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
                      <p className="mt-0.5 text-[12px] leading-relaxed text-[color:var(--text-muted)]">{copy}</p>
                    </div>
                  ))}
                </div>

                {/*
                  Where the button was, while the button cannot be pressed.

                  An external hire asks a wallet to sign as many as five times,
                  and the panel said "Funding escrow…" through all of them — so
                  the only way to know what the third prompt was for was to
                  read its calldata. The account of it belongs here, where the
                  reader is already looking, rather than somewhere they would
                  have to go and find mid-signature.
                */}
                {externalStep && <ExternalHireSteps step={externalStep} jobId={externalJobId} />}

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
                    {state === 'hiring' ? (stage === 'swapping' ? 'Acquiring $U…' : 'Funding escrow…') : locked ? 'Connect a wallet to fund' : `Fund ${formatBudget(budget)} commission`}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="border-t border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-4">
                <p className="text-[11px] font-medium text-[color:var(--negative)]">The job was not created</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">{error}</p>
                {heldAfterFailure && (
                  <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                    The {heldAfterFailure} $U was acquired before this failed
                    and is still in your wallet. Nothing was escrowed.
                    Commissioning again spends it rather than swapping a second
                    time.
                  </p>
                )}
                {(externalStep === 'approving' || externalStep === 'funding') && (
                  <div className="mt-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-2.5">
                    <p className="text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
                      {revoked
                        ? 'The approval is back to zero. Nothing of yours is spendable by the escrow.'
                        : `The escrow is approved to draw ${formatBudget(budget)} and did not. Commissioning again reuses that approval, or you can take it back now.`}
                    </p>
                    {!revoked && (
                      <button
                        type="button"
                        onClick={revokeAllowance}
                        disabled={revoking}
                        className="mt-2 text-[11px] font-medium text-[color:var(--info)] underline decoration-dotted disabled:opacity-50"
                      >
                        {revoking ? 'Waiting for your wallet…' : 'Withdraw the approval'}
                      </button>
                    )}
                  </div>
                )}
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
              {/*
                The summary answered what the buyer is paying and what the
                agent can reach, and stopped before the question people
                actually hesitate on: what happens to the money if nothing
                comes back.

                The answer is stated rather than implied by the lifecycle
                track. No duration is given because the dispute window is read
                from the policy contract at hire time and is not known while
                this panel is still a form — naming a number here would be
                inventing one.
              */}
              <div className="flex items-start justify-between gap-3 p-4"><dt className="text-[color:var(--text-faint)]">If it never delivers</dt><dd className="text-right">Escrow is reclaimable once the job expires</dd></div>
            </dl>
            <div className="border-t border-[color:var(--border)] bg-[color:var(--positive-dim)] px-4 py-3 text-[12px] leading-relaxed text-[color:var(--positive)]">
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
        <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
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
      {job && (() => {
        const headline = RECEIPT_HEADLINE[job.status];
        return (
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
              className={cn(
                'flex size-10 items-center justify-center rounded-full',
                headline.settled
                  ? 'bg-[color:var(--caution-dim)]'
                  : 'bg-[color:var(--positive-dim)]',
              )}
            >
              {headline.settled ? (
                <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-[color:var(--caution)]" strokeWidth="2.2">
                  <path d="M12 8v5M12 16.5v.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-[color:var(--positive)]" strokeWidth="2.2">
                  <path d="m5 13 4 4L19 7" />
                </svg>
              )}
            </span>
            <h3 className="font-[family-name:var(--font-serif)] text-xl">
              {headline.heading(job.agentName)}
            </h3>
            <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
              Job #{job.jobId} {headline.standing} on {NETWORK_LABEL}.{' '}
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
            {/*
              Once a deliverable exists, reviewing it is the live action and
              tracking the job is not — so the emphasis follows the job rather
              than staying on the button that was right at funding time.
            */}
            <Link
              href="/my-agents"
              className={cn(
                'mt-1 inline-flex items-center rounded-[var(--radius)] px-4 py-2.5 text-[13px]',
                job.status === 'SUBMITTED'
                  ? 'border border-[color:var(--border-strong)] transition-colors hover:bg-[color:var(--surface-hover)]'
                  : 'action-primary',
              )}
            >
              Track activity
            </Link>
            <Link
              href="/my-agents"
              className="inline-flex items-center rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-2.5 text-[13px] transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              Get job updates
            </Link>
          </div>

          <JobStatusTrack status={job.status} />

          <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            {JOB_STAGE_COPY[job.status]}
          </p>

          <dl className="grid gap-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3 text-[10px] sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="uppercase tracking-wide text-[color:var(--text-faint)]">
                ERC-8004 identity
              </dt>
              <dd className="mt-1 break-words text-[color:var(--text-secondary)] [overflow-wrap:anywhere]">
                {agent.name} · {chainLabel(agent.chainId)} · token #{agent.tokenId}
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
                <p className="mt-1.5 text-[12px] leading-relaxed opacity-75">
                  {notificationDetail}
                </p>
              )}

              {/*
                Offered only where retrying cannot help. A notification that
                failed for a transient reason has a retry button below and
                needs no human; one that failed on configuration will fail the
                same way forever, and the person is left with a funded escrow
                and nowhere to go.
              */}
              {notification === 'failed' && isConfigFailure && (
                <p className="mt-2 text-[12px] leading-relaxed">
                  <a
                    href={supportMailto({
                      subject: 'Seller notification failed',
                      jobId: job.jobId,
                    })}
                    className="font-medium underline decoration-dotted underline-offset-2"
                  >
                    Tell us about this job
                  </a>{' '}
                  and we will check what the chain recorded.
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
        );
      })()}
    </section>
  );
}
