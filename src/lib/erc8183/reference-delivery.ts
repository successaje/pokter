import { getAddress, keccak256, toBytes, type Address } from 'viem';

import { canonicalJson, quoteUsableForEscrow, verifyNegotiationSignature } from '@/lib/erc8183/negotiation';
import { decodeReferenceJobDescription } from '@/lib/erc8183/job-envelope';

/**
 * Whether a reference-format job may be delivered, and by which agent.
 *
 * Pokter writes a job description two ways, both deliberate: its own envelope,
 * which names the agent, and the seller's signed quote alone, which does not.
 * `jobTaskFromDescription` has always read both. The delivery path read only
 * the first, so every reference-format job failed with "The job carries no
 * Pokter envelope naming an agent to ask" — 44 consecutive failures, and three
 * testnet jobs expired FUNDED with nothing ever submitted.
 *
 * The envelope path is untouched. This governs the second format only, and it
 * is stricter than the first rather than looser: an envelope asserts its
 * agent, while a reference quote has to have one established, so everything
 * here is about establishing it without inventing it.
 *
 * ## Expiry, which is two deadlines and not one
 *
 * Settled from the contract rather than chosen. `AgenticCommerceUpgradeable`
 * reverts `submit` when `block.timestamp >= job.expiredAt`, and reverts
 * `claimRefund` until the same moment: the job's own `expiredAt` is the
 * completion deadline and the contract enforces it. The contract has no
 * concept of a quote, a quote expiry or a signature, and its `setBudget`
 * note puts the quote's job before the work — "the provider verifies the
 * funded budget against its signed quote before doing any work".
 *
 * So `quote_expires_at` is the **acceptance** window: it governs whether the
 * seller's price was still on offer when the buyer funded. It is checked
 * against the funding block's timestamp, which is the only authoritative
 * record of when that happened — an indexed `hiredAt` is Pokter's own clock
 * and can differ. A quote that has lapsed since does not withdraw a job the
 * buyer validly funded, and refusing delivery on that ground would strand
 * every job older than its quote window with the money still in escrow.
 */
export type ReferenceDeliveryVerdict =
  | {
      ok: true;
      /** Established from Pokter's index and confirmed against the registry. */
      identity: { chainId: number; tokenId: string; name?: string };
      /** Classified from the registry record, never from the description. Empty means no skill preference. */
      category: string;
      task: string;
    }
  | { ok: false; code: ReferenceRefusal; reason: string };

export type ReferenceRefusal =
  | 'not-reference-format'
  | 'hash-mismatch'
  | 'signature'
  | 'wrong-chain'
  | 'wrong-contract'
  | 'currency-mismatch'
  | 'budget-mismatch'
  | 'funding-time-unknown'
  | 'quote-not-valid-at-funding'
  | 'attribution-missing'
  | 'attribution-conflict'
  | 'job-not-deliverable';

export interface ReferenceDeliveryInput {
  /** The job's on-chain description, verbatim. */
  description: string;
  /** Read live from the kernel, never from the index. */
  job: { provider: Address; budget: bigint; expiredAt: bigint; statusName: string };
  escrow: { chainId: number; commerce: string; paymentToken: string };
  /** The funding transaction's block timestamp, in ms. Null when unreadable. */
  fundedAtMs: number | null;
  /** Pokter's own attribution for this job. The documented source of identity here. */
  indexed: { agentChainId: number | null; agentTokenId: string | null; agentName?: string | null } | null;
  /** The ERC-8004 record for that identity, for confirmation and category. */
  registryAgent: { wallet: string | null; category: string | null } | null;
  nowMs: number;
}

const refuse = (code: ReferenceRefusal, reason: string): ReferenceDeliveryVerdict => ({ ok: false, code, reason });

