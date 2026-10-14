export interface EvaluationQueueFacts {
  key: string;
  chainId: number;
  tokenId: string;
  owner: string;
  promotable: boolean;
  hasProtocol: boolean;
  requiresAuth: boolean;
  quotePayable: boolean;
  probes: number;
  answered: number;
  delivered: number;
  outsideTeamCompleted: number;
  outsideTeamBuyers: number;
}

function readinessScore(candidate: EvaluationQueueFacts): number {
  const rate = candidate.probes > 0 ? candidate.answered / candidate.probes : 0;
  return (
    candidate.outsideTeamCompleted * 1_000_000 +
    candidate.outsideTeamBuyers * 100_000 +
    candidate.delivered * 10_000 +
    Number(candidate.quotePayable) * 1_000 +
    Math.round(rate * 100) * 10 +
    Math.min(candidate.probes, 100)
  );
}

/**
 * Shortlist agents worth spending an independent evaluator's time on.
 * Mainnet, reachable, public and real; then one listing per observable operator.
 */
export function selectEvaluationQueue(
  candidates: readonly EvaluationQueueFacts[],
  operatorOf: (owner: string) => string,
  limit = 16,
): EvaluationQueueFacts[] {
  const operators = new Set<string>();
  return candidates
    .filter((candidate) =>
      candidate.chainId === 56 &&
      candidate.promotable &&
      candidate.hasProtocol &&
      !candidate.requiresAuth &&
      candidate.probes > 0 &&
      candidate.answered > 0,
    )
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => readinessScore(b.candidate) - readinessScore(a.candidate) || a.index - b.index)
    .map(({ candidate }) => candidate)
    .filter((candidate) => {
      const operator = operatorOf(candidate.owner);
      if (operators.has(operator)) return false;
      operators.add(operator);
      return true;
    })
    .slice(0, limit);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * The challenge's measurement schedule: about a day of samples. The page's
 * description is generated from these, so the command and the sentence
 * under it cannot disagree again (they said "one hour apart" for 36 minutes).
 */
export const CHALLENGE_SAMPLES = 40;
export const CHALLENGE_INTERVAL_MS = 2_160_000;

/** "40 samples 36 minutes apart, over about 24 hours". */
export function challengeScheduleText(samples = CHALLENGE_SAMPLES, intervalMs = CHALLENGE_INTERVAL_MS): string {
  const minutes = Math.round(intervalMs / 60_000);
  const hours = Math.round(((samples - 1) * intervalMs) / 3_600_000);
  return `${samples} samples ${minutes} minutes apart, over about ${hours} hours`;
}

export function evaluatorStarterCommand(input: {
  chainId: number;
  tokenId: string;
  endpoint: string;
  protocol: 'a2a' | 'mcp';
}): string {
  return [
    'node pokter-evaluator-starter.mjs',
    `--chain ${input.chainId}`,
    `--agent ${input.tokenId}`,
    `--endpoint ${shellQuote(input.endpoint)}`,
    `--protocol ${input.protocol}`,
    `--samples ${CHALLENGE_SAMPLES}`,
    `--interval-ms ${CHALLENGE_INTERVAL_MS}`,
    `--vantage ${shellQuote('Describe your region and network')}`,
  ].join(' \\\n  ');
}
