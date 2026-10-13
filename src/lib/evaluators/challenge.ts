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
    '--samples 40',
    '--interval-ms 2160000',
    `--vantage ${shellQuote('Describe your region and network')}`,
  ].join(' \\\n  ');
}
