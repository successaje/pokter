import { statedRefusal } from '@/lib/erc8183/refusal';
import { readAgentCard } from '@/lib/agents/agent-card';
import type { ScanAgentDetail } from '@/lib/scan/types';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { deadlineSignal } from '@/lib/net/bounded';
import { criteriaInSignedTerms, negotiationContent, negotiationTermsBound, verifyNegotiationSignature } from '@/lib/erc8183/negotiation';
import { negotiationSkillOf } from '@/lib/erc8183/courier-parse';
import { settlementHint } from '@/lib/network/escrow';
import type { PreferredCurrency } from '@/lib/network/currency-preference';
import { decimalsFor, settlementChainOf } from '@/lib/network/tokens';
import { readA2AReply } from '@/lib/a2a/reply';
import { classifyQuoteError, quoteFailure, type QuoteFailure } from '@/lib/hire/failure';
import { jsonRpcEndpoint } from '@/lib/a2a/card';
import { POKTER_TERMS } from './terms';

/**
 * A price an agent quoted for itself, and the evidence that it did.
 *
 * Deliberately not called a price. A quote is signed by the agent's own
 * ERC-8004 wallet and carries an expiry — the one we saw is a dated
 * observation, not a tariff, and the interface has to say so or it is
 * publishing a number it cannot stand behind.
 */
