import { getAddress, isAddress, keccak256, toBytes, type Address, type Hex } from 'viem';

import { canonicalJson, quoteTypedData } from './negotiation';

/**
 * What a seller needs in order to sign a quote with a wallet that refuses
 * plain messages.
 *
 * A quote is normally signed `personal_sign` over the negotiation hash. A
 * Binance Agentic Wallet does not sign plain messages at all — the service
 * refuses EIP-191 and signs only typed data — so an agent whose registered
 * wallet is one could never answer a buyer with a price. Pokter's verifier
 * accepts the typed-data form (`quoteTypedData`); this hands the seller the
 * exact bytes to sign and the two commands that produce them.
 *
 * Nothing is stored and nothing is signed here. The signature is made by the
 * seller's own wallet, and Pokter sees it only when the quote comes back.
 */

const HASH = /^0x[0-9a-fA-F]{64}$/;
const SIGNING_CHAINS = [56, 97] as const;

export type QuoteSigningRefusal = { ok: false; status: number; error: string };

export interface PreparedQuoteSignature {
  ok: true;
  negotiationHash: Hex;
  chainId: number;
  agentWallet: Address;
  /** The struct to sign. Its hash is what the signature commits to. */
  typedData: ReturnType<typeof quoteTypedData>;
  /** Ready to run; its answer carries the requestId the next command takes. */
  preview: string;
  execute: string;
  /** How to turn what the wallet returns into `provider_sig`. */
  then: string;
}

/**
 * The hash a buyer re-derives, from the content a seller is about to quote.
 *
 * Offered because this is the step a seller is most likely to get wrong, and
 * a signature over the wrong hash is indistinguishable from a bad signer at
 * the other end. It is the same derivation the house quote builder and every
 * verifier use.
 */
export function negotiationHashOf(content: unknown): Hex {
  return keccak256(toBytes(canonicalJson(content)));
}

export function prepareQuoteSignature(input: {
  negotiationHash?: unknown;
  content?: unknown;
  chainId?: unknown;
  agentWallet?: unknown;
}): PreparedQuoteSignature | QuoteSigningRefusal {
  const chainId = Number(input.chainId);
  if (!SIGNING_CHAINS.some((id) => id === chainId)) {
    return { ok: false, status: 400, error: `chainId must be ${SIGNING_CHAINS.join(' or ')}: the chain your quote names, which the signature is bound to.` };
  }
  if (typeof input.agentWallet !== 'string' || !isAddress(input.agentWallet, { strict: false })) {
    return { ok: false, status: 400, error: 'agentWallet is required: the wallet the ERC-8004 registry holds for this agent, which must be the wallet that signs.' };
  }

  let negotiationHash: Hex;
  if (input.negotiationHash !== undefined) {
    if (typeof input.negotiationHash !== 'string' || !HASH.test(input.negotiationHash)) {
      return { ok: false, status: 400, error: 'negotiationHash must be 32 bytes as 0x-prefixed hex.' };
    }
    negotiationHash = input.negotiationHash as Hex;
  } else if (input.content !== undefined) {
    try {
      negotiationHash = negotiationHashOf(input.content);
    } catch {
      return { ok: false, status: 400, error: 'content could not be canonicalised, so no hash can be derived from it.' };
    }
  } else {
    return { ok: false, status: 400, error: 'Pass negotiationHash, or content to derive it from.' };
  }

  const agentWallet = getAddress(input.agentWallet);
  const typedData = quoteTypedData(negotiationHash, chainId);
  const wrapper = JSON.stringify({ method: 'eth_signTypedData_v4', params: [agentWallet, typedData] });

  return {
    ok: true,
    negotiationHash,
    chainId,
    agentWallet,
    typedData,
    preview: `baw sign-message preview --binanceChainId ${chainId} --message '${wrapper}' --signType EIP712 --json`,
    execute: 'baw sign-message execute --requestId <requestId from the preview> --json',
    /*
     * The assembly is the part nobody guesses: the wallet returns the 64
     * bytes of r and s without a 0x, and the recovery byte beside them.
     */
    then:
      'The answer carries `signature` (64 bytes of r and s, no 0x) and `signatureRecovery` ("00" or "01"). ' +
      'Your provider_sig is 0x + signature + 1b when the recovery is "00", or 1c when it is "01". ' +
      'Return it with this negotiation_hash and the chain_id you prepared it for. ' +
      'Signing needs Developer Mode on the wallet; it asks its owner for nothing, so an agent can do this per request.',
  };
}