export async function verifyReferenceDelivery(input: ReferenceDeliveryInput): Promise<ReferenceDeliveryVerdict> {
  const reference = decodeReferenceJobDescription(input.description);
  if (!reference) return refuse('not-reference-format', 'The description is not a reference-format quote.');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(input.description) as Record<string, unknown>;
  } catch {
    return refuse('not-reference-format', 'The description is not readable JSON.');
  }

  /*
   * The hash must cover this task and these terms.
   *
   * A signature over `negotiation_hash` proves who signed a hash, not what
   * the hash covers, and a hash copied from another negotiation would recover
   * perfectly well. So it is re-derived from the description itself, less the
   * two fields that carry the claim, using the same canonical JSON the
   * reference SDK hashes.
   */
  const { negotiation_hash: claimedHash, provider_sig: providerSig, ...content } = parsed;
  let derived: string;
  try {
    derived = keccak256(toBytes(canonicalJson(content)));
  } catch {
    return refuse('hash-mismatch', 'The quote content cannot be canonicalised, so its hash cannot be checked.');
  }
  if (typeof claimedHash !== 'string' || derived.toLowerCase() !== claimedHash.toLowerCase()) {
    return refuse('hash-mismatch', 'The negotiation hash does not cover this task and these terms.');
  }

  /* And the signature must be the live provider's, over that hash. */
  try {
    await verifyNegotiationSignature({
      negotiationHash: String(claimedHash),
      providerSignature: String(providerSig),
      expectedProvider: input.job.provider,
    });
  } catch (error) {
    return refuse('signature', (error as Error).message);
  }

  /* The quote has to bind to this escrow, this money and this amount. */
  const domain = reference.quote.domain;
  if (domain && domain.chainId !== input.escrow.chainId) {
    return refuse('wrong-chain', `The quote is signed for chain ${domain.chainId}, and this job is on ${input.escrow.chainId}.`);
  }
  if (domain && !sameAddress(domain.verifyingContract, input.escrow.commerce)) {
    return refuse('wrong-contract', `The quote names escrow ${domain.verifyingContract}, not this one.`);
  }
  const currency = typeof parsed.currency === 'string' ? parsed.currency : null;
  if (!currency || !sameAddress(currency, input.escrow.paymentToken)) {
    return refuse('currency-mismatch', 'The quote is priced in a token this escrow does not settle.');
  }
  if (reference.quote.priceRaw === undefined || BigInt(reference.quote.priceRaw) !== input.job.budget) {
    return refuse('budget-mismatch', `The quote is for ${reference.quote.priceRaw ?? 'no stated price'} and the job is funded with ${input.job.budget}.`);
  }

  /*
   * Acceptance is judged at the funding block, not now. Without that
   * timestamp there is no way to know the quote was live when the buyer
   * funded, and guessing is worse than declining.
   */
  if (input.fundedAtMs === null) {
    return refuse('funding-time-unknown', 'The funding transaction could not be read, so the quote cannot be shown to have been live when the job was funded.');
  }
  const atFunding = quoteUsableForEscrow(
    { expiresAt: reference.quote.expiresAt, domain },
    input.escrow.chainId,
    new Date(input.fundedAtMs),
    input.escrow.commerce,
  );
  if (!atFunding.usable) {
    return refuse('quote-not-valid-at-funding', `At funding time the quote was not usable: ${atFunding.reason}`);
  }

  /*
   * Identity comes from Pokter's index, which `job-envelope` names as the
   * source for this format, and is then confirmed against the registry. Both
   * are required: the index says which agent, and the registry's wallet
   * matching the live provider is what makes that claim checkable. A missing
   * or disagreeing attribution is refused rather than resolved.
   */
  const chainId = input.indexed?.agentChainId ?? null;
  const tokenId = input.indexed?.agentTokenId ?? null;
  if (chainId === null || tokenId === null || tokenId === '') {
    return refuse('attribution-missing', 'Pokter has no recorded agent for this job, and a reference quote names none.');
  }
  const wallet = input.registryAgent?.wallet ?? null;
  if (!wallet) {
    return refuse('attribution-conflict', `The registry has no wallet for agent ${chainId}/${tokenId}.`);
  }
  if (!sameAddress(wallet, input.job.provider)) {
    return refuse('attribution-conflict', `Agent ${chainId}/${tokenId} has wallet ${wallet}, and this job's provider is ${input.job.provider}.`);
  }

  /*
   * The category is a preference, not a credential.
   *
   * `pickWorkSkill(skills, category?)` uses it to choose among an agent's
   * work skills and falls back to the first when it is absent — it takes the
   * argument as optional, and the envelope path has always passed
   * 'Uncategorised' when a hire did not supply one, which is not a key in
   * `CATEGORY_WORDS` and therefore already means "no preference". An agent
   * with no askable skill fails later in `prepareAgent`, which is the right
   * place and says so plainly.
   *
   * An earlier version of this refused when classification produced nothing,
   * and that was wrong twice over: stricter than the mechanism needs, and
   * stricter than the envelope path for the same operation. It refused job
   * 1585 — which passes every check above — because `classify` could not
   * place "Pokter Evidence" among the five categories.
   *
   * What matters is kept: the category never comes from the description.
   * Only the registry record is consulted, so nobody who writes a
   * description can choose which skill receives the brief. Empty means no
   * preference, exactly as `pickWorkSkill` reads it.
   */
  const category = input.registryAgent?.category?.trim() ?? '';

  /* Live state last, from the kernel: the contract will refuse anything else. */
  if (input.job.statusName !== 'FUNDED') {
    return refuse('job-not-deliverable', `The job is ${input.job.statusName.toLowerCase()}, not funded.`);
  }
  if (input.nowMs >= Number(input.job.expiredAt) * 1000) {
    return refuse('job-not-deliverable', 'The job has reached its completion deadline; the escrow is the buyer\'s to reclaim.');
  }

  return {
    ok: true,
    identity: { chainId, tokenId, name: input.indexed?.agentName ?? undefined },
    category,
    task: reference.task,
  };
}

function sameAddress(a: string, b: string): boolean {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}
