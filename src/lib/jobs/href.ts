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
