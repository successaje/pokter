/**
 * Where a job lives, now that a job id alone does not say.
 *
 * Hires are funded per agent on the escrow that can pay its price, so the
 * same number can be a job on mainnet and a different one on testnet. Links
 * carry the chain; a link without one is from before this and means the
 * site's default network, which is the only place such jobs were funded.
 */
export type JobChainId = 56 | 97;

export function jobHref(job: { jobId: string; chainId: number }): string {
  return `/workspace/jobs/${job.jobId}?chain=${job.chainId}`;
}

/** The chain named in a job link or request, or null when none or not one Pokter uses. */
export function jobChainParam(raw: string | null | undefined): JobChainId | null {
  const chainId = Number(raw);
  return chainId === 56 || chainId === 97 ? chainId : null;
}

/** The other chain Pokter funds on, for a "did you mean" lookup. */
export function otherJobChain(chainId: JobChainId): JobChainId {
  return chainId === 56 ? 97 : 56;
}

/**
 * What to say when a job id reads back empty.
 *
 * `?chain=` defaults to the site's network, so a mainnet job id asked for
 * without one came back "No job 56997 exists on this contract. Check the
 * number." The number was right and the chain was wrong, and the caller
 * was sent to re-read a correct id. The same one-chain assumption has cost
 * Pokter twice before, so when the id does exist on the other escrow, say
 * which one and how to ask for it.
 */
export function missingJobMessage(
  jobId: string,
  searched: JobChainId,
  foundOn: JobChainId | null,
): string {
  const name = (c: JobChainId) => (c === 56 ? 'BNB Chain' : 'BNB Testnet');
  if (foundOn !== null && foundOn !== searched) {
    return `Job ${jobId} is on ${name(foundOn)}, not ${name(searched)}. Ask for it with ?chain=${foundOn}.`;
  }
  return `No job ${jobId} exists on ${name(searched)} (chain ${searched}). Pokter funds on BNB Chain (56) and BNB Testnet (97); pass ?chain= to pick one, or check the number.`;
}