export interface AgentQuote {
  /** Raw on-chain units, as the agent signed them. */
  priceRaw: string;
  /** Decimal $U, for display only. */
  priceU: number;
  /** ERC-20 the agent wants paying in. */
  currency: string;
  /** When the agent said it. */
  quotedAt: string;
  /** When the agent said it would stop honouring it, if it said. */
  expiresAt: string | null;
  /** The wallet the signature recovered to — the agent's own. */
  signer: string;
  /**
   * The signature itself, and what it covers.
   *
   * Verified and then discarded until now, which was fine while a quote was
   * only a number to display. A job funded against this quote has to carry
   * it back to the seller, and a seller cannot tell its own quote from a
   * price somebody typed without the signature that proves it said so.
   */
  negotiationHash: string;
  providerSignature: string;
  /**
   * The chain and contract the signature was bound to, when the seller said.
   *
   * Read because it decides whether the quote can govern anything here. A
   * seller signing for chain 56 against the mainnet ERC-8183 deployment has
   * quoted honestly and still described a job Pokter cannot create, and this
   * was being parsed off the wire and dropped one line below — so the only
   * field that answers "can this be hired" never left the function.
   */
  domain: { chainId: number; verifyingContract: string } | null;
  /**
   * The signed quote as the reference SDK anchors it in a job: exactly the
   * fields the negotiation hash covers, plus the hash and the signature.
   *
   * Sellers on that pattern read these from the funded job's description
   * and re-derive the hash before they deliver. The hash and signature on
   * their own are not enough: without the terms, the seller cannot show the
   * hash is of its own quote, and refuses the job.
   */
  anchor: Record<string, unknown> | null;
  /**
   * Whether the agent signed the acceptance criteria Pokter sent. When they
   * carry a ProofRun spec line, that exact line, which fixes every criterion
   * by hash, is what must be signed and the prose lines are advisory;
   * otherwise every criterion must be inside the signed terms. Null when
   * none were sent. Only `true` makes the criteria agreed rather than
   * recorded by Pokter (see shared/contracts).
   */
  criteriaSigned: boolean | null;
  /**
   * The criteria the agent's signature actually covered, as the hash was
   * computed over them.
   *
   * `criteriaSigned` above answers the question for this quote; this is
   * what is needed to answer it again later. A receipt is written days
   * after the quote, from a stored row, and re-deciding then from the
   * criteria themselves — rather than trusting a boolean a past version of
   * the rule wrote down — is what lets the rule be tightened without
   * silently re-blessing old agreements.
   *
   * Null when the agent echoed none.
   */
  signedCriteria: string[] | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function responseData(payload: unknown): Record<string, unknown> | null {
  // Message or task alike; a failed or still-working task carries no quote.
  const reply = readA2AReply(payload);
  return reply.state === 'completed' || reply.state === 'input-required' ? reply.data : null;
}

export { POKTER_TERMS } from './terms';


/** The fixed, read-only brief used to ask an agent what it charges. */
const PRICE_ENQUIRY = {
  task_description:
    'Quote your standard deliverable so a buyer can see the price before hiring.',
  terms: POKTER_TERMS,
} as const;

/**
 * Ask an agent what it charges, and verify it said so itself.
 *
 * This is the same read-only negotiation the trial runs: it moves no funds,
 * creates no permission and writes nothing on chain. The difference is only
 * who asked and why, so both go through here rather than keeping two copies
 * of the A2A envelope that would drift apart.
 *
 * Returns null rather than throwing for every ordinary way an agent can fail
 * to answer, because a sweep across the whole roster must not stop at the
 * first silent agent — and an agent that will not quote is a fact worth
 * recording as an absence, not an error.
 */
export async function requestQuote(
  agent: ScanAgentDetail,
  {
    timeoutMs = 12_000,
    enquiry = PRICE_ENQUIRY,
    onRefused,
    onFailure,
    signal,
    preferredCurrency = null,
  }: {
    /**
     * The buyer's preferred currency, sent beside the brief (outside the
     * signed terms). The agent may sign in it or not; the quote is whatever
     * it signs.
     */
    preferredCurrency?: PreferredCurrency | null;
    timeoutMs?: number;
    /*
     * The brief to negotiate over, when it is not the standing price
     * enquiry.
     *
     * The signature covers the request as well as the response — the hash
     * the seller returns commits to this exact task_description and these
     * exact terms — so a quote obtained for one brief does not govern a job
     * funded with another. A hire therefore negotiates with the text it is
     * about to commit on chain, not with the sweep's generic enquiry.
     */
    enquiry?: {
      task_description: string;
      terms: { deliverables: string; quality_standards: string; success_criteria?: string[] };
    };
    /**
     * The seller's own words when it declines, so a buyer is told what to
     * change rather than that the agent "may be unreachable".
     *
     * A refusal is usually the most useful thing a seller says: "needs the
     * token address" is a brief a buyer can fix in seconds, and discarding
     * it turns a fixable hire into an agent that looks broken.
     */
    onRefused?: (reason: string) => void;
    /** Why no quote came back, when none did: which layer, and whether to retry. */
    onFailure?: (failure: QuoteFailure) => void;
    /**
     * The caller's cancellation, so an abandoned sweep stops negotiating.
     *
     * Asking an agent what it charges is a real request to a third party's
     * endpoint, and the sweep makes up to two of them per agent. When the
     * run that asked has gone away, the asking should stop with it.
     */
    signal?: AbortSignal;
  } = {},
): Promise<AgentQuote | null> {
  const endpoint = agent.services?.a2a?.endpoint?.replace(
    '{agentId}',
    agent.token_id,
  );
  const fail = (failure: QuoteFailure) => {
    onFailure?.(failure);
    return null;
  };
  if (!endpoint || !agent.agent_wallet) return fail(quoteFailure('no-endpoint'));

  try {
    const card = await readAgentCard(endpoint);

    const skills = Array.isArray(card?.skills) ? card.skills : [];
    const negotiateSkill = negotiationSkillOf(skills);
    if (!negotiateSkill) return fail(quoteFailure(card ? 'no-price-skill' : 'no-endpoint'));
    // The card's JSON-RPC interface, in either card format (see `jsonRpcEndpoint`).
    const serviceUrl = jsonRpcEndpoint(card);
    if (!serviceUrl) return fail(quoteFailure('no-endpoint', { detail: 'no HTTPS JSON-RPC interface on its card' }));

    const rpcId = crypto.randomUUID();
    const payload = await withPublicEndpoint(serviceUrl, async (service) => {
      const response = await service.fetch({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: rpcId,
          method: 'message/send',
          params: {
            message: {
              role: 'user',
              messageId: crypto.randomUUID(),
              parts: [
                {
                  kind: 'data',
                  data: { skill: negotiateSkill, ...enquiry, ...settlementHint(agent, undefined, undefined, preferredCurrency) },
                },
              ],
            },
            configuration: {
              acceptedOutputModes: ['application/json'],
              blocking: true,
            },
          },
        }),
        cache: 'no-store',
        redirect: 'error',
        signal: deadlineSignal(timeoutMs, signal),
      });
      if (!response.ok) throw new Error(`Agent answered ${response.status}.`);
      return readJson(response, { expectId: rpcId });
    });

