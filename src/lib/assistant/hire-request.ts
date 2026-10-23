import { commissionAuthority, type CommissionAuthority } from '@/lib/hire/commission-authority';
import { checkPurchaseIntent, EXPIRY_MARGIN_SECONDS, type PurchaseIntent } from '@/lib/hire/purchase-intent';
import { formatAmount } from '@/lib/network/tokens';
import type { BriefContract } from '@/lib/hire/brief-compiler';

import { AGENT_TEXT_CANNOT, termsWithinMandate, type MandateRefusalCode, type OwnerMandate } from './mandate';

/**
 * The hire as an assistant may hand it over: fully stated, and unsigned.
 *
 * Pokter has two funding paths and a human stands in both of them. The
 * browser path asks the buyer's own wallet (`hireFromExternalWallet`); the
 * operator path signs with Pokter's own admin signer and is gated behind
 * `requireDemoWriteAccess`. This module adds no third. It produces the
 * *request* — the terms, in words and in fields — and the owner approves it
 * in their own wallet, where the existing engine builds the five ERC-8183
 * calls through the SDK's `buildHireCalls` and `checkPurchaseIntent` tests
 * these same terms one last time before anything is signed.
 *
 * That is why there is no calldata here, and no predicted job id. Both
 * belong to the moment of signing: the job id is `jobCounter + 1` read at
 * that moment, and a request carrying a stale one would be a second,
 * worse copy of an engine that already exists and already confirms what it
 * created (see `hire-confirm`).
 *
 * What this does add is the part an assistant cannot be trusted to supply
 * from memory: every term written down, in one object, with no default a
 * reader could miss. The chain, the escrow contract, the provider wallet
 * and where it came from, the token, the amount in raw units and in words,
 * when the price stops holding, and the exact task the signature covers.
 * A field left to a default is a field the owner approves without reading.
 */

export interface PreparedQuote {
  priceRaw: string;
  currency: string;
  /** ISO, as the agent said it. Null when it set no expiry. */
  expiresAt: string | null;
  negotiationHash: string;
  /** The wallet the signature recovered to: the agent's own registered key. */
  signer: string;
  domain: { chainId: number; verifyingContract: string } | null;
}

export interface PreparedBrief {
  /** The exact text the agent is sent and the price is signed over. */
  task: string;
  skill: string | null;
  contract: BriefContract;
  /** What the compiler established, in its own words. */
  statement: string | null;
  /** Every value the agent will receive, as the review screen shows them. */
  inputs: Array<{ label: string; value: string; declared: boolean }>;
}

export interface PrepareHireInput {
  agent: { chainId: number; tokenId: string; name: string; category: string };
  /** From the registry record, never from a reply. */
  provider: string;
  providerLabel?: string | null;
  mandate: OwnerMandate;
  escrow: {
    chainId: number;
    commerce: string;
    paymentToken: string;
    decimals: number;
    testnet: boolean;
    label: string;
    /** "Real funds" or "Test tokens", as `networkOf` words it. */
    money: string;
  };
  quote: PreparedQuote;
  brief: PreparedBrief;
  /** Where the owner reviews and funds it, in their own wallet. */
  approvalUrl: string;
  requestKey: string;
  /** The agent's own words, already bounded by `agentNote`. Display only. */
  agentSaid?: string | null;
  nowMs?: number;
}

export interface PreparedHireTerms {
  /** Which network, and whether approving this spends real money. */
  chain: { id: number; label: string; testnet: boolean; money: string; statedBy: 'the owner' };
  escrow: { standard: 'ERC-8183'; contract: string; releases: string };
  provider: { address: string; label: string | null; source: 'erc8004-registry' };
  token: { address: string; symbol: string; decimals: number };
  amount: { raw: string; display: string };
  /**
   * The owner's own ceiling, in the same money as the amount.
   *
   * Stated beside the price because a bare number is ambiguous about the
   * one thing that matters most: "5" is five real $U on chain 56 and five
   * test $U on chain 97, and the agent used to choose which by choosing its
   * currency. The owner now states the chain, and the ceiling is printed in
   * that chain's money so the figure they approve is the figure they set.
   */
  ceiling: { raw: string; display: string; statedBy: 'the owner' };
  quote: {
    negotiationHash: string;
    signedBy: string;
    signedOver: 'the exact task text below';
    expiresAt: string | null;
    validForSeconds: number | null;
    boundTo: { chainId: number; verifyingContract: string } | null;
  };
  task: { text: string; characters: number; skill: string | null; contract: BriefContract };
}

