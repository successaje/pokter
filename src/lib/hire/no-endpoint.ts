/**
 * Which read found nothing to call, for a `no-endpoint` result.
 *
 * `no-endpoint` arrives from four different reads, and they support four
 * different sentences. The page used to say "its agent card offers no HTTPS
 * JSON-RPC interface" for all of them, including an agent whose card Pokter
 * never read: the registry data Pokter reads (the indexer's copy of the
 * registration) named no A2A endpoint, so nothing was fetched at all, and
 * the agent's live registration declared one. Each detail here says what
 * was read, so the words claim no more than that.
 */
export const NO_ENDPOINT_DETAIL = {
  /** The registry data names no A2A endpoint. No card was read. */
  registryNoA2a: 'registry-no-a2a',
  /** The registry data names no agent wallet to check a signed price against. Nothing was asked. */
  registryNoWallet: 'registry-no-wallet',
  /** What was read at or under its endpoint names no A2A interface, or held no card. */
  cardWithoutInterface: 'card-without-interface',
  /** Its card was read and offers no HTTPS JSON-RPC interface. The text stored before this had a name, kept so stored failures still read right. */
  cardWithoutJsonRpc: 'no HTTPS JSON-RPC interface on its card',
} as const;
