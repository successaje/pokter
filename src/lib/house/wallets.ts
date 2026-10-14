/**
 * The wallets Pokter's house agents sign, deliver and are paid from.
 *
 * Public on purpose: each owns its agent's registry entry, so anyone can
 * check which agents are Pokter's. Kept apart from the team wallets, which
 * mark Pokter as a buyer or an operator delivering on an agent's behalf; a
 * house agent delivering its own job is the agent's work and is credited
 * as such.
 */
export const HOUSE_AGENT_WALLETS: Readonly<Record<string, `0x${string}`>> = {
  brinkwatch: '0xB72335e083A7eed9731D24C48dbf07c4Ef1f051a',
  cresthold: '0xf22217AaaC007Bf8d076cd3f0819E53e2bAF8bFF',
  centreline: '0x459C19060418e5FA1Afe3Ca093a644d8d72acD33',
  gridloom: '0x8272Ac23f4c14F578b0dd06E6754B0bc84D99c49',
  touchstone: '0x071044a5A92F6C90cf9D08D5059921da734D19e7',
};

const LOWER = new Set(Object.values(HOUSE_AGENT_WALLETS).map((address) => address.toLowerCase()));

/** Whether an agent is run by Pokter: owned by, or paying out to, a house wallet. */
export function isHouseAgent(agent: { owner_address?: string | null; agent_wallet?: string | null }): boolean {
  return [agent.owner_address, agent.agent_wallet].some((address) => typeof address === 'string' && LOWER.has(address.toLowerCase()));
}
