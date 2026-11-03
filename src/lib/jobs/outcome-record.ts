import type { JobEvidence } from './evidence';

/** Public, portable evidence for a job. Private briefs and answers never enter this record. */
export function outcomeRecord(e: JobEvidence) {
  const checks = e.checks?.checks ?? [];
  const delivery = e.delivery.state;
  return {
    version: 1,
    job: { chainId: e.chainId, jobId: e.jobId, agent: e.agent, escrow: e.escrow },
    task: {
      brief: e.brief === null ? 'private' : 'public-on-job-page',
      terms: e.planProof?.binding.kind === 'signed-terms' ? 'signed-by-agent' : e.planProof ? 'recorded-by-pokter' : 'not-recorded',
    },
    delivery: {
      state: delivery,
      submittedAt: e.deliveredAt,
      commitment: e.chain?.deliverable ?? null,
      hashMatched: delivery === 'matches' ? true : delivery === 'mismatch' ? false : null,
      paidToCourier: e.paidToCourier,
    },
    answerChecks: {
      state: e.checks ? 'published-and-checked' : e.answerWithheld ? 'answer-private' : 'not-available',
      method: e.checks?.method ?? null,
      passed: checks.filter((check) => check.outcome === 'passed').length,
      failed: checks.filter((check) => check.outcome === 'failed').length,
      notVerified: checks.filter((check) => check.outcome === 'not-verified').length,
      agreedBeforeFunding: e.planProof?.binding.kind === 'signed-terms' && e.planProof.checkerMatched === true,
    },
    settlement: { status: e.status, source: e.statusSource, readAt: e.statusReadAt },
    observedOutcome: {
      state: 'not-measured' as const,
      reason: 'No post-delivery position, execution or return observation is linked to this job. A delivered plan and a settled escrow do not establish a financial outcome.',
    },
    source: `/jobs/${e.chainId}/${e.jobId}`,
  };
}
