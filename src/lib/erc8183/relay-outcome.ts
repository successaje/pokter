/** The courier's words when an agent answers a carried brief with a price (courier.ts). */
export function isPaidOnlyReason(reason: string | null | undefined): boolean {
  return Boolean(reason && /only when paid through escrow/i.test(reason));
}

/**
 * How relayed jobs to one agent last ended: refused when its newest
 * telling job was answered with "paid only", delivered when the agent did
 * the work, unknown when nothing has said either.
 */
export function latestRelayOutcome(
  jobs: Array<{ hiredAt: string; status: string; notice: { status: string; reason: string | null } | null }>,
): 'refused' | 'delivered' | 'unknown' {
  const telling = jobs
    .map((job) => ({
      at: Date.parse(job.hiredAt),
      outcome:
        job.status === 'SUBMITTED' || job.status === 'COMPLETED' || job.status === 'REJECTED'
          ? ('delivered' as const)
          : job.notice?.status === 'unreachable' && isPaidOnlyReason(job.notice.reason)
            ? ('refused' as const)
            : null,
    }))
    .filter((job): job is { at: number; outcome: 'refused' | 'delivered' } => job.outcome !== null && Number.isFinite(job.at))
    .sort((a, b) => b.at - a.at);
  return telling[0]?.outcome ?? 'unknown';
}
