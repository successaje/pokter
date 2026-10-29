import 'server-only';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { preflightHireBrief } from '@/lib/erc8183/hire-preflight';
import { quoteUsableForEscrow } from '@/lib/erc8183/negotiation';
import { POKTER_TERMS, requestQuote } from '@/lib/erc8183/quote';
import { amountWithinLimits } from '@/lib/hire/budget-limits';
import { describeQuoteFailure, quoteFailure, type QuoteFailure } from '@/lib/hire/failure';
import { preferredCurrency } from '@/lib/network/currency-preference';
import { displaySymbol, formatAmount, paymentTokenAt } from '@/lib/network/tokens';
import { withRegisteredWallet } from '@/lib/registry/live-agent';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { hireTaskFromRequest, requestTokenOf, type Brief } from './model';
import { proposalPriceFrom, type ProposalQuote } from './proposal-price';
import { getBriefStore } from './store';

export type ProposalQuoteOutcome = { ok: true; quote: ProposalQuote; label: string } | { ok: false; error: string; status: number };

/**
 * Ask an agent what it would sign for a request, as the price of a
 * proposal for it, and keep the answer for the proposal route to check.
 *
 * The brief is the one a hire from the proposal would send
 * (`hireTaskFromRequest`), and the currency the request's own, so the
 * price is the one the hire will meet. Refused here, before anyone signs,
 * when it could not govern that hire: a price in another token, one bound
 * to another chain or contract, or one outside what a hire can fund.
 */
export async function askProposalQuote(brief: Brief, agentChainId: number, agentTokenId: string): Promise<ProposalQuoteOutcome> {
  const token = requestTokenOf(brief);
  if (!token) return { ok: false, status: 409, error: 'This request is priced in a token Pokter cannot read, so it cannot take a proposal.' };
  if (agentChainId !== 56 && agentChainId !== 97) return { ok: false, status: 400, error: 'Invalid agent identifier.' };

  const indexed = await getAgent(agentChainId as ChainId, agentTokenId).catch(() => null);
  if (!indexed) return { ok: false, status: 404, error: 'No such agent.' };
  const agent = await withRegisteredWallet(indexed);
  const name = agent.name || `Agent #${agentTokenId}`;
  const task = hireTaskFromRequest(brief);

  /* The same check a hire makes before asking: a request the agent's skills cannot take would stop the hire too. */
  const preflight = await preflightHireBrief({ chainId: agentChainId as ChainId, tokenId: agentTokenId, task, agent });
  if (!preflight.ok) return { ok: false, status: 422, error: `${name} cannot take this request as it is written: ${preflight.message}` };

  let refusal: string | null = null;
  let failure: QuoteFailure | null = null;
  const signed = await requestQuote(agent, {
    timeoutMs: 20_000,
    preferredCurrency: preferredCurrency(brief.chainId, token.address),
    enquiry: { task_description: task, terms: POKTER_TERMS },
    onRefused: (reason) => {
      refusal = reason;
    },
    onFailure: (reason) => {
      failure = reason;
    },
  });
  if (!signed) {
    if (refusal) return { ok: false, status: 422, error: `${name} declined to price this request: “${refusal}”` };
    const { message, status } = describeQuoteFailure(failure ?? quoteFailure('no-quote'), name);
    return { ok: false, status, error: message };
  }

  if (signed.currency.toLowerCase() !== token.address.toLowerCase()) {
    const other = paymentTokenAt(brief.chainId, signed.currency);
    return {
      ok: false,
      status: 409,
      error: `${name} signs its price in ${other ? displaySymbol(other) : signed.currency}, and this request is priced in ${displaySymbol(token)}. A proposal is in its request’s token, so the agent has to sign in ${displaySymbol(token)} to propose.`,
    };
  }
  /* Not whether it has expired: a hire asks again. Whether it is bound to somewhere that could ever fund this request. */
  const usable = quoteUsableForEscrow(
    { domain: signed.domain ? { chainId: signed.domain.chainId, verifyingContract: signed.domain.verifyingContract as `0x${string}` } : undefined },
    brief.chainId,
    new Date(),
    correctedErc8183Addresses(brief.chainId).commerce,
  );
  if (!usable.usable) return { ok: false, status: 409, error: usable.reason };

  const priceU = proposalPriceFrom(signed.priceRaw, token);
  if (priceU === null) return { ok: false, status: 409, error: `${name} signed an amount that cannot be written as a ${displaySymbol(token)} price exactly, so it cannot be proposed.` };
  const limits = amountWithinLimits(token, BigInt(signed.priceRaw));
  if (!limits.ok) return { ok: false, status: 409, error: `${name} signs ${formatAmount(brief.chainId, token.address, signed.priceRaw)?.label ?? signed.priceRaw}. ${limits.reason}` };

  const quote: ProposalQuote = {
    briefId: brief.id,
    agentChainId,
    agentTokenId,
    priceRaw: signed.priceRaw,
    priceU,
    currency: token.address,
    signer: signed.signer,
    negotiationHash: signed.negotiationHash,
    quotedAt: signed.quotedAt,
    expiresAt: signed.expiresAt,
  };
  getBriefStore().recordProposalQuote(quote);
  return { ok: true, quote, label: formatAmount(brief.chainId, token.address, signed.priceRaw)?.label ?? `${priceU} ${displaySymbol(token)}` };
}