export interface PreparedHire {
  requestKey: string;
  state: 'unsigned-awaiting-owner-approval';
  /** Flat and unmissable: nothing in this object has been signed by anyone but the agent, over its own price. */
  signed: false;
  approval: {
    required: true;
    by: string;
    where: string;
    toDo: string;
    pokterHas: string[];
    pokterHasNot: string[];
  };
  agent: { chainId: number; tokenId: string; name: string; category: string };
  terms: PreparedHireTerms;
  /** The authority funding this creates, from `commissionAuthority`. */
  authority: CommissionAuthority;
  /** The record the wallet step re-checks, field by field, before it signs. */
  intent: PurchaseIntent;
  brief: PreparedBrief;
  /** The agent's own words, quoted for a human and parsed by nothing. */
  agentSaid: string | null;
  agentTextCannot: readonly string[];
  next: string[];
}

export type PrepareHireResult =
  | { ok: true; prepared: PreparedHire }
  | { ok: false; code: MandateRefusalCode | 'quote-expired' | 'quote-unusable'; message: string };

/**
 * Build the request, or refuse to.
 *
 * Both gates run and both are somebody else's rule rather than this
 * module's: `termsWithinMandate` is the owner's ceiling and targets, and
 * `checkPurchaseIntent` is the check the wallet itself applies immediately
 * before signing. Running the second here means a request that the wallet
 * would refuse is never handed to an owner to approve — the chain, token,
 * contract and expiry mismatches are caught while there is nothing to undo.
 */
