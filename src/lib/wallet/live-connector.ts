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
