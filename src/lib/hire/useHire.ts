'use client';

import { useMemo, useState } from 'react';
import { createPublicClient, fallback, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { formatEther, formatUnits, parseUnits } from 'viem';
import { hireErc8183Agent } from '@altananetwork/sdk';
import { ensureGas, SponsorshipRefused } from '@/lib/wallet/sponsor-client';

import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { browserRpcUrls } from '@/lib/wallet/browser-rpc';
import { buildSwapCalls, quoteBnbForPaymentToken, type SwapQuote } from '@/lib/pancakeswap/swap';
import { DEFAULT_BUDGET_U } from '@/lib/erc8183/pricing';
import type { HiredJob } from '@/lib/erc8183/types';
import { usePasskeySigner, usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { WALLET_NETWORK, walletClient, walletNetworkFor } from '@/lib/wallet/passkey';
import { rememberJob } from '@/lib/wallet/activity';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import {
  encodePokterJobEnvelope,
  type PokterJobQuote,
} from '@/lib/erc8183/job-envelope';
import { DELIVERY_WINDOW_SECONDS } from '@/lib/erc8183/deadline';
import { walletActionError } from '@/lib/wallet/errors';
import { useActiveWallet } from '@/lib/wallet/active';
import { useQuery } from '@tanstack/react-query';
import { useWalletFunding } from '@/lib/wallet/use-funding';
import { planShortfallSwap } from '@/lib/wallet/external';
import type { HireStep } from '@/lib/wallet/external';
import { hireFromExternalWallet, revokeExternalWalletAllowance } from '@/lib/wallet/external';
import { commissionTaskTemplates, templatesFromSkills, type CommissionTaskTemplate } from '@/lib/hire/taskTemplates';
import { commissionAuthority } from '@/lib/hire/commission-authority';
import { chainLabel } from '@/lib/network/presentation';
import { checkPurchaseIntent, type PurchaseIntent } from '@/lib/hire/purchase-intent';
import { taskFields } from '@/lib/hire/task-fields';

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

/**
 * A read-only client for quoting the swap, built per attempt.
 *
 * Through the same endpoint list the rest of the browser uses, rather
 * than viem's chain default: one shared endpoint is what rate-limited a
 * mainnet hire into failing, and a quote that cannot be fetched reads to
 * the buyer as "no route to buy $U" — a false statement about the chain.
 */
function readClient(chainId: number) {
  const chain = chainId === 56 ? bsc : bscTestnet;
  return createPublicClient({
    chain,
    transport: fallback(
      browserRpcUrls(chainId, chain.rpcUrls.default.http[0]).map((url) => http(url)),
    ),
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
): Promise<PokterJobQuote & { priceU: number; intent: Omit<PurchaseIntent, 'provider'> }> {
  const response = await fetch('/api/hire/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId, tokenId, task }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { quote?: Record<string, unknown>; error?: string; escrowChainId?: number; task?: string }
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
    anchor?: Record<string, unknown> | null;
    currency: string;
  };
  const expiresAt = q.expiresAt ? Math.floor(Date.parse(q.expiresAt) / 1000) : undefined;
  /* The envelope records the expiry in epoch seconds, as the seller sent it. */
  return {
    negotiationHash: q.negotiationHash,
    providerSignature: q.providerSignature,
    anchor: q.anchor ?? undefined,
    priceRaw: q.priceRaw,
    priceU: q.priceU,
    expiresAt,
    // The terms as signed, kept whole: the escrow the route chose for this
    // currency, not the one the page was opened for (see purchase-intent).
    intent: {
      task: payload.task ?? task,
      amountRaw: q.priceRaw,
      currency: q.currency as `0x${string}`,
      chainId: payload.escrowChainId ?? q.domain?.chainId ?? Number.NaN,
      verifyingContract: (q.domain?.verifyingContract as `0x${string}` | undefined) ?? null,
      expiresAt: expiresAt ?? null,
      negotiationHash: q.negotiationHash,
    },
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
  suggestedU = null,
  riskWarnings = [],
  declaredSkills = [],
  escrowChainId = WALLET_NETWORK.chainId,
}: {
  agent: HireAgent;
  providers: ProviderChoice[];
  /**
   * The escrow this hire is funded on, chosen on the server from the agent's
   * signed price (`escrowChainForHire`). Every read and transaction below is
   * on this chain.
   */
  escrowChainId?: number;
  signedQuoteU?: number | null;
  /**
   * What the box opens on when the agent has never signed a price. A median
   * of what this category actually charges, not a quote — see
   * `suggestionsByCategory`. Null falls back to the flat default.
   */
  suggestedU?: number | null;
  riskWarnings?: string[];
  /** The agent's own skills, whose examples beat a category guess. */
  declaredSkills?: readonly { name: string; examples: readonly string[] }[];
}) {
  const { wallet } = usePasskeyWallet();
  const signer = usePasskeySigner();
  const active = useActiveWallet(escrowChainId);
  const network = walletNetworkFor(escrowChainId);
  /*
   * The agent's own words first.
   *
   * Category templates assume every agent is one of five kinds of DeFi
   * assistant. An agent in no category got generic wording — which is
   * how Pokter's own evidence agent was hired on mainnet with a brief it
   * had to refuse, while its card published the formats that work.
   * Where the card says how to ask, that wins; where it says nothing,
   * the category templates stand exactly as before.
   */
  const declared = templatesFromSkills(declaredSkills ?? []);
  const taskTemplates = declared.length > 0 ? declared : commissionTaskTemplates(agent.category);

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
  /*
   * The template the buyer started from: its fields and their types stay
   * fixed while values are edited (see `fieldsWithValues`). Editing the
   * task never changes it; choosing another template does.
   */
  const [schemaSource, setSchemaSource] = useState(taskTemplates[0].task);
  const taskSchema = useMemo(() => taskFields(schemaSource), [schemaSource]);
  const [budget, setBudget] = useState(signedQuoteU ?? suggestedU ?? DEFAULT_BUDGET_U);
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

  const funding = useWalletFunding(active.address ?? wallet?.address ?? null, budget, escrowChainId);

  /*
   * What the swap will cost, quoted before anything is signed.
   *
   * Read-only, and asked for both kinds of wallet.
   *
   * It was external-only, on the grounds that the passkey path swaps
   * inside its own batch and names the stage while it runs. But the
   * question this answers is not "how will it be signed", it is "can
   * this be bought at all" — and on testnet the answer is no, because
   * the only WBNB/$U pool is empty. A passkey holder was told "Pokter
   * will swap tBNB for the difference", clicked, and watched the hire
   * stop. Gated on `paymentLow` so a funded wallet never pays for a
   * PancakeSwap round trip, and keyed on the budget so moving the number
   * re-quotes. A swap nobody was told about is a swap that happened to
   * them; a swap promised and not possible is worse.
   */
  const swapPlan = useQuery({
    queryKey: ['shortfall-swap-plan', escrowChainId, active.address, budget],
    queryFn: () => planShortfallSwap(active.address!, budget, escrowChainId),
    enabled:
      active.mode !== null &&
      Boolean(active.address) &&
      funding.paymentLow &&
      budget > 0,
    staleTime: 30_000,
  });

  const isConfigFailure = Boolean(
    notificationDetail && /publicly fetchable|NEXT_PUBLIC_APP_URL/i.test(notificationDetail),
  );

  const provider = providers.find((p) => p.address === providerAddress);
  const providerCanDeliver = Boolean(provider?.reachable && provider.automatedDelivery);

  /*
   * Funding a job your own wallet would have to deliver.
   *
   * The escrow refuses the submission. Jobs 56981 and 56985 on mainnet
   * were funded this way — the buyer owned the agent — and `submit`
   * reverts 0x15e5dd74 from the rightful provider on a funded job that
   * is still in date, where the same call on a job with distinct parties
   * goes through. The selector is undecoded, so this is what was
   * observed rather than a reading of the contract; what is certain is
   * that two real jobs could not be delivered by anyone, including by
   * hand, and expire for their buyer to reclaim.
   *
   * Pokter knew both addresses before taking the money and said nothing.
   * It costs nothing to refuse: a buyer paying themselves gains nothing
   * either way, and the campaign that brings people here requires hirers
   * independent of the agent's owner, so a self-hire counts for nobody.
   */
  const selfHire = Boolean(
    active.address &&
      providerAddress &&
      active.address.toLowerCase() === providerAddress.toLowerCase(),
  );
  const substituted = Boolean(
    provider && agent.wallet && provider.address.toLowerCase() !== agent.wallet.toLowerCase(),
  );
  const commerceAddresses = correctedErc8183Addresses(escrowChainId);
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
      ? `Switch your wallet to ${chainLabel(escrowChainId)} to fund escrow.`
      : active.passkeyUnsupported
        ? `This hire is funded on ${chainLabel(escrowChainId)}, where the passkey wallet does not act yet. Connect a browser wallet to fund it.`
        : 'Connect a wallet to fund escrow.';

  /*
   * A brief is long enough, or it is one the agent asked for.
   *
   * The ten-character floor stops somebody funding escrow with "hi",
   * which is worth keeping for free text. It also blocked "56/303779" —
   * nine characters, and the exact string Pokter now offers because the
   * agent's own card publishes it as how to ask. The agent that wrote
   * the example is a better judge of whether it is a usable brief than
   * a length rule written for a different kind of agent.
   *
   * Matched against the offered templates rather than a pattern, so this
   * only ever excuses text an agent actually declared.
   */
  const taskReady =
    task.trim().length >= 10 ||
    taskTemplates.some((template) => template.task === task.trim());

  const describeValid = task.trim().length > 0 && budgetValid && providerCanDeliver && !selfHire;

  const setTask = (value: string) => {
    setSelectedTemplate(null);
    setTaskState(value);
  };

  const chooseTemplate = (id: CommissionTaskTemplate['id']) => {
    const template = taskTemplates.find((t) => t.id === id);
    if (!template) return;
    setSelectedTemplate(template.id);
    setTaskState(template.task);
    setSchemaSource(template.task);
  };

  const indexFundedJob = async (hired: HiredJob) => {
    /*
     * No longer skipped when the wallet reported no transaction hash.
     * An atomic `wallet_sendCalls` hire often has only a calls id, and
     * returning early here left a funded job off Pokter's public index
     * with nothing but a console warning — which is how a real mainnet
     * job came to be missing from Pokter's own activity figures. The
     * route verifies the job against the chain either way.
     */
    const body = JSON.stringify({
      chainId: hired.chainId,
      jobId: hired.jobId,
      ...(hired.hireTxHash ? { transactionHash: hired.hireTxHash } : {}),
      // Needed when the job carries only the seller's signed quote; the
      // route checks it against the registry before keeping it.
      agentChainId: hired.agentChainId ?? agent.chainId,
      agentTokenId: hired.agentTokenId,
      agentName: hired.agentName,
      providerLabel: hired.providerLabel,
    });
    /*
     * Retried: the server's node can be a block behind the wallet's and
     * read the job as unfunded (409). The funded notice indexes too, so a
     * miss here is recovered either way.
     */
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('/api/jobs/index', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        if (response.ok) return;
        if (response.status !== 409 && response.status !== 502) {
          const payload = (await response.json()) as { error?: string };
          console.warn(payload.error ?? 'The funded job was not added to the public index.');
          return;
        }
      } catch (caught) {
        // Indexing is a recoverable read-model operation. The chain transaction
        // remains authoritative and a network failure here must never turn a
        // successful hire into a failed hire in the buyer's UI.
        console.warn('The funded job was not added to the public index.', caught);
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000));
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
          escrowChainId: hired.chainId,
          provider: hired.provider,
        }),
      });
      const payload = (await response.json()) as {
        status?: string;
        reason?: string | null;
        error?: string;
        deliverableUrl?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Seller notification failed.');
      if (payload.status === 'accepted') {
        setNotification('accepted');
        setNotificationDetail('The seller verified the funded job and accepted the delivery request.');
        try {
          const { getErc8183Job, getErc8183DeliverableUrl } = await import('@altananetwork/sdk');
          const current = await getErc8183Job(network, BigInt(hired.jobId));
          const deliverableUrl =
            payload.deliverableUrl ??
            (await getErc8183DeliverableUrl(network, BigInt(hired.jobId)).catch(() => undefined)) ??
            null;
          const updated: HiredJob = {
            ...hired,
            status: current.statusName,
            statusCheckedAt: new Date().toISOString(),
            deliverableUrl,
          };
          setJob(updated);
          { const owner = active.address ?? wallet?.address; if (owner) rememberJob(owner, updated); }
        } catch {
          setNotificationDetail(
            'The seller accepted delivery. Refresh the on-chain status if the submitted receipt does not appear yet.',
          );
        }
      } else {
        setNotification('rejected');
        // The seller's own words: the buyer has no other way to learn why.
        setNotificationDetail(
          `The seller refused the job${payload.reason ? `: “${payload.reason}”` : ' and gave no reason'}. Nothing will be delivered. Your escrow stays safe and can be reclaimed from the job page after the deadline.`,
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
    let acquired = 0n;
    try {
      // Guards belong here, not only in the UI: any caller of commission()
      // gets the same refusal before a wallet is touched.
      if (!budgetValid) throw new Error(`The budget must be between ${BUDGET_MIN} and ${BUDGET_MAX} $U.`);
      if (!riskAccepted) throw new Error('Accept the warnings about this agent before funding.');
      if (!task.trim()) throw new Error('Describe the work before funding escrow.');
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
        // The signed terms against this hire, before any wallet is asked.
        const funding = correctedErc8183Addresses(escrowChainId);
        const check = checkPurchaseIntent(
          { ...signedQuote.intent, provider: providerAddress as `0x${string}` },
          { provider: providerAddress as string, task, chainId: escrowChainId, commerce: funding.commerce, paymentToken: funding.paymentToken },
        );
        if (!check.ok) throw new Error(check.reason);
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
          intent: signedQuote ? { ...signedQuote.intent, provider: providerAddress as `0x${string}` } : undefined,
          budgetU: budget,
          ttlSeconds: DELIVERY_WINDOW_SECONDS,
          escrowChainId,
          onProgress: ({ step: reached, jobId: reachedId }) => {
            setExternalStep(reached);
            if (reachedId) setExternalJobId(reachedId);
          },
        });

        const at = new Date().toISOString();
        const externalJob: HiredJob = {
          id: crypto.randomUUID(),
          jobId: outcome.jobId.toString(),
          chainId: escrowChainId,
          isTestnet: escrowChainId === 97,
          agentChainId: agent.chainId,
          agentTokenId: agent.tokenId,
          agentName: agent.name,
          providerLabel: provider?.label,
          provider: providerAddress as `0x${string}`,
          task,
          budgetRaw: parseUnits(String(budget), 18).toString(),
          // As written on chain: delivery time plus the escrow's dispute window.
          expiredAt: new Date(Number(outcome.expiredAt) * 1000).toISOString(),
          hiredAt: at,
          hireTxHash: outcome.transactionHash,
          status: 'FUNDED',
          statusCheckedAt: at,
          deliverableUrl: null,
          settleTxHash: null,
        };

        rememberJob(active.address, externalJob);
        // Not awaited: its retries must not hold up the seller's notice, which indexes too.
        void indexFundedJob(externalJob);
        setJob(externalJob);
        setState('hired');
        await notifySeller(externalJob);
        return;
      }

      if (!wallet || !signer) throw new Error('A passkey wallet is required.');
      if (escrowChainId !== WALLET_NETWORK.chainId) {
        throw new Error(`This hire is funded on ${chainLabel(escrowChainId)}, where the passkey wallet does not act yet. Connect a browser wallet to fund it.`);
      }
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
        const quote = await quoteBnbForPaymentToken(readClient(escrowChainId), paymentToken, shortfall);
        if (!quote) {
          /*
           * No pool, not a transient failure. "Fund the wallet directly"
           * is true and useless without saying where from, and on
           * testnet the tokens are free — the faucet that hands out both
           * is already known to this codebase.
           */
          throw new Error(
            FAUCETS?.paymentTokenBot
              ? `There is no pool to buy $U from on this network, so the hire cannot swap for you. Test $U is free: message ${FAUCETS.paymentTokenBot.handle} with "${FAUCETS.paymentTokenBot.ask.replace('ADDRESS', wallet.address)}".`
              : `There is no pool to buy $U from on this network. Fund the wallet with at least ${budget} $U directly.`,
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
      // Not awaited: its retries must not hold up the seller's notice, which indexes too.
      void indexFundedJob(hired);
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
      await revokeExternalWalletAllowance(active.address as `0x${string}`, escrowChainId);
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
      const current = await getErc8183Job(network, BigInt(job.jobId));
      const deliverableUrl =
        job.deliverableUrl ??
        (current.statusName === 'SUBMITTED' || current.statusName === 'COMPLETED'
          ? await getErc8183DeliverableUrl(network, BigInt(job.jobId)).catch(() => undefined)
          : undefined) ??
        null;
      const updated: HiredJob = {
        ...job,
        status: current.statusName,
        statusCheckedAt: new Date().toISOString(),
        deliverableUrl,
      };
      setJob(updated);
      { const owner = active.address ?? wallet?.address; if (owner) rememberJob(owner, updated); }
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
    taskReady,
    selectedTemplate,
    taskSchema,
    chooseTemplate,
    task,
    setTask,
    budget,
    swapPlan: swapPlan.data ?? null,
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
    selfHire,
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
