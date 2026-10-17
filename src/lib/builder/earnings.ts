/**
 * What a builder was paid, kept apart by escrow network.
 *
 * Studio added every completed job's budget into one "Earned" figure, so
 * test-token payments on BNB Testnet were shown as money released on BNB
 * Chain. Real earnings come only from chain 56; anything else is practice
 * and is reported separately, never summed in.
 */
export function earnedByNetwork(jobs: ReadonlyArray<{ chainId: number; status: string; budgetRaw: string }>): { real: bigint; test: bigint } {
  let real = 0n;
  let test = 0n;
  for (const job of jobs) {
    if (job.status !== 'COMPLETED') continue;
    const amount = BigInt(job.budgetRaw);
    if (job.chainId === 56) real += amount;
    else test += amount;
  }
  return { real, test };
}
