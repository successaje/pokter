/**
 * The ERC-8004 registration a hire request names, when it names a real one.
 *
 * `/api/hire` validated this pair to decide whether to write a `pokter-job`
 * envelope, and then did not pass the chain on to `hireAgent` — so every
 * route hire stored a NULL registry chain, and the brief preflight, which
 * needs the registration to read the agent's skills, could not run on the
 * path that funded job 1585. Read once, here, so the identity the envelope
 * records and the identity the preflight checks are the same identity.
 *
 * Null for the unregistered reference seller, hired with a non-numeric token
 * id: there is no registration to read, and the raw description it accepts
 * is the one case the envelope is not written for.
 */
export function registryIdentityFrom(input: {
  agentTokenId?: unknown;
  identityChainId?: unknown;
}): { identityChainId: number; agentTokenId: string } | null {
  const agentTokenId = String(input.agentTokenId ?? '');
  const identityChainId = Number(input.identityChainId ?? 0);
  return /^\d+$/.test(agentTokenId) && Number.isSafeInteger(identityChainId) && identityChainId > 0
    ? { identityChainId, agentTokenId }
    : null;
}