export function prepareHire(input: PrepareHireInput): PrepareHireResult {
  const nowMs = input.nowMs ?? Date.now();
  const expiresAtSeconds = input.quote.expiresAt ? Math.floor(Date.parse(input.quote.expiresAt) / 1000) : null;
  const expiry = expiresAtSeconds !== null && Number.isFinite(expiresAtSeconds) ? expiresAtSeconds : null;

  const refusal = termsWithinMandate(input.mandate, {
    provider: input.provider,
    amountRaw: input.quote.priceRaw,
    currency: input.quote.currency,
    chainId: input.escrow.chainId,
    escrow: input.escrow.commerce,
    task: input.brief.task,
  });
  if (refusal) return { ok: false, code: refusal.code, message: refusal.message };

  const intent: PurchaseIntent = {
    provider: input.provider as PurchaseIntent['provider'],
    task: input.brief.task,
    amountRaw: input.quote.priceRaw,
    currency: input.quote.currency as PurchaseIntent['currency'],
    chainId: input.escrow.chainId,
    verifyingContract: (input.quote.domain?.verifyingContract ?? null) as PurchaseIntent['verifyingContract'],
    expiresAt: expiry,
    negotiationHash: input.quote.negotiationHash,
  };

  const usable = checkPurchaseIntent(
    intent,
    {
      provider: input.provider,
      task: input.brief.task,
      chainId: input.escrow.chainId,
      commerce: input.escrow.commerce,
      paymentToken: input.escrow.paymentToken,
    },
    nowMs,
  );
  if (!usable.ok) {
    /*
     * One of these is a clock and the rest are a mismatch, and they are
     * reported apart because only the first is worth asking again for: a
     * fresh quote fixes an expired one, and nothing a caller can do fixes a
     * signature bound to another contract.
     */
    const expired = expiry !== null && expiry * 1000 <= nowMs + EXPIRY_MARGIN_SECONDS * 1000;
    return {
      ok: false,
      code: expired ? 'quote-expired' : 'quote-unusable',
      message: expired
        ? `${input.agent.name || `Agent #${input.agent.tokenId}`} signed this price until ${input.quote.expiresAt}, which leaves no time for the owner to read and approve it. Nothing was prepared. Ask for a fresh quote and prepare again.`
        : usable.reason,
    };
  }

  const display = formatAmount(input.escrow.chainId, input.quote.currency, input.quote.priceRaw);
  const symbol = display?.symbol ?? 'unverified token';
  const amountDisplay = display?.label ?? `${input.quote.priceRaw} raw units of ${input.quote.currency}`;
  const name = input.agent.name || `Agent #${input.agent.tokenId}`;

  /*
   * In whole tokens, from the raw amount and this token's own decimals;
   * never a literal 18, for the reason `lib/network/tokens` gives. Nothing
   * below is built for a price that is not a positive amount — escrow
   * cannot hold nothing, and `commissionAuthority` refuses it outright —
   * so it is reported here rather than thrown from inside the object.
   */
  const budgetU = display ? Number(display.amount) : rawToWhole(input.quote.priceRaw, input.escrow.decimals);
  if (!Number.isFinite(budgetU) || budgetU <= 0) {
    return {
      ok: false,
      code: 'quote-unusable',
      message: `${name} signed a price of ${input.quote.priceRaw} raw units, which is not an amount escrow can hold. Nothing was prepared.`,
    };
  }

  const prepared: PreparedHire = {
    requestKey: input.requestKey,
    state: 'unsigned-awaiting-owner-approval',
    signed: false,
    approval: {
      required: true,
      by: 'the wallet owner, in their own wallet',
      where: input.approvalUrl,
      /* The money named, not only the amount: "0.01 $U" reads the same on
         both networks and means real funds on one of them. */
      toDo: `Fund ERC-8183 escrow ${input.escrow.commerce} on chain ${input.escrow.chainId} (${input.escrow.label}, ${input.escrow.money}) with ${amountDisplay} for ${name}, against the exact task in this request.`,
      pokterHas: [
        'Read the agent’s registry record and resolved the wallet escrow would pay',
        'Compiled the brief and established what the agent’s skill accepts',
        'Asked the agent for a price signed by its own registered wallet, and verified that signature',
        'Checked the price, token, chain, escrow contract and provider against the owner’s own limits',
        'Written these terms down in full, unsigned',
      ],
      pokterHasNot: [
        'Signed anything',
        'Moved, approved or escrowed any funds',
        'Created a job on chain',
        'Taken any permission over the owner’s wallet',
      ],
    },
    agent: input.agent,
    terms: {
      chain: { id: input.escrow.chainId, label: input.escrow.label, testnet: input.escrow.testnet, money: input.escrow.money, statedBy: 'the owner' },
      escrow: {
        standard: 'ERC-8183',
        contract: input.escrow.commerce,
        releases: 'The escrow pays the agent only after it delivers and the review window passes without a successful dispute. Until then the owner can dispute, and an undelivered job can be reclaimed after it expires.',
      },
      provider: {
        address: input.provider,
        label: input.providerLabel ?? null,
        source: 'erc8004-registry',
      },
      token: { address: input.quote.currency, symbol, decimals: input.escrow.decimals },
      amount: { raw: input.quote.priceRaw, display: amountDisplay },
      ceiling: {
        raw: input.mandate.maxAmountRaw,
        display:
          formatAmount(input.escrow.chainId, input.escrow.paymentToken, input.mandate.maxAmountRaw)?.label ??
          `${input.mandate.maxAmountRaw} raw units of ${input.escrow.paymentToken}`,
        statedBy: 'the owner',
      },
      quote: {
        negotiationHash: input.quote.negotiationHash,
        signedBy: input.quote.signer,
        signedOver: 'the exact task text below',
        expiresAt: input.quote.expiresAt,
        validForSeconds: expiry === null ? null : Math.max(0, expiry - Math.floor(nowMs / 1000)),
        boundTo: input.quote.domain,
      },
      task: {
        text: input.brief.task,
        characters: input.brief.task.length,
        skill: input.brief.skill,
        contract: input.brief.contract,
      },
    },
    authority: commissionAuthority({
      paymentToken: input.quote.currency,
      escrowContract: input.escrow.commerce,
      budgetU,
    }),
    intent,
    brief: input.brief,
    agentSaid: input.agentSaid ?? null,
    agentTextCannot: AGENT_TEXT_CANNOT,
    next: [
      `Show the owner these terms and send them to ${input.approvalUrl} to approve and fund in their own wallet.`,
      `The price holds until ${input.quote.expiresAt ?? 'the agent withdraws it (it stated no expiry)'}; after that, prepare again for a fresh one.`,
      `Retrying this preparation with the same terms returns this same request under key ${input.requestKey}; it never creates a second job.`,
      'Once the owner has funded it, track the job by its id and check the delivery before releasing escrow.',
    ],
  };
  return { ok: true, prepared };
}

/**
 * Raw units as whole tokens, for the one field `commissionAuthority` states
 * in them.
 *
 * Only reached when the token is not one Pokter has verified, where
 * `formatAmount` returns null rather than guess a scale. The decimals then
 * come from the escrow's own record of its payment token, which is the same
 * source `requireDecimals` reads — a literal would be the defect
 * `lib/network/tokens` documents at a factor of 10^12.
 */
function rawToWhole(raw: string, decimals: number): number {
  try {
    const units = BigInt(raw);
    const scale = 10n ** BigInt(decimals);
    const whole = Number(units / scale);
    const fraction = Number(units % scale) / Number(scale);
    return whole + fraction;
  } catch {
    return 0;
  }
}
