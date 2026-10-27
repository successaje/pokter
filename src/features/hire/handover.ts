/**
 * A hire page's networks, with a way to every other enabled network where
 * the same agent has its own registration.
 *
 * Choosing Testnet on Brinkwatch's mainnet page went to its testnet
 * registration (97:2618), whose page offered testnet alone: the switch
 * vanished and there was no way back to BNB Chain. A network a registration
 * cannot be hired on, where its twin can be, is offered as a switch that
 * hands over to the twin. It is never rendered as a form; choosing it
 * navigates (`HireNetworks`). BNB Chain first, as everywhere the two are offered.
 */
export function withHandovers<N extends { chainId: number; handoff?: { chainId: number; tokenId: string } }>(
  networks: readonly N[],
  twins: ReadonlyArray<{ on: number; twin: { chainId: number; tokenId: string } | null }>,
): N[] {
  if (networks.length === 0) return [];
  const offered = new Set(networks.map((n) => n.chainId));
  const handovers = twins.flatMap(({ on, twin }) => (twin && !offered.has(on) ? [{ ...networks[0], chainId: on, handoff: twin }] : []));
  return [...networks, ...handovers].sort((a, b) => Number(a.chainId !== 56) - Number(b.chainId !== 56));
}
