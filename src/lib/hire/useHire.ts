'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { budgetDefault } from '@/lib/hire/budget-default';
import { createPublicClient, fallback, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { formatEther, formatUnits, parseUnits } from 'viem';
import { hireErc8183Agent } from '@altananetwork/sdk';
import { ensureGas, SponsorshipRefused } from '@/lib/wallet/sponsor-client';

import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { browserRpcUrls } from '@/lib/wallet/browser-rpc';
import { forgetBrief, recallBrief, rememberBrief } from './brief-memory';
import { checkExampleWallets, replaceWallet } from './example-wallet';
import { buildSwapCalls, quoteBnbForPaymentToken, type SwapQuote } from '@/lib/pancakeswap/swap';

import type { HiredJob } from '@/lib/erc8183/types';
import { usePasskeySigner, usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { WALLET_NETWORK, walletClient, walletNetworkFor } from '@/lib/wallet/passkey';
import { rememberJob } from '@/lib/wallet/activity';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { nonDefaultHireToken } from '@/lib/erc8183/hire-calls';
import type { PaymentToken } from '@/lib/network/tokens';
import { planCommission, type CommissionPlan } from '@/lib/hire/commission-plan';
import { fundingJournal, reconcileAttempt, type FundingAttempt, type KeyValue } from '@/lib/hire/funding-journal';
import { fundedJobRecord } from '@/lib/hire/funded-job';
import {
  encodePokterJobEnvelope,
  type PokterJobQuote,
} from '@/lib/erc8183/job-envelope';
import { DELIVERY_WINDOW_SECONDS } from '@/lib/erc8183/deadline';
import { walletActionError } from '@/lib/wallet/errors';
import { materialQuoteChange } from './quote-change';
import { HireFailure, isWalletRejection, type FailureLayer } from '@/lib/hire/failure';
import { useActiveWallet } from '@/lib/wallet/active';
import { useQuery } from '@tanstack/react-query';
import { useWalletFunding } from '@/lib/wallet/use-funding';
import { planShortfallSwap } from '@/lib/wallet/external';
import type { HireStep } from '@/lib/wallet/external';
import { attemptReader, hireFromExternalWallet, revokeExternalWalletAllowance } from '@/lib/wallet/external';
import { briefSourceFor, commissionTaskTemplates, templatesFromSkills, type CommissionTaskTemplate } from '@/lib/hire/taskTemplates';
import { commissionAuthority } from '@/lib/hire/commission-authority';
import { chainLabel } from '@/lib/network/presentation';
import { checkPurchaseIntent, type PurchaseIntent } from '@/lib/hire/purchase-intent';
import type { SkillRequestPreview } from '@/lib/erc8183/skill-request';
import { materialBriefChange, type BriefAnswers, type CompiledBrief, type MissingInput } from '@/lib/hire/brief-compiler';
import { taskFields } from '@/lib/hire/task-fields';
import { checkFromFailure, checkFromPreflight, covers, fundingBlock, type BriefCheck, type HireBinding } from '@/lib/hire/brief-check';
import { withWalletPlaceholder } from './example-chips';

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

/* Local storage that never throws: a private window or a full quota must not stop a hire being journaled in memory. */
const memoryKv = new Map<string, string>();
const journalKv: KeyValue = {
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k) ?? memoryKv.get(k) ?? null;
    } catch {
      return memoryKv.get(k) ?? null;
    }
  },
  setItem: (k, v) => {
    memoryKv.set(k, v);
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* Kept in memory for this page. */
    }
  },
  removeItem: (k) => {
    memoryKv.delete(k);
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* Nothing stored there. */
    }
  },
};
const journal = fundingJournal(journalKv);
export type NotificationState =
  | 'idle'
  | 'notifying'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'not-applicable';

const MIN_TRANSACTION_GAS = parseUnits('0.002', 18);

/**
 * The prepared request this page was opened for, from `?request=`.
 *
 * Set by `/api/hire/prepare` on the link it gives an assistant to hand its
 * owner, and reported back when the hire is funded so the request can be
 * marked as the job it became. Matched to its exact shape, so nothing else
 * in a query string is forwarded as one; the server verifies the key
 * against the job regardless.
 */
function preparedRequestKey(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('request');
  return value && /^phr_[0-9a-f]{32}$/.test(value) ? value : null;
}

