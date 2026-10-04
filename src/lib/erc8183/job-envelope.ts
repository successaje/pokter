import { getAddress, type Address } from 'viem';

export const POKTER_JOB_ENVELOPE_VERSION = 1 as const;

/**
 * The provider's own signed quote, carried into the job it prices.
 *
 * Sellers built on the BNB Agent Studio pattern answer `negotiate` with a
 * signature over the negotiated request and response, then refuse
 * `notify_funded` for any funded job that does not carry it back — the
 * agent has no way to tell its quote from a budget somebody invented.
 * Pokter negotiated these and then dropped them on the floor at funding
 * time, so a job arrived carrying a description the seller had never
 * agreed to.
 *
 * `domain` is recorded because the signature is bound to one: a quote
 * signed for chain 56 says nothing about a job funded on 97, and storing
 * the chain the seller signed for is what lets anyone check that later
 * instead of assuming it matched.
 */
export interface PokterJobQuote {
  negotiationHash: string;
  providerSignature: string;
  /** Raw payment-token units, as the seller quoted them. */
  priceRaw?: string;
  /** Seconds since the epoch, after which the seller may refuse the quote. */
  expiresAt?: number;
  /** The chain and contract the signature was bound to. */
  domain?: { chainId: number; verifyingContract: Address };
}

export interface PokterJobEnvelope {
  protocol: 'pokter-job';
  version: typeof POKTER_JOB_ENVELOPE_VERSION;
  identity: {
    chainId: number;
    tokenId: string;
    name?: string;
  };
  category: string;
  provider: Address;
  providerLabel?: string;
  task: string;
  quote?: PokterJobQuote;
}

const HASH = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

function optionalLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.trim();
  return label.length > 0 && label.length <= 120 ? label : undefined;
}

/**
 * A quote, or nothing — never a half of one.
 *
 * A malformed quote does not invalidate the job: the envelope's first duty
 * is saying which agent the job belongs to, and dropping the whole record
 * over an unreadable signature would lose that. It is left off instead, so
 * "no quote was carried" and "a quote was carried" stay distinguishable
 * rather than collapsing into a field nobody can trust.
 */
function optionalQuote(value: unknown): PokterJobQuote | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.negotiationHash !== 'string' || !HASH.test(raw.negotiationHash))
    return undefined;
  if (
    typeof raw.providerSignature !== 'string' ||
    !SIGNATURE.test(raw.providerSignature)
  )
    return undefined;

  const quote: PokterJobQuote = {
    negotiationHash: raw.negotiationHash.toLowerCase(),
    providerSignature: raw.providerSignature.toLowerCase(),
  };
  if (typeof raw.priceRaw === 'string' && /^\d{1,78}$/.test(raw.priceRaw))
    quote.priceRaw = raw.priceRaw;
  if (
    typeof raw.expiresAt === 'number' &&
    Number.isSafeInteger(raw.expiresAt) &&
    raw.expiresAt > 0
  )
    quote.expiresAt = raw.expiresAt;

  const domain =
    typeof raw.domain === 'object' && raw.domain !== null
      ? (raw.domain as Record<string, unknown>)
      : null;
  if (
    domain &&
    Number.isSafeInteger(domain.chainId) &&
    (domain.chainId as number) > 0 &&
    typeof domain.verifyingContract === 'string'
  ) {
    try {
      quote.domain = {
        chainId: domain.chainId as number,
        verifyingContract: getAddress(domain.verifyingContract),
      };
    } catch {
      /* An unreadable address drops the domain, not the quote. */
    }
  }
  return quote;
}

/**
 * Data committed into ERC-8183's immutable job description.
 *
 * The provider may be different from the selected registry identity (for
 * example, Pokter's testnet delivery seller). Recording both makes that
 * distinction independently visible instead of attributing the provider's
 * work to whichever listing happened to be open in the browser.
 */
export function encodePokterJobEnvelope(input: {
  identityChainId: number;
  agentTokenId: string;
  agentName?: string;
  category: string;
  provider: Address;
  providerLabel?: string;
  task: string;
  quote?: PokterJobQuote;
}): string {
  if (!Number.isSafeInteger(input.identityChainId) || input.identityChainId <= 0)
    throw new Error('Invalid agent identity chain.');
  if (!/^\d+$/.test(input.agentTokenId))
    throw new Error('Invalid ERC-8004 token id.');
  if (!input.category.trim()) throw new Error('Agent category is required.');
  if (!input.task.trim()) throw new Error('Task is required.');
  if (input.agentName && !optionalLabel(input.agentName))
    throw new Error('Agent name must be at most 120 characters.');
  if (input.providerLabel && !optionalLabel(input.providerLabel))
    throw new Error('Provider label must be at most 120 characters.');
  /*
   * Encoding is where a bad quote is a caller's bug and worth refusing;
   * decoding reads whatever is already immutable on chain and cannot.
   */
  if (input.quote && !optionalQuote(input.quote))
    throw new Error(
      'A quote must carry a 32-byte negotiation hash and a 65-byte provider signature.',
    );

  const envelope: PokterJobEnvelope = {
    protocol: 'pokter-job',
    version: POKTER_JOB_ENVELOPE_VERSION,
    identity: {
      chainId: input.identityChainId,
      tokenId: input.agentTokenId,
      name: optionalLabel(input.agentName),
    },
    category: input.category,
    provider: getAddress(input.provider),
    providerLabel: optionalLabel(input.providerLabel),
    task: input.task.trim(),
    quote: optionalQuote(input.quote),
  };
  const encoded = JSON.stringify(envelope);
  if (new TextEncoder().encode(encoded).byteLength > 4096) {
    throw new Error('The task and identity envelope must be at most 4096 bytes.');
  }
  return encoded;
}

export function decodePokterJobEnvelope(value: string): PokterJobEnvelope | null {
  try {
    const parsed = JSON.parse(value) as Partial<PokterJobEnvelope>;
    if (
      parsed.protocol !== 'pokter-job' ||
      parsed.version !== POKTER_JOB_ENVELOPE_VERSION ||
      !parsed.identity ||
      !Number.isSafeInteger(parsed.identity.chainId) ||
      !/^\d+$/.test(parsed.identity.tokenId) ||
      typeof parsed.category !== 'string' ||
      typeof parsed.provider !== 'string' ||
      typeof parsed.task !== 'string'
    ) {
      return null;
    }
    return {
      protocol: 'pokter-job',
      version: POKTER_JOB_ENVELOPE_VERSION,
      identity: {
        chainId: parsed.identity.chainId,
        tokenId: parsed.identity.tokenId,
        name: optionalLabel(parsed.identity.name),
      },
      category: parsed.category,
      provider: getAddress(parsed.provider),
      providerLabel: optionalLabel(parsed.providerLabel),
      task: parsed.task,
      quote: optionalQuote(parsed.quote),
    };
  } catch {
    return null;
  }
}
