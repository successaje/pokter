import assert from 'node:assert/strict';
import test from 'node:test';
import { connect, createConfig, getConnectorClient, http, mock, signMessage } from '@wagmi/core';
import { bscTestnet } from '@wagmi/core/chains';

import { liveConnector } from '../src/lib/wallet/live-connector';

/*
 * A wallet session restored from storage holds a plain stand-in for its
 * connector until wagmi finishes reconnecting, while already reading as
 * connected. Signing in that window failed with "connection.connector.
 * getChainId is not a function" — reported while answering the profile's
 * first question. Signing through the live connector works.
 */
test('signing during a reconnect works through the live connector, and fails without it', async () => {
  const account = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const config = createConfig({ chains: [bscTestnet], connectors: [mock({ accounts: [account] })], transports: { [bscTestnet.id]: http() } });
  const real = config.connectors[0];
  await connect(config, { connector: real });

  // Exactly what storage restores: the connector's identity, none of its methods.
  const standIn = { id: real.id, name: real.name, type: real.type, uid: real.uid };
  config.setState((s) => {
    const connections = new Map(s.connections);
    connections.set(s.current!, { ...s.connections.get(s.current!)!, connector: standIn as never });
    return { ...s, connections, status: 'reconnecting' };
  });

  await assert.rejects(signMessage(config, { message: 'hello' }), /getChainId is not a function/);
  const live = liveConnector(standIn, config.connectors);
  assert.equal(live, real);
  // signMessage's first step, and the one that failed: resolving the wallet client.
  const client = await getConnectorClient(config, { connector: live });
  assert.equal(client.account.address, account);
});

test('a connector is matched by uid first, then by id, and nothing is invented', () => {
  const connectors = [{ uid: 'a', id: 'injected' }, { uid: 'b', id: 'walletConnect' }];
  assert.equal(liveConnector({ uid: 'b', id: 'injected' }, connectors), connectors[1]);
  assert.equal(liveConnector({ uid: 'z', id: 'walletConnect' }, connectors), connectors[1]);
  assert.equal(liveConnector({ uid: 'z', id: 'other' }, connectors), undefined);
  assert.equal(liveConnector(undefined, connectors), undefined);
});