export { BUDGET_MAX, BUDGET_MIN } from './budget-limits';
import { BUDGET_MAX, BUDGET_MIN } from './budget-limits';

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
): Promise<PokterJobQuote & { priceU: number; intent: Omit<PurchaseIntent, 'provider'>; request: SkillRequestPreview }> {
  const response = await fetch('/api/hire/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId, tokenId, task }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { quote?: Record<string, unknown>; error?: string; escrowChainId?: number; task?: string; layer?: FailureLayer; code?: string; retryable?: boolean; request?: SkillRequestPreview }
    | null;
  if (!response.ok || !payload?.quote) {
    // The route says which layer refused: the brief, the seller, the protocol or the network.
    throw new HireFailure(
      payload?.error ?? 'The agent did not return a signed quote for this brief.',
      payload?.layer ?? (response.status === 400 ? 'input' : response.status >= 500 ? 'network' : 'seller'),
      payload?.code,
      payload?.retryable ?? response.status >= 500,
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
  /*
   * What Pokter will ask beyond the brief, as the route resolved it.
   *
   * Carried on the quote rather than held separately, so it is invalidated
   * with the quote the moment the brief changes: `reviewQuote` only returns
   * a quote taken for the task as written. A subject shown for a brief the
   * buyer has since edited would be the wrong subject.
   */
  const request: SkillRequestPreview = payload.request ?? { skill: null, subject: null };
  /* The envelope records the expiry in epoch seconds, as the seller sent it. */
  return {
    request,
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

/**
 * Whether the brief can be turned into a request, where there is no quote
 * to carry the answer.
 *
 * A hire whose provider is Pokter's seller never asks the agent to sign,
 * so `negotiateForHire` does not run and nothing checked the brief before
 * the escrow was funded. Asked here instead, with the same refusal shape,
 * so the buyer reads the same sentence whichever path they are on.
 */
/**
 * What the agent will be asked, compiled from what the buyer wrote.
 *
 * Asked before any price, because this is the last point at which the
 * request is still the buyer's to change. It reaches no seller: the
 * route reads the agent's card and returns a reading, so editing a brief
 * costs nobody a round trip.
 */
async function compileRequestFor(chainId: number, tokenId: string, task: string, answers: BriefAnswers): Promise<CompiledBrief> {
  const response = await fetch('/api/hire/compile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId, tokenId, task, answers }),
  });
  const payload = (await response.json().catch(() => null)) as { brief?: CompiledBrief; error?: string } | null;
  if (!response.ok || !payload?.brief) {
    throw new HireFailure(
      payload?.error ?? 'Pokter could not work out what this agent will be asked.',
      response.status === 400 ? 'input' : 'network',
      undefined,
      response.status >= 500,
    );
  }
  return payload.brief;
}

async function preflightBrief(
  chainId: number,
  tokenId: string,
  task: string,
  agentName: string,
): Promise<{ request: SkillRequestPreview; check: BriefCheck }> {
  const response = await fetch('/api/hire/preflight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId, tokenId, task }),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        request?: SkillRequestPreview;
        brief?: unknown | null;
        accepted?: { answered: boolean; failure: string | null } | null;
        error?: string;
        layer?: FailureLayer;
        code?: string;
        retryable?: boolean;
      }
    | null;
  if (!response.ok) {
    throw new HireFailure(
      payload?.error ?? 'Pokter could not check this brief against the agent.',
      payload?.layer ?? (response.status === 400 ? 'input' : 'network'),
      payload?.code,
      payload?.retryable ?? response.status >= 500,
    );
  }
  /*
   * Whether the agent was asked, read rather than assumed. The route passes
   * a brief it could not judge, and returning only `request` here made that
   * indistinguishable from one the agent had taken.
   */
  return {
    request: payload?.request ?? { skill: null, subject: null },
    check: checkFromPreflight({ brief: payload?.brief ?? null, accepted: payload?.accepted ?? null }, agentName),
  };
}

export function useHire({
  agent,
  providers,
  signedQuoteU = null,
  suggestedU = null,
  lastSignedU = null,
  riskWarnings = [],
  declaredSkills = [],
  escrowChainId = WALLET_NETWORK.chainId,
  initialTask = null,
  proposalU = null,
  deliverySeconds = DELIVERY_WINDOW_SECONDS,
}: {
  agent: HireAgent;
  providers: ProviderChoice[];
  /**
   * The escrow this hire is funded on, chosen on the server from the agent's
   * signed price (`escrowChainForHire`). Every read and transaction below is
   * on this chain.
   */
  escrowChainId?: number;
  /** A brief to start from (`/hire/…?task=`), e.g. one an assistant composed; the buyer can still edit it. */
  initialTask?: string | null;
  signedQuoteU?: number | null;
  /**
   * What the box opens on when the agent has never signed a price. A median
   * of what this category actually charges, not a quote — see
   * `suggestionsByCategory`. Null falls back to the flat default.
   */
  suggestedU?: number | null;
  /**
   * The newest price this agent signed, even though it has expired.
   *
   * A signed quote lasts fifteen minutes, so almost every quote on a page
   * is expired, and treating that as "no price" set the budget to the
   * 0.1 default. The hire then negotiated a fresh quote, found it above
   * the budget, and refused — the buyer was shown "No signed price; you
   * set it" and then told their number was wrong. The agent's last price
   * is the best estimate of its next one, and is a far better default
   * than a constant.
   */
  lastSignedU?: number | null;
  riskWarnings?: string[];
  /** The price of a proposal chosen on a request, which the budget starts at. */
  proposalU?: number | null;
  /** Time the seller has to deliver: a chosen proposal's own, or the standing window. */
  deliverySeconds?: number;
  /** The agent's own skills, whose examples beat a category guess. */
  declaredSkills?: readonly { id?: string; name: string; kind?: string; description?: string | null; examples: readonly string[] }[];
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
  const briefSource = briefSourceFor(declaredSkills ?? []);
  const previewSkill = (declaredSkills ?? []).find((s) => s.kind === 'preview') ?? null;

  const [providerAddress, setProviderAddress] = useState(
    providers.find((p) => p.reachable && p.automatedDelivery)?.address ??
      providers.find((p) => p.reachable)?.address ??
      providers[0]?.address ??
      '',
  );
  // A brief typed before switching network comes back; a linked one wins.
  const [recalled] = useState(() => (initialTask || typeof window === 'undefined' ? null : recallBrief(agent)));
  /*
   * The brief starts empty. It opened on the first example, wallet and all,
   * so a buyer met someone else's address in their own brief before they
   * had typed anything. Examples are one tap away, as chips.
   */
  const [selectedTemplate, setSelectedTemplate] = useState<CommissionTaskTemplate['id'] | null>(
    initialTask ? null : ((recalled?.template as CommissionTaskTemplate['id'] | null | undefined) ?? null),
  );
  /*
   * A template in a guided format starts empty: its example's figures are
   * the operator's, shown as placeholders, never funded as the buyer's.
   */
  const startingTask = (template: CommissionTaskTemplate) => (template.recipe ? '' : withWalletPlaceholder(template.task));
  const [task, setTaskState] = useState(initialTask ?? recalled?.task ?? '');
  /*
   * A brief from the link is remembered like a typed one, once, when the
   * form opens. Switching network rebuilds the form without the link
   * (`HireNetworks`), so it recalls this — or the buyer's edit of it, or
   * nothing if they cleared it. Before, the link was passed again on every
   * switch and won, so an edited or cleared link brief came back as the
   * link wrote it.
   */
  const linkRemembered = useRef(false);
  useEffect(() => {
    if (linkRemembered.current || !initialTask) return;
    linkRemembered.current = true;
    rememberBrief(agent, { task: initialTask, template: null, recipe: null, schema: '' });
  }, [agent, initialTask]);
  /** The guided format in use; kept while the brief is edited, like the schema. */
  const [recipeId, setRecipeId] = useState(initialTask ? null : (recalled?.recipe ?? null));
  /*
   * The template the buyer started from: its fields and their types stay
   * fixed while values are edited (see `fieldsWithValues`). Editing the
   * task never changes it; choosing another template does.
   */
  const [schemaSource, setSchemaSource] = useState(recalled?.schema ?? '');
  const taskSchema = useMemo(() => taskFields(schemaSource), [schemaSource]);
  const [budget, setBudget] = useState(budgetDefault({ signedU: signedQuoteU, lastSignedU, suggestedU, proposalU }));
  const [riskAccepted, setRiskAccepted] = useState(riskWarnings.length === 0);
  const [screen, setScreen] = useState<HireScreen>('describe');
  /*
   * The signed quote taken when the buyer moves from Describe to Review,
   * so Review can show what this agent accepted for this exact brief, and
   * a refusal arrives while the brief is still being written, not at the
   * wallet. Kept with what it was signed for: a changed brief, provider or
   * network does not reuse it.
   */
  const [preQuote, setPreQuote] = useState<{ quote: Awaited<ReturnType<typeof negotiateForHire>>; binding: HireBinding } | null>(null);
  /*
   * What Pokter will ask, for the brief as written.
   *
   * Separate from `preQuote` because a hire Pokter's seller carries has no
   * quote to hang it on, and the review screen must say the same thing on
   * both paths. Validated the same way: it is only read back while the task
   * and provider it was resolved for are still the ones in the form.
   */
  const [preRequest, setPreRequest] = useState<{ request: SkillRequestPreview; binding: HireBinding } | null>(null);
  /*
   * What the agent said about the request, kept whatever it was.
   *
   * An acceptance, a decline and "nobody could ask" are three different
   * facts, and the review screen has to be able to say which one it has.
   * Bound like the quote, so an edit to the brief, provider or network
   * leaves it describing a request that is no longer the one on screen.
   */
  const [checked, setChecked] = useState<{ check: BriefCheck; binding: HireBinding } | null>(null);
  /* The buyer's choice to fund a brief nobody could check, for one request only. */
  const [overrideFor, setOverrideFor] = useState<HireBinding | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteFailure, setQuoteFailure] = useState<{ message: string; layer: FailureLayer | null } | null>(null);

  /*
   * The compiled request, and the one the buyer signed off on.
   *
   * Two states on purpose. `compiledFor` is the reading of the brief as it
   * stands now and moves with every edit; `approved` is frozen at the
   * moment the buyer confirmed it, and is what the quote is taken for and
   * what gets funded. Holding only the live one would mean the screen could
   * not say what changed since they agreed — and "your price was for a
   * different account" is the sentence this feature exists to be able to
   * say.
   */
  const [compiledFor, setCompiledFor] = useState<{ brief: CompiledBrief; task: string } | null>(null);
  /*
   * The buyer's answers to the compiler's questions, by field key.
   *
   * Held beside the brief rather than written into it. They used to be
   * appended as prose lines and read back out, which only worked for two of
   * the seven field shapes a live card declares — a `text`, `boolean` or
   * `json` field could never be read back, so the question was asked again
   * and the brief grew a duplicate line every time. Keyed by the field they
   * answer, there is nothing to read back and nothing to guess.
   *
   * Dropped with the brief they were given for: an answer to "which
   * account?" on one brief is not an answer on the next one.
   */
  const [answersFor, setAnswersFor] = useState<{ answers: Record<string, string>; task: string } | null>(null);
  const [approved, setApproved] = useState<{ brief: CompiledBrief; payload: string; binding: HireBinding } | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [compileFailure, setCompileFailure] = useState<string | null>(null);

  const [stage, setStage] = useState<'sponsoring' | 'swapping' | 'hiring'>('hiring');
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [state, setState] = useState<HireState>('idle');
  /*
   * A funding attempt from this wallet that has not resolved: read from the
   * journal on load, set when a hire ends without a definite answer. While it
   * is set nothing new is funded; it is checked against the chain instead.
   */
  const [pendingAttempt, setPendingAttempt] = useState<FundingAttempt | null>(null);
  const [reconcileNote, setReconcileNote] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  /*
   * On load, and whenever the wallet or network changes: an attempt this
   * wallet left open (a reload mid-funding, a closed tab, another tab) is
   * picked up and checked against the chain before anything else is funded.
   */
  const journalWallet = active.address ?? wallet?.address ?? null;
  useEffect(() => {
    if (!journalWallet) return;
    const open = journal.read(journalWallet, escrowChainId);
    if (!open) return;
    const pending = journal.note(journalWallet, escrowChainId, { state: 'pending' }) ?? open;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting what storage holds, once per wallet and network
    setPendingAttempt(pending);
    void recheckFunding(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per wallet and network
  }, [journalWallet, escrowChainId]);
  const [job, setJob] = useState<HiredJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which layer the last failure came from; only 'wallet' may say the buyer declined. */
  const [errorLayer, setErrorLayer] = useState<FailureLayer | null>(null);
  const [heldAfterFailure, setHeldAfterFailure] = useState<string | null>(null);
  const [externalStep, setExternalStep] = useState<HireStep | null>(null);
  const [externalJobId, setExternalJobId] = useState<bigint | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notification, setNotification] = useState<NotificationState>('idle');
  const [notificationDetail, setNotificationDetail] = useState<string | null>(null);

  /*
   * The token the seller's price is in, when it is not $U. Read from the
   * quote under review; `commission` decides again from the quote it funds.
   * A price in a token Pokter does not fund here is carried as the reason,
   * and the hire refuses rather than funding $U instead.
   */
  const quotedToken: { token: PaymentToken | null; error: string | null } = (() => {
    try {
      return { token: nonDefaultHireToken(escrowChainId, preQuote?.quote.intent.currency), error: null };
    } catch (problem) {
      return { token: null, error: (problem as Error).message };
    }
  })();
  const hireToken = quotedToken.token;
  const funding = useWalletFunding(
    active.address ?? wallet?.address ?? null,
    budget,
    escrowChainId,
    hireToken && preQuote ? { address: hireToken.address, requiredRaw: BigInt(preQuote.quote.intent.amountRaw) } : null,
  );

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
      /* The swap buys $U; a USDT hire is never offered one. */
      hireToken === null &&
      budget > 0,
    staleTime: 30_000,
  });

  const isConfigFailure = Boolean(
    notificationDetail && /publicly fetchable|NEXT_PUBLIC_APP_URL/i.test(notificationDetail),
  );

  const provider = providers.find((p) => p.address === providerAddress);
  /** This text, for this agent, provider and escrow: what every confirmation, quote and check is bound to. */
  const bindingFor = (text: string): HireBinding => ({ agentChainId: agent.chainId, agentTokenId: agent.tokenId, provider: providerAddress, escrowChainId, task: text });
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
  /* What funding would do now, from the quote under review; `commission` plans again from the quote it funds. */
  const plan: CommissionPlan = planCommission({
    escrowChainId,
    walletMode: active.mode === 'passkey' ? 'passkey' : 'external',
    quote: preQuote ? { currency: preQuote.quote.intent.currency, amountRaw: preQuote.quote.intent.amountRaw } : null,
    budgetU: Number.isFinite(budget) && budget > 0 ? budget : 0,
    agentName: agent.name,
  });
  const authority = hireToken && preQuote
    ? commissionAuthority({
        /* Exactly the signed amount, in the signed token. */
        paymentToken: hireToken.address,
        tokenSymbol: hireToken.symbol,
        escrowContract: commerceAddresses.commerce,
        budgetU: Number(formatUnits(BigInt(preQuote.quote.intent.amountRaw), hireToken.decimals)),
      })
    : budgetValid
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
    taskTemplates.some((template) => template.task === task.trim() || startingTask(template) === task.trim());

  const describeValid = task.trim().length > 0 && budgetValid && providerCanDeliver && !selfHire;

  const setTask = (value: string) => {
    setSelectedTemplate(null);
    setTaskState(value);
    setQuoteFailure(null);
    rememberBrief(agent, { task: value, template: null, recipe: recipeId, schema: schemaSource });
  };

  /* A guided field changed: the template's format stays selected. */
  const setTaskKeepingFormat = (value: string) => {
    setTaskState(value);
    setQuoteFailure(null);
    rememberBrief(agent, { task: value, template: selectedTemplate, recipe: recipeId, schema: schemaSource });
  };

  const chooseTemplate = (id: CommissionTaskTemplate['id']) => {
    const template = taskTemplates.find((t) => t.id === id);
    if (!template) return;
    setSelectedTemplate(template.id);
    setTaskState(startingTask(template));
    setSchemaSource(template.task);
    setRecipeId(template.recipe ?? null);
    rememberBrief(agent, { task: startingTask(template), template: template.id, recipe: template.recipe ?? null, schema: template.task });
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
      /*
       * Which prepared request this payment answered, when the owner
       * arrived from one.
       *
       * An assistant can hand its owner an unsigned request and cannot
       * watch them approve it, so without this nothing ever tells Pokter
       * that a prepared request became a job — and `prepare_hire` would go
       * on offering the same purchase. The key rides in the approval link
       * and is reported at the one moment the funding is already being
       * reported. Read from the URL rather than threaded through four
       * components because it is a property of how this page was opened,
       * not of the agent or the brief.
       *
       * The server trusts none of it: it checks the key against this job's
       * own chain, agent, provider, brief and funder before keeping it.
       */
      ...(preparedRequestKey() ? { requestKey: preparedRequestKey() } : {}),
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

  /*
   * An agent's example wallet stays the example's until the buyer replaces
   * it or says they mean it; a "0x…" left to fill blocks the quote.
   */
  const [confirmedWallets, setConfirmedWallets] = useState<ReadonlySet<string>>(new Set());
  const exampleCheck = checkExampleWallets(task, taskTemplates.map((t) => t.task), confirmedWallets);
  const confirmExampleWallet = (address: string) => setConfirmedWallets((prior) => new Set([...prior, address.toLowerCase()]));
  const adoptOwnWallet = (example: string) => {
    if (active.address) setTaskKeepingFormat(replaceWallet(task, example, active.address));
  };

  /** Whether the agent itself signs a price for this hire (not Pokter's delivery agent). */
  const needsQuote = provider?.relationship === 'registry-agent';

  /*
   * The compiled reading of the brief as it stands, and the buyer's
   * approval of it, each only while it still describes this hire.
   *
   * Derived rather than cleared on edit, the way `reviewQuote` is: a
   * cleanup that has to be remembered at every call site is a cleanup that
   * gets forgotten at one of them, and the one that gets forgotten here
   * would leave a confirmed payload bound to a brief the buyer has since
   * rewritten.
   */
  const compiled = compiledFor && compiledFor.task === task ? compiledFor.brief : null;
  const answers = answersFor && answersFor.task === task ? answersFor.answers : {};
  const approvedRequest = approved && covers(approved.binding, bindingFor(task)) ? approved : null;
  /**
   * The text that is quoted, written on chain and delivered.
   *
   * The buyer's approved payload when there is one, and what they typed
   * when there is not. For every contract but `structured` these are the
   * same string — the brief travels verbatim — so this only ever differs
   * where the agent publishes a format and the buyer confirmed the request
   * built in it.
   */
  const outboundTask = approvedRequest?.payload ?? task;
  /**
   * What the buyer agreed to that is no longer what would be sent.
   *
   * Named, not counted. A buyer told "your quote is stale" has to go and
   * find out why; a buyer told "account to report on changed" already knows.
   */
  const requestChanged = approved && compiled ? materialBriefChange(approved.brief, compiled) : [];

  /**
   * Compile the brief into the request the agent will read. False with
   * `compileFailure` set.
   *
   * `text` is passed explicitly where the caller has just changed the brief,
   * because the state it set is not readable in the same tick — reading
   * `task` from the closure compiled the brief as it was *before* the
   * answer, and stored the result under the old text, so the screen
   * immediately disowned it.
   */
  const compileRequest = async (text: string = task, given: Record<string, string> = answers): Promise<boolean> => {
    setCompileFailure(null);
    setCompiling(true);
    try {
      const brief = await compileRequestFor(agent.chainId, agent.tokenId, text, given);
      setCompiledFor({ brief, task: text });
      setAnswersFor({ answers: given, task: text });
      return true;
    } catch (caught) {
      setCompiledFor(null);
      setCompileFailure((caught as Error).message);
      return false;
    } finally {
      setCompiling(false);
    }
  };

  /**
   * Answer one of the questions the compiler asked.
   *
   * The value is recorded against the field it answers and the request is
   * compiled again with it. Nothing is written into the brief: the buyer's
   * own words stay their own words, and the answer is visible where it
   * matters — in the payload and in the summary rows, which are what the
   * agent receives and what goes on chain.
   */
  const answerMissingInput = async (missing: MissingInput, answer: string): Promise<boolean> => {
    const next = { ...answers, [missing.key]: answer.trim() };
    setAnswersFor({ answers: next, task });
    return compileRequest(task, next);
  };

  /**
   * Bind the compiled request: this payload, for this provider, on this
   * escrow. Returns the payload it bound, or null when there was none.
   *
   * Returned rather than only stored, because the caller asks for a price in
   * the same tick and `approved` is not readable until the next render. It
   * was not returned at first, and the consequence was the whole feature
   * quietly not working: the buyer answered "which account?", confirmed, and
   * the quote was taken for the brief as it stood *before* the answer.
   * Brinkwatch declined it with "The brief names no wallet address" — the
   * agent refusing a brief the buyer had already fixed. It failed safe and
   * it failed completely.
   */
  const approveRequest = (): string | null => {
    if (!compiled?.payload) return null;
    setApproved({ brief: compiled, payload: compiled.payload, binding: bindingFor(task) });
    /*
     * A new approval cannot inherit the old one's price. The quote is signed
     * over the payload, so a price taken for the request the buyer has just
     * replaced governs work nobody is buying.
     */
    setPreQuote(null);
    setPreRequest(null);
    /* Confirming again asks the agent again, and the buyer decides again. */
    setChecked(null);
    setOverrideFor(null);
    return compiled.payload;
  };


  /**
   * Ask the agent to sign a quote for the brief as written. True when the
   * buyer can go on to Review: either the agent accepted, or no quote is
   * needed. False with `quoteFailure` set, and the brief left as it was.
   */
  const prepareQuote = async (text: string = outboundTask): Promise<boolean> => {
    setQuoteFailure(null);
    setQuoting(true);
    try {
      /*
       * Quoted for the payload the buyer approved, not for what they typed.
       *
       * The seller signs over the task text, so the signature has to cover
       * the string that will be delivered. Where the agent publishes a
       * format, that string is the compiled request and not the prose it
       * was compiled from — quoting the prose would hand the buyer a
       * signature for a brief the courier never sends.
       */
      const sending = text;
      const binding = bindingFor(sending);
      if (needsQuote) {
        const quote = await negotiateForHire(agent.chainId, agent.tokenId, sending);
        setPreQuote({ quote, binding });
        setPreRequest({ request: quote.request, binding });
        setChecked({ check: { state: 'accepted', by: 'signed-quote' }, binding });
      } else {
        /*
         * No quote on this path, so the brief is checked on its own. Before
         * Review rather than at funding, because this is the last screen
         * where the brief can still be edited.
         */
        const { request, check } = await preflightBrief(agent.chainId, agent.tokenId, sending, agent.name);
        setPreRequest({ request, binding });
        setChecked({ check, binding });
      }
      return true;
    } catch (caught) {
      setPreQuote(null);
      setPreRequest(null);
      const failure = caught instanceof HireFailure ? caught : null;
      /* A decline is kept as a decline; a missing input is the brief's to fix, not a verdict. */
      const outcome = checkFromFailure({ message: (caught as Error).message, code: failure?.code ?? null });
      setChecked(outcome ? { check: outcome, binding: bindingFor(text) } : null);
      setQuoteFailure({
        message:
          (caught as Error).message ||
          (needsQuote
            ? 'The agent did not return a signed quote for this brief.'
            : 'Pokter could not check this brief against the agent.'),
        layer: failure?.layer ?? null,
      });
      return false;
    } finally {
      setQuoting(false);
    }
  };

  /** The early quote, while it still covers this hire: same brief, provider and network, and at least a minute left. */
  const reviewQuote = preQuote && covers(preQuote.binding, bindingFor(outboundTask)) ? preQuote.quote : null;
  /* Cleared by any edit to the brief or the provider, so the review screen
     never describes a request Pokter would no longer make. */
  const reviewRequest = preRequest && covers(preRequest.binding, bindingFor(outboundTask)) ? preRequest.request : null;
  /** What the agent said about the request on screen, or null when it has not been asked about this one. */
  const reviewCheck = checked && covers(checked.binding, bindingFor(outboundTask)) ? checked.check : null;
  const unverifiedOverride = covers(overrideFor, bindingFor(outboundTask));
  const setUnverifiedOverride = (on: boolean) => setOverrideFor(on ? bindingFor(outboundTask) : null);
  /** Why this hire cannot be funded yet; the same answer the button and `commission` give. */
  const fundBlock = fundingBlock({
    compiled,
    confirmed: Boolean(approvedRequest),
    changed: requestChanged,
    check: reviewCheck,
    overridden: unverifiedOverride,
    agentName: agent.name,
  });
  const quoteLive = (quote: Awaited<ReturnType<typeof negotiateForHire>> | null) => Boolean(quote && (!quote.expiresAt || quote.expiresAt * 1000 > Date.now() + 60_000));

  const commission = async () => {
    setState('hiring');
    setStage('hiring');
    setSwapQuote(null);
    setError(null);
    setErrorLayer(null);
    setHeldAfterFailure(null);
    setExternalStep(null);
    setRevoked(false);
    let acquired = 0n;
    /* The wallet this attempt is journaled under, once it has begun. */
    let attemptWallet: string | null = null;
    try {
      /*
       * An earlier attempt from this wallet that never resolved blocks this
       * one: it may have paid, and a second hire would pay again. Checked
       * against the chain instead of funding anything.
       */
      const walletAddress = active.address ?? wallet?.address ?? null;
      const open = walletAddress ? journal.read(walletAddress, escrowChainId) : null;
      if (open) {
        setPendingAttempt({ ...open, state: 'pending' });
        void recheckFunding(open);
        throw new HireFailure('An earlier funding attempt from this wallet has not resolved yet. Nothing new was sent; Pokter is checking the chain for it first.', 'payment', 'funding-pending');
      }
      // Guards belong here, not only in the UI: any caller of commission()
      // gets the same refusal before a wallet is touched.
      if (!budgetValid && !(plan.ok && plan.signedAmount)) throw new Error(`The budget must be between ${BUDGET_MIN} and ${BUDGET_MAX} $U.`);
      if (!riskAccepted) throw new Error('Accept the warnings about this agent before funding.');
      if (!task.trim()) throw new Error('Describe the work before funding escrow.');
      if (!providerCanDeliver) {
        throw new Error('Choose a provider that is live on the escrow chain and publishes a delivery endpoint.');
      }
      /*
       * A request the buyer never confirmed, that is missing something it
       * needs, that the agent declined, or that nobody could check, is never
       * funded — the last unless the buyer said, for this request, to fund
       * it anyway. Here rather than only in the UI, because every caller of
       * `commission()` gets the same refusal before a wallet is touched.
       *
       * The confirmation used to be required only where the agent publishes
       * a format, and an unchecked brief passed silently: the agent could
       * not be asked, and the hire went ahead exactly as if it had agreed.
       */
      if (fundBlock) throw new HireFailure(fundBlock.message, fundBlock.code === 'brief-declined' ? 'seller' : 'input', fundBlock.code, false);
      /* The one string this hire is about: quoted, written on chain, delivered. */
      const sending = outboundTask;

      /*
       * Negotiated before the branch, so both signing routes commit the same
       * quote for the same text. A budget under the signed price is refused
       * rather than quietly raised: the amount funded is the buyer's to set.
       */
      let signedQuote: Awaited<ReturnType<typeof negotiateForHire>> | null = null;
      if (provider?.relationship === 'registry-agent') {
        // The quote shown on Review, if it still covers this hire; otherwise a fresh one.
        signedQuote = reviewQuote && quoteLive(reviewQuote) ? reviewQuote : await negotiateForHire(agent.chainId, agent.tokenId, sending);
        /*
         * Price was the only thing compared, and it is not the only thing
         * signed: a replacement can hold the number and change what the
         * work is. See `materialQuoteChange`.
         */
        const changed = reviewQuote && signedQuote !== reviewQuote ? materialQuoteChange(reviewQuote, signedQuote) : null;
        if (reviewQuote && changed) {
          setPreQuote({ quote: signedQuote, binding: bindingFor(sending) });
          throw new HireFailure(
            `${agent.name}'s quote expired and ${changed.what}. Check the terms again before paying.`,
            'terms',
            changed.kind === 'price' ? 'price-changed' : 'terms-changed',
          );
        }
        /*
         * A USDT price funds exactly what was signed, so the $U budget is not
         * compared with it — it is not used at all. Throws for a token Pokter
         * does not fund here (or USDT with USDT hiring off): refused, never
         * funded in $U instead.
         */
        const signedPlan = planCommission({
          escrowChainId,
          walletMode: active.mode === 'passkey' ? 'passkey' : 'external',
          quote: { currency: signedQuote.intent.currency, amountRaw: signedQuote.intent.amountRaw },
          budgetU: budget,
          agentName: agent.name,
        });
        if (!signedPlan.ok) throw new HireFailure(signedPlan.message, 'payment', signedPlan.code);
        const tokenHire = signedPlan.token;
        if (!tokenHire && Number.isFinite(signedQuote.priceU) && budget < signedQuote.priceU) {
          throw new Error(
            `${agent.name} signed a price of ${signedQuote.priceU} $U for this brief and the budget is ${budget} $U. Raise the budget to at least the signed price.`,
          );
        }
        // The signed terms against this hire, before any wallet is asked.
        const funding = correctedErc8183Addresses(escrowChainId);
        const check = checkPurchaseIntent(
          { ...signedQuote.intent, provider: providerAddress as `0x${string}` },
          tokenHire
            ? { provider: providerAddress as string, task: sending, chainId: escrowChainId, commerce: funding.commerce, paymentToken: tokenHire.address, amountRaw: signedQuote.intent.amountRaw }
            : { provider: providerAddress as string, task: sending, chainId: escrowChainId, commerce: funding.commerce, paymentToken: funding.paymentToken },
        );
        if (!check.ok) throw new Error(check.reason);
      } else {
        /*
         * The same question the quote route answers for a registry agent,
         * asked here for the hires it does not cover. In `commission` and
         * not only in `prepareQuote` because any caller of this function
         * gets the same refusal before a wallet is touched — the rule the
         * guards above already follow.
         */
        const request = reviewRequest ?? (await preflightBrief(agent.chainId, agent.tokenId, sending, agent.name)).request;
        setPreRequest({ request, binding: bindingFor(sending) });
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
          task: sending,
          quote: signedQuote ?? undefined,
          intent: signedQuote ? { ...signedQuote.intent, provider: providerAddress as `0x${string}` } : undefined,
          budgetU: budget,
          ttlSeconds: deliverySeconds,
          escrowChainId,
          onProgress: ({ step: reached, jobId: reachedId, sentHash, callsId, predictedJobId, description, paymentToken: fundingToken, budgetRaw: fundingAmount }) => {
            const address = active.address!;
            /* Journaled before the first wallet prompt; refused (and the hire stopped) if another attempt is open. */
            if (!attemptWallet && description && fundingToken && fundingAmount !== undefined) {
              const begun = journal.begin({
                wallet: address, chainId: escrowChainId, provider: providerAddress as string,
                agent: { chainId: agent.chainId, tokenId: agent.tokenId, name: agent.name },
                task: sending, description, token: fundingToken, amountRaw: fundingAmount.toString(),
                expiredAt: null, startedAt: new Date().toISOString(),
                predictedJobId: predictedJobId?.toString() ?? null,
              });
              if (!begun.ok) {
                setPendingAttempt({ ...begun.blocking, state: 'pending' });
                throw new HireFailure('An earlier funding attempt from this wallet has not resolved yet. Nothing new was sent.', 'payment', 'funding-pending');
              }
              attemptWallet = address;
            }
            if (attemptWallet) {
              journal.note(address, escrowChainId, {
                ...(sentHash ? { txHash: sentHash } : {}),
                ...(callsId ? { callsId } : {}),
                ...(predictedJobId !== undefined ? { predictedJobId: predictedJobId.toString() } : {}),
                /* A job id proved by a receipt, not the batch's prediction. */
                ...(reachedId !== undefined && predictedJobId === undefined && reached !== 'creating' ? { jobId: reachedId.toString() } : {}),
              });
            }
            setExternalStep(reached);
            if (reachedId) setExternalJobId(reachedId);
          },
        });

        const at = new Date().toISOString();
        const externalJob: HiredJob = fundedJobRecord({
          id: crypto.randomUUID(),
          jobId: outcome.jobId,
          chainId: escrowChainId,
          agent: { chainId: agent.chainId, tokenId: agent.tokenId, name: agent.name },
          providerLabel: provider?.label,
          provider: providerAddress as `0x${string}`,
          task: sending,
          /* As funded: the signed amount for a token hire, the budget for $U. */
          budgetRaw: outcome.budgetRaw,
          paymentToken: outcome.paymentToken,
          tokenConfirmed: outcome.tokenConfirmed,
          // As written on chain: delivery time plus the escrow's dispute window.
          expiredAt: outcome.expiredAt,
          hireTxHash: outcome.transactionHash,
          at,
        });

        rememberJob(active.address, externalJob);
        /* Recorded, so the attempt is resolved: funded, and never funded again. */
        journal.close(active.address, escrowChainId);
        attemptWallet = null;
        // Not awaited: its retries must not hold up the seller's notice, which indexes too.
        void indexFundedJob(externalJob);
        setJob(externalJob);
        forgetBrief(agent);
        setState('hired');
        await notifySeller(externalJob);
        return;
      }

      if (!wallet || !signer) throw new Error('A passkey wallet is required.');
      /*
       * The passkey wallet funds through the SDK's `hireErc8183Agent`, which
       * builds a $U job. Rather than let a USDT price reach it and become a
       * $U job the seller never priced, it is refused here by name.
       */
      if (signedQuote && nonDefaultHireToken(escrowChainId, signedQuote.intent.currency)) {
        throw new HireFailure(
          `${agent.name} priced this in USDT, and the passkey wallet funds $U only. Nothing was sent. Connect a browser wallet to fund a USDT hire.`,
          'payment',
          'token-not-supported-by-wallet',
        );
      }
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
        task: sending,
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

      /*
       * The passkey hire is one SDK call; the job id is predicted from the
       * counter and journaled first, so an answer lost in the relay is found
       * on chain by the same reconciliation as a browser-wallet hire.
       */
      const passkeyCounter = await readClient(escrowChainId)
        .readContract({ address: correctedErc8183Addresses(escrowChainId).commerce as `0x${string}`, abi: [{ name: 'jobCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const, functionName: 'jobCounter' })
        .catch(() => null);
      const begun = journal.begin({
        wallet: wallet.address, chainId: escrowChainId, provider: providerAddress as string,
        agent: { chainId: agent.chainId, tokenId: agent.tokenId, name: agent.name },
        task: sending, description: committedTask, token: paymentToken, amountRaw: budgetRaw.toString(),
        expiredAt: null, startedAt: new Date().toISOString(),
        predictedJobId: passkeyCounter === null ? null : (passkeyCounter + 1n).toString(),
      });
      if (!begun.ok) {
        setPendingAttempt({ ...begun.blocking, state: 'pending' });
        throw new HireFailure('An earlier funding attempt from this wallet has not resolved yet. Nothing new was sent.', 'payment', 'funding-pending');
      }
      attemptWallet = wallet.address;
      const outcome = await hireErc8183Agent(
        { address: wallet.address },
        signer,
        { provider: providerAddress as `0x${string}`, task: committedTask, budget: budgetRaw, deadlineSeconds: deliverySeconds },
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
        task: sending,
        budgetRaw: outcome.budget.toString(),
        /* `hireErc8183Agent` encodes `createJob`, which binds the job to the escrow default. */
        paymentToken: correctedErc8183Addresses(WALLET_NETWORK.chainId).paymentToken as `0x${string}`,
        expiredAt: new Date(Number(outcome.expiredAt) * 1000).toISOString(),
        hiredAt: now,
        hireTxHash: outcome.transactionHash ?? null,
        status: 'FUNDED',
        statusCheckedAt: now,
        deliverableUrl: null,
        settleTxHash: null,
      };
      rememberJob(wallet.address, hired);
      journal.close(wallet.address, escrowChainId);
      attemptWallet = null;
      // Not awaited: its retries must not hold up the seller's notice, which indexes too.
      void indexFundedJob(hired);
      setJob(hired);
      forgetBrief(agent);
      setState('hired');
      await notifySeller(hired);
    } catch (caught) {
      /*
       * An attempt that reached the wallet ends one of two ways. Refused in
       * the wallet before anything was handed back: nothing was sent, so it is
       * closed and the buyer may try again. Anything else — a timeout, a
       * receipt that never came, a lost reply — may have paid: it stays open
       * as pending reconciliation, is checked against the chain, and blocks a
       * new hire. It is never shown as a failure to retry.
       */
      const open = attemptWallet ? journal.read(attemptWallet, escrowChainId) : null;
      if (attemptWallet && open) {
        const sentNothing = open.txHashes.length === 0 && open.callsId === null && open.jobId === null;
        if (sentNothing && isWalletRejection(caught)) {
          journal.close(attemptWallet, escrowChainId);
        } else {
          const pending = journal.note(attemptWallet, escrowChainId, { state: 'pending' }) ?? open;
          setPendingAttempt(pending);
          setReconcileNote(`The funding did not report a clear result (${caught instanceof Error ? caught.message.split('\n')[0].slice(0, 160) : 'no detail'}). It may have gone through. Pokter is checking the chain; nothing new can be funded from this wallet until it does.`);
          setHeldAfterFailure(acquired > 0n ? formatUnits(acquired, 18) : null);
          setState('idle');
          void recheckFunding(pending);
          return;
        }
      }
      setErrorLayer(caught instanceof HireFailure ? caught.layer : isWalletRejection(caught) ? 'wallet' : null);
      setError(caught instanceof HireFailure ? caught.message : walletActionError(caught, 'Commissioning'));
      setHeldAfterFailure(acquired > 0n ? formatUnits(acquired, 18) : null);
      setState('error');
    }
  };

  /**
   * Settle an open attempt from the chain. Funded: the job is adopted —
   * recorded, indexed, the seller told — and the attempt closed; it is never
   * funded again. Not funded: closed, and the buyer may hire. Otherwise it
   * stays pending and keeps new hires from this wallet blocked.
   */
  async function recheckFunding(attempt: FundingAttempt | null = pendingAttempt) {
    if (!attempt) return;
    setReconciling(true);
    try {
      const reader = attemptReader(attempt.chainId, attempt.wallet as `0x${string}`, attempt.provider as `0x${string}`);
      const verdict = await reconcileAttempt(attempt, reader);
      if (verdict.outcome === 'funded') {
        const onchain = await reader.job(BigInt(verdict.jobId)).catch(() => null);
        const bound = await reader.token(BigInt(verdict.jobId));
        const at = new Date().toISOString();
        const adopted = fundedJobRecord({
          jobId: verdict.jobId,
          chainId: attempt.chainId,
          agent: attempt.agent,
          provider: attempt.provider as `0x${string}`,
          task: attempt.task,
          budgetRaw: onchain?.budget ?? attempt.amountRaw,
          /* The token the escrow reports, when it answered; unknown otherwise, never the plan's. */
          paymentToken: (bound ?? attempt.token) as `0x${string}`,
          tokenConfirmed: bound !== null,
          expiredAt: attempt.expiredAt ?? at,
          hireTxHash: (attempt.txHashes.at(-1) ?? null) as `0x${string}` | null,
          at,
        });
        rememberJob(attempt.wallet, adopted);
        journal.close(attempt.wallet, attempt.chainId);
        setPendingAttempt(null);
        setReconcileNote(null);
        void indexFundedJob(adopted);
        setJob(adopted);
        setState('hired');
        await notifySeller(adopted);
        return;
      }
      if (verdict.outcome === 'not-funded') {
        journal.close(attempt.wallet, attempt.chainId);
        setPendingAttempt(null);
        setReconcileNote(`${verdict.detail} You can fund this hire now.`);
        return;
      }
      setPendingAttempt({ ...attempt, state: 'pending' });
      setReconcileNote(verdict.detail);
    } catch {
      setReconcileNote('The chain could not be read just now. Nothing new can be funded from this wallet until this attempt is resolved; check again shortly.');
    } finally {
      setReconciling(false);
    }
  }

  const revokeAllowance = async () => {
    if (!active.address) return;
    setRevoking(true);
    try {
      /* The approval of the token this hire used, which for USDT is not the escrow default. */
      await revokeExternalWalletAllowance(active.address as `0x${string}`, escrowChainId, (job?.paymentToken ?? hireToken?.address ?? undefined) as `0x${string}` | undefined);
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
    exampleCheck,
    confirmExampleWallet,
    adoptOwnWallet,
    needsQuote,
    prepareQuote,
    quoting,
    quoteFailure,
    reviewQuote,
    reviewRequest,
    reviewCheck,
    unverifiedOverride,
    setUnverifiedOverride,
    fundBlock,
    /*
     * The compiler, as the request step reads it: the live compilation, the
     * approval bound to it, what changed since, and the text that will
     * actually be sent.
     */
    compiled,
    answers,
    compiling,
    compileFailure,
    compileRequest,
    answerMissingInput,
    approveRequest,
    approvedRequest,
    requestChanged,
    outboundTask,
    riskWarnings,
    taskTemplates,
    taskReady,
    selectedTemplate,
    taskSchema,
    chooseTemplate,
    task,
    setTask,
    budget,
    /** What funding would do: the token, the exact amount and the wallet path, or why it cannot. */
    plan,
    /** An unresolved funding attempt from this wallet, and what the chain said about it last. */
    pendingAttempt,
    reconcileNote,
    reconciling,
    recheckFunding: () => recheckFunding(),
    /** The non-$U token the quoted price is in, or null for $U. */
    hireToken,
    /** Why the quoted price cannot be funded here, when its token is not one Pokter funds. */
    hireTokenError: quotedToken.error,
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
    errorLayer,
    briefSource,
    previewSkill,
    recipeId,
    setTaskKeepingFormat,
    recipeExample: recipeId ? (taskTemplates.find((t) => t.recipe === recipeId)?.task ?? null) : null,
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
