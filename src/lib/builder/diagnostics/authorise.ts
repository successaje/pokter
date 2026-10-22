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
 *  - **404**, the registry answered and holds no such identity. Separated
 *    from the 503 because they were one refusal and said the 503's words:
 *    a builder who mistyped a registry number was told the lookup had
 *    failed and to try again shortly, which is advice to retry forever.
 *    The caller has to show the chain was reachable for this one, so the
 *    default where nothing is known stays 503.
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
 * What this buys is therefore a **tripwire, not a capability**, and the
 * difference matters enough to say plainly: `Symbol.for` reads from a
 * registry any code in the process can reach, so anything that wants to
 * forge a proof can, in one line. It is not a security boundary and must
 * never be argued as one.
 *
 * What it does catch is the realistic failure — a new call site that
 * assembles a report without going through the gate, because its author
 * did not know the gate existed. That is a step somebody missed; writing
 * this exact string out is a decision somebody made. The boundary itself
 * is the route: session cookie, then the registry read, then this
 * decision, before anything is read. The tests pin that ordering as source
 * facts, and that is what the security rests on.
 */
const PROVEN: unique symbol = Symbol.for('pokter.builder-diagnostics.ownership-proven') as never;

export interface AgentOwnershipProof {
  readonly [PROVEN]: true;
  readonly owner: `0x${string}`;
  readonly chainId: number;
  readonly tokenId: string;
}

export type OwnershipRefusalReason = 'no-session' | 'registry-unavailable' | 'no-such-agent' | 'not-owner';

export interface OwnershipRefusal {
  ok: false;
  status: 401 | 403 | 404 | 503;
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
  /**
   * Whether the registry itself answered, when `registryOwner` is null.
   *
   * Only `true` tells the two nulls apart — a chain that answered and holds
   * no such identity, from one that could not be reached. Left out, it is
   * `false`, so an unproven claim refuses with the 503 that grants nothing.
   */
  registryReachable?: boolean;
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
    /* The registry answered and holds nothing here: a number to correct,
       not an outage to wait out. Retrying will never change it. */
    if (input.registryReachable === true) {
      return {
        ok: false,
        status: 404,
        reason: 'no-such-agent',
        message: `The registry has no agent #${input.tokenId} on ${input.chainId === 56 ? 'BNB Chain' : 'BNB Testnet'}. Check the number, or the network.`,
      };
    }
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

  /*
   * Frozen, because `readonly` is a compile-time claim and this object is
   * the key rows are read by: `proof.tokenId = '999'` succeeded at runtime
   * and would have re-aimed a granted proof at another agent.
   */
  return {
    ok: true,
    proof: Object.freeze<AgentOwnershipProof>({ [PROVEN]: true, owner: registry, chainId: input.chainId, tokenId: input.tokenId }),
  };
}

/**
 * Whether a value is a proof this module minted.
 *
 * The report builder asks before it reads a single row, so a caller that
 * forgets the gate, or hands along something that merely looks like a
 * proof, gets an exception instead of somebody else's private diagnostics.
 *
 * This stops a mistake, not an attacker: the brand is `Symbol.for`, which
 * anything in the process can mint. See the note on `PROVEN`. The gate
 * that actually decides who reads what is in the route, ahead of every
 * read.
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
