import 'server-only';

import { hashMessage, keccak256, parseUnits, toBytes, type Address } from 'viem';

import { adminSigner } from '@/lib/altana/client';
import { hireTokenAt, requireDecimals } from '@/lib/network/tokens';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { canonicalJson } from '@/lib/erc8183/negotiation';
import { EVIDENCE_AGENT } from '@/lib/evidence/agent';
import type { ChainId } from '@/lib/scan/types';

/**
 * A quote the evidence agent actually signs.
 *
 * The first version of this returned terms and no signature, which would
 * have failed Pokter's own listing check — the agent built to report on
 * evidence, listed as an agent with no verifiable price. The diagnostic
 * is unambiguous about it: a quote counts when it is "signed by {signer},
 * which matches the registered agent wallet". Anything less is a number
 * asserted by whoever answered the socket, which is the thing this
 * product exists not to repeat.
 *
 * The hash is derived exactly as `negotiationContent` derives it, because
 * `negotiationTermsBound` re-derives it on the other side and compares.
 * Signing some other digest would recover a valid signer and still fail:
 * the signature would prove who answered, not that this price is what
 * they signed.
 *
 * Signed with the operator key, under its own purpose label.
 *
 * The label does not derive a separate wallet — `adminSigner` returns the
 * same `ALTANA_ADMIN_KEY` signer for every purpose, and the purpose is
 * only read by the mainnet guard. So the evidence agent signs as
 * 0x60eF1484…, the same address the demo seller uses, which is already
 * declared in docs/phase-2/tracking.md §5 and already in TEAM_WALLETS.
 * Nothing new to declare, and the agent will correctly report itself as
 * Pokter-operated — but it does mean one key wears two hats, and a future
 * split would need a second key rather than a second label.
 */
const SIGNER_LABEL = 'evidence-agent';

/** Seconds a quote stands. Short: the price is fixed, the chain context is not. */
const QUOTE_TTL_SECONDS = 15 * 60;

/**
 * The EOA that signs, which is what must be registered as the agent wallet.
 *
 * Not `createWallet`. That returns the upgraded smart-account address the
 * demo seller holds funds in, and a signature made with this key recovers
 * to the key's own EOA — registering the smart account would give an
 * agent whose every quote recovers to the "wrong" wallet and fails
 * verification on this marketplace and the others that check the same
 * way. The address below is the one the verifier actually sees; it was
 * confirmed by putting a live quote through `verifyNegotiationSignature`.
 */
export function evidenceAgentWallet(): Address {
  return adminSigner(SIGNER_LABEL).address;
}

export interface SignedQuote {
  request: { task_description: string };
  response: {
    accepted: true;
    terms: {
      price: string;
      currency: string;
      deliverables: string;
      quality_standards: string;
    };
  };
  negotiated_at: number;
  quote_expires_at: number;
  chain_id: number;
  verifying_contract: string;
  negotiation_hash: string;
  provider_sig: string;
}

/**
 * The content the hash covers, in the shape `negotiationContent` rebuilds.
 *
 * Field order does not matter — `canonicalJson` sorts — but presence and
 * type do. `price` is raw on-chain units as a decimal string, because the
 * parser rejects anything that is not `/^\d+$/` and then divides by 1e18.
 */
function hashableContent(
  task: string,
  terms: SignedQuote['response']['terms'],
  negotiatedAt: number,
  expiresAt: number,
  chainId: number,
  verifyingContract: string,
) {
  return {
    version: 1,
    negotiated_at: negotiatedAt,
    task,
    terms: {
      deliverables: terms.deliverables,
      quality_standards: terms.quality_standards,
    },
    price: terms.price,
    currency: terms.currency,
    quote_expires_at: expiresAt,
    chain_id: chainId,
    verifying_contract: verifyingContract,
  };
}

export async function signEvidenceQuote(input: {
  chainId: ChainId;
  taskDescription: string;
  deliverables?: string;
  qualityStandards?: string;
  /**
   * The token to price in, when not the escrow default. Must be a token
   * Pokter offers on this chain (`hireTokenAt`): USDT only while USDT
   * hiring is on. See `evidenceQuoteToken` for when one is asked for.
   */
  currency?: string;
}): Promise<SignedQuote> {
  const addresses = correctedErc8183Addresses(input.chainId);
  const priced = input.currency ? hireTokenAt(input.chainId, input.currency) : null;
  if (input.currency && !priced) throw new Error(`Evidence quotes are not priced in ${input.currency} on chain ${input.chainId}.`);
  const currency = priced?.address ?? (addresses.paymentToken as string);
  const decimals = priced?.decimals ?? requireDecimals(input.chainId, addresses.paymentToken);
  const negotiatedAt = Math.floor(Date.now() / 1000);
  const expiresAt = negotiatedAt + QUOTE_TTL_SECONDS;

  /*
   * The buyer's own words for the deliverable, echoed back. The hash
   * covers them, so a quote obtained for one brief cannot govern a job
   * funded with another — which is the property the enquiry is relying
   * on when it sends its terms along with the task.
   */
  const terms = {
    price: parseUnits(String(EVIDENCE_AGENT.priceU), decimals).toString(),
    currency,
    deliverables:
      input.deliverables ??
      "Pokter's measured record for the named ERC-8004 agent, with the provenance of each field.",
    quality_standards:
      input.qualityStandards ??
      'Measurements only. Availability and quote settleability, never a claim that the work is correct.',
  };

  const content = hashableContent(
    input.taskDescription,
    terms,
    negotiatedAt,
    expiresAt,
    input.chainId,
    addresses.commerce as string,
  );
  const negotiationHash = keccak256(toBytes(canonicalJson(content)));

  /*
   * EIP-191 over the 32 raw bytes, built by hand because the SDK's signer
   * exposes `signDigest` and nothing else — it signs a digest, so the
   * personal-sign prefix has to be applied before it rather than by it.
   * `hashMessage({ raw })` is exactly what `recoverMessageAddress` inverts
   * on the other side, which is the first of the two encodings the
   * verifier accepts.
   */
  const signature = await adminSigner(SIGNER_LABEL).signDigest(
    hashMessage({ raw: negotiationHash }),
  );

  return {
    request: { task_description: input.taskDescription },
    response: { accepted: true, terms },
    negotiated_at: negotiatedAt,
    quote_expires_at: expiresAt,
    chain_id: input.chainId,
    verifying_contract: addresses.commerce as string,
    negotiation_hash: negotiationHash,
    provider_sig: signature,
  };
}

