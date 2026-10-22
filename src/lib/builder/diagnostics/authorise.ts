import { getAddress } from 'viem';

/**
 * Who may read an agent's diagnostics, decided in one place.
 *
 * Diagnostics are the agent's private side: which buyers stopped, what
 * their agent said when it refused, how many funded jobs it let lapse. A
 * rival builder reading that for somebody else's agent learns their
 * conversion problems, so ownership is not a filter applied to a list —
 * it is a gate in front of reading anything at all.
 *
 * Ownership is the ERC-8004 registration owner, read from the registry
 * contract and not from the indexer, the same way `/api/builders/deliveries`
 * decides who may deliver. The indexer can be behind by minutes, and an
 * agent sold this morning must stop answering to its old owner's session
 * at once rather than when a crawl catches up.
 *
 * Three refusals, kept apart on purpose:
 *
 *  - **401**, no proved session. Nothing has been checked.
 *  - **503**, the registry did not answer. "Could not check" is reported as
 *    that and never as "not yours" — the same rule `ownedJob` follows, and
 *    for the same reason: telling a builder their own agent is not theirs
 *    because an RPC timed out sends them looking for a theft.
 *  - **403**, the session's wallet is not the owner.
 *
 * Fail closed in every direction: anything that is not a readable match
 * refuses.
 */

/**
 * The mark `authoriseAgentOwner` puts on a decision it granted, and the
 * only thing the report builder will accept.
 *
 * `Symbol.for`, not `Symbol`. A module-private symbol would be a stronger
 * capability on paper and a worse one in practice: a bundler, a server/client
 * boundary or a test runner can hold two instances of this file — tsx does,
 * resolving `./authorise` from the report and `../src/.../authorise` from a
 * test to separate copies — and a per-copy symbol makes the gate's answer
 * depend on which copy minted the proof. A check that passes in production
 * and fails under test is bad; the reverse is dangerous, and there is no way
 * to tell which way round it will land.
 *
 * The registry key keeps the property that matters. Nothing reaches the
 * report by forgetting the gate: a caller would have to write this exact
 * string out, which is a decision somebody made rather than a step somebody
 * missed.
 */
const PROVEN: unique symbol = Symbol.for('pokter.builder-diagnostics.ownership-proven') as never;

export interface AgentOwnershipProof {
  readonly [PROVEN]: true;
  readonly owner: `0x${string}`;
  readonly chainId: number;
  readonly tokenId: string;
}

export type OwnershipRefusalReason = 'no-session' | 'registry-unavailable' | 'not-owner';

export interface OwnershipRefusal {
  ok: false;
  status: 401 | 403 | 503;
  reason: OwnershipRefusalReason;
  /** Shown to the caller. Never names the real owner: that is not theirs to learn. */
  message: string;
}

export type OwnershipDecision = { ok: true; proof: AgentOwnershipProof } | OwnershipRefusal;

function normalised(address: string | null | undefined): `0x${string}` | null {
  if (!address) return null;
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

export function authoriseAgentOwner(input: {
  /** The wallet whose ownership this session proved, from the signed-challenge cookie. */
  sessionOwner: string | null | undefined;
  /** `registryOwner()`'s answer: an address, or null when the read failed. */
  registryOwner: string | null | undefined;
  chainId: number;
  tokenId: string;
}): OwnershipDecision {
  const session = normalised(input.sessionOwner);
  if (!session) {
    return {
      ok: false,
      status: 401,
      reason: 'no-session',
      message: 'Verify the wallet that owns this agent to see its diagnostics.',
    };
  }

  const registry = normalised(input.registryOwner);
  if (!registry) {
    return {
      ok: false,
      status: 503,
      reason: 'registry-unavailable',
      message:
        'Pokter could not read the registry just now, so it cannot confirm who owns this agent. Nothing about the agent has changed; try again shortly.',
    };
  }

  if (registry !== session) {
    return {
      ok: false,
      status: 403,
      reason: 'not-owner',
      message: 'This agent is not registered to the wallet you verified.',
    };
  }

  return {
    ok: true,
    proof: { [PROVEN]: true, owner: registry, chainId: input.chainId, tokenId: input.tokenId },
  };
}

/**
 * Whether a value is a proof this module minted.
 *
 * The report builder asks before it reads a single row. A caller that
 * forgets the gate, or hands along something that merely looks like a
 * proof, gets an exception instead of somebody else's private diagnostics —
 * so the gate cannot be skipped by a new call site that did not know about
 * it, only by editing this file.
 */
export function isOwnershipProof(value: unknown): value is AgentOwnershipProof {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[PROVEN] === true &&
    typeof (value as AgentOwnershipProof).owner === 'string' &&
    typeof (value as AgentOwnershipProof).tokenId === 'string'
  );
}

export class OwnershipNotProvenError extends Error {
  constructor() {
    super('Builder diagnostics were assembled without a proved ownership check.');
    this.name = 'OwnershipNotProvenError';
  }
}

/** The proof, or an exception. Never a default. */
export function requireOwnershipProof(value: unknown): AgentOwnershipProof {
  if (!isOwnershipProof(value)) throw new OwnershipNotProvenError();
  return value;
}
