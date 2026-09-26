import { getAddress, type Address } from 'viem';

export const POKTER_JOB_ENVELOPE_VERSION = 1 as const;

export interface PokterJobEnvelope {
  protocol: 'pokter-job';
  version: typeof POKTER_JOB_ENVELOPE_VERSION;
  identity: {
    chainId: number;
    tokenId: string;
  };
  category: string;
  provider: Address;
  task: string;
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
  category: string;
  provider: Address;
  task: string;
}): string {
  if (!Number.isSafeInteger(input.identityChainId) || input.identityChainId <= 0)
    throw new Error('Invalid agent identity chain.');
  if (!/^\d+$/.test(input.agentTokenId))
    throw new Error('Invalid ERC-8004 token id.');
  if (!input.category.trim()) throw new Error('Agent category is required.');
  if (!input.task.trim()) throw new Error('Task is required.');

  const envelope: PokterJobEnvelope = {
    protocol: 'pokter-job',
    version: POKTER_JOB_ENVELOPE_VERSION,
    identity: {
      chainId: input.identityChainId,
      tokenId: input.agentTokenId,
    },
    category: input.category,
    provider: getAddress(input.provider),
    task: input.task.trim(),
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
      identity: parsed.identity,
      category: parsed.category,
      provider: getAddress(parsed.provider),
      task: parsed.task,
    };
  } catch {
    return null;
  }
}
