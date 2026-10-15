import { statedRefusal } from '@/lib/erc8183/refusal';
import { readAgentCard } from '@/lib/agents/agent-card';
import type { ScanAgentDetail } from '@/lib/scan/types';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { negotiationContent, negotiationTermsBound, verifyNegotiationSignature } from '@/lib/erc8183/negotiation';
import { negotiationSkillOf } from '@/lib/erc8183/courier-parse';
import { settlementHint } from '@/lib/network/escrow';
import { readA2AReply } from '@/lib/a2a/reply';
import { classifyQuoteError, quoteFailure, type QuoteFailure } from '@/lib/hire/failure';
import { jsonRpcEndpoint } from '@/lib/a2a/card';

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

/**
 * The terms every Pokter negotiation is conducted under.
 *
 * Exported because the hire path has to negotiate under exactly these and
 * then fund under exactly these: the seller's signature covers the terms, so
 * two copies that drifted apart would produce a quote that does not match
 * the job it was obtained for, and the seller would be right to refuse it.
 */
export const POKTER_TERMS = {
  deliverables: 'A JSON assessment with assumptions and data sources.',
  quality_standards:
    'Read-only analysis only. Execute no transaction and move no funds.',
} as const;

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
  }: {
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
      terms: { deliverables: string; quality_standards: string };
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
                  data: { skill: negotiateSkill, ...enquiry, ...settlementHint(agent) },
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
        signal: AbortSignal.timeout(timeoutMs),
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
      priceU: Number(priceRaw) / 1e18,
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
    };
  } catch (error) {
    return fail(classifyQuoteError(error));
  }
}

