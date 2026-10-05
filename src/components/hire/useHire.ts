'use client';

import { useState } from 'react';
import { createPublicClient, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { formatEther, formatUnits, parseUnits } from 'viem';
import { hireErc8183Agent } from '@altananetwork/sdk';
import { ensureGas, SponsorshipRefused } from '@/lib/wallet/sponsor-client';

import { NATIVE_SYMBOL } from '@/lib/network/presentation';
import { buildSwapCalls, quoteBnbForPaymentToken, type SwapQuote } from '@/lib/pancakeswap/swap';
import { DEFAULT_BUDGET_U } from '@/lib/erc8183/pricing';
import type { HiredJob } from '@/lib/erc8183/types';
import { usePasskeySigner, usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { rememberJob } from '@/lib/wallet/activity';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import {
  encodePokterJobEnvelope,
  type PokterJobQuote,
} from '@/lib/erc8183/job-envelope';
import { walletActionError } from '@/lib/wallet/errors';
import { useActiveWallet } from '@/lib/wallet/active';
import { useWalletFunding } from '@/lib/wallet/use-funding';
import type { HireStep } from '@/lib/wallet/external';
import { hireFromExternalWallet, revokeExternalWalletAllowance } from '@/lib/wallet/external';
import { commissionTaskTemplates, type CommissionTaskTemplate } from '@/lib/hire/taskTemplates';
import { commissionAuthority } from '@/lib/hire/commission-authority';
import { ESCROW_CHAIN } from '@/lib/wallet/config';

/**
 * A provider the escrow can actually reach.
 *
 * The marketplace indexes agents on BSC mainnet while the ERC-8183 escrow
 * runs on testnet. A job created on chain 97 is invisible to a runtime
 * listening on chain 56, so commissioning against a mainnet agent's wallet
 * would produce a real transaction that nobody ever answers. The flow says
 * so and offers a provider that is demonstrably live on the escrow chain.
 */
export interface ProviderChoice {
  address: string;
  label: string;
  note: string;
  relationship: 'registry-agent' | 'separate-provider';
  reachable: boolean;
  automatedDelivery: boolean;
}

export interface HireAgent {
  chainId: number;
  tokenId: string;
  name: string;
  category: string;
  wallet?: string | null;
}

export type HireScreen = 'describe' | 'fund';
export type HireState = 'idle' | 'hiring' | 'hired' | 'error';
export type NotificationState =
  | 'idle'
  | 'notifying'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'not-applicable';

const MIN_TRANSACTION_GAS = parseUnits('0.002', 18);

export const BUDGET_MIN = 0.01;
export const BUDGET_MAX = 5;

/** A read-only client for quoting the swap, built per attempt. */
function readClient() {
  return createPublicClient({
    chain: WALLET_NETWORK.chainId === 56 ? bsc : bscTestnet,
    transport: http(),
  });
}

/**
 * The hire, as one state machine.
 *
 * Everything that used to live in a 1,540-line panel: the form state, the
 * two signing paths, the swap sub-stage, the seller notification, the error
 * recovery and the receipt refresh. The screens that render it are thin.
 *
 * The transaction code is unchanged from the panel it came from. What moved
 * is where it lives, not what it does.
 */
/**
 * The seller's signed quote for the brief about to be funded.
 *
 * Only when the agent itself is the on-chain provider. Where Pokter's seller
 * carries the brief the agent never reads the job, so there is nothing for a
 * quote to be checked against.
 *
 * Negotiated here rather than reused from the catalogue: the seller signs
 * over the request as well as the response, so a quote taken for an earlier
 * draft does not cover the job this is about to create, and the window is
 * fifteen minutes.
 */
async function negotiateForHire(
  chainId: number,
  tokenId: string,
  task: string,
): Promise<PokterJobQuote & { priceU: number }> {
  const response = await fetch('/api/hire/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId, tokenId, task }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { quote?: Record<string, unknown>; error?: string }
    | null;
  if (!response.ok || !payload?.quote) {
    throw new Error(
      payload?.error ?? 'The agent did not return a signed quote for this brief.',
    );
  }
  const q = payload.quote as {
    negotiationHash: string;
    providerSignature: string;
    priceRaw: string;
    priceU: number;
    expiresAt: string | null;
    domain: { chainId: number; verifyingContract: string } | null;
  };
  /* The envelope records the expiry in epoch seconds, as the seller sent it. */
  return {
    negotiationHash: q.negotiationHash,
    providerSignature: q.providerSignature,
    priceRaw: q.priceRaw,
    priceU: q.priceU,
    expiresAt: q.expiresAt ? Math.floor(Date.parse(q.expiresAt) / 1000) : undefined,
    domain: q.domain
      ? {
          chainId: q.domain.chainId,
          verifyingContract: q.domain.verifyingContract as `0x${string}`,
        }
      : undefined,
  };
}

export function useHire({
  agent,
  providers,
  signedQuoteU = null,
  riskWarnings = [],
}: {
  agent: HireAgent;
  providers: ProviderChoice[];
  signedQuoteU?: number | null;
  riskWarnings?: string[];
}) {
  const { wallet } = usePasskeyWallet();
  const signer = usePasskeySigner();
  const active = useActiveWallet();
  const taskTemplates = commissionTaskTemplates(agent.category);

  const [providerAddress, setProviderAddress] = useState(
    providers.find((p) => p.reachable && p.automatedDelivery)?.address ??
      providers.find((p) => p.reachable)?.address ??
      providers[0]?.address ??
      '',
  );
  const [selectedTemplate, setSelectedTemplate] = useState<CommissionTaskTemplate['id'] | null>(
    taskTemplates[0].id,
  );
  const [task, setTaskState] = useState(taskTemplates[0].task);
  const [budget, setBudget] = useState(signedQuoteU ?? DEFAULT_BUDGET_U);
  const [riskAccepted, setRiskAccepted] = useState(riskWarnings.length === 0);
  const [screen, setScreen] = useState<HireScreen>('describe');

  const [stage, setStage] = useState<'sponsoring' | 'swapping' | 'hiring'>('hiring');
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [state, setState] = useState<HireState>('idle');
  const [job, setJob] = useState<HiredJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heldAfterFailure, setHeldAfterFailure] = useState<string | null>(null);
  const [externalStep, setExternalStep] = useState<HireStep | null>(null);
  const [externalJobId, setExternalJobId] = useState<bigint | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notification, setNotification] = useState<NotificationState>('idle');
  const [notificationDetail, setNotificationDetail] = useState<string | null>(null);

  const funding = useWalletFunding(active.address ?? wallet?.address ?? null, budget);

  const isConfigFailure = Boolean(
    notificationDetail && /publicly fetchable|NEXT_PUBLIC_APP_URL/i.test(notificationDetail),
  );

  const provider = providers.find((p) => p.address === providerAddress);
  const providerCanDeliver = Boolean(provider?.reachable && provider.automatedDelivery);
  const substituted = Boolean(
    provider && agent.wallet && provider.address.toLowerCase() !== agent.wallet.toLowerCase(),
  );
  const commerceAddresses = correctedErc8183Addresses(WALLET_NETWORK.chainId);
  const budgetValid = Number.isFinite(budget) && budget >= BUDGET_MIN && budget <= BUDGET_MAX;
  const authority = budgetValid
    ? commissionAuthority({
        paymentToken: commerceAddresses.paymentToken,
        escrowContract: commerceAddresses.commerce,
        budgetU: budget,
      })
    : null;

  /*
   * Whether anything can sign, and if not, why. Worked out here rather than
   * threaded through a context: the screens render the fix beside the reason.
   */
  const locked = active.mode === null;
  const lockReason = !locked
    ? null
    : active.wrongChain
      ? `Switch your wallet to ${ESCROW_CHAIN.name} to fund escrow.`
      : 'Connect a wallet to fund escrow.';

  const describeValid = task.trim().length > 0 && budgetValid && providerCanDeliver;

  const setTask = (value: string) => {
    setSelectedTemplate(null);
    setTaskState(value);
  };

  const chooseTemplate = (id: CommissionTaskTemplate['id']) => {
    const template = taskTemplates.find((t) => t.id === id);
    if (!template) return;
    setSelectedTemplate(template.id);
    setTaskState(template.task);
  };

  const indexFundedJob = async (hired: HiredJob) => {
    if (!hired.hireTxHash) return;
    try {
      const response = await fetch('/api/jobs/index', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: hired.jobId, transactionHash: hired.hireTxHash }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        console.warn(payload.error ?? 'The funded job was not added to the public index.');
      }
    } catch (caught) {
      // Indexing is a recoverable read-model operation. The chain transaction
      // remains authoritative and a network failure here must never turn a
      // successful hire into a failed hire in the buyer's UI.
      console.warn('The funded job was not added to the public index.', caught);
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
      if (!response.ok) throw new Error(payload.error ?? 'Seller notification failed.');
      if (payload.status === 'accepted') {
        setNotification('accepted');
        setNotificationDetail('The seller verified the funded job and accepted the delivery request.');
        try {
          const { getErc8183Job, getErc8183DeliverableUrl } = await import('@altananetwork/sdk');
          const current = await getErc8183Job(WALLET_NETWORK, BigInt(hired.jobId));
          const deliverableUrl =
            payload.deliverableUrl ??
            (await getErc8183DeliverableUrl(WALLET_NETWORK, BigInt(hired.jobId)).catch(() => undefined)) ??
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
        setNotificationDetail('The seller verified the job but rejected the delivery request.');
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
    let acquired = 0n;
    try {
      if (!providerCanDeliver) {
        throw new Error('Choose a provider that is live on the escrow chain and publishes a delivery endpoint.');
      }

      /*
       * Negotiated before the branch, so both signing routes commit the same
       * quote for the same text. A budget under the signed price is refused
       * rather than quietly raised: the amount funded is the buyer's to set.
       */
      let signedQuote: Awaited<ReturnType<typeof negotiateForHire>> | null = null;
      if (provider?.relationship === 'registry-agent') {
        signedQuote = await negotiateForHire(agent.chainId, agent.tokenId, task);
        if (Number.isFinite(signedQuote.priceU) && budget < signedQuote.priceU) {
          throw new Error(
            `${agent.name} signed a price of ${signedQuote.priceU} $U for this brief and the budget is ${budget} $U. Raise the budget to at least the signed price.`,
          );
        }
      }

      if (active.mode === 'external') {
        if (!active.address) throw new Error('Connect your browser wallet before funding.');

        const outcome = await hireFromExternalWallet({
          identityChainId: agent.chainId,
          agentTokenId: agent.tokenId,
          agentName: agent.name,
          category: agent.category,
          provider: providerAddress as `0x${string}`,
          providerLabel: provider?.label,
          task,
          quote: signedQuote ?? undefined,
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
      if (!budgetValid) throw new Error(`The budget must be between ${BUDGET_MIN} and ${BUDGET_MAX} $U.`);
      if (!task.trim()) throw new Error('Describe the work before funding escrow.');
      const committedTask = encodePokterJobEnvelope({
        identityChainId: agent.chainId,
        agentTokenId: agent.tokenId,
        agentName: agent.name,
        category: agent.category,
        provider: providerAddress as `0x${string}`,
        providerLabel: provider?.label,
        task,
        quote: signedQuote ?? undefined,
      });

      const budgetRaw = parseUnits(String(budget), 18);
      const { paymentToken } = correctedErc8183Addresses(WALLET_NETWORK.chainId);
      const balances = await walletClient().balances({ wallet: wallet.address, tokens: [paymentToken] });
      const paymentBalance = balances.tokens?.[0];
      const held = paymentBalance?.ok ? paymentBalance.raw : 0n;

      /*
       * The one step that was not a signature. If the wallet cannot pay the
       * network fee, Pokter covers it before asking the passkey to sign, so
       * the buyer sees one prompt. When sponsorship is refused, the message
       * says what it used to say: how much BNB this wallet holds and needs.
       */
      if (balances.native < MIN_TRANSACTION_GAS && held >= budgetRaw) {
        setStage('sponsoring');
        try {
          await ensureGas(wallet.address, MIN_TRANSACTION_GAS, balances.native);
          balances.native = MIN_TRANSACTION_GAS;
        } catch (refusal) {
          throw new Error(
            `${refusal instanceof SponsorshipRefused ? `${refusal.message} ` : ''}` +
              `This wallet holds ${formatEther(balances.native)} ${NATIVE_SYMBOL} and funding ` +
              `escrow needs at least ${formatEther(MIN_TRANSACTION_GAS)} ${NATIVE_SYMBOL} for the network fee.`,
          );
        } finally {
          setStage('hiring');
        }
      } else if (balances.native < MIN_TRANSACTION_GAS) {
        throw new Error(
          `You need ${NATIVE_SYMBOL} for this action. This wallet holds ` +
            `${formatEther(balances.native)} ${NATIVE_SYMBOL} and funding ` +
            `escrow needs at least ${formatEther(MIN_TRANSACTION_GAS)} ` +
            `${NATIVE_SYMBOL} for the network fee.`,
        );
      }

      if (held < budgetRaw) {
        /*
         * Acquire exactly the shortfall, then hire. Two transactions, not one
         * (POK-018): the SDK's hire batch takes no extra calls. A failure
         * after the swap leaves the user holding the $U they needed, and the
         * error says so.
         */
        setStage('swapping');
        const shortfall = budgetRaw - held;
        const quote = await quoteBnbForPaymentToken(readClient(), paymentToken, shortfall);
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
          calls: buildSwapCalls(quote, paymentToken, wallet.address),
          chainId: WALLET_NETWORK.chainId,
        });
        acquired = shortfall;
        setStage('hiring');
      }

      const outcome = await hireErc8183Agent(
        { address: wallet.address },
        signer,
        { provider: providerAddress as `0x${string}`, task: committedTask, budget: budgetRaw },
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
      setError(walletActionError(caught, 'Commissioning'));
      setHeldAfterFailure(acquired > 0n ? formatUnits(acquired, 18) : null);
      setState('error');
    }
  };

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
      const { getErc8183Job, getErc8183DeliverableUrl } = await import('@altananetwork/sdk');
      const current = await getErc8183Job(WALLET_NETWORK, BigInt(job.jobId));
      const deliverableUrl =
        job.deliverableUrl ??
        (current.statusName === 'SUBMITTED' || current.statusName === 'COMPLETED'
          ? await getErc8183DeliverableUrl(WALLET_NETWORK, BigInt(job.jobId)).catch(() => undefined)
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

  return {
    agent,
    providers,
    riskWarnings,
    taskTemplates,
    selectedTemplate,
    chooseTemplate,
    task,
    setTask,
    budget,
    setBudget,
    budgetValid,
    riskAccepted,
    setRiskAccepted,
    screen,
    setScreen,
    providerAddress,
    setProviderAddress,
    provider,
    providerCanDeliver,
    substituted,
    authority,
    describeValid,
    active,
    funding,
    locked,
    lockReason,
    state,
    stage,
    swapQuote,
    job,
    error,
    heldAfterFailure,
    externalStep,
    externalJobId,
    revoking,
    revoked,
    refreshing,
    notification,
    notificationDetail,
    isConfigFailure,
    commission,
    revokeAllowance,
    refresh,
    notifySeller,
  };
}

export type Hire = ReturnType<typeof useHire>;
