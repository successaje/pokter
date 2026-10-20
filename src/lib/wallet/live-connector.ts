/**
 * The live connector instance for a connection, by uid, then by id.
 *
 * Until wagmi finishes reconnecting a session restored from storage, the
 * connection holds a plain stand-in for its connector with no methods,
 * while the wallet already reads as connected. Signing through that
 * stand-in fails ("connection.connector.getChainId is not a function");
 * signing through the instance in the config does not.
 */
export function liveConnector<C extends { uid: string; id: string }>(stored: { uid: string; id: string } | undefined, connectors: readonly C[]): C | undefined {
  if (!stored) return undefined;
  return connectors.find((c) => c.uid === stored.uid) ?? connectors.find((c) => c.id === stored.id);
}

type SwitchConfig = {
  state: { current: string | null; connections: Map<string, { connector: { uid: string; id: string; switchChain?: unknown } }> };
  connectors: readonly { uid: string; id: string; switchChain?: (args: { chainId: number }) => Promise<unknown> }[];
};

/**
 * Switch networks through the live connector when the connection still
 * holds the stand-in.
 *
 * wagmi's switchChain always uses the connector stored on the connection,
 * whatever connector it is passed, so during a reconnect it failed with
 * '"Injected" does not support programmatic chain switching'. Returns
 * false when the connection's own connector can switch, which wagmi then
 * does as usual; throws when no live connector is there to do it.
 */
export async function switchThroughLive(config: SwitchConfig, chainId: number): Promise<boolean> {
  const stored = config.state.current ? config.state.connections.get(config.state.current)?.connector : undefined;
  if (!stored || typeof stored.switchChain === 'function') return false;
  const live = liveConnector(stored, config.connectors);
  if (!live?.switchChain) throw new Error('Your wallet is still reconnecting. Try again in a moment.');
  await live.switchChain({ chainId });
  return true;
}