    const data = responseData(payload);
    const response = object(data?.response);
    const terms = object(response?.terms);
    const priceRaw = terms?.price;
    const currency = terms?.currency;
    if (
      !data ||
      typeof data.negotiation_hash !== 'string' ||
      typeof data.provider_sig !== 'string' ||
      typeof priceRaw !== 'string' ||
      typeof currency !== 'string' ||
      !/^\d+$/.test(priceRaw)
    ) {
      const stated = statedRefusal(data?.reason);
      if (stated) onRefused?.(stated);
      const reply = readA2AReply(payload);
      if (stated || data?.accepted === false || data?.status === 'rejected') return fail(quoteFailure('seller-declined', { sellerReason: stated ?? undefined }));
      if (reply.state === 'working' || reply.state === 'submitted') return fail(quoteFailure('seller-not-ready'));
      return fail(quoteFailure('no-quote'));
    }

    /*
     * The signature is checked before the number is kept. An unsigned price,
     * or one signed by some wallet other than the agent's registered one, is
     * a claim by whoever answered the socket — exactly the kind of number
     * this product exists not to repeat.
     */
    const signer = await verifyNegotiationSignature({
      negotiationHash: data.negotiation_hash,
      providerSignature: data.provider_sig,
      expectedProvider: agent.agent_wallet,
    }).catch((error: unknown) => {
      throw new Error(`signature check failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    /*
     * And the signed hash must be the hash of these terms. Otherwise the
     * signature proves who answered but not that this price is what they
     * signed: a replayed hash with a different price would pass the check
     * above. Derivation as in BNB's reference SDK.
     */
    if (!negotiationTermsBound(data, enquiry.task_description)) return fail(quoteFailure('terms-mismatch'));
    const content = negotiationContent(data, enquiry.task_description);

    const expiry = data.quote_expires_at || response?.quote_expires_at;
    /* Absent on some sellers, which is "unbound", not "bound to ours". */
    const domainChain = data.chain_id;
    const verifyingContract = data.verifying_contract;
    return {
      priceRaw,
      /* In the currency's own units: its recorded decimals, eighteen only for a token Pokter has not verified (as before). */
      priceU: Number(priceRaw) / 10 ** (decimalsFor(settlementChainOf(currency) ?? -1, currency) ?? 18),
      currency,
      quotedAt: new Date().toISOString(),
      negotiationHash: data.negotiation_hash,
      providerSignature: data.provider_sig,
      expiresAt:
        typeof expiry === 'number' && Number.isFinite(expiry)
          ? new Date(expiry * 1000).toISOString()
          : null,
      signer,
      domain:
        typeof domainChain === 'number' &&
        Number.isSafeInteger(domainChain) &&
        domainChain > 0 &&
        typeof verifyingContract === 'string'
          ? { chainId: domainChain, verifyingContract }
          : null,
      anchor: content
        ? { ...content, negotiation_hash: data.negotiation_hash, provider_sig: data.provider_sig }
        : null,
      criteriaSigned: criteriaInSignedTerms(enquiry.terms.success_criteria, content),
      /* From the hashed content, so these are the strings the signature
         covered rather than the ones the reply happened to display. */
      signedCriteria: (() => {
        const signed = (content?.terms as { success_criteria?: unknown } | undefined)?.success_criteria;
        return Array.isArray(signed) && signed.every((c) => typeof c === 'string') ? (signed as string[]) : null;
      })(),
    };
  } catch (error) {
    return fail(classifyQuoteError(error));
  }
}

