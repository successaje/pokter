import type { ScanAgentDetail } from '@/lib/scan/types';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { verifyNegotiationSignature } from '@/lib/erc8183/negotiation';

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
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function responseData(payload: unknown): Record<string, unknown> | null {
  const root = object(payload);
  const result = object(root?.result);
  const parts = Array.isArray(result?.parts) ? result.parts : [];
  for (const part of parts) {
    const data = object(object(part)?.data);
    if (data) return data;
  }
  return null;
}

/** The fixed, read-only brief used to ask an agent what it charges. */
const PRICE_ENQUIRY = {
  task_description:
    'Quote your standard deliverable so a buyer can see the price before hiring.',
  terms: {
    deliverables: 'A JSON assessment with assumptions and data sources.',
    quality_standards:
      'Read-only analysis only. Execute no transaction and move no funds.',
  },
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
  { timeoutMs = 12_000 }: { timeoutMs?: number } = {},
): Promise<AgentQuote | null> {
  const endpoint = agent.services?.a2a?.endpoint?.replace(
    '{agentId}',
    agent.token_id,
  );
  if (!endpoint || !agent.agent_wallet) return null;

  try {
    const card = await withPublicEndpoint(endpoint, async (cardEndpoint) => {
      const response = await cardEndpoint.fetch({
        headers: { accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Agent Card answered ${response.status}.`);
      return object(await readJson(response));
    });

    const skills = Array.isArray(card?.skills) ? card.skills : [];
    const canNegotiate = skills.some((skill) => {
      const value = object(skill);
      return value?.id === 'negotiate' || value?.name === 'negotiate';
    });
    if (!canNegotiate || typeof card?.url !== 'string') return null;

    const payload = await withPublicEndpoint(card.url, async (service) => {
      const response = await service.fetch({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'message/send',
          params: {
            message: {
              role: 'user',
              messageId: crypto.randomUUID(),
              parts: [{ kind: 'data', data: { skill: 'negotiate', ...PRICE_ENQUIRY } }],
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
      return readJson(response);
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
      return null;
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
    });

    const expiry = response?.quote_expires_at;
    return {
      priceRaw,
      priceU: Number(priceRaw) / 1e18,
      currency,
      quotedAt: new Date().toISOString(),
      expiresAt:
        typeof expiry === 'number' && Number.isFinite(expiry)
          ? new Date(expiry * 1000).toISOString()
          : null,
      signer,
    };
  } catch {
    return null;
  }
}
