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

/** One piece of evidence about whether Pokter's relay can carry a brief to an agent. */
export interface RelayEvidence {
  atMs: number;
  verdict: 'ok' | 'refused';
  note: string;
  /** How long this piece is trusted, when not the default for its verdict (an unanswered test is retried within hours). */
  validMs?: number;
}

/** How long each verdict is trusted before the agent is asked again. Refusals are re-checked sooner: builders do switch on direct briefs. */
export const RELAY_OK_FOR_MS = 14 * 86_400_000;
export const RELAY_REFUSED_FOR_MS = 7 * 86_400_000;

/**
 * Whether the testnet relay can be offered for an agent.
 *
 * ok: the newest evidence is that it answers a carried brief (a delivered
 * relayed job, a free check it answered, or Pokter's relay test).
 * refused: the newest says it does not (a price instead of work, no
 * endpoint or work skill, or no answer at all).
 * unknown: nothing recent either way. Not offered either: a buyer should
 * never be the one to find out, with a funded job that sits until it
 * expires.
 */
export function relayStatusFrom(evidence: readonly RelayEvidence[], nowMs: number): { status: 'ok' | 'refused' | 'unknown'; note: string | null } {
  const fresh = evidence
    .filter((e) => Number.isFinite(e.atMs) && nowMs - e.atMs <= (e.validMs ?? (e.verdict === 'ok' ? RELAY_OK_FOR_MS : RELAY_REFUSED_FOR_MS)))
    .sort((a, b) => b.atMs - a.atMs);
  const newest = fresh[0];
  return newest ? { status: newest.verdict, note: newest.note } : { status: 'unknown', note: null };
}

/** Relayed jobs as evidence: a delivery is ok, a paid-only notice is refused, anything else says nothing. */
export function relayJobEvidence(jobs: Array<{ hiredAt: string; status: string; notice: { status: string; reason: string | null; lastAt?: string } | null }>): RelayEvidence[] {
  return jobs.flatMap((job): RelayEvidence[] => {
    const at = Date.parse(job.notice?.lastAt ?? job.hiredAt);
    if (job.status === 'SUBMITTED' || job.status === 'COMPLETED' || job.status === 'REJECTED') return [{ atMs: Date.parse(job.hiredAt), verdict: 'ok', note: 'It delivered a job Pokter’s relay carried to it.' }];
    if (job.notice?.status === 'unreachable' && isPaidOnlyReason(job.notice.reason)) return [{ atMs: at, verdict: 'refused', note: 'Asked directly, it replied with a price: it works only when paid through its own escrow.' }];
    return [];
  });
}
