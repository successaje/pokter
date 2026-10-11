/**
 * Who runs an agent, as far as the chain can tell.
 *
 * One owner wallet per operator is easy to dodge: register each agent from
 * a fresh wallet. Wallets that were first funded from the same address are
 * treated as one operator instead, which is the same signal Set and Earn
 * uses to call hirers linked.
 *
 * Except when that address funds wallets for everybody. A faucet, an
 * exchange hot wallet or a bridge is the first funder of thousands of
 * unrelated wallets, and grouping by it would merge strangers. So a funder
 * identifies an operator only while it funded no more than `maxFanOut` of
 * the owners being ranked; above that it is treated as public, and those
 * owners stand alone.
 */
export const DEFAULT_MAX_FAN_OUT = 10;

export function operatorResolver(
  owners: string[],
  funders: ReadonlyMap<string, string | null>,
  { maxFanOut = DEFAULT_MAX_FAN_OUT }: { maxFanOut?: number } = {},
): (owner: string) => string {
  const fanOut = new Map<string, Set<string>>();
  for (const raw of owners) {
    const owner = raw.toLowerCase();
    const funder = funders.get(owner);
    if (!funder) continue;
    const funded = fanOut.get(funder) ?? new Set<string>();
    funded.add(owner);
    fanOut.set(funder, funded);
  }
  return (raw) => {
    const owner = raw.toLowerCase();
    const funder = funders.get(owner);
    if (funder && (fanOut.get(funder)?.size ?? 0) <= maxFanOut) return `funder:${funder}`;
    return `owner:${owner}`;
  };
}
