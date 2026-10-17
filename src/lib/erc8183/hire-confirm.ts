/**
 * Whether the job at a predicted id is the one this hire created.
 *
 * A hire predicts its job id as jobCounter + 1 before sending, because the
 * batch needs the id to register and fund it. The prediction was recorded
 * without looking: on 16 October a fixture hire for one agent reported
 * success, created nothing, and was recorded as job 1522, which the next
 * hire then created for a different agent. Pokter told the first agent
 * about a job that was not its own, and would have graded the second
 * agent's delivery as the first agent's answer.
 *
 * The job at the id must name this hire's client and provider and carry
 * its description, or it is not this hire's job.
 */
export function isThisHire(
  onchain: { client: string; provider: string; description?: string | null },
  expected: { client: string; provider: string; description: string },
): boolean {
  return (
    onchain.client.toLowerCase() === expected.client.toLowerCase() &&
    onchain.provider.toLowerCase() === expected.provider.toLowerCase() &&
    (onchain.description ?? '') === expected.description
  );
}
