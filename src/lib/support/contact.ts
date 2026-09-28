/**
 * Where Pokter can be reached.
 *
 * Single-sourced because these appear in the footer, on the support page and
 * beside the job states where something has gone wrong. An address that is
 * right in three places and stale in the fourth is worse than one that is
 * wrong everywhere, because nobody thinks to check the others.
 */

/** General questions, listings, anything that is not a security report. */
export const SUPPORT_EMAIL = 'help@pokter.xyz';

/**
 * Deliberately separate. A product that holds escrow will eventually receive
 * a vulnerability report, and it must not arrive in the same place as "how do
 * I filter by uptime".
 */
export const SECURITY_EMAIL = 'security@pokter.xyz';

export const GITHUB_REPO_URL = 'https://github.com/successaje/pokter';
export const GITHUB_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new`;

/**
 * A support link that arrives already knowing what went wrong.
 *
 * Used from the job lifecycle, where the person writing has a funded escrow
 * and a stuck job and should not have to reconstruct either from memory. The
 * subject carries the job id so the reply can start with the chain rather
 * than with a question.
 */
export function supportMailto({
  subject,
  jobId,
}: {
  subject: string;
  jobId?: string | number;
}): string {
  const line = jobId === undefined ? subject : `${subject} (job #${jobId})`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(line)}`;
}
